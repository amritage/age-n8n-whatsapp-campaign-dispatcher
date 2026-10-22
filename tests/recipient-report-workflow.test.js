'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const wf=JSON.parse(fs.readFileSync(path.join(__dirname,'..','workflows','age-chatwoot-recipient-report-readonly.json'),'utf8'));
assert.equal(wf.active,false);
assert.equal(wf.nodes.filter(x=>x.type==='n8n-nodes-base.manualTrigger').length,1,'Manual only');
assert.equal(wf.nodes.filter(x=>x.type==='n8n-nodes-base.scheduleTrigger').length,0,'No periodic live reads until verified');
assert.equal(wf.settings.saveDataSuccessExecution,'none');
assert.equal(wf.settings.saveDataErrorExecution,'none');
assert.equal(wf.settings.saveManualExecutions,false);
const http=wf.nodes.filter(x=>x.type==='n8n-nodes-base.httpRequest');
assert.equal(http.length,3,'Expected metrics, first page, every page GET nodes');
for(const node of http) {
 assert.equal(node.parameters.method,'GET','Never write to live systems');
 assert.equal(node.parameters.genericAuthType,'httpHeaderAuth','Use n8n Chatwoot Header Auth');
 assert.equal(node.credentials,undefined,'No credentials embedded');
 assert(node.parameters.options.timeout<=15000,'Bound request timeout');
}
const cfg=wf.nodes.find(x=>x.name==='Configure Read-only Chatwoot');
assert(cfg?.parameters.jsCode.includes('READ_ONLY_SETUP_REQUIRED'));
const pageGate=wf.nodes.find(x=>x.name==='Enumerate All Pages - Guarded');
assert(pageGate?.parameters.jsCode.includes('maximumPages'));
const tail=wf.nodes.find(x=>x.name==='Validate Pages and Report Safe Totals');
assert(tail?.parameters.jsCode.includes('crmEventWriteAuthorized:false'));
assert(!tail?.parameters.jsCode.includes('message_content'));
assert(!JSON.stringify(wf).includes('api_access_token'));
assert(!wf.nodes.some(x=>/executeCommand|postgres|mySql|webhook/i.test(x.type)));
console.log('PASS: recipient-report n8n workflow manual GET-only, paginated, no saved customer executions, no credentials or writes');
