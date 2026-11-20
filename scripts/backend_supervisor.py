"""Exclusive loopback backend lifecycle. Only an owned child may be stopped/restarted."""
import fcntl
import hashlib
import http.client
import json
import os
from pathlib import Path
import signal
import socket
import stat
import subprocess
import tempfile
import time
from scripts.runtime_control import require, RuntimeErrorCode

class OwnedBackend:
    def __init__(self,root,port,argv,cwd,*,deadline=30,restarts=1):
        require(type(port) is int and 1024<=port<=65535 and type(restarts) is int and 0<=restarts<=3 and type(deadline) is int and 1<=deadline<=120,'POLICY','Invalid backend policy')
        require(isinstance(argv,list) and len(argv)>0 and all(isinstance(a,str) and a and '\x00' not in a for a in argv),'POLICY','Invalid trusted command')
        self.root=Path(root).absolute();self.root.mkdir(mode=0o700,exist_ok=True);s=self.root.lstat()
        require(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and not s.st_mode&0o077,'STATE','Private backend directory required')
        self.cwd=Path(cwd).resolve(strict=True);require(self.cwd.is_dir(),'STATE','Invalid backend cwd');self.port=port;self.argv=argv;self.deadline=deadline;self.restarts=restarts;self.restarts_used=0;self.child=None;self.lock=None;self.group=None
        self.policy={'root':str(self.root),'cwd':str(self.cwd),'port':port,'argv_sha256':hashlib.sha256(json.dumps(argv,separators=(',',':')).encode()).hexdigest(),'startup_deadline':deadline,'restarts':restarts}
    def __enter__(self):
        require(self.lock is None,'STATE','Supervisor already entered');fd=os.open(self.root/'owner.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            s=os.fstat(fd);require(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and not s.st_mode&0o077,'STATE','Unsafe supervisor lock')
            fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as e:os.close(fd);raise RuntimeErrorCode('LOCKED','Backend already owned') from e
        except BaseException:os.close(fd);raise
        self.lock=fd;return self
    def __exit__(self,*exc):
        try:self.stop()
        finally:os.close(self.lock);self.lock=None
    def port_free(self):
        with socket.socket() as s:
            s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
            try:s.bind(('127.0.0.1',self.port))
            except OSError as e:raise RuntimeErrorCode('FOREIGN','Loopback port occupied; do not touch external process') from e
    def owns_listener(self):
        if self.child is None or self.child.poll() is not None:return False
        # Linux procfs socket ownership; permission errors deny readiness, including restricted Android.
        try:
            fds=Path(f'/proc/{self.child.pid}/fd');sockets=set()
            for fd in fds.iterdir():
                try: link=os.readlink(fd)
                except FileNotFoundError:continue
                if link.startswith('socket:['):sockets.add(link[8:-1])
            address=f'0100007F:{self.port:04X}'
            rows=[x.split() for x in Path(f'/proc/{self.child.pid}/net/tcp').read_text().splitlines()[1:]]
            return any(len(r)>9 and r[1]==address and r[3]=='0A' and r[9] in sockets for r in rows)
        except OSError:return False
    def healthy(self):
        if not self.owns_listener():return False
        c=http.client.HTTPConnection('127.0.0.1',self.port,timeout=.25)
        try:
            until=time.monotonic()+.5;c.request('GET','/system_stats');r=c.getresponse();parts=[];n=0
            if r.status!=200:return False
            while True:
                if time.monotonic()>until:return False
                part=r.read1(min(8192,65537-n))
                if not part:break
                n+=len(part)
                if n>65536:return False
                parts.append(part)
            raw=b''.join(parts)
            doc=json.loads(raw);return isinstance(doc,dict) and isinstance(doc.get('devices'),list) and self.owns_listener()
        except (OSError,http.client.HTTPException,ValueError):return False
        finally:c.close()
    def group_empty(self):
        if self.group is None:return True
        # Require proof that no live member of the previously owned session remains.
        for p in Path('/proc').iterdir():
            if not p.name.isdigit():continue
            try:fields=(p/'stat').read_text().rsplit(')',1)[1].split()
            except (FileNotFoundError,ProcessLookupError):continue
            except OSError as e:raise RuntimeErrorCode('UNKNOWN','Cannot inspect old backend process group') from e
            if len(fields)>3 and fields[0] not in ('Z','X') and int(fields[2])==self.group:return False
        return True
    def start(self):
        require(self.group_empty(),'UNKNOWN','Previous backend group still alive');self.port_free();fd,path=tempfile.mkstemp(prefix='backend-',suffix='.log',dir=self.root)
        with os.fdopen(fd,'wb') as log:self.child=subprocess.Popen(self.argv,cwd=self.cwd,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True,pass_fds=(self.lock,))
        self.group=self.child.pid
        until=time.monotonic()+self.deadline
        while time.monotonic()<until:
            if self.healthy():return
            if self.child.poll() is not None:break
            time.sleep(.05)
        self.stop();raise RuntimeErrorCode('UNAVAILABLE','Owned backend not ready')
    def ensure_ready(self,quiescent=True):
        require(self.lock is not None and type(quiescent) is bool,'STATE','Enter supervisor and supply explicit quiescence flag')
        if self.healthy():return
        require(quiescent,'UNKNOWN','Unresolved task: backend restart denied')
        if self.child is not None:
            require(self.restarts_used<self.restarts,'RESTART_LIMIT','Restart budget exhausted')
            self.stop();self.restarts_used+=1;time.sleep(.1*self.restarts_used)
        self.start()
    def stop(self):
        child=self.child
        # Never use PID from a state file. A live Popen child owns its freshly created process group.
        if child is None:return
        if child.poll() is not None:
            require(self.group_empty(),'UNKNOWN','Backend descendants still running');return
        try:os.killpg(child.pid,signal.SIGTERM)
        except ProcessLookupError:pass
        try:child.wait(timeout=2)
        except subprocess.TimeoutExpired:
            try:os.killpg(child.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            child.wait(timeout=2)
        require(self.group_empty(),'UNKNOWN','Backend descendants still running')
