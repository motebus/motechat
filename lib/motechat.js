// motechat: module for motechat
// Date: 2019/12/09
// Version: 1.8.0
// Update: add XSHARE function
//         fix the bug of open function

var exports = module.exports = {};
var ver = '1.8.0';
var update = '2019/12/09'
var appname = '';
var iocmma = '';
var webtype = '';
var dcenter = '';
var ucenter = '';
var rcvemsgcb;
var rcveventcb;
var rcvembmsgcb;
var statecb;
var wrcvemsgcb;
var wrcveventcb;
var wstatecb;
var ins, uc;
var appkey = '';
var mbusmma = '';
var mbusport = '6789';
var mcState = '';
var dcState = '';
var wdInterval = 60000;
var wdtimer = null;
var ucState = '';
const DefaultXmsgTimeout = 10;
const DefaultXrpcTimeout = 10;
const DefaultWaitTimeout = 20;
const local_target_prefix = '>';
const target_prefix = '>>';
const motechat_prefix = '>>sys';
const SS_NoRegData = -10405;
var RegTableSize = 10;
var edgetable = [];     // storage of mote info
var pubfunc = [];       // function table of xrpc publish
var isofunc = [];       // function table of xrpc isolated
var regtable = [];      // storage of reg process
var dbg = 0;
var mcerr;
var isOpened = false;   // motebus open?
var openFlag = false;   // open fuction in process?
var regFlag = false;
var regfunc = new regCenter();
const DC_ReStart_StateMSG = 'dc restart';
const procDCPoll = false;

/**
 * @callback openCallback
 * @param {Object} result {ErrCode, ErrMsg, result}
 */

/**
 * the method that open motechat
 * @example
    var conf = { "AppName":"", "IOC":"", "DCenter":"", "UCenter":"", "AppKey":"", "UseWeb":"", "MotebusGW":"", "Heartbeat":false }
	conf.AppName = 'myfunc';
	conf.DCenter = 'dc@boss.ypcloud.com:6788';
    conf.AppKey = 'YfgEeop5';
    var reginfo = {"EiToken":"8dilCCKj","SToken":"baTi52uE"};
    var mChat = require('motechat');
    mChat.Open(conf, reginfo, function(result){
		console.log('open result=%s’, JSON.stringify(result));
	}

 * @function Open
 * @param {Object} conf                 the configuration object for init.
 * @param {String} conf.AppName         the name of motebus MMA
 * @param {String} conf.AppKey          the key string of app
 * @param {String} conf.IOC             the MMA of IOC
 * @param {String} conf.DCenter         the MMA of device center
 * @param {String} conf.UseWeb          the communication type that can be 'wsocket', 'ajax', or ''
 * @param {String} conf.MotebusGW       the IP of motebus gateway
 * @param {Object} reg                  the information of register
 * @param {String} reg.EiToken          device token
 * @param {String} reg.SToken           app token
 * @param {String} reg.WIP              WAN IP
 * @param {Object} reg.EdgeInfo         Info of Ei
 * @param {String} reg.EdgeInfo.EiName  name of device
 * @param {String} reg.EdgeInfo.EiType  type of device
 * @param {String} reg.EdgeInfo.EiTag   tag of device
 * @param {String} reg.EdgeInfo.EiLoc   location of device
 * @param {openCallback} callback       the result callback function 
 */

// Module: Open, open motechat
// Input:
//  conf: the configuration object for init. 
//      AppName: the name of motebus MMA
//      IOC: the MMA of IOC
//      DCenter: the MMA of device enter
//      AppKey: the key string of app
//      UseWeb: can be 'wsocket' or ''
//      MotebusGW: the IP of motebus gateway
//  reg: the information of register
//      EiToken: device token
//      SToken: app token
//      WIP: wan IP
//      LIP: lan IP
//      EdgeInfo: information of Ei
//          EiName: name of Ei
//          EiType: type of Ei
//          EiTag: tag of Ei
//          EiLoc: locatio of Ei 
//  cb: callback({ErrCode,ErrMsg})

exports.Open = function(conf, reg, callback){
    var reginfo, cb;
        //getWIP();
    if ( mcerr == null ) mcerr = require('./mcerr.js');
    //uc = require('./uc.js');
    console.log('motechat: version=%s,update=%s', ver, update);
    //console.log('motechat: open arguments= %d %s', arguments.length, JSON.stringify(arguments[0]));
    if ( arguments.length == 1 ){
        // (conf)
        cb = null;
    }
    else if ( arguments.length == 2 ){
        // (conf, callback)
        if ( typeof reg == 'function' ) cb = reg;
    }
    else if ( arguments.length == 3 ){
        // (conf, reg, callback)
        if ( reg ) reginfo = reg;
        cb = callback;
    }
    if ( openFlag == false ){
        if ( isOpened == false ){
            openFlag = true;
            mcState = '';
            console.log('motechat:open mchatOpen');
            try {
                if ( conf ){
                    console.log('motechat:open conf=%s', JSON.stringify(conf));
                    mchatOpen(conf, function(result){
                        console.log('motechat:open result=%s', JSON.stringify(result));
                        if ( result.ErrCode == mcerr.MC_OKCODE ){
                            openFlag = false;
                            if ( result.Mote ){
                                let {EiMMA} = result.Mote;
                                console.log('motechat:open EiMMA=%s', EiMMA);
                                if ( chkMMA(EiMMA) ) {
                                    isOpened = true;
                                    if ( reginfo ) {
                                        console.log('motechat:open reginfo=%s', JSON.stringify(reginfo));
                                        connDC(null, reginfo, function(reply){
                                            if ( typeof cb == 'function' ) cb(reply);
                                        });
                                    }
                                    else {
                                        if ( typeof cb == 'function' ) cb(result);
                                    }
                                }
                                else
                                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: MMA error"});
                            }
                            else {
                                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: No mote info"});
                            }
                        }
                        else {
                            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
                        }
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
                    openFlag = false;
                }
            }
            catch(err){
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
                openFlag = false;
            }
        }
        else {
            // motebus has opened
            if ( reginfo ) {
                console.log('motechat:open reginfo=%s', JSON.stringify(reginfo));
                connDC(null, reginfo, function(reply){
                    if ( typeof cb == 'function' ) cb(reply);
                });
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
            }
        }
    } 
    else {
        // open in processing
        let ret = {"ErrCode":mcerr.MC_InProcess,"ErrMsg":mcerr.MC_InProcess_Msg};
        if ( typeof cb == 'function' ){
            cb(ret);
        }
    } 
}

var chkMMA = function(mma){
    if ( mma ){
        let f = mma.indexOf('@');
        if ( f > 0 && mma.length - f > 5 ) return true;
        else false;
    }
    else return false;
}

var mchatOpen = function(conf, cb){
    appname = conf.AppName ? conf.AppName : '';
    iocmma = conf.IOC ? conf.IOC : '';
    dcenter = conf.DCenter ? conf.DCenter : '';
    //console.log('motechat dcenter=%s', dcenter);
    appkey = conf.AppKey ? conf.AppKey : '';
    webtype = conf.UseWeb ? conf.UseWeb : '';
    if (appname && dcenter && appkey){
        if ( mcState == '' ){
            if ( ins == null ) ins = require('./in.js');
            ins.On('state', InStateHandler);
            ins.Open( conf, function(result){
                console.log('motechat:in open: result=%s', JSON.stringify(result));
                if ( result.ErrCode == mcerr.MC_OKCODE ) {
                    mcState = 'open';
                    mbusmma = result.Mote.EiMMA;
                    mbusport = result.Mote.EiPort;
                    ins.On('mbus', MotebusGetHandler);
                    if ( typeof cb == 'function' ) cb(result);
                    // Default motechat function
                    pubfunc.push({"app":appname,"func":MotechatService});
                    ins.PublishXrpc( appname, MotechatService );
                }
                else {
                    if ( typeof cb == 'function' ) cb(result);
                }
            });
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid state"});
        }
    }
    else {
        console.log('motechat appname=%s, dcenter=%s', appname, dcenter);
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
    }
}

var connDC = function(delay, reginfo, cb){
    StopWDtimer();
    isPollDC = false;
    //dcState = '';
    if ( mcState == 'open'){
        //console.log('motechat:connDC reginfo=%s', JSON.stringify(reginfo));
        CallDcenterReset(function(reply){
            //console.log('motechat:DC reset reply=%s', JSON.stringify(reply));
            console.log('-*%s motechat:connDC result=%s', ins.CurrentTime(), reply.ErrMsg);
            if ( reply.ErrCode == mcerr.MC_OKCODE ){
                // DC response OK
                if ( reply.UC ) ucenter = reply.UC;
                ins.On('message', MoteChatGetHandler);
                if ( reply.HeartbeatTimeout ){
                    if ( reply.HeartbeatTimeout >= 30 ){
                        wdInterval = reply.HeartbeatTimeout * 1000;
                        console.log('HeartbeatTimeout=%d', wdInterval);
                        isPollDC = true;
                        StartWDtimer();
                    }
                }
                if ( reginfo ) AutoReg(reginfo, cb);
                else {
                    if ( typeof cb == 'function') cb(reply);
                }
            }
            else {
                InStateHandler(reply.ErrMsg);
                let tm;
                if ( delay ) tm = delay + Math.floor((Math.random() * 10) + 1) * 100;
                else tm = 3000 + Math.floor((Math.random() * 10) + 1) * 100;
                waitMiniSec(tm).then(function() {
                    connDC(tm, reginfo, cb);
                })
            }
        });
    }
    else {
        let tm;
        if ( delay ) tm = delay + Math.floor((Math.random() * 10) + 1) * 100;
        else tm = 3000 + Math.floor((Math.random() * 10) + 1) * 100;
        waitMiniSec(tm).then(function() {
            connDC(tm, reginfo, cb);
        })
    }
}

var CallDcenterReset = function(cb){
    if ( mcState != 'open' ){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
    }
    else {
        if ( mbusmma ){
            if ( dcenter ){
                dcState = '';
                ins.CallXrpc( dcenter, 'resetreg', {"EiUMMA":mbusmma}, null, null, function(reply){
                    if ( dbg >= 1 ) console.log('%s motechat:CallDcenterReset dc=%s,reply=%s', ins.CurrentTime(), dcenter, JSON.stringify(reply));
                    if ( reply.ErrCode != mcerr.MC_OKCODE ){
                        console.log('%s motechat:CallDcenterReset dc=%s,reply=%s', ins.CurrentTime(), dcenter, JSON.stringify(reply));
                        ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"action":"conn dc","result":reply.ErrMsg,"Info":dcenter});
                        if ( typeof cb == 'function' ) cb(reply);
                    }
                    else {
                        dcState = 'open';
                        if ( typeof cb == 'function' ) cb(reply);
                    }
                });
            }
            else {
                let ret = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"null dcenter"};
                console.log('motechat:CallDcenterReset error: null dcenter');
                if ( typeof cb == 'function' ) cb(ret);
            }
        }
        else {
            console.log('motechat:CallDcenterReset error: null mma');
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":"null mma"};
            if ( typeof cb == 'function' ) cb(ret);
        }
    }
}

var AutoReg = function(reginfo, opencb){
    if ( reginfo && dcState == 'open' ){
        let needset = false;
        if ( reginfo.EdgeInfo ) needset = true;
        let data = {"SToken":reginfo.SToken,"EiToken":reginfo.EiToken,"WIP":reginfo.WIP,"LIP":reginfo.LIP,"Web":webtype};
        //console.log('motechat:AutoReg reg data=%s', JSON.stringify(data));
        regfunc.reg(data, 'user', function(result){
            //console.log('motechat:AutoReg reg result=%s', JSON.stringify(result));
            if ( needset ) {
                if ( result.ErrCode == mcerr.MC_OKCODE ){
                    if ( result.result ){
                        let {EiName,EiType,EiTag,EiLoc} = result.result;
                        let ei = reginfo.EdgeInfo;
                        if ( ei.EiName == EiName && ei.EiType == EiType && ei.EiTag == EiTag && ei.EiLoc == EiLoc ) needset = false;
                    }
                    if ( needset ){
                        let regdata = result.result;
                        let {SToken} = regdata;
                        let sdata = {"SToken":SToken,"EdgeInfo":reginfo.EdgeInfo};
                        setInfo( sdata, function(ret){
                            console.log('motechat:AutoReg setInfo result=%s', JSON.stringify(ret));
                            if ( typeof opencb == 'function' ){
                                if ( ret.ErrCode == mcerr.MC_OKCODE ){
                                    let einfo = GetEdgeInfo('stoken', sdata.SToken, 'reg');
                                    if ( einfo ) {
                                        let sret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":einfo};
                                        opencb(sret);
                                    }
                                    else {
                                        let serr = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Stoken error"};
                                        opencb(serr);
                                    }
                                }
                                else opencb(ret);
                            }
                        });
                    }
                    else {
                        if ( typeof opencb == 'function') opencb(result);
                    }
                }
            }
            else {
                if ( typeof opencb == 'function' ) opencb(result);
            }
        });
    }
}

/*
 * the method that close motechat
 * Input:
 *   cb: callback({ErrCode,ErrMsg})
 */

// Module: Close, close motechat
// Input:
//  cb: callback({ErrCode,ErrMsg})

exports.Close = function(cb){
    if ( mcState == 'open' ){
        mcState = '';
        unregAll();
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
    }
}


/**
 * OnEvent, on event handler
 * @example 
    var InmsgRcve = function(ch, inctl, data, retcb){
        console.log('InmsgRcve: channel=%s, from=%s, to=%s, data=%s', ch, JSON.stringify(inctl.From), JSON.stringify(inctl.To), JSON.stringify(data));
        if ( typeof retcb == 'function') retcb({"ErrCode":0, "ErrMsg":"OK"})
    }
    Var InState = function(state){
        console.log('InState=%s', state);
    }
    mChat.OnEvent('message',InmsgRcve);
    mChat.OnEvent('state', InState);
 * @function OnEvent
 * @param {String} stype    "message" is for getxmsg, "state" is for state changed
 * @param {function} cb     the user routine entry
 * @param {String} webtype "wsocket" is for websocket, "" is for non-webuse
 * @returns {boolean}
 */

// Module: OnEvent, on event handler
// Input:
//  stype: "message" is for getxmsg, "state" is for state changed
//  cb: the user routine entry
//  webtype: "wsocket" is for websocket, "" is for non-webuse
// Output:
//  return is boolean ( true or false )

exports.OnEvent = function(stype, cb, webtype){
    if ( stype == 'message' && typeof cb == 'function' ){
        if ( webtype ) wrcvemsgcb = cb;
        else rcvemsgcb = cb;
        return true;    
    }
    else if ( stype == 'state' && typeof cb == 'function' ){
        if ( webtype ) wstatecb = cb;
        else statecb = cb;
        return true;
    }
    else if ( stype == 'event' && typeof cb == 'function' ){
        if ( webtype ) wrcveventcb = cb;
        else rcveventcb = cb;
        ins.On('event', EventGetHandler);
        return true;
    }
    else if ( stype == 'mbus' && typeof cb == 'function' ){
        //console.log('motechat:OnEvent mbmsg');
        rcvembmsgcb = cb;
        ins.On('mbus', MotebusGetHandler);
        return true;
    }
    return false;
}

/**
 * @callback publishCallback
 * @param {Object} result {ErrCode,ErrMsg}
 */

/**
 * To publish XRPC function at motechat
 * @example 
    var app = 'myapp';
    var XrpcMcService = {
        "echo": function(head, body){
            console.log("xrpc echo: head=%s", JSON.stringify(head));
            if ( typeof body == 'object')
                sbody = JSON.stringify(body);
            else
                sbody = body;
            console.log("xrpc echo: body=%s", sbody);
            return {"echo":body};
        }
    }
    mChat.Publish( app, XrpcMcService, function(result){
        console.log('motechat publish: result=%s', JSON.stringify(result));
    });
 * @function Publish
 * @param {String} app the name of function
 * @param {function} func the user function entry which is published at motechat
 * @param {publishCallback} cb 
 */

// Module: PublishXrpc, to publish XRPC function at motechat
// Input:
//  app: the name of app
//  func: the user function entry which is published at motechat
//  cb, callback({ErrCode,ErrMsg})

exports.Publish = function(app, func, cb){
    if ( app && func ){
        pubfunc.push({"app":app,"func":func});
        ins.PublishXrpc( app, func, cb );
    }
}

/**
 * @callback isolatedcallback
 * @param {Object} result {ErrCode,ErrMsg}
 */

/**
 * To isolated publish XRPC function at motechat
 * @example
    var XrpcMcSecService = {
        "echo": function(head, body){
            console.log("xrpc echo: head=%s", JSON.stringify(head));
            if ( typeof body == 'object')
                sbody = JSON.stringify(body);
            else
                sbody = body;
            console.log("xrpc echo: body=%s", sbody);
            return {"echo":body};
        }
    }
    mChat.Isolated( XrpcMcSecService, function(result){
        console.log('motechat isolated: result=%s', JSON.stringify(result));
    });
 * @function Isolated
 * @param {function} func the user function entry which is isolated published at motechat
 * @param {isolatedRequest} cb 
 */

// Module: IsolatedXrpc, to isolated publish XRPC function at motechat
// Input:
//  app: the name of function
//  func: the user function entry which is isolated published at motechat
//  cb, callback({ErrCode,ErrMsg})

exports.Isolated = function(func, cb){
    if ( func ){
        isofunc.push( func );
        ins.IsolatedXrpc( func, cb );
    }
}

/**
 * @callback regCallback
 * @param {Object} result {ErrCode,ErrMsg,result}
 */

/**
 * register to device center
 * @function Reg
 * @example
    var mydev = {"EiToken":"8dilCCKj","SToken":"baTi52uE","WIP":"","LIP":""};
    mChat.Reg(mydev, function(result){
        console.log('StartSession result=%s', JSON.stringify(result));
    });
    //Note: At first time of the device, EiToken and SToken is empty.
 * @param {Object} data         the information for session
 * @param {String} data.EiToken device token
 * @param {String} data.SToken  app token
 * @param {String} data.WIP  wan ip
 * @param {String} data.LIP  lan ip
 * @param {regCallback} cb 
 */

// Module: Reg, register to device center
// Input:
//  data: the information for session, {EiToken,SToken}
//      EiToken: device token
//      SToken: app token
//      WIP: wan ip
//      LIP: lan ip (only non-web)
//      Web: web protocal if use
//  cb: callback({ErrCode,ErrMsg,result})

exports.Reg = function(data, cb){
    if ( typeof cb == 'function' ){
        try {
            regfunc.reg(data, 'user', cb);
        }
        catch(err){
            cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
        }
    }
}

function regCenter()  {
    this.reg = function(data, type, cb){
        console.log('motechat:reg data=%s', JSON.stringify(data));
        let {SToken,EiToken} = data;
        if ( typeof SToken == 'string' && typeof EiToken == 'string' ){
            if ( (SToken != '' && EiToken != '') || (SToken == '' && EiToken == '') ){
                let info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info ){
                    // has reged
                    if ( typeof cb == 'function'){
                        let ret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":info};
                        cb(ret);
                    }
                }
                else {
                    //console.log('motechat reg data=%s', JSON.stringify(data));
                    if ( _exist(SToken) < 0 ){
                        if ( SToken == '' ) _new(data, type, 'first', cb);
                        else _new(data, type, '', cb);
                        _watch();
                    }
                    else {
                        if ( typeof cb == 'function' ){
                            //cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
                            cb({"ErrCode":mcerr.MC_InProcess,"ErrMsg":mcerr.MC_InProcess_Msg});
                        }
                    }
                }
            }
            else {
                if ( typeof cb == 'function' ){
                    cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
                }
            }
        }
        else {
            if ( typeof cb == 'function' ){
                cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    var _end = function(){
        //console.log('regCenter:_end SToken=%s', stoken);
        let id = 0;
        //console.log('regCenter:_end id=%d', id);
        regtable.splice( id, 1 );
        if ( regtable.length > 0 ) _watch();
        //console.log('regCenter:_end regtable=%s', JSON.stringify(regtable));
    }
    var _exist = function(stoken){
        let index = -1;
        if ( stoken ){
            for(let i = 0; i < regtable.length; i++ ){
                if ( stoken == regtable[i].data.SToken ){
                    index = i;
                    break;
                }
            }
        }
        return index;
    }
    var _new = function(data, type, mode, callback){
        if ( regtable.length < RegTableSize ){
            let regctl = {"data":data,"state":"reg","count":1,"watch":0,"type":type,"mode":mode,"time":new Date(),"callback":callback};
            regtable.push(regctl);
            //console.log('motechat:new regtable=%s', JSON.stringify(regtable));
            return true;
        }
        else return false;
    }
    //var _state = function(stoken, state){
    //    let id = _exist(stoken);
    //    if ( id > 0 ){
    //        let regctl = regtable[id];
    //        regctl.state = state;
    //    }
    //}
    var _watch = function(delay){
        if ( regtable.length > 0 ){
            if ( dcState == 'open' && regFlag == false ){
                regFlag = true;
                let {data,state,callback} = regtable[0];
                if ( state == 'reg' ){
                    _reg(data, state, function(result){
                        regFlag = false;
                        if ( typeof callback == 'function' ) callback(result);
                        _end();
                    });
                }
                else if ( state == 'unreg' ) {
                    _unreg(data, function(result){
                        regFlag = false;
                        if ( typeof callback == 'function' ) callback(result);
                        _end();
                    });
                }
                else {
                    regFlag = false;
                    _end();
                }
            }
            else {
                if ( dcState == '' ) connDC(null, null, null);
                let tm = 0;
                if ( delay ) tm = delay + Math.floor((Math.random() * 10) + 1) * 100;
                else tm = 2000 + Math.floor((Math.random() * 10) + 1) * 100;
                waitMiniSec(tm).then(function() {
                    _watch(tm);
                })
            }
        }
    }
    var _recovered = function(result){
        //console.log('motechat:recovered result=%s', JSON.stringify(result));
        if ( result && result.ErrMsg ){
            if ( result.ErrCode == mcerr.MC_OKCODE ){
                if ( result.result ){
                    let {DDN} = result.result;
                    InStateHandler( 're-reg ' + result.ErrMsg, DDN );
                }
                else {
                    InStateHandler( 're-reg ' + result.ErrMsg, '' );
                }
            }
            else {
                InStateHandler( 're-reg ' + result.ErrMsg, '' );
            }
        }
    }
    var _reg = function(data, msg, cb){
        // data: {EiToken, SToken, WIP, Web}
        if ( dbg >= 1 ) console.log('motechat:reg: data=%s', JSON.stringify(data));
        if ( dcenter != '' ){
            var wanip = '';
            var lanip = '';
            var web = '';
            var setei = null;
            if ( data.WIP ) wanip = data.WIP;
            if ( data.LIP ) lanip = data.LIP;
            if ( data.Web ) web = data.Web;
            if ( data.EdgeInfo ) setei = data.EdgeInfo;
            var dcData = {"AppKey":appkey,"EiToken":data.EiToken,"SToken":data.SToken,"EiUMMA":mbusmma,"EiUPort":mbusport,"WIP":wanip,"LIP":lanip,"EdgeInfo":setei};
            ins.CallXrpc( dcenter, 'reg', dcData, null, null, function(reply){
                var device = dcData.EiUMMA;
                var regdata = {"WIP":dcData.WIP,"LIP":dcData.LIP,"MMA":device};
                if ( dbg == 0 ) console.log('-*%s motechat:reg result=%s', ins.CurrentTime(), reply.ErrMsg);
                else if ( dbg >= 1 ) console.log('motechat:reg reply=%s', JSON.stringify(reply));
                if ( reply.ErrCode == mcerr.MC_OKCODE ){
                    var ei = reply.result;
                    var einfo = NewEdgeInfo(ei.SToken, dcData.AppKey, ei.EiToken, dcData.EiUMMA, dcData.EiUPort, dcData.WIP, dcData.LIP, web, ei);
                    UpdateEdgeInfo(einfo);
                    //console.log('motechat: reg edgeinfo=%s', JSON.stringify(einfo));
                    let {EiName,DDN,EiMMA} = ei;
                    if ( uc ) ucState = 'start';
                    else {
                        if ( ucenter && EiMMA ){
                            uc = require('./uc.js');
                            uc.Start(ins, ucenter);
                            console.log('uc start!');
                            ucState = 'start';
                        }
                    }
                    if ( typeof cb == 'function' ) cb(reply);
                    //InStateHandler('reg ' + reply.ErrMsg, DDN);
                    ins.iocEvent('', mbusmma, 'info', 'in', {"Device":EiName,"DDN":DDN,"action":msg,"result":reply.ErrMsg,"info":regdata});
                }
                else {
                    if ( typeof cb == 'function' ) cb(reply);
                    //InStateHandler('reg ' + reply.ErrMsg);
                    ins.iocEvent('', mbusmma, 'error', 'in', {"Device":device,"DDN":"","action":msg,"result":reply.ErrMsg,"info":regdata});
                }
            });
        }
        else {
            console.log('motechat:StartSession error: null dcenter');
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NullDC,"ErrMsg":mcerr.MC_NullDC_Msg});
        }
    }
    var _unreg = function(data, cb){
        if ( data != null ){
            //console.log('motechat:UnReg data=%s', JSON.stringify(data));
            let {SToken,EiName,DDN} = data; 
            let dcData = {"SToken":SToken};
            ins.CallXrpc( dcenter, 'unreg', dcData, null, null, function(reply){
                if ( dbg >= 1 ) console.log('motechat:UnReg reply=%s', JSON.stringify(reply));
                if ( reply.ErrCode == mcerr.MC_OKCODE ){
                    RemoveEdgeInfo(dcData.SToken);
                }
                ins.iocEvent('', mbusmma, 'warning', 'in', {"Device":EiName,"DDN":DDN,"action":"unreg","result":reply.ErrMsg});
                InStateHandler('unreg ' + reply.ErrMsg, DDN);
                if ( typeof cb == 'function' ) cb(reply);
            });
        }
        else {
            if ( typeof cb == 'function' ){
                var reply = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                cb(reply);
            }
        }
    }
    this.unreg = function(stoken, type, cb){
        let info = GetEdgeInfo('stoken', stoken, 'reg');
        if ( info ){
            info.State = 'unreg';
            let data = {"SToken":info.SToken,"EiName":info.EiName,"DDN":info.DDN};
            let regctl = {"data":data,"state":"unreg","count":1,"watch":0,"type":type,"mode":"","time":new Date(),"callback":cb};
            regtable.push(regctl);
            _watch();
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
        }
    }
    this.dcreset = function(){
        regFlag = false;
        if ( edgetable.length > 0 ){
            if ( edgetable.length > RegTableSize ) RegTableSize = edgetable.length;
            for ( let i = edgetable.length-1; i >= 0; i-- ){
                let ei = edgetable[i];
                if ( ei.State == 'reg' ){
                    let info = {"EiName":ei.EiName,"EiType":ei.EiType,"EiTag":ei.EiTag,"EiLoc":ei.EiLoc};
                    let dcData = {"EiToken":ei.EiToken,"SToken":ei.SToken,"WIP":ei.WIP,"Web":ei.Web,"EdgeInfo":info};
                    _new(dcData, 'recover', '', _recovered);
                }
                else {
                    edgetable.splice(i, 1);
                }
            }
            console.log('motechat:dcreset regno=%d', regtable.length);
            _watch();
        }
    }
    this.rereg = function(stoken){
        for ( let i = 0; i < edgetable.length; i++ ){
            let ei = edgetable[i];
            if ( ei.SToken == stoken && ei.State == 'reg' ){
                if ( _exist(stoken) < 0 ){
                    let info = {"EiName":ei.EiName,"EiType":ei.EiType,"EiTag":ei.EiTag,"EiLoc":ei.EiLoc};
                    let dcData = {"EiToken":ei.EiToken,"SToken":ei.SToken,"WIP":ei.WIP,"Web":ei.Web,"EdgeInfo":info};
                    _new(dcData, 'recover', '', _recovered);
                }
                _watch();
                break;
            }
        }
    }
}

/**
 * @callback unRegCallback
 * @param {Object} result {ErrCode,ErrMsg}
 */

/**
 * un-register from device center
 * @function UnReg
 * @example 
    var mydev = {"SToken":"baTi52uE"};
    mChat.UnReg(mydev, function(result){
        console.log('EndSession result=%s', JSON.stringify(result));
    });
 * @param {Object} data the information for session
 * @param {String} data.SToken app token
 * @param {unRegCallback} cb
 */

// Module: UnReg, un-register from device center
// Input:
//  data: the information for session
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg})

exports.UnReg = function(data, cb){
    try {
        console.log('motechat: unreg data=%s', JSON.stringify(data));
        if ( data ) {
            let {SToken} = data;
            regfunc.unreg(SToken, 'user', cb);
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

var unregAll = function(){
    for ( var i = 0; i < edgetable.length; i++ ){
        let data = edgetable[i];
        let {SToken} = data;
        regfunc.unreg(SToken, 'sys');
    }    
}

/**
 * @callback sendCallback
 * @param {Object} result { ErrCode, ErrMsg }| reply
 */

/**
 * send xmsg to other device
 * @function Send
 * @example 
    var stoken = mydev.SToken;
    var ddn = '';
    var topic = 'ss://myScreen';
    var data = {"message":"Hello World"};
    var t1 = null;
    var t2 = null;
    var xmsgctl = {"SToken":stoken,"DDN":"","Topic":topic,"Data":data, "SendTimeout":t1,"WaitReply":t2};
        mChat.Send(xmsgctl, function(reply){
        console.log('sendxmsg reply=%s', JSON.stringify(reply));
    });
 * @param {Object} xmsg             msg control object
 * @param {String} xmsg.SToken      token of app
 * @param {String} xmsg.DDN         DDN of destination
 * @param {String} xmsg.To          device property of destination (legacy, backward comaptible)
 * @param {String} xmsg.Topic       ultranet topic of destination
 * @param {String} xmsg.Data        data which want to be sent
 * @param {Number} xmsg.SendTimeout  timeout of send xmessage, by sec. 
 * @param {Number} xmsg.WaitReply   the wait time of reply, by sec.
 * @param {sendCallback} cb 
 */

// Module: Send, send xmsg to other device
// Input:
//  xmsg: xmsg control object
//      SToken: token of app
//      DDN: device ddn of destination
//      To: device property of destination
//      Topic: ultranet topic data of destination
//      Data: the data which want to be sent
//      SendTimeout: timeout of send message
//      WaitReply: wait time of reply, by sec.
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Send = function(xmsg, cb){
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg}]);
            return;    
        }
        let {SToken,DDN,To,Topic,Data,SendTimeout,WaitReply} = xmsg;
        let selfinfo = null;
        if ( SToken ){
            selfinfo = GetEdgeInfo('stoken', SToken, 'reg');
        }
        let Addr = null;
        if ( selfinfo ) {
            if ( DDN )
                Addr = DDNParser(DDN, Topic);
            else if ( To )
                Addr = {"mode":"","to":{"Target":To}};
            else if ( Topic )
                Addr = TopicParser(Topic);
        
            if ( !Addr || !Data ){
                if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}]); 
                return;
            }
            else {
                let timeout = (SendTimeout == null || typeof SendTimeout == 'undefined') ? DefaultXmsgTimeout : SendTimeout;
                let waitreply = (WaitReply == null || typeof WaitReply == 'undefined') ? DefaultWaitTimeout : WaitReply;
                let {DDN,EiName,EiType,Uid} = selfinfo;
                let fm = {"DDN":DDN,"Name":EiName,"Type":EiType,"Uid":Uid};
                let xdata = {"stoken":SToken,"in":{"fm":fm,"msgtype":Addr.mode,"t1":timeout,"t2":waitreply},"to":Addr.to,"data":Data};
                let finish = false;
                if ( Addr.mode == 'in' ) {
                    finish = InFunc(xdata, cb);
                }
                if ( !finish ){
                    ins.SendXmsg(dcenter, xdata, [], timeout, waitreply,
                        function(tkinfo){
                            let reply = tkinfo.body;
                            let result = null;
                            let err = null;
                            if ( dbg >= 1 ) console.log('motechat:Send: reply=%s', JSON.stringify(reply));
                            if ( reply ){
                                if ( reply.ErrCode ){
                                    // some error
                                    if ( reply.ErrCode == mcerr.MC_OKMSG ) err = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"unknown error"};
                                    else err = reply;
                                    if ( typeof cb == 'function' ) cb(err);
                                    if ( reply.ErrCode == SS_NoRegData ){
                                        ReReg(xdata.stoken);    
                                    }
                                }
                                else {
                                    result = reply;
                                    //let ret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":result};
                                    if ( typeof cb == 'function' ) cb(result);
                                }
                            }
                            else {
                                err = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"reply null"};
                                if ( typeof cb == 'function' ) cb(err);
                            }
                            if ( iocmma ){
                                if ( result ){
                                    for ( var i = 0; i < result.length; i++ ) {
                                        //if ( cdata[i].Reply && cdata[i].Reply.ErrMsg ) ret = cdata[i].Reply.ErrMsg;
                                        //else if ( cdata[i].IN.State.ErrMsg ) ret = cdata[i].IN.State.ErrMsg;
                                        let msg = result[i];
                                        if ( msg.IN ){
                                            let {From,To,State} = msg.IN;
                                            if ( From && To && State ){
                                                let ret = '';
                                                if ( State.ErrMsg ) ret = State.ErrMsg;
                                                let data = xdata.data ? xdata.data : '';
                                                let edata = {"From":From,"To":To,"msg":data,"result":ret};
                                                if ( dbg >= 2 ) console.log('motechat:Send edata=%s', JSON.stringify(edata));
                                                if ( ret == mcerr.MC_OKMSG )
                                                    ins.iocEvent('', mbusmma, 'info', 'send', edata);
                                                else
                                                    ins.iocEvent('', mbusmma, 'error', 'send', edata);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    );
                }
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: " + err.message});
    }
}

/**
 * @callback callCallback 
 * @param {Object} result {ErrCode,ErrMsg} | reply
 */

/**
 * call the function of other device by XRPC
 * @function Call
 * @example 
    var ddn = '';
    var topic = 'mms://myFunc';
    var func = 'echo';
    var data = {"time":"2018/4/24 10:12:08"};
    var t1 = null;
    var t2 = null;
    var xrpc = {"SToken":mydev.SToken, "DDN":ddn, "Topic":topic ,"Func":func,"Data":data, "SendTimeout":t1, "WaitReply":t2};
        mChat.Call( xrpc, function(reply){
        console.log('Call reply=%s', JSON.stringify(reply));
    });
 * @param {Object} xrpc             xrpc control object
 * @param {String} xrpc.SToken      app token
 * @param {String} xrpc.DDN         DDN of destination
 * @param {String} xrpc.To          device property of destination (legacy, backward comaptible)
 * @param {String} xrpc.Topic       topic of destination
 * @param {String} xrpc.Func        function name of destination
 * @param {Object} xrpc.Data        the data object want to delivered
 * @param {Number} xrpc.SendTimeout timeout of send xmessage, by sec. 
 * @param {Number} xrpc.WaitReply   the wait time of reply, by sec.
 * @param {callCallback} cb 
 */

// Module: Call, call the function of other device by XRPC
// Input:
//  xrpc: xrpc control object
//      SToken: app token
//      Topic: topic of destination
//      DDN: device ddn of destination
//      To: device property of destination
//      Func: function name of destination
//      Data: data object for function
//      SendTimeout: timeout of call xrpc
//      Waitreply: wait time of call xrpc
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Call = function(xrpc, cb){
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg}]);
            return;    
        }
        let {SToken,DDN,To,Topic,Func,Data,SendTimeout,WaitReply} = xrpc;
        let selfinfo = null;
        if ( SToken ){
            selfinfo = GetEdgeInfo('stoken', SToken, 'reg');
        }
        let Addr = null;
        if ( selfinfo ) {
            if ( DDN )
                Addr = DDNParser(DDN, Topic);
            else if ( To ) 
                Addr = {"mode":"","to":{"Target":To}};
            else if ( Topic )
                Addr = TopicParser(Topic);

            if ( !Addr || !Data ){
                if ( typeof cb == 'function' ) cb([{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}]); 
                return;
            }
            else {
                if ( Addr.mode == 'xs'){
                    XShareFunc(xrpc, cb);
                }
                else if ( Addr.to.DDN == 'UC' || Addr.to.DDN == 'uc' || Addr.to.Target == 'UC' || Addr.to.local_target_prefix == 'uc' ){
                    //if ( addr.to.Target == 'UC' || addr.to.Target == 'uc' || addr.to.DDN == 'UC' || addr.to.DDN == 'uc' ){
                    if ( ucState == 'start' ){
                        try {
                            //console.log('UcCall info=%s', JSON.stringify(selfinfo));
                            let {EiMMA} = selfinfo;
                            let ucdata = {"EiMMA":EiMMA,"SToken":SToken,"Func":Func,"Data":Data};
                            console.log('UcCall data=%s', JSON.stringify(ucdata));
                            uc.UcCall( ucdata, function(reply){
                                let ret = GetUcResult(Func, reply);
                                console.log('UcCall ret=%s', JSON.stringify(ret));
                                if ( typeof cb == 'function' ) cb(ret);
                                if ( (Func == 'ucLogin' || Func == 'ucLogout') && ret.ErrCode == mcerr.MC_OKCODE ){
                                    HandleUserInfo( Func, SToken, reply );
                                }
                            });
                        }
                        catch(e){
                            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: " + e.message});
                        }
                    }
                    else cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: uc modules not open"});
                }
                else {
                    let timeout = (SendTimeout == null || typeof SendTimeout == 'undefined') ? DefaultXmsgTimeout : SendTimeout;
                    let waitreply = (WaitReply == null || typeof WaitReply == 'undefined') ? DefaultWaitTimeout : WaitReply;
                    let {DDN,EiName,EiType,Uid} = selfinfo;
                    let fm = {"DDN":DDN,"Name":EiName,"Type":EiType,"Uid":Uid};
                    let dcData = {"stoken":SToken,"in":{"fm":fm,"msgtype":Addr.mode,"t1":timeout,"t2":waitreply,},"to":Addr.to,"func":Func,"data":Data};
                    if ( dbg >= 1 ) console.log('motechat:Call data=%s', JSON.stringify(dcData));
                    var finish = false;
                    if ( Addr.mode == 'in' ) {
                        finish = InFunc(dcData, cb);
                    }
                    if ( dbg >= 1 ) console.log('motechat:Call data=%s', JSON.stringify(dcData));
                    if (!finish) {
                        ins.CallXrpc( dcenter, 'call', dcData, timeout, waitreply, function(reply){
                            if ( dbg >= 1 ) console.log('motechat:Call result=%s', JSON.stringify(reply));
                            let result = null;
                            let err = null;
                            if ( reply ){
                                if ( reply.ErrCode ){
                                    // some error
                                    if ( reply.ErrCode == mcerr.MC_OKMSG ) err = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"unknown error"};
                                    else err = reply;
                                    if ( typeof cb == 'function' ) cb(err);
                                    if ( reply.ErrCode == SS_NoRegData ){
                                        ReReg(xdata.stoken);    
                                    }
                                }
                                else {
                                    result = reply;
                                    //let ret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":result};
                                    if ( typeof cb == 'function' ) cb(result);
                                }
                            }
                            else {
                                err = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"reply null"};
                                if ( typeof cb == 'function' ) cb(err);
                            }
                            if ( iocmma ){
                                if ( result ){
                                    for ( var i = 0; i < result.length; i++ ) {
                                        let msg = result[i];
                                        if ( msg.IN ){
                                            let {From,To,State} = msg.IN;
                                            if ( From && To && State ){
                                                let ret = '';
                                                if ( State.ErrMsg ) ret = State.ErrMsg;
                                                let data = dcData.data ? dcData.data : '';
                                                let edata = {"From":From,"To":To,"msg":data,"result":ret};
                                                if ( dbg >= 2 ) console.log('motechat:Send edata=%s', JSON.stringify(edata));
                                                if ( ret == mcerr.MC_OKMSG )
                                                    ins.iocEvent('', mbusmma, 'info', 'call', edata);
                                                else
                                                    ins.iocEvent('', mbusmma, 'error', 'call', edata);
                                            }
                                        }
                                    }
                                }
                            }
                        });
                    }
                } 
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg}); 
        }
    }
    catch(e){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"mc: " + e.message});
    }
}

var GetUcResult = function(func, reply){
    if ( func == 'ucCheckUser' || func == 'ucSignup' || func == 'ucLogout' || func == 'ucSetUserInfo' || func == 'ucSetUserSetting' ){
        if ( reply == true ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func});
        else if ( reply.ErrCode ) return({"ErrCode":reply.ErrCode,"ErrMsg":reply.ErrMsg,"func":func}); 
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func});
    }
    else if ( func == 'ucLogin' || func == 'ucGetUserInfo' || func == 'ucMLoginStep2' ){
        if ( reply.UToken ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"UserInfo":reply});
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func});
    }
    else if ( func == 'ucGetUserSetting' ){
        if ( reply ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"Setting":reply});
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func});
    }
    else if ( func == 'ucGenMPin' || func == 'ucVerifyMobileNo' || func == 'ucChangePass' || func == 'ucMLoginStep1' || func == 'ucEdgeSet' || func == 'ucEdgeAdd' || func == 'ucEdgeRemove' ){
        if ( reply == true ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func});
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func});
    }
    else if ( func == 'ucEdgePair' ){
        if ( reply.DDN ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"EdgeInfo":reply});
        else if ( reply.ErrCode ) return({"ErrCode":reply.ErrCode,"ErrMsg":reply.ErrMsg,"func":func}); 
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func});
    }
    else if ( func == 'ucEdgeList' ){
        if ( Array.isArray(reply) ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"EdgeInfo":reply});
        else if ( reply.ErrCode ) return({"ErrCode":reply.ErrCode,"ErrMsg":reply.ErrMsg,"func":func}); 
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func});
    }
    else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func});
}

var ReReg = function(stoken){
    console.log('motechat:ReReg SToken=%s', stoken);
    if ( stoken ) regfunc.rereg(stoken);
}

var DDNParser = function(ddn, topic){
    var ret;
    console.log('motechat:DDNParser ddn=%s, topic=%s', ddn, topic);
    if ( ddn == motechat_prefix ){
        ret = TopicParser(topic);
    }
    else if ( ddn.indexOf(target_prefix) >= 0 ){
        let target = ddn.substr(target_prefix.length);
        ret = {"mode":"","to":{"Target":target,"Topic":topic}};
    }
    else if ( ddn.indexOf(local_target_prefix) >= 0 ){
        let target = ddn.substr(local_target_prefix.length);
        ret = {"mode":"","to":{"Target":target,"Search":"local","Topic":topic}};
    }
    else {
        ret = {"mode":"","to":{"DDN":ddn,"Topic":topic}};
    }
    console.log('motechat:DDNParser ret=', ret);
    return ret;
}

var TopicParser = function(topic){
    var app, dest;
    var addr;
    //console.log('TopicParser topic=%s', topic);
    if ( typeof topic == 'string' ){
        ix = topic.indexOf('://');
        if ( ix > 0 ){
            app = topic.substr(0, ix);
            dest = topic.substr(ix+3);
            //console.log('TopicParser app=%s, dest=%s', app, dest);
            if ( app ) {
                app = app.toLowerCase();
                switch (app){
                    case 'ddn':
                        addr = {"mode":"","to":{"DDN":dest}};
                        break;
                    case 'ss':
                        addr = {"mode":"","to":{"Target":dest,"Topic":topic}};
                        break;
                    case 'in':
                        addr = {"mode":"in","to":{"DDN":dest,"Topic":topic}};
                        break;
                    case 'ein':
                        addr = {"mode":"in","to":{"Target":dest,"Topic":topic}};
                        break;
                    case 'svc':
                        addr = {"mode":"","to":{"Target":dest,"Topic":topic}};
                        break;
                    case 'xs':
                        addr = {"mode":"xs","topic":dest};
                        break;
                    default:
                        addr = null;
                        break;
                }
            }
            else addr = null;
        }
        else {
            addr = {"mode":"","to":{"Target":topic}};
        }
    }
    return addr;
}


// Module: InFunc, functions for inlayer service
// Input:
//  indata: in control data object
//      stoken: app token
//      indata: in control object
//      to: to control object
//      func: function name if callxrpc 
//      data: data object
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

var InFunc = function(indata, cb){
    var data, cmd, option, result, err;
    try {
        if ( dbg >= 1 ) console.log('InFunc %s', JSON.stringify(indata));
        if ( indata ) data = indata.data;
        if ( data ){
            if ( typeof data == 'string' ){
                var darr = data.split(' ');
                cmd = darr[0];
                if ( darr.length > 1 ) option = darr[1];
                else option = '';
            }
            else {
                cmd = data.cmd;
                if (data.option) option = data.option;
                else option = '';
            }
            if (cmd){
                cmd = cmd.toLowerCase();
                if (option) option = option.toLowerCase();
                //var stime = ins.CurrentTime();
                //stime = stime.substr(stime.indexOf(' ')+1);
                var stime = new Date();
                var stamp;
                switch(cmd){
                    case 'ping':
                        stamp = [];
                        stamp.push({"mma":mbusmma,"time":stime});
                        if ( indata.to.DDN == 'local' || indata.in.fm.DDN == indata.to.DDN ){
                            result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                            if ( typeof cb == 'function' ) cb([{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"ping","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp}}]);
                            return true;
                        }
                        else {
                            indata.data = {"cmd":cmd,"option":option,"trace":stamp};
                            return false;
                        }
                        break;
                    case 'trace':
                        stamp = [];
                        stamp.push({"mma":mbusmma,"time":stime});
                        if ( indata.to.DDN == 'local' || indata.in.fm.DDN == indata.to.DDN ){
                            result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                            if ( typeof cb == 'function' ) cb([{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"trace","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp}}]);
                            return true;
                        }
                        else {
                            indata.data = {"cmd":cmd,"option":option,"trace":stamp};
                            return false;
                        }
                        break;
                    case 'tracedc':
                        indata.data = {"cmd":cmd,"option":option,"trace":[]};
                        return false;
                        break;
                    case 'eitable':
                        if ( indata.to.DDN == 'local' ){
                            result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                            if ( typeof cb == 'function' ) cb([{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"eitable","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"ei":edgetable}}]);
                            return true;
                        }
                        break;
                    default:
                        break;
                }
            }
        }
        result = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
    }
    catch(e){
        result = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
    }
    if ( typeof cb == 'function' ) cb([result]);
    console.log('InFunc err: %s', JSON.stringify(result));
    return true;
}

var InTraceResp = function(reply){
    try {
        var resp = reply.response;
        if ( resp == 'trace' ){
            var stime = new Date();
            var trace = reply.Trace;
            var trdata = {"mma":mbusmma,"time":stime};
            //console.log("XmsgRcve: trdata=%s", JSON.stringify(trdata));
            trace.push(trdata);
        }
    }
    catch(e){
        console.log("InTraceResp error:%s", e.message);
    }
}

var XShareFunc = function(xsdata, cb){
    console.log('motechat:XShareFunc data=', xsdata);
    let {Topic, Func, Data} = xsdata;
    if ( Topic && Func && Data ){
        if ( typeof cb == 'function' ){
            ins.XShareFunc( xsdata, (result) => {
                console.log('motechat:XShareFunc result=', result);
                cb(result);
            })
        }
        else {
            return new Promise((resolve) => {
                ins.XShareFunc( xsdata, (result) => {
                    console.log('motechat:XShareFunc result=', result);
                    resolve(result);
                })
            })
        }
    }
    else {
        let reply = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
        if ( typeof cb == 'function' ) cb(reply);
        else return reply;
    }
}

const DeviceAdjustTime = 2;
const TagAdjustTime = 5;

var CalTimeout = function(topic){
    var ret = 0;
    if ( topic ){
        var tparr = topic.split(',');
        var tpno = tparr.length-1;
        var tgno = 0;
        if ( topic.indexOf('#') >= 0 ){
            tgarr = topic.split('#');
            tgno = tgarr.length-1;
        }
        ret = tpno * DeviceAdjustTime + tgno * TagAdjustTime;
    }
    return ret;
}


/**
 * @callback getCallback 
 * @param {Object} result {ErrCode, ErrMsg} | reply
 */

/**
 * get my device information
 * @function Get
 * @example 
    var data = {"SToken":mydev.SToken};
    mChat.Get(data, function(result){
        console.log('GetDeviceInfo result=%s', result);
    });
 * @param {Object} data    the input data object
 * @param {String} data.SToken  app token 
 * @param {getCallback} cb 
 */

// Module: Get, get my device information
// Input:
//  data: the input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Get = function(data, cb){
    // data {SToken}
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            let {SToken} = data;
            if ( SToken ){
                var info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info ){
                    ins.CallXrpc( dcenter, 'getinfo', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:GetDevice reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode == mcerr.MC_OKCODE ){
                            if ( dbg >= 2 ) console.log('motechat:GetDevice edgetable=%s', JSON.stringify(edgetable));
                        }
                        else {
                            MoteErrHandler('get', reply.ErrMsg, SToken);
                        }
                        if ( typeof cb == 'function' ) cb(reply);
                    });    
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

/**
 * @callback setCallback
 * @param {Object} result {ErrCode,ErrMsg} | reply
 */

/**
 * Set device information
 * @function Set
 * @example 
    var info = {"EiName":"myEi","EiType":".ei","EiTag":"#my","EiLoc":""};
    var data = {"SToken":mydev.SToken,"EdgeInfo":info};
    mChat.Set(data, function(result){
        console.log('SetDeviceInfo result=%s', result);
    });
 * @param {Object} data      input data object
 * @param {String} SToken    app token
 * @param {Object} EdgeInfo  {"EiName":"","EiType":"","EiTag":"","EiLoc":""} 
 * @param {setCallback} cb 
 */

// Module: Set, set my device information
// Input:
//  data: input data object
//      SToken: app token
//      EdgeInfo: {"EiName":"","EiType":"","EiTag":"","EiLoc":""} 
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Set = function(data, cb){
    // data: {SToken, EdgeInfo}
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            setInfo(data, cb);
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

var setInfo = function(data, cb){
    let {SToken,EdgeInfo} = data;
    if ( SToken ){
        console.log('motechat:SetDevice data=%s', JSON.stringify(data));
        if ( SToken && EdgeInfo ){
            let info = GetEdgeInfo('stoken', SToken, 'reg');
            if ( info ){
                if ( CompareEdgeInfo(EdgeInfo, info) == false){
                    ins.CallXrpc( dcenter, 'setinfo', data, null, null, function(reply){
                        if ( dbg >= 0 ) console.log('motechat:SetDevice reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('set', reply.ErrMsg, SToken);
                        else if ( reply.result ) {
                            let edge = reply.result;
                            let uinfo = {"SToken":SToken,"EiName":edge.EiName,"EiType":edge.EiType,"EiTag":edge.EiTag,"EiLoc":edge.EiLoc};
                            UpdateEdgeSetInfo(uinfo);
                        }
                        if ( typeof cb == 'function' ) cb(reply);
                    });    
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
                }
            }
            else {
                console.log('motechat:setDevice invalid stoken=%s', SToken);
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
            }
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
        }
    }
    else {
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
    }
}

var CompareEdgeInfo = function(a, b){
    //console.log('motechat:CompareEdgeInfo a=%s,b=%s', JSON.stringify(a), JSON.stringify(b));
    try {
        if ( a.EiName == b.EiName && a.EiType == b.EiType && a.EiTag == b.EiTag && a.EiLoc == b.EiLoc )
            return true;
        else
            return false;
    }
    catch(err){
        return false;
    }
}

// Module: GetAppSetting, get my application information
// Input:
//  data: the input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.GetAppSetting = function(data, cb){
    // data : {SToken}
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            let {SToken} = data;
            if ( SToken ){
                let info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info ){
                    ins.CallXrpc( dcenter, 'getapp', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:GetAppSetting reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode ){
                            if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('getappsetting', reply.ErrMsg, SToken);
                        } 
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}


// Module: SetAppSetting, set my application setting
// Input:
//  data: input data object
//      SToken: app token
//      Setting: user defined data object
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.SetAppSetting = function(data, cb){
    try {
        // data: {SToken, Setting}
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            let {SToken} = data;
            if ( SToken ){
                let info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info ){
                    ins.CallXrpc( dcenter, 'setapp', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:SetAppSetting reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode ){
                            if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('setappsetting', reply.ErrMsg, SToken);
                        } 
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}


// Module: GetQPin, get PIN code
// Input:
//  data: input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.GetQPin = function(data, cb){
    // data: {SToken}
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            let {SToken} = data;
            if ( SToken ){
                var info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info ){
                    if ( dbg >= 1 )console.log('motechat:GetQPin data=%s', JSON.stringify(data));
                    ins.CallXrpc( dcenter, 'getqpin', data, null, null, function(reply){
                        if ( dbg >= 2 ) console.log('motechat:GetQPin reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode ){
                            if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('getqpin', reply.ErrMsg, data.SToken);
                        } 
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}


// Module: GetQPin, find PIN code
// Input:
//  data: input data object
//      SToken: app token
//      Qpin: PIN code
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.FindQPin = function(data, cb){
    // data: {SToken, Qpin}
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            let {SToken} = data;
            if ( SToken ){
                let info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info ){
                    ins.CallXrpc( dcenter, 'findqpin', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:FindQPin reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode ){
                            if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('findqpin', reply.ErrMsg, data.SToken);
                        } 
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}


/**
 * @callback searchCallback 
 * @param {Object} result {ErrCode,ErrMsg} | reply
 */

/**
 * Search device by key
 * @function Search
 * @example 
    var data = {"SToken":mydev.SToken,”Keyword”:”#test”};
    mChat.Search(data, function(result){
        console.log(‘Search result=%s’, result);
    });
 * @param {Object} data    input data object
 * @param {String} data.SToken  app token
 * @param {String} data.Keyword Key for search 
 * @param {searchCallback} cb 
 */

// Module: Search, search device by key
// Input:
//  data: input data object
//      SToken: app token
//      Keyword: Key for search
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Search = function(data, cb){
    try {
    // data {SToken, Keyword}
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            let {SToken} = data;
            if ( SToken ){
                let info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info && info.UToken ){
                    ins.CallXrpc( dcenter, 'search', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:Search reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode ){
                            if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('search', reply.ErrMsg, data.SToken);
                            if ( reply.ErrCode == SS_NoRegData ){
                                setTimeout(function(stoken){
                                    ReReg(stoken);
                                }, 200, data.SToken);
                            }
                        } 
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

// Module: Nearby, search nearby device
// Input:
//  data: input data object
//      SToken: app token
//  cb: callback({ErrCode,ErrMsg}) or callback(reply)

exports.Nearby = function(data, cb){
    // data {SToken}
    try {
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            let {SToken} = data;
            if ( SToken ){
                var info = GetEdgeInfo('stoken', SToken, 'reg');
                if ( info ){
                    ins.CallXrpc( dcenter, 'nearby', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:Nearby reply=%s', JSON.stringify(reply));
                        if ( reply.ErrCode ){
                            if ( reply.ErrCode != mcerr.MC_OKCODE ) MoteErrHandler('nearby', reply.ErrMsg, data.SToken);
                            if ( reply.ErrCode == SS_NoRegData ){
                                setTimeout(function(stoken){
                                    ReReg(stoken);
                                }, 200, data.SToken);
                            }
                        } 
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

exports.SendLog = function(cb){
    try {
    // data {SToken, lgTime, lgType, lgDesc}
        if ( dcState == 'open') {
            if ( data.SToken ){
                var stoken = data.SToken;
                var info = GetEdgeInfo('stoken', stoken, 'reg');
                if ( info ){
                    ins.CallXrpc( dcenter, 'Sendlog', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:SendLog reply=%s', JSON.stringify(reply));
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

exports.ListLogs = function(data, cb){
    try {
    // data {SToken, RowCount, bFirst}
        if ( dcState != 'open' ){
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg});
        }
        else {
            if ( data.SToken ){
                var stoken = data.SToken;
                var info = GetEdgeInfo('stoken', stoken, 'reg');
                if ( info ){
                    ins.CallXrpc( dcenter, 'Listlog', data, null, null, function(reply){
                        if ( dbg >= 1 ) console.log('motechat:SendLog reply=%s', JSON.stringify(reply));
                        if ( typeof cb == 'function' ) cb(reply);
                    });
                }
                else {
                    if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
                }
            }
            else {
                if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg});
            }
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

exports.GetAppKey = function(){
    return appkey;
}

exports.MoteChatGetHandler = function(ch, head, body, cb){
    try {
        let pm = new Promise(function(resolve){
            MoteChatGetHandler(ch, head, body, function(reply){
                resolve(reply);
            });
        });
        pm.then(function(ret){
            if ( dbg >= 0 ) console.log('motechat return=%s', JSON.stringify(ret));
            if ( typeof cb == 'function' ) cb(ret);
        });
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

// module: call xrpc to remote by motebus
// xrpc: object parameter of mbCall
//  MMA: destination MMA of xrpc
//  Func: function name
//  Data: data array
//  Timeout: timeout of call xrpc
//  Waitreply: wait time of call xrpc
//  cb: result callback
exports.mbCall = function(xrpc, cb){
    try {
        var mma = xrpc.MMA ? xrpc.MMA : '';
        var func = xrpc.Func ? xrpc.Func : '';
        var data = xrpc.Data ? xrpc.Data : '';
        var t1 = typeof xrpc.Timeout != 'undefined' ? xrpc.Timeout : null;
        var t2 = typeof xrpc.Waitreply != 'undefined' ? xrpc.Waitreply : null;
        if ( mma && func ){
            ins.CallXrpc(mma, func, data, t1, t2, function(result){
                if ( typeof cb == 'function' ) cb(result);
                var edata, ret;
                if ( result.ErrMsg ){
                    ret = result.ErrMsg;
                    edata = {"From":mbusmma,"To":mma,"msg":data,"result":ret};
                }    
                else {
                    ret = mcerr.MC_OKMSG;
                    edata = {"From":mbusmma,"To":mma,"msg":data,"result":ret};
                }
                if ( dbg >= 2 ) console.log('motechat:mbCall edata=%s', JSON.stringify(edata));
                if ( ret == mcerr.MC_OKMSG )
                    ins.iocEvent('', mbusmma, 'info', 'mbcall', edata);
                else
                    ins.iocEvent('', mbusmma, 'error', 'mbcall', edata);
            });
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

// module: send xmsg to remote by motebus
// xmsg: object parameter of mbSend
//  MMA: destination MMA
//  Data: data string or object
//  Timeout: timeout of send xmsg
//  Waitreply: wait time of send mxsg
//  cb: result callback
exports.mbSend = function(xmsg, cb){
    try {
        var mma = xmsg.MMA ? xmsg.MMA : '';
        var data = xmsg.Data ? xmsg.Data : '';
        var t1 = typeof xmsg.Timeout != 'undefined' ? xmsg.Timeout : null;
        var t2 = typeof xmsg.Waitreply != 'undefined' ? xmsg.Waitreply : null;
        if ( mma ){
            ins.SendXmsg(mma, data, [], t1, t2, function(result){
                if ( typeof cb == 'function' ) cb(result);
                var edata, ret;
                if ( result.ErrMsg ){
                    ret = result.ErrMsg;
                    edata = {"From":mbusmma,"To":mma,"msg":data,"result":ret};
                }
                else {
                    ret = mcerr.MC_OKMSG;
                    edata = {"From":mbusmma,"To":mma,"msg":data,"result":ret};
                }
                if ( dbg >= 2 ) console.log('motechat:mbSend edata=%s', JSON.stringify(edata));
                if ( ret == mcerr.MC_OKMSG )
                    ins.iocEvent('', mbusmma, 'info', 'mbsend', edata);   
                else
                    ins.iocEvent('', mbusmma, 'error', 'mbsend', edata); 
            });
        }
        else {
            if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg});
        }
    }
    catch(err){
        if ( typeof cb == 'function' ) cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message});
    }
}

var InStateHandler = function(state, ddn){
    if ( dbg >= 1 ) console.log('motechat:InStateHandler state=%s',state);
    let showddn = '';
    if ( ddn ) showddn = ddn;
    if ( typeof statecb == 'function' ) statecb(state, showddn);
    if ( typeof wstatecb == 'function' ) wstatecb(state, showddn);  //state callback for web app
    if ( state == 'opened2' ){
        // motebus restart
        ReinitXfunc();
        mcState = 'open';
        MBusRestart();
    }
    else if ( state == 'off' ) {
        mcState = '';
        dcState = '';
        StopWDtimer();
    }
}

var ReinitXfunc = function(){
    var i, app, func;
    if ( pubfunc.length > 0 ){
        for ( i = 0; i < pubfunc.length; i++ ){
            app = pubfunc[i].app;
            func = pubfunc[i].func;
            ins.PublishXrpc( app, func, function(result){
                console.log('publishXrpc: app=%s, result=%s', app, JSON.stringify(result));
            } );    
        }
    }
    if ( isofunc.length > 0 ){
        for ( i = 0; i < isofunc.length; i++ ){
            ins.IsolatedXrpc( isofunc[i], function(result){
                console.log('isolatedXrpc: result=%s', JSON.stringify(result));    
            } );    
        }
    }
}

var MBusRestart = function(){
    dcState = '';
    regtable = [];
    console.log('%s motechat:MBusRestart', ins.CurrentTime());
    var tm = 3000 + Math.floor((Math.random() * 10) + 1) * 100;
    setTimeout(function(){
        connDC( null, null, function(result){
            //console.log('motechat:MBusRestart DC Reset result=%s', JSON.stringify(result));
            if ( result.ErrCode == mcerr.MC_OKCODE ){
                // DC response OK
                regfunc.dcreset();
            }
        })
    },tm);
}

var MoteChatGetHandler = function(ch, head, body, cb){
    //console.log('motechat:MoteChatGetHandler ch=%s body=%s',ch, JSON.stringify(body));
    if ( typeof cb == 'function' ){
        try {
            var from, to, ddn, data;
            var msgtype = '';
            if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler body=%s',JSON.stringify(body));
            if ( body.in ){
                from = ( body.in.fm ) ? body.in.fm : {};
                to = ( body.in.to ) ? body.in.to : {};
                msgtype = ( body.in.msgtype ) ? body.in.msgtype : '';
                ddn = ( to.DDN ) ? to.DDN : '';
            }
            data = ( body.data ) ? body.data : '';
            var ddnlist = [];
            ddnlist = FindEdgeInfo('ddn', ddn);
            if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
            if ( ddnlist.length > 0 ){
                //if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler ddnlist=%s',JSON.stringify(ddnlist));
                for ( var i = 0; i < ddnlist.length; i++ ){
                    var toddn, ret;
                    toddn = ddnlist[i].DDN;
                    if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler from=%s,to=%s,data=%s',JSON.stringify(from),JSON.stringify(to),JSON.stringify(data));
                    if ( ddnlist[i].Web == ''){
                        //console.log('MoteChatGetHandler: app received');
                        //if ( typeof rcvemsgcb == 'function' ) rcvemsgcb(ch, head, from, toddn, msgtype, data, cb);
                        //else ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg};
                        var finish = false;
                        if ( msgtype == 'in' ){
                            finish = McRcvInFunc(data, false, cb);
                        }
                        if ( !finish ){
                            if ( typeof rcvemsgcb == 'function' ) {
                                var inctl = {"From":from,"To":to,"msgtype":msgtype};
                                rcvemsgcb(ch, inctl, data, function(reply){
                                    if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler reply=%s',JSON.stringify(reply));
                                    if ( reply.response ) InTraceResp(reply);
                                    if ( typeof cb == 'function' ) cb(reply);    
                                });
                            }
                            else {
                                ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"By":mbusmma};
                                cb(ret);
                            }
                        }
                    }
                    else {
                        if ( typeof wrcvemsgcb == 'function' ) {
                            var inctl = {"From":from,"To":to,"msgtype":msgtype};
                            wrcvemsgcb(ch, inctl, data, function(reply){
                                if ( dbg >= 1 ) console.log('motechat:MoteChatGetHandler reply=%s',JSON.stringify(reply));
                                if ( reply.response ) InTraceResp(reply);
                                if ( typeof cb == 'function' ) cb(reply);    
                            });
                        }
                        else {
                            ret = {"ErrCode":mcerr.MC_NoRcveFunc,"ErrMsg":mcerr.MC_NoRcveFunc_Msg,"By":mbusmma};
                            cb(ret);
                        }
                    }
                }
            }
            else {
                ret = {"ErrCode":mcerr.MC_NoMatchDDN,"ErrMsg":mcerr.MC_NoMatchDDN_Msg,"By":mbusmma};
                console.log('motechat:MoteChatGetHandler ret=%s',JSON.stringify(ret));
                cb(ret);
            }
        }
        catch(err){
            ret = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message,"By":mbusmma};
            console.log('motechat:MoteChatGetHandler ret=%s',JSON.stringify(ret));
            cb(ret);
        }
    }
}

var EventGetHandler = function(ch, head, body){
    if ( typeof rcveventcb == 'function' ){
        rcveventcb(ch, head, body, null);
        //if ( typeof cb == 'function' )
        //    cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
    }
    else if ( typeof wrcveventcb == 'function' ){
        wrcveventcb(ch, head, body, null);
        //if ( typeof cb == 'function' )
        //    cb({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG});
    }
}

var MotebusGetHandler = function(from, data, cb){
    if ( typeof data == 'object' )
        console.log('MotebusGetHander from=%s, data=%s', from, JSON.stringify(data));
    else
        console.log('MotebusGetHander from=%s, data=%s', from, data);
    if ( data ){
        if ( data.cmd && data.type && typeof cb == 'function' ){
            let cmd = data.cmd;
            let type = data.type;
            if ( type == 'in'){
                if ( cmd == 'reginfo' ){
                    let reginfo = InGetRegInfo();
                    let reply = {"response":"reginfo","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"data":reginfo};
                    cb(reply);
                }
                else if ( cmd == 'reset' ) {
                    regtable = [];
                    CallDcenterReset(function(result){
                        //if ( dbg >= 0 ) console.log('motechat:PollDC DCReset result=%s', JSON.stringify(result));
                        console.log('motechat:reset DCReset result=%s', result.ErrMsg);
                        let {ErrCode,ErrMsg} = result;
                        if ( ErrCode == mcerr.MC_OKCODE ){
                            // DC response OK
                            regfunc.dcreset();
                            InStateHandler('mc: Reset');
                        }
                        cb({"response":"reset","ErrCode":ErrCode,"ErrMsg":ErrMsg});
                    });
                }
                else if ( cmd == 'mbping' ){
                    let reply = {"response":"mbping","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                    cb(reply);
                }
            }
        }
        else {
            if ( typeof rcvembmsgcb == 'function' ) {
                rcvembmsgcb( from, data, function(reply){
                    if ( typeof cb == 'function' ) cb(reply);
                } );
            }
        }
    }
}

var InGetRegInfo = function(){
    let edgeinfo = [];
    for ( var i = 0; i < edgetable.length; i++ ){
        let {EiName,DDN,SToken,EiUMMA} = edgetable[i];
        edgeinfo.push({"EiName":EiName,"DDN":DDN,"SToken":SToken,"MMA":EiUMMA});
    }
    return edgeinfo;
}

var McRcvInFunc = function(data, isweb, cb){
    var data, cmd, option, result, err;
    try {
        if ( dbg >= 1 ) console.log('McRcvInFunc %s', JSON.stringify(data));
        cmd = data.cmd;
        option = data.option;
        if (cmd){
            cmd = cmd.toLowerCase();
            if (option) option = option.toLowerCase();
            //var stime = ins.CurrentTime();
            //stime = stime.substr(stime.indexOf(' ')+1);
            var stime = new Date();
            var trace, stamp;
            switch(cmd){
                case 'ping':
                    if ( !isweb ) {
                        if ( dbg >= 1 ) console.log('McRcvInFunc data=%s', JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mbusmma,"time":stime});
                                stamp = trace;
                            }
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        if ( typeof cb == 'function' ) cb(result);
                        return true;
                    }
                    else {
                        return false;
                    }
                    break;
                case 'trace':
                    if ( !isweb ) {
                        if ( dbg >= 1 ) console.log('McRcvInFunc data=%s', JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mbusmma,"time":stime});
                                stamp = trace;
                            }
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        if ( typeof cb == 'function' ) cb(result);
                        return true;
                    }
                    else {
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mbusmma,"time":stime});
                                data.trace = trace;
                            }
                        }
                        return false;
                    }
                    break;
                case 'tracedc':
                    if ( !isweb ) {
                        if ( dbg >= 1 ) console.log('McRcvInFunc data=%s', JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            stamp = trace;
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        if ( typeof cb == 'function' ) cb(result);
                        return true;
                    }
                    else {
                        return false;
                    }
                    break;
                default:
                    break;
            }
        }
        result = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
    }
    catch(e){
        result = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
    }
    if ( typeof cb == 'function' ) cb(result);
    console.log('McRcvInFunc err: %s', JSON.stringify(err));
    return true;
}

/*
var ChkEdgeInfo = function(stoken){
    var iret = -1;
    if ( edgetable.length > 0 ){
        for ( var i = 0; i < edgetable.length; i++ ){
            if ( edgetable[i].SToken == stoken ){
                iret = i;
                break;
            }    
        }
    }
    return iret;   
}
*/

var NewEdgeInfo = function(stoken, appkey, eitoken, eiumma, eiuport, wip, lip, web, ei){
    var info = {"SToken":stoken,"AppKey":appkey,"EiToken":eitoken,"EiUMMA":eiumma,"EiUPort":eiuport,"WIP":wip,"LIP":lip,
    "EiMMA":ei.EiMMA,"DDN":ei.DDN,"EiOwner":ei.EiOwner,"EiName":ei.EiName,"EiType":ei.EiType,"EiTag":ei.EiTag,
    "UToken":ei.UToken,"Uid":ei.Uid,"UserName":ei.UserName,"NickName":ei.NickName,"MobileNo":ei.MobileNo,"Sex":ei.Sex,
    "EmailVerified":ei.EmailVerified,"MobileVerified":ei.MobileVerified,"TimeStamp":new Date(),"Web":web,"State":""};
    return info;
}

var UpdateEdgeInfo = function(info){
    try {
        if ( dbg >= 1 )console.log('motechat:UpdateEdgeInfo info=%s', JSON.stringify(info));
        let stoken = info.SToken;
        if ( stoken ){
            let edge = GetEdgeInfo('stoken', stoken, 'reg');
            if ( edge == null ){
                info.State = 'reg';
                edgetable.push(info);
            }
            else {
                edge.EiMMA = info.EiMMA ? info.EiMMA : '';
                edge.EiOwner = info.EiOwner ? info.EiOwner : '';
                edge.EiName = info.EiName ? info.EiName : '';
                edge.EiType = info.EiType ? info.EiType : '';
                edge.EiTag = info.EiTag ? info.EiTag : '';
                edge.UToken = info.UToken ? info.UToken : '';
                edge.Uid = info.Uid ? info.Uid : '';
                edge.UserName = info.UserName ? info.UserName : '';
                edge.NickName = info.NickName ? info.NickName : '';
                edge.Sex = info.Sex ? info.Sex : "";
                edge.EmailVerified = info.EmailVerified ? info.EmailVerified : false;
                edge.MobileVerified = info.MobileVerified ? info.MobileVerified : false;
                edge.TimeStamp = new Date();
            }
        }
        else {
            console.log('motechat:UpdateEdgeInfo error=SToken or DDN error');
        }
    }
    catch(err){
        console.log('motechat:UpdateEdgeInfo error=%s', err.message);
    }
}

var UpdateEdgeSetInfo = function(info){
    try {
        if ( dbg >= 1 ) console.log('motechat:UpdateEdgeSetInfo info=%s', JSON.stringify(info));
        let stoken = info.SToken;
        if ( stoken ){
            let edge = GetEdgeInfo('stoken', stoken, 'reg');
            if ( edge ) {
                //edge.EiMMA = info.EiMMA ? info.EiMMA : '';
                edge.EiOwner = info.EiOwner ? info.EiOwner : '';
                edge.EiName = info.EiName ? info.EiName : '';
                edge.EiType = info.EiType ? info.EiType : '';
                edge.EiTag = info.EiTag ? info.EiTag : '';
                edge.EiLoc = info.EiLoc ? info.EiLoc : '';
                edge.TimeStamp = new Date();
                //console.log('motechat:UpdateEdgeSetInfo edge=%s', JSON.stringify(edge));
            }
        }
        else {
            console.log('motechat:UpdateEdgeSetInfo error=SToken error');
        }
    }
    catch(err){
        console.log('motechat:UpdateEdgeSetInfo error=%s', err.message);
    }
}

var RemoveEdgeInfo = function(skey){
    var ret = null;
    for ( var i = 0; i < edgetable.length; i++ ){
        let {SToken,State} = edgetable[i];
        if ( SToken == skey && State == 'unreg' ){
            ret = {"SToken":SToken,"DDN":edgetable[i].DDN,"EiName":edgetable[i].EiName};
            edgetable.splice(i,1);
            console.log('motechat:remove edge=%s', JSON.stringify(ret));
            return ret;
        }
    }
    return ret;
}

exports.GetEdgeInfo = function(ddn){
    return GetEdgeInfo('ddn', ddn, 'reg');
}

// GetEdgeInfo: get the edge information by stoken or ddn
var GetEdgeInfo = function(stype, skey, state){
    var atype = stype;
    var stoken, ddn;
    if ( atype != '' ) atype = atype.toLowerCase();
    if ( dbg >= 2 ) console.log('motechat:GetEdgeInfo stype=%s,skey=%s', stype, skey);
    //console.log('GetEdgeInfo edgetable=%s', JSON.stringify(edgetable));
    for ( var i = 0; i < edgetable.length; i++ ){
        if ( atype == 'stoken' ){
            let {SToken,State} = edgetable[i];
            if ( state ){
                if ( skey == SToken && state == State ) return edgetable[i];
            }
            else {
                if ( skey == SToken ) return edgetable[i];
            }
        }
        else if ( atype == 'ddn' ){
            let {DDN,State} = edgetable[i];
            if ( state ){
                if ( skey == DDN && state == State ) return edgetable[i];
            }
            else {
                if ( skey == DDN ) return edgetable[i];
            }
        }
    }
    return null;
}

// FindEdgeInfo: get the DDN list by search key
var FindEdgeInfo = function(stype, skey){
    var atype = stype;
    var darr = [];
    if ( atype == '' || skey == '' ) return darr;
    else {
        var stoken, ddn, owner, ename, etype, etag;
        var info;
        atype = atype.toLowerCase();
        if ( dbg >= 2 ) console.log('motechat:FindEdgeInfo edgetable=%s', JSON.stringify(edgetable));
        for ( var i = 0; i < edgetable.length; i++ ){
            info = edgetable[i];
            if ( atype == 'stoken' ){
                stoken = info.SToken;
                if ( skey == stoken ){
                    darr.push({"DDN":info.DDN,"Web":info.Web});
                    break;
                }
            }
            else if ( atype == 'ddn' ){
                ddn = info.DDN;
                if ( skey == ddn ){
                    darr.push({"DDN":ddn,"Web":info.Web});
                }
            }
            else if ( atype == 'owner' ){
                owner = info.EiOwner != null ? info.EiOwner : '';
                if ( skey == owner )
                    darr.push({"DDN":info.DDN,"Web":info.Web});
            }
            else {
                stoken = info.SToken;
                if ( info.DDN ) ddn = info.DDN;
                else ddn = '';
                if ( info.EiOwner ) owner = info.EiOwner;
                else owner = '';
                if ( info.EiName ) ename = info.EiName;
                else ename = '';
                if ( info.EiType ) etype = info.EiType;
                else etype = '';
                if ( info.EiTag ) etag = info.EiTag;
                else etag = '';
                if ( ename != '' ) ename = ename.toLowerCase();
                if ( etype != '' ) etype = etype.toLowerCase();
                if ( etag != '' ) etag = etag.toLowerCase();
                if ( skey == stoken || skey == ddn || skey == owner || skey.toLowerCase() == ename || skey.toLowerCase() == etype || (etag != '' && etag.indexOf(skey.toLowerCase())) >= 0){
                    darr.push({"DDN":info.DDN,"Web":info.Web});
                }
            }
        }
    }
    return darr;
}

var HandleUserInfo = function( func, stoken, reply ){
    if ( dbg >= 1 ){
        if ( typeof reply == 'object' )
            console.log('motechat: HandleUserInfo func=%s,stoken=%s,reply=%s', func, stoken, JSON.stringify(reply));
        else
            console.log('motechat: HandleUserInfo func=%s,stoken=%s,reply=%s', func, stoken, reply);
    }
    if ( func == 'ucLogin' ){
        if ( reply.Uid ) UpdateUserInfo( stoken, reply );
        else console.log('motechat: HandleUserInfo error=%s', JSON.stringify(reply));
    }
    else if ( func == 'ucLogout' ){
        if ( reply == true ) ClearUserInfo(stoken);
    }
}

var UpdateUserInfo = function(stoken, info){
    try {
        if ( dbg >= 1 )console.log('motechat:UpdateUserInfo info=%s', JSON.stringify(info));
        let edge = GetEdgeInfo('stoken', stoken, 'reg');
        if ( edge ) {
            edge.UToken = info.UToken ? info.UToken : '';
            edge.Uid = info.Uid ? info.Uid : '';
            edge.UserName = info.UserName ? info.UserName : '';
            edge.NickName = info.NickName ? info.NickName : '';
            edge.Sex = info.Sex ? info.Sex : '';
            edge.EmailVerified = info.EmailVerified ? info.EmailVerified : '';
            edge.MobileVerified = info.MobileVerified ? info.MobileVerified : '';
            edge.TimeStamp = new Date();
        }
    }
    catch(err){
        console.log('motechat:UpdateUserInfo error=%s', err.message);
    }    
}

var ClearUserInfo = function(stoken){
    try {
        let edge = GetEdgeInfo('stoken', stoken, 'reg');
        if ( edge ){
            edge.UToken = '';
            edge.Uid = '';
            edge.UserName = '';
            edge.NickName = '';
            edge.Sex = -1;
            edge.EmailVerified = false;
            edge.MobileVerified = false;
            edge.TimeStamp = new Date();
        }
    }
    catch(err){
        console.log('motechat:UpdateUserInfo error=%s', err.message);
    }    
}

var MoteErrHandler = function(func, err, SToken){
    console.log('motechat:MoteErr func=%s, err=%s', func, err);
    let edge = GetEdgeInfo('stoken', SToken, 'reg');
    if ( edge ){
        let {DDN} = edge;
        InStateHandler(func + ': ' + err, DDN);
    }
}

var StartWDtimer = function(){
    StopWDtimer();
    if ( dcenter != '' ){
        //PollDC();
        var tm = wdInterval + Math.floor((Math.random() * 10) + 1) * 500;
        console.log('startWDtimer: interval=%d',tm);
        wdtimer = setInterval(function(){
            if ( dcState ) PollDC();
        }, tm);
    }
}

var StopWDtimer = function(){
    if ( wdtimer ) clearInterval(wdtimer);
}


var PollDC = function(){
    if ( dcenter ){
        ins.CallXrpc( dcenter, 'poll', 'poll', null, null, function(reply){
            if ( dbg >= 1 ) console.log('--!!motechat: PollDC reply=%s', JSON.stringify(reply));
            if ( reply.ErrCode == mcerr.MC_OKCODE ){
                // Check if need sync reg
                if ( reply.result ){
                    if ( edgetable.length > 0 && reply.result.length == 0 ){
                        InStateHandler(DC_ReStart_StateMSG);
                        regfunc.dcreset();
                    }
                    else if ( edgetable.length != reply.result.length ){
                        console.log('motechat:PollDC reginfo different: ei=%d dc=%d', edgetable.length, reply.result.length);
                        console.log('motechat:PollDC reginfo different: ei=%s', JSON.stringify(edgetable));
                        dcState = '';
                        CallDcenterReset(function(result){
                            //if ( dbg >= 0 ) console.log('motechat:PollDC DCReset result=%s', JSON.stringify(result));
                            if ( result.ErrCode == mcerr.MC_OKCODE ){
                                // DC response OK
                                regfunc.dcreset();
                            }
                            else {
                                console.log('motechat:PollDC DCReset result=%s', JSON.stringify(result));
                            }
                        });
                    }
                }
            }
            else {
                console.log('motechat PollDC: reply=%s', JSON.stringify(reply));
                var comment = reply.MMA ? '(' + reply.MMA + ')' : '';
                ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"action":"Heartbeat","result": reply.ErrMsg, "info": comment});
            }
        });
    }
}

var waitMiniSec = function(ms){
    if ( ms ){
        return new Promise(function(resolve){
            setTimeout(function(){
                resolve(true);
            }, ms);
        });
    }
    return false;
}

var MotechatService = {
    "mbecho": function(head, body){
        console.log("%s xrpc echo: body=%s", ins.CurrentTime(), JSON.stringify(body));
        if ( body.data )
            return body.data;
        else
            return body;
    }
}


