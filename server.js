var async = require('async');
var http = require('http');
var log4js = require('log4js');
var needle = require('needle');
var promise = require('promise');
var querystring = require('querystring');
var url = require('url');

var logger = log4js.getLogger();

logger.info("Args " + process.argv);
var id = process.argv[2];
var others = [];
for (var i=process.argv[3]; i<=process.argv[4]; i++) {
    if (id == i) continue;
    others.push(i);
}
logger.info("Others: " + others);
paths = {"/vote": handleVoteRequest,
         "/append": handleAppendRequest
        };

http.createServer(function (req, res) {
    q = url.parse(req.url, true);
    if (req.method == "POST") {
        var body = "";
        req.on('data', function(chunk){body += chunk.toString();});
        req.on('end', function(){
            res.writeHead(200, "OK", {'Content-Type': 'application/json'});
            logger.info("body: " + body);
            var decoded = querystring.parse(body);
            if (paths[q.path] !== undefined) {
                logger.info("dispatching to handler: " + body);
                res.writeHead(200, {'Content-Type': 'application/json'});
                res.write(JSON.stringify(paths[q.path](JSON.parse(body))));
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

var electionTimeout = newElectionTimeout();

function newElectionTimeout() {
    return setTimeout(function(){
        logger.info("Election Timeout");
        requestVote();
    },
    6000 + Math.floor(Math.random() * 2000));
}

function handleVoteRequest(voteReq) {
    logger.info("VoteRequest term: " + voteReq.term);
    logger.info("State: currentTerm " + currentTerm + " votedFor: " + votedFor +" currentLogIndex: " + currentLogIndex );
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
    logger.info("Requesting vote");
    state = "candidate";
    currentTerm += 1;
    votedFor = id;
    voteReq = {"term": currentTerm, "candidateId": id, "lastLogIndex": currentLogIndex, "lastLogTerm":currentTerm};
    var grantedCount = 0;
    sendAll("/vote", voteReq, function(vReq) {
        if (vReq.voteGranted) {
            grantedCount +=1;
        }
    }, function(){
        logger.info("Complete: " + grantedCount);
        if (grantedCount > 0) {
            logger.info("Become leader");
            becomeLeader();
        }
    }); 
}

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
                logger.warn(endpoint + "failed to respond: " + err);
            } else {
                eachCB(resp.body);
            }
            callback();
        });
    }, finalCB);
}

var heartbeatTimer;
function becomeLeader() {
    state = "leader";
    heartbeatTimer = setInterval(sendAppendEntry,
        1000 + Math.floor(Math.random() * 500));
}

function sendAppendEntry() {
    append = {"term": currentTerm, "leaderId": id, "prevLogIndex":0, "prevLogTerm":9, "entries":[], "leaderCommitIndex":0};
    sendAll("/append", append, function(a){}, function(){});
}

function handleAppendRequest(appendReq) {
    logger.info("Clearing timeout");
    clearTimeout(electionTimeout);
    electionTimeout = newElectionTimeout(); 
    return {"currentTerm": currentTerm, "success": true};
    // TODO: Implement the rest 
}
