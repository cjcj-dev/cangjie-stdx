# Fixed zlib dependency consumers

The stdx default dependency is OpenHarmony `third_party_zlib` commit
`0a0c45d7e478826b59e67cc613be3e4b6957432c` (zlib 1.3.2). Its common
source with the former `OpenHarmony-v6.0-Release` tag is the tag's peeled
commit `9a1de89f7c80f8fc811527dd57135b8b4c00a2e8`. The entire fixed tree is
the dependency input; do not cherry-pick only the version or download URL.
Prepopulated SDK dependency directories must be supplied from the same fixed
input by their owner. The stdx configuration does not replace existing sources.

The normal chain is public `build.py` → root CMake → `Zlib.cmake` → private
zlib build/install → `compress/zlib/native` archive extraction →
`stdx.compress.zlibFFI` → installed static/shared `stdx.compress.zlib` →
`stdx.compress` / `TarGzip`. Both upstream zlib libraries and installation
are explicitly enabled. GNU installation directories stay beneath the private
prefix. The upstream Windows static output is now `libzs.a`; Unix remains
`libz.a`. No old `huawei_zlib_CMakeList.patch` is applied to the new CMake tree.

Run in a separate validation domain after the previous experiment ends. Keep
the old dependency, failed inputs, installation and consumer outputs. Reuse
unaffected stdx targets, the same qualified H and GCC installation. Normal
configuration rebuilds the changed dependency; the native graph determines
the affected FFI/archive/shared targets. Install to a new prefix and compile
consumers from that installation. This does not qualify a new SDK tuple.

`zlib_consumer.cj` uses the public Deflate/Gzip streaming APIs with different
input/output chunk sizes, then `TarGzip.archive/extract`. Run it in a fresh
directory containing `input/payload` (more than 32768 bytes, with mixed data)
and an empty `output` directory. Compile/run against each applicable installed
static, static-link-extern and dynamic variant. Keep explicit `-L` paths to
the selected installation and link `stdx.compress`, `stdx.compress.tar` and
`stdx.compress.zlib`; record the actual loader for dynamic consumption.
Repeat the affected consumer from the normally unpacked installation archive.

`zlib_native.c` consumes the **installed stdx FFI archive**, not a system `-lz`.
Use the generated headers from the same private zlib installation and the
installed `libstdx.compress.zlibFFI.a` as an explicit linker input. It checks
version/header agreement, new size_t APIs, overflow bounds, negative CRC
combine lengths, invalid-pointer handling and an invalid-distance stream from
upstream `test/infcover.c`, with a valid empty-stream control. Retain the normal
upstream example tests and `infcover` coverage as applicable; this small fixture
does not claim every upstream feature was executed. In particular, contrib
modules disabled by the normal upstream CMake options are not stdx consumers.

For a product cut, use a disposable validation copy and change only the
selected dependency implementation. Rebuild the actual zlib/FFI/install closure,
and require the corresponding native assertion to fail after the independent
roundtrip controls pass. Restore the implementation and rebuild normally before
claiming recovery. Never substitute an old library that fails first at version
checking for a precise semantic cut. A normal baseline must pass first.

Windows/Darwin/OHOS and optional contrib/alternate build-system coverage remain
separate gates; missing inputs are NOT_RUN. The existing launcher full mode and
cross obligations remain unchanged. Do not rerun unrelated CHIR, syntax, X509
or SM3 work merely to document this dependency update.
