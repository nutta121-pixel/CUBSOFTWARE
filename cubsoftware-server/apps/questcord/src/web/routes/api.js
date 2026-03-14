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

module.exports = router;
