const EventEmitter = require('events');

/**
 * EventBus - Cross-platform event synchronization system
 *
 * Broadcasts game events to both Discord and Web platforms in real-time.
 * All game actions should emit events through this bus to ensure synchronization.
 *
 * @extends EventEmitter
 */
class EventBus extends EventEmitter {
    constructor() {
        super();
        this.websocketBroadcaster = null;
        this.discordClient = null;
    }

    /**
     * Register the WebSocket broadcaster
     * @param {Function} broadcaster - Function to broadcast to all connected WebSocket clients
     */
    registerWebSocketBroadcaster(broadcaster) {
        this.websocketBroadcaster = broadcaster;
    }

    /**
     * Register the Discord client
     * @param {Client} client - Discord.js client instance
     */
    registerDiscordClient(client) {
        this.discordClient = client;
    }

    /**
     * Emit a game event to all platforms
     * @param {string} eventType - Event type (e.g., 'quest:completed', 'boss:spawned')
     * @param {Object} data - Event data
     */
    emitGameEvent(eventType, data) {
        // Emit to Node.js event listeners
        this.emit(eventType, data);

        // Broadcast to WebSocket clients
        if (this.websocketBroadcaster) {
            this.websocketBroadcaster({
                type: eventType,
                data: data,
                timestamp: Date.now()
            });
        }

        // Log event for debugging
        console.log(`[EventBus] ${eventType}`, data);
    }

    /**
     * Emit a user-specific event
     * @param {string} userId - Discord user ID
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    emitUserEvent(userId, eventType, data) {
        this.emitGameEvent(eventType, {
            userId,
            ...data
        });
    }

    /**
     * Emit a server-specific event
     * @param {string} serverId - Discord server ID
     * @param {string} eventType - Event type
     * @param {Object} data - Event data
     */
    emitServerEvent(serverId, eventType, data) {
        this.emitGameEvent(eventType, {
            serverId,
            ...data
        });
    }
}

// Export singleton instance
module.exports = new EventBus();
