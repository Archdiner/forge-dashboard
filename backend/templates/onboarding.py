"""
Onboarding Flow Template
========================
Optimises the structure and friction of user onboarding flows.
Metric: completion rate (% who finish all steps).

PostHog production loop:
  flag payload  → controls step order, field count, progress bar visibility
  conversion    → posthog.capture('onboarding_completed') / posthog.capture('onboarding_started')
"""

import json
import copy
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


DEFAULT_CONFIG = {
    "steps_order": ["welcome", "profile", "team", "first_action"],
    "step_fields": {
        "welcome":      ["email", "password"],
        "profile":      ["name", "role", "company_name"],
        "team":         ["team_size", "use_case"],
        "first_action": ["action_type", "action_detail"],
    },
    "show_progress_bar":   True,
    "show_skip_option":    False,
    "tooltip_enabled":     True,
    "helper_text_enabled": True,
    "required_fields_only": True,
}


class OnboardingTemplate(BaseTemplate):
    """Onboarding flow optimisation — minimise friction, maximise completion."""

    name             = "onboarding"
    description      = "Optimise onboarding steps and fields to maximise completion rate"
    metric_name      = "completion_rate"
    metric_direction = "higher_is_better"

    def __init__(self):
        self.default_config = copy.deepcopy(DEFAULT_CONFIG)

    # ── Hypothesis generation ──────────────────────────────────────────────────

    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        config_json  = json.dumps(current_best.config, indent=2)
        history_text = self.format_history(history)
        return f"""You are an onboarding optimisation agent. Your goal is to increase completion rate.

CURRENT BEST CONFIG (completion rate: {current_best.metric:.1%}):
{config_json}

RECENT EXPERIMENTS:
{history_text}

Respond with ONE hypothesis as JSON:
{{
  "hypothesis": "what change you think will increase completion rate",
  "mutation": {{
    "type": "reorder_steps|remove_field|toggle_boolean|set_value",
    "field": "the config key to change",
    "value": "new value",
    "from_index": 0,
    "to_index": 1
  }},
  "reasoning": "why this reduces friction or increases motivation"
}}

EXAMPLES:
1. Move 'team' step later: {{"type":"reorder_steps","field":"steps_order","from_index":2,"to_index":3}}
2. Remove optional field: {{"type":"remove_field","step":"profile","field":"company_name"}}
3. Show skip option: {{"type":"toggle_boolean","field":"show_skip_option","value":true}}
4. Show progress bar: {{"type":"toggle_boolean","field":"show_progress_bar","value":true}}

Respond with ONLY valid JSON."""

    def parse_hypothesis(self, response: str) -> Hypothesis:
        text = response.strip().strip("```json").strip("```").strip()
        try:
            data = json.loads(text)
            return Hypothesis(**data)
        except Exception:
            return Hypothesis(
                hypothesis="Reorder steps to reduce early friction",
                mutation={"type": "reorder_steps", "field": "steps_order", "from_index": 1, "to_index": 3},
                reasoning="Delaying friction-heavy steps increases early commitment"
            )

    # ── Mutation application ───────────────────────────────────────────────────

    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        new = copy.deepcopy(config)
        if not isinstance(mutation, dict):
            return new

        mtype = mutation.get("type", "")
        field = mutation.get("field", "")
        value = mutation.get("value")

        if mtype == "reorder_steps" and field == "steps_order":
            arr = new.get("steps_order", [])
            fi, ti = mutation.get("from_index", 0), mutation.get("to_index", len(arr) - 1)
            if 0 <= fi < len(arr) and 0 <= ti < len(arr):
                arr.insert(ti, arr.pop(fi))

        elif mtype == "remove_field":
            step  = mutation.get("step", "")
            fname = mutation.get("field", "")
            fields = new.get("step_fields", {}).get(step, [])
            if fname in fields and len(fields) > 1:
                fields.remove(fname)

        elif mtype == "toggle_boolean" and field in new:
            new[field] = bool(value)

        elif mtype == "set_value":
            new[field] = value

        return new

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Score onboarding config on friction-reduction principles (0-100 → completion rate 30-65%)."""
        score = 0.0

        # Step count (20 pts) — fewer steps = higher completion
        steps = asset.get("steps_order", [])
        step_pts = {1: 20, 2: 18, 3: 17, 4: 15, 5: 8, 6: 2}
        score += step_pts.get(len(steps), 0)

        # Progress bar — visual momentum (18 pts)
        if asset.get("show_progress_bar", False):
            score += 18

        # Required fields only — less decision fatigue (12 pts)
        if asset.get("required_fields_only", False):
            score += 12

        # No skip option — committed users more likely to finish (8 pts)
        if not asset.get("show_skip_option", True):
            score += 8

        # Tooltips — reduce confusion (7 pts)
        if asset.get("tooltip_enabled", False):
            score += 7

        # Helper text — reduce confusion (5 pts)
        if asset.get("helper_text_enabled", False):
            score += 5

        # First step is light (≤2 fields) — low barrier to start (10 pts)
        step_fields = asset.get("step_fields", {})
        if steps:
            first_step_fields = step_fields.get(steps[0], [])
            if len(first_step_fields) <= 2:
                score += 10

        # Average fields per step (5 pts) — fewer = less friction
        if step_fields:
            avg = sum(len(v) for v in step_fields.values()) / len(step_fields)
            score += 5 if avg <= 2 else (3 if avg <= 3 else 0)

        # Map quality (0-100) → completion rate (30% – 65%)
        completion_rate = round(0.30 + (min(score, 100) / 100) * 0.35, 4)
        return EvaluationResult(
            metric=completion_rate,
            reasoning=f"Friction score {score:.0f}/100 → completion rate {completion_rate:.1%}"
        )

    # ── Utilities ─────────────────────────────────────────────────────────────

    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        return ""

    def parse_evaluation(self, response: str) -> EvaluationResult:
        return EvaluationResult(metric=self.get_default_metric(), reasoning="PostHog")

    def parse_user_input(self, content: str) -> Dict[str, Any]:
        try:
            data = json.loads(content.strip())
            if isinstance(data, dict):
                return {**self.default_config, **data}
        except json.JSONDecodeError:
            pass
        return copy.deepcopy(self.default_config)

    def get_default_metric(self) -> float:
        return 0.495  # ~49.5% completion for default config

    def format_history(self, history: List[ExperimentHistory]) -> str:
        if not history:
            return "No previous experiments."
        rows = []
        for exp in history[:8]:
            s = "✓" if exp.status == "success" else "✗"
            rows.append(f"{s} {exp.hypothesis[:80]} → {exp.metric_before:.1%} → {exp.metric_after:.1%}")
        return "\n".join(rows)
