#!/bin/bash

# Restart All CubSoftware Services

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Restarting CubSoftware services..."

pm2 restart cubsoftware.config.js

echo ""
echo "All services restarted!"
pm2 status
