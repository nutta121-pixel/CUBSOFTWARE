const { BaseService, ValidationError, NotFoundError } = require('./BaseService');
const { QuestModel, UserQuestModel, UserModel, ServerModel } = require('../../database/models');
const { getRandomQuests } = require('../../bot/utils/questData');
const config = require('../../../config.json');
const AchievementService = require('./AchievementService');
const GuildService = require('./GuildService');

/**
 * QuestService - Handles all quest-related game logic
 *
 * Provides quest management functionality for both Discord and Web platforms:
 * - Getting active quests
 * - Accepting quests
 * - Completing quests
 * - Quest rotation
 *
 * @extends BaseService
 */
class QuestService extends BaseService {
    /**
     * Get active quests for a server
     * @param {string} serverId - Discord server ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Quest list with success status
     */
    static async getActiveQuests(serverId, source = 'discord') {
        try {
            this.validateRequired({ serverId }, ['serverId']);

            const server = ServerModel.findByDiscordId(serverId);
            if (!server) {
                throw new NotFoundError(`Server ${serverId} not found`);
            }

            if (!server.opted_in) {
                return {
                    success: false,
                    error: 'Server has not opted in to the quest system',
                    type: 'not_opted_in'
                };
            }

            let quests = QuestModel.getActiveQuestsByServer(serverId);

            // If no quests exist, assign initial quests
            if (quests.length === 0) {
                const serverName = server.name || 'Unknown Server';
                quests = await this.assignInitialQuests(serverId, serverName, source);
                if (!quests.success) {
                    return quests;
                }
                quests = quests.data;
            }

            this.log('getActiveQuests', { serverId, questCount: quests.length, source });

            return this.success(quests, 'Active quests retrieved');
        } catch (error) {
            return this.handleError(error, 'getActiveQuests');
        }
    }

    /**
     * Assign initial quests to a server
     * @param {string} serverId - Discord server ID
     * @param {string} serverName - Server name
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Assigned quests
     */
    static async assignInitialQuests(serverId, serverName, source = 'discord') {
        try {
            this.validateRequired({ serverId, serverName }, ['serverId', 'serverName']);

            // Ensure server exists
            let server = ServerModel.findByDiscordId(serverId);
            if (!server) {
                ServerModel.create(serverId, serverName, 0);
                server = ServerModel.findByDiscordId(serverId);
            }

            // Check if quests already exist
            const existingQuests = QuestModel.getActiveQuestsByServer(serverId);
            if (existingQuests.length > 0) {
                return this.success(existingQuests, 'Quests already assigned');
            }

            // Generate random quests
            const questTemplates = getRandomQuests(config.quest.questsPerServer);
            const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 hours

            const createdQuests = [];
            for (const template of questTemplates) {
                const result = QuestModel.create(
                    serverId,
                    template.type,
                    template.name,
                    template.description,
                    template.rewardCurrency,
                    template.rewardGems,
                    template.difficulty,
                    expiresAt
                );
                createdQuests.push(result.lastInsertRowid);
            }

            // Fetch the created quests
            const quests = QuestModel.getActiveQuestsByServer(serverId);

            // Emit event
            this.emitServerEvent(serverId, 'quests:assigned', {
                serverName,
                questCount: quests.length,
                source
            });

            this.log('assignInitialQuests', { serverId, serverName, questCount: quests.length, source });

            return this.success(quests, 'Initial quests assigned');
        } catch (error) {
            return this.handleError(error, 'assignInitialQuests');
        }
    }

    /**
     * Accept a quest for a user
     * @param {string} userId - Discord user ID
     * @param {number} questId - Quest ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Quest acceptance result
     */
    static async acceptQuest(userId, questId, source = 'discord') {
        try {
            this.validateRequired({ userId, questId }, ['userId', 'questId']);

            // Validate user exists
            const user = this.validateUserExists(userId, UserModel);

            // Validate quest exists
            const quest = QuestModel.findById(questId);
            if (!quest) {
                throw new NotFoundError(`Quest ${questId} not found`);
            }

            // Check if quest is still active
            const now = Math.floor(Date.now() / 1000);
            if (quest.expires_at <= now) {
                return {
                    success: false,
                    error: 'Quest has expired',
                    type: 'expired'
                };
            }

            // Check if user already accepted this quest
            const userQuests = UserQuestModel.getUserQuests(user.id, quest.server_id);
            const existingQuest = userQuests.find(uq => uq.quest_id === questId);

            if (existingQuest) {
                if (existingQuest.completed) {
                    return {
                        success: false,
                        error: 'Quest already completed',
                        type: 'already_completed'
                    };
                }
                if (existingQuest.failed) {
                    return {
                        success: false,
                        error: 'Quest already failed - cannot retry',
                        type: 'already_failed'
                    };
                }
                return {
                    success: false,
                    error: 'Quest already accepted',
                    type: 'already_accepted'
                };
            }

            // Assign quest to user
            UserQuestModel.assignQuest(user.id, questId);

            // Emit event
            this.emitUserEvent(userId, 'quest:accepted', {
                questId,
                questName: quest.quest_name,
                questType: quest.quest_type,
                difficulty: quest.difficulty,
                source
            });

            this.log('acceptQuest', { userId, questId, questName: quest.quest_name, source });

            return this.success({
                quest,
                message: `Quest "${quest.quest_name}" accepted! Complete the challenge to earn rewards.`
            }, 'Quest accepted');
        } catch (error) {
            return this.handleError(error, 'acceptQuest');
        }
    }

    /**
     * Complete a quest for a user
     * @param {string} userId - Discord user ID
     * @param {number} questId - Quest ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Quest completion result
     */
    static async completeQuest(userId, questId, source = 'discord') {
        try {
            this.validateRequired({ userId, questId }, ['userId', 'questId']);

            const user = this.validateUserExists(userId, UserModel);
            const quest = QuestModel.findById(questId);

            if (!quest) {
                throw new NotFoundError(`Quest ${questId} not found`);
            }

            // Mark quest as completed
            UserQuestModel.completeQuest(user.id, questId);

            // Apply guild bonus to rewards
            const guildBonus = GuildService.getGuildBonus(userId);
            const guildBonusInfo = GuildService.getGuildBonusInfo(userId);

            const baseCurrency = quest.reward_currency;
            const baseGems = quest.reward_gems;
            const finalCurrency = Math.floor(baseCurrency * guildBonus);
            const finalGems = Math.floor(baseGems * guildBonus);

            // Award rewards with guild bonus applied
            UserModel.updateCurrency(userId, finalCurrency);
            UserModel.updateGems(userId, finalGems);
            UserModel.incrementQuestCount(userId);
            ServerModel.incrementQuestCount(quest.server_id);

            // Get updated user data
            const updatedUser = UserModel.findByDiscordId(userId);

            // Check for achievements
            const unlockedAchievements = AchievementService.checkAchievements(
                user.id,
                'quest_count',
                updatedUser.quests_completed
            );

            // Build completion message
            let message = `Quest completed! You earned ${finalCurrency.toLocaleString()} Dakari and ${finalGems} gems!`;
            if (guildBonusInfo.hasGuild && guildBonusInfo.bonus > 0) {
                message += ` (${guildBonusInfo.bonus}% guild bonus from ${guildBonusInfo.guildName})`;
            }

            // Emit event
            this.emitUserEvent(userId, 'quest:completed', {
                questId,
                questName: quest.quest_name,
                rewards: {
                    baseCurrency,
                    baseGems,
                    finalCurrency,
                    finalGems,
                    guildBonus: guildBonusInfo.bonus
                },
                newTotals: {
                    currency: updatedUser.currency,
                    gems: updatedUser.gems,
                    questsCompleted: updatedUser.quests_completed
                },
                source
            });

            this.log('completeQuest', { userId, questId, rewards: { finalCurrency, finalGems, guildBonus: guildBonusInfo.bonus }, source });

            return this.success({
                quest,
                rewards: {
                    baseCurrency,
                    baseGems,
                    finalCurrency,
                    finalGems,
                    guildBonus: guildBonusInfo.bonus
                },
                user: updatedUser,
                message
            }, 'Quest completed successfully');
        } catch (error) {
            return this.handleError(error, 'completeQuest');
        }
    }

    /**
     * Fail a quest for a user
     * @param {string} userId - Discord user ID
     * @param {number} questId - Quest ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Quest failure result
     */
    static async failQuest(userId, questId, source = 'discord') {
        try {
            this.validateRequired({ userId, questId }, ['userId', 'questId']);

            const user = this.validateUserExists(userId, UserModel);
            const quest = QuestModel.findById(questId);

            if (!quest) {
                throw new NotFoundError(`Quest ${questId} not found`);
            }

            // Mark quest as failed
            UserQuestModel.failQuest(user.id, questId);

            // Emit event
            this.emitUserEvent(userId, 'quest:failed', {
                questId,
                questName: quest.quest_name,
                source
            });

            this.log('failQuest', { userId, questId, questName: quest.quest_name, source });

            return this.success({
                quest,
                message: `Quest failed. You cannot retry this quest today.`
            }, 'Quest marked as failed');
        } catch (error) {
            return this.handleError(error, 'failQuest');
        }
    }

    /**
     * Get user's quests for a server
     * @param {string} userId - Discord user ID
     * @param {string} serverId - Discord server ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} User quests
     */
    static async getUserQuests(userId, serverId, source = 'discord') {
        try {
            this.validateRequired({ userId, serverId }, ['userId', 'serverId']);

            const user = UserModel.findByDiscordId(userId);
            if (!user) {
                return this.success([], 'No quests found - user not registered');
            }

            const quests = UserQuestModel.getUserQuests(user.id, serverId);
            const completedCount = UserQuestModel.getCompletedCount(user.id, serverId);

            this.log('getUserQuests', { userId, serverId, questCount: quests.length, completedCount, source });

            return this.success({
                quests,
                completedCount,
                maxQuests: config.quest.questsPerServer
            }, 'User quests retrieved');
        } catch (error) {
            return this.handleError(error, 'getUserQuests');
        }
    }

    /**
     * Rotate quests for all opted-in servers
     * Called by cron scheduler
     * @returns {Promise<Object>} Rotation result
     */
    static async rotateQuests() {
        try {
            const servers = ServerModel.getOptedInServers();

            // Delete expired quests
            QuestModel.deleteExpired();

            const expiresAt = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
            let rotatedCount = 0;

            for (const server of servers) {
                const questTemplates = getRandomQuests(config.quest.questsPerServer);

                for (const template of questTemplates) {
                    QuestModel.create(
                        server.discord_id,
                        template.type,
                        template.name,
                        template.description,
                        template.rewardCurrency,
                        template.rewardGems,
                        template.difficulty,
                        expiresAt
                    );
                }

                rotatedCount++;

                // Emit event for each server
                this.emitServerEvent(server.discord_id, 'quests:rotated', {
                    serverName: server.name,
                    questCount: questTemplates.length
                });
            }

            this.log('rotateQuests', { serversRotated: rotatedCount, questsPerServer: config.quest.questsPerServer });

            return this.success({
                serversRotated: rotatedCount,
                questsPerServer: config.quest.questsPerServer
            }, 'Quest rotation completed');
        } catch (error) {
            return this.handleError(error, 'rotateQuests');
        }
    }
}

module.exports = QuestService;
