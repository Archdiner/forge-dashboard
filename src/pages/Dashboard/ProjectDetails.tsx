import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState, useCallback } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useForgeStore, type TemplateId, type ActiveCycle, type CycleHistoryItem } from '../../hooks/useForgeStore';
import { supabase } from '../../lib/supabase';

const font = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono = `'JetBrains Mono', monospace`;
const serif = `'Instrument Serif', Georgia, serif`;

const copper = '#C47A2A';
const ink = '#1A1614';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const cream = '#FAF8F5';
const green = '#10B981';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

const TEMPLATE_BASELINES: Record<string, number> = {
  'landing-page-cro':     0.0346,
  'structural':           0.0372,
  'onboarding':           0.573,
  'pricing-page':         0.0430,
  'feature-announcement': 0.190,
};

// Templates where metric is a rate (0-1) → display as X.XX%
const RATE_TEMPLATES = new Set([
  'landing-page-cro', 'structural', 'onboarding', 'pricing-page', 'feature-announcement',
]);

// Templates where metric is already 0-100 score → display as X
const SCORE_TEMPLATES = new Set([
  'ad-copy', 'email-outreach',
]);

const METRIC_LABEL: Record<string, string> = {
  'landing-page-cro':     'Conversion Rate',
  'structural':           'Conversion Rate',
  'onboarding':           'Completion Rate',
  'pricing-page':         'Upgrade Rate',
  'feature-announcement': 'Adoption Rate',
  'ad-copy':             'Ad Score',
  'email-outreach':      'Email Score',
};

function fmtMetric(metric: number, templateId: string): string {
  if (RATE_TEMPLATES.has(templateId)) return `${(metric * 100).toFixed(2)}%`;
  if (SCORE_TEMPLATES.has(templateId)) return `${metric.toFixed(0)}`;
  return metric.toFixed(metric < 10 ? 4 : 1);
}

function fmtDiff(diff: number, templateId: string): string {
  if (RATE_TEMPLATES.has(templateId)) {
    // Show as percentage point change: +0.42pp
    return `${diff > 0 ? '+' : ''}${(diff * 100).toFixed(2)}pp`;
  }
  if (SCORE_TEMPLATES.has(templateId)) {
    // Score templates: +X
    return `${diff > 0 ? '+' : ''}${diff.toFixed(0)}`;
  }
  return `${diff > 0 ? '+' : ''}${diff.toFixed(3)}`;
}

const TEMPLATE_SUBJECT: Record<string, string> = {
  'landing-page-cro': 'landing page',
  'email-outreach': 'cold email',
  'portfolio-optimization': 'portfolio',
  'dcf-model': 'DCF model',
  'prompt-optimization': 'prompt',
  'structural': 'structural config',
};

// ─── Deployment Panel ────────────────────────────────────────────────────────

function DeploymentPanel({
  cycle,
  projectId,
  onDeployed,
}: {
  cycle: ActiveCycle;
  projectId: string;
  onDeployed: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cycle.variant_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = async () => {
    setConfirming(true);
    try {
      const resp = await fetch(`${API_BASE}/projects/${projectId}/cycle/deploy`, {
        method: 'POST',
      });
      if (resp.ok) {
        onDeployed();
      }
    } catch {
      console.error('Failed to confirm deployment');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #fff8f0 0%, #fef3e2 100%)',
      border: '1px solid rgba(196,122,42,0.3)',
      borderRadius: 12,
      padding: 24,
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: copper, animation: 'pulse 2s infinite' }} />
        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: copper, textTransform: 'uppercase', letterSpacing: 1 }}>
          Variant Ready to Deploy
        </div>
      </div>

      <p style={{ fontSize: 13, color: 'rgba(26,22,20,0.6)', marginBottom: 16, lineHeight: 1.5 }}>
        {cycle.hypothesis}
      </p>

      {/* Variant text box */}
      <div style={{
        background: '#FFF',
        border: '1px solid rgba(196,122,42,0.2)',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
        fontFamily: mono,
        fontSize: 12,
        lineHeight: 1.7,
        color: ink,
        whiteSpace: 'pre-wrap',
        maxHeight: 220,
        overflowY: 'auto',
      }}>
        {cycle.variant_text}
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={handleCopy}
          style={{ padding: '8px 18px', fontSize: 12, fontFamily: font, background: copied ? green : 'rgba(196,122,42,0.1)', color: copied ? '#FFF' : copper, border: `1px solid ${copied ? green : 'rgba(196,122,42,0.2)'}`, borderRadius: 7, cursor: 'pointer', transition: 'all 0.2s' }}>
          {copied ? '✓ Copied!' : 'Copy to clipboard'}
        </button>

        <button onClick={handleConfirm} disabled={confirming}
          style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, fontFamily: font, background: copper, color: '#FFF', border: 'none', borderRadius: 7, cursor: confirming ? 'not-allowed' : 'pointer', opacity: confirming ? 0.7 : 1 }}>
          {confirming ? 'Confirming…' : "I've deployed this →"}
        </button>

        <span style={{ fontSize: 11, color: inkMuted, marginLeft: 4 }}>
          Forge will start measuring after you click
        </span>
      </div>
    </div>
  );
}

// ─── Measurement Timer ───────────────────────────────────────────────────────

function MeasurementTimer({ cycle, projectId }: { cycle: ActiveCycle; projectId: string }) {
  const [secondsLeft, setSecondsLeft] = useState<number>(cycle.seconds_remaining ?? 0);
  const [liveMetric, setLiveMetric] = useState<number | null>(null);

  useEffect(() => {
    if (cycle.measurement_ends_at) {
      const end = new Date(cycle.measurement_ends_at).getTime();
      const tick = () => setSecondsLeft(Math.max(0, (end - Date.now()) / 1000));
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
  }, [cycle.measurement_ends_at]);

  // Poll PostHog metric every 5 minutes during measurement
  useEffect(() => {
    const poll = async () => {
      try {
        const resp = await fetch(`${API_BASE}/projects/${projectId}/metric?window_hours=${cycle.cycle_window_hours}`);
        const data = await resp.json();
        if (data.value !== undefined) setLiveMetric(data.value);
      } catch { /* PostHog not configured or unreachable — that's ok */ }
    };
    poll();
    const id = setInterval(poll, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [projectId, cycle.cycle_window_hours]);

  const hours = Math.floor(secondsLeft / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const secs = Math.floor(secondsLeft % 60);
  const pctDone = cycle.measurement_ends_at
    ? 1 - secondsLeft / (cycle.cycle_window_hours * 3600)
    : 0;

  return (
    <div style={{
      background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
      border: '1px solid rgba(16,185,129,0.25)',
      borderRadius: 12,
      padding: 24,
      marginBottom: 24,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: green }} />
        <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: green, textTransform: 'uppercase', letterSpacing: 1 }}>
          Measuring Real Traffic
        </div>
      </div>

      <div style={{ display: 'flex', gap: 32, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 36, fontWeight: 600, color: ink, letterSpacing: -1 }}>
            {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </div>
          <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Remaining
          </div>
        </div>

        {liveMetric !== null && (
          <div>
            <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: copper }}>
              {liveMetric.toFixed(4)}
            </div>
            <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Live metric
            </div>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div style={{ height: 4, background: 'rgba(16,185,129,0.15)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pctDone * 100)}%`, background: green, borderRadius: 2, transition: 'width 1s linear' }} />
      </div>

      <p style={{ fontSize: 12, color: inkMuted, marginTop: 10, lineHeight: 1.5 }}>
        Variant deployed. PostHog is measuring real user behaviour.
        Forge will compare this to the baseline after the window closes.
      </p>
    </div>
  );
}

// ─── Cycle Result Banner ─────────────────────────────────────────────────────

function CycleResultBanner({ cycle }: { cycle: CycleHistoryItem }) {
  const kept = cycle.decision === 'kept';
  const pctChange = cycle.baseline_metric > 0 && cycle.measured_metric != null
    ? ((cycle.measured_metric - cycle.baseline_metric) / cycle.baseline_metric) * 100
    : 0;

  return (
    <div style={{
      background: kept ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.04)',
      border: `1px solid ${kept ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.15)'}`,
      borderRadius: 10,
      padding: '12px 16px',
      marginBottom: 12,
      display: 'flex',
      alignItems: 'center',
      gap: 16,
    }}>
      <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: kept ? green : '#EF4444' }}>
        {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: ink }}>
          {kept ? 'Kept' : 'Reverted'} — {cycle.hypothesis.slice(0, 80)}{cycle.hypothesis.length > 80 ? '…' : ''}
        </div>
        <div style={{ fontFamily: mono, fontSize: 11, color: inkMuted, marginTop: 2 }}>
          {cycle.baseline_metric.toFixed(4)} → {cycle.measured_metric?.toFixed(4)}
        </div>
      </div>
    </div>
  );
}

// ─── Morning Report ──────────────────────────────────────────────────────────

function MorningReport({
  cycleHistory,
  experimentCount,
  templateId,
  projectId,
  onContinue,
}: {
  cycleHistory: CycleHistoryItem[];
  experimentCount: number;
  templateId: string;
  projectId: string;
  onContinue: () => void;
}) {
  const kept = cycleHistory.filter(c => c.decision === 'kept');
  const firstBaseline = cycleHistory[0]?.baseline_metric ?? TEMPLATE_BASELINES[templateId] ?? 0;
  const lastMetric = kept.length > 0
    ? (kept[kept.length - 1].measured_metric ?? firstBaseline)
    : firstBaseline;
  const netLiftPct = firstBaseline > 0
    ? Math.round(((lastMetric - firstBaseline) / firstBaseline) * 100)
    : 0;
  const subject = TEMPLATE_SUBJECT[templateId] ?? 'project';

  return (
    <div style={{ marginBottom: 32 }}>
      {/* Hero */}
      <div style={{ paddingBottom: 32, marginBottom: 32, borderBottom: '1px solid rgba(26,22,20,0.06)' }}>
        <h2 style={{ fontFamily: serif, fontSize: 36, fontWeight: 400, lineHeight: 1.1, marginBottom: 12 }}>
          {cycleHistory.length === 0
            ? 'No cycles completed yet.'
            : kept.length > 0
              ? <>Your {subject} got <em style={{ color: copper, fontStyle: 'italic' }}>{netLiftPct}% better</em>.</>
              : <>Forge ran {cycleHistory.length} cycle{cycleHistory.length !== 1 ? 's' : ''}. No improvement yet.</>
          }
        </h2>
        <p style={{ fontSize: 14, color: inkMuted, lineHeight: 1.6 }}>
          {cycleHistory.length} cycle{cycleHistory.length !== 1 ? 's' : ''} completed
          {' · '}{kept.length} improvement{kept.length !== 1 ? 's' : ''} kept
          {' · '}{experimentCount} simulation experiment{experimentCount !== 1 ? 's' : ''} run
        </p>
      </div>

      {/* Cycle log */}
      {cycleHistory.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
            Cycle Log
          </div>
          {[...cycleHistory].reverse().map(c => (
            <CycleResultBanner key={c.cycle_id} cycle={c} />
          ))}
        </div>
      )}

      {/* CTA */}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onContinue}
          style={{ padding: '12px 28px', fontFamily: serif, fontSize: 16, fontStyle: 'italic', background: copper, color: '#FFF', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Continue optimizing tonight →
        </button>
        <a href={`${API_BASE}/projects/${projectId}/report`} target="_blank" rel="noreferrer"
          style={{ padding: '12px 20px', fontSize: 13, fontFamily: font, color: inkMuted, background: 'transparent', border: '1px solid rgba(26,22,20,0.1)', borderRadius: 8, textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          Export report
        </a>
      </div>
    </div>
  );
}

// ─── Existing components (unchanged) ────────────────────────────────────────

function Hero({ best, experimentCount, totalCost, agentCount, templateId }: {
  best: ReturnType<typeof useForgeStore>['globalBest'];
  experimentCount: number;
  totalCost: number;
  agentCount: number;
  templateId: string;
}) {
  const currentMetric = best?.metric ?? TEMPLATE_BASELINES[templateId] ?? 0;
  const baseline = TEMPLATE_BASELINES[templateId] ?? currentMetric;
  // Guard against tiny baselines causing absurd percentages
  const safeBaseline = Math.max(baseline, 0.001);
  const percentImprovement = safeBaseline > 0
    ? Math.round(((currentMetric - safeBaseline) / safeBaseline) * 100)
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

function StatsRow({ best, experimentCount, cost, cycleHistory, templateId, successCount }: {
  best: ReturnType<typeof useForgeStore>['globalBest'];
  experimentCount: number;
  cost: { total: number };
  cycleHistory: CycleHistoryItem[];
  templateId: TemplateId;
  successCount: number;
}) {
  const keptCycles = cycleHistory.filter(c => c.decision === 'kept').length;
  const improvements = keptCycles > 0 ? keptCycles : successCount;

  return (
    <div style={{ display: 'flex', gap: 40, paddingBottom: 32, marginBottom: 32, borderBottom: '1px solid rgba(26,22,20,0.06)', flexWrap: 'wrap' }}>
      <div>
        <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: copper, marginBottom: 6 }}>
          {best ? fmtMetric(best.metric, templateId) : '—'}
        </div>
        <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {METRIC_LABEL[templateId] ?? 'Best metric'}
        </div>
      </div>
      <div>
        <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: ink, marginBottom: 6 }}>
          {experimentCount || 0}
        </div>
        <div style={{ fontSize: 11, color: inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Experiments run
        </div>
      </div>
      <div>
        <div style={{ fontFamily: mono, fontSize: 28, fontWeight: 500, color: green, marginBottom: 6 }}>
          {improvements || '—'}
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

function OptimizationCurve({ curve, templateId }: { curve: { experiment: number; metric: number }[]; templateId: string }) {
  const data = curve.length > 0 ? curve : [];
  if (data.length === 0) return null;

  const isRate = RATE_TEMPLATES.has(templateId);
  const isScore = SCORE_TEMPLATES.has(templateId);
  const tickFmt = (v: number) => isRate ? `${(v * 100).toFixed(1)}%` : isScore ? v.toFixed(0) : v.toFixed(3);

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Optimization Curve
      </h3>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
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
              tickFormatter={tickFmt}
            />
            <Tooltip
              contentStyle={{ backgroundColor: cream, border: '1px solid rgba(26,22,20,0.1)', borderRadius: 4, fontFamily: font, fontSize: 12 }}
              itemStyle={{ color: copper, fontWeight: 500 }}
              labelStyle={{ color: inkMuted, fontSize: 10, fontFamily: mono }}
              formatter={(v) => { const n = Number(v ?? 0); return [isRate ? `${(n * 100).toFixed(2)}%` : n.toFixed(4), METRIC_LABEL[templateId] ?? 'Metric']; }}
            />
            <Area type="monotone" dataKey="metric" stroke={copper} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="url(#curveGradient)" activeDot={{ r: 3.5, fill: copper, stroke: cream, strokeWidth: 2 }} />
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
    const config = best.config as Record<string, unknown>;
    let text = '';

    if (templateId === 'landing-page-cro') {
      text = `HEADLINE: ${config.headline || ''}\nSUBHEADLINE: ${config.subheadline || ''}\nCTA: ${config.cta_text || ''}\nVALUE PROPS:\n${(config.value_props as string[] || []).map((p: string) => '  • ' + p).join('\n')}\nSOCIAL PROOF: ${config.social_proof || ''}`;
    } else if (templateId === 'structural') {
      text = `SECTION ORDER: ${(config.sections_order as string[] || []).join(' → ')}\nHERO STYLE: ${config.hero_style || ''}\nCTA STYLE: ${config.cta_style || ''}\nSOCIAL PROOF: ${config.social_proof_style || ''}`;
    } else if (templateId === 'onboarding') {
      const steps = (config.steps_order as string[] || []);
      const fields = (config.step_fields as Record<string, string[]> || {});
      text = `STEPS: ${steps.join(' → ')}\n` +
        steps.map((s: string) => `  ${s}: ${(fields[s] || []).join(', ')}`).join('\n') +
        `\nProgress bar: ${config.show_progress_bar ? 'yes' : 'no'} · Skip option: ${config.show_skip_option ? 'yes' : 'no'}`;
    } else if (templateId === 'pricing-page') {
      const ctaText = (config.cta_text as Record<string, string> || {});
      text = `PLAN ORDER: ${(config.plans_order as string[] || []).join(' · ')}\n` +
        `Highlighted: ${config.highlighted_plan || ''} · Annual default: ${config.annual_default ? 'yes' : 'no'}\n` +
        `CTAs: ${Object.entries(ctaText).map(([k, v]) => `${k}="${v}"`).join(' · ')}`;
    } else if (templateId === 'feature-announcement') {
      text = `POSITION: ${config.feature_position || ''} · View: ${config.default_view || ''}\n` +
        `Badge: ${config.show_badge ? `"${config.badge_text}"` : 'hidden'} · Show delay: ${config.auto_show_delay}ms\n` +
        `Tooltip: ${config.show_tooltip ? `"${config.tooltip_content}"` : 'hidden'}`;
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
  if (!config) return null;

  return (
    <div>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Your Optimized Result
      </h3>
      <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 10, padding: 20, border: '1px solid rgba(16,185,129,0.15)', marginBottom: 16 }}>
        <>
          <div style={{ fontFamily: serif, fontSize: 18, fontStyle: 'italic', color: ink, lineHeight: 1.4, marginBottom: 10 }}>
            "{config?.headline || config?.subject_line || 'N/A'}"
          </div>
          {config?.subheadline && <div style={{ fontSize: 13, color: inkMuted, marginBottom: 10 }}>{config.subheadline}</div>}
          {(config?.cta_text || config?.cta) && (
            <div style={{ fontFamily: mono, fontSize: 12, color: copper }}>
              CTA: {config?.cta_text || config?.cta}
            </div>
          )}
        </>
        <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, marginTop: 12 }}>
          {METRIC_LABEL[templateId] ?? 'Score'}: {fmtMetric(best?.metric ?? 0, templateId)} · {(best?.experiment_count ?? 0)} experiments
        </div>
      </div>
      {renderedOutput && (
        <button onClick={handleCopy} style={{ padding: '8px 16px', fontSize: 12, background: copied ? green : copper, color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
          {copied ? '✓ Copied!' : 'Copy Result'}
        </button>
      )}
    </div>
  );
}

function AgentStatusPanel({ agents }: { agents: ReturnType<typeof useForgeStore>['agents'] }) {
  if (agents.length === 0) return null;
  return (
    <div style={{ marginBottom: 32 }}>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Agent Status
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {agents.map((agent, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0' }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', marginTop: 5, background: agent.status === 'running' ? copper : agent.status === 'thinking' ? green : inkMuted, opacity: 0.8 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: ink, marginBottom: 4 }}>{agent.name}</div>
              <div style={{ fontSize: 11, color: inkMuted, lineHeight: 1.5 }}>
                {agent.current_hypothesis ?? `${agent.experiments_run} experiments run`}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExperimentLog({ experiments, templateId }: { experiments: ReturnType<typeof useForgeStore>['experiments']; templateId: string }) {
  if (experiments.length === 0) return null;

  return (
    <div>
      <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>
        Experiment Log
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {experiments.map((exp, i) => {
          const isSuccess = exp.status === 'success';
          const diff = fmtDiff(exp.metric_after - exp.metric_before, templateId);
          return (
            <div key={exp.id || i} style={{ padding: '12px 0', borderBottom: '1px solid rgba(26,22,20,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: inkMuted }}>
                  #{experiments.length - i} · {exp.agent_name}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: isSuccess ? green : '#EF4444' }}>
                  {diff}
                </div>
              </div>
              <div style={{ fontSize: 13, color: 'rgba(26,22,20,0.7)', lineHeight: 1.5 }}>
                <span style={{ fontWeight: 500, marginRight: 4 }}>{exp.hypothesis}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────

export default function ProjectDetails() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [projectData, setProjectData] = useState<{
    name: string;
    template_id: string;
    description: string;
  } | null>(null);
  const [view, setView] = useState<'live' | 'report'>('live');
  const [_deployedCycle, setDeployedCycle] = useState(false);

  useEffect(() => {
    async function loadProject() {
      if (!id) return;
      if (id.startsWith('demo-')) {
        const tpl = searchParams.get('template') || 'landing-page-cro';
        setProjectData({ name: 'Demo Project', template_id: tpl, description: '' });
        return;
      }
      // Try Supabase first
      const { data } = await supabase
        .from('projects')
        .select('name, template_id, description')
        .eq('id', id)
        .single();
      if (data) { setProjectData(data); return; }
      // Fallback: load from backend API (in-memory store)
      try {
        const res = await fetch(`${API_BASE}/projects/${id}`);
        const proj = await res.json();
        if (proj && proj.name) {
          setProjectData({ name: proj.name, template_id: proj.template_id, description: proj.description ?? '' });
        }
      } catch { /* ignore */ }
    }
    loadProject();
  }, [id]);

  // Fetch existing cycle from API on mount
  useEffect(() => {
    if (!id) return;
    fetch(`${API_BASE}/projects/${id}/cycle`)
      .then(r => r.json())
      .catch(() => null);
    // Cycle state comes via WebSocket; this just ensures we don't miss on refresh
  }, [id]);

  const templateId = (projectData?.template_id || 'landing-page-cro') as TemplateId;
  const store = useForgeStore(templateId, id);
  const [isRunning, setIsRunning] = useState(false);

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

  useEffect(() => {
    if (store.agents.length > 0) {
      const anyRunning = store.agents.some(a => a.status === 'running' || a.status === 'thinking');
      setIsRunning(anyRunning);
    }
  }, [store.agents]);

  const handleDeployConfirmed = useCallback(() => {
    setDeployedCycle(true);
  }, []);

  const activeCycle = store.activeCycle;
  const cycleHistory = store.cycleHistory;
  const isLiveMode = activeCycle !== null;

  return (
    <div>
      {/* Control Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: '12px 16px', background: cream, borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
        <div style={{ fontSize: 13, color: inkMuted, display: 'flex', gap: 16, alignItems: 'center' }}>
          {isRunning ? (
            <span style={{ color: green }}>● Running experiments</span>
          ) : activeCycle?.state === 'pending_deployment' ? (
            <span style={{ color: copper }}>● Awaiting deployment</span>
          ) : activeCycle?.state === 'measuring' ? (
            <span style={{ color: green }}>● Measuring live traffic</span>
          ) : store.experimentCount > 0 ? (
            <span>○ Stopped</span>
          ) : (
            <span>○ Ready to start</span>
          )}
          {cycleHistory.length > 0 && (
            <span style={{ fontSize: 12 }}>
              {cycleHistory.filter(c => c.decision === 'kept').length} improvements kept
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Open the live demo page in a new tab — available for structural template */}
          {(['structural', 'landing-page-cro'] as string[]).includes(templateId) && (
            <a
              href={`/demo-page?template=${templateId}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '7px 14px', fontSize: 12, background: 'transparent',
                color: copper, border: `1px solid ${copper}`, borderRadius: 6,
                cursor: 'pointer', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              <span style={{ fontSize: 10 }}>↗</span> Open Live Page
            </a>
          )}
          {cycleHistory.length > 0 && (
            <button onClick={() => setView(v => v === 'report' ? 'live' : 'report')}
              style={{ padding: '7px 14px', fontSize: 12, background: view === 'report' ? copper : 'transparent', color: view === 'report' ? '#FFF' : inkMuted, border: '1px solid rgba(26,22,20,0.1)', borderRadius: 6, cursor: 'pointer' }}>
              {view === 'report' ? 'Live View' : 'Morning Report'}
            </button>
          )}
          {isRunning ? (
            <button onClick={handleStop} style={{ padding: '7px 14px', fontSize: 12, background: '#EF4444', color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              Stop
            </button>
          ) : !isLiveMode && (
            <button onClick={handleStart} style={{ padding: '7px 14px', fontSize: 12, background: copper, color: '#FFF', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              {store.experimentCount > 0 ? 'Continue' : 'Start'}
            </button>
          )}
        </div>
      </div>

      {/* ── Morning Report view ── */}
      {view === 'report' && (
        <MorningReport
          cycleHistory={cycleHistory}
          experimentCount={store.experimentCount}
          templateId={templateId}
          projectId={id ?? ''}
          onContinue={() => { setView('live'); handleStart(); }}
        />
      )}

      {/* ── Live view ── */}
      {view === 'live' && (
        <>
          {/* Deployment Panel — shown when a variant is ready */}
          {activeCycle?.state === 'pending_deployment' && id && (
            <DeploymentPanel
              cycle={activeCycle}
              projectId={id}
              onDeployed={handleDeployConfirmed}
            />
          )}

          {/* Measurement Timer — shown while measuring */}
          {activeCycle?.state === 'measuring' && id && (
            <MeasurementTimer cycle={activeCycle} projectId={id} />
          )}

          {/* Checkpoint banner */}
          {store.checkpointState?.atCheckpoint && (
            <div style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', border: '1px solid #f59e0b', borderRadius: 12, padding: 20, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#92400e', marginBottom: 4 }}>Checkpoint Reached</div>
                  <div style={{ fontSize: 13, color: '#b45309' }}>{store.checkpointState.message}</div>
                  <div style={{ fontSize: 12, color: '#92400e', marginTop: 8 }}>
                    Best: <strong style={{ fontFamily: mono }}>{store.checkpointState.currentBest?.metric.toFixed(4) ?? '—'}</strong>
                    {' '} | Experiments: <strong>{store.checkpointState.experimentCount}</strong>
                    {' '} | Improvements: <strong>{store.checkpointState.improvementsFound}</strong>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => store.continueOptimization(id ?? '')}
                    style={{ padding: '8px 20px', fontSize: 13, fontWeight: 600, background: green, color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    Continue
                  </button>
                  <button onClick={() => store.stopOptimization(id ?? '')}
                    style={{ padding: '8px 16px', fontSize: 13, background: '#fff', color: '#92400e', border: '1px solid #f59e0b', borderRadius: 6, cursor: 'pointer' }}>
                    Stop
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Hero + Stats */}
          {!activeCycle && (
            <Hero
              best={store.globalBest}
              experimentCount={store.experimentCount}
              totalCost={store.cost.total}
              agentCount={store.agents.length}
              templateId={templateId}
            />
          )}

          <StatsRow
            best={store.globalBest}
            experimentCount={store.experimentCount}
            cost={store.cost}
            cycleHistory={cycleHistory}
            templateId={templateId}
            successCount={store.experiments.filter(e => e.status === 'success').length}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 40 }}>
            <div>
              <OptimizationCurve curve={store.optimizationCurve} templateId={templateId} />
              <Transformation best={store.globalBest} templateId={templateId} />
            </div>
            <div>
              <AgentStatusPanel agents={store.agents} />
              <ExperimentLog experiments={store.experiments} templateId={templateId} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
