import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface ForgeFlagConfig {
  flagKey: string;
  defaultConfig: Record<string, unknown>;
  isLoading: boolean;
  config: Record<string, unknown>;
  variant: 'control' | 'variant' | 'default';
  getBool: (key: string, fallback?: boolean) => boolean;
  getString: (key: string, fallback?: string) => string;
  getNumber: (key: string, fallback?: number) => number;
  getArray: <T = unknown>(key: string, fallback?: T[]) => T[];
  reload: () => void;
}

interface ForgeFlagContextValue extends ForgeFlagConfig {
  children?: ReactNode;
}

const ForgeFlagContext = createContext<ForgeFlagContextValue | null>(null);

interface ForgeFlagProviderProps {
  children: ReactNode;
  flagKey: string;
  defaultConfig?: Record<string, unknown>;
  posthogApiKey?: string;
  posthogHost?: string;
}

interface PostHogWindow {
  posthog?: {
    init: (token: string, options?: Record<string, unknown>) => void;
    getFeatureFlag: (key: string) => string | boolean | undefined;
    getFeatureFlagPayload: <T = Record<string, unknown>>(key: string) => T | undefined;
    isFeatureEnabled: (key: string) => boolean | undefined;
    onFeatureFlags: (callback: (flags: string[], any: unknown) => void) => void;
    reloadFeatureFlags: () => void;
  };
}

declare global {
  interface Window extends PostHogWindow {}
}

export function ForgeFlagProvider({
  children,
  flagKey,
  defaultConfig = {},
  posthogApiKey,
  posthogHost = 'https://us.i.posthog.com',
}: ForgeFlagProviderProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [config, setConfig] = useState<Record<string, unknown>>(defaultConfig);
  const [variant, setVariant] = useState<'control' | 'variant' | 'default'>('default');
  const [posthogReady, setPostHogReady] = useState(false);

  // Initialize PostHog if API key provided
  useEffect(() => {
    if (posthogApiKey && typeof window !== 'undefined') {
      if (!window.posthog) {
        // Load PostHog script
        const script = document.createElement('script');
        script.innerHTML = `
          !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group identify setPersonProperties setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags resetGroups onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
        `;
        document.head.appendChild(script);
      }

      // Initialize PostHog
      window.posthog?.init(posthogApiKey, {
        api_host: posthogHost,
        autocapture: false,
        capture_pageview: false,
        bootstrap: {
          featureFlags: [],
        },
      });

      // Wait for feature flags to load
      const checkFlags = () => {
        if (window.posthog?.getFeatureFlag) {
          setPostHogReady(true);
        } else {
          setTimeout(checkFlags, 100);
        }
      };
      checkFlags();
    } else {
      // No API key - use default config
      setIsLoading(false);
    }
  }, [posthogApiKey, posthogHost]);

  // Load flag payload when PostHog is ready
  useEffect(() => {
    if (!posthogReady || !window.posthog) {
      return;
    }

    const loadFlag = () => {
      try {
        // Get the feature flag payload
        const payload = window.posthog?.getFeatureFlagPayload<Record<string, unknown>>(flagKey);
        
        if (payload) {
          setConfig(payload);
          // Determine variant
          const flagValue = window.posthog?.getFeatureFlag(flagKey);
          if (flagValue === 'variant') {
            setVariant('variant');
          } else if (flagValue === 'control') {
            setVariant('control');
          } else {
            setVariant('default');
          }
        } else {
          // Fall back to default config
          setConfig(defaultConfig);
          setVariant('default');
        }
      } catch (error) {
        console.error('Error loading Forge flag:', error);
        setConfig(defaultConfig);
        setVariant('default');
      }
      
      setIsLoading(false);
    };

    // Initial load
    loadFlag();

    // Listen for flag changes
    window.posthog?.onFeatureFlags(() => {
      loadFlag();
    });
  }, [posthogReady, flagKey, defaultConfig]);

  const reload = () => {
    setIsLoading(true);
    window.posthog?.reloadFeatureFlags();
    // Re-check after a short delay
    setTimeout(() => {
      const payload = window.posthog?.getFeatureFlagPayload<Record<string, unknown>>(flagKey);
      if (payload) {
        setConfig(payload);
      } else {
        setConfig(defaultConfig);
      }
      setIsLoading(false);
    }, 500);
  };

  const getBool = (key: string, fallback = false): boolean => {
    const value = config[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value.toLowerCase() === 'true';
    if (typeof value === 'number') return value !== 0;
    return fallback;
  };

  const getString = (key: string, fallback = ''): string => {
    const value = config[key];
    if (typeof value === 'string') return value;
    return fallback;
  };

  const getNumber = (key: string, fallback = 0): number => {
    const value = config[key];
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      const parsed = parseFloat(value);
      if (!isNaN(parsed)) return parsed;
    }
    return fallback;
  };

  const getArray = <T = unknown>(key: string, fallback: T[] = []): T[] => {
    const value = config[key];
    if (Array.isArray(value)) return value as T[];
    return fallback;
  };

  const contextValue: ForgeFlagContextValue = {
    flagKey,
    defaultConfig,
    isLoading,
    config,
    variant,
    getBool,
    getString,
    getNumber,
    getArray,
    reload,
  };

  return (
    <ForgeFlagContext.Provider value={contextValue}>
      {children}
    </ForgeFlagContext.Provider>
  );
}

export function useForgeFlag(): ForgeFlagContextValue {
  const context = useContext(ForgeFlagContext);
  
  if (!context) {
    // Return default values if not wrapped in provider
    return {
      flagKey: '',
      defaultConfig: {},
      isLoading: false,
      config: {},
      variant: 'default',
      getBool: () => false,
      getString: () => '',
      getNumber: () => 0,
      getArray: () => [],
      reload: () => {},
    };
  }
  
  return context;
}

// Hook for checking specific conditions
export function useForgeVariant() {
  const { variant, isLoading } = useForgeFlag();
  
  return {
    isControl: variant === 'control',
    isVariant: variant === 'variant',
    isDefault: variant === 'default',
    isLoading,
    isExperiment: variant === 'control' || variant === 'variant',
  };
}

// Higher-order component for class components (legacy)
export function withForgeFlag<P extends object>(
  _flagKey: string,
  _defaultConfig?: Record<string, unknown>
) {
  return function withFlag(Component: React.ComponentType<P>) {
    return function WrappedComponent(props: Omit<P, 'forgeFlag'>) {
      const forgeFlag = useForgeFlag();
      return <Component {...(props as P)} forgeFlag={forgeFlag} />;
    };
  };
}

// Pre-built config templates
export const FORGE_CONFIG_TEMPLATES = {
  'landing-page': {
    sections_order: ['hero', 'features', 'testimonials', 'pricing', 'cta'],
    hero_style: 'left-aligned',
    hero_headline: 'The AI Platform for Growth',
    hero_subheadline: 'Enterprise-grade AI tools for modern teams',
    show_pricing: true,
    show_testimonials: true,
    pricing_position: 'bottom',
    cta_text: 'Start Free Trial',
    cta_style: 'primary',
    value_prop_count: 3,
    social_proof_style: 'logos',
  },
  'onboarding': {
    steps_order: ['welcome', 'profile', 'team', 'first_action'],
    step_fields: {
      welcome: ['email', 'password'],
      profile: ['name', 'role', 'company_name'],
      team: ['team_size', 'use_case'],
      first_action: ['action_type', 'action_detail'],
    },
    show_progress_bar: true,
    show_skip_option: false,
    tooltip_enabled: true,
    helper_text_enabled: true,
    required_fields_only: true,
  },
  'feature': {
    feature_enabled: true,
    feature_position: 'sidebar',
    default_view: 'expanded',
    show_badge: true,
    badge_text: 'New',
    show_tooltip: true,
    tooltip_content: 'Check out this feature',
    auto_show_delay: 5000,
    dismissible: true,
  },
  'pricing': {
    plans_order: ['free', 'pro', 'enterprise'],
    default_plan: 'pro',
    show_annual: true,
    show_monthly: true,
    annual_default: true,
    highlighted_plan: 'pro',
    show_comparison: true,
    cta_text: {
      free: 'Get Started',
      pro: 'Start Free Trial',
      enterprise: 'Contact Sales',
    },
    features_list_length: 5,
  },
};

export default ForgeFlagProvider;
