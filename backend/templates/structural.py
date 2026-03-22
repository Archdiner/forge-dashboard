"""
Structural Config Template - JSON Mutation for Feature Flags
=========================================================

This template handles STRUCTURAL mutations to JSON configs, not text changes.
Designed for PostHog feature flags where the payload is JSON that controls
page layout, onboarding flow, feature visibility, etc.

Supported mutation types:
- reorder_array: Reorder elements in an array (e.g., sections_order)
- remove_from_array: Remove elements from an array
- toggle_boolean: Flip a boolean value
- set_value: Set a specific value
- swap_elements: Swap two elements in an array

This is what makes Forge structural, not cosmetic.
"""

import json
import random
from typing import Any, Dict, List, Optional, Union
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


# Default structural config for different use cases
LANDING_PAGE_CONFIG = {
    "sections_order": ["hero", "features", "testimonials", "pricing", "cta"],
    "hero_style": "left-aligned",
    "hero_headline": "The AI Platform for Growth",
    "hero_subheadline": "Enterprise-grade AI tools for modern teams",
    "show_pricing": True,
    "show_testimonials": True,
    "pricing_position": "bottom",
    "cta_text": "Start Free Trial",
    "cta_style": "primary",
    "value_prop_count": 3,
    "social_proof_style": "logos",
}

ONBOARDING_CONFIG = {
    "steps_order": ["welcome", "profile", "team", "first_action"],
    "step_fields": {
        "welcome": ["email", "password"],
        "profile": ["name", "role", "company_name"],
        "team": ["team_size", "use_case"],
        "first_action": ["action_type", "action_detail"]
    },
    "show_progress_bar": True,
    "show_skip_option": False,
    "tooltip_enabled": True,
    "helper_text_enabled": True,
    "required_fields_only": True,
}

FEATURE_CONFIG = {
    "feature_enabled": True,
    "feature_position": "sidebar",
    "default_view": "expanded",
    "show_badge": True,
    "badge_text": "New",
    "show_tooltip": True,
    "tooltip_content": "Check out this feature",
    "auto_show_delay": 5000,
    "dismissible": True,
}

PRICING_CONFIG = {
    "plans_order": ["free", "pro", "enterprise"],
    "default_plan": "pro",
    "show_annual": True,
    "show_monthly": True,
    "annual_default": True,
    "highlighted_plan": "pro",
    "show_comparison": True,
    "cta_text": {
        "free": "Get Started",
        "pro": "Start Free Trial",
        "enterprise": "Contact Sales"
    },
    "features_list_length": 5,
}


class StructuralTemplate(BaseTemplate):
    """Template for structural JSON config mutations via feature flags."""

    name = "structural"
    description = "Optimize structural configs (layouts, flows, features) via feature flags"
    metric_name = "conversion_rate"
    metric_direction = "higher_is_better"

    # Valid mutation types
    MUTATION_TYPES = [
        "reorder_array",
        "remove_from_array",
        "toggle_boolean",
        "set_value",
        "swap_elements",
    ]

    # Config schemas per use case
    CONFIG_SCHEMAS = {
        "landing-page": LANDING_PAGE_CONFIG,
        "onboarding": ONBOARDING_CONFIG,
        "feature": FEATURE_CONFIG,
        "pricing": PRICING_CONFIG,
    }

    def __init__(self, schema: str = "landing-page"):
        self.schema = schema
        self.default_config = self.CONFIG_SCHEMAS.get(schema, LANDING_PAGE_CONFIG.copy())

    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        """Generate prompt for structural mutation hypothesis."""
        config = current_best.config
        history_text = self.format_history(history)

        # Format config as JSON for readability
        config_json = json.dumps(config, indent=2)

        prompt = f"""You are an optimization agent specializing in STRUCTURAL changes to product experiences.

Your task: Generate ONE hypothesis for an experiment that changes the STRUCTURE of a config, not the text.

CURRENT BEST CONFIG (metric: {current_best.metric:.2%}):
{config_json}

RECENT EXPERIMENTS:
{history_text}

Respond in JSON with these exact fields:
{{
  "hypothesis": "what structural change you think will improve metrics",
  "mutation": {{
    "type": "reorder_array|toggle_boolean|set_value|remove_from_array|swap_elements",
    "field": "the config field to change",
    "value": "new value (format depends on type)",
    "secondary_value": "for swap_elements, the second element to swap"
  }},
  "reasoning": "why this structural change might improve conversion/engagement"
}}

STRUCTURAL MUTATION EXAMPLES:

1. REORDER (sections, steps, plans):
   {{"type": "reorder_array", "field": "sections_order", "from_index": 2, "to_index": 0}}
   Move testimonials from position 2 to position 0 (above features).

2. TOGGLE (show/hide sections, enable/disable features):
   {{"type": "toggle_boolean", "field": "show_pricing", "value": false}}
   Hide pricing section to reduce decision friction.

3. SET VALUE (change style, position, count):
   {{"type": "set_value", "field": "hero_style", "value": "centered"}}
   Change hero alignment to centered for better focus.

4. REMOVE (reduce fields, remove steps):
   {{"type": "remove_from_array", "field": "step_fields.profile", "value": "company_name"}}
   Remove company name from profile step to reduce friction.

5. SWAP (exchange positions):
   {{"type": "swap_elements", "field": "plans_order", "element1": "pro", "element2": "enterprise"}}
   Swap pro and enterprise positions.

Respond with ONLY valid JSON. No explanations outside the JSON."""
        return prompt

    def parse_hypothesis(self, response: str) -> Hypothesis:
        """Parse LLM response into Hypothesis with structural mutation."""
        text = response.strip()

        # Remove code blocks
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]

        try:
            data = json.loads(text.strip())
            return Hypothesis(**data)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Parse error: {e}, response: {text}")
            # Return a sensible default
            return Hypothesis(
                hypothesis="Testing section reordering",
                mutation={"type": "reorder_array", "field": "sections_order", "from_index": 1, "to_index": 2},
                reasoning="Reordering may improve flow"
            )

    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        """Apply structural mutation to config.

        Mutation format:
        {
            "type": "reorder_array|toggle_boolean|set_value|remove_from_array|swap_elements",
            "field": "config.field.path",
            "value": ...,
            "from_index": 1,  # for reorder
            "to_index": 2,    # for reorder
            "element1": "...", # for swap
            "element2": "...", # for swap
        }
        """
        import copy
        new_config = copy.deepcopy(config)

        if isinstance(mutation, dict):
            mutation_type = mutation.get("type", "")
            field = mutation.get("field", "")
            value = mutation.get("value")

            # Navigate to nested field
            field_parts = field.split(".")
            current = new_config

            # Navigate to parent of target field
            for part in field_parts[:-1]:
                if isinstance(current, dict):
                    current = current.setdefault(part, {})
                elif isinstance(current, list):
                    idx = int(part) if part.isdigit() else 0
                    current = current[idx] if idx < len(current) else {}

            target_field = field_parts[-1]

            if mutation_type == "toggle_boolean" and target_field in current:
                current[target_field] = bool(value)

            elif mutation_type == "set_value":
                current[target_field] = value

            elif mutation_type == "reorder_array" and target_field in current:
                arr = current[target_field]
                if isinstance(arr, list):
                    from_idx = mutation.get("from_index", 0)
                    to_idx = mutation.get("to_index", len(arr) - 1)
                    if 0 <= from_idx < len(arr) and 0 <= to_idx < len(arr):
                        arr.insert(to_idx, arr.pop(from_idx))

            elif mutation_type == "remove_from_array" and target_field in current:
                arr = current[target_field]
                if isinstance(arr, list) and value in arr:
                    arr.remove(value)

            elif mutation_type == "swap_elements":
                arr = current[target_field]
                if isinstance(arr, list):
                    elem1 = mutation.get("element1")
                    elem2 = mutation.get("element2")
                    if elem1 in arr and elem2 in arr:
                        idx1 = arr.index(elem1)
                        idx2 = arr.index(elem2)
                        arr[idx1], arr[idx2] = arr[idx2], arr[idx1]

        return new_config

    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Score structural config on UX conversion principles (0–100).

        Covers: section ordering, visibility flags, style choices, and
        content signals. Default LANDING_PAGE_CONFIG scores ~68.
        """
        score = 0.0
        reasons = []

        sections = asset.get("sections_order", [])

        # 1. Section ordering (35 pts) ─────────────────────────────────────────
        if sections:
            # Hero placement: reward being first (15 pts max)
            if "hero" in sections:
                pos = sections.index("hero")
                pts = max(0, 15 - pos * 5)
                score += pts
                reasons.append(f"hero@{pos}(+{pts})")

            # CTA placement: reward being last (10 pts max)
            if "cta" in sections:
                from_end = len(sections) - 1 - sections.index("cta")
                pts = max(0, 10 - from_end * 3)
                score += pts
                reasons.append(f"cta_from_end={from_end}(+{pts})")

            # Testimonials before pricing builds trust first (5 pts)
            t_idx = sections.index("testimonials") if "testimonials" in sections else 9999
            p_idx = sections.index("pricing") if "pricing" in sections else 9999
            if t_idx < p_idx:
                score += 5
                reasons.append("testimonials<pricing(+5)")

            # Features visible (5 pts)
            if "features" in sections:
                score += 5
                reasons.append("features_visible(+5)")

        # 2. Visibility flags (15 pts) ─────────────────────────────────────────
        if asset.get("show_pricing", False):
            score += 5
        if asset.get("show_testimonials", False):
            score += 5
        if asset.get("show_comparison", False):
            score += 5

        # 3. Style choices (25 pts) ────────────────────────────────────────────
        hero_pts = {"centered": 10, "split": 8, "full-width": 6, "left-aligned": 5}
        score += hero_pts.get(asset.get("hero_style", ""), 3)

        cta_pts = {"primary": 10, "gradient": 9, "outline": 5, "secondary": 3}
        score += cta_pts.get(asset.get("cta_style", ""), 3)

        proof_pts = {"logos": 5, "testimonials": 5, "count": 3, "badges": 3}
        score += proof_pts.get(asset.get("social_proof_style", ""), 2)

        # 4. Content signals (5 pts) ───────────────────────────────────────────
        vpc = asset.get("value_prop_count", 0)
        if isinstance(vpc, int):
            score += min(5, vpc)

        ux_score = min(100.0, max(0.0, score))
        # Map UX score (0-100) → realistic CVR (1.0% – 5.0%), same scale as landing-page-cro
        cvr = round(0.010 + (ux_score / 100) * 0.040, 4)
        return EvaluationResult(
            metric=cvr,
            reasoning=f"UX score {ux_score:.1f}/100 → CVR {cvr:.2%} — " + "; ".join(reasons) if reasons else f"CVR {cvr:.2%}"
        )

    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        """Not used - evaluation comes from PostHog."""
        return "Evaluation via PostHog"

    def parse_evaluation(self, response: str) -> EvaluationResult:
        """Not used - evaluation comes from PostHog."""
        return EvaluationResult(metric=0.5, reasoning="From PostHog")

    def get_payload(self, config: Dict[str, Any]) -> dict:
        """Get the JSON payload for feature flag.

        This is the config that gets sent to the frontend via PostHog.
        """
        return config

    def get_flag_key(self, project_id: str) -> str:
        """Generate the feature flag key for this project."""
        return f"forge-{project_id}"

    def format_history(self, history: List[ExperimentHistory]) -> str:
        """Format experiment history for prompts."""
        if not history:
            return "No previous experiments yet."

        formatted = []
        for exp in history[:10]:
            status = "✓" if exp.status == "success" else "✗"
            mutation_str = json.dumps(exp.mutation)[:100] if isinstance(exp.mutation, dict) else str(exp.mutation)[:100]
            formatted.append(
                f"{status} Exp #{exp.id}: {exp.hypothesis}\n"
                f"   Mutation: {mutation_str}\n"
                f"   Result: {exp.metric_before:.2%} → {exp.metric_after:.2%}"
            )
        return "\n".join(formatted)

    def parse_user_input(self, content: str) -> Dict[str, Any]:
        """Parse user content into config.

        Accepts:
        - JSON: parsed as config
        - "landing-page", "onboarding", "feature", "pricing": use schema defaults
        """
        content = content.strip()

        # Check for known schema keywords
        if content.lower() in self.CONFIG_SCHEMAS:
            return self.CONFIG_SCHEMAS[content.lower()].copy()

        # Try parsing as JSON
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                return {**self.default_config, **data}
        except json.JSONDecodeError:
            pass

        return self.default_config.copy()

    def get_default_metric(self) -> float:
        """Default baseline CVR for default LANDING_PAGE_CONFIG (UX score 68 → 3.72%)."""
        return 0.0372


# Factory function
def create_structural_template(schema: str = "landing-page") -> StructuralTemplate:
    """Create a structural template with the specified schema."""
    return StructuralTemplate(schema=schema)
