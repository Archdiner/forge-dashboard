import os
from typing import Optional
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()


class Settings(BaseModel):
    google_api_key: str = ""
    forge_api_url: str = "http://localhost:8000"
    agent_id: str = "agent-1"
    agent_name: str = "Agent Alpha"
    template_id: str = "landing-page-cro"
    project_id: str = ""
    experiment_delay: float = 3.0  # seconds between experiments
    max_experiments: int = 50  # hard cap - never exceed this
    checkpoint_every: int = 10  # pause every N experiments for user review
    plateau_patience: int = 15  # stop if no improvement in this many attempts
    improvement_threshold: float = 0.01  # minimum improvement to count as success
    max_retries: int = 3
    retry_delay: float = 1.0
    
    class Config:
        extra = "allow"


def load_settings() -> Settings:
    """Load settings from environment variables with defaults."""
    return Settings(
        google_api_key=os.getenv("GOOGLE_API_KEY", ""),
        forge_api_url=os.getenv("FORGE_API_URL", "http://localhost:8000"),
        agent_id=os.getenv("AGENT_ID", "agent-1"),
        agent_name=os.getenv("AGENT_NAME", "Agent Alpha"),
        template_id=os.getenv("TEMPLATE_ID", "landing-page-cro"),
        experiment_delay=float(os.getenv("EXPERIMENT_DELAY", "3.0")),
        max_experiments=int(os.getenv("MAX_EXPERIMENTS", "50")),
        plateau_patience=int(os.getenv("PLATEAU_PATIENCE", "15")),
        improvement_threshold=float(os.getenv("IMPROVEMENT_THRESHOLD", "0.01")),
        max_retries=int(os.getenv("MAX_RETRIES", "3")),
        retry_delay=float(os.getenv("RETRY_DELAY", "1.0")),
    )


settings = load_settings()
