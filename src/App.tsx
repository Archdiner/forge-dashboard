import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import Landing from './pages/Landing';
import Login from './pages/Login';
import DashboardLayout from './pages/Dashboard/Layout';
import ProjectsList from './pages/Dashboard/ProjectsList';
import NewJob from './pages/Dashboard/NewJob';
import ProjectDetails from './pages/Dashboard/ProjectDetails';

export default function App() {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-ink flex items-center justify-center font-mono text-copper text-sm uppercase tracking-widest">
                Loading Forge...
            </div>
        );
    }

    return (
        <Routes>
            {/* Public Pages */}
            <Route path="/" element={user ? <Navigate to="/dashboard" /> : <Landing />} />
            <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />

            {/* Protected Dashboard */}
            <Route path="/dashboard" element={user ? <DashboardLayout /> : <Navigate to="/login" />}>
                <Route index element={<ProjectsList />} />
                <Route path="new" element={<NewJob />} />
                <Route path="project/:id" element={<ProjectDetails />} />
            </Route>

            <Route path="*" element={<Navigate to="/" />} />
        </Routes>
    );
}
