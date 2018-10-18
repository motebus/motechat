// motechat: 
// Date: 2018/10/12
// 
//var fs = require('fs');
//var conf = JSON.parse(fs.readFileSync(__dirname +'/config/config.json', 'utf8'));
var conf = require('./conf/config.json');
console.log('conf=%s',JSON.stringify(conf));
if ( process.env.AppName ) conf.AppName = process.env.AppName;
if ( process.env.DCenter ) conf.DCenter = process.env.DCenter;
if ( process.env.IOC ) conf.IOC = process.env.IOC;
mc = require('./app/appmain.js');
mc.Start( null, conf );

