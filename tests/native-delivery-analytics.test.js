'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const w=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/age-07-delivery-read-analytics-native.json'),'utf8'));
const byName=name=>w.nodes.find(n=>n.name===name);
const pg=byName('Chatwoot PostgreSQL - Read Campaign Rollups');
const validator=byName('Validate Counts and Produce Safe Analytics');
const row=(x)=>({json:x});
function evaluate(items){
 const code=validator.parameters.jsCode;
 const D=class extends Date {constructor(...a){super(...(a.length?a:['2026-10-24T10:00:00Z']));} static now(){return Date.parse('2026-10-24T10:00:00Z');}};
 return vm.runInNewContext('(function(){'+code+'\n})()',
  {$input:{all:()=>items},Date:D},{timeout:2000})[0].json;
}
const good={
 account_id:2,internal_campaign_id:99,campaign_display_id:2,campaign_name:'Synthetic demo',
 inbox_id:5,audience:'910',queued:'0',skipped:'0',sent_only:'3',
 delivered_only:'155',read_confirmed:'505',failed:'247',
 delivered_including_read:'660',provider_id_present:'910',wamid_format:'910',
 delivered_timestamps:'660',read_timestamps:'505',failure_timestamps:'247',
 coded_failures:'247',last_recipient_update:'2026-10-09T16:02:32',
 error_code_counts:{'130472':'10','131026':'134','131049':'103'}
};
assert.equal(w.active,false);
assert.equal(w.settings.saveDataSuccessExecution,'none');
assert.equal(w.settings.saveManualExecutions,false);
assert(!w.nodes.some(n=>n.credentials),'Never embed credentials');
assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.postgres').length,1);
assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.code').length,1);
assert.equal(w.nodes.filter(n=>n.type==='n8n-nodes-base.dataTable').length,0);
assert(!w.nodes.some(n=>n.type.includes('chatwoot')||n.type==='n8n-nodes-base.httpRequest'));
assert.equal(pg.parameters.operation,'executeQuery');
assert.equal(pg.continueOnFail,true);
assert(pg.parameters.query.includes('c.account_id = 2'));
assert(pg.parameters.query.includes("i.channel_type = 'Channel::Whatsapp'"));
assert(pg.parameters.query.includes('COUNT(cr.id) FILTER (WHERE cr.status = 4)'));
assert(pg.parameters.query.includes('COALESCE(e.error_code_counts'));
assert(pg.parameters.query.includes('LIMIT 201'));
assert(!/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE)\s+(?:INTO|TABLE|FROM|campaigns|campaign_recipients|public)/i.test(pg.parameters.query),
 'No write SQL');

const result=evaluate([row(good)]);
assert.equal(result.status,'SNAPSHOT_VALID');
assert.equal(result.reportCount,1);
assert.equal(result.reports[0].counts.audience,910);
assert.equal(result.reports[0].counts.deliveredIncludingRead,660);
assert.equal(result.reports[0].counts.readConfirmed,505);
assert.equal(result.reports[0].counts.deliveredOnly,155);
assert.equal(result.reports[0].counts.failed,247);
assert.equal(result.reports[0].readPctOfDelivered,76.52);
assert.equal(result.reports[0].errorCodeCounts['131049'],103);
assert.equal(result.reports[0].errorCodeCounts['131026'],134);
assert.equal(result.reports[0].errorCodeCounts['130472'],10);
assert.equal(result.reports[0].mapping,'UNMATCHED');
assert.equal(result.espocrmMappingVerified,false);
assert.equal(result.crmEventWrites,0);
assert.equal(result.dataTableWrites,0);
assert.equal(result.sends,0);
assert.equal(result.licensePermissionVerified,false);
assert(!JSON.stringify(result).includes('phone_number'));
assert(!JSON.stringify(result).includes('message_content'));

// Verified live snapshot shape: a valid populated campaign plus an empty campaign.
const emptyCampaign={...good,internal_campaign_id:1,campaign_display_id:1,campaign_name:'Empty test campaign',
 audience:'0',queued:'0',skipped:'0',sent_only:'0',delivered_only:'0',
 read_confirmed:'0',failed:'0',delivered_including_read:'0',provider_id_present:'0',wamid_format:'0',
 delivered_timestamps:'0',read_timestamps:'0',failure_timestamps:'0',coded_failures:'0',
 last_recipient_update:null,error_code_counts:{}};
const mixed=evaluate([row(good),row(emptyCampaign)]);
assert.equal(mixed.reportCount,2);
assert.equal(mixed.scanComplete,true);
assert.equal(mixed.status,'PARTIAL'); // Empty second campaign is not a SQL error.
assert.equal(mixed.reports[0].status,'SNAPSHOT_VALID');
assert.deepEqual(Array.from(mixed.reports[0].reasons),[]);
assert.equal(mixed.reports[1].status,'PARTIAL');
assert(mixed.reports[1].reasons.includes('NO_RECIPIENT_EVIDENCE'));
assert.equal(mixed.reports[0].counts.deliveredIncludingRead,660);
assert.equal(mixed.reports[0].counts.readConfirmed,505);
assert.equal(mixed.crmEventWrites,0);
assert.equal(mixed.dataTableWrites,0);

const error=evaluate([row({error:'permission denied for table campaigns'})]);
assert.equal(error.status,'BLOCKED');
assert(!JSON.stringify(error).includes('permission denied'));
const empty=evaluate([row({})]);
assert.equal(empty.status,'NO_MATCHING_CAMPAIGNS');

const missingId=evaluate([row({...good,provider_id_present:'909',wamid_format:'909'})]);
assert.equal(missingId.status,'PARTIAL');
assert(missingId.reports[0].reasons.includes('PROVIDER_IDS_INCOMPLETE'));
const noReadTime=evaluate([row({...good,read_timestamps:'504'})]);
assert.equal(noReadTime.status,'PARTIAL');
assert(noReadTime.reports[0].reasons.includes('READ_TIMESTAMPS_INCOMPLETE'));
const countMismatch=evaluate([row({...good,read_confirmed:'506'})]);
assert.equal(countMismatch.status,'BLOCKED');
assert(countMismatch.reports[0].reasons.includes('STATUS_TOTAL_MISMATCH'));
const noErrorCodes=evaluate([row({...good,coded_failures:'200',error_code_counts:{'131049':'200',UNKNOWN:'47'}})]);
assert.equal(noErrorCodes.status,'PARTIAL');
assert(noErrorCodes.reports[0].reasons.includes('MISSING_META_ERROR_CODES'));
const badErrorCounts=evaluate([row({...good,error_code_counts:{'131049':'2'}})]);
assert.equal(badErrorCounts.status,'BLOCKED');
assert(badErrorCounts.reports[0].reasons.includes('ERROR_ROLLUP_MISMATCH'));
const missingRows=evaluate([row({...good,audience:'0',delivered_only:'0',read_confirmed:'0',delivered_including_read:'0',
 sent_only:'0',failed:'0',provider_id_present:'0',wamid_format:'0',delivered_timestamps:'0',
 read_timestamps:'0',failure_timestamps:'0',coded_failures:'0',error_code_counts:{}})]);
assert.equal(missingRows.status,'PARTIAL');
assert(missingRows.reports[0].reasons.includes('NO_RECIPIENT_EVIDENCE'));

const big=evaluate(Array.from({length:201},(_,i)=>row({...good,internal_campaign_id:i+1})));
assert.equal(big.status,'PARTIAL');
assert.equal(big.scanComplete,false);
assert.equal(big.reason,'SCAN_LIMIT_201_REACHED');

console.log('PASS: AGE 07 PostgreSQL-only, disabled/no secrets/no writes, verified status unions, errors, gaps, limit and fail-closed behavior');
