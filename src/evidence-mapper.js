'use strict';
const {createHash}=require('node:crypto');
const FIELDS={sent:'sent_at',delivered:'delivered_at',read:'read_at',failed:'failed_at'};
function eventFromDb(row,link,type){
 if(!Object.hasOwn(FIELDS,type))throw new Error('Unsupported event status');
 if(!row||!link||!link.espoRecipientId||!link.ageAttemptId||!Number.isInteger(row.chatwoot_contact_id))throw new Error('Missing verified mapping');
 if(link.chatwootContactId!==row.chatwoot_contact_id || link.chatwootInboxId!==row.chatwoot_inbox_id || link.chatwootCampaignInternalId!==row.chatwoot_campaign_internal_id)throw new Error('Chatwoot recipient mapping mismatch');
 const messageId=row.provider_message_id_candidate;
 // A DB source_id may change semantics in future versions; keep a strong pilot verification gate.
 if(link.providerSourceIdConfirmedMetaWamid!==true || typeof messageId!=='string' || !/^wamid\.[A-Za-z0-9_.=-]+$/.test(messageId))throw new Error('Provider ID absent or unverified Meta wamid');
 const stamp=row[FIELDS[type]];
 if(typeof stamp!=='string'||!Number.isFinite(Date.parse(stamp))||!/(Z|[+-]\d\d:\d\d)$/.test(stamp))throw new Error('Missing provider timestamp '+type);
 const occurredAt=new Date(stamp).toISOString();
 const fingerprint=createHash('sha256').update([link.ageAttemptId,messageId,type,occurredAt].join('|')).digest('hex');
 const details={chatwootCampaignDisplayId:String(link.chatwootCampaignDisplayId),chatwootContactId:row.chatwoot_contact_id};
 if(type==='failed'){
   if(!row.error_code)throw new Error('Failed status missing Meta error code; human review required');
   details.errorCode=String(row.error_code);
   details.errorMessage=typeof row.error_message==='string'?row.error_message:'';
 }
 return {recipientId:link.espoRecipientId,attemptId:link.ageAttemptId,eventId:'age-chatwoot-'+fingerprint,source:'chatwoot-meta-campaign',messageId,type,occurredAt,details};
}
module.exports={eventFromDb};
