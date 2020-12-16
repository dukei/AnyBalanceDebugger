class AnyBalanceDebuggerApi2{
    DEFAULT_CHARSET = 'utf-8';
    global_config;
    m_credentials = {};
    m_options = {};
    request_id = 0;

    constructor(global_config){
        this.global_config = global_config;
    }

    getUserAndPassword(url) {
        return {user: this.m_credentials.user, password: this.m_credentials.password};
    }

    getPackedHeaders(headers, options, serviceHeaders, data) {
        serviceHeaders = serviceHeaders || {};
        if (this.m_credentials.user) {
            let aname = "Authorization";
            let idx = abd_getHeaderIndex(headers, aname);
            if (!isset(idx)) {
                //Авторизация требуется, значит, надо поставить и заголовок авторизации, раз он ещё не передан
                let value = "Basic " + DebuggerCommonApi.base64EncodeUtf8(this.m_credentials.user + ':' + this.m_credentials.password);
                serviceHeaders[aname] = value;
            }
        }

        for (let h in serviceHeaders) {
            if (isArray(headers))
                headers.push([h, serviceHeaders[h]]);
            else
                headers[h] = serviceHeaders[h];
        }

        return JSON.stringify({headers: headers, options: options, data: data}); //Всегда посылаем такой данные в этом хедере, чтобы бэкграунд знал, что надо этот запрос обработать
    }

    parseHeaders(headers){
        let hs = [];
        for(let h of headers.entries())
            hs.push(h);
        return hs;
    }

    async getLastParameters(response) {
        let headers = this.parseHeaders(response.headers);

        return {
            headers: headers,
            status: 'HTTP/1.1 ' + response.status + ' ' + response.statusText,
            url: response.url
        }
    }

    async getLastParametersFromBg(request_id) {
        const info = await DebuggerCommonApi.callBackground({method: 'getRequestResults', params: [request_id]});
        if(!info)
            throw new Error("Requests result not found for request_id " + request_id);

        return {
            headers: info.headers.map(h => [h.name, h.value]),
            status: info.status,
            url: info.url
        }
    }


    async request(defaultMethod, url, data, json, headers, options) {
        const request_id = ++this.request_id;
        let auth = this.getUserAndPassword(url);

        if(typeof(options) === 'string')
            options = JSON.parse(options);
        options = options || {};

        if (typeof(headers) === 'string')
            headers = JSON.parse(headers);
        headers = headers || {};

        let local_options = options.options ? DebuggerCommonApi.joinOptionsToNew(this.m_options, options.options) : this.m_options;

        let domain = /:\/\/([^\/]+)/.exec(url);
        if(domain)
            domain = domain[1];
        if (!domain)
            throw {name: "Wrong url", message: "Malformed url for request: " + url};
        if(data === null)
            data = undefined;

        let method = options.httpMethod || abd_getOption(local_options, OPTION_HTTP_METHOD, domain) || defaultMethod;
        let defCharset = abd_getOption(local_options, OPTION_DEFAULT_CHARSET, domain) || this.DEFAULT_CHARSET;
        let charset = abd_getOption(local_options, OPTION_FORCE_CHARSET, domain) || defCharset;
        const redirect = abd_getOption(local_options, OPTION_MANUAL_REDIRECTS, domain);

        DebuggerCommonApi.trace(method + "(id:" + request_id + ") to " + url + (isset(data) ? " with data: " + (typeof data === 'string' ? data : JSON.stringify(data)) : ''));
        const preliminary_headers = {};
        const serviceHeaders = {};

        if (isset(data)) {
            let input_charset = abd_getOption(local_options, OPTION_REQUEST_CHARSET, domain) || defCharset;

            if(auth.user)
                preliminary_headers.Authorization = 'Basic ' + btoa(auth.user + ':' + auth.password)

            if (json) {
                let dataObj = data;
                if(typeof data === 'string')
                    dataObj = JSON.parse(data);

                preliminary_headers["Content-Type"] = 'application/x-www-form-urlencoded';
                if(abd_getHeaderIndex(headers, 'content-type') === undefined)
                    serviceHeaders["Content-Type"] = preliminary_headers["Content-Type"];

                let _data = [];
                if (isArray(dataObj)) {
                    for (let i = 0; i < dataObj.length; ++i) {
                        _data.push(DebuggerCommonApi.encodeURIComponentToCharset(dataObj[i][0], input_charset) + '=' + DebuggerCommonApi.encodeURIComponentToCharset(dataObj[i][1], input_charset));
                    }
                } else {
                    for (let key in dataObj) {
                        _data.push(DebuggerCommonApi.encodeURIComponentToCharset(key, input_charset) + '=' + DebuggerCommonApi.encodeURIComponentToCharset(dataObj[key], input_charset));
                    }
                }
                data = _data.join('&');
            } else if (input_charset == 'base64') {
                data = base64DecToArr(data);
            }
        }

        preliminary_headers['abd-data'] = this.getPackedHeaders(headers, local_options, serviceHeaders, {request_id: request_id});
        const response = await fetch(url,{
            method: method,
            credentials: "include",
            mode: "cors",
            headers: preliminary_headers,
            cache: "no-cache",
            redirect: redirect ? 'manual' : 'follow',
            body: data
        })

        let params = await this.getLastParametersFromBg(request_id);

        let responseType = response.headers.get("content-type");
        let serverResponse;
        if (/image\//i.test(responseType) || charset == 'base64') {
            let serverResponseBytes = await response.arrayBuffer();
            //Картинки преобразовываем в base64
            serverResponse = DebuggerCommonApi.base64ArrayBuffer(serverResponseBytes);
        }else{
            serverResponse = await response.text();
        }

        console.log(method + " result (" + response.status + "): " + serverResponse.substr(0, 255));
        let id = 'shh' + new Date().getTime();
        DebuggerCommonApi.html_output(method + "(id:" + request_id + ") result (" + response.status + "): " + '<a id="' + id + '" href="#">show/hide</a><div class="expandable"></div>');
        $('#' + id).on('click', function(e){return DebuggerCommonApi.toggleHtml(e, serverResponse, responseType)});
        params.body = serverResponse;
        return {payload: params}
    }

    async rpcMethod_requestPost(url, data, json, headers, options) {
        return this.request('POST', url, data, json, headers, options);
    }

    async rpcMethod_getLevel() {
        return {payload: 1};
    }

    async rpcMethod_setAuthentication(name, pass, authParams) {
        this.m_credentials = {user: name, password: pass};
        return {payload: undefined};
    }

    async rpcMethod_clearAuthentication() {
        this.m_credentials = {};
        return {payload: undefined};
    }

    async rpcMethod_setCookie(domain, name, val, params) {
        if (val && typeof(val) !== 'string')
            throw new Error('Trying to set cookie ' + name + ' to an object: ' + JSON.stringify(val));

        if(typeof(params) === 'string')
            params = JSON.parse(params);

        await DebuggerCommonApi.callBackground({method: 'setCookie', params: [domain, name, val, params]});
        return {payload: undefined};

    }

    async rpcMethod_getCookies() {
        let result = await DebuggerCommonApi.callBackground({method: 'getCookies'});
        return {payload: result};

    }

    async rpcMethod_setOptions(options) {
        if(typeof options === 'string')
            options = JSON.parse(options);

        DebuggerCommonApi.joinOptions(this.m_options, options);
        return {payload: undefined};
    }

    async rpcMethod_sleep(ms) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {resolve({payload: undefined})}, ms);
        });
    }

    static lastRetrieveCodePromise = null;
    async rpcMethod_retrieveCode(options) {
        while(AnyBalanceDebuggerApi2.lastRetrieveCodePromise) {
            try {
                await AnyBalanceDebuggerApi2.lastRetrieveCodePromise;
            }catch(e){
                console.error("Waiting previous retrieve", e);
            }
        }
        try {
            AnyBalanceDebuggerApi2.lastRetrieveCodePromise = this.local_retrieveCode(options);
            return await AnyBalanceDebuggerApi2.lastRetrieveCodePromise;
        }finally {
            AnyBalanceDebuggerApi2.lastRetrieveCodePromise = null;
        }
    }

    async local_retrieveCode(options) {
        if ($('#AnyBalanceDebuggerPopup').size() === 0) {
            $('<div/>', {
                id: 'AnyBalanceDebuggerPopup'
            }).css({
                left: "30%",
                top: "20%",
                width: "40%",
                height: "40%",
                position: "fixed",
                display: "none",
                border: "1px solid brown",
                background: "white",
                padding: "10px"
            }).appendTo('body');
        }

        if(typeof options === 'string')
            options = JSON.parse(options);

        const comment = options.prompt || '<no prompt>';
        const image = options.image;

        if(!options || !options.type || options.type !== 'RECAPTCHA'){
            let ts = +new Date();
            let html = comment.replace(/</g, '&lt;').replace(/&/g, '&amp;');
            if(image)
                html += '<p><img src="data:image/png;base64,' + image + '" style="max-width:100%">';
            html += '<br><small><pre id="json-viewer-' + ts + '" style="margin-left:10px"></pre>';
            $('#AnyBalanceDebuggerPopup').html(html).show();
            $('#json-viewer-' + ts).jsonViewer(options);

            await this.rpcMethod_sleep(300);

            let dlgReturnValue = prompt(comment, "");
            $('#AnyBalanceDebuggerPopup').hide();

            if (!dlgReturnValue)
                throw new Error('User has cancelled entering the code!');

            return {payload: dlgReturnValue};
        }else if(options.type === 'RECAPTCHA'){
            //Для распознавания рекапчи обращаемся на localhost:1500 к программке AnyBalance Recaptcha.
            //Должна быть установлена и запущена локально

            let dataOut = null;

            let data = await DebuggerCommonApi.callBackground({method: 'requestLocalhost', params:[
                    1500,
                    'recaptcha',
                    {
                        method: 'POST',
                        headers: {"Content-Type": "application/x-www-form-urlencoded"},
                        body: DebuggerCommonApi.serializeUrlEncoded({
                            URL: options.url,
                            SITEKEY: options.sitekey,
                            USERAGENT: options.userAgent,
                            TEXT: comment,
                            TIMELIMIT: options.time
                        })
                    }]
            });

            if(data !== 'OK')
                throw new Error(data);

            do{
                await this.rpcMethod_sleep(5000);
                let data = await DebuggerCommonApi.callBackground({method: 'requestLocalhost', params:[1500, 'result']});
                if(data === 'TIMEOUT')
                    throw new Error("ReCaptcha timeout");
                if(data !== 'IN_PROGRESS')
                    dataOut = data; //получили ответ на капчу
            }while(!dataOut);

            return {payload: dataOut};
        }else{
            throw new Error('Unknown code type: ' + options.type);
        }
    }

    async rpcMethod_getCapabilities() {
        return {payload: {}};
    }

    async rpcMethod_loadData() {
        let data = localStorage.getItem('abd_stored_data');
        return {payload: isset(data) && data !== null ? data : ""};
    }

    async rpcMethod_saveData(data) {
        localStorage.setItem('abd_stored_data', data);
        return {payload: {}};
    }

    async rpcMethod_trace(msg, callee) {
        await DebuggerCommonApi.trace(msg, callee);
        return Promise.resolve({payload: undefined});
    }
}