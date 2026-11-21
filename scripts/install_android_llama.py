"""Opt-in, fail-closed integration of pinned JNI llama.cpp into generated Tauri Android.

This only stages native Android build sources. It does NOT build, sign or publish an APK.
The operator must separately provide OMEGA_LLAMA_SOURCE at build time.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
from collections.abc import Callable

PINNED_SHA = "418fe97b5f01b11eeb89f30d8a0459433edbf1d2"
PKG = re.compile(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+\Z")
ASSETS = Path(__file__).resolve().parents[1] / "overlays/android"
BEGIN = "// BEGIN OMEGA_LLAMA_JNI_V1"
END = "// END OMEGA_LLAMA_JNI_V1"

# ExternalNativeBuild is opt-in: source is checked in CMake, no remote downloads.
# A second configuration block is valid in Gradle Kotlin DSL.
GRADLE_SNIPPET = f'''
{BEGIN}
android {{
    ndkVersion = "28.0.13004108"
    defaultConfig {{
        ndk {{ abiFilters.add("arm64-v8a") }}
        externalNativeBuild {{
            cmake {{
                val modelSources = System.getenv("OMEGA_LLAMA_SOURCE")
                    ?: error("OMEGA_LLAMA_SOURCE must point to the pinned local llama.cpp checkout")
                arguments.add("-DOMEGA_LLAMA_SOURCE=$modelSources")
            }}
        }}
    }}
    externalNativeBuild {{
        cmake {{ path = file("src/main/cpp/omega_llama/CMakeLists.txt") }}
    }}
}}
{END}
'''


def _real_unlinked(path: Path) -> Path:
    """Reject *any* path component symlink, including an untrusted parent."""
    value = path.absolute()
    current = Path(value.anchor)
    for part in value.parts[1:]:
        if part in (".", ".."):
            raise ValueError("Invalid source path")
        current = current / part
        if current.is_symlink():
            raise ValueError("Symlink in Android integration path")
    return value


def _read_safe(path: Path, optional: bool = False) -> bytes | None:
    _real_unlinked(path)
    if not path.exists():
        if optional:
            return None
        raise ValueError(f"Required file missing: {path.name}")
    if not path.is_file() or path.stat().st_size > 1024 * 1024:
        raise ValueError("Android source is not a bounded regular file")
    return path.read_bytes()


def _git_query(args: tuple[str, ...], checkout: Path) -> str:
    try:
        proc = subprocess.run(["git", "-C", str(checkout), *args], check=True,
                              text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise ValueError("Cannot verify pinned llama.cpp source") from exc
    return proc.stdout.strip()


def verify_checkout(checkout: Path, *, git_query: Callable[[tuple[str, ...], Path], str] = _git_query) -> Path:
    checkout = _real_unlinked(Path(checkout))
    if not checkout.is_dir():
        raise ValueError("Invalid llama.cpp source directory")
    for name in ("CMakeLists.txt", "include/llama.h", "ggml/include/ggml.h"):
        _read_safe(checkout / name)
    if git_query(("rev-parse", "HEAD"), checkout) != PINNED_SHA:
        raise ValueError("Unpinned llama.cpp source revision")
    if git_query(("status", "--porcelain", "--untracked-files=no"), checkout) != "":
        raise ValueError("Modified llama.cpp source tree is not admissible")
    return checkout


def install_native_llama(workspace: Path, package: str, llama_checkout: Path, *,
                         git_query: Callable[[tuple[str, ...], Path], str] = _git_query,
                         replace: Callable[[str | os.PathLike, str | os.PathLike], None] = os.replace) -> dict:
    if not isinstance(package, str) or not PKG.fullmatch(package):
        raise ValueError("Invalid Android package")
    root = _real_unlinked(Path(workspace))
    if not root.is_dir():
        raise ValueError("Missing workspace")
    checkout = verify_checkout(llama_checkout, git_query=git_query)
    app = _real_unlinked(root / "src-tauri/gen/android/app")
    if not app.is_dir():
        raise ValueError("Generated Tauri Android app module missing")
    lock = app / ".omega-llama-install.lock"
    try:
        lock.mkdir(mode=0o700)
    except FileExistsError as exc:
        raise ValueError("Another installer is active or left an unrecovered lock") from exc
    try:
        return _install_locked(root, package, checkout, replace)
    finally:
        lock.rmdir()


def _install_locked(root: Path, package: str, checkout: Path,
                    replace: Callable[[str | os.PathLike, str | os.PathLike], None]) -> dict:
    app = root / "src-tauri/gen/android/app"
    java = app / "src/main/java"
    package_dir = java.joinpath(*package.split("."))
    cmake_dir = app / "src/main/cpp/omega_llama"
    gradle = app / "build.gradle.kts"

    # Do not attach a JNI dependency to a Tauri Activity lacking the ENT-52 admission guard.
    for name in ("OmegaNativeModelCoordinator.kt", "OmegaAndroidModelAdmission.kt"):
        found = _read_safe(package_dir / name)
        expected = (ASSETS / name).read_text().replace("@PACKAGE@", package).encode("utf-8")
        if found != expected:
            raise ValueError("Existing Android admission helper was modified")

    original = _read_safe(gradle)
    assert original is not None
    try:
        gradle_text = original.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("Invalid Gradle Kotlin DSL encoding") from exc
    if BEGIN in gradle_text or END in gradle_text:
        if not gradle_text.endswith(GRADLE_SNIPPET) or gradle_text.count(BEGIN) != 1 or gradle_text.count(END) != 1:
            raise ValueError("Modified OMEGA native build block")
        wanted_gradle = original
    else:
        if len(re.findall(r"\bandroid\s*\{", gradle_text)) != 1 or "plugins" not in gradle_text or "externalNativeBuild" in gradle_text:
            raise ValueError("Unknown Android Gradle build template")
        wanted_gradle = (gradle_text.rstrip("\n") + "\n" + GRADLE_SNIPPET).encode("utf-8")

    desired: dict[Path, bytes] = {}
    for name in ("CMakeLists.txt", "OmegaLlamaEngine.hpp", "OmegaLlamaEngine.cpp", "OmegaLlamaJni.cpp"):
        desired[cmake_dir / name] = (ASSETS / "native" / name).read_bytes()
    desired[java / "com/omega/studio/runtime/NativeLlamaEngine.kt"] = (ASSETS / "native/NativeLlamaEngine.kt").read_bytes()
    desired[package_dir / "OmegaLlamaNativeModelBackend.kt"] = (
        (ASSETS / "native/OmegaLlamaNativeModelBackend.kt").read_text().replace("@PACKAGE@", package).encode("utf-8"))
    desired[gradle] = wanted_gradle  # Apply *last* so interrupted staging never enables an incomplete build.

    previous: dict[Path, bytes | None] = {}
    for path, content in desired.items():
        previous[path] = _read_safe(path, optional=True)
        if previous[path] is not None and path != gradle and previous[path] != content:
            raise ValueError("Unrecognized native source: refusing destructive overwrite")
    staged: dict[Path, Path] = {}
    changed: list[Path] = []
    try:
        for path, content in desired.items():
            if previous[path] == content:
                continue
            _real_unlinked(path)
            path.parent.mkdir(parents=True, exist_ok=True)
            fd, temp_name = tempfile.mkstemp(prefix=".omega-jni-", dir=path.parent)
            temp = Path(temp_name)
            staged[path] = temp
            with os.fdopen(fd, "wb") as stream:
                stream.write(content)
                stream.flush()
                os.fsync(stream.fileno())
        for path, temp in staged.items():
            replace(temp, path)
            changed.append(path)
    except BaseException:
        for path in reversed(changed):
            backup = previous[path]
            if backup is None:
                path.unlink(missing_ok=True)
            else:
                fd, temp_name = tempfile.mkstemp(prefix=".omega-rollback-", dir=path.parent)
                with os.fdopen(fd, "wb") as stream:
                    stream.write(backup)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temp_name, path)
        raise
    finally:
        for path in staged.values():
            path.unlink(missing_ok=True)

    return {
        "changed": bool(changed),
        "llama_source": str(checkout),
        "llama_commit": PINNED_SHA,
        "files": {p.relative_to(app).as_posix(): hashlib.sha256(content).hexdigest() for p, content in desired.items()},
        "status": "STAGED_FOR_ANDROID_BUILD_NOT_BUILT",
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("workspace", type=Path)
    parser.add_argument("package")
    parser.add_argument("llama_checkout", type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(install_native_llama(args.workspace, args.package, args.llama_checkout), indent=2))
        return 0
    except (OSError, ValueError) as error:
        parser.exit(1, f"{error}\n")

if __name__ == "__main__":
    raise SystemExit(main())
