#!/usr/bin/env python3
"""
Demo runner for Forge.

This script runs a pre-seeded optimization to populate the dashboard
with experiments before the demo. Uses faster delays for demo purposes.

Usage:
    python run_demo.py                    # Run landing page template
    python run_demo.py --template prompt  # Run prompt optimization
    python run_demo.py --agents 3         # Run with 3 agents
    python run_demo.py --limit 47          # Run 47 experiments then stop
"""
import asyncio
import argparse
import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import load_settings
from agents.forge_agent import ForgeAgent


ROLES = ["explorer", "refiner", "synthesizer"]


async def run_agent(agent_id: str, agent_name: str, template_id: str, delay: float, max_experiments: int = None, role: str = "explorer"):
    """Run a single agent with a given role."""
    settings = load_settings()
    settings.agent_id = agent_id
    settings.agent_name = agent_name
    settings.template_id = template_id
    settings.experiment_delay = delay

    agent = ForgeAgent(settings, role=role)
    
    count = 0
    while max_experiments is None or count < max_experiments:
        try:
            success = await agent.run_single_experiment(template_id)
            if success:
                count += 1
                print(f"[{agent_name}] Completed {count} experiments")
            
            await asyncio.sleep(delay)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[{agent_name}] Error: {e}")
            await asyncio.sleep(1)
    
    print(f"[{agent_name}] Finished: {count} experiments")


async def run_multi_agent(agents: int, template_id: str, delay: float, max_per_agent: int = None):
    """Run multiple agents concurrently with differentiated roles."""
    print(f"Starting {agents} agents with {delay}s delay...")

    tasks = []
    for i in range(agents):
        role = ROLES[i % len(ROLES)]
        agent_id = f"agent-{i+1}"
        agent_name = f"{role.capitalize()} Agent"

        print(f"  Spawning {agent_name} (role={role})")
        task = asyncio.create_task(
            run_agent(agent_id, agent_name, template_id, delay, max_per_agent, role=role)
        )
        tasks.append(task)

        await asyncio.sleep(0.5)

    await asyncio.gather(*tasks, return_exceptions=True)


async def run_single_agent(template_id: str, delay: float, max_experiments: int = None):
    """Run a single agent."""
    settings = load_settings()
    settings.template_id = template_id
    settings.experiment_delay = delay
    
    agent = ForgeAgent(settings)
    print(f"Starting {settings.agent_name} with {delay}s delay...")
    
    count = 0
    while max_experiments is None or count < max_experiments:
        try:
            success = await agent.run_single_experiment(template_id)
            if success:
                count += 1
                print(f"[DEMO] Completed {count} experiments")
            
            if max_experiments and count >= max_experiments:
                break
            
            await asyncio.sleep(delay)
        except KeyboardInterrupt:
            break
        except Exception as e:
            print(f"[DEMO] Error: {e}")
            await asyncio.sleep(1)
    
    print(f"[DEMO] Finished: {count} experiments")
    await agent.api.close()


def main():
    parser = argparse.ArgumentParser(description="Run Forge demo agent")
    parser.add_argument("--template", "-t", default="landing-page-cro",
                       choices=["landing-page-cro", "prompt-optimization", "email-outreach", "portfolio-optimization", "dcf-model"],
                       help="Template to use")
    parser.add_argument("--agents", "-a", type=int, default=1,
                       help="Number of agents to run")
    parser.add_argument("--delay", "-d", type=float, default=3.0,
                       help="Delay between experiments (seconds)")
    parser.add_argument("--limit", "-l", type=int, default=None,
                       help="Max experiments per agent")
    parser.add_argument("--fast", "-f", action="store_true",
                       help="Fast mode - 0.5s delay, single agent")
    
    args = parser.parse_args()
    
    if args.fast:
        args.delay = 0.5
        args.agents = 1
    
    template_map = {
        "landing-page-cro": "Landing Page CRO",
        "prompt-optimization": "Prompt Optimization",
        "email-outreach": "Email Outreach",
        "portfolio-optimization": "Portfolio Optimization",
        "dcf-model": "DCF Model",
    }
    
    print(f"=== FORGE Demo Runner ===")
    print(f"Template: {template_map.get(args.template, args.template)}")
    print(f"Agents: {args.agents}")
    print(f"Delay: {args.delay}s")
    if args.limit:
        print(f"Limit: {args.limit} experiments")
    print("=========================\n")
    
    if args.agents > 1:
        asyncio.run(run_multi_agent(args.agents, args.template, args.delay, args.limit))
    else:
        asyncio.run(run_single_agent(args.template, args.delay, args.limit))
    
    print("\n[DEMO] Done!")


if __name__ == "__main__":
    main()
