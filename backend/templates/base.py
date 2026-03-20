from abc import ABC, abstractmethod
from pydantic import BaseModel
from typing import Any, List, Dict, Optional, Union, TYPE_CHECKING


class Hypothesis(BaseModel):
    """Result of hypothesis generation."""
    hypothesis: str
    mutation: Union[str, Dict[str, Any]]
    reasoning: str


class EvaluationResult(BaseModel):
    """Result of evaluating a mutated asset."""
    metric: float
    reasoning: str


class GlobalBestState(BaseModel):
    """Current global best state."""
    template_id: str
    metric: float
    config: Dict[str, Any]
    experiment_count: int


class ExperimentHistory(BaseModel):
    """Past experiment for learning."""
    id: str
    hypothesis: str
    mutation: str
    metric_before: float
    metric_after: float
    status: str
    reasoning: str


class BaseTemplate(ABC):
    """Abstract base class for optimization templates."""
    
    name: str
    description: str
    metric_name: str
    metric_direction: str  # "higher_is_better" | "lower_is_better"
    default_config: Dict[str, Any]
    
    @abstractmethod
    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        """Generate the prompt for hypothesis creation."""
        pass
    
    @abstractmethod
    def parse_hypothesis(self, response: str) -> Hypothesis:
        """Parse LLM response into Hypothesis."""
        pass
    
    @abstractmethod
    def apply_mutation(self, config: Dict[str, Any], mutation: Union[str, Dict[str, Any]]) -> Dict[str, Any]:
        """Apply a mutation to the current config."""
        pass
    
    @abstractmethod
    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        """Generate prompt for evaluating a mutated asset."""
        pass
    
    @abstractmethod
    def parse_evaluation(self, response: str) -> EvaluationResult:
        """Parse LLM evaluation response. Legacy — prefer evaluate()."""
        pass

    @abstractmethod
    def evaluate(self, asset: Dict[str, Any], llm: Optional[Any] = None) -> EvaluationResult:
        """
        Evaluate the asset and return a metric.
        This is the primary evaluation path used by ForgeAgent.

        For deterministic templates (landing page, email, portfolio, DCF):
            Override with math/NLP computation. Ignore llm.
        For LLM-powered templates (prompt optimization):
            Use llm to run the prompt against a test set and compute accuracy.
            llm is a GeminiClient instance passed in by ForgeAgent.
        """
        pass

    def format_history(self, history: List[ExperimentHistory]) -> str:
        """Format experiment history for inclusion in prompts."""
        if not history:
            return "No previous experiments yet."
        
        formatted = []
        for exp in history[:10]:  # Limit to recent 10
            status_emoji = "✓" if exp.status == "success" else "✗"
            formatted.append(
                f"{status_emoji} Exp #{exp.id}: {exp.hypothesis}\n"
                f"   Result: {exp.metric_before:.1f} → {exp.metric_after:.1f}\n"
                f"   Reasoning: {exp.reasoning[:100]}..."
            )
        return "\n".join(formatted)

    def parse_user_input(self, content: str) -> Dict[str, Any]:
        """
        Parse user-provided content into config dict.
        Override this in each template to handle custom input formats.
        """
        return self.default_config.copy()

    def get_default_metric(self) -> float:
        """
        Return the default baseline metric for this template.
        Computed by evaluating default_config deterministically.
        For LLM-powered templates (prompt-opt) this returns a sensible constant.
        """
        try:
            result = self.evaluate(self.default_config, llm=None)
            if result.metric > 0:
                return result.metric
        except Exception:
            pass
        return 0.0

    def config_to_output(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """
        Convert optimized config back to user-friendly output format.
        Override this in each template to return the right format.
        """
        return {"config": config}
