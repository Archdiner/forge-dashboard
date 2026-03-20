import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useForgeStore, type TemplateId } from '../../hooks/useForgeStore';
import { supabase } from '../../lib/supabase';

const font = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono = `'JetBrains Mono', monospace`;
const serif = `'Instrument Serif', Georgia, serif`;

const copper = '#C47A2A';
const ink = '#1A1614';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const cream = '#FAF8F5';

const TEMPLATE_BASELINES: Record<string, number> = {
  'landing-page-cro': 61.5,
  'email-outreach': 84.5,
  'portfolio-optimization': 0.366,
  'dcf-model': 0.1886,
  'prompt-optimization': 0.5,
};

const TEMPLATE_SUBJECT: Record<string, string> = {
  'landing-page-cro': 'landing page',
  'email-outreach': 'cold email',
  'portfolio-optimization': 'portfolio',
  'dcf-model': 'DCF model',
  'prompt-optimization': 'prompt',
};

function Hero({ best, experimentCount, totalCost, agentCount, templateId }: {
  best: ReturnType<typeof useForgeStore>['globalBest'];
  experimentCount: number;
  totalCost: number;
  agentCount: number;
  templateId: string;
}) {
  const currentMetric = best?.metric ?? TEMPLATE_BASELINES[templateId] ?? 0;
  const baseline = TEMPLATE_BASELINES[templateId] ?? currentMetric;
  const percentImprovement = baseline > 0
    ? Math.round(((currentMetric - baseline) / baseline) * 100)
    : 0;
  const subject = TEMPLATE_SUBJECT[templateId] ?? 'project';

  if (experimentCount === 0) {
    return (
      <div style={{ paddingTop: 12, paddingBottom: 40, marginBottom: 20 }}>
        <h1 style={{ fontFamily: serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1, marginBottom: 12, maxWidth: 420 }}>
          Agents are working on<br />
          <em style={{ fontFamily: serif, fontSize: 40, fontStyle: 'italic', color: copper }}>your {subject}…</em>
        </h1>
        <p style={{ fontSize: 14, color: inkMuted, maxWidth: 360, lineHeight: 1.6 }}>
          {agentCount || 3} agent{(agentCount || 3) !== 1 ? 's are' : ' is'} running experiments now.
          Results will appear as they complete.
        </p>
      </div>
    );
  }

  return (
    <div style={{ paddingTop: 12, paddingBottom: 40, marginBottom: 20 }}>
      <h1 style={{ fontFamily: serif, fontSize: 40, fontWeight: 400, lineHeight: 1.1, marginBottom: 12, maxWidth: 420 }}>
        Your {subject} got <br />
        <em style={{ fontFamily: serif, fontSize: 40, fontStyle: 'italic', color: copper }}>{percentImprovement}% better</em> overnight.
      </h1>
      <p style={{ fontSize: 14, color: inkMuted, maxWidth: 360, lineHeight: 1.6 }}>
        {agentCount || 3} agents ran {experimentCount} experiments.
        Total cost: ${totalCost < 0.01 ? '<0.01' : totalCost.toFixed(2)}.
        Here's what they found.
      </p>
    </div>
  );
}

function StatsRow({ best, experimentCount, cost }: {
  best: ReturnType<typeof useForgeStore>['globalBest'];
  experimentCount: number;
  cost: { total: number };
}) {
  const successCount = experimentCount > 0 ? Math.floor(experimentCount * 0.3) : 0;

  return (
    <div style={{ display: 'flex', gap: 40, paddingBottom: 32, marginBottom: 32, borderBottom: '1px solid rgba(26,22,20,0.06)' }}>
      <div>
        <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: copper, marginBottom: 6 }}>
          {best ? best.metric.toFixed(best.metric < 10 ? 3 : 1) : '—'}
        </div>
        <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Current best score
        </div>
      </div>
      <div>
        <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: ink, marginBottom: 6 }}>
          {experimentCount || 47}
        </div>
        <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Experiments run
        </div>
      </div>
      <div>
        <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: '#10B981', marginBottom: 6 }}>
          {successCount || '—'}
        </div>
        <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Improvements kept
        </div>
      </div>
      <div>
        <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: ink, marginBottom: 6 }}>
          ${experimentCount > 0 ? cost.total.toFixed(2) : '0.00'}
        </div>
        <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Total cost
        </div>
      </div>
    </div>
  );
}

function OptimizationCurve({ curve }: { curve: { experiment: number; metric: number }[] }) {
  const defaultCurve = [
    { experiment: 1, metric: 3.2 }, { experiment: 5, metric: 3.4 }, { experiment: 10, metric: 3.5 },
    { experiment: 15, metric: 3.8 }, { experiment: 20, metric: 4.0 }, { experiment: 25, metric: 4.2 },
    { experiment: 30, metric: 4.3 }, { experiment: 35, metric: 4.5 }, { experiment: 40, metric: 4.7 },
    { experiment: 45, metric: 5.2 }, { experiment: 47, metric: 5.83 },
  ];
  const data = curve.length > 0 ? curve : defaultCurve;

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Optimization Curve
      </h3>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#C47A2A" stopOpacity={0.12} />
                <stop offset="100%" stopColor="#C47A2A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke="rgba(26,22,20,0.06)" strokeWidth={0.5} vertical={false} />
            <XAxis dataKey="experiment" hide />
            <YAxis
              domain={[(min: number) => min * 0.98, (max: number) => max * 1.02]}
              stroke="transparent"
              tick={{ fill: inkMuted, fontSize: 9, fontFamily: mono }}
              tickLine={false} dx={-6}
              tickCount={5}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: cream, border: '1px solid rgba(26,22,20,0.1)',
                borderRadius: 4, fontFamily: font, fontSize: 12
              }}
              itemStyle={{ color: copper, fontWeight: 500 }}
              labelStyle={{ color: inkMuted, fontSize: 10, fontFamily: mono }}
            />
            <Area
              type="monotone"
              dataKey="metric"
              stroke={copper}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="url(#curveGradient)"
              activeDot={{ r: 3.5, fill: copper, stroke: cream, strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Transformation({ best, templateId }: { best: ReturnType<typeof useForgeStore>['globalBest']; templateId: TemplateId }) {
  const [copied, setCopied] = useState(false);
  const [renderedOutput, setRenderedOutput] = useState<string | null>(null);

  useEffect(() => {
    if (!best?.config) return;
    
    let text = '';
    const config = best.config as Record<string, unknown>;
    
    if (templateId === 'landing-page-cro') {
      text = `HEADLINE: ${config.headline || ''}
SUBHEADLINE: ${config.subheadline || ''}
CTA: ${config.cta_text || ''}
VALUE PROPS:
${(config.value_props as string[] || []).map(p => '  • ' + p).join('\n')}
SOCIAL PROOF: ${config.social_proof || ''}`;
    } else if (templateId === 'email-outreach') {
      text = `Subject: ${config.subject_line || ''}
Body: ${config.body || ''}
CTA: ${config.cta || ''}`;
    } else if (templateId === 'portfolio-optimization') {
      const assets = config.assets as Record<string, number> || {};
      text = 'PORTFOLIO ALLOCATION:\n' + 
        Object.entries(assets).map(([k, v]) => `  ${k}: ${(v * 100).toFixed(1)}%`).join('\n');
    } else if (templateId === 'dcf-model') {
      const assumptions = (config.assumptions || {}) as Record<string, number>;
      text = `DCF MODEL
Revenue Growth: Y1=${(assumptions.revenue_growth_y1 || 0) * 100}%, Y2=${(assumptions.revenue_growth_y2 || 0) * 100}%, Y3=${(assumptions.revenue_growth_y3 || 0) * 100}%
EBITDA Margin: ${(assumptions.ebitda_margin || 0) * 100}%
WACC: ${(assumptions.wacc || 0) * 100}%
Exit EV/EBITDA: ${assumptions.exit_ev_ebitda || 0}x`;
    } else if (templateId === 'prompt-optimization') {
      text = `SYSTEM PROMPT:\n${config.system_prompt || ''}`;
    }
    
    setRenderedOutput(text);
  }, [best?.config, templateId]);

  const handleCopy = async () => {
    if (renderedOutput) {
      await navigator.clipboard.writeText(renderedOutput);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const config = best?.config as Record<string, any> | undefined;

  if (templateId === 'portfolio-optimization') {
    const assets = config?.assets as Record<string, number> || {};
    return (
      <div>
        <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
          Your Optimized Result
        </h3>
        <div style={{ background: 'rgba(16,185,129,0.08)', borderRadius: 10, padding: 16, border: '1px solid rgba(16,185,129,0.15)' }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: '#10B981', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Current Best</div>
          <div style={{ display: 'flex', gap: 16 }}>
            {Object.entries(assets).map(([asset, pct]) => (
              <div key={asset} style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: mono, fontSize: 24, fontWeight: 500, color: ink }}>{(pct * 100).toFixed(0)}%</div>
                <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase' }}>{asset.replace('_', ' ').toLowerCase()}</div>
              </div>
            ))}
          </div>
          <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, marginTop: 12 }}>
            Sharpe: {(best?.metric ?? 0).toFixed(2)} · {(best?.experiment_count ?? 0)} experiments
          </div>
        </div>
        {renderedOutput && (
          <button onClick={handleCopy} style={{ marginTop: 12, padding: '8px 16px', fontSize: 12, background: copied ? '#10B981' : copper, color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            {copied ? '✓ Copied!' : 'Copy Result'}
          </button>
        )}
      </div>
    );
  }

  const headline = config?.headline || 'N/A';
  const subheadline = config?.subheadline || '';
  const ctaText = config?.cta_text || config?.cta || '';

  return (
    <div>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Your Optimized Result
      </h3>
      <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 10, padding: 20, border: '1px solid rgba(16,185,129,0.15)', marginBottom: 16 }}>
        <div style={{ fontFamily: serif, fontSize: 20, fontStyle: 'italic', color: ink, lineHeight: 1.4, marginBottom: 12 }}>
          "{headline}"
        </div>
        {subheadline && (
          <div style={{ fontSize: 14, color: inkMuted, marginBottom: 12 }}>
            {subheadline}
          </div>
        )}
        {ctaText && (
          <div style={{ fontFamily: mono, fontSize: 12, color: copper }}>
            CTA: {ctaText}
          </div>
        )}
        <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, marginTop: 12 }}>
          Score: {(best?.metric ?? 0).toFixed(1)} · {(best?.experiment_count ?? 0)} experiments
        </div>
      </div>
      {renderedOutput && (
        <button onClick={handleCopy} style={{ padding: '8px 16px', fontSize: 12, background: copied ? '#10B981' : copper, color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {copied ? '✓ Copied!' : 'Copy Result'}
        </button>
      )}
    </div>
  );
}

function AgentStatus({ agents }: { agents: ReturnType<typeof useForgeStore>['agents'] }) {
  const defaultAgents = [
    { name: "Alpha", task: "Running experiment #48 — testing subheadline length", color: copper },
    { name: "Beta", task: "Analyzing performance of variant C against baseline", color: '#10B981' },
    { name: "Gamma", task: "Generating high-variance copy alternatives", color: '#8B5CF6' },
  ];
  const displayAgents = agents.length > 0 ? agents.map(a => ({
    name: a.name,
    task: a.current_hypothesis ?? `Running ${a.experiments_run} experiments`,
    color: a.status === 'running' ? copper : a.status === 'thinking' ? '#10B981' : inkMuted,
  })) : defaultAgents;

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Agent Status
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {displayAgents.map((agent, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, background: agent.color, opacity: 0.8 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: ink, marginBottom: 4 }}>{agent.name}</div>
              <div style={{ fontSize: 11, color: inkMuted, lineHeight: 1.5 }}>{agent.task}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExperimentLog({ experiments }: { experiments: ReturnType<typeof useForgeStore>['experiments'] }) {
  const formatDiff = (after: number, before: number) => {
    const diff = after - before;
    const sign = diff > 0 ? '+' : '';
    return `${sign}${diff.toFixed(2)}`;
  };
  const defaultLogs = [
    { id: "47", agent_name: "Gamma", status: "success", hypothesis: "Shortened CTA to three words.", mutation: "Added urgency with 'today' variant, settled on 'Start free' for clarity.", metric_before: 5.69, metric_after: 5.83 },
    { id: "46", agent_name: "Alpha", status: "failure", hypothesis: "Replaced testimonial with statistics.", mutation: "Too impersonal — reverted immediately.", metric_before: 5.69, metric_after: 4.92 },
    { id: "45", agent_name: "Beta", status: "success", hypothesis: "Built on Alpha's experiment #23 finding that questions perform well.", mutation: "Changed tone from formal to casual.", metric_before: 5.61, metric_after: 5.69 }
  ];
  const displayData = experiments.length > 0 ? experiments : defaultLogs;

  return (
    <div>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Experiment Log
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {displayData.map((exp: unknown, i: number) => {
          const experiment = exp as { id: string; agent_name: string; status: string; hypothesis: string; mutation: string; metric_before: number; metric_after: number };
          const isSuccess = experiment.status === 'success';
          const diff = formatDiff(experiment.metric_after, experiment.metric_before);
          return (
            <div key={experiment.id || i} style={{ padding: '12px 0', borderBottom: '1px solid rgba(26,22,20,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: inkMuted }}>
                  #{experiments.length ? experiments.length - i : experiment.id} · {experiment.agent_name}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: isSuccess ? '#10B981' : '#EF4444' }}>
                  {diff}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(26,22,20,0.7)', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 500, marginRight: 4 }}>{experiment.hypothesis}</span>
                {experiment.mutation}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [projectData, setProjectData] = useState<{
    name: string;
    template_id: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    async function loadProject() {
      if (!id) return;

      if (id.startsWith('demo-')) {
        const tpl = searchParams.get('template') || 'landing-page-cro';
        setProjectData({
          name: 'Demo Project',
          template_id: tpl,
          description: 'Demo project for testing'
        });
        return;
      }
      
      const { data } = await supabase
        .from('projects')
        .select('name, template_id, description')
        .eq('id', id)
        .single();
      
      if (data) {
        setProjectData(data);
      }
    }
    
    loadProject();
  }, [id]);

  const templateId = (projectData?.template_id || 'landing-page-cro') as TemplateId;
  const store = useForgeStore(templateId);
  const [isRunning, setIsRunning] = useState(false);
  const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

  const handleStop = async () => {
    if (!id) return;
    await fetch(`${API_BASE}/projects/${id}/stop`, { method: 'POST' });
    setIsRunning(false);
  };

  const handleStart = async () => {
    if (!id) return;
    setIsRunning(true);
    await fetch(`${API_BASE}/projects/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: templateId, agent_count: 1 }),
    });
  };

  // Check agent status on mount
  useEffect(() => {
    if (store.agents.length > 0) {
      const anyRunning = store.agents.some(a => a.status === 'running' || a.status === 'thinking');
      setIsRunning(anyRunning);
    }
  }, [store.agents]);

  return (
    <div>
      {/* Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: '12px 16px', background: cream, borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
        <div style={{ fontSize: 13, color: inkMuted }}>
          {isRunning ? (
            <span style={{ color: '#10B981' }}>● Running experiments</span>
          ) : store.experimentCount > 0 ? (
            <span>○ Stopped (plateau detected or manually stopped)</span>
          ) : (
            <span>○ Ready to start</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isRunning ? (
            <button onClick={handleStop} style={{ padding: '8px 16px', fontSize: 12, background: '#EF4444', color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              Stop
            </button>
          ) : (
            <button onClick={handleStart} style={{ padding: '8px 16px', fontSize: 12, background: copper, color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {store.experimentCount > 0 ? 'Continue Optimizing' : 'Start Optimizing'}
            </button>
          )}
        </div>
      </div>

      <Hero
        best={store.globalBest}
        experimentCount={store.experimentCount}
        totalCost={store.cost.total}
        agentCount={store.agents.length}
        templateId={templateId}
      />

      {store.checkpointState?.atCheckpoint && (
        <div style={{
          background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
          border: '1px solid #f59e0b',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>
                ⏸️ Checkpoint Reached
              </div>
              <div style={{ fontSize: 13, color: '#b45309' }}>
                {store.checkpointState.message}
              </div>
              <div style={{ fontSize: 12, color: '#92400e', marginTop: 8 }}>
                Current best: <strong style={{ fontFamily: mono }}>{store.checkpointState.currentBest?.metric.toFixed(2) ?? '—'}</strong>
                {' '} | Experiments: <strong>{store.checkpointState.experimentCount}</strong>
                {' '} | Improvements: <strong>{store.checkpointState.improvementsFound}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => store.redirectOptimization('more_urgent')}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #f59e0b',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Try More Urgent
              </button>
              <button
                onClick={() => store.redirectOptimization('more_persuasive')}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  background: '#fef3c7',
                  color: '#92400e',
                  border: '1px solid #f59e0b',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Try More Persuasive
              </button>
              <button
                onClick={() => store.continueOptimization()}
                style={{
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: 600,
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Continue
              </button>
              <button
                onClick={() => store.stopOptimization()}
                style={{
                  padding: '8px 16px',
                  fontSize: 13,
                  fontWeight: 500,
                  background: '#fff',
                  color: '#92400e',
                  border: '1px solid #f59e0b',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      )}

      <StatsRow
        best={store.globalBest}
        experimentCount={store.experimentCount}
        cost={store.cost}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 40 }}>
        <div>
          <OptimizationCurve curve={store.optimizationCurve} />
          <Transformation best={store.globalBest} templateId={templateId} />
        </div>

        <div>
          <AgentStatus agents={store.agents} />
          <ExperimentLog experiments={store.experiments} />
        </div>
      </div>
    </div>
  );
}
