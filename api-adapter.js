function abd_trace(msg, callee) {
    return abd_callContentFunc({method: 'trace', params: [msg, callee]});
}

function html_output(msg, callee) {
    if (!callee) callee = '<font color="#888">AnyBalanceDebugger</font>';
    $('<div></div>').append('<b>' + callee + '</b>: ' + msg).appendTo('#AnyBalanceDebuggerLog');
    return true;
}

var g_AnyBalanceDebuggerSignature = "$#@$#AnyBalance.Debugger.Signature";
var g_AnyBalanceApiParams = {
    nAccountID: 1, //Целое число - идентификатор аккаунта, для которого идет запрос
    preferences: null, //Настройки аккаунта, логин, пароль, counter0-N, будут присвоены позже
    signature: g_AnyBalanceDebuggerSignature, //Сигнатура, которая будет определять RPC вызов для функции prompt или prompt_placeholder (необязательно, если используется api)
    debugmode: true, //Отладочный режим, использование плейсхолдеров и все счетчики требуются
    prompt_placeholder: function (json, defval) { //Вызов этой функции для RPC,
        var signature = g_AnyBalanceDebuggerSignature;
        if (json.slice(0, signature.length) == signature) {
            var rpccallstr = json.slice(signature.length);
            return abd_callContentFunc__(rpccallstr);
        } else {
            return prompt(json, defval);
        }
    },
    trace_placeholder: abd_trace, //Вызов этой функции для трейсов в отладочном режиме
    setResult_placeholder: function (accid, data) { //Вызов этой функции для результата в отладочном режиме
        var ts = new Date().getTime();
        abd_trace('Plain setResult output: ' + data);
        html_output('setResult called: <pre id="json-viewer-' + ts + '" style="margin-left:10px"></pre>');
        $('#json-viewer-' + ts).jsonViewer(JSON.parse(data));
        return true;
    },
};

function abd_callContentFunc__(strcall) {
    var customEvent = document.createEvent('Event');
    customEvent.initEvent('AnyBalanceDebuggerRPC', true, true);

    var hiddenDiv = document.getElementById('AnyBalanceDebuggerRPCContainer');
    hiddenDiv.innerText = strcall;
    document.dispatchEvent(customEvent);

    var result = hiddenDiv.innerText;
    if (result == strcall) {
        var msg = 'AnyBalance debugging requires chrome extension to be installed (<a href=\'http://code.google.com/p/any-balance-providers/downloads/list?q=AnyBalanceDebugger\'>AnyBalanceDebugger</a>). Make sure you check Allow access to file URL for this extension at chrome://settings/extensions. And your local html file should be named like *-anybalance.html .';
        alert(msg);
        throw {message: msg};
    }
    return result;
}

function abd_callContentFunc(rpccall) {
    var strcall = JSON.stringify(rpccall);
    var strjson = abd_callContentFunc__(strcall);
    return JSON.parse(strjson).result;
}

function abd_checkIsBackgroundInitialized() {
    if (abd_callContentFunc({method: 'isBackgroundInitialized'})) {
        //Бэкграунд инициализирован, можно загружать провайдер

        var now = new Date();
        html_output('<font color="#888">Provider started at ' + now + '</font>');

        api_onload();

        var now1 = new Date();
        html_output('<font color="#888">Provider finished at ' + now1 + ', running ' + (now1.getTime() - now.getTime()) / 1000 + ' seconds</font><hr/>');
    } else {
        window.setTimeout(abd_checkIsBackgroundInitialized, 100);
    }
}

function loadExtensionScript(scriptPath, onload, onerror) {
    var url = (/:\/\/|^\/|\.\./.test(scriptPath) ? '' : getScriptBaseURL()) + scriptPath;
    $.getScript( url )
        .done(function( script, textStatus ) {
            if(onload)
                onload();
        })
        .fail(function( jqxhr, settings, exception ) {
            if(onerror)
                onerror();
        });
}

function abd_onLoadDocument() {
    //Присвоим в параметры апи его настройки
    g_AnyBalanceApiParams.preferences = g_api_preferences;

    var $div = $('<div id="initialContent"/>');
    $('body').children().appendTo($div);
    $div.appendTo('body');

    //Тут надо затереть прописанный в html хэндлер, так что делаем именно так
    $('button')[0].onclick = function () {
        abd_callContentFunc({method: 'initializeBackground'});
        window.setTimeout(abd_checkIsBackgroundInitialized, 100);
    };

    loadExtensionScript('json-viewer/jquery.json-viewer.js');
}

function getScriptBaseURL() {
    var scripts = document.getElementsByTagName('script');
    var myScript = scripts[0];
    return myScript.src.replace(/[^\/]*$/, '');
}

window.addEventListener('DOMContentLoaded', abd_onLoadDocument, false);
window.addEventListener("message", function(event) {
    // We only accept messages from ourselves
    if (event.source != window)
        return;

    if (event.data.type && (event.data.type == "LOAD_PROVIDER_SCRIPTS")) {
        jQuery.ajaxSetup({cache:true}); //Не добавлять метку времени к скриптам
        var scriptsStatus = [];
        function callEverythingIsLoaded(){
            if(scriptsStatus.length != event.data.scripts.length)
                return;

            var failed = [];
            for(var i=0; i<scriptsStatus.length; ++i){
                if(typeof scriptsStatus[i] == 'undefined')
                    return; //Часть ещё загружается
                if(!scriptsStatus[i])
                    failed.push(event.data.scripts[i].replace(/.*\/([^\/]+)/, '$1'));
            }

            window.postMessage({type: "LOADED_PROVIDER_SCRIPTS", result: failed.length==0, failed: failed}, "*");
        }

        for(var i=0; i<event.data.scripts.length; ++i){
            (function(i){
                loadExtensionScript(event.data.scripts[i], function(){
                    scriptsStatus[i] = true;
                    callEverythingIsLoaded();
                }, function(){
                    scriptsStatus[i] = false;
                    callEverythingIsLoaded();
                });
            })(i);
        }
    }
}, false);
