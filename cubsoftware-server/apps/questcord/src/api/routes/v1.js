const express = require('express');
const router = express.Router();
const { isAuthenticated, optionalAuth, isWhitelisted } = require('../../web/auth/discordOAuth');
const UserController = require('../controllers/UserController');
const QuestController = require('../controllers/QuestController');
const BossController = require('../controllers/BossController');
const LoginController = require('../controllers/LoginController');
const AchievementController = require('../controllers/AchievementController');
const GuildController = require('../controllers/GuildController');

// Combined middleware: authenticate AND check whitelist
const requireAuth = [isAuthenticated, isWhitelisted];

/**
 * API v1 Routes
 *
 * RESTful API endpoints for the QuestCord platform
 */

// Middleware to disable caching for all API responses
router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    next();
});

// ============================================================================
// User Routes
// ============================================================================

// Get current user (requires authentication + whitelist)
router.get('/users/me', requireAuth, UserController.getMe);

// Get user's available servers (requires authentication + whitelist)
router.get('/users/me/servers', requireAuth, UserController.getUserServers);

// Get user profile (public)
router.get('/users/:userId', optionalAuth, UserController.getProfile);

// Get user stats (public)
router.get('/users/:userId/stats', optionalAuth, UserController.getStats);

// Update user profile (requires authentication + whitelist)
router.patch('/users/:userId', requireAuth, UserController.updateProfile);

// ============================================================================
// Quest Routes
// ============================================================================

// Get active quests for a server (public)
router.get('/quests', optionalAuth, QuestController.getActiveQuests);

// Get user's quests (requires authentication + whitelist)
router.get('/quests/user', requireAuth, QuestController.getUserQuests);

// Accept a quest (requires authentication + whitelist)
router.post('/quests/:questId/accept', requireAuth, QuestController.acceptQuest);

// Complete a quest (requires authentication + whitelist)
router.post('/quests/:questId/complete', requireAuth, QuestController.completeQuest);

// Fail a quest (requires authentication + whitelist)
router.post('/quests/:questId/fail', requireAuth, QuestController.failQuest);

// ============================================================================
// Boss Routes
// ============================================================================

// Get active boss (public)
router.get('/bosses/active', optionalAuth, BossController.getActiveBoss);

// Get boss participants (public)
router.get('/bosses/:bossId/participants', optionalAuth, BossController.getBossParticipants);

// Attack a boss (requires authentication + whitelist)
router.post('/bosses/:bossId/attack', requireAuth, BossController.attackBoss);

// Spawn a boss (admin only - TODO: add admin middleware)
router.post('/bosses/spawn', requireAuth, BossController.spawnBoss);

// ============================================================================
// Daily Login Rewards Routes
// ============================================================================

// Check if user can claim daily reward (requires authentication + whitelist)
router.get('/daily/check', requireAuth, LoginController.checkDailyReward);

// Claim daily reward (requires authentication + whitelist)
router.post('/daily/claim', requireAuth, LoginController.claimDailyReward);

// Get all reward tiers (public)
router.get('/daily/rewards', LoginController.getAllRewards);

// Get user's login statistics (requires authentication + whitelist)
router.get('/daily/stats', requireAuth, LoginController.getLoginStats);

// ============================================================================
// Travel Routes
// ============================================================================

// Start travel to a new server (requires authentication + whitelist)
router.post('/travel', requireAuth, async (req, res) => {
    try {
        const { destination } = req.body;
        const userId = req.user.discord_id;

        if (!destination) {
            return res.status(400).json({
                success: false,
                message: 'Destination server ID is required'
            });
        }

        const { db } = require('../../database/schema');
        const { UserModel } = require('../../database/models');

        const user = UserModel.findByDiscordId(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Check if already traveling
        const now = Math.floor(Date.now() / 1000);
        if (user.traveling && user.travel_arrives_at > now) {
            return res.status(400).json({
                success: false,
                message: 'You are already traveling'
            });
        }

        // Start travel (5 minutes)
        const travelTime = 300; // 5 minutes in seconds
        const arrivesAt = now + travelTime;

        db.prepare(`
            UPDATE users
            SET traveling = 1,
                travel_destination = ?,
                travel_arrives_at = ?,
                current_server = COALESCE(current_server, ?)
            WHERE discord_id = ?
        `).run(destination, arrivesAt, user.current_server || destination, userId);

        res.json({
            success: true,
            data: {
                destination,
                arrivesAt,
                travelTime
            },
            message: 'Travel started successfully'
        });
    } catch (error) {
        console.error('Error starting travel:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start travel'
        });
    }
});

// ============================================================================
// Achievement Routes
// ============================================================================

// Get achievement statistics (requires authentication + whitelist) - MUST come before /achievements
router.get('/achievements/stats', requireAuth, AchievementController.getAchievementStats);

// Get recently unlocked achievements (requires authentication + whitelist) - MUST come before /achievements
router.get('/achievements/recent', requireAuth, AchievementController.getRecentlyUnlocked);

// Get achievements by category (requires authentication + whitelist) - MUST come before /achievements
router.get('/achievements/category/:category', requireAuth, AchievementController.getAchievementsByCategory);

// Get all achievements for authenticated user (requires authentication + whitelist)
router.get('/achievements', requireAuth, AchievementController.getUserAchievements);

// ============================================================================
// Guild Routes
// ============================================================================

// Get user's guild (requires authentication + whitelist)
router.get('/guilds/me', requireAuth, GuildController.getMyGuild);

// Get pending invites (requires authentication + whitelist)
router.get('/guilds/invites', requireAuth, GuildController.getInvites);

// Get all guilds for a server (public)
router.get('/guilds', optionalAuth, GuildController.getGuilds);

// Get guild details (public)
router.get('/guilds/:guildId', optionalAuth, GuildController.getGuild);

// Create guild (requires authentication + whitelist)
router.post('/guilds', requireAuth, GuildController.createGuild);

// Invite user to guild (requires authentication + whitelist)
router.post('/guilds/:guildId/invite', requireAuth, GuildController.inviteUser);

// Join guild via invite (requires authentication + whitelist)
router.post('/guilds/join', requireAuth, GuildController.joinGuild);

// Join public guild (requires authentication + whitelist)
router.post('/guilds/:guildId/join-public', requireAuth, GuildController.joinPublicGuild);

// Leave guild (requires authentication + whitelist)
router.post('/guilds/leave', requireAuth, GuildController.leaveGuild);

// Contribute to guild (requires authentication + whitelist)
router.post('/guilds/contribute', requireAuth, GuildController.contribute);

// Upgrade guild member slots (requires authentication + whitelist)
router.post('/guilds/upgrade/slots', requireAuth, GuildController.upgradeSlots);

// Upgrade guild level (requires authentication + whitelist)
router.post('/guilds/upgrade/level', requireAuth, GuildController.upgradeLevel);

// Get guild leaderboards (public)
router.get('/guilds/leaderboard', optionalAuth, GuildController.getLeaderboard);

// Get guild rank (public)
router.get('/guilds/:guildId/rank', optionalAuth, GuildController.getGuildRank);

// ============================================================================
// Health Check
// ============================================================================

router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'QuestCord API',
        version: 'v1',
        timestamp: Date.now()
    });
});

module.exports = router;
