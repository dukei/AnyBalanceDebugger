(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
"use strict";
/* Для апи нужны следующие параметры, определенные в глобальном скоупе:
  
var g_AnyBalanceApiParams = {
      nAccountID: %ACCOUNT_ID%, //Целое число - идентификатор аккаунта, для которого идет запрос
      preferences: %PREFERENCES%, //Настройки аккаунта, логин, пароль, counter0-N.
      //signature: '%RPC_SIGNATURE%', //Сигнатура, которая будет определять RPC вызов для функции prompt или prompt_placeholder (необязательно, если используется api)
      //debugmode: false, //Отладочный режим, использование плейсхолдеров и все счетчики требуются
      //prompt_placeholder: null, //Вызов этой функции для RPC,
      //trace_placeholder: null, //Вызов этой функции для трейсов в отладочном режиме
      //setResult_placeholder: null,  //Вызов этой функции для результата в отладочном режиме
      //api: window._AnyBalanceAPI //Объект реализации апи (необязательно, если его нет, то будет использовано RPC)
};

*/
Object.defineProperty(exports, "__esModule", { value: true });
const api_1 = require("./api");
const base64_arraybuffer_1 = require("base64-arraybuffer");
const reCounterLastWord = /\.[^.]*$/;
const cookiesParamName = '!@#AB_COOKIES';
class AsyBalanceUserError extends Error {
    constructor(message, ex) {
        super(message);
        this.name = 'AnyBalanceApiUserError';
        this.ex = ex;
    }
}
class AsyBalanceSystemError extends Error {
    constructor(msg) {
        super(msg);
        this.name = 'AnyBalanceApiError';
    }
}
class AsyResponseObject {
    constructor(data) {
        this.data = data;
    }
    getString() {
        const body = this.data.body;
        let rets;
        if (typeof body === 'string') {
            rets = body;
        }
        else if (body instanceof ArrayBuffer) {
            rets = base64_arraybuffer_1.encode(body);
        }
        else {
            throw new AsyBalanceSystemError(`Unknown type of response from ${this.url}`);
        }
        return rets;
    }
    getBuffer() {
        const body = this.data.body;
        let retb;
        if (typeof body === 'string') {
            retb = base64_arraybuffer_1.decode(body);
        }
        else if (body instanceof ArrayBuffer) {
            retb = body;
        }
        else {
            throw new AsyBalanceSystemError(`Unknown type of response from ${this.url}`);
        }
        return retb;
    }
    getLastStatusString(response) {
        return this.data.status;
    }
    getLastStatusCode(response) {
        const matches = this.data.status.match(/\S+\s+(\d+)/);
        if (!matches)
            return 0;
        return parseInt(matches[1]);
    }
    /**
     * Get value of the first header with the specified name
     * @param name
     */
    getLastResponseHeader(resp, name) {
        var headers = this.data.headers;
        name = name.toLowerCase();
        for (let i = 0; i < headers.length; ++i) {
            const header = headers[i];
            if (header[0].toLowerCase() == name)
                return header[1];
        }
        return false;
    }
    getLastResponseHeaders(response) {
        return this.data.headers;
    }
    get headers() { return this.data.headers; }
    get url() { return this.data.url; }
    get status() { return this.data.status; }
    get body() { return this.data.body; }
    ;
}
class AsyBalance {
    constructor(params) {
        this.setResultCalled = false;
        this.accountData = null;
        this.accountDataPromise = null;
        this.execute_called = false;
        this.Error = AsyBalanceUserError;
        this.global = params;
        this.preferences = this.global.preferences || {};
    }
    async callAnyBalance(name, args) {
        if (!args)
            args = [];
        if (!this.global.stringRPC)
            throw new Error('String gate not set!');
        let ret = await this.global.stringRPC(this.global.signature + JSON.stringify({ method: name, params: args }));
        if (ret && typeof ret === 'string') {
            if (ret.charAt(0) == '{') {
                return this.checkCallResponse(ret);
            }
            else {
                //Проблема, вернули просто строку. Скорее всего это ошибка.
                //Ошибка серьёзная, так что бросаем эксепшн в любом случае
                throw new AsyBalanceSystemError(ret);
            }
        }
        else {
            throw new AsyBalanceSystemError("Unexpected output from method '" + name + "': (" + (typeof ret) + ") " + JSON.stringify(ret).substr(0, 128));
        }
    }
    async api_getLevel() {
        const method = 'getLevel';
        if (this.global.api) {
            const resp = await this.global.api.getLevel();
            return this.checkCallResponse(resp);
        }
        return await this.callAnyBalance(method);
    }
    async api_getCapabilities() {
        const method = 'getCapabilities';
        if (this.global.api) {
            const resp = await this.global.api.getCapabilities();
            return this.checkCallResponse(resp);
        }
        return await this.callAnyBalance(method);
    }
    /**
     * Возвращает возможности этой реализации API
     */
    async getCapabilities() {
        return await this.api_getCapabilities();
    }
    async api_trace(msg, callee) {
        const method = 'trace';
        if (this.global.apiTrace) {
            const resp = await this.global.apiTrace.trace(msg, callee);
            return this.checkCallResponse(resp);
        }
        return this.callAnyBalance(method, [msg, callee]);
    }
    checkCallResponse(resp) {
        if (typeof (resp) === 'string') {
            resp = JSON.parse(resp);
        }
        const respError = resp;
        if (respError.error)
            throw new AsyBalanceSystemError(respError.message);
        const respSuccess = resp;
        return respSuccess.payload;
    }
    async api_requestPost(url, data, headers, options) {
        const method = 'requestPost';
        let json = !!(data && !(typeof data === 'string') && !(data instanceof ArrayBuffer));
        let payload;
        if (this.global.api) {
            let resp;
            if (this.global.api_stringified) {
                let _headers = '';
                let _options = '';
                if (data instanceof ArrayBuffer) {
                    data = base64_arraybuffer_1.encode(data);
                    if (!options)
                        options = {};
                    options.requestCharset = 'base64';
                }
                else if (!data) {
                    data = '';
                }
                else if (typeof data === 'object') {
                    data = JSON.stringify(data);
                }
                if (headers)
                    _headers = JSON.stringify(headers);
                if (options)
                    _options = JSON.stringify(api_1.OPTIONS);
                resp = await this.global.api.requestPost(url, data, json, _headers, _options);
            }
            else {
                resp = await this.global.api.requestPost(url, data, json, headers, options);
            }
            payload = this.checkCallResponse(resp);
        }
        else {
            if (data instanceof ArrayBuffer) {
                data = base64_arraybuffer_1.encode(data);
                if (!options)
                    options = {};
                options.requestCharset = 'base64';
            }
            payload = await this.callAnyBalance(method, [url, data, json, headers, options]);
        }
        return new AsyResponseObject(payload);
    }
    async api_setAuthentication(name, pass, authscope) {
        const method = 'setAuthentication';
        let _authscope = '';
        if (this.global.api_stringified && authscope)
            _authscope = JSON.stringify(authscope);
        if (this.global.api)
            return this.checkCallResponse(await this.global.api.setAuthentication(name, pass, _authscope || authscope));
        return this.callAnyBalance(method, [name, pass, authscope]);
    }
    async api_clearAuthentication() {
        const method = 'clearAuthentication';
        if (this.global.api)
            this.checkCallResponse(await this.global.api.clearAuthentication());
        return this.callAnyBalance(method);
    }
    async api_sleep(ms) {
        const method = 'sleep';
        if (this.global.api)
            return this.checkCallResponse(await this.global.api.sleep(ms));
        return this.callAnyBalance(method, [ms]);
    }
    async api_setCookie(domain, name, value, params) {
        const method = 'setCookie';
        let _params = '';
        if (this.global.api_stringified && params)
            _params = JSON.stringify(params);
        if (this.global.api)
            return this.checkCallResponse(await this.global.api.setCookie(domain, name, value, _params || params));
        return this.callAnyBalance(method, [domain, name, value, params]);
    }
    async api_getCookies() {
        const method = 'getCookies';
        if (this.global.api)
            return this.checkCallResponse(await this.global.api.getCookies());
        return this.callAnyBalance(method);
    }
    async api_setResult(data) {
        const method = 'setResult';
        let _data = '';
        if (this.global.api_stringified)
            _data = JSON.stringify(data);
        if (this.global.apiResult)
            return this.checkCallResponse(await this.global.apiResult.setResult(_data || data));
        return this.callAnyBalance(method, [data]);
    }
    replaceOptNames(data) {
        const validated = {}, optionNames = api_1.OPTIONS;
        //Make option names right
        for (let opt in data) {
            const name = optionNames[opt] || opt;
            if (isObject(data[opt]))
                validated[name] = this.replaceOptNames(data[opt]);
            else
                validated[name] = data[opt];
        }
        return validated;
    }
    async api_setOptions(data) {
        const method = 'setOptions', validated = this.replaceOptNames(data);
        let _options = '';
        if (this.global.api_stringified)
            _options = JSON.stringify(validated);
        if (this.global.api)
            return this.checkCallResponse(await this.global.api.setOptions(_options || validated));
        return this.callAnyBalance(method, [validated]);
    }
    async api_retrieveCode(comment, image, options) {
        const method = 'retrieveCode';
        let _options = '';
        if (this.global.api_stringified && options)
            _options = JSON.stringify(options);
        if (this.global.api)
            return this.checkCallResponse(await this.global.api.retrieveCode(comment, image, _options || options));
        return this.callAnyBalance(method, [comment, image, options]);
    }
    async api_loadData() {
        const method = 'loadData';
        if (this.global.apiStorage)
            return this.checkCallResponse(await this.global.apiStorage.loadData());
        return this.callAnyBalance(method);
    }
    async api_saveData(data) {
        const method = 'saveData';
        if (this.global.apiStorage)
            return this.checkCallResponse(await this.global.apiStorage.saveData(data));
        return this.callAnyBalance(method, [data]);
    }
    initAvailableCounter(counter) {
        do {
            if (counter) {
                if (this.availableCounters.obj[counter])
                    break; //already registered
                this.availableCounters.arr.push(counter);
                this.availableCounters.obj[counter] = true;
                if (counter.substr(-1) != '-') {
                    //Если счетчик не оканчивается на -, значит, он не запрещен и надо включить все его частичные счетчики
                    const counterIsComplex = reCounterLastWord.test(counter);
                    counter = counter.replace(reCounterLastWord, '');
                    if (counterIsComplex)
                        continue;
                }
            }
            break;
        } while (true);
    }
    initAvailableCounters() {
        if (this.availableCounters)
            return;
        this.availableCounters = { arr: [], obj: {} };
        let counters = this.preferences.ab$counters, i;
        if (counters) {
            //Новый формат каунтеров
            for (i = 0; i < counters.length; ++i) {
                this.initAvailableCounter(counters[i]);
            }
        }
        else {
            //Старый формат каунтеров
            //Just 20 as max counters number, but actual constant is defined in Java
            for (i = 0; i < 20; ++i) {
                this.initAvailableCounter(this.preferences['counter' + i]);
            }
        }
    }
    /**
     * returns true if at least one of supplied counters is selected by a user for retrieving
     *
     * @param arrOrString can be string or array of strings
     */
    isAvailable(...arrOrString) {
        this.initAvailableCounters();
        for (let i = 0; i < arrOrString.length; ++i) {
            const arg = arrOrString[i];
            if (Array.isArray(arg) ? this.isAvailable(...arg) : this.isAvailable1(arg))
                return true;
        }
        return false;
    }
    isAvailable1(counter) {
        let obj = this.availableCounters.obj, counterIsComplex;
        if (obj['--auto--'] || //Если хоть один автоматический каунтер заявлен, то получаем все каунтеры.
            this.availableCounters.arr.length == 0)
            return true; //Если не задан ни один каунтер, значит, разрешены все
        //Проверим, что не только каунтер присутствует в списке, но и разрешена вся иерархия (каунтер+),
        //Или запрещена вся иерархия (каунтер-)
        do {
            //Точное сравнение только для полного каунтера, а с + можно и частичные сравнивать
            if ((!counterIsComplex && obj[counter]) || obj[counter + '+'])
                return true; //Разрешен или разрешен со всей иерархией
            if (obj[counter + '-'])
                return false; //Явно запрещен
            counterIsComplex = reCounterLastWord.test(counter);
            counter = counter.replace(reCounterLastWord, '');
        } while (counterIsComplex);
        //Проверили все счетчики, среди заданного списка они не матчатся.
        //Но может, мы разрешили всё, кроме? Проверим.
        if (obj['+']) //'+' - разрешены все счетчики, кроме тех, что '-'
            return true;
        return false;
    }
    async getCookiesImpl() {
        return await this.api_getCookies();
    }
    /**
     * Set cookie for this session
     * @param domain
     * @param name
     * @param value
     * @param params
     */
    async setCookie(domain, name, value, params) {
        return await this.api_setCookie(domain, name, value || null, params || null);
    }
    async loadDataImpl() {
        return await this.api_loadData();
    }
    async saveDataImpl(data) {
        return await this.api_saveData(data);
    }
    async initData() {
        if (this.accountData === null) {
            this.accountDataPromise = this.loadDataImpl();
            const data = await this.accountDataPromise;
            if (!this.accountData) {
                this.accountDataPromise = null;
                this.accountData = data ? JSON.parse(data) : {};
            }
        }
    }
    /**
     * Получает сохраненные при аккаунте данные
     * @param name
     * @param defaultValue
     */
    async getData(name, defaultValue) {
        await this.initData();
        return this.accountData[name] === undefined ? defaultValue : this.accountData[name];
    }
    /**
     * Устанавливает сохраняемые при аккаунте данные
     * @param name
     * @param value
     */
    async setData(name, value) {
        await this.initData();
        if (this.accountData[name] !== value) {
            this.accountDataDirty = true;
            this.accountData[name] = value;
        }
    }
    /**
     * Физически сохраняет все данные в аккаунт, если они были модифицированы
     * @param forceSave
     */
    async saveData(forceSave) {
        await this.initData();
        if (this.accountDataDirty || forceSave)
            await this.saveDataImpl(JSON.stringify(this.accountData));
        this.accountDataDirty = false;
    }
    clearData() {
        this.accountData = {};
        this.accountDataDirty = true;
    }
    isDataDirty() {
        return !!this.accountDataDirty;
    }
    /**
     * Сохраняет все куки на будущее
     */
    async saveCookies(paramName) {
        this.accountDataDirty = true;
        await this.setData(paramName || cookiesParamName, await this.getCookiesImpl());
    }
    /**
     * Восстанавливает все ранее сохраненные куки
     */
    async restoreCookies(paramNameOrCookies) {
        let cookies = Array.isArray(paramNameOrCookies)
            ? paramNameOrCookies
            : await this.getData(paramNameOrCookies || cookiesParamName, []);
        for (var i = 0; i < cookies.length; ++i) {
            var cookie = cookies[i];
            await this.setCookie(cookie.domain, cookie.name, cookie.value, cookie);
        }
    }
    /**
     * Get AnyBalance API version
     */
    async getLevel() {
        return this.api_getLevel();
    }
    /**
     * Write message to an account log
     * This log can be viewed in AnyBalance program
     * Useful for debugging
     *
     * @param msg - message
     * @param caller - context hint
     */
    async trace(msg, caller) {
        await this.api_trace(msg, caller || 'trace');
    }
    /**
     * Sends get request
     * @param url
     * @param headers
     * @param options
     */
    async requestGet(url, headers, options) {
        if (!options)
            options = {};
        if (!options.httpMethod)
            options.httpMethod = api_1.HTTP_METHOD.GET;
        return this.requestPost(url, null, headers, options);
    }
    /**
     * Sends post request
     * @param url
     * @param data
     * @param headers
     * @param options
     */
    async requestPost(url, data, headers, options) {
        const response = await this.api_requestPost(url, data || null, headers || null, options || null);
        return response;
    }
    /**
     * Set authentication parameters for this session
     * These parameters apply for all subsequent requests
     * @param name
     * @param pass
     * @param authscope
     */
    async setAuthentication(name, pass, authscope) {
        return await this.api_setAuthentication(name, pass, authscope || null);
    }
    /**
     * Get all cookies for this session
     */
    async getCookies() {
        return this.getCookiesImpl();
    }
    /**
     * Get cookie value by name
     * @param name
     * @param params
     */
    async getCookie(name, params) {
        if (params && !isObject(params))
            throw new AsyBalanceUserError('getCookie: params argument should be null or object!');
        const path = (params && params.path);
        const domain = (params && params.domain);
        const allcookies = (params && params.allcookies) || await this.getCookiesImpl();
        for (let i = 0; i < allcookies.length; ++i) {
            var cookie = allcookies[i];
            if (cookie.name != name)
                continue;
            if (domain && (!cookie.domain || domain.toLowerCase().indexOf(cookie.domain) != 0))
                continue;
            if (path && (!cookie.path || path.indexOf(cookie.path) != 0))
                continue;
            return cookie.value;
        }
        return false;
    }
    /**
     * retrieves graphical or sms code
     * @param comment
     * @param image
     * @param options
     */
    async retrieveCode(comment, image, options) {
        return await this.api_retrieveCode(comment, image || '', options || null);
    }
    /**
     * Clears authentication parameters in this session
     */
    async clearAuthentication() {
        return await this.api_clearAuthentication();
    }
    /**
     * returns true is setResult has already been called in this session
     */
    isSetResultCalled() {
        return this.setResultCalled;
    }
    //Sets result of counters retrieval
    //data is object containing all counters
    //you must specify 'success': true or 'error': true for AnyBalance can distinguish results between success and error
    async setResult(data) {
        if (this.isDataDirty()) {
            await this.api_trace("WARNING: setResult is called without saving data!", "setResult");
        }
        if (this.setResultCalled)
            return;
        this.setResultCalled = true;
        if (this.global.converter_main) {
            try {
                data = this.global.converter_main(data); //Calling converter if it exists
            }
            catch (e) {
                //Экспешны не должны выходить из setResult
                data = this.errorToResult(e);
            }
        }
        await this.api_setResult(JSON.stringify(data));
    }
    errorToResult(e) {
        let result;
        if (e && e.name === 'AnyBalanceApiError') {
            result = new api_1.AsyBalanceResultError(e.message);
        }
        else if (e && e.name === 'AnyBalanceApiUserError') {
            result = new api_1.AsyBalanceResultError(e.message, e);
        }
        else {
            let message = 'Unhandled exception in user script:';
            if (e && typeof e === 'object') {
                message += '\nname: ' + e.name + '\nmessage: ' + e.message;
                for (var key in e) {
                    if (/^(name|message|stack)$/.test(key))
                        continue; //The intrinsic properties not always enumerable, so let's force necessary ones
                    message += '\n' + key + ': ' + e[key];
                }
                if (e.stack)
                    message += '\nCall stack:\n' + e.stack;
            }
            else {
                message = '' + e;
            }
            result = new api_1.AsyBalanceResultError(message, new AsyBalanceUserError(message, e));
        }
        return result;
    }
    /**
     * Sets several options for api
     *
     * @param data {option: value, option: value, ...}
     */
    async setOptions(data) {
        return await this.api_setOptions(data);
    }
    /**
     * Suspend execution by specified number of milliseconds
     */
    async sleep(ms) {
        return await this.api_sleep(ms);
    }
    /**
     * returns array of strings - names of user selected counters in user order
     */
    getAvailableCounters() {
        this.initAvailableCounters();
        return this.availableCounters.arr;
    }
    async setDefaultCharset(charset) {
        const obj = { [api_1.OPTIONS.DEFAULT_CHARSET]: charset };
        return await this.api_setOptions(obj);
    }
    /**
     *  Устанавливает флаг, что логин удался, то есть, последующие вызовы могут использовать залогиненность
     */
    setLoginSuccessful() {
        this.loginSuccessful = true;
    }
    getPreferences() {
        return this.global.preferences || {};
    }
    isObject(obj) {
        return isObject(obj);
    }
    async execute(main) {
        if (this.execute_called)
            return Promise.resolve();
        this.execute_called = true;
        const preferences = this.getPreferences();
        const countersSet = preferences.ab$countersSet;
        const handleSetResultNotCalled = () => {
            if (!this.setResultCalled) {
                //Это является ошибкой только в синхронном режиме.
                this.setResult({
                    error: true,
                    message: "main() exited without calling setResult()"
                });
            }
        };
        try {
            if (countersSet) {
                //Набор каунтеров, надо запускать несколько раз
                for (let i = 0; i < countersSet.length; ++i) {
                    preferences.ab$countersSetIndex = i;
                    preferences.ab$counters = countersSet[i];
                    this.availableCounters = undefined;
                    this.setResultCalled = false;
                    try {
                        await main();
                    }
                    catch (e) {
                        await this.setResult(this.errorToResult(e));
                        if (e && e.fatal) {
                            this.trace('Caught fatal error, breaking iterations');
                            break;
                        }
                        if (!this.loginSuccessful) {
                            this.trace('Login was not successful, breaking iterations');
                            break;
                        }
                    }
                    handleSetResultNotCalled();
                }
            }
            else {
                await main(); // This is the starting point of user script
            }
        }
        catch (e) {
            await this.setResult(this.errorToResult(e));
        }
        finally {
            handleSetResultNotCalled();
        }
    }
    decodeBase64(str) {
        return base64_arraybuffer_1.decode(str);
    }
    encodeBase64(buf) {
        return base64_arraybuffer_1.encode(buf);
    }
}
exports.default = AsyBalance;
/**
 * Options for setOptions
 */
AsyBalance.OPTIONS = api_1.OPTIONS;
function isObject(obj) {
    return obj && typeof (obj) === 'object' && !Array.isArray(obj);
}

},{"./api":2,"base64-arraybuffer":4}],2:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class AsyBalanceResultError {
    constructor(message, e) {
        this.error = true;
        this.e = e;
        this.message = message;
        if (e && (!e.name || !/AnyBalance/i.test(e.name))) {
            this.investigate = true;
            this.unhandled = true;
        }
    }
}
exports.AsyBalanceResultError = AsyBalanceResultError;
var RetrieveInputType;
(function (RetrieveInputType) {
    RetrieveInputType["number"] = "number";
    RetrieveInputType["text"] = "text";
    RetrieveInputType["textEmailAddress"] = "textEmailAddress";
})(RetrieveInputType = exports.RetrieveInputType || (exports.RetrieveInputType = {}));
var OPTIONS;
(function (OPTIONS) {
    OPTIONS["OPTIONS"] = "options";
    OPTIONS["DEFAULT_CHARSET"] = "defaultCharset";
    OPTIONS["FORCE_CHARSET"] = "forceCharset";
    OPTIONS["REQUEST_CHARSET"] = "requestCharset";
    OPTIONS["SSL_ENABLED_PROTOCOLS"] = "sslEnabledProtocols";
    OPTIONS["SSL_ENABLED_PROTOCOLS_ADD"] = "sslEnabledProtocolsAdd";
    OPTIONS["SSL_ENABLED_PROTOCOLS_REMOVE"] = "sslEnabledProtocolsRemove";
    OPTIONS["SSL_ENABLED_CIPHER_SUITES"] = "sslEnabledCipherSuites";
    OPTIONS["SSL_ENABLED_CIPHER_SUITES_ADD"] = "sslEnabledCipherSuitesAdd";
    OPTIONS["SSL_ENABLED_CIPHER_SUITES_REMOVE"] = "sslEnabledCipherSuitesRemove";
    OPTIONS["PER_DOMAIN"] = "perDomain";
    OPTIONS["HTTP_METHOD"] = "httpMethod";
})(OPTIONS = exports.OPTIONS || (exports.OPTIONS = {}));
var HTTP_METHOD;
(function (HTTP_METHOD) {
    HTTP_METHOD["GET"] = "GET";
    HTTP_METHOD["POST"] = "POST";
    HTTP_METHOD["OPTIONS"] = "OPTIONS";
    HTTP_METHOD["DELETE"] = "DELETE";
    HTTP_METHOD["PUT"] = "PUT";
    HTTP_METHOD["HEAD"] = "HEAD";
})(HTTP_METHOD = exports.HTTP_METHOD || (exports.HTTP_METHOD = {}));

},{}],3:[function(require,module,exports){
(function (global){
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const ApiImpl_1 = __importDefault(require("../api/ApiImpl"));
global.AnyBalanceApi2 = ApiImpl_1.default;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{"../api/ApiImpl":1}],4:[function(require,module,exports){
/*
 * base64-arraybuffer
 * https://github.com/niklasvh/base64-arraybuffer
 *
 * Copyright (c) 2012 Niklas von Hertzen
 * Licensed under the MIT license.
 */
(function(){
  "use strict";

  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

  // Use a lookup table to find the index.
  var lookup = new Uint8Array(256);
  for (var i = 0; i < chars.length; i++) {
    lookup[chars.charCodeAt(i)] = i;
  }

  exports.encode = function(arraybuffer) {
    var bytes = new Uint8Array(arraybuffer),
    i, len = bytes.length, base64 = "";

    for (i = 0; i < len; i+=3) {
      base64 += chars[bytes[i] >> 2];
      base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
      base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
      base64 += chars[bytes[i + 2] & 63];
    }

    if ((len % 3) === 2) {
      base64 = base64.substring(0, base64.length - 1) + "=";
    } else if (len % 3 === 1) {
      base64 = base64.substring(0, base64.length - 2) + "==";
    }

    return base64;
  };

  exports.decode =  function(base64) {
    var bufferLength = base64.length * 0.75,
    len = base64.length, i, p = 0,
    encoded1, encoded2, encoded3, encoded4;

    if (base64[base64.length - 1] === "=") {
      bufferLength--;
      if (base64[base64.length - 2] === "=") {
        bufferLength--;
      }
    }

    var arraybuffer = new ArrayBuffer(bufferLength),
    bytes = new Uint8Array(arraybuffer);

    for (i = 0; i < len; i+=4) {
      encoded1 = lookup[base64.charCodeAt(i)];
      encoded2 = lookup[base64.charCodeAt(i+1)];
      encoded3 = lookup[base64.charCodeAt(i+2)];
      encoded4 = lookup[base64.charCodeAt(i+3)];

      bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
      bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
    }

    return arraybuffer;
  };
})();

},{}]},{},[3]);
