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
                new r.State().logIsUpToDate(0,0);        
            });
        });
        it('Reply false if term < currentTerm', function(){
            var s = new r.State();
            s.currentTerm = 2;
            assert.ok(!s.logIsUpToDate(1, 0));    
        });

        it('Reply true if term > currentTerm', function() {
            assert.ok(new r.State().logIsUpToDate(1,0));        
        });

        it('Reply true if terms == currentTerm and lastLogIndex > currentLogIndex', function() {
            var s = new r.State();
            s.term = 1;
            s.currentLogIndex=1; 
            assert.ok(new s.logIsUpToDate(1, 1));
        });
    });
});

describe('Raft.ElectionTimeout', function(){
    it('Starts Election', function(done){
        this.timeout(3000);
        r = new raft.Raft(0, [], function(n, d, e, a){done();});
    });
});


describe('Raft.Election', function(){
    beforeEach(function(){
        r = new raft.Raft();
        // disable timeout to make tests faster
        clearTimeout(r.electionTimeout); 
    });
    it('Election increases term and votes for self', function(done){
        var r = new raft.Raft(0, [], function(n, d, e, a){
            assert.equal(1, r.state.currentTerm);
            assert.equal("candidate", r.curState);
            assert.equal(0, r.votedFor);
            done();});
    });
    it('Declare winner with majority', function() {
        var r = new raft.Raft(0, [1,2], function(n, d, e, a) {
            e(new raft.VoteResponse(d.term, true));
            e(new raft.VoteResponse(d.term, true));
            a();
            assert.equal("leader", r.curState);
        });
    });
});


