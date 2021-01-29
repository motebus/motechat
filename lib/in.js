// in: module for in layer (motebus)
// Date: 2021/01/04
// Version: 2.2.8
// Update: add timer for no response
//         remove no response
//         add msgid at error
//         issue motebus restart when SysError
//         remove ioc sending queue

const EventEmitter = require('events')
const inerr = require('./mcerr.js')
let DefaultXmsgTimeout = 6
let DefaultXrpcTimeout = 6
let DefaultWaitTimeout = 12
let dbg = 0
let iocsdq = [];
let useiocq = false

const IOCQLength = 30;
const MaxIOCDelayTime = 6000;
const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const ver = '2.2.8';
const update = '2021/01/04'

console.log('-%s info: version=%s update=%s', CurrentTime(), ver, update);

class mbStack extends EventEmitter {
    constructor(){
        super();
        this.motebus = null
        this.state = ''
        this.xmsg = null
        this.xrpc = null
        this.conf = null
        this.xstorage = null
        this.iocmma = ''
        this.waitstate = null
        this.MaxDataSize = 20000
        this.cbfunc = {"msg":null,"event":null,"mbmsg":null,"sys":null}
    }
    async Create(conf){
        //console.log('-%s create conf=%s', CurrentTime(), JSON.stringify(conf))
        this.conf = conf;
        let {AppName,MotebusGW,MotebusPort,WatchLevel} = conf
        this.iocmma = conf.IOC ? conf.IOC : '';
        this.motebus = require('motebus')
        .on('ready', () => {
            if (dbg >= 1) console.log('-%s info: motebus %s Ready', CurrentTime(), this.conf.AppName)
            this.state = 'ready'
            this.emit('motebus.state', this.state);
        })
        .on('off', () => {
            if (dbg >= 1) console.log('-%s info: motebus %s Off', CurrentTime(), this.conf.AppName)
            this.state = 'off'
            this.emit('motebus.state', this.state);
        })
        mbusStartup(this.motebus,MotebusGW,MotebusPort,AppName)
        if (WatchLevel) dbg = WatchLevel
        if (dbg >= 2) console.log('-%s info: watchlevel %d', CurrentTime(), dbg)
        return this.motebus;
    }
    async MbusInfo(){
        let reply = await mbusGetInfo(this.motebus)
        return reply;
    }
    Open(){
        return new Promise((resolve) => {
            let ot = setTimeout(() => {
                resolve('Xmsg Open Timeout')
            }, 10000)
            this.xmsg = this.motebus.xMsg()
            let {AppName} = this.conf;
            //console.log('-%s MoteBus AppName=%s', CurrentTime(), AppName)
            if ( AppName ){
                this.xmsg.open( AppName, 'zaq1234', false, (err, result) => {
                    clearTimeout(ot)
                    if ( err ){
                        console.log('-%s error: Open xmsgr=%s', CurrentTime(), err.message);
                        this.state = 'openfail'
                        this.emit('motebus.state', this.state);
                        resolve(this.state);
                    }
                    if ( result ){
                        if (dbg >= 1) console.log('-%s info: Open xmsg %s', CurrentTime(), result);
                        this.xrpc = this.motebus.xRPC();
                        if (dbg >= 2) console.log('-%s info: Open xrpc', CurrentTime());
                        this.state = 'open';
                        this.emit('motebus.state', this.state);
                        if ( typeof this.waitstate == 'function' ) this.waitstate(this.state)
                        //mbusGetInfo(this.motebus)
                        this.xstorage = this.motebus.xSTORAGE();
                        this.xmsg.on('message', async (msg) => {
                            if (dbg == 1) console.log('-%s info: Xmsg on message from=%s', CurrentTime(), msg.head.from)
                            else if (dbg >= 3) console.log('-%s info: Xmsg on message from=%s %s', CurrentTime(), msg.head.from, JSON.stringify(msg))
                            //console.log('-%s Xmsg on message msg=%s', CurrentTime(),JSON.stringify(msg))
                            let cbfunc = this.cbfunc
                            if (typeof msg.body.type == 'string'){
                                if (typeof cbfunc.sys == 'function') cbfunc.sys(msg, async (reply) => {
                                    if (dbg >= 3) console.log('-%s info: Xmsg reply to=%s %s', CurrentTime(), msg.head.from, JSON.stringify(reply))
                                    let result = await replyxmsg(this, msg.head, reply, DefaultXmsgTimeout)
                                    if (dbg == 1) console.log('-%s info: Xmsg reply to=%s result %s', CurrentTime(), msg.head.from, result.ErrMsg)
                                })
                            }
                            else {
                                if (typeof cbfunc.msg == 'function'){
                                    DispatchMsg(cbfunc, msg, async (reply) => {
                                        if (dbg >= 3) console.log('-%s info: Xmsg reply to=%s %s', CurrentTime(), msg.head.from, JSON.stringify(reply))
                                        let result = await replyxmsg(this, msg.head, reply, DefaultXmsgTimeout)
                                        if (dbg == 1) console.log('-%s info: Xmsg reply to=%s result %s', CurrentTime(), msg.head.from, result.ErrMsg)
                                    })    
                                }
                                else {
                                    let reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"No listen app"}
                                    let result = await replyxmsg(this, msg.head, reply, DefaultXmsgTimeout)
                                    if (dbg >= 0) console.log('-%s error: to=%s xmsg reply result %s', CurrentTime(), msg.head.from, result.ErrMsg)
                                }    
                            }
                        })
                        resolve(this.state);
                    }
                    else {
                        console.log('-%s info: Open xmsg: fail', CurrentTime());
                        resolve('fail');
                    }
                })    
            }
            else {
                resolve('Invalid AppName');
            }
        })
    }
    InMessage(stype, handler){
        //if (dbg >= 2) console.log('-%s info: InMessage stype=%s typeof handler=%s', CurrentTime(), stype, typeof handler)
        if ( stype == 'message' && typeof handler == 'function' ){
            //console.log('-%s info: InMessage message', CurrentTime())
            this.cbfunc.msg = handler;
            return true;
        }
        else if ( stype == 'event' && typeof handler == 'function' ){
            this.cbfunc.event = handler;
            return true;
        }
        else if ( stype == 'mbus' && typeof handler == 'function' ){
            this.cbfunc.mbmsg = handler;
            return true;
        }
        return false;
    }
    async PublishXrpc(pubapp, func, cb){
        let pubret = await publishxrpc(this.xrpc, pubapp, func)
        if ( typeof cb == 'function') cb(pubret);
        else return pubret
    }    
    async IsolatedXrpc(func, cb){
        let isoret = await isolatedxrpc(this.xrpc, func)
        if ( typeof cb == 'function') cb(isoret);
        else return isoret
    }
    async CallXrpc(mma, func, args, timeout, waitreply){
        if ( this.xrpc && this.state == 'open'){
            let reply = await callxrpc(this, mma, func, args, timeout, waitreply);
            return reply;    
        }
        else return {"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg}
    }
    async SendXmsg(mma, body, timeout, waitreply){
        if ( this.xmsg && this.state == 'open'){
            let reply = await sendxmsg(this, mma, body, timeout, waitreply);
            return reply;    
        }
        else return {"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg}
    }
    async ReplyXmsg(head, body, timeout){
        if ( this.xmsg && this.state == 'open'){
            let reply = await replyxmsg(this, head, body, timeout);
            return reply;    
        }
        else return {"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg}
    }
    ExtractXmsg(msg, outpath, cb){
        this.xmsg.extract( msg.head.id, outpath, (err,result) => {
            if (err) {
                console.log('-%s error: xmsg.extract %s', CurrentTime(), err.message);
                if (typeof cb == 'function') cb({"ErrCode":err.code,"ErrMsg":err.message})
            } else {
                console.log("-%s info: xmsg.extract(id=%s) result=%s", msg.head.id, result);	
                if (typeof cb == 'function') cb({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG})
            }
        });
    }
    iocEvent(evId, evSource, evType, evClass, evBody){
        if ( this.iocmma && this.state == 'open' ){
            if (useiocq){
                if ( iocsdq.length < IOCQLength ){
                    let ioc = {"evId":evId,"evSource":evSource,"evType":evType,"evClass":evClass,"evBody":evBody};
                    iocsdq.push(ioc);
                    if ( iocsdq.length == 1 ) iocEventHandler(this);
                }
                else if (dbg >= 3) console.log('-%s warn: iocEvent ioc queue overflow', CurrentTime());    
            }
            else {
                sendiocEvent(this, evId, evSource, evType, evClass, evBody), function(result){
                    if (dbg >= 3) console.log('-%s info: iocEvent result=%s', CurrentTime(), result);
                }
            }
        }
    }
    async xStorageFunc(cmd){
        try {
            if ( dbg >= 3 ) console.log('-%s info: xStorageFunc cmd=%s', CurrentTime(), JSON.stringify(cmd));
            let {Topic, Func, Data} = cmd;
            if ( Topic ) Topic = Topic.replace('xs://', '');
            let result = null
            switch(Topic) {
                case 'config':
                    result = await xConfigFunc(this, Func, Data);
                    if ( dbg >= 2 ) console.log('-%s info: xStorageFunc xConfig result=', CurrentTime(), result.ErrMsg);
                    return result
                case 'cached':
                    result = await xCachedFunc(this, Func, Data);
                    if ( dbg >= 2 ) console.log('-%s info: xStorageFunc xCached result=', CurrentTime(), result.ErrMsg);
                    return result
                case 'bucket':
                    result = await xBucketFunc(this, Func, Data);
                    if ( dbg >= 2 ) console.log('-%s info: xStorageFunc xBucket result=', CurrentTime(), result.ErrMsg);
                    return result
                case 'secret':
                    result = await xSecretFunc(this, Func, Data);
                    if ( dbg >= 2 ) console.log('-%s info: xStorageFunc xSecurt result=', CurrentTime(), result.ErrMsg);
                    return result
                default:
                    return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"Topic":Topic}
            }
        }
        catch(e){
            console.log('-%s error: xStorageFunc result=%s', CurrentTime(), e.message);
            return {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message}
        }
    }
    DropXmsg(mma, body, files, timeout, waitreply, cb){
        if ( this.xmsg && this.state == 'open'){
            dropxmsg(this, mma, body, files, timeout, waitreply, cb);    
        }
        else {
            if (typeof cb == 'function'){
                let ret = {"ErrCode":inerr.IN_XRPC_NotOpen,"ErrMsg":inerr.IN_XRPC_NotOpen_Msg}
                cb(ret)    
            }
        }
    }
    setDebug(level){
        if (level) dbg = level
        if ( dbg >= 2 ) console.log('-%s info: setDeg debug=%d', CurrentTime(), dbg);
        return true
    }
    getMaxDataSize(){
        return this.MaxDataSize
    }
    setMaxDataSize(size){
        if (size) this.MaxDataSize = size
        return true
    }
    setIOC(ioc){
        if (ioc) this.iocmma = ioc
        return true
    }
    Restart(){
        mbusRestart(this.motebus)
    }
}

//end of mbStack class

function mbusStartup(mb, gw, gwport, appname){
    let mbusgw = '';
    let mbusport = 0;
    if ( gw ){
        if ( gw.indexOf(':') > 0 ){
            let marr = gw.split(':');
            mbusgw = marr[0].trim();
            mbusport = marr[1].trim();
        }
        else mbusgw = gw
    }
    if (typeof gwport == 'string'){
        if (gwport != '') mbusport = parseInt(gwport)
    }
    else mbusport = gwport

    if ( dbg >= 0 ) console.log('-%s info: mbusStartup appname=%s mbusgw=%s mbusport=%d', CurrentTime(), appname, mbusgw, mbusport);
    mb.startUp(mbusgw, mbusport, appname);
}

function mbusRestart(mb){
    mb.restart()
}

function mbusGetInfo(mb){
    return new Promise((resolve) => {
        try {
            mb.getInfo()
            .then(function(result){
                if (dbg >= 3) console.log("-%s info: mbus.getInfo result=%s", CurrentTime(), JSON.stringify(result));
                resolve({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":result});
            })
            .catch(function(err){
                console.log("-%s error: mbus.getInfo result=%s", CurrentTime(), err.message);
                resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message});
            });
        }
        catch(e){
            resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
        }
    })
}  

function isolatedxrpc(xrpc, func){
    return new Promise((resolve) => {
        try {
            xrpc.isolated( func )
            .then( function(result){
                if (dbg >= 2) console.log('-%s info: isolatedxrpc result=%s', CurrentTime(), result);
                resolve({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Result":result});
            })
            .catch( function(err){
                console.log('-%s error: isolatedxrpc result=%s', CurrentTime(), err.message);
                resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
            });    
        }
        catch(e){
            resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message});
        }
    })
}

function publishxrpc(xrpc, pubapp, func){
    return new Promise((resolve) => {
        if ( pubapp != '' ){
            if (dbg >= 2) console.log( '-%s info: publishxrpc pubapp=%s',CurrentTime(),pubapp );
            xrpc.publish( pubapp, func )
            .then( function(result){
                if (dbg >= 2) console.log('-%s info: publishxrpc result=%s',CurrentTime(),result);
                resolve({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG});
            })
            .catch( function(err){
                console.log('-%s error: publishxrpc result=%s',CurrentTime(), err.message);
                resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"in: " + err.message});
            });
        }
        else {
            resolve({"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg})
        }    
    })
}

function callxrpc(mb, mma, func, args, timeout, waitreply){
    //if ( dbg >= 1 && args.to ) console.log('-%s callxprc to:%s', CurrentTime(), JSON.stringify(args.to));
    //console.log( '-%s callxrpc mma=%s func=%s args=%s', CurrentTime(), mma, func, JSON.stringify(args));
    //let str = JSON.stringify(args)
    let xrpc = mb.xrpc
    if ( dbg >= 2 ) console.log('-%s info: callxrpc mma=%s,func=%s', CurrentTime(), mma, func);
    else if ( dbg >= 3 ) console.log('-%s info: callxrpc args=%s', CurrentTime(), JSON.stringify(args));
    //if (str.length > this.MaxDataSize) {
    //    if ( dbg >= 2 ) console.log('-%s callxrpc to=%s func=%s datasize=%d', CurrentTime(), mma, func, str.length);
    //    return {"ErrCode":inerr.IN_DataOverSize,"ErrMsg":inerr.IN_DataOverSize_Msg,"Info":{"MMA":mma,"Func":func,"Size":str.length}}
    //}
    return new Promise((resolve) => {
        let t1 = ( timeout == null )? DefaultXrpcTimeout : timeout;
        let t2 = ( waitreply == null )? DefaultWaitTimeout: waitreply;
        try {
            //if ( dbg >= 2 ) console.log( '-%s callxrpc mma=%s func=%s args=%s', CurrentTime(), mma, func, JSON.stringify(args));
            xrpc.call( mma, func, args, 10/*Prio*/, t1, t2 )
            .then((result)=>{
                if ( dbg >= 3 ) console.log( '-%s info: callxrpc result=%s', CurrentTime(), JSON.stringify(result));
                resolve({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Reply":result,"UseTime":0});
            })
            .catch((err)=>{
                console.log( '-%s eror: callxrpc mma=%s result=%s t1=%d t2=%d', CurrentTime(), mma, err.message, t1, t2);
                resolve({"ErrCode":err.code,"ErrMsg":err.message,"Info":{"MMA":mma,"Func":func},"UseTime":0});
                if (err.message == 'System error') {
                    mbusRestart(mb.motebus)
                    mb.emit('motebus.state', 'system error')
                }
            });
        }
        catch(e){
            console.log( '-%s error: callxrpc to=%s result=%s', CurrentTime(), mma, e.message);
            resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message,"Info":{"MMA":mma,"Func":func},"UseTime":0});
        }    
    })
}

function sendxmsg(mb, mma, body, timeout, waitreply){
    //let str = JSON.stringify(body)
    let xmsg = mb.xmsg
    if ( dbg >= 2 ) console.log('-%s info: sendxmsg mma=%s', CurrentTime(), mma);
    else if ( dbg >= 3 ) console.log('-%s info: sendxmsg body=%s', CurrentTime(), JSON.stringify(body));
    //if (str.length > this.MaxDataSize) {
    //    if ( dbg >= 2 ) console.log('-%s sendxmsg to=%s datasize=%d', CurrentTime(), mma, str.length);
    //    return {"IN":{"ErrCode":inerr.IN_DataOverSize,"ErrMsg":inerr.IN_DataOverSize_Msg,"State":"OverSize","Info":{"MMA":mma,"Size":str.length}}}
    //}
    return new Promise((resolve) => {
        let t1 = ( timeout == null )? DefaultXrpcTimeout : timeout;
        let t2 = ( waitreply == null )? DefaultWaitTimeout: waitreply;
        try {
            xmsg.send(mma, body, [], 10/*Prio*/, t1, t2, (err, tkinfo) => {
                if (err) {
                    //console.error(err);
                    console.log('-%s error: sendxmsg to=%s result=%s', CurrentTime(), mma, err.message);
                    resolve({"IN":{"ErrCode":err.code,"ErrMsg":err.message,"State":err.message,"UseTime":0,"Info":{"MMA":mma}}});
                }
                else {
                    let state = tkinfo.state;
                    let msgid = tkinfo.id
                    if ( dbg >= 3 ) console.log("-%s info: sendxmsg tkinfo(send) state=%s msgid=[%s]", CurrentTime(), state, msgid);
                    if (state != 'Reply') {
                        //console.log("Send Message: tkinfo(send) id=%s, state=%s", tkinfo.id, tkinfo.state);
                        if ( t2 == 0 && state == 'Read') {
                            if ( dbg >= 2 ) console.log("-%s info: sendxmsg to=%s state=%s msgid=[%s]", CurrentTime(), mma, state, msgid);
                            resolve( {"IN":{"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Msgid":msgid,"rMsgid":"","Replyid":"","State":state,"UseTime":0}} );
                        }
                        else if ( state != 'Sent' && state != 'Read' && state != 'End') {
                            if ( dbg >= 0 ) console.log("-%s error: sendxmsg to=%s state=%s msgid=[%s] t1=%d t2=%d", CurrentTime(), mma, state, msgid, t1, t2);
                            let errmsg = getSendError(state)
                            resolve( {"IN":{"ErrCode":inerr.IN_ERRCODE,"ErrMsg":errmsg,"Msgid":msgid,"rMsgid":"","Replyid":"","State":state,"UseTime":0}} );
                            if (state == 'SysError' ) {
                                mbusRestart(mb.motebus)
                                mb.emit('motebus.state', 'system error')
                            }
                        }
                    }
                    else {
                        let {head,body} = tkinfo.msg;
                        let rmsgid = head.id
                        let replyid = head.replyID
                        //console.log('-%s sendxmsg reply head=%s', CurrentTime(), JSON.stringify(head));
                        if (body){
                            //if ( dbg >= 0) console.log("-%s sendxmsg to=%s OK msgid=[%s]", CurrentTime(), mma, msgid);
                            if ( dbg >= 2 ) console.log("-%s info: sendxmsg reply from=%s msgid=[%s] rmsgid=[%s] replyid=[%s] OK", CurrentTime(), JSON.stringify(head.from), msgid, rmsgid, replyid );
                            if ( dbg >= 3 ) console.log("-%s info: sendxmsg reply body=%s", CurrentTime(), JSON.stringify(body) );
                            //console.log("-%s sendxmsg Reply body: %s", CurrentTime(), JSON.stringify(body) );
                            resolve( {"IN":{"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Msgid":msgid,"rMsgid":rmsgid,"Replyid":replyid,"State":state,"UseTime":0},"Result":body} );
                        }
                        else resolve( {"IN":{"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"Reply error","Msgid":msgid,"rMsgid":rmsgid,"Replyid":replyid,"State":"ReplyError","UseTime":0}} );
                    }
                }
            })
        }
        catch(e){
            console.log( '-%s error: sendxmsg to=%s, result=%s', CurrentTime(), mma, e.message);
            resolve({"IN":{"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message,"State":"Error","UseTime":0,"Info":{"MMA":mma}}});
        }
    })
}

function replyxmsg(mb, head, body, timeout){
    let xmsg = mb.xmsg
    //if ( dbg >= 2 ) console.log('-%s info: replyxmsg to=%s', CurrentTime(), head.from);
    //let str = JSON.stringify(body)
    if ( dbg >= 3 ) console.log('-%s info: replyxmsg body=%s', CurrentTime(), JSON.stringify(body));
    //if (str.length > this.MaxDataSize) {
    //    if ( dbg >= 2 ) console.log('-%s replyxmsg to=%s datasize=%d', CurrentTime(), mma, str.length);
    //    return {"ErrCode":inerr.IN_DataOverSize,"ErrMsg":inerr.IN_DataOverSize_Msg,"State":"OverSize","Size":str.length}
    //}
    return new Promise((resolve) => {
        let t1 = ( timeout == null )? DefaultXrpcTimeout : timeout;
        try {
            xmsg.reply( head, body, [], 10/*Prio*/, t1, 0, 
                function(err, tkinfo) {
                    if (err) {
                        console.log("-%s error: replyxmsg: to=%s msg=%s", CurrentTime(), head.from, err.message);
                        resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":err.message,"State":err.message,"Info":{"MMA":head.from}});
                    } else {
                        let state = tkinfo.state;
                        let msgid = tkinfo.id
                        //if ( dbg >= 2 ) console.log("-%s replyxmsg: to=%s state=%s", CurrentTime(), head.from, state);
                        if ( state != 'Sent' && state != 'Read' && state != 'End') {
                            if ( dbg >= 0 ) console.log("-%s info: replyxmsg: to=%s state=%s msgid=%s t1=%d", CurrentTime(), head.from, state, msgid, t1);
                            let errmsg = getSendError(state)
                            resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":errmsg,"State":state,"Info":{"MMA":head.from}});
                            if (state == 'SysError') {
                                mbusRestart(mb.motebus)
                                mb.emit('motebus.state', 'system error')
                            }
                        }
                        else if ( state == 'Read') {
                            if ( dbg >= 2 ) console.log("-%s info: replyxmsg: to=%s state=%s msgid=%s", CurrentTime(), head.from, state, msgid);
                            resolve({"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"State":state});
                        }
                    }
                }
            );
        }
        catch(e){
            console.log( '-%s error: replyxmsg to=%s, msg=%s', CurrentTime(), head.from, e.message);
            resolve({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.emssage,"State":"Error"});
        }
    })
}

function dropxmsg(mb, mma, body, files, timeout, waitreply, cb){
    let xmsg = mb.xmsg
    if (xmsg && mma && body && files){
        let t1 = (timeout == null)? DefaultXrpcTimeout : timeout
        let t2 = (waitreply == null)? DefaultWaitTimeout : waitreply
        try {
            let ts = new Date()
            xmsg.send(mma, body, files, 10/*Prio*/, t1, t2, (err, tkinfo) => {
                if (err) {
                    //console.error(err);
                    console.log('-%s error: dropxmsg to=%s msg=%s', CurrentTime(), mma, JSON.stringify(err));
                    if (typeof cb == 'function') cb({"ErrCode":err.code,"ErrMsg":err.message,"State":"Error"},"");
                }
                else {
                    let state = tkinfo.state;
                    let msgid = tkinfo.id
                    if ( dbg >= 2 ) console.log("-%s info: dropxmsg tkinfo(send) state=%s msgid=[%s]", CurrentTime(), state, msgid);
                    if (state != 'Reply') {
                        //console.log("dropxmsg: tkinfo(send) id=%s, state=%s", tkinfo.id, tkinfo.state);
                        if ( t2 == 0 && state == 'Read') {
                            let nt = new Date()
                            let diff = (nt.getTime() - ts.getTime())/1000
                            if ( dbg >= 2 ) console.log("-%s info: dropxmsg to=%s state=%s msgid=[%s]", CurrentTime(), mma, state, msgid);
                            if (typeof cb == 'function') cb( "", {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Msgid":msgid,"rMsgid":"","Replyid":"","State":state,"UseTime":diff});
                        }
                        else if ( state != 'Sent' && state != 'Read' && state != 'End') {
                            if ( dbg >= 2 ) console.log("-%s error: dropxmsg to=%s state=%s msgid=[%s] t1=%d t2=%d", CurrentTime(), mma, state, msgid, t1, t2);
                            let errmsg = getSendError(state)
                            let nt = new Date()
                            let diff = (nt.getTime() - ts.getTime())/1000
                            if (typeof cb == 'function') cb( {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":errmsg,"Msgid":msgid,"rMsgid":"","Replyid":"","State":state,"UseTime":diff}, "");
                            if (state == 'SysError' ) {
                                mbusRestart(mb.motebus)
                                mb.emit('motebus.state', 'system error')
                            }
                        }
                    }
                    else {
                        let {head,body} = tkinfo.msg;
                        let rmsgid = head.id
                        let replyid = head.replyID
                        let nt = new Date()
                        let diff = (nt.getTime() - ts.getTime())/1000
                        //console.log('-%s dropxmsg reply head=%s', CurrentTime(), JSON.stringify(head));
                        if (body){
                            //if ( dbg >= 0) console.log("-%s dropxmsg to=%s OK msgid=[%s]", CurrentTime(), mma, msgid);
                            if ( dbg >= 2 ) console.log("-%s info: dropxmsg reply from=%s msgid=[%s] rmsgid=[%s] replyid=[%s] OK", CurrentTime(), JSON.stringify(head.from), msgid, rmsgid, replyid );
                            if ( dbg >= 3 ) console.log("-%s info: dropxmsg reply body=%s", CurrentTime(), JSON.stringify(body) );
                            //console.log("-%s dropxmsg Reply body: %s", CurrentTime(), JSON.stringify(body) );
                            if (typeof cb == 'function') cb( "", {"IN":{"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"Msgid":msgid,"rMsgid":rmsgid,"Replyid":replyid,"State":state,"UseTime":diff},"Result":body} );
                        }
                        else if (typeof cb == 'function') cb( {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"Reply error","Msgid":msgid,"rMsgid":rmsgid,"Replyid":replyid,"State":"ReplyError","UseTime":diff}, "");
                    }
                }
            })
        }
        catch(e){
            console.log( '-%s error: dropxmsg %s, msg=%s', CurrentTime(), mma, e.message);
            if (typeof cb == 'function') cb({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":e.message,"State":"Error"}, "");
        }
    }
    else {
        if (typeof cb == 'function'){
            cb({"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"State":"Error"}, "")
        }
    }
}

function getSendError(state){
    let ret = ''
    switch(state){
        case 'Timeout':
            ret = 'Timeout'
            break;
        case 'SysError':
            ret = 'System Error'
            break;
        case 'SvrNotFound':
            ret = 'Host not found'
            break;
        case 'AddrNotFound':
            ret = 'Addr not found'
            break;
        default:
            ret = 'Undefined error'
            break;
    }
    return ret
}

function DispatchMsg(mbfunc, msg, cb){
    if (dbg >= 3) console.log("-%s info: dispatchMsg msg=%s", CurrentTime(), JSON.stringify(msg))
    if (msg){
        let {head,body} = msg
        if (body){
            if (typeof body.in != 'undefined' || typeof body.type != 'undefined'){
                // motechat mesage
                if (typeof mbfunc.msg == 'function') {
                    if (dbg >= 3) console.log("-%s info: dispatchMsg from=%s", CurrentTime(), JSON.stringify(head.from))
                    mbfunc.msg(msg, (reply) => {
                        if (typeof cb == 'function') cb(reply)
                    })
                }
                else {
                    if (dbg >= 2) console.log('-%s error: dispatchMsg: callback is not function', CurrentTime())
                    if (typeof cb == 'function'){
                        cb ({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"no listen app"})
                    }
                }
            }
            else if (body.eventType){
                // event message
                if (typeof mbfunc.event == 'function'){
                    if (dbg >= 2) console.log("-%s info: dispatchMsg event from=%s", CurrentTime(), JSON.stringify(head.from))
                    mbfunc.event('xmsg', head, body)
                }
                else {
                    if (dbg >= 2) console.log('-%s error: dispatchMsg: event callback is not function', CurrentTime())
                    if (typeof cb == 'function'){
                        cb ({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"no listen app"})
                    }
                }
            }
            else {
                // motebus raw message
                if (typeof mbfunc.mbmsg == 'function') {
                    if (dbg >= 2) console.log("-%s info: dispatchMsg mbusmsg from=%s", CurrentTime(), JSON.stringify(head.from))
                    mbfunc.mbmsg(msg, (reply) => {
                        if (typeof cb == 'function') cb(reply)
                    })
                }
                else {
                    if (dbg >= 2) console.log('-%s error: dispatchMsg: mbmsg callback is not function', CurrentTime())
                    if (typeof cb == 'function'){
                        cb ({"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"no listen app"})
                    }
                }
            }
        }
    }
}

var iocTimer

function iocEventHandler(mb){
    if (iocsdq.length > 0){
        if ( mb.state == 'open'){
            iocTimer = setTimeout(function(){
                iocsdq.splice(0, 1);
                iocEventHandler(mb);
            }, DefaultWaitTimeout*1000);
            let {evId,evSource,evType,evClass,evBody} = iocsdq[0];
            sendiocEvent(mb, evId, evSource, evType, evClass, evBody, function(result){
                clearTimeout(iocTimer)
                if (result == 'AddrNotFound' || result == 'SvrNotFound') iocsdq = []
                else iocsdq.splice(0, 1);
                if (iocsdq.length > 0){
                    let tm = Math.floor((Math.random() * 5) + 1) * 100
                    setTimeout(function(){
                        iocEventHandler(mb);
                    }, tm);
                }
            });
        }
        else iocsdq = [];
    }
}

function sendiocEvent( mb, evId, evSource, evType, evClass, evBody, cb ){
	try {
        let xmsg = mb.xmsg
        let iocmma = mb.iocmma
        let eid;
        if ( evId == '' ) eid = CreateTicket(7);
        else eid = evId;
        let ntime = new Date()
        var evData = {"MsgType":evType,"MsgClass":evClass,"MsgBody":evBody,"MsgTime":ntime};
        if ( dbg >= 3 ) console.log('-%s info: sendiocEvent evdata=%s', CurrentTime(), JSON.stringify(evData));
        var evpack = {"eventType":"com.ypcloud.dc","cloudEventsVersion":"0.1","source":evSource,"eventID":eid,"data":evData};
        if ( dbg >= 3 ) console.log('-%s info: sendiocEvent evpack=%s', CurrentTime(), JSON.stringify(evpack));
        let t1 = DefaultXmsgTimeout;
        xmsg.send(iocmma, evpack, [], 10/*Prio*/, t1, 0, 
            function(err, tkinfo) { 
                if (err) {
                    //console.error(err);
                    console.log('-%s error: sendiocEvent msg=%s, mma=%s', CurrentTime(), JSON.stringify(err), iocmma);
                    if ( typeof cb == 'function' ) cb(err.message);
                }
                else {
                    let state = tkinfo.state;
                    if (state != 'Sent' && state != 'Read' && state != 'End' && state != 'Reply') {
                        if ( dbg >= 2 ) console.log('-%s error: sendiocEvent state=%s', CurrentTime(), state);
                        if ( typeof cb == 'function' ) cb(state);
                    }
                    else if (state == 'Read') {
                        if ( dbg >= 2 ) console.log('-%s info: sendiocEvent state=Read', CurrentTime());
                        if ( typeof cb == 'function' ) cb(state);
                    }
                }
            }
        );
	}
	catch(err){
		console.log('-%s error: sendiocEvent msg=%s', CurrentTime(), err.message);
		if ( typeof cb == 'function' ) cb(err.message);
	}
}

async function xConfigFunc(mb, func, data){
	if ( dbg >= 3 ) console.log('-%s info: xConfigFunc func=%s data=%s', CurrentTime(), func, JSON.stringify(data));
    let xstorage = mb.xstorage
    if (xstorage){
        let payload = null;
        if ( typeof data == 'string' ) payload = JSON.parse(data);
        else payload = data;
        if ( func == 'get' ) {
            let {catalog, idname} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xConfig get catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname ){
                let reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":null,"UseTime":0};
                let ret = await xstorage.getConfig(catalog, idname);
                if ( ret ) reply.result = ret;
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0,"info":func};
            }
        }
        else if ( func == 'set'){
            let {catalog, idname, data} = payload;
            if ( dbg >= 2 ) console.log('-%s info xConfig: set catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname && data ) {
                let reply = null;
                let ret = await xstorage.setConfig(catalog, idname, data);
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"set error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0,"info":func};
            }
        }
        else {
            return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":"func error","UseTime":0};
        }    
    }
    else {
        return {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"motebus.xstorage not ready","UseTime":0};
    }
}

async function xCachedFunc(mb, func, xdata){
	if ( dbg >= 3 ) console.log('-%s info: xCachedFunc func=%s,xdata=%s', CurrentTime(), func, JSON.stringify(xdata));
    let xstorage = mb.xstorage
    if (xstorage){
        let payload = null;
        if ( typeof xdata == 'string' ) payload = JSON.parse(xdata);
        else payload = xdata;
        if ( func == 'get' ) {
            let {catalog, idname} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xCache get catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname ){
                let reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":null,"UseTime":0};
                let ret = await xstorage.getCached(catalog, idname);
                if ( ret ) reply.result = ret;
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else if ( func == 'set'){
            let {catalog, idname, data} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xCache set catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname && data ){
                let reply = null;
                let ret = await xstorage.setCached(catalog, idname, data);
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"set error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else if ( func == 'remove' ){
            let {catalog, idname} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xCache remove catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname ){
                let reply = null;
                let ret = await xstorage.removeCached(catalog, idname);
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"remove error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else if ( func == 'clear' ){
            let {catalog} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xCache clear catalog=%s', CurrentTime(), catalog);
            if ( catalog ){
                let reply = null;
                let ret = await xstorage.clearCached(catalog);
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"clear error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else {
            return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":"func error","UseTime":0};
        }
    }
    else {
        return {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"motebus.xstorage not ready","UseTime":0};
    }
}

async function xBucketFunc(mb, func, xdata){
	if ( dbg >= 3 ) console.log('-%s info: xBucketFunc func=%s,xdata=%s', CurrentTime(), func, JSON.stringify(xdata));
    let xstorage = mb.xstorage
    if (xstorage){
        let payload = null;
        if ( typeof xdata == 'string' ) payload = JSON.parse(xdata);
        else payload = xdata;
        if ( func == 'get' ) {
            let {catalog, idname, datatype} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xBucket get catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname ){
                let reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":null,"UseTime":0};
                let ret = await xstorage.getBucket(catalog, idname);
                if ( ret ) reply.result = ret.toString(datatype);
                if ( dbg >= 2 ) console.log('-%s info: xBuketFunc getBucket result=%s', CurrentTime(), reply.result);
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else if ( func == 'set'){
            let {catalog, idname, data} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xBucket set catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname && data ){
                let reply = null;
                let ret = null;
                //var buf = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 0]);
                //ret = await xstorage.setBucket(catalog, idname, buf);
                
                if ( Buffer.isBuffer(data) )
                    ret = await xstorage.setBucket(catalog, idname, data);
                else {
                    var buf;
                    if ( typeof data == 'object' ) buf = Buffer.from(JSON.stringify(data));
                    else buf = Buffer.from(data);
                    ret = await xstorage.setBucket(catalog, idname, buf);
                }
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"set error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else if ( func == 'list' ){
            let {catalog} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xBucket list catalog=%s', CurrentTime(), catalog);
            if ( catalog ){
                let reply = null;
                let ret = await xstorage.listBucket(catalog);
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":ret,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"list error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else if ( func == 'remove' ){
            let {catalog, idname} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xBucket remove catalog=%s, idname=%s', CurrentTime(), catalog, idname);
            if ( catalog && idname ){
                let reply = null;
                let ret = await xstorage.removeBucket(catalog, idname);
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"remove error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else {
            return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":"func error","UseTime":0};
        }
    }
    else {
        return {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"motebus.xstorage not ready","UseTime":0};
    } 
}

async function xSecretFunc(mb, func, xdata){
	if ( dbg >= 2 ) console.log('-%s info: xSecretFunc func=%s xdata=%s', CurrentTime(), func, JSON.stringify(xdata));
    let xstorage = mb.xstorage
    if (xstorage){
        let payload = null;
        if ( typeof xdata == 'string' ) payload = JSON.parse(xdata);
        else payload = xdata;
        if ( func == 'get' ) {
            let {catalog, idname, password} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xSecret get catalog=%s idname=%s', CurrentTime(), catalog, idname);
            if (catalog && idname && password){
                let reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"result":null,"UseTime":0};
                let ret = await xstorage.getSecret(catalog, idname, password);
                if ( ret ) reply.result = ret;
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else if ( func == 'set'){
            let {catalog, idname, data, password} = payload;
            if ( dbg >= 2 ) console.log('-%s info: xSecret set catalog=%s idname=%s', CurrentTime(), catalog, idname);        
            if ( catalog && idname && data && password ) {
                let reply = null;
                let ret = await xstorage.setSecret(catalog, idname, data, password);
                if ( ret ) reply = {"ErrCode":inerr.IN_OKCODE,"ErrMsg":inerr.IN_OKMSG,"UseTime":0};
                else reply = {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"set error","UseTime":0};
                return reply;
            }
            else {
                return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":inerr.IN_InvalidData_Msg,"UseTime":0};
            }
        }
        else {
            return {"ErrCode":inerr.IN_InvalidData,"ErrMsg":"func error","UseTime":0};
        }
    }
    else {
        return {"ErrCode":inerr.IN_ERRCODE,"ErrMsg":"motebus.xstorage not ready","UseTime":0};
    }
}

function CreateTicket(len) {
    var text = "";
    for (var i = 0; i < len; i++)
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    return text;
}

function CurrentTime(){
    var ret
	var ct = new Date()
	var zzz = ct.getMilliseconds().toString()
	if ( zzz.length == 1 ) zzz = '00' + zzz
    else if ( zzz.length == 2 ) zzz = '0' + zzz
    ret = ct.toLocaleTimeString('en-US', { hour12: false }) + '.' + zzz
    return ret;
}

module.exports = new mbStack();
