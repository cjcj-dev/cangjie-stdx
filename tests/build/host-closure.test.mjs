#!/usr/bin/env zx
// Finite public build.py gate. Real production CMake rules and CJ sources;
// only unrelated ALL targets are excluded and an already produced flatc reused.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const base=path.dirname(source),mode=process.argv[2];
const host=process.env.TEST_HOST_SDK,target=process.env.TEST_TARGET_SDK;
const deps=process.env.TEST_STDX_DEPENDENCIES,flatc=process.env.TEST_FLATC,support=process.env.TEST_FLATBUFFER_SUPPORT;
for(const p of [host,target,deps,flatc,support])assert(p&&path.isAbsolute(p),'explicit existing input paths');
let build=source+'/build_temp/build',closure=build+'/host-closure';
const tuple='linux_x86_64_cjnative'; // This dynamic gate runs on Linux x64 only.
const out=base+'/evidence-'+mode;fs.mkdirSync(out,{recursive:false});const rows=[];
const env={...process.env,PATH:target+'/bin:/usr/lib/llvm-15/bin:/usr/local/bin:/usr/bin:/bin',
 CC:'/usr/lib/llvm-15/bin/clang',CXX:'/usr/lib/llvm-15/bin/clang++',CANGJIE_HOME:target,
 STDX_HOST_CANGJIE_HOME:host,CANGJIE_SCHEMA_DIR:target+'/schema',CANGJIE_PATH:'',
 LD_LIBRARY_PATH:host+'/runtime/lib/'+tuple+':'+target+'/tools/lib:/usr/lib/x86_64-linux-gnu',
 cjHeapSize:'6GB',PYTHONDONTWRITEBYTECODE:'1',CMAKE_BUILD_PARALLEL_LEVEL:'1'};
delete env.LD_PRELOAD;delete env.LD_AUDIT;
function run(label,argv,extra={},expected=0){
 const stdout=fs.openSync(out+'/'+label+'.stdout','wx'),stderr=fs.openSync(out+'/'+label+'.stderr','wx');
 const start=new Date().toISOString();const r=spawnSync(argv[0],argv.slice(1),{cwd:source,env:{...env,...extra},stdio:['ignore',stdout,stderr]});
 fs.closeSync(stdout);fs.closeSync(stderr);
 const row={label,argv,startedAt:start,finishedAt:new Date().toISOString(),rc:r.status,signal:r.signal,error:r.error?.message};
 rows.push(row);fs.writeFileSync(out+'/commands.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
 if(label.startsWith('public')&&r.status===0){
  const files=['lib/'+tuple+'/libstdx.chir.so','lib/'+tuple+'/libstdx.plugin.manager.so',
   'modules/'+tuple+'/stdx/lib-macro_stdx.plugin.so','modules/'+tuple+'/stdx/lib-macro_stdx.chir.to_string_macro.so'];
  const identity=files.filter(p=>fs.existsSync(closure+'/'+p)).map(p=>({path:closure+'/'+p,sha256:createHash('sha256').update(fs.readFileSync(closure+'/'+p)).digest('hex')}));
  fs.writeFileSync(out+'/'+label+'-artifacts.json',JSON.stringify(identity,null,2));
 }
 if(expected!==null)assert.equal(r.status,expected,`${label}: see ${out}/${label}.stderr`);return row;
}
const publicBuild=['/usr/bin/python3',source+'/build.py','build','-t','release','--include='+target+'/include','--target-lib=/usr/lib/x86_64-linux-gnu','--jobs','1'];
const hostEnv={CANGJIE_HOME:host,CANGJIE_PATH:closure+'/modules/'+tuple,
 LD_LIBRARY_PATH:closure+'/lib/'+tuple+':'+host+'/runtime/lib/'+tuple+':'+host+'/lib/'+tuple,
 LIBRARY_PATH:closure+'/lib/'+tuple};
function consume(label){
 run(label,[host+'/bin/cjc','--output-type=staticlib','--jobs','1','-O0',base+'/consumer.cj',
  '-L',closure+'/lib/'+tuple,'-lstdx.plugin.manager','-lstdx.chir','-o',base+'/'+label+'.a'],{...hostEnv,LD_DEBUG:'libs'});
 const loader=fs.readFileSync(out+'/'+label+'.stderr','utf8');
 assert(loader.split('\n').some(line=>line.includes('calling init: '+closure+'/modules/'+tuple+'/stdx/lib-macro_stdx.plugin.so')),'actual host plugin initialization');
 assert(!loader.includes(build+'/modules/'+tuple+'/stdx/lib-macro_'),'no target macro loaded');
 run(label+'-chir',[host+'/bin/cjc','--jobs','1',base+'/chir-consumer.cj','-L',closure+'/lib/'+tuple,'-lstdx.chir','-o',base+'/'+label+'-chir'],hostEnv);
 run(label+'-run',[base+'/'+label+'-chir'],hostEnv);
 assert.match(fs.readFileSync(out+'/'+label+'-run.stdout','utf8'),/HOST_CHIR_TO_STRING_ASSERT Wrapping/);
}
function targetControl(){
 const p=base+'/target-control.cj';
 fs.writeFileSync(p,`package stdx.chir.selector_control
import stdx.chir.to_string_macro.*
@CHIREnumToString
public enum Control { A | B }
public func value(): String { return Control.B.toString() }
`);
 run('target-macro-control',[target+'/bin/cjc','--output-type=staticlib','--jobs','1',p,'-o',base+'/target-control.a'],{
  CANGJIE_HOME:target,CANGJIE_PATH:build+'/modules/'+tuple,
  LD_LIBRARY_PATH:target+'/runtime/lib/'+tuple+':'+target+'/lib/'+tuple,LD_DEBUG:'libs'});
 assert(fs.readFileSync(out+'/target-macro-control.stderr','utf8').split('\n').some(line=>line.includes('calling init: '+build+'/modules/'+tuple+'/stdx/lib-macro_stdx.chir.to_string_macro.so')),'actual target macro control initialized');
}
let status='FAILED';
try{
 if(mode==='normal'){
  for(const name of ['zlib','boundscheck-v1.1.16'])fs.cpSync(deps+'/'+name,source+'/third_party/'+name,{recursive:true,filter:p=>path.basename(p)!=='.git'});
  fs.mkdirSync(source+'/third_party/flatbuffers/cangjie',{recursive:true});
  for(const name of ['flatbuffer_object.cj','decode.cj','table.cj','builder.cj','constants.cj','exception.cj'])
   fs.copyFileSync(support+'/'+name,source+'/third_party/flatbuffers/cangjie/'+name);
  fs.copyFileSync(source+'/CMakeLists.txt',out+'/CMakeLists.original');
  fs.copyFileSync(source+'/third_party/CMakeLists.txt',out+'/third-party.original');
  // Preserve the production root/src/AddCJNATIVELibrary graph. Reuse the
  // previously normally built flatc, not a stand-in implementation.
  fs.writeFileSync(source+'/third_party/CMakeLists.txt',`add_custom_target(flatbuffers
 COMMAND \${CMAKE_COMMAND} -E make_directory "\${CMAKE_BINARY_DIR}/bin"
 COMMAND \${CMAKE_COMMAND} -E copy_if_different "${flatc}" "\${CMAKE_BINARY_DIR}/bin/flatc")\n`);
  fs.appendFileSync(source+'/CMakeLists.txt',`
# Finite test selection only: the package rules above are the product originals.
function(finite_host_selection dir)
 get_property(targets DIRECTORY "\${dir}" PROPERTY BUILDSYSTEM_TARGETS)
 foreach(t IN LISTS targets)
  if((TARGET host_stdx_chir AND NOT t MATCHES "^(host_stdx_|cangjieCJNATIVE(ChirToStringMacro|PluginMacroHost))") OR
     (NOT TARGET host_stdx_chir AND NOT t STREQUAL "cangjieCJNATIVEChirToStringMacro"))
   set_property(TARGET \${t} PROPERTY EXCLUDE_FROM_ALL TRUE)
  endif()
 endforeach()
 get_property(children DIRECTORY "\${dir}" PROPERTY SUBDIRECTORIES)
 foreach(child IN LISTS children)
  finite_host_selection("\${child}")
 endforeach()
endfunction()
finite_host_selection("\${CMAKE_SOURCE_DIR}")
`);
  fs.writeFileSync(base+'/consumer.cj',`package host_plugin_consumer
import stdx.chir.*
import stdx.plugin.*
@CHIRPlugin
class Probe { public override func run(pkg: Package): Bool { return pkg.name == "probe" } }
`);
  fs.writeFileSync(base+'/chir-consumer.cj',`import stdx.chir.*
main(): Int64 {
 let pkg = Package("probe", AccessLevel.Public)
 if (pkg.name != "probe") { throw Exception("package assertion failed") }
 if (OverflowStrategy.Wrapping.toString() != "Wrapping") { throw Exception("toString assertion failed") }
 println("HOST_CHIR_TO_STRING_ASSERT Wrapping")
 return 0
}
`);
  run('public-build',publicBuild);
  assert(fs.existsSync(closure+'/modules/'+tuple+'/stdx/stdx.chir.to_string_macro.cjo'),'host macro CJO');
  assert(fs.existsSync(build+'/modules/'+tuple+'/stdx/lib-macro_stdx.chir.to_string_macro.so'),'target macro control');
  consume('host-consumer');
 } else if(mode.startsWith('consumer-recovery')){
  // Preserve the first syntax-error evidence; resume only the uncompleted consumer.
  const p=base+'/chir-consumer.cj';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('TypeKind.Unit','TypeKind.`Unit`')
   .replace('assert(pkg.name == "probe")','if (pkg.name != "probe") { throw Exception("package assertion failed") }')
   .replace('assert(TypeKind.`Unit`.toString() == "Unit")','if (TypeKind.`Unit`.toString() != "Unit") { throw Exception("toString assertion failed") }')
   .replace('TypeKind.`Unit`','OverflowStrategy.Wrapping').replaceAll('"Unit"','"Wrapping"').replace('ASSERT Unit','ASSERT Wrapping'));
  run('chir',[host+'/bin/cjc','--jobs','1',p,'-L',closure+'/lib/'+tuple,'-lstdx.chir','-o',base+'/chir-recovered'],hostEnv);
  run('chir-run',[base+'/chir-recovered'],hostEnv);
  assert.match(fs.readFileSync(out+'/chir-run.stdout','utf8'),/HOST_CHIR_TO_STRING_ASSERT Wrapping/);
 } else if(mode.startsWith('incremental')){
  const artifact=closure+'/lib/'+tuple+'/libstdx.chir.so';const before=fs.statSync(artifact).mtimeMs;
  run('public-noop',publicBuild);assert.equal(fs.statSync(artifact).mtimeMs,before,'unchanged host CHIR must not rebuild');
  const macro=source+'/src/stdx/chir/to_string_macro/macro.cj';const original=fs.readFileSync(macro);
  fs.writeFileSync(out+'/macro.original',original);fs.appendFileSync(macro,'\n// finite incremental source dependency probe\n');
  run('public-macro-incremental',publicBuild);assert(fs.statSync(artifact).mtimeMs>before,'macro change must rebuild host CHIR');
  consume('incremental-consumer');
  fs.writeFileSync(macro,original);
  run('public-source-restored',publicBuild);
  const cjo=closure+'/modules/'+tuple+'/stdx/stdx.chir.cjo';
  fs.renameSync(cjo,out+'/stdx.chir.cjo.removed');
  run('public-missing-cjo',publicBuild);assert(fs.existsSync(cjo),'missing CJO regenerated by its producer');
  consume('cjo-recovered-consumer');
 } else if(mode==='selection-cut'){
  const p=source+'/build/libs/MakeHostCJNATIVESharedLib.cmake',original=fs.readFileSync(p,'utf8');
  const needle='"CANGJIE_PATH=${STDX_HOST_CANGJIE_PATH}"';assert(original.includes(needle));
  const cut=original.replace(needle,'"CANGJIE_PATH=${CMAKE_BINARY_DIR}/modules/${STDX_HOST_CJ_LIB_DIR}"');
  fs.writeFileSync(out+'/product.original',original);fs.writeFileSync(out+'/product.cut',cut);
  const line=original.slice(0,original.indexOf(needle)).split('\n').length;
  fs.writeFileSync(out+'/cut.diff','--- a/build/libs/MakeHostCJNATIVESharedLib.cmake\n+++ b/build/libs/MakeHostCJNATIVESharedLib.cmake\n@@ -'+line+',1 +'+line+',1 @@\n-            '+needle+')\n+            "CANGJIE_PATH=${CMAKE_BINARY_DIR}/modules/${STDX_HOST_CJ_LIB_DIR}")\n');
  fs.writeFileSync(p,cut);
  try {
   const r=run('public-selection-cut',publicBuild,{},null);assert.notEqual(r.rc,0);
   const log=fs.readFileSync(out+'/public-selection-cut.stdout','utf8')+fs.readFileSync(out+'/public-selection-cut.stderr','utf8');
   assert.match(log,/CJ_MCC_HandleReturnSafepoint/,'cut reaches the original target macro ABI failure');
   assert(log.includes(build+'/modules/'+tuple+'/stdx/lib-macro_stdx.chir.to_string_macro.so'),'actual target macro selected');
   targetControl();
  } finally {fs.writeFileSync(p,original);}
  run('public-selection-restored',publicBuild);consume('selection-restored-consumer');
 } else if(mode==='host-configuration'){
  // The original fixture selected PluginMacroHost unconditionally. Limit the
  // unset-host branch to its unchanged macro producer, keeping the full graph.
  const p=source+'/CMakeLists.txt',original=fs.readFileSync(p,'utf8');
  const old='if(NOT t MATCHES "^(host_stdx_|cangjieCJNATIVE(ChirToStringMacro|PluginMacroHost))")';
  fs.writeFileSync(p,original.replace(old,'if((TARGET host_stdx_chir AND NOT t MATCHES "^(host_stdx_|cangjieCJNATIVE(ChirToStringMacro|PluginMacroHost))") OR (NOT TARGET host_stdx_chir AND NOT t STREQUAL "cangjieCJNATIVEChirToStringMacro"))'));
  const noSchema={CANGJIE_SCHEMA_DIR:undefined};
  run('public-invalid-host',publicBuild,{...noSchema,STDX_HOST_CANGJIE_HOME:base+'/missing-host'},1);
  assert.match(fs.readFileSync(out+'/public-invalid-host.stderr','utf8'),/host cjc not found/);
  run('public-default-host',publicBuild,{...noSchema,STDX_HOST_CANGJIE_HOME:undefined});
  let graph=fs.readFileSync(build+'/build.ninja','utf8');
  assert(!graph.includes('build host_stdx_chir:'),'unset host must remove explicit closure from the cached graph');
  assert(graph.includes('Staging lib-macro_stdx.plugin'),'native default retains normal target plugin staging');
  run('public-explicit-host-restored',publicBuild,noSchema);
  graph=fs.readFileSync(build+'/build.ninja','utf8');assert(graph.includes('build host_stdx_chir:'));
  run('public-relative-host',publicBuild,{...noSchema,STDX_HOST_CANGJIE_HOME:path.relative(source,host)});
  consume('host-config-restored');
 } else if(mode.startsWith('cross-host')){
  const p=source+'/CMakeLists.txt';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replaceAll('STDX_HOST_CLOSURE_ENABLED','TARGET host_stdx_chir'));
  const ohos=path.dirname(base)+'/cross-providers/ohos/sdk/native';
  assert(fs.existsSync(ohos+'/llvm/bin/clang'),'existing real OHOS toolchain');
  const argv=[...publicBuild,'--target','ohos-aarch64','--target-toolchain',ohos+'/llvm/bin','--target-sysroot',ohos+'/sysroot'];
  if(mode==='cross-host'){
   run('public-cross-missing-host',argv,{STDX_HOST_CANGJIE_HOME:undefined},1);
   assert.match(fs.readFileSync(out+'/public-cross-missing-host.stderr','utf8'),/STDX_HOST_CANGJIE_HOME must name the host SDK/);
  }
  build=source+'/build_temp/build-libs-aarch64-linux-ohos';closure=build+'/host-closure';
  Object.assign(hostEnv,{CANGJIE_PATH:closure+'/modules/'+tuple,
   LD_LIBRARY_PATH:closure+'/lib/'+tuple+':'+host+'/runtime/lib/'+tuple+':'+host+'/lib/'+tuple,LIBRARY_PATH:closure+'/lib/'+tuple});
  run('public-cross-host',argv);consume('cross-host-consumer');
  const graph=fs.readFileSync(build+'/build.ninja','utf8');
  assert(graph.includes('modules/linux_ohos_aarch64_cjnative/stdx/lib-macro_stdx.chir.to_string_macro.so'),'target publication remains cross target');
  assert(fs.existsSync(closure+'/modules/'+tuple+'/stdx/stdx.chir.cjo'),'host modules retain native tuple');
 } else if(mode==='verify-evidence'){
  const checked=[];
  for(const dir of fs.readdirSync(base).filter(n=>n.startsWith('evidence-'))){
   const file=base+'/'+dir+'/result.json';if(!fs.existsSync(file))continue;
   const result=JSON.parse(fs.readFileSync(file));if(result.status!=='FINITE_HOST_CLOSURE_PASS')continue;
   for(const row of result.rows.filter(r=>r.argv[0]===host+'/bin/cjc'&&r.argv.includes('--output-type=staticlib'))){
    const log=fs.readFileSync(base+'/'+dir+'/'+row.label+'.stderr','utf8');
    assert(log.split('\n').some(line=>line.includes('calling init: ')&&line.includes('/host-closure/modules/'+tuple+'/stdx/lib-macro_stdx.plugin.so')));
    checked.push(dir+'/'+row.label);
   }
  }
  const targetLog=fs.readFileSync(base+'/evidence-selection-cut/target-macro-control.stderr','utf8');
  assert(targetLog.split('\n').some(line=>line.includes('calling init: '+build+'/modules/'+tuple+'/stdx/lib-macro_stdx.chir.to_string_macro.so')));
  assert(checked.length>=4,'retain actual completed consumers, not search-path expectations');
  const names=['flatbuffer_object.cj','decode.cj','table.cj','builder.cj','constants.cj','exception.cj','StdxChirFormat_generated.cj'];
  for(const name of names){
   const input=name.endsWith('_generated.cj')?build+'/'+name:support+'/'+name;
   run('namespace-'+name,['sed','s/std.ast/stdx.chir/g',input]);
   assert(fs.readFileSync(out+'/namespace-'+name+'.stdout').equals(fs.readFileSync(source+'/src/stdx/chir/'+name)),'generated namespace bytes preserved: '+name);
  }
  const original=fs.readFileSync(base+'/evidence-selection-cut/product.original');
  assert(original.equals(fs.readFileSync(source+'/build/libs/MakeHostCJNATIVESharedLib.cmake')),'selection cut restored exactly');
  assert(fs.readFileSync(base+'/evidence-incremental-b/macro.original').equals(fs.readFileSync(source+'/src/stdx/chir/to_string_macro/macro.cj')),'macro source restored exactly');
  fs.writeFileSync(out+'/checked.json',JSON.stringify({actualHostInitializations:checked,targetInitialization:true,namespaceFiles:names,cutRestored:true},null,2));
 } else throw Error('unknown mode '+mode);
 status='FINITE_HOST_CLOSURE_PASS';
} finally {
 fs.writeFileSync(out+'/result.json',JSON.stringify({status,mode,rows,host,target,limits:'Finite host production/consumer only; full SDK, platform cross execution not granted'},null,2));
}
