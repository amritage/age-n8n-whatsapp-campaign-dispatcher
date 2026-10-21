'use strict';

/**
 * Chatwoot v4.19 enterprise campaign analytics/contacts normalization.
 * API deliberately lacks source_id/Meta message ID and event timestamps.
 * No CRM event POST may be inferred solely from these statuses.
 */
const STATUSES=new Set(['queued','skipped','sent','delivered','read','failed']);
const rank={queued:0,skipped:1,sent:2,failed:3,delivered:4,read:5};
function normalizedContact(item){
  if(!item||!item.contact||!Number.isInteger(item.contact.id))throw new Error('Analytics row missing numeric contact ID');
  if(!STATUSES.has(item.status))throw new Error('Unsupported Chatwoot campaign recipient status');
  return {
    chatwootContactId:item.contact.id,
    status:item.status,
    errorCode:item.error_code===undefined||item.error_code===null?null:String(item.error_code),
    errorTitle:item.error_title||null,
    errorMessage:item.error_message||null,
    // These are NOT available in Chatwoot analytics API.
    providerMessageId:null,
    providerOccurredAt:null,
    evidenceLevel:'CHATWOOT_CAMPAIGN_ANALYTICS_ONLY',
    canPostEspoCRMEvent:false
  };
}
function mergeContactStatus(oldItem,newItem){
 if(!oldItem)return newItem;
 if(oldItem.chatwootContactId!==newItem.chatwootContactId)throw new Error('Cross-contact outcome collision');
 if(oldItem.status==='read'&&newItem.status==='failed'||oldItem.status==='delivered'&&newItem.status==='failed')return oldItem;
 if(rank[newItem.status]>=rank[oldItem.status])return newItem;
 return oldItem;
}
function reducePages(pages){
 if(!Array.isArray(pages)||!pages.length)throw new Error('No analytics pages');
 const total=pages[0]?.meta?.total_pages;
 if(!Number.isInteger(total)||total<1||pages.length!==total)throw new Error('Incomplete Chatwoot analytics pagination');
 const byContact=new Map();
 for(let i=0;i<pages.length;i++){
  const p=pages[i];
  if(!p || p.meta?.current_page!==i+1 || p.meta.total_pages!==total || !Array.isArray(p.payload))throw new Error('Invalid/missing page '+(i+1));
  for(const row of p.payload){const item=normalizedContact(row);byContact.set(item.chatwootContactId,mergeContactStatus(byContact.get(item.chatwootContactId),item));}
 }
 const declared=pages[0].meta.total_count;
 if(!Number.isInteger(declared)||declared<0||byContact.size!==declared)throw new Error('Analytics count mismatch; fail closed');
 const recipients=[...byContact.values()].sort((a,b)=>a.chatwootContactId-b.chatwootContactId);
 const counts={queued:0,skipped:0,sent:0,delivered:0,read:0,failed:0};
 for(const r of recipients)counts[r.status]++;
 return {
  recipients,
  counts,
  deliveredInclusiveOfRead:counts.delivered+counts.read,
  evidenceCompleteForEspoEvent:false,
  missingEvidence:['providerMessageId','providerOccurredAt'],
  canSynchronizeCrmEvent:false
 };
}
module.exports={normalizedContact,mergeContactStatus,reducePages};
