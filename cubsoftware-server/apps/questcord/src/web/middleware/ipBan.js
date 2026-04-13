const { BannedIPModel } = require('../../database/models');
const fs = require('fs');
const path = require('path');
const https = require('https');

// ── In-memory scanner probe tracking ─────────────────────────────────────────
const _scannerHits = new Map(); // ip → { count, paths, ua }
const _SCANNER_THRESHOLD = 3;
const _BAN_TTL_DAYS = 30;
const _SECURITY_CHANNEL_ID = '1466190584372003092';

// Path to cub-protector bot queue (same server, shared file)
const _CP_QUEUE_FILE = path.normalize(
    path.join(__dirname, '..', '..', '..', '..', '..', 'cub-protector', 'data', 'bot_actions_queue.json')
);

// ── Scanner detection patterns ────────────────────────────────────────────────
const _SCANNER_PATH_PREFIXES = [
    '/.env', '/.git', '/.ht', '/.ds_store', '/.aws', '/.ssh',
    '/wp-', '/wordpress', '/drupal', '/joomla', '/typo3',
    '/laravel', '/symfony', '/yii', '/cake',
];
const _SCANNER_PATH_CONTAINS = [
    'docker-compose', 'wp-login', 'wp-admin', 'wp-includes', 'wp-content',
    'xmlrpc', 'phpmyadmin', '/pma/', 'adminer', 'web.config',
    '/administrator/', '/admin/login', '/user/login',
    'shell.php', 'webshell', 'phpinfo', '/info.php', '/test.php',
    'setup.php', 'install.php', '.tfvars', '.tfstate',
    'secrets.yml', 'database.yml', 'aws.yml',
];
const _SCANNER_EXTENSIONS = ['.php', '.asp', '.aspx', '.cgi', '.cfm', '.pl', '.jsp', '.jspx'];
const _SCANNER_EXACT = new Set([
    '/config.json', '/app.config.json', '/settings.json', '/appsettings.json',
    '/server.js', '/index.php', '/config.php', '/database.php',
    '/Thumbs.db', '/.htpasswd', '/admin.php', '/login.php',
    '/backup.sql', '/dump.sql', '/database.sql',
    '/id_rsa', '/id_rsa.pub', '/authorized_keys',
    '/composer.json', '/composer.lock', '/package.json',
    '/Makefile', '/Dockerfile', '/Procfile', '/web.config',
]);
const _SCANNER_METHODS = new Set(['PROPFIND', 'MKCOL', 'COPY', 'MOVE', 'LOCK', 'UNLOCK', 'SEARCH', 'TRACE']);

// ── Helpers ───────────────────────────────────────────────────────────────────
function getClientIP(req) {
    return (
        req.headers['cf-connecting-ip'] ||
        req.headers['x-real-ip'] ||
        (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        req.connection?.remoteAddress ||
        ''
    ).trim();
}

function isScannerProbe(req) {
    const pathLower = req.path.toLowerCase();
    return (
        _SCANNER_METHODS.has(req.method) ||
        _SCANNER_PATH_PREFIXES.some(p => pathLower.startsWith(p)) ||
        _SCANNER_PATH_CONTAINS.some(s => pathLower.includes(s)) ||
        _SCANNER_EXTENSIONS.some(ext => pathLower.endsWith(ext)) ||
        _SCANNER_EXACT.has(req.path)
    );
}

function enqueueEmbed(embed) {
    try {
        let queue = { actions: [] };
        try { queue = JSON.parse(fs.readFileSync(_CP_QUEUE_FILE, 'utf8')); } catch {}
        if (!Array.isArray(queue.actions)) queue.actions = [];
        queue.actions.push({ type: 'send_embed', channel_id: _SECURITY_CHANNEL_ID, embed });
        fs.writeFileSync(_CP_QUEUE_FILE, JSON.stringify(queue, null, 2));
    } catch (e) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_WEB_IPBAN_146 — [Security] Failed to enqueue ban embed:', e.message);
    }
}

function geoLookup(ip) {
    return new Promise((resolve) => {
        const req = https.get(
            `https://ip-api.com/json/${ip}?fields=status,country,countryCode,regionName,city,isp,org,as,mobile,proxy,hosting`,
            { timeout: 5000 },
            (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try { resolve(JSON.parse(data)); } catch { resolve({}); }
                });
            }
        );
        req.on('error', () => resolve({}));
        req.on('timeout', () => { req.destroy(); resolve({}); });
    });
}

async function sendBanEmbed(ip, probes, ua, bannedAt, expiresAt) {
    try {
        const geo = await geoLookup(ip);
        const country = geo.country || 'Unknown';
        const countryCode = (geo.countryCode || '').toLowerCase();
        const locationParts = [geo.city, geo.regionName, country].filter(Boolean);
        let location = locationParts.join(', ') || 'Unknown';
        if (countryCode) location += ` :flag_${countryCode}:`;

        const flags = [
            geo.proxy && 'Proxy/VPN',
            geo.hosting && 'Hosting/Cloud',
            geo.mobile && 'Mobile',
        ].filter(Boolean).join(', ') || 'None detected';

        const probesText = probes.slice(0, 20).map(p => `\`${p}\``).join('\n')
            + (probes.length > 20 ? `\n*... and ${probes.length - 20} more*` : '');

        const bannedTs = Math.floor(bannedAt / 1000);
        const expiresTs = Math.floor(expiresAt / 1000);

        const embed = {
            title: '🚫 Scanner IP Auto-Banned (QuestCord)',
            description: `An IP was automatically banned after **${probes.length}** sensitive path probe(s).`,
            color: 0xFF2222,
            fields: [
                { name: '🌐 IP Address',   value: `\`${ip}\``,              inline: true },
                { name: '📍 Location',      value: location,                 inline: true },
                { name: '🏢 ISP',           value: geo.isp || 'Unknown',     inline: true },
                { name: '🏗️ Organisation',  value: geo.org || 'Unknown',     inline: true },
                { name: '🔢 ASN',           value: geo.as || 'Unknown',      inline: true },
                { name: '⚠️ IP Flags',      value: flags,                    inline: true },
                { name: `🕵️ Probed Paths (${probes.length})`, value: probesText || '`/`', inline: false },
                { name: '🖥️ User Agent',    value: `\`${(ua || 'None').substring(0, 120)}\``, inline: false },
                { name: '⏰ Banned At',     value: `<t:${bannedTs}:F>`,      inline: true },
                { name: '📅 Expires',       value: `<t:${expiresTs}:R>`,     inline: true },
                { name: '📋 Duration',      value: `${_BAN_TTL_DAYS} days`,  inline: true },
            ],
            footer: { text: 'QuestCord Security Monitor • questcord.fun' },
            timestamp: new Date().toISOString(),
        };

        enqueueEmbed(embed);
    } catch (e) {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_WEB_IPBAN_146 — [Security] Failed to send ban embed:', e.message);
    }
}

// ── Main middleware ───────────────────────────────────────────────────────────
function checkIPBan(req, res, next) {
    const ip = getClientIP(req);
    req.clientIP = ip;

    // Whitelist: appeal route must always be accessible
    if (req.path === '/ip-ban-appeal') return next();

    // Check existing DB ban first
    const banInfo = BannedIPModel.isBanned(ip);
    if (banInfo) {
        const expiresTs = banInfo.permanent ? null : banInfo.expires_at;
        return res.status(403).render('banned', { banInfo, expiresTs, probes: [] });
    }

    // Scanner probe detection
    if (isScannerProbe(req)) {
        const ua = req.headers['user-agent'] || '';
        if (!_scannerHits.has(ip)) _scannerHits.set(ip, { count: 0, paths: [], ua });
        const hit = _scannerHits.get(ip);
        hit.count++;
        hit.paths.push(req.path);
        const remaining = _SCANNER_THRESHOLD - hit.count;

        console.log(`[Security] Scanner probe #${hit.count} from ${ip}: ${req.path} (${remaining} left before ban)`);

        if (hit.count >= _SCANNER_THRESHOLD) {
            // Auto-ban
            const now = Date.now();
            const expiresAt = Math.floor((now + _BAN_TTL_DAYS * 86400 * 1000) / 1000);
            const reason = `Automated scanner ban: probed ${hit.paths.join(', ')}`;

            BannedIPModel.ban(ip, reason, 'Auto-Ban System', 'auto', false, expiresAt);
            console.log(`[Security] Auto-banned scanner ${ip} after ${hit.count} probes — expires in ${_BAN_TTL_DAYS} days`);

            // Send Discord embed (async, don't block response)
            sendBanEmbed(ip, hit.paths, hit.ua, now, expiresAt * 1000);

            const banInfo = BannedIPModel.isBanned(ip);
            return res.status(403).render('banned', {
                banInfo,
                expiresTs: expiresAt,
                probes: hit.paths,
            });
        } else {
            return res.status(403).render('scanner_warning', {
                ip,
                probedPath: req.path,
                hits: hit.count,
                threshold: _SCANNER_THRESHOLD,
                remaining,
            });
        }
    }

    next();
}

function calculateThreatLevel(path) {
    let score = 0;

    const patterns = {
        admin: 3, '.env': 5, 'config': 3, 'database': 4,
        'wp-admin': 4, 'phpmyadmin': 5, '../': 5, '..\\': 5,
        'SELECT': 5, 'UNION': 5, 'DROP': 5, 'exec': 4,
        'script': 3, 'passwd': 5, 'shadow': 5, '.git': 4,
        'backup': 3, 'dump': 4,
    };

    const lowerPath = path.toLowerCase();
    for (const [pattern, points] of Object.entries(patterns)) {
        if (lowerPath.includes(pattern.toLowerCase())) score += points;
    }

    if (score === 0) return 'none';
    if (score <= 3) return 'low';
    if (score <= 7) return 'medium';
    if (score <= 10) return 'high';
    return 'critical';
}

module.exports = { checkIPBan, getClientIP, calculateThreatLevel };
