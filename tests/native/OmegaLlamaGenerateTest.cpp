#include "OmegaLlamaEngine.hpp"
#include <atomic>
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <fcntl.h>
#include <string>
#include <vector>
#include <thread>
#include <unistd.h>

extern "C" int omega_test_models();
extern "C" int omega_test_contexts();
extern "C" int omega_test_batches();
extern "C" int omega_test_samplers();
extern "C" int omega_test_process_calls();
extern "C" void omega_test_fail_process_at(int);
extern "C" void omega_test_output_count(int);
extern "C" void omega_test_split_utf8(int);
extern "C" void omega_test_pause_next_process();
extern "C" bool omega_test_wait_for_process();
extern "C" void omega_test_resume_process();

int main() {
    int passed = 0;
    auto test = [&](const char* name) {++passed; std::printf("PASS GENG-%02d %s\n",passed,name);};
    char name[] = "/tmp/omega-generation-XXXXXX";
    int fd = mkstemp(name); assert(fd >= 0); unlink(name);
    const std::string gguf = "GGUF" + std::string(64, 'X');
    assert(write(fd, gguf.data(), gguf.size()) == static_cast<ssize_t>(gguf.size()));
    omega::LlamaEngine engine;
    assert(engine.load(0, fd, 512, 0, 0));
    assert(engine.load(1, fd, 16, 0, 0));

    auto result = engine.generate(0, "Hello", 8);
    assert(result.status == omega::GenerationStatus::Completed);
    assert(result.output == "ab" && result.generated_tokens == 2);
    test("real batch-ext prompt+decode loop produces expected deterministic tokens");

    result = engine.generate(0, "Hello", 8);
    assert(result.status == omega::GenerationStatus::Completed && result.output == "ab");
    test("KV state cleared between consecutive prompts");

    result = engine.generate(0, std::string(300, 'x'), 8);
    assert(result.status == omega::GenerationStatus::Completed && result.output == "ab");
    test("multiple prompt batches with explicit positions");

    result = engine.generate(1, "Hi", 8);
    assert(result.status == omega::GenerationStatus::Completed && result.output == "ab");
    test("both model slots run without shared KV cache");

    assert(engine.generate(-1,"Hi",8).status == omega::GenerationStatus::InvalidRequest);
    assert(engine.generate(2,"Hi",8).status == omega::GenerationStatus::InvalidRequest);
    assert(engine.generate(0,"",8).status == omega::GenerationStatus::InvalidRequest);
    assert(engine.generate(0,"Hi",0).status == omega::GenerationStatus::InvalidRequest);
    assert(engine.generate(0,"Hi",4097).status == omega::GenerationStatus::InvalidRequest);
    assert(engine.generate(0,std::string(65537,'x'),8).status == omega::GenerationStatus::InvalidRequest);
    test("invalid slot, empty/oversized prompt and token bounds are rejected");

    omega_test_output_count(12);
    result = engine.generate(1,"01234567890123",10);
    assert(result.status == omega::GenerationStatus::ContextFull);
    assert(result.generated_tokens == 2);
    omega_test_output_count(2);
    test("context exhaustion reported without overflowing capacity");

    omega_test_fail_process_at(2); // prefill succeeds; first generated token processing fails
    result = engine.generate(0,"Hi",8);
    assert(result.status == omega::GenerationStatus::BackendError);
    assert(omega_test_batches()==0 && omega_test_samplers()==0);
    omega_test_fail_process_at(0);
    result = engine.generate(0,"Hi",8);
    assert(result.status == omega::GenerationStatus::Completed && result.output == "ab");
    test("decode error does not leak sampler/batch and later request recovers");

    omega_test_split_utf8(1);
    result = engine.generate(0,"Hi",8);
    assert(result.status == omega::GenerationStatus::Completed && result.output == std::string("\xc4\x85"));
    omega_test_split_utf8(0);
    test("multibyte UTF-8 split between tokens is preserved byte-for-byte");

    omega_test_pause_next_process();
    omega::GenerationResult interrupted;
    std::thread worker([&]{ interrupted=engine.generate(0,"Hi",8); });
    assert(omega_test_wait_for_process());
    engine.cancel(0); // no lock contention, cancellation is visible to blocked generation
    omega_test_resume_process();
    worker.join();
    assert(interrupted.status == omega::GenerationStatus::Cancelled);
    result=engine.generate(0,"Hi",8);
    assert(result.status==omega::GenerationStatus::Completed && result.output=="ab");
    test("cross-thread cancellation is prompt and does not poison future generations");

    std::vector<std::string> streamed;
    result = engine.generate(0, "Hi", 8, [&](const std::string& piece) {
        streamed.push_back(piece);
        return true;
    });
    assert(result.status == omega::GenerationStatus::Completed);
    assert(result.generated_tokens == 2 && streamed.size() == 2);
    assert(streamed[0] + streamed[1] == "ab");
    test("optional token sink receives ordered fragments without changing output");

    int delivered = 0;
    result = engine.generate(0, "Hi", 8, [&](const std::string&) {
        ++delivered;
        return false;
    });
    assert(result.status == omega::GenerationStatus::Cancelled && delivered == 1);
    assert(engine.generate(0, "Hi", 8).status == omega::GenerationStatus::Completed);
    test("callback cancellation does not poison subsequent requests");

    engine.unload(0);
    assert(engine.generate(0,"Hi",8).status == omega::GenerationStatus::InvalidRequest);
    assert(engine.generate(1,"Hi",8).status == omega::GenerationStatus::Completed);
    engine.unload(1);
    assert(omega_test_models()==0 && omega_test_contexts()==0);
    assert(omega_test_batches()==0 && omega_test_samplers()==0);
    close(fd);
    test("unload clears slot and releases all owned model/context resources");
    assert(passed==12);
    std::printf("OMEGA GENERATION %d/10 PASS\n",passed);
}
