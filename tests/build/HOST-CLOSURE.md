# Host macro production and public SDK execution

Current explicit host configuration must use the SDK containing the public `cjc`
selected on PATH. `STDX_HOST_CANGJIE_HOME=<execution-sdk>` is not permission to
mix an official host compiler's macros with a different target-producing compiler.
Both macro and target compile commands use that same public executor; target flags,
target CJOs and target library/install locations remain target-specific. A mismatched
explicit executor is rejected during the normal public `build.py` configuration.

Host metadata remains in `host-closure/modules/<host-tuple>/stdx`. Only macro images
are published in `host-closure/macros/<host-tuple>/stdx` for target compilation,
followed by the target module directory. The publication file is the actual
consumer dependency, including incremental recovery after its removal. Target
compilation must not import host CHIR or manager CJOs. Private macro dependencies
use a relative loader path to `host-closure/lib/<host-tuple>`; the SDK launcher
retains its existing runtime isolation. Native default staging retains sibling
lookup for installed macros and adds the relative build-library lookup for the
same macro staged under `modules/<tuple>/stdx`. Windows continues using the host
closure entries in PATH; Darwin uses its loader-relative paths. These paths do
not establish ABI compatibility by themselves.

`launcher-closure.test.mjs` is the current public-launcher regression. Its explicit
inputs are `TEST_EXEC_SDK`, `TEST_OLD_HOST` (negative configuration input),
`TEST_DEPS`, `TEST_FLATC` and `TEST_SUPPORT`. It selects the actual weave/collect
producer targets in a disposable export, invokes public `build.py`, checks actual
loader initialization, and compiles/runs a target consumer. `loader-cut` cuts the
product RPATH with an independent target macro control and restores the source.
`target-metadata` makes host CHIR metadata invalid while requiring target outputs
to rebuild from target CJOs. Those dynamic modes require a working paired compiler;
they are not substitutes for full build/install/package validation.

The independent `configure-closure` mode excludes all build targets, then runs the
real public configuration for explicit native, default native and Linux→OHOS.
It examines generated producer commands and normal install rules. Its result is
only `FINITE_CONFIG_GRAPH_PASS`; it cannot claim compilation or dynamic loading.

The first public-launcher run on 2026-10-22 loaded its own host to_string macro but
crashed in cjc `Value.RemoveUserOnly` before host CHIR completed. Plugin loading,
target weave/collect, loader cut/restoration and downstream target execution did
not run. The crash is being handled by the original debugging owner. A configuration
graph result must not be reported as completing these dynamic modes.

## Frozen b2c7 evidence and fixture

The following describes the prior fixture at
`b2c7d64d864d56a3ea5d597351a12eaeefd7b8ae`. Its separate official-H/target pairing
is historical evidence, not a supported current explicit-executor configuration.
`host-closure.test.mjs` is retained unchanged with its original assertions and
failure reproduction; do not run that old pairing against the current candidate
or transfer its pass to the public-launcher consumer. Use the current regression
above for the new contract.

The SDK supplies `STDX_HOST_CANGJIE_HOME` for its actual execution-host SDK,
separately from target `CANGJIE_HOME`. Public `build.py build` resolves relative
host paths against the caller's working directory and reconfigures cached builds,
including when the variable is cleared. No explicit host value preserves the
native default; cross compilation requires an explicit host SDK.

The production chain is `build.py` → root CMake → `AddCJNATIVELibrary` →
`ChirToStringMacroHost` → `host_stdx_chir` → `host_stdx_plugin_manager` →
`PluginMacroHost`. Host modules, libraries and loader environment come from this
closure and the host SDK. Target macro/package publication and install rules
retain their target paths. The host closure is an intermediate build dependency,
not an installed target stdx package.

`host-closure.test.mjs` runs in a disposable source export on Linux x64 with:

* `TEST_HOST_SDK`: existing official host SDK.
* `TEST_TARGET_SDK`: paired target SDK used by the normal target producer.
* `TEST_STDX_DEPENDENCIES`: existing zlib and bounds source directories.
* `TEST_FLATC`: an already normally produced, executable host flatc.
* `TEST_FLATBUFFER_SUPPORT`: corresponding Cangjie support sources.

Run modes `normal`, `incremental`, `selection-cut`, `host-configuration`, then
`cross-host`, retaining each evidence directory. The cross mode also requires
the existing OHOS toolchain at the sibling
`cross-providers/ohos/sdk/native`; it compiles only host dependencies in the
cross-configured build, and executes those consumers on the real Linux host.
It does not execute or qualify OHOS libraries.

The fixture preserves the real top-level/source/library CMake graph and invokes
public `build.py`. It replaces only the unrelated third-party rebuild with the
existing real flatc, and excludes unrelated targets from ALL. With no explicit
host closure, the finite selection builds the target to_string macro and checks
the default plugin staging graph; it does not build the whole default stdx.

The host plugin consumer compiles `@CHIRPlugin` with official host cjc and checks
the loader's actual `calling init` path. A second executable consumes host CHIR's
public macro-generated `OverflowStrategy.Wrapping.toString()` and checks its
value. The product cut changes the host environment's module selection back to
target modules. It must reach the original target-macro ABI failure while an
independent target macro consumer still compiles. Restoration uses the same
public entry. Incremental gates check no-op timestamps, macro source propagation,
and missing CJO recovery; all cut sources are restored.

Native Windows/Darwin execution remains separate. Product naming is keyed to
`CMAKE_HOST_*`: cjc/flatc executable suffix, macro shared-library suffix, loader
variable, path separator, archive tool and host link recipe. Target flags do not
select host artifacts. `postBuild` skips host plugin production, and existing
CJPM/without-CHIR/without-plugin conditions retain their original applicability.
The full target build, install and SDK consumption remain the SDK owner's gates.

Recovery modes preserve initial failed test inputs and resume only incomplete
consumers or the cross fixture. They are diagnostic continuation modes, not
additional product entry points or alternate success criteria.
