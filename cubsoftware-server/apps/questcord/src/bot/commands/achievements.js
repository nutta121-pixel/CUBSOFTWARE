const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { UserModel } = require('../../database/models');
const AchievementService = require('../../services/gameEngine/AchievementService');
const config = require('../../../config.json');

// Rarity colors
const RARITY_COLORS = {
    common: 0x9CA3AF,      // Gray
    uncommon: 0x10B981,    // Green
    rare: 0x3B82F6,        // Blue
    epic: 0x8B5CF6,        // Purple
    legendary: 0xF59E0B    // Gold
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('achievements')
        .setDescription('View your achievements and progress')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user\'s achievements')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Filter by category')
                .setRequired(false)
                .addChoices(
                    { name: 'Combat', value: 'combat' },
                    { name: 'Exploration', value: 'exploration' },
                    { name: 'Mastery', value: 'mastery' },
                    { name: 'Collection', value: 'collection' },
                    { name: 'Social', value: 'social' },
                    { name: 'Special', value: 'special' }
                )
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const category = interaction.options.getString('category');

        let user = UserModel.findByDiscordId(targetUser.id);
        if (!user) {
            if (targetUser.id === interaction.user.id) {
                UserModel.create(targetUser.id, targetUser.username);
                user = UserModel.findByDiscordId(targetUser.id);
            } else {
                return interaction.reply({
                    content: 'This user has not started their quest journey yet.',
                    ephemeral: true
                });
            }
        }

        try {
            // Get achievement stats
            const stats = AchievementService.getUserAchievementStats(user.id);

            // Get achievements
            let achievements;
            if (category) {
                achievements = AchievementService.getAchievementsByCategory(user.id, category);
            } else {
                achievements = AchievementService.getUserAchievements(user.id);
            }

            // Group achievements by category
            const groupedAchievements = {};
            achievements.forEach(achievement => {
                if (!groupedAchievements[achievement.category]) {
                    groupedAchievements[achievement.category] = [];
                }
                groupedAchievements[achievement.category].push(achievement);
            });

            // Create embed
            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.primary)
                .setAuthor({
                    name: `${targetUser.username}'s Achievements`,
                    iconURL: targetUser.displayAvatarURL()
                })
                .setDescription(
                    `📊 **Progress**: ${stats.unlocked}/${stats.total} (${stats.percentage}%)\n` +
                    `⭐ **Points**: ${stats.totalPoints}\n\n` +
                    (category ? `Showing **${category}** achievements:\n` : '')
                )
                .setFooter({ text: 'Use the dropdown to filter by category' })
                .setTimestamp();

            // Add fields for each category
            const categories = category ? [category] : Object.keys(groupedAchievements);

            for (const cat of categories.slice(0, 5)) { // Limit to 5 categories per page
                const catAchievements = groupedAchievements[cat] || [];
                if (catAchievements.length === 0) continue;

                const unlockedCount = catAchievements.filter(a => a.unlocked === 1).length;
                const achievementList = catAchievements.slice(0, 5).map(achievement => {
                    const status = achievement.unlocked === 1 ? '✅' : '🔒';
                    return `${status} ${achievement.icon} **${achievement.name}** - ${achievement.description}`;
                }).join('\n');

                embed.addFields({
                    name: `${cat.charAt(0).toUpperCase() + cat.slice(1)} (${unlockedCount}/${catAchievements.length})`,
                    value: achievementList || 'No achievements in this category',
                    inline: false
                });
            }

            // If no achievements shown
            if (embed.data.fields?.length === 0) {
                embed.addFields({
                    name: 'No Achievements',
                    value: 'Start playing to unlock achievements!',
                    inline: false
                });
            }

            // Create category selector
            const row = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('achievement_category')
                        .setPlaceholder('Select a category')
                        .addOptions([
                            {
                                label: 'All Categories',
                                value: 'all',
                                emoji: '📋'
                            },
                            {
                                label: 'Combat',
                                value: 'combat',
                                emoji: '⚔️'
                            },
                            {
                                label: 'Exploration',
                                value: 'exploration',
                                emoji: '🗺️'
                            },
                            {
                                label: 'Mastery',
                                value: 'mastery',
                                emoji: '⬆️'
                            },
                            {
                                label: 'Collection',
                                value: 'collection',
                                emoji: '💰'
                            },
                            {
                                label: 'Social',
                                value: 'social',
                                emoji: '👥'
                            },
                            {
                                label: 'Special',
                                value: 'special',
                                emoji: '✨'
                            }
                        ])
                );

            await interaction.reply({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Error displaying achievements:', error);
            await interaction.reply({
                content: 'An error occurred while fetching achievements.',
                ephemeral: true
            });
        }
    }
};
