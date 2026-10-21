'use strict';

/**
 * Pure, auditable AGE campaign-specific retry decision.
 * 131049 retry thresholds are D0+8d, D0+18d, D0+28d from the FIRST failure.
 * This does not override any required existing AGE CRM error-policy gate.
 * Input times must be ISO-8601 with timezone; no guessing failed deliveries.
 */
const DAY=86400000;
function parse(v,name){const n=Date.parse(v);if(typeof v!=='string'||!Number.isFinite(n)||!/(Z|[+-]\d\d:\d\d)$/.test(v))throw new Error('Invalid '+name);return n;}
function iso(ms){return new Date(ms).toISOString();}
function decision(input){
 if(!input || typeof input!=='object')throw new Error('Missing retry input');
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
   const marketing=sorted.filter(f=>String(f.errorCode)==='131049');
   const original=marketing[0].time;
   const failures=marketing.length; // 1 initial + up to 3 failed retries
   if(failures>=4)return {eligible:false,reason:'131049_RETRIES_EXHAUSTED',nextReviewAt:null};
   due=original+[8,18,28][failures-1]*DAY;
   reason='131049_RETRY'; kind='RETRY';
 }else if(code==='131026'||code==='130472'){
   const hold=Number.isSafeInteger(input.holdDays)&&input.holdDays>=1?input.holdDays:180;
   due=latest.time+hold*DAY;
   reason='PROVIDER_ERROR_REVIEW';kind='REVIEW';
 }else{
   return {eligible:false,reason:'OTHER_ERROR_POLICY_REQUIRED',nextReviewAt:null};
 }
 const threshold=Math.max(due,lastAttemptAt===null?due:lastAttemptAt+minGap*DAY);
 if(now<threshold)return {eligible:false,reason:reason+'_NOT_DUE',nextReviewAt:iso(threshold),action:kind};
 if(kind==='REVIEW')return {eligible:false,reason:'REVIEW_REQUIRED_NOT_AUTO_RESEND',nextReviewAt:iso(threshold),action:'REVIEW'};
 if(input.externalPolicyAllowed!==true)return {eligible:false,reason:'EXTERNAL_CRM_POLICY_DENIED_OR_UNKNOWN',nextReviewAt:iso(threshold),action:'RETRY'};
 return {eligible:true,reason:'131049_RETRY_DUE_AND_CRM_POLICY_APPROVED',nextReviewAt:iso(threshold),action:'RETRY'};
}
module.exports={decision};
