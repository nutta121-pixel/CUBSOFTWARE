const cron = require('node-cron');
const moment = require('moment-timezone');
const { ServerModel, QuestModel } = require('../../database/models');
const { getRandomQuests } = require('./questData');
const config = require('../../../config.json');

class QuestManager {
    static initialize() {
        this.scheduleQuestRotation();
        console.log('Quest rotation scheduler initialized for NZ timezone');
    }

    static scheduleQuestRotation() {
        cron.schedule('0 0 * * *', () => {
            const nzTime = moment.tz('Pacific/Auckland');
            const currentHour = nzTime.hour();

            if (currentHour === 0) {
                console.log('Rotating quests at NZ midnight...');
                this.rotateQuests();
            }
        }, {
            timezone: 'Pacific/Auckland'
        });
    }

    static rotateQuests() {
        try {
            const servers = ServerModel.getOptedInServers();
            const today = new Date().toISOString().split('T')[0];

            QuestModel.deleteExpired();

            // Calculate next midnight NZ time
            const nzNow = moment.tz('Pacific/Auckland');
            const nextMidnight = nzNow.clone().add(1, 'day').startOf('day');
            const expiresAt = Math.floor(nextMidnight.valueOf() / 1000);

            for (const server of servers) {
                const quests = getRandomQuests(config.quest.questsPerServer);

                for (const quest of quests) {
                    QuestModel.create(
                        server.discord_id,
                        quest.type,
                        quest.name,
                        quest.description,
                        quest.rewardCurrency,
                        quest.rewardGems,
                        quest.difficulty,
                        expiresAt
                    );
                }

                console.log(`Assigned ${quests.length} quests to server: ${server.name}`);
            }

            console.log('Quest rotation completed successfully');
        } catch (error) {
            console.error('Error rotating quests:', error);
        }
    }

    static assignInitialQuests(serverId, serverName) {
        try {
            const server = ServerModel.findByDiscordId(serverId);
            if (!server) {
                ServerModel.create(serverId, serverName, 0);
            }

            const existingQuests = QuestModel.getActiveQuestsByServer(serverId);
            if (existingQuests.length > 0) {
                return existingQuests;
            }

            const quests = getRandomQuests(config.quest.questsPerServer);

            // Calculate next midnight NZ time
            const nzNow = moment.tz('Pacific/Auckland');
            const nextMidnight = nzNow.clone().add(1, 'day').startOf('day');
            const expiresAt = Math.floor(nextMidnight.valueOf() / 1000);

            for (const quest of quests) {
                QuestModel.create(
                    serverId,
                    quest.type,
                    quest.name,
                    quest.description,
                    quest.rewardCurrency,
                    quest.rewardGems,
                    quest.difficulty,
                    expiresAt
                );
            }

            return QuestModel.getActiveQuestsByServer(serverId);
        } catch (error) {
            console.error('Error assigning initial quests:', error);
            return [];
        }
    }
}

module.exports = { QuestManager };
