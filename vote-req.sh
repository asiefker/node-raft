#! /bin/sh
curl http://localhost:5000/vote -d '{"term": 1, "candidateId": "siefker", "lastLogIndex":0, "lastLogTerm":0}'
