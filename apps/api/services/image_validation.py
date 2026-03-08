"""
Validate uploaded image by magic bytes (not just Content-Type) to avoid spoofed types.
Supports JPEG, PNG, WebP.
"""

# Magic bytes for allowed image types
JPEG_SIGNATURE = b"\xff\xd8\xff"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
WEBP_RIFF = b"RIFF"
WEBP_WEBP = b"WEBP"  # at offset 8 in WebP file


def is_allowed_image_magic(data: bytes) -> bool:
    """
    Return True if data starts with a supported image signature (JPEG, PNG, WebP).
    Used to reject non-image uploads even when Content-Type is spoofed.
    """
    if not data or len(data) < 12:
        return False
    if data.startswith(JPEG_SIGNATURE):
        return True
    if data.startswith(PNG_SIGNATURE):
        return True
    if data.startswith(WEBP_RIFF) and len(data) >= 12 and data[8:12] == WEBP_WEBP:
        return True
    return False
