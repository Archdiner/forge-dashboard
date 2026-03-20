"""
FORGE Evaluator Registry System
=================================

A hybrid system that supports:
- Tier 1: Pre-built templates (fast, reliable)
- Tier 2: Guided config (flexible)  
- Tier 3: Dynamic generation (power users)

Input formats supported:
- Text (landing pages, emails, ads)
- Structured Data (JSON, YAML, configs)
- Spreadsheets (Excel, Google Sheets)
- PDFs (financial models, reports)
- Code (Python, SQL, scripts)
- URLs/DOM (webpages)
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable
from enum import Enum
import json
import re


class InputFormat(Enum):
    TEXT = "text"
    STRUCTURED = "structured"  # JSON, YAML
    SPREADSHEET = "spreadsheet"  # Excel, Sheets
    PDF = "pdf"
    CODE = "code"
    URL = "url"
    DOM = "dom"


class EvaluatorCategory(Enum):
    TEXT_QUALITY = "text_quality"
    FINANCIAL = "financial"
    ACCURACY = "accuracy"
    BUSINESS = "business"
    CODE_QUALITY = "code_quality"
    CONVERSION = "conversion"


@dataclass
class MetricDefinition:
    name: str
    description: str
    direction: str  # "higher_is_better" or "lower_is_better"
    weight: float = 1.0
    compute_fn: Optional[Callable] = None


@dataclass
class GuardrailDefinition:
    name: str
    threshold: float
    direction: str  # "above" or "below"
    fail_message: str


@dataclass
class MutationStrategy:
    name: str
    description: str
    apply_fn: Callable[[Dict, Any], Dict]


@dataclass  
class EvaluatorSpec:
    """Specification for an evaluator - can be pre-built or dynamically generated."""
    id: str
    name: str
    category: EvaluatorCategory
    input_format: InputFormat
    
    # What fields can be mutated
    editable_fields: List[str]
    
    # How to mutate each field
    mutation_strategies: Dict[str, List[MutationStrategy]]
    
    # Metrics to compute
    metrics: List[MetricDefinition]
    primary_metric: str
    
    # Guardrails
    guardrails: List[GuardrailDefinition]
    
    # Constraints (what CAN'T change)
    constraints: Dict[str, Any] = field(default_factory=dict)
    
    # Source: "template", "guided", or "dynamic"
    source: str = "template"
    
    # For dynamic: prompt used to generate this spec
    generation_prompt: Optional[str] = None


class EvaluatorRegistry:
    """
    The core registry that manages all evaluators.
    This is what makes FORGE dynamic - any evaluator can be registered
    and then used by the optimization loop.
    """
    
    _instance = None
    _evaluators: Dict[str, EvaluatorSpec] = {}
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._load_builtin_evaluators()
        return cls._instance
    
    def _load_builtin_evaluators(self):
        """Load pre-built template evaluators."""
        
        # ═══════════════════════════════════════════════════════════════
        # TIER 1: PRE-BUILT TEMPLATES
        # ═══════════════════════════════════════════════════════════════
        
        # ─────────────────────────────────────────────────────────────────
        # LANDING PAGE CRO - Text Quality Evaluator
        # ─────────────────────────────────────────────────────────────────
        self.register(EvaluatorSpec(
            id="landing-page-cro",
            name="Landing Page CRO",
            category=EvaluatorCategory.TEXT_QUALITY,
            input_format=InputFormat.TEXT,
            editable_fields=["headline", "subheadline", "cta_text", "value_props", "social_proof"],
            mutation_strategies={
                "headline": [
                    MutationStrategy("questionify", "Convert to question", self._mutate_question),
                    MutationStrategy("shorten", "Make shorter", self._mutate_shorten),
                    MutationStrategy("specificize", "Add specific numbers", self._mutate_specific),
                    MutationStrategy("urgency", "Add urgency", self._mutate_urgency),
                ],
                "cta_text": [
                    MutationStrategy("shorten", "Make shorter", self._mutate_shorten_cta),
                    MutationStrategy("action", "Add action verb", self._mutate_action_cta),
                ]
            },
            metrics=[
                MetricDefinition("readability", "Flesch Reading Ease", "higher_is_better", 0.20),
                MetricDefinition("brevity", "Word count efficiency", "higher_is_better", 0.15),
                MetricDefinition("persuasion", "Power word density", "higher_is_better", 0.20),
                MetricDefinition("specificity", "Numeric/specific content", "higher_is_better", 0.15),
                MetricDefinition("cta_clarity", "CTA clarity score", "higher_is_better", 0.30),
            ],
            primary_metric="composite",
            guardrails=[
                GuardrailDefinition("readability", 30, "above", "Text too complex"),
                GuardrailDefinition("word_count", 500, "below", "Too long"),
            ],
            source="template"
        ))
        
        # ─────────────────────────────────────────────────────────────────
        # EMAIL OUTREACH - Text Quality Evaluator  
        # ─────────────────────────────────────────────────────────────────
        self.register(EvaluatorSpec(
            id="email-outreach",
            name="Email Outreach",
            category=EvaluatorCategory.TEXT_QUALITY,
            input_format=InputFormat.TEXT,
            editable_fields=["subject_line", "body", "cta"],
            mutation_strategies={
                "subject_line": [
                    MutationStrategy("personalize", "Add personalization", self._mutate_personalize),
                    MutationStrategy("question", "Make a question", self._mutate_question),
                    MutationStrategy("shorten", "Make shorter", self._mutate_shorten),
                ],
                "body": [
                    MutationStrategy("shorten", "Make shorter", self._mutate_shorten),
                    MutationStrategy("question", "Add question", self._mutate_add_question),
                ]
            },
            metrics=[
                MetricDefinition("spam_score", "Spam word avoidance", "lower_is_better", 0.25),
                MetricDefinition("brevity", "Optimal length (50-150 words)", "higher_is_better", 0.25),
                MetricDefinition("personalization", "Personalization tokens", "higher_is_better", 0.25),
                MetricDefinition("cta_clarity", "Clear call to action", "higher_is_better", 0.25),
            ],
            primary_metric="composite",
            guardrails=[
                GuardrailDefinition("spam_words", 3, "below", "Too spammy"),
                GuardrailDefinition("word_count", 150, "below", "Too long"),
            ],
            source="template"
        ))
        
        # ─────────────────────────────────────────────────────────────────
        # PORTFOLIO ALLOCATION - Financial Evaluator
        # ─────────────────────────────────────────────────────────────────
        self.register(EvaluatorSpec(
            id="portfolio-optimization",
            name="Portfolio Allocation",
            category=EvaluatorCategory.FINANCIAL,
            input_format=InputFormat.STRUCTURED,
            editable_fields=["weights"],
            mutation_strategies={
                "weights": [
                    MutationStrategy("nudge", "Adjust by 5%", self._mutate_nudge_weight),
                    MutationStrategy("rebalance", "Rebalance to target", self._mutate_rebalance),
                ]
            },
            metrics=[
                MetricDefinition("sharpe_ratio", "Risk-adjusted return", "higher_is_better", 1.0),
                MetricDefinition("expected_return", "Annualized return", "higher_is_better", 0.0),
                MetricDefinition("volatility", "Annualized volatility", "lower_is_better", 0.0),
            ],
            primary_metric="sharpe_ratio",
            guardrails=[
                GuardrailDefinition("max_position", 0.25, "below", "Position too large"),
                GuardrailDefinition("weights_sum", 1.0, "equal", "Weights must sum to 1"),
                GuardrailDefinition("min_trades", 10, "above", "Insufficient diversification"),
            ],
            constraints={
                "min_cash": 0.02,
                "max_single_position": 0.25,
            },
            source="template"
        ))
        
        # ─────────────────────────────────────────────────────────────────
        # DCF MODEL - Financial Evaluator
        # Backed by templates/dcf.py with real IRR computation
        # ─────────────────────────────────────────────────────────────────
        self.register(EvaluatorSpec(
            id="dcf-model",
            name="DCF / Financial Model Optimization",
            category=EvaluatorCategory.FINANCIAL,
            input_format=InputFormat.STRUCTURED,
            editable_fields=["revenue_growth_y1", "revenue_growth_y2", "revenue_growth_y3",
                             "ebitda_margin", "wacc", "exit_ev_ebitda", "entry_ev_ebitda",
                             "terminal_growth", "capex_pct_revenue", "tax_rate"],
            mutation_strategies={
                "assumptions": [
                    MutationStrategy("adjust_growth", "Adjust revenue growth rate", self._mutate_sensitivity),
                    MutationStrategy("adjust_margin", "Adjust EBITDA margin", self._mutate_optimize),
                    MutationStrategy("adjust_multiple", "Adjust EV/EBITDA multiple", self._mutate_nudge_weight),
                    MutationStrategy("adjust_wacc", "Adjust discount rate", self._mutate_sensitivity),
                ],
            },
            metrics=[
                MetricDefinition("irr", "Internal Rate of Return", "higher_is_better", 1.0),
                MetricDefinition("moic", "Multiple on Invested Capital", "higher_is_better", 0.5),
                MetricDefinition("npv", "Net Present Value at WACC", "higher_is_better", 0.3),
            ],
            primary_metric="irr",
            guardrails=[
                GuardrailDefinition("irr", 0.0, "above", "IRR must be positive"),
                GuardrailDefinition("wacc_vs_tgr", 0.01, "above", "WACC must exceed terminal growth by >1pp"),
                GuardrailDefinition("entry_multiple", 25.0, "below", "Entry multiple too high to be realistic"),
            ],
            constraints={
                "max_growth_rate": 1.0,
                "min_wacc": 0.06,
                "max_ebitda_margin": 0.60,
            },
            source="template"
        ))
        
        # ─────────────────────────────────────────────────────────────────
        # PDF DOCUMENT - Financial/Legal Evaluator
        # ─────────────────────────────────────────────────────────────────
        self.register(EvaluatorSpec(
            id="pdf-document",
            name="PDF Document Optimization",
            category=EvaluatorCategory.TEXT_QUALITY,
            input_format=InputFormat.PDF,
            editable_fields=["headings", "content", "structure", "formatting"],
            mutation_strategies={
                "headings": [
                    MutationStrategy("clarify", "Make headings clearer", self._mutate_clarify_heading),
                    MutationStrategy("structure", "Restructure hierarchy", self._mutate_restructure),
                ],
                "content": [
                    MutationStrategy("simplify", "Simplify language", self._mutate_simplify),
                    MutationStrategy("shorten", "Remove redundant content", self._mutate_shorten),
                    MutationStrategy("format", "Improve formatting", self._mutate_format),
                ]
            },
            metrics=[
                MetricDefinition("readability", "Document readability score", "higher_is_better", 0.30),
                MetricDefinition("clarity", "Clarity and comprehension", "higher_is_better", 0.30),
                MetricDefinition("structure", "Document structure score", "higher_is_better", 0.20),
                MetricDefinition("length", "Optimal length ratio", "higher_is_better", 0.20),
            ],
            primary_metric="composite",
            guardrails=[
                GuardrailDefinition("readability", 40, "above", "Too complex"),
                GuardrailDefinition("length", 10000, "below", "Too long"),
            ],
            source="template"
        ))
        
        # ─────────────────────────────────────────────────────────────────
        # PROMPT OPTIMIZATION - Accuracy Evaluator
        # ─────────────────────────────────────────────────────────────────
        self.register(EvaluatorSpec(
            id="prompt-optimization",
            name="Prompt Optimization",
            category=EvaluatorCategory.ACCURACY,
            input_format=InputFormat.TEXT,
            editable_fields=["system_prompt", "few_shot_examples", "format_instructions"],
            mutation_strategies={
                "system_prompt": [
                    MutationStrategy("simplify", "Make simpler", self._mutate_shorten),
                    MutationStrategy("add_context", "Add more context", self._mutate_add_context),
                    MutationStrategy("add_examples", "Add examples", self._mutate_add_examples),
                ]
            },
            metrics=[
                MetricDefinition("accuracy", "Classification accuracy", "higher_is_better", 1.0),
                MetricDefinition("consistency", "Response consistency", "higher_is_better", 0.0),
            ],
            primary_metric="accuracy",
            guardrails=[
                GuardrailDefinition("accuracy", 0.5, "above", "Below baseline"),
            ],
            source="template"
        ))
        
        print(f"✓ Loaded {len(self._evaluators)} pre-built evaluators")
    
    def register(self, spec: EvaluatorSpec):
        """Register a new evaluator."""
        self._evaluators[spec.id] = spec
    
    def get(self, evaluator_id: str) -> Optional[EvaluatorSpec]:
        """Get an evaluator by ID."""
        return self._evaluators.get(evaluator_id)
    
    def list_evaluators(self, category: Optional[EvaluatorCategory] = None) -> List[EvaluatorSpec]:
        """List all evaluators, optionally filtered by category."""
        evaluators = list(self._evaluators.values())
        if category:
            evaluators = [e for e in evaluators if e.category == category]
        return evaluators
    
    def classify_input(self, description: str, sample_data: Any = None) -> Dict[str, Any]:
        """
        TIER 3: Dynamic Generation
        
        Analyze user description and optionally sample data to determine
        which evaluator to use or generate a new one.
        
        This is where the LLM would analyze:
        - What they're trying to optimize
        - What input format they have
        - What metrics matter to them
        
        Returns recommended evaluator config.
        """
        # For now, simple keyword-based classification
        # In production, this would use an LLM
        
        description_lower = description.lower()

        # DCF / financial model — check before generic "portfolio"
        if any(k in description_lower for k in [
            "dcf", "discounted cash flow", "irr", "internal rate of return",
            "npv", "net present value", "stock pitch", "lbo", "valuation model",
            "financial model", "ebitda", "wacc", "exit multiple",
        ]):
            return {"evaluator_id": "dcf-model", "confidence": 0.92}

        # Portfolio / trading
        if any(k in description_lower for k in ["portfolio", "trading", "sharpe", "returns", "allocation", "investment"]):
            if sample_data and isinstance(sample_data, dict):
                if "weights" in sample_data or "allocation" in str(sample_data):
                    return {"evaluator_id": "portfolio-optimization", "confidence": 0.9}
            return {"evaluator_id": "portfolio-optimization", "confidence": 0.8}

        # Landing page / conversion
        if any(k in description_lower for k in ["landing page", "conversion", "cta", "headline", "cro"]):
            return {"evaluator_id": "landing-page-cro", "confidence": 0.9}

        # Email
        if any(k in description_lower for k in ["email", "outreach", "cold email", "reply rate"]):
            return {"evaluator_id": "email-outreach", "confidence": 0.9}

        # Prompt / LLM
        if any(k in description_lower for k in ["prompt", "llm", "classification", "accuracy"]):
            return {"evaluator_id": "prompt-optimization", "confidence": 0.9}

        # Excel / spreadsheet (generic)
        if any(k in description_lower for k in ["excel", "spreadsheet", "model", "forecast", "budget"]):
            return {"evaluator_id": "dcf-model", "confidence": 0.75}

        # Default
        return {"evaluator_id": "landing-page-cro", "confidence": 0.5}
    
    # ═══════════════════════════════════════════════════════════════════
    # MUTATION FUNCTIONS
    # ═══════════════════════════════════════════════════════════════════
    
    def _mutate_question(self, config: Dict, field: str) -> Dict:
        """Convert text to question format."""
        new_config = config.copy()
        if field in new_config:
            text = new_config[field]
            if not text.endswith('?'):
                new_config[field] = f"Want to {text.lower().rstrip('.')}?"
        return new_config
    
    def _mutate_shorten(self, config: Dict, field: str) -> Dict:
        """Shorten text."""
        new_config = config.copy()
        if field in new_config:
            words = new_config[field].split()
            if len(words) > 5:
                new_config[field] = ' '.join(words[:5]) + "?"
        return new_config
    
    def _mutate_specific(self, config: Dict, field: str) -> Dict:
        """Add specific numbers."""
        new_config = config.copy()
        if field in new_config:
            if not any(c.isdigit() for c in new_config[field]):
                new_config[field] = new_config[field].replace(" ", " 10x ", 1)
        return new_config
    
    def _mutate_urgency(self, config: Dict, field: str) -> Dict:
        """Add urgency words."""
        new_config = config.copy()
        if field in new_config:
            urgency_words = ["now", "today", "limited", "tonight"]
            for word in urgency_words:
                if word not in new_config[field].lower():
                    new_config[field] = f"{new_config[field]} {word}"
                    break
        return new_config
    
    def _mutate_shorten_cta(self, config: Dict, field: str) -> Dict:
        new_config = config.copy()
        if field in new_config:
            words = new_config[field].split()
            if len(words) > 3:
                new_config[field] = " ".join(words[:2])
        return new_config
    
    def _mutate_action_cta(self, config: Dict, field: str) -> Dict:
        new_config = config.copy()
        if field in new_config:
            action_verbs = ["Start", "Get", "Try", "Build"]
            current = new_config[field].split()[0] if new_config[field] else ""
            if current not in action_verbs:
                new_config[field] = "Start " + new_config[field].lower().lstrip("start ")
        return new_config
    
    def _mutate_personalize(self, config: Dict, field: str) -> Dict:
        new_config = config.copy()
        if field in new_config and "{{" not in new_config[field]:
            new_config[field] = "{{first_name}}, " + new_config[field]
        return new_config
    
    def _mutate_add_question(self, config: Dict, field: str) -> Dict:
        new_config = config.copy()
        if field in new_config:
            if "?" not in new_config[field]:
                new_config[field] = new_config[field].rstrip('.') + "?"
        return new_config
    
    def _mutate_nudge_weight(self, config: Dict, field: str) -> Dict:
        """Nudge weight by 5%."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], dict):
            weights = new_config[field].copy()
            for k in weights:
                weights[k] = min(1.0, max(0.0, weights[k] + 0.05))
            # Normalize
            total = sum(weights.values())
            if total > 0:
                weights = {k: v/total for k, v in weights.items()}
            new_config[field] = weights
        return new_config
    
    def _mutate_rebalance(self, config: Dict, field: str) -> Dict:
        """Rebalance weights to equal distribution."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], dict):
            weights = new_config[field]
            count = len(weights)
            if count > 0:
                new_config[field] = {k: 1.0/count for k in weights}
        return new_config
    
    def _mutate_optimize(self, config: Dict, field: str) -> Dict:
        """Optimize a value to maximize output."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], dict):
            assumptions = new_config[field]
            for k in assumptions:
                if isinstance(assumptions[k], (int, float)):
                    assumptions[k] = assumptions[k] * 1.1
            new_config[field] = assumptions
        return new_config
    
    def _mutate_add_scenario(self, config: Dict, field: str) -> Dict:
        """Add a scenario (best/worst case)."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], dict):
            scenarios = new_config[field]
            scenario_type = "worst" if "worst" not in str(scenarios).lower() else "best"
            scenarios[f"scenario_{scenario_type}"] = scenarios.get("base", 0) * 0.8
            new_config[field] = scenarios
        return new_config
    
    def _mutate_sensitivity(self, config: Dict, field: str) -> Dict:
        """Adjust spreadsheet assumption by ±10%."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], dict):
            assumptions = new_config[field]
            for k in assumptions:
                if isinstance(assumptions[k], (int, float)):
                    assumptions[k] = assumptions[k] * 0.9
            new_config[field] = assumptions
        return new_config
    
    def _mutate_range(self, config: Dict, field: str) -> Dict:
        """Test range of values for sensitivity analysis."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], dict):
            assumptions = new_config[field]
            range_values = {}
            for k, v in assumptions.items():
                if isinstance(v, (int, float)):
                    range_values[f"{k}_min"] = v * 0.8
                    range_values[f"{k}_max"] = v * 1.2
                else:
                    range_values[k] = v
            new_config[field] = range_values
        return new_config
    
    def _mutate_clarify_heading(self, config: Dict, field: str) -> Dict:
        """Make headings clearer and more descriptive."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], list):
            headings = new_config[field]
            clarified = []
            for h in headings:
                if isinstance(h, str) and len(h) < 30:
                    h = h + " - Details"
                clarified.append(h)
            new_config[field] = clarified
        return new_config
    
    def _mutate_restructure(self, config: Dict, field: str) -> Dict:
        """Restructure document hierarchy."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], list):
            headings = new_config[field]
            restructured = [f"Section {i+1}: {h}" for i, h in enumerate(headings)]
            new_config[field] = restructured
        return new_config
    
    def _mutate_simplify(self, config: Dict, field: str) -> Dict:
        """Simplify content for better readability."""
        new_config = config.copy()
        if field in new_config:
            text = new_config[field]
            if isinstance(text, str):
                text = text.replace("utilize", "use")
                text = text.replace("implement", "do")
                text = text.replace("accordingly", "as needed")
                new_config[field] = text
        return new_config
    
    def _mutate_format(self, config: Dict, field: str) -> Dict:
        """Improve formatting of content."""
        new_config = config.copy()
        if field in new_config and isinstance(new_config[field], str):
            text = new_config[field]
            if len(text) > 100:
                paragraphs = text.split('\n\n')
                if len(paragraphs) > 1:
                    new_config[field] = text
                else:
                    new_config[field] = '\n\n'.join([p.strip() for p in paragraphs if p.strip()])
        return new_config
    
    def _mutate_add_context(self, config: Dict, field: str) -> Dict:
        """Add context to prompt."""
        new_config = config.copy()
        if field in new_config:
            new_config[field] = "Given the following task: " + new_config[field]
        return new_config
    
    def _mutate_add_examples(self, config: Dict, field: str) -> Dict:
        """Add examples to prompt."""
        new_config = config.copy()
        if field in new_config:
            new_config[field] = new_config[field] + "\n\nExample: ..."
        return new_config


# Global registry instance
registry = EvaluatorRegistry()


# Decorator for easy registration
def register_evaluator(evaluator_id: str, category: EvaluatorCategory, input_format: InputFormat):
    """Decorator to register a new evaluator."""
    def decorator(cls):
        spec = EvaluatorSpec(
            id=evaluator_id,
            name=cls.__name__,
            category=category,
            input_format=input_format,
            editable_fields=cls.editable_fields,
            mutation_strategies=cls.mutation_strategies,
            metrics=cls.metrics,
            primary_metric=cls.primary_metric,
            guardrails=cls.guardrails,
            source="dynamic"
        )
        registry.register(spec)
        return cls
    return decorator


# Helper function for frontend/API
def get_evaluator_spec(evaluator_id: str) -> Optional[EvaluatorSpec]:
    """Get evaluator specification by ID."""
    return registry.get(evaluator_id)


def list_all_evaluators() -> List[EvaluatorSpec]:
    """List all available evaluators."""
    return registry.list_evaluators()


def recommend_evaluator(description: str, sample_data: Any = None) -> Dict[str, Any]:
    """Get evaluator recommendation based on user description."""
    return registry.classify_input(description, sample_data)
