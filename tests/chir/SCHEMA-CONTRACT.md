# CHIR schema consumer contract

The public Python entry accepts the nonempty environment variable
`CANGJIE_SCHEMA_DIR=<SDK>/schema`: `build.py build -t release --jobs 5` resolves
it against the invocation cwd and passes one `-DCANGJIE_SCHEMA_DIR=<absolute>`
argument to CMake. Explicit schema input reconfigures an existing build directory
as well, so recovery never silently keeps a previous selection. Configure
failure prevents the build. No new CLI option is required by SDK callers.
Without the environment variable the existing first/cached build behavior is
preserved; clearing an environment variable does not clear a preexisting CMake
cache. Use a clean build for the default sibling-source selection.

The direct CMake entry also takes `-DCANGJIE_SCHEMA_DIR=<SDK>/schema` and selects
`StdxChirFormat.fbs`. Without that option it selects the sibling compiler's
`schema/StdxChirFormat.fbs`. `CHIR_FLATC_OUTPUTS` depends on the normal Flatbuffer
ExternalProject and invokes `GenerateFlatbuffers.cmake`; the same helper is used
on configure when build/bin/flatc already exists. Generated files are explicit
CHIR sources; stale `*_generated.cj` files are excluded from the handwritten glob.
Do not rename PackageFormat, edit generated bindings, or disable CHIR.

This adaptation uses compiler schema/producer/consumer commit
`f07c55738c12c154160c313c630a42a73a51025d` without changing its encoding:

- `MultiBranch.sourceExpr` is preserved, including MATCH_CASE and default OTHER.
- The MatchCaseId annotation carries uint64, with absence distinct from present 0.
- Every IntrinsicKind and SourceExpr wire variant maps to a distinct internal
  variant and back. This includes the newer reflection/JS/exclusive-scope kinds.
- Lambda local-function and compile-time flags survive deserialization.
- MemberVarInfo retains its declared outerDef reference.
- CustomTypeDef retains the vtable's parent types, method signature and generic
  parameters, optional method function, attributes, original/parent/return types.
  These are object references remapped by the ordinary serializer ID queues,
  never retained numeric IDs from an earlier buffer.

Independent references are `schema/StdxChirFormat.fbs`,
`src/CHIR/Serializer/CHIRSerializer.cpp` and `CHIRDeserializer.cpp`, plus
`include/cangjie/CHIR/IR/IntrinsicKind.h` and
`include/cangjie/CHIR/Utils/LLVMReflectionIntrinsics.def` in that compiler commit.
The in-memory plugin producer uses RAW phase (CHIRSerializer.cpp:1440) and its
consumer reads the buffer without a phase result (CHIRDeserializer.cpp:96).
The separate file/phase import API is not implemented by this stdx buffer API.
VOID remains explicitly rejected by the existing stdx TypeKind contract;
union NONE/INVALID sentinels do not become public valid types or expressions.
Literal type is selected by the union; definition and result-local identities
are reconstructed from the existing definition/value ID graph. These facts are
not proof of runtime compatibility or permission to weaken the fixed schema.

`generated-api.test.mjs CHIR_SOURCE ACTUAL_GENERATED_FILE` checks actual generated
factory arity, referenced enum names, and complete distinct IntrinsicKind and
SourceExpr mappings. It is a finite source diagnostic, not type checking or ABI
qualification.

`schema_roundtrip.cj` must be compiled with the actual CHIR sources and freshly
produced bindings, plus the normal to_string_macro package. It calls the real
serializePackage/deserializePackage APIs. Its default and non-default modes
emit before/after wire bytes, assert independent package/case controls, and check
sourceExpr and annotation values (including a high bit and present zero).
`schema_wire_reader.cpp` compiles against the normally installed fixed compiler
header and checks the same wire independently. It must read actual emitted
bytes, not a substitute fixture labelled as stdx output.
The independent reader follows the branch's actual default/case operands through
the fixed schema's one-based value IDs. It checks both the high annotation value
and a present zero on the case block, plus absence on the default block and on
the default-mode case block. This closes a reader assertion gap; it does not
provide executed CJ wire evidence until the runtime input is resolved.

Required dynamic controls remain: independently cut each of the two new writer
and reader field paths, confirm the intended field assertion is reached while
package/case controls pass, then restore source identity and recover. Further
vtable/flag/intrinsic non-default consumption also requires actual execution.
No dynamic field/cut/restore result is claimed by adding these test files.

Observed on 2026-10-21: normal schema generation and macro compilation succeeded;
public cjc compiling the CHIR package crashed in the installed runtime before
field assertions. The fixed runtime input must be resolved by its owner before
resuming these dynamic checks. No runtime/compiler/schema replacement, full stdx
install, or platform qualification follows from the finite source checks.
