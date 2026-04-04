#!/bin/bash
# ============================================
# CubSoftware — Hourly Auto Git Push
# 1. Pulls from GitHub; if code changed, restarts affected PM2 apps
# 2. Commits and pushes VPS runtime changes to GitHub
# 3. Posts result to Discord
#
# Setup:
#   1. Make executable:
#        chmod +x git-auto-push.sh
#   2. Add to crontab (runs every hour at :00):
#        crontab -e
#        0 * * * * /path/to/cubsoftware-server/git-auto-push.sh >> /path/to/cubsoftware-server/logs/git-auto-push.log 2>&1
#
# Uses CUB_PROTECTOR_TOKEN and GIT_PUSH_CHANNEL_ID from .env.
# ============================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M %Z')
LOG_PREFIX="[git-auto-push] [$TIMESTAMP]"

# ── Load .env ───────────────────────────────
ENV_FILE="$SCRIPT_DIR/.env"
if [ -f "$ENV_FILE" ]; then
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ "$line" =~ ^[[:space:]]*# ]] && continue
        [[ -z "${line// }" ]] && continue
        key="${line%%=*}"
        val="${line#*=}"
        val="${val%\"}" ; val="${val#\"}"
        val="${val%\'}" ; val="${val#\'}"
        [[ -n "$key" ]] && export "$key"="$val" 2>/dev/null || true
    done < "$ENV_FILE"
fi

BOT_TOKEN="${CUB_PROTECTOR_TOKEN:-}"
CHANNEL_ID="${GIT_PUSH_CHANNEL_ID:-1466190584372003092}"

# ── Discord send helper ──────────────────────
send_discord() {
    local message="$1"
    if [ -z "$BOT_TOKEN" ]; then
        echo "$LOG_PREFIX No bot token — skipping Discord notification"
        return 0
    fi
    if command -v jq &> /dev/null; then
        local payload
        payload=$(jq -n --arg content "$message" '{content: $content}')
    else
        local escaped
        escaped=$(printf '%s' "$message" | sed 's/\\/\\\\/g; s/"/\\"/g')
        local payload="{\"content\": \"$escaped\"}"
    fi
    curl -s -X POST "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
        -H "Authorization: Bot $BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null 2>&1 || echo "$LOG_PREFIX Warning: Discord notification failed"
}

# ── Git pull — pick up code changes from dev machine ──
cd "$REPO_DIR"
echo "$LOG_PREFIX Checking for changes in $REPO_DIR"

BEFORE_HASH=$(git rev-parse HEAD)

echo "$LOG_PREFIX Pulling latest from GitHub..."
if ! git pull --rebase --autostash; then
    echo "$LOG_PREFIX ERROR: git pull --rebase failed (conflict?)"
    send_discord "**[Auto Push]** \`$TIMESTAMP\`
❌ Pull/rebase failed — check server logs."
    exit 1
fi

AFTER_HASH=$(git rev-parse HEAD)

# ── Restart PM2 apps if code changed ─────────
RESTART_MSG=""
if [ "$BEFORE_HASH" != "$AFTER_HASH" ]; then
    echo "$LOG_PREFIX New commits pulled — checking for code changes..."

    PULLED_FILES=$(git diff --name-only "$BEFORE_HASH" "$AFTER_HASH")

    # Helper: did any non-json file change under a given path?
    code_changed_in() {
        echo "$PULLED_FILES" | grep "^$1" | grep -qv '\.json$'
    }

    RESTARTED_APPS=""

    if code_changed_in "cubsoftware-server/apps/cubsoftware-website/"; then
        echo "$LOG_PREFIX Restarting cubsoftware-website..."
        pm2 restart cubsoftware-website
        RESTARTED_APPS="$RESTARTED_APPS cubsoftware-website"
    fi

    if code_changed_in "cubsoftware-server/apps/cub-protector/"; then
        echo "$LOG_PREFIX Restarting cub-protector..."
        pm2 restart cub-protector
        RESTARTED_APPS="$RESTARTED_APPS cub-protector"
    fi

    if code_changed_in "cubsoftware-server/apps/questcord/"; then
        echo "$LOG_PREFIX Restarting questcord..."
        pm2 restart questcord
        RESTARTED_APPS="$RESTARTED_APPS questcord"
    fi

    if code_changed_in "cubsoftware-server/apps/cleanme-bot/"; then
        echo "$LOG_PREFIX Restarting cleanme-bot..."
        pm2 restart cleanme-bot
        RESTARTED_APPS="$RESTARTED_APPS cleanme-bot"
    fi

    if code_changed_in "galaxy/"; then
        echo "$LOG_PREFIX Restarting galaxy-bot..."
        pm2 restart galaxy-bot
        RESTARTED_APPS="$RESTARTED_APPS galaxy-bot"
    fi

    if code_changed_in "The Onion Bot/"; then
        echo "$LOG_PREFIX Restarting onion-bot..."
        pm2 restart onion-bot
        RESTARTED_APPS="$RESTARTED_APPS onion-bot"
    fi

    if [ -n "$RESTARTED_APPS" ]; then
        RESTART_MSG="
🔄 Restarted:$(echo "$RESTARTED_APPS" | tr ' ' '\n' | grep -v '^$' | awk '{print "  • " $1}' | tr '\n' '\n')"
        echo "$LOG_PREFIX Restarted:$RESTARTED_APPS"
    else
        echo "$LOG_PREFIX New commits pulled but only data files changed — no restart needed"
    fi
fi

# ── Stage VPS runtime changes ─────────────────
git add -A

if git diff --cached --quiet; then
    echo "$LOG_PREFIX No VPS changes to push"
    if [ -n "$RESTART_MSG" ]; then
        send_discord "**[Auto Push]** \`$TIMESTAMP\`
📥 Pulled code changes — no VPS data to push.$RESTART_MSG"
    fi
    exit 0
fi

# ── Count changed files ───────────────────────
CHANGED_FILES=$(git diff --cached --name-only)
TOTAL=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')

BREAKDOWN=$(echo "$CHANGED_FILES" \
    | awk -F. 'NF>1 { print $NF } NF==1 { print "(no ext)" }' \
    | sort \
    | uniq -c \
    | sort -rn \
    | awk '{ printf "• %s .%s\n", $1, $2 }')

echo "$LOG_PREFIX Committing $TOTAL file(s):"
echo "$BREAKDOWN"

# ── Commit ────────────────────────────────────
if ! git commit -m "CUBSOFTWARE"; then
    echo "$LOG_PREFIX ERROR: git commit failed"
    send_discord "**[Auto Push]** \`$TIMESTAMP\`
❌ Commit failed — check server logs."
    exit 1
fi

# ── Push ──────────────────────────────────────
if ! git push; then
    echo "$LOG_PREFIX ERROR: git push failed"
    send_discord "**[Auto Push]** \`$TIMESTAMP\`
❌ Push failed — check server logs."
    exit 1
fi

echo "$LOG_PREFIX Successfully pushed $TOTAL file(s)"

send_discord "**[Auto Push]** \`$TIMESTAMP\`
Pushed **$TOTAL** file(s) to GitHub:
\`\`\`
$BREAKDOWN
\`\`\`$RESTART_MSG"
