function Communication(dirForward, processRPC) {
    const DIV_ID = '__CommunicationRPCContainer';
    const EVENT_NAME = '__CommunicationRPCEvent';
    const RESOLVE_PROMISE = '__CommunicationRPCPromiseResolve';
    let promises = {};
    let promiseCounter = 0;

    function getDirSymbol(dir=dirForward) {
        return dir ? '>' : '<';
    }

    function getCommunicationDiv() {
        let hiddenDiv = document.getElementById(DIV_ID);
        if (!hiddenDiv) {
            hiddenDiv = document.createElement('div');
            document.body.appendChild(hiddenDiv);
            hiddenDiv.outerHTML = `<div style="display:none" id="${DIV_ID}"></div>`;
            hiddenDiv = document.getElementById(DIV_ID);
        }

        return hiddenDiv;
    }

//Вызывается из контент скрипта
    function resolvePromise(promise_name, result){
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

    function processRPCBase(rpc){
        if(rpc.method === RESOLVE_PROMISE){
            resolvePromise(rpc.params[0], rpc.params[1]);
        }else if(processRPC){
            return processRPC(rpc);
        }else{
            console.error('Can not process rpc call (no handler): ' + getDirSymbol() + rpc.method);
        }

    }

    function callRPC(rpc, dir=dirForward) {
        let customEvent = document.createEvent('Event');
        customEvent.initEvent(EVENT_NAME + getDirSymbol(), true, true);

        let hiddenDiv = getCommunicationDiv();
        let strcall = JSON.stringify(rpc);
        hiddenDiv.innerText = strcall;
        document.dispatchEvent(customEvent);

        var result = hiddenDiv.innerText;
        if (result == strcall) {
            var msg = 'AnyBalance debugging requires chrome extension to be installed (<a href=\'http://code.google.com/p/any-balance-providers/downloads/list?q=AnyBalanceDebugger\'>AnyBalanceDebugger</a>). Make sure you check Allow access to file URL for this extension at chrome://settings/extensions. And your local html file should be named like *-anybalance.html .';
            alert(msg);
            throw new Error(msg);
        }

        let res = JSON.parse(result);
        if(res.promise){
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

    async function processEvent(){
        let hiddenDiv = getCommunicationDiv();
        let eventData = hiddenDiv.innerText;
        let rpc = JSON.parse(eventData);
        try {
            let ret = processRPCBase(rpc);
            if (ret instanceof Promise) {
                let pid = 'p' + (++promiseCounter);
                hiddenDiv.innerText = JSON.stringify({promise: pid});
                try {
                    ret = await ret;
                } catch (e) {
                    console.error("Error in rpc method " + getDirSymbol() + rpc.method, e);
                    ret = {error: e.message};
                }

                callRPC({method: RESOLVE_PROMISE, params: [pid, ret]}, !dirForward);
            } else {
                hiddenDiv.innerText = JSON.stringify({result: ret});
            }
        }catch(e){
            console.error("Error calling rpc method " + getDirSymbol() + rpc.method, e);
            hiddenDiv.innerText = JSON.stringify({error: e.message});
        }
    }

// add RPC communication event
    document.addEventListener(EVENT_NAME + getDirSymbol(!dirForward), processEvent);

    return {
        callRPC: rpc => callRPC(rpc)
    }
}
