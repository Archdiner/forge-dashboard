import json
import re
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory
from evaluators import EmailEvaluator


class EmailOutreachTemplate(BaseTemplate):
    """Email/Cold outreach optimization template."""
    
    name = "email-outreach"
    description = "Optimize cold emails for reply rates"
    metric_name = "reply_rate"
    metric_direction = "higher_is_better"
    
    def __init__(self):
        self.evaluator = EmailEvaluator()
    
    default_config = {
        "subject_line": "Quick question about {{first_name}}'s team",
        "body": """Hi {{first_name}},

I noticed your team is working on {problem}. We've helped companies like yours achieve {result}.

Would you be open to a quick 5-minute chat this week?

Best,
[Your Name]""",
        "personalization_fields": ["first_name", "company"],
        "cta": "Schedule a call"
    }
    
    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        history_text = self.format_history(history)

        prompt = f"""You are an email optimization agent specializing in cold outreach.

Your task: Generate ONE hypothesis for an experiment that could improve the email score (reply rate).

CURRENT BEST CONFIG (score: {current_best.metric:.1f}/100):
- subject_line: {current_best.config.get('subject_line', 'N/A')}
- body: {current_best.config.get('body', 'N/A')[:200]}
- cta: {current_best.config.get('cta', 'N/A')}

RECENT EXPERIMENTS:
{history_text}

Respond in JSON. The "mutation" field MUST be an object with "field" and "value" keys.
Valid fields: subject_line, body, cta
The "value" must be the complete replacement text for that field.

{{
  "hypothesis": "what change you think will improve the reply rate and why",
  "mutation": {{"field": "subject_line", "value": "The new complete subject line here"}},
  "reasoning": "why this might work based on cold email best practices"
}}

Rules for high-scoring emails:
- Subject: 4-9 words, avoid spam words (free, guaranteed, buy now)
- Include {{{{first_name}}}} for personalization
- Body: under 100 words, one clear ask
- CTA: specific action, not generic "schedule a call"
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
            
            # mutation can now be a dict - keep it as-is, Pydantic will handle Union type
            return Hypothesis(**data)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Parse error: {e}")
            return Hypothesis(
                hypothesis="Testing subject line variation",
                mutation="Add personalization token to subject",
                reasoning="Personalized subjects have higher open rates"
            )
    
    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        new_config = {**config}

        VALID_FIELDS = {"subject_line", "body", "cta"}

        # Primary path: structured dict from LLM
        if isinstance(mutation, dict):
            field = mutation.get("field", "")
            value = mutation.get("value")
            # Also accept flat dict like {"subject_line": "...", "body": "..."}
            if field in VALID_FIELDS and value is not None:
                new_config[field] = str(value).strip()
            else:
                for key in VALID_FIELDS:
                    if key in mutation and mutation[key]:
                        new_config[key] = str(mutation[key]).strip()
            return new_config

        # Fallback: string mutation
        mutation_str = str(mutation)
        mutation_lower = mutation_str.lower()

        field = None
        if "subject" in mutation_lower:
            field = "subject_line"
        elif "body" in mutation_lower or "email body" in mutation_lower:
            field = "body"
        elif "cta" in mutation_lower or "call to action" in mutation_lower:
            field = "cta"

        if field:
            quoted = re.findall(r'"([^"]{4,})"', mutation_str)
            if quoted:
                new_config[field] = quoted[0].strip()

        return new_config
    
    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Deterministic CES (Composite Email Score). llm not used."""
        result = self.evaluator.evaluate(asset)
        return EvaluationResult(
            metric=result.metric,
            reasoning=result.details if result.guardrails_passed else f"Guardrail failed: {result.guardrail_failures}"
        )
    
    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        """Legacy — not used in the agent loop. Use evaluate() instead."""
        return f"CES={self.evaluator.compute_primary(asset):.2f}"

    def parse_evaluation(self, response: str) -> EvaluationResult:
        """Legacy — not used in the agent loop. Use evaluate() instead."""
        raise NotImplementedError("Call evaluate(asset) directly instead of the LLM-judge path.")

    def parse_user_input(self, content: str) -> dict:
        """Parse user's raw email content into config dict."""
        import re, copy

        config = copy.deepcopy(self.default_config)

        if not content or not content.strip():
            return config

        text = content.strip()

        # Extract CTA first so it doesn't bleed into body
        cta_match = re.search(r'(?:^|\n)cta:?\s*(.+?)(?:\n|$)', text, re.IGNORECASE)
        if cta_match:
            config["cta"] = cta_match.group(1).strip()[:50]
            text = text[:cta_match.start()].strip()

        # Detect labeled subject line
        subject_match = re.search(r'(?:^|\n)subject:?\s*(.+?)(?:\n|$)', text, re.IGNORECASE)
        if subject_match:
            config["subject_line"] = subject_match.group(1).strip()[:100]
            # Everything after the subject line is the body
            after = text[subject_match.end():].strip()
            # Strip optional "body:" label
            after = re.sub(r'^body:?\s*', '', after, flags=re.IGNORECASE).strip()
            if after:
                config["body"] = after[:500]
        else:
            # No "Subject:" label — treat first non-empty line as subject, rest as body
            lines = [l.rstrip() for l in text.split('\n')]
            non_empty = [(i, l) for i, l in enumerate(lines) if l.strip()]
            if non_empty:
                config["subject_line"] = non_empty[0][1].strip()[:100]
                remaining = '\n'.join(lines[non_empty[0][0] + 1:]).strip()
                if remaining:
                    config["body"] = remaining[:500]

        return config

    def config_to_output(self, config: dict) -> dict:
        """Convert optimized config to readable output."""
        return {
            "type": "email",
            "subject_line": config.get("subject_line", ""),
            "body": config.get("body", ""),
            "cta": config.get("cta", ""),
            "rendered": self._render_text(config)
        }

    def _render_text(self, config: dict) -> str:
        """Render email as plain text."""
        parts = []
        if config.get("subject_line"):
            parts.append(f"Subject: {config['subject_line']}")
        if config.get("body"):
            parts.append(f"\n{config['body']}")
        if config.get("cta"):
            parts.append(f"\n---\n{config['cta']}")
        return "\n".join(parts)
