const express = require('express');
const router = express.Router();
const { BannedIPModel } = require('../../database/models');
const { checkStaffRole } = require('../middleware/auth');

router.get('/bans', checkStaffRole, (req, res) => {
    try {
        const bans = BannedIPModel.getAll();
        res.json(bans);
    } catch (error) {
        console.error('Error fetching bans:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/ban', checkStaffRole, (req, res) => {
    try {
        const { ip, reason, permanent, hours } = req.body;

        if (!ip || !reason) {
            return res.status(400).json({ error: 'IP and reason are required' });
        }

        let expiresAt = null;
        if (!permanent && hours) {
            expiresAt = Math.floor(Date.now() / 1000) + (hours * 3600);
        }

        BannedIPModel.ban(
            ip,
            reason,
            req.staff.username,
            req.staff.discord_id,
            permanent,
            expiresAt
        );

        res.json({ success: true, message: 'IP banned successfully' });
    } catch (error) {
        console.error('Error banning IP:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.delete('/ban/:ip', checkStaffRole, (req, res) => {
    try {
        const result = BannedIPModel.unban(req.params.ip);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'IP not found in ban list' });
        }

        res.json({ success: true, message: 'IP unbanned successfully' });
    } catch (error) {
        console.error('Error unbanning IP:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
