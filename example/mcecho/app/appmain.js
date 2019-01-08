var exports = module.exports = {};
var mc;
const AM_OKCODE = 0;
const AM_ERRCODE = -254;
const AM_OKMSG = 'OK';

exports.Start = function(web, conf){
    mc = require('./usemotechat.js');
    mc.Start(web, conf, function(result){
        console.log('appmain:Start result=%s', JSON.stringify(result));
        if ( result.ErrCode == 0 ){
            mc.Isolated( XrpcMcSecService, function(result){
                console.log('motechat isolated: result=%s', JSON.stringify(result));
                if ( result.ErrCode == 0 ){
                    mc.OnMessage( InmsgRcve );
                }
            });
        }
    });
}

// Process of Echo
// user send by xmsg
var InmsgRcve = function(ch, inctl, data, cb){
    console.log('%s InmsgRcve: channel=%s, inctl=%s, data=%s', CurrentTime(), ch, JSON.stringify(inctl), JSON.stringify(data));
    var from = inctl.From.DDN;
    if ( typeof data.ErrCode == 'undefined' ){    // check if not reply 
        var ret = {"ErrCode":0,"ErrMsg":"OK"};
        if (typeof cb == 'function') {
            console.log('InmsgRcve reply: %s', JSON.stringify(ret));
            cb(ret);   // received, reply OK
        }
        ProcSendEcho(from, data);               // send data back after 200 ms, simulate asyn operation
    }
}

var ProcSendEcho = function(stopic, sdata){
    setTimeout(function(topic, data){
        var ddn = '';
        console.log('ProcSendEcho topic=%s, data=%s', topic, JSON.stringify(data));
        mc.Send(ddn, topic, data, null, null);
    }, 200, stopic, sdata);
}

// user call by xrpc
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
            // echo emulate, callback after 200 ms
            AsynEmulate(body, function(result){
                console.log('%s xrpc AsynEchoEmulate: result=%s', CurrentTime(), JSON.stringify(result));
                resolve(result);
            });
        })
    }
}

var AsynEmulate = function(body, cb){
    var data;
    if ( typeof body.data != 'undefined' )
        data = body.data;
    else
        data = body;
    setTimeout(function(sdata, callback){
        console.log('AsynEchoEmulate timeout');
        if ( typeof callback == 'function') callback(sdata);
    }, 200, data, cb);      
}

var CurrentTime = function(){
    var ret;
    var ct = new Date();
    ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
    return ret;
}


