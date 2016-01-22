//content script initialization
var AnyBalanceDebuggerApi;

(function () {
    var g_global_config = {
        //Умолчательные значения делаем здесь

        //Подтягивать исходники модулей вместе самой новой скомпилированной версии
        'repos-prefer-source': false,

        //Настроенные репозитории
        repos: {'default': {path: ''}},

        //Стирать куки перед стартом провайдера
        'clear-cookies': true,

        //Обход бага хрома с редиректом на другие домены/протоколы (нужен Fiddler)
        'abd-replace-3xx': false
    };

    $.fn.HasVerticalScrollBar = function () {
        //note: clientHeight= height of holder
        //scrollHeight= we have content till this height
        var _elm = $(this)[0];
        var _hasScrollBar = false;
        if (_elm.clientHeight < _elm.scrollHeight) {
            _hasScrollBar = true;
        }
        return _hasScrollBar;
    }

    AnyBalanceDebuggerApi = function () {
        var API_LEVEL = 9;

        function restrictedIn() {
            var $content = $(this).find(".content");
            if ($content.height() > 100 || $content.HasVerticalScrollBar()) {
                $content.unbind('click').click(restrictedClick).parent().find('.expandButton').unbind('click').click(restrictedClick).text($content.HasVerticalScrollBar() ? 'Expand' : 'Collapse').show();
            }
        }

        function restrictedOut() {
            $(this).parent().find(".expandButton").hide();
        }

        function restrictedClick() {
            var $content = $(this).parent().find(".content");
            if ($content.HasVerticalScrollBar())
                $content.css('max-height', 'none');
            else
                $content.css('max-height', '100px');
            restrictedIn.apply($(this).parent()[0]);
        }

        function api_trace(msg, callee) {
            if (!callee) callee = '<font color="#888">AnyBalanceDebugger</font>';
            $('<div class="restricted"><div class="expandButton"></div><div class="content"></div></div>').hover(restrictedIn, restrictedOut).find(".content").append('<b title="' + new Date() + '">' + callee + '</b>: ' + msg.replace(/&/g, '&amp;').replace(/</g, '&lt;')).end().appendTo('#AnyBalanceDebuggerLog');
            console.log(callee.replace(/<[^>]*>/g, '') + ':' + msg.slice(0, 255));
            return true;
        }

        function html_output(msg, callee) {
            if (!callee) callee = '<font color="#888" title="' + new Date() + '">AnyBalanceDebugger</font>';
            $('<div></div>').append('<b>' + callee + '</b>: ' + msg).appendTo('#AnyBalanceDebuggerLog');
            return true;
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
        var m_lastError = '';
        var m_credentials = {};
        var m_options = {};
        var m_backgroundInitialized = false; //Инициализирован ли для данной вкладки задок
        var m_lastStatus; //Последний полученный статус
        var m_lastHeaders; //Последние полученные заголовки

        function getUserAndPassword(url) {
            return {user: m_credentials.user, password: m_credentials.password};
        }

        function base64EncodeUtf8(str) {
            var words = CryptoJS.enc.Utf8.parse(str);
            return CryptoJS.enc.Base64.stringify(words);
        }

        function base64EncodeBytes(str) {
            var words = CryptoJS.enc.Latin1.parse(str);
            return CryptoJS.enc.Base64.stringify(words);
        }

        function addRequestHeaders(request, headers, options) {
            if (headers)
                headers = JSON.parse(headers);
            headers = headers || {};
            var serviceHeaders = {};
            if (m_credentials.user) {
                var aname = "Authorization";
                var idx = abd_getHeaderIndex(headers, aname);
                if (!isset(idx)) {
                    //Авторизация требуется, значит, надо поставить и заголовок авторизации, раз он ещё не передан
                    var value = "Basic " + base64EncodeUtf8(m_credentials.user + ':' + m_credentials.password);
                    serviceHeaders[aname] = value;
                }
            }

            if (g_global_config['abd-replace-3xx'])
                serviceHeaders['abd-replace-3xx'] = 'true';

            for (var h in serviceHeaders) {
                if (isArray(headers))
                    headers.push([h, serviceHeaders[h]]);
                else
                    headers[h] = serviceHeaders[h];
            }

            request.setRequestHeader('abd-data', JSON.stringify({headers: headers, options: options})); //Всегда посылаем такой данные в этом хедере, чтобы бэкграунд знал, что надо этот запрос обработать
        }

        function getBrush(xhr) {
            var str = xhr.getResponseHeader('Content-Type');
            if (!str)
                return new SyntaxHighlighter.brushes.Plain();
            if (/xml|html/i.test(str))
                return new SyntaxHighlighter.brushes.Xml();
            if (/javascript|json/i.test(str))
                return new SyntaxHighlighter.brushes.JScript();
            if (/css/i.test(str))
                return new SyntaxHighlighter.brushes.CSS();
            return new SyntaxHighlighter.brushes.Plain();
        }

        function highlightText(text, xhr) {
            SyntaxHighlighter.defaults['html-script'] = true;
            var brush = getBrush(xhr);
            brush.init({toolbar: false});
            return brush.getHtml(text.replace(/&/g, '&amp;'));
        }

        function callBackground(rpccall) {
            var json = JSON.stringify(rpccall);
            var encoded = encodeURIComponent(json);

            var xhr = new XMLHttpRequest();
            xhr.open("GET", "http://www.gstatic.com/inputtools/images/tia.png?abrnd&data=" + encoded, false);
            xhr.send();

            var data = xhr.getResponseHeader('ab-data');
            if (!data) {
                console.log("Error receiving header from background!");
                return '';
            }

            json = JSON.parse(data);
            return json.result;
        }

        function sleep(milliseconds) {
            var start = new Date().getTime();
            while (new Date().getTime() < start + milliseconds);
            return true;
        }

        function saveLastParameters(xhr) {
            m_lastStatus = 'HTTP/1.1 ' + xhr.status + ' ' + xhr.statusText;
            m_lastHeaders = xhr.getAllResponseHeaders();
        }

        function wait4Result(milliseconds) {
            var result, start = new Date().getTime();
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

        // Взято с http://jqbook.narod.ru/ajax/ajax_win1251.htm
        // Инициализируем таблицу перевода
        var transAnsiAjaxSys;

        function getWin1251Table() {
            if (transAnsiAjaxSys)
                return transAnsiAjaxSys;

            transAnsiAjaxSys = [];
            for (var i = 0x410; i <= 0x44F; i++)
                transAnsiAjaxSys[i] = i - 0x350; // А-Яа-я
            transAnsiAjaxSys[0x401] = 0xA8;    // Ё
            transAnsiAjaxSys[0x451] = 0xB8;    // ё
            return transAnsiAjaxSys;
        }

        function isInvariantWin1251Char(chrcode) {
            if ("*.-_".indexOf(String.fromCharCode(chrcode)) >= 0)
                return true; //Из блатных символов
            if (0x30 <= chrcode && chrcode <= 0x39)
                return true; //Цифры
            if (0x41 <= chrcode && chrcode <= 0x5A)
                return true; //Большие буквы
            if (0x61 <= chrcode && chrcode <= 0x7A)
                return true; //Маленькие буквы
            return false;
        }

        // Переопределяем функцию encodeURIComponent()
        function encodeURIComponentToWindows1251(str) {
            var ret = [];
            if (typeof(str) != 'string') str = '' + str;
            // Составляем массив кодов символов, попутно переводим кириллицу
            var transAnsiAjaxSys = getWin1251Table();
            for (var i = 0; i < str.length; i++) {
                var n = str.charCodeAt(i);
                if (typeof transAnsiAjaxSys[n] != 'undefined')
                    n = transAnsiAjaxSys[n];
                if (n <= 0xFF)
                    ret.push(isInvariantWin1251Char(n) ? String.fromCharCode(n) : (n == 0x20 ? '+' : '%' + byte2Hex(n)));
            }
            return ret.join('');
        }

        function byte2Hex(N) {
            var str = N.toString(16);
            if (str.length < 2) str = '0' + str;
            return str.toUpperCase();
        }

        function encodeURIComponentToCharset(text, charset) {
            if (charset.toLowerCase() == 'windows-1251')
                return encodeURIComponentToWindows1251(text);
            else
                return encodeURIComponent(text);
        }

        function xhr_resendIfNecessary(xhr, headers, options, data) {
            while (true) {
                addRequestHeaders(xhr, headers, options);
                xhr.send(data);
                if ([701, 702, 703, 707].indexOf(xhr.status) >= 0) {
                    //Запрос на редирект из фидлера
                    var location = xhr.getResponseHeader('Location');
                    api_trace("Redirecting to (" + xhr.status + ') ' + location);
                    xhr = new XMLHttpRequest();
                    var auth = getUserAndPassword(location);
                    xhr.open("GET", location, false, auth.user, auth.password);
                    xhr.withCredentials = true;
                    data = undefined;
                    continue;
                }
                break;
            }
            return xhr;
        }

        function cloneObject(optionNew) {
            return JSON.parse(JSON.stringify(optionNew));
        }

        function joinOptions(optionBase, optionNew) {
            for (var option in optionNew) {
                var val = optionNew[option];
                if (val === null) {
                    delete optionBase[option];
                } else if (!isset(optionBase[option]) || !isObject(val)) {
                    optionBase[option] = val;
                } else {
                    joinOptions(optionBase[option], val);
                }
            }
        }

        function joinOptionsToNew(optionBase, optionNew) {
            var o = cloneObject(optionBase);
            joinOptions(o, optionNew);
            return o;
        }

        function request(defaultMethod, url, data, json, headers, options) {
            var method = defaultMethod;
            try {
                var auth = getUserAndPassword(url);
                var xhr = new XMLHttpRequest();

                options = options ? JSON.parse(options) : {};
                var local_options = options.options ? joinOptionsToNew(m_options, options.options) : m_options;

                var domain = /:\/\/([^\/]+)/.exec(url);
                if (!domain)
                    throw {name: "Wrong url", message: "Malformed url for request: " + url};

                method = options.httpMethod || abd_getOption(local_options, OPTION_HTTP_METHOD, domain) || defaultMethod;
                var defCharset = abd_getOption(local_options, OPTION_DEFAULT_CHARSET, domain) || DEFAULT_CHARSET;
                var charset = abd_getOption(local_options, OPTION_FORCE_CHARSET, domain) || defCharset;

                api_trace(method + " to " + url + (isset(data) ? " with data: " + data : ''));
                xhr.open(method, url, false, auth.user, auth.password);

                if (isset(data)) {
                    var input_charset = abd_getOption(local_options, OPTION_REQUEST_CHARSET, domain) || defCharset;

                    if (json) {
                        var dataObj = JSON.parse(data);
                        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
                        var _data = [];
                        if (isArray(dataObj)) {
                            for (var i = 0; i < dataObj.length; ++i) {
                                _data.push(encodeURIComponentToCharset(dataObj[i][0], input_charset) + '=' + encodeURIComponentToCharset(dataObj[i][1], input_charset));
                            }
                        } else {
                            for (var key in dataObj) {
                                _data.push(encodeURIComponentToCharset(key, input_charset) + '=' + encodeURIComponentToCharset(dataObj[key], input_charset));
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
                var serverResponse = xhr.responseText;

                var responseType = xhr.getResponseHeader("Content-Type");
                if (/image\//i.test(responseType) || charset == 'base64') {
                    //Картинки преобразовываем в base64
                    serverResponse = base64EncodeBytes(serverResponse);
                }

                console.log(method + " result (" + xhr.status + "): " + serverResponse.substr(0, 255));
                html_output(method + " result (" + xhr.status + "): " + '<a href="#" onclick="$(this).next().toggle(\'fast\'); return false">show/hide</a><div class="expandable">' + highlightText(serverResponse, xhr) + '</div>');
                return serverResponse;
            } catch (e) {
                m_lastError = '' + e.name + ': ' + e.message;
                api_trace("Error in " + method + ": " + m_lastError + "\nStack: " + e.stack);
                return null;
            }
        };

        return {
            getLastError: function () {
                return m_lastError;
            },

            getLevel: function () {
                return API_LEVEL;
            },

            trace: api_trace,

            requestGet: function (url, headers, options) {
                return request("GET", url, undefined, false, headers, options);
            },

            requestPost: function (url, data, json, headers, options) {
                return request("POST", url, data, json, headers, options);
            },

            setAuthentication: function (name, pass, authScope) {
                m_credentials = {user: name, password: pass};
                return true;
            },

            clearAuthentication: function () {
                m_credentials = {};
                return true;
            },

            onInitialLoad: function (accid) {
                return true;
            },

            setResult: function (accid, data) {
                //Not called. The one that is called is setResult_placeholder in api-adapter.js
                return true;
            },

            setOptions: function (options) {
                var options = JSON.parse(options);
                for (opt in options) {
                    if (options[opt] == null)
                        m_options[opt] = undefined;
                    else
                        m_options[opt] = options[opt];
                }
                return true;
            },

            sleep: sleep,

            initializeBackground: function () {
                m_backgroundInitialized = false;
                chrome.extension.sendMessage({method: "initialize", params: [g_global_config]}, function (response) {
                    m_backgroundInitialized = response.result;
                    console.log("Background is initialized: " + m_backgroundInitialized);

                    if(g_global_config['clear-cookies']){
                        if(chrome.extension.inIncognitoContext) {
                            api_trace('Clearing all cookies before executing provider...');
                            callBackground({method: 'clearAllCookies'});
                            var cookiesCleared = wait4Result();
                            api_trace(cookiesCleared + ' cookies cleared!');
                        }else{
                            api_trace('Cookies have not been cleared because it can be done in incognito mode only!');
                        }
                    }
                });
            },

            isBackgroundInitialized: function () {
                return !!m_backgroundInitialized;
            },

            callBackground: callBackground,

            getLastResponseParameters: function () {
                if (!m_lastStatus) {
                    m_lastError = 'Previous request has not been made or it has failed';
                    return null;
                }
                var url = callBackground({method: 'getLastUrl'});
                var headers = [];
                var strHeaders = m_lastHeaders.split(/\r?\n/);
                for (var i = 0; i < strHeaders.length; ++i) {
                    var header = strHeaders[i];
                    if (!header) continue;
                    var idx = header.indexOf(':');
                    var name = header.substr(0, idx);
                    var value = header.substr(idx + 1).replace(/^\s+/, '');
                    headers[headers.length] = [name, value];
                }
                return JSON.stringify({url: url, status: m_lastStatus, headers: headers});
            },

            getCapabilities: function () {
                return JSON.stringify({
                    captcha: true,
                    preferences: false,
                    async: false,
                    persistence: true,
                    requestOptions: true,
                    requestCharset: true
                });
            },

            setCookie: function (domain, name, val, params) {
                if (val && typeof(val) != 'string')
                    throw {
                        name: 'setCookie',
                        message: 'Trying to set cookie ' + name + 'to an object: ' + JSON.stringify(val)
                    };
                params = params ? JSON.parse(params) : undefined;
                callBackground({method: 'setCookie', params: [domain, name, val, params]});
                var result = wait4Result();
                return result;
            },

            getCookies: function () {
                callBackground({method: 'getCookies'});
                var result = wait4Result();
                return result ? JSON.stringify(result) : null;
            },

            retrieveCode: function (comment, image, options) {
                try {
                    var dlgReturnValue;

                    if ($('#AnyBalanceDebuggerPopup').size() == 0) {
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

                    $('#AnyBalanceDebuggerPopup').html(comment.replace(/</g, '&lt;').replace(/&/g, '&amp;') + '<p><img src="data:image/png;base64,' + image + '">').show();
                    dlgReturnValue = prompt(comment, "");
                    $('#AnyBalanceDebuggerPopup').hide();

                    if (!dlgReturnValue)
                        throw {name: 'retrieveCode', message: 'User has cancelled entering the code!'};

                    return dlgReturnValue;
                } catch (e) {
                    m_lastError = '' + e.name + ': ' + e.message;
                    api_trace("Error in retrieve: " + m_lastError);
                    return null;
                }
            },

            saveData: function (data) {
                localStorage.setItem('abd_stored_data', data);
                return true;
            },

            loadData: function () {
                var data = localStorage.getItem('abd_stored_data');
                return isset(data) && data !== null ? data : "";
            },

        };
    }();

// add RPC communication event
    document.addEventListener('AnyBalanceDebuggerRPC', function (e) {
        var hiddenDiv = document.getElementById('AnyBalanceDebuggerRPCContainer');
        var eventData = hiddenDiv.innerText;
        var rpc = JSON.parse(eventData);
        var ret = AnyBalanceDebuggerApi[rpc.method].apply(null, rpc.params);
        hiddenDiv.innerText = JSON.stringify({result: ret});
    });

    var tabs = `
<div id="tabs">
	<ul>
		<li><a href="#tabs-1">Debugger</a></li>
		<li><a href="#tabs-2">Properties</a></li>
	</ul>
	<div id="tabs-1"></div>
	<div id="tabs-2"></div>
</div>`;

    function onLoadContentDocument() {
        var $div = $('<div id="initialContent"/>');
        var $body = $('body');
        $body.children().appendTo($div);
        $div.appendTo($body);

        $body.append($(tabs));
        var $initialContent = $('#initialContent');
        $initialContent.prepend('<div id="abdVersion">AnyBalance Debugger v.' + chrome.runtime.getManifest().version + '</div>');
        $initialContent.prepend('<div id="abdHelp"><a target="_blank" href="https://github.com/dukei/any-balance-providers/wiki/AnyBalanceDebugger">Help</a></div>');
        $initialContent.appendTo('#tabs-1');

        var $button = $('button').first();
        $button.prop('disabled', true).attr('id', 'buttonExecute');

        var props = [];
        for(var prop in g_global_config){ props.push(prop) }
        chrome.storage.local.get(props, function (items) {
            //Перезатрем умолчательные значения полученными
            for (var prop in items)
                g_global_config[prop] = items[prop];

            configureByPreferences();
            setupPreferencesRepos();
        });

        $("#tabs").tabs();

        $LAB.setOptions({AlwaysPreserveOrder: true})
            .script(chrome.extension.getURL('jquery-ui/jquery.min.js'))
            .script(chrome.extension.getURL('json-viewer/jquery.json-viewer.js'))
            .script(chrome.extension.getURL('api-adapter.js'))
            .script(chrome.extension.getURL('api.js'))
            .wait(function () {
                window.postMessage({type: "INITIALIZE_PAGE_SCRIPT"}, "*");
            });
    }

    var prefsTab = `
<h3>Network error bug workaround</h3>
<input type="checkbox" id="abd-replace-3xx" name="abd-replace-3xx" value="1"><label for="abd-replace-3xx">Enable 3xx replace</label><br/>
<small>
    This is a workaround for chrome bug that causes synchronous
    request to fail when it is redirected to different domain or protocol.
    The workaround requires that you use <a href="http://www.telerik.com/fiddler">Fiddler</a> and add a special extension to it!<br/>
    Download the extension from <a href="http://anybalance.ru/download/AnyBalanceFiddlerExtension.dll"><code>http://anybalance.ru/download/AnyBalanceFiddlerExtension.dll</code></a>
    and place it into <code>"%userprofile%\\Documents\\Fiddler2\\Scripts"</code>
</small>
<hr/>
<h3>Cookie persistence</h3>
<input type="checkbox" id="clear-cookies" name="clear-cookies" value="1"><label for="clear-cookies">Clear all cookies before executing providers</label><br/>
<small>
    To prevent your beloved cookies from unwanted death this option can be enabled <b>in incognito mode only</b>!
</small>
<hr/>
<h3>Paths to local module repositories</h3>
<button id="btnAdd">Add Modules Path</button> or edit configured paths by clicking pencil icon
<br><br>
<table id="grid"></table>
<div id="dialog" style="display:none">
    <input type="hidden" id="ID">
    <table border="0">
        <tbody><tr>
            <td><label for="Name">ID:</label></td>
            <td><input type="text" id="Name"></td>
        </tr>
        <tr>
            <td><label for="Path">Local path:</label></td>
            <td><input type="text" id="Path"></td>
        </tr>
    </tbody></table>
</div>
<hr/>
<input type="checkbox" name="repos-prefer-source" id="repos-prefer-source">
<label for="repos-prefer-source">Prefer "source" version over "build/head"</label><br>
<small>Check this option if you need to debug modules sources</small>
`;

    function setupPreferencesRepos() {
        setupPreferencesReposTable();
        setupPreferencesReposOther();
    }

    function setupPreferencesReposOther() {
        $('#repos-prefer-source')
            .prop('checked', !!g_global_config['repos-prefer-source'])
            .on('click', function () {
                g_global_config['repos-prefer-source'] = $('#repos-prefer-source').prop('checked');
                chrome.storage.local.set({'repos-prefer-source': g_global_config['repos-prefer-source']});
            });
        $('#abd-replace-3xx')
            .prop('checked', !!g_global_config['abd-replace-3xx'])
            .on('click', function () {
                g_global_config['abd-replace-3xx'] = $('#abd-replace-3xx').prop('checked');
                chrome.storage.local.set({'abd-replace-3xx': g_global_config['abd-replace-3xx']});
            });
        $('#clear-cookies')
            .prop('checked', !!g_global_config['clear-cookies'])
            .prop('disabled', !chrome.extension.inIncognitoContext)
            .on('click', function () {
                g_global_config['clear-cookies'] = $('#clear-cookies').prop('checked');
                chrome.storage.local.set({'clear-cookies': g_global_config['clear-cookies']});
            });
    }

    function setupPreferencesReposTable() {
        var repos = g_global_config.repos;
        $('#tabs-2').append($(prefsTab));

        var data = [], grid, dialog;

        function findByName(name) {
            var all = grid.getAll();
            for (var i = 0; i < all.length; ++i) {
                if (all[i].record.Name == name)
                    return all[i].id;
            }
        }

        var i = 0;
        for (var id in repos) {
            var r = repos[id];

            var d = {
                ID: ++i,
                Name: id,
                Path: r.path
            };
            data.push(d);
        }

        dialog = $("#dialog").dialog({
            title: "Add/Edit Record",
            autoOpen: false,
            resizable: false,
            modal: true,
            buttons: {
                "Save": Save,
                "Cancel": function () {
                    $(this).dialog("close");
                }
            }
        });

        function Edit(e) {
            $("#ID").val(e.data.id);
            $("#Name").val(e.data.record.Name);
            $("#Path").val(e.data.record.Path);
            $("#dialog").dialog("open");
        }

        function Delete(e) {
            if (confirm("Are you sure you want to delete repo " + e.data.record.Name + '?')) {
                grid.removeRow(e.data.id);
                saveRepos();
            }
        }

        function Save() {
            var idstr = $("#ID").val();
            var name = $("#Name").val(), path = $("#Path").val();
            if(/["\s]/.test(path)) {
                alert('Path to module repository can not contain quotes (") or spaces. Please specify another path.');
                return;
            }

            if (idstr) {
                var id = parseInt(idstr);
                if (findByName(name) != id) {
                    alert('Repo ' + name + ' is already defined!');
                    return;
                }
                grid.updateRow(id, {"ID": id, "Name": name, "Path": path});
            } else {
                if (findByName(name)) {
                    alert('Repo ' + name + ' is already defined!');
                    return;
                }
                grid.addRow({"ID": grid.count() + 1, "Name": name, "Path": path});
            }
            saveRepos();
            $(this).dialog("close");
        }

        grid = $("#grid").grid({
            dataSource: data,
            columns: [
//                { field: "ID" },
                {field: "Name"},
                {field: "Path", title: "Path"},
                {title: "", width: 20, type: "icon", icon: "ui-icon-pencil", tooltip: "Edit", events: {"click": Edit}},
                {
                    title: "",
                    width: 20,
                    type: "icon",
                    icon: "ui-icon-close",
                    tooltip: "Delete",
                    events: {"click": Delete}
                }
            ]
        });
        $("#btnAdd").on("click", function () {
            $("#ID").val("");
            $("#Name").val("");
            $("#Path").val("");
            $("#dialog").dialog("open");
        });

        function saveRepos(){
            var repos = {};
            var all = grid.getAll();
            for (var i = 0; i < all.length; ++i) {
                var r = {path: all[i].record.Path};
                repos[all[i].record.Name] = r;
            }
            chrome.storage.local.set({'repos': repos}, function () {
                g_global_config.repos = repos;
            });
        };
    }

    var animation = `
<div id="loading_status">
<div id="loading_animation">
    <div id="block_1" class="barlittle"></div>
    <div id="block_2" class="barlittle"></div>
    <div id="block_3" class="barlittle"></div>
    <div id="block_4" class="barlittle"></div>
    <div id="block_5" class="barlittle"></div>
</div>
<div id="loading_text">
Prepairing provider files...
</div>
</div>
`;

    var g_repoServers = {},
        g_auto_port = 8900;

    function configureByPreferences() {
        var prefs = g_global_config;

        $('#abd-replace-3xx').prop('checked', prefs['abd-replace-3xx']);
        $('#AnyBalanceDebuggerLog').before(animation);

        $.ajax('http://localhost:33649/server/list')
            .done(function (data, textStatus, jqXHR) {
                configureRepoServers(prefs, data, function (ok, failedList) {
                    if (ok) {
                        var files = loadProviderFiles(function (ok, failedList) {
                            if(!ok){
                                AnyBalanceDebuggerApi.trace("WARNING: Some dependencies were not loaded (" + failedList.join(', ') + "). Check network tab for details.");
                            }
                            $('#buttonExecute').prop('disabled', false);
                            $('#loading_status').hide();
                        });
                    } else {
                        var failedRepos = [];
                        for(var i=0; i<failedList.length; ++i){
                            failedRepos.push(failedList[i] + ': ' + g_repoServers[failedList[i]].statusMessage);
                        }
                        $('#loading_status').html('ERROR: The following repositories failed:<br>&nbsp;&nbsp;&nbsp;&nbsp;' + failedRepos.join('<br>&nbsp;&nbsp;&nbsp;&nbsp;'));
                    }
                });
            }).fail(function (jqXHR, textStatus, errorThrown) {
                $('#loading_status').html('<a href="http://fenixwebserver.com" target=_blank>Fenix server</a> is unavailable. Run it or use local debugging.');
                $('#buttonExecute').prop('disabled', false);
                console.log('Fenix status can not be fetched: ' + textStatus + ', ' + errorThrown);
            });
    }

    function callFinalComplete(onFinalComplete, objects) {
        var failedObjects = [];
        for (var key in objects) {
            var r = objects[key];
            if (!isset(r.status))
                return; //Ещё ждем
            if (!r.status)
                failedObjects.push(key);
        }
        onFinalComplete(failedObjects.length == 0, failedObjects);
    }

    function createAndStartServer(repo, onComplete, allServers) {
        allServers = allServers || g_repoServers;
        var r = allServers[repo];
        if (!r.path) {
            r.status = false;
            r.statusMessage = 'Please configure module repository local paths (see Properties tab)!';
            callFinalComplete(onComplete, allServers);
            return;
        }

        $.ajax('http://localhost:33649/server', {
            method: "POST",
            data: JSON.stringify({
                //Постараемся найти id провайдера для своей папки
                name: "AB " + (repo == '__self' ? 'Provider ' + r.path.replace(/.*[\/\\]([^\/\\]+)[\/\\]?$/i, '$1') : 'Repo ' + repo),
                path: r.path,
                port: r.port || ++g_auto_port
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        })
            .done(function (data) {
                if(typeof data == 'string'){
                    r.status = false;
                    r.statusMessage = 'Can not create server: ' + data;
                }else {
                    r.port = data.port;
                    r.id = data.id;
                    if (data.running)
                        r.status = true;
                    else
                        startServer(repo, onComplete, allServers);
                }
                callFinalComplete(onComplete, allServers);
            }).fail(function (xhr) {
                r.status = false;
                r.statusMessage = 'Can not start server: ' + xhr.status + ' ' + xhr.statusText;
                callFinalComplete(onComplete, allServers);
            });

    }

    function startServer(repo, onComplete, allServers) {
        allServers = allServers || g_repoServers;
        var r = allServers[repo];
        if (!isset(r.status)) {
            $.ajax('http://localhost:33649/server/' + encodeURIComponent(r.id) + '/start', {method: "PUT"})
                .done(function (data) {
                    r.status = true;
                    callFinalComplete(onComplete, allServers);
                }).fail(function (xhr) {
                    r.status = false;
                    r.statusMessage = 'Can not start server: ' + xhr.status + ' ' + xhr.statusText;
                    callFinalComplete(onComplete, allServers);
                });
        }
    }

    function configureRepoServers(prefs, curServers, onOk) {
        //Создадим также сервер, указывающий на расположение провайдера.
        var providerPath = decodeURI(window.location.href).replace(/^file:\/\/\//i, '').replace(/[^\\\/]+$/, '');
        prefs.repos.__self = {path: providerPath};

        if(/\s+/i.test(providerPath)){
            //проверяем, что путь к текущему провайдеру не содержит пробелов
            g_repoServers.__self = {
                id: '__self',
                path: providerPath,
                status: false,
                statusMessage: "Path to current provider <code>" + providerPath + "</code> should not contain spaces!"
            }
            callFinalComplete(onOk, g_repoServers);
            return;
        }

        for (var repo in prefs.repos) {
            var r = prefs.repos[repo];
            var s = findServer(curServers, r.path);
            if (s) { //Сервер уже есть
                g_repoServers[repo] = {
                    id: s.id,
                    path: r.path,
                    port: s.port,
                    name: s.name,
                    addPath: normalizePath(r.path).substr(normalizePath(s.path).length)
                };
                if (s.running)
                    g_repoServers[repo].status = true;
                else
                    startServer(repo, onOk);
            } else { //Сервера ещё нет
                g_repoServers[repo] = {
                    path: r.path,
                    port: r.port
                };
                createAndStartServer(repo, onOk);
            }
        }

        callFinalComplete(onOk, g_repoServers);
    }

    function normalizePath(path) {
        return path.replace(/$/, '/').replace(/[\\\/]+/g, '/');
    }

    function findServer(curServers, path) {
        var lPath = normalizePath(path).toLowerCase();

        var maxServer = undefined;
        var maxPathLength = 0;
        var maxRunningServer = undefined;
        var maxRunningPathLength = 0;

        for (var i = 0; i < curServers.length; ++i) {
            var s = curServers[i];
            var spath = normalizePath(s.path).toLowerCase();
            if (lPath.indexOf(spath) == 0) {
                if (s.running && maxRunningPathLength < spath.length) {
                    maxRunningPathLength = spath.length;
                    maxRunningServer = s;
                }
                if (maxPathLength < spath.length) {
                    maxPathLength = spath.length;
                    maxServer = s;
                }
            }
        }

        return maxRunningServer || maxServer;
    }

    function getModuleFilePath(module, path) {
        if (!module.id)
            return path;

        if (module.version == 'source')
            return module.id + '/' + module.version + '/' + path;

        return module.id + '/build/' + module.version + '/' + path;
    }

    function getModuleFileUrl(module, path) {
        if (!module.id)
            return getRepoFileUrl(module.repo, path);
        return getRepoFileUrl(module.repo, getModuleFilePath(module, path));
    }

    function getRepoFileUrl(repo, path) {
        if (!repo)
            repo = '__self';
        var r = g_repoServers[repo];
        if(r)
            return 'http://localhost:' + r.port + '/' + (r.addPath || '') + path;
    }

    function loadFileFromRepository(repo, path, onComplete) {
        var url = getRepoFileUrl(repo, path);
        if(url) {
            $.ajax(url)
                .done(function (data) {
                    if (onComplete)
                        onComplete(true, data);
                }).fail(function (xhr) {
                    if (onComplete)
                        onComplete(false, xhr.status + ' ' + xhr.statusText);
                });
        }else{
            onComplete(false, "Repository '" + repo + "' is not configured!");
        }
    }

    function gatherModules(module, data, onComplete) {
        module.files = [];
        module.depends = [];
        module.status = true; //Сам модуль распарсен фактически, осталось только депендансы загрузить

        var $xml = $(data);

        $('files', $xml).children().each(function (i, elem) {
            var tag = elem.tagName;
            var target = elem.getAttribute("target");
            var name = $(elem).text().trim();
            if (tag == 'js' && !target) {
                module.files.push(name);
            }
        });

        $('depends', $xml).children().each(function (i, elem) {
            var repo = elem.getAttribute("repo");
            if (!repo) repo = 'default';
            var module_id = elem.getAttribute("id");
            var version = elem.getAttribute("version");
            if (!version)
                version = 'head';
            if(version == 'head' && g_global_config['repos-prefer-source'])
                version = 'source';
            var possibleModule = g_modules[repo + ':' + module_id];
            if (!possibleModule) {
                var _module = g_modules[repo + ':' + module_id] = {
                    repo: repo,
                    id: module_id,
                    version: version
                };
                module.depends.push(_module);

                (function (module) {
                    loadFileFromRepository(module.repo, getModuleFilePath(module, 'anybalance-manifest.xml'), function (ok, data) {
                        if (!ok) {
                            AnyBalanceDebuggerApi.trace("ERROR: Module " + module.repo + ':' + module.id + '(' + module.version + ') can not be loaded: ' + data);
                            module.status = false;
                            module.statusMessage = data;
                            return callFinalComplete(onComplete, g_modules);
                        }

                        gatherModules(module, data, onComplete);
                    });
                })(_module);
            } else {
                if (possibleModule.version != version) {
                    var curMod = module.repo ? 'Module ' + module.repo + ':' + module.id + '(' + module.version + ')' : 'Current provider'
                    AnyBalanceDebuggerApi.trace("WARNING: " + curMod + " depends on module " + repo + ':' + module_id + '(' + version + ') which is different version from already loaded: ' + module.version);
                }
                module.depends.push(possibleModule);
            }

        });

        callFinalComplete(onComplete, g_modules);
    }

    function loadModule(module, scripts) {
        for (var i = 0; module.depends && i < module.depends.length; ++i) {
            var m = module.depends[i];
            if (m.isLoaded)
                continue;

            loadModule(m, scripts);
        }

        if (!module.isLoaded) {
            module.isLoaded = true;
            for (var j = 0; module.files && j < module.files.length; ++j) {
                var f = module.files[j];
                var url = getModuleFileUrl(module, f);
                scripts.push(url);
            }
        }
    }

    var g_modules = {};

    function loadProviderFiles(onComplete) {
        var module = g_modules[':'] = {};

        loadFileFromRepository(null, 'anybalance-manifest.xml', function (ok, data) {
            if (!ok) {
                AnyBalanceDebuggerApi.trace("ERROR: anybalance-manifest.xml can not be loaded!");
                module.status = false;
                module.statusMessage = data;
                return callFinalComplete(onComplete, g_modules);
            }

            gatherModules(module, data, function (ok, failedKeys) {
                if (!ok)
                    AnyBalanceDebuggerApi.trace("ERROR!!! The following modules failed to load: " + failedKeys.join(', '));

                var scripts = [];
                loadModule(module, scripts);

                //console.log(scripts);

                $('#loading_text').text('Loading provider scripts...');
                var failedScripts = [];
                var scriptErrorsHandled = {};
                $LAB.setOptions({
                    AlwaysPreserveOrder: true,
                    LoadErrorHandler: function (script, event) {
                        // handle error however you wish for example:
                        if(scriptErrorsHandled[script])
                            return;
                        failedScripts.push(script.replace(/.*\/([^\/]+)$/, '$1'));
                        scriptErrorsHandled[script] = true;
                    }
                }).script(scripts).wait(function () {
                    onComplete(failedScripts.length == 0, failedScripts);
                });
            });
        });

        callFinalComplete(onComplete, g_modules);
    }

    window.addEventListener("message", function(event) {
        // We only accept messages from ourselves
        if (event.source != window)
            return;

        if (event.data.type && (event.data.type == "SCRIPT_ERROR_DETECTED")) {
            AnyBalanceDebuggerApi.trace("WARNING: " + event.data.errorMsg + " at " + event.data.url + ':' + event.data.lineNumber + ". Check console for details.");
        }
    });

    onLoadContentDocument();
})();
