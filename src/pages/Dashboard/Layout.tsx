import { Outlet, Link } from 'react-router-dom';
import { useAuth } from '../../lib/auth';

const font = `'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif`;
const mono = `'JetBrains Mono', monospace`;

const copper = '#C47A2A';
const ink = '#1A1614';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const inkLight = 'rgba(26, 22, 20, 0.25)';
const cream = '#FAF8F5';

export default function DashboardLayout() {
    const { signOut } = useAuth();

    return (
        <div style={{ minHeight: '100vh', background: cream, fontFamily: font, color: ink }}>
            {/* Header */}
            <header style={{ maxWidth: 700, margin: '0 auto', padding: '24px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Link to="/" style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: copper, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ color: '#FFF', fontWeight: 600, fontSize: 14 }}>F</span>
                        </div>
                        <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 500, color: '#8B5A1B', letterSpacing: -0.5 }}>forge</span>
                    </div>
                </Link>
                <nav style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
                    <Link to="/dashboard" style={{ fontSize: 13, fontWeight: 500, color: inkMuted, textDecoration: 'none' }}>Dashboard</Link>
                    <Link to="/dashboard/new" style={{ fontSize: 13, fontWeight: 500, color: inkMuted, textDecoration: 'none' }}>New Project</Link>
                    <button
                        onClick={signOut}
                        style={{ fontSize: 13, fontWeight: 500, color: inkMuted, background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                        Sign out
                    </button>
                </nav>
            </header>

            {/* Main Content */}
            <main style={{ maxWidth: 700, margin: '0 auto', padding: '48px 24px 80px' }}>
                <Outlet />
            </main>

            {/* Footer */}
            <footer style={{ borderTop: '1px solid rgba(26,22,20,0.08)', padding: '24px' }}>
                <div style={{ maxWidth: 700, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: inkLight }}>
                        2026 Forge OS. Automated Variant Optimization.
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 10, color: inkLight, textTransform: 'uppercase', letterSpacing: 1 }}>
                        <span style={{ color: '#10B981' }}>Operational</span>
                    </div>
                </div>
            </footer>
        </div>
    );
}
