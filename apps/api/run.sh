#!/usr/bin/env bash
# Run the API with reload, excluding .venv so changes in site-packages don't trigger restarts.
# Usage: from apps/api: ./run.sh   or: bash run.sh
set -e
cd "$(dirname "$0")"
. .venv/bin/activate
exec uvicorn main:app --reload --host 0.0.0.0 --reload-exclude '.venv/*' --reload-exclude '.venv/*/*'
