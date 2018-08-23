// in: module for in layer (motebus)
// Date: 2018/07/06
// Version: 0.99

var exports = module.exports = {};
var useweb = false;
var appname = '';
var iocmma = '';

var motebus;
var inmsgcb;
var eventcb;
var mbstate = '';
//var mymote = {"DDN":"","EiName":"","EiType":"","EiTag":"","EiHost":"","EiPort":"","EiMMA":"","EiUDID":"","WANIP":""};
var mymote = {"EiHost":"","EiPort":"","EiMMA":"","EiUDID":"","WANIP":""};
var mymma = '';
var mymmaport = '';
var xrpc;
var xrpcstate = '';

/*
var inerr.IN_OKCODE = 0;
var inerr.IN_OKMSG = "OK";
var inerr.IN_ERRCODE = -253;
*/

var DefaultXmsgTimeout = 8;
var DefaultXrpcTimeout = 9;
var DefaultWaitTimeout = 16;
var dbg = 0;		// debug level: 0, 1, 2
var firstready = true;
var firstopen = true;
var inerr;

const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// module: open IN layer
// appname: app name used as MMA 
// ioc: the MMA of IOC
// isweb: web type, there are "", "websocket", "ajax"
// cb: init result callback
exports.Open = function( app, ioc, isweb, cb ){
    try {
		inerr = require('./mcerr.js');
        console.log('in:init app=%s ioc=%s isweb=%s', app, ioc, isweb);
        appname = app;
		iocmma = ioc;
		useweb = isweb;
        mbusOpen(app, function(result){
			//console.log('in:Open mbusOpen result=%s', JSON.stringify(result));
			if ( typeof cb == 'function' ) cb(result);
		});
    }
    catch(e){
        console.log('in:init error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
    }
}

// module: motchat event handler
// stype: "message" is for incoming message, "state" is for state changed
// handler: the entry of get handler
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
// timeout: timeout of send message
// waitreply: timeout of wait reply, must greater then DefaultXmsgTimeout
// cb: result callback

exports.SendXmsg = function( mma, body, files, timeout, waitreply, cb ){
	if ( dbg >= 1 ) console.log( '--%s: SendXmsg mma=%s body=%s', CurrentTime(), mma, JSON.stringify(body));
    try {
		var t1, t2;
		if ( timeout == null ) t1 = DefaultXmsgTimeout;
		else t1 = timeout;
		if ( waitreply == null ) t2 = DefaultWaitTimeout;
		else t2 = waitreply;
        sendxmsg( mma, body, files, t1, t2, cb );
    }
    catch(e){
        console.log('in:SendXmsg error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
    }
}

// module: reply for incoming message
// head: hearder of incoming message
// cb: result callback
exports.ReplyXmsg = function( head, body, timeout, cb ){
	//if ( dbg == 1 ) console.log( '--%s: ReplyXmsg from=%s body=%s', CurrentTime(), head.from, JSON.stringify(body));
    try {
		var t1;
		if ( timeout == null ) t1 = DefaultXmsgTimeout;
		else t1 = timeout;
        replyxmsg( head, body, t1, cb );
    }
    catch(e){
        console.log('in:replyxmsg error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
    }
}

exports.PublishXrpc = function(pubapp, func, cb){
	try {
        if ( xrpcstate == '' ){
            startxrpc(function(result){
                if ( result == inerr.IN_OKCODE ) {
                    publishxrpc( pubapp, func, cb );
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPCFail,"ErrMsg":inerr.IN_XRPCFail_Msg});
                }
            });    
        }
        else {
            publishxrpc( pubapp, func, cb );
        }
	}
	catch(err){
		console.log('in:publishxrpc error: %s', err.message);
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
	}
}

exports.IsolatedXrpc = function(func, cb ){
	try {
		console.log('in:IsolatedXrpc xrpcstate=%s', xrpcstate);
		if ( xrpcstate == '' ){
            startxrpc(function(result){
                if ( result == inerr.IN_OKCODE ) {
                    isolatedxrpc( func, cb );
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPCFail,"ErrMsg":inerr.IN_XRPCFail_Msg});
                }
            });    
        }
        else {
            isolatedxrpc( func, cb );
        }
		/*
		if ( xrpcstate != '' ){
			isolatedxrpc( func, cb );
		}
		*/
	}
	catch(err){
		console.log('in:isolatedxrpc error: %s', err.message);
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
	}
}

// module: call xrpc to remote
// mma: destination MMA of xprc
// args: argument array
// timeout: timeout of call xrpc
// waitreply: wait time of call xrpc
// cb: result callback
exports.CallXrpc = function( mma, func, args, timeout, waitreply, cb ){
	if ( xrpcstate == 'ready'){
		if ( dbg >= 1 ) console.log( '--%s: CallXrpc mma=%s func=%s args=%s', CurrentTime(), mma, func, JSON.stringify(args));
		var arr = [];
		if ( Array.isArray(args) == false )
			arr.push(args);
		else
			arr = args;
		if ( dbg == 0 ) console.log( '--%s: CallXrpc mma=%s func=%s arr=%s', CurrentTime(), mma, func, JSON.stringify(arr));
		var t1, t2;
		if ( timeout == null ) t1 = DefaultXrpcTimeout;
		else t1 = timeout;
		if ( waitreply == null ) t2 = DefaultWaitTimeout;
		else t2 = waitreply;
		xrpc.call( mma, func, arr, 10/*Prio*/, t1, t2 )
		.then((result)=>{
			if ( dbg >= 1 ) {
				if ( typeof result == 'string')
					console.log( '--%s: CallXrpc result=%s', CurrentTime(), result);
				else
					console.log( '--%s: CallXrpc result=%s', CurrentTime(), JSON.stringify(result));
			}
			if ( typeof cb == 'function' ) cb(result);
		})
		.catch((err)=>{
			console.log( '--%s: CallXrpc error=%s', CurrentTime(), JSON.stringify(err));
			if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
		});
	}
	else {
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
	}
}

exports.GetmbWIP = function(cb){
	if ( typeof cb == 'function') {
		mbusInfo( function(reply){
			console.log('in:GetmbWIP mbusinfo reply=%s', JSON.stringify(reply));
			if ( reply.ErrCode == inerr.IN_OKCODE ){
				mymote.WANIP = reply.result.wanIP;
				cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"WANIP":reply.result.wanIP,"Mote":mymote});
			}
			else
				cb(reply);	
		});
	}
}

exports.iocEvent = function(evId, evSource, evType, evClass, evBody){
	iocEvent(evId, evSource, evType, evClass, evBody);
}

// modules for mbus

var doready = null;

var mbusOpen = function( app, cb ){
	if ( typeof cb == 'function' ) doready = cb;
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
            if ( result.ErrCode == inerr.IN_OKCODE ){
                var xret = startxrpc();
				console.log('in:xRPC start: result=%d', xret);
				SetupMyInfo(function(reply){
					if ( typeof doready == 'function' ) doready(reply);
				});
			}			
			else {
				if ( typeof doready == 'function') doready(result);
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
	xmsg.open( userid, 'zaq1234', false, function( err, result ){
		//console.log('in:openxmsg err=%s, result=%s', err, result);
		var ret;
		if ( err ){
			console.log('in:openxmsg err=%s', err);
		}
		if (result) {
			console.log( '--%s: openxmsg=%s', CurrentTime(), result);
			mbstate = 'opened';
			ret = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Result":result};
		}
		else {
			ret = {"ErrCode":inerr.IN_XMsgFail,"ErrMsg":inerr.IN_XMsgFail_Msg};
		}
		if ( typeof cb == 'function' ) cb( ret );
		if ( mbstate == 'opened'){
			var state;
			if ( firstopen == true ) {
				state = mbstate;
				firstopen = false;
			}
			else state = mbstate + '2';
			if ( typeof eventcb == 'function') eventcb(state);
		}
	});

	xmsg.on('message', function(msg) {
		//console.log("Incoming Message: id=", msg.head.id, ", body=", JSON.stringify(msg.body), ", files=", msg.files );
		if ( dbg >= 1 ) console.log('--%s: message from=%s', CurrentTime(), msg.head.from);
		if ( dbg >= 1 ) console.log('--%s: message head=%s,body=%s', CurrentTime(), JSON.stringify(msg.head), JSON.stringify(msg.body));
		if ( typeof msg.body.in.msgtype == 'string' && msg.body.in.msgtype == 'in' ){
			incmdparser( msg );
		}
		else if ( typeof inmsghandler == 'function') {
			inmsghandler( msg );
        }
	});
}

var SetupMyInfo = function( cb ){
	mbusInfo(function(reply){
		if ( dbg >= 1 ) console.log('SetupMyInfo:mbusInfo reply=%s', JSON.stringify(reply));
		if ( reply.ErrCode == inerr.IN_OKCODE ){
			mymma = appname + '@' + reply.result.mmpHost;
			mymmaport = reply.result.mmpPort;
			mymote.EiMMA = mymma;
			mymote.EiUDID = reply.result.udid;
			mymote.EiHost = reply.result.localIP;
			mymote.EiPort = mymmaport;
			mymote.WANIP = reply.result.wanIP;
			//console.log("in:getmbInfo mymote %s", JSON.stringify(mymote) );
			if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Mote":mymote});
		}
		else {
			if ( typeof cb == 'function' ) cb(result);
		}
	});
}

var mbusInfo = function( cb, errcb ){
	motebus.getInfo()
	.then(function(result){
		//console.log("in:mbusInfo result: %s", JSON.stringify(result));
		if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":result});
	})
	.catch(function(err){
		//console.log("in:mbusInfo error: %s", err.message);
		if ( typeof errcb == 'function') errcb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
	});	
}


var incmdparser = function(msg){

}

var inmsghandler = function(msg){
	// check msg format
	try {
		if ( typeof inmsgcb == 'function' ){
			inmsgcb('xmsg', msg.head, msg.body, function(reply){
				replyxmsg(msg.head, reply, DefaultXmsgTimeout);
			});
		}
		else {
			var reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":"OK"};
			replyxmsg(msg.head, reply, DefaultXmsgTimeout);
		}
	}
	catch(err){
		var body = {"response":"message","ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message};
		replyxmsg(msg.head, body, DefaultXmsgTimeout);
	}
}

var sendxmsg = function( mma, body, files, t1, t2, cb ){
	var state;
	if ( dbg >= 1 ) console.log('--%s: sendsmsg mma=%s,t1=%d,t2=%d', CurrentTime(), mma, t1, t2);
	if ( dbg == 2 ) console.log('--%s: sendxmsg mma=%s body=%s', CurrentTime(), mma, JSON.stringify(body));
	if ( mbstate == 'opened' ){
		xmsg.send(mma, body, files, 10/*Prio*/, t1, t2, 
		function(err, tkinfo) { 
			if (err) {
				//console.error(err);
				console.log('--%s: sendxmsg: error=%s', CurrentTime(), JSON.stringify(err));
				if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
			}
			else {
				if ( dbg == 2 ) console.log("--%s: sendxmsg: tkinfo(send) id=%s, state=%s", CurrentTime(), tkinfo.id, tkinfo.state);
				state = tkinfo.state;
				if (state != 'Reply') {
					//console.log("Send Message: tkinfo(send) id=%s, state=%s", tkinfo.id, tkinfo.state);
					if ( t2 == 0 && state == 'Sent') {
						if ( typeof cb == 'function' ) cb( {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"State":state} );
					}
					else if ( state != 'Sent' && state != 'Read' && state != 'End') {
						if ( typeof cb == 'function' ) cb( {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":state,"State":state} );
					}
				}
				else {
					if ( dbg >= 1 ) console.log("--%s: sendxmsg Reply from: %s", CurrentTime(), JSON.stringify(tkinfo.msg.head.from) );
					if ( dbg == 2 ) console.log("--%s: sendxmsg Reply: %s", CurrentTime(), JSON.stringify(tkinfo.msg.body) );
					if ( typeof cb == 'function') {
						cb( tkinfo.msg );
					}
				}
			}
		});
	}
	else {
		if ( typeof cb == 'function') cb( {"ErrCode":inerr.IN_Mbus_NotOpen,"ErrMsg":inerr.IN_Mbus_NotOpen_Msg} );
	}
}

var replyxmsg = function(head, body, t1, cb ){
	var state;
	if ( dbg >= 1 ) console.log('--%s: replyxmsg from=%s', CurrentTime(), head.from);
	if ( dbg == 2 ) console.log('--%s: replyxmsg body=%s', CurrentTime(), JSON.stringify(body));
	if ( mbstate == 'opened'){
		xmsg.reply( head, body, [], 10/*Prio*/, t1, 0, 
			function(err, tkinfo) {
				if (err) {
					console.error(err);
					if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
				} else {
					state = tkinfo.state;
					if ( dbg == 2 ) console.log("--%s: replyxmsg: tkinfo(Reply) id=%s state= %s", CurrentTime(), tkinfo.id, state);
					if ( state != 'Sent' && state != 'Read' && state != 'End') {
						if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":state,"State":state});
					}
					else if ( state == 'Read' ) {
						if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"State":state});
					}
				}
			}
		);
	}
	else {
		if ( typeof cb == 'function'){
			cb({"ErrCode":inerr.IN_Mbus_NotOpen,"ErrMsg":inerr.IN_Mbus_NotOpen_Msg});
		}
	}
}

var startxrpc = function(cb){
	if ( mbstate == 'opened' || mbstate == 'opened2' ) {
		if ( xrpcstate == '' ){
			xrpc = motebus.xRPC();
			console.log('--%s: xrpc started', CurrentTime());
            xrpcstate = 'ready';
            if ( typeof cb == 'function' ) cb(inerr.IN_OKCODE);
            else return inerr.IN_OKCODE;
		}
		else if ( xrpcstate == 'ready' ){
            if ( typeof cb == 'function' ) cb(inerr.IN_OKCODE);
            else return inerr.IN_OKCODE;
		}
    }
    else {
        if ( typeof cb == 'function' ) cb(inerr.IN_ERRCODE);
        else return inerr.IN_ERRCODE;
    }
}

var publishxrpc = function(pubapp, func, cb){
    if ( xrpcstate == 'ready' ){
		if ( pubapp != '' ){
			console.log( 'in:publishxrpc pubapp=%s', pubapp );
			xrpc.publish( pubapp, func )
			.then( function(result){
				console.log('in:publishxrpc app=%s result=%s', pubapp, result);
				if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Result":result});
			})
			.catch( function(err){
				console.log('in:publishxrpc app=%s error=%s', pubapp, err.message);
				if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
			});
		}
		else {
			if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg})
		}
    }
    else {
        console.log('in:publishxrpc error: xrpc not open');
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
    }
}

var isolatedxrpc = function(func, cb){
    if ( xrpcstate == 'ready' ){
        xrpc.isolated( func )
        .then( function(result){
            console.log('in:isolatedxrpc result=%s', result);
            if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Result":result});
        })
        .catch( function(err){
            console.log('in:isolatedxrpc error=%s', err.message);
            if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
        });
    }
    else {
        console.log('in:isolatedxrpc error: xrpc not open');
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
    }
}

// evID: event id.
// evSource: source URI of event.
// evType: type of event: 'info', 'error'
// evClass: class of event: 'in', 'proc', 'qqn'
// evBody: payload of event.
var iocEvent = function( evId, evSource, evType, evClass, evBody ){
	var eid;
	if ( evId == '' ) eid = CreateTicket(7);
	else eid = evId;
	var evData = {"EventType":evType,"EventClass":evClass,"EventBody":evBody};
	var evpack = {"eventType":"com.ypcloud.dc","cloudEventsVersion":"0.1","source":evSource,"eventID":eid,"data":evData};
	if ( iocmma != '' ){
		if ( dbg >= 1 ) console.log('in:iocEvent evpack=%s', JSON.stringify(evpack));
		sendxmsg( iocmma, evpack, [], 6, 0, function(result){
			if ( dbg >= 1 ) console.log('iocEvent: send result=%s', JSON.stringify(result));
		});
	}	
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}

var CreateTicket =function(len) {
    var text = "";
    for (var i = 0; i < len; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}