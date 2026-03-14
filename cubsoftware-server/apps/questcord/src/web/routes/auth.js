const express = require('express');
const router = express.Router();
const { passport, generateJWT, isAuthenticated } = require('../auth/discordOAuth');

/**
 * Authentication Routes
 *
 * Handles Discord OAuth 2.0 authentication flow
 */

// Initiate OAuth login
router.get('/discord/login', passport.authenticate('discord'));

// OAuth callback
router.get('/discord/callback',
    passport.authenticate('discord', {
        failureRedirect: '/login?error=auth_failed'
    }),
    (req, res) => {
        // Generate JWT token
        const token = generateJWT(req.user);

        // Store token in session
        req.session.jwtToken = token;

        console.log(`[Auth] User logged in: ${req.user.username} (${req.user.discord_id})`);

        // Determine base URL for redirect
        // Priority: DISCORD_BASE_URL env var > production URL > localhost
        let baseUrl;
        if (process.env.DISCORD_BASE_URL) {
            baseUrl = process.env.DISCORD_BASE_URL;
        } else if (process.env.NODE_ENV === 'production') {
            baseUrl = 'https://questcord.fun';
        } else {
            baseUrl = 'http://localhost:3000';
        }

        const redirectPath = req.session.returnTo || '/dashboard';
        delete req.session.returnTo;

        // Redirect to dashboard with token
        res.redirect(`${baseUrl}${redirectPath}?token=${token}`);
    }
);

// Get current authenticated user
router.get('/me', isAuthenticated, (req, res) => {
    res.json({
        success: true,
        user: {
            id: req.user.id,
            discordId: req.user.discord_id,
            username: req.user.username,
            level: req.user.level,
            experience: req.user.experience,
            currency: req.user.currency,
            gems: req.user.gems,
            questsCompleted: req.user.quests_completed,
            bossesDefeated: req.user.bosses_defeated
        },
        token: req.session.jwtToken
    });
});

// Logout
router.get('/logout', (req, res) => {
    const username = req.user ? req.user.username : 'Unknown';

    req.logout((err) => {
        if (err) {
            console.error('Error during logout:', err);
            return res.status(500).json({
                success: false,
                error: 'Logout failed'
            });
        }

        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }

            console.log(`[Auth] User logged out: ${username}`);

            res.redirect('/');
        });
    });
});

// Check authentication status
router.get('/status', (req, res) => {
    res.json({
        authenticated: req.isAuthenticated(),
        user: req.isAuthenticated() ? {
            id: req.user.id,
            discordId: req.user.discord_id,
            username: req.user.username
        } : null
    });
});

module.exports = router;
