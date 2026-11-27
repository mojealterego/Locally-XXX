"""Read-only, operator-scoped safetensors and LoRA inspection."""
import hashlib
import os
from pathlib import Path
import re
import stat
import struct
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from omega_actions.ultimate.safetensors_guard import SafetensorsReport, _parse_header
from omega_actions.ultimate.pareto_checkpoint import analyze_lora_report

MAX_HEADER = 1024 * 1024
MAX_HASH = 64 * 1024 * 1024
MAX_FILE = 128 * 1024**3


def _safe_stat(s, directory=False):
    if ((not stat.S_ISDIR(s.st_mode) if directory else not stat.S_ISREG(s.st_mode))
            or s.st_uid != os.getuid() or s.st_mode & 0o022
            or (not directory and s.st_nlink != 1)):
        raise ValueError('Unsafe model directory or file')


def _snapshot(s):
    return s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns


def inspect_checkpoint(v, directory):
    if (type(v) is not dict or set(v) != {'operation','name','mode','hash'}
            or v['operation'] != 'checkpoint-audit' or type(v['name']) is not str
            or not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,180}\.safetensors', v['name'])
            or v['mode'] not in ('container','lora') or type(v['hash']) is not bool):
        raise ValueError('Invalid checkpoint request')
    if (not directory or os.name != 'posix' or not hasattr(os,'O_NOFOLLOW')
            or not hasattr(os,'O_DIRECTORY') or os.open not in os.supports_dir_fd):
        raise ValueError('Safe checkpoint directory not configured')
    root = Path(directory)
    try:
        if not root.is_absolute() or root.resolve(strict=True) != root:
            raise ValueError('Canonical absolute directory required')
        dfd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            _safe_stat(os.fstat(dfd), True)
            fd = os.open(v['name'], os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=dfd)
            with os.fdopen(fd, 'rb') as source:
                before = os.fstat(source.fileno())
                _safe_stat(before)
                size = before.st_size
                if not 10 <= size <= MAX_FILE or (v['hash'] and size > MAX_HASH):
                    raise ValueError('Checkpoint size limit')
                prefix = source.read(8)
                if len(prefix) != 8:
                    raise ValueError('Truncated checkpoint')
                n = struct.unpack('<Q', prefix)[0]
                if not 2 <= n <= min(MAX_HEADER, size-8) or n % 8:
                    raise ValueError('Invalid header length')
                header = source.read(n)
                if len(header) != n:
                    raise ValueError('Truncated header')
                tensors, metadata = _parse_header(header, size-8-n, 8192)
                digest = None
                if v['hash']:
                    source.seek(0)
                    sha = hashlib.sha256()
                    remaining = size
                    while remaining:
                        chunk = source.read(min(remaining, 1024*1024))
                        if not chunk:
                            raise ValueError('File truncated')
                        sha.update(chunk)
                        remaining -= len(chunk)
                    digest = sha.hexdigest()
                if _snapshot(before) != _snapshot(os.fstat(source.fileno())):
                    raise ValueError('Checkpoint changed during inspection')
        finally:
            os.close(dfd)
    except (OSError, RuntimeError) as exc:
        raise ValueError('Checkpoint unavailable') from exc
    report = SafetensorsReport(size, n, size-8-n, tensors, metadata, digest)
    result = {'name':v['name'], 'file_bytes':size, 'header_bytes':n,
              'payload_bytes':report.payload_bytes, 'tensor_count':report.tensor_count,
              'sha256':digest, 'weights_loaded':False, 'weights_modified':False,
              'model_inference_verified':False}
    if v['mode'] == 'lora':
        audit = analyze_lora_report(report)
        result['lora'] = {k:audit[k] for k in ('pair_count','rank_histogram','mixed_dtype_pairs',
                          'base_model_sha256','lora_alpha','base_compatibility',
                          'eligible_for_automatic_merge','blockers')}
    return result
