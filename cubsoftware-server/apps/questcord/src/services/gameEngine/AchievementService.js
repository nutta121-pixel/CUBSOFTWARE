const { BaseService } = require('./BaseService');
const { db } = require('../../database/schema');

class AchievementService extends BaseService {
    constructor() {
        super('AchievementService');
    }

    /**
     * Check and unlock achievements for a user
     * @param {number} userId - Internal user ID
     * @param {string} criteriaType - Type of criteria to check
     * @param {number} currentValue - Current value to check against
     */
    checkAchievements(userId, criteriaType, currentValue) {
        try {
            // Get achievements of this type that aren't unlocked
            const achievements = db.prepare(`
                SELECT a.*
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
                WHERE a.criteria_type = ?
                AND (ua.unlocked IS NULL OR ua.unlocked = 0)
                AND a.criteria_value <= ?
            `).all(userId, criteriaType, currentValue);

            const unlockedAchievements = [];

            for (const achievement of achievements) {
                const unlocked = this.unlockAchievement(userId, achievement.id);
                if (unlocked) {
                    unlockedAchievements.push(achievement);
                }
            }

            return unlockedAchievements;
        } catch (error) {
            this.handleError(error, 'checkAchievements');
            return [];
        }
    }

    /**
     * Unlock a specific achievement for a user
     * @param {number} userId - Internal user ID
     * @param {string} achievementId - Achievement ID to unlock
     * @returns {boolean} True if unlocked, false otherwise
     */
    unlockAchievement(userId, achievementId) {
        try {
            const now = Math.floor(Date.now() / 1000);

            // Check if already unlocked
            const existing = db.prepare(`
                SELECT unlocked FROM user_achievements
                WHERE user_id = ? AND achievement_id = ?
            `).get(userId, achievementId);

            if (existing && existing.unlocked === 1) {
                return false; // Already unlocked
            }

            if (existing) {
                // Update existing record
                db.prepare(`
                    UPDATE user_achievements
                    SET unlocked = 1, unlocked_at = ?, notified = 0
                    WHERE user_id = ? AND achievement_id = ?
                `).run(now, userId, achievementId);
            } else {
                // Insert new record
                db.prepare(`
                    INSERT INTO user_achievements (user_id, achievement_id, unlocked, unlocked_at, notified)
                    VALUES (?, ?, 1, ?, 0)
                `).run(userId, achievementId, now);
            }

            // Get achievement details
            const achievement = db.prepare('SELECT * FROM achievements WHERE id = ?').get(achievementId);

            // Emit achievement unlock event
            this.emitEvent('achievement:unlocked', {
                userId,
                achievement
            });

            return true;
        } catch (error) {
            this.handleError(error, 'unlockAchievement');
            return false;
        }
    }

    /**
     * Update achievement progress
     * @param {number} userId - Internal user ID
     * @param {string} achievementId - Achievement ID
     * @param {number} progress - Current progress value
     */
    updateProgress(userId, achievementId, progress) {
        try {
            const existing = db.prepare(`
                SELECT * FROM user_achievements
                WHERE user_id = ? AND achievement_id = ?
            `).get(userId, achievementId);

            if (existing) {
                db.prepare(`
                    UPDATE user_achievements
                    SET progress = ?
                    WHERE user_id = ? AND achievement_id = ?
                `).run(progress, userId, achievementId);
            } else {
                db.prepare(`
                    INSERT INTO user_achievements (user_id, achievement_id, progress)
                    VALUES (?, ?, ?)
                `).run(userId, achievementId, progress);
            }

            return true;
        } catch (error) {
            this.handleError(error, 'updateProgress');
            return false;
        }
    }

    /**
     * Get all achievements for a user
     * @param {number} userId - Internal user ID
     * @returns {Array} Array of achievements with unlock status
     */
    getUserAchievements(userId) {
        try {
            const achievements = db.prepare(`
                SELECT
                    a.*,
                    ua.unlocked,
                    ua.unlocked_at,
                    ua.progress
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
                WHERE a.hidden = 0 OR ua.unlocked = 1
                ORDER BY a.rarity, a.category, a.points DESC
            `).all(userId);

            return achievements;
        } catch (error) {
            this.handleError(error, 'getUserAchievements');
            return [];
        }
    }

    /**
     * Get achievement statistics for a user
     * @param {number} userId - Internal user ID
     * @returns {Object} Achievement stats
     */
    getUserAchievementStats(userId) {
        try {
            const stats = db.prepare(`
                SELECT
                    COUNT(*) as total_achievements,
                    SUM(CASE WHEN ua.unlocked = 1 THEN 1 ELSE 0 END) as unlocked_count,
                    SUM(CASE WHEN ua.unlocked = 1 THEN a.points ELSE 0 END) as total_points
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
                WHERE a.hidden = 0
            `).get(userId);

            return {
                total: stats.total_achievements || 0,
                unlocked: stats.unlocked_count || 0,
                totalPoints: stats.total_points || 0,
                percentage: stats.total_achievements > 0
                    ? Math.round((stats.unlocked_count / stats.total_achievements) * 100)
                    : 0
            };
        } catch (error) {
            this.handleError(error, 'getUserAchievementStats');
            return { total: 0, unlocked: 0, totalPoints: 0, percentage: 0 };
        }
    }

    /**
     * Get achievements by category
     * @param {number} userId - Internal user ID
     * @param {string} category - Achievement category
     * @returns {Array} Achievements in the category
     */
    getAchievementsByCategory(userId, category) {
        try {
            const achievements = db.prepare(`
                SELECT
                    a.*,
                    ua.unlocked,
                    ua.unlocked_at,
                    ua.progress
                FROM achievements a
                LEFT JOIN user_achievements ua ON a.id = ua.achievement_id AND ua.user_id = ?
                WHERE a.category = ? AND (a.hidden = 0 OR ua.unlocked = 1)
                ORDER BY a.points DESC
            `).all(userId, category);

            return achievements;
        } catch (error) {
            this.handleError(error, 'getAchievementsByCategory');
            return [];
        }
    }

    /**
     * Get recently unlocked achievements
     * @param {number} userId - Internal user ID
     * @param {number} limit - Number of achievements to return
     * @returns {Array} Recently unlocked achievements
     */
    getRecentlyUnlocked(userId, limit = 10) {
        try {
            const achievements = db.prepare(`
                SELECT a.*, ua.unlocked_at
                FROM achievements a
                JOIN user_achievements ua ON a.id = ua.achievement_id
                WHERE ua.user_id = ? AND ua.unlocked = 1
                ORDER BY ua.unlocked_at DESC
                LIMIT ?
            `).all(userId, limit);

            return achievements;
        } catch (error) {
            this.handleError(error, 'getRecentlyUnlocked');
            return [];
        }
    }
}

const achievementService = new AchievementService();
module.exports = achievementService;
