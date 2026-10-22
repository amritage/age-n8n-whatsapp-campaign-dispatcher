'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..','workflows');
const get=(f)=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const TYPES={espo:'@traien/n8n-nodes-espocrm.espoCrm',chatwoot:'@renatoascencio/n8n-nodes-chatwoot.chatwoot'};
const readiness=get('age-api-readiness-native.json'),report=get('age-chatwoot-recipient-report-native.json'),finder=get('age-chatwoot-find-campaign-ids-readonly.json');
for(const w of [readiness,report,finder]){
 assert.equal(w.active,false,'Never activate automatically');
 assert(typeof w.id==='string'&&w.id,'Missing n8n workflow id');
 assert(w.nodes.some(x=>x.type==='n8n-nodes-base.manualTrigger'),'Must support manual inspection');
 assert.equal(w.settings.saveDataSuccessExecution,'none','Do not persist sensitive responses');
 assert.equal(w.settings.saveDataErrorExecution,'none','Do not persist sensitive errors');
 assert.equal(w.settings.saveManualExecutions,false);
 assert(!w.nodes.some(x=>x.credentials),'No credential IDs or secrets committed');
 assert(!w.nodes.some(x=>/httpRequest|executeCommand|postgres|mySql/.test(x.type)),'No generic HTTP, shell or DB writes');
 assert(!/REPLACE_CHATWOOT|REPLACE_ESPO_CAMPAIGN_ID|Configure IDs - No Secrets|Set Existing Campaign ID - Fail Closed/.test(JSON.stringify(w)),
 'Workflow must NEVER require a campaign ID');
}
assert.equal(readiness.nodes.filter(x=>x.type===TYPES.espo).length,1);
assert.equal(readiness.nodes.filter(x=>x.type===TYPES.chatwoot).length,1);
assert(readiness.nodes.some(x=>x.type===TYPES.espo&&x.parameters.resource==='customEntity'&&
  x.parameters.operation==='getAll'&&x.parameters.entityType==='Campaign'&&x.parameters.returnAll===true));
assert(readiness.nodes.some(x=>x.type===TYPES.chatwoot&&x.parameters.resource==='campaign'&&x.parameters.operation==='getAll'));
assert.equal(report.nodes.filter(x=>x.type===TYPES.chatwoot).length,3);
assert(report.nodes.some(x=>x.parameters.operation==='getAll'&&x.parameters.resource==='campaign'));
assert(report.nodes.some(x=>x.parameters.operation==='getMetrics'&&x.parameters.resource==='campaign'));
assert(report.nodes.some(x=>x.parameters.operation==='getRecipients'&&x.parameters.resource==='campaign'&&x.parameters.returnAll===true));
assert(report.nodes.some(x=>x.type==='n8n-nodes-base.scheduleTrigger'),'Reporting can run hourly once explicitly activated');
assert(report.nodes.some(x=>x.type==='n8n-nodes-base.if'),'No native WhatsApp campaign must produce a safe empty report');
const summary=report.nodes.find(x=>x.name==='Verify and Summarize All Campaigns');
assert(summary.parameters.jsCode.includes('MISSING_PAIRING'),'Recipient attribution must be fail-closed');
assert(summary.parameters.jsCode.includes('crmEventWriteAuthorized:false'));
const picker=report.nodes.find(x=>x.name==='Select Completed WhatsApp Campaigns');
assert(picker.parameters.jsCode.includes("Channel::Whatsapp"));
assert(picker.parameters.jsCode.includes("MAX_CAMPAIGNS"));
assert(finder.nodes.some(x=>x.type===TYPES.chatwoot&&x.parameters.operation==='getAll'));
console.log('PASS: no manual campaign IDs/URLs, native auto-discovery, safe cross-campaign analytics, optional hourly schedule, no HTTP or writes');
