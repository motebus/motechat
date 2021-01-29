// wsocket: module for websocket server
// Date: 2020/12/30
// Version: 1.2.7
// Updated: 

var exports = module.exports = {};

var io;
var mochat;
var iosocket = [];

const WS_SENDXMSG_TIMEOUT = 10;
const WS_CALLXRPC_TIMEOUT = 10;
const WS_WAITREPLY_TIMEOUT = 20;
const useInState = true

var dbg = 0;
var wserr;
var msghandler;
var evthandler;
var apphandler;
var rcveMsg = true;
var rcveEvent = false;
var wsTimer = null;
var isFirstReg = true;
var watchbusy = false;

const WS_WATCH_INTERVAL = 20000; // ms
const WS_SOCKET_IDLE_TIMEOUT = 60; // sec
const WS_REG_WAIT_TIME = 30; // sec

// mc: motechat object
// webserver: web server object
// cb: callback of init
// option: option of init
// option.apphook: app hook of websocket on appfunc
// option.rmsgflag if receive message? true or false
// option.msghook: msg hook of received xmsg
// option.revtflag: if receive event? true or false
// option.evthook: event hook of received event
exports.Init = function( mc, webserver, cb, option ){
  if (dbg >= 2) console.log('>%sinfo: wsocket init', CurrentTime());
  wserr = require('./mcerr.js');
  mochat = mc;
  if (option){
    if (option.apphook) {if ( typeof option.apphook == 'function' ) apphandler = option.apphook;}
    if (option.msghook) {if ( typeof option.msghook == 'function' ) msghandler = option.msghook;}
    if (option.evthook) {if ( typeof option.evthook == 'function' ) evthandler = option.evthook;}
    if (option.rmsgflag) rcveMsg = option.rmsgflag;
    if (option.revtflag) rcveEvent = option.revtflag;
  }
  io = require('socket.io')(webserver,
    {pingTimeout:30000,pingInterval:120000,cookie:true,transports:['polling','websocket']}
  );
  if ( typeof cb == 'function' ) cb({"ErrCode":wserr.WS_OKCODE,"ErrMsg":wserr.WS_OKMSG});
  // define web socket API
  io.on('connection', function (socket) {
    var referer = socket.handshake.headers.referer
    //console.log('>%s info: wsocket conn %s', CurrentTime(), referer );
    var addr = socket.handshake.address;
    var rmtip = addr ? addr.substr(addr.lastIndexOf(':')+1) : '';
    if ( rmtip == '1' ) rmtip = '127.0.0.1';
    console.log('>%s info: wsocket conn %s referer=%s ip=%s', CurrentTime(), socket.id, referer, rmtip );
    //if ( dbg >= 1 ) console.log('>%s wsocket conn: ip=%s', CurrentTime(), rmtip);
    //RemoveSocket(socket.id);
    let ix = FindSocketIndex('sid', socket.id);
    if (ix < 0) {
      let sk = {"DDN":"","Skid":socket.id,"Body":socket,"IP":rmtip,"SToken":"","EiToken":"","EiName":"","EiType":"","State":"","Time":new Date(),"ifSet":false,"Unreg":false};
      iosocket.push(sk);
    }
    socket.on('disconnect', function(reason) {
      if ( dbg >= 0 ) console.log('>%s info: wsocket disc %s %s', CurrentTime(), socket.id, reason );
      try {
        let skid = socket.id;
        let index = FindSocketIndex('sid', skid);
        if (index >= 0){
          let wsctl = iosocket[index]
          let {State} = wsctl
          if (State == 'reg...') wsctl.Unreg = true
          else if (State == 'reg') {
            wsctl.State = 'unreg'
            wsctl.Time = new Date()
          }
          else iosocket.splice(index, 1);
        }  
      }
      catch(err){
        console.log('>%s error: wsocket disc msg=%s', CurrentTime(), err.message);
      }
    });
    socket.on('error', function(err) {
      if ( dbg >= 0 ) console.log('>%s error: wsocket %s %s', CurrentTime(), socket.id, err.message );
      try {
        var skid = socket.id;
        let index = FindSocketIndex('sid', skid);
        if (index >= 0){
          let wsctl = iosocket[index]
          let {State} = wsctl
          if (State == 'reg...') wsctl.Unreg = true
          else if (State == 'reg') {
            wsctl.State = 'unreg'
            wsctl.Time = new Date()
          }
          else iosocket.splice(index, 1);
        }    
      }
      catch(err){
        console.log('>%s wsocket error except=%s', CurrentTime(), err.message);
      }
    });
    socket.on('request', function(msg, ack) {
        if ( dbg >= 3 ) console.log('>%s info: %s request=%s', CurrentTime(), socket.id, JSON.stringify(msg) );
        if ( typeof msg.func == 'string' ){
          let mfunc = msg.func;
          if (mfunc != '' ) mfunc = mfunc.toLowerCase();
          if (mfunc == 'regdc' || mfunc == 'getwipurl'){
            if ( mfunc == 'regdc'){
              // msg : {func, data{EiToken, SToken}}
              if (dbg >= 3) console.log('>%s info: regdc msg=%s', CurrentTime(), JSON.stringify(msg));
              try {
                let skix = FindSocketIndex('sid', socket.id);
                if ( skix >= 0 ){
                  let data = msg.data
                  if (typeof data.SToken == 'string' && typeof data.EiToken == 'string'){
                    let {SToken,EiToken,WIP,LIP} = data;
                    if ( !WIP ) WIP = '';
                    if ( !LIP ) LIP = GetSocketAttr('ip', socket.id, '');
                    let reginfo = {"SToken":SToken,"EiToken":EiToken,"WIP":WIP,"LIP":LIP,"isWeb":true};
                    if (dbg >= 1) console.log('>%s info: reg SToken=%s WIP=%s', CurrentTime(), SToken, WIP)
                    if (dbg >= 3) console.log('>%s info: reg %s', CurrentTime(), JSON.stringify(reginfo));
                    iosocket[skix].State = 'reg...'
                    let wsid = socket.id
                    mochat.Reg(reginfo, function(reply){
                      if ( dbg >= 3 ) console.log('>%s info: reg reply=%s', CurrentTime(), JSON.stringify(reply));
                      if ( reply.ErrCode == wserr.WS_OKCODE ){
                        if ( reply.result ){
                          let {SToken,EiToken,DDN} = reply.result;
                          if ( SToken && EiToken && DDN ){
                            let wsix = FindSocketIndex('sid', wsid);
                            //if (iosocket[wsix]){
                            if (wsix >= 0){
                              if ( dbg < 3 ) console.log('>%s info: %s reg OK SToken=%s,DDN=%s', CurrentTime(), socket.id, SToken, DDN);
                              SetSocketAttr(wsix, reply.result)
                              if ( typeof ack == 'function') ack(reply);
                              mochat.OnEvent('state', InState, SToken);                              
                              if (rcveMsg) mochat.OnEvent('message', InmsgRcve, SToken);
                              if (rcveEvent) mochat.OnEvent('event', EventRcve, SToken);
                              if (isFirstReg){
                                dbg = mochat.getDebug()
                                if (dbg >= 2) console.log('>%s info: watchlevel=%d', CurrentTime(), dbg);
                                wsTimer = setInterval(() => {
                                  WatchIdleSocket()
                                }, WS_WATCH_INTERVAL) 
                                isFirstReg = false
                              }
                              if (iosocket[wsix].Unreg) {
                                iosocket[wsix].State = 'unreg'
                                iosocket[wsix].Unreg = false
                                iosocket[wsix].Time = new Date()
                              }
                            }
                            else {
                              console.log('>%s error: reg: socket not found', CurrentTime());
                              let err = {"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"Socket not found"};
                              if ( typeof ack == 'function') ack(err); 
                              let data = {"SToken":SToken}
                              mochat.UnReg(data)
                            }
                          }
                          else {
                            console.log('>%s error: reg reply result=%s', CurrentTime(), JSON.stringify(reply.result));
                            if ( typeof ack == 'function') ack(reply);
                          }
                        }
                        else {
                          console.log('>%s error: reg reply=%s', CurrentTime(), JSON.stringify(reply));
                          if ( typeof ack == 'function') ack(reply);
                        }
                      }
                      else {
                        console.log('>%s error: reg reply=%s', CurrentTime(), JSON.stringify(reply));
                        if ( typeof ack == 'function') ack(reply);
                      }   
                    });
                  } 
                  else {
                    let err = {"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"SToken or EiToken data type error"};
                    console.log('>%s error: reg msg=%s', CurrentTime(), err.ErrMsg);
                    if ( typeof ack == 'function') ack(err);  
                  } 
                }
              }
              catch(e){
                console.log('>%s error: reg msg=%s', CurrentTime(), e.message);
                let err = {"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"ws: " + e.message};
                if ( typeof ack == 'function') ack(err);
              }
            }
            else if (mfunc == 'getwipurl'){
                let url = mochat.GetwipUrl()
                if (dbg >= 3) console.log('>%s info: getwipurl url=', CurrentTime(), url);
                if (typeof ack == 'function') {
                  if (url) ack(url)
                  else ack('')
                }
            }
          }
          else {
            let stoken = GetSocketAttr('stoken', socket.id, 'reg');
            if (stoken){
              if ( mfunc == 'send' ){
                try {
                  let body = msg.body;
                  let {ddn, topic, data} = body;
                  if ( ddn && data ) {
                    if (!topic) topic = '';
                    let xmsgctl = {"SToken":stoken,"DDN":ddn,"Topic":topic,"Data":data,"SendTimeout":WS_SENDXMSG_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                    mochat.Send(xmsgctl, function(reply){
                      if ( dbg >= 3 ) console.log('>%s info: send reply=%s', CurrentTime(), JSON.stringify(reply));
                      if ( typeof ack == 'function') ack(reply);
                    });
                  }
                  else {
                    console.log('>%s error: send: invalid data=%s', CurrentTime(), JSON.stringify(body));
                    if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg});
                  }
                }
                catch(err){
                  console.log('>%s error: send msg=%s', CurrentTime(), err.message);
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if ( mfunc == 'call' ){
                try {
                  let data = msg.data;
                  let {ddn, topic, func, args} = data;
                  if ( ddn && func && args ){
                    if (!topic) topic = '';
                    let xrpcblk = {"SToken":stoken,"DDN":ddn,"Topic":topic,"Func":func,"Data":args,"SendTimeout":WS_CALLXRPC_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                    //console.log('>%s info: call xprc=%s', JSON.stringify(xrpcblk))
                    mochat.Call(xrpcblk, function(reply){
                      if ( dbg >= 3 ) console.log('>%s info: call reply=%s',CurrentTime(), JSON.stringify(reply));
                      if ( typeof ack == 'function') ack(reply);
                    });
                  }
                  else {
                    console.log('>%s error: call: invalid data=%s', CurrentTime(), JSON.stringify(data));
                    if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg});  
                  }
                }
                catch(err){
                  console.log('>%s error: call msg=%s', CurrentTime(), err.message);
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'getinfo'){
                try {
                  let getdata = {"SToken":stoken}
                  mochat.Get(getdata, function(reply){
                    if ( typeof ack == 'function') ack(reply);
                  });    
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'setinfo'){
                try {
                  let data = msg.data
                  //console.log('>%s setinfo data=%O', CurrentTime(), data)
                  let {EiName,EiType,EiTag,EiLoc} = data.EdgeInfo
                  if (EiName && EiType){
                    if (!EiTag) EiTag = ''
                    if (!EiLoc) EiLoc = ''
                    let setdata = {"SToken":stoken,"EdgeInfo":{"EiName":EiName,"EiType":EiType,"EiTag":EiTag,"EiLoc":EiLoc}}
                    mochat.Set(setdata, function(reply){
                      if (dbg >= 3) console.log('>%s info: setinfo reply=', CurrentTime(), reply)
                      if (reply.ErrCode == wserr.WS_OKCODE && typeof reply.result == 'object'){
                        let skix = FindSocketIndex('sid', socket.id);
                        if ( skix >= 0 ){
                          if (iosocket[skix]){
                            let {EiName,EiType} = reply.result
                            if (EiName && EiType) {
                              iosocket[skix].EiName = EiName
                              iosocket[skix].EiType = EiType
                              iosocket[skix].ifSet = true
                            }
                          }
                        }
                      }
                      if (typeof ack == 'function') ack(reply);
                    })
                  }
                  else {
                    let ret = {"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData}
                    if (typeof ack == 'function') ack(ret)
                  }
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'getapp'){
                try {
                  let getdata = {"SToken":stoken}
                  mochat.GetAppSetting(getdata, function(reply){
                    if ( typeof ack == 'function') ack(reply);
                  });  
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'setapp'){
                try {
                  let data = msg.data
                  if (typeof data.Setting != 'undefined'){
                    let setdata = {"SToken":stoken,"Setting":data.Setting}
                    mochat.SetAppSetting(setdata, function(reply){
                      if ( typeof ack == 'function') ack(reply);
                    });  
                  }
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'nearby'){
                try {
                  let xdata = {"SToken":stoken}
                  mochat.Nearby(xdata, function(reply){
                    if ( typeof ack == 'function') ack(reply);
                  });    
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'search'){
                try {
                  let data = msg.data
                  if (typeof data.Keyword == 'string'){
                    let xdata = {"SToken":stoken,"Keyword":data.Keyword}
                    mochat.Search(xdata, function(reply){
                      if ( typeof ack == 'function') ack(reply);
                    });      
                  }
                  else {
                    if (typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg})
                  }  
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'getqpin'){
                //if ( dbg >= 3 ) console.log('>%s GetQPin msg=%s', CurrentTime(), JSON.stringify(msg));
                try {
                  let xdata = {"SToken":stoken}
                  mochat.GetQPin(xdata, function(reply){
                    if ( dbg >= 3 ) console.log('>%s info: GetQPin reply=%s', CurrentTime(), JSON.stringify(reply));
                    if ( typeof ack == 'function') ack(reply);
                  });    
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'unregdc'){
                try {
                  let xdata = {"SToken":stoken}
                  mochat.UnReg(xdata, function(reply){
                    if ( dbg >= 3 ) console.log('>%s info: UnReg reply=%s', CurrentTime(), JSON.stringify(reply));
                    if ( typeof ack == 'function') ack(reply);
                  });    
                }
                catch(err){
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
                }
              }
              else if (mfunc == 'mbgetconf'){
                //xdata = {"catalog":"","idname":""};
                mochat.mbSetConfig(xdata, function(reply){
                  if ( dbg >= 3 ) console.log('>%s info: mbgetconf reply=%s', CurrentTime(), JSON.stringify(reply));
                  if ( typeof ack == 'function') ack(reply);
                })
              }
              else if (mfunc == 'mbsetconf'){
                //xdata = {"catalog":"","idname":"","data":{}};
                mochat.mbSetConfig(xdata, function(reply){
                  if ( dbg >= 3 ) console.log('>%s info: mbsetconf reply=%s', CurrentTime(), JSON.stringify(reply));
                  if ( typeof ack == 'function') ack(reply);
                })
              }
              else {
                if ( typeof ack == 'function' ){
                  console.log('>%s error: request: invalid func=%s', CurrentTime(), mfunc);
                  ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":"invalid function"});
                }
              }
            }
            else {
              if (typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidSToken,"ErrMsg":"no reg"})
            }  
          }
        }
        else {
          if ( typeof ack == 'function' ){
            if (typeof msg == 'string') console.log('>%s error: request: invalid data=%s', CurrentTime(), msg);
            else if (typeof msg == 'object') console.log('>%s error: request: invalid data=%s', CurrentTime(), JSON.stringify(msg));
            ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg,"Info":msg});
          }
        }
    });
    socket.on('appfunc', function(msg, ack) {
      if ( typeof apphandler == 'function' ) {
        try {
          var ddn = GetSocketAttr('ddn', socket.id, 'reg');
          if ( ddn ){
            if ( dbg >= 3 ) console.log('>%s info: appfunc msg=%s', CurrentTime(), JSON.stringify(msg));
            apphandler(ddn, msg, ack);
          }
          else
            if ( typeof ack == 'function' ) ack({"ErrCode":wserr.WS_NoMatchDDN,"ErrMsg":wserr.WS_NoMatchDDN_Msg});  
        }
        catch(err){
          if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":err.message});
        }
      }
      else {
        if ( typeof ack == 'function' ) ack({"ErrCode":wserr.WS_NoFunc,"ErrMsg":wserr.WS_NoFunc_Msg});
      }
    });
  });
}

exports.emitMsgToClient = function(ch, inctl, data, cb){
  emitMsgToClient(ch, inctl, data, cb);
}

exports.emitEvtToClient = function(ch, head, event, cb){
  emitEvtToClient(ch, head, event, cb);
}

var WatchIdleSocket = async function(){
  let len = iosocket.length
  if (len > 0 && watchbusy == false){
    watchbusy = true
    for (let i = len-1; i >= 0; i--){
      let skctl = iosocket[i]
      if (skctl.State == ''){
        let ts = skctl.Time
        let diff = TimeDiff(ts)
        if (diff > WS_SOCKET_IDLE_TIMEOUT) {
          if (dbg >= 3) console.log('>%s debug: WatchIdleSocket=%d %s', CurrentTime(), i, skctl.Skid);
          let socket = skctl.Body
          socket.disconnect(true);
          iosocket.splice(i, 1);
        }
      }
      else if (skctl.State == 'unreg'){
        let {SToken,Skid,Time} = skctl
        if (SToken){
          let diff = TimeDiff(Time)
          if (diff >= WS_REG_WAIT_TIME){
              if (dbg >= 2) console.log('>%s info: wsocket disc %s,SToken=%s', CurrentTime(), Skid, SToken);
              if (FindSameSToken(SToken, Skid) == true) iosocket.splice(i, 1);
              else {
                //if ( dbg >= 1 ) console.log('>%s wsocket disc SToken=%s', CurrentTime(), SToken);
                Time = new Date()
                let data = {"SToken":SToken};
                let reply = await mochat.UnReg(data)
                iosocket.splice(i, 1);
                if (reply.ErrCode != wserr.WS_OKCODE) console.log('>%s error: unregdc msg=%s', CurrentTime(), reply.ErrMsg);
                //if (reply.ErrCode == wserr.WS_OKCODE) iosocket.splice(i, 1);
                //else console.log('>%s error: unregdc msg=%s', CurrentTime(), reply.ErrMsg);
              }
          }
        }
      }
    }
    watchbusy = false
  }
}

var TimeDiff = function(ts){
  if (ts){
    let nt = new Date()
    let diff = (nt.getTime() - ts.getTime()) / 1000
    return diff
  }
  else return 0
}

var InmsgRcve = function(ch, inctl, data, cb){
  if ( dbg >= 2 ){
    console.log('>%s info: InmsgRcve: channel=%s, inctl=%s', CurrentTime(), ch, JSON.stringify(inctl));
  }
  if ( dbg >= 3 ) {
    if (typeof data == 'object')
      console.log('>%s info: InmsgRcve: data=%s', CurrentTime(), JSON.stringify(data));
    else
      console.log('>%s info: InmsgRcve: data=%s', CurrentTime(), data);
  }
  if ( inctl ){
    if ( typeof msghandler == 'function'){
      msghandler(ch, inctl, data, cb);
    }
    else {
      emitMsgToClient(ch, inctl, data, cb);
    }
  }
  else {
    var errmsg = {"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg};
    cb(errmsg);
    console.log('>%s error: InmsgRcve: in=%s data=%s', CurrentTime(), JSON.stringify(inctl));
  }
}

var emitMsgToClient = function(ch, inctl, data, cb){
  let ddn = (inctl.To) ? ( inctl.To.DDN ) ? inctl.To.DDN : '' : '';
  if (ddn){
    let ix = FindSocketIndex('ddn', ddn );
    if ( ix >= 0 ){
      var client = iosocket[ix].Body;
      client.emit( 'message', {"method":ch,"ctl":inctl,"data":data}, (reply) => {
        if ( dbg >= 3 ) console.log('>%s info: InmsgRcve: reply=%s', CurrentTime(), JSON.stringify(reply));
        if (typeof cb == 'function') cb(reply);
      });
    }
    else {
      let errmsg = {"ErrCode":wserr.WS_NoMatchDDN,"ErrMsg":wserr.WS_NoMatchDDN_Msg}; 
      if (typeof cb == 'function') cb(errmsg);
      console.log('>%s error: emitMsgToClient in=%s',CurrentTime(),JSON.stringify(inctl));
    }    
  }
  else {
    let errmsg = {"ErrCode":wserr.WS_NoMatchDDN,"ErrMsg":wserr.WS_NoMatchDDN_Msg}; 
    if (typeof cb == 'function') cb(errmsg);
    console.log('>%s error: emitMsgToClient in=%s',CurrentTime(),JSON.stringify(inctl));
  }
}

var EventRcve = function(ch, head, event, cb){
  if ( dbg >= 2 ) console.log('>%s info: EventRcve from=%s', CurrentTime(), JSON.stringify(head.from));
  if ( dbg >= 3 ) console.log('>%s info: EventRcve event=%s', CurrentTime(), JSON.stringify(event));
  if ( typeof evthandler == 'function'){
    evthandler(ch, head, event, cb);
  }
  else {
    emitEvtToClient(ch, head, event, cb);
  }
}

var emitEvtToClient = function(ch, head, event, cb){
  if ( iosocket.length > 0 ){
    let client;
    for( var i = 0; i < iosocket.length; i++ ){
      if ( dbg >= 2 ) console.log('>%s info: emitEvtToClient ddn=%s', CurrentTime(), iosocket[i].DDN);
      if ( iosocket[i].DDN ){
        client = iosocket[i].Body;
        let emitData = {"method":ch,"from":head.from,"data":event.data};
        client.emit( 'event', emitData, (reply) => {
          if ( typeof cb == 'function' ) cb(reply);
        });
      }
    }
  }
  else {
    if (typeof cb == 'function') cb({"ErrCode":wserr.WS_OKCODE,"ErrMsg":wserr.WS_OKMSG});
  }
}

var InState = function(state, SToken){
  if (state){
    //if (state == 'mbus off'){
      //console.log('>%s InState state=%s', CurrentTime(), state);
    //}
    if ( SToken ){
      if ( dbg >= 2 ) console.log('>%s info: InState state=%s,SToken=%s', CurrentTime(), state, SToken);
      if (useInState){
        var ix = FindSocketIndex('stoken', SToken );
        if ( ix >= 0 ){
          let client = iosocket[ix].Body;
          client.emit('state', iosocket[ix].Skid, state);
        }  
      }
    }
    else {
      if ( dbg >= 2 ) console.log('>%s info: InState state=%s', CurrentTime(), state);
      if (useInState){
        for ( let i = iosocket.length-1; i >= 0; i-- ){
          let client = iosocket[i].Body;
          let skid = iosocket[i].Skid 
          if (client && skid) client.emit('state', skid, state);
        }  
      }
    } 
  }
}

var SetSocketAttr = function(index, attr){
  try {
    let sk = iosocket[index]
    let {DDN,SToken,EiToken,WIP,LIP,EiName,EiType} = attr
    sk.DDN = DDN;
    sk.SToken = SToken;
    sk.EiToken = EiToken;
    sk.WIP = WIP ? WIP : '';
    sk.LIP = LIP ? LIP : '';
    sk.EiName = EiName ? EiName : ''
    sk.EiType = EiType ? EiType : ''
    if (sk.EiName && sk.EiType) sk.ifSet = true
    sk.State = 'reg';
    sk.Time = new Date();
    return true
  }
  catch(e){
    console.log('>%s error: SetSocketAttr msg=%s', CurrentTime(), e.message);
    return false
  }
}

var GetSocketAttr = function(attr, sid, state){
  var ret = '';
  var ix = FindSocketIndex('sid', sid);
  if ( ix >= 0 ) {
    let isfetch = true
    if (state == 'reg') {
      if (iosocket[ix].State != 'reg') {
        //console.log('>%s GetSocketAttr not reg', CurrentTime());
        isfetch = false
      }
    }
    if (isfetch){
      if ( attr == 'ddn' )
        ret = iosocket[ix].DDN;
      else if ( attr == 'stoken' )
        ret = iosocket[ix].SToken;
      else if ( attr == 'ip' )
        ret = iosocket[ix].IP;
      else
        console.log('>%s error: GetSocketAttr invalid attr', CurrentTime());
    }
  }
  else console.log('>%s error: GetSocketAttr invalid sid', CurrentTime());
  return ret;  
}

var FindSocketIndex = function(stype, skey){
  var atype = stype;
  if ( atype != '' ) {
    atype = atype.toLowerCase();
    for ( var i = iosocket.length-1; i >= 0; i-- ){
      if ( stype == 'sid' ){
        if ( iosocket[i].Skid == skey ){
          return i;
        }
      }
      else if ( stype == 'ddn' ){
        if ( iosocket[i].DDN == skey ){
          return i;
        }
      }
      else if ( stype == 'stoken' ){
        if ( iosocket[i].SToken == skey ){
          return i;
        }
      }
    }
  }
  return -1;
}

var FindSameSToken = function(stoken, sid){
  for ( var i = iosocket.length-1; i >= 0; i-- ){
    if ( iosocket[i].SToken == stoken && iosocket[i].Skid != sid ) return true
  }
  return false
}

var RemoveSocket = function(sid){
  var ix = FindSocketIndex('sid', sid);
  if ( ix >= 0 ) {
    iosocket.splice(ix, 1);
  }
}

var CurrentTime = function(){
  var ret
	var ct = new Date()
	var zzz = ct.getMilliseconds().toString()
	if ( zzz.length == 1 ) zzz = '00' + zzz
    else if ( zzz.length == 2 ) zzz = '0' + zzz
    ret = ct.toLocaleTimeString('en-US', { hour12: false }) + '.' + zzz
    return ret;
}

