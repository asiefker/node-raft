var assert = require("assert");
var raft = require("../raft");
console.log(Object.keys(assert));
console.log(assert);
describe('Raft.State', function() {
    describe('#logIsUpToDate', function(){
        beforeEach(function(){
            r = new raft.Raft();
        });
        afterEach(function(){
            clearTimeout(r.electionTimeout); 
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
            r.term = 1;
            r.currentLogIndex=1; 
            assert.ok(raft.logIsUpToDate(r, 1, 1));
        });
    });
});

describe('Raft.ElectionTimeout', function(){
    beforeEach(function(){
        var r = "foo"; 
    });
    afterEach(function(){
        clearTimeout(r.electionTimeout); 
    });
    it('Starts Election', function(done){
        this.timeout(3000);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
    });
});


describe('Raft.Election', function(){
    beforeEach(function(){
        var r = "foo"; 
    });
    afterEach(function(){
        clearTimeout(r.electionTimeout); 
    });
        it('Election increases term and votes for self', function(done){
            r = new raft.Raft(0, [], function(n, d, e, a){
            assert.equal(1, r.currentTerm);
            assert.equal("candidate", r.curState);
            assert.equal(0, r.votedFor);
            done();
        });
        raft.startElection(r);
    });
    it('Declare winner with majority', function() {
        r= new raft.Raft(0, [1,2], function(n, d, e, a) {
            e(new raft.VoteResponse(d.term, true));
            e(new raft.VoteResponse(d.term, true));
            a();
            assert.equal("leader", r.curState);
        });
        raft.startElection(r);
    });
});


