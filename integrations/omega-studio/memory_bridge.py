"""Operator-local single-file block index and verified range reads."""
import base64
import hashlib
import os
from pathlib import Path
import sqlite3
import stat
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent / 'backend'))
from omega_actions.ultimate.holographic_memory import HolographicMemoryWeaver

MAX_FILE = 64 * 1024 * 1024
BLOCK_SIZE = 65536
MAX_READ = 4096


def private(info, directory=False):
    if (not (stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode))
            or info.st_uid != os.getuid() or info.st_mode & 0o077
            or (not directory and info.st_nlink != 1)):
        raise ValueError('Private owner directory or file required')


def check(path):
    private(path.lstat())


def open_private(path, create=False):
    flags = os.O_RDWR | os.O_NOFOLLOW | os.O_NONBLOCK
    if create:
        flags |= os.O_CREAT
    fd = os.open(path, flags, 0o600)
    try:
        private(os.fstat(fd))
    except BaseException:
        os.close(fd)
        raise
    return fd


def memory_operation(v, directory):
    if (type(v) is not dict or v.get('approved') is not True
            or v.get('operation') not in ('memory-index','memory-read')):
        raise ValueError('Explicit approval required')
    indexing = v['operation'] == 'memory-index'
    if set(v) != ({'operation','approved'} if indexing else {'operation','approved','offset','length'}):
        raise ValueError('Invalid request fields')
    if not indexing and (type(v['offset']) is not int or type(v['length']) is not int
                         or not 0 <= v['offset'] <= MAX_FILE or not 1 <= v['length'] <= MAX_READ):
        raise ValueError('Invalid range')
    if not directory or os.name != 'posix' or not hasattr(os,'O_NOFOLLOW'):
        raise ValueError('Private memory directory not configured')
    import fcntl
    try:
        root = Path(directory)
        if not root.is_absolute() or root.resolve(strict=True) != root:
            raise ValueError('Canonical directory required')
        private(root.lstat(), True)
        lock = open_private(root/'memory.lock', True)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            source, index = root/'memory.bin', root/'memory.sqlite'
            check(source)
            size = source.stat().st_size
            if not 1 <= size <= MAX_FILE:
                raise ValueError('File size limit')
            for suffix in ('-wal','-shm','-journal'):
                sidecar = root/('memory.sqlite'+suffix)
                if os.path.lexists(sidecar):
                    check(sidecar)
            fd = open_private(index, indexing)
            os.close(fd)
            engine = HolographicMemoryWeaver(index, block_size=BLOCK_SIZE)
            if indexing:
                r = engine.index(source)
                return {k:r[k] for k in ('blocks','bytes','sha256','method') } | {'block_size':BLOCK_SIZE,'source_modified':False,'index_persisted':True}
            if v['offset']+v['length'] > size:
                raise ValueError('Range outside file')
            data = engine.read_verified(source,v['offset'],v['length'])
            if len(data) != v['length']:
                raise ValueError('Incomplete verified range')
            return {'offset':v['offset'],'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),
                    'base64':base64.b64encode(data).decode('ascii'),'blocks_verified':True,
                    'source_modified':False,'index_persisted':True}
        finally:
            os.close(lock)
    except (OSError, sqlite3.Error, RuntimeError) as exc:
        raise ValueError('Memory operation unavailable') from exc
