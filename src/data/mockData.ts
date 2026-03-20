export interface Experiment {
  id: string;
  agentId: string;
  agentName: string;
  hypothesis: string;
  mutation: string;
  metricBefore: number;
  metricAfter: number;
  status: 'success' | 'failure' | 'running';
  reasoning: string;
  timestamp: Date;
}

export interface Agent {
  id: string;
  name: string;
  status: 'idle' | 'thinking' | 'running' | 'publishing';
  experimentsRun: number;
  improvementsFound: number;
  currentHypothesis?: string;
  lastActive: Date;
}

export interface GlobalBest {
  metric: number;
  config: Record<string, unknown>;
  experimentCount: number;
  lastUpdated: Date;
}

export const mockAgents: Agent[] = [
  {
    id: 'agent-1',
    name: 'Agent Alpha',
    status: 'idle',
    experimentsRun: 18,
    improvementsFound: 4,
    lastActive: new Date(),
  },
  {
    id: 'agent-2',
    name: 'Agent Beta',
    status: 'running',
    experimentsRun: 15,
    improvementsFound: 3,
    currentHypothesis: 'Testing whether question-format headlines improve engagement...',
    lastActive: new Date(),
  },
  {
    id: 'agent-3',
    name: 'Agent Gamma',
    status: 'thinking',
    experimentsRun: 14,
    improvementsFound: 2,
    currentHypothesis: 'Analyzing failure patterns to avoid redundant experiments...',
    lastActive: new Date(),
  },
];

export const mockExperiments: Experiment[] = [
  {
    id: 'exp-47',
    agentId: 'agent-2',
    agentName: 'Agent Beta',
    hypothesis: 'Testing whether question-format headlines improve engagement',
    mutation: 'Changed headline from "The AI Platform for Growth" to "Want to 10x your conversion rate?"',
    metricBefore: 4.2,
    metricAfter: 4.8,
    status: 'success',
    reasoning: 'Question-format headlines create curiosity gap. Based on Experiment #31 which showed urgency drives engagement.',
    timestamp: new Date(Date.now() - 2 * 60 * 1000),
  },
  {
    id: 'exp-46',
    agentId: 'agent-1',
    agentName: 'Agent Alpha',
    hypothesis: 'Testing shorter value propositions',
    mutation: 'Shortened value props from 20 words to 8 words each',
    metricBefore: 4.5,
    metricAfter: 4.2,
    status: 'failure',
    reasoning: 'Too much brevity lost key value signals. Need to find balance between conciseness and information density.',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
  },
  {
    id: 'exp-45',
    agentId: 'agent-3',
    agentName: 'Agent Gamma',
    hypothesis: 'Adding social proof with specific numbers',
    mutation: 'Added "2,847 companies improved their conversion" to social proof section',
    metricBefore: 4.1,
    metricAfter: 4.7,
    status: 'success',
    reasoning: 'Specific numbers increase credibility. Builds on Experiment #38 which showed trust signals matter.',
    timestamp: new Date(Date.now() - 8 * 60 * 1000),
  },
  {
    id: 'exp-44',
    agentId: 'agent-2',
    agentName: 'Agent Beta',
    hypothesis: 'Testing urgency in CTA button',
    mutation: 'Changed CTA from "Start Free Trial" to "Get Started Now — Limited Time"',
    metricBefore: 4.3,
    metricAfter: 4.1,
    status: 'failure',
    reasoning: 'Perceived as clickbait. Users prefer transparent offers over artificial urgency.',
    timestamp: new Date(Date.now() - 12 * 60 * 1000),
  },
  {
    id: 'exp-43',
    agentId: 'agent-1',
    agentName: 'Agent Alpha',
    hypothesis: 'Testing conversational tone in subheadline',
    mutation: 'Changed from formal to casual: "Enterprise AI made simple" → "Finally, AI that actually works for you"',
    metricBefore: 3.8,
    metricAfter: 4.5,
    status: 'success',
    reasoning: 'Conversational tone reduces friction. First-person perspective feels more approachable.',
    timestamp: new Date(Date.now() - 18 * 60 * 1000),
  },
  {
    id: 'exp-42',
    agentId: 'agent-3',
    agentName: 'Agent Gamma',
    hypothesis: 'Adding benefit-focused bullet points',
    mutation: 'Restructured value props to lead with outcomes, not features',
    metricBefore: 4.0,
    metricAfter: 3.9,
    status: 'failure',
    reasoning: 'The change was too subtle. Need more dramatic restructuring.',
    timestamp: new Date(Date.now() - 25 * 60 * 1000),
  },
  {
    id: 'exp-41',
    agentId: 'agent-2',
    agentName: 'Agent Beta',
    hypothesis: 'Testing testimonial placement above fold',
    mutation: 'Moved customer quote from bottom to immediately below hero headline',
    metricBefore: 3.5,
    metricAfter: 4.3,
    status: 'success',
    reasoning: 'Social proof early builds trust before the pitch. Based on Experiment #27 which showed trust signals convert.',
    timestamp: new Date(Date.now() - 32 * 60 * 1000),
  },
  {
    id: 'exp-40',
    agentId: 'agent-1',
    agentName: 'Agent Alpha',
    hypothesis: 'Testing single CTA vs multiple CTAs',
    mutation: 'Removed secondary CTA buttons, kept only primary "Start Free Trial"',
    metricBefore: 4.1,
    metricAfter: 3.8,
    status: 'failure',
    reasoning: 'Removing options reduced conversion. Users need to see multiple paths to take action.',
    timestamp: new Date(Date.now() - 40 * 60 * 1000),
  },
];

export const mockGlobalBest: GlobalBest = {
  metric: 5.8,
  config: {
    headline: 'Want to 10x your conversion rate?',
    subheadline: 'Finally, AI that actually works for you',
    ctaText: 'Start Free Trial',
    valueProps: [
      '10x faster experiments',
      '50% more conversions',
      'No coding required',
    ],
    socialProof: '2,847 companies improved their conversion',
    tone: 'conversational',
  },
  experimentCount: 47,
  lastUpdated: new Date(),
};

export const mockOptimizationCurve = [
  { experiment: 1, metric: 3.2 },
  { experiment: 5, metric: 3.4 },
  { experiment: 10, metric: 3.5 },
  { experiment: 15, metric: 3.8 },
  { experiment: 20, metric: 4.0 },
  { experiment: 25, metric: 4.2 },
  { experiment: 30, metric: 4.3 },
  { experiment: 35, metric: 4.5 },
  { experiment: 40, metric: 4.7 },
  { experiment: 45, metric: 5.2 },
  { experiment: 47, metric: 5.8 },
];

export const mockCostTracker = {
  totalExperiments: 47,
  totalCost: 0.03,
  llmCost: 0.025,
  computeCost: 0.005,
};
