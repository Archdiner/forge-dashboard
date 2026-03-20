import json
import re
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


# Sample test set for customer support email classification
TEST_SET = [
    {"email": "Hi, I can't log into my account and I've tried resetting my password three times. Help!", "expected": "technical"},
    {"email": "Can I upgrade my plan to premium? What's the difference in pricing?", "expected": "billing"},
    {"email": "The API is returning 500 errors every time I try to create a new user. This is urgent!", "expected": "technical"},
    {"email": "I'd like to cancel my subscription and get a refund for last month.", "expected": "billing"},
    {"email": "Can you add more users to our team account? We hired 3 new people.", "expected": "feature_request"},
    {"email": "Your app crashes every time I open the settings page on iOS.", "expected": "technical"},
    {"email": "How much does the enterprise plan cost? We need about 50 seats.", "expected": "billing"},
    {"email": "I'd love to see dark mode added to the dashboard. Is that on your roadmap?", "expected": "feature_request"},
    {"email": "The export feature isn't working - it just spins forever.", "expected": "technical"},
    {"email": "Can I change my account email? I'm using a personal email but need a work one.", "expected": "billing"},
    {"email": "We need SSO integration with Okta for our company.", "expected": "feature_request"},
    {"email": "Your integration with Slack keeps disconnecting.", "expected": "technical"},
    {"email": "What's the process for getting a demo of the enterprise features?", "expected": "feature_request"},
    {"email": "I was charged twice this month for my subscription.", "expected": "billing"},
    {"email": "The mobile app doesn't show any of my recent projects.", "expected": "technical"},
]

CATEGORIES = ["technical", "billing", "feature_request", "complaint", "praise"]


class PromptOptimizationTemplate(BaseTemplate):
    """Prompt Optimization template - optimizes system prompts for task accuracy."""
    
    name = "prompt-optimization"
    description = "Optimize a system prompt for accuracy on a test set"
    metric_name = "accuracy"
    metric_direction = "higher_is_better"
    
    default_config = {
        "system_prompt": "You are a customer support classifier. Classify incoming emails into one of these categories: technical, billing, feature_request, complaint, or praise. Respond with just the category name.",
        "few_shot_examples": []
    }
    
    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        history_text = self.format_history(history)
        
        prompt = f"""You are an optimization agent specializing in prompt engineering.

Your task: Generate ONE hypothesis for an experiment that could improve the accuracy of a customer support email classifier.

CURRENT BEST PROMPT (accuracy: {current_best.metric*100:.0f}%):
{current_best.config.get('system_prompt', 'N/A')}

RECENT EXPERIMENTS:
{history_text}

Generate a hypothesis and mutation. Respond in JSON:
{{
  "hypothesis": "what change you think will improve accuracy",
  "mutation": "the specific change to make to the prompt",
  "reasoning": "why this might work"
}}

Consider: adding constraints, few-shot examples, step-by-step reasoning, output format specifications, or clarification of ambiguous cases."""
        return prompt
    
    def parse_hypothesis(self, response: str) -> Hypothesis:
        """Parse LLM response into Hypothesis."""
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
            return Hypothesis(
                hypothesis="Testing clearer instructions",
                mutation="Add output format specification to prompt",
                reasoning="Clearer output format may improve consistency"
            )
    
    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        """Apply mutation to the config."""
        new_config = {**config}
        
        # Extract the new prompt from mutation
        prompt = config.get("system_prompt", "")
        
        # Simple mutations - append or modify
        if "add" in mutation.lower() or "include" in mutation.lower():
            # Try to extract what to add
            if "example" in mutation.lower() or "few-shot" in mutation.lower():
                # Add a few-shot example
                new_examples = [
                    {"email": "I can't access my dashboard", "category": "technical"},
                    {"email": "How do I upgrade?", "category": "billing"},
                ]
                new_config["few_shot_examples"] = new_examples
            else:
                # Append to prompt
                new_config["system_prompt"] = prompt + " " + mutation
        
        elif "format" in mutation.lower() or "output" in mutation.lower():
            # Add output format specification
            format_spec = "Respond in JSON format: {\"category\": \"<category>\"}."
            if format_spec not in prompt:
                new_config["system_prompt"] = prompt + " " + format_spec
        
        elif "step" in mutation.lower() or "reasoning" in mutation.lower():
            # Add step-by-step reasoning
            reasoning_spec = "Think step by step before classifying."
            if reasoning_spec not in prompt:
                new_config["system_prompt"] = reasoning_spec + " " + prompt
        
        elif "constraint" in mutation.lower() or "rule" in mutation.lower():
            # Add a constraint
            constraint = "When uncertain, choose 'technical'."
            if constraint not in prompt:
                new_config["system_prompt"] = prompt + " " + constraint
        
        else:
            # Try to parse as a direct replacement
            if len(mutation) > 20:
                new_config["system_prompt"] = mutation
        
        return new_config
    
    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """LLM-powered evaluation: run the prompt against the test set and compute accuracy."""
        if llm is None:
            return EvaluationResult(metric=0.5, reasoning="No LLM available — returning baseline")

        eval_prompt = self.generate_evaluation_prompt(asset)
        response = llm.evaluate(eval_prompt)
        return self.parse_evaluation(response)

    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        """Generate prompt for evaluating the prompt on test set."""
        prompt = asset.get("system_prompt", "")
        few_shot = asset.get("few_shot_examples", [])
        
        few_shot_text = ""
        if few_shot:
            few_shot_text = "\nExample classifications:\n"
            for ex in few_shot:
                few_shot_text += f"- Email: {ex['email']} -> {ex['category']}\n"
        
        # Build evaluation prompt with test set
        test_cases = "\n".join([
            f"{i+1}. Email: \"{t['email']}\" (Expected: {t['expected']})"
            for i, t in enumerate(TEST_SET)
        ])
        
        prompt = f"""{prompt}
{few_shot_text}

Classify the following emails. Respond with a JSON array of results:
[
  {{"email": "...", "category": "your_prediction", "correct": true/false}}
]

Test emails:
{test_cases}

Respond with ONLY the JSON array, no other text."""
        
        return prompt
    
    def parse_evaluation(self, response: str) -> EvaluationResult:
        """Parse LLM evaluation response."""
        text = response.strip()
        
        # Remove code blocks
        if "```" in text:
            start = text.find("[")
            end = text.rfind("]") + 1
            if start >= 0 and end > start:
                text = text[start:end]
        
        try:
            results = json.loads(text)
            
            if isinstance(results, list):
                correct = sum(1 for r in results if r.get("correct", False))
                total = len(results)
                accuracy = correct / total if total > 0 else 0
                
                return EvaluationResult(
                    metric=accuracy,
                    reasoning=f"{correct}/{total} correct classifications"
                )
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Evaluation parse error: {e}")
        
        # Fallback - try to extract numbers from response
        match = re.search(r'(\d+)/(\d+)', text)
        if match:
            correct = int(match.group(1))
            total = int(match.group(2))
            accuracy = correct / total if total > 0 else 0
            return EvaluationResult(
                metric=accuracy,
                reasoning=f"{correct}/{total} correct"
            )
        
        return EvaluationResult(
            metric=0.5,
            reasoning="Default evaluation due to parse error"
        )

    def parse_user_input(self, content: str) -> dict:
        """Parse user's prompt into config dict."""
        config = self.default_config.copy()
        
        if not content or not content.strip():
            return config
        
        config['system_prompt'] = content.strip()[:2000]
        
        return config

    def config_to_output(self, config: dict) -> dict:
        """Convert optimized config to readable output."""
        return {
            "type": "prompt",
            "system_prompt": config.get('system_prompt', ''),
            "few_shot_examples": config.get('few_shot_examples', []),
            "rendered": f"SYSTEM PROMPT:\n{config.get('system_prompt', '')}"
        }
