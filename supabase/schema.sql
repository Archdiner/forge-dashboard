-- FORGE Database Schema for Supabase
-- Copy this into Supabase SQL Editor to set up your database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (extends Supabase auth.users)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Projects table - user's optimization projects
CREATE TABLE public.projects (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    template_id TEXT NOT NULL,  -- 'landing-page-cro', 'prompt-optimization', 'portfolio-optimization'
    description TEXT,
    config JSONB DEFAULT '{}',   -- Template-specific config
    status TEXT DEFAULT 'active', -- 'active', 'paused', 'completed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Experiments table - individual experiments run for a project
CREATE TABLE public.experiments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    agent_id TEXT,
    agent_name TEXT,
    hypothesis TEXT NOT NULL,
    mutation TEXT NOT NULL,
    metric_before REAL DEFAULT 0,
    metric_after REAL DEFAULT 0,
    status TEXT DEFAULT 'pending', -- 'pending', 'claimed', 'running', 'success', 'failure', 'reverted'
    reasoning TEXT,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Global best - best configuration found for a project
CREATE TABLE public.global_best (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID UNIQUE NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    metric REAL DEFAULT 0,
    config JSONB DEFAULT '{}',
    experiment_count INTEGER DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agents table - track agents running experiments
CREATE TABLE public.agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'idle', -- 'idle', 'thinking', 'running', 'publishing'
    experiments_run INTEGER DEFAULT 0,
    improvements_found INTEGER DEFAULT 0,
    current_hypothesis TEXT,
    last_active TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_projects_user_id ON public.projects(user_id);
CREATE INDEX idx_experiments_project_id ON public.experiments(project_id);
CREATE INDEX idx_experiments_status ON public.experiments(status);
CREATE INDEX idx_global_best_project_id ON public.global_best(project_id);
CREATE INDEX idx_agents_project_id ON public.agents(project_id);

-- Row Level Security (RLS) - Enable security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_best ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;

-- FOR DEVELOPMENT ONLY: Allow anonymous access (remove for production!)
-- This lets the demo work without full auth setup
CREATE POLICY "Allow all for development - projects" ON public.projects
    FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all for development - profiles" ON public.profiles
    FOR ALL USING (true) WITH CHECK (true);

-- RLS Policies

-- Profiles: Users can only see/edit their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Projects: Users can only see/edit their own projects
CREATE POLICY "Users can view own projects" ON public.projects
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create projects" ON public.projects
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON public.projects
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON public.projects
    FOR DELETE USING (auth.uid() = user_id);

-- Experiments: Users can only see experiments from their projects
CREATE POLICY "Users can view own experiments" ON public.experiments
    FOR SELECT USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );
CREATE POLICY "Users can create experiments" ON public.experiments
    FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );
CREATE POLICY "Users can update own experiments" ON public.experiments
    FOR UPDATE USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );

-- Global best: Users can only see from their projects
CREATE POLICY "Users can view own global best" ON public.global_best
    FOR SELECT USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );
CREATE POLICY "Users can update own global best" ON public.global_best
    FOR UPDATE USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );
CREATE POLICY "Users can insert own global best" ON public.global_best
    FOR INSERT WITH CHECK (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );

-- Agents: Users can only see from their projects
CREATE POLICY "Users can view own agents" ON public.agents
    FOR SELECT USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );
CREATE POLICY "Users can update own agents" ON public.agents
    FOR UPDATE USING (
        project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    );

-- Function to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update project timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_projects_updated_at
    BEFORE UPDATE ON public.projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
