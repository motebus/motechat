![](https://github.com/motebus/motechat/blob/master/image/motechat.jpg)

MoteChat is an IoT message exchange platform for IoT messages, metadata, files and microservices. Built-in security checks and device maintenance mechanism.

**Install**

```bash
npm i motechat
```

**Usage**

Add the motechat module to the code 

```javascript
const mchat = require('motechat');
```

## MoteChat API

| api  | Description                             |
| -------- | --------------------------------------- |
| [<code>Open</code>](#Open)     | Open motechat                       |
| [<code>Close</code>](#Open)     | Close motechat                     |
| [<code>Publish</code>](#Publish)  | Publish function                   |
| [<code>Isolated</code>](#Isolated) | Publish isolated function          |
| [<code>Reg</code>](#Reg)      | Register to device center               |
| [<code>UnReg</code>](#UnReg)    | Un-register from device center          |
| [<code>Call</code>](#Call)     | Call function of another device         |
| [<code>Send</code>](#Send)     | Send message to another device          |
| [<code>Get</code>](#Get)      | Get the information of my device        |
| [<code>Set</code>](#Set)      | Set the device information of my device |
| [<code>Search</code>](#Search)   | Search nearby device                 |
| [<code>OnEvent</code>](#OnEvent)  | Set event handler                   |

<a name="Open"></a>

## Open(conf, reg, cb)
the method that open motechat

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| conf | <code>Object</code> | the configuration object for init. |
| conf.AppName | <code>String</code> | the name of motebus MMA |
| conf.IOC | <code>String</code> | the MMA of IOC |
| conf.DCenter | <code>String</code> | the MMA of device enter |
| conf.AppKey | <code>String</code> | the key string of app |
| conf.UseWeb | <code>String</code> | can be 'websocket', 'ajax', or '' |
| conf.MotebusGW | <code>String</code> | the IP of motebus gateway |
| reg | <code>Object</code> | the information of register ( option, the info of reg to DC )  |
| reg.EiToken | <code>String</code> | device token |
| reg.SToken | <code>String</code> | app token |
| callback | [<code>openCallback</code>](#openCallback) | the result callback function |

**Example 1**  
```js
var conf = { "AppName":"", "IOC":"", "DCenter":"", "AppKey":"", "UseWeb":"", "MotebusGW": "127.0.0.1" } 
conf.AppName = 'myfunc'; 
conf.DCenter = 'dc@dc.ypcloud.com:6788'; 
conf.AppKey = 'YfgEeop5'; 
var mChat = require('motechat'); 
mChat.Open(conf, function(result){
   console.log('init result=%s', JSON.stringify(result));  
}
```

**Example 2: reg to DC directly **
```js
var conf = { "AppName":"", "IOC":"", "DCenter":"", "AppKey":"", "UseWeb":"" } 
conf.AppName = 'myfunc';
conf.DCenter = 'dc@boss.ypcloud.com:6788';  
conf.AppKey = 'YfgEeop5';
var reginfo = {"EiToken":"8dilCCKj","SToken":"baTi52uE"};
var mChat = require('motechat');
mChat.Open(conf, reginfo, function(result){
   console.log('init result=%s', JSON.stringify(result));  
} 
```

<a name="Close"></a>

## Close(cb)
Close motechat

| Param | Type | Description |
| --- | --- | --- |
| cb | [<code>closeCallback</code>](#closeCallback) |  |

<a name="Publish"></a>

## Publish(app, func, cb)
To publish function at motechat

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| app | <code>String</code> | the name of function |
| func | <code>function</code> | the user function entry which is published at motechat |
| cb | [<code>publishCallback</code>](#publishCallback) |  |

**Example**  
```js
var app = 'func';
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
```
<a name="Isolated"></a>

## Isolated(func, cb)
To isolated publish function at motechat

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |	
| func | <code>function</code> | the user function entry which is isolated published at motechat |
| cb | [<code>isolatedRequest</code>](#isolatedRequest) |  |

**Example**  
```js
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
```
<a name="Reg"></a>

## Reg(data, cb)
register to device center

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | the information for registration|
| data.EiToken | <code>String</code> | device token |
| data.SToken | <code>String</code> | app token |
| data.WIP | <code>String</code> | WAN ip ( empty means the same as dc ) |
| cb | [<code>regCallback</code>](#RegCallback) |  |

**Example**  
```js
var mydev = {"EiToken":"8dilCCKj","SToken":"baTi52uE","WIP":""};
mChat.Reg(mydev, function(result){ 
 console.log('StartSession result=%s', JSON.stringify(result));
});  
//Note: At first time of the device, EiToken and SToken is empty 
```
<a name="UnReg"></a>

## UnReg(data, cb)
un-register from device center

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | the information for registration |
| data.SToken | <code>String</code> | app token |
| cb | [<code>unRegCallback</code>](#UnRegCallback) |  |

**Example**  
```js
var mydev = {"SToken":"baTi52uE"};
mChat.UnReg(mydev, function(result){
 console.log('EndSession result=%s', JSON.stringify(result));
});
```
<a name="Call"></a>

## Call(xrpc, cb)
call the function of other device

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| xrpc | <code>Object</code> | xrpc control object |
| xrpc.SToken | <code>String</code> | app token |
| xrpc.Topic | <code>String</code> | the topic name of function |
| xrpc.Func | <code>String</code> | the function name |
| xrpc.Data | <code>String</code> | the data object for function |
| xrpc.SendTimeout | <code>Number</code> | Timeout of send message, by sec. |
| xrpc.WaitReply | <code>Number</code> |The wait time of reply, by sec. |
| cb | [<code>callCallback</code>](#callCallback) |  |

**Example**  
```js
var ddn = '';
var topic = 'ddn://GMH21Ilc';
var func = 'echo';
var data = {"Time":"2018/4/24 10:12:08"};
var t1 = 6;
var t2 = 12;
var xrpc = {"SToken":mydev.SToken,"DDN":ddn,"Topic":topic,"Func":func,"Data":data, "SendTimeout":t1, "WaitReply":t2};
mChat.Call( xrpc, function(reply){
 console.log('CallSession reply=%s', JSON.stringify(reply));
});
```
<a name="Send"></a>

## Send(xmsg, cb)
send to other device

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| xmsg | <code>Object</code> | xsmg control object |
| xmsg.SToken | <code>String</code> | app token |
| xmsg.From | <code>String</code> | DDN of source device |
| xmsg.Topic | <code>String</code> | topic of destination device |
| xmsg.Data | <code>String</code> | the data which want to be sent |
| xmsg.SendTimeout | <code>Number</code> | Timeout of send message, by sec. |
| xmsg.WaitReply | <code>Number</code> | The wait time of reply, by sec. |
| cb | [<code>sendCallback</code>](#sendCallback) |  |

**Example**  
```js
var ddn = '';
var topic = 'ddn://GMH21Ilc';
var data = {"message":"Hello World"};
var ddn = GetSocketAttr('ddn', socket.id);
var stoken = GetSocketAttr('stoken', socket.id);
var t1 = 6;
var t2 = 12;
var xmsgctl = {"SToken":stoken,"From":ddn,"DDN":ddn,"Topic":topic,"Data":data, "SendTimeout":t1,"WaitReply":t2};
mChat.Send(xmsgctl, function(reply){
 console.log('sendxmsg reply=%s', JSON.stringify(reply));
});
```
<a name="Get"></a>

## Get(data, cb)
get my device information

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | the input data object |
| data.SToken | <code>String</code> | app token |
| cb | [<code>getCallback</code>](#getCallback) |  |

**Example**  
```js
var data = {"SToken":mydev.SToken};
mChat.Get(data, function(result){
 console.log(‘GetDeviceInfo result=%s’, result);
});
```
<a name="Set"></a>

## Set(data, cb)
Set device information

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | input data object |
| data.SToken | <code>String</code> | app token |
| data.EdgeInfo | <code>Object</code> | {"EiName":"","EiType":"","EiTag":"","EiLoc":""} |
| cb | [<code>setCallback</code>](#setCallback) |  |

**Example**  
```js
var info = {"EiName":"myEi","EiType":".ei","EiTag":"#my","EiLoc":""};
var data = {"SToken":mydev.SToken,"EdgeInfo":info};
mChat.Set(data, function(result){
 console.log('SetDeviceInfo result=%s', result);
});
```
<a name="Search"></a>

## Search(data, cb)
Search device by key

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | input data object |
| data.SToken | <code>String</code> | app token |
| data.Keyword | <code>String</code> | Keyword for search |
| cb | [<code>searchCallback</code>](#searchCallback) |  |

**Example**  
```js
var data = {"SToken":mydev.SToken, "Keyword":"#test"};
mChat.Search(data, function(result){
 console.log('Search result=%s', result);
});  
```
<a name="OnEvent"></a>

## OnEvent(stype, cb) ⇒ <code>boolean</code>
OnEvent, on event handler

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| stype | <code>String</code> | "message" is for getxmsg, "state" is for state changed |
| cb | <code>function</code> | the user routine entry |

**Example**  
```js
var InmsgRcve = function(ch, head, from, to, msgtype, data){
 console.log('InmsgRcve: channel=%s, from=%s, to=%s, msgtype=%s, data=%s', ch, JSON.stringify(from), to, msgtype, JSON.stringify(data));
}	
Var InState = function(state){
 console.log('InState=%s', state);
}
mChat.OnEvent('message',InmsgRcve);
mChat.OnEvent('state', InState);
```
<a name="openCallback"></a>

## openCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode, ErrMsg, result} |

## closeCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode, ErrMsg} |

<a name="publishCallback"></a>

## publishCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} |

<a name="isolatedcallback"></a>

## isolatedcallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} |

<a name="regCallback"></a>

## regCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg,result} |

<a name="unRegCallback"></a>

## unRegCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} |

<a name="callCallback"></a>

## callCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} or callback(reply) |

<a name="sendCallback"></a>

## sendCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | { ErrCode, ErrMsg } or callback(reply) |

<a name="getCallback"></a>

## getCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode, ErrMsg} or callback(reply) |

<a name="setCallback"></a>

## setCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} or callback(reply) |

<a name="searchCallback"></a>

## searchCallback : <code>function</code>
**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} or callback(reply) |
