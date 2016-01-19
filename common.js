function abd_getHeader(headers, name){
	var i = abd_getHeaderIndex(headers, name);
	if(isset(i))
		return headers[i].value;
}

function abd_getHeaderIndex(headers, name){
	name = name.toLowerCase();
    if(isArray(headers)){
        for(var i=0; i<headers.length; ++i){
            var h = headers[i];
            if((h[0] || h.name).toLowerCase() == name)
                return i;
        }
    }else{
        if(isset(headers[name]))
            return name;
        for(var hname in headers){
        	if(hname.toLowerCase() == name)
        		return hname;
        }
    }
}

function isset(x){
    return typeof(x) != 'undefined';
}

/**
 *  Проверяет, является ли объект массивом
 */
function isArray(arr){
	return Object.prototype.toString.call( arr ) === '[object Array]';
}

function isObject(arr){
	return Object.prototype.toString.call( arr ) === '[object Object]';
}

var OPTION_DEFAULT_CHARSET = "defaultCharset", //String
    OPTION_FORCE_CHARSET = "forceCharset", //String
    OPTION_REQUEST_CHARSET = "requestCharset", //String
    OPTION_SSL_ENABLED_PROTOCOLS = "sslEnabledProtocols", //[string, string,...]
    DEFAULT_CHARSET = "windows-1251",
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