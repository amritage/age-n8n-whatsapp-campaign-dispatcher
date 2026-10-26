'use strict';
const assert = require('node:assert/strict');
const {evaluateMarketingCooldown: gate, chooseOneCampaignPerPhone: unique} = require('../src/serialized-cooldown');
const now='2026-10-25T12:00:00Z';
const row=(id, at, status='Failed')=>({
 id, phoneNumberId:'master-A', channel:'WhatsApp', status,
 attemptCount: at ? 1 : 0,
 history:JSON.stringify({schemaVersion:1,attempts: at ? [{attemptId:'a-'+id,startedAt:at,events:[]}] : []})
});
const q=(rows, more={})=>({phoneMasterId:'master-A',recipientRows:rows,scanComplete:true,
 scopedByPhoneMaster:true,allCampaignsIncluded:true,historyFull:true,
 minimumGapDays:7,now,...more});
assert.equal(gate(q([])).allowed,true);
assert.equal(gate(q([row('c1',null)])).allowed,true);
const collision=[row('one','2026-10-10T10:00:00Z'),row('two','2026-10-24T11:00:00Z')];
assert.equal(gate(q(collision)).reason,'GLOBAL_MARKETING_COOLDOWN');
assert.equal(gate(q(collision)).nextAllowedAt,'2026-10-31T11:00:00.000Z');
assert.equal(gate(q([row('c1','2026-10-18T12:00:00Z')])).allowed,true);
assert.equal(gate(q([row('c1','2026-10-18T12:00:01Z')])).allowed,false);
assert.equal(gate(q([row('c1','2026-10-24T12:00:00Z','Failed')])).allowed,false);
assert.equal(gate(q([row('c1','2026-10-01T12:00:00Z','Submitted')])).reason,'UNRESOLVED_PREVIOUS_ATTEMPT');
for (const modified of [
 {scanComplete:false},{scopedByPhoneMaster:false},{allCampaignsIncluded:false},
 {historyFull:false},{minimumGapDays:6},{now:'2026-10-25 12:00:00'},
 {recipientRows:[{...row('c1','2026-10-10T00:00:00Z'),history:null}]},
 {recipientRows:[{...row('c1','2026-10-10T00:00:00Z'),attemptCount:2}]},
 {recipientRows:[{...row('c1','2026-10-10T00:00:00Z'),phoneNumberId:'wrong'}]},
 {recipientRows:[row('dup','2026-10-11T00:00:00Z'),row('dup','2026-10-12T00:00:00Z')]},
 {recipientRows:[row('future','2026-10-26T00:00:00Z')]}
]) assert.throws(()=>gate(q([row('c1',null)],modified)),/MARKETING_COOLDOWN_UNVERIFIED/);
const selections=unique([
 {phoneMasterId:'master-A',campaignId:'B',recipientId:'r2',priority:0},
 {phoneMasterId:'master-A',campaignId:'A',recipientId:'r1',priority:1},
 {phoneMasterId:'master-B',campaignId:'B',recipientId:'r3',priority:0}
]);
assert.equal(selections.length,2);
assert.equal(selections.find(x=>x.phoneMasterId==='master-A').campaignId,'A');
assert.throws(()=>unique([{phoneMasterId:'master-C',campaignId:'C',recipientId:'r',priority:null}]),/MARKETING_COOLDOWN_UNVERIFIED/);
console.log('PASS: one-dispatcher global marketing cooldown, fail closed on incomplete CRM history, deterministic same-cycle de-duplication');
