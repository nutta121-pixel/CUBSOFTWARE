const AchievementService = require('../../services/gameEngine/AchievementService');
const { UserModel } = require('../../database/models');

class AchievementController {
    /**
     * Get all achievements for the authenticated user
     * GET /api/v1/achievements
     */
    static async getUserAchievements(req, res) {
        try {
            const discordId = req.user.id;
            const user = UserModel.findByDiscordId(discordId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const achievements = AchievementService.getUserAchievements(user.id);

            return res.json({
                success: true,
                data: achievements
            });
        } catch (error) {
            console.error('Error fetching user achievements:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch achievements'
            });
        }
    }

    /**
     * Get achievement statistics for the authenticated user
     * GET /api/v1/achievements/stats
     */
    static async getAchievementStats(req, res) {
        try {
            const discordId = req.user.id;
            const user = UserModel.findByDiscordId(discordId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const stats = AchievementService.getUserAchievementStats(user.id);

            return res.json({
                success: true,
                data: stats
            });
        } catch (error) {
            console.error('Error fetching achievement stats:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch achievement statistics'
            });
        }
    }

    /**
     * Get achievements by category
     * GET /api/v1/achievements/category/:category
     */
    static async getAchievementsByCategory(req, res) {
        try {
            const { category } = req.params;
            const discordId = req.user.id;
            const user = UserModel.findByDiscordId(discordId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const achievements = AchievementService.getAchievementsByCategory(user.id, category);

            return res.json({
                success: true,
                data: achievements
            });
        } catch (error) {
            console.error('Error fetching achievements by category:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch achievements'
            });
        }
    }

    /**
     * Get recently unlocked achievements
     * GET /api/v1/achievements/recent
     */
    static async getRecentlyUnlocked(req, res) {
        try {
            const limit = parseInt(req.query.limit) || 10;
            const discordId = req.user.id;
            const user = UserModel.findByDiscordId(discordId);

            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            const achievements = AchievementService.getRecentlyUnlocked(user.id, limit);

            return res.json({
                success: true,
                data: achievements
            });
        } catch (error) {
            console.error('Error fetching recently unlocked achievements:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to fetch achievements'
            });
        }
    }
}

module.exports = AchievementController;
