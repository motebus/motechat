var exports = module.exports = {};
var mc;

exports.Start = function(web, conf){
    mc = require('./usemotechat.js');
    mc.Start(web, conf, function(result){
        //console.log('appmain:Start result=%s', JSON.stringify(result));
        if ( result.ErrCode == 0 ){
            mc.Isolated( XrpcMcSecService, function(result){
                console.log('motechat isolated: result=%s', JSON.stringify(result));
                UserProcess();
            });
        }
    });
}

// user process and service

var UserProcess = function(){
    CallEcho('eiEcho');
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
    mc.Call(target, func, data, function(result){
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


