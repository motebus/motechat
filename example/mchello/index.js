// Hello porgarm for motechat

const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
const MC_SEND_TIMEOUT = 6
const MC_WAIT_REPLY = 12

// The configuration of motebus and motechat
const conf = {
    "AppName":"mchello",
    "AppKey":"YfgEeop5",
    "DCenter":"dc",
    "IOC":"ioc",
    "MotebusGW":"127.0.0.1",
    "WatchLevel":"1"
}

const eiInfo = {
    "EiName":"hello-" + createName(4),
    "EiType":".mc",
    "EiTag":"",
    "EiLoc":""
}

const reginfo = {
    "SToken":"",
    "EiToken":"",
    "WIP":"",
    "LIP":"",
    "EdgeInfo":eiInfo
}

const mchat = require('motechat')

// main

main()

async function main(){
    let result = await setupMotechat()
    if (result.ErrCode == 0){
        helloProc.echoTest(3)
    }
}

// motechat open
function setupMotechat(){
    return new Promise((resolve) => {
        mchat.Open(conf, async (openret) => {
            //console.log('motechat open result=', openret)
            if (openret.ErrCode == 0){
                // get dsim from xstorage
                let getret = await xstorfunc.getdSIM()
                //console.log('get dsim=', getret);
                if (getret.ErrCode == 0){
                    let regdata = reginfo
                    let dsimflag = false
                    if (getret.result) {
                        regdata = getret.result
                        dsimflag = true
                    }
                    // motechat reg and set
                    let regret = await mchat.Reg(regdata)
                    //console.log('motechat reg result=', regret);
                    if (regret.ErrCode == 0 && regret.result){
                        regedinfo = regret.result
                        if (!dsimflag){
                            // save dsim to xstorage
                            let info = regret.result
                            let {SToken,EiToken,EiName,EiType,EiTag,EiLoc} = info
                            let ei = {"EiName":EiName,"EiType":EiType,"EiTag":EiTag,"EiLoc":EiLoc}
                            let savereg = {"SToken":SToken,"EiToken":EiToken,"EdgeInfo":ei}
                            let setret = await xstorfunc.setdSIM(savereg)
                            //console.log('set dsim=', setret);    
                        }
                        resolve(regret)
                    }
                    else {
                        console.log('motechat reg error=', regret.ErrMsg)
                        resolve(regret)
                    }
                }
                else {
                    console.log('get dsim error=', getret.ErrMsg)
                    resolve(getret)
                }
            }
            else {
                console.log('motechat open error=', openret.ErrMsg)
                resolve(openret)
            }
        });        
    })
}

let helloProc = {
    sno: 1,
    prefix: 'SN',
    echoTest: async function(count){
        let ddn = '>>eiEcho-boss'
        let topic = ''
        for (let i = 0; i < count; i++){
            let data = this.makePkt(16)
            console.log('+%s sendPacket ddn=%s data=%s', CurrentTime(), ddn, JSON.stringify(data))
            await this.sendPacket(ddn, topic, data, MC_SEND_TIMEOUT, MC_WAIT_REPLY)    
        }
    },
    makeSno: function(showlen){
        let n = this.sno
        this.sno += 1
        let sn = n.toString()
        let len = showlen - sn.length
        for (let i = 0; i < len; i++) sn = '0' + sn
        return this.prefix + sn
    },
    makePkt: function(len){
        let text = "";
        for (let i = 0; i < len; i++)
          text += possible.charAt(Math.floor(Math.random() * possible.length));
        return {"Sno":this.makeSno(3),"Text":text};    
    },
    sendPacket: function(ddn, topic, data, t1, t2){
        return new Promise((resolve) => {
            let xmsg = {"SToken":regedinfo.SToken,"DDN":ddn,"Topic":topic,"Data":data,"SendTimeout":t1,"WaitReply":t2}
            mchat.Send(xmsg, (result) => {
                console.log('+%s sendPacket result=%s', CurrentTime(), JSON.stringify(result))
                resolve(result)
            })
        })
    },
}

let xstorfunc = {
    setdSIM: async function(data){
        let setdata = {"catalog":conf.AppName,"idname":"dSIM","data":data};
        let result = await mchat.mbSetConfig(setdata);
        return result       
    },
    getdSIM: async function(){
        let getdata = {"catalog":conf.AppName,"idname":"dSIM"};
        let result = await mchat.mbGetConfig(getdata); 
        return result    
    }
}

function createName(len) {
    let text = "";
    for (let i = 0; i < len; i++)
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
