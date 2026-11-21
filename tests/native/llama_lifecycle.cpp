#include "OmegaLlamaEngine.hpp"
#include <cassert>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fcntl.h>
#include <unistd.h>
extern "C" int omega_test_models();
extern "C" int omega_test_contexts();
extern "C" void omega_test_fail_context(int);
int main(){
    char tmp[]="/tmp/omega-gguf-test-XXXXXX";
    int fd=mkstemp(tmp);assert(fd>=0);unlink(tmp);
    const char bytes[]="GGUFtest";assert(write(fd,bytes,sizeof bytes)==sizeof bytes);
    omega::LlamaEngine a;
    assert(!a.load(-1,fd,2048,0,0));
    assert(!a.load(0,-1,2048,0,0));
    assert(!a.load(0,fd,0,0,0));
    assert(a.load(0,fd,2048,0,1));
    assert(a.loaded(0) && omega_test_models()==1 && omega_test_contexts()==1);
    assert(!a.load(0,fd,2048,0,1));
    assert(a.load(1,fd,4096,0,2));
    assert(omega_test_models()==2 && omega_test_contexts()==2);
    a.unload(0);
    a.unload(0);
    assert(omega_test_models()==1 && omega_test_contexts()==1);
    omega_test_fail_context(1);
    assert(!a.load(0,fd,2048,0,0));
    assert(omega_test_models()==1 && omega_test_contexts()==1);
    omega_test_fail_context(0);
    assert(a.load(0,fd,2048,0,0));
    close(fd);
    a.unload(0);a.unload(1);
    assert(omega_test_models()==0 && omega_test_contexts()==0);
    std::puts("OMEGA IN-PROCESS LLAMA MODEL LIFECYCLE 9/9 PASS");
}
