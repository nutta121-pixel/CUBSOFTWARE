#!/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Create venv if it doesn't exist
if [ ! -d "$DIR/venv" ]; then
    python3 -m venv "$DIR/venv"
fi

# Install/update requirements
"$DIR/venv/bin/pip" install -r "$DIR/requirements.txt" --quiet

# Run the bot
exec "$DIR/venv/bin/python3" "$DIR/log_patch.py"
