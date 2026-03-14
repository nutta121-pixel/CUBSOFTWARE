const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel, LeaderboardModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Check your current leaderboard rank'),

    async execute(interaction) {
        let user = UserModel.findByDiscordId(interaction.user.id);

        if (!user) {
            UserModel.create(interaction.user.id, interaction.user.username);
            user = UserModel.findByDiscordId(interaction.user.id);
        }

        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const rank = LeaderboardModel.getUserRank(user.id, month, year);
        const leaderboardEntry = LeaderboardModel.getTopPlayers(month, year, 100).find(p => p.user_id === user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('Your Leaderboard Rank')
            .setDescription(`${now.toLocaleString('default', { month: 'long' })} ${year}`);

        if (!rank || !leaderboardEntry) {
            embed.addFields({
                name: 'Status',
                value: 'You are not yet ranked. Complete quests and defeat bosses to appear on the leaderboard.'
            });
        } else {
            const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';

            embed.addFields(
                {
                    name: 'Current Rank',
                    value: `${medal} #${rank}`,
                    inline: true
                },
                {
                    name: 'Score',
                    value: leaderboardEntry.score.toLocaleString(),
                    inline: true
                }
            );

            if (rank <= 3) {
                const rewards = config.leaderboard.topRewards[rank.toString()];
                embed.addFields({
                    name: 'Monthly Reward',
                    value: `If you maintain this rank, you'll receive ${rewards.currency} currency and ${rewards.gems} gems at the end of the month.`
                });
            }
        }

        embed.setFooter({ text: 'Keep questing to improve your rank' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
