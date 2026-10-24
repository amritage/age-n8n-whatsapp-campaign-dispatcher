'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const wf=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../workflows/age-03-chatwoot-evidence-readonly.json'),'utf8'));
const config=wf.nodes.find(n=>n.name==='Configure Account and Keyset Cursor');
const db=wf.nodes.find(n=>n.name==='Chatwoot PostgreSQL - Read Recipient Page');
const validator=wf.nodes.find(n=>n.name==='Validate Recipient Evidence and Report Unmatched');
assert.equal(wf.active,false);
assert.equal(wf.settings.saveManualExecutions,false);
assert.equal(wf.settings.saveDataSuccessExecution,'none');
assert(!wf.nodes.some(n=>n.credentials),'No secrets embedded');
assert(!wf.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'||n.type==='n8n-nodes-base.httpRequest'||n.type==='n8n-nodes-base.dataTable'));
assert.equal(wf.nodes.filter(n=>n.type==='n8n-nodes-base.postgres').length,1);
assert.equal(db.typeVersion,2.5,'Use parameter array support in n8n v2.44');
assert.equal(db.parameters.operation,'executeQuery');
assert.equal(db.continueOnFail,true);
assert(db.parameters.options.queryReplacement.includes('$json.afterUpdatedAt'));
assert(db.parameters.query.includes('cr.updated_at,cr.id'));
assert(db.parameters.query.includes('ct.phone_number'));
assert(db.parameters.query.includes("i.channel_type='Channel::Whatsapp'"));
assert(db.parameters.query.includes('LIMIT ($4::integer+1)'));
assert(!/\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\s+(?:INTO|FROM|TABLE|DATABASE)/i.test(db.parameters.query));
const run=(items,params)=>{
 const ctx={$input:{all:()=>items.map(json=>({json}))},
   $:name=>{assert.equal(name,'Configure Account and Keyset Cursor');return{first:()=>({json:params})}},
   Date};
 return vm.runInNewContext('(function(){'+validator.parameters.jsCode+'\n})()',ctx,{timeout:1500})[0].json;
};
const settings=vm.runInNewContext('(function(){'+config.parameters.jsCode+'\n})()',{Date},{timeout:1500})[0].json;
assert.equal(settings.chatwootAccountId,2);
assert.equal(settings.pageSize,250);
assert.equal(settings.afterRowId,'0');
const fixture=(id,overrides={})=>({
 account_id:'2',internal_campaign_id:'2',campaign_display_id:2,
 campaign_name:'Synthetic Campaign',inbox_id:'5',recipient_row_id:String(id),
 contact_id:String(id+1000),contact_inbox_id:null,
 current_mobile_number:'+91 90000 00000',
 provider_message_id:'wamid.Synthetic123='+id,
 message_status:4,sent_at:'2026-09-04T05:52:59Z',
 delivered_at:'2026-09-04T05:53:02Z',read_at:'2026-09-04T05:54:55Z',
 failed_at:null,error_code:null,error_title:null,error_message:null,
 recipient_updated_at:'2026-10-09T10:32:32Z',...overrides
});
let data=run([fixture(1),fixture(2,{message_status:5,read_at:null,delivered_at:null,
 failed_at:'2026-09-04T05:54:00Z',error_code:'131026'})],settings);
assert.equal(data.status,'PAGE_READ');
assert.equal(data.pageRecordCount,2);
assert.equal(data.hasMore,false);
assert.equal(data.records[0].status,'READ');
assert.equal(data.records[0].deliveredConfirmed,true);
assert.equal(data.records[0].readConfirmed,true);
assert.equal(data.records[0].currentMobileDigits,'919000000000');
assert.equal(data.records[1].status,'FAILED');
assert.equal(data.records[1].errorCode,'131026');
assert.equal(data.records[1].warnings.length,0,'Valid wamid with later failure is normal');
assert.equal(data.records[1].mappingStatus,'UNMATCHED');
assert.equal(data.records[0].canWriteEspocrm,false);
assert.equal(data.sends,0);assert.equal(data.espocrmWrites,0);assert.equal(data.dataTableWrites,0);
assert(!data.fullAttemptHistory);
let partial=run([fixture(1,{provider_message_id:'',current_mobile_number:''})],settings);
assert.equal(partial.status,'PARTIAL_EVIDENCE');
assert(partial.records[0].warnings.includes('MISSING_OR_INVALID_WAMID_FORMAT'));
assert(partial.records[0].warnings.includes('MISSING_CURRENT_MOBILE'));
assert.equal(partial.records[0].canWriteEspocrm,false);
const readWithoutDeliveredTimestamp=run([fixture(1,{delivered_at:null,read_at:'2026-09-04T05:54:55Z'})],settings);
assert.equal(readWithoutDeliveredTimestamp.status,'PAGE_READ','Read proves delivery despite absent delivered_at');
assert.equal(readWithoutDeliveredTimestamp.records[0].deliveredConfirmed,true);
assert.equal(readWithoutDeliveredTimestamp.records[0].timestamps.delivered,null);

const mismatch=run([fixture(1,{account_id:'3'})],settings);
assert.equal(mismatch.status,'BLOCKED');assert.equal(mismatch.reason,'ACCOUNT_MISMATCH');
const invalid=run([fixture(1,{message_status:20})],settings);
assert.equal(invalid.status,'BLOCKED');
const duplicated=run([fixture(1),fixture(1)],settings);
assert.equal(duplicated.status,'BLOCKED');
const err=run([{error:{message:'permission denied for table contacts'}}],settings);
assert.equal(err.status,'BLOCKED');assert.equal(err.records.length,0);
const empty=run([{}],settings);
assert.equal(empty.pageRecordCount,0);assert.equal(empty.hasMore,false);
const page=run(Array.from({length:251},(_,i)=>fixture(i+1,{recipient_updated_at:'2026-10-09T10:32:32Z'})),settings);
assert.equal(page.pageRecordCount,250);
assert.equal(page.hasMore,true);
assert.equal(page.nextCursor.rowId,'250');
assert.equal(page.nextCursor.updatedAt,'2026-10-09T10:32:32.000Z');
assert.equal(page.records.length,250);
assert(!page.records.some(x=>x.espocrmAttemptId));
console.log('PASS: AGE 03 manual parameterized recipient page, wamid/read/error, unmatched-only, paging and fail-closed behavior');
