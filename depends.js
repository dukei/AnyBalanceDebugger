var g_abd_configs = [];
var g_script_load_statuses = {};

function loadConfigs(){
	var path = window.location.href;
	path = path.replace(/\?.*$/, '').replace(/[^\/]*$/, '');
	var paths = [];
	do{
		paths.push(path);
		path = path.replace(/[^\/]+\/?$/i, '');
	}while(!/:\/\/+$/i.test(path)); //Строгаем пути, пока до домена не доберёмся.

	g_abd_configs = [];
	ipt_load_statuses = {};
	for(var i=0; i<paths.length; ++i){
		loadScript(paths[i] + '_debug-config.jsonp');
	}
}

function loadScript(path){
	var status = g_script_load_statuses[path] = {};

  	var script=document.createElement('script');
  	script.type='text/javascript';
  	script.onload = function(){
  		status[path] = 1;
  	};
  	script.onerror = function(){
  		status[path] = -1;
  	};
  	script.src=path;
  	
  	$("body").append(script);
}