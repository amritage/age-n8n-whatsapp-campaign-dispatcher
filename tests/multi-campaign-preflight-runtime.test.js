'use strict';
// Synthetic source contract checks only; no credentials, network, production writes or sends.
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const w=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/age-multi-campaign-cycle-controller.json'),'utf8'));
assert.equal(w.active,false);
assert(w.name.startsWith('[DEV ONLY - READ ONLY]'));
assert.equal(w.settings.saveManualExecutions,false);
const types=w.nodes.map(n=>n.type);
assert(types.includes('n8n-nodes-base.manualTrigger'));
assert(types.includes('n8n-nodes-base.scheduleTrigger'));
assert.equal(types.filter(x=>x==='n8n-nodes-base.httpRequest'||x==='n8n-nodes-base.postgres'||x==='n8n-nodes-base.webhook').length,0);
assert(w.nodes.every(x=>!x.credentials));
for(const n of w.nodes){
 if(n.type.includes('n8n-nodes-chatwoot')||n.type.includes('n8n-nodes-espocrm'))assert.equal(n.parameters.operation,'getAll');
 if(n.type==='n8n-nodes-base.dataTable')assert.equal(n.parameters.operation,'get');
}
const starts=w.nodes.filter(n=>/manualTrigger|scheduleTrigger/.test(n.type)).map(n=>n.name);
const reach=new Set(starts),stack=[...starts],names=new Set(w.nodes.map(n=>n.name));
while(stack.length){
 for(const links of w.connections[stack.pop()]?.main||[]){
  for(const e of links){assert(names.has(e.node),'dangling graph link');if(!reach.has(e.node)){reach.add(e.node);stack.push(e.node);}}
 }
}
assert.equal(reach.size,w.nodes.length,'all nodes reachable');
const node=w.nodes.find(n=>n.name==='Design Gate - Never Sends');
assert(node);
const payload={id:'crm-one',name:'Marketing A',ageChannel:'WhatsApp',ageProvider:'Chatwoot / Meta',
 ageTrackingEnabled:true,status:'Active',ageInboxId:'5',ageTemplateName:'age_demo',
 ageTemplateLanguage:'en',ageTimeZone:'Asia/Kolkata',ageWindowStart:'08:50',ageWindowEnd:'20:10',
 ageSundayOff:true,ageDailyLimit:200,ageMinGapDays:7};
const at='2026-10-26T06:00:00.000Z'; // Monday 11:30 India
const before=(hours)=>new Date(Date.parse(at)-hours*3600000).toISOString();
const portfolio={portfolioId:'portfolio-synthetic',masterSendingEnabled:true,
 unresolvedCycle:false,priorCycleHistoryVerified:true,
 lastVerifiedBatchCompletedAt:before(27)};
const asItems=(rows)=>({all:()=>rows.map(json=>({json}))});
function simulate({campaigns=[payload],batches=[],portfolios=[portfolio],now=at}={}){
 const FrozenDate=class extends Date {
  constructor(...args){super(...(args.length?args:[Date.parse(now)]));}
  static now(){return Date.parse(now);}
 };
 const sources={
  'EspoCRM - Read Campaign Configuration':asItems(campaigns),
  'Chatwoot - Read Native Campaigns':asItems(batches)
 };
 const output=vm.runInNewContext('(function(){\n'+node.parameters.jsCode+'\n})()',{
  Date:FrozenDate,Intl,$:key=>sources[key],$input:asItems(portfolios)
 },{timeout:2000});
 assert.equal(output.length,1);
 const r=output[0].json;
 assert.equal(r.mode,'DRY_RUN');assert.equal(r.decision,'HOLD');assert.equal(r.canSend,false);
 for(const key of ['selectedRecipients','reservationsCreated','chatwootCampaignsCreated','crmAttemptsCreated','crmEventsWritten'])assert.equal(r[key],0,key);
 return r;
}
let out=simulate({campaigns:[payload,{...payload,id:'crm-two',name:'Marketing B',ageWindowStart:'16:00'}]});
assert.equal(out.crm.relevantWhatsAppCampaigns,2);
assert.equal(out.crm.windowMatchingNow,1);
assert(out.crm.campaigns[1].reasons.includes('OUTSIDE_CAMPAIGN_WINDOW'));
assert(out.blockers.includes('ATOMIC_RESERVATION_NOT_DEPLOYED'));
out=simulate({now:'2026-10-25T06:00:00.000Z'});
assert(out.crm.campaigns[0].reasons.includes('SUNDAY_DISABLED'));
out=simulate({campaigns:[{...payload,ageTemplateName:'',id:'crm-no-template'}]});
assert(out.crm.campaigns[0].reasons.includes('TEMPLATE_NOT_CONFIGURED'));
out=simulate({campaigns:[payload,{...payload}]});
assert(out.blockers.includes('INVALID_CAMPAIGN_IDS'));
out=simulate({portfolios:[{...portfolio,lastVerifiedBatchCompletedAt:before(25)}]});
assert(out.portfolio.observations[0].holds.includes('GLOBAL_26_HOUR_GAP'));
out=simulate({portfolios:[{...portfolio,unresolvedCycle:true}]});
assert(out.portfolio.observations[0].holds.includes('UNRESOLVED_OR_UNKNOWN_CYCLE'));
out=simulate({campaigns:[{error:'403 Forbidden'}],batches:[{error:'401 Unauthorized'}],portfolios:[{error:'DATA_TABLE_DENIED'}]});
assert(out.blockers.includes('ESPOCRM_READ_ERROR'));
assert(out.blockers.includes('CHATWOOT_READ_ERROR'));
assert(out.blockers.includes('PORTFOLIO_TABLE_READ_ERROR'));
out=simulate({campaigns:[payload],batches:[{id:10,campaign_type:'one_off',campaign_status:'processing',inbox:{channel_type:'Channel::Whatsapp'}}]});
assert.equal(out.chatwoot.processingNativeWhatsApp,1);
console.log('PASS: multi-campaign preflight operates on synthetic native-node data, handles windows/Sunday/26h, fails closed and never writes');
