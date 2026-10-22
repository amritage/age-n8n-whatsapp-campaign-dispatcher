'use strict';
const assert=require('node:assert/strict');
const {plan,campaignOpen}=require('../src/cycle-planner');
const now='2026-10-21T06:00:00.000Z'; // Wed 11:30 IST
function campaign(id,priority=1){return {id,status:'Active',portfolioId:'meta-p1',inboxId:'5',templateName:'approved_intro',templateLanguage:'en',timeZone:'Asia/Kolkata',allowedWeekdays:['Mon','Tue','Wed','Thu','Fri','Sat'],windowStart:'08:50',windowEnd:'20:10',priority,maxPerCycle:2000};}
function candidate(campaignId,id,phone){return {campaignId,recipientId:id,phoneMasterId:phone,eligibility:'ALLOW',policyEvidenceVerified:true,currentAudienceMember:true,isSuppressed:false,inflight:false,dueAt:'2026-10-20T00:00:00Z'};}
function input(){return {now,masterSendingEnabled:true,readiness:'VERIFIED',portfolio:{id:'meta-p1',usageEvidenceComplete:true,unresolvedCycle:false,externalUseUnknown:false,tier:2000,rollingUsed:0,reserved:0,hardCycleMax:2000,lastVerifiedBatchCompletedAt:null},campaigns:[campaign('maha',2),campaign('guj',1)],candidates:[candidate('maha','m1','p1'),candidate('guj','g1','p1'),candidate('guj','g2','p2')]};}
let p=plan(input());assert.equal(p.selected.length,2);assert.deepEqual(p.selected.map(x=>x.recipientId),['m1','g2']);
const a=input();a.portfolio.lastVerifiedBatchCompletedAt='2026-10-20T10:00:00Z';assert.throws(()=>plan(a),/26-hour/);
const b=input();b.portfolio.rollingUsed=1999;assert.equal(plan(b).selected.length,1);
const c=input();c.candidates[0].isSuppressed=true;assert.deepEqual(plan(c).selected.map(x=>x.recipientId),['g1','g2']);
const d=input();d.portfolio.externalUseUnknown=true;assert.throws(()=>plan(d),/External/);
const e=input();e.masterSendingEnabled=false;assert.throws(()=>plan(e),/not enabled/);
assert.equal(campaignOpen(campaign('maha'),now),true);
assert.equal(campaignOpen(campaign('maha'),'2026-10-25T06:00:00Z'),false);
const fair=input();
fair.portfolio.tier=4;fair.portfolio.hardCycleMax=4;
fair.candidates=[
  candidate('maha','m1','p1'),candidate('maha','m2','p2'),candidate('maha','m3','p3'),
  candidate('guj','g1','p4'),candidate('guj','g2','p5'),candidate('guj','g3','p6')
];
const out=plan(fair);
assert.equal(out.selected.length,4);
assert.deepEqual(out.allocation,[{campaignId:'maha',count:2},{campaignId:'guj',count:2}]);
console.log('PASS: planner safety, gap, cap, cross-campaign dedupe, suppression, windows, fairness');
