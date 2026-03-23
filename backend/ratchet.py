"""
Ratchet Engine — deployment lifecycle manager.

Maps to Karpathy's git commit/revert mechanism. Every experiment follows:
  1. Agent generates variant → ratchet stores it as pending_deployment
  2. User deploys variant to their site → clicks "Deployed" in dashboard
  3. Measurement timer starts (cycle_window_hours, default 24h)
  4. PostHog is queried after the window → metric compared to baseline
  5. If improved: "kept" → new baseline
     If not:     "reverted" → original baseline unchanged

For backtest mode, steps 2-3 are skipped and PostHog historical data is used.

State machine per project:
  pending_deployment → measuring → evaluated → (cleared for next cycle)
"""

import asyncio
import uuid
from datetime import datetime, timedelta
from typing import Optional
from dataclasses import dataclass, field
from enum import Enum


class CycleState(str, Enum):
    PENDING_DEPLOYMENT = "pending_deployment"  # waiting for user to deploy
    MEASURING          = "measuring"           # timer running, PostHog polling
    EVALUATED          = "evaluated"           # result recorded, ready for next


@dataclass
class Cycle:
    # Required fields first (no defaults)
    project_id: str
    cycle_id: str
    state: CycleState
    variant_text: str
    variant_config: dict
    hypothesis: str
    baseline_metric: float
    
    # Fields with defaults
    template_id: str = "structural"
    measured_metric: Optional[float] = None
    decision: Optional[str] = None
    
    # Feature flag tracking
    flag_name: Optional[str] = None   # PostHog flag key (e.g. "forge-proj123")
    flag_id: Optional[str] = None     # PostHog flag ID for updates/deletes
    control_payload: Optional[dict] = None
    variant_payload: Optional[dict] = None
    
    # Per-variant metrics (from PostHog)
    control_metric: Optional[float] = None
    variant_metric: Optional[float] = None
    sample_size: Optional[int] = None
    
    # User action tracking
    user_approved: Optional[bool] = None
    rollout_percentage: int = 50
    
    # Timing
    cycle_window_hours: int = 24
    created_at: datetime = field(default_factory=datetime.utcnow)
    deployed_at: Optional[datetime] = None
    measurement_ends_at: Optional[datetime] = None
    evaluated_at: Optional[datetime] = None

    @property
    def seconds_remaining(self) -> Optional[float]:
        if self.measurement_ends_at is None:
            return None
        remaining = (self.measurement_ends_at - datetime.utcnow()).total_seconds()
        return max(0.0, remaining)

    @property
    def measurement_complete(self) -> bool:
        if self.measurement_ends_at is None:
            return False
        return datetime.utcnow() >= self.measurement_ends_at

    def to_dict(self) -> dict:
        return {
            "project_id": self.project_id,
            "cycle_id": self.cycle_id,
            "state": self.state,
            "variant_text": self.variant_text,
            "variant_config": self.variant_config,
            "hypothesis": self.hypothesis,
            "template_id": self.template_id,
            "baseline_metric": self.baseline_metric,
            "measured_metric": self.measured_metric,
            "decision": self.decision,
            "cycle_window_hours": self.cycle_window_hours,
            # Feature flag fields
            "flag_name": self.flag_name,
            "flag_id": self.flag_id,
            "control_payload": self.control_payload,
            "variant_payload": self.variant_payload,
            "control_metric": self.control_metric,
            "variant_metric": self.variant_metric,
            "sample_size": self.sample_size,
            "user_approved": self.user_approved,
            "rollout_percentage": self.rollout_percentage,
            # Timing
            "created_at": self.created_at.isoformat(),
            "deployed_at": self.deployed_at.isoformat() if self.deployed_at else None,
            "measurement_ends_at": self.measurement_ends_at.isoformat() if self.measurement_ends_at else None,
            "evaluated_at": self.evaluated_at.isoformat() if self.evaluated_at else None,
            "seconds_remaining": self.seconds_remaining,
        }


class RatchetEngine:
    """Manages one active cycle per project and historical cycle log."""

    def __init__(self):
        # project_id -> active Cycle
        self._active: dict[str, Cycle] = {}
        # project_id -> asyncio.Event (set when user confirms deployment)
        self._deployment_events: dict[str, asyncio.Event] = {}
        # project_id -> list of completed Cycles (history)
        self._history: dict[str, list[Cycle]] = {}

    def start_cycle(
        self,
        project_id: str,
        variant_text: str,
        variant_config: dict,
        hypothesis: str,
        baseline_metric: float,
        cycle_window_hours: int = 24,
    ) -> Cycle:
        """Register a new variant as awaiting deployment.

        Called by the agent after generating a hypothesis and applying mutation.
        The dashboard shows the variant with a prominent "I've deployed this" button.
        """
        cycle = Cycle(
            project_id=project_id,
            cycle_id=f"cycle-{uuid.uuid4().hex[:8]}",
            state=CycleState.PENDING_DEPLOYMENT,
            variant_text=variant_text,
            variant_config=variant_config,
            hypothesis=hypothesis,
            baseline_metric=baseline_metric,
            cycle_window_hours=cycle_window_hours,
        )
        self._active[project_id] = cycle
        self._deployment_events[project_id] = asyncio.Event()
        return cycle

    def update_cycle_flag_info(
        self,
        project_id: str,
        flag_key: str,
        flag_id: str,
        control_payload: dict,
        variant_payload: dict,
    ) -> Optional[Cycle]:
        """Attach PostHog feature flag metadata to the active cycle."""
        cycle = self._active.get(project_id)
        if not cycle:
            return None
        cycle.flag_name = flag_key
        cycle.flag_id = flag_id
        cycle.control_payload = control_payload
        cycle.variant_payload = variant_payload
        return cycle

    def confirm_deployment(self, project_id: str) -> Optional[Cycle]:
        """User clicked "I've deployed this" → start measurement timer.

        Returns the updated cycle, or None if no pending cycle exists.
        """
        cycle = self._active.get(project_id)
        if not cycle or cycle.state != CycleState.PENDING_DEPLOYMENT:
            return None

        cycle.state = CycleState.MEASURING
        cycle.deployed_at = datetime.utcnow()
        cycle.measurement_ends_at = datetime.utcnow() + timedelta(hours=cycle.cycle_window_hours)

        # Signal the waiting agent
        event = self._deployment_events.get(project_id)
        if event:
            event.set()

        return cycle

    async def wait_for_deployment(
        self,
        project_id: str,
        timeout_hours: float = 72.0,
    ) -> bool:
        """Agent awaits user deployment confirmation.

        Returns True if confirmed, False if timed out.
        """
        event = self._deployment_events.get(project_id)
        if not event:
            return False
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout_hours * 3600)
            return True
        except asyncio.TimeoutError:
            return False

    def record_result(
        self,
        project_id: str,
        measured_metric: float,
        decision: str,
    ) -> Optional[Cycle]:
        """Record the PostHog measurement and keep/revert decision.

        decision: "kept" | "reverted"
        """
        cycle = self._active.get(project_id)
        if not cycle:
            return None

        cycle.state = CycleState.EVALUATED
        cycle.measured_metric = measured_metric
        cycle.decision = decision
        cycle.evaluated_at = datetime.utcnow()

        # Archive to history
        if project_id not in self._history:
            self._history[project_id] = []
        self._history[project_id].append(cycle)

        # Clear active
        self._active.pop(project_id, None)
        self._deployment_events.pop(project_id, None)

        return cycle

    def get_active_cycle(self, project_id: str) -> Optional[Cycle]:
        return self._active.get(project_id)

    def get_history(self, project_id: str) -> list[Cycle]:
        return list(self._history.get(project_id, []))

    def clear(self, project_id: str):
        """Cancel and clear the active cycle (e.g., when project is stopped)."""
        event = self._deployment_events.get(project_id)
        if event:
            event.set()  # unblock any waiting agent
        self._active.pop(project_id, None)
        self._deployment_events.pop(project_id, None)


# Global singleton — imported by main.py and forge_agent.py
ratchet = RatchetEngine()
