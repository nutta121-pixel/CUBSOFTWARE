const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits, ActionRowBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { unblockUserFromChannel, getBlockedChannelsForUser } = require('../utils/voiceBlockManager');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Unblock from Voice Channel')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    async execute(interaction) {
        const targetUser = interaction.targetUser;

        // Get all channels the user is blocked from
        const blockedChannelIds = getBlockedChannelsForUser(
            interaction.client,
            interaction.guildId,
            targetUser.id
        );

        if (blockedChannelIds.length === 0) {
            return await interaction.reply({
                content: `**${targetUser.tag}** is not blocked from any voice channels!`,
                ephemeral: true
            });
        }

        // Fetch channel details
        const channelOptions = [];
        for (const channelId of blockedChannelIds) {
            try {
                const channel = await interaction.guild.channels.fetch(channelId);
                if (channel) {
                    channelOptions.push(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(channel.name)
                            .setDescription(`Unblock ${targetUser.username} from this channel`)
                            .setValue(channelId)
                    );
                }
            } catch (error) {
                console.error('[ERROR] Failed to fetch channel:', error.message);
            }
        }

        if (channelOptions.length === 0) {
            return await interaction.reply({
                content: 'Could not find any blocked channels (they may have been deleted).',
                ephemeral: true
            });
        }

        // Create select menu
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId(`unblock_channel_select_${targetUser.id}`)
            .setPlaceholder('Select a channel to unblock the user from')
            .addOptions(channelOptions)
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        await interaction.reply({
            content: `**${targetUser.tag}** is blocked from ${blockedChannelIds.length} voice channel${blockedChannelIds.length > 1 ? 's' : ''}.\n\nSelect a channel to unblock them from:`,
            components: [row],
            ephemeral: true
        });
    },

    async handleStringSelect(interaction) {
        const customId = interaction.customId;

        if (customId.startsWith('unblock_channel_select_')) {
            const userId = customId.replace('unblock_channel_select_', '');
            const selectedChannelId = interaction.values[0];

            // Get the selected channel
            const selectedChannel = await interaction.guild.channels.fetch(selectedChannelId);

            if (!selectedChannel) {
                return await interaction.update({
                    content: 'Channel not found!',
                    components: []
                });
            }

            // Unblock the user from the channel
            const success = unblockUserFromChannel(
                interaction.client,
                interaction.guildId,
                userId,
                selectedChannelId
            );

            if (success) {
                const targetUser = await interaction.client.users.fetch(userId);
                await interaction.update({
                    content: `✅ Successfully unblocked **${targetUser.tag}** from **${selectedChannel.name}**.\n\nThey can now join this voice channel again.`,
                    components: []
                });
            } else {
                await interaction.update({
                    content: 'Failed to unblock user from the channel.',
                    components: []
                });
            }
        }
    }
};
