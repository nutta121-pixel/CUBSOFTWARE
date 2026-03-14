const { UserModel, ActivityLogModel } = require('../../database/models');
const { broadcastActivity } = require('../../web/server');
const { getReportingInstance } = require('../../utils/reportingSystem');
const { handleQuestAccept, handleCombatAttack, handleExplorationContinue, handleReactionClick } = require('../utils/questInteractions');
const { handleShopPurchase, handleShopCancel } = require('../utils/shopInteractions');
const { handlePvpAccept, handlePvpDecline, handlePvpAttack } = require('../utils/pvpArena');
const { isStaff } = require('../utils/permissions');
const { db } = require('../../database/schema');
const { MessageFlags } = require('discord.js');
const { debugLogger } = require('../../utils/debugLogger');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction) {
        // Handle button interactions for quests
        if (interaction.isButton()) {
            try {
                if (interaction.customId.startsWith('accept_quest_')) {
                    return await handleQuestAccept(interaction);
                }
                if (interaction.customId.startsWith('combat_attack_')) {
                    return await handleCombatAttack(interaction);
                }
                if (interaction.customId.startsWith('explore_continue_')) {
                    return await handleExplorationContinue(interaction);
                }
                if (interaction.customId === 'reaction_button') {
                    return await handleReactionClick(interaction);
                }
                // Shop purchase buttons
                if (interaction.customId.startsWith('confirm_buy_')) {
                    return await handleShopPurchase(interaction);
                }
                if (interaction.customId === 'cancel_buy') {
                    return await handleShopCancel(interaction);
                }
                // PVP Arena buttons
                if (interaction.customId.startsWith('pvp_accept_')) {
                    const { activeChallenges, arenaeBattles } = require('../commands/pvp');
                    const challengeKey = interaction.customId.replace('pvp_accept_', '');
                    return await handlePvpAccept(interaction, challengeKey, activeChallenges, arenaeBattles);
                }
                if (interaction.customId.startsWith('pvp_decline_')) {
                    const { activeChallenges } = require('../commands/pvp');
                    const challengeKey = interaction.customId.replace('pvp_decline_', '');
                    return await handlePvpDecline(interaction, challengeKey, activeChallenges);
                }
                if (interaction.customId.startsWith('pvp_battle_attack_')) {
                    const { arenaeBattles } = require('../commands/pvp');
                    const battleId = interaction.customId.replace('pvp_battle_attack_', '');
                    return await handlePvpAttack(interaction, battleId, arenaeBattles);
                }
                // Admin help menu buttons
                if (interaction.customId.startsWith('admin_help_')) {
                    // Check if user is staff
                    if (!await isStaff(interaction)) {
                        return interaction.reply({
                            content: 'Admin help is only available to QuestCord staff.',
                            ephemeral: true
                        });
                    }

                    const category = interaction.customId.replace('admin_help_', '');
                    const { createAdminHelpEmbed, createAdminHelpButtons } = require('../commands/admin');

                    const embed = createAdminHelpEmbed(category);
                    const buttons = createAdminHelpButtons(category);

                    await interaction.update({ embeds: [embed], components: buttons });
                    return;
                }
                // Help category navigation buttons
                if (interaction.customId.startsWith('help_cat_')) {
                    const category = interaction.customId.replace('help_cat_', '');
                    const { createHelpEmbed, createHelpButtons } = require('../commands/help');

                    const embed = createHelpEmbed(category);
                    const buttons = createHelpButtons(category);

                    await interaction.update({ embeds: [embed], components: buttons });
                    return;
                }
                // Website feature toggle buttons
                if (interaction.customId.startsWith('website_toggle_')) {
                    // Check if user is staff
                    if (!await isStaff(interaction)) {
                        return interaction.reply({
                            content: '❌ This action is only available to QuestCord staff.',
                            ephemeral: true
                        });
                    }

                    const featureName = interaction.customId.replace('website_toggle_', '');
                    const { WebsiteSettingsModel } = require('../../database/models');
                    const settings = WebsiteSettingsModel.get();

                    // Toggle the feature
                    const currentValue = settings[featureName];
                    const newValue = currentValue === 1 ? 0 : 1;

                    const updateSettings = {};
                    updateSettings[featureName] = newValue;
                    WebsiteSettingsModel.update(updateSettings);

                    // Broadcast updated settings to all connected clients
                    const { broadcastWebsiteSettings } = require('../../web/server');
                    const updatedSettings = WebsiteSettingsModel.get();
                    broadcastWebsiteSettings({
                        effects: {
                            backgroundAnimations: updatedSettings.background_animations === 1,
                            cardHoverEffects: updatedSettings.card_hover_effects === 1,
                            cosmicParticles: updatedSettings.cosmic_particles === 1,
                            auroraEffect: updatedSettings.aurora_effect === 1,
                            gradientAnimations: updatedSettings.gradient_animations === 1
                        },
                        interactiveFeatures: {
                            partyMode: updatedSettings.party_mode === 1,
                            insultDisplay: updatedSettings.insult_display === 1,
                            chaosMode: updatedSettings.chaos_mode === 1
                        },
                        performanceMode: updatedSettings.performance_mode === 1
                    });

                    const prettyName = featureName.split('_').map(word =>
                        word.charAt(0).toUpperCase() + word.slice(1)
                    ).join(' ');

                    // Update the embed with new status
                    const formatStatus = (value) => value ? '🟢 Enabled' : '🔴 Disabled';
                    const { EmbedBuilder } = require('discord.js');

                    const embed = new EmbedBuilder()
                        .setColor(config.theme.colors.primary)
                        .setTitle('🌐 Website Feature Status')
                        .setDescription('Current status of all website features')
                        .addFields(
                            {
                                name: '🎨 Visual Effects',
                                value: `Card Hover Effects: ${formatStatus(updatedSettings.card_hover_effects)}\nBackground Animations: ${formatStatus(updatedSettings.background_animations)}\nCosmic Particles: ${formatStatus(updatedSettings.cosmic_particles)}\nAurora Effect: ${formatStatus(updatedSettings.aurora_effect)}\nGradient Animations: ${formatStatus(updatedSettings.gradient_animations)}`,
                                inline: false
                            },
                            {
                                name: '✨ Interactive Features',
                                value: `Party Mode: ${formatStatus(updatedSettings.party_mode)}\nInsult Display: ${formatStatus(updatedSettings.insult_display)}\nChaos Mode: ${formatStatus(updatedSettings.chaos_mode)}`,
                                inline: false
                            },
                            {
                                name: '⚡ Performance',
                                value: `Performance Mode: ${formatStatus(updatedSettings.performance_mode)}`,
                                inline: false
                            }
                        )
                        .setFooter({ text: `${prettyName} ${newValue === 1 ? 'enabled' : 'disabled'} • Click buttons below to toggle features` })
                        .setTimestamp();

                    // Re-create toggle buttons
                    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

                    const row1 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('website_toggle_card_hover_effects')
                                .setLabel('Card Hover')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('website_toggle_background_animations')
                                .setLabel('Background')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('website_toggle_cosmic_particles')
                                .setLabel('Particles')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('website_toggle_aurora_effect')
                                .setLabel('Aurora')
                                .setStyle(ButtonStyle.Primary)
                        );

                    const row2 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('website_toggle_gradient_animations')
                                .setLabel('Gradients')
                                .setStyle(ButtonStyle.Primary),
                            new ButtonBuilder()
                                .setCustomId('website_toggle_party_mode')
                                .setLabel('Party Mode')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('website_toggle_insult_display')
                                .setLabel('Insults')
                                .setStyle(ButtonStyle.Success),
                            new ButtonBuilder()
                                .setCustomId('website_toggle_chaos_mode')
                                .setLabel('Chaos Mode')
                                .setStyle(ButtonStyle.Danger)
                        );

                    const row3 = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId('website_toggle_performance_mode')
                                .setLabel('Performance Mode')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await interaction.update({ embeds: [embed], components: [row1, row2, row3] });

                    await debugLogger.success('WEBSITE', `Feature ${prettyName} ${newValue === 1 ? 'enabled' : 'disabled'}`, {
                        feature: featureName,
                        state: newValue === 1 ? 'on' : 'off',
                        user: interaction.user.username,
                        userId: interaction.user.id
                    });

                    console.log(`[WEBSITE] ${prettyName} ${newValue === 1 ? 'enabled' : 'disabled'} by ${interaction.user.username} (${interaction.user.id})`);
                    return;
                }
                // Help menu buttons
                if (interaction.customId === 'help_tutorial') {
                    const tutorialCommand = interaction.client.commands.get('tutorial');
                    if (tutorialCommand) {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        // Execute the command and capture its response
                        try {
                            // Temporarily override reply to use followUp
                            const originalReply = interaction.reply;
                            interaction.reply = async (options) => {
                                return await interaction.editReply(options);
                            };
                            await tutorialCommand.execute(interaction);
                            interaction.reply = originalReply;
                        } catch (err) {
                            await interaction.editReply({ content: 'Failed to load tutorial.', flags: MessageFlags.Ephemeral });
                        }
                    }
                    return;
                }
                if (interaction.customId === 'help_quests') {
                    const questsCommand = interaction.client.commands.get('quests');
                    if (questsCommand) {
                        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                        try {
                            const originalReply = interaction.reply;
                            interaction.reply = async (options) => {
                                return await interaction.editReply(options);
                            };
                            await questsCommand.execute(interaction);
                            interaction.reply = originalReply;
                        } catch (err) {
                            await interaction.editReply({ content: 'Failed to load quests.', flags: MessageFlags.Ephemeral });
                        }
                    }
                    return;
                }
                if (interaction.customId === 'help_profile') {
                    const { LevelSystem } = require('../../utils/levelSystem');
                    const config = require('../../../config.json');
                    const { EmbedBuilder } = require('discord.js');

                    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
                    try {
                        const targetUser = interaction.user;
                        let user = UserModel.findByDiscordId(targetUser.id);

                        if (!user) {
                            UserModel.create(targetUser.id, targetUser.globalName || targetUser.username);
                            user = UserModel.findByDiscordId(targetUser.id);
                        }

                        const now = new Date();
                        const { LeaderboardModel } = require('../../database/models');
                        const rank = LeaderboardModel.getUserRank(user.id, now.getMonth() + 1, now.getFullYear());
                        const levelTitle = LevelSystem.getLevelTitle(user.level);
                        const progressBar = LevelSystem.getProgressBar(user.experience, LevelSystem.getRequiredExperience(user.level));

                        const embed = new EmbedBuilder()
                            .setColor(config.theme.colors.primary)
                            .setTitle(`${targetUser.username}'s Profile`)
                            .setDescription(`**${levelTitle}**`)
                            .setThumbnail(targetUser.displayAvatarURL())
                            .addFields(
                                {
                                    name: 'Level',
                                    value: `${user.level}\n${progressBar} ${user.experience}/${LevelSystem.getRequiredExperience(user.level)} XP`,
                                    inline: false
                                },
                                {
                                    name: 'Dakari',
                                    value: user.currency.toLocaleString(),
                                    inline: true
                                },
                                {
                                    name: 'Gems',
                                    value: user.gems.toLocaleString(),
                                    inline: true
                                },
                                {
                                    name: 'Quests Completed',
                                    value: user.quests_completed.toString(),
                                    inline: true
                                },
                                {
                                    name: 'Bosses Defeated',
                                    value: user.bosses_defeated.toString(),
                                    inline: true
                                },
                                {
                                    name: 'Monthly Rank',
                                    value: rank ? `#${rank}` : 'Unranked',
                                    inline: true
                                }
                            )
                            .setFooter({ text: `User ID: ${targetUser.id}` });

                        await interaction.editReply({ embeds: [embed] });
                    } catch (err) {
                        console.error('Error loading profile:', err);
                        await interaction.editReply({ content: 'Failed to load profile.', flags: MessageFlags.Ephemeral });
                    }
                    return;
                }
            } catch (error) {
                console.error('Error handling button interaction:', error);
                const reporting = getReportingInstance();
                if (reporting) {
                    reporting.sendErrorReport(error, `Button interaction: ${interaction.customId}`);
                }

                if (!interaction.replied && !interaction.deferred) {
                    await interaction.reply({
                        content: 'An error occurred while processing your action.',
                        flags: MessageFlags.Ephemeral
                    });
                }
            }
            return;
        }

        // Handle autocomplete interactions
        if (interaction.isAutocomplete()) {
            const command = interaction.client.commands.get(interaction.commandName);

            if (!command || !command.autocomplete) {
                return;
            }

            try {
                await command.autocomplete(interaction);
            } catch (error) {
                console.error('Error handling autocomplete:', error);
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const command = interaction.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`Command not found: ${interaction.commandName}`);
            return;
        }

        // Check for maintenance mode (except for website command which staff use to disable it)
        if (interaction.commandName !== 'website') {
            const { WebsiteSettingsModel } = require('../../database/models');
            const websiteSettings = WebsiteSettingsModel.get();
            if (websiteSettings && websiteSettings.maintenance_mode === 1) {
                return interaction.reply({
                    content: '🔧 **QuestCord is currently in maintenance mode.**\n\nWe\'re performing updates to improve your experience. Please try again later!',
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // Check if command is globally disabled
        const disabledCommand = db.prepare('SELECT * FROM disabled_commands WHERE command_name = ?').get(interaction.commandName);
        if (disabledCommand) {
            return interaction.reply({
                content: `❌ The **/${interaction.commandName}** command is currently disabled.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if command has restrictions (whitelist)
        const restrictions = db.prepare('SELECT * FROM command_whitelist WHERE command_name = ?').all(interaction.commandName);
        if (restrictions.length > 0) {
            // Command has restrictions - check if user is whitelisted or is staff
            const userIsStaff = await isStaff(interaction);
            const userIsWhitelisted = restrictions.some(r => r.discord_id === interaction.user.id);

            if (!userIsStaff && !userIsWhitelisted) {
                return interaction.reply({
                    content: `❌ You don't have permission to use **/${interaction.commandName}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        try {
            let user = UserModel.findByDiscordId(interaction.user.id);
            if (!user) {
                // Use display name (global name) if available, otherwise username
                const displayName = interaction.user.globalName || interaction.user.username;
                UserModel.create(interaction.user.id, displayName);
                user = UserModel.findByDiscordId(interaction.user.id);
            } else {
                // Update username if it changed
                const displayName = interaction.user.globalName || interaction.user.username;
                if (user.username !== displayName) {
                    UserModel.create(interaction.user.id, displayName); // Updates on conflict
                }
            }

            const timestamp = Math.floor(Date.now() / 1000);
            const action = `Used command: /${interaction.commandName}`;
            const displayName = interaction.user.globalName || interaction.user.username;

            ActivityLogModel.log(
                user.id,
                displayName,
                action,
                JSON.stringify({ guild: interaction.guild?.name || 'DM' })
            );

            broadcastActivity({
                user_id: user.id,
                username: displayName,
                action: action,
                timestamp: timestamp
            });

            // Track command execution
            const reporting = getReportingInstance();
            if (reporting) {
                reporting.incrementCommands();
            }

            await command.execute(interaction);
        } catch (error) {
            console.error(`Error executing command ${interaction.commandName}:`, error);

            // Log to debug channel
            await debugLogger.error('COMMAND', error, {
                command: interaction.commandName,
                user: interaction.user.tag,
                userId: interaction.user.id,
                guild: interaction.guild?.name || 'DM',
                guildId: interaction.guild?.id || null
            });

            // Report error to Discord channel
            const reporting = getReportingInstance();
            if (reporting) {
                reporting.sendErrorReport(error, `Command: /${interaction.commandName} by ${interaction.user.tag}`);
            }

            const errorMessage = {
                content: 'An error occurred while executing this command.',
                flags: MessageFlags.Ephemeral
            };

            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(errorMessage);
            } else {
                await interaction.reply(errorMessage);
            }
        }
    }
};
