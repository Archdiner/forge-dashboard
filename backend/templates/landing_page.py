import json
import re
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory
from evaluators import LandingPageEvaluator, get_evaluator


class LandingPageTemplate(BaseTemplate):
    """Landing Page CRO optimization template."""
    
    name = "landing-page-cro"
    description = "Optimize a landing page for conversion"
    metric_name = "conversion_rate"
    metric_direction = "higher_is_better"
    
    def __init__(self):
        self.evaluator = LandingPageEvaluator()
    
    default_config = {
        "headline": "The AI Platform for Growth",
        "subheadline": "Enterprise-grade AI tools for modern teams",
        "cta_text": "Start Free Trial",
        "value_props": [
            "AI-powered automation",
            "Real-time analytics",
            "Seamless integration"
        ],
        "social_proof": "Trusted by leading companies",
        "tone": "professional"
    }
    
    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        history_text = self.format_history(history)

        prompt = f"""You are an optimization agent specializing in conversion rate optimization (CRO).

Your task: Generate ONE hypothesis for an experiment that could improve the conversion score of a landing page.

CURRENT BEST CONFIG (CVR: {current_best.metric*100:.2f}%):
- headline: {current_best.config.get('headline', 'N/A')}
- subheadline: {current_best.config.get('subheadline', 'N/A')}
- cta_text: {current_best.config.get('cta_text', 'N/A')}
- value_props: {current_best.config.get('value_props', [])}
- social_proof: {current_best.config.get('social_proof', 'N/A')}
- tone: {current_best.config.get('tone', 'N/A')}

RECENT EXPERIMENTS:
{history_text}

Respond in JSON. The "mutation" field MUST be an object with "field" and "value" keys.
Valid fields: headline, subheadline, cta_text, value_props, social_proof, tone
For value_props, "value" should be a list of 3 strings.
For tone, "value" must be one of: professional, casual, urgent.

{{
  "hypothesis": "what you think will improve and why",
  "mutation": {{"field": "headline", "value": "Your new headline text here"}},
  "reasoning": "why this might work based on CRO principles and past experiments"
}}

Focus on high-impact changes. Avoid repeating mutations from RECENT EXPERIMENTS."""
        return prompt
    
    def parse_hypothesis(self, response: str) -> Hypothesis:
        """Parse LLM response into Hypothesis."""
        # Clean up response
        text = response.strip()
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
            # Return a default hypothesis on parse failure
            return Hypothesis(
                hypothesis="Testing a headline variation",
                mutation="Change headline to a question format",
                reasoning="Question headlines tend to increase engagement"
            )
    
    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        """Apply mutation to config. Expects mutation as {"field": ..., "value": ...} dict."""
        new_config = {**config}
        new_config["value_props"] = list(config.get("value_props", []))

        VALID_FIELDS = {"headline", "subheadline", "cta_text", "value_props", "social_proof", "tone"}
        VALID_TONES = {"professional", "casual", "urgent"}

        # Primary path: structured dict from LLM
        if isinstance(mutation, dict):
            field = mutation.get("field", "")
            value = mutation.get("value")
            if field in VALID_FIELDS and value is not None:
                if field == "tone" and str(value).lower() not in VALID_TONES:
                    return new_config  # ignore invalid tone
                if field == "value_props":
                    if isinstance(value, list) and all(isinstance(v, str) for v in value):
                        new_config["value_props"] = [v.strip() for v in value if v.strip()]
                else:
                    new_config[field] = str(value).strip()
            return new_config

        # Fallback: string mutation (legacy / parse failure)
        mutation_str = str(mutation)
        mutation_lower = mutation_str.lower()

        # Detect field from keywords (subheadline before headline to avoid substring match)
        field = None
        if "subheadline" in mutation_lower:
            field = "subheadline"
        elif "headline" in mutation_lower:
            field = "headline"
        elif "cta" in mutation_lower or "button" in mutation_lower:
            field = "cta_text"
        elif "social proof" in mutation_lower:
            field = "social_proof"
        elif "tone" in mutation_lower or "voice" in mutation_lower:
            field = "tone"
        elif "value prop" in mutation_lower or "bullet" in mutation_lower:
            field = "value_props"

        if field == "tone":
            for tone in VALID_TONES:
                if tone in mutation_lower:
                    new_config["tone"] = tone
                    break
        elif field == "value_props":
            lines = mutation_str.split('\n')
            new_props = [line.lstrip('-• ').strip() for line in lines if line.strip() and len(line.strip()) > 5]
            if new_props:
                new_config["value_props"] = new_props
        elif field:
            # Extract quoted text if available
            quoted = re.findall(r'"([^"]{4,})"', mutation_str)
            if quoted:
                new_config[field] = quoted[0].strip()

        return new_config
    
    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Deterministic CCS (Composite Conversion Score). llm not used."""
        result = self.evaluator.evaluate(asset)
        return EvaluationResult(
            metric=result.metric,
            reasoning=result.details if result.guardrails_passed else f"Guardrail failed: {result.guardrail_failures}"
        )
    
    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        """Legacy — not used in the agent loop. Use evaluate() instead."""
        return f"CCS={self.evaluator.compute_primary(asset):.2f}"

    def parse_evaluation(self, response: str) -> EvaluationResult:
        """Legacy — not used in the agent loop. Use evaluate() instead."""
        raise NotImplementedError("Call evaluate(asset) directly instead of the LLM-judge path.")

    def parse_user_input(self, content: str) -> dict:
        """Parse user's raw landing page content into config dict."""
        import re, copy

        config = copy.deepcopy(self.default_config)

        if not content or not content.strip():
            return config

        lines = [l.strip() for l in content.split('\n') if l.strip()]

        headline_match = re.search(r'headline:?\s*["\']?([^"\'\n]+)', content, re.IGNORECASE)
        if headline_match:
            config["headline"] = headline_match.group(1).strip()[:100]

        subhead_match = re.search(r'subhead(?:line)?:?\s*["\']?([^"\'\n]+)', content, re.IGNORECASE)
        if subhead_match:
            config["subheadline"] = subhead_match.group(1).strip()[:150]

        cta_match = re.search(r'cta:?\s*["\']?([^"\'\n]+)', content, re.IGNORECASE)
        if cta_match:
            config["cta_text"] = cta_match.group(1).strip()[:50]

        social_match = re.search(r'social.?proof:?\s*["\']?([^"\'\n]+)', content, re.IGNORECASE)
        if social_match:
            config["social_proof"] = social_match.group(1).strip()[:150]

        # Bullet-list value props
        bullet_props = re.findall(r'[•\-\*]\s*([^"\n]+)', content)
        if bullet_props:
            config["value_props"] = [v.strip() for v in bullet_props if v.strip()][:5]
        else:
            # "value props: X, Y, Z" format
            vp_match = re.search(r'value.?props?:?\s*(.+)', content, re.IGNORECASE)
            if vp_match:
                parts = [p.strip() for p in vp_match.group(1).split(',') if p.strip()]
                if parts:
                    config["value_props"] = parts[:5]

        if config["headline"] == self.default_config["headline"] and lines:
            if len(lines[0]) > 5:
                config["headline"] = lines[0][:100]

        # Clear default subheadline when user didn't provide one (it's complex and may fail Flesch)
        if config["subheadline"] == self.default_config["subheadline"] and config["headline"] != self.default_config["headline"]:
            config["subheadline"] = config["headline"]

        return config

    def config_to_output(self, config: dict) -> dict:
        """Convert optimized config to readable output."""
        return {
            "type": "landing_page",
            "headline": config.get("headline", ""),
            "subheadline": config.get("subheadline", ""),
            "cta_text": config.get("cta_text", ""),
            "value_props": config.get("value_props", []),
            "social_proof": config.get("social_proof", ""),
            "tone": config.get("tone", "professional"),
            "rendered": self._render_text(config)
        }

    def _render_text(self, config: dict) -> str:
        """Render config as plain text."""
        parts = []
        if config.get("headline"):
            parts.append(f"HEADLINE: {config['headline']}")
        if config.get("subheadline"):
            parts.append(f"\nSUBHEADLINE: {config['subheadline']}")
        if config.get("cta_text"):
            parts.append(f"\nCTA: {config['cta_text']}")
        if config.get("value_props"):
            parts.append(f"\nVALUE PROPS:")
            for prop in config['value_props']:
                parts.append(f"  • {prop}")
        if config.get("social_proof"):
            parts.append(f"\nSOCIAL PROOF: {config['social_proof']}")
        return "\n".join(parts)
