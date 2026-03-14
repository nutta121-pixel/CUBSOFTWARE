#!/bin/bash

# ============================================
# CubSoftware Server - Full Install & Start
# Run this once to install everything and start all services
# ============================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "========================================"
echo "   CubSoftware Server - Full Install"
echo "========================================"
echo ""

# Create logs directories
echo "[1/7] Creating directories..."
mkdir -p logs/cubsoftware-website
mkdir -p logs/cubvault-api
mkdir -p logs/cubvault-web
mkdir -p logs/questcord
mkdir -p logs/onion-bot

# Install CubSoftware Website dependencies
echo "[2/7] Installing CubSoftware Website (Python)..."
cd apps/cubsoftware-website
pip3 install -r requirements.txt --quiet
cd "$SCRIPT_DIR"

# Install CubVault dependencies
echo "[3/7] Installing CubVault..."
cd apps/cubvault
npm install --silent
cd server
npm install --silent
npx prisma generate 2>/dev/null || true
npm run build 2>/dev/null || true
cd "$SCRIPT_DIR"

# Build CubVault web
echo "[4/7] Building CubVault Web..."
cd apps/cubvault
npm run build:web 2>/dev/null || true
cd "$SCRIPT_DIR"

# Install QuestCord dependencies
echo "[5/7] Installing QuestCord..."
cd apps/questcord
npm install --silent
cd "$SCRIPT_DIR"

# Install The Onion Bot dependencies
echo "[6/7] Installing The Onion Bot..."
cd "../The Onion Bot"
npm install --silent
cd "$SCRIPT_DIR"

# Start all services
echo "[7/7] Starting all services..."
pm2 start cubsoftware.config.js
pm2 save

echo ""
echo "========================================"
echo "   Installation Complete!"
echo "========================================"
echo ""
echo "Services running:"
pm2 status
echo ""
echo "Useful commands:"
echo "  pm2 status     - View status"
echo "  pm2 logs       - View logs"
echo "  pm2 restart all - Restart all"
echo ""
