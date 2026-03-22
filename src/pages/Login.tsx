import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';

const font = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono = `'JetBrains Mono', monospace`;
const serif = `'Instrument Serif', Georgia, serif`;

const copper = '#C47A2A';
const ink = '#1A1614';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const inkLight = 'rgba(26, 22, 20, 0.25)';
const cream = '#FAF8F5';

export default function Login() {
    const { user } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSignUp, setIsSignUp] = useState(false);

    if (user) {
        return <div style={{ 
            minHeight: '100vh', 
            background: cream, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            fontFamily: font,
            color: ink
        }}>
            <Link to="/dashboard" style={{ color: copper, textDecoration: 'none' }}>Go to Dashboard</Link>
        </div>;
    }

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isSignUp) {
                const { error: signUpErr } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: window.location.origin + '/dashboard'
                    }
                });
                if (signUpErr) throw signUpErr;
                setError("Check your email for the confirmation link.");
            } else {
                const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
                if (signInErr) throw signInErr;
            }
        } catch (err: unknown) {
            const errMessage = err instanceof Error ? err.message : 'An error occurred';
            setError(errMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ minHeight: '100vh', background: cream, fontFamily: font, color: ink }}>
            {/* Ambient Glow */}
            <div style={{ position: 'fixed', top: -200, right: -100, width: 500, height: 500, background: 'radial-gradient(circle, rgba(196,122,42,0.06) 0%, transparent 70%)', pointerEvents: 'none' }}></div>

            <div style={{ maxWidth: 400, margin: '0 auto', padding: '80px 24px', position: 'relative', zIndex: 10 }}>
                {/* Logo */}
                <div style={{ textAlign: 'center', marginBottom: 40 }}>
                    <Link to="/" style={{ textDecoration: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
                            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ display: 'block' }}>
                                <polygon points="16,1 31,16 16,31 1,16" fill="#1A1614" />
                                <polygon points="16,8 24,16 16,24 8,16" fill="#C47A2A" />
                            </svg>
                            <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 600, color: ink, letterSpacing: '-0.03em' }}>forge</span>
                        </div>
                    </Link>
                    
                    <h1 style={{ fontFamily: serif, fontSize: 36, fontWeight: 400, marginBottom: 8 }}>
                        {isSignUp ? 'Create account' : 'Welcome back'}
                    </h1>
                    <p style={{ fontSize: 14, color: inkMuted }}>
                        {isSignUp ? 'Join the optimization revolution.' : 'Sign in to start optimizing.'}
                    </p>
                </div>

                {/* Form Card */}
                <div style={{ background: '#FFF', border: '1px solid rgba(26,22,20,0.08)', borderRadius: 12, padding: 32 }}>
                    <form onSubmit={handleAuth}>
                        {error && (
                            <div style={{ 
                                padding: '12px 16px', 
                                borderRadius: 6, 
                                fontSize: 13,
                                marginBottom: 20,
                                background: error.includes('confirmation') ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                                border: `1px solid ${error.includes('confirmation') ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}`,
                                color: error.includes('confirmation') ? '#10B981' : '#EF4444',
                            }}>
                                {error}
                            </div>
                        )}

                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, display: 'block', marginBottom: 8 }}>
                                Email
                            </label>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    fontSize: 15,
                                    fontFamily: font,
                                    border: '1px solid rgba(26,22,20,0.1)',
                                    borderRadius: 8,
                                    background: cream,
                                    color: ink,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                }}
                                required
                            />
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <label style={{ fontSize: 11, fontWeight: 500, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1.5, display: 'block', marginBottom: 8 }}>
                                Password
                            </label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '12px 14px',
                                    fontSize: 15,
                                    fontFamily: font,
                                    border: '1px solid rgba(26,22,20,0.1)',
                                    borderRadius: 8,
                                    background: cream,
                                    color: ink,
                                    outline: 'none',
                                    boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                }}
                                required
                                minLength={6}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                width: '100%',
                                padding: '14px',
                                fontSize: 15,
                                fontWeight: 600,
                                fontFamily: font,
                                background: ink,
                                color: '#FFF',
                                border: 'none',
                                borderRadius: 8,
                                cursor: loading ? 'not-allowed' : 'pointer',
                                opacity: loading ? 0.6 : 1,
                                transition: 'background 0.2s',
                            }}
                        >
                            {loading ? 'Authenticating...' : (isSignUp ? 'Create Account' : 'Sign In')}
                        </button>
                    </form>

                    <div style={{ marginTop: 24, textAlign: 'center', paddingTop: 24, borderTop: '1px solid rgba(26,22,20,0.06)' }}>
                        <button
                            type="button"
                            onClick={() => { setIsSignUp(!isSignUp); setError(null); }}
                            style={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: inkMuted,
                                background: 'none',
                                border: 'none',
                                cursor: 'pointer',
                            }}
                        >
                            {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Footer Status */}
            <div style={{ textAlign: 'center', padding: 24, position: 'relative', zIndex: 10 }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: inkLight, textTransform: 'uppercase', letterSpacing: 1 }}>
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10B981', marginRight: 6 }}></span>
                    Status: Operational
                </div>
            </div>
        </div>
    );
}
