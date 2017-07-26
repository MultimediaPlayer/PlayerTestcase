const os = require("os");
const ip = require("ip");
const fs = require('fs');

const electron = require('electron');   // include electron
const electronApp = electron.app;                // give access to electron functions
 
const browserWindow = electron.BrowserWindow;   // electron window functions
const ipc = electron.ipcMain;                   // talk between the electron threads
 
const path = require('path'); // used by electron to load html files
const url = require('url');   // used by electron to load html files
 
const express = require('express');         // Includes the Express source code
const bodyParser = require('body-parser');  // Express middle-ware that allows parsing of post bodys
const hbs = require('hbs');                 // hbs is a Handlebars template renderer for Express
 
 
const Throttle = require('stream-throttle').Throttle;

const dateFormat = require('dateformat');



var win = {};
win['log'] 			= null;
win['allvideoobjs'] = null;
win['mainvideoobj'] = null;
win['ad0videoobj'] 	= null;
win['ad1videoobj']	= null;
win['adtrans']		= null;
win['config']		= null;


var expressServer = express(); // Active express object
 
var server = require('http').createServer(expressServer); // use the electron server to create a sockets io server
var io = require('socket.io')(server);          // create the sockets io server
 
 var connectedStatus = {
	port				: 0,
	addresses 			: [],
	connectedDevices	: 0,
	currentDeviceUA 	: "",
	devName 			: ""
 };
 
ipc.on('ipc-openwindow', function(event, w) { // listens for the player-control message from the update.js file
	if (win[w]) {
		win[w].createWindow(); 
		win[w].focusWindow();	
	}
})

function WINDOW(p, uiurl, w, h, r, c) {
	this.uiurl 	= uiurl;
	this.width 	= w;
	this.height	= h;
	this.winObj = null;
	this.onFocus = r;
	this.onClosed = c;
	
	this.createWindow = function () {
		var that = this;
		
		if (!this.winObj) {
			this.winObj = new browserWindow({
					parent: p,
					width: this.width, 
					height: this.height, 
					icon: 'ui/bitmaps/tv-512.png'
				}); 
		 
			this.winObj.on('focus', function() {
				if (that.onFocus) {
					that.onFocus(that.winObj);
				}
			});
			
			this.winObj.on('closed', function() { // reset the window object when it is closed
				if (that.onClosed) {
					that.onClosed(that.winObj);
				}
				that.winObj = null;
			});

			this.winObj.maximize();
			
			this.winObj.loadURL(url.format({ 
				pathname: path.join(__dirname, this.uiurl),
				protocol: 'file:',
				slashes: true
			}));	
		}
	}
	
	this.getWin = function() {
		return this.winObj;
	}
	
	this.closeWin = function() {
		if (this.winObj) {
			this.winObj.close();
		}
	}
	
	this.focusWindow = function() {
		if (this.winObj) {
			this.winObj.focus();
		}
	}

	this.sendToWindow = function(ipc, data)
	{
		if (this.winObj) {
			this.winObj.webContents.send(ipc, data);
		}
	}
	
	this.reload = function()
	{
		if (this.winObj) {
			this.winObj.reload();
		}
	}
};

function createWindows() {
	win['log'].createWindow();
	win['allvideoobjs'].createWindow();
	win['mainvideoobj'].createWindow();
	win['ad0videoobj'].createWindow();
	win['ad1videoobj'].createWindow();
	win['adtrans'].createWindow();
	win['config'].createWindow();
}

function updateUI() {
	sendConnectionStatus("");
}

function mainUIClosed() {
	win['allvideoobjs'].closeWin();
	win['mainvideoobj'].closeWin();
	win['ad0videoobj'].closeWin();
	win['ad1videoobj'].closeWin();
	win['adtrans'].closeWin();
	win['config'].closeWin();
}

function init() {
	var p;
	
	win['log'] 			= new WINDOW(null,	'ui/ui.html',		1200,	640,	updateUI,	mainUIClosed);
	
	p = win['log'].getWin();
	
	win['allvideoobjs'] = new WINDOW(p,	'ui/graph.html',		1400,	700,	null,			null);
	win['mainvideoobj'] = new WINDOW(p,	'ui/singlegraph.html',	1400, 	800,	null,			null);
	win['ad0videoobj']	= new WINDOW(p,	'ui/graphAdVid0.html', 	1400, 	800,	null,			null);
	win['ad1videoobj']	= new WINDOW(p,	'ui/graphAdVid1.html', 	1400, 	800,	null,			null);
	win['adtrans']		= new WINDOW(p,	'ui/adtransgraph.html',	800, 	800,	null,			null);
	win['config']		= new WINDOW(p,	'ui/config.html',		800, 	800,	null,			null);

	win['log'].createWindow();
	
	
	var interfaces = os.networkInterfaces();

	for (var k in interfaces) {
		for (var k2 in interfaces[k]) {
			var address = interfaces[k][k2];
			if (address.family === 'IPv4' && !address.internal) {
				connectedStatus.addresses.push(address.address);
			}
		}
	}
	
	sendServerLog("Server (IPv4) Addresses");
	sendServerLog("-----------------------");

	connectedStatus.port = server.address().port;
	for( var i = 0; i < connectedStatus.addresses.length; i++) {
		sendServerLog(i + ": " + connectedStatus.addresses[i] + ":" + connectedStatus.port);
	}
	
	sendConnectionStatus();
}
 
electronApp.on('ready', init); 
 
electronApp.on('window-all-closed', function() { // if this is running on a mac closing all the windows does not kill the application
    if (process.platform !== 'darwin')
        electronApp.quit();
});
 
expressServer.on('activate', function() {
});
 
io.sockets.on('connection', function(socket) { // listen for a device connection to the server
	connectedStatus.connectedDevices++;

    console.log(" ---> Device connected: " + connectedStatus.connectedDevices);
	connectedStatus.devName = extractDevName(connectedStatus.currentDeviceUA);
	sendConnectionStatus();
	
	socket.on('bufferEvent', function(data) {
		win['log'].sendToWindow('ipc-buffer', data);
		win['allvideoobjs'].sendToWindow('ipc-buffer', data);
		win['mainvideoobj'].sendToWindow('ipc-buffer', data);
		win['ad0videoobj'].sendToWindow('ipc-buffer', data);
		win['ad1videoobj'].sendToWindow('ipc-buffer', data);
		
		//console.log(data);
	});
	
	socket.on('playbackOffset', function(data) {
		win['log'].sendToWindow('ipc-playbackOffset', data);
		//console.log(data);
	});
	
	socket.on('disconnect', function () {
		if (connectedStatus.connectedDevices > 0) {
			connectedStatus.connectedDevices--;
		}
		
		connectedStatus.currentDeviceUA = "";
		connectedStatus.devName = "";

		sendConnectionStatus();

	console.log(" ---> Device disconnected: " + connectedStatus.connectedDevices);
	});
});

expressServer.use(express.static('public')); // put static files in the public folder to make them available on web pages
expressServer.use(bodyParser.urlencoded({ extended: false })); 
expressServer.use(bodyParser.text({type: 'text/plain'})); 
expressServer.use(bodyParser.json());

//expressServer.use(express.static('views'));
expressServer.use('/common', express.static('common'));
expressServer.use('/css', express.static('views/css'));
expressServer.use('/bitmaps', express.static('views/bitmaps'));
expressServer.use('/js', express.static('views/js'));
expressServer.use('/playlists', express.static('playlists'));
  
expressServer.set('view-engine', 'hbs'); 

expressServer.post('/log', function(req, res) {
	win['log'].sendToWindow('ipc-log', req.body); // send the async-body message to the rendering thread
	//console.log(req.body);
    res.send(); // Send an empty response to stop clients from hanging
});

function sendServerLog(msg) {
	var logObj = { 
					'cssClass': 'debug', 
					'logText': 	"--- SERVER: " + msg + " ---"
				 };
				 
	console.log("* " + msg);
	win['log'].sendToWindow('ipc-log', logObj); 
} 

expressServer.post('/status', function(req, res) {
	win['log'].sendToWindow('ipc-status', req.body); // send the async-body message to the rendering thread
	//console.log(req.body);
    res.send(); // Send an empty response to stop clients from hanging
});

expressServer.post('/adtrans', function(req, res) {
	win['adtrans'].sendToWindow('ipc-adtrans', req.body); // send the async-body message to the rendering thread
	//console.log(req.body);
    res.send(); // Send an empty response to stop clients from hanging
});

expressServer.get('/', function(req, res) {
	var UA = req.headers['user-agent'];
	
	if (!connectedStatus.currentDeviceUA || connectedStatus.currentDeviceUA === UA) {
		connectedStatus.currentDeviceUA = UA;
		connectedStatus.devName = extractDevName(connectedStatus.currentDeviceUA);
		
		//createWindows();
		
		win['log'].reload();
		win['allvideoobjs'].reload();
		win['mainvideoobj'].reload();
		win['ad0videoobj'].reload();
		win['ad1videoobj'].reload();
		win['adtrans'].reload();
		
		res.render('index.hbs', function(err, html) { // render the dash playback file using the title and src variables to setup page
			res.status(200);
			res.send(html);
			//console.log("UserAgent: " + req.headers['user-agent']);
			//console.log(JSON.stringify(req.headers));
		});
		
	} else {
			res.status(503);
			res.send("Sorry, another device is already attached.  Please disconnect it and try again.");	
	}
});

expressServer.get('/player.aitx', function(req, res) {
	res.render('playerait.hbs', {url: req.headers.host}, function(err, html) { 
		res.type("application/vnd.dvb.ait+xml");
		res.status(200);
        res.send(html);
    });
});

var badNetwork = {
	chanceOfError		: 10, 						// 1 in x 505 errors
	bSimErrors			: false,
	throttleBitrate		: 2 * 1024,					// kbps (bits)
	bThrottle			: false,
	delayLicense		: 0
};

expressServer.get('/content/*', function(req, res) {
	// Why seeing 2 gets????
	
	sendServerLog("GET content: " + req.originalUrl);
	//console.log(JSON.stringify(req.headers));

	// ***** Simulate error condition (505)? *****
	if (badNetwork.bSimErrors) {
		var rndErr = Math.floor(Math.random() * (badNetwork.chanceOfError-1));
		
		if (rndErr === 0) {
			// Simulate error (505)
			sendServerLog("SIMULATE ERROR! (505)");
			return res.sendStatus(505);
		}
	}

	// Get file on server
	var file = path.join(__dirname, req.originalUrl);
	//console.log(" - file: " + file);
	
    fs.stat(file, function(err, stats) {
		if (err) {
			if (err.code === 'ENOENT') {
				// 404 Error if file not found
				console.log(" * file does not exist");
				return res.sendStatus(404);
			}
			res.end(err);
		}
		
		var range = req.headers.range;

		var start;
		var end;
		var chunksize;
		var total = stats.size;
		var rtn = 200;
		
		if (range) {
			var positions = range.replace(/bytes=/, "").split("-");
			start = parseInt(positions[0], 10);
			end = positions[1] ? parseInt(positions[1], 10) : total - 1;

			console.log(" - range: " + range);
			console.log(" - positions: " + positions);
		} else {
			start = 0;
			end = total - 1;		
		}

		chunksize = (end - start) + 1;

		//console.log(" - total: " + total);

		//console.log(" - start: " + start);
		//console.log(" - end: " + end);
		//console.log(" - chunksize: " + chunksize);

		if ((chunksize+start) < total) {
			rtn = 206;
		} 
		//console.log(" - rtn: " + rtn);
		
		if (start >= end) {
			console.log(" * Error: start >= end!");
			return res.sendStatus(400);				
		}

		res.writeHead(rtn, {
			"Content-Range": "bytes " + start + "-" + end + "/" + total,
			"Accept-Ranges": "bytes",
			"Content-Length": chunksize,
			"Content-Type": "video/mp4"
		});			

		var stream = fs.createReadStream(file, { start: start, end: end })
			.on("open", function() {
				//console.log(" - send chunk");
				if (badNetwork.bThrottle) {
					stream.pipe(new Throttle({rate: badNetwork.throttleBitrate * 1024 / 8, chunksize: 2048 * 1024})).pipe(res);
					sendServerLog("Throttle server: " + badNetwork.throttleBitrate + "(kbps)");
				} else {
					stream.pipe(res);				
				}
			}).on("error", function(err) {
				res.sendStatus(400);
				res.end(err);
			});
	});
	
});
 
expressServer.get('/dynamic/*', function(req, res) {
	var progStart;
	var d = new Date();
	var utcHours = d.getUTCHours();	
	var utcMinutes = d.getUTCMinutes();
	var useURL = req.originalUrl;
	var bDARTest = false;
	var options = {};
	
	sendServerLog("GET dynamic: " + useURL);

	console.log("Minutes - " + utcMinutes + "M");
	
	if (req.originalUrl == "/dynamic/dartest") {
		console.log("*** DAR Test ***");
		useURL = "dynamic/live-mperiods-1hr.mpd";
		bDARTest = true;
	}
	
	// Get file on server
	var file = path.join(__dirname, useURL + ".hbs");
	console.log(" - file: " + file);

	fs.stat(file, function(err, stats) {
		if (err) {
			if (err.code === 'ENOENT') {
				// 404 Error if file not found
				console.log(" * file does not exist");
				return res.sendStatus(404);
			}
			res.end(err);
		}

		d.setUTCMinutes(0);
		d.setUTCSeconds(0);
		progStart = dateFormat(d.toUTCString(), "isoDateTime");
		//console.log("progStart: " + progStart);
		
		options.availabilityStartTime = progStart;
		
		if (bDARTest) {
			// TODO put these constants somewhere else!!!!
			const periodD 	= 599040;
			const segsize 	= 3840;
			const maxP 		= 5;
			const marginF 	= 3;
			const marginB 	= 10;
			const tweakF	= (60 * 1000);
			const adD		= (2 * 60 * 1000);
			
			var currentP 	= getPeriod(utcMinutes * 60 * 1000, periodD, maxP);
			var lowerP 		= getPeriod((utcMinutes - marginB) * 60 * 1000, periodD, maxP);
			var upperP 		= getPeriod((utcMinutes + marginF) * 60 * 1000, periodD, maxP);
			var numP = (upperP - lowerP) + 1;
			var tw;
			
			console.log("CurrentPeriod: " + currentP);
			
			for (var i = lowerP; i <= upperP; i++) {
				if (((numP > 1) && (i == upperP) && (upperP < maxP)) || (upperP == 0)) {
					tw = tweakF;
				} else {
					tw = 0;
				}
				options['period' + i] = makeAdAndMainPeriods(i, periodD, adD, segsize, tw);
			}
			/* All periods....
			for (var i = 0; i <= 5; i++) {
				tw = 0;
				options['period' + i] = makeAdAndMainPeriods(i, periodD, adD, segsize, tw);
			}
			*/
		}
		
		res.render(file, options, function(err, mpd) { 
			if (err) {
				res.end(err);
			}
			
			res.type("application/dash+xml");
			res.status(200);
			res.send(mpd);
		});
    });
});

getPeriod = function(m, d, mx) {
	if (m < 0) { 
		m = 0; 
	}
	
	var p = Math.floor(m / d);
	if (p > mx) {
		p = mx;
	}
	
	return p;
}

/*
makePeriod = function(p, d, sz, tw) {
	var fd = new Date(d-tw);
	var fs = new Date(p * d);
	var seg = (p * d) / sz;
	
	var sDuration = _formatTime(fd);
	var sStart =  	_formatTime(fs);
	
	sendServerLog(" - Generated manifest file: Period: " + p + " Duration: " + sDuration + " Start: " + sStart);
	return mainContentXML(sDuration, sStart, seg);
}
*/

makeAdAndMainPeriods = function(p, periodD, adD, sz, tw) {
	var str;

	var fadD = new Date(adD);
	var fsAd = new Date(p * periodD);
	
	var sAdDuration = _formatTime(fadD);
	var sAdStart 	= _formatTime(fsAd);
	
	sendServerLog(" - Generated manifest file: Period: " + p);
	sendServerLog(" -  Ad: Duration: " + sAdDuration + " Start: " + sAdStart);

	str = adXML(p, sAdDuration, sAdStart);

	var fd = new Date(periodD-tw-adD);
	var fs = new Date((p * periodD) + adD);
	var seg = Math.floor(((p * periodD) + adD) / sz);
	
	var sDuration 	= _formatTime(fd);
	var sStart 		= _formatTime(fs);
	var offsetS  	= _getSecs(fs);
	
	sendServerLog(" -  Main: Duration: " + sDuration + " Start: " + sStart + " (" + offsetS + "S)");

	str += "\n";
	str += mainContentXML(p, sDuration, sStart, offsetS, seg);
	
	return str;
}

_formatTime = function(d) {
	return "PT" + d.getHours() + "H" + d.getMinutes() + "M" + d.getSeconds() + "." + d.getMilliseconds() + "S";
}

_getSecs = function(d) {
		return ((((d.getHours() * 60) + d.getMinutes()) * 60) + d.getSeconds()) /* + (d.getMilliseconds() / 1000) */;
}

mainContentXML = function(p, sDuration, sStart, offset, seg) {
	var str;
	
	str = "<!-- *** Generated Period: Main Content *** -->\n";
	
	//str += "<Period id=\"main-" + p + "\" duration=\"" + sDuration + "\" start=\"" + sStart + "\">\n";
	str += "<Period id=\"main-" + p + "\" start=\"" + sStart + "\">\n";
	
	str += " <AdaptationSet startWithSAP=\"2\" segmentAlignment=\"true\" id=\"1\" sar=\"1:1\" mimeType=\"video/mp4\" >\n" +
		"  <SupplementalProperty schemeIdUri=\"urn:mpeg:dash:period_continuity:2014\" value=\"ad-" + p + "\" />\n" +
		"  <Role schemeIdUri=\"urn:mpeg:dash:role:2011\" value=\"main\"/>\n" +
		"  <BaseURL>../content/testcard/avc3-events/</BaseURL>\n" + 
		"  <SegmentTemplate presentationTimeOffset=\"" + offset + "\" startNumber=\"" + seg + "\" timescale=\"1000\" duration=\"3840\" media=\"$RepresentationID$/$Number%06d$.m4s\" initialization=\"$RepresentationID$/IS.mp4\" />\n" +
		"  <Representation id=\"704x396p50\" codecs=\"avc3.64001f\" height=\"396\" width=\"704\" frameRate=\"50\" scanType=\"progressive\" bandwidth=\"1572456\"/>\n" +
		"  <Representation id=\"512x288p25\" codecs=\"avc3.4d4015\" height=\"288\" width=\"512\" frameRate=\"25\" scanType=\"progressive\" bandwidth=\"440664\"/>\n" +
		"  <Representation id=\"384x216p25\" codecs=\"avc3.42c015\" height=\"216\" width=\"384\" frameRate=\"25\" scanType=\"progressive\" bandwidth=\"283320\"/>\n" + 
		"  <Representation id=\"704x396p25\" codecs=\"avc3.4d401e\" height=\"396\" width=\"704\" frameRate=\"25\" scanType=\"progressive\" bandwidth=\"834352\"/>\n" +
		" </AdaptationSet>\n" +
		" <AdaptationSet startWithSAP=\"2\" segmentAlignment=\"true\" id=\"3\" codecs=\"mp4a.40.2\" audioSamplingRate=\"48000\" lang=\"eng\" mimeType=\"audio/mp4\" >\n" +
		"  <SupplementalProperty schemeIdUri=\"urn:mpeg:dash:period_continuity:2014\" value=\"ad-" + p + "\" />\n" +
		"  <AudioChannelConfiguration schemeIdUri=\"urn:mpeg:dash:23003:3:audio_channel_configuration:2011\" value=\"2\"/>\n" +
		"  <Role schemeIdUri=\"urn:mpeg:dash:role:2011\" value=\"main\"/>\n" +
		"  <BaseURL>../content/testcard/audio/</BaseURL>\n" +
		"  <SegmentTemplate presentationTimeOffset=\"" + offset + "\" startNumber=\"" + seg + "\" timescale=\"1000\" duration=\"3840\" media=\"$RepresentationID$/$Number%06d$.m4s\" initialization=\"$RepresentationID$/IS.mp4\" />\n" +
		"  <Representation id=\"128kbps\" bandwidth=\"128000\" />\n" +
		" </AdaptationSet>\n" +
		"</Period>\n";
		
	return str;
}

adXML = function(p, sDuration, sStart) {
	var str;
	var pc = "";
	
	str = "<!-- *** Generated Period: Ad *** -->\n";
	
	if (p > 0) {
		pc = "  <SupplementalProperty schemeIdUri=\"urn:mpeg:dash:period_continuity:2014\" value=\"main-" + (p-1) + "\" />\n";	
	}
	
	// str += "<Period id=\"ad-" + p + "\" duration=\"" + sDuration + "\" start=\"" + sStart + "\">\n";
	str += "<Period id=\"ad-" + p + "\" start=\"" + sStart + "\">\n";
	
	str += " <AdaptationSet startWithSAP=\"2\" segmentAlignment=\"true\" id=\"1\" sar=\"1:1\" frameRate=\"25\" scanType=\"progressive\" mimeType=\"video/mp4\" >\n" +
		pc + 
		"  <BaseURL>../content/bigbuckbunny/avc3/</BaseURL>\n" +
		"  <SegmentTemplate timescale=\"1000\" duration=\"3840\" media=\"$RepresentationID$/$Number%06d$.m4s\" initialization=\"1920x1080p25/IS.mp4\" />\n" +
		"  <Representation id=\"1920x1080p25\" codecs=\"avc3.640028\" height=\"1080\" width=\"1920\" bandwidth=\"4741120\" />\n" +
		"  <Representation id=\"896x504p25\" codecs=\"avc3.64001f\" height=\"504\" width=\"896\" bandwidth=\"1416688\" />\n" +
		"  <Representation id=\"704x396p25\" codecs=\"avc3.4d401e\" height=\"396\" width=\"704\" bandwidth=\"843768\" />\n" +
		"  <Representation id=\"512x288p25\" codecs=\"avc3.4d4015\" height=\"288\" width=\"512\" bandwidth=\"449480\" />\n" +
		"  <Representation id=\"1280x720p25\" codecs=\"avc3.640020\" height=\"720\" width=\"1280\" bandwidth=\"2656696\" />\n" +
		" </AdaptationSet>\n" +
		" <AdaptationSet startWithSAP=\"2\" segmentAlignment=\"true\" id=\"3\" codecs=\"mp4a.40.2\" audioSamplingRate=\"48000\" lang=\"eng\" mimeType=\"audio/mp4\" >\n" +
		pc + 
		"  <AudioChannelConfiguration schemeIdUri=\"urn:mpeg:dash:23003:3:audio_channel_configuration:2011\" value=\"2\"/>\n" +
		"  <BaseURL>../content/bigbuckbunny/audio/</BaseURL>\n" +
		"  <SegmentTemplate timescale=\"1000\" duration=\"3840\" media=\"$RepresentationID$/$Number%06d$.m4s\" initialization=\"160kbps/IS.mp4\" />\n" +
		"  <Representation id=\"160kbps\" bandwidth=\"160000\" />\n" +
		"  <Representation id=\"96kbps\" bandwidth=\"96000\" />\n" +
		"  <Representation id=\"128kbps\" bandwidth=\"128000\" />\n" +
		" </AdaptationSet>\n" +
		"</Period>\n";

	return str;
}

expressServer.post('/savelog', function(req, res) {
	console.log("/savelog: " + req.query.filename);
    res.send(); // Send an empty response to stop clients from hanging

	fs.writeFile("./logs/" + req.query.filename, req.body, function(err) {
		if(err) {
			console.log(err);
		}
	});
});
 
const clearKeyLicense = require('./clearKey/itv-licence.json');

expressServer.post('/getkeys', function(req, res) {
	sendServerLog("getkeys: " + JSON.stringify(req.body));
	
	setTimeout(function() {
		res.status(200);
		res.send(clearKeyLicense);
	}, badNetwork.delayLicense);
   
});

function sendConnectionStatus() {
	var obj = { 
					'port'			: connectedStatus.port,
					'addresses'		: connectedStatus.addresses, 
					'bConnected'	: (connectedStatus.connectedDevices > 0),
					'devName'		: connectedStatus.devName
				};
				 
	win['log'].sendToWindow('ipc-connected', obj); 
} 

 
server.listen(3000); // Socket.io port (hides express inside)

// Put in a util module!!!!! 
extractDevName = function (sUA) {
	var arr = sUA.match(/\bFVC\/[0-9]+.[0-9]+ \(\s*(\w*);\s*(\w*)/) || ["", "Unknown", "Model"]; 
	return arr[1] + arr[2];
}
