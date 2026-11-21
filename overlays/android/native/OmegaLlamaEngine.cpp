#include "OmegaLlamaEngine.hpp"

#include <algorithm>
#include <climits>
#include <cstdio>
#include <cstdlib>
#include <limits>
#include <memory>
#include <mutex>
#include <vector>
#include <unistd.h>

namespace omega {
namespace {
std::once_flag engine_init;
void shutdown_backend() { llama_backend_free(); }
void start_backend() {
    llama_backend_init();
    std::atexit(shutdown_backend);
}
struct Closer { void operator()(FILE* file) const noexcept { if (file) std::fclose(file); } };
struct ModelDeleter { void operator()(llama_model* model) const noexcept { if (model) llama_model_free(model); } };
struct ContextDeleter { void operator()(llama_context* ctx) const noexcept { if (ctx) llama_free(ctx); } };
struct BatchDeleter { void operator()(llama_batch_ext* batch) const noexcept { if (batch) llama_batch_ext_free(batch); } };
struct SamplerDeleter { void operator()(llama_sampler* sampler) const noexcept { if (sampler) llama_sampler_free(sampler); } };
constexpr size_t kMaxPromptBytes = 65536;
constexpr size_t kMaxOutputBytes = 2 * 1024 * 1024;
constexpr int32_t kMaxTokenPieceBytes = 16384;
constexpr int32_t kPromptBatch = 256;
}

LlamaEngine::LlamaEngine() { std::call_once(engine_init, start_backend); }
LlamaEngine::~LlamaEngine() {
    std::lock_guard<std::mutex> guard(mutex_);
    release_locked(1);
    release_locked(0);
}

void LlamaEngine::release_locked(int slot) noexcept {
    if (slots_[slot].context) llama_free(slots_[slot].context);
    slots_[slot].context = nullptr;
    if (slots_[slot].model) llama_model_free(slots_[slot].model);
    slots_[slot].model = nullptr;
    slots_[slot].context_tokens = 0;
}

bool LlamaEngine::load(int slot, int fd, int context_tokens, int gpu_layers, int kv_mode) {
    if (!valid_slot(slot) || fd < 0 || context_tokens < 16 || context_tokens > 131072 ||
        gpu_layers < 0 || gpu_layers > 256 || kv_mode < 0 || kv_mode > 2) return false;
    std::lock_guard<std::mutex> guard(mutex_);
    if (slots_[slot].model || slots_[slot].context) return false;
    const int copy_fd = ::dup(fd);
    if (copy_fd < 0) return false;
    FILE* raw = ::fdopen(copy_fd, "rb");
    if (!raw) { ::close(copy_fd); return false; }
    std::unique_ptr<FILE, Closer> file(raw);
    if (::fseeko(file.get(), 0, SEEK_SET) != 0) return false;

    llama_model_params model_args = llama_model_default_params();
    model_args.n_gpu_layers = gpu_layers;
    model_args.check_tensors = true;
    std::unique_ptr<llama_model, ModelDeleter> model(llama_model_load_from_file_ptr(file.get(), model_args));
    if (!model) return false;
    llama_context_params context_args = llama_context_default_params();
    context_args.n_ctx = static_cast<uint32_t>(context_tokens);
    context_args.n_batch = kPromptBatch;
    context_args.n_ubatch = 64;
    context_args.n_threads = 6;
    context_args.n_threads_batch = 6;
    context_args.type_k = context_args.type_v = (kv_mode == 0 ? GGML_TYPE_F16 : kv_mode == 1 ? GGML_TYPE_Q8_0 : GGML_TYPE_Q4_0);
    std::unique_ptr<llama_context, ContextDeleter> context(llama_init_from_model(model.get(), context_args));
    if (!context) return false;
    slots_[slot].model = model.release();
    slots_[slot].context = context.release();
    slots_[slot].context_tokens = context_tokens;
    return true;
}

void LlamaEngine::unload(int slot) noexcept {
    if (!valid_slot(slot)) return;
    // Waits for generation to finish or be cancelled; never unloads an active context.
    std::lock_guard<std::mutex> guard(mutex_);
    release_locked(slot);
}

bool LlamaEngine::loaded(int slot) const noexcept {
    if (!valid_slot(slot)) return false;
    std::lock_guard<std::mutex> guard(mutex_);
    return slots_[slot].model && slots_[slot].context;
}

void LlamaEngine::cancel(int slot) noexcept {
    if (valid_slot(slot)) cancelled_[slot].store(true, std::memory_order_release);
}

GenerationResult LlamaEngine::generate(int slot, const std::string& prompt, int32_t max_tokens) {
    const auto invalid = GenerationResult{ GenerationStatus::InvalidRequest, {}, 0 };
    const auto failed = GenerationResult{ GenerationStatus::BackendError, {}, 0 };
    if (!valid_slot(slot) || prompt.empty() || prompt.size() > kMaxPromptBytes || max_tokens < 1 || max_tokens > 4096)
        return invalid;
    std::lock_guard<std::mutex> guard(mutex_);
    auto& model = slots_[slot];
    if (!model.context || !model.model) return invalid;
    cancelled_[slot].store(false, std::memory_order_release);
    llama_memory_t memory = llama_get_memory(model.context);
    const llama_vocab* vocab = llama_model_get_vocab(model.model);
    if (!memory || !vocab) return failed;
    llama_memory_clear(memory, true);
    std::vector<llama_token> tokens(prompt.size() + 16);
    int32_t count = llama_tokenize(vocab, prompt.data(), static_cast<int32_t>(prompt.size()),
                                    tokens.data(), static_cast<int32_t>(tokens.size()), true, false);
    if (count < 0 && count != INT32_MIN && -static_cast<int64_t>(count) <= 131072) {
        tokens.resize(static_cast<size_t>(-count));
        count = llama_tokenize(vocab, prompt.data(), static_cast<int32_t>(prompt.size()),
                               tokens.data(), static_cast<int32_t>(tokens.size()), true, false);
    }
    if (count <= 0 || count >= model.context_tokens || static_cast<size_t>(count) > tokens.size()) return invalid;
    tokens.resize(static_cast<size_t>(count));

    std::unique_ptr<llama_batch_ext, BatchDeleter> batch(llama_batch_ext_init(model.context));
    std::unique_ptr<llama_sampler, SamplerDeleter> sampler(llama_sampler_init_greedy());
    if (!batch || !sampler) return failed;
    int32_t position = 0;
    for (int32_t offset = 0; offset < count; offset += kPromptBatch) {
        if (cancelled_[slot].load(std::memory_order_acquire))
            return { GenerationStatus::Cancelled, {}, 0 };
        llama_batch_ext_clear(batch.get());
        const int32_t stop = std::min<int32_t>(count, offset + kPromptBatch);
        for (int32_t i = offset; i < stop; ++i) {
            const int32_t idx = llama_batch_ext_add_token(batch.get(), 0, tokens[static_cast<size_t>(i)]);
            const llama_pos pos = position++;
            if (idx < 0 || !llama_batch_ext_set_pos(batch.get(), idx, &pos) ||
                (i == count - 1 && !llama_batch_ext_set_output_logits(batch.get(), idx, true))) return failed;
        }
        if (llama_process(model.context, LLAMA_PROCESS_TYPE_DECODE, batch.get()) != 0) return failed;
    }

    GenerationResult output{ GenerationStatus::Completed, {}, 0 };
    while (output.generated_tokens < max_tokens) {
        if (cancelled_[slot].load(std::memory_order_acquire)) {
            output.status = GenerationStatus::Cancelled;
            return output;
        }
        const llama_token selected = llama_sampler_sample(sampler.get(), model.context, -1);
        if (selected == LLAMA_TOKEN_NULL) return failed;
        if (llama_vocab_is_eog(vocab, selected)) return output;
        char piece_stack[256];
        int32_t n_piece = llama_token_to_piece(vocab, selected, piece_stack, sizeof(piece_stack), 0, false);
        std::string piece;
        if (n_piece < 0) {
            if (n_piece == INT32_MIN || -static_cast<int64_t>(n_piece) > kMaxTokenPieceBytes) return failed;
            piece.resize(static_cast<size_t>(-n_piece));
            n_piece = llama_token_to_piece(vocab, selected, piece.data(), static_cast<int32_t>(piece.size()), 0, false);
            if (n_piece < 0 || static_cast<size_t>(n_piece) != piece.size()) return failed;
        } else if (n_piece <= static_cast<int32_t>(sizeof(piece_stack))) {
            piece.assign(piece_stack, static_cast<size_t>(n_piece));
        } else return failed;
        if (piece.size() > kMaxOutputBytes - output.output.size()) return failed;
        output.output += piece;
        ++output.generated_tokens;
        llama_sampler_accept(sampler.get(), selected);
        if (output.generated_tokens == max_tokens) return output;
        if (position >= model.context_tokens) {
            output.status = GenerationStatus::ContextFull;
            return output;
        }
        llama_batch_ext_clear(batch.get());
        const int32_t idx = llama_batch_ext_add_token(batch.get(), 0, selected);
        const llama_pos pos = position++;
        if (idx < 0 || !llama_batch_ext_set_pos(batch.get(), idx, &pos) ||
            !llama_batch_ext_set_output_logits(batch.get(), idx, true)) return failed;
        if (llama_process(model.context, LLAMA_PROCESS_TYPE_DECODE, batch.get()) != 0) return failed;
    }
    return output;
}
}
