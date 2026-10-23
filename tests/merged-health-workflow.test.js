'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const workflow=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/age-unified-six-hour-health-readonly.json'),'utf8'));
assert.equal(workflow.active,false);
assert.equal(workflow.nodes.length,9);
const nodes=workflow.nodes;
assert.deepEqual(nodes.filter(x=>x.type==='n8n-nodes-base.scheduleTrigger').map(x=>x.parameters.rule.interval[0].hoursInterval),[6]);
assert(nodes.some(x=>x.type==='n8n-nodes-base.manualTrigger'));
assert(!nodes.some(x=>x.credentials),'no credentials exported');
assert(!nodes.some(x=>x.type==='n8n-nodes-base.httpRequest'||x.type==='n8n-nodes-base.postgres'),'native only');
for(const n of nodes){
 if(n.type==='n8n-nodes-base.dataTable'){
  assert.equal(n.parameters.operation,'get');
  assert.equal(n.parameters.returnAll,false);
  assert.equal(n.parameters.limit,n.parameters.dataTableId.value==='AGE_Portfolio_Control'?51:3001);
  assert.equal(n.continueOnFail,true);
  assert.equal(n.alwaysOutputData,true);
 }
 if(n.type.includes('n8n-nodes-espocrm')||n.type.includes('n8n-nodes-chatwoot')){
  assert.equal(n.parameters.operation,'getAll');
  assert.equal(n.continueOnFail,true);
 }
}
const names=new Set(nodes.map(x=>x.name));assert.equal(names.size,nodes.length);
for(const outputs of Object.values(workflow.connections))for(const branch of outputs.main)for(const link of branch)
 assert(names.has(link.node),'bad link '+link.node);
const reaches=new Set(),stack=['Manual Trigger','Every 6 Hours (Activate Only After Pilot)'];
while(stack.length){
 const n=stack.pop();if(reaches.has(n))continue;reaches.add(n);
 for(const branch of workflow.connections[n]?.main||[])for(const e of branch)stack.push(e.node);
}
assert.equal(reaches.size,nodes.length,'all nodes reachable');
function item(json){return {json};}
function run(name,data={},source={},clock=Date.parse('2026-10-23T12:00:00Z')){
 const n=nodes.find(x=>x.name===name);assert(n,name+' exists');
 const FixedDate=class extends Date{constructor(...args){super(...args.length?args:[clock]);}static now(){return clock;}};
 return vm.runInNewContext('(function(){'+n.parameters.jsCode+'\n})()',{
  Date:FixedDate,$input:{all:()=>data.input||[],first:()=>data.input?.[0]},
  $:key=>({first:()=>item(source[key]),all:()=>source[key]})
 },{timeout:2000});
}
const now=Date.parse('2026-10-23T12:00:00Z'),beforeHours=h=>new Date(now-h*3600000).toISOString();
function allSources(controls=[],events=[],crmError=false,chatError=false){
 const crm=run('Summarize EspoCRM Campaigns',{input:crmError?[item({error:'fail'})]:[
 item({id:'c1',name:'Campaign One',status:'Active',ageProvider:'Chatwoot / Meta',ageTemplateName:'approved',ageTemplateLanguage:'en'}),
 item({id:'c2',status:'Planned'})]})[0].json;
 const chat=run('Summarize Chatwoot Campaigns',{input:chatError?[item({error:'403'})]:[
 item({id:80,campaign_type:'one_off',campaign_status:'completed',inbox:{channel_type:'Channel::Whatsapp'}}),
 item({id:81,campaign_type:'ongoing',inbox:{channel_type:'Channel::WebWidget'}})]})[0].json;
 return {crm,chat,controls,events};
}
function final(v){
 return run('Summarize All Sources - HOLD Only',{input:v.events.map(item)},{
  'Summarize EspoCRM Campaigns':v.crm,'Summarize Chatwoot Campaigns':v.chat,
  'Data Table - Read Portfolio (Max 51)':v.controls.map(item)
 })[0].json;
}
const empty=final(allSources());
assert.equal(empty.decision,'HOLD');assert.equal(empty.canSend,false);
assert(empty.blockers.includes('NO_PORTFOLIO_CONTROL_ROWS'));assert.equal(empty.events.recordedRows,0);
const rich={portfolioId:'meta-portfolio',messagingTier:2000,tierVerifiedAt:beforeHours(3),qualityVerifiedAt:beforeHours(3),
 externalUsageVerifiedAt:beforeHours(3),externalUnique24h:0,rollingReserved24h:0,masterSendingEnabled:true,operatorLiveApproved:true,
 providerAnalyticsVerified:true,accountHealthVerified:true,externalUsageUnknown:false,unresolvedCycle:false,activeCycleId:'',
 priorCycleHistoryVerified:true,lastVerifiedBatchCompletedAt:beforeHours(25)};
let x=final(allSources([rich],[{occurredAt:beforeHours(1),errorCode:'131050',count:2,state:'FAILED'},{occurredAt:beforeHours(2),errorCode:'131049',state:'FAILED'}]));
assert.equal(x.crm.activeCount,1);assert.equal(x.chatwoot.whatsAppOneOffCount,1);
assert(x.portfolio.observations[0].holds.includes('GLOBAL_26_HOUR_GAP_OR_INVALID_COMPLETION'));
assert.equal(x.events.recordedFailureCodes.find(e=>e.code==='131050').count,2);
assert(x.blockers.includes('RECORDED_MARKETING_OPTOUT_REQUIRES_SOURCE_VERIFICATION'));
assert.equal(x.createdCampaigns,0);assert.equal(x.crmEventsWritten,0);
x=final(allSources([{...rich,lastVerifiedBatchCompletedAt:beforeHours(27)}],[]));
assert(!x.portfolio.observations[0].holds.includes('GLOBAL_26_HOUR_GAP_OR_INVALID_COMPLETION'));
assert.equal(x.canSend,false,'positive-looking Data Table can never authorize sends');
x=final(allSources([{...rich,priorCycleHistoryVerified:false}],[]));
assert(x.portfolio.observations[0].holds.includes('PRIOR_CYCLE_HISTORY_NOT_VERIFIED'));
x=final(allSources([{...rich,externalUsageVerifiedAt:beforeHours(27)}],[]));
assert(x.portfolio.observations[0].holds.includes('EXTERNAL_USAGE_UNKNOWN_OR_STALE'));
x=final(allSources([],[],true,true));
assert(x.blockers.includes('ESPOCRM_API_UNAVAILABLE'));
assert(x.blockers.includes('CHATWOOT_API_UNAVAILABLE'));
x=final(allSources([item({error:'table unavailable'}).json],[{error:'events unavailable'}]));
assert(x.blockers.includes('PORTFOLIO_DATA_TABLE_UNAVAILABLE'));
assert(x.blockers.includes('EVENT_DATA_TABLE_UNAVAILABLE'));
x=final(allSources(Array.from({length:51},(_,i)=>({...rich,portfolioId:'p-'+i})),[]));
assert(x.blockers.includes('PORTFOLIO_TABLE_SCAN_LIMIT_EXCEEDED'));
x=final(allSources([],
 Array.from({length:3001},()=>({occurredAt:beforeHours(1),errorCode:'131049',count:1,state:'FAILED'}))));
assert(x.blockers.includes('EVENT_TABLE_SCAN_LIMIT_EXCEEDED'));
assert.equal(x.events.readable,false);
console.log('PASS: merged single 6-hour read-only monitor, graph, zero rows, errors, 26h, PII-safe summary, 131050, scan limits');
