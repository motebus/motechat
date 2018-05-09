// motechat: 
// Date: 2018/03/08
// 
//var fs = require('fs');
//var conf = JSON.parse(fs.readFileSync(__dirname +'/config/config.json', 'utf8'));
var conf = require('./conf/config.json');
console.log('conf=%s',JSON.stringify(conf));

mc = require('./app/appmain.js');
mc.Start( null, conf );

