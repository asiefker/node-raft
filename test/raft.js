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
            r.currentTerm = 2;
            assert.ok(!raft.logIsUpToDate(r, 1, 0));    
        });

        it('Reply true if term > currentTerm', function() {
            assert.ok(raft.logIsUpToDate(r, 1,0));        
        });

        it('Reply true if terms == currentTerm and lastLogIndex > currentLogIndex', function() {
            r.currentTerm = 1;
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
        this.timeout(3000);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
        raft.start(r);
    });
    it('Starts Election on timeout', function(done) {
        this.timeout(3000);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
        raft.startElection(r);
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
            e(new raft.VoteResponse(d.term, true));
            e(new raft.VoteResponse(d.term, true));
            a();
        });
        raft.startElection(r);
        assert.equal("leader", r.curState);
    });
    it('Lost election', function() {
         r= new raft.Raft(0, [1,2], function(n, d, e, a) {
            e(new raft.VoteResponse(d.term, false));
            e(new raft.VoteResponse(d.term, true));
            a();
        });
        raft.startElection(r);
        assert.equal("candidate", r.curState);
        assert.equal("", r.votedFor);
     });
     it('Become follower if larger term is seen', function() {
         r= new raft.Raft(0, [1,2,3,4], function(n, d, e, a) {
            e(new raft.VoteResponse(d.term, true));
            e(new raft.VoteResponse(d.term+1, true));
            e(new raft.VoteResponse(d.term, true));
            e(new raft.VoteResponse(d.term, true));
            a();
        });
        // clear original timeout since we're calling manually
        raft.startElection(r);
        assert.equal("follower", r.curState);
        assert.equal("", r.votedFor);
        assert.equal(2, r.currentTerm);
    });
});


