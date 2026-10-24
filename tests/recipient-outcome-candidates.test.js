'use strict';
const assert=require('node:assert/strict');
const {prepareOutcomeCandidates}=require('../src/recipient-outcome-candidates');
const read={chatwootAccountId:'2',chatwootCampaignInternalId:'2',chatwootCampaignDisplayId:2,
 chatwootContactId:'12',chatwootInboxId:'5',chatwootRecipientRowId:'110',
 providerMessageId:'wamid.synthetic1',providerIdFormatValid:true,mappingStatus:'UNMATCHED',
 status:'READ',timestamps:{sent:'2026-09-04T05:52:59.000Z',
 delivered:'2026-09-04T05:53:02.000Z',read:'2026-09-04T05:54:55.000Z'},
 errorCode:null,errorMessage:null};
const verified={chatwootAccountId:'2',chatwootCampaignInternalId:'2',
 chatwootCampaignDisplayId:2,chatwootContactId:'12',chatwootInboxId:'5',
 providerMessageId:'wamid.synthetic1',espoCampaignId:'c-synthetic',
 espoRecipientId:'r-synthetic',ageAttemptId:'a-synthetic',
 mappingIndependentlyVerified:true,providerSourceIdConfirmedMetaWamid:true};
const noMatch=prepareOutcomeCandidates([read],[]);
assert.equal(noMatch.held,1);
assert.equal(noMatch.prepared,0);
assert.equal(noMatch.results[0].reason,'UNMATCHED');
assert.equal(noMatch.espocrmWrites,0);
const noProof=prepareOutcomeCandidates([read],[{...verified,mappingIndependentlyVerified:false}]);
assert.equal(noProof.prepared,0);assert(noProof.invalidLinks>0);
const good=prepareOutcomeCandidates([read],[verified]);
assert.equal(good.prepared,1);
assert.equal(good.results[0].events.length,2);
assert.deepEqual(good.results[0].events.map(x=>x.type),['delivered','read']);
assert.equal(good.results[0].events[0].eventId,
  prepareOutcomeCandidates([read],[verified]).results[0].events[0].eventId,'Replay idempotency key stable');
assert.equal(good.results[0].canWrite,false);
assert.equal(good.espocrmWrites,0);
assert.equal(good.idempotencyWriteGateVerified,false);
const readOnly={...read,timestamps:{sent:'2026-09-04T05:52:59Z',read:'2026-09-04T05:54:55Z',delivered:null}};
const only=prepareOutcomeCandidates([readOnly],[verified]);
assert.equal(only.prepared,1);
assert.deepEqual(only.results[0].events.map(x=>x.type),['read'],
  'Read-only evidence implies delivery without fabricated delivered timestamp');
const bad=prepareOutcomeCandidates([{...read,chatwootInboxId:'99'}],[verified]);
assert.equal(bad.prepared,0);
const spoof=prepareOutcomeCandidates([{...read,providerMessageId:'wamid.fakeother'}],[verified]);
assert.equal(spoof.prepared,0);
const ambiguous=prepareOutcomeCandidates([read],[verified,{...verified,ageAttemptId:'a-duplicate'}]);
assert.equal(ambiguous.prepared,0);assert(ambiguous.invalidLinks>0);
const failure={...read,status:'FAILED',errorCode:'131026',
 timestamps:{sent:'2026-09-04T05:52:59Z',delivered:null,read:null,failed:'2026-09-04T05:53:01Z'}};
const failed=prepareOutcomeCandidates([failure],[verified]);
assert.equal(failed.prepared,1);
assert.equal(failed.results[0].events[0].details.errorCode,'131026');
const unproven=prepareOutcomeCandidates([read],[{...verified,providerSourceIdConfirmedMetaWamid:false}]);
assert.equal(unproven.prepared,0);
console.log('PASS: fail-closed AGE attempt mapping, exact IDs, deterministic event candidates, Read-implies-delivered, no writes');
