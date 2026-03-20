import json
import re
from typing import Any, Dict, List
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory
from evaluators import PortfolioEvaluator


class PortfolioOptimizationTemplate(BaseTemplate):
    """Portfolio optimization template - optimize asset allocation for risk-adjusted returns."""
    
    name = "portfolio-optimization"
    description = "Optimize portfolio asset allocation for risk-adjusted returns"
    metric_name = "sharpe_ratio"
    metric_direction = "higher_is_better"
    
    def __init__(self):
        self.evaluator = PortfolioEvaluator()
    
    default_config = {
        "assets": {
            "US_Equities": 0.20,
            "Intl_Equities": 0.15,
            "Bonds": 0.25,
            "Real_Estate": 0.10,
            "Commodities": 0.05,
            "Cash": 0.25
        },
        "constraints": {
            "max_single_position": 0.40,
            "min_cash": 0.02,
            "rebalance_frequency": "monthly"
        },
        "risk_tolerance": "moderate"
    }
    
    # Simplified expected returns and volatility (annualized)
    ASSET_CLASSES = {
        "US_Equities": {"return": 0.10, "volatility": 0.16},
        "Intl_Equities": {"return": 0.08, "volatility": 0.18},
        "Bonds": {"return": 0.04, "volatility": 0.05},
        "Real_Estate": {"return": 0.07, "volatility": 0.12},
        "Commodities": {"return": 0.05, "volatility": 0.15},
        "Cash": {"return": 0.02, "volatility": 0.01},
    }
    
    def generate_hypothesis_prompt(self, current_best: GlobalBestState, history: List[ExperimentHistory]) -> str:
        history_text = self.format_history(history)
        
        prompt = f"""You are a portfolio optimization agent specializing in asset allocation.

Your task: Generate ONE hypothesis for an experiment that could improve the risk-adjusted return (Sharpe ratio) of a portfolio.

CURRENT BEST ALLOCATION (Sharpe: {current_best.metric:.2f}):
{json.dumps(current_best.config.get('assets', {}), indent=2)}

Constraints:
- Max single position: {current_best.config.get('constraints', {}).get('max_single_position', 0.4)}
- Min cash: {current_best.config.get('constraints', {}).get('min_cash', 0.02)}
- Risk tolerance: {current_best.config.get('risk_tolerance', 'moderate')}

RECENT EXPERIMENTS:
{history_text}

Generate a hypothesis and mutation. Respond in JSON:
{{
  "hypothesis": "what change you think will improve the Sharpe ratio",
  "mutation": "the specific allocation change to make",
  "reasoning": "why this might work"
}}

Focus on:
- Increasing exposure to assets with better risk-adjusted returns
- Diversification benefits
- Correlation reduction between assets
- Risk tolerance alignment"""
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
            
            # mutation can now be a dict - keep it as-is
            return Hypothesis(**data)
        except (json.JSONDecodeError, KeyError) as e:
            print(f"Parse error: {e}")
            return Hypothesis(
                hypothesis="Testing allocation adjustment",
                mutation="Increase US Equities by 5%, decrease Bonds by 5%",
                reasoning="US equities have higher expected returns"
            )
    
    def apply_mutation(self, config: Dict[str, Any], mutation: Any) -> Dict[str, Any]:
        new_config = {**config}
        assets = {**config.get('assets', {})}
        constraints = {**config.get('constraints', {})}
        
        # Handle case where mutation is already a dict
        if isinstance(mutation, dict):
            # Direct allocation override
            for asset_name, weight in mutation.items():
                if asset_name in assets:
                    assets[asset_name] = weight
            
            # Normalize
            total = sum(assets.values())
            if total > 0:
                assets = {k: v/total for k, v in assets.items()}
            
            new_config['assets'] = assets
            return new_config
        
        # Parse string mutation
        import re
        
        increase_match = re.search(r'increase (\w+) by (\d+)%', mutation, re.IGNORECASE)
        decrease_match = re.search(r'decrease (\w+) by (\d+)%', mutation, re.IGNORECASE)
        
        if increase_match:
            asset_name = increase_match.group(1)
            pct = int(increase_match.group(2)) / 100
            
            if asset_name in assets and assets[asset_name] + pct <= constraints.get('max_single_position', 0.4):
                assets[asset_name] = min(assets[asset_name] + pct, constraints.get('max_single_position', 0.4))
                
                # Subtract from bonds or cash
                for fallback in ['Bonds', 'Cash']:
                    if fallback in assets and assets[fallback] >= pct:
                        assets[fallback] -= pct
                        break
        
        elif decrease_match:
            asset_name = decrease_match.group(1)
            pct = int(decrease_match.group(2)) / 100
            
            if asset_name in assets:
                assets[asset_name] = max(assets[asset_name] - pct, 0)
                
                # Add to US equities
                if 'US_Equities' in assets:
                    assets['US_Equities'] += pct
        
        # Normalize to sum to 1.0
        total = sum(assets.values())
        if total > 0:
            assets = {k: v/total for k, v in assets.items()}
        
        new_config['assets'] = assets
        return new_config
    
    def evaluate(self, asset: Dict[str, Any], llm=None) -> EvaluationResult:
        """Deterministic Sharpe ratio calculation. llm not used."""
        allocation = asset.get('assets') or asset.get('weights') or {}
        constraints = asset.get('constraints', {})
        result = self.evaluator.evaluate({'weights': allocation, 'constraints': constraints})
        return EvaluationResult(
            metric=result.metric,
            reasoning=result.details if result.guardrails_passed else f"Guardrail failed: {result.guardrail_failures}"
        )
    
    def generate_evaluation_prompt(self, asset: Dict[str, Any]) -> str:
        """Legacy — not used in the agent loop."""
        return f"Sharpe={self.evaluator.compute_primary(asset.get('assets', asset)):.3f}"

    def parse_evaluation(self, response: str) -> EvaluationResult:
        """Legacy — not used in the agent loop."""
        raise NotImplementedError("Call evaluate(asset) directly instead of the LLM-judge path.")

    def parse_user_input(self, content: str) -> dict:
        """Parse user's portfolio allocation into config dict."""
        import re, copy

        config = copy.deepcopy(self.default_config)

        if not content or not content.strip():
            return config

        # Parse "US Equities: 40%" — allow spaces in asset names
        weights = {}
        for line in content.split('\n'):
            match = re.match(r'([\w][\w\s]*?):\s*(\d+\.?\d*)%?', line.strip())
            if match:
                asset_name = match.group(1).strip()
                weight = float(match.group(2)) / 100
                
                # Normalize asset name
                if 'us' in asset_name.lower() or 'us_equities' in asset_name.lower():
                    weights['US_Equities'] = weight
                elif 'intl' in asset_name.lower() or 'international' in asset_name.lower():
                    weights['Intl_Equities'] = weight
                elif 'bond' in asset_name.lower():
                    weights['Bonds'] = weight
                elif 'real' in asset_name.lower() or 'estate' in asset_name.lower():
                    weights['Real_Estate'] = weight
                elif 'commod' in asset_name.lower():
                    weights['Commodities'] = weight
                elif 'cash' in asset_name.lower():
                    weights['Cash'] = weight
        
        if weights:
            # Normalize to sum to 1.0
            total = sum(weights.values())
            if total > 0:
                weights = {k: v/total for k, v in weights.items()}
                config['assets'] = weights
        
        return config

    def config_to_output(self, config: dict) -> dict:
        """Convert optimized config to readable output."""
        assets = config.get('assets', {})
        return {
            "type": "portfolio",
            "allocations": assets,
            "rendered": self._render_text(config)
        }

    def _render_text(self, config: dict) -> str:
        """Render portfolio as plain text."""
        assets = config.get('assets', {})
        parts = ["PORTFOLIO ALLOCATION:", ""]
        for asset, weight in sorted(assets.items(), key=lambda x: -x[1]):
            parts.append(f"  {asset}: {weight*100:.1f}%")
        parts.append("")
        parts.append(f"Constraints: max position {config.get('constraints', {}).get('max_single_position', 0.4)*100:.0f}%")
        return "\n".join(parts)
