const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const jwt = require('jsonwebtoken');
const { UserModel } = require('../../database/models');

/**
 * Discord OAuth 2.0 Configuration
 *
 * Handles Discord authentication for the web interface
 */

// Configure Discord OAuth strategy
function initializeDiscordOAuth() {
    // Determine callback URL
    // Priority: DISCORD_CALLBACK_URL env var > production URL > localhost
    let callbackURL;
    if (process.env.DISCORD_CALLBACK_URL) {
        callbackURL = process.env.DISCORD_CALLBACK_URL;
    } else if (process.env.NODE_ENV === 'production') {
        callbackURL = 'https://questcord.fun/auth/discord/callback';
    } else {
        callbackURL = 'http://localhost:3000/auth/discord/callback';
    }

    console.log(`[OAuth] Using callback URL: ${callbackURL}`);

    passport.use(new DiscordStrategy({
        clientID: process.env.DISCORD_CLIENT_ID,
        clientSecret: process.env.DISCORD_CLIENT_SECRET,
        callbackURL: callbackURL,
        scope: ['identify', 'guilds']
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Get or create user in database
            let user = UserModel.findByDiscordId(profile.id);

            if (!user) {
                UserModel.create(profile.id, profile.username);
                user = UserModel.findByDiscordId(profile.id);
            }

            // Update avatar hash if it changed
            if (profile.avatar && profile.avatar !== user.avatar_hash) {
                UserModel.updateProfile(profile.id, {
                    avatar_hash: profile.avatar
                });
                // Refresh user data
                user = UserModel.findByDiscordId(profile.id);
            }

            // Attach Discord profile data
            const userData = {
                ...user,
                discordProfile: {
                    id: profile.id,
                    username: profile.username,
                    discriminator: profile.discriminator,
                    avatar: profile.avatar,
                    guilds: profile.guilds || []
                },
                accessToken
            };

            return done(null, userData);
        } catch (error) {
            console.error('Error in Discord OAuth callback:', error);
            return done(error, null);
        }
    }));

    // Serialize user for session
    passport.serializeUser((user, done) => {
        done(null, user.discord_id);
    });

    // Deserialize user from session
    passport.deserializeUser(async (discordId, done) => {
        try {
            const user = UserModel.findByDiscordId(discordId);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });

    console.log('[OAuth] Discord OAuth 2.0 initialized');
}

/**
 * Generate JWT token for API authentication
 * @param {Object} user - User data
 * @returns {string} JWT token
 */
function generateJWT(user) {
    const payload = {
        userId: user.id,
        discordId: user.discord_id,
        username: user.username
    };

    return jwt.sign(payload, process.env.SESSION_SECRET || 'default-secret', {
        expiresIn: '7d' // Token expires in 7 days
    });
}

/**
 * Verify JWT token
 * @param {string} token - JWT token
 * @returns {Object|null} Decoded token or null if invalid
 */
function verifyJWT(token) {
    try {
        return jwt.verify(token, process.env.SESSION_SECRET || 'default-secret');
    } catch (error) {
        console.error('JWT verification failed:', error.message);
        return null;
    }
}

/**
 * Middleware to check if user is authenticated
 */
function isAuthenticated(req, res, next) {
    // Check session authentication
    if (req.isAuthenticated()) {
        return next();
    }

    // Check JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = verifyJWT(token);

        if (decoded) {
            // Attach user to request
            const user = UserModel.findByDiscordId(decoded.discordId);
            if (user) {
                req.user = user;
                return next();
            }
        }
    }

    return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: 'Please log in to access this resource'
    });
}

/**
 * Middleware to attach user data to request (optional authentication)
 * Doesn't block request if user is not authenticated
 */
function optionalAuth(req, res, next) {
    // Check session authentication
    if (req.isAuthenticated()) {
        return next();
    }

    // Check JWT token in Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const decoded = verifyJWT(token);

        if (decoded) {
            const user = UserModel.findByDiscordId(decoded.discordId);
            if (user) {
                req.user = user;
            }
        }
    }

    // Continue even if not authenticated
    next();
}

/**
 * Middleware to check if user is whitelisted during testing mode
 * Should be used after isAuthenticated middleware
 */
function isWhitelisted(req, res, next) {
    // Read config file directly to avoid Node.js module caching
    // This allows whitelist changes to take effect without restart
    const fs = require('fs');
    const path = require('path');
    const configPath = path.join(__dirname, '../../../config.json');

    let config;
    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        config = JSON.parse(configData);
    } catch (error) {
        console.error('Error reading config file:', error);
        return res.status(500).json({
            success: false,
            error: 'Server Error',
            message: 'Failed to load configuration'
        });
    }

    // If testing mode is disabled, allow all authenticated users
    if (!config.webDashboard || !config.webDashboard.testingMode) {
        return next();
    }

    // Check if user's Discord ID is in the whitelist
    const whitelist = config.webDashboard.whitelist || [];
    const userDiscordId = req.user?.discord_id;

    if (!userDiscordId) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'User not authenticated'
        });
    }

    if (!whitelist.includes(userDiscordId)) {
        return res.status(403).json({
            success: false,
            error: 'Access Denied',
            message: 'Web dashboard is currently in testing mode. Your account is not whitelisted for access.'
        });
    }

    // User is whitelisted, proceed
    next();
}

module.exports = {
    initializeDiscordOAuth,
    generateJWT,
    verifyJWT,
    isAuthenticated,
    optionalAuth,
    isWhitelisted,
    passport
};
