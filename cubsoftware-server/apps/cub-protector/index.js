const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, PermissionFlagsBits, PermissionsBitField, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AuditLogEvent, AttachmentBuilder, ActivityType } = require('discord.js');

// Helper: creates an EmbedBuilder pre-loaded with CUB SOFTWARE branding footer
function cubEmbed() {
    return new EmbedBuilder().setFooter({ text: 'Developed by https://cubsoftware.site' });
}
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
// dotenv will NOT override env vars already set by PM2 ecosystem (e.g. DISCORD_TOKEN, CLIENT_ID, CUSTOM_GUILD_ID)
// It will still load API keys (TWITCH_CLIENT_ID, YOUTUBE_API_KEY etc.) from .env as normal
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const axios = require('axios');
const WebSocket = require('ws');
let DiscordTerminal = null;
try { DiscordTerminal = require('../../shared/discord-terminal'); } catch (e) { console.warn('[Terminal] discord-terminal not available:', e.message); }
let generateRankCard = null;
try { generateRankCard = require('./rankCard').generateRankCard; } catch (e) { console.warn('[RankCard] @napi-rs/canvas not available — run npm install'); }

let cubAiJoin = null, cubAiLeave = null, cubAiPersonality = null, cubAiAsk = null, CUBAI_PERSONALITIES = [], CUBAI_FEATURES = {}, cubAiGetState = null;
let cubAiRapBattle = null, cubAiBurnBookAdd = null, cubAiBurnBookRead = null;
let cubAiNarrator = null, cubAiSports = null, cubAiTherapist = null, cubAiEvil = null;
let cubAiHotTake = null, cubAiHoroscope = null, cubAiConspiracy = null, cubAiTranslator = null;
let cubAiTwoTruths = null, cubAiTwoTruthsGuess = null, cubAiJudge = null;
try {
    const cubai = require('./cubai');
    ({ cubAiJoin, cubAiLeave, cubAiPersonality, cubAiAsk,
       PERSONALITIES: CUBAI_PERSONALITIES, CUBAI_FEATURES,
       getCubAiState: cubAiGetState,
       rapBattle: cubAiRapBattle, burnBookAdd: cubAiBurnBookAdd, burnBookRead: cubAiBurnBookRead,
       toggleNarratorMode: cubAiNarrator, toggleSportsMode: cubAiSports,
       toggleTherapistMode: cubAiTherapist, toggleEvilMode: cubAiEvil,
       hotTake: cubAiHotTake, fakeHoroscope: cubAiHoroscope,
       conspiracyTheory: cubAiConspiracy, fakeTranslator: cubAiTranslator,
       startTwoTruths: cubAiTwoTruths, handleTwoTruthsGuess: cubAiTwoTruthsGuess,
       courtJudge: cubAiJudge,
    } = cubai);
} catch (e) { console.warn('[CUB AI] cubai.js not available — run npm install for voice dependencies'); }

// ============================================================
// Configuration
// ============================================================
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
// Custom bot mode: when running as a user's own bot, only handle this guild
const CUSTOM_GUILD_ID = process.env.CUSTOM_GUILD_ID || null;
// Dev guild for instant guild-specific command registration (alongside global)
const DEV_GUILD_ID = process.env.DEV_GUILD_ID || null;

// Path to the website's custom_bots.json — used to read presence settings
const CUSTOM_BOTS_FILE = path.join(__dirname, '..', 'cubsoftware-website', 'data', 'custom_bots.json');

// Cache of guilds that have an active custom bot (main bot skips these guilds)
let _cbGuildsCache = null;
let _cbGuildsCacheTime = 0;
let _cbNamesCache = {}; // guildId → display name
const CB_CACHE_TTL = 5000; // refresh every 5 seconds — fast enough to react to bot removal

function _refreshCbCache() {
    const now = Date.now();
    if (_cbGuildsCache && now - _cbGuildsCacheTime <= CB_CACHE_TTL) return;
    const prevGuilds = _cbGuildsCache ? new Set(_cbGuildsCache) : null;
    try {
        const raw = fs.readFileSync(CUSTOM_BOTS_FILE, 'utf8');
        const data = JSON.parse(raw);
        _cbGuildsCache = new Set();
        _cbNamesCache = {};
        for (const [gid, e] of Object.entries(data.guilds || {})) {
            if (e.enabled && e.token) {
                _cbGuildsCache.add(gid);
                _cbNamesCache[gid] = e.display_name || e.bot_name || 'the custom bot';
            }
        }
    } catch (_) {
        _cbGuildsCache = new Set();
        _cbNamesCache = {};
    }
    _cbGuildsCacheTime = now;
    // Auto-sync commands for any guilds whose custom bot status just changed
    if (!CUSTOM_GUILD_ID && prevGuilds && client.isReady()) {
        const changed = [
            ...[..._cbGuildsCache].filter(g => !prevGuilds.has(g)), // custom bot just enabled
            ...[...prevGuilds].filter(g => !_cbGuildsCache.has(g)), // custom bot just disabled
        ];
        for (const gid of changed) {
            syncGuildCommands(gid).catch(e => console.error(`[Commands] Auto-sync failed for ${gid}:`, e.message));
        }
    }
}

function guildHasCustomBot(guildId) {
    if (CUSTOM_GUILD_ID) return false; // we ARE a custom bot instance — never skip
    _refreshCbCache();
    return _cbGuildsCache.has(String(guildId));
}

function getCustomBotName(guildId) {
    _refreshCbCache();
    return _cbNamesCache[String(guildId)] || 'the custom bot';
}

// Apply the saved presence for this custom bot instance
function applyBotPresence() {
    if (!CUSTOM_GUILD_ID || !client.user) return;
    try {
        const raw = fs.readFileSync(CUSTOM_BOTS_FILE, 'utf8');
        const cbData = JSON.parse(raw);
        const entry = cbData.guilds?.[CUSTOM_GUILD_ID];
        if (!entry?.presence) return;
        const { status, activity_type, activity_text } = entry.presence;
        const typeMap = {
            'playing': ActivityType.Playing,
            'watching': ActivityType.Watching,
            'listening': ActivityType.Listening,
            'competing': ActivityType.Competing,
            'streaming': ActivityType.Streaming,
        };
        const presencePayload = {
            status: status || 'online',
            activities: activity_text
                ? [{ name: activity_text, type: typeMap[activity_type] ?? ActivityType.Playing }]
                : [],
        };
        client.user.setPresence(presencePayload);
    } catch (e) {
        // File may not exist on the main bot instance — silently ignore
    }
}

const DATA_DIR = path.join(__dirname, 'data');
const TEMP_VOICE_FILE = path.join(DATA_DIR, 'temp_voice.json');
const MODERATION_FILE = path.join(DATA_DIR, 'moderation.json');
const AUTOMOD_FILE = path.join(DATA_DIR, 'automod.json');
const LOGGING_FILE = path.join(DATA_DIR, 'logging.json');
const WELCOME_FILE = path.join(DATA_DIR, 'welcome.json');
const LEVELS_FILE = path.join(DATA_DIR, 'levels.json');
const REACTION_ROLES_FILE = path.join(DATA_DIR, 'reaction_roles.json');
const CUSTOM_COMMANDS_FILE = path.join(DATA_DIR, 'custom_commands.json');
const TICKETS_FILE = path.join(DATA_DIR, 'tickets.json');
const GIVEAWAYS_FILE = path.join(DATA_DIR, 'giveaways.json');
const STARBOARD_FILE = path.join(DATA_DIR, 'starboard.json');
const AFK_FILE = path.join(DATA_DIR, 'afk.json');
const REMINDERS_FILE = path.join(DATA_DIR, 'reminders.json');
const SUGGESTIONS_FILE = path.join(DATA_DIR, 'suggestions.json');
const ECONOMY_FILE = path.join(DATA_DIR, 'economy.json');
const ACHIEVEMENTS_FILE = path.join(DATA_DIR, 'achievements.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const AUTOROLES_FILE = path.join(DATA_DIR, 'autoroles.json');
const SCHEDULED_MESSAGES_FILE = path.join(DATA_DIR, 'scheduled_messages.json');
const CUSTOM_EMBEDS_FILE = path.join(DATA_DIR, 'custom_embeds.json');
const COUNTERS_FILE = path.join(DATA_DIR, 'counters.json');
const SOCIAL_FEEDS_FILE = path.join(DATA_DIR, 'social_feeds.json');
const LIVE_ALERTS_FILE = path.join(DATA_DIR, 'live_alerts.json');
const RANK_CARD_FILE = path.join(__dirname, '..', 'cubsoftware-website', 'data', 'rank_card_settings.json');
const VERIFICATION_FILE = path.join(DATA_DIR, 'verification.json');
const MODMAIL_FILE = path.join(DATA_DIR, 'modmail.json');
const COUNTING_FILE = path.join(DATA_DIR, 'counting.json');
const QUOTES_FILE = path.join(DATA_DIR, 'quotes.json');
const CONFESSIONS_FILE = path.join(DATA_DIR, 'confessions.json');
const ROLE_MENUS_FILE = path.join(DATA_DIR, 'role_menus.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const REP_FILE = path.join(DATA_DIR, 'rep.json');
const RELATIONSHIPS_FILE = path.join(DATA_DIR, 'relationships.json');
const TOURNAMENTS_FILE = path.join(DATA_DIR, 'tournaments.json');
const FEEDS_FILE = path.join(DATA_DIR, 'feeds.json');
const DEBATE_FILE = path.join(DATA_DIR, 'debate.json');
const GAMES_FILE = path.join(DATA_DIR, 'games.json');
const MEDIA_CHANNELS_FILE = path.join(DATA_DIR, 'media_channels.json');
const SUPPORT_SERVER_LINK = 'https://discord.gg/ngQXHUbnKg';
const SUPPORT_USER_LINK = 'https://discord.com/users/523949187663585310';

// ============================================================
// Admin / CubSoftware Bot Config
// ============================================================
const OWNER_IDS = (process.env.OWNER_IDS || '378501056008683530').split(',').map(id => id.trim());
const ADMIN_GUILD_ID = process.env.ADMIN_GUILD_ID || null;
const API_URL = process.env.API_URL || 'https://cubsoftware.site';
const API_KEY = process.env.API_KEY || '';
const TERMINAL_CHANNEL_ID = process.env.TERMINAL_CHANNEL_ID || '1466190431485427856';
const LINKS_LOG_CHANNEL_ID = process.env.LINKS_LOG_CHANNEL_ID || '1466190584372003092';
const LOG_SERVER_PORT = parseInt(process.env.LOG_SERVER_PORT) || 3847;
const CUBREACTIVE_WS_PORT = parseInt(process.env.CUBREACTIVE_WS_PORT) || 3848;
const projectChannels = {
    'cubsoftware-website': '1466190584372003092',
    'questcord-website':   '1466190431485427856',
    'cleanme-bot':         '1466190746401902855',
    'reports':             '1468610071494656226',
};

// Website data file paths (shared with cubsoftware-website)
const WEBSITE_DATA_PATH  = path.join(__dirname, '..', 'cubsoftware-website', 'data');
const LINKS_FILE         = path.join(WEBSITE_DATA_PATH, 'shortened_links.json');
const LINKS_AUDIT_FILE   = path.join(WEBSITE_DATA_PATH, 'links_audit.json');
const BANNED_IPS_FILE    = path.join(WEBSITE_DATA_PATH, 'banned_ips.json');
const IP_BANS_FILE       = path.join(WEBSITE_DATA_PATH, 'ip_bans.json');
const CUBREACTIVE_USERS_FILE = path.join(WEBSITE_DATA_PATH, 'cubreactive_users.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ============================================================
// Data Management
// ============================================================
function loadTempVoiceData() {
    try {
        if (fs.existsSync(TEMP_VOICE_FILE)) {
            return JSON.parse(fs.readFileSync(TEMP_VOICE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load temp voice data:', e);
    }
    return { guilds: {} };
}

function saveTempVoiceData(data) {
    try {
        fs.writeFileSync(TEMP_VOICE_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to save temp voice data:', e);
    }
}

function getGuildData(guildId) {
    const data = loadTempVoiceData();
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = { hubs: {}, active_channels: {} };
        saveTempVoiceData(data);
    }
    return data;
}

// Moderation Data
function loadModData() {
    try {
        if (fs.existsSync(MODERATION_FILE)) {
            return JSON.parse(fs.readFileSync(MODERATION_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load moderation data:', e);
    }
    return { guilds: {} };
}

function saveModData(data) {
    try {
        fs.writeFileSync(MODERATION_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Failed to save moderation data:', e);
    }
}

function getModGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = { warnings: [], notes: [], cases: [], next_case_id: 1 };
    }
    return data.guilds[guildId];
}

// Generic JSON file loader/saver
function loadJsonFile(filePath, defaultData = { guilds: {} }) {
    try {
        if (fs.existsSync(filePath)) return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) { console.error(`Failed to load ${filePath}:`, e); }
    return JSON.parse(JSON.stringify(defaultData));
}

function saveJsonFile(filePath, data) {
    try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); }
    catch (e) { console.error(`Failed to save ${filePath}:`, e); }
}

// Auto-Mod
function loadAutoModData() { return loadJsonFile(AUTOMOD_FILE); }
function saveAutoModData(data) { saveJsonFile(AUTOMOD_FILE, data); }
function getAutoModGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            enabled: false,
            bad_words: { enabled: false, words: [], action: 'delete', exempt_roles: [], exempt_channels: [] },
            spam: { enabled: false, max_messages: 5, interval: 5, action: 'mute', mute_duration: 300000, exempt_roles: [], exempt_channels: [] },
            caps: { enabled: false, min_length: 8, max_percentage: 70, action: 'delete', exempt_roles: [], exempt_channels: [] },
            links: { enabled: false, whitelist: [], blacklist: [], action: 'delete', exempt_roles: [], exempt_channels: [] },
            invites: { enabled: false, action: 'delete', exempt_roles: [], exempt_channels: [] },
            mass_mentions: { enabled: false, max_mentions: 5, action: 'mute', exempt_roles: [], exempt_channels: [] },
            emojis: { enabled: false, max_emojis: 10, action: 'delete', exempt_roles: [], exempt_channels: [] },
            newlines: { enabled: false, max_newlines: 10, action: 'delete', exempt_roles: [], exempt_channels: [] },
            duplicates: { enabled: false, action: 'delete', exempt_roles: [], exempt_channels: [] },
        };
    }
    return data.guilds[guildId];
}

// Logging
function loadLoggingData() { return loadJsonFile(LOGGING_FILE); }
function saveLoggingData(data) { saveJsonFile(LOGGING_FILE, data); }
function getLoggingGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = { channels: {}, ignore_channels: [], ignore_roles: [] };
    }
    return data.guilds[guildId];
}
async function sendLog(guild, eventType, embed) {
    const data = loadLoggingData();
    const guildLog = getLoggingGuild(data, guild.id);
    const channelId = guildLog.channels[eventType] || guildLog.channels['all'];
    if (!channelId) return;
    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (channel) await channel.send({ embeds: [embed] }).catch(() => {});
}

// Welcome
function loadWelcomeData() { return loadJsonFile(WELCOME_FILE); }
function saveWelcomeData(data) { saveJsonFile(WELCOME_FILE, data); }
function getWelcomeGuild(data, guildId) {
    if (!data.guilds) data.guilds = {};
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            welcome: { enabled: false, channel_id: null, message: 'Welcome to {server}, {user}!', dm_message: null, auto_roles: [], autorole_enabled: false, autorole_delay: 0 },
            goodbye: { enabled: false, channel_id: null, message: 'Goodbye {user}, we\'ll miss you!' },
        };
    }
    return data.guilds[guildId];
}

// Levels
function loadLevelsData() { return loadJsonFile(LEVELS_FILE); }
function saveLevelsData(data) { saveJsonFile(LEVELS_FILE, data); }
function getLevelsGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            enabled: false, announce_channel: null, announce_type: 'current',
            xp_min: 15, xp_max: 25, xp_cooldown: 60000,
            no_xp_channels: [], no_xp_roles: [], xp_multiplier: 1,
            role_rewards: {}, users: {},
            level_up_message: '', stack_rewards: false,
        };
    }
    return data.guilds[guildId];
}
function getLevelFromXP(xp) { return Math.floor(0.1 * Math.sqrt(xp)); }
function getXPForLevel(level) { return Math.pow(level / 0.1, 2); }

// Reaction Roles
function loadReactionRolesData() { return loadJsonFile(REACTION_ROLES_FILE); }
function saveReactionRolesData(data) { saveJsonFile(REACTION_ROLES_FILE, data); }

// Custom Commands
function loadCustomCommandsData() { return loadJsonFile(CUSTOM_COMMANDS_FILE); }
function saveCustomCommandsData(data) { saveJsonFile(CUSTOM_COMMANDS_FILE, data); }

// Tickets
function loadTicketsData() { return loadJsonFile(TICKETS_FILE); }
function saveTicketsData(data) { saveJsonFile(TICKETS_FILE, data); }

// Giveaways
function loadGiveawaysData() { return loadJsonFile(GIVEAWAYS_FILE); }
function saveGiveawaysData(data) { saveJsonFile(GIVEAWAYS_FILE, data); }

// Stats
function loadStatsData() { return loadJsonFile(STATS_FILE); }
function saveStatsData(d) { saveJsonFile(STATS_FILE, d); }

function loadAutoRolesData() { return loadJsonFile(AUTOROLES_FILE); }
function saveAutoRolesData(data) { saveJsonFile(AUTOROLES_FILE, data); }

function loadScheduledMessagesData() { return loadJsonFile(SCHEDULED_MESSAGES_FILE, { guilds: {} }); }
function saveScheduledMessagesData(data) { saveJsonFile(SCHEDULED_MESSAGES_FILE, data); }

function loadCustomEmbedsData() { return loadJsonFile(CUSTOM_EMBEDS_FILE); }
function saveCustomEmbedsData(data) { saveJsonFile(CUSTOM_EMBEDS_FILE, data); }

function loadSocialFeedsData() { return loadJsonFile(SOCIAL_FEEDS_FILE); }
function saveSocialFeedsData(data) { saveJsonFile(SOCIAL_FEEDS_FILE, data); }
function loadLiveAlertsData() { return loadJsonFile(LIVE_ALERTS_FILE); }
function loadRankCardData() { try { return JSON.parse(fs.readFileSync(RANK_CARD_FILE, 'utf8')); } catch { return { guilds: {}, users: {} }; } }
function saveRankCardData(d) { try { fs.writeFileSync(RANK_CARD_FILE, JSON.stringify(d, null, 2)); } catch {} }
function getRankCardTheme(guildId, userId) {
    const d = loadRankCardData();
    const guildTheme = (d.guilds[guildId] || {}).default_theme || {};
    const userTheme = (d.users[userId] || {}).theme || {};
    return { ...guildTheme, ...userTheme };
}
function saveLiveAlertsData(data) { saveJsonFile(LIVE_ALERTS_FILE, data); }

// Modmail
function loadModmailData() { return loadJsonFile(MODMAIL_FILE); }
function saveModmailData(data) { saveJsonFile(MODMAIL_FILE, data); }

// Counting Channel
function loadCountingData() { return loadJsonFile(COUNTING_FILE); }
function saveCountingData(data) { saveJsonFile(COUNTING_FILE, data); }
function getCountingGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = { channel_id: null, enabled: false, current_count: 0, last_user_id: null, high_score: 0 };
    }
    return data.guilds[guildId];
}

// Quotes
function loadQuotesData() { return loadJsonFile(QUOTES_FILE); }
function saveQuotesData(data) { saveJsonFile(QUOTES_FILE, data); }
function getQuotesGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = { quotes: [], next_id: 1 };
    }
    return data.guilds[guildId];
}

// Confessions
function loadConfessionsData() { return loadJsonFile(CONFESSIONS_FILE); }
function saveConfessionsData(data) { saveJsonFile(CONFESSIONS_FILE, data); }
function getConfessionsGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = { channel_id: null, log_channel_id: null, enabled: false, next_id: 1 };
    }
    return data.guilds[guildId];
}

// Role Menus (Color Roles + Self Roles)
function loadRoleMenusData() { return loadJsonFile(ROLE_MENUS_FILE); }
function saveRoleMenusData(data) { saveJsonFile(ROLE_MENUS_FILE, data); }
function getRoleMenusGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            color_roles: { enabled: false, channel_id: null, message_id: null, colors: [] },
            self_roles: { enabled: false, channel_id: null, categories: [] },
        };
    }
    if (!data.guilds[guildId].self_roles) {
        data.guilds[guildId].self_roles = { enabled: false, channel_id: null, categories: [] };
    }
    return data.guilds[guildId];
}

// ==================== Profiles / Rep / Relationships / Tournaments / Feeds / Debate ====================
function loadProfilesData() { return loadJsonFile(PROFILES_FILE); }
function saveProfilesData(d) { saveJsonFile(PROFILES_FILE, d); }
function getProfilesGuild(data, gId) {
    if (!data.guilds[gId]) data.guilds[gId] = { users: {} };
    return data.guilds[gId];
}
function getUserProfile(guildData, userId) {
    if (!guildData.users[userId]) guildData.users[userId] = { bio: null, color: null, links: {}, mood: null, mood_text: null };
    return guildData.users[userId];
}

function loadRepData() { return loadJsonFile(REP_FILE); }
function saveRepData(d) { saveJsonFile(REP_FILE, d); }
function getRepGuild(data, gId) {
    if (!data.guilds[gId]) data.guilds[gId] = { users: {}, cooldown_hours: 24 };
    return data.guilds[gId];
}
function getUserRep(repGuild, userId) {
    if (!repGuild.users[userId]) repGuild.users[userId] = { rep: 0, last_given: {} };
    return repGuild.users[userId];
}

function loadRelationshipsData() { return loadJsonFile(RELATIONSHIPS_FILE); }
function saveRelationshipsData(d) { saveJsonFile(RELATIONSHIPS_FILE, d); }
function getRelationshipsGuild(data, gId) {
    if (!data.guilds[gId]) data.guilds[gId] = { relationships: {}, proposals: {}, friend_requests: {} };
    return data.guilds[gId];
}

function loadTournamentsData() { return loadJsonFile(TOURNAMENTS_FILE); }
function saveTournamentsData(d) { saveJsonFile(TOURNAMENTS_FILE, d); }
function getTournamentsGuild(data, gId) {
    if (!data.guilds[gId]) data.guilds[gId] = { tournaments: [], next_id: 1 };
    return data.guilds[gId];
}

function loadFeedsData() { return loadJsonFile(FEEDS_FILE); }
function saveFeedsData(d) { saveJsonFile(FEEDS_FILE, d); }
function getFeedsGuild(data, gId) {
    if (!data.guilds[gId]) data.guilds[gId] = { reddit: [], news: [], meme_of_day: null, quote_of_day: null, last_meme_date: null, last_quote_date: null };
    return data.guilds[gId];
}

function loadDebateData() { return loadJsonFile(DEBATE_FILE); }
function saveDebateData(d) { saveJsonFile(DEBATE_FILE, d); }
function getDebateGuild(data, gId) {
    if (!data.guilds[gId]) data.guilds[gId] = { log_channel_id: null };
    return data.guilds[gId];
}

// Active debates map: channelId -> { guildId, user1Id, user2Id, timeout }
const activeDebates = new Map();

// HTTP fetch helper (for Reddit + quotable.io)
function fetchJson(url) {
    return new Promise((resolve, reject) => {
        const https = url.startsWith('https') ? require('https') : require('http');
        const req = https.get(url, { headers: { 'User-Agent': 'CUB-PROTECTOR-Bot/1.0' } }, res => {
            let raw = '';
            res.on('data', c => raw += c);
            res.on('end', () => { try { resolve(JSON.parse(raw)); } catch (e) { reject(e); } });
        });
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    });
}

// Simple RSS title+link parser (no extra packages)
function parseRssItems(xml, limit = 5) {
    const items = [];
    const regex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = regex.exec(xml)) !== null && items.length < limit) {
        const block = match[1];
        const title = (/<title[^>]*><!\[CDATA\[(.*?)\]\]><\/title>/i.exec(block) || /<title[^>]*>(.*?)<\/title>/i.exec(block) || [])[1] || '';
        const link = (/<link>(.*?)<\/link>/i.exec(block) || /<link[^>]*href="([^"]+)"/i.exec(block) || [])[1] || '';
        if (title || link) items.push({ title: title.trim(), link: link.trim() });
    }
    return items;
}

// Self-Role Presets
const SELF_ROLE_PRESETS = {
    'colors': {
        name: 'Colors', description: 'Pick a color for your username!', emoji: '🎨',
        roles: [
            { label: 'Red', emoji: '🔴', color: '#E74C3C' },
            { label: 'Orange', emoji: '🟠', color: '#E67E22' },
            { label: 'Yellow', emoji: '🟡', color: '#F1C40F' },
            { label: 'Green', emoji: '🟢', color: '#2ECC71' },
            { label: 'Blue', emoji: '🔵', color: '#3498DB' },
            { label: 'Purple', emoji: '🟣', color: '#9B59B6' },
            { label: 'Pink', emoji: '🩷', color: '#FF69B4' },
            { label: 'Cyan', emoji: '🩵', color: '#1ABC9C' },
            { label: 'Gold', emoji: '✨', color: '#F1C40F' },
        ],
    },
    'star-signs': {
        name: 'Star Signs', description: 'Pick your star sign!', emoji: '⭐',
        roles: [
            { label: 'Aries', emoji: '♈' }, { label: 'Taurus', emoji: '♉' },
            { label: 'Gemini', emoji: '♊' }, { label: 'Cancer', emoji: '♋' },
            { label: 'Leo', emoji: '♌' }, { label: 'Virgo', emoji: '♍' },
            { label: 'Libra', emoji: '♎' }, { label: 'Scorpio', emoji: '♏' },
            { label: 'Sagittarius', emoji: '♐' }, { label: 'Capricorn', emoji: '♑' },
            { label: 'Aquarius', emoji: '♒' }, { label: 'Pisces', emoji: '♓' },
        ],
    },
    'pronouns': {
        name: 'Pronouns', description: 'Choose your pronouns', emoji: '🏳️‍🌈',
        roles: [
            { label: 'He/Him', emoji: '💙' }, { label: 'She/Her', emoji: '💗' },
            { label: 'They/Them', emoji: '💚' }, { label: 'He/They', emoji: '💜' },
            { label: 'She/They', emoji: '🧡' }, { label: 'Any Pronouns', emoji: '🌈' },
            { label: 'Ask Me', emoji: '❓' },
        ],
    },
    'gaming': {
        name: 'Gaming', description: 'Pick your gaming platform(s)', emoji: '🎮',
        roles: [
            { label: 'PC Gaming', emoji: '🖥️' }, { label: 'PlayStation', emoji: '🎮' },
            { label: 'Xbox', emoji: '🟢' }, { label: 'Nintendo Switch', emoji: '🟥' },
            { label: 'Mobile Gaming', emoji: '📱' }, { label: 'Retro Gaming', emoji: '👾' },
        ],
    },
    'notifications': {
        name: 'Notifications', description: 'What do you want to be pinged for?', emoji: '🔔',
        roles: [
            { label: 'Announcements', emoji: '📢' }, { label: 'Events', emoji: '📅' },
            { label: 'Giveaways', emoji: '🎉' }, { label: 'Updates', emoji: '🔄' },
            { label: 'Server News', emoji: '📰' },
        ],
    },
    'regions': {
        name: 'Regions', description: 'Where are you from?', emoji: '🌍',
        roles: [
            { label: 'North America', emoji: '🌎' }, { label: 'Europe', emoji: '🌍' },
            { label: 'Asia', emoji: '🌏' }, { label: 'Oceania', emoji: '🦘' },
            { label: 'South America', emoji: '🌿' }, { label: 'Africa', emoji: '🦁' },
            { label: 'Middle East', emoji: '🕌' },
        ],
    },
    'languages': {
        name: 'Languages', description: 'What languages do you speak?', emoji: '🗣️',
        roles: [
            { label: 'English', emoji: '🇬🇧' }, { label: 'Spanish', emoji: '🇪🇸' },
            { label: 'French', emoji: '🇫🇷' }, { label: 'German', emoji: '🇩🇪' },
            { label: 'Portuguese', emoji: '🇧🇷' }, { label: 'Japanese', emoji: '🇯🇵' },
            { label: 'Korean', emoji: '🇰🇷' }, { label: 'Arabic', emoji: '🇸🇦' },
        ],
    },
    'interests': {
        name: 'Interests', description: 'What are you into?', emoji: '💡',
        roles: [
            { label: 'Music', emoji: '🎵' }, { label: 'Art', emoji: '🎨' },
            { label: 'Sports', emoji: '⚽' }, { label: 'Anime', emoji: '🎌' },
            { label: 'Movies & TV', emoji: '🎬' }, { label: 'Reading', emoji: '📚' },
            { label: 'Cooking', emoji: '🍳' }, { label: 'Travel', emoji: '✈️' },
        ],
    },
    'age-groups': {
        name: 'Age Groups', description: 'How old are you?', emoji: '🎂',
        roles: [
            { label: '13-15', emoji: '🌱' }, { label: '16-17', emoji: '🌿' },
            { label: '18-21', emoji: '🌲' }, { label: '22-25', emoji: '⭐' },
            { label: '26-30', emoji: '🌟' }, { label: '31+', emoji: '✨' },
        ],
    },
    'content': {
        name: 'Content', description: 'What kind of content do you enjoy?', emoji: '📺',
        roles: [
            { label: 'Memes & Humor', emoji: '😂' }, { label: 'News & Discussion', emoji: '📰' },
            { label: 'Educational', emoji: '📚' }, { label: 'Creative & Art', emoji: '🎨' },
            { label: 'Music & Audio', emoji: '🎵' }, { label: 'Video & Streaming', emoji: '📹' },
        ],
    },
    'music-genres': {
        name: 'Music Genres', description: 'What kind of music do you like?', emoji: '🎵',
        roles: [
            { label: 'Pop', emoji: '🎤' }, { label: 'Rock', emoji: '🎸' },
            { label: 'Hip-Hop / Rap', emoji: '🎧' }, { label: 'Electronic / EDM', emoji: '🎛️' },
            { label: 'Classical', emoji: '🎻' }, { label: 'Metal', emoji: '🤘' },
            { label: 'Jazz / Blues', emoji: '🎷' }, { label: 'Country', emoji: '🤠' },
        ],
    },
    'tv-genres': {
        name: 'TV & Movie Genres', description: 'What genres do you watch?', emoji: '🎬',
        roles: [
            { label: 'Action', emoji: '💥' }, { label: 'Comedy', emoji: '😂' },
            { label: 'Drama', emoji: '🎭' }, { label: 'Horror', emoji: '👻' },
            { label: 'Sci-Fi', emoji: '🚀' }, { label: 'Fantasy', emoji: '🧙' },
            { label: 'Thriller', emoji: '🔪' }, { label: 'Romance', emoji: '💕' },
        ],
    },
    'hobbies': {
        name: 'Hobbies', description: 'What do you do in your free time?', emoji: '🎯',
        roles: [
            { label: 'Photography', emoji: '📷' }, { label: 'Writing', emoji: '✍️' },
            { label: 'Fitness / Gym', emoji: '💪' }, { label: 'Drawing / Art', emoji: '🎨' },
            { label: 'DIY & Crafts', emoji: '🔨' }, { label: 'Dance', emoji: '💃' },
            { label: 'Gardening', emoji: '🌱' }, { label: 'Coding', emoji: '💻' },
        ],
    },
    'pets': {
        name: 'Pets', description: 'What pets do you have?', emoji: '🐾',
        roles: [
            { label: 'Dog Owner', emoji: '🐶' }, { label: 'Cat Owner', emoji: '🐱' },
            { label: 'Bird Owner', emoji: '🐦' }, { label: 'Fish Owner', emoji: '🐠' },
            { label: 'Reptile Owner', emoji: '🦎' }, { label: 'Small Animal', emoji: '🐹' },
            { label: 'No Pets', emoji: '🚫' },
        ],
    },
    'sports': {
        name: 'Sports', description: 'What sports are you into?', emoji: '⚽',
        roles: [
            { label: 'Football / Soccer', emoji: '⚽' }, { label: 'American Football', emoji: '🏈' },
            { label: 'Basketball', emoji: '🏀' }, { label: 'Tennis', emoji: '🎾' },
            { label: 'Baseball', emoji: '⚾' }, { label: 'Hockey', emoji: '🏒' },
            { label: 'MMA / Boxing', emoji: '🥊' }, { label: 'Esports', emoji: '🎮' },
        ],
    },
    'lifestyle': {
        name: 'Lifestyle', description: 'Describe your lifestyle', emoji: '🌙',
        roles: [
            { label: 'Early Bird', emoji: '🌅' }, { label: 'Night Owl', emoji: '🦉' },
            { label: 'Introvert', emoji: '🔇' }, { label: 'Extrovert', emoji: '📣' },
            { label: 'Ambivert', emoji: '⚖️' }, { label: 'Homebody', emoji: '🏠' },
            { label: 'Adventurer', emoji: '🌍' },
        ],
    },
    'streaming': {
        name: 'Streaming Services', description: 'What do you stream on?', emoji: '📺',
        roles: [
            { label: 'Netflix', emoji: '🎬' }, { label: 'Disney+', emoji: '🏰' },
            { label: 'YouTube', emoji: '▶️' }, { label: 'Twitch', emoji: '💜' },
            { label: 'Amazon Prime', emoji: '📦' }, { label: 'HBO / Max', emoji: '⚡' },
            { label: 'Spotify', emoji: '🎵' },
        ],
    },
    'diet': {
        name: 'Diet', description: 'What is your diet?', emoji: '🥗',
        roles: [
            { label: 'Vegan', emoji: '🌿' }, { label: 'Vegetarian', emoji: '🥦' },
            { label: 'Pescatarian', emoji: '🐟' }, { label: 'Meat Lover', emoji: '🥩' },
            { label: 'Keto', emoji: '🥑' }, { label: 'No Restrictions', emoji: '🍽️' },
        ],
    },
    'status': {
        name: 'Status', description: 'What is your current life status?', emoji: '📋',
        roles: [
            { label: 'Student', emoji: '📚' }, { label: 'Working', emoji: '💼' },
            { label: 'Job Hunting', emoji: '🔍' }, { label: 'Freelancer', emoji: '💻' },
            { label: 'Parent', emoji: '👪' }, { label: 'Self-Employed', emoji: '🏢' },
        ],
    },
    'personality': {
        name: 'Personality', description: 'What describes you best?', emoji: '🧠',
        roles: [
            { label: 'Creative', emoji: '🎨' }, { label: 'Analytical', emoji: '🔬' },
            { label: 'Adventurous', emoji: '🌍' }, { label: 'Empathetic', emoji: '💖' },
            { label: 'Leader', emoji: '👑' }, { label: 'Chill', emoji: '😎' },
            { label: 'Organised', emoji: '📋' }, { label: 'Spontaneous', emoji: '⚡' },
        ],
    },
};

async function postSelfRolesCategory(guild, channel, category) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(category.emoji ? `${category.emoji} ${category.name}` : category.name)
        .setDescription(category.description || 'Select a role below!')
        .setFooter({ text: 'Selecting a role you already have will remove it' });
    const options = category.roles.slice(0, 25).map(r => {
        const opt = { label: r.label, value: r.role_id };
        if (r.emoji) opt.emoji = r.emoji;
        return opt;
    });
    if (options.length === 0) return null;
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`self_role_select_${category.id}`)
        .setPlaceholder(`Choose from ${category.name}...`)
        .setMinValues(0)
        .setMaxValues(Math.min(options.length, 25))
        .addOptions(options);
    const row = new ActionRowBuilder().addComponents(selectMenu);
    if (category.message_id) {
        const existing = await channel.messages.fetch(category.message_id).catch(() => null);
        if (existing) {
            const edited = await existing.edit({ embeds: [embed], components: [row] }).catch(() => null);
            return edited || null;
        }
    }
    return await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
}

// Starboard
function loadStarboardData() { return loadJsonFile(STARBOARD_FILE); }
function saveStarboardData(data) { saveJsonFile(STARBOARD_FILE, data); }

// AFK
function loadAFKData() { return loadJsonFile(AFK_FILE); }
function saveAFKData(data) { saveJsonFile(AFK_FILE, data); }

// Reminders
function loadRemindersData() { return loadJsonFile(REMINDERS_FILE, { reminders: [] }); }
function saveRemindersData(data) { saveJsonFile(REMINDERS_FILE, data); }

// Suggestions
function loadSuggestionsData() { return loadJsonFile(SUGGESTIONS_FILE); }
function saveSuggestionsData(data) { saveJsonFile(SUGGESTIONS_FILE, data); }

// Economy
function loadEconomyData() { return loadJsonFile(ECONOMY_FILE); }
function saveEconomyData(data) { saveJsonFile(ECONOMY_FILE, data); }
function getEconomyGuild(data, guildId) {
    if (!data.guilds[guildId]) {
        data.guilds[guildId] = {
            currency_name: 'Coins', currency_emoji: '🪙',
            daily_amount: 100, users: {}, shop: [],
            work_min: 50, work_max: 150, work_cooldown: 3600000,
            rob_enabled: false, rob_chance: 40, rob_fine: 25, starting_balance: 0,
        };
    }
    return data.guilds[guildId];
}

// Games
function loadGamesData() { return loadJsonFile(GAMES_FILE, { guilds: {} }); }
function saveGamesData(data) { saveJsonFile(GAMES_FILE, data); }

// ── Card-deck utilities ──────────────────────────────────────────────────────
function createDeck() {
    const suits = ['♠','♥','♦','♣'];
    const values = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
    return suits.flatMap(s => values.map(v => ({ suit: s, value: v })));
}
function shuffleDeck(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
function cardValue(card) {
    if (['J','Q','K'].includes(card.value)) return 10;
    if (card.value === 'A') return 11;
    return parseInt(card.value);
}
function handTotal(hand) {
    let total = hand.reduce((s, c) => s + cardValue(c), 0);
    let aces = hand.filter(c => c.value === 'A').length;
    while (total > 21 && aces > 0) { total -= 10; aces--; }
    return total;
}
function cardStr(card) { return `\`${card.value}${card.suit}\``; }
function handStr(hand) { return hand.map(cardStr).join(' '); }
function getUserEco(guildE, userId) {
    if (!guildE.users[userId]) guildE.users[userId] = { balance: guildE.starting_balance || 0, last_daily: 0, last_work: 0 };
    return guildE.users[userId];
}
// ── Wordle word list (500 common 5-letter words) ─────────────────────────────
const WORDLE_WORDS = ['crane','slate','audio','raise','arose','trace','crate','least','stare','snare','share','spare','stale','tales','laser','reals','earls','tears','rales','lares','rates','tares','alert','alter','later','ratel','uteri','outer','route','outre','tower','wrote','other','voter','overt','trove','score','cores','ceros','recto','coset','cosec','taces','caste','escot','cotes','scone','cones','cents','scent','onset','stone','notes','tones','steno','nosey','toney','honey','hosen','shone','hones','horde','doeth','those','ethos','shoes','hoses','shore','shoer','horse','hoser','hosel','holes','shoal','solar','orals','loral','atoll','allot','tolls','rolls','trolls'.slice(0,4),'lords','droll','dolls','dolls'.slice(0,4),'world','sword','words','rowdy','dowry','rowel','lower','elbow','below','bowel','towel','towel'.slice(0,4),'towed','voted','doves','dovel','loved','novel','clone','cloze','cozen','ozone','zoned','zones','melon','lemon','model','moles','smelt','metol','motel','molts','colts','stoic','stomp','tromps'.slice(0,5),'storm','mossy'.slice(0,5),'story','tyros','ryots','yours','youse','house','louse','douse','mouse','moues','emote','omits','vomit','limit','admit','timid','milds','minds','mined','denim','lined','oiled','olive','lives','limes','slime','smile','slier','riles','riels','liber','libel','bible','limbs','climb','crimp','crisp','prism','firms','firim'.slice(0,5),'first','shirt','thirs'.slice(0,5),'tilts','still','tilts'.slice(0,4),'built','quilt','joist','joint','point','pinto','piton','optic','topic','toxic','tonic','sonic','scion','coils','spoil','recoil'.slice(0,5),'pilot','polts'.slice(0,5),'ploit'.slice(0,5),'toils','lousy','lusty','busty','dusty','rusty','gutsy','nutsy'.slice(0,5),'gusty','gusts','busts','rusts','trusts'.slice(0,5),'trust','truss','brush','blush','flush','slash','clash','flash','flask','flaks'.slice(0,5),'slacks'.slice(0,5),'black','bland','blank','clank','plank','plant','slant','grant','graft','draft','drank','frank','prank','crank','brand','braid','grail','trail','trial','viral','rival','civil','until','vinyl','final','canal','banal','nasal','papal','fatal','natal','naval','legal','regal','tidal','vidal'.slice(0,5),'ideal','medal','pedal','tread','dread','bread','break','creak','freak','bleat','bloat','float','gloat','bloat'.slice(0,4),'groan','groan'.slice(0,4),'broad','brood','flood','blood','bloom','broom','groom','gloom','gleam','steam','cream','dream','scream'.slice(0,5),'seam','seal','deal','heal','meal','real','teal','veal','zeal','bean','dean','jean','lean','mean','wean','clean','learn','yearn','churn','shard','charm','chair','chain','shame','shave','shape','shade','shake','shake'.slice(0,4),'sharp','harp','warp','carp','tarp','tare','mare','bare','care','dare','fare','rare','ware','hare','snare'.slice(0,4),'place','plane','flame','blame','frame','grade','trade','spade','shade'.slice(0,4),'glade','blade','slate'.slice(0,4),'plate','skate','state','stave','brave','crave','grave','shave'.slice(0,4),'knave','weave','heave','leave','cleave'.slice(0,5),'blaze','craze','graze','glaze','amaze','froze','chose','those'.slice(0,4),'prose','close','arose'.slice(0,4),'mouse'.slice(0,4),'house'.slice(0,4),'grouse'.slice(0,5),'rouge','rogue','vogue','vague','vague'.slice(0,4),'argue','exude','crude','prude','etude','study','buddy','muddy','ruddy','muddy'.slice(0,4),'pudgy','pudgy'.slice(0,4),'hedge','ledge','wedge','lodge','dodge','judge','budge','nudge','fudge','ridge','midge','fridge'.slice(0,5),'bride','pride','glide','slide','guide','guise','guile','while','whale','shale','scale','stale'.slice(0,4),'table','cable','fable','noble','globe','probe','grobe'.slice(0,5),'grove','drove','stove','clove','glove','above','roven'.slice(0,5),'woken','token','spoken'.slice(0,5),'owner','tower'.slice(0,4),'lower'.slice(0,4),'boxer','vixen','pixel','nicer','ricer','dicer','tiger','liger','diner','liner','miner','timer','rider','cider','elder','alder','under','ulcer','ulnar'.slice(0,5),'ultra','extra','intra','intro','nitro','retro','metro','metro'.slice(0,4),'micro','micro'.slice(0,4),'macro','audio'.slice(0,4),'radio','ratio','patio','cameo','romeo','video','rodeo','cameo'.slice(0,4),'curio','serio'.slice(0,5),'prior','minor','manor','honor','donor','tenor','error','humor','tumor','furor','vigor','rigor','tigor'.slice(0,5)].filter(w => w.length === 5 && /^[a-z]+$/.test(w)).filter((v,i,a) => a.indexOf(v) === i);
const WORDS_5 = ['crane','slate','audio','raise','arose','trace','crate','least','stare','snare','share','spare','stale','laser','alert','alter','later','stone','notes','tones','shoes','horse','holes','world','sword','words','towel','novel','clone','melon','lemon','model','storm','yours','house','louse','mouse','emote','olive','smile','slime','first','shirt','built','quilt','point','pilot','lousy','dusty','rusty','brush','black','blank','plant','grant','frank','brand','braid','trail','trial','until','final','canal','fatal','naval','medal','pedal','tread','bread','break','float','groan','broad','blood','bloom','broom','gloom','gleam','steam','cream','dream','seam','seal','deal','heal','meal','real','teal','bean','lean','mean','wean','learn','yearn','charm','chair','chain','shame','shape','shade','shake','sharp','snare','place','plane','flame','blame','frame','grade','trade','spade','glade','blade','plate','skate','state','brave','crave','grave','knave','weave','heave','blaze','craze','graze','glaze','amaze','prose','close','rouge','rogue','vogue','argue','study','hedge','wedge','lodge','dodge','judge','ridge','bride','pride','glide','slide','guide','while','whale','shale','scale','table','cable','noble','globe','probe','grove','drove','stove','clove','glove','above','token','owner','boxer','tiger','diner','liner','miner','timer','rider','cider','elder','under','ultra','extra','intro','nitro','retro','metro','micro','macro','radio','ratio','patio','prior','minor','manor','honor','donor','tenor','humor','vigor','rigor','plain','grain','train','brain','sprain'.slice(0,5),'stain','paint','faint','saint','quaint'.slice(0,5),'plaid','fluid','squid','vivid','rapid','vapid','tepid','timid','valid','solid','moist','hoist','joist','twist','wrist','crisp','prism','whisk','brisk','flick','trick','brick','click','clock','block','flock','knock','stock','shock','smock','frock','crock','crook','brook','drool','stool','spool','spoon','swoon','snoop','scoop','troop','droop','drool'.slice(0,5),'proof','spoof','aloof','stood','flood','brood','blood'.slice(0,4),'bloom'.slice(0,4),'floor','floor'.slice(0,4),'floss','gloss','gross','cross','frost','trust','crust','grust'.slice(0,5),'blunt','grunt','front','brunt','stunt','burnt','bunch','punch','lunch','munch','hunch','bench','pench'.slice(0,5),'fence','hence','dense','tense','sense','verse','curse','nurse','purse','worse','horse'.slice(0,4),'forge','gorge','jorge'.slice(0,5),'large','barge','surge','verge','merge','dirge','scone','phone','clone'.slice(0,4),'prone','drone','ozone','atone','stone'.slice(0,4),'haste','paste','waste','taste','chaste'.slice(0,5),'paste'.slice(0,4),'beast','feast','least'.slice(0,4),'yeast','boast','coast','roast','toast','ghost','frost'.slice(0,4),'trust'.slice(0,4),'burst','worst','first'.slice(0,4),'thirst'.slice(0,5)].filter(w => w && w.length === 5 && /^[a-z]+$/.test(w)).filter((v,i,a) => a.indexOf(v) === i);

const TRIVIA_QUESTIONS = [
    { q: 'What is the capital of France?', a: 'Paris', choices: ['London','Paris','Berlin','Madrid'] },
    { q: 'How many sides does a hexagon have?', a: '6', choices: ['5','6','7','8'] },
    { q: 'What planet is known as the Red Planet?', a: 'Mars', choices: ['Venus','Jupiter','Mars','Saturn'] },
    { q: 'Who painted the Mona Lisa?', a: 'Leonardo da Vinci', choices: ['Michelangelo','Leonardo da Vinci','Raphael','Donatello'] },
    { q: 'What is the largest ocean on Earth?', a: 'Pacific', choices: ['Atlantic','Indian','Pacific','Arctic'] },
    { q: 'How many bones are in the human body?', a: '206', choices: ['196','206','216','226'] },
    { q: 'What language has the most native speakers?', a: 'Mandarin Chinese', choices: ['English','Spanish','Mandarin Chinese','Hindi'] },
    { q: 'What is the chemical symbol for gold?', a: 'Au', choices: ['Go','Gd','Au','Ag'] },
    { q: 'In what year did World War II end?', a: '1945', choices: ['1943','1944','1945','1946'] },
    { q: 'What is the smallest planet in our solar system?', a: 'Mercury', choices: ['Mars','Venus','Pluto','Mercury'] },
    { q: 'What sport is played at Wimbledon?', a: 'Tennis', choices: ['Cricket','Tennis','Squash','Badminton'] },
    { q: 'What is the hardest natural substance on Earth?', a: 'Diamond', choices: ['Gold','Diamond','Iron','Quartz'] },
    { q: 'How many continents are there on Earth?', a: '7', choices: ['5','6','7','8'] },
    { q: 'What is the capital of Japan?', a: 'Tokyo', choices: ['Osaka','Kyoto','Tokyo','Hiroshima'] },
    { q: 'Who wrote Romeo and Juliet?', a: 'Shakespeare', choices: ['Chaucer','Dickens','Shakespeare','Keats'] },
    { q: 'What is 12 × 12?', a: '144', choices: ['124','132','144','148'] },
    { q: 'What gas do plants absorb from the atmosphere?', a: 'Carbon dioxide', choices: ['Oxygen','Carbon dioxide','Nitrogen','Hydrogen'] },
    { q: 'What is the fastest land animal?', a: 'Cheetah', choices: ['Lion','Leopard','Cheetah','Horse'] },
    { q: 'What is the currency of Japan?', a: 'Yen', choices: ['Won','Yuan','Yen','Baht'] },
    { q: 'How many players are in a standard soccer team?', a: '11', choices: ['9','10','11','12'] },
    { q: 'What is the largest country by area?', a: 'Russia', choices: ['Canada','China','USA','Russia'] },
    { q: 'What element has the symbol H?', a: 'Hydrogen', choices: ['Helium','Hydrogen','Hafnium','Holmium'] },
    { q: 'In what year was the iPhone first released?', a: '2007', choices: ['2005','2006','2007','2008'] },
    { q: 'How many strings does a standard guitar have?', a: '6', choices: ['4','5','6','7'] },
    { q: 'What is the tallest mountain in the world?', a: 'Mount Everest', choices: ['K2','Mont Blanc','Mount Kilimanjaro','Mount Everest'] },
    { q: 'What color is a ruby?', a: 'Red', choices: ['Blue','Green','Red','Purple'] },
    { q: 'How many keys does a standard piano have?', a: '88', choices: ['72','80','88','96'] },
    { q: 'What is the main ingredient in guacamole?', a: 'Avocado', choices: ['Tomato','Onion','Avocado','Lime'] },
    { q: 'How many teeth does an adult human typically have?', a: '32', choices: ['28','30','32','34'] },
    { q: 'What does HTTP stand for?', a: 'HyperText Transfer Protocol', choices: ['HighText Transfer Protocol','HyperText Transfer Protocol','HyperText Transmit Protocol','HyperText Transfer Program'] },
];

const RIDDLES = [
    { q: 'I have cities, but no houses live there. I have mountains, but no trees grow there. I have water, but no fish swim there. I have roads, but no cars drive there. What am I?', a: 'A map' },
    { q: 'The more you take, the more you leave behind. What am I?', a: 'Footsteps' },
    { q: 'I speak without a mouth and hear without ears. I have no body, but I come alive with wind. What am I?', a: 'An echo' },
    { q: "What has hands but can't clap?", a: 'A clock' },
    { q: 'What gets wetter as it dries?', a: 'A towel' },
    { q: 'What has to be broken before you can use it?', a: 'An egg' },
    { q: "I'm tall when I'm young, and short when I'm old. What am I?", a: 'A candle' },
    { q: 'What comes once in a minute, twice in a moment, but never in a thousand years?', a: 'The letter M' },
    { q: 'What has 13 hearts but no other organs?', a: 'A deck of cards' },
    { q: 'What building has the most stories?', a: 'A library' },
    { q: "What can't talk but will reply when spoken to?", a: 'An echo' },
    { q: 'What has four legs in the morning, two at noon, and three in the evening?', a: 'A human' },
    { q: 'I have branches but no fruit, trunk, or leaves. What am I?', a: 'A bank' },
    { q: "What is always in front of you but can't be seen?", a: 'The future' },
    { q: 'What has an eye but cannot see?', a: 'A needle' },
];

const SCRAMBLE_WORDS = ['discord','gaming','server','channel','moderation','economy','giveaway','community','streaming','keyboard','password','reaction','language','database','software','hardware','internet','birthday','calendar','sandwich','elephant','chocolate','beautiful','adventure','knowledge','universe','computer','mountain','umbrella','treasure','champion','festival','midnight','platform','sunshine','football','hospital','airplane','butterfly','mushroom','dolphin','penguin','volcano','crystal','diamond'];

const TYPE_RACE_SENTENCES = [
    'The quick brown fox jumps over the lazy dog',
    'Pack my box with five dozen liquor jugs',
    'How vexingly quick daft zebras jump',
    'The five boxing wizards jump quickly',
    'Sphinx of black quartz judge my vow',
    'Discord is the best place to hang out with friends',
    'Gaming with friends is always more fun than gaming alone',
    'The early bird catches the worm but the second mouse gets the cheese',
    'Life is like a box of chocolates you never know what you will get',
    'May the force be with you always no matter what',
    'All that glitters is not gold but it sure is pretty',
    'To infinity and beyond is a great motto to live by',
];

const MATH_QUESTIONS = [
    { q: '7 × 8', a: '56' }, { q: '144 ÷ 12', a: '12' }, { q: '13 × 7', a: '91' },
    { q: '256 ÷ 8', a: '32' }, { q: '18 × 6', a: '108' }, { q: '√225', a: '15' },
    { q: '15²', a: '225' }, { q: '9 × 14', a: '126' }, { q: '360 ÷ 15', a: '24' },
    { q: '2⁸', a: '256' }, { q: '11 × 11', a: '121' }, { q: '17 × 4', a: '68' },
    { q: '√169', a: '13' }, { q: '24 × 5', a: '120' }, { q: '108 ÷ 9', a: '12' },
    { q: '6³', a: '216' }, { q: '19 × 3', a: '57' }, { q: '14 × 8', a: '112' },
    { q: '√625', a: '25' }, { q: '25 × 4', a: '100' },
];

const HANGMAN_WORDS = ['javascript','python','algorithm','database','interface','keyboard','function','variable','parameter','developer','framework','typescript','component','exception','iteration','recursion','bandwidth','encryption','middleware','deployment','repository','authentication','visualization','synchronize','asynchronous','blockchain','cryptocurrency','infrastructure','microservices','containerization'];

// Games config helpers
function loadGamesConfig() { return loadJsonFile(GAMES_FILE, { guilds: {} }); }
function saveGamesConfig(data) { saveJsonFile(GAMES_FILE, data); }
function getGamesGuildConfig(guildId) {
    const data = loadGamesConfig();
    if (!data.guilds[guildId]) return null;
    return data.guilds[guildId];
}

/**
 * Validates whether a game is allowed in the current context.
 * Returns null if ok, or an error string if blocked.
 */
function checkGameAllowed(guildId, channelId, member, gameId) {
    const cfg = getGamesGuildConfig(guildId);
    if (!cfg) return null; // no config set = everything allowed

    if (cfg.enabled === false) return '🚫 Games are currently disabled on this server.';

    // Check allowed channels
    if (cfg.allowed_channels && cfg.allowed_channels.length > 0) {
        if (!cfg.allowed_channels.includes(channelId)) {
            return `🚫 Games can only be used in specific channels. Check the allowed channels in your server settings.`;
        }
    }

    // Check blocked roles
    if (cfg.blocked_roles && cfg.blocked_roles.length > 0) {
        const hasBlockedRole = member.roles.cache.some(r => cfg.blocked_roles.includes(r.id));
        if (hasBlockedRole) return '🚫 You have a role that is blocked from using games.';
    }

    // Check individual game toggle
    if (cfg.games && cfg.games[gameId] === false) {
        return `🚫 The **${gameId}** game is currently disabled on this server.`;
    }

    return null; // all good
}

/**
 * Validates a bet amount against guild config.
 * Returns { ok: true } or { ok: false, error: string }.
 */
function validateBet(guildId, bet) {
    const cfg = getGamesGuildConfig(guildId);
    if (!cfg) return { ok: true };
    const min = cfg.min_bet ?? 1;
    const max = cfg.max_bet ?? 10000;
    if (bet < min) return { ok: false, error: `❌ Minimum bet is **${min}** coins.` };
    if (bet > max) return { ok: false, error: `❌ Maximum bet is **${max}** coins.` };
    return { ok: true };
}

// Games economy helper
function gameEco(guildId, userId) {
    const eData = loadEconomyData();
    const guildE = getEconomyGuild(eData, guildId);
    const user = getUserEco(guildE, userId);
    return { eData, guildE, user, save: () => saveEconomyData(eData) };
}

// Active game state maps (in-memory)
const activeGames = new Map();       // `${guildId}:${userId}` → solo game
const activePvPGames = new Map();    // gameId → PvP game state
const activeChannelGames = new Map(); // `${guildId}:${channelId}` → channel game
const crashIntervals = new Map();    // userId → crash interval

// Achievements
function loadAchievementsData() { return loadJsonFile(ACHIEVEMENTS_FILE); }
function saveAchievementsData(data) { saveJsonFile(ACHIEVEMENTS_FILE, data); }

// Spam tracking (in-memory)
const spamTracker = new Map();
// Duplicate text tracking
const duplicateTracker = new Map();
// XP cooldown tracking
const xpCooldowns = new Map();
// Voice XP tracking
const voiceXPIntervals = new Map();
const voiceChannelCache = new Map(); // channelId → channel name (preserved after deletion)
// Active giveaway timers
const giveawayTimers = new Map();
// Active reminder timers
const reminderTimers = new Map();

function createModCase(guildData, type, modId, targetId, reason) {
    const caseId = guildData.next_case_id || 1;
    guildData.next_case_id = caseId + 1;
    const entry = {
        case_id: caseId,
        type,
        moderator_id: modId,
        target_id: targetId,
        reason: reason || 'No reason provided',
        timestamp: Math.floor(Date.now() / 1000),
    };
    guildData.cases.push(entry);
    return entry;
}

function generateAppealCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// ============================================================
// Client Setup
// ============================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildModeration,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildInvites,
    ],
    partials: ['Message', 'Channel', 'Reaction'],
});

// ============================================================
// Commands the main bot keeps active even when a custom bot is running in a guild.
// All other commands are registered only in guilds without a custom bot.
const MAIN_BOT_SHARED_COMMANDS = new Set(['help', 'website', 'invite']);
// Commands that only run on the main cub-protector — never on custom bot instances
const MAIN_BOT_ONLY_COMMANDS = new Set([
    'cubai', 'cubsoftware',
    'link-find', 'link-ban', 'link-unban', 'link-bans', 'link-delete',
    'ip-ban', 'ip-temp-ban', 'ip-unban', 'ip-list',
    'keraplast-password', 'feature',
]);

// ============================================================
// Slash Commands Definition
// ============================================================
const commands = [
    // Hub management (admin only)
    new SlashCommandBuilder()
        .setName('voice-setup')
        .setDescription('Create a temporary voice channel hub')
        .addChannelOption(opt =>
            opt.setName('category')
                .setDescription('Category to create the hub and temp channels in')
                .addChannelTypes(ChannelType.GuildCategory)
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('name')
                .setDescription('Hub channel name (default: "Join to Create")')
                .setRequired(false))
        .addStringOption(opt =>
            opt.setName('template')
                .setDescription('Temp channel name template. Use {username} and {index} (default: "🔊・{username}")')
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('user_limit')
                .setDescription('Default user limit (0 = unlimited)')
                .setMinValue(0).setMaxValue(99)
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('bitrate')
                .setDescription('Default bitrate in kbps')
                .setMinValue(8).setMaxValue(384)
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('keep_alive')
                .setDescription('Minutes to keep empty channel (0 = immediate delete, -1 = never delete)')
                .setMinValue(-1).setMaxValue(60)
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('ownership_lock')
                .setDescription('Minutes before ownership can be claimed (0 = immediate, -1 = never)')
                .setMinValue(-1).setMaxValue(60)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-hub-delete')
        .setDescription('Delete a temporary voice channel hub')
        .addChannelOption(opt =>
            opt.setName('hub')
                .setDescription('The hub channel to delete')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-hub-settings')
        .setDescription('View or modify hub settings')
        .addChannelOption(opt =>
            opt.setName('hub')
                .setDescription('The hub channel')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('template')
                .setDescription('Channel name template ({username}, {index})')
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('user_limit')
                .setDescription('Default user limit (0 = unlimited)')
                .setMinValue(0).setMaxValue(99)
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('bitrate')
                .setDescription('Default bitrate in kbps')
                .setMinValue(8).setMaxValue(384)
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('keep_alive')
                .setDescription('Minutes to keep empty channel (-1 = never)')
                .setMinValue(-1).setMaxValue(60)
                .setRequired(false))
        .addIntegerOption(opt =>
            opt.setName('ownership_lock')
                .setDescription('Minutes before ownership claimable (-1 = never)')
                .setMinValue(-1).setMaxValue(60)
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-hub-moderator')
        .setDescription('Add or remove a moderator role for a hub')
        .addChannelOption(opt =>
            opt.setName('hub')
                .setDescription('The hub channel')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true))
        .addRoleOption(opt =>
            opt.setName('role')
                .setDescription('The moderator role')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('action')
                .setDescription('Add or remove')
                .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-hub-ignored')
        .setDescription('Add or remove an ignored role for a hub')
        .addChannelOption(opt =>
            opt.setName('hub')
                .setDescription('The hub channel')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true))
        .addRoleOption(opt =>
            opt.setName('role')
                .setDescription('The ignored role')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('action')
                .setDescription('Add or remove')
                .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-mod-role')
        .setDescription('Add or remove a global voice moderator role')
        .addRoleOption(opt =>
            opt.setName('role')
                .setDescription('The moderator role')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('action')
                .setDescription('Add or remove')
                .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-mod-user')
        .setDescription('Add or remove an individual voice moderator')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to add/remove as voice moderator')
                .setRequired(true))
        .addStringOption(opt =>
            opt.setName('action')
                .setDescription('Add or remove')
                .addChoices({ name: 'Add', value: 'add' }, { name: 'Remove', value: 'remove' })
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-mods')
        .setDescription('View all global voice moderator roles and users')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    // User voice commands
    new SlashCommandBuilder()
        .setName('voice-ban')
        .setDescription('Ban a user from your temporary voice channel')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to ban')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('voice-unban')
        .setDescription('Unban a user from your temporary voice channel')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to unban')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('voice-kick')
        .setDescription('Kick a user from your temporary voice channel')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to kick')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('voice-lock')
        .setDescription('Lock your temporary voice channel (no new users can join)'),

    new SlashCommandBuilder()
        .setName('voice-unlock')
        .setDescription('Unlock your temporary voice channel'),

    new SlashCommandBuilder()
        .setName('voice-hide')
        .setDescription('Hide your temporary voice channel from everyone'),

    new SlashCommandBuilder()
        .setName('voice-reveal')
        .setDescription('Reveal your temporary voice channel to everyone'),

    new SlashCommandBuilder()
        .setName('voice-limit')
        .setDescription('Change the user limit of your temporary voice channel')
        .addIntegerOption(opt =>
            opt.setName('limit')
                .setDescription('New user limit (0 = unlimited)')
                .setMinValue(0).setMaxValue(99)
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('voice-rename')
        .setDescription('Rename your temporary voice channel')
        .addStringOption(opt =>
            opt.setName('name')
                .setDescription('New channel name')
                .setMaxLength(100)
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('voice-claim')
        .setDescription('Claim ownership of an abandoned temporary voice channel'),

    new SlashCommandBuilder()
        .setName('voice-transfer')
        .setDescription('Transfer ownership of your temporary voice channel')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to transfer to')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('voice-owner')
        .setDescription('Check who owns the current temporary voice channel'),

    new SlashCommandBuilder()
        .setName('voice-clean')
        .setDescription('Delete all inactive temporary voice channels (moderator only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('voice-permit')
        .setDescription('Allow a specific user to see and join your hidden voice channel')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to permit')
                .setRequired(true)),

    new SlashCommandBuilder()
        .setName('voice-reject')
        .setDescription('Remove a user\'s permission to see/join your voice channel')
        .addUserOption(opt =>
            opt.setName('user')
                .setDescription('The user to reject')
                .setRequired(true)),

    // ==================== MODERATION COMMANDS ====================
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for ban'))
        .addStringOption(opt => opt.setName('duration').setDescription('Temp ban duration (e.g. 1h, 1d, 7d)'))
        .addIntegerOption(opt => opt.setName('delete_days').setDescription('Days of messages to delete (0-7)').setMinValue(0).setMaxValue(7)),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Unban a user from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addStringOption(opt => opt.setName('user_id').setDescription('User ID to unban').setRequired(true)),

    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for kick')),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 5m, 1h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute')),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true)),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Warn a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for warning').setRequired(true)),

    new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('View warnings for a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true)),

    new SlashCommandBuilder()
        .setName('delwarn')
        .setDescription('Delete a specific warning')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption(opt => opt.setName('id').setDescription('Warning ID to delete').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear all warnings for a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to clear warnings for').setRequired(true)),

    new SlashCommandBuilder()
        .setName('note')
        .setDescription('Add a private note about a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to add note for').setRequired(true))
        .addStringOption(opt => opt.setName('text').setDescription('Note content').setRequired(true)),

    new SlashCommandBuilder()
        .setName('notes')
        .setDescription('View notes for a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true)),

    new SlashCommandBuilder()
        .setName('delnote')
        .setDescription('Delete a specific note')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addIntegerOption(opt => opt.setName('id').setDescription('Note ID to delete').setRequired(true)),

    new SlashCommandBuilder()
        .setName('softban')
        .setDescription('Ban and immediately unban a user (clears their messages)')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to softban').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for softban')),

    new SlashCommandBuilder()
        .setName('purge')
        .setDescription('Delete messages from a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addIntegerOption(opt => opt.setName('amount').setDescription('Number of messages (1-100)').setMinValue(1).setMaxValue(100).setRequired(true))
        .addUserOption(opt => opt.setName('user').setDescription('Only delete messages from this user'))
        .addStringOption(opt => opt.setName('filter').setDescription('Filter type').addChoices(
            { name: 'Bots', value: 'bots' },
            { name: 'Links', value: 'links' },
            { name: 'Images', value: 'images' },
            { name: 'Text Only', value: 'text' },
        )),

    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set channel slowmode')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addIntegerOption(opt => opt.setName('seconds').setDescription('Slowmode in seconds (0 = off)').setMinValue(0).setMaxValue(21600).setRequired(true))
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel (defaults to current)')),

    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock a channel (prevent members from sending messages)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to lock (defaults to current)'))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason for locking')),

    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock a channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
        .addChannelOption(opt => opt.setName('channel').setDescription('Channel to unlock (defaults to current)')),

    new SlashCommandBuilder()
        .setName('modlogs')
        .setDescription('View moderation history for a user')
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
        .addUserOption(opt => opt.setName('user').setDescription('User to check').setRequired(true)),

    // ==================== TICKETS ====================
    new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Ticket system')
        .addSubcommand(sub => sub.setName('setup').setDescription('Create a ticket panel')
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel for ticket panel').setRequired(true))
            .addStringOption(opt => opt.setName('title').setDescription('Panel title'))
            .addStringOption(opt => opt.setName('description').setDescription('Panel description'))
            .addRoleOption(opt => opt.setName('support_role').setDescription('Support team role'))
            .addStringOption(opt => opt.setName('button_label').setDescription('Button label (default: Create Ticket)'))
            .addStringOption(opt => opt.setName('button_emoji').setDescription('Button emoji (default: 🎫)'))
            .addStringOption(opt => opt.setName('ticket_type').setDescription('Ticket type/category name (default: support)')))
        .addSubcommand(sub => sub.setName('close').setDescription('Close this ticket'))
        .addSubcommand(sub => sub.setName('add').setDescription('Add a user to this ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to add').setRequired(true)))
        .addSubcommand(sub => sub.setName('remove').setDescription('Remove a user from this ticket')
            .addUserOption(opt => opt.setName('user').setDescription('User to remove').setRequired(true))),

    // ==================== GIVEAWAYS ====================
    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Manage giveaways')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('start').setDescription('Start a giveaway')
            .addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true))
            .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 1d, 7d)').setRequired(true))
            .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setMinValue(1).setMaxValue(20))
            .addRoleOption(opt => opt.setName('required_role').setDescription('Required role to enter'))
            .addChannelOption(opt => opt.setName('channel').setDescription('Channel (defaults to current)')))
        .addSubcommand(sub => sub.setName('end').setDescription('End a giveaway early')
            .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true)))
        .addSubcommand(sub => sub.setName('reroll').setDescription('Reroll giveaway winners')
            .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))),

    // ==================== AFK ====================
    new SlashCommandBuilder()
        .setName('afk')
        .setDescription('Set your AFK status')
        .addStringOption(opt => opt.setName('message').setDescription('AFK message')),

    // ==================== REMINDERS ====================
    new SlashCommandBuilder()
        .setName('remind')
        .setDescription('Set a reminder')
        .addStringOption(opt => opt.setName('time').setDescription('When (e.g. 30m, 2h, 1d)').setRequired(true))
        .addStringOption(opt => opt.setName('message').setDescription('Reminder message').setRequired(true)),

    new SlashCommandBuilder()
        .setName('reminders')
        .setDescription('View your active reminders'),

    // ==================== SUGGESTIONS ====================
    new SlashCommandBuilder()
        .setName('suggest')
        .setDescription('Submit a suggestion')
        .addStringOption(opt => opt.setName('idea').setDescription('Your suggestion').setRequired(true)),

    new SlashCommandBuilder()
        .setName('suggestion')
        .setDescription('Manage suggestions')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(sub => sub.setName('setup').setDescription('Set suggestion channel')
            .addChannelOption(opt => opt.setName('channel').setDescription('Suggestion channel').setRequired(true)))
        .addSubcommand(sub => sub.setName('approve').setDescription('Approve a suggestion')
            .addStringOption(opt => opt.setName('id').setDescription('Suggestion ID').setRequired(true))
            .addStringOption(opt => opt.setName('response').setDescription('Response message')))
        .addSubcommand(sub => sub.setName('deny').setDescription('Deny a suggestion')
            .addStringOption(opt => opt.setName('id').setDescription('Suggestion ID').setRequired(true))
            .addStringOption(opt => opt.setName('response').setDescription('Response message'))),

    // ==================== POLLS ====================
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll')
        .addStringOption(opt => opt.setName('question').setDescription('Poll question').setRequired(true))
        .addStringOption(opt => opt.setName('option1').setDescription('Option 1').setRequired(true))
        .addStringOption(opt => opt.setName('option2').setDescription('Option 2').setRequired(true))
        .addStringOption(opt => opt.setName('option3').setDescription('Option 3'))
        .addStringOption(opt => opt.setName('option4').setDescription('Option 4'))
        .addStringOption(opt => opt.setName('option5').setDescription('Option 5'))
        .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 1d)')),

    // ==================== UTILITY COMMANDS ====================
    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('View user information')
        .addUserOption(opt => opt.setName('user').setDescription('User to check')),

    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('View server information'),

    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get a user\'s avatar')
        .addUserOption(opt => opt.setName('user').setDescription('User')),

    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help information')
        .addStringOption(opt => opt.setName('command').setDescription('Specific command to get help for')),

    new SlashCommandBuilder()
        .setName('cubai')
        .setDescription('CUB AI voice assistant (owner only)')
        // ── Core ─────────────────────────────────────────────────────────────
        .addSubcommand(sub => sub.setName('join').setDescription('CUB AI joins your voice channel'))
        .addSubcommand(sub => sub.setName('leave').setDescription('CUB AI leaves the voice channel'))
        .addSubcommand(sub => sub
            .setName('personality')
            .setDescription('Change CUB AI personality mid-session')
            .addStringOption(opt => opt
                .setName('name')
                .setDescription('Which personality to use')
                .setRequired(true)
                .addChoices(
                    { name: 'Random', value: 'random' },
                    { name: 'Chill', value: 'Chill' },
                    { name: 'Hype', value: 'Hype' },
                    { name: 'Sarcastic', value: 'Sarcastic' },
                    { name: 'Wise', value: 'Wise' },
                    { name: 'Chaotic', value: 'Chaotic' },
                    { name: 'Formal', value: 'Formal' },
                    { name: 'Wholesome', value: 'Wholesome' },
                    { name: 'Conspiracy', value: 'Conspiracy' },
                    { name: 'Gen Z', value: 'Gen Z' }
                )
            )
        )
        // ── Feature management ────────────────────────────────────────────────
        .addSubcommand(sub => sub.setName('features').setDescription('Show all CUB AI fun features and their on/off status'))
        .addSubcommand(sub => sub
            .setName('toggle')
            .setDescription('Enable or disable a CUB AI fun feature')
            .addStringOption(opt => opt
                .setName('feature').setDescription('Feature to toggle').setRequired(true)
                .addChoices(
                    { name: 'Rap Battle',        value: 'rap_battle' },
                    { name: 'Burn Book',          value: 'burn_book' },
                    { name: 'Narrator Mode',      value: 'narrator' },
                    { name: 'Sports Announcer',   value: 'sports' },
                    { name: 'Therapist Mode',     value: 'therapist' },
                    { name: 'Two Truths & a Lie', value: 'two_truths' },
                    { name: 'Court Judge',        value: 'court_judge' },
                    { name: 'Hot Takes',          value: 'hot_takes' },
                    { name: 'Horoscope',          value: 'horoscope' },
                    { name: 'Conspiracy Theory',  value: 'conspiracy' },
                    { name: 'Fake Translator',    value: 'translator' },
                    { name: 'Evil Mode',          value: 'evil_mode' },
                )
            )
        )
        // ── Overlay modes (toggle on/off, affects all voice responses) ────────
        .addSubcommand(sub => sub.setName('narrator').setDescription('Toggle Narrator Mode — David Attenborough style responses'))
        .addSubcommand(sub => sub.setName('sports').setDescription('Toggle Sports Announcer Mode — hyper-excited play-by-play'))
        .addSubcommand(sub => sub.setName('therapist').setDescription('Toggle Therapist Mode — over-analyzes everything psychologically'))
        .addSubcommand(sub => sub.setName('evil').setDescription('Toggle Evil Mode — theatrically villainous twin'))
        // ── One-shot fun features ─────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('rapbattle')
            .setDescription('Drop a rap battle diss verse on someone')
            .addStringOption(opt => opt.setName('target').setDescription('Who to diss').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('burnadd')
            .setDescription('Add someone to the session burn book')
            .addStringOption(opt => opt.setName('name').setDescription('Who to burn').setRequired(true))
            .addStringOption(opt => opt.setName('reason').setDescription('Why they\'re in the burn book'))
        )
        .addSubcommand(sub => sub.setName('burnread').setDescription('Read all entries in the session burn book'))
        .addSubcommand(sub => sub.setName('hottake').setDescription('Get CUB AI\'s hottest, most unhinged take'))
        .addSubcommand(sub => sub
            .setName('horoscope')
            .setDescription('Get a wildly specific fake horoscope for someone')
            .addStringOption(opt => opt.setName('name').setDescription('Who to read for').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('conspiracy')
            .setDescription('Generate an absurd fake conspiracy theory')
            .addStringOption(opt => opt.setName('topic').setDescription('Topic of the conspiracy').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('translator')
            .setDescription('Translate what someone in the call really meant')
            .addStringOption(opt => opt.setName('name').setDescription('Who to translate').setRequired(true))
        )
        .addSubcommand(sub => sub.setName('twotruths').setDescription('Play Two Truths and a Lie — AI generates, you guess via buttons'))
        .addSubcommand(sub => sub
            .setName('judge')
            .setDescription('Let Judge CUB make a dramatic ruling on any case')
            .addStringOption(opt => opt.setName('case').setDescription('Describe the case').setRequired(true))
        )
        // ── Direct ask ───────────────────────────────────────────────────────
        .addSubcommand(sub => sub
            .setName('ask')
            .setDescription('Ask CUB AI a question — responds in text, and also speaks if in a voice channel')
            .addStringOption(opt => opt
                .setName('question')
                .setDescription('Your question for CUB AI')
                .setRequired(true)
            )
        ),


    new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get bot invite link'),

    new SlashCommandBuilder()
        .setName('dashboard')
        .setDescription('Get a link to your CUB SOFTWARE dashboard'),

    new SlashCommandBuilder()
        .setName('website')
        .setDescription('Get a link to the CUB SOFTWARE website'),

    new SlashCommandBuilder()
        .setName('support')
        .setDescription('Get a link to the CUB SOFTWARE support server'),

    new SlashCommandBuilder()
        .setName('stats')
        .setDescription('View bot statistics'),

    // ── Admin commands (from CubSoftware Bot) ─────────────────────────────────
    new SlashCommandBuilder()
        .setName('cubsoftware')
        .setDescription('CUB SOFTWARE information')
        .addSubcommand(sub => sub.setName('info').setDescription('About CUB SOFTWARE'))
        .addSubcommand(sub => sub.setName('apps').setDescription('List all apps')),

    new SlashCommandBuilder()
        .setName('link-find')
        .setDescription('Find information about a shortened link')
        .addStringOption(o => o.setName('code').setDescription('Short code or full URL').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('link-ban')
        .setDescription('Ban an IP from creating links')
        .addStringOption(o => o.setName('ip').setDescription('IP address').setRequired(true))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('link-unban')
        .setDescription('Unban an IP from creating links')
        .addStringOption(o => o.setName('ip').setDescription('IP address').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('link-bans')
        .setDescription('List all banned IPs')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('link-delete')
        .setDescription('Delete a shortened link')
        .addStringOption(o => o.setName('code').setDescription('Short code or full URL').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ip-ban')
        .setDescription('Ban an IP from the website')
        .addStringOption(o => o.setName('ip').setDescription('IP address').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Ban type').setRequired(true)
            .addChoices(
                { name: 'Global (entire website)', value: 'global' },
                { name: 'Link Shortener', value: 'links' },
                { name: 'Social Media Saver', value: 'social' },
                { name: 'File Converter', value: 'converter' },
                { name: 'PDF Tools', value: 'pdf' },
                { name: 'Reports', value: 'reports' }
            ))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ip-temp-ban')
        .setDescription('Temporarily ban an IP')
        .addStringOption(o => o.setName('ip').setDescription('IP address').setRequired(true))
        .addStringOption(o => o.setName('duration').setDescription('Duration e.g. 30m, 1h, 7d').setRequired(true))
        .addStringOption(o => o.setName('type').setDescription('Ban type (default: global)').setRequired(false)
            .addChoices(
                { name: 'Global (entire website)', value: 'global' },
                { name: 'Link Shortener', value: 'links' },
                { name: 'Social Media Saver', value: 'social' }
            ))
        .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ip-unban')
        .setDescription('Unban an IP')
        .addStringOption(o => o.setName('ip').setDescription('IP address').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ip-list')
        .setDescription('List all IP bans')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('keraplast-password')
        .setDescription('Manage Keraplast calculator passwords')
        .addSubcommand(sub => sub.setName('create').setDescription('Create a password')
            .addStringOption(o => o.setName('password').setDescription('The password').setRequired(true))
            .addStringOption(o => o.setName('label').setDescription('Label').setRequired(false)))
        .addSubcommand(sub => sub.setName('delete').setDescription('Delete a password')
            .addStringOption(o => o.setName('password').setDescription('The password').setRequired(true)))
        .addSubcommand(sub => sub.setName('list').setDescription('List all passwords'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('feature')
        .setDescription('Enable or disable website features')
        .addSubcommand(sub => sub.setName('disable').setDescription('Disable a feature')
            .addStringOption(o => o.setName('name').setDescription('Feature to disable').setRequired(true)
                .addChoices(...[
                    ['Social Media Saver','social-media-saver'],['File Converter','file-converter'],
                    ['PDF Tools','pdf-tools'],['Image Editor','image-editor'],['QR Generator','qr-generator'],
                    ['Link Shortener','link-shortener'],['Color Picker','color-picker'],['Text Tools','text-tools'],
                    ['Unit Converter','unit-converter'],['JSON Formatter','json-formatter'],
                    ['Timestamp Converter','timestamp-converter'],['Video Compressor','video-compressor'],
                    ['Resume Builder','resume-builder'],['Countdown Maker','countdown-maker'],
                    ['Random Picker','random-picker'],['Wheel Spinner','wheel-spinner'],
                    ['Calculator Suite','calculator-suite'],['Password Generator','password-generator'],
                    ['Timer Tools','timer-tools'],['World Clock','world-clock'],
                    ['Currency Converter','currency-converter'],['Sticky Board','sticky-board'],
                ].map(([name, value]) => ({ name, value })))))
        .addSubcommand(sub => sub.setName('enable').setDescription('Enable a feature')
            .addStringOption(o => o.setName('name').setDescription('Feature to enable').setRequired(true)
                .addChoices(...[
                    ['Social Media Saver','social-media-saver'],['File Converter','file-converter'],
                    ['PDF Tools','pdf-tools'],['Image Editor','image-editor'],['QR Generator','qr-generator'],
                    ['Link Shortener','link-shortener'],['Color Picker','color-picker'],['Text Tools','text-tools'],
                    ['Unit Converter','unit-converter'],['JSON Formatter','json-formatter'],
                    ['Timestamp Converter','timestamp-converter'],['Video Compressor','video-compressor'],
                    ['Resume Builder','resume-builder'],['Countdown Maker','countdown-maker'],
                    ['Random Picker','random-picker'],['Wheel Spinner','wheel-spinner'],
                    ['Calculator Suite','calculator-suite'],['Password Generator','password-generator'],
                    ['Timer Tools','timer-tools'],['World Clock','world-clock'],
                    ['Currency Converter','currency-converter'],['Sticky Board','sticky-board'],
                ].map(([name, value]) => ({ name, value })))))
        .addSubcommand(sub => sub.setName('list').setDescription('Show all features and their status'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

];

// ============================================================
// Register Commands
// ============================================================
// Returns the right command list for a guild — full set or shared-only if a custom bot is active.
function _commandsForGuild(guildId) {
    if (guildHasCustomBot(guildId)) {
        return commands.filter(c => MAIN_BOT_SHARED_COMMANDS.has(c.name));
    }
    // Admin/owner commands only register in the designated admin guild
    if (ADMIN_GUILD_ID && guildId !== ADMIN_GUILD_ID) {
        return commands.filter(c => !MAIN_BOT_ONLY_COMMANDS.has(c.name));
    }
    return commands;
}

// Register (or update) slash commands for a single guild using the correct set.
async function syncGuildCommands(guildId) {
    if (!CLIENT_ID || !TOKEN) return;
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        const body = _commandsForGuild(guildId).map(c => c.toJSON());
        await rest.put(Routes.applicationGuildCommands(CLIENT_ID, guildId), { body });
        console.log(`[Commands] Guild ${guildId}: registered ${body.length} commands`);
    } catch (e) {
        console.error(`[Commands] Failed to sync guild ${guildId}:`, e.message);
    }
}

async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        if (CUSTOM_GUILD_ID) {
            // Custom bot mode: register guild-specific commands (instant, no propagation delay)
            console.log(`Registering guild commands for custom bot (guild: ${CUSTOM_GUILD_ID})...`);
            await rest.put(Routes.applicationGuildCommands(CLIENT_ID, CUSTOM_GUILD_ID), {
                body: commands.filter(c => !MAIN_BOT_ONLY_COMMANDS.has(c.name)).map(c => c.toJSON()),
            });
            console.log('Custom bot guild commands registered!');
        } else {
            // Main bot: clear global commands and register per-guild instead.
            // Guild-specific commands take priority over globals immediately; the global
            // deletion propagates within ~1 hour.
            console.log('Clearing global commands and registering per-guild...');
            await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
            const guilds = [...client.guilds.cache.values()];
            console.log(`Syncing commands for ${guilds.length} guild(s)...`);
            for (const guild of guilds) {
                await syncGuildCommands(guild.id);
            }
            console.log('Per-guild command registration complete.');
        }
    } catch (error) {
        console.error('Failed to register commands:', error);
    }
}

// ============================================================
// Helper: Check if user is owner or moderator of a temp channel
// ============================================================
function getUserTempChannel(member) {
    const voiceChannel = member.voice?.channel;
    if (!voiceChannel) return null;

    const data = loadTempVoiceData();
    const guildData = data.guilds[member.guild.id];
    if (!guildData) return null;

    const channelData = guildData.active_channels[voiceChannel.id];
    if (!channelData) return null;

    return { channel: voiceChannel, data: channelData, fullData: data };
}

function isChannelOwner(userId, channelData) {
    return channelData.owner_id === userId;
}

function isChannelModerator(member, channelData, guildData) {
    // Check hub-specific moderator roles
    const hubData = guildData.hubs[channelData.hub_id];
    if (hubData) {
        const modRoles = hubData.moderator_roles || [];
        if (modRoles.some(roleId => member.roles.cache.has(roleId))) return true;
    }

    // Check global voice moderator roles & users
    const globalMods = guildData.voice_moderators || {};
    const globalModRoles = globalMods.roles || [];
    const globalModUsers = globalMods.users || [];
    if (globalModRoles.some(roleId => member.roles.cache.has(roleId))) return true;
    if (globalModUsers.includes(member.id)) return true;

    return false;
}

function isIgnoredRole(member, channelData, guildData) {
    const hubData = guildData.hubs[channelData.hub_id];
    if (!hubData) return false;

    const ignoredRoles = hubData.ignored_roles || [];
    return ignoredRoles.some(roleId => member.roles.cache.has(roleId));
}

function hasVoicePermission(member, channelData, guildData) {
    return isChannelOwner(member.id, channelData) || isChannelModerator(member, channelData, guildData) || member.permissions.has(PermissionFlagsBits.ManageChannels);
}

// Parse duration string (e.g. "5m", "1h", "7d") to milliseconds
function parseDuration(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)\s*(m|min|h|hr|d|day|w|week)s?$/i);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2].toLowerCase();
    const multipliers = { m: 60000, min: 60000, h: 3600000, hr: 3600000, d: 86400000, day: 86400000, w: 604800000, week: 604800000 };
    return num * (multipliers[unit] || 60000);
}

// Format duration ms to human readable
function formatDuration(ms) {
    if (ms >= 604800000) return `${Math.round(ms / 604800000)} week(s)`;
    if (ms >= 86400000) return `${Math.round(ms / 86400000)} day(s)`;
    if (ms >= 3600000) return `${Math.round(ms / 3600000)} hour(s)`;
    return `${Math.round(ms / 60000)} minute(s)`;
}

// Keep-alive timers for channels
const keepAliveTimers = new Map();

function startKeepAliveTimer(channelId, keepAliveMinutes, guild) {
    // Clear existing timer
    if (keepAliveTimers.has(channelId)) {
        clearTimeout(keepAliveTimers.get(channelId));
    }

    if (keepAliveMinutes === -1) return; // Never delete

    const ms = keepAliveMinutes * 60 * 1000;

    const timer = setTimeout(async () => {
        keepAliveTimers.delete(channelId);
        try {
            const channel = await guild.channels.fetch(channelId).catch(() => null);
            if (channel && channel.members.size === 0) {
                const data = loadTempVoiceData();
                const guildData = data.guilds[guild.id];
                if (guildData && guildData.active_channels[channelId]) {
                    delete guildData.active_channels[channelId];
                    saveTempVoiceData(data);
                    await channel.delete('Temporary voice channel expired').catch(() => {});
                    console.log(`Deleted expired temp channel: ${channel.name}`);
                }
            }
        } catch (e) {
            console.error('Keep-alive timer error:', e);
        }
    }, ms);

    keepAliveTimers.set(channelId, timer);
}

// Ownership lock timers
const ownershipLockTimers = new Map();

function startOwnershipLockTimer(channelId, lockMinutes) {
    if (ownershipLockTimers.has(channelId)) {
        clearTimeout(ownershipLockTimers.get(channelId));
    }

    if (lockMinutes === -1) return; // Never allow claiming

    const ms = lockMinutes * 60 * 1000;

    const timer = setTimeout(() => {
        ownershipLockTimers.delete(channelId);
        const data = loadTempVoiceData();
        for (const guildId in data.guilds) {
            const guildData = data.guilds[guildId];
            if (guildData.active_channels[channelId]) {
                guildData.active_channels[channelId].claimable = true;
                saveTempVoiceData(data);
                break;
            }
        }
    }, ms);

    ownershipLockTimers.set(channelId, timer);
}

// Track channel index per hub for {index} template
const hubChannelIndex = new Map();

// ============================================================
// Admin Helper Functions (Link/IP/Feature Management)
// ============================================================
function loadLinksFile() {
    try { if (fs.existsSync(LINKS_FILE)) return JSON.parse(fs.readFileSync(LINKS_FILE, 'utf8')); } catch (e) {}
    return {};
}
function loadAuditFile() {
    try { if (fs.existsSync(LINKS_AUDIT_FILE)) return JSON.parse(fs.readFileSync(LINKS_AUDIT_FILE, 'utf8')); } catch (e) {}
    return {};
}
function saveLinksFile(data) {
    try { fs.mkdirSync(path.dirname(LINKS_FILE), { recursive: true }); fs.writeFileSync(LINKS_FILE, JSON.stringify(data, null, 2)); return true; } catch (e) { return false; }
}
function saveAuditFile(data) {
    try { fs.mkdirSync(path.dirname(LINKS_AUDIT_FILE), { recursive: true }); fs.writeFileSync(LINKS_AUDIT_FILE, JSON.stringify(data, null, 2)); return true; } catch (e) { return false; }
}
function loadBannedIps() {
    try { if (fs.existsSync(BANNED_IPS_FILE)) return JSON.parse(fs.readFileSync(BANNED_IPS_FILE, 'utf8')); } catch (e) {}
    return { ips: [], reasons: {} };
}
function saveBannedIps(data) {
    try { fs.mkdirSync(path.dirname(BANNED_IPS_FILE), { recursive: true }); fs.writeFileSync(BANNED_IPS_FILE, JSON.stringify(data, null, 2)); return true; } catch (e) { return false; }
}
function loadIpBans() {
    try { if (fs.existsSync(IP_BANS_FILE)) return JSON.parse(fs.readFileSync(IP_BANS_FILE, 'utf8')); } catch (e) {}
    return { global: [], features: {}, temp: [] };
}
function saveIpBans(data) {
    try { fs.mkdirSync(path.dirname(IP_BANS_FILE), { recursive: true }); fs.writeFileSync(IP_BANS_FILE, JSON.stringify(data, null, 2)); return true; } catch (e) { return false; }
}
function loadCubReactiveUsers() {
    try { if (fs.existsSync(CUBREACTIVE_USERS_FILE)) return JSON.parse(fs.readFileSync(CUBREACTIVE_USERS_FILE, 'utf8')); } catch (e) {}
    return {};
}

const ALL_WEBSITE_FEATURES = [
    'social-media-saver', 'file-converter', 'pdf-tools', 'image-editor',
    'qr-generator', 'link-shortener', 'color-picker', 'text-tools',
    'unit-converter', 'json-formatter', 'timestamp-converter', 'video-compressor',
    'resume-builder', 'countdown-maker', 'random-picker', 'wheel-spinner',
    'calculator-suite', 'password-generator', 'timer-tools', 'world-clock',
    'currency-converter', 'sticky-board',
];
function loadDisabledFeatures() {
    const DISABLED_FILE = path.join(WEBSITE_DATA_PATH, 'disabled_features.json');
    try { if (fs.existsSync(DISABLED_FILE)) return JSON.parse(fs.readFileSync(DISABLED_FILE, 'utf8')); } catch (e) {}
    return [];
}
function saveDisabledFeatures(features) {
    const DISABLED_FILE = path.join(WEBSITE_DATA_PATH, 'disabled_features.json');
    try { fs.mkdirSync(path.dirname(DISABLED_FILE), { recursive: true }); fs.writeFileSync(DISABLED_FILE, JSON.stringify(features, null, 2)); return true; } catch (e) { return false; }
}
function loadKeraplastPasswords() {
    const KERAPLAST_FILE = path.join(WEBSITE_DATA_PATH, 'keraplast_passwords.json');
    try { if (fs.existsSync(KERAPLAST_FILE)) return JSON.parse(fs.readFileSync(KERAPLAST_FILE, 'utf8')); } catch (e) {}
    return { passwords: [] };
}
function saveKeraplastPasswords(data) {
    const KERAPLAST_FILE = path.join(WEBSITE_DATA_PATH, 'keraplast_passwords.json');
    try { fs.mkdirSync(path.dirname(KERAPLAST_FILE), { recursive: true }); fs.writeFileSync(KERAPLAST_FILE, JSON.stringify(data, null, 2)); return true; } catch (e) { return false; }
}

// ============================================================
// CubReactive — Voice Speaking Detection (OBS Overlay)
// ============================================================
const { joinVoiceChannel: _crJoinVC } = require('@discordjs/voice');
const crVoiceStates       = new Map(); // userId  → state object
const crOverlayConns      = new Map(); // userId  → [ws, …]
const crChannelMembers    = new Map(); // channelId → Set(userId)
const crActiveVoiceConns  = new Map(); // channelId → { guildId, connection }
const crOverlayChannels   = new Map(); // channelId → Set(userId)
let   crWss               = null;
const crBotPeers          = new Map(); // guildId → bot peer ws connection (custom bot instances)

function _crSpeakingHandler(channelId, guildId) {
    return function onPacket(packet) {
        if (packet.op === 5) {
            const { user_id, speaking: flags } = packet.d;
            if (!user_id || user_id === client.user?.id) return;
            const isSpeaking = (flags & 1) !== 0;
            const vs = crVoiceStates.get(user_id);
            if (vs) { vs.speaking = isSpeaking; crVoiceStates.set(user_id, vs); crBroadcastVoice(user_id, vs); }
        } else if (packet.op === 4) {
            const guild = client.guilds.cache.get(guildId);
            const channel = guild?.channels.cache.get(channelId);
            if (channel) { crScanChannel(channel); crBroadcastChannel(channelId); }
        }
    };
}

function crBroadcastVoice(userId, data) {
    (crOverlayConns.get(userId) || []).forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'VOICE_STATE_UPDATE', userId, data }));
    });
    crOverlayConns.forEach((conns, oid) => {
        if (oid === userId) return;
        conns.forEach(ws => {
            if (ws.readyState !== WebSocket.OPEN || !ws.isGroupMode) return;
            const a = crVoiceStates.get(oid), b = crVoiceStates.get(userId);
            if (a && b && a.channelId === b.channelId) ws.send(JSON.stringify({ type: 'VOICE_STATE_UPDATE', userId, data }));
        });
    });
}

function crBroadcastChannel(channelId) {
    const members = crChannelMembers.get(channelId) || new Set();
    const list = [...members].map(uid => { const s = crVoiceStates.get(uid); return s ? { userId: uid, ...s } : null; }).filter(Boolean);
    crOverlayConns.forEach((conns, uid) => {
        const s = crVoiceStates.get(uid);
        if (s && s.channelId === channelId) {
            conns.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'CHANNEL_UPDATE', channelId, members: list })); });
        }
    });
}

function crScanChannel(channel) {
    if (!channel?.members) return;
    const channelId = channel.id, guildId = channel.guild?.id;
    if (!crChannelMembers.has(channelId)) crChannelMembers.set(channelId, new Set());
    channel.members.forEach(member => {
        if (member.user.bot) return;
        const uid = member.id;
        crChannelMembers.get(channelId).add(uid);
        if (crVoiceStates.has(uid)) return;
        const vs = member.voice;
        crVoiceStates.set(uid, {
            channelId, guildId,
            username: member.displayName || member.user.username || 'Unknown',
            avatar: member.user.avatarURL({ size: 256 }) || `https://cdn.discordapp.com/embed/avatars/${parseInt(member.user.discriminator || '0') % 5}.png`,
            muted: vs?.selfMute || vs?.serverMute || false,
            deafened: vs?.selfDeaf || vs?.serverDeaf || false,
            speaking: false, streaming: vs?.streaming || false, video: vs?.selfVideo || false,
        });
    });
}

async function crJoinChannel(channelId, guildId) {
    // If this guild has a custom bot, delegate voice joining to it
    if (guildHasCustomBot(guildId)) {
        const peer = crBotPeers.get(guildId);
        if (peer?.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ type: 'JOIN_VOICE', channelId, guildId }));
        }
        const guild = client.guilds.cache.get(guildId);
        const channel = guild?.channels.cache.get(channelId);
        if (channel) { crScanChannel(channel); crBroadcastChannel(channelId); }
        return;
    }
    if (crActiveVoiceConns.has(channelId)) {
        const guild = client.guilds.cache.get(guildId);
        const ch = guild?.channels.cache.get(channelId);
        if (ch) { crScanChannel(ch); crBroadcastChannel(channelId); }
        return;
    }
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;
        const perms = channel.permissionsFor(guild.members.me);
        if (!perms?.has('Connect')) { crBroadcastChannel(channelId); return; }
        crScanChannel(channel);
        crBroadcastChannel(channelId);
        const connection = _crJoinVC({ channelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfMute: true, selfDeaf: true });
        crActiveVoiceConns.set(channelId, { guildId, channelId, connection });

        const onPacket = _crSpeakingHandler(channelId, guildId);
        let wiredWs = null;
        function wireWs(networking) {
            if (!networking) return;
            const ws = Reflect.get(networking.state, 'ws');
            if (ws && ws !== wiredWs) { ws.on('packet', onPacket); wiredWs = ws; }
            networking.on('stateChange', (_o, ns) => {
                const nws = Reflect.get(ns, 'ws');
                if (nws && nws !== wiredWs) { if (wiredWs) wiredWs.removeListener('packet', onPacket); nws.on('packet', onPacket); wiredWs = nws; }
            });
        }
        connection.on('stateChange', (oldSt, newSt) => {
            const oNet = Reflect.get(oldSt, 'networking'), nNet = Reflect.get(newSt, 'networking');
            if (nNet && nNet !== oNet) wireWs(nNet);
            if (newSt.status === 'ready' && oldSt.status !== 'ready') {
                const members = crChannelMembers.get(channelId);
                if (members) members.forEach(uid => { const vs = crVoiceStates.get(uid); if (vs?.speaking) { vs.speaking = false; crVoiceStates.set(uid, vs); crBroadcastVoice(uid, vs); } });
                connection.receiver.speaking.removeAllListeners('start');
                connection.receiver.speaking.removeAllListeners('end');
                connection.receiver.speaking.on('start', uid => { if (uid === client.user?.id) return; const vs = crVoiceStates.get(uid); if (vs && !vs.speaking) { vs.speaking = true; crVoiceStates.set(uid, vs); crBroadcastVoice(uid, vs); } });
                connection.receiver.speaking.on('end',   uid => { if (uid === client.user?.id) return; const vs = crVoiceStates.get(uid); if (vs?.speaking)  { vs.speaking = false; crVoiceStates.set(uid, vs); crBroadcastVoice(uid, vs); } });
            }
            if (newSt.status === 'destroyed') {
                if (wiredWs) { wiredWs.removeListener('packet', onPacket); wiredWs = null; }
                crActiveVoiceConns.delete(channelId);
                const overlayUsers = crOverlayChannels.get(channelId);
                if (overlayUsers?.size > 0) setTimeout(() => { if (!crActiveVoiceConns.has(channelId)) crJoinChannel(channelId, guildId).catch(() => {}); }, 5000);
            }
        });
        const initNet = Reflect.get(connection.state, 'networking');
        if (initNet) wireWs(initNet);
    } catch (e) {
        console.error(`[CubReactive] Failed to join ${channelId}:`, e.message);
        crActiveVoiceConns.delete(channelId);
    }
}

function crLeaveIfUnneeded(channelId) {
    const users = crOverlayChannels.get(channelId);
    if (!users || users.size === 0) {
        crOverlayChannels.delete(channelId);
        const guildId = crActiveVoiceConns.get(channelId)?.guildId
                     || [...crVoiceStates.values()].find(s => s.channelId === channelId)?.guildId;
        if (guildId && guildHasCustomBot(guildId)) {
            const peer = crBotPeers.get(guildId);
            if (peer?.readyState === WebSocket.OPEN) peer.send(JSON.stringify({ type: 'LEAVE_VOICE', channelId }));
            return;
        }
        const st = crActiveVoiceConns.get(channelId);
        if (st) { try { st.connection?.destroy(); } catch (_) {} crActiveVoiceConns.delete(channelId); }
    }
}

function crTrackUser(userId, channelId, guildId) {
    // Validate: the user must actually be in this channel right now.
    // This prevents stale tracking or another user's overlay URL triggering a join.
    const vs = crVoiceStates.get(userId);
    if (!vs || vs.channelId !== channelId || vs.guildId !== guildId) return;
    if (!crOverlayChannels.has(channelId)) crOverlayChannels.set(channelId, new Set());
    crOverlayChannels.get(channelId).add(userId);
    setTimeout(() => crJoinChannel(channelId, guildId).catch(() => {}), 500);
}

function crUntrackUser(userId, channelId) {
    const users = crOverlayChannels.get(channelId);
    if (users) { users.delete(userId); crLeaveIfUnneeded(channelId); }
}

function scanAllVoiceChannels() {
    let total = 0;
    client.guilds.cache.forEach(guild => {
        guild.channels.cache.forEach(channel => {
            if ((channel.type === 2 || channel.type === 13) && channel.members?.size > 0) {
                crScanChannel(channel);
                total += channel.members.size;
            }
        });
    });
    console.log(`[CubReactive] Startup scan: ${total} users in voice`);
}

function startCubReactiveWebSocket() {
    crWss = new WebSocket.Server({ port: CUBREACTIVE_WS_PORT });
    crWss.on('connection', (ws) => {
        ws.isAlive = true; ws.userId = null; ws.isGroupMode = false;
        ws.on('pong', () => { ws.isAlive = true; });
        ws.on('message', msg => {
            try {
                const data = JSON.parse(msg);
                if (data.type === 'BOT_REGISTER') {
                    ws.isBotPeer = true;
                    ws.botGuildId = data.guildId;
                    crBotPeers.set(data.guildId, ws);
                    ws.send(JSON.stringify({ type: 'BOT_REGISTERED' }));
                    console.log(`[CubReactive] Custom bot peer registered for guild ${data.guildId}`);
                    return;
                }
                if (data.type === 'SPEAKING_EVENT' && ws.isBotPeer) {
                    const vs = crVoiceStates.get(data.userId);
                    if (vs) { vs.speaking = data.speaking; crVoiceStates.set(data.userId, vs); crBroadcastVoice(data.userId, vs); }
                    return;
                }
                if (data.type === 'SUBSCRIBE') {
                    const cubUsers = loadCubReactiveUsers();
                    const uc = cubUsers[data.userId];
                    // Overlay mode requires the user to be a registered CubReactive user.
                    // This prevents an unregistered user (or someone loading another user's overlay URL)
                    // from triggering the bot to join a channel on their behalf.
                    const isOverlayMode = (data.mode === 'individual' || data.mode === 'group');
                    if (isOverlayMode && !uc) { ws.send(JSON.stringify({ type: 'NOT_REGISTERED', userId: data.userId })); ws.close(); return; }
                    if (uc && uc.enabled === false) { ws.send(JSON.stringify({ type: 'DISABLED', userId: data.userId })); ws.close(); return; }
                    // If the user has an overlay_key set, the SUBSCRIBE must include the matching key.
                    // This prevents someone else's OBS (with a stale/copied URL) from triggering bot joins.
                    if (isOverlayMode && uc && uc.overlay_key && data.key !== uc.overlay_key) { ws.send(JSON.stringify({ type: 'INVALID_KEY', userId: data.userId })); ws.close(); return; }
                    ws.userId = data.userId;
                    ws.isGroupMode = data.mode === 'group';
                    ws.isOverlay = isOverlayMode;
                    if (!crOverlayConns.has(data.userId)) crOverlayConns.set(data.userId, []);
                    crOverlayConns.get(data.userId).push(ws);
                    const cur = crVoiceStates.get(data.userId);
                    if (cur) {
                        ws.send(JSON.stringify({ type: 'VOICE_STATE_UPDATE', userId: data.userId, data: cur }));
                        if (ws.isOverlay && cur.channelId && cur.guildId) crTrackUser(data.userId, cur.channelId, cur.guildId);
                        if (ws.isGroupMode && cur.channelId) crBroadcastChannel(cur.channelId);
                    } else { ws.send(JSON.stringify({ type: 'NOT_IN_VOICE', userId: data.userId })); }
                }
                if (data.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
            } catch (e) { console.error('[CubReactive] msg error:', e); }
        });
        ws.on('close', () => {
            if (ws.isBotPeer && ws.botGuildId) { crBotPeers.delete(ws.botGuildId); return; }
            if (ws.userId) {
                const conns = crOverlayConns.get(ws.userId);
                if (conns) {
                    const i = conns.indexOf(ws);
                    if (i > -1) conns.splice(i, 1);
                    if (conns.length === 0) crOverlayConns.delete(ws.userId);
                    // Only leave voice when the last actual overlay (not dashboard) closes
                    if (ws.isOverlay && !conns.some(c => c.isOverlay && c.readyState === WebSocket.OPEN)) {
                        const vs = crVoiceStates.get(ws.userId);
                        if (vs?.channelId) crUntrackUser(ws.userId, vs.channelId);
                    }
                }
            }
        });
        ws.send(JSON.stringify({ type: 'READY' }));
    });
    const hb = setInterval(() => { crWss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }); }, 30000);
    crWss.on('close', () => clearInterval(hb));
    console.log(`[CubReactive] WebSocket server on port ${CUBREACTIVE_WS_PORT}`);
}

// CubReactive — Custom Bot Peer (joins voice on behalf of main bot for custom-bot guilds)
const crBotActiveVoiceConns = new Map(); // channelId → { guildId, connection }
let crBotPeerWs = null;

async function crBotJoinChannel(channelId, guildId) {
    if (crBotActiveVoiceConns.has(channelId)) return;
    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;
        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;
        const connection = _crJoinVC({ channelId, guildId, adapterCreator: guild.voiceAdapterCreator, selfMute: true, selfDeaf: true });
        crBotActiveVoiceConns.set(channelId, { guildId, connection });
        function sendSpeaking(userId, speaking) {
            if (crBotPeerWs?.readyState === WebSocket.OPEN)
                crBotPeerWs.send(JSON.stringify({ type: 'SPEAKING_EVENT', userId, speaking, channelId, guildId }));
        }
        const onPacket = (packet) => {
            if (packet.op === 5) {
                const { user_id, speaking: flags } = packet.d;
                if (user_id && user_id !== client.user?.id) sendSpeaking(user_id, (flags & 1) !== 0);
            }
        };
        let wiredWs2 = null;
        function wireWs2(networking) {
            if (!networking) return;
            const nws = Reflect.get(networking.state, 'ws');
            if (nws && nws !== wiredWs2) { nws.on('packet', onPacket); wiredWs2 = nws; }
            networking.on('stateChange', (_o, ns) => {
                const nnws = Reflect.get(ns, 'ws');
                if (nnws && nnws !== wiredWs2) { if (wiredWs2) wiredWs2.removeListener('packet', onPacket); nnws.on('packet', onPacket); wiredWs2 = nnws; }
            });
        }
        connection.on('stateChange', (oldSt, newSt) => {
            const oNet = Reflect.get(oldSt, 'networking'), nNet = Reflect.get(newSt, 'networking');
            if (nNet && nNet !== oNet) wireWs2(nNet);
            if (newSt.status === 'ready' && oldSt.status !== 'ready') {
                connection.receiver.speaking.removeAllListeners('start');
                connection.receiver.speaking.removeAllListeners('end');
                connection.receiver.speaking.on('start', uid => { if (uid !== client.user?.id) sendSpeaking(uid, true); });
                connection.receiver.speaking.on('end',   uid => { if (uid !== client.user?.id) sendSpeaking(uid, false); });
            }
            if (newSt.status === 'destroyed') crBotActiveVoiceConns.delete(channelId);
        });
        const initNet = Reflect.get(connection.state, 'networking');
        if (initNet) wireWs2(initNet);
        console.log(`[CubReactive] Custom bot joined voice ${channelId}`);
    } catch (e) {
        console.error(`[CubReactive] Custom bot failed to join ${channelId}:`, e.message);
        crBotActiveVoiceConns.delete(channelId);
    }
}

function startCrBotPeer() {
    try {
        crBotPeerWs = new WebSocket(`ws://localhost:${CUBREACTIVE_WS_PORT}`);
        crBotPeerWs.on('open', () => {
            crBotPeerWs.send(JSON.stringify({ type: 'BOT_REGISTER', guildId: CUSTOM_GUILD_ID }));
        });
        crBotPeerWs.on('message', async (msg) => {
            try {
                const data = JSON.parse(msg);
                if (data.type === 'JOIN_VOICE') await crBotJoinChannel(data.channelId, data.guildId);
                if (data.type === 'LEAVE_VOICE') {
                    const st = crBotActiveVoiceConns.get(data.channelId);
                    if (st) { try { st.connection.destroy(); } catch (_) {} crBotActiveVoiceConns.delete(data.channelId); }
                }
            } catch (e) { console.error('[CubReactive] Bot peer msg error:', e); }
        });
        crBotPeerWs.on('close', () => {
            console.warn('[CubReactive] Bot peer WS disconnected, reconnecting in 15s...');
            setTimeout(startCrBotPeer, 15000);
        });
        crBotPeerWs.on('error', (e) => { console.warn('[CubReactive] Bot peer WS error:', e.message); });
    } catch (e) {
        console.error('[CubReactive] startCrBotPeer failed:', e.message);
        setTimeout(startCrBotPeer, 15000);
    }
}

function startLogServer() {
    const logApp = express();
    logApp.use(express.json());

    logApp.post('/log', async (req, res) => {
        const { project, level, message, apiKey } = req.body;
        if (apiKey !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
        if (!project || !message) return res.status(400).json({ error: 'Missing project or message' });
        const channelId = projectChannels[project];
        if (!channelId) return res.status(400).json({ error: 'Unknown project' });
        try {
            const ch = await client.channels.fetch(channelId).catch(() => null);
            if (!ch) return res.status(500).json({ error: 'Channel not found' });
            const colors = { info: 0x3b82f6, success: 0x22c55e, warn: 0xf59e0b, error: 0xef4444 };
            const icons  = { info: 'ℹ️',   success: '✅',         warn: '⚠️',       error: '❌' };
            const lvl = level || 'info';
            await ch.send({ embeds: [new EmbedBuilder().setColor(colors[lvl] || colors.info).setDescription(`${icons[lvl] || ''} ${message}`).setFooter({ text: project }).setTimestamp()] });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    logApp.post('/report', async (req, res) => {
        const { apiKey, report } = req.body;
        if (apiKey !== API_KEY) return res.status(401).json({ error: 'Invalid API key' });
        if (!report) return res.status(400).json({ error: 'Missing report data' });
        try {
            const ch = await client.channels.fetch(projectChannels['reports']).catch(() => null);
            if (!ch) return res.status(500).json({ error: 'Channel not found' });
            const reportEmbed = new EmbedBuilder().setTitle(`New Report: ${(report.type || 'general').charAt(0).toUpperCase() + (report.type || 'general').slice(1)}`).setColor(0xFF6B6B)
                .addFields(
                    { name: 'Report ID', value: report.id || 'N/A', inline: true },
                    { name: 'Type', value: report.type || 'general', inline: true },
                    { name: 'Subject', value: report.subject || 'N/A', inline: false },
                    { name: 'Description', value: (report.description || 'N/A').substring(0, 1000), inline: false },
                    { name: 'URL', value: report.url || 'N/A', inline: false },
                    { name: 'Contact', value: report.contact || 'N/A', inline: true }
                ).setTimestamp();
            const trackingEmbed = new EmbedBuilder().setTitle('User Tracking Information').setColor(0x5865F2)
                .addFields(
                    { name: 'IP Address',   value: `\`${report.ip || 'Unknown'}\``, inline: true },
                    { name: 'Fingerprint',  value: `\`${report.fingerprint || 'N/A'}\``, inline: true },
                    { name: 'User Agent',   value: `\`\`\`${(report.user_agent || 'Unknown').substring(0, 200)}\`\`\``, inline: false },
                    { name: 'Language',     value: report.accept_language || 'Unknown', inline: true },
                    { name: 'Referer',      value: (report.referer || 'Direct').substring(0, 100), inline: true }
                );
            await ch.send({ content: `<@378501056008683530> New report submitted!`, embeds: [reportEmbed, trackingEmbed] });
            res.json({ success: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    logApp.post('/cubreactive/refresh', (req, res) => {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const conns = crOverlayConns.get(userId) || [];
        let notified = 0;
        conns.forEach(ws => { if (ws.readyState === WebSocket.OPEN) { ws.send(JSON.stringify({ type: 'CONFIG_UPDATED', userId })); notified++; } });
        res.json({ success: true, notified });
    });

    logApp.get('/cubreactive/status', (req, res) => {
        const voiceConns = [];
        crActiveVoiceConns.forEach((c, cid) => voiceConns.push({ channelId: cid, status: c.connection?.state?.status ?? 'unknown' }));
        const states = [];
        crVoiceStates.forEach((s, uid) => states.push({ userId: uid, channelId: s.channelId, username: s.username, speaking: s.speaking, muted: s.muted, deafened: s.deafened }));
        const overlays = [];
        crOverlayConns.forEach((cs, uid) => overlays.push({ userId: uid, count: cs.filter(ws => ws.readyState === WebSocket.OPEN).length }));
        res.json({ voiceConnections: voiceConns, voiceStates: states, overlayConnections: overlays, wsClients: crWss ? crWss.clients.size : 0 });
    });

    logApp.post('/cubreactive/test-speaking', (req, res) => {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ error: 'userId required' });
        const state = crVoiceStates.get(userId) || { username: 'Test User', channelId: 'test', speaking: false, muted: false, deafened: false };
        crBroadcastVoice(userId, { ...state, speaking: true });
        setTimeout(() => crBroadcastVoice(userId, { ...state, speaking: false }), 2000);
        res.json({ success: true, userId, overlays: (crOverlayConns.get(userId) || []).filter(ws => ws.readyState === WebSocket.OPEN).length });
    });

    logApp.listen(LOG_SERVER_PORT, '127.0.0.1', () => console.log(`[CubSoftware] Log server on port ${LOG_SERVER_PORT}`));
}

// ============================================================
// Discord Terminal Setup (Admin Commands via Discord Channel)
// ============================================================
let terminal = null;
if (DiscordTerminal) {
    terminal = new DiscordTerminal(client, {
        prefix: '>',
        ownerIds: OWNER_IDS,
        channelId: TERMINAL_CHANNEL_ID,
        eventsChannelId: process.env.BOT_EVENTS_CHANNEL_ID || '1466190584372003092',
        botName: 'CUB PROTECTOR',
        botId: 'cubprotector',
        aliases: ['cp', 'cub', 'cubprotect'],
        autoClear: true,
    });

    terminal.addCommand('whitelist', {
        description: 'Manage dashboard whitelist',
        usage: 'whitelist <add|remove|list> [userid]',
        execute: async (args) => {
            const action = args[0], userId = args[1];
            if (!action || !['add', 'remove', 'list'].includes(action)) return '❌ Usage: `>whitelist <add|remove|list> [userid]`';
            const headers = { 'X-API-Key': API_KEY, 'Content-Type': 'application/json' };
            if (action === 'list') { const res = await axios.get(`${API_URL}/api/pm2/bot/whitelist`, { headers }); return `📋 **Whitelist:**\n\`\`\`\n${(res.data.allowed_users || []).join('\n') || 'None'}\n\`\`\``; }
            if (!userId) return '❌ Provide a user ID';
            if (action === 'add') { await axios.post(`${API_URL}/api/pm2/bot/whitelist/add`, { user_id: userId }, { headers }); return `✅ Added **${userId}**`; }
            if (action === 'remove') { await axios.post(`${API_URL}/api/pm2/bot/whitelist/remove`, { user_id: userId }, { headers }); return `🗑️ Removed **${userId}**`; }
        },
    });

    terminal.addCommand('feature', {
        description: 'Enable/disable website features',
        usage: 'feature <enable|disable|list> [name]',
        execute: async (args) => {
            const action = args[0], name = args.slice(1).join('-');
            if (!action || !['enable', 'disable', 'list'].includes(action)) return '❌ Usage: `>feature <enable|disable|list> [name]`\n\nFeatures: `' + ALL_WEBSITE_FEATURES.join('`, `') + '`';
            if (action === 'list') { const d = loadDisabledFeatures(); return `**Feature Status:**\n${ALL_WEBSITE_FEATURES.map(f => `${d.includes(f) ? '🔴' : '🟢'} ${f}`).join('\n')}`; }
            if (!name) return '❌ Specify a feature name';
            if (!ALL_WEBSITE_FEATURES.includes(name)) return `❌ Unknown feature: \`${name}\``;
            const d = loadDisabledFeatures();
            if (action === 'disable') { if (d.includes(name)) return `⚠️ Already disabled`; d.push(name); return saveDisabledFeatures(d) ? `🔴 **${name}** disabled` : '❌ Save failed'; }
            if (action === 'enable')  { if (!d.includes(name)) return `⚠️ Not disabled`; return saveDisabledFeatures(d.filter(f => f !== name)) ? `🟢 **${name}** enabled` : '❌ Save failed'; }
        },
    });

    terminal.addCommand('link-find', {
        description: 'Find info about a shortened link',
        usage: 'link-find <code>',
        execute: async (args) => {
            let code = args[0]; if (!code) return '❌ Usage: `>link-find <code>`';
            if (code.includes('cubsw.link/')) code = code.split('cubsw.link/')[1].split(/[?#]/)[0];
            if (code.includes('/')) code = code.split('/').pop();
            const links = loadLinksFile(), audit = loadAuditFile();
            if (links[code]) { const l = links[code]; return `**Link Found (Active)**\n• Code: \`${code}\`\n• URL: ${l.url.substring(0, 200)}\n• Clicks: ${l.clicks || 0}\n• Created: ${new Date(l.created * 1000).toLocaleString()}\n• IP: ||${l.ip || 'Unknown'}||`; }
            if (audit[code]) { const e = audit[code]; return `**Link Found (Deleted)**\n• Code: \`${code}\`\n• URL: ${e.original_url.substring(0, 200)}\n• IP: ||${e.ip_address}||`; }
            return `❌ No link found: \`${code}\``;
        },
    });

    terminal.addCommand('link-delete', {
        description: 'Delete a shortened link',
        usage: 'link-delete <code>',
        execute: async (args) => {
            let code = args[0]; if (!code) return '❌ Usage: `>link-delete <code>`';
            if (code.includes('cubsw.link/')) code = code.split('cubsw.link/')[1].split(/[?#]/)[0];
            if (code.includes('/')) code = code.split('/').pop();
            const links = loadLinksFile(), audit = loadAuditFile();
            if (!links[code]) return audit[code] ? `⚠️ Already deleted` : `❌ Not found: \`${code}\``;
            const ld = links[code];
            if (!audit[code]) audit[code] = { original_url: ld.url, created_at: ld.created, ip_address: ld.ip || 'Unknown', history: [] };
            audit[code].history.push({ action: 'deleted', timestamp: Math.floor(Date.now() / 1000), ip: 'Discord Terminal', clicks: ld.clicks || 0 });
            delete links[code];
            return saveLinksFile(links) && saveAuditFile(audit) ? `✅ Deleted \`${code}\` (${ld.clicks || 0} clicks)` : '❌ Save failed';
        },
    });

    terminal.addCommand('link-list', {
        description: 'List recent shortened links',
        usage: 'link-list [count]',
        execute: async (args) => {
            const count = Math.min(parseInt(args[0]) || 10, 25);
            const links = loadLinksFile();
            const sorted = Object.entries(links).sort((a, b) => (b[1].created || 0) - (a[1].created || 0)).slice(0, count);
            if (!sorted.length) return '📋 No links found.';
            return `**Recent Links (${sorted.length})**\n${sorted.map(([c, d]) => `\`${c}\` → ${d.url.length > 40 ? d.url.substring(0, 40) + '...' : d.url} (${d.clicks || 0} clicks)`).join('\n')}`;
        },
    });
}

// ============================================================
// Voice State Update - Create/Delete Temp Channels
// ============================================================
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (CUSTOM_GUILD_ID && newState.guild?.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newState.guild?.id)) return;
    const guild = newState.guild;
    const data = loadTempVoiceData();
    const guildData = data.guilds[guild.id];

    if (!guildData) return;

    // --- User joined a hub channel ---
    if (newState.channelId && guildData.hubs[newState.channelId]) {
        const member = newState.member;

        // Skip bots (e.g. CUB Reactive OBS plugin) — don't create a temp channel for them
        if (member.user.bot) return;

        const hub = guildData.hubs[newState.channelId];

        // Get or increment index
        const indexKey = newState.channelId;
        const currentIndex = (hubChannelIndex.get(indexKey) || 0) + 1;
        hubChannelIndex.set(indexKey, currentIndex);

        // Build channel name from template
        let channelName = (hub.name_template || '🔊・{username}')
            .replace('{username}', member.displayName)
            .replace('{index}', currentIndex.toString());

        try {
            // Build permission overwrites
            const permOverwrites = [
                // Hide from everyone by default, but allow speak/VAD so permitted users can talk
                {
                    id: guild.id,
                    allow: [
                        PermissionsBitField.Flags.Speak,
                        PermissionsBitField.Flags.UseVAD,
                    ],
                    deny: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
                },
                // Owner has full control
                {
                    id: member.id,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.Speak,
                        PermissionsBitField.Flags.UseVAD,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.MoveMembers,
                        PermissionsBitField.Flags.PrioritySpeaker,
                        PermissionsBitField.Flags.MuteMembers,
                        PermissionsBitField.Flags.DeafenMembers,
                    ],
                },
                // Bot needs access
                {
                    id: CLIENT_ID,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.ManageChannels,
                        PermissionsBitField.Flags.MoveMembers,
                    ],
                },
            ];

            // Add hub-specific moderator roles
            const hubModRoles = hub.moderator_roles || [];
            for (const roleId of hubModRoles) {
                permOverwrites.push({
                    id: roleId,
                    allow: [
                        PermissionsBitField.Flags.ViewChannel,
                        PermissionsBitField.Flags.Connect,
                        PermissionsBitField.Flags.MoveMembers,
                        PermissionsBitField.Flags.MuteMembers,
                        PermissionsBitField.Flags.DeafenMembers,
                    ],
                });
            }

            // Add global voice moderator roles
            const globalMods = guildData.voice_moderators || {};
            for (const roleId of (globalMods.roles || [])) {
                if (!hubModRoles.includes(roleId)) {
                    permOverwrites.push({
                        id: roleId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.MoveMembers,
                            PermissionsBitField.Flags.MuteMembers,
                            PermissionsBitField.Flags.DeafenMembers,
                        ],
                    });
                }
            }

            // Add global voice moderator users
            for (const userId of (globalMods.users || [])) {
                if (userId !== member.id) {
                    permOverwrites.push({
                        id: userId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.MoveMembers,
                            PermissionsBitField.Flags.MuteMembers,
                            PermissionsBitField.Flags.DeafenMembers,
                        ],
                    });
                }
            }

            // Create the temp voice channel in the same category
            const tempChannel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildVoice,
                parent: hub.category_id || newState.channel?.parentId,
                userLimit: hub.user_limit || 0,
                bitrate: (hub.bitrate || 64) * 1000,
                permissionOverwrites: permOverwrites,
            });

            // Move the user to the temp channel
            await member.voice.setChannel(tempChannel).catch(() => {});

            // Track the channel
            if (!guildData.active_channels) guildData.active_channels = {};
            guildData.active_channels[tempChannel.id] = {
                owner_id: member.id,
                hub_id: newState.channelId,
                created_at: Math.floor(Date.now() / 1000),
                banned_users: [],
                permitted_users: [],
                locked: false,
                hidden: true,
                claimable: false,
            };
            saveTempVoiceData(data);

            console.log(`Created temp VC "${channelName}" for ${member.user.tag}`);
        } catch (e) {
            console.error('Failed to create temp voice channel:', e);
        }
    }

    // --- User left a temp channel ---
    if (oldState.channelId && guildData.active_channels[oldState.channelId]) {
        const channelData = guildData.active_channels[oldState.channelId];
        const channel = oldState.channel;

        if (channel && channel.members.size === 0) {
            // Channel is empty - start keep-alive timer or delete immediately
            const hub = guildData.hubs[channelData.hub_id] || {};
            const keepAlive = hub.keep_alive !== undefined ? hub.keep_alive : 0;

            if (keepAlive === 0) {
                // Delete immediately
                delete guildData.active_channels[oldState.channelId];
                saveTempVoiceData(data);
                await channel.delete('Temporary voice channel empty').catch(() => {});
                console.log(`Deleted empty temp VC: ${channel.name}`);
            } else {
                // Start keep-alive timer
                startKeepAliveTimer(oldState.channelId, keepAlive, guild);
            }
        } else if (channel && oldState.member?.id === channelData.owner_id) {
            // Owner left but others remain - start ownership lock timer
            const hub = guildData.hubs[channelData.hub_id] || {};
            const ownershipLock = hub.ownership_lock !== undefined ? hub.ownership_lock : 0;
            startOwnershipLockTimer(oldState.channelId, ownershipLock);
        }
    }

    // --- User joined an existing temp channel (cancel keep-alive) ---
    if (newState.channelId && guildData.active_channels[newState.channelId]) {
        if (keepAliveTimers.has(newState.channelId)) {
            clearTimeout(keepAliveTimers.get(newState.channelId));
            keepAliveTimers.delete(newState.channelId);
        }
    }
});

// CubReactive voice state tracking (runs alongside temp-channel handler above)
client.on('voiceStateUpdate', async (oldState, newState) => {
    const userId = newState.member?.id || oldState.member?.id;
    if (!userId || userId === client.user?.id) return;
    // CubReactive runs on the main bot only — it tracks voice states across ALL guilds.
    // Custom bot instances don't run CubReactive (they share the same WS server).
    if (CUSTOM_GUILD_ID) return;
    const crGuildId = newState.guild?.id || oldState.guild?.id;
    const member = newState.member || oldState.member;
    if (member?.user?.bot) return; // skip all bots (custom bots, etc.)
    const username = member?.displayName || member?.user?.username || 'Unknown';
    const avatar = member?.user?.avatarURL({ size: 256 }) || `https://cdn.discordapp.com/embed/avatars/${parseInt(member?.user?.discriminator || '0') % 5}.png`;
    const oldChannelId = oldState.channelId, newChannelId = newState.channelId;

    if (!newChannelId) {
        if (oldChannelId) {
            const om = crChannelMembers.get(oldChannelId);
            if (om) { om.delete(userId); if (om.size === 0) crChannelMembers.delete(oldChannelId); }
            if (crOverlayConns.has(userId)) crUntrackUser(userId, oldChannelId);
            crBroadcastChannel(oldChannelId);
        }
        crVoiceStates.delete(userId);
        crBroadcastVoice(userId, { left: true });
        return;
    }
    if (oldChannelId && oldChannelId !== newChannelId) {
        const om = crChannelMembers.get(oldChannelId);
        if (om) { om.delete(userId); if (om.size === 0) crChannelMembers.delete(oldChannelId); }
        if (crOverlayConns.has(userId)) crUntrackUser(userId, oldChannelId);
        crBroadcastChannel(oldChannelId);
    }
    if (!crChannelMembers.has(newChannelId)) crChannelMembers.set(newChannelId, new Set());
    crChannelMembers.get(newChannelId).add(userId);
    const isNew = !oldChannelId || oldChannelId !== newChannelId;
    const state = {
        channelId: newChannelId, guildId: crGuildId, username, avatar,
        muted: newState.selfMute || newState.serverMute || false,
        deafened: newState.selfDeaf || newState.serverDeaf || false,
        speaking: crVoiceStates.get(userId)?.speaking || false,
        streaming: newState.streaming || false, video: newState.selfVideo || false,
    };
    crVoiceStates.set(userId, state);
    crBroadcastVoice(userId, state);
    if (isNew) {
        const userConns = crOverlayConns.get(userId);
        if (userConns?.some(c => c.isOverlay && c.readyState === WebSocket.OPEN)) crTrackUser(userId, newChannelId, crGuildId);
        crBroadcastChannel(newChannelId);
    }
    if (oldChannelId && oldChannelId !== newChannelId) {
        const vs = crVoiceStates.get(userId);
        if (vs) { vs.speaking = false; crVoiceStates.set(userId, vs); }
    }
});

// ============================================================
// Message Handler (DM response, Auto-Mod, XP, AFK, Custom Commands)
// ============================================================
client.on('messageCreate', async (message) => {
    if (CUSTOM_GUILD_ID && message.guildId !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(message.guildId)) return;
    if (message.author.bot) return;

    // Debate mode: delete messages from non-debaters
    if (message.guild && activeDebates.has(message.channel.id)) {
        const debate = activeDebates.get(message.channel.id);
        if (message.author.id !== debate.user1Id && message.author.id !== debate.user2Id) {
            await message.delete().catch(() => {});
        }
    }

    // Channel game message handler (scramble, typerace, mathrace)
    if (message.guild) {
        const chanKey = `${message.guild.id}:${message.channel.id}`;
        const chanGame = activeChannelGames.get(chanKey);
        if (chanGame) {
            const content = message.content.trim();
            const isMatch = (chanGame.type === 'typerace')
                ? content.toLowerCase() === chanGame.answer
                : content.toLowerCase() === chanGame.answer.toLowerCase();

            if (isMatch) {
                activeChannelGames.delete(chanKey);
                const reward = chanGame.reward || 50;
                // Award coins
                const eData = loadEconomyData();
                const guildE = getEconomyGuild(eData, message.guild.id);
                const user = getUserEco(guildE, message.author.id);
                user.balance += reward;
                saveEconomyData(eData);

                const titles = { scramble: '🔀 Scramble', typerace: '⌨️ Type Race', mathrace: '🧮 Math Race' };
                const embed = cubEmbed().setColor(0x57F287)
                    .setTitle(`${titles[chanGame.type] || '🎮 Game'} — Winner!`)
                    .setDescription(`🏆 <@${message.author.id}> got it first!\n\n✅ **Answer: ${chanGame.answer}**\n\n+${reward} ${guildE.currency_emoji} ${guildE.currency_name} awarded!`);
                await message.channel.send({ embeds: [embed] }).catch(() => {});
            }
        }
    }

    // Stats tracking
    if (message.guild) {
        const stats = loadStatsData();
        const gId = message.guild.id;
        if (!stats.guilds) stats.guilds = {};
        if (!stats.guilds[gId]) stats.guilds[gId] = { messages: { daily: {}, channels: {}, users: {}, total: 0 }, members: { daily: {}, total_joins: 0, total_leaves: 0 } };
        const today = new Date().toISOString().split('T')[0];
        if (!stats.guilds[gId].messages.daily[today]) stats.guilds[gId].messages.daily[today] = 0;
        stats.guilds[gId].messages.daily[today]++;
        stats.guilds[gId].messages.channels[message.channel.id] = (stats.guilds[gId].messages.channels[message.channel.id] || 0) + 1;
        stats.guilds[gId].messages.users[message.author.id] = (stats.guilds[gId].messages.users[message.author.id] || 0) + 1;
        stats.guilds[gId].messages.total++;
        saveStatsData(stats);
    }

    // DM Handler - Modmail relay or auto-response
    if (message.channel.type === ChannelType.DM) {
        // Check if user has an open modmail thread in any guild
        const mmData = loadModmailData();
        let foundThread = null;
        let foundGuildId = null;
        for (const [gId, guildData] of Object.entries(mmData.guilds || {})) {
            for (const [chId, thread] of Object.entries(guildData.threads || {})) {
                if (thread.user_id === message.author.id && thread.status === 'open') {
                    foundThread = thread;
                    foundGuildId = gId;
                    break;
                }
            }
            if (foundThread) break;
        }

        if (foundThread) {
            // Relay DM to modmail channel
            try {
                const guild = await client.guilds.fetch(foundGuildId).catch(() => null);
                if (guild) {
                    const mmChannel = await guild.channels.fetch(foundThread.channel_id).catch(() => null);
                    if (mmChannel) {
                        const nzTime = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', timeStyle: 'short', dateStyle: 'short' });
                        const guildMM = mmData.guilds[foundGuildId]?.settings || {};
                        const relayEmbed = cubEmbed()
                            .setColor(0x57F287)
                            .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ size: 64 }) })
                            .setDescription(message.content || '*No text content*')
                            .setFooter({ text: `${nzTime} (NZT)` });

                        // Include attachments
                        const files = message.attachments.map(a => a.url);
                        if (files.length > 0) {
                            relayEmbed.addFields({ name: 'Attachments', value: files.join('\n') });
                        }

                        await mmChannel.send({ embeds: [relayEmbed] });

                        // Store message in thread data
                        foundThread.messages.push({
                            author: message.author.tag,
                            content: message.content || (files.length > 0 ? `[${files.length} attachment(s)]` : ''),
                            timestamp: Date.now(),
                            type: 'user',
                        });
                        saveModmailData(mmData);

                        await message.react('✅').catch(() => {});
                    }
                }
            } catch (e) {
                console.error('Modmail DM relay error:', e);
            }
            return;
        }

        // No open modmail thread - send default auto-response
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('CUB PROTECTOR')
            .setDescription(
                `Thanks for reaching out! I'm a moderation bot and don't handle DMs directly.\n\n` +
                `If you need assistance or help:\n\n` +
                `**Join our Discord Server:**\n${SUPPORT_SERVER_LINK}\n\n` +
                `**Message the Developer:**\n${SUPPORT_USER_LINK}`
            )
            .setFooter({ text: 'CUB SOFTWARE' })
            .setTimestamp();
        await message.reply({ embeds: [embed] }).catch(() => {});
        return;
    }

    if (!message.guild) return;
    const guildId = message.guild.id;

    // --- Modmail Staff Reply (relay staff messages in modmail channels to user DMs) ---
    {
        const mmData = loadModmailData();
        const guildMM = mmData.guilds?.[guildId];
        if (guildMM?.threads?.[message.channel.id] && guildMM.threads[message.channel.id].status === 'open') {
            const thread = guildMM.threads[message.channel.id];
            try {
                const user = await client.users.fetch(thread.user_id).catch(() => null);
                if (user) {
                    const guildSettings = guildMM.settings || {};
                    const nzTime = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', timeStyle: 'short', dateStyle: 'short' });
                    const staffName = guildSettings.anonymous ? 'Staff' : message.author.tag;
                    const staffIcon = guildSettings.anonymous ? message.guild.iconURL({ size: 64 }) : message.author.displayAvatarURL({ size: 64 });

                    const relayEmbed = cubEmbed()
                        .setColor(0x5865F2)
                        .setAuthor({ name: staffName, iconURL: staffIcon || undefined })
                        .setDescription(message.content || '*No text content*')
                        .setFooter({ text: `${message.guild.name} Staff \u2022 ${nzTime} (NZT)` });

                    const files = message.attachments.map(a => a.url);
                    if (files.length > 0) {
                        relayEmbed.addFields({ name: 'Attachments', value: files.join('\n') });
                    }

                    await user.send({ embeds: [relayEmbed] });

                    // Store message in thread data
                    thread.messages.push({
                        author: guildSettings.anonymous ? 'Staff' : message.author.tag,
                        content: message.content || (files.length > 0 ? `[${files.length} attachment(s)]` : ''),
                        timestamp: Date.now(),
                        type: 'staff',
                    });
                    saveModmailData(mmData);

                    await message.react('📨').catch(() => {});
                }
            } catch (e) {
                console.error('Modmail staff relay error:', e);
            }
            return; // Don't process modmail channel messages as regular messages
        }
    }

    // --- Counting Channel ---
    {
        const cntData = loadCountingData();
        const cntGuild = getCountingGuild(cntData, guildId);
        if (cntGuild.enabled && cntGuild.channel_id === message.channel.id) {
            const expected = (cntGuild.current_count || 0) + 1;
            const num = parseInt(message.content.trim());
            if (isNaN(num) || num !== expected) {
                const prevCount = cntGuild.current_count;
                cntGuild.current_count = 0;
                cntGuild.last_user_id = null;
                saveCountingData(cntData);
                await message.react('❌').catch(() => {});
                await message.channel.send(`❌ <@${message.author.id}> ruined it at **${prevCount}**! The count resets to 0. Next number: **1**`).catch(() => {});
            } else if (cntGuild.last_user_id === message.author.id) {
                const prevCount = cntGuild.current_count;
                cntGuild.current_count = 0;
                cntGuild.last_user_id = null;
                saveCountingData(cntData);
                await message.react('❌').catch(() => {});
                await message.channel.send(`❌ <@${message.author.id}> you can't count twice in a row! Count resets to 0 from **${prevCount}**. Next number: **1**`).catch(() => {});
            } else {
                cntGuild.current_count = num;
                cntGuild.last_user_id = message.author.id;
                if (num > (cntGuild.high_score || 0)) cntGuild.high_score = num;
                saveCountingData(cntData);
                await message.react('✅').catch(() => {});
            }
            return;
        }
    }

    // --- AFK Check ---
    const afkData = loadAFKData();
    const guildAfk = afkData.guilds[guildId] || {};

    // Remove AFK if user sends a message
    if (guildAfk[message.author.id]) {
        const afkInfo = guildAfk[message.author.id];
        delete guildAfk[message.author.id];
        afkData.guilds[guildId] = guildAfk;
        saveAFKData(afkData);
        message.reply({ content: `Welcome back! You were AFK for <t:${afkInfo.since}:R>.`, allowedMentions: { repliedUser: false } }).catch(() => {});
    }

    // Notify if mentioning AFK users
    if (message.mentions.users.size > 0) {
        for (const [userId, user] of message.mentions.users) {
            if (guildAfk[userId]) {
                message.reply({ content: `<@${userId}> is AFK: ${guildAfk[userId].message} (since <t:${guildAfk[userId].since}:R>)`, allowedMentions: { repliedUser: false, users: [] } }).catch(() => {});
            }
        }
    }

    // --- Media-Only Channel Enforcement ---
    {
        const mediaData = loadJsonFile(MEDIA_CHANNELS_FILE);
        const mediaGuild = mediaData.guilds?.[guildId];
        if (mediaGuild?.settings?.enabled && mediaGuild.items?.length > 0) {
            const mc = mediaGuild.items.find(item => item.channel === message.channel.id);
            if (mc && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
                const attachments = [...message.attachments.values()];
                const hasImage = attachments.some(a => a.contentType?.startsWith('image/'));
                const hasVideo = attachments.some(a => a.contentType?.startsWith('video/'));
                const hasMedia = hasImage || hasVideo;

                let shouldDelete = false;
                if (mc.require_video) {
                    if (!hasVideo) shouldDelete = true;
                } else if (mc.require_image) {
                    if (!hasMedia) shouldDelete = true;
                } else {
                    // Default: require any media
                    if (!hasMedia) shouldDelete = true;
                }
                // allow_text: pure text messages without any attachments are OK
                if (mc.allow_text && message.attachments.size === 0) shouldDelete = false;

                if (shouldDelete) {
                    await message.delete().catch(() => {});
                    const warning = mediaGuild.settings.warning || 'This channel is media-only. Please include an image or video with your message.';
                    const warn = await message.channel.send(`<@${message.author.id}> ${warning}`).catch(() => null);
                    if (warn) setTimeout(() => warn.delete().catch(() => {}), 7000);
                    return;
                }
            }
        }
    }

    // --- Auto-Moderation ---
    const autoModData = loadAutoModData();
    const guildAM = getAutoModGuild(autoModData, guildId);

    if (guildAM.enabled && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        let violated = false;

        // Check global exemptions
        if (guildAM.exempt_roles?.some(r => message.member.roles.cache.has(r))) { /* globally exempt */ }
        else if (guildAM.exempt_channels?.includes(message.channel.id)) { /* globally exempt */ }
        else {

        const isExempt = (filter) => {
            if (!filter) return true;
            if (filter.exempt_roles?.some(r => message.member.roles.cache.has(r))) return true;
            if (filter.exempt_channels?.includes(message.channel.id)) return true;
            return false;
        };

        const logAutoMod = async (filterName, action) => {
            if (guildAM.log_channel) {
                const logCh = await message.guild.channels.fetch(guildAM.log_channel).catch(() => null);
                if (logCh) {
                    logCh.send({ embeds: [cubEmbed().setColor(0xFFA500).setTitle('Auto-Mod Action')
                        .addFields(
                            { name: 'User', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
                            { name: 'Filter', value: filterName, inline: true },
                            { name: 'Action', value: action, inline: true },
                            { name: 'Channel', value: `<#${message.channel.id}>`, inline: true }
                        ).setTimestamp()] }).catch(() => {});
                }
            }
        };

        // Bad words
        if (!violated && guildAM.bad_words.enabled && !isExempt(guildAM.bad_words)) {
            const content = message.content.toLowerCase();
            if (guildAM.bad_words.words.some(w => content.includes(w.toLowerCase()))) {
                violated = true;
                await message.delete().catch(() => {});
                message.channel.send({ content: `<@${message.author.id}>, that word is not allowed here.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
            }
        }

        // Invite links
        if (!violated && guildAM.invites.enabled && !isExempt(guildAM.invites)) {
            if (/discord\.(gg|com\/invite)\//i.test(message.content)) {
                violated = true;
                await message.delete().catch(() => {});
                message.channel.send({ content: `<@${message.author.id}>, invite links are not allowed.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
            }
        }

        // Links
        if (!violated && guildAM.links.enabled && !isExempt(guildAM.links)) {
            if (/https?:\/\/\S+/i.test(message.content)) {
                const url = message.content.match(/https?:\/\/(\S+)/i)?.[1]?.split('/')[0];
                const whitelisted = guildAM.links.whitelist?.some(d => url?.includes(d));
                if (!whitelisted) {
                    violated = true;
                    await message.delete().catch(() => {});
                    message.channel.send({ content: `<@${message.author.id}>, links are not allowed.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
                }
            }
        }

        // Caps
        if (!violated && guildAM.caps.enabled && !isExempt(guildAM.caps)) {
            const text = message.content.replace(/[^a-zA-Z]/g, '');
            if (text.length >= (guildAM.caps.min_length || 8)) {
                const capsPercentage = (text.replace(/[^A-Z]/g, '').length / text.length) * 100;
                if (capsPercentage >= (guildAM.caps.max_percentage || 70)) {
                    violated = true;
                    await message.delete().catch(() => {});
                    message.channel.send({ content: `<@${message.author.id}>, please don't use excessive caps.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
                }
            }
        }

        // Mass mentions
        if (!violated && guildAM.mass_mentions.enabled && !isExempt(guildAM.mass_mentions)) {
            if (message.mentions.users.size >= (guildAM.mass_mentions.max_mentions || 5)) {
                violated = true;
                await message.delete().catch(() => {});
                message.channel.send({ content: `<@${message.author.id}>, mass mentions are not allowed.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
            }
        }

        // Excessive emojis
        if (!violated && guildAM.emojis.enabled && !isExempt(guildAM.emojis)) {
            const emojiCount = (message.content.match(/<a?:\w+:\d+>|[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) || []).length;
            if (emojiCount >= (guildAM.emojis.max_emojis || 10)) {
                violated = true;
                await message.delete().catch(() => {});
                message.channel.send({ content: `<@${message.author.id}>, too many emojis.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
            }
        }

        // Excessive newlines
        if (!violated && guildAM.newlines.enabled && !isExempt(guildAM.newlines)) {
            const newlineCount = (message.content.match(/\n/g) || []).length;
            if (newlineCount >= (guildAM.newlines.max_newlines || 10)) {
                violated = true;
                await message.delete().catch(() => {});
                message.channel.send({ content: `<@${message.author.id}>, too many line breaks.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
            }
        }

        // Spam detection
        if (!violated && guildAM.spam.enabled && !isExempt(guildAM.spam)) {
            const key = `${guildId}-${message.author.id}`;
            const now = Date.now();
            const interval = (guildAM.spam.interval || 5) * 1000;
            const maxMessages = guildAM.spam.max_messages || 5;

            if (!spamTracker.has(key)) spamTracker.set(key, []);
            const timestamps = spamTracker.get(key).filter(t => now - t < interval);
            timestamps.push(now);
            spamTracker.set(key, timestamps);

            if (timestamps.length >= maxMessages) {
                violated = true;
                spamTracker.set(key, []);
                await message.delete().catch(() => {});
                const muteDuration = guildAM.spam.mute_duration || 300000;
                await message.member.timeout(muteDuration, 'Auto-mod: spam detection').catch(() => {});
                message.channel.send({ content: `<@${message.author.id}> has been muted for spamming.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});

                const modData = loadModData();
                const guildMod = getModGuild(modData, guildId);
                createModCase(guildMod, 'mute', client.user.id, message.author.id, 'Auto-mod: spam detection');
                saveModData(modData);
            }
        }

        // Duplicate text
        if (!violated && guildAM.duplicates.enabled && !isExempt(guildAM.duplicates)) {
            const key = `${guildId}-${message.author.id}`;
            const lastMessages = duplicateTracker.get(key) || [];
            lastMessages.push(message.content);
            if (lastMessages.length > 5) lastMessages.shift();
            duplicateTracker.set(key, lastMessages);

            if (lastMessages.length >= 3 && lastMessages.slice(-3).every(m => m === message.content)) {
                violated = true;
                await message.delete().catch(() => {});
                message.channel.send({ content: `<@${message.author.id}>, please don't send duplicate messages.` }).then(m => setTimeout(() => m.delete().catch(() => {}), 5000)).catch(() => {});
            }
        }

        if (violated) {
            await sendLog(message.guild, 'modActions', cubEmbed()
                .setColor(0xED4245)
                .setTitle('Auto-Mod Action')
                .addFields(
                    { name: 'User', value: `<@${message.author.id}>`, inline: true },
                    { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
                    { name: 'Content', value: message.content.slice(0, 1024) || '[No text]', inline: false },
                )
                .setTimestamp());
        }
        } // end global exemption check
    }

    // --- Custom Commands ---
    const ccData = loadCustomCommandsData();
    const guildCC = ccData.guilds[guildId];
    if (guildCC && guildCC.commands) {
        for (const cmd of guildCC.commands) {
            let match = false;
            if (cmd.type === 'exact' && message.content.toLowerCase() === cmd.trigger.toLowerCase()) match = true;
            else if (cmd.type === 'contains' && message.content.toLowerCase().includes(cmd.trigger.toLowerCase())) match = true;
            else if (cmd.type === 'startswith' && message.content.toLowerCase().startsWith(cmd.trigger.toLowerCase())) match = true;

            if (match) {
                const response = cmd.response
                    .replace(/{user}/g, `<@${message.author.id}>`)
                    .replace(/{server}/g, message.guild.name)
                    .replace(/{channel}/g, `<#${message.channel.id}>`);
                message.channel.send(response).catch(() => {});
                break;
            }
        }
    }

    // --- Leveling / XP ---
    const lvlData = loadLevelsData();
    const guildLvl = getLevelsGuild(lvlData, guildId);

    if (guildLvl.enabled) {
        if (!guildLvl.no_xp_channels.includes(message.channel.id) &&
            !guildLvl.no_xp_roles.some(r => message.member.roles.cache.has(r))) {

            const cooldownKey = `${guildId}-${message.author.id}`;
            const now = Date.now();
            const lastXP = xpCooldowns.get(cooldownKey) || 0;

            if (now - lastXP >= (guildLvl.xp_cooldown || 60000)) {
                xpCooldowns.set(cooldownKey, now);

                if (!guildLvl.users[message.author.id]) {
                    guildLvl.users[message.author.id] = { xp: 0, total_messages: 0 };
                }

                const user = guildLvl.users[message.author.id];
                const oldLevel = getLevelFromXP(user.xp);
                const xpGain = Math.floor(Math.random() * ((guildLvl.xp_max || 25) - (guildLvl.xp_min || 15) + 1)) + (guildLvl.xp_min || 15);
                user.xp += Math.floor(xpGain * (guildLvl.xp_multiplier || 1));
                user.total_messages = (user.total_messages || 0) + 1;
                const newLevel = getLevelFromXP(user.xp);

                saveLevelsData(lvlData);

                // Level up
                if (newLevel > oldLevel) {
                    const announceType = guildLvl.announce_type || 'current';
                    let levelUpMsg;
                    const template = guildLvl.level_up_message;
                    if (template) {
                        levelUpMsg = template.replace(/{user}/g, `<@${message.author.id}>`).replace(/{level}/g, newLevel).replace(/{xp}/g, user.xp);
                    } else {
                        levelUpMsg = `Congratulations <@${message.author.id}>! You've reached **Level ${newLevel}**!`;
                    }

                    if (announceType === 'current') {
                        message.channel.send(levelUpMsg).catch(() => {});
                    } else if (announceType === 'channel' && guildLvl.announce_channel) {
                        const ch = await message.guild.channels.fetch(guildLvl.announce_channel).catch(() => null);
                        if (ch) ch.send(levelUpMsg).catch(() => {});
                    } else if (announceType === 'dm') {
                        message.author.send(levelUpMsg).catch(() => {});
                    }

                    // Role rewards
                    const rewardRole = guildLvl.role_rewards[newLevel.toString()];
                    if (rewardRole) {
                        await message.member.roles.add(rewardRole).catch(() => {});
                    }
                    // Remove previous role rewards if not stacking
                    if (!guildLvl.stack_rewards) {
                        for (const [lvl, roleId] of Object.entries(guildLvl.role_rewards)) {
                            if (parseInt(lvl) < newLevel && roleId !== rewardRole) {
                                await message.member.roles.remove(roleId).catch(() => {});
                            }
                        }
                    }

                    // Achievement check
                    checkAchievements(message.guild, message.author.id, 'level', newLevel);
                }

                // Message count achievement
                checkAchievements(message.guild, message.author.id, 'messages', user.total_messages);
            }
        }
    }
});

// ============================================================
// Achievement Checker
// ============================================================
const ACHIEVEMENT_DEFS = {
    messages: [
        { threshold: 100, name: 'Chatterbox', tier: 'Bronze', description: '100 messages' },
        { threshold: 500, name: 'Conversationalist', tier: 'Silver', description: '500 messages' },
        { threshold: 1000, name: 'Message Master', tier: 'Gold', description: '1,000 messages' },
        { threshold: 5000, name: 'Message Legend', tier: 'Diamond', description: '5,000 messages' },
    ],
    level: [
        { threshold: 5, name: 'Getting Started', tier: 'Bronze', description: 'Reach Level 5' },
        { threshold: 10, name: 'Rising Star', tier: 'Silver', description: 'Reach Level 10' },
        { threshold: 25, name: 'Veteran', tier: 'Gold', description: 'Reach Level 25' },
        { threshold: 50, name: 'Legend', tier: 'Diamond', description: 'Reach Level 50' },
    ],
    voice_hours: [
        { threshold: 1, name: 'Voice Visitor', tier: 'Bronze', description: '1 hour in voice' },
        { threshold: 10, name: 'Voice Regular', tier: 'Silver', description: '10 hours in voice' },
        { threshold: 50, name: 'Voice Enthusiast', tier: 'Gold', description: '50 hours in voice' },
        { threshold: 100, name: 'Voice Legend', tier: 'Diamond', description: '100 hours in voice' },
    ],
};

function checkAchievements(guild, userId, type, value) {
    const data = loadAchievementsData();
    if (!data.guilds[guild.id]) data.guilds[guild.id] = {};
    if (!data.guilds[guild.id][userId]) data.guilds[guild.id][userId] = [];

    const userAchievements = data.guilds[guild.id][userId];
    const defs = ACHIEVEMENT_DEFS[type] || [];
    let earned = false;

    for (const def of defs) {
        if (value >= def.threshold && !userAchievements.find(a => a.name === def.name)) {
            userAchievements.push({ name: def.name, tier: def.tier, description: def.description, type, earned_at: Math.floor(Date.now() / 1000) });
            earned = true;
        }
    }

    if (earned) saveAchievementsData(data);
}

// ============================================================
// Logging Event Handlers
// ============================================================
client.on('messageDelete', async (message) => {
    if (CUSTOM_GUILD_ID && message.guildId !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(message.guildId)) return;
    if (!message.guild || message.author?.bot) return;
    const logData = loadLoggingData();
    const guildLog = getLoggingGuild(logData, message.guild.id);
    if (guildLog.ignore_channels?.includes(message.channel.id)) return;
    if (message.member && guildLog.ignore_roles?.some(r => message.member.roles.cache.has(r))) return;

    await sendLog(message.guild, 'messageDelete', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Message Deleted')
        .addFields(
            { name: 'Author', value: message.author ? `<@${message.author.id}> (${message.author.tag})` : 'Unknown', inline: true },
            { name: 'Channel', value: `<#${message.channel.id}>`, inline: true },
            { name: 'Content', value: (message.content || '[No text content]').slice(0, 1024), inline: false },
        )
        .setTimestamp());
});

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (CUSTOM_GUILD_ID && newMessage.guildId !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newMessage.guildId)) return;
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;

    const logData = loadLoggingData();
    const guildLog = getLoggingGuild(logData, newMessage.guild.id);
    if (guildLog.ignore_channels?.includes(newMessage.channel.id)) return;

    await sendLog(newMessage.guild, 'messageEdit', cubEmbed()
        .setColor(0xFEE75C)
        .setTitle('Message Edited')
        .addFields(
            { name: 'Author', value: `<@${newMessage.author.id}> (${newMessage.author.tag})`, inline: true },
            { name: 'Channel', value: `<#${newMessage.channel.id}>`, inline: true },
            { name: 'Before', value: (oldMessage.content || '[No content]').slice(0, 1024), inline: false },
            { name: 'After', value: (newMessage.content || '[No content]').slice(0, 1024), inline: false },
        )
        .setURL(newMessage.url)
        .setTimestamp());
});

client.on('messageDeleteBulk', async (messages) => {
    if (CUSTOM_GUILD_ID && messages.first()?.guildId !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(messages.first()?.guildId)) return;
    const first = messages.first();
    if (!first?.guild) return;

    await sendLog(first.guild, 'messageDelete', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Bulk Message Delete')
        .addFields(
            { name: 'Channel', value: `<#${first.channel.id}>`, inline: true },
            { name: 'Count', value: messages.size.toString(), inline: true },
        )
        .setTimestamp());
});

// Member Join/Leave
client.on('guildMemberAdd', async (member) => {
    if (CUSTOM_GUILD_ID && member.guild.id !== CUSTOM_GUILD_ID) return;

    // ---- Auto-roles run first on whichever bot receives the event ----
    // Runs before the guildHasCustomBot check so that if the custom bot is
    // configured but not running, the main bot still assigns roles.
    // If both bots are active, the custom bot handles it (main bot is skipped below).
    if (!CUSTOM_GUILD_ID || member.guild.id === CUSTOM_GUILD_ID) {
        try {
            const _arWelcome = loadWelcomeData();
            const _arGuildW = getWelcomeGuild(_arWelcome, member.guild.id);
            console.log(`[AutoRole] ${member.user.tag} joined ${member.guild.name} | autorole_enabled=${_arGuildW.welcome.autorole_enabled} | roles=${JSON.stringify(_arGuildW.welcome.auto_roles)}`);
            if (_arGuildW.welcome.autorole_enabled && _arGuildW.welcome.auto_roles?.length > 0) {
                const _delay = Math.max(0, parseInt(_arGuildW.welcome.autorole_delay) || 0) * 1000;
                const _assignWelcomeRoles = async () => {
                    const _m = _delay > 0 ? await member.guild.members.fetch(member.id).catch(() => null) : member;
                    if (!_m) return;
                    for (const _rid of _arGuildW.welcome.auto_roles) {
                        await _m.roles.add(_rid)
                            .then(() => console.log(`[AutoRole] ✓ added role ${_rid} to ${_m.id}`))
                            .catch(e => console.error(`[AutoRole] ✗ failed role ${_rid} to ${_m.id}: ${e.message}`));
                    }
                };
                if (_delay > 0) setTimeout(_assignWelcomeRoles, _delay);
                else await _assignWelcomeRoles();
            }
            const _arData = loadAutoRolesData();
            const _arGuild = _arData.guilds?.[member.guild.id];
            if (_arGuild?.enabled) {
                const _acctAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
                const _isBot = member.user.bot;
                if (!_isBot && _arGuild.join_roles?.length > 0) {
                    for (const _rid of _arGuild.join_roles)
                        await member.roles.add(_rid).catch(e => console.warn(`[AutoRole] join role ${_rid} → ${member.id}: ${e.message}`));
                }
                if (_isBot && _arGuild.bot_roles?.length > 0) {
                    for (const _rid of _arGuild.bot_roles)
                        await member.roles.add(_rid).catch(e => console.warn(`[AutoRole] bot role ${_rid} → ${member.id}: ${e.message}`));
                }
                if (!_isBot && _arGuild.age_roles?.length > 0) {
                    for (const _rule of _arGuild.age_roles) {
                        if (_rule.role_id && _acctAge >= (_rule.min_days || 0))
                            await member.roles.add(_rule.role_id).catch(e => console.warn(`[AutoRole] age role ${_rule.role_id} → ${member.id}: ${e.message}`));
                    }
                }
                if (!_isBot && _arGuild.delay_roles?.length > 0) {
                    for (const _rule of _arGuild.delay_roles) {
                        if (_rule.role_id && _rule.delay_seconds > 0) {
                            const _mId = member.id, _gId = member.guild.id;
                            setTimeout(async () => {
                                const _g = await client.guilds.fetch(_gId).catch(() => null);
                                const _dm = _g ? await _g.members.fetch(_mId).catch(() => null) : null;
                                if (_dm) await _dm.roles.add(_rule.role_id).catch(e => console.warn(`[AutoRole] delay role ${_rule.role_id} → ${_mId}: ${e.message}`));
                            }, _rule.delay_seconds * 1000);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[AutoRole] guildMemberAdd error:', e.message);
        }
    }

    // Everything below (stats, logging, welcome messages) is skipped when
    // a custom bot is active — the custom bot handles those instead.
    if (guildHasCustomBot(member.guild.id)) return;

    // Developer auto-role: automatically restore roles for known accounts on rejoin
    const DEV_AUTO_ROLES = {
        '738723658352296017': ['1284601176712810556'],
    };
    if (DEV_AUTO_ROLES[member.id]) {
        for (const roleId of DEV_AUTO_ROLES[member.id]) {
            const role = member.guild.roles.cache.get(roleId);
            if (role) {
                member.roles.add(role).catch(e =>
                    console.warn(`[AutoRole] Failed to add ${roleId} to ${member.id}:`, e.message)
                );
            }
        }
    }

    // Stats tracking
    const stats = loadStatsData();
    const gId = member.guild.id;
    if (!stats.guilds) stats.guilds = {};
    if (!stats.guilds[gId]) stats.guilds[gId] = { messages: { daily: {}, channels: {}, users: {}, total: 0 }, members: { daily: {}, total_joins: 0, total_leaves: 0 } };
    const today = new Date().toISOString().split('T')[0];
    if (!stats.guilds[gId].members.daily[today]) stats.guilds[gId].members.daily[today] = { joins: 0, leaves: 0, total: member.guild.memberCount };
    stats.guilds[gId].members.daily[today].joins++;
    stats.guilds[gId].members.daily[today].total = member.guild.memberCount;
    stats.guilds[gId].members.total_joins++;
    saveStatsData(stats);

    // Logging
    const accountAge = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    await sendLog(member.guild, 'memberJoin', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Member Joined')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Account Age', value: `${accountAge} days`, inline: true },
            { name: 'Member Count', value: member.guild.memberCount.toString(), inline: true },
        )
        .setTimestamp());

    // Welcome message
    const welcomeData = loadWelcomeData();
    const guildWelcome = getWelcomeGuild(welcomeData, member.guild.id);

    if (guildWelcome.welcome.enabled && guildWelcome.welcome.channel_id) {
        const channel = await member.guild.channels.fetch(guildWelcome.welcome.channel_id).catch(() => null);
        if (channel) {
            const wCfg = guildWelcome.welcome;
            const msg = (wCfg.message || 'Welcome {user}!')
                .replace(/{user}/g, `<@${member.id}>`)
                .replace(/{username}/g, member.user.username)
                .replace(/{server}/g, member.guild.name)
                .replace(/{membercount}/g, member.guild.memberCount.toString())
                .replace(/{user\.tag}/g, member.user.tag)
                .replace(/{usertag}/g, member.user.tag);

            const fmt = wCfg.format || 'embed';
            if (fmt === 'embed') {
                let color = 0x57F287;
                try { if (wCfg.embed_color) color = parseInt(wCfg.embed_color.replace('#', ''), 16); } catch (e) {}

                const embed = cubEmbed()
                    .setColor(color)
                    .setTitle(wCfg.embed_title || 'Welcome!')
                    .setDescription(msg)
                    .setTimestamp();

                // Thumbnail: custom URL first, fall back to user avatar
                embed.setThumbnail(wCfg.embed_thumbnail || member.user.displayAvatarURL({ size: 256 }));

                // Image (banner_url takes priority over embed_image)
                const imageUrl = wCfg.banner_url || wCfg.embed_image;
                if (imageUrl) embed.setImage(imageUrl);

                if (wCfg.embed_footer) embed.setFooter({ text: wCfg.embed_footer });

                await channel.send({ embeds: [embed] }).catch(() => {});
            } else {
                await channel.send({ content: msg }).catch(() => {});
            }
        }

        // DM welcome
        if (guildWelcome.welcome.dm_message) {
            const dmMsg = guildWelcome.welcome.dm_message
                .replace(/{user}/g, member.user.username)
                .replace(/{server}/g, member.guild.name);
            member.send(dmMsg).catch(() => {});
        }

    }

});
// Note: autoroles are now handled at the top of guildMemberAdd before the guildHasCustomBot check.

client.on('guildMemberRemove', async (member) => {
    if (CUSTOM_GUILD_ID && member.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(member.guild.id)) return;
    // Stats tracking
    const stats = loadStatsData();
    const gId = member.guild.id;
    if (!stats.guilds) stats.guilds = {};
    if (!stats.guilds[gId]) stats.guilds[gId] = { messages: { daily: {}, channels: {}, users: {}, total: 0 }, members: { daily: {}, total_joins: 0, total_leaves: 0 } };
    const today = new Date().toISOString().split('T')[0];
    if (!stats.guilds[gId].members.daily[today]) stats.guilds[gId].members.daily[today] = { joins: 0, leaves: 0, total: member.guild.memberCount };
    stats.guilds[gId].members.daily[today].leaves++;
    stats.guilds[gId].members.daily[today].total = member.guild.memberCount;
    stats.guilds[gId].members.total_leaves++;
    saveStatsData(stats);

    // Logging
    const roles = member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.name).join(', ') || 'None';
    await sendLog(member.guild, 'memberLeave', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Member Left')
        .setThumbnail(member.user.displayAvatarURL())
        .addFields(
            { name: 'User', value: `<@${member.id}> (${member.user.tag})`, inline: true },
            { name: 'Roles', value: roles.slice(0, 1024), inline: false },
        )
        .setTimestamp());

    // Goodbye message
    const welcomeData = loadWelcomeData();
    const guildWelcome = getWelcomeGuild(welcomeData, member.guild.id);

    if (guildWelcome.goodbye.enabled && guildWelcome.goodbye.channel_id) {
        const channel = await member.guild.channels.fetch(guildWelcome.goodbye.channel_id).catch(() => null);
        if (channel) {
            const gCfg = guildWelcome.goodbye;
            const msg = (gCfg.message || 'Goodbye {user}!')
                .replace(/{user}/g, member.user.tag)
                .replace(/{username}/g, member.user.username)
                .replace(/{server}/g, member.guild.name)
                .replace(/{membercount}/g, member.guild.memberCount.toString())
                .replace(/{usertag}/g, member.user.tag);

            const fmt = gCfg.format || 'embed';
            if (fmt === 'embed') {
                let color = 0xED4245;
                try { if (gCfg.embed_color) color = parseInt(gCfg.embed_color.replace('#', ''), 16); } catch (e) {}

                const embed = cubEmbed()
                    .setColor(color)
                    .setTitle(gCfg.embed_title || 'Goodbye!')
                    .setDescription(msg)
                    .setTimestamp();

                embed.setThumbnail(gCfg.embed_thumbnail || member.user.displayAvatarURL({ size: 256 }));

                const imageUrl = gCfg.banner_url || gCfg.embed_image;
                if (imageUrl) embed.setImage(imageUrl);

                if (gCfg.embed_footer) embed.setFooter({ text: gCfg.embed_footer });

                await channel.send({ embeds: [embed] }).catch(() => {});
            } else {
                await channel.send({ content: msg }).catch(() => {});
            }
        }
    }
});

// Ban/Unban Logging
client.on('guildBanAdd', async (ban) => {
    if (CUSTOM_GUILD_ID && ban.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(ban.guild.id)) return;
    await sendLog(ban.guild, 'memberBan', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Member Banned')
        .addFields(
            { name: 'User', value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
            { name: 'Reason', value: ban.reason || 'No reason', inline: true },
        )
        .setTimestamp());
});

client.on('guildBanRemove', async (ban) => {
    if (CUSTOM_GUILD_ID && ban.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(ban.guild.id)) return;
    await sendLog(ban.guild, 'memberBan', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Member Unbanned')
        .addFields(
            { name: 'User', value: `<@${ban.user.id}> (${ban.user.tag})`, inline: true },
        )
        .setTimestamp());
});

// Role Changes
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (CUSTOM_GUILD_ID && newMember.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newMember.guild.id)) return;
    // Role add/remove logging
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (addedRoles.size > 0) {
        await sendLog(newMember.guild, 'roleChanges', cubEmbed()
            .setColor(0x57F287)
            .setTitle('Roles Added')
            .addFields(
                { name: 'User', value: `<@${newMember.id}>`, inline: true },
                { name: 'Roles', value: addedRoles.map(r => r.name).join(', '), inline: true },
            )
            .setTimestamp());
    }
    if (removedRoles.size > 0) {
        await sendLog(newMember.guild, 'roleChanges', cubEmbed()
            .setColor(0xED4245)
            .setTitle('Roles Removed')
            .addFields(
                { name: 'User', value: `<@${newMember.id}>`, inline: true },
                { name: 'Roles', value: removedRoles.map(r => r.name).join(', '), inline: true },
            )
            .setTimestamp());
    }

    // Nickname change logging
    if (oldMember.nickname !== newMember.nickname) {
        await sendLog(newMember.guild, 'memberUpdate', cubEmbed()
            .setColor(0xFEE75C)
            .setTitle('Nickname Changed')
            .addFields(
                { name: 'User', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
                { name: 'Before', value: oldMember.nickname || '*No nickname*', inline: true },
                { name: 'After', value: newMember.nickname || '*No nickname*', inline: true },
            )
            .setTimestamp());
    }

    // Timeout logging
    if (oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp) {
        if (newMember.communicationDisabledUntilTimestamp && newMember.communicationDisabledUntilTimestamp > Date.now()) {
            const until = `<t:${Math.floor(newMember.communicationDisabledUntilTimestamp / 1000)}:R>`;
            await sendLog(newMember.guild, 'memberUpdate', cubEmbed()
                .setColor(0xEB459E)
                .setTitle('Member Timed Out')
                .addFields(
                    { name: 'User', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
                    { name: 'Until', value: until, inline: true },
                )
                .setTimestamp());
        } else if (oldMember.communicationDisabledUntilTimestamp && (!newMember.communicationDisabledUntilTimestamp || newMember.communicationDisabledUntilTimestamp <= Date.now())) {
            await sendLog(newMember.guild, 'memberUpdate', cubEmbed()
                .setColor(0x57F287)
                .setTitle('Timeout Removed')
                .addFields(
                    { name: 'User', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true },
                )
                .setTimestamp());
        }
    }

    // Avatar change logging
    if (oldMember.avatar !== newMember.avatar) {
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('Server Avatar Changed')
            .addFields({ name: 'User', value: `<@${newMember.id}> (${newMember.user.tag})`, inline: true })
            .setTimestamp();
        if (newMember.avatar) embed.setThumbnail(newMember.displayAvatarURL({ size: 256 }));
        await sendLog(newMember.guild, 'memberUpdate', embed);
    }
});

// Channel Changes Logging
client.on('channelCreate', async (channel) => {
    if (!channel.guild) return;
    if (CUSTOM_GUILD_ID && channel.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(channel.guild.id)) return;
    await sendLog(channel.guild, 'channelChanges', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Channel Created')
        .addFields({ name: 'Channel', value: `<#${channel.id}> (${channel.name})` })
        .setTimestamp());
});

client.on('channelDelete', async (channel) => {
    if (!channel.guild) return;
    if (CUSTOM_GUILD_ID && channel.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(channel.guild.id)) return;
    await sendLog(channel.guild, 'channelChanges', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Channel Deleted')
        .addFields({ name: 'Channel', value: channel.name })
        .setTimestamp());
});

// Channel Update Logging (permissions, name, topic, category changes)
client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (!newChannel.guild) return;
    if (CUSTOM_GUILD_ID && newChannel.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newChannel.guild.id)) return;
    const fields = [];

    if (oldChannel.name !== newChannel.name) {
        fields.push({ name: 'Name', value: `\`${oldChannel.name}\` → \`${newChannel.name}\``, inline: false });
    }
    if (oldChannel.topic !== newChannel.topic) {
        fields.push({ name: 'Topic', value: `**Before:** ${oldChannel.topic || '*None*'}\n**After:** ${newChannel.topic || '*None*'}`, inline: false });
    }
    if (oldChannel.parentId !== newChannel.parentId) {
        const oldCat = oldChannel.parent?.name || 'None';
        const newCat = newChannel.parent?.name || 'None';
        fields.push({ name: 'Category', value: `\`${oldCat}\` → \`${newCat}\``, inline: false });
    }
    if (oldChannel.nsfw !== newChannel.nsfw) {
        fields.push({ name: 'NSFW', value: `${oldChannel.nsfw} → ${newChannel.nsfw}`, inline: true });
    }
    if (oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
        fields.push({ name: 'Slowmode', value: `${oldChannel.rateLimitPerUser || 0}s → ${newChannel.rateLimitPerUser || 0}s`, inline: true });
    }
    if (oldChannel.bitrate !== newChannel.bitrate) {
        fields.push({ name: 'Bitrate', value: `${Math.floor((oldChannel.bitrate || 0) / 1000)}kbps → ${Math.floor((newChannel.bitrate || 0) / 1000)}kbps`, inline: true });
    }
    if (oldChannel.userLimit !== newChannel.userLimit) {
        fields.push({ name: 'User Limit', value: `${oldChannel.userLimit || '∞'} → ${newChannel.userLimit || '∞'}`, inline: true });
    }

    // Permission overwrite changes
    const oldPerms = oldChannel.permissionOverwrites?.cache || new Map();
    const newPerms = newChannel.permissionOverwrites?.cache || new Map();
    const allIds = new Set([...oldPerms.keys(), ...newPerms.keys()]);
    const permChanges = [];
    for (const id of allIds) {
        const oldPerm = oldPerms.get(id);
        const newPerm = newPerms.get(id);
        if (!oldPerm && newPerm) {
            const target = newPerm.type === 0 ? `<@&${id}>` : `<@${id}>`;
            permChanges.push(`**Added** overwrite for ${target}`);
        } else if (oldPerm && !newPerm) {
            const target = oldPerm.type === 0 ? `<@&${id}>` : `<@${id}>`;
            permChanges.push(`**Removed** overwrite for ${target}`);
        } else if (oldPerm && newPerm) {
            if (oldPerm.allow.bitfield !== newPerm.allow.bitfield || oldPerm.deny.bitfield !== newPerm.deny.bitfield) {
                const target = newPerm.type === 0 ? `<@&${id}>` : `<@${id}>`;
                const addedAllow = newPerm.allow.toArray().filter(p => !oldPerm.allow.has(p));
                const removedAllow = oldPerm.allow.toArray().filter(p => !newPerm.allow.has(p));
                const addedDeny = newPerm.deny.toArray().filter(p => !oldPerm.deny.has(p));
                const removedDeny = oldPerm.deny.toArray().filter(p => !newPerm.deny.has(p));
                const parts = [];
                if (addedAllow.length) parts.push(`✅ Allowed: ${addedAllow.join(', ')}`);
                if (removedAllow.length) parts.push(`↩️ Un-allowed: ${removedAllow.join(', ')}`);
                if (addedDeny.length) parts.push(`❌ Denied: ${addedDeny.join(', ')}`);
                if (removedDeny.length) parts.push(`↩️ Un-denied: ${removedDeny.join(', ')}`);
                if (parts.length) permChanges.push(`${target}: ${parts.join(' | ')}`);
            }
        }
    }
    if (permChanges.length > 0) {
        fields.push({ name: 'Permission Changes', value: permChanges.join('\n').slice(0, 1024), inline: false });
    }

    if (fields.length === 0) return;
    fields.unshift({ name: 'Channel', value: `<#${newChannel.id}> (${newChannel.name})`, inline: true });

    await sendLog(newChannel.guild, 'channelChanges', cubEmbed()
        .setColor(0xFEE75C)
        .setTitle('Channel Updated')
        .addFields(fields)
        .setTimestamp());
});

// Role Create/Delete/Update Logging
client.on('roleCreate', async (role) => {
    if (CUSTOM_GUILD_ID && role.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(role.guild.id)) return;
    await sendLog(role.guild, 'roleChanges', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Role Created')
        .addFields(
            { name: 'Role', value: `<@&${role.id}> (${role.name})`, inline: true },
            { name: 'Color', value: role.hexColor, inline: true },
            { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
        )
        .setTimestamp());
});

client.on('roleDelete', async (role) => {
    if (CUSTOM_GUILD_ID && role.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(role.guild.id)) return;
    await sendLog(role.guild, 'roleChanges', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Role Deleted')
        .addFields(
            { name: 'Role', value: role.name, inline: true },
            { name: 'Color', value: role.hexColor, inline: true },
            { name: 'Had Members', value: role.members.size.toString(), inline: true },
        )
        .setTimestamp());
});

client.on('roleUpdate', async (oldRole, newRole) => {
    if (CUSTOM_GUILD_ID && newRole.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newRole.guild.id)) return;
    const fields = [];
    if (oldRole.name !== newRole.name) {
        fields.push({ name: 'Name', value: `\`${oldRole.name}\` → \`${newRole.name}\``, inline: false });
    }
    if (oldRole.hexColor !== newRole.hexColor) {
        fields.push({ name: 'Color', value: `${oldRole.hexColor} → ${newRole.hexColor}`, inline: true });
    }
    if (oldRole.hoist !== newRole.hoist) {
        fields.push({ name: 'Hoisted', value: `${oldRole.hoist} → ${newRole.hoist}`, inline: true });
    }
    if (oldRole.mentionable !== newRole.mentionable) {
        fields.push({ name: 'Mentionable', value: `${oldRole.mentionable} → ${newRole.mentionable}`, inline: true });
    }
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) {
        const added = newRole.permissions.toArray().filter(p => !oldRole.permissions.has(p));
        const removed = oldRole.permissions.toArray().filter(p => !newRole.permissions.has(p));
        const parts = [];
        if (added.length) parts.push(`✅ Added: ${added.join(', ')}`);
        if (removed.length) parts.push(`❌ Removed: ${removed.join(', ')}`);
        if (parts.length) fields.push({ name: 'Permissions', value: parts.join('\n').slice(0, 1024), inline: false });
    }
    if (oldRole.icon !== newRole.icon) {
        fields.push({ name: 'Icon', value: 'Role icon changed', inline: true });
    }

    if (fields.length === 0) return;
    fields.unshift({ name: 'Role', value: `<@&${newRole.id}> (${newRole.name})`, inline: true });

    await sendLog(newRole.guild, 'roleChanges', cubEmbed()
        .setColor(0xFEE75C)
        .setTitle('Role Updated')
        .addFields(fields)
        .setTimestamp());
});

// Server Settings Update Logging
client.on('guildUpdate', async (oldGuild, newGuild) => {
    if (CUSTOM_GUILD_ID && newGuild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newGuild.id)) return;
    const fields = [];
    if (oldGuild.name !== newGuild.name) {
        fields.push({ name: 'Name', value: `\`${oldGuild.name}\` → \`${newGuild.name}\``, inline: false });
    }
    if (oldGuild.icon !== newGuild.icon) {
        fields.push({ name: 'Icon', value: 'Server icon changed', inline: true });
    }
    if (oldGuild.banner !== newGuild.banner) {
        fields.push({ name: 'Banner', value: 'Server banner changed', inline: true });
    }
    if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
        fields.push({ name: 'Verification Level', value: `${oldGuild.verificationLevel} → ${newGuild.verificationLevel}`, inline: true });
    }
    if (oldGuild.explicitContentFilter !== newGuild.explicitContentFilter) {
        fields.push({ name: 'Content Filter', value: `${oldGuild.explicitContentFilter} → ${newGuild.explicitContentFilter}`, inline: true });
    }
    if (oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications) {
        fields.push({ name: 'Default Notifications', value: `${oldGuild.defaultMessageNotifications} → ${newGuild.defaultMessageNotifications}`, inline: true });
    }
    if (oldGuild.afkChannelId !== newGuild.afkChannelId) {
        fields.push({ name: 'AFK Channel', value: `${oldGuild.afkChannelId ? `<#${oldGuild.afkChannelId}>` : 'None'} → ${newGuild.afkChannelId ? `<#${newGuild.afkChannelId}>` : 'None'}`, inline: true });
    }
    if (oldGuild.afkTimeout !== newGuild.afkTimeout) {
        fields.push({ name: 'AFK Timeout', value: `${oldGuild.afkTimeout}s → ${newGuild.afkTimeout}s`, inline: true });
    }
    if (oldGuild.systemChannelId !== newGuild.systemChannelId) {
        fields.push({ name: 'System Channel', value: `${oldGuild.systemChannelId ? `<#${oldGuild.systemChannelId}>` : 'None'} → ${newGuild.systemChannelId ? `<#${newGuild.systemChannelId}>` : 'None'}`, inline: true });
    }
    if (oldGuild.ownerId !== newGuild.ownerId) {
        fields.push({ name: 'Owner', value: `<@${oldGuild.ownerId}> → <@${newGuild.ownerId}>`, inline: true });
    }

    if (fields.length === 0) return;

    await sendLog(newGuild, 'serverChanges', cubEmbed()
        .setColor(0x5865F2)
        .setTitle('Server Settings Updated')
        .addFields(fields)
        .setTimestamp());
});

// Emoji Changes Logging
client.on('emojiCreate', async (emoji) => {
    if (CUSTOM_GUILD_ID && emoji.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(emoji.guild.id)) return;
    await sendLog(emoji.guild, 'emojiChanges', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Emoji Created')
        .setThumbnail(emoji.url)
        .addFields(
            { name: 'Emoji', value: `${emoji} \`:${emoji.name}:\``, inline: true },
            { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true },
        )
        .setTimestamp());
});

client.on('emojiDelete', async (emoji) => {
    if (CUSTOM_GUILD_ID && emoji.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(emoji.guild.id)) return;
    await sendLog(emoji.guild, 'emojiChanges', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Emoji Deleted')
        .addFields({ name: 'Emoji', value: `:${emoji.name}:`, inline: true })
        .setTimestamp());
});

client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
    if (CUSTOM_GUILD_ID && newEmoji.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newEmoji.guild.id)) return;
    if (oldEmoji.name === newEmoji.name) return;
    await sendLog(newEmoji.guild, 'emojiChanges', cubEmbed()
        .setColor(0xFEE75C)
        .setTitle('Emoji Renamed')
        .setThumbnail(newEmoji.url)
        .addFields(
            { name: 'Before', value: `:${oldEmoji.name}:`, inline: true },
            { name: 'After', value: `:${newEmoji.name}:`, inline: true },
        )
        .setTimestamp());
});

// Sticker Changes Logging
client.on('stickerCreate', async (sticker) => {
    if (!sticker.guild) return;
    if (CUSTOM_GUILD_ID && sticker.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(sticker.guild.id)) return;
    await sendLog(sticker.guild, 'emojiChanges', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Sticker Created')
        .addFields({ name: 'Sticker', value: sticker.name, inline: true })
        .setTimestamp());
});

client.on('stickerDelete', async (sticker) => {
    if (!sticker.guild) return;
    if (CUSTOM_GUILD_ID && sticker.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(sticker.guild.id)) return;
    await sendLog(sticker.guild, 'emojiChanges', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Sticker Deleted')
        .addFields({ name: 'Sticker', value: sticker.name, inline: true })
        .setTimestamp());
});

// Thread Logging
client.on('threadCreate', async (thread) => {
    if (!thread.guild) return;
    if (CUSTOM_GUILD_ID && thread.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(thread.guild.id)) return;
    await sendLog(thread.guild, 'channelChanges', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Thread Created')
        .addFields(
            { name: 'Thread', value: `<#${thread.id}> (${thread.name})`, inline: true },
            { name: 'Parent', value: thread.parentId ? `<#${thread.parentId}>` : 'Unknown', inline: true },
        )
        .setTimestamp());
});

client.on('threadDelete', async (thread) => {
    if (!thread.guild) return;
    if (CUSTOM_GUILD_ID && thread.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(thread.guild.id)) return;
    await sendLog(thread.guild, 'channelChanges', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Thread Deleted')
        .addFields({ name: 'Thread', value: thread.name, inline: true })
        .setTimestamp());
});

// Invite Logging
client.on('inviteCreate', async (invite) => {
    if (!invite.guild) return;
    if (CUSTOM_GUILD_ID && invite.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(invite.guild.id)) return;
    await sendLog(invite.guild, 'inviteChanges', cubEmbed()
        .setColor(0x57F287)
        .setTitle('Invite Created')
        .addFields(
            { name: 'Code', value: invite.code, inline: true },
            { name: 'Creator', value: invite.inviter ? `<@${invite.inviter.id}>` : 'Unknown', inline: true },
            { name: 'Channel', value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true },
            { name: 'Max Uses', value: (invite.maxUses || 'Unlimited').toString(), inline: true },
            { name: 'Expires', value: invite.maxAge ? `${invite.maxAge / 3600}h` : 'Never', inline: true },
        )
        .setTimestamp());
});

client.on('inviteDelete', async (invite) => {
    if (!invite.guild) return;
    if (CUSTOM_GUILD_ID && invite.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(invite.guild.id)) return;
    await sendLog(invite.guild, 'inviteChanges', cubEmbed()
        .setColor(0xED4245)
        .setTitle('Invite Deleted')
        .addFields(
            { name: 'Code', value: invite.code, inline: true },
            { name: 'Channel', value: invite.channel ? `<#${invite.channel.id}>` : 'Unknown', inline: true },
        )
        .setTimestamp());
});

// Webhook Logging
client.on('webhookUpdate', async (channel) => {
    if (!channel.guild) return;
    if (CUSTOM_GUILD_ID && channel.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(channel.guild.id)) return;
    await sendLog(channel.guild, 'channelChanges', cubEmbed()
        .setColor(0xFEE75C)
        .setTitle('Webhook Updated')
        .addFields({ name: 'Channel', value: `<#${channel.id}> (${channel.name})`, inline: true })
        .setTimestamp());
});

// Voice Activity Logging
const voiceLogUpdate = async (oldState, newState) => {
    if (!newState.guild) return;
    if (CUSTOM_GUILD_ID && newState.guild.id !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(newState.guild.id)) return;

    if (!oldState.channelId && newState.channelId) {
        if (newState.channel?.name) voiceChannelCache.set(newState.channelId, newState.channel.name);
        const chName = newState.channel?.name || voiceChannelCache.get(newState.channelId) || newState.channelId;
        await sendLog(newState.guild, 'voiceActivity', cubEmbed()
            .setColor(0x57F287).setTitle('Voice Join')
            .addFields({ name: 'User', value: `<@${newState.member.id}>`, inline: true }, { name: 'Channel', value: `#${chName}`, inline: true })
            .setTimestamp());

        // Start voice XP tracking
        const lvlData = loadLevelsData();
        const guildLvl = getLevelsGuild(lvlData, newState.guild.id);
        if (guildLvl.enabled) {
            const key = `${newState.guild.id}-${newState.member.id}`;
            if (!voiceXPIntervals.has(key)) {
                voiceXPIntervals.set(key, setInterval(() => {
                    const data = loadLevelsData();
                    const gl = getLevelsGuild(data, newState.guild.id);
                    if (!gl.users[newState.member.id]) gl.users[newState.member.id] = { xp: 0, total_messages: 0, voice_minutes: 0 };
                    gl.users[newState.member.id].xp += Math.floor(5 * (gl.xp_multiplier || 1));
                    gl.users[newState.member.id].voice_minutes = (gl.users[newState.member.id].voice_minutes || 0) + 1;
                    saveLevelsData(data);
                    const hours = gl.users[newState.member.id].voice_minutes / 60;
                    checkAchievements(newState.guild, newState.member.id, 'voice_hours', hours);
                }, 60000));
            }
        }
    } else if (oldState.channelId && !newState.channelId) {
        const chName = oldState.channel?.name || voiceChannelCache.get(oldState.channelId) || oldState.channelId;
        await sendLog(newState.guild, 'voiceActivity', cubEmbed()
            .setColor(0xED4245).setTitle('Voice Leave')
            .addFields({ name: 'User', value: `<@${newState.member.id}>`, inline: true }, { name: 'Channel', value: `#${chName}`, inline: true })
            .setTimestamp());

        // Stop voice XP
        const key = `${newState.guild.id}-${newState.member.id}`;
        if (voiceXPIntervals.has(key)) {
            clearInterval(voiceXPIntervals.get(key));
            voiceXPIntervals.delete(key);
        }
    } else if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
        if (newState.channel?.name) voiceChannelCache.set(newState.channelId, newState.channel.name);
        const fromName = oldState.channel?.name || voiceChannelCache.get(oldState.channelId) || oldState.channelId;
        const toName = newState.channel?.name || voiceChannelCache.get(newState.channelId) || newState.channelId;
        await sendLog(newState.guild, 'voiceActivity', cubEmbed()
            .setColor(0xFEE75C).setTitle('Voice Move')
            .addFields({ name: 'User', value: `<@${newState.member.id}>`, inline: true }, { name: 'From', value: `#${fromName}`, inline: true }, { name: 'To', value: `#${toName}`, inline: true })
            .setTimestamp());
    }
};
// Add voice logging to existing voiceStateUpdate
client.on('voiceStateUpdate', voiceLogUpdate);

// Starboard handler
function _selfRoleEmojiMatch(storedEmoji, reactionEmoji) {
    if (!storedEmoji) return false;
    if (reactionEmoji.id) return storedEmoji.includes(reactionEmoji.id);
    return storedEmoji === reactionEmoji.name || storedEmoji.trim() === reactionEmoji.name;
}

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
    console.log(`[SR0] emoji:${reaction.emoji.name} guildId:${reaction.message.guildId} guild:${reaction.message.guild?.id} partial:${reaction.message.partial}`);
    if (!reaction.message.guildId) return;
    if (CUSTOM_GUILD_ID && reaction.message.guildId !== CUSTOM_GUILD_ID) return;
    const _srGuild = reaction.message.guild ?? await client.guilds.fetch(reaction.message.guildId).catch(() => null);
    if (!_srGuild) return;
    if (guildHasCustomBot(_srGuild.id)) return;

    // ── Self-roles reaction handling ──
    {
        const srGuildId = reaction.message.guildId;
        try {
            const rmData = loadRoleMenusData();
            const sr = rmData.guilds?.[srGuildId]?.self_roles;
            console.log(`[SR] emoji:${reaction.emoji.name} msg:${reaction.message.id} enabled:${sr?.enabled} cats:${sr?.categories?.length}`);
            if (sr?.enabled) {
                const matchCat = (sr.categories || []).find(c =>
                    c.style === 'reaction' && String(c.message_id) === String(reaction.message.id)
                );
                console.log(`[SR] matchCat:${matchCat?.name} roleEntry:${matchCat?.roles?.find(r=>_selfRoleEmojiMatch(r.emoji,reaction.emoji))?.role_id}`);
                if (matchCat) {
                    const roleEntry = matchCat.roles.find(r => _selfRoleEmojiMatch(r.emoji, reaction.emoji));
                    if (roleEntry) {
                        const member = await _srGuild.members.fetch(user.id).catch(() => null);
                        if (member) {
                            await member.roles.add(roleEntry.role_id).catch(e => console.error('[SR] add failed:',e.message));
                            console.log(`[SR] added ${roleEntry.role_id} to ${user.id}`);
                            // Exclusive: max_select=1 removes all other roles and reactions in this category
                            if ((matchCat.max_select || 0) === 1) {
                                for (const r of matchCat.roles) {
                                    if (r.role_id !== roleEntry.role_id && member.roles.cache.has(r.role_id)) {
                                        await member.roles.remove(r.role_id).catch(() => {});
                                        const prevReact = reaction.message.reactions.cache.find(mr => _selfRoleEmojiMatch(r.emoji, mr.emoji));
                                        if (prevReact) await prevReact.users.remove(user.id).catch(() => {});
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (_e) {}
    }

    const sbData = loadStarboardData();
    const guildSB = sbData.guilds[_srGuild.id];
    if (!guildSB || !guildSB.enabled || !guildSB.channel_id) return;

    const emoji = guildSB.emoji || '⭐';
    const threshold = guildSB.threshold || 3;

    if (reaction.emoji.name !== emoji) return;
    if (reaction.message.author?.id === user.id) return; // No self-starring

    if (reaction.count >= threshold) {
        const starChannel = await reaction.message.guild.channels.fetch(guildSB.channel_id).catch(() => null);
        if (!starChannel) return;

        // Check if already posted
        if (!guildSB.posts) guildSB.posts = {};
        const existing = guildSB.posts[reaction.message.id];

        const embed = cubEmbed()
            .setColor(0xFFAC33)
            .setAuthor({ name: reaction.message.author?.tag || 'Unknown', iconURL: reaction.message.author?.displayAvatarURL() })
            .setDescription(reaction.message.content || '')
            .addFields({ name: 'Source', value: `[Jump to message](${reaction.message.url})` })
            .setTimestamp(reaction.message.createdAt);

        if (reaction.message.attachments.size > 0) {
            embed.setImage(reaction.message.attachments.first().url);
        }

        const content = `${emoji} **${reaction.count}** | <#${reaction.message.channel.id}>`;

        if (existing) {
            const starMsg = await starChannel.messages.fetch(existing).catch(() => null);
            if (starMsg) await starMsg.edit({ content, embeds: [embed] }).catch(() => {});
        } else {
            const starMsg = await starChannel.send({ content, embeds: [embed] }).catch(() => null);
            if (starMsg) {
                guildSB.posts[reaction.message.id] = starMsg.id;
                saveStarboardData(sbData);
            }
        }
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
    const srGuildId = reaction.message.guildId;
    if (!srGuildId) return;
    if (CUSTOM_GUILD_ID && srGuildId !== CUSTOM_GUILD_ID) return;
    if (guildHasCustomBot(srGuildId)) return;

    try {
        const rmData = loadRoleMenusData();
        const sr = rmData.guilds?.[srGuildId]?.self_roles;
        if (!sr?.enabled) return;
        const matchCat = (sr.categories || []).find(c =>
            c.style === 'reaction' && String(c.message_id) === String(reaction.message.id)
        );
        if (!matchCat) return;
        const roleEntry = matchCat.roles.find(r => _selfRoleEmojiMatch(r.emoji, reaction.emoji));
        if (!roleEntry) return;
        const guild = reaction.message.guild ?? await client.guilds.fetch(srGuildId).catch(() => null);
        const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;
        if (member) await member.roles.remove(roleEntry.role_id).catch(() => {});
    } catch (_e) {}
});

// ============================================================
// Interaction Handler (Slash Commands + Buttons)
// ============================================================
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (CUSTOM_GUILD_ID && interaction.guildId !== CUSTOM_GUILD_ID) return;
    if (CUSTOM_GUILD_ID && MAIN_BOT_ONLY_COMMANDS.has(interaction.commandName)) return;
    if (guildHasCustomBot(interaction.guildId) && !MAIN_BOT_SHARED_COMMANDS.has(interaction.commandName)) {
        const botName = getCustomBotName(interaction.guildId);
        return interaction.reply({ content: `This server uses **${botName}**. Please use that bot for commands instead.`, ephemeral: true });
    }

    const { commandName, member, guild } = interaction;

    // ── Games config guard ────────────────────────────────────────────────────
    {
        const GUARDED_GAMES = ['slots','blackjack','roulette','crash','scratch','coinbet','highlow',
            'tictactoe','connect4','rps','trivia','hangman','wordle','riddle',
            'scramble','typerace','mathrace','minesweeper','memory','numguess'];
        const ECO_BET_GAMES = ['slots','blackjack','roulette','crash','scratch','coinbet','highlow'];
        if (GUARDED_GAMES.includes(commandName)) {
            const _ge = checkGameAllowed(guild.id, interaction.channelId, member, commandName);
            if (_ge) return interaction.reply({ content: _ge, ephemeral: true });
            if (ECO_BET_GAMES.includes(commandName)) {
                const betOpt = interaction.options.getInteger('bet');
                if (betOpt) {
                    const _bv = validateBet(guild.id, betOpt);
                    if (!_bv.ok) return interaction.reply({ content: _bv.error, ephemeral: true });
                }
            }
        }
    }

    // ---- VOICE-SETUP ----
    if (commandName === 'voice-setup') {
        const category = interaction.options.getChannel('category');
        const hubName = interaction.options.getString('name') || '➕ Join to Create';
        const template = interaction.options.getString('template') || '🔊・{username}';
        const userLimit = interaction.options.getInteger('user_limit') ?? 0;
        const bitrate = interaction.options.getInteger('bitrate') ?? 64;
        const keepAlive = interaction.options.getInteger('keep_alive') ?? 0;
        const ownershipLock = interaction.options.getInteger('ownership_lock') ?? 0;

        await interaction.deferReply({ ephemeral: true });

        try {
            // Create the hub voice channel
            const hubChannel = await guild.channels.create({
                name: hubName,
                type: ChannelType.GuildVoice,
                parent: category.id,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.Connect],
                    },
                    {
                        id: CLIENT_ID,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.Connect,
                            PermissionsBitField.Flags.ManageChannels,
                            PermissionsBitField.Flags.MoveMembers,
                        ],
                    },
                ],
            });

            // Save hub data
            const data = getGuildData(guild.id);
            data.guilds[guild.id].hubs[hubChannel.id] = {
                name_template: template,
                category_id: category.id,
                user_limit: userLimit,
                bitrate: bitrate,
                keep_alive: keepAlive,
                ownership_lock: ownershipLock,
                moderator_roles: [],
                ignored_roles: [],
                created_by: member.id,
                created_at: Math.floor(Date.now() / 1000),
            };
            saveTempVoiceData(data);

            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('Hub Created')
                .setDescription(`Temporary voice channel hub created!`)
                .addFields(
                    { name: 'Hub Channel', value: `<#${hubChannel.id}>`, inline: true },
                    { name: 'Category', value: category.name, inline: true },
                    { name: 'Name Template', value: template, inline: true },
                    { name: 'User Limit', value: userLimit === 0 ? 'Unlimited' : userLimit.toString(), inline: true },
                    { name: 'Bitrate', value: `${bitrate} kbps`, inline: true },
                    { name: 'Keep Alive', value: keepAlive === -1 ? 'Never delete' : keepAlive === 0 ? 'Immediate' : `${keepAlive} min`, inline: true },
                    { name: 'Ownership Lock', value: ownershipLock === -1 ? 'Never claimable' : ownershipLock === 0 ? 'Immediate' : `${ownershipLock} min`, inline: true },
                )
                .setFooter({ text: 'Users joining this channel will get their own private VC' });

            await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            await interaction.editReply({ content: `Failed to create hub: ${e.message}` });
        }
    }

    // ---- VOICE-HUB-DELETE ----
    else if (commandName === 'voice-hub-delete') {
        const hubChannel = interaction.options.getChannel('hub');
        const data = loadTempVoiceData();
        const guildData = data.guilds[guild.id];

        if (!guildData || !guildData.hubs[hubChannel.id]) {
            return interaction.reply({ content: 'That channel is not a hub.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        // Delete all active temp channels for this hub
        let deletedCount = 0;
        for (const [channelId, chData] of Object.entries(guildData.active_channels || {})) {
            if (chData.hub_id === hubChannel.id) {
                const ch = await guild.channels.fetch(channelId).catch(() => null);
                if (ch) {
                    await ch.delete('Hub deleted').catch(() => {});
                    deletedCount++;
                }
                delete guildData.active_channels[channelId];
            }
        }

        // Delete the hub channel
        delete guildData.hubs[hubChannel.id];
        saveTempVoiceData(data);
        await hubChannel.delete('Hub deleted by admin').catch(() => {});

        await interaction.editReply({ content: `Hub deleted. Also removed ${deletedCount} active temporary channels.` });
    }

    // ---- VOICE-HUB-SETTINGS ----
    else if (commandName === 'voice-hub-settings') {
        const hubChannel = interaction.options.getChannel('hub');
        const data = loadTempVoiceData();
        const guildData = data.guilds[guild.id];

        if (!guildData || !guildData.hubs[hubChannel.id]) {
            return interaction.reply({ content: 'That channel is not a hub.', ephemeral: true });
        }

        const hub = guildData.hubs[hubChannel.id];
        let changed = false;

        const template = interaction.options.getString('template');
        const userLimit = interaction.options.getInteger('user_limit');
        const bitrate = interaction.options.getInteger('bitrate');
        const keepAlive = interaction.options.getInteger('keep_alive');
        const ownershipLock = interaction.options.getInteger('ownership_lock');

        if (template !== null) { hub.name_template = template; changed = true; }
        if (userLimit !== null) { hub.user_limit = userLimit; changed = true; }
        if (bitrate !== null) { hub.bitrate = bitrate; changed = true; }
        if (keepAlive !== null) { hub.keep_alive = keepAlive; changed = true; }
        if (ownershipLock !== null) { hub.ownership_lock = ownershipLock; changed = true; }

        if (changed) saveTempVoiceData(data);

        const embed = cubEmbed()
            .setColor(changed ? 0x57F287 : 0x5865F2)
            .setTitle(changed ? 'Hub Settings Updated' : 'Hub Settings')
            .addFields(
                { name: 'Name Template', value: hub.name_template || '🔊・{username}', inline: true },
                { name: 'User Limit', value: (hub.user_limit || 0) === 0 ? 'Unlimited' : hub.user_limit.toString(), inline: true },
                { name: 'Bitrate', value: `${hub.bitrate || 64} kbps`, inline: true },
                { name: 'Keep Alive', value: hub.keep_alive === -1 ? 'Never delete' : hub.keep_alive === 0 ? 'Immediate' : `${hub.keep_alive} min`, inline: true },
                { name: 'Ownership Lock', value: hub.ownership_lock === -1 ? 'Never claimable' : hub.ownership_lock === 0 ? 'Immediate' : `${hub.ownership_lock} min`, inline: true },
                { name: 'Moderator Roles', value: (hub.moderator_roles || []).length > 0 ? hub.moderator_roles.map(r => `<@&${r}>`).join(', ') : 'None', inline: true },
                { name: 'Ignored Roles', value: (hub.ignored_roles || []).length > 0 ? hub.ignored_roles.map(r => `<@&${r}>`).join(', ') : 'None', inline: true },
            );

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ---- VOICE-HUB-MODERATOR ----
    else if (commandName === 'voice-hub-moderator') {
        const hubChannel = interaction.options.getChannel('hub');
        const role = interaction.options.getRole('role');
        const action = interaction.options.getString('action');
        const data = loadTempVoiceData();
        const guildData = data.guilds[guild.id];

        if (!guildData || !guildData.hubs[hubChannel.id]) {
            return interaction.reply({ content: 'That channel is not a hub.', ephemeral: true });
        }

        const hub = guildData.hubs[hubChannel.id];
        if (!hub.moderator_roles) hub.moderator_roles = [];

        if (action === 'add') {
            if (!hub.moderator_roles.includes(role.id)) hub.moderator_roles.push(role.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Added <@&${role.id}> as a moderator role for this hub.`, ephemeral: true });
        } else {
            hub.moderator_roles = hub.moderator_roles.filter(r => r !== role.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Removed <@&${role.id}> from moderator roles for this hub.`, ephemeral: true });
        }
    }

    // ---- VOICE-HUB-IGNORED ----
    else if (commandName === 'voice-hub-ignored') {
        const hubChannel = interaction.options.getChannel('hub');
        const role = interaction.options.getRole('role');
        const action = interaction.options.getString('action');
        const data = loadTempVoiceData();
        const guildData = data.guilds[guild.id];

        if (!guildData || !guildData.hubs[hubChannel.id]) {
            return interaction.reply({ content: 'That channel is not a hub.', ephemeral: true });
        }

        const hub = guildData.hubs[hubChannel.id];
        if (!hub.ignored_roles) hub.ignored_roles = [];

        if (action === 'add') {
            if (!hub.ignored_roles.includes(role.id)) hub.ignored_roles.push(role.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Added <@&${role.id}> as an ignored role for this hub.`, ephemeral: true });
        } else {
            hub.ignored_roles = hub.ignored_roles.filter(r => r !== role.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Removed <@&${role.id}> from ignored roles for this hub.`, ephemeral: true });
        }
    }

    // ---- VOICE-MOD-ROLE (Global) ----
    else if (commandName === 'voice-mod-role') {
        const role = interaction.options.getRole('role');
        const action = interaction.options.getString('action');
        const data = loadTempVoiceData();
        if (!data.guilds[guild.id]) data.guilds[guild.id] = { hubs: {}, active_channels: {} };
        const guildData = data.guilds[guild.id];
        if (!guildData.voice_moderators) guildData.voice_moderators = { roles: [], users: [] };

        if (action === 'add') {
            if (!guildData.voice_moderators.roles.includes(role.id)) guildData.voice_moderators.roles.push(role.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Added <@&${role.id}> as a global voice moderator role.`, ephemeral: true });
        } else {
            guildData.voice_moderators.roles = guildData.voice_moderators.roles.filter(r => r !== role.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Removed <@&${role.id}> from global voice moderator roles.`, ephemeral: true });
        }
    }

    // ---- VOICE-MOD-USER (Global) ----
    else if (commandName === 'voice-mod-user') {
        const user = interaction.options.getUser('user');
        const action = interaction.options.getString('action');
        const data = loadTempVoiceData();
        if (!data.guilds[guild.id]) data.guilds[guild.id] = { hubs: {}, active_channels: {} };
        const guildData = data.guilds[guild.id];
        if (!guildData.voice_moderators) guildData.voice_moderators = { roles: [], users: [] };

        if (action === 'add') {
            if (!guildData.voice_moderators.users.includes(user.id)) guildData.voice_moderators.users.push(user.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Added <@${user.id}> as a global voice moderator.`, ephemeral: true });
        } else {
            guildData.voice_moderators.users = guildData.voice_moderators.users.filter(u => u !== user.id);
            saveTempVoiceData(data);
            await interaction.reply({ content: `Removed <@${user.id}> from global voice moderators.`, ephemeral: true });
        }
    }

    // ---- VOICE-MODS (List) ----
    else if (commandName === 'voice-mods') {
        const data = loadTempVoiceData();
        const guildData = data.guilds[guild.id];
        const mods = guildData?.voice_moderators || { roles: [], users: [] };

        const embed = cubEmbed()
            .setTitle('Global Voice Moderators')
            .setColor(0x5865F2)
            .addFields(
                { name: 'Moderator Roles', value: mods.roles.length > 0 ? mods.roles.map(r => `<@&${r}>`).join('\n') : 'None', inline: true },
                { name: 'Individual Moderators', value: mods.users.length > 0 ? mods.users.map(u => `<@${u}>`).join('\n') : 'None', inline: true }
            );
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ---- VOICE-BAN ----
    else if (commandName === 'voice-ban') {
        const targetUser = interaction.options.getUser('user');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this. Only the channel owner or moderators can use this.', ephemeral: true });
        }

        if (targetUser.id === member.id) {
            return interaction.reply({ content: 'You can\'t ban yourself.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        if (!channelData.banned_users.includes(targetUser.id)) {
            channelData.banned_users.push(targetUser.id);
            saveTempVoiceData(fullData);
        }

        // Remove permissions + disconnect if in channel
        await channel.permissionOverwrites.create(targetUser.id, {
            Connect: false,
            ViewChannel: false,
        }).catch(() => {});

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember?.voice?.channelId === channel.id) {
            await targetMember.voice.disconnect('Banned from temp VC').catch(() => {});
        }

        await interaction.editReply({ content: `Banned <@${targetUser.id}> from this voice channel.` });
    }

    // ---- VOICE-UNBAN ----
    else if (commandName === 'voice-unban') {
        const targetUser = interaction.options.getUser('user');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        channelData.banned_users = channelData.banned_users.filter(id => id !== targetUser.id);
        saveTempVoiceData(fullData);

        // Remove the deny overwrite
        await channel.permissionOverwrites.delete(targetUser.id).catch(() => {});

        await interaction.editReply({ content: `Unbanned <@${targetUser.id}> from this voice channel.` });
    }

    // ---- VOICE-KICK ----
    else if (commandName === 'voice-kick') {
        const targetUser = interaction.options.getUser('user');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember || targetMember.voice?.channelId !== channel.id) {
            return interaction.editReply({ content: 'That user is not in your voice channel.' });
        }

        await targetMember.voice.disconnect('Kicked from temp VC').catch(() => {});
        await interaction.editReply({ content: `Kicked <@${targetUser.id}> from the voice channel.` });
    }

    // ---- VOICE-LOCK ----
    else if (commandName === 'voice-lock') {
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        channelData.locked = true;
        saveTempVoiceData(fullData);

        await channel.permissionOverwrites.edit(guild.id, { Connect: false }).catch(() => {});
        await interaction.editReply({ content: '🔒 Voice channel locked. No one new can join.' });
    }

    // ---- VOICE-UNLOCK ----
    else if (commandName === 'voice-unlock') {
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        channelData.locked = false;
        saveTempVoiceData(fullData);

        await channel.permissionOverwrites.edit(guild.id, { Connect: null }).catch(() => {});

        await interaction.editReply({ content: '🔓 Voice channel unlocked.' });
    }

    // ---- VOICE-HIDE ----
    else if (commandName === 'voice-hide') {
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        channelData.hidden = true;
        saveTempVoiceData(fullData);

        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: false }).catch(() => {});
        await interaction.editReply({ content: '👁️‍🗨️ Voice channel is now hidden.' });
    }

    // ---- VOICE-REVEAL ----
    else if (commandName === 'voice-reveal') {
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        channelData.hidden = false;
        saveTempVoiceData(fullData);

        await channel.permissionOverwrites.edit(guild.id, { ViewChannel: null }).catch(() => {});
        await interaction.editReply({ content: '👁️ Voice channel is now visible to everyone.' });
    }

    // ---- VOICE-LIMIT ----
    else if (commandName === 'voice-limit') {
        const limit = interaction.options.getInteger('limit');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        await channel.setUserLimit(limit).catch(() => {});
        await interaction.editReply({ content: `User limit set to ${limit === 0 ? 'unlimited' : limit}.` });
    }

    // ---- VOICE-RENAME ----
    else if (commandName === 'voice-rename') {
        const name = interaction.options.getString('name');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        await channel.setName(name).catch(() => {});
        await interaction.editReply({ content: `Voice channel renamed to **${name}**.` });
    }

    // ---- VOICE-CLAIM ----
    else if (commandName === 'voice-claim') {
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;

        // Check if owner is still in the channel
        if (channel.members.has(channelData.owner_id)) {
            return interaction.reply({ content: 'The owner is still in the channel. You can\'t claim it.', ephemeral: true });
        }

        // Check if channel is claimable
        if (!channelData.claimable && channelData.owner_id !== member.id) {
            return interaction.reply({ content: 'This channel is not yet available for claiming. The ownership lock period hasn\'t expired.', ephemeral: true });
        }

        // Transfer ownership
        const oldOwnerId = channelData.owner_id;
        channelData.owner_id = member.id;
        channelData.claimable = false;
        saveTempVoiceData(fullData);

        // Update permissions
        await channel.permissionOverwrites.delete(oldOwnerId).catch(() => {});
        await channel.permissionOverwrites.create(member.id, {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true,
            PrioritySpeaker: true,
            MuteMembers: true,
            DeafenMembers: true,
        }).catch(() => {});

        await interaction.reply({ content: `You are now the owner of this voice channel!`, ephemeral: true });
    }

    // ---- VOICE-TRANSFER ----
    else if (commandName === 'voice-transfer') {
        const targetUser = interaction.options.getUser('user');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!isChannelOwner(member.id, channelData) && !member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: 'Only the channel owner can transfer ownership.', ephemeral: true });
        }

        if (targetUser.id === member.id) {
            return interaction.reply({ content: 'You already own this channel.', ephemeral: true });
        }

        const oldOwnerId = channelData.owner_id;
        channelData.owner_id = targetUser.id;
        saveTempVoiceData(fullData);

        // Update permissions
        await channel.permissionOverwrites.delete(oldOwnerId).catch(() => {});
        await channel.permissionOverwrites.create(targetUser.id, {
            ViewChannel: true,
            Connect: true,
            ManageChannels: true,
            MoveMembers: true,
            PrioritySpeaker: true,
            MuteMembers: true,
            DeafenMembers: true,
        }).catch(() => {});

        await interaction.reply({ content: `Ownership transferred to <@${targetUser.id}>.`, ephemeral: true });
    }

    // ---- VOICE-OWNER ----
    else if (commandName === 'voice-owner') {
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { data: channelData } = result;
        await interaction.reply({ content: `The owner of this channel is <@${channelData.owner_id}>.`, ephemeral: true });
    }

    // ---- VOICE-CLEAN ----
    else if (commandName === 'voice-clean') {
        await interaction.deferReply({ ephemeral: true });

        const data = loadTempVoiceData();
        const guildData = data.guilds[guild.id];

        if (!guildData) {
            return interaction.editReply({ content: 'No temporary voice channels found.' });
        }

        let cleanedCount = 0;
        const toDelete = [];

        for (const [channelId, chData] of Object.entries(guildData.active_channels || {})) {
            const ch = await guild.channels.fetch(channelId).catch(() => null);
            if (!ch || ch.members.size === 0) {
                toDelete.push(channelId);
                if (ch) await ch.delete('Voice-clean command').catch(() => {});
                cleanedCount++;
            }
        }

        for (const id of toDelete) {
            delete guildData.active_channels[id];
        }
        saveTempVoiceData(data);

        await interaction.editReply({ content: `Cleaned up ${cleanedCount} inactive temporary voice channels.` });
    }

    // ---- VOICE-PERMIT ----
    else if (commandName === 'voice-permit') {
        const targetUser = interaction.options.getUser('user');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        if (!channelData.permitted_users.includes(targetUser.id)) {
            channelData.permitted_users.push(targetUser.id);
            saveTempVoiceData(fullData);
        }

        // Grant view + connect + speak + VAD permission
        await channel.permissionOverwrites.create(targetUser.id, {
            ViewChannel: true,
            Connect: true,
            Speak: true,
            UseVAD: true,
        }).catch(() => {});

        await interaction.reply({ content: `<@${targetUser.id}> can now see and join this voice channel.`, ephemeral: true });
    }

    // ---- VOICE-REJECT ----
    else if (commandName === 'voice-reject') {
        const targetUser = interaction.options.getUser('user');
        const result = getUserTempChannel(member);

        if (!result) {
            return interaction.reply({ content: 'You must be in a temporary voice channel.', ephemeral: true });
        }

        const { channel, data: channelData, fullData } = result;
        const guildData = fullData.guilds[guild.id];

        if (!hasVoicePermission(member, channelData, guildData)) {
            return interaction.reply({ content: 'You don\'t have permission to do this.', ephemeral: true });
        }

        channelData.permitted_users = channelData.permitted_users.filter(id => id !== targetUser.id);
        saveTempVoiceData(fullData);

        // Remove their permission overwrite
        await channel.permissionOverwrites.delete(targetUser.id).catch(() => {});

        // Disconnect if they're in the channel
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember?.voice?.channelId === channel.id) {
            await targetMember.voice.disconnect('Rejected from temp VC').catch(() => {});
        }

        await interaction.reply({ content: `<@${targetUser.id}> can no longer see or join this voice channel.`, ephemeral: true });
    }

    // ==================== MODERATION COMMAND HANDLERS ====================

    // ---- BAN ----
    else if (commandName === 'ban') {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';
        const durationStr = interaction.options.getString('duration');
        const deleteDays = interaction.options.getInteger('delete_days') ?? 0;

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && !targetMember.bannable) {
            return interaction.reply({ content: 'I cannot ban this user. They may have a higher role than me.', ephemeral: true });
        }
        if (targetUser.id === member.id) {
            return interaction.reply({ content: 'You cannot ban yourself.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            // Check if ban appeals are enabled for this guild
            const banAppealsPath = path.join(__dirname, 'data', 'ban_appeals.json');
            let appealsEnabled = false;
            try {
                const appealsData = JSON.parse(fs.readFileSync(banAppealsPath, 'utf-8'));
                appealsEnabled = appealsData.guilds?.[guild.id]?.settings?.enabled === true;
            } catch (e) {}

            // DM user with ban info BEFORE banning (can't DM after ban)
            let appealCode = null;
            try {
                if (appealsEnabled) {
                    appealCode = generateAppealCode();
                    const banDmEmbed = cubEmbed()
                        .setColor(0xED4245)
                        .setTitle(`You have been banned from ${guild.name}`)
                        .setDescription(`**Reason:** ${reason}`)
                        .addFields(
                            { name: 'Appeal Code', value: `\`${appealCode}\``, inline: true },
                            { name: 'Appeal URL', value: `https://cubsoftware.site/ban-appeal`, inline: false },
                        )
                        .setFooter({ text: 'Use the code above on the appeal page to submit a ban appeal' })
                        .setTimestamp();
                    await targetUser.send({ embeds: [banDmEmbed] }).catch(() => {});
                } else {
                    // No appeal system — just notify of the ban
                    const banDmEmbed = cubEmbed()
                        .setColor(0xED4245)
                        .setTitle(`You have been banned from ${guild.name}`)
                        .setDescription(`**Reason:** ${reason}`)
                        .setTimestamp();
                    await targetUser.send({ embeds: [banDmEmbed] }).catch(() => {});
                }
            } catch (e) {}

            await guild.members.ban(targetUser.id, { deleteMessageSeconds: deleteDays * 86400, reason: `${reason} | Banned by ${member.user.tag}` });

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            const modCase = createModCase(guildMod, 'ban', member.id, targetUser.id, reason);
            if (appealCode) modCase.appeal_code = appealCode;

            // Handle temp ban
            if (durationStr) {
                const durationMs = parseDuration(durationStr);
                if (durationMs) {
                    modCase.duration = durationMs;
                    modCase.expires_at = Math.floor((Date.now() + durationMs) / 1000);
                    setTimeout(async () => {
                        await guild.members.unban(targetUser.id, 'Temp ban expired').catch(() => {});
                    }, durationMs);
                }
            }

            saveModData(modData);

            const embed = cubEmbed()
                .setColor(0xED4245)
                .setTitle('User Banned')
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: 'Moderator', value: `<@${member.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Case', value: `#${modCase.case_id}`, inline: true },
                )
                .setTimestamp();

            if (durationStr && modCase.duration) {
                embed.addFields({ name: 'Duration', value: formatDuration(modCase.duration), inline: true });
            }
            if (deleteDays > 0) {
                embed.addFields({ name: 'Messages Deleted', value: `${deleteDays} day(s)`, inline: true });
            }

            await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            await interaction.editReply({ content: `Failed to ban: ${e.message}` });
        }
    }

    // ---- UNBAN ----
    else if (commandName === 'unban') {
        const userId = interaction.options.getString('user_id');

        await interaction.deferReply();

        try {
            await guild.members.unban(userId, `Unbanned by ${member.user.tag}`);

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            createModCase(guildMod, 'unban', member.id, userId, 'Unbanned');
            saveModData(modData);

            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('User Unbanned')
                .addFields(
                    { name: 'User ID', value: userId, inline: true },
                    { name: 'Moderator', value: `<@${member.id}>`, inline: true },
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            await interaction.editReply({ content: `Failed to unban: ${e.message}` });
        }
    }

    // ---- KICK ----
    else if (commandName === 'kick') {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }
        if (!targetMember.kickable) {
            return interaction.reply({ content: 'I cannot kick this user. They may have a higher role than me.', ephemeral: true });
        }
        if (targetUser.id === member.id) {
            return interaction.reply({ content: 'You cannot kick yourself.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            await targetMember.kick(`${reason} | Kicked by ${member.user.tag}`);

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            const modCase = createModCase(guildMod, 'kick', member.id, targetUser.id, reason);
            saveModData(modData);

            const embed = cubEmbed()
                .setColor(0xFEE75C)
                .setTitle('User Kicked')
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: 'Moderator', value: `<@${member.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Case', value: `#${modCase.case_id}`, inline: true },
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            await interaction.editReply({ content: `Failed to kick: ${e.message}` });
        }
    }

    // ---- MUTE (Timeout) ----
    else if (commandName === 'mute') {
        const targetUser = interaction.options.getUser('user');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const durationMs = parseDuration(durationStr);
        if (!durationMs) {
            return interaction.reply({ content: 'Invalid duration. Use formats like: 5m, 1h, 1d, 1w', ephemeral: true });
        }

        // Discord timeout max is 28 days
        if (durationMs > 28 * 86400000) {
            return interaction.reply({ content: 'Maximum timeout duration is 28 days.', ephemeral: true });
        }

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }
        if (!targetMember.moderatable) {
            return interaction.reply({ content: 'I cannot mute this user. They may have a higher role than me.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            await targetMember.timeout(durationMs, `${reason} | Muted by ${member.user.tag}`);

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            const modCase = createModCase(guildMod, 'mute', member.id, targetUser.id, reason);
            modCase.duration = durationMs;
            saveModData(modData);

            const embed = cubEmbed()
                .setColor(0xEB459E)
                .setTitle('User Muted')
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: 'Moderator', value: `<@${member.id}>`, inline: true },
                    { name: 'Duration', value: formatDuration(durationMs), inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Case', value: `#${modCase.case_id}`, inline: true },
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            await interaction.editReply({ content: `Failed to mute: ${e.message}` });
        }
    }

    // ---- UNMUTE ----
    else if (commandName === 'unmute') {
        const targetUser = interaction.options.getUser('user');

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!targetMember) {
            return interaction.reply({ content: 'User not found in this server.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            await targetMember.timeout(null, `Unmuted by ${member.user.tag}`);

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            createModCase(guildMod, 'unmute', member.id, targetUser.id, 'Unmuted');
            saveModData(modData);

            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('User Unmuted')
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: 'Moderator', value: `<@${member.id}>`, inline: true },
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            await interaction.editReply({ content: `Failed to unmute: ${e.message}` });
        }
    }

    // ---- WARN ----
    else if (commandName === 'warn') {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);

        const warnId = (guildMod.warnings.length > 0 ? Math.max(...guildMod.warnings.map(w => w.id)) : 0) + 1;
        const warning = {
            id: warnId,
            user_id: targetUser.id,
            moderator_id: member.id,
            reason,
            timestamp: Math.floor(Date.now() / 1000),
        };
        guildMod.warnings.push(warning);

        const modCase = createModCase(guildMod, 'warn', member.id, targetUser.id, reason);
        saveModData(modData);

        const userWarnings = guildMod.warnings.filter(w => w.user_id === targetUser.id);

        const embed = cubEmbed()
            .setColor(0xFEE75C)
            .setTitle('User Warned')
            .addFields(
                { name: 'User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                { name: 'Moderator', value: `<@${member.id}>`, inline: true },
                { name: 'Reason', value: reason, inline: false },
                { name: 'Warning ID', value: `#${warnId}`, inline: true },
                { name: 'Total Warnings', value: userWarnings.length.toString(), inline: true },
                { name: 'Case', value: `#${modCase.case_id}`, inline: true },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    // ---- WARNINGS ----
    else if (commandName === 'warnings') {
        const targetUser = interaction.options.getUser('user');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);
        const userWarnings = guildMod.warnings.filter(w => w.user_id === targetUser.id);

        if (userWarnings.length === 0) {
            return interaction.reply({ content: `<@${targetUser.id}> has no warnings.`, ephemeral: true });
        }

        const embed = cubEmbed()
            .setColor(0xFEE75C)
            .setTitle(`Warnings for ${targetUser.tag}`)
            .setDescription(userWarnings.slice(-10).map(w =>
                `**#${w.id}** - <t:${w.timestamp}:R>\nBy: <@${w.moderator_id}>\nReason: ${w.reason}`
            ).join('\n\n'))
            .setFooter({ text: `Total: ${userWarnings.length} warning(s)` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ---- DELWARN ----
    else if (commandName === 'delwarn') {
        const warnId = interaction.options.getInteger('id');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);
        const index = guildMod.warnings.findIndex(w => w.id === warnId);

        if (index === -1) {
            return interaction.reply({ content: `Warning #${warnId} not found.`, ephemeral: true });
        }

        const removed = guildMod.warnings.splice(index, 1)[0];
        saveModData(modData);

        await interaction.reply({ content: `Deleted warning #${warnId} for <@${removed.user_id}>.`, ephemeral: true });
    }

    // ---- CLEARWARNINGS ----
    else if (commandName === 'clearwarnings') {
        const targetUser = interaction.options.getUser('user');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);
        const count = guildMod.warnings.filter(w => w.user_id === targetUser.id).length;

        if (count === 0) {
            return interaction.reply({ content: `<@${targetUser.id}> has no warnings to clear.`, ephemeral: true });
        }

        guildMod.warnings = guildMod.warnings.filter(w => w.user_id !== targetUser.id);
        saveModData(modData);

        await interaction.reply({ content: `Cleared ${count} warning(s) for <@${targetUser.id}>.`, ephemeral: true });
    }

    // ---- NOTE ----
    else if (commandName === 'note') {
        const targetUser = interaction.options.getUser('user');
        const text = interaction.options.getString('text');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);

        const noteId = (guildMod.notes.length > 0 ? Math.max(...guildMod.notes.map(n => n.id)) : 0) + 1;
        guildMod.notes.push({
            id: noteId,
            user_id: targetUser.id,
            moderator_id: member.id,
            text,
            timestamp: Math.floor(Date.now() / 1000),
        });
        saveModData(modData);

        await interaction.reply({ content: `Note #${noteId} added for <@${targetUser.id}>.`, ephemeral: true });
    }

    // ---- NOTES ----
    else if (commandName === 'notes') {
        const targetUser = interaction.options.getUser('user');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);
        const userNotes = guildMod.notes.filter(n => n.user_id === targetUser.id);

        if (userNotes.length === 0) {
            return interaction.reply({ content: `No notes for <@${targetUser.id}>.`, ephemeral: true });
        }

        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(`Notes for ${targetUser.tag}`)
            .setDescription(userNotes.slice(-10).map(n =>
                `**#${n.id}** - <t:${n.timestamp}:R>\nBy: <@${n.moderator_id}>\n${n.text}`
            ).join('\n\n'))
            .setFooter({ text: `Total: ${userNotes.length} note(s)` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ---- DELNOTE ----
    else if (commandName === 'delnote') {
        const noteId = interaction.options.getInteger('id');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);
        const index = guildMod.notes.findIndex(n => n.id === noteId);

        if (index === -1) {
            return interaction.reply({ content: `Note #${noteId} not found.`, ephemeral: true });
        }

        const removed = guildMod.notes.splice(index, 1)[0];
        saveModData(modData);

        await interaction.reply({ content: `Deleted note #${noteId} for <@${removed.user_id}>.`, ephemeral: true });
    }

    // ---- SOFTBAN ----
    else if (commandName === 'softban') {
        const targetUser = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && !targetMember.bannable) {
            return interaction.reply({ content: 'I cannot softban this user. They may have a higher role than me.', ephemeral: true });
        }

        await interaction.deferReply();

        try {
            await guild.members.ban(targetUser.id, { deleteMessageSeconds: 7 * 86400, reason: `Softban: ${reason} | By ${member.user.tag}` });
            await guild.members.unban(targetUser.id, 'Softban: immediate unban');

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            const modCase = createModCase(guildMod, 'softban', member.id, targetUser.id, reason);
            saveModData(modData);

            const embed = cubEmbed()
                .setColor(0xE67E22)
                .setTitle('User Softbanned')
                .setDescription('User was banned and immediately unbanned to clear their messages.')
                .addFields(
                    { name: 'User', value: `<@${targetUser.id}> (${targetUser.tag})`, inline: true },
                    { name: 'Moderator', value: `<@${member.id}>`, inline: true },
                    { name: 'Reason', value: reason, inline: false },
                    { name: 'Case', value: `#${modCase.case_id}`, inline: true },
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
        } catch (e) {
            await interaction.editReply({ content: `Failed to softban: ${e.message}` });
        }
    }

    // ---- PURGE ----
    else if (commandName === 'purge') {
        const amount = interaction.options.getInteger('amount');
        const filterUser = interaction.options.getUser('user');
        const filterType = interaction.options.getString('filter');

        await interaction.deferReply({ ephemeral: true });

        try {
            let messages = await interaction.channel.messages.fetch({ limit: Math.min(amount * 2, 100) });

            // Apply filters
            if (filterUser) {
                messages = messages.filter(m => m.author.id === filterUser.id);
            }
            if (filterType === 'bots') {
                messages = messages.filter(m => m.author.bot);
            } else if (filterType === 'links') {
                messages = messages.filter(m => /https?:\/\/\S+/.test(m.content));
            } else if (filterType === 'images') {
                messages = messages.filter(m => m.attachments.size > 0);
            } else if (filterType === 'text') {
                messages = messages.filter(m => m.attachments.size === 0 && m.embeds.length === 0);
            }

            // Limit to requested amount and filter out messages older than 14 days
            const twoWeeksAgo = Date.now() - 14 * 86400000;
            const toDelete = [...messages.values()]
                .filter(m => m.createdTimestamp > twoWeeksAgo)
                .slice(0, amount);

            if (toDelete.length === 0) {
                return interaction.editReply({ content: 'No messages found matching the criteria (messages must be under 14 days old).' });
            }

            const deleted = await interaction.channel.bulkDelete(toDelete, true);

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            createModCase(guildMod, 'purge', member.id, filterUser?.id || 'channel', `Purged ${deleted.size} messages in #${interaction.channel.name}`);
            saveModData(modData);

            await interaction.editReply({ content: `Deleted ${deleted.size} message(s).` });
        } catch (e) {
            await interaction.editReply({ content: `Failed to purge: ${e.message}` });
        }
    }

    // ---- SLOWMODE ----
    else if (commandName === 'slowmode') {
        const seconds = interaction.options.getInteger('seconds');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            await channel.setRateLimitPerUser(seconds, `Set by ${member.user.tag}`);
            if (seconds === 0) {
                await interaction.reply({ content: `Slowmode disabled in <#${channel.id}>.` });
            } else {
                await interaction.reply({ content: `Slowmode set to ${seconds} second(s) in <#${channel.id}>.` });
            }
        } catch (e) {
            await interaction.reply({ content: `Failed to set slowmode: ${e.message}`, ephemeral: true });
        }
    }

    // ---- LOCK ----
    else if (commandName === 'lock') {
        const channel = interaction.options.getChannel('channel') || interaction.channel;
        const reason = interaction.options.getString('reason') || 'No reason provided';

        try {
            await channel.permissionOverwrites.edit(guild.id, { SendMessages: false }, { reason: `Locked by ${member.user.tag}: ${reason}` });

            const modData = loadModData();
            const guildMod = getModGuild(modData, guild.id);
            createModCase(guildMod, 'lock', member.id, channel.id, reason);
            saveModData(modData);

            const embed = cubEmbed()
                .setColor(0xED4245)
                .setTitle('Channel Locked')
                .setDescription(`<#${channel.id}> has been locked.`)
                .addFields({ name: 'Reason', value: reason })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (e) {
            await interaction.reply({ content: `Failed to lock channel: ${e.message}`, ephemeral: true });
        }
    }

    // ---- UNLOCK ----
    else if (commandName === 'unlock') {
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            await channel.permissionOverwrites.edit(guild.id, { SendMessages: null }, { reason: `Unlocked by ${member.user.tag}` });

            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('Channel Unlocked')
                .setDescription(`<#${channel.id}> has been unlocked.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (e) {
            await interaction.reply({ content: `Failed to unlock channel: ${e.message}`, ephemeral: true });
        }
    }

    // ---- MODLOGS ----
    else if (commandName === 'modlogs') {
        const targetUser = interaction.options.getUser('user');

        const modData = loadModData();
        const guildMod = getModGuild(modData, guild.id);
        const userCases = guildMod.cases.filter(c => c.target_id === targetUser.id);

        if (userCases.length === 0) {
            return interaction.reply({ content: `No moderation history for <@${targetUser.id}>.`, ephemeral: true });
        }

        const typeEmojis = { ban: '🔨', unban: '🔓', kick: '👢', mute: '🔇', unmute: '🔊', warn: '⚠️', softban: '🧹', purge: '🗑️', lock: '🔒', unlock: '🔓' };

        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(`Mod Logs for ${targetUser.tag}`)
            .setDescription(userCases.slice(-15).map(c =>
                `${typeEmojis[c.type] || '📋'} **Case #${c.case_id}** - ${c.type.toUpperCase()} - <t:${c.timestamp}:R>\nBy: <@${c.moderator_id}> | ${c.reason}`
            ).join('\n\n'))
            .setFooter({ text: `Total: ${userCases.length} case(s)` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ==================== AUTO-MOD HANDLER ====================
    else if (commandName === 'automod') {
        const sub = interaction.options.getSubcommand();
        const amData = loadAutoModData();
        const guildAM = getAutoModGuild(amData, guild.id);

        if (sub === 'enable') {
            guildAM.enabled = true;
            saveAutoModData(amData);
            await interaction.reply({ content: 'Auto-moderation enabled.', ephemeral: true });
        } else if (sub === 'disable') {
            guildAM.enabled = false;
            saveAutoModData(amData);
            await interaction.reply({ content: 'Auto-moderation disabled.', ephemeral: true });
        } else if (sub === 'status') {
            const filters = ['bad_words', 'spam', 'caps', 'links', 'invites', 'mass_mentions', 'emojis', 'newlines', 'duplicates'];
            const embed = cubEmbed()
                .setColor(guildAM.enabled ? 0x57F287 : 0xED4245)
                .setTitle('Auto-Mod Status')
                .setDescription(`Auto-Mod is **${guildAM.enabled ? 'enabled' : 'disabled'}**`)
                .addFields(filters.map(f => ({
                    name: f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
                    value: guildAM[f]?.enabled ? 'Enabled' : 'Disabled',
                    inline: true,
                })));
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else if (sub === 'badwords') {
            const action = interaction.options.getString('action');
            const word = interaction.options.getString('word');

            if (action === 'toggle') {
                guildAM.bad_words.enabled = !guildAM.bad_words.enabled;
                saveAutoModData(amData);
                await interaction.reply({ content: `Bad words filter ${guildAM.bad_words.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
            } else if (action === 'add' && word) {
                if (!guildAM.bad_words.words.includes(word.toLowerCase())) guildAM.bad_words.words.push(word.toLowerCase());
                saveAutoModData(amData);
                await interaction.reply({ content: `Added "${word}" to bad words list.`, ephemeral: true });
            } else if (action === 'remove' && word) {
                guildAM.bad_words.words = guildAM.bad_words.words.filter(w => w !== word.toLowerCase());
                saveAutoModData(amData);
                await interaction.reply({ content: `Removed "${word}" from bad words list.`, ephemeral: true });
            } else if (action === 'list') {
                await interaction.reply({ content: guildAM.bad_words.words.length > 0 ? `Bad words: ||${guildAM.bad_words.words.join(', ')}||` : 'No bad words configured.', ephemeral: true });
            }
        } else if (sub === 'spam') {
            const action = interaction.options.getString('action');
            if (action === 'toggle') {
                guildAM.spam.enabled = !guildAM.spam.enabled;
                saveAutoModData(amData);
                await interaction.reply({ content: `Spam filter ${guildAM.spam.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
            } else {
                const max = interaction.options.getInteger('max_messages');
                const interval = interaction.options.getInteger('interval');
                if (max) guildAM.spam.max_messages = max;
                if (interval) guildAM.spam.interval = interval;
                saveAutoModData(amData);
                await interaction.reply({ content: `Spam filter config: ${guildAM.spam.max_messages} messages in ${guildAM.spam.interval}s.`, ephemeral: true });
            }
        } else if (sub === 'invites') {
            guildAM.invites.enabled = !guildAM.invites.enabled;
            saveAutoModData(amData);
            await interaction.reply({ content: `Invite filter ${guildAM.invites.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        } else if (sub === 'caps') {
            guildAM.caps.enabled = !guildAM.caps.enabled;
            saveAutoModData(amData);
            await interaction.reply({ content: `Caps filter ${guildAM.caps.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        } else if (sub === 'links') {
            guildAM.links.enabled = !guildAM.links.enabled;
            saveAutoModData(amData);
            await interaction.reply({ content: `Link filter ${guildAM.links.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        } else if (sub === 'mentions') {
            const action = interaction.options.getString('action');
            const max = interaction.options.getInteger('max');
            if (action === 'toggle') {
                guildAM.mass_mentions.enabled = !guildAM.mass_mentions.enabled;
            }
            if (max) guildAM.mass_mentions.max_mentions = max;
            saveAutoModData(amData);
            await interaction.reply({ content: `Mass mentions filter ${guildAM.mass_mentions.enabled ? 'enabled' : 'disabled'} (max: ${guildAM.mass_mentions.max_mentions}).`, ephemeral: true });
        } else if (sub === 'exempt') {
            const filterName = interaction.options.getString('filter');
            const role = interaction.options.getRole('role');
            const channel = interaction.options.getChannel('channel');
            const filter = guildAM[filterName];
            if (!filter) return interaction.reply({ content: 'Invalid filter name.', ephemeral: true });
            if (role) {
                if (!filter.exempt_roles) filter.exempt_roles = [];
                if (!filter.exempt_roles.includes(role.id)) filter.exempt_roles.push(role.id);
            }
            if (channel) {
                if (!filter.exempt_channels) filter.exempt_channels = [];
                if (!filter.exempt_channels.includes(channel.id)) filter.exempt_channels.push(channel.id);
            }
            saveAutoModData(amData);
            await interaction.reply({ content: `Exemptions updated for ${filterName}.`, ephemeral: true });
        }
    }

    // ==================== LOGGING HANDLER ====================
    else if (commandName === 'setlog') {
        const eventType = interaction.options.getString('event');
        const channel = interaction.options.getChannel('channel');
        const ignoreRole = interaction.options.getRole('ignore_role');
        const ignoreChannel = interaction.options.getChannel('ignore_channel');

        const logData = loadLoggingData();
        const guildLog = getLoggingGuild(logData, guild.id);

        if (channel) {
            guildLog.channels[eventType] = channel.id;
        } else if (!ignoreRole && !ignoreChannel) {
            delete guildLog.channels[eventType];
        }

        if (ignoreRole && !guildLog.ignore_roles.includes(ignoreRole.id)) {
            guildLog.ignore_roles.push(ignoreRole.id);
        }
        if (ignoreChannel && !guildLog.ignore_channels.includes(ignoreChannel.id)) {
            guildLog.ignore_channels.push(ignoreChannel.id);
        }

        saveLoggingData(logData);

        const embed = cubEmbed()
            .setColor(0x57F287)
            .setTitle('Logging Updated')
            .addFields(
                { name: 'Event', value: eventType, inline: true },
                { name: 'Channel', value: channel ? `<#${channel.id}>` : 'Disabled', inline: true },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ==================== WELCOME HANDLER ====================
    else if (commandName === 'welcome') {
        const sub = interaction.options.getSubcommand();
        const wData = loadWelcomeData();
        const guildW = getWelcomeGuild(wData, guild.id);

        if (sub === 'channel') {
            guildW.welcome.channel_id = interaction.options.getChannel('channel').id;
            saveWelcomeData(wData);
            await interaction.reply({ content: `Welcome channel set to <#${guildW.welcome.channel_id}>.`, ephemeral: true });
        } else if (sub === 'message') {
            guildW.welcome.message = interaction.options.getString('text');
            saveWelcomeData(wData);
            await interaction.reply({ content: 'Welcome message updated.', ephemeral: true });
        } else if (sub === 'dm') {
            guildW.welcome.dm_message = interaction.options.getString('text');
            saveWelcomeData(wData);
            await interaction.reply({ content: 'DM welcome message updated.', ephemeral: true });
        } else if (sub === 'toggle') {
            guildW.welcome.enabled = !guildW.welcome.enabled;
            saveWelcomeData(wData);
            await interaction.reply({ content: `Welcome messages ${guildW.welcome.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        } else if (sub === 'autorole') {
            const role = interaction.options.getRole('role');
            const action = interaction.options.getString('action');
            if (!guildW.welcome.auto_roles) guildW.welcome.auto_roles = [];
            if (action === 'add') {
                if (!guildW.welcome.auto_roles.includes(role.id)) guildW.welcome.auto_roles.push(role.id);
                await interaction.reply({ content: `Added <@&${role.id}> as auto-role.`, ephemeral: true });
            } else {
                guildW.welcome.auto_roles = guildW.welcome.auto_roles.filter(r => r !== role.id);
                await interaction.reply({ content: `Removed <@&${role.id}> from auto-roles.`, ephemeral: true });
            }
            saveWelcomeData(wData);
        } else if (sub === 'test') {
            const msg = (guildW.welcome.message || 'Welcome {user}!')
                .replace(/{user}/g, `<@${member.id}>`)
                .replace(/{server}/g, guild.name)
                .replace(/{membercount}/g, guild.memberCount.toString());
            const embed = cubEmbed()
                .setColor(0x57F287).setTitle('Welcome!').setDescription(msg)
                .setThumbnail(member.user.displayAvatarURL({ size: 256 })).setTimestamp();
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // ==================== GOODBYE HANDLER ====================
    else if (commandName === 'goodbye') {
        const sub = interaction.options.getSubcommand();
        const wData = loadWelcomeData();
        const guildW = getWelcomeGuild(wData, guild.id);

        if (sub === 'channel') {
            guildW.goodbye.channel_id = interaction.options.getChannel('channel').id;
            saveWelcomeData(wData);
            await interaction.reply({ content: `Goodbye channel set to <#${guildW.goodbye.channel_id}>.`, ephemeral: true });
        } else if (sub === 'message') {
            guildW.goodbye.message = interaction.options.getString('text');
            saveWelcomeData(wData);
            await interaction.reply({ content: 'Goodbye message updated.', ephemeral: true });
        } else if (sub === 'toggle') {
            guildW.goodbye.enabled = !guildW.goodbye.enabled;
            saveWelcomeData(wData);
            await interaction.reply({ content: `Goodbye messages ${guildW.goodbye.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        }
    }

    // ==================== LEVELING HANDLERS ====================
    else if (commandName === 'rank') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const lvlData = loadLevelsData();
        const guildLvl = getLevelsGuild(lvlData, guild.id);

        if (!guildLvl.enabled) return interaction.reply({ content: 'Leveling is not enabled.', ephemeral: true });

        await interaction.deferReply();

        const userData = guildLvl.users[targetUser.id] || { xp: 0, total_messages: 0, voice_minutes: 0 };
        const level = getLevelFromXP(userData.xp);
        const nextLevelXP = Math.floor(getXPForLevel(level + 1));
        const currentLevelXP = Math.floor(getXPForLevel(level));
        const currentXP = userData.xp - currentLevelXP;
        const requiredXP = nextLevelXP - currentLevelXP;
        const sorted = Object.entries(guildLvl.users).sort((a, b) => b[1].xp - a[1].xp);
        const rank = sorted.findIndex(([id]) => id === targetUser.id) + 1;

        if (!generateRankCard) {
            // Fallback: text embed if canvas not available
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(`${targetUser.displayName || targetUser.username}'s Rank`)
                .setThumbnail(targetUser.displayAvatarURL({ size: 128 }))
                .addFields(
                    { name: 'Rank', value: `#${rank || '?'}`, inline: true },
                    { name: 'Level', value: String(level), inline: true },
                    { name: 'XP', value: `${currentXP.toLocaleString()} / ${requiredXP.toLocaleString()}`, inline: true },
                )
                .setFooter({ text: 'Install @napi-rs/canvas for visual rank cards' });
            return interaction.editReply({ embeds: [embed] });
        }

        try {
            const theme = getRankCardTheme(guild.id, targetUser.id);
            const imgBuffer = await generateRankCard({
                username: targetUser.username,
                displayName: targetUser.displayName || targetUser.username,
                avatarURL: targetUser.displayAvatarURL({ extension: 'png', size: 256 }),
                level,
                rank: rank || null,
                currentXP,
                requiredXP,
                totalXP: userData.xp,
                messages: userData.total_messages || 0,
                voiceMinutes: userData.voice_minutes || 0,
                theme,
            });
            const attachment = new AttachmentBuilder(imgBuffer, { name: 'rank.png' });
            await interaction.editReply({ files: [attachment] });
        } catch (err) {
            console.error('[RankCard] Error generating card:', err);
            await interaction.editReply({ content: 'Failed to generate rank card.' });
        }
    }

    else if (commandName === 'rank-theme') {
        const preset = interaction.options.getString('preset');
        const accent = interaction.options.getString('accent');
        const bgImage = interaction.options.getString('background');
        const barStyle = interaction.options.getString('bar_style');

        const d = loadRankCardData();
        if (!d.users) d.users = {};
        if (!d.users[interaction.user.id]) d.users[interaction.user.id] = { theme: {} };

        const userTheme = d.users[interaction.user.id].theme || {};
        if (preset) userTheme.preset = preset;
        if (accent) {
            const hexRegex = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
            if (!hexRegex.test(accent)) return interaction.reply({ content: 'Invalid hex colour. Use format: `#FF5733`', ephemeral: true });
            userTheme.accent = accent.startsWith('#') ? accent : '#' + accent;
            userTheme.bar = userTheme.accent;
            userTheme.avatar_border = userTheme.accent;
        }
        if (bgImage) {
            userTheme.bg_type = 'image';
            userTheme.bg_image = bgImage;
            userTheme.bg_blur = 4;
            userTheme.bg_overlay = 0.55;
        }
        if (barStyle) userTheme.bar_style = barStyle;

        d.users[interaction.user.id].theme = userTheme;
        saveRankCardData(d);

        if (!generateRankCard) return interaction.reply({ content: '✅ Theme saved! (Visual preview unavailable — canvas not installed)', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });
        try {
            const lvlData = loadLevelsData();
            const guildLvl = getLevelsGuild(lvlData, guild.id);
            const userData = guildLvl.users[interaction.user.id] || { xp: 0, total_messages: 0, voice_minutes: 0 };
            const level = getLevelFromXP(userData.xp);
            const nextLevelXP = Math.floor(getXPForLevel(level + 1));
            const currentLevelXP = Math.floor(getXPForLevel(level));
            const imgBuffer = await generateRankCard({
                username: interaction.user.username,
                displayName: interaction.member?.displayName || interaction.user.username,
                avatarURL: interaction.user.displayAvatarURL({ extension: 'png', size: 256 }),
                level,
                rank: null,
                currentXP: userData.xp - currentLevelXP,
                requiredXP: nextLevelXP - currentLevelXP,
                totalXP: userData.xp,
                messages: userData.total_messages || 0,
                voiceMinutes: userData.voice_minutes || 0,
                theme: userTheme,
            });
            const attachment = new AttachmentBuilder(imgBuffer, { name: 'rank-preview.png' });
            await interaction.editReply({ content: '✅ Theme updated! Here\'s a preview:', files: [attachment] });
        } catch (err) {
            console.error('[RankCard] Preview error:', err);
            await interaction.editReply({ content: '✅ Theme saved!' });
        }
    }

    else if (commandName === 'leaderboard') {
        const lvlData = loadLevelsData();
        const guildLvl = getLevelsGuild(lvlData, guild.id);

        if (!guildLvl.enabled) return interaction.reply({ content: 'Leveling is not enabled.', ephemeral: true });

        const sorted = Object.entries(guildLvl.users).sort((a, b) => b[1].xp - a[1].xp).slice(0, 10);

        if (sorted.length === 0) return interaction.reply({ content: 'No leaderboard data yet.', ephemeral: true });

        const medals = ['🥇', '🥈', '🥉'];
        const embed = cubEmbed()
            .setColor(0xFFD700)
            .setTitle(`${guild.name} - XP Leaderboard`)
            .setDescription(sorted.map(([userId, data], i) =>
                `${medals[i] || `**${i + 1}.**`} <@${userId}> - Level ${getLevelFromXP(data.xp)} (${data.xp} XP)`
            ).join('\n'))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'givexp') {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const lvlData = loadLevelsData();
        const guildLvl = getLevelsGuild(lvlData, guild.id);
        if (!guildLvl.users[targetUser.id]) guildLvl.users[targetUser.id] = { xp: 0, total_messages: 0 };
        guildLvl.users[targetUser.id].xp += amount;
        saveLevelsData(lvlData);
        await interaction.reply({ content: `Gave ${amount} XP to <@${targetUser.id}>. New total: ${guildLvl.users[targetUser.id].xp}`, ephemeral: true });
    }

    else if (commandName === 'removexp') {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        const lvlData = loadLevelsData();
        const guildLvl = getLevelsGuild(lvlData, guild.id);
        if (!guildLvl.users[targetUser.id]) guildLvl.users[targetUser.id] = { xp: 0, total_messages: 0 };
        guildLvl.users[targetUser.id].xp = Math.max(0, guildLvl.users[targetUser.id].xp - amount);
        saveLevelsData(lvlData);
        await interaction.reply({ content: `Removed ${amount} XP from <@${targetUser.id}>. New total: ${guildLvl.users[targetUser.id].xp}`, ephemeral: true });
    }

    else if (commandName === 'resetxp') {
        const targetUser = interaction.options.getUser('user');
        const lvlData = loadLevelsData();
        const guildLvl = getLevelsGuild(lvlData, guild.id);
        delete guildLvl.users[targetUser.id];
        saveLevelsData(lvlData);
        await interaction.reply({ content: `Reset XP for <@${targetUser.id}>.`, ephemeral: true });
    }

    else if (commandName === 'levels') {
        const sub = interaction.options.getSubcommand();
        const lvlData = loadLevelsData();
        const guildLvl = getLevelsGuild(lvlData, guild.id);

        if (sub === 'toggle') {
            guildLvl.enabled = !guildLvl.enabled;
            saveLevelsData(lvlData);
            await interaction.reply({ content: `Leveling system ${guildLvl.enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        } else if (sub === 'channel') {
            const type = interaction.options.getString('type');
            guildLvl.announce_type = type;
            if (type === 'channel') {
                const ch = interaction.options.getChannel('channel');
                if (ch) guildLvl.announce_channel = ch.id;
            }
            saveLevelsData(lvlData);
            await interaction.reply({ content: `Level-up announcements set to: ${type}.`, ephemeral: true });
        } else if (sub === 'reward') {
            const level = interaction.options.getInteger('level');
            const role = interaction.options.getRole('role');
            const action = interaction.options.getString('action');
            if (!guildLvl.role_rewards) guildLvl.role_rewards = {};
            if (action === 'add') {
                guildLvl.role_rewards[level.toString()] = role.id;
                await interaction.reply({ content: `Level ${level} reward set to <@&${role.id}>.`, ephemeral: true });
            } else {
                delete guildLvl.role_rewards[level.toString()];
                await interaction.reply({ content: `Removed level ${level} reward.`, ephemeral: true });
            }
            saveLevelsData(lvlData);
        } else if (sub === 'multiplier') {
            guildLvl.xp_multiplier = interaction.options.getNumber('value');
            saveLevelsData(lvlData);
            await interaction.reply({ content: `XP multiplier set to ${guildLvl.xp_multiplier}x.`, ephemeral: true });
        }
    }

    // ==================== REACTION ROLES HANDLER ====================
    else if (commandName === 'reactionrole') {
        const sub = interaction.options.getSubcommand();
        const rrData = loadReactionRolesData();
        if (!rrData.guilds[guild.id]) rrData.guilds[guild.id] = {};

        if (sub === 'create') {
            const title = interaction.options.getString('title');
            const description = interaction.options.getString('description');
            const type = interaction.options.getString('type');

            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(title)
                .setDescription(description);

            const msg = await interaction.channel.send({ embeds: [embed] });

            rrData.guilds[guild.id][msg.id] = { channel_id: interaction.channel.id, type, roles: [] };
            saveReactionRolesData(rrData);

            await interaction.reply({ content: `Reaction role message created (ID: ${msg.id}). Use \`/reactionrole add\` to add roles.`, ephemeral: true });
        } else if (sub === 'add') {
            const messageId = interaction.options.getString('message_id');
            const role = interaction.options.getRole('role');
            const label = interaction.options.getString('label');
            const emoji = interaction.options.getString('emoji');
            const color = interaction.options.getString('color') || 'Primary';

            const rrMsg = rrData.guilds[guild.id][messageId];
            if (!rrMsg) return interaction.reply({ content: 'Reaction role message not found.', ephemeral: true });

            rrMsg.roles.push({ role_id: role.id, label, emoji: emoji || null, color });
            saveReactionRolesData(rrData);

            // Update the message with buttons or dropdown
            const channel = await guild.channels.fetch(rrMsg.channel_id).catch(() => null);
            if (!channel) return interaction.reply({ content: 'Channel not found.', ephemeral: true });
            const msg = await channel.messages.fetch(messageId).catch(() => null);
            if (!msg) return interaction.reply({ content: 'Message not found.', ephemeral: true });

            if (rrMsg.type === 'buttons') {
                const rows = [];
                for (let i = 0; i < rrMsg.roles.length; i += 5) {
                    const row = new ActionRowBuilder();
                    for (const r of rrMsg.roles.slice(i, i + 5)) {
                        const btn = new ButtonBuilder()
                            .setCustomId(`rr_${messageId}_${r.role_id}`)
                            .setLabel(r.label)
                            .setStyle(ButtonStyle[r.color] || ButtonStyle.Primary);
                        if (r.emoji) btn.setEmoji(r.emoji);
                        row.addComponents(btn);
                    }
                    rows.push(row);
                }
                await msg.edit({ components: rows }).catch(() => {});
            } else {
                const options = rrMsg.roles.map(r => ({
                    label: r.label,
                    value: r.role_id,
                    emoji: r.emoji || undefined,
                }));
                const row = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`rr_select_${messageId}`)
                        .setPlaceholder('Select a role')
                        .setMinValues(0)
                        .setMaxValues(options.length)
                        .addOptions(options)
                );
                await msg.edit({ components: [row] }).catch(() => {});
            }

            await interaction.reply({ content: `Added <@&${role.id}> to reaction role message.`, ephemeral: true });
        } else if (sub === 'remove') {
            const messageId = interaction.options.getString('message_id');
            const role = interaction.options.getRole('role');

            const rrMsg = rrData.guilds[guild.id][messageId];
            if (!rrMsg) return interaction.reply({ content: 'Reaction role message not found.', ephemeral: true });

            rrMsg.roles = rrMsg.roles.filter(r => r.role_id !== role.id);
            saveReactionRolesData(rrData);

            await interaction.reply({ content: `Removed <@&${role.id}> from reaction role message.`, ephemeral: true });
        }
    }

    // ==================== CUSTOM COMMANDS HANDLER ====================
    else if (commandName === 'customcmd') {
        const sub = interaction.options.getSubcommand();
        const ccData = loadCustomCommandsData();
        if (!ccData.guilds[guild.id]) ccData.guilds[guild.id] = { commands: [] };
        const guildCC = ccData.guilds[guild.id];

        if (sub === 'add') {
            const trigger = interaction.options.getString('trigger');
            const response = interaction.options.getString('response');
            const type = interaction.options.getString('type') || 'exact';

            guildCC.commands.push({ trigger, response, type, created_by: member.id, created_at: Math.floor(Date.now() / 1000) });
            saveCustomCommandsData(ccData);
            await interaction.reply({ content: `Custom command "${trigger}" added (type: ${type}).`, ephemeral: true });
        } else if (sub === 'remove') {
            const trigger = interaction.options.getString('trigger');
            const before = guildCC.commands.length;
            guildCC.commands = guildCC.commands.filter(c => c.trigger.toLowerCase() !== trigger.toLowerCase());
            saveCustomCommandsData(ccData);
            await interaction.reply({ content: guildCC.commands.length < before ? `Removed "${trigger}".` : 'Command not found.', ephemeral: true });
        } else if (sub === 'list') {
            if (guildCC.commands.length === 0) return interaction.reply({ content: 'No custom commands.', ephemeral: true });
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle('Custom Commands')
                .setDescription(guildCC.commands.map(c => `**${c.trigger}** (${c.type})`).join('\n'));
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // ==================== TICKET HANDLER ====================
    else if (commandName === 'ticket') {
        const sub = interaction.options.getSubcommand();
        const tData = loadTicketsData();
        if (!tData.guilds[guild.id]) tData.guilds[guild.id] = { panels: [], tickets: {}, next_ticket_id: 1, support_role: null, transcript_channel: null };
        const guildT = tData.guilds[guild.id];

        if (sub === 'setup') {
            const channel = interaction.options.getChannel('channel');
            const title = interaction.options.getString('title') || 'Support Tickets';
            const description = interaction.options.getString('description') || 'Click the button below to create a support ticket.';
            const supportRole = interaction.options.getRole('support_role');
            const buttonLabel = interaction.options.getString('button_label') || 'Create Ticket';
            const buttonEmoji = interaction.options.getString('button_emoji') || '🎫';
            const ticketType = interaction.options.getString('ticket_type') || 'support';

            if (supportRole) guildT.support_role = supportRole.id;

            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: 'CUB PROTECTOR Tickets' });

            const typeId = ticketType.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 20);
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ticket_create_${typeId}`).setLabel(buttonLabel).setStyle(ButtonStyle.Primary).setEmoji(buttonEmoji)
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });

            // Store panel info
            guildT.panels.push({
                message_id: msg.id,
                channel_id: channel.id,
                title,
                description,
                buttons: [{ type_id: typeId, label: buttonLabel, emoji: buttonEmoji, style: 'Primary' }],
                created_at: Math.floor(Date.now() / 1000),
            });

            saveTicketsData(tData);
            await interaction.reply({ content: `Ticket panel created in <#${channel.id}>.`, ephemeral: true });
        } else if (sub === 'close') {
            const ticketInfo = guildT.tickets[interaction.channel.id];
            if (!ticketInfo) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });

            await interaction.reply({ content: 'Closing ticket in 5 seconds...' });

            // Generate transcript
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const transcript = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[embed/attachment]'}`).join('\n');

            // Send transcript if configured
            if (guildT.transcript_channel) {
                const tCh = await guild.channels.fetch(guildT.transcript_channel).catch(() => null);
                if (tCh) {
                    const embed = cubEmbed()
                        .setColor(0x5865F2)
                        .setTitle(`Ticket #${ticketInfo.id} Closed`)
                        .addFields(
                            { name: 'Opened By', value: `<@${ticketInfo.creator_id}>`, inline: true },
                            { name: 'Closed By', value: `<@${member.id}>`, inline: true },
                        )
                        .setTimestamp();
                    await tCh.send({ embeds: [embed], files: [{ attachment: Buffer.from(transcript, 'utf-8'), name: `ticket-${ticketInfo.id}.txt` }] }).catch(() => {});
                }
            }

            delete guildT.tickets[interaction.channel.id];
            saveTicketsData(tData);

            setTimeout(() => interaction.channel.delete('Ticket closed').catch(() => {}), 5000);
        } else if (sub === 'add') {
            const targetUser = interaction.options.getUser('user');
            const ticketInfo = guildT.tickets[interaction.channel.id];
            if (!ticketInfo) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
            await interaction.channel.permissionOverwrites.create(targetUser.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
            await interaction.reply({ content: `Added <@${targetUser.id}> to this ticket.` });
        } else if (sub === 'remove') {
            const targetUser = interaction.options.getUser('user');
            const ticketInfo = guildT.tickets[interaction.channel.id];
            if (!ticketInfo) return interaction.reply({ content: 'This is not a ticket channel.', ephemeral: true });
            await interaction.channel.permissionOverwrites.delete(targetUser.id).catch(() => {});
            await interaction.reply({ content: `Removed <@${targetUser.id}> from this ticket.` });
        }
    }

    // ==================== GIVEAWAY HANDLER ====================
    else if (commandName === 'giveaway') {
        const sub = interaction.options.getSubcommand();
        const gData = loadGiveawaysData();
        if (!gData.guilds[guild.id]) gData.guilds[guild.id] = [];

        if (sub === 'start') {
            const prize = interaction.options.getString('prize');
            const durationStr = interaction.options.getString('duration');
            const winners = interaction.options.getInteger('winners') || 1;
            const requiredRole = interaction.options.getRole('required_role');
            const channel = interaction.options.getChannel('channel') || interaction.channel;

            const durationMs = parseDuration(durationStr);
            if (!durationMs) return interaction.reply({ content: 'Invalid duration. Use: 1h, 1d, 7d', ephemeral: true });

            const endsAt = Date.now() + durationMs;

            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('🎉 GIVEAWAY')
                .setDescription(`**${prize}**\n\nReact with the button below to enter!\n\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endsAt / 1000)}:R>`)
                .setTimestamp(endsAt);

            if (requiredRole) embed.addFields({ name: 'Required Role', value: `<@&${requiredRole.id}>` });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_enter').setLabel('Enter Giveaway 🎉').setStyle(ButtonStyle.Success)
            );

            const msg = await channel.send({ embeds: [embed], components: [row] });

            const giveaway = {
                message_id: msg.id,
                channel_id: channel.id,
                prize,
                winners,
                ends_at: endsAt,
                required_role: requiredRole?.id || null,
                entries: [],
                ended: false,
                host_id: member.id,
            };

            gData.guilds[guild.id].push(giveaway);
            saveGiveawaysData(gData);

            // Set timer
            const timer = setTimeout(() => endGiveaway(guild.id, msg.id), durationMs);
            giveawayTimers.set(msg.id, timer);

            await interaction.reply({ content: `Giveaway started in <#${channel.id}>!`, ephemeral: true });
        } else if (sub === 'end') {
            const messageId = interaction.options.getString('message_id');
            await endGiveaway(guild.id, messageId);
            await interaction.reply({ content: 'Giveaway ended.', ephemeral: true });
        } else if (sub === 'reroll') {
            const messageId = interaction.options.getString('message_id');
            const gData2 = loadGiveawaysData();
            const giveaway = gData2.guilds[guild.id]?.find(g => g.message_id === messageId);
            if (!giveaway || !giveaway.ended) return interaction.reply({ content: 'Giveaway not found or not ended.', ephemeral: true });
            if (giveaway.entries.length === 0) return interaction.reply({ content: 'No entries.', ephemeral: true });

            const winners = [];
            const pool = [...giveaway.entries];
            for (let i = 0; i < giveaway.winners && pool.length > 0; i++) {
                const idx = Math.floor(Math.random() * pool.length);
                winners.push(pool.splice(idx, 1)[0]);
            }

            const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
            if (channel) {
                await channel.send({ content: `🎉 **Giveaway Rerolled!**\nNew winner(s): ${winners.map(w => `<@${w}>`).join(', ')}\nPrize: **${giveaway.prize}**` });
            }
            await interaction.reply({ content: 'Rerolled!', ephemeral: true });
        }
    }

    // ==================== STARBOARD HANDLER ====================
    else if (commandName === 'starboard') {
        const sub = interaction.options.getSubcommand();
        const sbData = loadStarboardData();
        if (!sbData.guilds[guild.id]) sbData.guilds[guild.id] = { enabled: false, channel_id: null, emoji: '⭐', threshold: 3, posts: {} };

        if (sub === 'setup') {
            sbData.guilds[guild.id].channel_id = interaction.options.getChannel('channel').id;
            sbData.guilds[guild.id].emoji = interaction.options.getString('emoji') || '⭐';
            sbData.guilds[guild.id].threshold = interaction.options.getInteger('threshold') || 3;
            sbData.guilds[guild.id].enabled = true;
            saveStarboardData(sbData);
            await interaction.reply({ content: `Starboard set up in <#${sbData.guilds[guild.id].channel_id}>.`, ephemeral: true });
        } else if (sub === 'toggle') {
            sbData.guilds[guild.id].enabled = !sbData.guilds[guild.id].enabled;
            saveStarboardData(sbData);
            await interaction.reply({ content: `Starboard ${sbData.guilds[guild.id].enabled ? 'enabled' : 'disabled'}.`, ephemeral: true });
        }
    }

    // ==================== AFK HANDLER ====================
    else if (commandName === 'afk') {
        const message = interaction.options.getString('message') || 'AFK';
        const afkData = loadAFKData();
        if (!afkData.guilds[guild.id]) afkData.guilds[guild.id] = {};
        afkData.guilds[guild.id][member.id] = { message, since: Math.floor(Date.now() / 1000) };
        saveAFKData(afkData);
        await interaction.reply({ content: `You are now AFK: ${message}` });
    }

    // ==================== REMIND HANDLER ====================
    else if (commandName === 'remind') {
        const timeStr = interaction.options.getString('time');
        const message = interaction.options.getString('message');
        const durationMs = parseDuration(timeStr);
        if (!durationMs) return interaction.reply({ content: 'Invalid time format. Use: 30m, 2h, 1d', ephemeral: true });

        const rData = loadRemindersData();
        const id = (rData.reminders.length > 0 ? Math.max(...rData.reminders.map(r => r.id)) : 0) + 1;
        const reminder = { id, user_id: member.id, guild_id: guild.id, channel_id: interaction.channel.id, message, expires_at: Date.now() + durationMs };
        rData.reminders.push(reminder);
        saveRemindersData(rData);

        const timer = setTimeout(async () => {
            const ch = await client.channels.fetch(reminder.channel_id).catch(() => null);
            if (ch) ch.send({ content: `<@${reminder.user_id}> Reminder: ${reminder.message}` }).catch(() => {});
            const d = loadRemindersData();
            d.reminders = d.reminders.filter(r => r.id !== id);
            saveRemindersData(d);
            reminderTimers.delete(id);
        }, durationMs);
        reminderTimers.set(id, timer);

        await interaction.reply({ content: `Reminder set! I'll remind you <t:${Math.floor(reminder.expires_at / 1000)}:R>.`, ephemeral: true });
    }

    else if (commandName === 'reminders') {
        const rData = loadRemindersData();
        const userReminders = rData.reminders.filter(r => r.user_id === member.id);

        if (userReminders.length === 0) return interaction.reply({ content: 'No active reminders.', ephemeral: true });

        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('Your Reminders')
            .setDescription(userReminders.map(r =>
                `**#${r.id}** - ${r.message}\nExpires: <t:${Math.floor(r.expires_at / 1000)}:R>`
            ).join('\n\n'));

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ==================== SUGGESTIONS HANDLER ====================
    else if (commandName === 'suggest') {
        const idea = interaction.options.getString('idea');
        const sData = loadSuggestionsData();
        if (!sData.guilds[guild.id]) sData.guilds[guild.id] = { channel_id: null, suggestions: [], next_id: 1 };
        const guildS = sData.guilds[guild.id];

        if (!guildS.channel_id) return interaction.reply({ content: 'Suggestion channel not set up. Ask an admin to use `/suggestion setup`.', ephemeral: true });

        const channel = await guild.channels.fetch(guildS.channel_id).catch(() => null);
        if (!channel) return interaction.reply({ content: 'Suggestion channel not found.', ephemeral: true });

        const sugId = guildS.next_id++;
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(`Suggestion #${sugId}`)
            .setDescription(idea)
            .addFields({ name: 'Status', value: 'Pending', inline: true })
            .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
            .setTimestamp();

        const msg = await channel.send({ embeds: [embed] });
        await msg.react('👍').catch(() => {});
        await msg.react('👎').catch(() => {});

        guildS.suggestions.push({ id: sugId, message_id: msg.id, author_id: member.id, idea, status: 'pending' });
        saveSuggestionsData(sData);

        await interaction.reply({ content: `Suggestion #${sugId} submitted!`, ephemeral: true });
    }

    else if (commandName === 'suggestion') {
        const sub = interaction.options.getSubcommand();
        const sData = loadSuggestionsData();
        if (!sData.guilds[guild.id]) sData.guilds[guild.id] = { channel_id: null, suggestions: [], next_id: 1 };
        const guildS = sData.guilds[guild.id];

        if (sub === 'setup') {
            guildS.channel_id = interaction.options.getChannel('channel').id;
            saveSuggestionsData(sData);
            await interaction.reply({ content: `Suggestion channel set to <#${guildS.channel_id}>.`, ephemeral: true });
        } else if (sub === 'approve' || sub === 'deny') {
            const sugId = parseInt(interaction.options.getString('id'));
            const response = interaction.options.getString('response');
            const sug = guildS.suggestions.find(s => s.id === sugId);
            if (!sug) return interaction.reply({ content: 'Suggestion not found.', ephemeral: true });

            sug.status = sub === 'approve' ? 'approved' : 'denied';
            sug.response = response;
            saveSuggestionsData(sData);

            // Update message
            if (guildS.channel_id) {
                const channel = await guild.channels.fetch(guildS.channel_id).catch(() => null);
                if (channel) {
                    const msg = await channel.messages.fetch(sug.message_id).catch(() => null);
                    if (msg) {
                        const embed = EmbedBuilder.from(msg.embeds[0])
                            .setColor(sub === 'approve' ? 0x57F287 : 0xED4245)
                            .setFields(
                                { name: 'Status', value: sub === 'approve' ? 'Approved' : 'Denied', inline: true },
                                ...(response ? [{ name: 'Response', value: response, inline: false }] : []),
                            );
                        await msg.edit({ embeds: [embed] }).catch(() => {});
                    }
                }
            }

            await interaction.reply({ content: `Suggestion #${sugId} ${sub === 'approve' ? 'approved' : 'denied'}.`, ephemeral: true });
        }
    }

    // ==================== POLL HANDLER ====================
    else if (commandName === 'poll') {
        const question = interaction.options.getString('question');
        const options = [];
        for (let i = 1; i <= 5; i++) {
            const opt = interaction.options.getString(`option${i}`);
            if (opt) options.push(opt);
        }

        const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(`📊 ${question}`)
            .setDescription(options.map((o, i) => `${numberEmojis[i]} ${o}`).join('\n\n'))
            .setFooter({ text: `Poll by ${interaction.user.tag}` })
            .setTimestamp();

        const durationStr = interaction.options.getString('duration');
        if (durationStr) {
            const durationMs = parseDuration(durationStr);
            if (durationMs) embed.addFields({ name: 'Ends', value: `<t:${Math.floor((Date.now() + durationMs) / 1000)}:R>` });
        }

        const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
        for (let i = 0; i < options.length; i++) {
            await msg.react(numberEmojis[i]).catch(() => {});
        }
    }

    // ==================== FUN COMMANDS ====================
    else if (commandName === '8ball') {
        const responses = ['It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes - definitely.', 'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.', "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'];
        const answer = responses[Math.floor(Math.random() * responses.length)];
        await interaction.reply({ content: `🎱 ${answer}` });
    }

    else if (commandName === 'coinflip') {
        await interaction.reply({ content: Math.random() < 0.5 ? '🪙 **Heads!**' : '🪙 **Tails!**' });
    }

    else if (commandName === 'roll') {
        const sides = interaction.options.getInteger('sides') || 6;
        const result = Math.floor(Math.random() * sides) + 1;
        await interaction.reply({ content: `🎲 You rolled a **${result}** (d${sides})` });
    }

    // ==================== UTILITY COMMANDS ====================
    else if (commandName === 'userinfo') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const targetMember = await guild.members.fetch(targetUser.id).catch(() => null);

        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(targetUser.tag)
            .setThumbnail(targetUser.displayAvatarURL({ size: 256 }))
            .addFields(
                { name: 'ID', value: targetUser.id, inline: true },
                { name: 'Created', value: `<t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Bot', value: targetUser.bot ? 'Yes' : 'No', inline: true },
            );

        if (targetMember) {
            embed.addFields(
                { name: 'Joined', value: `<t:${Math.floor(targetMember.joinedTimestamp / 1000)}:R>`, inline: true },
                { name: 'Nickname', value: targetMember.nickname || 'None', inline: true },
                { name: 'Roles', value: targetMember.roles.cache.filter(r => r.id !== guild.id).map(r => `<@&${r.id}>`).join(', ') || 'None', inline: false },
            );
        }

        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'serverinfo') {
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(guild.name)
            .setThumbnail(guild.iconURL({ size: 256 }))
            .addFields(
                { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
                { name: 'Members', value: guild.memberCount.toString(), inline: true },
                { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
                { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
                { name: 'Emojis', value: guild.emojis.cache.size.toString(), inline: true },
                { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true },
                { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
                { name: 'Verification', value: guild.verificationLevel.toString(), inline: true },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'avatar') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(`${targetUser.tag}'s Avatar`)
            .setImage(targetUser.displayAvatarURL({ size: 1024 }));

        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'ping') {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const latency = sent.createdTimestamp - interaction.createdTimestamp;
        await interaction.editReply({ content: `🏓 Pong!\n**Bot Latency:** ${latency}ms\n**API Latency:** ${Math.round(client.ws.ping)}ms` });
    }

    else if (commandName === 'cubai') {
        try {
            if (interaction.user.id !== '378501056008683530') {
                return await interaction.reply({ content: 'Only the bot owner can use this command.', ephemeral: true });
            }
            if (!cubAiJoin || !cubAiLeave || !cubAiPersonality) {
                return await interaction.reply({ content: '⚠️ CUB AI is not available — voice dependencies not installed.', ephemeral: true });
            }
            const sub = interaction.options.getSubcommand();
            if (sub === 'join') return await cubAiJoin(interaction);
            if (sub === 'leave') return await cubAiLeave(interaction);
            if (sub === 'personality') return await cubAiPersonality(interaction);
            if (sub === 'ask') return await cubAiAsk(interaction);

            // All remaining subcommands need an active CUB AI session
            const _caState = cubAiGetState?.(interaction.guildId);

            // ── Feature list & toggle ────────────────────────────────────────
            if (sub === 'features') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active. Use `/cubai join` first.', ephemeral: true });
                const lines = Object.entries(CUBAI_FEATURES).map(([k, v]) => {
                    const on = _caState.features?.[k] !== false;
                    return `${on ? '✅' : '❌'} **${v.label}**`;
                }).join('\n');
                const modeLines = [
                    `${_caState.narratorMode ? '🟢' : '⚫'} Narrator Mode`,
                    `${_caState.sportsMode   ? '🟢' : '⚫'} Sports Announcer`,
                    `${_caState.therapistMode ? '🟢' : '⚫'} Therapist Mode`,
                    `${_caState.evilMode     ? '🟢' : '⚫'} Evil Mode`,
                ].join(' · ');
                return interaction.reply({ content: `🎮 **CUB AI Features:**\n${lines}\n\n**Active Modes:** ${modeLines}`, ephemeral: true });
            }

            if (sub === 'toggle') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active. Use `/cubai join` first.', ephemeral: true });
                const featureKey = interaction.options.getString('feature');
                const meta = CUBAI_FEATURES[featureKey];
                if (!meta) return interaction.reply({ content: '⚠️ Unknown feature.', ephemeral: true });
                _caState.features[featureKey] = !(_caState.features[featureKey] !== false);
                const on = _caState.features[featureKey];
                return interaction.reply({ content: `${on ? '✅' : '❌'} **${meta.label}** is now **${on ? 'enabled' : 'disabled'}**.`, ephemeral: true });
            }

            // ── Overlay mode toggles ─────────────────────────────────────────
            if (sub === 'narrator') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                cubAiNarrator?.(_caState);
                return interaction.reply({ content: `🎙️ Narrator Mode is now **${_caState.narratorMode ? 'ON' : 'OFF'}**.`, ephemeral: true });
            }
            if (sub === 'sports') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                cubAiSports?.(_caState);
                return interaction.reply({ content: `🏆 Sports Announcer Mode is now **${_caState.sportsMode ? 'ON' : 'OFF'}**.`, ephemeral: true });
            }
            if (sub === 'therapist') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                cubAiTherapist?.(_caState);
                return interaction.reply({ content: `🛋️ Therapist Mode is now **${_caState.therapistMode ? 'ON' : 'OFF'}**.`, ephemeral: true });
            }
            if (sub === 'evil') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                cubAiEvil?.(_caState);
                return interaction.reply({ content: `😈 Evil Mode is now **${_caState.evilMode ? 'ON' : 'OFF'}**.`, ephemeral: true });
            }

            // ── One-shot fun features ────────────────────────────────────────
            if (sub === 'rapbattle') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.rap_battle !== false)) return interaction.reply({ content: '❌ Rap Battle is disabled. Use `/cubai toggle` to enable it.', ephemeral: true });
                await interaction.reply({ content: '🎤 Dropping a verse...', ephemeral: true });
                await cubAiRapBattle?.(_caState, interaction.options.getString('target'), interaction.user.displayName || interaction.user.username);
                return;
            }

            if (sub === 'burnadd') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.burn_book !== false)) return interaction.reply({ content: '❌ Burn Book is disabled.', ephemeral: true });
                const name = interaction.options.getString('name');
                const reason = interaction.options.getString('reason') || '';
                cubAiBurnBookAdd?.(_caState, name, reason, interaction.user.displayName || interaction.user.username);
                return interaction.reply({ content: `📒 **${name}** has been added to the burn book.`, ephemeral: true });
            }

            if (sub === 'burnread') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.burn_book !== false)) return interaction.reply({ content: '❌ Burn Book is disabled.', ephemeral: true });
                await interaction.reply({ content: '📒 Reading the burn book...', ephemeral: true });
                await cubAiBurnBookRead?.(_caState);
                return;
            }

            if (sub === 'hottake') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.hot_takes !== false)) return interaction.reply({ content: '❌ Hot Takes is disabled.', ephemeral: true });
                await interaction.reply({ content: '🌶️ Generating hot take...', ephemeral: true });
                await cubAiHotTake?.(_caState, interaction.user.displayName || interaction.user.username);
                return;
            }

            if (sub === 'horoscope') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.horoscope !== false)) return interaction.reply({ content: '❌ Horoscope is disabled.', ephemeral: true });
                await interaction.reply({ content: '🔮 Reading the stars...', ephemeral: true });
                await cubAiHoroscope?.(_caState, interaction.options.getString('name'), interaction.user.displayName || interaction.user.username);
                return;
            }

            if (sub === 'conspiracy') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.conspiracy !== false)) return interaction.reply({ content: '❌ Conspiracy Theory is disabled.', ephemeral: true });
                await interaction.reply({ content: '🕵️ Digging up the truth...', ephemeral: true });
                await cubAiConspiracy?.(_caState, interaction.options.getString('topic'), interaction.user.displayName || interaction.user.username);
                return;
            }

            if (sub === 'translator') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.translator !== false)) return interaction.reply({ content: '❌ Fake Translator is disabled.', ephemeral: true });
                await interaction.reply({ content: '🗣️ Translating...', ephemeral: true });
                await cubAiTranslator?.(_caState, interaction.options.getString('name'), interaction.user.displayName || interaction.user.username);
                return;
            }

            if (sub === 'twotruths') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.two_truths !== false)) return interaction.reply({ content: '❌ Two Truths & a Lie is disabled.', ephemeral: true });
                await interaction.deferReply();
                // Generate game via cubai.js, then show buttons for guessing
                try {
                    const topics = ['pizza', 'daily habits', 'gaming', 'sleep', 'animals', 'random life facts'];
                    const topic = topics[Math.floor(Math.random() * topics.length)];
                    const { default: Anthropic } = await import('@anthropic-ai/sdk').catch(() => ({ default: null }));
                    // We call startTwoTruths which uses its own anthropic client + enqueues TTS
                    // But we also need the statements for buttons — so run it and grab state after
                    await cubAiTwoTruths?.(_caState, interaction.user.displayName || interaction.user.username);
                    if (_caState.twoTruthsGame) {
                        const { statements } = _caState.twoTruthsGame;
                        const row = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`twotruth_${interaction.guildId}_0`).setLabel('1️⃣ Statement 1').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`twotruth_${interaction.guildId}_1`).setLabel('2️⃣ Statement 2').setStyle(ButtonStyle.Primary),
                            new ButtonBuilder().setCustomId(`twotruth_${interaction.guildId}_2`).setLabel('3️⃣ Statement 3').setStyle(ButtonStyle.Primary),
                        );
                        return interaction.editReply({ content: `🤥 **Two Truths & a Lie!**\n**1.** ${statements[0]}\n**2.** ${statements[1]}\n**3.** ${statements[2]}\n\nWhich one is the lie?`, components: [row] });
                    }
                    return interaction.editReply({ content: '⚠️ Could not generate the game. Try again.' });
                } catch (err) {
                    return interaction.editReply({ content: `⚠️ Error: ${err.message}` });
                }
            }

            if (sub === 'judge') {
                if (!_caState) return interaction.reply({ content: '⚠️ CUB AI is not active.', ephemeral: true });
                if (!(_caState.features?.court_judge !== false)) return interaction.reply({ content: '❌ Court Judge is disabled.', ephemeral: true });
                await interaction.reply({ content: '⚖️ Order in the court...', ephemeral: true });
                await cubAiJudge?.(_caState, interaction.options.getString('case'), interaction.user.displayName || interaction.user.username);
                return;
            }
        } catch (err) {
            console.error('[CUB AI] Handler error:', err);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `⚠️ CUB AI error: ${err.message}`, ephemeral: true }).catch(() => {});
            }
        }
    }


    else if (commandName === 'invite') {
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('Invite CUB PROTECTOR')
            .setDescription(`[Add to your server](https://discord.com/oauth2/authorize?client_id=${CLIENT_ID}&permissions=1109107535350&scope=bot%20applications.commands)\n\n[Support Server](${SUPPORT_SERVER_LINK})`);
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'dashboard') {
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('CUB SOFTWARE Dashboards')
            .setDescription(
                '🛡️ **[CUB PROTECTOR Dashboard](https://cubsoftware.site/cub-protector/)**\nManage moderation, auto-mod, leveling, and more.\n\n' +
                '🤖 **[Custom Bot Dashboard](https://cubsoftware.site/bot-dashboard)**\nManage your custom Discord bot.\n\n' +
                '🌐 **[cubsoftware.site](https://cubsoftware.site)**'
            );
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    else if (commandName === 'website') {
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('CUB SOFTWARE')
            .setDescription('Visit our website for free Discord bots, tools, and more.\n\n🌐 **[cubsoftware.site](https://cubsoftware.site)**');
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'support') {
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('CUB SOFTWARE Support')
            .setDescription(`Join our Discord server for support, updates, and community.\n\n💬 **[Join the server](${SUPPORT_SERVER_LINK})**`);
        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'stats') {
        const uptime = process.uptime();
        const d = Math.floor(uptime / 86400);
        const h = Math.floor((uptime % 86400) / 3600);
        const m = Math.floor((uptime % 3600) / 60);

        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('CUB PROTECTOR Stats')
            .addFields(
                { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
                { name: 'Users', value: client.users.cache.size.toString(), inline: true },
                { name: 'Channels', value: client.channels.cache.size.toString(), inline: true },
                { name: 'Uptime', value: `${d}d ${h}h ${m}m`, inline: true },
                { name: 'Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
                { name: 'Memory', value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`, inline: true },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'help') {
        const specificCmd = interaction.options.getString('command');

        if (specificCmd) {
            const cmd = commands.find(c => c.name === specificCmd);
            if (!cmd) return interaction.reply({ content: `Command "${specificCmd}" not found.`, ephemeral: true });
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(`/${cmd.name}`)
                .setDescription(cmd.description || 'No description');
            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            const cats = buildHelpCategories(interaction.member);
            const { embed, components } = buildHelpPage(cats, 'home', 0);
            await interaction.reply({ embeds: [embed], components, ephemeral: true });
        }
    }

    else if (commandName === 'embed') {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('color');
        const footer = interaction.options.getString('footer');
        const image = interaction.options.getString('image');
        const thumbnail = interaction.options.getString('thumbnail');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        const embed = cubEmbed();
        if (title) embed.setTitle(title);
        if (description) embed.setDescription(description);
        if (color) embed.setColor(parseInt(color.replace('#', ''), 16));
        if (footer) embed.setFooter({ text: footer });
        if (image) embed.setImage(image);
        if (thumbnail) embed.setThumbnail(thumbnail);
        embed.setTimestamp();

        await channel.send({ embeds: [embed] });
        await interaction.reply({ content: `Embed sent to <#${channel.id}>.`, ephemeral: true });
    }

    // ==================== ECONOMY HANDLERS ====================
    else if (commandName === 'daily') {
        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        if (!guildE.users[member.id]) guildE.users[member.id] = { balance: 0, last_daily: 0 };
        const user = guildE.users[member.id];

        const now = Date.now();
        const lastDaily = user.last_daily || 0;
        const midnight = new Date().setHours(0, 0, 0, 0);

        if (lastDaily > midnight) {
            const nextDaily = midnight + 86400000;
            return interaction.reply({ content: `You already claimed your daily reward! Next: <t:${Math.floor(nextDaily / 1000)}:R>`, ephemeral: true });
        }

        user.balance += guildE.daily_amount;
        user.last_daily = now;
        saveEconomyData(eData);

        await interaction.reply({ content: `${guildE.currency_emoji} You claimed **${guildE.daily_amount} ${guildE.currency_name}**! Balance: **${user.balance} ${guildE.currency_name}**` });
    }

    else if (commandName === 'balance') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        const balance = guildE.users[targetUser.id]?.balance || 0;

        await interaction.reply({ content: `${guildE.currency_emoji} **${targetUser.tag}** has **${balance} ${guildE.currency_name}**.` });
    }

    else if (commandName === 'pay') {
        const targetUser = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');
        if (targetUser.id === member.id) return interaction.reply({ content: 'You can\'t pay yourself.', ephemeral: true });

        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        if (!guildE.users[member.id]) guildE.users[member.id] = { balance: 0 };
        if (!guildE.users[targetUser.id]) guildE.users[targetUser.id] = { balance: 0 };

        if (guildE.users[member.id].balance < amount) return interaction.reply({ content: 'Insufficient balance.', ephemeral: true });

        guildE.users[member.id].balance -= amount;
        guildE.users[targetUser.id].balance += amount;
        saveEconomyData(eData);

        await interaction.reply({ content: `${guildE.currency_emoji} Sent **${amount} ${guildE.currency_name}** to <@${targetUser.id}>.` });
    }

    else if (commandName === 'shop') {
        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);

        if (guildE.shop.length === 0) return interaction.reply({ content: 'The shop is empty.', ephemeral: true });

        const embed = cubEmbed()
            .setColor(0xFFD700)
            .setTitle(`${guildE.currency_emoji} Server Shop`)
            .setDescription(guildE.shop.map((item, i) =>
                `**${i + 1}. ${item.name}** - ${item.price} ${guildE.currency_name}\n${item.description || 'No description'}${item.role_id ? ` | Grants: <@&${item.role_id}>` : ''}`
            ).join('\n\n'))
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    else if (commandName === 'buy') {
        const itemName = interaction.options.getString('item');
        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        const item = guildE.shop.find(i => i.name.toLowerCase() === itemName.toLowerCase());

        if (!item) return interaction.reply({ content: 'Item not found in shop.', ephemeral: true });
        if (!guildE.users[member.id]) guildE.users[member.id] = { balance: 0 };
        if (guildE.users[member.id].balance < item.price) return interaction.reply({ content: 'Insufficient balance.', ephemeral: true });

        guildE.users[member.id].balance -= item.price;
        saveEconomyData(eData);

        if (item.role_id) {
            await member.roles.add(item.role_id).catch(() => {});
        }

        await interaction.reply({ content: `${guildE.currency_emoji} You purchased **${item.name}** for **${item.price} ${guildE.currency_name}**!` });
    }

    else if (commandName === 'work') {
        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        if (!guildE.users[member.id]) guildE.users[member.id] = { balance: guildE.starting_balance || 0 };
        const user = guildE.users[member.id];

        const now = Date.now();
        const cooldown = guildE.work_cooldown || 3600000;
        const lastWork = user.last_work || 0;
        if (now - lastWork < cooldown) {
            const nextWork = lastWork + cooldown;
            return interaction.reply({ content: `You need to rest! You can work again <t:${Math.floor(nextWork / 1000)}:R>.`, ephemeral: true });
        }

        const min = guildE.work_min || 50;
        const max = guildE.work_max || 150;
        const earned = Math.floor(Math.random() * (max - min + 1)) + min;
        user.balance += earned;
        user.last_work = now;
        saveEconomyData(eData);

        const jobs = ['mowed lawns', 'washed dishes', 'delivered packages', 'wrote code', 'walked dogs', 'sold lemonade', 'fixed computers', 'painted fences'];
        const job = jobs[Math.floor(Math.random() * jobs.length)];
        await interaction.reply({ content: `${guildE.currency_emoji} You ${job} and earned **${earned} ${guildE.currency_name}**! Balance: **${user.balance} ${guildE.currency_name}**` });
    }

    else if (commandName === 'rob') {
        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);

        if (!guildE.rob_enabled) {
            return interaction.reply({ content: 'Robbing is disabled on this server.', ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        if (targetUser.id === member.id) return interaction.reply({ content: 'You can\'t rob yourself.', ephemeral: true });
        if (targetUser.bot) return interaction.reply({ content: 'You can\'t rob a bot.', ephemeral: true });

        if (!guildE.users[member.id]) guildE.users[member.id] = { balance: guildE.starting_balance || 0 };
        if (!guildE.users[targetUser.id]) guildE.users[targetUser.id] = { balance: guildE.starting_balance || 0 };
        const robber = guildE.users[member.id];
        const victim = guildE.users[targetUser.id];

        if (victim.balance <= 0) return interaction.reply({ content: 'That user has no money to steal!', ephemeral: true });

        const chance = guildE.rob_chance || 40;
        const finePercent = guildE.rob_fine || 25;

        if (Math.random() * 100 < chance) {
            // Success - steal up to 50% of victim's balance
            const stolen = Math.floor(Math.random() * (victim.balance * 0.5)) + 1;
            robber.balance += stolen;
            victim.balance -= stolen;
            saveEconomyData(eData);
            await interaction.reply({ content: `${guildE.currency_emoji} You successfully robbed **${stolen} ${guildE.currency_name}** from <@${targetUser.id}>!` });
        } else {
            // Fail - pay a fine
            const fine = Math.floor(robber.balance * (finePercent / 100));
            robber.balance = Math.max(0, robber.balance - fine);
            saveEconomyData(eData);
            await interaction.reply({ content: `You got caught trying to rob <@${targetUser.id}> and paid a fine of **${fine} ${guildE.currency_name}**!` });
        }
    }

    else if (commandName === 'eco') {
        const sub = interaction.options.getSubcommand();
        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);

        if (sub === 'give') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            if (!guildE.users[targetUser.id]) guildE.users[targetUser.id] = { balance: 0 };
            guildE.users[targetUser.id].balance += amount;
            saveEconomyData(eData);
            await interaction.reply({ content: `Gave ${amount} ${guildE.currency_name} to <@${targetUser.id}>.`, ephemeral: true });
        } else if (sub === 'take') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            if (!guildE.users[targetUser.id]) guildE.users[targetUser.id] = { balance: 0 };
            guildE.users[targetUser.id].balance = Math.max(0, guildE.users[targetUser.id].balance - amount);
            saveEconomyData(eData);
            await interaction.reply({ content: `Took ${amount} ${guildE.currency_name} from <@${targetUser.id}>.`, ephemeral: true });
        } else if (sub === 'set') {
            const targetUser = interaction.options.getUser('user');
            const amount = interaction.options.getInteger('amount');
            if (!guildE.users[targetUser.id]) guildE.users[targetUser.id] = { balance: 0 };
            guildE.users[targetUser.id].balance = amount;
            saveEconomyData(eData);
            await interaction.reply({ content: `Set <@${targetUser.id}>'s balance to ${amount} ${guildE.currency_name}.`, ephemeral: true });
        } else if (sub === 'reset') {
            const targetUser = interaction.options.getUser('user');
            delete guildE.users[targetUser.id];
            saveEconomyData(eData);
            await interaction.reply({ content: `Reset <@${targetUser.id}>'s balance.`, ephemeral: true });
        } else if (sub === 'additem') {
            const name = interaction.options.getString('name');
            const price = interaction.options.getInteger('price');
            const description = interaction.options.getString('description') || '';
            const role = interaction.options.getRole('role');
            guildE.shop.push({ name, price, description, role_id: role?.id || null });
            saveEconomyData(eData);
            await interaction.reply({ content: `Added "${name}" to the shop for ${price} ${guildE.currency_name}.`, ephemeral: true });
        } else if (sub === 'removeitem') {
            const name = interaction.options.getString('name');
            guildE.shop = guildE.shop.filter(i => i.name.toLowerCase() !== name.toLowerCase());
            saveEconomyData(eData);
            await interaction.reply({ content: `Removed "${name}" from the shop.`, ephemeral: true });
        } else if (sub === 'config') {
            const currencyName = interaction.options.getString('currency_name');
            const currencyEmoji = interaction.options.getString('currency_emoji');
            const dailyAmount = interaction.options.getInteger('daily_amount');
            if (currencyName) guildE.currency_name = currencyName;
            if (currencyEmoji) guildE.currency_emoji = currencyEmoji;
            if (dailyAmount) guildE.daily_amount = dailyAmount;
            saveEconomyData(eData);
            await interaction.reply({ content: `Economy config updated: ${guildE.currency_emoji} ${guildE.currency_name}, daily: ${guildE.daily_amount}`, ephemeral: true });
        }
    }

    // ==================== ACHIEVEMENTS HANDLER ====================
    else if (commandName === 'achievements') {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const achData = loadAchievementsData();
        const userAch = achData.guilds?.[guild.id]?.[targetUser.id] || [];

        if (userAch.length === 0) return interaction.reply({ content: `<@${targetUser.id}> has no achievements yet.`, ephemeral: true });

        const tierEmojis = { Bronze: '🥉', Silver: '🥈', Gold: '🥇', Diamond: '💎' };

        const embed = cubEmbed()
            .setColor(0xFFD700)
            .setTitle(`${targetUser.tag}'s Achievements`)
            .setDescription(userAch.map(a =>
                `${tierEmojis[a.tier] || '📋'} **${a.name}** (${a.tier}) - ${a.description}\nEarned: <t:${a.earned_at}:R>`
            ).join('\n\n'))
            .setFooter({ text: `Total: ${userAch.length} achievement(s)` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── Admin Commands (from CubSoftware Bot) ─────────────────────────────────
    const isOwner = OWNER_IDS.includes(interaction.user.id);

    if (commandName === 'cubsoftware') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'info') {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('CUB SOFTWARE').setDescription('Free, privacy-focused web tools.').addFields({ name: 'Website', value: '[cubsoftware.site](https://cubsoftware.site)', inline: true }, { name: 'QuestCord', value: '[questcord.fun](https://questcord.fun)', inline: true }).setTimestamp()] });
        }
        if (sub === 'apps') {
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('CUB SOFTWARE Apps').addFields({ name: 'Social Media Saver', value: 'Download content', inline: true }, { name: 'File Converter', value: 'Convert images', inline: true }, { name: 'PDF Tools', value: 'Merge/split PDFs', inline: true }, { name: 'QR Generator', value: 'Create QR codes', inline: true }, { name: 'More...', value: 'cubsoftware.site', inline: true }).setTimestamp()] });
        }
    }

    if (commandName === 'link-find') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        let code = interaction.options.getString('code');
        if (code.includes('cubsw.link/')) code = code.split('cubsw.link/')[1].split(/[?#]/)[0];
        if (code.includes('/')) code = code.split('/').pop();
        const links = loadLinksFile(), audit = loadAuditFile();
        if (links[code]) {
            const l = links[code];
            const embed = new EmbedBuilder().setColor(0x00FF00).setTitle('Link Found (Active)').addFields({ name: 'Short Code', value: code, inline: true }, { name: 'Status', value: '🟢 Active', inline: true }, { name: 'Clicks', value: String(l.clicks || 0), inline: true }, { name: 'Destination', value: l.url.substring(0, 500) }, { name: 'Created', value: new Date(l.created * 1000).toLocaleString(), inline: true }, { name: 'Creator IP', value: `||${l.ip || 'Unknown'}||`, inline: true }).setTimestamp();
            if (audit[code]?.history) embed.addFields({ name: 'History (last 5)', value: audit[code].history.slice(-5).map(h => `${h.action} - ${new Date(h.timestamp * 1000).toLocaleString()}`).join('\n') || 'None' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        if (audit[code]) {
            const e = audit[code];
            const embed = new EmbedBuilder().setColor(0xFF6B6B).setTitle('Link Found (Deleted)').addFields({ name: 'Short Code', value: code, inline: true }, { name: 'Status', value: '🔴 Deleted', inline: true }, { name: 'Original URL', value: e.original_url.substring(0, 500) }, { name: 'Created', value: new Date(e.created_at * 1000).toLocaleString(), inline: true }, { name: 'Creator IP', value: `||${e.ip_address}||`, inline: true }).setTimestamp();
            if (e.history) embed.addFields({ name: 'Full History', value: e.history.map(h => `${h.action} - ${new Date(h.timestamp * 1000).toLocaleString()} - ||${h.ip}||`).join('\n') || 'None' });
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
        return interaction.reply({ content: `❌ No link found: \`${code}\``, ephemeral: true });
    }

    if (commandName === 'link-ban') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const ip = interaction.options.getString('ip'), reason = interaction.options.getString('reason') || 'No reason provided';
        const banned = loadBannedIps();
        if (banned.ips.includes(ip)) return interaction.reply({ content: `⚠️ IP \`${ip}\` already banned.`, ephemeral: true });
        banned.ips.push(ip); banned.reasons[ip] = { reason, bannedBy: interaction.user.id, bannedAt: Date.now() };
        return saveBannedIps(banned) ? interaction.reply({ content: `✅ Banned IP: \`${ip}\`\nReason: ${reason}`, ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
    }

    if (commandName === 'link-unban') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const ip = interaction.options.getString('ip');
        const banned = loadBannedIps();
        if (!banned.ips.includes(ip)) return interaction.reply({ content: `⚠️ IP \`${ip}\` not banned.`, ephemeral: true });
        banned.ips = banned.ips.filter(i => i !== ip); delete banned.reasons[ip];
        return saveBannedIps(banned) ? interaction.reply({ content: `✅ Unbanned: \`${ip}\``, ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
    }

    if (commandName === 'link-bans') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const banned = loadBannedIps();
        if (!banned.ips.length) return interaction.reply({ content: '📋 No IPs currently banned.', ephemeral: true });
        const embed = new EmbedBuilder().setColor(0xFF6B6B).setTitle('Banned IPs').setDescription(banned.ips.map(ip => { const info = banned.reasons[ip]; return info ? `\`${ip}\` - ${info.reason} (${new Date(info.bannedAt).toLocaleDateString()})` : `\`${ip}\``; }).join('\n')).setFooter({ text: `Total: ${banned.ips.length}` }).setTimestamp();
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'link-delete') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        let code = interaction.options.getString('code');
        if (code.includes('cubsw.link/')) code = code.split('cubsw.link/')[1].split(/[?#]/)[0];
        if (code.includes('/')) code = code.split('/').pop();
        const links = loadLinksFile(), audit = loadAuditFile();
        if (!links[code]) return interaction.reply({ content: audit[code] ? `⚠️ Already deleted.` : `❌ Not found: \`${code}\``, ephemeral: true });
        const ld = links[code];
        if (!audit[code]) audit[code] = { original_url: ld.url, created_at: ld.created, ip_address: ld.ip || 'Unknown', history: [] };
        audit[code].history.push({ action: 'deleted', timestamp: Math.floor(Date.now() / 1000), ip: 'Discord Bot', deletedBy: interaction.user.id, clicks: ld.clicks || 0 });
        delete links[code];
        if (!saveLinksFile(links)) return interaction.reply({ content: '❌ Save failed.', ephemeral: true });
        saveAuditFile(audit);
        const embed = new EmbedBuilder().setColor(0xFF6B6B).setTitle('Link Deleted').addFields({ name: 'Short Code', value: code, inline: true }, { name: 'Clicks', value: String(ld.clicks || 0), inline: true }, { name: 'Original URL', value: ld.url.substring(0, 500) }, { name: 'Creator IP', value: `||${ld.ip || 'Unknown'}||`, inline: true }, { name: 'Deleted By', value: `<@${interaction.user.id}>`, inline: true }).setTimestamp();
        try { const lc = await client.channels.fetch(LINKS_LOG_CHANNEL_ID).catch(() => null); if (lc) await lc.send({ content: `🗑️ Link deleted by <@${interaction.user.id}>`, embeds: [embed] }); } catch (_) {}
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'ip-ban') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const ip = interaction.options.getString('ip'), type = interaction.options.getString('type'), reason = interaction.options.getString('reason') || 'No reason provided';
        const bans = loadIpBans();
        if (type === 'global') {
            if (bans.global.some(b => b.ip === ip)) return interaction.reply({ content: `⚠️ \`${ip}\` already globally banned.`, ephemeral: true });
            bans.global.push({ ip, reason, bannedBy: interaction.user.id, bannedAt: Date.now() });
        } else {
            if (!bans.features[type]) bans.features[type] = [];
            if (bans.features[type].some(b => b.ip === ip)) return interaction.reply({ content: `⚠️ \`${ip}\` already banned from ${type}.`, ephemeral: true });
            bans.features[type].push({ ip, reason, bannedBy: interaction.user.id, bannedAt: Date.now() });
        }
        return saveIpBans(bans) ? interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF6B6B).setTitle('IP Banned').addFields({ name: 'IP', value: `\`${ip}\``, inline: true }, { name: 'Type', value: type === 'global' ? 'Global' : type, inline: true }, { name: 'Reason', value: reason }).setTimestamp()], ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
    }

    if (commandName === 'ip-temp-ban') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const ip = interaction.options.getString('ip'), durationStr = interaction.options.getString('duration'), type = interaction.options.getString('type') || 'global', reason = interaction.options.getString('reason') || 'Temporary ban';
        const duration = parseDuration(durationStr);
        if (!duration) return interaction.reply({ content: '❌ Invalid duration. Use: 30m, 1h, 7d', ephemeral: true });
        const bans = loadIpBans(), expires = Date.now() + duration;
        bans.temp = bans.temp.filter(b => b.ip !== ip);
        bans.temp.push({ ip, feature: type === 'global' ? null : type, reason, bannedBy: interaction.user.id, bannedAt: Date.now(), expires });
        return saveIpBans(bans) ? interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('IP Temporarily Banned').addFields({ name: 'IP', value: `\`${ip}\``, inline: true }, { name: 'Duration', value: formatDuration(duration), inline: true }, { name: 'Type', value: type === 'global' ? 'Global' : type, inline: true }, { name: 'Expires', value: `<t:${Math.floor(expires / 1000)}:R>`, inline: true }, { name: 'Reason', value: reason }).setTimestamp()], ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
    }

    if (commandName === 'ip-unban') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const ip = interaction.options.getString('ip');
        const bans = loadIpBans(); let removed = false;
        const gi = bans.global.findIndex(b => b.ip === ip); if (gi !== -1) { bans.global.splice(gi, 1); removed = true; }
        for (const feat in bans.features) { const fi = bans.features[feat].findIndex(b => b.ip === ip); if (fi !== -1) { bans.features[feat].splice(fi, 1); removed = true; } }
        const ti = bans.temp.findIndex(b => b.ip === ip); if (ti !== -1) { bans.temp.splice(ti, 1); removed = true; }
        if (!removed) return interaction.reply({ content: `⚠️ \`${ip}\` not found in any ban list.`, ephemeral: true });
        return saveIpBans(bans) ? interaction.reply({ content: `✅ Unbanned: \`${ip}\``, ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
    }

    if (commandName === 'ip-list') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const bans = loadIpBans();
        const embed = new EmbedBuilder().setColor(0xFF6B6B).setTitle('All IP Bans').setTimestamp();
        if (bans.global.length) embed.addFields({ name: `🌐 Global (${bans.global.length})`, value: bans.global.slice(0, 10).map(b => `\`${b.ip}\` - ${b.reason}`).join('\n') + (bans.global.length > 10 ? `\n+${bans.global.length - 10} more` : '') });
        for (const feat in bans.features) { if (bans.features[feat].length) embed.addFields({ name: `📌 ${feat} (${bans.features[feat].length})`, value: bans.features[feat].slice(0, 5).map(b => `\`${b.ip}\` - ${b.reason}`).join('\n') }); }
        const active = bans.temp.filter(b => b.expires > Date.now());
        if (active.length) embed.addFields({ name: `⏰ Temporary (${active.length})`, value: active.slice(0, 10).map(b => `\`${b.ip}\` - ${b.feature || 'global'} - expires <t:${Math.floor(b.expires / 1000)}:R>`).join('\n') });
        const total = bans.global.length + Object.values(bans.features).reduce((s, a) => s + a.length, 0) + active.length;
        if (!total) embed.setDescription('No IPs currently banned.'); else embed.setFooter({ text: `Total: ${total} active bans` });
        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'keraplast-password') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const sub = interaction.options.getSubcommand();
        if (sub === 'create') {
            const password = interaction.options.getString('password'), label = interaction.options.getString('label') || '';
            const data = loadKeraplastPasswords();
            if (data.passwords.some(p => p.password === password)) return interaction.reply({ content: '❌ Password already exists.', ephemeral: true });
            data.passwords.push({ password, label, created_at: Date.now() / 1000 });
            return saveKeraplastPasswords(data) ? interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle('Keraplast Password Created').addFields({ name: 'Password', value: `\`${password}\``, inline: true }, { name: 'Label', value: label || 'None', inline: true }).setTimestamp()], ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
        }
        if (sub === 'delete') {
            const password = interaction.options.getString('password');
            const data = loadKeraplastPasswords(), orig = data.passwords.length;
            data.passwords = data.passwords.filter(p => p.password !== password);
            if (data.passwords.length === orig) return interaction.reply({ content: '❌ Password not found.', ephemeral: true });
            return saveKeraplastPasswords(data) ? interaction.reply({ embeds: [new EmbedBuilder().setColor(0xef4444).setTitle('Keraplast Password Deleted').addFields({ name: 'Password', value: `\`${password}\`` }).setTimestamp()], ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
        }
        if (sub === 'list') {
            const data = loadKeraplastPasswords();
            if (!data.passwords.length) return interaction.reply({ content: 'No passwords configured.', ephemeral: true });
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('Keraplast Passwords').setDescription(data.passwords.map((p, i) => `${i + 1}. \`${p.password}\`${p.label ? ` (${p.label})` : ''}`).join('\n')).setFooter({ text: `${data.passwords.length} password(s)` }).setTimestamp()], ephemeral: true });
        }
    }

    if (commandName === 'feature') {
        if (!isOwner) return interaction.reply({ content: '❌ Restricted to bot owners.', ephemeral: true });
        const sub = interaction.options.getSubcommand(), name = interaction.options.getString('name');
        if (sub === 'list') {
            const disabled = loadDisabledFeatures();
            return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x5865f2).setTitle('Feature Status').setDescription(ALL_WEBSITE_FEATURES.map(f => `${disabled.includes(f) ? '🔴' : '🟢'} ${f}`).join('\n')).setFooter({ text: `${disabled.length} disabled, ${ALL_WEBSITE_FEATURES.length - disabled.length} enabled` }).setTimestamp()], ephemeral: true });
        }
        const disabled = loadDisabledFeatures();
        if (sub === 'disable') {
            if (disabled.includes(name)) return interaction.reply({ content: `⚠️ **${name}** already disabled.`, ephemeral: true });
            disabled.push(name);
            return saveDisabledFeatures(disabled) ? interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFF6B6B).setTitle('Feature Disabled').setDescription(`**${name}** has been disabled.`).addFields({ name: 'Status', value: '🔴 Disabled', inline: true }).setTimestamp()], ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
        }
        if (sub === 'enable') {
            if (!disabled.includes(name)) return interaction.reply({ content: `⚠️ **${name}** is not disabled.`, ephemeral: true });
            return saveDisabledFeatures(disabled.filter(f => f !== name)) ? interaction.reply({ embeds: [new EmbedBuilder().setColor(0x22c55e).setTitle('Feature Enabled').setDescription(`**${name}** has been enabled.`).addFields({ name: 'Status', value: '🟢 Enabled', inline: true }).setTimestamp()], ephemeral: true }) : interaction.reply({ content: '❌ Save failed.', ephemeral: true });
        }
    }
});

// ============================================================
// Interactive Help System
// ============================================================
const HELP_CMDS_PER_PAGE = 8;

function buildHelpCategories(member) {
    const isAdmin = member.permissions.has(PermissionFlagsBits.ManageGuild);
    const isMod = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
        member.permissions.has(PermissionFlagsBits.BanMembers) ||
        member.permissions.has(PermissionFlagsBits.KickMembers) ||
        member.permissions.has(PermissionFlagsBits.ManageMessages);
    const isVoiceAdmin = member.permissions.has(PermissionFlagsBits.ManageChannels);

    const cats = [];

    // Voice User Commands - always visible
    cats.push({
        id: 'voice', emoji: '🔊', name: 'Voice Channels',
        description: 'Control your temporary voice channel',
        commands: [
            { name: 'voice-ban', desc: 'Ban a user from your voice channel' },
            { name: 'voice-unban', desc: 'Unban a user from your voice channel' },
            { name: 'voice-kick', desc: 'Kick a user from your voice channel' },
            { name: 'voice-lock', desc: 'Lock your channel (no new users)' },
            { name: 'voice-unlock', desc: 'Unlock your voice channel' },
            { name: 'voice-hide', desc: 'Hide your channel from everyone' },
            { name: 'voice-reveal', desc: 'Reveal your hidden channel' },
            { name: 'voice-limit', desc: 'Set a user limit on your channel' },
            { name: 'voice-rename', desc: 'Rename your voice channel' },
            { name: 'voice-claim', desc: 'Claim an abandoned channel' },
            { name: 'voice-transfer', desc: 'Transfer channel ownership' },
            { name: 'voice-owner', desc: 'Check who owns the channel' },
            { name: 'voice-permit', desc: 'Allow a user into your hidden channel' },
            { name: 'voice-reject', desc: 'Remove access from a user' },
        ]
    });

    // Voice Admin - requires ManageChannels
    if (isVoiceAdmin || isAdmin) {
        cats.push({
            id: 'voice-admin', emoji: '⚙️', name: 'Voice Admin',
            description: 'Set up and manage voice channel hubs',
            commands: [
                { name: 'voice-setup', desc: 'Create a temporary voice channel hub' },
                { name: 'voice-hub-delete', desc: 'Delete a voice channel hub' },
                { name: 'voice-hub-settings', desc: 'View or modify hub settings' },
                { name: 'voice-hub-moderator', desc: 'Add/remove hub moderator role' },
                { name: 'voice-hub-ignored', desc: 'Add/remove ignored role for a hub' },
                { name: 'voice-mod-role', desc: 'Add/remove global voice mod role' },
                { name: 'voice-mod-user', desc: 'Add/remove individual voice moderator' },
                { name: 'voice-mods', desc: 'View all voice moderators' },
                { name: 'voice-clean', desc: 'Delete inactive temp channels' },
            ]
        });
    }

    // Moderation - requires mod perms
    if (isMod || isAdmin) {
        cats.push({
            id: 'moderation', emoji: '🛡️', name: 'Moderation',
            description: 'Manage members and enforce server rules',
            commands: [
                { name: 'ban', desc: 'Ban a user (supports temp bans)' },
                { name: 'unban', desc: 'Unban a user by ID' },
                { name: 'kick', desc: 'Kick a user from the server' },
                { name: 'mute', desc: 'Timeout a user for a duration' },
                { name: 'unmute', desc: 'Remove timeout from a user' },
                { name: 'warn', desc: 'Issue a warning to a user' },
                { name: 'warnings', desc: 'View warnings for a user' },
                { name: 'delwarn', desc: 'Delete a specific warning' },
                { name: 'clearwarnings', desc: 'Clear all warnings for a user' },
                { name: 'softban', desc: 'Ban and unban to clear messages' },
                { name: 'purge', desc: 'Delete messages (with filters)' },
                { name: 'slowmode', desc: 'Set channel slowmode' },
                { name: 'lock', desc: 'Lock a channel' },
                { name: 'unlock', desc: 'Unlock a channel' },
                { name: 'modlogs', desc: 'View moderation history' },
                { name: 'note', desc: 'Add a private note about a user' },
                { name: 'notes', desc: 'View notes for a user' },
                { name: 'delnote', desc: 'Delete a specific note' },
            ]
        });
    }

    // Server Config - requires ManageGuild
    if (isAdmin) {
        cats.push({
            id: 'config', emoji: '🔧', name: 'Server Config',
            description: 'Configure bot features for your server',
            commands: [
                { name: 'ticket', desc: 'Set up the ticket system' },
                { name: 'giveaway', desc: 'Start and manage giveaways' },
                { name: 'suggestion', desc: 'Manage the suggestion system' },
            ]
        });
    }

    // Community - always visible
    cats.push({
        id: 'community', emoji: '💬', name: 'Community',
        description: 'Social and interactive commands for everyone',
        commands: [
            { name: 'afk', desc: 'Set your AFK status' },
            { name: 'remind', desc: 'Set a reminder' },
            { name: 'reminders', desc: 'View your active reminders' },
            { name: 'suggest', desc: 'Submit a suggestion' },
            { name: 'poll', desc: 'Create a poll' },
        ]
    });

    // Utility - always visible
    cats.push({
        id: 'utility', emoji: '🔹', name: 'Utility',
        description: 'Useful information and tools',
        commands: [
            { name: 'userinfo', desc: 'View user information' },
            { name: 'serverinfo', desc: 'View server information' },
            { name: 'avatar', desc: 'Get a user\'s avatar' },
            { name: 'ping', desc: 'Check bot latency' },
            { name: 'invite', desc: 'Get bot invite link' },
            { name: 'website', desc: 'Get the CUB SOFTWARE website link' },
            { name: 'support', desc: 'Get the CUB SOFTWARE support server link' },
            { name: 'stats', desc: 'View bot statistics' },
            { name: 'help', desc: 'Show this help menu' },
        ]
    });

    // About - always visible
    cats.push({
        id: 'about', emoji: '🏢', name: 'About CUB SOFTWARE',
        description: 'Our bots, services & website',
        commands: []
    });

    return cats;
}

function buildHelpPage(categories, categoryId, page) {
    // Helper: select menu options with proper description for special pages
    const selectOptions = (activeCatId) => categories.map(c => ({
        label: c.name,
        description: c.id === 'about' ? 'Our bots, services & website' : `${c.commands.length} commands`,
        value: c.id,
        emoji: c.emoji,
        default: c.id === activeCatId,
    }));

    if (categoryId === 'home') {
        const cmdCount = categories.reduce((a, c) => a + c.commands.length, 0);
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('📖  CUB PROTECTOR — Help Manual')
            .setDescription(
                'Welcome to the CUB PROTECTOR help manual!\n' +
                'Use the dropdown menu below to browse command categories.\n' +
                'Use `/help <command>` for details on a specific command.\n\n' +
                '**Available Categories:**'
            )
            .setThumbnail('https://cubsoftware.site/static/images/cub-protector-logo.png')
            .setTimestamp()
            .setFooter({ text: `${cmdCount} commands available • Developed by https://cubsoftware.site` });

        for (const cat of categories) {
            const countText = cat.id === 'about' ? 'Company info' : `\`${cat.commands.length} commands\``;
            embed.addFields({
                name: `${cat.emoji}  ${cat.name}`,
                value: `${cat.description} — ${countText}`,
                inline: false
            });
        }

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help_select')
                .setPlaceholder('Select a category...')
                .addOptions(selectOptions('home'))
        );

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('help_home').setLabel('Home').setEmoji('🏠').setStyle(ButtonStyle.Primary).setDisabled(true)
        );

        return { embed, components: [selectRow, btnRow] };
    }

    // About CUB SOFTWARE page
    if (categoryId === 'about') {
        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle('🏢 CUB SOFTWARE')
            .setDescription('CUB SOFTWARE creates free Discord bots and tools for communities of all sizes. No subscriptions, no paywalls, no ads — just software that works.')
            .setThumbnail('https://cubsoftware.site/static/images/company-logo.png')
            .addFields(
                { name: '🛡️ CUB PROTECTOR', value: 'All-in-one moderation bot. Auto-mod, logging, leveling, economy, voice channels, tickets, giveaways, and much more.\n[→ cubsoftware.site/cub-protector](https://cubsoftware.site/cub-protector)', inline: false },
                { name: '🧹 CleanMe', value: 'Keep your server clean. Bulk delete messages, auto-purge old content, and manage channels effortlessly.\n[→ cubsoftware.site/cleanme](https://cubsoftware.site/cleanme)', inline: false },
                { name: '⚔️ QuestCord', value: 'A Discord RPG bot. Complete quests, defeat bosses, and climb the leaderboard.\n[→ questcord.fun](https://questcord.fun)', inline: false },
                { name: '🌐 Website & Free Tools', value: 'Media downloader, file converter, image editor, streamer tools and more — all free, no accounts needed.\n[→ cubsoftware.site](https://cubsoftware.site)', inline: false },
                { name: '💬 Support & Community', value: `Get help, report issues, or just hang out.\n[→ Join our Discord](${SUPPORT_SERVER_LINK})`, inline: false },
            )
            .setTimestamp()
            .setFooter({ text: 'Developed by https://cubsoftware.site' });

        const selectRow = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help_select')
                .setPlaceholder('Select a category...')
                .addOptions(selectOptions('about'))
        );

        const btnRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('help_home').setLabel('Home').setEmoji('🏠').setStyle(ButtonStyle.Secondary)
        );

        return { embed, components: [selectRow, btnRow] };
    }

    // Category page
    const cat = categories.find(c => c.id === categoryId);
    if (!cat) return buildHelpPage(categories, 'home', 0);

    const totalPages = Math.ceil(cat.commands.length / HELP_CMDS_PER_PAGE);
    const safePage = Math.min(Math.max(page, 0), totalPages - 1);
    const start = safePage * HELP_CMDS_PER_PAGE;
    const pageCmds = cat.commands.slice(start, start + HELP_CMDS_PER_PAGE);

    const embed = cubEmbed()
        .setColor(0x5865F2)
        .setTitle(`${cat.emoji}  ${cat.name}`)
        .setDescription(cat.description)
        .setTimestamp()
        .setFooter({ text: `Page ${safePage + 1} of ${totalPages} • Developed by https://cubsoftware.site` });

    for (const cmd of pageCmds) {
        embed.addFields({ name: `\`/${cmd.name}\``, value: cmd.desc, inline: true });
    }

    const selectRow = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_select')
            .setPlaceholder('Select a category...')
            .addOptions(selectOptions(categoryId))
    );

    const btnRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_home').setLabel('Home').setEmoji('🏠').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`help_prev_${categoryId}_${safePage}`).setLabel('Previous').setEmoji('◀️').setStyle(ButtonStyle.Primary).setDisabled(safePage === 0),
        new ButtonBuilder().setCustomId(`help_next_${categoryId}_${safePage}`).setLabel('Next').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(safePage >= totalPages - 1)
    );

    return { embed, components: [selectRow, btnRow] };
}

// ============================================================
// Button/Select Menu Interaction Handler
// ============================================================
client.on('interactionCreate', async (interaction) => {
    if (CUSTOM_GUILD_ID && interaction.guildId !== CUSTOM_GUILD_ID) return;
    // Allow help navigation interactions through even when a custom bot is active
    const _isHelpInteraction = interaction.customId?.startsWith('help_') || interaction.customId === 'help_select';
    if (guildHasCustomBot(interaction.guildId) && !_isHelpInteraction) return;
    const commandName = interaction.isChatInputCommand() ? interaction.commandName : null;
    const guild = interaction.guild;
    const member = interaction.member;
    const guildId = guild?.id;
    // ---- Help navigation ----
    if (interaction.isStringSelectMenu() && interaction.customId === 'help_select') {
        const categoryId = interaction.values[0];
        const cats = buildHelpCategories(interaction.member);
        const { embed, components } = buildHelpPage(cats, categoryId, 0);
        return interaction.update({ embeds: [embed], components });
    }

    // ── Two Truths & a Lie guess buttons ─────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith('twotruth_')) {
        const parts = interaction.customId.split('_'); // twotruth_guildId_guessIndex
        const guildId = parts[1];
        const guessIdx = parseInt(parts[2]);
        const caState = cubAiGetState?.(guildId);
        if (!caState?.twoTruthsGame) {
            return interaction.update({ content: '❌ No active Two Truths game.', components: [] });
        }
        const { lieIndex, statements } = caState.twoTruthsGame;
        const lieStatement = statements[lieIndex];
        const correct = guessIdx === lieIndex;
        const displayName = interaction.member?.displayName || interaction.user.username;
        // Speak result aloud (via cubai function — game state still valid here)
        await cubAiTwoTruthsGuess?.(caState, String(guessIdx + 1), displayName);
        // Now null the game (handleTwoTruthsGuess already nulled it internally)
        const resultMsg = correct
            ? `✅ **${displayName}** got it! Statement **${guessIdx + 1}** was the lie!\n> "${lieStatement}"`
            : `❌ **${displayName}** guessed #${guessIdx + 1} — WRONG! The lie was **#${lieIndex + 1}**:\n> "${lieStatement}"`;
        return interaction.update({ content: resultMsg, components: [] });
    }

    if (interaction.isButton() && interaction.customId === 'help_home') {
        const cats = buildHelpCategories(interaction.member);
        const { embed, components } = buildHelpPage(cats, 'home', 0);
        return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId.startsWith('help_prev_')) {
        const parts = interaction.customId.split('_');
        const categoryId = parts[2];
        const currentPage = parseInt(parts[3]);
        const cats = buildHelpCategories(interaction.member);
        const { embed, components } = buildHelpPage(cats, categoryId, currentPage - 1);
        return interaction.update({ embeds: [embed], components });
    }

    if (interaction.isButton() && interaction.customId.startsWith('help_next_')) {
        const parts = interaction.customId.split('_');
        const categoryId = parts[2];
        const currentPage = parseInt(parts[3]);
        const cats = buildHelpCategories(interaction.member);
        const { embed, components } = buildHelpPage(cats, categoryId, currentPage + 1);
        return interaction.update({ embeds: [embed], components });
    }

    // Reaction Role Buttons
    if (interaction.isButton() && interaction.customId.startsWith('rr_')) {
        const parts = interaction.customId.split('_');
        const roleId = parts[parts.length - 1];

        const role = interaction.guild.roles.cache.get(roleId);
        if (!role) return interaction.reply({ content: 'Role not found.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        if (interaction.member.roles.cache.has(roleId)) {
            await interaction.member.roles.remove(roleId).catch(() => {});
            await interaction.editReply({ content: `Removed <@&${roleId}>.` });
        } else {
            await interaction.member.roles.add(roleId).catch(() => {});
            await interaction.editReply({ content: `Added <@&${roleId}>.` });
        }
    }

    // Reaction Role Select Menus
    else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('rr_select_')) {
        const selected = interaction.values;
        const rrData = loadReactionRolesData();
        const messageId = interaction.customId.replace('rr_select_', '');
        const rrMsg = rrData.guilds[interaction.guild.id]?.[messageId];
        if (!rrMsg) return interaction.reply({ content: 'Config not found.', ephemeral: true });

        await interaction.deferReply({ ephemeral: true });

        const allRoleIds = rrMsg.roles.map(r => r.role_id);

        // Add/remove all roles in parallel
        await Promise.all(allRoleIds.map(roleId =>
            selected.includes(roleId)
                ? interaction.member.roles.add(roleId).catch(() => {})
                : interaction.member.roles.remove(roleId).catch(() => {})
        ));

        await interaction.editReply({ content: `Roles updated: ${selected.length > 0 ? selected.map(r => `<@&${r}>`).join(', ') : 'None'}` });
    }

    // Ticket Create Button (supports ticket_create and ticket_create_TYPE)
    else if (interaction.isButton() && (interaction.customId === 'ticket_create' || interaction.customId.startsWith('ticket_create_'))) {
        const tData = loadTicketsData();
        const guildT = tData.guilds[interaction.guild.id];
        if (!guildT) return interaction.reply({ content: 'Ticket system not configured.', ephemeral: true });

        // Extract ticket type from button customId
        const ticketType = interaction.customId === 'ticket_create' ? 'support' : interaction.customId.replace('ticket_create_', '');

        // Check max tickets per user per type
        const maxPerUser = guildT.max_per_user ?? 1;
        if (maxPerUser > 0) {
            const existingCount = Object.values(guildT.tickets).filter(t => t.creator_id === interaction.user.id && (t.type || 'support') === ticketType).length;
            if (existingCount >= maxPerUser) {
                return interaction.reply({ content: `You already have ${existingCount} open ${ticketType} ticket${existingCount > 1 ? 's' : ''}. Maximum is ${maxPerUser}.`, ephemeral: true });
            }
        }

        const ticketId = guildT.next_ticket_id++;
        const permissionOverwrites = [
            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
            { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            { id: CLIENT_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels] },
        ];

        if (guildT.support_role) {
            permissionOverwrites.push({ id: guildT.support_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
        }

        // Find category and settings for this ticket type from panel config
        let categoryId = null;
        let closedCategoryId = null;
        let welcomeMessage = '';
        let closeMessage = '';
        for (const panel of (guildT.panels || [])) {
            const btn = (panel.buttons || []).find(b => b.type_id === ticketType);
            if (btn) {
                if (btn.category_id) categoryId = btn.category_id;
                if (btn.closed_category_id) closedCategoryId = btn.closed_category_id;
                if (btn.welcome_message) welcomeMessage = btn.welcome_message;
                if (btn.close_message) closeMessage = btn.close_message;
                break;
            }
        }

        // Build channel name based on naming format
        const namingFormat = guildT.naming_format || 'type-ticket-id';
        let channelName;
        switch (namingFormat) {
            case 'ticket-id': channelName = `ticket-${ticketId}`; break;
            case 'type-id': channelName = `${ticketType}-${ticketId}`; break;
            case 'username-type': channelName = `${interaction.user.username}-${ticketType}`; break;
            default: channelName = `${ticketType}-ticket-${ticketId}`;
        }

        const createOpts = {
            name: channelName,
            type: ChannelType.GuildText,
            permissionOverwrites,
        };
        if (categoryId) createOpts.parent = categoryId;

        await interaction.deferReply({ ephemeral: true });

        const ticketChannel = await interaction.guild.channels.create(createOpts);

        guildT.tickets[ticketChannel.id] = { id: ticketId, creator_id: interaction.user.id, created_at: Math.floor(Date.now() / 1000), type: ticketType };
        saveTicketsData(tData);

        const typeName = ticketType.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const welcomeDesc = welcomeMessage
            ? `${welcomeMessage}\n\n**Type:** ${typeName}\n\nUse \`/ticket close\` or click a button below to close this ticket.`
            : `Welcome <@${interaction.user.id}>! A staff member will be with you shortly.\n\n**Type:** ${typeName}\n\nUse \`/ticket close\` or click a button below to close this ticket.`;

        const embed = cubEmbed()
            .setColor(0x5865F2)
            .setTitle(`${typeName} Ticket #${ticketId}`)
            .setDescription(welcomeDesc)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_claim_btn').setLabel('Claim Ticket').setStyle(ButtonStyle.Success).setEmoji('✋'),
            new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        const ticketMsg = { embeds: [embed], components: [row] };
        // Ping support role if enabled
        if (guildT.ping_support && guildT.support_role) {
            ticketMsg.content = `<@&${guildT.support_role}>`;
        }

        await ticketChannel.send(ticketMsg);
        await interaction.editReply({ content: `Ticket created: <#${ticketChannel.id}>` });

        // Log ticket creation
        if (guildT.log_channel) {
            const logCh = await interaction.guild.channels.fetch(guildT.log_channel).catch(() => null);
            if (logCh) {
                const logEmbed = cubEmbed()
                    .setColor(0x57F287)
                    .setTitle('Ticket Opened')
                    .addFields(
                        { name: 'Ticket', value: `#${ticketId} (${typeName})`, inline: true },
                        { name: 'User', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Channel', value: `<#${ticketChannel.id}>`, inline: true },
                    )
                    .setTimestamp();
                await logCh.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
    }

    // Ticket Claim Button
    else if (interaction.isButton() && interaction.customId === 'ticket_claim_btn') {
        const tData = loadTicketsData();
        const guildT = tData.guilds?.[interaction.guild.id];
        if (!guildT || !guildT.tickets[interaction.channel.id]) return interaction.reply({ content: 'Not a ticket.', ephemeral: true });

        const ticketInfo = guildT.tickets[interaction.channel.id];
        if (ticketInfo.claimed_by) {
            return interaction.reply({ content: `This ticket is already claimed by <@${ticketInfo.claimed_by}>.`, ephemeral: true });
        }

        ticketInfo.claimed_by = interaction.user.id;
        ticketInfo.claimed_at = Math.floor(Date.now() / 1000);
        saveTicketsData(tData);

        const typeName = (ticketInfo.type || 'support').split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        const claimEmbed = cubEmbed()
            .setColor(0x57F287)
            .setDescription(`**${typeName} Ticket #${ticketInfo.id}** has been claimed by <@${interaction.user.id}>`)
            .setTimestamp();

        // Update the original message to show claimed state
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('ticket_claim_btn').setLabel(`Claimed by ${interaction.user.displayName || interaction.user.username}`).setStyle(ButtonStyle.Success).setEmoji('✅').setDisabled(true),
            new ButtonBuilder().setCustomId('ticket_close_btn').setLabel('Close Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
        );

        await interaction.message.edit({ components: [row] }).catch(() => {});
        await interaction.reply({ embeds: [claimEmbed] });

        // Log ticket claim
        if (guildT.log_channel) {
            const logCh = await interaction.guild.channels.fetch(guildT.log_channel).catch(() => null);
            if (logCh) {
                const logEmbed = cubEmbed()
                    .setColor(0xFAA61A)
                    .setTitle('Ticket Claimed')
                    .addFields(
                        { name: 'Ticket', value: `#${ticketInfo.id} (${typeName})`, inline: true },
                        { name: 'Claimed By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Channel', value: `<#${interaction.channel.id}>`, inline: true },
                    )
                    .setTimestamp();
                await logCh.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
    }

    // Ticket Close Button
    else if (interaction.isButton() && interaction.customId === 'ticket_close_btn') {
        const tData = loadTicketsData();
        const guildT = tData.guilds[interaction.guild.id];
        if (!guildT || !guildT.tickets[interaction.channel.id]) return interaction.reply({ content: 'Not a ticket.', ephemeral: true });

        const ticketInfo = guildT.tickets[interaction.channel.id];
        const ticketType = ticketInfo.type || 'support';

        // Find closed_category_id and close_message for this ticket type from panel config
        let closedCategoryId = null;
        let closeMessage = '';
        for (const panel of (guildT.panels || [])) {
            const btn = (panel.buttons || []).find(b => b.type_id === ticketType);
            if (btn) {
                if (btn.closed_category_id) closedCategoryId = btn.closed_category_id;
                if (btn.close_message) closeMessage = btn.close_message;
                break;
            }
        }

        await interaction.reply({ content: 'Closing ticket in 5 seconds...' });

        // Generate transcript
        const messages = await interaction.channel.messages.fetch({ limit: 100 });
        const transcript = messages.reverse().map(m => `[${m.createdAt.toISOString()}] ${m.author.tag}: ${m.content || '[embed/attachment]'}`).join('\n');

        // Send transcript if configured
        if (guildT.transcript_channel) {
            const tCh = await interaction.guild.channels.fetch(guildT.transcript_channel).catch(() => null);
            if (tCh) {
                const typeName = ticketType.charAt(0).toUpperCase() + ticketType.slice(1).replace(/-/g, ' ');
                const embed = cubEmbed()
                    .setColor(0xED4245)
                    .setTitle(`${typeName} Ticket #${ticketInfo.id} Closed`)
                    .addFields(
                        { name: 'Opened By', value: `<@${ticketInfo.creator_id}>`, inline: true },
                        { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                        { name: 'Type', value: typeName, inline: true },
                    )
                    .setTimestamp();
                if (ticketInfo.claimed_by) {
                    embed.addFields({ name: 'Claimed By', value: `<@${ticketInfo.claimed_by}>`, inline: true });
                }
                await tCh.send({ embeds: [embed], files: [{ attachment: Buffer.from(transcript, 'utf-8'), name: `ticket-${ticketInfo.id}.txt` }] }).catch(() => {});
            }
        }

        delete guildT.tickets[interaction.channel.id];
        saveTicketsData(tData);

        // Log ticket close
        if (guildT.log_channel) {
            const logCh = await interaction.guild.channels.fetch(guildT.log_channel).catch(() => null);
            if (logCh) {
                const typeName2 = ticketType.charAt(0).toUpperCase() + ticketType.slice(1).replace(/-/g, ' ');
                const logEmbed = cubEmbed()
                    .setColor(0xED4245)
                    .setTitle('Ticket Closed')
                    .addFields(
                        { name: 'Ticket', value: `#${ticketInfo.id} (${typeName2})`, inline: true },
                        { name: 'Opened By', value: `<@${ticketInfo.creator_id}>`, inline: true },
                        { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                    )
                    .setTimestamp();
                if (ticketInfo.claimed_by) {
                    logEmbed.addFields({ name: 'Claimed By', value: `<@${ticketInfo.claimed_by}>`, inline: true });
                }
                await logCh.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }

        setTimeout(async () => {
            if (closedCategoryId) {
                // Move to closed category and lock the channel instead of deleting
                try {
                    await interaction.channel.setParent(closedCategoryId, { lockPermissions: false });
                    await interaction.channel.permissionOverwrites.edit(interaction.guild.id, { ViewChannel: false });
                    // Remove the creator's ability to send messages
                    await interaction.channel.permissionOverwrites.edit(ticketInfo.creator_id, { SendMessages: false }).catch(() => {});
                    const closedName = `closed-${interaction.channel.name}`;
                    await interaction.channel.setName(closedName).catch(() => {});
                    const closedDesc = closeMessage || 'This ticket has been closed and archived.';
                    const closedEmbed = cubEmbed()
                        .setColor(0xED4245)
                        .setDescription(closedDesc)
                        .setTimestamp();
                    const deleteRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('ticket_delete_btn').setLabel('Delete Ticket').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
                        new ButtonBuilder().setCustomId('ticket_reopen_btn').setLabel('Reopen Ticket').setStyle(ButtonStyle.Success).setEmoji('🔓')
                    );
                    await interaction.channel.send({ embeds: [closedEmbed], components: [deleteRow] }).catch(() => {});
                } catch (e) {
                    // If move fails, delete the channel
                    interaction.channel.delete('Ticket closed').catch(() => {});
                }
            } else {
                interaction.channel.delete('Ticket closed').catch(() => {});
            }
        }, 5000);
    }

    // Ticket Delete Button (for closed/archived tickets)
    else if (interaction.isButton() && interaction.customId === 'ticket_delete_btn') {
        await interaction.reply({ content: 'Deleting ticket channel...' });
        setTimeout(() => interaction.channel.delete('Ticket deleted').catch(() => {}), 2000);
    }

    // Ticket Reopen Button
    else if (interaction.isButton() && interaction.customId === 'ticket_reopen_btn') {
        const tData = loadTicketsData();
        const guildT = tData.guilds?.[interaction.guild.id];
        if (!guildT) return interaction.reply({ content: 'Ticket system not configured.', ephemeral: true });

        // Find the original ticket type from channel name (closed-TYPE-ticket-N)
        const channelName = interaction.channel.name;
        const typeMatch = channelName.match(/^closed-(.+)-ticket-\d+$/);
        const ticketType = typeMatch ? typeMatch[1] : 'support';

        // Find the open category for this type
        let categoryId = null;
        for (const panel of (guildT.panels || [])) {
            const btn = (panel.buttons || []).find(b => b.type_id === ticketType);
            if (btn && btn.category_id) {
                categoryId = btn.category_id;
                break;
            }
        }

        // Re-register the ticket
        const ticketId = guildT.next_ticket_id++;
        guildT.tickets[interaction.channel.id] = { id: ticketId, creator_id: interaction.user.id, created_at: Math.floor(Date.now() / 1000), type: ticketType };
        saveTicketsData(tData);

        // Move back to open category and rename
        const newName = `${ticketType}-ticket-${ticketId}`;
        try {
            await interaction.channel.setName(newName);
            if (categoryId) await interaction.channel.setParent(categoryId, { lockPermissions: false });
            // Re-enable sending for the user
            await interaction.channel.permissionOverwrites.edit(interaction.user.id, { ViewChannel: true, SendMessages: true }).catch(() => {});
        } catch (e) { /* ignore */ }

        const reopenEmbed = cubEmbed()
            .setColor(0x57F287)
            .setDescription(`This ticket has been reopened by <@${interaction.user.id}>.`)
            .setTimestamp();
        await interaction.message.edit({ components: [] }).catch(() => {});
        await interaction.reply({ embeds: [reopenEmbed] });
    }

    // Giveaway Enter Button
    else if (interaction.isButton() && interaction.customId === 'giveaway_enter') {
        const gData = loadGiveawaysData();
        const giveaway = gData.guilds[interaction.guild.id]?.find(g => g.message_id === interaction.message.id && !g.ended);

        if (!giveaway) return interaction.reply({ content: 'This giveaway has ended.', ephemeral: true });

        // Check required role
        if (giveaway.required_role && !interaction.member.roles.cache.has(giveaway.required_role)) {
            return interaction.reply({ content: `You need the <@&${giveaway.required_role}> role to enter.`, ephemeral: true });
        }

        // Check blacklisted roles
        if (giveaway.blacklisted_roles && giveaway.blacklisted_roles.length > 0) {
            const hasBlacklisted = giveaway.blacklisted_roles.some(rid => interaction.member.roles.cache.has(rid));
            if (hasBlacklisted) {
                return interaction.reply({ content: 'You have a role that prevents you from entering this giveaway.', ephemeral: true });
            }
        }

        // Check max entries
        const uniqueEntries = [...new Set(giveaway.entries)];
        if (giveaway.max_entries > 0 && uniqueEntries.length >= giveaway.max_entries && !giveaway.entries.includes(interaction.user.id)) {
            return interaction.reply({ content: 'This giveaway has reached the maximum number of entries.', ephemeral: true });
        }

        // Toggle entry
        if (giveaway.entries.includes(interaction.user.id)) {
            // Remove all entries for this user (including bonus)
            giveaway.entries = giveaway.entries.filter(e => e !== interaction.user.id);
            saveGiveawaysData(gData);
            return interaction.reply({ content: 'You left the giveaway.', ephemeral: true });
        }

        // Add entry + bonus entries
        giveaway.entries.push(interaction.user.id);
        if (giveaway.bonus_role && interaction.member.roles.cache.has(giveaway.bonus_role)) {
            const bonusCount = giveaway.bonus_entries || 2;
            for (let i = 0; i < bonusCount; i++) {
                giveaway.entries.push(interaction.user.id);
            }
        }
        saveGiveawaysData(gData);

        const totalUniqueEntries = [...new Set(giveaway.entries)].length;
        const userEntries = giveaway.entries.filter(e => e === interaction.user.id).length;
        const bonusMsg = userEntries > 1 ? ` (${userEntries} entries with bonus!)` : '';
        await interaction.reply({ content: `You entered the giveaway!${bonusMsg} (${totalUniqueEntries} total participants)`, ephemeral: true });
    }

    // Verification Button
    else if (interaction.isButton() && interaction.customId === 'verify_btn') {
        try {
            let vData = {};
            try { vData = JSON.parse(fs.readFileSync(VERIFICATION_FILE, 'utf8')); } catch (e) {}
            const guildSettings = vData.guilds?.[interaction.guild.id]?.settings;
            if (!guildSettings || !guildSettings.enabled) {
                return interaction.reply({ content: 'Verification is not enabled on this server.', ephemeral: true });
            }
            const verifiedRoleId = guildSettings.role;
            const unverifiedRoleId = guildSettings.unverified_role;
            if (!verifiedRoleId) {
                return interaction.reply({ content: 'No verified role has been configured.', ephemeral: true });
            }
            if (interaction.member.roles.cache.has(verifiedRoleId)) {
                return interaction.reply({ content: 'You are already verified!', ephemeral: true });
            }
            await interaction.member.roles.add(verifiedRoleId).catch(() => {});
            if (unverifiedRoleId) {
                await interaction.member.roles.remove(unverifiedRoleId).catch(() => {});
            }
            await interaction.reply({ content: 'You have been verified! Welcome to the server.', ephemeral: true });

            // Log verification if configured
            if (guildSettings.log && guildSettings.log_channel) {
                const logChannel = interaction.guild.channels.cache.get(guildSettings.log_channel);
                if (logChannel) {
                    const embed = cubEmbed()
                        .setColor(0x57F287)
                        .setTitle('Member Verified')
                        .setDescription(`${interaction.user} has been verified.`)
                        .setTimestamp();
                    logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        } catch (e) {
            await interaction.reply({ content: 'Verification failed. Please contact an admin.', ephemeral: true });
        }
    }

    // ==================== MODMAIL CONTACT BUTTON ====================
    else if (interaction.isButton() && interaction.customId === 'modmail_contact') {
        try {
            const mmData = loadModmailData();
            const guildMM = mmData.guilds?.[interaction.guild.id]?.settings;
            if (!guildMM || !guildMM.enabled) {
                return interaction.reply({ content: 'Modmail is not enabled on this server.', ephemeral: true });
            }

            // Check if user already has an open modmail thread
            const threads = mmData.guilds[interaction.guild.id].threads || {};
            const existingThread = Object.entries(threads).find(([, t]) => t.user_id === interaction.user.id && t.status === 'open');
            if (existingThread) {
                return interaction.reply({ content: `You already have an open modmail thread. Please wait for staff to respond or for your current thread to be closed.`, ephemeral: true });
            }

            // Create modmail channel in the configured category
            const permissionOverwrites = [
                { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: CLIENT_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.EmbedLinks] },
            ];
            if (guildMM.staff_role) {
                permissionOverwrites.push({ id: guildMM.staff_role, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
            }

            const createOpts = {
                name: `modmail-${interaction.user.username}`.substring(0, 100),
                type: ChannelType.GuildText,
                permissionOverwrites,
                topic: `Modmail thread for ${interaction.user.tag} (${interaction.user.id})`,
            };
            if (guildMM.category) createOpts.parent = guildMM.category;

            const mmChannel = await interaction.guild.channels.create(createOpts);

            // Store thread data
            if (!mmData.guilds[interaction.guild.id].threads) mmData.guilds[interaction.guild.id].threads = {};
            mmData.guilds[interaction.guild.id].threads[mmChannel.id] = {
                user_id: interaction.user.id,
                user_tag: interaction.user.tag,
                guild_id: interaction.guild.id,
                channel_id: mmChannel.id,
                status: 'open',
                created_at: Date.now(),
                messages: [],
            };
            saveModmailData(mmData);

            // Send welcome embed in the modmail channel
            const nzTime = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' });
            const welcomeEmbed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle('New Modmail Thread')
                .setDescription(`**User:** ${interaction.user} (${interaction.user.tag})\n**ID:** ${interaction.user.id}\n**Opened:** ${nzTime} (NZT)`)
                .setThumbnail(interaction.user.displayAvatarURL({ size: 256 }))
                .setFooter({ text: 'CUB PROTECTOR Modmail' });

            const closeRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('modmail_close').setLabel('Close Thread').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            const staffPing = guildMM.staff_role ? `<@&${guildMM.staff_role}>` : '';
            await mmChannel.send({ content: staffPing || undefined, embeds: [welcomeEmbed], components: [closeRow] });

            // DM the user with welcome message
            const welcomeMsg = guildMM.welcome_msg || 'Thanks for reaching out! A staff member will get back to you shortly. Any messages you send here will be forwarded to the staff team.';
            const dmEmbed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(`Modmail - ${interaction.guild.name}`)
                .setDescription(welcomeMsg)
                .setFooter({ text: 'Reply to this DM to send messages to staff' });
            await interaction.user.send({ embeds: [dmEmbed] }).catch(() => {});

            await interaction.reply({ content: 'Your modmail thread has been created! Check your DMs to communicate with staff.', ephemeral: true });
        } catch (e) {
            console.error('Modmail contact error:', e);
            await interaction.reply({ content: 'Failed to create modmail thread. Please try again later.', ephemeral: true }).catch(() => {});
        }
    }

    // ==================== MODMAIL CLOSE BUTTON ====================
    else if (interaction.isButton() && interaction.customId === 'modmail_close') {
        try {
            const mmData = loadModmailData();
            // Find the thread for this channel
            let threadGuildId = null;
            let threadInfo = null;
            for (const [gId, guildData] of Object.entries(mmData.guilds || {})) {
                if (guildData.threads?.[interaction.channel.id]) {
                    threadGuildId = gId;
                    threadInfo = guildData.threads[interaction.channel.id];
                    break;
                }
            }
            if (!threadInfo || threadInfo.status !== 'open') {
                return interaction.reply({ content: 'This is not an active modmail thread.', ephemeral: true });
            }

            const guildMM = mmData.guilds[threadGuildId]?.settings || {};
            const closeMsg = guildMM.close_msg || 'Your modmail thread has been closed. If you need further assistance, feel free to open a new one.';

            // DM the user that thread is closed
            try {
                const user = await client.users.fetch(threadInfo.user_id);
                const closeEmbed = cubEmbed()
                    .setColor(0xED4245)
                    .setTitle('Modmail Closed')
                    .setDescription(closeMsg)
                    .setFooter({ text: interaction.guild.name });
                await user.send({ embeds: [closeEmbed] });
            } catch (e) {}

            // Log transcript if enabled
            if (guildMM.log_transcripts && guildMM.transcript_channel) {
                const transcriptChannel = await interaction.guild.channels.fetch(guildMM.transcript_channel).catch(() => null);
                if (transcriptChannel && threadInfo.messages.length > 0) {
                    const nzTime = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' });
                    const transcript = threadInfo.messages.map(m => {
                        const time = new Date(m.timestamp).toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', timeStyle: 'short', dateStyle: 'short' });
                        return `[${time}] ${m.author}: ${m.content}`;
                    }).join('\n');

                    const transcriptEmbed = cubEmbed()
                        .setColor(0x5865F2)
                        .setTitle(`Modmail Transcript - ${threadInfo.user_tag}`)
                        .setDescription(transcript.substring(0, 4000) || 'No messages.')
                        .addFields(
                            { name: 'User', value: `<@${threadInfo.user_id}>`, inline: true },
                            { name: 'Closed By', value: `<@${interaction.user.id}>`, inline: true },
                            { name: 'Closed At', value: nzTime + ' (NZT)', inline: true },
                        )
                        .setFooter({ text: 'CUB PROTECTOR Modmail' });
                    await transcriptChannel.send({ embeds: [transcriptEmbed] }).catch(() => {});
                }
            }

            // Mark as closed
            threadInfo.status = 'closed';
            threadInfo.closed_at = Date.now();
            threadInfo.closed_by = interaction.user.id;
            saveModmailData(mmData);

            const nzTime = new Date().toLocaleString('en-NZ', { timeZone: 'Pacific/Auckland', dateStyle: 'medium', timeStyle: 'short' });
            const closedEmbed = cubEmbed()
                .setColor(0xED4245)
                .setTitle('Thread Closed')
                .setDescription(`Closed by <@${interaction.user.id}> at ${nzTime} (NZT)`)
                .setFooter({ text: 'This channel will be deleted in 10 seconds' });

            await interaction.update({ embeds: [closedEmbed], components: [] });

            // Delete channel after 10 seconds
            setTimeout(async () => {
                await interaction.channel.delete().catch(() => {});
            }, 10000);
        } catch (e) {
            console.error('Modmail close error:', e);
            await interaction.reply({ content: 'Failed to close modmail thread.', ephemeral: true }).catch(() => {});
        }
    }

    // ---- Ban Appeal Approve/Decline ----
    else if (interaction.isButton() && (interaction.customId.startsWith('appeal_approve_') || interaction.customId.startsWith('appeal_decline_'))) {
        try {
            const parts = interaction.customId.split('_');
            const action = parts[1]; // 'approve' or 'decline'
            const appealId = parts[2];
            const guildId = parts[3];
            const userId = parts[4];

            if (interaction.guild.id !== guildId) {
                return interaction.reply({ content: 'This appeal is for a different server.', ephemeral: true });
            }

            // Load ban appeals data
            const appealsPath = path.join(__dirname, 'data', 'ban_appeals.json');
            let appealsData = {};
            try { appealsData = JSON.parse(fs.readFileSync(appealsPath, 'utf-8')); } catch (e) { appealsData = { guilds: {} }; }
            const guildAppeals = appealsData.guilds?.[guildId] || { settings: {}, items: [] };
            const appeal = guildAppeals.items?.find(a => a.id === appealId);

            if (!appeal) {
                return interaction.reply({ content: 'Appeal not found.', ephemeral: true });
            }

            if (appeal.status !== 'pending') {
                return interaction.reply({ content: `This appeal has already been ${appeal.status}.`, ephemeral: true });
            }

            // Update appeal status
            appeal.status = action === 'approve' ? 'approved' : 'declined';
            appeal.reviewed_at = Math.floor(Date.now() / 1000);
            appeal.reviewed_by = interaction.user.id;

            // Save
            if (!appealsData.guilds) appealsData.guilds = {};
            if (!appealsData.guilds[guildId]) appealsData.guilds[guildId] = { settings: {}, items: [] };
            appealsData.guilds[guildId] = guildAppeals;
            fs.writeFileSync(appealsPath, JSON.stringify(appealsData, null, 2));

            const dmUser = guildAppeals.settings?.dm_user !== false;

            if (action === 'approve') {
                // Unban the user
                try {
                    await interaction.guild.members.unban(userId, 'Ban appeal approved');
                } catch (e) {
                    console.error('Failed to unban:', e);
                }

                // DM the user
                if (dmUser) {
                    try {
                        const user = await client.users.fetch(userId);
                        const approveEmbed = cubEmbed()
                            .setColor(0x57F287)
                            .setTitle('Ban Appeal Approved')
                            .setDescription(`Your ban appeal for **${interaction.guild.name}** has been **approved**! You have been unbanned and can rejoin the server.`)
                            .setFooter({ text: 'Please follow the server rules to avoid future bans.' });
                        await user.send({ embeds: [approveEmbed] });
                    } catch (e) {}
                }

                // Update the message
                const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0x57F287)
                    .setTitle('Ban Appeal — APPROVED')
                    .addFields({ name: 'Reviewed By', value: `<@${interaction.user.id}>`, inline: true });
                await interaction.update({ embeds: [approvedEmbed], components: [] });
            } else {
                // DM the user about decline
                if (dmUser) {
                    try {
                        const user = await client.users.fetch(userId);
                        const declineEmbed = cubEmbed()
                            .setColor(0xED4245)
                            .setTitle('Ban Appeal Declined')
                            .setDescription(`Your ban appeal for **${interaction.guild.name}** has been **declined**.`);
                        await user.send({ embeds: [declineEmbed] });
                    } catch (e) {}
                }

                // Update the message
                const declinedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                    .setColor(0xED4245)
                    .setTitle('Ban Appeal — DECLINED')
                    .addFields({ name: 'Reviewed By', value: `<@${interaction.user.id}>`, inline: true });
                await interaction.update({ embeds: [declinedEmbed], components: [] });
            }
        } catch (e) {
            console.error('Appeal review error:', e);
            await interaction.reply({ content: 'Failed to process appeal.', ephemeral: true }).catch(() => {});
        }
    }

    // ==================== COUNTING CHANNEL ====================
    else if (commandName === 'counting') {
        const sub = interaction.options.getSubcommand();
        const cntData = loadCountingData();
        const cntGuild = getCountingGuild(cntData, guildId);
        if (sub === 'setup') {
            const channel = interaction.options.getChannel('channel');
            cntGuild.channel_id = channel.id;
            cntGuild.enabled = true;
            cntGuild.current_count = 0;
            cntGuild.last_user_id = null;
            if (!cntGuild.high_score) cntGuild.high_score = 0;
            saveCountingData(cntData);
            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('✅ Counting Channel Set Up')
                .setDescription(`The counting channel is now <#${channel.id}>.\n\nMembers must count sequentially starting from **1**. You can't count twice in a row — wrong numbers reset the count!`);
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'disable') {
            cntGuild.enabled = false;
            saveCountingData(cntData);
            await interaction.reply({ content: '✅ Counting channel disabled.', ephemeral: true });
        } else if (sub === 'score') {
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle('🔢 Counting Stats')
                .addFields(
                    { name: 'Current Count', value: `**${cntGuild.current_count || 0}**`, inline: true },
                    { name: 'High Score', value: `**${cntGuild.high_score || 0}**`, inline: true },
                    { name: 'Channel', value: cntGuild.channel_id ? `<#${cntGuild.channel_id}>` : 'Not set', inline: true },
                );
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'reset') {
            cntGuild.current_count = 0;
            cntGuild.last_user_id = null;
            saveCountingData(cntData);
            await interaction.reply({ content: '✅ Count has been reset to 0. Next number is **1**.', ephemeral: true });
        }
    }

    // ==================== QUOTE SYSTEM ====================
    else if (commandName === 'quote') {
        const sub = interaction.options.getSubcommand();
        const qData = loadQuotesData();
        const qGuild = getQuotesGuild(qData, guildId);
        if (sub === 'add') {
            const user = interaction.options.getUser('user');
            const content = interaction.options.getString('content');
            const quote = {
                id: qGuild.next_id++,
                content,
                author_id: user.id,
                author_name: user.username,
                added_by: interaction.user.id,
                timestamp: Math.floor(Date.now() / 1000),
            };
            qGuild.quotes.push(quote);
            saveQuotesData(qData);
            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('✅ Quote Added')
                .setDescription(`"${content}"`)
                .addFields(
                    { name: 'Author', value: `<@${user.id}>`, inline: true },
                    { name: 'Quote ID', value: `#${quote.id}`, inline: true },
                );
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'get') {
            const id = interaction.options.getInteger('id');
            const quote = qGuild.quotes.find(q => q.id === id);
            if (!quote) return interaction.reply({ content: `Quote #${id} not found.`, ephemeral: true });
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(`Quote #${quote.id}`)
                .setDescription(`"${quote.content}"`)
                .addFields(
                    { name: 'Author', value: `<@${quote.author_id}>`, inline: true },
                    { name: 'Added By', value: `<@${quote.added_by}>`, inline: true },
                    { name: 'Date', value: `<t:${quote.timestamp}:D>`, inline: true },
                );
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'random') {
            if (qGuild.quotes.length === 0) return interaction.reply({ content: 'No quotes yet! Use `/quote add` to add one.', ephemeral: true });
            const quote = qGuild.quotes[Math.floor(Math.random() * qGuild.quotes.length)];
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(`Quote #${quote.id}`)
                .setDescription(`"${quote.content}"`)
                .addFields(
                    { name: 'Author', value: `<@${quote.author_id}>`, inline: true },
                    { name: 'Date', value: `<t:${quote.timestamp}:D>`, inline: true },
                );
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'list') {
            if (qGuild.quotes.length === 0) return interaction.reply({ content: 'No quotes yet!', ephemeral: true });
            const recent = qGuild.quotes.slice(-10).reverse();
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(`📚 Quotes — ${guild.name}`)
                .setDescription(recent.map(q => `**#${q.id}** — "${q.content.substring(0, 60)}${q.content.length > 60 ? '...' : ''}" — <@${q.author_id}>`).join('\n'))
                .setFooter({ text: `${qGuild.quotes.length} total quotes • Showing last 10` });
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'delete') {
            const id = interaction.options.getInteger('id');
            const idx = qGuild.quotes.findIndex(q => q.id === id);
            if (idx === -1) return interaction.reply({ content: `Quote #${id} not found.`, ephemeral: true });
            const quote = qGuild.quotes[idx];
            if (quote.added_by !== interaction.user.id && !member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
                return interaction.reply({ content: 'You can only delete quotes you added, or you need Moderate Members permission.', ephemeral: true });
            }
            qGuild.quotes.splice(idx, 1);
            saveQuotesData(qData);
            await interaction.reply({ content: `✅ Quote #${id} deleted.`, ephemeral: true });
        } else if (sub === 'search') {
            const query = interaction.options.getString('query').toLowerCase();
            const results = qGuild.quotes.filter(q =>
                q.content.toLowerCase().includes(query) || q.author_name.toLowerCase().includes(query)
            ).slice(0, 10);
            if (results.length === 0) return interaction.reply({ content: `No quotes found matching "${query}".`, ephemeral: true });
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle(`🔍 Quote Search: "${query}"`)
                .setDescription(results.map(q => `**#${q.id}** — "${q.content.substring(0, 60)}${q.content.length > 60 ? '...' : ''}" — <@${q.author_id}>`).join('\n'))
                .setFooter({ text: `${results.length} result(s)` });
            await interaction.reply({ embeds: [embed] });
        }
    }

    // ==================== CONFESSION CHANNEL ====================
    else if (commandName === 'confession') {
        const sub = interaction.options.getSubcommand();
        const confData = loadConfessionsData();
        const confGuild = getConfessionsGuild(confData, guildId);
        if (sub === 'setup') {
            const channel = interaction.options.getChannel('channel');
            confGuild.channel_id = channel.id;
            confGuild.enabled = true;
            saveConfessionsData(confData);
            const embed = cubEmbed()
                .setColor(0x57F287)
                .setTitle('✅ Confession Channel Set Up')
                .setDescription(`Confessions will be posted anonymously in <#${channel.id}>.\n\nMembers can use \`/confess\` to submit a confession.`);
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'log') {
            const channel = interaction.options.getChannel('channel');
            confGuild.log_channel_id = channel.id;
            saveConfessionsData(confData);
            await interaction.reply({ content: `✅ Mod log set to <#${channel.id}>. Confession authors will only be visible there.`, ephemeral: true });
        } else if (sub === 'disable') {
            confGuild.enabled = false;
            saveConfessionsData(confData);
            await interaction.reply({ content: '✅ Confession channel disabled.', ephemeral: true });
        }
    }

    else if (commandName === 'confess') {
        const text = interaction.options.getString('text');
        const confData = loadConfessionsData();
        const confGuild = getConfessionsGuild(confData, guildId);
        if (!confGuild.enabled || !confGuild.channel_id) {
            return interaction.reply({ content: 'Confessions are not set up on this server.', ephemeral: true });
        }
        const channel = await guild.channels.fetch(confGuild.channel_id).catch(() => null);
        if (!channel) {
            return interaction.reply({ content: 'Confession channel not found. Ask an admin to run `/confession setup` again.', ephemeral: true });
        }
        const confId = confGuild.next_id++;
        saveConfessionsData(confData);
        const confEmbed = cubEmbed()
            .setColor(0x9B59B6)
            .setTitle(`🔒 Anonymous Confession #${confId}`)
            .setDescription(text)
            .setTimestamp();
        await channel.send({ embeds: [confEmbed] });
        if (confGuild.log_channel_id) {
            const logChannel = await guild.channels.fetch(confGuild.log_channel_id).catch(() => null);
            if (logChannel) {
                const logEmbed = cubEmbed()
                    .setColor(0xED4245)
                    .setTitle(`🔍 Confession #${confId} — Mod Log`)
                    .setDescription(text)
                    .addFields({ name: 'Submitted By', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: false })
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] }).catch(() => {});
            }
        }
        await interaction.reply({ content: '✅ Your confession has been posted anonymously!', ephemeral: true });
    }

    // ==================== COLOR ROLES ====================
    else if (commandName === 'color-roles') {
        const sub = interaction.options.getSubcommand();
        const rmData = loadRoleMenusData();
        const rmGuild = getRoleMenusGuild(rmData, guildId);
        if (sub === 'setup') {
            if (rmGuild.color_roles.colors.length === 0) {
                return interaction.reply({ content: '⚠️ No color presets yet. Use `/color-roles add` to add colors first.', ephemeral: true });
            }
            const channel = interaction.options.getChannel('channel');
            const colors = rmGuild.color_roles.colors.slice(0, 25);
            const embed = cubEmbed()
                .setColor(0x5865F2)
                .setTitle('🎨 Color Roles')
                .setDescription('Pick a color for your username! Select one from the menu below.\nSelecting your current color will remove it.');
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('color_role_select')
                .setPlaceholder('Choose a color...')
                .addOptions(colors.map(c => {
                    const opt = { label: c.name, value: c.role_id, description: c.hex };
                    if (c.emoji) opt.emoji = c.emoji;
                    return opt;
                }));
            const row = new ActionRowBuilder().addComponents(selectMenu);
            const msg = await channel.send({ embeds: [embed], components: [row] });
            rmGuild.color_roles.channel_id = channel.id;
            rmGuild.color_roles.message_id = msg.id;
            rmGuild.color_roles.enabled = true;
            saveRoleMenusData(rmData);
            await interaction.reply({ content: `✅ Color roles panel posted in <#${channel.id}>!`, ephemeral: true });
        } else if (sub === 'add') {
            const name = interaction.options.getString('name');
            const hex = interaction.options.getString('color');
            const emoji = interaction.options.getString('emoji');
            if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                return interaction.reply({ content: '⚠️ Invalid hex color. Use format `#FF0000`.', ephemeral: true });
            }
            if (rmGuild.color_roles.colors.find(c => c.name.toLowerCase() === name.toLowerCase())) {
                return interaction.reply({ content: `⚠️ A color named "${name}" already exists.`, ephemeral: true });
            }
            if (guild.roles.cache.size >= 250) {
                return interaction.reply({ content: '⚠️ This server is at the Discord role limit (250).', ephemeral: true });
            }
            const colorInt = parseInt(hex.replace('#', ''), 16);
            const role = await guild.roles.create({ name, color: colorInt, reason: `Color role added by ${interaction.user.tag}` }).catch(() => null);
            if (!role) return interaction.reply({ content: '❌ Failed to create the role. Check my permissions.', ephemeral: true });
            rmGuild.color_roles.colors.push({ name, hex, emoji: emoji || null, role_id: role.id });
            saveRoleMenusData(rmData);
            const embed = cubEmbed()
                .setColor(colorInt)
                .setTitle('✅ Color Preset Added')
                .addFields(
                    { name: 'Name', value: name, inline: true },
                    { name: 'Color', value: hex, inline: true },
                    { name: 'Role', value: `<@&${role.id}>`, inline: true },
                );
            await interaction.reply({ embeds: [embed] });
        } else if (sub === 'remove') {
            const name = interaction.options.getString('name');
            const idx = rmGuild.color_roles.colors.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
            if (idx === -1) return interaction.reply({ content: `Color "${name}" not found.`, ephemeral: true });
            const color = rmGuild.color_roles.colors[idx];
            const role = guild.roles.cache.get(color.role_id);
            if (role) await role.delete(`Color role removed by ${interaction.user.tag}`).catch(() => {});
            rmGuild.color_roles.colors.splice(idx, 1);
            saveRoleMenusData(rmData);
            await interaction.reply({ content: `✅ Color "${name}" removed.`, ephemeral: true });
        } else if (sub === 'disable') {
            rmGuild.color_roles.enabled = false;
            saveRoleMenusData(rmData);
            await interaction.reply({ content: '✅ Color roles disabled.', ephemeral: true });
        }
    }

    // ==================== SELF ROLES ====================
    else if (commandName === 'self-roles') {
        const sub = interaction.options.getSubcommand();
        const rmData = loadRoleMenusData();
        const rmGuild = getRoleMenusGuild(rmData, guildId);
        const selfRoles = rmGuild.self_roles;

        if (sub === 'setup') {
            const channel = interaction.options.getChannel('channel');
            selfRoles.channel_id = channel.id;
            selfRoles.enabled = true;
            saveRoleMenusData(rmData);
            await interaction.reply({ content: `✅ Self-roles channel set to <#${channel.id}>. Now use \`/self-roles preset\` to add preset categories, or \`/self-roles add-category\` for a custom one. Then use \`/self-roles post\` to publish the panel.`, ephemeral: true });
        }

        else if (sub === 'preset') {
            const presetKey = interaction.options.getString('name');
            const preset = SELF_ROLE_PRESETS[presetKey];
            if (!preset) return interaction.reply({ content: 'Invalid preset.', ephemeral: true });
            if (!selfRoles.channel_id) return interaction.reply({ content: 'Run `/self-roles setup` to set a channel first.', ephemeral: true });
            if (selfRoles.categories.find(c => c.preset === presetKey)) {
                return interaction.reply({ content: `The **${preset.name}** preset is already active.`, ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            // Create all roles for this preset
            const categoryRoles = [];
            for (const roleData of preset.roles) {
                const colorInt = roleData.color ? parseInt(roleData.color.replace('#', ''), 16) : 0x99AAB5;
                const role = await guild.roles.create({ name: roleData.label, color: colorInt, reason: `Self-role preset: ${preset.name}` }).catch(() => null);
                if (role) categoryRoles.push({ role_id: role.id, label: roleData.label, emoji: roleData.emoji || null });
            }
            const categoryId = `${presetKey}_${Date.now()}`;
            const channel = await guild.channels.fetch(selfRoles.channel_id).catch(() => null);
            const category = { id: categoryId, name: preset.name, description: preset.description, emoji: preset.emoji, preset: presetKey, roles: categoryRoles, message_id: null };
            if (channel) {
                const msg = await postSelfRolesCategory(guild, channel, category);
                if (msg) category.message_id = msg.id;
            }
            selfRoles.categories.push(category);
            saveRoleMenusData(rmData);
            await interaction.editReply({ content: `✅ **${preset.name}** preset added with ${categoryRoles.length} roles! Panel posted in <#${selfRoles.channel_id}>.` });
        }

        else if (sub === 'add-category') {
            const name = interaction.options.getString('name');
            const description = interaction.options.getString('description') || `Pick your ${name} role!`;
            const emoji = interaction.options.getString('emoji') || '🎭';
            if (!selfRoles.channel_id) return interaction.reply({ content: 'Run `/self-roles setup` to set a channel first.', ephemeral: true });
            if (selfRoles.categories.find(c => c.name.toLowerCase() === name.toLowerCase())) {
                return interaction.reply({ content: `A category named "${name}" already exists.`, ephemeral: true });
            }
            const categoryId = `custom_${Date.now()}`;
            selfRoles.categories.push({ id: categoryId, name, description, emoji, preset: null, roles: [], message_id: null });
            saveRoleMenusData(rmData);
            await interaction.reply({ content: `✅ Category **${name}** created. Use \`/self-roles add-role\` to add roles to it, then \`/self-roles post\` to publish.`, ephemeral: true });
        }

        else if (sub === 'remove-category') {
            const name = interaction.options.getString('name');
            const idx = selfRoles.categories.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
            if (idx === -1) return interaction.reply({ content: `Category "${name}" not found.`, ephemeral: true });
            const category = selfRoles.categories[idx];
            // Delete panel message if exists
            if (category.message_id && selfRoles.channel_id) {
                const channel = await guild.channels.fetch(selfRoles.channel_id).catch(() => null);
                if (channel) {
                    const msg = await channel.messages.fetch(category.message_id).catch(() => null);
                    if (msg) await msg.delete().catch(() => {});
                }
            }
            selfRoles.categories.splice(idx, 1);
            saveRoleMenusData(rmData);
            await interaction.reply({ content: `✅ Category **${name}** removed.`, ephemeral: true });
        }

        else if (sub === 'add-role') {
            const catName = interaction.options.getString('category');
            const role = interaction.options.getRole('role');
            const label = interaction.options.getString('label') || role.name;
            const emoji = interaction.options.getString('emoji');
            const category = selfRoles.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
            if (!category) return interaction.reply({ content: `Category "${catName}" not found.`, ephemeral: true });
            if (category.roles.find(r => r.role_id === role.id)) {
                return interaction.reply({ content: `${role.name} is already in this category.`, ephemeral: true });
            }
            if (category.roles.length >= 25) {
                return interaction.reply({ content: 'A category can have at most 25 roles (Discord limit).', ephemeral: true });
            }
            category.roles.push({ role_id: role.id, label, emoji: emoji || null });
            // Update panel message
            if (selfRoles.channel_id) {
                const channel = await guild.channels.fetch(selfRoles.channel_id).catch(() => null);
                if (channel) {
                    const msg = await postSelfRolesCategory(guild, channel, category);
                    if (msg) category.message_id = msg.id;
                }
            }
            saveRoleMenusData(rmData);
            await interaction.reply({ content: `✅ Added **${role.name}** to the **${category.name}** category.`, ephemeral: true });
        }

        else if (sub === 'remove-role') {
            const catName = interaction.options.getString('category');
            const role = interaction.options.getRole('role');
            const category = selfRoles.categories.find(c => c.name.toLowerCase() === catName.toLowerCase());
            if (!category) return interaction.reply({ content: `Category "${catName}" not found.`, ephemeral: true });
            const roleIdx = category.roles.findIndex(r => r.role_id === role.id);
            if (roleIdx === -1) return interaction.reply({ content: `${role.name} is not in this category.`, ephemeral: true });
            category.roles.splice(roleIdx, 1);
            if (selfRoles.channel_id) {
                const channel = await guild.channels.fetch(selfRoles.channel_id).catch(() => null);
                if (channel) await postSelfRolesCategory(guild, channel, category);
            }
            saveRoleMenusData(rmData);
            await interaction.reply({ content: `✅ Removed **${role.name}** from **${category.name}**.`, ephemeral: true });
        }

        else if (sub === 'post') {
            if (!selfRoles.channel_id) return interaction.reply({ content: 'Run `/self-roles setup` to set a channel first.', ephemeral: true });
            if (selfRoles.categories.length === 0) return interaction.reply({ content: 'No categories yet. Add some with `/self-roles preset` or `/self-roles add-category`.', ephemeral: true });
            await interaction.deferReply({ ephemeral: true });
            const channel = await guild.channels.fetch(selfRoles.channel_id).catch(() => null);
            if (!channel) return interaction.editReply({ content: 'Panel channel not found. Run `/self-roles setup` again.' });
            let posted = 0, failed = 0;
            const catsToPost = selfRoles.categories.filter(c => c.roles.length > 0);
            for (let i = 0; i < catsToPost.length; i++) {
                const category = catsToPost[i];
                if (i > 0) await new Promise(r => setTimeout(r, 1000));
                const msg = await postSelfRolesCategory(guild, channel, category);
                if (msg) { category.message_id = msg.id; posted++; }
                else failed++;
            }
            saveRoleMenusData(rmData);
            const failNote = failed > 0 ? ` (${failed} failed — check bot permissions)` : '';
            await interaction.editReply({ content: `✅ Self-roles panel updated — ${posted} categor${posted === 1 ? 'y' : 'ies'} posted in <#${selfRoles.channel_id}>${failNote}.` });
        }

        else if (sub === 'disable') {
            selfRoles.enabled = false;
            saveRoleMenusData(rmData);
            await interaction.reply({ content: '✅ Self-roles disabled.', ephemeral: true });
        }
    }

    // ==================== COLOR ROLE SELECT MENU ====================
    else if (interaction.isStringSelectMenu() && interaction.customId === 'color_role_select') {
        const rmData = loadRoleMenusData();
        const rmGuild = getRoleMenusGuild(rmData, interaction.guild.id);
        if (!rmGuild.color_roles.enabled) {
            return interaction.reply({ content: 'Color roles are no longer active on this server.', ephemeral: true });
        }
        const selectedRoleId = interaction.values[0];
        const colorData = rmGuild.color_roles.colors.find(c => c.role_id === selectedRoleId);
        if (!colorData) return interaction.reply({ content: 'That color no longer exists.', ephemeral: true });
        const allColorRoleIds = rmGuild.color_roles.colors.map(c => c.role_id);
        for (const rId of allColorRoleIds) {
            if (interaction.member.roles.cache.has(rId) && rId !== selectedRoleId) {
                await interaction.member.roles.remove(rId).catch(() => {});
            }
        }
        if (interaction.member.roles.cache.has(selectedRoleId)) {
            await interaction.member.roles.remove(selectedRoleId).catch(() => {});
            return interaction.reply({ content: `✅ Removed your **${colorData.name}** color.`, ephemeral: true });
        } else {
            await interaction.member.roles.add(selectedRoleId).catch(() => {});
            return interaction.reply({ content: `✅ You now have the **${colorData.name}** color!`, ephemeral: true });
        }
    }

    // ==================== SELF ROLE SELECT MENU ====================
    else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('self_role_select_')) {
        const categoryId = interaction.customId.replace('self_role_select_', '');
        const rmData = loadRoleMenusData();
        const rmGuild = getRoleMenusGuild(rmData, interaction.guild.id);
        const category = rmGuild.self_roles.categories.find(c => c.id === categoryId);
        if (!category) return interaction.reply({ content: 'This category no longer exists.', ephemeral: true });

        // Fetch member fresh to get accurate current role state
        const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => interaction.member);

        const selectedRoleIds = interaction.values;
        const categoryRoleIds = category.roles.map(r => r.role_id);

        const toRemove = categoryRoleIds.filter(id => member.roles.cache.has(id) && !selectedRoleIds.includes(id));
        const toAdd = selectedRoleIds.filter(id => !member.roles.cache.has(id));

        const failedAdd = [], failedRemove = [];
        for (const id of toRemove) {
            try { await member.roles.remove(id); }
            catch (e) { failedRemove.push(id); }
        }
        for (const id of toAdd) {
            try { await member.roles.add(id); }
            catch (e) { failedAdd.push(id); }
        }

        const successAdd = toAdd.filter(id => !failedAdd.includes(id));
        const successRemove = toRemove.filter(id => !failedRemove.includes(id));
        const added = successAdd.map(id => category.roles.find(r => r.role_id === id)?.label || id);
        const removed = successRemove.map(id => category.roles.find(r => r.role_id === id)?.label || id);

        let msg = '';
        if (added.length > 0) msg += `✅ Added: **${added.join(', ')}**\n`;
        if (removed.length > 0) msg += `🗑️ Removed: **${removed.join(', ')}**\n`;
        if (failedAdd.length > 0 || failedRemove.length > 0) msg += `⚠️ Some changes failed — the bot may be missing **Manage Roles** permission or the role may be above the bot in the role list.`;
        if (!msg) msg = 'No changes made.';

        return interaction.reply({ content: msg.trim(), ephemeral: true });
    }

    // ==================== PROFILE ====================
    else if (commandName === 'profile') {
        const sub = interaction.options.getSubcommand();
        const pData = loadProfilesData();
        const pGuild = getProfilesGuild(pData, guild.id);

        if (sub === 'view') {
            const target = interaction.options.getUser('user') || interaction.user;
            const member = await guild.members.fetch(target.id).catch(() => null);
            const profile = getUserProfile(pGuild, target.id);
            const repData = loadRepData();
            const repGuild = getRepGuild(repData, guild.id);
            const rep = repGuild.users[target.id]?.rep || 0;
            const relData = loadRelationshipsData();
            const relGuild = getRelationshipsGuild(relData, guild.id);
            const marriageKey = Object.keys(relGuild.relationships || {}).find(k => k.includes(target.id) && relGuild.relationships[k].type === 'married');
            const partnerId = marriageKey ? marriageKey.split(':').find(id => id !== target.id) : null;
            const friends = Object.values(relGuild.relationships || {}).filter(v => v.type === 'friend' && Object.keys(relGuild.relationships).find(k => k.includes(target.id) && relGuild.relationships[k] === v)).length;
            const embed = cubEmbed()
                .setColor(profile.color ? parseInt(profile.color.replace('#', ''), 16) : 0x5865F2)
                .setTitle(`${member?.displayName || target.username}'s Profile`)
                .setThumbnail(target.displayAvatarURL({ dynamic: true }));
            if (profile.bio) embed.setDescription(profile.bio);
            const fields = [{ name: '⭐ Reputation', value: `${rep}`, inline: true }];
            if (partnerId) fields.push({ name: '💍 Married to', value: `<@${partnerId}>`, inline: true });
            if (profile.mood) fields.push({ name: 'Mood', value: `${profile.mood}${profile.mood_text ? ` ${profile.mood_text}` : ''}`, inline: true });
            if (Object.keys(profile.links).length > 0) fields.push({ name: '🔗 Links', value: Object.entries(profile.links).map(([l, u]) => `[${l}](${u})`).join(' • ') });
            embed.addFields(fields);
            return interaction.reply({ embeds: [embed] });
        }
        if (sub === 'bio') {
            const text = interaction.options.getString('text') || null;
            getUserProfile(pGuild, interaction.user.id).bio = text;
            saveProfilesData(pData);
            return interaction.reply({ content: text ? '✅ Bio updated!' : '✅ Bio cleared.', ephemeral: true });
        }
        if (sub === 'color') {
            const hex = interaction.options.getString('hex');
            if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return interaction.reply({ content: '❌ Invalid hex color. Use `#RRGGBB`.', ephemeral: true });
            getUserProfile(pGuild, interaction.user.id).color = hex;
            saveProfilesData(pData);
            return interaction.reply({ content: `✅ Profile color set to \`${hex}\`.`, ephemeral: true });
        }
        if (sub === 'link') {
            const label = interaction.options.getString('label');
            const url = interaction.options.getString('url');
            if (!url.startsWith('http://') && !url.startsWith('https://')) return interaction.reply({ content: '❌ URL must start with http:// or https://', ephemeral: true });
            const profile = getUserProfile(pGuild, interaction.user.id);
            if (Object.keys(profile.links).length >= 5) return interaction.reply({ content: '❌ Max 5 links.', ephemeral: true });
            profile.links[label] = url;
            saveProfilesData(pData);
            return interaction.reply({ content: `✅ Added link **${label}**.`, ephemeral: true });
        }
        if (sub === 'unlink') {
            const label = interaction.options.getString('label');
            const profile = getUserProfile(pGuild, interaction.user.id);
            if (!profile.links[label]) return interaction.reply({ content: `❌ No link **${label}** found.`, ephemeral: true });
            delete profile.links[label];
            saveProfilesData(pData);
            return interaction.reply({ content: `✅ Removed link **${label}**.`, ephemeral: true });
        }
    }

    // ==================== REPUTATION ====================
    else if (commandName === 'rep') {
        const sub = interaction.options.getSubcommand();
        const repData = loadRepData();
        const repGuild = getRepGuild(repData, guild.id);
        if (sub === 'give') {
            const target = interaction.options.getUser('user');
            if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot rep yourself.', ephemeral: true });
            if (target.bot) return interaction.reply({ content: '❌ You cannot rep a bot.', ephemeral: true });
            const giver = getUserRep(repGuild, interaction.user.id);
            const cooldownHours = repGuild.cooldown_hours || 24;
            const lastGiven = giver.last_given[target.id] || 0;
            const msRemaining = (lastGiven + cooldownHours * 3600000) - Date.now();
            if (msRemaining > 0) return interaction.reply({ content: `❌ You can rep <@${target.id}> again in **${Math.ceil(msRemaining / 3600000)}h**.`, ephemeral: true });
            giver.last_given[target.id] = Date.now();
            const receiver = getUserRep(repGuild, target.id);
            receiver.rep += 1;
            saveRepData(repData);
            return interaction.reply({ embeds: [cubEmbed().setColor(0x57F287).setDescription(`👍 <@${interaction.user.id}> gave **+1 rep** to <@${target.id}>! They now have **${receiver.rep} rep**.`)] });
        }
        if (sub === 'view') {
            const target = interaction.options.getUser('user') || interaction.user;
            const r = getUserRep(repGuild, target.id);
            return interaction.reply({ embeds: [cubEmbed().setColor(0x5865F2).setTitle(`⭐ ${target.username}'s Rep`).setDescription(`**${r.rep}** reputation points`)] });
        }
        if (sub === 'leaderboard') {
            const sorted = Object.entries(repGuild.users).map(([id, v]) => ({ id, rep: v.rep || 0 })).filter(u => u.rep > 0).sort((a, b) => b.rep - a.rep).slice(0, 10);
            if (!sorted.length) return interaction.reply({ content: 'No rep recorded yet!', ephemeral: true });
            const embed = cubEmbed().setColor(0xFFD700).setTitle('⭐ Rep Leaderboard').setDescription(sorted.map((u, i) => `**${i + 1}.** <@${u.id}> — **${u.rep}** rep`).join('\n'));
            return interaction.reply({ embeds: [embed] });
        }
    }

    // ==================== PROPOSE / DIVORCE ====================
    else if (commandName === 'propose') {
        const target = interaction.options.getUser('user');
        if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot propose to yourself.', ephemeral: true });
        if (target.bot) return interaction.reply({ content: '❌ You cannot propose to a bot.', ephemeral: true });
        const relData = loadRelationshipsData();
        const relGuild = getRelationshipsGuild(relData, guild.id);
        const alreadyMarried = Object.entries(relGuild.relationships || {}).some(([k, v]) => v.type === 'married' && (k.includes(interaction.user.id) || k.includes(target.id)));
        if (alreadyMarried) return interaction.reply({ content: '❌ One of you is already married.', ephemeral: true });
        const propKey = [interaction.user.id, target.id].sort().join(':');
        if (relGuild.proposals[propKey]) return interaction.reply({ content: '❌ A proposal is already pending.', ephemeral: true });
        relGuild.proposals[propKey] = { proposer: interaction.user.id, ts: Date.now() };
        saveRelationshipsData(relData);
        const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`marry_accept:${propKey}`).setLabel('💍 Accept').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`marry_decline:${propKey}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger),
        );
        return interaction.reply({ embeds: [cubEmbed().setColor(0xFF69B4).setTitle('💍 Marriage Proposal!').setDescription(`<@${interaction.user.id}> is proposing to <@${target.id}>!\n\n<@${target.id}>, do you accept?`)], components: [row] });
    }

    else if (commandName === 'divorce') {
        const relData = loadRelationshipsData();
        const relGuild = getRelationshipsGuild(relData, guild.id);
        const marriageKey = Object.keys(relGuild.relationships || {}).find(k => k.includes(interaction.user.id) && relGuild.relationships[k].type === 'married');
        if (!marriageKey) return interaction.reply({ content: '❌ You are not married.', ephemeral: true });
        const partnerId = marriageKey.split(':').find(id => id !== interaction.user.id);
        delete relGuild.relationships[marriageKey];
        saveRelationshipsData(relData);
        return interaction.reply({ content: `💔 You have divorced <@${partnerId}>.` });
    }

    // ==================== FRIEND / UNFRIEND ====================
    else if (commandName === 'friend') {
        const target = interaction.options.getUser('user');
        if (target.id === interaction.user.id) return interaction.reply({ content: '❌ You cannot friend yourself.', ephemeral: true });
        if (target.bot) return interaction.reply({ content: '❌ You cannot friend a bot.', ephemeral: true });
        const relData = loadRelationshipsData();
        const relGuild = getRelationshipsGuild(relData, guild.id);
        const reqKey = [interaction.user.id, target.id].sort().join(':');
        if (relGuild.relationships?.[reqKey]) return interaction.reply({ content: '❌ You are already friends!', ephemeral: true });
        if (relGuild.friend_requests?.[reqKey]) return interaction.reply({ content: '❌ A friend request is already pending.', ephemeral: true });
        if (!relGuild.friend_requests) relGuild.friend_requests = {};
        relGuild.friend_requests[reqKey] = { sender: interaction.user.id, ts: Date.now() };
        saveRelationshipsData(relData);
        const { ActionRowBuilder: AR2, ButtonBuilder: BB2, ButtonStyle: BS2 } = require('discord.js');
        const row2 = new AR2().addComponents(
            new BB2().setCustomId(`friend_accept:${reqKey}`).setLabel('✅ Accept').setStyle(BS2.Success),
            new BB2().setCustomId(`friend_decline:${reqKey}`).setLabel('❌ Decline').setStyle(BS2.Danger),
        );
        return interaction.reply({ embeds: [cubEmbed().setColor(0x3498DB).setTitle('👥 Friend Request').setDescription(`<@${interaction.user.id}> wants to be friends with <@${target.id}>!\n\n<@${target.id}>, do you accept?`)], components: [row2] });
    }

    else if (commandName === 'unfriend') {
        const target = interaction.options.getUser('user');
        const relData = loadRelationshipsData();
        const relGuild = getRelationshipsGuild(relData, guild.id);
        const key = [interaction.user.id, target.id].sort().join(':');
        if (!relGuild.relationships?.[key] || relGuild.relationships[key].type !== 'friend') return interaction.reply({ content: '❌ You are not friends with that user.', ephemeral: true });
        delete relGuild.relationships[key];
        saveRelationshipsData(relData);
        return interaction.reply({ content: `✅ Removed <@${target.id}> from your friends.`, ephemeral: true });
    }

    // ==================== MOOD ====================
    else if (commandName === 'mood') {
        const sub = interaction.options.getSubcommand();
        const pData = loadProfilesData();
        const pGuild = getProfilesGuild(pData, guild.id);
        const profile = getUserProfile(pGuild, interaction.user.id);
        if (sub === 'set') {
            profile.mood = interaction.options.getString('emoji');
            profile.mood_text = interaction.options.getString('text') || null;
            saveProfilesData(pData);
            return interaction.reply({ content: `✅ Mood set to ${profile.mood}${profile.mood_text ? ` *${profile.mood_text}*` : ''}`, ephemeral: true });
        }
        if (sub === 'clear') {
            profile.mood = null; profile.mood_text = null;
            saveProfilesData(pData);
            return interaction.reply({ content: '✅ Mood cleared.', ephemeral: true });
        }
        if (sub === 'view') {
            if (!profile.mood) return interaction.reply({ content: 'No mood set. Use `/mood set` to set one.', ephemeral: true });
            return interaction.reply({ content: `Your mood: ${profile.mood}${profile.mood_text ? ` *${profile.mood_text}*` : ''}`, ephemeral: true });
        }
    }

    // ==================== TOURNAMENTS ====================
    else if (commandName === 'tournament') {
        const sub = interaction.options.getSubcommand();
        const tData = loadTournamentsData();
        const tGuild = getTournamentsGuild(tData, guild.id);
        if (sub === 'create') {
            const name = interaction.options.getString('name');
            const max = interaction.options.getInteger('max') || 16;
            const t = { id: tGuild.next_id++, name, max, status: 'open', participants: [], bracket: null, winner: null, created_by: interaction.user.id };
            tGuild.tournaments.push(t);
            saveTournamentsData(tData);
            return interaction.reply({ embeds: [cubEmbed().setColor(0xFFD700).setTitle(`🏆 ${name}`).setDescription(`**ID:** ${t.id} | **Max:** ${max}\nUse \`/tournament join id:${t.id}\` to enter!`)] });
        }
        if (sub === 'join') {
            const id = interaction.options.getInteger('id');
            const t = tGuild.tournaments.find(x => x.id === id);
            if (!t) return interaction.reply({ content: `❌ Tournament #${id} not found.`, ephemeral: true });
            if (t.status !== 'open') return interaction.reply({ content: '❌ Not open for joining.', ephemeral: true });
            if (t.participants.includes(interaction.user.id)) return interaction.reply({ content: '❌ Already in this tournament.', ephemeral: true });
            if (t.participants.length >= t.max) return interaction.reply({ content: '❌ Tournament is full.', ephemeral: true });
            t.participants.push(interaction.user.id);
            saveTournamentsData(tData);
            return interaction.reply({ content: `✅ Joined **${t.name}** (${t.participants.length}/${t.max}).` });
        }
        if (sub === 'start') {
            const id = interaction.options.getInteger('id');
            const t = tGuild.tournaments.find(x => x.id === id);
            if (!t || t.status !== 'open') return interaction.reply({ content: '❌ Tournament not found or not open.', ephemeral: true });
            if (t.participants.length < 2) return interaction.reply({ content: '❌ Need at least 2 participants.', ephemeral: true });
            const shuffled = [...t.participants].sort(() => Math.random() - 0.5);
            const matches = [];
            for (let i = 0; i < shuffled.length; i += 2) matches.push({ p1: shuffled[i], p2: shuffled[i + 1] || 'BYE', winner: shuffled[i + 1] ? null : shuffled[i] });
            t.bracket = { round: 1, matches };
            t.status = 'active';
            saveTournamentsData(tData);
            const lines = matches.map((m, i) => `Match ${i + 1}: <@${m.p1}> vs ${m.p2 === 'BYE' ? '**BYE**' : `<@${m.p2}>`}${m.winner ? ` → auto-advances` : ''}`);
            return interaction.reply({ embeds: [cubEmbed().setColor(0xFFD700).setTitle(`🏆 ${t.name} — Round 1`).setDescription(lines.join('\n') + `\n\nUse \`/tournament advance\` to record results.`)] });
        }
        if (sub === 'advance') {
            const id = interaction.options.getInteger('id');
            const winner = interaction.options.getUser('winner');
            const t = tGuild.tournaments.find(x => x.id === id);
            if (!t || t.status !== 'active') return interaction.reply({ content: '❌ Tournament not found or not active.', ephemeral: true });
            const match = t.bracket.matches.find(m => (m.p1 === winner.id || m.p2 === winner.id) && m.winner === null);
            if (!match) return interaction.reply({ content: `❌ No pending match for <@${winner.id}>.`, ephemeral: true });
            match.winner = winner.id;
            const pending = t.bracket.matches.filter(m => m.winner === null);
            if (pending.length === 0) {
                const nextPlayers = t.bracket.matches.map(m => m.winner).filter(Boolean);
                if (nextPlayers.length === 1) {
                    t.status = 'ended'; t.winner = nextPlayers[0];
                    saveTournamentsData(tData);
                    return interaction.reply({ content: `🏆 **${t.name}** is over! Winner: <@${nextPlayers[0]}>! 🎉` });
                }
                const nextMatches = [];
                for (let i = 0; i < nextPlayers.length; i += 2) nextMatches.push({ p1: nextPlayers[i], p2: nextPlayers[i + 1] || 'BYE', winner: nextPlayers[i + 1] ? null : nextPlayers[i] });
                t.bracket = { round: t.bracket.round + 1, matches: nextMatches };
                saveTournamentsData(tData);
                const lines2 = nextMatches.map((m, i) => `Match ${i + 1}: <@${m.p1}> vs ${m.p2 === 'BYE' ? '**BYE**' : `<@${m.p2}>`}`);
                return interaction.reply({ embeds: [cubEmbed().setColor(0xFFD700).setTitle(`🏆 ${t.name} — Round ${t.bracket.round}`).setDescription(lines2.join('\n'))] });
            }
            saveTournamentsData(tData);
            return interaction.reply({ content: `✅ <@${winner.id}> advances! ${pending.length} match(es) remaining.` });
        }
        if (sub === 'info') {
            const id = interaction.options.getInteger('id');
            const t = tGuild.tournaments.find(x => x.id === id);
            if (!t) return interaction.reply({ content: `❌ Tournament #${id} not found.`, ephemeral: true });
            const embed = cubEmbed().setColor(0xFFD700).setTitle(`🏆 ${t.name}`)
                .addFields({ name: 'Status', value: t.status, inline: true }, { name: 'Participants', value: `${t.participants.length}/${t.max}`, inline: true });
            if (t.winner) embed.addFields({ name: 'Winner', value: `<@${t.winner}>` });
            return interaction.reply({ embeds: [embed] });
        }
        if (sub === 'end') {
            const id = interaction.options.getInteger('id');
            const t = tGuild.tournaments.find(x => x.id === id);
            if (!t) return interaction.reply({ content: `❌ Tournament #${id} not found.`, ephemeral: true });
            t.status = 'ended';
            saveTournamentsData(tData);
            return interaction.reply({ content: `✅ Tournament **${t.name}** ended.` });
        }
        if (sub === 'list') {
            const list = tGuild.tournaments.slice(-10);
            if (!list.length) return interaction.reply({ content: 'No tournaments yet.', ephemeral: true });
            return interaction.reply({ embeds: [cubEmbed().setColor(0xFFD700).setTitle('🏆 Tournaments').setDescription(list.map(t => `**#${t.id}** ${t.name} — \`${t.status}\` (${t.participants.length}/${t.max})`).join('\n'))] });
        }
    }

    // ==================== REDDIT FEED ====================
    else if (commandName === 'reddit-feed') {
        const sub = interaction.options.getSubcommand();
        const fData = loadFeedsData();
        const fGuild = getFeedsGuild(fData, guild.id);
        if (sub === 'add') {
            const subr = interaction.options.getString('subreddit').replace(/^r\//i, '');
            const channel = interaction.options.getChannel('channel');
            const type = interaction.options.getString('type') || 'hot';
            if (fGuild.reddit.length >= 10) return interaction.reply({ content: '❌ Max 10 Reddit feeds.', ephemeral: true });
            if (fGuild.reddit.find(f => f.subreddit.toLowerCase() === subr.toLowerCase())) return interaction.reply({ content: `❌ r/${subr} is already tracked.`, ephemeral: true });
            fGuild.reddit.push({ id: Date.now(), subreddit: subr, channel_id: channel.id, type, last_id: null });
            saveFeedsData(fData);
            return interaction.reply({ content: `✅ Now posting **r/${subr}** (${type}) to <#${channel.id}>.` });
        }
        if (sub === 'remove') {
            const subr = interaction.options.getString('subreddit').replace(/^r\//i, '');
            const idx = fGuild.reddit.findIndex(f => f.subreddit.toLowerCase() === subr.toLowerCase());
            if (idx === -1) return interaction.reply({ content: `❌ r/${subr} not tracked.`, ephemeral: true });
            fGuild.reddit.splice(idx, 1);
            saveFeedsData(fData);
            return interaction.reply({ content: `✅ Removed Reddit feed for r/${subr}.`, ephemeral: true });
        }
        if (sub === 'list') {
            if (!fGuild.reddit.length) return interaction.reply({ content: 'No Reddit feeds configured.', ephemeral: true });
            return interaction.reply({ content: `**Reddit Feeds:**\n${fGuild.reddit.map(f => `• **r/${f.subreddit}** (${f.type}) → <#${f.channel_id}>`).join('\n')}`, ephemeral: true });
        }
    }

    // ==================== NEWS FEED ====================
    else if (commandName === 'news-feed') {
        const sub = interaction.options.getSubcommand();
        const fData = loadFeedsData();
        const fGuild = getFeedsGuild(fData, guild.id);
        if (sub === 'add') {
            const url = interaction.options.getString('url');
            const channel = interaction.options.getChannel('channel');
            const name = interaction.options.getString('name') || url.substring(0, 40);
            if (!url.startsWith('http')) return interaction.reply({ content: '❌ Invalid URL.', ephemeral: true });
            if (fGuild.news.length >= 10) return interaction.reply({ content: '❌ Max 10 news feeds.', ephemeral: true });
            fGuild.news.push({ id: Date.now(), name, url, channel_id: channel.id, last_link: null });
            saveFeedsData(fData);
            return interaction.reply({ content: `✅ Added news feed **${name}** → <#${channel.id}>.` });
        }
        if (sub === 'remove') {
            const name = interaction.options.getString('name');
            const idx = fGuild.news.findIndex(f => f.name.toLowerCase() === name.toLowerCase());
            if (idx === -1) return interaction.reply({ content: `❌ Feed "${name}" not found.`, ephemeral: true });
            fGuild.news.splice(idx, 1);
            saveFeedsData(fData);
            return interaction.reply({ content: `✅ Removed news feed **${name}**.`, ephemeral: true });
        }
        if (sub === 'list') {
            if (!fGuild.news.length) return interaction.reply({ content: 'No news feeds configured.', ephemeral: true });
            return interaction.reply({ content: `**News Feeds:**\n${fGuild.news.map(f => `• **${f.name}** → <#${f.channel_id}>`).join('\n')}`, ephemeral: true });
        }
    }

    // ==================== MEME OF THE DAY ====================
    else if (commandName === 'meme-of-day') {
        const sub = interaction.options.getSubcommand();
        const fData = loadFeedsData();
        const fGuild = getFeedsGuild(fData, guild.id);
        if (sub === 'setup') {
            fGuild.meme_of_day = interaction.options.getChannel('channel').id;
            saveFeedsData(fData);
            return interaction.reply({ content: `✅ Meme of the Day will post to <#${fGuild.meme_of_day}> daily.` });
        }
        if (sub === 'disable') {
            fGuild.meme_of_day = null; fGuild.last_meme_date = null;
            saveFeedsData(fData);
            return interaction.reply({ content: '✅ Meme of the Day disabled.', ephemeral: true });
        }
    }

    // ==================== QUOTE OF THE DAY ====================
    else if (commandName === 'quote-of-day') {
        const sub = interaction.options.getSubcommand();
        const fData = loadFeedsData();
        const fGuild = getFeedsGuild(fData, guild.id);
        if (sub === 'setup') {
            fGuild.quote_of_day = interaction.options.getChannel('channel').id;
            saveFeedsData(fData);
            return interaction.reply({ content: `✅ Quote of the Day will post to <#${fGuild.quote_of_day}> daily.` });
        }
        if (sub === 'disable') {
            fGuild.quote_of_day = null; fGuild.last_quote_date = null;
            saveFeedsData(fData);
            return interaction.reply({ content: '✅ Quote of the Day disabled.', ephemeral: true });
        }
    }

    // ==================== DEBATE ====================
    else if (commandName === 'debate') {
        const sub = interaction.options.getSubcommand();
        if (sub === 'start') {
            const user1 = interaction.options.getUser('user1');
            const user2 = interaction.options.getUser('user2');
            const topic = interaction.options.getString('topic');
            if (activeDebates.has(interaction.channel.id)) return interaction.reply({ content: '❌ A debate is already active here.', ephemeral: true });
            const timeout = setTimeout(async () => {
                activeDebates.delete(interaction.channel.id);
                const ch = await client.channels.fetch(interaction.channel.id).catch(() => null);
                if (ch) await ch.send({ embeds: [cubEmbed().setColor(0xED4245).setTitle('🗣️ Debate Ended').setDescription('The debate timed out (30 min limit).')] }).catch(() => {});
            }, 30 * 60 * 1000);
            activeDebates.set(interaction.channel.id, { guildId: guild.id, user1Id: user1.id, user2Id: user2.id, topic, timeout });
            return interaction.reply({ embeds: [cubEmbed().setColor(0xEB459E).setTitle('🗣️ Debate Started!').setDescription(`**Topic:** ${topic}\n\n**Debaters:** <@${user1.id}> vs <@${user2.id}>\n\nOnly debaters may speak. Use \`/debate end\` to conclude.`)] });
        }
        if (sub === 'end') {
            const debate = activeDebates.get(interaction.channel.id);
            if (!debate) return interaction.reply({ content: '❌ No active debate here.', ephemeral: true });
            clearTimeout(debate.timeout);
            activeDebates.delete(interaction.channel.id);
            const embed = cubEmbed().setColor(0xED4245).setTitle('🗣️ Debate Ended').setDescription(`The debate on **${debate.topic}** has concluded!`);
            const dData = loadDebateData();
            const dGuild = getDebateGuild(dData, guild.id);
            if (dGuild.log_channel_id) {
                const logCh = await guild.channels.fetch(dGuild.log_channel_id).catch(() => null);
                if (logCh) await logCh.send({ embeds: [embed] }).catch(() => {});
            }
            return interaction.reply({ embeds: [embed] });
        }
        if (sub === 'log') {
            const dData = loadDebateData();
            const dGuild = getDebateGuild(dData, guild.id);
            dGuild.log_channel_id = interaction.options.getChannel('channel').id;
            saveDebateData(dData);
            return interaction.reply({ content: `✅ Debate logs → <#${dGuild.log_channel_id}>.`, ephemeral: true });
        }
    }

    // ==================== MARRIAGE / FRIEND BUTTON HANDLERS ====================
    else if (interaction.isButton() && (interaction.customId.startsWith('marry_') || interaction.customId.startsWith('friend_'))) {
        const colonIdx = interaction.customId.indexOf(':');
        const action = interaction.customId.substring(0, colonIdx);
        const key = interaction.customId.substring(colonIdx + 1);
        const relData = loadRelationshipsData();
        const relGuild = getRelationshipsGuild(relData, guild.id);

        if (action === 'marry_accept' || action === 'marry_decline') {
            const proposal = relGuild.proposals?.[key];
            if (!proposal) return interaction.reply({ content: '❌ This proposal has expired.', ephemeral: true });
            if (proposal.proposer === interaction.user.id) return interaction.reply({ content: '❌ Only the recipient can respond.', ephemeral: true });
            delete relGuild.proposals[key];
            if (action === 'marry_accept') {
                if (!relGuild.relationships) relGuild.relationships = {};
                relGuild.relationships[key] = { type: 'married', since: Date.now() };
                saveRelationshipsData(relData);
                const [id1, id2] = key.split(':');
                return interaction.update({ embeds: [cubEmbed().setColor(0xFF69B4).setTitle('💍 Now Married!').setDescription(`<@${id1}> and <@${id2}> are now married! 🎉`)], components: [] });
            } else {
                saveRelationshipsData(relData);
                return interaction.update({ content: '💔 The proposal was declined.', embeds: [], components: [] });
            }
        }

        if (action === 'friend_accept' || action === 'friend_decline') {
            const request = relGuild.friend_requests?.[key];
            if (!request) return interaction.reply({ content: '❌ This friend request has expired.', ephemeral: true });
            if (request.sender === interaction.user.id) return interaction.reply({ content: '❌ Only the recipient can respond.', ephemeral: true });
            delete relGuild.friend_requests[key];
            if (action === 'friend_accept') {
                if (!relGuild.relationships) relGuild.relationships = {};
                relGuild.relationships[key] = { type: 'friend', since: Date.now() };
                saveRelationshipsData(relData);
                return interaction.update({ content: '✅ You are now friends!', embeds: [], components: [] });
            } else {
                saveRelationshipsData(relData);
                return interaction.update({ content: '❌ Friend request declined.', embeds: [], components: [] });
            }
        }
    }

    // ==================== GAME BUTTON HANDLERS ====================

    // ── Blackjack buttons ────────────────────────────────────────────────────
    else if (interaction.isButton() && (interaction.customId.startsWith('bj_hit:') || interaction.customId.startsWith('bj_stand:') || interaction.customId.startsWith('bj_double:'))) {
        const [action, targetUserId] = interaction.customId.split(':');
        if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });
        const gameKey = `${guild.id}:${targetUserId}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'blackjack') return interaction.reply({ content: '❌ No active blackjack game.', ephemeral: true });

        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        const user = getUserEco(guildE, targetUserId);

        if (action === 'bj_double') {
            if (user.balance < game.bet) return interaction.reply({ content: '❌ Not enough coins to double down.', ephemeral: true });
            user.balance -= game.bet;
            game.bet *= 2;
            game.doubled = true;
            game.playerHand.push(game.deck.pop());
            saveEconomyData(eData);
            // Force stand after double
        }
        if (action === 'bj_hit' || action === 'bj_double') {
            if (action === 'bj_hit') game.playerHand.push(game.deck.pop());
            const pTotal = handTotal(game.playerHand);
            if (pTotal > 21 || action === 'bj_double') {
                // Bust or double — resolve
                activeGames.delete(gameKey);
                if (pTotal > 21) {
                    const embed = cubEmbed().setColor(0xED4245).setTitle('🃏 Blackjack — Bust!')
                        .addFields(
                            { name: `Your Hand (${pTotal})`, value: handStr(game.playerHand), inline: true },
                            { name: `Dealer (${handTotal(game.dealerHand)})`, value: handStr(game.dealerHand), inline: true },
                            { name: '❌ Lost', value: `${game.bet} ${guildE.currency_emoji}`, inline: true },
                            { name: 'Balance', value: `${user.balance} ${guildE.currency_emoji}`, inline: true },
                        );
                    saveEconomyData(eData);
                    return interaction.update({ embeds: [embed], components: [] });
                }
                // Double down — dealer plays
            }
            if (pTotal <= 21 && action !== 'bj_double') {
                // Still playing
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`bj_hit:${targetUserId}`).setLabel('Hit').setStyle(ButtonStyle.Primary).setEmoji('🃏'),
                    new ButtonBuilder().setCustomId(`bj_stand:${targetUserId}`).setLabel('Stand').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId(`bj_double:${targetUserId}`).setLabel('Double Down').setStyle(ButtonStyle.Success).setDisabled(true),
                );
                const embed = cubEmbed().setColor(0x5865F2).setTitle('🃏 Blackjack')
                    .addFields(
                        { name: `Your Hand (${pTotal})`, value: handStr(game.playerHand), inline: true },
                        { name: 'Dealer Shows', value: cardStr(game.dealerHand[0]), inline: true },
                        { name: 'Bet', value: `${game.bet} ${guildE.currency_emoji}`, inline: true },
                    );
                return interaction.update({ embeds: [embed], components: [row] });
            }
        }

        // Stand or bust/double resolution — dealer plays
        if (action === 'bj_stand' || action === 'bj_double') {
            activeGames.delete(gameKey);
            while (handTotal(game.dealerHand) < 17) game.dealerHand.push(game.deck.pop());
            const pTotal = handTotal(game.playerHand);
            const dTotal = handTotal(game.dealerHand);
            let result, color, net;
            if (dTotal > 21 || pTotal > dTotal) { result = '✅ You Win!'; color = 0x57F287; net = game.bet; }
            else if (pTotal === dTotal) { result = '🤝 Push (Tie)'; color = 0xFEE75C; net = 0; user.balance += game.bet; }
            else { result = '❌ Dealer Wins'; color = 0xED4245; net = -game.bet; }
            if (net > 0) user.balance += game.bet * 2;
            saveEconomyData(eData);
            const embed = cubEmbed().setColor(color).setTitle(`🃏 Blackjack — ${result}`)
                .addFields(
                    { name: `Your Hand (${pTotal})`, value: handStr(game.playerHand), inline: true },
                    { name: `Dealer (${dTotal})`, value: handStr(game.dealerHand), inline: true },
                    { name: net >= 0 ? 'Won' : 'Lost', value: `${Math.abs(net)} ${guildE.currency_emoji}`, inline: true },
                    { name: 'Balance', value: `${user.balance} ${guildE.currency_emoji}`, inline: true },
                );
            return interaction.update({ embeds: [embed], components: [] });
        }
    }

    // ── Crash cash-out ───────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('crash_cashout:')) {
        const targetUserId = interaction.customId.split(':')[1];
        if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });
        const gameKey = `${guild.id}:${targetUserId}`;
        const game = activeGames.get(gameKey);
        if (!game || game.crashed) return interaction.reply({ content: '❌ No active crash game or already crashed.', ephemeral: true });

        game.crashed = true;
        activeGames.delete(gameKey);
        clearInterval(crashIntervals.get(targetUserId));
        crashIntervals.delete(targetUserId);

        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        const user = getUserEco(guildE, targetUserId);
        const mult = game.current || 1.0;
        const winnings = Math.floor(game.bet * mult);
        user.balance += winnings;
        saveEconomyData(eData);

        const embed = cubEmbed().setColor(0x57F287).setTitle('📈 Crash — Cashed Out!')
            .setDescription(`✅ You cashed out at **${mult}×**!`)
            .addFields(
                { name: 'Bet', value: `${game.bet} ${guildE.currency_emoji}`, inline: true },
                { name: '✅ Won', value: `${winnings} ${guildE.currency_emoji}`, inline: true },
                { name: 'Balance', value: `${user.balance} ${guildE.currency_emoji}`, inline: true },
            );
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`crash_cashout:${targetUserId}`).setLabel(`✅ Cashed at ${mult}×`).setStyle(ButtonStyle.Success).setDisabled(true)
        );
        return interaction.update({ embeds: [embed], components: [disabledRow] });
    }

    // ── High-Low buttons ─────────────────────────────────────────────────────
    else if (interaction.isButton() && (interaction.customId.startsWith('hl_higher:') || interaction.customId.startsWith('hl_lower:') || interaction.customId.startsWith('hl_cashout:'))) {
        const [action, targetUserId] = interaction.customId.split(':');
        if (interaction.user.id !== targetUserId) return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });
        const gameKey = `${guild.id}:${targetUserId}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'highlow') return interaction.reply({ content: '❌ No active High-Low game.', ephemeral: true });

        const eData = loadEconomyData();
        const guildE = getEconomyGuild(eData, guild.id);
        const user = getUserEco(guildE, targetUserId);

        if (action === 'hl_cashout') {
            activeGames.delete(gameKey);
            const winnings = Math.floor(game.bet * game.mult);
            user.balance += winnings;
            saveEconomyData(eData);
            const embed = cubEmbed().setColor(0x57F287).setTitle('🃏 High-Low — Cashed Out!')
                .setDescription(`You walked away with **${game.mult}×** multiplier!`)
                .addFields(
                    { name: 'Won', value: `${winnings} ${guildE.currency_emoji}`, inline: true },
                    { name: 'Balance', value: `${user.balance} ${guildE.currency_emoji}`, inline: true },
                );
            return interaction.update({ embeds: [embed], components: [] });
        }

        const nextCard = game.deck.pop();
        if (!nextCard) { activeGames.delete(gameKey); return interaction.update({ content: 'Deck exhausted!', components: [] }); }

        const prevVal = handTotal([game.current]);
        const nextVal = handTotal([nextCard]);
        const guessedHigher = action === 'hl_higher';
        const correct = guessedHigher ? nextVal > prevVal : nextVal < prevVal;

        if (nextVal === prevVal) {
            // Tie — neutral, just flip
            game.current = nextCard;
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`hl_higher:${targetUserId}`).setLabel('Higher ⬆️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId(`hl_lower:${targetUserId}`).setLabel('Lower ⬇️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`hl_cashout:${targetUserId}`).setLabel(`Cash Out (${game.mult}×) 💰`).setStyle(ButtonStyle.Success),
            );
            return interaction.update({ embeds: [cubEmbed().setColor(0xFEE75C).setTitle('🃏 High-Low — Tie!')
                .setDescription(`It was a tie! Card: **${cardStr(nextCard)}**\nGuess again!`)
                .addFields({ name: 'Multiplier', value: `${game.mult}×`, inline: true }, { name: 'Streak', value: `${game.streak}`, inline: true })
            ], components: [row] });
        }

        if (!correct) {
            activeGames.delete(gameKey);
            saveEconomyData(eData);
            return interaction.update({ embeds: [cubEmbed().setColor(0xED4245).setTitle('🃏 High-Low — Wrong!')
                .setDescription(`The card was **${cardStr(nextCard)}** (${nextVal}) — you guessed ${guessedHigher ? 'higher' : 'lower'}!\n\n❌ You lose your bet of **${game.bet} ${guildE.currency_emoji}**.`)
                .addFields({ name: 'Balance', value: `${user.balance} ${guildE.currency_emoji}`, inline: true })
            ], components: [] });
        }

        game.current = nextCard;
        game.mult = Math.round((game.mult + 0.5) * 10) / 10;
        game.streak++;

        if (game.streak >= 5) {
            // Auto-win after 5 correct
            activeGames.delete(gameKey);
            const winnings = Math.floor(game.bet * game.mult);
            user.balance += winnings;
            saveEconomyData(eData);
            return interaction.update({ embeds: [cubEmbed().setColor(0xFFD700).setTitle('🃏 High-Low — Flawless Victory!')
                .setDescription(`🏆 5 in a row! You win **${winnings} ${guildE.currency_emoji}** (${game.mult}×)!`)
                .addFields({ name: 'Balance', value: `${user.balance} ${guildE.currency_emoji}`, inline: true })
            ], components: [] });
        }

        const hlRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`hl_higher:${targetUserId}`).setLabel('Higher ⬆️').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`hl_lower:${targetUserId}`).setLabel('Lower ⬇️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`hl_cashout:${targetUserId}`).setLabel(`Cash Out (${game.mult}×) 💰`).setStyle(ButtonStyle.Success),
        );
        const embed = cubEmbed().setColor(0x57F287).setTitle('🃏 High-Low — Correct!')
            .setDescription(`✅ Next card: **${cardStr(nextCard)}** (${nextVal})\nIs the next card Higher or Lower?`)
            .addFields({ name: 'Multiplier', value: `${game.mult}×`, inline: true }, { name: 'Streak', value: `${game.streak}/5`, inline: true });
        return interaction.update({ embeds: [embed], components: [hlRow] });
    }

    // ── Tic-Tac-Toe buttons ──────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('ttt:')) {
        const parts = interaction.customId.split(':');
        const cellIdx = parseInt(parts[1]);
        const gameId = parts[2];
        const game = activePvPGames.get(gameId);
        if (!game || game.type !== 'ttt') return interaction.reply({ content: '❌ Game not found.', ephemeral: true });
        if (interaction.user.id !== game.currentTurn) return interaction.reply({ content: '❌ It\'s not your turn.', ephemeral: true });
        if (game.board[cellIdx] !== null) return interaction.reply({ content: '❌ That cell is taken.', ephemeral: true });

        const symbol = game.players[0] === interaction.user.id ? 'X' : 'O';
        game.board[cellIdx] = symbol;

        // Check win
        const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
        const winner = wins.find(([a,b,c]) => game.board[a] && game.board[a] === game.board[b] && game.board[b] === game.board[c]);
        const isDraw = !winner && game.board.every(c => c !== null);

        const buildTTTComponents = (board, disabled = false) => {
            const rows = [];
            for (let r = 0; r < 3; r++) {
                const row = new ActionRowBuilder();
                for (let c = 0; c < 3; c++) {
                    const idx = r * 3 + c;
                    const cell = board[idx];
                    row.addComponents(new ButtonBuilder()
                        .setCustomId(`ttt:${idx}:${gameId}`)
                        .setLabel(cell || '·')
                        .setStyle(cell === 'X' ? ButtonStyle.Primary : cell === 'O' ? ButtonStyle.Danger : ButtonStyle.Secondary)
                        .setDisabled(disabled || cell !== null)
                    );
                }
                rows.push(row);
            }
            return rows;
        };

        if (winner || isDraw) {
            activePvPGames.delete(gameId);
            let desc, color;
            if (isDraw) { desc = '🤝 It\'s a draw!'; color = 0xFEE75C; }
            else {
                const winnerId = interaction.user.id;
                const loserId = game.players.find(p => p !== winnerId);
                desc = `🏆 <@${winnerId}> wins!`;
                color = 0x57F287;
                if (game.bet > 0) {
                    const eData = loadEconomyData(); const guildE = getEconomyGuild(eData, guild.id);
                    const wUser = getUserEco(guildE, winnerId); const lUser = getUserEco(guildE, loserId);
                    lUser.balance = Math.max(0, lUser.balance - game.bet);
                    wUser.balance += game.bet;
                    saveEconomyData(eData);
                    desc += `\n\n+${game.bet} ${guildE.currency_emoji} from <@${loserId}>!`;
                }
            }
            const embed = cubEmbed().setColor(color).setTitle('❌⭕ Tic-Tac-Toe').setDescription(desc);
            return interaction.update({ embeds: [embed], components: buildTTTComponents(game.board, true) });
        }

        game.currentTurn = game.players.find(p => p !== interaction.user.id);
        const embed = cubEmbed().setColor(0x5865F2).setTitle('❌⭕ Tic-Tac-Toe')
            .setDescription(`<@${game.players[0]}> (X) vs <@${game.players[1]}> (O)\n\n<@${game.currentTurn}>'s turn!`)
            .setFooter({ text: game.bet > 0 ? `Bet: ${game.bet} coins each` : 'No bet' });
        return interaction.update({ embeds: [embed], components: buildTTTComponents(game.board) });
    }

    // ── Connect 4 buttons ────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('c4:')) {
        const parts = interaction.customId.split(':');
        const col = parseInt(parts[1]);
        const gameId = parts[2];
        const game = activePvPGames.get(gameId);
        if (!game || game.type !== 'c4') return interaction.reply({ content: '❌ Game not found.', ephemeral: true });
        if (interaction.user.id !== game.currentTurn) return interaction.reply({ content: '❌ It\'s not your turn.', ephemeral: true });

        const playerIdx = game.players.indexOf(interaction.user.id) + 1;
        // Drop piece
        let placed = -1;
        for (let r = 5; r >= 0; r--) {
            if (game.board[r][col] === 0) { game.board[r][col] = playerIdx; placed = r; break; }
        }
        if (placed === -1) return interaction.reply({ content: '❌ That column is full.', ephemeral: true });

        // Check win (horizontal, vertical, diagonal)
        const checkWin = (board, p) => {
            for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
                if (c + 3 < 7 && [0,1,2,3].every(d => board[r][c+d] === p)) return true;
                if (r + 3 < 6 && [0,1,2,3].every(d => board[r+d][c] === p)) return true;
                if (r + 3 < 6 && c + 3 < 7 && [0,1,2,3].every(d => board[r+d][c+d] === p)) return true;
                if (r + 3 < 6 && c - 3 >= 0 && [0,1,2,3].every(d => board[r+d][c-d] === p)) return true;
            }
            return false;
        };

        const EMPTY = '⬛', P1 = '🔴', P2 = '🟡';
        const grid = game.board.map(row => row.map(c => c === 0 ? EMPTY : c === 1 ? P1 : P2).join('')).join('\n');
        const colRow1 = new ActionRowBuilder().addComponents(
            ...[0,1,2,3,4].map(c => new ButtonBuilder().setCustomId(`c4:${c}:${gameId}`).setLabel(`${c+1}`).setStyle(ButtonStyle.Secondary))
        );
        const colRow2 = new ActionRowBuilder().addComponents(
            ...[5,6].map(c => new ButtonBuilder().setCustomId(`c4:${c}:${gameId}`).setLabel(`${c+1}`).setStyle(ButtonStyle.Secondary))
        );

        if (checkWin(game.board, playerIdx)) {
            activePvPGames.delete(gameId);
            const loserId = game.players.find(p => p !== interaction.user.id);
            let winDesc = `🏆 <@${interaction.user.id}> wins!`;
            if (game.bet > 0) {
                const eData = loadEconomyData(); const guildE = getEconomyGuild(eData, guild.id);
                const wUser = getUserEco(guildE, interaction.user.id); const lUser = getUserEco(guildE, loserId);
                lUser.balance = Math.max(0, lUser.balance - game.bet);
                wUser.balance += game.bet;
                saveEconomyData(eData);
                winDesc += `\n\n+${game.bet} ${guildE.currency_emoji}!`;
            }
            const embed = cubEmbed().setColor(0x57F287).setTitle('🟡🔴 Connect 4').setDescription(`${grid}\n\n${winDesc}`);
            return interaction.update({ embeds: [embed], components: [] });
        }
        const isDraw = game.board[0].every(c => c !== 0);
        if (isDraw) {
            activePvPGames.delete(gameId);
            return interaction.update({ embeds: [cubEmbed().setColor(0xFEE75C).setTitle('🟡🔴 Connect 4').setDescription(`${grid}\n\n🤝 It's a draw!`)], components: [] });
        }

        game.currentTurn = game.players.find(p => p !== interaction.user.id);
        const nextPiece = game.players.indexOf(game.currentTurn) === 0 ? '🔴' : '🟡';
        const embed = cubEmbed().setColor(0x5865F2).setTitle('🟡🔴 Connect 4')
            .setDescription(`${grid}\n\n${nextPiece} <@${game.currentTurn}>'s turn — choose a column:`);
        return interaction.update({ embeds: [embed], components: [colRow1, colRow2] });
    }

    // ── RPS vs Bot ───────────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('rps_bot:')) {
        const choice = interaction.customId.split(':')[1];
        const gameId = `rps_bot_${interaction.user.id}`;
        const game = activePvPGames.get(gameId);
        activePvPGames.delete(gameId);

        const moves = ['rock','paper','scissors'];
        const botChoice = moves[Math.floor(Math.random() * 3)];
        const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
        const emojis = { rock: '✊', paper: '🖐️', scissors: '✌️' };
        let result, color, net = 0;
        const bet = game?.bet || 0;

        if (choice === botChoice) { result = '🤝 Tie!'; color = 0xFEE75C; }
        else if (beats[choice] === botChoice) { result = '✅ You Win!'; color = 0x57F287; net = bet; }
        else { result = '❌ Bot Wins!'; color = 0xED4245; net = -bet; }

        if (bet > 0 && net !== 0) {
            const eData = loadEconomyData(); const guildE = getEconomyGuild(eData, guild.id);
            const user = getUserEco(guildE, interaction.user.id);
            user.balance = Math.max(0, user.balance + net);
            saveEconomyData(eData);
        }

        const eData2 = loadEconomyData(); const guildE2 = getEconomyGuild(eData2, guild.id);
        const user2 = getUserEco(guildE2, interaction.user.id);
        const embed = cubEmbed().setColor(color).setTitle(`✊🖐️✌️ RPS — ${result}`)
            .setDescription(`You: **${emojis[choice]} ${choice}** vs Bot: **${emojis[botChoice]} ${botChoice}**`)
            .addFields(bet > 0 ? [{ name: net >= 0 ? 'Won' : 'Lost', value: `${Math.abs(net)} ${guildE2.currency_emoji}`, inline: true }, { name: 'Balance', value: `${user2.balance} ${guildE2.currency_emoji}`, inline: true }] : []);
        return interaction.update({ embeds: [embed], components: [] });
    }

    // ── RPS vs Player ────────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('rps:')) {
        const parts = interaction.customId.split(':');
        const choice = parts[1];
        const gameId = parts[2];
        const game = activePvPGames.get(gameId);
        if (!game || game.type !== 'rps') return interaction.reply({ content: '❌ Game not found.', ephemeral: true });
        if (!game.players.includes(interaction.user.id)) return interaction.reply({ content: '❌ You\'re not in this game.', ephemeral: true });
        if (game.moves[interaction.user.id]) return interaction.reply({ content: '✅ You already chose! Waiting for opponent...', ephemeral: true });

        game.moves[interaction.user.id] = choice;
        await interaction.reply({ content: `✅ You chose **${choice}**! Waiting for the other player...`, ephemeral: true });

        if (Object.keys(game.moves).length < 2) return;

        activePvPGames.delete(gameId);
        const [p1, p2] = game.players;
        const m1 = game.moves[p1], m2 = game.moves[p2];
        const beats = { rock: 'scissors', paper: 'rock', scissors: 'paper' };
        const emojis = { rock: '✊', paper: '🖐️', scissors: '✌️' };
        let winnerId = null, loserId = null, resultText;

        if (m1 === m2) { resultText = '🤝 It\'s a tie!'; }
        else if (beats[m1] === m2) { winnerId = p1; loserId = p2; resultText = `✅ <@${p1}> wins!`; }
        else { winnerId = p2; loserId = p1; resultText = `✅ <@${p2}> wins!`; }

        let econDesc = '';
        if (winnerId && game.bet > 0) {
            const eData = loadEconomyData(); const guildE = getEconomyGuild(eData, guild.id);
            const wUser = getUserEco(guildE, winnerId); const lUser = getUserEco(guildE, loserId);
            lUser.balance = Math.max(0, lUser.balance - game.bet);
            wUser.balance += game.bet;
            saveEconomyData(eData);
            econDesc = `\n\n+${game.bet} ${guildE.currency_emoji} to <@${winnerId}>!`;
        }

        const msg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
        const embed = cubEmbed().setColor(winnerId ? 0x57F287 : 0xFEE75C).setTitle('✊🖐️✌️ Rock Paper Scissors')
            .setDescription(`<@${p1}>: **${emojis[m1]} ${m1}**\n<@${p2}>: **${emojis[m2]} ${m2}**\n\n${resultText}${econDesc}`);
        if (msg) await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    // ── Trivia buttons ───────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('trivia:')) {
        const parts = interaction.customId.split(':');
        const choiceIdx = parseInt(parts[1]);
        const gameId = parts[2];
        if (gameId.endsWith('_done')) return interaction.reply({ content: '❌ This trivia has ended.', ephemeral: true });

        const gameKey = `${guild.id}:${interaction.user.id}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'trivia' || game.gameId !== gameId) return interaction.reply({ content: '❌ This is not your trivia question.', ephemeral: true });

        activeGames.delete(gameKey);
        const q = TRIVIA_QUESTIONS.find(q => q.a === game.answer);
        const shuffled = q ? [...q.choices].sort((a, b) => {
            // We need to reproduce same shuffle — can't, so just check answer
            return 0;
        }) : [];

        const isCorrect = true; // We'll check by answer directly
        // Re-find the question to show all choices in correct order
        const triviaQ = TRIVIA_QUESTIONS.find(tq => tq.a === game.answer);
        const embed = cubEmbed().setColor(0x57F287).setTitle('🧠 Trivia — Correct! 🎉')
            .setDescription(`✅ The answer was **${game.answer}**!`);
        const wrongEmbed = cubEmbed().setColor(0xED4245).setTitle('🧠 Trivia — Wrong!')
            .setDescription(`❌ The answer was **${game.answer}**.`);

        // Actually determine if they got it right — look at the message components to find what they selected vs answer
        // Since we can't re-build the shuffled order, we stored the answer string
        // The button label contains the choice text — extract from interaction
        const clickedLabel = interaction.component?.label || '';
        const clickedText = clickedLabel.includes(': ') ? clickedLabel.split(': ').slice(1).join(': ') : clickedLabel;
        const correct = clickedText === game.answer;

        const resultEmbed = cubEmbed().setColor(correct ? 0x57F287 : 0xED4245)
            .setTitle(correct ? '🧠 Trivia — Correct! 🎉' : '🧠 Trivia — Wrong!')
            .setDescription(correct ? `✅ You got it! The answer was **${game.answer}**.` : `❌ Wrong! The answer was **${game.answer}**.`);

        const disabledRow = new ActionRowBuilder().addComponents(
            ...interaction.message.components[0].components.map(btn =>
                new ButtonBuilder()
                    .setCustomId(btn.customId + '_done')
                    .setLabel(btn.label)
                    .setStyle(btn.label.includes(': ') && btn.label.split(': ').slice(1).join(': ') === game.answer ? ButtonStyle.Success : ButtonStyle.Secondary)
                    .setDisabled(true)
            )
        );
        return interaction.update({ embeds: [resultEmbed], components: [disabledRow] });
    }

    // ── Hangman buttons ──────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('hm:')) {
        const parts = interaction.customId.split(':');
        const letter = parts[1];
        const gameId = parts[2];
        const gameKey = `${guild.id}:${interaction.user.id}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'hangman' || game.gameId !== gameId) return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });
        if (game.guessed.includes(letter)) return interaction.reply({ content: `❌ You already guessed **${letter.toUpperCase()}**.`, ephemeral: true });

        game.guessed.push(letter);
        if (!game.word.includes(letter)) game.wrong++;

        const stages = ['😊','😮','😟','😨','😰','😱','☠️'];
        const display = game.word.split('').map(l => game.guessed.includes(l) ? l : '_').join(' ');
        const wrongLetters = game.guessed.filter(l => !game.word.includes(l)).join(', ') || 'none';
        const isWon = !display.includes('_');
        const isLost = game.wrong >= game.maxWrong;

        if (isWon || isLost) {
            activeGames.delete(gameKey);
            const color = isWon ? 0x57F287 : 0xED4245;
            const title = isWon ? '🔤 Hangman — You Won! 🎉' : '🔤 Hangman — Game Over! ☠️';
            const desc = isWon
                ? `✅ The word was **${game.word}**! Great job!`
                : `❌ You ran out of guesses! The word was **${game.word}**.`;
            const embed = cubEmbed().setColor(color).setTitle(title).setDescription(desc)
                .addFields({ name: 'Word', value: `\`${game.word}\``, inline: true }, { name: 'Wrong Guesses', value: wrongLetters, inline: true });
            return interaction.update({ embeds: [embed], components: [] });
        }

        const makeLetterRows = () => {
            const rows = [];
            const chunks = ['abcde','fghij','klmno','pqrst','uvwxyz'.split('').slice(0,6)];
            const chunkStrs = ['abcde','fghij','klmno','pqrst','uvwxyz'];
            for (const chunk of chunkStrs) {
                const row = new ActionRowBuilder();
                for (const l of chunk.split('')) {
                    row.addComponents(new ButtonBuilder()
                        .setCustomId(`hm:${l}:${gameId}`)
                        .setLabel(l.toUpperCase())
                        .setStyle(game.guessed.includes(l) ? (game.word.includes(l) ? ButtonStyle.Success : ButtonStyle.Danger) : ButtonStyle.Secondary)
                        .setDisabled(game.guessed.includes(l))
                    );
                }
                rows.push(row);
            }
            return rows;
        };

        const embed = cubEmbed().setColor(0x5865F2).setTitle(`🔤 Hangman ${stages[game.wrong]}`)
            .setDescription(`**Word:** \`${display}\` (${game.word.length} letters)\n**Wrong:** ${wrongLetters} (${game.wrong}/${game.maxWrong})`);
        return interaction.update({ embeds: [embed], components: makeLetterRows() });
    }

    // ── Wordle buttons ───────────────────────────────────────────────────────
    else if (interaction.isButton() && (interaction.customId.startsWith('wordle_guess:') || interaction.customId.startsWith('wordle_quit:'))) {
        const [action, gameId] = interaction.customId.split(':');
        const gameKey = `${guild.id}:${interaction.user.id}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'wordle' || game.gameId !== gameId) return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });

        if (action === 'wordle_quit') {
            activeGames.delete(gameKey);
            return interaction.update({ embeds: [cubEmbed().setColor(0xED4245).setTitle('🟩 Wordle — Gave Up').setDescription(`The word was **${game.word}**.`)], components: [] });
        }

        // Show modal for guess
        const modal = new ModalBuilder().setCustomId(`wordle_modal:${gameId}`).setTitle('Wordle Guess');
        const input = new TextInputBuilder().setCustomId('guess').setLabel('Enter your 5-letter guess').setStyle(TextInputStyle.Short).setMinLength(5).setMaxLength(5).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    // ── Wordle modal submit ──────────────────────────────────────────────────
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('wordle_modal:')) {
        const gameId = interaction.customId.split(':')[1];
        const gameKey = `${guild.id}:${interaction.user.id}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'wordle') return interaction.reply({ content: '❌ No active Wordle game.', ephemeral: true });

        const guess = interaction.fields.getTextInputValue('guess').toLowerCase().trim();
        if (!/^[a-z]{5}$/.test(guess)) return interaction.reply({ content: '❌ Please enter exactly 5 letters (a-z).', ephemeral: true });

        game.guesses.push(guess);
        const buildDisplay = (guesses, word) => guesses.map(g =>
            g.split('').map((l, i) => l === word[i] ? '🟩' : word.includes(l) ? '🟨' : '⬛').join('') + ' `' + g + '`'
        ).join('\n');

        const isWon = guess === game.word;
        const isLost = !isWon && game.guesses.length >= game.maxGuesses;

        if (isWon || isLost) {
            activeGames.delete(gameKey);
            const color = isWon ? 0x57F287 : 0xED4245;
            const title = isWon ? '🟩 Wordle — You Got It! 🎉' : '🟩 Wordle — Game Over!';
            const desc = (buildDisplay(game.guesses, game.word)) + (isLost ? `\n\nThe word was **${game.word}**.` : '\n\n✅ Solved!');
            return interaction.update({ embeds: [cubEmbed().setColor(color).setTitle(title).setDescription(desc).addFields({ name: 'Guesses Used', value: `${game.guesses.length}/${game.maxGuesses}`, inline: true })], components: [] });
        }

        const guessBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wordle_guess:${gameId}`).setLabel('📝 Guess a Word').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`wordle_quit:${gameId}`).setLabel('🏳️ Give Up').setStyle(ButtonStyle.Danger),
        );
        const embed = cubEmbed().setColor(0x57F287).setTitle('🟩 Wordle')
            .setDescription(buildDisplay(game.guesses, game.word))
            .addFields({ name: 'Guesses', value: `${game.guesses.length}/${game.maxGuesses}`, inline: true });
        return interaction.update({ embeds: [embed], components: [guessBtn] });
    }

    // ── Riddle reveal ────────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('riddle_reveal:')) {
        const gameId = interaction.customId.split(':')[1];
        const riddleKey = `riddle_${gameId}`;
        const game = activeGames.get(riddleKey);
        activeGames.delete(riddleKey);
        const answer = game?.answer || 'Unknown';
        const q = game?.q || '';
        const embed = cubEmbed().setColor(0x9B59B6).setTitle('🤔 Riddle — Answer Revealed!')
            .setDescription(`**${q}**\n\n✅ **Answer: ${answer}**`);
        return interaction.update({ embeds: [embed], components: [] });
    }

    // ── Number Guess buttons ─────────────────────────────────────────────────
    else if (interaction.isButton() && (interaction.customId.startsWith('ng_guess:') || interaction.customId.startsWith('ng_quit:'))) {
        const [action, gameId] = interaction.customId.split(':');
        const gameKey = `${guild.id}:${interaction.user.id}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'numguess' || game.gameId !== gameId) return interaction.reply({ content: '❌ No active Number Guess game.', ephemeral: true });

        if (action === 'ng_quit') {
            activeGames.delete(gameKey);
            return interaction.update({ embeds: [cubEmbed().setColor(0xED4245).setTitle('🔢 Number Guesser — Gave Up').setDescription(`The number was **${game.secret}**.`)], components: [] });
        }

        const modal = new ModalBuilder().setCustomId(`ng_modal:${gameId}`).setTitle('Number Guess');
        const input = new TextInputBuilder().setCustomId('guess').setLabel('Enter a number between 1 and 100').setStyle(TextInputStyle.Short).setMinLength(1).setMaxLength(3).setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    // ── Number Guess modal ───────────────────────────────────────────────────
    else if (interaction.isModalSubmit() && interaction.customId.startsWith('ng_modal:')) {
        const gameId = interaction.customId.split(':')[1];
        const gameKey = `${guild.id}:${interaction.user.id}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'numguess') return interaction.reply({ content: '❌ No active game.', ephemeral: true });

        const raw = interaction.fields.getTextInputValue('guess');
        const guess = parseInt(raw);
        if (isNaN(guess) || guess < 1 || guess > 100) return interaction.reply({ content: '❌ Please enter a number between 1 and 100.', ephemeral: true });

        game.attempts++;
        const diff = Math.abs(guess - game.secret);
        let hint;
        if (diff === 0) hint = '🎯 Correct!';
        else if (diff <= 5) hint = guess < game.secret ? '🔥 Very close — go Higher!' : '🔥 Very close — go Lower!';
        else if (diff <= 15) hint = guess < game.secret ? '🌡️ Getting warm — Higher!' : '🌡️ Getting warm — Lower!';
        else hint = guess < game.secret ? '🧊 Go Higher!' : '🧊 Go Lower!';

        if (guess === game.secret) {
            activeGames.delete(gameKey);
            return interaction.update({ embeds: [cubEmbed().setColor(0x57F287).setTitle('🔢 Number Guesser — You Win! 🎉')
                .setDescription(`🎯 The number was **${game.secret}**! You got it in **${game.attempts}** guess${game.attempts !== 1 ? 'es' : ''}!`)], components: [] });
        }

        const guessBtn = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`ng_guess:${gameId}`).setLabel('🔢 Guess Again').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId(`ng_quit:${gameId}`).setLabel('🏳️ Give Up').setStyle(ButtonStyle.Danger),
        );
        const embed = cubEmbed().setColor(0x5865F2).setTitle('🔢 Number Guesser')
            .setDescription(`Your guess: **${guess}**`)
            .addFields({ name: 'Hint', value: hint, inline: true }, { name: 'Attempts', value: `${game.attempts}`, inline: true });
        return interaction.update({ embeds: [embed], components: [guessBtn] });
    }

    // ── Memory buttons ───────────────────────────────────────────────────────
    else if (interaction.isButton() && interaction.customId.startsWith('mem:')) {
        const parts = interaction.customId.split(':');
        const cardIdx = parseInt(parts[1]);
        const gameId = parts[2];
        const gameKey = `${guild.id}:${interaction.user.id}`;
        const game = activeGames.get(gameKey);
        if (!game || game.type !== 'memory' || game.gameId !== gameId) return interaction.reply({ content: '❌ This is not your game.', ephemeral: true });
        if (game.matched[cardIdx] || game.revealed[cardIdx]) return interaction.reply({ content: '❌ That card is already flipped.', ephemeral: true });

        if (game.flipped === null) {
            // First flip
            game.flipped = cardIdx;
            game.revealed[cardIdx] = true;
        } else {
            // Second flip
            const first = game.flipped;
            game.flipped = null;
            game.revealed[cardIdx] = true;
            game.moves++;

            if (game.cards[first] === game.cards[cardIdx]) {
                // Match!
                game.matched[first] = true;
                game.matched[cardIdx] = true;
            } else {
                // No match — hide both after showing briefly
                setTimeout(() => {
                    game.revealed[first] = false;
                    game.revealed[cardIdx] = false;
                }, 800);
            }
        }

        const pairsFound = game.matched.filter(Boolean).length / 2;
        const buildMemoryRows = (state) => {
            const rows = [];
            for (let r = 0; r < 4; r++) {
                const row = new ActionRowBuilder();
                for (let c = 0; c < 4; c++) {
                    const idx = r * 4 + c;
                    const isMatched = state.matched[idx];
                    const isRevealed = state.revealed[idx];
                    row.addComponents(new ButtonBuilder()
                        .setCustomId(`mem:${idx}:${gameId}`)
                        .setLabel(isMatched || isRevealed ? state.cards[idx] : '❓')
                        .setStyle(isMatched ? ButtonStyle.Success : isRevealed ? ButtonStyle.Primary : ButtonStyle.Secondary)
                        .setDisabled(isMatched || (isRevealed && idx !== cardIdx && idx !== game.flipped))
                    );
                }
                rows.push(row);
            }
            return rows;
        };

        if (pairsFound === 8) {
            activeGames.delete(gameKey);
            return interaction.update({ embeds: [cubEmbed().setColor(0x57F287).setTitle('🃏 Memory — You Won! 🎉')
                .setDescription(`✅ All 8 pairs found in **${game.moves}** moves!`)], components: buildMemoryRows(game) });
        }

        const embed = cubEmbed().setColor(0x5865F2).setTitle('🃏 Memory Game')
            .setDescription('Match all emoji pairs! Click cards to flip them.')
            .addFields({ name: 'Pairs Found', value: `${pairsFound}/8`, inline: true }, { name: 'Moves', value: `${game.moves}`, inline: true });
        return interaction.update({ embeds: [embed], components: buildMemoryRows(game) });
    }

});

// ============================================================
// Giveaway End Function
// ============================================================
async function endGiveaway(guildId, messageId) {
    const gData = loadGiveawaysData();
    const giveaway = gData.guilds[guildId]?.find(g => g.message_id === messageId);
    if (!giveaway || giveaway.ended) return;

    giveaway.ended = true;

    const winners = [];
    const pool = [...giveaway.entries];
    for (let i = 0; i < giveaway.winners && pool.length > 0; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        winners.push(pool.splice(idx, 1)[0]);
    }

    saveGiveawaysData(gData);

    if (giveawayTimers.has(messageId)) {
        clearTimeout(giveawayTimers.get(messageId));
        giveawayTimers.delete(messageId);
    }

    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const channel = await guild.channels.fetch(giveaway.channel_id).catch(() => null);
    if (!channel) return;

    const msg = await channel.messages.fetch(messageId).catch(() => null);
    if (msg) {
        const embed = cubEmbed()
            .setColor(0xED4245)
            .setTitle('🎉 GIVEAWAY ENDED')
            .setDescription(`**${giveaway.prize}**\n\n**Winner(s):** ${winners.length > 0 ? winners.map(w => `<@${w}>`).join(', ') : 'No entries'}\n**Entries:** ${giveaway.entries.length}`)
            .setTimestamp();

        await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
    }

    if (winners.length > 0) {
        // Custom winner message or default
        const winnerMentions = winners.map(w => `<@${w}>`).join(', ');
        let announceMsg;
        if (giveaway.winner_message) {
            announceMsg = giveaway.winner_message
                .replace(/\{winners\}/g, winnerMentions)
                .replace(/\{prize\}/g, giveaway.prize);
        } else {
            announceMsg = `🎉 Congratulations ${winnerMentions}! You won **${giveaway.prize}**!`;
        }
        await channel.send({ content: announceMsg });

        // DM winners if enabled
        if (giveaway.dm_winners) {
            for (const winnerId of winners) {
                try {
                    const user = await client.users.fetch(winnerId);
                    await user.send({ content: `🎉 You won **${giveaway.prize}** in **${guild.name}**!\n\nCheck <#${giveaway.channel_id}> for details.` });
                } catch (e) { /* Can't DM user */ }
            }
        }
    }

    // Store winner IDs
    giveaway.winner_ids = winners;
    saveGiveawaysData(gData);
}

// ============================================================
// Cleanup: Remove stale channel references on startup
// ============================================================
// When running as a custom bot, re-register guild commands the moment the bot
// joins the target guild. This handles the case where the bot was started
// before being invited, so the ready-event registration attempt got a 403.
client.on('guildCreate', async (guild) => {
    if (CUSTOM_GUILD_ID) {
        if (guild.id === CUSTOM_GUILD_ID) {
            console.log(`[CustomBot] Joined guild ${guild.id} — registering commands...`);
            await registerCommands();
        }
    } else {
        // Main bot joined a new guild — register the appropriate command set immediately
        console.log(`[Commands] Bot joined guild ${guild.id} — syncing commands...`);
        await syncGuildCommands(guild.id);
    }
});

// When the custom bot is removed from its guild, mark it as disabled so the main bot
// knows to restore its full command set for that guild.
client.on('guildDelete', async (guild) => {
    if (!CUSTOM_GUILD_ID || guild.id !== CUSTOM_GUILD_ID) return;
    console.log(`[CustomBot] Removed from guild ${guild.id} — marking as disabled.`);
    try {
        const raw = fs.readFileSync(CUSTOM_BOTS_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (data.guilds?.[CUSTOM_GUILD_ID]) {
            data.guilds[CUSTOM_GUILD_ID].enabled = false;
            fs.writeFileSync(CUSTOM_BOTS_FILE, JSON.stringify(data, null, 2));
            console.log(`[CustomBot] Marked guild ${CUSTOM_GUILD_ID} as disabled in custom_bots.json`);
        }
    } catch (e) {
        console.error('[CustomBot] Failed to update custom_bots.json on guildDelete:', e.message);
    }
});

// ============================================================
// Counter Channel Updater
// ============================================================
async function updateCounters() {
    let data;
    try {
        if (!fs.existsSync(COUNTERS_FILE)) return;
        data = JSON.parse(fs.readFileSync(COUNTERS_FILE, 'utf8'));
    } catch (_) { return; }

    for (const [guildId, guildData] of Object.entries(data.guilds || {})) {
        if (CUSTOM_GUILD_ID && guildId !== CUSTOM_GUILD_ID) continue;
        if (guildHasCustomBot(guildId)) continue;

        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        for (const counter of guildData.counters || []) {
            if (!counter.channel_id) continue;
            const channel = guild.channels.cache.get(counter.channel_id);
            if (!channel) continue;

            let count = null;
            try {
                switch (counter.type) {
                    case 'total_members':
                        count = guild.memberCount;
                        break;
                    case 'online_members': {
                        const members = await guild.members.fetch();
                        count = members.filter(m => m.presence?.status && m.presence.status !== 'offline').size;
                        break;
                    }
                    case 'bots': {
                        const members = await guild.members.fetch();
                        count = members.filter(m => m.user.bot).size;
                        break;
                    }
                    case 'humans': {
                        const members = await guild.members.fetch();
                        count = members.filter(m => !m.user.bot).size;
                        break;
                    }
                    case 'roles':
                        count = guild.roles.cache.size - 1; // exclude @everyone
                        break;
                    case 'channels':
                        count = guild.channels.cache.filter(c => c.type !== 4).size; // exclude categories
                        break;
                    case 'boosts':
                        count = guild.premiumSubscriptionCount || 0;
                        break;
                    case 'boost_tier':
                        count = guild.premiumTier || 0;
                        break;
                    case 'role_members': {
                        const roleId = counter.extra?.role_id;
                        if (roleId) {
                            const members = await guild.members.fetch();
                            count = members.filter(m => m.roles.cache.has(roleId)).size;
                        }
                        break;
                    }
                    case 'goal': {
                        const goal = counter.extra?.target || counter.extra?.goal || 100;
                        const current = counter.extra?.current || 0;
                        count = `${current}/${goal}`;
                        break;
                    }
                    case 'date':
                        count = new Date().toLocaleDateString('en-GB');
                        break;
                    case 'clock':
                        count = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                        break;
                }
            } catch (_) { continue; }

            if (count === null) continue;
            const newName = counter.template.replace('{count}', count);
            if (channel.name !== newName) {
                channel.setName(newName).catch(() => {});
            }
        }
    }
}

client.once('ready', async () => {
    console.log(`CUB PROTECTOR logged in as ${client.user.tag}`);

    // Register commands
    await registerCommands();

    // Clean up stale channel references
    const data = loadTempVoiceData();
    let cleaned = false;

    for (const [guildId, guildData] of Object.entries(data.guilds)) {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) continue;

        // Clean stale active channels
        for (const channelId of Object.keys(guildData.active_channels || {})) {
            const ch = await guild.channels.fetch(channelId).catch(() => null);
            if (!ch) {
                delete guildData.active_channels[channelId];
                cleaned = true;
            }
        }

        // Clean stale hubs
        for (const hubId of Object.keys(guildData.hubs || {})) {
            const ch = await guild.channels.fetch(hubId).catch(() => null);
            if (!ch) {
                delete guildData.hubs[hubId];
                cleaned = true;
            }
        }
    }

    if (cleaned) saveTempVoiceData(data);

    // Restore active giveaway timers
    const gData = loadGiveawaysData();
    for (const [guildId, giveaways] of Object.entries(gData.guilds || {})) {
        for (const g of giveaways) {
            if (!g.ended && g.ends_at > Date.now()) {
                const timer = setTimeout(() => endGiveaway(guildId, g.message_id), g.ends_at - Date.now());
                giveawayTimers.set(g.message_id, timer);
            } else if (!g.ended) {
                endGiveaway(guildId, g.message_id);
            }
        }
    }

    // Restore active reminder timers
    const rData = loadRemindersData();
    for (const r of rData.reminders) {
        const remaining = r.expires_at - Date.now();
        if (remaining > 0) {
            const timer = setTimeout(async () => {
                const ch = await client.channels.fetch(r.channel_id).catch(() => null);
                if (ch) ch.send({ content: `<@${r.user_id}> Reminder: ${r.message}` }).catch(() => {});
                const d = loadRemindersData();
                d.reminders = d.reminders.filter(rem => rem.id !== r.id);
                saveRemindersData(d);
                reminderTimers.delete(r.id);
            }, remaining);
            reminderTimers.set(r.id, timer);
        } else {
            // Expired while offline
            const ch = await client.channels.fetch(r.channel_id).catch(() => null);
            if (ch) ch.send({ content: `<@${r.user_id}> Reminder (delayed): ${r.message}` }).catch(() => {});
            rData.reminders = rData.reminders.filter(rem => rem.id !== r.id);
        }
    }
    saveRemindersData(rData);

    // Recover temp bans from moderation data
    const modDataRecovery = loadModData();
    for (const [gId, guildMod] of Object.entries(modDataRecovery.guilds || {})) {
        for (const c of (guildMod.cases || [])) {
            if (c.type === 'ban' && c.expires_at && !c.unbanned) {
                const expiresMs = c.expires_at * 1000;
                const remaining = expiresMs - Date.now();
                if (remaining > 0) {
                    setTimeout(async () => {
                        try {
                            const g = await client.guilds.fetch(gId).catch(() => null);
                            if (g) {
                                await g.members.unban(c.target_id, 'Temp ban expired').catch(() => {});
                                c.unbanned = true;
                                saveModData(modDataRecovery);
                            }
                        } catch {}
                    }, remaining);
                    console.log(`Recovered temp ban timer for ${c.target_id} in ${gId} (${Math.round(remaining / 1000)}s remaining)`);
                } else {
                    // Expired while offline - unban now
                    try {
                        const g = await client.guilds.fetch(gId).catch(() => null);
                        if (g) {
                            await g.members.unban(c.target_id, 'Temp ban expired (delayed)').catch(() => {});
                            c.unbanned = true;
                        }
                    } catch {}
                }
            }
        }
    }
    saveModData(modDataRecovery);

    // Periodically check for dashboard-created giveaways (every 30s)
    setInterval(() => {
        const gData2 = loadGiveawaysData();
        for (const [gId, giveaways] of Object.entries(gData2.guilds || {})) {
            for (const g of giveaways) {
                if (!g.ended && !giveawayTimers.has(g.message_id)) {
                    if (g.ends_at > Date.now()) {
                        const timer = setTimeout(() => endGiveaway(gId, g.message_id), g.ends_at - Date.now());
                        giveawayTimers.set(g.message_id, timer);
                        console.log(`Synced dashboard giveaway timer: ${g.message_id}`);
                    } else {
                        endGiveaway(gId, g.message_id);
                    }
                }
            }
        }
    }, 30000);

    // Scheduled messages checker (every 60s)
    setInterval(async () => {
        const smData = loadScheduledMessagesData();
        const now = new Date();
        const currentHour = now.getUTCHours();
        const currentMinute = now.getUTCMinutes();
        const currentDay = now.getUTCDay(); // 0=Sun

        for (const [gId, guildData] of Object.entries(smData.guilds || {})) {
            for (const msg of (guildData.messages || [])) {
                if (!msg.enabled) continue;
                let shouldSend = false;

                if (msg.interval === 'once' && !msg.sent) {
                    if (currentHour === msg.cron_hour && currentMinute === msg.cron_minute) shouldSend = true;
                } else if (msg.interval === 'hourly') {
                    if (currentMinute === msg.cron_minute) shouldSend = true;
                } else if (msg.interval === 'daily') {
                    if (currentHour === msg.cron_hour && currentMinute === msg.cron_minute) shouldSend = true;
                } else if (msg.interval === 'weekly') {
                    const dayNum = parseInt(msg.cron_day) || 0;
                    if (currentDay === dayNum && currentHour === msg.cron_hour && currentMinute === msg.cron_minute) shouldSend = true;
                }

                if (shouldSend) {
                    try {
                        const guild = await client.guilds.fetch(gId).catch(() => null);
                        if (!guild) continue;
                        const channel = await guild.channels.fetch(msg.channel_id).catch(() => null);
                        if (!channel) continue;
                        const payload = {};
                        if (msg.content) payload.content = msg.content;
                        if (msg.embed) {
                            const e = cubEmbed();
                            if (msg.embed.title) e.setTitle(msg.embed.title);
                            if (msg.embed.description) e.setDescription(msg.embed.description);
                            if (msg.embed.color) {
                                try { e.setColor(parseInt(String(msg.embed.color).replace('#', ''), 16)); } catch {}
                            }
                            payload.embeds = [e];
                        }
                        await channel.send(payload).catch(() => {});
                        if (msg.interval === 'once') {
                            msg.sent = true;
                            msg.enabled = false;
                            saveScheduledMessagesData(smData);
                        }
                    } catch {}
                }
            }
        }
    }, 60000);

    // Social media feed checker (every 5 min)
    setInterval(async () => {
        const feedData = loadSocialFeedsData();
        for (const [gId, guildFeeds] of Object.entries(feedData.guilds || {})) {
            for (const feed of (guildFeeds.feeds || [])) {
                if (!feed.enabled || !feed.channel_id) continue;
                try {
                    let feedUrl = '';
                    if (feed.platform === 'youtube' && feed.platform_id) {
                        feedUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${feed.platform_id}`;
                    } else if (feed.platform === 'rss' && feed.url) {
                        feedUrl = feed.url;
                    } else continue;

                    const https = require('https');
                    const http = require('http');
                    const fetchModule = feedUrl.startsWith('https') ? https : http;
                    const xml = await new Promise((resolve, reject) => {
                        fetchModule.get(feedUrl, { timeout: 10000 }, (res) => {
                            let data = '';
                            res.on('data', chunk => data += chunk);
                            res.on('end', () => resolve(data));
                        }).on('error', reject);
                    });

                    // Simple XML parsing for <entry> or <item> tags
                    const entries = xml.match(/<entry>[\s\S]*?<\/entry>|<item>[\s\S]*?<\/item>/g) || [];
                    if (entries.length === 0) continue;

                    const latest = entries[0];
                    const titleMatch = latest.match(/<title[^>]*>([\s\S]*?)<\/title>/);
                    const linkMatch = latest.match(/<link[^>]*href="([^"]*)"/) || latest.match(/<link>([\s\S]*?)<\/link>/);
                    const pubMatch = latest.match(/<published>([\s\S]*?)<\/published>/) || latest.match(/<pubDate>([\s\S]*?)<\/pubDate>/);

                    const title = titleMatch?.[1]?.replace(/<!\[CDATA\[|\]\]>/g, '').trim() || 'New Post';
                    const link = linkMatch?.[1]?.trim() || '';
                    const pubDate = pubMatch?.[1]?.trim() || '';

                    // Check if this is new
                    const postId = link || title;
                    if (feed.last_post_id === postId) continue;

                    // Check if publish date is recent (within last 10 min)
                    if (pubDate) {
                        const pubTime = new Date(pubDate).getTime();
                        if (Date.now() - pubTime > 600000) {
                            // Not new, just first check - set last_post_id without notifying
                            if (!feed.last_post_id) { feed.last_post_id = postId; saveSocialFeedsData(feedData); }
                            continue;
                        }
                    }

                    feed.last_post_id = postId;
                    saveSocialFeedsData(feedData);

                    const guild = await client.guilds.fetch(gId).catch(() => null);
                    if (!guild) continue;
                    const channel = await guild.channels.fetch(feed.channel_id).catch(() => null);
                    if (!channel) continue;

                    const platformColors = { youtube: 0xFF0000, twitch: 0x9146FF, rss: 0xFF8C00 };
                    const platformNames = { youtube: 'YouTube', twitch: 'Twitch', rss: 'RSS Feed' };
                    const msg = (feed.message || '{name} posted: **{title}**\n{link}')
                        .replace(/{name}/g, feed.name || 'Unknown')
                        .replace(/{title}/g, title)
                        .replace(/{link}/g, link);

                    const embed = cubEmbed()
                        .setColor(platformColors[feed.platform] || 0x5865F2)
                        .setTitle(`New ${platformNames[feed.platform] || 'Feed'} Post`)
                        .setDescription(msg)
                        .setTimestamp();
                    if (link) embed.setURL(link);

                    const payload = { embeds: [embed] };
                    if (feed.ping_role) {
                        payload.content = feed.ping_role === 'everyone' ? '@everyone' : `<@&${feed.ping_role}>`;
                    }
                    await channel.send(payload).catch(() => {});
                } catch {}
            }
        }
    }, 300000); // 5 minutes

    // ==================== LIVE ALERTS ====================
    // Twitch OAuth token cache (client credentials)
    let twitchAccessToken = null;
    let twitchTokenExpiry = 0;

    async function getTwitchToken() {
        if (twitchAccessToken && Date.now() < twitchTokenExpiry - 60000) return twitchAccessToken;
        const clientId = process.env.TWITCH_CLIENT_ID;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;
        if (!clientId || !clientSecret) return null;
        const https = require('https');
        const postData = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
        const tokenData = await new Promise(resolve => {
            const req = https.request({
                hostname: 'id.twitch.tv', path: '/oauth2/token', method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
            }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
            });
            req.on('error', () => resolve(null));
            req.write(postData);
            req.end();
        });
        if (!tokenData?.access_token) return null;
        twitchAccessToken = tokenData.access_token;
        twitchTokenExpiry = Date.now() + (tokenData.expires_in * 1000);
        return twitchAccessToken;
    }

    async function checkTwitchLive(username) {
        const token = await getTwitchToken();
        if (!token) return null;
        const clientId = process.env.TWITCH_CLIENT_ID;
        const https = require('https');
        return new Promise(resolve => {
            https.get({
                hostname: 'api.twitch.tv',
                path: `/helix/streams?user_login=${encodeURIComponent(username)}`,
                headers: { 'Client-Id': clientId, 'Authorization': `Bearer ${token}` }
            }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(d);
                        const stream = json.data?.[0];
                        if (!stream) return resolve(null);
                        resolve({ id: stream.id, title: stream.title, game: stream.game_name, url: `https://twitch.tv/${username}`, viewers: stream.viewer_count });
                    } catch { resolve(null); }
                });
            }).on('error', () => resolve(null));
        });
    }

    async function checkYoutubeLive(channelId) {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey || !channelId) return null;
        const https = require('https');
        return new Promise(resolve => {
            https.get(`https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&eventType=live&type=video&key=${encodeURIComponent(apiKey)}`, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(d);
                        const item = json.items?.[0];
                        if (!item) return resolve(null);
                        const videoId = item.id?.videoId;
                        resolve({ id: videoId, title: item.snippet?.title, game: '', url: `https://youtube.com/watch?v=${videoId}`, viewers: 0 });
                    } catch { resolve(null); }
                });
            }).on('error', () => resolve(null));
        });
    }

    async function checkKickLive(username) {
        const https = require('https');
        return new Promise(resolve => {
            https.get({ hostname: 'kick.com', path: `/api/v1/channels/${encodeURIComponent(username)}`, headers: { 'User-Agent': 'Mozilla/5.0 CUBProtector/1.0' } }, res => {
                let d = '';
                res.on('data', c => d += c);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(d);
                        const ls = json.livestream;
                        if (!ls) return resolve(null);
                        resolve({ id: String(ls.id), title: ls.session_title || ls.title || 'Live', game: ls.categories?.[0]?.name || '', url: `https://kick.com/${username}`, viewers: ls.viewer_count || 0 });
                    } catch { resolve(null); }
                });
            }).on('error', () => resolve(null));
        });
    }

    // Live alerts polling — check every 2 minutes
    setInterval(async () => {
        const alertData = loadLiveAlertsData();
        let changed = false;
        const platformColors = { twitch: 0x9146FF, youtube: 0xFF0000, kick: 0x53FC18 };
        const platformNames = { twitch: 'Twitch', youtube: 'YouTube', kick: 'Kick' };
        const platformEmojis = { twitch: '🟣', youtube: '🔴', kick: '🟢' };

        for (const [gId, guildConfig] of Object.entries(alertData.guilds || {})) {
            if (!guildConfig.enabled || !guildConfig.alert_channel) continue;
            for (const streamer of (guildConfig.streamers || [])) {
                if (!streamer.enabled) continue;
                try {
                    let streamInfo = null;
                    if (streamer.platform === 'twitch') streamInfo = await checkTwitchLive(streamer.username);
                    else if (streamer.platform === 'youtube') streamInfo = await checkYoutubeLive(streamer.platform_id || streamer.username);
                    else if (streamer.platform === 'kick') streamInfo = await checkKickLive(streamer.username);

                    const nowLive = !!streamInfo;
                    const wasLive = !!streamer.is_live;
                    const newStreamId = streamInfo?.id || '';

                    if (nowLive && (!wasLive || (newStreamId && newStreamId !== streamer.last_stream_id))) {
                        // Went live — send alert
                        streamer.is_live = true;
                        streamer.last_stream_id = newStreamId;
                        changed = true;

                        const guild = await client.guilds.fetch(gId).catch(() => null);
                        if (!guild) continue;
                        const channel = await guild.channels.fetch(guildConfig.alert_channel).catch(() => null);
                        if (!channel) continue;

                        const displayName = streamer.display_name || streamer.username;
                        const platform = streamer.platform;
                        const emoji = platformEmojis[platform] || '🔴';
                        const platformName = platformNames[platform] || platform;

                        const alertMsg = (streamer.message || `${emoji} **{username}** is now live on {platform}!\n{url}`)
                            .replace(/{username}/g, displayName)
                            .replace(/{title}/g, streamInfo.title || 'Untitled Stream')
                            .replace(/{game}/g, streamInfo.game || '')
                            .replace(/{url}/g, streamInfo.url || '')
                            .replace(/{platform}/g, platformName)
                            .replace(/{emoji}/g, emoji)
                            .replace(/{viewers}/g, (streamInfo.viewers || 0).toLocaleString());

                        const embed = cubEmbed()
                            .setColor(platformColors[platform] || 0x5865F2)
                            .setTitle(`${emoji} ${displayName} is Live on ${platformName}!`)
                            .setDescription(alertMsg)
                            .setTimestamp();
                        if (streamInfo.url) embed.setURL(streamInfo.url);
                        if (streamInfo.title) embed.addFields({ name: 'Stream Title', value: streamInfo.title, inline: true });
                        if (streamInfo.game) embed.addFields({ name: 'Playing', value: streamInfo.game, inline: true });
                        if (streamInfo.viewers) embed.addFields({ name: 'Viewers', value: streamInfo.viewers.toLocaleString(), inline: true });

                        const payload = { embeds: [embed] };
                        if (streamer.ping_role) {
                            payload.content = streamer.ping_role === 'everyone' ? '@everyone' : streamer.ping_role === 'here' ? '@here' : `<@&${streamer.ping_role}>`;
                        }
                        const sentMsg = await channel.send(payload).catch(() => null);
                        if (sentMsg && streamer.auto_delete) {
                            streamer.alert_message_id = sentMsg.id;
                            streamer.alert_channel_id = channel.id;
                        }
                    } else if (!nowLive && wasLive) {
                        streamer.is_live = false;
                        streamer.last_stream_id = '';
                        changed = true;
                        // Auto-delete the live alert message when stream ends
                        if (streamer.auto_delete && streamer.alert_message_id && streamer.alert_channel_id) {
                            try {
                                const guild = await client.guilds.fetch(gId).catch(() => null);
                                if (guild) {
                                    const ch = await guild.channels.fetch(streamer.alert_channel_id).catch(() => null);
                                    if (ch) await ch.messages.fetch(streamer.alert_message_id).then(m => m.delete()).catch(() => {});
                                }
                            } catch {}
                            streamer.alert_message_id = null;
                            streamer.alert_channel_id = null;
                        }
                    }
                } catch {}
            }
        }
        if (changed) saveLiveAlertsData(alertData);
    }, 2 * 60 * 1000);

    // Apply saved presence (custom bot mode only)
    applyBotPresence();

    // Poll for presence changes every 30 seconds (custom bot mode only)
    if (CUSTOM_GUILD_ID) {
        setInterval(applyBotPresence, 30 * 1000);
    }

    // Counter channels — update on boot then every 5 minutes
    // (Discord rate-limits channel renames to 2 per 10 min per channel)
    updateCounters();
    setInterval(updateCounters, 5 * 60 * 1000);

    // ==================== Reddit Feed Polling (every 15 min) ====================
    setInterval(async () => {
        const fData = loadFeedsData();
        let changed = false;
        for (const [gId, guildFeeds] of Object.entries(fData.guilds || {})) {
            for (const feed of guildFeeds.reddit || []) {
                try {
                    const url = `https://www.reddit.com/r/${feed.subreddit}/${feed.type}.json?limit=5`;
                    const json = await fetchJson(url);
                    const posts = json?.data?.children || [];
                    for (const { data: post } of posts.reverse()) {
                        if (post.stickied || post.over_18) continue;
                        if (feed.last_id === post.id) continue;
                        if (post.created_utc * 1000 < Date.now() - 2 * 60 * 60 * 1000) continue;
                        const ch = await client.channels.fetch(feed.channel_id).catch(() => null);
                        if (!ch) continue;
                        const embed = cubEmbed().setColor(0xFF4500)
                            .setTitle(post.title.substring(0, 256))
                            .setURL(`https://reddit.com${post.permalink}`)
                            .setFooter({ text: `r/${feed.subreddit} • u/${post.author}` });
                        if (post.url && (post.url.endsWith('.jpg') || post.url.endsWith('.png') || post.url.endsWith('.gif') || post.url.endsWith('.webp'))) embed.setImage(post.url);
                        else if (post.selftext) embed.setDescription(post.selftext.substring(0, 300));
                        await ch.send({ embeds: [embed] }).catch(() => {});
                        feed.last_id = post.id;
                        changed = true;
                    }
                } catch {}
            }
        }
        if (changed) saveFeedsData(fData);
    }, 15 * 60 * 1000);

    // ==================== News RSS Feed Polling (every 30 min) ====================
    setInterval(async () => {
        const fData = loadFeedsData();
        let changed = false;
        for (const [gId, guildFeeds] of Object.entries(fData.guilds || {})) {
            for (const feed of guildFeeds.news || []) {
                try {
                    const https = require('https');
                    const http = require('http');
                    const xml = await new Promise((resolve, reject) => {
                        const mod = feed.url.startsWith('https') ? https : http;
                        const req = mod.get(feed.url, { headers: { 'User-Agent': 'CUB-PROTECTOR-Bot/1.0' } }, res => {
                            let raw = ''; res.on('data', c => raw += c); res.on('end', () => resolve(raw));
                        });
                        req.on('error', reject);
                        req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
                    });
                    const items = parseRssItems(xml, 3);
                    for (const item of items.reverse()) {
                        if (!item.link || item.link === feed.last_link) continue;
                        const ch = await client.channels.fetch(feed.channel_id).catch(() => null);
                        if (!ch) continue;
                        const embed = cubEmbed().setColor(0x3498DB)
                            .setTitle(item.title.substring(0, 256) || 'New Article')
                            .setURL(item.link)
                            .setFooter({ text: feed.name });
                        await ch.send({ embeds: [embed] }).catch(() => {});
                        feed.last_link = item.link;
                        changed = true;
                    }
                } catch {}
            }
        }
        if (changed) saveFeedsData(fData);
    }, 30 * 60 * 1000);

    // ==================== Meme & Quote of the Day (check every hour) ====================
    setInterval(async () => {
        const today = new Date().toISOString().split('T')[0];
        const fData = loadFeedsData();
        let changed = false;
        for (const [gId, guildFeeds] of Object.entries(fData.guilds || {})) {
            // Meme of the Day
            if (guildFeeds.meme_of_day && guildFeeds.last_meme_date !== today) {
                try {
                    const json = await fetchJson('https://www.reddit.com/r/memes/hot.json?limit=25');
                    const posts = (json?.data?.children || []).filter(p => !p.data.stickied && !p.data.over_18 && p.data.url?.match(/\.(jpg|png|gif|webp)$/i));
                    if (posts.length > 0) {
                        const post = posts[Math.floor(Math.random() * Math.min(posts.length, 10))].data;
                        const ch = await client.channels.fetch(guildFeeds.meme_of_day).catch(() => null);
                        if (ch) {
                            const embed = cubEmbed().setColor(0xFF6B35).setTitle(`😂 Meme of the Day`).setImage(post.url).setURL(`https://reddit.com${post.permalink}`).setFooter({ text: post.title });
                            await ch.send({ embeds: [embed] }).catch(() => {});
                            guildFeeds.last_meme_date = today;
                            changed = true;
                        }
                    }
                } catch {}
            }
            // Quote of the Day
            if (guildFeeds.quote_of_day && guildFeeds.last_quote_date !== today) {
                try {
                    const json = await fetchJson('https://api.quotable.io/random?maxLength=200');
                    const ch = await client.channels.fetch(guildFeeds.quote_of_day).catch(() => null);
                    if (ch && json?.content) {
                        const embed = cubEmbed().setColor(0x9B59B6).setTitle('💬 Quote of the Day').setDescription(`*"${json.content}"*`).setFooter({ text: `— ${json.author}` });
                        await ch.send({ embeds: [embed] }).catch(() => {});
                        guildFeeds.last_quote_date = today;
                        changed = true;
                    }
                } catch {}
            }
        }
        if (changed) saveFeedsData(fData);
    }, 60 * 60 * 1000);

    // ── Terminal, CubReactive, Log Server (main bot only) ─────────────────────
    if (terminal) terminal.init();
    if (!CUSTOM_GUILD_ID) {
        scanAllVoiceChannels();
        startCubReactiveWebSocket();
        startLogServer();
    }
    if (CUSTOM_GUILD_ID) startCrBotPeer();

    // ── Rotating Presence (main bot only) ─────────────────────────────────────
    if (!CUSTOM_GUILD_ID) {
        const presences = [
            { activities: [{ name: 'CUB is my Owner', type: 2 }], status: 'online' }, // Listening to CUB is my Owner
            { activities: [{ name: 'Developed by CUBSOFTWARE', type: 3 }], status: 'online' }, // Watching ...
            { activities: [{ name: 'https://cubsoftware.site', type: 3 }], status: 'online' }, // Watching ...
        ];
        let presIdx = 0;
        client.user.setPresence(presences[0]);
        setInterval(() => {
            presIdx = (presIdx + 1) % presences.length;
            client.user.setPresence(presences[presIdx]);
        }, 20000);
    }

    // ── Daily cleanup of tmp_cubai_* files at midnight ────────────────────────
    function cleanTmpCubAiFiles() {
        try {
            const files = fs.readdirSync(__dirname);
            let deleted = 0;
            files.forEach(f => {
                if (/^tmp_cubai_in_/.test(f) && f.endsWith('.wav')) {
                    try { fs.unlinkSync(path.join(__dirname, f)); deleted++; } catch (_) {}
                }
            });
            if (deleted > 0) {
                console.log(`[CubAI] Cleaned up ${deleted} tmp file(s)`);
                try {
                    execSync('git add .', { cwd: __dirname });
                    console.log('[CubAI] git add . complete');
                } catch (e) { console.error('[CubAI] git add error:', e.message); }
            }
        } catch (e) { console.error('[CubAI] Cleanup error:', e.message); }
    }
    function scheduleMidnightCleanup() {
        const now = new Date();
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        setTimeout(() => { cleanTmpCubAiFiles(); setInterval(cleanTmpCubAiFiles, 24 * 60 * 60 * 1000); }, midnight - now);
    }
    scheduleMidnightCleanup();

    console.log('CUB PROTECTOR is ready!');
});

// ============================================================
// Error handlers — ensure crashes appear in PM2 logs
// ============================================================
process.on('unhandledRejection', (reason) => {
    console.error('[FATAL] Unhandled Promise Rejection:', reason);
    if (terminal) terminal.logEvent(`Unhandled rejection: ${reason}`, 'error');
});
process.on('uncaughtException', (err) => {
    console.error('[FATAL] Uncaught Exception:', err);
    if (terminal) terminal.logEvent(`Uncaught exception: ${err.message}`, 'error');
    process.exit(1);
});

// ============================================================
// Login
// ============================================================
client.login(TOKEN).catch(err => {
    console.error('[FATAL] client.login() failed:', err.message);
    console.error('TOKEN present:', !!TOKEN, '| CLIENT_ID:', CLIENT_ID, '| CUSTOM_GUILD_ID:', CUSTOM_GUILD_ID);
    process.exit(1);
});
