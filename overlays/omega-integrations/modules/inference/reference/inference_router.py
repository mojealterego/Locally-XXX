"""Deterministyczny, wyłącznie lokalny selektor metadanych instancji.

Zakres: selekcja i walidacja polityk. Nie uruchamia modeli i nie zestawia połączeń.
Brak użycia sieci, zegara, losowości i zewnętrznych pakietów.
"""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import FrozenSet, Sequence


class Deployment(str, Enum):
    ON_DEVICE = "ON_DEVICE"
    DESKTOP_LOCAL = "DESKTOP_LOCAL"
    LAN_TRUSTED = "LAN_TRUSTED"
    CLOUD_HPC = "CLOUD_HPC"


class ExecutionMode(str, Enum):
    OFFLINE = "OFFLINE"
    HYBRID = "HYBRID"
    CLOUD_HPC = "CLOUD_HPC"


ALLOWED_DATA_CLASSES = frozenset({"PUBLIC", "INTERNAL", "PRIVATE", "RESTRICTED"})
ALLOWED_FORMATS = frozenset({"GGUF", "SAFETENSORS", "ONNX", "OPENVINO_IR", "TRT_ENGINE", "MNN", "OTHER"})


@dataclass(frozen=True, slots=True)
class Request:
    tenant_id: str
    mode: ExecutionMode
    data_class: str
    model_ref: str
    model_format: str
    capabilities: FrozenSet[str]
    estimated_peak_mib: int
    reserve_mib: int = 0
    allow_remote_egress: bool = False

    def validate(self) -> None:
        if not self.tenant_id or not self.model_ref or len(self.tenant_id) > 128:
            raise ValueError("INVALID_IDENTITY_OR_MODEL")
        if not isinstance(self.mode, ExecutionMode):
            raise ValueError("INVALID_EXECUTION_MODE")
        if self.data_class not in ALLOWED_DATA_CLASSES or self.model_format not in ALLOWED_FORMATS:
            raise ValueError("INVALID_DATA_CLASS_OR_MODEL_FORMAT")
        if not self.capabilities or any(not s or not isinstance(s, str) for s in self.capabilities):
            raise ValueError("INVALID_CAPABILITIES")
        if self.estimated_peak_mib <= 0 or self.reserve_mib < 0:
            raise ValueError("INVALID_MEMORY_BUDGET")
        if self.estimated_peak_mib > 2**31 - 1 or self.reserve_mib > 2**31 - 1:
            raise ValueError("INVALID_MEMORY_BUDGET")


@dataclass(frozen=True, slots=True)
class Runtime:
    runtime_id: str
    engine: str
    deployment: Deployment
    model_ref: str
    model_format: str
    capabilities: FrozenSet[str]
    allowed_data_classes: FrozenSet[str]
    tenants: FrozenSet[str]
    memory_headroom_mib: int
    healthy: bool
    version_pinned: bool
    priority: int = 100
    ttft_p95_ms: int | None = None
    cost_micro_usd_per_1000_tokens: int | None = None


class NoEligibleRuntime(Exception):
    """Nie ma silnika spełniającego wszystkie twarde ograniczenia."""


def select_runtime(request: Request, runtimes: Sequence[Runtime]) -> Runtime:
    """Deterministyczne fail-closed. Nie zmienia klas danych ani trybu wykonania."""
    request.validate()
    if len(runtimes) > 1024:
        raise ValueError("TOO_MANY_RUNTIME_CANDIDATES")
    ids = [rt.runtime_id for rt in runtimes]
    if any(not i or len(i) > 64 for i in ids) or len(set(ids)) != len(ids):
        raise ValueError("INVALID_OR_DUPLICATED_RUNTIME_IDS")
    requested_mib = request.estimated_peak_mib + request.reserve_mib
    eligible: list[Runtime] = []
    for runtime in runtimes:
        if not runtime.healthy or not runtime.version_pinned:
            continue
        if runtime.model_ref != request.model_ref or runtime.model_format != request.model_format:
            continue
        if request.tenant_id not in runtime.tenants:
            continue
        if request.data_class not in runtime.allowed_data_classes:
            continue
        if not request.capabilities.issubset(runtime.capabilities):
            continue
        if runtime.memory_headroom_mib < requested_mib:
            continue
        local = runtime.deployment in (Deployment.ON_DEVICE, Deployment.DESKTOP_LOCAL)
        if request.mode is ExecutionMode.OFFLINE and not local:
            continue
        if request.mode is ExecutionMode.CLOUD_HPC and runtime.deployment is not Deployment.CLOUD_HPC:
            continue
        if not local and not request.allow_remote_egress:
            continue
        eligible.append(runtime)
    if not eligible:
        raise NoEligibleRuntime("NO_ELIGIBLE_RUNTIME")

    def rank(runtime: Runtime) -> tuple[int, int, int, int, str]:
        local = runtime.deployment in (Deployment.ON_DEVICE, Deployment.DESKTOP_LOCAL)
        # HYBRID preferuje lokalne, CLOUD-HPC dopuszcza tylko chmurowe.
        local_penalty = 0 if local else 1
        latency = runtime.ttft_p95_ms if runtime.ttft_p95_ms is not None and runtime.ttft_p95_ms >= 0 else 2**31 - 1
        cost = runtime.cost_micro_usd_per_1000_tokens if runtime.cost_micro_usd_per_1000_tokens is not None and runtime.cost_micro_usd_per_1000_tokens >= 0 else 2**31 - 1
        return (local_penalty, runtime.priority, latency, cost, runtime.runtime_id)

    return min(eligible, key=rank)
