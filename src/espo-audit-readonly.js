'use strict';
/**
 * Pagination-safe, GET-only AGE Campaign Management data inspection.
 * Designed against existing standard EspoCRM v7 API list response {total,list}.
 * It returns non-sensitive campaign counts, not phone numbers or CRM histories.
 * No audience-refresh job is started, and no enrollment/attempt/event POSTs.
 */
const {url,getJson}=require('./readiness-probe');
function apiPath(entity,params){
 const q=new URLSearchParams();
 for(const [key,value] of Object.entries(params||{}))q.set(key,String(value));
 return '/api/v1/'+entity+(q.size?'?'+q.toString():'');
}
async function getAll({espoUrl,apiKey,entity,maxRecords=100000,pageSize=200},fetchImpl=fetch){
 if(!apiKey)throw new Error('Missing EspoCRM API key');
 if(!/^(Campaign|CAGECampaignRecipient)$/.test(entity))throw new Error('Entity not allowlisted');
 if(!Number.isSafeInteger(pageSize)||pageSize<1||pageSize>200)throw new Error('Invalid pageSize');
 if(!Number.isSafeInteger(maxRecords)||maxRecords<1||maxRecords>100000)throw new Error('Invalid maxRecords');
 const list=[],ids=new Set();
 let offset=0,total=null;
 do{
  const data=await getJson(url(espoUrl,apiPath(entity,{offset,maxSize:pageSize,orderBy:'id',order:'asc'})),{'X-Api-Key':apiKey},fetchImpl);
  if(!data||!Array.isArray(data.list)||!Number.isSafeInteger(data.total)||data.total<0)throw new Error('Invalid EspoCRM list response');
  if(total===null)total=data.total;else if(data.total!==total)throw new Error('EspoCRM list total changed during paging; retry snapshot');
  if(total>maxRecords)throw new Error('EspoCRM result exceeds read-only audit ceiling');
  if(data.list.length>pageSize)throw new Error('Unexpectedly large page');
  if(data.list.length===0 && offset<total)throw new Error('Truncated EspoCRM page');
  for(const row of data.list){
   if(typeof row?.id!=='string'||!row.id||ids.has(row.id))throw new Error('Invalid/duplicated EspoCRM record');
   ids.add(row.id);list.push(row);
  }
  offset+=data.list.length;
  if(offset>total)throw new Error('EspoCRM paging overflow');
 }while(offset<total);
 return list;
}
async function getCampaignAudit(config,fetchImpl=fetch){
 const campaigns=await getAll({...config,entity:'Campaign'},fetchImpl);
 const recipients=await getAll({...config,entity:'CAGECampaignRecipient'},fetchImpl);
 const byCampaign=new Map(campaigns.map(c=>[c.id,{name:c.name??null,active:c.status==='Active'&&c.ageTrackingEnabled===true,queued:0,failed:0,delivered:0,read:0,other:0}]));
 let unmatched=0;
 for(const r of recipients){
  const x=byCampaign.get(r.campaignId);
  if(!x){unmatched++;continue}
  if(r.status==='Queued')x.queued++;
  else if(r.status==='Failed')x.failed++;
  else if(r.status==='Delivered')x.delivered++;
  else if(r.status==='Read')x.read++;
  else x.other++;
 }
 return{
  readOnly:true,campaignCount:campaigns.length,recipientCount:recipients.length,unmatchedRecipientCampaigns:unmatched,
  // No ID, number, name or history from each recipient. Campaign name is business metadata.
  campaigns:[...byCampaign.entries()].map(([id,x])=>({id,...x})),
  crmWriteAuthorized:false
 };
}
module.exports={apiPath,getAll,getCampaignAudit};
