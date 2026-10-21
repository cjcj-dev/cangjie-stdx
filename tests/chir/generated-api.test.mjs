#!/usr/bin/env zx
// A finite source diagnostic, not a substitute for cjc or a wire roundtrip.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const [source,generatedFile]=process.argv.slice(2);
if(!source||!generatedFile)throw Error('usage: generated-api.test.mjs CHIR_SOURCE GENERATED_FILE');
const generated=fs.readFileSync(generatedFile,'utf8');
function countArguments(text,start){
 let depth=1,brackets=0,braces=0,count=0,content=false,string=false,escape=false;
 for(let i=start;i<text.length;i++){
  const c=text[i];
  if(string){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')string=false;continue;}
  if(c==='"'){string=true;content=true;continue;}
  if(c==='(')depth++;else if(c===')'){if(--depth===0)return content?count+1:0;}
  else if(c==='[')brackets++;else if(c===']')brackets--;
  else if(c==='{')braces++;else if(c==='}')braces--;
  else if(c===','&&depth===1&&brackets===0&&braces===0)count++;
  if(!/\s/.test(c))content=true;
 }
 throw Error('unclosed argument list');
}
const classes=[...generated.matchAll(/(?:public )?class (CHIRFormat_\w+)\b/g)];
const declarations=new Map();
for(let i=0;i<classes.length;i++){
 const body=generated.slice(classes[i].index,classes[i+1]?.index??generated.length);
 for(const m of body.matchAll(/static func (create\w+)\s*\(/g))declarations.set(classes[i][1]+'.'+m[1],countArguments(body,m.index+m[0].length));
}
const rows=[];
for(const file of ['serialize.cj','deserialize.cj']){
 const text=fs.readFileSync(path.join(source,file),'utf8');
 assert.ok(!text.includes('PackageFormat_'),file+': stale namespace');
 for(const m of text.matchAll(/\b(CHIRFormat_\w+)\.(create\w+)\s*\(/g)){
  const key=m[1]+'.'+m[2],actual=countArguments(text,m.index+m[0].length),expected=declarations.get(key);
  rows.push({file,api:key,actual,expected});assert.equal(actual,expected,key+' argument count');
 }
 for(const m of text.matchAll(/\b(CHIRFormat_\w+)\.(\w+)\b(?!\s*\()/g)){
  if(m[2].startsWith('create'))continue;
  assert.ok(generated.includes(m[1]+'.'+m[2]),file+': absent generated enum '+m[0]);
 }
}
assert.ok(rows.length>50,'the complete serializer API call set must be reached');
console.log(JSON.stringify({method:'read',generatedFile,calls:rows.length,rows,limits:'No type inference or runtime/ABI qualification'},null,2));
