const { BaseService, ValidationError, NotFoundError } = require('./BaseService');
const { BossModel, BossParticipantModel, UserModel, ServerModel, LeaderboardModel, GlobalStatsModel } = require('../../database/models');
const { getRandomBoss } = require('../../bot/utils/questData');
const { LevelSystem } = require('../../utils/levelSystem');
const config = require('../../../config.json');
const AchievementService = require('./AchievementService');
const GuildService = require('./GuildService');

/**
 * BossService - Handles all boss-related game logic
 *
 * Provides boss management functionality for both Discord and Web platforms:
 * - Boss spawning and management
 * - Boss attacking and combat
 * - Boss defeat handling and rewards
 * - Boss participant tracking
 *
 * @extends BaseService
 */
class BossService extends BaseService {
    /**
     * Get active boss
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Active boss data
     */
    static async getActiveBoss(source = 'discord') {
        try {
            const boss = BossModel.getActiveBoss();

            if (!boss) {
                return {
                    success: true,
                    data: null,
                    message: 'No active boss'
                };
            }

            const status = this.calculateBossStatus(boss);
            const participants = BossParticipantModel.getParticipants(boss.id);

            this.log('getActiveBoss', { bossId: boss.id, bossName: boss.boss_name, source });

            return this.success({
                boss,
                status,
                participants,
                participantCount: participants.length
            }, 'Active boss retrieved');
        } catch (error) {
            return this.handleError(error, 'getActiveBoss');
        }
    }

    /**
     * Calculate boss status (health %, time remaining, etc.)
     * @param {Object} boss - Boss data
     * @returns {Object} Boss status
     */
    static calculateBossStatus(boss) {
        const healthPercent = Math.round((boss.health / boss.max_health) * 100);
        const timeRemaining = boss.expires_at - Math.floor(Date.now() / 1000);
        const minutesRemaining = Math.max(0, Math.round(timeRemaining / 60));

        return {
            healthPercent,
            minutesRemaining,
            timeRemaining,
            isAlive: boss.health > 0 && !boss.defeated,
            isExpired: timeRemaining <= 0
        };
    }

    /**
     * Spawn a new boss
     * @param {string} serverId - Discord server ID (optional, random if not provided)
     * @param {Object} bossTemplate - Boss template (optional, random if not provided)
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Spawned boss data
     */
    static async spawnBoss(serverId = null, bossTemplate = null, source = 'system') {
        try {
            // Check if there's already an active boss
            const existingBoss = BossModel.getActiveBoss();
            if (existingBoss) {
                return {
                    success: false,
                    error: 'A boss is already active',
                    type: 'boss_active',
                    activeBoss: existingBoss
                };
            }

            // Get random server if not provided
            let targetServer;
            if (serverId) {
                targetServer = ServerModel.findByDiscordId(serverId);
                if (!targetServer) {
                    throw new NotFoundError(`Server ${serverId} not found`);
                }
            } else {
                const servers = ServerModel.getOptedInServers();
                if (servers.length === 0) {
                    return {
                        success: false,
                        error: 'No opted-in servers available',
                        type: 'no_servers'
                    };
                }
                targetServer = servers[Math.floor(Math.random() * servers.length)];
            }

            // Get random boss template if not provided
            const boss = bossTemplate || getRandomBoss();

            const expiresAt = Math.floor(Date.now() / 1000) + (config.boss.spawnDuration / 1000);

            // Create boss
            const result = BossModel.create(
                boss.type,
                boss.name,
                targetServer.discord_id,
                boss.health,
                boss.rewardCurrency,
                boss.rewardGems,
                expiresAt
            );

            const bossId = result.lastInsertRowid;
            const spawnedBoss = BossModel.findById(bossId);

            // Update last boss spawn time
            const now = Math.floor(Date.now() / 1000);
            GlobalStatsModel.updateLastBossSpawn(now);

            // Emit event
            this.emitServerEvent(targetServer.discord_id, 'boss:spawned', {
                bossId,
                bossName: boss.name,
                bossType: boss.type,
                health: boss.health,
                server: targetServer.name,
                serverId: targetServer.discord_id,
                expiresAt,
                source
            });

            this.log('spawnBoss', {
                bossId,
                bossName: boss.name,
                server: targetServer.name,
                serverId: targetServer.discord_id,
                source
            });

            return this.success({
                boss: spawnedBoss,
                server: targetServer,
                message: `${boss.name} has spawned in ${targetServer.name}!`
            }, 'Boss spawned successfully');
        } catch (error) {
            return this.handleError(error, 'spawnBoss');
        }
    }

    /**
     * Attack a boss
     * @param {string} userId - Discord user ID
     * @param {number} bossId - Boss ID (optional, uses active boss if not provided)
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Attack result
     */
    static async attackBoss(userId, bossId = null, source = 'discord') {
        try {
            this.validateRequired({ userId }, ['userId']);

            // Get boss
            const boss = bossId ? BossModel.findById(bossId) : BossModel.getActiveBoss();

            if (!boss) {
                throw new NotFoundError('No active boss to attack');
            }

            // Check boss status
            const status = this.calculateBossStatus(boss);

            if (!status.isAlive) {
                return {
                    success: false,
                    error: 'Boss has already been defeated',
                    type: 'already_defeated'
                };
            }

            if (status.isExpired) {
                return {
                    success: false,
                    error: 'Boss has expired',
                    type: 'expired'
                };
            }

            // Get or create user
            let user = UserModel.findByDiscordId(userId);
            if (!user) {
                UserModel.create(userId, 'Unknown User');
                user = UserModel.findByDiscordId(userId);
            }

            // Check if user is traveling
            const now = Math.floor(Date.now() / 1000);
            if (user.traveling && user.travel_arrives_at > now) {
                const timeLeft = user.travel_arrives_at - now;
                return {
                    success: false,
                    error: 'User is currently traveling',
                    type: 'traveling',
                    destination: user.travel_destination,
                    timeRemaining: timeLeft
                };
            }

            // Calculate damage with guild bonus
            const baseDamage = 100;
            const randomFactor = Math.random() * 0.5 + 0.75; // 0.75 to 1.25
            const guildBonus = GuildService.getGuildBonus(userId);
            const guildBonusInfo = GuildService.getGuildBonusInfo(userId);
            const damage = Math.floor(baseDamage * randomFactor * guildBonus);

            // Add participant and damage
            BossParticipantModel.addParticipant(boss.id, user.id);
            BossParticipantModel.addDamage(boss.id, user.id, damage);
            BossModel.dealDamage(boss.id, damage);

            const updatedBoss = BossModel.findById(boss.id);

            // Get total attack count for achievements
            const participant = BossParticipantModel.getParticipant(boss.id, user.id);
            if (participant) {
                AchievementService.checkAchievements(user.id, 'boss_attack', participant.attack_count);
            }

            // Emit attack event
            this.emitUserEvent(userId, 'boss:attacked', {
                bossId: boss.id,
                bossName: boss.boss_name,
                damage,
                guildBonus: guildBonusInfo.bonus,
                remainingHealth: updatedBoss.health,
                source
            });

            // Check if boss is defeated
            if (updatedBoss.health <= 0 && !updatedBoss.defeated) {
                const defeatResult = await this.defeatBoss(boss.id, source);

                return this.success({
                    ...defeatResult.data,
                    attack: {
                        damage,
                        finalBlow: true
                    }
                }, 'Boss defeated!');
            }

            this.log('attackBoss', { userId, bossId: boss.id, damage, guildBonus: guildBonusInfo.bonus, remainingHealth: updatedBoss.health, source });

            // Build attack message with guild bonus
            let attackMessage = `Dealt ${damage} damage!`;
            if (guildBonusInfo.hasGuild && guildBonusInfo.bonus > 0) {
                attackMessage += ` (+${guildBonusInfo.bonus}% guild bonus)`;
            }

            return this.success({
                boss: updatedBoss,
                damage,
                guildBonus: guildBonusInfo.bonus,
                remainingHealth: updatedBoss.health,
                status: this.calculateBossStatus(updatedBoss)
            }, attackMessage);
        } catch (error) {
            return this.handleError(error, 'attackBoss');
        }
    }

    /**
     * Defeat a boss and distribute rewards
     * @param {number} bossId - Boss ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Defeat result with rewards
     */
    static async defeatBoss(bossId, source = 'discord') {
        try {
            this.validateRequired({ bossId }, ['bossId']);

            const boss = BossModel.findById(bossId);
            if (!boss) {
                throw new NotFoundError(`Boss ${bossId} not found`);
            }

            // Mark boss as defeated
            BossModel.defeatBoss(bossId);

            // Get participants
            const participants = BossParticipantModel.getParticipants(bossId);
            const topDealer = BossParticipantModel.getTopDamageDealer(bossId);

            const bossExp = LevelSystem.getBossExperience(boss.max_health);

            // Distribute rewards to all participants
            const rewardsList = [];

            for (const participant of participants) {
                const isTopDealer = topDealer && participant.user_id === topDealer.user_id;
                const currencyReward = isTopDealer ? Math.floor(boss.reward_currency * 1.5) : boss.reward_currency;
                const gemReward = isTopDealer ? Math.floor(boss.reward_gems * 1.5) : boss.reward_gems;
                const expReward = isTopDealer ? Math.floor(bossExp * 1.5) : bossExp;

                // Award currency and gems
                UserModel.updateCurrency(participant.discord_id, currencyReward);
                UserModel.updateGems(participant.discord_id, gemReward);
                UserModel.incrementBossesDefeated(participant.discord_id);

                // Award experience and handle leveling
                const participantUser = UserModel.findByDiscordId(participant.discord_id);
                if (participantUser) {
                    const levelResult = LevelSystem.addExperience(
                        participantUser.level,
                        participantUser.experience,
                        participantUser.total_experience,
                        expReward
                    );

                    UserModel.updateLevel(participant.discord_id, levelResult.newLevel, levelResult.newCurrentExp, levelResult.newTotalExp);

                    // Level up rewards
                    if (levelResult.leveledUp) {
                        const levelRewards = LevelSystem.getLevelRewards(levelResult.newLevel);
                        UserModel.updateCurrency(participant.discord_id, levelRewards.currency);
                        UserModel.updateGems(participant.discord_id, levelRewards.gems);
                    }

                    // Update leaderboard
                    const now = new Date();
                    LeaderboardModel.updateScore(
                        participant.user_id,
                        currencyReward + (gemReward * 10),
                        now.getMonth() + 1,
                        now.getFullYear()
                    );

                    rewardsList.push({
                        userId: participant.discord_id,
                        username: participant.username,
                        damage: participant.damage_dealt,
                        isTopDealer,
                        rewards: {
                            currency: currencyReward,
                            gems: gemReward,
                            exp: expReward
                        },
                        leveledUp: levelResult.leveledUp,
                        newLevel: levelResult.newLevel
                    });
                }
            }

            // Emit defeat event
            this.emitEvent('boss:defeated', {
                bossId,
                bossName: boss.boss_name,
                bossType: boss.boss_type,
                serverId: boss.server_id,
                participantCount: participants.length,
                topDealer: topDealer ? {
                    userId: topDealer.discord_id,
                    username: topDealer.username,
                    damage: topDealer.damage_dealt
                } : null,
                source
            });

            this.log('defeatBoss', {
                bossId,
                bossName: boss.boss_name,
                participantCount: participants.length,
                topDealer: topDealer ? topDealer.username : 'None',
                source
            });

            return this.success({
                boss,
                participants: rewardsList,
                topDealer: topDealer ? {
                    userId: topDealer.discord_id,
                    username: topDealer.username,
                    damage: topDealer.damage_dealt
                } : null,
                message: `${boss.boss_name} has been defeated!`
            }, 'Boss defeated successfully');
        } catch (error) {
            return this.handleError(error, 'defeatBoss');
        }
    }

    /**
     * Get boss participants
     * @param {number} bossId - Boss ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Boss participants
     */
    static async getBossParticipants(bossId, source = 'discord') {
        try {
            this.validateRequired({ bossId }, ['bossId']);

            const boss = BossModel.findById(bossId);
            if (!boss) {
                throw new NotFoundError(`Boss ${bossId} not found`);
            }

            const participants = BossParticipantModel.getParticipants(bossId);
            const topDealer = BossParticipantModel.getTopDamageDealer(bossId);

            this.log('getBossParticipants', { bossId, participantCount: participants.length, source });

            return this.success({
                boss,
                participants,
                topDealer,
                participantCount: participants.length
            }, 'Boss participants retrieved');
        } catch (error) {
            return this.handleError(error, 'getBossParticipants');
        }
    }

    /**
     * Cleanup expired bosses
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Cleanup result
     */
    static async cleanupExpiredBosses(source = 'system') {
        try {
            BossModel.cleanupExpired();

            this.log('cleanupExpiredBosses', { source });

            return this.success({
                message: 'Expired bosses cleaned up'
            }, 'Cleanup completed');
        } catch (error) {
            return this.handleError(error, 'cleanupExpiredBosses');
        }
    }
}

module.exports = BossService;
