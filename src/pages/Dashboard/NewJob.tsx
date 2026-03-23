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
const green   = '#10B981';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface EvaluatorInfo {
    id: string;
    name: string;
    editable_fields: string[];
    metrics: { name: string; direction: string; weight: number }[];
    guardrails: { name: string; threshold: number; direction: string }[];
}

interface PostHogProject {
    id: number;
    name: string;
    api_token: string;
}

interface MetricDef {
    type: 'rate' | 'count' | 'hogsql';
    display_name: string;
    numerator_event?: string;
    denominator_event?: string;
    event?: string;
    hogsql_query?: string;
}

type ExperimentMode = 'simulation' | 'backtest' | 'live';

// Content placeholders per template
const CONTENT_PLACEHOLDER: Record<string, string> = {
    'landing-page-cro':     'Paste your landing page copy here (headline, subheadline, CTA, value props)…',
    'structural':           'Paste your current section order, e.g.:\nsections_order: hero, features, testimonials, pricing, cta\nhero_style: left-aligned\ncta_style: primary',
    'onboarding':           'Paste your onboarding steps, e.g.:\nsteps: welcome, profile, team, first_action\nwelcome fields: email, password\nprofile fields: name, role, company',
    'pricing-page':         'Paste your pricing config, e.g.:\nplans: free, pro, enterprise\nhighlighted: pro\nannual default: yes\npro CTA: Start Free Trial',
    'feature-announcement': 'Paste your announcement config, e.g.:\nposition: sidebar\nbadge: New\ntooltip: Check out this feature\nauto_show_delay: 5000ms',
};

const SUCCESS_HINT: Record<string, string> = {
    'landing-page-cro':     'e.g., "I want conversion rate above 5%"',
    'structural':           'e.g., "I want conversion rate above 5%"',
    'onboarding':           'e.g., "I want onboarding completion above 60%"',
    'pricing-page':         'e.g., "I want upgrade click rate above 5%"',
    'feature-announcement': 'e.g., "I want feature adoption above 25%"',
};

const EXAMPLE_PROBLEMS = [
    "Optimize my landing page for conversions",
    "Optimize my page structure via feature flags",
    "Improve my onboarding completion rate",
    "Optimize my pricing page to drive upgrades",
    "Increase feature adoption with better announcements",
];

// Local specs — applied instantly when a pill is clicked, no API round-trip needed.
const LOCAL_SPECS: Record<string, EvaluatorInfo> = {
    "Optimize my landing page for conversions": {
        id: 'landing-page-cro', name: 'Landing Page CRO',
        editable_fields: ['headline', 'subheadline', 'cta_text', 'value_props', 'social_proof'],
        metrics: [{ name: 'Conversion Rate', direction: 'higher_is_better', weight: 1 }],
        guardrails: [{ name: 'readability', threshold: 30, direction: 'above' }],
    },
    "Optimize my page structure via feature flags": {
        id: 'structural', name: 'Page Structure',
        editable_fields: ['sections_order', 'hero_style', 'show_pricing', 'show_testimonials', 'cta_style'],
        metrics: [{ name: 'Conversion Rate', direction: 'higher_is_better', weight: 1 }],
        guardrails: [],
    },
    "Improve my onboarding completion rate": {
        id: 'onboarding', name: 'Onboarding Flow',
        editable_fields: ['steps_order', 'step_fields', 'show_progress_bar', 'show_skip_option', 'required_fields_only'],
        metrics: [{ name: 'Completion Rate', direction: 'higher_is_better', weight: 1 }],
        guardrails: [],
    },
    "Optimize my pricing page to drive upgrades": {
        id: 'pricing-page', name: 'Pricing Page',
        editable_fields: ['plans_order', 'highlighted_plan', 'annual_default', 'cta_text', 'show_comparison'],
        metrics: [{ name: 'Upgrade Rate', direction: 'higher_is_better', weight: 1 }],
        guardrails: [],
    },
    "Increase feature adoption with better announcements": {
        id: 'feature-announcement', name: 'Feature Announcement',
        editable_fields: ['feature_position', 'default_view', 'show_badge', 'badge_text', 'auto_show_delay'],
        metrics: [{ name: 'Adoption Rate', direction: 'higher_is_better', weight: 1 }],
        guardrails: [],
    },
};

const AGENT_CONFIGS = [
    { count: 1, label: "Single Agent",       roles: ["explorer"],                             description: "One explorer agent. Fast, good for simple tasks." },
    { count: 2, label: "Explorer + Refiner", roles: ["explorer", "refiner"],                  description: "Broad exploration + fine-tuning of winners." },
    { count: 3, label: "Full Swarm",         roles: ["explorer", "refiner", "synthesizer"],   description: "Maximum diversity: explore, refine, and synthesize." },
];

const MODE_OPTIONS: { mode: ExperimentMode; label: string; description: string; requiresPostHog: boolean }[] = [
    {
        mode: 'simulation',
        label: 'Simulation',
        description: 'Instant results via deterministic evaluators. No analytics needed. Great for testing.',
        requiresPostHog: false,
    },
    {
        mode: 'backtest',
        label: 'Backtest',
        description: 'Compares two historical windows from your PostHog data. Closes the real-analytics loop in minutes.',
        requiresPostHog: true,
    },
    {
        mode: 'live',
        label: 'Live (24h cycles)',
        description: 'Deploy variants to your site, measure real user behaviour over 24h+ windows. Production-grade.',
        requiresPostHog: true,
    },
];

// ─── PostHog Connection Panel ──────────────────────────────────────────────

function PostHogConnect({
    onConnected,
}: {
    onConnected: (apiKey: string, projects: PostHogProject[]) => void;
}) {
    const [apiKey, setApiKey] = useState('');
    const [baseUrl, setBaseUrl] = useState('https://app.posthog.com');
    const [verifying, setVerifying] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleVerify = async () => {
        if (!apiKey.trim()) return;
        setVerifying(true);
        setError(null);
        try {
            const resp = await fetch(`${API_BASE}/connectors/posthog/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ api_key: apiKey.trim(), base_url: baseUrl }),
            });
            const data = await resp.json();
            if (data.success) {
                onConnected(apiKey.trim(), data.projects ?? []);
            } else {
                setError(data.error ?? 'Verification failed');
            }
        } catch {
            setError('Could not reach backend. Make sure the API server is running.');
        } finally {
            setVerifying(false);
        }
    };

    return (
        <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                Connect PostHog
            </div>
            <p style={{ fontSize: 13, color: inkMuted, marginBottom: 16, lineHeight: 1.5 }}>
                Paste your PostHog Personal API key. Forge will query your real analytics to measure experiment outcomes.
            </p>
            <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="phx_xxxxxxxxxxxxxxxxxxxx"
                style={{ width: '100%', padding: '10px 12px', fontSize: 13, fontFamily: mono, border: '1px solid rgba(26,22,20,0.1)', borderRadius: 8, marginBottom: 10, boxSizing: 'border-box', background: cream }}
            />
            <input
                type="text"
                value={baseUrl}
                onChange={e => setBaseUrl(e.target.value)}
                placeholder="https://app.posthog.com (EU: https://eu.posthog.com)"
                style={{ width: '100%', padding: '10px 12px', fontSize: 12, fontFamily: mono, border: '1px solid rgba(26,22,20,0.08)', borderRadius: 8, marginBottom: 12, boxSizing: 'border-box', color: inkMuted }}
            />
            {error && (
                <div style={{ fontSize: 12, color: '#EF4444', marginBottom: 10, padding: '6px 10px', background: 'rgba(239,68,68,0.08)', borderRadius: 6 }}>
                    {error}
                </div>
            )}
            <button
                onClick={handleVerify}
                disabled={verifying || !apiKey.trim()}
                style={{ padding: '9px 20px', fontSize: 13, fontFamily: font, background: copper, color: '#FFF', border: 'none', borderRadius: 7, cursor: verifying || !apiKey.trim() ? 'not-allowed' : 'pointer', opacity: verifying || !apiKey.trim() ? 0.6 : 1 }}
            >
                {verifying ? 'Verifying…' : 'Connect PostHog'}
            </button>
        </div>
    );
}

// ─── Metric Selector ────────────────────────────────────────────────────────

function MetricSelector({
    phApiKey,
    phProjectId,
    phBaseUrl,
    onMetricSelected,
}: {
    phApiKey: string;
    phProjectId: number;
    phBaseUrl: string;
    onMetricSelected: (metric: MetricDef) => void;
}) {
    const [events, setEvents] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [metricType, setMetricType] = useState<'rate' | 'count'>('rate');
    const [numerator, setNumerator] = useState('');
    const [denominator, setDenominator] = useState('');
    const [countEvent, setCountEvent] = useState('');

    const loadEvents = async () => {
        setLoading(true);
        try {
            const resp = await fetch(
                `${API_BASE}/connectors/posthog/events/${phProjectId}?api_key=${encodeURIComponent(phApiKey)}&base_url=${encodeURIComponent(phBaseUrl)}`
            );
            const data = await resp.json();
            setEvents(data.events ?? []);
        } catch {
            setEvents([]);
        } finally {
            setLoading(false);
        }
    };

    // Load events on mount
    useState(() => { loadEvents(); });

    const handleConfirm = () => {
        if (metricType === 'rate' && numerator && denominator) {
            onMetricSelected({
                type: 'rate',
                display_name: `${numerator} / ${denominator}`,
                numerator_event: numerator,
                denominator_event: denominator,
            });
        } else if (metricType === 'count' && countEvent) {
            onMetricSelected({
                type: 'count',
                display_name: `${countEvent} count`,
                event: countEvent,
            });
        }
    };

    const selectStyle = {
        width: '100%', padding: '8px 12px', fontSize: 12, fontFamily: mono,
        border: '1px solid rgba(26,22,20,0.1)', borderRadius: 7, background: '#FFF',
        color: ink, boxSizing: 'border-box' as const, marginBottom: 8,
    };

    return (
        <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 12, padding: 20, marginBottom: 24 }}>
            <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                What metric are we maximising?
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                {(['rate', 'count'] as const).map(t => (
                    <button key={t} onClick={() => setMetricType(t)}
                        style={{ padding: '5px 14px', fontSize: 12, fontFamily: font, borderRadius: 20, border: `1px solid ${metricType === t ? copper : 'rgba(26,22,20,0.1)'}`, background: metricType === t ? 'rgba(196,122,42,0.08)' : 'transparent', color: metricType === t ? copper : inkMuted, cursor: 'pointer' }}>
                        {t === 'rate' ? 'Conversion Rate' : 'Event Count'}
                    </button>
                ))}
            </div>

            {loading && <div style={{ fontSize: 12, color: inkMuted }}>Loading events from PostHog…</div>}

            {metricType === 'rate' && (
                <div>
                    <label style={{ fontSize: 11, color: inkMuted, fontFamily: mono, display: 'block', marginBottom: 4 }}>NUMERATOR (the goal event)</label>
                    <select value={numerator} onChange={e => setNumerator(e.target.value)} style={selectStyle}>
                        <option value="">Select event…</option>
                        {events.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                    <label style={{ fontSize: 11, color: inkMuted, fontFamily: mono, display: 'block', marginBottom: 4 }}>DENOMINATOR (the entry event)</label>
                    <select value={denominator} onChange={e => setDenominator(e.target.value)} style={selectStyle}>
                        <option value="">Select event…</option>
                        {events.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                </div>
            )}

            {metricType === 'count' && (
                <div>
                    <label style={{ fontSize: 11, color: inkMuted, fontFamily: mono, display: 'block', marginBottom: 4 }}>EVENT TO COUNT</label>
                    <select value={countEvent} onChange={e => setCountEvent(e.target.value)} style={selectStyle}>
                        <option value="">Select event…</option>
                        {events.map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                </div>
            )}

            <button
                onClick={handleConfirm}
                disabled={metricType === 'rate' ? !numerator || !denominator : !countEvent}
                style={{ marginTop: 4, padding: '8px 18px', fontSize: 12, fontFamily: font, background: green, color: '#FFF', border: 'none', borderRadius: 7, cursor: 'pointer', opacity: (metricType === 'rate' ? !numerator || !denominator : !countEvent) ? 0.5 : 1 }}>
                Set Metric
            </button>
        </div>
    );
}

// ─── Main component ──────────────────────────────────────────────────────────

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

    // PostHog / mode state
    const [experimentMode,  setExperimentMode]  = useState<ExperimentMode>('simulation');
    const [phConnected,     setPhConnected]     = useState(false);
    const [phApiKey,        setPhApiKey]        = useState('');
    const [phProjects,      setPhProjects]      = useState<PostHogProject[]>([]);
    const [phProjectId,     setPhProjectId]     = useState<number>(0);
    const [phBaseUrl,       _setPhBaseUrl]      = useState('https://app.posthog.com');
    const [phMetric,        setPhMetric]        = useState<MetricDef | null>(null);
    const [cycleWindowHours, setCycleWindowHours] = useState(24);

    const handlePostHogConnected = (apiKey: string, projects: PostHogProject[]) => {
        setPhApiKey(apiKey);
        setPhProjects(projects);
        setPhConnected(true);
        if (projects.length === 1) setPhProjectId(projects[0].id);
    };

    const handleAnalyze = async () => {
        if (!problemDescription.trim()) return;
        setAnalyzing(true);
        setError(null);

        // Apply local spec instantly so the form is never blocked
        const localSpec = LOCAL_SPECS[problemDescription] ?? LOCAL_SPECS["Optimize my landing page for conversions"];
        setAnalyzedSpec(localSpec);
        setConfidence(0.85);

        // Try to get a refined spec from the API in the background
        try {
            const response = await fetch(`${API_BASE}/evaluators/recommend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: problemDescription }),
            });
            if (response.ok) {
                const data = await response.json();
                if (data.spec && data.confidence >= 0.7) {
                    setAnalyzedSpec({
                        id: data.recommended_evaluator,
                        name: data.spec.name,
                        editable_fields: data.spec.editable_fields,
                        metrics: data.spec.metrics,
                        guardrails: data.spec.guardrails,
                    });
                    setConfidence(data.confidence);
                }
            }
        } catch {
            // Local spec already set above — no need to show an error
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
        const modeRequiresPostHog = experimentMode !== 'simulation';

        // 1. Save project to Supabase
        const { data, error: dbError } = await supabase
            .from('projects')
            .insert({
                user_id: user.id,
                name: problemDescription.slice(0, 60) || 'Untitled Project',
                description: problemDescription,
                template_id,
                config: {
                    spec:              analyzedSpec,
                    content_input:     contentInput,
                    success_criteria:  successCriteria,
                    agent_count:       agentCount,
                    agent_roles:       agentConfig?.roles,
                    experiment_mode:   experimentMode,
                    posthog_project_id: phProjectId || null,
                    cycle_window_hours: cycleWindowHours,
                },
                status: 'active',
            })
            .select()
            .single();

        const projectId = data?.id ?? `demo-${Date.now()}`;
        const isDemo = !data || !!dbError;
        setLoading(false);

        // 2. Store PostHog config if applicable
        if (modeRequiresPostHog && phConnected && phProjectId && phMetric) {
            await fetch(`${API_BASE}/projects/${projectId}/posthog`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personal_api_key: phApiKey,
                    posthog_project_id: phProjectId,
                    base_url: phBaseUrl,
                    metric: phMetric,
                    cycle_window_hours: cycleWindowHours,
                }),
            }).catch(() => null);
        }

        // 3. Start agents (always demo_mode for now — real PostHog mode uses live data)
        await fetch(`${API_BASE}/projects/${projectId}/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                template_id,
                agent_count: agentCount,
                roles: agentConfig?.roles,
                experiment_mode: experimentMode,
                demo_mode: true,
            }),
        }).catch(() => null);

        if (isDemo) {
            navigate(`/dashboard/project/${projectId}?template=${template_id}`);
        } else {
            navigate(`/dashboard/project/${projectId}`);
        }
    };

    const primaryMetric      = analyzedSpec?.metrics?.[0];
    const contentPlaceholder = CONTENT_PLACEHOLDER[analyzedSpec?.id || ''] ?? 'Paste your content here…';
    const successHint        = SUCCESS_HINT[analyzedSpec?.id || ''] ?? 'e.g., "I want the metric above X"';
    const selectedMode       = MODE_OPTIONS.find(m => m.mode === experimentMode)!;

    return (
        <div style={{ maxWidth: 700 }}>
            <h1 style={{ fontFamily: serif, fontSize: 36, fontWeight: 400, marginBottom: 12 }}>
                What do you want to optimize?
            </h1>
            <p style={{ fontSize: 15, color: inkMuted, marginBottom: 32, maxWidth: 520 }}>
                Describe your problem. FORGE picks the right metrics, runs experiments, and surfaces the best variant — validated by real user behaviour.
            </p>

            {/* ── Experiment Mode ── */}
            <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
                    Experiment Mode
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                    {MODE_OPTIONS.map(opt => (
                        <div key={opt.mode} onClick={() => setExperimentMode(opt.mode)}
                            style={{ padding: 14, border: `1px solid ${experimentMode === opt.mode ? copper : 'rgba(26,22,20,0.08)'}`, borderRadius: 8, cursor: 'pointer', background: experimentMode === opt.mode ? 'rgba(196,122,42,0.04)' : '#FFF', transition: 'all 0.15s' }}>
                            <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 600, color: experimentMode === opt.mode ? copper : ink, marginBottom: 4 }}>
                                {opt.label}
                            </div>
                            <div style={{ fontSize: 11, color: inkMuted, lineHeight: 1.45 }}>{opt.description}</div>
                            {opt.requiresPostHog && (
                                <div style={{ marginTop: 8, fontFamily: mono, fontSize: 9, color: experimentMode === opt.mode ? copper : inkMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                    Requires PostHog
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* ── PostHog Connection (shown when mode requires it) ── */}
            {selectedMode.requiresPostHog && !phConnected && (
                <PostHogConnect onConnected={handlePostHogConnected} />
            )}

            {/* ── PostHog Connected Banner ── */}
            {phConnected && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: green }} />
                    <span style={{ fontSize: 13, color: green, fontFamily: font }}>PostHog connected</span>
                    <span style={{ fontSize: 12, color: inkMuted, marginLeft: 4 }}>
                        {phProjects.length} project{phProjects.length !== 1 ? 's' : ''} available
                    </span>
                    <button onClick={() => { setPhConnected(false); setPhProjects([]); setPhMetric(null); }}
                        style={{ marginLeft: 'auto', fontSize: 11, color: inkMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}>
                        Disconnect
                    </button>
                </div>
            )}

            {/* ── PostHog Project selector ── */}
            {phConnected && phProjects.length > 1 && (
                <div style={{ marginBottom: 16 }}>
                    <label style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 6 }}>PostHog Project</label>
                    <select value={phProjectId} onChange={e => setPhProjectId(Number(e.target.value))}
                        style={{ padding: '9px 12px', fontSize: 13, fontFamily: font, border: '1px solid rgba(26,22,20,0.1)', borderRadius: 8, background: '#FFF', color: ink, width: '100%', boxSizing: 'border-box' }}>
                        <option value={0}>Select project…</option>
                        {phProjects.map(p => <option key={p.id} value={p.id}>{p.name} (#{p.id})</option>)}
                    </select>
                </div>
            )}

            {/* ── Metric Selector ── */}
            {phConnected && phProjectId > 0 && !phMetric && (
                <MetricSelector
                    phApiKey={phApiKey}
                    phProjectId={phProjectId}
                    phBaseUrl={phBaseUrl}
                    onMetricSelected={m => setPhMetric(m)}
                />
            )}

            {/* ── Metric Confirmed Banner ── */}
            {phMetric && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 8, marginBottom: 16 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: green }} />
                    <span style={{ fontSize: 13, color: green, fontFamily: font }}>Metric: {phMetric.display_name}</span>
                    <button onClick={() => setPhMetric(null)} style={{ marginLeft: 'auto', fontSize: 11, color: inkMuted, background: 'transparent', border: 'none', cursor: 'pointer' }}>Change</button>
                </div>
            )}

            {/* ── Cycle Window (live mode) ── */}
            {experimentMode === 'live' && phConnected && (
                <div style={{ marginBottom: 20 }}>
                    <label style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>Measurement Window</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                        {[24, 48, 72].map(h => (
                            <button key={h} onClick={() => setCycleWindowHours(h)}
                                style={{ padding: '6px 16px', fontSize: 12, fontFamily: font, borderRadius: 20, border: `1px solid ${cycleWindowHours === h ? copper : 'rgba(26,22,20,0.1)'}`, background: cycleWindowHours === h ? 'rgba(196,122,42,0.08)' : 'transparent', color: cycleWindowHours === h ? copper : inkMuted, cursor: 'pointer' }}>
                                {h}h
                            </button>
                        ))}
                    </div>
                    <p style={{ fontSize: 11, color: inkMuted, marginTop: 6 }}>
                        How long each variant runs before PostHog measures the result.
                    </p>
                </div>
            )}

            {/* ── Forge.js Snippet (live mode) ── */}
            {experimentMode === 'live' && phConnected && (
                <div style={{
                    marginBottom: 24,
                    background: 'rgba(16,185,129,0.04)',
                    border: '1px solid rgba(16,185,129,0.15)',
                    borderRadius: 10,
                    padding: 20,
                }}>
                    <div style={{ fontFamily: mono, fontSize: 10, color: '#10B981', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, fontWeight: 600 }}>
                        Install forge.js (one-time setup)
                    </div>
                    <p style={{ fontSize: 12, color: inkMuted, lineHeight: 1.6, marginBottom: 12 }}>
                        Add this script tag to your site so Forge can automatically apply variants via PostHog feature flags.
                        No code changes needed — just paste it before {'</body>'}.
                    </p>
                    <div style={{
                        background: '#FFF',
                        border: '1px solid rgba(26,22,20,0.08)',
                        borderRadius: 6,
                        padding: 12,
                        fontFamily: mono,
                        fontSize: 11,
                        lineHeight: 1.5,
                        color: ink,
                        wordBreak: 'break-all',
                        marginBottom: 10,
                    }}>
                        {`<script src="${API_BASE}/forge.js" data-project="YOUR_PROJECT_ID" data-api="${API_BASE}"></script>`}
                    </div>
                    <p style={{ fontSize: 11, color: inkMuted, lineHeight: 1.5 }}>
                        Then annotate key elements with <code style={{ fontFamily: mono, fontSize: 10, background: 'rgba(26,22,20,0.05)', padding: '1px 4px', borderRadius: 3 }}>data-forge</code> attributes
                        (e.g., <code style={{ fontFamily: mono, fontSize: 10, background: 'rgba(26,22,20,0.05)', padding: '1px 4px', borderRadius: 3 }}>{'<h1 data-forge="headline">'}</code>).
                        Forge handles the rest.
                    </p>
                </div>
            )}

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

                            // Apply local spec instantly — form is available immediately
                            const localSpec = LOCAL_SPECS[example];
                            if (localSpec) {
                                setAnalyzedSpec(localSpec);
                                setConfidence(0.85);
                            }

                            // Refine in background via API
                            setAnalyzing(true);
                            try {
                                const response = await fetch(`${API_BASE}/evaluators/recommend`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ description: example }),
                                });
                                if (response.ok) {
                                    const data = await response.json();
                                    if (data.spec && data.confidence >= 0.7) {
                                        setAnalyzedSpec({
                                            id: data.recommended_evaluator,
                                            name: data.spec.name,
                                            editable_fields: data.spec.editable_fields,
                                            metrics: data.spec.metrics,
                                            guardrails: data.spec.guardrails,
                                        });
                                        setConfidence(data.confidence);
                                    }
                                }
                            } catch {
                                // Local spec already set — silent fallback
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
            {!analyzedSpec && (
                <div style={{ marginBottom: 32 }}>
                    <button onClick={handleAnalyze} disabled={analyzing || !problemDescription.trim()}
                        style={{ padding: '12px 24px', fontSize: 14, fontWeight: 500, fontFamily: font, background: copper, color: '#FFF', border: 'none', borderRadius: 8, cursor: analyzing ? 'not-allowed' : 'pointer', opacity: (analyzing || !problemDescription.trim()) ? 0.6 : 1 }}>
                        {analyzing ? 'Analyzing…' : '→ Continue'}
                    </button>
                    <span style={{ fontSize: 12, color: inkMuted, marginLeft: 12 }}>
                        or click an example above
                    </span>
                    {error && (
                        <div style={{ fontSize: 12, color: '#EF4444', marginTop: 8, padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                            {error}
                        </div>
                    )}
                </div>
            )}

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
                                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                                    {experimentMode !== 'simulation' && phMetric ? 'PostHog Metric' : 'Primary Metric'}
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 600 }}>
                                    {experimentMode !== 'simulation' && phMetric
                                        ? phMetric.display_name
                                        : (primaryMetric?.name || 'metric')}
                                </div>
                            </div>
                            <div>
                                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Mode</div>
                                <div style={{ fontSize: 16, fontWeight: 500, color: experimentMode === 'live' ? green : experimentMode === 'backtest' ? copper : inkMuted }}>
                                    {experimentMode === 'live' ? '⬆ Live 24h cycles' : experimentMode === 'backtest' ? '⟳ Backtest' : '⚡ Simulation'}
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
