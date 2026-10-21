'use strict';

/**
 * AGE temporary 131049 compatibility policy (confirmed 2026-10-21).
 * Deployed AGE Campaign Management 0.4.x source uses 8/18/28 days
 * FROM EACH PRECEDING confirmed failure, not from the first failure.
 * Thus earliest consecutive attempts are D0+8, D0+26, D0+54.
 * Owner's desired D0+8/+18/+28 stays documented for later review.
 *
 * No bypass of existing CRM /AGECampaign/retry-policy or /AGECampaign/attempt.
 * Fail closed on unknown evidence, consent, overdue provider protection.
 */
const DAY=86400000;
function parse(v,name){
  const n=Date.parse(v);
  if(typeof v!=='string'||!Number.isFinite(n)||!/(Z|[+-]\d\d:\d\d)$/.test(v))throw new Error('Invalid '+name);
  return n;
}
function iso(ms){return new Date(ms).toISOString();}
const RETRY_DAYS=[8,18,28];
function decision(input){
 if(!input||typeof input!=='object')throw new Error('Missing retry input');
 if(input.consentAllowed!==true||input.suppressed!==false||input.audienceMember!==true)return {eligible:false,reason:'ELIGIBILITY_NOT_PROVEN',nextReviewAt:null};
 if(input.delivered===true||input.read===true||input.optedOut===true)return {eligible:false,reason:'DELIVERED_OR_UNSUBSCRIBED',nextReviewAt:null};
 const now=parse(input.now,'now');
 const fails=Array.isArray(input.failures)?input.failures:[];
 if(!fails.length)return {eligible:false,reason:'NO_CONFIRMED_FAILED_ATTEMPT',nextReviewAt:null};
 const sorted=fails.map(f=>({...f,time:parse(f.occurredAt,'failure.occurredAt')})).sort((a,b)=>a.time-b.time);
 const latest=sorted[sorted.length-1],code=String(latest.errorCode||'');
 const lastAttemptAt=input.lastMarketingAttemptAt?parse(input.lastMarketingAttemptAt,'lastMarketingAttemptAt'):null;
 const minGap=Number.isSafeInteger(input.minGapDays)&&input.minGapDays>=0?input.minGapDays:7;
 let due=null,reason='',kind='';
 if(code==='131049'){
   if(input.failuresCampaignScoped!==true)return {eligible:false,reason:'CAMPAIGN_SCOPED_FAILURE_EVIDENCE_NOT_PROVEN',nextReviewAt:null};
   const marketing=sorted.filter(f=>String(f.errorCode)==='131049');
   const failures=marketing.length; // first failure + at most three subsequent failed retries in THIS campaign
   if(failures>=4)return {eligible:false,reason:'131049_RETRIES_EXHAUSTED',nextReviewAt:null};
   // TEMPORARY effective rule, exactly matching the installed extension policy calculation.
   due=latest.time+RETRY_DAYS[failures-1]*DAY;
   reason='131049_RETRY';kind='RETRY';
 }else if(code==='131026'||code==='130472'){
   const hold=Number.isSafeInteger(input.holdDays)&&input.holdDays>=1?input.holdDays:180;
   due=latest.time+hold*DAY;reason='PROVIDER_ERROR_REVIEW';kind='REVIEW';
 }else return {eligible:false,reason:'OTHER_ERROR_POLICY_REQUIRED',nextReviewAt:null};
 // CRM retry policy API remains authoritative even if local dates seem due.
 const crmPolicy=input.crmPolicy;
 if(!crmPolicy||typeof crmPolicy!=='object'||typeof crmPolicy.errorPolicyAllowed!=='boolean')
   return {eligible:false,reason:'CRM_POLICY_EVIDENCE_MISSING',nextReviewAt:null};
 if(crmPolicy.recipientId!==input.recipientId || typeof input.recipientId!=='string'||!input.recipientId)
   return {eligible:false,reason:'CRM_POLICY_RECIPIENT_MISMATCH',nextReviewAt:null};
 const crmRetryAt=crmPolicy.retryAt?parse(crmPolicy.retryAt,'crmPolicy.retryAt'):null;
 const threshold=Math.max(due,lastAttemptAt===null?due:lastAttemptAt+minGap*DAY,crmRetryAt??due);
 if(now<threshold)return {eligible:false,reason:reason+'_NOT_DUE',nextReviewAt:iso(threshold),action:kind};
 if(kind==='REVIEW')return {eligible:false,reason:'REVIEW_REQUIRED_NOT_AUTO_RESEND',nextReviewAt:iso(threshold),action:'REVIEW'};
 if(crmPolicy.errorPolicyAllowed!==true)return {eligible:false,reason:'CRM_POLICY_DENIED',nextReviewAt:crmRetryAt?iso(crmRetryAt):null,action:'RETRY'};
 if(input.externalPolicyAllowed!==true)return {eligible:false,reason:'EXTERNAL_ELIGIBILITY_DENIED_OR_UNKNOWN',nextReviewAt:iso(threshold),action:'RETRY'};
 return {eligible:true,reason:'131049_RETRY_DUE_AND_CRM_POLICY_APPROVED',nextReviewAt:iso(threshold),action:'RETRY'};
}
module.exports={decision,RETRY_DAYS};
