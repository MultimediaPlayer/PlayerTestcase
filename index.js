const electron = require('electron');   // include electron
const electronApp = electron.app;                // give access to electron functions
 
const browserWindow = electron.BrowserWindow;   // electron window functions
const ipc = electron.ipcMain;                   // talk between the electron threads
 
const path = require('path'); // used by electron to load html files
const url = require('url');   // used by electron to load html files
 
const express = require('express');         // Includes the Express source code
const bodyParser = require('body-parser');  // Express middle-ware that allows parsing of post bodys

const fs = require('fs');
 
const Throttle = require('stream-throttle').Throttle;

const ip = require("ip");

var win = {};
win['log'] 			= null;
win['allvideoobjs'] 	= null;
win['mainvideoobj'] 	= null;
win['ad0videoobj'] 			= null;
win['ad1videoobj']			= null;
win['adtrans']		= null;


var expressServer = express(); // Active express object
 
var server = require('http').createServer(expressServer); // use the electron server to create a sockets io server
var io = require('socket.io')(server);          // create the sockets io server
 
 var connectedStatus = {
	connectedDevices	: 0,
	currentDeviceUA 	: "",
	serverIP 			: "",
	devName 			: ""
 };
 
ipc.on('ipc-openwindow', function(event, w) { // listens for the player-control message from the update.js file
	if (win[w]) {
			win[w].createWindow(); 		
	}
})

function WINDOW(uiurl, w, h) {
	this.uiurl 	= uiurl;
	this.width 	= w;
	this.height	= h;
	this.winObj = null;
	
	this.createWindow = function () {
		var that = this;
		
		if (!this.winObj) {
			this.winObj = new browserWindow({width: this.width, height: this.height, icon: 'bitmaps/tv-512.png'}); 
		 
			this.winObj.loadURL(url.format({ 
				pathname: path.join(__dirname, this.uiurl),
				protocol: 'file:',
				slashes: true
			}));
		 
			this.winObj.on('closed', function() { // reset the window object when it is closed
				that.winObj = null;
			});
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
}

function init() {
	win['log'] 			= new WINDOW('ui/ui.html',				1200,	640);
	win['allvideoobjs'] = new WINDOW('ui/graph.html',			1400,	700);
	win['mainvideoobj'] = new WINDOW('ui/singlegraph.html',		1400, 	800);
	win['ad0videoobj']	= new WINDOW('ui/graphAdVid0.html', 	1400, 	800);
	win['ad1videoobj']	= new WINDOW('ui/graphAdVid1.html', 	1400, 	800);
	win['adtrans']		= new WINDOW('ui/adtransgraph.html',	800, 	800);

	win['log'].createWindow();
	
	connectedStatus.serverIP = ip.address() + ":" + server.address().port;
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

var badNetwork = {
	chanceOfError		: 10, 						// 1 in x 505 errors
	bSimErrors			: false,
	throttleBitrate		: 2 * 1024,					// kbps (bits)
	bThrottle			: false
};

expressServer.get('/content/*', function(req, res) {
	// Why seeing 2 gets????
	
	sendServerLog("GET content: " + req.originalUrl);
	sendServerLog(JSON.stringify(req.headers));

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

		console.log(" - total: " + total);

		console.log(" - start: " + start);
		console.log(" - end: " + end);
		console.log(" - chunksize: " + chunksize);

		if ((chunksize+start) < total) {
			rtn = 206;
		} 
		console.log(" - rtn: " + rtn);
		
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
				console.log(" - send chunk");
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
	
	res.status(200);
	res.send(clearKeyLicense);
});

function sendConnectionStatus() {
	var obj = { 
					'serverIP'		: connectedStatus.serverIP, 
					'bConnected'	: (connectedStatus.connectedDevices > 0),
					'devName'		: connectedStatus.devName
				};
				 
	win['log'].sendToWindow('ipc-connected', obj); 
} 

 
server.listen(3000); // Socket.io port (hides express inside)


// Put in a util module!!!!! 
extractDevName = function (sUA) {
	var arr = sUA.match(/\bFVC\/[0-9]+.[0-9]+ \((\w*);(\w*)/) || ["", "Unknown", "Model"]; 
	return arr[1] + arr[2];
}
