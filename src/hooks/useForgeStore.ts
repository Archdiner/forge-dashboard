import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

export const TEMPLATES = [
  { id: 'landing-page-cro',     name: 'Landing Page CRO',       description: 'Optimise headlines, CTAs, and copy for conversion rate' },
  { id: 'structural',           name: 'Page Structure',          description: 'Optimise section order and layout via PostHog flags' },
  { id: 'onboarding',           name: 'Onboarding Flow',         description: 'Reduce friction across steps to maximise completion rate' },
  { id: 'pricing-page',         name: 'Pricing Page',            description: 'Optimise plan framing and CTAs to maximise upgrade rate' },
  { id: 'feature-announcement', name: 'Feature Announcement',    description: 'Surface new features to drive adoption rate' },
] as const;

export type TemplateId = typeof TEMPLATES[number]['id'];

export interface Project {
  id: string;
  name: string;
  template_id: TemplateId;
  description: string;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface Experiment {
  id: string;
  agent_id: string;
  agent_name: string;
  template_id: string;
  hypothesis: string;
  mutation: string;
  metric_before: number;
  metric_after: number;
  status: 'claimed' | 'running' | 'success' | 'failure' | 'reverted';
  reasoning: string;
  created_at: string;
  completed_at: string | null;
}

export interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'thinking' | 'running' | 'publishing';
  experiments_run: number;
  improvements_found: number;
  current_hypothesis: string | null;
  last_active: string;
}

export interface GlobalBest {
  template_id: string;
  metric: number;
  config: Record<string, unknown>;
  experiment_count: number;
  last_updated: string;
}

// Fallback mock data for when API returns empty (metrics in production rate scale)
const MOCK_EXPERIMENTS: Experiment[] = [
  {
    id: 'exp-47', agent_id: 'agent-2', agent_name: 'Agent Beta',
    template_id: 'landing-page-cro',
    hypothesis: 'Question-format headline to create curiosity gap',
    mutation: 'Changed headline to "Want to 10x your conversion rate?"',
    metric_before: 0.0374, metric_after: 0.0421, status: 'success',
    reasoning: '+0.47pp CVR — question format increased engagement.',
    created_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
  },
  {
    id: 'exp-46', agent_id: 'agent-1', agent_name: 'Agent Alpha',
    template_id: 'landing-page-cro',
    hypothesis: 'Shorter value propositions to reduce cognitive load',
    mutation: 'Shortened value props to 8 words each',
    metric_before: 0.0389, metric_after: 0.0351, status: 'failure',
    reasoning: '-0.38pp CVR — brevity lost key value signals.',
    created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    id: 'exp-45', agent_id: 'agent-3', agent_name: 'Agent Gamma',
    template_id: 'onboarding',
    hypothesis: 'Remove company_name field from profile step to reduce friction',
    mutation: 'Removed company_name from step_fields.profile',
    metric_before: 0.495, metric_after: 0.521, status: 'success',
    reasoning: '+2.6pp completion — one less required field in step 2.',
    created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: 'exp-44', agent_id: 'agent-2', agent_name: 'Agent Beta',
    template_id: 'pricing-page',
    hypothesis: 'CTA copy "Start Free — No Card Needed" to remove risk perception',
    mutation: 'Updated cta_text.pro to "Start Free — No Card Needed"',
    metric_before: 0.0378, metric_after: 0.0431, status: 'success',
    reasoning: '+0.53pp upgrade rate — no-card framing reduces commitment anxiety.',
    created_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
  {
    id: 'exp-43', agent_id: 'agent-1', agent_name: 'Agent Alpha',
    template_id: 'feature-announcement',
    hypothesis: 'Move announcement from sidebar to popover for higher visibility',
    mutation: 'Changed feature_position from "sidebar" to "popover"',
    metric_before: 0.184, metric_after: 0.209, status: 'success',
    reasoning: '+2.5pp adoption — popover intercepts attention more effectively.',
    created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
    completed_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
];

const MOCK_AGENTS: Agent[] = [
  {
    id: 'agent-1',
    name: 'Agent Alpha',
    status: 'idle',
    experiments_run: 18,
    improvements_found: 4,
    current_hypothesis: null,
    last_active: new Date().toISOString(),
  },
  {
    id: 'agent-2',
    name: 'Agent Beta',
    status: 'idle',
    experiments_run: 15,
    improvements_found: 3,
    current_hypothesis: null,
    last_active: new Date().toISOString(),
  },
  {
    id: 'agent-3',
    name: 'Agent Gamma',
    status: 'idle',
    experiments_run: 14,
    improvements_found: 2,
    current_hypothesis: null,
    last_active: new Date().toISOString(),
  },
];

const MOCK_GLOBAL_BEST: GlobalBest = {
  template_id: 'landing-page-cro',
  metric: 68.2,
  config: {
    headline: 'Want to 10x your conversion rate?',
    subheadline: 'Finally, AI that actually works for you',
    cta_text: 'Start Free Trial',
    value_props: ['10x faster experiments', '50% more conversions', 'No coding required'],
    social_proof: 'Trusted by 2,847 growth teams',
    tone: 'casual',
  },
  experiment_count: 47,
  last_updated: new Date().toISOString(),
};

export interface CheckpointState {
  atCheckpoint: boolean;
  experimentCount: number;
  improvementsFound: number;
  currentBest: GlobalBest | null;
  message: string;
}

export interface ActiveCycle {
  project_id: string;
  cycle_id: string;
  state: 'pending_deployment' | 'measuring' | 'evaluated';
  variant_text: string;
  variant_config: Record<string, unknown>;
  hypothesis: string;
  baseline_metric: number;
  measured_metric: number | null;
  decision: 'kept' | 'reverted' | null;
  cycle_window_hours: number;
  created_at: string;
  deployed_at: string | null;
  measurement_ends_at: string | null;
  evaluated_at: string | null;
  seconds_remaining: number | null;
}

export interface CycleHistoryItem extends ActiveCycle {
  decision: 'kept' | 'reverted';
}

export function useForgeStore(templateId: TemplateId = 'landing-page-cro') {
  const [experiments, setExperiments] = useState<Experiment[]>(MOCK_EXPERIMENTS);
  const [agents, setAgents] = useState<Agent[]>(MOCK_AGENTS);
  const [globalBest, setGlobalBest] = useState<GlobalBest | null>(MOCK_GLOBAL_BEST);
  const [isConnected, setIsConnected] = useState(false);
  const [currentTemplate, setCurrentTemplate] = useState<TemplateId>(templateId);
  const [isLoading, setIsLoading] = useState(false);
  const [checkpointState, setCheckpointState] = useState<CheckpointState | null>(null);
  const [activeCycle, setActiveCycle] = useState<ActiveCycle | null>(null);
  const [cycleHistory, setCycleHistory] = useState<CycleHistoryItem[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket('ws://localhost:8000/ws/dashboard');
    
    ws.onopen = () => {
      setIsConnected(true);
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleWebSocketMessage(message);
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    wsRef.current = ws;
  }, []);

  const handleWebSocketMessage = (message: { type: string; data?: unknown }) => {
    switch (message.type) {
      case 'experiment_claimed':
      case 'experiment_completed': {
        const exp = message.data as Experiment;
        setExperiments(prev => {
          const exists = prev.find(e => e.id === exp.id);
          if (exists) {
            return prev.map(e => e.id === exp.id ? exp : e);
          }
          return [exp, ...prev];
        });
        break;
      }
      case 'global_best_updated': {
        setGlobalBest(message.data as GlobalBest);
        break;
      }
      case 'agent_status_updated': {
        const data = message.data as { agent_id: string; status: string; hypothesis: string | null };
        setAgents(prev => prev.map(a => 
          a.id === data.agent_id 
            ? { ...a, status: data.status as Agent['status'], current_hypothesis: data.hypothesis }
            : a
        ));
        break;
      }
      case 'agent_registered': {
        const agent = message.data as Agent;
        setAgents(prev => [...prev, agent]);
        break;
      }
      case 'checkpoint': {
        const data = message as { type: string; experiment_count: number; improvements_found: number; current_best: GlobalBest; message: string };
        setCheckpointState({
          atCheckpoint: true,
          experimentCount: data.experiment_count,
          improvementsFound: data.improvements_found,
          currentBest: data.current_best,
          message: data.message,
        });
        break;
      }
      case 'checkpoint_resumed':
      case 'checkpoint_stopped':
      case 'checkpoint_redirected': {
        setCheckpointState(null);
        break;
      }
      case 'variant_ready': {
        const data = message as unknown as { cycle: ActiveCycle };
        setActiveCycle(data.cycle);
        break;
      }
      case 'deployment_confirmed': {
        setActiveCycle(prev => prev ? { ...prev, state: 'measuring' } : null);
        break;
      }
      case 'cycle_evaluated': {
        const data = message as unknown as { metric: number; decision: 'kept' | 'reverted' };
        setActiveCycle(prev => {
          if (!prev) return null;
          const completed = { ...prev, state: 'evaluated' as const, measured_metric: data.metric, decision: data.decision };
          setCycleHistory(h => [...h, completed as CycleHistoryItem]);
          return null; // clear active cycle after evaluation
        });
        break;
      }
    }
  };

  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [historyRes, agentsRes, bestRes] = await Promise.all([
        fetch(`${API_BASE}/experiments/history/${templateId}`),
        fetch(`${API_BASE}/agents`),
        fetch(`${API_BASE}/experiments/global-best/${templateId}`),
      ]);

      const history = await historyRes.json();
      const agentsData = await agentsRes.json();
      const best = await bestRes.json();

      // Only use real data - no mock fallback
      if (history && history.length > 0) {
        setExperiments(history);
      } else {
        setExperiments([]);
      }
      if (agentsData && agentsData.length > 0) {
        setAgents(agentsData);
      } else {
        setAgents([]);
      }
      if (best && !best.error) {
        setGlobalBest(best);
      } else {
        setGlobalBest(null);
      }
    } catch (e) {
      console.error('Failed to fetch initial data:', e);
      // Don't use mock data - show empty state
      setExperiments([]);
      setAgents([]);
      setGlobalBest(null);
    } finally {
      setIsLoading(false);
    }
  }, [templateId]);

  useEffect(() => {
    fetchInitialData();
    connectWebSocket();

    return () => {
      wsRef.current?.close();
    };
  }, [fetchInitialData, connectWebSocket]);

  const switchTemplate = useCallback((newTemplateId: TemplateId) => {
    setCurrentTemplate(newTemplateId);
    setExperiments([]);
    setGlobalBest(null);
  }, []);

  const startExperiment = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/experiments/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template_id: templateId }),
      });
    } catch (e) {
      console.error('Failed to start experiment:', e);
    }
  }, [templateId]);

  const createProject = useCallback(async (name: string, description: string) => {
    try {
      const res = await fetch(`${API_BASE}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, template_id: currentTemplate, description }),
      });
      return await res.json();
    } catch (e) {
      console.error('Failed to create project:', e);
      return null;
    }
  }, [currentTemplate]);

  const optimizationCurve = experiments.length > 0
    ? experiments
        .filter(e => e.status === 'success' || e.status === 'failure')
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((e, i) => ({
          experiment: i + 1,
          metric: e.status === 'success' ? e.metric_after : e.metric_before,
        }))
    : [];

  if (optimizationCurve.length > 0) {
    // Seed the running best from the actual global best baseline (or first observed metric)
    let runningBest = globalBest?.metric ?? optimizationCurve[0]?.metric ?? 0;
    optimizationCurve.forEach(point => {
      if (point.metric > runningBest) runningBest = point.metric;
      point.metric = runningBest;
    });
  }

  // ~1 LLM call per experiment (hypothesis generation only; evaluation is free local compute)
  // Gemini Flash 2.0: ~$0.075/1M input tokens, ~700 tokens/call → ~$0.00005/experiment
  // Round up to $0.0001 to account for output tokens
  const costPerExperiment = 0.0001;

  return {
    experiments,
    agents,
    globalBest,
    isConnected,
    isLoading,
    currentTemplate,
    switchTemplate,
    startExperiment,
    createProject,
    checkpointState,
    activeCycle,
    cycleHistory,
    cost: {
      total: experiments.length * costPerExperiment,
      llm: experiments.length * costPerExperiment,
      compute: 0,
    },
    optimizationCurve,
    experimentCount: experiments.length,
    templateName: TEMPLATES.find(t => t.id === templateId)?.name ?? 'Unknown',
    continueOptimization: async () => {
      try {
        await fetch(`${API_BASE}/projects/${templateId}/checkpoint/continue`, { method: 'POST' });
      } catch (e) {
        console.error('Failed to continue:', e);
      }
    },
    stopOptimization: async () => {
      try {
        await fetch(`${API_BASE}/projects/${templateId}/checkpoint/stop`, { method: 'POST' });
      } catch (e) {
        console.error('Failed to stop:', e);
      }
    },
    redirectOptimization: async (direction: string) => {
      try {
        await fetch(`${API_BASE}/projects/${templateId}/checkpoint/redirect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ direction }),
        });
      } catch (e) {
        console.error('Failed to redirect:', e);
      }
    },
  };
}
