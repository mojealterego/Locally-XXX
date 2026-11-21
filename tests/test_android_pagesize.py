import importlib.util
import json
import struct
import tempfile
import unittest
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('android_pagesize', ROOT / 'scripts' / 'verify_android_pagesize.py')
# Loading only the local module under review (no network, subprocess or SDK invocation).
PAGE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PAGE)

def elf64(alignment=16384, machine=183, offset=0, vaddr=0, program_type=1):
    header = bytearray(64 + 56)
    header[:16] = b'\x7fELF' + bytes([2, 1, 1, 0]) + b'\x00' * 8
    struct.pack_into('<HHIQQQIHHHHHH', header, 16, 3, machine, 1, 0, 64, 0, 0, 64, 56, 1, 0, 0, 0)
    struct.pack_into('<IIQQQQQQ', header, 64, program_type, 5, offset, vaddr, 0, 120, 120, alignment)
    return bytes(header)

def artifact(path, libs, aligned=False, compress=zipfile.ZIP_STORED):
    with zipfile.ZipFile(path, 'w', allowZip64=True) as z:
        for name, body in libs.items():
            info = zipfile.ZipInfo(name)
            info.compress_type = compress
            if aligned:
                # Local File Header (30 bytes), path bytes and local extra data.
                # Deterministic 16 KiB data offset on the first and all later entries.
                next_header_offset = z.fp.tell()
                padding = (-(next_header_offset + 30 + len(name.encode()) + 4)) % 16384
                info.extra = struct.pack('<HH', 0xfffe, padding) + bytes(padding)
            z.writestr(info, body)

class PagesizeGate(unittest.TestCase):
    def test_elf64_arm64_good_loads(self):
        x = PAGE.check_elf64(elf64())
        self.assertEqual(x['loads'], 1)
        self.assertEqual(x['minimumLoadAlignment'], 16384)
    def test_elf_rejects_4kb_and_misaligned_segments(self):
        for b in [elf64(alignment=4096), elf64(offset=4096, vaddr=0), elf64(alignment=0), elf64(program_type=2)]:
            with self.assertRaises(ValueError): PAGE.check_elf64(b)
    def test_elf_rejects_other_arch_and_truncation(self):
        for b in [elf64(machine=62), elf64()[:60], b'not elf', elf64(alignment=12288)]:
            with self.assertRaises(ValueError): PAGE.check_elf64(b)
    def test_aligned_stored_apk_passes(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'ok.apk'
            artifact(p, {'lib/arm64-v8a/libone.so': elf64(), 'lib/arm64-v8a/libtwo.so': elf64(alignment=65536)}, aligned=True)
            result=PAGE.audit_archive(p)
            self.assertTrue(result['releaseReady'])
            self.assertEqual(result['verifiedLibs'], 2)
            self.assertEqual(result['format'], 'APK')
    def test_apk_unaligned_zip_rejected_even_with_good_elf(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bad.apk'
            artifact(p, {'lib/arm64-v8a/libone.so':elf64()}, aligned=False)
            with self.assertRaises(ValueError): PAGE.audit_archive(p)
    def test_apk_compressed_native_lib_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'compressed.apk'
            artifact(p, {'lib/arm64-v8a/libone.so':elf64()}, compress=zipfile.ZIP_DEFLATED)
            with self.assertRaises(ValueError): PAGE.audit_archive(p)
    def test_aab_reports_partial_until_generated_apk_verified(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bundle.aab'
            artifact(p, {'base/lib/arm64-v8a/libone.so':elf64()}, aligned=False)
            result=PAGE.audit_archive(p)
            self.assertFalse(result['releaseReady'])
            self.assertEqual(result['verifiedLibs'],1)
            self.assertEqual(result['format'],'AAB')
    def test_unknown_archive_missing_library_and_traversal_refused(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'unknown.zip'
            artifact(p, {'lib/arm64-v8a/lib.so':elf64()})
            with self.assertRaises(ValueError): PAGE.audit_archive(p)
            p=Path(d)/'empty.apk'
            artifact(p, {'assets/info.txt':b'ok'})
            with self.assertRaises(ValueError): PAGE.audit_archive(p)
            p=Path(d)/'traversal.apk'
            artifact(p, {'../evil':b'x', 'lib/arm64-v8a/lib.so':elf64()},aligned=True)
            with self.assertRaises(ValueError): PAGE.audit_archive(p)
    def test_invalid_elf_exceptions_have_no_secret_or_file_payload(self):
        with self.assertRaises(ValueError) as ctx: PAGE.check_elf64(b'SECRET-UNTRUSTED')
        self.assertNotIn('SECRET-UNTRUSTED', str(ctx.exception))
    def test_cli_returns_nonzero_for_aab(self):
        import subprocess, sys
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'bundle.aab'
            artifact(p, {'base/lib/arm64-v8a/libone.so':elf64()})
            x=subprocess.run([sys.executable,str(ROOT/'scripts'/'verify_android_pagesize.py'),str(p)],capture_output=True,text=True,timeout=10)
            self.assertEqual(x.returncode,2)
            self.assertFalse(json.loads(x.stdout)['releaseReady'])

if __name__ == '__main__': unittest.main()
