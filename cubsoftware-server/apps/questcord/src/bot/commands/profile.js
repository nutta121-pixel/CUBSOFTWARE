const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel, LeaderboardModel } = require('../../database/models');
const { LevelSystem } = require('../../utils/levelSystem');
const { formatNumber } = require('../../utils/formatNumber');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('profile')
        .setDescription('View your profile and stats')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('View another user\'s profile')
                .setRequired(false)
        ),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('user') || interaction.user;
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

        const now = new Date();
        const rank = LeaderboardModel.getUserRank(user.id, now.getMonth() + 1, now.getFullYear());
        const levelTitle = LevelSystem.getLevelTitle(user.level);
        const progressBar = LevelSystem.getProgressBar(user.experience, LevelSystem.getRequiredExperience(user.level));
        const verifiedBadge = user.verified ? ' <:verified:1234567890> ✅' : '';

        const embed = new EmbedBuilder()
            .setColor(user.verified ? 0x3b82f6 : config.theme.colors.primary)
            .setTitle(`${targetUser.username}${verifiedBadge}'s Profile`)
            .setDescription(`**${levelTitle}**${user.verified ? '\n✨ *Verified User*' : ''}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .addFields(
                {
                    name: 'Level',
                    value: `${user.level}\n${progressBar} ${user.experience}/${LevelSystem.getRequiredExperience(user.level)} XP`,
                    inline: false
                },
                {
                    name: 'Dakari',
                    value: formatNumber(user.currency),
                    inline: true
                },
                {
                    name: 'Gems',
                    value: formatNumber(user.gems),
                    inline: true
                },
                {
                    name: 'Total Quests',
                    value: formatNumber(user.total_quests),
                    inline: true
                },
                {
                    name: 'Current Location',
                    value: user.current_server_id ? `<#${user.current_server_id}>` : 'None',
                    inline: true
                },
                {
                    name: 'Leaderboard Rank',
                    value: rank ? `#${rank}` : 'Unranked',
                    inline: true
                },
                {
                    name: 'Account Created',
                    value: `<t:${user.created_at}:R>`,
                    inline: true
                }
            )
            .setFooter({ text: 'Complete quests and defeat bosses to level up' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
