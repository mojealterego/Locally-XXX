#pragma once
#include <cstdint>
#include <cstdio>
struct llama_model;
struct llama_context;
enum ggml_type { GGML_TYPE_F16,GGML_TYPE_Q8_0,GGML_TYPE_Q4_0 };
struct llama_model_params { int32_t n_gpu_layers=0; bool check_tensors=false; };
struct llama_context_params { uint32_t n_ctx=0, n_batch=0, n_ubatch=0; int32_t n_threads=0,n_threads_batch=0; ggml_type type_k=GGML_TYPE_F16,type_v=GGML_TYPE_F16; };
void llama_backend_init();
void llama_backend_free();
llama_model_params llama_model_default_params();
llama_context_params llama_context_default_params();
llama_model* llama_model_load_from_file_ptr(FILE*,llama_model_params);
void llama_model_free(llama_model*);
llama_context* llama_init_from_model(llama_model*,llama_context_params);
void llama_free(llama_context*);
