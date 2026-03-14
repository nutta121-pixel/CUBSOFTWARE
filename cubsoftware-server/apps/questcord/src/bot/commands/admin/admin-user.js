const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { UserModel, UserQuestModel, BossParticipantModel, LeaderboardModel, UserItemModel } = require('../../../database/models');
const { isStaff, isDeveloper } = require('../../utils/permissions');
const { LevelSystem } = require('../../../utils/levelSystem');
const { autoEquipItem } = require('../../../utils/equipmentHelper');
const config = require('../../../../config.json');
const { db } = require('../../../database/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-user')
        .setDescription('User stats and gameplay management (Staff only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('heal')
                .setDescription('Restore a user\'s health to maximum')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to heal')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-attack')
                .setDescription('Set a user\'s base attack stat')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to modify')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('attack')
                        .setDescription('Attack value')
                        .setRequired(true)
                        .setMinValue(0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-defense')
                .setDescription('Set a user\'s base defense stat')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to modify')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('defense')
                        .setDescription('Defense value')
                        .setRequired(true)
                        .setMinValue(0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear-inventory')
                .setDescription('Clear all items from a user\'s inventory (Developer only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to clear inventory for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel-travel')
                .setDescription('Cancel a user\'s active travel')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to cancel travel for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('complete-travel')
                .setDescription('Force complete a user\'s travel instantly')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to complete travel for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset-pvp')
                .setDescription('Reset a user\'s PVP statistics')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to reset PVP stats for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle-pvp')
                .setDescription('Toggle PVP status for a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to toggle PVP for')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('give')
                .setDescription('Give Dakari and/or gems to a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to give currency to')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('dakari')
                        .setDescription('Amount of Dakari to give')
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option.setName('gems')
                        .setDescription('Amount of gems to give')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove Dakari and/or gems from a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove currency from')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('dakari')
                        .setDescription('Amount of Dakari to remove')
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option.setName('gems')
                        .setDescription('Amount of gems to remove')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!await isStaff(interaction)) {
            return interaction.reply({
                content: 'This command is only available to QuestCord staff.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const user = targetUser ? UserModel.findByDiscordId(targetUser.id) : null;
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'heal':
                await handleHeal(interaction, targetUser, user);
                break;
            case 'set-attack':
                await handleSetAttack(interaction, targetUser, user);
                break;
            case 'set-defense':
                await handleSetDefense(interaction, targetUser, user);
                break;
            case 'clear-inventory':
                await handleClearInventory(interaction, targetUser, user);
                break;
            case 'cancel-travel':
                await handleCancelTravel(interaction, targetUser, user);
                break;
            case 'complete-travel':
                await handleCompleteTravel(interaction, targetUser, user);
                break;
            case 'reset-pvp':
                await handleResetPvp(interaction, targetUser, user);
                break;
            case 'toggle-pvp':
                await handleTogglePvp(interaction, targetUser, user);
                break;
            case 'give':
                await handleGiveCurrency(interaction, targetUser, user);
                break;
            case 'remove':
                await handleRemoveCurrency(interaction, targetUser, user);
                break;
        }
    }
};

async function handleHeal(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    try {
        db.prepare('UPDATE users SET health = max_health WHERE discord_id = ?').run(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('💚 User Healed')
            .setDescription(`${targetUser.username} has been fully healed`)
            .addFields(
                { name: 'Previous Health', value: `${user.health} / ${user.max_health}`, inline: true },
                { name: 'New Health', value: `${user.max_health} / ${user.max_health}`, inline: true },
                { name: 'Staff Member', value: `${interaction.user.username}` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] User healed by ${interaction.user.username}: ${targetUser.username}`);
    } catch (error) {
        console.error('Error healing user:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleSetAttack(interaction, targetUser, user) {
    const attack = interaction.options.getInteger('attack');

    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    try {
        const oldAttack = user.attack;
        db.prepare('UPDATE users SET attack = ? WHERE discord_id = ?').run(attack, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('⚔️ Attack Stat Modified')
            .setDescription(`Base attack for ${targetUser.username} has been changed`)
            .addFields(
                { name: 'Previous Attack', value: oldAttack.toString(), inline: true },
                { name: 'New Attack', value: attack.toString(), inline: true },
                { name: 'Staff Member', value: `${interaction.user.username}` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] Attack modified by ${interaction.user.username}: ${targetUser.username} ${oldAttack} -> ${attack}`);
    } catch (error) {
        console.error('Error setting attack:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleSetDefense(interaction, targetUser, user) {
    const defense = interaction.options.getInteger('defense');

    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    try {
        const oldDefense = user.defense;
        db.prepare('UPDATE users SET defense = ? WHERE discord_id = ?').run(defense, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('🛡️ Defense Stat Modified')
            .setDescription(`Base defense for ${targetUser.username} has been changed`)
            .addFields(
                { name: 'Previous Defense', value: oldDefense.toString(), inline: true },
                { name: 'New Defense', value: defense.toString(), inline: true },
                { name: 'Staff Member', value: `${interaction.user.username}` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] Defense modified by ${interaction.user.username}: ${targetUser.username} ${oldDefense} -> ${defense}`);
    } catch (error) {
        console.error('Error setting defense:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleClearInventory(interaction, targetUser, user) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({ content: '❌ Only developers can clear inventories.', ephemeral: true });
    }

    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    try {
        const result = db.prepare('DELETE FROM user_items WHERE user_id = ?').run(user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('🗑️ Inventory Cleared')
            .setDescription(`All items removed from ${targetUser.username}'s inventory`)
            .addFields(
                { name: 'Items Removed', value: result.changes.toString(), inline: true },
                { name: 'Staff Member', value: `${interaction.user.username}` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] Inventory cleared by ${interaction.user.username}: ${targetUser.username} (${result.changes} items)`);
    } catch (error) {
        console.error('Error clearing inventory:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleCancelTravel(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    if (!user.traveling) {
        return interaction.reply({ content: `❌ ${targetUser.username} is not currently traveling.`, ephemeral: true });
    }

    try {
        UserModel.completeTravel(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🚫 Travel Cancelled')
            .setDescription(`Travel to **${user.travel_destination}** cancelled for ${targetUser.username}`)
            .addFields({ name: 'Staff Member', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] Travel cancelled by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('Error cancelling travel:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleCompleteTravel(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    if (!user.traveling) {
        return interaction.reply({ content: `❌ ${targetUser.username} is not currently traveling.`, ephemeral: true });
    }

    try {
        const destination = user.travel_destination;
        UserModel.completeTravel(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Travel Force Completed')
            .setDescription(`${targetUser.username} instantly arrived at **${destination}**`)
            .addFields({ name: 'Staff Member', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] Travel completed by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('Error completing travel:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleResetPvp(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    try {
        db.prepare('UPDATE users SET pvp_wins = 0, pvp_losses = 0 WHERE discord_id = ?').run(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🔄 PVP Stats Reset')
            .setDescription(`PVP statistics reset for ${targetUser.username}`)
            .addFields(
                { name: 'Previous Stats', value: `${user.pvp_wins}W - ${user.pvp_losses}L`, inline: true },
                { name: 'New Stats', value: '0W - 0L', inline: true },
                { name: 'Staff Member', value: `${interaction.user.username}` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] PVP reset by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('Error resetting PVP:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleTogglePvp(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    try {
        const newStatus = user.pvp_enabled ? 0 : 1;
        db.prepare('UPDATE users SET pvp_enabled = ? WHERE discord_id = ?').run(newStatus, targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(newStatus ? config.theme.colors.success : config.theme.colors.error)
            .setTitle(`⚔️ PVP ${newStatus ? 'Enabled' : 'Disabled'}`)
            .setDescription(`PVP ${newStatus ? 'enabled' : 'disabled'} for ${targetUser.username}`)
            .addFields({ name: 'Staff Member', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] PVP toggled by ${interaction.user.username} for ${targetUser.username}`);
    } catch (error) {
        console.error('Error toggling PVP:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleGiveCurrency(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    const dakari = interaction.options.getInteger('dakari') || 0;
    const gems = interaction.options.getInteger('gems') || 0;

    if (dakari === 0 && gems === 0) {
        return interaction.reply({
            content: '❌ You must specify at least some Dakari or gems to give.',
            ephemeral: true
        });
    }

    try {
        const oldCurrency = user.currency;
        const oldGems = user.gems;

        if (dakari > 0) {
            UserModel.updateCurrency(user.discord_id, dakari);
        }
        if (gems > 0) {
            UserModel.updateGems(user.discord_id, gems);
        }

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('💰 Currency Given')
            .setDescription(`Currency added to ${targetUser.username}'s account`);

        if (dakari > 0) {
            embed.addFields({
                name: 'Dakari',
                value: `${oldCurrency.toLocaleString()} → ${(oldCurrency + dakari).toLocaleString()} (+${dakari.toLocaleString()})`,
                inline: true
            });
        }

        if (gems > 0) {
            embed.addFields({
                name: 'Gems',
                value: `${oldGems.toLocaleString()} → ${(oldGems + gems).toLocaleString()} (+${gems.toLocaleString()})`,
                inline: true
            });
        }

        embed.addFields({ name: 'Staff Member', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] Currency given by ${interaction.user.username} to ${targetUser.username}: ${dakari} Dakari, ${gems} gems`);
    } catch (error) {
        console.error('Error giving currency:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleRemoveCurrency(interaction, targetUser, user) {
    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', ephemeral: true });
    }

    const dakari = interaction.options.getInteger('dakari') || 0;
    const gems = interaction.options.getInteger('gems') || 0;

    if (dakari === 0 && gems === 0) {
        return interaction.reply({
            content: '❌ You must specify at least some Dakari or gems to remove.',
            ephemeral: true
        });
    }

    try {
        const oldCurrency = user.currency;
        const oldGems = user.gems;

        if (dakari > 0) {
            UserModel.updateCurrency(user.discord_id, -dakari);
        }
        if (gems > 0) {
            UserModel.updateGems(user.discord_id, -gems);
        }

        const newCurrency = Math.max(0, oldCurrency - dakari);
        const newGems = Math.max(0, oldGems - gems);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('💸 Currency Removed')
            .setDescription(`Currency removed from ${targetUser.username}'s account`);

        if (dakari > 0) {
            embed.addFields({
                name: 'Dakari',
                value: `${oldCurrency.toLocaleString()} → ${newCurrency.toLocaleString()} (-${dakari.toLocaleString()})`,
                inline: true
            });
        }

        if (gems > 0) {
            embed.addFields({
                name: 'Gems',
                value: `${oldGems.toLocaleString()} → ${newGems.toLocaleString()} (-${gems.toLocaleString()})`,
                inline: true
            });
        }

        embed.addFields({ name: 'Staff Member', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[USER-ADMIN] Currency removed by ${interaction.user.username} from ${targetUser.username}: ${dakari} Dakari, ${gems} gems`);
    } catch (error) {
        console.error('Error removing currency:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}
