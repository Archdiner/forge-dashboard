from pydantic import BaseModel
from typing import Optional
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
