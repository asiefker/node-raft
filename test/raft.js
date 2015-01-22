var assert = require("assert");
var raft = require("../raft");

describe('Raft.State', function() {
    describe('#logIsUpToDate', function(){
        beforeEach(function(){
            r = new raft.Raft();
        });

        it('Term is always > 0', function() {
            assert.throws(function(){
                raft.logIsUpToDate(r, 0,0);        
            });
        });

        it('Reply false if term < currentTerm', function(){
            r.currentLogTerm = 2;
            assert.ok(!raft.logIsUpToDate(r, 1, 0));    
        });

        it('Reply true if term > currentTerm', function() {
            assert.ok(raft.logIsUpToDate(r, 1,0));        
        });

        it('Reply true if terms == currentTerm and lastLogIndex > currentLogIndex', function() {
            r.currentTerm = 1;
            r.currentLogTerm = 1;
            r.currentLogIndex=1; 
            assert.ok(raft.logIsUpToDate(r, 1, 1));
            assert.ok(!raft.logIsUpToDate(r, 1, 0));
        });
    });
});

describe('Raft.ElectionTimeout', function(){
    beforeEach(function(){
        var r = "foo"; 
    });
    afterEach(function(){
        clearTimeout(r.timeout); 
    });
    it('Starts Election', function(done){
        this.timeout(2000);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
        raft.start(r);
    });
    it('Starts Election on timeout', function(done) {
        this.timeout(2000);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
        raft.startElection(r);
    });
});

describe('Raft.handleVoteRequest', function() {
    it('Grant vote if not voted and candidate\'s term is >', function() {
        r = new raft.Raft(0, [], function(){});
        res = raft.handleVoteRequest(r,  raft.voteRequest(1, 2, 1, 0));
        assert.ok(res.granted);
        assert.equal(2, res.term);
        assert.equal(1, r.votedFor);
        assert.equal(2, r.currentTerm);
        // should get the vote a second time: 
        res = raft.handleVoteRequest(r, raft.voteRequest(1, 2, 1, 0));
        assert.ok(res.granted);
        assert.equal(2, res.term);
    });
    it('Deny vote for older term', function() {
        r = new raft.Raft(0, [], function(){});
        r.currentTerm = 10;
        res = raft.handleVoteRequest(r, raft.voteRequest(1, 2, 1, 0));
        assert.ok(!res.granted);
        assert.equal(10, res.term);
        assert.equal("", r.votedFor);
        
    });
    it('Deny vote is candidate log is behind', function() {
        r = new raft.Raft(0, [], function(){});
        r.currentTerm = 1;
        r.currentLogIndex = 1;
        r.currentLogTerm = 1;
        res = raft.handleVoteRequest(r, raft.voteRequest(1, 2, 1, 0));
        assert.ok(!res.granted);
        assert.equal(1, res.term);
    });
});

describe('Raft.Election', function(){
    beforeEach(function(){
        var r = "foo"; 
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
            e(raft.voteResponse(d.term, true));
            e(raft.voteResponse(d.term, true));
            a();
        });
        raft.startElection(r);
        assert.equal("leader", r.curState);
    });
    it('Lost election', function() {
         r= new raft.Raft(0, [1,2], function(n, d, e, a) {
            e(raft.voteResponse(d.term, false));
            e(raft.voteResponse(d.term, false));
            a();
        });
        raft.startElection(r);
        assert.equal("candidate", r.curState);
        assert.equal("", r.votedFor);
     });
     it('Become follower if larger term is seen', function() {
         r= new raft.Raft(0, [1,2,3,4], function(n, d, e, a) {
            e(raft.voteResponse(d.term, true));
            e(raft.voteResponse(d.term+1, true));
            e(raft.voteResponse(d.term, true));
            e(raft.voteResponse(d.term, true));
            a();
        });
        // clear original timeout since we're calling manually
        raft.startElection(r);
        assert.equal("follower", r.curState);
        assert.equal("", r.votedFor);
        assert.equal(2, r.currentTerm);
    });
    it('Become follower if heartbeat received during election', function() {
        r= new raft.Raft(0, [1,2,4,5], function(n, d, e, a) {
            e(raft.voteResponse(d.term, true));
            raft.handleAppendRequest(r, raft.appendEntryRequest(1, 3, 0,0,0,[]));
            e(raft.voteResponse(d.term, true));
            a();
        });
        // clear original timeout since we're calling manually
        raft.startElection(r);
        assert.equal("follower", r.curState);
        assert.equal("", r.votedFor);
        assert.equal(3, r.currentTerm);
    });
    it('Ignore heartbeat for older term', function() {
        r= new raft.Raft(0, [1,2,3,4], function(n, d, e, a) {
            console.log(d.term);
            e(raft.voteResponse(d.term, true));
            raft.handleAppendRequest(r, raft.appendEntryRequest(1, 1, 0,0,0,[]));
            e(raft.voteResponse(d.term, true));
            a();
        });
        // clear original timeout since we're calling manually
        raft.startElection(r);
        assert.equal("leader", r.curState);
        assert.equal("", r.votedFor);
        assert.equal(1, r.currentTerm);
    });
});


