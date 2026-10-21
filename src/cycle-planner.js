/**
 * AGE multi-campaign Chatwoot batch planner. Pure JavaScript, no API calls.
 * Input is a VERIFIED and already consent/suppression-filtered snapshot from the EspoCRM policy service.
 * FAIL CLOSED: ambiguous/incomplete data throws; caller must not create any Chatwoot campaign.
 * For local testing: node tests/cycle-planner.test.js
 */
'use strict';
const HOUR_MS = 3600000;
function required(condition, message) { if (!condition) throw new Error(message); }
function parseTime(value, field) {
  const time = Date.parse(value);
  required(typeof value === 'string' && Number.isFinite(time), 'Invalid '+field);
  return time;
}
function parseWindowClock(clock) {
  required(typeof clock === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(clock), 'Invalid window clock');
  const [h,m] = clock.split(':').map(Number);
  return h*60+m;
}
function localParts(nowIso, tz) {
  const d = new Date(parseTime(nowIso, 'now'));
  const parts = new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(d);
  const o = Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return {date:o.year+'-'+o.month+'-'+o.day,minute:Number(o.hour)*60+Number(o.minute),weekday:o.weekday};
}
function campaignOpen(c, nowIso) {
  required(c && typeof c.id==='string' && c.id, 'Missing campaign id');
  required(c.status==='Active', 'Planner must receive only Active campaigns');
  required(typeof c.timeZone==='string' && c.timeZone, 'Missing timezone');
  required(Array.isArray(c.allowedWeekdays) && c.allowedWeekdays.length>0, 'Missing allowed weekdays');
  const p=localParts(nowIso,c.timeZone);
  if (c.startDate && p.date<c.startDate || c.endDate && p.date>c.endDate) return false;
  if (!c.allowedWeekdays.includes(p.weekday)) return false;
  const from=parseWindowClock(c.windowStart),to=parseWindowClock(c.windowEnd);
  required(from<to,'Overnight/invalid window not supported');
  return p.minute>=from && p.minute<to;
}
function plan(input) {
  required(input && input.masterSendingEnabled===true,'Global sending not enabled');
  required(input.readiness==='VERIFIED','Integration readiness is not VERIFIED');
  const now=parseTime(input.now,'now');
  required(input.portfolio && typeof input.portfolio.id==='string','Missing portfolio');
  required(input.portfolio.usageEvidenceComplete===true,'Incomplete portfolio usage evidence');
  required(input.portfolio.unresolvedCycle===false,'Previous cycle unresolved');
  if(input.portfolio.lastVerifiedBatchCompletedAt) {
    const completed=parseTime(input.portfolio.lastVerifiedBatchCompletedAt,'lastVerifiedBatchCompletedAt');
    required(now-completed>=26*HOUR_MS, 'Global 26-hour cycle gap not elapsed');
  }
  const {tier,rollingUsed,reserved,hardCycleMax,externalUseUnknown}=input.portfolio;
  for(const [n,v] of Object.entries({tier,rollingUsed,reserved,hardCycleMax})) required(Number.isSafeInteger(v)&&v>=0,'Invalid '+n);
  required(externalUseUnknown===false,'External portfolio use unknown');
  required(tier>0 && hardCycleMax>0,'No approved sending capacity');
  const capacity=Math.min(hardCycleMax,Math.max(0,tier-rollingUsed-reserved));
  const candidates=Array.isArray(input.candidates)?input.candidates:[];
  const campaigns=new Map();
  for(const c of input.campaigns||[]) {
    if(c.status!=='Active') continue;
    required(c.portfolioId===input.portfolio.id,'Campaign portfolio mismatch');
    required(typeof c.templateName==='string'&&c.templateName && typeof c.templateLanguage==='string'&&c.templateLanguage,'Missing template');
    required(typeof c.inboxId==='string'&&c.inboxId,'Missing inbox');
    required(Number.isSafeInteger(c.priority)&&c.priority>=0,'Invalid priority');
    required(Number.isSafeInteger(c.maxPerCycle)&&c.maxPerCycle>=0,'Invalid campaign cap');
    if(campaignOpen(c,input.now)) campaigns.set(c.id,c);
  }
  const rows=[];
  for(const x of candidates){
    if(!campaigns.has(x.campaignId)) continue;
    // Policy API must prefilter; revalidate evidence per row, never assume eligibility from membership alone.
    required(typeof x.recipientId==='string'&&x.recipientId && typeof x.phoneMasterId==='string'&&x.phoneMasterId,'Missing recipient identity');
    if(x.eligibility!=='ALLOW' || x.policyEvidenceVerified!==true || x.currentAudienceMember!==true || x.isSuppressed!==false || x.inflight!==false) continue;
    required(typeof x.dueAt==='string' && Number.isFinite(Date.parse(x.dueAt)),'Missing dueAt');
    if(Date.parse(x.dueAt)>now)continue;
    rows.push({...x,priority:campaigns.get(x.campaignId).priority});
  }
  // More important campaign first; older due next; deterministic ID tie break.
  rows.sort((a,b)=>b.priority-a.priority || Date.parse(a.dueAt)-Date.parse(b.dueAt) || a.campaignId.localeCompare(b.campaignId) || a.recipientId.localeCompare(b.recipientId));
  const selected=[],usedPhones=new Set(),counts=new Map();
  for(const r of rows) {
    if(selected.length>=capacity) break;
    if(usedPhones.has(r.phoneMasterId)) continue;
    const cap=campaigns.get(r.campaignId).maxPerCycle;
    const n=counts.get(r.campaignId)||0;
    if(n>=cap)continue;
    selected.push({campaignId:r.campaignId,recipientId:r.recipientId,phoneMasterId:r.phoneMasterId,dueAt:r.dueAt});
    usedPhones.add(r.phoneMasterId);
    counts.set(r.campaignId,n+1);
  }
  return {portfolioId:input.portfolio.id,plannedAt:input.now,capacity,selected,allocation:[...counts.entries()].map(([campaignId,count])=>({campaignId,count})),requiresAtomicReserve:true};
}
module.exports={plan,campaignOpen};
