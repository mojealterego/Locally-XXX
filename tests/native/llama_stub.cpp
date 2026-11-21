#include "llama.h"
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstring>
#include <mutex>
#include <string>
#include <vector>
#include <algorithm>

struct llama_vocab {};
struct llama_model { llama_vocab vocab; };
struct llama_context;
struct llama_memory { llama_context* owner; };
struct llama_context { llama_model* model; llama_memory memory; int32_t context_size; std::vector<llama_token> history; int sampled = 0; };
struct BatchToken { llama_token token; llama_pos pos = -1; bool output = false; };
struct llama_batch_ext { std::vector<BatchToken> tokens; };
struct llama_sampler {};
static std::atomic<int> models{0}, contexts{0}, batches{0}, samplers{0};
static std::atomic<int> fail_context{0}, fail_process_at{0}, process_calls{0}, split_utf8{0}, output_count{2};
static std::mutex pause_mutex;
static std::condition_variable pause_condition;
static bool pause_armed = false, pause_entered = false, pause_released = false;

extern "C" int omega_test_models() { return models; }
extern "C" int omega_test_contexts() { return contexts; }
extern "C" int omega_test_batches() { return batches; }
extern "C" int omega_test_samplers() { return samplers; }
extern "C" int omega_test_process_calls() { return process_calls; }
extern "C" void omega_test_reset() { models=contexts=batches=samplers=0; fail_context=fail_process_at=process_calls=split_utf8=0; output_count=2; }
extern "C" void omega_test_fail_context(int value) { fail_context = value; }
extern "C" void omega_test_fail_process_at(int value) { process_calls=0; fail_process_at=value; }
extern "C" void omega_test_split_utf8(int value) { split_utf8=value; }
extern "C" void omega_test_output_count(int value) { output_count=value; }
extern "C" void omega_test_pause_next_process() {
    std::lock_guard<std::mutex> lock(pause_mutex);
    pause_armed=true;pause_entered=false;pause_released=false;
}
extern "C" bool omega_test_wait_for_process() {
    std::unique_lock<std::mutex> lock(pause_mutex);
    return pause_condition.wait_for(lock, std::chrono::seconds(5), [] { return pause_entered; });
}
extern "C" void omega_test_resume_process() {
    std::lock_guard<std::mutex> lock(pause_mutex);pause_released=true;pause_condition.notify_all();
}

void llama_backend_init(){}
void llama_backend_free(){}
llama_model_params llama_model_default_params(){return {};}
llama_context_params llama_context_default_params(){return {};}
llama_model* llama_model_load_from_file_ptr(FILE* file,llama_model_params){
    if(!file)return nullptr;
    char marker[4];
    if(fread(marker,1,4,file)!=4 || memcmp(marker,"GGUF",4)!=0) return nullptr;
    ++models;return new llama_model{};
}
void llama_model_free(llama_model* ptr){if(ptr){--models;delete ptr;}}
llama_context* llama_init_from_model(llama_model* m,llama_context_params p){
    if(!m||p.n_ctx<16||fail_context)return nullptr;
    auto* ctx = new llama_context{m,{},static_cast<int32_t>(p.n_ctx),{},0};
    ctx->memory.owner=ctx; ++contexts;return ctx;
}
void llama_free(llama_context* ptr){if(ptr){--contexts;delete ptr;}}
llama_memory_t llama_get_memory(const llama_context* ctx){return ctx ? const_cast<llama_memory*>(&ctx->memory) : nullptr;}
const llama_vocab* llama_model_get_vocab(const llama_model* model){return model? &model->vocab : nullptr;}
void llama_memory_clear(llama_memory_t memory,bool) { if(memory){memory->owner->history.clear();memory->owner->sampled=0;} }
int32_t llama_tokenize(const llama_vocab*, const char* text,int32_t len, llama_token* out,int32_t cap,bool special,bool){
    int32_t needed=len+(special?1:0);
    if(cap<needed) return -needed;
    int32_t j=0;
    if(special)out[j++]=1;
    for(int32_t i=0;i<len;i++)out[j++]=static_cast<unsigned char>(text[i])+1000;
    return needed;
}
llama_batch_ext* llama_batch_ext_init(llama_context*){++batches;return new llama_batch_ext{};}
void llama_batch_ext_free(llama_batch_ext* b){if(b){--batches;delete b;}}
void llama_batch_ext_clear(llama_batch_ext* b){b->tokens.clear();}
int32_t llama_batch_ext_add_token(llama_batch_ext* b,llama_seq_id seq,llama_token token){
    if(!b||seq!=0)return -3;
    b->tokens.push_back(BatchToken{token});
    return static_cast<int32_t>(b->tokens.size())-1;
}
bool llama_batch_ext_set_pos(llama_batch_ext* b,int32_t idx,const llama_pos* pos){
    if(!b||!pos||idx<0||static_cast<size_t>(idx)>=b->tokens.size())return false;
    b->tokens[static_cast<size_t>(idx)].pos=*pos;return true;
}
bool llama_batch_ext_set_output_logits(llama_batch_ext* b,int32_t idx,bool value){
    if(!b||idx<0||static_cast<size_t>(idx)>=b->tokens.size())return false;
    b->tokens[static_cast<size_t>(idx)].output=value;return true;
}
int32_t llama_process(llama_context* ctx,llama_process_type type,llama_batch_ext* batch){
    {
        std::unique_lock<std::mutex> lock(pause_mutex);
        if(pause_armed) {
            pause_armed=false;pause_entered=true;pause_condition.notify_all();
            pause_condition.wait(lock,[] {return pause_released;});
        }
    }
    const int call=++process_calls;
    if(fail_process_at==call)return -2;
    if(!ctx||type!=LLAMA_PROCESS_TYPE_DECODE||!batch)return -1;
    for(const auto& token:batch->tokens) {
        if(token.pos != static_cast<int32_t>(ctx->history.size()) ||
           static_cast<int32_t>(ctx->history.size())>=ctx->context_size)return -1;
        ctx->history.push_back(token.token);
    }
    return 0;
}
llama_sampler* llama_sampler_init_greedy(){++samplers;return new llama_sampler{};}
void llama_sampler_free(llama_sampler* ptr){if(ptr){--samplers;delete ptr;}}
llama_token llama_sampler_sample(llama_sampler*,llama_context* ctx,int32_t idx){
    if(!ctx||idx!=-1)return LLAMA_TOKEN_NULL;
    const int call=ctx->sampled++;
    return call<output_count?101+(call%2):0;
}
void llama_sampler_accept(llama_sampler*,llama_token){}
bool llama_vocab_is_eog(const llama_vocab*,llama_token t){return t==0;}
int32_t llama_token_to_piece(const llama_vocab*,llama_token tok,char*buf,int32_t cap,int32_t,bool){
    const std::string piece=split_utf8==0 ? (tok==101?"a":tok==102?"b":"") :
        (tok==101?std::string(1,static_cast<char>(0xc4)) : tok==102?std::string(1,static_cast<char>(0x85)):"");
    if(cap<static_cast<int32_t>(piece.size()))return -static_cast<int32_t>(piece.size());
    std::memcpy(buf,piece.data(),piece.size());return static_cast<int32_t>(piece.size());
}
