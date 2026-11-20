import multiprocessing as mp
import tempfile
import unittest
from pathlib import Path
from scripts.resource_broker import Broker, process_identity
from scripts.runtime_control import RuntimeErrorCode


def worker(root, pipe):
    b=Broker(root)
    ticket=b.enqueue(200,process_identity())
    b.admit(ticket,process_identity())
    pipe.send(ticket)
    pipe.recv()


class BrokerTests(unittest.TestCase):
    def setUp(self):
        temp=tempfile.TemporaryDirectory(); self.addCleanup(temp.cleanup)
        self.root=Path(temp.name)/'broker'; self.now=[1.0]
        self.b=Broker(self.root,clock=lambda:self.now[0],boot=lambda:'boot-a',alive=lambda owner:owner!='dead')
        self.b.sample(4000,38000)
    def test_fifo_and_budget(self):
        a=self.b.enqueue(2800,'a'); z=self.b.enqueue(100,'z')
        self.assertFalse(self.b.admit(z,'z'))
        self.assertTrue(self.b.admit(a,'a')); self.assertTrue(self.b.admit(z,'z'))
        t=self.b.enqueue(100,'x');self.assertFalse(self.b.admit(t,'x'))
        self.b.finish(a,'a',True);self.assertTrue(self.b.admit(t,'x'))
    def test_owner_and_idempotence(self):
        t=self.b.enqueue(100,'a');self.assertTrue(self.b.admit(t,'a'));self.assertTrue(self.b.admit(t,'a'))
        with self.assertRaises(RuntimeErrorCode):self.b.finish(t,'other',True)
        self.b.finish(t,'a',True);self.b.finish(t,'a',True)
        self.assertEqual(self.b.status()['reserved_mib'],0)
    def test_thermal_persisted(self):
        self.b.sample(4000,43000);t=self.b.enqueue(100,'a');self.assertFalse(self.b.admit(t,'a'))
        b=Broker(self.root,clock=lambda:self.now[0],boot=lambda:'boot-a',alive=lambda _:True)
        b.sample(4000,40000);self.assertFalse(b.admit(t,'a'));b.sample(4000,39500);self.assertTrue(b.admit(t,'a'))
    def test_stale_and_boot_change(self):
        t=self.b.enqueue(100,'a');self.now[0]=12;self.assertFalse(self.b.admit(t,'a'))
        self.b.sample(4000,38000)
        b=Broker(self.root,clock=lambda:self.now[0],boot=lambda:'boot-b',alive=lambda _:True)
        self.assertFalse(b.admit(t,'a'));self.assertEqual(b.status()['jobs'][0]['state'],'CANCELLED')
    def test_orphan_quarantine(self):
        b=Broker(self.root,clock=lambda:self.now[0],boot=lambda:'boot-a',alive=lambda _:True)
        t=b.enqueue(2800,'dead');self.assertTrue(b.admit(t,'dead'))
        self.assertEqual(self.b.status()['jobs'][0]['state'],'ORPHANED')
        z=self.b.enqueue(100,'a');self.assertFalse(self.b.admit(z,'a'))
        self.b.reconcile(t,backend_idle=True);self.assertTrue(self.b.admit(z,'a'))
    def test_failed_job_retains_reservation(self):
        t=self.b.enqueue(200,'a');self.b.admit(t,'a');self.b.finish(t,'a',False)
        self.assertEqual(self.b.status()['reserved_mib'],200)
        with self.assertRaises(RuntimeErrorCode):self.b.reconcile(t,backend_idle=False)
        self.b.reconcile(t,backend_idle=True);self.assertEqual(self.b.status()['reserved_mib'],0)
    def test_cancel_pending(self):
        t=self.b.enqueue(100,'a');self.b.cancel(t,'a');self.assertFalse(self.b.admit(t,'a'))
    def test_private_directory(self):
        public=Path(self.root.parent)/'public';public.mkdir(mode=0o755)
        with self.assertRaises(RuntimeErrorCode):Broker(public)
    def test_real_process_death(self):
        root=Path(self.root.parent)/'real'; b=Broker(root);b.sample(4000,38000)
        a,c=mp.get_context('spawn').Pipe();p=mp.get_context('spawn').Process(target=worker,args=(root,c));p.start();c.close()
        self.addCleanup(lambda:p.kill() if p.is_alive() else None)
        self.assertTrue(a.poll(10));t=a.recv();p.kill();p.join(10);a.close()
        self.assertFalse(p.is_alive());self.assertEqual(b.status()['jobs'][0]['state'],'ORPHANED');b.reconcile(t,backend_idle=True)
        self.assertEqual(b.status()['reserved_mib'],0)
    def test_guarded_timeout_and_failure(self):
        from scripts.resource_broker import guarded
        tick=lambda n:self.now.__setitem__(0,self.now[0]+n)
        self.b.sample(4000,43000)
        with self.assertRaises(RuntimeErrorCode):guarded(self.b,100,lambda:self.fail('ran while hot'),wait=1,clock=lambda:self.now[0],sleep=tick,owner='a')
        self.assertEqual(self.b.status()['jobs'][-1]['state'],'CANCELLED')
        self.b.sample(4000,38000)
        with self.assertRaises(ValueError):guarded(self.b,100,lambda:(_ for _ in ()).throw(ValueError('failed')),clock=lambda:self.now[0],sleep=tick,owner='a')
        self.assertEqual(self.b.status()['jobs'][-1]['state'],'ORPHANED')
    def test_guarded_success_releases(self):
        from scripts.resource_broker import guarded
        self.assertEqual(guarded(self.b,100,lambda:42,clock=lambda:self.now[0],owner='a'),42)
        self.assertEqual(self.b.status()['reserved_mib'],0)
    def test_monitor_invalidates_on_probe_failure(self):
        from unittest.mock import patch
        from scripts.resource_broker import monitor
        with patch('scripts.resource_broker.android_probe',side_effect=RuntimeErrorCode('PROBE','denied')):
            with self.assertRaises(RuntimeErrorCode):monitor(self.b,'unused')
        self.assertIsNone(self.b.status()['sample'])
    def test_second_monitor_cannot_invalidate_current_sample(self):
        import fcntl
        from unittest.mock import patch
        from scripts.resource_broker import monitor
        with (self.root/'monitor.lock').open('w') as lock:
            fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
            with patch('scripts.resource_broker.android_probe',side_effect=AssertionError('second monitor ran')):
                with self.assertRaises(RuntimeErrorCode):monitor(self.b,'unused')
            self.assertIsNotNone(self.b.status()['sample'])
