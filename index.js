var log4js = require("log4js");
log4js.configure({
  appenders: {
    out: { type: 'stdout' },//设置是否在控制台打印日志
    info: { type: 'file', filename: './logs/info.log' }
  },
  categories: {
    default: { appenders: [ 'out', 'info' ], level: 'all' }//去掉'out'。控制台不打印日志
  }
});
var logger = log4js.getLogger();
logger.level = "debug";

const os = require("os");
const fs = require("fs");

const electron = require("electron");
const express = require("express");

const argv = require("minimist")(process.argv.slice(2));

var GUI         = null;
var guiWindow   = null;
var guiIPC      = null;

if (!argv.headless && !argv.multidevs) {
    GUI         = electron.app;
    guiWindow   = electron.BrowserWindow;
    guiIPC      = electron.ipcMain;
}


const path = require("path");
const url = require("url");

const bodyParser = require("body-parser");

const hbs = require("hbs");

const Throttle = require("stream-throttle").Throttle;

const dateFormat = require("dateformat");

const UTILS = require("./common/utils.js");
var commonUtils = new UTILS();

const CONFIG = require("./common/configobj.js");
var commonConfig = new CONFIG();

const mp4boxModule = require("mp4box");


var win = {};
win["log"]          = null;
win["allvideoobjs"] = null;
win["mainvideoobj"] = null;
win["ad0videoobj"]  = null;
win["ad1videoobj"]  = null;
win["adtrans"]      = null;
win["config"]       = null;


var expressSrv = express(); // Active express object

var generalInfo = {
    port                : 0,
    bHTTPSEnabled       : false,
    httpsPort           : 0,
    serverAddresses     : [],
    connectedDevices    : 0,
    currentDeviceUA     : "",
    devName             : "",
    version             : require("./version.json")
};


var http = require("http").createServer(expressSrv);
var https;

try {
    const httpsOpts = {
        key: fs.readFileSync("ssl/server/private/refPlayer.key.pem"),
        cert: fs.readFileSync("ssl/server/certs/refPlayer.cert.pem")
    };
    generalInfo.bHTTPSEnabled = true;
    https = require("https").createServer(httpsOpts, expressSrv);
} catch (error) {
    https = require("https").createServer(expressSrv);
}


const ioLib = require("socket.io");

var ioHttp  = ioLib(http);
var ioHttps = ioLib(https);


if (guiIPC) {

    guiIPC.on("ipc-openwindow", function(event, w) {
        if (win[w]) {
            win[w].createWindow();
            win[w].focusWindow();
        }
    });

    guiIPC.on("ipc-get-config", function(event, w) {
        sendConfig();
    });

    guiIPC.on("ipc-set-config", function(event, w) {
        commonConfig._setProps(w);
    });

    guiIPC.on("ipc-get-connectionstatus", function(event, w) {
        sendConnectionStatus();
    });

}

function WINDOW(p, uiurl, w, h, r, c, bMax) {
    var self = this;

    self.uiurl  = uiurl;
    self.width  = w;
    self.height = h;
    self.winObj = null;
    self.onFocus = r;
    self.onClosed = c;

    self.createWindow = function () {

        if (!GUI) {
            return;
        }

        if (!self.winObj) {
            self.winObj = new guiWindow({
                parent: p,
                width: self.width,
                height: self.height,
                icon: "ui/bitmaps/tv-512.png"
            });

            // TODO: doesn't work :( - see https://github.com/electron/electron/issues/7779

            self.winObj.on("closed", function() { // reset the window object when it is closed
                if (self.onClosed) {
                    self.onClosed(self.winObj);
                }
                self.winObj = null;
            });

            if (bMax) {
                self.winObj.maximize();
            }

            self.winObj.loadURL(url.format({
                pathname: path.join(__dirname, self.uiurl),
                protocol: "file:",
                slashes: true
            }));
        }
    };

    this.getWin = function() {
        return this.winObj;
    };

    this.closeWin = function() {
        if (this.winObj) {
            this.winObj.close();
        }
    };

    this.focusWindow = function() {
        if (this.winObj) {
            this.winObj.focus();
        }
    };

    this.sendToWindow = function(guiIPC, data)
    {
        if (this.winObj) {
            this.winObj.webContents.send(guiIPC, data);
        }
    };

    this.reload = function()
    {
        if (this.winObj) {
            this.winObj.reload();
        }
    };
}

/* Not used */
/*
function createWindows() {
    win["log"].createWindow();
    win["allvideoobjs"].createWindow();
    win["mainvideoobj"].createWindow();
    win["ad0videoobj"].createWindow();
    win["ad1videoobj"].createWindow();
    win["adtrans"].createWindow();
    win["config"].createWindow();
}
*/

function mainUIClosed() {
    win["allvideoobjs"].closeWin();
    win["mainvideoobj"].closeWin();
    win["ad0videoobj"].closeWin();
    win["ad1videoobj"].closeWin();
    win["adtrans"].closeWin();
    win["config"].closeWin();
}

var runOptions = {};



function init() {
    var p;
    var v = generalInfo.version;
    var i;
    
    runOptions.bMultiDevs           = !GUI;
    runOptions.bSegDump             = argv.segdump;
    runOptions.bEventAbs            = argv.eventabs;
    runOptions.logLevel             = argv.loglevel;
    runOptions.timeOffset           = argv.timeoffset;
    runOptions.prependContentPath   = argv.pathprepend;

    if (runOptions.logLevel) {
        logger.level = runOptions.logLevel;
        logger.info("--setting log level to: " + runOptions.logLevel);
    }

    if (argv.help) {
        logger.info("--headless         : Run with no GUI.");
        logger.info("--segdump          : Dump segment information.");
        logger.info("--loglevel=[n]     : Set log level, where n = \"trace\", \"debug\", \"info\", \"warn\", \"error\" or \"fatal\".");
        logger.info("--timeoffset=[t]   : Used by dynamic dash manifests, adds 't' seconds to server time.");
        if (GUI) {
            GUI.quit();
        }
        process.exit();
        return;
    }

    logger.info("--------------------------------------------------");
    logger.info(v.title + " v" + v.major + "." + v.minor);
    logger.info("   " + (v.dev === "true" ? "Dev" : "Formal") + " Release");
    logger.info("--------------------------------------------------");
    logger.info("");
    logger.info(v.comment);
    logger.info("");
    for (i = 0; i < v.notes.length; i++) {
        logger.info(" - " + v.notes[i]);
    }
    logger.info("");
    logger.info("--------------------------------------------------");
    logger.info("");

    fs.existsSync("logs") || fs.mkdirSync("logs");

    if (runOptions.prependContentPath) {
        var c = runOptions.prependContentPath.slice(-1);
        if ((c === "/") || (c === "\\")) {
            runOptions.prependContentPath = runOptions.prependContentPath.slice(0, -1);
        }
        logger.info("-- Prepend content path: " + runOptions.prependContentPath);
    }

    if (!GUI) {
        logger.info("--- Headless Mode ---");
    }

    if (runOptions.bSegDump) {
        logger.info("--- Dump Segment Info ---");
    }

    if (runOptions.bEventAbs) {
        logger.warn("--- Use ABSOLUTE Event Offsets - NOT COMPLIANT!  ---");
    }

    if (runOptions.timeOffset) {
        logger.info("--- Server Time Offset set to: " + runOptions.timeOffset + "s ---");
    }

    logger.info("");

    win["log"]          = new WINDOW(null,  "ui/ui.html",       1216,   700,    sendConnectionStatus,   mainUIClosed, false);

    p = win["log"].getWin();

    win["allvideoobjs"] = new WINDOW(p, "ui/graph.html",        1216,   700,    null, null, false);
    win["mainvideoobj"] = new WINDOW(p, "ui/singlegraph.html",  1216,   800,    null, null, false);
    win["ad0videoobj"]  = new WINDOW(p, "ui/graphAdVid0.html",  1216,   800,    null, null, false);
    win["ad1videoobj"]  = new WINDOW(p, "ui/graphAdVid1.html",  1216,   800,    null, null, false);
    win["adtrans"]      = new WINDOW(p, "ui/adtransgraph.html", 800,    800,    null, null, false);
    win["config"]       = new WINDOW(p, "ui/config.html",       335,    650,    null, null, false);

    win["log"].createWindow();

    var interfaces = os.networkInterfaces();

    for (var k in interfaces) {
        for (var k2 in interfaces[k]) {
            var address = interfaces[k][k2];
            if (address.family === "IPv4" && !address.internal) {
                generalInfo.serverAddresses.push(address.address);
            }
        }
    }

    logger.info("Server (IPv4) Addresses");
    logger.info("-----------------------");

    generalInfo.port        = http.address().port;
    generalInfo.httpsPort   = https.address().port;

    for (i = 0; i < generalInfo.serverAddresses.length; i++) {
        logger.info(i + ": " + generalInfo.serverAddresses[i]);
    }

    logger.info("URLs:");
    logger.info("  http://[server_ip]:" + generalInfo.port + "/index.html");
    logger.info("  http://[server_ip]:" + generalInfo.port + "/player.aitx");
    if (generalInfo.bHTTPSEnabled) {
        logger.info("  https://[server_ip]:" + generalInfo.httpsPort + "/index.html");
        logger.info("  https://[server_ip]:" + generalInfo.httpsPort + "/player.aitx");
    }

    commonConfig.setNetworkThrottle(commonConfig.THROTTLE.NONE);
    commonConfig.setNetworkErrors(commonConfig.NETERRS.NONE);
    commonConfig.setDelayLicense(commonConfig.DELAYLICENSE.NONE);
}

if (GUI) {
    GUI.on("ready", init);

    GUI.on("window-all-closed", function() { // if this is running on a mac closing all the windows does not kill the application
        if (process.platform !== "darwin")
            GUI.quit();
    });
}


expressSrv.on("activate", function() {
});

ioHttp.sockets.on("connection", function(s) {
    socketConnect(s);
});

ioHttps.sockets.on("connection", function(s) {
    socketConnect(s);
});

const whois = require("whois");

function socketConnect(socket) {

    generalInfo.connectedDevices++;

    generalInfo.devName = commonUtils.extractDevName(generalInfo.currentDeviceUA);
    var UA = socket.request.headers["user-agent"];

    logger.info(" ---> Device connected (" + generalInfo.connectedDevices + ") IP: " + socket.handshake.address + " UA: " + UA);
    if (runOptions.bMultiDevs) {
        whois.lookup(socket.handshake.address, function(err, data) {
            logger.debug(data);
        });
    }

    sendConnectionStatus();

    socket.on("bufferEvent", function(data) {
        win["log"].sendToWindow("ipc-buffer", data);
        win["allvideoobjs"].sendToWindow("ipc-buffer", data);
        win["mainvideoobj"].sendToWindow("ipc-buffer", data);
        win["ad0videoobj"].sendToWindow("ipc-buffer", data);
        win["ad1videoobj"].sendToWindow("ipc-buffer", data);

        logger.trace(data);
    });

    socket.on("playbackOffset", function(data) {
        win["log"].sendToWindow("ipc-playbackOffset", data);
        logger.trace(data);
    });

    socket.on("disconnect", function () {
        if (generalInfo.connectedDevices > 0) {
            generalInfo.connectedDevices--;
        }

        generalInfo.currentDeviceUA = "";
        generalInfo.devName = "";

        sendConnectionStatus();

        logger.info(" ---> Device disconnected: " + generalInfo.connectedDevices);
    });
}

expressSrv.use(express.static("public")); // put static files in the public folder to make them available on web pages
expressSrv.use(bodyParser.urlencoded({ extended: false }));
expressSrv.use(bodyParser.text({type: "text/plain"}));
expressSrv.use(bodyParser.json());

//expressSrv.use(express.static('views'));
expressSrv.use("/common", express.static("common"));
expressSrv.use("/css", express.static("views/css"));
expressSrv.use("/bitmaps", express.static("views/bitmaps"));
expressSrv.use("/js", express.static("views/js"));
expressSrv.use("/playlists", express.static("playlists"));

expressSrv.set("view-engine", "hbs");

expressSrv.post("/log", function(req, res) {
    win["log"].sendToWindow("ipc-log", req.body); // send the async-body message to the rendering thread
    logger.trace(req.body);
    res.send(); // Send an empty response to stop clients from hanging
});

/* Not used */
/*
function sendServerLog(msg) {
    var logObj = {
        "cssClass": "debug",
        "logText":  " - server: " + msg + " ---"
    };

    logger.info(msg);
    win["log"].sendToWindow("ipc-log", logObj);
}
*/

expressSrv.use(function(req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Max-Age", "1");

    res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.header("Expires", "-1");
    res.header("Pragma", "no-cache");

    next();
});

expressSrv.post("/status", function(req, res) {
    win["log"].sendToWindow("ipc-status", req.body); // send the async-body message to the rendering thread
    logger.trace(req.body);
    res.send(); // Send an empty response to stop clients from hanging
});

expressSrv.post("/adtrans", function(req, res) {
    win["adtrans"].sendToWindow("ipc-adtrans", req.body); // send the async-body message to the rendering thread
    logger.trace(req.body);
    res.send(); // Send an empty response to stop clients from hanging
});

expressSrv.get("/index.html", function(req, res) {
    var UA = req.headers["user-agent"];

    if (runOptions.bMultiDevs || !generalInfo.currentDeviceUA || (generalInfo.currentDeviceUA === UA)) {
        generalInfo.currentDeviceUA = UA;
        generalInfo.devName = commonUtils.extractDevName(generalInfo.currentDeviceUA);
        logger.debug(" ---> App loaded by: " + generalInfo.devName);
        logger.debug("   UA: " + UA);

        //createWindows();

        win["log"].reload();
        win["allvideoobjs"].reload();
        win["mainvideoobj"].reload();
        win["ad0videoobj"].reload();
        win["ad1videoobj"].reload();
        win["adtrans"].reload();

        var v = generalInfo.version;
        var sRelType = v.dev === "true" ? "dev" : "";

        res.render("index.hbs",
            {
                version: "v" + generalInfo.version.major + "." + generalInfo.version.minor + sRelType,
                style       : v.dev === "true" ? "mvid-dev" : "mvid",
                serverGUI   : GUI ? "true" : "false"
            },
            function(err, html) {
                res.status(200);
                res.send(html);
                logger.trace("UserAgent: " + req.headers["user-agent"]);
                logger.trace(JSON.stringify(req.headers));
            });

    } else {
        res.status(503);
        res.send("Sorry, another device is already attached.  Please disconnect it and try again.");
    }
});
//监听get testlist.html
expressSrv.get('/testlist.html', function(req, res) {
	var UA = req.headers['user-agent'];
	
	if (runOptions.bMultiDevs || !generalInfo.currentDeviceUA || (generalInfo.currentDeviceUA === UA)) {
		generalInfo.currentDeviceUA = UA;
		generalInfo.devName = commonUtils.extractDevName(generalInfo.currentDeviceUA);
		logger.debug(" ---> App loaded by: " + generalInfo.devName);
		logger.debug("   UA: " + UA);
		
		//createWindows();
		//刷新服务端界面
		win['log'].reload();
		win['allvideoobjs'].reload();
		win['mainvideoobj'].reload();
		win['ad0videoobj'].reload();
		win['ad1videoobj'].reload();
		win['adtrans'].reload();
		
		var v = generalInfo.version;
		var sRelType = v.dev == "true" ? "dev" : "";
		//通过testlist.hbs模板来渲染testlist.html
		res.render('testlist.hbs', 
			{
				version: "v" + generalInfo.version.major + "." + generalInfo.version.minor + sRelType,
				style		: v.dev == "true" ? "mvid-dev" : "mvid",
				serverGUI	: GUI ? "true" : "false"
			}, 
			function(err, html) { 
			res.status(200);
			// 发送给客户端
			res.send(html);
			logger.trace("UserAgent: " + req.headers['user-agent']);
			logger.trace(JSON.stringify(req.headers));
		});
		
	} else {
			res.status(503);
			res.send("Sorry, another device is already attached.  Please disconnect it and try again.");	
	}
});

expressSrv.get("/player.aitx", function(req, res) {
    var srv = "http" + (req.socket.encrypted ? "s" : "") + "://" + req.headers.host + "/";

    logger.trace("get ait: " + srv);
    res.render("playerait.hbs", {url: srv}, function(err, html) {
        res.type("application/vnd.dvb.ait+xml");
        res.status(200);
        logger.trace(html);
        res.send(html);
    });
});

const favIcon   = fs.readFileSync("./views/favicon.ico");

expressSrv.get("/favicon.ico", function(req, res) {
    res.type("image/x-icon");
    res.status(200);
    res.send(favIcon);
});


var mp4box = new mp4boxModule.MP4Box();

expressSrv.get("/content/*", function(req, res) {

    var suffix = req.path.split(".").pop();
    var cType;

    if (suffix === "mpd") {
        cType = "application/dash+xml; charset=utf-8";
    } else {
        cType = "video/mp4";
    }
    logger.trace(" - suffix: " + suffix + " Content-Type: " + cType);

    logger.debug("GET content: " + req.path);
    logger.trace(JSON.stringify(req.headers));

    if (runOptions.bMultiDevs) {
        var u = req.headers["user-agent"];
        var d = commonUtils.extractDevName(u);

        if (d === "UnknownModel") {
            logger.debug("    UA: " + u);
        } else {
            logger.debug("    Device: " + d);
            logger.debug("       IP: " + req.ip);
        }
    }


    // Live (dynamic) content (emulation)???
    if (req.query.progStart && req.query.segDuration) {
        var dNow = new Date();

        var pStart = req.query.progStart;
        var segD = req.query.segDuration;

        // This segment request is for live content - does it exist yet?
        logger.debug("Live seg req: " + pStart + " (" + segD + "ms)");

        // Get time now
        var dAv = new Date();
        dAv.setUTCMinutes(0);
        dAv.setUTCSeconds(0);
        var curProg = dateFormat(dAv.toUTCString(), "isoUtcDateTime");

        logger.debug(" - current prog: " + curProg);

        // Is segment request for current content, or past?
        if (pStart === curProg) {
            logger.debug(" - segment request current, not past");
            // extract segment number and calculate time offset - for end of segment

            var arr = req.path.match(/\d+(?=.m4s?)/) || ["0"];
            var segN = parseInt(arr[0]);

            logger.debug(" - segment number: " + segN);

            if (segN) {
                var sd = req.query.segDuration;
                var segTmOffset = (segN - 1 + 1) * parseInt(sd) / 1000;
                logger.debug(" - segment time offset: " + segTmOffset + "s");

                // Get now offset
                var utcMinutes = dNow.getUTCMinutes();
                var utcSeconds = dNow.getUTCSeconds();
                var utcTotalSeconds = (utcMinutes * 60) + utcSeconds;

                logger.debug(" - seconds now: " + utcTotalSeconds + "s");
                logger.debug(" - delta: " + (utcTotalSeconds - segTmOffset) + "s");

                var headRoom = (parseInt(sd) * 1) / 1000;

                // Is segment request in the future, if so segment does not exist, send 404
                if (segTmOffset > (utcTotalSeconds + headRoom)) {
                    logger.error(" - Illegal segment request: in future (" + (segTmOffset - utcTotalSeconds) + ")");
                    return res.sendStatus(404);
                }
            }
        } else {
            logger.debug(" - segment request past, not current.");
        }
    }


    // ***** Simulate error condition (503)? *****
    var nErrs = commonConfig.getNetworkErrors();

    if (nErrs.value !== 0) {
        var rndErr = Math.floor(Math.random() * (nErrs.value - 1));

        if (rndErr === 0) {
            // Simulate error (503)
            logger.info("SIMULATE ERROR! (503)");
            return res.sendStatus(503);
        }
    }

    // Get file on server
    var file;

    if (runOptions.prependContentPath) {
        file = runOptions.prependContentPath + req.path;
        logger.debug(" - file (prepended dir): " + file);
    } else {
        file = path.join(__dirname, req.path);
        logger.trace(" - file: " + file);
    }


    fs.stat(file, function(err, stats) {
        if (err) {
            if (err.code === "ENOENT") {
                // 404 Error if file not found
                logger.error(" * file does not exist");
                return res.sendStatus(404);
            }
            logger.error(" * error in file request: " + file);
            return res.sendStatus(400);
        }

        if (!stats.isFile()) {
            logger.error(" * error in file request: " + file);
            return res.sendStatus(400);
        }

        if (runOptions.bSegDump) {
            var arrayBuffer = new Uint8Array(fs.readFileSync(file)).buffer;
            arrayBuffer.fileStart = 0;

            mp4box.appendBuffer(arrayBuffer);
            logger.info(mp4box.getInfo());
            mp4box.flush();
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

            logger.debug(" - range: " + range);
            logger.debug(" - positions: " + positions);
        } else {
            start = 0;
            end = total - 1;
        }

        chunksize = (end - start) + 1;

        logger.trace(" - total: " + total);

        logger.trace(" - start: " + start);
        logger.trace(" - end: " + end);
        logger.trace(" - chunksize: " + chunksize);

        if ((chunksize+start) < total) {
            rtn = 206;
        }
        logger.trace(" - rtn: " + rtn);

        if (start >= end) {
            logger.error(" * Error: start >= end!");
            return res.sendStatus(400);
        }

        var stream = fs.createReadStream(file, { start: start, end: end })
            .on("open", function() {
                res.writeHead(rtn, {
                    "Content-Range": "bytes " + start + "-" + end + "/" + total,
                    "Accept-Ranges": "bytes",
                    "Content-Length": chunksize,
                    "Content-Type": cType,
                    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
                    "Access-Control-Allow-Origin": "*"
                });

                logger.trace(" - send chunk");
                var nThrot = commonConfig.getNetworkThrottle();
				logger.info(" - send chunk :" + nThrot.value + "  ---- " + nThrot.name);
                if (nThrot.value !== 0) {
                    stream.pipe(new Throttle({rate: nThrot.value * (1024 * 1024) / 8, chunksize: 2048 * 1024})).pipe(res);
                    logger.info("Throttle server: " + nThrot.name);
                } else {
                    stream.pipe(res);
                }
            }).on("error", function(err) {
                return res.sendStatus(400);
            });
    });
});

expressSrv.get('/hls/*', function(req, res) {
	
	var suffix = req.path.split('.').pop();
	var cType;
	
	if (suffix === "m3u8") {
		cType = "application/x-hls";
	}else{
		cType = "video/mp2t"
	}
	logger.trace(" - suffix: " + suffix + " Content-Type: " + cType);
	
	logger.debug("GET content: " + req.path);
	logger.trace(JSON.stringify(req.headers));
	
	if (runOptions.bMultiDevs) {
			var u = req.headers['user-agent'];			
			var d = commonUtils.extractDevName(u);
			
			if (d === "UnknownModel") {
				logger.debug("    UA: " + u);
			} else {
				logger.debug("    Device: " + d);
				logger.debug("       IP: " + req.ip);
			}
	}
	
	
	// ***** Simulate error condition (503)? *****
	var nErrs = commonConfig.getNetworkErrors();
	
	if (nErrs.value != 0) {
		var rndErr = Math.floor(Math.random() * (nErrs.value - 1));
		
		if (rndErr === 0) {
			// Simulate error (503)
			logger.info("SIMULATE ERROR! (503)");
			return res.sendStatus(503);
		}
	}

	// Get file on server
	var file;
	
	if (runOptions.prependContentPath) {
		file = runOptions.prependContentPath + req.path;
		logger.debug(" - file (prepended dir): " + file);
	} else {
		file = path.join(__dirname, req.path);
		logger.trace(" - file: " + file);
	}
	
	
    fs.stat(file, function(err, stats) {
		if (err) {
			if (err.code === 'ENOENT') {
				// 404 Error if file not found
				logger.error(" * file does not exist");
				return res.sendStatus(404);
			}
			logger.error(" * error in file request: " + file);
			return res.sendStatus(400);
		}
		
		if (!stats.isFile()) {
			logger.error(" * error in file request: " + file);
			return res.sendStatus(400);
		}
		logger.debug(req.headers);
		
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

			logger.debug(" - range: " + range);
			logger.debug(" - positions: " + positions);
		} else {
			start = 0;
			end = total - 1;		
		}

		chunksize = (end - start) + 1;

		logger.trace(" - total: " + total);

		logger.trace(" - start: " + start);
		logger.trace(" - end: " + end);
		logger.trace(" - chunksize: " + chunksize);

		if ((chunksize+start) < total) {
			rtn = 206;
		} 
		logger.trace(" - rtn: " + rtn);
		
		if (start >= end) {
			logger.error(" * Error: start >= end!");
			return res.sendStatus(400);
		}

		var stream = fs.createReadStream(file, { start: start, end: end })
			.on("open", function() {
				res.writeHead(rtn, {
					"Content-Range": "bytes " + start + "-" + end + "/" + total,
					"Accept-Ranges": "bytes",
					"Content-Length": chunksize,
					"Content-Type": cType,
					"Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
					"Access-Control-Allow-Origin": "*"
				});			

				logger.trace(" - send chunk");
				var nThrot = commonConfig.getNetworkThrottle();
				
				if (nThrot.value != 0) {
					stream.pipe(new Throttle({rate: nThrot.value * (1024 * 1024) / 8, chunksize: 2048 * 1024})).pipe(res);
					logger.info("Throttle server: " + nThrot.name);
				} else {
					stream.pipe(res);				
				}
			}).on("error", function(err) {
				return res.sendStatus(400);
			});
	});
	
});

expressSrv.get("/time", function(req, res) {
    var tISO;

    var d = new Date();

    if (req.query.offset) {
        var o = parseInt(req.query.offset);
        logger.warn("Server Time offset applied: " + o + "s");
        d.setUTCSeconds(d.getUTCSeconds() + o);
    }

    tISO = dateFormat(d, "isoUtcDateTime");
    logger.info("tISO: " + tISO);

    res.set("Date", d.toUTCString());

    res.status(200);
    res.type("text/plain");

    res.send(tISO);
});


const configSegJump     = {};
var segCount = 0;

expressSrv.get("/segjump/*", function(req, res) {

    var useURL = req.path;
    var sC = {};

    logger.info("GET segjump: " + useURL);

    // Load stream config info (sync - one time load)
    if (!configSegJump[useURL]) {
        var cfn = "." + commonUtils.noSuffix(useURL) + ".json";

        logger.info("Load config file: " + cfn);

        if (fs.existsSync(cfn)) {
            configSegJump[useURL] = require(cfn);
        } else {
            logger.error(" * file does not exist");
            return res.sendStatus(404);
        }
    }

    sC = configSegJump[useURL];

    sC.segsize      = parseInt(eval(sC.segsize));

    sC.Atimescale   = parseInt(eval(sC.Atimescale));
    sC.Vtimescale   = parseInt(eval(sC.Vtimescale));

    var ss = ++segCount;
    var alignedOffset = (ss-1) * sC.segsize;
    var ao = Math.round(alignedOffset * sC.Atimescale / 1000);
    var vo = Math.round(alignedOffset * sC.Vtimescale / 1000);

    // Get file on server
    var file = path.join(__dirname, useURL + ".hbs");
    logger.info(" - file: " + file);

    fs.stat(file, function(err, stats) {
        if (err) {
            if (err.code === "ENOENT") {
                // 404 Error if file not found
                logger.error(" * file does not exist");
                return res.sendStatus(404);
            }
            res.end(err);
        }

        res.render(file, { Aoffset: ao, Voffset: vo, StartSeg: ss }, function(err, mpd) {
            if (err) {
                res.end(err);
            }

            res.type("application/dash+xml; charset=utf-8");
            res.status(200);
            res.send(mpd);
        });
    });
});


const configStream  = {};
var archiveMPDs     = {};
var persistState    = {};

expressSrv.get("/dynamic/*", async function(req, res) {

    var progStart;
    var bAllPeriods = false;


    // Get time
    var dNow = new Date();

    // var utcHours = dNow.getUTCHours();
    var utcMinutes = dNow.getUTCMinutes();
    var utcSeconds = dNow.getUTCSeconds();
    var utcTotalSeconds = (utcMinutes * 60) + utcSeconds;

    var timeServer = "http" + (req.socket.encrypted ? "s" : "") + "://" + req.headers.host + "/time";

    var formProps = {};
    var sC = {};


    // Extract content from URL
    var useURL = req.path;
    var strippedURL = commonUtils.basename(useURL);
    logger.info("GET dynamic: " + useURL + " (" + strippedURL + ")");
    var serverContId = strippedURL + "-" + commonUtils.createContentId();
    logger.info("ContentId: " + serverContId);


    // Content no longer live?
    var clientContId = "";

    if (req.query.contid) {
        clientContId = strippedURL + "-" + req.query.contid;

        if (serverContId !== clientContId) {
            logger.info("Client requested non-current content: " + clientContId);
            if (archiveMPDs[clientContId]) {
                logger.info("Found archived MPD, using that. ");

                res.type("application/dash+xml; charset=utf-8");
                res.status(200);
                return res.send(archiveMPDs[clientContId]);
            } else {
                logger.info("No previous content archived!");
                return res.sendStatus(404);
            }
        }
    }


    if (req.query.allperiods) {
        bAllPeriods = req.query.allperiods === "1";
    }


    // Create new manifest?
    formProps.title = serverContId;

    logger.info("- Time offset, past the hour - " + utcMinutes + "M" + utcSeconds + "S");

    // Load stream config info (sync - one time load)
    function intify(x) {
        return parseInt(eval(x));
    }

    if (!configStream[useURL]) {

        var cfn = "." + commonUtils.noSuffix(useURL) + ".json";

        logger.info("Load config file: " + cfn);

        if (fs.existsSync(cfn)) {
            configStream[useURL] = require(cfn);
        } else {
            logger.error(" * file does not exist");
            return res.sendStatus(404);
        }

        sC = configStream[useURL];

        // Extract stream config data
        sC.segsize      = intify(sC.segsize);
        sC.periodD      = intify(sC.periodD);

        if (sC.marginF) {
            sC.marginF      = intify(sC.marginF);
        } else {
            sC.marginF      = intify(sC.updatePeriod) * 2;
            logger.info(" - Use update period: marginF " +  sC.marginF + "s");
        }

        sC.marginB      = intify(sC.marginB);

        sC.Atimescale   = intify(sC.Atimescale);
        sC.Vtimescale   = intify(sC.Vtimescale);

        if (sC.Etimescale) {
            sC.Etimescale   = intify(sC.Etimescale);
        } else {
            sC.Etimescale   = sC.Atimescale;
        }

        if (sC.ads) {
            sC.ads.adD  = intify(sC.ads.adD);
        }

        if (sC.subs) {
            sC.subs.segsize     = intify(sC.subs.segsize);
            sC.subs.timescale   = intify(sC.subs.timescale);
        }

        if (sC.segTimeLine) {
            sC.segTimeLine.updatePeriodms = intify(sC.segTimeLine.updatePeriodms);
        }

        // Force ad duration to seg boundary???
        if (sC.ads && sC.ads.adSegAlign && (sC.ads.adD > 0) && (sC.ads.adSegAlign !== "none")) {
            logger.info("- non aligned adD: " + sC.ads.adD);

            if (sC.ads.adSegAlign === "round") {
                sC.ads.adD = Math.round(sC.ads.adD / sC.segsize) * sC.segsize;
                logger.info("- aligned adD (round): " + sC.ads.adD);
            } else if (sC.ads.adSegAlign === "floor") {
                sC.ads.adD = Math.floor(sC.ads.adD / sC.segsize) * sC.segsize;
                logger.info("- aligned adD (floor): " + sC.ads.adD);
            }
        }

        // Force main duration to seg boundary???
        if (sC.segAlign && (sC.segAlign !== "none")) {
            logger.info("- non aligned periodD: " + sC.periodD);

            var adD = sC.ads ? sC.ads.adD : 0;

            if (sC.segAlign === "round") {
                sC.periodD = (Math.round((sC.periodD - adD) / sC.segsize) * sC.segsize) + adD;
                logger.info("- aligned periodD (round): " + sC.periodD);
            } else if (sC.segAlign === "floor") {
                sC.periodD = (Math.floor((sC.periodD - adD) / sC.segsize) * sC.segsize) + adD;
                logger.info("- aligned periodD (floor): " + sC.periodD);
            }
        }

        // Calc average segsize for period
        sC.averageSegSize = Math.round(sC.periodD / Math.ceil(sC.periodD / sC.segsize));
        logger.info("- average seg size for period(s): " + sC.averageSegSize);

    } else {
        sC = configStream[useURL];
    }


    if (sC.serverTimeOffset || runOptions.timeOffset) {
        timeServer += "?offset=" + (sC.serverTimeOffset || runOptions.timeOffset);
    }
    logger.trace("timeServer: " + timeServer);
    formProps.timeServer = timeServer;
    formProps.timeScheme = "urn:mpeg:dash:utc:http-head:2014";  // Or use urn:mpeg:dash:utc:http-iso:2014


    var fNow = dateFormat(dNow.toUTCString(), "isoUtcDateTime");

    var dAv = dNow;
    dAv.setUTCMinutes(0);
    dAv.setUTCSeconds(0);
    progStart = dateFormat(dAv.toUTCString(), "isoUtcDateTime");

    var liveEdge = !bAllPeriods ? progStart : "";

    function rtnCachedManifest() {
        if (archiveMPDs[serverContId]) {
            logger.info("Using previously created manifest (no change). ");

            res.type("application/dash+xml; charset=utf-8");
            res.status(200);
            return res.send(archiveMPDs[serverContId]);
        } else {
            logger.info("Error: No previously created manifest!");
            return res.sendStatus(404);
        }
    }

    // Will the manifest change?
    if (!persistState[useURL]) {
        persistState[useURL] = {};
    }

    const progDuration  = (60 * 60 * 1000);
    var maxP = Math.round((progDuration / sC.periodD) - 1);
    logger.info("- maxP: " + maxP);

    var currentP    = getPeriod_floor(utcTotalSeconds * 1000, sC.periodD, maxP);

    var lowerP;
    var upperP;

    if (!bAllPeriods) {
        lowerP  = getPeriod_floor((utcTotalSeconds - sC.marginB) * 1000, sC.periodD, maxP);
        upperP  = getPeriod_floor((utcTotalSeconds + sC.marginF) * 1000, sC.periodD, maxP);
    } else {
        lowerP = 0;
        upperP = maxP;
    }

    if (!sC.segTimeLine) {
        // *** Multiple Period Manifest ***
        logger.info("*** Multiple Period Manifest ***");

        if (    (!persistState[useURL].publishTime)     ||
                (lowerP !== persistState[useURL].lowerP) ||
                (upperP !== persistState[useURL].upperP) ||
                (serverContId !== persistState[useURL].serverContId) ||
                bAllPeriods)
        {
            logger.info("Manifest has changed: publishTime - " + fNow);

            formProps.publishTime = fNow;

            persistState[useURL].publishTime    = fNow;
            persistState[useURL].lowerP         = lowerP;
            persistState[useURL].upperP         = upperP;
            persistState[useURL].serverContId   = serverContId;
        } else {
            return rtnCachedManifest();
        }


        // Create new manifest!
        logger.info("CurrentPeriod: " + currentP);

        var prevMain;
        var adIdx;
        var eventId = 1;

        for (var i = lowerP; i <= upperP; i++) {

            if (i > 0) {
                prevMain = "main-" + (i-1);
            } else {
                prevMain = "";
            }

            if (sC.ads) {
                adIdx = (i % sC.ads.content.length);
                formProps["ad-period" + i] = makeAdPeriod(sC,   adIdx, i, eventId++, "connectivity", prevMain);
                formProps["main-period" + i] = makeMainPeriod(sC, i, eventId++, "connectivity", "ad-" + i, liveEdge);
            } else {
                formProps["period" + i] = makeMainPeriod(sC, i, eventId++, "continuity", prevMain, liveEdge);
            }
        }
    } else {
        // *** Seg Time Line ***
        logger.info("*** Seg TimeLine manifest ***");
        var createManifest = true;
        var nowCheck = new Date();

        if (persistState[useURL].lastHit) {
            logger.info(" - last update: " + (nowCheck - persistState[useURL].lastHit));

            if ((nowCheck - persistState[useURL].lastHit) < sC.segTimeLine.updatePeriodms)
            {
                createManifest = false;
            }
        }

        if (createManifest || bAllPeriods) {
            var tm = utcTotalSeconds+ sC.marginF;

            persistState[useURL].lastHit = nowCheck;
            formProps.publishTime = fNow;

            if (bAllPeriods) {
                tm = 3600;
            }

            try {
                formProps["segtimeline-audio"]  = await makeSegTimeLineAudio(sC, tm);
                formProps["segtimeline-video"]  = await makeSegTimeLineVideo(sC, tm);
            } catch(e) {
                res.sendStatus(500);
                return;
            }

            eventId = 1;
            for (i = lowerP; i <= upperP; i++) {
                formProps["segtimeline-event" + i] = makeSegTimeLineEvent(sC, utcTotalSeconds+ sC.marginF, i, eventId);
                eventId = eventId + 2;
            }

            if (liveEdge) {
                formProps["queryString"] = "?progStart=" + liveEdge + "&amp;segDuration=" + sC.averageSegSize;
            }

            if (sC.subs) {
                formProps["segtimeline-subs"]   = makeSegTimeLineSubs(sC, utcTotalSeconds);
            }
        } else {
            return rtnCachedManifest();
        }
    }

    // Get file on server
    var file = path.join(__dirname, (sC.useManifest || useURL) + ".hbs");

    logger.info(" - file: " + file);

    fs.stat(file, function(err, stats) {
        if (err) {
            if (err.code === "ENOENT") {
                // 404 Error if file not found
                logger.error(" * file does not exist");
                return res.sendStatus(404);
            }
            res.end(err);
        }

        logger.trace("progStart: " + progStart);
        formProps.availabilityStartTime = progStart;
        formProps.minimumUpdatePeriod   = "PT" + sC.updatePeriod + "S";

        res.render(file, formProps, function(err, mpd) {
            if (err) {
                res.end(err);
            }

            res.type("application/dash+xml; charset=utf-8");
            res.status(200);
            res.send(mpd);

            archiveMPDs[serverContId] = mpd; // Archive the mpd for this 'programme'
        });
    });
});

function getPeriod_floor(m, d, mx) {
    if (m < 0) {
        m = 0;
    }

    var p = Math.floor(m / d);
    if (p > mx) {
        p = mx;
    }

    return p;
}

/* Not used */
/*
function getPeriod_round(m, d, mx) {
    if (m < 0) {
        m = 0;
    }

    var p = Math.round(m / d);
    if (p > mx) {
        p = mx;
    }

    return p;
}
*/

function makeAdPeriod(sC, adIdx, p, eId, ptrans, prev) {

    var fadD = new Date(sC.ads.adD);
    var fsAd = new Date(p * sC.periodD);

    var sAdDuration = _formatTime(fadD);
    var sAdStart    = _formatTime(fsAd);
    var evOffset;
    
    if (!runOptions.bEventAbs) {
        evOffset = 0;
    } else {
        // NOT COMPLIANT!
        evOffset = Math.floor((p * sC.periodD * sC.Etimescale) / 1000);   // Absolute calc - this is wrong, use relative */
    }

    logger.info(" - Generated manifest file: Period: " + p);
    logger.info(" -  Ad: Duration: " + sAdDuration + " Start: " + sAdStart);

    return adXML(sC.ads.content[adIdx], p, sAdDuration, sAdStart, evOffset, eId, ptrans, prev, sC.subs);
}


function makeMainPeriod(sC, p, eId, ptrans, prev, progStart) {

    var offset = sC.ads ? sC.ads.adD : 0;

    var fd = new Date(sC.periodD - offset);
    var fs = new Date((p * sC.periodD) + offset);

    var sDuration   = _formatTime(fd);
    var sStart      = _formatTime(fs);


    function calcOffset (p, periodD, offset, sz, timescale) {
        var seg = (Math.round(((p * periodD) + offset) / sz)) + 1;
        var alignedOffset = (seg-1) * sz;
        var obj = {};

        obj.seg = seg;
        obj.offset = Math.round((alignedOffset * timescale) / 1000);

        logger.trace(" --- calcOffset seg:" + seg + " alignedOffset:" + alignedOffset + " timescale:" + timescale + " obj.offset:" + obj.offset);
        return obj;
    }

    var offsetObj   = calcOffset(p, sC.periodD, offset, sC.segsize, sC.Atimescale);
    var seg         = offsetObj.seg;
    var AoffsetS    = offsetObj.offset;
    var VoffsetS    = calcOffset(p, sC.periodD, offset, sC.segsize, sC.Vtimescale).offset;

    var evOffset;
    if (!runOptions.bEventAbs) {
        evOffset = 0;
    } else {
        // NOT COMPLIANT!
        evOffset = calcOffset(p, sC.periodD, offset, sC.segsize, sC.Etimescale).offset; // Absolute calc - this is wrong, use relative
    }

    if (sC.subs) {
        sC.subs.offsetObj = calcOffset(p, sC.periodD, offset, sC.subs.segsize, sC.subs.timescale);
    }


    logger.info(" -  Main: Duration: " + sDuration + " Start: " + sStart + " (A:" + AoffsetS + "S, V:" + VoffsetS + ")");

    return mainContentXML(
        sC.main, p, sDuration, sStart,
        AoffsetS, VoffsetS, seg,
        evOffset, eId,
        ptrans,
        prev,
        sC.subs,
        progStart,
        sC.averageSegSize
    );
}

function _formatTime(d) {
    var ms = "00" + d.getUTCMilliseconds();
    return "PT" + d.getUTCHours() + "H" + d.getUTCMinutes() + "M" + d.getUTCSeconds() + "." + ms.substr(-3) + "S";
}


var ptransTable = {};

ptransTable["continuity"]   = fs.readFileSync("./dynamic/periods/period-continuity.xml", "utf8");
ptransTable["connectivity"] = fs.readFileSync("./dynamic/periods/period-connectivity.xml", "utf8");


var cachedXML = {};

cachedXML.mainContent   = {};
cachedXML.mainSubs      = {};
cachedXML.ads           = {};
cachedXML.adSubs        = {};
cachedXML.segTimeLine   = {};


function loadAndCache(fn, c) {
    if (!c[fn]) {
        logger.info("Load file: " + fn);

        if (fs.existsSync(fn)) {
            c[fn] = fs.readFileSync(fn, "utf8");
        } else {
            logger.error(" * file does not exist");
            return false;
        }
    }
    return true;
}

function mainContentXML(fn, p, sDuration, sStart, AoffsetS, VoffsetS, seg, evPresTime, eId, ptrans, prevPeriodID, subs, progStart, segDuration) {
    var pc;
    var template;
    var context = {};
    var sbs = "";

    if ((prevPeriodID !== "") && ptransTable[ptrans]) {
        template = hbs.handlebars.compile(ptransTable[ptrans]);
        context = {prevperiod_id: prevPeriodID};
        pc =  template(context);
    } else {
        pc = "";
    }

    if (subs && subs.main && loadAndCache(subs.main, cachedXML.mainSubs)) {
        var subsContext = {};

        template = hbs.handlebars.compile(cachedXML.mainSubs[subs.main]);

        subsContext["subid"]        = "main",
        subsContext["offset"]       = subs.offsetObj.offset,
        subsContext["period_seg"]   = subs.offsetObj.seg;

        sbs =  template(subsContext);
    }

    if (!loadAndCache(fn, cachedXML.mainContent)) {
        return false;
    }

    template    = hbs.handlebars.compile(cachedXML.mainContent[fn]);
    context     = {
        period_id           : "main-" + p,
        period_start        : sStart,
        period_continuity   : pc,
        Aoffset             : AoffsetS,
        Voffset             : VoffsetS,
        evPresentationTime  : evPresTime,
        evId                : eId,
        period_seg          : seg,
        subs                : sbs
    };

    if (progStart) {
        context["queryString"] = "?progStart=" + progStart + "&amp;segDuration=" + segDuration;
    }

    var complete = template(context);

    logger.trace(complete);

    return complete;
}

function adXML(fn, p, sDuration, sStart, evPresTime, eId, ptrans, prevPeriodID, subs) {
    var pc;
    var template;
    var context;
    var sbs = "";

    if ((prevPeriodID !== "") && ptransTable[ptrans]) {
        template = hbs.handlebars.compile(ptransTable[ptrans]);
        context = {prevperiod_id: prevPeriodID};
        pc =  template(context);
    } else {
        pc = "";
    }

    if (subs && subs.ads && loadAndCache(subs.ads, cachedXML.adSubs)) {
        template = hbs.handlebars.compile(cachedXML.adSubs[subs.ads]);
        context = {
            subid       : "ads",
            offset      : 0,
            period_seg  : 1
        };
        sbs =  template(context);
    }

    if (!loadAndCache(fn, cachedXML.ads)) {
        return false;
    }

    template    = hbs.handlebars.compile(cachedXML.ads[fn]);
    context     = {
        period_id: "ad-" + p,
        period_start: sStart,
        period_continuity: pc,
        evPresentationTime: evPresTime,
        evId: eId,
        subs: sbs
    };

    var complete = template(context);

    logger.trace(complete);

    return complete;
}

const xml2js = require("xml2js");

function segtimeLineXML(fn, tm, segSize, tmScale) {

    var promise = new Promise(function(resolve, reject) {

        if (!loadAndCache(fn, cachedXML.segTimeLine)) {
            reject(Error("XML Parsing - file not found"));
        }

        var parser = new xml2js.Parser();

        var xml = cachedXML.segTimeLine[fn];

        var mod = {};

        mod.SegmentTimeline = {};
        mod.SegmentTimeline.S = [];

        parser.parseString(xml, function (err, obj) {

            if (err) {
                logger.error("err: " + err);
                reject(Error("XML Parsing / creation failed"));
            }

            logger.trace(JSON.stringify(obj));

            var tlObj = obj["SegmentTimeline"]["S"];
            var newObj;
            var tmSectionStart = 0, tmSectionEnd = 0, totSegs = 0;
            
            var i = 0;
            var bLastOne = false;

            while ((i < tlObj.length) && !bLastOne) {

                var segObj = tlObj[i];
                var segD = parseInt(segObj["$"].d || 0);
                var segR = parseInt(segObj["$"].r || 0);

                logger.trace(" - d: " + segD);
                logger.trace(" - r: " + segR);

                tmSectionStart  = tmSectionEnd;
                totSegs         = Math.round(segD + (segD * segR));
                tmSectionEnd    = tmSectionStart + (totSegs / tmScale);

                logger.trace("tmSectionStart: " + tmSectionStart);
                logger.trace("tmSectionEnd: " + tmSectionEnd);
                logger.trace("tm: " + tm);

                if (tm < tmSectionEnd)
                {
                    bLastOne = true;
                }

                newObj = {};

                if (i === 0) {
                    newObj.t = "0";
                }

                newObj.d = segD;

                if (bLastOne) {
                    // Trim seg count
                    var segCount = Math.floor(((tm - tmSectionStart) * tmScale / segSize) + 0.9999);
                    if (segCount > 1) {
                        newObj.r = segCount-1;
                    }
                } else {
                    if (segR) {
                        newObj.r = segR;
                    }
                }

                mod.SegmentTimeline.S[i] = {};
                mod.SegmentTimeline.S[i]["$"] = newObj;

                i++;
            }

            var builder = new xml2js.Builder( { "headless": true, "indent": "     "} );
            var modXML = builder.buildObject(mod);

            logger.trace(modXML);
            logger.trace(xml);

            modXML = modXML.replace(/^/gm, "\t\t\t\t");

            resolve(modXML);
        });
    });

    return promise;
}


async function makeSegTimeLineAudio (sC, tm) {

    var fn = sC.segTimeLine.audio;

    try {
        var xml = await segtimeLineXML(fn, tm, sC.segsize, sC.Atimescale);
        logger.trace(xml);
        return xml;
    } catch(e) {
        throw e.message;
    }
}


async function makeSegTimeLineVideo (sC, tm) {

    var fn = sC.segTimeLine.video;

    var xml = await segtimeLineXML(fn, tm, sC.segsize, sC.Vtimescale);
    logger.trace(xml);
    return xml;
}


function makeSegTimeLineEvent(sC, tm, p, eId) {

    var adOffset = Math.floor((p * sC.periodD * sC.Etimescale) / 1000);
    var mainOffset = Math.floor((((p * sC.periodD) + 60000) * sC.Etimescale) / 1000);

    var xml = "";

    var fn = sC.segTimeLine.event;

    if (loadAndCache(fn, cachedXML.segTimeLine)) {
        var context = {
            "ptime-ad"      : adOffset,
            "id-ad"         : eId,
            "ptime-main"    : mainOffset,
            "id-main"       : eId+1
        };

        var template = hbs.handlebars.compile(cachedXML.segTimeLine[fn]);
        xml =  template(context);
    }


    return xml;
}


function makeSegTimeLineSubs(sC, t) {

    var fn = sC.subs.main;

    if (!loadAndCache(fn, cachedXML.segTimeLine)) {
        return false;
    }

    return cachedXML.segTimeLine[fn];
}


expressSrv.post("/savelog", function(req, res) {
    logger.info("/savelog: " + req.query.filename);
    res.send(); // Send an empty response to stop clients from hanging

    fs.writeFile("./logs/" + req.query.filename, "CLIENT IP: " + req.ip + "\n" + req.body, function(err) {
        if(err) {
            logger.error(err);
        }
    });
});

const licenceTable = {};

expressSrv.post("/getkeys", function(req, res) {

    var lDelay = commonConfig.getDelayLicense();
    var licReq = req.body;
    var kid;

    logger.info("getkeys: " + JSON.stringify(licReq));
    logger.info(" - url: " + req.path);

    try {
        kid = licReq.kids[0];
    } catch (err) {
        logger.error(" * malformed licence request.");
        return res.sendStatus(400);
    }

    logger.info(" - kid: " + kid);

    var tag = req.query.tag;

    if (!tag) {
        tag = "KID-" + kid;
        logger.warn(" - no tag, using KID: " + tag);
    }

    if (tag) {
        logger.info(" - tag: " + tag);

        var file = "./clearKey/licence-" + tag + ".json";

        fs.stat(file, function(err, stats) {
            if (err) {
                if (err.code === "ENOENT") {
                    // 404 Error if file not found
                    logger.error(" * file does not exist: " + file);
                    return res.sendStatus(404);
                }
                res.end(err);
            }

            if (!licenceTable[tag]) {
                licenceTable[tag] = require(file);
            }

            var lic = licenceTable[tag];
            logger.info("licence: " + JSON.stringify(lic));

            if (lic.keys[0].kid !==  kid) {
                logger.info(" * illegal kid.");
                return res.sendStatus(403);
            }

            if (lDelay.value !== 0) {

                logger.info("getkeys: delay license by " + lDelay.name);
                setTimeout(function() {
                    res.status(200);
                    res.send(lic);
                }, lDelay.value);

            } else {
                res.status(200);
                res.send(lic);
            }
        });
    } else {
        logger.error(" * no tag");
        return res.sendStatus(404);
    }
});

expressSrv.post('/testcase', function(req, res) {
	var info = req.body;
	logger.info(" - url: " + req.path);
	logger.info("testcase result: " + JSON.stringify(info));
	logger.info("testcase id: " + info[0].id);
	if(info[0].id == "t301"){
		logger.info("--Throttle  network to  " + info[0].value);
		commonConfig.setNetworkThrottleByName(info[0].value);
	}
});

function sendConnectionStatus() {
    var g = generalInfo;

    var obj = {
        "port"          : g.port,
        "bHTTPSEnabled" : g.bHTTPSEnabled,
        "httpsPort"     : g.httpsPort,
        "addresses"     : g.serverAddresses,
        "bConnected"    : (g.connectedDevices > 0),
        "devName"       : g.devName,
        "version"       : "v" + g.version.major + "." + g.version.minor + (g.version.dev === "true" ? "dev" : "")
    };

    win["log"].sendToWindow("ipc-connected", obj);
}

function sendConfig() {
    var props = commonConfig._getProps();

    win["config"].sendToWindow("ipc-send-config", props);
}


http.listen(8080, (err) => {
    if (!GUI) {
        init();
    }
});

https.listen(8082);


process.on("exit", function(code) {
    logger.info("exit: " + code);
});

process.on("uncaughtException", function(err) {
    logger.error("uncaughtException: " + err);
    process.exit(0);
});

process.on("SIGINT", function() {
    logger.info("SIGINT");
    process.exit(0);
});
