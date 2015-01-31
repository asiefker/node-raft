var assert = require("assert");
var async = require("async");
var log4js = require('log4js');
var logger = log4js.getLogger();
logger.setLevel('INFO');

function appendEntryRequest(id, currentTerm, prevLogTerm, prevLogIndex,  
                            commitIndex, entries) {
    return {term: currentTerm, 
        leaderId: id, 
        prevLogIndex: prevLogIndex, 
        prevLogTerm: prevLogTerm, 
        leaderCommitIndex:commitIndex,
        entries: entries};
}

function voteResponse(id, term, granted) {
    return {
        id: id,
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
 * @param sendAll {function} - callback that takes 4 parameters: 
 *      name, map for the request, per success callback, completion callback
 *      request will be sent to the rest of the fleet
 * @param sendOne {function} - callback that takes 4 parameters:
 *      id, name, map for the request, success callback
 * @param apply {function} - callback to update the state machine after the 
 *      command has been replicated. Takes 1 parameter, the comand
 */
function Raft(id, others, sendAll, sendOne, apply) {
    // Raft server states
    this.id = id;
    this.curState= states.follower;
    this.currentTerm = 0;
    this.votedFor = "";
    this.others = others;
    this.send = sendAll;
    this.sendOne = sendOne;
    this.apply = apply;
    this.log = [{term: 0}];
    this.commitIndex = 0;
    this.lastApplied = 0;
    // TODO: These 2 functions might go away
    this.indexOfLastLog = function() {
        return this.log.length - 1; 
    };
    this.termOfLastLog = function () {
        return this.log[this.log.length-1].term;
    };
    // TODO: rename? Matches paper, but thinking in terms of last good index is easier
    this.nextIndex = {};
    this.matchIndex = {};
}
Raft.prototype.toString = function() {
    return "[object Raft{id="+this.id+", curState="+this.curState+
                        ", currentTerm="+this.currentTerm + 
                        ", termOfLastLog="+this.termOfLastLog()+ 
                        ", indexOfLastLog="+this.indexOfLastLog()+ 
                        ", leader="+this.leader+ 
                        ", votedFor="+this.votedFor+"}]";
};

exports.start = function(r) {
    newElectionTimeout(r);
};

function handleVoteRequest(r, voteReq) {
    logger.info(voteReq);
    logger.info(r.toString()); 
    if (voteReq.term < r.currentTerm) {
        logger.info("false: old term");
        return voteResponse(r.id, r.currentTerm, false);
    } 
    if (("" === r.votedFor || // accept first candidate 
         // only vote for 1 candidate per term, but support retries on requests. 
         voteReq.candidateId == r.votedFor && voteReq.term == r.currentTerm ||  
        // candidate is for a future term, accept that
        voteReq.term > r.currentTerm) &&
            // but no matter what, log has to be up to date 
       logIsUpToDate(r, voteReq.lastLogTerm, voteReq.lastLogIndex)){
        // Grant Vote
        r.currentTerm = voteReq.term;
        r.votedFor = voteReq.candidateId;
        newElectionTimeout(r);
        logger.info("granted");
        return voteResponse(r.id, r.currentTerm, true);
    }
    logger.trace("Default false.");
    return voteResponse(r.id, r.currentTerm, false);
}

function handleAppendRequest(r, appendReq) {
    logger.trace(appendReq);
    logger.trace(r.toString());
    if ( appendReq.term >= r.currentTerm) {
        // someone was elected leader without our vote (granted vote updates r.term)
        // But they can't send appends without winning, so follow them. 
        becomeFollower(r, appendReq.leaderId, appendReq.term);
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

function handleCommand(r, c) {
    // should be handle by caller but make sure
    assert.equal(r.curState,  states.leader); 
    r.log.push({term: r.currentTerm, command: c});
    sendAppendEntry(r);
    while (r.lastApplied < r.commitIndex) {
        r.lastApplied++;
        r.apply(r.log[r.lastApplied].command);
    }
    return true;
}

function logIsUpToDate(r, lastLogTerm, lastLogIndex) {
    if (lastLogTerm == r.termOfLastLog()) {
        return lastLogIndex >= r.indexOfLastLog();
    }
    return lastLogTerm > r.termOfLastLog();
}

function startElection(r) {
    logger.info("Requesting election");
    becomeCandidate(r);
    r.votedFor = r.id;
    newElectionTimeout(r);    
    voteReq = voteRequest(r.id, r.currentTerm, r.termOfLastLog(), r.indexOfLastLog());
    var grantedCount = 1;
    var electionTerm = r.currentTerm;
    r.send("/vote", voteReq, function(vRes) {
        logger.info(r.toString());
        logger.info(vRes);
        if (electionTerm == vRes.term && vRes.granted) {
            grantedCount +=1;
        } else if (vRes.term > r.currentTerm) {
            // kill the election:
            becomeFollower(r, vRes.id, vRes.term);
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
    r.leader = r.id;
    logger.info("Now leader: " + r);
    newHeartbeatTimeout(r);
    r.others.map(function(y){r.nextIndex[y]=r.indexOfLastLog();});
    r.others.map(function(y){r.matchIndex[y]=0;});
}

function becomeFollower(r, leader, newTerm) {
    r.curState = states.follower;
    var oldLeader = r.leader;
    r.leader = leader;
    r.currentTerm = newTerm;
    r.nextIndex = {};
    r.matchIndex = {};
    if (oldLeader != r.leader) {
        // actually changed leaders, so log the event. 
        logger.info("Now follower: " + r);
    }
    newElectionTimeout(r);
}

function becomeCandidate(r) {
    r.curState = states.candidate;
    r.currentTerm += 1;
    logger.info("Now candidate: " + r);
    r.nextIndex = {};
    r.matchIndex = {};
}

function newHeartbeatTimeout(r) {
    clearTimeout(r.timeout); 
    r.timeout = setTimeout(function() { 
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
    
function sendAppendEntry(r) {
    async.each(r.others, function(o, cb){
        // save off the index for the callbacks. 
        var indexOfLastLog = r.indexOfLastLog();
        var otherLastLogIndex = r.nextIndex[o];
        append = appendEntryRequest(r.id, r.currentTerm, 
            r.log[otherLastLogIndex].term, otherLastLogIndex, r.commitIndex, 
           r.log.slice(otherLastLogIndex + 1)); // todo, put a limit in here for catch up
        r.sendOne(o, "/append", append, function(resp){
            logger.info("Other "+ o + " lastIndex: "  + otherLastLogIndex);
            if (resp.success) {
                // max deals with out of order return statements.  
                r.nextIndex[o] = Math.max(indexOfLastLog, r.nextIndex[o]);
                r.matchIndex[o] = Math.max(indexOfLastLog, r.matchIndex[o]);
            } else if (otherLastLogIndex == r.nextIndex[o]) {
                // on failure, decrement to trigger resend, but only if
                // we have not accepted newer messages from this other.
                logger.info(JSON.stringify(r.nextIndex));
                r.nextIndex[o] = r.nextIndex[o]-1; 
                logger.info(JSON.stringify(r.nextIndex));
            }
            logger.info("After Other "+ o + JSON.stringify(r.nextIndex)); 
        });
    });
    p = function(x) { 
        return r.nextIndex[x]>= r.commitIndex+1 && 
                            r.log[r.commitIndex+1].term == r.currentTerm;};
    while(hasMajority(p)){
        r.commitIndex++;
    }
}

/**
 * Returns true if a majority agree with f. 
 * @param {function} f a predicate 
 * @return {boolean} true if more than half of others evaluate f to true. 
 * Implicitly, it assumes that "this" instance agrees. 
 */
function hasMajority(f){
    var count = r.others.filter(f).length;
    return count+1>(r.others.length/2);
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
exports.handleAppendRequest = handleAppendRequest;
exports.handleCommand = handleCommand;
exports.handleVoteRequest = handleVoteRequest; 
exports.Raft = Raft;
// exposed for testing only.  
exports.becomeLeader= becomeLeader; 
exports.sendAppendEntry= sendAppendEntry;
