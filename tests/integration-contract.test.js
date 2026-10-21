'use strict';
const assert=require('node:assert/strict');
const {decision}=require('../src/retry-policy');
const {reducePages,mergeContactStatus,normalizedContact}=require('../src/chatwoot-analytics');
const {runProbe,requiredEnv}=require('../src/readiness-probe');
const D='2026-10-01T10:00:00Z';
function failure(at){return {errorCode:'131049',occurredAt:at};}
const base={consentAllowed:true,suppressed:false,audienceMember:true,externalPolicyAllowed:true,delivered:false,read:false,optedOut:false,minGapDays:7,lastMarketingAttemptAt:D};
let a=decision({...base,now:'2026-10-07T10:00:00Z',failures:[failure(D)]});
assert.equal(a.eligible,false);assert.equal(a.nextReviewAt,'2026-10-09T10:00:00.000Z');
a=decision({...base,now:'2026-10-09T10:00:00Z',failures:[failure(D)]});
assert.equal(a.eligible,true);
a=decision({...base,now:'2026-10-19T10:00:00Z',lastMarketingAttemptAt:'2026-10-09T10:00:00Z',failures:[failure(D),failure('2026-10-09T10:00:00Z')]});
assert.equal(a.eligible,true); // 18 days from INITIAL, not 18 after Oct 9
a=decision({...base,now:'2026-10-29T10:00:00Z',lastMarketingAttemptAt:'2026-10-19T10:00:00Z',failures:[failure(D),failure('2026-10-09T10:00:00Z'),failure('2026-10-19T10:00:00Z')]});
assert.equal(a.eligible,true); // Day 28
a=decision({...base,now:'2026-11-10T10:00:00Z',failures:[failure(D),failure('2026-10-09T10:00:00Z'),failure('2026-10-19T10:00:00Z'),failure('2026-10-29T10:00:00Z')]});assert.equal(a.eligible,false);
a=decision({...base,now:'2026-10-29T10:00:00Z',optedOut:true,failures:[failure(D)]});assert.equal(a.eligible,false);
a=decision({...base,now:'2026-10-29T10:00:00Z',externalPolicyAllowed:false,failures:[failure(D)]});assert.equal(a.eligible,false);
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
 console.log('PASS: 131049 D0 offsets, 180d review, consent gate, analytics pagination, safe read-only probe');
})().catch(e=>{console.error(e);process.exitCode=1;});
