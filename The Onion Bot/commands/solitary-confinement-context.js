const { ContextMenuCommandBuilder, ApplicationCommandType, ChannelType, PermissionFlagsBits, ActionRowBuilder, ChannelSelectMenuBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const config = require('../config');
const { debug } = require('../utils/debug');
const webhookLogger = require('../utils/webhookLogger');
const { getConfinementChannel, isSetupComplete } = require('../utils/guildSettings');

module.exports = {
    data: new ContextMenuCommandBuilder()
        .setName('Solitary Confinement')
        .setType(ApplicationCommandType.User)
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        debug('[SOLITARY] === EXECUTE START ===');
        debug('[SOLITARY] User:', interaction.user.tag);
        const targetUser = interaction.targetUser;
        const targetMember = interaction.targetMember;
        debug('[SOLITARY] Target:', targetUser.tag);

        // Check if user is trying to confine themselves
        debug('[SOLITARY] Checking if user is trying to confine themselves...');
        if (targetUser.id === interaction.user.id) {
            debug('[SOLITARY] User trying to confine themselves - BLOCKED');
            return await interaction.reply({
                content: 'You cannot confine yourself!',
                ephemeral: true
            });
        }

        // Check if user is trying to confine the creator
        debug('[SOLITARY] Checking if target is creator...');
        if (targetUser.id === config.creatorId) {
            debug('[SOLITARY] User trying to confine creator - BLOCKED');
            return await interaction.reply({
                content: 'You cannot confine the bot creator (CUB)!',
                ephemeral: true
            });
        }

        // Check if user is a bot
        debug('[SOLITARY] Checking if target is a bot...');
        if (targetUser.bot) {
            debug('[SOLITARY] Target is a bot - BLOCKED');
            return await interaction.reply({
                content: 'You cannot confine bots!',
                ephemeral: true
            });
        }

        // Check if user is already confined
        debug('[SOLITARY] Checking if user is already confined...');
        const confinementKey = `${interaction.guildId}-${targetUser.id}`;
        if (interaction.client.activeConfinements?.has(confinementKey)) {
            debug('[SOLITARY] User is already confined - BLOCKED');
            return await interaction.reply({
                content: `**${targetUser.tag}** is already in solitary confinement!`,
                ephemeral: true
            });
        }

        // Check if server has a default confinement channel set
        const defaultChannelId = getConfinementChannel(interaction.guildId);

        if (defaultChannelId) {
            debug('[SOLITARY] Default channel found, skipping channel selection...');

            // Store the channel selection temporarily
            if (!interaction.client.tempConfinementData) {
                interaction.client.tempConfinementData = new Map();
            }
            interaction.client.tempConfinementData.set(targetUser.id, {
                channelId: defaultChannelId,
                guildId: interaction.guildId
            });

            // Get the channel name for display
            let channelName = 'Confinement Channel';
            try {
                const channel = await interaction.guild.channels.fetch(defaultChannelId);
                if (channel) channelName = channel.name;
            } catch (e) {}

            // Show duration selection directly
            const durationRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`confinement_duration_select_${targetUser.id}`)
                        .setPlaceholder('Select confinement duration')
                        .addOptions(
                            new StringSelectMenuOptionBuilder().setLabel('5 minutes').setValue('5'),
                            new StringSelectMenuOptionBuilder().setLabel('15 minutes').setValue('15'),
                            new StringSelectMenuOptionBuilder().setLabel('30 minutes').setValue('30'),
                            new StringSelectMenuOptionBuilder().setLabel('1 hour').setValue('60'),
                            new StringSelectMenuOptionBuilder().setLabel('2 hours').setValue('120'),
                            new StringSelectMenuOptionBuilder().setLabel('Permanent').setValue('0')
                        )
                );

            await interaction.reply({
                content: `**Confining ${targetUser.tag} to #${channelName}**\n\n**Select confinement duration:**`,
                components: [durationRow],
                ephemeral: true
            });
            debug('[SOLITARY] Duration selection sent (using default channel)');
            return;
        }

        // No default channel - show channel select menu
        debug('[SOLITARY] No default channel, creating channel select menu...');
        const selectMenu = new ChannelSelectMenuBuilder()
            .setCustomId(`confinement_channel_select_${targetUser.id}`)
            .setPlaceholder('Select a voice channel to confine the user to')
            .setChannelTypes(ChannelType.GuildVoice)
            .setMinValues(1)
            .setMaxValues(1);

        const row = new ActionRowBuilder().addComponents(selectMenu);
        debug('[SOLITARY] Channel select menu created');

        debug('[SOLITARY] Sending reply with channel select menu...');
        await interaction.reply({
            content: `**Select a voice channel to confine ${targetUser.tag} to:**\n\nThey will only be able to join the selected channel and will be moved there automatically if they try to join any other voice channel.\n\n*Tip: Use \`/setup\` to set a default confinement channel.*`,
            components: [row],
            ephemeral: true
        });
        debug('[SOLITARY] Reply sent successfully!');
        debug('[SOLITARY] === EXECUTE END ===');
    },

    async handleChannelSelect(interaction) {
        debug('[SOLITARY] === CHANNEL SELECT HANDLER START ===');
        const customId = interaction.customId;
        debug('[SOLITARY] CustomId:', customId);

        if (customId.startsWith('confinement_channel_select_')) {
            const userId = customId.replace('confinement_channel_select_', '');
            const selectedChannelId = interaction.values[0];
            debug('[SOLITARY] User ID:', userId);
            debug('[SOLITARY] Selected channel ID:', selectedChannelId);

            // Store the channel selection temporarily
            debug('[SOLITARY] Initializing temp confinement data if needed...');
            if (!interaction.client.tempConfinementData) {
                interaction.client.tempConfinementData = new Map();
            }

            debug('[SOLITARY] Storing channel selection...');
            interaction.client.tempConfinementData.set(userId, {
                channelId: selectedChannelId,
                guildId: interaction.guildId
            });
            debug('[SOLITARY] Channel selection stored');

            // Get the selected channel
            debug('[SOLITARY] Fetching selected channel...');
            const selectedChannel = await interaction.guild.channels.fetch(selectedChannelId);
            debug('[SOLITARY] Channel name:', selectedChannel.name);

            // Show duration selection
            debug('[SOLITARY] Creating duration select menu...');
            const durationRow = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`confinement_duration_select_${userId}`)
                        .setPlaceholder('Select confinement duration')
                        .addOptions(
                            new StringSelectMenuOptionBuilder()
                                .setLabel('5 minutes')
                                .setValue('5'),
                            new StringSelectMenuOptionBuilder()
                                .setLabel('15 minutes')
                                .setValue('15'),
                            new StringSelectMenuOptionBuilder()
                                .setLabel('30 minutes')
                                .setValue('30'),
                            new StringSelectMenuOptionBuilder()
                                .setLabel('1 hour')
                                .setValue('60'),
                            new StringSelectMenuOptionBuilder()
                                .setLabel('2 hours')
                                .setValue('120'),
                            new StringSelectMenuOptionBuilder()
                                .setLabel('Permanent')
                                .setValue('0')
                        )
                );
            debug('[SOLITARY] Duration select menu created');

            debug('[SOLITARY] Updating interaction with duration select...');
            await interaction.update({
                content: `**Channel selected:** ${selectedChannel.name}\n\n**Select confinement duration:**`,
                components: [durationRow]
            });
            debug('[SOLITARY] Interaction updated successfully!');
        }
        debug('[SOLITARY] === CHANNEL SELECT HANDLER END ===');
    },

    async handleStringSelect(interaction) {
        debug('[SOLITARY] === STRING SELECT HANDLER START ===');
        const customId = interaction.customId;
        debug('[SOLITARY] CustomId:', customId);

        if (customId.startsWith('confinement_duration_select_')) {
            const userId = customId.replace('confinement_duration_select_', '');
            const duration = parseInt(interaction.values[0]);
            debug('[SOLITARY] User ID:', userId);
            debug('[SOLITARY] Duration (minutes):', duration);

            // Get the stored channel selection
            debug('[SOLITARY] Retrieving temp confinement data...');
            const tempData = interaction.client.tempConfinementData?.get(userId);

            if (!tempData) {
                debug('[SOLITARY] No temp data found - session expired');
                return await interaction.update({
                    content: 'Session expired. Please try again.',
                    components: []
                });
            }
            debug('[SOLITARY] Temp data retrieved successfully');

            const selectedChannelId = tempData.channelId;
            debug('[SOLITARY] Fetching channel and member...');
            const selectedChannel = await interaction.guild.channels.fetch(selectedChannelId);
            const targetMember = await interaction.guild.members.fetch(userId);
            debug('[SOLITARY] Channel:', selectedChannel.name);
            debug('[SOLITARY] Target member:', targetMember.user.tag);

            // Calculate end time if duration is set
            debug('[SOLITARY] Calculating duration and end time...');
            let endTime = null;
            let timeoutId = null;
            let durationText = 'permanent';

            if (duration > 0) {
                const durationMs = duration * 60000;
                endTime = Date.now() + durationMs;
                durationText = this.formatDuration(durationMs);
                debug('[SOLITARY] Duration:', durationText);
                debug('[SOLITARY] Expires at:', new Date(endTime).toLocaleString());

                // Set timeout for auto-release
                debug('[SOLITARY] Setting auto-release timeout...');
                timeoutId = setTimeout(async () => {
                    await this.releaseFromConfinement(interaction.client, interaction.guild, targetMember);
                }, durationMs);
                debug('[SOLITARY] Auto-release timeout set');
            } else {
                debug('[SOLITARY] Permanent confinement - no timeout set');
            }

            // Initialize confinements map if it doesn't exist
            debug('[SOLITARY] Initializing confinements map if needed...');
            if (!interaction.client.activeConfinements) {
                interaction.client.activeConfinements = new Map();
            }

            const confinementKey = `${interaction.guildId}-${userId}`;
            debug('[SOLITARY] Confinement key:', confinementKey);

            // Store confinement data
            debug('[SOLITARY] Storing confinement data...');
            interaction.client.activeConfinements.set(confinementKey, {
                guildId: interaction.guildId,
                userId: userId,
                channelId: selectedChannelId,
                endTime,
                timeoutId,
                reason: 'Solitary confinement',
                confinedBy: interaction.user.id
            });
            debug('[SOLITARY] Confinement data stored');

            // Clean up temp data
            debug('[SOLITARY] Cleaning up temp data...');
            interaction.client.tempConfinementData.delete(userId);
            debug('[SOLITARY] Temp data cleaned up');

            // Server mute the user
            debug('[SOLITARY] Server muting user...');
            try {
                await targetMember.voice.setMute(true, 'Solitary confinement');
                debug('[SOLITARY] User server muted successfully');
            } catch (error) {
                console.error('[ERROR] Failed to server mute user:', error.message);
            }

            // If user is currently in a voice channel, move them to confinement
            debug('[SOLITARY] Checking if user is in voice channel...');
            if (targetMember.voice.channel) {
                debug('[SOLITARY] User is in voice channel:', targetMember.voice.channel.name);
                if (targetMember.voice.channelId !== selectedChannelId) {
                    debug('[SOLITARY] Moving user to confinement channel...');
                    try {
                        await targetMember.voice.setChannel(selectedChannel, 'Solitary confinement');
                        debug('[SOLITARY] User moved successfully');
                    } catch (error) {
                        console.error('[ERROR] Failed to move user to confinement:', error.message);
                    }
                } else {
                    debug('[SOLITARY] User already in confinement channel');
                }
            } else {
                debug('[SOLITARY] User not in any voice channel');
            }

            const expiresText = endTime ? ` (expires at ${new Date(endTime).toLocaleTimeString()})` : '';
            console.log(`[CONFINEMENT] ${targetMember.user.tag} confined to #${selectedChannel.name} for ${durationText}${expiresText} by ${interaction.user.tag}`);

            // Send custom webhook embed
            webhookLogger.logCustom({
                title: '🔒 Solitary Confinement',
                description: `**${targetMember.user.tag}** has been sent to solitary confinement`,
                color: 0xff6b6b,
                fields: [
                    { name: '👤 User', value: `<@${targetMember.id}>`, inline: true },
                    { name: '👮 Moderator', value: `<@${interaction.user.id}>`, inline: true },
                    { name: '🔊 Channel', value: `#${selectedChannel.name}`, inline: true },
                    { name: '⏱️ Duration', value: durationText, inline: true },
                    { name: '🏠 Server', value: interaction.guild.name, inline: true },
                    { name: '📅 Expires', value: endTime ? new Date(endTime).toLocaleString() : 'Never (Permanent)', inline: true }
                ]
            });

            debug('[SOLITARY] Updating interaction with success message...');
            await interaction.update({
                content: `🔒 **${targetMember.user.tag}** has been sent to solitary confinement in ${selectedChannel}\n` +
                         `**Duration:** ${durationText}\n` +
                         `${endTime ? `**Expires:** ${new Date(endTime).toLocaleString()}` : '**Status:** Permanent until released'}`,
                components: []
            });
            debug('[SOLITARY] Success message sent!');
        }
        debug('[SOLITARY] === STRING SELECT HANDLER END ===');
    },

    async releaseFromConfinement(client, guild, member) {
        const confinementKey = `${guild.id}-${member.id}`;
        const confinementData = client.activeConfinements?.get(confinementKey);

        if (!confinementData) {
            return false;
        }

        // Clear timeout if exists
        if (confinementData.timeoutId) {
            clearTimeout(confinementData.timeoutId);
        }

        // Unmute the user
        try {
            if (member.voice.serverMute) {
                await member.voice.setMute(false, 'Released from solitary confinement');
                console.log(`[CONFINEMENT] Unmuted ${member.user.tag}`);
            }
        } catch (error) {
            console.error('[ERROR] Failed to unmute user on release:', error.message);
        }

        // Remove confinement
        client.activeConfinements.delete(confinementKey);

        console.log(`[CONFINEMENT] Released ${member.user.tag} from solitary confinement`);

        // Send webhook notification for auto-release
        webhookLogger.logCustom({
            title: '🔓 Auto-Released from Confinement',
            description: `**${member.user.tag}** has been automatically released from solitary confinement`,
            color: 0x2ed573,
            fields: [
                { name: '👤 User', value: `<@${member.id}>`, inline: true },
                { name: '🏠 Server', value: guild.name, inline: true },
                { name: '📋 Reason', value: 'Duration expired', inline: true }
            ]
        });

        return true;
    },

    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            const remainingHours = hours % 24;
            return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days} day${days > 1 ? 's' : ''}`;
        } else if (hours > 0) {
            const remainingMinutes = minutes % 60;
            return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
        } else {
            return `${minutes} minute${minutes > 1 ? 's' : ''}`;
        }
    }
};
