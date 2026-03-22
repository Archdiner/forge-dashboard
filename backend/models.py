from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
from enum import Enum


class ExperimentStatus(str, Enum):
    CLAIMED = "claimed"
    RUNNING = "running"
    SUCCESS = "success"
    FAILURE = "failure"
    REVERTED = "reverted"


class AgentStatus(str, Enum):
    IDLE = "idle"
    THINKING = "thinking"
    RUNNING = "running"
    PUBLISHING = "publishing"


class ExperimentClaim(BaseModel):
    agent_id: str
    agent_name: str
    hypothesis: str
    mutation: str
    template_id: str = "landing-page-cro"


class ExperimentPublish(BaseModel):
    experiment_id: str
    agent_id: str
    template_id: str
    metric_before: float
    metric_after: float
    status: ExperimentStatus
    reasoning: str


class Experiment(BaseModel):
    id: str
    agent_id: str
    agent_name: str
    template_id: str
    hypothesis: str
    mutation: str
    metric_before: float
    metric_after: float
    status: ExperimentStatus
    reasoning: str
    created_at: datetime
    completed_at: Optional[datetime] = None


class Agent(BaseModel):
    id: str
    name: str
    status: AgentStatus
    experiments_run: int = 0
    improvements_found: int = 0
    current_hypothesis: Optional[str] = None
    last_active: datetime


class GlobalBest(BaseModel):
    template_id: str
    metric: float
    config: dict
    experiment_count: int
    last_updated: datetime


class HypothesisRequest(BaseModel):
    agent_id: str
    agent_name: str
    template_id: str


class ProjectStatus(str, Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"


class Project(BaseModel):
    id: str
    name: str
    template_id: str
    description: str = ""
    status: ProjectStatus = ProjectStatus.ACTIVE
    config: dict = {}
    created_at: datetime
    updated_at: datetime


# ── PostHog models ──────────────────────────────────────────────────────────

class PostHogMetricDefinition(BaseModel):
    """Serializable form of connectors.posthog.MetricDefinition."""
    type: str                               # "rate" | "count" | "hogsql"
    display_name: str = ""
    numerator_event: Optional[str] = None  # for "rate"
    denominator_event: Optional[str] = None
    event: Optional[str] = None            # for "count"
    hogsql_query: Optional[str] = None     # for "hogsql"


class PostHogConfig(BaseModel):
    """PostHog connection settings stored per project."""
    personal_api_key: str
    project_id: int
    base_url: str = "https://app.posthog.com"
    metric: Optional[PostHogMetricDefinition] = None
    cycle_window_hours: int = 24


# ── Experiment mode ─────────────────────────────────────────────────────────

class ExperimentMode(str, Enum):
    SIMULATION = "simulation"   # deterministic evaluators (existing behaviour)
    BACKTEST   = "backtest"     # PostHog historical windows (demo)
    LIVE       = "live"         # real deployment + PostHog measurement


# ── Cycle (ratchet) models ──────────────────────────────────────────────────

class CycleInfo(BaseModel):
    """API response shape for an active or completed cycle."""
    project_id: str
    cycle_id: str
    state: str
    variant_text: str
    hypothesis: str
    baseline_metric: float
    measured_metric: Optional[float] = None
    decision: Optional[str] = None
    cycle_window_hours: int
    created_at: str
    deployed_at: Optional[str] = None
    measurement_ends_at: Optional[str] = None
    evaluated_at: Optional[str] = None
    seconds_remaining: Optional[float] = None
