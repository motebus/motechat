// motechat module for motechat
// Date: 2020/12/25
// Version: 2.5.8
// Update: 
// Remove the drop function

const EventEmitter = require('events')
const mcerr = require('./mcerr.js');
const mbclass = require('./in.js');
const uc = require('./uc.js');
const mma_mc_prefix = '>';
const target_prefix = '>>';
const mma_raw_prefix = '>>>';
const motechat_prefix = '>>sys';
const uc_prefix = '>>uc';
const uc_prefix2 = '>>UC';
const adv_mma_raw_prefix = 'mbus/';
const adv_mma_mc_prefix = 'mma/';
const adv_ddn_prefix = 'ddn/';
const adv_sys_prefix = 'sys/'
const DC_ReStart_StateMSG = 'dc restart';
const ConnectDC_TryTimes = 50;
const ConnectDC_RecoverTimes = 200;
const RegDC_TryTimes = 5;
const RegDC_RecoverTimes = 20;
const ver = '2.5.8';
const update = '2020/12/25';
const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
let DefaultXmsgTimeout = 6
let DefaultXrpcTimeout = 6
let DefaultWaitTimeout = 12
let motebus = null;
let edgetable = [];     // storage of mote info
let pubfunc = [];       // function table of xrpc publish
//let isofunc = [];     // function table of xrpc isolated
let dbg = 1;            // 0,1,2
let ioclevel = 2;       // 0: error, 1: reg, 2: send, 3: all
let wdInterval = 60000;
let wdtimer = null;
let usedcq = false
let dcq = [];
let dcqflag = 1;
let mbstate = '';
let dcstate = '';
let mcworker = null;
let muid = CreateRandomString(3);
const CHKMMATBL_INTERVAL = 20   // second
const MMATBL_IDLETIME = 90      // second
const DCQ_MAX_LENGTH = 500
console.log('*%s info: [%s] motechat version=%s update=%s', CurrentTime(), muid, ver, update);
//console.log('*%s motechat watchlevel=%s ioclevel=%s', CurrentTime(), dbg, ioclevel);
process.on('beforeExit', (code) => {
    console.log('*%s info: Process beforeExit:%d ', CurrentTime(), code);
    if (mbclass.xmsg) mbclass.xmsg.close()
})

process.on('SIGTERM', signal => {
    console.log('*%s info: %s', CurrentTime(), `Process ${process.pid} received a SIGTERM signal`)
    if (mbclass.xmsg) mbclass.xmsg.close()
    process.exit(0)
})

process.on('SIGINT', signal => {
    console.log('*%s info: %s', CurrentTime(), `Process ${process.pid} has been interrupted`)
    if (mbclass.xmsg) {
        console.log('*%s info: close xmsg', CurrentTime())
        mbclass.xmsg.close()
    }
    process.exit(0)
})

process.on('uncaughtException', err => {
    console.log('*%s info: %s', CurrentTime(), `Uncaught Exception: ${err.message}`)
    if (mbclass.xmsg) mbclass.xmsg.close()
    process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
    console.log('*%s info: Unhandled rejection %s', CurrentTime(), `reason: ${err.message}`)
    if (mbclass.xmsg) mbclass.xmsg.close()
    process.exit(1)
})

class MMATbl {
    constructor(){
        this.mmatable = [];
        this.archmma = [];
        this.timer = null;
        this.busy = false
    }
    search(key){
        //console.log('*%s MMATbl:search key=%s table=%s', CurrentTime(), key, JSON.stringify(this.mmatable));
        for (let i = 0; i < this.mmatable.length; i++){
            let ml = this.mmatable[i]
            if (ml.key == key) {
                let mi = ml.mlist
                let sk = ml.key
                //console.log('*%s MMATbl:search mi=%s', CurrentTime(), JSON.stringify(mi));
                if (mi.length == 1 && sk.charAt(0) != '#' && sk.charAt(0) != '.'){
                    let ntime = new Date()
                    ml.ts = ntime    
                }
                return mi
            }
        }
        return null
    }
    check(key){
        //console.log('*%s MMATbl:check key=%s table=%s', CurrentTime(), key, JSON.stringify(this.mmatable));
        for (let i = 0; i < this.mmatable.length; i++){
            let ml = this.mmatable[i]
            if (ml.key == key) return i
        }
        return -1
    }
    save(key, mlist, stoken, sflag){
        let index = this.check(key)
        let ntime = new Date();
        if (index < 0){
            let mm = {"key":key,"mlist":mlist,"ts":ntime,"SToken":stoken,"sflag":sflag}
            this.mmatable.push(mm)
        }
        else {
            this.mmatable[index].mlist = mlist
            this.mmatable[index].ts = ntime
        }
        //console.log('*%s MMATbl:save table=%s', CurrentTime(), JSON.stringify(this.mmatable));
        if (dbg >= 3) console.log('*%s debug: MMATbl:save table length=%d', CurrentTime(), this.mmatable.length);
        if (!this.timer) this.startWatch()
        return true
    }
    rm(key){
        let index = this.check(key)
        if (index >= 0) this.mmatable.splice(index, 1)
        //console.log('*%s MMATbl:rm key=%s table=%s', CurrentTime(), key, JSON.stringify(this.mmatable));
        if (dbg >= 3) console.log('*%s debug: MMATbl:rm table length=%d', CurrentTime(), this.mmatable.length);
    }
    rmByIndex(index){
        if (index >= 0 && index < this.mmatable.length){
            if (dbg >= 2) console.log('*%s debug: MMATbl:rmByIndex index=%d key=%s', CurrentTime(), index, this.mmatable[index].key);
            this.mmatable.splice(index, 1)
            if (dbg >= 3) console.log('*%s debug: MMATbl:rmByIndex table length=%d', CurrentTime(), this.mmatable.length);
        }
    }
    async watchIdle(){
        if (this.busy == false){
            this.busy = true
            let nt = new Date()
            let len = this.mmatable.length
            // check mmatable
            for (let i = len-1; i >= 0; i--){
                let ml = this.mmatable[i]
                if (ml.ts){
                    let ts = ml.ts
                    let diff = (nt.getTime() - ts.getTime()) / 1000
                    if (diff > MMATBL_IDLETIME) {
                        this.archive(ml.key, ml.mlist, ml.SToken, ml.sflag)
                        this.rmByIndex(i)
                    }
                }
            }
            this.busy = false
        }
    }
    archive(key, mlist, stoken, sflag){
        let index = this.checkarch(key)
        if (index < 0){
            let mm = {"key":key,"mlist":mlist,"ts":null,"SToken":stoken,"sflag":sflag}
            this.archmma.push(mm)
        }
        else {
            this.archmma[index].mlist = mlist
            //this.archmma[index].ts = ntime
        }
    }
    checkarch(key){
        //console.log('*%s MMATbl:check key=%s table=%s', CurrentTime(), key, JSON.stringify(this.mmatable));
        for (let i = 0; i < this.archmma.length; i++){
            let ml = this.archmma[i]
            if (ml.key == key) return i
        }
        return -1
    }
    searcharch(key){
        //console.log('*%s MMATbl:search key=%s table=%s', CurrentTime(), key, JSON.stringify(this.mmatable));
        for (let i = 0; i < this.archmma.length; i++){
            let ml = this.archmma[i]
            if (ml.key == key) {
                return ml.mlist
            }
        }
        return null
    }
    startWatch(){
        //this.stopWatch()
        this.timer = setInterval(() => {this.watchIdle()}, CHKMMATBL_INTERVAL*1000)
    }
    stopWatch(){
        if (this.timer) clearInterval(this.timer)
    }
}


class Worker extends EventEmitter {
    constructor(){
        super();
        this.mbstack = mbclass
        //this.motebus = motebus
        this.mbusinfo = null    //{udid,busName,hostName,wanIP,localIP,mmpHost,mmpPort,mma}
        this.mctable = []       // motechat event table
        this.umma = ''
        this.conf = null        //{AppName,AppKey,DCenter,IOC,MotebusGW,MotebusPort}
        this.dc = ''
        this.ioc = ''
        this.uc = ''
        this.openflag = false
        this.heartbeat = 0
        this.lastuse = '' 
        this.operation = 'direct'
        this.dcmode = ''
        this.mcstate = ''
        this.MATL = new MMATbl()
        this.wid = []
        this.mbstack.on('motebus.state', (state) => {
            if (dbg >= 3) console.log('*%s debug: %s mbstate=%s state=%s', CurrentTime(), this.conf.AppName, mbstate, state)
            if (mbstate != state) mbusStateChange(this,state)
            mbstate = state
        })
    }
    async OpenMotechat(mcid, mconf){
        this.wid.push(mcid)
        let {AppName} = mconf;
        if (AppName){
            let conf = {"AppName":"","AppKey":"","DCenter":"","IOC":"","WatchLevel":1,"MotebusGW":""}
            if (mconf.AppName) conf.AppName = mconf.AppName
            if (mconf.AppKey) conf.AppKey = mconf.AppKey
            if (mconf.DCenter) conf.DCenter = mconf.DCenter
            if (mconf.IOC) conf.IOC = mconf.IOC
            if (mconf.IOCLevel) ioclevel = GetIOCLevel(mbGetConfig)
            if (mconf.MotebusGW) conf.MotebusGW = mconf.MotebusGW
            if (typeof mconf.WatchLevel != 'undefined') {
                let wl = mconf.WatchLevel
                if (typeof wl == 'string') conf.WatchLevel = parseInt(wl)
                else conf.WatchLevel = mconf.WatchLevel
            }
            console.log('*%s info: OpenMotechat conf=%s', CurrentTime(), JSON.stringify(conf))
            this.dc = conf.DCenter
            this.ioc = conf.IOC
            this.conf = conf       
            //if (dbg >= 1) console.log('*%s info: [%s] OpenMotechat AppName=%s AppKey=%s DC=%s IOC=%s MotebusGW=%s MotebusPort=%d', CurrentTime(), mcid, conf.AppName, conf.AppKey, this.dc, this.ioc, conf.MotebusGW, conf.MotebusPort)        
            //console.log('*%s [%s] OpenMotechat xpath=%s', CurrentTime(), mcid, this.xpath)
            if (this.mcstate == '') {
                this.mcstate = 'startup';
                dbg = conf.WatchLevel
                //if (dbg >= 2) console.log('*%s info: [%s] OpenMotechat watchlevel=%d', CurrentTime(), mcid, dbg)
                motebus = await this.mbstack.Create(conf);
                this.motebus = motebus;
                let isReady = await this._WaitMbusReady()
                //console.log('*%s [%s] motebus ready: %s', CurrentTime(), mcid, isReady)
                if (isReady) this.mcstate = 'ready'
                else {
                    this.mcstate = ''
                    let ret = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"startup motebus fail"}
                    return ret
                }
            }
            if (this.mcstate == 'startup'){
                let isReady = await this._WaitMbusReady()
                if (!isReady){
                    let ret = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"startup motebus fail"}
                    return ret
                }
                else this.mcstate = 'ready'
            }
            if (this.mcstate == 'ready'){
                this.mcstate = 'open...'
                let openret = await this.mbstack.Open(conf)
                if (openret == 'open') {this.mcstate = 'open'
                    let mbusret = await this._getMbusInfo()
                    if (mbusret.ErrCode != mcerr.MC_OKCODE){
                        this.mcstate = 'open'
                        return mbusret
                    }
                }
                else {
                    if (dbg >= 0) console.log('*%s error: motebus open result=%s', CurrentTime(), openret)
                    this.mcstate = 'ready';
                    let ret = {"ErrCode":mcerr.IN_Mbus_NotOpen,"ErrMsg":mcerr.IN_Mbus_NotOpen_Msg}
                    return ret   
                }
            }
            if (this.mcstate == 'open...'){
                let isConn = await this._WaitMbusOpen()
                if (!isConn){
                    let ret = {"ErrCode":mcerr.IN_Mbus_NotOpen,"ErrMsg":mcerr.IN_Mbus_NotOpen_Msg}
                    return ret
                }
                else this.mcstate = 'open'
            }
            if (this.mcstate == 'open'){
                await this._tryConnDC(mcid)
                return {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Info":this.mbusinfo}
            }    
        }
        else {
            return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":"No appname"}    
        }
    }
    async _tryConnDC(mcid){
        if (dcstate == ''){
            dcstate = 'conn...'
            let dcret = await this._ConnDC(10000, ConnectDC_TryTimes)
            //console.log('*%s ConnDC result: %s', CurrentTime(), JSON.stringify(dcret))
            if (dcret.ErrCode == mcerr.MC_OKCODE) {
                console.log('*%s info: ConnDC result=%s', CurrentTime(), dcret.ErrMsg)
                dcstate = 'conn'
                this.mbstack.cbfunc.sys = parseSysCmd
            }
        }
    }
    async setOnEvent(mcid, etype, callback, stoken){
        //console.log('setOnEvent stoken=', stoken)
        let SToken = stoken ? stoken : this.lastuse
        if (SToken){
            //if (dbg >= 1) console.log('*%s [%s] setOnEvent type=%s SToken=%s', CurrentTime(), mcid, etype, SToken)
            if (mcid && etype && SToken && typeof callback == 'function'){
                let mctl = this._GetMCTable(mcid, SToken)
                if (mctl){
                    let result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG}
                    switch(etype){
                        case 'message':
                            if (dbg >= 2) console.log('*%s debug: [%s] setOnEvent type=%s SToken=%s', CurrentTime(), mcid, etype, SToken)
                            mctl.OnEvent.msg = callback
                            this.mbstack.InMessage(etype, parseXmsg)
                            break
                        case 'mbus':
                            mctl.OnEvent.mbus = callback
                            this.mbstack.InMessage(etype, parseMbus)    
                            break
                        case 'event':
                            mctl.OnEvent.event = callback
                            this.mbstack.InMessage(etype, callback)
                            break
                        case 'state':
                            mctl.OnEvent.state = callback
                            break
                        default:
                            result = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid type"}
                            break;
                    }
                    return result
                }
                else return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Motechat error"}
            }
            else return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
        }
        else return {"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg}
    }
    _NewMCTable(id, stoken){
        let ectl = {"mcID":id,"SToken":stoken,"OnEvent":{"msg":null,"mbus":null,"event":null,"state":null}}
        this.mctable.push(ectl)
        return ectl
    }
    _GetMCTable(id, stoken){
        let etbl = this.mctable
        if (etbl){
            for (let i = 0; i < etbl.length; i++){
                if (etbl[i].SToken == stoken) return etbl[i]
            }
        }
        return this._NewMCTable(id, stoken)
    }
    _SearchMCTable(stoken){
        if (dbg >= 3) console.log('*%s debug: SearchMCTable Stoken=%s', CurrentTime(), stoken)
        if (stoken){
            let etbl = this.mctable
            if (etbl){
                for (let i = 0; i < etbl.length; i++){
                    if (dbg >= 3) console.log('*%s debug: SearchMCTable mctable Stoken=%s', CurrentTime(), etbl[i].SToken)
                    if (etbl[i].SToken == stoken) return etbl[i]
                }
            }
        }
        return null
    }
    _GetMsgListenerInfo(){
        let etbl = this.mctable
        if (etbl){
            for (let i= etbl.length-1; i >= 0; i--){
                if (typeof etbl[i].OnEvent.msg == 'function') return etbl[i]
            }
        }
        return null
    }
    _IssueState(state, SToken){
        if (this.mctable){
            for (let i = 0; i < this.mctable.length; i++){
                let mctl = this.mctable[i]
                if (typeof mctl.OnEvent.state == 'function') {
                    if (SToken){
                        //console.log('*%s IssueState state=%s, SToken=%s', CurrentTime(), state, SToken)
                        if (SToken == mctl.SToken){
                            mctl.OnEvent.state(state, SToken)
                            break
                        }
                    }
                    else mctl.OnEvent.state(state, mctl.SToken)
                }
            }    
        }
    }
    async PublishFunc(pubapp, func){
        let result = await this.mbstack.PublishXrpc(pubapp, func);
        if (result.ErrCode == mcerr.MC_OKCODE) pubfunc.push({"app":pubapp,"func":func});
        return result;    
    } 
    RestartMotebus(){
        this.mbstack.Restart()
        return true
    }
    _MCFuncSync(mcid, func, data, option){
        return new Promise((resolve) => {
            this._MCFunc(mcid, func, data, option, (result) =>{
                resolve(result)
            })
        })
    }
    _MCFunc(mcid, func, data, option, cb){
        let cell = {"mcid":mcid,"func":func,"data":data,"option":option,"callback":cb}
        if (!usedcq) this._DoMCFunc(cell)
        else {
            if (dcq.length > 3) console.log('*%s warn: MCFunc %s wait %d', CurrentTime(), func, dcq.length)
            if (dcq.length < DCQ_MAX_LENGTH) {
                dcq.push(cell)
                this._ExecMCFunc()
            }
            else {
                if (typeof cb == 'function') cb([{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Motechat busy"}},"Reply":""}])
            }    
        }
    }
    async _ExecMCFunc(){
        if (dcstate == 'conn'){
            if (dcq.length > 0 && dcqflag == 1){
                dcqflag = 0
                let dctask = dcq[0]
                let {mcid, func, data, option, callback} = dctask
                let result = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
                let ins = this.mbstack
                try {
                    if (dbg >= 3) console.log('*%s debug: ExecMCFunc func=%s start', CurrentTime(), func)
                    switch(func){
                        case 'reg':
                            result = await this._RegDC(mcid, 2000, RegDC_TryTimes, data, 'reg')
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'unreg':
                            result = await this._UnregDC(data)
                            if (typeof callback == 'function') callback(result)
                            else return result
                            break;
                        case 'send':
                            result = await this._SendXmsg(data)
                            if (dbg >= 3) console.log('*%s debug: SendXmsg result=%s', CurrentTime(), JSON.stringify(result))
                            if (typeof callback == 'function') callback(result)
                            if (ioclevel != 1 && this.ioc && Array.isArray(result) && data.Data) rptIOC(ins, result, data.Data, 'send')
                            break;
                        case 'call':
                            result = await this._CallXrpc(data)
                            if (dbg >= 3) console.log('*%s debug: CallXrpc: result=%s', CurrentTime(), JSON.stringify(result))
                            if (typeof callback == 'function') callback(result)
                            if (ioclevel != 1 && this.ioc && Array.isArray(result) && data.Data) rptIOC(ins, result, data.Data, 'call')
                            break;
                        case 'get':
                            result = await this._GetDevice(data)
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'set':
                            if (typeof data.EdgeInfo == 'object') data.EdgeInfo = this._TrimEiInfo(data.EdgeInfo)
                            result = await this._SetDevice(data, option)
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'search':
                            result = await this._CallMCFunc('SearchDevice', 'search', data)
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'nearby':
                            result = await this._CallMCFunc('NearbyDevice', 'nearby', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'setapp':
                            result = await this._CallMCFunc('SetAppSetting', 'setapp', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'getapp':
                            result = await this._CallMCFunc('GetAppSetting', 'getapp', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'getqpin':
                            result = await this._CallMCFunc('GetQPin', 'getqpin', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'findqpin':
                            result = await this._CallMCFunc('FindQPin', 'findqpin', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'mbsend':
                            result = await this._mbSendXmsg(data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'mbcall':
                            result = await this._mbCallXrpc(data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        default:
                            break;
                    }
                    if (dbg >= 3) console.log('*%s debug: ExecMCFunc func=%s end', CurrentTime(), func)
                    this._EndMCFunc()
                }
                catch(e){
                    if (dbg >= 0) console.log('*%s error: ExecMCFunc func=%s data=%s msg=%s', CurrentTime(), func, JSON.stringify(data), e.message)
                    if (typeof callback == 'function'){
                        result = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message}
                        callback(result)
                    }
                    this._EndMCFunc()
                }
            }    
        }
        else {
            console.log('*%s error: ExecMCFunc state=%s', CurrentTime(), dcstate)
            setTimeout(() => {
                if (dcq.length > 0) this._ExecMCFunc()
            }, 3000)
        }
    }
    _EndMCFunc(){
        dcqflag = 1
        dcq.splice(0, 1)
        if (dcq.length > 0) this._ExecMCFunc()
    }
    async _DoMCFunc(task){
        if (dcstate == 'conn'){
            if (task){
                let {mcid, func, data, option, callback} = task
                let result = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
                let ins = this.mbstack
                try {
                    if (dbg >= 3) console.log('*%s debug: DoMCFunc func=%s start', CurrentTime(), func)
                    switch(func){
                        case 'reg':
                            result = await this._RegDC(mcid, 2000, RegDC_TryTimes, data, 'reg')
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'unreg':
                            result = await this._UnregDC(data)
                            if (typeof callback == 'function') callback(result)
                            else return result
                            break;
                        case 'send':
                            result = await this._SendXmsg(data)
                            if (dbg >= 3) console.log('*%s debug: SendXmsg result=%s', CurrentTime(), JSON.stringify(result))
                            if (typeof callback == 'function') callback(result)
                            if (ioclevel != 1 && this.ioc && Array.isArray(result) && data.Data) rptIOC(ins, result, data.Data, 'send')
                            break;
                        case 'call':
                            result = await this._CallXrpc(data)
                            if (dbg >= 3) console.log('*%s debug: CallXrpc result=%s', CurrentTime(), JSON.stringify(result))
                            if (typeof callback == 'function') callback(result)
                            if (ioclevel != 1 && this.ioc && Array.isArray(result) && data.Data) rptIOC(ins, result, data.Data, 'call')
                            break;
                        case 'get':
                            result = await this._GetDevice(data)
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'set':
                            if (typeof data.EdgeInfo == 'object') data.EdgeInfo = this._TrimEiInfo(data.EdgeInfo)
                            result = await this._SetDevice(data, option)
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'search':
                            result = await this._CallMCFunc('SearchDevice', 'search', data)
                            if (typeof callback == 'function') callback(result)
                            break;
                        case 'nearby':
                            result = await this._CallMCFunc('NearbyDevice', 'nearby', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'setapp':
                            result = await this._CallMCFunc('SetAppSetting', 'setapp', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'getapp':
                            result = await this._CallMCFunc('GetAppSetting', 'getapp', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'getqpin':
                            result = await this._CallMCFunc('GetQPin', 'getqpin', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'findqpin':
                            result = await this._CallMCFunc('FindQPin', 'findqpin', data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'mbsend':
                            result = await this._mbSendXmsg(data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        case 'mbcall':
                            result = await this._mbCallXrpc(data)
                            if (typeof callback == 'function') callback(result);
                            break;
                        default:
                            if (typeof callback == 'function') callback(result);
                            break;
                    }
                }
                catch(e){
                    if (dbg >= 0) console.log('*%s error: DoMCFunc func=%s data=%s msg=%s', CurrentTime(), func, JSON.stringify(data), e.message)
                    if (typeof callback == 'function'){
                        let err = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message}
                        callback(err)
                    }
                }
            }    
        }
        else {
            console.log('*%s error: DoMCFunc state=%s', CurrentTime(), dcstate)
            if (typeof callback == 'function'){
                let err = {"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg}
                callback(err)
            }
        }
    }
    async _WaitMbusReady(){
        let trydelay = 500;
        for( let i = 0; i < 360; i++ ){
            await this._waitMiniSec(trydelay);
            if (mbstate == 'ready') return true;
        }
        return false;
    }
    async _WaitMbusOpen(){
        let trydelay = 500 + Math.floor((Math.random() * 10) + 1) * 100;
        for( let i = 0; i < 50; i++ ){
            if (mbstate == 'open') return true;
            await this._waitMiniSec(trydelay);
        }
        return false;
    }
    async _WaitConnDC(){
        let trydelay = 1200;
        for( let i = 0; i < 10; i++ ){
            await this._waitMiniSec(trydelay);
            if (dcstate == 'conn') return true;
        }
        return false;
    }    
    async _RePublishFunc(){
        if (pubfunc.length > 0){
            for (let i = 0; i < pubfunc.length; i++ ){
                let pub = pubfunc[i];
                await this.mbstack.PublishXrpc(pub.app, pub.func);
            }
        }
    }
    async _ConnDC(delay, count){
        let trycount = count? count : 1
        let trydelay = delay? delay : 3000
        let ins = this.mbstack
        let i = 0
        let reply = {"ErrCode":mcerr.MC_NotOpen,"ErrMsg":mcerr.MC_NotOpen_Msg}
        for ( i = 0; i < trycount; i++ ){
            if (ins.state == 'open') {
                reply = await this._CallDCReset();
                //if (dbg >= 3) console.log('*%s ConnDC result=%s', CurrentTime(), JSON.stringify(reply))
                //else if (dbg >= 1) console.log('*%s [%s] ConnDC result=%s', CurrentTime(), muid, reply.ErrMsg)
                let etype = reply.ErrCode == mcerr.MC_OKCODE ? 'info' : 'error'
                if (this.ioc) {
                    if (ioclevel == 3 || ioclevel == 1) ins.iocEvent('', this.umma, etype, 'in', {"Device":this.umma,"action":"conn dc","result":reply.ErrMsg,"Info":this.dc});
                    else if (etype == 'error' && ioclevel == 0) ins.iocEvent('', this.umma, etype, 'in', {"Device":this.umma,"action":"conn dc","result":reply.ErrMsg,"Info":this.dc});
                }
                if (reply.ErrCode == mcerr.MC_OKCODE) {
                    //dcstate = 'conn'
                    return reply;
                }
                else {
                    if (dbg >= 0) console.log('*%s info: ConnDC result=%s', CurrentTime(), reply.ErrMsg)
                    await this._waitMiniSec(trydelay+((i+1)*1000)+(Math.floor((Math.random()*5)+1)*200));
                }    
            }
            else {
                if (dbg >= 0) console.log('*%s error: ConnDC: motebus not opened', CurrentTime())
                await this._waitMiniSec(trydelay+((i+1)*2000)+(Math.floor((Math.random()*5)+1)*200));
            }
        }
        if ( i == trycount ){
            if (dbg >= 0) console.log('*%s error: ConnDC: Elapse try count', CurrentTime())
            let err = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"ConnDC error: Elapse try count"}
            return err
        }
    }
    async _CallDCReset(){
        try {
            let dcenter = this.conf.DCenter
            let mbusmma = this.umma
            if (dbg >= 2) console.log('*%s debug: CallDCReset dcenter=%s', CurrentTime(), dcenter);
            if (dcenter && mbusmma){
                let ins = this.mbstack
                let dcret = await ins.CallXrpc(dcenter, 'resetreg', [{"EiUMMA":mbusmma,"mcID":muid}], null, null)
                if (dbg >= 3) console.log('*%s debug: CallDCReset reply=%s', CurrentTime(), JSON.stringify(dcret));
                let Reply = chkReply(dcret)
                if (Reply){
                    if (typeof Reply.ErrCode != 'undefined'){
                        if (Reply.ErrCode == mcerr.MC_OKCODE){
                            this.dc = dcenter
                            this.uc = Reply.UC ? Reply.UC : ''
                            if (this.ioc) this.mbstack.iocmma = this.ioc
                            //dcstate = 'conn'
                            if (Reply.HeartbeatTimeout) {
                                let hbtm = Reply.HeartbeatTimeout
                                this.heartbeat = hbtm;
                                wdInterval = hbtm * 1000
                            }
                            if (Reply.Operation){
                                if (Reply.Operation == 'dc') this.operation = 'dc'
                                else this.operation = 'direct' 
                            }

                            if (Reply.DCMode) this.dcmode = Reply.DCMode

                            //if (Reply.IOCLevel) ioclevel = GetIOCLevel(Reply)
                            //console.log('*%s CallDCReset ioc=%s ioclevel=%d', CurrentTime(), this.ioc, ioclevel)

                            StartWDtimer(this) 
                        }
                        //console.log('*%s CallDCReset reply=%s', CurrentTime(), JSON.stringify(Reply))
                        return Reply    
                    }
                    else {
                        let eret = chkError(Reply)
                        if (dbg >= 0) console.log('*%s error: CallDCReset msg=%s', CurrentTime(), eret.ErrMsg);
                        return eret;          
                    }
                }
                else {
                    let eret = chkError(dcret)
                    if (dbg >= 0) console.log('*%s error: CallDCReset msg=%s', CurrentTime(), eret.ErrMsg);
                    return eret;      
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: CallDCReset: motebus not ready or dc empty dc=%s mma=%s', CurrentTime(), dcenter, mbusmma);
                return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"motebus not ready or dc empty","info":{"dc":dcenter,"mma":mbusmma}};  
            }
        }
        catch(e){
            if (dbg >= 0) console.log('*%s error: CallDCReset msg=%s', CurrentTime(), e.message);
            return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
        }
    }
    async _ExecDCReset(){
        StopWDtimer()
        dcstate = 'conn...'
        //let tm = Math.floor((Math.random() * 5) + 1) * 500;
        //await this._waitMiniSec(tm)
        let rst = await this._ConnDC(10000, ConnectDC_RecoverTimes)
        if (rst.ErrCode == mcerr.MC_OKCODE){
            console.log('*%s info: ConnDC result=%s', CurrentTime(), rst.ErrMsg)
            dcstate = 'conn'
            await this._ExecReregAll()
        }
        else {
            if (dbg >= 0) console.log('*%s error: ConnDC msg=%s', CurrentTime(), rst.ErrMsg)
        }
    }
    async _ExecReregAll(){
        if (dbg >= 2) console.log('*%s debug: ExecReregAll no=%d', CurrentTime(), edgetable.length)
        if ( edgetable.length > 0 ){
            for ( let i = edgetable.length-1; i >= 0; i-- ){
                //let tm = Math.floor((Math.random() * 10) + 1) * 200;
                //await this._waitMiniSec(tm)
                let ei = edgetable[i];
                //console.log('*%s ExecReregAll %s state=%s', CurrentTime(), ei.EiName, ei.State)
                if (ei.State == 'reg'){
                    ei.State = 'sysreg'
                    await this._ExecRereg(ei)
                }
            }
        }
    }
    async _ExecRereg(ei){
        let eidata = {"EiName":ei.EiName,"EiType":ei.EiType,"EiTag":ei.EiTag,"EiLoc":ei.EiLoc}
        let reginfo = {"SToken":ei.SToken,"EiToken":ei.EiToken,"WIP":ei.WIP,"LIP":ei.LIP,"EdgeInfo":eidata}
        if (dbg >= 3) console.log('*%s debug: ExecRereg %s', CurrentTime(), JSON.stringify(reginfo)) 
        let regret = await this._RegDC(ei.mcid, 2000, RegDC_RecoverTimes, reginfo, 'rereg')
        if (dbg >= 1){
            if (regret.ErrCode == mcerr.MC_OKCODE){
                if (typeof regret.result == 'object') {
                    if (dbg >= 1) console.log('*%s info: Rereg OK SToken=%s DDN=%s EiName=%s EiMMA=%s', CurrentTime(), regret.result.SToken, regret.result.DDN, regret.result.EiName, regret.result.EiMMA)
                    this._IssueState('Rereg OK', regret.result.SToken)
                }
            }
            else console.log('*%s error: Rereg msg=%s', CurrentTime(), regret.ErrMsg)
        } 
        else if (dbg >= 3) console.log('*%s debug: ExecRereg SToken=%s result=%s', CurrentTime(), reginfo.SToken, JSON.stringify(regret))     
    }
    _waitMiniSec(ms){
        return new Promise(function(resolve){
            if ( ms ){
                setTimeout(function(){
                    resolve(true);
                }, ms);
            }
            else resolve(false);
        });
    }
    async _RegDC(mcid, delay, count, regdata, mode){
        let trycount = count? count : 1
        let trydelay = delay? delay : 3000
        //console.log('*%s [%s] RegDC try count=%d delay=%d', CurrentTime(), mcid, trycount, trydelay)
        let ins = this.mbstack
        let reginfo = regdata
        if (dbg >= 3) console.log('*%s debug: [%s] RegDC reginfo=%s', CurrentTime(), mcid, JSON.stringify(reginfo))
        return new Promise(async (resolve) => {
            let {SToken} = reginfo
            let reply = null
            let isreg = false
            if (SToken){
                let result = chkUserSession(SToken, false)
                if (result && _chkIsMultiReg(result)){
                    reply = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":result}
                    isreg = true
                }
            }
            if (isreg == true) {
                if (dbg >= 2) console.log('*%s debug: [%s] RegDC, already reg ddn=%s', CurrentTime(), mcid, reply.result.DDN)
                resolve(reply)
            }
            else {
                if (dbg >= 2) console.log('*%s info: [%s] RegDC, SToken=%s EiToken=%s', CurrentTime(), mcid, reginfo.SToken, reginfo.EiToken)
                for ( let i = 0; i < trycount; i++ ){
                    if (ins.state == 'open') {
                        reply = await this._StartSession(mcid, reginfo, mode);
                        if (dbg >= 3) console.log('*%s debug: [%s] RegDC result=%s', CurrentTime(), mcid, JSON.stringify(reply))
                        if (reply.ErrCode == mcerr.MC_OKCODE) {
                            if (reply.result) {
                                let {SToken} = reply.result
                                this.lastuse = SToken
                                //if (dbg >= 2) console.log('*%s [%s] RegDC SToken=%s result=%s DDN=%s EiName=%s EiMMA=%s', CurrentTime(), mcid, SToken, reply.ErrMsg, DDN, EiName, EiMMA)
                                break;
                            }
                        }
                        else {
                            if (dbg >= 0) console.log('*%s error: [%s] RegDC msg=%s', CurrentTime(), mcid, reply.ErrMsg)
                        }
                    }
                    if (i < trycount-1) await this._waitMiniSec(trydelay+(i*1000));
                }
                resolve(reply)
            }
        })
    }
    async _UnregDC(data, delay, count){
        let trycount = count? count : 1
        let trydelay = delay? delay : 3000
        let ins = this.mbstack
        return new Promise(async (resolve) => {
            let {SToken} = data
            if (dbg >= 2) console.log('*%s info: UnregDC SToken=%s', CurrentTime(), SToken)
            if (SToken){
                let index = chkUserSession(SToken, true)
                if (index >= 0){
                    let ei = edgetable[index]
                    if (ei){
                        ei.State = 'unreg'
                        let reply = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Unreg fail"}
                        for ( let i = 0; i < trycount; i++ ){
                            if (ins.state == 'open') {
                                reply = await this._EndSession(ei);
                                if (dbg >= 3) console.log('*%s debug: UnregDC reply=%s', CurrentTime(), JSON.stringify(reply))
                                if (reply.ErrCode == mcerr.MC_OKCODE) break;
                            }
                            if (i < trycount-1) await this._waitMiniSec(trydelay);
                        }  
                        resolve(reply)  
                    }
                }
                else {
                    let ret = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG}
                    //let ret = {"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidSToken_Msg,"SToken":SToken}
                    if (dbg >= 0) console.log('*%s error: UnregDC msg=%s', CurrentTime(), ret.ErrMsg)
                    resolve(ret);
                }
            }
            else {
                let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"Info":data}
                if (dbg >= 0) console.log('*%s error: UnregDC reply=%s', CurrentTime(), JSON.stringify(ret))
                resolve(ret);
            }
        })
    }
    _TrimEiInfo(info){
        let ret = {"EiName":"","EiType":".mc","EiTag":"","EiLoc":""}
        //if (typeof info.EiName == 'string') ret.EiName = this._TrimEiName(info.EiName)
        if (typeof info.EiName == 'string') ret.EiName = info.EiName
        if (typeof info.EiType == 'string') ret.EiType = info.EiType
        if (typeof info.EiTag == 'string') ret.EiTag = info.EiTag
        if (typeof info.EiLoc == 'string') ret.EiLoc = info.EiLoc
        return ret
    }
    _TrimEiName(einame){
        if (einame.indexOf('(') >= 0){
            return this._GenEiName(einame)
        }
        else return einame
    }
    _GenEiName(einame){
        let newname = einame
        if (newname.indexOf('(udid)') >= 0) {
            let n = this.mbusinfo.udid
            newname = newname.replace('(udid)',n)
        }
        if (newname.indexOf('(hostname)') >= 0) {
            let n = this.mbusinfo.hostName
            newname = newname.replace('(hostname)',n)
        }
        if (newname.indexOf('(busname)') >= 0) {
            let n = this.mbusinfo.busName
            newname = newname.replace('(busname)',n)
        }
        //if (newname.indexOf('(') >= 0) newname = newname.replace(/\(/g, '')
        //if (newname.indexOf(')') >= 0) newname = newname.replace(/\)/g, '')

        //if (einame != newname) console.log('*%s GenEiName=%s', CurrentTime(), newname)
        return newname
    }
    async _StartSession(mcid, regdata, mode){
        try {
            let ins = this.mbstack
            let dcenter = this.conf.DCenter
            let AppKey = this.conf.AppKey
            let mbusmma = this.umma
            let mbusport = this.mbusinfo.mnpPort
            let reginfo = regdata
            //console.log('*%s StartSession reginfo=%O', CurrentTime(), reginfo)
            let {SToken,EiToken,WIP,LIP,EdgeInfo} = reginfo
            let dcData = {"AppKey":AppKey,"EiToken":EiToken,"SToken":SToken,"EiUMMA":mbusmma,"EiUPort":mbusport,"WIP":WIP,"LIP":LIP,"mcID":muid};
            let regret = await ins.CallXrpc(dcenter, 'reg', [dcData], null, null)
            //if (dbg >= 2) console.log('*%s [%s] StartSession result=%s', CurrentTime(), mcid, regret.ErrMsg);
            if (dbg >= 3) console.log('*%s debug: [%s] StartSession result=%s', CurrentTime(), mcid, JSON.stringify(regret));
            let Reply = chkReply(regret)
            if (Reply){
                if (typeof Reply.ErrCode != 'undefined'){
                    if (Reply.ErrCode == mcerr.MC_OKCODE){
                        if (Reply.result){
                            if (dbg >= 2) console.log('*%s info: [%s] StartSession %s', CurrentTime(), mcid, Reply.ErrMsg);
                            let regdata = Reply.result
                            let {SToken,DDN,EiName} = regdata
                            if (this.ioc) {
                                if (ioclevel == 3 || ioclevel == 1) ins.iocEvent('', mbusmma, 'info', 'in', {"Device":EiName,"DDN":DDN,"action":"reg","result":Reply.ErrMsg,"info":regdata});
                            }
                            let err = saveRegSession(mcid, regdata, WIP, LIP);
                            if (!err){  // no error
                                if (mode == 'reg' && EdgeInfo && chkEdgeInfo(EdgeInfo)){
                                    let setret = await this._SetAfterReg(reginfo, regdata)
                                    if (setret) return setret
                                    else return Reply
                                }
                                else {
                                    return Reply
                                } 
                            }
                            else {
                                if (dbg >= 0) console.log('*%s error: [%s] StartSession msg=%s', CurrentTime(), mcid, err);
                                return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err}
                            }
                        }
                        else {
                            if (dbg >= 0) console.log('*%s error: [%s] StartSession 1: Invalid reply ', CurrentTime(), mcid);
                            return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid reply"}
                        }
                    }
                    else {
                        if (dbg >= 0) console.log('*%s error: [%s] StartSession 2: %s', CurrentTime(), mcid, Reply.ErrMsg);
                        if (this.ioc && ioclevel != 2) ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"DDN":"","action":"reg","result":Reply.ErrMsg,"info":reginfo})
                        return Reply
                    }
                }
                else {
                    if (dbg >= 0) console.log('*%s error: [%s] StartSession 3: Invalid reply ', CurrentTime(), mcid);
                    return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid reply"}
                }
            }
            else {
                let eret = chkError(regret)
                if (dbg >= 0) console.log('*%s error: [%s] StartSession 4: %s', CurrentTime(), mcid, eret.ErrMsg);
                return eret
            }    
        }
        catch(e){
            if (dbg >= 0) console.log('*%s error: [%s] StartSession 5: %s', CurrentTime(), mcid, e.message);
            return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
        }
    }
    async _SetAfterReg(reginfo, regdata){
        let {EdgeInfo,Option} = reginfo
        let {SToken} = regdata
        let SaveDSIM = false
        let setdata = null
        if (typeof Option == 'object') {
            if (typeof Option.SaveDSIM == 'boolean') SaveDSIM = Option.SaveDSIM
        }
        if (SaveDSIM == true && cmpEdgeInfo(EdgeInfo, regdata, 'reg') == false) {
            setdata = {"SToken":SToken,"EdgeInfo":{"EiName":EdgeInfo.EiName,"EiType":EdgeInfo.EiType}}
        }    
        else if (cmpEdgeInfo(EdgeInfo, regdata, '') == false){
            setdata = {"SToken":SToken,"EdgeInfo":EdgeInfo}
        }
        if (setdata){
            let setret = await this._SetDevice(setdata, 'reg')
            return setret    
        }
        else return null
    }
    async _EndSession(edgeinfo){
        let mbusmma = this.umma
        let {SToken,EiToken,EiName,DDN} = edgeinfo;
        let ins = this.mbstack
        try {
            let dcenter = this.conf.DCenter
            let dcData = {"SToken":SToken};
            let result = await ins.CallXrpc(dcenter, 'unreg', [dcData], null, null)
            if (dbg >= 3) console.log('*%s debug: EndSession result=%s', CurrentTime(), JSON.stringify(result));
            let Reply = chkReply(result)
            if (Reply){
                if (typeof Reply.ErrCode != 'undefined' && typeof Reply.ErrMsg != 'undefined'){
                    if (Reply.ErrCode == mcerr.MC_OKCODE || Reply.ErrMsg == 'Access Denied' || Reply.ErrMsg == 'Forbidden.'){
                        //if (dbg >= 0) console.log('*%s EndSession SToken=%s OK', CurrentTime(), SToken);
                        if (this.ioc && (ioclevel == 1 || ioclevel == 3)) ins.iocEvent('', mbusmma, 'warning', 'in', {"Device":EiName,"DDN":DDN,"action":"unreg","result":mcerr.MC_OKMSG});
                        rmRegSession(EiToken, SToken)
                        return {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG}
                    }
                    else {
                        if (this.ioc && ioclevel != 2) ins.iocEvent('', mbusmma, 'error', 'in', {"Device":EiName,"DDN":DDN,"action":"unreg","result":Reply.ErrMsg});
                        //if (dbg >= 0) console.log('*%s EndSession error: %s', CurrentTime(), JSON.stringify(Reply));
                        return Reply
                    }
                }
                else {
                    let eret = chkError(Reply)
                    if (dbg >= 0) console.log('*%s error: EndSession 1: %s', CurrentTime(), eret.ErrMsg);
                    return eret
                }
            }
            else {
                let eret = chkError(result)
                if (dbg >= 0) console.log('*%s error: EndSession 2: %s', CurrentTime(), eret.ErrMsg);
                return eret
            }
        }
        catch(e){
            if (dbg >= 0) console.log('*%s error EndSession 3: %s', CurrentTime(), e.message);
            return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
        }
    }
    async _getMbusInfo(){
        let mbusret = await this.mbstack.MbusInfo();
        if (mbusret.ErrCode == mcerr.MC_OKCODE){
            let info = mbusret.result
            if (dbg >= 0) console.log('*%s info: get motebus info: udid=%s busName=%s wanIP=%s, mma=%s', CurrentTime(), info.udid, info.busName, info.wanIP, info.mma)
            else if (dbg >= 3) console.log('*%s debug: motebus %s', CurrentTime(), JSON.stringify(info))
            this._saveMbusInfo(mbusret.result)
        }
        else {
            if (dbg >= 0) console.log('*%s error: get motebus info msg=%s', CurrentTime(), mbusret.ErrMsg)
        }
        return mbusret
    }
    _saveMbusInfo(info){
        if ( info ){
            try {
                this.mbusinfo = info
                this.umma = info.mma;
                if (dbg >= 2) console.log('*%s debug: saveMbusInfo, mma=%s', CurrentTime(), this.umma);   
            }
            catch(e){
                if (dbg >= 0) console.log('*%s error: saveMbusInfo msg=%s', CurrentTime(), e.message);
            }
        }
        return;
    }
    // data: {SToken,EdgeInfo:{EiName,EiType,EiTag,EiLoc}}
    // mode: 'set' from set command, 'reg' from reg command
    async _SetDevice(data,mode){
        let ins = this.mbstack
        let SToken = data.SToken
        let EdgeInfo = data.EdgeInfo
        let mbusmma = this.umma
        if (dbg >= 3) console.log('*%s debug: SetDevice data=%s', CurrentTime(), JSON.stringify(data));
        if (SToken && EdgeInfo){
            let info = chkUserSession(SToken, false);
            if ( info ){
                if (cmpEdgeInfo(EdgeInfo, info, '') == false){
                    if (dbg >= 2) console.log('*%s info: SetDevice EiName=%s,EiType=%s', CurrentTime(), EdgeInfo.EiName, EdgeInfo.EiType);
                    let {DDN,EiName} = info
                    let setret = await ins.CallXrpc(this.dc, 'setinfo', [data], null, null)
                    let Reply = chkReply(setret)
                    if (Reply){
                        if(typeof Reply.ErrCode != 'undefined' && typeof Reply.result != 'undefined'){
                            if (Reply.ErrCode == mcerr.MC_OKCODE && Reply.result){
                                if (dbg >= 2) console.log('*%s info: SetDevice: result=%s', CurrentTime(), Reply.ErrMsg);
                                //console.log('*%s SetDevice: result=%s', CurrentTime(), JSON.stringify(Reply));
                                let edge = Reply.result;
                                let einfo = {"EiName":edge.EiName,"EiType":edge.EiType,"EiTag":edge.EiTag,"EiLoc":edge.EiLoc};
                                updEdgeData(data.SToken, einfo)
                                if (this.ioc && (ioclevel == 3 || ioclevel == 1)) ins.iocEvent('', mbusmma, 'info', 'in', {"Device":EiName,"DDN":DDN,"action":"set","result":Reply.ErrMsg});
                                if (mode == 'reg') return {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":getEdgeInfo(info)};
                                else return {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":einfo};
                            }
                            else {
                                if (dbg >= 0) console.log('*%s error: SetDevice msg=%s', CurrentTime(), Reply.ErrMsg);
                                if (this.ioc && ioclevel != 2) ins.iocEvent('', mbusmma, 'error', 'in', {"Device":EiName,"DDN":DDN,"action":"set","result":Reply.ErrMsg});
                                return Reply
                            }    
                        }
                        else {
                            let eret = chkError(Reply)
                            if (dbg >= 0) console.log('*%s error: SetDevice msg=%s', CurrentTime(), eret.ErrMsg);
                            return eret
                        }
                    }
                    else {
                        let eret = chkError(setret)
                        return eret
                    }
                }
                else {
                    if (this.ioc && (ioclevel == 3 || ioclevel == 1)) ins.iocEvent('', mbusmma, 'info', 'in', {"Device":EiName,"DDN":DDN,"action":"set","result":mcerr.MC_OKMSG});
                    return {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":EdgeInfo};
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: SetDevice: no reg, SToken=%s', CurrentTime(), SToken);
                if (this.ioc && ioclevel != 2) ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"DDN":"","action":"set","result":mcerr.MC_NoReg_Msg});
                return {"ErrCode":mcerr.MC_NoReg,"ErrMsg":mcerr.MC_NoReg_Msg}    
            }
        }
        else {
            if (dbg >= 0) console.log('*%s error: SetDevice invalid data=%s', CurrentTime(), JSON.stringify(data));
            if (this.ioc && ioclevel != 2) ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"DDN":"","action":"set","result":mcerr.MC_InvalidData_Msg});
            return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
        }
    }
    // data: {SToken}
    async _GetDevice(data){
        let ins = this.mbstack
        let SToken = data.SToken
        if (dbg >= 3) console.log('*%s debug: GetDevice data=%s', CurrentTime(), JSON.stringify(data));
        if (SToken){
            let info = chkUserSession(SToken, false);
            if ( info ){
                //let {EiName,DDN} = info
                let getret = await ins.CallXrpc(this.dc, 'getinfo', [data], null, null)
                if (dbg >= 3) console.log('*%s debug: GetDevice data=%s', CurrentTime(), JSON.stringify(getret));
                let Reply = chkReply(getret)
                if (Reply){
                    if (typeof Reply.ErrCode != 'undefined' && typeof Reply.result != 'undefined'){
                        //let etype = 'error';
                        //if (Reply.ErrCode == mcerr.MC_OKCODE && Reply.result) etype = 'info';
                        //if (this.ioc) ins.iocEvent('', mbusmma, etype, 'in', {"Device":EiName,"DDN":DDN,"action":"get","result":Reply.ErrMsg});
                        return Reply    
                    }
                    else {
                        let eret = chkError(Reply)
                        if (dbg >= 0) console.log('*%s error: GetDevice msg=%s', CurrentTime(), eret.ErrMsg);
                        return eret
                    }
                }
                else {
                    let eret = chkError(getret)
                    if (dbg >= 0) console.log('*%s error: GetDevice msg=%s', CurrentTime(), eret.ErrMsg);
                    return eret;
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: GetDevice: no reg, SToken=%s', CurrentTime(), SToken);
                //if (this.ioc) ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"DDN":"","action":"get","result":mcerr.MC_NoReg_Msg});
                return {"ErrCode":mcerr.MC_NoReg,"ErrMsg":mcerr.MC_NoReg_Msg,"info":{"SToken":SToken,"EiToken":EiToken}}    
            }
        }
        else {
            if (dbg >= 0) console.log('*%s error: GetDevice: invalid data=%s', CurrentTime(), JSON.stringify(data));
            //if (this.ioc) ins.iocEvent('', mbusmma, 'error', 'in', {"Device":mbusmma,"DDN":"","action":"get","result":mcerr.MC_InvalidData_Msg});
            return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
        }
    }
    async _DirectSendXmsg(xdata, sinfo, ts){
        let ins = this.mbstack;
        let mbusmma = this.umma;
        try {
            //console.log('DirectSendXmsg xdata=', xdata)
            let {to} = xdata;
            let inctl = xdata.in;
            let {fm} = inctl;    
            let skey = '';
            let ftime = 0
            let trace = typeof xdata.data.cmd == 'string' ? (xdata.data.cmd == 'trace' ? true : false) : false
            //console.log('*%s DirectSendXmsg trace=%s,inflag=%s', CurrentTime(), trace, inflag);
            if (to.DDN) {
                skey = to.DDN;
            }
            else if (to.Target) {
                skey = to.Target;
            }
            if (skey){
                let mmlist = await this._SearchMMA(skey, sinfo, to)
                if (trace) {
                    let nt = new Date()
                    ftime = nt.getTime() - ts.getTime()
                }
                //console.log('DirectSendXmsg MMA=', mmlist)
                if (mmlist.length > 0){
                    let result = await this._ProcSendXmsg(xdata, mmlist, ts, skey);
                    if (trace){
                        this._ProcTraceResult(result, ftime)
                        return result
                    }
                    else {
                        //if (this.ioc && ioclevel != 1 && !inflag && xdata.data) rptIOC(ins, result, xdata.data, 'send' )   
                        return result; 
                    }  
                }
                else {
                    let nt = new Date()
                    let diff = nt.getTime() - ts.getTime();
                    let state = {"ErrCode":mcerr.MC_NoMatchDDN,"ErrMsg":mcerr.MC_NoMatchDDN_Msg,"UseTime":diff};
                    let eret = [{"IN":{"From":fm,"To":to,"State":state},"Reply":""}]
                    //if (this.ioc && ioclevel != 1 && xdata.data) rptIOC(ins, eret, xdata.data, 'send' )   
                    return eret
                }
            }
            else {
                let nt = new Date()
                let diff = nt.getTime() - ts.getTime();
                let state = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"UseTime":diff};
                if (dbg >= 0) console.log('*%s error: DirectSendXmsg msg=%s', CurrentTime(), state.ErrMsg);
                let eret = [{"IN":{"From":fm,"To":to,"State":state},"Reply":"","By":mbusmma}]
                return eret 
            }
        }
        catch(err){
            if (dbg >= 0) console.log('*%s error: DirectSendXmsg msg=%s', CurrentTime(), err.message);
            return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message,"By":mbusmma}},"Reply":""}] 
        }
    }
    async _SearchMMA(skey, sinfo, to){
        let mmlist = []
        mmlist = this.MATL.search(skey)
        //console.log('*%s DirectSendXmsg SearchMMATbl=', CurrentTime(), mmlist)
        //if (mmlist.length == 0) {
        if (mmlist == null) {
            let sflag = false
            if (to.DCMMA){
                sflag = true
                mmlist = await this._SearchDcLocalMMA(to.DCMMA, skey) 
            }
            else {
                if (typeof to.Search == 'string') {
                    if (to.Search == 'local') sflag = true
                }
                mmlist = await this._SearchDcMMA(skey, sinfo, sflag) 
            }
            //if (mmlist.length > 0) this.MATL.save(skey, mmlist)
            if (dbg >= 2) console.log('*%s debug: SearchDcMMA no=%d', CurrentTime(), mmlist.length)
            this.MATL.save(skey, mmlist, sinfo.SToken, sflag)
        }
        if (mmlist.length > 1) mmlist = PickupDDN(mmlist)
        return mmlist
    }
    _ProcTraceResult(result, ftime){
        //if (dbg >= 2) console.log('*%s ProcTraceResult result=%s', CurrentTime(), JSON.stringify(result));
        if (Array.isArray(result)){
            let len = result.length
            for (let i = 0; i < len; i++){
                let rr = result[i]
                if (rr.IN) {
                    if (rr.IN.State){
                        let state = rr.IN.State
                        let nstate = {"ErrCode":state.ErrCode,"ErrMsg":state.ErrMsg,"FindTime":ftime,"UseTime":state.UseTime}
                        rr.IN.State = nstate
                    }
                }
            }
        }
    }
    async _SearchDcMMA(stext, einfo, sflag){
        if (dbg >= 2) console.log('*%s debug: SearchDcMMA stext=%s,sflag=%s', CurrentTime(), stext, sflag)
        let {SToken} = einfo
        let data = {"SToken":SToken,"Keyword":stext,"SearchFlag":sflag}
        let ins = this.mbstack
        let callret = await ins.CallXrpc(this.dc, 'searchmma', [data], null, null)
        let reply = chkReply(callret)
        if (reply){
            if (typeof reply.ErrCode != 'undefined'){
                if (reply.ErrCode == mcerr.MC_OKCODE){
                    if (reply.mmalist) {
                        if (dbg >= 3) console.log('*%s debug: SearchDcMMA reply=%s', CurrentTime(), JSON.stringify(reply.mmalist))
                        return reply.mmalist
                    }
                    else {
                        return []
                    }
                }
                else {
                    let errmsg = reply.ErrMsg
                    if (dbg >= 0) console.log('*%s error: SearchDcMMA msg=%s', CurrentTime(), errmsg)
                    let mlist = this.MATL.searcharch(stext)
                    if (mlist) return mlist
                    else return []
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: SearchDcMMA result=%s', CurrentTime(), JSON.stringify(callret))
                return []
            }
        }
        else {
            if (dbg >= 0) console.log('*%s error: SearchDcMMA result=%s', CurrentTime(), JSON.stringify(callret))
            return []
        }
    }
    async _SearchDcLocalMMA(dcmma, stext){
        let data = {"Keyword":stext}
        let ins = this.mbstack
        let callret = await ins.CallXrpc(dcmma, 'searchlocalmma', [data], null, null)
        let reply = chkReply(callret)
        if (reply){
            if (typeof reply.ErrCode != 'undefined'){
                if (reply.ErrCode == mcerr.MC_OKCODE){
                    if (reply.mmalist) {
                        return reply.mmalist
                    }
                    else {
                        return []
                    }
                }
                else {
                    let errmsg = reply.ErrMsg
                    if (dbg >= 0) console.log('*%s error: SearchDcLocalMMA msg=%s', CurrentTime(), errmsg)
                    let mlist = this.MATL.searcharch(stext)
                    if (mlist) return mlist
                    else return []
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: SearchDcLocalMMA result=%s', CurrentTime(), JSON.stringify(callret))
                return []
            }
        }
        else {
            if (dbg >= 0) console.log('*%s error: SearchDcLocalMMA result=%s', CurrentTime(), JSON.stringify(callret))
            return []
        }
    }
    async _ProcSendXmsg(body, mlist, ts, key){
        let ins = this.mbstack;
        let {to,data} = body;
        let inctl = body.in;
        let {fm, msgtype, t1, t2} = inctl;
        let pm = [];
        for (let i = 0; i < mlist.length; i++){
            let {EiMMA,DDN,EiName,EiType} = mlist[i]
            if (typeof msgtype == 'undefined') msgtype = ''
            let newin = {"fm":fm,"to":{"DDN":DDN,"Name":EiName,"Type":EiType,"Topic":to.Topic,"EiMMA":EiMMA},"msgtype":msgtype};
            let nbody = {"in":newin,"data":data};
            if (dbg >= 3) console.log('*%s debug: ProcSendXmsg body=%s', CurrentTime(), JSON.stringify(nbody));
            let result = await ins.SendXmsg(EiMMA, nbody, t1, t2)
            if (dbg >= 3) console.log('*%s debug: ProcSendXmsg SendXmsg result=%s', CurrentTime(), JSON.stringify(result));
            let nt = new Date()
            let diff = nt.getTime() - ts.getTime();
            //let state = {"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg,"UseTime":diff};
            let state = result.IN
            state.UseTime = diff
            let ret = null;
            let replyerr = false
            if (typeof result.Result != 'undefined') {
                let sendret = result.Result
                ret = {"IN":{"From":newin.fm,"To":newin.to,"State":state},"Reply":sendret}
                replyerr = this._chkReplyError(result.Result)
            }
            else ret = {"IN":{"From":newin.fm,"To":newin.to,"State":state},"Reply":""}
            if (state.ErrCode != mcerr.MC_OKCODE || replyerr) this.MATL.rm(key)
            pm.push(ret)        
        }
        if (pm.length == 0){
            let state = {"ErrCode":mcerr.MC_NoMatchDDN,"ErrMsg":mcerr.MC_NoMatchDDN_Msg};
            let err = {"IN":{"From":fm,"To":to,"State":state},"Reply":""}
            pm.push(err)
        }
        //console.log('ProcSendXmsg return=%s', JSON.stringify(pm))
        return pm;
    }
    _chkReplyError(reply){
        if (typeof reply.ErrCode) {
            let err = reply.ErrCode
            let emsg = reply.ErrMsg
            if (err == mcerr.MC_ERRCODE){
                if (emsg == 'No listen app' || emsg == 'DDN not found' || emsg == 'Target not found' ) return true
            }
            else if (err == mcerr.MC_InvalidSToken || err == mcerr.MC_NoReg) return true
        }
        return false
    }
    async _SendXmsg(xmsg){
        let mbusmma = this.umma
        let ts = new Date()
        try {
            let {SToken,DDN,Topic,Data,SendTimeout,WaitReply} = xmsg;
            if (dbg >= 2) console.log('*%s info: SendXmsg DDN=%s Topic=%s', CurrentTime(), DDN,Topic);
            if (dbg >= 3) console.log('*%s debug: SendXmsg data=%s', CurrentTime(), JSON.stringify(xmsg));
            if (SToken && (DDN || Topic)){
                let info = chkUserSession(SToken, false);
                if ( info ){
                    let Addr = null
                    if ( DDN )
                        Addr = DDNParser(DDN, Topic, this.operation);
                    else if ( Topic )
                        Addr = TopicParser(Topic);
                    if ( Addr && Data ){
                        if (dbg >= 3) console.log('*%s debug: SendXmsg Addr=%s', CurrentTime(), JSON.stringify(Addr));
                        let timeout = (typeof SendTimeout == 'number')? SendTimeout: DefaultXmsgTimeout
                        let waitreply = (typeof WaitReply == 'number')? WaitReply: DefaultWaitTimeout;
                        let inret = null;
                        let ins = this.mbstack
                        let {DDN,EiName,EiType,Uid,EiMMA} = info;
                        let fm = {"DDN":DDN,"Name":EiName,"Type":EiType,"Uid":Uid,"EiMMA":EiMMA};
                        if (Addr.mode == 'mbmma') {
                            let mma = Addr.to
                            inret = await ins.SendXmsg(mma, Data, timeout, waitreply)
                            let nt = new Date()
                            let diff = nt.getTime() - ts.getTime()
                            let state = inret.IN
                            state.UseTime = diff
                            if (dbg >= 2) console.log('*%s info: SendXmsg to=%s result=%s', CurrentTime(), mma, state.ErrMsg);
                            let ret = null;
                            if (typeof inret.Result != 'undefined') 
                                ret = {"IN":{"From":fm,"To":mma,"State":state},"Reply":inret.Result}
                            else 
                                ret = {"IN":{"From":fm,"To":mma,"State":state},"Reply":""}
                            return [ret]
                        }
                        else if (Addr.mode == 'mcmma') {
                            let to = {"Mode":"m2m","Name":Addr.to.MMA,"Target":Addr.to.Target,"Topic":Addr.to.Topic}
                            let xdata = {"in":{"fm":fm,"to":to},"data":Data};
                            if (dbg >= 3) {
                                console.log('*%s debug: SendXmsg mma=%s', CurrentTime(), Addr.to.MMA)
                                console.log('*%s debug: SendXmsg data=%s', CurrentTime(), JSON.stringify(xdata))
                            }
                            inret = await ins.SendXmsg(Addr.to.MMA, xdata, timeout, waitreply)
                            let nt = new Date()
                            let diff = nt.getTime() - ts.getTime()
                            let state = inret.IN
                            state.UseTime = diff
                            if (state.ErrMsg != mcerr.MC_OKMSG) console.log('*%s error: SendXmsg to=%s msg=%s', CurrentTime(), Addr.to.MMA, state.ErrMsg);
                            else if (dbg >= 2) console.log('*%s info: SendXmsg to=%s result=%s', CurrentTime(), Addr.to.MMA, state.ErrMsg);
                            let ret = null;
                            if (inret.Result) 
                                ret = {"IN":{"From":fm,"To":to,"State":state},"Reply":inret.Result}
                            else 
                                ret = {"IN":{"From":fm,"To":to,"State":state},"Reply":""}
                            return [ret]
                        }
                        else if (Addr.mode == 'direct' || Addr.mode == 'direct2'){
                            let xdata = {"stoken":SToken,"in":{"fm":fm,"msgtype":"","t1":timeout,"t2":waitreply},"to":Addr.to,"data":Data};
                            let dsret = await this._DirectSendXmsg(xdata, info, ts)
                            return dsret
                        }
                        else if (Addr.mode == 'in'){
                            let xdata = {"stoken":SToken,"in":{"fm":fm,"msgtype":"in","t1":timeout,"t2":waitreply},"to":Addr.to,"data":Data};
                            inret = await this._InFunc(xdata, info);
                            if (inret) return inret
                            else {
                                if (this.operation == 'direct' && xdata.to.DDN != 'dc'){
                                    let indret = await this._DirectSendXmsg(xdata, info, ts)
                                    if (dbg >= 3) console.log('*%s debug: SendXmsg in result=%s', CurrentTime(), JSON.stringify(indret));
                                    return indret
                                }
                                else {
                                    let inret = await ins.SendXmsg(this.dc, xdata, timeout, waitreply) 
                                    if (typeof inret.Result != 'undefined'){
                                        let mcret = this._ProcSendResult(inret, ts)
                                        if (mcret) {
                                            if (dbg >= 3) console.log('*%s debug: SendXmsg in result=%s', CurrentTime(), JSON.stringify(inret));
                                            return mcret
                                        }
                                        else {
                                            let nstate = mcret.IN ? mcret.IN : {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid Result"}
                                            mcret = [{"IN":{"From":xdata.in.fm,"To":xdata.to,"State":nstate},"Reply":""}]
                                        }                           
                                    }
                                    else {
                                        let nt = new Date()
                                        let diff = nt.getTime() - ts.getTime()    
                                        if (typeof inret.ErrCode != 'undefined')
                                            state = {"ErrCode":inret.ErrCode,"ErrMsg":inret.ErrMsg,"UseTime":diff}
                                        else
                                            state = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid Result","UseTime":diff} 
                                        if (state.ErrMsg != mcerr.MC_OKMSG) console.log('*%s error: SendXmsg to=%s msg=%s', CurrentTime(), dcenter, state.ErrMsg);
                                        else if (dbg >= 2) console.log('*%s info: SendXmsg to=%s result=%s', CurrentTime(), Addr.to.MMA, state.ErrMsg);
                                        mcret = [{"IN":{"From":xdata.in.fm,"To":xdata.to,"State":state},"Reply":""}]
                                        return mcret
                                    }
        
                                }
                            }
                        }
                        else if (Addr.mode == 'dc'){
                            //let {DDN,EiName,EiType,Uid} = info;
                            //let fm = {"DDN":DDN,"Name":EiName,"Type":EiType,"Uid":Uid};
                            let xdata = {"stoken":SToken,"in":{"fm":fm,"msgtype":"","t1":timeout,"t2":waitreply},"to":Addr.to,"data":Data};
                            let dcenter = this.dc
                            let result = await ins.SendXmsg(dcenter, xdata, timeout, waitreply)                            
                            if (dbg >= 3) console.log('*%s SendXmsg by dc result=%s', CurrentTime(), JSON.stringify(result));
                            let mcret = null
                            if (typeof result.Result != 'undefined'){
                                let pret = this._ProcSendResult(result, ts)
                                mcret = pret.Result
                            }
                            else {
                                let nt = new Date()
                                let diff = nt.getTime() - ts.getTime()    
                                if (typeof result.ErrCode != 'undefined')
                                    state = {"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg,"UseTime":diff}
                                else
                                    state = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid Result","UseTime":diff} 
                                if (state.ErrMsg != mcerr.MC_OKMSG) console.log('*%s error: SendXmsg to=%s msg=%s', CurrentTime(), dcenter, state.ErrMsg);
                                else if (dbg >= 2) console.log('*%s info: SendXmsg to=%s result=%s', CurrentTime(), Addr.to.MMA, state.ErrMsg);
    
                                mcret = [{"IN":{"From":xdata.in.fm,"To":xdata.to,"State":state},"Reply":""}]
                            }
                            return mcret    
                        }
                        else {
                            if (dbg >= 0) console.log('*%s error: SendXmsg: Mode not supported', CurrentTime())
                            return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Unsupport mode","By":mbusmma}},"Reply":""}]     
                        }
                    }
                    else {
                        if (dbg >= 0) console.log('*%s error: SendXmsg: Invalid data=%s', CurrentTime(), JSON.stringify(xmsg))
                        return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"By":mbusmma}},"Reply":""}] 
                    }
                }
                else {
                    if (dbg >= 0) console.log('*%s error: SendXmsg: No reg, SToken=%s', CurrentTime(), SToken);
                    return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_NoReg,"ErrMsg":mcerr.MC_NoReg_Msg,"By":mbusmma}},"Reply":""}] 
                }
            }
            else {
                if (dbg >= 0) console.log('*%s SendXmsg error: Invalid data=%s', CurrentTime(), JSON.stringify(xmsg));
                return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"By":mbusmma}},"Reply":""}] 
            }
        }
        catch(e){
            if (dbg >= 0) console.log('*%s error: SendXmsg: %s', CurrentTime(), e.message);
            return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message,"By":mbusmma}},"Reply":""}] 
        }
    }
    _ProcSendResult(result, ts){
        console.log('*%s info: ProcSendResult: %s', CurrentTime(), JSON.stringify(result));
        if (result.Result) {
            let nt = new Date()
            let diff = nt.getTime() - ts.getTime()    
            if (Array.isArray(result.Result)){
                let ret = result.Result
                let len = ret.length
                for (let i = 0; i < len; i++){
                    let rr = ret[i]
                    if (rr.IN) {
                        if (rr.IN.State){
                            let state = rr.IN.State
                            let nstate = state
                            nstate.UseTime = diff
                            rr.IN.State = nstate
                        }
                    }
                }
                return result.Result
            }
            else {
                let ret = result.Result
                if (ret.IN){
                    if (ret.IN.State){
                        let state = ret.IN.State
                        let nstate = state
                        nstate.UseTime = diff
                        ret.IN.State = nstate
                    }
                }
                return [ret]
            }
        }
        return null
        /*
        let nt = new Date()
        let diff = nt.getTime() - ts.getTime()
        if (Array.isArray(result.Result)){
            let ret = result.Result
            let len = ret.length
            for (let i = 0; i < len; i++){
                let rr = ret[i]
                if (rr.IN) {
                    if (rr.IN.State){
                        let state = rr.IN.State
                        let nstate = state
                        nstate.UseTime = diff
                        rr.IN.State = nstate
                    }
                }
            }
        }
        return result
        */
    }
    async _DirectCallXrpc(xdata, sinfo, ts){
        let ins = this.mbstack;
        let mbusmma = this.umma;
        try {
            //console.log('DirectCallXrpc xdata=', xdata)
            let {to} = xdata;
            let inctl = xdata.in;
            let {fm} = inctl;    
            let skey = '';
            let ftime = 0
            let trace = typeof xdata.data.cmd == 'string' ? (xdata.data.cmd == 'trace' ? true : false) : false
            if (to.DDN) {
                skey = to.DDN;
            }
            else if (to.Target) {
                skey = to.Target;
            }
            if (skey){
               let mmlist = await this._SearchMMA(skey, sinfo, to)
                if (trace) {
                    let nt = new Date()
                    ftime = nt.getTime() - ts.getTime()
                }
                if (mmlist.length > 0){
                    let result = await this._ProcCallXrpc(xdata, mmlist, ts, skey);
                    if (trace){
                        this._ProcTraceResult(result, ftime)
                        return result
                    }
                    else {
                        //if (this.ioc && ioclevel != 1 && xdata.data) rptIOC(ins, result, xdata.data, 'call' )   
                        return result; 
                    }  
                }
                else {
                    let nt = new Date()
                    let diff = nt.getTime() - ts.getTime()
                    let state = {"ErrCode":mcerr.MC_NoMatchDDN,"ErrMsg":mcerr.MC_NoMatchDDN_Msg,"UseTime":diff};
                    let eret = [{"IN":{"From":fm,"To":to,"State":state},"Reply":"","By":mbusmma}] 
                    return eret    
                }    
            }
            else {
                let nt = new Date()
                let diff = nt.getTime() - ts.getTime()
                let state = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"UseTime":diff};
                if (dbg >= 0) console.log('*%s error: DirectCallXrpc msg=%s', CurrentTime(), state.ErrMsg);
                let eret = [{"IN":{"From":fm,"To":to,"State":state},"Reply":"","By":mbusmma}] 
                return eret
            }
        }
        catch(err){
            let nt = new Date()
            let diff = nt.getTime() - ts.getTime()
            if (dbg >= 0) console.log('*%s error: DirectCallXrpc msg=%s', CurrentTime(), err.message);
            return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":err.message,"UseTime":diff,"By":mbusmma}},"Reply":""}] 
        }
    }
    async _ProcCallXrpc(body, mlist, ts, key){
        let ins = this.mbstack;
        let {to,func,data} = body;
        let inctl = body.in;
        let {fm, msgtype, t1, t2} = inctl;
        let pm = [];
        for (let i = 0; i < mlist.length; i++){
            let {EiMMA,DDN,EiName,EiType} = mlist[i]
            if (typeof msgtype == 'undefined') msgtype = ''
            let newin = {"fm":fm,"to":{"DDN":DDN,"Name":EiName,"Type":EiType,"Topic":to.Topic},"msgtype":msgtype};
            let nbody = {"in":newin,"data":data};
            if (dbg >= 3) console.log('*%s debug: ProcCallXrpc body=%s', CurrentTime(), JSON.stringify(nbody));
            let result = await ins.CallXrpc(EiMMA, func, [nbody], t1, t2)
            if (dbg >= 3) console.log('*%s debug: ProcCallXrpc result=%s', CurrentTime(), JSON.stringify(result));
            let nt = new Date()
            let diff = nt.getTime() - ts.getTime();
            let state = {"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg,"UseTime":diff};
            let ret = null;
            let replyerr = false
            if (result.Reply) {
                ret = {"IN":{"From":newin.fm,"To":newin.to,"State":state},"Reply":result.Reply}
                replyerr = this._chkReplyError(result.Reply)
            }
            else ret = {"IN":{"From":newin.fm,"To":newin.to,"State":state},"Reply":""}
            if (state.ErrCode != mcerr.MC_OKCODE || replyerr) this.MATL.rm(key)
            pm.push(ret)        
        }
        if (pm.length == 0){
            let nt = new Date()
            let diff = nt.getTime() - ts.getTime();
            let state = {"ErrCode":mcerr.MC_NoMatchDDN,"ErrMsg":mcerr.MC_NoMatchDDN_Msg,"UseTime":diff};
            let err = {"IN":{"From":fm,"To":to,"State":state},"Reply":""}
            pm.push(err)
        }
        //console.log('ProcSendXmsg return=%s', JSON.stringify(pm))
        return pm;
    }
    async _CallXrpc(xrpc){
        let mbusmma = this.umma;
        let ts = new Date();
        try {
            let {SToken,DDN,Topic,Func,Data,SendTimeout,WaitReply} = xrpc;
            if (dbg >= 2) console.log('*%s info: CallXrpc DDN=%s,Func=%s', CurrentTime(), DDN, Func)
            else if (dbg >= 3) console.log('*%s debug: CallXrpc SToken=%s,xrpc=%s', CurrentTime(), SToken, JSON.stringify(xrpc))
            if (SToken && (DDN || Topic)){
                let info = chkUserSession(SToken, false);
                if ( info ){
                    let Addr = null;
                    if ( DDN )
                        Addr = DDNParser(DDN, Topic, this.operation);
                    else if ( Topic )
                        Addr = TopicParser(Topic);
                    if ( Addr && Func && Data ){
                        let ins = this.mbstack
                        if (dbg >= 3) console.log('*%s debug: CallXrpc Addr=%s', CurrentTime(), JSON.stringify(Addr))
                        let timeout = (typeof SendTimeout == 'number')? SendTimeout: DefaultXmsgTimeout
                        let waitreply = (typeof WaitReply == 'number')? WaitReply: DefaultWaitTimeout;        
                        let {DDN,EiName,EiType,Uid,EiMMA} = info;
                        let fm = {"DDN":DDN,"Name":EiName,"Type":EiType,"Uid":Uid,"EiMMA":EiMMA};
                        if (Addr.mode == 'mbmma') {
                            let mma = Addr.to
                            let callret = await ins.CallXrpc(mma, Func, Data, timeout, waitreply)
                            let nt = new Date()
                            let diff = nt.getTime() - ts.getTime()
                            let state = null
                            if (typeof callret.ErrMsg != 'undefined')
                            state = {"ErrCode":callret.ErrCode,"ErrMsg":callret.ErrMsg,"UseTime":diff};
                            else
                                state = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid result","UseTime":diff}
                            if (dbg >= 2) console.log('*%s info: CallXrpc result=%s', CurrentTime(), state.ErrMsg);
                            let ret = null;
                            if (callret.Reply) 
                                ret = {"IN":{"From":fm,"To":mma,"State":state},"Reply":callret.Reply}
                            else 
                                ret = {"IN":{"From":fm,"To":mma,"State":state},"Reply":""}
                            return [ret]
                        }
                        else if (Addr.mode == 'mcmma') {
                            let to = {"Mode":"m2m","Name":Addr.to.MMA,"Target":Addr.to.Target,"Topic":Addr.to.Topic}
                            let xdata = {"in":{"fm":fm,"to":to},"data":Data};
                            if (dbg >= 2) console.log('*%s info: CallXrpc mma=', CurrentTime(), Addr.to.MMA)
                            if (dbg >= 3) console.log('*%s debug: CallXrpc xdata=%s', CurrentTime(), JSON.stringify(xdata))
                            let callret = await ins.CallXrpc(Addr.to.MMA, Func, [xdata], timeout, waitreply)
                            if (dbg >= 3) console.log('*%s info: CallXrpc reply=%s', CurrentTime(), JSON.stringify(callret))
                            let nt = new Date()
                            let diff = nt.getTime() - ts.getTime()
                            let state = null
                            if (typeof callret.ErrMsg != 'undefined')
                                state = {"ErrCode":callret.ErrCode,"ErrMsg":callret.ErrMsg,"UseTime":diff};
                            else
                                state = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid result","UseTime":diff}
                            if (dbg >= 2) console.log('*%s info: CallXrpc result=%s', CurrentTime(), state.ErrMsg);
                            let ret = null;
                            if (callret.Reply) 
                                ret = {"IN":{"From":xdata.in.fm,"To":xdata.in.to,"State":state},"Reply":callret.Reply}
                            else 
                                ret = {"IN":{"From":xdata.in.fm,"To":xdata.in.to,"State":state},"Reply":""}
                            return [ret]
                        }
                        else if (Addr.mode == 'direct' || Addr.mode == 'direct2'){
                            let xdata = {"stoken":SToken,"in":{"fm":fm,"msgtype":"","t1":timeout,"t2":waitreply,},"to":Addr.to,"func":Func,"data":Data};
                            let dlret = this._DirectCallXrpc(xdata, info, ts)
                            return dlret
                        }
                        if (Addr.mode == 'xs'){
                            let result = await this._XsFunc(xrpc)
                            return result
                        }
                        else if (Addr.mode == 'uc'){
                            let result = null
                            if (Addr.to.Topic == '')
                                result = await this._UcFunc(info, Func, xrpc, 'raw')
                            else
                                result = await this._UcFunc(info, Addr.to.Topic, xrpc, 'topic') 
                            //if (dbg >= 0) console.log('*%s CallXrpc uc result=', CurrentTime(), JSON.stringify(result))
                            return result
                        }
                        else if (Addr.mode == 'dc'){
                            // In function and normal callxrpc
                            //let {DDN,EiName,EiType,Uid} = info;
                            //let fm = {"DDN":DDN,"Name":EiName,"Type":EiType,"Uid":Uid};
                            let xdata = {"stoken":SToken,"in":{"fm":fm,"msgtype":"","t1":timeout,"t2":waitreply,},"to":Addr.to,"func":Func,"data":Data};
                            let callret = await ins.CallXrpc(this.dc, 'call', [xdata], timeout, waitreply)
                            if ( dbg >= 3 ) console.log('*%s info: CallXrpc result=%s', CurrentTime(), JSON.stringify(callret));
                            let mcret = null
                            let state = null
                            if (typeof callret.Reply != 'undefined'){
                                callret = this._ProcCallResult(callret, ts) 
                                mcret = callret.Reply
                            }
                            else {
                                let nt = new Date()
                                let diff = nt.getTime() - ts.getTime()    
                                if (typeof callret.ErrCode != 'undefined')
                                    state = {"ErrCode":callret.ErrCode,"ErrMsg":callret.ErrMsg,"UseTime":diff}
                                else
                                    state = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid Reply","UseTime":diff} 
                                mcret = [{"IN":{"From":xdata.in.fm,"To":xdata.to,"State":state},"Reply":""}]
                            }
                            return mcret
                        }
                        else {
                            if (dbg >= 0) console.log('*%s error: CallXrpc: Mode not supported', CurrentTime());
                            return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Unsupport mode","By":mbusmma}},"Reply":""}]     
                        }    
                    }
                    else{
                        if (dbg >= 0) console.log('*%s error: CallXrpc: invalid data, xrpc=%s', CurrentTime(), JSON.stringify(xrpc));
                        return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"By":mbusmma}},"Reply":""}] 
                    } 
                }
                else {
                    if (dbg >= 0) console.log('*%s error: CallXrpc: no reg, SToken=%s', CurrentTime(), SToken);
                    return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":"no reg","By":mbusmma}},"Reply":""}] 
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: CallXrpc: invalid xrpc=%s', CurrentTime(), JSON.stringify(xrpc));
                return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"By":mbusmma}},"Reply":""}] 
            }
        }
        catch(e){
            if (dbg >= 0) console.log('*%s error: CallXrpc msg=%s', CurrentTime(), e.message);
            return [{"IN":{"From":"","To":"","State":{"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message,"By":mbusmma}},"Reply":""}] 
        }
    }
    _ProcCallResult(result, ts){
        let nt = new Date()
        let diff = nt.getTime() - ts.getTime()
        if (Array.isArray(result.Reply)){
            let ret = result.Reply
            let len = ret.length
            for (let i = 0; i < len; i++){
                let rr = ret[i]
                if (rr.IN) {
                    if (rr.IN.State){
                        let state = rr.IN.State
                        let nstate = state
                        nstate.UseTime = diff
                        rr.IN.State = nstate
                    }
                }
            }
        }
        return result
    }
    async _CallMCFunc(method, dcfunc, data){
        let SToken = data.SToken
        if (dbg >= 3) console.log('*%s debug: CallMCFunc %s data=%s', CurrentTime(), method, JSON.stringify(data));
        if (method && dcfunc && SToken){
            let info = chkUserSession(SToken, false);
            if ( info ){
                let ins = this.mbstack
                let callret = await ins.CallXrpc(this.dc, dcfunc, [data], null, null)
                if (dbg >= 2) console.log('*%s info: CallMCFunc %s result=%s', CurrentTime(), method, callret.ErrMsg)
                else if (dbg >= 3) console.log('*%s debug: CallMCFunc %s result=%s', CurrentTime(), method, JSON.stringify(callret))
                let Reply = chkReply(callret)
                if (Reply){
                    if (typeof Reply.ErrCode != 'undefined'){
                        return Reply    
                    }
                    else {
                        let eret = chkError(Reply)
                        if (dbg >= 0) console.log('*%s info: CallMCFunc %s result=%s', CurrentTime(), method, eret.ErrMsg);
                        return eret
                    }
                }
                else {
                    let eret = chkError(callret)
                    if (dbg >= 0) console.log('*%s error: CallMCFunc %s msg=%s', CurrentTime(), method, eret.ErrMsg);
                    return eret;
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: CallMCFunc %s: no reg, SToken=%s', CurrentTime(), method, SToken);
                return {"ErrCode":mcerr.MC_NoReg,"ErrMsg":mcerr.MC_NoReg_Msg,"info":{"SToken":SToken,"EiToken":EiToken}}    
            }
        }
        else {
            if (dbg >= 0) console.log('*%s error: CallMCFunc %s: invalid data=%s', CurrentTime(), method, JSON.stringify(data));
            return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
        }
    } 
    _InFunc(indata, ei){
        var data, cmd, option, result
        try {
            if ( dbg >= 3 ) console.log('*%s debug: InFunc %s', CurrentTime(), JSON.stringify(indata));
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
                    var stime = new Date();
                    var stamp;
                    var ret;
                    switch(cmd){
                        case 'ping':
                            stamp = [];
                            stamp.push({"mma":this.umma,"time":stime});
                            if ( indata.to.DDN == 'local' || indata.in.fm.DDN == indata.to.DDN ){
                                result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                                return [{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"ping","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp}}];
                            }
                            else {
                                indata.data = {"cmd":cmd,"option":option,"trace":stamp};
                                return null
                            }
                        case 'trace':
                            stamp = [];
                            stamp.push({"mma":this.umma,"time":stime});
                            if ( indata.to.DDN == 'local' || indata.in.fm.DDN == indata.to.DDN ){
                                result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                                return [{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"trace","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp}}];
                            }
                            else {
                                indata.data = {"cmd":cmd,"option":option,"trace":stamp};
                                return null;
                            }
                        case 'whois':
                            if (indata.to.DDN == 'local'){
                                let eidata = ei;
                                delete eidata.ssOwner;
                                result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                                let ret = [{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"whois","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"result":eidata}}];
                                return ret;
                            }
                            else return null;
                        case 'setdbg=0':
                        case 'setdbg=1':
                        case 'setdbg=2':
                            result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                            ret = [{"IN":{"From":indata.in.fm,"To":indata.to,"State":result},"Reply":{"response":"setdbg","ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}}]
                            if (indata.to.DDN == 'local'){
                                let sval = cmd.split('=');
                                let val = parseInt(sval[1])
                                dbg = val
                                ret[0].Reply.ErrCode = mcerr.MC_OKCODE
                                ret[0].Reply.ErrMsg = mcerr.MC_OKMSG
                            }
                            return ret
                        default:
                            if (dbg >= 0) ('*%s error: InFunc: Invalid command', CurrentTime())
                            return null;
                    }
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: InFunc: Invalid data', CurrentTime());
                return null;
            }
        }
        catch(e){
            if (dbg >= 0) console.log('*%s error: InFunc: %s', CurrentTime(), e.message);
            return null;
        }
    }
    async _UcFunc(session, topic, xrpc, mode){
        try {
            let {EiMMA,SToken,EiToken} = session
            let Func = ''
            let Args = []
            if (mode == 'raw'){
                Func = topic
                Args = xrpc.Data
            }
            else if (mode == 'topic') {
                Func = topic
                let c = false
                //console.log('*%s UcFunc xrpc=%s', CurrentTime(), JSON.stringify(xrpc));
                let Data = xrpc.Data
                if (Array.isArray(xrpc.Data)) Args = xrpc.Data
                else c = true
                if (Func) Func = Func.toLowerCase();
                switch( Func ){
                    case 'checkuser':   // Data: [UserName]
                        Func = 'ucCheckUser';
                        if (c) Args = [Data.UserName];
                        break;
                    case 'signup':      // Data: [UserName, Password, UserInfo]
                        Func = 'ucSignup';
                        if (c) Args = [Data.UserName, Data.Password, Data.UserInfo];
                        break;
                    case 'login':       // Data: [UserName, Password, KeepLogin]
                        Func = 'ucLogin';
                        if (c) Args = [Data.UserName, Data.Password, Data.KeepLogin];
                        break;
                    case 'logout':      // Data: []
                        Func = 'ucLogout';
                        break;
                    case 'getuserinfo': // Data: []
                        Func = 'ucGetUserInfo';
                        break;
                    case 'setuserinfo': // Data: [UserInfo]
                        Func = 'ucSetUserInfo';
                        if (c) Args = [Data.UserInfo];
                        break;
                    case 'getusersetting':  // Data: [KeyName]
                        Func = 'ucGetUserSetting';
                        if (c) Args = [Data.KeyName];
                        break;
                    case 'setusersetting':  // Data: [KeyName, Setting]
                        Func = 'ucSetUserSetting';
                        if (c) Args = [Data.KeyName, Data.Setting];
                        break;
                    default:
                        Func = '';
                        break;    
                }
            }
            if (EiMMA && SToken && Func){
                if (dbg >= 2) console.log('*%s info: UcFunc Func=%s', CurrentTime(), Func);
                let ucdata = {"EiMMA":EiMMA,"SToken":SToken,"Func":Func,"Data":Args};
                if (dbg >= 3) console.log('*%s debug: UcFunc ucdata=%s', CurrentTime(), JSON.stringify(ucdata));
                let ts = new Date()
                let result = await uc.UcCall(this, ucdata)
                let nt = new Date()
                let diff = nt.getTime() - ts.getTime()
                if (dbg >= 2) console.log('*%s info: UcFunc result=%s', CurrentTime(), result.ErrMsg);
                else if (dbg >= 3) console.log('*%s debug: UcFunc result=%s', CurrentTime(), JSON.stringify(result));
                let reply = chkReply(result)
                if (reply){
                    let ret = GetUcResult(Func, reply);
                    if ((Func == 'ucLogin' || Func == 'ucLogout') && ret.ErrCode == mcerr.MC_OKCODE ){
                        HandleUserInfo(Func, EiToken, SToken, reply);
                    }
                    ret.UseTime = diff
                    if (dbg >= 3) console.log('*%s debug: UcFunc result=%s', CurrentTime(), JSON.stringify(ret));
                    return ret  
                }
                else {
                    let eret = chkError(result)
                    eret.UseTime = diff
                    if (dbg >= 0) console.log('*%s error: UcFunc msg=%s', CurrentTime(), eret.ErrMsg);
                    return eret;
                }
            }
            else {
                if (dbg >= 0) console.log('*%s error: UcFunc: Invalid data', CurrentTime());
                return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg,"UseTime":0}
            }
        }
        catch(e){
            if (dbg >= 0) console.log('*%s error: UcFunc msg=%s', CurrentTime(), e.message);
            return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message,"UseTime":0}
        }    
    }
    async _XsFunc(xsdata){
        let ts = new Date()
        let ins = this.mbstack
        let {Topic, Func, Data} = xsdata;
        if ( dbg >= 2 ) console.log('*%s info: XsFunc Topic=%s,Func=%s', CurrentTime(), Topic, Func);
        else if ( dbg >= 3 ) console.log('*%s debug: XsFunc data=%s', CurrentTime(), JSON.stringify(xsdata));
        if (Topic && Func && Data){
            try {
                let result = await ins.xStorageFunc( xsdata )
                let nt = new Date()
                let diff = nt.getTime() - ts.getTime()
                result.UseTime = diff
                if ( dbg >= 2 ) console.log('*%s info: XsFunc result=%s', CurrentTime(), result.ErrMsg);
                else if ( dbg >= 3 ) console.log('*%s debug: XsFunc result=%s', CurrentTime(), JSON.stringify(result));
                return result
            }
            catch(e){
                return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message}
            }
        }
        else {
            return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
        }
    }
    async _mbSendXmsg(data){
        if ( dbg >= 3 ) console.log('*%s debug: mbSendXmsg data=%s', CurrentTime(), JSON.stringify(data));
        let {MMA,Data} = data
        if (MMA && Data){
            let ins = this.mbstack
            let t1 = (typeof data.SendTimeout == 'number') ? data.SendTimeout : DefaultXmsgTimeout
            let t2 = (typeof data.Waitreply == 'number') ? data.Waitreply : DefaultWaitTimeout
            let result = await ins.SendXmsg(MMA, Data, t1, t2)
            let inctl = result.IN
            if (typeof result.Result != 'undefined') return {"ErrCode":inctl.ErrCode,"ErrMsg":inctl.ErrMsg,"State":inctl.State,"Result":result.Result}
            else return {"ErrCode":inctl.ErrCode,"ErrMsg":inctl.ErrMsg,"State":inctl.State}    
        }
        else {
            let err = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
            return err
        }
    }
    async _mbCallXrpc(data){
        let {MMA,Func,Data} = data
        if (MMA && Func && Data){
            let ins = this.mbstack
            let t1 = (typeof data.SendTimeout == 'number') ? data.SendTimeout : DefaultXrpcTimeout
            let t2 = (typeof data.Waitreply == 'number') ? data.Waitreply : DefaultWaitTimeout
            let result = await ins.CallXrpc(MMA, Func, [Data], t1, t2)
            return result
        }
        else {
            let err = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
            return err
        }
    }
    async _DDNtoMMA(ddn,sinfo){
        let mma = ''
        let addr = DDNParser(ddn, '', 'direct')
        //console.log('CpCmd addr=%s', JSON.stringify(addr))
        if (addr.mode == 'mcmma') mma = addr.to.MMA
        else if (addr.mode == 'direct'){
            let target = addr.to.Target
            let sendmma = await this._SearchMMA(target, sinfo, addr.to)
            //console.log('CpCmd sendmma=%s', JSON.stringify(sendmma))
            if (sendmma.length > 0) mma = sendmma[0].EiMMA
        }
        return mma
    }
}

// end of worker



if (!mcworker) mcworker = new Worker()

class MoteChat extends EventEmitter {
    constructor(){
        super();
        this.mbstack = mbclass
        this.worker = mcworker
        this.id = ''
        this.conf = null
        this.openmc = false
    }
    /**
     * Open motechat
     * @example
        var conf = { "AppName":"", "IOC":"", "DCenter":"", "UCenter":"", "AppKey":"", "UseWeb":"", "MotebusGW":"", "Heartbeat":120 }
        conf.AppName = 'myfunc';
        conf.DCenter = 'dc@boss.ypcloud.com:6788';
        conf.AppKey = 'YfgEeop5';
        var reginfo = {"EiToken":"8dilCCKj","SToken":"baTi52uE"};
        var mChat = require('motechat');
        mChat.Open(conf, reginfo, function(result){
            console.log('open result=%s’, JSON.stringify(result));
        }
     * @function Open                       open motechat
     * @param {Object} conf                 the configuration object for init.
     * @param {String} conf.AppName         the name of motebus MMA
     * @param {String} conf.AppKey          the key string of app
     * @param {String} conf.IOC             the MMA of IOC
     * @param {String} conf.DCenter         the MMA of device center
     * @param {String} conf.MotebusGW       the IP of motebus gateway
     * @param {Object} reg                  the information of register
     * @param {String} reg.EiToken          device token
     * @param {String} reg.SToken           app token
     * @param {String} reg.WIP              WAN IP
     * @param {String} reg.LIP              LAN IP
     * @param {Object} reg.EdgeInfo         Info of Ei
     * @param {String} reg.EdgeInfo.EiName  name of device
     * @param {String} reg.EdgeInfo.EiType  type of device
     * @param {String} reg.EdgeInfo.EiTag   tag of device
     * @param {String} reg.EdgeInfo.EiLoc   location of device
     * @param {Object} reg.Option           register option
     * @param {Boolean} regdata.Option.Access use private DDN. public or private
     * @param {boolean} regdata.Option.SaveDSIM save reg data in dSIM. true or false
     * @param {openCallback} callback       the result callback function 
    */
    async Open(conf, reg, callback) {
        let reginfo = null;
        let cb = null;
        if (reg){
            if (typeof reg == 'function') cb = reg
            else {
                reginfo = reg;
                if (callback){
                    if (typeof callback == 'function') cb = callback;
                }
            }    
        }
        else {
            if (callback){
                if (typeof callback == 'function') cb = callback;
            }
        }
        let err = this._ParseOpenConf(conf)
        if (!err){
            this.id = 'mc' + CreateRandomString(4);
            this.conf = conf
            //let tm = 3000 + (Math.floor((Math.random() * 7) + 1) * 1000)
            //await this._waitMiniSec(tm)
            console.log('*%s info: Open conf=%s', CurrentTime(), JSON.stringify(conf))
            let result = await this.worker.OpenMotechat(this.id, conf)
            if (result.ErrCode == mcerr.MC_OKCODE){
                this.openmc = true
                if (dbg == 1) console.log('*%s info: Open AppName=%s result=%s', CurrentTime(), conf.AppName, result.ErrMsg)
                if (reginfo){
                    let err = this._ParseRegInfo(reginfo)
                    if (!err){
                        let ts = new Date()
                        //await this._waitMiniSec(1000); 
                        let regdata = this._TrimRegInfo(reginfo)
                        if (regdata.Option.SaveDSIM && regdata.EdgeInfo.EiName) {
                            regdata = await this._GetDsim(regdata)     
                        }            
                        let regret = await this.worker._MCFuncSync(this.id, 'reg', regdata, null)
                        let nt = new Date()
                        let diff = nt.getTime() - ts.getTime()
                        if (regret.ErrCode == mcerr.MC_OKCODE && typeof regret.result == 'object'){
                            let r = regret.result
                            if (dbg == 1) console.log('*%s info: Reg %s SToken=%s EiToken=%s DDN=%s EiName=%s EiMMA=%s', CurrentTime(), result.ErrMsg, r.SToken, r.EiToken, r.DDN, r.EiName, r.EiMMA)
                            if (regdata.Option.SaveDSIM && r.EiName) {
                                await this._SaveDsim(r)
                            }
                            if (typeof cb == 'function') cb({"ErrCode":regret.ErrCode,"ErrMsg":regret.ErrMsg,"result":r,"UCTime":regret.uctime,"UseTime":diff})        
                        }
                        else if (typeof cb == 'function') cb({"ErrCode":regret.ErrCode,"ErrMsg":regret.ErrMsg,"UCTime":regret.uctime,"UseTime":diff})
                        else return regret     
                    }
                    else {
                        let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":err}
                        return ret
                    }
                }
                else {
                    if (typeof cb == 'function') cb(result)
                    else return result    
                }
            }
            else {
                if (typeof cb == 'function') cb(result)
                else return result  
            }
        }
        else {
            if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":err})
            else return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":err}
        }
    }
    _ParseOpenConf(conf){
        if (typeof conf != 'object') return 'conf data type error'
        if (typeof conf.AppName != 'string') return 'appname data type error'
        if (typeof conf.AppKey != 'string') return 'appkey data type error'
        if (conf.AppName == '') return 'appname empty'
        if (conf.AppKey == '') return 'appkey empty'
        return ''
    }
    _ParseRegInfo(info){
        if (typeof info.SToken != 'string') return 'SToken data type error'
        if (typeof info.EiToken != 'string') return 'EiToken data type error'
        if ((info.SToken == '' && info.EiToken != '') || (info.SToken != '' && info.EiToken == '')) return 'SToken or EiToken data error'
        if (typeof info.EdgeInfo == 'object'){
            if (typeof info.EdgeInfo.EiName != 'string') return 'EiName data type error'
            if (typeof info.EdgeInfo.EiType != 'string') return 'EiType data type error'
            if (typeof info.EdgeInfo.EiTag != 'string') return 'EiTag data type error'
            if (typeof info.EdgeInfo.EiLoc != 'string') return 'EiLoc data type error'
        }
        if (typeof info.Option == 'object'){
            if (typeof info.Option.SaveDSIM != 'boolean') return 'SaveDSIM data type error'
        }
        return ''
    }  
    _ParseUnregInfo(info){
        if (typeof info.SToken != 'string') return 'SToken: data type error'
        else if (info.SToken == '') return 'SToken: empty'
        return ''
    } 
    /**
     * Close motechat
     * @function Close
     * @example 
        mChat.Close(function(result){
            console.log('Close result=%s', result);
        });
     * @param {getCallback} cb 
    */
    async _waitReady(){
        let trydelay = 1500;
        for( let i = 0; i < 10; i++ ){
            await this._waitMiniSec(trydelay);
            if (dcstate == 'conn') return true;
        }
        return false;
    }    
    async Close(cb){
        let result = await this._UnregAll()
        if (typeof cb == 'function') cb(result);
        else return result;
    }
    getDebug(){
        return dbg
    }
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
    async Isolated(func, cb){
        /*
        let ret = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"isolated function not supported"};
        if (typeof cb == 'function') cb(ret);
        else return ret;
        */
        if (func){
            let AppName = this.conf.AppName
            if (AppName){
                let result = await this.worker.PublishFunc(AppName, func);
                if (typeof cb == 'function') cb(result);
                else return result;
            }
            else {
                let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
                if (typeof cb == 'function') cb(ret);
                else return ret;
            }
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
            if (typeof cb == 'function') cb(ret);
            else return ret;
        }
    }
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
    async Publish(pubapp, func, cb){
        let pubname = pubapp ? pubapp : this.conf.AppName
        if (pubname && typeof func == 'object'){
            if ( func ){
                let result = await this.worker.PublishFunc(pubname, func);
                if (typeof cb == 'function') cb(result);
                else return result;
            }
            else {
                let ret = {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"func empty"};
                if (typeof cb == 'function') cb(ret);
                else return ret;    
            }
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
            if (typeof cb == 'function') cb(ret);
            else return ret;
        }
    }
    /**
     * OnEvent, on event handler
     * @example 
        var SToken = mydev.SToken
        var InmsgRcve = function(ch, inctl, data, retcb){
            console.log('InmsgRcve: channel=%s, from=%s, to=%s, data=%s', ch, JSON.stringify(inctl.From), JSON.stringify(inctl.To), JSON.stringify(data));
            if ( typeof retcb == 'function') retcb({"ErrCode":0, "ErrMsg":"OK"})
        }
        Var InState = function(state){
            console.log('InState=%s', state);
        }
        mChat.OnEvent('message',InmsgRcve, SToken);
        mChat.OnEvent('state', InState);
     * @function OnEvent
     * @param {String} stype    "message" is for getxmsg, "state" is for state changed
     * @param {function} cb     the user routine entry
     * @param {String} SToken   SToken of the app
     * @returns {boolean}
    */
    OnEvent(mtype, callback, stoken){
        //if (dbg >= 1) console.log('*%s onevent: %s', CurrentTime(), mtype)
        let result = {"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG}
        if (mtype == 'message' || mtype == 'event' || mtype == 'mbus' || mtype == 'state') {
            result = this.worker.setOnEvent(this.id, mtype, callback, stoken)
            //if (result.ErrCode != mcerr.MC_OKCODE) console.log('*%s onevent: %s', CurrentTime(), result.ErrMsg)
            return result    
        }
        else {
            return {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
        }
    }
    /**
     * register to device center
     * @function Reg
     * @example
        var mydev = {"EiToken":"8dilCCKj","SToken":"baTi52uE","WIP":"","LIP":""};
        mChat.Reg(mydev, function(result){
            console.log('StartSession result=%s', JSON.stringify(result));
        });
        //Note: At first time of the device, EiToken and SToken is empty.
     * @param {Object} regdata                  the information of session
     * @param {String} regdata.EiToken          device token
     * @param {String} regdata.SToken           app token
     * @param {String} regdata.WIP              wan ip
     * @param {String} regdata.LIP              lan ip
     * @param {Object} regdata.EdgeInfo         the information of edge
     * @param {String} regdata.EdgeInfo.EiName  name of device
     * @param {String} regdata.EdgeInfo.EiType  type of device
     * @param {String} regdata.EdgeInfo.EiTag   tag of device
     * @param {String} regdata.EdgeInfo.EiLoc   location of device
     * @param {Object} regdata.Option           register option
     * @param {boolean} regdata.Option.Access   use DDN. private or public
     * @param {boolean} regdata.Option.SaveDSIM save reg data in dSIM. true or false
     * @param {regCallback} cb 
    */
    async Reg(regdata, cb){
        if (dbg >= 3) console.log('*%s debug: Reg %s', CurrentTime(), JSON.stringify(regdata))
        let err = this._ParseRegInfo(regdata)
        if (!err){
            let ts = new Date()
            let regdata2 = this._TrimRegInfo(regdata)
            if (dbg >= 3) console.log('*%s debug: Reg trim %s', CurrentTime(), JSON.stringify(regdata2))
            if (regdata2.Option.SaveDSIM && regdata2.EdgeInfo.EiName) {
                regdata2 = await this._GetDsim(regdata2)     
            }
            if (dbg >= 3) console.log('*%s debug: Reg %s', CurrentTime(), JSON.stringify(regdata2))
            if (typeof cb == 'function'){
                this.worker._MCFunc(this.id, 'reg', regdata2, '', async (result) => {
                    let nt = new Date()
                    let diff = nt.getTime() - ts.getTime()
                    if (result.ErrCode == mcerr.MC_OKCODE && typeof result.result == 'object'){
                        let r = result.result
                        console.log('*%s info: Reg %s SToken=%s EiToken=%s DDN=%s EiName=%s EiMMA=%s', CurrentTime(), result.ErrMsg, r.SToken, r.EiToken, r.DDN, r.EiName, r.EiMMA)
                        if (regdata2.Option.SaveDSIM && r.EiName) {
                            await this._SaveDsim(r)
                        }
                        cb({"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg,"result":r,"UCTime":result.uctime,"UseTime":diff}) 
                    }
                    else {
                        cb({"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg,"UCTime":result.uctime,"UseTime":diff}) 
                    }
                })
            }
            else {
                return new Promise((resolve) => {
                    this.worker._MCFunc(this.id, 'reg', regdata2, '', async (result) => {
                        let nt = new Date()
                        let diff = nt.getTime() - ts.getTime()    
                        if (result.ErrCode == mcerr.MC_OKCODE && typeof result.result == 'object'){
                            let r = result.result
                            console.log('*%s info: Reg %s SToken=%s EiToken=%s DDN=%s EiName=%s EiMMA=%s', CurrentTime(), result.ErrMsg, r.SToken, r.EiToken, r.DDN, r.EiName, r.EiMMA)
                            if (regdata2.Option.SaveDSIM) {
                                let catalog = 'DSIM-' + this.conf.AppName
                                let xconf = {"catalog":catalog,"idname":r.EiName,"data":{"SToken":r.SToken,"EiToken":r.EiToken}}
                                let setret = await this.mbSetConfig(xconf)
                                if (dbg >= 3) console.log('*%s debug: Reg set result=%O', CurrentTime(), setret)                
                            }
                            resolve({"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg,"result":r,"UseTime":diff})
                        }
                        else resolve({"ErrCode":result.ErrCode,"ErrMsg":result.ErrMsg,"UseTime":diff}) 
                    })
                })
            }
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":err}
            if (dbg == 1) console.log('*%s error: Reg msg=%s', CurrentTime(), err)
            if (typeof cb == 'function') cb(ret)
            else return ret
        }
    }
    async _GetDsim(reginfo){
        let catalog = 'DSIM-' + this.conf.AppName
        let xconf = {"catalog":catalog,"idname":reginfo.EdgeInfo.EiName}
        let getret = await this.mbGetConfig(xconf)
        if (dbg >= 3) console.log('*%s debug: GetDsim result=%s', CurrentTime(), JSON.stringify(getret))
        if (getret.ErrCode == mcerr.IN_OKCODE && getret.result){
            let dsim = getret.result
            if (dsim.SToken) reginfo.SToken = dsim.SToken
            if (dsim.EiToken) reginfo.EiToken = dsim.EiToken
        }              
        return reginfo
    }
    async _SaveDsim(regret){
        let catalog = 'DSIM-' + this.conf.AppName
        let xconf = {"catalog":catalog,"idname":regret.EiName,"data":{"SToken":regret.SToken,"EiToken":regret.EiToken}}
        let setret = await this.mbSetConfig(xconf)
        if (dbg >= 3) console.log('*%s debug: SaveDsim result=%O', CurrentTime(), setret)                
    }
    _TrimRegInfo(info){
        let ret = {"SToken":"","EiToken":"","WIP":"","LIP":"","isWeb":false,"EdgeInfo":{"EiName":"","EiType":"","EiTag":"","EiLoc":""},"Option":{"Access":"public","SaveDSIM":false}}
        if (info.SToken) ret.SToken = info.SToken
        if (info.EiToken) ret.EiToken = info.EiToken
        let isWeb = false
        if (typeof info.isWeb == 'boolean') if (info.isWeb) isWeb = true
        if (isWeb){
            ret.isWeb = true
            if (typeof info.WIP == 'string') ret.WIP = info.WIP
            if (typeof info.LIP == 'string') ret.LIP = info.LIP    
        }
        //console.log('*%s TrimRegInfo mbusinfo=%O', CurrentTime(), mcworker.mbusinfo)
        if (ret.WIP == '') ret.WIP = mcworker.mbusinfo.wanIP
        if (ret.LIP == '') ret.LIP = mcworker.mbusinfo.localIP
        if (typeof info.EdgeInfo == 'object'){
            let ei = info.EdgeInfo
            if (typeof ei.EiName == 'string') ret.EdgeInfo.EiName = ei.EiName
            if (typeof ei.EiType == 'string') ret.EdgeInfo.EiType = ei.EiType
            if (typeof ei.EiTag == 'string') ret.EdgeInfo.EiTag = ei.EiTag
            if (typeof ei.EiLoc == 'string') ret.EdgeInfo.EiLoc = ei.EiLoc
        }
        else delete(ret.EdgeInfo)
        if (typeof info.Option == 'object'){
            if (typeof info.Option.Access == 'string') ret.Option.Access = info.Option.Access
            if (typeof info.Option.SaveDSIM == 'boolean') ret.Option.SaveDSIM = info.Option.SaveDSIM
        }
        //else delete(ret.Option)
        //console.log('*%s TrimRegInfo new reginfo=%s', CurrentTime(), JSON.stringify(ret))
        return ret
    }
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
    async UnReg(data, cb){
        //console.log('*%s [%s] unReg', CurrentTime(), this.worker.umma)
        let err = this._ParseUnregInfo(data)
        if (!err){
            if (typeof cb == 'function'){
                this.worker._MCFunc(this.id, 'unreg', data, null, (result) => {
                    if (dbg == 1) console.log('*%s info: UnReg SToken=%s result=%s', CurrentTime(), data.SToken, result.ErrMsg)
                    cb(result)
                })
            }
            else {
                return new Promise((resolve) => {
                    this.worker._MCFunc(this.id, 'unreg', data, null, (result) => {
                        if (dbg == 1) console.log('*%s info: UnReg SToken=%s result=%s', CurrentTime(), data.SToken, result.ErrMsg)
                        resolve(result)
                    })
                })    
            }    
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":err}
            if (dbg == 1) console.log('*%s error: UnReg msg=%s', CurrentTime(), err)
            if (typeof cb == 'function') cb(ret)
            else return ret
        }
    }
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
     * @param {String} xmsg.Topic       ultranet topic of destination
     * @param {String} xmsg.Data        data which want to be sent
     * @param {Number} xmsg.SendTimeout  timeout of send xmessage, by sec. 
     * @param {Number} xmsg.WaitReply   the wait time of reply, by sec.
     * @param {sendCallback} cb 
    */
    async Send(xmsg, cb){
        let err = this._ParseSendXmsg(xmsg)
        if (!err){
            if (typeof cb == 'function'){
                this.worker._MCFunc(this.id, 'send', xmsg, null, (result) => { cb(result) })       
            }
            else {
                return new Promise((resolve) => {
                    this.worker._MCFunc(this.id, 'send', xmsg, null, (result) => { resolve(result) })        
                })
            }
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":err,"xmsg":xmsg}
            if (dbg >= 0) {
                if (typeof xmsg == 'object')
                    console.log('*%s error: Send result=%s xmsg=%s', CurrentTime(), ret.ErrMsg, JSON.stringify(xmsg))
                else
                    console.log('*%s error: Send result=%s xmsg=%s', CurrentTime(), ret.ErrMsg, xmsg)
            }
            if (typeof cb == 'function') cb(ret)
            else return ret
        }
    }
    _ParseSendXmsg(xmsg){
        if (typeof xmsg != 'object') return 'xmsg: data type error'
        if (typeof xmsg.SToken != 'string') return 'xmsg.SToken: data type error'
        if (typeof xmsg.DDN != 'string') return 'xmsg.DDN: data type error'
        if (typeof xmsg.Data == 'undefined') return 'xmsg.Data: data type error'
        if (xmsg.SToken == '') return 'xmsg.SToken empty'
        if (xmsg.DDN == '') return 'xmsg.DDN empty'
        if (!xmsg.Data) return 'xmsg.Data empty'
        return ''
    }
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
    async Call(xrpc, cb){
        let err = this._ParseCallXrpc(xrpc)
        if (!err){
            if (typeof cb == 'function'){
                this.worker._MCFunc(this.id, 'call', xrpc, null, (result) => { cb(result) })       
            }
            else {
                return new Promise((resolve) => {
                    this.worker._MCFunc(this.id, 'call', xrpc, null, (result) => { resolve(result) })        
                })
            }
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":err,"xrpc":xrpc}
            if (dbg >= 1) {
                if (typeof xrpc == 'object')
                    console.log('*%s error: Call result=%s xrpc=%s', CurrentTime(), ret.ErrMsg, JSON.stringify(xrpc))
                else
                    console.log('*%s error: Call result=%s xrpc=%s', CurrentTime(), ret.ErrMsg, xrpc)
            }
            if (typeof cb == 'function') cb(ret)
            else return ret
        }
    }
    _ParseCallXrpc(xrpc){
        if (typeof xrpc != 'object') return 'xrpc: data type error'
        if (typeof xrpc.SToken != 'string') return 'xrpc.SToken: data type error'
        if (typeof xrpc.DDN != 'string') return 'xrpc.DDN: data type error'
        if (typeof xrpc.Func != 'string') return 'xrpc.Func: data type error'
        if (typeof xrpc.Data == 'undefined') return 'xrpc.Data: data type error'
        if (xrpc.SToken == '') return 'xrpc.SToken empty'
        if (xrpc.DDN == '') return 'xrpc.DDN empty'
        if (xrpc.Func == '') return 'xrpc.Func empty'
        if (!xrpc.Data) return 'xrpc.Data empty'
        return ''
    }

    /**
     * Get device information
     * @function Get
     * @example 
        var data = {"SToken":mydev.SToken};
        mChat.Get(data, function(result){
            console.log('GetDeviceInfo result=%s', result);
        });
     * @param {Object} data         the input data object
     * @param {String} data.SToken  app token 
     * @param {getCallback} cb 
    */
    async Get(getdata, cb){
        if (typeof cb == 'function'){
            this.worker._MCFunc(this.id, 'get', getdata, null, (result) => { 
                cb(result)
            })  
        }
        else {
            return new Promise((resolve) => {
                this.worker._MCFunc(this.id, 'get', getdata, null, (result) => { 
                    resolve(result)
                })           
            })    
        }
    }
    /**
     * Set device information
     * @function Set
     * @example 
        var info = {"EiName":"myEi","EiType":".ei","EiTag":"#my","EiLoc":""};
        var data = {"SToken":mydev.SToken,"EdgeInfo":info};
        mChat.Set(data, function(result){
            console.log('SetDeviceInfo result=%s', result);
        });
     * @param {Object} setdata              input data object
     * @param {String} setdata.SToken       app token
     * @param {Object} setdata.EdgeInfo     {"EiName":"","EiType":"","EiTag":"","EiLoc":""} 
     * @param {setCallback} cb 
     * @callback setCallback
     * @param {Object} result {ErrCode,ErrMsg,result}
    */
    async Set(setdata, cb){
        if (dbg == 1) {
            if (typeof setdata.EdgeInfo == 'object'){
                let {EiName,EiType,EiTag,EiLoc} = setdata.EdgeInfo
                console.log('*%s info: Set EiName=%s EiType=%s EiTag=%s EiLoc=%s', CurrentTime(), EiName, EiType, EiTag, EiLoc)    
            }
        }
        if (typeof cb == 'function'){
            this.worker._MCFunc(this.id, 'set', setdata, null, (result) => { 
                cb(result)
            })           
        }
        else {
            return new Promise((resolve) => {
                this.worker._MCFunc(this.id, 'set', setdata, null, (result) => { 
                    resolve(result)
                })           
            })    
        }
    }
    /**
     * Search device by key
     * @function Search
     * @example 
        var data = {"SToken":mydev.SToken,"Keyword":"#test"};
        mChat.Search(data, function(result){
            console.log('Search result=%s', result);
        });
     * @param {Object} data         input data object
     * @param {String} data.SToken  app token
     * @param {String} data.Keyword Key for search 
     * @param {searchCallback} cb 
    */
    async Search(data, cb){
        let {Keyword} = data
        if (Keyword){
            if (dbg == 1) console.log('*%s info: Search key=%s', CurrentTime(), Keyword) 
            if ( typeof cb == 'function'){
                this.worker._MCFunc(this.id, 'search', data, null, (result) => { 
                    cb(result)
                })           
            }
            else {
                return new Promise((resolve) => {
                    this.worker._MCFunc(this.id, 'search', data, null, (result) => { 
                        resolve(result)
                    })           
                })    
            }
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
            if (typeof cb == 'function') cb(ret);
            else return ret
        }
    }
    /**
     * Search nearby device
     * @function Nearby
     * @example 
        var data = {"SToken":mydev.SToken};
        mChat.Nearby(data, function(result){
            console.log('Search result=%s', result);
        });
     * @param {Object} data         input data object
     * @param {String} data.SToken  app token
     * @param {searchCallback} cb 
    */
    async Nearby(data, cb){
        if (dbg == 1) console.log('*%s info: nearby', CurrentTime())
        if (typeof cb == 'function'){
            this.worker._MCFunc(this.id, 'nearby', data, null, (result) => { 
                cb(result)
            })
        }
        else {
            return new Promise((resolve) => {
                this.worker._MCFunc(this.id, 'nearby', data, null, (result) => { 
                    resolve(result)
                })
            })    
        }
    }
    /**
     * Call xrpc to remote by motebus
     * @function mbCall
     * @example 
        var data = {"MMA":myapp@202.153.173.250,"Func":"echo","Data":["Hello World!"],null,null};
        mChat.mbCall(data, function(result){
            console.log('Search result=%s', result);
        });
     * @param {Object} xrpc                 input data object
     * @param {String} xrpc.MMA             mma of destination
     * @param {String} xrpc.Func            func delivered
     * @param {Array} xrpc.Data             data delivered
     * @param {Number} xrpc.Timeout         send timeout
     * @param {Number} xrpc.Waitreply       wait reply timeout
     * @param {searchCallback} cb 
    */
    async mbCall(xrpc, cb){
        let work = this.worker
        if (dbg == 1) console.log('*%s info: mbCall To=%s, Func=%s', CurrentTime(), xrpc.MMA, xrpc.Func)
        if (typeof cb == 'function'){
            let result = await work._mbCallXrpc(xrpc)
            cb(result)
        }
        else {
            return new Promise( async (resolve) => {
                let result = await work._mbCallXrpc(xrpc)
                resolve(result)
            })    
        }
    }
    /**
     * Send xmsg to remote by motebus
     * @function mbSend
     * @example 
        var data = {"MMA":myapp@202.153.173.250,"Data":["Hello World!"],null,null};
        mChat.mbSend(data, function(result){
            console.log('Search result=%s', result);
        });
     * @param {Object} xmsg                 input data object
     * @param {String} xmsg.MMA             mma of destination
     * @param {Array} xmsg.Data             data delivered
     * @param {Number} xmsg.Timeout         send timeout
     * @param {Number} xmsg.Waitreply    wait reply timeout
     * @param {searchCallback} cb 
    */
    async mbSend(xmsg, cb){
        let work = this.worker
        if (dbg == 1) console.log('*%s info: mbSend To=%s', CurrentTime(), xmsg.MMA)
        if (typeof cb == 'function'){
            let result = await work._mbSendXmsg(xmsg)
            cb(result)
        }
        else {
            return new Promise(async (resolve) => {
                let result = await work._mbSendXmsg(xmsg)
                resolve(result)
            })    
        }
    }
    /**
     * Set xstorage configuration
     * @function mbSetConfig
     * @example 
        var xconf = {"catalog":"myapp","idname":"userinfo","data":{"id":"1234","name":"john","sex":"male"};
        mChat.mbSetConfig(xconf, function(result){
            console.log('mbSetConfig result=%s', result);
        });
     * @param {Object} xconf        the input data object
     * @param {getCallback} cb 
    */
    async mbSetConfig(xconf, cb){
        // xconf: {catalog,idname,data}
        let topic = "xs://config";
        let func = "set";
        let xscmd = {"Topic":topic,"Func":func,"Data":xconf};
        let result = await this.worker._XsFunc(xscmd)
        if (typeof cb == 'function') cb(result)
        else return result 
    }
    /**
     * Get xstorage configuration
     * @function mbGetConfig
     * @example 
        var xconf = {"catalog":"myapp","idname":"userinfo"};
        mChat.mbGetConfig(xconf, function(result){
            console.log('mbGetConfig result=%s', result);
        });
     * @param {Object} xconfig          the input data object
     * @param {getCallback} cb 
    */
    async mbGetConfig(xconf, cb){
        // xconf: {catalog,idname}
        let topic = "xs://config";
        let func = "get";
        let xscmd = {"Topic":topic,"Func":func,"Data":xconf};
        let result = await this.worker._XsFunc(xscmd)
        if (typeof cb == 'function') cb(result)
        else return result 
    }
    /**
     * Set app information
     * @function SetAppSetting
     * @example 
        var data = {"SToken":mydev.SToken,"Setting":{"on":"start":"action":"dolast"}};
        mChat.GetAppSetting(data, function(result){
            console.log('GetAppSetting result=%s', result);
        });
     * @param {Object} data             the input data object
     * @param {String} data.SToken      app token 
     * @param {String} data.Setting     app setting
     * @param {getCallback} cb 
    */
    async SetAppSetting(data, cb){
        let {Setting} = data
        if (Setting){
            if (typeof cb == 'function'){
                this.worker._MCFunc(this.id, 'setapp', data, null, (result) => { 
                    cb(result)
                })           
            }
            else {
                return new Promise((resolve) => {
                    this.worker._MCFunc(this.id, 'setapp', data, null, (result) => { 
                        resolve(result)
                    })           
                })    
            }
        }
        else {
            let ret = {"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg}
            if (typeof cb == 'function') cb(ret);
            else return ret
        }
    }
    /**
     * Get app information
     * @function GetAppSetting
     * @example 
        var data = {"SToken":mydev.SToken};
        mChat.GetAppSetting(data, function(result){
            console.log('GetAppSetting result=%s', result);
        });
     * @param {Object} data         the input data object
     * @param {String} data.SToken  app token 
     * @param {getCallback} cb 
    */
    async GetAppSetting(data, cb){
        // data: {SToken}
        if (typeof cb == 'function'){
            this.worker._MCFunc(this.id, 'getapp', data, null, (result) => { 
                cb(result)
            })           
        }
        else {
            return new Promise((resolve) => {
                this.worker._MCFunc(this.id, 'getapp', data, null, (result) => { 
                    resolve(result)
                })           
            })    
        }
    }
    async GetQPin(data, cb){
        // data: {SToken}
        if (typeof cb == 'function'){
            this.worker._MCFunc(this.id, 'getqpin', data, null, (result) => { 
                cb(result)
            })       
        }
        else {
            return new Promise((resolve) => {
                this.worker._MCFunc(this.id, 'getqpin', data, null, (result) => { 
                    resolve(result)
                })       
            })    
        }
    }
    async FindQPin(data, cb){
        // data: {SToken, QPin}
        if (typeof cb == 'function'){
            this.worker._MCFunc(this.id, 'findqpin', data, null, (result) => { 
                cb(result)
            })
        }
        else {
            return new Promise((resolve) => {
                this.worker._MCFunc(this.id, 'findqpin', data, null, (result) => { 
                    resolve(result)
                })           
            })
        }
    }
    GetwipUrl(){
        let conf = mcworker.conf
        let url = conf.GetwipUrl
        console.log('*%s info: GetwipUrl url=%s', CurrentTime(), url)
        return url
    }
    async _UnregAll(){
        let ret = []
        let len = edgetable.length
        if (len > 0){
            for ( let i = len-1; i >= 0; i-- ){
                let ei = edgetable[i]
                if (ei){
                    if (ei.State == 'reg'){
                        let data = {"SToken":ei.SToken}
                        let result = await this.UnReg(data)
                        ret.push(result)
                    }
                }
            }
            return ret
        }
        else return ret
    }
    GetTime(){
        return CurrentTime();
    }
    XrpcHandler(body, cb){
        parseXrpc(body, cb)
    }
    _waitMiniSec(ms){
        return new Promise(function(resolve){
            if ( ms ){
                setTimeout(function(){
                    resolve(true);
                }, ms);
            }
            else resolve(false);
        });
    }
}

// end of MoteChat class


function chkReply(ret){
    try {
        if (typeof ret == 'object'){
            if (typeof ret.ErrCode != 'undefined'){
                if (ret.ErrCode == mcerr.WS_OKCODE){
                    let Reply = ret.Reply;
                    if (Reply) return Reply
                    else return null
                }
                else return null
            }
            else return null    
        }
        else return null
    }
    catch(e){
        console.log('*%s error: chkReply msg=%s', CurrentTime(), err.message)
        return null
    }
}

function chkError(ret){
    if (ret){
        if (typeof ret.ErrCode != 'undefined' && typeof ret.ErrMsg != 'undefined') return ret;
        else return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid reply","UseTime":ret.UseTime}    
    }
    else return {"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Invalid reply","UseTime":ret.UseTime}
}

function saveRegSession(mcid, regdata, wanip, lanip){
    try {
        //console.log('*%s info: saveRegSession regdata=%s', CurrentTime(), JSON.stringify(regdata))
        let isnew = false;
        let {SToken,EiToken} = regdata;
        let reg = chkSession(EiToken, SToken, 'reg', false)
        if (reg == null) {
            isnew = true;
            reg = crSession(mcid, EiToken, SToken, wanip, lanip)
        }
        reg.EiUDID = regdata.EiUDID? regdata.EiUDID : ''
        reg.EiMMA = regdata.EiMMA? regdata.EiMMA : ''
        reg.AppId = regdata.AppId? regdata.AppId : ''
        reg.DDN = regdata.DDN? regdata.DDN : ''
        reg.EiOwner = regdata.EiOwner? regdata.EiOwner : ''
        reg.EiName = regdata.EiName? regdata.EiName : ''
        reg.EiType = regdata.EiType? regdata.EiType : ''
        reg.EiTag = regdata.EiTag? regdata.EiTag : ''
        reg.EiLoc = regdata.EiLoc? regdata.EiLoc : ''
        reg.UToken = regdata.UToken? regdata.UToken : ''
        reg.Uid = regdata.Uid? regdata.Uid : ''
        reg.UserName = regdata.UserName? regdata.UserName : ''
        reg.NickName = regdata.NickName? regdata.NickName : ''
        reg.MobilNo = regdata.MobileNo? regdata.MobileNo : ''
        reg.Sex = regdata.Sex? regdata.Sex : ''
        reg.EmailVerified = regdata.EmailVerified? regdata.EmailVerified : false
        reg.MobileVerified = regdata.MobileVerified? regdata.MobileVerified : false
        reg.isWeb = reg.isWeb? true : false
        reg.TimeStamp = new Date()
        reg.State = 'reg'
        //console.log('*%s saveRegSession EiMMA=%s', CurrentTime(), reg.EiMMA)
        //if (dbg >= 2) console.log('*%s [%s] saveRegSession EiMMA=%s', CurrentTime(), mcid, reg.EiMMA)
        //console.log('*%s %s saveRegSession stoken=%s, state=%s', CurrentTime(), mcid, reg.SToken, reg.State)
        if (isnew) edgetable.push(reg);
        //for (let i = 0; i < edgetable.length; i++) console.log('saveRegSession %s %s %s %s %s', isnew, mcid, edgetable[i].DDN, edgetable[i].SToken, edgetable[i].State)
        //console.log('*%s saveRegSession edgetable %s, %s, %s, no=%d', CurrentTime(), SToken, EiToken, DDN, edgetable.length)
        return '';
    }
    catch(e){
        console.log('*%s error: saveRegSession msg=%s', CurrentTime(), e.message)
        return e.message;
    }
}

function rmRegSession(eitoken, stoken){
    let index = chkSession(eitoken, stoken, 'unreg', true)
    if (index >= 0){
        let ei = edgetable[index]
        let {SToken,DDN,EiName} = ei
        if (dbg >= 2) console.log('*%s info: rmRegSession SToken=%s,DDN=%s,EiName=%s', CurrentTime(), SToken, DDN, EiName)
        edgetable.splice(index,1)
    }
}

function updEdgeData(stoken, data){
    let ei = chkUserSession(stoken, false)
    if (ei) {
        ei.EiName = (typeof data.EiName == 'string') ? data.EiName : ''
        ei.EiType = (typeof data.EiType == 'string') ? data.EiType : ''
        ei.EiTag = (typeof data.EiTag == 'string') ? data.EiTag : ''
        ei.EiLoc = (typeof data.EiLoc == 'string') ? data.EiLoc : ''
    }
}

function crSession(mcid, eitoken, stoken, wanip, lanip){
    let WIP = wanip? wanip : ''
    let LIP = lanip? lanip : ''
    return {"EiToken":eitoken,"SToken":stoken,"WIP":WIP,"LIP":LIP,"EiUDID":"","EiMMA":"","DDN":"","AppId":"",
            "EiOwner":"","EiName":"","EiType":"","EiTag":"","EiLoc":"","UToken":"","Uid":"",
            "UserName":"","NickName":"","MobileNo":"","Sex":0,"EmailVerified":false,"MobileVerified":false,
            "TimeStamp":null,"State":"","mcid":mcid,"isWeb":false}
}

// use: use index
function chkSession(eitoken, stoken, state, useix){
    for (let i = 0; i < edgetable.length; i++){
        let edge = edgetable[i];
        let {SToken,EiToken,State} = edge;
        if ( state ) {
            if (SToken == stoken && EiToken == eitoken && State == state) {
                if (useix) return i
                else return edge
            }
        }
        else {
            if (SToken == stoken && EiToken == eitoken) {
                if (useix) return i
                else return edge
            }
        }
    }
    if (useix) return -1
    else return null
}

function chkUserSession(stoken, useix){
    for (let i = 0; i < edgetable.length; i++){
        let edge = edgetable[i];
        let {SToken,State} = edge;
        if (SToken == stoken && State == 'reg') {
            if (useix) return i
            else return edge
        }   
    }
    if (useix) return -1
    else return null
}

function chkUserSessionByDDN(ddn, useix){
    for (let i = 0; i < edgetable.length; i++){
        let edge = edgetable[i];
        let {DDN,State} = edge;
        if (DDN == ddn && State == 'reg') {
            if (useix) return i
            else return edge
        }
    }
    if (useix) return -1
    else return null
}

function chkUserSessionByTarget(target, useix){
    if (target){
        for (let i = 0; i < edgetable.length; i++){
            let edge = edgetable[i];
            let {DDN,EiName,State} = edge;
            let einame = EiName ? EiName : ''
            if (einame) einame = einame.toLowerCase()
            if ((target == DDN || target.toLowerCase() == einame) && State == 'reg') {
                if (useix) return i
                else return edge
            }
        }
    }
    if (useix) return -1
    else return null
}

function chkEdgeInfo(info){
    if (info.EiName || info.EiType || info.EiTag || info.EiLoc) return true
    else return false
}

function cmpEdgeInfo(a, b, mode){
    try {
        if (mode == 'reg'){
            if (a.EiName == b.EiName)
                return true;
            else
                return false;
        }
        else {
            if (a.EiName == b.EiName && a.EiType == b.EiType && a.EiTag == b.EiTag && a.EiLoc == b.EiLoc)
                return true;
            else
                return false;
        }
    }
    catch(err){
        return false;
    }
}

function getEdgeInfo(ei){
    if (ei){
        let info = {"EiToken":ei.EiToken,"SToken":ei.SToken,"EiMMA":ei.EiMMA,"DDN":ei.DDN,"EiOwner":ei.EiOwner,"EiName":ei.EiName,"EiType":ei.EiType,"EiTag":ei.EiTag,"EiLoc":ei.EiLoc,"UToken":ei.UToken,"Uid":ei.Uid,"UserName":ei.UserName,"NickName":ei.NickName,"MobileNo":ei.MobileNo,"Sex":ei.Sex,"EmailVerified":ei.EmailVerifed,"MobileVerified":ei.MobileVerified,"TimeStamp":ei.TimeStamp,"State":ei.State}
        return info
    }
    else return null
}

function DDNParser(ddn, topic, op){
    var ret = {"mode":"","to":{}};
    if (ddn){
        if (ddn.indexOf(mma_raw_prefix) >= 0 ){
            let target = ddn.substr(mma_raw_prefix.length);
            if (op == 'direct') ret = {"mode":"mbmma","to":target};          
            else ret = {"mode":"","to":{"Target":target,"Topic":topic}}; 
        }
        else if (ddn.indexOf(adv_mma_raw_prefix) >= 0){
            let target = ddn.substr(adv_mma_raw_prefix.length);
            if (op == 'direct') ret = {"mode":"mbmma","to":target};          
            else ret = {"mode":"","to":{"Target":target,"Topic":topic}}; 
        }
        else if ( ddn == motechat_prefix || ddn == adv_sys_prefix ){
            ret = TopicParser(topic);
        }
        else if ( ddn.indexOf(uc_prefix) >= 0 || ddn.indexOf(uc_prefix2) >= 0 || ddn == 'UC' || ddn == 'uc'){
            if (topic) ret = TopicParser(topic)
            else ret = {"mode":"uc","to":{"Topic":""}};
        }
        else if ( ddn.indexOf(target_prefix) >= 0 ){
            let m = ddn.substr(target_prefix.length);
            if (op == 'direct') ret = {"mode":"direct","to":{"Target":m,"Topic":topic}};    
            else ret = {"mode":"dc","to":{"Target":m,"Topic":topic}}; 
        }
        else if (ddn.indexOf(mma_mc_prefix) >= 0){
            let m = ddn.substr(mma_mc_prefix.length);
            let {MMA,Target} = parseAdvTarget(m)
            ret = {"mode":"mcmma","to":{"MMA":MMA,"Target":Target,"Topic":topic}};
        }
        else if (ddn.indexOf(adv_mma_mc_prefix) >= 0){
            let m = ddn.substr(adv_mma_mc_prefix.length);
            let {MMA,Target} = parseAdvTarget(m)
            ret = {"mode":"mcmma","to":{"MMA":MMA,"Target":Target,"Topic":topic}};
        }
        else if (ddn.indexOf(adv_ddn_prefix) >= 0){
            let target = ddn.substr(adv_ddn_prefix.length)
            if (op == 'direct')
                ret = {"mode":"direct","to":{"Target":target,"Topic":topic}};
            else
                ret = {"mode":"dc","to":{"Target":target,"Topic":topic}};
        }
        else if (ddn.indexOf('dc') >= 0){
            let {MMA,Target} = parseAdvTarget2(ddn)
            ret = {"mode":"direct2","to":{"DCMMA":MMA,"Target":Target,"Topic":topic}};
        }
        else {
            if (op == 'direct')
                ret = {"mode":"direct","to":{"Target":ddn,"Topic":topic,"Search":"local"}};
            else
                ret = {"mode":"dc","to":{"Target":ddn,"Topic":topic,"Search":"local"}};
        }
    }
    if (dbg >= 2) console.log('*%s debug: DDNParser result=%s', CurrentTime(), JSON.stringify(ret));
    return ret;
}

function parseAdvTarget(addr){
    let target = ''
    let mma = ''    
    if (addr.indexOf('@') > 0){
        let arr = addr.split('@')
        target = arr[0]
        mma = arr[1]
    }
    else mma = addr
    return {"MMA":mma,"Target":target}
}

function parseAdvTarget2(addr){
    let f1 = addr.indexOf('dc')
    let f2 = addr.lastIndexOf('/')
    let mma = ''
    let target = ''
    if (f2 > f1){
        target = addr.substr(f2+1)
        mma = addr.substr(0,f2)
    }
    else mma = addr
    return {"MMA":mma,"Target":target}
}

function TopicParser(topic){
    var app, dest;
    var addr = {"mode":"","to":{}};
    if ( typeof topic == 'string' ){
        if (topic){
            ix = topic.indexOf('://');
            if ( ix > 0 ){
                app = topic.substr(0, ix);
                dest = topic.substr(ix+3);
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
                        case 'xs':
                            addr = {"mode":"xs","topic":dest};
                            break;
                        case 'uc':
                            addr = {"mode":"uc","to":{"Topic":dest}};
                            break;
                        default:
                            break;
                    }
                }
            }
            else {
                addr = {"mode":"","to":{"Target":topic}};
            }
        }
    }
    return addr;
}

function GetUcResult(func, reply){
    if ( func == 'ucCheckUser' || func == 'ucSignup' || func == 'ucLogout' || func == 'ucSetUserInfo' || func == 'ucSetUserSetting' ){
        if ( reply == true ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"UseTime":reply.UseTime});
        else if ( reply.ErrCode ) return({"ErrCode":reply.ErrCode,"ErrMsg":reply.ErrMsg,"func":func,"UseTime":reply.UseTime}); 
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func,"UseTime":reply.UseTime});
    }
    else if ( func == 'ucLogin' || func == 'ucGetUserInfo' || func == 'ucMLoginStep2' ){
        if ( reply.UToken ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"UserInfo":reply,"UseTime":reply.UseTime});
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func,"UseTime":reply.UseTime});
    }
    else if ( func == 'ucGetUserSetting' ){
        if ( reply ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"Setting":reply,"UseTime":reply.UseTime});
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func,"UseTime":reply.UseTime});
    }
    else if ( func == 'ucGenMPin' || func == 'ucVerifyMobileNo' || func == 'ucChangePass' || func == 'ucMLoginStep1' || func == 'ucEdgeSet' || func == 'ucEdgeAdd' || func == 'ucEdgeRemove' ){
        if ( reply == true ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"UseTime":reply.UseTime});
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func,"UseTime":reply.UseTime});
    }
    else if ( func == 'ucEdgePair' ){
        if ( reply.DDN ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"EdgeInfo":reply,"UseTime":reply.UseTime});
        else if ( reply.ErrCode ) return({"ErrCode":reply.ErrCode,"ErrMsg":reply.ErrMsg,"func":func,"UseTime":reply.UseTime}); 
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func,"UseTime":reply.UseTime});
    }
    else if ( func == 'ucEdgeList' ){
        if ( Array.isArray(reply) ) return({"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"func":func,"EdgeInfo":reply,"UseTime":reply.UseTime});
        else if ( reply.ErrCode ) return({"ErrCode":reply.ErrCode,"ErrMsg":reply.ErrMsg,"func":func,"UseTime":reply.UseTime}); 
        else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func,"UseTime":reply.UseTime});
    }
    else return({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"Fail","func":func,"UseTime":reply.UseTime});
}

function HandleUserInfo(func, eitoken, stoken, reply){
    if ( dbg >= 3 ){
        if ( typeof reply == 'object' )
            console.log('*%s debug: HandleUserInfo func=%s,stoken=%s,reply=%s', CurrentTime(), func, stoken, JSON.stringify(reply));
        else
            console.log('*%s debug: HandleUserInfo func=%s,stoken=%s,reply=%s', CurrentTime(), func, stoken, reply);
    }
    if ( func == 'ucLogin' ){
        if ( reply.Uid ) UpdateUserInfo(eitoken, stoken, reply);
        //else console.log('*%s HandleUserInfo error=%s', CurrentTime(), JSON.stringify(reply));
    }
    else if ( func == 'ucLogout' ){
        if ( reply == true ) ClearUserInfo(eitoken, stoken);
    }
}

function UpdateUserInfo(eitoken, stoken, info){
    try {
        if ( dbg >= 3 )console.log('*%s debug: UpdateUserInfo %s', CurrentTime(), JSON.stringify(info));
        let edge = chkSession(eitoken, stoken, 'reg', false)
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
        console.log('*%s error: UpdateUserInfo msg=%s', CurrentTime(), err.message);
    }    
}

function ClearUserInfo(eitoken, stoken){
    try {
        let edge = chkSession(eitoken, stoken, 'reg', false)
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
        console.log('*%s error: UpdateUserInfo msg=%s', CurrentTime(), err.message);
    }    
}

var McRcvInFunc = async function(mc, data, isweb){
    var cmd, option, result;
    try {
        if ( dbg >= 3 ) console.log('*%s debug: McRcvInFunc %s', CurrentTime(), JSON.stringify(data));
        cmd = data.cmd;
        option = data.option;
        if (cmd){
            cmd = cmd.toLowerCase();
            if (option) option = option.toLowerCase();
            var stime = new Date();
            var trace, stamp;
            switch(cmd){
                case 'ping':
                    if ( !isweb ) {
                        if ( dbg >= 3 ) console.log('*%s debug: McRcvInFunc data=%s', CurrentTime(), JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mc.umma,"time":stime});
                                stamp = trace;
                            }
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        return result;
                    }
                    else return null;
                case 'trace':
                    if ( !isweb ) {
                        if ( dbg >= 3 ) console.log('*%s debug: McRcvInFunc data=%s', CurrentTime(), JSON.stringify(data));
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mc.umma,"time":stime});
                                stamp = trace;
                            }
                        }
                        if ( stamp )
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Trace":stamp};
                        else
                            result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                        return result;
                    }
                    else {
                        if ( data.trace ){
                            trace = data.trace;
                            if ( Array.isArray(trace) ){
                                trace.push({"mma":mc.umma,"time":stime});
                                data.trace = trace;
                            }
                        }
                        return null;
                    }
                case 'setdbg=0':
                case 'setdbg=1':
                case 'setdbg=2':
                    result = {"response":cmd,"ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
                    let sval = cmd.split('=');
                    let val = parseInt(sval[1])
                    dbg = val
                    let ins = mc.mbstack
                    ins.setDebug(dbg)
                    return result
                default:
                    console.log('*%s error: McRcvInFunc: Invalid command', CurrentTime());
                    return null;
            }
        }
        else {
            console.log('*%s error: McRcvInFunc: Invalid data', CurrentTime());
            return null;
        }
    }
    catch(e){
        console.log('*%s error: McRcvInFunc %s', CurrentTime(), e.message);
        return null;
    }
}

async function parseSysCmd(msg, cb){
    //console.log('*%s parseSysCmd msg=%s', CurrentTime(), JSON.stringify(msg))
    let {head, body} = msg
    if (dbg >= 2) console.log('*%s info: parseSysCmd from=%s', CurrentTime(), head.from)
    if (typeof body.type == 'string'){
        let type = body.type
        if (type == 'in'){
            let ret = await iocCtl(body)
            if (typeof cb == 'function') cb(ret)
        }
        else {
            if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
        }
    }
    else {
        if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
    }
}

async function parseXmsg(msg, cb){
    if (msg){
        if (dbg >= 3) console.log('*%s debug: parseXmsg msg=%s', CurrentTime(), JSON.stringify(msg))
        try {
            let {head,body} = msg
            if (dbg >= 2) console.log('*%s info: parseXmsg from=%s', CurrentTime(), head.from)
            if ( body ){
                let {data} = body;
                if ( body.in && data ){
                    // in message
                    let {fm,to,msgtype} = body.in
                    if (to) {
                        let ei = _parseTo(to)
                        if (typeof ei == 'object'){
                            if (dbg >= 3) console.log('*%s debug: parseXmsg: ei=%s', CurrentTime(), JSON.stringify(ei))
                            let mode = ei.Mode
                            let info = ei.Info
                            let stoken = info.SToken
                            if (stoken){
                                let finish = false;
                                let inret = null;
                                if (typeof msgtype == 'undefined') msgtype = ''
                                if ( msgtype == 'in' ){
                                    inret = await McRcvInFunc(mcworker, data, false);
                                    if ( inret ) finish = true;
                                }
                                if ( !finish ){
                                    let inctl = null
                                    if (dbg >= 3) console.log('*%s debug: parseXmsg: info=%s', CurrentTime(), JSON.stringify(info))
                                    if (mode == 'ddn' ) inctl = {"From":fm,"To":to,"msgtype":msgtype}
                                    else inctl = {"From":fm,"To":{"DDN":info.DDN,"Name":info.EiName,"Type":info.EiType,"Topic":to.Topic},"msgtype":msgtype}
                                    let data = body.data
                                    if (dbg >= 2) console.log('*%s debug: parseXmsg SToken=%s', CurrentTime(), stoken);
                                    let mctl = mcworker._SearchMCTable(stoken)
                                    if (mctl){
                                        if (typeof mctl.OnEvent.msg == 'function'){
                                            let DDN = info.DDN
                                            let rcve = mctl.OnEvent.msg
                                            if (dbg >= 3) console.log('*%s debug: parseXmsg: %s on message in=%s', CurrentTime(), DDN, JSON.stringify(inctl))
                                            rcve('xmsg', inctl, data, (reply) => {
                                                if (dbg >= 3) console.log('*%s debug: parseXmsg: %s on message reply=%s', CurrentTime(), DDN, JSON.stringify(reply))
                                                if (typeof reply.ErrCode != 'undefined'){
                                                    if (reply.ErrCode == mcerr.WS_NoMatchDDN) {
                                                        mcworker._MCFunc(mctl.mcID, 'unreg', {"SToken":stoken}, null)
                                                    }
                                                }
                                                if (typeof cb == 'function') cb(reply)
                                            })
                                        }
                                        else {
                                            console.log('*%s error: parseXmsg: No listen app', CurrentTime())
                                            if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"No listen app","SToken":stoken})        
                                        }
                                    }
                                    else {
                                        console.log('*%s error: parseXmsg: no reg, SToken=%s', CurrentTime(), stoken)
                                        if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_NoReg,"ErrMsg":mcerr.MC_NoReg_Msg,"SToken":stoken})
                                    }
                                }
                                else if (typeof cb == 'function') cb(inret);
                            }
                            else {
                                console.log('*%s error: parseXmsg: SToken empty', CurrentTime())
                                if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
                            }
                        }
                        else {
                            console.log('*%s error: parseXmsg msg=%s to=%s', CurrentTime(), ei, JSON.stringify(to))
                            if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":ei})
                        }
                    }
                    else {
                        console.log('*%s error: parseXmsg: in=%s', CurrentTime(), JSON.stringify(body.in))
                        if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
                    }
                }
                else {
                    console.log('*%s error: parseXmsg: body=%s', CurrentTime(), JSON.stringify(body))
                    if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
                }
            }
            else {
                console.log('*%s error: parseXmsg: msg=%s', CurrentTime(), JSON.stringify(msg))
                if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
            }
        }
        catch(e){
            console.log('*%s error: parseXmsg msg=%s', CurrentTime(), e.message)
            if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message})
        }
    }
}

function _parseTo(to){
    if (to) {
        if (dbg >= 3) console.log('*%s debug: parseTo to=%s', CurrentTime(), JSON.stringify(to));
        let {DDN} = to
        if (DDN){
            let info = chkUserSessionByDDN(DDN, false)
            if (info) return {"Mode":"ddn","Info":info}
            else return 'DDN not found'
        }
        else {
            let {Mode} = to
            if (Mode == 'm2m'){
                if (to.Target){
                    let info = chkUserSessionByTarget(to.Target, false)
                    if (info) return {"Mode":"target","Info":info}
                    else return 'Target not found'
                }
                else {
                    let mctl = mcworker._GetMsgListenerInfo()
                    if (mctl.SToken){
                        let info = chkUserSession(mctl.SToken, false)
                        if (info) return {"Mode":"mma","Info":info}
                        else return 'No listen app'
                    }
                }
            }
            else return 'Invalid data'
        }
    }
}

function parseXrpc(body, cb){
    if ( body ){
        if ( body.in ){
            // xrpc message
            let {fm,to,msgtype} = body.in
            if (to) {
                if (dbg >= 3) console.log('*%s debug: parseXrpc to=%s', CurrentTime(), JSON.stringify(to));
                let ei = _parseTo(to)
                if (typeof ei == 'object'){
                    let mode = ei.Mode
                    let info = ei.Info
                    let DDN = info.DDN
                    let stoken = info.SToken
                    if (stoken){
                        let mctl = mcworker._SearchMCTable(stoken)
                        if (mctl){
                            let inctl = null
                            if (mode == 'ddn' ) inctl = {"From":fm,"To":to}
                            else inctl = {"From":fm,"To":{"DDN":info.DDN,"Name":info.EiName,"Type":info.EiType,"Topic":to.Topic}}
                            let data = body.data
                            if (typeof mctl.OnEvent.msg == 'function'){
                                let rcve = mctl.OnEvent.msg
                                if (dbg >= 3) console.log('*%s debug: parseXrpc: %s rcve in=%s', CurrentTime(), DDN, JSON.stringify(inctl))
                                rcve('xrpc', inctl, data,  (reply) => {
                                    if (dbg >= 3) console.log('*%s debug: parseXrpc: %s rcve reply=%s', CurrentTime(), DDN, JSON.stringify(reply))
                                    if (typeof cb == 'function') cb(reply)
                                })
                            }
                            else {
                                console.log('*%s error: parseXrpc: No listen app, SToken=%s', CurrentTime(), stoken)
                                if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":"No lesten app","Info":{"SToken":stoken}})    
                            }
                        }
                        else {
                            console.log('*%s error: parseXrpc: no reg, SToken=%s', CurrentTime(), stoken)
                            if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_NoReg,"ErrMsg":mcerr.MC_NoReg_Msg,"Info":{"SToken":stoken}})
                        }
                    }
                    else {
                        console.log('*%s error: parseXrpc: SToken empty', CurrentTime())
                        if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidSToken,"ErrMsg":mcerr.MC_InvalidStoken_Msg})                            }
                }
                else {
                    console.log('*%s error: parseXrpc msg=%s to=%s', CurrentTime(), ei, JSON.stringify(to))
                    if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":ei})
                }
            }
            else {
                console.log('*%s error: parseXrpc in=%s', CurrentTime(), JSON.stringify(body.in))
                if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
            }
        }
        else {
            console.log('*%s error: parseXrpc: body=%s', CurrentTime(), JSON.stringify(body))
            if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
        }
    }
    else {
        if (typeof cb == 'function') cb({"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg})
    }
}


function parseMbus(msg, cb){
    if (msg){
        for (let i = 0; i < edgetable.length; i++){
            let edge = edgetable[i];
            let stoken = edge.SToken
            let mctl = mcworker._SearchMCTable(stoken)
            if (typeof mctl.OnEvent.mbus == 'function'){
                let usrcall = mctl.OnEvent.mbus
                usrcall(msg, (result) => {
                    if (typeof cb == 'function') cb(result)
                })
            }
        }
    }
}

async function iocCtl(body){
    try {
        let cmd = ''
        cmd = body.cmd ? body.cmd : '';
        //let token = body.token ? body.token: '';
        let option = body.option ? body.option : ''; // {showtype,start,end}
        if ( cmd == 'reginfo' ){
            let reginfo = InGetReginfo(option);
            let reply = {"response":"reginfo","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"count":reginfo.count,"data":reginfo.data};
            return reply
        }
        else if ( cmd == 'reset' ){
            // motechat soft reset
            //await mcworker._ExecDCReset()
            mcworker._ExecDCReset()
            let reply = {"response":"reset","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
            return reply
        }
        else if ( cmd == 'mbrestart' ){
            // motebus restart
            //await mcworker.RestartMotebus();
            mcworker.RestartMotebus();
            let reply = {"response":"mbrestart","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
            return reply

        }
        else if ( cmd == 'mbping' ){
            let info = {"mbState":mbstate,"dcState":dcstate,"Version":ver};
            let reply = {"response":"mbping","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Info":info};
            return reply
        }
        else if ( cmd == 'watchlevel'){
            let reply = null;
            if (option) {
                if (typeof option == 'string')
                    dbg = parseInt(option); // "0", "1", "2"
                else
                    dbg = option
                mbclass.SetDebug(dbg);
                reply = {"response":"watchlevel","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
            }
            else reply = {"response":"watchlevel","ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
            return reply
        }
        else if (cmd == 'maxdatasize'){
            let reply = null;
            if (option) {
                let size = mbclass.GetMaxDataSize()
                if (typeof option == 'string')
                    size = parseInt(option); // data size
                else
                    size = option
                mbclass.GetMaxDataSize(size);
                reply = {"response":"maxdatasize","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG};
            }
            else reply = {"response":"maxdatasize","ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
            return reply
        }
        else if (cmd == 'status'){
            let stat = {"mbState":mbstate,"dcState":dcstate,"Version":ver,"WatchLevel":dbg,"MaxDataSize":mbclass.GetMaxDataSize(),"IOC":mcworker.ioc}
            let reply = {"response":"status","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG,"Status":stat}
            return reply
        }
        else if (cmd == 'setioc'){
            let reply = null
            if (option){ 
                mbclass.iocmma = option
                reply = {"response":"setioc","ErrCode":mcerr.MC_OKCODE,"ErrMsg":mcerr.MC_OKMSG}
            }
            else reply = {"response":"setioc","ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
            return reply
        }
        else {
            return {"response":cmd,"ErrCode":mcerr.MC_InvalidData,"ErrMsg":mcerr.MC_InvalidData_Msg};
        }
    }
    catch(e){
        return {"response":cmd,"ErrCode":mcerr.MC_ERRCODE,"ErrMsg":e.message};
    }
}

function InGetReginfo(option){
    let eilist = []
    for(let i = 0; i < edgetable.length; i++){
        let {DDN,EiName,EiType,EiTag,EiLoc,State,WIP} = edgetable[i]
        if (option == 'all'){
            let ei = {"DDN":DDN,"EiName":EiName,"EiType":EiType,"EiTag":EiTag,"EiLoc":EiLoc,"State":State,"WIP":WIP}
            eilist.push(ei)    
        }
        else if (option == 'poll'){
            if (State == 'reg') eilist.push(DDN)
        }
        else if (State == 'reg'){
            let ei = {"DDN":DDN,"EiName":EiName,"EiType":EiType,"EiTag":EiTag,"EiLoc":EiLoc,"WIP":WIP}
            eilist.push(ei)    
        }
    }
    let ret = {"count":eilist.length,"data":eilist}
    return ret
}

var PickupDDN = function(list){
    let ret = []
    for (let i = list.length-1; i >= 0; i--){
        let ma = list[i];
        let exist = false;
        for (let k = 0; k < ret.length; k++){
            let mb = ret[k];
            if (CompareDDN(ma, mb)) {
                exist = true;
                break;
            }
        }
        if (exist == false) ret.push(ma);
    }
    return ret
}

var CompareDDN = function(a, b){
    try {
        let m = a.DDN;
        let n = b.DDN;
        if (m == n) return true;
        else return false;
    }
    catch(err){
        return false
    }
}

function StartWDtimer(mc){
    StopWDtimer();
    let dcenter = mc.dc
    if ( dcenter != '' ){
        //PollDC();
        let tm = wdInterval + Math.floor((Math.random() * 10) + 1) * 500;
        if (dbg >= 2) console.log('*%s debug: [%s] startWDtimer interval=%d',CurrentTime(), muid, tm);
        wdtimer = setInterval(function(mc){
            _ChkIdleReg()
            PollDC(mc)
        }, tm, mc);
    }
}

function StopWDtimer(){
    if ( wdtimer ) clearInterval(wdtimer);
}

async function PollDC(mc){
    let dcenter = mc.dc
    let ins = mc.mbstack
    let reglist = InGetReginfo('poll')
    if (dbg >= 3) console.log('*%s debug: PollDC %s reglist=%s', CurrentTime(), dcenter, JSON.stringify(reglist));
    if ( dcenter && reglist.count > 0 ){
        let body = {"mcID":muid,"DDNlist":reglist.data}
        let callret = await ins.CallXrpc(dcenter, 'poll', [body], null, null)
        if (dbg >= 3) console.log('*%s debug: PollDC: result=%s', CurrentTime(), JSON.stringify(callret));
        let reply = chkReply(callret)
        if (reply){
            if (typeof reply.ErrCode != 'undefined' && typeof reply.result != 'undefined'){
                if (reply.ErrCode == mcerr.MC_OKCODE){
                    let result = reply.result
                    if (result.length == 0 && edgetable.length > 0){
                        let isDCRestart = true
                        if(_chkIsNewReg()) isDCrestart = false
                        if (isDCRestart){
                            mc._IssueState(DC_ReStart_StateMSG)
                            if (dbg >= 1) console.log('*%s info: PollDC: dc restarted', CurrentTime());                
                            //mc._ExecDCReset()
                            mc._ExecReregAll() 
                        }
                    }
                    else if (edgetable.length != result.length){
                        if (dbg >= 2) console.log('*%s warn: PollDC reginfo different: ei=%d dc=%d', CurrentTime(), edgetable.length, result.length);
                        if (edgetable.length > result.length){
                            // Find which need re reg
                            _HandleUnregDevice(mc, result)
                        }
                    }
                }
            }
        }
    }
}

function _ChkIdleReg(){
    // check edgetable
    len = edgetable.length
    for (let k = len-1; k >= 0; k--){
        let ei = edgetable[k]
        if (ei.State == 'sysreg') {
            if (dbg >= 2) console.log('*%s info: PollDC ChkIdleReg: EiName=%s DDN=%s', CurrentTime(), ei.EiName, ei.DDN);
            edgetable.splice(k,1)
        }
    }
}

async function _HandleUnregDevice(mc, ddnlist){
    if (Array.isArray(ddnlist)){
        for (let i = 0; i < edgetable; i++){
            let found = false
            let ei = edgetable[i]
            for (let k = 0; k < ddnlist.length; k++){
                if (ei.DDN == ddnlist[k] && ei.State == 'reg'){
                    found = true
                    break
                }
            }
            if (!found) {
                if (dbg >= 0) err.out('HandleUnregDevice', ['DDN=',ei.DDN,',EiName=',ei.EiName]);
                await mc._ExecRereg(ei)
            }
        }    
    }
}

function _chkIsNewReg(){
    if (edgetable.length == 1){
        let ei = edgetable[0]
        let ts = ei.TimeStamp
        let nt = new Date()
        let diff = nt - ts
        if (diff < 1000) return true
    }
    return false
}

function _chkIsMultiReg(ei){
    if (ei){
        let ts = ei.TimeStamp
        let nt = new Date()
        let diff = nt - ts
        if (diff < 1000) return true
    }
    return false
}

async function mbusStateChange(mc, state){
    if (dbg >= 2) console.log('*%s info: mbusStateChange %s %s', CurrentTime(), mbstate, state)
    try {
        if (state == 'off'){
            mc._IssueState('mbus off')
            dcstate = ''
            dcq = []
            dcqflag = 1
            StopWDtimer()
        }
        else if (state == 'ready' && ( mbstate != '' || mc.openmc == true)){
            mc._IssueState('mbus ' + state)
            if (dbg >= 0) console.log('*%s info: mbusStateChange: motebus restarted', CurrentTime())
            let openret = ''
            for (let i = 0; i < 3; i++){
                openret = await mc.mbstack.Open(mc.conf)
                if (openret == 'open') break;
                else await mcworker._waitMiniSec(1000)
            }    
            if (openret == 'open'){
                await mc._RePublishFunc();
                //let tm = 5000 + Math.floor((Math.random() * 5) + 1) * 1000;
                let tm = Math.floor((Math.random() * 5) + 1) * 1000;
                await mcworker._waitMiniSec(tm)        
                await mc._ExecDCReset();
            }
            else {
                console.log('*%s error: mbusStateChange result=%s', CurrentTime(), openret)
            }
        }
        else if (state == 'system error'){
            dcstate = ''
            dcq = []
            dcqflag = 1
            StopWDtimer()
        }
    }
    catch(e){
        console.log('*%s error: mbusStateChange msg=%s', CurrentTime(), e.message)
    }
}

function GetIOCLevel(mconf){
    let envioc = mconf.IOCLevel
    let ioclevel = -1
    switch(envioc){
        case 'error':
            ioclevel = 0;
            break;
        case 'reg':
            ioclevel = 1;
            break;
        case 'send':
            ioclevel = 2;
            break;
        case 'all':
            ioclevel = 3;
            break;
        default:
            break;
    }
    return ioclevel
}

function rptIOC(ins, indata, data, xmode){
        try {
            let len = 0
            //if (dbg >= 0) console.log('*%s rptIOC data=%s', CurrentTime(), JSON.stringify(data))
            let pdata = null
            if (Array.isArray(indata)){
               len = indata.length 
               pdata = indata
            }
            else if (indata) {
                pdata.push(indata)
                len = 1
            }
            else len = 0
            if (len > 0){
                for ( let i = 0; i < len; i++ ){
                    let dd = pdata[i]
                    if (typeof dd.IN != 'undefined'){
                        let inctl = dd.IN
                        let {From,To,State} = inctl
                        if (From && To && State){
                            if (dbg >= 3) console.log('*%s debug: rptIOC from=%s,to=%s,result=%s', CurrentTime(), JSON.stringify(From), JSON.stringify(To), State.ErrMsg)
                            let edata = null
                            let msg = typeof data == 'object' ? JSON.stringify(data) : data
                            if (msg){
                                if (msg.length >= 40) msg = msg.substr(0,40)
                            }
                            else msg = ''
                            let dctime = typeof State.DCTime != 'undefined' ? State.DCTime : 0
                            let usetime = typeof State.UseTime != 'undefined' ? State.UseTime : 0
                            if (typeof To == 'string')
                                edata = {"From":From,"To":{"Name":To},"msg":msg,"result":State.ErrMsg,"dctime":dctime,"usetime":usetime}
                            else {
                                let mto = To
                                if (To.Mode) {
                                    if (To.Target) mto = {"Name":To.Target,"Topic":To.Topic}
                                    else mto = {"Name":To.Name,"Topic":To.Topic}
                                }
                                edata = {"From":From,"To":mto,"msg":msg,"result":State.ErrMsg,"dctime":dctime,"usetime":usetime}
                            }
                            let etype = (State.ErrCode == mcerr.MC_OKCODE) ? 'info': 'error' 
                            if (ioclevel == 3 || ioclevel == 2) ins.iocEvent('', this.umma, etype, xmode, edata);
                            else if (etype == 'error' && ioclevel == 0) ins.iocEvent('', this.umma, etype, xmode, edata);   
                        }
                        else {
                            if (dbg >= 0) console.log('*%s error: rptIOC in=%s', CurrentTime(), JSON.stringify(inctl))
                        }
                    }
                    else {
                        if (dbg >= 0) console.log('*%s error: rptIOC %d data=%s', CurrentTime(), i, JSON.stringify(dd))
                    } 
                }    
            }
            else {
                if (dbg >= 0) console.log('*%s error: rptIOC data=%s', CurrentTime(), JSON.stringify(indata))
            }
        }
        catch(err){
            if (dbg >= 0) console.log('*%s error: rptIOC msg=%s', CurrentTime(), err.message)
        }
}

function CreateRandomString(len) {
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

function ConvertTime(ct){
    try {
        let ret = ''
        let yyyy = ct.getFullYear()
        let mm = ct.getMonth() + 1
        let dd = ct.getDate()
        ret = yyyy + '/' + mm + '/' + dd + ' ' + ct.toLocaleTimeString('en-US', { hour12: false })
        return ret;
    
    }
    catch(err){
        return ''
    }
}

module.exports = new MoteChat()
