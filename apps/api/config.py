"""
Load settings from environment. Used by main app and routers.
"""
import os
from dotenv import load_dotenv

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET", "")
