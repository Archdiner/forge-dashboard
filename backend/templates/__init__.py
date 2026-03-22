from templates.base import BaseTemplate, Hypothesis, EvaluationResult
from templates.landing_page import LandingPageTemplate
from templates.structural import StructuralTemplate
from templates.onboarding import OnboardingTemplate
from templates.pricing_page import PricingPageTemplate
from templates.feature_announcement import FeatureAnnouncementTemplate

TEMPLATES = {
    "landing-page-cro":     LandingPageTemplate,
    "structural":           StructuralTemplate,
    "onboarding":           OnboardingTemplate,
    "pricing-page":         PricingPageTemplate,
    "feature-announcement": FeatureAnnouncementTemplate,
}


def get_template(template_id: str) -> BaseTemplate:
    """Get template by ID."""
    template_class = TEMPLATES.get(template_id)
    if not template_class:
        raise ValueError(f"Unknown template: {template_id}")
    return template_class()
