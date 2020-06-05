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

    addRequestHeaders(request, headers, options) {
        if (typeof(headers) === 'string')
            headers = JSON.parse(headers);
        headers = headers || {};
        let serviceHeaders = {};
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

        request.setRequestHeader('abd-data', JSON.stringify({headers: headers, options: options})); //Всегда посылаем такой данные в этом хедере, чтобы бэкграунд знал, что надо этот запрос обработать
    }

    getLastParameters(xhr) {
        let headers = DebuggerCommonApi.parseHeaders(xhr.getAllResponseHeaders());
        let dataHeader = headers.find(h => h[0] === 'ab-data-return');
        let data = JSON.parse(dataHeader[1]);
        headers = headers.filter(h => h[0] !== 'ab-data-return');

        return {
            headers: headers,
            status: 'HTTP/1.1 ' + xhr.status + ' ' + xhr.statusText,
            url: data.url
        }
    }


    async request(defaultMethod, url, data, json, headers, options) {
        const request_id = ++this.request_id;
        let auth = this.getUserAndPassword(url);
        let xhr = new XMLHttpRequest();

        if(typeof(options) === 'string')
            options = JSON.parse(options);
        options = options || {};

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

        DebuggerCommonApi.trace(method + "(id:" + request_id + ") to " + url + (isset(data) ? " with data: " + (typeof data === 'string' ? data : JSON.stringify(data)) : ''));
        xhr.open(method, url, true, auth.user, auth.password);

        if (isset(data)) {
            let input_charset = abd_getOption(local_options, OPTION_REQUEST_CHARSET, domain) || defCharset;

            if (json) {
                let dataObj = data;
                if(typeof data === 'string')
                    dataObj = JSON.parse(data);

                xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
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

        xhr = await this.xhr_send(xhr, headers, local_options, data);

        let params = this.getLastParameters(xhr);

        let serverResponse = xhr.responseText;

        let responseType = xhr.getResponseHeader("Content-Type");
        if (/image\//i.test(responseType) || charset == 'base64') {
            //Картинки преобразовываем в base64
            serverResponse = DebuggerCommonApi.base64EncodeBytes(serverResponse);
        }

        console.log(method + " result (" + xhr.status + "): " + serverResponse.substr(0, 255));
        let id = 'shh' + new Date().getTime();
        DebuggerCommonApi.html_output(method + "(id:" + request_id + ") result (" + xhr.status + "): " + '<a id="' + id + '" href="#">show/hide</a><div class="expandable"></div>');
        $('#' + id).on('click', function(e){return DebuggerCommonApi.toggleHtml(e, serverResponse)});
        params.body = serverResponse;
        return {payload: params}
    }

    async xhr_send(xhr, headers, options, data) {
        return new Promise((resolve, reject) => {
            this.addRequestHeaders(xhr, headers, options);
            xhr.send(data);
            xhr.onload = () => {
                // Запрос завершен. Здесь можно обрабатывать результат.
                resolve(xhr);
            };
            xhr.onerror = () => {
                reject(new Error("Request error!"));
            };
            xhr.onabort = () => {
                reject(new Error("Request aborted"));
            };
            xhr.timeout = () => {
                reject(new Error("Request timeout"));
            }
        });
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

    async rpcMethod_retrieveCode(comment, image, options) {
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

        if(!options || !options.type || options.type !== 'recaptcha2'){
            $('#AnyBalanceDebuggerPopup').html(comment.replace(/</g, '&lt;').replace(/&/g, '&amp;') + '<p><img src="data:image/png;base64,' + image + '" style="max-width:100%">').show();

            await this.rpcMethod_sleep(10);

            let dlgReturnValue = prompt(comment, "");
            $('#AnyBalanceDebuggerPopup').hide();

            if (!dlgReturnValue)
                throw new Error('User has cancelled entering the code!');

            return {payload: dlgReturnValue};
        }else if(options.type === 'recaptcha2'){
            //Для распознавания рекапчи обращаемся на localhost:1500 к программке AnyBalance Recaptcha.
            //Должна быть установлена и запущена локально

            let dataOut = null;

            let data = await DebuggerCommonApi.callBackground({method: 'requestLocalhostSync', params:[
                    1500,
                    'recaptcha',
                    {
                        method: 'POST',
                        headers: {"Content-Type": "application/x-www-form-urlencoded"},
                        body: serializeUrlEncoded({
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
                let data = await DebuggerCommonApi.callBackground({method: 'requestLocalhostSync', params:[1500, 'result']});
                if(data === 'TIMEOUT')
                    throw new Error("ReCaptcha timeout");
                if(data !== 'IN_PROGRESS')
                    dataOut = data; //получили ответ на капчу
            }while(!dataOut);

            return {payload: dataOut};
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