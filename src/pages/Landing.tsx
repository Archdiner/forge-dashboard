import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

// ── Design tokens ──────────────────────────────────────────────
const font   = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono   = `'JetBrains Mono', monospace`;
const serif  = `'Instrument Serif', Georgia, serif`;
const copper      = '#C47A2A';
const copperDim   = 'rgba(196,122,42,0.12)';
const copperBorder= 'rgba(196,122,42,0.28)';
const ink         = '#1A1614';
const inkMuted    = 'rgba(26,22,20,0.45)';
const inkFaint    = 'rgba(26,22,20,0.1)';
const cream       = '#FAF8F5';
const green       = '#10B981';
const greenDim    = 'rgba(16,185,129,0.12)';
const dark        = '#161514';
const white       = '#FFFFFF';

// ── Logo ──────────────────────────────────────────────────────
function DiamondMark({
  size = 32,
  outerColor = ink,
  innerColor = copper,
}: {
  size?: number;
  outerColor?: string;
  innerColor?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polygon points="16,1 31,16 16,31 1,16" fill={outerColor} />
      <polygon points="16,8 24,16 16,24 8,16" fill={innerColor} />
    </svg>
  );
}

function ForgeLogo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  const nameColor = light ? 'rgba(255,255,255,0.9)' : ink;
  const outerColor = light ? 'rgba(255,255,255,0.9)' : ink;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(size * 0.32) }}>
      <DiamondMark size={size} outerColor={outerColor} innerColor={copper} />
      <span style={{
        fontFamily: mono,
        fontSize: Math.round(size * 0.57),
        fontWeight: 600,
        color: nameColor,
        letterSpacing: '-0.03em',
        lineHeight: 1,
      }}>
        forge
      </span>
    </div>
  );
}

// ── Agent Terminal ─────────────────────────────────────────────
const EXPERIMENTS = [
  {
    hypothesis: 'Question-format headline creates stronger curiosity gap',
    mutation: '"Want to 10x your CVR tonight?"',
    result: 3.89,
    diff: '+0.43pp',
  },
  {
    hypothesis: 'Social proof count increases trust signal above fold',
    mutation: '"2,847 teams already optimizing"',
    result: 4.01,
    diff: '+0.55pp',
  },
  {
    hypothesis: 'Frictionless CTA copy reduces commitment anxiety',
    mutation: '"Start Free — No Card Needed"',
    result: 3.74,
    diff: '+0.28pp',
  },
];

// phase: 0=idle 1=thinking 2=hypothesis 3=deploying 4=measuring 5=result 6=kept
const DURATIONS = [500, 1100, 1500, 900, 1900, 1500, 1300];

function AgentTerminal() {
  const [cycle, setCycle]           = useState(0);
  const [phase, setPhase]           = useState(0);
  const [typed, setTyped]           = useState('');
  const [sessions, setSessions]     = useState(0);
  const [measuredCvr, setMeasured]  = useState(3.46);

  const exp = EXPERIMENTS[cycle % EXPERIMENTS.length];
  const termMuted  = 'rgba(255,255,255,0.32)';
  const termText   = 'rgba(255,255,255,0.82)';
  const termBg     = '#0D0C0B';

  // Phase advancement
  useEffect(() => {
    const t = setTimeout(() => {
      if (phase < 6) {
        setPhase(p => p + 1);
      } else {
        setCycle(c => c + 1);
        setPhase(0);
        setMeasured(3.46);
        setSessions(0);
        setTyped('');
      }
    }, DURATIONS[phase]);
    return () => clearTimeout(t);
  }, [phase, cycle]);

  // Typewriter
  useEffect(() => {
    if (phase !== 2) return;
    setTyped('');
    let i = 0;
    const str = exp.hypothesis;
    const iv = setInterval(() => {
      if (i < str.length) { setTyped(str.slice(0, i + 1)); i++; }
      else clearInterval(iv);
    }, 24);
    return () => clearInterval(iv);
  }, [phase, cycle]);

  // Session counter
  useEffect(() => {
    if (phase !== 4) return;
    let n = 0;
    const target = 1247;
    const iv = setInterval(() => {
      n = Math.min(n + 42, target);
      setSessions(n);
      if (n >= target) clearInterval(iv);
    }, 60);
    return () => clearInterval(iv);
  }, [phase]);

  // CVR animation
  useEffect(() => {
    if (phase !== 5) return;
    let cur = 3.46;
    const target = exp.result;
    const step = (target - cur) / 36;
    const iv = setInterval(() => {
      cur = Math.min(cur + step, target);
      setMeasured(+cur.toFixed(4));
      if (cur >= target) clearInterval(iv);
    }, 30);
    return () => clearInterval(iv);
  }, [phase, cycle]);

  return (
    <div style={{
      background: termBg,
      borderRadius: 18,
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.07)',
      boxShadow: '0 40px 80px -20px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.3)',
      fontFamily: mono,
      fontSize: 12,
    }}>
      {/* Title bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '13px 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: green,
          boxShadow: `0 0 10px ${green}70`,
          animation: 'pulse-green 2s ease-in-out infinite',
        }} />
        <span style={{ color: termText, fontWeight: 500 }}>Forge Agent</span>
        <span style={{ color: termMuted }}>· running</span>
        <div style={{ marginLeft: 'auto' }}>
          <span style={{
            background: copperDim, border: `1px solid ${copperBorder}`,
            color: copper, borderRadius: 5, padding: '2px 10px',
            fontSize: 10, letterSpacing: 0.6, fontWeight: 500,
          }}>
            landing-page-cro
          </span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '22px 22px 18px' }}>
        {/* Baseline row — always visible */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginBottom: 20, paddingBottom: 16,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <span style={{ color: termMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>Baseline CVR</span>
          <span style={{ color: termText }}>3.46%</span>
        </div>

        {/* Phase content — fixed height container */}
        <div style={{ minHeight: 188 }}>

          {/* 0: idle */}
          {phase === 0 && (
            <div style={{ color: termMuted, animation: 'fadein 0.25s ease' }}>
              Initialising
              <span style={{ animation: 'blink 1s step-end infinite' }}>_</span>
            </div>
          )}

          {/* 1: thinking */}
          {phase === 1 && (
            <div style={{ animation: 'fadein 0.25s ease' }}>
              <div style={{ color: termMuted, marginBottom: 14, fontSize: 11 }}>Generating hypothesis...</div>
              <div style={{ display: 'flex', gap: 5 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%', background: copper,
                    animation: `bounce-dot 1.2s ease-in-out ${i * 0.18}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* 2+: hypothesis */}
          {phase >= 2 && (
            <div style={{ animation: 'fadein 0.25s ease', marginBottom: 16 }}>
              <div style={{ color: termMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                Hypothesis
              </div>
              <div style={{ color: termText, lineHeight: 1.55, fontSize: 13 }}>
                {phase === 2 ? typed : exp.hypothesis}
                {phase === 2 && (
                  <span style={{ animation: 'blink 0.75s step-end infinite' }}>_</span>
                )}
              </div>
            </div>
          )}

          {/* 3+: PostHog payload */}
          {phase >= 3 && (
            <div style={{ animation: 'fadein 0.3s ease', marginBottom: 16 }}>
              <div style={{ color: termMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                PostHog flag payload
              </div>
              <div style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8, padding: '10px 14px',
                fontSize: 11, lineHeight: 1.7,
              }}>
                <span style={{ color: 'rgba(196,122,42,0.85)' }}>{'{ '}</span>
                <span style={{ color: 'rgba(147,197,253,0.8)' }}>"variant"</span>
                <span style={{ color: termMuted }}>: </span>
                <span style={{ color: 'rgba(134,239,172,0.85)' }}>"{exp.mutation}"</span>
                <span style={{ color: 'rgba(196,122,42,0.85)' }}>{' }'}</span>
              </div>
              {phase === 3 && (
                <div style={{ color: termMuted, marginTop: 10, fontSize: 11 }}>
                  Deploying to PostHog A/B split...
                </div>
              )}
            </div>
          )}

          {/* 4: measuring */}
          {phase === 4 && (
            <div style={{ animation: 'fadein 0.25s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: termMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
                  Measuring
                </span>
                <span style={{ color: termText }}>
                  {sessions.toLocaleString()} sessions
                </span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', background: copper, borderRadius: 2,
                  animation: 'fill-bar 1.9s cubic-bezier(0.25,0.1,0.25,1) forwards',
                }} />
              </div>
            </div>
          )}

          {/* 5+: result */}
          {phase >= 5 && (
            <div style={{ animation: 'fadein 0.35s ease' }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
                padding: '14px 0 10px',
                borderTop: '1px solid rgba(255,255,255,0.07)',
              }}>
                <div>
                  <div style={{ color: termMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Measured CVR
                  </div>
                  <div style={{ fontSize: 32, fontWeight: 700, color: white, fontVariantNumeric: 'tabular-nums' }}>
                    {measuredCvr.toFixed(2)}%
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: termMuted, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    Lift
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: green }}>
                    {exp.diff}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 6: kept */}
          {phase === 6 && (
            <div style={{
              animation: 'fadein 0.25s ease',
              display: 'flex', alignItems: 'center', gap: 8,
              marginTop: 10, padding: '9px 14px',
              background: greenDim,
              border: '1px solid rgba(16,185,129,0.22)',
              borderRadius: 8,
            }}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M2 6.5l2.5 2.5 5.5-5.5" stroke={green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span style={{ color: green, fontSize: 11, fontWeight: 500 }}>
                Winner kept · Cycle {cycle + 1} complete
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        padding: '10px 22px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.015)',
      }}>
        <span style={{ color: termMuted, fontSize: 10 }}>forge · simulation mode</span>
        <span style={{ color: termMuted, fontSize: 10 }}>cycle {cycle + 1} of ∞</span>
      </div>
    </div>
  );
}

// ── Template Card ──────────────────────────────────────────────
function TemplateCard({
  name, desc, baseline, range,
}: {
  name: string; desc: string; baseline: string; range: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: white,
        border: `1px solid ${hovered ? copperBorder : inkFaint}`,
        borderRadius: 14,
        padding: '24px 24px',
        cursor: 'default',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        boxShadow: hovered ? `0 8px 28px rgba(196,122,42,0.1)` : 'none',
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: ink, marginBottom: 4 }}>{name}</div>
        <div style={{ fontSize: 12, color: inkMuted, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 11, color: inkMuted, marginBottom: 2 }}>baseline</div>
          <div style={{ fontFamily: mono, fontSize: 18, fontWeight: 700, color: copper }}>{baseline}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: inkMuted, marginBottom: 2 }}>range</div>
          <div style={{ fontFamily: mono, fontSize: 12, color: ink }}>{range}</div>
        </div>
      </div>
    </div>
  );
}

// ── Growth Demo ────────────────────────────────────────────────
const VARIANTS = [
  { headline: 'Save time and money',             cvr: 3.46 },
  { headline: 'Stop wasting hours every week',   cvr: 3.71 },
  { headline: 'Ship experiments 10x faster',     cvr: 3.89 },
  { headline: 'Your competitors test this daily', cvr: 4.04 },
  { headline: 'Want to 10x your CVR tonight?',   cvr: 4.21 },
];

function GrowthDemo() {
  const [running, setRunning] = useState(false);
  const [iter, setIter]       = useState(0);

  useEffect(() => {
    if (!running) return;
    const iv = setInterval(() => {
      setIter(i => {
        if (i >= VARIANTS.length - 1) { setRunning(false); return i; }
        return i + 1;
      });
    }, 640);
    return () => clearInterval(iv);
  }, [running]);

  const cur = VARIANTS[iter];
  const improvement = (((cur.cvr - 3.46) / 3.46) * 100).toFixed(0);
  const done = iter === VARIANTS.length - 1 && !running;

  return (
    <div style={{
      background: white,
      border: `1px solid ${inkFaint}`,
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
      maxWidth: 560,
      margin: '0 auto',
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 28px',
        borderBottom: `1px solid ${inkFaint}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: running ? green : (done ? green : copper),
            transition: 'background 0.3s',
            boxShadow: running ? `0 0 8px ${green}60` : 'none',
          }} />
          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: ink }}>
            landing-page-cro
          </span>
        </div>
        <button
          onClick={() => { setRunning(true); setIter(0); }}
          disabled={running}
          style={{
            fontFamily: font, fontSize: 13, fontWeight: 600,
            background: running ? 'transparent' : ink,
            color: running ? inkMuted : white,
            border: running ? `1px solid ${inkFaint}` : 'none',
            padding: '9px 20px', borderRadius: 8,
            cursor: running ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {running ? 'Testing...' : done ? 'Run again' : 'Test variants'}
        </button>
      </div>

      {/* Headline */}
      <div style={{ padding: '28px 28px 20px', background: cream }}>
        <div style={{
          fontFamily: mono, fontSize: 10, fontWeight: 500,
          color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5,
          marginBottom: 12,
        }}>
          Current headline variant
        </div>
        <div style={{
          fontFamily: serif, fontSize: 26, color: ink,
          lineHeight: 1.2, minHeight: 62,
          transition: 'all 0.25s ease',
        }}>
          {cur.headline}
        </div>
      </div>

      {/* Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: '20px 28px', gap: 24 }}>
        <div>
          <div style={{
            fontFamily: mono, fontSize: 10, fontWeight: 500,
            color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
          }}>
            Conversion Rate
          </div>
          <div style={{ fontFamily: mono, fontSize: 34, fontWeight: 700, color: ink }}>
            {cur.cvr.toFixed(2)}%
          </div>
        </div>
        <div>
          <div style={{
            fontFamily: mono, fontSize: 10, fontWeight: 500,
            color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8,
          }}>
            Improvement
          </div>
          <div style={{
            fontFamily: mono, fontSize: 34, fontWeight: 700,
            color: iter > 0 ? green : inkMuted,
            transition: 'color 0.3s',
          }}>
            {iter > 0 ? `+${improvement}%` : '—'}
          </div>
        </div>
      </div>

      {/* Progress dots */}
      <div style={{ display: 'flex', gap: 6, padding: '0 28px 24px' }}>
        {VARIANTS.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= iter ? copper : inkFaint,
              transition: 'background 0.25s ease',
            }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────
export default function Landing() {
  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: font, color: ink }}>

      {/* ── Navbar ── */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'rgba(250,248,245,0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderBottom: `1px solid ${inkFaint}`,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto', padding: '0 28px',
          height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <ForgeLogo size={26} />
          </Link>
          <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <Link to="/demo" style={{
              fontFamily: font, fontSize: 14, fontWeight: 500,
              color: inkMuted, textDecoration: 'none', padding: '8px 16px',
            }}>
              Demo
            </Link>
            <Link to="/login" style={{
              fontFamily: font, fontSize: 14, fontWeight: 500,
              color: inkMuted, textDecoration: 'none', padding: '8px 16px',
            }}>
              Sign in
            </Link>
            <Link to="/login" style={{
              fontFamily: font, fontSize: 14, fontWeight: 600,
              background: ink, color: white,
              padding: '9px 22px', borderRadius: 8, textDecoration: 'none',
              marginLeft: 4,
            }}>
              Get started
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ── */}
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '96px 28px 120px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr',
          gap: 72, alignItems: 'center',
        }}>
          {/* Left */}
          <div>
            {/* Label chip */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: copperDim, border: `1px solid ${copperBorder}`,
              borderRadius: 100, padding: '5px 14px',
              fontFamily: mono, fontSize: 10, fontWeight: 500,
              color: copper, letterSpacing: 0.8, textTransform: 'uppercase',
              marginBottom: 28,
            }}>
              <div style={{ width: 5, height: 5, borderRadius: '50%', background: copper }} />
              PostHog-powered · AI agents · Real traffic
            </div>

            <h1 style={{
              fontFamily: serif,
              fontSize: 56,
              fontWeight: 400,
              lineHeight: 1.06,
              letterSpacing: -1,
              color: ink,
              marginBottom: 22,
            }}>
              Autonomous A/B testing.<br />
              <em style={{ fontStyle: 'italic', color: copper }}>Real users.</em> Real lift.
            </h1>

            <p style={{
              fontSize: 16, lineHeight: 1.7, color: inkMuted,
              marginBottom: 36, maxWidth: 440,
            }}>
              Connect PostHog. Forge agents run experiments on your live product — deploying variants as feature flags, measuring CVR on real users, keeping what wins.
            </p>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <Link to="/login" style={{
                fontFamily: font, fontSize: 15, fontWeight: 600,
                background: copper, color: white,
                padding: '14px 32px', borderRadius: 10,
                textDecoration: 'none',
                boxShadow: '0 4px 22px rgba(196,122,42,0.32)',
                transition: 'box-shadow 0.2s',
              }}>
                Start experimenting
              </Link>
              <Link to="/demo" style={{
                fontFamily: font, fontSize: 15, fontWeight: 500,
                color: ink, textDecoration: 'none',
                display: 'flex', alignItems: 'center', gap: 7,
                borderBottom: `1px solid ${inkFaint}`, paddingBottom: 1,
              }}>
                See it live
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M3 7h8M8 4l3 3-3 3" stroke={ink} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            </div>

            <div style={{ fontFamily: mono, fontSize: 11, color: inkMuted }}>
              Free to start · ~$0.0001 per experiment
            </div>
          </div>

          {/* Right: terminal */}
          <div>
            <AgentTerminal />
          </div>
        </div>
      </section>

      {/* ── Stats Belt ── */}
      <div style={{ background: dark, padding: '52px 28px' }}>
        <div style={{
          maxWidth: 720, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        }}>
          {[
            { value: '5',        label: 'templates ready' },
            { value: '$0.0001',  label: 'per experiment' },
            { value: 'Real CVR', label: 'measured by PostHog' },
          ].map((s, i) => (
            <div key={i} style={{
              textAlign: 'center', padding: '0 28px',
              borderRight: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none',
            }}>
              <div style={{ fontFamily: serif, fontSize: 38, fontWeight: 400, color: copper, marginBottom: 8 }}>
                {s.value}
              </div>
              <div style={{
                fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)',
                textTransform: 'uppercase', letterSpacing: 1.5,
              }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── How It Works ── */}
      <section style={{ padding: '100px 28px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <h2 style={{ fontFamily: serif, fontSize: 44, fontWeight: 400, color: ink, marginBottom: 12 }}>
              The loop. On repeat.
            </h2>
            <p style={{ fontSize: 16, color: inkMuted, maxWidth: 420, margin: '0 auto' }}>
              Forge runs your experimentation engine automatically, around the clock.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20, position: 'relative' }}>
            {/* Connector line */}
            <div style={{
              position: 'absolute', top: 42, left: '20%', right: '20%', height: 1,
              background: `linear-gradient(to right, transparent, ${inkFaint} 25%, ${inkFaint} 75%, transparent)`,
              zIndex: 0,
            }} />

            {[
              {
                num: '01', title: 'Connect PostHog',
                desc: 'Add your API key. Forge reads your conversion events and builds a baseline metric for each template.',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="4" cy="9" r="2.5" stroke={copper} strokeWidth="1.4" />
                    <circle cx="14" cy="9" r="2.5" stroke={copper} strokeWidth="1.4" />
                    <path d="M6.5 9h5" stroke={copper} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1.5 2" />
                  </svg>
                ),
              },
              {
                num: '02', title: 'Agents propose + deploy',
                desc: 'AI agents generate hypotheses and deploy variants as PostHog feature flags — real 50/50 traffic split.',
                icon: <DiamondMark size={18} outerColor={ink} innerColor={copper} />,
              },
              {
                num: '03', title: 'Winners kept automatically',
                desc: 'After the window, Forge compares CVR. Better variants ship. Worse ones revert. You get the morning report.',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M3 9.5l3.5 3.5 8-8" stroke={green} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
              },
            ].map((step, i) => (
              <div key={i} style={{
                background: white, border: `1px solid ${inkFaint}`,
                borderRadius: 16, padding: '28px 24px',
                position: 'relative', zIndex: 1,
              }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 12,
                  background: cream, border: `1px solid ${inkFaint}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginBottom: 20,
                }}>
                  {step.icon}
                </div>
                <div style={{
                  fontFamily: mono, fontSize: 10, color: copper,
                  fontWeight: 600, letterSpacing: 0.5, marginBottom: 8,
                }}>
                  {step.num}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, color: ink, marginBottom: 10 }}>{step.title}</h3>
                <p style={{ fontSize: 13, color: inkMuted, lineHeight: 1.65 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Templates ── */}
      <section style={{ padding: '0 28px 100px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontFamily: serif, fontSize: 44, fontWeight: 400, color: ink, marginBottom: 12 }}>
              Five surfaces. One loop.
            </h2>
            <p style={{ fontSize: 16, color: inkMuted }}>
              Every template ships with a deterministic evaluator and PostHog flag payload.
            </p>
          </div>

          {/* Top row: 3 cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
            <TemplateCard name="Landing Page CRO"     desc="Headline, CTA copy, value props"      baseline="3.46%"  range="1–5% CVR" />
            <TemplateCard name="Page Structure"        desc="Section order, hero placement"        baseline="3.72%"  range="via feature flags" />
            <TemplateCard name="Onboarding Flow"       desc="Step count, field friction"           baseline="57.3%" range="30–65% completion" />
          </div>
          {/* Bottom row: 2 cards centred */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, maxWidth: 648, margin: '0 auto' }}>
            <TemplateCard name="Pricing Page"          desc="Plan framing, CTA copy"               baseline="4.30%"  range="1.5–5% upgrade rate" />
            <TemplateCard name="Feature Announcement"  desc="Banner position, badge style"         baseline="19.0%" range="8–28% adoption" />
          </div>
        </div>
      </section>

      {/* ── Live Demo ── */}
      <section style={{ padding: '0 28px 112px' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <h2 style={{ fontFamily: serif, fontSize: 44, fontWeight: 400, color: ink, marginBottom: 12 }}>
              See it run.
            </h2>
            <p style={{ fontSize: 16, color: inkMuted }}>
              Hit the button. Watch CVR move. This is what your agents do while you sleep.
            </p>
          </div>
          <GrowthDemo />
        </div>
      </section>

      {/* ── CTA ── */}
      <section style={{
        background: dark, padding: '108px 28px',
        textAlign: 'center', position: 'relative', overflow: 'hidden',
      }}>
        {/* Ambient glow */}
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%,-50%)',
          width: 560, height: 320,
          background: `radial-gradient(ellipse, rgba(196,122,42,0.14) 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', zIndex: 1 }}>
          {/* Large logo mark */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36 }}>
            <DiamondMark size={60} outerColor="rgba(255,255,255,0.9)" innerColor={copper} />
          </div>

          <h2 style={{
            fontFamily: serif, fontSize: 52, fontWeight: 400,
            color: white, marginBottom: 14,
          }}>
            Start optimizing tonight.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', marginBottom: 44 }}>
            Set up in minutes. Agents run while you sleep.
          </p>
          <Link to="/login" style={{
            display: 'inline-block',
            fontFamily: font, fontSize: 15, fontWeight: 600,
            background: white, color: ink,
            padding: '15px 48px', borderRadius: 10,
            textDecoration: 'none',
          }}>
            Get started free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        padding: '18px 28px',
        background: cream,
        borderTop: `1px solid ${inkFaint}`,
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <Link to="/" style={{ textDecoration: 'none' }}>
            <ForgeLogo size={22} />
          </Link>
          <span style={{ fontFamily: mono, fontSize: 11, color: inkMuted }}>
            Autonomous variant optimization
          </span>
          <Link to="/login" style={{ fontSize: 13, color: inkMuted, textDecoration: 'none' }}>
            Sign in
          </Link>
        </div>
      </footer>

      <style>{`
        @keyframes pulse-green {
          0%, 100% { opacity: 1;   box-shadow: 0 0 7px rgba(16,185,129,0.55); }
          50%       { opacity: 0.5; box-shadow: 0 0 14px rgba(16,185,129,0.85); }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes bounce-dot {
          0%, 100% { opacity: 0.3; transform: translateY(0px); }
          50%       { opacity: 1;   transform: translateY(-4px); }
        }
        @keyframes fadein {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fill-bar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
