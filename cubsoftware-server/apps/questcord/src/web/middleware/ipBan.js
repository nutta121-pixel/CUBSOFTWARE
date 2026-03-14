const { BannedIPModel } = require('../../database/models');

function getClientIP(req) {
    const forwarded = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];

    if (forwarded) {
        return forwarded.split(',')[0].trim();
    }

    if (realIP) {
        return realIP;
    }

    return req.socket.remoteAddress || req.connection.remoteAddress;
}

function checkIPBan(req, res, next) {
    const ip = getClientIP(req);

    if (!ip) {
        return next();
    }

    const banInfo = BannedIPModel.isBanned(ip);

    if (banInfo) {
        return res.status(403).render('banned', { banInfo });
    }

    req.clientIP = ip;
    next();
}

function calculateThreatLevel(path) {
    let score = 0;

    const patterns = {
        admin: 3,
        '.env': 5,
        'config': 3,
        'database': 4,
        'wp-admin': 4,
        'phpmyadmin': 5,
        '../': 5,
        '..\\': 5,
        'SELECT': 5,
        'UNION': 5,
        'DROP': 5,
        'exec': 4,
        'script': 3,
        'passwd': 5,
        'shadow': 5,
        '.git': 4,
        'backup': 3,
        'dump': 4
    };

    const lowerPath = path.toLowerCase();

    for (const [pattern, points] of Object.entries(patterns)) {
        if (lowerPath.includes(pattern.toLowerCase())) {
            score += points;
        }
    }

    if (score === 0) return 'none';
    if (score <= 3) return 'low';
    if (score <= 7) return 'medium';
    if (score <= 10) return 'high';
    return 'critical';
}

module.exports = { checkIPBan, getClientIP, calculateThreatLevel };
