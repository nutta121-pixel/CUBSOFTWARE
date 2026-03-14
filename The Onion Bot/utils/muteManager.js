const { PermissionFlagsBits } = require('discord.js');
const webhookLogger = require('./webhookLogger');

/**
 * Mutes a user in the guild for a specified duration
 * @param {Client} client - Discord client
 * @param {Guild} guild - The guild
 * @param {GuildMember} member - The member to mute
 * @param {number} duration - Duration in milliseconds
 * @returns {Promise<boolean>} Success status
 */
async function muteUser(client, guild, member, duration) {
    const muteKey = `${guild.id}-${member.id}`;

    // Check if user is already muted
    if (client.activeMutes.has(muteKey)) {
        return false;
    }

    try {
        // If user is in a voice channel, mute them
        if (member.voice.channel) {
            await member.voice.setMute(true, 'Server mute applied');
        }

        // Calculate end time
        const endTime = Date.now() + duration;

        // Set timeout for auto-unmute
        const timeoutId = setTimeout(async () => {
            await unmuteUser(client, guild, member);

            // Send webhook notification for auto-unmute
            webhookLogger.logCustom({
                title: '🔊 Auto-Unmuted',
                description: `**${member.user.tag}** has been automatically unmuted`,
                color: 0x2ed573,
                fields: [
                    { name: '👤 User', value: `<@${member.id}>`, inline: true },
                    { name: '🏠 Server', value: guild.name, inline: true },
                    { name: '📋 Reason', value: 'Mute duration expired', inline: true }
                ]
            });
        }, duration);

        // Store mute data
        client.activeMutes.set(muteKey, {
            guildId: guild.id,
            userId: member.id,
            endTime,
            timeoutId
        });

        const minutes = Math.floor(duration / 60000);
        const seconds = Math.floor((duration % 60000) / 1000);
        const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        const expiresAt = new Date(endTime).toLocaleTimeString();

        console.log(`[MUTE] Muted ${member.user.tag} in ${guild.name} for ${timeStr} (expires at ${expiresAt})`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Failed to mute user:`, error);
        return false;
    }
}

/**
 * Unmutes a user in the guild
 * @param {Client} client - Discord client
 * @param {Guild} guild - The guild
 * @param {GuildMember} member - The member to unmute
 * @returns {Promise<boolean>} Success status
 */
async function unmuteUser(client, guild, member) {
    const muteKey = `${guild.id}-${member.id}`;

    const muteData = client.activeMutes.get(muteKey);
    if (!muteData) {
        return false;
    }

    try {
        // Clear the timeout
        if (muteData.timeoutId) {
            clearTimeout(muteData.timeoutId);
        }

        // Remove from active mutes
        client.activeMutes.delete(muteKey);

        // If user is in a voice channel, unmute them
        if (member.voice.channel) {
            await member.voice.setMute(false, 'Server mute removed');
        }

        console.log(`[UNMUTE] Unmuted ${member.user.tag} in ${guild.name}`);
        return true;
    } catch (error) {
        console.error(`[ERROR] Failed to unmute user:`, error);
        return false;
    }
}

/**
 * Checks if a user is currently muted in a guild
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {boolean} Mute status
 */
function isUserMuted(client, guildId, userId) {
    const muteKey = `${guildId}-${userId}`;
    return client.activeMutes.has(muteKey);
}

/**
 * Gets remaining mute time for a user
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {number|null} Remaining time in milliseconds or null
 */
function getRemainingMuteTime(client, guildId, userId) {
    const muteKey = `${guildId}-${userId}`;
    const muteData = client.activeMutes.get(muteKey);

    if (!muteData) {
        return null;
    }

    return Math.max(0, muteData.endTime - Date.now());
}

module.exports = {
    muteUser,
    unmuteUser,
    isUserMuted,
    getRemainingMuteTime
};
