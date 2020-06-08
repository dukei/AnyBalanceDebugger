class DebuggerCommonApi{
    m_backgroundInitialized = false; //Инициализирован ли для данной вкладки задок
    global_config;
    apiAnyBalance;

    constructor(global_config){
        this.global_config = global_config;
    }


    async initializeBackground (params) {
        this.m_backgroundInitialized = false;
        this.global_config.apiGen = params.apiGen;

        if(this.global_config.apiGen === 1){
            this.apiAnyBalance = new AnyBalanceDebuggerApi1(this.global_config);
        }else if(this.global_config.apiGen === 2){
            this.apiAnyBalance = new AnyBalanceDebuggerApi2(this.global_config);
        }else{
            console.error('Unknown apiGen: ' + this.global_config.apiGen);
        }

        this.m_backgroundInitialized = await DebuggerCommonApi.callBackground({method: "initialize", params: [this.global_config]});
        console.log("Background is initialized: " + this.m_backgroundInitialized);

        if(this.global_config['clear-cookies']){
            if(chrome.extension.inIncognitoContext) {
                DebuggerCommonApi.trace('Clearing all cookies before executing provider...');
                let cleared = await DebuggerCommonApi.callBackground({method: 'clearAllCookies'});
                DebuggerCommonApi.trace(cleared + ' cookies cleared!');
            }else{
                DebuggerCommonApi.trace('Cookies have not been cleared because it can be done in incognito mode only!');
            }
        }
    }

    isBackgroundInitialized() {
        return !!this.m_backgroundInitialized;
    }

    static async callBackground(rpccall) {
        return new Promise((resolve, reject) => {
            chrome.extension.sendMessage(rpccall, (response) => {
                if (!typeof response === 'object') {
                    console.error(rpccall, response);
                    throw new Error('Invalid response from background!!! ');
                }
                if (response.error)
                    reject(response.error);
                else
                    resolve(response.result);
            })
        });
    }

    static trace(msg, callee) {
        function restrictedIn() {
            let $content = $(this).find(".content");
            if ($content.height() > 100 || $content.HasVerticalScrollBar()) {
                $content.unbind('click').click(restrictedClick).parent().find('.expandButton').unbind('click').click(restrictedClick).text($content.HasVerticalScrollBar() ? 'Expand' : 'Collapse').show();
            }
        }

        function restrictedOut() {
            $(this).parent().find(".expandButton").hide();
        }

        function restrictedClick() {
            let $content = $(this).parent().find(".content");
            if ($content.HasVerticalScrollBar())
                $content.css('max-height', 'none');
            else
                $content.css('max-height', '100px');
            restrictedIn.apply($(this).parent()[0]);
        }

        if (!callee) callee = '<font color="#888">AnyBalanceDebugger</font>';
        $('<div class="restricted"><div class="expandButton"></div><div class="content"></div></div>').hover(restrictedIn, restrictedOut).find(".content").append('<b title="' + new Date() + '">' + callee + '</b>: ' + msg.replace(/&/g, '&amp;').replace(/</g, '&lt;')).end().appendTo('#AnyBalanceDebuggerLog');
        console.log(callee.replace(/<[^>]*>/g, '') + ':' + msg.slice(0, 255));
        return true;
    }

    static html_output(msg, callee) {
        if (!callee) callee = '<font color="#888" title="' + new Date() + '">AnyBalanceDebugger</font>';
        $('<div></div>').append('<b>' + callee + '</b>: ' + msg).appendTo('#AnyBalanceDebuggerLog');
        return true;
    }

    rpcMethod_initializeBackground(params){
        return this.initializeBackground(params);
    }

    rpcMethod_isBackgroundInitialized(params){
        return this.isBackgroundInitialized(params);
    }

    hasRPC(rpc){
        return !!this['rpcMethod_' + rpc.method];
    }

    callRPC(rpc){
        if(this.hasRPC(rpc))
            return this['rpcMethod_' + rpc.method].apply(this, rpc.params);

        if(!this.isBackgroundInitialized())
            throw new Error("Called method " + rpc.method + " while background is not yet initialized!");

        return this.apiAnyBalance['rpcMethod_' + rpc.method].apply(this.apiAnyBalance, rpc.params);
    }

    static cloneObject(optionNew) {
        return JSON.parse(JSON.stringify(optionNew));
    }

    static joinOptions(optionBase, optionNew) {
        for (let option in optionNew) {
            let val = optionNew[option];
            if (val === null) {
                delete optionBase[option];
            } else if (!isset(optionBase[option]) || !isObject(val)){
                if(!isObject(val)) {
                    optionBase[option] = val;
                }else{
                    let v = optionBase[option];
                    if(!isObject(v))
                        v = {};
                    optionBase[option] = v;
                    DebuggerCommonApi.joinOptions(v, val);
                }
            } else {
                DebuggerCommonApi.joinOptions(optionBase[option], val);
            }
        }
    }

    static joinOptionsToNew(optionBase, optionNew) {
        let o = DebuggerCommonApi.cloneObject(optionBase);
        DebuggerCommonApi.joinOptions(o, optionNew);
        return o;
    }

    static base64EncodeUtf8(str) {
        let words = CryptoJS.enc.Utf8.parse(str);
        return CryptoJS.enc.Base64.stringify(words);
    }

    static base64EncodeBytes(str) {
        let words = CryptoJS.enc.Latin1.parse(str);
        return CryptoJS.enc.Base64.stringify(words);
    }

    static serializeUrlEncoded(obj) {
        let str = [];
        for (let p in obj)
            if (obj.hasOwnProperty(p)) {
                str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
            }
        return str.join("&");
    }

    static toggleHtml(e, text, contentType){
        function highlightText(text) {
            return hljs.highlightAuto(text).value;
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

        let $elem = $(e.target);
        if(!$elem.prop('initialized')){
            let id='sr' + Math.round(Math.random()*100000000);
            $elem.next().html('<a href="#" class="copy" title="Select All">&#9931;</a><pre id="' + id + '">' + highlightText(text) + '</pre>'
                + (/image\//i.test(contentType) ? `<br><img src="data:${contentType};base64,${text}">`: ''));
            $elem.next().find("a.copy").on('click', function(){SelectText(id); return false});
            $elem.prop('initialized', '1');
        }
        $elem.next().toggle('fast');
        return false;
    }


    static encodeURIComponentToCharset(text, charset) {
        // Взято с http://jqbook.narod.ru/ajax/ajax_win1251.htm
        // Инициализируем таблицу перевода

        function getWin1251Table() {
            if (getWin1251Table.transAnsiAjaxSys)
                return getWin1251Table.transAnsiAjaxSys;

            let transAnsiAjaxSys = getWin1251Table.transAnsiAjaxSys = [];
            for (let i = 0x410; i <= 0x44F; i++)
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

        function byte2Hex(N) {
            let str = N.toString(16);
            if (str.length < 2) str = '0' + str;
            return str.toUpperCase();
        }

        // Переопределяем функцию encodeURIComponent()
        function encodeURIComponentToWindows1251(str) {
            let ret = [];
            if (typeof(str) !== 'string') str = '' + str;
            // Составляем массив кодов символов, попутно переводим кириллицу
            let transAnsiAjaxSys = getWin1251Table();
            for (let i = 0; i < str.length; i++) {
                let n = str.charCodeAt(i);
                if (typeof transAnsiAjaxSys[n] !== 'undefined')
                    n = transAnsiAjaxSys[n];
                if (n <= 0xFF)
                    ret.push(isInvariantWin1251Char(n) ? String.fromCharCode(n) : (n === 0x20 ? '+' : '%' + byte2Hex(n)));
            }
            return ret.join('');
        }

        if (charset.toLowerCase() === 'windows-1251')
            return encodeURIComponentToWindows1251(text);
        else
            return encodeURIComponent(text);
    }

    static parseHeaders(strHeaders){
        let headers = [];
        let astrHeaders = strHeaders.split(/\r?\n/);
        for (let i = 0; i < astrHeaders.length; ++i) {
            let header = astrHeaders[i];
            if (!header) continue;
            let idx = header.indexOf(':');
            let name = header.substr(0, idx);
            let value = header.substr(idx + 1).replace(/^\s+/, '');
            headers.push([name, value]);
        }
        return headers;
    }

    static base64ArrayBuffer(arrayBuffer) {
        var base64    = ''
        var encodings = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

        var bytes         = new Uint8Array(arrayBuffer)
        var byteLength    = bytes.byteLength
        var byteRemainder = byteLength % 3
        var mainLength    = byteLength - byteRemainder

        var a, b, c, d
        var chunk

        // Main loop deals with bytes in chunks of 3
        for (var i = 0; i < mainLength; i = i + 3) {
            // Combine the three bytes into a single integer
            chunk = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2]

            // Use bitmasks to extract 6-bit segments from the triplet
            a = (chunk & 16515072) >> 18 // 16515072 = (2^6 - 1) << 18
            b = (chunk & 258048)   >> 12 // 258048   = (2^6 - 1) << 12
            c = (chunk & 4032)     >>  6 // 4032     = (2^6 - 1) << 6
            d = chunk & 63               // 63       = 2^6 - 1

            // Convert the raw binary segments to the appropriate ASCII encoding
            base64 += encodings[a] + encodings[b] + encodings[c] + encodings[d]
        }

        // Deal with the remaining bytes and padding
        if (byteRemainder == 1) {
            chunk = bytes[mainLength]

            a = (chunk & 252) >> 2 // 252 = (2^6 - 1) << 2

            // Set the 4 least significant bits to zero
            b = (chunk & 3)   << 4 // 3   = 2^2 - 1

            base64 += encodings[a] + encodings[b] + '=='
        } else if (byteRemainder == 2) {
            chunk = (bytes[mainLength] << 8) | bytes[mainLength + 1]

            a = (chunk & 64512) >> 10 // 64512 = (2^6 - 1) << 10
            b = (chunk & 1008)  >>  4 // 1008  = (2^6 - 1) << 4

            // Set the 2 least significant bits to zero
            c = (chunk & 15)    <<  2 // 15    = 2^4 - 1

            base64 += encodings[a] + encodings[b] + encodings[c] + '='
        }

        return base64
    }

}
