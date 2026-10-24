'use strict';
// CI-only SQL contract test. Requires ephemeral PostgreSQL; never connects to production.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const workflow=JSON.parse(fs.readFileSync(path.join(__dirname,'../workflows/age-07-delivery-read-analytics-native.json'),'utf8'));
const sql=workflow.nodes.find(n=>n.name==='Chatwoot PostgreSQL - Read Campaign Rollups').parameters.query;
assert(sql.trim().endsWith(';'));
const fixture=`
CREATE TEMP TABLE campaigns(
 id bigint, account_id integer, display_id integer, title text, inbox_id integer, campaign_type integer);
CREATE TEMP TABLE inboxes(id integer,account_id integer,channel_type text);
CREATE TEMP TABLE campaign_recipients(
 id bigint,campaign_id bigint,account_id integer,status integer,source_id text,
 delivered_at timestamp,read_at timestamp,failed_at timestamp,error_code text,updated_at timestamp);
INSERT INTO inboxes VALUES
 (5,2,'Channel::Whatsapp'),(6,2,'Channel::Sms'),(8,3,'Channel::Whatsapp');
INSERT INTO campaigns VALUES
 (99,2,2,'Synthetic WhatsApp',5,1),
 (98,2,1,'Empty WhatsApp',5,1),
 (97,2,3,'Not WhatsApp',6,1),
 (96,3,1,'Other account',8,1);
INSERT INTO campaign_recipients VALUES
 (1,99,2,2,'wamid.test1',null,null,null,null,now()),
 (2,99,2,3,'wamid.test2',now(),null,null,null,now()),
 (3,99,2,4,'wamid.test3',now(),now(),null,null,now()),
 (4,99,2,4,'wamid.test4',now(),now(),null,null,now()),
 (5,99,2,5,'wamid.test5',null,null,now(),'131049',now()),
 (6,97,2,4,'wamid.sms',now(),now(),null,null,now()),
 (7,96,3,4,'wamid.other',now(),now(),null,null,now());
`;
const output=execFileSync('psql',['-X','-q','-t','-A','-F','|','-v','ON_ERROR_STOP=1'],{
  input:fixture+'\n'+sql+'\n',encoding:'utf8',timeout:20000
});
const rows=output.trim().split('\n').filter(Boolean).map(x=>x.split('|'));
assert.equal(rows.length,2,'Two WhatsApp campaigns scoped to account 2');
const present=rows.find(x=>x[3]==='Synthetic WhatsApp');
const empty=rows.find(x=>x[3]==='Empty WhatsApp');
assert(present&&empty);
assert.equal(Number(present[5]),5,'Five recipient rows');
assert.equal(Number(present[8]),1,'Sent only');
assert.equal(Number(present[9]),1,'Delivered only');
assert.equal(Number(present[10]),2,'Read');
assert.equal(Number(present[11]),1,'Failed');
assert.equal(Number(present[12]),5,'Source IDs');
assert.equal(Number(present[16]),1,'Failure timestamp');
assert.equal(Number(present[17]),1,'Coded failure');
assert.equal(Number(present[19]),3,'Delivered including Read = 1+2');
const errors=JSON.parse(present[20]);
assert.equal(Number(errors['131049']),1);
assert.equal(Number(empty[5]),0,'Empty campaign preserved without fabricated evidence');
console.log('PASS: real AGE 07 PostgreSQL query, tenant/inbox filters, Read-in-Delivered, error rollup and empty campaign');
