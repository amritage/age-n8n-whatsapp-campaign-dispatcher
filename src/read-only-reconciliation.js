'use strict';
/**
 * Executable READ-ONLY API adapter for Chatwoot v4.19 campaign analytics.
 * No POST/PUT/PATCH/DELETE. Never log or export phone numbers or message content.
 * Recipients remain in memory; only aggregate and opaque-ID projections leave this module.
 * Chatwoot 4.19 returns 25 per page. Kaminari may report total_pages=0 for an empty campaign.
 */
const {url,getJson}=require('./readiness-probe');
const {reducePages}=require('./chatwoot-analytics');
function id(value,name){
 const text=String(value??'');
 if(!/^[0-9]+$/.test(text)||Number(text)<1)throw new Error('Invalid '+name);
 return text;
}
async function fetchCampaignAnalytics({chatwootUrl,accountId,campaignId,token,maxPages=1000},fetchImpl=fetch){
 if(!token||typeof token!=='string')throw new Error('Missing Chatwoot token');
 if(!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>10000)throw new Error('Invalid maximum page count');
 const base='/api/v1/accounts/'+id(accountId,'accountId')+'/campaigns/'+id(campaignId,'campaignId')+'/analytics';
 const h={api_access_token:token};
 const metrics=await getJson(url(chatwootUrl,base+'/metrics'),h,fetchImpl);
 const first=await getJson(url(chatwootUrl,base+'/contacts?page=1'),h,fetchImpl);
 const pages=[first];
 const declared=first?.meta?.total_pages;
 if(!Number.isInteger(declared)||declared<0||declared>maxPages)throw new Error('Invalid/excessive analytics total_pages');
 if(declared===0 && (first?.meta?.total_count!==0||first?.payload?.length!==0))throw new Error('Contradictory empty analytics metadata');
 for(let page=2;page<=declared;page++){
  const item=await getJson(url(chatwootUrl,base+'/contacts?page='+page),h,fetchImpl);
  pages.push(item);
 }
 const report=reducePages(pages);
 if(!Number.isSafeInteger(metrics?.audience)||metrics.audience!==report.recipients.length)
  throw new Error('Campaign metrics / recipient count mismatch, must reconcile');
 const totals={queued:report.counts.queued,skipped:report.counts.skipped,sent:report.counts.sent,delivered:report.counts.delivered,read:report.counts.read,failed:report.counts.failed};
 const expected={
  delivered:totals.delivered+totals.read,read:totals.read,failed:totals.failed,skipped:totals.skipped
 };
 for(const [k,v] of Object.entries(expected)){
  if(!Number.isSafeInteger(metrics?.[k])||metrics[k]!==v)throw new Error('Metrics/contacts mismatch for '+k);
 }
 return {
  checkedAt:new Date().toISOString(),chatwootAccountId:Number(accountId),chatwootCampaignDisplayId:Number(campaignId),
  pagesFetched:declared===0?1:declared,
  totalRecipients:report.recipients.length,
  totals,
  deliveredInclusiveOfRead:report.deliveredInclusiveOfRead,
  // Opaque Chatwoot IDs and statuses only. Never persist to public GitHub reports.
  recipientRows:report.recipients,
  evidenceLevel:'CHATWOOT_ANALYTICS_NO_META_ID_OR_TIMESTAMPS',
  crmEventWriteAuthorized:false
 };
}
function buildRecipientStatusPreview({campaignReport,mappings}){
 if(!campaignReport||!Array.isArray(campaignReport.recipientRows)||!Array.isArray(mappings))throw new Error('Missing report/mapping');
 const byContact=new Map();
 for(const m of mappings){
  if(!Number.isSafeInteger(m.chatwootContactId)||typeof m.espoRecipientId!=='string'||!m.espoRecipientId||m.chatwootCampaignDisplayId!==campaignReport.chatwootCampaignDisplayId)
   throw new Error('Invalid campaign/recipient mapping');
  if(byContact.has(m.chatwootContactId))throw new Error('Duplicate Chatwoot contact mapping');
  byContact.set(m.chatwootContactId,m);
 }
 const seen=new Set(),items=[],summary={matched:0,unmatched:0,failed:0,deliveredOrRead:0,queued:0,sent:0,skipped:0};
 for(const r of campaignReport.recipientRows){
  const link=byContact.get(r.chatwootContactId);
  if(!link){summary.unmatched++;continue;}
  if(seen.has(link.espoRecipientId))throw new Error('Two Chatwoot contacts map to same EspoCRM recipient');
  seen.add(link.espoRecipientId);summary.matched++;
  if(r.status==='failed')summary.failed++;
  if(r.status==='read'||r.status==='delivered')summary.deliveredOrRead++;
  if(['queued','sent','skipped'].includes(r.status))summary[r.status]++;
  items.push({espoRecipientId:link.espoRecipientId,chatwootContactId:r.chatwootContactId,status:r.status,errorCode:r.errorCode,source:r.evidenceLevel,writeCrmEvent:false});
 }
 // Recipient mappings not present in analytics are inconsistent. Do not mark them unsent.
 const missingExpected=mappings.filter(m=>!seen.has(m.espoRecipientId)).length;
 if(summary.unmatched||missingExpected)throw new Error('Recipient mapping incomplete; unmatched='+summary.unmatched+' missingExpected='+missingExpected);
 return {summary,items,crmEventWriteAuthorized:false};
}
module.exports={fetchCampaignAnalytics,buildRecipientStatusPreview};
