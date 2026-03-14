/**
 * Guild Settings Manager
 * Stores per-server configuration in a JSON file
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_FILE = path.join(__dirname, '..', 'data', 'guildSettings.json');

// Ensure data directory exists
const dataDir = path.dirname(SETTINGS_FILE);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Load settings from file
function loadSettings() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const data = fs.readFileSync(SETTINGS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('[ERROR] Failed to load guild settings:', error.message);
    }
    return {};
}

// Save settings to file
function saveSettings(settings) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
        return true;
    } catch (error) {
        console.error('[ERROR] Failed to save guild settings:', error.message);
        return false;
    }
}

// In-memory cache
let settingsCache = loadSettings();

/**
 * Get settings for a guild
 * @param {string} guildId
 * @returns {object} Guild settings
 */
function getGuildSettings(guildId) {
    return settingsCache[guildId] || {
        confinementChannelId: null,
        logChannelId: null,
        setupComplete: false
    };
}

/**
 * Update settings for a guild
 * @param {string} guildId
 * @param {object} newSettings
 * @returns {boolean} Success
 */
function updateGuildSettings(guildId, newSettings) {
    const currentSettings = getGuildSettings(guildId);
    settingsCache[guildId] = { ...currentSettings, ...newSettings };
    return saveSettings(settingsCache);
}

/**
 * Get the confinement channel for a guild
 * @param {string} guildId
 * @returns {string|null} Channel ID or null
 */
function getConfinementChannel(guildId) {
    const settings = getGuildSettings(guildId);
    return settings.confinementChannelId;
}

/**
 * Set the confinement channel for a guild
 * @param {string} guildId
 * @param {string} channelId
 * @returns {boolean} Success
 */
function setConfinementChannel(guildId, channelId) {
    return updateGuildSettings(guildId, { confinementChannelId: channelId });
}

/**
 * Check if a guild has completed setup
 * @param {string} guildId
 * @returns {boolean}
 */
function isSetupComplete(guildId) {
    const settings = getGuildSettings(guildId);
    return settings.setupComplete && settings.confinementChannelId !== null;
}

/**
 * Mark setup as complete for a guild
 * @param {string} guildId
 * @returns {boolean} Success
 */
function markSetupComplete(guildId) {
    return updateGuildSettings(guildId, { setupComplete: true });
}

module.exports = {
    getGuildSettings,
    updateGuildSettings,
    getConfinementChannel,
    setConfinementChannel,
    isSetupComplete,
    markSetupComplete
};
