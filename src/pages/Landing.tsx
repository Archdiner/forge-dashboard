import { Link } from 'react-router-dom';
import { useState, useEffect } from 'react';

const font = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono = `'JetBrains Mono', monospace`;
const serif = `'Instrument Serif', Georgia, serif`;

const copper = '#C47A2A';
const copperLight = '#D4953D';
const ink = '#1A1614';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const inkLight = 'rgba(26, 22, 20, 0.25)';
const cream = '#FAF8F5';

// ============================================================
// DEMO: Portfolio Optimization
// ============================================================
function PortfolioDemo() {
    const [running, setRunning] = useState(false);
    const [iter, setIter] = useState(0);
    const [sharpe, setSharpe] = useState(1.12);
    const [weights, setWeights] = useState({ US: 40, EU: 30, EM: 20, Bonds: 10 });
    
    useEffect(() => {
        if (!running) return;
        const interval = setInterval(() => {
            setIter(i => {
                if (i >= 12) { setRunning(false); return i; }
                setSharpe(s => +(s + (Math.random() * 0.04 + 0.02)).toFixed(2));
                setWeights({
                    US: Math.max(15, +(40 + (Math.random() - 0.5) * 10).toFixed(1)),
                    EU: Math.max(15, +(30 + (Math.random() - 0.5) * 8).toFixed(1)),
                    EM: Math.max(10, +(20 + (Math.random() - 0.5) * 6).toFixed(1)),
                    Bonds: Math.max(5, +(10 + (Math.random() - 0.5) * 3).toFixed(1)),
                });
                return i + 1;
            });
        }, 100);
        return () => clearInterval(interval);
    }, [running]);

    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    const normalized = Object.fromEntries(Object.entries(weights).map(([k, v]) => [k, v / total * 100]));

    return (
        <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 24, padding: 32, boxShadow: '0 30px 70px -20px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: ink }}>Portfolio Optimizer</span>
                </div>
                <button 
                    onClick={() => { setRunning(true); setIter(0); setSharpe(1.12); }}
                    disabled={running}
                    style={{
                        padding: '10px 20px',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: font,
                        background: running ? copper : 'transparent',
                        color: running ? '#FFF' : copper,
                        border: `1.5px solid ${copper}`,
                        borderRadius: 8,
                        cursor: running ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    {running ? 'Optimizing...' : 'Run Optimization'}
                </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
                <div style={{ background: cream, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Sharpe Ratio</div>
                    <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: '#10B981' }}>{sharpe.toFixed(2)}</div>
                </div>
                <div style={{ background: cream, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Variants Tested</div>
                    <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: ink }}>{iter * 83}</div>
                </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {Object.entries(normalized).map(([asset, pct]) => (
                    <div key={asset} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontSize: 13, color: inkMuted, width: 50, fontWeight: 500 }}>{asset}</span>
                        <div style={{ flex: 1, height: 8, background: cream, borderRadius: 4, overflow: 'hidden' }}>
                            <div 
                                style={{
                                    height: '100%',
                                    width: `${pct}%`,
                                    background: `linear-gradient(to right, ${copper}, ${copperLight})`,
                                    borderRadius: 4,
                                    transition: 'width 0.3s ease',
                                }}
                            ></div>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: mono, width: 42, textAlign: 'right' }}>{pct.toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================
// DEMO: Landing Page / Growth
// ============================================================
function GrowthDemo() {
    const [running, setRunning] = useState(false);
    const [iter, setIter] = useState(0);
    const [headline, setHeadline] = useState("Save time and money");
    const [conversion, setConversion] = useState(3.2);
    
    const headlines = [
        { text: "Save time and money", conv: 3.2 },
        { text: "Stop wasting hours every week", conv: 3.8 },
        { text: "Save 10x more starting today", conv: 4.4 },
        { text: "Work smarter, not harder", conv: 5.1 },
        { text: "Ship 10x faster tonight", conv: 5.8 },
    ];

    useEffect(() => {
        if (!running) return;
        const interval = setInterval(() => {
            setIter(i => {
                if (i >= 4) { setRunning(false); return i; }
                setHeadline(headlines[i + 1].text);
                setConversion(headlines[i + 1].conv);
                return i + 1;
            });
        }, 500);
        return () => clearInterval(interval);
    }, [running]);

    const improvement = ((conversion - 3.2) / 3.2 * 100).toFixed(0);

    return (
        <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 24, padding: 32, boxShadow: '0 30px 70px -20px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#8B5CF6', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: ink }}>Landing Page CRO</span>
                </div>
                <button 
                    onClick={() => { setRunning(true); setIter(0); setHeadline("Save time and money"); setConversion(3.2); }}
                    disabled={running}
                    style={{
                        padding: '10px 20px',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: font,
                        background: running ? '#8B5CF6' : 'transparent',
                        color: running ? '#FFF' : '#8B5CF6',
                        border: `1.5px solid #8B5CF6`,
                        borderRadius: 8,
                        cursor: running ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    {running ? 'Testing...' : 'Test Variants'}
                </button>
            </div>

            <div style={{ background: cream, borderRadius: 12, padding: 24, marginBottom: 20, border: '1px solid rgba(26,22,20,0.05)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Headline</div>
                <div style={{ fontSize: 24, fontWeight: 700, color: ink }}>{headline}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div style={{ background: cream, borderRadius: 12, padding: 20 }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Conversion</div>
                    <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: ink }}>{conversion.toFixed(1)}%</div>
                </div>
                <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 12, padding: 20, border: '1px solid rgba(16,185,129,0.2)' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#10B981', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Improvement</div>
                    <div style={{ fontSize: 36, fontWeight: 700, fontFamily: mono, color: '#10B981' }}>+{improvement}%</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6, marginTop: 20 }}>
                {headlines.map((_, i) => (
                    <div 
                        key={i} 
                        style={{
                            flex: 1,
                            height: 6,
                            borderRadius: 3,
                            background: i <= iter ? '#8B5CF6' : 'rgba(26,22,20,0.08)',
                            transition: 'background 0.3s ease',
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

// ============================================================
// DEMO: Email
// ============================================================
function EmailDemo() {
    const [running, setRunning] = useState(false);
    const [iter, setIter] = useState(0);
    const [subject, setSubject] = useState("Quick question for you");
    const [score, setScore] = useState(62);

    const subjects = [
        { text: "Quick question for you", score: 62 },
        { text: "Can I help you with something?", score: 71 },
        { text: "{{first_name}}, have you seen this?", score: 79 },
        { text: "{{first_name}}, one idea for you", score: 86 },
        { text: "{{first_name}}, your competitors are doing this", score: 92 },
    ];

    useEffect(() => {
        if (!running) return;
        const interval = setInterval(() => {
            setIter(i => {
                if (i >= 4) { setRunning(false); return i; }
                setSubject(subjects[i + 1].text);
                setScore(subjects[i + 1].score);
                return i + 1;
            });
        }, 450);
        return () => clearInterval(interval);
    }, [running]);

    return (
        <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 24, padding: 32, boxShadow: '0 30px 70px -20px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#8B5CF6', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: ink }}>Email Outreach</span>
                </div>
                <button 
                    onClick={() => { setRunning(true); setIter(0); setSubject("Quick question for you"); setScore(62); }}
                    disabled={running}
                    style={{
                        padding: '10px 20px',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: font,
                        background: running ? '#8B5CF6' : 'transparent',
                        color: running ? '#FFF' : '#8B5CF6',
                        border: `1.5px solid #8B5CF6`,
                        borderRadius: 8,
                        cursor: running ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    {running ? 'Optimizing...' : 'Optimize'}
                </button>
            </div>

            <div style={{ background: cream, borderRadius: 12, padding: 20, marginBottom: 20, border: '1px solid rgba(26,22,20,0.05)' }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>Subject Line</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: ink }}>{subject}</div>
            </div>

            <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    <span>Engagement</span>
                    <span style={{ fontFamily: mono }}>{score}</span>
                </div>
                <div style={{ height: 10, background: cream, borderRadius: 5, overflow: 'hidden' }}>
                    <div 
                        style={{
                            height: '100%',
                            width: `${score}%`,
                            background: '#8B5CF6',
                            borderRadius: 5,
                            transition: 'width 0.3s ease',
                        }}
                    ></div>
                </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {[
                    { label: 'Spam', value: Math.max(5, 15 - iter * 2) },
                    { label: 'Brevity', value: 50 + iter * 10 },
                    { label: 'Personal', value: subject.includes('{{') ? 92 : 12 },
                ].map((stat, i) => (
                    <div key={i} style={{ background: cream, borderRadius: 8, padding: 14, textAlign: 'center' }}>
                        <div style={{ fontSize: 10, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', marginBottom: 4 }}>{stat.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#10B981', fontFamily: mono }}>{stat.value}%</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================
// DEMO: AI Prompts
// ============================================================
function PromptDemo() {
    const [running, setRunning] = useState(false);
    const [iter, setIter] = useState(0);
    const [accuracy, setAccuracy] = useState(67);
    const [prompt, setPrompt] = useState("Classify this email");

    const prompts = [
        { text: "Classify this email", acc: 67 },
        { text: "Classify this email as spam or not", acc: 74 },
        { text: "Given an email, classify as spam or not based on content, sender, subject", acc: 82 },
        { text: "You are an email classifier. Analyze sender, subject, body. Classify as 'spam' or 'not_spam'. Be strict.", acc: 91 },
    ];

    useEffect(() => {
        if (!running) return;
        const interval = setInterval(() => {
            setIter(i => {
                if (i >= 3) { setRunning(false); return i; }
                setPrompt(prompts[i + 1].text);
                setAccuracy(prompts[i + 1].acc);
                return i + 1;
            });
        }, 600);
        return () => clearInterval(interval);
    }, [running]);

    return (
        <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 24, padding: 32, boxShadow: '0 30px 70px -20px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981', animation: 'pulse 1.5s ease-in-out infinite' }}></div>
                    <span style={{ fontSize: 15, fontWeight: 600, color: ink }}>Prompt Engineering</span>
                </div>
                <button 
                    onClick={() => { setRunning(true); setIter(0); setPrompt("Classify this email"); setAccuracy(67); }}
                    disabled={running}
                    style={{
                        padding: '10px 20px',
                        fontSize: 13,
                        fontWeight: 600,
                        fontFamily: font,
                        background: running ? '#10B981' : 'transparent',
                        color: running ? '#FFF' : '#10B981',
                        border: `1.5px solid #10B981`,
                        borderRadius: 8,
                        cursor: running ? 'not-allowed' : 'pointer',
                        transition: 'all 0.2s',
                    }}
                >
                    {running ? 'Tuning...' : 'Tune Prompt'}
                </button>
            </div>

            <div style={{ background: ink, borderRadius: 12, padding: 20, marginBottom: 24 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10 }}>System Prompt</div>
                <div style={{ fontSize: 14, fontFamily: mono, color: '#10B981', lineHeight: 1.7 }}>{prompt}</div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
                <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Accuracy</div>
                    <div style={{ fontSize: 40, fontWeight: 700, fontFamily: mono, color: '#10B981' }}>{accuracy}%</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8 }}>Consistency</div>
                    <div style={{ fontSize: 40, fontWeight: 700, fontFamily: mono, color: ink }}>{Math.min(99, 72 + iter * 7)}%</div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 6 }}>
                {prompts.map((_, i) => (
                    <div 
                        key={i} 
                        style={{
                            flex: 1,
                            height: 6,
                            borderRadius: 3,
                            background: i <= iter ? '#10B981' : 'rgba(26,22,20,0.08)',
                            transition: 'background 0.3s ease',
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

// ============================================================
// MARQUEE COMPONENT (CSS only animation)
// ============================================================
function Marquee() {
    const items = [
        'Copy & Content',
        'Financial Models',
        'Spreadsheets',
        'Email Sequences',
        'AI Prompts',
        'Documents',
        'Code',
        'URLs',
    ];
    
    return (
        <div style={{ 
            overflow: 'hidden', 
            background: 'rgba(255,255,255,0.4)', 
            padding: '24px 0',
            maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
        }}>
            <div style={{ 
                display: 'flex', 
                gap: '2rem',
                animation: 'marquee-scroll 20s linear infinite',
                width: 'fit-content',
            }}>
                {[...items, ...items, ...items].map((item, i) => (
                    <div 
                        key={i}
                        style={{
                            background: '#FFF',
                            height: 56,
                            padding: '0 32px',
                            borderRadius: 28,
                            border: '1px solid rgba(26,22,20,0.1)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            whiteSpace: 'nowrap',
                            fontSize: 14,
                            fontWeight: 500,
                            color: ink,
                            boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                            cursor: 'default',
                            transition: 'border-color 0.2s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.borderColor = `${copper}50`}
                        onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(26,22,20,0.1)'}
                    >
                        <span style={{ color: copper, fontSize: 16 }}>+</span> {item}
                    </div>
                ))}
            </div>
        </div>
    );
}

// ============================================================
// MAIN LANDING PAGE
// ============================================================

export default function Landing() {
    const [activeTab, setActiveTab] = useState(0);
    
    const tabs = [
        { id: 'portfolio', label: 'Financials', component: <PortfolioDemo /> },
        { id: 'growth', label: 'Growth', component: <GrowthDemo /> },
        { id: 'email', label: 'Email', component: <EmailDemo /> },
        { id: 'prompt', label: 'AI Prompts', component: <PromptDemo /> },
    ];

    return (
        <div style={{ minHeight: '100vh', background: cream, fontFamily: font, color: ink }}>
            {/* Dot Pattern Background */}
            <div 
                style={{ 
                    position: 'fixed', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundImage: 'radial-gradient(circle, rgba(26,22,20,0.08) 1px, transparent 1px)',
                    backgroundSize: '24px 24px',
                    pointerEvents: 'none',
                    zIndex: 0,
                }}
            />
            
            {/* Ambient Glow */}
            <div style={{ position: 'fixed', top: -200, right: -100, width: 600, height: 600, background: 'radial-gradient(circle, rgba(196,122,42,0.06) 0%, transparent 70%)', pointerEvents: 'none', zIndex: 0 }}></div>

            {/* Header */}
            <header style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 24px 0', position: 'relative', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* Diamond Logo */}
                    <div style={{ 
                        width: 28, 
                        height: 28, 
                        background: ink, 
                        borderRadius: 4,
                        transform: 'rotate(45deg)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    }}>
                        <div style={{ 
                            width: 10, 
                            height: 10, 
                            background: copper, 
                            borderRadius: 2,
                            boxShadow: '0 0 8px rgba(196,122,42,0.5)',
                            transform: 'rotate(-45deg)',
                        }}></div>
                    </div>
                    <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: ink, letterSpacing: -0.5 }}>forge</span>
                </Link>
                <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
                    <Link to="/login" style={{ fontSize: 14, fontWeight: 500, color: inkMuted, textDecoration: 'none' }}>Sign in</Link>
                    <Link to="/login" style={{ fontSize: 14, fontWeight: 600, background: ink, color: '#FFF', padding: '10px 20px', borderRadius: 8, textDecoration: 'none' }}>
                        Get started
                    </Link>
                </nav>
            </header>

            {/* Hero Section */}
            <section style={{ maxWidth: 1100, margin: '0 auto', padding: '80px 24px 120px', position: 'relative', zIndex: 10 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60, alignItems: 'center' }}>
                    {/* Left: Typography */}
                    <div>
                        <h1 style={{ fontFamily: serif, fontSize: 56, fontWeight: 400, lineHeight: 1.05, letterSpacing: -1, marginBottom: 24 }}>
                            Automate optimization.<br/>
                            Find the <em style={{ fontStyle: 'italic', color: copper }}>best version</em> of anything.
                        </h1>
                        <p style={{ fontSize: 18, fontWeight: 400, color: inkMuted, lineHeight: 1.6, marginBottom: 32, maxWidth: 480 }}>
                            FORGE evaluates thousands of variants against computed metrics instantly. 
                            No waiting for A/B test traffic. Just optimization at machine speed — runs overnight while you sleep.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                            <Link
                                to="/login"
                                style={{
                                    display: 'inline-block',
                                    padding: '16px 36px',
                                    fontSize: 16,
                                    fontWeight: 600,
                                    fontFamily: font,
                                    background: copper,
                                    color: '#FFF',
                                    border: 'none',
                                    borderRadius: 10,
                                    textDecoration: 'none',
                                    boxShadow: '0 8px 24px rgba(196,122,42,0.3)',
                                }}
                            >
                                Start optimizing
                            </Link>
                            <span style={{ fontSize: 14, color: inkMuted }}>
                                No credit card required
                            </span>
                        </div>
                    </div>

                    {/* Right: Abstract Visual */}
                    <div style={{ position: 'relative', height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle, ${copper}08 0%, transparent 70%)`, borderRadius: '50%', filter: 'blur(60px)' }}></div>
                        
                        {/* Grid Cells */}
                        <div style={{ 
                            display: 'grid', 
                            gridTemplateColumns: 'repeat(6, 1fr)', 
                            gap: 12, 
                            width: '100%', 
                            maxWidth: 320,
                            opacity: 0.15,
                        }}>
                            {Array.from({ length: 36 }).map((_, i) => (
                                <div 
                                    key={i}
                                    style={{
                                        aspectRatio: '1',
                                        background: i === 17 || i === 22 ? copper : '#E5E7EB',
                                        borderRadius: 4,
                                        animation: `cell-blink 5s infinite`,
                                        animationDelay: `${Math.random() * 8}s`,
                                    }}
                                />
                            ))}
                        </div>

                        {/* Center Target */}
                        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                            <div style={{ 
                                width: 120, 
                                height: 120, 
                                background: ink, 
                                borderRadius: 24, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
                                position: 'relative',
                            }}>
                                <div style={{ 
                                    position: 'absolute', 
                                    width: 160, 
                                    height: 160, 
                                    background: copper, 
                                    borderRadius: '50%', 
                                    opacity: 0.1,
                                    animation: 'pulse 4s ease-in-out infinite',
                                }}></div>
                                <span style={{ fontFamily: serif, fontSize: 36, color: copper }}>f</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Stats Bar */}
            <section style={{ background: '#161514', padding: '48px 24px' }}>
                <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, textAlign: 'center' }}>
                    <div>
                        <div style={{ fontFamily: serif, fontSize: 48, fontWeight: 700, color: copper, marginBottom: 4 }}>81%</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>average lift</div>
                    </div>
                    <div>
                        <div style={{ fontFamily: serif, fontSize: 48, fontWeight: 700, color: '#FFF', marginBottom: 4 }}>1,000+</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>variants per project</div>
                    </div>
                    <div>
                        <div style={{ fontFamily: serif, fontSize: 48, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>15 min</div>
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>to first results</div>
                    </div>
                </div>
            </section>

            {/* Demo Section */}
            <section style={{ padding: '80px 24px', position: 'relative' }}>
                <div style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    height: 200, 
                    background: 'linear-gradient(to bottom, rgba(250,249,246,1), transparent)',
                    pointerEvents: 'none',
                }}></div>
                
                <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 10 }}>
                    <div style={{ textAlign: 'center', marginBottom: 40 }}>
                        <h2 style={{ fontFamily: serif, fontSize: 40, fontWeight: 400, marginBottom: 12 }}>
                            See it in action
                        </h2>
                        <p style={{ fontSize: 16, color: inkMuted }}>
                            Run the optimizer to identify high-performing variants instantly
                        </p>
                    </div>

                    {/* Tabs */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 32 }}>
                        {tabs.map((tab, i) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(i)}
                                style={{
                                    padding: '12px 28px',
                                    fontSize: 13,
                                    fontWeight: 600,
                                    fontFamily: font,
                                    borderRadius: 24,
                                    cursor: 'pointer',
                                    border: activeTab === i ? 'none' : '1px solid rgba(26,22,20,0.1)',
                                    background: activeTab === i ? copper : 'transparent',
                                    color: activeTab === i ? '#FFF' : inkMuted,
                                    transition: 'all 0.2s',
                                    textTransform: 'uppercase',
                                    letterSpacing: 1,
                                }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content with transition */}
                    <div style={{ position: 'relative' }}>
                        {tabs.map((tab, i) => (
                            <div 
                                key={tab.id}
                                style={{
                                    transition: 'all 0.4s ease',
                                    opacity: activeTab === i ? 1 : 0,
                                    transform: activeTab === i ? 'translateY(0)' : 'translateY(12px)',
                                    position: activeTab === i ? 'relative' : 'absolute',
                                    pointerEvents: activeTab === i ? 'auto' : 'none',
                                    visibility: activeTab === i ? 'visible' : 'hidden',
                                }}
                            >
                                {tab.component}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* How It Works */}
            <section style={{ padding: '80px 24px', maxWidth: 1100, margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: 48 }}>
                    <h2 style={{ fontFamily: serif, fontSize: 40, fontWeight: 400 }}>
                        How it works
                    </h2>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32, position: 'relative' }}>
                    {/* Connecting Line */}
                    <div style={{ 
                        position: 'absolute', 
                        top: 60, 
                        left: '20%', 
                        right: '20%', 
                        height: 1, 
                        background: 'rgba(26,22,20,0.1)',
                        zIndex: 0,
                    }}></div>

                    {[
                        { num: '01', title: 'Connect Data', desc: 'Paste text or connect APIs. Define which metrics matter to you.' },
                        { num: '02', title: 'Generate Variants', desc: 'Agents generate thousands of variations with smart mutation strategies.' },
                        { num: '03', title: 'Converge', desc: 'The system identifies the global best automatically.' },
                    ].map((step, i) => (
                        <div key={i} style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
                            <div style={{ 
                                width: 64, height: 64, 
                                background: '#FFF', 
                                border: '1px solid rgba(26,22,20,0.1)',
                                borderRadius: 20, 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                margin: '0 auto 20px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
                            }}>
                                <span style={{ fontFamily: mono, fontSize: 20, fontWeight: 700, color: copper }}>{step.num}</span>
                            </div>
                            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: ink }}>{step.title}</h3>
                            <p style={{ fontSize: 14, color: inkMuted, lineHeight: 1.6, maxWidth: 240, margin: '0 auto' }}>{step.desc}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* Marquee Use Cases */}
            <Marquee />

            {/* CTA */}
            <section style={{ background: '#161514', padding: '80px 24px', textAlign: 'center', position: 'relative' }}>
                <div style={{ 
                    position: 'absolute', 
                    top: '50%', 
                    left: '50%', 
                    transform: 'translate(-50%, -50%)', 
                    width: 600, 
                    height: 400, 
                    background: `${copper}10`, 
                    borderRadius: '50%', 
                    filter: 'blur(120px)',
                    pointerEvents: 'none',
                }}></div>
                
                <div style={{ maxWidth: 500, margin: '0 auto', position: 'relative', zIndex: 10 }}>
                    <h2 style={{ fontFamily: serif, fontSize: 48, fontWeight: 400, color: '#FFF', marginBottom: 24 }}>
                        Ready to find the<br/>best version?
                    </h2>
                    <Link
                        to="/login"
                        style={{
                            display: 'inline-block',
                            padding: '16px 48px',
                            fontSize: 16,
                            fontWeight: 600,
                            fontFamily: font,
                            background: '#FFF',
                            color: ink,
                            border: 'none',
                            borderRadius: 10,
                            textDecoration: 'none',
                        }}
                    >
                        Get started free
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer style={{ padding: '24px', background: cream }}>
                <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 24, height: 24, background: ink, borderRadius: 4, transform: 'rotate(45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <div style={{ width: 8, height: 8, background: copper, borderRadius: 2 }}></div>
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Forge</span>
                    </div>
                    <div style={{ fontSize: 12, color: inkLight, textTransform: 'uppercase', letterSpacing: 1 }}>
                        2026 Forge OS — Automated Variant Optimization
                    </div>
                </div>
            </footer>

            <style>{`
                @keyframes pulse {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
                @keyframes cell-blink {
                    0%, 100% { background-color: #E5E7EB; opacity: 1; }
                    15%, 25% { background-color: #FBD38D; opacity: 0.4; }
                    40% { background-color: #E5E7EB; opacity: 1; }
                }
                @keyframes marquee-scroll {
                    from { transform: translateX(0); }
                    to { transform: translateX(-33.33%); }
                }
            `}</style>
        </div>
    );
}
