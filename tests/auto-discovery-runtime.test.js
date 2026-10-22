'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..','workflows');
const workflow=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const readiness=workflow('age-api-readiness-native.json'),report=workflow('age-chatwoot-recipient-report-native.json');
function run(w,name,context,now=Date.parse('2026-10-22T10:00:00Z')){
 const code=w.nodes.find(n=>n.name===name)?.parameters?.jsCode;
 if(!code)throw new Error('Code node not found: '+name);
 const FakeDate=class extends Date {static now(){return now;}};
 return vm.runInNewContext('(function(){'+code+'\n})()',{Date:FakeDate,...context},{timeout:2000});
}
const item=(json,pairedItem)=>({json,...(pairedItem===undefined?{}:{pairedItem:{item:pairedItem}})});
const espo=[item({id:'e1',name:'INTROMAHA',status:'Active',ageTrackingEnabled:true,ageProvider:'Chatwoot / Meta',ageInboxId:'5'}),
  item({id:'e2',name:'INTROGUJARAT',status:'Planned'})];
const crm=run(readiness,'Summarize CRM Inventory',{$input:{all:()=>espo}});
assert.equal(crm[0].json.espoCampaignCount,2);
assert.equal(crm[0].json.activeCount,1);
const cw=[item({id:42,title:'Maha batch',campaign_type:'one_off',campaign_status:'completed',inbox:{id:5,channel_type:'Channel::Whatsapp'}}),
 item({id:43,campaign_type:'ongoing',inbox:{id:1,channel_type:'Channel::WebWidget'}})];
const inv=run(readiness,'Summarize Cross-System Readiness',{$input:{all:()=>cw},$:()=>({first:()=>crm[0]})});
assert.equal(inv[0].json.chatwootNativeWhatsAppCount,1);assert.equal(inv[0].json.crossSystemCampaignMappingVerified,false);
const after=Date.parse('2026-10-22T10:00:00Z'),ts=Math.floor((after-86400000)/1000);
const campaigns=[
 item({id:52,title:'MAHA',campaign_type:'one_off',campaign_status:'completed',completed_at:ts,inbox:{id:5,channel_type:'Channel::Whatsapp'}}),
 item({id:53,title:'GUJ',campaign_type:'one_off',campaign_status:'completed',completed_at:ts-1,inbox:{id:5,channel_type:'Channel::Whatsapp'}}),
 item({id:54,title:'Website',campaign_type:'ongoing',campaign_status:'active',inbox:{channel_type:'Channel::WebWidget'}})
];
const selected=run(report,'Select Recent Campaigns - Rotating Batches',{$input:{all:()=>campaigns}});
assert.equal(selected.length,2);assert.equal(selected[0].json.campaignId,52);assert.equal(selected[1].json.campaignId,53);
const metrics=[item({audience:2,sent:2,delivered:1,read:0,failed:1,skipped:0},0),
 item({audience:1,sent:1,delivered:1,read:1,failed:0,skipped:0},1)];
const wrap=run(report,'Attach Campaign Context to Metrics',{$input:{all:()=>metrics},$:(name)=>({all:()=>selected})});
assert.equal(wrap.length,2);assert.equal(wrap[0].json.campaignId,52);assert.equal(wrap[1].json.failedExpected,0);
const failed=[item({contact:{id:9002,phone_number:'PRIVATE'},status:'failed',error_code:'131049'},0)];
const out=run(report,'Validate and Report Aggregate Failures',{$input:{all:()=>failed},$:()=>({all:()=>wrap})});
assert.equal(out[0].json.status,'PASS');assert.equal(out[0].json.reports.length,2);
assert.equal(out[0].json.reports[0].errorCodeCounts['131049'],1);
assert.equal(out[0].json.reports[1].counts.read,1);
assert.equal(out[0].json.crmEventWriteAuthorized,false);
assert(!JSON.stringify(out).includes('PRIVATE'));
const badMetrics=[item({error:'403 Unauthorized'},0),metrics[1]];
const wrappedBad=run(report,'Attach Campaign Context to Metrics',{$input:{all:()=>badMetrics},$:()=>({all:()=>selected})});
const blocked=run(report,'Validate and Report Aggregate Failures',{$input:{all:()=>[item({error:'403 Unauthorized'},0)]},$:()=>({all:()=>wrappedBad})});
assert.equal(blocked[0].json.status,'PARTIAL_OR_BLOCKED');
assert.equal(blocked[0].json.reports[0].status,'BLOCKED');
const zeroFailures=run(report,'Validate and Report Aggregate Failures',{$input:{all:()=>[item({})]},$:()=>({all:()=>[
 {...wrap[0],json:{...wrap[0].json,failedExpected:0}},
 wrap[1]]})});
assert.equal(zeroFailures[0].json.status,'PASS');
assert.throws(()=>run(report,'Validate and Report Aggregate Failures',{$input:{all:()=>[item({status:'failed',contact:{id:999}})]},$:()=>({all:()=>wrap})}),/RECIPIENT_CAMPAIGN_PAIRING_MISSING/);
assert.throws(()=>run(report,'Validate and Report Aggregate Failures',{$input:{all:()=>[item({status:'failed',contact:{id:9002}},0)]},$:()=>({all:()=>wrap})}),/FAILED_RECIPIENT_COUNT_MISMATCH|^$/);
const noCampaign=run(report,'Select Recent Campaigns - Rotating Batches',{$input:{all:()=>[item({id:1,campaign_type:'ongoing'})]}});
assert.equal(noCampaign[0].json.hasCampaign,false);
const older=run(report,'Select Recent Campaigns - Rotating Batches',{$input:{all:()=>[item({id:66,campaign_type:'one_off',campaign_status:'completed',completed_at:1600000000,inbox:{channel_type:'Channel::Whatsapp'}})]}});
assert.equal(older[0].json.hasCampaign,false);
const many=Array.from({length:11},(_,i)=>item({id:i+100,title:'batch',campaign_type:'one_off',campaign_status:'completed',completed_at:ts-i,inbox:{channel_type:'Channel::Whatsapp'}}));
const p0=run(report,'Select Recent Campaigns - Rotating Batches',{$input:{all:()=>many}},Date.parse('2026-10-22T00:00:00Z'));
const p1=run(report,'Select Recent Campaigns - Rotating Batches',{$input:{all:()=>many}},Date.parse('2026-10-22T06:00:00Z'));
assert(p0.length<=5 && p1.length<=5);assert.equal(p0[0].json.scanGroups,3);
assert.notEqual(p0[0].json.scanGroup,p1[0].json.scanGroup);
console.log('PASS: no-ID inventory, 5-campaign rotating window, filtered failure analytics, 403 block, zero failures, no PII, attribution checks');
