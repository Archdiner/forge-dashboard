"""
Eval Suite Template - Optimize prompts against real test cases
================================================================

This is the "real metrics" version of Forge. Instead of LLM-as-judge,
we run actual test cases with ground truth and compute objective pass rates.

The feedback loop:
1. Agent proposes a mutation (new system prompt)
2. We run ALL test cases against the mutated prompt
3. We compute pass rate (real metric: 0.0 - 1.0)
4. If pass rate improves, keep; otherwise revert

This closes in seconds: run 50 evals, get a pass rate, keep or revert.
No PostHog needed. No live traffic needed.
"""

import json
from typing import Any, Dict, List, Optional
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory
from evaluators.eval_suite import (
    EvalSuite, 
    TestCase, 
    ValidatorType,
    create_eval_suite_from_config,
)


class EvalSuiteTemplate(BaseTemplate):
    """Template for optimizing prompts against eval suites with real test cases."""
    
    name = "eval-suite"
    description = "Optimize a prompt against a test suite with real metrics"
    metric_name = "pass_rate"
    metric_direction = "higher_is_better"
    
    def __init__(self, eval_suite_config: Optional[Dict[str, Any]] = None):
        self._eval_suite: Optional[EvalSuite] = None
        self._eval_suite_config = eval_suite_config or {}
        
        # Default config
        self.default_config = {
            "system_prompt": "You are a helpful assistant. Respond accurately.",
            "few_shot_examples": [],
            "eval_suite": {
                "name": "custom-eval",
                "description": "Custom eval suite",
                "test_cases": [],
                "pass_threshold": 0.8,
            }
        }
    
    def _get_eval_suite(self, config: Dict[str, Any]) -> EvalSuite:
        """Get or create the eval suite from config."""
        if self._eval_suite is None:
            suite_config = config.get("eval_suite", self._eval_suite_config)
            if suite_config.get("test_cases"):
                self._eval_suite = create_eval_suite_from_config(suite_config)
            else:
                # Try to load from registry
                from evaluators.eval_suite import EvalSuiteRegistry
                suite_name = suite_config.get("name", "customer-support-classifier")
                self._eval_suite = EvalSuiteRegistry.get(suite_name)
                
                if self._eval_suite is None:
                    # Fallback to customer support classifier
                    self._eval_suite = EvalSuiteRegistry.get("customer-support-classifier")
        
        return self._eval_suite
    
    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        """Generate prompt for hypothesis creation."""
        suite = self._get_eval_suite(current_best.config)
        suite_info = suite.to_dict() if suite else {"test_cases": []}
        
        history_text = self.format_history(history)
        
        # Get some example test cases to show the agent
        examples = ""
        if suite_info.get("test_cases"):
            examples = "\nExample test cases:\n"
            for tc in suite_info["test_cases"][:5]:
                examples += f"- Input: {tc['input'][:80]}...\n  Expected: {tc['expected']}\n"
        
        prompt = f"""You are an optimization agent specializing in prompt engineering.

Your task: Generate ONE hypothesis for an experiment that could improve the pass rate
of a prompt on an eval suite with {suite_info.get('total_tests', 0)} test cases.

CURRENT BEST PROMPT (pass rate: {current_best.metric*100:.0f}%):
{current_best.config.get('system_prompt', 'N/A')}

RECENT EXPERIMENTS:
{history_text}
{examples}

Generate a hypothesis and mutation. Respond in JSON:
{{
  "hypothesis": "what change you think will improve pass rate",
  "mutation": "the specific change to make to the prompt",
  "reasoning": "why this might work"
}}

Consider:
- Adding constraints or rules to reduce incorrect responses
- Adding few-shot examples to demonstrate correct behavior  
- Clarifying ambiguous cases
- Adding step-by-step reasoning instructions
- Specifying output format for easier validation"""
        return prompt
    
    def parse_hypothesis(self, response: str) -> Hypothesis:
        """Parse LLM response into Hypothesis."""
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
            return Hypothesis(
                hypothesis="Testing clearer instructions",
                mutation="Add output format specification to prompt",
                reasoning="Clearer output format may improve consistency"
            )
    
    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        """Apply mutation to the config."""
        new_config = {**config}
        prompt = config.get("system_prompt", "")
        
        # Parse mutation to determine what to change
        mutation_str = str(mutation).lower() if isinstance(mutation, str) else ""
        
        if "example" in mutation_str or "few-shot" in mutation_str:
            # Add few-shot examples if not present
            examples = config.get("few_shot_examples", [])
            if len(examples) < 3:
                # Add a couple of examples based on the eval suite
                suite = self._get_eval_suite(config)
                if suite and len(suite.test_cases) >= 2:
                    new_examples = []
                    for tc in suite.test_cases[:2]:
                        new_examples.append({
                            "input": tc.input[:100],
                            "output": tc.expected
                        })
                    new_config["few_shot_examples"] = examples + new_examples
            else:
                # Append to prompt instead
                new_config["system_prompt"] = prompt + " " + str(mutation)
        
        elif "format" in mutation_str or "output" in mutation_str:
            # Add output format specification
            format_spec = 'Respond in JSON format: {"category": "<your answer>"}'
            if format_spec.lower() not in prompt.lower():
                new_config["system_prompt"] = prompt + " " + format_spec
        
        elif "step" in mutation_str or "reasoning" in mutation_str:
            # Add step-by-step reasoning
            reasoning_spec = "Think step by step before responding."
            if reasoning_spec.lower() not in prompt.lower():
                new_config["system_prompt"] = reasoning_spec + " " + prompt
        
        elif "constraint" in mutation_str or "rule" in mutation_str:
            # Add a constraint
            constraint = "When uncertain, respond with the most likely category."
            if constraint.lower() not in prompt.lower():
                new_config["system_prompt"] = prompt + " " + constraint
        
        elif "category" in mutation_str or "classify" in mutation_str:
            # Add category list
            suite = self._get_eval_suite(config)
            categories = "technical, billing, feature_request, complaint, praise"
            if suite and "classifier" in suite.name.lower():
                cat_spec = f"Valid categories: {categories}."
                if cat_spec.lower() not in prompt.lower():
                    new_config["system_prompt"] = prompt + " " + cat_spec
        
        else:
            # Try to parse as direct replacement or addition
            if len(str(mutation)) > 20:
                new_config["system_prompt"] = str(mutation)
            else:
                new_config["system_prompt"] = prompt + " " + str(mutation)
        
        return new_config
    
    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """
        Evaluate the prompt against the eval suite.
        
        This is the KEY difference from LLM-as-judge:
        - We run the ACTUAL test cases against the prompt
        - We compute REAL pass rate (not LLM-judged)
        - The metric is 0.0-1.0 based on actual test results
        """
        if llm is None:
            return EvaluationResult(
                metric=0.5, 
                reasoning="No LLM available - returning baseline"
            )
        
        suite = self._get_eval_suite(asset)
        if suite is None:
            return EvaluationResult(
                metric=0.0,
                reasoning="No eval suite configured"
            )
        
        # Build the run function that executes the prompt
        system_prompt = asset.get("system_prompt", "")
        few_shot = asset.get("few_shot_examples", [])
        
        def run_fn(input_text: str) -> str:
            """Run the prompt against a single test input."""
            prompt = system_prompt
            
            # Add few-shot examples
            if few_shot:
                prompt += "\n\nExamples:\n"
                for ex in few_shot:
                    prompt += f"Input: {ex.get('input', '')}\nOutput: {ex.get('output', '')}\n"
            
            prompt += f"\n\nInput: {input_text}\nOutput:"
            
            response = llm.generate(prompt)
            return response
        
        # Run all test cases
        result = suite.run(run_fn, llm_client=llm)
        
        # Return result with real metrics
        return EvaluationResult(
            metric=result.pass_rate,
            reasoning=result.summary()
        )
    
    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        """Legacy - not used in eval-suite template."""
        return "Not used - eval suite template uses direct execution"
    
    def parse_evaluation(self, response: str) -> EvaluationResult:
        """Legacy - not used in eval-suite template."""
        return EvaluationResult(metric=0.5, reasoning="Legacy parser not used")
    
    def parse_user_input(self, content: str) -> Dict[str, Any]:
        """Parse user's prompt and optional test cases into config."""
        config = self.default_config.copy()
        
        if not content or not content.strip():
            return config
        
        # Check if content is JSON (test case config)
        try:
            data = json.loads(content)
            if "test_cases" in data:
                # It's a test case config
                config["eval_suite"] = data
                return config
        except json.JSONDecodeError:
            pass
        
        # It's just a prompt
        config["system_prompt"] = content.strip()[:2000]
        
        return config
    
    def config_to_output(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Convert optimized config to readable output."""
        return {
            "type": "eval-suite-prompt",
            "system_prompt": config.get("system_prompt", ""),
            "few_shot_examples": config.get("few_shot_examples", []),
            "eval_suite": config.get("eval_suite", {}).get("name", "custom"),
        }
    
    def get_default_metric(self) -> float:
        """Return default baseline metric (50% pass rate)."""
        return 0.5


# ═══════════════════════════════════════════════════════════════════════════════
# FACTORY FUNCTION — Create eval suite template from config
# ═══════════════════════════════════════════════════════════════════════════════

def create_eval_suite_template(
    eval_suite_name: str = "customer-support-classifier",
    custom_test_cases: Optional[List[Dict[str, str]]] = None,
) -> EvalSuiteTemplate:
    """Create an eval suite template with a pre-built or custom eval suite."""
    
    template = EvalSuiteTemplate()
    
    if custom_test_cases:
        # Create custom eval suite
        template.default_config["eval_suite"] = {
            "name": "custom-eval",
            "description": "Custom eval suite",
            "test_cases": [
                {"input": tc["input"], "expected": tc["expected"]}
                for tc in custom_test_cases
            ],
            "pass_threshold": 0.8,
        }
    else:
        # Use pre-built suite
        template.default_config["eval_suite"] = {
            "name": eval_suite_name,
            "description": f"Using pre-built suite: {eval_suite_name}",
            "test_cases": [],
            "pass_threshold": 0.8,
        }
    
    return template
