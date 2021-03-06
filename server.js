var async = require('async');
var http = require('http');
var log4js = require('log4js');
var needle = require('needle');
var promise = require('promise');
var querystring = require('querystring');
var raft = require("./raft");
var url = require('url');

var logger = log4js.getLogger();
logger.setLevel('INFO');

logger.info("Args " + process.argv);
var id = process.argv[2];
var others = [];
for (var i=process.argv[3]; i<=process.argv[4]; i++) {
    if (id == i) continue;
    others.push(i);
}
var r = new raft.Raft(id, others, sendAll, sendOne, apply);
logger.info("Others: " + others);
paths = {"/vote": raft.handleVoteRequest,
         "/append": raft.handleAppendRequest
        };

http.createServer(function (req, res) {
    q = url.parse(req.url, true);
    if (req.method == "POST") {
        var body = "";
        req.on('data', function(chunk){body += chunk.toString();});
        req.on('end', function(){
            var decoded = querystring.parse(body);
            if (paths[q.path] !== undefined) {
                logger.debug("dispatching to handler: " + body);
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.write(JSON.stringify(paths[q.path](r ,JSON.parse(body))));
                res.end();
            }
            else if (q.path == "/command") {
                console.log("Got Command");
                if (! r.leader) {
                    res.writeHead(503);
                        res.write("Service not available");
                    res.end();
                }
                else if (r.leader == id) {
                    console.log("execute");
                    raft.handleCommand(r, body, function(){
                        console.log("setting up response");
                        res.writeHead(200, {'Content-Type': 'application/json'});
                        res.end(JSON.stringify(state));
                    });
                }
                else {
                    var url = 'http://127.0.0.1:'+r.leader+ req.url;
                    console.log("Redirect to " + url);
                    res.setHeader('Location', url);
                    res.writeHead(200, {'Content-Type': 'application/json'});
                    res.end(JSON.stringify({"leader": url}));
                }
            }
            else {
                res.writeHead(400, {'Content-Type': 'application/json'});
                res.end();
            }
        });
    }
    else {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end(r.toString()+ "\n" + JSON.stringify(state));
    }
 }).listen(id, '127.0.0.1');

logger.info('Server running at http://127.0.0.1:' + id);
logger.info("Starting raft instance");
raft.start(r);
/**
 * Post jsonBody to all the other servers. 
 * eachCB is called to handle each response. 
 * finalCB is called when all responses are received. 
 */
function sendAll(path, jsonBody, eachCB, finalCB) {
    async.each(others, function(port, callback){
        var endpoint = "http://localhost:"+port+path;
        needle.post(endpoint, jsonBody, {'json': 'true', 'timeout': 200}, function(err, resp){
            if (err) {
                logger.trace(endpoint + "failed to respond: " + err);
            } else {
                eachCB(resp.body, port);
            }
            callback();
        });
    }, finalCB);
}

// TODO: Refactor this to share with sendAll, thought the async callback is tricky 
function sendOne(port, path, jsonBody, cb) {
    var endpoint = "http://localhost:"+port+path;
    needle.post(endpoint, jsonBody, {'json': 'true', 'timeout': 200}, function(err, resp){
        if (err) {
            logger.trace(endpoint + "failed to respond: " + err);
        } else {
            cb(resp.body, port);
        }
    });
}

state = {};
function apply(c) {
    var json = JSON.parse(c);
    for (var x in json) {
        state[x] = json[x];
    }
}
