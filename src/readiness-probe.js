'use strict';

/**
 * Read-only connectivity / API entitlement smoke check.
 * No POST/PUT/PATCH/DELETE. No customer details printed.
 * Run locally: node scripts/run-readiness.js (with environment variables).
 */
const {reducePages}=require('./chatwoot-analytics');
function requiredEnv(env){
 const keys=['AGE_ESPO_URL','AGE_ESPO_API_KEY','AGE_ESPO_CAMPAIGN_ID','AGE_CHATWOOT_URL','AGE_CHATWOOT_TOKEN','AGE_CHATWOOT_ACCOUNT_ID','AGE_CHATWOOT_CAMPAIGN_ID'];
 const missing=keys.filter(k=>!env[k]);
 return {missing,ready:!missing.length};
}
function url(base,path){
 const root=new URL(base);
 if(root.protocol!=='https:' && !(root.protocol==='http:'&&['localhost','127.0.0.1'].includes(root.hostname)))throw new Error('HTTPS required for remote endpoints');
 return new URL(root.pathname.replace(/\/$/,'')+path,root.origin).toString();
}
async function getJson(urlString,headers,fetchImpl){
 const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),15000);
 try{
  const r=await fetchImpl(urlString,{method:'GET',headers,signal:ctl.signal,redirect:'error'});
  if(!r.ok){const e=new Error('HTTP_'+r.status);e.status=r.status;throw e;}
  return await r.json();
 }finally{clearTimeout(t)}
}
async function runProbe(env,fetchImpl=fetch){
 const results=[],cfg=requiredEnv(env);
 if(!cfg.ready){return {safe:true,liveSendAttempted:false,results:[{check:'configuration',status:'SKIP',reason:'Missing: '+cfg.missing.join(', ')}]};}
 const espo={ 'X-Api-Key':env.AGE_ESPO_API_KEY },cw={'api_access_token':env.AGE_CHATWOOT_TOKEN};
 const checks=[
  {name:'espo_campaign',u:url(env.AGE_ESPO_URL,'/api/v1/Campaign/'+encodeURIComponent(env.AGE_ESPO_CAMPAIGN_ID)),h:espo},
  {name:'espo_summary',u:url(env.AGE_ESPO_URL,'/api/v1/AGECampaign/summary/'+encodeURIComponent(env.AGE_ESPO_CAMPAIGN_ID)),h:espo},
  {name:'chatwoot_campaign',u:url(env.AGE_CHATWOOT_URL,'/api/v1/accounts/'+encodeURIComponent(env.AGE_CHATWOOT_ACCOUNT_ID)+'/campaigns/'+encodeURIComponent(env.AGE_CHATWOOT_CAMPAIGN_ID)),h:cw},
  {name:'chatwoot_analytics_metrics',u:url(env.AGE_CHATWOOT_URL,'/api/v1/accounts/'+encodeURIComponent(env.AGE_CHATWOOT_ACCOUNT_ID)+'/campaigns/'+encodeURIComponent(env.AGE_CHATWOOT_CAMPAIGN_ID)+'/analytics/metrics'),h:cw}
 ];
 for(const check of checks)try{
  const data=await getJson(check.u,check.h,fetchImpl);
  if(!data||typeof data!=='object')throw new Error('Invalid JSON object');
  results.push({check:check.name,status:'PASS'});
 }catch(e){results.push({check:check.name,status:'FAIL',reason:e.message});}
 const path='/api/v1/accounts/'+encodeURIComponent(env.AGE_CHATWOOT_ACCOUNT_ID)+'/campaigns/'+encodeURIComponent(env.AGE_CHATWOOT_CAMPAIGN_ID)+'/analytics/contacts?page=';
 try{
  const pages=[];let total=1;
  for(let i=1;i<=total;i++){
   if(i>10000)throw new Error('Pagination safety limit');
   const page=await getJson(url(env.AGE_CHATWOOT_URL,path+i),cw,fetchImpl);
   pages.push(page);
   if(i===1){total=page.meta?.total_pages;if(!Number.isInteger(total)||total<1)throw new Error('Invalid pagination metadata');}
  }
  const summary=reducePages(pages);
  results.push({check:'chatwoot_analytics_all_pages',status:'PASS',recipientCount:summary.recipients.length,pages:total,missingMessageEvidence:true});
 }catch(e){results.push({check:'chatwoot_analytics_all_pages',status:'FAIL',reason:e.message});}
 return {safe:true,liveSendAttempted:false,results};
}
module.exports={requiredEnv,url,getJson,runProbe};
