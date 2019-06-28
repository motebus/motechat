// motechat: 
// Date: 2019/6/28
// 
//var fs = require('fs');
//var conf = JSON.parse(fs.readFileSync(__dirname +'/config/config.json', 'utf8'));
var conf = require('./conf/config.json');
console.log('conf=%s',JSON.stringify(conf));
if ( process.env.APP_NAME ) conf.AppName = process.env.APP_NAME;
if ( process.env.DC ) conf.DCenter = process.env.DC;
if ( process.env.IOC ) conf.IOC = process.env.IOC;
if ( process.env.MOTEBUS_GATEWAY ) conf.MotebusGW = process.env.MOTEBUS_GATEWAY;

mc = require('./app/appmain.js');
mc.Start( null, conf );

