#!/usr/bin/env python3
"""Offline 16 KiB Android native ELF/APK preflight. No SDK or network dependency.

AAB contents can be checked for ELF p_align, but the produced APK still needs
bundletool + zip alignment verification. Accordingly an AAB NEVER passes this
release gate on its own.
"""
from __future__ import annotations
import json
import stat
import struct
import sys
import zipfile
from pathlib import Path

PAGE = 16384
MAX_LIBRARIES = 256
MAX_LIB_SIZE = 1024 * 1024 * 1024
MAX_SUM_SIZE = 3 * 1024 * 1024 * 1024
READ_LIMIT = 65536


def check_elf64(prefix: bytes) -> dict[str, int]:
    if not isinstance(prefix, bytes) or len(prefix) < 64 or prefix[:4] != b'\x7fELF':
        raise ValueError('Invalid ELF header')
    if prefix[4] != 2 or prefix[5] != 1 or prefix[6] != 1:
        raise ValueError('Unsupported ELF class, byte-order or version')
    (e_type, e_machine, e_version, _entry, phoff, _shoff, _flags,
     ehsize, phentsize, phnum, _shentsize, _shnum, _shstrndx) = struct.unpack_from('<HHIQQQIHHHHHH', prefix, 16)
    if (e_type != 3 or e_machine != 183 or e_version != 1 or ehsize != 64
            or phentsize < 56 or phnum == 0 or phnum > 256 or phoff < 64
            or phoff + phnum * phentsize > min(len(prefix), READ_LIMIT)):
        raise ValueError('Unsupported or truncated arm64 ELF program headers')
    count = 0
    minimum = 1 << 63
    for i in range(phnum):
        pos = phoff + i * phentsize
        p_type, _flags, offset, vaddr, _paddr, _filesz, _memsz, align = struct.unpack_from('<IIQQQQQQ', prefix, pos)
        if p_type != 1:
            continue
        count += 1
        if align < PAGE or align & (align - 1) != 0:
            raise ValueError('ELF PT_LOAD page alignment below 16 KiB or not a power of two')
        if (vaddr - offset) % align != 0:
            raise ValueError('ELF PT_LOAD offset and virtual address incompatible')
        minimum = min(minimum, align)
    if not count:
        raise ValueError('No PT_LOAD segments in native library')
    return {'loads': count, 'minimumLoadAlignment': minimum}


def _zip_data_offset(handle, info: zipfile.ZipInfo) -> int:
    handle.seek(info.header_offset)
    header = handle.read(30)
    if len(header) != 30 or header[:4] != b'PK\x03\x04':
        raise ValueError('Invalid local ZIP header')
    name_len, extra_len = struct.unpack_from('<HH', header, 26)
    return info.header_offset + 30 + name_len + extra_len


def audit_archive(file_path: Path) -> dict:
    path = Path(file_path)
    if path.is_symlink() or not path.is_file() or path.suffix.lower() not in {'.apk', '.aab'}:
        raise ValueError('Expected regular APK or AAB file')
    apk = path.suffix.lower() == '.apk'
    prefix = 'lib/arm64-v8a/' if apk else 'base/lib/arm64-v8a/'
    all_prefix = 'lib/' if apk else 'base/lib/'
    with zipfile.ZipFile(path) as archive, path.open('rb') as raw:
        entries = archive.infolist()
        if len(entries) > 15000 or len({i.filename for i in entries}) != len(entries):
            raise ValueError('Oversized or ambiguous ZIP directory')
        libs = []
        total_bytes = 0
        for entry in entries:
            name = entry.filename
            if (name.startswith('/') or '\\' in name or any(part in ('..', '.') for part in name.split('/'))):
                raise ValueError('Unsafe ZIP member path')
            mode = (entry.external_attr >> 16) & 0o170000
            if mode == stat.S_IFLNK:
                raise ValueError('Symlink in release archive')
            if name.startswith(all_prefix) and name.endswith('.so'):
                if not name.startswith(prefix):
                    raise ValueError('Non-arm64 native library in arm64-only release')
                if entry.file_size < 120 or entry.file_size > MAX_LIB_SIZE:
                    raise ValueError('Native library size invalid')
                total_bytes += entry.file_size
                if total_bytes > MAX_SUM_SIZE or len(libs) >= MAX_LIBRARIES:
                    raise ValueError('Native library resource cap exceeded')
                libs.append(entry)
        if not libs:
            raise ValueError('No arm64 native libraries found')
        records = []
        for entry in libs:
            # Stored APK .so are eligible for zero-copy mmap, requiring ZIP data alignment.
            if apk and entry.compress_type != zipfile.ZIP_STORED:
                raise ValueError('Compressed native library in mmap-required APK')
            if apk and _zip_data_offset(raw, entry) % PAGE != 0:
                raise ValueError('Native APK ZIP data offset is not 16 KiB aligned')
            with archive.open(entry) as item:
                header = item.read(min(READ_LIMIT, entry.file_size))
            record = check_elf64(header)
            records.append({'name': entry.filename, **record})
    return {
        'format': 'APK' if apk else 'AAB',
        'verifiedLibs': len(records),
        'requiredPageSizeBytes': PAGE,
        'allElfLoadsAligned': True,
        'zipAligned': apk,
        'releaseReady': apk,
        'note': 'AAB requires verification of final bundletool-generated APK' if not apk else 'Static ELF and APK ZIP preflight only; not hardware E2E',
        'libraries': records,
    }


def main(argv: list[str] | None = None) -> int:
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1:
        print('Usage: python scripts/verify_android_pagesize.py <release.apk|bundle.aab>', file=sys.stderr)
        return 2
    try:
        result = audit_archive(Path(args[0]))
        print(json.dumps(result, sort_keys=True, separators=(',', ':')))
        return 0 if result['releaseReady'] else 2
    except (ValueError, OSError, zipfile.BadZipFile, struct.error, RuntimeError) as exc:
        # Never dump archive payload or raw file names that may carry secrets.
        print(json.dumps({'releaseReady': False, 'error': type(exc).__name__, 'status': 'FAIL'}, sort_keys=True))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
