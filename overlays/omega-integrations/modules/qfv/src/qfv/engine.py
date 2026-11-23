"""QFV reference: deterministic field deformation, pseudo-3D, rig and audio/visual visemes.

Host-side demonstrator, not Android/GPU code. No external dependencies. Vectors are
in project-normalized units; timestamps are monotonic nanoseconds.
"""
from __future__ import annotations
from dataclasses import dataclass
import math
import re
from typing import Sequence

class QFVError(ValueError):
    """Input or resource boundary violation (fail closed)."""

def finite(*values: float) -> None:
    if any(not math.isfinite(x) for x in values):
        raise QFVError('NON_FINITE_INPUT')

@dataclass(frozen=True)
class Vector3:
    x: float
    y: float
    z: float

    def __post_init__(self) -> None:
        finite(self.x, self.y, self.z)

    def __add__(self, other: Vector3) -> Vector3:
        return Vector3(self.x + other.x, self.y + other.y, self.z + other.z)

    def __sub__(self, other: Vector3) -> Vector3:
        return Vector3(self.x - other.x, self.y - other.y, self.z - other.z)

    def __mul__(self, coefficient: float) -> Vector3:
        finite(coefficient)
        return Vector3(self.x * coefficient, self.y * coefficient, self.z * coefficient)

    __rmul__ = __mul__

    def length(self) -> float:
        return math.hypot(self.x, self.y, self.z)

    def dot(self, other: Vector3) -> float:
        return self.x * other.x + self.y * other.y + self.z * other.z

    def cross(self, other: Vector3) -> Vector3:
        return Vector3(self.y*other.z - self.z*other.y, self.z*other.x - self.x*other.z, self.x*other.y - self.y*other.x)

    def normalized(self) -> Vector3:
        n = self.length()
        if n < 1e-12: raise QFVError('ZERO_DIRECTION')
        return self * (1/n)

@dataclass(frozen=True)
class Mesh:
    vertices: tuple[Vector3, ...]

    def __post_init__(self) -> None:
        if not 1 <= len(self.vertices) <= 10_000:
            raise QFVError('MESH_VERTEX_LIMIT')

@dataclass(frozen=True)
class FieldEmitter:
    kind: str
    center: Vector3
    strength: float
    radius: float
    direction: Vector3 = Vector3(0., 0., 1.)
    frequency_hz: float = 0.0

    def __post_init__(self) -> None:
        finite(self.strength, self.radius, self.frequency_hz)
        if self.kind not in ('attractor', 'vortex', 'gravity'):
            raise QFVError('INVALID_FIELD_KIND')
        if not 0 < self.radius <= 10_000 or not 0 <= self.frequency_hz <= 120:
            raise QFVError('INVALID_FIELD_PARAMETERS')
        if abs(self.strength) > 10_000:
            raise QFVError('FIELD_STRENGTH_LIMIT')
        self.direction.normalized()

    def velocity(self, p: Vector3, time_s: float) -> Vector3:
        finite(time_s)
        amp = self.strength * (1.0 + 0.25 * math.sin(2 * math.pi * self.frequency_hz * time_s))
        delta = p - self.center
        envelope = math.exp(-delta.dot(delta) / (2 * self.radius * self.radius))
        if self.kind == 'attractor':
            return (self.center - p) * (amp * envelope)
        if self.kind == 'vortex':
            return self.direction.normalized().cross(delta) * (amp * envelope)
        return self.direction.normalized() * amp

class FieldDeformer:
    def __init__(self, emitters: Sequence[FieldEmitter], *, max_displacement: float = 5.0, steps: int = 12) -> None:
        finite(max_displacement)
        if not 0 <= len(emitters) <= 256 or not 1 <= steps <= 128 or not 0 < max_displacement <= 100:
            raise QFVError('RESOURCE_LIMIT')
        self.emitters = tuple(emitters)
        self.max_displacement = max_displacement
        self.steps = steps

    def _velocity(self, p: Vector3, t: float) -> Vector3:
        v = Vector3(0, 0, 0)
        for emitter in self.emitters:
            v = v + emitter.velocity(p, t)
        return v

    def _integrate(self, rest: Vector3, seconds: float) -> Vector3:
        if seconds == 0: return rest
        dt = seconds / self.steps
        p = rest
        for index in range(self.steps):
            t = index * dt
            k1 = self._velocity(p, t)
            k2 = self._velocity(p + k1*(dt/2), t+dt/2)
            k3 = self._velocity(p + k2*(dt/2), t+dt/2)
            k4 = self._velocity(p + k3*dt, t+dt)
            step = (k1 + k2*2 + k3*2 + k4) * (dt/6)
            offset = (p + step) - rest
            mag = offset.length()
            p = rest + offset * (self.max_displacement/mag) if mag > self.max_displacement else p + step
        return p

    def deform(self, rest_mesh: Mesh, time_s: float) -> Mesh:
        finite(time_s)
        if time_s < 0 or time_s > 5: raise QFVError('TIME_RANGE')
        return Mesh(tuple(self._integrate(p, time_s) for p in rest_mesh.vertices))

def mesh_from_ellipse(points: Sequence[tuple[float, float]], *, center: tuple[float,float], radii: tuple[float,float], depth: float) -> Mesh:
    """Approximate depth of convex face-like region, not true monocular 3D recovery."""
    finite(*center, *radii, depth)
    if radii[0] <= 0 or radii[1] <= 0 or depth < 0: raise QFVError('INVALID_ELLIPSE')
    result = []
    for x, y in points:
        finite(x, y)
        r2 = ((x-center[0])/radii[0])**2 + ((y-center[1])/radii[1])**2
        if r2 > 1.000001: raise QFVError('POINT_OUTSIDE_PSEUDO3D_DOMAIN')
        result.append(Vector3(x, y, depth*math.sqrt(max(0, 1-r2))))
    return Mesh(tuple(result))

@dataclass(frozen=True)
class RigActuator:
    name: str
    anchor: Vector3
    direction: Vector3
    radius: float
    gain: float

    def __post_init__(self) -> None:
        finite(self.radius, self.gain)
        if not self.name or not 0 < self.radius <= 1000 or not 0 <= self.gain <= 10:
            raise QFVError('INVALID_ACTUATOR')
        self.direction.normalized()

def morph_with_actuators(rest_mesh: Mesh, actuators: Sequence[RigActuator], coefficients: dict[str, float]) -> Mesh:
    if len(actuators) > 128 or len({a.name for a in actuators}) != len(actuators):
        raise QFVError('INVALID_RIG_CHANNELS')
    names = {a.name for a in actuators}
    if any(name not in names for name in coefficients): raise QFVError('UNKNOWN_ACTUATOR')
    for amount in coefficients.values():
        finite(amount)
        if not 0 <= amount <= 1: raise QFVError('INVALID_ACTUATOR_COEFFICIENT')
    positions = []
    for p in rest_mesh.vertices:
        displacement = Vector3(0,0,0)
        for a in actuators:
            delta = p-a.anchor
            w = math.exp(-delta.dot(delta)/(2*a.radius*a.radius))
            displacement = displacement + a.direction.normalized()*(a.gain*w*coefficients.get(a.name, 0))
        positions.append(p + displacement)
    return Mesh(tuple(positions))

@dataclass(frozen=True)
class FuseInput:
    timestamp_ns: int
    visual: list[float] | None
    audio: list[float] | None
    visual_confidence: float
    audio_confidence: float

class VisemeFusion:
    """Bounded-confidence visual/audio blending plus time-dependent exponential smoothing."""
    def __init__(self, *, smoothing_ms: float = 35, stale_ms: float = 250) -> None:
        finite(smoothing_ms, stale_ms)
        if not 0 < smoothing_ms <= 1000 or not 0 < stale_ms <= 10000:
            raise QFVError('INVALID_FUSION_TIME')
        self.tau_ns = smoothing_ms * 1_000_000
        self.stale_ns = stale_ms * 1_000_000
        self._last_ts: int | None = None
        self._last_observation_ts: int | None = None
        self._state: list[float] | None = None

    @staticmethod
    def _normalize(data: list[float] | None) -> list[float] | None:
        if data is None: return None
        if len(data) != 14: raise QFVError('EXPECTED_14_VISEMES')
        finite(*data)
        if any(x < 0 for x in data): raise QFVError('INVALID_VISEMES')
        total = sum(data)
        if total <= 0: raise QFVError('EMPTY_VISEME_DISTRIBUTION')
        return [x/total for x in data]

    def process(self, data: FuseInput) -> list[float]:
        if data.timestamp_ns < 0 or self._last_ts is not None and data.timestamp_ns <= self._last_ts:
            raise QFVError('NONMONOTONIC_FRAME_TIMESTAMP')
        finite(data.visual_confidence, data.audio_confidence)
        if not 0 <= data.visual_confidence <= 1 or not 0 <= data.audio_confidence <= 1:
            raise QFVError('INVALID_CONFIDENCE')
        visual = self._normalize(data.visual)
        audio = self._normalize(data.audio)
        vw = data.visual_confidence if visual is not None else 0
        aw = data.audio_confidence if audio is not None else 0
        if vw + aw == 0:
            if self._state is not None and self._last_observation_ts is not None and data.timestamp_ns - self._last_observation_ts <= self.stale_ns:
                self._last_ts = data.timestamp_ns
                return list(self._state)
            raise QFVError('NO_FRESH_MULTIMODAL_SIGNAL')
        target = [((visual[i] if visual else 0)*vw + (audio[i] if audio else 0)*aw) / (vw+aw) for i in range(14)]
        if self._state is not None and self._last_ts is not None:
            alpha = 1-math.exp(-(data.timestamp_ns-self._last_ts)/self.tau_ns)
            target = [(1-alpha)*old + alpha*new for old,new in zip(self._state,target)]
        self._state = target
        self._last_ts = data.timestamp_ns
        self._last_observation_ts = data.timestamp_ns
        return list(target)

class AdaptiveQualityPolicy:
    """Illustrative hysteretic governor; p95 is measured over a caller-defined window."""
    def __init__(self, mobile: bool) -> None:
        self.mobile = mobile
        self.low_quality = False
        self.good_windows = 0

    def update(self, p95_ms: float, memory_pressure: float, thermal_pressure: float) -> str:
        finite(p95_ms, memory_pressure, thermal_pressure)
        if p95_ms < 0 or not 0 <= memory_pressure <= 1 or not 0 <= thermal_pressure <= 1:
            raise QFVError('INVALID_TELEMETRY')
        frame_ms = 16.67 if self.mobile else 6.94
        overloaded = p95_ms > frame_ms or memory_pressure >= .8 or thermal_pressure >= .8
        if overloaded:
            self.low_quality = True
            self.good_windows = 0
        elif self.low_quality:
            if p95_ms < frame_ms * .8 and memory_pressure < .6 and thermal_pressure < .6:
                self.good_windows += 1
                if self.good_windows >= 3:
                    self.low_quality = False
                    self.good_windows = 0
            else:
                self.good_windows = 0
        if self.mobile:
            return 'MOBILE_FAST' if self.low_quality else 'MOBILE_FULL'
        return 'DESKTOP_BALANCED' if self.low_quality else 'DESKTOP_FULL'

_SVG_TOKENS = re.compile(r'\s*([MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?)\s*,?')

def parse_svg_path(path: str, *, subdivisions: int = 12) -> list[tuple[float, float]]:
    """Strict absolute SVG path subset M/L/C/Z; explicit rejection of unsupported syntax."""
    if len(path) > 16384 or not 1 <= subdivisions <= 128: raise QFVError('SVG_RESOURCE_LIMIT')
    tokens = []
    position = 0
    while position < len(path):
        if path[position:].strip() == '': break
        m = _SVG_TOKENS.match(path, position)
        if not m: raise QFVError('UNSUPPORTED_SVG_PATH_SYNTAX')
        tokens.append(m.group(1))
        position = m.end()
        if len(tokens) > 2048: raise QFVError('SVG_RESOURCE_LIMIT')
    out: list[tuple[float,float]] = []
    i = 0
    current: tuple[float,float] | None = None
    start: tuple[float,float] | None = None
    while i < len(tokens):
        cmd = tokens[i]; i += 1
        if cmd not in ('M','L','C','Z'): raise QFVError('UNSUPPORTED_SVG_PATH_COMMAND')
        n = {'M':2,'L':2,'C':6,'Z':0}[cmd]
        if i+n > len(tokens) or any(tokens[j] in ('M','L','C','Z') for j in range(i,i+n)):
            raise QFVError('INVALID_SVG_PATH_ARITY')
        try: coords = list(map(float,tokens[i:i+n]))
        except (ValueError, OverflowError) as exc: raise QFVError('INVALID_SVG_NUMERIC') from exc
        finite(*coords)
        i += n
        if cmd == 'M':
            current = (coords[0], coords[1]); start = current; out.append(current)
        elif current is None:
            raise QFVError('SVG_PATH_MUST_START_WITH_MOVE')
        elif cmd == 'L':
            current = (coords[0], coords[1]); out.append(current)
        elif cmd == 'C':
            a=current; b=(coords[0],coords[1]); c=(coords[2],coords[3]); d=(coords[4],coords[5])
            for step in range(1, subdivisions+1):
                t=step/subdivisions
                u=1-t
                out.append((u**3*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t**3*d[0],
                            u**3*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t**3*d[1]))
            current=d
        elif cmd == 'Z':
            if start is not None: out.append(start); current = start
    if not out: raise QFVError('EMPTY_SVG_PATH')
    return out
