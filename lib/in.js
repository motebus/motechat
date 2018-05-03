// in: module for in layer (motebus)
// Date: 2018/4/25
// Version: 0.98

var exports = module.exports = {};
var useweb = false;
var appname = '';
var iocmma = '';

var motebus;
var inmsgcb;
var eventcb;
var mbstate = '';
var mymote;
var mymma = '';
var mymmaport = '';
var xrpc;
var xrpcstate = '';

var IN_OKCODE = 0;
var IN_OKMSG = "OK";
var IN_ERRCODE = -253;

var DefaultXmsgTimeout = 6;
var DefaultXrpcTimeout = 9;
var DefaultWaitTimeout = 18;
var dbg = 1;		// debug level: 0, 1, 2
var firstready = true;
var firstopen = true;

/**
 * @callback openCallback
 * @param {Object} result {ErrCode, ErrMsg}
 */

/**
 * the method that open motechat
 * @example
var conf = { "AppName":"", "IOC":"", "DCenter":"", "AppKey":"", "UseWeb":"" }
conf.AppName = ‘myfunc’;
conf.DCenter = ‘dc@boss.ypcloud.com:6788’;
conf.AppKey = ‘YfgEeop5’;
var mChat = require('motechat');

mChat.Open(conf, function(result){
    console.log(‘init result=%s’, JSON.stringify(result));
}
 * @function Open
 * @param {Object} conf     the configuration object for init.
 * @param {String} conf.AppName  the name of motebus MMA
 * @param {String} conf.IOC      the MMA of IOC
 * @param {String} conf.DCenter  the MMA of device enter
 * @param {String} conf.AppKey   the key string of app
 * @param {String} conf.UseWeb   the communication type that can be 'websocket', 'ajax', or ''
 * @param {openCallback} callback the result callback function 
 */
exports.Open = function( app, ioc, isweb, cb ){
    try {
        console.log('in:init app=%s ioc=%s isweb=%s', app, ioc, isweb);
        appname = app;
		iocmma = ioc;
		useweb = isweb;
        mbusOpen(app, cb);
    }
    catch(e){
        console.log('in:init error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":e.message});
    }
}

/**
 * on event handler
 * @example 
var InmsgRcve = function(ch, head, from, to, msgtype, data){
   console.log('InmsgRcve: channel=%s, from=%s, to=%s, msgtype=%s,
   data=%s', ch, JSON.stringify(from), to, msgtype, JSON.stringify(data));
} 

var InState = function(state){
   console.log(‘InState=%s’, state);
}
 
mChat.On('message',InmsgRcve);
mChat.On('state', InState); 
 * @function OnEvent
 * @param {String} stype "message" is for getxmsg, "state" is for state changed
 * @param {function} cb  the user routine entry
 * @returns {boolean}
 */
exports.On = function( stype, handler ){
	if ( stype == 'message' && typeof handler == 'function' ){
		inmsgcb = handler;
		return true;
	}
	else if ( stype == 'state' && typeof handler == 'function' ){
		eventcb = handler;
		return true;
	}
	return false;
}

// module: motchat get handler of incoming message
// handler: the entry of get handler
exports.GetXmsg = function(handler){
    if ( typeof handler == 'function')
        inmsgcb = handler;
}

// module: send x-message to remote
// mma: destination of MMA
// data: data object sent
// files: files sent
// waitreply: timeout of wait reply, must greater then DefaultXmsgTimeout
// cb: result callback

exports.SendXmsg = function( mma, body, files, waitreply, cb ){
	if ( dbg == 1 ) console.log( '--%s: SendXmsg mma=%s body=%s', CurrentTime(), mma, JSON.stringify(body));
    try {
        sendxmsg( mma, body, files, waitreply, cb );
    }
    catch(e){
        console.log('in:SendXmsg error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":e.message});
    }
}

// module: reply for incoming message
// head: hearder of incoming message
// cb: result callback
exports.ReplyXmsg = function( head, body, cb ){
	if ( dbg == 1 ) console.log( '--%s: ReplyXmsg from=%s body=%s', CurrentTime(), head.from, JSON.stringify(body));
    try {
        replyxmsg( head, body, cb );
    }
    catch(e){
        console.log('in:replyxmsg error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":e.message});
    }
}

exports.PublishXrpc = function(pubapp, func, cb){
	try {
        if ( xrpcstate == '' ){
            startxrpc(function(result){
                if ( result == IN_OKCODE ) {
                    publishxrpc( pubapp, func, cb );
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":"start xrpc error"});
                }
            });    
        }
        else {
            publishxrpc( pubapp, func, cb );
        }
	}
	catch(err){
		console.log('in:publishxrpc error: %s', err.message);
		if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
	}
}

exports.IsolatedXrpc = function(func, cb ){
	try {
		if ( xrpcstate != '' ){
			isolatedxrpc( func, cb );
		}
	}
	catch(err){
		console.log('in:isolatedxrpc error: %s', err.message);
		if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
	}
}

// module: call xrpc to remote
// mma: destination MMA of xprc
// args: argument array
// cb: result callback
exports.CallXrpc = function( mma, func, args, cb ){
	if ( xrpcstate == 'ready'){
		if ( dbg == 1 ) console.log( '--%s: CallXrpc mma=%s func=%s args=%s', CurrentTime(), mma, func, JSON.stringify(args));
		var arr = [];
		if ( Array.isArray(args) == false )
			arr.push(args);
		else
			arr = args;
		if ( dbg == 2 ) console.log( '--%s: CallXrpc mma=%s func=%s arr=%s', CurrentTime(), mma, func, JSON.stringify(arr));
		xrpc.call( mma, func, arr, 10/*Prio*/, DefaultXrpcTimeout/*sec*/, DefaultWaitTimeout )
		.then((result)=>{
			if ( dbg == 1 ) {
				if ( typeof result == 'string')
					console.log( '--%s: CallXrpc result=%s', CurrentTime(), result);
				else
					console.log( '--%s: CallXrpc result=%s', CurrentTime(), JSON.stringify(result));
			}
			if ( typeof cb == 'function' ) cb(result);
		})
		.catch((err)=>{
			console.log( '--%s: CallXrpc error=%s', CurrentTime(), JSON.stringify(err));
			if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
		});
	}
	else {
		if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":"XRPC not ready"});
	}
}

// modules for mbus

var mbusOpen = function( app, cb ){
	motebus = require('motebus');
	motebus.on('ready', function() {
		var state;
		console.log( '--%s: MoteBus Ready', CurrentTime());
		mbstate = 'ready';
		xrpcstate = '';
		if ( firstready == true ) {
			state = mbstate;
			firstready = false;
		}
		else state = mbstate + '2';
		if ( typeof eventcb == 'function') eventcb(state);
		openxmsg( motebus, app, function(result){
            //if ( typeof cb == 'function')cb(result);
            if ( result.ErrCode == IN_OKCODE ){
                var xret = startxrpc();
                console.log('xRPC start: result=%d', xret);
                motebus.getInfo()
                .then(function(result){
                    //console.log("mbusInit getInfo: result: %s", JSON.stringify(result) );
                    mymma = appname + '@' + result.mmpHost;
                    mymmaport = result.mmpPort;
                    mymote = {"DDN":"","EiName":"","EiType":"","EiTag":"","EiHost":"","EiPort":"","EiMMA":"","EiUDID":"","WANIP":""};
                    mymote.EiMMA = mymma;
                    mymote.EiUDID = result.udid;
					mymote.EiHost = result.localIP;
					mymote.EiPort = mymmaport;
                    mymote.WANIP = result.wanIP;
					console.log("in:mbusOpen mymote %s", JSON.stringify(mymote) );
					if ( typeof cb == 'function') cb({"ErrCode":IN_OKCODE,"ErrMsg":IN_OKMSG,"Mote":mymote});
					if ( firstopen == true ) {
						state = mbstate;
						firstopen = false;
					}
					else state = mbstate + '2';
					if ( typeof eventcb == 'function') {
						eventcb(state);
					}
					//reptoboard(appid, '', 'in', 'info', host + ': motebus open', '');
                })
                .catch(function(err){
					console.log("in:mbusOpen error: %s", err.message);
					if ( typeof cb == 'function')cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
                });
			}
			else {
				if ( typeof cb == 'function')cb(result);	
			}
		});
	});
	motebus.on('off', function(){
		console.log( '--%s: MoteBus Off', CurrentTime());
		mbstate = 'off';
		if ( typeof eventcb == 'function') {
			eventcb(mbstate);
		}	
	});
}

var openxmsg = function( motebus, userid, cb ){
	xmsg = motebus.xMsg();
	xmsg.open( userid, '', false, function( err, result ){
		//console.error(err);
		if ( err ){
			console.log('in:openxmsg err=%s', JSON.stringify(err));
		}
		else {
			var ret,state;
			console.log( '--%s: openxmsg=%s', CurrentTime(), result);
			mbstate = 'opened';
			if ( err ) ret = {"ErrCode":IN_ERRCODE,"ErrMsg":err.message};
			else ret = {"ErrCode":IN_OKCODE,"ErrMsg":IN_OKMSG,"Result":result};
			if ( typeof cb == 'function' ) cb( ret );
			//reptoboard(userid, '', 'in', 'info', userid + ': motebus open', '');
		}
	});

	xmsg.on('message', function(msg) {
		//console.log("Incoming Message: id=", msg.head.id, ", body=", JSON.stringify(msg.body), ", files=", msg.files );
		if ( dbg == 1 ) console.log('--%s: message from=%s', CurrentTime(), msg.head.from);
		if ( dbg == 1 ) console.log('--%s: message head=%s,body=%s', CurrentTime(), JSON.stringify(msg.head), JSON.stringify(msg.body));
		if ( typeof msg.body.in.msgtype == 'string' && msg.body.in.msgtype == 'in' ){
			incmdparser( msg );
		}
		else if ( typeof inmsghandler == 'function') {
			inmsghandler( msg );
        }
	});
}

var incmdparser = function(msg){

}

var inmsghandler = function(msg){
	// check msg format
	try {
		if ( typeof inmsgcb == 'function' ) inmsgcb('xmsg', msg.head, msg.body, function(reply){
			replyxmsg(msg.head, reply);
		});
	}
	catch(err){
		var body = {"response":"message","ErrCode":IN_ERRCODE,"ErrMsg":err.message};
		replyxmsg(msg.head, body);
	}
}

var sendxmsg = function( mma, body, files, waitreply, cb ){
	var state;
	if ( dbg == 1 ) console.log('--%s: sendsmsg mma=%s', CurrentTime(), mma);
	if ( dbg == 2 ) console.log('--%s: sendxmsg mma=%s body=%s', CurrentTime(), mma, JSON.stringify(body));
	if ( mbstate == 'opened' ){
		xmsg.send(mma, body, files, 10/*Prio*/, DefaultXmsgTimeout, waitreply, 
		function(err, tkinfo) { 
			if (err) {
				//console.error(err);
				console.log('--%s: sendxmsg: error=%s', CurrentTime(), JSON.stringify(err));
				if ( typeof cb == 'function') cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
			}
			else {
				if ( dbg == 2 ) console.log("--%s: sendxmsg: tkinfo(send) id=%s, state=%s", CurrentTime(), tkinfo.id, tkinfo.state);
				state = tkinfo.state;
				if (state != 'Reply') {
					//console.log("Send Message: tkinfo(send) id=%s, state=%s", tkinfo.id, tkinfo.state);
					if ( waitreply == 0 && state == 'Sent') {
						if ( typeof cb == 'function' ) cb( {"ErrCode":IN_OKCODE,"ErrMsg":IN_OKMSG,"State":state} );
					}
					else if ( state != 'Sent' && state != 'Read' && state != 'End') {
						if ( typeof cb == 'function' ) cb( {"ErrCode":IN_ERRCODE,"ErrMsg":"send error","State":state} );
					}
				}
				else {
					if ( dbg == 1 ) console.log("--%s: sendxmsg Reply from: %s", CurrentTime(), JSON.stringify(tkinfo.msg.head.from) );
					if ( dbg == 2 ) console.log("--%s: sendxmsg Reply: %s", CurrentTime(), JSON.stringify(tkinfo.msg.body) );
					if ( typeof cb == 'function') {
						cb( tkinfo.msg );
					}
				}
			}
		});
	}
	else {
		if ( typeof cb == 'function') cb( {"ErrCode":IN_ERRCODE,"ErrMsg":"motebus not opened"} );
	}
}

var replyxmsg = function(head, body, cb ){
	var state;
	if ( dbg == 1 ) console.log('--%s: replyxmsg from=%s', CurrentTime(), head.from);
	if ( dbg == 2 ) console.log('--%s: replyxmsg body=%s', CurrentTime(), JSON.stringify(body));
	if ( mbstate == 'opened'){
		xmsg.reply( head, body, [], 10/*Prio*/, DefaultXmsgTimeout/*sec*/, 0, 
			function(err, tkinfo) {
				if (err) {
					console.error(err);
					if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
				} else {
					state = tkinfo.state;
					if ( dbg == 2 ) console.log("--%s: replyxmsg: tkinfo(Reply) id=%s state= %s", CurrentTime(), tkinfo.id, state);
					if ( state != 'Sent' && state != 'Read' && state != 'End') {
						if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":"send error","State":state});
					}
					else if ( state == 'Read' ) {
						if ( typeof cb == 'function' ) cb({"ErrCode":IN_OKCODE,"ErrMsg":IN_OKMSG,"State":state});
					}
				}
			}
		);
	}
	else {
		if ( typeof cb == 'function'){
			cb({"ErrCode":IN_ERRCODE,"ErrMsg":"mbus not opened"});
		}
	}
}


var startxrpc = function(cb){
	if ( mbstate == 'opened' || mbstate == 'opened2' ) {
		if ( xrpcstate == '' ){
			xrpc = motebus.xRPC();
			console.log('--%s: xrpc started', CurrentTime());
            xrpcstate = 'ready';
            if ( typeof cb == 'function' ) cb(IN_OKCODE);
            else return IN_OKCODE;
		}
		else if ( xrpcstate == 'ready' ){
            if ( typeof cb == 'function' ) cb(IN_OKCODE);
            else return IN_OKCODE;
		}
    }
    else {
        if ( typeof cb == 'function' ) cb(IN_ERRCODE);
        else return IN_ERRCODE;
    }
}

var publishxrpc = function(pubapp, func, cb){
    if ( xrpcstate == 'ready' &&  pubapp != '' ){
        console.log( 'in:publishxrpc pubapp=%s', pubapp );
        xrpc.publish( pubapp, func )
        .then( function(result){
            console.log('in:publishxrpc app=%s result=%s', pubapp, result);
            if ( typeof cb == 'function' ) cb({"ErrCode":IN_OKCODE,"ErrMsg":IN_OKMSG,"Result":result});
        })
        .catch( function(err){
            console.log('in:publishxrpc app=%s error=%s', pubapp, err.message);
            if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
        });
    }
    else {
        console.log('in:publishxrpc error: xrpc not ready of appname is empty');
        if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":"xrpc not ready of appname is empty"});
    }
}

var isolatedxrpc = function(func, cb){
    if ( xrpcstate == 'ready' ){
        xrpc.isolated( func )
        .then( function(result){
            console.log('in:isolatedxrpc result=%s', result);
            if ( typeof cb == 'function' ) cb({"ErrCode":IN_OKCODE,"ErrMsg":IN_OKMSG,"Result":result});
        })
        .catch( function(err){
            console.log('in:isolatedxrpc error=%s', err.message);
            if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":err.message});
        });
    }
    else {
        console.log('in:isolatedxrpc error: xrpc not ready of appname is empty');
        if ( typeof cb == 'function' ) cb({"ErrCode":IN_ERRCODE,"ErrMsg":"xrpc not ready of appname is empty"});
    }
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}