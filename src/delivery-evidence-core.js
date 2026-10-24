'use strict';
// Pure, side-effect-free, canonical Meta/Chatwoot message evidence reduction.
// Source-event identities are retained only in this function's return value;
// production storage, source authentication and EspoCRM mutation are separate gates.
function reduceDeliveryEvidence(events) {
 if(!Array.isArray(events))throw new Error('EVENTS_MUST_BE_ARRAY');
 const accepted=new Map(),errors=[],seen=new Set();
 let suppressedDuplicates=0;
 for(let i=0;i<events.length;i++){
  const raw=events[i];
  if(!raw||typeof raw!=='object'){errors.push({index:i,reason:'INVALID_EVENT'});continue;}
  const messageId=String(raw.messageId||'').trim(),
        status=String(raw.status||'').toLowerCase();
  const allowed=['sent','delivered','read','failed'];
  if(!/^wamid\.[A-Za-z0-9_.=-]+$/.test(messageId)){errors.push({index:i,reason:'MISSING_VERIFIED_PROVIDER_MESSAGE_ID'});continue;}
  if(!allowed.includes(status)){errors.push({index:i,reason:'INVALID_STATUS'});continue;}
  if(raw.verifiedSource!==true){errors.push({index:i,reason:'UNVERIFIED_SOURCE'});continue;}
  const at=Date.parse(raw.occurredAt);
  if(!Number.isFinite(at)||!/(Z|[+-]\d\d:\d\d)$/.test(String(raw.occurredAt||''))){
   errors.push({index:i,reason:'UNVERIFIED_PROVIDER_TIMESTAMP'});continue;
  }
  const accountId=String(raw.chatwootAccountId??'').trim(),
        inboxId=String(raw.chatwootInboxId??'').trim();
  if(!/^\d+$/.test(accountId)||!/^\d+$/.test(inboxId)){
   errors.push({index:i,reason:'MISSING_ACCOUNT_OR_INBOX'});continue;
  }
  const key=accountId+'|'+inboxId+'|'+messageId,
        err=raw.errorCode==null?null:String(raw.errorCode).trim(),
        fp=key+'|'+status+'|'+new Date(at).toISOString()+'|'+(err||'');
  if(seen.has(fp)){suppressedDuplicates++;continue;}seen.add(fp);
  if(!accepted.has(key))accepted.set(key,{
   messageId,chatwootAccountId:accountId,chatwootInboxId:inboxId,
   deliveredConfirmed:false,readConfirmed:false,failedConfirmed:false,
   sentConfirmed:false,sentAt:null,deliveredAt:null,readAt:null,failedAt:null,
   failedErrors:[],conflict:false,evidenceEvents:0
  });
  const m=accepted.get(key);m.evidenceEvents++;
  const timestamp=new Date(at).toISOString();
  const earliest=(one,two)=>one===null||two<one?two:one;
  if(status==='sent'){m.sentConfirmed=true;m.sentAt=earliest(m.sentAt,timestamp);}
  if(status==='delivered'){m.deliveredConfirmed=true;m.deliveredAt=earliest(m.deliveredAt,timestamp);}
  if(status==='read'){m.readConfirmed=true;m.deliveredConfirmed=true;m.readAt=earliest(m.readAt,timestamp);}
  if(status==='failed'){
   m.failedConfirmed=true;m.failedAt=earliest(m.failedAt,timestamp);
   if(err&&!m.failedErrors.includes(err))m.failedErrors.push(err);
  }
 }
 const messages=[...accepted.values()].map(m=>{
  m.conflict=m.failedConfirmed&&m.deliveredConfirmed;
  m.status=m.readConfirmed?'READ':m.deliveredConfirmed?'DELIVERED':m.failedConfirmed?'FAILED':m.sentConfirmed?'SENT':'UNKNOWN';
  m.deliveryProvenAt=m.deliveredAt||m.readAt||null; // not necessarily exact delivery time
  m.deliveredIncludingRead=m.deliveredConfirmed?1:0;
  m.readCount=m.readConfirmed?1:0;
  m.finalFailureCount=m.status==='FAILED'?1:0;
  return m;
 });
 const totals={uniqueMessages:messages.length,deliveredIncludingRead:0,readConfirmed:0,
  failedFinal:0,sentNotDelivered:0,conflicts:0,duplicateEventsSuppressed:suppressedDuplicates,
  invalidEvents:errors.length};
 for(const m of messages){
  totals.deliveredIncludingRead+=m.deliveredIncludingRead;
  totals.readConfirmed+=m.readCount;
  totals.failedFinal+=m.finalFailureCount;
  totals.conflicts+=m.conflict?1:0;
  totals.sentNotDelivered+=(m.status==='SENT')?1:0;
 }
 return {messages,totals,invalidEventReasons:errors};
}
if(typeof module!=='undefined' && module.exports)module.exports={reduceDeliveryEvidence};
