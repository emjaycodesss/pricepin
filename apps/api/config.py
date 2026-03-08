"""
Load settings from environment. Used by main app and routers.
Loads apps/api/.env first, then repo root .env so root-level vars (e.g. TURNSTILE_SECRET) are picked up.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# Load API dir .env first, then root .env (root = monorepo parent of apps/)
load_dotenv()  # cwd when running from apps/api
_root_env = Path(__file__).resolve().parent.parent.parent / ".env"
if _root_env.exists():
    load_dotenv(_root_env)

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
MISTRAL_API_KEY = os.getenv("MISTRAL_API_KEY", "")
# Optional: override OCR model (default: CX-9 per Mistral OCR API docs). Set MISTRAL_MODEL in .env if your tier uses a different ID.
MISTRAL_MODEL_ENV = os.getenv("MISTRAL_MODEL", "").strip()
TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET", "")

# Admin: token validated server-side; never put in frontend bundle. Set ADMIN_TOKEN in API .env.
ADMIN_TOKEN = (os.getenv("ADMIN_TOKEN", "") or "").strip()

# CORS: comma-separated origins for production (e.g. https://your-app.vercel.app). Default localhost for dev.
_CORS_ORIGINS_STR = os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").strip()
CORS_ORIGINS = [o.strip() for o in _CORS_ORIGINS_STR.split(",") if o.strip()]
