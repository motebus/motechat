// wsocket: module for websocket server
// Date: 2018/4/25
// Version: 0.98

var exports = module.exports = {};

var express, web, webserver, io;
var mochat;
var iosocket = [];

/*
var WS_OKCODE = 0;
var WS_OKMSG = "OK";
var WS_ERRCODE = -251;
*/

var WS_WAITREPLY_TIMEOUT = 12;
var io;
var dbg = 0;
var wserr;

exports.Init = function( mc, webserver, wsport, webpath, cb ){
    wserr = require('./mcerr.js');
    mochat = mc;
    io = require('socket.io')(webserver,
      {pingTimeout:120000,pingInterval:30000,cookie:true,transports:['polling','websocket']}
    );
    if ( typeof cb == 'function' ) cb({"ErrCode":wserr.WS_OKCODE,"ErrMsg":wserr.WS_OKMSG});
    // define web socket API
    io.on('connection', function (socket) {
      if ( dbg >= 1 ) console.log('->%s: %s: socket conn', CurrentTime(), socket.id );
        console.log('socket url=%s', JSON.stringify(socket.request.url));
        var addr = socket.request.connection.remoteAddress;
        console.log('socket addr=%s', addr);
        var sk = {"DDN":"","Skid":socket.id,"Body":socket,"IP":"","SToken":"","EiName":""};
        iosocket.push(sk);
        mochat.OnEvent('message', InmsgRcve, 'wsocket' );
        mochat.OnEvent('state', InState, 'wsocket');
        socket.on('disconnect', function() {
          if ( dbg >= 1 ) console.log('->%s: %s: socket disc', CurrentTime(), socket.id );
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
          socket.disconnect(true);
          RemoveSocket( skid );
        });
        socket.on('error', function(err) {
          if ( dbg >= 1 ) console.log('->%s: %s: socket error: %s', CurrentTime(), socket.id, err.message );
          var skid = socket.id;
          socket.disconnect(true);
          RemoveSocket( skid );
        });
        socket.on('request', function(msg, ack) {
            var func;
            if ( dbg >= 0 ) console.log('->%s: %s: socket req: %s', CurrentTime(), socket.id, JSON.stringify(msg) );
            if ( typeof msg.func == 'string' ){
                func = msg.func;
                //console.log('socket req: func=%s', func);
                if ( func != '' ) func = func.toLowerCase();
                if ( func == 'send' ){
                  try {
                    if ( typeof msg.body.to != 'undefined' && typeof msg.body.data != 'undefined' ){
                      var to = msg.body.to;
                      var data = msg.body.data;
                      var stoken = GetSocketAttr('stoken', socket.id);
                      var xmsgctl = {"SToken":stoken,"To":to,"Data":data,"SendTimeout":null,"WaitReply":null};
                      mochat.Send(xmsgctl, function(reply){
                        if ( dbg >= 1 ) console.log('wsocket:send reply=%s', JSON.stringify(reply));
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
                  if( dbg >= 1 ) console.log('wsocket:call msg=%s', JSON.stringify(msg));
                  try {
                    var to = msg.data.to;
                    var cfunc = msg.data.func;
                    var data = msg.data.args;
                    //var target = msg.body.target;
                    //var cfunc = msg.body.func;
                    //var data = msg.body.data;
                    var stoken = GetSocketAttr('stoken', socket.id);
                    var xrpcblk = {"SToken":stoken,"To":to,"Func":cfunc,"Data":data};
                    mochat.Call(xrpcblk, function(reply){
                      console.log('wsocket:call reply=%s', JSON.stringify(reply));
                      if ( typeof ack == 'function') ack(reply);
                    });
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
                    //console.log('wsocket:regdc reply=%s', JSON.stringify(reply));
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
                  console.log('wsocket:setapp msg=%s', JSON.stringify(msg));
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
                  console.log('wsocket:GetQPin msg=%s', JSON.stringify(msg));
                  mochat.GetQPin(msg.data, function(reply){
                    console.log('wsocket:GetQPin reply=%s', JSON.stringify(reply));
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
    });
}

var InmsgRcve = function(ch, inctl, data, cb){
  if ( dbg >= 1 ) {
    if (typeof data == 'object')
      console.log('wsocket:InmsgRcve: channel=%s, inctl=%s, data=%s', ch, JSON.stringify(inctl), JSON.stringify(data));
    else
      console.log('wsocket:InmsgRcve: channel=%s, inctl=%s, data=%s', ch, JSON.stringify(inctl), data);
  }
  if ( inctl ){
    var ddn = ( inctl.To.DDN ) ? inctl.To.DDN : '';
    var ix = FindSocketIndex('ddn', ddn );
    if ( ix >= 0 ){
      if ( typeof cb == 'function' ) cb({"ErrCode":wserr.WS_OKCODE,"ErrMsg":wserr.WS_OKMSG});
      //if ( typeof from != 'undefined') ctl.fm = from;
      //ctl.to.DDN = to;
      setTimeout(function(ctl,i,data){
        var client = iosocket[i].Body;
        client.emit( 'message', {"method":ch,"ctl":ctl,"data":data} );
      },200,inctl,ix,data);
    }
    else {
      console.log('wsocket:InmsRcve ddn=%s',ddn);
      if ( typeof cb == 'function' ) cb({"ErrCode":wserr.WS_NoMatchDDN,"ErrMsg":wserr.WS_NoMatchDDN_Msg,"DDN":ddn});
    }
  }
  else {
    if ( typeof cb == 'function' ) cb({"ErrCode":wserr.WS_InvalidData,"ErrMsg":wserr.WS_InvalidData_Msg,"DDN":to});
  }
}

var InState = function(state, ddn){
  if ( dbg >= 1 ) console.log('wsocket:InState state=%s', state);
  var ix = FindSocketIndex('ddn', ddn );
  if ( ix >= 0 ){
    var client = iosocket[ix].Body;
    if ( state == 'unreg OK'){
      RemoveSocket( ix );
      client.disconnect(true);
    }
    else 
      client.emit( 'state', state );
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
      console.log('wsocket:SetSocketAttr invalid attr');
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

