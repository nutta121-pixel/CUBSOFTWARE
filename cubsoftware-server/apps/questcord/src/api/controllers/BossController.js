const BossService = require('../../services/gameEngine/BossService');

/**
 * BossController - Handles HTTP requests for boss-related operations
 *
 * Acts as a bridge between HTTP API and BossService
 */
class BossController {
    /**
     * Get active boss
     * GET /api/v1/bosses/active
     */
    static async getActiveBoss(req, res) {
        try {
            const result = await BossService.getActiveBoss('web');

            res.json(result);
        } catch (error) {
            console.error('Error in getActiveBoss:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Attack a boss
     * POST /api/v1/bosses/:bossId/attack
     */
    static async attackBoss(req, res) {
        try {
            const { bossId } = req.params;

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }

            const result = await BossService.attackBoss(
                req.user.discord_id,
                bossId ? parseInt(bossId) : null,
                'web'
            );

            if (!result.success) {
                const statusCode = result.type === 'already_defeated' ? 409 :
                                 result.type === 'expired' ? 410 :
                                 result.type === 'traveling' ? 403 : 400;
                return res.status(statusCode).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in attackBoss:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get boss participants
     * GET /api/v1/bosses/:bossId/participants
     */
    static async getBossParticipants(req, res) {
        try {
            const { bossId } = req.params;

            const result = await BossService.getBossParticipants(parseInt(bossId), 'web');

            if (!result.success) {
                return res.status(404).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in getBossParticipants:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Spawn a boss (admin only)
     * POST /api/v1/bosses/spawn
     */
    static async spawnBoss(req, res) {
        try {
            // This would need admin authorization middleware
            // For now, just implementing the endpoint structure

            const { serverId, bossTemplate } = req.body;

            const result = await BossService.spawnBoss(serverId, bossTemplate, 'web');

            if (!result.success) {
                const statusCode = result.type === 'boss_active' ? 409 :
                                 result.type === 'no_servers' ? 400 : 500;
                return res.status(statusCode).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in spawnBoss:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = BossController;
