import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

const font = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono = `'JetBrains Mono', monospace`;
const serif = `'Instrument Serif', Georgia, serif`;

const copper  = '#C47A2A';
const ink     = '#1A1614';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const cream   = '#FAF8F5';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface EvaluatorInfo {
    id: string;
    name: string;
    editable_fields: string[];
    metrics: { name: string; direction: string; weight: number }[];
    guardrails: { name: string; threshold: number; direction: string }[];
}

// What content the user actually pastes / describes per template type
const CONTENT_PLACEHOLDER: Record<string, string> = {
    'landing-page-cro':   'Paste your landing page copy here (headline, subheadline, CTA, value props)…',
    'email-outreach':     'Paste your email here (subject line, body, CTA)…',
    'portfolio-optimization': 'Paste your current allocations here, e.g.:\nUS Equities: 40%\nBonds: 30%\nInternational: 20%\nCash: 10%',
    'dcf-model':          'Paste your DCF assumptions here, e.g.:\nRevenue growth Y1: 25%\nEBITDA margin: 20%\nWACC: 12%\nExit EV/EBITDA: 15x\nEntry EV/EBITDA: 12x',
    'prompt-optimization': 'Paste your current system prompt here…',
};

// Success criteria hint per template
const SUCCESS_HINT: Record<string, string> = {
    'landing-page-cro':    'e.g., "I want a conversion score above 70 out of 100"',
    'email-outreach':      'e.g., "I want an email score above 80 out of 100"',
    'portfolio-optimization': 'e.g., "I want a Sharpe ratio above 0.8"',
    'dcf-model':           'e.g., "I want IRR above 20%"',
    'prompt-optimization': 'e.g., "I want classification accuracy above 90%"',
};

const EXAMPLE_PROBLEMS = [
    "Optimize my landing page for conversions",
    "Improve my cold email reply rate",
    "Improve my trading strategy's Sharpe ratio",
    "Optimize my AI prompt for classification",
    "Optimize my DCF model to hit 20% IRR",
    "Optimize my stock pitch financial model",
];

const AGENT_CONFIGS = [
    { count: 1, label: "Single Agent",       roles: ["explorer"],                             description: "One explorer agent. Fast, good for simple tasks." },
    { count: 2, label: "Explorer + Refiner", roles: ["explorer", "refiner"],                  description: "Broad exploration + fine-tuning of winners." },
    { count: 3, label: "Full Swarm",         roles: ["explorer", "refiner", "synthesizer"],   description: "Maximum diversity: explore, refine, and synthesize." },
];

export default function NewJob() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [loading,            setLoading]            = useState(false);
    const [analyzing,          setAnalyzing]          = useState(false);
    const [problemDescription, setProblemDescription] = useState('');
    const [contentInput,       setContentInput]       = useState('');
    const [successCriteria,    setSuccessCriteria]    = useState('');
    const [analyzedSpec,       setAnalyzedSpec]       = useState<EvaluatorInfo | null>(null);
    const [selectedExample,    setSelectedExample]    = useState<number | null>(null);
    const [agentCount,         setAgentCount]         = useState(3);
    const [confidence,         setConfidence]         = useState<number>(0);
    const [error,              setError]              = useState<string | null>(null);

    const handleAnalyze = async () => {
        if (!problemDescription.trim()) return;

        setAnalyzing(true);
        setError(null);

        try {
            const response = await fetch(`${API_BASE}/evaluators/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: problemDescription }),
            });

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (data.spec) {
                setAnalyzedSpec({
                    id: data.recommended_evaluator,
                    name: data.spec.name,
                    editable_fields: data.spec.editable_fields,
                    metrics: data.spec.metrics,
                    guardrails: data.spec.guardrails,
                });
                setConfidence(data.confidence);
            }
        } catch (err) {
            console.error('Failed to analyze:', err);
            setError('Could not connect to backend. Make sure the API server is running on port 8000.');
        } finally {
            setAnalyzing(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user) return;

        setLoading(true);

        const template_id = analyzedSpec?.id || 'landing-page-cro';
        const agentConfig = AGENT_CONFIGS.find(a => a.count === agentCount);

        // 1. Save project to Supabase
        const { data, error: dbError } = await supabase
            .from('projects')
            .insert({
                user_id: user.id,
                name: problemDescription.slice(0, 60) || 'Untitled Project',
                description: problemDescription,
                template_id,
                config: {
                    spec:            analyzedSpec,
                    content_input:   contentInput,
                    success_criteria: successCriteria,
                    agent_count:     agentCount,
                    agent_roles:     agentConfig?.roles,
                },
                status: 'active'
            })
            .select()
            .single();

        if (dbError || !data) {
            // Fallback: demo mode without Supabase
            setLoading(false);
            const demoId = `demo-${Date.now()}`;

            // Initialize with user's content
            await fetch(`${API_BASE}/projects/${demoId}/initialize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template_id,
                    content_input: contentInput,
                }),
            }).catch(() => null);

            // Kick off agents in demo mode
            await fetch(`${API_BASE}/projects/${demoId}/start`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    template_id,
                    agent_count: agentCount,
                    roles: agentConfig?.roles,
                }),
            }).catch(() => null);

            navigate(`/dashboard/project/${demoId}?template=${template_id}`);
            return;
        }

        // 2b. Initialize project with user's content
        await fetch(`${API_BASE}/projects/${data.id}/initialize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id,
                content_input: contentInput,
            }),
        }).catch(() => null);

        // 2c. Start agents for the saved project
        await fetch(`${API_BASE}/projects/${data.id}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id,
                agent_count: agentCount,
                roles: agentConfig?.roles,
            }),
        }).catch(() => null);

        setLoading(false);
        navigate(`/dashboard/project/${data.id}`);
    };

    const primaryMetric    = analyzedSpec?.metrics?.[0];
    const contentPlaceholder = CONTENT_PLACEHOLDER[analyzedSpec?.id || ''] ?? 'Paste your content here…';
    const successHint        = SUCCESS_HINT[analyzedSpec?.id || ''] ?? 'e.g., "I want the metric above X"';

    return (
        <div style={{ maxWidth: 700 }}>
            <h1 style={{ fontFamily: serif, fontSize: 36, fontWeight: 400, marginBottom: 12 }}>
                What do you want to optimize?
            </h1>
            <p style={{ fontSize: 15, color: inkMuted, marginBottom: 32, maxWidth: 520 }}>
                Describe your problem. FORGE picks the right metrics, runs experiments overnight, and surfaces the best variant.
            </p>

            {/* ── Problem Description ── */}
            <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    What are you optimizing?
                </label>
                <textarea
                    value={problemDescription}
                    onChange={e => { setProblemDescription(e.target.value); setAnalyzedSpec(null); setSelectedExample(null); }}
                    placeholder="e.g., I have a cold email with a 3% reply rate. I want to test different subject lines and email bodies to improve it…"
                    style={{ width: '100%', padding: '14px 16px', fontSize: 14, fontFamily: font, lineHeight: 1.6, border: '1px solid rgba(26,22,20,0.1)', borderRadius: 10, background: '#FFF', color: ink, outline: 'none', resize: 'vertical', minHeight: 100, boxSizing: 'border-box' }}
                />
            </div>

            {/* ── Example Pills ── */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 28 }}>
                {EXAMPLE_PROBLEMS.map((example, i) => (
                    <button key={i}
                        onClick={async () => { 
                            setSelectedExample(i); 
                            setProblemDescription(example); 
                            setAnalyzedSpec(null);
                            // Auto-analyze on example select
                            setAnalyzing(true);
                            try {
                                const response = await fetch(`${API_BASE}/evaluators/recommend`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ description: example }),
                                });
                                const data = await response.json();
                                if (data.spec) {
                                    setAnalyzedSpec({
                                        id: data.recommended_evaluator,
                                        name: data.spec.name,
                                        editable_fields: data.spec.editable_fields,
                                        metrics: data.spec.metrics,
                                        guardrails: data.spec.guardrails,
                                    });
                                    setConfidence(data.confidence);
                                }
                            } catch (err) {
                                console.error('Auto-analyze failed:', err);
                            } finally {
                                setAnalyzing(false);
                            }
                        }}
                        style={{ padding: '7px 14px', fontSize: 12, fontFamily: font, borderRadius: 20, cursor: 'pointer', border: selectedExample === i ? 'none' : '1px solid rgba(26,22,20,0.08)', background: selectedExample === i ? copper : 'transparent', color: selectedExample === i ? '#FFF' : inkMuted, transition: 'all 0.2s' }}>
                        {example}
                    </button>
                ))}
            </div>

            {/* ── Analyze Button ── */}
            <div style={{ marginBottom: 32 }}>
                <button onClick={handleAnalyze} disabled={analyzing || !problemDescription.trim()}
                    style={{ padding: '12px 24px', fontSize: 14, fontWeight: 500, fontFamily: font, background: copper, color: '#FFF', border: 'none', borderRadius: 8, cursor: analyzing ? 'not-allowed' : 'pointer', opacity: (analyzing || !problemDescription.trim()) ? 0.6 : 1 }}>
                    {analyzing ? 'Analyzing…' : 'Analyze Problem'}
                </button>
                {error && (
                    <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                        {error}
                    </div>
                )}
            </div>

            {/* ── After Analysis ── */}
            {analyzedSpec && (
                <div style={{ marginBottom: 32 }}>

                    {/* Metric spec card */}
                    <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 12, padding: 24, marginBottom: 24 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth={2.5}><path d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div>
                                <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 400 }}>{analyzedSpec.name}</div>
                                {confidence > 0 && <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted }}>Confidence: {Math.round(confidence * 100)}%</div>}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
                            <div>
                                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Primary Metric</div>
                                <div style={{ fontSize: 18, fontWeight: 600 }}>{primaryMetric?.name || 'metric'}</div>
                            </div>
                            <div>
                                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Optimizing for</div>
                                <div style={{ fontSize: 16, fontWeight: 500, color: primaryMetric?.direction === 'higher_is_better' ? '#10B981' : '#EF4444' }}>
                                    {primaryMetric?.direction === 'higher_is_better' ? '↑ Maximize' : '↓ Minimize'}
                                </div>
                            </div>
                        </div>

                        <div style={{ paddingTop: 16, borderTop: '1px solid rgba(26,22,20,0.06)' }}>
                            <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>What the agents can change</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {analyzedSpec.editable_fields?.map(field => (
                                    <span key={field} style={{ padding: '3px 10px', background: 'rgba(196,122,42,0.1)', color: copper, fontSize: 11, fontFamily: mono, borderRadius: 4 }}>
                                        {field}
                                    </span>
                                ))}
                            </div>
                        </div>

                        {analyzedSpec.guardrails?.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Guardrails (agents cannot violate these)</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                    {analyzedSpec.guardrails?.map(g => (
                                        <span key={g.name} style={{ padding: '3px 10px', background: cream, color: inkMuted, fontSize: 11, fontFamily: mono, borderRadius: 4 }}>
                                            {g.name}: {g.direction} {g.threshold}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* ── Content Input ── */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                            Paste your content to optimize <span style={{ color: inkMuted, fontWeight: 400 }}>(optional — agents use a default if empty)</span>
                        </label>
                        <textarea
                            value={contentInput}
                            onChange={e => setContentInput(e.target.value)}
                            placeholder={contentPlaceholder}
                            style={{ width: '100%', padding: '14px 16px', fontSize: 13, fontFamily: mono, lineHeight: 1.6, border: '1px solid rgba(26,22,20,0.08)', borderRadius: 10, background: '#FFF', color: ink, outline: 'none', resize: 'vertical', minHeight: 120, boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* ── Success Criteria ── */}
                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                            What does success look like? <span style={{ color: inkMuted, fontWeight: 400 }}>(helps agents know when to stop)</span>
                        </label>
                        <input
                            type="text"
                            value={successCriteria}
                            onChange={e => setSuccessCriteria(e.target.value)}
                            placeholder={successHint}
                            style={{ width: '100%', padding: '12px 16px', fontSize: 14, fontFamily: font, border: '1px solid rgba(26,22,20,0.08)', borderRadius: 10, background: '#FFF', color: ink, outline: 'none', boxSizing: 'border-box' }}
                        />
                    </div>

                    {/* ── Agent Swarm ── */}
                    <div style={{ marginBottom: 28 }}>
                        <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Agent Swarm</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                            {AGENT_CONFIGS.map(config => (
                                <div key={config.count} onClick={() => setAgentCount(config.count)}
                                    style={{ padding: 14, border: `1px solid ${agentCount === config.count ? copper : 'rgba(26,22,20,0.08)'}`, borderRadius: 8, cursor: 'pointer', background: agentCount === config.count ? 'rgba(196,122,42,0.04)' : '#FFF', transition: 'all 0.2s' }}>
                                    <div style={{ fontFamily: serif, fontSize: 15, marginBottom: 4 }}>{config.label}</div>
                                    <div style={{ fontSize: 11, color: inkMuted, marginBottom: 10, lineHeight: 1.4 }}>{config.description}</div>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        {config.roles.map(role => (
                                            <span key={role} style={{ padding: '2px 7px', background: 'rgba(196,122,42,0.15)', color: copper, fontSize: 10, fontFamily: mono, borderRadius: 4 }}>
                                                {role}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ── Submit ── */}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16 }}>
                        {loading && <span style={{ fontSize: 13, color: inkMuted, fontFamily: font }}>Starting agents…</span>}
                        <button onClick={handleSubmit} disabled={loading}
                            style={{ padding: '14px 36px', fontFamily: serif, fontSize: 18, fontStyle: 'italic', background: copper, color: '#FFF', border: 'none', borderRadius: 8, cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1 }}>
                            {loading ? 'Starting…' : 'Start Optimizing →'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
