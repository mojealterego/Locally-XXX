import tempfile, unittest
from pathlib import Path
from scripts.android_overlay import install_lifecycle, template
from scripts.runtime_control import RuntimeErrorCode

class AndroidOverlayTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name); self.pkg='com.example.app'
        self.main=self.root/'src-tauri/gen/android/app/src/main'
        self.activity=self.main/'java/com/example/app/MainActivity.kt';self.activity.parent.mkdir(parents=True)
        self.activity.write_text(template(self.pkg))
        self.manifest=self.main/'AndroidManifest.xml';self.manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:label="LU"/></manifest>')
    def test_install_idempotent(self):
        result=install_lifecycle(self.root,self.pkg);self.assertIn('OmegaLifecycle',self.activity.read_text());self.assertIn('OmegaMemoryLeaseBroker',self.activity.with_name('OmegaThermalMonitor.kt').read_text());self.assertIn('OmegaCapabilityPolicy',self.activity.with_name('OmegaMobileAgent.kt').read_text());self.assertTrue(self.activity.with_name('OmegaNativeModelCoordinator.kt').is_file());self.assertTrue(self.activity.with_name('OmegaAndroidModelAdmission.kt').is_file());self.assertIn('android:allowBackup="false"',self.manifest.read_text());self.assertEqual(result,install_lifecycle(self.root,self.pkg))
    def test_custom_activity_refused(self):
        self.activity.write_text('custom');before=self.manifest.read_bytes()
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,self.pkg)
        self.assertEqual(self.manifest.read_bytes(),before)
        self.assertEqual(self.activity.read_text(),'custom')
    def test_unknown_native_broker_helper_refused(self):
        p=self.activity.with_name('OmegaMemoryLeaseBroker.kt');p.write_text('untrusted')
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,self.pkg)
        self.assertEqual(self.activity.read_text(),template(self.pkg))
    def test_helper_tamper_refused_after_install(self):
        install_lifecycle(self.root,self.pkg)
        p=self.activity.with_name('OmegaThermalMonitor.kt');p.write_text(p.read_text()+'\\n// malicious alteration\\n')
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,self.pkg)
    def test_untrusted_coordinator_rejected_without_rewriting_activity(self):
        helper=self.activity.with_name('OmegaNativeModelCoordinator.kt')
        helper.write_text('override attempt')
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,self.pkg)
        self.assertEqual(helper.read_text(),'override attempt')
        self.assertEqual(self.activity.read_text(),template(self.pkg))
    def test_custom_helper_refused(self):
        p=self.activity.with_name('OmegaLifecycle.kt');p.write_text('untrusted')
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,self.pkg)
        self.assertEqual(self.activity.read_text(),template(self.pkg))
    def test_symlink_refused(self):
        self.activity.unlink();outside=self.root/'outside';outside.write_text(template(self.pkg));self.activity.symlink_to(outside)
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,self.pkg)
        self.assertEqual(outside.read_text(),template(self.pkg))
    def test_backup_explicit_true_refused(self):
        self.manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application android:allowBackup="true"/></manifest>')
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,self.pkg)
    def test_traversal_package(self):
        with self.assertRaises(RuntimeErrorCode):install_lifecycle(self.root,'../evil')
    def test_final_manifest_backup_and_launcher(self):
        from scripts.native_acceptance import validate_manifest
        xml='<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app"><application android:allowBackup="false"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>'
        self.assertEqual(validate_manifest(xml,self.pkg,require_no_backup=True),self.pkg+'/.MainActivity')
        for value in (xml.replace('allowBackup="false"','allowBackup="true"'),xml.replace('.MainActivity','other.pkg.MainActivity')):
            with self.assertRaises(RuntimeErrorCode):validate_manifest(value,self.pkg,require_no_backup=True)
    def test_build_integration(self):
        import test_runtime_control as fixtures
        from scripts.runtime_control import build_runtime
        # Existing initialized scaffold; mock only the unavailable toolchain.
        (self.root/'package.json').write_text('{}');(self.root/'package-lock.json').write_text('{}')
        (self.root/'src-tauri/Cargo.toml').write_text('{}');(self.root/'src-tauri/Cargo.lock').write_text('{}')
        h=fixtures.Runtime();h.root=self.root;calls,runner=h.runner(android=True);pin='ab'*32
        def run(args,cwd,log,timeout,env):
            if args[:6]==['npm','run','tauri','--','android','build']:
                self.assertIn('OmegaLifecycle',self.activity.read_text())
            if args[0]=='apksigner':log.write_text('Signer #1 certificate SHA-256 digest: '+pin+'\n')
            elif args[0]=='apkanalyzer':log.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app"><application android:allowBackup="false"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity></application></manifest>')
            else:runner(args,cwd,log,timeout,env)
        result=build_runtime(self.root,self.root,'android',run,signer_sha256=pin,package_id=self.pkg,native_lifecycle=True)
        self.assertEqual(result['native_lifecycle']['package'],self.pkg)
