"""OTCM reference: bounded, local quad-temporal event memory (SQLite, Python 3.11+).

Demonstrates contracts and defensive data isolation; does not claim neural/hardware memory.
Caller supplies trusted UTC timestamps and authenticated tenant/agent context. A production
service MUST derive tenant identity from its verified session, not request parameters.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from threading import RLock
from typing import Any, Literal
import hashlib
import json
import sqlite3


class PolicyError(PermissionError):
    """The requested memory operation is outside the caller's capability boundary."""


@dataclass(frozen=True)
class MemoryInput:
    tenant: str
    agent: str
    claim: str
    payload: dict[str, Any]
    valid_from: int
    valid_to: int
    recorded_at: int
    source: str
    privacy: Literal['private', 'shared'] = 'private'
    consent: str | None = None
    branch: str = 'main'
    simulation_at: int | None = None
    kind: Literal['fact','abstraction','retraction'] = 'fact'
    source_ids: tuple[str, ...] = ()
    target_id: str | None = None


def _canonical(value: Any) -> str:
    try:
        return json.dumps(value, sort_keys=True, ensure_ascii=False, allow_nan=False,
                          separators=(',', ':'))
    except (TypeError, ValueError) as exc:
        raise ValueError('Invalid JSON-compatible payload') from exc


def _validate(event: MemoryInput) -> None:
    for field in (event.tenant, event.agent, event.claim, event.source, event.branch):
        if not isinstance(field, str) or not field.strip() or len(field)>256:
            raise ValueError('Invalid identifier')
    if not isinstance(event.payload, dict):
        raise ValueError('Invalid payload type')
    _canonical(event.payload)
    if not all(type(v) is int for v in (event.valid_from,event.valid_to,event.recorded_at)):
        raise ValueError('Invalid UTC timestamp')
    if event.valid_from >= event.valid_to:
        raise ValueError('Invalid validity interval')
    if event.privacy not in ('private', 'shared'):
        raise PolicyError('DENIED_UNSUPPORTED_PRIVACY_CLASS')
    if event.privacy == 'shared' and (not event.consent or not event.consent.strip()):
        raise PolicyError('DENIED_NO_EXPLICIT_SHARING_CONSENT')
    if event.branch == 'main' and event.simulation_at is not None:
        raise ValueError('Invalid simulation time for canonical branch')
    if event.branch != 'main' and (type(event.simulation_at) is not int):
        raise ValueError('Invalid simulation time for simulation branch')


class OmniTemporalStore:
    def __init__(self, path: str | Path):
        self._conn = sqlite3.connect(str(path), isolation_level=None, check_same_thread=False)
        self._lock = RLock()
        self._conn.row_factory = sqlite3.Row
        self._conn.execute('PRAGMA foreign_keys=ON')
        self._conn.execute('PRAGMA secure_delete=ON')
        if str(path) != ':memory:':
            self._conn.execute('PRAGMA journal_mode=WAL')
        self._conn.executescript('''
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY, tenant TEXT NOT NULL, agent TEXT NOT NULL,
                claim TEXT NOT NULL, payload TEXT NOT NULL,
                valid_from INTEGER NOT NULL, valid_to INTEGER NOT NULL,
                recorded_at INTEGER NOT NULL, cognitive_seq INTEGER NOT NULL,
                source TEXT NOT NULL, privacy TEXT NOT NULL, consent TEXT,
                branch TEXT NOT NULL, simulation_at INTEGER, kind TEXT NOT NULL,
                source_ids TEXT NOT NULL, target_id TEXT
            );
            CREATE INDEX IF NOT EXISTS events_asof ON events(tenant,branch,valid_from,valid_to,recorded_at);
            CREATE INDEX IF NOT EXISTS events_agent ON events(tenant,agent,cognitive_seq);
        ''')

    def close(self) -> None:
        self._conn.close()

    def append(self, event: MemoryInput) -> tuple[str, int]:
        _validate(event)
        body = {
            'tenant':event.tenant, 'agent':event.agent, 'claim':event.claim,
            'payload':event.payload, 'valid_from':event.valid_from,'valid_to':event.valid_to,
            'recorded_at':event.recorded_at,'source':event.source,'privacy':event.privacy,
            'consent':event.consent, 'branch':event.branch,'simulation_at':event.simulation_at,
            'kind':event.kind,'source_ids':event.source_ids,'target_id':event.target_id
        }
        event_id=hashlib.sha256(_canonical(body).encode('utf-8')).hexdigest()
        with self._lock:
            self._conn.execute('BEGIN IMMEDIATE')
            try:
                existing=self._conn.execute('SELECT cognitive_seq FROM events WHERE id=?',(event_id,)).fetchone()
                if existing is not None:
                    self._conn.execute('COMMIT')
                    return event_id, int(existing[0])
                row=self._conn.execute('SELECT COALESCE(MAX(cognitive_seq),0)+1 FROM events WHERE tenant=? AND agent=?',
                                       (event.tenant,event.agent)).fetchone()
                seq=int(row[0])
                self._conn.execute('''INSERT INTO events
                    (id,tenant,agent,claim,payload,valid_from,valid_to,recorded_at,cognitive_seq,
                    source,privacy,consent,branch,simulation_at,kind,source_ids,target_id)
                    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
                    (event_id,event.tenant,event.agent,event.claim,_canonical(event.payload),
                     event.valid_from,event.valid_to,event.recorded_at,seq,event.source,event.privacy,
                     event.consent,event.branch,event.simulation_at,event.kind,_canonical(list(event.source_ids)),event.target_id))
                self._conn.execute('COMMIT')
                return event_id,seq
            except Exception:
                self._conn.execute('ROLLBACK')
                raise

    @staticmethod
    def _decode(row: sqlite3.Row) -> dict[str, Any]:
        value=dict(row)
        value['payload']=json.loads(value['payload'])
        value['source_ids']=json.loads(value['source_ids'])
        return value

    def audit(self,tenant:str,agent:str) -> list[dict[str, Any]]:
        # Production callers MUST authenticate tenant+agent before invoking this interface.
        with self._lock:
            rows=self._conn.execute('SELECT * FROM events WHERE tenant=? AND agent=? ORDER BY cognitive_seq,id',(tenant,agent)).fetchall()
        return [self._decode(r) for r in rows]

    def as_of(self, tenant:str, agent:str, valid_at:int, known_at:int,
              *, cognitive_at:int|None=None, branch:str='main',simulation_at:int|None=None)->list[dict[str,Any]]:
        if branch == 'main' and simulation_at is not None:
            raise ValueError('simulation_at not applicable to canonical branch')
        if branch != 'main' and simulation_at is None:
            raise ValueError('simulation_at required for simulation branch')
        sql='''SELECT * FROM events
               WHERE tenant=? AND branch=? AND (agent=? OR (privacy='shared' AND consent IS NOT NULL))
               AND valid_from<=? AND valid_to>? AND recorded_at<=?'''
        params: list[Any]=[tenant,branch,agent,valid_at,valid_at,known_at]
        if cognitive_at is not None:
            sql+=' AND cognitive_seq<=?'; params.append(cognitive_at)
        if branch != 'main':
            sql+=' AND simulation_at<=?';params.append(simulation_at)
        sql+=' ORDER BY recorded_at,cognitive_seq,id'
        with self._lock:
            rows=[self._decode(r) for r in self._conn.execute(sql,params).fetchall()]
        retracted={r['target_id'] for r in rows if r['kind']=='retraction'}
        return [r for r in rows if r['kind']!='retraction' and r['id'] not in retracted]

    def retract(self, tenant:str, agent:str, event_id:str,recorded_at:int,reason:str)->tuple[str,int]:
        with self._lock:
            record=self._conn.execute('SELECT * FROM events WHERE id=? AND tenant=? AND agent=?',
                                      (event_id,tenant,agent)).fetchone()
        if record is None:
            raise PolicyError('DENIED_EVENT_NOT_OWNED')
        existing=self._decode(record)
        if recorded_at<existing['recorded_at']:
            raise ValueError('Invalid retraction time')
        return self.append(MemoryInput(tenant,agent,existing['claim'],{'reason':reason},
                          existing['valid_from'],existing['valid_to'],recorded_at,'owner-retraction',
                          privacy=existing['privacy'],consent=existing['consent'],
                          branch=existing['branch'], simulation_at=existing['simulation_at'],
                          kind='retraction',target_id=event_id))

    def consolidate(self,tenant:str,agent:str,source_ids:list[str],summary:str,recorded_at:int)->tuple[str,int]:
        if not source_ids or not summary.strip():
            raise ValueError('Invalid consolidation input')
        with self._lock:
            rows=[]
            for source_id in source_ids:
                r=self._conn.execute('SELECT * FROM events WHERE id=? AND tenant=? AND agent=? AND branch=?',
                                     (source_id,tenant,agent,'main')).fetchone()
                if r is None:
                    raise PolicyError('DENIED_FOREIGN_OR_NONCANONICAL_SOURCE')
                rows.append(self._decode(r))
        return self.append(MemoryInput(tenant,agent,'summary:'+hashlib.sha256(_canonical(source_ids).encode()).hexdigest()[:20],
                    {'summary':summary},min(r['valid_from'] for r in rows),max(r['valid_to'] for r in rows),
                    recorded_at,'verified-consolidation',source_ids=tuple(source_ids),kind='abstraction'))
