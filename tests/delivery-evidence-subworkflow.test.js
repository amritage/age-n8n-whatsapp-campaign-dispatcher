'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const w=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/age-08-verified-message-evidence-reducer.json'),'utf8'));
assert.equal(w.active,false);
assert.equal(w.nodes.length,2);
assert.equal(w.nodes[0].type,'n8n-nodes-base.executeWorkflowTrigger');
assert.equal(w.nodes[0].typeVersion,1.2);
assert.equal(w.nodes[0].parameters.inputSource,'passthrough');
assert.equal(w.nodes[1].type,'n8n-nodes-base.code');
assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.httpRequest'||n.type==='n8n-nodes-base.dataTable'||n.type==='n8n-nodes-base.postgres'));
const code=w.nodes[1].parameters.jsCode;
function run(payload){
 return vm.runInNewContext('(function(){'+code+'\n})()',{
  $input:{all:()=>payload.map(json=>({json}))},Date
 },{timeout:2000})[0].json;
}
const base={chatwootAccountId:2,chatwootInboxId:5,messageId:'wamid.abcXYZ',verifiedSource:true,occurredAt:'2026-10-24T03:00:00Z'};
let x=run([{...base,status:'read'},{...base,status:'read'},{...base,status:'delivered',occurredAt:'2026-10-24T02:50:00Z'}]);
assert.equal(x.totals.uniqueMessages,1);
assert.equal(x.totals.deliveredIncludingRead,1);
assert.equal(x.totals.readConfirmed,1);
assert.equal(x.totals.duplicateEventsSuppressed,1);
assert.equal(x.messages[0].status,'READ');
assert.equal(x.messages[0].deliveredAt,'2026-10-24T02:50:00.000Z');
assert.equal(x.crmEventWrites,0);
assert.equal(x.canSend,false);
x=run([{...base,status:'read'}]);
assert.equal(x.messages[0].deliveredAt,null);
assert.equal(x.messages[0].readAt,'2026-10-24T03:00:00.000Z');
x=run([{...base,status:'read',verifiedSource:false}]);
assert.equal(x.totals.invalidEvents,1);
assert.equal(x.totals.deliveredIncludingRead,0);
assert.throws(()=>run(Array.from({length:2501},()=>({...base,status:'read'}))),/EVIDENCE_BATCH_TOO_LARGE/);
console.log('PASS: native Execute Workflow Trigger v1.2 + stateless evidence reducer, exact read union and no writes');
