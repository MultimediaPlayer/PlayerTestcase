// *************************************************************************************** //
// *************************************************************************************** //
// *************************************************************************************** //
//                                                                                         //
// Keys                                                                                    //
//                                                                                         //
// *************************************************************************************** //
// *************************************************************************************** //
// *************************************************************************************** //

window.InitVKKeys = function() {
    var lVKTable = {};
	lVKTable["VK_OK"]           = 13;
    lVKTable["VK_LEFT"]			= 37;
    lVKTable["VK_UP"]			= 38;
    lVKTable["VK_RIGHT"]		= 39;
    lVKTable["VK_DOWN"]			= 40;
    lVKTable["VK_0"] 			= 48;
    lVKTable["VK_1"] 			= 49;
    lVKTable["VK_2"] 			= 50;
    lVKTable["VK_3"] 			= 51;
    lVKTable["VK_4"] 			= 52;
    lVKTable["VK_5"] 			= 53;
    lVKTable["VK_6"] 			= 54;
    lVKTable["VK_7"] 			= 55;
    lVKTable["VK_8"] 			= 56;
    lVKTable["VK_9"] 			= 57;
    lVKTable["VK_FAST_FWD"] 	= 417;
    lVKTable["VK_REWIND"] 		= 412;
    lVKTable["VK_PLAY"] 		= 415;
    lVKTable["VK_PAUSE"] 		= 19;
    lVKTable["VK_PLAY_PAUSE"]	= 463;
    lVKTable["VK_INFO"] 		= 457;
    lVKTable["VK_RED"] 			= 403;
    lVKTable["VK_GREEN"]		= 404;
    lVKTable["VK_YELLOW"]		= 405;
    lVKTable["VK_BLUE"]			= 406;

    return function (vk) {
        if ((typeof window.KeyEvent !== "undefined") && (typeof window.KeyEvent[vk] !== "undefined")) {
            return window.KeyEvent[vk]; 
        } else {
            return lVKTable[vk];
        }
    }; 
};