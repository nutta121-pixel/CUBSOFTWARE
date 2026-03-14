#!/bin/bash

# ============================================
# Show Status of All CubSoftware Services
# ============================================

echo "CubSoftware Services Status"
echo "============================"
echo ""

pm2 status

echo ""
echo "Quick commands:"
echo "  ./start.sh    - Start all services"
echo "  ./stop.sh     - Stop all services"
echo "  ./restart.sh  - Restart all services"
echo "  pm2 logs      - View all logs"
echo "  pm2 monit     - Monitor dashboard"
echo ""
