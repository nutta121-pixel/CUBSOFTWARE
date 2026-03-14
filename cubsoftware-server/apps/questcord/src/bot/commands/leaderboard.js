const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { LeaderboardModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the global leaderboard'),

    async execute(interaction) {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const topPlayers = LeaderboardModel.getTopPlayers(month, year, 10);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('Global Leaderboard')
            .setDescription(`Top players for ${now.toLocaleString('default', { month: 'long' })} ${year}\n\nTop 3 players receive rewards at the end of the month.`);

        if (topPlayers.length === 0) {
            embed.addFields({
                name: 'No Rankings Yet',
                value: 'Complete quests and defeat bosses to appear on the leaderboard.'
            });
        } else {
            const medals = ['🥇', '🥈', '🥉'];
            const leaderboardText = topPlayers.map((player, index) => {
                const medal = index < 3 ? medals[index] + ' ' : `${index + 1}. `;
                return `${medal}**${player.username}** - ${player.score.toLocaleString()} points`;
            }).join('\n');

            embed.addFields({
                name: 'Rankings',
                value: leaderboardText
            });

            embed.addFields({
                name: 'Monthly Rewards',
                value: `🥇 1st: ${config.leaderboard.topRewards['1'].currency} currency, ${config.leaderboard.topRewards['1'].gems} gems\n🥈 2nd: ${config.leaderboard.topRewards['2'].currency} currency, ${config.leaderboard.topRewards['2'].gems} gems\n🥉 3rd: ${config.leaderboard.topRewards['3'].currency} currency, ${config.leaderboard.topRewards['3'].gems} gems`
            });
        }

        embed.setFooter({ text: 'Leaderboard resets on the 1st of each month' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
