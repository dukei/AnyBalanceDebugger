//content script initialization
(function () {
    let g_global_config = {
        //Умолчательные значения делаем здесь

        //Подтягивать исходники модулей вместе самой новой скомпилированной версии
        'repos-prefer-source': false,

        //Настроенные репозитории
        repos: {'default': {path: ''}},

        //Стирать куки перед стартом провайдера
        'clear-cookies': true,

        //Обход бага хрома с редиректом на другие домены/протоколы (нужен Fiddler)
        'abd-replace-3xx': false,

        //Поколение апи
        apiGen: 1,
    };

    $.fn.HasVerticalScrollBar = function () {
        //note: clientHeight= height of holder
        //scrollHeight= we have content till this height
        let _elm = $(this)[0];
        let _hasScrollBar = false;
        if (_elm.clientHeight < _elm.scrollHeight) {
            _hasScrollBar = true;
        }
        return _hasScrollBar;
    };

    const debuggerCommonApi = new DebuggerCommonApi(g_global_config);
    const communication = new Communication(false, rpc => debuggerCommonApi.callRPC(rpc));

    let tabs = `
<div id="tabs">
	<ul>
		<li><a href="#tabs-1">Debugger</a></li>
		<li><a href="#tabs-2">Properties</a></li>
	</ul>
	<div id="tabs-1"></div>
	<div id="tabs-2"></div>
</div>`;

    let initialContent = `<div id="initialContent">
        <button>Execute</button>
        <div id="AnyBalanceDebuggerLog"></div>
    </div>`;

    function onLoadContentDocument() {
        let $body = $('body');
        $body.html(tabs);

        $tabs = $('#tabs');
        $tabs.prepend('<div id="abdVersion">AnyBalance Debugger v.' + chrome.runtime.getManifest().version + '</div>');
        $tabs.prepend('<div id="abdHelp"><a target="_blank" href="https://github.com/dukei/any-balance-providers/wiki/AnyBalanceDebugger">Help</a></div>');
        $('#tabs-1').html(initialContent);

        let $button = $('button').first();
        $button.prop('disabled', true).attr('id', 'buttonExecute');

        let props = [];
        for(let prop in g_global_config){ props.push(prop) }
        chrome.storage.local.get(props, function (items) {
            //Перезатрем умолчательные значения полученными
            for (let prop in items)
                g_global_config[prop] = items[prop];

            configureByPreferences();
            setupPreferencesRepos();
        });

        $("#tabs").tabs();

        $LAB.setOptions({AlwaysPreserveOrder: true})
            .script(chrome.extension.getURL('jquery-ui/jquery.min.js'))
            .script(chrome.extension.getURL('json-viewer/jquery.json-viewer.js'))
            .script(chrome.extension.getURL('communication.js'))
            .script(chrome.extension.getURL('api-adapter.js'))
            .script(chrome.extension.getURL('api1.min.js'))
            .script(chrome.extension.getURL('api2.js'))
            .wait(function () {
                window.postMessage({type: "INITIALIZE_PAGE_SCRIPT"}, "*");
            });
    }

    let prefsTab = `
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
        let repos = g_global_config.repos;
        $('#tabs-2').append($(prefsTab));

        let data = [], grid, dialog;

        function findByName(name) {
            let all = grid.getAll();
            for (let i = 0; i < all.length; ++i) {
                if (all[i].record.Name === name)
                    return all[i].id;
            }
        }

        let i = 0;
        for (let id in repos) {
            let r = repos[id];

            let d = {
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
            let idstr = $("#ID").val();
            let name = $("#Name").val(), path = $("#Path").val();
            if(/["\s]/.test(path)) {
                alert('Path to module repository can not contain quotes (") or spaces. Please specify another path.');
                return;
            }

            if (idstr) {
                let id = parseInt(idstr);
                if (findByName(name) !== id) {
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
            let repos = {};
            let all = grid.getAll();
            for (let i = 0; i < all.length; ++i) {
                let r = {path: all[i].record.Path};
                repos[all[i].record.Name] = r;
            }
            chrome.storage.local.set({'repos': repos}, function () {
                g_global_config.repos = repos;
            });
        }
    }

    let animation = `
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

    let g_repoServers = {},
        g_auto_port = 8900;

    function configureByPreferences() {
        let prefs = g_global_config;

        $('#abd-replace-3xx').prop('checked', prefs['abd-replace-3xx']);
        $('#AnyBalanceDebuggerLog').before(animation);

        DebuggerCommonApi.callBackground({method: 'requestLocalhost', params:[33649, 'server/list']})
            .then(function (data) {
                configureRepoServers(prefs, JSON.parse(data), function (ok, failedList) {
                    if (ok) {
                        let files = loadProviderFiles(function (ok, failedList) {
                            if(!ok){
                                DebuggerCommonApi.trace("WARNING: Some dependencies were not loaded (" + failedList.join(', ') + "). Check network tab for details.");
                            }

                            fetch('https://google.com').then(response => {
                                return response.text();
                            }).then(text => {
                                if(!text){
                                    $('#loading_status').html('ERROR: You should run chrome with special command line to use this extension!');
                                    DebuggerCommonApi.trace("Since Chrome 73 extensions are limited in cross-origin request. To lift this limitation run chrome with command-line flags: --disable-features=BypassCorbOnlyForExtensionsAllowlist --enable-features=NetworkService . If you have launched Chrome with these flags and still get this message then close ALL processes of Chrome and try once more. Check this url for details: https://www.chromium.org/Home/chromium-security/extension-content-script-fetches .");
                                }else{
                                    $('#buttonExecute').prop('disabled', false);
                                    $('#loading_status').hide();
                                }
                            });
                        });
                    } else {
                        let failedRepos = [];
                        for(let i=0; i<failedList.length; ++i){
                            failedRepos.push(failedList[i] + ': ' + g_repoServers[failedList[i]].statusMessage);
                        }
                        $('#loading_status').html('ERROR: The following repositories failed:<br>&nbsp;&nbsp;&nbsp;&nbsp;' + failedRepos.join('<br>&nbsp;&nbsp;&nbsp;&nbsp;'));
                    }
                });
            }).catch(function (errorThrown) {
                $('#loading_status').html('<a href="http://fenixwebserver.com" target=_blank>Fenix server</a> is unavailable. Run it or use local debugging.');
                $('#buttonExecute').prop('disabled', false);
                console.log('Fenix status can not be fetched: ' + errorThrown);
            });
    }

    function callFinalComplete(onFinalComplete, objects) {
        let failedObjects = [];
        for (let key in objects) {
            let r = objects[key];
            if (!isset(r.status))
                return; //Ещё ждем
            if (!r.status)
                failedObjects.push(key);
        }
        onFinalComplete(failedObjects.length == 0, failedObjects);
    }

    function createAndStartServer(repo, onComplete, allServers) {
        allServers = allServers || g_repoServers;
        let r = allServers[repo];
        if (!r.path) {
            r.status = false;
            r.statusMessage = 'Please configure module repository local paths (see Properties tab)!';
            callFinalComplete(onComplete, allServers);
            return;
        }

        DebuggerCommonApi.callBackground({method: 'requestLocalhost', params:[33649, 'server',
        	{
            	method: "POST",
            	body: JSON.stringify({
                	//Постараемся найти id провайдера для своей папки
                	name: "AB " + (repo === '__self' ? 'Provider ' + r.path.replace(/.*[\/\\]([^\/\\]+)[\/\\]?$/i, '$1') : 'Repo ' + repo),
                	path: r.path,
                	port: r.port || ++g_auto_port
            	}),
            	headers: {
                	'Content-Type': 'application/json'
            	}
        	}
        ]})
            .then(function (data) {
                if(!/^\{/i.test(data)){
                    r.status = false;
                    r.statusMessage = 'Can not create server: ' + data;
                }else {
                    data = JSON.parse(data);
                    r.port = data.port;
                    r.id = data.id;
                    if (data.running)
                        r.status = true;
                    else
                        startServer(repo, onComplete, allServers);
                }
                callFinalComplete(onComplete, allServers);
            }).catch(function (error) {
                r.status = false;
                r.statusMessage = 'Can not start server: ' + error;
                callFinalComplete(onComplete, allServers);
            });

    }

    function startServer(repo, onComplete, allServers) {
        allServers = allServers || g_repoServers;
        let r = allServers[repo];
        if (!isset(r.status)) {

        	DebuggerCommonApi.callBackground({method: 'requestLocalhost', params:[33649, 'server/' + encodeURIComponent(r.id) + '/start', {method: "PUT"} ] })
                .then(function (data) {
                    r.status = true;
                    callFinalComplete(onComplete, allServers);
                }).catch(function (error) {
                    r.status = false;
                    r.statusMessage = 'Can not start server: ' + error;
                    callFinalComplete(onComplete, allServers);
                });
        }
    }

    function configureRepoServers(prefs, curServers, onOk) {
        //Создадим также сервер, указывающий на расположение провайдера.
        let providerPath = decodeURI(window.location.href).replace(/^file:\/\/\//i, '').replace(/[^\\\/]+$/, '');
        prefs.repos.__self = {path: providerPath};

        if(/\s+/i.test(providerPath)){
            //проверяем, что путь к текущему провайдеру не содержит пробелов
            g_repoServers.__self = {
                id: '__self',
                path: providerPath,
                status: false,
                statusMessage: "Path to current provider <code>" + providerPath + "</code> should not contain spaces!"
            };
            callFinalComplete(onOk, g_repoServers);
            return;
        }

        for (let repo in prefs.repos) {
            let r = prefs.repos[repo];
            let s = findServer(curServers, r.path);
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
        let lPath = normalizePath(path).toLowerCase();

        let maxServer = undefined;
        let maxPathLength = 0;
        let maxRunningServer = undefined;
        let maxRunningPathLength = 0;

        for (let i = 0; i < curServers.length; ++i) {
            let s = curServers[i];
            if(typeof(s.path) === 'object'){
            	console.log('Path for fenix server ' + s.name + ' is invalid, skipping: ' + JSON.stringify(s));
            	continue;
            }
            let spath = normalizePath(s.path).toLowerCase();
            if (lPath.indexOf(spath) === 0) {
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

        if (module.version === 'source')
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
        let r = g_repoServers[repo];
        if(r)
            return [r.port, (r.addPath || '') + path];
    }

    function loadFileFromRepository(repo, path, onComplete) {
        let urlparts = getRepoFileUrl(repo, path);
        if(urlparts) {
        	DebuggerCommonApi.callBackground({method: 'requestLocalhost', params:[urlparts[0], urlparts[1]]})
                .then(function (data) {
                    if (onComplete)
                        onComplete(true, data);
                }).catch(function (error) {
                    if (onComplete)
                        onComplete(false, error);
                });
        }else{
            onComplete(false, "Repository '" + repo + "' is not configured!");
        }
    }

    function gatherModules(module, data, onComplete) {
        module.files = [];
        module.depends = [];
        module.status = true; //Сам модуль распарсен фактически, осталось только депендансы загрузить

        let $xml = $(data);

        $('files', $xml).children().each(function (i, elem) {
            let tag = elem.tagName;
            let target = elem.getAttribute("target");
            let name = $(elem).text().trim();
            if (tag.toLowerCase() === 'js' && !target) {
                module.files.push(name);
            }
        });

        $('depends', $xml).children().each(function (i, elem) {
            let repo = elem.getAttribute("repo");
            if (!repo) repo = 'default';
            let module_id = elem.getAttribute("id");
            let version = elem.getAttribute("version");
            if (!version)
                version = 'head';
            if(version === 'head' && g_global_config['repos-prefer-source'])
                version = 'source';
            let possibleModule = g_modules[repo + ':' + module_id];
            if (!possibleModule) {
                let _module = g_modules[repo + ':' + module_id] = {
                    repo: repo,
                    id: module_id,
                    version: version
                };
                module.depends.push(_module);

                (function (module) {
                    loadFileFromRepository(module.repo, getModuleFilePath(module, 'anybalance-manifest.xml'), function (ok, data) {
                        if (!ok) {
                            DebuggerCommonApi.trace("ERROR: Module " + module.repo + ':' + module.id + '(' + module.version + ') can not be loaded: ' + data);
                            module.status = false;
                            module.statusMessage = data;
                            return callFinalComplete(onComplete, g_modules);
                        }

                        gatherModules(module, data, onComplete);
                    });
                })(_module);
            } else {
                if (possibleModule.version !== version) {
                    let curMod = module.repo ? 'Module ' + module.repo + ':' + module.id + '(' + module.version + ')' : 'Current provider'
                    DebuggerCommonApi.trace("WARNING: " + curMod + " depends on module " + repo + ':' + module_id + '(' + version + ') which is different version from already loaded: ' + module.version);
                }
                module.depends.push(possibleModule);
            }

        });

        callFinalComplete(onComplete, g_modules);
    }

    function loadModule(module, scripts) {
        for (let i = 0; module.depends && i < module.depends.length; ++i) {
            let m = module.depends[i];
            if (m.isLoaded)
                continue;

            loadModule(m, scripts);
        }

        if (!module.isLoaded) {
            module.isLoaded = true;
            for (let j = 0; module.files && j < module.files.length; ++j) {
                let f = module.files[j];
                let url = getModuleFileUrl(module, f);
                scripts.push('http://localhost:' + url[0] + '/' + url[1]);
            }
        }
    }

    let g_modules = {};

    function loadProviderFiles(onComplete) {
        let module = g_modules[':'] = {};

        loadFileFromRepository(null, 'anybalance-manifest.xml', function (ok, data) {
            if (!ok) {
                DebuggerCommonApi.trace("ERROR: anybalance-manifest.xml can not be loaded!");
                module.status = false;
                module.statusMessage = data;
                return callFinalComplete(onComplete, g_modules);
            }

            gatherModules(module, data, function (ok, failedKeys) {
                if (!ok)
                    DebuggerCommonApi.trace("ERROR!!! The following modules failed to load: " + failedKeys.join(', '));

                let scripts = [];
                loadModule(module, scripts);

                //console.log(scripts);

                $('#loading_text').text('Loading provider scripts...');
                let failedScripts = [];
                let scriptErrorsHandled = {};
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
                    onComplete(failedScripts.length === 0, failedScripts);
                });
            });
        });

        callFinalComplete(onComplete, g_modules);
    }

    window.addEventListener("message", function(event) {
        // We only accept messages from ourselves
        if (event.source !== window)
            return;

        if (event.data.type && (event.data.type === "SCRIPT_ERROR_DETECTED")) {
            DebuggerCommonApi.trace("WARNING: " + event.data.errorMsg + " at " + event.data.url + ':' + event.data.lineNumber + ". Check console for details.");
        }
    });

    onLoadContentDocument();
})();
