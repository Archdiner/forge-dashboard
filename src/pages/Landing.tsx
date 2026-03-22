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

// ── Forge Chart Preview ────────────────────────────────────────
// Non-monotonic: some experiments fail, net trend up — honest
const CHART_PTS = [3.46, 3.52, 3.61, 3.55, 3.74, 3.71, 3.89, 3.95, 4.01, 3.98, 4.21];

function ForgeChartPreview() {
  const [animKey, setAnimKey] = useState(0);

  // Restart the CSS draw animation every 7s
  useEffect(() => {
    const t = setInterval(() => setAnimKey(k => k + 1), 7000);
    return () => clearInterval(t);
  }, []);

  const W = 300, H = 96, PAD = 12;
  const minV = 3.2, maxV = 4.4;
  const toX = (i: number) => PAD + (i / (CHART_PTS.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => H - PAD - ((v - minV) / (maxV - minV)) * (H - PAD * 2);
  const pts = CHART_PTS.map((v, i) => ({ x: toX(i), y: toY(v) }));
  const lineStr = pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const areaStr = `M${pts[0].x},${H} ` + pts.map(p => `L${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ') + ` L${pts[pts.length-1].x},${H} Z`;

  const finalCvr  = CHART_PTS[CHART_PTS.length - 1];
  const totalLift = +(finalCvr - CHART_PTS[0]).toFixed(2);
  const totalCost = ((CHART_PTS.length - 1) * 0.0001).toFixed(4);

  return (
    <div style={{
      background: white, borderRadius: 20,
      border: `1px solid ${inkFaint}`,
      overflow: 'hidden',
      boxShadow: '0 24px 60px -10px rgba(0,0,0,0.09), 0 4px 16px rgba(0,0,0,0.05)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 20px', borderBottom: `1px solid ${inkFaint}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: copper, boxShadow: `0 0 8px ${copper}70`,
            animation: 'pulse-copper 2.5s ease-in-out infinite',
          }} />
          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: ink }}>
            Landing Page CRO
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{
            fontFamily: mono, fontSize: 10, fontWeight: 600, color: copper,
            background: copperDim, border: `1px solid ${copperBorder}`,
            borderRadius: 4, padding: '2px 8px',
          }}>
            +{totalLift}pp
          </span>
          <span style={{ fontFamily: mono, fontSize: 10, color: inkMuted }}>
            {CHART_PTS.length - 1} experiments
          </span>
        </div>
      </div>

      {/* Chart — smooth CSS draw animation, copper palette */}
      <div style={{ padding: '18px 20px 0', background: cream }}>
        <div style={{ fontFamily: mono, fontSize: 9, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
          Conversion rate %
        </div>
        <svg
          key={animKey}
          width="100%" height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block', overflow: 'visible' }}
          preserveAspectRatio="none"
        >
          {/* Subtle grid */}
          {[0.25, 0.5, 0.75].map((t, i) => (
            <line
              key={i}
              x1={PAD} y1={PAD + t * (H - PAD * 2)}
              x2={W - PAD} y2={PAD + t * (H - PAD * 2)}
              stroke="rgba(26,22,20,0.06)" strokeWidth="0.7"
            />
          ))}
          {/* Area — fades in after line is mostly drawn */}
          <path
            d={areaStr}
            fill="rgba(196,122,42,0.07)"
            style={{ opacity: 0, animation: 'fadein 0.8s ease 2.5s forwards' }}
          />
          {/* Line — smooth stroke-dashoffset draw */}
          <polyline
            points={lineStr}
            fill="none"
            stroke={copper}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength="1"
            strokeDasharray="1"
            strokeDashoffset="1"
            style={{ animation: 'draw-line 3s cubic-bezier(0.4, 0, 0.2, 1) forwards' }}
          />
          {/* Dots — staggered appearance matching line progress */}
          {pts.map((p, i) => (
            <circle
              key={`d-${animKey}-${i}`}
              cx={p.x} cy={p.y}
              r={i === pts.length - 1 ? 4 : 2.5}
              fill={copper}
              style={{
                opacity: 0,
                animation: `fadein 0.25s ease ${(i / (pts.length - 1)) * 3}s forwards`,
              }}
            />
          ))}
        </svg>

        {/* X-axis ticks */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '5px 0 14px',
        }}>
          {['base', ...Array.from({ length: CHART_PTS.length - 1 }, (_, i) => String(i + 1))].map((l, i) => (
            <span key={i} style={{ fontFamily: mono, fontSize: 8, color: inkMuted }}>{l}</span>
          ))}
        </div>
      </div>

      {/* Stats — white surface, final values */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        padding: '16px 20px 18px',
        borderTop: `1px solid ${inkFaint}`,
      }}>
        {[
          { label: 'CVR', value: `${finalCvr.toFixed(2)}%` },
          { label: 'Lift',  value: `+${totalLift}pp`,        copper: true },
          { label: 'Cost',  value: `$${totalCost}` },
        ].map(({ label, value, copper: isCopper }) => (
          <div key={label}>
            <div style={{ fontFamily: mono, fontSize: 9, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>
              {label}
            </div>
            <div style={{
              fontFamily: mono, fontSize: 21, fontWeight: 700,
              color: isCopper ? copper : ink,
              letterSpacing: '-0.02em',
            }}>
              {value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Template Card ──────────────────────────────────────────────
function TemplateCard({
  num, name, outcome, tests,
}: {
  num: string; name: string; outcome: string; tests: string;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: dark,
        border: `1px solid ${hovered ? copperBorder : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 16,
        padding: '30px 28px 26px',
        cursor: 'default',
        transition: 'border-color 0.2s, box-shadow 0.22s',
        boxShadow: hovered ? '0 16px 48px rgba(196,122,42,0.12)' : 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 230,
      }}
    >
      <div>
        {/* Number */}
        <div style={{
          fontFamily: mono, fontSize: 10, fontWeight: 600,
          color: copper, letterSpacing: 1.5, marginBottom: 18,
        }}>
          {num}
        </div>

        {/* Feature name — dominant visual */}
        <div style={{
          fontFamily: serif, fontSize: 28, fontWeight: 400,
          color: 'rgba(250,248,245,0.94)',
          lineHeight: 1.1, letterSpacing: '-0.3px',
          marginBottom: 16,
        }}>
          {name}
        </div>

        {/* Business outcome — what this means for the client */}
        <div style={{
          fontSize: 13, lineHeight: 1.65,
          color: 'rgba(255,255,255,0.46)',
        }}>
          {outcome}
        </div>
      </div>

      {/* What Forge actually tests — the mechanism */}
      <div style={{
        marginTop: 24,
        paddingTop: 16,
        borderTop: '1px solid rgba(255,255,255,0.07)',
        fontFamily: mono, fontSize: 9.5,
        color: 'rgba(255,255,255,0.22)',
        letterSpacing: 0.4,
        lineHeight: 1.6,
      }}>
        {tests}
      </div>
    </div>
  );
}

// ── Growth Demo ────────────────────────────────────────────────
const DEMO_EXP = [
  { headline: 'Save time and money',              cvr: 3.46 },
  { headline: 'Stop wasting hours every week',    cvr: 3.71 },
  { headline: 'Ship experiments 10x faster',      cvr: 3.89 },
  { headline: 'Your competitors test this daily', cvr: 4.04 },
  { headline: 'Want to 10x your CVR tonight?',    cvr: 4.21 },
];

function GrowthDemo() {
  const [count, setCount]     = useState(1);
  const [running, setRunning] = useState(false);

  const runNext = () => {
    if (running || count >= DEMO_EXP.length) return;
    setRunning(true);
    setTimeout(() => { setCount(c => c + 1); setRunning(false); }, 1100);
  };

  const best = DEMO_EXP.slice(0, count).reduce((b, e) => e.cvr > b.cvr ? e : b);
  const lift = +(best.cvr - DEMO_EXP[0].cvr).toFixed(2);
  const done = count >= DEMO_EXP.length;

  // SVG chart
  const W = 300, H = 80, PAD = 10;
  const minV = 3.2, maxV = 4.4;
  const toX = (i: number) => PAD + (i / (DEMO_EXP.length - 1)) * (W - PAD * 2);
  const toY = (v: number) => H - PAD - ((v - minV) / (maxV - minV)) * (H - PAD * 2);
  const pts = DEMO_EXP.slice(0, count).map((e, i) => ({ x: toX(i), y: toY(e.cvr) }));
  const lineStr = pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaStr = pts.length > 1
    ? `M${pts[0].x},${H} ` + pts.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1].x},${H} Z`
    : '';

  return (
    <div style={{
      background: white, border: `1px solid ${inkFaint}`,
      borderRadius: 20, overflow: 'hidden',
      maxWidth: 560, margin: '0 auto',
      boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 24px', borderBottom: `1px solid ${inkFaint}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: running ? green : (done ? green : copper),
            boxShadow: running ? `0 0 8px ${green}70` : 'none',
            transition: 'all 0.3s',
          }} />
          <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: ink }}>landing-page-cro</span>
        </div>
        <button
          onClick={done ? () => setCount(1) : runNext}
          disabled={running}
          style={{
            fontFamily: font, fontSize: 13, fontWeight: 600,
            background: running ? 'transparent' : ink,
            color: running ? inkMuted : white,
            border: running ? `1px solid ${inkFaint}` : 'none',
            padding: '8px 20px', borderRadius: 8,
            cursor: running ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s',
          }}
        >
          {running ? 'Running...' : done ? 'Reset' : `Experiment ${count}`}
        </button>
      </div>

      {/* Chart — same SVG approach as the hero card */}
      <div style={{ padding: '16px 24px 0' }}>
        <div style={{ fontFamily: mono, fontSize: 9, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          CVR over experiments
        </div>
        <svg
          width="100%" height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: 'block' }}
          preserveAspectRatio="none"
        >
          {[0.33, 0.66].map((t, i) => (
            <line key={i} x1={PAD} y1={PAD + t * (H - PAD * 2)} x2={W - PAD} y2={PAD + t * (H - PAD * 2)} stroke={inkFaint} strokeWidth="0.6" />
          ))}
          {areaStr && <path d={areaStr} fill="rgba(196,122,42,0.07)" />}
          {pts.length > 1 && (
            <polyline points={lineStr} fill="none" stroke={copper} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {pts.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === pts.length - 1 ? 4 : 2.5} fill={copper} />
          ))}
        </svg>
      </div>

      {/* Best headline */}
      <div style={{ padding: '14px 24px', background: cream, borderTop: `1px solid ${inkFaint}`, marginTop: 10 }}>
        <div style={{ fontFamily: mono, fontSize: 9, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          Best performing headline
        </div>
        <div style={{ fontFamily: serif, fontSize: 22, color: ink, lineHeight: 1.3 }}>
          {best.headline}
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', padding: '14px 24px 18px' }}>
        {[
          { label: 'Best CVR', value: `${best.cvr.toFixed(2)}%` },
          { label: 'Lift', value: count > 1 ? `+${lift}pp` : '—', isCopper: count > 1 },
          { label: 'Tested', value: `${count} / ${DEMO_EXP.length}` },
        ].map(({ label, value, isCopper }) => (
          <div key={label}>
            <div style={{ fontFamily: mono, fontSize: 9, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{label}</div>
            <div style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: isCopper ? copper : ink }}>{value}</div>
          </div>
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
              Autonomous A/B testing · Real users · Zero engineers
            </div>

            <h1 style={{
              fontFamily: serif,
              fontSize: 54,
              fontWeight: 400,
              lineHeight: 1.06,
              letterSpacing: '-0.5px',
              color: ink,
              marginBottom: 22,
            }}>
              Define your metric,<br />
              <em style={{ fontStyle: 'italic', color: copper }}>wake up to better.</em>
            </h1>

            <p style={{
              fontSize: 16, lineHeight: 1.72, color: inkMuted,
              marginBottom: 36, maxWidth: 430,
            }}>
              Tell Forge what to optimize. AI agents run A/B tests on your live product overnight — deploying variants via PostHog feature flags, measuring on real users, keeping what wins automatically.
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

          {/* Right: dashboard preview */}
          <div>
            <ForgeChartPreview />
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
            { value: '5',        label: 'revenue surfaces covered' },
            { value: '$0.0001',  label: 'per experiment run' },
            { value: '24 hrs',   label: 'from idea to result' },
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
                num: '01', title: 'Connect your product',
                desc: 'Add your PostHog key. Forge reads your real conversion events and sets a baseline — the number it will beat.',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="4" cy="9" r="2.5" stroke={copper} strokeWidth="1.4" />
                    <circle cx="14" cy="9" r="2.5" stroke={copper} strokeWidth="1.4" />
                    <path d="M6.5 9h5" stroke={copper} strokeWidth="1.4" strokeLinecap="round" strokeDasharray="1.5 2" />
                  </svg>
                ),
              },
              {
                num: '02', title: 'Agents run experiments',
                desc: 'Every night, AI agents generate variants and deploy them to real users via feature flags — no code, no spreadsheets, no meetings.',
                icon: <DiamondMark size={18} outerColor={ink} innerColor={copper} />,
              },
              {
                num: '03', title: 'You wake up to better',
                desc: 'The winning variant ships. The losing one reverts. Your metrics moved overnight — no meeting, no analyst, no delay.',
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
          <div style={{ marginBottom: 48 }}>
            <h2 style={{ fontFamily: serif, fontSize: 44, fontWeight: 400, color: ink, marginBottom: 14 }}>
              Every surface that<br />drives your revenue.
            </h2>
            <p style={{ fontSize: 16, color: inkMuted, maxWidth: 500, lineHeight: 1.7 }}>
              Forge ships five pre-built optimization engines. Connect PostHog, pick a surface, and agents start improving it tonight — no engineers, no manual analysis.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 12 }}>
            <TemplateCard
              num="01" name="Landing Page CRO"
              outcome="More anonymous visitors become signups. Forge finds the headline, CTA, and framing that converts — running experiments while you sleep."
              tests="headline copy · CTA phrasing · value propositions · social proof placement"
            />
            <TemplateCard
              num="02" name="Page Structure"
              outcome="The order your sections appear changes everything. Forge tries layouts systematically until it finds the version real users respond to."
              tests="section order · hero placement · navigation structure · above-the-fold content"
            />
            <TemplateCard
              num="03" name="Onboarding Flow"
              outcome="Most users who don't complete onboarding never come back. Forge removes friction one step at a time until completion rates climb."
              tests="step count · form fields · progress indicators · copy at each stage"
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, maxWidth: 660, margin: '0 auto' }}>
            <TemplateCard
              num="04" name="Pricing Page"
              outcome="Small framing changes move users from free to paid. Forge tests how you present plans until more people upgrade."
              tests="plan names · feature emphasis · CTA copy · pricing display format"
            />
            <TemplateCard
              num="05" name="Feature Announcement"
              outcome="Shipped features go unnoticed. Forge optimizes where, when, and how you surface new functionality until adoption actually moves."
              tests="banner position · badge design · announcement copy · timing logic"
            />
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
            Wake up to better.
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.4)', marginBottom: 44 }}>
            Set up tonight. Agents run while you sleep. You just wake up to better results.
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
        @keyframes pulse-copper {
          0%, 100% { opacity: 1;   box-shadow: 0 0 7px rgba(196,122,42,0.55); }
          50%       { opacity: 0.5; box-shadow: 0 0 14px rgba(196,122,42,0.85); }
        }
        @keyframes draw-line {
          to { stroke-dashoffset: 0; }
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
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes fill-bar {
          from { width: 0%; }
          to   { width: 100%; }
        }
      `}</style>
    </div>
  );
}
