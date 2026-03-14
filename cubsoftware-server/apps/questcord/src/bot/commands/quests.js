const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const QuestService = require('../../services/gameEngine/QuestService');
const { UserModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('quests')
        .setDescription('View and accept available quests in this server'),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true
            });
        }

        // Get active quests using QuestService
        const questsResult = await QuestService.getActiveQuests(interaction.guild.id, 'discord');

        if (!questsResult.success) {
            if (questsResult.type === 'not_opted_in') {
                return interaction.reply({
                    content: 'This server has not opted in to the quest system. Ask a server administrator to use `/optin`.',
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: `❌ Error: ${questsResult.error}`,
                ephemeral: true
            });
        }

        const quests = questsResult.data;

        // Get user quests and completed count
        const user = UserModel.findByDiscordId(interaction.user.id);
        let userQuestData = { quests: [], completedCount: 0 };

        if (user) {
            const userQuestsResult = await QuestService.getUserQuests(interaction.user.id, interaction.guild.id, 'discord');
            if (userQuestsResult.success) {
                userQuestData = userQuestsResult.data;
            }
        }

        const completedCount = userQuestData.completedCount;

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(`📜 Quests in ${interaction.guild.name}`)
            .setDescription(`You have completed **${completedCount}/${config.quest.questsPerServer}** quests in this server today.\n\n**How it works:**\nClick a button to accept a quest and face a random challenge:\n\n🔤 **Word Scramble** - Unscramble a word\n🔢 **Math Challenge** - Solve an equation\n❓ **Trivia** - Answer a question\n⚡ **Reaction Test** - Click when green\n🧠 **Memory Game** - Remember emoji sequence\n\n✅ Success = Full rewards\n❌ Failed = Cannot retry today`);

        if (quests.length === 0) {
            embed.addFields({
                name: 'No Quests Available',
                value: 'Check back later for new quests.'
            });
            return interaction.reply({ embeds: [embed] });
        }

        const questFields = [];
        const buttons = [];

        quests.forEach((quest, index) => {
            const difficultyEmoji = {
                'easy': '⭐',
                'medium': '⭐⭐',
                'hard': '⭐⭐⭐'
            }[quest.difficulty] || '⭐';

            const typeEmoji = {
                'combat': '🗡️',
                'gathering': '🌿',
                'exploration': '🗺️',
                'delivery': '📦',
                'social': '💬'
            }[quest.type] || '📋';

            const userQuest = userQuestData.quests.find(uq => uq.quest_id === quest.id);
            const status = userQuest?.completed ? ' ✅' : (userQuest?.failed ? ' ❌ FAILED' : '');

            embed.addFields({
                name: `${typeEmoji} ${quest.quest_name}${status}`,
                value: `${quest.description}\n\n${difficultyEmoji} Difficulty: ${quest.difficulty}\n💰 Rewards: ${quest.reward_currency} Dakari, ${quest.reward_gems} gems`,
                inline: false
            });

            // Add spacing between quests (except after the last one)
            if (index < quests.length - 1) {
                embed.addFields({
                    name: '\u200b',
                    value: '\u200b',
                    inline: false
                });
            }

            if (!userQuest || (!userQuest.completed && !userQuest.failed)) {
                // Truncate quest name if too long for button (max 80 chars, but keep it shorter)
                const buttonLabel = quest.quest_name.length > 30
                    ? quest.quest_name.substring(0, 27) + '...'
                    : quest.quest_name;

                buttons.push(
                    new ButtonBuilder()
                        .setCustomId(`accept_quest_${quest.id}`)
                        .setLabel(buttonLabel)
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji(typeEmoji)
                );
            }
        });

        embed.setFooter({ text: 'Click a button below to accept and start a quest!' });

        const components = [];
        for (let i = 0; i < buttons.length; i += 5) {
            const row = new ActionRowBuilder().addComponents(buttons.slice(i, i + 5));
            components.push(row);
        }

        await interaction.reply({ embeds: [embed], components });
    }
};
