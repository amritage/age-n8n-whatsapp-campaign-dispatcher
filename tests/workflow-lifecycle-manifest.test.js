'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const dir=path.join(__dirname,'../workflows');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'WORKFLOW_STATUS.json'),'utf8'));
const files=fs.readdirSync(dir).filter(x=>x.endsWith('.json')&&x!=='WORKFLOW_STATUS.json').sort();
assert.equal(files.length,22);
assert.deepEqual(manifest.workflows.map(x=>x.file).sort(),files,'All workflow JSONs must be categorized');
const count={};
for(const entry of manifest.workflows){
 const w=JSON.parse(fs.readFileSync(path.join(dir,entry.file),'utf8'));
 assert.equal(w.active,false,'Workflow must remain inactive: '+entry.file);
 assert(w.name.startsWith(entry.prefix+' '),'n8n-visible lifecycle name missing: '+entry.file);
 assert(entry.purpose&&entry.action,'Incomplete registry entry: '+entry.file);
 assert(!w.nodes.some(n=>n.credentials),'Credentials embedded in workflow: '+entry.file);
 if(entry.status==='USE_NOW'){
  assert(w.nodes.some(n=>n.type==='n8n-nodes-base.manualTrigger'));
  assert(w.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'));
  assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.httpRequest'));
  const pg=w.nodes.filter(n=>n.type==='n8n-nodes-base.postgres');
  if(entry.file==='age-07-delivery-read-analytics-native.json'){
    assert.equal(pg.length,1,'Only one scoped AGE 07 SQL reader allowed');
    const n=pg[0];const sql=n.parameters.query;
    assert.equal(n.parameters.operation,'executeQuery');
    assert.equal(n.continueOnFail,true);
    assert(/\bSELECT\b/i.test(sql));
    assert(/c\.account_id\s*=\s*2/.test(sql),'Account-scoped analytics');
    assert(/i\.channel_type\s*=\s*'Channel::Whatsapp'/.test(sql),'WhatsApp-only');
    assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|CREATE|ALTER|GRANT|REVOKE)\b\s+(?:INTO|FROM|TABLE|ON|ROLE|DATABASE)/i.test(sql));
    assert(!/contacts\.phone_number|message_content|ct\.phone_number/i.test(sql),'No exported PII');
  } else assert.equal(pg.length,0,'No other current workflow may touch PostgreSQL');
  for(const n of w.nodes){
   if(n.type.includes('chatwoot'))assert(['getAll','getMetrics','getRecipients'].includes(n.parameters.operation));
   if(n.type.includes('espocrm'))assert.equal(n.parameters.operation,'getAll');
   if(n.type==='n8n-nodes-base.dataTable')assert.equal(n.parameters.operation,'get');
  }
 }
 if(entry.status==='OPTIONAL_SETUP'){
  assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'));
  assert(w.nodes.filter(n=>n.type==='n8n-nodes-base.dataTable').every(n=>n.parameters.operation==='create'));
 }
 if(entry.status==='DEV_ONLY'){
  if(entry.file==='age-08-verified-message-evidence-reducer.json'){
    assert(w.nodes.some(n=>n.type==='n8n-nodes-base.executeWorkflowTrigger'));
  }else if(entry.file==='age-03-chatwoot-evidence-readonly.json'){
    assert(w.nodes.some(n=>n.type==='n8n-nodes-base.manualTrigger'));
    assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'),'Sensitive recipient inspector cannot schedule');
    assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.postgres').length,1);
    assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.httpRequest'||n.type==='n8n-nodes-base.dataTable'));
    assert(w.nodes.find(n=>n.type==='n8n-nodes-base.postgres').parameters.query.includes('ct.phone_number'));
   }else if(entry.file==='age-multi-campaign-cycle-controller.json'){
    assert(w.nodes.some(n=>n.type==='n8n-nodes-base.manualTrigger'),'Manual trigger required');
    assert(w.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'),'Future hourly cadence declared');
    assert(w.nodes.some(n=>n.name==='Design Gate - Never Sends'),'Fail-closed node required');
    assert(!w.nodes.some(n=>['n8n-nodes-base.httpRequest','n8n-nodes-base.postgres','n8n-nodes-base.mySql','n8n-nodes-base.webhook'].includes(n.type)),'No sender/DB node');
    assert(w.nodes.filter(n=>n.type==='n8n-nodes-base.dataTable').every(n=>n.parameters.operation==='get'),'Read-only table');
    assert(w.nodes.filter(n=>n.type.includes('espocrm')||n.type.includes('chatwoot')).every(n=>n.parameters.operation==='getAll'),'Read-only provider inventory');
  }else throw new Error('Unrecognized DEV_ONLY workflow: '+entry.file);
 }
 count[entry.status]=(count[entry.status]||0)+1;
}
assert.equal(count.USE_NOW,2);assert.equal(count.OPTIONAL_SETUP,1);assert.equal(count.DEV_ONLY,3);
assert.equal(files.length-count.USE_NOW-count.OPTIONAL_SETUP-count.DEV_ONLY,16);
assert(fs.readFileSync(path.join(dir,'README.md'),'utf8').includes('22 workflow JSON files'));
console.log('PASS: 22/22 workflows labeled, only 2 current read-only scheduled, optional setup, 3 development-only, 16 historic/alternative, all inactive');
