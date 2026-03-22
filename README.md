# FORGE — Autonomous Optimization Platform for Growth Teams

> Run 1,000 experiments overnight. Wake up to better ad copy, landing pages, and emails.

## The Pitch

**One-liner:** Forge gives growth teams autonomous experimentation — define a metric, run the loop, wake up to better.

**The Problem:**
- A/B testing takes weeks to reach statistical significance
- Most companies don't test because it's too slow and expensive
- Enterprise tools (Optimizely, VWO) cost $50K+/year

**The Solution:**
- Run 1,000+ experiments overnight for pennies
- AI agents generate, test, and evaluate autonomously
- Wake up to the optimized version

**The Demo:**
- 100+ experiments
- 103% improvement (3.2 → 6.5 conversion score)
- Total cost: ~$0.03

---

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

### Access the App

| Page | URL | Description |
|------|-----|-------------|
| Landing | http://localhost:5173 | Marketing page |
| Demo | http://localhost:5173/demo | Live demo with impressive data |
| Dashboard | http://localhost:5173/dashboard | App (requires login) |

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

---

## Product Overview

### What Forge Does

1. **Connect your content** — Paste ad copy, landing page, or email
2. **Define your metric** — CTR, conversion rate, reply rate
3. **Run overnight** — AI agents test thousands of variations
4. **Wake up better** — Get the optimized version with full report

### Use Cases

| Use Case | Metric | Status |
|----------|--------|--------|
| Landing Page CRO | Conversion Score | ✅ Ready |
| Ad Copy (Meta/Google) | CTR | ✅ Ready |
| Cold Email | Reply Rate | ✅ Ready |
| AI Prompts | Accuracy | ✅ Ready |
| Portfolio | Sharpe Ratio | ✅ Ready |
| DCF Models | IRR | ✅ Ready |

### Templates

Forge uses pluggable templates for different optimization domains:

- **landing-page-cro**: Optimize headlines, CTAs, value props
- **ad-copy**: Meta/Google Ads optimization
- **email-outreach**: Cold email subject lines and body
- **prompt-optimization**: AI prompt tuning
- **portfolio-optimization**: Asset allocation
- **dcf-model**: Financial modeling

---

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS + Recharts
- **Backend**: FastAPI + WebSocket
- **Agents**: Async Python with Gemini Flash 2.0
- **Database**: Supabase (Auth + Projects)
- **Storage**: In-memory (experiments), Supabase (projects)

### Agent System

Forge uses a multi-agent system with three roles:

| Role | Temperature | Strategy |
|------|-------------|----------|
| Explorer | 0.9 | Large, diverse changes |
| Refiner | 0.3 | Small, precise changes |
| Synthesizer | 0.6 | Combine best mutations |

The agents run in a loop:
1. Get current best config
2. Generate hypothesis
3. Claim experiment (prevent duplicates)
4. Apply mutation
5. Evaluate (deterministic scoring)
6. Publish result
7. Update global best if improved

### Checkpoint System

Agents pause at configurable intervals for human oversight:
- Continue optimization
- Redirect with new constraints
- Stop entirely

---

## Market & Competition

### Market Size

| Layer | Market | Source |
|-------|--------|--------|
| TAM | $344B | Global martech (ChiefMartec 2023) |
| SAM | $3.2B | AI experimentation |
| SOM | $180-400M | SMB growth tools |

### Competitive Landscape

| Competitor | Price | Weakness |
|------------|-------|----------|
| Optimizely | Enterprise ($50K+/yr) | Too expensive for SMB |
| VWO | $49-99/mo | Complex, enterprise-focused |
| Convert | $199+/mo | No AI features |
| Manual A/B | Free | Slow, limited scope |
| Google Optimize | 💀 Dead | Left gap in market |

### Why Forge Wins
- **Price**: $29/mo (vs $49+)
- **Speed**: Overnight (vs weeks)
- **Scope**: 1,000+ experiments (vs 2-5)
- **Simplicity**: No stats knowledge needed

---

## Business Model

### Pricing Tiers

| Tier | Price | Experiments/mo | Target |
|------|-------|----------------|--------|
| Free | $0 | 50 | Learning |
| Pro | $29/mo | 2,000 | Growth teams |
| Team | $99/mo | 10,000 | Agencies |
| Enterprise | Custom | Unlimited | Mid-market |

### Unit Economics

- **Cost per experiment**: ~$0.0003 (Gemini Flash 2.0)
- **Effective price**: ~$0.01-0.02/experiment
- **Gross margin**: 99%+

### Comparable Exits

| Company | Valuation | Revenue |
|---------|-----------|---------|
| VWO (Wingify) | $200M | $50M ARR |
| Statsig | $1.1B (acquired) | ~$100M |
| Eppo | $80M | Undisclosed |

---

## Traction & Roadmap

### Current Status

- ✅ Working agent system
- ✅ Real-time dashboard
- ✅ Demo page (http://localhost:5173/demo)
- ✅ Landing page with growth positioning
- ✅ 6 templates (including ad-copy)
- ⏳ Persistent experiment storage (in progress)
- ⏳ Usage tracking (in progress)

### Demo Stats

- **Experiments**: 100+
- **Improvement**: 103% (3.2 → 6.5)
- **Cost**: ~$0.03
- **Time**: Overnight

### Roadmap

1. **Beta (Q2 2025)**: 20-50 beta users, persistent storage
2. **Launch (Q3 2025)**: Analytics integrations, Stripe billing
3. **Scale (Q4 2025)**: API, enterprise features, more templates

---

## For Investors

### The Ask

Seed round for 18 months runway:

| Category | Allocation | Purpose |
|----------|------------|---------|
| Engineering | 60% | Build integrations, scale |
| Sales/Marketing | 25% | Beta acquisition |
| Operations | 15% | Legal, tools |

### Key Metrics to Watch

- Experiments run per user
- Lift achieved (target: 50%+)
- Cost per experiment (target: <$0.005)
- Time to first result (target: <5 min)

### Why Now

1. **Karpathy proved it works** — Autoresearch showed agents can optimize anything
2. **AI costs dropped 90%** — Gemini Flash makes it penny-scale
3. **Market gap** — Affordable autonomous testing doesn't exist
4. **Google Optimize died** — Major gap left in market

---

## Tech Stack

- **Frontend**: React, TypeScript, Tailwind, Recharts
- **Backend**: FastAPI, Python
- **LLM**: Gemini Flash 2.0
- **Auth**: Supabase Auth
- **Database**: Supabase (PostgreSQL)
- **Real-time**: WebSocket

---

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — System design
- [Demo](src/pages/Demo.tsx) — Live demo page
- [Landing](src/pages/Landing.tsx) — Marketing page

---

## License

MIT
