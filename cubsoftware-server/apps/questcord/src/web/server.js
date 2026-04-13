const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const session = require('express-session');
const config = require('../../config.json');
const { updateStaffRoles } = require('./middleware/auth');
const { checkIPBan, getClientIP, calculateThreatLevel } = require('./middleware/ipBan');
const { debugLogger } = require('../utils/debugLogger');
const { initializeDiscordOAuth, passport } = require('./auth/discordOAuth');
const EventBus = require('../services/EventBus');

let io = null;
let discordClient = null;

// In-memory tracking (no external calls)
const _seenIPs = new Set();
const _failedLogins = new Map();  // ip → count
let _reqPerMin = 0;
let _wsMessagesPerMin = 0;
let _peakWsClients = 0;
setInterval(() => {
    if (_reqPerMin > 0) console.log(`[Traffic] ${_reqPerMin} requests/min | WS broadcasts: ${_wsMessagesPerMin}/min | peak WS clients: ${_peakWsClients}`);
    _reqPerMin = 0;
    _wsMessagesPerMin = 0;
}, 60000);

async function startWebServer(client) {
    discordClient = client;

    const app = express();
    const server = http.createServer(app);
    const wss = new WebSocket.Server({ server });

    io = wss;

    app.set('trust proxy', true);

    // Simple Helmet configuration for security without breaking functionality
    app.use(helmet({
        contentSecurityPolicy: false,  // Let browser handle CSP for now
        crossOriginEmbedderPolicy: false,
        crossOriginOpenerPolicy: false,
        crossOriginResourcePolicy: false
    }));

    app.use(cors({
        origin: true,
        credentials: true
    }));
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // Session middleware for OAuth
    app.use(session({
        secret: process.env.SESSION_SECRET || 'default-secret-change-this',
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: process.env.NODE_ENV === 'production', // HTTPS only in production
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        }
    }));

    // Initialize Discord OAuth
    initializeDiscordOAuth();
    app.use(passport.initialize());
    app.use(passport.session());

    // Register EventBus WebSocket broadcaster
    EventBus.registerWebSocketBroadcaster((data) => {
        if (!io) return;
        let sent = 0;
        io.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
                sent++;
            }
        });
        _wsMessagesPerMin++;
        if (io.clients.size > _peakWsClients) _peakWsClients = io.clients.size;
        console.log(`[WS] Broadcast type:${data.type} → ${sent}/${io.clients.size} clients`);
    });

    // Register EventBus Discord client
    EventBus.registerDiscordClient(client);

    app.use(checkIPBan);

    const limiter = rateLimit({
        windowMs: 1 * 60 * 1000, // 1 minute window
        max: 500, // 500 requests per minute (allows normal browsing + multiple page loads)
        keyGenerator: (req) => getClientIP(req),
        skip: (req) => {
            // Skip rate limiting for static assets to prevent blocking CSS/JS/images
            return req.path.startsWith('/css/') ||
                   req.path.startsWith('/js/') ||
                   req.path.startsWith('/images/') ||
                   req.path.startsWith('/fonts/');
        },
        handler: (req, res) => {
            const ip = getClientIP(req);
            console.log(`[RateLimit] Blocked ${ip} on ${req.method} ${req.path} | UA: ${(req.headers['user-agent'] || 'none').substring(0, 60)}`);
            res.status(429).json({ error: 'Too many requests' });
        }
    });
    app.use(limiter);

    // Request logging + IP tracking + slow request detection
    app.use((req, res, next) => {
        const ip = getClientIP(req);
        const start = Date.now();
        _reqPerMin++;

        // New IP detection
        if (!_seenIPs.has(ip)) {
            _seenIPs.add(ip);
            const ua = (req.headers['user-agent'] || 'none').substring(0, 80);
            console.log(`[IP] New IP: ${ip} | ${req.method} ${req.path} | UA: ${ua}`);
        }

        // Large request body warning
        const contentLength = parseInt(req.headers['content-length'] || '0');
        if (contentLength > 50000) {
            console.log(`[Security] Large request body: ${contentLength} bytes from ${ip} on ${req.method} ${req.path}`);
        }

        res.on('finish', () => {
            const ms = Date.now() - start;
            const isApi = req.path.startsWith('/api/v1/');
            const isStatic = req.path.startsWith('/css/') || req.path.startsWith('/js/') || req.path.startsWith('/images/') || req.path.startsWith('/fonts/') || req.path.startsWith('/assets/');

            if (!isStatic) {
                if (isApi) {
                    console.log(`[API] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms) from ${ip}`);
                } else {
                    console.log(`[Request] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms) from ${ip}`);
                }
            }

            if (ms > 1000 && !isStatic) {
                console.log(`[Slow] ${req.method} ${req.path} took ${ms}ms (status: ${res.statusCode})`);
            }

            if (res.statusCode === 403) {
                console.log(`[Security] 403 from ${ip}: ${req.method} ${req.path}`);
                const prev = _failedLogins.get(ip) || 0;
                _failedLogins.set(ip, prev + 1);
                if (prev + 1 >= 3) console.log(`[Security] Repeated 403s from ${ip} (${prev + 1} times)`);
            }
        });
        next();
    });

    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));

    // Cache-busting: version changes on each server restart
    const staticVersion = Date.now().toString();
    app.use((req, res, next) => {
        res.locals.v = staticVersion;
        if (req.path.startsWith('/css/') || req.path.startsWith('/js/')) {
            res.set('Cache-Control', 'no-cache, must-revalidate');
        }
        next();
    });

    // Inject CUB SOFTWARE mascot into every HTML response
    app.use((req, res, next) => {
        const originalSend = res.send.bind(res);
        res.send = (body) => {
            if (typeof body === 'string' && body.includes('</body>')) {
                const mascotHtml = `<style>
                    .cub-mascot{position:fixed;bottom:0;right:0;width:280px;height:auto;max-width:none!important;pointer-events:none;user-select:none;filter:drop-shadow(0 0 24px rgba(88,101,242,.4));z-index:50;}
                    @media(max-width:1024px){.cub-mascot{display:none;}}
                </style><img src="https://cubsoftware.site/static/images/CUB/CUBSOFTWARE%20MASCOT%20-%20TRANSPARENT%20BACKGROUND%202.png" class="cub-mascot" alt="" draggable="false">`;
                body = body.replace('</body>', mascotHtml + '</body>');
            }
            return originalSend(body);
        };
        next();
    });

    app.use(express.static(path.join(__dirname, '../../public')));

    // Serve Vue app assets specifically
    app.use('/assets', express.static(path.join(__dirname, '../../public/app/assets')));

    const apiRoutes = require('./routes/api');
    const adminRoutes = require('./routes/admin');
    const webRoutes = require('./routes/web');
    const authRoutes = require('./routes/auth');
    const apiV1Routes = require('../api/routes/v1');

    app.use('/auth', authRoutes);
    app.use('/api/v1', apiV1Routes);
    app.use('/api', apiRoutes);
    app.use('/api/admin', adminRoutes);
    app.use('/', webRoutes);

    app.use((req, res) => {
        const threatLevel = calculateThreatLevel(req.path);
        const ip = getClientIP(req);

        if (threatLevel === 'critical') {
            console.log(`[SECURITY] Critical threat detected from ${ip}: ${req.path}`);
        }

        res.status(404).render('404', {
            path: req.path,
            threatLevel: threatLevel,
            ip: ip
        });
    });

    app.use((err, req, res, next) => {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_SERVER_ERROR_114 — Server error:', err);
        res.status(500).render('404', {
            path: req.path,
            threatLevel: 'none',
            ip: getClientIP(req)
        });
    });

    wss.on('connection', (ws, req) => {
        const clientIp = getClientIP(req);
        console.log('[WebSocket] New connection');

        debugLogger.info('WEBSOCKET', 'New WebSocket connection established', {
            ip: clientIp,
            connectedClients: wss.clients.size
        });

        ws.on('error', (err) => {
            console.error(`CUBSOFTWARE_ERROR_QUESTCORD_WS_CLIENT_ERROR_011 — WebSocket client error from ${clientIp}: ${err.message}`);
            ws.terminate();
        });

        ws.on('close', () => {
            console.log('[WebSocket] Connection closed');
            debugLogger.info('WEBSOCKET', 'WebSocket connection closed', {
                ip: clientIp,
                connectedClients: wss.clients.size
            });
        });
    });

    setInterval(() => updateStaffRoles(client, broadcastStaff), 5 * 60 * 1000); // 5 minutes
    updateStaffRoles(client, broadcastStaff);

    const port = process.env.NODE_ENV === 'production' ? config.productionPort : config.port;
    const host = '0.0.0.0'; // Bind to all network interfaces

    server.listen(port, host, async () => {
        const publicUrl = process.env.DISCORD_BASE_URL || `http://localhost:${port}`;

        console.log(`[WEB SERVER] Successfully started`);
        console.log(`[WEB SERVER] Listening on ${host}:${port}`);
        console.log(`[WEB SERVER] Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`[WEB SERVER] Access at: ${publicUrl}`);

        await debugLogger.success('WEB SERVER', `Web server started on ${host}:${port}`, {
            host: host,
            port: port,
            environment: process.env.NODE_ENV || 'development',
            url: publicUrl
        });
    });

    server.on('error', (error) => {
        console.error('CUBSOFTWARE_ERROR_QUESTCORD_SERVER_START_113 — [WEB SERVER] Failed to start:', error.message);
        if (error.code === 'EADDRINUSE') {
            console.error(`CUBSOFTWARE_ERROR_QUESTCORD_SERVER_PORT_BUSY_115 — [WEB SERVER] Port ${port} is already in use. Run: fuser -k ${port}/tcp`);
        } else if (error.code === 'EACCES') {
            console.error(`CUBSOFTWARE_ERROR_QUESTCORD_SERVER_PORT_PERMS_116 — [WEB SERVER] Permission denied. Port ${port} requires elevated privileges.`);
        }
        throw error;
    });

    return server;
}

function broadcastActivity(activity) {
    if (!io) return;

    io.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'activity', data: activity }));
        }
    });
}

function broadcastStats(stats) {
    if (!io) return;

    io.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'stats', data: stats }));
        }
    });
}

function broadcastLeaderboard(leaderboard) {
    if (!io) return;

    io.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'leaderboard', data: leaderboard }));
        }
    });
}

function broadcastStaff(staff) {
    if (!io) return;

    io.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'staff', data: staff }));
        }
    });
}

function broadcastWebsiteSettings(settings) {
    if (!io) return;

    io.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'website_settings', data: settings }));
        }
    });
}

function getDiscordClient() {
    return discordClient;
}

module.exports = { startWebServer, broadcastActivity, broadcastStats, broadcastLeaderboard, broadcastStaff, broadcastWebsiteSettings, getDiscordClient };
