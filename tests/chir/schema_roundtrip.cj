// Compile with the actual stdx.chir sources and freshly generated bindings.
// Internal access sets compiler-origin metadata without adding a product API.
package stdx.chir

import std.collection.*

func emitBytes(label: String, data: Array<UInt8>): Unit {
    print(label + ":")
    for (byte in data) { print("${byte},") }
    println("")
}

main(args: Array<String>): Int64 {
    var nonDefault = false
    for (arg in args) { if (arg == "non-default") { nonDefault = true } }
    let pkg = Package("schema_contract", AccessLevel.Public)
    let function = pkg.addFunction(FuncType.get(Array<Type>(), UnitType.get()), "case", "case", "schema_contract")
    let group = function.addBody()
    let entry = group.appendBlock()
    let defaultTarget = group.appendBlock()
    let caseTarget = group.appendBlock()
    group.setEntryBlock(entry)
    CHIRBuilder(defaultTarget).createExit()
    CHIRBuilder(caseTarget).createExit()
    let branch = CHIRBuilder(entry).createMultiBranch(
        IntLiteral.get(IntType.getInt64(), UInt64(7)), defaultTarget,
        ArrayList<Block>([caseTarget]), ArrayList<UInt64>([UInt64(7)]))
    if (nonDefault) {
        branch._sourceExpr = SourceExpr.MatchCase
        // A high bit catches accidental narrowing of the uint64 annotation id.
        branch.setAnno<MatchCaseId, Option<UInt64>>(Some(UInt64(4294967338)))
        caseTarget.setAnno<MatchCaseId, Option<UInt64>>(Some(UInt64(0)))
    }

    let (pointer, length) = serializePackage(pkg)
    let before = Array<UInt8>(length, {i => unsafe { pointer.read(i) }})
    emitBytes("CHIR_BYTES_BEFORE", before)
    let decoded = deserializePackage(pointer, length)
    let decodedBranch = (decoded.functions[0].body.getOrThrow().entryBlock.exprs[0] as MultiBranch).getOrThrow()
    assert(decoded.name == "schema_contract", "independent package-name control")
    assert(decodedBranch.caseValues[0] == UInt64(7), "independent case-value control")
    println("CHIR_INDEPENDENT_CONTROLS_PASS")
    assert(decodedBranch.defaultTarget.getAnno<MatchCaseId, Option<UInt64>>().isNone(), "CHIR_DEFAULT_TARGET_ANNOTATION_ABSENT")
    if (nonDefault) {
        assert(decodedBranch._sourceExpr == SourceExpr.MatchCase, "CHIR_SOURCE_EXPR_ROUNDTRIP")
        assert(decodedBranch.getAnno<MatchCaseId, Option<UInt64>>().getOrThrow() == UInt64(4294967338), "CHIR_MATCH_CASE_ID_ROUNDTRIP")
        assert(decodedBranch.targetsWithoutDefault[0].getAnno<MatchCaseId, Option<UInt64>>().getOrThrow() == UInt64(0), "CHIR_MATCH_CASE_ZERO_ROUNDTRIP")
    } else {
        assert(decodedBranch._sourceExpr == SourceExpr.Other, "CHIR_SOURCE_EXPR_DEFAULT")
        assert(decodedBranch.getAnno<MatchCaseId, Option<UInt64>>().isNone(), "CHIR_ANNOTATION_ABSENT")
        assert(decodedBranch.targetsWithoutDefault[0].getAnno<MatchCaseId, Option<UInt64>>().isNone(), "CHIR_CASE_TARGET_ANNOTATION_ABSENT")
    }
    let (second, secondLength) = serializePackage(decoded)
    emitBytes("CHIR_BYTES_AFTER", Array<UInt8>(secondLength, {i => unsafe { second.read(i) }}))
    unsafe { freeSerializedMemory() }
    println("CHIR_SCHEMA_ROUNDTRIP_PASS")
    return 0
}
