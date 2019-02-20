// wsocket: module for websocket server
// Date: 2018/4/25
// Version: 0.98

var exports = module.exports = {};

var io;
var mochat;
var iosocket = [];

const WS_SENDXMSG_TIMEOUT = 10;
const WS_CALLXRPC_TIMEOUT = 10;
const WS_WAITREPLY_TIMEOUT = 20;

var dbg = 0;
var wserr;
var sysfunc;

exports.Init = function( mc, webserver, cb, syscb ){
    wserr = require('./mcerr.js');
    mochat = mc;
    sysfunc = syscb;
    io = require('socket.io')(webserver,
      {pingTimeout:120000,pingInterval:30000,cookie:true,transports:['polling','websocket']}
    );
    if ( typeof cb == 'function' ) cb({"ErrCode":wserr.WS_OKCODE,"ErrMsg":wserr.WS_OKMSG});
    // define web socket API
    io.on('connection', function (socket) {
      if ( dbg >= 0 ) console.log('->%s: %s: socket conn', CurrentTime(), socket.id );
        console.log('socket url=%s', JSON.stringify(socket.request.url));
        var addr = socket.request.connection.remoteAmbddress;
        console.log('socket addr=%s', addr);
        var sk = {"DDN":"","Skid":socket.id,"Body":socket,"IP":"","SToken":"","EiName":""};
        iosocket.push(sk);
        mochat.OnEvent('message', InmsgRcve, 'wsocket' );
        mochat.OnEvent('state', InState, 'wsocket');
        socket.on('disconnect', function() {
          if ( dbg >= 0 ) console.log('->%s: %s: socket disc', CurrentTime(), socket.id );
          var skid = socket.id;
          var stoken = GetSocketAttr( 'stoken', skid );
          if ( stoken != '' && ChkSocketStoken(stoken) == 1 ){
            var data = {"SToken":""};
            data.SToken = stoken;
            mochat.UnReg(data, function(reply){
              //console.log('wsocket:unregdc reply=%s', JSON.stringify(reply));
              if ( reply.ErrCode == wserr.WS_OKCODE ){
                if ( dbg >= 1 ) console.log('->%s: Unreg OK %s', CurrentTime(), data.SToken );  
              }
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
                    var ddn, to, topic, data, stoken, xmsgctl;
                    if ( (msg.body.ddn || msg.body.topic) && msg.body.data ){ // v2.0
                      ddn = msg.body.ddn ? msg.body.ddn : '';
                      topic = msg.body.topic ? msg.body.topic : '';
                      data = msg.body.data;
                      stoken = GetSocketAttr('stoken', socket.id);
                      xmsgctl = {"SToken":stoken,"DDN":ddn,"Topic":topic,"Data":data,"SendTimeout":WS_SENDXMSG_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                      mochat.Send(xmsgctl, function(reply){
                        if ( dbg >= 1 ) console.log('->%s: wsocket:send reply=%s', CurrentTime(), JSON.stringify(reply));
                        if ( typeof ack == 'function') ack(reply);
                      });
                    }
                    else if ( msg.body.to && msg.body.data ){ // V1.0
                      to = msg.body.to;
                      data = msg.body.data;
                      stoken = GetSocketAttr('stoken', socket.id);
                      xmsgctl = {"SToken":stoken,"To":to,"Data":data,"SendTimeout":WS_SENDXMSG_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                      mochat.Send(xmsgctl, function(reply){
                        if ( dbg >= 1 ) console.log('->%s: wsocket:send reply=%s', CurrentTime(), JSON.stringify(reply));
                        if ( typeof ack == 'function') ack(reply);
                      });
                    }
                    else {
                      if ( typeof ack == 'function') ack({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg});
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
                      xrpcblk = {"SToken":stoken,"DDN":ddn,"Topic":topic,"Func":cfunc,"Data":data,"SendTimeout":WS_CALLXRPC_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                      mochat.Call(xrpcblk, function(reply){
                        if ( dbg >= 1 ) console.log('->%s: wsocket:call reply=%s',CurrentTime(), JSON.stringify(reply));
                        if ( typeof ack == 'function') ack(reply);
                      });
                    }
                    else if ( msg.data.to && msg.data.func && msg.data.args ){  // v1.0
                      to = msg.data.to;
                      cfunc = msg.data.func;
                      data = msg.data.args;
                      stoken = GetSocketAttr('stoken', socket.id);
                      xrpcblk = {"SToken":stoken,"To":to,"Func":cfunc,"Data":data,"SendTimeout":WS_CALLXRPC_TIMEOUT,"WaitReply":WS_WAITREPLY_TIMEOUT};
                      mochat.Call(xrpcblk, function(reply){
                        if ( dbg >= 1 ) console.log('->%s: wsocket:call reply=%s',CurrentTime(), JSON.stringify(reply));
                        if ( typeof ack == 'function') ack(reply);
                      });
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
                  // console.log('wsocket:regdc data=%s', JSON.stringify(msg));
                  // if ( typeof msg.data.SToken == 'string' ) SetSocketAttr('stoken', socket.id, msg.data.SToken);
                  var reginfo = {"SToken":msg.data.SToken,"EiToken":msg.data.EiToken,"WIP":msg.data.WIP,"Web":"wsocket"};
                  mochat.Reg(reginfo, function(reply){
                    if ( dbg >= 1 ) console.log('wsocket:regdc reply=%s', JSON.stringify(reply));
                    else console.log('wsocket:regdc reply=%s', reply.ErrMsg);
                    if ( reply.ErrCode == wserr.WS_OKCODE ){
                      //SetSocketDDN(socket.id, reply.result.DDN);
                      SetSocketAttr('ddn', socket.id, reply.result.DDN);
                      SetSocketAttr('stoken', socket.id, reply.result.SToken);
                    }    
                    if ( typeof ack == 'function') ack(reply);
                  });
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
        socket.on('sys', function(msg, ack) {
          if ( typeof sysfunc == 'function' ) {
            var ddn = GetSocketAttr('ddn', socket.id);
            sysfunc(ddn, msg, ack);
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
  if ( inctl ){
    var ddn = ( inctl.To.DDN ) ? inctl.To.DDN : '';
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
    }
  }
  else {
    var errmsg = {"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg,"DDN":to};
    cb(errmsg);
    console.log('wsocket:InmsRcve err: %s',JSON.stringify(errmsg));
  }
}

var InState = function(state, ddn){
  if ( dbg >= 0 ) console.log('wsocket:InState state=%s', state);
  if ( ddn ){
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
    var client;
    /*
    if ( state == 'dc restart' ){
      if ( dbg >= 0 ) console.log('wsocket:InState state=dc restart');
      for ( var i = 0; i < iosocket.length; i++ ){
        if ( iosocket[i].DDN == '' ){
          client = iosocket[i].Body;
          client.emit( 'state', state );
        }
      } 
    }
    */
    if ( state == 'opened2'){
      for ( var i = iosocket.length-1; i >= 0; i-- ){
        client = iosocket[i].Body;
        //client.disconnect(true);
        RemoveSocket( i ); 
      } 
    }
  }
}

var SetSocketAttr = function(attr, sid, value){
  var ix = FindSocketIndex('sid', sid);
  var bret = true;
  if ( ix >= 0 ) {
    if ( attr == 'ddn' )
      iosocket[ix].DDN = value;
    else if ( attr == 'stoken' )
      iosocket[ix].SToken = value;
    else {
      if ( dbg >= 1 ) console.log('wsocket:SetSocketAttr invalid attr');
      bret = false;
    }
  }
  else {
    console.log('wsocket:SetSocketAttr error'); 
    bret = false;
  }
  if ( dbg >= 2 ) console.log('wsocket:SetSocketAttr DDN=%s,SToken=%s', iosocket[ix].DDN, iosocket[ix].SToken);
  return bret;
}

var ChkSocketStoken = function(stoken){
  var iret = 0;
  for ( var i = 0; i < iosocket.length; i++ ){
    if ( iosocket[i].SToken == stoken ){
      iret += 1;
    }
  }
  return iret;
}

var GetSocketAttr = function(attr, sid){
  var ret = '';
  var ix = FindSocketIndex('sid', sid);
  if ( ix >= 0 ) {
    if ( attr == 'ddn' )
      ret = iosocket[ix].DDN;
    else if ( attr == 'stoken' )
      ret = iosocket[ix].SToken;
    else
      console.log('wsocket:SetSocketAttr invalid attr');
  }
  else console.log('wsocket:SetSocketAttr error');
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

