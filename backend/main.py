import asyncio
import json
import uuid
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, List, Optional, Set

from models import (
    Experiment, ExperimentStatus, Agent, AgentStatus,
    GlobalBest, HypothesisRequest, ExperimentPublish
)
from store import store

app = FastAPI(title="Forge API")

import os as _os
_allowed_origins_raw = _os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
_allowed_origins = [o.strip() for o in _allowed_origins_raw.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

active_websockets: Set[WebSocket] = set()


async def broadcast_to_websockets(data):
    """Broadcast a message to all connected WebSocket clients."""
    from datetime import datetime
    
    def convert_value(val):
        if isinstance(val, datetime):
            return val.isoformat()
        elif hasattr(val, 'model_dump'):
            return convert_value(val.model_dump(mode='json'))
        elif isinstance(val, dict):
            return {str(k): convert_value(v) for k, v in val.items()}
        elif isinstance(val, list):
            return [convert_value(v) for v in val]
        return val
    
    data = convert_value(data)
    message = json.dumps(data)
    dead_connections = set()
    
    for ws in active_websockets:
        try:
            await ws.send_text(message)
        except Exception:
            dead_connections.add(ws)
    
    for ws in dead_connections:
        active_websockets.discard(ws)


@app.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_websockets.add(websocket)
    
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        active_websockets.discard(websocket)


@app.post("/experiments/claim")
async def claim_experiment(
    agent_id: str,
    agent_name: str,
    template_id: str = "landing-page-cro",
    hypothesis: str = "",
    mutation: str = ""
):
    from models import HypothesisRequest
    claim = HypothesisRequest(
        agent_id=agent_id,
        agent_name=agent_name,
        template_id=template_id
    )
    exp, success = store.claim_experiment(claim, hypothesis, mutation)
    
    if not success:
        return {"success": False, "message": "Duplicate experiment"}
    
    await broadcast_to_websockets({
        "type": "experiment_claimed",
        "data": exp.model_dump() if exp else None
    })
    
    return {"success": True, "experiment_id": exp.id if exp else None}


@app.post("/experiments/publish")
async def publish_result(publish: ExperimentPublish):
    exp = store.publish_result(
        experiment_id=publish.experiment_id,
        metric_after=publish.metric_after,
        status=publish.status,
        reasoning=publish.reasoning
    )
    
    if not exp:
        return {"success": False, "message": "Experiment not found"}
    
    await broadcast_to_websockets({
        "type": "experiment_completed",
        "data": exp.model_dump() if exp else None
    })
    
    global_best = store.get_global_best(publish.template_id if hasattr(publish, 'template_id') else exp.template_id)
    if global_best:
        await broadcast_to_websockets({
            "type": "global_best_updated",
            "data": global_best.model_dump() if global_best else None
        })
    
    return {"success": True, "experiment": exp}


@app.get("/experiments/global-best/{template_id}")
async def get_global_best(template_id: str):
    best = store.get_global_best(template_id)
    if not best:
        return {"error": "Template not found"}
    return best.model_dump()


@app.post("/experiments/global-best/{template_id}")
async def update_global_best(template_id: str, config: dict):
    """Update the global best config after a successful experiment."""
    success = store.update_global_best_config(template_id, config)
    if success:
        best = store.get_global_best(template_id)
        await broadcast_to_websockets({
            "type": "global_best_updated",
            "data": best.model_dump() if best else None
        })
        return {"success": True}
    return {"success": False, "error": "Template not found"}


@app.get("/experiments/history/{template_id}")
async def get_experiment_history(template_id: str, limit: int = 50):
    exps = store.get_all_experiments(template_id)
    return [e.model_dump() for e in exps[:limit]]


@app.get("/agents")
async def get_agents():
    agents = store.get_agents()
    return [a.model_dump() for a in agents]


@app.post("/agents/register")
async def register_agent(agent: Agent):
    store.register_agent(agent)
    await broadcast_to_websockets({
        "type": "agent_registered",
        "data": agent.model_dump()
    })
    return {"success": True}


@app.post("/agents/update-status")
async def update_agent_status(body: dict):
    """Update agent status. Accepts JSON body: {agent_id, status, hypothesis?}"""
    agent_id = body.get("agent_id")
    status = body.get("status", "idle")
    hypothesis = body.get("hypothesis", "")
    
    if not agent_id:
        return {"success": False, "error": "agent_id required"}
    
    try:
        agent_status = AgentStatus(status)
    except ValueError:
        agent_status = AgentStatus.IDLE
    
    store.update_agent_status(agent_id, agent_status, hypothesis or None)
    await broadcast_to_websockets({
        "type": "agent_status_updated",
        "data": {"agent_id": agent_id, "status": status, "hypothesis": hypothesis}
    })
    return {"success": True}


@app.get("/health")
async def health_check():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.get("/export/{template_id}")
async def export_experiments(template_id: str, format: str = "json"):
    """Export experiment history for a template."""
    exps = store.get_all_experiments(template_id)
    best = store.get_global_best(template_id)
    
    export_data = {
        "template_id": template_id,
        "exported_at": datetime.now().isoformat(),
        "total_experiments": len(exps),
        "global_best": best.model_dump() if best else None,
        "experiments": [e.model_dump() for e in exps]
    }
    
    if format == "csv":
        # Simple CSV format
        csv_lines = ["id,agent,hypothesis,metric_before,metric_after,status,reasoning"]
        for e in exps:
            row = f'{e.id},{e.agent_name},"{e.hypothesis}",{e.metric_before},{e.metric_after},{e.status},"{e.reasoning}"'
            csv_lines.append(row)
        return "\n".join(csv_lines)
    
    return export_data


@app.get("/share/{template_id}")
async def get_shareable_results(template_id: str):
    """Get shareable summary of results."""
    exps = store.get_all_experiments(template_id)
    best = store.get_global_best(template_id)
    
    if not best:
        return {"error": "No data found"}
    
    # Get improvements
    improvements = [e for e in exps if e.status == "success"]
    improvements.sort(key=lambda x: x.metric_after, reverse=True)
    
    return {
        "template_id": template_id,
        "summary": {
            "total_experiments": len(exps),
            "improvements": len(improvements),
            "success_rate": f"{(len(improvements)/len(exps)*100):.1f}%" if exps else "0%",
            "current_best": best.metric,
            "baseline": 3.2,
            "improvement": f"+{best.metric - 3.2:.1f}"
        },
        "top_improvements": [
            {
                "hypothesis": e.hypothesis,
                "mutation": e.mutation,
                "metric_before": e.metric_before,
                "metric_after": e.metric_after,
                "gain": e.metric_after - e.metric_before
            }
            for e in improvements[:5]
        ],
        "best_config": best.config
    }


@app.post("/projects")
async def create_project(name: str, template_id: str, description: str = ""):
    """Create a new project."""
    from models import Project
    project = Project(
        id=f"proj-{uuid.uuid4().hex[:8]}",
        name=name,
        template_id=template_id,
        description=description,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    store.projects[project.id] = project
    return {"success": True, "project": project.model_dump()}


@app.get("/projects")
async def list_projects():
    """List all projects."""
    return [p.model_dump() for p in store.projects.values()]


@app.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get a specific project."""
    project = store.projects.get(project_id)
    if not project:
        return {"error": "Project not found"}
    return project.model_dump()


@app.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    """Delete a project."""
    if project_id in store.projects:
        del store.projects[project_id]
        return {"success": True}
    return {"error": "Project not found"}


# ═══════════════════════════════════════════════════════════════════════════════
# EVALUATOR REGISTRY ENDPOINTS (Tier 1-3 Hybrid System)
# ═══════════════════════════════════════════════════════════════════════════════

from evaluators.registry import (
    list_all_evaluators,
    recommend_evaluator,
    get_evaluator_spec,
    InputFormat,
    EvaluatorCategory
)
from templates import get_template

@app.get("/evaluators")
async def list_evaluators():
    """List all available evaluators."""
    evaluators = []
    for e in list_all_evaluators():
        evaluators.append({
            "id": e.id,
            "name": e.name,
            "category": e.category.value,
            "input_format": e.input_format.value,
            "editable_fields": e.editable_fields,
            "source": e.source,
            "metrics": [{"name": m.name, "direction": m.direction} for m in e.metrics],
        })
    return {"evaluators": evaluators}


@app.post("/evaluators/recommend")
async def recommend_evaluator_endpoint(body: dict):
    """
    Get evaluator recommendation based on user description.
    
    Body:
    {
        "description": "I want to optimize my landing page",
        "sample_data": {...}  // optional
    }
    """
    description = body.get("description", "")
    sample_data = body.get("sample_data")
    
    result = recommend_evaluator(description, sample_data)
    
    # Also return the full spec if confidence is high enough
    spec = get_evaluator_spec(result["evaluator_id"])
    if spec and result["confidence"] >= 0.7:
        return {
            "recommended_evaluator": result["evaluator_id"],
            "confidence": result["confidence"],
            "spec": {
                "id": spec.id,
                "name": spec.name,
                "editable_fields": spec.editable_fields,
                "metrics": [{"name": m.name, "direction": m.direction, "weight": m.weight} for m in spec.metrics],
                "guardrails": [{"name": g.name, "threshold": g.threshold, "direction": g.direction} for g in spec.guardrails],
            }
        }
    
    return result


@app.get("/evaluators/{evaluator_id}")
async def get_evaluator(evaluator_id: str):
    """Get full evaluator specification."""
    spec = get_evaluator_spec(evaluator_id)
    if not spec:
        return {"error": "Evaluator not found"}
    
    return {
        "id": spec.id,
        "name": spec.name,
        "category": spec.category.value,
        "input_format": spec.input_format.value,
        "editable_fields": spec.editable_fields,
        "source": spec.source,
        "metrics": [
            {
                "name": m.name,
                "description": m.description,
                "direction": m.direction,
                "weight": m.weight
            }
            for m in spec.metrics
        ],
        "guardrails": [
            {
                "name": g.name,
                "threshold": g.threshold,
                "direction": g.direction,
                "fail_message": g.fail_message
            }
            for g in spec.guardrails
        ],
        "constraints": spec.constraints,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# PROJECT START — spawn agents for a specific project
# ═══════════════════════════════════════════════════════════════════════════════

# Track running agent tasks per project so we don't double-spawn
_running_project_tasks: Dict[str, List[asyncio.Task]] = {}


async def _run_agent_task(project_id: str, template_id: str, role: str, agent_idx: int, max_experiments: int = 50, checkpoint_every: int = 10):
    """Background coroutine: run one agent for a project."""
    try:
        from config import load_settings
        from agents.forge_agent import ForgeAgent

        settings = load_settings()
        settings.agent_id = f"{project_id}-agent-{agent_idx}"
        settings.agent_name = f"{role.capitalize()} Agent"
        settings.template_id = template_id
        settings.experiment_delay = 3.0
        settings.max_experiments = max_experiments
        settings.checkpoint_every = checkpoint_every
        settings.project_id = project_id

        agent = ForgeAgent(settings, role=role)
        await agent.run_loop()
    except Exception as e:
        print(f"[project:{project_id}] Agent {agent_idx} error: {e}")


@app.post("/projects/{project_id}/start")
async def start_project_agents(project_id: str, body: dict = {}):
    """
    Spawn agents for a project.

    Body (all optional):
      {
        "agent_count": 3,                  // 1, 2, or 3
        "roles": ["explorer", "refiner", "synthesizer"],
        "template_id": "dcf-model"         // overrides project template
      }
    """
    # Cancel any already-running agents for this project
    existing = _running_project_tasks.get(project_id, [])
    for task in existing:
        if not task.done():
            task.cancel()

    project = store.projects.get(project_id)
    template_id = body.get("template_id") or (project.template_id if project else "landing-page-cro")

    agent_count = int(body.get("agent_count", 1))
    roles_order = ["explorer", "refiner", "synthesizer"]
    roles = body.get("roles", roles_order[:agent_count])
    max_experiments = int(body.get("max_experiments", 50))
    checkpoint_every = int(body.get("checkpoint_every", 10))  # Default: checkpoint every 10 experiments

    tasks = []
    for i, role in enumerate(roles[:agent_count]):
        task = asyncio.create_task(
            _run_agent_task(project_id, template_id, role, i + 1, max_experiments=max_experiments, checkpoint_every=checkpoint_every)
        )
        tasks.append(task)

    _running_project_tasks[project_id] = tasks

    await broadcast_to_websockets({
        "type": "project_started",
        "data": {"project_id": project_id, "template_id": template_id, "agent_count": agent_count, "roles": roles[:agent_count]}
    })

    return {"success": True, "project_id": project_id, "agents_started": agent_count, "roles": roles[:agent_count]}


@app.post("/projects/{project_id}/stop")
async def stop_project_agents(project_id: str):
    """Cancel all running agents for a project."""
    tasks = _running_project_tasks.pop(project_id, [])
    cancelled = 0
    for task in tasks:
        if not task.done():
            task.cancel()
            cancelled += 1
    store.clear_checkpoint(project_id)
    return {"success": True, "agents_stopped": cancelled}


@app.get("/projects/{project_id}/checkpoint")
async def get_checkpoint_state(project_id: str):
    """Get checkpoint state for a project."""
    state = store.get_checkpoint_state(project_id)
    global_best = store.get_global_best(
        body.get("template_id", "landing-page-cro") if (body := {}) else "landing-page-cro"
    )
    recent = store.get_recent_experiments(
        body.get("template_id", "landing-page-cro") if (body := {}) else "landing-page-cro",
        limit=10
    )
    return {
        "project_id": project_id,
        "at_checkpoint": state.get("at_checkpoint", False),
        "paused": state.get("paused", False),
        "message": state.get("message", ""),
        "timestamp": state.get("timestamp", ""),
        "current_best": {
            "metric": global_best.metric if global_best else 0,
            "config": global_best.config if global_best else {}
        } if global_best else None,
        "recent_experiments": [
            {
                "id": e.id,
                "hypothesis": e.hypothesis,
                "metric_before": e.metric_before,
                "metric_after": e.metric_after,
                "status": e.status.value if hasattr(e.status, 'value') else str(e.status)
            }
            for e in recent[:5]
        ]
    }


@app.post("/projects/{project_id}/checkpoint/continue")
async def continue_from_checkpoint(project_id: str):
    """Continue optimization from a checkpoint."""
    store.clear_checkpoint(project_id)
    
    # Broadcast resume event
    await broadcast_to_websockets({
        "type": "checkpoint_resumed",
        "project_id": project_id,
        "message": "Optimization continued"
    })
    
    return {"success": True, "message": "Continuing optimization"}


@app.post("/projects/{project_id}/checkpoint/stop")
async def stop_at_checkpoint(project_id: str):
    """Stop optimization at a checkpoint."""
    store.clear_checkpoint(project_id)
    tasks = _running_project_tasks.pop(project_id, [])
    for task in tasks:
        if not task.done():
            task.cancel()
    
    await broadcast_to_websockets({
        "type": "checkpoint_stopped",
        "project_id": project_id,
        "message": "Optimization stopped by user"
    })
    
    return {"success": True, "message": "Optimization stopped"}


@app.post("/projects/{project_id}/checkpoint/redirect")
async def redirect_from_checkpoint(project_id: str, body: dict):
    """Redirect optimization with new constraints."""
    store.clear_checkpoint(project_id)
    
    new_direction = body.get("direction", "")
    
    await broadcast_to_websockets({
        "type": "checkpoint_redirected",
        "project_id": project_id,
        "direction": new_direction,
        "message": f"Optimization redirected: {new_direction}"
    })
    
    return {"success": True, "message": f"Redirected: {new_direction}"}


# ═══════════════════════════════════════════════════════════════════════
# PROJECT INITIALIZATION — Set up initial config from user content
# ═══════════════════════════════════════════════════════════════════════

@app.post("/projects/{project_id}/initialize")
async def initialize_project(project_id: str, body: dict):
    """
    Initialize a project with custom config from user input.
    
    Body:
    {
        "template_id": "landing-page-cro",
        "content_input": "..." or {...},
        "baseline_metric": 50.0
    }
    
    This parses user content and sets up the global best state.
    """
    template_id = body.get("template_id", "landing-page-cro")
    content_input = body.get("content_input", "")
    baseline_metric = body.get("baseline_metric")
    
    try:
        template = get_template(template_id)
        
        # Parse user content into config
        config = template.parse_user_input(content_input) if content_input else template.default_config.copy()
        
        # Set initial metric (either provided or use template default)
        metric = baseline_metric if baseline_metric is not None else template.get_default_metric()
        
        # Store in global best
        store.global_best[template_id] = GlobalBest(
            template_id=template_id,
            metric=metric,
            config=config,
            experiment_count=0,
            last_updated=datetime.now()
        )
        
        return {
            "success": True,
            "template_id": template_id,
            "config": config,
            "metric": metric,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@app.get("/projects/{project_id}/export")
async def export_project(project_id: str, format: str = "json"):
    """
    Export the optimized result in the original input format.
    
    This converts the optimized config back to user-friendly output.
    """
    project = store.projects.get(project_id)
    if not project:
        return {"error": "Project not found"}
    
    template_id = project.template_id
    best = store.get_global_best(template_id)
    
    if not best:
        return {"error": "No optimization results found"}
    
    try:
        template = get_template(template_id)
        
        # Convert config back to original format
        output = template.config_to_output(best.config)
        
        return {
            "success": True,
            "project_id": project_id,
            "template_id": template_id,
            "metric": best.metric,
            "experiment_count": best.experiment_count,
            "output": output,
            "format": format,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
