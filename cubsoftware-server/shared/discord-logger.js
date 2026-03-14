/**
 * Discord Logger - Shared logging utility for all CUB SOFTWARE projects
 *
 * Usage:
 *   const logger = require('../shared/discord-logger');
 *   logger.init('Project Name', process.env.DISCORD_LOG_WEBHOOK);
 *
 *   logger.info('Server started');
 *   logger.success('User logged in');
 *   logger.warn('Rate limit approaching');
 *   logger.error('Database connection failed', error);
 */

const https = require('https');
const http = require('http');

class DiscordLogger {
    constructor() {
        this.projectName = 'Unknown';
        this.webhookUrl = null;
        this.colors = {
            info: 0x3b82f6,    // Blue
            success: 0x22c55e, // Green
            warn: 0xf59e0b,    // Yellow/Orange
            error: 0xef4444,   // Red
            debug: 0x6b7280    // Gray
        };
        this.icons = {
            info: 'ℹ️',
            success: '✅',
            warn: '⚠️',
            error: '❌',
            debug: '🔧'
        };
    }

    /**
     * Initialize the logger
     * @param {string} projectName - Name of the project (e.g., 'QuestCord', 'CubSoftware Website')
     * @param {string} webhookUrl - Discord webhook URL
     */
    init(projectName, webhookUrl) {
        this.projectName = projectName;
        this.webhookUrl = webhookUrl;

        if (!webhookUrl) {
            console.warn(`[${projectName}] Discord logging disabled - no webhook URL provided`);
        }
    }

    /**
     * Send a log message to Discord
     * @param {string} level - Log level (info, success, warn, error, debug)
     * @param {string} message - Log message
     * @param {Error|Object} [details] - Optional error or additional details
     */
    async log(level, message, details = null) {
        // Always log to console
        const consoleMsg = `[${this.projectName}] [${level.toUpperCase()}] ${message}`;
        if (level === 'error') {
            console.error(consoleMsg, details || '');
        } else if (level === 'warn') {
            console.warn(consoleMsg);
        } else {
            console.log(consoleMsg);
        }

        // Send to Discord if webhook is configured
        if (!this.webhookUrl) return;

        try {
            const embed = {
                color: this.colors[level] || this.colors.info,
                author: {
                    name: this.projectName
                },
                description: `${this.icons[level] || ''} ${message}`,
                timestamp: new Date().toISOString()
            };

            // Add error details if present
            if (details) {
                if (details instanceof Error) {
                    embed.fields = [{
                        name: 'Error Details',
                        value: `\`\`\`${details.stack || details.message}\`\`\``.substring(0, 1024)
                    }];
                } else if (typeof details === 'object') {
                    embed.fields = [{
                        name: 'Details',
                        value: `\`\`\`json\n${JSON.stringify(details, null, 2)}\`\`\``.substring(0, 1024)
                    }];
                } else {
                    embed.fields = [{
                        name: 'Details',
                        value: String(details).substring(0, 1024)
                    }];
                }
            }

            await this.sendWebhook({ embeds: [embed] });
        } catch (err) {
            console.error(`[${this.projectName}] Failed to send Discord log:`, err.message);
        }
    }

    /**
     * Send raw webhook payload
     * @param {Object} payload - Discord webhook payload
     */
    sendWebhook(payload) {
        return new Promise((resolve, reject) => {
            if (!this.webhookUrl) {
                return resolve();
            }

            const url = new URL(this.webhookUrl);
            const protocol = url.protocol === 'https:' ? https : http;

            const data = JSON.stringify(payload);

            const options = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            };

            const req = protocol.request(options, (res) => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve();
                } else {
                    reject(new Error(`Webhook returned ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.setTimeout(5000, () => {
                req.destroy();
                reject(new Error('Webhook timeout'));
            });

            req.write(data);
            req.end();
        });
    }

    // Convenience methods
    info(message, details) { return this.log('info', message, details); }
    success(message, details) { return this.log('success', message, details); }
    warn(message, details) { return this.log('warn', message, details); }
    error(message, details) { return this.log('error', message, details); }
    debug(message, details) { return this.log('debug', message, details); }

    /**
     * Log application startup
     */
    startup() {
        return this.success(`**${this.projectName}** started`);
    }

    /**
     * Log application shutdown
     */
    shutdown() {
        return this.warn(`**${this.projectName}** shutting down`);
    }
}

// Export singleton instance
module.exports = new DiscordLogger();
