#pragma once
#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <string>
#include <llama.h>

namespace omega {

enum class GenerationStatus : uint8_t {
    Completed,
    Cancelled,
    ContextFull,
    InvalidRequest,
    BackendError
};

struct GenerationResult {
    GenerationStatus status;
    std::string output;
    int32_t generated_tokens;
};

/**
 * Two in-process llama.cpp slots with serialized operations and asynchronous cancellation.
 * Every generation starts with a cleared KV cache (no cross-request prompt leakage).
 * Outputs are raw UTF-8 bytes, never passed through JNI NewStringUTF.
 */
class LlamaEngine final {
public:
    LlamaEngine();
    ~LlamaEngine();
    LlamaEngine(const LlamaEngine&) = delete;
    LlamaEngine& operator=(const LlamaEngine&) = delete;
    bool load(int slot, int fd, int context_tokens, int gpu_layers, int kv_mode);
    void unload(int slot) noexcept;
    bool loaded(int slot) const noexcept;
    using TokenSink = std::function<bool(const std::string& token_bytes)>;
    GenerationResult generate(int slot, const std::string& prompt, int32_t max_tokens, const TokenSink& sink = {});
    void cancel(int slot) noexcept;
private:
    struct ModelSlot {
        llama_model* model = nullptr;
        llama_context* context = nullptr;
        int32_t context_tokens = 0;
    };
    static bool valid_slot(int slot) noexcept { return slot == 0 || slot == 1; }
    void release_locked(int slot) noexcept;
    mutable std::mutex mutex_;
    ModelSlot slots_[2];
    std::atomic<bool> cancelled_[2] = { false, false };
};
}
