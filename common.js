function abd_getHeader(headers, name){
	name = name.toLowerCase();
	const ret = abd_forEach(headers, (hobj) => hobj.name.toLowerCase() === name ? hobj.value : undefined);
	return ret[0]; //Вернется индекс или undefined
}

function abd_getHeaderIndex(headers, name){
	name = name.toLowerCase();
	const ret = abd_forEach(headers, (hobj, idx) => hobj.name.toLowerCase() === name ? idx : undefined);
	return ret[0]; //Вернется индекс или undefined
}

function abd_checkHeaders(headers){
	abd_forEach(headers, hobj => {
		if(typeof(hobj.name) !== 'string')
			throw new Error(`Header ${hobj.name} is not a string, it is ${typeof(hobj.name)}`);
		if(!/^[\x21-\x7E]+$/.test(hobj.name) || /[()<>@,;:\\\/\[\]?={}]/.test(hobj.name))
			throw new Error(`Header ${hobj.name} contains invalid characters!`);
		if(hobj.value !== null) {
			if (typeof (hobj.value) !== 'string')
				throw new Error(`Header ${hobj.name} value should be string, but it is ${typeof (hobj.value)}: ${JSON.stringify(hobj.value)}`);
			if (!/^[\x20-\x7E]*$/.test(hobj.value))
				throw new Error(`Header ${hobj.name} value contains non US-ASCII characters: ${JSON.stringify(hobj.value)}`);
		}
	});
}

function abd_forEach(headers, func, forceAll){
	const ret = [];
	if(isArray(headers)){
		for(var i=0; i<headers.length; ++i){
			var h = headers[i];
			const hobj = {name: h[0] || h.name, value: h[1] !== undefined ? h[1] : h.value};
			const res = func(hobj, i);
			if(res !== undefined){
				ret.push(res);
				if(!forceAll)
					return ret;
			}
		}
	}else{
		for(let name in headers){
			const hobj = {name, value: headers[name]};
			const res = func(hobj, name);
			if(res !== undefined){
				ret.push(res);
				if(!forceAll)
					return ret;
			}
		}
	}
	return ret;
}

function isset(x){
    return typeof(x) != 'undefined';
}

/**
 *  Проверяет, является ли объект массивом
 */
function isArray(arr){
	return Array.isArray(arr);
}

function isObject(arr){
	return Object.prototype.toString.call( arr ) === '[object Object]';
}

const OPTION_DEFAULT_CHARSET = "defaultCharset", //String
    OPTION_FORCE_CHARSET = "forceCharset", //String
    OPTION_REQUEST_CHARSET = "requestCharset", //String
    OPTION_SSL_ENABLED_PROTOCOLS = "sslEnabledProtocols", //[string, string,...]
    DEFAULT_CHARSET = "utf-8",
	OPTION_MANUAL_REDIRECTS = "manualRedirects",
    OPTION_HTTP_METHOD = "httpMethod";

function abd_getOption(options, option, domain){
	var domains = options.perDomain;
	if(!domains || !domain)
		return options[option];

	//Если такой домен есть и там есть эта опция, возвращаем прям его
	var domainO = domains[domain];
	if(domainO && isset(domainO[option]))
		return domainO[option];

	//В противном случае придется матчить регулярными выражениями, а они берутся в /
	for(var dom in domains){
		var matches = dom.match(/^\/(.*)\/$/);
		if(!matches)
			continue; //ЭТо не паттерн
		var re = new RegExp(matches[1], 'i');
		if(re.test(domain)){
			domainO = domains[dom];
			if(domainO && isset(domainO[option]))
				return domainO[option];
		}
	}

	return options[option];
}
