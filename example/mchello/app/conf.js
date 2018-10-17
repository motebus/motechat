var exports = module.exports = {};

const fs = require('fs');
const os = require('os');
var MyConfPath = '';

exports.ReadConfInfo = function(sfile){
    if ( MyConfPath == '' ) GetConfPath();
    info = require( MyConfPath + sfile );
    console.log('ReadConfInfo: info=%s', JSON.stringify(info));
    return info;
}

exports.SaveConfInfo = function(info, sfile){
    if ( MyConfPath == '' ) GetConfPath();
    var data = JSON.stringify(info);
    var path = MyConfPath + sfile;
    console.log('SaveConfInfo: path=%s,data=%s', path, data);
    fs.writeFileSync(path, data);
}

var GetConfPath = function(){
    console.log('GetConfInfo: OS=%s',os.platform());
    var isWin32 = os.platform() == 'win32';
    var path;
    if (isWin32){
        path = __dirname.substr(0, __dirname.lastIndexOf('\\')+1) + 'conf\\';
    }
    else {
        path = __dirname.substr(0, __dirname.lastIndexOf('/')+1) + 'conf/';
    }
    console.log('GetDevInfo: path=%s', path);   
    MyConfPath = path; 
}

