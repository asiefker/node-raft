var needle = require('needle');
var promise = require('bluebird');
promise.promisifyAll(needle);

var endpoint = "http://localhost:5002/command";
function sendOne(jsonBody) {
    return needle.postAsync(endpoint, jsonBody, {'json': 'true', 'timeout': 500})
    .then(function(resp){
        var code = resp[0].statusCode;
        var body = resp[0].body;
        console.log("Status Code: " +code );
        if (code == 200){
            if (body.leader) {
                console.log("redirect to leader: " + body.leader);
                endpoint = body.leader;
            }
            else {
                console.log(body);
            }
        }
        else if (!code) {
            console.log("Status code undefined.");
            console.log(resp);
        }
        else {
            console.log("Error: " + code);
        }
    });
}

var calls = [];
var keys = ["a", "b", "c", "d" , "e", "f"]
sendOne({"a": 1}).then( function() {
    for (x in keys) {
        var a ={};
        a[x] = x;
        calls.push(sendOne(a));
    }
});

function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min)) + min;
}

promise.all(calls).then(function(){
    console.log("Should have "+calls.length+" results");
    setInterval(function(){
        var m = {};
        m[keys[getRandomInt(0, keys.length)]] = getRandomInt(0, 100);
        sendOne(m); 
    }, 1000);
});
