// in: module for in layer (motebus)
// Date: 2019/11/21
// Version: 1.1.2
// Update: for motebus v2.3.0
//         fix the bug of motebus startup

var exports = module.exports = {};
var ver = '1.1.2';
var update = '2019/11/21';
var appname = '';
var iocmma = '';
var mbusgw = '';
var mbusport = 0;

var motebus;
var inmsgcb;
var eventcb;
var ineventcb;
var mbmsgcb;
var mbstate = '';
var mymote = {"EiMMA":"","EiPort":"","EiUDID":"","EiHost":"","WANIP":""};
var mymma = '';
var mymmaport = '';
var xmsg;
var xrpc;
var xrpcstate = '';
var iocsdq = [];
var ioctry = 0;
var DefaultXmsgTimeout = 10;
var DefaultXrpcTimeout = 10;
var DefaultWaitTimeout = 20;
var dbg = 0;					// debug level: 0, 1, 2
var firstready = true;
var firstopen = true;
var inerr;
const IOCQLength = 30;
const IOCMaxTry = 3;

const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

// module: open IN layer
// conf: configuration 
// cb: init result callback
exports.Open = function( conf, cb ){
    try {
		inerr = require('./mcerr.js');
		if ( conf ){
			appname = conf.AppName ? conf.AppName : '';
			iocmma = conf.IOC ? conf.IOC : '';
			if ( iocmma ){
				if ( iocmma.indexOf('@') < 0 ) iocmma = '';
			}
			mbusgw = conf.MotebusGW ? conf.MotebusGW : '';
			if ( mbusgw ){
				if ( mbusgw.indexOf(':') > 0 ){
					let marr = mbusgw.split(':');
					mbusgw = marr[0].trim();
					mbusport = marr[1].trim();
				}
			}
			console.log('in:Open version=%s,update=%s', ver, update);
			console.log('in:Open appname=%s iocmma=%s mbusgw=%s', appname, iocmma, mbusgw);
			mbusOpen(appname, function(result){
				//console.log('in:Open mbusOpen result=%s', JSON.stringify(result));
				if ( typeof cb == 'function' ) cb(result);
			});
		}
        else {
			if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg});
		}
    }
    catch(e){
        console.log('in:Open error=%s', e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + e.message});
    }
}

// module: motechat event handler
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
	else if ( stype == 'event' && typeof handler == 'function' ){
		ineventcb = handler;
		return true;
	}
	else if ( stype == 'mbus' && typeof handler == 'function' ){
		//console.log('in:On mbmsg');
		mbmsgcb = handler;
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
	if ( dbg >= 2 ) console.log( '--%s: SendXmsg mma=%s body=%s', CurrentTime(), mma, JSON.stringify(body));
    try {
		var t1, t2;
		if ( timeout == null ) t1 = DefaultXmsgTimeout;
		else t1 = timeout;
		if ( waitreply == null ) t2 = DefaultWaitTimeout;
		else t2 = waitreply;
        sendxmsg( mma, body, files, t1, t2, cb );
    }
    catch(e){
		console.log( '--%s: CallXmsg to=%s, error=%s', CurrentTime(), mma, e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + e.message,"MMA":mma});
    }
}

// module: reply for incoming message
// head: hearder of incoming message
// cb: result callback
exports.ReplyXmsg = function( head, body, timeout, cb ){
	if ( dbg >= 2 ) console.log( '--%s: ReplyXmsg from=%s body=%s', CurrentTime(), head.from, JSON.stringify(body));
    try {
		var t1;
		if ( timeout == null ) t1 = DefaultXmsgTimeout;
		else t1 = timeout;
        replyxmsg( head, body, t1, cb );
    }
    catch(e){
        console.log('in:replyxmsg to=%s error=%s', head.from, e.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + e.message});
    }
}

exports.PublishXrpc = function(pubapp, func, cb){
	try {
        if ( xrpcstate == '' ){
            openxrpc(function(result){
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
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
	}
}

exports.IsolatedXrpc = function(func, cb ){
	try {
		//console.log('in:IsolatedXrpc xrpcstate=%s', xrpcstate);
		if ( xrpcstate == '' ){
            openxrpc(function(result){
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
	}
	catch(err){
		console.log('in:isolatedxrpc error: %s', err.message);
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
	}
}

// module: call xrpc to remote
// mma: destination MMA of xrpc
// args: argument array
// timeout: timeout of call xrpc
// waitreply: wait time of call xrpc
// cb: result callback
exports.CallXrpc = function( mma, func, args, timeout, waitreply, cb ){
	if ( xrpcstate == 'ready' && ( mbstate == 'opened' || mbstate == 'opened2' )){
		if ( dbg == 0 && args.to ) console.log('--%s: CallXprc to:%s', CurrentTime(), JSON.stringify(args.to));
		else if ( dbg >= 1 ) console.log( '--%s: CallXrpc mma=%s func=%s args=%s', CurrentTime(), mma, func, JSON.stringify(args));
		try {
			var arr = [];
			var t1, t2;
			if ( Array.isArray(args) == false )
				arr.push(args);
			else
				arr = args;
			if ( dbg >= 1 ) console.log( '--%s: CallXrpc mma=%s func=%s arr=%s', CurrentTime(), mma, func, JSON.stringify(arr));
			if ( timeout == null ) t1 = DefaultXrpcTimeout;
			else t1 = timeout;
			if ( waitreply == null ) t2 = DefaultWaitTimeout;
			else t2 = waitreply;
			xrpc.call( mma, func, arr, 10/*Prio*/, t1, t2 )
			.then((result)=>{
				if ( dbg == 0 ) {
					console.log("--%s: CallXrpc %s OK", CurrentTime(), mma );
				}
				else if ( dbg >= 1 ) {
					console.log( '--%s: CallXrpc result=%s', CurrentTime(), JSON.stringify(result));
				}
				if ( typeof cb == 'function' ) cb(result);
			})
			.catch((err)=>{
				console.log( '--%s: CallXrpc %s, error=%s', CurrentTime(), mma, JSON.stringify(err));
				if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message,"MMA":mma});
			});
		}
		catch(e){
			console.log( '--%s: CallXrpc %s, error=%s', CurrentTime(), mma, e.message);
			if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + e.message,"MMA":mma});
		}
	}
	else {
		if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
	}
}

exports.GetmbWIP = function(cb){
	if ( typeof cb == 'function') {
		mbusInfo( function(reply){
			if ( dbg >= 0 ) console.log('in:GetmbWIP mbusinfo reply=%s', JSON.stringify(reply));
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
	if ( iocmma ){
		if ( iocsdq.length < IOCQLength ){
			let ioc = {"evId":evId,"evSource":evSource,"evType":evType,"evClass":evClass,"evBody":evBody};
			iocsdq.push(ioc);
			if ( iocsdq.length == 1 ) iocEventHandler();
		}
		else console.log('in:iocEvent ioc queue overflow');
	}
}

exports.CurrentTime = function(){
	return CurrentTime();
}


// modules for mbus

var mbusOpen = function( app, cb ){
	let doready = null;
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
		else {
			state = mbstate + '2';
			doready = null;
		}
		if ( typeof eventcb == 'function') eventcb(state);
		let dm = 300 + Math.floor((Math.random() * 10) + 1) * 200;
		msdelay(dm).then(() => {
			openxmsg( app, function(result){
				//if ( typeof cb == 'function')cb(result);
				//console.log('in: openxmsg result=%s', JSON.stringify(result));
				if ( result.ErrCode == inerr.IN_OKCODE ){
					mbusInfo(function(reply){
						//console.log('--%s: Get mbinfo %s', CurrentTime(), JSON.stringify(reply));
						if ( reply.ErrCode == inerr.IN_OKCODE && reply.result ){
							SaveMyInfo(reply.result);
							let replyok = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Mote":mymote};
							if ( typeof doready == 'function' ) doready(replyok);
						}
						else {
							if ( typeof doready == 'function' ) doready(reply);
						}
					});
				}			
				else {
					if ( typeof doready == 'function') doready(result);
				}
			});
		});
	});
	motebus.on('off', function(){
		console.log( '--%s: MoteBus Off', CurrentTime());
		iocsdq = [];
		ioctry = 0;
		if ( mbstate != 'off' ){
			mbstate = 'off';
			if ( typeof eventcb == 'function') {
				eventcb(mbstate);
			}	
		}
	});
	//motebus.startUp();
	console.log('Motebus gateway=%s,port=%d', mbusgw, mbusport);
	if ( mbusgw && mbusport )
		motebus.startUp(mbusgw, mbusport, appname);
	else if ( mbusgw )
		motebus.startUp(mbusgw, 0, appname);
	else
		motebus.startUp("", 0, appname);
}

var openxmsg = function( userid, cb ){
	xmsg = motebus.xMsg();
	xmsg.open( userid, 'zaq1234', true, function( err, result ){
		// true: keep one agent
		//console.log('in:openxmsg err=%s, result=%s', err, result);
		var ret;
		if ( err ){
			console.log('in:openxmsg err=%s', err);
			ret = {"ErrCode":inerr.IN_XMsgFail,"ErrMsg":inerr.IN_XMsgFail_Msg,"error":err};
		}
		if (result) {
			if ( dbg >= 0 ) console.log( '--%s: open xmsg %s', CurrentTime(), result);
			mbstate = 'opened';
			//ret = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Result":result};
			xmsg.on('message', function(msg) {
				//console.log("Incoming Message: id=", msg.head.id, ", body=", JSON.stringify(msg.body), ", files=", msg.files );
				if ( dbg >= 0 ) console.log('--%s: message from=%s', CurrentTime(), msg.head.from);
				if ( dbg >= 0 ){
					//console.log('--%s: message from=%s', CurrentTime(), JSON.stringify(msg.head));
					console.log('--%s: message body=%s', CurrentTime(), JSON.stringify(msg.body));
				}
				if ( msg.body.eventType ){
					if ( typeof ineventcb == 'function' ){
						//ineventcb('xmsg', msg.head, msg.body, function(reply){
						//	replyxmsg(msg.head, reply, DefaultXmsgTimeout);
						//});
						ineventcb('xmsg', msg.head, msg.body );
					}
				}
				else if ( msg.body.in ){
					if ( typeof inmsghandler == 'function') {
						inmsghandler( msg );
						//let reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG};
						//replyxmsg(msg.head, reply, DefaultXmsgTimeout);
					}
				}
				else {
					if ( typeof mbmsgcb == 'function' ){
						console.log('motebus message');
						mbmsgcb(msg.head.from, msg.body, function(reply){
							console.log('in: mbus msg reply=%s', JSON.stringify(reply));
							replyxmsg(msg.head, reply, DefaultXmsgTimeout);
						});
					}
					else {
						console.log('--%s: unknown message body=%s', CurrentTime(), JSON.stringify(msg.body));
					}
				}
			});
			openxrpc(function(){
				ret = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":result};
				if ( typeof cb == 'function' ) cb( ret );
			})
		}
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
}


var SaveMyInfo = function( info ){
	try {
		if ( info ){
			//console.log('SaveMyInfo info=%s', JSON.stringify(info));
			mymma = appname + '@' + info.mmpHost;
			mymmaport = info.mmpPort;
			mymote.EiPort = mymmaport;
			mymote.EiMMA = mymma;
			mymote.EiUDID = info.udid;
			mymote.EiHost = info.localIP;
			mymote.WANIP = info.wanIP;
			console.log('in: mma=%s, port=%s', mymma, mymmaport);
			return true;
		}
		else return false;
	}
	catch(e){
		console.log('SaveMyInfo error: %s', e.message);
		return false;
	}
}

var mbusInfo = function( cb ){
	motebus.getInfo()
	.then(function(result){
		console.log("--%s: in:mbus.getInfo result: %s", CurrentTime(), JSON.stringify(result));
		if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":result});
	})
	.catch(function(err){
		//console.log("in:mbus.getInfo error: %s", err.message);
		if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
	});	
}

var inmsghandler = function(msg){
	// check msg format
	try {
		if ( typeof inmsgcb == 'function' ){
			inmsgcb('xmsg', msg.head, msg.body, function(reply){
				if ( dbg >= 1 ) console.log('--%s: message reply=%s', CurrentTime(), JSON.stringify(reply));
				replyxmsg(msg.head, reply, DefaultXmsgTimeout);
			});
		}
		else {
			var reply = {"ErrCode":inerr.IN_NoRcveFunc,"ErrMsg":inerr.IN_NoRcveFunc_Msg};
			replyxmsg(msg.head, reply, DefaultXmsgTimeout);
		}
	}
	catch(err){
		var body = {"response":"message","ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message};
		replyxmsg(msg.head, body, DefaultXmsgTimeout);
	}
}

var sendxmsg = function( mma, body, files, t1, t2, cb ){
	var state;
	//console.log('--%s: sendxmsg mma=%s', CurrentTime(), mma);
	if ( dbg == 0 && body.to ) {
		if ( body.to )
			console.log('--%s: sendxmsg to:%s', CurrentTime(), JSON.stringify(body.to));
		else
			console.log('--%s: sendxmsg mma=%s', CurrentTime(), mma);
	}
	else if ( dbg >= 1 ){
		console.log('--%s: sendxmsg mma=%s,body=%s', CurrentTime(), mma, JSON.stringify(body));
	}
	if ( mbstate == 'opened' || mbstate == 'opened2' ){
		xmsg.send(mma, body, files, 10/*Prio*/, t1, t2, 
		function(err, tkinfo) { 
			if (err) {
				//console.error(err);
				console.log('--%s: sendxmsg to=%s error=%s', CurrentTime(), mma, JSON.stringify(err));
				if ( typeof cb == 'function') cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message,"By":mma});
			}
			else {
				if ( dbg >= 2 ) console.log("--%s: sendxmsg: tkinfo(send) id=%s, state=%s", CurrentTime(), tkinfo.id, tkinfo.state);
				state = tkinfo.state;
				if (state != 'Reply') {
					//console.log("Send Message: tkinfo(send) id=%s, state=%s", tkinfo.id, tkinfo.state);
					if ( t2 == 0 && state == 'Read') {
						if ( dbg >= 1 ) console.log("--%s: sendxmsg to=%s state=%s", CurrentTime(), mma, state);
						if ( typeof cb == 'function' ) cb( {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"State":state} );
					}
					else if ( state != 'Sent' && state != 'Read' && state != 'End') {
						console.log("--%s: sendxmsg to=%s state=%s", CurrentTime(), mma, state);
						if ( typeof cb == 'function' ) cb( {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":state,"State":state} );
					}
				}
				else {
					let {body} = tkinfo.msg;
					if ( body ){
						if ( dbg == 0 ) console.log("--%s: sendxmsg to=%s OK", CurrentTime(), mma);
						else if ( dbg >= 1 ) console.log("--%s: sendxmsg Reply from: %s", CurrentTime(), JSON.stringify(tkinfo.msg.head.from) );
						else if ( dbg >= 2 ) console.log("--%s: sendxmsg Reply body: %s", CurrentTime(), JSON.stringify(tkinfo.msg.body) );
						//console.log("--%s: sendxmsg Reply body: %s", CurrentTime(), JSON.stringify(body) );
						if ( typeof cb == 'function') {
							cb( tkinfo.msg );
						}
					}
				}
			}
		});
	}
	else {
		var errmsg = {"ErrCode":inerr.IN_Mbus_NotOpen,"ErrMsg":inerr.IN_Mbus_NotOpen_Msg};
		if ( typeof cb == 'function') cb( errmsg );
		console.log("--%s: sendxmsg to=%s error: %s", CurrentTime(), mma, JSON.stringify(errmsg))
	}
}

var replyxmsg = function(head, body, t1, cb ){
	var state;
	if ( dbg >= 0 ) console.log('--%s: replyxmsg to=%s', CurrentTime(), head.from);
	if ( dbg >= 2 ) console.log('--%s: replyxmsg body=%s', CurrentTime(), JSON.stringify(body));
	if ( mbstate == 'opened' || mbstate == 'opened2'){
		xmsg.reply( head, body, [], 10/*Prio*/, t1, 0, 
			function(err, tkinfo) {
				if (err) {
					console.log("--%s: replyxmsg: to=%s err=%s", CurrentTime(), head.from, err.message);
					if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
				} else {
					state = tkinfo.state;
					//if ( dbg >= 2 ) console.log("--%s: replyxmsg: to=%s state=%s", CurrentTime(), head.from, state);
					if ( state != 'Sent' && state != 'Read' && state != 'End') {
						if ( dbg >= 0 ) console.log("--%s: replyxmsg: to=%s state=%s", CurrentTime(), head.from, state);
						if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":state,"State":state});
					}
					else if ( state == 'Read' ) {
						if ( dbg >= 1 ) console.log("--%s: replyxmsg: to=%s state=%s", CurrentTime(), head.from, state);
						if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"State":state});
					}
				}
			}
		);
	}
	else {
		if ( typeof cb == 'function'){
			var errmsg = {"ErrCode":inerr.IN_Mbus_NotOpen,"ErrMsg":inerr.IN_Mbus_NotOpen_Msg};
			cb(errmsg);
			console.log("--%s: replyxmsg: to=%s err=%s", CurrentTime(), head.from, JSON.stringify(errmsg));
		}
	}
}

var openxrpc = function(cb){
	if ( mbstate == 'opened' || mbstate == 'opened2' ) {
		if ( xrpcstate == '' ){
			xrpc = motebus.xRPC();
			console.log('--%s: open xrpc', CurrentTime());
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
				if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
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
            if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
        });
    }
    else {
        console.log('in:isolatedxrpc error: xrpc not open');
        if ( typeof cb == 'function' ) cb({"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg});
    }
}


var iocEventHandler = function(){
	if ( iocsdq.length > 0 && (mbstate == 'opened'|| mbstate == 'opened2' )){
		let {evId,evSource,evType,evClass,evBody} = iocsdq[0];
		iocEvent(evId, evSource, evType, evClass, evBody, function(result){
			//iocsdq.splice(0, 1);
			if ( result == 'Read' ){
				ioctry = 0;
				iocsdq.splice(0, 1);
				//iocEventHandler();
				let tm = Math.floor((Math.random() * 10) + 1) * 100;;
				setTimeout(function(){
					iocEventHandler();
				}, tm);
			}
			else {
				if ( result == 'AddrNotFound' ) {
					iocsdq = [];
					ioctry = 0;
				}
				else {
					if ( ioctry < IOCMaxTry ){
						ioctry += 1;
						let tm = 1000 + Math.floor((Math.random() * 10) + 1) * 100;;
						setTimeout(function(){
							iocEventHandler();
						}, tm);
					}
					else {
						iocsdq = [];
						ioctry = 0;
					}
				}
			}
		});
	}
	else {
		iocsdq = [];
		ioctry = 0;
	}
}

// evID: event id.
// evSource: source URI of event.
// evType: type of event: 'info', 'error'
// evClass: class of event: 'in', 'proc', 'qqn'
// evBody: payload of event.
var iocEvent = function( evId, evSource, evType, evClass, evBody, cb ){
	try {
		if ( iocmma && (mbstate == 'opened' || mbstate == 'opened2') ) {
			let eid;
			if ( evId == '' ) eid = CreateTicket(7);
			else eid = evId;
			var evData = {"MsgType":evType,"MsgClass":evClass,"MsgBody":evBody};
			if ( dbg >= 2 ) console.log('in:iocEvent evdata=%s', JSON.stringify(evData));
			var evpack = {"eventType":"com.ypcloud.dc","cloudEventsVersion":"0.1","source":evSource,"eventID":eid,"data":evData};
			if ( dbg >= 2 ) console.log('in:iocEvent evpack=%s', JSON.stringify(evpack));
			//sendxmsg( iocmma, evpack, [], DefaultXmsgTimeout, 0, function(result){
			//	if ( dbg >= 2 ) console.log('iocEvent: send result=%s', JSON.stringify(result));
			//});
			let t1 = DefaultXmsgTimeout;
			xmsg.send(iocmma, evpack, [], 10/*Prio*/, t1, 0, 
				function(err, tkinfo) { 
					if (err) {
						//console.error(err);
						console.log('--%s: sendxmsg to ioc: error=%s', CurrentTime(), JSON.stringify(err));
						if ( typeof cb == 'function' ) cb(err.message);
					}
					else {
						let state = tkinfo.state;
						if ( state != 'Sent' && state != 'Read' && state != 'End' && state != 'Reply') {
							if ( typeof cb == 'function' ) cb(state);
						}
						else if (state == 'Read') {
							console.log('--%s: sendxmsg to ioc: state=Read', CurrentTime());
							if ( typeof cb == 'function' ) cb(state);
						}
					}
				}
			);
		}	
	}
	catch(err){
		console.log('in:iocEvent error=%s', err.message);
		if ( typeof cb == 'function' ) cb(err.message);
	}
}

var CurrentTime = function(){
    var ret;
	var ct = new Date();
	var zzz = ct.getMilliseconds().toString();
	if ( zzz.length == 1 ) zzz = '00' + zzz;
    else if ( zzz.length == 2 ) zzz = '0' + zzz;
    ret = ct.toLocaleString() + '.' + zzz;
    return ret;
}

var CreateTicket =function(len) {
    var text = "";
    for (var i = 0; i < len; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

var msdelay = (tm) => {
	return new Promise( (resolve) => {
		setTimeout(function() {
		  resolve('OK');
		}, tm);
	})
}