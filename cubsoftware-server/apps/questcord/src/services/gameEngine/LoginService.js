const { BaseService, ValidationError, NotFoundError } = require('./BaseService');
const { db } = require('../../database/schema');
const GuildService = require('./GuildService');

/**
 * LoginService - Handles daily login rewards and streak tracking
 */
class LoginService extends BaseService {
    /**
     * Check if a user can claim daily login reward
     * @param {number} userId - User ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Claim status and reward info
     */
    static async checkDailyLogin(userId, source = 'discord') {
        try {
            this.validateRequired({ userId }, ['userId']);

            // Get or create streak record
            let streak = db.prepare('SELECT * FROM user_login_streak WHERE user_id = ?').get(userId);

            if (!streak) {
                // Create new streak record
                db.prepare(`
                    INSERT INTO user_login_streak (user_id, current_streak, longest_streak, total_logins)
                    VALUES (?, 0, 0, 0)
                `).run(userId);
                streak = db.prepare('SELECT * FROM user_login_streak WHERE user_id = ?').get(userId);
            }

            const now = new Date();
            const today = now.toISOString().split('T')[0]; // YYYY-MM-DD
            const lastLogin = streak.last_login_date ? streak.last_login_date.split('T')[0] : null;

            // Check if already claimed today
            if (lastLogin === today) {
                const nextReward = this.getRewardForDay((streak.current_streak % 7) + 1);
                return {
                    success: true,
                    canClaim: false,
                    message: 'You have already claimed your daily reward today!',
                    data: {
                        currentStreak: streak.current_streak,
                        longestStreak: streak.longest_streak,
                        totalLogins: streak.total_logins,
                        nextReward: nextReward,
                        hoursUntilNext: this.getHoursUntilNextDay()
                    }
                };
            }

            // Calculate current reward day (1-7 cycle)
            const rewardDay = (streak.current_streak % 7) + 1;
            const reward = this.getRewardForDay(rewardDay);

            return {
                success: true,
                canClaim: true,
                message: 'Daily reward available!',
                data: {
                    currentStreak: streak.current_streak,
                    longestStreak: streak.longest_streak,
                    totalLogins: streak.total_logins,
                    rewardDay: rewardDay,
                    reward: reward
                }
            };

        } catch (error) {
            return this.handleError(error, 'checkDailyLogin');
        }
    }

    /**
     * Claim daily login reward
     * @param {number} userId - User ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Claimed reward details
     */
    static async claimDailyReward(userId, source = 'discord') {
        try {
            this.validateRequired({ userId }, ['userId']);

            // Check if can claim
            const checkResult = await this.checkDailyLogin(userId, source);
            if (!checkResult.canClaim) {
                return checkResult;
            }

            const streak = db.prepare('SELECT * FROM user_login_streak WHERE user_id = ?').get(userId);
            const now = new Date().toISOString();
            const today = now.split('T')[0];
            const lastLogin = streak.last_login_date ? streak.last_login_date.split('T')[0] : null;

            // Calculate new streak
            let newStreak = streak.current_streak + 1;
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            // Reset streak if missed a day (unless this is first login)
            if (lastLogin && lastLogin !== yesterday && lastLogin !== today) {
                newStreak = 1; // Streak broken, reset to 1
            }

            const longestStreak = Math.max(newStreak, streak.longest_streak);
            const totalLogins = streak.total_logins + 1;

            // Get reward for current day
            const rewardDay = (newStreak - 1) % 7 + 1;
            const baseReward = this.getRewardForDay(rewardDay);

            // Get user's Discord ID for guild bonus calculation
            const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
            const guildBonus = GuildService.getGuildBonus(user.discord_id);
            const guildBonusInfo = GuildService.getGuildBonusInfo(user.discord_id);

            // Apply guild bonus to rewards
            const finalCurrency = Math.floor(baseReward.currency * guildBonus);
            const finalGems = Math.floor(baseReward.gems * guildBonus);

            // Update streak in transaction
            const transaction = db.transaction(() => {
                // Update streak
                db.prepare(`
                    UPDATE user_login_streak
                    SET last_login_date = ?,
                        current_streak = ?,
                        longest_streak = ?,
                        total_logins = ?,
                        last_reward_claimed = ?,
                        updated_at = ?
                    WHERE user_id = ?
                `).run(now, newStreak, longestStreak, totalLogins, rewardDay, now, userId);

                // Update user's last_login_date and login_streak
                db.prepare(`
                    UPDATE users
                    SET last_login_date = ?,
                        login_streak = ?
                    WHERE id = ?
                `).run(now, newStreak, userId);

                // Award currency if applicable (with guild bonus)
                if (finalCurrency > 0) {
                    db.prepare(`
                        UPDATE users
                        SET currency = currency + ?
                        WHERE id = ?
                    `).run(finalCurrency, userId);
                }

                // Award gems if applicable (with guild bonus)
                if (finalGems > 0) {
                    db.prepare(`
                        UPDATE users
                        SET gems = gems + ?
                        WHERE id = ?
                    `).run(finalGems, userId);
                }

                // Award item if applicable (would need inventory system)
                // TODO: Add item reward logic when inventory is implemented
            });

            transaction();

            // Build claim message
            let claimMessage = `Day ${rewardDay} reward claimed! Streak: ${newStreak} days`;
            if (guildBonusInfo.hasGuild && guildBonusInfo.bonus > 0) {
                claimMessage += ` (+${guildBonusInfo.bonus}% guild bonus)`;
            }

            // Emit event
            this.emitEvent('login:daily_claimed', {
                userId,
                source,
                rewardDay,
                baseReward,
                finalReward: {
                    currency: finalCurrency,
                    gems: finalGems
                },
                guildBonus: guildBonusInfo.bonus,
                newStreak,
                longestStreak,
                totalLogins
            });

            // Get updated user
            const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

            return this.success({
                rewardDay,
                baseReward,
                finalReward: {
                    currency: finalCurrency,
                    gems: finalGems
                },
                guildBonus: guildBonusInfo.bonus,
                streak: {
                    current: newStreak,
                    longest: longestStreak,
                    total: totalLogins
                },
                user: {
                    currency: updatedUser.currency,
                    gems: updatedUser.gems
                }
            }, claimMessage);

        } catch (error) {
            return this.handleError(error, 'claimDailyReward');
        }
    }

    /**
     * Get reward details for a specific day
     * @param {number} day - Day number (1-7)
     * @returns {Object} Reward details
     */
    static getRewardForDay(day) {
        const reward = db.prepare('SELECT * FROM login_rewards WHERE day = ?').get(day);
        if (!reward) {
            // Fallback default reward
            return {
                day: day,
                currency: 100,
                gems: 0,
                item_id: null,
                item_quantity: 0,
                description: `Day ${day} reward`
            };
        }
        return reward;
    }

    /**
     * Get all 7-day rewards for display
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} All rewards
     */
    static async getAllRewards(source = 'discord') {
        try {
            const rewards = db.prepare('SELECT * FROM login_rewards ORDER BY day ASC').all();
            return this.success(rewards, 'Daily rewards retrieved');
        } catch (error) {
            return this.handleError(error, 'getAllRewards');
        }
    }

    /**
     * Get user's login statistics
     * @param {number} userId - User ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} User login stats
     */
    static async getUserLoginStats(userId, source = 'discord') {
        try {
            this.validateRequired({ userId }, ['userId']);

            const streak = db.prepare('SELECT * FROM user_login_streak WHERE user_id = ?').get(userId);

            if (!streak) {
                return this.success({
                    currentStreak: 0,
                    longestStreak: 0,
                    totalLogins: 0,
                    lastLogin: null,
                    lastRewardClaimed: 0
                }, 'No login history found');
            }

            return this.success({
                currentStreak: streak.current_streak,
                longestStreak: streak.longest_streak,
                totalLogins: streak.total_logins,
                lastLogin: streak.last_login_date,
                lastRewardClaimed: streak.last_reward_claimed
            }, 'Login stats retrieved');

        } catch (error) {
            return this.handleError(error, 'getUserLoginStats');
        }
    }

    /**
     * Calculate hours until next day (UTC midnight)
     * @returns {number} Hours until next day
     */
    static getHoursUntilNextDay() {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        tomorrow.setUTCHours(0, 0, 0, 0);

        const diff = tomorrow - now;
        return Math.floor(diff / (1000 * 60 * 60));
    }
}

module.exports = LoginService;
