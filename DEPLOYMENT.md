# FORGE Production Deployment Guide

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         FORGE SYSTEM                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐      ┌─────────────────────┐                   │
│  │   VERCEL   │      │     RAILWAY         │                   │
│  │  (Frontend)│─────▶│   (Backend + API)  │                   │
│  │   Free     │      │      ~$5/mo         │                   │
│  └─────────────┘      └─────────┬───────────┘                   │
│                                 │                               │
│                        ┌────────▼────────┐                       │
│                        │    GEMINI API  │                       │
│                        │  (pay-per-use) │                       │
│                        └────────────────┘                       │
│                                                                 │
│  ┌─────────────┐      ┌──────────────────┐                      │
│  │  SUPABASE   │      │   POSTHOG       │                      │
│  │  (Database) │      │  (Analytics)    │                      │
│  │   Free      │      │  (Optional)     │                      │
│  └─────────────┘      └──────────────────┘                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## What Runs Where

| Component | Platform | Cost | Notes |
|-----------|----------|------|-------|
| Dashboard UI | Vercel | Free | React + Vite |
| API Server | Railway | $5/mo | FastAPI, handles all endpoints |
| Agent Worker | Railway | Included | Runs experiment loops |
| Database | Supabase | Free | PostgreSQL, stores experiments |
| AI | Google Gemini | Pay-per-use | ~$0.002/experiment |
| Analytics | PostHog | Free | Optional, for real metrics |

## Prerequisites

1. **Supabase Account** - https://supabase.com
2. **Vercel Account** - https://vercel.com  
3. **Railway Account** - https://railway.app
4. **Google AI API Key** - https://aistudio.google.com/app/apikey

---

## Step 1: Set Up Supabase (Database)

1. Create a new project at https://supabase.com
2. Go to **SQL Editor** in Supabase dashboard
3. Copy and paste the contents of `supabase/schema.sql`
4. Run the SQL to create all tables
5. Go to **Settings → API**
6. Copy `Project URL` and `anon public` key

---

## Step 2: Deploy Backend to Railway

### Option A: Via Railway CLI (Recommended)

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Initialize project
railway init

# Select "Empty Project" and create new
# Name it "forge-backend"

# Add environment variables
railway variables set GOOGLE_API_KEY=your_google_api_key
railway variables set ALLOWED_ORIGINS=https://your-vercel-project.vercel.app
railway variables set FORGE_API_URL=https://your-backend-name.up.railway.app

# Deploy
railway up
```

### Option B: Via GitHub Integration

1. Push your code to GitHub
2. Go to https://railway.app
3. Click **New Project → From GitHub repo**
4. Select your fork
5. Configure environment variables in Railway dashboard:
   - `GOOGLE_API_KEY`: your_google_api_key
   - `ALLOWED_ORIGINS`: https://your-project.vercel.app
   - `FORGE_API_URL`: (will be auto-generated after deploy)
6. Deploy

### Verify Backend

```bash
# Check health endpoint
curl https://your-backend-name.up.railway.app/health

# Should return: {"status":"ok","timestamp":"..."}
```

---

## Step 3: Deploy Frontend to Vercel

### Option A: Via Vercel CLI

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Deploy
vercel

# Follow prompts:
# - Set up and deploy? Yes
# - Which scope? (your username)
# - Link to existing? No
# - Project name: forge-dashboard
# - Directory? ./
# - Want to modify settings? No
```

### Option B: Via GitHub Integration

1. Push your code to GitHub
2. Go to https://vercel.com
3. Click **Add New → Project**
4. Import your GitHub repository
5. Configure environment variables:
   - `VITE_SUPABASE_URL`: your_supabase_url
   - `VITE_SUPABASE_ANON_KEY`: your_supabase_anon_key
   - `VITE_API_URL`: https://your-backend-name.up.railway.app
6. Click **Deploy**

---

## Step 4: Configure Production Environment

### Backend (.env on Railway)

```
GOOGLE_API_KEY=your_google_api_key
ALLOWED_ORIGINS=https://your-project.vercel.app
FORGE_API_URL=https://your-backend-name.up.railway.app
```

### Frontend (Vercel Environment Variables)

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
VITE_API_URL=https://your-backend-name.up.railway.app
```

---

## Step 5: Update Vercel Rewrites

After deploying, update `vercel.json` with your actual backend URL:

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    { "source": "/api/(.*)", "destination": "https://your-backend-name.up.railway.app/$1" }
  ]
}
```

Redeploy to apply changes.

---

## Running Agents in Production

Agents are started via API calls. From your frontend or curl:

```bash
# Initialize a project first
curl -X POST https://your-backend.up.railway.app/projects/proj-123/initialize \
  -H "Content-Type: application/json" \
  -d '{"template_id": "landing-page-cro", "baseline_metric": 3.2}'

# Start agents (1-3 agents)
curl -X POST https://your-backend.up.railway.app/projects/proj-123/start \
  -H "Content-Type: application/json" \
  -d '{"agent_count": 3, "max_experiments": 50}'

# Check status
curl https://your-backend.up.railway.app/projects/proj-123
```

---

## Monitoring & Logs

| Platform | How to Access |
|----------|---------------|
| Railway | Dashboard → Deploy → View Logs |
| Vercel | Dashboard → Deployment → View Logs |
| Supabase | Dashboard → Logs |

---

## Cost Estimate

| Component | Monthly Cost |
|-----------|-------------|
| Vercel (Frontend) | $0 |
| Railway (Backend) | $5 |
| Supabase (Database) | $0 |
| Google Gemini API | $1-10/mo |
| **Total** | **$6-15/mo** |

---

## Troubleshooting

### CORS Errors
- Make sure `ALLOWED_ORIGINS` in Railway includes your Vercel URL
- Format: `https://your-project.vercel.app` (no trailing slash)

### Agents Not Running
- Check Railway logs for errors
- Verify `GOOGLE_API_KEY` is set
- Make sure backend health endpoint returns OK

### Database Connection Issues
- Verify Supabase credentials in frontend
- Check RLS policies aren't blocking access

### WebSocket Not Working
- Ensure your hosting supports WebSocket connections
- Railway supports WebSocket out of the box

---

## Production Checklist

- [ ] Supabase database created and schema applied
- [ ] Railway backend deployed with all env vars
- [ ] Vercel frontend deployed with all env vars
- [ ] CORS configured with production domains
- [ ] Health endpoint verified
- [ ] Test agent startup via API
