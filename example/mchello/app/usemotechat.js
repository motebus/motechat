var exports = module.exports = {};
var appname;
var mchat;
var mcinfo;
var mydev;
var mysession;
var mymote;
var myddn = '';
var mcstate = '';
var ws;
var MC_OKCODE = 0;
var MC_ERRCODE = -254;
var MC_OKMSG = 'OK';
var myDeviceFile = 'dSIM.json';
var myMoteFile = 'mote.json';
var CallInterval = 3000;

exports.Start = function(web, conf, cb){
    var devSIM;
    appname = conf.AppName;
    mcinfo = require('./conf.js');
    devSIM= mcinfo.ReadConfInfo(myDeviceFile);
    mydev = {"SToken":devSIM.SToken,"EiToken":devSIM.EiToken,"WIP":"","LIP":""};
    mymote= mcinfo.ReadConfInfo(myMoteFile);
    mchat = require('motechat');
    mchat.Open(conf, function(result){
        if ( result.ErrCode == 0 ){
            mydev.WIP = result.Mote.WANIP;
            mydev.LIP = result.Mote.EiHost;
            mcstate = 'opened';
            RegToDc(cb);
        }
    });
}

// Handler for MoteChat API

exports.RegToDc = function(cb){
    RegToDc(cb);
}

exports.UnregDc = function(){
    UnregDc(cb);
    return true;
}

exports.Call = function(target, func, data, cb){
    Call(target, func, data, cb );
}

exports.Send = function(target, data, wait, cb){
    Send(target, data, wait, cb );
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

var RegToDc = function(cb){
    mchat.Reg(mydev, function(result){
        //console.log('%s RegToDc result=%s', CurrentTime(), JSON.stringify(result));
        ProcRegInfo(result, cb);
    });
}

var UnregDc = function(){
    mchat.UnReg(mydev.SToken, function(result){
        //console.log('UnregDc result=%s', JSON.stringify(result));
    });    
}

var Call = function(target, func, data, cb){
    var xrpc = {"SToken":mydev.SToken,"Target":target,"Func":func,"Data":data};
    mchat.Call( xrpc, function(reply){
        //console.log('%s CallSession reply=%s', CurrentTime(), JSON.stringify(reply));
        if ( typeof cb == 'function' ) cb(reply);
    });
}

var Send = function(target, data, wait, cb){
    var xmsg = {"SToken":mydev.SToken,"From":myddn,"Target":target,"Data":data,"WaitReply":wait};
    mchat.Send( xmsg, function(reply){
        //console.log('%s CallSession reply=%s', CurrentTime(), JSON.stringify(reply));
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
            mysession = JSON.parse(JSON.stringify(ssret));
            if ( mydev.SToken != ssret.SToken || mydev.EiToken != ssret.EiToken) {
                mydev.SToken = ssret.SToken;
                mydev.EiToken = ssret.EiToken;
                mcinfo.SaveConfInfo(mydev, myDeviceFile);
                myddn = ssret.DDN;
            }
            if ( ssret.EiName != mymote.EiName || ssret.EiType != mymote.EiType || ssret.EiTag != mymote.EiTag){
                var mote = {"DDN:":ssret.DDN,"EiOwner":mymote.EiOwner,"EiName":mymote.EiName,"EiType":mymote.EiType,"EiTag":mymote.EiTag,"EiLoc":mymote.EiLoc};
                //console.log('%s SetDeviceInfo: mote=%s', CurrentTime(), JSON.stringify(mote));
                SetDeviceInfo( mote, function(result){
                    console.log('%s SetDevice result=%s', CurrentTime(), JSON.stringify(result));
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


