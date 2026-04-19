const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits , MessageFlags } = require('discord.js');
const { QuestModel, UserQuestModel, UserModel } = require('../../../database/models');
const { isStaff, isDeveloper } = require('../../utils/permissions');
const config = require('../../../../config.json');
const { db } = require('../../../database/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-quest')
        .setDescription('Quest management commands (Staff only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-complete')
                .setDescription('Force complete a quest for a user')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('quest-id')
                        .setDescription('The quest ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a specific quest (Developer only)')
                .addIntegerOption(option =>
                    option.setName('quest-id')
                        .setDescription('The quest ID to remove')
                        .setRequired(true)
                )
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

        switch (subcommand) {
            case 'force-complete':
                await handleForceComplete(interaction);
                break;
            case 'remove':
                await handleRemove(interaction);
                break;
        }
    }
};

async function handleForceComplete(interaction) {
    const targetUser = interaction.options.getUser('user');
    const questId = interaction.options.getInteger('quest-id');

    const user = UserModel.findByDiscordId(targetUser.id);

    if (!user) {
        return interaction.reply({ content: '❌ This user has no data in the system.', flags: MessageFlags.Ephemeral });
    }

    try {
        const quest = QuestModel.findById(questId);

        if (!quest) {
            return interaction.reply({ content: `❌ Quest with ID ${questId} not found.`, flags: MessageFlags.Ephemeral });
        }

        const userQuest = db.prepare('SELECT * FROM user_quests WHERE user_id = ? AND quest_id = ?').get(user.id, questId);

        if (!userQuest) {
            return interaction.reply({
                content: `❌ ${targetUser.username} does not have this quest assigned.`,
                flags: MessageFlags.Ephemeral
            });
        }

        if (userQuest.completed) {
            return interaction.reply({ content: `❌ This quest is already completed.`, flags: MessageFlags.Ephemeral });
        }

        UserQuestModel.completeQuest(user.id, questId);
        UserModel.updateCurrency(targetUser.id, quest.reward_currency);
        UserModel.updateGems(targetUser.id, quest.reward_gems);
        UserModel.incrementQuestCount(targetUser.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Quest Force Completed')
            .setDescription(`Quest **${quest.quest_name}** force completed for ${targetUser.username}`)
            .addFields(
                { name: 'Rewards Given', value: `${quest.reward_currency} Dakari\n${quest.reward_gems} gems`, inline: true },
                { name: 'Staff Member', value: `${interaction.user.username}` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[QUEST-ADMIN] Force completed by ${interaction.user.username}: ${quest.quest_name} for ${targetUser.username}`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error force completing quest:', error);
        await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral });
    }
}

async function handleRemove(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({ content: '❌ Only developers can remove quests.', flags: MessageFlags.Ephemeral });
    }

    const questId = interaction.options.getInteger('quest-id');

    try {
        const quest = QuestModel.findById(questId);

        if (!quest) {
            return interaction.reply({ content: `❌ Quest with ID ${questId} not found.`, flags: MessageFlags.Ephemeral });
        }

        db.prepare('DELETE FROM user_quests WHERE quest_id = ?').run(questId);
        db.prepare('DELETE FROM quests WHERE id = ?').run(questId);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('🗑️ Quest Removed')
            .setDescription(`Quest **${quest.quest_name}** (ID: ${questId}) removed from database`)
            .addFields({ name: 'Developer', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        console.log(`[QUEST-ADMIN] Removed by ${interaction.user.username}: ${quest.quest_name} (ID: ${questId})`);
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125 — Error removing quest:', error);
        await interaction.reply({ content: 'An error occurred.', flags: MessageFlags.Ephemeral });
    }
}
