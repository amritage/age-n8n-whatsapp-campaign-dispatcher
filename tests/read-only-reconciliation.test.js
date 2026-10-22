'use strict';
const assert=require('node:assert/strict');
const {fetchCampaignAnalytics,buildRecipientStatusPreview}=require('../src/read-only-reconciliation');
const row=(id,status)=>({contact:{id,name:'PRIVATE',phone_number:'+919999999999'},status,message_content:'PRIVATE',error_code:status==='failed'?'131049':null});
function makeResponse(x){return {ok:true,json:async()=>x};}
function mockFetch({mismatch=false,empty=false,badPage=false}={}){
 const calls=[];
 async function fn(u,request){
  calls.push({url:u,method:request.method});
  if(u.endsWith('/metrics'))return makeResponse(empty?{audience:0,delivered:0,read:0,failed:0,skipped:0}:{audience:3,delivered:1,read:1,failed:mismatch?0:1,skipped:0});
  if(u.endsWith('page=1'))return makeResponse(empty?{payload:[],meta:{current_page:1,total_pages:0,total_count:0}}:{payload:[row(10,'read'),row(20,'failed')],meta:{current_page:1,total_pages:2,total_count:3}});
  if(u.endsWith('page=2'))return makeResponse({payload:[row(30,'sent')],meta:{current_page:badPage?1:2,total_pages:2,total_count:3}});
  throw Error('Unexpected URL');
 }
 return {fn,calls};
}
(async()=>{
 const cfg={chatwootUrl:'https://chat.example.test',accountId:2,campaignId:15,token:'testtoken'};
 const a=mockFetch();
 const report=await fetchCampaignAnalytics(cfg,a.fn);
 assert.equal(report.totalRecipients,3);assert.equal(report.deliveredInclusiveOfRead,1);
 assert.equal(report.totals.failed,1);assert.equal(report.crmEventWriteAuthorized,false);
 assert(!JSON.stringify(report).includes('PRIVATE'),'PII must never leave read-only adapter');
 assert(a.calls.every(c=>c.method==='GET'));
 const links=[10,20,30].map((id)=>({chatwootContactId:id,espoRecipientId:'recipient-'+id,chatwootCampaignDisplayId:15}));
 const preview=buildRecipientStatusPreview({campaignReport:report,mappings:links});
 assert.equal(preview.summary.matched,3);assert.equal(preview.summary.failed,1);
 assert.equal(preview.crmEventWriteAuthorized,false);
 assert.throws(()=>buildRecipientStatusPreview({campaignReport:report,mappings:links.slice(1)}),/incomplete/);
 const z=mockFetch({empty:true});
 const noRecipients=await fetchCampaignAnalytics(cfg,z.fn);
 assert.equal(noRecipients.totalRecipients,0);
 await assert.rejects(fetchCampaignAnalytics(cfg,mockFetch({mismatch:true}).fn),/mismatch/);
 await assert.rejects(fetchCampaignAnalytics(cfg,mockFetch({badPage:true}).fn),/Invalid\/missing page/);
 await assert.rejects(fetchCampaignAnalytics({...cfg,maxPages:1},a.fn),/excessive/);
 await assert.rejects(fetchCampaignAnalytics({...cfg,token:''},a.fn),/Missing Chatwoot token/);
 console.log('PASS: real v4.19 read-only API adapter, two-page reporting, zero-audience, inconsistent metrics, no PII or writes');
})().catch(e=>{console.error(e);process.exitCode=1;});
