'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const base=path.resolve(__dirname,'../workflows');
const files=[
'age-dt-setup-managed-tables.json',
'age-00-chatwoot-analytics-capability.json',
'age-01-espo-campaign-preflight.json',
'age-02-portfolio-preflight-datatable.json',
'age-04-meta-error-watch-datatable.json',
'age-05-operations-dashboard-datatable.json',
'age-06-global-cycle-dry-run-datatable.json'
];
const w=Object.fromEntries(files.map(file=>[file,JSON.parse(fs.readFileSync(path.join(base,file),'utf8'))]));
const unsafeOperation=/(create|send|delete|update|upsert|executeQuery)/i;
for(const [filename,workflow] of Object.entries(w)){
 assert.equal(workflow.active,false,filename+' must be inactive by default');
 assert(workflow.id && typeof workflow.id==='string');
 assert.equal(workflow.settings.saveDataSuccessExecution,'none');
 assert.equal(workflow.settings.saveDataErrorExecution,'none');
 assert.equal(workflow.settings.saveManualExecutions,false);
 const names=new Set(workflow.nodes.map(n=>n.name));
 assert.equal(names.size,workflow.nodes.length,filename+' duplicates node names');
 const start=workflow.nodes.find(n=>n.type==='n8n-nodes-base.manualTrigger');
 assert(start,filename+' requires manual execution');
 const triggerRoots=workflow.nodes.filter(n=>n.type==='n8n-nodes-base.manualTrigger'||n.type==='n8n-nodes-base.scheduleTrigger').map(n=>n.name);
 const reachable=new Set(triggerRoots),stack=[...triggerRoots];
 while(stack.length){
  const name=stack.pop(),edges=workflow.connections[name]?.main||[];
  for(const line of edges)for(const edge of line){
   assert(names.has(edge.node),filename+': missing target '+edge.node);
   if(!reachable.has(edge.node)){reachable.add(edge.node);stack.push(edge.node);}
  }
 }
 assert.equal(reachable.size,workflow.nodes.length,filename+' contains unreachable nodes');
 for(const node of workflow.nodes){
  assert(!node.credentials,filename+' must never contain exported credentials');
  assert(!['n8n-nodes-base.httpRequest','n8n-nodes-base.postgres','n8n-nodes-base.webhook','n8n-nodes-base.executeCommand'].includes(node.type),filename+' unexpected access');
  if(node.type==='n8n-nodes-base.dataTable'){
   if(filename===files[0])assert.equal(node.parameters.operation,'create');
   else {
    assert.equal(node.parameters.operation,'get');
    assert.equal(node.parameters.returnAll,false,'unbounded row scans prohibited');
    const isEvent=node.parameters.dataTableId.value==='AGE_Dispatcher_Events';
    assert.equal(node.parameters.limit,isEvent?3001:51);
    if(isEvent){
     assert.equal(node.parameters.orderBy,true);
     assert.equal(node.parameters.orderByColumn,'occurredAt');
     assert.equal(node.parameters.orderByDirection,'DESC');
    }
   }
  }
  if(node.type.includes('n8n-nodes-espocrm'))assert.equal(node.parameters.operation,'getAll');
  if(node.type.includes('n8n-nodes-chatwoot'))assert(['getAll','getMetrics'].includes(node.parameters.operation));
 }
}
const setup=w[files[0]];
assert(setup.nodes.some(n=>n.parameters.tableName==='AGE_Portfolio_Control'&&
 n.parameters.columns.column.some(c=>c.name==='priorCycleHistoryVerified'&&c.type==='boolean')));
const policy=w[files[3]].nodes.find(x=>x.name==='Evaluate Portfolio Control - Always Hold').parameters.jsCode;
const global=w[files[6]].nodes.find(x=>x.name==='Report Global DRY RUN Holds').parameters.jsCode;
for(const required of [
 'ANALYTICS_NOT_VERIFIED','ACCOUNT_HEALTH_NOT_VERIFIED','TIER_UNKNOWN_OR_STALE','QUALITY_UNKNOWN_OR_STALE',
 'EXTERNAL_USAGE_UNKNOWN_OR_STALE','UNRESOLVED_CYCLE','PRIOR_CYCLE_HISTORY_NOT_VERIFIED',
 'GLOBAL_26_HOUR_GAP_OR_INVALID_COMPLETION','RESERVATION_LEDGER_NOT_VERIFIED',
 'DATA_TABLE_IS_NOT_ATOMIC_SEND_AUTHORITY','META_LIVE_CAPACITY_NOT_INDEPENDENTLY_PROVEN'
 ]){
 assert(policy.includes(required),'Portfolio preflight missing '+required);
 assert(global.includes(required),'Global dry-run policy drift for '+required);
}
function run(source,items,references={},clock='2026-10-23T09:00:00Z'){
 const FakeDate=class extends Date {static now(){return Date.parse(clock);} };
 return vm.runInNewContext('(function(){'+source+'\n})()',{
  Date:FakeDate,
  $input:{all:()=>items.map(json=>({json}))},
  $:k=>references[k]
 },{timeout:1000});
}
const now=Date.parse('2026-10-23T09:00:00Z');
const isoDiff=h=>new Date(now-h*3600*1000).toISOString();
function row(delta=27){
 return {portfolioId:'portfolio-1',messagingTier:2000,tierVerifiedAt:isoDiff(2),
  qualityVerifiedAt:isoDiff(2),externalUsageVerifiedAt:isoDiff(2),externalUnique24h:0,
  rollingReserved24h:0,masterSendingEnabled:true,operatorLiveApproved:true,
  providerAnalyticsVerified:true,accountHealthVerified:true,
  externalUsageUnknown:false,unresolvedCycle:false,priorCycleHistoryVerified:true,
  activeCycleId:'',lastVerifiedBatchCompletedAt:isoDiff(delta)};
}
const sourceRefs={
 'Count Espo Campaigns':{first:()=>({json:{readable:true,count:2,activeCount:2}})},
 'Count Native Chatwoot Campaigns':{first:()=>({json:{readable:true,count:3}})}
};
for(const hours of [25,26,27]){
 const p=run(policy,[row(hours)])[0].json;
 const g=run(global,[row(hours)],sourceRefs)[0].json;
 const expected=hours===25;
 assert.equal(p.portfolios[0].holds.includes('GLOBAL_26_HOUR_GAP_OR_INVALID_COMPLETION'),expected);
 assert.equal(g.portfolios[0].holds.includes('GLOBAL_26_HOUR_GAP_OR_INVALID_COMPLETION'),expected);
 assert.equal(p.canSend,false);
 assert.equal(g.canSend,false);
 assert.equal(g.createdCampaigns,0);
 assert(g.reasons.includes('CAMPAIGN_WINDOW_SUNDAY_AND_MIN_GAP_NOT_VERIFIED'));
 assert(g.reasons.includes('TEMPLATE_APPROVAL_NOT_VERIFIED'));
 assert(g.reasons.includes('DAILY_DELIVERED_AND_ATTEMPT_CAP_NOT_VERIFIED'));
}
const missing=row();
delete missing.priorCycleHistoryVerified;
assert(run(policy,[missing])[0].json.portfolios[0].holds.includes('PRIOR_CYCLE_HISTORY_NOT_VERIFIED'));
assert(run(global,[missing],sourceRefs)[0].json.portfolios[0].holds.includes('PRIOR_CYCLE_HISTORY_NOT_VERIFIED'));
const stale=row();
stale.externalUsageVerifiedAt=isoDiff(30);
assert(run(policy,[stale])[0].json.portfolios[0].holds.includes('EXTERNAL_USAGE_UNKNOWN_OR_STALE'));
assert(run(global,[stale],sourceRefs)[0].json.portfolios[0].holds.includes('EXTERNAL_USAGE_UNKNOWN_OR_STALE'));
const max=Array.from({length:51},(_,i)=>({...row(),portfolioId:'portfolio-'+i}));
assert.throws(()=>run(policy,max),/PORTFOLIO_CONTROL_TOO_MANY_ROWS/);
assert(run(global,max,sourceRefs)[0].json.reasons.includes('PORTFOLIO_CONTROL_TOO_MANY_ROWS'));
const errCode=w[files[4]].nodes.find(n=>n.name==='Summarize Recorded Meta Codes - No Writes').parameters.jsCode;
const tooMany=Array.from({length:3001},()=>({errorCode:'131049',occurredAt:isoDiff(1)}));
assert.throws(()=>run(errCode,tooMany),/TOO_MANY_LIGHTWEIGHT_EVENTS_USE_ROLLUPS/);
const errors=run(errCode,[{errorCode:'131050',occurredAt:isoDiff(1),count:1}])[0].json;
assert(errors.byCode.some(x=>x.policy==='MARKETING_OPT_OUT_DO_NOT_AUTO_RETRY'));
console.log('PASS: both views - n8n graph/connectivity/bounded tables + Meta/CRM safety, exact 26h threshold, stale use, history completeness, no sends');
