const { ContextMenuCommandBuilder, ApplicationCommandType, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, InteractionResponseType } = require('discord.js');
const { muteUser, isUserMuted } = require('../utils/muteManager');
const config = require('../config');
const { debug } = require('../utils/debug');
const webhookLogger = require('../utils/webhookLogger');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Mute User')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    async execute(interaction) {
        console.log('[MUTE] === EXECUTE START ===');
        console.log('[MUTE] User:', interaction.user.tag);
        const targetUser = interaction.targetUser;
        const targetMember = interaction.targetMember;
        console.log('[MUTE] Target:', targetUser.tag);

        // Check if user is trying to mute themselves
        if (targetUser.id === interaction.user.id) {
            console.log('[MUTE] User trying to mute themselves - BLOCKED');
            return await interaction.reply({
                content: 'You cannot mute yourself!',
                ephemeral: true
            });
        }

        // Check if user is trying to mute the creator
        if (targetUser.id === config.creatorId) {
            console.log('[MUTE] User trying to mute creator - BLOCKED');
            return await interaction.reply({
                content: 'You cannot mute the bot creator (CUB)!',
                ephemeral: true
            });
        }

        // Check if user is a bot
        if (targetUser.bot) {
            console.log('[MUTE] Target is a bot - BLOCKED');
            return await interaction.reply({
                content: 'You cannot mute bots!',
                ephemeral: true
            });
        }

        // Check if user is already muted
        console.log('[MUTE] Checking if user is already muted...');
        if (isUserMuted(interaction.client, interaction.guildId, targetUser.id)) {
            console.log('[MUTE] User already muted - BLOCKED');
            return await interaction.reply({
                content: `**${targetUser.tag}** is already muted!`,
                ephemeral: true
            });
        }

        // Show duration selection
        console.log('[MUTE] Creating duration selection buttons...');
        const durationRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`mute_duration_${targetUser.id}_60000`)
                    .setLabel('1 minute')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`mute_duration_${targetUser.id}_300000`)
                    .setLabel('5 minutes')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`mute_duration_${targetUser.id}_600000`)
                    .setLabel('10 minutes')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`mute_duration_${targetUser.id}_1800000`)
                    .setLabel('30 minutes')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`mute_duration_${targetUser.id}_3600000`)
                    .setLabel('1 hour')
                    .setStyle(ButtonStyle.Primary)
            );

        console.log('[MUTE] Sending reply with duration buttons...');
        await interaction.reply({
            content: `**Select mute duration for ${targetUser.tag}:**`,
            components: [durationRow],
            ephemeral: true
        });
        console.log('[MUTE] Reply sent successfully!');
        console.log('[MUTE] === EXECUTE END ===');
    },

    async handleButton(interaction) {
        console.log('[MUTE] === BUTTON HANDLER START ===');
        const customId = interaction.customId;
        console.log('[MUTE] Button customId:', customId);

        // Handle duration selection
        if (customId.startsWith('mute_duration_')) {
            const parts = customId.replace('mute_duration_', '').split('_');
            const userId = parts[0];
            const duration = parseInt(parts[1]);
            console.log('[MUTE] Duration selected:', duration, 'ms for user:', userId);

            console.log('[MUTE] Fetching target member...');
            const targetMember = await interaction.guild.members.fetch(userId);
            console.log('[MUTE] Target member fetched:', targetMember.user.tag);

            if (!targetMember) {
                return await interaction.update({
                    content: 'User not found!',
                    components: []
                });
            }

            // Check permissions
            if (!interaction.guild.members.me.permissions.has(PermissionFlagsBits.MuteMembers)) {
                return await interaction.update({
                    content: 'I don\'t have permission to mute members!',
                    components: []
                });
            }

            // Apply mute
            console.log('[MUTE] Applying mute...');
            const success = await muteUser(
                interaction.client,
                interaction.guild,
                targetMember,
                duration
            );
            console.log('[MUTE] Mute result:', success);

            if (success) {
                const durationText = this.formatDuration(duration);
                console.log('[MUTE] Updating interaction with success message...');

                // Send webhook notification
                webhookLogger.logCustom({
                    title: '🔇 User Muted',
                    description: `**${targetMember.user.tag}** has been server muted`,
                    color: 0xffa502,
                    fields: [
                        { name: '👤 User', value: `<@${targetMember.id}>`, inline: true },
                        { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
                        { name: '⏱️ Duration', value: durationText, inline: true },
                        { name: '🏠 Server', value: interaction.guild.name, inline: true }
                    ]
                });

                await interaction.update({
                    content: `✅ Successfully muted **${targetMember.displayName}** for **${durationText}**.\n\nThe mute will persist across voice channels in this server until it expires.`,
                    components: []
                });
                console.log('[MUTE] Success message sent!');
            } else {
                console.log('[MUTE] Updating interaction with failure message...');
                await interaction.update({
                    content: `❌ Failed to mute **${targetMember.displayName}**. They may already be muted.`,
                    components: []
                });
                console.log('[MUTE] Failure message sent!');
            }
        }
        console.log('[MUTE] === BUTTON HANDLER END ===');
    },

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours} hour${hours > 1 ? 's' : ''}`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        } else {
            return `${seconds} second${seconds > 1 ? 's' : ''}`;
        }
    }
};
