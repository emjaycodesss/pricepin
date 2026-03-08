"""
FastAPI dependencies: admin auth (X-Admin-Token header).
"""
from fastapi import Header, HTTPException

from config import ADMIN_TOKEN


def require_admin_token(x_admin_token: str | None = Header(None, alias="X-Admin-Token")):
    """Validate admin token from header; raise 401 if missing or wrong."""
    if not ADMIN_TOKEN:
        raise HTTPException(
            status_code=503,
            detail="Admin is not configured. Set ADMIN_TOKEN in the API .env.",
        )
    if not x_admin_token or (x_admin_token.strip() != ADMIN_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid or missing admin token.")
    return x_admin_token.strip()
