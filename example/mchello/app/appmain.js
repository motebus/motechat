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
    mchat = require('motechat');
    mchat.Init(conf, function(result){
        if ( result.ErrCode == 0 ){
            //mchat.PublishXrpc( conf.appname, XrpcMcService, function(result){
                //console.log('motechat publish: result=%s', JSON.stringify(result));
                mchat.IsolatedXrpc( XrpcMcSecService, function(result){
                    console.log('motechat isolated: result=%s', JSON.stringify(result));
                    console.log('start session conf=%s', JSON.stringify(mydev));
                    StartSession(ProcSessionInfo);
                });
            //});
        }
    });
}

// Handler for MoteChat API

var StartSession = function(cb){
    mchat.StartSession(mydev, function(result){
        console.log('StartSession result=%s', JSON.stringify(result));
        if ( typeof cb == 'function' ) cb(result);
    });
}

var EndSession = function(){
    mchat.StartSession(mydev.SToken, function(result){
        console.log('EndSession result=%s', JSON.stringify(result));
    });    
}

var CallSession = function(target, func, data, cb){
    var xrpc = {"SToken":mydev.SToken,"Target":target,"Func":func,"Data":data};
    mchat.CallXrpc( xrpc, function(reply){
        console.log('CallSession reply=%s', JSON.stringify(reply));
        if ( typeof cb == 'function' ) cb(reply);
    });
}

var SetDeviceInfo = function(info, cb){
    var data = {"SToken":mydev.SToken,"EdgeInfo":info};
    mchat.SetDeviceInfo(data, function(result){
        if ( typeof cb == 'function' ) cb(result);
    });
}

var GetDeviceInfo = function(cb){
    var data = {"SToken":mydev.SToken};
    mchat.GetDeviceInfo(data, function(result){
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
    console.log('ProcSessionInfo: info=%s', JSON.stringify(ssreply));
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
                var data = {"SToken":ssret.SToken,"EdgeInfo":mote};
                SetDeviceInfo( data, function(result){
                    setTimeout( function(){
                        SearchMate( ProcMate );
                    } , 5000);
                });
            }
            else 
                setTimeout( function(){
                    SearchMate( ProcMate );
                } , 5000);
        }
    }
    catch(err){
        console.log('ProcSessionInfo error=%s', err.message);
    }
}

var SearchMate = function(cb){
    var key = appname;
    console.log('SearchMate keyword=%s', key);
    SearchDevice( key, function(reply){
        console.log('SearchMate reply=%s', JSON.stringify(reply));
        if ( typeof cb == 'function' ) cb(reply);
    });
}

var matelist = [];

var ProcMate = function(data){
    if ( data.ErrCode == 0 ){
        console.log('ProcMate data=%s', JSON.stringify(data.result));
        for ( var i = 0; i < data.result.length; i++ ){
            var mate = {"EiName":data.result[i].EiName,"DDN":data.result[i].DDN};
            matelist.push(mate);
        }
    }
    //if ( matelist.length > 0 ) CallMateInterval(CallInterval);
    if ( matelist.length > 0 ) CallMate();
}

var CallMateInterval = function(interval){
    setInterval(function(){
        CallMate();
    }, interval);
}

var mcount = 0;

var CallMate = function(){
    //var target = appname;
    var ntime;
    var func = 'echo';
    mcount += 1;
    console.log('CallMate matelist=%s', JSON.stringify(matelist));
    for ( var i = 0; i < matelist.length; i++ ){
        var target = matelist[i].DDN;
        ntime = CurrentTime();
        var data = {"ID":mcount.toString(),"CallTo":matelist[i].EiName,"Time":ntime};
        console.log('-> %s CallMate: %s', ntime, JSON.stringify(data));
        CallSession(target, func, data, function(result){
            var rtime = CurrentTime();
            console.log('<- %s CallMate: %s', rtime, JSON.stringify(result));
        });
    }
}

/*
var XrpcMcService = {
    "echo": function(head, body){
        //console.log("xrpc echo: head=%s", JSON.stringify(head));
        if ( typeof body == 'object')
            sbody = JSON.stringify(body);
        else
            sbody = body;
        //console.log("xrpc echo: body=%s", sbody);
        return {"DDN":body.target,"echo":body.data};
    },
    "msg": function(head, body){
        console.log("xrpc msg: head=%s", JSON.stringify(head));
        console.log("xrpc msg: body=%s", JSON.stringify(body));
        return new Promise(function(resolve, reject) {
            // do a thing, possibly async, then…
            mchat.MoteChatGetHandler('xrpc', head, body, function(result){
                resolve(result);
            });
        }).then(
            function(result){
                //console.log('xrpc resolve=%s', JSON.stringify(result));
                return result;
            }
        )
        //return {"ErrCode":AM_OKCODE,"ErrMsg":AM_OKMSG};
    }
}
*/

var XrpcMcSecService = {
    "echo": function(head, body){
        //console.log("xrpc echo: head=%s", JSON.stringify(head));
        if ( typeof body == 'object')
            sbody = JSON.stringify(body);
        else
            sbody = body;
        //console.log("xrpc echo: body=%s", sbody);
        return {"echo":body};
    }
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}


