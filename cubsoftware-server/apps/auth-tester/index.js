/**
 * CUB SOFTWARE Auth Self-Test Service
 *
 * Runs on the hour (1:00, 2:00, 3:00 …) using node-cron.
 * For each configured app it verifies that:
 *   - Requests with no auth are rejected (401)
 *   - Requests with a bad/garbage token are rejected (401)
 *   - Requests with an expired JWT are rejected (401)
 *   - Requests with a tampered JWT are rejected (401)
 *   - Requests with a wrong-issuer JWT are rejected (401)
 *   - (internal-key mode) Requests with the valid INTERNAL_TEST_SECRET get 200
 *
 * DEFENSIVE ONLY — verifies that invalid auth is blocked.
 * No bypassing, attacking, brute-forcing, or credential stuffing.
 *
 * Enable/disable:  AUTH_TESTER_ENABLED=false  (default: true)
 * Valid-token key: INTERNAL_TEST_SECRET        (must also be set on each app server)
 */

'use strict';

const cron = require('node-cron');
const axios = require('axios');
const jwt   = require('jsonwebtoken');
const http  = require('http');

const TARGETS                        = require('./auth-targets.config');
const { runBruteForceTests }         = require('./brute-force-tests');
const { runSecurityChecks }          = require('./security-checks');
const { clearChannel, reportToDiscord } = require('./discord-reporter');
const ENABLED         = process.env.AUTH_TESTER_ENABLED !== 'false';
const INTERNAL_SECRET = process.env.INTERNAL_TEST_SECRET || '';
const TIMEOUT_MS      = 8000;

// Prevents overlapping runs if a previous check is still going
let _running = false;

// ── Utilities ────────────────────────────────────────────────────────────────

function log(msg) {
    process.stdout.write(`[AuthTester] ${new Date().toISOString()} ${msg}\n`);
}

/**
 * HTTP GET that never throws — returns { status, ok, error }.
 * ok = true when status matches expectedStatus.
 */
async function probe(url, headers, expectedStatus) {
    try {
        const res = await axios.get(url, {
            headers,
            timeout: TIMEOUT_MS,
            validateStatus: () => true, // don't throw on 4xx/5xx
            maxRedirects: 0,
        });
        return { status: res.status, ok: res.status === expectedStatus };
    } catch (err) {
        return { status: null, ok: false, error: err.message };
    }
}

/**
 * Build a JWT with custom claims, signed with an intentionally wrong secret
 * (unless a valid secret is passed explicitly — used only for the valid-token test).
 */
function makeJwt(overrides = {}, secret = 'wrong-secret-intentionally') {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
        {
            sub: 'auth-tester',
            iss: 'cubsoftware-auth-tester',
            aud: 'cubsoftware.site',
            iat: now,
            exp: now + 3600,
            ...overrides,
        },
        secret,
        { algorithm: 'HS256' }
    );
}

// ── Per-target test suite ────────────────────────────────────────────────────

async function runTargetTests(target) {
    const url = target.baseUrl + target.protectedPath;
    const results = {};

    // 1. No auth → must be rejected
    results.no_auth = await probe(url, {}, 401);

    // 2. Random garbage bearer token → must be rejected
    results.bad_token = await probe(
        url,
        { Authorization: 'Bearer thisisnotavalidtoken123' },
        401
    );

    // 3. Expired JWT (exp 1 hour in the past) → must be rejected
    const expiredToken = makeJwt({ exp: Math.floor(Date.now() / 1000) - 3600 });
    results.expired_token = await probe(
        url,
        { Authorization: `Bearer ${expiredToken}` },
        401
    );

    // 4. Tampered JWT (valid header+payload, broken signature) → must be rejected
    const base = makeJwt({}, 'some-other-secret');
    const [h, p] = base.split('.');
    const tampered = `${h}.${p}.thisisaninvalidsignature`;
    results.tampered_token = await probe(
        url,
        { Authorization: `Bearer ${tampered}` },
        401
    );

    // 5. Wrong-issuer JWT (signed with wrong secret AND wrong iss) → must be rejected
    const wrongIssuer = makeJwt({ iss: 'attacker.example.com' }, 'attacker-secret');
    results.wrong_issuer = await probe(
        url,
        { Authorization: `Bearer ${wrongIssuer}` },
        401
    );

    // 6. Valid internal-key → must be accepted (internal-key mode only)
    if (target.authMode === 'internal-key' && INTERNAL_SECRET) {
        results.valid_internal_key = await probe(
            url,
            { Authorization: `Bearer ${INTERNAL_SECRET}` },
            200
        );
    } else {
        results.valid_internal_key = {
            skipped: true,
            reason: target.authMode === 'session'
                ? 'session-mode app — rejection tests are sufficient'
                : 'INTERNAL_TEST_SECRET not set',
        };
    }

    return results;
}

// ── Summary output ────────────────────────────────────────────────────────────

function printSummary(target, results) {
    let passed = 0, failed = 0, skipped = 0;

    for (const [check, result] of Object.entries(results)) {
        if (result.skipped) {
            skipped++;
            log(`  SKIP  ${check}: ${result.reason}`);
        } else if (result.ok) {
            passed++;
            log(`  PASS  ${check} (HTTP ${result.status})`);
        } else {
            failed++;
            const detail = result.error
                ? `ERROR: ${result.error}`
                : `got HTTP ${result.status ?? 'timeout'}`;
            log(`  FAIL  ${check}: ${detail}`);
        }
    }

    const overall = failed === 0 ? 'PASS' : 'FAIL';
    log(`--- ${target.name} → ${overall}  passed:${passed}  failed:${failed}  skipped:${skipped}`);
}

// ── Main runner ───────────────────────────────────────────────────────────────

async function runAllChecks() {
    if (_running) {
        log('Previous run still in progress — skipping this tick to prevent overlap');
        return;
    }
    _running = true;

    const timestamp = Date.now();
    log('=== Security check started ===');

    // Clear the Discord channel now (before tests run) so it is empty while
    // the scan is in progress. For scheduled runs the pre-clear cron fires
    // 5 min earlier; this handles manual triggers and acts as a safety net.
    try { await clearChannel(); } catch (e) { log(`Pre-scan channel clear failed: ${e.message}`); }

    const activeTargets = TARGETS.filter(t => !t.disabled);
    const allAuthResults = {};   // target.name → results
    const allBfResults   = {};   // target.name → results
    const allSecResults  = {};   // target.name → results
    let totalPass = 0, totalFail = 0;
    let bfPass = 0, bfFail = 0;
    let secPass = 0, secFail = 0;

    // ── Auth tests ────────────────────────────────────────────────────────────
    for (const target of activeTargets) {
        log(`Testing auth: ${target.name} (${target.baseUrl + target.protectedPath})`);
        try {
            const results = await runTargetTests(target);
            allAuthResults[target.name] = results;
            printSummary(target, results);
            const anyFailed = Object.values(results).some(r => !r.skipped && !r.ok);
            anyFailed ? totalFail++ : totalPass++;
        } catch (err) {
            log(`ERROR running auth tests for ${target.name}: ${err.message}`);
            allAuthResults[target.name] = { error: { ok: false, error: err.message } };
            totalFail++;
        }
    }

    // ── Brute-force resilience tests ──────────────────────────────────────────
    log('\n=== Starting brute-force resilience checks ===');
    for (const target of activeTargets) {
        try {
            const results = await runBruteForceTests(target);
            allBfResults[target.name] = results;
            const anyFailed = Object.values(results).some(r => !r.ok);
            anyFailed ? bfFail++ : bfPass++;
        } catch (err) {
            log(`ERROR in brute-force tests for ${target.name}: ${err.message}`);
            allBfResults[target.name] = { error: { ok: false, error: err.message } };
            bfFail++;
        }
    }

    // ── Security checks ───────────────────────────────────────────────────────
    log('\n=== Starting extended security checks ===');
    for (const target of activeTargets) {
        try {
            const results = await runSecurityChecks(target);
            allSecResults[target.name] = results;
            const anyFailed = Object.values(results).some(r => !r.skipped && !r.ok);
            anyFailed ? secFail++ : secPass++;
        } catch (err) {
            log(`ERROR in security checks for ${target.name}: ${err.message}`);
            allSecResults[target.name] = { error: { ok: false, error: err.message } };
            secFail++;
        }
    }

    log(`\n=== Full check done: auth ${totalPass}P/${totalFail}F | brute-force ${bfPass}P/${bfFail}F | security ${secPass}P/${secFail}F ===`);

    // ── Discord report ────────────────────────────────────────────────────────
    try {
        await reportToDiscord({
            targets: activeTargets,
            authResults: allAuthResults,
            bfResults: allBfResults,
            secResults: allSecResults,
            timestamp,
        });
    } catch (err) {
        log(`Discord report failed: ${err.message}`);
    }

    _running = false;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

if (!ENABLED) {
    log('AUTH_TESTER_ENABLED=false — service is disabled, exiting');
    process.exit(0);
}

if (!INTERNAL_SECRET) {
    log('WARNING: INTERNAL_TEST_SECRET not set — valid-key tests will be skipped');
}

// ── HTTP trigger endpoint ─────────────────────────────────────────────────────
// POST http://localhost:<AUTH_TESTER_PORT>/trigger
// Authorization: Bearer <INTERNAL_TEST_SECRET>
// Used by the CUB Protector bot's /scan command to trigger on demand

const TRIGGER_PORT = parseInt(process.env.AUTH_TESTER_PORT || '3849', 10);

const triggerServer = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/trigger') {
        res.writeHead(404);
        return res.end('Not found');
    }
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (!INTERNAL_SECRET || token !== INTERNAL_SECRET) {
        res.writeHead(401);
        return res.end('Unauthorized');
    }
    if (_running) {
        res.writeHead(409);
        return res.end('Scan already in progress');
    }
    res.writeHead(200);
    res.end('Scan triggered');
    log('Manual scan triggered via HTTP');
    runAllChecks();
});

triggerServer.listen(TRIGGER_PORT, '127.0.0.1', () => {
    log(`Trigger endpoint listening on 127.0.0.1:${TRIGGER_PORT}`);
});

// Delay the startup scan by 5 minutes so all other services (QuestCord etc.)
// have time to fully start up before we probe them.
// Use the manual trigger (curl / /scan-security) for an immediate scan if needed.
const STARTUP_DELAY_MS = 5 * 60 * 1000;
log(`Startup scan will begin in ${STARTUP_DELAY_MS / 60000} min (waiting for all services to come up)`);
setTimeout(() => {
    log('Startup scan starting now');
    runAllChecks();
}, STARTUP_DELAY_MS);

// Clear the channel 5 minutes before each scheduled scan (23:55, 05:55, 11:55, 17:55 NZST/NZDT)
// so the channel is already empty when the scan starts.
cron.schedule('55 23,5,11,17 * * *', () => {
    log('Pre-scan cron fired — clearing Discord channel 5 min before scan');
    clearChannel().catch(e => log(`Pre-scan clear failed: ${e.message}`));
}, { timezone: 'Pacific/Auckland' });

// Scans at 00:00, 06:00, 12:00, 18:00 New Zealand time (Pacific/Auckland)
cron.schedule('0 0,6,12,18 * * *', () => {
    log('Cron fired — scheduled scan (NZ time)');
    runAllChecks();
}, { timezone: 'Pacific/Auckland' });

log(`Auth tester running. Schedule: 00:00/06:00/12:00/18:00 NZT. Trigger port: ${TRIGGER_PORT}. Startup run in progress...`);
