"""
PricePin FastAPI app. CORS for frontend; routers for /process-menu, /admin.

Run (from apps/api with venv active):
  uvicorn main:app --reload --host 0.0.0.0 --reload-exclude '.venv/*' --reload-exclude '.venv/*/*'
Or: ./run.sh
Excluding .venv prevents WatchFiles from reloading on site-packages changes.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from config import CORS_ORIGINS
from rate_limit import limiter

app = FastAPI(title="PricePin API", version="0.1.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security-related response headers (X-Content-Type-Options, X-Frame-Options)."""

    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        return response


# Security headers first (outer), then CORS
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    """Root path for monitors (UptimeRobot often uses HEAD)."""
    return {"status": "ok", "health": "/health"}


@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    """Health check for Render / load balancers and UptimeRobot."""
    return {"status": "ok"}


from routers import admin, menu
app.include_router(menu.router)
app.include_router(admin.router)
