#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
native="$root/overlays/android/native"
javac_path=$(readlink -f "$(command -v javac)")
jdk=$(dirname "$(dirname "$javac_path")")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
clang++ -std=c++20 -Wall -Wextra -Werror -fsanitize=address,undefined -fno-omit-frame-pointer \
  -I"$here/llama-stub" -I"$native" \
  "$native/OmegaLlamaEngine.cpp" "$here/llama_stub.cpp" "$here/llama_lifecycle.cpp" \
  -o "$tmp/runtime-test"
ASAN_OPTIONS=detect_leaks=1 "$tmp/runtime-test"
clang++ -std=c++20 -Wall -Wextra -Werror -fPIC -shared \
  -I"$jdk/include" -I"$jdk/include/linux" -I"$here/llama-stub" -I"$native" \
  "$native/OmegaLlamaEngine.cpp" "$native/OmegaLlamaJni.cpp" "$here/llama_stub.cpp" \
  -o "$tmp/libomega_llama_jni.so"
kotlinc "$native/NativeLlamaEngine.kt" "$here/JniSmoke.kt" -include-runtime -d "$tmp/jni-test.jar"
java --add-opens java.base/java.io=ALL-UNNAMED -Djava.library.path="$tmp" -jar "$tmp/jni-test.jar"
