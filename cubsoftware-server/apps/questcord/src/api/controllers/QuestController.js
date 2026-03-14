const QuestService = require('../../services/gameEngine/QuestService');
const { generateChallenge, checkAnswer } = require('../utils/questChallenges');

// Store active challenges in memory (userId_questId -> challenge)
const activeChallenges = new Map();

/**
 * QuestController - Handles HTTP requests for quest-related operations
 *
 * Acts as a bridge between HTTP API and QuestService
 */
class QuestController {
    /**
     * Get active quests for a server
     * GET /api/v1/quests?serverId=xxx
     */
    static async getActiveQuests(req, res) {
        try {
            const { serverId } = req.query;

            if (!serverId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing serverId parameter'
                });
            }

            const result = await QuestService.getActiveQuests(serverId, 'web');

            if (!result.success) {
                const statusCode = result.type === 'not_opted_in' ? 403 : 404;
                return res.status(statusCode).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in getActiveQuests:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Get user's quests for a server
     * GET /api/v1/quests/user?serverId=xxx
     */
    static async getUserQuests(req, res) {
        try {
            const { serverId } = req.query;

            if (!serverId) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing serverId parameter'
                });
            }

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }

            const result = await QuestService.getUserQuests(req.user.discord_id, serverId, 'web');

            // Map completed/failed columns to status field
            if (result.success && result.data.quests) {
                result.data.quests = result.data.quests.map(quest => ({
                    ...quest,
                    status: quest.failed ? 'failed' : quest.completed ? 'completed' : 'active'
                }));
            }

            res.json(result);
        } catch (error) {
            console.error('Error in getUserQuests:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Accept a quest
     * POST /api/v1/quests/:questId/accept
     */
    static async acceptQuest(req, res) {
        try {
            const { questId } = req.params;

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }

            const result = await QuestService.acceptQuest(req.user.discord_id, parseInt(questId), 'web');

            if (!result.success) {
                console.log('Accept quest failed:', result);
                const statusCode = result.type === 'expired' ? 410 :
                                 result.type === 'already_completed' ? 409 : 400;
                return res.status(statusCode).json(result);
            }

            // Generate challenge for the quest
            const quest = result.quest || {};
            const difficulty = quest.difficulty || 'medium';
            const challenge = generateChallenge(difficulty);

            // Store challenge in memory
            const challengeKey = `${req.user.discord_id}_${questId}`;
            activeChallenges.set(challengeKey, {
                challenge,
                questId: parseInt(questId),
                userId: req.user.discord_id,
                createdAt: Date.now()
            });

            // Clean up old challenges (older than 10 minutes)
            const tenMinutesAgo = Date.now() - (10 * 60 * 1000);
            for (const [key, value] of activeChallenges.entries()) {
                if (value.createdAt < tenMinutesAgo) {
                    activeChallenges.delete(key);
                }
            }

            res.json({
                success: true,
                challenge: challenge,
                quest: quest
            });
        } catch (error) {
            console.error('Error in acceptQuest:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Complete a quest
     * POST /api/v1/quests/:questId/complete
     */
    static async completeQuest(req, res) {
        try {
            const { questId } = req.params;
            const { challengeData } = req.body;

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }

            // Verify challenge answer - REQUIRED if challenge exists
            const challengeKey = `${req.user.discord_id}_${questId}`;
            const storedChallenge = activeChallenges.get(challengeKey);

            if (storedChallenge) {
                // Challenge exists - user MUST complete it
                if (!challengeData) {
                    return res.status(400).json({
                        success: false,
                        error: 'Challenge must be completed first'
                    });
                }

                const challenge = storedChallenge.challenge;
                let isCorrect = false;

                // Validate based on challenge type
                if (challenge.type === 'reaction') {
                    // Reaction test just needs to be submitted
                    isCorrect = challengeData.success === true;
                } else if (challenge.type === 'trivia') {
                    // Trivia validation
                    const answer = challengeData.answer?.toLowerCase().trim();
                    isCorrect = answer === challenge.answer ||
                               (challenge.alternatives && challenge.alternatives.includes(answer));
                } else if (challenge.type === 'memory') {
                    // Memory game validation (remove spaces)
                    const answer = challengeData.answer?.replace(/\s/g, '');
                    isCorrect = answer === challenge.answer;
                } else {
                    // Word scramble or math
                    isCorrect = challengeData.answer === challenge.answer;
                }

                if (!isCorrect) {
                    activeChallenges.delete(challengeKey);
                    return res.status(400).json({
                        success: false,
                        error: 'Incorrect answer'
                    });
                }

                // Clear the challenge after successful validation
                activeChallenges.delete(challengeKey);
            }

            const result = await QuestService.completeQuest(req.user.discord_id, parseInt(questId), 'web');

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in completeQuest:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }

    /**
     * Fail a quest
     * POST /api/v1/quests/:questId/fail
     */
    static async failQuest(req, res) {
        try {
            const { questId } = req.params;

            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Not authenticated'
                });
            }

            // Clear challenge from memory
            const challengeKey = `${req.user.discord_id}_${questId}`;
            activeChallenges.delete(challengeKey);

            const result = await QuestService.failQuest(req.user.discord_id, parseInt(questId), 'web');

            if (!result.success) {
                return res.status(400).json(result);
            }

            res.json(result);
        } catch (error) {
            console.error('Error in failQuest:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error'
            });
        }
    }
}

module.exports = QuestController;
