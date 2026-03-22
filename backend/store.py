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
        # Landing page CRO template — baseline CVR 3.46% (CCS 61.5 → 0.010 + 0.615*0.040)
        self.global_best["landing-page-cro"] = GlobalBest(
            template_id="landing-page-cro",
            metric=0.0346,
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

        # Structural layout template — baseline CVR 3.72% (UX score 68 → 0.010 + 0.68*0.040)
        self.global_best["structural"] = GlobalBest(
            template_id="structural",
            metric=0.0372,
            config={
                "sections_order": ["hero", "features", "testimonials", "pricing", "cta"],
                "hero_style": "left-aligned",
                "hero_headline": "The AI Platform for Growth",
                "hero_subheadline": "Enterprise-grade AI tools for modern teams",
                "show_pricing": True,
                "show_testimonials": True,
                "pricing_position": "bottom",
                "cta_text": "Start Free Trial",
                "cta_style": "primary",
                "value_prop_count": 3,
                "social_proof_style": "logos",
            },
            experiment_count=0,
            last_updated=datetime.now()
        )

        # Onboarding flow — baseline completion rate 57.3% (friction score 78/100)
        self.global_best["onboarding"] = GlobalBest(
            template_id="onboarding",
            metric=0.573,
            config={
                "steps_order": ["welcome", "profile", "team", "first_action"],
                "step_fields": {
                    "welcome":      ["email", "password"],
                    "profile":      ["name", "role", "company_name"],
                    "team":         ["team_size", "use_case"],
                    "first_action": ["action_type", "action_detail"],
                },
                "show_progress_bar":    True,
                "show_skip_option":     False,
                "tooltip_enabled":      True,
                "helper_text_enabled":  True,
                "required_fields_only": True,
            },
            experiment_count=0,
            last_updated=datetime.now()
        )

        # Pricing page — baseline upgrade rate 4.30% (pricing score 80/100)
        self.global_best["pricing-page"] = GlobalBest(
            template_id="pricing-page",
            metric=0.0430,
            config={
                "plans_order":      ["free", "pro", "enterprise"],
                "default_plan":     "pro",
                "show_annual":      True,
                "show_monthly":     True,
                "annual_default":   True,
                "highlighted_plan": "pro",
                "show_comparison":  True,
                "cta_text": {
                    "free":       "Get Started",
                    "pro":        "Start Free Trial",
                    "enterprise": "Contact Sales",
                },
                "features_list_length": 5,
            },
            experiment_count=0,
            last_updated=datetime.now()
        )

        # Feature announcement — baseline adoption rate 19.0% (discovery score 55/100)
        self.global_best["feature-announcement"] = GlobalBest(
            template_id="feature-announcement",
            metric=0.190,
            config={
                "feature_position":  "sidebar",
                "default_view":      "expanded",
                "show_badge":        True,
                "badge_text":        "New",
                "show_tooltip":      True,
                "tooltip_content":   "Check out this feature",
                "auto_show_delay":   5000,
                "dismissible":       True,
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
