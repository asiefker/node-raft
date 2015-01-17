var assert = require("assert");
var raft = require("../raft");

describe('Raft.State', function() {
    describe('#logIsUpToDate', function(){
        console.log("Foo");
        console.log(assert);
        r = new raft.Raft();
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
