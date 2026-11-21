#include "llama.h"
#include <atomic>
#include <unistd.h>
struct llama_model { int fd; };
struct llama_context { int token; };
static std::atomic<int> m{0},c{0};
extern "C" int omega_test_models() { return m; }
extern "C" int omega_test_contexts() { return c; }
extern "C" void omega_test_reset(){m=0;c=0;}
extern "C" void omega_test_fail_context(int);
static std::atomic<int> fail_context{0};
extern "C" void omega_test_fail_context(int yes){fail_context=yes;}
void llama_backend_init(){}
void llama_backend_free(){}
llama_model_params llama_model_default_params(){return {};}
llama_context_params llama_context_default_params(){return {};}
llama_model* llama_model_load_from_file_ptr(FILE* file,llama_model_params){
    if(!file) return nullptr;
    char mkr[4];
    if(fread(mkr,1,4,file)!=4 || mkr[0]!='G'||mkr[1]!='G'||mkr[2]!='U'||mkr[3]!='F')return nullptr;
    ++m; return new llama_model{fileno(file)};
}
void llama_model_free(llama_model* ptr){if(ptr){--m;delete ptr;}}
llama_context* llama_init_from_model(llama_model* model,llama_context_params params){
    if(!model||params.n_ctx<16||fail_context)return nullptr;
    ++c;return new llama_context{1};
}
void llama_free(llama_context* ptr){if(ptr){--c;delete ptr;}}
