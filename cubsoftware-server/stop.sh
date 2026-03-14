#!/bin/bash

# ============================================
# Stop All CubSoftware Services
# ============================================

echo "Stopping all CubSoftware services..."
echo ""

pm2 stop all

echo ""
echo "All services stopped."
echo ""

pm2 status
