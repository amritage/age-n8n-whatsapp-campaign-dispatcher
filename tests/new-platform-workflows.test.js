'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),vm=require('node:vm');
const dir=path.resolve(__dirname,'../workflows');
const names=[
 'age-00-chatwoot-analytics-capability.json',
 'age-01-espo-campaign-preflight.json',
 'age-02-postgres-portfolio-preflight.json',
 'age-03-chatwoot-evidence-readonly.json',
 'age-04-meta-error-watch.json',
 'age-05-operations-dashboard.json',
 'age-06-global-cycle-dry-run.json'
];
const files=names.map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
for(const w of files){
 assert.equal(w.active,false,'must import inactive');
 assert(w.nodes.some(n=>n.type==='n8n-nodes-base.manualTrigger'),'manual trigger required');
 assert(w.nodes.some(n=>n.type==='n8n-nodes-base.scheduleTrigger'),'schedule future support');
 assert.equal(w.settings.saveDataSuccessExecution,'none');
 assert.equal(w.settings.saveManualExecutions,false);
 assert.equal(w.settings.saveDataErrorExecution,'none');
 assert(w.settings.executionTimeout<=600);
 assert(!w.nodes.some(n=>n.credentials),'credentials must only be set in n8n');
 assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.httpRequest'),'native nodes preferred');
 assert(!w.nodes.some(n=>/postgresTrigger|webhook|executeCommand/.test(n.type)),'no hidden writes or webhooks');
 for(const n of w.nodes){
  if(n.type==='n8n-nodes-base.postgres'){
   assert.equal(n.parameters.operation,'executeQuery');
   let sql=n.parameters.query.trim();
   assert(/^(--[^\n]*\n)*\s*(SELECT|WITH)\b/i.test(sql),'read-only SELECT only');
   assert(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE)\b(?![^\n]*?--)/i.test(sql.replace(/--[^\n]*/g,'')),
     'no database writes in workflows');
  }
  if(n.type.includes('n8n-nodes-chatwoot.chatwoot'))
   assert(['getAll','getMetrics'].includes(n.parameters.operation),'Chatwoot no sends');
  if(n.type.includes('n8n-nodes-espocrm.espoCrm'))
   assert.equal(n.parameters.operation,'getAll','EspoCRM no mutations');
 }
 assert(!JSON.stringify(w).includes('REPLACE_CHATWOOT_CAMPAIGN_DISPLAY_ID'));
 assert(!JSON.stringify(w).includes('REPLACE_ESPO_CAMPAIGN_ID'));
}
function run(file,nodeName,items,sources={}){
 const n=files[file].nodes.find(x=>x.name===nodeName);
 assert(n, nodeName+' absent');
 return vm.runInNewContext('(function(){'+n.parameters.jsCode+'\n})()',
  {$input:{all:()=>items.map(json=>({json})),first:()=>({json:items[0]||{}})},
   $:(key)=>sources[key],Date},{timeout:1000});
}
let v=run(0,'Choose Existing Native WhatsApp Campaign',[]);
assert.equal(v[0].json.found,false);
v=run(0,'Choose Existing Native WhatsApp Campaign',[
 {id:101,campaign_type:'ongoing',inbox:{channel_type:'Channel::WebWidget'}},
 {id:7,campaign_type:'one_off',campaign_status:'completed',inbox:{channel_type:'Channel::Whatsapp'}}]);
assert.equal(v[0].json.campaignId,7);
let metrics=run(0,'Report Analytics Entitlement',[{error:'403 Forbidden',httpCode:'403'}]);
assert.equal(metrics[0].json.result,'BLOCKED');
let crm=run(1,'Inspect Campaign Gates Without Sending',[{id:'c1',status:'Active',masterSendingEnabled:true,ageProvider:'Chatwoot / Meta',ageTemplateName:'approved',ageTemplateLanguage:'en'}]);
assert.equal(crm[0].json.activeCount,1);
assert.equal(crm[0].json.canSend,false);
assert(crm[0].json.preview[0].reasons.includes('RECIPIENT_POLICY_NOT_EVALUATED'));
let ledger=run(2,'Explain Global Capacity Holds',[{portfolio_id:'portfolio-1',reason:'EXTERNAL_USAGE_UNKNOWN_OR_STALE',conservative_headroom:0}]);
assert.equal(ledger[0].json.canSend,false);
assert.equal(ledger[0].json.portfolios[0].reason,'EXTERNAL_USAGE_UNKNOWN_OR_STALE');
let err=run(4,'Classify Meta Errors Without Mutation',[{error_code:'131050',occurrences:2,last_seen:'2026-10-23T00:00:00Z'},{error_code:'131026',occurrences:1}]);
assert.equal(err[0].json.marketingOptouts,2);
assert(err[0].json.errors.some(x=>x.classification==='UNDELIVERABLE_UNKNOWN_DO_NOT_MARK_UNREGISTERED'));
let dash=run(5,'Summarize Ledger Counters',[{portfolios:0,cycles:[],batches:[],recipients:[],ready_for_other_checks:0}]);
assert.equal(dash[0].json.canSend,false);
let cycle=run(6,'Explain Cycle Decision - Never Dispatch',[
 {portfolio_id:'portfolio-one',reason:'TIER_UNKNOWN_OR_STALE',conservative_headroom:0}
],{
 'Count Espo Campaigns Without Eligibility Claims':{
   first(){return {json:{crmReadable:true,campaignCount:3,activeCount:2,chatwootConfiguredCount:2}};}
 },
 'Count Provider Batches Without Joining Names':{
   first(){return {json:{chatwootReadable:true,counts:{total:1,oneOffWhatsApp:1,processing:1,completed:0}}};}
 }
});
assert.equal(cycle[0].json.canSend,false);
assert.equal(cycle[0].json.decision,'HOLD');
assert(cycle[0].json.reasons.includes('portfolio-one:TIER_UNKNOWN_OR_STALE'));
assert.equal(cycle[0].json.createdCampaigns,0);

console.log('PASS: seven new read-only workflow contracts; safe global cycle DRY_RUN, Meta opt-out, unavailable analytics, capacity and no-live gates');
