const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { debug } = require('../utils/debug');
const webhookLogger = require('../utils/webhookLogger');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Release from Confinement')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        debug('[RELEASE] === EXECUTE START ===');
        debug('[RELEASE] User:', interaction.user.tag);
        const targetUser = interaction.targetUser;
        const targetMember = interaction.targetMember;
        debug('[RELEASE] Target:', targetUser.tag);

        const confinementKey = `${interaction.guildId}-${targetUser.id}`;
        debug('[RELEASE] Checking confinement for key:', confinementKey);
        const confinementData = interaction.client.activeConfinements?.get(confinementKey);

        if (!confinementData) {
            debug('[RELEASE] User is NOT confined');
            return await interaction.reply({
                content: `**${targetUser.tag}** is not in solitary confinement!`,
                ephemeral: true
            });
        }

        debug('[RELEASE] User IS confined, getting details...');
        // Get confinement details
        let channelName = 'Unknown Channel';
        try {
            debug('[RELEASE] Fetching channel ID:', confinementData.channelId);
            const channel = await interaction.guild.channels.fetch(confinementData.channelId);
            if (channel) {
                channelName = channel.name;
                debug('[RELEASE] Channel name:', channelName);
            }
        } catch (error) {
            console.error('[ERROR] Failed to fetch channel:', error.message);
        }

        const remainingTime = confinementData.endTime ?
            this.formatRemaining(confinementData.endTime - Date.now()) :
            'Permanent';
        debug('[RELEASE] Remaining time:', remainingTime);

        // Clear timeout if exists
        debug('[RELEASE] Clearing timeout if exists...');
        if (confinementData.timeoutId) {
            clearTimeout(confinementData.timeoutId);
            debug('[RELEASE] Timeout cleared');
        }

        // Unmute the user
        debug('[RELEASE] Checking if user needs to be unmuted...');
        try {
            if (targetMember.voice.serverMute) {
                debug('[RELEASE] User is server muted, unmuting...');
                await targetMember.voice.setMute(false, 'Released from solitary confinement');
                debug('[RELEASE] User unmuted successfully');
            } else {
                debug('[RELEASE] User is not server muted');
            }
        } catch (error) {
            console.error('[ERROR] Failed to unmute user on release:', error.message);
        }

        // Remove confinement
        debug('[RELEASE] Removing confinement from active list...');
        interaction.client.activeConfinements.delete(confinementKey);
        debug('[RELEASE] Confinement removed');

        console.log(`[CONFINEMENT] ${targetUser.tag} released from solitary confinement by ${interaction.user.tag}`);

        // Send webhook notification
        webhookLogger.logCustom({
            title: '🔓 Released from Confinement',
            description: `**${targetUser.tag}** has been manually released from solitary confinement`,
            color: 0x2ed573,
            fields: [
                { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                { name: '👮 Released By', value: `<@${interaction.user.id}>`, inline: true },
                { name: '🔊 Channel', value: `#${channelName}`, inline: true },
                { name: '⏱️ Time Remaining', value: remainingTime, inline: true },
                { name: '🏠 Server', value: interaction.guild.name, inline: true }
            ]
        });

        debug('[RELEASE] Sending success message...');
        await interaction.reply({
            content: `✅ **${targetUser.tag}** has been released from solitary confinement!\n\n` +
                     `**Previous confinement channel:** #${channelName}\n` +
                     `**Remaining time:** ${remainingTime}`,
            ephemeral: true
        });
        debug('[RELEASE] Success message sent!');
        debug('[RELEASE] === EXECUTE END ===');
    },

    formatRemaining(ms) {
        if (ms <= 0) return 'Expired';

        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m`;
        } else {
            return `${Math.floor(ms / 1000)}s`;
        }
    }
};
