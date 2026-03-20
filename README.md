# FORGE — Autonomous Optimization Platform

The orchestration layer for autonomous AI experimentation. Define a metric, run the loop, wake up to better.

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.10+
- Google AI API key (for running real agents)

### Setup

```bash
# Frontend
cd forge-dashboard
npm install
npm run dev

# Backend (separate terminal)
cd backend
pip3 install --break-system-packages -r requirements.txt
python3 main.py
```

### Running the Demo

The dashboard (http://localhost:5173) includes pre-seeded mock data showing 47 experiments from an overnight run. This works without an API key.

### Running Real Agents

To run autonomous agents with Gemini Flash:

```bash
# Set your Google API key
export GOOGLE_API_KEY="your-key-here"

# Run demo agent (fast mode - 0.5s delay)
python3 run_demo.py --fast --limit 10

# Run with multiple agents
python3 run_demo.py --agents 3 --delay 3.0
```

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + Recharts
- **Backend**: FastAPI + WebSocket
- **Agents**: Async Python with Gemini Flash 2.0
- **Templates**: Pluggable optimization templates

### Templates

| Template | Description | Metric |
|----------|-------------|--------|
| `landing-page-cro` | Optimize landing pages for conversion | Conversion score (1-10) |
| `prompt-optimization` | Optimize prompts for task accuracy | Accuracy (%) |

## Project Structure

```
forge-dashboard/
├── src/
│   ├── App.tsx              # Main dashboard
│   ├── hooks/
│   │   └── useForgeStore.ts # API + WebSocket client
│   └── data/
│       └── mockData.ts      # Fallback mock data
├── backend/
│   ├── main.py              # FastAPI server
│   ├── config.py            # Settings
│   ├── models.py            # Pydantic models
│   ├── store.py             # In-memory state
│   ├── llm.py               # Gemini client
│   ├── templates/           # Optimization templates
│   │   ├── base.py
│   │   ├── landing_page.py
│   │   └── prompt_opt.py
│   ├── agents/              # Agent implementations
│   │   ├── base.py
│   │   └── forge_agent.py
│   └── run_demo.py          # Demo runner
└── README.md
```

## Tech Debt ⚠️

The following need to be addressed for production:

### 1. Database (PostgreSQL/Supabase)
- Frontend uses Supabase for authentication and project storage
- Backend currently uses in-memory Python dicts (pending full migration)

### 2. Coordination (Redis/Upstash)
- Currently using in-memory set for deduplication
- Needs: Redis for distributed agent coordination

### 3. Compute Routing
- No actual compute routing implemented
- Needs: Integration with Akash Network, RunPod, Lambda

### 4. Real Analytics Integration
- Currently using LLM-as-judge for metrics
- Needs: Google Analytics, PostHog, Plausible API integration

## Demo

The dashboard shows a pre-seeded run with 47 experiments. Connect agents to see real-time coordination.

### Demo Script

**Opening (30 seconds)**
- Open the dashboard at http://localhost:5173
- "I pointed Forge at a landing page last night. It ran 47 experiments autonomously. The conversion score went from 3.2 to 5.8."

**Walk Through (2 minutes)**
1. **Experiment Feed** (left panel) - Show recent experiments with hypotheses and results
2. **Optimization Curve** (center) - Show the upward trend  
3. **Current Best** (center bottom) - Show the optimized landing page
4. **Agent Status** (right panel) - Show agents and their activity
5. **Cost Tracker** - "47 experiments, a few cents total"

**The "Oh, It's Bigger" Moment (30 seconds)**
- Switch to Prompt Optimization template using dropdown
- "Same platform, different domain. This is what makes Forge special - it's not just for marketing."

**Live Demo (if API key available)**
```bash
cd backend
export GOOGLE_API_KEY="your-key"
python3 run_demo.py --fast
```
Watch experiments appear in real-time on the dashboard.

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /experiments/history/{id}` | Experiment history |
| `GET /experiments/global-best/{id}` | Current best |
| `POST /experiments/claim` | Claim experiment |
| `POST /experiments/publish` | Publish result |
| `GET /export/{id}` | Export JSON/CSV |
| `GET /share/{id}` | Shareable summary |
| `WS /ws/dashboard` | Real-time updates |

## License

MIT
