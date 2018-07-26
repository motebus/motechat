var exports = module.exports = {};
var mc;
//var method = 'call';
var method = 'send';
var DefaultTarget = 'eiBenEcho2'

exports.Start = function(web, conf){
    mc = require('./usemotechat.js');
    mc.Start(web, conf, function(result){
        //console.log('appmain:Start result=%s', JSON.stringify(result));
        if ( result.ErrCode == 0 ){
            mc.Isolated( XrpcMcSecService, function(result){
                console.log('motechat isolated: result=%s', JSON.stringify(result));
                if ( result.ErrCode == 0 ){
                    mc.OnMessage( InmsgRcve );
                    UserProcess();
                }
            });
        }
    });
}

// user process and service

var UserProcess = function(){
    if ( method == 'call' ){
        CallEcho(DefaultTarget);
        //CallEchoInterval(DefaultTarget, 3000 );
    }
    else {
        SendEcho(DefaultTarget);
        //SendEchoInterval(DefaultTarget, 3000 );
    }
}

var CallEchoInterval = function(target, interval){
    setInterval(function(target){
        CallEcho(target);
    }, interval, target);
}

var SendEchoInterval = function(target, interval){
    setInterval(function(target){
        SendEcho(target);
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
    mc.Call(target, func, data, function(result){
        console.log('<- %s CallEcho: %s', CurrentTime(), JSON.stringify(result));
    });
}

var SendEcho = function(target){
    var ntime = CurrentTime(); 
    console.log('%s SendEcho target=%s', CurrentTime(), target);
    mcount += 1;
    var data = {"ID":mcount.toString(),"SendTo":target,"Time":ntime};
    console.log('-> %s SendEcho: %s', ntime, JSON.stringify(data));
    mc.Send(target, data, 12, function(result){
        console.log('<- %s SendEcho: %s', CurrentTime(), JSON.stringify(result));
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

var InmsgRcve = function(ch, head, from, to, msgtype, data, cb){
    console.log('InmsgRcve: channel=%s, from=%s, to=%s, msgtype=%s, data=%s', ch, JSON.stringify(from), to, msgtype, JSON.stringify(data));
    ret = {"ErrCode":0,"ErrMsg":"OK","data":data};
    if (typeof cb == 'function') cb(ret);
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}


