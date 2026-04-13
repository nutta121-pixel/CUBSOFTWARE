/**
 * Discord Embed Reporter for Auth Tester
 *
 * Sends brute-force and auth test results as Discord embeds using a bot token.
 * Clears the channel before posting so each hourly run is a clean slate.
 *
 * Requires:
 *   SECURITY_BOT_TOKEN  — Discord bot token (must have Send Messages + Manage Messages in the channel)
 *   SECURITY_CHANNEL_ID — Channel ID to post to (default: 1493106273116356761)
 */

'use strict';

const axios = require('axios');

const BOT_TOKEN   = process.env.SECURITY_BOT_TOKEN  || '';
const CHANNEL_ID  = process.env.SECURITY_CHANNEL_ID || '1493106273116356761';

const DISCORD_API = 'https://discord.com/api/v10';

function log(msg) {
    process.stdout.write(`[AuthTester/Discord] ${new Date().toISOString()} ${msg}\n`);
}

// ── Channel clear ─────────────────────────────────────────────────────────────

/**
 * Delete all recent messages in the security channel so each hourly run
 * starts with a clean channel. Deletes up to 100 messages at a time.
 * Discord only allows bulk-delete for messages < 14 days old.
 */
async function clearChannel() {
    if (!BOT_TOKEN || !CHANNEL_ID) {
        log('SKIP channel clear — SECURITY_BOT_TOKEN or SECURITY_CHANNEL_ID not set');
        return;
    }

    try {
        const headers = { Authorization: `Bot ${BOT_TOKEN}` };

        // Fetch last 100 messages
        const listRes = await axios.get(
            `${DISCORD_API}/channels/${CHANNEL_ID}/messages?limit=100`,
            { headers, timeout: 10000, validateStatus: () => true }
        );

        if (listRes.status !== 200) {
            log(`Could not fetch messages: HTTP ${listRes.status}`);
            return;
        }

        const messages = listRes.data;
        if (!messages.length) {
            log('Channel already empty');
            return;
        }

        const ids = messages.map(m => m.id);

        if (ids.length === 1) {
            // Bulk-delete requires ≥2 messages; delete single individually
            await axios.delete(
                `${DISCORD_API}/channels/${CHANNEL_ID}/messages/${ids[0]}`,
                { headers, timeout: 10000, validateStatus: () => true }
            );
        } else {
            // Bulk-delete (≤100, must be <14 days old)
            const deleteRes = await axios.post(
                `${DISCORD_API}/channels/${CHANNEL_ID}/messages/bulk-delete`,
                { messages: ids },
                { headers, timeout: 10000, validateStatus: () => true }
            );
            if (deleteRes.status !== 204) {
                log(`Bulk-delete returned HTTP ${deleteRes.status} — some messages may be >14 days old`);
            }
        }

        log(`Cleared ${ids.length} message(s) from channel`);
    } catch (err) {
        log(`Channel clear failed: ${err.message}`);
    }
}

// ── Embed builders ────────────────────────────────────────────────────────────

function statusEmoji(ok, skipped) {
    if (skipped) return '⏭️';
    return ok ? '✅' : '❌';
}

function overallColor(allPass) {
    return allPass ? 0x57F287 : 0xED4245; // Discord green / red
}

/**
 * Build an embed for one target's auth test results.
 */
function buildAuthEmbed(target, results) {
    const fields = Object.entries(results).map(([check, result]) => ({
        name: check,
        value: result.skipped
            ? `⏭️ Skipped: ${result.reason}`
            : result.ok
                ? `✅ PASS (HTTP ${result.status})`
                : `❌ FAIL — ${result.error || `got HTTP ${result.status ?? 'timeout'}`}`,
        inline: true,
    }));

    const anyFailed = Object.values(results).some(r => !r.skipped && !r.ok);

    return {
        title: `🔐 Auth Tests — ${target.name}`,
        description: `\`${target.baseUrl + target.protectedPath}\``,
        color: overallColor(!anyFailed),
        fields,
        footer: { text: `Auth Tester • ${new Date().toUTCString()}` },
    };
}

/**
 * Build an embed for one target's brute-force resilience results.
 */
function buildBruteForceEmbed(target, results) {
    const fields = Object.entries(results).map(([check, result]) => {
        let value;
        if (result.error) {
            value = `❌ ERROR: ${result.error}`;
        } else if (!result.ok) {
            value = `❌ FAIL\n\`\`\`${JSON.stringify(result.detail ?? {}, null, 2).slice(0, 300)}\`\`\``;
        } else {
            const detail = result.detail
                ? `\n${Object.entries(result.detail).map(([k, v]) => `${k}: ${v}`).join(' | ')}`
                : '';
            value = `✅ PASS${detail}`;
        }
        return { name: check, value, inline: false };
    });

    const anyFailed = Object.values(results).some(r => !r.ok);

    return {
        title: `🛡️ Brute-Force Resilience — ${target.name}`,
        description: `\`${target.baseUrl}\``,
        color: overallColor(!anyFailed),
        fields,
        footer: { text: `Auth Tester • ${new Date().toUTCString()}` },
    };
}

/**
 * Build an embed for one target's security check results.
 */
function buildSecurityEmbed(target, results) {
    const fields = Object.entries(results).map(([check, result]) => {
        let value;
        if (result.skipped) {
            value = `⏭️ Skipped: ${result.reason}`;
        } else if (result.ok) {
            value = '✅ PASS';
        } else {
            const detail = result.error
                ? result.error
                : JSON.stringify(result.detail ?? {}).slice(0, 200);
            value = `❌ FAIL — ${detail}`;
        }
        return { name: check, value, inline: true };
    });

    const anyFailed = Object.values(results).some(r => !r.skipped && !r.ok);

    return {
        title: `🔍 Security Checks — ${target.name}`,
        description: `\`${target.baseUrl}\``,
        color: overallColor(!anyFailed),
        fields,
        footer: { text: `Auth Tester • ${new Date().toUTCString()}` },
    };
}

/**
 * Build the summary embed shown at the top of each run.
 */
function buildSummaryEmbed(timestamp, authSummary, bfSummary, secSummary) {
    const allPass = authSummary.failed === 0 && bfSummary.failed === 0 && secSummary.failed === 0;
    return {
        title: allPass
            ? '✅ Security Check — ALL PASS'
            : '❌ Security Check — ISSUES FOUND',
        color: overallColor(allPass),
        fields: [
            {
                name: '🔐 Auth Tests',
                value: `✅ ${authSummary.passed} passed   ❌ ${authSummary.failed} failed`,
                inline: true,
            },
            {
                name: '🛡️ Brute-Force Tests',
                value: `✅ ${bfSummary.passed} passed   ❌ ${bfSummary.failed} failed`,
                inline: true,
            },
            {
                name: '🔍 Security Checks',
                value: `✅ ${secSummary.passed} passed   ❌ ${secSummary.failed} failed`,
                inline: true,
            },
        ],
        timestamp: new Date(timestamp).toISOString(),
        footer: { text: 'CUB SOFTWARE Auth Tester' },
    };
}

// ── Sender ────────────────────────────────────────────────────────────────────

async function sendEmbed(embed) {
    if (!BOT_TOKEN) return;
    try {
        await axios.post(
            `${DISCORD_API}/channels/${CHANNEL_ID}/messages`,
            { embeds: [embed] },
            {
                headers: { Authorization: `Bot ${BOT_TOKEN}`, 'Content-Type': 'application/json' },
                timeout: 10000,
                validateStatus: () => true,
            }
        );
        // Small gap to stay within Discord's rate limit (5 messages/5s per channel)
        await new Promise(r => setTimeout(r, 600));
    } catch (err) {
        log(`Failed to send embed: ${err.message}`);
    }
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Called once per run with all results.
 * Note: clearChannel() is called from index.js BEFORE the scan starts (not here).
 * 1. Posts a summary embed
 * 2. Posts one auth embed per target
 * 3. Posts one brute-force embed per target
 * 4. Posts one security checks embed per target
 */
async function reportToDiscord({ targets, authResults, bfResults, secResults, timestamp }) {
    if (!BOT_TOKEN) {
        log('SECURITY_BOT_TOKEN not set — Discord reporting disabled');
        return;
    }

    // Compute summary counts
    const authSummary = { passed: 0, failed: 0 };
    const bfSummary   = { passed: 0, failed: 0 };
    const secSummary  = { passed: 0, failed: 0 };

    for (const [, res] of Object.entries(authResults)) {
        const failed = Object.values(res).some(r => !r.skipped && !r.ok);
        failed ? authSummary.failed++ : authSummary.passed++;
    }
    for (const [, res] of Object.entries(bfResults)) {
        const failed = Object.values(res).some(r => !r.ok);
        failed ? bfSummary.failed++ : bfSummary.passed++;
    }
    for (const [, res] of Object.entries(secResults || {})) {
        const failed = Object.values(res).some(r => !r.skipped && !r.ok);
        failed ? secSummary.failed++ : secSummary.passed++;
    }

    // 1. Summary
    await sendEmbed(buildSummaryEmbed(timestamp, authSummary, bfSummary, secSummary));

    // 2. Auth embeds
    for (const target of targets) {
        const res = authResults[target.name];
        if (res) await sendEmbed(buildAuthEmbed(target, res));
    }

    // 3. Brute-force embeds
    for (const target of targets) {
        const res = bfResults[target.name];
        if (res) await sendEmbed(buildBruteForceEmbed(target, res));
    }

    // 4. Security check embeds
    if (secResults) {
        for (const target of targets) {
            const res = secResults[target.name];
            if (res) await sendEmbed(buildSecurityEmbed(target, res));
        }
    }

    log(`Discord report sent: ${targets.length} app(s), summary + auth + brute-force + security embeds`);
}

module.exports = { clearChannel, reportToDiscord };
