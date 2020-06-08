const communication = new Communication(true);

function abd_trace(msg, callee) {
    return communication.callRPC({method: 'trace', params: [msg, callee]});
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
            let rpc = JSON.parse(rpccallstr);
            let res = communication.callRPC(rpc);
            if(res instanceof Promise) {
                console.error("Async result from sync API!!! " + rpc.method);
                throw new Error("Async result from sync API!!! " + rpc.method);
            }
            return JSON.stringify({result: res});
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

async function loadApiGen2(){
    $('button').prop("disabled", true);
    try {
        window.AnyBalance = new AnyBalanceApi2({
            preferences: g_AnyBalanceApiParams.preferences,
            signature: g_AnyBalanceApiParams.signature,
            stringRPC: async (str) => {
                const signature = g_AnyBalanceDebuggerSignature;
                if (str.slice(0, signature.length) === signature) {
                    var rpccall = JSON.parse(str.slice(signature.length));
                    let result = await communication.callRPC(rpccall);
                    return JSON.stringify(result);
                } else {
                    console.error("Bad RPC call signature: " + str);
                    return null;
                }
            },
            debugmode: true,
            apiResult: new class ResultApi {
                async setResult(data) {
                    let ts = new Date().getTime();
                    data = (typeof data === 'string' ? data : JSON.stringify(data));
                    await abd_trace('Plain setResult output: ' + data);
                    html_output('setResult called: <pre id="json-viewer-' + ts + '" style="margin-left:10px"></pre>');
                    $('#json-viewer-' + ts).jsonViewer(JSON.parse(data));
                    return true;
                }
            }
        });
        await AnyBalance.execute(main);
    }finally{
        $('button').prop("disabled", false);
    }
}

async function abd_executeProvider(){
    //вызывается из контент скрипта
    var now = new Date();
    html_output(`<font color="#888">Provider (started at ${now}, api gen: ${g_AnyBalanceApiParams.apiGen})</font>`);

    if(g_AnyBalanceApiParams.apiGen == 1) {
        await api_onload();
    }else if(g_AnyBalanceApiParams.apiGen == 2) {
        await loadApiGen2();
    }else{
        abd_trace("Unknown g_api_gen: " + g_AnyBalanceApiParams.apiGen);
    }

    var now1 = new Date();
    html_output('<font color="#888">Provider finished at ' + now1 + ', running ' + (now1.getTime() - now.getTime()) / 1000 + ' seconds</font><hr/>');
}

function abd_checkIsBackgroundInitialized() {
    if (communication.callRPC({method: 'isBackgroundInitialized'})) {
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
        communication.callRPC({method: 'initializeBackground', params: [{apiGen: g_AnyBalanceApiParams.apiGen}]});
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
