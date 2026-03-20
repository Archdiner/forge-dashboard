from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


class BaseForgeAgent(ABC):
    """Abstract base class for Forge agents."""
    
    @property
    @abstractmethod
    def agent_id(self) -> str:
        """Unique identifier for this agent."""
        pass
    
    @property
    @abstractmethod
    def agent_name(self) -> str:
        """Human-readable name for this agent."""
        pass
    
    @abstractmethod
    async def run_loop(self) -> None:
        """Run the main agent loop indefinitely."""
        pass
    
    @abstractmethod
    async def get_global_best(self, template_id: str) -> Optional[GlobalBestState]:
        """Get current global best state."""
        pass
    
    @abstractmethod
    async def get_history(self, template_id: str, limit: int = 20) -> List[ExperimentHistory]:
        """Get experiment history."""
        pass
    
    @abstractmethod
    async def claim_experiment(self, hypothesis: Hypothesis, template_id: str) -> Optional[str]:
        """Claim an experiment. Returns experiment_id if successful, None if dedup rejected."""
        pass
    
    @abstractmethod
    async def publish_result(
        self, 
        experiment_id: str, 
        metric_before: float,
        metric_after: float, 
        status: str, 
        reasoning: str,
        template_id: str
    ) -> bool:
        """Publish experiment result."""
        pass
    
    @abstractmethod
    async def update_status(self, status: str, hypothesis: Optional[str] = None) -> None:
        """Update agent status in the store."""
        pass
