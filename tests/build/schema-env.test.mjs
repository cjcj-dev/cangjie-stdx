#!/usr/bin/env zx
// Public build.py + real CMake/Ninja and real previously produced flatc.
// Only the top-level project/toolchain is reduced; no cjc/full SDK build.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=process.env.STDX_SCHEMA_EVIDENCE;
const sdk=process.env.STDX_SCHEMA_SDK;
const native=process.env.STDX_SCHEMA_NATIVE;
const flatc=process.env.STDX_SCHEMA_FLATC;
const support=process.env.STDX_SCHEMA_SUPPORT;
for(const [name,value] of Object.entries({out,sdk,native,flatc,support}))assert.ok(value,'required fixture input '+name);
fs.mkdirSync(out,{recursive:true});
const cmakeString=x=>x.replaceAll('\\','/').replaceAll('"','\\"');
function scenario(name){
 const dir=path.join(out,name),source=path.join(dir,'source'),build=path.join(source,'build_temp/build');
 fs.mkdirSync(source,{recursive:true});
 fs.copyFileSync(path.join(root,'build.py'),path.join(source,'build.py'));
 fs.cpSync(path.join(root,'src/stdx/chir'),path.join(source,'src/stdx/chir'),{recursive:true});
 fs.mkdirSync(path.join(source,'build/common'),{recursive:true});
 fs.writeFileSync(path.join(source,'build/common/linux_x86_64_toolchain.cmake'),'# No compiler targets in this reduced schema project.\n');
 fs.mkdirSync(path.join(source,'third_party/flatbuffers/cangjie'),{recursive:true});
 for(const file of ['flatbuffer_object.cj','decode.cj','table.cj','builder.cj','constants.cj','exception.cj'])
  fs.copyFileSync(path.join(support,file),path.join(source,'third_party/flatbuffers/cangjie',file));
 // The independent fallback is the other existing, normally installed schema
 // root. No schema copy or symlink is created. Its different path exposes a
 // disconnected environment/argv while keeping generation valid.
 fs.writeFileSync(path.join(source,'CMakeLists.txt'),`cmake_minimum_required(VERSION 3.20)
project(StdxSchemaEntry NONE)
set(CANGJIE_SCHEMA_DIR "${cmakeString(native)}" CACHE PATH "Fixture fallback")
add_custom_target(flatbuffers
 COMMAND \${CMAKE_COMMAND} -E make_directory "\${CMAKE_BINARY_DIR}/bin"
 COMMAND \${CMAKE_COMMAND} -E copy_if_different "${cmakeString(flatc)}" "\${CMAKE_BINARY_DIR}/bin/flatc")
add_subdirectory(src/stdx/chir)
add_custom_target(independent_control ALL COMMAND \${CMAKE_COMMAND} -E touch "\${CMAKE_BINARY_DIR}/control.ran")
`);
 let serial=0;
 return {source,build,run(schema){
  const env={...process.env,PYTHONDONTWRITEBYTECODE:'1'};delete env.CANGJIE_SCHEMA_DIR;
  if(schema!==undefined)env.CANGJIE_SCHEMA_DIR=schema;
  const argv=[path.join(source,'build.py'),'build','-t','release','--jobs','5'];
  const r=spawnSync('/usr/bin/python3',argv,{cwd:source,env,encoding:'utf8',maxBuffer:4*1024**2,timeout:60000});
  const label=String(++serial);fs.writeFileSync(path.join(dir,label+'.stdout'),r.stdout||'');fs.writeFileSync(path.join(dir,label+'.stderr'),r.stderr||'');
  fs.writeFileSync(path.join(dir,label+'.json'),JSON.stringify({argv:['/usr/bin/python3',...argv],schema: schema??null,rc:r.status,signal:r.signal,error:r.error?.message}));
  return r;
 },selected(expected){
  assert.ok(fs.existsSync(path.join(build,'control.ran')),'independent real build target ran');
  const generated=fs.readFileSync(path.join(source,'src/stdx/chir/StdxChirFormat_generated.cj'),'utf8');
  assert.match(generated,/package stdx.chir/);assert.match(generated,/CHIRFormat_CHIRPackage/);
  console.log('SCHEMA_SELECTION_ASSERTION_REACHED '+name);
  const cache=fs.readFileSync(path.join(build,'CMakeCache.txt'),'utf8');
  const actual=cache.match(/^CANGJIE_SCHEMA_DIR:[^=]+=(.*)$/m)?.[1];
  assert.equal(actual,path.resolve(source,expected),'explicit schema must reach the real CMake cache');
  const graph=fs.readFileSync(path.join(build,'build.ninja'),'utf8').replaceAll('$ ', ' ');
  assert.ok(graph.includes(path.resolve(source,expected)+'/StdxChirFormat.fbs'),'actual generation dependency uses selected installed schema');
 }};
}
function ok(r){assert.equal(r.status,0,(r.stderr||'')+(r.stdout||''));}
test('fresh explicit SDK schema',()=>{const s=scenario('fresh');ok(s.run(sdk));s.selected(sdk);});
test('precreated recovery directory',()=>{const s=scenario('precreated');fs.mkdirSync(s.build,{recursive:true});ok(s.run(sdk));s.selected(sdk);});
test('cached schema change',()=>{const s=scenario('cached');ok(s.run(native));s.selected(native);ok(s.run(sdk));s.selected(sdk);});
test('absent environment independent control',()=>{const s=scenario('control');ok(s.run());s.selected(native);ok(s.run());s.selected(native);});
test('relative schema path',()=>{const s=scenario('relative');const relative=path.relative(s.source,sdk);ok(s.run(relative));s.selected(sdk);});
test('configure failure stops build',()=>{const s=scenario('failure');const r=s.run(path.join(out,'missing-schema'));assert.equal(r.status,1);assert.match(r.stdout+r.stderr,/CHIR StdxChirFormat.fbs not found/);assert.equal(fs.existsSync(path.join(s.build,'control.ran')),false);});
