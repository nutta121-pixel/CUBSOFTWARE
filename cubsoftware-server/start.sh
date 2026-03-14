#!/bin/bash

# Start All CubSoftware Services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Starting CubSoftware services..."

pm2 start cubsoftware.config.js

echo ""
echo "All services started!"
pm2 status
