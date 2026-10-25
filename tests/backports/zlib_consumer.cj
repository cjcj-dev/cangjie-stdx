import std.fs.*
import stdx.compress.zlib.*
import stdx.compress.TarGzip

func check(ok: Bool, label: String) {
    println("ZLIB_ASSERT_REACHED ${label} result=${ok}")
    if (!ok) { throw Exception("TARGET_ASSERT_FAILED ${label}") }
}

func roundtrip(wrap: WrapType, label: String, payload: Array<Byte>) {
    let packed = "${label}.compressed"
    let restored = "${label}.restored"
    try (file = File(packed, Write)) {
        let compressor = CompressOutputStream(file, wrap: wrap, bufLen: 257)
        var at = 0
        while (at < payload.size) {
            let count = if (payload.size - at > 509) { 509 } else { payload.size - at }
            compressor.write(payload.slice(at, count).toArray())
            at += count
        }
        compressor.flush()
        compressor.close()
    }
    try (input = File(packed, Read), output = File(restored, Write)) {
        let decompressor = DecompressInputStream(input, wrap: wrap, bufLen: 263)
        let buffer = Array<Byte>(521, repeat: 0)
        while (true) {
            let count = decompressor.read(buffer)
            if (count == 0) { break }
            output.write(buffer.slice(0, count).toArray())
        }
        decompressor.close()
    }
    check(File.readFrom(restored) == payload, label)
}

// Run in a fresh validator-owned directory containing input/payload and an
// empty output directory. File setup is outside the tested compression APIs.
main(): Int64 {
    let payload = File.readFrom("input/payload")
    check(payload.size > 32768, "cross_window_input")
    roundtrip(DeflateFormat, "deflate", payload)
    roundtrip(GzipFormat, "gzip", payload)
    TarGzip.archive(fromDir: "input", destFile: "archive.tar.gz", includeBaseDirectory: false)
    TarGzip.extract(fromTarGzip: "archive.tar.gz", destDir: "output", overwrite: false)
    check(File.readFrom("output/payload") == payload, "tar_gzip")
    println("STDX_INSTALLED_ZLIB_CONSUMER_PASS")
    return 0
}
