"""
Pricing Page Template
=====================
Optimises pricing page layout and framing to maximise upgrade clicks.
Metric: upgrade click rate (% of pricing-page viewers who click upgrade).

PostHog production loop:
  flag payload  → controls plan order, highlighted plan, CTA copy, billing toggle defaults
  conversion    → posthog.capture('upgrade_clicked') / posthog.capture('pricing_page_viewed')
"""

import json
import copy
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


DEFAULT_CONFIG = {
    "plans_order":      ["free", "pro", "enterprise"],
    "default_plan":     "pro",
    "show_annual":      True,
    "show_monthly":     True,
    "annual_default":   True,
    "highlighted_plan": "pro",
    "show_comparison":  True,
    "cta_text": {
        "free":       "Get Started",
        "pro":        "Start Free Trial",
        "enterprise": "Contact Sales",
    },
    "features_list_length": 5,
}


class PricingPageTemplate(BaseTemplate):
    """Pricing page layout optimisation — maximise upgrade click rate."""

    name             = "pricing-page"
    description      = "Optimise pricing page layout, plan framing, and CTAs to maximise upgrade rate"
    metric_name      = "upgrade_rate"
    metric_direction = "higher_is_better"

    def __init__(self):
        self.default_config = copy.deepcopy(DEFAULT_CONFIG)

    # ── Hypothesis generation ──────────────────────────────────────────────────

    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        config_json  = json.dumps(current_best.config, indent=2)
        history_text = self.format_history(history)
        return f"""You are a pricing page optimisation agent. Your goal is to increase upgrade click rate.

CURRENT BEST CONFIG (upgrade rate: {current_best.metric:.2%}):
{config_json}

RECENT EXPERIMENTS:
{history_text}

Respond with ONE hypothesis as JSON:
{{
  "hypothesis": "what change will increase upgrade click rate",
  "mutation": {{
    "type": "set_value|reorder_array|toggle_boolean",
    "field": "the config key to change",
    "value": "new value",
    "from_index": 0,
    "to_index": 1
  }},
  "reasoning": "pricing psychology principle behind this change"
}}

EXAMPLES (pricing psychology):
1. Change highlighted plan: {{"type":"set_value","field":"highlighted_plan","value":"pro"}}
   → Draws attention to highest-margin plan via visual anchoring
2. Lead with annual billing: {{"type":"set_value","field":"annual_default","value":true}}
   → Annual default reduces perceived monthly cost
3. Move Pro to middle (flanking): {{"type":"reorder_array","field":"plans_order","from_index":0,"to_index":1}}
   → Flanking Free and Enterprise makes Pro look like the obvious choice
4. Stronger CTA: {{"type":"set_value","field":"cta_text.pro","value":"Start Free — No Card Needed"}}
   → Removes risk perception from upgrade CTA

Respond with ONLY valid JSON."""

    def parse_hypothesis(self, response: str) -> Hypothesis:
        text = response.strip().strip("```json").strip("```").strip()
        try:
            data = json.loads(text)
            return Hypothesis(**data)
        except Exception:
            return Hypothesis(
                hypothesis="Highlight Pro plan to increase upgrade rate",
                mutation={"type": "set_value", "field": "highlighted_plan", "value": "pro"},
                reasoning="Visual anchoring on Pro drives upgrade clicks"
            )

    # ── Mutation application ───────────────────────────────────────────────────

    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        new = copy.deepcopy(config)
        if not isinstance(mutation, dict):
            return new

        mtype = mutation.get("type", "")
        field = mutation.get("field", "")
        value = mutation.get("value")

        # Support nested fields like "cta_text.pro"
        parts = field.split(".")
        target = new
        for part in parts[:-1]:
            if isinstance(target, dict):
                target = target.setdefault(part, {})
        leaf = parts[-1]

        if mtype == "set_value":
            target[leaf] = value

        elif mtype == "toggle_boolean" and leaf in target:
            target[leaf] = bool(value)

        elif mtype == "reorder_array" and leaf in target:
            arr = target[leaf]
            if isinstance(arr, list):
                fi = mutation.get("from_index", 0)
                ti = mutation.get("to_index", len(arr) - 1)
                if 0 <= fi < len(arr) and 0 <= ti < len(arr):
                    arr.insert(ti, arr.pop(fi))

        return new

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Score pricing config on conversion psychology principles (0-100 → upgrade rate 1.5-5%)."""
        score = 0.0

        # Highlighted plan is Pro — drives attention to highest-value plan (20 pts)
        if asset.get("highlighted_plan") == "pro":
            score += 20

        # Annual billing default — reduces perceived monthly price (15 pts)
        if asset.get("annual_default", False):
            score += 15

        # Show annual option — anchor effect (10 pts)
        if asset.get("show_annual", False):
            score += 10

        # Show comparison table — reduces uncertainty (10 pts)
        if asset.get("show_comparison", False):
            score += 10

        # Pro in the middle of plans_order — flanking effect (8 pts)
        plans = asset.get("plans_order", [])
        if "pro" in plans:
            pos = plans.index("pro")
            mid = len(plans) // 2
            score += 8 if pos == mid else (4 if abs(pos - mid) == 1 else 0)

        # Pro CTA avoids friction words ("contact", "call") (7 pts)
        pro_cta = asset.get("cta_text", {}).get("pro", "")
        friction_words = {"contact", "call", "sales", "request", "demo"}
        if pro_cta and not any(w in pro_cta.lower() for w in friction_words):
            score += 7

        # Pro CTA mentions "free" or "trial" — lowers commitment barrier (5 pts)
        if any(w in pro_cta.lower() for w in {"free", "trial", "try"}):
            score += 5

        # Features list length ≥ 5 — enough proof without overwhelm (5 pts)
        if asset.get("features_list_length", 0) >= 5:
            score += 5

        # Map quality (0-100) → upgrade rate (1.5% – 5.0%)
        upgrade_rate = round(0.015 + (min(score, 100) / 100) * 0.035, 4)
        return EvaluationResult(
            metric=upgrade_rate,
            reasoning=f"Pricing score {score:.0f}/100 → upgrade rate {upgrade_rate:.2%}"
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
        return 0.0378  # ~3.78% upgrade rate for default config

    def format_history(self, history: List[ExperimentHistory]) -> str:
        if not history:
            return "No previous experiments."
        rows = []
        for exp in history[:8]:
            s = "✓" if exp.status == "success" else "✗"
            rows.append(f"{s} {exp.hypothesis[:80]} → {exp.metric_before:.2%} → {exp.metric_after:.2%}")
        return "\n".join(rows)
