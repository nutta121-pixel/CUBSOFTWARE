const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const { unmuteUser, isUserMuted, getRemainingMuteTime } = require('../utils/muteManager');
const { debug } = require('../utils/debug');
const webhookLogger = require('../utils/webhookLogger');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Unmute User')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    async execute(interaction) {
        debug('[UNMUTE] === EXECUTE START ===');
        debug('[UNMUTE] User:', interaction.user.tag);
        const targetUser = interaction.targetUser;
        const targetMember = interaction.targetMember;
        debug('[UNMUTE] Target:', targetUser.tag);

        // Check if user is muted
        debug('[UNMUTE] Checking if user is muted...');
        if (!isUserMuted(interaction.client, interaction.guildId, targetUser.id)) {
            debug('[UNMUTE] User is NOT muted - cannot unmute');
            return await interaction.reply({
                content: `**${targetUser.tag}** is not muted!`,
                ephemeral: true
            });
        }

        debug('[UNMUTE] User IS muted, proceeding with unmute...');
        // Get remaining time
        const remainingTime = getRemainingMuteTime(interaction.client, interaction.guildId, targetUser.id);
        const timeLeft = this.formatDuration(remainingTime);
        debug('[UNMUTE] Remaining mute time:', timeLeft);

        // Unmute the user
        debug('[UNMUTE] Calling unmuteUser function...');
        const success = await unmuteUser(
            interaction.client,
            interaction.guild,
            targetMember
        );
        debug('[UNMUTE] Unmute result:', success);

        if (success) {
            debug('[UNMUTE] Sending success message...');

            // Send webhook notification
            webhookLogger.logCustom({
                title: '🔊 User Unmuted',
                description: `**${targetUser.tag}** has been unmuted`,
                color: 0x2ed573,
                fields: [
                    { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                    { name: '👮 Unmuted By', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '⏱️ Time Remaining', value: timeLeft, inline: true },
                    { name: '🏠 Server', value: interaction.guild.name, inline: true }
                ]
            });

            await interaction.reply({
                content: `✅ Successfully unmuted **${targetUser.tag}**!\n\nThey had **${timeLeft}** remaining on their mute.`,
                ephemeral: true
            });
            debug('[UNMUTE] Success message sent!');
        } else {
            debug('[UNMUTE] Sending failure message...');
            await interaction.reply({
                content: `Failed to unmute **${targetUser.tag}**!`,
                ephemeral: true
            });
            debug('[UNMUTE] Failure message sent!');
        }
        debug('[UNMUTE] === EXECUTE END ===');
    },

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return `${hours}h ${remainingMinutes}m`;
        } else if (minutes > 0) {
            const remainingSeconds = seconds % 60;
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            return `${seconds}s`;
        }
    }
};
