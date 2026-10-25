import std.convert.*
import std.fs.*
import std.runtime.*
import std.sync.*
import stdx.crypto.x509.*
import stdx.crypto.keys.*
import stdx.crypto.common.*
import stdx.crypto.digest.SM3
import stdx.compress.tar.*

foreign func probe_mode(mode: Int32): Unit
foreign func probe_reset_failures(): Int32
foreign func probe_failed_frees(): Int32
foreign func probe_duplicate_frees(): Int32

class FinalizerMark {
    let flag: AtomicBool
    init(flag: AtomicBool) { this.flag = flag }
    ~init() { flag.store(true) }
}

func awaitFinalizers() {
    let finished = AtomicBool(false)
    var marker = Some(FinalizerMark(finished))
    let before = getGCCount()
    marker = None
    gc(heavy: true)
    var spins = 0
    while (getGCCount() <= before && spins < 100000000) { spins++ }
    spins = 0
    while (!finished.load() && spins < 100000000) { spins++ }
    println("FINALIZER_WAIT gc=${getGCCount()} before=${before} done=${finished.load()} spins=${spins}")
    check(finished.load(), "sm3_finalizer_observed")
}

func check(ok: Bool, label: String) {
    println("ASSERT_REACHED ${label} result=${ok}")
    if (!ok) { throw Exception("TARGET_ASSERT_FAILED ${label}") }
}
func sm3Control() {
    let digest = SM3()
    digest.write("abc".toArray())
    let expected: Array<Byte> = [0x66,0xc7,0xf0,0xf4,0x62,0xee,0xed,0xd9,0xd1,0xf2,0xd4,0x6b,0xdc,0x10,0xe4,0xe2,
        0x41,0x67,0xc4,0x87,0x5c,0xf2,0xf7,0xa2,0x29,0x7d,0xa0,0x2b,0x8f,0x4b,0xa8,0xe0]
    check(digest.finish() == expected, "sm3_abc")
    digest.reset()
    digest.write("abc".toArray())
    check(digest.finish() == expected, "sm3_reset_control")
}
func sm3Failure() {
    let digest = SM3()
    unsafe { probe_mode(6) }
    var failed = false
    try { digest.reset() } catch (e: CryptoException) {
        println("RESET_EXCEPTION ${e.message}")
        failed = e.message == "Failed to initialize SM3 context."
    }
    check(failed, "sm3_reset_target_exception")
    unsafe {
        check(probe_reset_failures() == 1, "sm3_init_failure_reached")
        check(probe_failed_frees() == 1, "sm3_failed_ctx_released")
    }
}
func x509(mode: Int32, fixtures: String) {
    let parent = X509Certificate.decodeFromPem(String.fromUtf8(File.readFrom("${fixtures}/cert.pem")))[0]
    let key = RSAPrivateKey.decodeFromPem(String.fromUtf8(File.readFrom("${fixtures}/key.pem")))
    let parsed = X509CertificateRequest.decodeFromPem(String.fromUtf8(File.readFrom("${fixtures}/csr.pem")))[0]
    check(X509Certificate.decodeFromDer(parent.encodeToDer()).encodeToDer() == parent.encodeToDer(), "cert_decode_roundtrip")
    check(X509CertificateRequest.decodeFromDer(parsed.encodeToDer()).encodeToDer() == parsed.encodeToDer(), "csr_decode_roundtrip")
    var badCert = false
    try { X509Certificate.decodeFromDer(DerBlob([0,0])) } catch (_: X509Exception) { badCert = true }
    check(badCert, "cert_invalid_der")
    var badCsr = false
    try { X509CertificateRequest.decodeFromDer(DerBlob([0,0])) } catch (_: X509Exception) { badCsr = true }
    check(badCsr, "csr_invalid_der")
    let name = X509Name(commonName: "lane-test")
    let info = X509CertificateRequestInfo(subject: name, dnsNames: ["lane.example"],
        emailAddresses: ["lane@example.invalid"], IPAddresses: [[127,0,0,1]])
    unsafe { probe_mode(mode) }
    var message = ""
    try {
        if (mode == 0 || mode == 1 || mode == 2) {
            let cert = X509Certificate(X509CertificateInfo(subject: name), parent: parent,
                publicKey: RSAPublicKey(key), privateKey: key, signatureAlgorithm: SignatureAlgorithm.SHA256WithRSA)
            check(cert.encodeToDer().size > 0, "cert_generated")
        }
        if (mode != 1 && mode != 2) {
            let csr = X509CertificateRequest(key, certificateRequestInfo: info,
                signatureAlgorithm: SignatureAlgorithm.SHA256WithRSA)
            check(csr.encodeToDer().size > 0, "csr_generated")
        }
    } catch (e: X509Exception) { message = e.message; println("X509_EXCEPTION ${message}") }
    unsafe { probe_mode(0) }
    let expected = match (mode) {
        case 1 => "Failed to initialize X509."
        case 2 => "Failed to initialize X509: DER length mismatch."
        case 3 => "X509CSR init failed: Failed to parse the X509 request body."
        case 4 => "X509CSR init failed: DER length mismatch."
        case 5 => "X509CSR init failed: Failed to set public key."
        case _ => ""
    }
    check(message == expected, "x509_mode_${mode}")
    // Independent control runs after the injected call through the same installation.
    sm3Control()
}
func tarCase(archive: String, destination: String, outside: String, reject: Bool, overwrite: Bool, pathEntry: Bool) {
    var rejected = false
    try {
        if (pathEntry) { Tar.extract(fromTar: Path(archive), destDir: Path(destination), overwrite: overwrite) }
        else { Tar.extract(fromTar: archive, destDir: destination, overwrite: overwrite) }
    } catch (e: TarException) { rejected = true; println("TAR_EXCEPTION ${e.message}") }
    check(exists("${outside}/marker"), "tar_outside_marker_exists")
    check(String.fromUtf8(File.readFrom("${outside}/marker")) == "HARMLESS-MARKER", "tar_outside_marker_unchanged")
    check(!exists("${outside}/newdir"), "tar_no_outside_directory")
    check(!exists("${outside}/newlink"), "tar_no_outside_link")
    check(rejected == reject, "tar_expected_rejection")
    sm3Control()
}
main(args: Array<String>): Int64 {
    if (args[0] == "sm3") {
        sm3Control()
        sm3Failure()
        awaitFinalizers()
        unsafe {
            println("RESET_COUNTS fail=${probe_reset_failures()} frees=${probe_failed_frees()} duplicates=${probe_duplicate_frees()}")
            check(probe_failed_frees() == 1 && probe_duplicate_frees() == 0, "sm3_no_second_free_after_destructor")
        }
    } else if (args[0] == "x509") { x509(Int32.parse(args[1]), args[2]) }
    else { tarCase(args[1],args[2],args[3],args[4] == "true", args[5] == "true",args[6] == "true") }
    return 0
}
