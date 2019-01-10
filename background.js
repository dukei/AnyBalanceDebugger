// Copyright (c) 2012 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// Simple extension to replace lolcat images from
// http://icanhascheezburger.com/ with loldog images instead.

var g_abd_Backends = {};
var g_requestData = {};
var c_requestBase = "http://www.gstatic.com/inputtools/images/tia.png?abrnd";

function ABDBackend(tabId) {
    var m_tabId = tabId;
    var m_lastUrl;
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

    function onCookieSet(cookie) {
        if (cookie == null) {
            m_opResult = {error: chrome.runtime.lastError || 'Unknown error setting cookie!'};
        } else {
            m_opResult = {result: true}
        }
    }

    function onCookieRemoved(info) {
        if (info == null) {
            m_opResult = {error: chrome.runtime.lastError || 'Unknown error removing cookie!'};
        } else {
            m_opResult = {result: true}
        }
    }

    function setCookie(domain, name, val, params) {
        m_opResult = undefined;

        if (!params)
            params = {};

        var path = params.path;
        if (!path) path = '/';
        if (!/^\//.test(path))
            path = '/' + path;

        getCurrentCookieStoreId(function(csid){
            if (val === null || val === undefined || val === '') {
                chrome.cookies.remove({
                    url: 'https://' + domain + path, //Путь надо правильный указать, иначе не удаляется
                    name: name,
                    storeId: csid
                }, onCookieRemoved);
            } else {
                chrome.cookies.set({
                    url: 'https://' + domain + path,
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

    function getCookies() {
        m_opResult = undefined;
        chrome.cookies.getAll({}, onCookiesGetAll);
    }

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
    }

    function onCookiesGetAllForCleaning(cookies) {
        var cookiesToRemove = {};

        function checkAllCookiesCleared(){
            for(var id in cookiesToRemove){
                if(!cookiesToRemove[id])
                    return;
            }
            m_opResult = {result: cookies.length};
        }

        for (var i = 0; i < cookies.length; ++i) {
            var cookie = cookies[i];
            var id = 'c' + i;
            cookiesToRemove[id] = false;
            var url = "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;

            (function(cookie, id){
                chrome.cookies.remove({url: url, name: cookie.name, storeId: cookie.storeId}, function(details){
                    cookiesToRemove[id] = true;
                    checkAllCookiesCleared();
                });
            })(cookie, id);
        }

        checkAllCookiesCleared();
    }

    function getCurrentCookieStoreId(callback){
        chrome.cookies.getAllCookieStores(function(css){
        	for(let cs of css){
        		if(cs.tabIds.indexOf(m_tabId) >= 0){
        			callback(cs.id);
        			return;
        		}
        	}
        	callback();		
        });
    }

    function clearAllCookies(){
        m_opResult = undefined;
        getCurrentCookieStoreId(function (csid) {
        	console.log('Cleaning cookies for store ' + csid);
        	chrome.cookies.getAll({storeId: csid}, onCookiesGetAllForCleaning);
        });
    }

    function getOpResult() {
        return m_opResult;
    }

    return {
        getTabId: getTabId,

        initialize: function (config) {
            m_config = config;
            return getTabId();
        },

        setLastUrl: function (url) {
            m_lastUrl = url;
        },

        getLastUrl: function (url) {
            return m_lastUrl;
        },

        getCookies: getCookies,
        setCookie: setCookie,
        getOpResult: getOpResult,

        dummy: function () {
            console.log('dummy');
        },

        clearAllCookies: clearAllCookies
    };
};

function abd_getBackend(tabId, create) {
    var backend = g_abd_Backends[tabId];
    if (create) {
        backend = g_abd_Backends[tabId] = ABDBackend(tabId);
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
        if (info.url.slice(0, c_requestBase.length) == c_requestBase)
            return; //Это служебный запрос, не трогаем его

        var backend = abd_getBackend(info.tabId);
        if (!backend)
            return; //Это не нашего таба запросы, не трогаем их

        backend.setLastUrl(info.url);
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
/*
 //Отслеживание переадресаций нашего таба
 chrome.webRequest.onBeforeRedirect.addListener(function(info) {
 if(info.url.slice(0, c_requestBase.length) == c_requestBase)
 return; //Это служебный запрос, не трогаем его

 var backend = abd_getBackend(info.tabId);
 if(!backend)
 return; //Это не нашего таба запросы, не трогаем их

 backend.setLastUrl(info.redirectUrl);
 },
 // filters
 {
 urls: [
 "*:// * /*"
 ]
 },
 // extraInfoSpec
 ["blocking"]
 );
 */

chrome.webRequest.onBeforeSendHeaders.addListener(
    function (info) {
        var old_headers = info.requestHeaders || [];
        var headers = abd_getHeader(old_headers, 'abd-data');

        if (headers) { //Обрабатываем запросы только с таким заголовком, чтобы не вмешаться случайно в чужой запрос!
            var removable_headers = {
                'abd-data': true,
                'Accept': true,
                'Accept-Charset': true,
                'Accept-Language': true,
                'Cache-Control': true,
                'Connection': true,
                'User-Agent': true,
                'Accept-Encoding': false, //false - то есть, удаляемый только если в передаваемых хедерах он есть
                'Content-Type': false,
                'Cookies': false
            };

            //console.log("onBeforeSendHeaders intercepted: " + JSON.stringify(info.url) + ', setting headers: ' + headers + ', were headers: ' + JSON.stringify(old_headers));
            var data = JSON.parse(headers);
            headers = data.headers;

            //Запомним опции перекодировки и прочие
            g_requestData[info.requestId] = {type: 'user', options: data.options, time: new Date().getTime()};

            var new_headers = [];

            //Уберем необязательные хедеры и те, которые переданы провайдером
            for (var i = 0; i < old_headers.length; ++i) {
                var h = old_headers[i];
                var newhi = abd_getHeaderIndex(headers, h.name);
                if (isset(newhi))
                    continue; //Этот хедер есть у нас, значит, удаляем отсюда
                else if (removable_headers[h.name])
                    continue; //Этот хедер мы не передали, но он необязательный
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
        urls: [
            "*://*/*"
        ]//,
    },
    // extraInfoSpec
    ["blocking", "requestHeaders"]
);

chrome.extension.onMessage.addListener(
    function (request, sender, sendResponse) {
        if (!sender.tab) {
            console.log('Unknown message received, expected message from tab.');
            return;
        }

        var backend = abd_getBackend(sender.tab.id, request.method == 'initialize');
        var result = backend[request.method].apply(backend, request.params);
        sendResponse({result: result});
    }
);

chrome.webRequest.onHeadersReceived.addListener(
    function (info) {
        var data = g_requestData[info.requestId];

        if (!data) {
            return; //Это явно не наш запрос
        }

        //console.log("onHeadersReceived intercepted: " + info.url);
        cleanOldRequests();

        if (data.type == 'service') {
            //Служебный запрос для синхронного запроса бэкграунда
            var backend = abd_getBackend(info.tabId);
            var result = backend[data.data.method].apply(backend, data.data.params);
            return {responseHeaders: [{name: 'ab-data', value: JSON.stringify({result: result})}]};
        } else if (data.type == 'user') {
            //Ответ на запрос данных от провайдера
            //Похимичим с кодировкой ответа
            var headers = info.responseHeaders;
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
                    newcharset = '; charset=' + (forcedCharset || 'x-user-defined');
                }
                if (header) {
                    if (!/;\s*charset\s*=\s*[\w\-]+/i.test(header.value))
                        header.value += newcharset;
                    else if (abd_getOption(data.options, OPTION_FORCE_CHARSET, domain) || /image\//i.test(header.value)) //Если у нас картинка с кодировкой, то кодировку надо сбросить!
                        header.value = header.value.replace(/;\s*charset\s*=\s*[\w\-]+/i, newcharset);
                } else {
                    headers.push({name: 'Content-Type', value: 'text/plain' + newcharset});
                }
            } else {
                headers.push({name: 'Content-Type', value: 'text/plain' + newcharset});
            }
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
    ["blocking", "responseHeaders"]
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
    //Удаляем сильно давние реквесты, если таковые остались. 
    //Они могут оставаться, если сайт кривоват и неправильно редиректит, 
    //так что не вызывается onEndRequest
    var time = new Date().getTime();
    var del = [];
    for (var i in g_requestData) {
        if (g_requestData[i].time < time - 1800 * 1000)
            del.push(i);
    }
    for (var i = 0; i < del.length; ++i) {
        delete g_requestData[i];
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

