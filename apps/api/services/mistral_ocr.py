"""
Call Mistral OCR API (POST /v1/ocr) to extract menu items from an image.
Uses the dedicated OCR endpoint per https://docs.mistral.ai/api/endpoint/ocr
with document_annotation_format + document_annotation_prompt for structured JSON.
Returns list of dicts: category, item_name, price, description.
"""
import base64
import io
import json
import re
import time
from typing import Any

import httpx

from config import MISTRAL_API_KEY, MISTRAL_MODEL_ENV

# Max dimension and size before we resize to reduce payload
MAX_IMAGE_DIMENSION = 1536
MAX_IMAGE_BYTES_BEFORE_RESIZE = 800 * 1024
JPEG_QUALITY = 85

# OCR API: https://docs.mistral.ai/api/endpoint/ocr#operation-ocr_v1_ocr_post
# Cookbook uses mistral-ocr-latest; override with MISTRAL_MODEL in .env if needed
MISTRAL_OCR_MODEL = MISTRAL_MODEL_ENV or "mistral-ocr-latest"
MISTRAL_OCR_URL = "https://api.mistral.ai/v1/ocr"

# Prompt for structured extraction; OCR API requires document_annotation_format type "json_schema" with a schema
DOCUMENT_ANNOTATION_PROMPT = """Extract every menu item from this restaurant or café menu image.
For each item include: category (section/heading if visible, e.g. Drinks or ""), item_name, variant (e.g. Solo, With Drink, Regular, Large, Add-on, or "" if none), price as a number, and description if visible or "".
When the same dish has different prices for options (e.g. Solo vs With Drink, Regular vs Large), create one row per option and put the option name in variant.
If the image is not a menu or has no items, return items: []."""

# document_annotation_format: Mistral OCR requires json_schema (not json_object). Per docs: type, json_schema.schema, name, strict.
DOCUMENT_ANNOTATION_FORMAT = {
    "type": "json_schema",
    "json_schema": {
        "name": "menu_extraction",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "items": {
                    "type": "array",
                    "description": "List of menu items extracted from the document",
                    "items": {
                        "type": "object",
                        "properties": {
                            "category": {
                                "type": "string",
                                "description": "Section or category (e.g. Drinks, Main), or empty string",
                            },
                            "item_name": {
                                "type": "string",
                                "description": "Name of the dish or drink",
                            },
                            "variant": {
                                "type": "string",
                                "description": "Option/variant (e.g. Solo, With Drink, Regular, Large, Add-on), or empty string",
                            },
                            "price": {
                                "type": "number",
                                "description": "Price as a number (no currency symbol)",
                            },
                            "description": {
                                "type": "string",
                                "description": "Short description if visible, or empty string",
                            },
                        },
                        "required": ["item_name", "price"],
                        "additionalProperties": False,
                    },
                }
            },
            "required": ["items"],
            "additionalProperties": False,
        },
    },
}


def _normalize_item(raw: dict[str, Any]) -> dict[str, Any]:
    """Ensure each item has the expected keys and types for the API response."""
    category = raw.get("category")
    item_name = raw.get("item_name") or raw.get("name") or ""
    variant = raw.get("variant") or raw.get("variant_name") or ""
    price = raw.get("price")
    if price is not None and not isinstance(price, (int, float)):
        try:
            price = float(str(price).replace(",", "").strip())
        except (ValueError, TypeError):
            price = 0.0
    elif price is None:
        price = 0.0
    description = raw.get("description") or ""
    return {
        "category": "" if category is None else str(category).strip(),
        "item_name": str(item_name).strip(),
        "variant_name": "" if variant is None else str(variant).strip(),
        "price": float(price),
        "description": "" if description is None else str(description).strip(),
    }


def _parse_items_from_annotation(document_annotation: str | None) -> list[dict[str, Any]]:
    """Parse document_annotation JSON; expect object with 'items' array."""
    if not document_annotation or not document_annotation.strip():
        return []
    text = document_annotation.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", text)
    if match:
        text = match.group(1).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(data, dict):
        return []
    items = data.get("items")
    if not isinstance(items, list):
        return []
    return items


def _parse_items_from_pages_markdown(pages: list[Any]) -> list[dict[str, Any]]:
    """Fallback: no document_annotation; could parse pages[].markdown (not implemented for menu extraction)."""
    return []


class MistralOcrError(Exception):
    """Raised when Mistral API call fails or response is invalid."""

    pass


class MistralRateLimitError(MistralOcrError):
    """Raised when Mistral returns 429 Too Many Requests."""

    pass


def _resize_image_if_large(image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    """Resize image if it exceeds size/dimension limits."""
    try:
        from PIL import Image
    except ImportError:
        return (image_bytes, content_type)
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        w, h = img.size
        if len(image_bytes) < MAX_IMAGE_BYTES_BEFORE_RESIZE and max(w, h) <= MAX_IMAGE_DIMENSION:
            return (image_bytes, content_type)
        scale = MAX_IMAGE_DIMENSION / max(w, h)
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
        out = io.BytesIO()
        img.save(out, "JPEG", quality=JPEG_QUALITY, optimize=True)
        return (out.getvalue(), "image/jpeg")
    except Exception:
        return (image_bytes, content_type)


def extract_menu_from_image(image_bytes: bytes, content_type: str = "image/jpeg") -> list[dict[str, Any]]:
    """
    Send image to Mistral OCR API (POST /v1/ocr) and return normalized menu items.
    Uses document_annotation_format json_schema + document_annotation_prompt for structured output.
    """
    api_key = (MISTRAL_API_KEY or "").strip()
    if not api_key:
        raise MistralOcrError("MISTRAL_API_KEY is not set")

    image_bytes, content_type = _resize_image_if_large(image_bytes, content_type)
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    image_url = f"data:{content_type};base64,{b64}"

    # Request body: OCR API requires document_annotation_format with json_schema (see Mistral error "Please provide a json_schema")
    payload = {
        "model": MISTRAL_OCR_MODEL,
        "document": {
            "type": "image_url",
            "image_url": image_url,
        },
        "document_annotation_format": DOCUMENT_ANNOTATION_FORMAT,
        "document_annotation_prompt": DOCUMENT_ANNOTATION_PROMPT,
    }

    def _do_request() -> dict[str, Any]:
        with httpx.Client(timeout=90.0) as client:
            resp = client.post(
                MISTRAL_OCR_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            if resp.status_code == 429:
                retry_after = resp.headers.get("Retry-After", "60")
                try:
                    wait_secs = int(retry_after)
                except ValueError:
                    wait_secs = 60
                wait_secs = min(max(wait_secs, 30), 120)
                time.sleep(wait_secs)
                resp2 = client.post(
                    MISTRAL_OCR_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json=payload,
                )
                resp2.raise_for_status()
                return resp2.json()
            resp.raise_for_status()
            return resp.json()

    try:
        data = _do_request()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            raise MistralOcrError(
                "Mistral API key invalid or expired. Check MISTRAL_API_KEY in apps/api/.env: "
                "no quotes or extra spaces, and use a key from https://console.mistral.ai/"
            ) from e
        if e.response.status_code == 400:
            try:
                body = e.response.json()
                if isinstance(body, dict):
                    detail = (
                        body.get("message")
                        or body.get("detail")
                        or (body.get("error", {}).get("message") if isinstance(body.get("error"), dict) else None)
                        or body.get("error")
                    )
                    if not detail:
                        detail = str(body)
                else:
                    detail = str(body)
            except Exception:
                detail = (e.response.text or "Bad request")[:500]
            raise MistralOcrError(
                f"Mistral OCR rejected the request (400). Mistral says: {detail}"
            ) from e
        if e.response.status_code == 429:
            try:
                body = e.response.json()
                if isinstance(body, dict):
                    detail = (
                        body.get("message")
                        or body.get("detail")
                        or (body.get("error", {}).get("message") if isinstance(body.get("error"), dict) else None)
                        or body.get("error")
                    )
                    if not detail:
                        detail = str(body)
                else:
                    detail = str(body)
            except Exception:
                detail = (e.response.text or "No details")[:500]
            detail_lower = (detail or "").lower()
            if "rate limit" in detail_lower or "rate_limit" in detail_lower:
                msg = (
                    "Mistral rate limit exceeded. Wait about 1 minute and try again, or use a smaller image. "
                    "Check https://console.mistral.ai/limits and your tier."
                )
            else:
                msg = (
                    "Mistral returned 429. Check https://console.mistral.ai/limits and your tier. "
                    f"Model used: {MISTRAL_OCR_MODEL}. Mistral says: {detail}"
                )
            raise MistralRateLimitError(msg) from e
        raise MistralOcrError(f"Mistral API error: {e.response.status_code}") from e
    except (httpx.HTTPError, json.JSONDecodeError, KeyError) as e:
        raise MistralOcrError("Failed to call or parse Mistral OCR response") from e

    # Response: document_annotation (JSON string when document_annotation_format was set), pages, model, usage_info
    annotation = data.get("document_annotation")
    raw_list = _parse_items_from_annotation(annotation)
    if not raw_list and data.get("pages"):
        raw_list = _parse_items_from_pages_markdown(data["pages"])
    return [_normalize_item(item) for item in raw_list if isinstance(item, dict)]
