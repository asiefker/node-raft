var assert = require("assert");

exports.Raft = function () {

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
    
    function VoteResponse(term, granted) {
        this.term = term;
        this.granted = granted;
    }


    function requestVote() {
        logger.info("Requesting vote");
        state = "candidate";
        currentTerm += 1;
        votedFor = id;
        voteReq = {"term": currentTerm, "candidateId": id, 
                "lastLogIndex": currentLogIndex, "lastLogTerm":currentTerm};
        var grantedCount = 0;
        sendAll("/vote", voteReq, function(vRes) {
            if (vRes.granted) {
                grantedCount +=1;
            } else {
                // set currentTerm to max seen
                currentTerm = Math.max(currentTerm, vRes.term);
            }
        }, function(){
            logger.info("Complete: " + grantedCount);
            if (grantedCount > others.length/2) {
                logger.info("Become leader");
                becomeLeader();
            }
            else {
                logger.info("Not elected. Schedule another election");
                votedFor = "";
                electionTimeout = newElectionTimeout();    
            }
        }); 
    }

};
