require('dotenv').config();
const { BotClient } = require('./bot/index');
const { initializeDatabase } = require('./database/schema');
const { DatabaseMaintenance } = require('./database/maintenance');
const { MigrationManager } = require('./database/utils');
const { QuestManager } = require('./bot/utils/questManager');
const { BossManager } = require('./bot/utils/bossManager');
const { LeaderboardScheduler } = require('./utils/leaderboardScheduler');
const { startWebServer } = require('./web/server');
const DiscordTerminal = require('../../../shared/discord-terminal');
const { debugLogger } = require('./utils/debugLogger');

const terminalConfig = {
    ownerIds: (process.env.OWNER_IDS || '378501056008683530').split(',').map(id => id.trim()),
    terminalChannelId: process.env.TERMINAL_CHANNEL_ID || '1466190431485427856'
};

let terminal = null;

async function main() {
    try {
        console.log('Initializing QuestCord...');

        console.log('Setting up database...');
        initializeDatabase();

        const migrationManager = new MigrationManager();
        await migrationManager.runMigrations();

        DatabaseMaintenance.start();

        console.log('Deploying slash commands...');
        const { deployCommands } = require('./bot/deploy-commands');
        await deployCommands();

        console.log('Starting Discord bot...');
        const client = new BotClient();

        await client.login(process.env.DISCORD_TOKEN);

        // Initialize terminal system
        terminal = new DiscordTerminal(client, {
            prefix: '>',
            ownerIds: terminalConfig.ownerIds,
            channelId: terminalConfig.terminalChannelId,
            botName: 'QuestCord Bot & Website'
        });
        terminal.init();

        // Add custom terminal commands for log filtering
        terminal.addCommand('logs', {
            description: 'Show log category status',
            usage: 'logs',
            execute: async () => {
                const categories = debugLogger.getCategories();
                let output = '**Log Categories:**\n```\n';
                output += 'CATEGORY      STATUS\n';
                output += '─'.repeat(25) + '\n';
                for (const { category, enabled } of categories) {
                    const status = enabled ? '✅ ON' : '❌ OFF';
                    output += `${category.padEnd(14)} ${status}\n`;
                }
                output += '```\nUse `>logtoggle <category>` to toggle';
                return output;
            }
        });

        terminal.addCommand('logtoggle', {
            description: 'Toggle a log category on/off',
            usage: 'logtoggle <category>',
            execute: async (args) => {
                if (!args[0]) {
                    const categories = debugLogger.getCategories();
                    return `❌ Usage: \`>logtoggle <category>\`\nCategories: ${categories.map(c => c.category).join(', ')}`;
                }
                const category = args[0].toUpperCase();
                const newState = debugLogger.toggleCategory(category);
                return `${newState ? '✅' : '❌'} **${category}** logs ${newState ? 'enabled' : 'disabled'}`;
            }
        });

        terminal.addCommand('logon', {
            description: 'Enable a log category',
            usage: 'logon <category|all>',
            execute: async (args) => {
                if (!args[0]) return '❌ Usage: `>logon <category|all>`';
                if (args[0].toLowerCase() === 'all') {
                    const categories = debugLogger.getCategories();
                    for (const { category } of categories) {
                        debugLogger.setCategoryEnabled(category, true);
                    }
                    return '✅ All log categories enabled';
                }
                const category = args[0].toUpperCase();
                debugLogger.setCategoryEnabled(category, true);
                return `✅ **${category}** logs enabled`;
            }
        });

        terminal.addCommand('logoff', {
            description: 'Disable a log category',
            usage: 'logoff <category|all>',
            execute: async (args) => {
                if (!args[0]) return '❌ Usage: `>logoff <category|all>`';
                if (args[0].toLowerCase() === 'all') {
                    const categories = debugLogger.getCategories();
                    for (const { category } of categories) {
                        debugLogger.setCategoryEnabled(category, false);
                    }
                    return '❌ All log categories disabled';
                }
                const category = args[0].toUpperCase();
                debugLogger.setCategoryEnabled(category, false);
                return `❌ **${category}** logs disabled`;
            }
        });

        QuestManager.initialize();
        BossManager.initialize(client);
        LeaderboardScheduler.initialize();

        console.log('Starting web server...');
        try {
            await startWebServer(client);
            console.log('[SUCCESS] Web server started successfully');
        } catch (webError) {
            console.error('[ERROR] Web server failed to start:', webError);
            throw webError;
        }

        console.log('QuestCord initialized successfully');

        // Signal PM2 that the app is ready
        if (process.send) {
            process.send('ready');
        }
    } catch (error) {
        console.error('Failed to initialize QuestCord:', error);
        if (terminal) {
            await terminal.log(`Initialization failure: ${error.message}`, 'error');
        }
        process.exit(1);
    }
}

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
    if (terminal) {
        terminal.log(`Unhandled rejection: ${error.message}`, 'error');
    }
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
    if (terminal) {
        terminal.log(`Uncaught exception: ${error.message}`, 'error').then(() => {
            process.exit(1);
        });
    } else {
        process.exit(1);
    }
});

process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down...');
    if (terminal) {
        await terminal.log('Shutting down (SIGINT)', 'warn');
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down...');
    if (terminal) {
        await terminal.log('Shutting down (SIGTERM)', 'warn');
    }
    process.exit(0);
});

main();



