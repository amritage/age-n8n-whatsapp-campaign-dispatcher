'use strict';
const assert=require('node:assert/strict');
const {reduceDeliveryEvidence}=require('../src/delivery-evidence-core');
const base={chatwootAccountId:2,chatwootInboxId:5,verifiedSource:true};
const ev=(id,status,t,errorCode)=>({...base,messageId:'wamid.'+id,status,occurredAt:'2026-10-23T'+t+'Z',...(errorCode?{errorCode}:{})});
const reduce=events=>reduceDeliveryEvidence(events);
{
 const r=reduce([ev('A','sent','08:00:00'),ev('A','delivered','08:00:15'),ev('A','read','08:01:00')]);
 assert.equal(r.totals.deliveredIncludingRead,1);
 assert.equal(r.totals.readConfirmed,1);
 assert.equal(r.messages[0].deliveredAt,'2026-10-23T08:00:15.000Z');
 assert.equal(r.messages[0].readAt,'2026-10-23T08:01:00.000Z');
}
{
 const r=reduce([ev('A','sent','08:00:00'),ev('A','read','08:01:00')]);
 assert.equal(r.totals.deliveredIncludingRead,1);
 assert.equal(r.totals.readConfirmed,1);
 assert.equal(r.messages[0].deliveredAt,null); // Never manufacture delivery timestamp
 assert.equal(r.messages[0].deliveryProvenAt,'2026-10-23T08:01:00.000Z');
}
{
 const r=reduce([ev('A','read','08:01:00'),ev('A','read','08:01:00'),ev('A','delivered','08:00:15'),
  ev('A','delivered','08:00:15')]);
 assert.equal(r.totals.duplicateEventsSuppressed,2);
 assert.equal(r.totals.deliveredIncludingRead,1);
 assert.equal(r.totals.readConfirmed,1);
 assert.equal(r.messages[0].status,'READ');
}
{
 const r=reduce([ev('A','delivered','08:00:00'),ev('A','failed','08:02:00','131049')]);
 assert.equal(r.totals.deliveredIncludingRead,1);
 assert.equal(r.totals.failedFinal,0);
 assert.equal(r.totals.conflicts,1);
 assert(r.messages[0].failedErrors.includes('131049'));
}
{
 const r=reduce([ev('A','failed','08:00:00','131026'),ev('B','failed','08:00:00','131050'),
  ev('C','read','08:00:00'),ev('C','sent','07:50:00')]);
 assert.equal(r.totals.uniqueMessages,3);
 assert.equal(r.totals.deliveredIncludingRead,1);
 assert.equal(r.totals.readConfirmed,1);
 assert.equal(r.totals.failedFinal,2);
}
{
 const r=reduce([ev('A','read','08:00:00'),ev('B','read','08:00:00'),
  {...ev('A','read','08:00:00'),chatwootInboxId:6}]);
 assert.equal(r.totals.uniqueMessages,3);
 assert.equal(r.totals.deliveredIncludingRead,3);
}
{
 const invalid=reduce([
  {...ev('A','read','08:00:00'),verifiedSource:false},
  {...ev('B','read','08:00:00'),messageId:''},
  {...ev('C','delivered','08:00:00'),occurredAt:null},
  {...ev('D','failed','08:00:00'),status:'pending'},
  {...ev('E','read','08:00:00'),chatwootAccountId:undefined}]);
 assert.equal(invalid.totals.uniqueMessages,0);
 assert.equal(invalid.totals.invalidEvents,5);
}
assert.deepEqual(reduce([]).totals,{
 uniqueMessages:0,deliveredIncludingRead:0,readConfirmed:0,
 failedFinal:0,sentNotDelivered:0,conflicts:0,duplicateEventsSuppressed:0,invalidEvents:0
});
console.log('PASS: Read implies Delivered, no double count, correct timestamps, late events, failures, conflicts, verified IDs');
