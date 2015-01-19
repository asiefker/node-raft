var assert = require("assert");
var log4js = require('log4js');

var logger = log4js.getLogger();

exports.VoteResponse = function(term, granted) {
    this.term = term;
    this.granted = granted;
};
exports.startElection = startElection;
exports.logIsUpToDate = logIsUpToDate; 

/**
 * Create a Raft instance
 * @param id - the id of this instance
 * @param others {array} - ids of the other Raft instances
 * @param send {function} - callback that takes 4 parameters: 
 *      name, map for the request, per success callback, completion callback
 */
exports.Raft = function (id, others, send) {
    // Raft server states
    this.id = id;
    this.curState= states.follower;
    this.others = others;
    this.send = send;
    this.electionTimeout = newElectionTimeout(this);
    this.currentTerm = 0;
    this.currentLogIndex = 0;
};

function logIsUpToDate(r, term, lastLogIndex) {
    assert.ok(term > 0);
    if (term == r.currentTerm) {
        return lastLogIndex >= r.currentLogIndex;
    }
    return term > r.currentTerm;
}

function startElection(r) {
    logger.info("Requesting starting election");
    r.curState = states.candidate;
    r.currentTerm += 1;
    r.votedFor = r.id;
    voteReq = {"term": r.currentTerm, 
            "candidateId": r.id, 
            "lastLogIndex": r.currentLogIndex, 
            "lastLogTerm": r.currentTerm};
    var grantedCount = 0;
    var electionTerm = r.currentTerm;
    r.send("/vote", voteReq, function(vRes) {
        if (electionTerm == vRes.term && vRes.granted) {
            grantedCount +=1;
        } else if (vRes.term > r.currentTerm) {
            // kill the election:
            r.currentTerm = vRes.term;
            electionTerm = -1; // force ignore lagging votes
        }
    }, function(){
        logger.info("Complete: " + grantedCount);
        if (grantedCount > r.others.length/2) {
            logger.trace("Become leader");
            becomeLeader(r);
        }
        else {
            logger.info("Not elected. Schedule another election");
            r.votedFor = "";
            r.electionTimeout = newElectionTimeout(r);    
        }
    }); 
}

function becomeLeader(r) {
    r.curState = states.leader;
    r.timer = setInterval(function() { sendAppendEntry(r);},
        1000 + Math.floor(Math.random() * 500), r);
}

function newElectionTimeout(r) {
    return setTimeout(function(){
        logger.info("Election Timeout");
        startElection(r); 
    },
    1000 + Math.floor(Math.random() * 2000));
}
    
// todo imple
function sendAppendEntry(r) {}

// Possible states of the raft server
var states = {
    candidate: "candidate",
    follower: "follower",
    leader: "leader"
};
    
