// motechat: module for motechat
// Date: 2018/07/06
// Version: 0.99

var exports = module.exports = {};
var appname = '';
var iocmma = '';
var webtype = '';
var dcenter = '';
var ucenter = '';
var rcvemsgcb;
var statecb;
var wrcvemsgcb;
var wstatecb;
var ins, ws, uc;
var appkey = '';
var mbusmma = '';
var mbusport = '6780';
var mcState = '';
var isweb = false;
var mcwanip = '';
var autoreg = true;
var wdtimer;
var wdInterval = 60000;
var regflag = false;
var ucState = '';

/*
var MC_OKCODE = 0;
var MC_OKMSG = "OK";
var MC_ERRCODE = -252;
*/

var edgetable = [];
var dbg = 0;
var mcerr;
var isPollDC = true;

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
    var EiToken, SToken, reginfo, cb, moteinfo;
    var regflag = false;
    mcerr = require('./mcerr.js')
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
        if ( typeof callback == 'function' ) callback({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
    }
    appname = conf.AppName;
    iocmma = conf.IOC;
    dcenter = conf.DCenter;
    if ( typeof conf.UCenter == 'string' ) ucenter = conf.UCenter;
    appkey = conf.AppKey;
    webtype = conf.UseWeb;
    isweb = conf.UseWeb == '' ? false : true;
    if ( mcState == '' ){
        ins = require('./in.js');
        ins.On('state', InStateHandler);
        ins.Open( appname, iocmma, isweb, function(result){
            console.log('motechat:in Open result=%s', JSON.stringify(result));
            if ( result.ErrCode == mcerr.MC_OKCODE ) {
                mcState = 'open';
                moteinfo = result.Mote;
                mbusmma = result.Mote.EiMMA;
                mbusport = result.Mote.EiPort;
                console.log('motechat:Open mma=%s, port=%s, LIP=%s', mbusmma, mbusport, mcwanip, result.Mote.EiHost)
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
                                if ( regflag == true ){
                                    var data = {"SToken":reginfo.SToken,"EiToken":reginfo.EiToken,"WIP":mcwanip,"Web":webtype};
                                    tryreg( data, 2, cb );
                                }
                                else {
                                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Mote":result.Mote});
                                }
                            }
                            else {
                                if ( typeof cb == 'function' ) cb(result);
                            }
                        });
                        if ( isPollDC == true ) StartWDtimer();
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Mote":result.Mote});
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
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
        //console.log('motechat:typeof rcvemsgcb=%s, wrcvemsgcb=%s', typeof rcvemsgcb, typeof wrcvemsgcb );
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
        //console.log('motechat:typeof rcvemsgcb=%s, wrcvemsgcb=%s', typeof rcvemsgcb, typeof wrcvemsgcb );
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
                    reg(regdata, callback);
                }, tm, data, cb);
            }
            else {
                if ( typeof cb == 'function' ) cb(result);
            }
        });    
    }
    catch(err){
        console.log('motechat:tryreg error:%s', err.message);
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

var reg = function(data, cb){
    // data: {EiToken, SToken, WIP, Web}
    if ( dbg >= 1 ) console.log('motechat:reg: data=%s', JSON.stringify(data));
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
                var einfo = NewEdgeInfo(rst.SToken, dcData.AppKey, rst.EiToken, dcData.EiUMMA, dcData.EiUPort, rst.DDN, rst.WIP, rst.LIP, web, rst.UToken, rst.Uid, rst.UserName, rst.NickName, rst.MobileNo, rst.Sex, rst.EmailVerified, rst.MobileVerified);
                var ix = UpdateEdgeInfo(einfo);
                if ( typeof reply.result.EiName == 'string' && reply.result.EiName != '' ) device = reply.result.EiName;
                else device = reply.result.DDN;
                eimma = reply.result.EiMMA;
            }
            ins.iocEvent('', mbusmma, 'info', 'in', {"Device":device,"action":"reg","result":reply.ErrMsg});
            if ( typeof cb == 'function' ) cb(reply);
            // after reg, require uc
            if ( ucenter != '' && eimma != '' && ucState == '' ) {
                uc = require('./uc.js');
                uc.Start(ins, ucenter, eimma);
                console.log('uc start!');
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
                if ( dbg >= 0 ) console.log('motechat:regAgain: data=%s', JSON.stringify(dcData));
                tryreg( dcData, function(result){
                    console.log('motechat:regAgain result=%s', JSON.stringify(result));
                    InStateHandler('re-reg ' + result.ErrMsg, data.DDN);
                    if ( typeof cb == 'function' ) cb(result);
                });
            }
        }
    }
}

var regAgainAll = function(){
    var data, dcData;
    var ix = FindMissEdge();
    if ( ix >= 0 ){
        data = edgetable[ix];
        if ( data.State != 'conn' && data.State != 'reg'){
            data.State = 'reg';
        //dcData = {"AppKey":data.AppKey,"EiToken":data.EiToken,"SToken":SToken,"EiUMMA":data.EiUMMA,"EiUPort":data.EiUPort,"WIP":data.WIP,"LIP":data.LIP};
            dcData = {"EiToken":data.EiToken,"SToken":data.SToken,"WIP":data.WIP,"Web":data.Web};
            if ( dbg >= 0 ) console.log('motechat:regAgainAll: data=%s', JSON.stringify(dcData));
            tryreg( dcData, function(result){
                console.log('motechat:regAgainAll result=%s', JSON.stringify(result));
                InStateHandler('re-reg ' + result.ErrMsg, data.DDN);
            });
        }
        setTimeout(function(){regAgainAll();},500);
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
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
            return;    
        }
        if ( dcenter == '' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NullDC,"ErrMsg":mcerr.MC_NullDC_Msg});
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
                if ( dbg >= 1 ) console.log('motechat:Send fm DDN=%s,EiName=%s,target=%s,data=%s', ddn, dname, target, JSON.stringify(data));    
                xdata = {"stoken":stoken,"target":target,"in":{"fm":{"DDN":ddn,"Name":dname},"msgtype":""},"data":data};
                ins.SendXmsg(dcenter, xdata, [], timeout, waitreply,
                    function(result){
                        var edata = {"From":dname,"DDN":ddn,"Type":dtype,"To":target,"msg":data,"result":""};
                        if ( typeof result.body != 'undefined' ){
                            var body = result.body;
                            if ( dbg >= 1 ) console.log('motechat:Send: result=%s', JSON.stringify(body));
                            if ( typeof cb == 'function' ) cb(body);
                            if ( typeof body.Reply != 'undefined'){
                                var reply = body.Reply;
                                if ( typeof reply.ErrCode != 'undefined' ){
                                    edata.result = reply.ErrMsg;
                                }
                            }
                            if ( edata.result == '' ){
                                if ( typeof body == 'object' ) edata.result = JSON.stringify(body)
                                else edata.result = body;
                            }
                        }
                        else {
                            if ( typeof cb == 'function' ) cb(result);
                            if ( typeof result == 'object' ) edata.result = JSON.stringify(result)
                            else edata.result = result;
                        }
                        ins.iocEvent('', mbusmma, 'info', 'send', edata);
                        if ( edata.result != mcerr.MC_OKMSG ){
                            MoteErrHandler('send', edata.result, xdata.stoken);
                        }
                    }
                );
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});    
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
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
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
            return;    
        }
        if ( dcenter == '' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NullDC,"ErrMsg":mcerr.MC_NullDC_Msg});
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
                if ( target == 'UC' || target == 'uc' ){
                    if ( ucState == 'start' ){
                        try {
                            var ucdata = {"SToken":stoken,"Func":func,"Data":data};
                            uc.UcCall( ucdata, function(reply){
                                if ( typeof cb == 'function' ) cb(reply);
                                if ( func == 'ucLogin' || func == 'ucLogout' ){
                                    HandleUserInfo( func, stoken, reply );
                                }
                            });
                        }
                        catch(e){
                            if ( typeof cb == 'function' ) cb({"ErrCode":err.MC_ERRCODE,"ErrMsg":e.message});
                        }
                    }
                    else cb({"ErrCode":err.MC_ERRCODE,"ErrMsg":"uc modules not open"});
                }
                else {
                    var dcData = {"stoken":stoken,"target":target,"func":func,"data":data};
                    ins.CallXrpc( dcenter, 'call', dcData, timeout, waitreply, function(result){
                        if ( dbg >= 1 ) console.log('motechat:Call result=%s', JSON.stringify(result));
                        var edata = {"From":dname,"DDN":ddn,"Type":dtype,"To":dcData.target,"msg":dcData.func + ' ' + dcData.data,"result":""};
                        if ( typeof cb == 'function' ) cb(result);
                        if ( typeof result.Reply != 'undefined'){
                            var reply = result.Reply;
                            if ( typeof reply.ErrCode != 'undefined' ){
                                edata.result = reply.ErrMsg;
                            }
                        }
                        if ( edata.result == '' ){
                            if ( typeof body == 'object' ) edata.result = JSON.stringify(body)
                            else edata.result = body;
                        }
                        ins.iocEvent('', mbusmma, 'info', 'call', edata);
                        if ( edata.result != mcerr.MC_OKMSG ){
                            MoteErrHandler('call', edata.result, xdata.stoken);
                        }
                    });
                }
            } 
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}); 
            }   
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg}); 
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        //console.log('motechat:GetDeviceInfo data=%s', JSON.stringify(data));
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'setinfo', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SetDevice reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('set', reply.ErrMsg, data.SToken);
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'getapp', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:GetAppSetting reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('getappsetting', reply.ErrMsg, data.SToken);
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'setapp', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SetAppSetting reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('setappsetting', reply.ErrMsg, data.SToken);
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        if ( dbg >= 1 )console.log('motechat:GetQPin data=%s', JSON.stringify(data));
        ins.CallXrpc( dcenter, 'getqpin', data, null, null, function(reply){
            if ( dbg >= 2 ) console.log('motechat:GetQPin reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('getqpin', reply.ErrMsg, data.SToken);
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'findqpin', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:FindQPin reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('findqpin', reply.ErrMsg, data.SToken);
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'search', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:Search reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('search', reply.ErrMsg, data.SToken);
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'nearby', data, null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat:Nearby reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('nearby', reply.ErrMsg, data.SToken);
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
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
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
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

var InStateHandler = function(state, ddn){
    if ( dbg >= 1 ) console.log('motechat:InStateHandler state=%s',state);
    if ( typeof statecb == 'function' ) statecb(state, ddn);
    if ( typeof wstatecb == 'function' ) wstatecb(state, ddn);
}

var CallDcenterReset = function(cb){
    if ( mcState == '' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'resetreg', {"EiUMMA":mbusmma}, null, null, function(reply){
            if ( dbg >= 0 ) console.log('motechat:CallDcenterReset reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode != mcerr.MC_OKCODE ){
                var tm = Math.floor((Math.random() * 10) + 1) * 2000;
                setTimeout(function(data, callback){
                    ins.CallXrpc( dcenter, 'resetreg', data, null, null, function(reply){
                        if ( typeof callback == 'function' ) cb(reply);
                    });  
                }, tm, {"EiUMMA":mbusmma}, cb);
            }
            else {
                if ( typeof cb == 'function' ) cb(reply);
            }
        });
    }
    else {
        console.log('motechat:CallDcenterReset error: null dcenter');
    }
}

var MoteChatGetHandler = function(ch, head, body, cb){
    var from = {};
    var msgtype = '';
    if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler body=%s',JSON.stringify(body));
    if ( typeof body.in == 'object' ){
        var from = (typeof body.in.fm != 'undefined' ) ? body.in.fm : {};
        var msgtype = (typeof body.in.msgtype != 'undefined' ) ? body.in.msgtype : '';
    }
    var ddn = (typeof body.ddn != 'undefined' ) ? body.ddn : '';
    var data = (typeof body.data != 'undefined' ) ? body.data : '';
    if ( ddn != '' && typeof cb == 'function' ){
        var ddnlist = [];
        ddnlist = FindEdgeInfo('ddn', ddn);
        if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
        if ( ddnlist.length > 0 ){
            //if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
            for ( var i = 0; i < ddnlist.length; i++ ){
                var toddn, ret;
                toddn = ddnlist[i].DDN;
                if ( ddnlist[i].Web == ''){
                    //console.log('MoteChatGetHandler: app received');
                    //if ( typeof rcvemsgcb == 'function' ) rcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                    //else ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg};
                    if ( typeof rcvemsgcb == 'function' ) {
                        if ( ch == 'xrpc' )
                            rcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                        else {
                            ret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"By":mbusmma};
                            cb(ret);
                            setTimeout(function(ch, head, from, toddn, msgtype, data){
                                rcvemsgcb(ch, head, from, toddn, msgtype, data, function(reply){
                                    console.log('MoteChatGetHandler app callback=%s', JSON.stringify(reply));
                                });
                            },300, ch, head, from, toddn, msgtype, data);
                        }
                    }
                    else {
                        ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"By":mbusmma};
                        cb(ret);
                    }
                }
                else {
                    //console.log('MoteChatGetHandler: web received');
                    //if ( typeof wrcvemsgcb == 'function' ) wrcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                    //else ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"DDN":ddn};
                    if ( typeof wrcvemsgcb == 'function' ) {
                        if ( ch == 'xrpc' )
                            wrcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                        else {
                            ret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"By":mbusmma};
                            cb(ret);
                            setTimeout(function(ch, head, from, toddn, msgtype, data){
                                wrcvemsgcb(ch, head, from, toddn, msgtype, data, function(reply){
                                    console.log('MoteChatGetHandler webapp callback=%s', JSON.stringify(reply));
                                });
                            },300, ch, head, from, toddn, msgtype, data);
                        }
                    }
                    else {
                        ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"By":mbusmma};
                        cb(ret);
                    }
                }
            }
        }
        else {
            ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"By":mbusmma};
            console.log('motechat:MoteChatGetHandler ret=%s',JSON.stringify(ret));
            cb(ret);
        }
    }
    else {
        ret = {"ErrCode":mcerr.MC_NullDDN,"ErrMsg":mcerr.MC_NullDDN_Msg};
        console.log('motechat:MoteChatGetHandler ret=%s',JSON.stringify(ret));
    }   
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

var NewEdgeInfo = function(stoken, appkey, eitoken, eiumma, eiuport, ddn, wanip, lanip, web, utoken, uid, username, nickname, mobileno, sex, emailcheck, mobilecheck){
    var info = {"SToken":stoken,"AppKey":appkey,"EiToken":eitoken,"EiUMMA":eiumma,"EiUPort":eiuport,
    "DDN":ddn,"EiOwner":"","EiName":"","EiType":"","EiTag":"","WIP":wanip,"LIP":lanip,
    "UToken":utoken,"Uid":uid,"UserName":username,"NickName":nickname,"MobileNo":mobileno,"Sex":sex,
    "EmailVerified":emailcheck,"MobileVerified":mobilecheck,"TimeStamp":new Date(),"Web":web,"State":""};
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
                if ( typeof info.DDN == 'undefined' ) ddn = '';
                else ddn = info.DDN  != null ? info.DDN: '';
                if ( typeof info.EiOwner == 'undefined' ) owner = '';
                else owner = info.EiOwner != null ? info.EiOwner : '';
                if ( typeof info.EiName == 'undefined' ) ename = '';
                else ename = info.EiName != null ? info.EiName : '';
                if ( typeof info.EiType == 'undefined' ) etype = '';
                else etype = info.EiType != null ? info.EiType : '';
                if ( typeof info.EiTag == 'undefined' ) etag = '';
                else etag = info.EiTag != null ? info.EiTag : '';
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
        if ( typeof reply.ErrCode == 'undefined' && typeof reply.Uid != 'undefined' ){
            UpdateUserInfo( stoken, reply ); 
        }
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
    if ( typeof err == 'string' && err != '' && err.indexOf('not reg') >= 0 ){
        regAgain(SToken, function(result){
            console.log('motechat:regAgain result=%s', JSON.stringify(result));
        });
    }
}

var StartWDtimer = function(){
    if ( dcenter != '' ){
        wdtimer = setInterval(function(){
            if ( regflag == false ) PollDC();
        }, wdInterval);
    }
}

var PollDC = function(){
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'poll', 'poll', null, null, function(reply){
            if ( dbg >= 1 ) console.log('motechat: PollDC reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == mcerr.MC_OKCODE ){
                if ( edgetable.length > 0 ){
                    if ( reply.result.length == 0 ){
                        // dc restarted
                        if ( dbg >= 1 ) console.log('motechat:PollDC: DC restarted');
                        for ( var i = 0; i < edgetable.length; i++ ){
                            edgetable[i].State = 'miss';
                        }
                        regAgainAll();
                    }
                }
            }
        });
    }    
}

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

