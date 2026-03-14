const { BaseService, ValidationError, NotFoundError } = require('./BaseService');
const { UserModel, InventoryModel } = require('../../database/models');
const { validateVanityUrl, validateBio } = require('../../utils/profanityFilter');

/**
 * UserService - Handles all user-related game logic
 *
 * Provides user management functionality for both Discord and Web platforms:
 * - User registration and profile management
 * - Currency and gems transactions
 * - Experience and leveling
 * - Travel management
 * - Profile customization
 *
 * @extends BaseService
 */
class UserService extends BaseService {
    /**
     * Get or create a user
     * @param {string} discordId - Discord user ID
     * @param {string} username - Discord username
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} User data
     */
    static async getOrCreateUser(discordId, username, source = 'discord') {
        try {
            this.validateRequired({ discordId, username }, ['discordId', 'username']);

            let user = UserModel.findByDiscordId(discordId);

            if (!user) {
                UserModel.create(discordId, username);
                user = UserModel.findByDiscordId(discordId);

                this.emitUserEvent(discordId, 'user:created', {
                    username,
                    source
                });

                this.log('createUser', { discordId, username, source });
            }

            return this.success(user, 'User retrieved');
        } catch (error) {
            return this.handleError(error, 'getOrCreateUser');
        }
    }

    /**
     * Get user profile
     * @param {string} identifier - Discord user ID or vanity URL
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} User profile data
     */
    static async getUserProfile(identifier, source = 'discord') {
        try {
            this.validateRequired({ identifier }, ['identifier']);

            // Try to find by vanity URL first, then by Discord ID
            const user = UserModel.findByIdentifier(identifier);
            if (!user) {
                throw new NotFoundError(`User ${identifier} not found`);
            }

            // Get user inventory count
            const inventory = InventoryModel ? InventoryModel.getUserInventory(user.id) : [];

            // Get user's guild information
            const { GuildModel } = require('../../database/models');
            const userGuild = GuildModel.getUserGuild(user.id);
            let guildInfo = null;
            if (userGuild) {
                const guild = GuildModel.findById(userGuild.id);
                if (guild) {
                    guildInfo = {
                        id: guild.id,
                        name: guild.name,
                        tag: guild.tag,
                        level: guild.level,
                        role: userGuild.role
                    };
                }
            }

            this.log('getUserProfile', { identifier, source });

            return this.success({
                ...user,
                inventoryCount: inventory.length,
                guild: guildInfo
            }, 'User profile retrieved');
        } catch (error) {
            return this.handleError(error, 'getUserProfile');
        }
    }

    /**
     * Update user currency
     * @param {string} discordId - Discord user ID
     * @param {number} amount - Amount to add (can be negative)
     * @param {string} reason - Reason for transaction
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Updated user data
     */
    static async updateCurrency(discordId, amount, reason = 'Transaction', source = 'discord') {
        try {
            this.validateRequired({ discordId, amount }, ['discordId', 'amount']);

            const user = this.validateUserExists(discordId, UserModel);

            // Check if user has enough currency for negative transactions
            if (amount < 0 && user.currency < Math.abs(amount)) {
                return {
                    success: false,
                    error: 'Insufficient currency',
                    type: 'insufficient_funds',
                    required: Math.abs(amount),
                    available: user.currency
                };
            }

            UserModel.updateCurrency(discordId, amount);
            const updatedUser = UserModel.findByDiscordId(discordId);

            this.emitUserEvent(discordId, 'currency:updated', {
                amount,
                newBalance: updatedUser.currency,
                reason,
                source
            });

            this.log('updateCurrency', { discordId, amount, reason, newBalance: updatedUser.currency, source });

            return this.success({
                user: updatedUser,
                transaction: {
                    amount,
                    reason,
                    newBalance: updatedUser.currency
                }
            }, 'Currency updated');
        } catch (error) {
            return this.handleError(error, 'updateCurrency');
        }
    }

    /**
     * Update user gems
     * @param {string} discordId - Discord user ID
     * @param {number} amount - Amount to add (can be negative)
     * @param {string} reason - Reason for transaction
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Updated user data
     */
    static async updateGems(discordId, amount, reason = 'Transaction', source = 'discord') {
        try {
            this.validateRequired({ discordId, amount }, ['discordId', 'amount']);

            const user = this.validateUserExists(discordId, UserModel);

            // Check if user has enough gems for negative transactions
            if (amount < 0 && user.gems < Math.abs(amount)) {
                return {
                    success: false,
                    error: 'Insufficient gems',
                    type: 'insufficient_funds',
                    required: Math.abs(amount),
                    available: user.gems
                };
            }

            UserModel.updateGems(discordId, amount);
            const updatedUser = UserModel.findByDiscordId(discordId);

            this.emitUserEvent(discordId, 'gems:updated', {
                amount,
                newBalance: updatedUser.gems,
                reason,
                source
            });

            this.log('updateGems', { discordId, amount, reason, newBalance: updatedUser.gems, source });

            return this.success({
                user: updatedUser,
                transaction: {
                    amount,
                    reason,
                    newBalance: updatedUser.gems
                }
            }, 'Gems updated');
        } catch (error) {
            return this.handleError(error, 'updateGems');
        }
    }

    /**
     * Add experience to user and handle leveling
     * @param {string} discordId - Discord user ID
     * @param {number} exp - Experience to add
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Updated user data with level info
     */
    static async addExperience(discordId, exp, source = 'discord') {
        try {
            this.validateRequired({ discordId, exp }, ['discordId', 'exp']);

            const user = this.validateUserExists(discordId, UserModel);

            UserModel.addExperience(discordId, exp);
            const updatedUser = UserModel.findByDiscordId(discordId);

            // Check if user leveled up
            const requiredExp = this.calculateRequiredExp(updatedUser.level);
            let leveledUp = false;

            if (updatedUser.experience >= requiredExp) {
                const newLevel = updatedUser.level + 1;
                const overflow = updatedUser.experience - requiredExp;

                UserModel.updateLevel(discordId, newLevel, overflow, updatedUser.total_experience);

                this.emitUserEvent(discordId, 'level:up', {
                    oldLevel: updatedUser.level,
                    newLevel,
                    source
                });

                leveledUp = true;

                this.log('levelUp', { discordId, oldLevel: updatedUser.level, newLevel, source });
            }

            this.emitUserEvent(discordId, 'experience:gained', {
                amount: exp,
                newTotal: updatedUser.total_experience,
                leveledUp,
                source
            });

            const finalUser = UserModel.findByDiscordId(discordId);

            return this.success({
                user: finalUser,
                leveledUp,
                expGained: exp
            }, leveledUp ? 'Leveled up!' : 'Experience gained');
        } catch (error) {
            return this.handleError(error, 'addExperience');
        }
    }

    /**
     * Calculate required experience for next level
     * @param {number} level - Current level
     * @returns {number} Required experience
     */
    static calculateRequiredExp(level) {
        return Math.floor(100 * Math.pow(1.5, level - 1));
    }

    /**
     * Start travel for a user
     * @param {string} discordId - Discord user ID
     * @param {string} destination - Destination location
     * @param {number} duration - Travel duration in seconds
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Travel start result
     */
    static async startTravel(discordId, destination, duration, source = 'discord') {
        try {
            this.validateRequired({ discordId, destination, duration }, ['discordId', 'destination', 'duration']);

            const user = this.validateUserExists(discordId, UserModel);

            if (user.traveling) {
                return {
                    success: false,
                    error: 'User is already traveling',
                    type: 'already_traveling',
                    currentDestination: user.travel_destination,
                    arrivesAt: user.travel_arrives_at
                };
            }

            const arrivalTime = Math.floor(Date.now() / 1000) + duration;
            UserModel.startTravel(discordId, destination, arrivalTime);

            this.emitUserEvent(discordId, 'travel:started', {
                destination,
                arrivalTime,
                duration,
                source
            });

            this.log('startTravel', { discordId, destination, duration, source });

            return this.success({
                destination,
                arrivalTime,
                duration
            }, 'Travel started');
        } catch (error) {
            return this.handleError(error, 'startTravel');
        }
    }

    /**
     * Complete travel for a user
     * @param {string} discordId - Discord user ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Travel completion result
     */
    static async completeTravel(discordId, source = 'discord') {
        try {
            this.validateRequired({ discordId }, ['discordId']);

            const user = this.validateUserExists(discordId, UserModel);

            if (!user.traveling) {
                return {
                    success: false,
                    error: 'User is not traveling',
                    type: 'not_traveling'
                };
            }

            const now = Math.floor(Date.now() / 1000);
            if (user.travel_arrives_at > now) {
                return {
                    success: false,
                    error: 'Travel not yet complete',
                    type: 'travel_in_progress',
                    arrivesAt: user.travel_arrives_at,
                    remainingTime: user.travel_arrives_at - now
                };
            }

            const destination = user.travel_destination;
            UserModel.completeTravel(discordId);

            this.emitUserEvent(discordId, 'travel:completed', {
                destination,
                source
            });

            this.log('completeTravel', { discordId, destination, source });

            return this.success({
                destination,
                message: `You have arrived at ${destination}!`
            }, 'Travel completed');
        } catch (error) {
            return this.handleError(error, 'completeTravel');
        }
    }

    /**
     * Update user profile (bio, banner, vanity_url)
     * @param {string} discordId - Discord user ID
     * @param {Object} updates - Profile updates { bio?, banner?, vanity_url? }
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} Updated user profile
     */
    static async updateProfile(discordId, updates, source = 'discord') {
        try {
            this.validateRequired({ discordId, updates }, ['discordId', 'updates']);

            const user = this.validateUserExists(discordId, UserModel);

            // Validate vanity URL if provided
            if (updates.vanity_url !== undefined) {
                // Allow null/empty to clear vanity URL
                if (updates.vanity_url === null || updates.vanity_url === '') {
                    updates.vanity_url = null;
                } else {
                    // Validate format: 3-30 characters, alphanumeric and underscores/hyphens
                    const vanityRegex = /^[a-zA-Z0-9_-]{3,30}$/;
                    if (!vanityRegex.test(updates.vanity_url)) {
                        return {
                            success: false,
                            error: 'Invalid vanity URL format. Must be 3-30 characters (letters, numbers, underscores, hyphens only)'
                        };
                    }

                    // Check for inappropriate content
                    const profanityCheck = validateVanityUrl(updates.vanity_url);
                    if (!profanityCheck.isValid) {
                        return {
                            success: false,
                            error: 'Vanity URL contains inappropriate content. Please choose a different name.'
                        };
                    }

                    // Check if vanity URL is already taken
                    const existing = UserModel.findByVanityUrl(updates.vanity_url);
                    if (existing && existing.discord_id !== discordId) {
                        return {
                            success: false,
                            error: 'Vanity URL already taken'
                        };
                    }
                }
            }

            // Update the profile fields
            const result = UserModel.updateProfile(discordId, updates);

            if (result.changes === 0) {
                return {
                    success: false,
                    error: 'No valid fields to update'
                };
            }

            // Get the updated user data
            const updatedUser = UserModel.findByDiscordId(discordId);

            this.emitUserEvent(discordId, 'profile:updated', {
                updates,
                source
            });

            this.log('updateProfile', { discordId, updates, source });

            return this.success(updatedUser, 'Profile updated successfully');
        } catch (error) {
            return this.handleError(error, 'updateProfile');
        }
    }

    /**
     * Get user statistics
     * @param {string} discordId - Discord user ID
     * @param {string} source - 'discord' or 'web'
     * @returns {Promise<Object>} User statistics
     */
    static async getUserStats(discordId, source = 'discord') {
        try {
            this.validateRequired({ discordId }, ['discordId']);

            const user = this.validateUserExists(discordId, UserModel);

            const stats = {
                level: user.level,
                experience: user.experience,
                totalExperience: user.total_experience,
                currency: user.currency,
                gems: user.gems,
                questsCompleted: user.quests_completed,
                bossesDefeated: user.bosses_defeated,
                requiredExp: this.calculateRequiredExp(user.level)
            };

            this.log('getUserStats', { discordId, source });

            return this.success(stats, 'User stats retrieved');
        } catch (error) {
            return this.handleError(error, 'getUserStats');
        }
    }
}

module.exports = UserService;
