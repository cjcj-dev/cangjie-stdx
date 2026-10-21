// Independent consumer: compile against the fixed compiler's normally installed
// StdxChirFormat_generated.h, not against a stdx-generated schema or a mirror.
#include "flatbuffers/StdxChirFormat_generated.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <optional>
#include <stdexcept>
#include <string>
#include <vector>
static void check(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
}
static std::optional<uint64_t> matchCaseId(const CHIRFormat::Base* base) {
    std::optional<uint64_t> result;
    if (base->annos_type()) for (flatbuffers::uoffset_t i = 0; i < base->annos_type()->size(); ++i) {
        if (base->annos_type()->Get(i) != CHIRFormat::Annotation_matchCaseId) continue;
        check(!result.has_value(), "duplicate MatchCaseId");
        result = static_cast<const CHIRFormat::MatchCaseId*>(base->annos()->Get(i))->id();
    }
    return result;
}
static const CHIRFormat::Base* blockBase(const CHIRFormat::CHIRPackage* package, uint32_t id) {
    check(id > 0 && id <= package->values()->size(), "block reference out of range");
    check(package->values_type()->Get(id - 1) == CHIRFormat::ValueElem_Block, "target is not a block");
    return static_cast<const CHIRFormat::Block*>(package->values()->Get(id - 1))->base()->base();
}
int main(int argc, char** argv) {
    try {
        check(argc == 3, "usage: reader FILE non-default|default");
        check(std::string(argv[2]) == "non-default" || std::string(argv[2]) == "default", "unknown reader mode");
        std::ifstream input(argv[1], std::ios::binary);
        std::vector<char> bytes((std::istreambuf_iterator<char>(input)), {});
        check(bytes.size() > 8, "missing wire bytes");
        flatbuffers::Verifier verifier(reinterpret_cast<const uint8_t*>(bytes.data()), bytes.size());
        check(CHIRFormat::VerifyCHIRPackageBuffer(verifier), "f07c schema verifier");
        auto package = CHIRFormat::GetCHIRPackage(bytes.data());
        check(package->name()->str() == "schema_contract", "independent package-name control");
        bool found = false;
        bool nonDefault = std::string(argv[2]) == "non-default";
        for (flatbuffers::uoffset_t i = 0; i < package->exprs()->size(); ++i) {
            if (package->exprs_type()->Get(i) != CHIRFormat::ExpressionElem_MultiBranch) continue;
            found = true;
            auto branch = static_cast<const CHIRFormat::MultiBranch*>(package->exprs()->Get(i));
            check(branch->caseValues()->size() == 1 && branch->caseValues()->Get(0) == 7, "independent case-value control");
            std::cout << "CPP_INDEPENDENT_CONTROLS_PASS\n";
            check(branch->sourceExpr() == (nonDefault ? CHIRFormat::SourceExpr_MATCH_CASE : CHIRFormat::SourceExpr_OTHER), "CPP_SOURCE_EXPR_WIRE");
            const auto id = matchCaseId(branch->base()->base());
            check(id.has_value() == nonDefault, "CPP_ANNOTATION_PRESENCE");
            if (nonDefault) check(*id == 4294967338ULL, "CPP_MATCH_CASE_ID_WIRE");
            // f07c Terminator.cpp:37-47 appends condition, default, then cases.
            // Resolve through the fixed schema's one-based values IDs, not a
            // second stdx deserializer or a scan for an arbitrary zero value.
            const auto* operands = branch->base()->operands();
            check(operands && operands->size() == 3, "MultiBranch target shape");
            check(!matchCaseId(blockBase(package, operands->Get(1))).has_value(), "CPP_DEFAULT_TARGET_ANNOTATION_ABSENT");
            const auto zero = matchCaseId(blockBase(package, operands->Get(2)));
            check(zero.has_value() == nonDefault, "CPP_CASE_TARGET_ANNOTATION_PRESENCE");
            if (nonDefault) check(*zero == 0, "CPP_MATCH_CASE_ZERO_WIRE");
        }
        check(found, "MultiBranch not reached");
        std::cout << "CPP_FIXED_SCHEMA_PASS\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
