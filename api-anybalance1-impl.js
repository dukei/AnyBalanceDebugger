function AnyBalanceDebuggerApi1(g_global_config) {
    const API_LEVEL = 9;

    function api_trace(msg, callee) {
        return DebuggerCommonApi.trace(msg, callee);
    }

    function html_output(msg, callee) {
        return DebuggerCommonApi.html_output(msg, callee);
    }

    /*
     function xor_str(str, key)
     {
     var key_len = key.length;
     var encoded = '';
     for(var i=0; i<str.length; ++i){
     encoded += String.fromCharCode(key.charCodeAt(i%key_len)^str.charCodeAt(i));
     }
     return encoded;
     }
     */
    let m_lastError = '';
    let m_credentials = {};
    let m_options = {};
    let m_lastStatus; //Последний полученный статус
    let m_lastHeaders; //Последние полученные заголовки

    function getUserAndPassword(url) {
        return {user: m_credentials.user, password: m_credentials.password};
    }

    function base64EncodeUtf8(str) {
        return DebuggerCommonApi.base64EncodeUtf8(str);
    }

    function base64EncodeBytes(str) {
        return DebuggerCommonApi.base64EncodeBytes(str);
    }

    function addRequestHeaders(request, headers, options) {
        if (headers)
            headers = JSON.parse(headers);
        headers = headers || {};
        let serviceHeaders = {};
        if (m_credentials.user) {
            let aname = "Authorization";
            let idx = abd_getHeaderIndex(headers, aname);
            if (!isset(idx)) {
                //Авторизация требуется, значит, надо поставить и заголовок авторизации, раз он ещё не передан
                let value = "Basic " + base64EncodeUtf8(m_credentials.user + ':' + m_credentials.password);
                serviceHeaders[aname] = value;
            }
        }

        if (g_global_config['abd-replace-3xx'])
            serviceHeaders['abd-replace-3xx'] = 'true';

        for (let h in serviceHeaders) {
            if (isArray(headers))
                headers.push([h, serviceHeaders[h]]);
            else
                headers[h] = serviceHeaders[h];
        }

        request.setRequestHeader('abd-data', JSON.stringify({headers: headers, options: options})); //Всегда посылаем такой данные в этом хедере, чтобы бэкграунд знал, что надо этот запрос обработать
    }

    function callBackground(rpccall) {
        let json = JSON.stringify(rpccall);
        let encoded = encodeURIComponent(json);

        let xhr = new XMLHttpRequest();
        xhr.open("GET", "http://www.gstatic.com/inputtools/images/tia.png?abrnd&data=" + encoded, false);
        xhr.send();

        let data = xhr.getResponseHeader('ab-data');
        if (!data) {
            console.log("Error receiving header from background!");
            return '';
        }

        json = JSON.parse(data);
        if(json.error)
            throw json.error;

        return json.result;
    }

    function sleep(milliseconds) {
        let start = new Date().getTime();
        while (new Date().getTime() < start + milliseconds);
        return true;
    }

    function saveLastParameters(xhr) {
        m_lastStatus = 'HTTP/1.1 ' + xhr.status + ' ' + xhr.statusText;
        m_lastHeaders = xhr.getAllResponseHeaders();
    }

    function wait4Result(milliseconds) {
        let result, start = new Date().getTime();
        if (!milliseconds) milliseconds = 5000;
        do {
            if (new Date().getTime() - start >= milliseconds)
                break;
            sleep(500);
            result = callBackground({method: 'getOpResult'});
        } while (!isset(result));
        if (!isset(result))
            m_lastError = "Timeout " + milliseconds + "ms has been exeeded waiting for result";
        else if (result.error)
            m_lastError = result.error;
        return result && result.result;
    }

    function xhr_resendIfNecessary(xhr, headers, options, data) {
        while (true) {
            addRequestHeaders(xhr, headers, options);
            xhr.send(data);
            if ([701, 702, 703, 707].indexOf(xhr.status) >= 0) {
                //Запрос на редирект из фидлера
                let location = xhr.getResponseHeader('Location');
                api_trace("Redirecting to (" + xhr.status + ') ' + location);
                xhr = new XMLHttpRequest();
                let auth = getUserAndPassword(location);
                xhr.open("GET", location, false, auth.user, auth.password);
                xhr.withCredentials = true;
                data = undefined;
                continue;
            }
            break;
        }
        return xhr;
    }

    function toggleHtml(e, text){
        return DebuggerCommonApi.toggleHtml(e, text);
    }

    //http://stackoverflow.com/questions/985272/selecting-text-in-an-element-akin-to-highlighting-with-your-mouse
    function SelectText(element) {
        let doc = document
            , text = doc.getElementById(element)
            , range, selection;
        if (doc.body.createTextRange) {
            range = document.body.createTextRange();
            range.moveToElementText(text);
            range.select();
        } else if (window.getSelection) {
            selection = window.getSelection();
            range = document.createRange();
            range.selectNodeContents(text);
            selection.removeAllRanges();
            selection.addRange(range);
        }
    }

    function request(defaultMethod, url, data, json, headers, options) {
        let method = defaultMethod;
        try {
            let auth = getUserAndPassword(url);
            let xhr = new XMLHttpRequest();

            options = options ? JSON.parse(options) : {};
            let local_options = options.options ? DebuggerCommonApi.joinOptionsToNew(m_options, options.options) : m_options;

            let domain = /:\/\/([^\/]+)/.exec(url);
            if(domain)
                domain = domain[1];
            if (!domain)
                throw {name: "Wrong url", message: "Malformed url for request: " + url};

            method = options.httpMethod || abd_getOption(local_options, OPTION_HTTP_METHOD, domain) || defaultMethod;
            let defCharset = abd_getOption(local_options, OPTION_DEFAULT_CHARSET, domain) || DEFAULT_CHARSET;
            let charset = abd_getOption(local_options, OPTION_FORCE_CHARSET, domain) || defCharset;

            api_trace(method + " to " + url + (isset(data) ? " with data: " + data : ''));
            xhr.open(method, url, false, auth.user, auth.password);

            if (isset(data)) {
                let input_charset = abd_getOption(local_options, OPTION_REQUEST_CHARSET, domain) || defCharset;

                if (json) {
                    let dataObj = JSON.parse(data);
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

            xhr = xhr_resendIfNecessary(xhr, headers, local_options, data);
            //if(!(200 <= xhr.status && xhr.status < 400))   //Necessary to get body for all codes
            //	throw {name: "HTTPError", message: "Posting " + url + " failed: status " + xhr.status};
            saveLastParameters(xhr);
            let serverResponse = xhr.responseText;

            let responseType = xhr.getResponseHeader("Content-Type");
            if (/image\//i.test(responseType) || charset == 'base64') {
                //Картинки преобразовываем в base64
                serverResponse = base64EncodeBytes(serverResponse);
            }

            console.log(method + " result (" + xhr.status + "): " + serverResponse.substr(0, 255));
            let id = 'shh' + new Date().getTime();
            html_output(method + " result (" + xhr.status + "): " + '<a id="' + id + '" href="#">show/hide</a><div class="expandable"></div>');
            $('#' + id).on('click', function(e){return toggleHtml(e, serverResponse)});
            return serverResponse;
        } catch (e) {
            m_lastError = '' + e.name + ': ' + e.message;
            api_trace("Error in " + method + ": " + m_lastError + "\nStack: " + e.stack);
            return null;
        }
    }

    function serializeUrlEncoded(obj) {
        return DebuggerCommonApi.serializeUrlEncoded(obj);
    }

    return {
        rpcMethod_getLastError: function () {
            return m_lastError;
        },

        rpcMethod_getLevel: function () {
            return API_LEVEL;
        },

        rpcMethod_trace: api_trace,

        rpcMethod_requestGet: function (url, headers, options) {
            return request("GET", url, undefined, false, headers, options);
        },

        rpcMethod_requestPost: function (url, data, json, headers, options) {
            return request("POST", url, data, json, headers, options);
        },

        rpcMethod_setAuthentication: function (name, pass, authScope) {
            m_credentials = {user: name, password: pass};
            return true;
        },

        rpcMethod_clearAuthentication: function () {
            m_credentials = {};
            return true;
        },

        rpcMethod_onInitialLoad: function (accid) {
            return true;
        },

        rpcMethod_setResult: function (accid, data) {
            //Not called. The one that is called is setResult_placeholder in api-adapter.js
            return true;
        },

        rpcMethod_setOptions: function (options) {
            options = JSON.parse(options);
            for (let opt in options) {
                if (options[opt] == null)
                    m_options[opt] = undefined;
                else
                    m_options[opt] = options[opt];
            }
            return true;
        },

        rpcMethod_sleep: sleep,

        rpcMethod_getLastResponseParameters: function () {
            if (!m_lastStatus) {
                m_lastError = 'Previous request has not been made or it has failed';
                return null;
            }
            let url = callBackground({method: 'getLastUrl'});
            let headers = [];
            let strHeaders = m_lastHeaders.split(/\r?\n/);
            for (let i = 0; i < strHeaders.length; ++i) {
                let header = strHeaders[i];
                if (!header) continue;
                let idx = header.indexOf(':');
                let name = header.substr(0, idx);
                let value = header.substr(idx + 1).replace(/^\s+/, '');
                headers[headers.length] = [name, value];
            }
            return JSON.stringify({url: url, status: m_lastStatus, headers: headers});
        },

        rpcMethod_getCapabilities: function () {
            return JSON.stringify({
                captcha: true,
                recaptcha2: true,
                preferences: false,
                async: false,
                persistence: true,
                requestOptions: true,
                requestCharset: true
            });
        },

        rpcMethod_setCookie: function (domain, name, val, params) {
            if (val && typeof(val) !== 'string')
                throw {
                    name: 'setCookie',
                    message: 'Trying to set cookie ' + name + 'to an object: ' + JSON.stringify(val)
                };
            params = params ? JSON.parse(params) : undefined;
            callBackground({method: 'setCookie', params: [domain, name, val, params]});
            let result = wait4Result();
            return result;
        },

        rpcMethod_getCookies: function () {
            callBackground({method: 'getCookies'});
            let result = wait4Result();
            return result ? JSON.stringify(result) : null;
        },

        rpcMethod_retrieveCode: function (comment, image, options) {
            try {
                let dlgReturnValue;

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

                if(options)
                    options = JSON.parse(options);
                if(!options || !options.type || options.type !== 'recaptcha2'){
                    $('#AnyBalanceDebuggerPopup').html(comment.replace(/</g, '&lt;').replace(/&/g, '&amp;') + '<p><img src="data:image/png;base64,' + image + '"><p><small>Если вы не видите картинку здесь, посмотрите её в консоли</small>').show();

                    //Начиная с какой-то версии хрома картинки не грузятся, пока скрипт не освободится. Так что выведем картинку в консоль
                    console.log(comment);
                    console.log('%c ', 'padding: 100px 100px; line-height: 100px; background-repeat: no-repeat; background-position: left center; background-size: contain; background-image: url(data:image/png;base64,' + image + ')')

                    //Just continue here (F8, . This breakpoint is necessary to update DOM state
                    debugger; //According to https://bugs.chromium.org/p/chromium/issues/detail?id=639150

                    dlgReturnValue = prompt(comment, "");
                    $('#AnyBalanceDebuggerPopup').hide();

                    if (!dlgReturnValue)
                        throw {name: 'retrieveCode', message: 'User has cancelled entering the code!'};

                    return dlgReturnValue;
                }else if(options.type === 'recaptcha2'){
                    //Для распознавания рекапчи обращаемся на localhost:1500 к программке AnyBalance Recaptcha.
                    //Должна быть установлена и запущена локально

                    let dataOut = null;

                    callBackground({method: 'requestLocalhostSync', params:[
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
                    let data = wait4Result(30000);

                    if(data !== 'OK')
                        throw {name: 'retrieveCode', message: data || m_lastError};

                    do{
                        sleep(5000);
                        callBackground({method: 'requestLocalhostSync', params:[1500, 'result']});
                        let data = wait4Result();
                        if(data === 'TIMEOUT')
                            throw {name: 'retrieveCode', message: "Captcha timeout"};
                        if(data !== 'IN_PROGRESS')
                            dataOut = data; //получили ответ на капчу
                    }while(!dataOut);
                    return dataOut;
                }
            } catch (e) {
                m_lastError = '' + e.name + ': ' + e.message;
                api_trace("Error in retrieve: " + m_lastError);
                return null;
            }
        },

        rpcMethod_saveData: function (data) {
            localStorage.setItem('abd_stored_data', data);
            return true;
        },

        rpcMethod_loadData: function () {
            let data = localStorage.getItem('abd_stored_data');
            return isset(data) && data !== null ? data : "";
        },

    };
}
