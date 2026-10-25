'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
for(const file of ['age-multi-campaign-cycle-controller.json','age-chatwoot-campaign-reconciliation.json']){
 const j=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows',file),'utf8'));
 assert.equal(j.active,false,'Workflow should import disabled');
 assert(typeof j.id==='string' && j.id.length>=8,'n8n CLI workflow import requires top-level ID');
 assert(j.nodes.length>=3,'Workflow needs a design gate');
 assert(j.nodes.some(x=>x.name==='Design Gate - Never Sends'),'Missing fail-closed design gate');
 assert(!j.nodes.some(x=>/n8n-nodes-base.(httpRequest|postgres|mySql|executeCommand)/.test(x.type)), 'No live HTTP/DB nodes permitted yet');
 assert(j.nodes.some(x=>x.type==='n8n-nodes-base.scheduleTrigger'),'Workflow must have schedule');
}
console.log('PASS: both n8n importable workflows are inactive, fail-closed and never authorize writes');
