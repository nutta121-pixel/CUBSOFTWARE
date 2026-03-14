const { Events } = require('discord.js');
const { db } = require('../../database/schema');

module.exports = {
    name: Events.VoiceStateUpdate,

    async execute(oldState, newState) {
        const userId = newState.member.id;

        // Skip enforcement for bot owner
        if (userId === process.env.OWNER_ID) {
            return;
        }

        const serverId = newState.guild.id;
        const now = Math.floor(Date.now() / 1000);

        try {
            // Check for active confinement
            const confinement = db.prepare(`
                SELECT * FROM solitary_confinement
                WHERE user_id = ? AND server_id = ? AND active = 1 AND expires_at > ?
            `).get(userId, serverId, now);

            if (!confinement) {
                return; // No active confinement
            }

            // Determine if user is violating confinement
            const isInWrongChannel = newState.channelId && newState.channelId !== confinement.channel_id;
            const leftConfinementChannel = !newState.channelId && oldState.channelId === confinement.channel_id;

            // If user is in wrong channel or left the confinement channel, move them back
            if (isInWrongChannel || leftConfinementChannel) {
                const confinementChannel = await newState.guild.channels.fetch(confinement.channel_id);

                if (confinementChannel) {
                    try {
                        await newState.member.voice.setChannel(confinementChannel, 'Solitary confinement enforcement');
                        console.log(`[Confinement] Moved ${newState.member.user.tag} back to confinement channel in ${newState.guild.name}`);
                    } catch (error) {
                        console.error('Error enforcing confinement:', error);
                    }
                }
            }

        } catch (error) {
            console.error('Error checking confinement:', error);
        }
    }
};
