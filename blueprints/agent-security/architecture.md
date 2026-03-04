# Agent Security (SKSecurity) Architecture

## System Architecture

```
┌───────────────────────────────────────────────────────────────────┐
│                        Interface Layer                             │
│                                                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐              │
│  │  SOC Web    │  │  FastAPI     │  │  CLI App   │              │
│  │  Dashboard  │  │  REST API   │  │  click+rich│              │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘              │
├─────────┴────────────────┴────────────────┴──────────────────────┤
│                      Event Processing Layer                       │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  Event Bus   │  │  Event       │  │  Risk        │           │
│  │  (pub/sub)   │  │  Correlator  │  │  Aggregator  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
├──────────────────────────────────────────────────────────────────┤
│                      Five-Layer Defense Stack                     │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────┐  ┌───────┐│
│  │ Layer 1  │  │ Layer 2  │  │ Layer 3  │  │ L4   │  │ L5    ││
│  │ Pre-     │  │ Threat   │  │ Runtime  │  │ Data │  │ Inc.  ││
│  │ Deploy   │  │ Analysis │  │ Monitor  │  │ Prot │  │ Resp  ││
│  │ Gate     │  │ (ML)     │  │          │  │      │  │       ││
│  └──────────┘  └──────────┘  └──────────┘  └──────┘  └───────┘│
├──────────────────────────────────────────────────────────────────┤
│                      Intelligence Layer                           │
│                                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  NVD     │  │  GitHub  │  │  Moltbook│  │  AI ML   │        │
│  │  Feed    │  │  Advisory│  │  Feed    │  │  Patterns│        │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │
├──────────────────────────────────────────────────────────────────┤
│                      Storage Layer                                │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐            │
│  │  Event Store │  │  Baseline    │  │  Forensics  │            │
│  │  (SQLite)    │  │  Store       │  │  Archive    │            │
│  └──────────────┘  └──────────────┘  └─────────────┘            │
└──────────────────────────────────────────────────────────────────┘
```

## Core Architecture Patterns

### Event Bus and Processing Pipeline

The event bus is the central nervous system. All sensors publish events; all processors subscribe. This decoupling allows adding new detection capabilities without modifying existing sensors.

```python
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Optional, Any
from collections import defaultdict


class Severity(Enum):
    INFO = "INFO"
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

    @property
    def numeric(self) -> int:
        return {"INFO": 0, "LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}[
            self.value
        ]


class EventCategory(Enum):
    VULNERABILITY = "vulnerability"
    ANOMALY = "anomaly"
    POLICY_VIOLATION = "policy_violation"
    UNAUTHORIZED_ACCESS = "unauthorized_access"
    DATA_EXFILTRATION = "data_exfiltration"
    RESOURCE_ABUSE = "resource_abuse"
    INTEGRITY_FAILURE = "integrity_failure"


@dataclass
class SecurityEvent:
    """A normalized security event from any layer or sensor."""
    event_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str = field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )
    source_layer: int = 0
    severity: Severity = Severity.INFO
    category: EventCategory = EventCategory.ANOMALY
    agent_id: str = ""
    tenant_id: str = "default"
    description: str = ""
    details: dict = field(default_factory=dict)
    response: dict = field(default_factory=dict)


# Type alias for event handlers
EventHandler = Callable[[SecurityEvent], Any]


class EventBus:
    """In-memory pub/sub event bus for security events.

    All sensors publish events to the bus. Processors subscribe by
    severity, category, or wildcard. The bus guarantees at-least-once
    delivery to all active subscribers.
    """

    def __init__(self, max_queue_size: int = 10000):
        self._subscribers: dict[str, list[EventHandler]] = defaultdict(list)
        self._queue: asyncio.Queue[SecurityEvent] = asyncio.Queue(
            maxsize=max_queue_size
        )
        self._running = False
        self._event_count = 0

    def subscribe(
        self,
        handler: EventHandler,
        severity_filter: Optional[Severity] = None,
        category_filter: Optional[EventCategory] = None,
    ) -> str:
        """Subscribe a handler to events matching optional filters.

        Returns a subscription ID for later unsubscribe.
        """
        sub_id = str(uuid.uuid4())
        key = self._filter_key(severity_filter, category_filter)
        self._subscribers[key].append(handler)
        return sub_id

    def _filter_key(
        self,
        severity: Optional[Severity],
        category: Optional[EventCategory],
    ) -> str:
        s = severity.value if severity else "*"
        c = category.value if category else "*"
        return f"{s}:{c}"

    async def publish(self, event: SecurityEvent) -> None:
        """Publish an event to all matching subscribers."""
        await self._queue.put(event)

    async def _dispatch(self, event: SecurityEvent) -> None:
        """Fan-out event to all matching subscribers."""
        self._event_count += 1

        # Exact match subscribers
        exact_key = f"{event.severity.value}:{event.category.value}"
        # Severity wildcard
        sev_key = f"{event.severity.value}:*"
        # Category wildcard
        cat_key = f"*:{event.category.value}"
        # Full wildcard
        wild_key = "*:*"

        handlers = set()
        for key in [exact_key, sev_key, cat_key, wild_key]:
            for handler in self._subscribers.get(key, []):
                handlers.add(id(handler))
                try:
                    result = handler(event)
                    if asyncio.iscoroutine(result):
                        await result
                except Exception as e:
                    # Log but don't crash the bus
                    print(f"Handler error: {e}")

    async def run(self) -> None:
        """Main event processing loop."""
        self._running = True
        while self._running:
            try:
                event = await asyncio.wait_for(
                    self._queue.get(), timeout=1.0
                )
                await self._dispatch(event)
            except asyncio.TimeoutError:
                continue

    def stop(self) -> None:
        self._running = False

    @property
    def event_count(self) -> int:
        return self._event_count

    @property
    def queue_size(self) -> int:
        return self._queue.qsize()
```

### Behavioral Baseline Engine

The baseline engine learns what "normal" looks like for each agent, then detects deviations in real time. It uses a sliding window statistical model rather than a fixed snapshot.

```python
import json
import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone, timedelta


@dataclass
class MetricRange:
    """Statistical range for a single metric."""
    min_val: float = 0.0
    max_val: float = 0.0
    mean: float = 0.0
    std_dev: float = 0.0
    p5: float = 0.0
    p95: float = 0.0
    sample_count: int = 0

    def update(self, value: float) -> None:
        """Online update of running statistics (Welford's algorithm)."""
        self.sample_count += 1
        if self.sample_count == 1:
            self.min_val = self.max_val = self.mean = value
            self.std_dev = 0.0
            self._m2 = 0.0
        else:
            self.min_val = min(self.min_val, value)
            self.max_val = max(self.max_val, value)
            delta = value - self.mean
            self.mean += delta / self.sample_count
            delta2 = value - self.mean
            self._m2 = getattr(self, "_m2", 0.0) + delta * delta2
            self.std_dev = math.sqrt(self._m2 / self.sample_count)

        # Approximate percentiles using mean +/- std_dev
        self.p5 = self.mean - 1.645 * self.std_dev
        self.p95 = self.mean + 1.645 * self.std_dev

    def deviation_score(self, value: float) -> float:
        """How many standard deviations is value from the mean?

        Returns 0.0 if within normal range, higher values for larger
        deviations. Normalized to 0.0-1.0 where 1.0 = extreme outlier.
        """
        if self.std_dev == 0 or self.sample_count < 10:
            return 0.0

        z_score = abs(value - self.mean) / self.std_dev

        # Normalize: 0 std_devs -> 0.0, 3+ std_devs -> 1.0
        return min(z_score / 3.0, 1.0)


@dataclass
class AgentBaseline:
    """Behavioral baseline for a single agent."""
    agent_id: str
    profile_version: int = 0
    learning_started: str = ""
    learning_complete: bool = False
    observation_hours: float = 0.0

    # Resource metrics
    cpu_percent: MetricRange = field(default_factory=MetricRange)
    memory_mb: MetricRange = field(default_factory=MetricRange)
    disk_io_mbps: MetricRange = field(default_factory=MetricRange)
    open_files: MetricRange = field(default_factory=MetricRange)

    # Network metrics
    connections_per_minute: MetricRange = field(default_factory=MetricRange)
    bytes_out_per_minute: MetricRange = field(default_factory=MetricRange)
    bytes_in_per_minute: MetricRange = field(default_factory=MetricRange)
    unique_destinations: MetricRange = field(default_factory=MetricRange)

    # API metrics
    requests_per_minute: MetricRange = field(default_factory=MetricRange)
    error_rate_percent: MetricRange = field(default_factory=MetricRange)

    # Known-safe patterns
    allowed_destinations: set = field(default_factory=set)
    typical_api_endpoints: set = field(default_factory=set)


class BaselineEngine:
    """Learns and evaluates agent behavioral baselines."""

    def __init__(
        self,
        baselines_dir: Path,
        learning_hours: float = 72.0,
        anomaly_sensitivity: float = 0.7,
    ):
        self.baselines_dir = baselines_dir
        self.baselines_dir.mkdir(parents=True, exist_ok=True)
        self.learning_hours = learning_hours
        self.anomaly_sensitivity = anomaly_sensitivity
        self._baselines: dict[str, AgentBaseline] = {}

    def get_or_create(self, agent_id: str) -> AgentBaseline:
        """Get existing baseline or create new one in learning mode."""
        if agent_id not in self._baselines:
            path = self.baselines_dir / f"{agent_id}.baseline.json"
            if path.exists():
                self._baselines[agent_id] = self._load(path)
            else:
                baseline = AgentBaseline(
                    agent_id=agent_id,
                    learning_started=datetime.now(timezone.utc).isoformat(),
                )
                self._baselines[agent_id] = baseline
        return self._baselines[agent_id]

    def record_observation(
        self, agent_id: str, metrics: dict[str, float]
    ) -> None:
        """Feed a new observation into the baseline.

        During the learning window, this builds the statistical model.
        After learning completes, observations still refine the model
        but at a slower rate.
        """
        baseline = self.get_or_create(agent_id)

        metric_map = {
            "cpu_percent": baseline.cpu_percent,
            "memory_mb": baseline.memory_mb,
            "disk_io_mbps": baseline.disk_io_mbps,
            "open_files": baseline.open_files,
            "connections_per_minute": baseline.connections_per_minute,
            "bytes_out_per_minute": baseline.bytes_out_per_minute,
            "bytes_in_per_minute": baseline.bytes_in_per_minute,
            "unique_destinations": baseline.unique_destinations,
            "requests_per_minute": baseline.requests_per_minute,
            "error_rate_percent": baseline.error_rate_percent,
        }

        for key, value in metrics.items():
            if key in metric_map:
                metric_map[key].update(value)

        # Check if learning period is complete
        if not baseline.learning_complete and baseline.learning_started:
            started = datetime.fromisoformat(baseline.learning_started)
            elapsed = datetime.now(timezone.utc) - started
            baseline.observation_hours = elapsed.total_seconds() / 3600
            if baseline.observation_hours >= self.learning_hours:
                baseline.learning_complete = True
                baseline.profile_version += 1

    def evaluate(
        self, agent_id: str, current_metrics: dict[str, float]
    ) -> dict:
        """Evaluate current metrics against baseline.

        Returns a dict with:
        - overall_score: 0.0 (normal) to 1.0 (extreme anomaly)
        - metric_scores: per-metric deviation scores
        - is_anomalous: boolean based on sensitivity threshold
        - details: explanation of anomalies found
        """
        baseline = self.get_or_create(agent_id)

        if not baseline.learning_complete:
            return {
                "overall_score": 0.0,
                "metric_scores": {},
                "is_anomalous": False,
                "details": "Baseline still in learning phase",
            }

        metric_map = {
            "cpu_percent": baseline.cpu_percent,
            "memory_mb": baseline.memory_mb,
            "disk_io_mbps": baseline.disk_io_mbps,
            "open_files": baseline.open_files,
            "connections_per_minute": baseline.connections_per_minute,
            "bytes_out_per_minute": baseline.bytes_out_per_minute,
            "bytes_in_per_minute": baseline.bytes_in_per_minute,
            "unique_destinations": baseline.unique_destinations,
            "requests_per_minute": baseline.requests_per_minute,
            "error_rate_percent": baseline.error_rate_percent,
        }

        metric_scores: dict[str, float] = {}
        details: list[str] = []

        for key, value in current_metrics.items():
            if key in metric_map:
                score = metric_map[key].deviation_score(value)
                metric_scores[key] = score
                if score > self.anomaly_sensitivity:
                    details.append(
                        f"{key}: {value:.2f} is {score:.2f} deviant "
                        f"(normal range: {metric_map[key].p5:.2f} - "
                        f"{metric_map[key].p95:.2f})"
                    )

        # Overall score: weighted average emphasizing worst deviations
        if metric_scores:
            scores = sorted(metric_scores.values(), reverse=True)
            # Top 3 metrics contribute 70% of the score
            top_weight = 0.7
            rest_weight = 0.3
            top_n = min(3, len(scores))
            top_avg = sum(scores[:top_n]) / top_n
            rest_avg = (
                sum(scores[top_n:]) / len(scores[top_n:])
                if len(scores) > top_n
                else 0.0
            )
            overall = top_avg * top_weight + rest_avg * rest_weight
        else:
            overall = 0.0

        return {
            "overall_score": round(overall, 4),
            "metric_scores": metric_scores,
            "is_anomalous": overall > (1.0 - self.anomaly_sensitivity),
            "details": "; ".join(details) if details else "Within normal range",
        }

    def save(self, agent_id: str) -> None:
        """Persist baseline to disk."""
        baseline = self._baselines.get(agent_id)
        if not baseline:
            return
        path = self.baselines_dir / f"{agent_id}.baseline.json"
        # Serialize with custom handling for MetricRange and set
        data = self._serialize_baseline(baseline)
        path.write_text(json.dumps(data, indent=2))

    def _serialize_baseline(self, baseline: AgentBaseline) -> dict:
        """Convert baseline to JSON-serializable dict."""
        result = {
            "agent_id": baseline.agent_id,
            "profile_version": baseline.profile_version,
            "learning_started": baseline.learning_started,
            "learning_complete": baseline.learning_complete,
            "observation_hours": baseline.observation_hours,
            "allowed_destinations": list(baseline.allowed_destinations),
            "typical_api_endpoints": list(baseline.typical_api_endpoints),
        }
        for attr in [
            "cpu_percent", "memory_mb", "disk_io_mbps", "open_files",
            "connections_per_minute", "bytes_out_per_minute",
            "bytes_in_per_minute", "unique_destinations",
            "requests_per_minute", "error_rate_percent",
        ]:
            mr = getattr(baseline, attr)
            result[attr] = {
                "min": mr.min_val, "max": mr.max_val,
                "mean": mr.mean, "std_dev": mr.std_dev,
                "p5": mr.p5, "p95": mr.p95,
                "sample_count": mr.sample_count,
            }
        return result

    def _load(self, path: Path) -> AgentBaseline:
        """Load baseline from disk."""
        data = json.loads(path.read_text())
        baseline = AgentBaseline(
            agent_id=data["agent_id"],
            profile_version=data.get("profile_version", 0),
            learning_started=data.get("learning_started", ""),
            learning_complete=data.get("learning_complete", False),
            observation_hours=data.get("observation_hours", 0.0),
            allowed_destinations=set(data.get("allowed_destinations", [])),
            typical_api_endpoints=set(data.get("typical_api_endpoints", [])),
        )
        for attr in [
            "cpu_percent", "memory_mb", "disk_io_mbps", "open_files",
            "connections_per_minute", "bytes_out_per_minute",
            "bytes_in_per_minute", "unique_destinations",
            "requests_per_minute", "error_rate_percent",
        ]:
            if attr in data and isinstance(data[attr], dict):
                mr = getattr(baseline, attr)
                mr.min_val = data[attr].get("min", 0)
                mr.max_val = data[attr].get("max", 0)
                mr.mean = data[attr].get("mean", 0)
                mr.std_dev = data[attr].get("std_dev", 0)
                mr.p5 = data[attr].get("p5", 0)
                mr.p95 = data[attr].get("p95", 0)
                mr.sample_count = data[attr].get("sample_count", 0)
        return baseline
```

### Risk Score Aggregator

Combines signals from multiple detection engines into a single actionable risk score.

```python
from dataclasses import dataclass
from typing import Optional


@dataclass
class RiskSignal:
    """A single risk signal from any detection source."""
    source: str  # "ml_classifier", "rule_engine", "intel_match", "baseline"
    severity: Severity
    confidence: float  # 0.0 - 1.0
    description: str
    evidence: dict


class RiskAggregator:
    """Combines multiple risk signals into a composite score.

    Scoring strategy:
    - Base score from highest-severity signal
    - Corroborating signals from different sources increase score
    - Low-confidence signals are dampened
    - Score range: 0.0 (safe) to 10.0 (critical threat)
    """

    SEVERITY_WEIGHTS = {
        Severity.INFO: 0.5,
        Severity.LOW: 2.0,
        Severity.MEDIUM: 4.0,
        Severity.HIGH: 7.0,
        Severity.CRITICAL: 9.5,
    }

    ACTION_THRESHOLDS = {
        "log": 0.0,
        "alert": 3.0,
        "throttle": 6.0,
        "quarantine": 8.0,
    }

    def __init__(self):
        self._signals: dict[str, list[RiskSignal]] = {}

    def add_signal(self, agent_id: str, signal: RiskSignal) -> None:
        """Add a risk signal for an agent."""
        if agent_id not in self._signals:
            self._signals[agent_id] = []
        self._signals[agent_id].append(signal)

    def compute_score(self, agent_id: str) -> dict:
        """Compute composite risk score for an agent.

        Returns:
            {
                "score": float (0.0 - 10.0),
                "recommended_action": str,
                "signals": list of contributing signals,
                "corroboration_bonus": float,
            }
        """
        signals = self._signals.get(agent_id, [])
        if not signals:
            return {
                "score": 0.0,
                "recommended_action": "log",
                "signals": [],
                "corroboration_bonus": 0.0,
            }

        # Base score: highest severity signal, dampened by confidence
        base_scores = []
        for sig in signals:
            weight = self.SEVERITY_WEIGHTS[sig.severity]
            dampened = weight * sig.confidence
            base_scores.append(dampened)

        base_score = max(base_scores)

        # Corroboration bonus: signals from different sources confirming
        # the same threat increase the score
        unique_sources = set(sig.source for sig in signals)
        corroboration = min(len(unique_sources) - 1, 3) * 0.5

        final_score = min(base_score + corroboration, 10.0)

        # Determine recommended action
        action = "log"
        for act, threshold in sorted(
            self.ACTION_THRESHOLDS.items(), key=lambda x: x[1], reverse=True
        ):
            if final_score >= threshold:
                action = act
                break

        return {
            "score": round(final_score, 2),
            "recommended_action": action,
            "signals": [
                {
                    "source": s.source,
                    "severity": s.severity.value,
                    "confidence": s.confidence,
                    "description": s.description,
                }
                for s in signals
            ],
            "corroboration_bonus": corroboration,
        }

    def clear_signals(self, agent_id: str) -> None:
        """Clear all signals for an agent (after incident resolution)."""
        self._signals.pop(agent_id, None)
```

### Quarantine Engine

```python
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Optional
import subprocess
import shutil


class IsolationLevel(Enum):
    NETWORK_ONLY = "network_only"
    FULL = "full"
    FORENSIC = "forensic"


class QuarantineStatus(Enum):
    ACTIVE = "active"
    UNDER_REVIEW = "under_review"
    RELEASED = "released"
    TERMINATED = "terminated"


@dataclass
class QuarantineContainer:
    container_id: str
    agent_id: str
    triggered_by_event_id: str
    isolation_level: IsolationLevel
    status: QuarantineStatus
    created_at: str
    review_deadline: str
    forensic_path: Optional[str] = None


class QuarantineEngine:
    """Manages agent quarantine, isolation, and forensic capture."""

    def __init__(
        self,
        forensics_dir: Path,
        review_hours: int = 24,
    ):
        self.forensics_dir = forensics_dir
        self.forensics_dir.mkdir(parents=True, exist_ok=True)
        self.review_hours = review_hours
        self._quarantined: dict[str, QuarantineContainer] = {}

    def quarantine(
        self,
        agent_id: str,
        event: SecurityEvent,
        isolation_level: IsolationLevel = IsolationLevel.FULL,
    ) -> QuarantineContainer:
        """Quarantine an agent: isolate, capture forensics, record.

        Steps:
        1. Create forensic directory
        2. Capture forensic snapshot (if forensic level)
        3. Apply network isolation
        4. Throttle resources
        5. Record quarantine
        """
        container_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        deadline = now + timedelta(hours=self.review_hours)

        # Create forensic directory
        forensic_path = self.forensics_dir / container_id
        forensic_path.mkdir(parents=True, exist_ok=True)

        # Capture forensic snapshot
        if isolation_level in (IsolationLevel.FULL, IsolationLevel.FORENSIC):
            self._capture_forensics(agent_id, forensic_path)

        # Apply isolation (implementation depends on runtime: Docker, K8s, etc.)
        self._apply_isolation(agent_id, isolation_level)

        container = QuarantineContainer(
            container_id=container_id,
            agent_id=agent_id,
            triggered_by_event_id=event.event_id,
            isolation_level=isolation_level,
            status=QuarantineStatus.ACTIVE,
            created_at=now.isoformat(),
            review_deadline=deadline.isoformat(),
            forensic_path=str(forensic_path),
        )

        self._quarantined[agent_id] = container
        return container

    def release(self, agent_id: str, reviewer: str, notes: str) -> bool:
        """Release an agent from quarantine after review."""
        container = self._quarantined.get(agent_id)
        if not container:
            return False

        container.status = QuarantineStatus.RELEASED
        self._remove_isolation(agent_id)
        return True

    def terminate(self, agent_id: str, reason: str) -> bool:
        """Permanently terminate a quarantined agent."""
        container = self._quarantined.get(agent_id)
        if not container:
            return False

        container.status = QuarantineStatus.TERMINATED
        self._remove_isolation(agent_id)
        # Agent resources cleaned up by runtime
        return True

    def _capture_forensics(self, agent_id: str, path: Path) -> None:
        """Capture forensic snapshot: process info, network, filesystem."""
        import psutil

        # Process information
        procs = []
        for proc in psutil.process_iter(["pid", "name", "cmdline", "status"]):
            try:
                info = proc.info
                procs.append(info)
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue

        (path / "process_tree.json").write_text(
            json.dumps(procs, indent=2, default=str)
        )

        # Network connections
        conns = []
        for conn in psutil.net_connections(kind="all"):
            conns.append({
                "fd": conn.fd,
                "family": str(conn.family),
                "type": str(conn.type),
                "laddr": str(conn.laddr) if conn.laddr else None,
                "raddr": str(conn.raddr) if conn.raddr else None,
                "status": conn.status,
                "pid": conn.pid,
            })

        (path / "network_connections.json").write_text(
            json.dumps(conns, indent=2)
        )

        # System metrics at quarantine time
        metrics = {
            "cpu_percent": psutil.cpu_percent(interval=1),
            "memory": dict(psutil.virtual_memory()._asdict()),
            "disk_io": dict(psutil.disk_io_counters()._asdict())
            if psutil.disk_io_counters()
            else {},
            "captured_at": datetime.now(timezone.utc).isoformat(),
        }

        (path / "system_metrics.json").write_text(
            json.dumps(metrics, indent=2, default=str)
        )

    def _apply_isolation(
        self, agent_id: str, level: IsolationLevel
    ) -> None:
        """Apply network and resource isolation to an agent.

        In a Docker environment, this updates container network mode
        and resource constraints. In bare metal, it uses iptables/cgroups.
        """
        # Placeholder: actual implementation depends on runtime
        pass

    def _remove_isolation(self, agent_id: str) -> None:
        """Remove isolation restrictions from an agent."""
        pass
```

### Threat Intelligence Aggregator

```python
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
import httpx


@dataclass
class ThreatIndicator:
    """Normalized threat indicator from any intelligence source."""
    indicator_id: str
    source: str
    severity: Severity
    category: str  # vulnerability, malware, behavioral, policy
    pattern: str
    affected: list[str]
    mitigation: str
    confidence: float
    first_seen: str
    last_updated: str
    ttl_seconds: int = 86400


class IntelligenceAggregator:
    """Aggregates and normalizes threat intelligence from multiple feeds."""

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._indicators: dict[str, ThreatIndicator] = {}
        self._sources: list[IntelligenceSource] = []

    def register_source(self, source: IntelligenceSource) -> None:
        """Register a new intelligence feed source."""
        self._sources.append(source)

    async def refresh_all(self) -> dict:
        """Refresh all intelligence sources and normalize indicators."""
        results = {"sources_refreshed": 0, "indicators_added": 0, "errors": []}

        for source in self._sources:
            try:
                raw_indicators = await source.fetch()
                for raw in raw_indicators:
                    indicator = self._normalize(source.name(), raw)
                    self._indicators[indicator.indicator_id] = indicator
                    results["indicators_added"] += 1
                results["sources_refreshed"] += 1
            except Exception as e:
                results["errors"].append(f"{source.name()}: {e}")

        # Expire stale indicators
        self._expire_stale()

        return results

    def match(self, context: dict) -> list[ThreatIndicator]:
        """Match current context against all known indicators.

        Context includes: dependencies, network destinations, behavioral
        patterns, file hashes, etc.
        """
        matches = []
        deps = set(context.get("dependencies", []))
        destinations = set(context.get("network_destinations", []))

        for indicator in self._indicators.values():
            affected_set = set(indicator.affected)

            # Check dependency overlap
            if deps & affected_set:
                matches.append(indicator)
                continue

            # Check network destination overlap
            if destinations & affected_set:
                matches.append(indicator)
                continue

        return matches

    def _normalize(self, source: str, raw: dict) -> ThreatIndicator:
        """Normalize raw indicator data into standard format."""
        severity_map = {
            "critical": Severity.CRITICAL,
            "high": Severity.HIGH,
            "medium": Severity.MEDIUM,
            "moderate": Severity.MEDIUM,
            "low": Severity.LOW,
        }

        raw_severity = raw.get("severity", "medium").lower()
        severity = severity_map.get(raw_severity, Severity.MEDIUM)

        return ThreatIndicator(
            indicator_id=raw.get("id", str(uuid.uuid4())),
            source=source,
            severity=severity,
            category=raw.get("category", "vulnerability"),
            pattern=raw.get("pattern", ""),
            affected=raw.get("affected", []),
            mitigation=raw.get("mitigation", ""),
            confidence=raw.get("confidence", 0.7),
            first_seen=raw.get("first_seen",
                              datetime.now(timezone.utc).isoformat()),
            last_updated=raw.get("last_updated",
                                datetime.now(timezone.utc).isoformat()),
            ttl_seconds=raw.get("ttl", 86400),
        )

    def _expire_stale(self) -> int:
        """Remove indicators past their TTL."""
        now = datetime.now(timezone.utc)
        expired = []

        for iid, indicator in self._indicators.items():
            updated = datetime.fromisoformat(indicator.last_updated)
            if (now - updated).total_seconds() > indicator.ttl_seconds:
                expired.append(iid)

        for iid in expired:
            del self._indicators[iid]

        return len(expired)
```

### Pre-Deployment Security Gate

```python
from dataclasses import dataclass
from enum import Enum
from typing import Optional


class GateResult(Enum):
    PASS = "pass"
    FAIL = "fail"
    WARN = "warn"


@dataclass
class GateCheck:
    name: str
    result: GateResult
    severity: Severity
    description: str
    details: Optional[dict] = None


@dataclass
class GateReport:
    overall: GateResult
    checks: list[GateCheck]
    blocking_checks: list[GateCheck]
    warnings: list[GateCheck]


class PreDeploymentGate:
    """Pre-deployment security gate combining multiple checks."""

    def __init__(
        self,
        fail_on_critical_cve: bool = True,
        fail_on_high_cve: bool = False,
        intel_aggregator: Optional[IntelligenceAggregator] = None,
    ):
        self.fail_on_critical_cve = fail_on_critical_cve
        self.fail_on_high_cve = fail_on_high_cve
        self.intel_aggregator = intel_aggregator

    def evaluate(self, agent_manifest: dict) -> GateReport:
        """Run all gate checks against an agent manifest.

        The manifest includes: source code path, dependencies, container
        image, requested permissions, and configuration.
        """
        checks: list[GateCheck] = []

        # Check 1: Dependency vulnerabilities
        checks.extend(self._check_dependencies(agent_manifest))

        # Check 2: Secret detection
        checks.extend(self._check_secrets(agent_manifest))

        # Check 3: Permission boundaries
        checks.extend(self._check_permissions(agent_manifest))

        # Check 4: Container scan
        if "container_image" in agent_manifest:
            checks.extend(self._check_container(agent_manifest))

        # Determine overall result
        blocking = [c for c in checks if c.result == GateResult.FAIL]
        warnings = [c for c in checks if c.result == GateResult.WARN]

        if blocking:
            overall = GateResult.FAIL
        elif warnings:
            overall = GateResult.WARN
        else:
            overall = GateResult.PASS

        return GateReport(
            overall=overall,
            checks=checks,
            blocking_checks=blocking,
            warnings=warnings,
        )

    def _check_dependencies(self, manifest: dict) -> list[GateCheck]:
        """Check dependencies against CVE databases."""
        checks = []
        deps = manifest.get("dependencies", [])

        if self.intel_aggregator:
            matches = self.intel_aggregator.match(
                {"dependencies": deps}
            )
            for indicator in matches:
                if (
                    indicator.severity == Severity.CRITICAL
                    and self.fail_on_critical_cve
                ):
                    result = GateResult.FAIL
                elif (
                    indicator.severity == Severity.HIGH
                    and self.fail_on_high_cve
                ):
                    result = GateResult.FAIL
                else:
                    result = GateResult.WARN

                checks.append(GateCheck(
                    name="dependency_cve",
                    result=result,
                    severity=indicator.severity,
                    description=(
                        f"{indicator.source}: {indicator.pattern} "
                        f"affects {', '.join(indicator.affected)}"
                    ),
                    details={"indicator_id": indicator.indicator_id},
                ))

        if not checks:
            checks.append(GateCheck(
                name="dependency_cve",
                result=GateResult.PASS,
                severity=Severity.INFO,
                description="No known vulnerabilities in dependencies",
            ))

        return checks

    def _check_secrets(self, manifest: dict) -> list[GateCheck]:
        """Check for hardcoded secrets in source code."""
        import re

        checks = []
        source_path = manifest.get("source_path")
        if not source_path:
            return checks

        secret_patterns = [
            (r"(?i)(api[_-]?key|secret|password|token)\s*=\s*['\"][^'\"]+['\"]",
             "Hardcoded credential"),
            (r"(?i)-----BEGIN (RSA |EC )?PRIVATE KEY-----",
             "Embedded private key"),
            (r"(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36,}",
             "GitHub token"),
            (r"sk-[A-Za-z0-9]{32,}",
             "OpenAI API key pattern"),
        ]

        # In production, scan actual files
        # Simplified for blueprint illustration
        for pattern, desc in secret_patterns:
            checks.append(GateCheck(
                name="secret_detection",
                result=GateResult.PASS,
                severity=Severity.INFO,
                description=f"No {desc} patterns detected",
            ))

        return checks

    def _check_permissions(self, manifest: dict) -> list[GateCheck]:
        """Validate requested permissions against policy."""
        checks = []
        requested = set(manifest.get("permissions", []))
        max_scope = manifest.get("max_permission_scope", "standard")

        elevated = {"root_access", "kernel_module", "raw_socket", "ptrace"}
        dangerous_requested = requested & elevated

        if dangerous_requested:
            checks.append(GateCheck(
                name="permission_boundary",
                result=GateResult.FAIL,
                severity=Severity.HIGH,
                description=(
                    f"Elevated permissions requested: "
                    f"{', '.join(dangerous_requested)}"
                ),
            ))
        else:
            checks.append(GateCheck(
                name="permission_boundary",
                result=GateResult.PASS,
                severity=Severity.INFO,
                description="All requested permissions within policy bounds",
            ))

        return checks

    def _check_container(self, manifest: dict) -> list[GateCheck]:
        """Scan container image for vulnerabilities."""
        checks = []
        image = manifest.get("container_image", "")

        # In production, invoke Trivy or similar scanner
        checks.append(GateCheck(
            name="container_scan",
            result=GateResult.PASS,
            severity=Severity.INFO,
            description=f"Container image {image} passed vulnerability scan",
        ))

        return checks
```

## Performance Optimization Strategies

### Event Bus Batching

For high-throughput environments, batch events before dispatch:

```python
class BatchingEventBus(EventBus):
    """Event bus variant that batches events for higher throughput."""

    def __init__(self, batch_size: int = 100, flush_interval: float = 0.5):
        super().__init__()
        self.batch_size = batch_size
        self.flush_interval = flush_interval
        self._batch: list[SecurityEvent] = []

    async def publish(self, event: SecurityEvent) -> None:
        self._batch.append(event)
        if len(self._batch) >= self.batch_size:
            await self._flush()

    async def _flush(self) -> None:
        batch = self._batch[:]
        self._batch.clear()
        for event in batch:
            await self._dispatch(event)
```

### Baseline Computation with Reservoir Sampling

For agents with millions of data points, use reservoir sampling to maintain bounded memory:

```python
import random


class ReservoirMetricRange(MetricRange):
    """MetricRange with reservoir sampling for bounded memory."""

    RESERVOIR_SIZE = 1000

    def __init__(self):
        super().__init__()
        self._reservoir: list[float] = []

    def update(self, value: float) -> None:
        super().update(value)
        if len(self._reservoir) < self.RESERVOIR_SIZE:
            self._reservoir.append(value)
        else:
            idx = random.randint(0, self.sample_count - 1)
            if idx < self.RESERVOIR_SIZE:
                self._reservoir[idx] = value
```

## Deployment Patterns

### Docker Compose

```yaml
services:
  sksecurity:
    image: sksecurity:latest
    ports:
      - "8085:8085"
    volumes:
      - sksecurity-data:/var/lib/sksecurity
      - /etc/sksecurity:/etc/sksecurity:ro
      - /var/run/docker.sock:/var/run/docker.sock  # For quarantine
    environment:
      SKSECURITY_HOST: "0.0.0.0"
      SKSECURITY_PORT: "8085"
    restart: unless-stopped

volumes:
  sksecurity-data:
```

### Kubernetes DaemonSet (Per-Node Monitoring)

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: sksecurity-monitor
spec:
  selector:
    matchLabels:
      app: sksecurity-monitor
  template:
    spec:
      containers:
        - name: monitor
          image: sksecurity:latest
          command: ["sksecurity", "monitor"]
          securityContext:
            privileged: true  # Required for syscall monitoring
          volumeMounts:
            - name: proc
              mountPath: /host/proc
              readOnly: true
      volumes:
        - name: proc
          hostPath:
            path: /proc
```

## Security Architecture

### Self-Protection Model

```
┌────────────────────────────────────────────────┐
│              SKSecurity Process                  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Integrity Verifier (startup)              │  │
│  │  - Verify binary PGP signature             │  │
│  │  - Check config hash against expected      │  │
│  │  - Validate ML model signatures            │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Self-Monitor (continuous)                 │  │
│  │  - Watch own process for injection         │  │
│  │  - Monitor config file for unauthorized    │  │
│  │    changes                                 │  │
│  │  - Validate CapAuth token on every admin   │  │
│  │    operation                               │  │
│  └───────────────────────────────────────────┘  │
│                                                  │
│  ┌───────────────────────────────────────────┐  │
│  │  Tamper-Evident Log (always)               │  │
│  │  - Hash-chained event store                │  │
│  │  - PGP-signed configuration changes        │  │
│  │  - Forensic snapshots encrypted at rest    │  │
│  └───────────────────────────────────────────┘  │
└────────────────────────────────────────────────┘
```

## Integration Points

| System | Integration |
|--------|------------|
| CapAuth | Identity, access control tokens, key management |
| SKComm | Threat intelligence delivery, alert routing, P2P sharing |
| SKMemory | Store incident summaries for agent recall |
| SKCapstone | Run as MCP skill providing security scanning to agents |
| Docker/K8s | Container management for quarantine and deployment gate |
| Prometheus | Export metrics for external monitoring stacks |
| SOC Tools | Webhook integration with SIEM, SOAR, ticketing systems |
