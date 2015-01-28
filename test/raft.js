var assert = require("assert");
var chai = require("chai");
var raft = require("../raft");

describe('Raft.State', function() {
    describe('#logIsUpToDate', function(){
        beforeEach(function(){
            r = new raft.Raft();
        });
        it('Reply false if term < currentTerm', function(){
            r.log.push({term:2, command:""});
            assert.ok(!raft.logIsUpToDate(r, 1, 0));    
        });

        it('Reply true if term > currentTerm', function() {
            assert.ok(raft.logIsUpToDate(r, 1,0));        
        });

        it('Reply true if terms == currentTerm and lastLogIndex > currentLogIndex', function() {
            r.currentTerm = 1;
            r.log.push({term:1, command:""});
            assert.ok(raft.logIsUpToDate(r, 1, 1));
            assert.ok(!raft.logIsUpToDate(r, 1, 0));
        });
    });
});

describe('Raft.ElectionTimeout', function(){
    beforeEach(function(){
        r = "foo"; 
    });
    afterEach(function(){
        clearTimeout(r.timeout); 
    });
    it('Starts Election', function(done){
        this.timeout(3500);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
        raft.start(r);
    });
    it('Starts Election on timeout', function(done) {
        this.timeout(3500);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
        raft.startElection(r);
    });
});

describe('Raft.handleVoteRequest', function() {
    beforeEach(function(){
        r = new raft.Raft(0, [], function(){});
    });
    afterEach(function(){
        clearTimeout(r.timeout);
    });
    it('Grant vote if not voted and candidate\'s term is >', function() {
        res = raft.handleVoteRequest(r,  raft.voteRequest(1, 2, 1, 0));
        assert.ok(res.granted);
        assert.equal(2, res.term);
        assert.equal(1, r.votedFor);
        assert.equal(2, r.currentTerm);
        // should get the vote a second time: 
        res = raft.handleVoteRequest(r, raft.voteRequest(1, 2, 1, 0));
        assert.ok(res.granted);
        assert.equal(2, res.term);
        // but on new term, grant vote
        res = raft.handleVoteRequest(r, raft.voteRequest(2,3, 1, 0));
        assert.ok(res.granted);
        assert.equal(3, res.term);
        assert.equal(2, r.votedFor);
    });
    it('Deny vote for older term', function() {
        r.currentTerm = 10;
        res = raft.handleVoteRequest(r, raft.voteRequest(1, 2, 1, 0));
        assert.ok(!res.granted);
        assert.equal(10, res.term);
        assert.equal("", r.votedFor);
        
    });
    it('Deny vote if candidate log is behind', function() {
        r.currentTerm = 1;
        r.log.push({term: 1, command:""});
        res = raft.handleVoteRequest(r, raft.voteRequest(1, 2, 1, 0));
        assert.ok(!res.granted);
        assert.equal(1, res.term);
    });
    it('Deny vote if already voted for someone else this term', function(){
        r.currentTerm = 1;
        res = raft.handleVoteRequest(r, raft.voteRequest(1, 1, 1, 0));
        assert.ok(res.granted);
        res = raft.handleVoteRequest(r, raft.voteRequest(2, 1, 1, 0));
        assert.ok(!res.granted);
    });
});

describe('Raft.Election', function(){
    beforeEach(function(){
        r = "foo"; 
    });
    afterEach(function(){
        clearTimeout(r.timeout);
    });
    it('Election increases term and votes for self', function(){
            r = new raft.Raft(0, [], function(n, d, e, a){
            assert.equal(1, r.currentTerm);
            assert.equal("candidate", r.curState);
            assert.equal(0, r.votedFor);
        });
        raft.startElection(r);
    });
    it('Declare winner with majority', function() {
        r= new raft.Raft(0, [1,2], function(n, d, e, a) {
            e(raft.voteResponse(1, d.term, true));
            e(raft.voteResponse(2, d.term, true));
            a();
        });
        raft.startElection(r);
        assert.equal("leader", r.curState);
    });
    it('Lost election', function() {
         r= new raft.Raft(0, [1,2], function(n, d, e, a) {
            e(raft.voteResponse(1, d.term, false));
            e(raft.voteResponse(2, d.term, false));
            a();
        });
        raft.startElection(r);
        assert.equal("candidate", r.curState);
        assert.equal("", r.votedFor);
     });
     it('Become follower if larger term is seen', function() {
         r= new raft.Raft(0, [1,2,3,4], function(n, d, e, a) {
            e(raft.voteResponse(1, d.term, true));
            e(raft.voteResponse(2, d.term+1, true));
            e(raft.voteResponse(3, d.term, true));
            e(raft.voteResponse(4, d.term, true));
            a();
        });
        // clear original timeout since we're calling manually
        raft.startElection(r);
        assert.equal("follower", r.curState);
        assert.equal("", r.votedFor);
        assert.equal(2, r.currentTerm);
        // also implies that he lost election:
        assert.equal(2, r.leader);
    });
    it('Become follower if heartbeat received during election', function() {
        r= new raft.Raft(0, [1,2,4,5], function(n, d, e, a) {
            e(raft.voteResponse(2, d.term, true));
            raft.handleAppendRequest(r, raft.appendEntryRequest(1, 3, 0,0,0,[]));
            e(raft.voteResponse(1, d.term, true));
            a();
        });
        raft.startElection(r);
        assert.equal("follower", r.curState);
        assert.equal(1, r.leader);
        assert.equal("", r.votedFor);
        assert.equal(3, r.currentTerm);
    });
    it('Ignore heartbeat for older term', function() {
        r= new raft.Raft(0, [1,2,3,4], function(n, d, e, a) {
            e(raft.voteResponse(1, d.term, true));
            raft.handleAppendRequest(r, raft.appendEntryRequest(1, 1, 0,0,0,[]));
            e(raft.voteResponse(2, d.term, true));
            a();
        });
        r.currentTerm=1;
        raft.startElection(r);
        assert.equal("leader", r.curState);
        assert.equal(0, r.leader);
        assert.equal("", r.votedFor);
        assert.equal(2, r.currentTerm);
    });
});

describe('Raft.handleAppendRequests', function() {
    beforeEach(function(){
        r= new raft.Raft(0, [1,2,3,4], function(n, d, e, a) {});
    });
    afterEach(function(){
        clearTimeout(r.timeout);
    });
    it('Reply false if term < currentTerm', function() {
        r.currentTerm = 3;
        var t = r.timeOut;
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 1, 0,0,0,[]));
        assert.ok(!res.success);
        assert.equal(3, res.currentTerm);
        chai.assert.equal(t, r.timeout, "timers are not the same");
    });
    it('Election timeout is not reset if message is form previous term', function(){
        r.leader = 1;
        r.currentTerm = 2; 
        var t = r.timeOut;
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 1, 0,0,0,[]));
        chai.assert.equal(t, r.timeout, "timers are not the same");
    });
    it('Reply false if log is missing entry at previous index', function() {
        r.currentTerm = 1;
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 1, 1,2,0,[]));
        assert.ok(! res.success);
        assert.equal(1, res.currentTerm);
    });
    it('Reply false if log enty at previous index has wrong term', function() {
        r.currentTerm = 2;
        r.log.push({term:1, command:""});
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 2, 2,1,0,[]));
        assert.ok(! res.success);
        assert.equal(2, res.currentTerm);
    });
    it('Append first entry to log', function() {
        r.currentTerm = 1;
        var e = {term:1, command:""};
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1,1,0,0,0,
                                                                      [e]));
        assert.ok(res.success);
        assert.equal(1, res.currentTerm);
        assert.equal(2, r.log.length);
        assert.equal(e, r.log[1]);
    });
    it('Remove conflicting log entries', function() {
        r.currentTerm = 2;
        // follower got some uncommitted state from a different leader that then died. 
        r.log.push({term:1, comand:"committed"}, 
                   {term:2, command:"remove"},
                   {term:2, command:"remove"});
        var entry = {term:1, command:"new"};
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 2, 1,1,0,
                                                                      [entry]));
        assert.ok(res.success);
        assert.equal(3, r.log.length);
        assert.equal(entry, r.log[2]);
    });
    it('Multi entry support', function(){
        // append multipe new entries, remove multiple conflicts from the middle
        r.currentTerm = 2;
        r.log.push({term:1, command:"committed"}, 
                   {term:2, command:"remove"},
                   {term:2, command:"remove"});
        var newEntries = [{term:1, command:"committed"}, 
                        {term:1, command: "replace"},
                        {term:2, command: "replace again"}];
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 2, 0,0,0,
                                                                      newEntries));
        assert.ok(res.success);
        assert.equal(4, r.log.length);
        assert.deepEqual(newEntries, r.log.slice(1));
    });
    it('AppendLogs subset of committed logs', function() {
        r.currentTerm = 2;
        r.log.push({term:1, command:"committed"}, 
                   {term:2, command:"good"},
                   {term:2, command:"good"});
        var newEntries = [{term:1, command:"committed"}, 
                        {term:2, command: "good"}];
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 2, 0,0,0,
                                                                      newEntries));
        assert.ok(res.success);
        assert.equal(4, r.log.length);
    });
    it("Heartbeat advances commit index", function(){
        r.currentTerm = 1;
        for (i=0; i<5; i++) {
            r.log.push({term:1, command:""});
        }
        var res = raft.handleAppendRequest(r, raft.appendEntryRequest(1, 1, 1,5,3,[]));
        assert.ok(res.success);
        assert.equal(3, r.commitIndex);
    });
});
describe('Raft.sendAppendEntry', function() {
    beforeEach(function(){
    });
    afterEach(function(){
        clearTimeout(r.timeout);
    });
    it("Leader sends heartbeat", function(done) {
        this.timeout(1000);
        var count = 0;
        r= new raft.Raft(0, [1,2,3,4], function() {}, function(id, path, req, cb) {
            count++;
            assert.equal(0, req.leaderId);
            assert.equal(0, req.term);
            assert.equal(0, req.entries.length);
            assert.equal(0, req.prevLogIndex);
            assert.equal(0, req.prevLogTerm);
            assert.equal(0, req.leaderCommitIndex);
            if (count == 4) {
                done();
            }
            return {"currentTerm": 0, "success": true};
        });
        raft.becomeLeader(r);
    });
});    


