'use strict';
const assert=require('node:assert/strict');
const {apiPath,getCampaignAudit,getAll}=require('../src/espo-audit-readonly');
assert(apiPath('Campaign',{offset:0,maxSize:200}).includes('maxSize=200'));
function fake(){
 const calls=[];
 const pages={
  Campaign:[[{id:'c1',name:'INTROMAHA',status:'Active',ageTrackingEnabled:true}]],
  CAGECampaignRecipient:[[{id:'r1',campaignId:'c1',status:'Queued',destination:'+919999999999'},{id:'r2',campaignId:'c1',status:'Failed'},{id:'r3',campaignId:'c1',status:'Delivered'}]]
 };
 const fn=async (u,request)=>{
  calls.push({u,request});
  const parsed=new URL(u),entity=parsed.pathname.split('/').pop(),offset=Number(parsed.searchParams.get('offset'));
  const list=pages[entity]?.[0].slice(offset,offset+Number(parsed.searchParams.get('maxSize')));
  return {ok:true,json:async()=>({list,total:pages[entity][0].length})};
 };
 return {fn,calls};
}
(async()=>{
 const x=fake();
 const r=await getCampaignAudit({espoUrl:'https://crm.example.test',apiKey:'fake-key',pageSize:2},x.fn);
 assert.equal(r.campaignCount,1);assert.equal(r.recipientCount,3);
 assert.equal(r.campaigns[0].queued,1);assert.equal(r.campaigns[0].failed,1);assert.equal(r.campaigns[0].delivered,1);
 assert(!JSON.stringify(r).includes('+919999999999'),'No phone number in report');
 assert(x.calls.every(y=>y.request.method==='GET'));
 const duplicate=async()=>({ok:true,json:async()=>({list:[{id:'x'},{id:'x'}],total:2})});
 await assert.rejects(getAll({espoUrl:'https://crm.example.test',apiKey:'key',entity:'Campaign'},duplicate),/duplicated/);
 await assert.rejects(getAll({espoUrl:'https://crm.example.test',apiKey:'key',entity:'Contact'},x.fn),/allowlisted/);
 await assert.rejects(getAll({espoUrl:'https://crm.example.test',apiKey:'key',entity:'Campaign',maxRecords:1},async()=>({ok:true,json:async()=>({list:[],total:200})})),/ceiling/);
 console.log('PASS: GET-only EspoCRM pagination, duplicate guard and aggregate-only CRM audit');
})().catch(e=>{console.error(e);process.exitCode=1;});
