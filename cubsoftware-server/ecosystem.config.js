/**
 * PM2 Ecosystem Configuration
 * CUB Software - Home Server Setup
 *
 * Usage:
 *   pm2 start ecosystem.config.js       # Start all apps
 *   pm2 start ecosystem.config.js --only questcord  # Start specific app
 *   pm2 stop all                        # Stop all apps
 *   pm2 restart all                     # Restart all apps
 *   pm2 logs                            # View all logs
 *   pm2 logs questcord                  # View specific app logs
 *   pm2 monit                           # Monitor dashboard
 *   pm2 save                            # Save current process list
 *   pm2 startup                         # Generate startup script
 *
 * SECRETS: Copy .env.example to .env in this directory and fill in values.
 * The .env file is gitignored and will never be overwritten by a git pull.
 * All apps are configured from this single file.
 */

const fs   = require('fs');
const path = require('path');

// Load .env from the server root into process.env (won't override already-set vars)
try {
    const lines = fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
        if (key && !(key in process.env)) process.env[key] = val;
    }
} catch (_) {}

function s(key, fallback) { return process.env[key] || fallback || ''; }

module.exports = {
    apps: [
        // ============================================
        // CubSoftware Website (Flask/Python)
        // ============================================
        {
            name: '0-cubsoftware-website',
            script: 'main.py',
            cwd: './apps/cubsoftware-website',
            interpreter: path.join(__dirname, 'apps/cubsoftware-website/venv/bin/python3'),
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            env: {
                FLASK_ENV: 'production',
                FLASK_DEBUG: '0',
                DEV_MODE: s('DEV_MODE', '0'),
                FLASK_SECRET_KEY: s('FLASK_SECRET_KEY'),
                ADMIN_API_KEY: s('ADMIN_API_KEY'),
                BOT_API_KEY: s('BOT_API_KEY'),
                CLEANME_BOT_API_KEY: s('BOT_API_KEY'),   // alias used by website
                CUBASSIST_ADMIN_KEY: s('CUBASSIST_ADMIN_KEY'),
                // Discord
                DISCORD_CLIENT_ID: s('DISCORD_CLIENT_ID'),
                DISCORD_CLIENT_SECRET: s('DISCORD_CLIENT_SECRET'),
                DISCORD_REDIRECT_URI: s('DISCORD_REDIRECT_URI'),
                CUB_LOGIN_DISCORD_REDIRECT: s('CUB_LOGIN_DISCORD_REDIRECT'),
                BOT_DASHBOARD_REDIRECT_URI: s('BOT_DASHBOARD_REDIRECT_URI'),
                BAN_APPEAL_REDIRECT_URI: s('BAN_APPEAL_REDIRECT_URI'),
                AFFILIATE_REDIRECT_URI: s('AFFILIATE_REDIRECT_URI'),
                // Twitch
                TWITCH_CLIENT_ID: s('TWITCH_CLIENT_ID'),
                TWITCH_CLIENT_SECRET: s('TWITCH_CLIENT_SECRET'),
                TWITCH_REDIRECT_URI: 'https://cubsoftware.site/apps/multi-twitch',
                CUB_LOGIN_TWITCH_REDIRECT: s('CUB_LOGIN_TWITCH_REDIRECT'),
                // CubReactive
                CUBREACTIVE_REDIRECT_URI: s('CUBREACTIVE_REDIRECT_URI'),
                CUBREACTIVE_RPC_REDIRECT_URI: s('CUBREACTIVE_RPC_REDIRECT_URI'),
                CUBREACTIVE_WS_URL: s('CUBREACTIVE_WS_URL'),
                // Cub Protector
                CUB_PROTECTOR_TOKEN: s('CUB_PROTECTOR_TOKEN'),
                CUB_PROTECTOR_REDIRECT_URI: s('CUB_PROTECTOR_REDIRECT_URI'),
                // CleanMe
                CLEANME_BOT_TOKEN: s('CLEANME_BOT_TOKEN'),
                CLEANME_BOT_CLIENT_ID: s('CLEANME_BOT_CLIENT_ID'),
                CLEANME_REDIRECT_URI: s('CLEANME_REDIRECT_URI'),
                // Misc
                LOG_SERVER_PORT: s('LOG_SERVER_PORT', '3847'),
                TRUSTED_IPS: s('TRUSTED_IPS'),

                CUBSOFTWARE_DATA_DIR: s('CUBSOFTWARE_DATA_DIR', '/var/cubsoftware-data'),
                BMAC_TOKEN: s('BMAC_TOKEN'),
                KERAPLAST_ADMIN_PASSWORD: s('KERAPLAST_ADMIN_PASSWORD'),
                INTERNAL_TEST_SECRET: s('INTERNAL_TEST_SECRET'),
                BARREL_ROLL_SECRET: s('BARREL_ROLL_SECRET'),
            },
            env_development: {
                FLASK_ENV: 'development',
                FLASK_DEBUG: '1',
                DEV_MODE: '1',
            },
            error_file: './logs/cubsoftware-website-error.log',
            out_file: './logs/cubsoftware-website-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },

        // ============================================
        // CUB PROTECTOR (Discord Moderation Bot)
        // ============================================
        {
            name: '1-cubprotector-bot',
            script: 'start.js',
            cwd: './apps/cub-protector',
            interpreter: 'node',
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            node_args: '--max-old-space-size=256',
            env: {
                NODE_ENV: 'production',
                DISCORD_TOKEN: s('CUB_PROTECTOR_TOKEN'),
                CLIENT_ID: s('CUB_PROTECTOR_CLIENT_ID'),
                OWNER_IDS: s('OWNER_IDS'),
                ADMIN_GUILD_ID: s('CUB_PROTECTOR_ADMIN_GUILD_ID'),
                DEV_GUILD_ID: s('CUB_PROTECTOR_DEV_GUILD_ID'),
                TERMINAL_CHANNEL_ID: s('TERMINAL_CHANNEL_ID', '1466190431485427856'),
                BOT_EVENTS_CHANNEL_ID: s('BOT_EVENTS_CHANNEL_ID', '1466190584372003092'),
                LINKS_LOG_CHANNEL_ID: s('CUB_PROTECTOR_LINKS_LOG_CHANNEL_ID'),
                API_URL: 'https://cubsoftware.site',
                API_KEY: s('BOT_API_KEY'),
                LOG_SERVER_PORT: s('LOG_SERVER_PORT', '3847'),
                CUBREACTIVE_WS_PORT: s('CUBREACTIVE_WS_PORT', '3848'),
                TWITCH_CLIENT_ID: s('TWITCH_CLIENT_ID'),
                TWITCH_CLIENT_SECRET: s('TWITCH_CLIENT_SECRET'),
                YOUTUBE_API_KEY: s('YOUTUBE_API_KEY'),
                CUBAI_API_KEY: s('CUBAI_API_KEY'),
                CUBAI_TRIGGER: s('CUBAI_TRIGGER', 'cub'),
                WHISPER_MODEL: s('WHISPER_MODEL', 'base'),
                INTERNAL_TEST_SECRET: s('INTERNAL_TEST_SECRET'),
                AUTH_TESTER_PORT: s('AUTH_TESTER_PORT', '3849'),
                BARREL_ROLL_SECRET: s('BARREL_ROLL_SECRET'),
                WEBSITE_INTERNAL_URL: 'http://127.0.0.1:5000',
            },
            env_development: {
                NODE_ENV: 'development'
            },
            error_file: './logs/cub-protector-error.log',
            out_file: './logs/cub-protector-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },

        // ============================================
        // QuestCord (Discord Bot + Web Dashboard)
        // ============================================
        {
            name: '2-questcord-website-and-bot',
            script: 'src/index.js',
            cwd: './apps/questcord',
            interpreter: 'node',
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            node_args: '--max-old-space-size=512',
            env: {
                NODE_ENV: 'production',
                DISCORD_TOKEN: s('QUESTCORD_TOKEN'),
                DISCORD_CLIENT_ID: s('QUESTCORD_CLIENT_ID'),
                DISCORD_CLIENT_SECRET: s('QUESTCORD_CLIENT_SECRET'),
                SUPPORT_SERVER_ID: s('QUESTCORD_SUPPORT_SERVER_ID'),
                OWNER_ID: s('OWNER_IDS'),
                OWNER_IDS: s('OWNER_IDS'),
                TERMINAL_CHANNEL_ID: s('TERMINAL_CHANNEL_ID', '1466190431485427856'),
                BOT_EVENTS_CHANNEL_ID: s('BOT_EVENTS_CHANNEL_ID', '1466190584372003092'),
                SESSION_SECRET: s('QUESTCORD_SESSION_SECRET'),
                DISCORD_CALLBACK_URL: 'https://questcord.fun/auth/discord/callback',
                DISCORD_BASE_URL: 'https://questcord.fun',
                TRUSTED_IPS: s('TRUSTED_IPS'),
            },
            env_development: {
                NODE_ENV: 'development'
            },
            error_file: './logs/questcord-error.log',
            out_file: './logs/questcord-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },

        // ============================================
        // CleanMe Bot (Discord Bot)
        // ============================================
        {
            name: '3-cleanme-bot',
            script: 'index.js',
            cwd: './apps/cleanme-bot',
            interpreter: 'node',
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            node_args: '--max-old-space-size=256',
            env: {
                NODE_ENV: 'production',
                BOT_TOKEN: s('CLEANME_BOT_TOKEN'),
                CLIENT_ID: s('CLEANME_BOT_CLIENT_ID'),
                OWNER_IDS: s('OWNER_IDS'),
                TERMINAL_CHANNEL_ID: s('TERMINAL_CHANNEL_ID', '1466190431485427856'),
                BOT_EVENTS_CHANNEL_ID: s('BOT_EVENTS_CHANNEL_ID', '1466190584372003092'),
                CLEANME_WEBSITE_URL: 'https://cubsoftware.site',
                CLEANME_API_KEY: s('BOT_API_KEY'),
            },
            env_development: {
                NODE_ENV: 'development'
            },
            error_file: './logs/cleanme-bot-error.log',
            out_file: './logs/cleanme-bot-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },

        // ============================================
        // Auth Tester (Security self-test, every 6h)
        // ============================================
        {
            name: '4-auth-tester',
            script: 'index.js',
            cwd: './apps/auth-tester',
            interpreter: 'node',
            watch: false,
            autorestart: true,
            max_restarts: 5,
            restart_delay: 10000,
            env: {
                NODE_ENV: 'production',
                AUTH_TESTER_ENABLED: s('AUTH_TESTER_ENABLED', 'true'),
                INTERNAL_TEST_SECRET: s('INTERNAL_TEST_SECRET'),
                AUTH_TESTER_PORT: s('AUTH_TESTER_PORT', '3849'),
                CUBSOFTWARE_URL: 'http://localhost:3000',
                QUESTCORD_URL: 'http://localhost:3003',
                SECURITY_BOT_TOKEN: s('SECURITY_BOT_TOKEN') || s('CUB_PROTECTOR_TOKEN'),
                SECURITY_CHANNEL_ID: s('SECURITY_CHANNEL_ID', '1493106273116356761'),
            },
            error_file: './logs/auth-tester-error.log',
            out_file: './logs/auth-tester-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },

        // ============================================
        // The Onion Bot (Solibot - Discord Bot)
        // ============================================
        {
            name: '5-onion-bot',
            script: 'index.js',
            cwd: '../The Onion Bot',
            interpreter: 'node',
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            node_args: '--max-old-space-size=256',
            env: {
                NODE_ENV: 'production',
                DISCORD_TOKEN: s('ONION_BOT_TOKEN'),
                CLIENT_ID: s('ONION_BOT_CLIENT_ID'),
                CLIENT_SECRET: s('ONION_BOT_CLIENT_SECRET'),
                CREATOR_ID: s('OWNER_IDS'),
                OWNER_IDS: s('OWNER_IDS'),
                TERMINAL_CHANNEL_ID: s('TERMINAL_CHANNEL_ID', '1466190431485427856'),
                BOT_EVENTS_CHANNEL_ID: s('BOT_EVENTS_CHANNEL_ID', '1466190584372003092'),
            },
            env_development: {
                NODE_ENV: 'development',
                DEBUG: 'true'
            },
            error_file: './logs/onion-bot-error.log',
            out_file: './logs/onion-bot-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },

        // ============================================
        // Galaxy Bot (Discord Bot - Python)
        // ============================================
        {
            name: '6-galaxy-bot',
            script: 'start.sh',
            cwd: '../galaxy',
            interpreter: 'bash',
            watch: false,
            autorestart: true,
            max_restarts: 10,
            restart_delay: 5000,
            env: {
                OWNER_ID: s('OWNER_IDS'),
                BOT_TOKEN_ID: s('GALAXY_BOT_TOKEN'),
            },
            env_development: {
                NODE_ENV: 'development'
            },
            error_file: './logs/galaxy-bot-error.log',
            out_file: './logs/galaxy-bot-out.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true
        },

        // ============================================
        // CubVault - Desktop App (NOT included)
        // ============================================
        // CubVault is an Electron desktop application
        // It requires a GUI and is not suitable for PM2/server deployment
        // Run it separately on your desktop machine
    ]
};
