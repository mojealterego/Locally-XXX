import tempfile
import unittest
from pathlib import Path
import xml.etree.ElementTree as ET
from scripts.android_brand import install_brand, validate_labels

NS='{http://schemas.android.com/apk/res/android}'
MANIFEST='''<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example.app"><application android:label="@string/app_name" android:allowBackup="false"><activity android:name=".MainActivity" android:exported="true"><intent-filter><action android:name="android.intent.action.MAIN"/><category android:name="android.intent.category.LAUNCHER"/></intent-filter></activity><provider android:name="example.Provider" android:authorities="${applicationId}.files" android:exported="false"/></application></manifest>'''
STRINGS='<resources><string name="app_name">LU</string><string name="main_activity_title">LU</string><string name="other">Preserve me</string></resources>'
class Branding(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name);self.main=self.root/'src-tauri/gen/android/app/src/main'
        self.base=self.main/'res/values/strings.xml';self.base.parent.mkdir(parents=True);self.base.write_text(STRINGS)
        self.manifest=self.main/'AndroidManifest.xml';self.manifest.write_text(MANIFEST)
        self.pl=self.main/'res/values-pl/strings.xml'
    def values(self,p):return {x.get('name'):x.text for x in ET.parse(p).getroot() if x.tag=='string'}
    def test_brand_and_preserve_provider(self):
        install_brand(self.root);self.assertEqual(self.values(self.base)['app_name'],'Locally Uncensored');self.assertEqual(self.values(self.pl)['app_name'],'Lokalnie Bez Cenzury');self.assertEqual(self.values(self.base)['other'],'Preserve me')
        app=ET.parse(self.manifest).getroot().find('application');self.assertEqual(app.get(NS+'allowBackup'),'false');self.assertEqual(app.find('provider').get(NS+'authorities'),'${applicationId}.files');self.assertEqual(app.find('activity').get(NS+'label'),'@string/app_name');self.assertEqual(ET.parse(self.manifest).getroot().get('package'),'com.example.app')
    def test_idempotence(self):
        a=install_brand(self.root);self.assertEqual(a,install_brand(self.root))
    def test_reject_doctype_without_changes(self):
        self.base.write_text('<!DOCTYPE resources><resources/>');before=self.manifest.read_bytes()
        with self.assertRaises(ValueError):install_brand(self.root)
        self.assertEqual(self.manifest.read_bytes(),before);self.assertFalse(self.pl.exists())
    def test_reject_symlink(self):
        self.pl.parent.mkdir();self.pl.symlink_to(self.base)
        with self.assertRaises(ValueError):install_brand(self.root)
        self.assertEqual(self.base.read_text(),STRINGS)
    def test_reject_duplicate_resource(self):
        self.base.write_text('<resources><string name="app_name">LU</string><string name="app_name">Other</string></resources>')
        with self.assertRaises(ValueError):install_brand(self.root)
    def test_reject_ambiguous_launcher(self):
        self.manifest.write_text(MANIFEST.replace('</application>',MANIFEST[MANIFEST.index('<activity'):MANIFEST.index('</activity>')+11]+'</application>'))
        with self.assertRaises(ValueError):install_brand(self.root)
    def test_final_label_contract(self):
        validate_labels('application-label:Locally Uncensored\napplication-label-pl:Lokalnie Bez Cenzury\n')
        with self.assertRaises(ValueError):validate_labels('application-label:LU\napplication-label-pl:Lokalnie Bez Cenzury\n')
        with self.assertRaises(ValueError):validate_labels('application-label:Locally Uncensored\n')
    def test_preserve_existing_pl_resources(self):
        self.pl.parent.mkdir();self.pl.write_text('<resources><string name="other">Zachowaj</string></resources>');install_brand(self.root);self.assertEqual(self.values(self.pl)['other'],'Zachowaj')
if __name__=='__main__':unittest.main()
