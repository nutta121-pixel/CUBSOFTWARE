#!/bin/bash
# LibreTranslate — self-hosted translation engine for CUB SOFTWARE
# Completely free, unlimited, runs locally. No API keys or accounts needed.
#
# First run downloads language models (~100-400MB each).
# Control which languages are loaded via LIBRETRANSLATE_LOAD_ONLY in .env
# e.g. LIBRETRANSLATE_LOAD_ONLY=en,es,fr,de,ja
# Defaults to a broad set covering the most-used languages.

set -e
cd "$(dirname "$0")"

LOAD_ONLY="${LIBRETRANSLATE_LOAD_ONLY:-en,es,fr,de,it,pt,ru,ja,zh,ko,ar,nl,pl,tr,sv,da,el,cs,uk,hi,th,vi,id,he,fi,hu,ro,bg,sk,sl}"
PORT="${LIBRETRANSLATE_PORT:-5050}"

# Create venv on first run
if [ ! -d "venv" ]; then
    echo "[LibreTranslate] Creating virtual environment..."
    python3 -m venv venv
fi

# Install/upgrade LibreTranslate if needed
if ! ./venv/bin/python3 -c "import libretranslate" 2>/dev/null; then
    echo "[LibreTranslate] Installing LibreTranslate (this takes a moment)..."
    ./venv/bin/pip install --quiet --upgrade pip
    ./venv/bin/pip install --quiet libretranslate
fi

echo "[LibreTranslate] Starting on 127.0.0.1:${PORT} — loading: ${LOAD_ONLY}"
exec ./venv/bin/libretranslate \
    --host 127.0.0.1 \
    --port "$PORT" \
    --load-only "$LOAD_ONLY" \
    --disable-files-translation \
    --disable-web-ui
