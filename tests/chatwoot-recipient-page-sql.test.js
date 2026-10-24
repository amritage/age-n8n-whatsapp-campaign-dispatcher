'use strict';
// Tests AGE 03 actual keyset SELECT against ephemeral CI PostgreSQL.
// Synthetic phones only; does not access production or publish recipient data.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const w=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../workflows/age-03-chatwoot-evidence-readonly.json'),'utf8'));
const sql=w.nodes.find(n=>n.type==='n8n-nodes-base.postgres').parameters.query;
const setup=`
CREATE TEMP TABLE campaigns(id bigint,account_id bigint,display_id bigint,title text,inbox_id bigint,campaign_type integer);
CREATE TEMP TABLE inboxes(id bigint,account_id bigint,channel_type text);
CREATE TEMP TABLE contacts(id bigint,account_id bigint,phone_number text);
CREATE TEMP TABLE campaign_recipients(id bigint,campaign_id bigint,account_id bigint,contact_id bigint,
contact_inbox_id bigint,source_id text,status integer,sent_at timestamp,delivered_at timestamp,
read_at timestamp,failed_at timestamp,error_code text,error_title text,error_message text,updated_at timestamp);
INSERT INTO inboxes VALUES (5,2,'Channel::Whatsapp'),(6,2,'Channel::Sms'),(7,3,'Channel::Whatsapp');
INSERT INTO campaigns VALUES (20,2,2,'Synthetic WA',5,1),(21,2,3,'Synthetic SMS',6,1),(30,3,1,'Other account',7,1);
INSERT INTO contacts VALUES (100,2,'+919000000001'),(101,2,'+919000000002'),(102,2,'+919000000003'),(300,3,'+919000000004');
INSERT INTO campaign_recipients VALUES
 (1,20,2,100,NULL,'wamid.synthetic1',4,now(),now(),now(),NULL,NULL,NULL,NULL,'2026-10-09 10:32:32'),
 (2,20,2,101,NULL,'wamid.synthetic2',5,now(),NULL,NULL,now(),'131026',NULL,'Undeliverable','2026-10-09 10:32:32'),
 (3,20,2,102,NULL,'wamid.synthetic3',3,now(),now(),NULL,NULL,NULL,NULL,NULL,'2026-10-10 10:32:32'),
 (4,21,2,100,NULL,'wamid.sms',4,now(),now(),now(),NULL,NULL,NULL,NULL,now()),
 (5,30,3,300,NULL,'wamid.cross',4,now(),now(),now(),NULL,NULL,NULL,NULL,now());
`;
function testPage(cursorTs,cursorId,pageSize){
 const p=setup+'\nPREPARE age03(bigint,timestamp,bigint,integer) AS\n'+sql+'\n'+
  "EXECUTE age03(2,'"+cursorTs+"',"+cursorId+","+pageSize+");\n";
 const out=execFileSync('psql',['-X','-q','-t','-A','-F','|','-v','ON_ERROR_STOP=1'],{
  input:p,encoding:'utf8',timeout:20000});
 return out.trim().split('\n').filter(Boolean).map(row=>row.split('|'));
}
const first=testPage('1970-01-01 00:00:00',0,1);
assert.equal(first.length,2,'Page-size + 1 supplies hasMore sentinel');
assert.equal(first[0][5],'1','First recipient sorted by updated_at and id');
assert.equal(first[1][5],'2','Second recipient sorted by same timestamp and id');
assert.equal(first[0][8],'+919000000001');
assert.equal(first[0][10],'4','Read status');
assert.equal(first[1][10],'5','Failed status');
assert.equal(first[1][15],'131026','Raw Meta error preserved');
const second=testPage('2026-10-09 10:32:32',1,2);
assert.equal(second.length,2);
assert.equal(second[0][5],'2','After cursor includes later ID at same time');
assert.equal(second[1][5],'3','Next timestamp included');
assert(second.every(x=>x[1]==='20'),'SMS and other-account rows excluded');
console.log('PASS: AGE 03 parameterized PostgreSQL keyset pagination, tenant + WhatsApp scope, contact phone, status and Meta errors');
