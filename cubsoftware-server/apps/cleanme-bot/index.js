const { Client, GatewayIntentBits, PermissionFlagsBits, ChannelType, Collection, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, REST, Routes, SlashCommandBuilder, ActivityType, MessageFlags } = require('discord.js');

// Yellow [Tag] labels in PM2 log output
{ const _l = console.log.bind(console); console.log = (...a) => { if (typeof a[0] === 'string') a[0] = a[0].replace(/\[([A-Za-z][A-Za-z0-9 _-]*)\]/g, '\x1b[33m[$1]\x1b[0m'); _l(...a); }; }
const fs = require('fs');
const path = require('path');
require('dotenv').config();
const DiscordTerminal = require('../../shared/discord-terminal');
let _errorReporterModule = null;
try { _errorReporterModule = require('../../shared/cub-error-reporter'); } catch (e) { console.warn('[ErrorReporter] cub-error-reporter not available:', e.message); }
const ERRORS = _errorReporterModule?.ERRORS || {};
let errorReporter = null;

const terminalConfig = {
    ownerIds: (process.env.OWNER_IDS || '378501056008683530,738723658352296017').split(',').map(id => id.trim()),
    terminalChannelId: process.env.TERMINAL_CHANNEL_ID || '1466190431485427856',
    eventsChannelId: process.env.BOT_EVENTS_CHANNEL_ID || '1466190584372003092',
};

let terminal = null;
const BOT_START_TIME = Date.now();

// Define slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all CleanMe bot commands and how to use them'),

    new SlashCommandBuilder()
        .setName('save')
        .setDescription('Save your current server configuration (roles, channels, categories)'),

    new SlashCommandBuilder()
        .setName('list')
        .setDescription('Check if your server has a saved configuration'),

    new SlashCommandBuilder()
        .setName('lookup')
        .setDescription('Look up a saved configuration by server ID')
        .addStringOption(option =>
            option.setName('serverid')
                .setDescription('The server ID to look up')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('delete')
        .setDescription('Delete your server\'s saved configuration'),

    new SlashCommandBuilder()
        .setName('copy')
        .setDescription('Copy another server\'s saved configuration to your server')
        .addStringOption(option =>
            option.setName('serverid')
                .setDescription('The server ID to copy the configuration from')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('clean')
        .setDescription('Delete ALL channels and roles from your server'),

    new SlashCommandBuilder()
        .setName('cleanroles')
        .setDescription('Delete all roles from your server'),

    new SlashCommandBuilder()
        .setName('cleanchannels')
        .setDescription('Delete all channels and categories from your server'),

].map(command => command.toJSON());

// Deploy commands function
async function deployCommands() {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    try {
        console.log(`[Commands] Deploying ${commands.length} slash commands globally...`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`[Commands] Deployed ${data.length} slash commands`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_CLEANME_DEPLOY_COMMANDS_151 — Error deploying commands:', error);
    }
}

// Data storage path
const DATA_DIR = path.join(__dirname, 'data');
const SAVES_FILE = path.join(DATA_DIR, 'server-saves.json');
const STATUS_CHANNELS_FILE = path.join(DATA_DIR, 'status-channels.json');

function loadStatusChannels() {
    try {
        if (fs.existsSync(STATUS_CHANNELS_FILE)) return JSON.parse(fs.readFileSync(STATUS_CHANNELS_FILE, 'utf8'));
    } catch (_) {}
    return {};
}
function saveStatusChannel(channelId, categoryId) {
    const data = loadStatusChannels();
    data[channelId] = categoryId || null;
    fs.writeFileSync(STATUS_CHANNELS_FILE, JSON.stringify(data, null, 2));
}
function removeStatusChannel(channelId) {
    const data = loadStatusChannels();
    delete data[channelId];
    fs.writeFileSync(STATUS_CHANNELS_FILE, JSON.stringify(data, null, 2));
}

const PENDING_CLEANS_FILE = path.join(DATA_DIR, 'pending-cleans.json');
function loadPendingCleans() {
    try {
        if (fs.existsSync(PENDING_CLEANS_FILE)) return JSON.parse(fs.readFileSync(PENDING_CLEANS_FILE, 'utf8'));
    } catch (_) {}
    return {};
}
function savePendingClean(guildId, userId, statusChannelId, statusCategoryId) {
    const data = loadPendingCleans();
    data[guildId] = { userId, statusChannelId: statusChannelId || null, statusCategoryId: statusCategoryId || null };
    fs.writeFileSync(PENDING_CLEANS_FILE, JSON.stringify(data, null, 2));
}
function removePendingClean(guildId) {
    const data = loadPendingCleans();
    delete data[guildId];
    fs.writeFileSync(PENDING_CLEANS_FILE, JSON.stringify(data, null, 2));
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load or initialize saves
function loadSaves() {
    if (fs.existsSync(SAVES_FILE)) {
        return JSON.parse(fs.readFileSync(SAVES_FILE, 'utf8'));
    }
    return {};
}

function saveSaves(data) {
    fs.writeFileSync(SAVES_FILE, JSON.stringify(data, null, 2));
}

// Create client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

// Store pending confirmations
const pendingConfirmations = new Collection();

// Rich presence rotation
const presenceMessages = [
    { text: '/help - View all commands', type: ActivityType.Playing },
    { text: '/save - Backup your server', type: ActivityType.Playing },
    { text: '/copy - Clone a server setup', type: ActivityType.Playing },
    { text: '/clean - Wipe server clean', type: ActivityType.Playing },
    { text: '/list - Check saved configs', type: ActivityType.Playing },
    { text: '/cleanroles - Remove all roles', type: ActivityType.Playing },
    { text: '/cleanchannels - Remove all channels', type: ActivityType.Playing },
];

let presenceIndex = 0;

function updatePresence() {
    const presence = presenceMessages[presenceIndex];
    client.user.setActivity(presence.text, { type: presence.type });
    console.log(`[Presence] Updated to: ${presence.text}`);
    presenceIndex = (presenceIndex + 1) % presenceMessages.length;
}


client.once('clientReady', async () => {
    const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
    const totalChannels = client.guilds.cache.reduce((a, g) => a + g.channels.cache.size, 0);
    const totalRoles = client.guilds.cache.reduce((a, g) => a + g.roles.cache.size, 0);
    console.log(`[Ready] CleanMe Bot online as ${client.user.tag}`);
    console.log(`[Ready] ${client.guilds.cache.size} servers | ${totalMembers} members | ${totalChannels} channels | ${totalRoles} roles | WS ping: ${client.ws.ping}ms`);

    // Initialize terminal
    terminal = new DiscordTerminal(client, {
        prefix: '>',
        ownerIds: terminalConfig.ownerIds,
        channelId: terminalConfig.terminalChannelId,
        eventsChannelId: terminalConfig.eventsChannelId,
        botName: 'CleanMe Bot',
        botId: 'cleanme',
        aliases: ['cleanmebot', 'cm'],
        autoClear: false,
        systemCommands: false,
    });
    terminal.init();

    // ── Error Reporter ────────────────────────────────────────────────────────
    if (_errorReporterModule) {
        errorReporter = _errorReporterModule.createErrorReporter(client, 'CleanMe');
        errorReporter.hookConsoleError();
    }

    // Resume any clean jobs that were interrupted by a restart
    const pendingCleans = loadPendingCleans();
    const resumingChannelIds = new Set();
    for (const [guildId, job] of Object.entries(pendingCleans)) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) { removePendingClean(guildId); continue; }
        let statusChannel = null, statusCategory = null;
        if (job.statusChannelId) {
            statusChannel = await client.channels.fetch(job.statusChannelId).catch(() => null);
            if (statusChannel) resumingChannelIds.add(job.statusChannelId);
        }
        if (job.statusCategoryId) statusCategory = guild.channels.cache.get(job.statusCategoryId) || null;
        console.log(`[Clean] Resuming interrupted clean for "${guild.name}"`);
        if (statusChannel) await statusChannel.send('🔄 **Bot restarted** — resuming clean from where it left off...').catch(() => {});
        _executeClean(guild, job.userId, statusChannel, statusCategory).catch(e =>
            console.error(`[Clean] Resume failed for "${guild.name}": ${e.message}`)
        );
    }

    // Re-attach close buttons to completed status channels that survived restart (not currently resuming)
    const pendingStatusChannels = loadStatusChannels();
    for (const [channelId] of Object.entries(pendingStatusChannels)) {
        if (resumingChannelIds.has(channelId)) continue;
        try {
            const channel = await client.channels.fetch(channelId).catch(() => null);
            if (!channel) { removeStatusChannel(channelId); continue; }
            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_status_channel').setLabel('🗑️ Close this channel').setStyle(ButtonStyle.Danger)
            );
            await channel.send({ content: '🔄 **Bot restarted.** Click the button below to close this status channel.', components: [closeRow] }).catch(() => {});
            console.log(`[CleanMe] Re-attached close button to status channel ${channelId}`);
        } catch (_) {}
    }

    // Add custom terminal commands
    terminal.addCommand('saves', {
        description: 'List all saved server configurations',
        usage: 'saves',
        execute: async () => {
            const saves = loadSaves();
            const serverIds = Object.keys(saves);
            if (serverIds.length === 0) {
                return '📋 No saves found';
            }
            let output = '📋 **Saved Servers:**\n```\n';
            for (const id of serverIds) {
                const save = saves[id];
                output += `${id} - ${save.guildName}\n`;
                output += `  Roles: ${save.roles.length}, Channels: ${save.channels.length}, Categories: ${save.categories.length}\n`;
                output += `  Saved: ${new Date(save.savedAt).toLocaleString()}\n\n`;
            }
            output += '```';
            return output;
        }
    });

    terminal.addCommand('saveinfo', {
        description: 'Get detailed info about a save',
        usage: 'saveinfo <serverid>',
        execute: async (args) => {
            if (!args[0]) return '❌ Usage: `>saveinfo <serverid>`';
            const saves = loadSaves();
            const save = saves[args[0]];
            if (!save) return `❌ No save found for server ID: ${args[0]}`;

            let output = `📋 **Save Info for ${save.guildName}**\n`;
            output += `Server ID: ${args[0]}\n`;
            output += `Saved: ${new Date(save.savedAt).toLocaleString()}\n\n`;
            output += `**Roles (${save.roles.length}):**\n\`\`\`\n`;
            output += save.roles.slice(0, 15).map(r => r.name).join(', ');
            if (save.roles.length > 15) output += `\n... and ${save.roles.length - 15} more`;
            output += '\n```\n';
            output += `**Categories (${save.categories.length}):**\n\`\`\`\n`;
            output += save.categories.map(c => c.name).join(', ') || 'None';
            output += '\n```\n';
            output += `**Channels (${save.channels.length}):**\n\`\`\`\n`;
            output += save.channels.slice(0, 15).map(c => c.name).join(', ');
            if (save.channels.length > 15) output += `\n... and ${save.channels.length - 15} more`;
            output += '\n```';
            return output;
        }
    });

    terminal.addCommand('deletesave', {
        description: 'Delete a saved server configuration',
        usage: 'deletesave <serverid>',
        execute: async (args) => {
            if (!args[0]) return '❌ Usage: `>deletesave <serverid>`';
            const saves = loadSaves();
            if (!saves[args[0]]) return `❌ No save found for server ID: ${args[0]}`;
            const name = saves[args[0]].guildName;
            delete saves[args[0]];
            saveSaves(saves);
            return `🗑️ Deleted save for **${name}** (${args[0]})`;
        }
    });

    // Deploy commands on startup
    await deployCommands();

    // Start presence rotation (every 60 seconds)
    updatePresence();
    setInterval(updatePresence, 60000);

    console.log(`[Ready] Commands registered: ${commands.length}`);

    // Log stats every 60 seconds
    const logStats = () => {
        const total = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
        const channels = client.guilds.cache.reduce((a, g) => a + g.channels.cache.size, 0);
        const uptimeSec = Math.floor((Date.now() - BOT_START_TIME) / 1000);
        const h = Math.floor(uptimeSec / 3600), m = Math.floor((uptimeSec % 3600) / 60), s = uptimeSec % 60;
        const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
        console.log(`[Stats] ${client.guilds.cache.size} servers | ${total} members | ${channels} channels | ping: ${client.ws.ping}ms | mem: ${mem}MB | uptime: ${h}h${m}m${s}s`);
    };
    setInterval(logStats, 60000);

    // Discord.js internal events
    client.on('warn', (msg) => console.log(`[Warn] ${msg}`));
    client.rest.on('rateLimited', (info) => {
        const global = info.global ? ' [GLOBAL]' : '';
        console.log(`[RateLimit]${global} ${info.method} ${info.route} | retry: ${info.retryAfter}ms | limit: ${info.limit}`);
    });
});

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
    // Handle button interactions
    if (interaction.isButton()) {
        await handleButton(interaction);
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    const _cmdStart = Date.now();
    console.log(`[Command] /${commandName} by ${interaction.user.username} in ${interaction.guild?.name || 'DM'}`);

    // Check if user has admin permissions (except for help)
    if (commandName !== 'help') {
        if (!interaction.member || !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.reply({
                content: '❌ You need Administrator permissions to use this command.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    try {
    switch (commandName) {
        case 'help':
            await handleHelp(interaction);
            break;
        case 'save':
            await handleSave(interaction);
            break;
        case 'list':
            await handleList(interaction);
            break;
        case 'lookup':
            await handleLookup(interaction);
            break;
        case 'delete':
            await handleDelete(interaction);
            break;
        case 'copy':
            await handleCopy(interaction);
            break;
        case 'clean':
            await handleClean(interaction);
            break;
        case 'cleanroles':
            await handleCleanRoles(interaction);
            break;
        case 'cleanchannels':
            await handleCleanChannels(interaction);
            break;
    }
    const _cmdMs = Date.now() - _cmdStart;
    if (_cmdMs > 2000) console.log(`[Slow] /${commandName} took ${_cmdMs}ms in ${interaction.guild?.name || 'DM'}`);
    } catch (err) {
        console.error(`CUBSOFTWARE_ERROR_CLEANME_CMD_HANDLER_152 — [Error] /${commandName} threw: ${err.message}`);
        if (!interaction.replied && !interaction.deferred) {
            interaction.reply({ content: '❌ An error occurred.', flags: MessageFlags.Ephemeral }).catch(() => {});
        }
    }
});

// Help command
async function handleHelp(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🧹 CleanMe Bot - Help')
        .setColor(0x5865F2)
        .setDescription('CleanMe helps you manage, backup, and restore your Discord server configuration.')
        .addFields(
            {
                name: '📥 /save',
                value: 'Save your current server configuration (roles, channels, categories). Each server can have one save.',
                inline: false
            },
            {
                name: '📋 /list',
                value: 'Check if your server has a saved configuration and view its details.',
                inline: false
            },
            {
                name: '🔍 /lookup [serverid]',
                value: 'Look up any server\'s saved configuration by their server ID. See what roles, channels, and categories are included.',
                inline: false
            },
            {
                name: '🗑️ /delete',
                value: 'Delete your server\'s saved configuration. Others will no longer be able to copy it.',
                inline: false
            },
            {
                name: '📤 /copy [serverid]',
                value: 'Copy another server\'s saved configuration to your server. **Warning:** This will wipe your current setup first!',
                inline: false
            },
            {
                name: '💣 /clean',
                value: 'Delete ALL channels and roles from your server.',
                inline: false
            },
            {
                name: '🎭 /cleanroles',
                value: 'Delete all roles from your server (except @everyone and roles above the bot).',
                inline: false
            },
            {
                name: '📁 /cleanchannels',
                value: 'Delete all channels and categories from your server.',
                inline: false
            },
        )
        .addFields({
            name: '⚠️ Important Notes',
            value: '• Only **Administrators** can use these commands (except /help)\n• Save data can be shared between servers using the server ID\n• **Be careful!** Clean and copy operations are destructive and cannot be undone!',
            inline: false
        })
        .setFooter({ text: 'CleanMe Bot • Use responsibly!' })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

// Save command
async function handleSave(interaction) {
    const saves = loadSaves();
    const guildId = interaction.guild.id;

    // Check if save already exists
    if (saves[guildId]) {
        const confirmId = `save_override_${guildId}_${Date.now()}`;
        pendingConfirmations.set(confirmId, {
            type: 'save_override',
            guildId: guildId,
            userId: interaction.user.id,
            expires: Date.now() + 60000 // 1 minute
        });

        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`confirm_${confirmId}`)
                    .setLabel('Override Save')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`cancel_${confirmId}`)
                    .setLabel('Cancel')
                    .setStyle(ButtonStyle.Secondary)
            );

        const embed = new EmbedBuilder()
            .setTitle('⚠️ Save Already Exists')
            .setColor(0xFFA500)
            .setDescription(`This server already has a saved configuration from **${new Date(saves[guildId].savedAt).toLocaleString()}**.\n\nDo you want to override it?`)
            .addFields(
                { name: 'Saved Roles', value: `${saves[guildId].roles.length}`, inline: true },
                { name: 'Saved Channels', value: `${saves[guildId].channels.length}`, inline: true },
                { name: 'Saved Categories', value: `${saves[guildId].categories.length}`, inline: true }
            );

        return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }

    await performSave(interaction);
}

async function performSave(interaction, isOverride = false) {
    // Only defer if not already deferred (override case)
    if (!isOverride) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    }

    try {
        const guild = interaction.guild;
        const saves = loadSaves();

        // Gather server data
        const serverData = {
            guildName: guild.name,
            savedAt: Date.now(),
            savedBy: interaction.user.id,
            roles: [],
            channels: [],
            categories: []
        };

        // Save roles (exclude @everyone and managed roles)
        guild.roles.cache.forEach(role => {
            if (role.id !== guild.id && !role.managed) {
                serverData.roles.push({
                    name: role.name,
                    color: role.color,
                    hoist: role.hoist,
                    position: role.position,
                    permissions: role.permissions.bitfield.toString(),
                    mentionable: role.mentionable
                });
            }
        });

        // Sort roles by position (highest first for proper recreation)
        serverData.roles.sort((a, b) => b.position - a.position);

        // Save categories first
        guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).forEach(category => {
            serverData.categories.push({
                name: category.name,
                position: category.position,
                permissionOverwrites: serializePermissions(category.permissionOverwrites.cache, guild)
            });
        });

        // Sort categories by position
        serverData.categories.sort((a, b) => a.position - b.position);

        // Save channels
        guild.channels.cache.filter(c => c.type !== ChannelType.GuildCategory).forEach(channel => {
            serverData.channels.push({
                name: channel.name,
                type: channel.type,
                position: channel.position,
                parentName: channel.parent ? channel.parent.name : null,
                topic: channel.topic || null,
                nsfw: channel.nsfw || false,
                rateLimitPerUser: channel.rateLimitPerUser || 0,
                bitrate: channel.bitrate || null,
                userLimit: channel.userLimit || null,
                permissionOverwrites: serializePermissions(channel.permissionOverwrites.cache, guild)
            });
        });

        // Sort channels by position within their category
        serverData.channels.sort((a, b) => a.position - b.position);

        // Save to file
        saves[guild.id] = serverData;
        saveSaves(saves);
        console.log(`[Save] ${isOverride ? 'Override' : 'New'} save for "${guild.name}" (${guild.id}) — ${serverData.roles.length} roles, ${serverData.channels.length} channels, ${serverData.categories.length} categories by ${interaction.user.username}`);

        const embed = new EmbedBuilder()
            .setTitle(isOverride ? '✅ Save Overridden' : '✅ Server Saved')
            .setColor(0x00FF00)
            .setDescription(`Server configuration has been saved successfully!`)
            .addFields(
                { name: 'Server Name', value: guild.name, inline: true },
                { name: 'Server ID', value: guild.id, inline: true },
                { name: '\u200b', value: '\u200b', inline: true },
                { name: 'Roles Saved', value: `${serverData.roles.length}`, inline: true },
                { name: 'Channels Saved', value: `${serverData.channels.length}`, inline: true },
                { name: 'Categories Saved', value: `${serverData.categories.length}`, inline: true }
            )
            .setFooter({ text: `Others can copy this setup using: /copy ${guild.id}` })
            .setTimestamp();

        const publishRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`cleanme_publish_${guild.id}`)
                    .setLabel('Publish to CleanMe Website')
                    .setStyle(ButtonStyle.Primary)
                    .setEmoji('🌐')
            );

        await interaction.editReply({ embeds: [embed], components: [publishRow] });

    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_CLEANME_SAVE_ERROR_153 — Save error:', error);
        await interaction.editReply({
            content: `❌ Error saving server: ${error.message}`,
            components: []
        });
    }
}

// Helper function to serialize permission overwrites
function serializePermissions(overwrites, guild) {
    const serialized = [];
    overwrites.forEach(overwrite => {
        // Find the role/member name for this overwrite
        let targetName = null;
        let targetType = overwrite.type; // 0 = role, 1 = member

        if (overwrite.type === 0) { // Role
            const role = guild.roles.cache.get(overwrite.id);
            if (role) {
                targetName = role.id === guild.id ? '@everyone' : role.name;
            }
        }
        // We skip member-specific permissions as they can't be reliably restored

        if (targetName) {
            serialized.push({
                targetName: targetName,
                targetType: targetType,
                allow: overwrite.allow.bitfield.toString(),
                deny: overwrite.deny.bitfield.toString()
            });
        }
    });
    return serialized;
}

// List command
async function handleList(interaction) {
    const saves = loadSaves();
    const guildId = interaction.guild.id;

    if (!saves[guildId]) {
        const embed = new EmbedBuilder()
            .setTitle('📋 Server Save Status')
            .setColor(0xFF6B6B)
            .setDescription('This server does **not** have a saved configuration.')
            .addFields({
                name: 'How to Save',
                value: 'Use `/save` to save your current server setup.',
                inline: false
            })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const save = saves[guildId];
    const embed = new EmbedBuilder()
        .setTitle('📋 Server Save Status')
        .setColor(0x00FF00)
        .setDescription('This server **has** a saved configuration!')
        .addFields(
            { name: 'Server Name (at save time)', value: save.guildName, inline: true },
            { name: 'Server ID', value: guildId, inline: true },
            { name: 'Saved At', value: new Date(save.savedAt).toLocaleString(), inline: true },
            { name: 'Roles', value: `${save.roles.length}`, inline: true },
            { name: 'Channels', value: `${save.channels.length}`, inline: true },
            { name: 'Categories', value: `${save.categories.length}`, inline: true }
        )
        .addFields({
            name: 'Share This Setup',
            value: `Others can copy this setup using:\n\`/copy ${guildId}\``,
            inline: false
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// Lookup command - look up any server's save by ID
async function handleLookup(interaction) {
    const targetServerId = interaction.options.getString('serverid');
    const saves = loadSaves();

    if (!saves[targetServerId]) {
        const embed = new EmbedBuilder()
            .setTitle('🔍 Save Lookup')
            .setColor(0xFF6B6B)
            .setDescription(`No saved configuration found for server ID: \`${targetServerId}\``)
            .addFields({
                name: 'Tip',
                value: 'Make sure the server has used `/save` to save their configuration first.',
                inline: false
            })
            .setTimestamp();

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const save = saves[targetServerId];

    // Show role names (first 20)
    const roleNames = save.roles.slice(0, 20).map(r => r.name).join(', ');
    const roleText = roleNames + (save.roles.length > 20 ? `\n... and ${save.roles.length - 20} more` : '');

    // Show category names
    const categoryNames = save.categories.map(c => c.name).join(', ') || 'None';

    // Show channel names (first 20)
    const channelNames = save.channels.slice(0, 20).map(c => `#${c.name}`).join(', ');
    const channelText = channelNames + (save.channels.length > 20 ? `\n... and ${save.channels.length - 20} more` : '');

    const embed = new EmbedBuilder()
        .setTitle('🔍 Save Lookup')
        .setColor(0x5865F2)
        .setDescription(`Found saved configuration for **${save.guildName}**`)
        .addFields(
            { name: 'Server ID', value: targetServerId, inline: true },
            { name: 'Saved At', value: new Date(save.savedAt).toLocaleString(), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: `Roles (${save.roles.length})`, value: roleText || 'None', inline: false },
            { name: `Categories (${save.categories.length})`, value: categoryNames, inline: false },
            { name: `Channels (${save.channels.length})`, value: channelText || 'None', inline: false }
        )
        .addFields({
            name: 'Copy This Setup',
            value: `Use \`/copy ${targetServerId}\` to copy this configuration to your server.\n⚠️ This will wipe your current setup!`,
            inline: false
        })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// Delete command - delete your server's save
async function handleDelete(interaction) {
    const saves = loadSaves();
    const guildId = interaction.guild.id;

    if (!saves[guildId]) {
        return interaction.reply({
            content: '❌ This server does not have a saved configuration to delete.',
            flags: MessageFlags.Ephemeral
        });
    }

    const confirmId = `delete_${guildId}_${Date.now()}`;
    pendingConfirmations.set(confirmId, {
        type: 'delete_save',
        guildId: guildId,
        userId: interaction.user.id,
        expires: Date.now() + 60000
    });

    const save = saves[guildId];
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${confirmId}`)
                .setLabel('Yes, Delete Save')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_${confirmId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Delete Saved Configuration')
        .setColor(0xFF0000)
        .setDescription('Are you sure you want to delete this server\'s saved configuration?')
        .addFields(
            { name: 'Server Name', value: save.guildName, inline: true },
            { name: 'Saved At', value: new Date(save.savedAt).toLocaleString(), inline: true },
            { name: '\u200b', value: '\u200b', inline: true },
            { name: 'Roles', value: `${save.roles.length}`, inline: true },
            { name: 'Channels', value: `${save.channels.length}`, inline: true },
            { name: 'Categories', value: `${save.categories.length}`, inline: true }
        )
        .addFields({
            name: '🚨 This cannot be undone!',
            value: 'Other servers will no longer be able to copy this configuration.',
            inline: false
        });

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

// Helper function to check if bot has highest role position (excluding managed roles)
function checkBotRolePosition(guild) {
    const botMember = guild.members.me;
    const botHighestRole = botMember.roles.highest;

    // Get all non-managed, non-everyone roles
    const nonManagedRoles = guild.roles.cache.filter(r =>
        r.id !== guild.id && !r.managed
    );

    // Check if any non-managed role is above the bot
    const rolesAboveBot = nonManagedRoles.filter(r => r.position > botHighestRole.position);

    return {
        isHighest: rolesAboveBot.size === 0,
        botPosition: botHighestRole.position,
        botRole: botHighestRole,
        rolesAbove: rolesAboveBot.map(r => r.name)
    };
}

// Comprehensive permission check before copy/clean operations
function checkBotPermissions(guild) {
    const botMember = guild.members.me;
    const requiredPermissions = [
        { flag: PermissionFlagsBits.ManageChannels, name: 'Manage Channels' },
        { flag: PermissionFlagsBits.ManageRoles, name: 'Manage Roles' },
        { flag: PermissionFlagsBits.ManageGuild, name: 'Manage Server' }
    ];

    const missing = [];
    const hasAdmin = botMember.permissions.has(PermissionFlagsBits.Administrator);

    if (!hasAdmin) {
        for (const perm of requiredPermissions) {
            if (!botMember.permissions.has(perm.flag)) {
                missing.push(perm.name);
            }
        }
    }

    // Check role position
    const roleCheck = checkBotRolePosition(guild);
    const hasAllPermissions = hasAdmin || missing.length === 0;

    return {
        hasAdmin: hasAdmin,
        hasAllPermissions: hasAllPermissions,
        missingPermissions: missing,
        rolePosition: roleCheck,
        canProceed: hasAllPermissions && roleCheck.isHighest
    };
}

// Map Discord API errors to plain-English reasons
function friendlyError(e) {
    const code = e.code ?? e.status;
    switch (code) {
        case 50013: return 'Bot is missing permission to delete this';
        case 50001: return 'Bot does not have access to this resource';
        case 50003: return 'Cannot delete a DM channel';
        case 10003: return 'Channel no longer exists (already deleted)';
        case 10011: return 'Role no longer exists (already deleted)';
        case 10007: return 'Member not found in guild';
        case 10008: return 'Message no longer exists (already deleted)';
        case 30002: return 'Max channels reached on this server';
        case 20001: return 'Bots cannot use this endpoint';
        default:
            if (e.message?.includes('Missing Access') || e.message?.includes('Missing Permissions')) return 'Bot is missing permission to delete this';
            if (e.message?.includes('Unknown Channel')) return 'Channel no longer exists (already deleted)';
            if (e.message?.includes('Unknown Role')) return 'Role no longer exists (already deleted)';
            return e.message || 'Unknown error';
    }
}

// Progress bar helper
function createProgressBar(current, total, width = 20) {
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((current / total) * width);
    const empty = width - filled;
    const bar = '█'.repeat(filled) + '░'.repeat(empty);
    return `[${bar}] ${percentage}% (${current}/${total})`;
}

// Rate limit handling with exponential backoff
async function safeApiCall(fn, maxRetries = 5, baseDelay = 1000, onRateLimit = null) {
    let lastError;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (error.code === 50013) {
                // Missing permissions - don't retry
                throw error;
            }
            if (error.httpStatus === 429 || error.code === 'RateLimitError' || error.status === 429) {
                const retryAfter = error.retryAfter || (baseDelay * Math.pow(2, attempt));
                console.log(`[RateLimit] Hit on attempt ${attempt + 1}/${maxRetries} — waiting ${retryAfter}ms`);
                if (onRateLimit) {
                    try { await onRateLimit(retryAfter); } catch (e) { /* ignore */ }
                }
                await sleep(retryAfter);
                continue;
            }
            // For other errors, use exponential backoff
            const delay = baseDelay * Math.pow(2, attempt);
            console.log(`Error (attempt ${attempt + 1}/${maxRetries}): ${error.message}, waiting ${delay}ms`);
            await sleep(delay);
        }
    }
    throw lastError;
}

// Send DM to owner about operation status
async function sendOwnerDM(client, ownerId, title, description, color = 0x5865F2) {
    try {
        const owner = await client.users.fetch(ownerId).catch(() => null);
        if (owner) {
            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(description)
                .setColor(color)
                .setTimestamp();
            await owner.send({ embeds: [embed] }).catch(() => {});
        }
    } catch (e) {
        console.log('Could not send owner DM:', e.message);
    }
}

// Bot owner ID for DMs
const BOT_OWNER_ID = process.env.OWNER_IDS?.split(',')[0]?.trim() || '378501056008683530';

// Copy command
async function handleCopy(interaction) {
    const targetServerId = interaction.options.getString('serverid');
    const saves = loadSaves();

    // Check if target server has a save
    if (!saves[targetServerId]) {
        return interaction.reply({
            content: `❌ No saved configuration found for server ID: \`${targetServerId}\``,
            flags: MessageFlags.Ephemeral
        });
    }

    // Comprehensive permission check BEFORE showing the wipe button
    const permCheck = checkBotPermissions(interaction.guild);

    if (!permCheck.canProceed) {
        const embed = new EmbedBuilder()
            .setTitle('⚠️ Bot Setup Required')
            .setColor(0xFF6B6B)
            .setDescription('The CleanMe bot needs proper permissions before it can copy server configurations.')
            .setTimestamp();

        // Check if missing admin
        if (!permCheck.hasAllPermissions) {
            embed.addFields({
                name: '🔐 Missing Permissions',
                value: 'The bot is missing required permissions.\n\n**How to fix:**\n1. Go to **Server Settings** → **Roles**\n2. Find the **CleanMe** role\n3. Enable **Manage Channels**, **Manage Roles**, and **Manage Server**\n4. Run this command again',
                inline: false
            });

            if (permCheck.missingPermissions.length > 0) {
                embed.addFields({
                    name: '❌ Missing',
                    value: permCheck.missingPermissions.join(', '),
                    inline: false
                });
            }
        }

        // Check role position
        if (!permCheck.rolePosition.isHighest) {
            embed.addFields(
                {
                    name: '📍 Role Position Too Low',
                    value: `The bot's role "${permCheck.rolePosition.botRole.name}" must be at the **top of the role list** to create and manage all roles.`,
                    inline: false
                },
                {
                    name: '🔧 How to Fix Role Position',
                    value: '1. Go to **Server Settings** → **Roles**\n2. Drag the **CleanMe** role to the **very top** of the list (above all other roles)\n3. Run this command again',
                    inline: false
                },
                {
                    name: `❌ Roles Above Bot (${permCheck.rolePosition.rolesAbove.length})`,
                    value: permCheck.rolePosition.rolesAbove.slice(0, 10).join(', ') + (permCheck.rolePosition.rolesAbove.length > 10 ? `\n... and ${permCheck.rolePosition.rolesAbove.length - 10} more` : '') || 'None',
                    inline: false
                }
            );
        }

        embed.addFields({
            name: '💡 Quick Fix',
            value: 'Give the bot **Manage Channels**, **Manage Roles**, and **Manage Server** permissions AND move its role to the **top of the role list**, then run this command again.\n\nAlternatively, you can [re-invite the bot](https://discord.com/oauth2/authorize?client_id=' + process.env.CLIENT_ID + '&permissions=268436528&scope=bot%20applications.commands) with the correct permissions.',
            inline: false
        });

        return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    const save = saves[targetServerId];
    const confirmId = `copy_${targetServerId}_${interaction.guild.id}_${Date.now()}`;

    pendingConfirmations.set(confirmId, {
        type: 'copy',
        sourceServerId: targetServerId,
        targetGuildId: interaction.guild.id,
        userId: interaction.user.id,
        expires: Date.now() + 60000
    });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${confirmId}`)
                .setLabel('Yes, Wipe & Copy')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_${confirmId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Server Copy')
        .setColor(0xFF0000)
        .setDescription(`**WARNING:** This will **DELETE ALL** channels and roles from your current server, then recreate the setup from **${save.guildName}**.`)
        .addFields(
            { name: 'Source Server', value: save.guildName, inline: true },
            { name: 'Source ID', value: targetServerId, inline: true },
            { name: 'Saved At', value: new Date(save.savedAt).toLocaleString(), inline: true },
            { name: 'Roles to Create', value: `${save.roles.length}`, inline: true },
            { name: 'Channels to Create', value: `${save.channels.length}`, inline: true },
            { name: 'Categories to Create', value: `${save.categories.length}`, inline: true }
        )
        .addFields(
            {
                name: '✅ Permission Check Passed',
                value: 'Bot has required permissions and is at the top of the role hierarchy.',
                inline: false
            },
            {
                name: '🚨 This action cannot be undone!',
                value: 'Make sure you have saved your current server configuration if you want to keep it.',
                inline: false
            }
        );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function performCopy(interaction, sourceServerId) {
    const saves = loadSaves();
    const save = saves[sourceServerId];
    const guild = interaction.guild;

    let statusChannel = null;
    let statusCategory = null;
    let statusMessage = null;
    let rateLimitPaused = false;

    // Wrapper around safeApiCall that notifies the status channel on rate limits
    const safeCall = async (fn) => {
        const result = await safeApiCall(fn, 5, 1000, async (retryAfter) => {
            rateLimitPaused = true;
            const seconds = Math.ceil(retryAfter / 1000);
            if (statusChannel) {
                await statusChannel.send(
                    `⏳ **Rate limited by Discord.** Pausing for ~${seconds} second${seconds !== 1 ? 's' : ''}, then continuing automatically...`
                ).catch(() => {});
            }
        });
        rateLimitPaused = false;
        return result;
    };

    // Helper function to clean up temp channel
    const cleanupStatusChannel = async (delay = 0) => {
        if (delay > 0) await sleep(delay);
        try {
            if (statusChannel && statusChannel.deletable) {
                await statusChannel.delete().catch(() => {});
            }
            if (statusCategory && statusCategory.deletable) {
                await statusCategory.delete().catch(() => {});
            }
        } catch (e) {
            console.log('Could not delete status channel:', e.message);
        }
    };

    // Update the main progress embed
    const updateProgressEmbed = async (step, stepName, current, total, details = '', isError = false) => {
        if (!statusMessage) return;

        const steps = [
            { name: 'Deleting Channels', icon: '🗑️' },
            { name: 'Deleting Roles', icon: '🗑️' },
            { name: 'Creating Roles', icon: '🎭' },
            { name: 'Creating Categories', icon: '📁' },
            { name: 'Creating Channels', icon: '📺' }
        ];

        let description = `Copying configuration from **${save.guildName}**\n\n`;

        for (let i = 0; i < steps.length; i++) {
            if (i < step) {
                description += `✅ ${steps[i].name}\n`;
            } else if (i === step) {
                const bar = createProgressBar(current, total);
                description += `${steps[i].icon} **${steps[i].name}**\n${bar}\n`;
                if (details) {
                    description += `└─ ${details}\n`;
                }
            } else {
                description += `⬚ ${steps[i].name}\n`;
            }
        }

        if (rateLimitPaused) {
            description += '\n⚠️ **Rate Limited** - Waiting for Discord cooldown...';
        }

        const embed = new EmbedBuilder()
            .setTitle('🔄 Server Copy In Progress')
            .setColor(isError ? 0xFF6B6B : 0x5865F2)
            .setDescription(description)
            .setFooter({ text: 'Do not close this channel' })
            .setTimestamp();

        try {
            await statusMessage.edit({ embeds: [embed] });
        } catch (e) {
            // Message might have been deleted
        }
    };

    // Log action to status channel
    const logAction = async (action, success = true) => {
        if (!statusChannel) return;
        try {
            await statusChannel.send(`${success ? '✓' : '✗'} ${action}`).catch(() => {});
        } catch (e) {
            // Ignore
        }
    };

    try {
        // Final permission check
        const permCheck = checkBotPermissions(guild);
        if (!permCheck.canProceed) {
            await interaction.editReply({
                content: '❌ **Error:** Bot permissions have changed. Please ensure the bot has **Manage Channels**, **Manage Roles**, and **Manage Server** permissions and its role is at the top of the role list, then try again.',
                embeds: [],
                components: []
            });
            return;
        }

        // Step 0: Create temporary status category and channel FIRST
        await interaction.editReply({
            content: '🔄 Setting up... Creating status channel.',
            embeds: [],
            components: []
        });

        try {
            statusCategory = await safeCall(() => guild.channels.create({
                name: '⚙️ CUBSOFTWARE',
                type: ChannelType.GuildCategory,
                reason: 'CleanMe Bot - Temporary status channel'
            }));

            statusChannel = await safeCall(() => guild.channels.create({
                name: 'copy-status',
                type: ChannelType.GuildText,
                parent: statusCategory,
                reason: 'CleanMe Bot - Temporary status channel'
            }));

            // Send initial progress message
            const initialEmbed = new EmbedBuilder()
                .setTitle('🔄 Server Copy Starting...')
                .setColor(0x5865F2)
                .setDescription(`Preparing to copy configuration from **${save.guildName}**\n\n**Items to process:**\n• ${save.roles.length} roles\n• ${save.categories.length} categories\n• ${save.channels.length} channels`)
                .setTimestamp();

            statusMessage = await statusChannel.send({ embeds: [initialEmbed] });

        } catch (e) {
            console.error('CUBSOFTWARE_ERROR_CLEANME_STATUS_CHANNEL_154 — Failed to create status channel:', e);
            await interaction.editReply({
                content: `❌ **Error:** Could not create status channel. Make sure the bot has permission to create channels.\nError: ${e.message}`,
                embeds: [],
                components: []
            });
            return;
        }

        // Step 1: Delete all channels (except our status channel)
        const channels = guild.channels.cache.filter(c =>
            c.deletable &&
            c.id !== statusChannel.id &&
            c.id !== statusCategory.id
        );
        let deletedChannels = 0;
        const totalChannels = channels.size;

        for (const [, channel] of channels) {
            await updateProgressEmbed(0, 'Deleting Channels', deletedChannels, totalChannels, `Deleting #${channel.name}`);
            try {
                await safeCall(() => channel.delete());
                deletedChannels++;
                await logAction(`Deleted channel: ${channel.name}`);
                await sleep(800); // Slower to avoid rate limits
            } catch (e) {
                console.log(`Could not delete channel ${channel.name}: ${e.message}`);
                await logAction(`Failed to delete channel: ${channel.name} - ${e.message}`, false);
            }
        }
        await updateProgressEmbed(0, 'Deleting Channels', totalChannels, totalChannels, 'Complete');

        // Step 2: Delete all roles
        const roles = guild.roles.cache.filter(r =>
            r.id !== guild.id &&
            !r.managed &&
            r.position < guild.members.me.roles.highest.position
        );
        let deletedRoles = 0;
        const totalRoles = roles.size;

        for (const [, role] of roles) {
            await updateProgressEmbed(1, 'Deleting Roles', deletedRoles, totalRoles, `Deleting @${role.name}`);
            try {
                await safeCall(() => role.delete());
                deletedRoles++;
                await logAction(`Deleted role: ${role.name}`);
                await sleep(500);
            } catch (e) {
                console.log(`Could not delete role ${role.name}: ${e.message}`);
                await logAction(`Failed to delete role: ${role.name} - ${e.message}`, false);
            }
        }
        await updateProgressEmbed(1, 'Deleting Roles', totalRoles, totalRoles, 'Complete');

        // Step 3: Create roles
        const roleMap = new Map();
        const roleErrors = [];
        // Sort roles from highest to lowest position so they stack correctly when created
        const sortedRoles = [...save.roles].sort((a, b) => b.position - a.position);
        let rolesCreated = 0;

        for (const roleData of sortedRoles) {
            await updateProgressEmbed(2, 'Creating Roles', rolesCreated, save.roles.length, `Creating @${roleData.name}`);
            try {
                const newRole = await safeCall(() => guild.roles.create({
                    name: roleData.name,
                    ...(roleData.color ? { colors: [roleData.color] } : {}),
                    hoist: roleData.hoist,
                    permissions: BigInt(roleData.permissions),
                    mentionable: roleData.mentionable,
                    reason: 'CleanMe Bot - Server Copy'
                }));
                roleMap.set(roleData.name, newRole);
                rolesCreated++;
                await logAction(`Created role: ${roleData.name}`);
                await sleep(500);
            } catch (e) {
                console.log(`Could not create role ${roleData.name}: ${e.message}`);
                roleErrors.push(`${roleData.name}: ${e.message}`);
                await logAction(`Failed to create role: ${roleData.name} - ${e.message}`, false);
            }
        }
        await updateProgressEmbed(2, 'Creating Roles', save.roles.length, save.roles.length, 'Complete');

        // Try to reorder roles - sort by original position (highest first) and assign new positions
        try {
            const rolePositions = [];
            // Get roles sorted by their original position (highest first)
            const rolesWithPositions = [...save.roles]
                .sort((a, b) => b.position - a.position)
                .map(roleData => ({
                    role: roleMap.get(roleData.name),
                    originalPosition: roleData.position
                }))
                .filter(r => r.role);

            // Calculate max position we can use (below bot's highest role)
            const maxPosition = guild.members.me.roles.highest.position - 1;

            // Assign positions from top to bottom
            rolesWithPositions.forEach((r, index) => {
                rolePositions.push({
                    role: r.role.id,
                    position: Math.max(1, maxPosition - index)
                });
            });

            if (rolePositions.length > 0) {
                await safeCall(() => guild.roles.setPositions(rolePositions));
            }
        } catch (e) {
            console.log('Could not reorder roles:', e.message);
        }

        // Step 4: Create categories
        const categoryMap = new Map();
        const categoryErrors = [];
        let categoriesCreated = 0;

        for (const catData of save.categories) {
            await updateProgressEmbed(3, 'Creating Categories', categoriesCreated, save.categories.length, `Creating ${catData.name}`);
            try {
                const permissionOverwrites = buildPermissionOverwrites(catData.permissionOverwrites, roleMap, guild);
                const newCategory = await safeCall(() => guild.channels.create({
                    name: catData.name,
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: permissionOverwrites,
                    reason: 'CleanMe Bot - Server Copy'
                }));
                categoryMap.set(catData.name, newCategory);
                categoriesCreated++;
                await logAction(`Created category: ${catData.name}`);
                await sleep(500);
            } catch (e) {
                console.log(`Could not create category ${catData.name}: ${e.message}`);
                categoryErrors.push(`${catData.name}: ${e.message}`);
                await logAction(`Failed to create category: ${catData.name} - ${e.message}`, false);
            }
        }
        await updateProgressEmbed(3, 'Creating Categories', save.categories.length, save.categories.length, 'Complete');

        // Step 5: Create channels
        let channelsCreated = 0;
        const channelErrors = [];

        for (const channelData of save.channels) {
            await updateProgressEmbed(4, 'Creating Channels', channelsCreated, save.channels.length, `Creating #${channelData.name}`);
            try {
                const permissionOverwrites = buildPermissionOverwrites(channelData.permissionOverwrites, roleMap, guild);
                const channelOptions = {
                    name: channelData.name,
                    type: channelData.type,
                    parent: channelData.parentName ? categoryMap.get(channelData.parentName) : null,
                    permissionOverwrites: permissionOverwrites,
                    reason: 'CleanMe Bot - Server Copy'
                };

                if (channelData.type === ChannelType.GuildText) {
                    if (channelData.topic) channelOptions.topic = channelData.topic;
                    if (channelData.nsfw) channelOptions.nsfw = channelData.nsfw;
                    if (channelData.rateLimitPerUser) channelOptions.rateLimitPerUser = channelData.rateLimitPerUser;
                } else if (channelData.type === ChannelType.GuildVoice || channelData.type === ChannelType.GuildStageVoice) {
                    if (channelData.bitrate) channelOptions.bitrate = Math.min(channelData.bitrate, 96000);
                    if (channelData.userLimit) channelOptions.userLimit = channelData.userLimit;
                }

                await safeCall(() => guild.channels.create(channelOptions));
                channelsCreated++;
                await logAction(`Created channel: #${channelData.name}`);
                await sleep(500);
            } catch (e) {
                console.log(`Could not create channel ${channelData.name}: ${e.message}`);
                channelErrors.push(`${channelData.name}: ${e.message}`);
                await logAction(`Failed to create channel: #${channelData.name} - ${e.message}`, false);
            }
        }
        await updateProgressEmbed(4, 'Creating Channels', save.channels.length, save.channels.length, 'Complete');

        // Done! Send completion message
        const hasErrors = roleErrors.length > 0 || categoryErrors.length > 0 || channelErrors.length > 0;
        const totalErrors = roleErrors.length + categoryErrors.length + channelErrors.length;

        const doneEmbed = new EmbedBuilder()
            .setTitle(hasErrors ? '⚠️ Server Copy Complete (with errors)' : '✅ Server Copy Complete!')
            .setColor(hasErrors ? 0xFFA500 : 0x00FF00)
            .setDescription(`Successfully copied configuration from **${save.guildName}**!\n\nThis status channel will be deleted in 30 seconds.`)
            .addFields(
                { name: 'Roles', value: `${roleMap.size}/${save.roles.length}`, inline: true },
                { name: 'Categories', value: `${categoryMap.size}/${save.categories.length}`, inline: true },
                { name: 'Channels', value: `${channelsCreated}/${save.channels.length}`, inline: true }
            )
            .setTimestamp();

        if (hasErrors) {
            const allErrors = [
                ...roleErrors.slice(0, 3).map(e => `Role: ${e}`),
                ...categoryErrors.slice(0, 3).map(e => `Category: ${e}`),
                ...channelErrors.slice(0, 3).map(e => `Channel: ${e}`)
            ];
            const errorText = allErrors.join('\n') + (totalErrors > 9 ? `\n... and ${totalErrors - 9} more` : '');
            doneEmbed.addFields({ name: '❌ Some Errors Occurred', value: errorText || 'Unknown errors', inline: false });
        }

        await statusChannel.send({ embeds: [doneEmbed] }).catch(() => {});

        // Send to owner
        await sendOwnerDM(client, BOT_OWNER_ID, hasErrors ? '⚠️ Server Copy Complete (with errors)' : '✅ Server Copy Complete',
            `**Server:** ${guild.name}\n**Roles:** ${roleMap.size}/${save.roles.length}\n**Categories:** ${categoryMap.size}/${save.categories.length}\n**Channels:** ${channelsCreated}/${save.channels.length}\n${hasErrors ? `**Errors:** ${totalErrors}` : ''}`,
            hasErrors ? 0xFFA500 : 0x00FF00
        );

        // Send to a newly created channel
        const firstTextChannel = guild.channels.cache.find(c =>
            c.type === ChannelType.GuildText &&
            c.id !== statusChannel.id
        );
        if (firstTextChannel) {
            const welcomeEmbed = new EmbedBuilder()
                .setTitle('✅ Server Setup Complete!')
                .setColor(0x00FF00)
                .setDescription(`This server has been configured using **${save.guildName}**'s saved setup.`)
                .addFields(
                    { name: 'Roles Created', value: `${roleMap.size}`, inline: true },
                    { name: 'Categories Created', value: `${categoryMap.size}`, inline: true },
                    { name: 'Channels Created', value: `${channelsCreated}`, inline: true }
                )
                .setFooter({ text: 'CleanMe Bot' })
                .setTimestamp();
            await firstTextChannel.send({ embeds: [welcomeEmbed] }).catch(() => {});
        }

        // Delete status channel after 30 seconds
        await cleanupStatusChannel(30000);

    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_CLEANME_COPY_ERROR_155 — Copy error:', error);

        // Notify owner about error
        await sendOwnerDM(client, BOT_OWNER_ID, '❌ Server Copy Failed',
            `**Server:** ${guild.name} (${guild.id})\n**Error:** ${error.message}`,
            0xFF0000
        );

        if (statusChannel) {
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Error During Copy')
                .setColor(0xFF0000)
                .setDescription(`An error occurred during the copy process:\n\`\`\`${error.message}\`\`\`\n\nThis may be due to Discord rate limiting. Some items may have been created.\n\nThis channel will be deleted in 30 seconds.`)
                .setTimestamp();

            await statusChannel.send({ embeds: [errorEmbed] }).catch(() => {});
            await cleanupStatusChannel(30000);
        } else {
            await interaction.editReply({
                content: `❌ **Error during copy:** ${error.message}`,
                embeds: [],
                components: []
            }).catch(() => {});
        }
    }
}

// Helper function to build permission overwrites from saved data
function buildPermissionOverwrites(savedOverwrites, roleMap, guild) {
    const overwrites = [];
    for (const perm of savedOverwrites) {
        let targetId;
        if (perm.targetName === '@everyone') {
            targetId = guild.id;
        } else {
            const role = roleMap.get(perm.targetName);
            if (role) {
                targetId = role.id;
            } else {
                continue; // Skip if role doesn't exist
            }
        }
        overwrites.push({
            id: targetId,
            type: perm.targetType,
            allow: BigInt(perm.allow),
            deny: BigInt(perm.deny)
        });
    }
    return overwrites;
}

// Clean command (delete everything)
async function handleClean(interaction) {
    const confirmId = `clean_${interaction.guild.id}_${Date.now()}`;

    pendingConfirmations.set(confirmId, {
        type: 'clean',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        expires: Date.now() + 60000
    });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${confirmId}`)
                .setLabel('Yes, Delete Everything')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_${confirmId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setTitle('🚨 DANGER: Clean Server')
        .setColor(0xFF0000)
        .setDescription('**This will DELETE ALL channels and roles from your server!**\n\nOnly @everyone and the bot\'s required roles will remain.')
        .addFields({
            name: '⚠️ This action CANNOT be undone!',
            value: 'Consider using `/save` first to backup your configuration.',
            inline: false
        });

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function _executeClean(guild, userId, statusChannel, statusCategory, startTime = Date.now()) {
    const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('close_status_channel').setLabel('🗑️ Close this channel').setStyle(ButtonStyle.Danger)
    );

    const failedChannels = [];
    const failedRoles = [];
    const skippedRoles = [];
    let deletedChannels = 0, deletedRoles = 0;
    let textCount = 0, voiceCount = 0, categoryCount = 0, otherCount = 0;
    let statusMessage = null;

    const updateProgressEmbed = async (step, current, total, details = '') => {
        if (!statusMessage) return;
        const steps = [
            { name: 'Deleting Channels', icon: '🗑️' },
            { name: 'Deleting Roles',    icon: '🎭' },
        ];
        let description = `Cleaning **${guild.name}**\n\n`;
        for (let i = 0; i < steps.length; i++) {
            if (i < step) {
                description += `✅ ${steps[i].name}\n`;
            } else if (i === step) {
                description += `${steps[i].icon} **${steps[i].name}**\n${createProgressBar(current, total)}\n`;
                if (details) description += `└─ ${details}\n`;
            } else {
                description += `⬚ ${steps[i].name}\n`;
            }
        }
        const embed = new EmbedBuilder()
            .setTitle('🔄 Server Clean In Progress')
            .setColor(0xFF4444)
            .setDescription(description)
            .setFooter({ text: 'Do not close this channel' })
            .setTimestamp();
        await statusMessage.edit({ embeds: [embed] }).catch(() => {});
    };

    const logAction = async (action, success = true) => {
        if (!statusChannel) return;
        await statusChannel.send(`${success ? '✓' : '✗'} ${action}`).catch(() => {});
    };

    try {
        // Send initial status embed
        if (statusChannel) {
            const initialEmbed = new EmbedBuilder()
                .setTitle('🔄 Server Clean In Progress')
                .setColor(0xFF4444)
                .setDescription(`Cleaning **${guild.name}**\n\n⬚ Deleting Channels\n⬚ Deleting Roles`)
                .setFooter({ text: 'Do not close this channel' })
                .setTimestamp();
            statusMessage = await statusChannel.send({ embeds: [initialEmbed] }).catch(() => null);
        }

        // ── Phase 1: Channel removal ──────────────────────────────────────────
        const channels = guild.channels.cache.filter(c =>
            c.deletable &&
            c.id !== statusChannel?.id &&
            c.id !== statusCategory?.id
        );
        const totalChannels = channels.size;

        console.log(`[Clean] Starting channel removal on "${guild.name}" — ${totalChannels} channels`);

        for (const [, channel] of channels) {
            await updateProgressEmbed(0, deletedChannels, totalChannels, `Deleting #${channel.name}`);
            try {
                await channel.delete();
                deletedChannels++;
                if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) textCount++;
                else if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) voiceCount++;
                else if (channel.type === ChannelType.GuildCategory) categoryCount++;
                else otherCount++;
                await logAction(`Deleted channel: ${channel.name}`);
                await sleep(500);
            } catch (e) {
                failedChannels.push({ name: channel.name, reason: friendlyError(e) });
                await logAction(`Failed to delete channel: ${channel.name} — ${friendlyError(e)}`, false);
                console.log(`Could not delete channel: ${e.message}`);
            }
            if (totalChannels > 0 && (deletedChannels % 10 === 0 || deletedChannels + failedChannels.length === totalChannels)) {
                console.log(`[Clean] "${guild.name}" — Channels ${createProgressBar(deletedChannels + failedChannels.length, totalChannels)}`);
            }
        }

        await updateProgressEmbed(0, totalChannels, totalChannels, 'Complete');
        console.log(`[Clean] "${guild.name}" — Channel removal done: ${deletedChannels}/${totalChannels} deleted${failedChannels.length > 0 ? `, ${failedChannels.length} failed` : ''}`);

        // ── Phase 2: Role removal ─────────────────────────────────────────────
        guild.roles.cache.forEach(r => {
            if (r.id !== guild.id && (r.managed || r.position >= guild.members.me.roles.highest.position)) {
                skippedRoles.push({
                    name: r.name,
                    reason: r.managed
                        ? 'Managed by an integration — Discord does not allow manual deletion'
                        : 'Positioned above the bot\'s role — move the bot\'s role higher to delete this'
                });
            }
        });

        const roles = guild.roles.cache.filter(r =>
            r.id !== guild.id &&
            !r.managed &&
            r.position < guild.members.me.roles.highest.position
        );
        const totalRoles = roles.size;

        console.log(`[Clean] Starting role removal on "${guild.name}" — ${totalRoles} roles`);

        for (const [, role] of roles) {
            await updateProgressEmbed(1, deletedRoles, totalRoles, `Deleting @${role.name}`);
            try {
                await role.delete();
                deletedRoles++;
                await logAction(`Deleted role: ${role.name}`);
                await sleep(300);
            } catch (e) {
                failedRoles.push({ name: role.name, reason: friendlyError(e) });
                await logAction(`Failed to delete role: ${role.name} — ${friendlyError(e)}`, false);
                console.log(`Could not delete role: ${e.message}`);
            }
            if (totalRoles > 0 && (deletedRoles % 5 === 0 || deletedRoles + failedRoles.length === totalRoles)) {
                console.log(`[Clean] "${guild.name}" — Roles ${createProgressBar(deletedRoles + failedRoles.length, totalRoles)}`);
            }
        }

        await updateProgressEmbed(1, totalRoles, totalRoles, 'Complete');
        console.log(`[Clean] "${guild.name}" — Role removal done: ${deletedRoles}/${totalRoles} deleted${failedRoles.length > 0 ? `, ${failedRoles.length} failed` : ''}`);

        // Create a General category + #general channel so the server isn't completely empty
        try {
            const generalCategory = await guild.channels.create({
                name: 'General',
                type: ChannelType.GuildCategory,
                reason: 'CleanMe Bot — created after server clean'
            });
            await guild.channels.create({
                name: 'general',
                type: ChannelType.GuildText,
                parent: generalCategory,
                reason: 'CleanMe Bot — created after server clean'
            });
            await logAction('Created category: General + channel: #general');
            console.log(`[Clean] Created General/#general in "${guild.name}"`);
        } catch (e) {
            console.log(`[Clean] Could not create General/#general: ${friendlyError(e)}`);
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const hasIssues = failedChannels.length > 0 || failedRoles.length > 0;

        const doneEmbed = new EmbedBuilder()
            .setTitle(hasIssues ? '⚠️ Server Cleaned (with issues)' : '✅ Server Cleaned!')
            .setColor(hasIssues ? 0xFFA500 : 0x00FF00)
            .setDescription(hasIssues
                ? 'The server has been cleaned, but some items could not be deleted. See below for details.'
                : 'The server has been fully wiped clean.')
            .addFields(
                { name: 'Channels Deleted', value: `${deletedChannels}`, inline: true },
                { name: 'Roles Deleted', value: `${deletedRoles}`, inline: true },
                { name: 'Duration', value: `${duration}s`, inline: true }
            );

        const typeBreakdown = [
            textCount > 0 ? `• ${textCount} text` : null,
            voiceCount > 0 ? `• ${voiceCount} voice` : null,
            categoryCount > 0 ? `• ${categoryCount} categories` : null,
            otherCount > 0 ? `• ${otherCount} other` : null,
        ].filter(Boolean).join('\n');
        if (typeBreakdown) {
            doneEmbed.addFields({ name: 'Channel Breakdown', value: typeBreakdown, inline: false });
        }

        if (skippedRoles.length > 0) {
            const skippedText = skippedRoles.slice(0, 10).map(r => `• **${r.name}** — ${r.reason}`).join('\n')
                + (skippedRoles.length > 10 ? `\n... and ${skippedRoles.length - 10} more` : '');
            doneEmbed.addFields({
                name: `⏭️ Skipped Roles (${skippedRoles.length})`,
                value: skippedText,
                inline: false
            });
        }

        if (failedChannels.length > 0) {
            const failText = failedChannels.slice(0, 10).map(f => `• \`${f.name}\` — ${f.reason}`).join('\n')
                + (failedChannels.length > 10 ? `\n... and ${failedChannels.length - 10} more` : '');
            doneEmbed.addFields({
                name: `❌ Channels That Failed (${failedChannels.length})`,
                value: failText + '\n\n**To fix:** Manually delete them, or give the bot **Administrator** permission and run `/clean` again.',
                inline: false
            });
        }

        if (failedRoles.length > 0) {
            const failText = failedRoles.slice(0, 10).map(f => `• \`${f.name}\` — ${f.reason}`).join('\n')
                + (failedRoles.length > 10 ? `\n... and ${failedRoles.length - 10} more` : '');
            doneEmbed.addFields({
                name: `❌ Roles That Failed (${failedRoles.length})`,
                value: failText + '\n\n**To fix:** Manually delete them, or move the bot\'s role above them and run `/clean` again.',
                inline: false
            });
        }

        doneEmbed.addFields({
            name: '💡 Next Steps',
            value: '• Use `/save` to back up the current (clean) state\n• Use `/copy serverid:<serverid>` to restore a saved configuration\n• Click the button below to close this channel',
            inline: false
        }).setTimestamp();

        console.log(`[Clean] Completed for "${guild.name}" in ${duration}s — ${deletedChannels} channels, ${deletedRoles} roles deleted${hasIssues ? `, ${failedChannels.length} channel(s)/${failedRoles.length} role(s) failed` : ''}`);

        if (statusChannel) {
            await statusChannel.send({ content: `<@${userId}>`, embeds: [doneEmbed], components: [closeButton] }).catch(() => {});
        } else {
            try { const u = await client.users.fetch(userId); await u.send({ embeds: [doneEmbed] }); } catch (_) {}
        }

    } catch (error) {
        console.error(`CUBSOFTWARE_ERROR_CLEANME_CLEAN_FAILED_156 — [Error] Clean failed in "${guild.name}": ${error.message}`);

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        const errorEmbed = new EmbedBuilder()
            .setTitle('❌ Clean Failed')
            .setColor(0xFF0000)
            .setDescription(`Something went wrong during the clean after **${duration}s**:\n\`\`\`${error.message}\`\`\``)
            .addFields(
                {
                    name: 'Progress Before Failure',
                    value: `• ${deletedChannels} channel(s) deleted\n• ${deletedRoles} role(s) deleted`,
                    inline: false
                },
                {
                    name: 'What to do',
                    value: '• Make sure the bot has **Administrator** permission\n• Move the bot\'s role to the **top of the role list**\n• Try running `/clean` again',
                    inline: false
                }
            )
            .setTimestamp();

        if (statusChannel) {
            await statusChannel.send({ content: `<@${userId}>`, embeds: [errorEmbed], components: [closeButton] }).catch(() => {});
        } else {
            try {
                const user = await client.users.fetch(userId);
                errorEmbed.setDescription(`Something went wrong while cleaning **${guild.name}** after **${duration}s**:\n\`\`\`${error.message}\`\`\``);
                await user.send({ embeds: [errorEmbed] });
            } catch (e) {
                console.error(`Could not notify user about clean failure: ${e.message}`);
            }
        }
    } finally {
        removePendingClean(guild.id);
    }
}

async function performClean(interaction) {
    const guild = interaction.guild;
    const userId = interaction.user.id;
    const startTime = Date.now();

    // Create status channel and category FIRST so they survive the deletion
    let statusCategory = null;
    let statusChannel = null;

    try { await interaction.editReply({ content: '🔄 Setting up status channel...', embeds: [], components: [] }); } catch (_) {}

    try {
        statusCategory = await guild.channels.create({
            name: '⚙️ CUBSOFTWARE',
            type: ChannelType.GuildCategory,
            reason: 'CleanMe Bot - Clean status'
        });
        statusChannel = await guild.channels.create({
            name: 'cleanme-status',
            type: ChannelType.GuildText,
            parent: statusCategory,
            reason: 'CleanMe Bot - Clean status'
        });
        saveStatusChannel(statusChannel.id, statusCategory?.id ?? null);
        savePendingClean(guild.id, userId, statusChannel.id, statusCategory?.id ?? null);
        await statusChannel.send(`<@${userId}> 🗑️ **Server clean started.** All other channels and roles will be deleted. Click the button on the completion message to close this channel when you're done.`);
    } catch (setupErr) {
        console.error(`CUBSOFTWARE_ERROR_CLEANME_CLEAN_FAILED_156 — [Error] Could not create status channel in "${guild.name}": ${setupErr.message}`);
    }

    await _executeClean(guild, userId, statusChannel, statusCategory, startTime);
}

// Clean roles command
async function handleCleanRoles(interaction) {
    const confirmId = `cleanroles_${interaction.guild.id}_${Date.now()}`;

    pendingConfirmations.set(confirmId, {
        type: 'cleanroles',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        expires: Date.now() + 60000
    });

    const deletableRoles = interaction.guild.roles.cache.filter(r =>
        r.id !== interaction.guild.id &&
        !r.managed &&
        r.position < interaction.guild.members.me.roles.highest.position
    );

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${confirmId}`)
                .setLabel('Yes, Delete All Roles')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_${confirmId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Role Deletion')
        .setColor(0xFF0000)
        .setDescription(`This will delete **${deletableRoles.size}** roles from your server.`)
        .addFields({
            name: '🚨 This action cannot be undone!',
            value: 'Roles above the bot and managed roles will not be deleted.',
            inline: false
        });

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function performCleanRoles(interaction) {
    const guild = interaction.guild;
    const startTime = Date.now();

    await interaction.editReply({ content: '🗑️ Deleting roles...', embeds: [], components: [] });

    const failedRoles = [];
    const skippedRoles = [];
    let deletedCount = 0;

    guild.roles.cache.forEach(r => {
        if (r.id !== guild.id && (r.managed || r.position >= guild.members.me.roles.highest.position)) {
            skippedRoles.push(r.name + (r.managed ? ' (managed)' : ' (above bot)'));
        }
    });

    const roles = guild.roles.cache.filter(r =>
        r.id !== guild.id &&
        !r.managed &&
        r.position < guild.members.me.roles.highest.position
    );

    for (const [, role] of roles) {
        try {
            await role.delete();
            deletedCount++;
            await sleep(300);
        } catch (e) {
            failedRoles.push({ name: role.name, reason: e.message });
            console.log(`Could not delete role ${role.name}: ${e.message}`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const hasIssues = failedRoles.length > 0;

    const doneEmbed = new EmbedBuilder()
        .setTitle(hasIssues ? '⚠️ Roles Cleaned (with issues)' : '✅ Roles Deleted!')
        .setColor(hasIssues ? 0xFFA500 : 0x00FF00)
        .setDescription(hasIssues ? 'Most roles were deleted, but some could not be removed.' : 'All eligible roles have been deleted.')
        .addFields(
            { name: 'Roles Deleted', value: `${deletedCount}`, inline: true },
            { name: 'Duration', value: `${duration}s`, inline: true }
        );

    if (skippedRoles.length > 0) {
        const skippedText = skippedRoles.slice(0, 10).map(r => `• ${r}`).join('\n')
            + (skippedRoles.length > 10 ? `\n... and ${skippedRoles.length - 10} more` : '');
        doneEmbed.addFields({
            name: `⏭️ Skipped Roles (${skippedRoles.length})`,
            value: skippedText + '\n\nThese are managed by an integration or positioned above the bot\'s role.',
            inline: false
        });
    }

    if (hasIssues) {
        const failText = failedRoles.slice(0, 10).map(f => `• \`${f.name}\` — ${f.reason}`).join('\n')
            + (failedRoles.length > 10 ? `\n... and ${failedRoles.length - 10} more` : '');
        doneEmbed.addFields({
            name: `❌ Roles That Failed (${failedRoles.length})`,
            value: failText + '\n\n**To fix:** Move the bot\'s role above these in **Server Settings → Roles**, then delete them manually or run `/cleanroles` again.',
            inline: false
        });
    }

    doneEmbed.setTimestamp();
    await interaction.editReply({ content: '', embeds: [doneEmbed], components: [] });
}

// Clean channels command
async function handleCleanChannels(interaction) {
    const confirmId = `cleanchannels_${interaction.guild.id}_${Date.now()}`;

    pendingConfirmations.set(confirmId, {
        type: 'cleanchannels',
        guildId: interaction.guild.id,
        userId: interaction.user.id,
        expires: Date.now() + 60000
    });

    const deletableChannels = interaction.guild.channels.cache.filter(c => c.deletable);

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${confirmId}`)
                .setLabel('Yes, Delete All Channels')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`cancel_${confirmId}`)
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary)
        );

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Confirm Channel Deletion')
        .setColor(0xFF0000)
        .setDescription(`This will delete **${deletableChannels.size}** channels and categories from your server.`)
        .addFields({
            name: '🚨 This action cannot be undone!',
            value: 'A new #general channel will be created after deletion.',
            inline: false
        });

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
}

async function performCleanChannels(interaction) {
    const guild = interaction.guild;
    const userId = interaction.user.id;
    const startTime = Date.now();

    try { await interaction.editReply({ content: '🗑️ Deleting channels...', embeds: [], components: [] }); } catch (_) {}

    const failedChannels = [];
    let deletedCount = 0;
    let textCount = 0, voiceCount = 0, categoryCount = 0, otherCount = 0;
    const channels = guild.channels.cache.filter(c => c.deletable);

    for (const [, channel] of channels) {
        try {
            await channel.delete();
            deletedCount++;
            if (channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement) textCount++;
            else if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) voiceCount++;
            else if (channel.type === ChannelType.GuildCategory) categoryCount++;
            else otherCount++;
            await sleep(500);
        } catch (e) {
            const isMissingAccess = e.code === 50013 || e.message?.includes('Missing Access') || e.message?.includes('Missing Permissions');
            failedChannels.push({ name: channel.name, reason: isMissingAccess ? 'Missing Access' : e.message });
            console.log(`Could not delete channel ${channel.name}: ${e.message}`);
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    const hasIssues = failedChannels.length > 0;

    const doneEmbed = new EmbedBuilder()
        .setTitle(hasIssues ? '⚠️ Channels Cleaned (with issues)' : '✅ Channels Deleted!')
        .setColor(hasIssues ? 0xFFA500 : 0x00FF00)
        .setDescription(hasIssues ? 'Most channels were deleted, but some could not be removed.' : 'All channels have been deleted.')
        .addFields(
            { name: 'Channels Deleted', value: `${deletedCount}`, inline: true },
            { name: 'Duration', value: `${duration}s`, inline: true }
        );

    const typeBreakdown = [
        textCount > 0 ? `• ${textCount} text` : null,
        voiceCount > 0 ? `• ${voiceCount} voice` : null,
        categoryCount > 0 ? `• ${categoryCount} categories` : null,
        otherCount > 0 ? `• ${otherCount} other` : null,
    ].filter(Boolean).join('\n');
    if (typeBreakdown) {
        doneEmbed.addFields({ name: 'Channel Breakdown', value: typeBreakdown, inline: false });
    }

    if (hasIssues) {
        const failText = failedChannels.slice(0, 10).map(f => `• \`${f.name}\` — ${f.reason}`).join('\n')
            + (failedChannels.length > 10 ? `\n... and ${failedChannels.length - 10} more` : '');
        doneEmbed.addFields({
            name: `❌ Channels That Failed (${failedChannels.length})`,
            value: failText + '\n\n**To fix:** Manually delete them, or give the bot **Administrator** permission and run `/cleanchannels` again.',
            inline: false
        });
    }

    doneEmbed.addFields({
        name: '💡 Next Steps',
        value: '• Use `/save` to back up the current state\n• Use `/copy <serverid>` to restore a saved configuration\n• Delete this channel when you\'re done',
        inline: false
    }).setTimestamp();

    let statusChannel;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            if (attempt > 0) await sleep(3000);
            statusChannel = await guild.channels.create({
                name: 'cleanme-status',
                type: ChannelType.GuildText,
                reason: 'CleanMe Bot - Status after channel clean'
            });
            break;
        } catch (createErr) {
            if (attempt === 2) {
                console.error(`CUBSOFTWARE_ERROR_CLEANME_CLEAN_FAILED_156 — [Error] Could not create status channel in "${guild.name}": ${createErr.message}`);
            }
        }
    }
    if (statusChannel) {
        try {
            await statusChannel.send({ content: `<@${userId}>`, embeds: [doneEmbed] });
        } catch (sendErr) {
            console.error(`CUBSOFTWARE_ERROR_CLEANME_CLEAN_FAILED_156 — [Error] Could not send status in "${guild.name}": ${sendErr.message}`);
            try { const u = await client.users.fetch(userId); await u.send({ embeds: [doneEmbed] }); } catch (_) {}
        }
    } else {
        try { const u = await client.users.fetch(userId); await u.send({ embeds: [doneEmbed] }); } catch (_) {}
    }
}

// Handle button interactions
async function handleCleanMePublish(interaction, guildId) {
    const websiteUrl = process.env.CLEANME_WEBSITE_URL || 'https://cubsoftware.site';
    const apiKey = process.env.CLEANME_API_KEY || process.env.ADMIN_API_KEY || '';

    if (!apiKey) {
        return interaction.reply({
            content: '❌ CleanMe website API key not configured. Set `CLEANME_API_KEY` in `.env`.',
            flags: MessageFlags.Ephemeral
        });
    }

    const guild = interaction.guild;
    if (guild.id !== guildId) {
        return interaction.reply({ content: '❌ Server mismatch.', flags: MessageFlags.Ephemeral });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const iconHash = guild.icon;
        const iconUrl = iconHash
            ? `https://cdn.discordapp.com/icons/${guild.id}/${iconHash}.png`
            : null;

        const channels = guild.channels.cache;
        const roles = guild.roles.cache;

        const channelCount = channels.filter(c => [0, 2, 5, 13, 15, 16].includes(c.type)).size;
        const categoryCount = channels.filter(c => c.type === 4).size;
        const roleCount = roles.filter(r => r.name !== '@everyone' && !r.managed).size;

        // Include save data (channels/roles/categories) if a save exists
        const saves = loadSaves();
        const saveData = saves[guild.id];

        const body = {
            server_id: guild.id,
            name: guild.name,
            icon: iconUrl,
            channel_count: channelCount,
            role_count: roleCount,
            category_count: categoryCount,
            guild_owner_id: guild.ownerId,
            submitted_by_discord_id: interaction.user.id,
            submitted_by_username: interaction.user.username,
            channels: saveData ? saveData.channels.map(c => ({ name: c.name, type: c.type, parentName: c.parentName })) : [],
            roles: saveData ? saveData.roles.map(r => ({ name: r.name, color: r.color })) : [],
            categories: saveData ? saveData.categories.map(c => ({ name: c.name })) : []
        };

        const res = await fetch(`${websiteUrl}/cleanme/api/bot/publish-server`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();

        if (!res.ok || data.error) {
            return interaction.editReply({
                content: `❌ Failed to publish: ${data.error || 'Unknown error'}`
            });
        }

        const action = data.is_new ? 'Published' : 'Updated';
        const embed = new EmbedBuilder()
            .setTitle(`🌐 ${action} on CleanMe Website!`)
            .setColor(0x00FF00)
            .setDescription(`**${guild.name}** is now ${data.is_new ? 'live' : 'updated'} on the CleanMe website.`)
            .addFields(
                { name: 'View', value: `${websiteUrl}/cleanme/server/${guild.id}`, inline: false },
                { name: 'Browse', value: `${websiteUrl}/cleanme/browse`, inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

    } catch (err) {
        console.error('CUBSOFTWARE_ERROR_CLEANME_PUBLISH_ERROR_157 — CleanMe publish error:', err);
        await interaction.editReply({
            content: `❌ Failed to reach CleanMe website. Is the server online?\n\`${err.message}\``
        });
    }
}

async function handleButton(interaction) {
    const customId = interaction.customId;

    // Close status channel button
    if (customId === 'close_status_channel') {
        const member = interaction.member;
        const isOwner = interaction.guild.ownerId === interaction.user.id;
        const isAdmin = member?.permissions?.has(PermissionFlagsBits.Administrator);
        if (!isOwner && !isAdmin) {
            return interaction.reply({ content: '❌ Only server admins or the server owner can close this channel.', flags: MessageFlags.Ephemeral });
        }
        const channelId = interaction.channel.id;
        const data = loadStatusChannels();
        const categoryId = data[channelId];
        try { await interaction.update({ content: '🗑️ Closing...', components: [] }); } catch (_) {}
        await sleep(500);
        removeStatusChannel(channelId);
        if (categoryId) {
            const category = interaction.guild.channels.cache.get(categoryId);
            if (category) await category.delete().catch(() => {});
        }
        await interaction.channel.delete().catch(() => {});
        return;
    }

    // Handle CleanMe website publish button
    if (customId.startsWith('cleanme_publish_')) {
        const guildId = customId.replace('cleanme_publish_', '');
        await handleCleanMePublish(interaction, guildId);
        return;
    }

    const [action, ...rest] = customId.split('_');
    const confirmId = rest.join('_');

    const pending = pendingConfirmations.get(confirmId);

    if (!pending) {
        return interaction.reply({
            content: '❌ This confirmation has expired. Please run the command again.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Check if same user
    if (pending.userId !== interaction.user.id) {
        return interaction.reply({
            content: '❌ Only the person who initiated this action can confirm it.',
            flags: MessageFlags.Ephemeral
        });
    }

    // Check expiration
    if (Date.now() > pending.expires) {
        pendingConfirmations.delete(confirmId);
        return interaction.reply({
            content: '❌ This confirmation has expired. Please run the command again.',
            flags: MessageFlags.Ephemeral
        });
    }

    pendingConfirmations.delete(confirmId);

    if (action === 'cancel') {
        return interaction.update({
            content: '❌ Action cancelled.',
            embeds: [],
            components: []
        });
    }

    // Handle confirmations
    if (action === 'confirm') {
        switch (pending.type) {
            case 'save_override':
                await interaction.deferUpdate();
                await performSave(interaction, true);
                break;
            case 'copy':
                await interaction.deferUpdate();
                await performCopy(interaction, pending.sourceServerId);
                break;
            case 'clean':
                await interaction.deferUpdate();
                await performClean(interaction);
                break;
            case 'cleanroles':
                await interaction.deferUpdate();
                await performCleanRoles(interaction);
                break;
            case 'cleanchannels':
                await interaction.deferUpdate();
                await performCleanChannels(interaction);
                break;
            case 'delete_save':
                await performDeleteSave(interaction, pending.guildId);
                break;
        }
    }
}

async function performDeleteSave(interaction, guildId) {
    const saves = loadSaves();

    if (!saves[guildId]) {
        return interaction.update({
            content: '❌ Save not found (may have already been deleted).',
            embeds: [],
            components: []
        });
    }

    const serverName = saves[guildId].guildName;
    delete saves[guildId];
    saveSaves(saves);

    const embed = new EmbedBuilder()
        .setTitle('🗑️ Save Deleted')
        .setColor(0x00FF00)
        .setDescription(`Successfully deleted the saved configuration for **${serverName}**.`)
        .addFields({
            name: 'Note',
            value: 'Other servers can no longer copy this configuration. Use `/save` to create a new save.',
            inline: false
        })
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
}

// Utility function for rate limiting
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Listen for bot joining a new guild
client.on('guildCreate', (guild) => {
    console.log(`[Guild] Joined: ${guild.name} (${guild.id}) | Now in ${client.guilds.cache.size} servers`);
});

// Listen for bot removal from guilds
client.on('guildDelete', (guild) => {
    console.log(`[Guild] Left: ${guild.name} (${guild.id}) | Now in ${client.guilds.cache.size} servers`);
});

// Process handlers for logging
process.on('unhandledRejection', async (error) => {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[FATAL] ${ERRORS.CLEANME?.FATAL_REJECTION || 'CUBSOFTWARE_ERROR_CLEANME_FATAL_REJECTION_021'} — Unhandled Promise Rejection:`, error);
    if (terminal) terminal.logEvent(`Unhandled rejection: ${err.message}`, 'error');
});

process.on('uncaughtException', async (error) => {
    console.error(`[FATAL] ${ERRORS.CLEANME?.FATAL_EXCEPTION || 'CUBSOFTWARE_ERROR_CLEANME_FATAL_EXCEPTION_022'} — Uncaught Exception:`, error);
    if (terminal) await terminal.logEvent(`Uncaught exception: ${error.message}`, 'error');
    process.exit(1);
});

process.on('SIGINT', async () => {
    if (terminal) await terminal.logEvent('Shutting down (SIGINT)', 'warn');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (terminal) await terminal.logEvent('Shutting down (SIGTERM)', 'warn');
    process.exit(0);
});

// Login
client.login(process.env.BOT_TOKEN);
