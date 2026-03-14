#!/bin/bash

# ============================================
# CubSoftware Server Setup Script
# Run this once to set up the server
# ============================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}   CubSoftware Server Setup Script     ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ============================================
# Check Prerequisites
# ============================================
echo -e "${YELLOW}Checking prerequisites...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "${RED}Node.js is not installed. Please install Node.js 18+ first.${NC}"
    exit 1
fi
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
echo -e "${GREEN}Node.js installed: $(node -v)${NC}"

# Check npm
if ! command -v npm &> /dev/null; then
    echo -e "${RED}npm is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}npm installed: $(npm -v)${NC}"

# Check Python
if ! command -v python3 &> /dev/null; then
    echo -e "${RED}Python 3 is not installed. Please install Python 3.8+ first.${NC}"
    exit 1
fi
echo -e "${GREEN}Python installed: $(python3 --version)${NC}"

# Check pip
if ! command -v pip3 &> /dev/null; then
    echo -e "${RED}pip3 is not installed.${NC}"
    exit 1
fi
echo -e "${GREEN}pip3 installed: $(pip3 --version)${NC}"

# Install PM2 globally if not present
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}Installing PM2 globally...${NC}"
    sudo npm install -g pm2
fi
echo -e "${GREEN}PM2 installed: $(pm2 -v)${NC}"

# Install 'serve' for static file serving
if ! command -v serve &> /dev/null; then
    echo -e "${YELLOW}Installing 'serve' globally...${NC}"
    sudo npm install -g serve
fi
echo -e "${GREEN}serve installed${NC}"

echo ""

# ============================================
# Create Directory Structure
# ============================================
echo -e "${YELLOW}Creating directory structure...${NC}"

# Create logs directories
mkdir -p logs/cubsoftware-website
mkdir -p logs/cubvault-api
mkdir -p logs/cubvault-web
mkdir -p logs/questcord

# Create apps directory (will contain symlinks or copies)
mkdir -p apps

echo -e "${GREEN}Directory structure created${NC}"
echo ""

# ============================================
# Setup Applications
# ============================================

echo -e "${YELLOW}Setting up CubSoftware Website...${NC}"
if [ -d "apps/cubsoftware-website" ]; then
    cd apps/cubsoftware-website
    pip3 install -r requirements.txt --user
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}CubSoftware Website dependencies installed${NC}"
else
    echo -e "${RED}apps/cubsoftware-website not found. Please copy or symlink the project.${NC}"
fi

echo ""
echo -e "${YELLOW}Setting up CubVault...${NC}"
if [ -d "apps/cubvault" ]; then
    # Install server dependencies
    if [ -d "apps/cubvault/server" ]; then
        cd apps/cubvault/server
        npm install
        npm run prisma:generate 2>/dev/null || true
        npm run build 2>/dev/null || true
        cd "$SCRIPT_DIR"
        echo -e "${GREEN}CubVault API dependencies installed${NC}"
    fi

    # Build web frontend
    cd apps/cubvault
    npm install
    npm run build:web 2>/dev/null || true
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}CubVault Web built${NC}"
else
    echo -e "${RED}apps/cubvault not found. Please copy or symlink the project.${NC}"
fi

echo ""
echo -e "${YELLOW}Setting up QuestCord...${NC}"
if [ -d "apps/questcord" ]; then
    cd apps/questcord
    npm install
    cd "$SCRIPT_DIR"
    echo -e "${GREEN}QuestCord dependencies installed${NC}"
else
    echo -e "${RED}apps/questcord not found. Please copy or symlink the project.${NC}"
fi

echo ""

# ============================================
# Setup Nginx
# ============================================
echo -e "${YELLOW}Setting up Nginx configuration...${NC}"

if command -v nginx &> /dev/null; then
    # Create nginx config directory if needed
    sudo mkdir -p /etc/nginx/sites-available
    sudo mkdir -p /etc/nginx/sites-enabled

    # Copy nginx config
    sudo cp nginx/nginx.conf /etc/nginx/sites-available/cubsoftware

    # Create symlink if it doesn't exist
    if [ ! -L "/etc/nginx/sites-enabled/cubsoftware" ]; then
        sudo ln -s /etc/nginx/sites-available/cubsoftware /etc/nginx/sites-enabled/cubsoftware
    fi

    # Test nginx config
    sudo nginx -t

    echo -e "${GREEN}Nginx configuration installed${NC}"
    echo -e "${YELLOW}Run 'sudo systemctl reload nginx' to apply changes${NC}"
else
    echo -e "${YELLOW}Nginx not installed. Install it with: sudo apt install nginx${NC}"
fi

echo ""

# ============================================
# Create log directories for production
# ============================================
echo -e "${YELLOW}Creating system log directories...${NC}"
sudo mkdir -p /var/log/cubsoftware
sudo chown $USER:$USER /var/log/cubsoftware

# Create StreamerBot docs directory
sudo mkdir -p /var/www/cubsoftware/streamerbot-docs
sudo chown -R $USER:$USER /var/www/cubsoftware

echo -e "${GREEN}Log directories created${NC}"
echo ""

# ============================================
# Setup PM2 Startup
# ============================================
echo -e "${YELLOW}Setting up PM2 startup script...${NC}"
pm2 startup | tail -1 | sudo bash 2>/dev/null || echo -e "${YELLOW}PM2 startup may need manual configuration${NC}"
echo ""

# ============================================
# Final Instructions
# ============================================
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}   Setup Complete!                      ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "Next steps:"
echo ""
echo -e "1. ${YELLOW}Copy/symlink your apps to the apps/ directory:${NC}"
echo -e "   ln -s /path/to/cubsoftware-website apps/cubsoftware-website"
echo -e "   ln -s /path/to/cubvault apps/cubvault"
echo -e "   ln -s /path/to/questcord-v3 apps/questcord"
echo ""
echo -e "2. ${YELLOW}Configure environment files:${NC}"
echo -e "   - apps/cubvault/server/.env"
echo -e "   - apps/questcord/.env"
echo ""
echo -e "3. ${YELLOW}Start all services:${NC}"
echo -e "   pm2 start ecosystem.config.js --env production"
echo ""
echo -e "4. ${YELLOW}Save PM2 process list:${NC}"
echo -e "   pm2 save"
echo ""
echo -e "5. ${YELLOW}Configure SSL with Let's Encrypt:${NC}"
echo -e "   sudo certbot --nginx -d cubsoftware.site -d www.cubsoftware.site"
echo -e "   sudo certbot --nginx -d questcord.fun -d www.questcord.fun"
echo -e "   sudo certbot --nginx -d cubvault.cubsoftware.site"
echo -e "   sudo certbot --nginx -d questcord.cubsoftware.site"
echo -e "   sudo certbot --nginx -d streamerbot.cubsoftware.site"
echo ""
echo -e "6. ${YELLOW}Reload Nginx:${NC}"
echo -e "   sudo systemctl reload nginx"
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}   All services will be available at:  ${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "   cubsoftware.site          -> Main website"
echo -e "   questcord.fun             -> QuestCord"
echo -e "   cubvault.cubsoftware.site -> CubVault"
echo -e "   streamerbot.cubsoftware.site -> StreamerBot Docs"
echo -e "   questcord.cubsoftware.site -> Redirects to questcord.fun"
echo -e "   cubsoftware.site/questcord -> Redirects to questcord.fun"
echo ""
