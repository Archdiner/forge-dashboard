import uuid
from datetime import datetime
from typing import Dict, List, Optional
from models import (
    Experiment, 
    ExperimentStatus, 
    Agent, 
    AgentStatus, 
    GlobalBest,
    HypothesisRequest,
    Project
)


class InMemoryStore:
    def __init__(self):
        self.experiments: Dict[str, Experiment] = {}
        self.agents: Dict[str, Agent] = {}
        self.global_best: Dict[str, GlobalBest] = {}
        self.projects: Dict[str, Project] = {}
        self.dedup_hashes: set = set()
        
        # Checkpoint state: project_id -> { paused: bool, at_checkpoint: bool, message: str }
        self.checkpoint_state: Dict[str, dict] = {}
        
        self._init_default_data()
    
    def _init_default_data(self):
        # Landing page CRO template — baseline CCS ~61.5 (computed via textstat)
        self.global_best["landing-page-cro"] = GlobalBest(
            template_id="landing-page-cro",
            metric=61.5,
            config={
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
            },
            experiment_count=0,
            last_updated=datetime.now()
        )

        # Prompt optimization template
        self.global_best["prompt-optimization"] = GlobalBest(
            template_id="prompt-optimization",
            metric=0.5,  # 50% baseline accuracy
            config={
                "system_prompt": "You are a customer support classifier. Classify incoming emails into one of these categories: technical, billing, feature_request, complaint, or praise. Respond with just the category name.",
                "few_shot_examples": []
            },
            experiment_count=0,
            last_updated=datetime.now()
        )

        # Portfolio optimization template — baseline Sharpe ~0.366 (computed via Markowitz)
        self.global_best["portfolio-optimization"] = GlobalBest(
            template_id="portfolio-optimization",
            metric=0.366,
            config={
                "assets": {
                    "US_Equities": 0.30,
                    "Intl_Equities": 0.20,
                    "Bonds": 0.30,
                    "Real_Estate": 0.10,
                    "Commodities": 0.05,
                    "Cash": 0.05
                },
                "constraints": {
                    "max_single_position": 0.40,
                    "min_cash": 0.02,
                    "rebalance_frequency": "monthly"
                },
                "risk_tolerance": "moderate"
            },
            experiment_count=0,
            last_updated=datetime.now()
        )

        # Email outreach template — baseline CES ~84.5 (computed via heuristics)
        self.global_best["email-outreach"] = GlobalBest(
            template_id="email-outreach",
            metric=84.5,
            config={
                "subject_line": "Quick question about your team",
                "body": "Hi {{first_name}}, I'd love to learn more about how your team handles [challenge]. Would a 15-minute call this week work?",
                "cta": "Book a 15-min call"
            },
            experiment_count=0,
            last_updated=datetime.now()
        )

        # DCF model template — baseline IRR ~18.9% (computed via Newton-Raphson)
        self.global_best["dcf-model"] = GlobalBest(
            template_id="dcf-model",
            metric=0.1886,
            config={
                "company": "Target Company",
                "scenario": "base",
                "financials": {
                    "base_revenue": 100_000_000,
                    "base_ebitda": 20_000_000,
                },
                "assumptions": {
                    "revenue_growth_y1": 0.25,
                    "revenue_growth_y2": 0.20,
                    "revenue_growth_y3": 0.18,
                    "revenue_growth_y4": 0.15,
                    "revenue_growth_y5": 0.12,
                    "ebitda_margin": 0.20,
                    "da_pct_revenue": 0.04,
                    "tax_rate": 0.25,
                    "capex_pct_revenue": 0.05,
                    "nwc_change_pct": 0.02,
                    "wacc": 0.12,
                    "terminal_growth": 0.03,
                    "exit_ev_ebitda": 15.0,
                    "entry_ev_ebitda": 12.0,
                },
                "success_target": {
                    "metric": "irr",
                    "threshold": 0.20,
                    "direction": "above",
                },
            },
            experiment_count=0,
            last_updated=datetime.now()
        )
    
    def claim_experiment(self, claim: HypothesisRequest, hypothesis: str, mutation: str) -> tuple[Optional[Experiment], bool]:
        exp_id = f"exp-{uuid.uuid4().hex[:8]}"
        
        mutation_hash = hash(mutation)
        
        # For testing - disable dedup
        # if mutation_hash in self.dedup_hashes:
        #     return None, False
        
        self.dedup_hashes.add(mutation_hash)
        
        exp = Experiment(
            id=exp_id,
            agent_id=claim.agent_id,
            agent_name=self.agents.get(claim.agent_id, Agent(
                id=claim.agent_id,
                name=claim.agent_name,
                status=AgentStatus.RUNNING,
                last_active=datetime.now()
            )).name,
            template_id=claim.template_id,
            hypothesis=hypothesis,
            mutation=mutation,
            metric_before=self.global_best[claim.template_id].metric,
            metric_after=0.0,
            status=ExperimentStatus.CLAIMED,
            reasoning="",
            created_at=datetime.now()
        )
        
        self.experiments[exp_id] = exp
        
        if claim.agent_id in self.agents:
            self.agents[claim.agent_id].status = AgentStatus.RUNNING
            self.agents[claim.agent_id].current_hypothesis = hypothesis
            self.agents[claim.agent_id].last_active = datetime.now()
        
        return exp, True
    
    def publish_result(
        self, 
        experiment_id: str, 
        metric_after: float, 
        status: ExperimentStatus, 
        reasoning: str
    ) -> Optional[Experiment]:
        exp = self.experiments.get(experiment_id)
        if not exp:
            return None
        
        exp.metric_after = metric_after
        exp.status = status
        exp.reasoning = reasoning
        exp.completed_at = datetime.now()
        
        if exp.agent_id in self.agents:
            self.agents[exp.agent_id].experiments_run += 1
            self.agents[exp.agent_id].status = AgentStatus.IDLE
            self.agents[exp.agent_id].current_hypothesis = None
            self.agents[exp.agent_id].last_active = datetime.now()
        
        template_id = exp.template_id
        if status == ExperimentStatus.SUCCESS and metric_after > self.global_best[template_id].metric:
            self.global_best[template_id].metric = metric_after
            self.global_best[template_id].last_updated = datetime.now()
            
            if exp.agent_id in self.agents:
                self.agents[exp.agent_id].improvements_found += 1
        
        self.global_best[template_id].experiment_count += 1
        
        return exp
    
    def update_global_best_config(self, template_id: str, config: dict) -> bool:
        """Update the global best config (call after successful experiment)."""
        if template_id in self.global_best:
            self.global_best[template_id].config = config
            return True
        return False
    
    def get_global_best(self, template_id: str) -> Optional[GlobalBest]:
        return self.global_best.get(template_id)
    
    def get_recent_experiments(self, template_id: str, limit: int = 20) -> List[Experiment]:
        exps = [e for e in self.experiments.values() if e.template_id == template_id]
        exps.sort(key=lambda x: x.created_at, reverse=True)
        return exps[:limit]
    
    def get_all_experiments(self, template_id: str) -> List[Experiment]:
        exps = [e for e in self.experiments.values() if e.template_id == template_id]
        exps.sort(key=lambda x: x.created_at, reverse=True)
        return exps
    
    def register_agent(self, agent: Agent):
        self.agents[agent.id] = agent
    
    def get_agents(self) -> List[Agent]:
        return list(self.agents.values())
    
    def update_agent_status(self, agent_id: str, status: AgentStatus, hypothesis: Optional[str] = None):
        if agent_id in self.agents:
            self.agents[agent_id].status = status
            if hypothesis:
                self.agents[agent_id].current_hypothesis = hypothesis
            self.agents[agent_id].last_active = datetime.now()

    # Checkpoint management
    def set_checkpoint(self, project_id: str, message: str = "Checkpoint reached"):
        """Pause agent at checkpoint."""
        self.checkpoint_state[project_id] = {
            "paused": True,
            "at_checkpoint": True,
            "message": message,
            "timestamp": datetime.now().isoformat()
        }
    
    def clear_checkpoint(self, project_id: str):
        """Clear checkpoint and resume."""
        if project_id in self.checkpoint_state:
            self.checkpoint_state[project_id]["paused"] = False
            self.checkpoint_state[project_id]["at_checkpoint"] = False
    
    def is_at_checkpoint(self, project_id: str) -> bool:
        """Check if project is at a checkpoint."""
        state = self.checkpoint_state.get(project_id, {})
        return state.get("at_checkpoint", False) and state.get("paused", False)
    
    def get_checkpoint_state(self, project_id: str) -> dict:
        """Get checkpoint state for a project."""
        return self.checkpoint_state.get(project_id, {"paused": False, "at_checkpoint": False})


store = InMemoryStore()
