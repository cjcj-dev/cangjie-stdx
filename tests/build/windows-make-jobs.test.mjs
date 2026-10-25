#!/usr/bin/env zx
// Public Python CLI with external command recorders. The Windows platform and
// tool processes are controlled fixtures; this does not build a Windows SDK.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = process.env.STDX_JOBS_EVIDENCE || fs.mkdtempSync(path.join(os.tmpdir(), 'stdx-jobs-'));
const python = process.env.STDX_TEST_PYTHON || '/usr/bin/python3';
if (fs.existsSync(path.join(root, 'build_temp'))) throw Error('Run this fixture only in a clean isolated source export');
fs.mkdirSync(out, {recursive: true});
const toolBody = `#!${process.execPath}
const fs = require('node:fs'), path = require('node:path');
const tool = path.basename(process.argv[1]), args = process.argv.slice(2);
const probe = tool === 'ninja' && args[0] === '--version';
const rc = probe ? Number(process.env.PROBE_RC || 0)
  : tool === 'cmake' ? Number(process.env.CONFIGURE_RC || 0)
  : Number(process.env.BUILD_RC || 0);
fs.appendFileSync(process.env.TOOL_EVENTS, JSON.stringify({tool,args,cwd:process.cwd(),rc}) + '\\n');
if (tool === 'cmake' && rc === 0) fs.writeFileSync('configured.json', JSON.stringify(args));
if (!probe && (tool === 'ninja' || tool === 'mingw32-make') && !fs.existsSync('configured.json')) process.exit(92);
console.log(probe ? '1.11.1' : 'CONTROLLED_COMMAND ' + tool);
process.exit(rc);
`;

function scenario(name, {platform = 'Windows', ninja = 'missing', configureRc = 0, buildRc = 0} = {}) {
  const dir = path.join(out, name), bin = path.join(dir, 'bin'), hook = path.join(dir, 'hook');
  fs.mkdirSync(bin, {recursive: true});
  fs.mkdirSync(hook);
  // Python still runs build.py as __main__, including argparse, compiler
  // selection, configure, Popen, log_output and exit handling. No product
  // function or subprocess implementation is replaced.
  fs.writeFileSync(path.join(hook, 'sitecustomize.py'),
    `import platform, multiprocessing\nplatform.system = lambda: ${JSON.stringify(platform)}\nmultiprocessing.cpu_count = lambda: 4\n`);
  for (const tool of ['cmake', 'mingw32-make', 'x86_64-w64-mingw32-gcc.exe', 'x86_64-w64-mingw32-g++.exe', 'clang', 'clang++', ...(ninja === 'missing' ? [] : ['ninja'])]) {
    fs.writeFileSync(path.join(bin, tool), toolBody, {mode: 0o755});
  }
  const eventsFile = path.join(dir, 'events.jsonl');
  let calls = 0;
  return {
    run(jobs) {
      const argv = [path.join(root, 'build.py'), 'build', '-t', 'release', ...(jobs === undefined ? [] : ['--jobs', String(jobs)])];
      const result = spawnSync(python, argv, {cwd: root, encoding: 'utf8', timeout: 15000,
        env: {...process.env, PATH: bin, PYTHONPATH: hook, PYTHONDONTWRITEBYTECODE: '1',
          TOOL_EVENTS: eventsFile, PROBE_RC: ninja === 'bad-version' ? '19' : '0',
          CONFIGURE_RC: String(configureRc), BUILD_RC: String(buildRc)}});
      const label = String(++calls);
      fs.writeFileSync(path.join(dir, label + '.stdout'), result.stdout || '');
      fs.writeFileSync(path.join(dir, label + '.stderr'), result.stderr || '');
      fs.writeFileSync(path.join(dir, label + '.result.json'), JSON.stringify({argv: [python, ...argv], rc: result.status, signal: result.signal, error: result.error?.message}));
      return result;
    },
    events() { return fs.existsSync(eventsFile) ? fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : []; },
    close() {
      const build = path.join(root, 'build_temp');
      if (fs.existsSync(build)) fs.renameSync(build, path.join(dir, 'build_temp'));
    },
  };
}

function successCase(name, options, jobs, tool, expectedArgs, generator) {
  test(name, () => {
    const s = scenario(name, options);
    try {
      const r = s.run(jobs), events = s.events();
      assert.equal(r.status, 0, r.stderr + r.stdout);
      const configure = events.find(e => e.tool === 'cmake');
      assert.ok(configure, 'real configure process ran');
      assert.equal(configure.args[configure.args.indexOf('-G') + 1], generator);
      const invocation = events.find(e => e.tool === tool && e.args[0] !== '--version');
      assert.ok(invocation, 'real build process ran');
      console.log('STDX_JOBS_ARGV_ASSERTION_REACHED ' + name);
      assert.deepEqual(invocation.args, expectedArgs);
    } finally { s.close(); }
  });
}

successCase('make-explicit-one', {}, 1, 'mingw32-make', ['-j1'], 'MinGW Makefiles');
successCase('make-oversubscribed', {}, 7, 'mingw32-make', ['-j7'], 'MinGW Makefiles');
successCase('make-default', {}, undefined, 'mingw32-make', ['-j6'], 'MinGW Makefiles');
successCase('make-zero-default', {}, 0, 'mingw32-make', ['-j6'], 'MinGW Makefiles');
successCase('make-ninja-probe-failure', {ninja: 'bad-version'}, 3, 'mingw32-make', ['-j3'], 'MinGW Makefiles');
successCase('windows-ninja-explicit-control', {ninja: 'present'}, 2, 'ninja', ['-j', '2'], 'Ninja');
successCase('windows-ninja-default-control', {ninja: 'present'}, undefined, 'ninja', [], 'Ninja');
successCase('linux-ninja-control', {platform: 'Linux', ninja: 'present'}, 2, 'ninja', ['-j', '2'], 'Ninja');

test('make-resume-changed-jobs', () => {
  const s = scenario('make-resume-changed-jobs');
  try {
    assert.equal(s.run(1).status, 0);
    const firstConfigure = s.events().find(e => e.tool === 'cmake');
    assert.ok(firstConfigure, 'first configure ran');
    const marker = path.join(firstConfigure.cwd, 'resume-marker');
    fs.writeFileSync(marker, 'keep incremental build state');
    assert.equal(s.run(3).status, 0);
    const events = s.events();
    const configures = events.filter(e => e.tool === 'cmake');
    assert.equal(configures.length, 2, 'resume reconfigures public schema/host inputs');
    assert.equal(configures[1].cwd, firstConfigure.cwd, 'resume reuses the build directory');
    assert.deepEqual(configures[1].args, firstConfigure.args, 'jobs change only the build invocation');
    assert.equal(fs.readFileSync(marker, 'utf8'), 'keep incremental build state');
    assert.deepEqual(events.filter(e => e.tool === 'cmake' || e.tool === 'mingw32-make').map(e => e.tool),
      ['cmake', 'mingw32-make', 'cmake', 'mingw32-make'], 'each build follows a successful configure');
    const calls = events.filter(e => e.tool === 'mingw32-make');
    assert.equal(calls.length, 2);
    console.log('STDX_JOBS_ARGV_ASSERTION_REACHED make-resume-changed-jobs');
    assert.deepEqual(calls.map(e => e.args), [['-j1'], ['-j3']]);
  } finally { s.close(); }
});

test('make-failure-propagation-control', () => {
  const s = scenario('make-failure-propagation-control', {buildRc: 37});
  try {
    const r = s.run();
    assert.equal(s.events().find(e => e.tool === 'mingw32-make')?.rc, 37);
    console.log('STDX_JOBS_FAILURE_ASSERTION_REACHED make');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /build error: 37/);
  } finally { s.close(); }
});

test('configure-failure-control', () => {
  const s = scenario('configure-failure-control', {configureRc: 23});
  try {
    const r = s.run(1);
    assert.equal(s.events().find(e => e.tool === 'cmake')?.rc, 23);
    assert.equal(s.events().filter(e => e.tool === 'mingw32-make').length, 0);
    console.log('STDX_JOBS_FAILURE_ASSERTION_REACHED configure');
    assert.equal(r.status, 1);
    assert.match(r.stdout, /build error: 23/);
  } finally { s.close(); }
});
