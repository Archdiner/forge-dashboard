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


class GeminiClient:
    """Unified client for Gemini Flash 2.0"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("GOOGLE_API_KEY", "")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required")
        
        genai.configure(api_key=self.api_key)
        self.model = genai.GenerativeModel("gemini-2.0-flash")
        self.judge_model = genai.GenerativeModel("gemini-2.0-flash")
    
    def generate(self, prompt: str, temperature: float = 0.7) -> str:
        """Generate text from prompt."""
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
