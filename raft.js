var assert = require("assert");
var log4js = require('log4js');

var logger = log4js.getLogger();
logger.setLevel('INFO');

function appendEntryRequest(id, currentTerm, prevLogTerm, prevLogIndex,  
                            commitIndex, entries) {
    return {term: currentTerm, 
        leaderId: id, 
        prevLogIndex: prevLogIndex, 
        prevLogTerm: prevLogTerm, 
        entries: entries, 
        leaderCommitIndex:commitIndex};
}

function voteResponse(term, granted) {
    return {
        term : term,
        granted : granted
    };
}
function voteRequest(candidate, currentTerm, lastLogTerm, lastLogIndex) {
    return {
        candidateId: candidate, 
        term: currentTerm,
        lastLogTerm: lastLogTerm,
        lastLogIndex: lastLogIndex
    };
}

/**
 * Create a Raft instance
 * @param id - the id of this instance
 * @param others {array} - ids of the other Raft instances
 * @param send {function} - callback that takes 4 parameters: 
 *      name, map for the request, per success callback, completion callback
 */
function Raft(id, others, send) {
    // Raft server states
    this.id = id;
    this.curState= states.follower;
    this.currentTerm = 0;
    this.votedFor = "";
    this.others = others;
    this.send = send;
    this.log = [{term: 0}];
    this.commitIndex = 0;
    this.lastApplied = 0;
    this.indexOfLastLog = function() {
        return this.log.length - 1; 
    };
    this.termOfLastLog = function () {
        return this.log[this.log.length-1].term;
    };
}
Raft.prototype.toString = function() {
    return "[object Raft{id="+this.id+", curState="+this.curState+
                        ", currentTerm="+this.currentTerm + 
                        ", currentLogTerm="+this.termOfLastLog()+ 
                        ", indexOfLastLog="+this.indexOfLastLog()+ 
                        ", votedFor="+this.votedFor+"}]";
};

exports.start = function(r) {
    newElectionTimeout(r);
};

function handleVoteRequest(r, voteReq) {
    logger.info(voteReq);
    logger.info(r.toString()); 
    if (voteReq.term < r.currentTerm) {
        return voteResponse(r.currentTerm, false);
    } 
    if ((voteReq.candidateId == r.votedFor || "" === r.votedFor) &&
       logIsUpToDate(r, voteReq.lastLogTerm, voteReq.lastLogIndex)){
        // Grant Vote
        r.currentTerm = voteReq.term;
        r.votedFor = voteReq.candidateId;
        return voteResponse(r.currentTerm, true);
    }
    return voteResponse(r.currentTerm, false);
}

// todo test
function handleAppendRequest(r, appendReq) {
    logger.trace(r);
    logger.trace(appendReq);
    logger.trace("Clearing timeout");
    newElectionTimeout(r);
    if (r.curState == states.candidate && 
       appendReq.term > r.currentTerm) {
        r.curState = states.follower;
        r.currentTerm = appendReq.term;
    }
    if (r.currentTerm > appendReq.term) {
        logger.warn("term mismatch");
        return {"currentTerm": r.currentTerm, "success": false};
    }
    
    if ( !r.log[appendReq.prevLogIndex] || // entry not present
       r.log[appendReq.prevLogIndex].term != appendReq.prevLogTerm) {
        logger.warn("Previous doesn't match");
        return {"currentTerm": r.currentTerm, "success": false};
    }
    // heartbeat has empty logs, so skip the append step 
    if (appendReq.entries.length > 0) {
        var startIdx = appendReq.prevLogIndex + 1;
        var newLogIdx = 0;
        if (startIdx < r.log.length) {
            // do consistency check, since append is not at end of r.log
            for (i = startIdx; i<r.log.length; i++) {
                if (r.log[i].term != appendReq.entries[newLogIdx].term) {
                    r.log.splice(i, r.log.length);
                    // found inconsistency, so we're done. 
                    break;
                }
                newLogIdx++;
                if (newLogIdx == appendReq.entries.length) {
                    // iterated over the new logs and they all match. 
                    break;
                }
            }
        }
        r.log = r.log.concat(appendReq.entries.slice(newLogIdx));
    }
    if (appendReq.leaderCommitIndex > r.commitIndex) {
        r.commitIndex = Math.min(appendReq.leaderCommitIndex, r.log.length-1);
        // TODO: Trigger apply calls. Maybe with events?  
    }
    return {"currentTerm": r.currentTerm, "success": true};
}

function logIsUpToDate(r, lastLogTerm, lastLogIndex) {
    assert.ok(lastLogTerm > 0);
    if (lastLogTerm == r.termOfLastLog()) {
        return lastLogIndex >= r.indexOfLastLog();
    }
    return lastLogTerm > r.termOfLastLog();
}

function startElection(r) {
    logger.info("Requesting election");
    r.curState = states.candidate;
    r.currentTerm += 1;
    r.votedFor = r.id;
    newElectionTimeout(r);    
    voteReq = voteRequest(r.id, r.currentTerm, r.currentTerm, r.currentLogIndex);
    var grantedCount = 1;
    var electionTerm = r.currentTerm;
    r.send("/vote", voteReq, function(vRes) {
        if (electionTerm == vRes.term && vRes.granted) {
            grantedCount +=1;
        } else if (vRes.term > r.currentTerm) {
            // kill the election:
            r.currentTerm = vRes.term;
            r.curState = states.follower;
            electionTerm = -1; // force ignore lagging votes
        }
    }, function() {
        // we may have switched states for any number of reasons
        // so bail
        if (r.curState != states.candidate) {
            return;
        }
        if (grantedCount > r.others.length/2) {
            logger.info("Become leader");
            becomeLeader(r);
        }
        else {
            logger.info("Not elected. Schedule another election");
            r.votedFor = "";
        }
    }); 
}

function becomeLeader(r) {
    r.curState = states.leader;
    newHeartbeatTimeout(r);
}

function newHeartbeatTimeout(r) {
    clearTimeout(r.timeout); 
    r.timeout = setInterval(function() { 
        // if check is probably not needed since
        // a state transition would cancle the timer and 
        // prevent the callback from firing. 
        if (r.curState == states.leader) {
            sendAppendEntry(r);
            newHeartbeatTimeout(r);
        }},
        100 + Math.floor(Math.random() * 200), r);
}

function newElectionTimeout(r) {
    // always clear timeout to be safe. 
    clearTimeout(r.timeout); 
    r.timeout = setTimeout(function(){
        startElection(r); 
    },
    1000 + Math.floor(Math.random() * 2000));
}
    
// todo imple
// add tests
function sendAppendEntry(r) {
    append = appendEntryRequest(r.id, r.currentTerm, 
        9, 0, 0, []); 
    r.send("/append", append, function(a){}, function(){});
}

// Possible states of the raft server
var states = {
    candidate: "candidate",
    follower: "follower",
    leader: "leader"
};
    
exports.appendEntryRequest = appendEntryRequest;
exports.voteRequest = voteRequest;
exports.voteResponse = voteResponse;
exports.startElection = startElection;
exports.logIsUpToDate = logIsUpToDate; 
exports.handleVoteRequest = handleVoteRequest; 
exports.handleAppendRequest = handleAppendRequest;
exports.Raft = Raft;
