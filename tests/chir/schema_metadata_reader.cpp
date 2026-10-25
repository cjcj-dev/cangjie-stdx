// Independent f07c wire oracle. Only consume bytes emitted by schema_metadata.cj.
// Use the normally installed N header; do not generate a schema for this test.
#include "flatbuffers/StdxChirFormat_generated.h"
#include <array>
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>
#include "cangjie/CHIR/IR/AttributeInfo.h"
namespace F = CHIRFormat;
using A = Cangjie::CHIR::Attribute;
static_assert(static_cast<unsigned>(A::JAVA_HAS_DEFAULT) == 35);
static_assert(static_cast<unsigned>(A::PREVIOUSLY_DESERIALIZED) == 36);
static_assert(static_cast<unsigned>(A::DOES_NOT_THROW) == 37);
static_assert(static_cast<unsigned>(A::OBJ_C_EXPORT) == 38);
static_assert(static_cast<unsigned>(A::MATCH_PATTERN) == 39);
static_assert(static_cast<unsigned>(A::PLUGIN_ADDED) == 40);
static constexpr uint64_t bit(A attr) { return uint64_t{1} << static_cast<unsigned>(attr); }
static void require(bool ok, const char* message) {
    if (!ok) throw std::runtime_error(message);
}
static void suffixAttributes(const F::Base* base, uint64_t expected) {
    require(base && (base->attributes() & (uint64_t{63} << 35)) == expected,
        "CPP_METADATA_ATTRIBUTE_SUFFIX_BITS");
}
static std::vector<char> load(const char* path) {
    std::ifstream input(path, std::ios::binary);
    std::vector<char> bytes((std::istreambuf_iterator<char>(input)), {});
    require(bytes.size() > 8, "metadata wire missing");
    flatbuffers::Verifier verifier(reinterpret_cast<const uint8_t*>(bytes.data()), bytes.size());
    require(F::VerifyCHIRPackageBuffer(verifier), "fixed f07c metadata verifier");
    return bytes;
}
struct ClassEntry { uint32_t id; const F::ClassDef* value; };
static ClassEntry classByName(const F::CHIRPackage* p, const std::string& name) {
    for (uint32_t i = 0; i < p->defs()->size(); ++i) {
        if (p->defs_type()->Get(i) != F::CustomTypeDefElem_ClassDef) continue;
        const auto* c = static_cast<const F::ClassDef*>(p->defs()->Get(i));
        if (c->base()->srcCodeIdentifier()->str() == name) return {i + 1, c};
    }
    throw std::runtime_error("class not found: " + name);
}
static uint32_t functionByName(const F::CHIRPackage* p, const std::string& name) {
    for (uint32_t i = 0; i < p->values()->size(); ++i) {
        if (p->values_type()->Get(i) != F::ValueElem_Function) continue;
        const auto* f = static_cast<const F::Function*>(p->values()->Get(i));
        if (f->base()->srcCodeIdentifier()->str() == name) return i + 1;
    }
    throw std::runtime_error("function not found: " + name);
}
template<class T> static const T* valueAt(const F::CHIRPackage* p, uint32_t id, F::ValueElem tag) {
    require(id > 0 && id <= p->values()->size(), "attribute value reference range");
    require(p->values_type()->Get(id - 1) == tag, "attribute value reference tag");
    return static_cast<const T*>(p->values()->Get(id - 1));
}
template<class T> static const T* typeAt(const F::CHIRPackage* p, uint32_t id, F::TypeElem tag) {
    require(id > 0 && id <= p->types()->size(), "type reference range");
    require(p->types_type()->Get(id - 1) == tag, "type reference tag");
    return static_cast<const T*>(p->types()->Get(id - 1));
}
static void classType(const F::CHIRPackage* p, uint32_t type, uint32_t def) {
    const auto* t = typeAt<F::CustomType>(p, type, F::TypeElem_CustomType);
    require(t->base()->kind() == F::CHIRTypeKind_CLASS && t->customTypeDef() == def, "class type/definition reference");
}
static void primitive(const F::CHIRPackage* p, uint32_t type, F::CHIRTypeKind kind) {
    require(typeAt<F::Type>(p, type, F::TypeElem_Type)->kind() == kind, "primitive type reference");
}
static void signature(const F::CHIRPackage* p, uint32_t id, uint32_t argument) {
    const auto* f = typeAt<F::FuncType>(p, id, F::TypeElem_FuncType);
    require(f->base()->kind() == F::CHIRTypeKind_FUNC, "function type kind");
    const auto* args = f->base()->argTys();
    require(args && args->size() == 2 && args->Get(0) == argument && args->Get(1) == argument,
        "function argument/return references");
    require(!f->isCFuncType() && !f->hasVarArg(), "function type flags");
}
struct Ids { uint32_t child; uint32_t implementation; };
static Ids inspect(const F::CHIRPackage* p, bool remapped) {
    require(p->name()->str() == "schema_metadata", "metadata package control");
    const auto child = classByName(p, "Child"), parent = classByName(p, "Parent");
    const auto implementation = functionByName(p, "implementation");
    functionByName(p, "transport");
    if (remapped) functionByName(p, "padding");
    require(child.value->base()->instanceMemberVars()->size() == 1 &&
        parent.value->base()->instanceMemberVars()->size() == 1, "member count control");
    std::cout << "CPP_METADATA_INDEPENDENT_CONTROLS_PASS\n";
    const auto defaults = classByName(p, "JavaDefaults");
    const auto defaultMethodId = functionByName(p, "defaultMethod");
    const auto* defaultMethod = valueAt<F::Function>(p, defaultMethodId, F::ValueElem_Function);
    require(defaults.value->base()->methods()->size() == 1 &&
        defaults.value->base()->methods()->Get(0) == defaultMethodId, "default method reference");
    const auto plugin = bit(A::PLUGIN_ADDED);
    suffixAttributes(defaults.value->base()->base(), plugin | bit(A::JAVA_HAS_DEFAULT));
    suffixAttributes(parent.value->base()->base(), plugin | (remapped ? bit(A::PREVIOUSLY_DESERIALIZED) : 0));
    suffixAttributes(defaultMethod->base()->base()->base(), plugin | bit(A::DOES_NOT_THROW));
    suffixAttributes(child.value->base()->base(), plugin | bit(A::OBJ_C_EXPORT));
    const auto* pattern = valueAt<F::Function>(p, functionByName(p, "pattern"), F::ValueElem_Function);
    const auto* patternGroup = valueAt<F::BlockGroup>(p, pattern->body(), F::ValueElem_BlockGroup);
    require(patternGroup->blocks()->size() == 3, "pattern block count control");
    for (auto id : *patternGroup->blocks()) {
        const auto* block = valueAt<F::Block>(p, id, F::ValueElem_Block);
        suffixAttributes(block->base()->base(), plugin | (id == patternGroup->entryBlock() ? bit(A::MATCH_PATTERN) : 0));
    }
    std::cout << "CPP_METADATA_ATTRIBUTE_SUFFIX_PASS\n";
    require(p->phase() == F::Phase_RAW, "in-memory plugin RAW contract");
    require(child.value->base()->instanceMemberVars()->Get(0)->outerDef() == child.id, "child member outerDef");
    require(parent.value->base()->instanceMemberVars()->Get(0)->outerDef() == parent.id, "parent member outerDef");
    classType(p, child.value->superClass(), parent.id);
    const auto* tables = child.value->base()->vtable();
    require(tables && tables->size() == 1, "vtable missing");
    const auto* table = tables->Get(0);
    classType(p, table->srcParentType(), parent.id);
    require(table->virtualMethods() && table->virtualMethods()->size() == 3, "vtable method count");
    uint32_t sharedGeneric = 0, sharedSig = 0, sharedOriginal = 0;
    for (uint32_t i = 0; i < 3; ++i) {
        const auto* m = table->virtualMethods()->Get(i);
        require(m->funcName()->str() == "virtual_" + std::to_string(i), "vtable method name");
        require(m->instance() == (i == 2 ? 0 : implementation), "vtable shared/null function");
        require(m->attributes() == 16 + i, "vtable attributes");
        classType(p, m->parentType(), child.id);
        primitive(p, m->returnType(), F::CHIRTypeKind_INT64);
        const auto* generics = m->methodGenericTypeParams();
        require(generics && generics->size() == 1, "vtable generic vector");
        const auto generic = generics->Get(0);
        const auto* g = typeAt<F::GenericType>(p, generic, F::TypeElem_GenericType);
        require(g->identifier()->str() == "schema_metadata.G" && g->srcCodeIdentifier()->str() == "G", "vtable generic identity");
        signature(p, m->sigType(), m->returnType());
        signature(p, m->originalType(), generic);
        require(m->sigType() != m->originalType(), "distinct original/instantiated signatures");
        if (i == 0) { sharedGeneric = generic; sharedSig = m->sigType(); sharedOriginal = m->originalType(); }
        require(generic == sharedGeneric && m->sigType() == sharedSig && m->originalType() == sharedOriginal,
            "shared vtable type references");
    }
    // Fixed f07c enum labels, independent of stdx's writer/reader mapping table.
    const std::array<F::IntrinsicKind, 21> expected = {
        F::IntrinsicKind_IS_TUPLE, F::IntrinsicKind_IS_FUNCTION, F::IntrinsicKind_IS_ENUM,
        F::IntrinsicKind_IS_BOX, F::IntrinsicKind_GET_TYPE_ARGS, F::IntrinsicKind_GET_INSTANCE_FIELD_NAME,
        F::IntrinsicKind_GET_INSTANCE_FIELD_TYPE, F::IntrinsicKind_GET_INSTANCE_FIELD_ANNOTATIONS,
        F::IntrinsicKind_GET_INSTANCE_FIELD_MODIFIER, F::IntrinsicKind_GET_NUM_OF_FIELD_TYPES,
        F::IntrinsicKind_GET_FIELD_TYPES, F::IntrinsicKind_NEW_AND_INIT_OBJECT, F::IntrinsicKind_GET_ASSOCIATED_VALUES,
        F::IntrinsicKind_GET_NUM_OF_FUNCTION_SIGNATURETYPES, F::IntrinsicKind_GET_FUNCTION_SIGNATURE_TYPES,
        F::IntrinsicKind_GET_NUM_OF_ENUM_CONSTRUCTOR_INFOS, F::IntrinsicKind_GET_ENUM_CONSTRUCTOR_INFO,
        F::IntrinsicKind_GET_ENUM_CONSTRUCTOR_NAME, F::IntrinsicKind_GET_ENUM_CONSTRUCTOR_INFO_FROM_ANY,
        F::IntrinsicKind_GET_JSLAMBDA_ADDR, F::IntrinsicKind_EXCLUSIVE_SCOPE};
    std::array<unsigned, 21> intrinsicCount{};
    std::array<unsigned, 4> lambdaCount{};
    for (uint32_t i = 0; i < p->exprs()->size(); ++i) {
        if (p->exprs_type()->Get(i) == F::ExpressionElem_IntrinsicBase) {
            const auto* intrinsic = static_cast<const F::IntrinsicBase*>(p->exprs()->Get(i));
            bool found = false;
            for (size_t j = 0; j < expected.size(); ++j) if (intrinsic->intrinsicKind() == expected[j]) {
                ++intrinsicCount[j]; found = true;
            }
            require(found, "unexpected intrinsic kind");
        } else if (p->exprs_type()->Get(i) == F::ExpressionElem_Lambda) {
            const auto* lambda = static_cast<const F::Lambda*>(p->exprs()->Get(i));
            const auto name = lambda->srcCodeName()->str();
            require(name.size() == 8 && name.substr(0, 7) == "lambda_" && name[7] >= '0' && name[7] <= '3', "lambda name");
            const unsigned index = name[7] - '0'; ++lambdaCount[index];
            require(lambda->isLocalFunc() == (index >= 2), "lambda local flag");
            require(lambda->isCompileTimeValue() == (index % 2 == 1), "lambda compile-time flag");
            require(lambda->body() > 0 && lambda->body() <= p->values()->size(), "lambda body range");
            require(p->values_type()->Get(lambda->body() - 1) == F::ValueElem_BlockGroup, "lambda body tag");
            const auto* group = static_cast<const F::BlockGroup*>(p->values()->Get(lambda->body() - 1));
            require(group->ownedExpression() == i + 1, "lambda body/owner identity");
        }
    }
    for (auto n : intrinsicCount) require(n == 1, "intrinsic mapping coverage");
    for (auto n : lambdaCount) require(n == 1, "lambda flag coverage");
    return {child.id, implementation};
}
int main(int argc, char** argv) {
    try {
        require(argc == 3, "usage: metadata-reader BEFORE REMAPPED");
        const auto before = load(argv[1]), remapped = load(argv[2]);
        const auto a = inspect(F::GetCHIRPackage(before.data()), false);
        const auto b = inspect(F::GetCHIRPackage(remapped.data()), true);
        require(a.child != b.child && a.implementation != b.implementation, "graph IDs did not change");
        std::cout << "CPP_METADATA_FIXED_SCHEMA_PASS\n";
        return 0;
    } catch (const std::exception& e) { std::cerr << e.what() << '\n'; return 1; }
}
