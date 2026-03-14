const LoginService = require('../../services/gameEngine/LoginService');
const { UserModel } = require('../../database/models');

/**
 * LoginController - HTTP request handlers for daily login rewards
 */
class LoginController {
    /**
     * GET /api/v1/daily/check
     * Check if user can claim daily reward
     */
    static async checkDailyReward(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'Not authenticated' });
            }

            const user = UserModel.findByDiscordId(req.user.discord_id);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const result = await LoginService.checkDailyLogin(user.id, 'web');
            return res.json(result);

        } catch (error) {
            console.error('[LoginController] Error checking daily reward:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }

    /**
     * POST /api/v1/daily/claim
     * Claim daily login reward
     */
    static async claimDailyReward(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'Not authenticated' });
            }

            const user = UserModel.findByDiscordId(req.user.discord_id);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const result = await LoginService.claimDailyReward(user.id, 'web');

            if (!result.success) {
                return res.status(400).json(result);
            }

            return res.json(result);

        } catch (error) {
            console.error('[LoginController] Error claiming daily reward:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }

    /**
     * GET /api/v1/daily/rewards
     * Get all 7-day reward tiers
     */
    static async getAllRewards(req, res) {
        try {
            const result = await LoginService.getAllRewards('web');
            return res.json(result);

        } catch (error) {
            console.error('[LoginController] Error getting rewards:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }

    /**
     * GET /api/v1/daily/stats
     * Get user's login statistics
     */
    static async getLoginStats(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ success: false, error: 'Not authenticated' });
            }

            const user = UserModel.findByDiscordId(req.user.discord_id);
            if (!user) {
                return res.status(404).json({ success: false, error: 'User not found' });
            }

            const result = await LoginService.getUserLoginStats(user.id, 'web');
            return res.json(result);

        } catch (error) {
            console.error('[LoginController] Error getting login stats:', error);
            return res.status(500).json({ success: false, error: 'Internal server error' });
        }
    }
}

module.exports = LoginController;
