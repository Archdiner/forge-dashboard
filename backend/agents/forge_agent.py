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

    def __init__(self, config: Settings, role: str = "explorer"):
        self.config = config
        self.role = role.lower()
        self.template = get_template(config.template_id)
        self.llm = GeminiClient(config.google_api_key)
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
    
    async def run_single_experiment(self, template_id: str) -> bool:
        """Run a single experiment cycle."""
        print(f"\n[{self.agent_name}] Starting experiment...")
        
        # 1. Get current state
        best = await self.get_global_best(template_id)
        if not best:
            print(f"[{self.agent_name}] Failed to get global best, skipping")
            return False
        
        history = await self.get_history(template_id)
        
        # 2. Generate hypothesis
        await self.update_status("thinking", "Generating hypothesis...")
        base_prompt = self.template.generate_hypothesis_prompt(best, history)
        _, _, role_addendum = self.ROLE_CONFIGS.get(self.role, (0.7, "medium", ""))
        prompt = f"{base_prompt}\n\nAGENT ROLE ({self.role.upper()}): {role_addendum}"

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
        
        # 5. Evaluate — call the template's evaluator directly.
        # Deterministic templates ignore llm; LLM-powered templates (e.g. prompt_opt) use it.
        await self.update_status("running", "Evaluating...")
        result = self.template.evaluate(mutated_config, llm=self.llm)
        
        print(f"[{self.agent_name}] Result: {result.metric:.2f} ({result.reasoning[:50]}...)")
        
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
            # Update global best config if this was an improvement
            if is_improvement:
                await self.api.update_global_best(template_id, mutated_config)
            
            if is_improvement:
                print(f"[{self.agent_name}] ✓ IMPROVEMENT! {best.metric:.1f} → {result.metric:.1f}")
            else:
                print(f"[{self.agent_name}] ✗ No improvement: {best.metric:.1f} → {result.metric:.1f}")
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
        improvement_threshold = getattr(self.config, 'improvement_threshold', 0.01)  # Minimum improvement to count
        
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
                    
                    # Check if this was an improvement
                    best_after = await self.get_global_best(self.config.template_id)
                    if best_after:
                        metric_after = best_after.metric
                        
                        if metric_after > metric_before + improvement_threshold:
                            improvements_found += 1
                            consecutive_failures = 0  # Reset on improvement
                            print(f"[{self.agent_name}] Improvement! {metric_before:.2f} → {metric_after:.2f} (+{((metric_after - metric_before) / metric_before * 100):.1f}%)")
                        else:
                            consecutive_failures += 1
                            print(f"[{self.agent_name}] No improvement ({consecutive_failures}/{plateau_patience} failures)")
                else:
                    # Failed experiment - don't count toward plateau unless we've done at least 1 successful
                    if experiment_count > 0:
                        consecutive_failures += 1
                
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
