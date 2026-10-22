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
 // Verified against Chatwoot v4.19.0 Swagger create.yml and WhatsAppCampaignFormPage.
 const params=batch.templateParams;
 if(!params||typeof params!=='object'||Array.isArray(params))throw new Error('Unverified template_params');
 const templateName=requireString(params.name,'template_params.name');
 const language=requireString(params.language,'template_params.language');
 if(!batch.approvedTemplateName||templateName!==batch.approvedTemplateName||
    !batch.approvedTemplateLanguage||language!==batch.approvedTemplateLanguage)
   throw new Error('Approved template name/language mismatch');
 if(!params.processed_params||typeof params.processed_params!=='object'||Array.isArray(params.processed_params))
   throw new Error('Missing template_params.processed_params');
 for(const key of ['body','header','buttons']){
   const v=params.processed_params[key];
   if(v!==undefined && (v===null||typeof v!=='object'||Array.isArray(v)))throw new Error('Malformed processed_params.'+key);
 }
 if(Object.keys(params).some(k=>!['name','language','processed_params'].includes(k)))
   throw new Error('Unexpected Chatwoot template_params key');
 // This validates API envelope, NOT external Meta template approval or actual variable values.
 return {campaign:{title,message,inbox_id:inboxId,scheduled_at:at.toISOString(),audience:[{type:'Label',id:labelId}],template_params:params}};
}
module.exports={readCampaign,buildChatwootCampaign};
