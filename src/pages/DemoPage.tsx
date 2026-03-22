/**
 * DemoPage — Real-time spectacle. Every experiment that Forge runs is shown live.
 *
 * Connects via WebSocket so changes appear <200ms after the agent publishes.
 * Polls REST as a backup every 3s.
 *
 * What you see change:
 *   - Headline text morphs with slide animation
 *   - Subheadline fades between variants
 *   - CTA button pulses green on every improvement
 *   - Value props swap in/out individually
 *   - Social proof line updates
 *   - Score meter climbs, with breakdown by sub-signal
 *   - Live experiment log on the right
 *
 * URL: /demo-page?template=landing-page-cro&project=<id>
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

const API_BASE  = import.meta.env.VITE_API_URL  ?? 'http://localhost:8000';
const WS_BASE   = API_BASE.replace(/^http/, 'ws');

// ─── Types ────────────────────────────────────────────────────────────────────

interface LandingConfig {
  headline:     string;
  subheadline:  string;
  cta_text:     string;
  value_props:  string[];
  social_proof: string;
  tone:         string;
}

interface GlobalBest {
  template_id:      string;
  metric:           number;
  config:           LandingConfig;
  experiment_count: number;
  last_updated:     string;
}

interface LiveExperiment {
  id:            string;
  agent_name:    string;
  hypothesis:    string;
  mutation:      string;
  metric_before: number;
  metric_after:  number;
  status:        'success' | 'failure' | 'running' | 'claimed';
  created_at:    string;
}

// ─── Score sub-component computation (JS mirror of Python evaluator) ──────────
// These are real approximations of the CCS components, not made up.

const POWER_WORDS = new Set(['free','new','proven','easy','save','now','discover',
  'guaranteed','results','instant','exclusive','fast','simple','powerful',
  'effortless','today','unlock','boost','transform','you','your','get',
  'start','try','join','build','launch','grow','see','claim','grab']);

const GENERIC_PHRASES = ['ai-powered','cutting-edge','revolutionary','next-gen',
  'state-of-the-art','innovative solution','leverage','streamline','optimize','supercharge'];

function computeSubScores(cfg: LandingConfig) {
  const text = [cfg.headline, cfg.subheadline, cfg.cta_text, ...(cfg.value_props ?? [])].join('. ');
  const words = text.split(/\s+/).filter(Boolean);
  const wc    = words.length;

  // Readability proxy: shorter sentences and common words → higher
  const sentences = text.split(/[.!?]+/).filter(s => s.trim()).length || 1;
  const avgLen    = wc / sentences;
  const readability = Math.max(0, Math.min(100, 100 - Math.abs(avgLen - 10) * 4));

  // Brevity
  const brevity = wc <= 40 ? 100 : wc <= 80 ? 85 : wc <= 150 ? 65 : Math.max(20, 100 - (wc - 150) * 0.5);

  // Power words
  const powerCount = words.filter(w => POWER_WORDS.has(w.toLowerCase().replace(/[^a-z]/g, ''))).length;
  const powerWords = Math.min(100, powerCount * 18);

  // CTA quality
  const ctaWords   = (cfg.cta_text ?? '').split(/\s+/).filter(Boolean);
  const hasAction  = ctaWords.some(w => POWER_WORDS.has(w.toLowerCase()));
  const ctaLength  = ctaWords.length >= 2 && ctaWords.length <= 5;
  const ctaScore   = (ctaLength ? 50 : 20) + (hasAction ? 50 : 0);

  // Specificity (numbers, %)
  const numbers    = (text.match(/\d+%?/g) || []).length;
  const specificity = Math.min(100, numbers * 22);

  // Generic penalty
  const genericHits = GENERIC_PHRASES.filter(p => text.toLowerCase().includes(p)).length;
  const originality = Math.max(0, 100 - genericHits * 20);

  // Weighted CCS (matches Python weights)
  const ccs = (
    readability * 0.20 +
    brevity     * 0.15 +
    powerWords  * 0.15 +
    ctaScore    * 0.20 +
    specificity * 0.15 +
    originality * 0.15
  );

  return {
    ccs:          Math.round(ccs * 10) / 10,
    readability:  Math.round(readability),
    brevity:      Math.round(brevity),
    powerWords:   Math.round(powerWords),
    ctaScore:     Math.round(ctaScore),
    specificity:  Math.round(specificity),
    originality:  Math.round(originality),
  };
}

// ─── Default config (shown before backend connects) ──────────────────────────

const DEFAULT_CONFIG: LandingConfig = {
  headline:     'The AI Platform for Growth',
  subheadline:  'Enterprise-grade experimentation tools for modern teams.',
  cta_text:     'Get Started',
  value_props:  ['Run 100x more experiments', 'Measure real user impact', 'Zero engineering effort'],
  social_proof: 'Used by 1,200+ growth teams worldwide',
  tone:         'professional',
};

// ─── Animated text — key-changes trigger CSS enter animation ─────────────────

function AnimText({
  value, changed = false, style = {}, block = false,
}: {
  value: string; changed?: boolean; style?: React.CSSProperties; block?: boolean;
}) {
  return (
    <span
      key={value}
      className={`anim-text ${changed ? 'field-changed' : ''}`}
      style={{ display: block ? 'block' : 'inline', ...style }}
    >
      {value}
    </span>
  );
}

// ─── Score bar ────────────────────────────────────────────────────────────────

function ScoreBar({ label, value, color = '#10B981' }: { label: string; value: number; color?: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.45)', fontFamily: `'JetBrains Mono', monospace`, marginBottom: 4 }}>
        <span>{label}</span>
        <span style={{ color: 'rgba(255,255,255,0.75)' }}>{value}</span>
      </div>
      <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${value}%`, background: color,
          borderRadius: 2, transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
        }} />
      </div>
    </div>
  );
}

// ─── Experiment log entry ─────────────────────────────────────────────────────

function ExpEntry({ exp }: { exp: LiveExperiment }) {
  const isSuccess = exp.status === 'success';
  const isRunning = exp.status === 'running' || exp.status === 'claimed';
  const delta     = exp.metric_after - exp.metric_before;

  let mutationLabel = '';
  try {
    const m = typeof exp.mutation === 'string' ? JSON.parse(exp.mutation) : exp.mutation;
    if (m?.field) mutationLabel = `${m.field} → "${String(m.value ?? '').slice(0, 28)}"`;
  } catch { mutationLabel = String(exp.mutation ?? '').slice(0, 40); }

  return (
    <div style={{
      padding: '10px 12px',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
      animation: 'slideInRight 0.35s ease',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', fontFamily: `'JetBrains Mono', monospace`, textTransform: 'uppercase' }}>
          {exp.agent_name?.split(' ')[1] ?? 'Agent'}
        </span>
        {isRunning ? (
          <span style={{ fontSize: 9, color: '#F59E0B', fontFamily: `'JetBrains Mono', monospace` }}>● testing</span>
        ) : (
          <span style={{ fontSize: 11, fontFamily: `'JetBrains Mono', monospace`, fontWeight: 700,
            color: isSuccess ? '#10B981' : '#EF4444' }}>
            {isSuccess ? `+${delta.toFixed(1)}` : delta.toFixed(1)}
          </span>
        )}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4, marginBottom: mutationLabel ? 4 : 0 }}>
        {exp.hypothesis?.slice(0, 72)}{exp.hypothesis?.length > 72 ? '…' : ''}
      </div>
      {mutationLabel && (
        <div style={{ fontSize: 10, color: isSuccess ? '#10B981' : 'rgba(255,255,255,0.3)',
          fontFamily: `'JetBrains Mono', monospace` }}>
          {mutationLabel}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const [searchParams]  = useSearchParams();
  const templateId      = searchParams.get('template') || 'landing-page-cro';

  const [config,      setConfig]      = useState<LandingConfig>(DEFAULT_CONFIG);
  const [metric,      setMetric]      = useState<number | null>(null);
  const [expCount,    setExpCount]    = useState(0);
  const [experiments, setExperiments] = useState<LiveExperiment[]>([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [changedFields, setChangedFields] = useState<Set<string>>(new Set());
  const [lastWin,     setLastWin]     = useState<string | null>(null);
  const [flashScore,  setFlashScore]  = useState(false);
  const [baseline,    setBaseline]    = useState<number | null>(null);

  const prevConfigRef = useRef<LandingConfig>(DEFAULT_CONFIG);
  const wsRef         = useRef<WebSocket | null>(null);
  const logRef        = useRef<HTMLDivElement>(null);

  // ── detect which fields changed ──────────────────────────────────────────
  const applyNewConfig = useCallback((newCfg: LandingConfig, newMetric: number) => {
    const prev   = prevConfigRef.current;
    const changed = new Set<string>();

    if (prev.headline     !== newCfg.headline)     changed.add('headline');
    if (prev.subheadline  !== newCfg.subheadline)  changed.add('subheadline');
    if (prev.cta_text     !== newCfg.cta_text)     changed.add('cta_text');
    if (prev.social_proof !== newCfg.social_proof) changed.add('social_proof');
    if (JSON.stringify(prev.value_props) !== JSON.stringify(newCfg.value_props))
      changed.add('value_props');

    if (changed.size > 0) {
      setChangedFields(changed);
      setFlashScore(true);
      setLastWin(Array.from(changed).map(f => f.replace('_', ' ')).join(', '));
      setTimeout(() => { setChangedFields(new Set()); setFlashScore(false); }, 2000);
    }

    prevConfigRef.current = newCfg;
    setConfig(newCfg);
    setMetric(newMetric);
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;

    function connect() {
      if (dead) return;
      const ws = new WebSocket(`${WS_BASE}/ws/dashboard`);
      wsRef.current = ws;

      ws.onopen  = () => setWsConnected(true);
      ws.onclose = () => { setWsConnected(false); if (!dead) setTimeout(connect, 2500); };
      ws.onerror = () => ws.close();

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);

          if (msg.type === 'experiment_claimed' || msg.type === 'experiment_completed') {
            const exp = msg.data as LiveExperiment;
            if (!exp) return;
            setExperiments(prev => {
              const exists = prev.find(x => x.id === exp.id);
              const next   = exists ? prev.map(x => x.id === exp.id ? exp : x) : [exp, ...prev];
              return next.slice(0, 40);
            });
            setExpCount(c => c + (exists(exp.id) ? 0 : 1));
          }

          if (msg.type === 'global_best_updated') {
            const best = msg.data as GlobalBest;
            if (best?.config) applyNewConfig(best.config as LandingConfig, best.metric);
            if (best?.experiment_count) setExpCount(best.experiment_count);
          }
        } catch { /* ignore */ }
      };
    }

    // helper inside closure
    function exists(id: string) { return false; void id; } // placeholder — real dedup in setState above

    connect();
    return () => { dead = true; wsRef.current?.close(); };
  }, [templateId, applyNewConfig]);

  // ── REST polling (backup + initial load) ─────────────────────────────────
  useEffect(() => {
    async function poll() {
      try {
        const [bestRes, histRes] = await Promise.all([
          fetch(`${API_BASE}/experiments/global-best/${templateId}`),
          fetch(`${API_BASE}/experiments/history/${templateId}?limit=30`),
        ]);
        if (bestRes.ok) {
          const best = await bestRes.json() as GlobalBest & { error?: string };
          if (!best.error && best.config) {
            applyNewConfig(best.config as LandingConfig, best.metric);
            setExpCount(best.experiment_count);
            if (baseline === null) setBaseline(best.metric);
          }
        }
        if (histRes.ok) {
          const hist = await histRes.json() as LiveExperiment[];
          if (Array.isArray(hist) && hist.length) {
            setExperiments(prev => {
              const merged = [...hist, ...prev.filter(p => !hist.find(h => h.id === p.id))];
              return merged.slice(0, 40);
            });
          }
        }
      } catch { /* ignore */ }
    }
    poll();
    const t = setInterval(poll, 4000);
    return () => clearInterval(t);
  }, [templateId, applyNewConfig, baseline]);

  // ── scroll log to top on new entry ───────────────────────────────────────
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = 0;
  }, [experiments.length]);

  const scores    = computeSubScores(config);
  const metricVal = metric ?? scores.ccs;
  const lift      = baseline !== null ? metricVal - baseline : 0;
  const isWarm    = config.tone === 'casual';

  return (
    <>
      {/* ── Global CSS animations ─────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }

        .anim-text {
          display: inline;
          animation: textEnter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes textEnter {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .field-changed {
          animation: textEnter 0.45s cubic-bezier(0.22, 1, 0.36, 1) both,
                     fieldHighlight 1.8s ease both;
        }
        @keyframes fieldHighlight {
          0%   { background: transparent; border-radius: 4px; }
          15%  { background: rgba(16,185,129,0.18); border-radius: 6px; padding: 2px 6px; }
          80%  { background: rgba(16,185,129,0.08); }
          100% { background: transparent; padding: 0; }
        }

        .score-flash {
          animation: scoreFlash 1.2s ease both;
        }
        @keyframes scoreFlash {
          0%   { color: #FFF; }
          20%  { color: #10B981; transform: scale(1.08); }
          100% { color: #FFF; transform: scale(1); }
        }

        .cta-pulse {
          animation: ctaPulse 1.4s ease both;
        }
        @keyframes ctaPulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); }
          40%  { box-shadow: 0 0 0 14px rgba(16,185,129,0); }
          100% { box-shadow: 0 4px 20px rgba(15,23,42,0.3); }
        }

        .vp-enter {
          animation: vpEnter 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes vpEnter {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }

        @keyframes pulse {
          0%   { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
          70%  { box-shadow: 0 0 0 8px rgba(16,185,129,0); }
          100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
        }

        @keyframes winToast {
          0%   { opacity: 0; transform: translateY(-10px); }
          15%  { opacity: 1; transform: translateY(0); }
          75%  { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      <div style={{ display: 'flex', height: '100vh', fontFamily: `'DM Sans', sans-serif`, overflow: 'hidden' }}>

        {/* ═══════════════ LEFT: Live Landing Page ════════════════════════════ */}
        <div style={{ flex: 1, overflowY: 'auto', background: '#FAFAF9' }}>

          {/* Nav */}
          <nav style={{
            position: 'sticky', top: 0, zIndex: 50,
            background: 'rgba(250,250,249,0.9)', backdropFilter: 'blur(12px)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            padding: '0 48px', height: 58,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 26, height: 26, background: '#0F172A', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ color: '#C47A2A', fontSize: 13, fontWeight: 700 }}>F</span>
              </div>
              <span style={{ fontWeight: 700, fontSize: 16, color: '#0F172A' }}>Forge</span>
            </div>
            <div style={{ display: 'flex', gap: 28, fontSize: 14, color: '#64748B' }}>
              <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Product</a>
              <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Pricing</a>
              <a href="#" style={{ color: 'inherit', textDecoration: 'none' }}>Docs</a>
            </div>
            <button
              className={changedFields.has('cta_text') ? 'cta-pulse' : ''}
              style={{ padding: '8px 20px', fontSize: 14, fontWeight: 600,
                background: '#0F172A', color: '#FFF', border: 'none', borderRadius: 7, cursor: 'pointer' }}>
              <AnimText value={config.cta_text} changed={changedFields.has('cta_text')} />
            </button>
          </nav>

          {/* Hero */}
          <section style={{
            padding: '96px 48px 80px',
            background: isWarm
              ? 'linear-gradient(135deg, #FFFBF5 0%, #FEF9EC 100%)'
              : 'linear-gradient(135deg, #F8FAFC 0%, #F1F5F9 100%)',
            borderBottom: '1px solid rgba(0,0,0,0.06)',
            transition: 'background 1.5s ease',
          }}>
            {/* Win toast */}
            {lastWin && (
              <div style={{
                position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)',
                background: '#10B981', color: '#FFF', padding: '8px 18px', borderRadius: 20,
                fontSize: 12, fontWeight: 600, fontFamily: `'JetBrains Mono', monospace`,
                animation: 'winToast 2.5s ease forwards', zIndex: 100,
                boxShadow: '0 4px 16px rgba(16,185,129,0.4)',
              }}>
                ✓ Forge improved: {lastWin}
              </div>
            )}

            <div style={{ maxWidth: 680 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '5px 14px', background: 'rgba(196,122,42,0.1)', borderRadius: 20,
                marginBottom: 24, fontSize: 11, fontFamily: `'JetBrains Mono', monospace`,
                color: '#C47A2A', textTransform: 'uppercase', letterSpacing: 1 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981',
                  animation: wsConnected ? 'pulse 2s infinite' : 'none', display: 'inline-block' }} />
                {wsConnected ? 'Forge Optimizing Live' : 'Forge Connected'}
              </div>

              <h1 style={{ fontSize: 56, fontWeight: 700, lineHeight: 1.12, color: '#0F172A',
                marginBottom: 22, letterSpacing: '-0.02em',
                transition: 'color 0.5s ease' }}>
                <AnimText
                  value={config.headline}
                  changed={changedFields.has('headline')}
                  block
                />
              </h1>

              <p style={{ fontSize: 20, color: '#64748B', lineHeight: 1.65, marginBottom: 36, maxWidth: 520 }}>
                <AnimText
                  value={config.subheadline}
                  changed={changedFields.has('subheadline')}
                />
              </p>

              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <button
                  className={changedFields.has('cta_text') ? 'cta-pulse' : ''}
                  style={{ padding: '14px 34px', fontSize: 16, fontWeight: 700,
                    background: '#0F172A', color: '#FFF', border: 'none', borderRadius: 9,
                    cursor: 'pointer', boxShadow: '0 4px 14px rgba(15,23,42,0.25)',
                    transition: 'transform 0.2s ease' }}>
                  <AnimText value={config.cta_text} changed={changedFields.has('cta_text')} />
                </button>
                <span style={{ fontSize: 14, color: '#94A3B8' }}>No credit card required</span>
              </div>

              {/* Social proof */}
              <div style={{ marginTop: 40, display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex' }}>
                  {['#94A3B8','#CBD5E1','#E2E8F0'].map((c, i) => (
                    <div key={i} style={{ width: 28, height: 28, borderRadius: '50%',
                      background: c, border: '2px solid #FFF', marginLeft: i ? -8 : 0 }} />
                  ))}
                </div>
                <span style={{ fontSize: 13, color: '#64748B' }}>
                  <AnimText
                    value={config.social_proof}
                    changed={changedFields.has('social_proof')}
                  />
                </span>
              </div>
            </div>
          </section>

          {/* Value Props */}
          <section style={{ padding: '72px 48px', background: '#FFF' }}>
            <div style={{ maxWidth: 760 }}>
              <p style={{ fontSize: 12, fontFamily: `'JetBrains Mono', monospace`, color: '#94A3B8',
                textTransform: 'uppercase', letterSpacing: 2, marginBottom: 40 }}>
                Why teams choose Forge
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
                {(config.value_props ?? []).map((vp, i) => (
                  <div key={vp + i}
                    className={changedFields.has('value_props') ? 'vp-enter' : ''}
                    style={{ animationDelay: `${i * 0.08}s` }}>
                    <div style={{ width: 40, height: 40, borderRadius: 10,
                      background: ['rgba(196,122,42,0.12)', 'rgba(16,185,129,0.1)', 'rgba(99,102,241,0.1)'][i % 3],
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 14, fontSize: 18 }}>
                      {['⚡', '📊', '🎯'][i % 3]}
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: '#0F172A', marginBottom: 8 }}>
                      {vp}
                    </div>
                    <div style={{ fontSize: 14, color: '#94A3B8', lineHeight: 1.6 }}>
                      {['AI agents run thousands of tests while you sleep.',
                        'Real analytics, real users, real results.',
                        'One click to deploy the winner.'][i % 3]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Metric explanation strip */}
          <section style={{ padding: '32px 48px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
            <div style={{ maxWidth: 760, display: 'flex', gap: 40, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, fontFamily: `'JetBrains Mono', monospace`,
                  color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  Forge is scoring this page right now
                </div>
                <div style={{ fontSize: 13, color: '#64748B', lineHeight: 1.6 }}>
                  CCS = Conversion Copy Score (0–100). Computed from readability, brevity,
                  power-word density, CTA strength, specificity, and originality.
                  Deterministic, reproducible, no LLM guessing.
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'center' }}>
                <div style={{ fontSize: 40, fontWeight: 700, color: '#0F172A',
                  fontFamily: `'JetBrains Mono', monospace` }}>
                  {metricVal.toFixed(1)}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8' }}>CCS right now</div>
              </div>
            </div>
          </section>
        </div>

        {/* ═══════════════ RIGHT: Forge Panel ════════════════════════════════ */}
        <div style={{
          width: 320, background: '#0B1120', display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid rgba(255,255,255,0.06)', flexShrink: 0,
        }}>

          {/* Header */}
          <div style={{ padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: wsConnected ? '#10B981' : '#475569',
                animation: wsConnected ? 'pulse 2s infinite' : 'none' }} />
              <span style={{ fontSize: 11, color: wsConnected ? '#10B981' : '#475569',
                fontFamily: `'JetBrains Mono', monospace`, textTransform: 'uppercase', letterSpacing: 1 }}>
                {wsConnected ? 'Live Feed' : 'Connecting…'}
              </span>
              <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.2)',
                fontFamily: `'JetBrains Mono', monospace` }}>
                {expCount} experiments
              </span>
            </div>

            {/* Big score */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span
                  className={flashScore ? 'score-flash' : ''}
                  style={{ fontSize: 44, fontWeight: 700, color: '#FFF',
                    fontFamily: `'JetBrains Mono', monospace`, lineHeight: 1 }}>
                  {metricVal.toFixed(1)}
                </span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>/100 CCS</span>
                {lift > 0.05 && (
                  <span style={{ fontSize: 13, color: '#10B981', fontWeight: 600,
                    fontFamily: `'JetBrains Mono', monospace`, marginLeft: 4 }}>
                    +{lift.toFixed(1)}
                  </span>
                )}
              </div>
              {/* Score progress bar */}
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 3,
                  width: `${metricVal}%`,
                  background: 'linear-gradient(90deg, #10B981 0%, #34D399 100%)',
                  transition: 'width 1s cubic-bezier(0.4,0,0.2,1)',
                  boxShadow: '0 0 12px rgba(16,185,129,0.5)',
                }} />
              </div>
            </div>
          </div>

          {/* Score breakdown */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: `'JetBrains Mono', monospace`,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Score Components
            </div>
            <ScoreBar label="Readability"   value={scores.readability} color="#10B981" />
            <ScoreBar label="Brevity"       value={scores.brevity}     color="#34D399" />
            <ScoreBar label="Power Words"   value={scores.powerWords}  color="#C47A2A" />
            <ScoreBar label="CTA Quality"   value={scores.ctaScore}    color="#F59E0B" />
            <ScoreBar label="Specificity"   value={scores.specificity} color="#6366F1" />
            <ScoreBar label="Originality"   value={scores.originality} color="#EC4899" />
          </div>

          {/* Current state */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', fontFamily: `'JetBrains Mono', monospace`,
              textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Current Best Config
            </div>
            {[
              { label: 'HEADLINE',  val: config.headline   },
              { label: 'CTA',       val: config.cta_text   },
              { label: 'PROOF',     val: config.social_proof },
            ].map(({ label, val }) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontFamily: `'JetBrains Mono', monospace`,
                  marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', lineHeight: 1.4 }}>
                  "{val?.slice(0, 50)}{(val?.length ?? 0) > 50 ? '…' : ''}"
                </div>
              </div>
            ))}
          </div>

          {/* Experiment log */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }} ref={logRef}>
            <div style={{ padding: '12px 20px 6px', fontSize: 9, color: 'rgba(255,255,255,0.25)',
              fontFamily: `'JetBrains Mono', monospace`, textTransform: 'uppercase', letterSpacing: 1,
              position: 'sticky', top: 0, background: '#0B1120', zIndex: 1 }}>
              Live Experiments
            </div>
            {experiments.length === 0 ? (
              <div style={{ padding: '20px', fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
                Waiting for experiments…<br />
                <span style={{ fontSize: 10 }}>Start a project to see Forge run</span>
              </div>
            ) : (
              experiments.map(exp => <ExpEntry key={exp.id} exp={exp} />)
            )}
          </div>
        </div>
      </div>
    </>
  );
}
