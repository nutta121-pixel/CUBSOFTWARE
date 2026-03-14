const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const DiscordTerminal = require('../cubsoftware-server/shared/discord-terminal');

const terminalConfig = {
    ownerIds: (process.env.OWNER_IDS || '378501056008683530').split(',').map(id => id.trim()),
    terminalChannelId: process.env.TERMINAL_CHANNEL_ID || '1466190703637037250'
};

let terminal = null;

// Auto-deploy commands on startup
async function deployCommands() {
    const commands = [];
    const commandsPath = path.join(__dirname, 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command) {
            commands.push(command.data.toJSON());
        }
    }

    const rest = new REST({ version: '10' }).setToken(config.token);

    try {
        console.log(`[DEPLOY] Registering ${commands.length} commands globally...`);
        await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
        console.log(`[DEPLOY] Successfully registered ${commands.length} global commands`);
    } catch (error) {
        console.error('[DEPLOY] Failed to deploy commands:', error.message);
    }
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Initialize commands collection
client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);

        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            console.log(`[INFO] Loaded command: ${command.data.name}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing required "data" or "execute" property.`);
        }
    }
}

// Load events
const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

    for (const file of eventFiles) {
        const filePath = path.join(eventsPath, file);
        const event = require(filePath);

        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args));
        } else {
            client.on(event.name, (...args) => event.execute(...args));
        }
        console.log(`[INFO] Loaded event: ${event.name}`);
    }
}

// Initialize mute tracking system
client.activeMutes = new Map();

// Initialize confinement tracking system
client.activeConfinements = new Map();

// Initialize voice channel blocks tracking system
client.voiceChannelBlocks = new Map();

// Initialize temporary data storage for multi-step interactions
client.tempConfinementData = new Map();

// Deploy commands and login
(async () => {
    // Deploy commands first
    await deployCommands();

    // Then login
    client.login(config.token).catch(error => {
        console.error('[ERROR] Failed to login to Discord:');
        console.error(error.message);
        console.error('\nPlease check your DISCORD_TOKEN in the .env file.');
        process.exit(1);
    });
})();

// Initialize terminal after client is ready
client.once('ready', () => {
    console.log(`[INFO] ${client.user.tag} is online!`);

    terminal = new DiscordTerminal(client, {
        prefix: '>',
        ownerIds: terminalConfig.ownerIds,
        channelId: terminalConfig.terminalChannelId,
        botName: 'Onion Bot'
    });
    terminal.init();
});

// Handle graceful shutdown
const shutdown = async (signal) => {
    console.log(`[SHUTDOWN] Received ${signal}, shutting down...`);
    if (terminal) {
        await terminal.log(`Shutting down (${signal})`, 'warn');
    }

    setTimeout(() => {
        client.destroy();
        process.exit(0);
    }, 2000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('uncaughtException', async (error) => {
    console.error('[FATAL] Uncaught Exception:', error);
    if (terminal) {
        await terminal.log(`Uncaught Exception: ${error.message}`, 'error');
    }
    setTimeout(() => process.exit(1), 2000);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
    if (terminal) {
        terminal.log(`Unhandled Rejection: ${reason}`, 'error');
    }
});
