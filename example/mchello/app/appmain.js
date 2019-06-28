var exports = module.exports = {};
var mc;
const AM_OKCODE = 0;
const AM_ERRCODE = -254;
const AM_OKMSG = 'OK';
const delayToExit = 60;
const dest = 'eiEchoDemo';

exports.Start = function(web, conf){
    mc = require('./usemotechat.js');
    mc.Start(web, conf, function(result){
        console.log('appmain:Start result=%s', JSON.stringify(result));
        if ( result.ErrCode == 0 ){
            mc.Isolated( XrpcMcSecService, function(result){
                console.log('motechat isolated: result=%s', JSON.stringify(result));
                if ( result.ErrCode == 0 ){
                    mc.OnMessage( InmsgRcve );
                    userProcess();
                }
            });
        }
    });
}

var userProcess = function(){
    var th1 = new demoProc('', 'svc://eiEchoDemo');
    //th1.callEcho();
    //th1.callAsynEcho();
    th1.sendEcho();
    //var th2 = new demoProc('', eiEchoDemo');
    //th2.callEcho();
    ExitProcess();
}

class demoProc {
    constructor(ddn, topic){
        this.ddn = ddn;             // ddn of device
        this.topic = topic;         // topic of device
        this.t1 = 8;                // send/call timeout
        this.t2 = 16;               // reply timeout
        this.mcount = 0;
    }
    callEcho(){
        var func = 'echo';
        var ntime = CurrentTime(); 
        console.log('%s callEcho topic=%s', CurrentTime(), this.topic);
        this.mcount += 1;
        var data = {"ID":this.mcount.toString(),"CallTo":this.topic,"Time":ntime};
        console.log('call:');
        console.log('-> %s callEcho: %s', ntime, JSON.stringify(data));
        mc.Call(this.ddn, this.topic, func, data, this.t1, this.t2, function(result){
            console.log('reply:');
            console.log('<- %s callEcho: %s', CurrentTime(), JSON.stringify(result));
        });
    }
    callAsynEcho(){
        var func = 'asynecho';
        var ntime = CurrentTime(); 
        console.log('%s callAsynEcho topic=%s', CurrentTime(), this.topic);
        this.mcount += 1;
        var data = {"ID":this.mcount.toString(),"CallTo":this.topic,"Time":ntime};
        console.log('call:');
        console.log('-> %s callAsynEcho: %s', ntime, JSON.stringify(data));
        mc.Call(this.ddn, this.topic, func, data, this.t1, this.t2, function(result){
            console.log('reply:');
            console.log('<- %s callAsynEcho: %s', CurrentTime(), JSON.stringify(result));
        });
    }
    sendEcho(){
        var ntime = CurrentTime(); 
        console.log('%s sendEcho topic=%s', CurrentTime(), this.topic);
        this.mcount += 1;
        var data = {"ID":this.mcount.toString(),"CallTo":this.topic,"Time":ntime};
        console.log('send:');
        console.log('-> %s sendEcho: %s', ntime, JSON.stringify(data));
        mc.Send(this.ddn, this.topic, data, this.t1, this.t2, function(result){
            console.log('reply:');
            console.log('<- %s sendEcho: reply %s', CurrentTime(), JSON.stringify(result));
        });
    }
} 

// Process of Echo reply

var InmsgRcve = function(ch, inctl, data, cb){
    console.log('<< %s InmsgRcve: channel=%s, inctl=%s, data=%s', CurrentTime(), ch, JSON.stringify(inctl), JSON.stringify(data));
    //var ret = {"ErrCode":0,"ErrMsg":"OK"};
    //if (typeof cb == 'function') cb(ret);   // send back OK
}

var XrpcMcSecService = {
    "echo": function(head, body){
        console.log("%s xrpc echo: body=%s", CurrentTime(), JSON.stringify(body));
        if ( typeof body.data != 'undefined' )
            return body.data;
        else
            return body;
    },
    "asynecho": function(head, body){
        console.log("%s xrpc asynecho: body=%s", CurrentTime(), JSON.stringify(body));
        return new Promise(function(resolve, reject) {
            // do a thing, possibly async, then…
            AsynEchoEmulate(body, function(result){
                console.log('%s xrpc AsynEchoEmulate: result=%s', CurrentTime(), JSON.stringify(result));
                resolve(result);
            });
        })
    }
}

var AsynEchoEmulate = function(body, cb){
    var data;
    if ( typeof body.data != 'undefined' )
        data = body.data;
    else
        data = body;
    setTimeout(function(sdata, callback){
        //console.log('AsynEchoEmulate timeout');
        if ( typeof callback == 'function') callback(sdata);
    }, 200, data, cb);      
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}

var ExitProcess = function(){
    setTimeout(function(){
        console.log('++ %s Exit', CurrentTime());
        process.exit(0);
    }, delayToExit*1000);
}



