#!/usr/bin/env zx
// Real public SDK launcher, production weave/collect rules and paired target output.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const source=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),base=path.dirname(source);
const mode=process.argv[2],sdk=process.env.TEST_EXEC_SDK,oldHost=process.env.TEST_OLD_HOST;
assert(path.isAbsolute(sdk));const tuple='linux_x86_64_cjnative';
const build=source+'/build_temp/build',closure=build+'/host-closure',out=base+'/evidence-'+mode;
fs.mkdirSync(out);const rows=[];
const env={...process.env,PATH:sdk+'/bin:/usr/lib/llvm-15/bin:/usr/local/bin:/usr/bin:/bin',
 CANGJIE_HOME:sdk,STDX_HOST_CANGJIE_HOME:sdk,CANGJIE_SCHEMA_DIR:sdk+'/schema',CANGJIE_PATH:'',
 LD_LIBRARY_PATH:sdk+'/runtime/lib/'+tuple+':'+sdk+'/lib/'+tuple,
 cjHeapSize:'6GB',PYTHONDONTWRITEBYTECODE:'1',CMAKE_BUILD_PARALLEL_LEVEL:'1'};
delete env.LD_PRELOAD;delete env.LD_AUDIT;
function run(name,argv,extra={},expected=0){
 const a=fs.openSync(out+'/'+name+'.stdout','wx'),b=fs.openSync(out+'/'+name+'.stderr','wx');
 const startedAt=new Date().toISOString(),r=spawnSync(argv[0],argv.slice(1),{cwd:source,env:{...env,...extra},stdio:['ignore',a,b]});fs.closeSync(a);fs.closeSync(b);
 const row={name,argv,startedAt,finishedAt:new Date().toISOString(),rc:r.status,signal:r.signal};rows.push(row);
 fs.writeFileSync(out+'/commands.json',JSON.stringify(rows,null,2));console.log(JSON.stringify(row));
 if(expected!==null)assert.equal(r.status,expected,name+': '+out+'/'+name+'.stderr');return r.status;
}
const publicBuild=['python3',source+'/build.py','build','-t','release','--include='+sdk+'/include','--target-lib=/usr/lib/x86_64-linux-gnu','--jobs','1'];
const targetEnv={CANGJIE_PATH:build+'/modules/'+tuple,LD_LIBRARY_PATH:build+'/lib/'+tuple+':'+env.LD_LIBRARY_PATH};
function consume(label){
 const p=base+'/consumer.cj';
 fs.writeFileSync(p,`import stdx.chir.*
import stdx.plugin.manager.*
import stdx.aspect_cj.plugins.collect_aspects.*
import stdx.aspect_cj.plugins.weave_aspects.*
main(): Int64 {
 let pkg = Package("launcher_probe", AccessLevel.Public)
 if (pkg.name != "launcher_probe") { throw Exception("wrong target package") }
 if (OverflowStrategy.Wrapping.toString() != "Wrapping") { throw Exception("wrong macro output") }
 println("SDK_TARGET_WEAVE_COLLECT_ASSERT 42")
 return 0
}
`);
 run(label+'-compile',[sdk+'/bin/cjc','--jobs','1',p,'-L',build+'/lib/'+tuple,
  '-lstdx.collect_aspects','-lstdx.weave_aspects','-lstdx.aspect_cj','-lstdx.plugin.manager','-lstdx.chir','-o',base+'/'+label],targetEnv);
 run(label+'-run',[base+'/'+label],targetEnv);
 assert.match(fs.readFileSync(out+'/'+label+'-run.stdout','utf8'),/SDK_TARGET_WEAVE_COLLECT_ASSERT 42/);
}
function targetControl(){
 const p=base+'/control.cj';fs.writeFileSync(p,`package stdx.chir.selector_control
import stdx.chir.to_string_macro.*
@CHIREnumToString
public enum Control { A | B }
public func value(): String { return Control.B.toString() }
`);
 run('target-control',[sdk+'/bin/cjc','--output-type=staticlib','--jobs','1',p,'-o',base+'/control.a'],targetEnv);
}
let status='FAILED';
try{
 if(mode==='normal'){
  const deps=process.env.TEST_DEPS;
  for(const name of ['zlib','boundscheck-v1.1.16'])fs.cpSync(deps+'/'+name,source+'/third_party/'+name,{recursive:true,filter:p=>path.basename(p)!=='.git'});
  fs.copyFileSync(source+'/CMakeLists.txt',out+'/root.original');
  // FlatBuffers is produced through the canonical installed-SDK dependency graph.
  fs.appendFileSync(source+'/CMakeLists.txt',`
function(finite_launcher_selection dir)
 get_property(ts DIRECTORY "\${dir}" PROPERTY BUILDSYSTEM_TARGETS)
 foreach(t IN LISTS ts)
  if(NOT t MATCHES "^(host_stdx_|cangjieCJNATIVE(ChirToStringMacro|PluginMacroHost|CollectAspects$|WeaveAspects$)|collect_aspects$|weave_aspects$)")
   set_property(TARGET \${t} PROPERTY EXCLUDE_FROM_ALL TRUE)
  endif()
 endforeach()
 get_property(children DIRECTORY "\${dir}" PROPERTY SUBDIRECTORIES)
 foreach(child IN LISTS children)
  finite_launcher_selection("\${child}")
 endforeach()
endfunction()
finite_launcher_selection("\${CMAKE_SOURCE_DIR}")
`);
 }
 if(mode==='normal'||mode==='normal-resume'){
  run('wrong-executor',publicBuild,{STDX_HOST_CANGJIE_HOME:oldHost},1);
  assert.match(fs.readFileSync(out+'/wrong-executor.stderr','utf8'),/does not\s+match target compiler/);
  run('public-build',publicBuild,{LD_DEBUG:'libs'});
  for(const name of ['collect_aspects','weave_aspects'])assert(fs.existsSync(build+'/modules/'+tuple+'/stdx/stdx.aspect_cj.plugins.'+name+'.a'));
  const loader=fs.readFileSync(out+'/public-build.stderr','utf8')+fs.readFileSync(out+'/public-build.stdout','utf8');
  assert(loader.split('\n').some(s=>s.includes('calling init: '+closure+'/macros/'+tuple+'/stdx/lib-macro_stdx.plugin.so')),'public launcher initialized private macro');
  assert(!loader.includes(oldHost+'/runtime/'),'no official H runtime in actual loader records');
  run('macro-dynamic',['readelf','-d',closure+'/macros/'+tuple+'/stdx/lib-macro_stdx.plugin.so']);
  assert.match(fs.readFileSync(out+'/macro-dynamic.stdout','utf8'),/\$ORIGIN\/\.\.\/\.\.\/\.\.\/lib\/linux_x86_64_cjnative/);
  assert.deepEqual(fs.readdirSync(closure+'/macros/'+tuple+'/stdx').sort(),['lib-macro_stdx.chir.to_string_macro.so','lib-macro_stdx.plugin.so']);
  consume('normal');
 } else if(mode==='configure-closure'){
  // The failed dynamic experiment is retained. This independent gate configures
  // the real production graph; no compiler or failed target is rerun.
  const p=source+'/CMakeLists.txt',original=fs.readFileSync(p,'utf8');
  const selection=`
function(configuration_only dir)
 get_property(ts DIRECTORY "\${dir}" PROPERTY BUILDSYSTEM_TARGETS)
 foreach(t IN LISTS ts)
  set_property(TARGET \${t} PROPERTY EXCLUDE_FROM_ALL TRUE)
 endforeach()
 get_property(children DIRECTORY "\${dir}" PROPERTY SUBDIRECTORIES)
 foreach(child IN LISTS children)
  configuration_only("\${child}")
 endforeach()
endfunction()
configuration_only("\${CMAKE_SOURCE_DIR}")
`;
  fs.appendFileSync(p,selection);
  const check=(label,dir,explicit)=>{
   run(label+'-commands',['ninja','-C',dir,'-t','commands','cangjieCJNATIVECollectAspects','cangjieCJNATIVEWeaveAspects']);
   const commands=fs.readFileSync(out+'/'+label+'-commands.stdout','utf8');
   const target=commands.split('\n').filter(s=>s.includes('--output-type=staticlib')&&/aspect_cj\/plugins\/(collect|weave)_aspects/.test(s));
   assert.equal(target.length,2,'both actual target producer commands');
   if(explicit){
    const flatbuffers=commands.split('\n').filter(s=>s.includes('--output-type=staticlib')&&s.includes('/host-closure/modules/'+tuple+'/flatbuffers.a'));
    assert.equal(flatbuffers.length,1,'one actual host FlatBuffers producer');
    assert(flatbuffers[0].includes('CANGJIE_HOME='+sdk),'host FlatBuffers uses the paired executor SDK');
    assert(!flatbuffers[0].includes('CANGJIE_PATH='+dir+'/modules/'),'host FlatBuffers excludes target metadata');
    assert(commands.includes('/host-closure/lib/'+tuple+'/libcangjie-flatbuffers.a'),'host CHIR links its own FlatBuffers archive');
    for(const line of target){
     assert(line.includes(sdk+'/bin/cjc'),'same public executor');
     assert(line.includes('/host-closure/macros/'+tuple),'macro-only search path');
     assert(!line.includes('/host-closure/modules/'),'no host CJOs in target command');
    }
    assert(commands.includes('-rpath='),'host macro has linker RPATH argument');
   }else{
    assert(!commands.includes('/host-closure/'),'native default remains target-native');
    assert(commands.includes('ORIGIN/../../../lib/'+tuple),'staged native macro can locate target build libs');
   }
   assert(fs.readFileSync(dir+'/src/cmake_install.cmake','utf8').includes('lib-macro_stdx.plugin'),'normal target macro install retained');
  };
  try{
   run('explicit-configure',publicBuild);check('explicit',build,true);
   run('default-configure',publicBuild,{STDX_HOST_CANGJIE_HOME:undefined});check('default',build,false);
   const ohos=path.dirname(base)+'/cross-providers/ohos/sdk/native';
   const argv=[...publicBuild,'--target','ohos-aarch64','--target-toolchain',ohos+'/llvm/bin','--target-sysroot',ohos+'/sysroot'];
   run('cross-configure',argv);check('cross',source+'/build_temp/build-libs-aarch64-linux-ohos',true);
  }finally{fs.writeFileSync(p,original);}
  status='FINITE_CONFIG_GRAPH_PASS';
 } else if(mode==='resume'){
  run('public-build',publicBuild,{LD_DEBUG:'libs'});consume('resumed');
 } else if(mode==='loader-cut'){
  const p=source+'/build/common/modules/AddCangjieSource.cmake',original=fs.readFileSync(p,'utf8');
  const cut=original.replace('"-rpath=$ORIGIN/../../../lib/${STDX_HOST_CJ_LIB_DIR}"','"-rpath=$ORIGIN/nonexistent-private-libs"');assert.notEqual(cut,original);
  fs.writeFileSync(out+'/product.original',original);fs.writeFileSync(out+'/product.cut',cut);fs.writeFileSync(p,cut);
  try{
   assert.notEqual(run('public-cut',publicBuild,{},null),0);
   const log=fs.readFileSync(out+'/public-cut.stdout','utf8');assert.match(log,/libstdx.plugin.manager.so: cannot open shared object file/);
   assert.match(log,/CHIRPlugin/);targetControl();
  }finally{fs.writeFileSync(p,original);}
  run('public-restored',publicBuild,{LD_DEBUG:'libs'});consume('restored');
 } else if(mode==='target-metadata'){
  const p=closure+'/modules/'+tuple+'/stdx/stdx.chir.cjo',original=fs.readFileSync(p);
  fs.writeFileSync(out+'/host-chir.cjo.original',original);fs.writeFileSync(p,'invalid host metadata must never be imported by target compilation');
  for(const name of ['collect_aspects','weave_aspects']){const f=build+'/modules/'+tuple+'/stdx/stdx.aspect_cj.plugins.'+name+'.a';fs.renameSync(f,out+'/'+name+'.a.original');}
  try{run('public-target-metadata',publicBuild);consume('target-only');}finally{fs.writeFileSync(p,original);}
 }else throw Error('unknown mode '+mode);
 if(mode!=='configure-closure')status='FINITE_PUBLIC_LAUNCHER_PASS';
}finally{
 const cgroup=fs.readFileSync('/proc/self/cgroup','utf8').trim().split(':').slice(2).join(':');const resource={};
 for(const name of ['memory.peak','memory.events','memory.max','memory.swap.max','cpuset.cpus.effective']){try{resource[name]=fs.readFileSync('/sys/fs/cgroup'+cgroup+'/'+name,'utf8');}catch{}}
 fs.writeFileSync(out+'/result.json',JSON.stringify({status,mode,sdk,oldHost,rows,resource,scope:'finite actual launcher/target consumers, not full stdx install'},null,2));
}
