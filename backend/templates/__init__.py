from templates.base import BaseTemplate, Hypothesis, EvaluationResult
from templates.landing_page import LandingPageTemplate
from templates.prompt_opt import PromptOptimizationTemplate
from templates.portfolio import PortfolioOptimizationTemplate
from templates.email_outreach import EmailOutreachTemplate
from templates.dcf import DCFTemplate

TEMPLATES = {
    "landing-page-cro": LandingPageTemplate,
    "prompt-optimization": PromptOptimizationTemplate,
    "portfolio-optimization": PortfolioOptimizationTemplate,
    "email-outreach": EmailOutreachTemplate,
    "dcf-model": DCFTemplate,
}


def get_template(template_id: str) -> BaseTemplate:
    """Get template by ID."""
    template_class = TEMPLATES.get(template_id)
    if not template_class:
        raise ValueError(f"Unknown template: {template_id}")
    return template_class()
