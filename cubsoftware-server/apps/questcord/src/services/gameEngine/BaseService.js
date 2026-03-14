const EventBus = require('../EventBus');

/**
 * BaseService - Foundation for all game services
 *
 * Provides common functionality for all service classes including:
 * - Database access patterns
 * - Event emission
 * - Error handling
 * - Validation utilities
 *
 * All game services should extend this class.
 */
class BaseService {
    /**
     * Emit a game event through the EventBus
     * @param {string} eventType - Event type (e.g., 'quest:completed')
     * @param {Object} data - Event data
     */
    static emitEvent(eventType, data) {
        EventBus.emitGameEvent(eventType, data);
    }

    /**
     * Emit a user-specific event
     * @param {string} userId - Discord user ID
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    static emitUserEvent(userId, eventType, data) {
        EventBus.emitUserEvent(userId, eventType, data);
    }

    /**
     * Emit a server-specific event
     * @param {string} serverId - Discord server ID
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    static emitServerEvent(serverId, eventType, data) {
        EventBus.emitServerEvent(serverId, eventType, data);
    }

    /**
     * Validate required parameters
     * @param {Object} params - Parameters to validate
     * @param {Array<string>} required - Required parameter names
     * @throws {ValidationError} If required parameters are missing
     */
    static validateRequired(params, required) {
        const missing = required.filter(key => params[key] === undefined || params[key] === null);
        if (missing.length > 0) {
            throw new ValidationError(`Missing required parameters: ${missing.join(', ')}`);
        }
    }

    /**
     * Validate user exists
     * @param {string} userId - Discord user ID
     * @param {Object} UserModel - User model instance
     * @returns {Object} User data
     * @throws {NotFoundError} If user doesn't exist
     */
    static validateUserExists(userId, UserModel) {
        const user = UserModel.findByDiscordId(userId);
        if (!user) {
            throw new NotFoundError(`User ${userId} not found`);
        }
        return user;
    }

    /**
     * Handle errors and format for response
     * @param {Error} error - Error object
     * @param {string} context - Context where error occurred
     * @returns {Object} Formatted error response
     */
    static handleError(error, context) {
        console.error(`[${this.name}] Error in ${context}:`, error);

        if (error instanceof ValidationError) {
            return {
                success: false,
                error: error.message,
                type: 'validation'
            };
        }

        if (error instanceof NotFoundError) {
            return {
                success: false,
                error: error.message,
                type: 'not_found'
            };
        }

        // Generic error
        return {
            success: false,
            error: 'An unexpected error occurred',
            type: 'internal',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        };
    }

    /**
     * Create a success response
     * @param {Object} data - Response data
     * @param {string} message - Success message
     * @returns {Object} Success response
     */
    static success(data, message = 'Operation successful') {
        return {
            success: true,
            message,
            data
        };
    }

    /**
     * Log service action
     * @param {string} action - Action name
     * @param {Object} details - Action details
     */
    static log(action, details = {}) {
        console.log(`[${this.name}] ${action}`, details);
    }
}

/**
 * Custom error for validation failures
 */
class ValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ValidationError';
    }
}

/**
 * Custom error for not found resources
 */
class NotFoundError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NotFoundError';
    }
}

module.exports = {
    BaseService,
    ValidationError,
    NotFoundError
};
