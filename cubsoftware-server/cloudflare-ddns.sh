#!/bin/bash

# ============================================
# Cloudflare Dynamic DNS Updater
# Updates both cubsoftware.site and questcord.fun
# when your home IP changes
# ============================================

# ============================================
# CONFIGURATION - Loaded from .env.ddns
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables from .env.ddns
if [ -f "$SCRIPT_DIR/.env.ddns" ]; then
    export $(grep -v '^#' "$SCRIPT_DIR/.env.ddns" | xargs)
else
    echo "ERROR: .env.ddns not found. Copy .env.ddns.example and fill in your values."
    exit 1
fi

# Validate required variables
if [ -z "$CF_API_TOKEN" ] || [ "$CF_API_TOKEN" == "YOUR_API_TOKEN_HERE" ]; then
    echo "ERROR: CF_API_TOKEN not set in .env.ddns"
    exit 1
fi

# ============================================
# SCRIPT - Don't edit below
# ============================================

LOG_FILE="/var/log/cubsoftware/cloudflare-ddns.log"
IP_FILE="/tmp/current_public_ip"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Get current public IP
CURRENT_IP=$(curl -s https://ifconfig.me || curl -s https://api.ipify.org || curl -s https://icanhazip.com)

if [ -z "$CURRENT_IP" ]; then
    log "ERROR: Could not determine public IP"
    exit 1
fi

# Check if IP has changed
if [ -f "$IP_FILE" ]; then
    OLD_IP=$(cat "$IP_FILE")
    if [ "$CURRENT_IP" == "$OLD_IP" ]; then
        # IP hasn't changed, exit silently
        exit 0
    fi
fi

log "IP changed: ${OLD_IP:-unknown} -> $CURRENT_IP"

# Function to update a DNS record
update_dns() {
    local zone_id=$1
    local domain=$2
    local record_name=$3

    # Get the record ID for this domain
    RECORD_ID=$(curl -s -X GET "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records?type=A&name=${record_name}" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)

    if [ -z "$RECORD_ID" ]; then
        log "ERROR: Could not find DNS record for ${record_name}"
        return 1
    fi

    # Update the record
    RESULT=$(curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records/${RECORD_ID}" \
        -H "Authorization: Bearer ${CF_API_TOKEN}" \
        -H "Content-Type: application/json" \
        --data "{\"type\":\"A\",\"name\":\"${record_name}\",\"content\":\"${CURRENT_IP}\",\"ttl\":1,\"proxied\":true}")

    if echo "$RESULT" | grep -q '"success":true'; then
        log "SUCCESS: Updated ${record_name} -> ${CURRENT_IP}"
    else
        log "ERROR: Failed to update ${record_name}: $RESULT"
        return 1
    fi
}

# Update cubsoftware.site records
log "Updating cubsoftware.site..."
update_dns "$ZONE_ID_CUBSOFTWARE" "cubsoftware.site" "cubsoftware.site"
update_dns "$ZONE_ID_CUBSOFTWARE" "cubsoftware.site" "www.cubsoftware.site"
update_dns "$ZONE_ID_CUBSOFTWARE" "cubsoftware.site" "questcord.cubsoftware.site"
update_dns "$ZONE_ID_CUBSOFTWARE" "cubsoftware.site" "tools.cubsoftware.site"

# Update questcord.fun records
log "Updating questcord.fun..."
update_dns "$ZONE_ID_QUESTCORD" "questcord.fun" "questcord.fun"
update_dns "$ZONE_ID_QUESTCORD" "questcord.fun" "www.questcord.fun"

# Save current IP
echo "$CURRENT_IP" > "$IP_FILE"

log "DDNS update complete"
