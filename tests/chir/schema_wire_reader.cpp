// Independent consumer: compile against the fixed compiler's normally installed
// StdxChirFormat_generated.h, not against a stdx-generated schema or a mirror.
#include "flatbuffers/StdxChirFormat_generated.h"
#include <fstream>
#include <iostream>
#include <iterator>
#include <stdexcept>
#include <string>
#include <vector>
static void check(bool value, const char* message) {
    if (!value) throw std::runtime_error(message);
}
int main(int argc, char** argv) {
    try {
        check(argc == 3, "usage: reader FILE non-default|default");
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
            bool idFound = false;
            const auto* base = branch->base()->base();
            if (base->annos_type()) for (flatbuffers::uoffset_t j = 0; j < base->annos_type()->size(); ++j) {
                if (base->annos_type()->Get(j) != CHIRFormat::Annotation_matchCaseId) continue;
                idFound = true;
                auto id = static_cast<const CHIRFormat::MatchCaseId*>(base->annos()->Get(j));
                check(id->id() == 4294967338ULL, "CPP_MATCH_CASE_ID_WIRE");
            }
            check(idFound == nonDefault, "CPP_ANNOTATION_PRESENCE");
        }
        check(found, "MultiBranch not reached");
        std::cout << "CPP_FIXED_SCHEMA_PASS\n";
        return 0;
    } catch (const std::exception& e) {
        std::cerr << e.what() << '\n';
        return 1;
    }
}
