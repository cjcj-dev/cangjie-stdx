# Canonical integration validation inputs

The integration combines canonical `4d570a1de747e20af2a26d6dacd770deb467aff0`
and fork `b10784b27a5b3f815c9542d28f3ba02f48db48d5` from common source
`9b074542049d342e7a42c1fe14d7ba35cc063a20`.

Use a fresh isolated export. The canonical generator consumes the installed SDK
FlatBuffers tool, headers and Cangjie sources. Do not copy old generated support
files into CHIR or replace `third_party/CMakeLists.txt`. Host FlatBuffers is built
with the same explicit executor/environment as host CHIR; its CJO is at the host
module root, its private archive is force-linked into the host CHIR DSO. Target
compilation retains separate target metadata and macro-image publication.

For `schema-env.test.mjs`, set `CANGJIE_HOME` to the qualified SDK,
`STDX_SCHEMA_SDK` and `STDX_SCHEMA_NATIVE` to two existing compatible schema
directories, and `STDX_SCHEMA_EVIDENCE` to a new private output directory. The
same first/cached/relative/failed-configure assertions apply. Unset and empty
inputs now exercise the canonical installed-SDK fallback on first and cached
builds. No mock compiler is used by this reduced generation fixture.

The host/launcher tests still select a finite graph and consume its build outputs;
they do not qualify the full SDK entry or install. The launcher configuration
checks additionally cover the actual host FlatBuffers producer and archive.
Run existing jobs, backport and CHIR tests with the new inputs before extending
old conclusions. Backport exception equality uses the canonical messages for
SM3 initialization and negative X509/CSR lengths; target assertions and all
controls remain. Metadata/wire programs and their non-default assertions remain
unchanged.

Full qualification must enter through the fixed SDK CLI, transfer the fixed stdx
commit, run normal build.py/CMake targets, install into a new prefix and compile
and run consumers from that prefix. Default/explicit host selection, first/cache
and missing-publication recovery remain applicable. Latest target-tuple and
durable package validation require their separately qualified inputs and output
space; a temporary official-host install supplies only its measured scope.
