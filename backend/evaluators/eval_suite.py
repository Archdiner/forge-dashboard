"""
Forge Eval Suite - Real Evaluation Harness
==========================================

This is the core of Forge's "real metrics" approach. Instead of LLM-as-judge,
we use actual test cases with ground truth to compute objective pass/fail rates.

Key concepts:
- TestCase: input + expected output + validator (optional)
- EvalSuite: collection of test cases
- Runner: executes test cases and computes metrics

The feedback loop:
1. Agent proposes a mutation (new prompt/system instruction)
2. We run ALL test cases against the mutated prompt
3. We compute pass rate (real metric, 0-1)
4. If pass rate improves, keep; otherwise revert

This closes the loop in seconds - run 50 evals, get a pass rate.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Callable, Union
from enum import Enum
import json
import re


class ValidatorType(Enum):
    EXACT = "exact"           # Exact string match
    CONTAINS = "contains"     # Expected text must be in response
    JSON_STRUCT = "json_struct" # JSON with expected keys present
    REGEX = "regex"           # Regex pattern match
    FUNCTION = "function"     # Custom validation function
    LLM_JUDGE = "llm_judge"   # LLM judges correctness (last resort)


@dataclass
class TestCase:
    """A single test case with input and expected output."""
    id: str
    input: str
    expected: str
    validator: ValidatorType = ValidatorType.EXACT
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def __post_init__(self):
        if not self.id:
            import uuid
            self.id = str(uuid.uuid4())[:8]


@dataclass
class TestResult:
    """Result of running a single test case."""
    test_id: str
    input: str
    expected: str
    actual: str
    passed: bool
    score: float  # 0-1, for partial credit
    error: Optional[str] = None
    latency_ms: float = 0.0


@dataclass
class EvalSuiteResult:
    """Result of running an entire eval suite."""
    suite_name: str
    total_tests: int
    passed: int
    failed: int
    pass_rate: float  # 0-1
    results: List[TestResult]
    latency_ms: float = 0.0
    
    @property
    def is_success(self) -> bool:
        return self.pass_rate >= 0.8  # 80% threshold
    
    def summary(self) -> str:
        return f"{self.suite_name}: {self.passed}/{self.total_tests} passed ({self.pass_rate*100:.1f}%)"


class EvalValidator:
    """Validates LLM responses against expected outputs."""
    
    @staticmethod
    def exact_match(expected: str, actual: str) -> tuple[bool, float]:
        """Exact string match (case-insensitive for flexibility)."""
        passed = expected.strip().lower() == actual.strip().lower()
        score = 1.0 if passed else 0.0
        return passed, score
    
    @staticmethod
    def contains(expected: str, actual: str) -> tuple[bool, float]:
        """Expected text must be contained in actual response."""
        actual_lower = actual.lower()
        expected_lower = expected.lower()
        
        # Handle multiple possible answers (separated by |)
        possible = [e.strip() for e in expected.split("|")]
        passed = any(e in actual_lower for e in possible if e)
        score = 1.0 if passed else 0.0
        return passed, score
    
    @staticmethod
    def json_struct(expected: str, actual: str) -> tuple[bool, float]:
        """Check that expected JSON keys are present in actual response."""
        try:
            # Try to parse both as JSON
            exp_json = json.loads(expected)
            act_json = json.loads(actual) if actual.strip().startswith(('{', '[')) else {"raw": actual}
            
            # Check all expected keys exist
            if isinstance(exp_json, dict):
                passed = all(k in act_json for k in exp_json.keys())
                score = sum(1 for k in exp_json.keys() if k in act_json) / len(exp_json)
            else:
                passed = False
                score = 0.0
            return passed, score
        except json.JSONDecodeError:
            # Fallback: treat as exact match
            return EvalValidator.exact_match(expected, actual)
    
    @staticmethod
    def regex(expected: str, actual: str) -> tuple[bool, float]:
        """Regex pattern match."""
        try:
            pattern = re.compile(expected, re.IGNORECASE)
            match = pattern.search(actual)
            passed = match is not None
            score = 1.0 if passed else 0.0
            return passed, score
        except re.error:
            return False, 0.0
    
    @staticmethod
    def llm_judge(expected: str, actual: str, llm_client=None) -> tuple[bool, float]:
        """Last resort: use LLM to judge correctness.
        
        WARNING: This defeats the purpose of objective evaluation.
        Only use when no other validator works.
        """
        if llm_client is None:
            return False, 0.0
        
        judge_prompt = f"""You are evaluating whether an LLM response is correct.

Expected output: {expected}

Actual output: {actual}

Is the actual output correct? Consider:
- Does it contain the key information from the expected output?
- Is it factually consistent?
- Is the format appropriate?

Respond with ONLY a number between 0 and 1, where 1 means perfectly correct."""
        
        try:
            response = llm_client.generate(judge_prompt)
            # Extract number from response
            numbers = re.findall(r'0?\.?\d+', response)
            if numbers:
                score = float(numbers[0])
                score = min(max(score, 0.0), 1.0)
                return score >= 0.5, score
        except Exception:
            pass
        return False, 0.0


class EvalSuite:
    """A collection of test cases that define an evaluation benchmark."""
    
    def __init__(
        self,
        name: str,
        description: str = "",
        test_cases: Optional[List[TestCase]] = None,
        pass_threshold: float = 0.8,
    ):
        self.name = name
        self.description = description
        self.test_cases = test_cases or []
        self.pass_threshold = pass_threshold
    
    def add_test(self, test: TestCase) -> None:
        self.test_cases.append(test)
    
    def add_tests(self, tests: List[TestCase]) -> None:
        self.test_cases.extend(tests)
    
    def run(
        self,
        run_fn: Callable[[str], str],
        validator: Callable[[str, str], tuple[bool, float]] = None,
        llm_client=None,
    ) -> EvalSuiteResult:
        """
        Run all test cases through a run function.
        
        Args:
            run_fn: Function that takes input and returns output
            validator: Optional custom validator override
            llm_client: LLM client for llm_judge validator
        
        Returns:
            EvalSuiteResult with pass/fail counts and per-test results
        """
        import time
        start = time.time()
        
        results = []
        passed = 0
        failed = 0
        
        for tc in self.test_cases:
            try:
                actual = run_fn(tc.input)
                
                # Determine which validator to use
                if validator:
                    is_passed, score = validator(tc.expected, actual)
                else:
                    is_passed, score = self._validate(tc, actual, llm_client)
                
                if is_passed:
                    passed += 1
                else:
                    failed += 1
                
                results.append(TestResult(
                    test_id=tc.id,
                    input=tc.input,
                    expected=tc.expected,
                    actual=actual,
                    passed=is_passed,
                    score=score,
                ))
            except Exception as e:
                failed += 1
                results.append(TestResult(
                    test_id=tc.id,
                    input=tc.input,
                    expected=tc.expected,
                    actual="",
                    passed=False,
                    score=0.0,
                    error=str(e),
                ))
        
        total = len(self.test_cases)
        pass_rate = passed / total if total > 0 else 0.0
        
        return EvalSuiteResult(
            suite_name=self.name,
            total_tests=total,
            passed=passed,
            failed=failed,
            pass_rate=pass_rate,
            results=results,
            latency_ms=(time.time() - start) * 1000,
        )
    
    def _validate(
        self,
        test_case: TestCase,
        actual: str,
        llm_client=None,
    ) -> tuple[bool, float]:
        """Validate actual output against expected using the test case's validator."""
        validator_map = {
            ValidatorType.EXACT: EvalValidator.exact_match,
            ValidatorType.CONTAINS: EvalValidator.contains,
            ValidatorType.JSON_STRUCT: EvalValidator.json_struct,
            ValidatorType.REGEX: EvalValidator.regex,
            ValidatorType.LLM_JUDGE: EvalValidator.llm_judge,
        }
        
        validator_fn = validator_map.get(test_case.validator, EvalValidator.exact_match)
        
        if test_case.validator == ValidatorType.LLM_JUDGE:
            return validator_fn(test_case.expected, actual, llm_client)
        else:
            return validator_fn(test_case.expected, actual)
    
    def __len__(self) -> int:
        return len(self.test_cases)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "test_cases": [
                {
                    "id": tc.id,
                    "input": tc.input,
                    "expected": tc.expected,
                    "validator": tc.validator.value,
                }
                for tc in self.test_cases
            ],
            "pass_threshold": self.pass_threshold,
            "total_tests": len(self.test_cases),
        }


class EvalSuiteRegistry:
    """Registry of pre-built eval suites for common tasks."""
    
    _suites: Dict[str, EvalSuite] = {}
    
    @classmethod
    def register(cls, suite: EvalSuite) -> None:
        cls._suites[suite.name] = suite
    
    @classmethod
    def get(cls, name: str) -> Optional[EvalSuite]:
        return cls._suites.get(name)
    
    @classmethod
    def list_suites(cls) -> List[str]:
        return list(cls._suites.keys())


# Pre-built eval suites for common use cases

def create_classification_suite(
    name: str,
    categories: List[str],
    test_cases: List[Dict[str, str]],
) -> EvalSuite:
    """Create an eval suite for classification tasks.
    
    Args:
        name: Name of the suite
        categories: List of valid categories
        test_cases: List of {"input": "...", "expected": "..."}
    """
    suite = EvalSuite(
        name=name,
        description=f"Classification into {len(categories)} categories",
        pass_threshold=0.8,
    )
    
    for i, tc in enumerate(test_cases):
        suite.add_test(TestCase(
            id=f"tc-{i}",
            input=tc["input"],
            expected=tc["expected"],
            validator=ValidatorType.EXACT,
        ))
    
    EvalSuiteRegistry.register(suite)
    return suite


def create_extraction_suite(
    name: str,
    test_cases: List[Dict[str, str]],
) -> EvalSuite:
    """Create an eval suite for information extraction tasks."""
    suite = EvalSuite(
        name=name,
        description="Information extraction",
        pass_threshold=0.8,
    )
    
    for i, tc in enumerate(test_cases):
        suite.add_test(TestCase(
            id=f"tc-{i}",
            input=tc["input"],
            expected=tc["expected"],
            validator=ValidatorType.JSON_STRUCT,
        ))
    
    EvalSuiteRegistry.register(suite)
    return suite


def create_qa_suite(
    name: str,
    test_cases: List[Dict[str, str]],
    allow_contains: bool = True,
) -> EvalSuite:
    """Create an eval suite for Q&A tasks."""
    suite = EvalSuite(
        name=name,
        description="Question answering",
        pass_threshold=0.8,
    )
    
    for i, tc in enumerate(test_cases):
        suite.add_test(TestCase(
            id=f"tc-{i}",
            input=tc["input"],
            expected=tc["expected"],
            validator=ValidatorType.CONTAINS if allow_contains else ValidatorType.EXACT,
        ))
    
    EvalSuiteRegistry.register(suite)
    return suite


# ═══════════════════════════════════════════════════════════════════════════════
# PRE-BUILT SUITES — Drop-in eval suites for common use cases
# ═══════════════════════════════════════════════════════════════════════════════

# Customer Support Classification Suite
_CUSTOMER_SUPPORT_TESTS = [
    {"input": "I can't log into my account and I've tried resetting my password three times", "expected": "technical"},
    {"input": "Can I upgrade my plan to premium? What's the difference in pricing?", "expected": "billing"},
    {"input": "The API is returning 500 errors when I try to create a new user", "expected": "technical"},
    {"input": "I'd like to cancel my subscription and get a refund", "expected": "billing"},
    {"input": "Can you add more users to our team account?", "expected": "feature_request"},
    {"input": "Your app crashes every time I open the settings page", "expected": "technical"},
    {"input": "How much does the enterprise plan cost?", "expected": "billing"},
    {"input": "I'd love to see dark mode added to the dashboard", "expected": "feature_request"},
    {"input": "The export feature isn't working - it just spins forever", "expected": "technical"},
    {"input": "Can I change my account email?", "expected": "billing"},
    {"input": "We need SSO integration with Okta", "expected": "feature_request"},
    {"input": "Your integration with Slack keeps disconnecting", "expected": "technical"},
    {"input": "What's the process for getting a demo?", "expected": "feature_request"},
    {"input": "I was charged twice this month", "expected": "billing"},
    {"input": "The mobile app doesn't show my recent projects", "expected": "technical"},
]
create_classification_suite(
    "customer-support-classifier",
    ["technical", "billing", "feature_request", "complaint", "praise"],
    _CUSTOMER_SUPPORT_TESTS,
)

# Sentiment Analysis Suite
_SENTIMENT_TESTS = [
    {"input": "This product is amazing! Best purchase I've ever made.", "expected": "positive"},
    {"input": "Terrible experience. Would not recommend to anyone.", "expected": "negative"},
    {"input": "It was okay, nothing special.", "expected": "neutral"},
    {"input": "Absolutely love the new features!", "expected": "positive"},
    {"input": "Very disappointed with the quality.", "expected": "negative"},
    {"input": "Does what it's supposed to do.", "expected": "neutral"},
    {"input": "Exceeded all my expectations!", "expected": "positive"},
    {"input": "Waste of money. Completely broken.", "expected": "negative"},
]
create_classification_suite(
    "sentiment-analysis",
    ["positive", "negative", "neutral"],
    _SENTIMENT_TESTS,
)

# Entity Extraction Suite
_ENTITY_TESTS = [
    {
        "input": "John Smith from Acme Corp can be reached at john@acme.com or 555-1234",
        "expected": json.dumps({"name": "John Smith", "company": "Acme Corp", "email": "john@acme.com"}),
    },
    {
        "input": "Contact Sarah at sarah.jones@gmail.com for questions",
        "expected": json.dumps({"name": "Sarah", "email": "sarah.jones@gmail.com"}),
    },
    {
        "input": "Our headquarters are at 123 Main St, San Francisco, CA 94102",
        "expected": json.dumps({"address": "123 Main St, San Francisco, CA 94102"}),
    },
]
create_extraction_suite("entity-extraction", _ENTITY_TESTS)

# Summarization Suite (uses contains validator)
_QA_TESTS = [
    {"input": "What is Python? Python is a high-level programming language.", "expected": "high-level programming language"},
    {"input": "Define machine learning. Machine learning is a subset of AI.", "expected": "subset of AI"},
    {"input": "What does HTTP stand for? HTTP stands for HyperText Transfer Protocol.", "expected": "HyperText Transfer Protocol"},
]
create_qa_suite("summarization", _QA_TESTS, allow_contains=True)


# ═══════════════════════════════════════════════════════════════════════════════
# FACTORY FUNCTION — Create eval suite from user config
# ═══════════════════════════════════════════════════════════════════════════════

def create_eval_suite_from_config(config: Dict[str, Any]) -> EvalSuite:
    """Create an EvalSuite from a configuration dictionary.
    
    Config format:
    {
        "name": "my-suite",
        "description": "...",
        "test_cases": [
            {"input": "...", "expected": "...", "validator": "exact|contains|json_struct|regex"},
        ],
        "pass_threshold": 0.8,
    }
    """
    suite = EvalSuite(
        name=config.get("name", "custom-suite"),
        description=config.get("description", ""),
        pass_threshold=config.get("pass_threshold", 0.8),
    )
    
    for i, tc_config in enumerate(config.get("test_cases", [])):
        validator_str = tc_config.get("validator", "exact")
        try:
            validator = ValidatorType(validator_str)
        except ValueError:
            validator = ValidatorType.EXACT
        
        suite.add_test(TestCase(
            id=tc_config.get("id", f"tc-{i}"),
            input=tc_config["input"],
            expected=tc_config["expected"],
            validator=validator,
            metadata=tc_config.get("metadata", {}),
        ))
    
    return suite
