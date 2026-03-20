"""
DCF / Financial Model Optimization Template
============================================
Optimizes DCF model assumptions (growth rates, margins, WACC, multiples)
to maximize IRR or NPV, while keeping assumptions within plausible guardrails.

This is fundamentally different from text-based templates:
  - The "config" is a set of financial assumptions (numbers, not prose)
  - Mutations change individual assumptions by realistic amounts
  - Evaluation runs deterministic DCF math — no LLM involved
  - Success criteria: IRR > user-defined hurdle rate

Use cases:
  - Find the bull/base/bear assumption set for a stock pitch
  - Stress-test: find the minimum growth rate that meets a 20% IRR hurdle
  - Sensitivity: which assumption most affects IRR?
"""

import json
import math
from typing import Any, Dict, List, Optional
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory


class DCFTemplate(BaseTemplate):
    """DCF model optimizer — maximizes IRR within plausible assumption bounds."""

    name = "dcf-model"
    description = "Optimize DCF assumptions for target return (IRR)"
    metric_name = "irr"
    metric_direction = "higher_is_better"

    # ── Default Config ────────────────────────────────────────────────────────
    # Represents a generic growth company entering at 15x EBITDA
    default_config = {
        "company": "Target Company",
        "scenario": "base",                 # base | bull | bear
        "financials": {
            "base_revenue":   100_000_000,  # $100M LTM revenue
            "base_ebitda":     20_000_000,  # $20M LTM EBITDA (20% margin)
        },
        "assumptions": {
            # Revenue growth by year
            "revenue_growth_y1": 0.25,
            "revenue_growth_y2": 0.20,
            "revenue_growth_y3": 0.18,
            "revenue_growth_y4": 0.15,
            "revenue_growth_y5": 0.12,
            # Profitability
            "ebitda_margin":     0.20,      # 20% EBITDA margin (held constant)
            "da_pct_revenue":    0.04,      # D&A as % of revenue
            "tax_rate":          0.25,
            # Capital efficiency
            "capex_pct_revenue": 0.05,      # Maintenance capex
            "nwc_change_pct":    0.02,      # Change in net working capital / revenue
            # Exit / valuation
            "wacc":              0.12,      # Weighted Average Cost of Capital
            "terminal_growth":   0.03,      # Terminal growth rate
            "exit_ev_ebitda":    15.0,      # Exit multiple (EV/EBITDA)
            "entry_ev_ebitda":   12.0,      # Entry multiple (EV/EBITDA)
        },
        "success_target": {
            "metric":    "irr",
            "threshold": 0.20,             # Target: 20% IRR hurdle rate
            "direction": "above",
        },
    }

    # Plausibility guardrail bounds per assumption
    BOUNDS = {
        "revenue_growth_y1": (0.0, 1.0),    # 0–100% growth
        "revenue_growth_y2": (0.0, 0.80),
        "revenue_growth_y3": (0.0, 0.60),
        "revenue_growth_y4": (0.0, 0.50),
        "revenue_growth_y5": (0.0, 0.40),
        "ebitda_margin":     (0.0, 0.60),   # 0–60% EBITDA margin
        "da_pct_revenue":    (0.01, 0.15),
        "tax_rate":          (0.10, 0.40),
        "capex_pct_revenue": (0.01, 0.30),
        "nwc_change_pct":    (0.0,  0.10),
        "wacc":              (0.06, 0.25),
        "terminal_growth":   (0.01, 0.05),
        "exit_ev_ebitda":    (6.0,  30.0),
        "entry_ev_ebitda":   (5.0,  25.0),
    }

    # ── Hypothesis Generation ─────────────────────────────────────────────────

    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        history_text = self.format_history(history)
        assumptions = current_best.config.get("assumptions", {})
        target = current_best.config.get("success_target", {})

        return f"""You are a private equity / investment banking analyst optimizing a DCF model.

GOAL: Maximize IRR while keeping all assumptions within realistic, defensible bounds.

CURRENT BEST ASSUMPTIONS (IRR = {current_best.metric:.1%}):
- Revenue growth: Y1={assumptions.get('revenue_growth_y1', 0):.0%}, Y2={assumptions.get('revenue_growth_y2', 0):.0%}, Y3={assumptions.get('revenue_growth_y3', 0):.0%}, Y4={assumptions.get('revenue_growth_y4', 0):.0%}, Y5={assumptions.get('revenue_growth_y5', 0):.0%}
- EBITDA margin: {assumptions.get('ebitda_margin', 0):.0%}
- WACC: {assumptions.get('wacc', 0):.1%}
- Terminal growth: {assumptions.get('terminal_growth', 0):.1%}
- Exit EV/EBITDA: {assumptions.get('exit_ev_ebitda', 0):.1f}x
- Entry EV/EBITDA: {assumptions.get('entry_ev_ebitda', 0):.1f}x
- CapEx % revenue: {assumptions.get('capex_pct_revenue', 0):.0%}
- Tax rate: {assumptions.get('tax_rate', 0):.0%}

TARGET: {target.get('metric', 'irr').upper()} {target.get('direction', 'above')} {target.get('threshold', 0.20):.0%}

RECENT EXPERIMENTS (what has been tried):
{history_text}

Generate ONE hypothesis for which assumption to change and why it is financially justifiable.
Changes must stay within realistic ranges — do not use hockey-stick assumptions.

Respond in JSON:
{{
  "hypothesis": "e.g., Increasing exit multiple from 15x to 17x is justifiable because comparable SaaS companies trade at 18-20x today",
  "mutation": "e.g., exit_ev_ebitda: 17.0",
  "reasoning": "e.g., Peer group median is 18x; 17x represents a 5% discount to peers"
}}

Only change ONE assumption per hypothesis. Focus on assumptions with the highest IRR sensitivity."""

    def parse_hypothesis(self, response: str) -> Hypothesis:
        text = response.strip().lstrip("```json").lstrip("```").rstrip("```")
        try:
            data = json.loads(text.strip())
            if isinstance(data, list):
                data = data[0]
            return Hypothesis(**data)
        except Exception:
            return Hypothesis(
                hypothesis="Testing higher exit multiple",
                mutation="exit_ev_ebitda: 16.0",
                reasoning="Exit multiple expansion from 15x to 16x improves IRR"
            )

    # ── Mutation ──────────────────────────────────────────────────────────────

    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        """
        Parse the agent's mutation string and apply it to the assumptions dict.

        Expected mutation format: "assumption_name: value"
        Examples:
          "exit_ev_ebitda: 17.0"
          "revenue_growth_y1: 0.30"
          "ebitda_margin: 0.22"
        """
        new_config = {**config}
        assumptions = {**config.get("assumptions", {})}

        if isinstance(mutation, dict):
            # Structured format: {"field": "exit_ev_ebitda", "value": 17.0}
            if "field" in mutation and "value" in mutation:
                key = str(mutation["field"]).strip()
                if key in assumptions:
                    lo, hi = self.BOUNDS.get(key, (float("-inf"), float("inf")))
                    assumptions[key] = max(lo, min(hi, float(mutation["value"])))
                    new_config["assumptions"] = assumptions
            else:
                # Flat format: {"exit_ev_ebitda": 17.0, ...}
                for k, v in mutation.items():
                    if k in assumptions:
                        lo, hi = self.BOUNDS.get(k, (float("-inf"), float("inf")))
                        assumptions[k] = max(lo, min(hi, float(v)))
                new_config["assumptions"] = assumptions
            return new_config

        # Parse "key: value" string from LLM
        import re
        match = re.search(r"([\w_]+)\s*[:\s=]\s*([\d.]+)", str(mutation))
        if match:
            key = match.group(1).strip()
            value = float(match.group(2))
            if key in assumptions:
                lo, hi = self.BOUNDS.get(key, (float("-inf"), float("inf")))
                assumptions[key] = max(lo, min(hi, value))
                new_config["assumptions"] = assumptions

        return new_config

    # ── Evaluation ────────────────────────────────────────────────────────────

    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """
        Deterministic DCF computation. llm not used.

        Steps:
          1. Build 5-year revenue and EBITDA projections
          2. Compute Free Cash Flow each year (NOPAT + D&A - CapEx - ΔNWC)
          3. Terminal Value using Gordon Growth Model
          4. Entry price from entry_ev_ebitda × base_ebitda
          5. IRR from cash flow stream [-entry, FCF1..5 + TV]
          6. Guardrails: all assumptions within bounds, WACC > terminal growth
        """
        assumptions = asset.get("assumptions", {})
        financials = asset.get("financials", {})

        guardrail_failures = self._check_guardrails(assumptions)
        if guardrail_failures:
            return EvaluationResult(
                metric=-1.0,
                reasoning=f"Guardrail failed: {'; '.join(guardrail_failures)}"
            )

        base_revenue = financials.get("base_revenue", 100_000_000)
        base_ebitda  = financials.get("base_ebitda",   20_000_000)

        growth_rates = [
            assumptions.get(f"revenue_growth_y{i}", 0.15)
            for i in range(1, 6)
        ]
        ebitda_margin   = assumptions.get("ebitda_margin",     0.20)
        da_pct          = assumptions.get("da_pct_revenue",    0.04)
        tax_rate        = assumptions.get("tax_rate",          0.25)
        capex_pct       = assumptions.get("capex_pct_revenue", 0.05)
        nwc_pct         = assumptions.get("nwc_change_pct",    0.02)
        wacc            = assumptions.get("wacc",              0.12)
        terminal_growth = assumptions.get("terminal_growth",   0.03)
        exit_multiple   = assumptions.get("exit_ev_ebitda",   15.0)
        entry_multiple  = assumptions.get("entry_ev_ebitda",  12.0)

        # Build revenue and FCF projections
        revenues = []
        rev = base_revenue
        for g in growth_rates:
            rev = rev * (1 + g)
            revenues.append(rev)

        fcfs = []
        for rev in revenues:
            ebitda = rev * ebitda_margin
            da     = rev * da_pct
            ebit   = ebitda - da
            nopat  = ebit * (1 - tax_rate)
            capex  = rev * capex_pct
            dnwc   = rev * nwc_pct
            fcf    = nopat + da - capex - dnwc
            fcfs.append(fcf)

        # Terminal value (Gordon Growth on Year 5 FCF)
        if wacc <= terminal_growth:
            return EvaluationResult(metric=-1.0, reasoning="WACC must exceed terminal growth rate")

        tv = fcfs[-1] * (1 + terminal_growth) / (wacc - terminal_growth)

        # Exit proceeds = exit EV/EBITDA × Year 5 EBITDA
        exit_ebitda = revenues[-1] * ebitda_margin
        exit_ev     = exit_multiple * exit_ebitda
        # Equity proceeds ~ exit_ev (assuming same capital structure / no debt for simplicity)
        exit_proceeds = (exit_ev + tv) / 2   # blend exit multiple + DCF terminal value

        # Entry price
        entry_price = entry_multiple * base_ebitda

        # Cash flows: [-entry, fcf1, fcf2, fcf3, fcf4, fcf5 + exit]
        cash_flows = [-entry_price] + fcfs[:-1] + [fcfs[-1] + exit_proceeds]

        irr = self._calculate_irr(cash_flows)

        # Secondary metrics
        npv_at_wacc = sum(cf / (1 + wacc) ** t for t, cf in enumerate(cash_flows))
        moic = (entry_price + sum(fcfs) + exit_proceeds) / entry_price

        reasoning = (
            f"IRR: {irr:.1%} | MOIC: {moic:.1f}x | Entry: {entry_multiple:.1f}x EV/EBITDA | "
            f"Exit: {exit_multiple:.1f}x | Rev CAGR: {self._cagr(revenues, base_revenue):.1%} | "
            f"EBITDA margin: {ebitda_margin:.0%} | WACC: {wacc:.1%}"
        )

        return EvaluationResult(metric=round(irr, 4), reasoning=reasoning)

    def _check_guardrails(self, assumptions: Dict[str, float]) -> List[str]:
        failures = []
        for key, (lo, hi) in self.BOUNDS.items():
            val = assumptions.get(key)
            if val is None:
                continue
            if val < lo:
                failures.append(f"{key}={val:.3f} below minimum {lo}")
            if val > hi:
                failures.append(f"{key}={val:.3f} above maximum {hi}")
        # Ensure growth rates are non-increasing (plausibility)
        growth_keys = [f"revenue_growth_y{i}" for i in range(1, 6)]
        growths = [assumptions.get(k, 0) for k in growth_keys]
        for i in range(1, len(growths)):
            if growths[i] > growths[i - 1] + 0.05:
                failures.append(f"Growth rate acceleration Y{i}→Y{i+1} exceeds 5pp — not plausible")
        return failures

    def _calculate_irr(self, cash_flows: List[float], guess: float = 0.15) -> float:
        """Newton-Raphson IRR solver."""
        r = guess
        for _ in range(500):
            npv  = sum(cf / (1 + r) ** t for t, cf in enumerate(cash_flows))
            dnpv = sum(-t * cf / (1 + r) ** (t + 1) for t, cf in enumerate(cash_flows) if t > 0)
            if abs(dnpv) < 1e-12:
                break
            r_new = r - npv / dnpv
            if abs(r_new - r) < 1e-8:
                return round(r_new, 4)
            r = r_new
        return round(r, 4)

    def _cagr(self, revenues: List[float], base: float) -> float:
        if not revenues or base == 0:
            return 0.0
        return (revenues[-1] / base) ** (1 / len(revenues)) - 1

    # ── Legacy stubs (required by ABC but never called) ───────────────────────

    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        raise NotImplementedError("DCF uses deterministic evaluate(). LLM path not needed.")

    def parse_evaluation(self, response: str) -> EvaluationResult:
        raise NotImplementedError("DCF uses deterministic evaluate(). LLM path not needed.")

    def parse_user_input(self, content: str) -> dict:
        """Parse user's DCF assumptions into config dict."""
        import re
        import copy

        config = copy.deepcopy(self.default_config)

        if not content or not content.strip():
            return config

        assumptions = {}

        # Fields that are rates/percentages (divide by 100 if > 1)
        rate_fields = {
            'revenue_growth_y1': r'revenue.?growth.?y1:?\s*(\d+\.?\d*)',
            'revenue_growth_y2': r'revenue.?growth.?y2:?\s*(\d+\.?\d*)',
            'revenue_growth_y3': r'revenue.?growth.?y3:?\s*(\d+\.?\d*)',
            'ebitda_margin':     r'ebitda.?margin:?\s*(\d+\.?\d*)',
            'wacc':              r'wacc:?\s*(\d+\.?\d*)',
            'tax_rate':          r'tax.?rate:?\s*(\d+\.?\d*)',
            'terminal_growth':   r'terminal.?growth:?\s*(\d+\.?\d*)',
        }
        # Fields that are multiples (keep raw value, never divide)
        multiple_fields = {
            'exit_ev_ebitda':  [r'exit.?ev.?ebitda:?\s*(\d+\.?\d*)', r'exit.?multiple:?\s*(\d+\.?\d*)'],
            'entry_ev_ebitda': [r'entry.?ev.?ebitda:?\s*(\d+\.?\d*)', r'entry.?multiple:?\s*(\d+\.?\d*)'],
        }

        for key, pattern in rate_fields.items():
            m = re.search(pattern, content, re.IGNORECASE)
            if m:
                val = float(m.group(1))
                assumptions[key] = val / 100 if val > 1 else val

        for key, patterns in multiple_fields.items():
            for pattern in patterns:
                m = re.search(pattern, content, re.IGNORECASE)
                if m:
                    assumptions[key] = float(m.group(1))
                    break

        if assumptions:
            config['assumptions'].update(assumptions)

        return config

    def config_to_output(self, config: dict) -> dict:
        """Convert optimized config to readable output."""
        assumptions = config.get('assumptions', {})
        financials = config.get('financials', {})
        
        return {
            "type": "dcf",
            "company": config.get('company', 'Target Company'),
            "scenario": config.get('scenario', 'base'),
            "base_revenue": financials.get('base_revenue', 0),
            "base_ebitda": financials.get('base_ebitda', 0),
            "assumptions": assumptions,
            "rendered": self._render_text(config)
        }

    def _render_text(self, config: dict) -> str:
        """Render DCF as plain text."""
        assumptions = config.get('assumptions', {})
        financials = config.get('financials', {})
        
        parts = [
            f"DCF MODEL: {config.get('company', 'Target Company')}",
            f"Scenario: {config.get('scenario', 'base').upper()}",
            "",
            "Financials:",
            f"  Base Revenue: ${financials.get('base_revenue', 0)/1e6:.1f}M",
            f"  Base EBITDA: ${financials.get('base_ebitda', 0)/1e6:.1f}M ({assumptions.get('ebitda_margin', 0)*100:.0f}% margin)",
            "",
            "Assumptions:",
            f"  Revenue Growth: Y1={assumptions.get('revenue_growth_y1', 0)*100:.0f}%, Y2={assumptions.get('revenue_growth_y2', 0)*100:.0f}%, Y3={assumptions.get('revenue_growth_y3', 0)*100:.0f}%",
            f"  WACC: {assumptions.get('wacc', 0)*100:.1f}%",
            f"  Terminal Growth: {assumptions.get('terminal_growth', 0)*100:.1f}%",
            f"  Exit EV/EBITDA: {assumptions.get('exit_ev_ebitda', 0):.1f}x",
        ]
        return "\n".join(parts)
