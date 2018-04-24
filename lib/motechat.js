var exports = module.exports = {};
var appname = '';
var iocmma = '';
var webtype = '';
var dcenter = '';
var rcvemsgcb;
var statecb;
var ins, ws;
var appkey = '';
var mbusmma = '';
var mbusport = '6780';

var MC_OKCODE = 0;
var MC_OKMSG = "OK";
var MC_ERRCODE = -252;

var edgetable = [];
var dbg = 0;

// Module: Init, to initial motechat and motebus
// Input:
//  conf: the configuration object for init. 
//      AppName: the name of motebus MMA
//      IOC: the MMA of IOC
//      DCenter: the MMA of device enter
//      AppKey: the key string of app
//      UseWeb: can be 'websocket', 'ajax', or ''
//  cb: callback({ErrCode,ErrMsg})
exports.Init = function(conf, cb){
    appname = conf.AppName;
    iocmma = conf.IOC;
    dcenter = conf.DCenter;
    appkey = conf.AppKey;
    webtype = conf.UseWeb;
    var isweb = conf.UseWeb == '' ? false : true;
    ins = require('./in.js');
    ins.on('state', InStateHandler);
    ins.Init( appname, iocmma, isweb, function(result){
        console.log('motechat:Init result=%s', JSON.stringify(result));
        if ( result.ErrCode == MC_OKCODE ) {
            mbusmma = result.Mote.EiMMA;
            mbusport = result.Mote.EiPort;
            ins.on('message', MoteChatGetHandler);
        }
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_OKCODE,"ErrMsg":MC_OKMSG});
        CallDcenterReset();
    } );
}

// Module: on, on event handler
// Input:
//  stype: "message" is for getxmsg, "state" is for state changed
//  cb: the user routine entry
// Output:
//  return is boolean ( true or false )
exports.on = function(stype, cb){
    if ( stype == 'message' && typeof cb == 'function' ){
        rcvemsgcb = cb;
        return true;    
    }
    else if ( stype == 'state' && typeof cb == 'function' ){
        statecb = cb;
        return true;
    }
    return false;
}

// Module: GetMsg, to set the handler entry when message is comming
// Input:
//  cb: the user routine entry when message is comming
// Output:
//  return is boolean ( true or false )
exports.GetMsg = function(cb){
    if ( typeof cb == 'function' ) {
        rcvemsgcb = cb;
        return true;
    }
    else return false;
}

// Module: GetState, to set the handler entry when motebus state changed
// Input:
//  cb: the user routine entry when motebus state changed
// Output:
//  return is boolean ( true or false )
exports.GetState = function(cb){
    if ( typeof cb == 'function' ) {
        statecb = cb;
        return true;
    }
    else return false;
}

// Module: PublishXrpc, to publish XRPC function at motechat
// Input:
//  app: the name of function
//  func: the user function entry which is published at motechat
//  cb, callback({ErrCode,ErrMsg}) 
exports.PublishXrpc = function(app, func, cb){
    ins.PublishXrpc( app, func, cb );
}

// Module: IsolatedXrpc, to isolated publish XRPC function at motechat
// Input:
//  app: the name of function
//  func: the user function entry which is isolated published at motechat
//  cb, callback({ErrCode,ErrMsg}) 
exports.IsolatedXrpc = function(func, cb){
    ins.IsolatedXrpc( func, cb );
}

// Module: StartSession, start session with device center
// Input:
//  data: the information for session, {EiToken,SToken}
//      EiToken: device token
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg,result})
exports.StartSession = function(data, cb){
    // data: {EiToken, SToken}
    if ( dcenter != '' ){
        var dcData = {"AppKey":appkey,"EiToken":data.EiToken,"SToken":data.SToken,"EiUMMA":mbusmma,"EiUPort":mbusport};
        ins.CallXrpc( dcenter, 'reg', dcData, function(reply){
            if ( dbg >= 1 ) console.log('motechat:StartSession reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == MC_OKCODE ){
                var einfo = NewEdgeInfo(reply.result.SToken, dcData.AppKey, dcData.EiToken, dcData.EiUMMA, dcData.EiUPort, reply.result.DDN);
                UpdateEdgeInfo(einfo);
            }
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:StartSession error: null dcenter');
    }
}

// Module: EndSession, end session with to device center
// Input:
//  data: the information for session
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg})
exports.EndSession = function(data, cb){
    if ( dcenter != '' ){
        var dcData = {"SToken":data.SToken};
        ins.CallXrpc( dcenter, 'unreg', dcData, function(reply){
            if ( dbg >= 1 ) console.log('motechat:UnStartSession reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == MC_OKCODE ){
                RemoveEdgeInfo(data.SToken);
            }
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
}

// Module: SendXmsg, send xmsg to other device
// Input:
//  stoken: app token
//  xmsg: xmsg control object
//      From: DDN of source device
//      Target: can be DDN, EiName, EiType or EiTag of destination device
//      Data: the data which want to be sent
//      WaitReply: The wait time of reply, by sec.
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)
exports.SendXmsg = function(xmsg, cb){
    var stoken, fm, target, data, waitreply;
    try {
        stoken = xmsg.SToken;
        fm = xmsg.From;
        target = xmsg.Target;
        data = xmsg.Data;
        waitreply = xmsg.WaitReply;
        if ( typeof target == 'string' && data != null){
            if ( dbg >= 2 ) console.log('Motechat:SendXmsg fm=%s,target=%s,data=%s', fm, target, JSON.stringify(data));    
            var ddn = fm;
            var dname = '';
            var info = GetEdgeInfo('ddn', ddn);
            if ( info != null ) dname = info.EiName;
            else {
                if ( ddn != '' ) {
                    dname = ddn;
                    ddn = '';
                }
            }
            if ( dcenter != '' ){
                var xdata;
                if ( ddn == '' && dname == '' )
                    xdata = {"stoken":stoken,"target":target,"in":{"fm":{},"msgtype":""},"data":data};
                else    
                    xdata = {"stoken":stoken,"target":target,"in":{"fm":{"DDN":ddn,"Name":dname},"msgtype":""},"data":data};
                ins.SendXmsg(dcenter, xdata, [], waitreply,
                    function(result){
                        if ( dbg >= 1 ) console.log('SendXmsg: result=%s', JSON.stringify(result));
                        if ( typeof result.ErrCode != "undefined" ){
                            if ( result.ErrCode != MC_OKCODE ) MoteErrHandler(result.ErrMsg, stoken);
                            if ( typeof cb == 'function' ) cb(result);
                        } 
                        else   
                            if ( typeof cb == 'function' ) cb(result.body);
                    }
                );
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":"data format error"});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":err.message});
    }
}

// Module: CallXrpc, call the function of other device by XRPC
// Input:
//  xrpc: xrpc control object
//      Stoken: app token
//      Target: the target name of function
//      Func: the function name
//      Data: the data object for function
//          target: the property of web device ( if need )
//          data: the data object want to delivered
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)
exports.CallXrpc = function(xrpc, cb){
    var stoken, app, func, data;
    try {
        stoken = xrpc.SToken;
        target = xrpc.Target;
        func = xrpc.Func;
        data = xrpc.Data;
        if ( dbg >= 1 ) {
            if ( typeof data == 'object')
                console.log('motechat:CallXrpc target=%s,func=%s,data=%s', target, func, JSON.stringify(data));
            else
                console.log('motechat:CallXrpc target=%s,func=%s,data=%s', target, func, data);
        }
        //if ( typeof cb == 'function' ) cb({"ErrCode":MC_OKCODE,"ErrMsg":MC_OKMSG});
        var dcData = {"stoken":stoken,"target":target,"func":func,"data":data};
        ins.CallXrpc( dcenter, 'call', dcData, function(reply){
            if ( dbg >= 1 ) console.log('motechat:CallXrpc reply=%s', JSON.stringify(reply));
            if ( typeof reply.ErrCode != "undefined" ){
                if ( reply.ErrCode != MC_OKCODE ) MoteErrHandler(reply.ErrMsg, stoken);
            } 
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":MC_ERRCODE,"ErrMsg":err.message});
    }
}

// Module: GetDeviceInfo, get my device information
// Input:
//  data: the input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)
exports.GetDeviceInfo = function(data, cb){
    // data {SToken}
    if ( dcenter != '' ){
        //console.log('motechat:GetDeviceInfo data=%s', JSON.stringify(data));
        ins.CallXrpc( dcenter, 'getinfo', data, function(reply){
            if ( dbg >= 2 ) console.log('motechat:GetDeviceInfo reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == MC_OKCODE ){
                var ginfo = reply.result;
                var uinfo = {"SToken":data.SToken,"EiOwner":ginfo.EiOwner,"EiName":ginfo.EiName,"EiType":ginfo.EiType,"EiTag":ginfo.EiTag};
                UpdateEdgeInfo(uinfo);
                if ( dbg >= 1 ) console.log('motechat:GetDeviceInfo edgetable=%s', JSON.stringify(edgetable));
            }
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:GetDeviceInfo error: null dcenter');
    }
}

// Module: SetDeviceInfo, get my device information
// Input:
//  data: input data object
//      SToken: app token
//      EdgeInfo: {"EiName":"","EiType":"","EiTag":"","EiLoc":""} 
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)
exports.SetDeviceInfo = function(data, cb){
    // data: {SToken, EdgeInfo}
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'setinfo', data, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SetDeviceInfo reply=%s', JSON.stringify(reply));
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
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'getapp', data, function(reply){
            if ( dbg >= 1 ) console.log('motechat:GetAppSetting reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:GetAppSetting error: null dcenter');
    }
}

// Module: GetAppSetting, get my application setting
// Input:
//  data: input data object
//      SToken: app token
//      Setting: user defined data object
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)
exports.SetAppSetting = function(data, cb){
    // data: {SToken, Setting}
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'setapp', data, function(reply){
            if ( dbg >= 1 ) console.log('motechat:SetAppSetting reply=%s', JSON.stringify(reply));
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
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'getqpin', data, function(reply){
            if ( dbg >= 1 ) console.log('motechat:GetQPin reply=%s', JSON.stringify(reply));
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
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'findqpin', data, function(reply){
            if ( dbg >= 1 ) console.log('motechat:FindQPin reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:FindQPin error: null dcenter');
    }
}

// Module: Search, search device by key
// Input:
//  data: input data object
//      SToken: app token
//      Keyword: Key for search
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)
exports.Search = function(data, cb){
    // data {SToken, Keyword}
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'search', data, function(reply){
            if ( dbg >= 1 ) console.log('motechat:Search reply=%s', JSON.stringify(reply));
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
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'nearby', data, function(reply){
            if ( dbg >= 1 ) console.log('motechat:Nearby reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:Nearby error: null dcenter');
    }
}

exports.SendLog = function(){
    // data {SToken, lgTime, lgType, lgDesc}
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'Sendlog', data, function(reply){
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
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'Sendlog', data, function(reply){
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
}

var CallDcenterReset = function(cb){
    if ( dcenter != '' ){
        ins.CallXrpc( dcenter, 'resetreg', '', function(reply){
            if ( dbg >= 1 ) console.log('motechat:CallDcenterReset reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    }
    else {
        console.log('motechat:CallDcenterReset error: null dcenter');
    }
}

var MoteChatGetHandler = function(ch, head, body, cb){
    if ( dbg >= 1 ) console.log('MoteChatGetHandler body=%s', JSON.stringify(body));
    if ( typeof body.target == 'undefined'){
        ret = {"App":appname,"ErrCode":MC_OKCODE,"ErrMsg":MC_OKMSG};
        if ( typeof rcvemsgcb == 'function' ) rcvemsgcb(head, body);
    }
    else {
        var from = (typeof body.in.fm != 'undefined' ) ? body.in.fm : {};
        var msgtype = (typeof body.in.msgtype != 'undefined' ) ? body.in.msgtype : '';
        var target = (typeof body.target != 'undefined' ) ? body.target : '';
        var data = (typeof body.data != 'undefined' ) ? body.data : '';
        var ret, toddn;
        if ( target != '' ){
            var ddnlist = [];
            ddnlist = FindEdgeInfo('', target);
            if ( ddnlist.length > 0 && typeof rcvemsgcb == 'function' ){
                if ( dbg >= 1 ) console.log('MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
                for ( var i = 0; i < ddnlist.length; i++ ){
                    toddn = ddnlist[i];
                    rcvemsgcb(ch, head, from, toddn, msgtype, data);
                    ret = {"App":appname,"DDN":toddn,"ErrCode":MC_OKCODE,"ErrMsg":MC_OKMSG};
                }
            }
            else ret = {"App":appname,"Target":target,"ErrCode":MC_ERRCODE,"ErrMsg":"target not found"};
        }
        else ret = {"App":appname,"ErrCode":MC_ERRCODE,"ErrMsg":"target is null"};
    }
    if ( typeof cb == 'function' ) cb(ret);
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

var NewEdgeInfo = function(stoken, appkey, eitoken, eiumma, eiuport, ddn){
    var info = {"SToken":stoken,"AppKey":appkey,"EiToken":eitoken,"EiUMMA":eiumma,"EiUPort":eiuport,
    "DDN":ddn,"EiOwner":"","EiName":"","EiType":"","EiTag":"","TimeStamp":new Date()};
    return info;
}

var UpdateEdgeInfo = function(info){
    try {
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
    for ( var i = 0; i < edgetable.length; i++ ){
        stoken = edgetable[i].SToken;
        if ( skey == stoken ){
            edgetable.splice(i,1);
            return true;
        }
    }
    return false;
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
    if ( atype != '' ) atype = atype.toLowerCase();
    //console.log('FindEdgeInfo stype=%s,skey=%s', stype, skey);
    if ( dbg >= 2 ) console.log('FindEdgeInfo edgetable=%s', JSON.stringify(edgetable));
    for ( var i = 0; i < edgetable.length; i++ ){
        if ( atype == 'stoken' ){
            stoken = edgetable[i].SToken;
            if ( skey == stoken ){
                darr.push(edgetable[i].DDN);
                break;
            }
        }
        else if ( atype == 'owner' ){
            owner = edgetable[i].EiOwner;
            if ( typeof owner == 'string'){
                if ( skey == owner )
                    darr.push(edgetable[i].DDN);
            }
        }
        else {
            ddn = edgetable[i].DDN;
            if ( typeof ddn == 'string'){
                if ( skey == ddn )
                    darr.push(ddn);
            }
            owner = edgetable[i].EiOwner;
            if ( typeof owner == 'string'){
                if ( skey == owner )
                    darr.push(ddn);
            }
            ename = edgetable[i].EiName;
            //console.log('FindEdgeInfo EiName=%s', ename);
            if ( typeof ename == 'string'){
                if ( skey == ename ) {
                    darr.push(ddn);
                }
            }
            etype = edgetable[i].EiType;
            if ( typeof etype == 'string'){
                if ( skey == etype )
                    darr.push(ddn);
            }
            etag = edgetable[i].EiTag;
            if ( typeof etag == 'string'){
                if ( etag.indexOf(skey) >= 0 )
                    darr.push(ddn);
            }
        }
    }
    if ( dbg >= 2 ) console.log('FindEdgeInfo return=%s',JSON.stringify(darr));
    return darr;
}


var MoteErrHandler = function(err, SToken, cb){
    if ( err == 'no session' ){
        ReStartSession(SToken, cb);
    }
    else if ( err == 'dc restarted' ){
        AllReStartSession(cb);
    } 
}

var AllReStartSession = function(cb){
    var data, tm;
    for ( var i = 0; i < edgetable.length; i++ ){
        data = edgetable[i];
        var dcData = {"AppKey":data.AppKey,"EiToken":data.EiToken,"SToken":data.SToken,"EiUMMA":data.EiUMMA,"EiUPort":data.EiUPort};
        tm = Math.floor((Math.random() * 10) + 1) * 100;
        setTimeout(function(info){
            ins.CallXrpc( dcenter, 'reg', info, function(reply){
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
            var dcData = {"AppKey":data.AppKey,"EiToken":data.EiToken,"SToken":data.SToken,"EiUMMA":data.EiUMMA,"EiUPort":data.EiUPort};
            ins.CallXrpc( dcenter, 'reg', dcData, function(reply){
                if ( dbg >= 1 ) console.log('motechat:ReStartSession reply=%s', JSON.stringify(reply));
                if ( typeof cb == 'function' ) cb(reply);
            });
        }
    }
    else {
        console.log('motechat:ReStartSession error: null dcenter');
    }
}


