'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {evaluateMarketingCooldown,chooseOneCampaignPerPhone}=require('../src/serialized-cooldown');
const dataset=JSON.parse(fs.readFileSync(path.join(__dirname,'../examples/demo-cooldown/scenarios.json'),'utf8'));
let passed=0;
console.log('FIXED TIME (UTC): '+dataset.nowUTC+' | ALL DEMO DATA SYNTHETIC');
console.log('CASE | EXPECTED | ACTUAL | RESULT');
for(const c of dataset.cases){
 const recipientRows=c.rows.map(row=>{
  const history=row.corruptHistory ? '{not-json' : JSON.stringify({schemaVersion:1,attempts:row.attempts});
  return {id:row.id,phoneNumberId:row.phoneNumberId,channel:row.channel,status:row.status,
   attemptCount:row.overrideAttemptCount??row.attempts.length,history};
 });
 const input={phoneMasterId:c.phoneMasterId,recipientRows,scanComplete:c.scanComplete,
  scopedByPhoneMaster:c.scopedByPhoneMaster,allCampaignsIncluded:c.allCampaignsIncluded,
  historyFull:c.historyFull,minimumGapDays:c.minimumGapDays,now:c.now};
 let actual,actualText,expectedText;
 try{
  actual=evaluateMarketingCooldown(input);
  actualText=actual.reason+' / '+actual.allowed+' / '+(actual.nextAllowedAt??'-');
  if(c.expected.error)throw new Error('Expected safety error, got '+actualText);
  for(const key of Object.keys(c.expected))
   assert.deepEqual(actual[key],c.expected[key],c.id+' '+key);
  expectedText=c.expected.reason+' / '+c.expected.allowed+' / '+(c.expected.nextAllowedAt??'-');
 }catch(error){
  if(!c.expected.error)throw new Error('Case '+c.id+': '+error.message);
  assert.match(error.message,new RegExp(c.expected.error),c.id);
  actualText='ERROR '+error.message.slice(0,70);
  expectedText='ERROR '+c.expected.error;
 }
 passed++;
 console.log(c.id+' | '+expectedText+' | '+actualText+' | PASS');
}
const selected=chooseOneCampaignPerPhone(dataset.selectionDemo.candidates);
assert.deepEqual(selected.map(x=>x.recipientId),dataset.selectionDemo.expectedRecipientIds);
console.log('D16 same-phone campaign arbitration | expected='+dataset.selectionDemo.expectedRecipientIds.join(',')+
 ' | actual='+selected.map(x=>x.recipientId).join(',')+' | PASS');
console.log('PASS: '+(passed+1)+' of '+(dataset.cases.length+1)+' synthetic scenarios; NO PROVIDER SENDS.');
