from pathlib import Path
import tempfile
import unittest

from scripts.install_android_llama import install_native_llama, verify_checkout, PINNED_SHA


class InstallerTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)
        self.workspace = self.root / 'project'
        self.main = self.workspace / 'src-tauri/gen/android/app/src/main'
        self.gradle = self.workspace / 'src-tauri/gen/android/app/build.gradle.kts'
        self.app_sources = self.main / 'java/com/example/app'
        self.app_sources.mkdir(parents=True)
        self.gradle.write_text('plugins { id("com.android.application") }\n\nandroid { namespace = "com.example.app" }\n')
        upstream = Path(__file__).resolve().parents[1]
        self.source = upstream / 'overlays/android/native'
        for filename in ('OmegaNativeModelCoordinator.kt', 'OmegaAndroidModelAdmission.kt'):
            (self.app_sources / filename).write_text((upstream / 'overlays/android' / filename).read_text().replace('@PACKAGE@', 'com.example.app'))
        self.checkout = self.root / 'checkout'
        (self.checkout / 'include').mkdir(parents=True)
        (self.checkout / 'ggml/include').mkdir(parents=True)
        (self.checkout / 'CMakeLists.txt').write_text('project(llama)\n')
        (self.checkout / 'include/llama.h').write_text('header')
        (self.checkout / 'ggml/include/ggml.h').write_text('header')

    def git(self, args, directory):
        if args == ('rev-parse', 'HEAD'):
            return PINNED_SHA
        if args == ('status', '--porcelain', '--untracked-files=no'):
            return ''
        raise AssertionError(args)

    def apply(self, **kwargs):
        return install_native_llama(self.workspace, 'com.example.app', self.checkout, git_query=self.git, **kwargs)

    def test_installs_production_sources_and_gradle_once(self):
        first = self.apply()
        self.assertTrue(first['changed'])
        self.assertIn('src/main/cpp/omega_llama/CMakeLists.txt', first['files'])
        self.assertEqual((self.main / 'cpp/omega_llama/OmegaLlamaEngine.cpp').read_bytes(), (self.source / 'OmegaLlamaEngine.cpp').read_bytes())
        self.assertTrue((self.main / 'java/com/omega/studio/runtime/NativeLlamaEngine.kt').is_file())
        self.assertEqual((self.app_sources / 'OmegaLlamaNativeModelBackend.kt').read_text(),
                         (self.source / 'OmegaLlamaNativeModelBackend.kt').read_text().replace('@PACKAGE@', 'com.example.app'))
        self.assertIn('OMEGA_LLAMA_SOURCE', self.gradle.read_text())
        after = self.gradle.read_bytes()
        second = self.apply()
        self.assertFalse(second['changed'])
        self.assertEqual(after, self.gradle.read_bytes())

    def test_refuses_unrecognized_gradle_config_without_writing(self):
        self.gradle.write_text(self.gradle.read_text() + 'android { externalNativeBuild { cmake { path = file("other") } } }\n')
        before = self.gradle.read_bytes()
        with self.assertRaises(ValueError): self.apply()
        self.assertEqual(before, self.gradle.read_bytes())
        self.assertFalse((self.main / 'cpp/omega_llama').exists())

    def test_checkout_rejects_dirty_wrong_sha_or_missing_header(self):
        def wrong(args, directory): return 'a' * 40
        with self.assertRaises(ValueError): verify_checkout(self.checkout, git_query=wrong)
        def dirty(args, directory): return PINNED_SHA if args[0] == 'rev-parse' else ' M include/llama.h'
        with self.assertRaises(ValueError): verify_checkout(self.checkout, git_query=dirty)
        (self.checkout / 'include/llama.h').unlink()
        with self.assertRaises(ValueError): verify_checkout(self.checkout, git_query=self.git)

    def test_rejects_symlink_prerequisite_without_writing(self):
        target = self.app_sources / 'OmegaNativeModelCoordinator.kt'
        target.unlink()
        target.symlink_to(self.source.parent / 'OmegaNativeModelCoordinator.kt')
        with self.assertRaises(ValueError): self.apply()
        self.assertFalse((self.main / 'cpp/omega_llama').exists())

    def test_rejects_modified_native_source_and_rollback_writes(self):
        self.apply()
        target = self.main / 'cpp/omega_llama/OmegaLlamaEngine.cpp'
        target.write_text('third party change\n')
        with self.assertRaises(ValueError): self.apply()
        self.assertEqual(target.read_text(), 'third party change\n')

    def test_atomic_rollback_after_mid_commit_failure(self):
        import os
        original = self.gradle.read_bytes()
        calls = 0
        def crash_once(src, dst):
            nonlocal calls
            calls += 1
            if calls == 3:
                raise OSError("injected power-loss-like write failure")
            os.replace(src, dst)
        with self.assertRaises(OSError): self.apply(replace=crash_once)
        self.assertEqual(self.gradle.read_bytes(), original)
        self.assertFalse((self.main / 'cpp/omega_llama/OmegaLlamaEngine.cpp').exists())
        self.assertFalse((self.main / 'cpp/omega_llama/CMakeLists.txt').exists())
        self.assertFalse((self.workspace / 'src-tauri/gen/android/app/.omega-llama-install.lock').exists())
        self.assertTrue(self.apply()['changed'])

    def test_concurrent_installer_lock_is_fail_closed(self):
        lock = self.workspace / 'src-tauri/gen/android/app/.omega-llama-install.lock'
        lock.mkdir()
        try:
            with self.assertRaises(ValueError): self.apply()
            self.assertNotIn('OMEGA_LLAMA_SOURCE', self.gradle.read_text())
        finally:
            lock.rmdir()

    def test_rejects_workspace_symlink_and_invalid_package(self):
        shortcut = self.root / 'linked'
        shortcut.symlink_to(self.workspace, target_is_directory=True)
        with self.assertRaises(ValueError): install_native_llama(shortcut, 'com.example.app', self.checkout, git_query=self.git)
        with self.assertRaises(ValueError): install_native_llama(self.workspace, 'bad/package', self.checkout, git_query=self.git)

if __name__ == '__main__': unittest.main()
