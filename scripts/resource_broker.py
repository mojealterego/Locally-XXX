"""Persistent, process-shared admission for a trusted local Android/POSIX runtime."""
import argparse
from contextlib import contextmanager
import json
import fcntl
import os
from pathlib import Path
import sqlite3
import stat
import time
import uuid
from scripts.runtime_control import RuntimeErrorCode, require, android_probe, LocalBackend


def boot_id():
    return Path('/proc/sys/kernel/random/boot_id').read_text().strip()


def identity(pid):
    # /proc/stat comm may contain spaces and parentheses; split after the last ')'.
    fields=Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()
    if fields[0] in ('Z','X'): raise ProcessLookupError(pid)
    return f'{pid}:{fields[19]}'


def process_identity(): return identity(os.getpid())


def process_alive(owner):
    try: return identity(int(owner.split(':',1)[0]))==owner
    except (FileNotFoundError,ProcessLookupError,ValueError,IndexError): return False
    except OSError: return True  # Cannot prove death: fail closed.


class Broker:
    def __init__(self,root,clock=time.monotonic,boot=boot_id,alive=process_alive):
        self.root=Path(root).absolute();self.clock=clock;self.boot=boot;self.alive=alive
        self.root.mkdir(mode=0o700,exist_ok=True)
        s=self.root.lstat()
        require(stat.S_ISDIR(s.st_mode) and s.st_uid==os.getuid() and not s.st_mode&0o077,'STATE','Private owned broker directory required')
        self.db=self.root/'broker.sqlite3'
        fd=os.open(self.db,os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
        try:
            s=os.fstat(fd);require(stat.S_ISREG(s.st_mode) and s.st_uid==os.getuid() and not s.st_mode&0o077,'STATE','Unsafe broker database')
        finally:os.close(fd)
        with self.tx() as c:
            c.execute('CREATE TABLE IF NOT EXISTS sample (id INTEGER PRIMARY KEY CHECK(id=1), boot TEXT NOT NULL, stamp REAL NOT NULL, available INTEGER NOT NULL, hot INTEGER NOT NULL)')
            c.execute('CREATE TABLE IF NOT EXISTS jobs (seq INTEGER PRIMARY KEY AUTOINCREMENT, ticket TEXT UNIQUE NOT NULL, owner TEXT NOT NULL, boot TEXT NOT NULL, mib INTEGER NOT NULL, state TEXT NOT NULL)')
    @contextmanager
    def tx(self):
        c=sqlite3.connect(self.db,timeout=5,isolation_level=None);c.row_factory=sqlite3.Row
        try:
            c.execute('PRAGMA synchronous=FULL');c.execute('BEGIN IMMEDIATE');yield c;c.commit()
        except BaseException:c.rollback();raise
        finally:c.close()
    def sweep(self,c):
        boot=self.boot()
        for r in c.execute("SELECT * FROM jobs WHERE state IN ('QUEUED','ACTIVE')").fetchall():
            if r['boot']!=boot or not self.alive(r['owner']):
                c.execute('UPDATE jobs SET state=? WHERE ticket=?',('CANCELLED' if r['state']=='QUEUED' else 'ORPHANED',r['ticket']))
    def sample(self,mib,mc):
        require(type(mib) is int and 0<=mib<=1048576 and type(mc) is int and -20000<=mc<=120000,'PROBE','Invalid resource sample')
        with self.tx() as c:
            old=c.execute('SELECT * FROM sample WHERE id=1').fetchone();hot=bool(old['hot']) if old else True
            if mc>=43000:hot=True
            elif mc<=39500:hot=False
            c.execute('INSERT OR REPLACE INTO sample VALUES (1,?,?,?,?)',(self.boot(),self.clock(),mib,int(hot)))
    def invalidate(self):
        with self.tx() as c:c.execute('DELETE FROM sample')
    def enqueue(self,mib,owner):
        require(type(mib) is int and 0<mib<=1048576 and isinstance(owner,str) and 0<len(owner)<=128,'BUDGET','Invalid job')
        with self.tx() as c:
            self.sweep(c)
            require(c.execute('SELECT count(*) FROM jobs').fetchone()[0]<10000,'QUEUE','Journal capacity reached; archive offline')
            require(c.execute("SELECT count(*) FROM jobs WHERE state IN ('QUEUED','ACTIVE','ORPHANED')").fetchone()[0]<128,'QUEUE','Queue capacity reached')
            ticket=uuid.uuid4().hex;c.execute('INSERT INTO jobs(ticket,owner,boot,mib,state) VALUES (?,?,?,?,?)',(ticket,owner,self.boot(),mib,'QUEUED'));return ticket
    def owned(self,c,ticket,owner):
        r=c.execute('SELECT * FROM jobs WHERE ticket=?',(ticket,)).fetchone()
        require(r is not None and r['owner']==owner,'OWNER','Unknown or foreign ticket');return r
    def admit(self,ticket,owner):
        with self.tx() as c:
            self.sweep(c);r=self.owned(c,ticket,owner)
            if r['state']=='ACTIVE':return True
            if r['state']!='QUEUED':return False
            first=c.execute("SELECT ticket FROM jobs WHERE state='QUEUED' ORDER BY seq LIMIT 1").fetchone()
            sample=c.execute('SELECT * FROM sample WHERE id=1').fetchone()
            reserved=c.execute("SELECT coalesce(sum(mib),0) FROM jobs WHERE state IN ('ACTIVE','ORPHANED')").fetchone()[0]
            if c.execute("SELECT 1 FROM jobs WHERE state='ORPHANED' LIMIT 1").fetchone() or first['ticket']!=ticket or not sample or sample['boot']!=self.boot() or sample['hot'] or not 0<=self.clock()-sample['stamp']<=10 or reserved+r['mib']+1024>sample['available']:return False
            c.execute("UPDATE jobs SET state='ACTIVE' WHERE ticket=?",(ticket,));return True
    def check_active(self,ticket,owner):
        """Revalidate an existing lease before submitting another backend task."""
        with self.tx() as c:
            self.sweep(c);r=self.owned(c,ticket,owner)
            sample=c.execute('SELECT * FROM sample WHERE id=1').fetchone()
            reserved=c.execute("SELECT coalesce(sum(mib),0) FROM jobs WHERE state IN ('ACTIVE','ORPHANED')").fetchone()[0]
            orphan=c.execute("SELECT 1 FROM jobs WHERE state='ORPHANED' LIMIT 1").fetchone()
            valid=r['state']=='ACTIVE' and not orphan and sample and sample['boot']==self.boot() and not sample['hot'] and 0<=self.clock()-sample['stamp']<=10 and reserved+1024<=sample['available']
        require(valid,'ADMISSION','Lease no longer admissible: stale sample, heat, RAM or quarantine')
    def finish(self,ticket,owner,known_terminal):
        require(type(known_terminal) is bool,'STATE','Terminal evidence required')
        with self.tx() as c:
            self.sweep(c);r=self.owned(c,ticket,owner)
            if r['state'] in ('DONE','ORPHANED'):return
            require(r['state']=='ACTIVE','STATE','Job not active')
            c.execute('UPDATE jobs SET state=? WHERE ticket=?',('DONE' if known_terminal else 'ORPHANED',ticket))
    def cancel(self,ticket,owner):
        with self.tx() as c:
            r=self.owned(c,ticket,owner)
            require(r['state'] in ('QUEUED','CANCELLED'),'STATE','Cannot cancel running work')
            c.execute("UPDATE jobs SET state='CANCELLED' WHERE ticket=?",(ticket,))
    def reconcile(self,ticket,backend_idle):
        require(backend_idle is True,'STATE','Explicit independently checked backend idle required')
        with self.tx() as c:
            self.sweep(c);r=c.execute('SELECT state FROM jobs WHERE ticket=?',(ticket,)).fetchone()
            require(r is not None and r['state']=='ORPHANED','STATE','Only orphaned leases may be reconciled')
            c.execute("UPDATE jobs SET state='DONE' WHERE ticket=?",(ticket,))
    def status(self):
        with self.tx() as c:
            self.sweep(c);rows=[dict(r) for r in c.execute('SELECT ticket,mib,state FROM jobs ORDER BY seq')];sample=c.execute('SELECT * FROM sample WHERE id=1').fetchone()
            return {'jobs':rows,'reserved_mib':sum(r['mib'] for r in rows if r['state'] in ('ACTIVE','ORPHANED')),'sample':dict(sample) if sample else None}


def guarded(broker,mib,action,wait=60,clock=time.monotonic,sleep=time.sleep,owner=None,with_check=False):
    require(type(wait) is int and 1<=wait<=3600,'QUEUE','Invalid wait deadline')
    owner=owner or process_identity();ticket=broker.enqueue(mib,owner);deadline=clock()+wait;active=False
    try:
        while clock()<deadline:
            if broker.admit(ticket,owner):active=True;break
            sleep(min(0.25,max(0,deadline-clock())))
        require(active,'QUEUE','Admission deadline expired')
        result=action(lambda:broker.check_active(ticket,owner)) if with_check else action();broker.finish(ticket,owner,True);return result
    except BaseException:
        if active:broker.finish(ticket,owner,False)
        else:broker.cancel(ticket,owner)
        raise


def monitor(broker,sensor,interval=1):
    require(0.2<=interval<=5,'PROBE','Invalid sample interval')
    fd=os.open(broker.root/'monitor.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600)
    try:
        require(stat.S_ISREG(os.fstat(fd).st_mode),'STATE','Invalid monitor lock')
        try:fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError as e:raise RuntimeErrorCode('LOCKED','Monitor already running') from e
        try:
            broker.invalidate()
            while True:
                profile=android_probe();mc=int(Path(sensor).read_text().strip());broker.sample(profile['available_mib'],mc);time.sleep(interval)
        finally:broker.invalidate()
    finally:os.close(fd)


def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory');sub=p.add_subparsers(dest='action',required=True)
    sub.add_parser('status');m=sub.add_parser('monitor');m.add_argument('sensor');m.add_argument('--interval',type=float,default=1)
    rec=sub.add_parser('reconcile');rec.add_argument('ticket');rec.add_argument('--backend-idle-confirmed',action='store_true')
    c=sub.add_parser('chat');c.add_argument('port',type=int);c.add_argument('model');c.add_argument('prompt');c.add_argument('lease_mib',type=int);c.add_argument('--wait',type=int,default=60)
    a=p.parse_args()
    try:
        b=Broker(a.directory)
        if a.action=='monitor':monitor(b,a.sensor,a.interval);return 0
        if a.action=='reconcile':b.reconcile(a.ticket,a.backend_idle_confirmed)
        if a.action=='chat':
            android_probe();result=guarded(b,a.lease_mib,lambda:{'content':LocalBackend(a.port).chat(a.model,a.prompt)},a.wait)
        else:result=b.status()
        print(json.dumps(result,ensure_ascii=False,indent=2));return 0
    except (RuntimeErrorCode,OSError,ValueError,sqlite3.Error) as e:p.exit(1,str(e)+'\n')
if __name__=='__main__':raise SystemExit(main())
