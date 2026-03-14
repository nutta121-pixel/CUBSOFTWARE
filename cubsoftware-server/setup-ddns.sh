#!/bin/bash

# ============================================
# Setup Cloudflare DDNS - Run once after configuring
# ============================================

echo "Setting up Cloudflare DDNS..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Make the script executable
chmod +x "$SCRIPT_DIR/cloudflare-ddns.sh"

# Add to crontab (runs every 5 minutes)
CRON_JOB="*/5 * * * * $SCRIPT_DIR/cloudflare-ddns.sh"

# Check if already in crontab
if crontab -l 2>/dev/null | grep -q "cloudflare-ddns.sh"; then
    echo "DDNS cron job already exists"
else
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "Added DDNS cron job (runs every 5 minutes)"
fi

# Run it once now
echo "Running DDNS update now..."
"$SCRIPT_DIR/cloudflare-ddns.sh"

echo ""
echo "Done! Your IP will be checked every 5 minutes."
echo "Logs: /var/log/cubsoftware/cloudflare-ddns.log"
