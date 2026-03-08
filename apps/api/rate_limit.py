"""
IP-based rate limiter for /process-menu (protect Mistral budget).
Uses slowapi; key is client IP (X-Forwarded-For when behind proxy).
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
