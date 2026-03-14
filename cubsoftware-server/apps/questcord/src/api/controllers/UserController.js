const UserService = require('../../services/gameEngine/UserService');

/**
 * UserController - Handles HTTP requests for user-related operations
 *
 * Acts as a bridge between HTTP API and UserService
 */
class UserController {
    /**
     * Get user profile
     * GET /api/v1/users/:userId
     */
    static async getProfile(req, res) {
        try {
            const { userId } = req.params;

            const result = await UserService.getUserProfile(userId, 'web');

            if (!result.success) {
                return res.status(404).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in getProfile:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get user stats
     * GET /api/v1/users/:userId/stats
     */
    static async getStats(req, res) {
        try {
            const { userId } = req.params;

            const result = await UserService.getUserStats(userId, 'web');

            if (!result.success) {
                return res.status(404).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in getStats:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Update user profile
     * PATCH /api/v1/users/:userId
     */
    static async updateProfile(req, res) {
        try {
            const { userId } = req.params;
            const updates = req.body;

            // Ensure user can only update their own profile
            if (req.user && req.user.discord_id !== userId) {
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'You can only update your own profile'
                });
            }

            const result = await UserService.updateProfile(userId, updates, 'web');

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in updateProfile:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get current authenticated user
     * GET /api/v1/users/me
     */
    static async getMe(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }

            const result = await UserService.getUserProfile(req.user.discord_id, 'web');

            res.json(result);
        } catch (error) {
            console.error('Error in getMe:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get user's available servers
     * GET /api/v1/users/me/servers
     */
    static async getUserServers(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }

            const discordId = req.user.discord_id;

            // Get servers from the database where the user has visited
            const { db } = require('../../database/schema');
            const servers = db.prepare(`
                SELECT DISTINCT s.discord_id, s.name
                FROM servers s
                INNER JOIN user_quests uq ON uq.server_id = s.id
                INNER JOIN users u ON u.id = uq.user_id
                WHERE u.discord_id = ?
                UNION
                SELECT s.discord_id, s.name
                FROM servers s
                WHERE s.opted_in = 1
                ORDER BY name
            `).all(discordId);

            const formattedServers = servers.map(s => ({
                id: s.discord_id,
                name: s.name
            }));

            return res.json({
                success: true,
                data: formattedServers
            });
        } catch (error) {
            console.error('Error fetching user servers:', error);
            return res.json({
                success: true,
                data: []
            });
        }
    }
}

module.exports = UserController;
