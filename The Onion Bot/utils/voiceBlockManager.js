/**
 * Blocks a user from joining a specific voice channel
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID to block
 * @param {string} channelId - The voice channel ID to block them from
 * @returns {boolean} Success status
 */
function blockUserFromChannel(client, guildId, userId, channelId) {
    const blockKey = `${guildId}-${userId}-${channelId}`;

    // Check if user is already blocked from this channel
    if (client.voiceChannelBlocks.has(blockKey)) {
        return false;
    }

    // Store block data
    client.voiceChannelBlocks.set(blockKey, {
        guildId,
        userId,
        channelId,
        blockedAt: Date.now()
    });

    console.log(`[VOICE BLOCK] User ${userId} blocked from channel ${channelId} in guild ${guildId}`);
    return true;
}

/**
 * Unblocks a user from a specific voice channel
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID to unblock
 * @param {string} channelId - The voice channel ID to unblock them from
 * @returns {boolean} Success status
 */
function unblockUserFromChannel(client, guildId, userId, channelId) {
    const blockKey = `${guildId}-${userId}-${channelId}`;

    if (!client.voiceChannelBlocks.has(blockKey)) {
        return false;
    }

    client.voiceChannelBlocks.delete(blockKey);
    console.log(`[VOICE UNBLOCK] User ${userId} unblocked from channel ${channelId} in guild ${guildId}`);
    return true;
}

/**
 * Checks if a user is blocked from a specific voice channel
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @param {string} channelId - The voice channel ID
 * @returns {boolean} Block status
 */
function isUserBlockedFromChannel(client, guildId, userId, channelId) {
    const blockKey = `${guildId}-${userId}-${channelId}`;
    return client.voiceChannelBlocks.has(blockKey);
}

/**
 * Gets all channels a user is blocked from in a guild
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {string} userId - The user ID
 * @returns {Array<string>} Array of blocked channel IDs
 */
function getBlockedChannelsForUser(client, guildId, userId) {
    const blockedChannels = [];

    for (const [key, data] of client.voiceChannelBlocks.entries()) {
        if (data.guildId === guildId && data.userId === userId) {
            blockedChannels.push(data.channelId);
        }
    }

    return blockedChannels;
}

/**
 * Gets all users blocked from a specific channel
 * @param {Client} client - Discord client
 * @param {string} guildId - The guild ID
 * @param {string} channelId - The voice channel ID
 * @returns {Array<string>} Array of blocked user IDs
 */
function getBlockedUsersForChannel(client, guildId, channelId) {
    const blockedUsers = [];

    for (const [key, data] of client.voiceChannelBlocks.entries()) {
        if (data.guildId === guildId && data.channelId === channelId) {
            blockedUsers.push(data.userId);
        }
    }

    return blockedUsers;
}

module.exports = {
    blockUserFromChannel,
    unblockUserFromChannel,
    isUserBlockedFromChannel,
    getBlockedChannelsForUser,
    getBlockedUsersForChannel
};
