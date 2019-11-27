// uc: module for uc call from motechat
// Date: 2019/11/27
// Version: 1.0.0

var exports = module.exports = {};
var ucenter = '';
var ins;

exports.Start = function(inet, ucmma){
    ins = inet;
    ucenter = ucmma;
}

// Module: UcCall, call UC function
// Input:
//  ucmsg: input data object of uc
//      SToken: app token
//      Func: function of uc
//      Data: parameter array of func
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)
exports.UcCall = function( ucmsg, cb ){
    //console.log('uc:UcCall ucmsg=%s', JSON.stringify(ucmsg));
    UcCall( ucmsg, cb );
}

var UcCall = function( msg, cb ){
    //console.log('ucCall SToken=%s, Func=%s, Data=%s', msg.SToken, msg.Func, JSON.stringify(msg.Data));
    var eimma = (typeof msg.EiMMA == 'string' ) ? msg.EiMMA : ''
    var stoken = (typeof msg.SToken == 'string') ? msg.SToken : '';
    var func = (typeof msg.Func == 'string') ? msg.Func : '';
    var data = (typeof msg.Data == 'object' ) ? msg.Data : [];
    console.log('uc:UcCall stoken=%s,func=%s', stoken, func);
    if ( eimma && stoken && func && ucenter ){
        var args = [];
        args.push(eimma);
        args.push(stoken);
        for ( var i = 0; i < data.length; i++ ){
            args.push(data[i]);
        }
        //console.log('uc:UcCall func=%s,args=%s', func, JSON.stringify(args));
        ins.CallXrpc( ucenter, func, args, null, null, function(result){
            /*
            if ( typeof result == 'object' )
                console.log('uc:UcCall result=%s', JSON.stringify(result));
            else 
                console.log('uc:UcCall result=%s', result);
            */
            if ( typeof cb == 'function' ) cb(result);
        });
    }
    else {
        console.log('uc:UcCall Invalid input data');
        if ( typeof cb == 'function' ) cb('Invalid input data');
    }
}
