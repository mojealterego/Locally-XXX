#pragma once
#include <cstdint>
#include <cstdio>
struct llama_model;
struct llama_context;
struct llama_vocab;
struct llama_memory;
struct llama_batch_ext;
struct llama_sampler;
using llama_memory_t = llama_memory*;
using llama_token = int32_t;
using llama_pos = int32_t;
using llama_seq_id = int32_t;
#define LLAMA_TOKEN_NULL -1
enum ggml_type { GGML_TYPE_F16, GGML_TYPE_Q8_0, GGML_TYPE_Q4_0 };
enum llama_process_type { LLAMA_PROCESS_TYPE_ENCODE, LLAMA_PROCESS_TYPE_DECODE };
struct llama_model_params { int32_t n_gpu_layers=0; bool check_tensors=false; };
struct llama_context_params { uint32_t n_ctx=0, n_batch=0, n_ubatch=0; int32_t n_threads=0,n_threads_batch=0; ggml_type type_k=GGML_TYPE_F16,type_v=GGML_TYPE_F16; };
void llama_backend_init();
void llama_backend_free();
llama_model_params llama_model_default_params();
llama_context_params llama_context_default_params();
llama_model* llama_model_load_from_file_ptr(FILE*, llama_model_params);
void llama_model_free(llama_model*);
llama_context* llama_init_from_model(llama_model*, llama_context_params);
void llama_free(llama_context*);
llama_memory_t llama_get_memory(const llama_context*);
const llama_vocab* llama_model_get_vocab(const llama_model*);
void llama_memory_clear(llama_memory_t, bool);
int32_t llama_tokenize(const llama_vocab*, const char*, int32_t, llama_token*, int32_t, bool, bool);
llama_batch_ext* llama_batch_ext_init(llama_context*);
void llama_batch_ext_free(llama_batch_ext*);
void llama_batch_ext_clear(llama_batch_ext*);
int32_t llama_batch_ext_add_token(llama_batch_ext*, llama_seq_id, llama_token);
bool llama_batch_ext_set_pos(llama_batch_ext*, int32_t, const llama_pos*);
bool llama_batch_ext_set_output_logits(llama_batch_ext*, int32_t, bool);
int32_t llama_process(llama_context*, llama_process_type, llama_batch_ext*);
llama_sampler* llama_sampler_init_greedy();
void llama_sampler_free(llama_sampler*);
llama_token llama_sampler_sample(llama_sampler*, llama_context*, int32_t);
void llama_sampler_accept(llama_sampler*, llama_token);
bool llama_vocab_is_eog(const llama_vocab*, llama_token);
int32_t llama_token_to_piece(const llama_vocab*, llama_token, char*, int32_t, int32_t, bool);
