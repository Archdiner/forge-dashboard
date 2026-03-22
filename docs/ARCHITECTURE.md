# FORGE Architecture Documentation

## Overview

Forge is an autonomous optimization platform that runs AI-powered experiments to find the best version of any content. It's designed for growth teams who want to test thousands of variations overnight without waiting for A/B testing statistical significance.

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                           │
│                                                                      │
│  Pages:                                                              │
│  - Landing.tsx      (Public marketing page)                        │
│  - Demo.tsx         (Live demo with impressive data)               │
│  - Login.tsx        (Supabase authentication)                      │
│  - Dashboard/       (Protected app)                                 │
│    - ProjectsList   (List of optimization projects)                │
│    - NewJob         (Submit new optimization job)                   │
│    - ProjectDetails (Monitor results in real-time)                  │
│                                                                      │
│  Hooks:                                                              │
│  - useForgeStore.ts   (WebSocket + API client, real-time updates)   │
└───────────────────────────────┬─────────────────────────────────────┘
                                │ HTTP + WebSocket
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                              │
│                                                                      │
│  API Endpoints:                                                      │
│  ─────────────────                                                   │
│  Projects:                                                           │
│  - POST /projects                    (create project)               │
│  - GET  /projects                    (list projects)                │
│  - GET  /projects/{id}               (get project)                │
│  - POST /projects/{id}/start         (start agents)                │
│  - POST /projects/{id}/stop          (stop agents)                │
│  - POST /projects/{id}/initialize    (setup with user content)     │
│                                                                      │
│  Experiments:                                                        │
│  - POST /experiments/claim            (agent claims experiment)     │
│  - POST /experiments/publish          (agent publishes result)     │
│  - GET  /experiments/history/{id}    (experiment history)           │
│  - GET  /experiments/global-best/{id} (current best)               │
│                                                                      │
│  Evaluators:                                                         │
│  - GET  /evaluators                   (list available evaluators)   │
│  - POST /evaluators/recommend        (AI recommends template)       │
│  - GET  /evaluators/{id}             (get evaluator spec)          │
│                                                                      │
│  Real-time:                                                          │
│  - WS   /ws/dashboard                (WebSocket for live updates)  │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      AGENTS (Python)                                │
│                                                                      │
│  ForgeAgent (forge_agent.py):                                       │
│  - Roles: Explorer, Refiner, Synthesizer                            │
│  - Loop: get_best → generate_hypothesis → claim → evaluate → publish│
│  - Checkpoint: pause every N experiments for human review          │
│  - Plateau detection: stop after 15 consecutive failures           │
│                                                                      │
│  Configuration (config.py):                                          │
│  - experiment_delay: seconds between experiments (default: 3.0)     │
│  - max_experiments: hard cap (default: 50)                         │
│  - checkpoint_every: pause every N experiments (default: 10)        │
│  - plateau_patience: stop after N failures (default: 15)          │
└───────────────────────────────┬─────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      STORAGE                                        │
│                                                                      │
│  Supabase (PostgreSQL):                                             │
│  - users (via Supabase Auth)                                        │
│  - projects (user_id, name, template_id, config, status)            │
│                                                                      │
│  In-Memory Store (store.py):                                         │
│  - experiments (resets on restart)                                  │
│  - global_best (current best per template)                          │
│  - agents (agent status)                                            │
│  - checkpoint_state (pause/resume state)                            │
│                                                                      │
│  ⚠️  TODO: Persist experiments to Supabase for production          │
└─────────────────────────────────────────────────────────────────────┘
```

## User Flow

### 1. Landing → Demo
User lands on marketing page, sees the value proposition, clicks "See Demo" to view the live demo.

### 2. Demo → Sign Up
User clicks "Get Started", creates account via Supabase Auth.

### 3. Create Project
User navigates to "New Project" and:
1. Describes their optimization problem (e.g., "I want to improve my ad copy CTR")
2. Optionally pastes their current content
3. Optionally sets success criteria
4. Selects agent swarm (1-3 agents)
5. Submits the job

### 4. Monitor Progress
User is redirected to ProjectDetails page where they can:
- Watch the optimization curve in real-time
- See agent status and current tasks
- Browse experiment log
- Copy the best result when done

### 5. Checkpoint (Optional)
At configurable intervals, agents pause and wait for user input:
- Continue optimization
- Redirect with new constraints
- Stop entirely

## Templates

| Template | Metric | Use Case |
|----------|--------|----------|
| `landing-page-cro` | Conversion Score (0-100) | Landing page optimization |
| `email-outreach` | Email Score (0-100) | Cold email reply rates |
| `ad-copy` | Ad Score (0-100) | Meta/Google Ads CTR |
| `prompt-optimization` | Accuracy (0-1) | AI prompt optimization |
| `portfolio-optimization` | Sharpe Ratio | Asset allocation |
| `dcf-model` | IRR | Financial modeling |

## Agent System

### Roles

| Role | Temperature | Strategy |
|------|-------------|----------|
| Explorer | 0.9 | Large, diverse changes |
| Refiner | 0.3 | Small, precise changes |
| Synthesizer | 0.6 | Combine best mutations |

### Loop

```
1. Get current global best config
2. Get experiment history
3. Generate hypothesis (LLM)
4. Claim experiment (prevent duplicates)
5. Apply mutation to config
6. Evaluate (deterministic + optional LLM-judge)
7. Publish result
8. Update global best if improved
9. Wait (configurable delay)
10. Repeat until max_experiments or plateau
```

## Real-time Updates

The frontend connects via WebSocket to receive:
- Experiment claimed/completed events
- Global best updates
- Agent status changes
- Checkpoint notifications

## Pricing Model (Planned)

| Tier | Price | Experiments/mo | Templates |
|------|-------|----------------|-----------|
| Free | $0 | 50 | 1 |
| Pro | $29/mo | 2,000 | All |
| Team | $99/mo | 10,000 | All + API |

**Unit Economics:**
- Cost per experiment: ~$0.0003 (Gemini Flash 2.0)
- Gross margin: 99%+

## Competitive Analysis

| Competitor | Price | Differentiation |
|------------|-------|-----------------|
| Optimizely | Enterprise ($50K+/yr) | Full-stack, enterprise-focused |
| VWO | $49-99/mo | A/B testing + AI copilot |
| Convert | $199+/mo | Developer-focused |
| Google Optimize | 💀 Dead | Was free, now discontinued |

**Forge's Edge:** Affordable, autonomous, overnight experimentation for growth teams.

## Market

- **TAM:** $344B (global martech)
- **SAM:** $3.2B (AI experimentation)
- **SOM:** $180-400M (SMB growth tools)

## Product Roadmap

### Phase 1: MVP (Current)
- [x] Working agent system
- [x] Real-time dashboard
- [x] Demo page
- [x] Landing page
- [ ] Persistent storage
- [ ] Usage tracking

### Phase 2: Beta
- [ ] Persistent experiment storage
- [ ] Usage tracking
- [ ] Email notifications
- [ ] Beta user acquisition

### Phase 3: Launch
- [ ] Analytics integrations (GA, PostHog)
- [ ] Ad platform connections (Meta, Google)
- [ ] Stripe billing
- [ ] Pricing page

### Phase 4: Scale
- [ ] API
- [ ] Enterprise features (SSO, SLA)
- [ ] More templates
