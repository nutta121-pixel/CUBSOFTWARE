#!/bin/bash

# ======================================================================
#                         CUB SOFTWARE
#                    PM2 Process Manager
# ======================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}======================================================================"
echo "                        CUB SOFTWARE"
echo "                   PM2 Process Manager"
echo "======================================================================${NC}"
echo ""

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if PM2 is installed
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}[INFO] PM2 is not installed. Installing globally...${NC}"
    npm install -g pm2
    if [ $? -ne 0 ]; then
        echo -e "${RED}[ERROR] Failed to install PM2${NC}"
        exit 1
    fi
fi

# Create logs directory if it doesn't exist
mkdir -p logs

# Check if first argument is provided
case "$1" in
    start)
        echo -e "${GREEN}[INFO] Starting all services with PM2...${NC}"
        pm2 start ecosystem.config.js
        pm2 save
        ;;
    stop)
        echo -e "${YELLOW}[INFO] Stopping all services...${NC}"
        pm2 stop all
        ;;
    restart)
        echo -e "${YELLOW}[INFO] Restarting all services...${NC}"
        pm2 restart all
        ;;
    status)
        pm2 status
        ;;
    logs)
        if [ -n "$2" ]; then
            pm2 logs "$2"
        else
            pm2 logs
        fi
        ;;
    monit)
        pm2 monit
        ;;
    setup-startup)
        echo -e "${GREEN}[INFO] Setting up PM2 startup script...${NC}"
        pm2 startup
        pm2 save
        echo -e "${GREEN}[INFO] PM2 will now start automatically on boot${NC}"
        ;;
    *)
        echo -e "${GREEN}[INFO] Starting all services with PM2...${NC}"
        pm2 start ecosystem.config.js
        echo ""
        echo -e "${BLUE}======================================================================"
        echo "                    PM2 Commands Reference"
        echo "======================================================================${NC}"
        echo ""
        echo "  ./pm2-start.sh start        - Start all services"
        echo "  ./pm2-start.sh stop         - Stop all services"
        echo "  ./pm2-start.sh restart      - Restart all services"
        echo "  ./pm2-start.sh status       - View process status"
        echo "  ./pm2-start.sh logs         - View all logs"
        echo "  ./pm2-start.sh logs <app>   - View specific app logs"
        echo "  ./pm2-start.sh monit        - Open monitoring dashboard"
        echo "  ./pm2-start.sh setup-startup - Configure auto-start on boot"
        echo ""
        echo "  Direct PM2 commands:"
        echo "  pm2 save                    - Save process list"
        echo "  pm2 delete all              - Remove all apps from PM2"
        echo ""
        echo -e "${BLUE}======================================================================${NC}"
        ;;
esac
