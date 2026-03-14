#!/bin/bash

# Start All CubSoftware Services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Load secrets into environment
if [ -f "$SCRIPT_DIR/.env.secrets" ]; then
    set -a
    source "$SCRIPT_DIR/.env.secrets"
    set +a
fi

echo "Starting CubSoftware services..."

pm2 start cubsoftware.config.js

echo ""
echo "All services started!"
pm2 status
