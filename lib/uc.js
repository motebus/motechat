// uc: module for uc call from motechat
// Date: 2018/07/31
// Version: 0.99

var exports = module.exports = {};
var ucenter = '';
var ins;
var EiMMA = '';

exports.Start = function(inet, ucmma, eimma){
    ins = inet;
    ucenter = ucmma;
    EiMMA = eimma;
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
    console.log('uc ucenter=%s', ucenter);
    UcCall( ucmsg, cb );
}

var UcCall = function( msg, cb ){
    //console.log('uc:UcCall msg=%s', JSON.stringify(msg));
    //console.log('ucCall SToken=%s, Func=%s, Data=%s', msg.SToken, msg.Func, JSON.stringify(msg.Data));
    var stoken = (typeof msg.SToken == 'string') ? msg.SToken : '';
    var func = (typeof msg.Func == 'string') ? msg.Func : '';
    var data = (typeof msg.Data == 'object' ) ? msg.Data : [];
    console.log('uc:UcCall stoken=%s,func=%s,data=%s', stoken, func, JSON.stringify(data));
    if ( stoken != '' && func != '' && ucenter != '' ){
        var args = [];
        args.push(EiMMA);
        args.push(stoken);
        for ( var i = 0; i < data.length; i++ ){
            args.push(data[i]);
        }
        console.log('uc:UcCall ucenter=%s', ucenter);
        console.log('uc:UcCall func=%s,args=%s', func, JSON.stringify(args));
        ins.CallXrpc( ucenter, func, args, null, null, function(result){
            if ( typeof result == 'object' )
                console.log('uc:UcCall result=%s', JSON.stringify(result));
            else 
                console.log('uc:UcCall result=%s', result);
            //console.log('uc:UcCall typeof cb=%s', typeof cb);
            if ( typeof cb == 'function' ) cb(result);
        });
    }
}
