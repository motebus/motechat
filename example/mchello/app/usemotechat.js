var exports = module.exports = {};
var appname;
var mchat;
var mcinfo;
var mydev;
var mymote;
var myddn = '';
var mcstate = '';
const MC_OKCODE = 0;
const MC_ERRCODE = -254;
const MC_OKMSG = 'OK';
const myDeviceFile = 'dSIM.json';
const myMoteFile = 'mote.json';
const dbg = 0;

exports.Start = function(web, conf, cb){
    var devSIM;
    appname = conf.AppName;
    mcinfo = require('./conf.js');
    devSIM= mcinfo.ReadConfInfo(myDeviceFile);
    mydev = {"SToken":devSIM.SToken,"EiToken":devSIM.EiToken,"WIP":"","LIP":""};
    mymote= mcinfo.ReadConfInfo(myMoteFile);
    mchat = require('motechat');
    if ( dbg >= 1 ) console.log('motechat:Start open conf=%s,dev=%s', JSON.stringify(conf), JSON.stringify(mydev));
    mchat.Open(conf, mydev, function(result){
        if ( dbg >= 1 ) console.log('motechat:Start open result=%s', JSON.stringify(result));
        if ( result.ErrCode == 0 ) ProcRegInfo(result, function(reply){
            if ( dbg >= 1 ) console.log('motechat:ProcRegInfo open reply=%s', JSON.stringify(reply));
            if ( typeof cb == 'function' ) cb(reply);
        });
    });
}

// Handler for MoteChat API

exports.OnMessage = function( handler ){
    if ( typeof handler == 'function' )  
        mchat.OnEvent('message', handler, '');
}

exports.OnState = function( handler ){
    if ( handler == 'function' )
        mchat.OnEvent('state', handler);
}

exports.Call = function(ddn, topic, func, data, timeout, wait, cb){
    Call(ddn, topic, func, data, timeout, wait, cb );
}

exports.Send = function(ddn, topic, data, timeout, wait, cb){
    Send(ddn, topic, data, timeout, wait, cb );
}

exports.SetDeviceInfo = function(info, cb){
    SetDeviceInfo(info, cb);
}

exports.GetDeviceInfo = function(cb){
    GetDeviceInfo(cb);
}

exports.Nearby = function(cb){
    Nearby(cb);
}

exports.SearchDevice = function(key, cb){
    SearchDevice(key, cb);
}

exports.Publish = function(app, func, cb){
    mchat.Publish(app, func, cb);
}

exports.Isolated = function(func, cb){
    mchat.Isolated(func, cb);
}

var Call = function(topic, to, func, data, timeout, waitreply, cb){
    var xrpc = {"SToken":mydev.SToken,"Topic":topic,"To":to,"Func":func,"Data":data,"SendTimeout":timeout,"WaitReply":waitreply};
    mchat.Call( xrpc, function(reply){
        console.log('%s CallSession reply=%s', CurrentTime(), JSON.stringify(reply));
        if ( typeof cb == 'function' ) cb(reply);
    });
}

var Send = function(topic, to, data, timeout, waitreply, cb){
    var xmsg = {"SToken":mydev.SToken,"Topic":topic,"To":to,"Data":data,"SendTimeout":timeout,"WaitReply":waitreply};
    mchat.Send( xmsg, function(reply){
        console.log('%s CallSession reply=%s', CurrentTime(), JSON.stringify(reply));
        if ( typeof cb == 'function' ) cb(reply);
    });
}

var SetDeviceInfo = function(info, cb){
    var data = {"SToken":mydev.SToken,"EdgeInfo":info};
    mchat.Set(data, function(result){
        if ( typeof cb == 'function' ) cb(result);
    });
}

var GetDeviceInfo = function(cb){
    var data = {"SToken":mydev.SToken};
    mchat.Get(data, function(result){
        if ( typeof cb == 'function' ) cb(result);
    });
}

var Nearby = function(cb){
    var data = {"SToken":mydev.SToken};
    mchat.Nearby(data, function(result){
        if ( typeof cb == 'function' ) cb(result);
    });    
}

var SearchDevice = function(key, cb){
    var data = {"SToken":mydev.SToken,"Keyword":key};
    mchat.Search(data, function(result){
        if ( typeof cb == 'function' ) cb(result);
    }); 
}


// Process of Reg

var ProcRegInfo = function(ssreply, cb){
    var ssret;
    //console.log('%s ProcSessionInfo: info=%s', CurrentTime(), JSON.stringify(ssreply));
    try {
        if ( ssreply.ErrCode == 0 ){
            mcstate = 'reg';
            ssret = ssreply.result;
            //console.log('%s ProcSessionInfo: reply=%s', CurrentTime(), JSON.stringify(ssret));
            if ( mydev.SToken != ssret.SToken || mydev.EiToken != ssret.EiToken) {
                mydev.SToken = ssret.SToken;
                mydev.EiToken = ssret.EiToken;
                mcinfo.SaveConfInfo(mydev, myDeviceFile);
                myddn = ssret.DDN;
            }
            //console.log('%s ProcSessionInfo: mymote=%s', CurrentTime(), JSON.stringify(mymote));
            if ( ssret.EiName != mymote.EiName || ssret.EiType != mymote.EiType || ssret.EiTag != mymote.EiTag){
                var mote = {"DDN:":ssret.DDN,"EiOwner":mymote.EiOwner,"EiName":mymote.EiName,"EiType":mymote.EiType,"EiTag":mymote.EiTag,"EiLoc":mymote.EiLoc};
                //console.log('%s SetDeviceInfo: mote=%s', CurrentTime(), JSON.stringify(mote));
                SetDeviceInfo( mote, function(result){
                    if ( dbg >= 1 ) console.log('%s SetDevice result=%s', CurrentTime(), JSON.stringify(result));
                    if ( typeof cb == 'function' ) cb(ssreply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb(ssreply);
            }
        }
        else {
            if ( typeof cb == 'function' ) cb(ssreply);
        }
    }
    catch(err){
        console.log('%s ProcRegInfo error=%s', CurrentTime(), err.message);
        if ( typeof cb == 'function' ) cb ({"ErrCode":MC_ERRCODE,"ErrMsg":err.message});

    }
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}


