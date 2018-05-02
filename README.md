# motechat

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

## Command Brief ( API of  MoteChat )

| Command  | Description                             |
| -------- | --------------------------------------- |
| [<code>Open</code>](#Open)     | Open motechat                           |
| [<code>Publish</code>](#Publish)  | Publish xRPC function                   |
| [<code>Isolated</code>](#Isolated) | Publish isolated xRPC function          |
| [<code>Reg</code>](#Reg)      | Register to device center               |
| [<code>UnReg</code>](#UnReg)    | Un-register from device center          |
| [<code>Call</code>](#Call)     | Call function of another device         |
| [<code>Send</code>](#Send)     | Send message to another device          |
| [<code>Get</code>](#Get)      | Get the information of my device        |
| [<code>Set</code>](#Set)      | Set the device information of my device |
| [<code>Search</code>](#Search)   | Search nearby device                    |
| [<code>OnEvent</code>](#OnEvent)  | Set event handler                       |
| Reply    |                                         |

<a name="Open"></a>

## Open(conf, callback)
the method that open motechat

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| conf | <code>Object</code> | the configuration object for init. |
| conf.AppName | <code>String</code> | the name of motebus MMA |
| conf.IOC | <code>String</code> | the MMA of IOC |
| conf.DCenter | <code>String</code> | the MMA of device enter |
| conf.AppKey | <code>String</code> | the key string of app |
| conf.UseWeb | <code>String</code> | the communication type that can be 'websocket', 'ajax', or '' |
| callback | [<code>openCallback</code>](#openCallback) | the result callback function |

**Example**  
```js
var conf = { "AppName":"", "IOC":"", "DCenter":"", "AppKey":"", "UseWeb":"" }
conf.AppName = ‘myfunc’;
conf.DCenter = ‘dc@boss.ypcloud.com:6788’;
conf.AppKey = ‘YfgEeop5’;
var mChat = require('motechat');

mChat.Open(conf, function(result){
    console.log(‘init result=%s’, JSON.stringify(result));
}
```
<a name="Publish"></a>

## Publish(app, func, cb)

To publish XRPC function at motechat

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| app | <code>String</code> | the name of function |
| func | <code>function</code> | the user function entry which is published at motechat |
| cb | [<code>publishCallback</code>](#publishCallback) |  |

**Example**  
```js
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

mChat.Publish( XrpcMcService, function(result){
    console.log('motechat publish: result=%s', JSON.stringify(result));
});
```
<a name="Isolated"></a>

## Isolated(func, cb)

To isolated publish XRPC function at motechat

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
<a name="Call"></a>

## Call(xrpc, cb)

call the function of other device by XRPC

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| xrpc | <code>Object</code> | xrpc control object |
| xrpc.SToken | <code>String</code> | app token |
| xrpc.Target | <code>String</code> | the target name of function |
| xrpc.Func | <code>String</code> | the function name |
| xrpc.Data | <code>String</code> | the data object for function |
| xrpc.target | <code>String</code> | the property of web device ( if need ) |
| xrpc.data | <code>Object</code> | the data object want to delivered |
| cb | [<code>callCallback</code>](#callCallback) |  |

**Example**  
```js
var target = 'myEi';
var func = 'echo';
var data = {"time":"2018/4/24 10:12:08"};
var xrpc = {"SToken":mydev.SToken,"Target":target,"Func":func,"Data":data};
mChat.Call( xrpc, function(reply){
    console.log('CallSession reply=%s', JSON.stringify(reply));
});
```
<a name="Send"></a>

## Send(xmsg, cb)

send xmsg to other device

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| xmsg | <code>Object</code> | msg control object |
| xmsg.SToken | <code>String</code> | token of app |
| xmsg.From | <code>String</code> | DDN of source device |
| xmsg.Target | <code>String</code> | can be DDN, EiName, EiType or EiTag of destination device |
| xmsg.Data | <code>String</code> | the data which want to be sent |
| xmsg.WaitReply | <code>Number</code> | The wait time of reply, by sec. |
| cb | [<code>sendCallback</code>](#sendCallback) |  |

**Example**  
```js
var target = ‘myEi’;
var data = {"message":"Hello World"};
var ddn = GetSocketAttr('ddn', socket.id);
var stoken = GetSocketAttr('stoken', socket.id);
var xmsgctl = {"SToken":stoken,"From":ddn,"Target":target,"Data":data,"WaitReply":12};
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
    console.log('GetDeviceInfo result=%s', result);
});
```
<a name="Set"></a>

## Set(data, SToken, EdgeInfo, cb)

Set device information

**Kind**: global function  

| Param | Type | Description |
| --- | --- | --- |
| data | <code>Object</code> | input data object |
| SToken | <code>String</code> | app token |
| EdgeInfo | <code>Object</code> | {"EiName":"","EiType":"","EiTag":"","EiLoc":""} |
| cb | [<code>setCallback</code>](#setCallback) |  |

**Example**  
```js
var info = {"EiName":"myEi","EiType":".ei","EiTag":"#my","EiLoc":""};
var data = {"SToken":mydev.SToken,"EdgeInfo":info};
mChat.Set(data, function(result){
    console.log(‘SetDeviceInfo result=%s’, result);
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
| data.Keyword | <code>String</code> | Key for search |
| cb | [<code>searchCallback</code>](#searchCallback) |  |

**Example**  
```js
var data = {"SToken":mydev.SToken,”Keyword”:”#test”};

mChat.Search(data, function(result){
    console.log(‘Search result=%s’, result);
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
   console.log('InmsgRcve: channel=%s, from=%s, to=%s, msgtype=%s, data=%s', 
               ch, JSON.stringify(from), to, msgtype, JSON.stringify(data));
} 

var InState = function(state){
   console.log(‘InState=%s’, state);
}
 
mChat.OnEvent('message',InmsgRcve);
mChat.OnEvent('state', InState); 
```
<a name="openCallback"></a>

## openCallback : <code>function</code>

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

<a name="isolatedRequest"></a>

## isolatedRequest : <code>function</code>

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} |

<a name="sendCallback"></a>

## sendCallback : <code>function</code>

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | { ErrCode, ErrMsg }| reply |

<a name="callCallback"></a>

## callCallback : <code>function</code>

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} | reply |

<a name="getCallback"></a>

## getCallback : <code>function</code>

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode, ErrMsg} | reply |

<a name="setCallback"></a>

## setCallback : <code>function</code>

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} | reply |

<a name="searchCallback"></a>

## searchCallback : <code>function</code>

**Kind**: global typedef  

| Param | Type | Description |
| --- | --- | --- |
| result | <code>Object</code> | {ErrCode,ErrMsg} | reply |

