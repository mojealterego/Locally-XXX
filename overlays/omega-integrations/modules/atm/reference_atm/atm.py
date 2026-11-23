"""ATM deterministic reference core (Python 3.11+, stdlib only).

Implements a scoped four-valued knowledge ledger, conservative decision gate,
step budget, limited DAG backdoor adjustment and deterministic hypothesis choice.
Does not implement Hopfield networks, general do-calculus, Lean/Rocq, quantum
hardware, energy-aware scheduling or production authentication.
"""
from __future__ import annotations

from collections import defaultdict, deque
from dataclasses import dataclass
from math import isfinite
from typing import Iterable, Mapping, Sequence


@dataclass(frozen=True)
class BelnapTruth:
    positive: bool
    negative: bool

    @property
    def label(self) -> str:
        return {
            (True, False): "TRUE_ONLY",
            (False, True): "FALSE_ONLY",
            (True, True): "BOTH",
            (False, False): "NEITHER",
        }[(self.positive, self.negative)]

    def negate(self) -> BelnapTruth:
        return BelnapTruth(self.negative, self.positive)

    def conjunction(self, other: BelnapTruth) -> BelnapTruth:
        return BelnapTruth(self.positive and other.positive,
                           self.negative or other.negative)

    def disjunction(self, other: BelnapTruth) -> BelnapTruth:
        return BelnapTruth(self.positive or other.positive,
                           self.negative and other.negative)


@dataclass(frozen=True)
class Evidence:
    evidence_id: str
    claim_id: str
    asserts_true: bool
    source_id: str
    tenant_id: str
    valid_from: int
    recorded_at: int
    valid_to: int | None = None

    def __post_init__(self) -> None:
        if not all((self.evidence_id, self.claim_id, self.source_id, self.tenant_id)):
            raise ValueError("Evidence IDs, claim, source and tenant must be nonempty")
        if self.valid_from > self.recorded_at:
            raise ValueError("Future valid_from relative to recorded_at needs an explicit event-time handling policy")
        if self.valid_to is not None and self.valid_to <= self.valid_from:
            raise ValueError("Invalid validity interval")


class KnowledgeStore:
    """Append evidence; revocation retains original evidence and transaction history."""

    def __init__(self) -> None:
        self._entries: dict[str, Evidence] = {}
        self._revoked_at: dict[str, int] = {}

    def add(self, evidence: Evidence) -> None:
        if evidence.evidence_id in self._entries:
            raise ValueError("Duplicate evidence ID")
        self._entries[evidence.evidence_id] = evidence

    def revoke(self, evidence_id: str, recorded_at: int) -> None:
        evidence = self._entries.get(evidence_id)
        if evidence is None:
            raise KeyError(evidence_id)
        if recorded_at < evidence.recorded_at:
            raise ValueError("Cannot revoke before an item was recorded")
        if evidence_id in self._revoked_at:
            raise ValueError("Evidence already revoked")
        self._revoked_at[evidence_id] = recorded_at

    def get_evidence(self, tenant_id: str, claim_id: str,
                     valid_at: int, known_at: int) -> tuple[Evidence, ...]:
        if not tenant_id or not claim_id:
            raise ValueError("Tenant and claim are mandatory")
        return tuple(sorted((ev for ev in self._entries.values()
                             if ev.tenant_id == tenant_id
                             and ev.claim_id == claim_id
                             and ev.recorded_at <= known_at
                             and ev.valid_from <= valid_at
                             and (ev.valid_to is None or valid_at < ev.valid_to)
                             and (ev.evidence_id not in self._revoked_at
                                  or known_at < self._revoked_at[ev.evidence_id])),
                            key=lambda ev: ev.evidence_id))

    def truth(self, tenant_id: str, claim_id: str,
              valid_at: int, known_at: int) -> BelnapTruth:
        evidence = self.get_evidence(tenant_id, claim_id, valid_at, known_at)
        return BelnapTruth(any(ev.asserts_true for ev in evidence),
                           any(not ev.asserts_true for ev in evidence))


@dataclass(frozen=True)
class ClaimRequirement:
    claim_id: str
    required_truth: str = "TRUE_ONLY"


@dataclass(frozen=True)
class ProofAttestation:
    contract_id: str
    source_digest: str
    checked: bool
    checker_id: str
    assumptions_id: str


@dataclass(frozen=True)
class ProposedAction:
    action_id: str
    tenant_id: str
    sensitivity: str
    tool_name: str
    required_claims: tuple[str, ...]
    contract_id: str
    source_digest: str
    utility: float


@dataclass(frozen=True)
class Decision:
    status: str  # APPROVED, DEFERRED, REJECTED
    action_id: str | None
    rationale: str


class DecisionGate:
    """Policy check; checked flag is not a cryptographic signature (demo only)."""

    SENSITIVITIES = frozenset(("read", "write", "network", "secret"))

    def __init__(self, knowledge: KnowledgeStore) -> None:
        self.knowledge = knowledge

    def evaluate(self, action: ProposedAction,
                 proof: ProofAttestation | None,
                 valid_at: int, known_at: int,
                 human_approved: bool) -> Decision:
        if action.sensitivity not in self.SENSITIVITIES:
            return Decision("REJECTED", action.action_id, "UNKNOWN_ACTION_SENSITIVITY")
        if not action.action_id or not action.tenant_id or not action.tool_name:
            return Decision("REJECTED", action.action_id, "INVALID_ACTION_IDENTITY")
        if not isfinite(action.utility):
            return Decision("REJECTED", action.action_id, "NONFINITE_UTILITY")
        if not proof or not proof.checked:
            return Decision("DEFERRED", action.action_id, "MISSING_CHECKED_PROOF")
        if proof.contract_id != action.contract_id or proof.source_digest != action.source_digest:
            return Decision("REJECTED", action.action_id, "PROOF_SCOPE_MISMATCH")
        if not proof.assumptions_id:
            return Decision("REJECTED", action.action_id, "MISSING_PROOF_ASSUMPTIONS")
        for claim in action.required_claims:
            if self.knowledge.truth(action.tenant_id, claim, valid_at, known_at).label != "TRUE_ONLY":
                return Decision("DEFERRED", action.action_id, f"UNRESOLVED_CLAIM:{claim}")
        if action.sensitivity in ("write", "network", "secret") and not human_approved:
            return Decision("DEFERRED", action.action_id, "HUMAN_APPROVAL_REQUIRED")
        return Decision("APPROVED", action.action_id, "ALL_REFERENCE_POLICY_CHECKS_PASSED")


class BudgetExceeded(RuntimeError):
    pass


class StepBudget:
    def __init__(self, maximum_steps: int) -> None:
        if maximum_steps < 1:
            raise ValueError("Maximum step budget must be >=1")
        self.maximum_steps = maximum_steps
        self.used = 0

    def consume(self) -> None:
        if self.used >= self.maximum_steps:
            raise BudgetExceeded("STEP_BUDGET_EXCEEDED")
        self.used += 1


def select_best_action(candidates: Sequence[ProposedAction], gate: DecisionGate,
                       proof: ProofAttestation | None, valid_at: int,
                       known_at: int, human_approved: bool,
                       budget: StepBudget) -> Decision:
    """Rank only authorized actions; never force a guess upon budget exhaustion."""
    approved: list[ProposedAction] = []
    for action in candidates:
        try:
            budget.consume()
        except BudgetExceeded:
            return Decision("DEFERRED", None, "INCOMPLETE_SEARCH_BUDGET_EXHAUSTED")
        decision = gate.evaluate(action, proof, valid_at, known_at, human_approved)
        if decision.status == "APPROVED":
            approved.append(action)
    if not approved:
        return Decision("DEFERRED", None, "NO_AUTHORIZED_ACTION")
    best = sorted(approved, key=lambda a: (-a.utility, a.action_id))[0]
    return Decision("APPROVED", best.action_id, "DETERMINISTIC_AUTHORIZED_SELECTION")


def consolidate_memory(evidence: Iterable[Evidence]) -> dict[str, dict[str, object]]:
    """Non-destructive, non-LLM summary. Never silently resolves contradictions."""
    grouped: dict[str, list[Evidence]] = defaultdict(list)
    for ev in evidence:
        grouped[ev.claim_id].append(ev)
    return {claim: {"positive_count": sum(ev.asserts_true for ev in records),
                    "negative_count": sum(not ev.asserts_true for ev in records),
                    "has_conflict": any(ev.asserts_true for ev in records)
                    and any(not ev.asserts_true for ev in records),
                    "evidence_ids": sorted(ev.evidence_id for ev in records)}
            for claim, records in sorted(grouped.items())}


class NotIdentifiable(ValueError):
    pass


class DirectedAcyclicGraph:
    """Observed-variable DAG: node -> direct parents."""

    def __init__(self, parents: Mapping[str, Sequence[str]]) -> None:
        self.parents = {str(node): tuple(ps) for node, ps in parents.items()}
        for node, ps in self.parents.items():
            if not node or any(p not in self.parents for p in ps) or len(set(ps)) != len(ps):
                raise ValueError("Graph has unknown or duplicate parents")
        if not self._is_acyclic():
            raise ValueError("Directed cycles are unsupported")

    def _is_acyclic(self) -> bool:
        indegree = {node: len(ps) for node, ps in self.parents.items()}
        children: dict[str, set[str]] = {node: set() for node in self.parents}
        for child, ps in self.parents.items():
            for parent in ps:
                children[parent].add(child)
        queue = deque(node for node, degree in indegree.items() if degree == 0)
        count = 0
        while queue:
            node = queue.popleft();count += 1
            for child in children[node]:
                indegree[child] -= 1
                if indegree[child] == 0: queue.append(child)
        return count == len(self.parents)

    def _ancestors(self, nodes: Iterable[str], parents: Mapping[str, tuple[str,...]] | None = None) -> set[str]:
        mapping = self.parents if parents is None else parents
        seen = set(nodes)
        stack = list(seen)
        while stack:
            node = stack.pop()
            for parent in mapping[node]:
                if parent not in seen:
                    seen.add(parent);stack.append(parent)
        return seen

    def descendants(self, node: str) -> set[str]:
        descendants = set()
        changed=True
        while changed:
            changed=False
            for child, ps in self.parents.items():
                if child != node and child not in descendants and (node in ps or any(x in descendants for x in ps)):
                    descendants.add(child);changed=True
        return descendants

    def valid_backdoor_set(self, exposure: str, outcome: str, covariates: Sequence[str]) -> bool:
        z = set(covariates)
        if exposure not in self.parents or outcome not in self.parents:
            raise ValueError("Unknown exposure or outcome")
        if z - self.parents.keys() or exposure in z or outcome in z:
            return False
        if any(node in self.descendants(exposure) for node in z):
            return False
        # Graph with every arrow exiting X removed (the backdoor graph).
        changed_parents = {
            node: tuple(p for p in ps if p != exposure) if node != exposure else ps
            for node, ps in self.parents.items()
        }
        relevant = self._ancestors({exposure, outcome, *z}, changed_parents)
        # Moralized ancestral graph for d-separation check.
        undirected = {node: set() for node in relevant}
        for child in relevant:
            ps = [p for p in changed_parents[child] if p in relevant]
            for p in ps:
                undirected[child].add(p);undirected[p].add(child)
            for i, p in enumerate(ps):
                for q in ps[i+1:]:
                    undirected[p].add(q);undirected[q].add(p)
        reached = {exposure}
        stack = [exposure]
        while stack:
            current = stack.pop()
            for neighbor in undirected[current] - z:
                if neighbor not in reached:
                    reached.add(neighbor);stack.append(neighbor)
        return outcome not in reached


def estimate_binary_backdoor_ate(dag: DirectedAcyclicGraph,
                                 records: Sequence[Mapping[str, object]],
                                 exposure: str, outcome: str,
                                 covariates: Sequence[str]) -> float:
    """Stratified backdoor adjustment on observed discrete covariates.

    This is NOT general do-calculus and does not establish causal assumptions.
    Requires all strata have both treatment values; no hidden confounders assumed.
    """
    if not dag.valid_backdoor_set(exposure, outcome, covariates):
        raise NotIdentifiable("ADJUSTMENT_SET_DOES_NOT_BLOCK_BACKDOOR")
    if not records:
        raise NotIdentifiable("NO_OBSERVATIONS")
    strata: dict[tuple[object,...], dict[int, list[float]]] = defaultdict(lambda: {0:[],1:[]})
    for rec in records:
        try:
            x=rec[exposure]
            y=rec[outcome]
            z=tuple(rec[col] for col in covariates)
            if x not in (0,1) or not isinstance(y,(int,float)) or not isfinite(float(y)):
                raise ValueError("Invalid treatment or outcome")
            strata[z][int(x)].append(float(y))
        except (KeyError, TypeError, ValueError) as exc:
            raise NotIdentifiable("INVALID_OBSERVATION") from exc
    n=len(records)
    weighted=0.0
    for groups in strata.values():
        treated, untreated = groups[1], groups[0]
        if not treated or not untreated:
            raise NotIdentifiable("POSITIVITY_VIOLATION")
        stratum_weight = (len(treated)+len(untreated))/n
        weighted += stratum_weight*(sum(treated)/len(treated)-sum(untreated)/len(untreated))
    return weighted
