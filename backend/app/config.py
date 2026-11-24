import os
from pathlib import Path
from dotenv import load_dotenv
from typing import List, Optional

# Load .env file from the repo root or backend directory
env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if env_path.exists():
    load_dotenv(dotenv_path=env_path)
else:
    load_dotenv()

class Settings:
    def __init__(self):
        # Database URL - default sqlite:////data/app.db or local fallback
        db_url = os.getenv("DATABASE_URL", "sqlite:///./data/app.db")
        self.DATABASE_URL: str = db_url
        
        # SQLite path extraction
        # e.g., sqlite:////data/app.db or sqlite:///./data/app.db or sqlite:///app.db
        if db_url.startswith("sqlite:///"):
            self.SQLITE_PATH: str = db_url.replace("sqlite:///", "")
        else:
            self.SQLITE_PATH: str = "./data/app.db"
            
        # Keys pool comma-separated
        # e.g., LLM_API_KEYS="key_1_val,key_2_val"
        raw_keys = os.getenv("LLM_API_KEYS", "")
        self.LLM_API_KEYS: List[str] = [k.strip() for k in raw_keys.split(",") if k.strip()]
        
        # Fallback dummy keys if none provided, to ensure key pool loads properly in dev/demo
        if not self.LLM_API_KEYS:
            self.LLM_API_KEYS = ["dummy_key_1", "dummy_key_2"]
            
        # Default model
        # Support any provider model configured in LiteLLM, default gemini/gemini-2.0-flash or gpt-4o-mini
        self.DEFAULT_MODEL: str = os.getenv("LLM_MODEL", "gemini/gemini-2.0-flash")
        
        # Fallback models list if user configures different models per key
        raw_models = os.getenv("LLM_MODELS", "")
        if raw_models:
            self.LLM_MODELS: List[str] = [m.strip() for m in raw_models.split(",") if m.strip()]
        else:
            self.LLM_MODELS = [self.DEFAULT_MODEL] * len(self.LLM_API_KEYS)
            
        # Allowed CORS origins
        raw_origins = os.getenv("ALLOWED_ORIGINS", "*")
        self.ALLOWED_ORIGINS: List[str] = [o.strip() for o in raw_origins.split(",") if o.strip()]
        
        # Simulation switch
        self.ENABLE_FAILURE_SIMULATION: bool = os.getenv("ENABLE_FAILURE_SIMULATION", "false").lower() in ("true", "1", "yes")
        
        # Default system prompt
        self.DEFAULT_SYSTEM_PROMPT: str = os.getenv("DEFAULT_SYSTEM_PROMPT", "You are a helpful, concise AI assistant.")

settings = Settings()
