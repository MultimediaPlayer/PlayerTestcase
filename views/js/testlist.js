window.getTestlist = function (testlistReadyCallback) {

	var url = "./playlists/testlist.json";


	mVid.Log.info("Get Testlist - url: " + url);
	
	function callback(json, xhr) {
		try {
			//var testlistObj = JSON.parse(json);
			//log(JSON.stringify(playlistObj));
			testlistReadyCallback && testlistReadyCallback(json);
		} catch(e) {
			mVid.Log.error(e);			
		}
	}

	function ajax(url, callback, x) {
		try {
			x = new (this.XMLHttpRequest || ActiveXObject)('MSXML2.XMLHTTP.3.0');
			x.open('GET', url, 1);
			x.setRequestHeader('Content-type', 'application/json');
			x.onreadystatechange = function() {
				x.readyState > 3 && callback && callback(x.responseText, x);
			};
			x.send();
		} catch (e) {
			mVid.Log.error(e);
		}
	};

	ajax(url, callback);
}