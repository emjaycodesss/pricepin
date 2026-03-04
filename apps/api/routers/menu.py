"""
POST /process-menu: accept image (file or storage path), validate Turnstile, rate limit by IP, call Mistral OCR.
Returns normalized JSON (category, item_name, variant_name, price, description).
"""
from fastapi import APIRouter

router = APIRouter(prefix="/process-menu", tags=["menu"])


@router.post("")
def process_menu():
    """Stub: Phase 2 will add image handling, Mistral OCR, and Storage upload."""
    return {"items": [], "message": "Not implemented yet"}
