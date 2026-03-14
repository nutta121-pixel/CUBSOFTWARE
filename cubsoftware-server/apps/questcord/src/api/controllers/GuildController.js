const GuildService = require('../../services/gameEngine/GuildService');
const { GuildModel, UserModel } = require('../../database/models');

/**
 * GuildController - Handles HTTP requests for guild-related operations
 *
 * Acts as a bridge between HTTP API and GuildService
 */
class GuildController {
    /**
     * Create a new guild
     * POST /api/v1/guilds
     */
    static async createGuild(req, res) {
        try {
            const { name, tag, description, isPublic } = req.body;
            const serverId = req.body.serverId || req.query.serverId;

            if (!name || !tag || !serverId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: name, tag, serverId'
                });
            }

            const result = await GuildService.createGuild(
                req.user.discord_id,
                name,
                tag,
                description || 'No description',
                serverId,
                isPublic || false,
                'web'
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in createGuild:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get all guilds for a server
     * GET /api/v1/guilds?serverId=123
     */
    static async getGuilds(req, res) {
        try {
            const { serverId } = req.query;

            if (!serverId) {
                return res.status(400).json({
                    success: false,
                    error: 'Server ID is required'
                });
            }

            const guilds = GuildModel.findByServerId(serverId);

            // Enrich with member counts and leader info
            const enrichedGuilds = guilds.map(guild => {
                const memberCount = GuildModel.getMemberCount(guild.id);
                const leader = UserModel.findById(guild.leader_id);
                return {
                    ...guild,
                    memberCount,
                    leaderName: leader ? leader.username : 'Unknown'
                };
            });

            res.json({
                success: true,
                data: enrichedGuilds
            });
        } catch (error) {
            console.error('Error in getGuilds:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get guild details
     * GET /api/v1/guilds/:guildId
     */
    static async getGuild(req, res) {
        try {
            const { guildId } = req.params;

            const result = await GuildService.getGuildInfo(parseInt(guildId), 'web');

            if (!result.success) {
                return res.status(404).json(result);
            }

            // Add leader info
            const leader = UserModel.findById(result.data.leader_id);
            result.data.leaderName = leader ? leader.username : 'Unknown';

            res.json(result);
        } catch (error) {
            console.error('Error in getGuild:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get user's guild
     * GET /api/v1/guilds/me
     */
    static async getMyGuild(req, res) {
        try {
            const user = UserModel.findByDiscordId(req.user.discord_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const userGuild = GuildModel.getUserGuild(user.id);
            if (!userGuild) {
                return res.json({
                    success: true,
                    data: null
                });
            }

            const result = await GuildService.getGuildInfo(userGuild.id, 'web');

            if (result.success) {
                result.data.userRole = userGuild.role;
                result.data.userContribution = {
                    currency: userGuild.contribution_currency,
                    gems: userGuild.contribution_gems
                };
            }

            res.json(result);
        } catch (error) {
            console.error('Error in getMyGuild:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Invite user to guild
     * POST /api/v1/guilds/:guildId/invite
     */
    static async inviteUser(req, res) {
        try {
            const { inviteeDiscordId } = req.body;

            if (!inviteeDiscordId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invitee Discord ID is required'
                });
            }

            const result = await GuildService.inviteUser(
                req.user.discord_id,
                inviteeDiscordId,
                'web'
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in inviteUser:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Join guild (accept invite)
     * POST /api/v1/guilds/join
     */
    static async joinGuild(req, res) {
        try {
            const { inviteId } = req.body;

            if (!inviteId) {
                return res.status(400).json({
                    success: false,
                    error: 'Invite ID is required'
                });
            }

            const result = await GuildService.joinGuild(
                req.user.discord_id,
                parseInt(inviteId),
                'web'
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in joinGuild:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Join public guild (no invite needed)
     * POST /api/v1/guilds/:guildId/join-public
     */
    static async joinPublicGuild(req, res) {
        try {
            const { guildId } = req.params;

            const result = await GuildService.joinPublicGuild(
                req.user.discord_id,
                parseInt(guildId),
                'web'
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in joinPublicGuild:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Leave guild
     * POST /api/v1/guilds/leave
     */
    static async leaveGuild(req, res) {
        try {
            const result = await GuildService.leaveGuild(req.user.discord_id, 'web');

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in leaveGuild:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Contribute to guild
     * POST /api/v1/guilds/contribute
     */
    static async contribute(req, res) {
        try {
            const { currency = 0, gems = 0 } = req.body;

            if (currency === 0 && gems === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Must contribute at least some currency or gems'
                });
            }

            const result = await GuildService.contributeToGuild(
                req.user.discord_id,
                parseInt(currency),
                parseInt(gems),
                'web'
            );

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in contribute:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get pending invites
     * GET /api/v1/guilds/invites
     */
    static async getInvites(req, res) {
        try {
            const user = UserModel.findByDiscordId(req.user.discord_id);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
            }

            const invites = GuildModel.getPendingInvites(user.id);

            res.json({
                success: true,
                data: invites
            });
        } catch (error) {
            console.error('Error in getInvites:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Upgrade guild member slots
     * POST /api/v1/guilds/upgrade/slots
     */
    static async upgradeSlots(req, res) {
        try {
            const result = await GuildService.upgradeMaxMembers(req.user.discord_id, 'web');

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in upgradeSlots:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Upgrade guild level
     * POST /api/v1/guilds/upgrade/level
     */
    static async upgradeLevel(req, res) {
        try {
            const result = await GuildService.upgradeGuildLevel(req.user.discord_id, 'web');

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in upgradeLevel:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get guild leaderboards
     * GET /api/v1/guilds/leaderboard?category=level&limit=10
     */
    static async getLeaderboard(req, res) {
        try {
            const { category = 'level', limit = 10 } = req.query;
            const maxLimit = Math.min(parseInt(limit) || 10, 50);

            let guilds;
            switch (category) {
                case 'level':
                    guilds = GuildModel.getTopGuildsByLevel(maxLimit);
                    break;
                case 'treasury':
                    guilds = GuildModel.getTopGuildsByTreasury(maxLimit);
                    break;
                case 'members':
                    guilds = GuildModel.getTopGuildsByMembers(maxLimit);
                    break;
                default:
                    guilds = GuildModel.getTopGuildsByLevel(maxLimit);
            }

            res.json({
                success: true,
                data: {
                    category,
                    guilds
                }
            });
        } catch (error) {
            console.error('Error in getLeaderboard:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get guild rank
     * GET /api/v1/guilds/:guildId/rank
     */
    static async getGuildRank(req, res) {
        try {
            const { guildId } = req.params;
            const rank = GuildModel.getGuildRank(parseInt(guildId));

            res.json({
                success: true,
                data: {
                    rank
                }
            });
        } catch (error) {
            console.error('Error in getGuildRank:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = GuildController;
