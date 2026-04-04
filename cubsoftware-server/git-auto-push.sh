#!/bin/bash
# ============================================
# CubSoftware — Hourly Auto Git Push
# 1. Pulls from GitHub; if code changed, restarts affected PM2 apps
# 2. Commits and pushes VPS runtime changes to GitHub
# 3. Posts an embed to Discord (auto vs manual detected)
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
ISO_TIMESTAMP=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
LOG_PREFIX="[git-auto-push] [$TIMESTAMP]"

# ── Detect run type ──────────────────────────
# Cron has no TTY; a real terminal means manual execution
if [ -t 1 ]; then
    RUN_TYPE="Manual"
    RUN_ICON="🔧"
else
    RUN_TYPE="Automatic"
    RUN_ICON="🤖"
fi

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

# Colors
COLOR_SUCCESS=5763719   # green
COLOR_ERROR=15548997    # red
COLOR_NONE=8421504      # grey

# ── Discord embed helper ─────────────────────
# Usage: send_embed <color> <title> <description> [fields_json]
# fields_json: JSON array string, e.g. '[{"name":"Files","value":"3","inline":true}]'
send_embed() {
    local color="$1"
    local title="$2"
    local description="$3"
    local fields="${4:-[]}"

    if [ -z "$BOT_TOKEN" ]; then
        echo "$LOG_PREFIX No bot token — skipping Discord notification"
        return 0
    fi

    local payload
    if command -v jq &> /dev/null; then
        payload=$(jq -n \
            --argjson color "$color" \
            --arg title "$title" \
            --arg description "$description" \
            --argjson fields "$fields" \
            --arg ts "$ISO_TIMESTAMP" \
            '{embeds: [{
                title: $title,
                description: $description,
                color: $color,
                fields: $fields,
                footer: {text: "Developed by https://cubsoftware.site"},
                timestamp: $ts
            }]}')
    else
        # Fallback: basic manual JSON (no special chars in fields)
        payload="{\"embeds\":[{\"title\":\"$title\",\"description\":\"$description\",\"color\":$color,\"footer\":{\"text\":\"Developed by https://cubsoftware.site\"},\"timestamp\":\"$ISO_TIMESTAMP\"}]}"
    fi

    curl -s -X POST "https://discord.com/api/v10/channels/$CHANNEL_ID/messages" \
        -H "Authorization: Bot $BOT_TOKEN" \
        -H "Content-Type: application/json" \
        -d "$payload" > /dev/null 2>&1 || echo "$LOG_PREFIX Warning: Discord notification failed"
}

# ── Git pull ─────────────────────────────────
cd "$REPO_DIR"
echo "$LOG_PREFIX Checking for changes in $REPO_DIR"

BEFORE_HASH=$(git rev-parse HEAD)

echo "$LOG_PREFIX Pulling latest from GitHub..."
if ! git pull --rebase --autostash; then
    echo "$LOG_PREFIX ERROR: git pull --rebase failed (conflict?)"
    send_embed $COLOR_ERROR \
        "$RUN_ICON Git Auto Push — Failed" \
        "Pull/rebase failed. Check server logs." \
        "[]"
    exit 1
fi

AFTER_HASH=$(git rev-parse HEAD)

# ── Restart PM2 apps if code changed ─────────
RESTARTED_APPS=""
if [ "$BEFORE_HASH" != "$AFTER_HASH" ]; then
    echo "$LOG_PREFIX New commits pulled — checking for code changes..."
    PULLED_FILES=$(git diff --name-only "$BEFORE_HASH" "$AFTER_HASH")

    code_changed_in() {
        echo "$PULLED_FILES" | grep "^$1" | grep -qv '\.json$'
    }

    if code_changed_in "cubsoftware-server/apps/cubsoftware-website/"; then
        echo "$LOG_PREFIX Restarting cubsoftware-website..."
        pm2 restart cubsoftware-website
        RESTARTED_APPS="$RESTARTED_APPS\ncubsoftware-website"
    fi
    if code_changed_in "cubsoftware-server/apps/cub-protector/"; then
        echo "$LOG_PREFIX Restarting cub-protector..."
        pm2 restart cub-protector
        RESTARTED_APPS="$RESTARTED_APPS\ncub-protector"
    fi
    if code_changed_in "cubsoftware-server/apps/questcord/"; then
        echo "$LOG_PREFIX Restarting questcord..."
        pm2 restart questcord
        RESTARTED_APPS="$RESTARTED_APPS\nquestcord"
    fi
    if code_changed_in "cubsoftware-server/apps/cleanme-bot/"; then
        echo "$LOG_PREFIX Restarting cleanme-bot..."
        pm2 restart cleanme-bot
        RESTARTED_APPS="$RESTARTED_APPS\ncleanme-bot"
    fi
    if code_changed_in "galaxy/"; then
        echo "$LOG_PREFIX Restarting galaxy-bot..."
        pm2 restart galaxy-bot
        RESTARTED_APPS="$RESTARTED_APPS\ngalaxy-bot"
    fi
    if code_changed_in "The Onion Bot/"; then
        echo "$LOG_PREFIX Restarting onion-bot..."
        pm2 restart onion-bot
        RESTARTED_APPS="$RESTARTED_APPS\nonion-bot"
    fi

    if [ -n "$RESTARTED_APPS" ]; then
        echo "$LOG_PREFIX Restarted: $RESTARTED_APPS"
    else
        echo "$LOG_PREFIX New commits pulled but only data files changed — no restart needed"
    fi
fi

# ── Stage VPS runtime changes ─────────────────
git add -A

# ── Build restart field for embed ─────────────
build_fields() {
    local pushed_files="$1"
    local total="$2"
    local breakdown="$3"
    local restarted="$4"
    local fields="["

    if [ -n "$pushed_files" ]; then
        local breakdown_escaped
        breakdown_escaped=$(printf '%s' "$breakdown" | sed 's/\\/\\\\/g; s/"/\\"/g; s/$/\\n/g' | tr -d '\n')
        breakdown_escaped="${breakdown_escaped%\\n}"
        fields="$fields{\"name\":\"Files Pushed\",\"value\":\"$total\",\"inline\":true},"
        fields="$fields{\"name\":\"Breakdown\",\"value\":\"\`\`\`$breakdown_escaped\`\`\`\",\"inline\":false}"
    fi

    if [ -n "$restarted" ]; then
        local restart_list
        restart_list=$(printf '%s' "$restarted" | sed 's/^\\n//' | sed 's/\\n/\n/g' | awk '{print "• " $0}' | sed 's/\n/\\n/g' | tr '\n' '|' | sed 's/|/\\n/g')
        [ -n "$pushed_files" ] && fields="$fields,"
        fields="$fields{\"name\":\"Restarted\",\"value\":\"$restart_list\",\"inline\":false}"
    fi

    fields="$fields]"
    echo "$fields"
}

if git diff --cached --quiet; then
    echo "$LOG_PREFIX No VPS changes to push"

    if [ -n "$RESTARTED_APPS" ]; then
        RESTART_LIST=$(printf '%s' "$RESTARTED_APPS" | sed 's/^\\n//' | awk 'NF{print "• " $0}' | paste -sd '\n' -)
        FIELDS=$(build_fields "" "" "" "$RESTARTED_APPS")
        send_embed $COLOR_SUCCESS \
            "$RUN_ICON Git Auto Push — $RUN_TYPE" \
            "No VPS data changes. Code deployed and services restarted." \
            "$FIELDS"
    else
        send_embed $COLOR_NONE \
            "$RUN_ICON Git Auto Push — $RUN_TYPE" \
            "No changes — nothing to push." \
            "[]"
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
    send_embed $COLOR_ERROR \
        "$RUN_ICON Git Auto Push — Failed" \
        "Commit failed. Check server logs." \
        "[]"
    exit 1
fi

# ── Push ──────────────────────────────────────
if ! git push; then
    echo "$LOG_PREFIX ERROR: git push failed"
    send_embed $COLOR_ERROR \
        "$RUN_ICON Git Auto Push — Failed" \
        "Push failed. Check server logs." \
        "[]"
    exit 1
fi

echo "$LOG_PREFIX Successfully pushed $TOTAL file(s)"

# ── Build and send success embed ──────────────
if command -v jq &> /dev/null; then
    FIELDS="["
    FIELDS="$FIELDS{\"name\":\"Files Pushed\",\"value\":\"$TOTAL\",\"inline\":true},"
    FIELDS="$FIELDS{\"name\":\"Run Type\",\"value\":\"$RUN_TYPE\",\"inline\":true}"

    if [ -n "$RESTARTED_APPS" ]; then
        RESTART_LIST=$(printf '%s' "$RESTARTED_APPS" | sed 's/^\\n//' | sed 's/\\n/\n/g' | awk 'NF{print "• " $0}' | tr '\n' '\n')
        RESTART_ESCAPED=$(printf '%s' "$RESTART_LIST" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' '~' | sed 's/~/\\n/g')
        FIELDS="$FIELDS,{\"name\":\"Restarted\",\"value\":\"$RESTART_ESCAPED\",\"inline\":false}"
    fi

    BREAKDOWN_ESCAPED=$(printf '%s' "$BREAKDOWN" | sed 's/\\/\\\\/g; s/"/\\"/g' | tr '\n' '~' | sed 's/~/\\n/g')
    FIELDS="$FIELDS,{\"name\":\"Breakdown\",\"value\":\"\`\`\`$BREAKDOWN_ESCAPED\`\`\`\",\"inline\":false}"
    FIELDS="$FIELDS]"

    send_embed $COLOR_SUCCESS \
        "$RUN_ICON Git Auto Push — $RUN_TYPE" \
        "Successfully pushed **$TOTAL** file(s) to GitHub." \
        "$FIELDS"
else
    send_embed $COLOR_SUCCESS \
        "$RUN_ICON Git Auto Push — $RUN_TYPE" \
        "Successfully pushed $TOTAL file(s) to GitHub." \
        "[]"
fi
