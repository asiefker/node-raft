var url = require('url');
var async = require('async');
var http = require('http');
http.createServer(function (req, res) {
        q = url.parse(req.url, true);
        console.log(req.method);
        console.log(q);
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
}).listen(1337, '127.0.0.1');
console.log('Server running at http://127.0.0.1:1337/');
setInterval(function() {
        console.log("Callback");
}, 1000);
