const express = require('express');
const router = express.Router();
const { GlobalStatsModel, LeaderboardModel, StaffModel, WebsiteSettingsModel } = require('../../database/models');
const config = require('../../../config.json');
const insults = require('../../../config/insults.json');
const { debugLogger } = require('../../utils/debugLogger');
const { formatNumber } = require('../../utils/formatNumber');

// Maintenance mode middleware
function checkMaintenanceMode(req, res, next) {
    // Skip maintenance check for health endpoint
    if (req.path === '/health') {
        return next();
    }

    const websiteSettings = WebsiteSettingsModel.get();
    if (websiteSettings && websiteSettings.maintenance_mode === 1) {
        return res.render('maintenance');
    }
    next();
}

// Simple in-memory rate limiter for insults
const insultRateLimits = new Map();
const RATE_LIMIT_WINDOW = 2000; // 2 seconds
const MAX_REQUESTS = 1; // 1 request per window

// Helper function to format large numbers with abbreviations
function formatLargeNumber(num) {
    if (num >= 1e15) { // Quadrillion
        return (num / 1e15).toFixed(1).replace(/\.0$/, '') + 'Q';
    }
    if (num >= 1e12) { // Trillion
        return (num / 1e12).toFixed(1).replace(/\.0$/, '') + 'T';
    }
    if (num >= 1e9) { // Billion
        return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    }
    if (num >= 1e6) { // Million
        return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    }
    if (num >= 1e3) { // Thousand
        return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return num.toLocaleString();
}

// Health check endpoint
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        timestamp: Date.now(),
        service: 'QuestCord Web Server'
    });
});

// Random insult endpoint with rate limiting
router.get('/api/insult', (req, res) => {
    try {
        // Rate limiting by IP
        const clientIp = req.ip || req.connection.remoteAddress;
        const now = Date.now();
        const rateLimitData = insultRateLimits.get(clientIp);

        if (rateLimitData) {
            const timeSinceLastRequest = now - rateLimitData.lastRequest;

            if (timeSinceLastRequest < RATE_LIMIT_WINDOW) {
                // Too many requests
                const waitTime = Math.ceil((RATE_LIMIT_WINDOW - timeSinceLastRequest) / 1000);
                return res.status(429).json({
                    insult: `Slow down! Wait ${waitTime} seconds before requesting another insult.`
                });
            }
        }

        // Update rate limit data
        insultRateLimits.set(clientIp, {
            lastRequest: now,
            count: 1
        });

        // Clean up old rate limit entries (older than 5 minutes)
        const fiveMinutesAgo = now - 300000;
        for (const [ip, data] of insultRateLimits.entries()) {
            if (data.lastRequest < fiveMinutesAgo) {
                insultRateLimits.delete(ip);
            }
        }

        // Check if insults array exists and has items
        if (!insults.insults || insults.insults.length === 0) {
            return res.json({ insult: 'No insults configured yet. Add some to config/insults.json!' });
        }

        const randomInsult = insults.insults[Math.floor(Math.random() * insults.insults.length)];

        // Check if we got a valid insult
        if (!randomInsult || randomInsult.trim() === '') {
            return res.json({ insult: 'Error: Empty insult in config!' });
        }

        res.json({ insult: randomInsult });
    } catch (error) {
        console.error('Error fetching insult:', error);
        res.json({ insult: 'Error loading insult. Check server logs.' });
    }
});

// Make People Cry prank page
router.get('/makepeoplecry', checkMaintenanceMode, (req, res) => {
    res.render('makepeoplecry');
});

// Terms of Service page
router.get('/terms', checkMaintenanceMode, (req, res) => {
    res.render('terms');
});

// Privacy Policy page
router.get('/privacy', checkMaintenanceMode, (req, res) => {
    res.render('privacy');
});

router.get('/', checkMaintenanceMode, async (req, res) => {
    try {
        const stats = GlobalStatsModel.get();
        const totalCurrency = GlobalStatsModel.getTotalCurrencyInCirculation();
        const totalGems = GlobalStatsModel.getTotalGemsInCirculation();

        // Add currency and gems to stats object with formatted values
        const enhancedStats = {
            ...stats,
            total_currency: totalCurrency,
            total_gems: totalGems,
            total_currency_formatted: formatLargeNumber(totalCurrency),
            total_gems_formatted: formatLargeNumber(totalGems)
        };

        const now = new Date();
        const topPlayers = LeaderboardModel.getTopPlayers(now.getMonth() + 1, now.getFullYear(), 10);
        const staff = StaffModel.getAll();

        // Fetch peasants
        const peasantIds = ['245784383506743296', '576244740199284779'];
        const peasants = [];
        const { getDiscordClient } = require('../server');
        const client = getDiscordClient();

        if (client) {
            for (const userId of peasantIds) {
                try {
                    const user = await client.users.fetch(userId);
                    if (user) {
                        peasants.push({
                            discord_id: userId,
                            username: user.globalName || user.username,
                            avatar_url: user.displayAvatarURL({ size: 128, extension: 'png' }),
                            role: 'Peasant'
                        });
                    }
                } catch (error) {
                    console.error(`Error fetching peasant user ${userId}:`, error);
                }
            }
        }

        // Get website settings from database with fallback to all enabled by default
        const websiteSettings = WebsiteSettingsModel.get();
        const websiteEffects = {
            effects: {
                backgroundAnimations: websiteSettings ? websiteSettings.background_animations === 1 : true,
                cardHoverEffects: websiteSettings ? websiteSettings.card_hover_effects === 1 : true,
                cosmicParticles: websiteSettings ? websiteSettings.cosmic_particles === 1 : true,
                auroraEffect: websiteSettings ? websiteSettings.aurora_effect === 1 : true,
                gradientAnimations: websiteSettings ? websiteSettings.gradient_animations === 1 : true
            },
            interactiveFeatures: {
                partyMode: websiteSettings ? websiteSettings.party_mode === 1 : true,
                insultDisplay: websiteSettings ? websiteSettings.insult_display === 1 : true,
                chaosMode: websiteSettings ? websiteSettings.chaos_mode === 1 : true
            },
            performanceMode: websiteSettings ? websiteSettings.performance_mode === 1 : false
        };

        // Debug log website effects
        debugLogger.info('WEBSITE', 'Website effects configuration', {
            websiteSettings: websiteSettings || 'null (using defaults)',
            websiteEffects
        });

        res.render('index', {
            stats: enhancedStats,
            topPlayers,
            staff,
            peasants,
            config,
            websiteEffects
        });
    } catch (error) {
        console.error('Error rendering index:', error);
        res.status(500).send('Internal server error');
    }
});

// Serve Vue app for dashboard routes
const path = require('path');
const fs = require('fs');
const { UserModel } = require('../../database/models');

// Special handler for profile pages to inject Open Graph meta tags
router.get('/profile/:userId', (req, res) => {
    const appPath = path.join(__dirname, '../../../public/app/index.html');

    // Check if the built app exists
    if (!fs.existsSync(appPath)) {
        return res.status(404).send('Dashboard app not found. Please run: cd src/web/client && npm run build');
    }

    try {
        // Try to get user data
        let user = null;
        const userId = req.params.userId;

        // Check if userId is a vanity URL first (case-insensitive)
        const { db } = require('../../database/schema');
        user = db.prepare('SELECT * FROM users WHERE LOWER(vanity_url) = LOWER(?)').get(userId);

        // If not found, try as Discord ID
        if (!user) {
            user = UserModel.findByDiscordId(userId);
        }

        // Read the HTML file
        let html = fs.readFileSync(appPath, 'utf8');

        if (user) {
            // Generate avatar URL
            let avatarUrl = 'https://questcord.fun/images/logo.png';
            if (user.avatar_hash) {
                avatarUrl = `https://cdn.discordapp.com/avatars/${user.discord_id}/${user.avatar_hash}.png?size=256`;
            }

            // Create meta tags
            const verifiedBadge = user.verified ? '✅ ' : '';
            const verifiedText = user.verified ? ' • Verified User ✨' : '';
            const title = `${verifiedBadge}${user.username}'s Profile - QuestCord`;
            const description = `Level ${user.level}${verifiedText} | ${formatNumber(user.currency)} Dakari | ${formatNumber(user.quests_completed || 0)} Quests Completed | ${formatNumber(user.bosses_defeated || 0)} Bosses Defeated`;
            const url = `https://questcord.fun/profile/${userId}`;

            const metaTags = `
    <meta property="og:type" content="profile">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${avatarUrl}">
    <meta property="og:site_name" content="QuestCord">
    <meta property="profile:username" content="${user.username}">

    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${avatarUrl}">

    <meta name="theme-color" content="#5865F2">
    <title>${title}</title>`;

            // Inject meta tags into the HTML (before </head>)
            html = html.replace('</head>', `${metaTags}\n  </head>`);
        }

        res.send(html);
    } catch (error) {
        console.error('Error serving profile page:', error);
        res.sendFile(appPath);
    }
});

// Helper function to inject meta tags into HTML
function injectMetaTags(html, title, description, url, image = 'https://questcord.fun/images/logo.png') {
    const metaTags = `
    <meta property="og:type" content="website">
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${description}">
    <meta property="og:url" content="${url}">
    <meta property="og:image" content="${image}">
    <meta property="og:site_name" content="QuestCord">

    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${description}">
    <meta name="twitter:image" content="${image}">

    <meta name="theme-color" content="#5865F2">
    <title>${title}</title>`;

    return html.replace('</head>', `${metaTags}\n  </head>`);
}

// Dashboard page
router.get('/dashboard', (req, res) => {
    const appPath = path.join(__dirname, '../../../public/app/index.html');
    if (!fs.existsSync(appPath)) {
        return res.status(404).send('Dashboard app not found. Please run: cd src/web/client && npm run build');
    }

    try {
        const stats = GlobalStatsModel.get();
        let html = fs.readFileSync(appPath, 'utf8');

        const title = 'Dashboard - QuestCord';
        const description = `Your QuestCord RPG Dashboard | ${formatNumber(stats.total_servers)} Servers | ${formatNumber(stats.total_users)} Players | ${formatNumber(stats.total_quests_completed)} Quests Completed`;
        const url = 'https://questcord.fun/dashboard';

        html = injectMetaTags(html, title, description, url);
        res.send(html);
    } catch (error) {
        console.error('Error serving dashboard:', error);
        res.sendFile(appPath);
    }
});

// Quests page
router.get('/quests', (req, res) => {
    const appPath = path.join(__dirname, '../../../public/app/index.html');
    if (!fs.existsSync(appPath)) {
        return res.status(404).send('Dashboard app not found. Please run: cd src/web/client && npm run build');
    }

    try {
        let html = fs.readFileSync(appPath, 'utf8');

        const title = 'Available Quests - QuestCord';
        const description = 'Explore available quests in QuestCord! Complete daily, weekly, and special quests to earn rewards, level up, and climb the leaderboard.';
        const url = 'https://questcord.fun/quests';

        html = injectMetaTags(html, title, description, url);
        res.send(html);
    } catch (error) {
        console.error('Error serving quests page:', error);
        res.sendFile(appPath);
    }
});

// Bosses page
router.get('/bosses', (req, res) => {
    const appPath = path.join(__dirname, '../../../public/app/index.html');
    if (!fs.existsSync(appPath)) {
        return res.status(404).send('Dashboard app not found. Please run: cd src/web/client && npm run build');
    }

    try {
        let html = fs.readFileSync(appPath, 'utf8');

        const title = 'Boss Battles - QuestCord';
        const description = 'Challenge powerful bosses in QuestCord! Team up with other players to defeat epic bosses and earn legendary rewards.';
        const url = 'https://questcord.fun/bosses';

        html = injectMetaTags(html, title, description, url);
        res.send(html);
    } catch (error) {
        console.error('Error serving bosses page:', error);
        res.sendFile(appPath);
    }
});

// Daily rewards page
router.get('/daily', (req, res) => {
    const appPath = path.join(__dirname, '../../../public/app/index.html');
    if (!fs.existsSync(appPath)) {
        return res.status(404).send('Dashboard app not found. Please run: cd src/web/client && npm run build');
    }

    try {
        let html = fs.readFileSync(appPath, 'utf8');

        const title = 'Daily Login Rewards - QuestCord';
        const description = 'Claim your daily login rewards in QuestCord! Build your streak for bigger rewards including currency, items, and exclusive bonuses.';
        const url = 'https://questcord.fun/daily';

        html = injectMetaTags(html, title, description, url);
        res.send(html);
    } catch (error) {
        console.error('Error serving daily page:', error);
        res.sendFile(appPath);
    }
});

// Home/Profile/Login fallback
router.get(['/profile', '/login', '/'], (req, res) => {
    const appPath = path.join(__dirname, '../../../public/app/index.html');
    if (!fs.existsSync(appPath)) {
        return res.status(404).send('Dashboard app not found. Please run: cd src/web/client && npm run build');
    }

    try {
        const stats = GlobalStatsModel.get();
        let html = fs.readFileSync(appPath, 'utf8');

        const title = 'QuestCord - Quest Across the Discord Universe';
        const description = `An immersive Discord RPG experience | ${formatNumber(stats.total_servers)} Servers | ${formatNumber(stats.total_users)} Players | Complete quests, defeat bosses, and climb the leaderboard!`;
        const url = 'https://questcord.fun';

        html = injectMetaTags(html, title, description, url);
        res.send(html);
    } catch (error) {
        console.error('Error serving page:', error);
        res.sendFile(appPath);
    }
});

module.exports = router;

