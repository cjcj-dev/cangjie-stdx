# Windows Make jobs regression

Run `node --test --test-concurrency=1 tests/build/windows-make-jobs.test.mjs`
in a clean, isolated export containing this test and the unchanged product
`build.py`. Use `STDX_JOBS_EVIDENCE` to retain per-command argv, stdout, stderr,
exit codes and build directories. `STDX_TEST_PYTHON` selects Python 3.

This is a Linux-hosted CLI wiring fixture. Python `sitecustomize` supplies a
Windows platform and four-CPU default; external command recorders stand in for
the compiler tools, CMake, Ninja and MinGW Make. The real public build.py parses
arguments, selects compilers/generator, starts those processes, handles their
exit codes and follows first-build or existing-build branches. Product functions
and subprocess are not mocked. This test does not compile stdx or qualify a
Windows toolchain, installation or SDK.

Assertions cover explicit jobs 1 and 7 (oversubscription), omitted/zero defaults,
absent Ninja, unsuccessful Ninja version probing, both Windows Ninja modes,
Linux Ninja, resumed builds with changed jobs, and configure/build failure
propagation. The executable compiler names retain Windows `.exe` suffixes.
Each scenario retains its outputs; existing build_temp is rejected up front.

For the controlled product cut, restore only the Make command's old
`str(MAKE_JOBS)` expression in the exported build.py. The four explicit/resumed
Make cases must fail at `STDX_JOBS_ARGV_ASSERTION_REACHED`; seven independent
default/Ninja/failure controls remain passing. Restore the product bytes and
repeat the same public entry. Do not change the test assertion to implement a
cut. Complete Windows native build/install/consumer coverage remains separate.
