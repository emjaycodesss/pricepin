"""
Supabase client with service role for admin and server-side operations.
Used only by admin router; never expose service role to the frontend.
"""
from supabase import create_client

from config import SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL

# Lazy singleton so we don't create before config is loaded
_supabase = None


def get_supabase_admin():
    """Return Supabase client with service role (bypasses RLS)."""
    global _supabase
    if _supabase is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for admin operations")
        _supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _supabase
