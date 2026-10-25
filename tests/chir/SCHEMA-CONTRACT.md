# CHIR schema consumer contract

The public Python entry accepts the nonempty environment variable
`CANGJIE_SCHEMA_DIR=<SDK>/schema`: `build.py build -t release --jobs 5` resolves
it against the invocation cwd and passes one `-DCANGJIE_SCHEMA_DIR=<absolute>`
argument to CMake. Explicit schema input reconfigures an existing build directory
as well, so recovery never silently keeps a previous selection. Configure
failure prevents the build. No new CLI option is required by SDK callers.
Without the environment variable the existing first/cached build behavior is
preserved; clearing an environment variable does not clear a preexisting CMake
cache. Use a clean build for the default installed-SDK selection.

The direct CMake entry also takes `-DCANGJIE_SCHEMA_DIR=<SDK>/schema` and selects
`StdxChirFormat.fbs`. Without that option it selects
`$CANGJIE_HOME/schema/StdxChirFormat.fbs`. The canonical `CangjieFlatbuffers.cmake`
uses the installed SDK's flatc and records both the executable and selected schema
as dependencies of `CHIR_FLATC_OUTPUTS`. Its content-preserving copy replaces the
old namespace-rewriting helper: generated CHIR code imports the private
`flatbuffers` package supplied by the SDK. Generated files are explicit CHIR
sources; stale `*_generated.cj` files are excluded from the handwritten glob.
Do not rename PackageFormat, edit generated bindings, or disable CHIR.

The 2026-10-25 integration retains the metadata contract below against compiler
`41b22350b8eb5b0c8244704f906b7b8d3096eb9c`. Its schema and AttributeInfo.h match
the installed host `1.3.0-alpha.20261025001053` after CRLF normalization. The
canonical removal of HasInitedField and its real SDK attribute check remain.
This source comparison does not qualify dynamic serialization. The older
execution observations below retain their original inputs and scope.

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

`schema_metadata.cj` is a separate main for the same real serializer/deserializer.
It prepares four Lambda flag combinations, direct member outerDef references in
a parent/child hierarchy, a forward parent reference, three nonempty vtable
entries sharing signatures/generic/function references, and a null function.
After the first deserialize it adds a function, removes the implementation's
direct package-list entry while keeping its vtable references, and reorders
definitions before serializing again. The real serializer queue must rediscover
that function and assign changed IDs. It does not
invent a different-container member as a compiler-supported inheritance case:
f07c serializes a class's direct instance variables.

`schema_metadata_reader.cpp BEFORE REMAPPED` checks both actual emitted buffers
against the normally installed fixed compiler header. It resolves type/value/def
references, checks every vtable field, all four Lambda combinations and 21 added
intrinsic labels, and requires the child/implementation IDs to change between
buffers. Its oracle is f07c schema and Serializer/Deserializer, not stdx's enum
mapping. RAW is asserted for this buffer-plugin API only. No file-phase import
support is inferred.

The intrinsic nodes in this fixture exercise transport of the 21 tags only;
their empty calls/unit results are not claims about valid lowering signatures
or runnable intrinsic programs. Actual compiler-produced input and normal full
stdx/plugin qualification remain separate requirements. Both CJ test programs
are uncompiled/unexecuted while TASK20:32's runtime input is unresolved; compiling
either independent C++ reader does not create CJ wire evidence. All prepared
dynamic cases and their product cuts remain NOT_RUN.

Observed on 2026-10-21: normal schema generation and macro compilation succeeded;
public cjc compiling the CHIR package crashed in the installed runtime before
field assertions. The fixed runtime input must be resolved by its owner before
resuming these dynamic checks. No runtime/compiler/schema replacement, full stdx
install, or platform qualification follows from the finite source checks.
# 20261025 attribute suffix and native-call compatibility

`schema_metadata.cj` transports JavaHasDefault on an interface with a default
method, DoesNotThrow on that method, ObjCExport on a class, MatchPattern on a
pattern-evaluation block (with unmarked case/default bodies), and PluginAdded
from normal package/builder constructors. After decoding, the reused parent
declaration carries PreviouslyDeserialized in the remapped graph. This checks
the compiler-origin marker's transport, not the compiler's reuse decision or
Java/Objective-C lowering. All six attributes are checked for both presence
and absence, against bits 35–40, before and after serialization.

The independent metadata reader includes the official H's
`cangjie/CHIR/IR/AttributeInfo.h`, asserts its fixed enum indices, and checks
wire masks via that enum. Compile it using the same H include root as the
installed `flatbuffers/StdxChirFormat_generated.h`. The old 21 intrinsic tags,
four Lambda cases, vtable metadata, and reference-remapping assertions remain.
Both CJ fixtures call the canonical `@C freeSerializedMemory` in `unsafe`
context; they still release the shared serialization builder.

The pattern's actual integer-literal operand comes from canonical literal
interning, which does not set PluginAdded. The CJ semantic/raw-bit checks and
independent wire reader check all six suffix bits absent on that operand before
and after remapping, alongside the marked-node positive controls. The complete
model check runs after remapping serialization/deserialization: the removed
implementation root must be rediscovered through the vtable reference queue.

If the qualified H omits `StdxChirFormat_generated.h`, generate that C++ header
using H's normal flatc against the fixed compiler/H `StdxChirFormat.fbs` into a
private include directory. Use H's FlatBuffers runtime and AttributeInfo headers.
Do not derive the independent oracle header from stdx's generated CJ bindings.
