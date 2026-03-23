import asyncio
import aiohttp
import json
from typing import Any, Dict, List, Optional
from datetime import datetime

from agents.base import BaseForgeAgent
from config import Settings
from llm import GeminiClient
from templates.base import BaseTemplate, Hypothesis, EvaluationResult, GlobalBestState, ExperimentHistory
from templates import get_template


class DirectStoreAPI:
    """Direct store access - no HTTP calls needed when running in same process."""
    
    def __init__(self, store):
        self.store = store
    
    async def get_global_best(self, template_id: str):
        from templates.base import GlobalBestState
        from models import GlobalBest
        gb = self.store.get_global_best(template_id)
        # Auto-initialize if template not yet in store (e.g. email-outreach, ad-copy)
        if not gb:
            try:
                from templates import get_template as _get_template
                tpl = _get_template(template_id)
                self.store.global_best[template_id] = GlobalBest(
                    template_id=template_id,
                    metric=tpl.get_default_metric(),
                    config=tpl.default_config.copy(),
                    experiment_count=0,
                    last_updated=datetime.now()
                )
                gb = self.store.global_best[template_id]
            except Exception:
                return None
        return GlobalBestState(
            template_id=gb.template_id,
            metric=gb.metric,
            config=gb.config,
            experiment_count=gb.experiment_count
        )
    
    async def get_history(self, template_id: str, limit: int = 20):
        from templates.base import ExperimentHistory
        exps = list(self.store.experiments.values())
        exps = [e for e in exps if e.template_id == template_id][-limit:]
        return [ExperimentHistory(
            id=e.id,
            hypothesis=e.hypothesis,
            mutation=e.mutation,
            metric_before=e.metric_before,
            metric_after=e.metric_after,
            # e.status may be a plain string after publish_result assigns it directly
            status=e.status.value if hasattr(e.status, 'value') else str(e.status),
            reasoning=e.reasoning
        ) for e in exps]

    async def claim_experiment(self, agent_id, agent_name, template_id, hypothesis, mutation):
        from models import HypothesisRequest
        # Ensure template has a global best entry before claiming
        if template_id not in self.store.global_best:
            from templates import get_template as _get_template
            from models import GlobalBest
            tpl = _get_template(template_id)
            self.store.global_best[template_id] = GlobalBest(
                template_id=template_id,
                metric=tpl.get_default_metric(),
                config=tpl.default_config.copy(),
                experiment_count=0,
                last_updated=datetime.now()
            )
        req = HypothesisRequest(agent_id=agent_id, agent_name=agent_name, template_id=template_id)
        exp, success = self.store.claim_experiment(req, hypothesis, mutation)
        return exp.id if success else None

    async def publish_result(self, experiment_id, agent_id, template_id, metric_before, metric_after, status, reasoning):
        from models import ExperimentStatus
        # Coerce string status to enum so store comparisons work correctly
        if isinstance(status, str):
            status = ExperimentStatus(status)
        exp = self.store.publish_result(experiment_id, metric_after, status, reasoning)
        if exp is not None:
            # Broadcast via WebSocket so frontend gets real-time updates
            try:
                from main import broadcast_to_websockets
                import asyncio
                best = self.store.get_global_best(template_id)
                asyncio.create_task(broadcast_to_websockets({
                    "type": "experiment_completed",
                    "data": exp.model_dump(mode='json')
                }))
                if best:
                    asyncio.create_task(broadcast_to_websockets({
                        "type": "global_best_updated",
                        "data": best.model_dump(mode='json')
                    }))
            except Exception:
                pass
        return exp is not None

    async def register_agent(self, agent_id, agent_name):
        from models import Agent, AgentStatus
        if agent_id not in self.store.agents:
            self.store.agents[agent_id] = Agent(
                id=agent_id,
                name=agent_name,
                status=AgentStatus.IDLE,
                last_active=datetime.now()
            )
        try:
            from main import broadcast_to_websockets
            import asyncio
            agent = self.store.agents[agent_id]
            asyncio.create_task(broadcast_to_websockets({
                "type": "agent_registered",
                "data": agent.model_dump(mode='json')
            }))
        except Exception:
            pass
        return True

    async def update_global_best(self, template_id, config):
        result = self.store.update_global_best_config(template_id, config)
        if result:
            try:
                from main import broadcast_to_websockets
                import asyncio
                best = self.store.get_global_best(template_id)
                if best:
                    asyncio.create_task(broadcast_to_websockets({
                        "type": "global_best_updated",
                        "data": best.model_dump(mode='json')
                    }))
            except Exception:
                pass
        return result

    async def get_checkpoint_state(self, project_id):
        return self.store.checkpoint_state.get(project_id, {"paused": False, "at_checkpoint": False, "message": ""})

    async def set_checkpoint_state(self, project_id, state):
        self.store.checkpoint_state[project_id] = state
        return True

    async def update_agent_status(self, agent_id, status, hypothesis=None):
        from models import AgentStatus
        if agent_id in self.store.agents:
            agent_status = AgentStatus(status) if isinstance(status, str) else status
            self.store.agents[agent_id].status = agent_status
            self.store.agents[agent_id].current_hypothesis = hypothesis
            self.store.agents[agent_id].last_active = datetime.now()
        try:
            from main import broadcast_to_websockets
            import asyncio
            asyncio.create_task(broadcast_to_websockets({
                "type": "agent_status_updated",
                "data": {"agent_id": agent_id, "status": status, "hypothesis": hypothesis}
            }))
        except Exception:
            pass
        return True

    async def close(self):
        pass


class ForgeAPI:
    """Simple HTTP client for Forge backend API."""
    
    def __init__(self, base_url: str):
        self.base_url = base_url
    
    async def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        """Make an HTTP request with fresh session."""
        async with aiohttp.ClientSession() as session:
            url = f"{self.base_url}{path}"
            async with session.request(method, url, **kwargs) as response:
                if response.status >= 400:
                    text = await response.text()
                    raise Exception(f"API error {response.status}: {text}")
                return await response.json()
    
    async def get_global_best(self, template_id: str) -> Optional[GlobalBestState]:
        """Get current global best."""
        try:
            data = await self._request("GET", f"/experiments/global-best/{template_id}")
            return GlobalBestState(**data)
        except Exception as e:
            print(f"Failed to get global best: {e}")
            return None
    
    async def get_history(self, template_id: str, limit: int = 20) -> List[ExperimentHistory]:
        """Get experiment history."""
        try:
            data = await self._request("GET", f"/experiments/history/{template_id}?limit={limit}")
            return [ExperimentHistory(**exp) for exp in data]
        except Exception as e:
            print(f"Failed to get history: {e}")
            return []
    
    async def claim_experiment(
        self, 
        agent_id: str,
        agent_name: str,
        template_id: str,
        hypothesis: str,
        mutation: str
    ) -> Optional[str]:
        """Claim an experiment."""
        try:
            url = f"{self.base_url}/experiments/claim"
            params = {
                "agent_id": agent_id,
                "agent_name": agent_name,
                "template_id": template_id,
                "hypothesis": hypothesis,
                "mutation": mutation,
            }
            async with aiohttp.ClientSession() as session:
                async with session.post(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get("success"):
                            return data.get("experiment_id")
                    else:
                        print(f"Claim failed with status {response.status}: {await response.text()}")
            return None
        except Exception as e:
            print(f"Failed to claim experiment: {e}")
            return None
    
    async def publish_result(
        self,
        experiment_id: str,
        agent_id: str,
        template_id: str,
        metric_before: float,
        metric_after: float,
        status: str,
        reasoning: str
    ) -> bool:
        """Publish experiment result."""
        try:
            payload = {
                "experiment_id": experiment_id,
                "agent_id": agent_id,
                "template_id": template_id,
                "metric_before": metric_before,
                "metric_after": metric_after,
                "status": status,
                "reasoning": reasoning,
            }
            url = f"{self.base_url}/experiments/publish"
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    if response.status == 200:
                        return True
            return False
        except Exception as e:
            print(f"Failed to publish result: {e}")
            return False
    
    async def update_agent_status(
        self,
        agent_id: str,
        status: str,
        hypothesis: Optional[str] = None
    ) -> bool:
        """Update agent status."""
        try:
            payload = {
                "agent_id": agent_id,
                "status": status,
            }
            if hypothesis:
                payload["hypothesis"] = hypothesis
            
            url = f"{self.base_url}/agents/update-status"
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    return response.status == 200
        except Exception as e:
            print(f"Failed to update status: {e}")
            return False
    
    async def register_agent(self, agent_id: str, agent_name: str) -> bool:
        """Register agent with backend."""
        try:
            payload = {
                "id": agent_id,
                "name": agent_name,
                "status": "idle",
                "experiments_run": 0,
                "improvements_found": 0,
                "last_active": datetime.now().isoformat(),
            }
            url = f"{self.base_url}/agents/register"
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=payload) as response:
                    return response.status == 200
        except Exception as e:
            print(f"Failed to register agent: {e}")
            return False
    
    async def update_global_best(self, template_id: str, config: dict) -> bool:
        """Update the global best config after successful experiment."""
        try:
            url = f"{self.base_url}/experiments/global-best/{template_id}"
            async with aiohttp.ClientSession() as session:
                async with session.post(url, json=config) as response:
                    return response.status == 200
        except Exception as e:
            print(f"Failed to update global best: {e}")
            return False
    
    async def close(self):
        """Close is now a no-op since we create fresh sessions."""
        pass


class ForgeAgent(BaseForgeAgent):
    """Concrete implementation of a Forge optimization agent."""

    # Role configs: (temperature, mutation_scale_hint, prompt_addendum)
    ROLE_CONFIGS = {
        "explorer":    (0.9, "large",  "Be creative and try LARGE, diverse changes. Deviate significantly from the current best to explore new regions of the search space."),
        "refiner":     (0.3, "small",  "Make SMALL, precise refinements. Fine-tune what is already working. Avoid large changes."),
        "synthesizer": (0.6, "medium", "Combine insights from the BEST past experiments. Look for ways to merge multiple winning mutations into one hypothesis."),
    }

    def __init__(self, config: Settings, role: str = "explorer", store=None):
        self.config = config
        self.role = role.lower()
        self.template = get_template(config.template_id)
        self.llm = GeminiClient(config.google_api_key)
        # Use direct store access if available (for same-process execution)
        if store is not None:
            self.api = DirectStoreAPI(store)
        else:
            self.api = ForgeAPI(config.forge_api_url)
        self._running = False
        temperature, _, _ = self.ROLE_CONFIGS.get(self.role, (0.7, "medium", ""))
        self._temperature = temperature

    @property
    def agent_id(self) -> str:
        return self.config.agent_id

    @property
    def agent_name(self) -> str:
        return self.config.agent_name
    
    async def get_global_best(self, template_id: str) -> Optional[GlobalBestState]:
        return await self.api.get_global_best(template_id)
    
    async def get_history(self, template_id: str, limit: int = 20) -> List[ExperimentHistory]:
        return await self.api.get_history(template_id, limit)
    
    async def claim_experiment(self, hypothesis: Hypothesis, template_id: str) -> Optional[str]:
        import json
        mutation = hypothesis.mutation
        # Convert dict to JSON string for API
        if isinstance(mutation, dict):
            mutation = json.dumps(mutation)
        return await self.api.claim_experiment(
            self.agent_id,
            self.agent_name,
            template_id,
            hypothesis.hypothesis,
            mutation
        )
    
    async def publish_result(
        self,
        experiment_id: str,
        metric_before: float,
        metric_after: float,
        status: str,
        reasoning: str,
        template_id: str
    ) -> bool:
        return await self.api.publish_result(
            experiment_id,
            self.agent_id,
            template_id,
            metric_before,
            metric_after,
            status,
            reasoning
        )
    
    async def update_status(self, status: str, hypothesis: Optional[str] = None) -> None:
        await self.api.update_agent_status(self.agent_id, status, hypothesis)
    
    async def _send_checkpoint_notification(self, experiment_count: int, improvements_found: int) -> None:
        """Send checkpoint notification via WebSocket."""
        try:
            from store import store
            from main import broadcast_to_websockets
            
            project_id = getattr(self.config, 'project_id', '')
            best = await self.get_global_best(self.config.template_id)
            
            # Set checkpoint in store
            store.set_checkpoint(project_id, f"Checkpoint at {experiment_count} experiments")
            
            # Get recent experiments
            history = await self.get_history(self.config.template_id, limit=5)
            
            # Broadcast checkpoint event
            await broadcast_to_websockets({
                "type": "checkpoint",
                "project_id": project_id,
                "agent_id": self.agent_id,
                "experiment_count": experiment_count,
                "improvements_found": improvements_found,
                "current_best": {
                    "metric": best.metric if best else 0,
                    "config": best.config if best else {}
                } if best else None,
                "recent_experiments": [
                    {
                        "id": e.id,
                        "hypothesis": e.hypothesis[:100] if e.hypothesis else "",
                        "metric_before": e.metric_before,
                        "metric_after": e.metric_after,
                        "status": str(e.status)
                    }
                    for e in history
                ],
                "message": f"Checkpoint reached after {experiment_count} experiments. Current best: {best.metric if best else 0:.2f}"
            })
        except Exception as e:
            print(f"[{self.agent_name}] Failed to send checkpoint notification: {e}")
    
    async def _evaluate_simulation(
        self,
        best,
        mutated_config: dict,
    ):
        """Evaluate via deterministic template evaluators (existing behaviour)."""
        from templates.base import EvaluationResult
        return self.template.evaluate(mutated_config, llm=self.llm)

    async def _evaluate_backtest(
        self,
        best,
        mutated_config: dict,
    ):
        """Evaluate via PostHog historical windows.

        Compares two historical periods to simulate a baseline vs variant
        measurement. Returns an EvaluationResult with the PostHog metric.

        The 'metric' returned is the ratio (comparison / baseline), so values
        above 1.0 indicate the variant window performed better.
        """
        from templates.base import EvaluationResult
        from connectors.posthog import PostHogConnector, MetricDefinition

        cfg = self.config
        if not cfg.posthog_api_key or not cfg.posthog_project_id or not cfg.posthog_metric:
            print(f"[{self.agent_name}] Backtest mode requires PostHog config — falling back to simulation")
            return self.template.evaluate(mutated_config, llm=self.llm)

        connector = PostHogConnector(cfg.posthog_api_key, cfg.posthog_base_url)
        metric_def = MetricDefinition.from_dict(cfg.posthog_metric)

        try:
            baseline_result, comparison_result = await connector.query_metric_backtest(
                cfg.posthog_project_id, metric_def,
                window_days=7, lookback_days=14
            )
            # Ratio: comparison window vs baseline window
            # >1 means the comparison period was better
            ratio = (comparison_result.value / baseline_result.value) if baseline_result.value > 0 else 1.0
            reasoning = (
                f"Backtest: baseline window {baseline_result.value:.4f} "
                f"vs comparison {comparison_result.value:.4f} "
                f"(ratio {ratio:.3f}, n={baseline_result.sample_size})"
            )
            # Return absolute value so we can compare directly to best.metric
            return EvaluationResult(metric=comparison_result.value, reasoning=reasoning)
        except Exception as e:
            print(f"[{self.agent_name}] PostHog backtest error: {e} — falling back to simulation")
            return self.template.evaluate(mutated_config, llm=self.llm)

    async def _evaluate_live(
        self,
        best,
        mutated_config: dict,
        hypothesis: "Hypothesis",
        exp_id: str,
    ):
        """Evaluate via live PostHog measurement (real deployment cycle).

        1. Convert mutated config to human-readable variant text.
        2. Register the cycle in the ratchet (shows variant in dashboard).
        3. Auto-create PostHog feature flag with control/variant payloads.
        4. Broadcast variant_ready event to frontend.
        5. If forge.js snippet is installed, auto-confirm deployment.
           Otherwise wait for user to click "I've deployed this".
        6. Wait cycle_window_hours.
        7. Query PostHog for per-variant metrics.
        8. Compare to baseline, record decision, deactivate flag.
        """
        from templates.base import EvaluationResult
        from connectors.posthog import PostHogConnector, MetricDefinition
        from ratchet import ratchet
        from main import broadcast_to_websockets

        cfg = self.config
        project_id = getattr(cfg, 'project_id', '')
        template_id = cfg.template_id

        # Convert config to readable variant text for the user to copy/deploy
        try:
            variant_text = self.template.config_to_output(mutated_config)
        except Exception:
            import json
            variant_text = json.dumps(mutated_config, indent=2)

        # Register in ratchet
        cycle = ratchet.start_cycle(
            project_id=project_id,
            variant_text=variant_text,
            variant_config=mutated_config,
            hypothesis=hypothesis.hypothesis,
            baseline_metric=best.metric,
            cycle_window_hours=cfg.cycle_window_hours,
        )

        # ── Auto-create PostHog feature flag ──────────────────────────────
        connector = None
        flag_key = f"forge-{project_id}"
        flag_created = False

        if cfg.posthog_api_key and cfg.posthog_project_id:
            connector = PostHogConnector(cfg.posthog_api_key, cfg.posthog_base_url)

            # Load selector config for this project (stored by main.py endpoints)
            try:
                from main import _selector_configs, DEFAULT_SELECTORS
                selectors = _selector_configs.get(project_id, DEFAULT_SELECTORS.get(template_id, {}))
            except ImportError:
                selectors = {}

            control_payload = {
                "config": best.config,
                "selectors": selectors,
                "template_type": template_id,
            }
            variant_payload = {
                "config": mutated_config,
                "selectors": selectors,
                "template_type": template_id,
            }
            variants = [
                {"name": "control", "payload": control_payload},
                {"name": "variant", "payload": variant_payload},
            ]

            try:
                # Reuse existing flag or create new one
                existing = await connector.get_feature_flag_by_key(cfg.posthog_project_id, flag_key)
                if existing:
                    # Delete and recreate to update variants (PostHog PATCH doesn't support variant changes)
                    await connector.delete_feature_flag(cfg.posthog_project_id, str(existing["id"]))
                    print(f"[{self.agent_name}] Deleted old flag {flag_key}, recreating with new variant")

                flag_result = await connector.create_feature_flag(
                    project_id=cfg.posthog_project_id,
                    name=f"Forge: {hypothesis.hypothesis[:60]}",
                    key=flag_key,
                    description=f"Auto-created by Forge agent {self.agent_name} for experiment {exp_id}",
                    variants=variants,
                    rollout_percentage=100,
                )

                if flag_result.get("success"):
                    flag_created = True
                    ratchet.update_cycle_flag_info(
                        project_id=project_id,
                        flag_key=flag_key,
                        flag_id=str(flag_result["flag_id"]),
                        control_payload=control_payload,
                        variant_payload=variant_payload,
                    )
                    print(f"[{self.agent_name}] Feature flag '{flag_key}' created in PostHog")
                else:
                    print(f"[{self.agent_name}] Flag creation failed: {flag_result.get('error')}")
            except Exception as e:
                print(f"[{self.agent_name}] Flag creation error: {e}")

        # Notify frontend: show the deploy panel (includes flag info if created)
        await broadcast_to_websockets({
            "type": "variant_ready",
            "project_id": project_id,
            "cycle": cycle.to_dict(),
            "flag_created": flag_created,
            "flag_key": flag_key if flag_created else None,
            "message": "Variant deployed via feature flag" if flag_created else "Variant ready to deploy",
        })

        # ── Deployment gate ───────────────────────────────────────────────
        # If forge.js snippet is installed and flag was created, auto-confirm
        snippet_installed = False
        try:
            from main import _snippet_status
            snippet_installed = _snippet_status.get(project_id, False)
        except ImportError:
            pass

        if flag_created and snippet_installed:
            print(f"[{self.agent_name}] Snippet installed — auto-confirming deployment")
            ratchet.confirm_deployment(project_id)
        else:
            if flag_created:
                print(f"[{self.agent_name}] Flag created, waiting for snippet install or manual confirmation...")
            else:
                print(f"[{self.agent_name}] Waiting for user deployment confirmation...")
            await self.update_status("running", "Waiting for deployment confirmation…")

            deployed = await ratchet.wait_for_deployment(project_id, timeout_hours=72.0)
            if not deployed:
                print(f"[{self.agent_name}] Deployment confirmation timed out")
                # Cleanup flag
                if flag_created and connector:
                    try:
                        await connector.update_feature_flag(cfg.posthog_project_id, cycle.flag_id, active=False)
                    except Exception:
                        pass
                ratchet.clear(project_id)
                return EvaluationResult(metric=best.metric, reasoning="Deployment confirmation timed out")

        active_cycle = ratchet.get_active_cycle(project_id)
        if not active_cycle:
            return EvaluationResult(metric=best.metric, reasoning="Cycle cancelled")

        # Wait out the measurement window
        window_secs = cfg.cycle_window_hours * 3600
        print(f"[{self.agent_name}] Measuring for {cfg.cycle_window_hours}h…")
        await self.update_status("running", f"Measuring for {cfg.cycle_window_hours}h…")
        await asyncio.sleep(window_secs)

        # ── Query PostHog for results ─────────────────────────────────────
        if not cfg.posthog_api_key or not cfg.posthog_project_id or not cfg.posthog_metric:
            print(f"[{self.agent_name}] Live mode: PostHog not configured — using simulation fallback")
            sim_result = self.template.evaluate(mutated_config, llm=self.llm)
            ratchet.record_result(
                project_id,
                sim_result.metric,
                "kept" if sim_result.metric > best.metric else "reverted",
            )
            return sim_result

        try:
            if not connector:
                connector = PostHogConnector(cfg.posthog_api_key, cfg.posthog_base_url)
            metric_def = MetricDefinition.from_dict(cfg.posthog_metric)

            # Use per-variant metrics when we have a flag, otherwise fall back to overall
            if flag_created and active_cycle.flag_name:
                flag_metrics = await connector.compute_flag_metrics(
                    cfg.posthog_project_id,
                    active_cycle.flag_name,
                    metric_def,
                    active_cycle.deployed_at or datetime.utcnow(),
                    datetime.utcnow(),
                )
                control_data = flag_metrics.get("control", {})
                variant_data = flag_metrics.get("variant", {})
                measured_metric = variant_data.get("metric", 0)
                control_metric = control_data.get("metric", 0)

                # Update cycle with per-variant metrics
                active_cycle.control_metric = control_metric
                active_cycle.variant_metric = measured_metric
                active_cycle.sample_size = (
                    control_data.get("sample_size", 0) + variant_data.get("sample_size", 0)
                )

                is_improvement = flag_metrics.get("winner") == "variant"
                decision = "kept" if is_improvement else "reverted"

                reasoning = (
                    f"PostHog A/B: control={control_metric:.4f} vs variant={measured_metric:.4f} "
                    f"— {decision} (winner={flag_metrics.get('winner')}, "
                    f"n={active_cycle.sample_size})"
                )
            else:
                result = await connector.get_current_metric(
                    cfg.posthog_project_id, metric_def, cfg.cycle_window_hours
                )
                measured_metric = result.value
                is_improvement = result.value > best.metric
                decision = "kept" if is_improvement else "reverted"
                reasoning = (
                    f"PostHog metric: {result.value:.4f} vs baseline {best.metric:.4f} "
                    f"— {decision} (n={result.sample_size})"
                )

            ratchet.record_result(project_id, measured_metric, decision)

            await broadcast_to_websockets({
                "type": "cycle_evaluated",
                "project_id": project_id,
                "cycle_id": cycle.cycle_id,
                "metric": measured_metric,
                "baseline": best.metric,
                "decision": decision,
                "control_metric": active_cycle.control_metric,
                "variant_metric": active_cycle.variant_metric,
                "sample_size": active_cycle.sample_size,
            })

            # Deactivate the feature flag after cycle completes
            if flag_created and connector and cycle.flag_id:
                try:
                    await connector.update_feature_flag(
                        cfg.posthog_project_id, cycle.flag_id, active=False
                    )
                    print(f"[{self.agent_name}] Flag '{flag_key}' deactivated")
                except Exception as e:
                    print(f"[{self.agent_name}] Failed to deactivate flag: {e}")

            return EvaluationResult(metric=measured_metric, reasoning=reasoning)

        except Exception as e:
            print(f"[{self.agent_name}] PostHog live query error: {e}")
            # Cleanup flag on error
            if flag_created and connector and cycle.flag_id:
                try:
                    await connector.update_feature_flag(cfg.posthog_project_id, cycle.flag_id, active=False)
                except Exception:
                    pass
            ratchet.clear(project_id)
            return EvaluationResult(metric=best.metric, reasoning=f"PostHog error: {e}")

    # ── Sim pre-screen ─────────────────────────────────────────────────────────

    def _detect_phase(self, history: List[ExperimentHistory]) -> str:
        """Detect whether we're in exploration, refinement, or convergence.

        Returns one of:
          "exploration"  — high variance, frequent wins; cast wide net
          "refinement"   — narrowing; fine-tune promising directions
          "convergence"  — stagnating; minimal pre-screen overhead
        """
        import statistics
        if len(history) < 10:
            return "exploration"

        recent = history[:20]
        metrics = [e.metric_after for e in recent if e.metric_after and e.metric_after > 0]
        if len(metrics) < 5:
            return "exploration"

        improvement_rate = sum(1 for e in recent if e.status == "success") / len(recent)
        try:
            cv = statistics.stdev(metrics) / statistics.mean(metrics) if statistics.mean(metrics) > 0 else 1.0
        except statistics.StatisticsError:
            cv = 1.0

        if improvement_rate >= 0.30 or cv > 0.05:
            return "exploration"
        elif improvement_rate >= 0.10 or cv > 0.02:
            return "refinement"
        else:
            return "convergence"

    def _prescreen_candidates(
        self,
        prompt: str,
        best: "GlobalBestState",
        n: int,
    ) -> "Hypothesis":
        """Generate N candidates, sim-score each, return the best.

        This is the cheap filter that prevents weak hypotheses from consuming
        real user traffic in backtest/live modes.
        """
        candidates = []
        for _ in range(n):
            h = self.llm.generate_structured(prompt, Hypothesis, temperature=self._temperature)
            if not h:
                continue
            mutated = self.template.apply_mutation(best.config, h.mutation)
            score = self.template.evaluate(mutated).metric
            candidates.append((score, h))

        if not candidates:
            return None

        candidates.sort(key=lambda x: x[0], reverse=True)
        best_score, best_h = candidates[0]
        print(
            f"[{self.agent_name}] Pre-screened {len(candidates)} candidates — "
            f"best sim score {best_score:.4f} — promoting: {best_h.hypothesis[:60]}"
        )
        return best_h

    # ── Main experiment loop ───────────────────────────────────────────────────

    async def run_single_experiment(self, template_id: str) -> bool:
        """Run a single experiment cycle.

        Routes to the appropriate evaluation mode:
          simulation — deterministic template evaluators (default)
          backtest   — PostHog historical windows (demo-ready)
          live       — real deployment + PostHog measurement (production)

        In backtest/live modes, a simulation pre-screen filters N LLM
        candidates before any real traffic is spent. The number of candidates
        (and therefore LLM calls) scales with detected exploration phase:
          exploration  → 5 candidates  (wide search, high variance phase)
          refinement   → 3 candidates  (narrowing, fine-tuning phase)
          convergence  → 1 candidate   (minimal overhead, near ceiling)
        """
        mode = getattr(self.config, 'experiment_mode', 'simulation')
        print(f"\n[{self.agent_name}] Starting experiment (mode={mode})...")

        # 1. Get current state
        best = await self.get_global_best(template_id)
        if not best:
            print(f"[{self.agent_name}] Failed to get global best, skipping")
            return False

        history = await self.get_history(template_id)

        # 2. Generate hypothesis — with sim pre-screen in backtest/live modes
        await self.update_status("thinking", "Generating hypothesis...")
        base_prompt = self.template.generate_hypothesis_prompt(best, history)
        _, _, role_addendum = self.ROLE_CONFIGS.get(self.role, (0.7, "medium", ""))
        prompt = f"{base_prompt}\n\nAGENT ROLE ({self.role.upper()}): {role_addendum}"

        if mode in ("backtest", "live"):
            phase = self._detect_phase(history)
            n_candidates = {"exploration": 5, "refinement": 3, "convergence": 1}[phase]
            print(f"[{self.agent_name}] Phase={phase} → pre-screening {n_candidates} candidate(s)")
            hypothesis = self._prescreen_candidates(prompt, best, n_candidates)
        else:
            hypothesis = self.llm.generate_structured(prompt, Hypothesis, temperature=self._temperature)

        if not hypothesis:
            print(f"[{self.agent_name}] Failed to generate hypothesis")
            return False

        print(f"[{self.agent_name}] Hypothesis: {hypothesis.hypothesis}")

        # 3. Claim experiment
        await self.update_status("running", hypothesis.hypothesis)
        exp_id = await self.claim_experiment(hypothesis, template_id)

        if not exp_id:
            print(f"[{self.agent_name}] Dedup rejected - another agent claimed this")
            return False

        print(f"[{self.agent_name}] Claimed experiment: {exp_id}")

        # 4. Apply mutation
        mutated_config = self.template.apply_mutation(best.config, hypothesis.mutation)

        # 5. Evaluate — route to the right evaluator
        await self.update_status("running", "Evaluating...")
        if mode == "live":
            result = await self._evaluate_live(best, mutated_config, hypothesis, exp_id)
        elif mode == "backtest":
            result = await self._evaluate_backtest(best, mutated_config)
        else:
            result = await self._evaluate_simulation(best, mutated_config)

        print(f"[{self.agent_name}] Result: {result.metric:.4f} ({result.reasoning[:60]}...)")

        # 6. Determine status
        is_improvement = result.metric > best.metric
        status = "success" if is_improvement else "failure"

        # 7. Publish result
        await self.update_status("publishing", "Publishing result...")
        success = await self.publish_result(
            exp_id,
            best.metric,
            result.metric,
            status,
            result.reasoning,
            template_id
        )

        if success:
            if is_improvement:
                await self.api.update_global_best(template_id, mutated_config)
                print(f"[{self.agent_name}] ✓ IMPROVEMENT! {best.metric:.4f} → {result.metric:.4f}")
            else:
                print(f"[{self.agent_name}] ✗ No improvement: {best.metric:.4f} → {result.metric:.4f}")
        else:
            print(f"[{self.agent_name}] Failed to publish result")

        return success
    
    async def run_loop(self) -> None:
        """Run the main agent loop with plateau detection."""
        self._running = True
        
        # Register agent
        await self.api.register_agent(self.agent_id, self.agent_name)
        print(f"[{self.agent_name}] Registered with backend")
        
        experiment_count = 0
        improvements_found = 0
        consecutive_failures = 0
        
        # Configuration
        max_experiments = getattr(self.config, 'max_experiments', 50)
        plateau_patience = getattr(self.config, 'plateau_patience', 15)  # Stop after 15 failures in a row
        improvement_threshold = getattr(self.config, 'improvement_threshold', 0.0001)  # Minimum improvement to count
        
        # Get initial baseline to track improvements against
        initial_best = await self.get_global_best(self.config.template_id)
        baseline_metric = initial_best.metric if initial_best else 0
        
        while self._running:
            # Hard cap - never exceed this
            if max_experiments and experiment_count >= max_experiments:
                print(f"[{self.agent_name}] Reached max experiments ({max_experiments}), stopping")
                break
            
            # Plateau detection - but don't stop if we're still finding improvements
            # Only count consecutive failures AFTER at least one successful experiment
            if consecutive_failures >= plateau_patience and experiment_count > 0:
                print(f"[{self.agent_name}] Plateau detected! No improvement in {plateau_patience} attempts.")
                print(f"[{self.agent_name}] Total: {experiment_count} experiments, {improvements_found} improvements found.")
                print(f"[{self.agent_name}] Best: {baseline_metric:.2f} → {initial_best.metric if initial_best else 0:.2f}")
                # Update baseline before stopping
                if initial_best and initial_best.metric > baseline_metric:
                    print(f"[{self.agent_name}] Final improvement: +{((initial_best.metric - baseline_metric) / baseline_metric * 100):.1f}%")
                break
            
            try:
                # Get best before experiment
                best_before = await self.get_global_best(self.config.template_id)
                if not best_before:
                    print(f"[{self.agent_name}] Warning: Could not get global best, retrying...")
                    await asyncio.sleep(2)
                    continue  # Skip this iteration, don't count as failure
                metric_before = best_before.metric
                
                # Run experiment
                success = await self.run_single_experiment(self.config.template_id)
                
                if success:
                    experiment_count += 1

                    # Check if global best moved since before this experiment
                    best_after = await self.get_global_best(self.config.template_id)
                    if best_after:
                        metric_after = best_after.metric

                        if metric_after > metric_before:
                            improvements_found += 1
                            consecutive_failures = 0  # Reset on improvement
                            print(f"[{self.agent_name}] Improvement! {metric_before:.4f} → {metric_after:.4f} (+{((metric_after - metric_before) / max(metric_before, 1e-9) * 100):.1f}%)")
                        else:
                            consecutive_failures += 1
                            print(f"[{self.agent_name}] No improvement ({consecutive_failures}/{plateau_patience} failures)")
                else:
                    # Failed experiment - don't count toward plateau unless we've done at least 1 successful
                    if experiment_count > 0:
                        consecutive_failures += 1
                
                # Checkpoint logic: pause every N experiments
                checkpoint_every = getattr(self.config, 'checkpoint_every', 10)
                if checkpoint_every > 0 and experiment_count > 0 and experiment_count % checkpoint_every == 0:
                    # Send checkpoint notification
                    await self._send_checkpoint_notification(experiment_count, improvements_found)
                    
                    # Wait for user response (polling checkpoint state)
                    print(f"[{self.agent_name}] CHECKPOINT: Paused after {experiment_count} experiments. Waiting for user...")
                    project_id = getattr(self.config, 'project_id', '')
                    for _ in range(60):  # Wait up to 60 seconds for user response
                        await asyncio.sleep(1)
                        if project_id:
                            # Check if checkpoint is cleared (user continued)
                            from store import store
                            if not store.is_at_checkpoint(project_id):
                                print(f"[{self.agent_name}] CHECKPOINT: Resuming optimization...")
                                break
                    else:
                        # Timeout - continue anyway
                        print(f"[{self.agent_name}] CHECKPOINT: Timeout, resuming...")
                
                # Wait before next experiment
                print(f"[{self.agent_name}] Waiting {self.config.experiment_delay}s...")
                await asyncio.sleep(self.config.experiment_delay)
                
            except KeyboardInterrupt:
                print(f"[{self.agent_name}] Interrupted")
                break
            except Exception as e:
                print(f"[{self.agent_name}] Error: {e}")
                # Only count as failure if we've done at least 1 experiment
                if experiment_count > 0:
                    consecutive_failures += 1
                await asyncio.sleep(self.config.retry_delay)
        
        await self.api.close()
        print(f"[{self.agent_name}] Stopped after {experiment_count} experiments, {improvements_found} improvements")
    
    def stop(self) -> None:
        """Stop the agent loop."""
        self._running = False
