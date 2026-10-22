# Host macro production regression

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
