const express = require('express');
const router = express.Router();
const { GlobalStatsModel, LeaderboardModel, ActivityLogModel, StaffModel } = require('../../database/models');

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5000; // 5 seconds cache

function getCached(key, fetchFn) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    const data = fetchFn();
    cache.set(key, { data, timestamp: Date.now() });
    return data;
}

router.get('/stats', (req, res) => {
    try {
        const data = getCached('stats', () => {
            const stats = GlobalStatsModel.get();
            const totalCurrency = GlobalStatsModel.getTotalCurrencyInCirculation();
            const totalGems = GlobalStatsModel.getTotalGemsInCirculation();

            return {
                totalServers: stats.total_servers,
                totalUsers: stats.total_users,
                totalQuestsCompleted: stats.total_quests_completed,
                totalCurrency: totalCurrency,
                totalGems: totalGems
            };
        });

        res.json(data);
    } catch (error) {
        console.error('Error fetching stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/leaderboard', (req, res) => {
    try {
        const data = getCached('leaderboard', () => {
            const now = new Date();
            const month = now.getMonth() + 1;
            const year = now.getFullYear();

            const topPlayers = LeaderboardModel.getTopPlayers(month, year, 10);

            return {
                month: now.toLocaleString('default', { month: 'long' }),
                year: year,
                players: topPlayers
            };
        });

        res.json(data);
    } catch (error) {
        console.error('Error fetching leaderboard:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/activity', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const cacheKey = `activity_${limit}`;

        const data = getCached(cacheKey, () => {
            return ActivityLogModel.getRecent(limit);
        });

        res.json(data);
    } catch (error) {
        console.error('Error fetching activity:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.get('/staff', (req, res) => {
    try {
        const staff = StaffModel.getAll();
        res.json(staff);
    } catch (error) {
        console.error('Error fetching staff:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// IP ban appeal submission — always accessible
const fs = require('fs');
const path = require('path');
const _CP_QUEUE_FILE = path.normalize(
    path.join(__dirname, '..', '..', '..', '..', '..', 'cub-protector', 'data', 'bot_actions_queue.json')
);
const _APPEALS_CHANNEL_ID = '1473606792264155136';

router.post('/ip-ban-appeal', (req, res) => {
    try {
        const { ip, name, contact, reason, appeal } = req.body || {};
        if (!reason || !appeal) return res.status(400).json({ ok: false, error: 'Missing required fields.' });

        const submitterIp = req.clientIP || req.socket?.remoteAddress || '';
        const embed = {
            title: '📋 IP Ban Appeal (QuestCord)',
            description: 'A user has submitted an appeal for an automated IP ban.',
            color: 0x5865F2,
            fields: [
                { name: '🌐 Banned IP',    value: `\`${(ip || 'Not provided').substring(0, 64)}\``, inline: true },
                { name: '📡 Submitter IP', value: `\`${submitterIp}\``,                             inline: true },
                { name: '👤 Name',         value: (name || '*Not provided*').substring(0, 100),      inline: true },
                { name: '📬 Contact',      value: (contact || '*Not provided*').substring(0, 200),   inline: false },
                { name: '❓ Why Banned',   value: reason.substring(0, 1000),                         inline: false },
                { name: '📝 Appeal',       value: appeal.substring(0, 1500),                         inline: false },
            ],
            footer: { text: 'QuestCord • IP Ban Appeal' },
            timestamp: new Date().toISOString(),
        };

        let queue = { actions: [] };
        try { queue = JSON.parse(fs.readFileSync(_CP_QUEUE_FILE, 'utf8')); } catch {}
        if (!Array.isArray(queue.actions)) queue.actions = [];
        queue.actions.push({ type: 'send_embed', channel_id: _APPEALS_CHANNEL_ID, embed });
        fs.writeFileSync(_CP_QUEUE_FILE, JSON.stringify(queue, null, 2));

        console.log(`[Security] IP ban appeal submitted for ${ip} by ${submitterIp}`);
        res.json({ ok: true });
    } catch (e) {
        console.error('[Security] Appeal submission error:', e.message);
        res.status(500).json({ ok: false, error: 'Failed to submit appeal.' });
    }
});

module.exports = router;
