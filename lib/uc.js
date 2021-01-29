// uc: module for uc call from motechat
// Date: 2020/04/30
// Version: 1.0.2

var exports = module.exports = {};

// Module: UcCall, call UC function
// Input:
//  mc: motechat object
//  ucmsg: input data object of uc
//      SToken: app token
//      Func: function of uc
//      Data: parameter array of func
// Return: {ErrCode,ErrMsg,resut}
exports.UcCall = async function(mc, ucmsg){
    //console.log('uc:UcCall ucmsg=%s', JSON.stringify(ucmsg));
    let result = await UcCall(mc, ucmsg)
    return result
}

var UcCall = async function(mc, msg){
    //console.log('ucCall msg=%s', JSON.stringify(msg));
    let ucenter = mc.uc
    let ins = mc.mbstack
    let eimma = msg.EiMMA ? msg.EiMMA : ''
    let stoken = msg.SToken ? msg.SToken : ''
    let func = msg.Func ? msg.Func : '';
    let data = msg.Data ? msg.Data : [];
    //console.log('uc:UcCall stoken=%s,func=%s', stoken, func);
    if ( eimma && stoken && func && ucenter ){
        let args = [];
        args.push(eimma);
        args.push(stoken);
        for ( var i = 0; i < data.length; i++ ){
            args.push(data[i]);
        }
        //console.log('uc:UcCall func=%s,args=%s', func, JSON.stringify(args));
        let result = await ins.CallXrpc(ucenter, func, args, null, null)
        //console.log('uc:UcCall func=%s,result=%s', func, JSON.stringify(result));
        return result
    }
    else {
        //console.log('uc:UcCall Invalid input data');
        return {"ErrCode":-10299,"ErrMsg":"Invalid input data"}
    }
}
