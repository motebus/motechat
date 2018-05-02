var exports = module.exports = {};
var appname;
var mchat;
var mcinfo;
var mydev;
var mysession;
var mymote;
var myddn = '';
var ws;
var AM_OKCODE = 0;
var AM_ERRCODE = -254;
var AM_OKMSG = 'OK';
var myDeviceFile = 'device.json';
var myMoteFile = 'mote.json';
var CallInterval = 3000;

exports.Start = function(web, conf){
    appname = conf.AppName;
    mcinfo = require('./conf.js');
    mydev= mcinfo.ReadConfInfo(myDeviceFile);
    mymote= mcinfo.ReadConfInfo(myMoteFile);
    mchat = require('../../../lib/motechat');
    mchat.Open(conf, function(result){
        if ( result.ErrCode == 0 ){
            mchat.Isolated( XrpcMcSecService, function(result){
                console.log('motechat isolated: result=%s', JSON.stringify(result));
                console.log('%s Start session conf=%s', CurrentTime(), JSON.stringify(mydev));
                RegToDc(ProcSessionInfo);
            });
        }
    });
}

// Handler for MoteChat API

var RegToDc = function(cb){
    mchat.Reg(mydev, function(result){
        console.log('%s RegToDc result=%s', CurrentTime(), JSON.stringify(result));
        if ( typeof cb == 'function' ) cb(result);
    });
}

var UnregDc = function(){
    mchat.UnReg(mydev.SToken, function(result){
        console.log('UnregDc result=%s', JSON.stringify(result));
    });    
}

var CallSession = function(target, func, data, cb){
    var xrpc = {"SToken":mydev.SToken,"Target":target,"Func":func,"Data":data};
    mchat.Call( xrpc, function(reply){
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


// Process of Hello

var ProcSessionInfo = function(ssreply){
    var ssret;
    console.log('%s ProcSessionInfo: info=%s', CurrentTime(), JSON.stringify(ssreply));
    try {
        if ( ssreply.ErrCode == 0 ){
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
                console.log('%s SetDeviceInfo: mote=%s', CurrentTime(), JSON.stringify(mote));
                SetDeviceInfo( mote, function(result){
                    console.log('%s SetDeviceInfo: result=%s', CurrentTime(), JSON.stringify(result));
                    setTimeout( function(){
                        CallEcho(mymote.EiName);
                    } , 2000);
                });
            }
            else 
                setTimeout( function(){
                    CallEcho(mymote.EiName);
                } , 2000);
        }
    }
    catch(err){
        console.log('%s ProcSessionInfo error=%s', CurrentTime(), err.message);
    }
}

var CallEchoInterval = function(target, interval){
    setInterval(function(target){
        CallEcho(target);
    }, interval, target);
}

var mcount = 0;

var CallEcho = function(target){
    //var target = appname;
    var func = 'echo';
    var ntime = CurrentTime(); 
    console.log('%s CallEcho target=%s', CurrentTime(), target);
    mcount += 1;
    var data = {"ID":mcount.toString(),"CallTo":target,"Time":ntime};
    console.log('-> %s CallEcho: %s', ntime, JSON.stringify(data));
    CallSession(target, func, data, function(result){
        console.log('<- %s CallEcho: %s', CurrentTime(), JSON.stringify(result));
    });
}

var XrpcMcSecService = {
    "echo": function(head, body){
        //console.log("xrpc echo: head=%s", JSON.stringify(head));
        if ( typeof body == 'object')
            sbody = JSON.stringify(body);
        else
            sbody = body;
        //console.log("xrpc echo: body=%s", sbody);
        return {"echo":body.data};
    }
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}


