'use strict';
const assert=require('node:assert/strict');
const {decision}=require('../src/retry-policy');
const {reducePages,mergeContactStatus,normalizedContact}=require('../src/chatwoot-analytics');
const {runProbe,requiredEnv}=require('../src/readiness-probe');
const D='2026-10-01T10:00:00Z';
function failure(at){return {errorCode:'131049',occurredAt:at};}
function crm(retryAt=null,allowed=true){return {recipientId:'r1',errorPolicyAllowed:allowed,retryAt};}
const base={recipientId:'r1',consentAllowed:true,suppressed:false,audienceMember:true,externalPolicyAllowed:true,delivered:false,read:false,optedOut:false,minGapDays:7,failuresCampaignScoped:true,lastMarketingAttemptAt:D,crmPolicy:crm()};
let a=decision({...base,now:'2026-10-07T10:00:00Z',failures:[failure(D)]});
assert.equal(a.eligible,false);assert.equal(a.nextReviewAt,'2026-10-09T10:00:00.000Z');
a=decision({...base,now:'2026-10-09T10:00:00Z',failures:[failure(D)]});
assert.equal(a.eligible,true);
// TEMPORARY existing extension behavior: second retry is 18 days after previous failure (D0+26).
const two=[failure(D),failure('2026-10-09T10:00:00Z')];
a=decision({...base,now:'2026-10-19T10:00:00Z',lastMarketingAttemptAt:'2026-10-09T10:00:00Z',failures:two,crmPolicy:crm('2026-10-27T10:00:00Z',false)});
assert.equal(a.eligible,false);assert.equal(a.nextReviewAt,'2026-10-27T10:00:00.000Z');
a=decision({...base,now:'2026-10-27T10:00:00Z',lastMarketingAttemptAt:'2026-10-09T10:00:00Z',failures:two});
assert.equal(a.eligible,true);
// Third retry: 28 days after second failed retry (D0+54).
const three=[...two,failure('2026-10-27T10:00:00Z')];
a=decision({...base,now:'2026-11-01T10:00:00Z',lastMarketingAttemptAt:'2026-10-27T10:00:00Z',failures:three});
assert.equal(a.eligible,false);assert.equal(a.nextReviewAt,'2026-11-24T10:00:00.000Z');
a=decision({...base,now:'2026-11-24T10:00:00Z',lastMarketingAttemptAt:'2026-10-27T10:00:00Z',failures:three});assert.equal(a.eligible,true);
a=decision({...base,now:'2026-12-30T10:00:00Z',failures:[...three,failure('2026-11-24T10:00:00Z')]});assert.equal(a.eligible,false);
a=decision({...base,now:'2026-11-24T10:00:00Z',optedOut:true,failures:[failure(D)]});assert.equal(a.eligible,false);
a=decision({...base,now:'2026-11-24T10:00:00Z',crmPolicy:crm(null,false),failures:[failure(D)]});assert.equal(a.eligible,false);
a=decision({...base,now:'2026-11-24T10:00:00Z',crmPolicy:null,failures:[failure(D)]});assert.equal(a.eligible,false);assert.equal(a.reason,'CRM_POLICY_EVIDENCE_MISSING');
a=decision({...base,now:'2026-11-24T10:00:00Z',crmPolicy:{...crm(),recipientId:'r2'},failures:[failure(D)]});assert.equal(a.eligible,false);assert.equal(a.reason,'CRM_POLICY_RECIPIENT_MISMATCH');
a=decision({...base,now:'2026-11-24T10:00:00Z',failuresCampaignScoped:false,failures:[failure(D)]});assert.equal(a.eligible,false);
a=decision({...base,now:'2026-10-21T10:00:00Z',holdDays:180,failures:[{errorCode:'131026',occurredAt:D}]});assert.equal(a.action,'REVIEW');assert.equal(a.eligible,false);
const row=(id,status)=>({contact:{id},status,error_code:status==='failed'?'131049':null});
const payload=reducePages([{payload:[row(1,'read'),row(2,'failed')],meta:{current_page:1,total_pages:2,total_count:3}},{payload:[row(3,'sent')],meta:{current_page:2,total_pages:2,total_count:3}}]);
assert.equal(payload.counts.failed,1);assert.equal(payload.deliveredInclusiveOfRead,1);assert.equal(payload.canSynchronizeCrmEvent,false);
assert.equal(mergeContactStatus(normalizedContact(row(1,'read')),normalizedContact(row(1,'failed'))).status,'read');
assert.throws(()=>reducePages([{payload:[row(1,'sent')],meta:{current_page:1,total_pages:2,total_count:2}}]),/Incomplete/);
assert.equal(requiredEnv({}).ready,false);
(async()=>{
 let calls=[];
 const vars={AGE_ESPO_URL:'https://crm.example.test',AGE_ESPO_API_KEY:'test-secret',AGE_ESPO_CAMPAIGN_ID:'espo-1',AGE_CHATWOOT_URL:'https://chat.example.test',AGE_CHATWOOT_TOKEN:'test-token',AGE_CHATWOOT_ACCOUNT_ID:'2',AGE_CHATWOOT_CAMPAIGN_ID:'42'};
 const fn=async(u,init)=>{calls.push({u,method:init.method});const data=u.includes('/analytics/contacts?page=')?{payload:[row(1,'delivered')],meta:{current_page:1,total_pages:1,total_count:1}}:{ok:true};return {ok:true,json:async()=>data};};
 const res=await runProbe(vars,fn);
 assert(res.results.every(x=>x.status==='PASS'));assert(calls.every(x=>x.method==='GET'));assert.equal(res.liveSendAttempted,false);
 const empty=await runProbe({},fn);assert.equal(empty.results[0].status,'SKIP');
 console.log('PASS: current CRM 131049 preceding-failure timing, future preference deferred; policy gates, 180d hold, analytics pages, safe GET probe');
})().catch(e=>{console.error(e);process.exitCode=1;});
