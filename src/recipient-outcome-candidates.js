'use strict';
// Pure adapter only. NEVER executes EspoCRM writes, never queries Chatwoot.
// Inputs: a private AGE 03 evidence page plus independently verified
// authoritative AGE attempt links. All mappings are DENY by default.
const {eventFromDb}=require('./evidence-mapper');

function positiveId(v){const s=String(v??'');return /^[1-9]\d*$/.test(s)?s:null;}
function sourceId(v){const s=String(v??'').trim();return /^wamid\.[A-Za-z0-9_.=-]+$/.test(s)?s:null;}
function mappingKey(account,campaign,contact,wamid){
 return [account,campaign,contact,wamid].join('|');
}
function prepareOutcomeCandidates(records,links){
 if(!Array.isArray(records)||!Array.isArray(links))throw new Error('ARRAYS_REQUIRED');
 if(records.length>500||links.length>5000)throw new Error('BATCH_BOUND_EXCEEDED');
 const registry=new Map(),errors=[],results=[],seenAttempts=new Set();
 for(const l of links){
  const account=positiveId(l.chatwootAccountId);
  const campaign=positiveId(l.chatwootCampaignInternalId);
  const contact=positiveId(l.chatwootContactId);
  const inbox=positiveId(l.chatwootInboxId);
  const wamid=sourceId(l.providerMessageId);
  if(!account||!campaign||!contact||!inbox||!wamid||
     !l.espoRecipientId||!l.ageAttemptId||!l.espoCampaignId||
     l.providerSourceIdConfirmedMetaWamid!==true||
     l.mappingIndependentlyVerified!==true){
    errors.push({reason:'UNVERIFIED_OR_INCOMPLETE_AUTHORITATIVE_LINK'});continue;
  }
  const key=mappingKey(account,campaign,contact,wamid);
  const attemptKey=account+'|'+l.ageAttemptId;
  if(seenAttempts.has(attemptKey)){errors.push({reason:'DUPLICATE_ATTEMPT_LINK'});continue;}
  seenAttempts.add(attemptKey);
  if(registry.has(key)){errors.push({reason:'AMBIGUOUS_RECIPIENT_LINK'});registry.set(key,null);continue;}
  registry.set(key,{...l});
 }
 for(const r of records){
  const account=positiveId(r.chatwootAccountId);
  const campaign=positiveId(r.chatwootCampaignInternalId);
  const contact=positiveId(r.chatwootContactId);
  const inbox=positiveId(r.chatwootInboxId);
  const wamid=sourceId(r.providerMessageId);
  const identity={chatwootAccountId:account,chatwootCampaignInternalId:campaign,
    chatwootContactId:contact,chatwootInboxId:inbox,
    chatwootRecipientRowId:String(r.chatwootRecipientRowId??'')};
  if(!account||!campaign||!contact||!inbox||!wamid) {
   results.push({...identity,decision:'HOLD',reason:'INVALID_OR_MISSING_PROVIDER_ID',canWrite:false,events:[]});continue;
  }
  const key=mappingKey(account,campaign,contact,wamid);
  const l=registry.get(key);
  if(!l){
   results.push({...identity,decision:'HOLD',reason:registry.has(key)?'AMBIGUOUS_LINK':'UNMATCHED',
    canWrite:false,events:[]});continue;
  }
  if(String(l.chatwootInboxId)!==inbox||
     String(l.chatwootCampaignDisplayId)!==String(r.chatwootCampaignDisplayId)||
     r.providerIdFormatValid!==true||
     r.mappingStatus!=='UNMATCHED'&&r.mappingStatus!=='VERIFIED'){
   results.push({...identity,decision:'HOLD',reason:'CONFLICTING_MAPPING_OR_EVIDENCE',
    canWrite:false,events:[]});continue;
  }
  // Real event origin and ownership still require approval by an authoritative
  // mapping service. Never infer these facts from a phone number or contact name.
  const row={
   chatwoot_contact_id:Number(contact),chatwoot_inbox_id:Number(inbox),
   chatwoot_campaign_internal_id:Number(campaign),provider_message_id_candidate:wamid,
   sent_at:r.timestamps?.sent,delivered_at:r.timestamps?.delivered,
   read_at:r.timestamps?.read,failed_at:r.timestamps?.failed,
   error_code:r.errorCode,error_message:r.errorMessage
  };
  const link={chatwootContactId:Number(contact),chatwootInboxId:Number(inbox),
   chatwootCampaignInternalId:Number(campaign),chatwootCampaignDisplayId:r.chatwootCampaignDisplayId,
   espoRecipientId:l.espoRecipientId,ageAttemptId:l.ageAttemptId,
   providerSourceIdConfirmedMetaWamid:true};
  const kind=String(r.status||'').toUpperCase();
  let types=[];
  if(kind==='SENT')types=['sent'];
  if(kind==='DELIVERED')types=['delivered'];
  if(kind==='READ')types=r.timestamps?.delivered?['delivered','read']:['read'];
  if(kind==='FAILED')types=['failed'];
  if(!types.length){results.push({...identity,decision:'HOLD',reason:'NOT_AN_OUTCOME',
    canWrite:false,events:[]});continue;}
  try {
   const events=types.map(t=>eventFromDb(row,link,t));
   // Even verified in-memory candidate events are NOT authorized CRM writes:
   // full EspoCRM API contract, attempt ledger and idempotency not deployed.
   results.push({...identity,decision:'CANDIDATES_PREPARED',reason:'WRITE_ADAPTER_DISABLED',
     espoCampaignId:l.espoCampaignId,espoRecipientId:l.espoRecipientId,
     ageAttemptId:l.ageAttemptId,canWrite:false,events});
  }catch(e){
   results.push({...identity,decision:'HOLD',reason:'MISSING_OR_INVALID_EVENT_EVIDENCE',
     canWrite:false,events:[]});
  }
 }
 return {mode:'READ_ONLY',totalRecords:records.length,prepared:results.filter(r=>r.decision==='CANDIDATES_PREPARED').length,
  held:results.filter(r=>r.decision!=='CANDIDATES_PREPARED').length,
  invalidLinks:errors.length,linkErrors:errors,results,
  espocrmWrites:0,durableLedgerWritten:false,idempotencyWriteGateVerified:false};
}
module.exports={prepareOutcomeCandidates};
