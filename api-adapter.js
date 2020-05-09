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
    apiGen: 1,
    nAccountID: 1, //Целое число - идентификатор аккаунта, для которого идет запрос
    preferences: null, //Настройки аккаунта, логин, пароль, counter0-N, будут присвоены позже
    signature: g_AnyBalanceDebuggerSignature, //Сигнатура, которая будет определять RPC вызов для функции prompt или prompt_placeholder (необязательно, если используется api)
    debugmode: true, //Отладочный режим, использование плейсхолдеров и все счетчики требуются
    prompt_placeholder: function (json, defval) { //Вызов этой функции для RPC,
        var signature = g_AnyBalanceDebuggerSignature;
        if (json.slice(0, signature.length) == signature) {
            let rpccallstr = json.slice(signature.length);
            let resstr = abd_callContentFuncInner__(rpccallstr);
            let res = JSON.parse(resstr);
            if(res.promise) {
                console.error("Async result from sync API!!!");
                throw new Error("Async result from sync API!!!");
            }
            return resstr;
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
    }
};

function abd_callContentFuncInner__(strcall) {
    var customEvent = document.createEvent('Event');
    customEvent.initEvent('AnyBalanceDebuggerRPC', true, true);

    var hiddenDiv = document.getElementById('AnyBalanceDebuggerRPCContainer');
    hiddenDiv.innerText = strcall;
    document.dispatchEvent(customEvent);

    var result = hiddenDiv.innerText;
    if (result == strcall) {
        var msg = 'AnyBalance debugging requires chrome extension to be installed (<a href=\'http://code.google.com/p/any-balance-providers/downloads/list?q=AnyBalanceDebugger\'>AnyBalanceDebugger</a>). Make sure you check Allow access to file URL for this extension at chrome://settings/extensions. And your local html file should be named like *-anybalance.html .';
        alert(msg);
        throw new Error(msg);
    }

    return result;
}

async function abd_callContentFunc__(strcall) {
    let strresult = abd_callContentFuncInner__(strcall);
    let res = JSON.parse(strresult);
    if(res.promise){
        let promises = abd_callContentFunc__.promises;
        if(!promises)
            promises = abd_callContentFunc__.promises = {};
        return new Promise((resolve, reject) => {
            let promise = promises[res.promise];
            if(!promise) {
                promises[res.promise] = {
                    name: res.promise,
                    resolve: resolve,
                    reject: reject
                }
            }else if(promise.result){
                resolve(result.result);
                delete promises[res.promise];
            }else{
                throw new Error('Promise ' + res.promise + ' already exists!')
            }
        });
    }
    return res.result;
}

//Вызывается из контент скрипта
function abd_resolveContentFuncResult__(promise_name, result){
    let promises = abd_callContentFunc__.promises;
    if(!promises)
        promises = abd_callContentFunc__.promises = {};
    let promise = promises[promise_name];
    if(!promise) {
        promises[promise_name] = {
            name: promise_name,
            result: result,
        }
    }else if(promise.resolve){
        promise.resolve(result);
        delete promises[promise_name];
    }else{
        throw new Error('Promise ' + promise_name + ' already has result!')
    }
}

function abd_callContentFunc(rpccall) {
    var strcall = JSON.stringify(rpccall);
    return abd_callContentFunc__(strcall);
}

async function loadApiGen2(){
    $('button').prop("disabled", true);
    try {
        await new AnyBalanceApi2({
            preferences: g_AnyBalanceApiParams.preferences,
            signature: g_AnyBalanceApiParams.signature,
            stringRPC: async (str) => {
                const signature = g_AnyBalanceDebuggerSignature;
                if (str.slice(0, signature.length) === signature) {
                    var rpccallstr = str.slice(signature.length);
                    return await abd_callContentFuncAsync__(rpccallstr);
                } else {
                    console.error("Bad RPC call signature: " + str);
                    return null;
                }
            },
            debugmode: true,
            apiResult: new class ResultApi {
                async setResult(data) {
                    let ts = new Date().getTime();
                    await abd_trace('Plain setResult output: ' + data);
                    html_output('setResult called: <pre id="json-viewer-' + ts + '" style="margin-left:10px"></pre>');
                    $('#json-viewer-' + ts).jsonViewer(JSON.parse(data));
                    return true;
                }
            }
        }).execute(main);
    }finally{
        $('button').prop("disabled", false);
    }
}

function abd_executeProvider(){
    //вызывается из контент скрипта
    var now = new Date();
    html_output(`<font color="#888">Provider (started at ${now}, api gen: ${g_AnyBalanceApiParams.apiGen})</font>`);

    if(g_AnyBalanceApiParams.apiGen == 1) {
        api_onload();
    }else if(g_AnyBalanceApiParams == 2) {
        loadApiGen2();
    }else{
        adb_trace("Unknown g_api_gen: " + g_AnyBalanceApiParams.apiGen);
    }

    var now1 = new Date();
    html_output('<font color="#888">Provider finished at ' + now1 + ', running ' + (now1.getTime() - now.getTime()) / 1000 + ' seconds</font><hr/>');
}

function abd_checkIsBackgroundInitialized() {
    if (abd_callContentFunc({method: 'isBackgroundInitialized'})) {
        //Бэкграунд инициализирован, можно загружать провайдер
        abd_executeProvider();
    } else {
        window.setTimeout(abd_checkIsBackgroundInitialized, 100);
    }
}

function abd_onLoadDocument() {
    //Присвоим в параметры апи его настройки
    g_AnyBalanceApiParams.preferences = g_api_preferences;
    g_AnyBalanceApiParams.apiGen = window.g_api_gen || 1;

    //ВНИМАНИЕ!!! Тут надо затереть прописанный в html хэндлер, так что делаем именно так
    $('button')[0].onclick = function () {
        abd_callContentFunc({method: 'initializeBackground', params: [{apiGen: g_AnyBalanceApiParams.apiGen}]});
        window.setTimeout(abd_checkIsBackgroundInitialized, 100);
    };

}

window.onerror = function(errorMsg, url, lineNumber){
    window.postMessage({type: "SCRIPT_ERROR_DETECTED", errorMsg: errorMsg, url: url, lineNumber: lineNumber}, "*");
};

window.addEventListener("message", function(event) {
    // We only accept messages from ourselves
    if (event.source != window)
        return;

    if (event.data.type && (event.data.type == "INITIALIZE_PAGE_SCRIPT")) {
        console.log('Initializing page...');
        abd_onLoadDocument();
    }
}, false);
