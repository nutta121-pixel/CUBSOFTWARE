const { isUserBlockedFromChannel } = require('../utils/voiceBlockManager');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState) {
        const client = newState.client;
        const userId = newState.id;
        const guildId = newState.guild.id;

        // Check for voice channel blocks first (highest priority)
        if (newState.channel) {
            const isBlocked = isUserBlockedFromChannel(client, guildId, userId, newState.channelId);

            if (isBlocked) {
                try {
                    await newState.disconnect('Blocked from this voice channel');
                    console.log(`[VOICE BLOCK] Disconnected ${newState.member.user.tag} from blocked channel ${newState.channel.name}`);
                } catch (error) {
                    console.error(`[ERROR] Failed to disconnect blocked user:`, error.message);
                }
                return; // Don't check other restrictions if blocked
            }
        }

        // Check for solitary confinement second (high priority)
        const confinementKey = `${guildId}-${userId}`;
        const confinementData = client.activeConfinements?.get(confinementKey);

        if (confinementData && newState.channel) {
            // User is confined and joined/changed a channel
            const confinedChannelId = confinementData.channelId;

            // If they're in the wrong channel, move them back
            if (newState.channelId !== confinedChannelId) {
                try {
                    const confinedChannel = await newState.guild.channels.fetch(confinedChannelId);
                    await newState.member.voice.setChannel(confinedChannel, 'Solitary confinement active');

                    const remaining = confinementData.endTime ?
                        ` (${this.formatRemaining(confinementData.endTime - Date.now())} remaining)` :
                        ' (permanent)';

                    console.log(`[CONFINEMENT] Moved ${newState.member.user.tag} back to confinement channel${remaining}`);
                } catch (error) {
                    console.error(`[ERROR] Failed to move confined user:`, error.message);
                }
                return; // Don't check mute if confined
            }
        }

        // Check if user has an active mute in this guild
        const muteKey = `${guildId}-${userId}`;
        const muteData = client.activeMutes.get(muteKey);

        if (muteData) {
            // Check if user left voice channel while muted
            if (oldState.channel && !newState.channel) {
                const remaining = muteData.endTime - Date.now();
                const minutes = Math.floor(remaining / 60000);
                const seconds = Math.floor((remaining % 60000) / 1000);
                const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                console.log(`[MUTE] ${newState.member.user.tag} left voice channel while muted (${timeStr} remaining)`);
                return;
            }

            // Only re-apply mute if user actually joined or changed channels
            if (newState.channel && oldState.channelId !== newState.channelId) {
                // User joined/changed channel and has an active mute
                // Re-apply server mute
                try {
                    await newState.setMute(true, 'Active server mute');
                    const remaining = muteData.endTime - Date.now();
                    const minutes = Math.floor(remaining / 60000);
                    const seconds = Math.floor((remaining % 60000) / 1000);
                    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
                    console.log(`[MUTE] Re-applied mute to ${newState.member.user.tag} (${timeStr} remaining)`);
                } catch (error) {
                    // Check if user disconnected from voice
                    if (error.code === 40032) {
                        console.log(`[INFO] User ${newState.member.user.tag} left voice while muted`);
                    } else {
                        console.error(`[ERROR] Failed to re-apply mute:`, error.message);
                    }
                }
            }
        }
    },

    formatRemaining(ms) {
        if (ms <= 0) return '0s';

        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${Math.floor(ms / 1000)}s`;
        }
    }
};
