/**
 * Discord Webhook Logger for The Onion Bot
 * Sends console output to Discord webhooks with embeds
 */

const https = require('https');
const http = require('http');

// Webhook URLs
const WEBHOOKS = {
    primary: 'https://discord.com/api/webhooks/1463096505694162966/_n7P-Thx94QnotSTm7J-acboDsadbdLL_wRwgCdE25L7VeJ9Wh1ZtZMs7HC5TDXy9rHN',
    secondary: 'PLACEHOLDER_WEBHOOK_URL' // Replace with second webhook when ready
};

// Embed colors
const COLORS = {
    online: 0x2ed573,      // Green
    offline: 0xff4757,     // Red
    info: 0x5865f2,        // Discord Blurple
    warning: 0xffa502,     // Orange
    error: 0xff4757,       // Red
    success: 0x2ed573,     // Green
    command: 0x7c3aed,     // Purple
    debug: 0x747f8d        // Gray
};

// Bot info for embeds
const BOT_INFO = {
    name: 'Solibot',
    icon: null, // Will be set dynamically from bot's Discord avatar when online
    footer: 'CUBSOFTWARE © 2026'
};

/**
 * Set the bot's avatar URL (call this when bot comes online)
 */
function setBotAvatar(avatarUrl) {
    BOT_INFO.icon = avatarUrl;
}

/**
 * Send embed to Discord webhook(s)
 */
async function sendToWebhook(embed, webhookType = 'all') {
    const payload = JSON.stringify({
        username: BOT_INFO.name,
        avatar_url: BOT_INFO.icon || undefined,
        embeds: [embed]
    });

    const sendToUrl = (url) => {
        if (!url || url === 'PLACEHOLDER_WEBHOOK_URL') return Promise.resolve();

        return new Promise((resolve, reject) => {
            try {
                const urlObj = new URL(url);
                const options = {
                    hostname: urlObj.hostname,
                    port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
                    path: urlObj.pathname + urlObj.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(payload)
                    }
                };

                const protocol = urlObj.protocol === 'https:' ? https : http;
                const req = protocol.request(options, (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => resolve(data));
                });

                req.on('error', (err) => {
                    // Silently fail - don't want webhook errors to crash the bot
                    resolve();
                });

                req.write(payload);
                req.end();
            } catch (err) {
                resolve();
            }
        });
    };

    const promises = [];
    if (webhookType === 'all' || webhookType === 'primary') {
        promises.push(sendToUrl(WEBHOOKS.primary));
    }
    if (webhookType === 'all' || webhookType === 'secondary') {
        promises.push(sendToUrl(WEBHOOKS.secondary));
    }

    await Promise.all(promises);
}

/**
 * Create a Discord embed object
 */
function createEmbed(options) {
    const embed = {
        title: options.title || null,
        description: options.description || null,
        color: options.color || COLORS.info,
        timestamp: new Date().toISOString(),
        footer: {
            text: BOT_INFO.footer,
            icon_url: BOT_INFO.icon || undefined
        }
    };

    // Add author with bot icon
    if (BOT_INFO.icon) {
        embed.author = {
            name: BOT_INFO.name,
            icon_url: BOT_INFO.icon
        };
    }

    if (options.fields) {
        embed.fields = options.fields;
    }

    if (options.thumbnail) {
        embed.thumbnail = { url: options.thumbnail };
    } else if (BOT_INFO.icon) {
        embed.thumbnail = { url: BOT_INFO.icon };
    }

    return embed;
}

/**
 * Log bot coming online
 */
function logOnline(client) {
    // Set the bot's avatar URL for all future embeds
    const avatarUrl = client.user.displayAvatarURL({ format: 'png', size: 256 });
    setBotAvatar(avatarUrl);

    const embed = createEmbed({
        title: '🟢 Bot Online',
        description: `**${BOT_INFO.name}** is now online and ready!`,
        color: COLORS.online,
        fields: [
            { name: 'Username', value: client.user.tag, inline: true },
            { name: 'Servers', value: `${client.guilds.cache.size}`, inline: true },
            { name: 'Users', value: `${client.users.cache.size}`, inline: true }
        ]
    });

    sendToWebhook(embed);
}

/**
 * Log bot going offline
 */
function logOffline(reason = 'Unknown') {
    const embed = createEmbed({
        title: '🔴 Bot Offline',
        description: `**${BOT_INFO.name}** is shutting down.`,
        color: COLORS.offline,
        fields: [
            { name: 'Reason', value: reason, inline: false }
        ]
    });

    sendToWebhook(embed);
}

/**
 * Log info message
 */
function logInfo(message, title = null) {
    const embed = createEmbed({
        title: title || '📋 Info',
        description: `\`\`\`${message}\`\`\``,
        color: COLORS.info
    });

    sendToWebhook(embed);
}

/**
 * Log warning message
 */
function logWarning(message, title = null) {
    const embed = createEmbed({
        title: title || '⚠️ Warning',
        description: `\`\`\`${message}\`\`\``,
        color: COLORS.warning
    });

    sendToWebhook(embed);
}

/**
 * Log error message
 */
function logError(message, title = null) {
    const embed = createEmbed({
        title: title || '❌ Error',
        description: `\`\`\`${message}\`\`\``,
        color: COLORS.error
    });

    sendToWebhook(embed);
}

/**
 * Log success message
 */
function logSuccess(message, title = null) {
    const embed = createEmbed({
        title: title || '✅ Success',
        description: `\`\`\`${message}\`\`\``,
        color: COLORS.success
    });

    sendToWebhook(embed);
}

/**
 * Log command usage
 */
function logCommand(commandName, user, guild) {
    const embed = createEmbed({
        title: '🔧 Command Used',
        color: COLORS.command,
        fields: [
            { name: 'Command', value: `\`/${commandName}\``, inline: true },
            { name: 'User', value: user, inline: true },
            { name: 'Server', value: guild || 'DM', inline: true }
        ]
    });

    sendToWebhook(embed);
}

/**
 * Log custom message with custom embed
 */
function logCustom(options) {
    const embed = createEmbed(options);
    sendToWebhook(embed);
}

/**
 * Override console methods to also send to webhook
 */
function initConsoleOverride() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    // Buffer to batch messages
    let messageBuffer = [];
    let bufferTimeout = null;

    const flushBuffer = (type) => {
        if (messageBuffer.length === 0) return;

        const message = messageBuffer.join('\n');
        messageBuffer = [];

        let embed;
        if (type === 'error') {
            embed = createEmbed({
                title: '❌ Error',
                description: `\`\`\`\n${message.substring(0, 4000)}\n\`\`\``,
                color: COLORS.error
            });
        } else if (type === 'warn') {
            embed = createEmbed({
                title: '⚠️ Warning',
                description: `\`\`\`\n${message.substring(0, 4000)}\n\`\`\``,
                color: COLORS.warning
            });
        } else {
            // Determine color based on content
            let color = COLORS.info;
            let title = '📋 Console Output';

            if (message.includes('[INFO]')) {
                color = COLORS.info;
                title = '📋 Info';
            } else if (message.includes('[WARNING]')) {
                color = COLORS.warning;
                title = '⚠️ Warning';
            } else if (message.includes('[ERROR]')) {
                color = COLORS.error;
                title = '❌ Error';
            } else if (message.includes('[SUCCESS]')) {
                color = COLORS.success;
                title = '✅ Success';
            }

            embed = createEmbed({
                title: title,
                description: `\`\`\`\n${message.substring(0, 4000)}\n\`\`\``,
                color: color
            });
        }

        sendToWebhook(embed);
    };

    console.log = function(...args) {
        originalLog.apply(console, args);

        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        messageBuffer.push(message);

        clearTimeout(bufferTimeout);
        bufferTimeout = setTimeout(() => flushBuffer('log'), 1000);
    };

    console.warn = function(...args) {
        originalWarn.apply(console, args);

        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        messageBuffer.push(message);

        clearTimeout(bufferTimeout);
        bufferTimeout = setTimeout(() => flushBuffer('warn'), 500);
    };

    console.error = function(...args) {
        originalError.apply(console, args);

        const message = args.map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');

        messageBuffer.push(message);

        clearTimeout(bufferTimeout);
        bufferTimeout = setTimeout(() => flushBuffer('error'), 500);
    };
}

module.exports = {
    WEBHOOKS,
    COLORS,
    BOT_INFO,
    setBotAvatar,
    sendToWebhook,
    createEmbed,
    logOnline,
    logOffline,
    logInfo,
    logWarning,
    logError,
    logSuccess,
    logCommand,
    logCustom,
    initConsoleOverride
};
