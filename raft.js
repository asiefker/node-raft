var assert = require("assert");
var log4js = require('log4js');

var logger = log4js.getLogger();

exports.VoteResponse = function(term, granted) {
    this.term = term;
    this.granted = granted;
};

/**
 * Create a Raft instance
 * @param id - the id of this instance
 * @param others {array} - ids of the other Raft instances
 * @param send {function} - callback that takes 4 parameters: 
 *      name, map for the request, per success callback, completion callback
 */
exports.Raft = function (id, others, send) {
    // Raft server states
    this.states = {
        candidate: "candidate",
        follower: "follower",
        leader: "leader"
    };
    this.State = function() {
        this.currentTerm = 0;
        this.currentLogIndex = 0;
    
        this.logIsUpToDate = function (term, lastLogIndex) {
            assert.ok(term > 0); 
            if (term == this.currentTerm) {
                return lastLogIndex >= this.currentLogIndex;
            }
            return term > this.currentTerm;
        };
    };
    
    this.startElection = function() {
        logger.info("Requesting starting election");
        logger.info("All keys: " + Object.keys(this));
        this.curState = this.states.candidate;
        this.state.currentTerm += 1;
        this.votedFor = id;
        voteReq = {"term": this.state.currentTerm, 
                "candidateId": this.id, 
                "lastLogIndex": this.state.currentLogIndex, 
                "lastLogTerm":this.state.currentTerm};
        var grantedCount = 0;
        this.send("/vote", voteReq, function(r, vRes) {
            if (vRes.granted) {
                grantedCount +=1;
            } else {
                // set currentTerm to max seen
                // todo this state needs to kill the current election
                r.state.currentTerm = Math.max(r.state.currentTerm, vRes.term);
            }
        }, function(r){
            logger.info("Complete: " + grantedCount);
            if (grantedCount > r.others.length/2) {
                logger.trace("Become leader");
                r.becomeLeader();
            }
            else {
                logger.info("Not elected. Schedule another election");
                r.votedFor = "";
                r.electionTimeout = newElectionTimeout();    
            }
        }); 
    };

    
    this.becomeLeader = function() {
        this.curState = this.states.leader;
        this.timer = setInterval(function(r) { r.sendAppendEntry();},
            1000 + Math.floor(Math.random() * 500), r);
    };

    // todo imple
    this.sendAppendEntry = function() {};

    this.newElectionTimeout = function() {
        return setTimeout(function(a){
            logger.info("Election Timeout");
            a.startElection(); 
        },
        1000 + Math.floor(Math.random() * 2000), this);
    };
    
    this.id = id;
    this.curState= this.states.follower;
    this.electionTimeout = this.newElectionTimeout();
    this.state = new this.State();
    this.send = send;    
    this.others = others;
};
