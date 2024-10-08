// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Simple extension to replace lolcat images from
// http://icanhascheezburger.com/ with loldog images instead.

var g_abd_Backends = {};
var g_requestData = {};
var g_clientRequestData = {};
var c_requestBase = "http://www.gstatic.com/inputtools/images/tia.png?abrnd";

function ABDBackend(tabId) {
    var m_tabId = tabId;
    var m_opResult; //Результат последней асинхронной операции
    var m_config; //Глобальный конфиг дебаггера
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

     function generateKey(){
     var str = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*()_+-=';
     var key = '';
     for(var i=0; i<16; ++i){
     key += str.charAt(Math.floor(Math.random()*str.length));
     }
     return key;
     }
     */
    function getTabId() {
        return m_tabId;
    }

    async function setCookie(domain, name, val, params) {
        m_opResult = undefined;

        if (!params)
            params = {};

        var path = params.path;
        if (!path) path = '/';
        if (!/^\//.test(path))
            path = '/' + path;

        let csid = await getCurrentCookieStoreId();

        return new Promise((resolve, reject) => {
            function onCookieSet(cookie) {
                if (cookie == null) {
                    m_opResult = {error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Unknown error setting cookie!'};
                } else {
                    m_opResult = {result: true}
                }
                resolve(m_opResult);
            }

            function onCookieRemoved(info) {
                if (info == null) {
                    m_opResult = {error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || 'Unknown error removing cookie!'};
                } else {
                    m_opResult = {result: true}
                }
                resolve(m_opResult);
            }

            if (val === null || val === undefined || val === '') {
                chrome.cookies.remove({
                    url: 'https://' + domain.replace(/^\./,'') + path, //Путь надо правильный указать, иначе не удаляется
                    name: name,
                    storeId: csid
                }, onCookieRemoved);
            } else {
                chrome.cookies.set({
                    url: 'https://' + domain.replace(/^\./,'') + path,
                    name: name,
                    value: val,
                    domain: params.domain || domain,
                    path: path,
                    secure: params.secure,
                    expirationDate: params.expire && Math.round(new Date(params.expire).getTime() / 1000),
                    storeId: csid
                }, onCookieSet);
            }
        });
    }

    async function executeScript(script){
        let promise = new Promise((resolve, reject) => {
            chrome.tabs.executeScript(getTabId(), {code: script}, (arr) => {
                resolve(arr);
            });
        });
        return {result: await promise};
    }

    async function getCookies() {
        m_opResult = undefined;
        return new Promise(async (resolve, reject) => {
            function onCookiesGetAll(cookies) {
                var mycookies = [];
                for (var i = 0; i < cookies.length; ++i) {
                    var cookie = cookies[i];
                    var mycookie = {
                        name: cookie.name,
                        value: cookie.value,
                        domain: cookie.domain,
                        path: cookie.path,
                        expires: cookie.expirationDate && (new Date(cookie.expirationDate * 1000).toGMTString()),
                        persistent: !cookie.session
                    };
                    mycookies.push(mycookie);
                }
                m_opResult = {result: mycookies};
                resolve(m_opResult);
            }

            let csid = await getCurrentCookieStoreId();
            chrome.cookies.getAll({storeId: csid}, onCookiesGetAll);
        });
    }

    async function getCurrentCookieStoreId(){
        return new Promise((resolve, reject) => {
            chrome.cookies.getAllCookieStores(function(css){
                for(let cs of css){
                    if(cs.tabIds.indexOf(m_tabId) >= 0){
                        resolve(cs.id);
                        return;
                    }
                }
                reject(new Error("Can not find cookie store id for tab: " + m_tabId));
            });
        });
    }

    async function clearAllCookies(){
        m_opResult = undefined;
        return new Promise(async (resolve, reject) => {
            function onCookiesGetAllForCleaning(cookies) {
                let cookiesToRemove = {};

                function checkAllCookiesCleared(){
                    for(let id in cookiesToRemove){
                        if(!cookiesToRemove[id])
                            return;
                    }
                    m_opResult = {result: cookies.length};
                    resolve(m_opResult);
                }

                for (let i = 0; i < cookies.length; ++i) {
                    let cookie = cookies[i];
                    let id = 'c' + i;
                    cookiesToRemove[id] = false;
                    let url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;

                    (function(cookie, id){
                        chrome.cookies.remove({url: url, name: cookie.name, storeId: cookie.storeId}, function(details){
                            cookiesToRemove[id] = true;
                            checkAllCookiesCleared();
                        });
                    })(cookie, id);
                }

                checkAllCookiesCleared();
            }

            let csid = await getCurrentCookieStoreId();

            console.log('Cleaning cookies for store ' + csid);
            chrome.cookies.getAll({storeId: csid}, onCookiesGetAllForCleaning);
        });
    }

    function getOpResult() {
        return {result: m_opResult};
    }

    async function requestLocalhostSync(port, path, params){
        m_opResult = undefined;
        m_opResult = await requestLocalhostAsync(port, path, params);
        return m_opResult;
    }

    async function requestLocalhostAsync(port, path, params){
        try {
            return {result: await (await fetch('http://localhost:' + port + '/' + path, params)).text()};
        }catch(e){
            return {error: e.message || "Error requesting localhost:" + port + '/' + path};
        }
    }

    function onCreate() {
        //attachDebugger();
    }

    function attachDebugger(){
        const target = {
            tabId: getTabId()
        };

        chrome.debugger.attach(target, '1.2', () => {
            const {lastError} = chrome.runtime;
            if (lastError) {
                console.warn("Error attaching debugger!", lastError);
            }
            else {
                console.log("Enabling chrome debugger fetch");
                chrome.debugger.sendCommand(target, 'Fetch.enable', {
                    patterns: [{
                        requestStage: 'Request'
                    }]
                });
                chrome.debugger.onEvent.addListener(onDebugRequest);
            }
        });
    }

    async function onDebugRequest(source, method, params) {
        if (method === 'Fetch.requestPaused') {
            console.log("Debugger request: ", source, method, params)
            const opts = {
                requestId: params.requestId
            };

            const request = params.request;
            if(request.method === 'OPTIONS' && request.headers["Access-Control-Request-Headers"] === "abd-data"){
                opts.responseCode = 204;
                opts.responseHeaders = [
                    {name: 'Content-Length', value: '0'},
                    {name: 'Access-Control-Allow-Origin', value: 'null'},
                    {name: 'Access-Control-Allow-Credentials', value: 'true'},
                    {name: 'Access-Control-Allow-Headers', value: 'abd-data'},

                ];
                if(request.headers["Access-Control-Request-Method"])
                    opts.responseHeaders.push({name: 'Access-Control-Allow-Methods', value: request.headers["Access-Control-Request-Method"]})
                opts.body = "";
                opts.responsePhrase = "OK";

                chrome.debugger.sendCommand({
                    tabId: source.tabId
                }, 'Fetch.fulfillRequest', opts, result => {console.log("Fulfill request result: ", result) });
            }else {
                chrome.debugger.sendCommand({
                    tabId: source.tabId
                }, 'Fetch.continueRequest', opts);
            }
        }
    }

    function clean() {
        m_opResult = null;
    }

    function getRequestResults(client_request_id) {
        const data = g_clientRequestData[client_request_id];
        return {result: data && data.results};
    }

    return {
        getTabId: getTabId,
        clean: clean,
        onCreate: onCreate,

        rpcMethod_initialize: async function (config) {
            m_config = config;
            return {result: getTabId()};
        },

        rpcMethod_getCookies: getCookies,
        rpcMethod_sync_getCookies: getCookies,
        rpcMethod_setCookie: setCookie,
        rpcMethod_sync_setCookie: setCookie,
        rpcMethod_sync_getOpResult: getOpResult,

        dummy: function () {
            console.log('dummy');
        },

        rpcMethod_clearAllCookies: clearAllCookies,
        rpcMethod_sync_clearAllCookies: clearAllCookies,

        rpcMethod_requestLocalhost: requestLocalhostAsync,
        rpcMethod_sync_requestLocalhost: requestLocalhostSync,
        rpcMethod_executeScript: executeScript,
        rpcMethod_getRequestResults: getRequestResults,
        rpcMethod_sync_getRequestResults: getRequestResults,
    };
};

function abd_getBackend(tabId, create) {
    var backend = g_abd_Backends[tabId];
    if (create) {
        if(backend) {
            backend.clean();
        }else {
            backend = g_abd_Backends[tabId] = ABDBackend(tabId);
            backend.onCreate();
        }
    }
    return backend;
}

//Отслеживание синхронных вызовов бэкенда
chrome.webRequest.onBeforeRequest.addListener(function (info) {
        var dataidx = info.url.indexOf('&data=');
        if (dataidx < 0) {
            if (!g_requestData[info.requestId])
                console.log("No data for background call: " + info.url);
            return;
        }

        var json = JSON.parse(decodeURIComponent(info.url.substr(dataidx + 6)));
        g_requestData[info.requestId] = {data: json, type: 'service', time: new Date().getTime()};
        return {redirectUrl: c_requestBase}
    },
    // filters
    {
        urls: [
            c_requestBase + "*"
        ]
    },
    // extraInfoSpec
    ["blocking"]
);

//Отслеживание обычных запросов нашего таба
chrome.webRequest.onBeforeRequest.addListener(function (info) {
        console.log('Before request: ' + info.requestId, info.url);

        if (info.url.slice(0, c_requestBase.length) == c_requestBase)
            return; //Это служебный запрос, не трогаем его

        var backend = abd_getBackend(info.tabId);
        if (!backend)
            return; //Это не нашего таба запросы, не трогаем их
    },
    // filters
    {
        urls: [
            "*://*/*"
        ]
    },
    // extraInfoSpec
    ["blocking"]
);

chrome.webRequest.onBeforeSendHeaders.addListener(
    function (info) {
        const old_headers = info.requestHeaders || [];
        let headers = abd_getHeader(old_headers, 'abd-data');

        if (headers) { //Обрабатываем запросы только с таким заголовком, чтобы не вмешаться случайно в чужой запрос!
            var removable_headers = {
                'abd-data': true,
                'accept-encoding': false, //false - то есть, удаляемый только если в передаваемых хедерах он есть
                'content-length': false,
                'host': false,
                'cookie': false
            };

            //console.log("onBeforeSendHeaders intercepted: " + JSON.stringify(info.url) + ', setting headers: ' + headers + ', were headers: ' + JSON.stringify(old_headers));
            var data = JSON.parse(headers);
            headers = data.headers;

            //Запомним опции перекодировки и прочие
            g_requestData[info.requestId] = {
                type: 'user',
                options: data.options,
                data: data.data,
                results: {
                    url: '',
                    headers: [],
                    status: ''
                },
                time: new Date().getTime()
            };
            if(data.data && data.data.request_id)
                g_clientRequestData[data.data.request_id] = g_requestData[info.requestId];

            var new_headers = [];

            //Уберем необязательные хедеры и те, которые переданы провайдером
            for (var i = 0; i < old_headers.length; ++i) {
                var h = old_headers[i];
                let name = h.name.toLowerCase();
                var newhi = abd_getHeaderIndex(headers, name);
                if (isset(newhi))
                    continue; //Этот хедер есть у нас, значит, удаляем отсюда
                else if (removable_headers[name] !== false)
                    continue; //Этот хедер мы не передали, но он необязательный
                if(name === 'accept-encoding')
                    h.value = 'gzip, deflate';
                new_headers.push(h);
            }

            //Передаём хедеры, явно переданные провайдером
            if (isArray(headers)) {
                //Передан как массив
                for (var i = 0; i < headers.length; ++i) {
                    if (!headers[i])
                        continue;
                    if (headers[i][1] == null)
                        continue;
                    new_headers.push({name: headers[i][0], value: headers[i][1]});
                }
            } else {
                //Передан как объект
                for (var name in headers) {
                    if (headers[name] == null)
                        continue;
                    new_headers.push({name: name, value: headers[name]});
                }
            }

            //console.log("onBeforeSendHeaders returning: " + JSON.stringify(info.url) + ', result headers: ' + JSON.stringify(new_headers));
            return {requestHeaders: new_headers};
        }

    },
    // filters
    {
        urls: ["<all_urls>"],
//        types: "main_frame sub_frame stylesheet script image font object xmlhttprequest other".split(" ")
    },
    // extraInfoSpec
    ["blocking", "requestHeaders", "extraHeaders"]
);

chrome.extension.onMessage.addListener(
    function (request, sender, sendResponse) {
    	(async function(){
            try{
                if (!sender.tab) {
                    console.log('Unknown message received, expected message from tab.');
                    return;
                }

                let backend = abd_getBackend(sender.tab.id, request.method == 'initialize');
                if(!backend)
                    backend = abd_getBackend(sender.tab.id, true);

                const func_name = 'rpcMethod_' + request.method;

                const func = backend[func_name];
                if(!func)
                    throw new Error("Background func not found: " + func_name);

                let result = await func.apply(backend, request.params);
                sendResponse(result);
            }catch(e){
                sendResponse({error: (e && e.message) || JSON.stringify(e)});
            }
        })();
        return true;
    }
);

chrome.webRequest.onHeadersReceived.addListener(
    function (info) {
        var data = g_requestData[info.requestId];
        console.log('Response headers received: ', info);
/*
        if(info.initiator === 'null' && info.method === 'OPTIONS'){
            info.responseHeaders.push(
                {name: 'Access-Control-Allow-Origin', value: 'null'},
                {name: 'Access-Control-Allow-Credentials', value: 'true'},
                {name: 'Access-Control-Allow-Headers', value: 'abd-data'}
            );
            return {responseHeaders: info.responseHeaders};
        }
*/
        if (!data) {
            return; //Это явно не наш запрос
        }

        //console.log("onHeadersReceived intercepted: " + info.url);
        cleanOldRequests();

        if (data.type == 'service') {
            m_opResult = undefined;
            //Служебный запрос для синхронного запроса бэкграунда
            var backend = abd_getBackend(info.tabId);
            var method = backend['rpcMethod_sync_' + data.data.method];
            if(!method) {
                var error = 'Sync method ' + data.data.method + ' not found!';
                console.error(error);
                m_opResult = {error: error};
                return {responseHeaders: [{name: 'ab-data', value: JSON.stringify(m_opResult)}]};
            }

            var result = method.apply(backend, data.data.params);
            return {responseHeaders: [{name: 'ab-data', value: JSON.stringify(result)}]};
        } else if (data.type == 'user') {
            //Ответ на запрос данных от провайдера
            //Похимичим с кодировкой ответа
            var headers = info.responseHeaders;

            //Сохраним данные, может, спросят
            data.results.headers = headers;
            data.results.url = info.url;
            data.results.status = info.statusLine;

            var i = abd_getHeaderIndex(headers, 'Content-Type');
            var domain = /:\/\/([^\/]+)/.exec(info.url)[1];
            var charset = abd_getOption(data.options, OPTION_FORCE_CHARSET, domain) || abd_getOption(data.options, OPTION_DEFAULT_CHARSET, domain) || DEFAULT_CHARSET;
            var newcharset = '; charset=' + charset;
            if (charset == 'base64' || isset(i)) {
                var header = headers[i];
                if (charset == 'base64' || /image\//i.test(header.value)) { //Для картинок не меняем, если только не требуется принудительное изменение кодировки
                    var forcedCharset = abd_getOption(data.options, OPTION_FORCE_CHARSET, domain);
                    if (forcedCharset == 'base64')
                        forcedCharset = 'x-user-defined';
                    newcharset = '; charset=' + (forcedCharset || 'x-user-defined') + `; (${header ? header.value : ''})`;
                }
                if (header) {
                    if (!/;\s*charset\s*=\s*[\w\-]+/i.test(header.value))
                        header.value += newcharset;
                    else if (abd_getOption(data.options, OPTION_FORCE_CHARSET, domain) || /image\//i.test(header.value)) //Если у нас картинка с кодировкой, то кодировку надо сбросить!
                        header.value = header.value.replace(/;\s*charset\s*=\s*([\w\-]+)/i, newcharset);
                } else {
                    headers.push({name: 'Content-Type', value: 'text/plain' + newcharset});
                }
            } else {
                headers.push({name: 'Content-Type', value: 'text/plain' + newcharset});
            }

            //удаляем у всех кук SameSite
            for(let h of headers){
                if(h.name.toLowerCase() === 'set-cookie'){
                    const re = /\bsamesite=[^nN]\w+/ig;
                    if(re.test(h.value)) {
                        console.log('Removing SameSite (' + info.requestId + '): ' + h.name + '=' + h.value);
                        h.value = h.value.replace(/\bsamesite=[^nN]\w+/ig, 'samesite=none');
                    }
                }
            }

            //headers.push({name: 'ab-data-return', value: JSON.stringify({url: info.url})});

            //headers.push(
            //    {name: 'Access-Control-Allow-Origin', value: 'null'},
            //    {name: 'Access-Control-Allow-Credentials', value: 'true'},
            //    {name: 'Access-Control-Allow-Headers', value: 'abd-data'}
            //)
            return {responseHeaders: headers};
        }
    },
    // filters
    {
        urls: [
            "*://*/*"
        ]
    },
    // extraInfoSpec
    ["blocking", "responseHeaders", "extraHeaders"]
);

function onEndRequest(info) {
    var data = g_requestData[info.requestId];

    if (!data) {
        return; //Это явно не наш запрос
    }

    //Стираем информацию по этому запросу
    //console.log("onCompleted intercepted: " + info.url);

    delete g_requestData[info.requestId];
}

function cleanOldRequests() {
    cleanOldRequestsData(g_requestData);
    cleanOldRequestsData(g_clientRequestData);
}

function cleanOldRequestsData(requestData) {
    //Удаляем сильно давние реквесты, если таковые остались.
    //Они могут оставаться, если сайт кривоват и неправильно редиректит,
    //так что не вызывается onEndRequest
    var time = new Date().getTime();
    var del = [];
    for (var i in requestData) {
        if (requestData[i].time < time - 1800 * 1000)
            del.push(i);
    }
    for (var i = 0; i < del.length; ++i) {
        delete requestData[del[i]];
    }
}

chrome.webRequest.onErrorOccurred.addListener(
    onEndRequest,
    // filters
    {
        urls: [
            "*://*/*"
        ]
    }
);

chrome.webRequest.onCompleted.addListener(
    onEndRequest,
    // filters
    {
        urls: [
            "*://*/*"
        ]
    }
);

