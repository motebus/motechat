// motechat: module for motechat
// Date: 2018/5/30
// Version: 0.99

var exports = module.exports = {};
var appname = '';
var iocmma = '';
var webtype = '';
var dcenter = '';
var rcvemsgcb;
var statecb;
var wrcvemsgcb;
var wstatecb;
var ins, ws;
var appkey = '';
var mbusmma = '';
var mbusport = '6780';
var mcState = '';
var isweb = false;
var mcwanip = '';
var autoreg = true;

var MC_OKCODE = 0;
var MC_OKMSG = "OK";
var MC_ERRCODE = -252;

var edgetable = [];
var dbg = 0;

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

exports.Open = function(conf, reg, callback){
    var EiToken, SToken, reginfo, cb;
    var regflag = false;
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
        if ( typeof reg == 'object' ) reginfo = reg;
        if ( typeof callback == 'function' ) cb = callback;
        if ( typeof reginfo.SToken == 'string' && typeof reginfo.EiToken == 'string' )
            regflag = true;
    }
    else {
        if ( typeof callback == 'function' ) callback({"ErrCode":MC_ERRCODE,"ErrMsg":"invalid data"});
    }
    appname = conf.AppName;
    iocmma = conf.IOC;
    dcenter = conf.DCenter;
    appkey = conf.AppKey;
    webtype = conf.UseWeb;
    isweb = conf.UseWeb == '' ? false : true;
    if ( mcState == '' ){
        ins = require('./in.js');
        ins.On('state', InStateHandler);
        ins.Open( appname, iocmma, isweb, function(result){
            console.log('motechat:Open result=%s', JSON.stringify(result));
            if ( result.ErrCode == MC_OKCODE ) {
                mcState = 'open';
                CallDcenterReset(function(reply){
                    console.log('motechat:DcReset reply=%s', JSON.stringify(reply));
                    if ( reply.ErrCode == MC_OKCODE ){
                        ins.getmbInfo( function(result){
                            console.log('motechat:mbusInfo result=%s', JSON.stringify(result));
                            if ( result.ErrCode == MC_OKCODE ){
                                mbusmma = result.Mote.EiMMA;
                                mbusport = result.Mote.EiPort;
                                mcwanip = result.Mote.WANIP;
                                console.log('motechat:mbusInfo mma=%s, port=%s, WIP=%s, LIP=%s', mbusmma, mbusport, mcwanip, result.Mote.EiHost)
                                ins.On('message', MoteChatGetHandler);
                                if ( regflag == true ){
                                    var data = {"SToken":reginfo.SToken,"EiToken":reginfo.EiToken,"WIP":mcwanip,"Web":webtype};
                                    tryreg( data, 2, cb );
                                }
                                else {
                                    console.log('matchat:Open typeof cb=%s', typeof cb);
                                    if ( typeof cb == 'function' ) cb({"ErrCode":MC_OKCODE,"ErrMsg":MC_OKMSG,"Mote":result.Mote});
                                }
                            }
                            else {
                                if ( typeof cb == 'function' ) cb(result);
                            }
                        });
                    }
                    else {
                        if ( typeof cb == 'function' ) cb(reply);
                    }
                });
            }
            else {
                if ( typeof cb == 'function' ) cb(result);
            }
        });
    }
    else {
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_OKCODE,"ErrMsg":MC_OKMSG,"Mote":result.Mote});
    }
}

/*
 * the method that close motechat
 * Input:
 *   cb: callback({ErrCode,ErrMsg})
 */


exports.Close = function(cb){
    if ( mcState == 'open' ){
        mcState = 'close';
        unregAll();
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_OKCODE,"ErrMsg":MC_OKMSG});
    }
}

/**
 * OnEvent, on event handler
 * @example 
var InmsgRcve = function(ch, head, from, to, msgtype, data){
   console.log('InmsgRcve: channel=%s, from=%s, to=%s, msgtype=%s, data=%s', 
   ch, JSON.stringify(from), to, msgtype, JSON.stringify(data));
} 
var InState = function(state){
   console.log(‘InState=%s’, state);
}
 
mChat.OnEvent('message',InmsgRcve);
mChat.OnEvent('state', InState); 
 * @function OnEvent
 * @param {String} stype "message" is for getxmsg, "state" is for state changed
 * @param {function} cb  the user routine entry
 * @returns {boolean}
 */

exports.OnEvent = function(stype, cb, webtype){
    if ( stype == 'message' && typeof cb == 'function' ){
        if ( typeof webtype != 'undefined' && webtype != '' ) wrcvemsgcb = cb;
        else rcvemsgcb = cb;
        console.log('typeof rcvemsgcb=%s, wrcvemsgcb=%s', typeof rcvemsgcb, typeof wrcvemsgcb );
        return true;    
    }
    else if ( stype == 'state' && typeof cb == 'function' ){
        if ( typeof webtype != 'undefined' && webtype != '' ) wstatecb = cb;
        else statecb = cb;
        return true;
    }
    return false;
}

/*
 Module: GetMsg, to set the handler entry when message is comming
    Input:
      cb: the user routine entry when message is comming
    Output:
      return is boolean ( true or false )
*/

exports.GetMsg = function(cb, webtype){
    if ( typeof cb == 'function' ) {
        if ( typeof webtype != 'undefined' && webtype != '' ) wrcvemsgcb = cb;
        else rcvemsgcb = cb;
        console.log('typeof rcvemsgcb=%s, wrcvemsgcb=%s', typeof rcvemsgcb, typeof wrcvemsgcb );
        return true;
    }
    else return false;
}

/*
 Module: GetState, to set the handler entry when motebus state changed
    Input:
      cb: the user routine entry when motebus state changed
    Output:
      return is boolean ( true or false )
*/

exports.GetState = function(cb, webtype){
    if ( typeof cb == 'function' ) {
        if ( typeof webtype != 'undefined' && webtype != '' ) wstatecb = cb;
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
mChat.Publish( XrpcMcService, function(result){
    console.log('motechat publish: result=%s', JSON.stringify(result));
});
 * @function Publish
 * @param {String} app the name of function
 * @param {function} func the user function entry which is published at motechat
 * @param {publishCallback} cb 
 */

exports.Publish = function(app, func, cb){
    ins.PublishXrpc( app, func, cb );
}

/**
 * @callback isolatedRequest
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


exports.Isolated = function(func, cb){
    ins.IsolatedXrpc( func, cb );
}

/**
 * @callback regCallback
 * @param {Object} result {ErrCode,ErrMsg,result}
 */

/**
 * register to device center
 * @function Reg
 * @example
var mydev = {"EiToken":"8dilCCKj","SToken":"baTi52uE"};
mChat.Reg(mydev, function(result){
    console.log('StartSession result=%s', JSON.stringify(result));
});
//Note: At first time of the device, EiToken and SToken is empty.
 * 
 * @param {Object} data         the information for session
 * @param {String} data.EiToken device token
 * @param {String} data.SToken  app token
 * @param {regCallback} cb 
 */

exports.Reg = function(data, cb){
    if ( autoreg == true )
        tryreg( data, 2, cb );
    else
        reg(data, cb);
}

var tryreg = function(data, maxtry, cb){
    var trycount = 0;
    try {
        reg( data, function(result){
            if ( result.ErrMsg == 'DC not ready' ){
                trycount += 1;
                if ( trycount <= maxtry ){
                    console.log('tryreg %d', trycount);
                    var tm = Math.floor((Math.random() * 10) + 1) * 200;
                    setTimeout(function(regdata, callback){
                        reg(regdata, callback);
                    }, tm, data, cb);
                }
                else if ( typeof cb == 'function' ) cb(result);
            }
            else {
                if ( typeof cb == 'function' ) cb(result);
            }
        });    
    }
    catch(err){
        console.log('tryreg error:%s', err.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":err.message});
    }
}

var reg = function(data, cb){
    // data: {EiToken, SToken, WIP, Web}
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
            if ( dbg >= 1 ) console.log('motechat:Reg reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == MC_OKCODE ){
                var einfo = NewEdgeInfo(reply.result.SToken, dcData.AppKey, dcData.EiToken, dcData.EiUMMA, dcData.EiUPort, reply.result.DDN, reply.result.WIP, reply.result.LIP, web);
                UpdateEdgeInfo(einfo);
                if ( typeof reply.result.EiName == 'string' && reply.result.EiName != '' ) device = reply.result.EiName;
                else device = reply.result.DDN;
            }
            ins.iocEvent('', mbusmma, 'info', 'in', {"Device":device,"action":"reg","result":reply.ErrMsg});
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:StartSession error: null dcenter');
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"null DC"});
    }
}

var regAgainAll = function(){
    var data, SToken;
    for ( var i = 0; i < edgetable.length; i++ ){
        data = edgetable[i];
        SToken = data.SToken;
        var dcData = {"AppKey":data.AppKey,"EiToken":data.EiToken,"SToken":SToken,"EiUMMA":data.EiUMMA,"EiUPort":data.EiUPort,"WIP":data.WIP,"LIP":data.LIP};
        regAgain(SToken, function(result){
            console.log('motechat:regAgainAll result=%s', JSON.stringify(result));
        });
    }
}

var regAgain = function(SToken, cb){
    if ( dcenter != '' ){
        var data = GetEdgeInfo('stoken',SToken);
        if ( dbg >= 2 ) console.log('regAgain data=%s', JSON.stringify(data));
        if ( data != null ){
            tryreg( data, 2, cb );
        }
    }
    else {
        console.log('motechat:regAgain error: null dcenter');
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

exports.UnReg = function(data, cb){
    unreg( data.SToken, cb );
}

var unreg = function(SToken, cb){
    if ( dcenter != '' ){
        var dcData = {"SToken":SToken};
        ins.CallXrpc( dcenter, 'unreg', dcData, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:UnReg reply=%s', JSON.stringify(reply));
            var device = dcData.SToken;
            if ( reply.ErrCode == MC_OKCODE ){
                var unreg = RemoveEdgeInfo(data.SToken);
                if ( unreg != null )
                    device = (unreg.EiName != '') ? unreg.EiName : unreg.DDN;
                    ins.iocEvent('', mbusmma, 'info', 'in', {"Device":device,"action":"unreg","result":reply.ErrMsg});
            }
            //ins.iocEvent('', mbusmma, 'info', 'in', {"Device":device,"action":"unreg","result":reply.ErrMsg});
            if ( typeof cb == 'function' ) cb(reply);
        });
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
var target = ‘myEi’;
var data = {"message":"Hello World"};
var ddn = GetSocketAttr('ddn', socket.id);
var stoken = GetSocketAttr('stoken', socket.id);
var xmsgctl = {"SToken":stoken,"From":ddn,"Target":target,"Data":data,"WaitReply":12};
mChat.Send(xmsgctl, function(reply){
    console.log('sendxmsg reply=%s', JSON.stringify(reply));
});
 * @param {Object} xmsg     msg control object
 * @param {String} xmsg.SToken    token of app
 * @param {String} xmsg.From      DDN of source device
 * @param {String} xmsg.Target    can be DDN, EiName, EiType or EiTag of destination device
 * @param {String} xmsg.Data      the data which want to be sent
 * @param {Number} xmsg.WaitReply The wait time of reply, by sec.
 * @param {sendCallback} cb 
 */

exports.Send = function(xmsg, cb){
    var stoken, fm, target, data, timeout, waitreply;
    try {
        if ( mcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
            return;    
        }
        if ( dcenter == '' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"null device center"});
            return;
        }
        stoken = xmsg.SToken;
        //fm = ( typeof xmsg.From == 'string' ) ? xmsg.From : '';
        target = xmsg.Target;
        data = xmsg.Data;
        if ( typeof xmsg.SendTimeout == 'undefined') timeout = null;
        else timeout = xmsg.SendTimeout;
        if ( typeof xmsg.WaitReply == 'undefined') waitreply = null;
        else waitreply = xmsg.WaitReply;
        var info = GetEdgeInfo('stoken', stoken);
        if ( info != null ){
            var ddn = info.DDN;
            var dname = info.EiName;
            var dtype = info.EiType;
            if ( target != '' && data != null ){
                if ( dbg >= 1 ) console.log('Motechat:Send fm DDN=%s,EiName=%s,target=%s,data=%s', ddn, dname, target, JSON.stringify(data));    
                xdata = {"stoken":stoken,"target":target,"in":{"fm":{"DDN":ddn,"Name":dname},"msgtype":""},"data":data};
                ins.SendXmsg(dcenter, xdata, [], timeout, waitreply,
                    function(result){
                        if ( dbg >= 1 ) console.log('Send: result=%s', JSON.stringify(result));
                        var edata = {"From":dname,"DDN":ddn,"Type":dtype,"To":xdata.target,"msg":xdata.data,"result":""};
                        if ( typeof result.ErrCode != "undefined" ){
                            edata.result = result.ErrMsg;
                            ins.iocEvent('', mbusmma, 'info', 'send', edata);
                            if ( result.ErrCode != MC_OKCODE ) MoteErrHandler(result.ErrMsg, xdata.stoken);
                            if ( typeof cb == 'function' ) cb(result);
                        } 
                        else {
                            edata.result = "OK";
                            ins.iocEvent('', mbusmma, 'info', 'send', edata);
                            if ( typeof cb == 'function' ) cb(result.body);
                        }
                    }
                );
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"invalid data"});    
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"invalid stoken"});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":err.message});
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
var target = 'myEi';
var func = 'echo';
var data = {"time":"2018/4/24 10:12:08"};
var xrpc = {"SToken":mydev.SToken,"Target":target,"Func":func,"Data":data};
mChat.Call( xrpc, function(reply){
    console.log('CallSession reply=%s', JSON.stringify(reply));
});
 * @param {Object} xrpc   xrpc control object
 * @param {String} xrpc.SToken app token
 * @param {String} xrpc.Target the target name of function
 * @param {String} xrpc.Func   the function name
 * @param {String} xrpc.Data   the data object for function
 * @param {String} xrpc.target the property of web device ( if need )
 * @param {Object} xrpc.data   the data object want to delivered
 * @param {callCallback} cb 
 */

exports.Call = function(xrpc, cb){
    var stoken, target, func, data, timeout, waitreply;
    try {
        if ( mcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
            return;    
        }
        if ( dcenter == '' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"null device center"});
            return;
        }
        stoken = xrpc.SToken;
        target = xrpc.Target;
        func = xrpc.Func;
        data = xrpc.Data;
        if ( typeof xrpc.SendTimeout == 'undefined') timeout = null;
        else timeout = xrpc.SendTimeout;
        if ( typeof xrpc.WaitReply == 'undefined') waitreply = null;
        else waitreply = xrpc.WaitReply;
        if ( dbg >= 1 ) {
            if ( typeof data == 'object')
                console.log('motechat:Call target=%s,func=%s,data=%s', target, func, JSON.stringify(data));
            else
                console.log('motechat:Call target=%s,func=%s,data=%s', target, func, data);
        }
        var info = GetEdgeInfo('stoken', stoken);
        if ( info != null ){
            var ddn = info.DDN;
            var dname = info.EiName;
            var dtype = info.EiType;
            if ( target != '' && data != null ){
                var dcData = {"stoken":stoken,"target":target,"func":func,"data":data};
                ins.CallXrpc( dcenter, 'call', dcData, timeout, waitreply, function(reply){
                    if ( dbg >= 1 ) console.log('motechat:Call reply=%s', JSON.stringify(reply));
                    var edata = {"From":dname,"DDN":ddn,"Type":dtype,"To":dcData.target,"msg":dcData.func + ' ' + dcData.data,"result":""};
                    if ( typeof reply.ErrCode != "undefined" ){
                        edata.result = reply.ErrMsg;
                        ins.iocEvent('', mbusmma, 'info', 'call', edata);
                        if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, dcData.stoken);
                    }
                    else {
                        edata.result = "OK";
                        ins.iocEvent('', mbusmma, 'info', 'call', edata);
                        if ( typeof cb == 'function' ) cb(reply);
                    }
                });
            } 
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"invalid data"}); 
            }   
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"invalid stoken"}); 
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":err.message});
    }
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

exports.Get = function(data, cb){
    // data {SToken}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        //console.log('motechat:GetDeviceInfo data=%s', JSON.stringify(data));
        ins.CallXrpc( dcenter, 'getinfo', data, null, null, function(reply){
            if ( dbg >= 2 ) console.log('motechat:GetDevice reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == MC_OKCODE ){
                var ginfo = reply.result;
                var uinfo = {"SToken":data.SToken,"EiOwner":ginfo.EiOwner,"EiName":ginfo.EiName,"EiType":ginfo.EiType,"EiTag":ginfo.EiTag};
                UpdateEdgeInfo(uinfo);
                if ( dbg >= 1 ) console.log('motechat:GetDevice edgetable=%s', JSON.stringify(edgetable));
            }
            else {
                MoteErrHandler(reply.ErrMsg, data.SToken);
            }
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:GetDeviceInfo error: null dcenter');
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


exports.Set = function(data, cb){
    // data: {SToken, EdgeInfo}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'setinfo', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SetDevice reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, data.SToken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:SetDeviceInfo error: null dcenter');
    }
}

// Module: GetAppSetting, get my application information
// Input:
//  data: the input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.GetAppSetting = function(data, cb){
    // data : {SToken}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'getapp', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:GetAppSetting reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, data.SToken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:GetAppSetting error: null dcenter');
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
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'setapp', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SetAppSetting reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, data.SToken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:SetAppSetting error: null dcenter');
    }
}

// Module: GetQPin, get PIN code
// Input:
//  data: input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.GetQPin = function(data, cb){
    // data: {SToken}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'getqpin', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:GetQPin reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, data.SToken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:GetQPin error: null dcenter');
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
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'findqpin', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:FindQPin reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, data.SToken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:FindQPin error: null dcenter');
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

exports.Search = function(data, cb){
    // data {SToken, Keyword}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'search', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:Search reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, data.SToken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:Search error: null dcenter');
    }
}

// Module: Nearby, search nearby device
// Input:
//  data: input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Nearby = function(data, cb){
    // data {SToken}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'nearby', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:Nearby reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, data.SToken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:Nearby error: null dcenter');
    }
}

exports.SendLog = function(){
    // data {SToken, lgTime, lgType, lgDesc}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'Sendlog', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SendLog reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:SendLog error: null dcenter');
    }
}

exports.ListLogs = function(data){
    // data {SToken, RowCount, bFirst}
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'Sendlog', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SendLog reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:SendLog error: null dcenter');
    }
}

exports.GetAppKey = function(){
    return appkey;
}

exports.MoteChatGetHandler = function(ch, head, body, cb){
    MoteChatGetHandler(ch, head, body, cb)
}

var InStateHandler = function(state){
    if ( dbg >= 1 ) console.log('motechat:InStateHandler state=%s',state);
    if ( typeof statecb == 'function' ) statecb(state);
    if ( typeof wstatecb == 'function' ) wstatecb(state);
}

var CallDcenterReset = function(cb){
    if ( mcState == '' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"motechat closed"});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'resetreg', {"EiUMMA":mbusmma}, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:CallDcenterReset reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:CallDcenterReset error: null dcenter');
    }
}

var MoteChatGetHandler = function(ch, head, body, cb){
    var ret = null;
    var from = {};
    var msgtype = '';
    if ( typeof body.in == 'object' ){
        var from = (typeof body.in.fm != 'undefined' ) ? body.in.fm : {};
        var msgtype = (typeof body.in.msgtype != 'undefined' ) ? body.in.msgtype : '';
    }
    var ddn = (typeof body.ddn != 'undefined' ) ? body.ddn : '';
    var data = (typeof body.data != 'undefined' ) ? body.data : '';
    var toddn;
    if ( ddn != '' ){
        var ddnlist = [];
        ddnlist = FindEdgeInfo('', ddn);
        if ( ddnlist.length > 0 ){
            if ( dbg >= 1 ) console.log('MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
            for ( var i = 0; i < ddnlist.length; i++ ){
                toddn = ddnlist[i].DDN;
                if ( ddnlist[i].Web == ''){
                    //console.log('MoteChatGetHandler: app received');
                    if ( typeof rcvemsgcb == 'function' ) rcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                    else ret = {"ErrCode":MC_ERRCODE,"ErrMsg":"no rcve function"};
                }
                else {
                    //console.log('MoteChatGetHandler: web received');
                    if ( typeof wrcvemsgcb == 'function' ) wrcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                    else ret = {"ErrCode":MC_ERRCODE,"ErrMsg":"no rcve function"};
                }
            }
        }
        else ret = {"ErrCode":MC_ERRCODE,"ErrMsg":"no DDN"};
    }
    else ret = {"ErrCode":MC_ERRCODE,"ErrMsg":"DDN is null"};
    if ( typeof cb == 'function' && ret != null ) cb(ret);    
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

var NewEdgeInfo = function(stoken, appkey, eitoken, eiumma, eiuport, ddn, wanip, lanip, web){
    var info = {"SToken":stoken,"AppKey":appkey,"EiToken":eitoken,"EiUMMA":eiumma,"EiUPort":eiuport,
    "DDN":ddn,"EiOwner":"","EiName":"","EiType":"","EiTag":"","WIP":wanip,"LIP":lanip,"TimeStamp":new Date(),"Web":web};
    return info;
}

var UpdateEdgeInfo = function(info){
    try {
        if ( dbg >= 1 )console.log('UpdateEdgeInfo info=%s', JSON.stringify(info));
        var i = ChkEdgeInfo(info.SToken);
        if ( i < 0 ){
            edgetable.push(info);
        }
        else {
            var edge = edgetable[i];
            edge.EiOwner = info.EiOwner;
            edge.EiName = info.EiName;
            edge.EiType = info.EiType;
            edge.EiTag = info.EiTag;
            edge.TimeStamp = new Date();
        }
        return true;
    }
    catch(err){
        console.log('AddEdge error=%s', err.message);
        return false;
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

// GetEdgeInfo: get the edge information by stoken or ddn
var GetEdgeInfo = function(stype, skey){
    var atype = stype;
    var info;
    var stoken, ddn;
    if ( atype != '' ) atype = atype.toLowerCase();
    if ( dbg >= 2 ) console.log('GetEdgeInfo stype=%s,skey=%s', stype, skey);
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
            if ( typeof ddn == 'string'){
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
    var stoken, ddn, owner, ename, etype, etag;
    var found = false;
    if ( atype != '' ) atype = atype.toLowerCase();
    //console.log('FindEdgeInfo stype=%s,skey=%s', stype, skey);
    if ( dbg >= 2 ) console.log('FindEdgeInfo edgetable=%s', JSON.stringify(edgetable));
    for ( var i = 0; i < edgetable.length; i++ ){
        if ( atype == 'stoken' ){
            stoken = edgetable[i].SToken;
            if ( skey == stoken ){
                darr.push({"DDN":edgetable[i].DDN,"Web":edgetable[i].Web});
                break;
            }
        }
        else if ( atype == 'owner' ){
            owner = edgetable[i].EiOwner;
            if ( typeof owner == 'string'){
                if ( skey == owner )
                    darr.push({"DDN":edgetable[i].DDN,"Web":edgetable[i].Web});
            }
        }
        else {
            ddn = edgetable[i].DDN;
            found = false;
            if ( typeof ddn == 'string'){
                if ( skey == ddn ) found = true;
            }
            owner = edgetable[i].EiOwner;
            if ( typeof owner == 'string'){
                if ( skey == owner ) found = true;
            }
            ename = edgetable[i].EiName;
            //console.log('FindEdgeInfo EiName=%s', ename);
            if ( typeof ename == 'string'){
                if ( skey == ename ) found = true;
            }
            etype = edgetable[i].EiType;
            if ( typeof etype == 'string'){
                if ( skey == etype ) found = true;
            }
            etag = edgetable[i].EiTag;
            if ( typeof etag == 'string'){
                if ( etag.indexOf(skey) >= 0 ) found = true;
            }
            if ( found ) darr.push({"DDN":ddn,"Web":edgetable[i].Web});
        }
    }
    if ( dbg >= 2 ) console.log('FindEdgeInfo return=%s',JSON.stringify(darr));
    return darr;
}


var MoteErrHandler = function(err, SToken, cb){
    console.log('motechat:MoteErr err=%s', err);
    if ( autoreg == true && typeof err == 'string' ){
        var errcode = err;
        if ( errcode != '' ) errcode = errcode.toLowerCase();
        if ( errcode == 'not reg' ){
            regAgain(SToken, cb);
        }
        else if ( errcode == 'dc restarted' ){
            regAgainAll(cb);
        } 
    }
}

/*
var AllReStartSession = function(cb){
    var data, tm;
    for ( var i = 0; i < edgetable.length; i++ ){
        data = edgetable[i];
        var dcData = {"AppKey":data.AppKey,"EiToken":data.EiToken,"SToken":data.SToken,"EiUMMA":data.EiUMMA,"EiUPort":data.EiUPort,"WIP":data.WIP,"LIP":data.LIP};
        tm = Math.floor((Math.random() * 10) + 1) * 100;
        setTimeout(function(info){
            ins.CallXrpc( dcenter, 'reg', info, null, null, function(reply){
                if ( dbg >= 1 ) console.log('motechat:AllReStartSession reply=%s', JSON.stringify(reply));
            });
        },tm, dcData);
    }
}

var ReStartSession = function(SToken, cb){
    // data: {EiToken, SToken}
    if ( dcenter != '' ){
        var data = GetEdgeInfo('stoken',SToken);
        if ( dbg >= 2 ) console.log('ReStartSession data=%s', JSON.stringify(data));
        if ( data != null ){
            var dcData = {"AppKey":data.AppKey,"EiToken":data.EiToken,"SToken":data.SToken,"EiUMMA":data.EiUMMA,"EiUPort":data.EiUPort,"WIP":data.WIP,"LIP":data.LIP};
            ins.CallXrpc( dcenter, 'reg', dcData, null, null, function(reply){
                if ( dbg >= 1 ) console.log('motechat:ReStartSession reply=%s', JSON.stringify(reply));
                if ( typeof cb == 'function' ) cb(reply);
            });
        }
    }
    else {
        console.log('motechat:ReStartSession error: null dcenter');
    }
}
*/

