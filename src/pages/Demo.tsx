import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const font = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono = `'JetBrains Mono', monospace`;
const serif = `'Instrument Serif', Georgia, serif`;

const copper = '#C47A2A';
const ink = '#1A1614';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const cream = '#FAF8F5';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';

interface Experiment {
  id: string;
  agent_name: string;
  hypothesis: string;
  mutation: string;
  metric_before: number;
  metric_after: number;
  status: 'success' | 'failure' | 'reverted';
}

interface ProjectData {
  metric: number;
  config: Record<string, unknown>;
  experiment_count: number;
}

function formatDiff(after: number, before: number): string {
  const diff = after - before;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(1)}`;
}

export default function Demo() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [projectData, setProjectData] = useState<ProjectData | null>(null);
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [liveCount, setLiveCount] = useState(0);

  const TEMPLATE_ID = 'eval-suite';
const baseline = 50.0;

  useEffect(() => {
    async function fetchData() {
      try {
        const bestRes = await fetch(`${API_BASE}/experiments/global-best/${TEMPLATE_ID}`);
        const bestData = await bestRes.json();
        
        const historyRes = await fetch(`${API_BASE}/experiments/history/${TEMPLATE_ID}`);
        const historyData = await historyRes.json();
        
        if (bestData && !bestData.error) {
          setProjectData(bestData);
        }
        
        if (historyData && Array.isArray(historyData)) {
          setExperiments(historyData.slice(0, 10).reverse());
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Failed to fetch:', err);
        setError('Could not connect to backend. Make sure the API is running.');
        setLoading(false);
      }
    }
    
    fetchData();
    
    const interval = setInterval(async () => {
      if (isLive) {
        try {
          const bestRes = await fetch(`${API_BASE}/experiments/global-best/${TEMPLATE_ID}`);
          const bestData = await bestRes.json();
          if (bestData && !bestData.error) {
            setProjectData(bestData);
          }
          
          const historyRes = await fetch(`${API_BASE}/experiments/history/${TEMPLATE_ID}`);
          const historyData = await historyRes.json();
          if (historyData && Array.isArray(historyData)) {
            setExperiments(historyData.slice(0, 10).reverse());
          }
          
          setLiveCount(prev => prev + 1);
        } catch (err) {
          console.error('Polling error:', err);
        }
      }
    }, 3000);
    
    return () => clearInterval(interval);
  }, [isLive]);

  const currentScore = projectData?.metric ?? baseline;
  const experimentCount = projectData?.experiment_count ?? 0;
  const improvement = ((currentScore - baseline) / baseline * 100).toFixed(0);
  const cost = (experimentCount * 0.0003).toFixed(2);

  const handleRunLive = async () => {
    setIsLive(true);
    setLiveCount(0);
    
    try {
      const projRes = await fetch(
        `${API_BASE}/projects?demo-live-${Date.now()}=test&template_id=${TEMPLATE_ID}&description=Live demo`,
        { method: 'POST' }
      );
      const projData = await projRes.json();
      
      if (projData.success && projData.project_id) {
        await fetch(`${API_BASE}/projects/${projData.project_id}/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: TEMPLATE_ID, agent_count: 1 }),
        });
      }
    } catch (err) {
      console.error('Failed to start:', err);
    }
    
    setTimeout(() => setIsLive(false), 15000);
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: cream, fontFamily: font, color: ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: mono, fontSize: 14, color: copper, textTransform: 'uppercase', letterSpacing: 2 }}>
          Loading demo data...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: cream, fontFamily: font, color: ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 500, padding: 40 }}>
          <h2 style={{ fontFamily: serif, fontSize: 32, marginBottom: 16 }}>Demo Unavailable</h2>
          <p style={{ color: inkMuted, marginBottom: 24 }}>{error}</p>
          <p style={{ fontSize: 14, color: inkMuted }}>
            To run: <code style={{ background: '#eee', padding: '4px 8px', borderRadius: 4 }}>cd backend && python3 main.py</code>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: cream, fontFamily: font, color: ink }}>
      <header style={{ maxWidth: 1200, margin: '0 auto', padding: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link to="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, background: ink, borderRadius: 4, transform: 'rotate(45deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 10, height: 10, background: copper, borderRadius: 2 }}></div>
          </div>
          <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 600, color: ink }}>forge</span>
        </Link>
        <nav style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 500, color: inkMuted, textDecoration: 'none' }}>Sign in</Link>
          <Link to="/login" style={{ fontSize: 14, fontWeight: 600, background: ink, color: '#FFF', padding: '10px 20px', borderRadius: 8, textDecoration: 'none' }}>
            Get started
          </Link>
        </nav>
      </header>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 24px 60px', textAlign: 'center' }}>
        <div style={{ display: 'inline-block', padding: '8px 16px', background: 'rgba(16,185,129,0.1)', borderRadius: 20, marginBottom: 24 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#10B981', textTransform: 'uppercase', letterSpacing: 1 }}>Live Demo</span>
        </div>
        
        <h1 style={{ fontFamily: serif, fontSize: 56, fontWeight: 400, lineHeight: 1.1, marginBottom: 24, maxWidth: 800, margin: '0 auto 24px' }}>
          Watch real experiments<br/>
          <em style={{ fontStyle: 'italic', color: copper }}>run autonomously</em>
        </h1>
        
        <p style={{ fontSize: 18, color: inkMuted, maxWidth: 600, margin: '0 auto 40px', lineHeight: 1.6 }}>
          {experimentCount > 0 ? `Real data: ${experimentCount} experiments run so far. Pass rate: ${currentScore.toFixed(1)}%` : 'Start the demo to see real eval metrics.'}
        </p>

        <button
          onClick={handleRunLive}
          disabled={isLive}
          style={{
            padding: '16px 40px',
            fontSize: 16,
            fontWeight: 600,
            background: copper,
            color: '#FFF',
            border: 'none',
            borderRadius: 10,
            cursor: isLive ? 'not-allowed' : 'pointer',
            opacity: isLive ? 0.7 : 1,
            boxShadow: '0 8px 24px rgba(196,122,42,0.3)',
          }}
        >
          {isLive ? `Running live... (${liveCount * 3}s)` : '▶ Run Live Demo'}
        </button>
      </section>

      <section style={{ background: ink, padding: '40px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32, textAlign: 'center' }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 48, fontWeight: 700, color: copper, marginBottom: 4 }}>{experimentCount}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>Experiments</div>
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 48, fontWeight: 700, color: '#FFF', marginBottom: 4 }}>{improvement}%</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>Improvement</div>
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 48, fontWeight: 700, color: '#10B981', marginBottom: 4 }}>{(currentScore * 100).toFixed(0)}%</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>Pass Rate</div>
          </div>
          <div>
            <div style={{ fontFamily: serif, fontSize: 48, fontWeight: 700, color: copper, marginBottom: 4 }}>${cost}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1.5 }}>Cost</div>
          </div>
        </div>
      </section>

      <section style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 60 }}>
          <div>
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>Optimization Curve</h3>
              <div style={{ height: 200, background: '#FFF', borderRadius: 12, border: '1px solid rgba(26,22,20,0.08)', padding: 20, display: 'flex', alignItems: 'flex-end', gap: 4 }}>
                {experiments.length > 0 ? (
                  experiments.slice(-12).map((exp, i) => {
                    const maxVal = Math.max(exp.metric_before, exp.metric_after);
                    const isPercent = maxVal <= 1.0;
                    const height = isPercent ? maxVal * 160 : (maxVal / 100) * 160;
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ 
                          width: '100%', 
                          height: `${height}px`, 
                          background: exp.status === 'success' ? '#10B981' : '#EF4444',
                          borderRadius: 4,
                          minHeight: 4
                        }}></div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ width: '100%', textAlign: 'center', color: inkMuted, fontSize: 14 }}>Run the demo</div>
                )}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>Current Best</h3>
              <div style={{ background: 'rgba(16,185,129,0.06)', borderRadius: 12, padding: 24, border: '1px solid rgba(16,185,129,0.15)' }}>
                {projectData?.config ? (
                  <div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: ink, marginBottom: 12, lineHeight: 1.5, maxHeight: 100, overflow: 'hidden' }}>
                      "{String(projectData.config.system_prompt || 'N/A').slice(0, 200)}..."
                    </div>
                    <div style={{ fontSize: 13, fontFamily: mono, color: copper }}>
                      Pass Rate: {(currentScore * 100).toFixed(1)}% (baseline: {baseline}%)
                    </div>
                  </div>
                ) : (
                  <div style={{ color: inkMuted }}>No results yet</div>
                )}
              </div>
            </div>
          </div>

          <div>
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>Recent Experiments</h3>
              <div style={{ background: '#FFF', borderRadius: 12, border: '1px solid rgba(26,22,20,0.08)', padding: 16, maxHeight: 320, overflow: 'auto' }}>
                {experiments.length > 0 ? (
                  experiments.slice(0, 8).map((exp, i) => (
                    <div key={exp.id || i} style={{ padding: '12px 0', borderBottom: i < 7 ? '1px solid rgba(26,22,20,0.06)' : 'none' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <div style={{ fontFamily: mono, fontSize: 11, color: inkMuted }}>
                          #{experimentCount - i} · {exp.agent_name || 'Agent'}
                        </div>
                        <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: exp.status === 'success' ? '#10B981' : '#EF4444' }}>
                          {formatDiff(exp.metric_after, exp.metric_before)}
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(26,22,20,0.7)' }}>
                        {exp.hypothesis || 'Experiment'}
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ textAlign: 'center', padding: 40, color: inkMuted }}>No experiments</div>
                )}
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 16 }}>Agent Status</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {isLive ? (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#FFF', borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: copper }}></div>
                      <div><div style={{ fontSize: 13, fontWeight: 500 }}>Explorer</div><div style={{ fontSize: 11, color: inkMuted }}>Running experiments...</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#FFF', borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10B981' }}></div>
                      <div><div style={{ fontSize: 13, fontWeight: 500 }}>Refiner</div><div style={{ fontSize: 11, color: inkMuted }}>Fine-tuning</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#FFF', borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#8B5CF6' }}></div>
                      <div><div style={{ fontSize: 13, fontWeight: 500 }}>Synthesizer</div><div style={{ fontSize: 11, color: inkMuted }}>Combining</div></div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#FFF', borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: inkMuted }}></div>
                      <div><div style={{ fontSize: 13, fontWeight: 500 }}>Explorer</div><div style={{ fontSize: 11, color: inkMuted }}>Idle</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#FFF', borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: inkMuted }}></div>
                      <div><div style={{ fontSize: 13, fontWeight: 500 }}>Refiner</div><div style={{ fontSize: 11, color: inkMuted }}>Idle</div></div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#FFF', borderRadius: 8, border: '1px solid rgba(26,22,20,0.08)' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: inkMuted }}></div>
                      <div><div style={{ fontSize: 13, fontWeight: 500 }}>Synthesizer</div><div style={{ fontSize: 11, color: inkMuted }}>Idle</div></div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section style={{ background: ink, padding: '80px 24px', textAlign: 'center' }}>
        <h2 style={{ fontFamily: serif, fontSize: 40, fontWeight: 400, color: '#FFF', marginBottom: 16 }}>Ready?</h2>
        <Link to="/login" style={{ display: 'inline-block', padding: '16px 48px', fontSize: 16, fontWeight: 600, background: '#FFF', color: ink, borderRadius: 10, textDecoration: 'none' }}>
          Start Free
        </Link>
      </section>
    </div>
  );
}
