const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ActionRowBuilder, ChannelSelectMenuBuilder, ChannelType } = require('discord.js');
const { blockUserFromChannel, isUserBlockedFromChannel } = require('../utils/voiceBlockManager');
const config = require('../config');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Block from Voice Channel')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    async execute(interaction) {
        const targetUser = interaction.targetUser;
        const targetMember = interaction.targetMember;

        // Check if user is trying to block themselves
        if (targetUser.id === interaction.user.id) {
            return await interaction.reply({
                content: 'You cannot block yourself from a voice channel!',
                ephemeral: true
            });
        }

        // Check if user is trying to block the creator
        if (targetUser.id === config.creatorId) {
            return await interaction.reply({
                content: 'You cannot block the bot creator (CUB) from voice channels!',
                ephemeral: true
            });
        }

        // Check if user is a bot
        if (targetUser.bot) {
            return await interaction.reply({
                content: 'You cannot block bots from voice channels!',
                ephemeral: true
            });
        }

        // Get all voice channels in the guild
        const voiceChannels = interaction.guild.channels.cache.filter(
            channel => channel.type === ChannelType.GuildVoice
        );

        if (voiceChannels.size === 0) {
            return await interaction.reply({
                content: 'There are no voice channels in this server!',
                ephemeral: true
            });
        }

        // Create channel select menu
        const selectMenu = new ChannelSelectMenuBuilder()
            .setCustomId(`block_channel_select_${targetUser.id}`)
            .setPlaceholder('Select a voice channel to block the user from')
            .setChannelTypes(ChannelType.GuildVoice)
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `**Select a voice channel to block ${targetUser.tag} from:**\n\nThey will be unable to join the selected channel but can join any other voice channel.`,
            components: [row],
            ephemeral: true
        });
    },

    async handleChannelSelect(interaction) {
        const customId = interaction.customId;

        if (customId.startsWith('block_channel_select_')) {
            const userId = customId.replace('block_channel_select_', '');
            const selectedChannelId = interaction.values[0];

            // Get the selected channel
            const selectedChannel = await interaction.guild.channels.fetch(selectedChannelId);

            if (!selectedChannel || selectedChannel.type !== ChannelType.GuildVoice) {
                return await interaction.update({
                    content: 'Invalid channel selected!',
                    components: []
                });
            }

            // Check if user is already blocked from this channel
            if (isUserBlockedFromChannel(interaction.client, interaction.guildId, userId, selectedChannelId)) {
                return await interaction.update({
                    content: `This user is already blocked from ${selectedChannel.name}!`,
                    components: []
                });
            }

            // Block the user from the channel
            const success = blockUserFromChannel(
                interaction.client,
                interaction.guildId,
                userId,
                selectedChannelId
            );

            if (success) {
                // Get the target member
                const targetMember = await interaction.guild.members.fetch(userId);

                // If the user is currently in the blocked channel, disconnect them
                if (targetMember.voice.channelId === selectedChannelId) {
                    try {
                        await targetMember.voice.disconnect('Blocked from this voice channel');
                    } catch (error) {
                        console.error('[ERROR] Failed to disconnect user from blocked channel:', error.message);
                    }
                }

                await interaction.update({
                    content: `✅ Successfully blocked **${targetMember.user.tag}** from joining **${selectedChannel.name}**.\n\nThey can still join any other voice channel in this server.`,
                    components: []
                });
            } else {
                await interaction.update({
                    content: 'Failed to block user from the channel.',
                    components: []
                });
            }
        }
    }
};
