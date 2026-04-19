const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle , MessageFlags } = require('discord.js');
const { UserModel, UserQuestModel, BossParticipantModel, LeaderboardModel, UserItemModel, BossModel, ServerModel, QuestModel } = require('../../../database/models');
const { isStaff, isDeveloper } = require('../../utils/permissions');
const { LevelSystem } = require('../../../utils/levelSystem');
const { autoEquipItem } = require('../../../utils/equipmentHelper');
const { BossManager } = require('../../utils/bossManager');
const config = require('../../../../config.json');
const { db } = require('../../../database/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Staff commands for data management')
        .addSubcommand(subcommand =>
            subcommand
                .setName('wipe-user')
                .setDescription('Completely delete a user\'s data (irreversible)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to wipe')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-user')
                .setDescription('Reset user progress but keep their account')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('give-currency')
                .setDescription('Give currency to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give currency to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of currency to give')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('give-gems')
                .setDescription('Give gems to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give gems to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('amount')
                        .setDescription('Amount of gems to give')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-level')
                .setDescription('Set a user\'s level')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to modify')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('level')
                        .setDescription('Level to set')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(200)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view-user')
                .setDescription('View detailed user information')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to view')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-leaderboard')
                .setDescription('Reset a user\'s leaderboard points for current month')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset leaderboard points for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-quests-global')
                .setDescription('Reset all quests for everyone (Developer only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-quests-server')
                .setDescription('Reset quests for a specific server')
                .addStringOption(option =>
                    option.setName('server-id')
                        .setDescription('The server ID to reset quests for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-quests-user')
                .setDescription('Reset quests for a specific user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset quests for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('give-item')
                .setDescription('Give an item/weapon to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give the item to')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('item-name')
                        .setDescription('The name of the item to give')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addIntegerOption(option =>
                    option.setName('quantity')
                        .setDescription('Quantity to give (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable-command')
                .setDescription('Disable a command globally (Developer only)')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('The command name to disable')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable-command')
                .setDescription('Enable a disabled command (Developer only)')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('The command name to enable')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('restrict-command')
                .setDescription('Restrict a command to specific users only (Developer only)')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('The command name to restrict')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to allow access')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unrestrict-command')
                .setDescription('Remove restriction from a command (Developer only)')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('The command name to unrestrict')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove from whitelist (leave empty to remove all)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-disabled')
                .setDescription('List all disabled commands')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list-restrictions')
                .setDescription('List all command restrictions')
                .addStringOption(option =>
                    option.setName('command')
                        .setDescription('Show restrictions for specific command')
                        .setRequired(false)
                        .setAutocomplete(true)
                )
        )
        // Boss Management Commands
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-spawn-boss')
                .setDescription('Force spawn a boss on a server (Staff only)')
                .addStringOption(option =>
                    option.setName('server-id')
                        .setDescription('Discord server ID to spawn boss on')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-boss-health')
                .setDescription('Set the current boss health (Staff only)')
                .addIntegerOption(option =>
                    option.setName('health')
                        .setDescription('New health value')
                        .setRequired(true)
                        .setMinValue(0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view-boss-participants')
                .setDescription('View all participants for the active boss')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear-boss')
                .setDescription('Clear the active boss (Developer only)')
        )
        // Help Command
        .addSubcommand(subcommand =>
            subcommand
                .setName('help')
                .setDescription('Show all available admin commands')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!await isStaff(interaction)) {
            return interaction.reply({
                content: 'This command is only available to QuestCord staff.',
                flags: MessageFlags.Ephemeral
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const targetUser = interaction.options.getUser('user');

        let user = targetUser ? UserModel.findByDiscordId(targetUser.id) : null;

        switch (subcommand) {
            case 'wipe-user':
                await handleWipeUser(interaction, targetUser, user);
                break;
            case 'reset-user':
                await handleResetUser(interaction, targetUser, user);
                break;
            case 'give-currency':
                await handleGiveCurrency(interaction, targetUser, user);
                break;
            case 'give-gems':
                await handleGiveGems(interaction, targetUser, user);
                break;
            case 'set-level':
                await handleSetLevel(interaction, targetUser, user);
                break;
            case 'view-user':
                await handleViewUser(interaction, targetUser, user);
                break;
            case 'reset-leaderboard':
                await handleResetLeaderboard(interaction, targetUser, user);
                break;
            case 'reset-quests-global':
                await handleResetQuestsGlobal(interaction);
                break;
            case 'reset-quests-server':
                await handleResetQuestsServer(interaction);
                break;
            case 'reset-quests-user':
                await handleResetQuestsUser(interaction, targetUser, user);
                break;
            case 'give-item':
                await handleGiveItem(interaction, targetUser, user);
                break;
            case 'disable-command':
                await handleDisableCommand(interaction);
                break;
            case 'enable-command':
                await handleEnableCommand(interaction);
                break;
            case 'restrict-command':
                await handleRestrictCommand(interaction);
                break;
            case 'unrestrict-command':
                await handleUnrestrictCommand(interaction);
                break;
            case 'list-disabled':
                await handleListDisabled(interaction);
                break;
            case 'list-restrictions':
                await handleListRestrictions(interaction);
                break;
            // Boss Management
            case 'force-spawn-boss':
                await handleForceSpawnBoss(interaction);
                break;
            case 'set-boss-health':
                await handleSetBossHealth(interaction);
                break;
            case 'view-boss-participants':
                await handleViewBossParticipants(interaction);
                break;
            case 'clear-boss':
                await handleClearBoss(interaction);
                break;
            // Help
            case 'help':
                await handleHelp(interaction);
                break;
        }
    },

    async autocomplete(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const focusedOption = interaction.options.getFocused(true);

        if (subcommand === 'give-item' && focusedOption.name === 'item-name') {
            // Autocomplete for item names
            const focusedValue = focusedOption.value.toLowerCase();
            const allItems = db.prepare('SELECT * FROM items ORDER BY rarity, item_name').all();

            const filtered = allItems.filter(item =>
                item.item_name.toLowerCase().includes(focusedValue)
            );

            const rarityEmoji = {
                'common': '⚪',
                'uncommon': '🟢',
                'rare': '🔵',
                'epic': '🟣',
                'legendary': '🟠',
                'mythic': '🔴'
            };

            const choices = filtered.slice(0, 25).map(item => ({
                name: `${rarityEmoji[item.rarity] || '⚪'} ${item.item_name} (${item.item_type})`,
                value: item.item_name
            }));

            return interaction.respond(choices);
        }

        if (['disable-command', 'enable-command', 'restrict-command', 'unrestrict-command', 'list-restrictions'].includes(subcommand) && focusedOption.name === 'command') {
            // Autocomplete for command names
            const focusedValue = focusedOption.value.toLowerCase();
            const commands = interaction.client.commands;

            let availableCommands = [];

            if (subcommand === 'enable-command') {
                // Show only disabled commands
                const disabledCommands = db.prepare('SELECT command_name FROM disabled_commands').all();
                availableCommands = disabledCommands.map(cmd => cmd.command_name);
            } else if (subcommand === 'unrestrict-command' || subcommand === 'list-restrictions') {
                // Show only commands with restrictions
                const restrictedCommands = db.prepare('SELECT DISTINCT command_name FROM command_whitelist').all();
                availableCommands = restrictedCommands.map(cmd => cmd.command_name);
            } else {
                // Show all commands except admin
                availableCommands = Array.from(commands.keys()).filter(cmd => cmd !== 'admin');
            }

            const filtered = availableCommands.filter(cmd =>
                cmd.toLowerCase().includes(focusedValue)
            );

            const choices = filtered.slice(0, 25).map(cmd => ({
                name: `/${cmd}`,
                value: cmd
            }));

            return interaction.respond(choices);
        }
    }
};

async function handleWipeUser(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: 'This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: 'Only developers can wipe user data.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        db.prepare('DELETE FROM users WHERE discord_id = ?').run(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('User Data Wiped')
            .setDescription(`All data for ${targetUser.username} (${targetUser.id}) has been permanently deleted.`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        console.log(`[ADMIN] User data wiped: ${targetUser.username} (${targetUser.id}) by ${interaction.user.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error wiping user:', error);
        await interaction.reply({
            content: 'An error occurred while wiping user data.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleResetUser(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: 'This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        db.prepare(`
            UPDATE users
            SET currency = ?, gems = ?, total_quests = 0, level = 1, experience = 0, total_experience = 0
            WHERE discord_id = ?
        `).run(config.economy.defaultCurrency, config.economy.defaultGems, targetUser.id);

        db.prepare('DELETE FROM user_quests WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM boss_participants WHERE user_id = ?').run(user.id);
        db.prepare('DELETE FROM user_items WHERE user_id = ?').run(user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('User Progress Reset')
            .setDescription(`Progress for ${targetUser.username} has been reset to default values.`)
            .addFields(
                {
                    name: 'Reset Values',
                    value: `Level: 1\nDakari: ${config.economy.defaultCurrency}\nGems: ${config.economy.defaultGems}\nQuests: 0`
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        console.log(`[ADMIN] User reset: ${targetUser.username} (${targetUser.id}) by ${interaction.user.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error resetting user:', error);
        await interaction.reply({
            content: 'An error occurred while resetting user data.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleGiveCurrency(interaction, targetUser, user) {
    const amount = interaction.options.getInteger('amount');

    if (!user) {
        UserModel.create(targetUser.id, targetUser.username);
        user = UserModel.findByDiscordId(targetUser.id);
    }

    UserModel.updateCurrency(targetUser.id, amount);
    const updatedUser = UserModel.findByDiscordId(targetUser.id);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.success)
        .setTitle('Dakari Given')
        .setDescription(`${amount.toLocaleString()} Dakari has been given to ${targetUser.username}`)
        .addFields(
            {
                name: 'New Balance',
                value: updatedUser.currency.toLocaleString(),
                inline: true
            },
            {
                name: 'Staff Member',
                value: interaction.user.username
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    console.log(`[ADMIN] Currency given: ${amount} to ${targetUser.username} by ${interaction.user.username}`);
}

async function handleGiveGems(interaction, targetUser, user) {
    const amount = interaction.options.getInteger('amount');

    if (!user) {
        UserModel.create(targetUser.id, targetUser.username);
        user = UserModel.findByDiscordId(targetUser.id);
    }

    UserModel.updateGems(targetUser.id, amount);
    const updatedUser = UserModel.findByDiscordId(targetUser.id);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.success)
        .setTitle('Gems Given')
        .setDescription(`${amount.toLocaleString()} gems have been given to ${targetUser.username}`)
        .addFields(
            {
                name: 'New Balance',
                value: updatedUser.gems.toLocaleString(),
                inline: true
            },
            {
                name: 'Staff Member',
                value: interaction.user.username
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    console.log(`[ADMIN] Gems given: ${amount} to ${targetUser.username} by ${interaction.user.username}`);
}

async function handleSetLevel(interaction, targetUser, user) {
    const level = interaction.options.getInteger('level');

    if (!user) {
        UserModel.create(targetUser.id, targetUser.username);
        user = UserModel.findByDiscordId(targetUser.id);
    }

    let totalExp = 0;
    for (let i = 1; i < level; i++) {
        totalExp += LevelSystem.getRequiredExperience(i);
    }

    UserModel.updateLevel(targetUser.id, level, 0, totalExp);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle('Level Set')
        .setDescription(`${targetUser.username}'s level has been set to ${level}`)
        .addFields(
            {
                name: 'Level Title',
                value: LevelSystem.getLevelTitle(level)
            },
            {
                name: 'Staff Member',
                value: interaction.user.username
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

    console.log(`[ADMIN] Level set: ${level} for ${targetUser.username} by ${interaction.user.username}`);
}

async function handleViewUser(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: 'This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    const now = new Date();
    const rank = LeaderboardModel.getUserRank(user.id, now.getMonth() + 1, now.getFullYear());
    const progressBar = LevelSystem.getProgressBar(user.experience, LevelSystem.getRequiredExperience(user.level));

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`Admin View: ${targetUser.username}`)
        .setDescription(`**${LevelSystem.getLevelTitle(user.level)}**`)
        .addFields(
            {
                name: 'User ID',
                value: user.discord_id,
                inline: true
            },
            {
                name: 'Database ID',
                value: user.id.toString(),
                inline: true
            },
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
                name: 'Total Quests',
                value: user.total_quests.toLocaleString(),
                inline: true
            },
            {
                name: 'Total Experience',
                value: user.total_experience.toLocaleString(),
                inline: true
            },
            {
                name: 'Leaderboard Rank',
                value: rank ? `#${rank}` : 'Unranked',
                inline: true
            },
            {
                name: 'Account Created',
                value: `<t:${user.created_at}:F>`,
                inline: false
            },
            {
                name: 'Last Updated',
                value: `<t:${user.updated_at}:R>`,
                inline: false
            }
        )
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleResetLeaderboard(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: 'This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        // Delete leaderboard entry for current month
        db.prepare('DELETE FROM leaderboard WHERE user_id = ? AND month = ? AND year = ?')
            .run(user.id, month, year);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('Leaderboard Points Reset')
            .setDescription(`Leaderboard points for ${targetUser.username} have been reset for ${now.toLocaleString('default', { month: 'long' })} ${year}`)
            .addFields(
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        // Broadcast updated leaderboard
        const { broadcastLeaderboard } = require('../../web/server');
        const topPlayers = LeaderboardModel.getTopPlayers(month, year, 10);
        broadcastLeaderboard(topPlayers);

        console.log(`[ADMIN] Leaderboard reset for ${targetUser.username} by ${interaction.user.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error resetting leaderboard:', error);
        await interaction.reply({
            content: 'An error occurred while resetting leaderboard points.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleResetQuestsGlobal(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: 'Only developers can reset quests globally.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        // Delete all user quest entries
        const result = db.prepare('DELETE FROM user_quests').run();

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🔄 Global Quest Reset')
            .setDescription(`All quests have been reset for everyone.`)
            .addFields(
                {
                    name: 'Quests Deleted',
                    value: result.changes.toLocaleString()
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        console.log(`[ADMIN] Global quest reset by ${interaction.user.username} - ${result.changes} quests deleted`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error resetting quests globally:', error);
        await interaction.reply({
            content: 'An error occurred while resetting quests globally.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleResetQuestsServer(interaction) {
    const serverId = interaction.options.getString('server-id');

    try {
        // Get all quests for this server
        const quests = db.prepare('SELECT id FROM quests WHERE server_id = ?').all(serverId);

        if (quests.length === 0) {
            return interaction.reply({
                content: 'No quests found for this server.',
                flags: MessageFlags.Ephemeral
            });
        }

        const questIds = quests.map(q => q.id);

        // Delete user quest entries for this server's quests
        const placeholders = questIds.map(() => '?').join(',');
        const result = db.prepare(`DELETE FROM user_quests WHERE quest_id IN (${placeholders})`).run(...questIds);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🔄 Server Quest Reset')
            .setDescription(`All quests have been reset for server \`${serverId}\`.`)
            .addFields(
                {
                    name: 'Quest Entries Deleted',
                    value: result.changes.toLocaleString()
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        console.log(`[ADMIN] Server quest reset for ${serverId} by ${interaction.user.username} - ${result.changes} entries deleted`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error resetting server quests:', error);
        await interaction.reply({
            content: 'An error occurred while resetting server quests.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleResetQuestsUser(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: 'This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        // Delete all quest entries for this user
        const result = db.prepare('DELETE FROM user_quests WHERE user_id = ?').run(user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🔄 User Quest Reset')
            .setDescription(`All quests have been reset for ${targetUser.username}.`)
            .addFields(
                {
                    name: 'Quest Entries Deleted',
                    value: result.changes.toLocaleString()
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        console.log(`[ADMIN] User quest reset for ${targetUser.username} by ${interaction.user.username} - ${result.changes} entries deleted`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error resetting user quests:', error);
        await interaction.reply({
            content: 'An error occurred while resetting user quests.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleGiveItem(interaction, targetUser, user) {
    const itemName = interaction.options.getString('item-name');
    const quantity = interaction.options.getInteger('quantity') || 1;

    if (!user) {
        UserModel.create(targetUser.id, targetUser.username);
        user = UserModel.findByDiscordId(targetUser.id);
    }

    try {
        // Find the item by name (case insensitive)
        const item = db.prepare('SELECT * FROM items WHERE LOWER(item_name) = LOWER(?)').get(itemName);

        if (!item) {
            // Get all item names for suggestions
            const allItems = db.prepare('SELECT item_name FROM items').all();
            const itemList = allItems.map(i => i.item_name).join(', ');

            return interaction.reply({
                content: `Item "${itemName}" not found.\n\nAvailable items: ${itemList}`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user already has this item
        const existingItem = db.prepare('SELECT * FROM user_items WHERE user_id = ? AND item_id = ?').get(user.id, item.id);

        let wasEquipped = false;

        if (existingItem) {
            // Update quantity
            db.prepare('UPDATE user_items SET quantity = quantity + ? WHERE user_id = ? AND item_id = ?')
                .run(quantity, user.id, item.id);
        } else {
            // Insert new item with equipped = 0 by default
            db.prepare('INSERT INTO user_items (user_id, item_id, quantity, equipped) VALUES (?, ?, ?, 0)')
                .run(user.id, item.id, quantity);

            // Try to auto-equip if it's better than current equipment
            wasEquipped = autoEquipItem(user.id, item);

            console.log(`[AUTO-EQUIP] Item ${item.item_name} (ID: ${item.id}) for user ${user.id} - Equipped: ${wasEquipped}`);
        }

        const rarityEmoji = {
            'common': '⚪',
            'uncommon': '🟢',
            'rare': '🔵',
            'epic': '🟣',
            'legendary': '🟠',
            'mythic': '🔴'
        }[item.rarity] || '⚪';

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('🎁 Item Given')
            .setDescription(`**${quantity}x ${item.item_name}** has been given to ${targetUser.username}${wasEquipped ? '\n\n✅ **Auto-equipped** - This item is better than their current equipment!' : ''}`)
            .addFields(
                {
                    name: 'Item Details',
                    value: `${rarityEmoji} **${item.rarity.toUpperCase()}** ${item.item_type}\n${item.description}`,
                    inline: false
                },
                {
                    name: 'Stats',
                    value: `⚔️ Attack: ${item.attack_power}\n🛡️ Defense: ${item.defense_power}\n✨ Crit: ${item.crit_chance}%`,
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: interaction.user.username,
                    inline: true
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        console.log(`[ADMIN] ${quantity}x ${item.item_name} given to ${targetUser.username} by ${interaction.user.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error giving item:', error);
        await interaction.reply({
            content: 'An error occurred while giving the item.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleDisableCommand(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can disable commands.',
            flags: MessageFlags.Ephemeral
        });
    }

    const commandName = interaction.options.getString('command');

    // Prevent disabling admin command
    if (commandName === 'admin') {
        return interaction.reply({
            content: '❌ Cannot disable the admin command!',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const existing = db.prepare('SELECT * FROM disabled_commands WHERE command_name = ?').get(commandName);

        if (existing) {
            return interaction.reply({
                content: `❌ Command **/${commandName}** is already disabled.`,
                flags: MessageFlags.Ephemeral
            });
        }

        db.prepare('INSERT INTO disabled_commands (command_name, disabled_by) VALUES (?, ?)').run(commandName, interaction.user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🚫 Command Disabled')
            .setDescription(`Command **/${commandName}** has been globally disabled.`)
            .addFields({
                name: 'Disabled By',
                value: interaction.user.username,
                inline: true
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Command /${commandName} disabled by ${interaction.user.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error disabling command:', error);
        await interaction.reply({
            content: 'An error occurred while disabling the command.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleEnableCommand(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can enable commands.',
            flags: MessageFlags.Ephemeral
        });
    }

    const commandName = interaction.options.getString('command');

    try {
        const result = db.prepare('DELETE FROM disabled_commands WHERE command_name = ?').run(commandName);

        if (result.changes === 0) {
            return interaction.reply({
                content: `❌ Command **/${commandName}** is not disabled.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Command Enabled')
            .setDescription(`Command **/${commandName}** has been enabled.`)
            .addFields({
                name: 'Enabled By',
                value: interaction.user.username,
                inline: true
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Command /${commandName} enabled by ${interaction.user.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error enabling command:', error);
        await interaction.reply({
            content: 'An error occurred while enabling the command.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRestrictCommand(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can restrict commands.',
            flags: MessageFlags.Ephemeral
        });
    }

    const commandName = interaction.options.getString('command');
    const targetUser = interaction.options.getUser('user');

    // Prevent restricting admin command
    if (commandName === 'admin') {
        return interaction.reply({
            content: '❌ Cannot restrict the admin command!',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const existing = db.prepare('SELECT * FROM command_whitelist WHERE command_name = ? AND discord_id = ?')
            .get(commandName, targetUser.id);

        if (existing) {
            return interaction.reply({
                content: `❌ User **${targetUser.username}** already has access to **/${commandName}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        db.prepare('INSERT INTO command_whitelist (command_name, discord_id, added_by) VALUES (?, ?, ?)')
            .run(commandName, targetUser.id, interaction.user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('🔒 Command Restricted')
            .setDescription(`User **${targetUser.username}** has been added to the whitelist for **/${commandName}**.\n\n**Note:** Once a command has any whitelist entries, only whitelisted users (and staff) can use it.`)
            .addFields({
                name: 'Added By',
                value: interaction.user.username,
                inline: true
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] User ${targetUser.username} whitelisted for /${commandName} by ${interaction.user.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error restricting command:', error);
        await interaction.reply({
            content: 'An error occurred while restricting the command.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleUnrestrictCommand(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can unrestrict commands.',
            flags: MessageFlags.Ephemeral
        });
    }

    const commandName = interaction.options.getString('command');
    const targetUser = interaction.options.getUser('user');

    try {
        let result;

        if (targetUser) {
            // Remove specific user from whitelist
            result = db.prepare('DELETE FROM command_whitelist WHERE command_name = ? AND discord_id = ?')
                .run(commandName, targetUser.id);

            if (result.changes === 0) {
                return interaction.reply({
                    content: `❌ User **${targetUser.username}** does not have whitelist access to **/${commandName}**.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.success)
                .setTitle('🔓 User Removed from Whitelist')
                .setDescription(`User **${targetUser.username}** has been removed from the whitelist for **/${commandName}**.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            console.log(`[ADMIN] User ${targetUser.username} removed from /${commandName} whitelist by ${interaction.user.username}`);
        } else {
            // Remove all restrictions for this command
            result = db.prepare('DELETE FROM command_whitelist WHERE command_name = ?').run(commandName);

            if (result.changes === 0) {
                return interaction.reply({
                    content: `❌ Command **/${commandName}** has no restrictions.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.success)
                .setTitle('🔓 Command Unrestricted')
                .setDescription(`All restrictions have been removed from **/${commandName}**. (${result.changes} users removed)`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            console.log(`[ADMIN] All restrictions removed from /${commandName} by ${interaction.user.username}`);
        }
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error unrestricting command:', error);
        await interaction.reply({
            content: 'An error occurred while unrestricting the command.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleListDisabled(interaction) {
    try {
        const disabledCommands = db.prepare('SELECT * FROM disabled_commands ORDER BY command_name').all();

        if (disabledCommands.length === 0) {
            return interaction.reply({
                content: 'No commands are currently disabled.',
                flags: MessageFlags.Ephemeral
            });
        }

        const commandList = disabledCommands.map(cmd => `• **/${cmd.command_name}**`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🚫 Disabled Commands')
            .setDescription(commandList)
            .setFooter({ text: `${disabledCommands.length} command(s) disabled` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error listing disabled commands:', error);
        await interaction.reply({
            content: 'An error occurred while listing disabled commands.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleListRestrictions(interaction) {
    const commandName = interaction.options.getString('command');

    try {
        let restrictions;
        let title;

        if (commandName) {
            restrictions = db.prepare('SELECT * FROM command_whitelist WHERE command_name = ?').all(commandName);
            title = `🔒 Restrictions for /${commandName}`;
        } else {
            restrictions = db.prepare('SELECT * FROM command_whitelist ORDER BY command_name').all();
            title = '🔒 All Command Restrictions';
        }

        if (restrictions.length === 0) {
            return interaction.reply({
                content: commandName
                    ? `Command **/${commandName}** has no restrictions.`
                    : 'No commands have restrictions.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Group by command if showing all
        const grouped = {};
        restrictions.forEach(r => {
            if (!grouped[r.command_name]) {
                grouped[r.command_name] = [];
            }
            grouped[r.command_name].push(`<@${r.discord_id}>`);
        });

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(title)
            .setFooter({ text: `${restrictions.length} restriction(s) total` })
            .setTimestamp();

        Object.keys(grouped).sort().forEach(cmd => {
            embed.addFields({
                name: `/${cmd}`,
                value: grouped[cmd].join(', '),
                inline: false
            });
        });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error listing restrictions:', error);
        await interaction.reply({
            content: 'An error occurred while listing restrictions.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// ==================== BOSS MANAGEMENT ====================

async function handleForceSpawnBoss(interaction) {
    const serverId = interaction.options.getString('server-id');

    try {
        const server = ServerModel.findByDiscordId(serverId);

        if (!server) {
            return interaction.reply({
                content: `❌ Server with ID \`${serverId}\` not found in database.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (!server.opted_in) {
            return interaction.reply({
                content: `❌ Server **${server.name}** is not opted in to boss spawns.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if there's already an active boss
        const activeBoss = BossModel.getActiveBoss();
        if (activeBoss) {
            return interaction.reply({
                content: `❌ There is already an active boss: **${activeBoss.boss_name}** (${activeBoss.id})`,
                flags: MessageFlags.Ephemeral
            });
        }

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        // Force spawn boss using BossManager
        const { getRandomBoss } = require('../utils/questData');
        const bossTemplate = getRandomBoss();
        const expiresAt = Math.floor(Date.now() / 1000) + (config.boss.spawnDuration / 1000);

        const result = BossModel.create(
            bossTemplate.type,
            bossTemplate.name,
            serverId,
            bossTemplate.health,
            bossTemplate.rewardCurrency,
            bossTemplate.rewardGems,
            expiresAt
        );

        // Announce the boss spawn
        await BossManager.announceBossSpawn(server, bossTemplate, result.lastInsertRowid);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Boss Force Spawned')
            .setDescription(`**${bossTemplate.name}** has been spawned on **${server.name}**`)
            .addFields(
                {
                    name: 'Boss Type',
                    value: bossTemplate.type,
                    inline: true
                },
                {
                    name: 'Health',
                    value: bossTemplate.health.toLocaleString(),
                    inline: true
                },
                {
                    name: 'Rewards',
                    value: `${bossTemplate.rewardCurrency} coins, ${bossTemplate.rewardGems} gems`,
                    inline: false
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`[ADMIN] Boss force spawned by ${interaction.user.username}: ${bossTemplate.name} on ${server.name}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error force spawning boss:', error);
        await interaction.editReply({
            content: `An error occurred while spawning the boss: ${error.message}`
        });
    }
}

async function handleSetBossHealth(interaction) {
    const health = interaction.options.getInteger('health');

    try {
        const boss = BossModel.getActiveBoss();

        if (!boss) {
            return interaction.reply({
                content: '❌ There is no active boss to modify.',
                flags: MessageFlags.Ephemeral
            });
        }

        const oldHealth = boss.health;
        db.prepare('UPDATE bosses SET health = ? WHERE id = ?').run(health, boss.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('⚙️ Boss Health Modified')
            .setDescription(`Health for **${boss.boss_name}** has been changed`)
            .addFields(
                {
                    name: 'Previous Health',
                    value: `${oldHealth.toLocaleString()} / ${boss.max_health.toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'New Health',
                    value: `${health.toLocaleString()} / ${boss.max_health.toLocaleString()}`,
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });

        // Update the notification
        await BossManager.updateBossNotification();

        console.log(`[ADMIN] Boss health modified by ${interaction.user.username}: ${oldHealth} -> ${health}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error setting boss health:', error);
        await interaction.reply({
            content: 'An error occurred while modifying boss health.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleViewBossParticipants(interaction) {
    try {
        const boss = BossModel.getActiveBoss();

        if (!boss) {
            return interaction.reply({
                content: '❌ There is no active boss.',
                flags: MessageFlags.Ephemeral
            });
        }

        const participants = BossParticipantModel.getParticipants(boss.id);

        if (participants.length === 0) {
            return interaction.reply({
                content: `No participants yet for **${boss.boss_name}**.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const participantList = participants.map((p, i) =>
            `${i + 1}. **${p.username}** - ${p.damage_dealt.toLocaleString()} damage`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(`👥 Participants for ${boss.boss_name}`)
            .setDescription(participantList)
            .setFooter({ text: `Total: ${participants.length} participants` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error viewing boss participants:', error);
        await interaction.reply({
            content: 'An error occurred while viewing participants.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleClearBoss(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can clear the active boss.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const boss = BossModel.getActiveBoss();

        if (!boss) {
            return interaction.reply({
                content: '❌ There is no active boss to clear.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Delete boss and related data
        db.prepare('DELETE FROM bosses WHERE id = ?').run(boss.id);
        db.prepare('DELETE FROM boss_participants WHERE boss_id = ?').run(boss.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('🗑️ Boss Cleared')
            .setDescription(`**${boss.boss_name}** has been removed from the database.`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Boss cleared by ${interaction.user.username}: ${boss.boss_name} (ID: ${boss.id})`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error clearing boss:', error);
        await interaction.reply({
            content: 'An error occurred while clearing the boss.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// ==================== TRAVEL MANAGEMENT ====================

async function handleCancelTravel(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!user.traveling) {
        return interaction.reply({
            content: `❌ ${targetUser.username} is not currently traveling.`,
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        UserModel.completeTravel(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🚫 Travel Cancelled')
            .setDescription(`Travel to **${user.travel_destination}** has been cancelled for ${targetUser.username}`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Travel cancelled by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error cancelling travel:', error);
        await interaction.reply({
            content: 'An error occurred while cancelling travel.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleForceCompleteTravel(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!user.traveling) {
        return interaction.reply({
            content: `❌ ${targetUser.username} is not currently traveling.`,
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const destination = user.travel_destination;
        UserModel.completeTravel(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Travel Force Completed')
            .setDescription(`${targetUser.username} has instantly arrived at **${destination}**`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Travel force completed by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error force completing travel:', error);
        await interaction.reply({
            content: 'An error occurred while completing travel.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// ==================== PVP MANAGEMENT ====================

async function handleResetPvpStats(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        db.prepare('UPDATE users SET pvp_wins = 0, pvp_losses = 0 WHERE discord_id = ?').run(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🔄 PVP Stats Reset')
            .setDescription(`PVP statistics have been reset for ${targetUser.username}`)
            .addFields(
                {
                    name: 'Previous Stats',
                    value: `${user.pvp_wins}W - ${user.pvp_losses}L`,
                    inline: true
                },
                {
                    name: 'New Stats',
                    value: '0W - 0L',
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] PVP stats reset by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error resetting PVP stats:', error);
        await interaction.reply({
            content: 'An error occurred while resetting PVP stats.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleTogglePvpForUser(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const newStatus = user.pvp_enabled ? 0 : 1;
        db.prepare('UPDATE users SET pvp_enabled = ? WHERE discord_id = ?').run(newStatus, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(newStatus ? config.theme.colors.success : config.theme.colors.error)
            .setTitle(`⚔️ PVP ${newStatus ? 'Enabled' : 'Disabled'}`)
            .setDescription(`PVP has been ${newStatus ? 'enabled' : 'disabled'} for ${targetUser.username}`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] PVP ${newStatus ? 'enabled' : 'disabled'} by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error toggling PVP:', error);
        await interaction.reply({
            content: 'An error occurred while toggling PVP status.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// ==================== SERVER MANAGEMENT ====================

async function handleForceOptinServer(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can force opt-in servers.',
            flags: MessageFlags.Ephemeral
        });
    }

    const serverId = interaction.options.getString('server-id');

    try {
        const server = ServerModel.findByDiscordId(serverId);

        if (!server) {
            // Try to fetch from Discord and create
            const guild = interaction.client.guilds.cache.get(serverId);
            if (!guild) {
                return interaction.reply({
                    content: `❌ Server with ID \`${serverId}\` not found.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            ServerModel.create(serverId, guild.name, guild.memberCount);
        }

        ServerModel.updateOptIn(serverId, true);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Server Force Opted In')
            .setDescription(`Server \`${serverId}\` has been force opted in to boss spawns.`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Server force opted in by ${interaction.user.username}: ${serverId}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error force opting in server:', error);
        await interaction.reply({
            content: 'An error occurred while opting in the server.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleForceOptoutServer(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can force opt-out servers.',
            flags: MessageFlags.Ephemeral
        });
    }

    const serverId = interaction.options.getString('server-id');

    try {
        const server = ServerModel.findByDiscordId(serverId);

        if (!server) {
            return interaction.reply({
                content: `❌ Server with ID \`${serverId}\` not found in database.`,
                flags: MessageFlags.Ephemeral
            });
        }

        ServerModel.updateOptIn(serverId, false);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🚫 Server Force Opted Out')
            .setDescription(`Server **${server.name}** (\`${serverId}\`) has been force opted out of boss spawns.`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Server force opted out by ${interaction.user.username}: ${serverId}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error force opting out server:', error);
        await interaction.reply({
            content: 'An error occurred while opting out the server.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// ==================== USER STATS MANAGEMENT ====================

async function handleHealUser(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        db.prepare('UPDATE users SET health = max_health WHERE discord_id = ?').run(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('💚 User Healed')
            .setDescription(`${targetUser.username} has been fully healed`)
            .addFields(
                {
                    name: 'Previous Health',
                    value: `${user.health} / ${user.max_health}`,
                    inline: true
                },
                {
                    name: 'New Health',
                    value: `${user.max_health} / ${user.max_health}`,
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] User healed by ${interaction.user.username}: ${targetUser.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error healing user:', error);
        await interaction.reply({
            content: 'An error occurred while healing the user.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleSetAttack(interaction, targetUser, user) {
    const attack = interaction.options.getInteger('attack');

    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const oldAttack = user.attack;
        db.prepare('UPDATE users SET attack = ? WHERE discord_id = ?').run(attack, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('⚔️ Attack Stat Modified')
            .setDescription(`Base attack for ${targetUser.username} has been changed`)
            .addFields(
                {
                    name: 'Previous Attack',
                    value: oldAttack.toString(),
                    inline: true
                },
                {
                    name: 'New Attack',
                    value: attack.toString(),
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Attack stat modified by ${interaction.user.username}: ${targetUser.username} ${oldAttack} -> ${attack}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error setting attack:', error);
        await interaction.reply({
            content: 'An error occurred while setting attack stat.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleSetDefense(interaction, targetUser, user) {
    const defense = interaction.options.getInteger('defense');

    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const oldDefense = user.defense;
        db.prepare('UPDATE users SET defense = ? WHERE discord_id = ?').run(defense, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('🛡️ Defense Stat Modified')
            .setDescription(`Base defense for ${targetUser.username} has been changed`)
            .addFields(
                {
                    name: 'Previous Defense',
                    value: oldDefense.toString(),
                    inline: true
                },
                {
                    name: 'New Defense',
                    value: defense.toString(),
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Defense stat modified by ${interaction.user.username}: ${targetUser.username} ${oldDefense} -> ${defense}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error setting defense:', error);
        await interaction.reply({
            content: 'An error occurred while setting defense stat.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleClearInventory(interaction, targetUser, user) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can clear inventories.',
            flags: MessageFlags.Ephemeral
        });
    }

    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const result = db.prepare('DELETE FROM user_items WHERE user_id = ?').run(user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('🗑️ Inventory Cleared')
            .setDescription(`All items have been removed from ${targetUser.username}'s inventory`)
            .addFields(
                {
                    name: 'Items Removed',
                    value: result.changes.toString(),
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Inventory cleared by ${interaction.user.username}: ${targetUser.username} (${result.changes} items)`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error clearing inventory:', error);
        await interaction.reply({
            content: 'An error occurred while clearing inventory.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// ==================== QUEST MANAGEMENT ====================

async function handleForceCompleteQuest(interaction, targetUser, user) {
    const questId = interaction.options.getInteger('quest-id');

    if (!user) {
        return interaction.reply({
            content: '❌ This user has no data in the system.',
            flags: MessageFlags.Ephemeral
        });
    }

    try {
        const quest = QuestModel.findById(questId);

        if (!quest) {
            return interaction.reply({
                content: `❌ Quest with ID ${questId} not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Check if user has this quest
        const userQuest = db.prepare('SELECT * FROM user_quests WHERE user_id = ? AND quest_id = ?').get(user.id, questId);

        if (!userQuest) {
            return interaction.reply({
                content: `❌ ${targetUser.username} does not have this quest assigned.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (userQuest.completed) {
            return interaction.reply({
                content: `❌ This quest is already completed.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Complete the quest
        UserQuestModel.completeQuest(user.id, questId);
        UserModel.updateCurrency(targetUser.id, quest.reward_currency);
        UserModel.updateGems(targetUser.id, quest.reward_gems);
        UserModel.incrementQuestCount(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Quest Force Completed')
            .setDescription(`Quest **${quest.quest_name}** has been force completed for ${targetUser.username}`)
            .addFields(
                {
                    name: 'Rewards Given',
                    value: `${quest.reward_currency} Dakari\n${quest.reward_gems} gems`,
                    inline: true
                },
                {
                    name: 'Staff Member',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Quest force completed by ${interaction.user.username}: ${quest.quest_name} for ${targetUser.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error force completing quest:', error);
        await interaction.reply({
            content: 'An error occurred while completing the quest.',
            flags: MessageFlags.Ephemeral
        });
    }
}

async function handleRemoveQuest(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can remove quests.',
            flags: MessageFlags.Ephemeral
        });
    }

    const questId = interaction.options.getInteger('quest-id');

    try {
        const quest = QuestModel.findById(questId);

        if (!quest) {
            return interaction.reply({
                content: `❌ Quest with ID ${questId} not found.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Delete quest and related user_quests entries
        db.prepare('DELETE FROM user_quests WHERE quest_id = ?').run(questId);
        db.prepare('DELETE FROM quests WHERE id = ?').run(questId);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('🗑️ Quest Removed')
            .setDescription(`Quest **${quest.quest_name}** (ID: ${questId}) has been removed from the database`)
            .addFields({
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[ADMIN] Quest removed by ${interaction.user.username}: ${quest.quest_name} (ID: ${questId})`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error removing quest:', error);
        await interaction.reply({
            content: 'An error occurred while removing the quest.',
            flags: MessageFlags.Ephemeral
        });
    }
}

// ==================== HELP ====================

async function handleHelp(interaction) {
    const embed = createAdminHelpEmbed('overview');
    const buttons = createAdminHelpButtons();

    await interaction.reply({ embeds: [embed], components: buttons, flags: MessageFlags.Ephemeral });
}

function createAdminHelpEmbed(category) {
    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTimestamp();

    switch (category) {
        case 'overview':
            embed
                .setTitle('📋 QuestCord Admin Command Center')
                .setDescription('**Welcome to the Admin Control Panel!**\n\nAdmin commands are organized into specialized groups:\n\n**Permission Levels:**\n🟢 **Staff** - Most commands | 🔴 **Developer** - Critical operations')
                .addFields(
                    {
                        name: '📋 /admin',
                        value: '**Core Admin Commands**\n• User data & economy (wipe, reset, give currency/gems)\n• Set levels\n• Give items\n• Reset leaderboard\n• Command management (disable/restrict)',
                        inline: false
                    },
                    {
                        name: '💀 /admin-boss',
                        value: '**Boss Management** 🟢\n• Force spawn boss on servers\n• Modify boss health\n• View participants\n• Clear active boss 🔴',
                        inline: false
                    },
                    {
                        name: '👤 /admin-user',
                        value: '**User Stats & Gameplay** 🟢\n• Heal users\n• Set attack/defense stats\n• Clear inventory 🔴\n• Manage travel (cancel/complete)\n• PVP controls (reset stats/toggle)',
                        inline: false
                    },
                    {
                        name: '📜 /admin-quest',
                        value: '**Quest Management** 🟢\n• Force complete quests\n• Remove quests 🔴\n• Reset quests (in /admin)',
                        inline: false
                    },
                    {
                        name: '🏰 /admin-server',
                        value: '**Server Management** 🔴\n• Force opt-in servers\n• Force opt-out servers',
                        inline: false
                    }
                )
                .setFooter({ text: 'Select a category below to see detailed commands • 🔴 = Developer Only' });
            break;

        case 'user':
            embed
                .setTitle('👤 User Management Commands')
                .setDescription('Manage user data, currency, and levels.')
                .addFields(
                    {
                        name: '💰 Economy',
                        value: '`/admin give-currency <user> <amount>`\nGive Dakari to a user\n\n`/admin give-gems <user> <amount>`\nGive gems to a user',
                        inline: false
                    },
                    {
                        name: '📊 Level',
                        value: '`/admin set-level <user> <level>`\nSet user\'s level (1-200)',
                        inline: false
                    },
                    {
                        name: '🗑️ Data Management',
                        value: '`/admin view-user <user>`\nView detailed user information\n\n`/admin reset-user <user>`\nReset progress to defaults\n\n`/admin wipe-user <user>` 🔴\nPermanently delete all user data',
                        inline: false
                    }
                )
                .setFooter({ text: '🔴 = Developer only | Use the buttons to navigate categories' });
            break;

        case 'boss':
            embed
                .setTitle('💀 Boss Management Commands')
                .setDescription('Control boss spawning, health, and participants.')
                .addFields(
                    {
                        name: '🎲 Boss Spawning',
                        value: '`/admin force-spawn-boss <server-id>`\nForce spawn a boss on a specific server\n\n`/admin clear-boss` 🔴\nRemove the active boss entirely',
                        inline: false
                    },
                    {
                        name: '⚙️ Boss Control',
                        value: '`/admin set-boss-health <health>`\nModify current boss health\n\n`/admin view-boss-participants`\nView all participants and damage dealt',
                        inline: false
                    },
                    {
                        name: '💡 Tips',
                        value: '• Boss notifications auto-update when health changes\n• Use `/boss despawn` to end boss gracefully\n• Clearing boss removes all participant data',
                        inline: false
                    }
                )
                .setFooter({ text: '🔴 = Developer only | Use the buttons to navigate categories' });
            break;

        case 'quest':
            embed
                .setTitle('📜 Quest Management Commands')
                .setDescription('Manage quests, completions, and resets.')
                .addFields(
                    {
                        name: '✅ Quest Completion',
                        value: '`/admin force-complete-quest <user> <quest-id>`\nForce complete a quest and give rewards',
                        inline: false
                    },
                    {
                        name: '🔄 Quest Resets',
                        value: '`/admin reset-quests-user <user>`\nReset all quests for a user\n\n`/admin reset-quests-server <server-id>`\nReset quests for entire server\n\n`/admin reset-quests-global` 🔴\nReset ALL quests for everyone',
                        inline: false
                    },
                    {
                        name: '🗑️ Quest Removal',
                        value: '`/admin remove-quest <quest-id>` 🔴\nPermanently delete a quest',
                        inline: false
                    }
                )
                .setFooter({ text: '🔴 = Developer only | Use the buttons to navigate categories' });
            break;


        case 'commands':
            embed
                .setTitle('🔧 Command Management')
                .setDescription('Control command availability and restrictions.')
                .addFields(
                    {
                        name: '🚫 Disable/Enable Commands',
                        value: '`/admin disable-command <command>` 🔴\nGlobally disable a command\n\n`/admin enable-command <command>` 🔴\nRe-enable a disabled command\n\n`/admin list-disabled`\nView all disabled commands',
                        inline: false
                    },
                    {
                        name: '🔒 Command Restrictions',
                        value: '`/admin restrict-command <command> <user>` 🔴\nWhitelist user for command access\n\n`/admin unrestrict-command <command> [user]` 🔴\nRemove restrictions (or specific user)\n\n`/admin list-restrictions [command]`\nView command restrictions',
                        inline: false
                    },
                    {
                        name: '⚠️ Important',
                        value: '• Cannot disable/restrict `/admin`\n• Staff can always use restricted commands\n• Once restricted, only whitelisted users + staff can use it',
                        inline: false
                    }
                )
                .setFooter({ text: '🔴 = Developer only | Use the buttons to navigate categories' });
            break;

        case 'items':
            embed
                .setTitle('🎁 Items & Leaderboard')
                .setDescription('Manage items and leaderboard.')
                .addFields(
                    {
                        name: '🎁 Items',
                        value: '`/admin give-item <user> <item> [quantity]`\nGive items to users with auto-equip',
                        inline: false
                    },
                    {
                        name: '🏆 Leaderboard',
                        value: '`/admin reset-leaderboard <user>`\nReset user\'s monthly leaderboard points',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use the buttons to navigate categories' });
            break;
    }

    return embed;
}

function createAdminHelpButtons(currentCategory = 'overview') {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('admin_help_overview')
                .setLabel('Overview')
                .setStyle(currentCategory === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('📋'),
            new ButtonBuilder()
                .setCustomId('admin_help_user')
                .setLabel('User')
                .setStyle(currentCategory === 'user' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('👤'),
            new ButtonBuilder()
                .setCustomId('admin_help_boss')
                .setLabel('Boss')
                .setStyle(currentCategory === 'boss' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('💀'),
            new ButtonBuilder()
                .setCustomId('admin_help_quest')
                .setLabel('Quest')
                .setStyle(currentCategory === 'quest' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('📜')
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('admin_help_items')
                .setLabel('Items')
                .setStyle(currentCategory === 'items' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🎁'),
            new ButtonBuilder()
                .setCustomId('admin_help_commands')
                .setLabel('Commands')
                .setStyle(currentCategory === 'commands' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔧')
        );

    return [row1, row2];
}

// Export functions for button handler
module.exports.createAdminHelpEmbed = createAdminHelpEmbed;
module.exports.createAdminHelpButtons = createAdminHelpButtons;
