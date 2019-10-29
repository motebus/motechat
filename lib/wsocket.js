// wsocket: module for websocket server
// Date: 2019/10/29
// Version: 1.05
// Updated: 

var exports = module.exports = {};

var io;
var mochat;
var iosocket = [];

const WS_SENDXMSG_TIMEOUT = 10;
const WS_CALLXRPC_TIMEOUT = 10;
const WS_WAITREPLY_TIMEOUT = 20;

var dbg = 0;
var wserr;
var msghandler;
var apphandler;

exports.Init = function( mc, webserver, cb, appcb, msgcb ){
  console.log('wsocket init');
  wserr = require('./mcerr.js');
  mochat = mc;
  if ( typeof appcb == 'function' ) apphandler = appcb;
  if ( typeof msgcb == 'function' ) msghandler = msgcb;
  io = require('socket.io')(webserver,
    {pingTimeout:30000,pingInterval:120000,cookie:true,transports:['polling','websocket']}
  );
  if ( typeof cb == 'function' ) cb({"ErrCode":wserr.WS_OKCODE,"ErrMsg":wserr.WS_OKMSG});
  // define web socket API
  io.on('connection', function (socket) {
    if ( dbg >= 0 ) console.log('->%s: %s: socket conn', CurrentTime(), socket.id );
    //console.log('socket url=%s', JSON.stringify(socket.request.url));
    var addr = socket.handshake.address;
    //console.log('socket addr=%s', addr);
    var rmtip = addr ? addr.substr(addr.lastIndexOf(':')+1) : '';
    if ( rmtip == '1' ) rmtip = '127.0.0.1';
    console.log('socket conn: ip=%s', rmtip);
    var sk = {"DDN":"","Skid":socket.id,"Body":socket,"IP":rmtip,"SToken":"","EiName":""};
    RemoveSocket(socket.id);
    iosocket.push(sk);
    mochat.OnEvent('message', InmsgRcve, 'wsocket' );
    mochat.OnEvent('state', InState, 'wsocket');
    socket.on('disconnect', function() {
      if ( dbg >= 0 ) console.log('->%s: %s: socket disc', CurrentTime(), socket.id );
      var skid = socket.id;
      var stoken = GetSocketAttr( 'stoken', skid );
      if ( stoken != '' ){
        var data = {"SToken":stoken};
        mochat.UnReg(data, function(reply){
          console.log('wsocket:unregdc reply=%s', JSON.stringify(reply));
        });
      }
      //socket.disconnect(true);
      RemoveSocket( skid );
    });
    socket.on('error', function(err) {
      if ( dbg >= 0 ) console.log('->%s: %s: socket error: %s', CurrentTime(), socket.id, err.message );
      var skid = socket.id;
      //socket.disconnect(true);
      RemoveSocket( skid );
    });
    socket.on('request', function(msg, ack) {
        var func;
        if ( dbg >= 1 ) console.log('->%s: %s: request: %s', CurrentTime(), socket.id, JSON.stringify(msg) );
        if ( typeof msg.func == 'string' ){
            func = msg.func;
            //console.log('socket req: func=%s', func);
            if ( func != '' ) func = func.toLowerCase();
            if ( func == 'send' ){
              try {
                var ddn, topic, data, stoken, xmsgctl;
                if ( (msg.body.ddn || msg.body.topic) && msg.body.data ){ // v2.0
                  ddn = msg.body.ddn ? msg.body.ddn : '';
                  topic = msg.body.topic ? msg.body.topic : '';
                  data = msg.body.data;
                  stoken = GetSocketAttr('stoken', socket.id);
                  if ( stoken ) {
                    xmsgctl = {"SToken":stoken,"DDN":ddn,"Topic":topic,"Data":data,"SendTimeout":WS_SENDXMSG_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                    //console.log('wsocket:send xmsg=%s', JSON.stringify(xmsgctl));
                    mochat.Send(xmsgctl, function(reply){
                      if ( dbg >= 1 ) console.log('->%s: wsocket:send reply=%s', CurrentTime(), JSON.stringify(reply));
                      if ( typeof ack == 'function') ack(reply);
                    });
                  }
                  else {
                    console.log('wsocket:send error: invalid SToken');
                    if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidSToken,"ErrMsg":wserr.WS_InvalidSToken_Msg});
                  }
                }
                else {
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidSToken,"ErrMsg":wserr.WS_InvalidSToken_Msg});
                }
              }
              catch(err){
                if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"ws: " + err.message});
              }
            }
            else if ( func == 'call' ){
              try {
                var ddn, to, topic, cfunc, data, stoken, xrpcblk;
                if ( (msg.data.ddn || msg.data.topic) && msg.data.func && msg.data.args ){
                  ddn = msg.data.ddn ? msg.data.ddn : '';
                  topic = msg.data.topic ? msg.data.topic : '';
                  cfunc = msg.data.func;
                  data = msg.data.args;
                  stoken = GetSocketAttr('stoken', socket.id);
                  if ( stoken ){
                    xrpcblk = {"SToken":stoken,"DDN":ddn,"Topic":topic,"Func":cfunc,"Data":data,"SendTimeout":WS_CALLXRPC_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                    mochat.Call(xrpcblk, function(reply){
                      if ( dbg >= 1 ) console.log('->%s: wsocket:call reply=%s',CurrentTime(), JSON.stringify(reply));
                      if ( typeof ack == 'function') ack(reply);
                    });
                  }
                  else {
                    if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidSToken,"ErrMsg":wserr.WS_InvalidSToken_Msg});
                  }
                }
                else {
                  if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg});
                }
              }
              catch(err){
                if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"ws: " + err.message});
              }
            }
            else if ( func == 'regdc'){
              // msg : {func, data{EiToken, SToken}}
              //console.log('wsocket:regdc msg=%s', JSON.stringify(msg));
              // if ( typeof msg.data.SToken == 'string' ) SetSocketAttr('stoken', socket.id, msg.data.SToken);
              try {
                var localip = GetSocketAttr('ip', socket.id);
                //console.log('regdc localip=%s', localip);
                //if ( !localip ) localip = '';
                var SToken = msg.data.SToken;
                var EiToken = msg.data.EiToken;
                if ( SToken && EiToken ){
                  let rix = FindSocketIndex('stoken', SToken);
                  if ( rix >= 0 ){
                    if ( iosocket[rix].sid != socket.id && iosocket[rix].EiToken == EiToken ){
                      // reg before
                      RemoveSocket[rix]; 
                    }
                  }
                }
                var reginfo = {"SToken":SToken,"EiToken":EiToken,"WIP":msg.data.WIP,"LIP":localip,"Web":"wsocket"};
                console.log('wsocket:reg %s', JSON.stringify(reginfo));
                mochat.Reg(reginfo, function(reply){
                  if ( dbg >= 1 ) console.log('wsocket:reg reply=%s', JSON.stringify(reply));
                  if ( reply.ErrCode == wserr.WS_OKCODE ){
                    //SetSocketDDN(socket.id, reply.result.DDN);
                    if ( reply.result ){
                      let ddn = reply.result.DDN ? reply.result.DDN : '';
                      let stoken = reply.result.SToken ? reply.result.SToken : '';
                      if ( ddn && stoken ){
                        let ix = FindSocketIndex('stoken', stoken);
                        if ( ix >= 0 ){
                          // Duplicate reg
                          RemoveSocket(iosocket[ix].Skid);
                        }
                        ix = FindSocketIndex('sid', socket.id);
                        if ( ix >= 0 ) {
                          console.log('wsocket:reg SToken=%s,DDN=%s,EiName=%s', stoken,ddn,reply.result.EiName);
                          iosocket[ix].DDN = ddn;
                          iosocket[ix].SToken = stoken;
                        }
                        if ( typeof ack == 'function') ack(reply);
                      }
                      else {
                        if ( typeof ack == 'function' ){
                          console.log('wsocket:reg reply=%s', JSON.stringify(reply));
                          let err = {"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"ws: Reg info Error","info":reginfo};
                          if ( typeof ack == 'function') ack(err);
                        }
                      }
                    }
                    else {
                      if ( typeof ack == 'function' ){
                        console.log('wsocket:reg reply=%s', JSON.stringify(reply));
                        let err = {"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"ws: No reg info","info":reginfo};
                        if ( typeof ack == 'function') ack(err);
                      }  
                    }
                  }
                  else {
                    console.log('wsocket:reg reply=%s', JSON.stringify(reply));
                    if ( typeof ack == 'function') ack(reply);
                  }   
                });
              }
              catch(e){
                let err = {"ErrCode":wserr.WS_ERRCODE,"ErrMsg":"ws: " + e.message};
                if ( typeof ack == 'function') ack(err);
              }
            }
            else if ( func == 'getinfo'){
              // msg : {func, data{SToken}}
              //console.log('wsocket:getinfo msg=%s', JSON.stringify(msg));
              mochat.Get(msg.data, function(reply){
                //console.log('wsocket:getinfo reply=%s', JSON.stringify(reply));
                if ( typeof ack == 'function') ack(reply);
              });
            }
            else if ( func == 'setinfo'){
              // msg : {func, data{SToken,DeviceInfo}}
              //console.log('wsocket:setinfo msg=%s', JSON.stringify(msg));
              mochat.Set(msg.data, function(reply){
                //console.log('wsocket:setinfo reply=%s', JSON.stringify(reply));
                if ( typeof ack == 'function') ack(reply);
              });
            }
            else if ( func == 'getapp'){
              // msg : {func, data{SToken}}
              //console.log('wsocket:getapp msg=%s', JSON.stringify(msg));
              mochat.GetAppSetting(msg.data, function(reply){
                //console.log('wsocket:getapp reply=%s', JSON.stringify(reply));
                if ( typeof ack == 'function') ack(reply);
              });
            }
            else if ( func == 'setapp'){
              // msg : {func, data{SToken,AppSetting}}
              //if ( dbg >= 1 ) console.log('wsocket:setapp msg=%s', JSON.stringify(msg));
              mochat.SetAppSetting(msg.data, function(reply){
                //console.log('wsocket:getapp reply=%s', JSON.stringify(reply));
                if ( typeof ack == 'function') ack(reply);
              });
            }
            else if ( func == 'nearby'){
              // msg : {func, data{SToken}}
              //console.log('wsocket:nearby msg=%s', JSON.stringify(msg));
              mochat.Nearby(msg.data, function(reply){
                //console.log('wsocket:nearby reply=%s', JSON.stringify(reply));
                if ( typeof ack == 'function') ack(reply);
              });
            }
            else if ( func == 'search'){
              // msg : {func, data{SToken}}
              //console.log('wsocket:nearby msg=%s', JSON.stringify(msg));
              mochat.Search(msg.data, function(reply){
                //console.log('wsocket:nearby reply=%s', JSON.stringify(reply));
                if ( typeof ack == 'function') ack(reply);
              });
            }
            else if ( func == 'getqpin' ){
              if ( dbg >= 1 ) console.log('wsocket:GetQPin msg=%s', JSON.stringify(msg));
              mochat.GetQPin(msg.data, function(reply){
                if ( dbg >= 1 ) console.log('wsocket:GetQPin reply=%s', JSON.stringify(reply));
                if ( typeof ack == 'function') ack(reply);
              });
            }
            else {
              if ( typeof ack == 'function' ){
                ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg});
              }
            }
        }
        else {
          if ( typeof ack == 'function' ){
            ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg});
          }
        }
    });
    socket.on('appfunc', function(msg, ack) {
      if ( typeof apphandler == 'function' ) {
        var ddn = GetSocketAttr('ddn', socket.id);
        if ( ddn )
          apphandler(ddn, msg, ack);
        else
          if ( typeof ack == 'function' ) ack({"ErrCode":wserr.WS_NoMatchDDN,"ErrMsg":wserr.WS_NoMatchDDN_Msg});
      }
      else {
        if ( typeof ack == 'function' ) ack({"ErrCode":wserr.WS_NoFunc,"ErrMsg":wserr.WS_NoFunc_Msg});
      }
    });
  });
}

var InmsgRcve = function(ch, inctl, data, cb){
  if ( dbg >= 0 ){
    console.log('wsocket:InmsgRcve: channel=%s, inctl=%s', ch, JSON.stringify(inctl));
  }
  else if ( dbg >= 1 ) {
    if (typeof data == 'object')
      console.log('wsocket:InmsgRcve: channel=%s, inctl=%s, data=%s', ch, JSON.stringify(inctl), JSON.stringify(data));
    else
      console.log('wsocket:InmsgRcve: channel=%s, inctl=%s, data=%s', ch, JSON.stringify(inctl), data);
  }
  if ( inctl && data ){
    if ( typeof msghandler == 'function'){
      msghandler(ch, inctl, data, cb);
    }
    else {
      var ddn = (inctl.To) ? ( inctl.To.DDN ) ? inctl.To.DDN : '' : '';
      var ix = FindSocketIndex('ddn', ddn );
      if ( ix >= 0 ){
        var client = iosocket[ix].Body;
        client.emit( 'message', {"method":ch,"ctl":inctl,"data":data}, function(reply){
          if ( dbg >= 1 ) console.log('wsocket:InmsgRcve: reply=%s', JSON.stringify(reply));
          cb(reply);
        });
      }
      else {
        var errmsg = {"ErrCode":wserr.WS_NoMatchDDN,"ErrMsg":wserr.WS_NoMatchDDN_Msg,"DDN":ddn}; 
        cb(errmsg);
        console.log('wsocket:InmsRcve err: %s',JSON.stringify(errmsg));
        let data = {"DDN":ddn};
        mochat.UnReg(data);
      }
    }
  }
  else {
    var errmsg = {"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg,"DDN":to};
    cb(errmsg);
    console.log('wsocket:InmsRcve err: %s',JSON.stringify(errmsg));
  }
}

var InState = function(state, ddn){
  if ( ddn ){
    if ( dbg >= 0 ) console.log('wsocket:InState state=%s,ddn=%s', state, ddn);
    var ix = FindSocketIndex('ddn', ddn );
    if ( ix >= 0 ){
      var client = iosocket[ix].Body;
      if ( state == 'unreg OK'){
        //client.disconnect(true);
        RemoveSocket( ix );
      }
      else 
        client.emit( 'state', state );
    }
  }
  else {
    if ( dbg >= 0 ) console.log('wsocket:InState state=%s', state);
    var client, msg = '';
    msg = stateTranslate(state);
    if ( msg ){
      for ( var i = iosocket.length-1; i >= 0; i-- ){
        client = iosocket[i].Body;
        //client.disconnect(true);
        //RemoveSocket( i );
        client.emit( 'state', msg );
      } 
    }
  }
}

var stateTranslate = function(state){
  let msg = '';
  if ( state == 'opened2' ) msg = 'mbus re-open';
  else if ( state == 'off' ) msg = 'mbus off';
  else if ( state == 're-reg' ) msg = 'dc re-reg';
  else if ( state == 'in: Address not found') msg = 'dc off';
  else if ( state == 'dc restart') msg = state;
  return msg;
}

var GetSocketAttr = function(attr, sid){
  var ret = '';
  var ix = FindSocketIndex('sid', sid);
  if ( ix >= 0 ) {
    if ( attr == 'ddn' )
      ret = iosocket[ix].DDN;
    else if ( attr == 'stoken' )
      ret = iosocket[ix].SToken;
    else if ( attr == 'ip' )
      ret = iosocket[ix].IP;
    else
      console.log('wsocket:GetSocketAttr invalid attr');
  }
  else console.log('wsocket:GetSocketAttr invalid sid');
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

var RemoveSocket = function(sid){
  var ix = FindSocketIndex('sid', sid);
  if ( ix >= 0 ) {
    iosocket.splice(ix, 1);
  }
}

var CurrentTime = function(){
  var ret;
  var ct = new Date();
  ret = ct.toLocaleString() + '.' + ct.getMilliseconds().toString();
  return ret;
}

