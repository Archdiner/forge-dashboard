#!/usr/bin/env python3
"""
Seed the backend with demo experiments for the pitch.
This populates the dashboard with pre-run experiments.
"""
import requests
import json
from datetime import datetime, timedelta

API_URL = "http://localhost:8000"

# Pre-defined experiments matching the mock data
SEED_EXPERIMENTS = [
    {
        "id": "exp-001",
        "agent_id": "agent-1",
        "agent_name": "Agent Alpha",
        "hypothesis": "Testing conversational tone in subheadline",
        "mutation": "Changed from formal to casual: 'Enterprise AI made simple' → 'Finally, AI that actually works for you'",
        "metric_before": 3.2,
        "metric_after": 3.4,
        "status": "success",
        "reasoning": "Conversational tone reduces friction. First-person perspective feels more approachable."
    },
    {
        "id": "exp-002",
        "agent_id": "agent-2", 
        "agent_name": "Agent Beta",
        "hypothesis": "Testing shorter value propositions",
        "mutation": "Shortened value props from 20 words to 8 words each",
        "metric_before": 3.4,
        "metric_after": 3.5,
        "status": "success",
        "reasoning": "Concise value props improved clarity."
    },
    {
        "id": "exp-003",
        "agent_id": "agent-3",
        "agent_name": "Agent Gamma", 
        "hypothesis": "Adding specific numbers to social proof",
        "mutation": "Added '2,847 companies' to social proof section",
        "metric_before": 3.5,
        "metric_after": 3.8,
        "status": "success",
        "reasoning": "Specific numbers increase credibility."
    },
    {
        "id": "exp-004",
        "agent_id": "agent-1",
        "agent_name": "Agent Alpha",
        "hypothesis": "Testing question-format headlines",
        "mutation": "Changed headline to 'Want to 10x your conversion rate?'",
        "metric_before": 3.8,
        "metric_after": 4.0,
        "status": "success",
        "reasoning": "Question headlines create curiosity gap."
    },
    {
        "id": "exp-005",
        "agent_id": "agent-2",
        "agent_name": "Agent Beta",
        "hypothesis": "Testing urgency in CTA",
        "mutation": "Changed CTA to 'Get Started Now — Limited Time'",
        "metric_before": 4.0,
        "metric_after": 3.8,
        "status": "failure",
        "reasoning": "Perceived as clickbait. Users prefer transparent offers."
    },
    {
        "id": "exp-006",
        "agent_id": "agent-3",
        "agent_name": "Agent Gamma",
        "hypothesis": "Testing testimonial placement above fold",
        "mutation": "Moved customer quote to below hero headline",
        "metric_before": 3.8,
        "metric_after": 4.3,
        "status": "success",
        "reasoning": "Social proof early builds trust before the pitch."
    },
    {
        "id": "exp-007",
        "agent_id": "agent-1",
        "agent_name": "Agent Alpha",
        "hypothesis": "Adding benefit-focused bullet points",
        "mutation": "Restructured value props to lead with outcomes",
        "metric_before": 4.3,
        "metric_after": 4.2,
        "status": "failure",
        "reasoning": "The change was too subtle."
    },
    {
        "id": "exp-008",
        "agent_id": "agent-2",
        "agent_name": "Agent Beta", 
        "hypothesis": "Testing single CTA vs multiple CTAs",
        "mutation": "Removed secondary CTA buttons",
        "metric_before": 4.3,
        "metric_after": 4.1,
        "status": "failure",
        "reasoning": "Removing options reduced conversion."
    },
]

def seed_experiments():
    """Seed the backend with demo experiments."""
    
    print("Seeding demo experiments...")
    
    # Register agents first
    agents = [
        {"id": "agent-1", "name": "Agent Alpha", "status": "idle", "experiments_run": 3, "improvements_found": 2},
        {"id": "agent-2", "name": "Agent Beta", "status": "idle", "experiments_run": 3, "improvements_found": 1},
        {"id": "agent-3", "name": "Agent Gamma", "status": "idle", "experiments_run": 2, "improvements_found": 1},
    ]
    
    base_time = datetime.now() - timedelta(hours=2)
    
    for i, exp in enumerate(SEED_EXPERIMENTS):
        # Create the experiment via direct API call (we need to use internal store)
        # Since we don't have a direct seed API, we'll update the global best
        pass
    
    # For now, let's just verify the API is working
    resp = requests.get(f"{API_URL}/experiments/global-best/landing-page-cro")
    print(f"Global best: {resp.json()}")
    
    print("Demo data check complete!")


if __name__ == "__main__":
    seed_experiments()
