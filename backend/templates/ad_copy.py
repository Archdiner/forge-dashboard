import json
import re
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


class AdCopyTemplate(BaseTemplate):
    """Ad copy optimization template for Meta/Google Ads."""
    
    name = "ad-copy"
    description = "Optimize ad copy for CTR and conversion"
    metric_name = "ad_score"
    metric_direction = "higher_is_better"
    
    default_config = {
        "headline_1": "AI for Growth Teams",
        "headline_2": "Automate Your Experiments",
        "description_1": "Run 1000+ experiments overnight. Wake up to better results.",
        "description_2": "Start free. No credit card required.",
        "cta": "Start Free Trial",
        "ad_format": "single_image"
    }
    
    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        history_text = self.format_history(history)

        prompt = f"""You are an ad copy optimization agent specializing in Meta and Google Ads.

Your task: Generate ONE hypothesis for an experiment that could improve the ad score (CTR).

CURRENT BEST CONFIG (score: {current_best.metric:.1f}/100):
- headline_1: {current_best.config.get('headline_1', 'N/A')}
- headline_2: {current_best.config.get('headline_2', 'N/A')}
- description_1: {current_best.config.get('description_1', 'N/A')}
- description_2: {current_best.config.get('description_2', 'N/A')}
- cta: {current_best.config.get('cta', 'N/A')}

RECENT EXPERIMENTS:
{history_text}

Respond in JSON. The "mutation" field MUST be an object with "field" and "value" keys.
Valid fields: headline_1, headline_2, description_1, description_2, cta

{{
  "hypothesis": "what change you think will improve CTR and why",
  "mutation": {{"field": "headline_1", "value": "The new headline here"}},
  "reasoning": "why this might work based on ad copy best practices"
}}

Rules for high-CTR ads:
- Headlines: 25-40 characters, benefit-driven, use numbers
- Descriptions: 90-150 characters, include social proof
- CTA: action-oriented (Start, Get, Try, Book)
- Avoid: generic language, spam words, all-caps
Avoid repeating mutations from RECENT EXPERIMENTS."""
        return prompt
    
    def parse_hypothesis(self, response: str) -> Hypothesis:
        text = response.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        
        try:
            data = json.loads(text.strip())
            if isinstance(data, list):
                if len(data) > 0:
                    data = data[0]
            return Hypothesis(**data)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Parse error: {e}, response: {text}")
            return Hypothesis(
                hypothesis="Testing new headline variation",
                mutation={"field": "headline_1", "value": "10x Your Results Starting Tonight"},
                reasoning="Urgency + specific result tends to improve CTR"
            )
    
    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        new_config = {**config}
        
        VALID_FIELDS = {"headline_1", "headline_2", "description_1", "description_2", "cta"}
        
        if isinstance(mutation, dict):
            field = mutation.get("field", "")
            value = mutation.get("value")
            if field in VALID_FIELDS and value is not None:
                new_config[field] = str(value).strip()
            return new_config
        
        mutation_str = str(mutation)
        field = None
        if "headline_1" in mutation_str.lower():
            field = "headline_1"
        elif "headline_2" in mutation_str.lower():
            field = "headline_2"
        elif "description_1" in mutation_str.lower():
            field = "description_1"
        elif "description_2" in mutation_str.lower():
            field = "description_2"
        elif "cta" in mutation_str.lower():
            field = "cta"
        
        if field:
            quoted = re.findall(r'"([^"]{4,})"', mutation_str)
            if quoted:
                new_config[field] = quoted[0].strip()
        
        return new_config
    
    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Compute ad score based on heuristics."""
        score = 0
        reasons = []
        
        h1 = asset.get("headline_1", "")
        h2 = asset.get("headline_2", "")
        d1 = asset.get("description_1", "")
        d2 = asset.get("description_2", "")
        cta = asset.get("cta", "")
        
        if h1:
            if len(h1) <= 40:
                score += 20
                reasons.append("Headline 1 length optimal")
            if any(w in h1.lower() for w in ["free", "start", "get", "try", "10x", "today"]):
                score += 15
                reasons.append("Headline 1 has action words")
            if any(c.isdigit() for c in h1):
                score += 10
                reasons.append("Headline 1 has numbers")
        
        if h2:
            if len(h2) <= 40:
                score += 15
                reasons.append("Headline 2 length optimal")
        
        if d1:
            if len(d1) <= 150:
                score += 15
                reasons.append("Description 1 length optimal")
            if "free" in d1.lower() or "no" in d1.lower():
                score += 10
                reasons.append("Description 1 has friction-reducing language")
        
        if d2:
            if len(d2) <= 150:
                score += 10
                reasons.append("Description 2 length optimal")
        
        if cta:
            if any(w in cta.lower() for w in ["start", "get", "try", "book", "schedule"]):
                score += 5
                reasons.append("CTA has action verb")
        
        return EvaluationResult(
            metric=min(score, 100),
            reasoning="; ".join(reasons) if reasons else "Basic optimization applied"
        )
    
    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        return f"Ad Score={self.evaluate(asset).metric:.2f}"
    
    def parse_evaluation(self, response: str) -> EvaluationResult:
        raise NotImplementedError("Use evaluate() directly")
    
    def parse_user_input(self, content: str) -> dict:
        config = self.default_config.copy()
        
        if not content:
            return config
        
        lines = [l.strip() for l in content.split('\n') if l.strip()]
        
        if lines:
            config["headline_1"] = lines[0][:40]
        if len(lines) > 1:
            config["headline_2"] = lines[1][:40]
        if len(lines) > 2:
            config["description_1"] = " ".join(lines[2:])[:150]
        
        return config
    
    def config_to_output(self, config: dict) -> dict:
        return {
            "type": "ad_copy",
            "headline_1": config.get("headline_1", ""),
            "headline_2": config.get("headline_2", ""),
            "description_1": config.get("description_1", ""),
            "description_2": config.get("description_2", ""),
            "cta": config.get("cta", ""),
        }
