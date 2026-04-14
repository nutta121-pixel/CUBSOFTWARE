/**
 * Auth Tester — Target App Configuration
 *
 * Each entry is one app to test every hour.
 *
 * Fields:
 *   name          — label shown in PM2 logs
 *   baseUrl       — root URL of the app (override via env var)
 *   protectedPath — endpoint that requires auth (returns 401 when unauthenticated)
 *   authMode      — 'session' | 'internal-key'
 *                    session:      only rejection tests run (app uses cookie sessions)
 *                    internal-key: also verifies valid-token path using INTERNAL_TEST_SECRET
 *   disabled      — set true to skip without deleting the entry
 *
 * To add a new app: copy one of the entries below and fill in the fields.
 */
module.exports = [
    {
        name:             'CUB SOFTWARE Website',
        baseUrl:          process.env.CUBSOFTWARE_URL || 'http://localhost:3000',
        prodUrl:          'https://cubsoftware.site',
        protectedPath:    '/api/protected',
        authMode:         'internal-key',   // supports INTERNAL_TEST_SECRET bearer check
        rateLimitBurst:   160,              // Flask/Waitress: ~150 req limit, 160 burst is enough to trigger it
        disabled:         false,
    },
    {
        name:             'QuestCord Dashboard',
        baseUrl:          process.env.QUESTCORD_URL || 'http://localhost:3003',
        prodUrl:          'https://questcord.fun',
        protectedPath:    '/auth/me',
        authMode:         'session',        // session-only — rejection tests only
        rateLimitBurst:   520,              // Node.js: 500 req/min limit, needs 520 to trigger it
        disabled:         false,
    },
];
