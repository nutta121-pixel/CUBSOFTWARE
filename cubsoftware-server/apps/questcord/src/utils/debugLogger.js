// Debug Logger - Sends debug information to Discord terminal channel as embeds
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const DEBUG_CHANNEL_ID = process.env.TERMINAL_CHANNEL_ID || '1466190431485427856';
const SETTINGS_FILE = path.join(__dirname, '..', '..', 'debug-settings.json');

class DebugLogger {
    constructor() {
        this.client = null;
        this.debugChannel = null;
        this.enabled = true;
        this.queue = [];
        this.lastMessageTime = 0;
        this.messageCount = 0;
        this.rateLimitWindow = 5000;
        this.maxMessagesPerWindow = 4;
        this.colors = {
            info: 0x3b82f6,
            success: 0x22c55e,
            warn: 0xf59e0b,
            error: 0xef4444
        };
        this.icons = {
            info: '\u2139\uFE0F',
            success: '\u2705',
            warn: '\u26A0\uFE0F',
            error: '\u274C'
        };
        // Category filters - set to false to disable logging for specific categories
        this.categoryFilters = {
            'WEBSITE': true,
            'WEBSOCKET': true,
            'QUEST': true,
            'BOSS': true,
            'DATABASE': true,
            'API': true,
            'COMMAND': true,
            'EVENT': true,
            'TRAVEL': true,
            'LEADERBOARD': true
        };
        // Load saved settings
        this._loadSettings();
    }

    _loadSettings() {
        try {
            if (fs.existsSync(SETTINGS_FILE)) {
                const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
                if (data.categoryFilters) {
                    this.categoryFilters = { ...this.categoryFilters, ...data.categoryFilters };
                }
                console.log('[DEBUG] Loaded settings from file');
            }
        } catch (err) {
            console.error('[DEBUG] Failed to load settings:', err.message);
        }
    }

    _saveSettings() {
        try {
            const data = { categoryFilters: this.categoryFilters };
            fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf8');
        } catch (err) {
            console.error('[DEBUG] Failed to save settings:', err.message);
        }
    }

    isCategoryEnabled(category) {
        const upperCategory = category.toUpperCase();
        // If category not in filters, default to enabled
        if (!(upperCategory in this.categoryFilters)) {
            return true;
        }
        return this.categoryFilters[upperCategory];
    }

    setCategoryEnabled(category, enabled) {
        const upperCategory = category.toUpperCase();
        this.categoryFilters[upperCategory] = enabled;
        this._saveSettings();
        console.log(`[DEBUG] Category ${upperCategory} ${enabled ? 'enabled' : 'disabled'}`);
    }

    toggleCategory(category) {
        const upperCategory = category.toUpperCase();
        const newState = !this.isCategoryEnabled(upperCategory);
        this.setCategoryEnabled(upperCategory, newState);
        return newState;
    }

    getCategories() {
        return Object.entries(this.categoryFilters).map(([category, enabled]) => ({
            category,
            enabled
        }));
    }

    setClient(client) {
        this.client = client;
        this.debugChannel = client.channels.cache.get(DEBUG_CHANNEL_ID);

        if (!this.debugChannel) {
            console.log('[DEBUG] Debug channel not found, attempting to fetch...');
            client.channels.fetch(DEBUG_CHANNEL_ID).then(channel => {
                this.debugChannel = channel;
                console.log('[DEBUG] Debug channel fetched successfully');
                this.flushQueue();
            }).catch(err => {
                console.error('[DEBUG] Failed to fetch debug channel:', err);
            });
        } else {
            this.flushQueue();
        }

        setInterval(() => {
            if (this.queue.length > 0) {
                this.flushQueue();
            }
        }, 10000);
    }

    async log(category, message, data = null, level = 'info') {
        if (!this.enabled) return;
        if (!this.isCategoryEnabled(category)) return;

        console.log(`[DEBUG ${category}] ${message}`, data || '');

        if (!this.debugChannel) {
            this.queue.push({ category, message, data, level });
            return;
        }

        const now = Date.now();
        if (now - this.lastMessageTime > this.rateLimitWindow) {
            this.messageCount = 0;
            this.lastMessageTime = now;
        }

        if (this.messageCount >= this.maxMessagesPerWindow) {
            this.queue.push({ category, message, data, level });
            return;
        }

        try {
            const embed = new EmbedBuilder()
                .setColor(this.colors[level] || this.colors.info)
                .setDescription(`${this.icons[level] || ''} **[${category}]** ${message}`)
                .setFooter({ text: 'QuestCord' })
                .setTimestamp();

            if (data) {
                const dataStr = JSON.stringify(data, null, 2).substring(0, 1000);
                embed.addFields({ name: 'Details', value: `\`\`\`json\n${dataStr}\n\`\`\`` });
            }

            await this.debugChannel.send({ embeds: [embed] });
            this.messageCount++;
        } catch (error) {
            console.error('[DEBUG] Failed to send debug message:', error);
        }
    }

    async flushQueue() {
        if (!this.debugChannel || this.queue.length === 0) return;

        for (const item of this.queue) {
            try {
                const embed = new EmbedBuilder()
                    .setColor(this.colors[item.level] || this.colors.info)
                    .setDescription(`${this.icons[item.level] || ''} **[${item.category}]** ${item.message}`)
                    .setFooter({ text: 'QuestCord' })
                    .setTimestamp();

                if (item.data) {
                    const dataStr = JSON.stringify(item.data, null, 2).substring(0, 1000);
                    embed.addFields({ name: 'Details', value: `\`\`\`json\n${dataStr}\n\`\`\`` });
                }

                await this.debugChannel.send({ embeds: [embed] });
                await new Promise(resolve => setTimeout(resolve, 100));
            } catch (error) {
                console.error('[DEBUG] Failed to send queued message:', error);
            }
        }

        this.queue = [];
    }

    async error(category, error, context = null) {
        const errorData = {
            message: error.message,
            stack: error.stack?.substring(0, 500),
            context
        };
        await this.log(category, `Error: ${error.message}`, errorData, 'error');
    }

    async success(category, message, data = null) {
        await this.log(category, message, data, 'success');
    }

    async info(category, message, data = null) {
        await this.log(category, message, data, 'info');
    }

    async warn(category, message, data = null) {
        await this.log(category, message, data, 'warn');
    }
}

const debugLogger = new DebugLogger();

module.exports = { debugLogger };
