var querystring = require('querystring');
var url = require('url');
var async = require('async');
var http = require('http');
var log4js = require('log4js');
var logger = log4js.getLogger();

logger.info("Args " + process.argv);
var id = process.argv[2];
var others = [];
for (var i=process.argv[3]; i<=process.argv[4]; i++) {
    if (id == i) continue;
    others.push(i);
}
logger.info("Others: " + others);

http.createServer(function (req, res) {
    q = url.parse(req.url, true);
    logger.info(req.method);
    logger.info(q);
    if (req.method == "POST") {
        var body = "";
        req.on('data', function(chunk){body += chunk.toString();});
        req.on('end', function(){
            res.writeHead(200, "OK", {'Content-Type': 'application/json'});
            var decoded = querystring.parse(body);
            logger.info("body: " + decoded);
            if (q.path == "/vote") {
                logger.info("dispatching to handleVote");
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.write(JSON.stringify(handleVoteRequest(JSON.parse(body))));
            }
            else {
                res.writeHead(400, {'Content-Type': 'application/json'});
            }
            res.end();
        });
    }
    else {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Hello World\n');
    }
 }).listen(id, '127.0.0.1');

logger.info('Server running at http://127.0.0.1:' + id);

var state = "follower";
var currentTerm = 0;
var currentLogIndex=0;
var votedFor = "";

var electionTimeout = setTimeout(function(){
    logger.info("Election Timeout");
    state = "candidate";
},4000 + Math.floor(Math.random(2000)));
logger.info(JSON.parse("{\"key\": 1}"));

function handleVoteRequest(voteReq) {
    if (voteReq.term < currentTerm) {
        return {"term": currentTerm, "voteGranted": false};
    } 
    if ((voteReq.candidateId == votedFor || "" === votedFor) &&
       logIsUpToDate(voteReq.lastLogTerm, voteReq.lastLogIndex)){
        // Grant Vote
        currentTerm = voteReq.term;
        votedFor = voteReq.candidateId;
        return {"term": currentTerm, "voteGranted": true};
    }
    return {"term": currentTerm, "voteGranted": false};
}

function logIsUpToDate(lastLogTerm, lastLogIndex) {
    if (lastLogTerm == currentTerm) {
        return lastLogIndex >= currentLogIndex;
    }
    return lastLogTerm > currentTerm;
}

function requestVote() {
    
}
