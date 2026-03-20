import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

const mono = `'JetBrains Mono', monospace`;
const serif = `'Instrument Serif', Georgia, serif`;

const copper = '#C47A2A';
const inkMuted = 'rgba(26, 22, 20, 0.4)';
const cream = '#FAF8F5';

export default function ProjectsList() {
    const { user } = useAuth();
    const [projects, setProjects] = useState<{ id: string; name: string; description: string; template_id: string; status: string; created_at: string }[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadProjects() {
            if (!user) return;

            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .order('created_at', { ascending: false });

            if (!error && data) {
                setProjects(data);
            }
            setLoading(false);
        }

        loadProjects();
    }, [user]);

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: copper, textTransform: 'uppercase', letterSpacing: 1 }}>
                    Loading...
                </div>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div style={{ textAlign: 'center', padding: '80px 0' }}>
                <h2 style={{ fontFamily: serif, fontSize: 36, fontWeight: 400, marginBottom: 16 }}>
                    No projects yet
                </h2>
                <p style={{ fontSize: 15, color: inkMuted, marginBottom: 32, maxWidth: 400, margin: '0 auto 32px' }}>
                    Create your first optimization project. FORGE will evaluate thousands of variants while you sleep.
                </p>
                <Link
                    to="/dashboard/new"
                    style={{
                        display: 'inline-block',
                        fontFamily: serif,
                        fontSize: 20,
                        fontStyle: 'italic',
                        color: copper,
                        textDecoration: 'none',
                        borderBottom: `2px solid ${copper}`,
                        paddingBottom: 4,
                    }}
                >
                    Start a new project
                </Link>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32, paddingBottom: 16, borderBottom: '1px solid rgba(26,22,20,0.08)' }}>
                <h1 style={{ fontFamily: serif, fontSize: 36, fontWeight: 400, margin: 0 }}>
                    Your Projects
                </h1>
                <Link
                    to="/dashboard/new"
                    style={{ fontSize: 13, fontWeight: 500, color: copper, textDecoration: 'none' }}
                >
                    + New project
                </Link>
            </div>

            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 16, paddingBottom: 12, borderBottom: '1px solid rgba(26,22,20,0.08)', marginBottom: 8 }}>
                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Project</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Type</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1 }}>Status</div>
                <div style={{ fontFamily: mono, fontSize: 10, color: inkMuted, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>Created</div>
            </div>

            {/* Rows */}
            {projects.map(project => (
                <Link
                    key={project.id}
                    to={`/dashboard/project/${project.id}`}
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '2fr 1fr 1fr 1fr',
                        gap: 16,
                        padding: '20px 0',
                        borderBottom: '1px solid rgba(26,22,20,0.05)',
                        textDecoration: 'none',
                        color: 'inherit',
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = cream; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                    <div>
                        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{project.name}</div>
                        <div style={{ fontSize: 13, color: inkMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                            {project.description}
                        </div>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: inkMuted, paddingTop: 8 }}>
                        {project.template_id}
                    </div>
                    <div style={{ paddingTop: 8 }}>
                        <span style={{ 
                            fontFamily: mono, 
                            fontSize: 11, 
                            textTransform: 'uppercase', 
                            letterSpacing: 0.5,
                            color: project.status === 'active' ? '#10B981' : inkMuted 
                        }}>
                            {project.status === 'active' && (
                                <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#10B981', marginRight: 6 }}></span>
                            )}
                            {project.status}
                        </span>
                    </div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: inkMuted, textAlign: 'right', paddingTop: 8 }}>
                        {new Date(project.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </div>
                </Link>
            ))}
        </div>
    );
}
