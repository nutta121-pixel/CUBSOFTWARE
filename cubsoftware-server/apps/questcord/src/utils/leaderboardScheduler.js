const cron = require('node-cron');
const { LeaderboardModel, UserModel } = require('../database/models');
const config = require('../../config.json');

class LeaderboardScheduler {
    static initialize() {
        cron.schedule('0 0 1 * *', () => {
            console.log('Running monthly leaderboard reset and reward distribution...');
            this.processMonthlyReset();
        });

        console.log('Leaderboard scheduler initialized');
    }

    static processMonthlyReset() {
        try {
            const now = new Date();
            const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth();
            const lastYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

            const topPlayers = LeaderboardModel.getTopPlayers(lastMonth, lastYear, 3);

            for (let i = 0; i < topPlayers.length; i++) {
                const player = topPlayers[i];
                const rank = (i + 1).toString();
                const rewards = config.leaderboard.topRewards[rank];

                if (rewards) {
                    UserModel.updateCurrency(player.discord_id, rewards.currency);
                    UserModel.updateGems(player.discord_id, rewards.gems);

                    console.log(`Awarded rank ${rank} rewards to ${player.username}: ${rewards.currency} currency, ${rewards.gems} gems`);
                }
            }

            console.log(`Monthly leaderboard reset completed. Top ${topPlayers.length} players rewarded.`);
        } catch (error) {
            console.error('Error processing monthly leaderboard reset:', error);
        }
    }
}

module.exports = { LeaderboardScheduler };
