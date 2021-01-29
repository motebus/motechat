# Contents

| No | Command/ Subject | Description |
| -- | ------- | ----------- |
| 1  | Open    | Open motechat |
| 2  | Close   | Close motechat |
| 3  | Publish | Publish app functions |
| 4  | Reg     | Register to device center |
| 5  | UnReg   | Un-register from device center |
| 6  | Call    | Call function of another device |
| 7  | Send    | Send message to another device |
| 8  | Get     | Get the information of my device |
| 9  | Set     | Set the device information of my device |
| 10 | Search  | Search device by key |
| 11 | Nearby  | Search nearby device |
| 12 | mbCall  | Call function of another device by motebus |
| 13 | mbSend  | Send message to another device by motebus |
| 14 | mbSetConfig | Save app configuration to xstorage of motebus |
| 15 | mbGetConfig | Get app configuration to xstorage of motebus |
| 16 | GetwipUrl | Get url of get wan ip in configuration |
| 17 | OnEvent | Set event handler |
| 18 | Drop    | Drop functions for xstorage |
| 19 | System Functions    | IN, UC, XS function of motechat |
| 20 | uDNS Operation   | uDNS (DDN) operation guide |
| 21 | Error Code    | Motechat error message list |
# Open
## Input:
conf: the configuration object for init, {AppName, AppKey, DCenter, IOC, MotebusGW}

- AppName: the name of motebus MMA
- AppKey: the key string of app
- DCenter: the MMA of device center
- IOC: the MMA of IOC
- MotebusGW: the ip:port of motebus gateway
- XstorPath: the physical path of xstoarge
- MotebusVolume: the volume path of motebus
- GetwipUrl: the url of get wan ip

reg: the information of register for auto reg (option), the info of reg to DC

- EiToken: device token
- SToken: app token
- WIP: WAN IP
- LIP: LAN IP
- EdgeInfo: (option), the information object of edge device, {EiName, EiType, EiTag, EiLoc}
- Option: (option), {"SaveDSIM":true}

cb: callback ( {ErrCode, ErrMsg} or {ErrCode, ErrMsg, result} )

> Note: if use SaveDSIM, SToken, SToken should be null string and EiName can not be empty

### Example 1:
```
let conf = { "AppName":"", "AppKey":"","DCenter":"","IOC":"", "MotebusGW":"127.0.0.1", "XstorPath": "/root/motebus/xstorage", "MotebusVolume":"/var/motebus"  }
conf.AppName = 'myfunc';
conf.DCenter = 'dc';
conf.AppKey = 'YfgEeop5';
let mChat = require('motechat');
mChat.Open(conf, function(result){
	console.log('open result=%s', JSON.stringify(result));
}
```

### Example 2: reg to DC directly
```
let conf = { "AppName":"", "AppKey":"","DCenter":"","IOC":"", "MotebusGW":"127.0.0.1", "XstorPath": "/var/motebus" }
conf.AppName = 'myfunc';
conf.DCenter = 'dc';
conf.AppKey = 'YfgEeop5';
let reginfo = {"EiToken":"8dilCCKj","SToken":"baTi52uE","WIP":"","LIP":""};
let mChat = require('motechat');
mChat.Open(conf, reginfo, function(result){
	console.log('open result=%s', JSON.stringify(result));
}
```
### Example 3: reg to DC and set EI info directly
```
let conf = { "AppName":"", "AppKey":"","DCenter":"","IOC":"", "MotebusGW":"127.0.0.1"  }
conf.AppName = 'myfunc';
conf.DCenter = 'dc';
conf.AppKey = 'YfgEeop5';
let ei = {"EiName":"aifunc","EiType":".func","EiTag":"#ai","EiLoc":""}
let reginfo = {"EiToken":"8dilCCKj","SToken":"baTi52uE", "WIP":"","LIP":"","EdgeInfo":ei};
let mChat = require('motechat');
mChat.Open(conf, reginfo, function(result){
	console.log('open result=%s', JSON.stringify(result));
}
```
### Example 4: reg to DC, set EI info directly and save DSIM at xstorage
```
let conf = { "AppName":"", "AppKey":"","DCenter":"","IOC":"", "MotebusGW":"127.0.0.1"  }
conf.AppName = 'myfunc';
conf.DCenter = 'dc';
conf.AppKey = 'YfgEeop5';
let ei = {"EiName":"aifunc","EiType":".func","EiTag":"#ai","EiLoc":""}
let reginfo = {"EiToken":"","SToken":"", "WIP":"","LIP":"","EdgeInfo":ei,"Option":{"SaveDSIM":true}};
let mChat = require('motechat');
mChat.Open(conf, reginfo, function(result){
	console.log('open result=%s', JSON.stringify(result));
}
```

# Close
## Input:
cb: callback( {ErrCode, ErrMsg } )

# Publish
## Input:
app: the name of name
func: the user function entry
 which is published

cb: callback( {ErrCode, ErrMsg} )

### Example:
```
let app = 'motechat';
let XrpcMcService = {
    "echo":function(head, body){
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
})
```

# Reg
## Input:
data: the information for registration, {EiToken, SToken, WIP}
- EiToken: device token
- SToken: app token
- WIP: WAN IP
- EdgeInfo: (option), the information object of edge device, {EiName, EiType, EiTag, EiLoc}
- Option: (option), {"SaveDSIM":true}
cb: callback( {ErrCode, ErrMsg, result} or {ErrCode, ErrMsg} )

> Note: if use SaveDSIM, SToken, SToken should be null string and EiName can not be empty

### Example 1: simple reg
```
let mydev = {"EiToken":"8dilCCKj","SToken":"baTi52uE","WIP":""};
mChat.Reg(mydev, function(result){
    console.log('motechat reg: result=%s', JSON.stringify(result));
});
```
> Note: At first time of motechat reg, EiToken and SToken is empty.

### Example 2: reg and save DSIM at xstorage
```
let ei = {"EiName":"aifunc","EiType":".func","EiTag":"#ai","EiLoc":""}
let mydev = {"EiToken":"","SToken":"","WIP":"","EdgeInfo":ei,"Option":{"SaveDSIM":true}};
mChat.Reg(mydev, function(result){
    console.log('motechat reg: result=%s', JSON.stringify(result));
});
```	

# UnReg
## Input:
data: the information for registration, {SToken}
- SToken: app token	
cb: callback( {ErrCode, ErrMsg} )
### Example:
```
let mydev = {"SToken":"baTi52uE"};
mChat.UnReg(mydev, function(result){
    console.log('motechat unreg: result=%s', JSON.stringify(result));
});
```
# Call
## Input:
xrpc: xrpc control object, {SToken, DDN, Topic, Func, Data, SendTimeout, WaitReply}
- SToken: app token
- DDN: DDN of device
- Topic: topic of app
- Func: the function name
- Data: the data object for function
- SendTimeout: Integer, Timeout of send message, by sec.
- WaitReply: Integer, The wait time of reply, by sec.
cb: callback( {ErrCode, ErrMsg} ) or callback(reply)
reply: [{"IN":{"From":{"DDN":"","Name":"","Type":"","Uid":"","Topic":""},"To":{"DDN":"","Name":"","Type":"","Topic":""},"State":{"ErrCode":0,"ErrMsg":"OK","By":""}},"Reply":{"ErrCode":0,"ErrMsg":"OK"}}]
### Example:
```
let ddn = 'kvGuHVUy';
let topic = 'flow/echo';
let func = 'echo';
let data = {"time":"2018/4/24 10:12:08"};
let t1 = 6;
let t2 = 12;
let xrpc = {"SToken":mydev.SToken, "DDN":ddn, "Topic":topic, "Func":func,"Data":data, "SendTimeout":t1, "WaitReply":t2};
mChat.Call( xrpc, function(reply){
    console.log('motechat call: reply=%s', JSON.stringify(reply));
});
```
# Send
## Input:
xmsg: xmsg control object, {SToken, DDN, Topic, Data, SendTimeout, WaitReply}
- SToken: app token
- DDN: DDN of device
- Topic: the app topic
- Data: the data which want to be sent
- SendTimeout: Integer, Timeout of send message, by sec.
- WaitReply: Integer, The wait time of reply, by sec.
cb: callback({ErrCode,ErrMsg}) or callback(reply)
reply: [{"IN":{"From":{"DDN":"","Name":"","Type":"","Uid":"","Topic":""},"To":{"DDN":"","Name":"","Type":"","Topic":""},"State":{"ErrCode":0,"ErrMsg":"OK","By":""}},"Reply":{"ErrCode":0,"ErrMsg":"OK"}}]

### Example:
```
let stoken = mydev.SToken;
let ddn = 'kvGuHVUy';
let topic = 'flow/msg';
let data = {"message":"Hello World"};
let t1 = 6;
let t2 = 12;
let xmsgctl = {"SToken":stoken, "DDN":ddn, "Topic":topic,"Data":data, "SendTimeout":t1,"WaitReply":t2};
mChat.Send(xmsgctl, function(result){
    console.log('motechat send: result=%s', JSON.stringify(result));
});
```
# Get
## Input:
data: the input data object, { "SToken":"" }
- SToken: app token

cb: callback( {ErrCode, ErrMsg} ) or callback(reply)
### Example:
```
let data = {"SToken":mydev.SToken};
mChat.Get(data, function(result){
    console.log('motechat get: result=%s', JSON.stringify(result));
});
```
# Set
## Input:
data: input data object, {SToken, EdgeInfo}
- SToken: app token
- EdgeInfo: {"EiName":"","EiType":"","EiTag":"","EiLoc":""} 

cb: callback( {ErrCode, ErrMsg} ) or callback(reply)
### Example:
```
let info = {"EiName":"myEi","EiType":".ei","EiTag":"#my","EiLoc":""};
let data = {"SToken":mydev.SToken,"EdgeInfo":info};
mChat.Set(data, function(result){
    console.log('motechat set: result=%s', JSON.stringify(result));
});
```
# Search
## Input:
data: input data object, {SToken, Keyword}
- SToken: app token
- Keyword: keyword for search

cb: callback( {ErrCode, ErrMsg} ) or callback(reply)
### Example:
```
let data = {"SToken":mydev.SToken, "Keyword":"#test"};
mChat.Search(data, function(result){
    console.log('motechat search: result=%s', JSON.stringify(result));
});
```  
# Nearby
## Input:
data: input data object, {SToken}
- SToken: app token

cb: callback( {ErrCode, ErrMsg} ) or callback(reply)
### Example:
```
let data = {"SToken":mydev.SToken};
mChat.Nearby(data, function(result){
    console.log('motechat nearby: result=%s', JSON.stringify(result));
});  
```
# mbCall
## Input:
xrpc: xrpc control object, {MMA, Func, Data, SendTimeout, WaitReply}
- MMA: mma of target device
- Func: the function name
- Data: the data object for function
- SendTimeout: Integer, Timeout of send message, by sec.
- WaitReply: Integer, The wait time of reply, by sec.
cb: callback( {ErrCode, ErrMsg} ) or callback(reply)
### Example:
```
let mma = 'h1/pod/echo';
let func = 'echo';
let data = {"time":"2018/4/24 10:12:08"};
let t1 = 6;
let t2 = 12;
let xrpc = {"MMA":mma, "Func":func,"Data":data, "SendTimeout":t1, "WaitReply":t2};
mChat.mbCall( xrpc, function(reply){
    console.log('motechat mbCall: reply=%s', JSON.stringify(reply));
});
```
# mbSend
## Input:
xmsg: xmsg control object, {MMA, Data, SendTimeout, WaitReply}
- MMA: mma of target device
- Data: the data object for function
- SendTimeout: Integer, Timeout of send message, by sec.
- WaitReply: Integer, The wait time of reply, by sec.
cb: callback( {ErrCode, ErrMsg} ) or callback(result)
### Example:
```
let mma = 'h1/pod/echo';
let data = {"degree":30};
let t1 = 6;
let t2 = 12;
let xmsg = {"MMA":mma, "Data":data, "SendTimeout":t1, "WaitReply":t2};
mChat.mbSend( xmsg, function(result){
    console.log('motechat mbSend: result=%s', JSON.stringify(result));
});
```
# mbSetConfig
## Input:
xconf: xs config object, {catalog, idname, data} 
- catalog: Catalog of stored data
- idname: ID name of stored data
- data: Stored data object (JSON format)
## Output:
{ErrCode, ErrMsg}
### Example:
```
let catalog = 'jack-app';
let idname = 'dsim' 
let SToken = 'js9ZhijB'
let EiToken = 'kggi3HKx'
let data = {"catalog":catalog, "idname":idname, "data":{"SToken":SToken, "EiToken":EiToken } };
let result = mChat.mbSetConfig( data );
console.log('motechat mbSetConfig: result=%s', JSON.stringify(result));
```
# mbGetConfig
## Input:
xconf: xs config object, {catalog, idname} 
- catalog: Catalog of stored data
- idname: ID name of stored data
## Output:
{ErrCode, ErrMsg, result}
### Example:
```
let catalog = 'jack-app';
let idname = 'dsim' 
let data = {"catalog":catalog, "idname":idname};
let result = mChat.mbGetConfig( data );
console.log('motechat mbGetConfig: result=%s', JSON.stringify(result));
```
# GetwipUrl
## Input:
none
## Output:
url: string


# OnEvent
## Input:
stype: string
- "message" is for get msg of motechat
- "state" is for state changed
- "mbus" is for get msg of motebus
cb: callback function
- "message": function(channel, in, data, cb)
- "state": function(state, ddn)
- "mbus": function(from, data, cb )
stoken: string (option)
## Output:
{ErrCode, ErrMsg}
### Example:
```
let InmsgRcve = function(ch, inctl, data, retcb){
    console.log('InmsgRcve: channel=%s, from=%s, to=%s, data=%s', ch, JSON.stringify(inctl.From), JSON.stringify(inctl.To), JSON.stringify(data));
    if ( typeof retcb == 'function') retcb({"ErrCode":0, "ErrMsg":"OK"})
}
let InState = function(state, ddn){
    if ( ddn ) console.log('InState=%s, ddn=%s', state, ddn);
    else console.log('InState=%s', state);
}
let mbusRcve = function(from, data, retcb){
    console.log('mbusRcve: from=%s, data=%s', from, JSON.stringify(data));
    if ( typeof retcb == 'function') retcb({"ErrCode":0, "ErrMsg":"OK"})
}
mChat.OnEvent('message',InmsgRcve);
mChat.OnEvent('state', InState);
mChat.OnEvent('mbus', mbusRcve)
```

# Drop
## Input:
- xdrop: drop function object
- cb: callback function(err, result)
## Drop input table:
| No  |	Cmd |	XDrop | Comment |
| --- | ----- | ---- | ---- |
| 1	| cp |	{SToken,DDN,Data:{Cmd,Files,Path,Timeout,WaitReply}	| copy file to xstorage |
| 2	| rcp |	{SToken,DDN,Data:{Cmd,Files,Path,Timeout,WaitReply,Fsize}	| request file from remote xstorage |
| 3	| ls |	{SToken,DDN,Data:{Cmd,Path,Timeout,WaitReply}	| list files of xstorage |
| 4	| cat |	{SToken,DDN,Data:{Cmd,Path,Timeout,WaitReply,Fsize}	| get contains of file in xstorage |
| 5	| rm |	{SToken,DDN,Data:{Cmd,File}	| remove file in xstorage |

- Note 1: Path, File and Files are all relative to XstorPath of motechat
- Note 2: rm command only be used in local file (DDN='sys/')

### Example - ls:
```
// list 'drop/image' folder at mote 'h1/boss/mcdrop'
dropls(reg.SToken, '>h1/boss/mcdrop', 'drop/image')

function dropls(SToken, DDN, path){
    let data = {"Cmd":"ls","Path":path}
    let drop = {"SToken":SToken,"DDN":DDN,"Data":data}
    mchat.Drop(drop, function(err, result){
        if (err) console.log('dropls error=', err.ErrMsg)
        else console.log('dropls result=', result)
    })
}
```

### Example - cp:
```
// copy 'hello.png' to 'drop/image' folder at mote 'h1/boss/mcdrop'
dropcp(reg.SToken, '>h1/boss/mcdrop', ["hello.png"], 'drop/image')

function dropcp(SToken, DDN, files, path, t1, t2){
    let data = {"Cmd":"cp","Files":files,"Path":path,"Timeout":t1,"WaitReply":t2}
    let drop = {"SToken":SToken,"DDN":DDN,"Data":data}
    mchat.Drop(drop, function(err, result){
        if (err) console.log('dropcp error=', err.ErrMsg)
        else console.log('dropcp result=', result)
    })
}
```
### Example - rcp:
```
// copy 'drop/image/hello.png' at mote 'h1/boss/mcdrop' to 'drop/backup' folder
droprcp(reg.SToken, '>h1/boss/mcdrop', ["drop/image/hello.png"], 'drop/backup', 0, 0, 1880000)

function droprcp(SToken, DDN, files, path, t1, t2, fsize){
    let data = {"Cmd":"rcp","Files":files,"Path":path,"Timeout":t1,"WaitReply":t2,"Fsize":fsize}
    let drop = {"SToken":SToken,"DDN":DDN,"Data":data}
    mchat.Drop(drop, function(err, result){
        if (err) console.log('droprcp error=', err.ErrMsg)
        else console.log('droprcp result=', result)
    })
}
```

### Example - cat:
```
// get the content of 'Config/mbStack.json' at mote 'h1/boss/mcdrop'
dropcat(reg.SToken, '>h1/boss/mcdrop', 'Config/mbStack.json')

function dropcat(SToken, DDN, path){
    let data = {"Cmd":"cat","Path":path}
    let drop = {"SToken":SToken,"DDN":DDN,"Data":data}
    mchat.Drop(drop, function(err, result){
        if (err) console.log('dropcat error=', err.ErrMsg)
        else console.log('dropcat result=', result)
    })
}
```
### Example - rm:
```
// remove the 'drop/backup/hello.png' at local mote
droprm(reg.SToken, 'sys/', 'drop/backup/hello.png')

function droprm(SToken, DDN, file){
    let data = {"Cmd":"rm","File":file}
    let drop = {"SToken":SToken,"DDN":DDN,"Data":data}
    mchat.Drop(drop, function(err, result){
        if (err) console.log('droprm error=', err.ErrMsg)
        else console.log('droprm result=', result)
    })
}
```

# System Function

## Use UC function by motechat call
### Input:
xrpc: xrpc control object, {SToken, DDN, Topic, Func, Data, SendTimeout, WaitReply}
- SToken: app token
- DDN: "sys/"
- Topic: topic of UC
- Func: function name of UC
- Data: the data object for function
- SendTimeout: Integer, Timeout of send message, by sec.
- WaitReply: Integer, The wait time of reply, by sec.
cb: callback( {ErrCode, ErrMsg} )
#### Example:
```
let ddn = 'sys/';
let topic = 'uc://setuserinfo';
let func = 'cmd;
let data = {"UserInfo":{"MobileNo":"0936123123","NickName":"judy","Sex":0}};
let t1 = 6;
let t2 = 12;

let xrpc = {"SToken":mydev.SToken, "DDN":ddn, "Topic":topic, "Func":func,"Data":data, "SendTimeout":t1, "WaitReply":t2};
mChat.Call( xrpc, function(reply){
    console.log('UCFunc set info: reply=%s', JSON.stringify(reply));
});
```
### UC Function List:

| No  |	Topic |	Func | Data |
| --- | ----- | ---- | ---- |
| 1	| uc://login |	cmd	| {UserName, Password, KeepLogin} *(note 3, 4)*|
| 2	| uc://logout |	cmd | {} | 
| 3	| uc://signup |	cmd	| {UserName, Password, UserInfo}  *(note 1)* |
| 4	| uc://checkuser | cmd |	{UserName} |
| 5	| uc://getuserinfo | cmd | {} |
| 6	| uc://setuserinfo | cmd |	{UserInfo} *(note 1)* |
| 7	| uc://getusersetting |	cmd |	{KeyName} |
| 8	| uc://setusersetting |	cmd |	{KeyName, Setting} *(note 2)* |

- Note 1: 
UserInfo: {MobileNo, NickName, FirstName, LastName, Sex}
- Note 2: Setting: Application defined
- Note 3: UserName: E-mail address of user
- Note 4: KeepLogin: true or false


## Use IN function by motechat send
### Input:
xmsg: xmsg control object, {SToken, DDN, Topic, Data, SendTimeout, WaitReply}
- SToken: app token
- DDN: "sys/"
- Topic: topic of IN
- Data: the data object for function
- SendTimeout: Integer, Timeout of send message, by sec.
- WaitReply: Integer, The wait time of reply, by sec.
cb: callback( {ErrCode, ErrMsg} )
#### Example:
```
let ddn = 'sys/';
let topic = 'in://mnL6QHsd ';
let data = 'ping';
let t1 = 6;
let t2 = 12;
let xmsg= {"SToken":mydev.SToken, "DDN":ddn, "Topic":topic, "Data":data, "SendTimeout":t1, "WaitReply":t2};
mChat.Send( xmsg, function(reply){
    console.log('IN ping: reply=%s', JSON.stringify(reply));
});
```

### In Function List:

| No | Topic | Data | Description |
| -- | ----- | ---- | ----------- |
| 1	| in://local | ping | Ping to local motechat |
| 2	| in://dc |	ping | Ping to DC |
| 3	| in://mnL6QHsd	| ping |	Ping to device which DDN is mnL6QHsd |
| 4	| in://local | trace | Trace to local motechat |
| 5	| in://dc |	trace |	Trace to DC |
| 6	| in://mnL6QHsd | trace |	Trace to device which DDN is mnL6QHsd |
| 7	| in://local | whois |	Get my register data |

## Use xStorage function by motechat call
### Input:
xrpc: xrpc control object, {SToken, DDN, Topic, Func, Data, SendTimeout, WaitReply}
- SToken: app token
- DDN: "sys/"
- Topic: topic of xStorage
- Func: function name of xStorage
- Data: the data object for function
- SendTimeout: Integer, Timeout of send message, by sec.
- WaitReply: Integer, The wait time of reply, by sec.
cb: callback( {ErrCode, ErrMsg} )
### Example:
```
let ddn = 'sys/';
let topic = 'xs://config';
let func = 'get';
let data = {"catalog":"myapp","idname":"userinfo"};
let t1 = 6;
let t2 = 12;
let xrpc = {"SToken":mydev.SToken, "DDN":ddn, "Topic":topic, "Func":func,"Data":data, "SendTimeout":t1, "WaitReply":t2};
mChat.Call( xrpc, function(reply){
    console.log('xStorage get config: reply=%s', JSON.stringify(reply));
});
```

### XS Function list
| No | Topic | Func | Data |
| -- | ----- | ---- | ---- |
| 1	| xs://config |	get |	{catalog, idname} |
| 2	| xs://config |	set |	{catalog,idname, data} |
| 3	| xs://cached |	get |	{catalog, idname} |
| 4	| xs://cached |	set	| {catalog, idname, data} |
| 5	| xs://cached |	remove |	{catalog, idname} |
| 6	| xs://cached |	clear |	{catalog} |
| 7	| xs://bucket |	get	| {catalog, idname, datatype} *(note1)* |
| 8	| xs://bucket |	set |	{catalog, idname, data} |
| 9	| xs://bucket |	list |	{catalog} |
| 10 | xs://bucket | remove |	{catalog, idname} |
| 11 | xs://secret | get |	{catalog, idname, password} |
| 12 | xs://secret | set |	{catalog, idname, data, password} |

> Note1:
> datatype: 'hex', 'ascii', 'utf8', 'base64', or 'binary'

# uDNS (DDN) Operation

| No | Delivery By | Format | Search by DC | Search by UC  | Comment |
| -- | ----------- | ------ | ------------ | ------------- | ------- |
| 1  | mote attribute | (EiName or #EiTag) | yes | no | the same DC |
| 2  | mote MMA | >(MMA) | no | no | mote MMA (session) |
| 3  | global mote attribute | >>(EiName or #EiTag) | yes | yes |  |
| 4  | mote MMA | >>>(MMA) | no | no | mote MMA (transport) |
| 5  | mote MMA | mma/(MMA) | no | no | mote MMA (session) |
| 6  | mote MMA | mbus/(MMA) | no | no | mote MMA (transport) |
| 7  | global mote attribute | ddn/(DDN) | yes | yes |  |
| 8  | system function | sys/ | yes | yes |  |
| 9  | specified mote attribute  | (DC MMA)/(EiName or #EiTag) | yes | no | specified DC |

# Error Code
| No | ErrCode | ErrMsg |
| -- | ---- | ------- |
| 1	| 0	| OK |
| 2	| -10199 | Error |
| 3	| -10101 | xRPC not ready |
| 4	| -10102 | xRPC not open |
| 5	| -10103 | Motebus not ready |
| 6	| -10104 | Send error |
| 7	| -10105 | XMsg open error |
| 8	| -10106 | Invalid data |
| 9	| -10107 | No exist function |
| 10 | -10108 | Unknown data |
| 11 | -10299 | Error |
| 12 | -10201 |	DC blank |
| 13 | -10202 |	Not ready |
| 14 | -10203 |	Invalid data |
| 15 | -10204 |	Invalid SToken |
| 16 | -10205 |	No exist function |
| 17 | -10206 |	DDN Off |
| 18 | -10207 |	DDN blank |
| 19 | -10208 |	In Process |
| 20 | -10399 |	Error |
| 21 | -10301 | Invalid data |
| 22 | -10302 |	No socket id |
| 23 | -10303 |	No function |
| 24 | -10304 |	Invalid SToken |
		



