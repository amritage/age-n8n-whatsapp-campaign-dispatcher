'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const w=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/age-07-delivery-read-analytics-native.json'),'utf8'));
const node=name=>w.nodes.find(n=>n.name===name);
function run(name,inputs={},ref={},now=Date.parse('2026-10-24T06:00:00Z')){
 const c=node(name)?.parameters?.jsCode;assert(c,'Missing code '+name);
 const Fixed=class extends Date{constructor(...args){super(...args.length?args:[now]);}static now(){return now;}};
 return vm.runInNewContext('(function(){'+c+'\n})()',{
  $input:{all:()=>inputs.items||[],first:()=>(inputs.items||[])[0]},
  $:key=>({all:()=>ref[key]||[],first:()=>(ref[key]||[])[0]}),
  Date:Fixed
 },{timeout:2500});
}
const it=(json,p)=>({json,...(p===undefined?{}:{pairedItem:{item:p}})});
assert.equal(w.active,false);
assert.equal(w.settings.saveDataSuccessExecution,'none');
assert.equal(w.settings.saveManualExecutions,false);
assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.postgres'||n.type==='n8n-nodes-base.httpRequest'));
assert(!w.nodes.some(n=>n.credentials));
for(const n of w.nodes.filter(x=>x.type.includes('n8n-nodes-chatwoot'))){
 assert(['getAll','getMetrics','getRecipients'].includes(n.parameters.operation));
 assert.equal(n.continueOnFail,true);
}
assert.equal(node('Chatwoot - Get Failed Recipients').parameters.options.status,'failed');
assert.equal(node('Chatwoot - Get Failed Recipients').parameters.returnAll,true);
const p='Select Recent Campaigns - Rotating Batches',a='Attach Campaign Context to Metrics',f='Validate and Report Aggregate Failures';
let empty=run(p,{items:[]});assert.equal(empty[0].json.hasCampaign,false);
let unavailable=run(p,{items:[it({error:'403'})]});assert.equal(unavailable[0].json.availability,'BLOCKED');
const campaigns=[it({id:52,title:'W Bengal batch',campaign_type:'one_off',campaign_status:'completed',
 completed_at:1792800000,inbox:{channel_type:'Channel::Whatsapp'}}),
it({id:53,campaign_type:'one_off',campaign_status:'processing',started_at:1792800001,inbox:{channel_type:'Channel::Whatsapp'}}),
it({id:61,campaign_type:'ongoing',campaign_status:'active',inbox:{channel_type:'Channel::WebWidget'}})];
const selected=run(p,{items:campaigns});
assert.equal(selected.length,2);
assert.equal(selected[0].json.campaignId,53);
const good={
 audience:5,sent:4,delivered:3,read:2,failed:1,skipped:1,
 status_counts:{queued:0,skipped:1,sent:0,delivered:1,read:2,failed:1}
};
// 0+1+0+1+2+1 = 5
const metrics=[it(good,0),it({audience:1,sent:1,delivered:1,read:1,failed:0,skipped:0,
 status_counts:{queued:0,skipped:0,sent:0,delivered:0,read:1,failed:0}},1)];
const ctx=run(a,{items:metrics},{[p]:selected});
assert.equal(ctx.length,2);
assert.equal(ctx[0].json.counts.deliveredIncludingRead,3);
assert.equal(ctx[0].json.counts.readConfirmed,2);
assert.equal(ctx[0].json.counts.deliveredWithoutRead,1);
const out=run(f,{items:[it({contact:{id:8088},status:'failed',error_code:'131049'},0)]},{[a]:ctx})[0].json;
assert.equal(out.status,'AGGREGATES_ONLY');assert.equal(out.reports.length,2);
assert.equal(out.reports[0].errorCodeCounts['131049'],1);
assert.equal(out.reports[1].counts.readConfirmed,1);
assert.equal(out.reports[1].counts.deliveredIncludingRead,1); // READ already counted in delivery
assert.equal(out.espocrmWrites,0);
assert.equal(out.reports[0].canWriteEspoEvents,false);
assert(!JSON.stringify(out).includes('phone_number'));
let mismatch=run(f,{items:[]},{[a]:ctx})[0].json;
assert.equal(mismatch.status,'PARTIAL_OR_BLOCKED');
assert(mismatch.reports[0].reasons.includes('FAILURE_COUNT_MISMATCH'));
assert.throws(()=>run(a,{items:[it({...good,delivered:5},0),metrics[1]]},{[p]:selected}),/CHATWOOT_DELIVERED_READ_COUNT_MISMATCH/);
assert.throws(()=>run(a,{items:[it(good),metrics[1]]},{[p]:selected}),/PROVIDER_METRICS_PAIRING_MISSING/);
const access=run(a,{items:[it({error:'Forbidden',httpCode:'403'},0),metrics[1]]},{[p]:selected});
const denied=run(f,{items:[it({error:'Forbidden'},0)]},{[a]:access})[0].json;
assert.equal(denied.status,'PARTIAL_OR_BLOCKED');
assert(denied.reports[0].reasons.includes('ANALYTICS_UNAVAILABLE'));
const noReport=run('No Reportable Campaigns',{items:unavailable})[0].json;assert.equal(noReport.status,'BLOCKED');
const all=Array.from({length:70},(_,i)=>it({id:100+i,campaign_type:'one_off',campaign_status:i<5?'processing':'completed',
 started_at:1792800000+i,completed_at:i<5?null:1792800000+i,inbox:{channel_type:'Channel::Whatsapp'}}));
let batched=run(p,{items:all});assert(batched.length<=5);
assert(batched[0].json.scan.partialScan);
assert.equal(batched[0].json.scan.totalActive,5);
console.log('PASS: auto-discovery, bounded rotating batches, Chatwoot v4.19 Read-in-delivered union, failure code attribution and 403/missing evidence blocking');
