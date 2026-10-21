#!/usr/bin/env node
'use strict';
const {runProbe}=require('../src/readiness-probe');
runProbe(process.env).then(r=>{
 // Secrets, phone numbers, names and individual recipient rows never printed.
 console.log(JSON.stringify({checkedAt:new Date().toISOString(),...r},null,2));
 if(r.results.some(x=>x.status==='FAIL'))process.exitCode=1;
}).catch(e=>{console.error(JSON.stringify({status:'FAIL',reason:e.message}));process.exitCode=1;});
