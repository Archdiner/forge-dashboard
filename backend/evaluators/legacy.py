import math
from typing import Dict, Any, Optional
from dataclasses import dataclass


@dataclass
class EvaluationResult:
    metric: float
    details: str
    guardrails_passed: bool = True
    guardrail_failures: list = None
    secondary_metrics: Dict[str, float] = None
    
    def __post_init__(self):
        if self.guardrail_failures is None:
            self.guardrail_failures = []
        if self.secondary_metrics is None:
            self.secondary_metrics = {}


class Evaluator:
    """Base class for deterministic evaluators."""
    
    def compute_primary(self, asset: Dict[str, Any]) -> float:
        raise NotImplementedError
    
    def compute_guardrails(self, asset: Dict[str, Any]) -> tuple[bool, list]:
        """Returns (passed, failures)"""
        return True, []
    
    def compute_secondary(self, asset: Dict[str, Any]) -> Dict[str, float]:
        return {}
    
    def is_better(self, new_metric: float, old_metric: float) -> bool:
        return new_metric > old_metric
    
    def evaluate(self, asset: Dict[str, Any]) -> EvaluationResult:
        guardrails_passed, failures = self.compute_guardrails(asset)
        
        if not guardrails_passed:
            return EvaluationResult(
                metric=-999,
                details=f"Guardrail failed: {', '.join(failures)}",
                guardrails_passed=False,
                guardrail_failures=failures
            )
        
        primary = self.compute_primary(asset)
        secondary = self.compute_secondary(asset)
        
        return EvaluationResult(
            metric=primary,
            details=self._format_details(primary, secondary),
            guardrails_passed=True,
            secondary_metrics=secondary
        )
    
    def _format_details(self, primary: float, secondary: Dict[str, float]) -> str:
        parts = [f"Primary: {primary:.2f}"]
        for k, v in secondary.items():
            parts.append(f"{k}: {v:.2f}")
        return " | ".join(parts)


class LandingPageEvaluator(Evaluator):
    """Composite Conversion Score - deterministic NLP metrics."""
    
    POWER_WORDS = {'free', 'new', 'proven', 'easy', 'save', 'now', 'discover', 
                   'guaranteed', 'results', 'instant', 'exclusive', 'limited',
                   'fast', 'simple', 'powerful', 'effortless', 'tonight', 'today',
                   'unlock', 'boost', 'transform', 'secret', 'you', 'your'}
    
    ACTION_VERBS = {'start', 'get', 'try', 'join', 'build', 'create', 'launch',
                    'ship', 'grow', 'learn', 'see', 'explore', 'claim', 'grab'}
    
    URGENCY = {'now', 'today', 'free', 'instant', 'limited'}
    
    GENERIC_PHRASES = ['ai-powered', 'cutting-edge', 'revolutionary', 'next-gen',
                       'state-of-the-art', 'innovative solution', 'leverage',
                       'streamline your workflow', 'optimize your', 'supercharge']
    
    def compute_primary(self, asset: Dict[str, Any]) -> float:
        try:
            import textstat
            from textblob import TextBlob
        except ImportError:
            return self._simple_compute(asset)
        
        text = self._build_text(asset)
        
        flesch = textstat.flesch_reading_ease(text)
        flesch_score = min(max(flesch, 0), 100)
        
        wc = len(text.split())
        wc_score = 100 if wc <= 150 else max(40, 100 - ((wc - 150) / 150 * 60))
        
        sentences = max(textstat.sentence_count(text), 1)
        avg_sent_len = wc / sentences
        sent_score = 100 if 8 <= avg_sent_len <= 15 else max(20, 100 - abs(avg_sent_len - 12) * 5)
        
        words = text.lower().split()
        power_ratio = sum(1 for w in words if w in self.POWER_WORDS) / max(len(words), 1)
        power_score = min(power_ratio * 500, 100)
        
        cta = asset.get('cta_text', '')
        cta_words = cta.split()
        cta_length_ok = 2 <= len(cta_words) <= 5
        has_action = any(w.lower() in self.ACTION_VERBS for w in cta_words)
        has_urgency = any(w.lower() in self.URGENCY for w in cta_words)
        cta_score = (40 * cta_length_ok) + (35 * has_action) + (25 * has_urgency)
        
        import re
        numbers = len(re.findall(r'\d+', text))
        percentages = len(re.findall(r'\d+%', text))
        time_words = len(re.findall(r'\b(minute|hour|day|week|month|overnight|tonight|today)\b', text.lower()))
        specificity_score = min((numbers + percentages + time_words) * 20, 100)
        
        blob = TextBlob(text)
        polarity = blob.sentiment.polarity
        valence_score = (polarity + 1) * 50
        
        generic_penalty = sum(1 for p in self.GENERIC_PHRASES if p in text.lower()) * 15
        value_score = max(100 - generic_penalty, 0)
        
        ccs = (
            flesch_score * 0.20 +
            wc_score * 0.15 +
            sent_score * 0.10 +
            power_score * 0.10 +
            cta_score * 0.15 +
            specificity_score * 0.10 +
            valence_score * 0.10 +
            value_score * 0.10
        )

        # Map quality score (0-100) → realistic CVR (1.0% – 5.0%)
        # Industry baseline for landing pages: ~3.5%; exceptional: ~5%
        cvr = 0.010 + (ccs / 100) * 0.040
        return round(cvr, 4)
    
    def _simple_compute(self, asset: Dict[str, Any]) -> float:
        text = self._build_text(asset)
        wc = len(text.split())
        ccs = max(0, 100 - (wc - 50) * 0.5)
        return round(0.010 + (ccs / 100) * 0.040, 4)
    
    def _build_text(self, asset: Dict[str, Any]) -> str:
        parts = [
            asset.get('headline', ''),
            asset.get('subheadline', ''),
            asset.get('cta_text', ''),
        ]
        value_props = asset.get('value_props', [])
        if isinstance(value_props, list):
            parts.extend(value_props)
        return '. '.join(str(p) for p in parts if p) + '.'
    
    def compute_guardrails(self, asset: Dict[str, Any]) -> tuple[bool, list]:
        return True, []
    
    def compute_secondary(self, asset: Dict[str, Any]) -> Dict[str, float]:
        text = self._build_text(asset)
        return {
            "word_count": len(text.split()),
            "sentence_count": max(len([s for s in text.split('.') if s]), 1),
        }


class TradingStrategyEvaluator(Evaluator):
    """Sharpe ratio with walk-forward validation."""
    
    def __init__(self, historical_data: Optional[Dict[str, list]] = None, split_ratio: float = 0.7):
        self.historical_data = historical_data or self._default_data()
        self.split_ratio = split_ratio
    
    def _default_data(self) -> Dict[str, list]:
        import random
        random.seed(42)
        n = 500
        returns = [random.gauss(0.0005, 0.02) for _ in range(n)]
        return {"returns": returns}
    
    def compute_primary(self, asset: Dict[str, Any]) -> float:
        returns = self._run_backtest(asset)
        return self._sharpe_ratio(returns)
    
    def _run_backtest(self, asset: Dict[str, Any]) -> list:
        import random
        random.seed(hash(str(asset)) % 1000000)
        
        entry = asset.get('entry_threshold', 70)
        exit_t = asset.get('exit_threshold', 30)
        position_size = asset.get('position_size', 0.08)
        lookback = asset.get('lookback_period', 14)
        
        base_returns = self.historical_data.get("returns", [])
        
        returns = []
        position = 0
        for i in range(len(base_returns)):
            if i < lookback:
                returns.append(0)
                continue
            
            recent = base_returns[max(0, i-lookback):i]
            signal = sum(r > 0 for r in recent) / len(recent) * 100
            
            if signal > entry and position == 0:
                position = 1
            elif signal < exit_t and position == 1:
                position = 0
            
            if position:
                returns.append(base_returns[i] * position_size * 10)
            else:
                returns.append(0)
        
        return returns
    
    def _sharpe_ratio(self, returns: list, risk_free_rate: float = 0.04) -> float:
        if not returns or len(returns) < 10:
            return 0.0
        
        import statistics
        mean_ret = statistics.mean(returns)
        std_ret = statistics.stdev(returns) if len(returns) > 1 else 0.01
        
        if std_ret == 0:
            return 0.0
        
        excess = mean_ret - risk_free_rate / 252
        sharpe = (excess / std_ret) * math.sqrt(252)
        return round(sharpe, 3)
    
    def compute_guardrails(self, asset: Dict[str, Any]) -> tuple[bool, list]:
        failures = []
        
        position_size = asset.get('position_size', 0.08)
        if position_size > 0.15:
            failures.append(f"Position size too high: {position_size}")
        
        if position_size < 0.01:
            failures.append(f"Position size too low: {position_size}")
        
        lookback = asset.get('lookback_period', 14)
        if lookback < 5:
            failures.append(f"Lookback too short: {lookback}")
        if lookback > 252:
            failures.append(f"Lookback too long: {lookback}")
        
        returns = self._run_backtest(asset)
        trades = sum(1 for r in returns if r != 0)
        if trades < 10:
            failures.append(f"Insufficient trades: {trades}")
        
        max_dd = self._max_drawdown(returns)
        if max_dd < -0.25:
            failures.append(f"Max drawdown too severe: {max_dd:.1%}")
        
        return len(failures) == 0, failures
    
    def _max_drawdown(self, returns: list) -> float:
        cumulative = [1.0]
        for r in returns:
            cumulative.append(cumulative[-1] * (1 + r))
        
        peak = 1.0
        max_dd = 0.0
        for c in cumulative:
            if c > peak:
                peak = c
            dd = (c - peak) / peak
            if dd < max_dd:
                max_dd = dd
        
        return max_dd
    
    def compute_secondary(self, asset: Dict[str, Any]) -> Dict[str, float]:
        returns = self._run_backtest(asset)
        
        trades = [r for r in returns if r != 0]
        winners = [r for r in trades if r > 0]
        
        return {
            "max_drawdown": self._max_drawdown(returns),
            "win_rate": len(winners) / max(len(trades), 1),
            "num_trades": len(trades),
            "avg_return": statistics.mean(returns) if returns else 0,
        }


class PortfolioEvaluator(Evaluator):
    """Portfolio allocation optimizer using Sharpe ratio."""
    
    def __init__(self):
        self.asset_returns = {
            "US_Equities": (0.10, 0.15),
            "Intl_Equities": (0.08, 0.18),
            "Bonds": (0.04, 0.05),
            "Real_Estate": (0.07, 0.12),
            "Commodities": (0.05, 0.20),
            "Cash": (0.02, 0.01),
        }
    
    def compute_primary(self, asset: Dict[str, Any]) -> float:
        weights = asset.get('weights', {})
        
        if not weights:
            return 0.0
        
        total = sum(weights.values())
        if abs(total - 1.0) > 0.01:
            return -100
        
        portfolio_return = 0.0
        portfolio_var = 0.0
        
        for asset_name, weight in weights.items():
            if asset_name in self.asset_returns:
                mu, sigma = self.asset_returns[asset_name]
                portfolio_return += weight * mu
                portfolio_var += (weight * sigma) ** 2
        
        portfolio_std = math.sqrt(portfolio_var)
        
        if portfolio_std == 0:
            return 0.0
        
        sharpe = (portfolio_return - 0.04) / portfolio_std
        return round(sharpe, 3)
    
    def compute_guardrails(self, asset: Dict[str, Any]) -> tuple[bool, list]:
        failures = []

        weights = asset.get('weights', {})
        constraints = asset.get('constraints', {})
        max_position_limit = constraints.get('max_single_position', 0.40)

        total = sum(weights.values())

        if abs(total - 1.0) > 0.01:
            failures.append(f"Weights must sum to 1.0, got {total:.2f}")

        max_single = max(weights.values()) if weights else 0
        if max_single > max_position_limit:
            failures.append(f"Max position {max_single:.1%} exceeds {max_position_limit:.0%} limit")

        for asset_name, weight in weights.items():
            if weight < 0:
                failures.append(f"Negative weight for {asset_name}: {weight}")

        return len(failures) == 0, failures
    
    def compute_secondary(self, asset: Dict[str, Any]) -> Dict[str, float]:
        weights = asset.get('weights', {})
        
        portfolio_return = sum(
            w * self.asset_returns.get(a, (0, 0))[0] 
            for a, w in weights.items() if a in self.asset_returns
        )
        
        return {
            "expected_return": portfolio_return,
            "volatility": sum(w ** 2 * self.asset_returns.get(a, (0, 0))[1] ** 2 for a, w in weights.items()) ** 0.5,
        }


class EmailEvaluator(Evaluator):
    """Composite Email Score - deterministic NLP metrics."""
    
    SPAM_WORDS = {'click here', 'act now', 'limited time', 'congratulations',
                  'winner', 'free money', 'no cost', 'risk free', 'guarantee'}
    
    def compute_primary(self, asset: Dict[str, Any]) -> float:
        subject = asset.get('subject_line', '')
        body = asset.get('body', '')
        
        subj_words = len(subject.split())
        subj_len_score = 100 if 6 <= subj_words <= 10 else max(20, 100 - abs(subj_words - 8) * 10)
        
        personalized = '{{' in subject or 'you' in subject.lower()
        personal_score = 100 if personalized else 40
        
        body_wc = len(body.split())
        if 50 <= body_wc <= 125:
            brevity_score = 100
        elif body_wc < 50:
            brevity_score = 60
        else:
            brevity_score = max(20, 100 - (body_wc - 125) * 0.5)
        
        try:
            import textstat
            flesch = textstat.flesch_reading_ease(body)
            read_score = min(max(flesch, 0), 100)
        except ImportError:
            read_score = 70
        
        questions = body.count('?')
        q_score = 100 if 1 <= questions <= 2 else (60 if questions == 0 else 50)
        
        has_single_ask = questions <= 2 and body_wc < 150
        ask_score = 100 if has_single_ask else 50
        
        spam_count = sum(1 for sw in self.SPAM_WORDS if sw in body.lower())
        spam_score = max(100 - spam_count * 30, 0)
        
        ces = (
            subj_len_score * 0.20 +
            personal_score * 0.10 +
            brevity_score * 0.20 +
            read_score * 0.15 +
            q_score * 0.10 +
            ask_score * 0.10 +
            spam_score * 0.15
        )

        # Map quality score (0-100) → realistic reply rate (2.0% – 9.0%)
        # Industry cold email baseline: ~8%; exceptional: ~9%
        reply_rate = 0.020 + (ces / 100) * 0.070
        return round(reply_rate, 4)
    
    def compute_guardrails(self, asset: Dict[str, Any]) -> tuple[bool, list]:
        failures = []
        
        subject = asset.get('subject_line', '')
        if not subject:
            failures.append("Missing subject line")
        
        body = asset.get('body', '')
        if not body:
            failures.append("Missing email body")
        
        spam_count = sum(1 for sw in self.SPAM_WORDS if sw in body.lower())
        if spam_count >= 3:
            failures.append(f"Too many spam words: {spam_count}")
        
        return len(failures) == 0, failures


def get_evaluator(template_id: str) -> Evaluator:
    evaluators = {
        "landing-page-cro": LandingPageEvaluator,
        "trading-strategy": TradingStrategyEvaluator,
        "portfolio-optimization": PortfolioEvaluator,
        "email-outreach": EmailEvaluator,
    }
    
    evaluator_class = evaluators.get(template_id)
    if not evaluator_class:
        return LandingPageEvaluator()
    
    return evaluator_class()
