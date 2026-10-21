'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const p=path.join(__dirname,'..','workflows','age-api-readiness-readonly.json');
const wf=JSON.parse(fs.readFileSync(p,'utf8'));
assert.equal(wf.active,false,'Readiness import must remain disabled');
assert(wf.nodes.some(n=>n.type==='n8n-nodes-base.manualTrigger'),'Manual-only workflow required');
assert(!wf.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'),'No automatic external calls');
const http=wf.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest');
assert.equal(http.length,4,'Four read-only endpoint checks expected');
for(const n of http){
 assert.equal(n.parameters.method,'GET','No HTTP writes');
 assert.equal(n.parameters.authentication,'genericCredentialType','Only n8n auth credential');
 assert.equal(n.parameters.genericAuthType,'httpHeaderAuth','Use proper per-provider Header Auth');
 assert.equal(n.credentials,undefined,'Never commit credential IDs or material');
}
for(const n of wf.nodes)assert(!/executeCommand|webhook|respondToWebhook|postgres|mySql/i.test(n.type),'Unexpected unsafe node');
const config=wf.nodes.find(n=>n.name==='Readiness Config - Fail Closed');
assert(config.parameters.jsCode.includes('READ_ONLY_SETUP_REQUIRED'),'Must fail on placeholders');
assert(config.parameters.jsCode.includes('REPLACE_ESPO_HOST'));
assert(config.parameters.jsCode.includes('REPLACE_CHATWOOT_HOST'));
assert(!/X-Api-Key\s*[:=]|api_access_token\s*[:=]/.test(JSON.stringify(wf)),'No auth tokens in workflow JSON');
console.log('PASS: diagnostic n8n workflow has only manual GET calls, fails closed, with no embedded secrets or mutation nodes');
