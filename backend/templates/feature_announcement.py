"""
Feature Announcement Template
==============================
Optimises how new features are surfaced to users to maximise adoption.
Metric: feature adoption rate (% of users who interact with announced feature).

PostHog production loop:
  flag payload  → controls banner position, badge, tooltip, auto-show timing
  conversion    → posthog.capture('feature_used') / posthog.capture('feature_announcement_seen')
"""

import json
import copy
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


DEFAULT_CONFIG = {
    "feature_position":  "sidebar",
    "default_view":      "expanded",
    "show_badge":        True,
    "badge_text":        "New",
    "show_tooltip":      True,
    "tooltip_content":   "Check out this feature",
    "auto_show_delay":   5000,
    "dismissible":       True,
}


class FeatureAnnouncementTemplate(BaseTemplate):
    """Feature announcement optimisation — maximise feature adoption rate."""

    name             = "feature-announcement"
    description      = "Optimise how new features are surfaced to users to drive adoption"
    metric_name      = "adoption_rate"
    metric_direction = "higher_is_better"

    def __init__(self):
        self.default_config = copy.deepcopy(DEFAULT_CONFIG)

    # ── Hypothesis generation ──────────────────────────────────────────────────

    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        config_json  = json.dumps(current_best.config, indent=2)
        history_text = self.format_history(history)
        return f"""You are a feature adoption optimisation agent. Your goal is to increase the % of users who try a new feature.

CURRENT BEST CONFIG (adoption rate: {current_best.metric:.1%}):
{config_json}

RECENT EXPERIMENTS:
{history_text}

Respond with ONE hypothesis as JSON:
{{
  "hypothesis": "what change will increase feature adoption rate",
  "mutation": {{
    "type": "set_value|toggle_boolean",
    "field": "the config key to change",
    "value": "new value"
  }},
  "reasoning": "why this change drives more users to try the feature"
}}

EXAMPLES:
1. Change position to modal: {{"type":"set_value","field":"feature_position","value":"modal"}}
   → Modal demands attention; higher discovery rate
2. Shorter auto-show delay: {{"type":"set_value","field":"auto_show_delay","value":2000}}
   → Show sooner while user is still orienting
3. Better badge text: {{"type":"set_value","field":"badge_text","value":"Try it →"}}
   → Action-oriented badge drives clicks
4. Better tooltip: {{"type":"set_value","field":"tooltip_content","value":"Save 2 hours/week with this"}}
   → Specific value prop in tooltip increases curiosity

POSITIONS (ranked by visibility): modal > popover > inline > sidebar > toast

Respond with ONLY valid JSON."""

    def parse_hypothesis(self, response: str) -> Hypothesis:
        text = response.strip().strip("```json").strip("```").strip()
        try:
            data = json.loads(text)
            return Hypothesis(**data)
        except Exception:
            return Hypothesis(
                hypothesis="Move feature announcement to modal for higher visibility",
                mutation={"type": "set_value", "field": "feature_position", "value": "modal"},
                reasoning="Modal position demands immediate attention"
            )

    # ── Mutation application ───────────────────────────────────────────────────

    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        new = copy.deepcopy(config)
        if not isinstance(mutation, dict):
            return new

        mtype = mutation.get("type", "")
        field = mutation.get("field", "")
        value = mutation.get("value")

        if mtype == "set_value":
            new[field] = value
        elif mtype == "toggle_boolean" and field in new:
            new[field] = bool(value)

        return new

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Score announcement config on discovery/adoption principles (0-100 → adoption rate 8-28%)."""
        score = 0.0

        # Position visibility (25 pts) — intrusive positions drive more adoption
        position_pts = {"modal": 25, "popover": 20, "inline": 14, "sidebar": 8, "toast": 5}
        score += position_pts.get(asset.get("feature_position", "sidebar"), 5)

        # Default view expanded (15 pts) — user sees content without extra click
        if asset.get("default_view") == "expanded":
            score += 15

        # Badge present (12 pts) — visual signal draws the eye
        if asset.get("show_badge", False):
            score += 12

        # Badge has action language (8 pts) — "Try it →" beats "New"
        badge = asset.get("badge_text", "")
        action_words = {"try", "→", "use", "start", "open", "see", "get"}
        if badge and any(w in badge.lower() for w in action_words):
            score += 8

        # Tooltip present (10 pts)
        if asset.get("show_tooltip", False):
            score += 10

        # Tooltip has specific value prop (7 pts) — numbers, time savings, etc.
        import re
        tooltip = asset.get("tooltip_content", "")
        if tooltip and (re.search(r"\d+", tooltip) or any(w in tooltip.lower() for w in {"save", "faster", "less", "more", "hour", "minute"})):
            score += 7

        # Auto-show delay ≤ 3000ms — shows early while user is attentive (8 pts)
        delay = asset.get("auto_show_delay", 9999)
        if isinstance(delay, (int, float)):
            score += 8 if delay <= 3000 else (5 if delay <= 6000 else 0)

        # Dismissible — reduces annoyance, improves UX trust (5 pts)
        if asset.get("dismissible", False):
            score += 5

        # Map quality (0-100) → adoption rate (8% – 28%)
        adoption_rate = round(0.08 + (min(score, 100) / 100) * 0.20, 4)
        return EvaluationResult(
            metric=adoption_rate,
            reasoning=f"Discovery score {score:.0f}/100 → adoption rate {adoption_rate:.1%}"
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
        return 0.184  # ~18.4% adoption rate for default config

    def format_history(self, history: List[ExperimentHistory]) -> str:
        if not history:
            return "No previous experiments."
        rows = []
        for exp in history[:8]:
            s = "✓" if exp.status == "success" else "✗"
            rows.append(f"{s} {exp.hypothesis[:80]} → {exp.metric_before:.1%} → {exp.metric_after:.1%}")
        return "\n".join(rows)
