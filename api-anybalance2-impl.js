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
        const request_id = '2_' + (++this.request_id);
        const fetchParams = DebuggerCommonApi.prepareDataForFetch(defaultMethod, url, data, json, headers, options, this.getUserAndPassword(url), request_id, this.m_options);
        const response = await fetch(url,{
            method: fetchParams.method,
            credentials: "include",
            mode: "cors",
            headers: fetchParams.headers,
            cache: "no-store",
            redirect: fetchParams.redirect,
            body: fetchParams.data
        })

        let params = await this.getLastParametersFromBg(request_id);
        const bodyBuf = await response.arrayBuffer();
        const serverResponse = DebuggerCommonApi.decodeResponseBody(params, fetchParams, bodyBuf, request_id);
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

            const data = await DebuggerCommonApi.callBackground({
                method: 'requestLocalhost',
                params: DebuggerCommonApi.makeRecaptchaRequestParams(options, comment)
            });

            const resp = DebuggerCommonApi.getJsonResponse(data);

            do{
                await this.rpcMethod_sleep(5000);
                let data = await DebuggerCommonApi.callBackground({method: 'requestLocalhost', params:[
                    DebuggerCommonApi.devToolsPort,
                    'captcha/result',
                    {
                        method: 'POST',
                        headers: {"Content-Type": "application/x-www-form-urlencoded"},
                        body: DebuggerCommonApi.serializeUrlEncoded({
                            handle: resp.handle
                        })
                    }]});

                const respResult = DebuggerCommonApi.getJsonResponse(data);

                if(respResult.result === 'TIMEOUT')
                    throw new Error("ReCaptcha timeout");
                if(respResult.result === 'CANCEL')
                    throw new Error("ReCaptcha cancelled");
                if(respResult.result !== 'IN_PROGRESS')
                    dataOut = respResult.result; //получили ответ на капчу
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