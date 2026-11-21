#pragma once
#include <mutex>
#include <llama.h>

namespace omega {
/** JNI-neutral llama.cpp model/context ownership. Thread-safe; no subprocess. */
class LlamaEngine final {
public:
    LlamaEngine();
    ~LlamaEngine();
    LlamaEngine(const LlamaEngine&) = delete;
    LlamaEngine& operator=(const LlamaEngine&) = delete;
    bool load(int slot, int fd, int context_tokens, int gpu_layers, int kv_mode);
    void unload(int slot) noexcept;
    bool loaded(int slot) const noexcept;
private:
    struct ModelSlot { llama_model* model = nullptr; llama_context* context = nullptr; };
    static bool valid_slot(int slot) noexcept { return slot == 0 || slot == 1; }
    void release_locked(int slot) noexcept;
    mutable std::mutex mutex_;
    ModelSlot slots_[2];
};
}
