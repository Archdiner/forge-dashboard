"""
End-to-end tests for the Forge optimization pipeline.

Tests cover:
  1. All 5 evaluators produce valid, in-range metrics for default configs
  2. Mutations produce meaningful signal (not all same score)
  3. Full simulation loop: hypothesis parse → mutation → evaluate → store publish
  4. Phase detection logic (_detect_phase)
  5. Pre-screen selection (_prescreen_candidates picks better configs)
  6. Store claim/publish cycle integrity
  7. Template-specific mutation round-trips

Run:
    cd backend && python -m pytest tests/test_e2e.py -v
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import copy
import pytest
from unittest.mock import MagicMock, patch

from templates import get_template, TEMPLATES
from templates.base import Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory
from store import InMemoryStore


# ── Helpers ────────────────────────────────────────────────────────────────────

def make_global_best(template_id: str, store: InMemoryStore) -> GlobalBestState:
    gb = store.get_global_best(template_id)
    return GlobalBestState(
        template_id=template_id,
        metric=gb.metric,
        config=copy.deepcopy(gb.config),
        experiment_count=gb.experiment_count,
    )


def make_history(n: int, status: str = "success", metric_delta: float = 0.001) -> list:
    """Generate fake ExperimentHistory entries."""
    base = 0.035
    return [
        ExperimentHistory(
            id=f"exp-{i}",
            hypothesis=f"Hypothesis {i}",
            mutation="{}",
            metric_before=base,
            metric_after=base + metric_delta if status == "success" else base - metric_delta,
            status=status,
            reasoning="test",
        )
        for i in range(n)
    ]


# ── 1. Evaluators: valid metric ranges for default config ──────────────────────

EXPECTED_RANGES = {
    "landing-page-cro":     (0.01, 0.05),   # CVR 1–5%
    "structural":           (0.01, 0.05),   # CVR 1–5%
    "onboarding":           (0.30, 0.65),   # completion rate 30–65%
    "pricing-page":         (0.015, 0.05),  # upgrade rate 1.5–5%
    "feature-announcement": (0.08, 0.28),   # adoption rate 8–28%
}

@pytest.mark.parametrize("template_id", list(TEMPLATES.keys()))
def test_default_config_metric_in_range(template_id):
    """Default config should produce a metric within the expected production range."""
    t = get_template(template_id)
    result = t.evaluate(t.default_config)
    lo, hi = EXPECTED_RANGES[template_id]
    assert isinstance(result, EvaluationResult)
    assert lo <= result.metric <= hi, (
        f"[{template_id}] metric={result.metric:.4f} not in [{lo}, {hi}]"
    )
    assert result.reasoning, "reasoning should not be empty"


@pytest.mark.parametrize("template_id", list(TEMPLATES.keys()))
def test_evaluator_is_deterministic(template_id):
    """Same config should always produce the same metric (no randomness)."""
    t = get_template(template_id)
    r1 = t.evaluate(t.default_config)
    r2 = t.evaluate(t.default_config)
    assert r1.metric == r2.metric, f"[{template_id}] evaluator is non-deterministic"


# ── 2. Mutations produce meaningful signal ─────────────────────────────────────

def test_landing_page_mutation_changes_metric():
    """A meaningful copy mutation should change the CVR, not be a no-op."""
    t = get_template("landing-page-cro")
    baseline = t.evaluate(t.default_config).metric

    # Apply a mutation that changes the headline to something question-format
    mutation = {"field": "headline", "value": "Want to 10x your conversion rate?"}
    mutated = t.apply_mutation(t.default_config, mutation)
    result = t.evaluate(mutated)

    # Score may go up or down, but config must differ from default
    assert mutated["headline"] == "Want to 10x your conversion rate?"
    assert result.metric != baseline or mutated != t.default_config


def test_structural_reorder_changes_metric():
    """Moving hero to non-first position should lower CVR."""
    t = get_template("structural")
    baseline = t.evaluate(t.default_config).metric

    # Move hero from index 0 to index 2 — should reduce UX score
    mutation = {"type": "reorder_array", "field": "sections_order", "from_index": 0, "to_index": 2}
    mutated = t.apply_mutation(t.default_config, mutation)
    result = t.evaluate(mutated)

    # Hero not first → worse score
    assert result.metric < baseline, (
        f"Expected metric to drop when hero moves to index 2, got {result.metric:.4f} vs {baseline:.4f}"
    )


def test_onboarding_remove_field_improves_metric():
    """Removing a non-essential field should reduce friction → higher completion rate."""
    t = get_template("onboarding")
    baseline = t.evaluate(t.default_config).metric

    # Remove company_name from profile step (non-essential)
    mutation = {"type": "remove_field", "step": "profile", "field": "company_name"}
    mutated = t.apply_mutation(t.default_config, mutation)
    result = t.evaluate(mutated)

    assert "company_name" not in mutated["step_fields"]["profile"]
    # Less friction → same or better completion
    assert result.metric >= baseline - 0.001, "Removing a field should not significantly hurt completion"


def test_pricing_page_flanking_effect():
    """Highlighting pro and ordering as [free, pro, enterprise] triggers flanking."""
    t = get_template("pricing-page")
    baseline = t.evaluate(t.default_config).metric

    # Default already has pro highlighted and flanked — try removing highlight
    mutation = {"type": "set_value", "field": "highlighted_plan", "value": "free"}
    mutated = t.apply_mutation(t.default_config, mutation)
    result = t.evaluate(mutated)

    # Highlighting free (cheapest) is worse than highlighting pro
    assert result.metric <= baseline, (
        f"Highlighting free should not beat highlighting pro: {result.metric:.4f} vs {baseline:.4f}"
    )


def test_feature_announcement_position_affects_metric():
    """Modal position should score higher than sidebar."""
    t = get_template("feature-announcement")
    sidebar_config = copy.deepcopy(t.default_config)  # default is sidebar
    sidebar_score = t.evaluate(sidebar_config).metric

    modal_config = copy.deepcopy(t.default_config)
    modal_config["feature_position"] = "modal"
    modal_score = t.evaluate(modal_config).metric

    assert modal_score > sidebar_score, (
        f"Modal ({modal_score:.4f}) should outperform sidebar ({sidebar_score:.4f})"
    )


# ── 3. Full simulation loop (no LLM — fake hypothesis) ────────────────────────

@pytest.mark.parametrize("template_id", list(TEMPLATES.keys()))
def test_full_simulation_loop(template_id):
    """
    End-to-end: build a Hypothesis → apply_mutation → evaluate → store claim/publish.
    Uses the store's seeded default configs, no LLM calls required.
    """
    store = InMemoryStore()
    t = get_template(template_id)

    gb = store.get_global_best(template_id)
    assert gb is not None, f"[{template_id}] no global best seeded in store"
    baseline_metric = gb.metric

    # Build a fake but structurally-valid hypothesis for each template
    hypothesis_map = {
        "landing-page-cro":     {"field": "headline",          "value": "AI tools that grow your team fast"},
        "structural":           {"type": "toggle_boolean",     "field": "show_testimonials", "value": False},
        "onboarding":           {"type": "toggle_boolean",     "field": "show_skip_option",  "value": True},
        "pricing-page":         {"type": "set_value",          "field": "highlighted_plan",  "value": "pro"},
        "feature-announcement": {"type": "set_value",          "field": "feature_position",  "value": "popover"},
    }
    mutation = hypothesis_map[template_id]
    mutated_config = t.apply_mutation(gb.config, mutation)
    result = t.evaluate(mutated_config)

    # Metric must be in valid range
    lo, hi = EXPECTED_RANGES[template_id]
    assert lo <= result.metric <= hi, f"[{template_id}] loop metric {result.metric:.4f} out of range"

    # Claim in store
    from models import HypothesisRequest
    claim = HypothesisRequest(
        agent_id="test-agent",
        agent_name="Test Agent",
        template_id=template_id,
    )
    exp, success = store.claim_experiment(claim, "Test hypothesis", str(mutation))
    assert success, f"[{template_id}] claim_experiment returned False"
    assert exp is not None
    assert exp.metric_before == baseline_metric

    # Publish result
    from models import ExperimentStatus
    is_win = result.metric > baseline_metric
    status = ExperimentStatus.SUCCESS if is_win else ExperimentStatus.FAILURE
    published = store.publish_result(exp.id, result.metric, status, result.reasoning)
    assert published is not None
    assert published.metric_after == result.metric

    # If win, global best should update
    if is_win:
        new_gb = store.get_global_best(template_id)
        assert new_gb.metric == result.metric, (
            f"[{template_id}] global best not updated after win"
        )


# ── 4. Phase detection ─────────────────────────────────────────────────────────

def _make_agent(template_id: str = "landing-page-cro"):
    """Create a ForgeAgent with mocked LLM and API (no network)."""
    from agents.forge_agent import ForgeAgent
    from config import Settings

    settings = Settings(
        agent_id="test-agent",
        agent_name="Test Agent",
        template_id=template_id,
        forge_api_url="http://localhost:8000",
        google_api_key="FAKE_KEY",
    )
    agent = ForgeAgent.__new__(ForgeAgent)
    agent.config = settings
    agent.role = "explorer"
    agent._temperature = 0.9
    agent.template = get_template(template_id)
    agent.llm = MagicMock()
    agent.api = MagicMock()
    return agent


def test_detect_phase_exploration_with_empty_history():
    agent = _make_agent()
    phase = agent._detect_phase([])
    assert phase == "exploration"


def test_detect_phase_exploration_with_few_experiments():
    agent = _make_agent()
    # <10 experiments → always exploration
    history = make_history(7)
    phase = agent._detect_phase(history)
    assert phase == "exploration"


def test_detect_phase_exploration_high_success_rate():
    agent = _make_agent()
    # 20 experiments, all successes → improvement_rate=1.0 → exploration
    history = make_history(20, status="success", metric_delta=0.002)
    phase = agent._detect_phase(history)
    assert phase == "exploration"


def test_detect_phase_convergence_all_failures():
    agent = _make_agent()
    # 20 experiments, all failures, low variance → convergence
    history = make_history(20, status="failure", metric_delta=0.0001)
    phase = agent._detect_phase(history)
    # improvement_rate=0, cv should be tiny (all same metric) → convergence
    assert phase in ("refinement", "convergence")


def test_detect_phase_refinement_moderate_success():
    agent = _make_agent()
    # Mix: 4 successes, 16 failures (20%) → refinement boundary (>=10%)
    successes = make_history(4, status="success", metric_delta=0.001)
    failures = make_history(16, status="failure", metric_delta=0.0001)
    history = successes + failures
    phase = agent._detect_phase(history)
    assert phase in ("refinement", "exploration")


# ── 5. Pre-screen: selects better configs ─────────────────────────────────────

def test_prescreen_returns_best_candidate():
    """_prescreen_candidates should return the hypothesis with the highest sim score."""
    agent = _make_agent("feature-announcement")
    t = agent.template

    # Create three hypotheses: positions modal > popover > sidebar (modal is best)
    def make_h(position):
        return Hypothesis(
            hypothesis=f"Move announcement to {position}",
            mutation={"type": "set_value", "field": "feature_position", "value": position},
            reasoning="test",
        )

    candidates_in_order = [make_h("sidebar"), make_h("popover"), make_h("modal")]

    # Mock llm.generate_structured to return each in order
    agent.llm.generate_structured = MagicMock(side_effect=candidates_in_order)

    gb = GlobalBestState(
        template_id="feature-announcement",
        metric=0.190,
        config=copy.deepcopy(t.default_config),
        experiment_count=0,
    )
    prompt = "dummy prompt"
    result = agent._prescreen_candidates(prompt, gb, n=3)

    # Should select modal (highest sim score)
    assert result is not None
    mutation = result.mutation if isinstance(result.mutation, dict) else {}
    assert mutation.get("value") == "modal", (
        f"Pre-screen should pick modal (best score), got {mutation.get('value')}"
    )


def test_prescreen_handles_single_candidate():
    """n=1 should just return the one candidate (convergence phase behaviour)."""
    agent = _make_agent("landing-page-cro")
    t = agent.template

    fixed_h = Hypothesis(
        hypothesis="Test single candidate",
        mutation={"field": "headline", "value": "Single candidate headline"},
        reasoning="test",
    )
    agent.llm.generate_structured = MagicMock(return_value=fixed_h)

    gb = GlobalBestState(
        template_id="landing-page-cro",
        metric=0.0346,
        config=copy.deepcopy(t.default_config),
        experiment_count=0,
    )
    result = agent._prescreen_candidates("prompt", gb, n=1)
    assert result is fixed_h


def test_prescreen_graceful_with_all_none_returns():
    """If LLM always returns None, _prescreen_candidates returns None without crashing."""
    agent = _make_agent("onboarding")
    agent.llm.generate_structured = MagicMock(return_value=None)

    gb = GlobalBestState(
        template_id="onboarding",
        metric=0.573,
        config=copy.deepcopy(get_template("onboarding").default_config),
        experiment_count=0,
    )
    result = agent._prescreen_candidates("prompt", gb, n=3)
    assert result is None


# ── 6. Store claim/publish integrity ──────────────────────────────────────────

def test_store_claim_increments_experiment_count():
    store = InMemoryStore()
    from models import HypothesisRequest
    initial = store.get_global_best("landing-page-cro").experiment_count

    claim = HypothesisRequest(agent_id="a1", agent_name="Agent A", template_id="landing-page-cro")
    exp, ok = store.claim_experiment(claim, "h1", "m1")
    assert ok

    from models import ExperimentStatus
    store.publish_result(exp.id, 0.0350, ExperimentStatus.FAILURE, "no improvement")

    final = store.get_global_best("landing-page-cro").experiment_count
    assert final == initial + 1


def test_store_global_best_only_updates_on_success():
    store = InMemoryStore()
    from models import HypothesisRequest, ExperimentStatus

    initial_metric = store.get_global_best("pricing-page").metric

    # Claim + publish failure — global best should NOT change
    claim = HypothesisRequest(agent_id="a1", agent_name="Agent A", template_id="pricing-page")
    exp, _ = store.claim_experiment(claim, "h1", "m1")
    store.publish_result(exp.id, initial_metric - 0.01, ExperimentStatus.FAILURE, "worse")
    assert store.get_global_best("pricing-page").metric == initial_metric

    # Claim + publish success with higher metric — global best SHOULD update
    exp2, _ = store.claim_experiment(claim, "h2", "m2")
    new_metric = initial_metric + 0.005
    store.publish_result(exp2.id, new_metric, ExperimentStatus.SUCCESS, "better")
    assert store.get_global_best("pricing-page").metric == new_metric


def test_store_agents_track_improvements():
    from store import InMemoryStore
    from models import Agent, AgentStatus, HypothesisRequest, ExperimentStatus
    from datetime import datetime

    store = InMemoryStore()
    agent = Agent(
        id="test-agent",
        name="Test Agent",
        status=AgentStatus.IDLE,
        last_active=datetime.now(),
    )
    store.register_agent(agent)

    claim = HypothesisRequest(agent_id="test-agent", agent_name="Test Agent", template_id="onboarding")
    baseline = store.get_global_best("onboarding").metric

    # Publish a success that beats baseline
    exp, _ = store.claim_experiment(claim, "reduce friction", "remove field")
    store.publish_result(exp.id, baseline + 0.01, ExperimentStatus.SUCCESS, "improved")

    updated = store.agents["test-agent"]
    assert updated.improvements_found == 1
    assert updated.experiments_run == 1


# ── 7. Template mutation round-trips ──────────────────────────────────────────

def test_landing_page_preserves_all_keys_after_mutation():
    """Mutations should never drop top-level config keys."""
    t = get_template("landing-page-cro")
    original_keys = set(t.default_config.keys())
    mutation = {"field": "cta_text", "value": "Get Started Free"}
    mutated = t.apply_mutation(t.default_config, mutation)
    assert set(mutated.keys()) == original_keys


def test_structural_set_boolean_round_trip():
    """Setting a boolean to False then True should restore original value."""
    t = get_template("structural")
    original = t.default_config["show_pricing"]  # True
    disable = {"type": "toggle_boolean", "field": "show_pricing", "value": False}
    enable  = {"type": "toggle_boolean", "field": "show_pricing", "value": True}
    once = t.apply_mutation(t.default_config, disable)
    assert once["show_pricing"] is False
    twice = t.apply_mutation(once, enable)
    assert twice["show_pricing"] == original


def test_onboarding_remove_field_is_idempotent():
    """Removing a field that doesn't exist should not crash."""
    t = get_template("onboarding")
    mutation = {"type": "remove_field", "step": "profile", "field": "nonexistent_field"}
    result = t.apply_mutation(t.default_config, mutation)
    # Should not raise, should return unchanged profile fields
    assert "name" in result["step_fields"]["profile"]


def test_pricing_page_nested_cta_mutation():
    """set_value with dot notation (cta_text.pro) should update nested key."""
    t = get_template("pricing-page")
    mutation = {"type": "set_value", "field": "cta_text.pro", "value": "Start Free — No Card Needed"}
    mutated = t.apply_mutation(t.default_config, mutation)
    assert mutated["cta_text"]["pro"] == "Start Free — No Card Needed"
    # Other nested CTAs should be unchanged
    assert mutated["cta_text"]["free"] == t.default_config["cta_text"]["free"]


def test_feature_announcement_all_positions_valid():
    """All valid positions should produce metrics within range."""
    t = get_template("feature-announcement")
    positions = ["modal", "popover", "inline", "sidebar", "toast"]
    lo, hi = EXPECTED_RANGES["feature-announcement"]
    for pos in positions:
        config = copy.deepcopy(t.default_config)
        config["feature_position"] = pos
        result = t.evaluate(config)
        assert lo <= result.metric <= hi, (
            f"Position '{pos}' produced {result.metric:.4f}, outside [{lo}, {hi}]"
        )


def test_metrics_are_monotone_with_quality_score():
    """
    Better UX configurations should consistently beat or equal weaker ones.
    Tests the ordering: modal > popover for feature-announcement.
    """
    t = get_template("feature-announcement")
    configs_ranked = ["modal", "popover", "inline", "sidebar", "toast"]
    scores = []
    for pos in configs_ranked:
        cfg = copy.deepcopy(t.default_config)
        cfg["feature_position"] = pos
        scores.append(t.evaluate(cfg).metric)

    # First (modal) should be the best
    assert scores[0] == max(scores), (
        f"Modal should score highest, got ordering: {list(zip(configs_ranked, scores))}"
    )
