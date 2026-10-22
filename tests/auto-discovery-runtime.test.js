'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..','workflows');
const workflow=(n)=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
const readiness=workflow('age-api-readiness-native.json');
const report=workflow('age-chatwoot-recipient-report-native.json');
function run(w,name,context){
 const code=w.nodes.find(n=>n.name===name).parameters.jsCode;
 return vm.runInNewContext('(function(){'+code+'\n})()',context,{timeout:1500});
}
const item=(json,pairedItem)=>({json, ...(pairedItem===undefined?{}:{pairedItem:{item:pairedItem}})});
const espo=[item({id:'e1',name:'INTROMAHA',status:'Active',ageTrackingEnabled:true,ageProvider:'Chatwoot / Meta',ageInboxId:'5',ageTemplateName:'approved'}),
            item({id:'e2',name:'INTROGUJARAT',status:'Planned'})];
const crm=run(readiness,'Summarize CRM Inventory',{$input:{all:()=>espo}});
assert.equal(crm[0].json.espoCampaignCount,2);assert.equal(crm[0].json.activeCount,1);
const cw=[
 item({id:42,title:'MAHA batch 1',campaign_type:'one_off',campaign_status:'completed',inbox:{id:5,channel_type:'Channel::Whatsapp'}}),
 item({id:43,title:'Help center',campaign_type:'ongoing',campaign_status:'active',inbox:{id:1,channel_type:'Channel::WebWidget'}})
];
const finalReadiness=run(readiness,'Summarize Cross-System Readiness',{$input:{all:()=>cw},$:()=>({first:()=>crm[0]})});
assert.equal(finalReadiness[0].json.chatwootNativeWhatsAppCount,1);
assert.equal(finalReadiness[0].json.crossSystemCampaignMappingVerified,false);
const campaign=[item({id:52,title:'MAHA',campaign_type:'one_off',campaign_status:'completed',completed_at:1800000000,inbox:{id:5,channel_type:'Channel::Whatsapp'}}),
 item({id:53,title:'GUJ',campaign_type:'one_off',campaign_status:'completed',completed_at:1799990000,inbox:{id:5,channel_type:'Channel::Whatsapp'}}),
 item({id:60,title:'Website',campaign_type:'ongoing',campaign_status:'active',inbox:{id:2,channel_type:'Channel::WebWidget'}})];
const selected=run(report,'Select Completed WhatsApp Campaigns',{$input:{all:()=>campaign}});
assert.equal(selected.length,2);assert.equal(selected[0].json.chatwootCampaignId,52);assert.equal(selected[1].json.chatwootCampaignId,53);
const metrics=[item({audience:2,delivered:1,read:0,failed:1,skipped:0},0),item({audience:1,delivered:1,read:1,failed:0,skipped:0},1)];
const recipients=[item({contact:{id:9001,phone_number:'PRIVATE'},status:'delivered'},0),
 item({contact:{id:9002,phone_number:'PRIVATE'},status:'failed',error_code:'131049'},0),
 item({contact:{id:9003,phone_number:'PRIVATE'},status:'read'},1)];
const sources=(name)=>({all:()=> name==='Select Completed WhatsApp Campaigns'?selected:metrics});
const summaries=run(report,'Verify and Summarize All Campaigns',{$input:{all:()=>recipients},$:sources});
assert.equal(summaries[0].json.campaignCount,2);
assert.equal(summaries[0].json.reports[0].errorCodeCounts['131049'],1);
assert.equal(summaries[0].json.reports[1].counts.read,1);
assert.equal(summaries[0].json.crmEventWriteAuthorized,false);
assert(!JSON.stringify(summaries).includes('PRIVATE'),'No phone number leakage in final output');
assert.throws(()=>run(report,'Verify and Summarize All Campaigns',{$input:{all:()=>[item({contact:{id:999},status:'sent'})]},$:sources}),/MISSING_PAIRING/);
assert.throws(()=>run(report,'Verify and Summarize All Campaigns',{$input:{all:()=>[...recipients,item({contact:{id:9003},status:'sent'},0)]},$:sources}),/Analytics count mismatch|Invalid\/duplicate recipient/);
const empty=run(report,'Select Completed WhatsApp Campaigns',{$input:{all:()=>[item({id:12,campaign_type:'ongoing'})]}});
assert.equal(empty[0].json.hasCampaign,false);
console.log('PASS: fully dynamic Campaign inventory from both apps, two concurrent Chatwoot report groups, zero-ID setup, no-campaign path, pairing and PII fail-safe');
