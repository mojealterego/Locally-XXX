#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../.." && pwd)
native="$root/overlays/android/native"
javac_path=$(readlink -f "$(command -v javac)")
jdk=$(dirname "$(dirname "$javac_path")")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
flags=(-std=c++20 -Wall -Wextra -Werror -fsanitize=address,undefined -fno-omit-frame-pointer -I"$here/llama-stub" -I"$native")
clang++ "${flags[@]}" "$native/OmegaLlamaEngine.cpp" "$here/llama_stub.cpp" "$here/llama_lifecycle.cpp" -o "$tmp/lifecycle"
ASAN_OPTIONS=detect_leaks=1 "$tmp/lifecycle"
clang++ "${flags[@]}" -pthread "$native/OmegaLlamaEngine.cpp" "$here/llama_stub.cpp" "$here/OmegaLlamaGenerateTest.cpp" -o "$tmp/generate"
ASAN_OPTIONS=detect_leaks=1 "$tmp/generate"
clang++ -std=c++20 -Wall -Wextra -Werror -fPIC -shared -pthread \
  -I"$jdk/include" -I"$jdk/include/linux" -I"$here/llama-stub" -I"$native" \
  "$native/OmegaLlamaEngine.cpp" "$native/OmegaLlamaJni.cpp" "$here/llama_stub.cpp" \
  -o "$tmp/libomega_llama_jni.so"
kotlinc "$native/NativeLlamaEngine.kt" "$here/JniSmoke.kt" -include-runtime -d "$tmp/jni-lifecycle.jar"
java --add-opens java.base/java.io=ALL-UNNAMED -Djava.library.path="$tmp" -jar "$tmp/jni-lifecycle.jar"
kotlinc "$native/NativeLlamaEngine.kt" "$here/JniGenerationSmoke.kt" -include-runtime -d "$tmp/jni-generation.jar"
java --add-opens java.base/java.io=ALL-UNNAMED -Djava.library.path="$tmp" -jar "$tmp/jni-generation.jar"

# Production Kotlin model coordinator + broker + JNI adapter typecheck (Android APIs stubbed).
mkdir -p "$tmp/kotlin-sources"
for component in OmegaMemoryLeaseBroker OmegaNativeModelCoordinator OmegaAndroidModelAdmission; do
  sed 's/^package @PACKAGE@$/package com.example.app/' "$root/overlays/android/$component.kt" > "$tmp/kotlin-sources/$component.kt"
done
sed 's/^package @PACKAGE@$/package com.example.app/' "$native/OmegaLlamaNativeModelBackend.kt" > "$tmp/kotlin-sources/OmegaLlamaNativeModelBackend.kt"
kotlinc "$tmp/kotlin-sources/"*.kt "$here/kotlin-stubs/"*.kt "$native/NativeLlamaEngine.kt" -d "$tmp/omega-kotlin-contract.jar"
echo 'OMEGA KOTLIN COORDINATOR+BROKER+JNI ADAPTER CONTRACT PASS (stubbed Android API)'
