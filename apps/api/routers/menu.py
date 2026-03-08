"""
POST /process-menu: accept image file, validate Turnstile (if configured), rate limit by IP,
validate size and magic bytes, call Mistral OCR.
Returns normalized JSON (category, item_name, variant_name, price, description).
"""
from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile

from config import MISTRAL_API_KEY, TURNSTILE_SECRET
from rate_limit import limiter
from services.image_validation import is_allowed_image_magic
from services.mistral_ocr import MistralOcrError, MistralRateLimitError, extract_menu_from_image
from services.turnstile import verify_turnstile_token

router = APIRouter(prefix="/process-menu", tags=["menu"])

# Max upload size (15 MB) to avoid DoS and excessive Mistral payload
MAX_IMAGE_BYTES = 15 * 1024 * 1024


@router.post("")
@limiter.limit("10/hour")
async def process_menu(
    request: Request,
    file: UploadFile | None = File(None),
    turnstile_token: str | None = Form(None),
):
    """
    Accept image file upload; validate Turnstile (if TURNSTILE_SECRET set), rate limit, and call Mistral OCR.
    """
    if not file:
        return {"items": []}
    if not MISTRAL_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="Mistral OCR is not configured. Set MISTRAL_API_KEY in the API .env.",
        )

    # Turnstile: when secret is set and client sent a token, verify it. If no token (widget blocked or failed), allow request anyway so scanning still works.
    if (TURNSTILE_SECRET or "").strip() and (turnstile_token or "").strip():
        ok, err = verify_turnstile_token(
            (turnstile_token or "").strip(),
            remote_ip=request.client.host if request.client else None,
        )
        if not ok:
            raise HTTPException(status_code=400, detail=err or "Turnstile verification failed.")

    content_type = file.content_type or "image/jpeg"
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="File must be an image (e.g. image/jpeg, image/png).")

    image_bytes = await file.read()
    if not image_bytes:
        return {"items": []}

    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Image too large. Maximum size is {MAX_IMAGE_BYTES // (1024*1024)} MB.",
        )

    if not is_allowed_image_magic(image_bytes):
        raise HTTPException(
            status_code=400,
            detail="File is not a valid image (JPEG, PNG, or WebP). Content-Type can be spoofed; magic bytes invalid.",
        )

    try:
        items = await extract_menu_from_image(image_bytes, content_type=content_type)
    except MistralRateLimitError as e:
        raise HTTPException(status_code=429, detail=str(e)) from e
    except MistralOcrError as e:
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {"items": items}
