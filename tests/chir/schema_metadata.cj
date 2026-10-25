// Build as a separate main with the actual stdx.chir package sources/bindings.
// This tests schema transport, not intrinsic lowering or executable CHIR IR.
package stdx.chir

import std.collection.*

func metadataKinds(): Array<IntrinsicKind> {
    return [IntrinsicKind.IsTuple, IntrinsicKind.IsFunction, IntrinsicKind.IsEnum,
        IntrinsicKind.IsBox, IntrinsicKind.GetTypeArgs, IntrinsicKind.GetInstanceFieldName,
        IntrinsicKind.GetInstanceFieldType, IntrinsicKind.GetInstanceFieldAnnotations,
        IntrinsicKind.GetInstanceFieldModifier, IntrinsicKind.GetNumOfFieldTypes,
        IntrinsicKind.GetFieldTypes, IntrinsicKind.NewAndInitObject, IntrinsicKind.GetAssociatedValues,
        IntrinsicKind.GetNumOfFunctionSignatureTypes, IntrinsicKind.GetFunctionSignatureTypes,
        IntrinsicKind.GetNumOfEnumConstructorInfos, IntrinsicKind.GetEnumConstructorInfo,
        IntrinsicKind.GetEnumConstructorName, IntrinsicKind.GetEnumConstructorInfoFromAny,
        IntrinsicKind.GetJsLambdaAddr, IntrinsicKind.ExclusiveScope]
}

func metadataFunction(pkg: Package, name: String): Function {
    for (f in pkg.functions) { if (f.srcCodeName == name) { return f } }
    throw CHIRException("missing metadata function " + name)
}

func metadataClass(pkg: Package, name: String): ClassLikeDef {
    for (d in pkg.classDefs) { if (d.srcCodeName == name) { return d } }
    throw CHIRException("missing metadata class " + name)
}

// These suffix bits are fixed by compiler 41b22350 / official 20261025 H.
// Check positive AND absent attributes, not just a writer/reader echo.
func checkSuffixAttributes(node: Base, expected: UInt64): Unit {
    let attrs = [Attribute.JavaHasDefault, Attribute.PreviouslyDeserialized,
        Attribute.DoesNotThrow, Attribute.ObjCExport, Attribute.MatchPattern, Attribute.PluginAdded]
    assert((node._attributes.getRawAttrs() & (UInt64(63) << 35)) == expected,
        "METADATA_ATTRIBUTE_SUFFIX_BITS")
    for (i in 0..attrs.size) {
        assert(node._attributes.testAttr(attrs[i]) == ((expected & (UInt64(1) << (35 + i))) != 0),
            "METADATA_ATTRIBUTE_SEMANTIC_${i}")
    }
}

func checkMetadata(pkg: Package, reused!: Bool = false): Unit {
    assert(pkg.name == "schema_metadata", "METADATA_PACKAGE_CONTROL")
    let child = metadataClass(pkg, "Child")
    let parent = metadataClass(pkg, "Parent")
    let implementation = metadataFunction(pkg, "implementation")
    let generic = GenericType.get("schema_metadata.G", "G")
    let signature = FuncType.get([IntType.getInt64()], IntType.getInt64())
    let original = FuncType.get([generic], generic)
    assert(child.instanceVars.size == 1 && parent.instanceVars.size == 1, "METADATA_MEMBER_CONTROL")
    println("METADATA_INDEPENDENT_CONTROLS_PASS")
    let plugin = UInt64(1) << 40
    let defaults = metadataClass(pkg, "JavaDefaults")
    assert(!defaults.isClass() && defaults.methods.size == 1, "METADATA_JAVA_INTERFACE_CONTROL")
    assert(refEq(defaults.methods[0], metadataFunction(pkg, "defaultMethod")), "METADATA_DEFAULT_METHOD_REFERENCE")
    checkSuffixAttributes(defaults, plugin | (UInt64(1) << 35))
    checkSuffixAttributes(parent, plugin | (if (reused) { UInt64(1) << 36 } else { UInt64(0) }))
    checkSuffixAttributes(metadataFunction(pkg, "defaultMethod"), plugin | (UInt64(1) << 37))
    checkSuffixAttributes(child, plugin | (UInt64(1) << 38))
    let patternGroup = metadataFunction(pkg, "pattern").body.getOrThrow()
    checkSuffixAttributes(patternGroup.entryBlock, plugin | (UInt64(1) << 39))
    let patternBranch = (patternGroup.entryBlock.exprs[0] as MultiBranch).getOrThrow()
    assert(patternBranch.caseValues[0] == UInt64(7), "METADATA_PATTERN_VALUE_CONTROL")
    checkSuffixAttributes(patternBranch.defaultTarget, plugin)
    checkSuffixAttributes(patternBranch.targetsWithoutDefault[0], plugin)
    println("METADATA_ATTRIBUTE_SUFFIX_PASS")
    assert(refEq(child.instanceVars[0].outerDef, child), "METADATA_CHILD_OUTER_DEF")
    assert(refEq(parent.instanceVars[0].outerDef, parent), "METADATA_PARENT_OUTER_DEF")
    assert(child.superClass.getOrThrow() == parent.ty, "METADATA_PARENT_REFERENCE")
    assert(child._vtable.size == 1, "METADATA_VTABLE_NONEMPTY")
    let table = child._vtable[0]
    assert(table.srcParentType == parent.ty, "METADATA_VTABLE_SOURCE_PARENT")
    assert(table.virtualMethods.size == 3, "METADATA_VTABLE_METHOD_COUNT")
    for (i in 0..3) {
        let method = table.virtualMethods[i]
        assert(method.funcName == "virtual_${i}", "METADATA_VTABLE_NAME")
        assert(method.sigType == signature, "METADATA_VTABLE_SIGNATURE")
        assert(method.originalType == original, "METADATA_VTABLE_ORIGINAL_TYPE")
        assert(method.parentType == child.ty, "METADATA_VTABLE_PARENT_TYPE")
        assert(method.returnType == IntType.getInt64(), "METADATA_VTABLE_RETURN_TYPE")
        assert(method.attributes == UInt64(16 + i), "METADATA_VTABLE_ATTRIBUTES")
        assert(method.methodGenericTypeParams.size == 1 &&
            method.methodGenericTypeParams[0] == generic, "METADATA_VTABLE_GENERIC")
        if (i == 2) {
            assert(method.instance.isNone(), "METADATA_VTABLE_NULL_FUNCTION")
        } else {
            assert(refEq(method.instance.getOrThrow(), implementation), "METADATA_VTABLE_SHARED_FUNCTION")
        }
    }
    let exprs = metadataFunction(pkg, "transport").body.getOrThrow().entryBlock.exprs
    for (i in 0..4) {
        let lambda = (exprs[i] as Lambda).getOrThrow()
        assert(lambda.isLocalFunc == (i >= 2), "METADATA_LAMBDA_LOCAL")
        assert(lambda.isCompileTimeValue == (i % 2 == 1), "METADATA_LAMBDA_CONST")
        assert(refEq(lambda.body.owner, lambda.result), "METADATA_LAMBDA_BODY_REFERENCE")
    }
    let kinds = metadataKinds()
    for (i in 0..kinds.size) {
        let intrinsic = (exprs[4 + i] as Intrinsic).getOrThrow()
        assert(intrinsic._calleeKind == kinds[i], "METADATA_INTRINSIC_KIND_${i}")
    }
    println("METADATA_MODEL_ASSERTIONS_PASS")
}

func emitMetadata(label: String, pkg: Package, reused!: Bool = false): Package {
    let (pointer, length) = serializePackage(pkg)
    print(label + ":")
    for (i in 0..length) {
        let byte = unsafe { pointer.read(i) }
        print("${byte},")
    }
    println("")
    let decoded = deserializePackage(pointer, length)
    checkMetadata(decoded, reused: reused)
    unsafe { freeSerializedMemory() }
    return decoded
}

main(): Int64 {
    let pkg = Package("schema_metadata", AccessLevel.Public)
    // Child precedes Parent: vtable/superclass must resolve forward definition IDs.
    let child = pkg.addClass("Child", "Child", true)
    let parent = pkg.addClass("Parent", "Parent", true)
    let parentType = (parent.ty as ClassLikeType).getOrThrow()
    child.superClass = parentType
    child.appendInstanceMemberVar("childField", IntType.getInt64())
    parent.appendInstanceMemberVar("parentField", BoolType.get())
    let unitSignature = FuncType.get(Array<Type>(), UnitType.get())
    // Compiler-origin FFI attributes belong to declarations, not vtable integers.
    // This is metadata transport; no Java/Objective-C lowering is claimed.
    let defaults = pkg.addClass("JavaDefaults", "JavaDefaults", false)
    defaults._attributes.setAttr(Attribute.JavaForeign, true)
    defaults._attributes.setAttr(Attribute.JavaHasDefault, true)
    let defaultMethod = pkg.addFunction(unitSignature, "defaultMethod", "defaultMethod", pkg.name)
    defaults.appendMethod(defaultMethod)
    defaultMethod._attributes.setAttr(Attribute.DoesNotThrow, true)
    let defaultBody = defaultMethod.addBody()
    let defaultEntry = defaultBody.appendBlock()
    defaultBody.setEntryBlock(defaultEntry)
    CHIRBuilder(defaultEntry).createExit()
    child._attributes.setAttr(Attribute.ObjCExport, true)
    // A pattern-evaluation block is marked; its case/default bodies stay unmarked.
    let pattern = pkg.addFunction(unitSignature, "pattern", "pattern", pkg.name)
    let patternBody = pattern.addBody()
    let patternEntry = patternBody.appendBlock()
    let patternDefault = patternBody.appendBlock()
    let patternCase = patternBody.appendBlock()
    patternBody.setEntryBlock(patternEntry)
    patternEntry._attributes.setAttr(Attribute.MatchPattern, true)
    CHIRBuilder(patternDefault).createExit()
    CHIRBuilder(patternCase).createExit()
    CHIRBuilder(patternEntry).createMultiBranch(IntLiteral.get(IntType.getInt64(), UInt64(7)),
        patternDefault, ArrayList<Block>([patternCase]), ArrayList<UInt64>([UInt64(7)]))
    let transport = pkg.addFunction(unitSignature, "transport", "transport", pkg.name)
    let generic = GenericType.get("schema_metadata.G", "G")
    let signature = FuncType.get([IntType.getInt64()], IntType.getInt64())
    let original = FuncType.get([generic], generic)
    let implementation = pkg.addFunction(signature, "implementation", "implementation", pkg.name)
    let methods = ArrayList<VirtualMethodInfo>()
    for (i in 0..3) {
        let instance: ?Function = if (i == 2) { None } else { Some(implementation) }
        methods.add(VirtualMethodInfo("virtual_${i}", signature, ArrayList<GenericType>([generic]),
            instance, UInt64(16 + i), original, child.ty, IntType.getInt64()))
    }
    child._vtable.add(VTableInType(parentType, methods))
    let group = transport.addBody()
    let entry = group.appendBlock()
    group.setEntryBlock(entry)
    let builder = CHIRBuilder(entry)
    for (i in 0..4) {
        let lambda = builder.createLambda(unitSignature, "lambda_${i}", "lambda_${i}")
        lambda.isLocalFunc = i >= 2
        lambda.isCompileTimeValue = i % 2 == 1
        let nested = CHIRBuilder(lambda.body.entryBlock)
        lambda.returnValue = nested.createConstant(UnitLiteral.get()).result
        nested.createExit()
    }
    // The intrinsic arguments/result here are deliberately transport-only.
    // No lowering, signature verification or executable intrinsic is claimed.
    for (kind in metadataKinds()) {
        entry.appendExpr(Intrinsic.create(UnitType.get(), kind,
            FuncCallContext(Array<Value>(), Array<Type>(), None)))
    }
    // Appending the transport nodes does not advance the earlier builder cursor.
    CHIRBuilder(entry).createExit()
    checkMetadata(pkg)
    let decoded = emitMetadata("METADATA_BYTES_BEFORE", pkg)
    // Add a root, remove the implementation's direct root, and reorder defs.
    // The vtable still owns the implementation reference: the real serializer
    // queue must discover and retain it, assigning fresh IDs.
    let padding = decoded.addFunction(unitSignature, "padding", "padding", decoded.name)
    decoded._functions = ArrayList<Function>([padding, metadataFunction(decoded, "transport"),
        metadataFunction(decoded, "defaultMethod"), metadataFunction(decoded, "pattern")])
    decoded._classDefs = ArrayList<ClassLikeDef>([metadataClass(decoded, "Parent"), metadataClass(decoded, "Child"),
        metadataClass(decoded, "JavaDefaults")])
    // Carry the compiler-origin reuse marker on the already decoded declaration.
    // The fixture does not claim to implement the compiler's reuse decision.
    metadataClass(decoded, "Parent")._attributes.setAttr(Attribute.PreviouslyDeserialized, true)
    checkMetadata(decoded, reused: true)
    emitMetadata("METADATA_BYTES_REMAPPED", decoded, reused: true)
    println("METADATA_ROUNDTRIP_PASS")
    return 0
}
