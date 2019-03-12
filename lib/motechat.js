// motechat: module for motechat
// Date: 2019/03/07
// Version: 1.13
// Add In function

var exports = module.exports = {};
var ver = '1.13';
var update = '2019/03/07'
var appname = '';
var iocmma = '';
var webtype = '';
var dcenter = '';
var ucenter = '';
var opencb;
var rcvemsgcb;
var rcveventcb;
var statecb;
var wrcvemsgcb;
var wrcveventcb;
var wstatecb;
var ins, ws, uc;
var appkey = '';
var mbusmma = '';
var mbusport = '6780';
var mcState = '';
var dcState = '';
var isweb = false;
var mcwanip = '';
var autoreg = true;
var wdtimer;
var wdInterval = 60000;
var regflag = false;
var ucState = '';
var DefaultXmsgTimeout = 12;
var DefaultXrpcTimeout = 12;
var DefaultWaitTimeout = 24;

var edgetable = [];
var pubfunc = [];
var isofunc = [];
var dbg = 0;
var mcerr;
var isPollDC = true;
var dcluster = {"name":"","list":"","type":"0"};
var rc = [{"app":"mqtt","DDN":"zOdYw2UZ"}];

/**
 * @callback openCallback
 * @param {Object} result {ErrCode, ErrMsg, result}
 */

/**
 * the method that open motechat
 * @example
    var conf = { "AppName":"", "IOC":"", "DCenter":"", "UCenter":"", "AppKey":"", "UseWeb":"", "MotebusGW":"" }
	conf.AppName = 'myfunc';
	conf.DCenter = 'dc@boss.ypcloud.com:6788';
    conf.AppKey = 'YfgEeop5';
    var reginfo = {"EiToken":"8dilCCKj","SToken":"baTi52uE"};
    var mChat = require('motechat');
    mChat.Open(conf, reginfo, function(result){
		console.log('open result=%s’, JSON.stringify(result));
	}

 * @function Open
 * @param {Object} conf             the configuration object for init.
 * @param {String} conf.AppName     the name of motebus MMA
 * @param {String} conf.IOC         the MMA of IOC
 * @param {String} conf.DCenter     the MMA of device center
 * @param {String} conf.UCenter     the MMA of user center
 * @param {String} conf.AppKey      the key string of app
 * @param {String} conf.UseWeb      the communication type that can be 'websocket', 'ajax', or ''
 * @param {String} conf.MotebusGW   the IP of motebus gateway
 * @param {Object} reg              the information of register
 * @param {Object} reg.EiToken      device token
 * @param {Object} reg.SToken       app token
 * @param {Object} reg.WIP          WAN IP
 * @param {Object} reg.LIP          LAN IP
 * @param {openCallback} callback   the result callback function 
 */

// Module: Open, open motechat
// Input:
//  conf: the configuration object for init. 
//      AppName: the name of motebus MMA
//      IOC: the MMA of IOC
//      DCenter: the MMA of device enter
//      UCenter: the MMA of user center
//      AppKey: the key string of app
//      UseWeb: can be 'websocket', 'ajax', or ''
//      MotebusGW: the IP of motebus gateway
//  reg: the information of register
//      EiToken: device token
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg})

exports.Open = function(conf, reg, callback){
    var reginfo, cb;
    regflag = false;
    mcerr = require('./mcerr.js');
    console.log('motechat: version=%s,update=%s', ver, update);
    console.log('motechat: open arguments= %d %s', arguments.length, JSON.stringify(arguments[0]));
    if ( arguments.length == 1 ){
        // (conf)
        cb = null;
    }
    else if ( arguments.length == 2 ){
        // (conf, callback)
        if ( typeof reg == 'function' ) cb = reg;
    }
    else if ( arguments.length == 3 ){
        // (conf, reg, callback)
        if ( reg ) reginfo = reg;
        if ( typeof callback == 'function' ) cb = callback;
        if ( typeof reginfo.SToken != 'undefined' && typeof reginfo.EiToken != 'undefined' )
            regflag = true;
    }
    else {
        if ( typeof callback == 'function' ) callback({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
    }
    appname = conf.AppName;
    iocmma = conf.IOC;
    dcenter = parseDC(conf.DCenter);
    
    if ( conf.UCenter ) ucenter = conf.UCenter;
    appkey = conf.AppKey;
    webtype = conf.UseWeb;
    if ( mcState == '' ){
        opencb = cb;
        ins = require('./in.js');
        ins.On('state', InStateHandler);
        ins.Open( conf, function(result){
            console.log('motechat:in Open result=%s', JSON.stringify(result));
            if ( result.ErrCode == mcerr.MC_OKCODE ) {
                if ( dcluster.name ) ins.SetCluster(dcluster.name,dcluster.list,dcluster.type);
                mcState = 'open';
                moteinfo = result.Mote;
                mbusmma = result.Mote.EiMMA;
                mbusport = result.Mote.EiPort;
                startReg(null, reginfo, opencb);
            }
            else {
                if ( typeof opencb == 'function' ) opencb(result);
            }
        });
    }
    else {
        if ( typeof opencb == 'function' ) opencb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Mote":result.Mote});
    }
}

var startReg = function(delay, reginfo, opencb){
    var tm;
    if ( delay ) tm = delay + Math.floor((Math.random() * 10) + 1) * 100;
    else tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
    //var tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
    setTimeout(function(){
        CallDcenterReset(function(reply){
            console.log('motechat:DcReset reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == mcerr.MC_OKCODE ){
                // DC response OK
                var dcwip = reply.WIP;
                ins.GetmbWIP(function(result){
                    //console.log('motechat:GetmbWIP result=%s', JSON.stringify(result));
                    if ( result.ErrCode == mcerr.MC_OKCODE ){
                        mcwanip = result.WANIP;
                        if ( mcwanip == '' ) mcwanip = dcwip;
                        console.log('motechat:Open WIP=%s', mcwanip);
                        ins.On('message', MoteChatGetHandler);
                        if ( regflag == true && reginfo ){
                            var data = {"SToken":reginfo.SToken,"EiToken":reginfo.EiToken,"WIP":mcwanip,"Web":webtype};
                            tryreg( data, opencb );
                        }
                        else {
                            if ( typeof opencb == 'function' ) opencb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Mote":result.Mote});
                        }
                    }
                    else {
                        if ( typeof opencb == 'function' ) opencb(result);
                    }
                });
                if ( isPollDC == true ) StartWDtimer();
            }
            else {
                if ( reginfo ){
                    setTimeout(function(){
                        startReg(null, reginfo, opencb);
                    }, 500);
                }
                //if ( typeof opencb == 'function' ) opencb(reply);
            }
        });
    },tm);
}

var parseDC = function(dc){
    var dcenter = dc;
    if ( dcenter.indexOf(';') > 0 ) {
        dclist = dcenter.split(';');
        if ( dclist.length >= 2 ){
            dcenter = dclist[0];
            var arr = dcenter.split('@');
            if ( arr.length == 2 ){
                dcluster.name = arr[1];
                var darr = [];
                darr = dclist[1].split(',');
                dcluster.list = darr;
                if ( dclist.length > 2 ) dcluster.type = dclist[2];
            }
        }
        else dcenter = dclist[0];
    }
    return dcenter;
}

/*
 * the method that close motechat
 * Input:
 *   cb: callback({ErrCode,ErrMsg})
 */

// Module: Close, close motechat
// Input:
//  cb: callback({ErrCode,ErrMsg})

exports.Close = function(cb){
    if ( mcState == 'open' ){
        mcState = 'close';
        unregAll();
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
    }
}


/**
 * OnEvent, on event handler
 * @example 
    var InmsgRcve = function(ch, inctl, data, retcb){
        console.log('InmsgRcve: channel=%s, from=%s, to=%s, data=%s', ch, JSON.stringify(inctl.From), JSON.stringify(inctl.To), JSON.stringify(data));
        if ( typeof retcb == 'function') retcb({"ErrCode":0, "ErrMsg":"OK"})
    }
    Var InState = function(state){
        console.log('InState=%s', state);
    }
    mChat.OnEvent('message',InmsgRcve);
    mChat.OnEvent('state', InState);
 * @function OnEvent
 * @param {String} stype    "message" is for getxmsg, "state" is for state changed
 * @param {function} cb     the user routine entry
 * @param {String} webtype "wsocket" is for websocket, "" is for non-webuse
 * @returns {boolean}
 */

// Module: OnEvent, on event handler
// Input:
//  stype: "message" is for getxmsg, "state" is for state changed
//  cb: the user routine entry
//  webtype: "wsocket" is for websocket, "" is for non-webuse
// Output:
//  return is boolean ( true or false )

exports.OnEvent = function(stype, cb, webtype){
    if ( stype == 'message' && typeof cb == 'function' ){
        if ( webtype != '' ) wrcvemsgcb = cb;
        else rcvemsgcb = cb;
        return true;    
    }
    else if ( stype == 'state' && typeof cb == 'function' ){
        if ( webtype != '' ) wstatecb = cb;
        else statecb = cb;
        return true;
    }
    else if ( stype == 'event' && typeof cb == 'function' ){
        if ( webtype != '' ) wrcveventcb = cb;
        else rcveventcb = cb;
    }
    return false;
}

// Module: GetMsg, to set the handler entry when message is comming
// Input:
//  cb: the user routine entry when message is comming
//  webtype: "wsocket" is for websocket, "" is for non-webuse
// Output:
//  return is boolean ( true or false )

exports.GetMsg = function(cb, webtype){
    if ( typeof cb == 'function' ) {
        if ( typeof webtype != 'undefined' && webtype != '' ) wrcvemsgcb = cb;
        else rcvemsgcb = cb;
        //console.log('motechat:typeof rcvemsgcb=%s, wrcvemsgcb=%s', typeof rcvemsgcb, typeof wrcvemsgcb );
        return true;
    }
    else return false;
}

// Module: GetState, to set the handler entry when motebus state changed
// Input:
//  cb: the user routine entry when motebus state changed
//  webtype: "wsocket" is for websocket, "" is for non-webuse
// Output:
//  return is boolean ( true or false )

exports.GetState = function(cb, webtype){
    if ( typeof cb == 'function' ) {
        if ( webtype != '' ) wstatecb = cb;
        else statecb = cb;
        return true;
    }
    else return false;
}

/**
 * @callback publishCallback
 * @param {Object} result {ErrCode,ErrMsg}
 */

/**
 * To publish XRPC function at motechat
 * @example 
    var app = 'myapp';
    var XrpcMcService = {
        "echo": function(head, body){
            console.log("xrpc echo: head=%s", JSON.stringify(head));
            if ( typeof body == 'object')
                sbody = JSON.stringify(body);
            else
                sbody = body;
            console.log("xrpc echo: body=%s", sbody);
            return {"echo":body};
        }
    }
    mChat.Publish( app, XrpcMcService, function(result){
        console.log('motechat publish: result=%s', JSON.stringify(result));
    });
 * @function Publish
 * @param {String} app the name of function
 * @param {function} func the user function entry which is published at motechat
 * @param {publishCallback} cb 
 */

// Module: PublishXrpc, to publish XRPC function at motechat
// Input:
//  app: the name of app
//  func: the user function entry which is published at motechat
//  cb, callback({ErrCode,ErrMsg})

exports.Publish = function(app, func, cb){
    if ( app && func ){
        pubfunc.push({"app":app,"func":func});
        ins.PublishXrpc( app, func, cb );
    }
}


/**
 * @callback isolatedcallback
 * @param {Object} result {ErrCode,ErrMsg}
 */

/**
 * To isolated publish XRPC function at motechat
 * @example
    var XrpcMcSecService = {
        "echo": function(head, body){
            console.log("xrpc echo: head=%s", JSON.stringify(head));
            if ( typeof body == 'object')
                sbody = JSON.stringify(body);
            else
                sbody = body;
            console.log("xrpc echo: body=%s", sbody);
            return {"echo":body};
        }
    }
    mChat.Isolated( XrpcMcSecService, function(result){
        console.log('motechat isolated: result=%s', JSON.stringify(result));
    });
 * @function Isolated
 * @param {function} func the user function entry which is isolated published at motechat
 * @param {isolatedRequest} cb 
 */

// Module: IsolatedXrpc, to isolated publish XRPC function at motechat
// Input:
//  app: the name of function
//  func: the user function entry which is isolated published at motechat
//  cb, callback({ErrCode,ErrMsg})

exports.Isolated = function(func, cb){
    if ( func ){
        isofunc.push( func );
        ins.IsolatedXrpc( func, cb );
    }
}


/**
 * @callback regCallback
 * @param {Object} result {ErrCode,ErrMsg,result}
 */

/**
 * register to device center
 * @function Reg
 * @example
    var mydev = {"EiToken":"8dilCCKj","SToken":"baTi52uE","WIP":"","LIP":""};
    mChat.Reg(mydev, function(result){
        console.log('StartSession result=%s', JSON.stringify(result));
    });
    //Note: At first time of the device, EiToken and SToken is empty.
 * @param {Object} data         the information for session
 * @param {String} data.EiToken device token
 * @param {String} data.SToken  app token
 * @param {regCallback} cb 
 */

// Module: Reg, register to device center
// Input:
//  data: the information for session, {EiToken,SToken}
//      EiToken: device token
//      SToken: app token
//      WIP: wan ip
//      Web: web protocal if use
//  cb: callback({ErrCode,ErrMsg,result})

exports.Reg = function(data, cb){
    if ( autoreg == true )
        tryreg( data, cb );
    else
        reg(data, cb);
}

var tryreg = function(data, cb){
    try {
        reg( data, function(result){
            if ( result.ErrCode != mcerr.MC_OKCODE ){
                var tm = Math.floor((Math.random() * 10) + 1) * 1000;
                setTimeout(function(regdata, callback){
                    tryreg(regdata, callback);
                }, tm, data, cb);
            }
            else {
                if ( typeof cb == 'function' ) cb(result);
            }
        });    
    }
    catch(err){
        console.log('motechat:tryreg error:%s', err.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: " + err.message});
    }
}

var reg = function(data, cb){
    // data: {EiToken, SToken, WIP, Web}
    if ( dbg >= 0 ) console.log('motechat:reg: data=%s', JSON.stringify(data));
    if ( dcenter != '' ){
        var wanip = '';
        var lanip = '';
        var web = '';
        if ( typeof data.WIP != 'undefined' ) wanip = data.WIP;
        if ( typeof data.LIP != 'undefined' ) lanip = data.LIP;
        if ( typeof data.Web != 'undefined' ) web = data.Web; 
        if ( web == '' && wanip == '' ) wanip = mcwanip;
        var dcData = {"AppKey":appkey,"EiToken":data.EiToken,"SToken":data.SToken,"EiUMMA":mbusmma,"EiUPort":mbusport,"WIP":wanip,"LIP":lanip};
        var device = data.SToken;
        ins.CallXrpc( dcenter, 'reg', dcData, null, null, function(reply){
            var eimma = '';
            if ( dbg >= 1 ) console.log('motechat:reg reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == mcerr.MC_OKCODE ){
                var rst = reply.result;
                var einfo = NewEdgeInfo(rst.SToken, dcData.AppKey, rst.EiToken, dcData.EiUMMA, dcData.EiUPort, web, rst);
                var ix = UpdateEdgeInfo(einfo);
                if ( reply.result.EiName  && reply.result.EiName != '' ) device = reply.result.EiName;
                else device = reply.result.DDN;
                eimma = reply.result.EiMMA;
            }
            var comment = reply.MMA ? '(' + reply.MMA + ')' : '';
            ins.iocEvent('', mbusmma, 'info', 'in', {"Device":device,"action":"reg","result":reply.ErrMsg+comment});
            if ( typeof cb == 'function' ) cb(reply);
            // after reg, require uc
            if ( ucenter != '' && eimma != '' && ucState == '' ) {
                uc = require('./uc.js');
                uc.Start(ins, ucenter, eimma);
                //console.log('uc start!');
                ucState = 'start';
            }
        });
    }
    else {
        console.log('motechat:StartSession error: null dcenter');
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NullDC,"ErrMsg":mcerr.MC_NullDC_Msg});
    }
}

var regAgain = function(SToken, cb){
    if ( dcenter != '' ){
        var data = GetEdgeInfo('stoken',SToken);
        if ( data != null ){
            if ( data.State != 'reg'){
                data.State = 'reg';
                var dcData = {"EiToken":data.EiToken,"SToken":data.SToken,"WIP":data.WIP,"Web":data.Web};
                if ( dbg >= 1 ) console.log('motechat:regAgain: data=%s', JSON.stringify(dcData));
                tryreg( dcData, function(result){
                    if ( dbg >= 1 ) console.log('motechat:regAgain result=%s', JSON.stringify(result));
                    InStateHandler('re-reg ' + result.ErrMsg, data.DDN);
                    if ( typeof cb == 'function' ) cb(result);
                });
            }
        }
    }
}

var regRecoverAll = function(){
    try {
        for ( var i = 0; i < edgetable.length; i++ ){
            var tm1 = 1000 + Math.floor((Math.random() * 10) + 1) * 200 * (i+1);
            var dcData = {"EiToken":edgetable[i].EiToken,"SToken":edgetable[i].SToken,"WIP":edgetable[i].WIP,"Web":edgetable[i].Web};
            setTimeout(function(data){
                regRecover(data);
            },tm1,dcData);
        }
        edgetable = [];
    }
    catch(e){
        console.log('regRecoverAll: error=%s', e.message);
    }
}

var regRecover = function(data, cb){
    if ( dcenter && data ){
        if ( dbg >= 0 ) console.log('motechat:regRecover: data=%s', JSON.stringify(data));
        tryreg( data, function(result){
            if ( dbg >= 0 ) console.log('motechat:regRecover result=%s', JSON.stringify(result));
            if ( result.result ) {
                if( result.result.DDN ) InStateHandler('re-reg ' + result.ErrMsg, result.result.DDN);
                else InStateHandler('re-reg ' + result.ErrMsg);
            }
            else
                InStateHandler('re-reg ' + result.ErrMsg);
            if ( typeof cb == 'function' ) cb(result);
        });
    }
}

/**
 * @callback unRegCallback
 * @param {Object} result {ErrCode,ErrMsg}
 */

/**
 * un-register from device center
 * @function UnReg
 * @example 
    var mydev = {"SToken":"baTi52uE"};
    mChat.UnReg(mydev, function(result){
        console.log('EndSession result=%s', JSON.stringify(result));
    });
 * @param {Object} data the information for session
 * @param {String} data.SToken app token
 * @param {unRegCallback} cb
 */

// Module: UnReg, un-register from device center
// Input:
//  data: the information for session
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg})

exports.UnReg = function(data, cb){
    unreg( data.SToken, cb );
}

var unreg = function(SToken, cb){
    if ( dcenter != '' ){
        var data = GetEdgeInfo('stoken',SToken);
        if ( data != null ){
            var dcData = {"SToken":SToken};
            ins.CallXrpc( dcenter, 'unreg', dcData, null, null, function(reply){
                if ( dbg >= 1 ) console.log('motechat:UnReg reply=%s', JSON.stringify(reply));
                var device = dcData.SToken;
                if ( reply.ErrCode == mcerr.MC_OKCODE ){
                    var unreg = RemoveEdgeInfo(data.SToken);
                    if ( unreg != null )
                        device = (unreg.EiName != '') ? unreg.EiName : unreg.DDN;
                    ins.iocEvent('', mbusmma, 'info', 'in', {"Device":device,"action":"unreg","result":reply.ErrMsg});
                    InStateHandler('unreg ' + reply.ErrMsg, unreg.DDN);
                }
                //ins.iocEvent('', mbusmma, 'info', 'in', {"Device":device,"action":"unreg","result":reply.ErrMsg});
                if ( typeof cb == 'function' ) cb(reply);
            });
        }
        else {
            if ( typeof cb == 'function' ){
                var reply = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                cb(reply);
            }
        }
    }
}

var unregAll = function(){
    var SToken;
    for ( var i = 0; i < edgetable.length; i++ ){
        data = edgetable[i];
        SToken = data.SToken;
        unreg(SToken);
    }    
}

/**
 * @callback sendCallback
 * @param {Object} result { ErrCode, ErrMsg }| reply
 */

/**
 * send xmsg to other device
 * @function Send
 * @example 
    var stoken = mydev.SToken;
    var ddn = '';
    var topic = 'ss://myScreen';
    var data = {"message":"Hello World"};
    var t1 = null;
    var t2 = null;
    var xmsgctl = {"SToken":stoken,"DDN":"","Topic":topic,"Data":data, "SendTimeout":t1,"WaitReply":t2};
        mChat.Send(xmsgctl, function(reply){
        console.log('sendxmsg reply=%s', JSON.stringify(reply));
    });
 * @param {Object} xmsg     msg control object
 * @param {String} xmsg.SToken    token of app
 * @param {String} xmsg.DDN       DDN of destination
 * @param {String} xmsg.To        device property of destination (legacy, backward comaptible)
 * @param {String} xmsg.Topic     ultranet topic of destination
 * @param {String} xmsg.Data      data which want to be sent
 * @param {Number} xmsg.SendTimeout  timeout of send xmessage, by sec. 
 * @param {Number} xmsg.WaitReply the wait time of reply, by sec.
 * @param {sendCallback} cb 
 */

// Module: Send, send xmsg to other device
// Input:
//  xmsg: xmsg control object
//      SToken: token of app
//      DDN: device ddn of destination
//      To: device property of destination
//      Topic: ultranet topic data of destination
//      Data: the data which want to be sent
//      SendTimeout: timeout of send message
//      WaitReply: wait time of reply, by sec.
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Send = function(xmsg, cb){
    var stoken, topic, ddn, to, addr, data, timeout, waitreply;
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg}]);
            return;    
        }
        if ( dcenter == '' ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_NullDC,"ErrMsg":mcerr.MC_NullDC_Msg}]);
            return;
        }
        stoken = ( xmsg.SToken ) ? xmsg.SToken : '';
        ddn = ( xmsg.DDN ) ? xmsg.DDN : '';
        to = ( xmsg.To ) ? xmsg.To : '';
        topic = ( xmsg.Topic ) ? xmsg.Topic : '';
        if ( ddn ) addr = topic ? {"mode":"","to":{"DDN":ddn,"Topic":topic}} : {"mode":"","to":{"DDN":ddn}};
        else if ( to ) addr = {"mode":"","to":{"Target":to}};
        else if ( topic ) {
            addr = TopicParser(topic);
        }
        if ( addr && dbg >= 1 ) console.log('motechat:Send addr=%s', JSON.stringify(addr));
        data = ( xmsg.Data  ) ? xmsg.Data : '';
        if ( xmsg.SendTimeout ) timeout = xmsg.SendTimeout;
        if ( xmsg.WaitReply ) waitreply = xmsg.WaitReply;
        if ( timeout == null ) {
            timeout = DefaultXmsgTimeout + CalTimeout(topic);
        }
        if ( waitreply == null ) {
            waitreply = DefaultWaitTimeout + CalTimeout(topic);
        }
        if ( !stoken || !addr || !data ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}]); 
            return;
        }
        if ( dbg >= 1 ) {
            if ( typeof data == 'object')
                console.log('motechat:Send addr=%s,data=%s', JSON.stringify(addr), JSON.stringify(data));
            else
                console.log('motechat:Send addr=%s,data=%s', JSON.stringify(addr), data);
        }
        var info = GetEdgeInfo('stoken', stoken);
        if ( info != null ){
            var ddn = info.DDN;
            var dname = info.EiName;
            var dtype = info.EiType;
            var uid = ( info.Uid ) ? info.Uid : '';
            if ( uid == '' && info.EiOwner ) uid = info.EiOwner;
            var fm = {"DDN":ddn,"Name":dname,"Type":dtype,"Uid":uid};
            //if ( dbg >= 1 ) console.log('motechat:Send fm DDN=%s,EiName=%s,addr=%s,data=%s', ddn, dname, JSON.stringify(addr), JSON.stringify(data));
            var finish = false;
            var xdata = {"stoken":stoken,"in":{"fm":fm,"msgtype":addr.mode,"t1":timeout,"t2":waitreply},"to":addr.to,"data":data};
            if ( dbg >= 1 ) console.log('motechat:Send data=%s', JSON.stringify(xdata));
            if ( addr.mode == 'in' ) {
                finish = InFunc(xdata, cb);
            }
            if ( dbg >= 1 ) console.log('motechat:Send data=%s', JSON.stringify(xdata));    
            if (!finish){
                ins.SendXmsg(dcenter, xdata, [], timeout, waitreply,
                    function(result){
                        if ( dbg >= 1 ) console.log('motechat:Send: result=%s', JSON.stringify(result));
                        if ( typeof cb == 'function' ){
                            var body, ret;
                            if ( result.body ) body = result.body;
                            if ( Array.isArray(body) ) {
                                if ( body[0].Reply ) InTraceResp(body[0].Reply);
                                cb( body );
                                if ( iocmma != '' ){
                                    for ( var i = 0; i < body.length; i++ ) {
                                        var ret = '';
                                        if ( body[i].Reply.ErrMsg ) ret = body[i].Reply.ErrMsg;
                                        else if ( body[i].IN.State.ErrMsg ) ret = body[i].IN.State.ErrMsg;
                                        var edata = {"From":body[i].IN.From,"To":body[i].IN.To,"msg":xdata.data,"result":ret};
                                        if ( dbg >= 2 ) console.log('motechat:Call edata=%s', JSON.stringify(edata));
                                        ins.iocEvent('', mbusmma, 'info', 'send', edata);
                                    }
                                }
                            }
                            else {
                                var edata;
                                var ret = '';
                                if ( result.IN ) {
                                    cb([result]);
                                    if ( iocmma ){
                                        if ( result.Reply.ErrMsg ) ret = result.Reply.ErrMsg;
                                        else if ( result.IN.State.ErrMsg ) ret = result.IN.State.ErrMsg;
                                        edata = {"From":result.IN.From,"To":result.IN.To,"msg":xdata.data,"result":ret};
                                    }
                                }
                                else {
                                    cb([{"IN":{"From":xdata.in.fm,"To":xdata.to,"State":result},"Reply":""}]);
                                    if ( iocmma ) {
                                        if ( typeof result == 'string' ) ret = result;
                                        if ( result.ErrMsg ) ret = result.ErrMsg;
                                        edata = {"From":xdata.in.fm,"To":xdata.to,"msg":xdata.data,"result":ret};
                                    }
                                }
                                if ( iocmma ){
                                    if ( dbg >= 2 ) console.log('motechat:Send edata=%s', JSON.stringify(edata));
                                    ins.iocEvent('', mbusmma, 'info', 'send', edata);
                                }
                            }
                        }
                    }
                );
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: " + err.message});
    }
}

/**
 * @callback callCallback 
 * @param {Object} result {ErrCode,ErrMsg} | reply
 */

/**
 * call the function of other device by XRPC
 * @function Call
 * @example 
    var ddn = '';
    var topic = 'mms://myFunc';
    var func = 'echo';
    var data = {"time":"2018/4/24 10:12:08"};
    var t1 = null;
    var t2 = null;
    var xrpc = {"SToken":mydev.SToken, "DDN":ddn, "Topic":topic ,"Func":func,"Data":data, "SendTimeout":t1, "WaitReply":t2};
        mChat.Call( xrpc, function(reply){
        console.log('CallSession reply=%s', JSON.stringify(reply));
    });
 * @param {Object} xrpc             xrpc control object
 * @param {String} xrpc.SToken      app token
 * @param {String} xmsg.DDN         DDN of destination
 * @param {String} xrpc.To          device property of destination (legacy, backward comaptible)
 * @param {String} xrpc.Topic       topic of destination
 * @param {String} xrpc.Func        function name of destination
 * @param {Object} xrpc.Data        the data object want to delivered
 * @param {Number} xrpc.SendTimeout timeout of send xmessage, by sec. 
 * @param {Number} xrpc.WaitReply   the wait time of reply, by sec.
 * @param {callCallback} cb 
 */

// Module: Call, call the function of other device by XRPC
// Input:
//  xrpc: xrpc control object
//      SToken: app token
//      Topic: topic of destination
//      DDN: device ddn of destination
//      To: device property of destination
//      Func: function name of destination
//      Data: data object for function
//      SendTimeout: timeout of call xrpc
//      Waitreply: wait time of call xrpc
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Call = function(xrpc, cb){
    var stoken, ddn, to, topic, addr, func, data, timeout, waitreply;
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg}]);
            return;    
        }
        if ( dcenter == '' ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_NullDC,"ErrMsg":mcerr.MC_NullDC_Msg}]);
            return;
        }
        if ( dbg >= 1 ) console.log('motechat:Call xrpc=%s', JSON.stringify(xrpc));
        stoken = ( xrpc.SToken ) ? xrpc.SToken : '';
        ddn = ( xrpc.DDN ) ? xrpc.DDN : '';
        to = ( xrpc.To ) ? xrpc.To : '';
        topic = ( xrpc.Topic ) ? xrpc.Topic : '';
        if ( ddn ) addr = topic ? {"mode":"","to":{"DDN":ddn,"Topic":topic}} : {"mode":"","to":{"DDN":ddn}};
        else if ( to ) addr = {"mode":"","to":{"Target":to}};
        else if ( topic ) {
            addr = TopicParser(topic);
        }
        //if ( addr ) console.log('motechat:Call addr=%s', JSON.stringify(addr));
        func = ( xrpc.Func ) ? xrpc.Func : '';
        data = ( xrpc.Data ) ? xrpc.Data : '';
        if ( xrpc.SendTimeout ) timeout = xrpc.SendTimeout;
        if ( xrpc.WaitReply ) waitreply = xrpc.WaitReply;
        if ( timeout == null ) {
            timeout = DefaultXrpcTimeout + CalTimeout(topic);
        }
        if ( waitreply == null ) {
            waitreply = DefaultWaitTimeout + CalTimeout(topic);
        }
        if ( !stoken || !addr || !func ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}]); 
            return;
        }
        var info = GetEdgeInfo('stoken', stoken);
        if ( dbg >= 1 ) console.log('motechat:Call addr=%s,info=%s', JSON.stringify(addr),JSON.stringify(info));
        if ( info != null ){
            if ( addr.to.Target == 'UC' || addr.to.Target == 'uc' || addr.to.DDN == 'UC' || addr.to.DDN == 'uc' ){
                if ( ucState == 'start' ){
                    try {
                        var ucdata = {"SToken":stoken,"Func":func,"Data":data};
                        console.log('UcCall data=%s', JSON.stringify(ucdata));
                        uc.UcCall( ucdata, function(reply){
                            var ret;
                            if ( reply.ErrMsg ) ret = reply;
                            else ret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":reply};
                            if ( typeof cb == 'function' ) cb(ret);
                            if ( func == 'ucLogin' || func == 'ucLogout' ){
                                HandleUserInfo( func, stoken, reply );
                            }
                        });
                    }
                    catch(e){
                        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: " + e.message});
                    }
                }
                else cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: uc modules not open"});
            }
            else {
                var ddn = info.DDN;
                var dname = info.EiName;
                var dtype = info.EiType;
                var uid = ( info.Uid ) ? info.Uid : '';
                if ( uid == '' && info.EiOwner ) uid = info.EiOwner;
                var fm = {"DDN":ddn,"Name":dname,"Type":dtype,"Uid":uid};
                var finish = false;
                var dcData = {"stoken":stoken,"in":{"fm":fm,"msgtype":addr.mode,"t1":timeout,"t2":waitreply,},"to":addr.to,"func":func,"data":data};
                if ( dbg >= 1 ) console.log('motechat:Call data=%s', JSON.stringify(dcData));
                if ( addr.mode == 'in' ) {
                    finish = InFunc(dcData, cb);
                }
                if ( dbg >= 1 ) console.log('motechat:Call data=%s', JSON.stringify(dcData));
                if (!finish) {
                    ins.CallXrpc( dcenter, 'call', dcData, timeout, waitreply, function(result){
                        if ( dbg >= 1 ) console.log('motechat:Call result=%s', JSON.stringify(result));
                        if ( typeof cb == 'function' ) {
                            //if ( result ) cb( result );
                            if ( Array.isArray(result) ){
                                if ( result[0].Reply ) InTraceResp( result[0].Reply );
                                cb(result);
                                if ( iocmma ){
                                    for ( var i = 0; i < result.length; i++ ) {
                                        var ret = '';
                                        if ( result[i].Reply.ErrMsg ) ret = result[i].Reply.ErrMsg;
                                        else if ( result[i].IN.State.ErrMsg ) ret = result[i].IN.State.ErrMsg;
                                        var edata = {"From":result[i].IN.From,"To":result[i].IN.To,"msg":dcData.data,"result":ret};
                                        if ( dbg >= 2 ) console.log('motechat:Call edata=%s', JSON.stringify(edata));
                                        ins.iocEvent('', mbusmma, 'info', 'call', edata);
                                    }
                                }
                            }
                            else {
                                var edata;
                                var ret = '';
                                if ( result.IN ) {
                                    cb([result]);
                                    if ( iocmma ){
                                        if ( result.Reply.ErrMsg ) ret = result.Reply.ErrMsg;
                                        else if ( result.IN.State.ErrMsg ) ret = result.IN.State.ErrMsg;
                                        edata = {"From":result.IN.From,"To":result.IN.To,"msg":dcData.data,"result":ret};
                                    }
                                }
                                else {
                                    cb([{"IN":{"From":dcData.in.fm,"To":dcData.to,"State":result},Reply:""}]);
                                    if ( iocmma ){
                                        if ( typeof result == 'string' ) ret = result;
                                        if ( result.ErrMsg ) ret = result.ErrMsg;
                                        edata = {"From":dcData.in.fm,"To":dcData.in.to,"msg":dcData.data,"result":ret};
                                    }
                                }
                                if ( iocmma  ){
                                    if ( dbg >= 2 ) console.log('motechat:Call edata=%s', JSON.stringify(edata));
                                    ins.iocEvent('', mbusmma, 'info', 'call', edata);
                                }
                            }
                        }
                    });
                }
            } 
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg}); 
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: " + err.message});
    }
}

var TopicParser = function(topic){
    var app, dest;
    var addr;
    if ( typeof topic == 'string' ){
        ix = topic.indexOf('://');
        if ( ix > 0 ){
            app = topic.substr(0, ix);
            //console.log('TopicParser app=%s, dest=%s', app, dest);
            if ( app ) {
                app = app.toLowerCase();
                switch (app){
                    case 'ddn':
                        addr = {"mode":"","to":{"DDN":dest}};
                        break;
                    case 'ss':
                        dest = topic.substr(ix+3);
                        addr = {"mode":"","to":{"Target":dest,"Topic":topic}};
                        break;
                    case 'in':
                        dest = topic.substr(ix+3);
                        addr = {"mode":"in","to":{"DDN":dest,"Topic":topic}};
                        break;
                    case 'ein':
                        dest = topic.substr(ix+3);
                        addr = {"mode":"in","to":{"Target":dest,"Topic":topic}};
                        break;
                    case 'svc':
                        dest = topic.substr(ix+3);
                        addr = {"mode":"","to":{"Target":dest,"Topic":topic}};
                        break;
                    default:
                        var to = checkRC(app, topic);
                        if ( to ) addr = {"mode":"","to":to};
                        else addr = null;
                        break;
                }
            }
            else addr = null;
        }
        else {
            addr = {"mode":"","to":{"Target":topic}};
        }
    }
    return addr;
}

var checkRC = function(app, topic){
    for ( i = 0; i < rc.length; i++ ){
        if ( app == rc[i].app ){
            return rc[i];
        }
    }
    return null;
}

// Module: InFunc, functions for inlayer service
// Input:
//  indata: in control data object
//      stoken: app token
//      indata: in control object
//      to: to control object
//      func: function name if callxrpc 
//      data: data object
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

var InFunc = function(indata, cb){
    var data, cmd, option, result, err;
    try {
        if ( dbg >= 1 ) console.log('InFunc %s', JSON.stringify(indata));
        if ( indata ) data = indata.data;
        if ( data ){
            if ( typeof data == 'string' ){
                var darr = data.split(' ');
                cmd = darr[0];
                if ( darr.length > 1 ) option = darr[1];
                else option = '';
            }
            else {
                cmd = data.cmd;
                if (data.option) option = data.option;
                else option = '';
            }
            if (cmd){
                cmd = cmd.toLowerCase();
                if (option) option = option.toLowerCase();
                //var stime = ins.CurrentTime();
                //stime = stime.substr(stime.indexOf(' ')+1);
                var stime = new Date();
                var stamp;
                switch(cmd){
                    case 'ping':
                        stamp = [];
                        stamp.push({"mma":mbusmma,"time":stime});
                        if ( indata.to.DDN == 'local' || indata.in.fm.DDN == indata.to.DDN ){
                            result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                            if ( typeof cb == 'function' ) cb([{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"ping","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp}}]);
                            return true;
                        }
                        else {
                            indata.data = {"cmd":cmd,"option":option,"trace":stamp};
                            return false;
                        }
                        break;
                    case 'trace':
                        stamp = [];
                        stamp.push({"mma":mbusmma,"time":stime});
                        if ( indata.to.DDN == 'local' || indata.in.fm.DDN == indata.to.DDN ){
                            result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                            if ( typeof cb == 'function' ) cb([{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"trace","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp}}]);
                            return true;
                        }
                        else {
                            indata.data = {"cmd":cmd,"option":option,"trace":stamp};
                            return false;
                        }
                        break;
                    case 'tracedc':
                        indata.data = {"cmd":cmd,"option":option,"trace":[]};
                        return false;
                        break;
                    default:
                        break;
                }
            }
        }
        result = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
    }
    catch(e){
        result = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
    }
    if ( typeof cb == 'function' ) cb([result]);
    console.log('InFunc err: %s', JSON.stringify(result));
    return true;
}

var InTraceResp = function(reply){
    try {
        var resp = reply.response;
        if ( resp == 'trace' ){
            var stime = new Date();
            var trace = reply.Trace;
            var trdata = {"mma":mbusmma,"time":stime};
            //console.log("XmsgRcve: trdata=%s", JSON.stringify(trdata));
            trace.push(trdata);
        }
    }
    catch(e){
        console.log("InTraceResp error:%s", e.message);
    }
}


const DeviceAdjustTime = 2;
const TagAdjustTime = 5;

var CalTimeout = function(topic){
    var ret = 0;
    if ( topic ){
        var tparr = topic.split(',');
        var tpno = tparr.length-1;
        var tgno = 0;
        if ( topic.indexOf('#') >= 0 ){
            tgarr = topic.split('#');
            tgno = tgarr.length-1;
        }
        ret = tpno * DeviceAdjustTime + tgno * TagAdjustTime;
    }
    return ret;
}


/**
 * @callback getCallback 
 * @param {Object} result {ErrCode, ErrMsg} | reply
 */

/**
 * get my device information
 * @function Get
 * @example 
    var data = {"SToken":mydev.SToken};
    mChat.Get(data, function(result){
        console.log('GetDeviceInfo result=%s', result);
    });
 * @param {Object} data    the input data object
 * @param {String} data.SToken  app token 
 * @param {getCallback} cb 
 */

// Module: Get, get my device information
// Input:
//  data: the input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Get = function(data, cb){
    // data {SToken}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'getinfo', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:GetDevice reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode == mcerr.MC_OKCODE ){
                        var ginfo = reply.result;
                        var uinfo = {"SToken":data.SToken,"EiOwner":ginfo.EiOwner,"EiName":ginfo.EiName,"EiType":ginfo.EiType,"EiTag":ginfo.EiTag};
                        UpdateEdgeInfo(uinfo);
                        if ( dbg >= 2 ) console.log('motechat:GetDevice edgetable=%s', JSON.stringify(edgetable));
                    }
                    else {
                        MoteErrHandler('get', reply.ErrMsg, data.SToken);
                    }
                    if ( typeof cb == 'function' ) cb(reply);
                });    
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}

/**
 * @callback setCallback
 * @param {Object} result {ErrCode,ErrMsg} | reply
 */

/**
 * Set device information
 * @function Set
 * @example 
    var info = {"EiName":"myEi","EiType":".ei","EiTag":"#my","EiLoc":""};
    var data = {"SToken":mydev.SToken,"EdgeInfo":info};
    mChat.Set(data, function(result){
        console.log(‘SetDeviceInfo result=%s’, result);
    });
 * @param {Object} data      input data object
 * @param {String} SToken    app token
 * @param {Object} EdgeInfo  {"EiName":"","EiType":"","EiTag":"","EiLoc":""} 
 * @param {setCallback} cb 
 */

// Module: Set, set my device information
// Input:
//  data: input data object
//      SToken: app token
//      EdgeInfo: {"EiName":"","EiType":"","EiTag":"","EiLoc":""} 
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Set = function(data, cb){
    // data: {SToken, EdgeInfo}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'setinfo', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:SetDevice reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('set', reply.ErrMsg, data.SToken);
                    } 
                    if ( typeof cb == 'function' ) cb(reply);
                });    
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}


// Module: GetAppSetting, get my application information
// Input:
//  data: the input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.GetAppSetting = function(data, cb){
    // data : {SToken}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'getapp', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:GetAppSetting reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('getappsetting', reply.ErrMsg, data.SToken);
                    } 
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}


// Module: SetAppSetting, set my application setting
// Input:
//  data: input data object
//      SToken: app token
//      Setting: user defined data object
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.SetAppSetting = function(data, cb){
    // data: {SToken, Setting}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'setapp', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:SetAppSetting reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('setappsetting', reply.ErrMsg, data.SToken);
                    } 
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}


// Module: GetQPin, get PIN code
// Input:
//  data: input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.GetQPin = function(data, cb){
    // data: {SToken}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                if ( dbg >= 1 )console.log('motechat:GetQPin data=%s', JSON.stringify(data));
                ins.CallXrpc( dcenter, 'getqpin', data, null, null, function(reply){
                    if ( dbg >= 2 ) console.log('motechat:GetQPin reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('getqpin', reply.ErrMsg, data.SToken);
                    } 
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}


// Module: GetQPin, find PIN code
// Input:
//  data: input data object
//      SToken: app token
//      Qpin: PIN code
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.FindQPin = function(data, cb){
    // data: {SToken, Qpin}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'findqpin', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:FindQPin reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('findqpin', reply.ErrMsg, data.SToken);
                    } 
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}


/**
 * @callback searchCallback 
 * @param {Object} result {ErrCode,ErrMsg} | reply
 */

/**
 * Search device by key
 * @function Search
 * @example 
    var data = {"SToken":mydev.SToken,”Keyword”:”#test”};
    mChat.Search(data, function(result){
        console.log(‘Search result=%s’, result);
    });
 * @param {Object} data    input data object
 * @param {String} data.SToken  app token
 * @param {String} data.Keyword Key for search 
 * @param {searchCallback} cb 
 */

// Module: Search, search device by key
// Input:
//  data: input data object
//      SToken: app token
//      Keyword: Key for search
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Search = function(data, cb){
    // data {SToken, Keyword}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info && info.UToken ){
                ins.CallXrpc( dcenter, 'search', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:Search reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('search', reply.ErrMsg, data.SToken);
                    } 
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}

// Module: Nearby, search nearby device
// Input:
//  data: input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Nearby = function(data, cb){
    // data {SToken}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'nearby', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:Nearby reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode ){
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('nearby', reply.ErrMsg, data.SToken);
                    } 
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}

exports.SendLog = function(){
    // data {SToken, lgTime, lgType, lgDesc}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'Sendlog', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:SendLog reply=%s', JSON.stringify(reply));
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}

exports.ListLogs = function(data){
    // data {SToken, RowCount, bFirst}
    if ( dcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( data.SToken ){
            var stoken = data.SToken;
            var info = GetEdgeInfo('stoken', stoken);
            if ( info ){
                ins.CallXrpc( dcenter, 'Listlog', data, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:SendLog reply=%s', JSON.stringify(reply));
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
}

exports.GetAppKey = function(){
    return appkey;
}

exports.MoteChatGetHandler = function(ch, head, body, cb){
    MoteChatGetHandler(ch, head, body, cb)
}

var InStateHandler = function(state, ddn){
    if ( dbg >= 1 ) console.log('motechat:InStateHandler state=%s',state);
    if ( typeof statecb == 'function' ) statecb(state, ddn);
    if ( typeof wstatecb == 'function' ) wstatecb(state, ddn);  //state callback for web app
    if ( state == 'opened2' ){
        // motebus restart
        ReinitXfunc();
        MBusRestart( function(result){
            if ( dbg >= 1 ) console.log('motechat:InStateHandler:MBusRestart result=%s',JSON.stringify(result));
        });
    }
}

var ReinitXfunc = function(){
    var i, app, func;
    if ( pubfunc.length > 0 ){
        for ( i = 0; i < pubfunc.length; i++ ){
            app = pubfunc[i].app;
            func = pubfunc[i].func;
            ins.PublishXrpc( app, func, function(result){
                console.log('publishXrpc: app=%s, result=%s', app, JSON.stringify(result));
            } );    
        }
    }
    if ( isofunc.length > 0 ){
        for ( i = 0; i < isofunc.length; i++ ){
            ins.IsolatedXrpc( isofunc[i], function(result){
                console.log('isolatedXrpc: result=%s', JSON.stringify(result));    
            } );    
        }
    }
}

var MBusRestart = function(cb){
    mcState = '';
    dcState = '';
    ucState = '';
    console.log('MBusRestart: edgetable=%s', JSON.stringify(edgetable));
    var tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
    setTimeout(function(){
        CallDcenterReset(function(reply){
            console.log('motechat:MBusRestart DC Reset reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == mcerr.MC_OKCODE ){
                var tm1, dcData;
                // DC response OK
                regRecoverAll();
            }
        });
    },tm);
}

var CallDcenterReset = function(cb){
    if ( mcState == '' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter && !dcState ){
        ins.CallXrpc( dcenter, 'resetreg', {"EiUMMA":mbusmma}, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:CallDcenterReset reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode != mcerr.MC_OKCODE ){
                ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"action":"startup","result":"dc: " + reply.ErrMsg});
                var tm = 2000 + Math.floor((Math.random() * 10) + 1) * 200;
                setTimeout(function(callback){
                    CallDcenterReset(callback);
                }, tm, cb);
            }
            else {
                dcState = 'open';
                if ( typeof cb == 'function' ) cb(reply);
            }
        });
    }
    else {
        if ( !dcenter )
            console.log('motechat:CallDcenterReset error: null dcenter');
        else
            console.log('motechat:CallDcenterReset dcState=%s', dcState);
    }
}

var MoteChatGetHandler = function(ch, head, body, cb){
    //console.log('motechat:MoteChatGetHandler ch=%s body=%s',ch, JSON.stringify(body));
    if ( typeof cb == 'function' ){
        try {
            var from, to, ddn, data;
            var msgtype = '';
            if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler body=%s',JSON.stringify(body));
            if ( body.in ){
                from = ( body.in.fm ) ? body.in.fm : {};
                to = ( body.in.to ) ? body.in.to : {};
                msgtype = ( body.in.msgtype ) ? body.in.msgtype : '';
                ddn = ( to.DDN ) ? to.DDN : '';
            }
            data = ( body.data ) ? body.data : '';
            var ddnlist = [];
            ddnlist = FindEdgeInfo('ddn', ddn);
            if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
            if ( ddnlist.length > 0 ){
                //if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
                for ( var i = 0; i < ddnlist.length; i++ ){
                    var toddn, ret;
                    toddn = ddnlist[i].DDN;
                    if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler from=%s,to=%s,data=%s',JSON.stringify(from),JSON.stringify(to),JSON.stringify(data));
                    if ( ddnlist[i].Web == ''){
                        //console.log('MoteChatGetHandler: app received');
                        //if ( typeof rcvemsgcb == 'function' ) rcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                        //else ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg};
                        var finish = false;
                        if ( msgtype == 'in' ){
                            finish = McRcvInFunc(data, false, cb);
                        }
                        if ( !finish ){
                            if ( typeof rcvemsgcb == 'function' ) {
                                var inctl = {"From":from,"To":to,"msgtype":msgtype};
                                rcvemsgcb(ch, inctl, data, function(reply){
                                    if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler reply=%s',JSON.stringify(reply));
                                    if ( reply.response ) InTraceResp(reply);
                                    if ( typeof cb == 'function' ) cb(reply);    
                                });
                                /*
                                if ( ch == 'xrpc' )
                                    rcvemsgcb(ch, inctl, data, cb);
                                else {
                                    rcvemsgcb(ch, inctl, data, cb);
                                }
                                */
                            }
                            else {
                                ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"By":mbusmma};
                                cb(ret);
                            }
                        }
                    }
                    else {
                        //console.log('MoteChatGetHandler: web received');
                        //if ( typeof wrcvemsgcb == 'function' ) wrcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                        //else ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"DDN":ddn};
                        var finish = false;
                        /*
                        if ( msgtype == 'in' ){
                            finish = McRcvInFunc(data, true, cb);
                        }
                        */
                        if ( !finish ){
                            if ( typeof wrcvemsgcb == 'function' ) {
                                var inctl = {"From":from,"To":to,"msgtype":msgtype};
                                wrcvemsgcb(ch, inctl, data, function(reply){
                                    if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler reply=%s',JSON.stringify(reply));
                                    if ( reply.response ) InTraceResp(reply);
                                    if ( typeof cb == 'function' ) cb(reply);    
                                });
                                /*
                                if ( ch == 'xrpc' )
                                    wrcvemsgcb(ch, inctl, data, cb);
                                else {
                                    wrcvemsgcb(ch, inctl, data, cb);
                                }
                                */
                            }
                            else {
                                ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"By":mbusmma};
                                cb(ret);
                            }
                        }
                    }
                }
            }
            else {
                ret = {"ErrCode":mcerr.MC_NoMatchDDN,"ErrMsg":mcerr.MC_NoMatchDDN_Msg,"By":mbusmma};
                console.log('motechat:MoteChatGetHandler ret=%s',JSON.stringify(ret));
                cb(ret);
            }
        }
        catch(err){
            ret = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message,"By":mbusmma};
            console.log('motechat:MoteChatGetHandler ret=%s',JSON.stringify(ret));
            cb(ret);
        }
    }
}

var McRcvInFunc = function(data, isweb, cb){
    var data, cmd, option, result, err;
    try {
        if ( dbg >= 1 ) console.log('McRcvInFunc %s', JSON.stringify(data));
        cmd = data.cmd;
        option = data.option;
        if (cmd){
            cmd = cmd.toLowerCase();
            if (option) option = option.toLowerCase();
            //var stime = ins.CurrentTime();
            //stime = stime.substr(stime.indexOf(' ')+1);
            var stime = new Date();
            var trace, stamp;
            switch(cmd){
                case 'ping':
                    if ( !isweb ) {
                        if ( dbg >= 1 ) console.log('McRcvInFunc data=%s', JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mbusmma,"time":stime});
                                stamp = trace;
                            }
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        if ( typeof cb == 'function' ) cb(result);
                        return true;
                    }
                    else {
                        return false;
                    }
                    break;
                case 'trace':
                    if ( !isweb ) {
                        if ( dbg >= 1 ) console.log('McRcvInFunc data=%s', JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mbusmma,"time":stime});
                                stamp = trace;
                            }
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        if ( typeof cb == 'function' ) cb(result);
                        return true;
                    }
                    else {
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mbusmma,"time":stime});
                                data.trace = trace;
                            }
                        }
                        return false;
                    }
                    break;
                case 'tracedc':
                    if ( !isweb ) {
                        if ( dbg >= 1 ) console.log('McRcvInFunc data=%s', JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            stamp = trace;
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        if ( typeof cb == 'function' ) cb(result);
                        return true;
                    }
                    else {
                        return false;
                    }
                    break;
                default:
                    break;
            }
        }
        result = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
    }
    catch(e){
        result = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
    }
    if ( typeof cb == 'function' ) cb(result);
    console.log('McRcvInFunc err: %s', JSON.stringify(err));
    return true;
}

var ChkEdgeInfo = function(stoken){
    var iret = -1;
    if ( edgetable.length > 0 ){
        for ( var i = 0; i < edgetable.length; i++ ){
            if ( edgetable[i].SToken == stoken ){
                iret = i;
                break;
            }    
        }
    }
    return iret;   
}

var NewEdgeInfo = function(stoken, appkey, eitoken, eiumma, eiuport, web, ei){
    var info = {"SToken":stoken,"AppKey":appkey,"EiToken":eitoken,"EiUMMA":eiumma,"EiUPort":eiuport,
    "DDN":ei.DDN,"EiOwner":ei.EiOwner,"EiName":ei.EiName,"EiType":ei.EiType,"EiTag":ei.EiTag,"WIP":ei.WIP,"LIP":ei.LIP,
    "UToken":ei.UToken,"Uid":ei.Uid,"UserName":ei.UserName,"NickName":ei.NickName,"MobileNo":ei.MobileNo,"Sex":ei.Sex,
    "EmailVerified":ei.EmailVerified,"MobileVerified":ei.MobileVerified,"TimeStamp":new Date(),"Web":web,"State":""};
    return info;
}

var UpdateEdgeInfo = function(info){
    try {
        if ( dbg >= 1 )console.log('motechat:UpdateEdgeInfo info=%s', JSON.stringify(info));
        var i = ChkEdgeInfo(info.SToken);
        if ( i < 0 ){
            info.State = 'conn';
            edgetable.push(info);
            return edgetable.length-1;
        }
        else {
            var edge = edgetable[i];
            edge.EiOwner = info.EiOwner ? info.EiOwner : '';
            edge.EiName = info.EiName ? info.EiName : '';
            edge.EiType = info.EiType ? info.EiType : '';
            edge.EiTag = info.EiTag ? info.EiTag : '';
            edge.UToken = info.UToken ? info.UToken : '';
            edge.Uid = info.Uid ? info.Uid : '';
            edge.UserName = info.UserName ? info.UserName : '';
            edge.NickName = info.NickName ? info.NickName : '';
            edge.Sex = info.Sex ? info.Sex : "";
            edge.EmailVerified = info.EmailVerified ? info.EmailVerified : false;
            edge.MobileVerified = info.MobileVerified ? info.MobileVerified : false;
            edge.TimeStamp = new Date();
            edge.State = 'conn';
            return i;
        }
    }
    catch(err){
        console.log('motechat:UpdateEdgeInfo error=%s', err.message);
        return -1;
    }
}

var RemoveEdgeInfo = function(skey){
    var stoken;
    var ret = null;
    for ( var i = 0; i < edgetable.length; i++ ){
        stoken = edgetable[i].SToken;
        if ( skey == stoken ){
            ret = {"SToken":stoken,"DDN":edgetable[i].DDN,"EiName":edgetable[i].EiName};
            edgetable.splice(i,1);
            return ret;
        }
    }
    return ret;
}

exports.GetEdgeInfo = function(ddn){
    return GetEdgeInfo('ddn', ddn);
}

// GetEdgeInfo: get the edge information by stoken or ddn
var GetEdgeInfo = function(stype, skey){
    var atype = stype;
    var info;
    var stoken, ddn;
    if ( atype != '' ) atype = atype.toLowerCase();
    if ( dbg >= 2 ) console.log('motechat:GetEdgeInfo stype=%s,skey=%s', stype, skey);
    //console.log('GetEdgeInfo edgetable=%s', JSON.stringify(edgetable));
    for ( var i = 0; i < edgetable.length; i++ ){
        if ( atype == 'stoken' ){
            stoken = edgetable[i].SToken;
            if ( skey == stoken ){
                return edgetable[i];
            }
        }
        else if ( atype == 'ddn' ){
            ddn = edgetable[i].DDN;
            if ( ddn ){
                if ( skey == ddn )
                    return edgetable[i];
            }
        }
    }
    return null;
}

// FindEdgeInfo: get the DDN list by search key
var FindEdgeInfo = function(stype, skey){
    var atype = stype;
    var darr = [];
    if ( atype == '' || skey == '' ) return darr;
    else {
        var stoken, ddn, owner, ename, etype, etag;
        var info;
        atype = atype.toLowerCase();
        if ( dbg >= 2 ) console.log('motechat:FindEdgeInfo edgetable=%s', JSON.stringify(edgetable));
        for ( var i = 0; i < edgetable.length; i++ ){
            info = edgetable[i];
            if ( atype == 'stoken' ){
                stoken = info.SToken;
                if ( skey == stoken ){
                    darr.push({"DDN":info.DDN,"Web":info.Web});
                    break;
                }
            }
            else if ( atype == 'ddn' ){
                ddn = info.DDN;
                if ( skey == ddn ){
                    darr.push({"DDN":ddn,"Web":info.Web});
                }
            }
            else if ( atype == 'owner' ){
                owner = info.EiOwner != null ? info.EiOwner : '';
                if ( skey == owner )
                    darr.push({"DDN":info.DDN,"Web":info.Web});
            }
            else {
                stoken = info.SToken;
                if ( info.DDN ) ddn = info.DDN;
                else ddn = '';
                if ( info.EiOwner ) owner = info.EiOwner;
                else owner = '';
                if ( info.EiName ) ename = info.EiName;
                else ename = '';
                if ( info.EiType ) etype = info.EiType;
                else etype = '';
                if ( info.EiTag ) etag = info.EiTag;
                else etag = '';
                if ( ename != '' ) ename = ename.toLowerCase();
                if ( etype != '' ) etype = etype.toLowerCase();
                if ( etag != '' ) etag = etag.toLowerCase();
                if ( skey == stoken || skey == ddn || skey == owner || skey.toLowerCase() == ename || skey.toLowerCase() == etype || (etag != '' && etag.indexOf(skey.toLowerCase())) >= 0){
                    darr.push({"DDN":info.DDN,"Web":info.Web});
                }
            }
        }
    }
    return darr;
}

var HandleUserInfo = function( func, stoken, reply ){
    if ( dbg >= 1 ){
        if ( typeof reply == 'object' )
            console.log('motechat: HandleUserInfo func=%s,stoken=%s,reply=%s', func, stoken, JSON.stringify(reply));
        else
            console.log('motechat: HandleUserInfo func=%s,stoken=%s,reply=%s', func, stoken, reply);
    }
    if ( func == 'ucLogin' ){
        if ( reply.Uid ) UpdateUserInfo( stoken, reply );
        else console.log('motechat: UpdateUserInfo error=%s', JSON.stringify(reply));
        //if ( typeof reply.ErrCode == 'undefined' && typeof reply.Uid != 'undefined' ){
        //    UpdateUserInfo( stoken, reply ); 
        //}
    }
    else if ( func == 'ucLogout' ){
        if ( reply == true ) ClearUserInfo(stoken);
    }
}

var UpdateUserInfo = function(stoken, info){
    try {
        if ( dbg >= 1 )console.log('motechat:UpdateUserInfo info=%s', JSON.stringify(info));
        var i = ChkEdgeInfo(stoken);
        if ( i >= 0 ) {
            var edge = edgetable[i];
            edge.UToken = info.UToken ? info.UToken : '';
            edge.Uid = info.Uid ? info.Uid : '';
            edge.UserName = info.UserName ? info.UserName : '';
            edge.NickName = info.NickName ? info.NickName : '';
            edge.Sex = info.Sex ? info.Sex : '';
            edge.EmailVerified = info.EmailVerified ? info.EmailVerified : '';
            edge.MobileVerified = info.MobileVerified ? info.MobileVerified : '';
            edge.TimeStamp = new Date();
            if ( dbg >= 1 ) console.log('motechat:UpdateUserInfo edge=%s', JSON.stringify(edge));
            return i;
        }
    }
    catch(err){
        console.log('motechat:UpdateUserInfo error=%s', err.message);
        return -1;
    }    
}

var ClearUserInfo = function(stoken){
    try {
        var i = ChkEdgeInfo(stoken);
        if ( i >= 0 ) {
            var edge = edgetable[i];
            edge.UToken = '';
            edge.Uid = '';
            edge.UserName = '';
            edge.NickName = '';
            edge.Sex = -1;
            edge.EmailVerified = false;
            edge.MobileVerified = false;
            edge.TimeStamp = new Date();
            if ( dbg >= 1 ) console.log('motechat:ClearUserInfo edge=%s', JSON.stringify(edge));
            return i;
        }
    }
    catch(err){
        console.log('motechat:UpdateUserInfo error=%s', err.message);
        return -1;
    }    
}

var MoteErrHandler = function(func, err, SToken, cb){
    console.log('motechat:MoteErr func=%s, err=%s', func, err);
    var i = ChkEdgeInfo(SToken);
    if ( i >= 0 ) {
        var ddn = edgetable[i].DDN;
        InStateHandler(func + ': ' + err, ddn);
    }
    if ( err && err != '' && err.indexOf('not reg') >= 0 ){
        regAgain(SToken, function(result){
            if ( dbg >= 1 ) console.log('motechat:regAgain result=%s', JSON.stringify(result));
        });
    }
}

var StartWDtimer = function(){
    if ( dcenter != '' ){
        var tm = wdInterval + Math.floor((Math.random() * 10) + 1) * 500;
        wdtimer = setInterval(function(){
            if ( dcState ) PollDC();
        }, tm);
    }
}

var PollDC = function(){
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'poll', 'poll', null, null, function(reply){
            if ( dbg >= 0 ) console.log('motechat: PollDC reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == mcerr.MC_OKCODE ){
                if ( edgetable.length > 0 ){
                    if ( reply.result.length == 0 ){
                        dcState = '';
                        var tm = 1000 + Math.floor((Math.random() * 10) + 1) * 200;
                        setTimeout(function(){
                            CallDcenterReset(function(result){
                                if ( dbg >= 0 )console.log('motechat:DC restart:Reset reply=%s', JSON.stringify(result));
                                if ( result.ErrCode == mcerr.MC_OKCODE ){
                                    // DC response OK
                                    regRecoverAll();
                                }
                            });
                        },tm);
                        ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"action":"keepalive","result": "dc: restarted"});
                        InStateHandler('dc restart');
                    }
                }
            }
            else {
                var comment = reply.MMA ? '(' + reply.MMA + ')' : '';
                ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"action":"keepalive","result": "dc: " + reply.ErrMsg + comment});
            }
        });
    }    
}

/*
var FindMissEdge = function(){
    var iret = -1;
    for ( var i = 0; i < edgetable.length; i++ ){
        if ( edgetable[i].State == 'miss' ) {
            iret = i;
            break;
        }
    }
    return iret; 
}
*/

