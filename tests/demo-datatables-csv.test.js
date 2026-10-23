'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const dir=path.join(root,'examples/n8n-data-tables');

function parseCsv(source) {
 const rows=[];let row=[],cell='',quoted=false;
 const s=source.replace(/\r\n/g,'\n');
 for(let i=0;i<s.length;i++){
  const ch=s[i];
  if(ch==='"'){
   if(quoted&&s[i+1]==='"'){cell+='"';i++;}
   else quoted=!quoted;
  }else if(ch===','&&!quoted){row.push(cell);cell='';}
  else if(ch==='\n'&&!quoted){row.push(cell);rows.push(row);row=[];cell='';}
  else cell+=ch;
 }
 if(cell.length||row.length){row.push(cell);rows.push(row);}
 assert.equal(quoted,false,'CSV has unclosed quote');
 const [headers,...data]=rows;
 assert(headers.every((h,i)=>h&&headers.indexOf(h)===i),'CSV headers must be unique');
 return {headers,rows:data.map((values,index)=>{
  assert.equal(values.length,headers.length,'Column count changed at row '+(index+2));
  return Object.fromEntries(headers.map((h,i)=>[h,values[i]]));
 })};
}

const setup=JSON.parse(fs.readFileSync(path.join(root,'workflows/age-dt-setup-managed-tables.json'),'utf8'));
const schemas=Object.fromEntries(setup.nodes.filter(n=>n.type==='n8n-nodes-base.dataTable'&&n.parameters.operation==='create')
 .map(n=>[n.parameters.tableName,n.parameters.columns.column]));
for(const [table,count,fields] of [
 ['AGE_Portfolio_Control',20,16],['AGE_Dispatcher_Events',34,9]
]){
 const text=fs.readFileSync(path.join(dir,table+'_DEMO.csv'),'utf8');
 const parsed=parseCsv(text);
 assert.equal(parsed.rows.length,count,'Incorrect demo count for '+table);
 assert.equal(parsed.headers.length,fields,'Incorrect field count for '+table);
 assert.deepEqual(parsed.headers,schemas[table].map(c=>c.name),'CSV mismatch with Data Table setup schema');
 const types=Object.fromEntries(schemas[table].map(c=>[c.name,c.type]));
 for(const row of parsed.rows){
  for(const name of parsed.headers){
   const v=row[name];
   if(v==='')continue;
   if(types[name]==='boolean')assert(['true','false'].includes(v),name+' must contain true/false');
   if(types[name]==='number')assert(Number.isFinite(Number(v)),name+' must be numeric');
   if(types[name]==='date')assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v),name+' must be UTC ISO-8601');
  }
 }
 if(table==='AGE_Portfolio_Control'){
  const ids=new Set();
  for(const row of parsed.rows){
   assert(row.portfolioId.startsWith('DEMO_ONLY_'));
   assert(!ids.has(row.portfolioId),'Duplicate demo portfolio');
   ids.add(row.portfolioId);
   assert(!(row.masterSendingEnabled==='true'&&row.operatorLiveApproved==='true'),'Never seed live permission flags together');
  }
 }else{
  for(const row of parsed.rows){
   assert(row.portfolioId.startsWith('DEMO_ONLY_'));
   assert(row.note.startsWith('DEMO_DELETE_AFTER_TEST'));
   assert(row.campaignId.startsWith('DEMO_')&&row.batchId.startsWith('DEMO_'));
  }
 }
}
const readme=fs.readFileSync(path.join(dir,'README.md'),'utf8');
assert(readme.includes('n8n Data Tables'));
assert(readme.includes('DEMO_DELETE_AFTER_TEST'));
assert(readme.includes('priorCycleHistoryVerified'));
assert(readme.includes('String')&&readme.includes('Boolean')&&readme.includes('Date'));
console.log('PASS: 20 portfolio and 34 event CSV rows, exact n8n setup column/type compatibility, safe demo flags and deletion instructions');
