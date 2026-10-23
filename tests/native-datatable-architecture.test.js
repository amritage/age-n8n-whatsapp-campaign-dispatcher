'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const dir=path.join(__dirname,'../workflows');
const files=[
 'age-dt-setup-managed-tables.json','age-02-portfolio-preflight-datatable.json',
 'age-04-meta-error-watch-datatable.json','age-05-operations-dashboard-datatable.json',
 'age-06-global-cycle-dry-run-datatable.json'
];
const workflows=files.map(f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8')));
const kinds=['setup','preflight','watch','ops','cycle'];
for(let ix=0;ix<files.length;ix++){
 const w=workflows[ix];
 assert(w.id&&w.active===false);
 assert(w.nodes.some(n=>n.type==='n8n-nodes-base.manualTrigger'));
 assert(!w.nodes.some(n=>n.type==='n8n-nodes-base.httpRequest'||n.type==='n8n-nodes-base.postgres'),'No custom SQL nor HTTP');
 assert(!w.nodes.some(n=>n.credentials));
 assert.equal(w.settings.saveDataSuccessExecution,'none');
 assert.equal(w.settings.saveManualExecutions,false);
 for(const n of w.nodes){
   if(n.type==='n8n-nodes-base.dataTable'){
    assert.equal(n.typeVersion,1.1);
    if(ix===0){assert.equal(n.parameters.resource,'table');assert.equal(n.parameters.operation,'create');
      assert.equal(n.parameters.options.createIfNotExists,true);
    }else{
      assert.equal(n.parameters.resource,'row');
      assert.equal(n.parameters.operation,'get');
      assert.equal(n.parameters.returnAll,true);
      assert.equal(n.parameters.dataTableId.mode,'name');
      assert(['AGE_Portfolio_Control','AGE_Dispatcher_Events'].includes(n.parameters.dataTableId.value));
    }
   }
   if(n.type.includes('n8n-nodes-chatwoot'))assert.equal(n.parameters.operation,'getAll');
   if(n.type.includes('n8n-nodes-espocrm'))assert.equal(n.parameters.operation,'getAll');
 }
}
const t=workflows[0].nodes.filter(n=>n.type==='n8n-nodes-base.dataTable');
assert.deepEqual(t.map(n=>n.parameters.tableName),['AGE_Portfolio_Control','AGE_Dispatcher_Events']);
function run(ix,node,values,sources={}){
 const n=workflows[ix].nodes.find(x=>x.name===node);
 assert(n,'Missing '+node);
 return vm.runInNewContext('(function(){'+n.parameters.jsCode+'\n})()',{
  $input:{all:()=>values.map(json=>({json})),first:()=>({json:values[0]||{}})},
  $:name=>sources[name],Date
 },{timeout:1500});
}
let p=run(1,'Evaluate Portfolio Control - Always Hold',[{}]);
assert.equal(p[0].json.canSend,false);assert.equal(p[0].json.reason,'NO_PORTFOLIO_CONTROL_ROWS');
p=run(1,'Evaluate Portfolio Control - Always Hold',[{portfolioId:'portfolio-a',masterSendingEnabled:true,operatorLiveApproved:true,unresolvedCycle:false,externalUsageUnknown:false,messagingTier:2000,rollingReserved24h:0,externalUnique24h:0}]);
assert.equal(p[0].json.canSend,false);
assert(p[0].json.portfolios[0].holds.includes('META_LIVE_CAPACITY_NOT_INDEPENDENTLY_PROVEN'));
p=run(1,'Evaluate Portfolio Control - Always Hold',[{portfolioId:'portfolio-a'},{portfolioId:'portfolio-a'}]);
assert(p[0].json.portfolios.some(x=>x.holds.includes('MISSING_OR_DUPLICATE_PORTFOLIO_ID')));
let e=run(2,'Summarize Recorded Meta Codes - No Writes',[{errorCode:'131050',occurredAt:new Date().toISOString(),count:3}]);
assert(e[0].json.byCode.some(x=>x.policy==='MARKETING_OPT_OUT_DO_NOT_AUTO_RETRY'));
let o=run(3,'Summarize Recorded Operational State',[{state:'FAILED',count:4}],{'Data Table - Read Portfolio Control':{all:()=>[{json:{portfolioId:'portfolio-a'}}]}});
assert.equal(o[0].json.recordedStates[0].count,4);assert.equal(o[0].json.canSend,false);
let c=run(4,'Report Global DRY RUN Holds',[{portfolioId:'portfolio-a',masterSendingEnabled:true,operatorLiveApproved:true,unresolvedCycle:false,externalUsageUnknown:false}],{
 'Count Espo Campaigns':{first:()=>({json:{readable:true,count:2,activeCount:1}})},
 'Count Native Chatwoot Campaigns':{first:()=>({json:{readable:true,count:3}})}
});
assert.equal(c[0].json.mode,'DRY_RUN');assert.equal(c[0].json.canSend,false);assert.equal(c[0].json.createdCampaigns,0);
assert(c[0].json.reasons.includes('NO_PRODUCTION_SENDING_GATE'));
console.log('PASS: native n8n 2.37 Data Tables workflows, no SQL, duplicate portfolio detection, Meta 131050 classification, no live sends');
