#!/bin/bash
# ============================================
# CubSoftware — Hourly Auto Git Push
# Commits and pushes runtime changes (e.g.
# CubReactive uploaded images) to GitHub,
# then has the bot report the result to Discord.
#
# Setup:
#   1. Make executable:
#        chmod +x git-auto-push.sh
#   2. Add to crontab (runs every hour at :00):
#        crontab -e
#        0 * * * * /path/to/cubsoftware-server/git-auto-push.sh >> /path/to/cubsoftware-server/logs/git-auto-push.log 2>&1
#
# Uses CUB_PROTECTOR_TOKEN and GIT_PUSH_CHANNEL_ID from .env.
# The git repo root is assumed to be one level above this script.
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
CHANNEL_ID="${GIT_PUSH_CHANNEL_ID:-1284601338965004369}"

# ── Discord send helper (uses bot token) ─────
send_discord() {
    local message="$1"
    if [ -z "$BOT_TOKEN" ]; then
        echo "$LOG_PREFIX No bot token found (CUB_PROTECTOR_TOKEN not set) — skipping Discord notification"
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

# ── Git operations ───────────────────────────
cd "$REPO_DIR"

echo "$LOG_PREFIX Checking for changes in $REPO_DIR"

# Pull latest from GitHub first (rebase keeps VPS data changes on top of any
# code changes pushed from the dev machine, preventing non-fast-forward rejects)
echo "$LOG_PREFIX Pulling latest from GitHub..."
if ! git pull --rebase --autostash; then
    echo "$LOG_PREFIX ERROR: git pull --rebase failed (conflict?)"
    send_discord "**[Auto Push]** \`$TIMESTAMP\`
❌ Pull/rebase failed — check server logs."
    exit 1
fi

# Stage all changes (gitignore rules apply — data/*.json stays excluded, cubreactive images included)
git add -A

# Nothing to commit?
if git diff --cached --quiet; then
    echo "$LOG_PREFIX No changes — nothing to push"
    send_discord "**[Auto Push]** \`$TIMESTAMP\`
No changes — nothing to push."
    exit 0
fi

# ── Count changed files by extension ─────────
CHANGED_FILES=$(git diff --cached --name-only)
TOTAL=$(echo "$CHANGED_FILES" | wc -l | tr -d ' ')

# Build per-extension counts
BREAKDOWN=$(echo "$CHANGED_FILES" \
    | awk -F. 'NF>1 { print $NF } NF==1 { print "(no ext)" }' \
    | sort \
    | uniq -c \
    | sort -rn \
    | awk '{ printf "• %s .%s\n", $1, $2 }')

echo "$LOG_PREFIX Committing $TOTAL file(s):"
echo "$BREAKDOWN"

# ── Commit ───────────────────────────────────
COMMIT_MSG="CUBSOFTWARE"
if ! git commit -m "$COMMIT_MSG"; then
    echo "$LOG_PREFIX ERROR: git commit failed"
    send_discord "**[Auto Push]** \`$TIMESTAMP\`
❌ Commit failed — check server logs."
    exit 1
fi

# ── Push ─────────────────────────────────────
if ! git push; then
    echo "$LOG_PREFIX ERROR: git push failed"
    send_discord "**[Auto Push]** \`$TIMESTAMP\`
❌ Push failed — check server logs."
    exit 1
fi

echo "$LOG_PREFIX Successfully pushed $TOTAL file(s)"

# ── Discord notification ──────────────────────
send_discord "**[Auto Push]** \`$TIMESTAMP\`
Pushed **$TOTAL** file(s) to GitHub:
\`\`\`
$BREAKDOWN
\`\`\`"
