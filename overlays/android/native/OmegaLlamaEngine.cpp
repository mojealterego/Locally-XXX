#include "OmegaLlamaEngine.hpp"

#include <cstdio>
#include <cstdlib>
#include <memory>
#include <mutex>
#include <unistd.h>

namespace omega {
namespace {
std::once_flag engine_init;
void shutdown_backend() { llama_backend_free(); }
void start_backend() {
    llama_backend_init();
    std::atexit(shutdown_backend);
}
struct Closer { void operator()(FILE* file) const noexcept { if(file) std::fclose(file); } };
struct ModelDeleter { void operator()(llama_model* model) const noexcept { if(model) llama_model_free(model); } };
struct ContextDeleter { void operator()(llama_context* ctx) const noexcept { if(ctx) llama_free(ctx); } };
}

LlamaEngine::LlamaEngine() { std::call_once(engine_init, start_backend); }
LlamaEngine::~LlamaEngine() {
    std::lock_guard<std::mutex> guard(mutex_);
    release_locked(1);
    release_locked(0);
}

void LlamaEngine::release_locked(int slot) noexcept {
    if(slots_[slot].context) llama_free(slots_[slot].context);
    slots_[slot].context = nullptr;
    if(slots_[slot].model) llama_model_free(slots_[slot].model);
    slots_[slot].model = nullptr;
}

bool LlamaEngine::load(int slot, int fd, int context_tokens, int gpu_layers, int kv_mode) {
    if(!valid_slot(slot) || fd < 0 || context_tokens < 16 || context_tokens > 131072 ||
       gpu_layers < 0 || gpu_layers > 256 || kv_mode < 0 || kv_mode > 2) return false;
    std::lock_guard<std::mutex> guard(mutex_);
    if(slots_[slot].model || slots_[slot].context) return false;
    const int copy_fd = ::dup(fd);
    if(copy_fd < 0) return false;
    FILE* raw = ::fdopen(copy_fd, "rb");
    if(!raw) { ::close(copy_fd); return false; }
    std::unique_ptr<FILE, Closer> file(raw);
    if(::fseeko(file.get(), 0, SEEK_SET) != 0) return false;

    llama_model_params model_args = llama_model_default_params();
    model_args.n_gpu_layers = gpu_layers;
    model_args.check_tensors = true;
    std::unique_ptr<llama_model, ModelDeleter> model(llama_model_load_from_file_ptr(file.get(), model_args));
    if(!model) return false;
    llama_context_params context_args = llama_context_default_params();
    context_args.n_ctx = static_cast<uint32_t>(context_tokens);
    context_args.n_batch = 256;
    context_args.n_ubatch = 64;
    context_args.n_threads = 6;
    context_args.n_threads_batch = 6;
    context_args.type_k = context_args.type_v = (kv_mode == 0 ? GGML_TYPE_F16 : kv_mode == 1 ? GGML_TYPE_Q8_0 : GGML_TYPE_Q4_0);
    std::unique_ptr<llama_context, ContextDeleter> context(llama_init_from_model(model.get(), context_args));
    if(!context) return false;
    slots_[slot].model = model.release();
    slots_[slot].context = context.release();
    return true;
}

void LlamaEngine::unload(int slot) noexcept {
    if(!valid_slot(slot)) return;
    std::lock_guard<std::mutex> guard(mutex_);
    release_locked(slot);
}

bool LlamaEngine::loaded(int slot) const noexcept {
    if(!valid_slot(slot)) return false;
    std::lock_guard<std::mutex> guard(mutex_);
    return slots_[slot].model && slots_[slot].context;
}
}
