"""
Cloudflare Turnstile server-side verification.
POST https://challenges.cloudflare.com/turnstile/v0/siteverify with secret + response token.
"""
import httpx

from config import TURNSTILE_SECRET

TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def verify_turnstile_token(token: str, remote_ip: str | None = None) -> tuple[bool, str | None]:
    """
    Verify Turnstile token with Cloudflare. Returns (success, error_message).
    If TURNSTILE_SECRET is empty, returns (True, None) so dev without Turnstile works.
    """
    if not (TURNSTILE_SECRET or "").strip():
        return (True, None)
    if not (token or "").strip():
        return (False, "Turnstile token required.")
    payload = {"secret": TURNSTILE_SECRET.strip(), "response": token.strip()}
    if remote_ip:
        payload["remoteip"] = remote_ip
    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(TURNSTILE_VERIFY_URL, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as e:
        return (False, "Turnstile verification failed.")
    if not data.get("success"):
        errors = data.get("error-codes", [])
        return (False, errors[0] if errors else "Turnstile verification failed.")
    return (True, None)
