const { EmbedBuilder, WebhookClient } = require('discord.js');
const os = require('os');

class ReportingSystem {
    constructor(client) {
        this.client = client;
        this.reportChannelId = '1466190431485427856';
        this.reportGuildId = '1284593395188367502';
        this.lastReport = null;
        this.startTime = Date.now();
        this.errorCount = 0;
        this.commandsExecuted = 0;
        this.questsCompleted = 0;
        this.bossesDefeated = 0;
    }

    async initialize() {
        console.log('[Reporting] Initializing reporting system...');

        // Send startup report
        await this.sendStartupReport();

        // Schedule regular reports every 6 hours to avoid flooding
        setInterval(() => this.sendStatusReport(), 6 * 60 * 60 * 1000);

        // Schedule daily summary at midnight
        this.scheduleDailySummary();

        console.log('[Reporting] Reporting system initialized');
    }

    async getReportChannel() {
        try {
            const guild = await this.client.guilds.fetch(this.reportGuildId);
            const channel = await guild.channels.fetch(this.reportChannelId);
            return channel;
        } catch (error) {
            console.error('CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143 — [Reporting] Failed to get report channel:', error);
            return null;
        }
    }

    async sendStartupReport() {
        const channel = await this.getReportChannel();
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0x00FF00)
            .setTitle('🟢 QuestCord Bot Started')
            .setDescription('The bot has successfully started and is now online.')
            .addFields(
                { name: '📊 Server Count', value: `${this.client.guilds.cache.size}`, inline: true },
                { name: '👥 Total Users', value: `${this.getTotalUsers()}`, inline: true },
                { name: '🖥️ Platform', value: `${os.platform()} ${os.arch()}`, inline: true },
                { name: '💾 Memory', value: `${this.getMemoryUsage()}`, inline: true },
                { name: '⚡ Node Version', value: process.version, inline: true },
                { name: '🕒 Started At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143 — [Reporting] Failed to send startup report:', error);
        }
    }

    async sendStatusReport() {
        const channel = await this.getReportChannel();
        if (!channel) return;

        const uptime = this.getUptime();

        const embed = new EmbedBuilder()
            .setColor(0x0099FF)
            .setTitle('📊 QuestCord Status Report')
            .setDescription('Regular status update from QuestCord')
            .addFields(
                { name: '⏱️ Uptime', value: uptime, inline: true },
                { name: '📊 Servers', value: `${this.client.guilds.cache.size}`, inline: true },
                { name: '👥 Users', value: `${this.getTotalUsers()}`, inline: true },
                { name: '💾 Memory Usage', value: this.getMemoryUsage(), inline: true },
                { name: '📈 CPU Usage', value: `${this.getCPUUsage()}%`, inline: true },
                { name: '⚡ Commands Run', value: `${this.commandsExecuted}`, inline: true },
                { name: '🎯 Quests Completed', value: `${this.questsCompleted}`, inline: true },
                { name: '🐉 Bosses Defeated', value: `${this.bossesDefeated}`, inline: true },
                { name: '❌ Errors', value: `${this.errorCount}`, inline: true }
            )
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143 — [Reporting] Failed to send status report:', error);
        }
    }

    async sendErrorReport(error, context = '') {
        const channel = await this.getReportChannel();
        if (!channel) return;

        this.errorCount++;

        const embed = new EmbedBuilder()
            .setColor(0xFF0000)
            .setTitle('❌ Error Detected')
            .setDescription(`An error occurred in the QuestCord bot`)
            .addFields(
                { name: '📝 Context', value: context || 'No context provided' },
                { name: '⚠️ Error Message', value: `\`\`\`${error.message?.substring(0, 1000) || 'Unknown error'}\`\`\`` },
                { name: '📚 Stack Trace', value: `\`\`\`${error.stack?.substring(0, 1000) || 'No stack trace'}\`\`\`` },
                { name: '🕒 Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            )
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143 — [Reporting] Failed to send error report:', err);
        }
    }

    async sendShutdownReport(reason = 'Unknown') {
        const channel = await this.getReportChannel();
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0xFF9900)
            .setTitle('🔴 QuestCord Bot Shutting Down')
            .setDescription(`The bot is shutting down`)
            .addFields(
                { name: '📝 Reason', value: reason },
                { name: '⏱️ Uptime', value: this.getUptime() },
                { name: '📊 Final Stats', value: `Servers: ${this.client.guilds.cache.size}\nCommands: ${this.commandsExecuted}\nQuests: ${this.questsCompleted}` },
                { name: '🕒 Shutdown Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>` }
            )
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143 — [Reporting] Failed to send shutdown report:', error);
        }
    }

    async sendMetricUpdate(metric, value, description = '') {
        // Only send important metric updates to avoid spam
        if (!this.shouldReportMetric(metric)) return;

        const channel = await this.getReportChannel();
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setColor(0x00FFFF)
            .setTitle(`📊 Metric Update: ${metric}`)
            .setDescription(description || `${metric} has been updated`)
            .addFields(
                { name: '📈 Value', value: `${value}`, inline: true },
                { name: '🕒 Time', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
            )
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143 — [Reporting] Failed to send metric update:', error);
        }
    }

    shouldReportMetric(metric) {
        // Only report significant milestones to avoid spam
        const milestones = {
            'servers': [10, 25, 50, 100, 250, 500, 1000],
            'users': [100, 500, 1000, 5000, 10000],
            'quests': [100, 500, 1000, 5000, 10000],
            'bosses': [50, 100, 500, 1000]
        };

        return true; // Let the caller decide what's important
    }

    scheduleDailySummary() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const timeUntilMidnight = tomorrow - now;

        setTimeout(() => {
            this.sendDailySummary();
            // Schedule next one in 24 hours
            setInterval(() => this.sendDailySummary(), 24 * 60 * 60 * 1000);
        }, timeUntilMidnight);
    }

    async sendDailySummary() {
        const channel = await this.getReportChannel();
        if (!channel) return;

        const { GlobalStatsModel } = require('../database/models');
        const stats = GlobalStatsModel.get();

        const embed = new EmbedBuilder()
            .setColor(0xFFD700)
            .setTitle('📊 Daily Summary Report')
            .setDescription('24-hour summary of QuestCord activity')
            .addFields(
                { name: '🎯 Total Quests Completed', value: `${stats.total_quests_completed || 0}`, inline: true },
                { name: '🐉 Total Bosses Defeated', value: `${this.bossesDefeated}`, inline: true },
                { name: '⚡ Commands Executed', value: `${this.commandsExecuted}`, inline: true },
                { name: '📊 Active Servers', value: `${stats.total_servers || 0}`, inline: true },
                { name: '👥 Total Users', value: `${stats.total_users || 0}`, inline: true },
                { name: '⏱️ Current Uptime', value: this.getUptime(), inline: true },
                { name: '💾 Memory Usage', value: this.getMemoryUsage(), inline: true },
                { name: '❌ Errors (24h)', value: `${this.errorCount}`, inline: true },
                { name: '🔄 Restarts (24h)', value: `${this.getRestartCount()}`, inline: true }
            )
            .setTimestamp();

        try {
            await channel.send({ embeds: [embed] });
            // Reset daily counters
            this.errorCount = 0;
            this.commandsExecuted = 0;
        } catch (error) {
            console.error('CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143 — [Reporting] Failed to send daily summary:', error);
        }
    }

    // Utility methods
    getTotalUsers() {
        return this.client.guilds.cache.reduce((acc, guild) => acc + guild.memberCount, 0);
    }

    getMemoryUsage() {
        const used = process.memoryUsage();
        return `${Math.round(used.heapUsed / 1024 / 1024)}MB / ${Math.round(used.heapTotal / 1024 / 1024)}MB`;
    }

    getCPUUsage() {
        const cpus = os.cpus();
        const avgLoad = os.loadavg()[0] / cpus.length * 100;
        return avgLoad.toFixed(2);
    }

    getUptime() {
        const uptime = Date.now() - this.startTime;
        const days = Math.floor(uptime / (1000 * 60 * 60 * 24));
        const hours = Math.floor((uptime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60));

        return `${days}d ${hours}h ${minutes}m`;
    }

    getRestartCount() {
        // This would need to be persisted to track across restarts
        // For now, return 0
        return 0;
    }

    // Increment methods for tracking
    incrementCommands() {
        this.commandsExecuted++;
    }

    incrementQuests() {
        this.questsCompleted++;
    }

    incrementBosses() {
        this.bossesDefeated++;
    }
}

let reportingInstance = null;

function initializeReporting(client) {
    if (!reportingInstance) {
        reportingInstance = new ReportingSystem(client);
        reportingInstance.initialize();
    }
    return reportingInstance;
}

function getReportingInstance() {
    return reportingInstance;
}

module.exports = { ReportingSystem, initializeReporting, getReportingInstance };
