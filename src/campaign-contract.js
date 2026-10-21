'use strict';

/**
 * Convert current AGE Campaign Management v0.4.x fields into a PLAN input.
 * Only an adapter from a real API record may call this; never infer sender's WABA portfolio.
 * Existing extension does NOT have a campaign priority field; default is 0 until independently configured.
 */
function requireString(v,n){if(typeof v!=='string'||!v.trim())throw new Error('Missing '+n);return v.trim();}
function clock(v,n){if(typeof v!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(v))throw new Error('Invalid '+n);return v;}
function readCampaign(row,{portfolioId,verifiedInboxIds,defaultPriority=0}={}){
 if(!row||typeof row!=='object')throw new Error('Campaign record required');
 const id=requireString(row.id,'Campaign.id'),name=requireString(row.name,'Campaign.name');
 if(row.ageChannel!=='WhatsApp')throw new Error('Not a WhatsApp campaign');
 if(!['Chatwoot','Chatwoot / Meta','Chatwoot/Meta'].includes(row.ageProvider))throw new Error('Provider not configured for Chatwoot');
 const inboxId=requireString(row.ageInboxId,'ageInboxId');
 if(!Array.isArray(verifiedInboxIds)||!verifiedInboxIds.includes(inboxId))throw new Error('Inbox not in independently verified allowlist');
 const tz=requireString(row.ageTimeZone,'ageTimeZone');try{new Intl.DateTimeFormat('en-US',{timeZone:tz})}catch{throw new Error('Invalid timezone')}
 const start=clock(row.ageWindowStart,'ageWindowStart'),end=clock(row.ageWindowEnd,'ageWindowEnd');
 if(start>=end)throw new Error('Campaign window must be within a single day');
 const limit=row.ageDailyLimit;
 if(!Number.isSafeInteger(limit)||limit<1)throw new Error('ageDailyLimit must be configured and positive');
 const priority=defaultPriority;
 if(!Number.isSafeInteger(priority)||priority<0)throw new Error('Invalid configured priority');
 // The existing extension has no weekday multiselect. Sunday OFF controls allowed weekdays.
 const weekdays=row.ageSundayOff===true?['Mon','Tue','Wed','Thu','Fri','Sat']:row.ageSundayOff===false?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:null;
 if(!weekdays)throw new Error('Sunday sending preference unknown');
 return {
  id,name,status:row.status==='Active'&&row.ageTrackingEnabled===true?'Active':'Inactive',
  portfolioId:requireString(portfolioId,'verified WABA portfolio mapping'),
  inboxId,templateName:requireString(row.ageTemplateName,'ageTemplateName'),
  templateLanguage:requireString(row.ageTemplateLanguage,'ageTemplateLanguage'),
  timeZone:tz,windowStart:start,windowEnd:end,allowedWeekdays:weekdays,
  startDate:row.startDate||null,endDate:row.endDate||null,
  maxPerCycle:limit,priority,
  audienceSegmentIds:Array.isArray(row.ageAudienceSegmentsIds)?row.ageAudienceSegmentsIds:[row.ageAudienceSegmentId].filter(Boolean),
  templateParamsUnvalidated:row.ageParameters??null,
  recipientMinimumGapDays:row.ageMinGapDays,
 };
}
function buildChatwootCampaign(batch){
 if(!batch||!batch.authorizedAtomicReservation||!batch.memberCountVerified||!batch.templateApprovedVerified)throw new Error('Missing pre-send proof');
 const title=requireString(batch.title,'title'),message=requireString(batch.message,'message');
 const inboxId=Number(batch.inboxId),labelId=Number(batch.labelId);
 if(!Number.isSafeInteger(inboxId)||inboxId<1||!Number.isSafeInteger(labelId)||labelId<1)throw new Error('Invalid Chatwoot inbox/label');
 const at=new Date(batch.scheduledAt);
 if(!Number.isFinite(at.getTime()))throw new Error('Invalid scheduledAt');
 if(!batch.templateParams||typeof batch.templateParams!=='object'||Array.isArray(batch.templateParams)||Object.keys(batch.templateParams).length===0)throw new Error('Unverified template_params');
 // Template_params structure must be verified in staging: do not invent its shape.
 return {campaign:{title,message,inbox_id:inboxId,scheduled_at:at.toISOString(),audience:[{type:'Label',id:labelId}],template_params:batch.templateParams}};
}
module.exports={readCampaign,buildChatwootCampaign};
