import json
import os
import warnings
from dotenv import load_dotenv

load_dotenv()

warnings.filterwarnings("ignore", category=FutureWarning, module="google.generativeai")
import google.generativeai as genai
from typing import Any, Optional
from pydantic import BaseModel


class Hypothesis(BaseModel):
    hypothesis: str
    mutation: str
    reasoning: str


class MockGeminiClient:
    """Mock client for testing without API key."""
    
    def __init__(self, api_key: Optional[str] = None):
        self._mock_count = 0
    
    def generate(self, prompt: str, temperature: float = 0.7) -> str:
        self._mock_count += 1
        headlines = [
            "10x Your Growth Starting Today",
            "The Platform Modern Teams Choose",
            "Ship Faster, Scale Easier",
            "Stop Wasting Time on Manual Work",
            "AI-Powered. Enterprise-Ready.",
        ]
        return headlines[self._mock_count % len(headlines)]
    
    def generate_structured(self, prompt: str, response_model: type[BaseModel], temperature: float = 0.7) -> Optional[BaseModel]:
        self._mock_count += 1
        # Return mock hypothesis based on what's being optimized
        if "landing" in prompt.lower() or "headline" in prompt.lower():
            return response_model(
                hypothesis="Testing a more urgent headline to improve conversion",
                mutation={"field": "headline", "value": f"10x Your Results Starting Today #{self._mock_count}"},
                reasoning="More urgent language typically converts better"
            )
        elif "email" in prompt.lower() or "subject" in prompt.lower():
            return response_model(
                hypothesis="Testing personalized subject line",
                mutation={"field": "subject_line", "value": f"{{{{first_name}}}}, one idea for you #{self._mock_count}"},
                reasoning="Personalization improves open rates"
            )
        elif "dcf" in prompt.lower() or "irr" in prompt.lower():
            return response_model(
                hypothesis="Testing higher exit multiple",
                mutation="exit_ev_ebitda: 16.0",
                reasoning="Comparable companies trade at higher multiples"
            )
        elif "portfolio" in prompt.lower() or "sharpe" in prompt.lower():
            return response_model(
                hypothesis="Increasing US equities allocation",
                mutation={"US_Equities": 0.45, "Bonds": 0.20, "Intl_Equities": 0.15, "Real_Estate": 0.10, "Commodities": 0.05, "Cash": 0.05},
                reasoning="Higher equity exposure for better risk-adjusted returns"
            )
        else:
            return response_model(
                hypothesis="Testing variation " + str(self._mock_count),
                mutation={"field": "test", "value": f"variation_{self._mock_count}"},
                reasoning="Exploration"
            )
    
    def evaluate(self, prompt: str) -> str:
        self._mock_count += 1
        # Return mock evaluation
        return json.dumps([
            {"email": "test", "category": "technical", "correct": True}
        ])


class GeminiClient:
    """Unified client for Gemini Flash 2.0"""
    
    def __init__(self, api_key: Optional[str] = None, mock: bool = False):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY", "")
        
        # Enable mock mode if no API key or if mock=True
        if mock or not self.api_key:
            print("⚠️  Using MOCK LLM (no API key set)")
            self._mock = True
            self._mock_client = MockGeminiClient(api_key)
            return
        
        self._mock = False
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash")
        self.judge_model = genai.GenerativeModel("gemini-2.0-flash")
    
    def generate(self, prompt: str, temperature: float = 0.7) -> str:
        """Generate text from prompt."""
        if self._mock:
            return self._mock_client.generate(prompt, temperature)
        response = self.model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=temperature,
                max_output_tokens=2048,
            )
        )
        return response.text
    
    def generate_structured(self, prompt: str, response_model: type[BaseModel], temperature: float = 0.7) -> Optional[BaseModel]:
        """Generate structured output matching a Pydantic model."""
        if self._mock:
            return self._mock_client.generate_structured(prompt, response_model, temperature)
        response_text = None
        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.types.GenerationConfig(
                    temperature=temperature,
                    max_output_tokens=2048,
                    response_mime_type="application/json",
                )
            )
            
            response_text = response.text
            text = response_text.strip()
            if "```json" in text:
                text = text[text.find("```json")+7:]
            elif "```" in text:
                text = text[text.find("```")+3:]
            if text.rstrip().endswith("```"):
                text = text[:text.rstrip().rfind("```")]
            
            data = json.loads(text.strip())
            
            if isinstance(data, list):
                if len(data) > 0:
                    data = data[0]
                else:
                    return None
            
            return response_model(**data)
        except json.JSONDecodeError as e:
            print(f"JSON decode error: {e}")
            print(f"Response text: {response_text}")
            return None
        except Exception as e:
            print(f"Generation error: {e}")
            print(f"Response text: {response_text}")
            return None
    
    def evaluate(self, prompt: str) -> str:
        """Evaluate content using the judge model (lower temperature for consistency)."""
        if self._mock:
            return self._mock_client.evaluate(prompt)
        response = self.judge_model.generate_content(
            prompt,
            generation_config=genai.types.GenerationConfig(
                temperature=0.3,  # Lower temperature for consistent judging
                max_output_tokens=1024,
            )
        )
        return response.text


def test_client() -> bool:
    """Test the Gemini client with a simple prompt."""
    try:
        client = GeminiClient()
        result = client.generate("Say 'hello' in one word")
        print(f"Test result: {result}")
        return "hello" in result.lower()
    except Exception as e:
        print(f"Client test failed: {e}")
        return False


if __name__ == "__main__":
    print("Testing Gemini client...")
    success = test_client()
    print(f"Client test: {'PASSED' if success else 'FAILED'}")
