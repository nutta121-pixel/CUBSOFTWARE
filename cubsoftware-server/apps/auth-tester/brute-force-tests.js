/**
 * CUB SOFTWARE — Brute-Force Resilience Tests
 *
 * Tests your own servers' defences against abuse patterns:
 *   - Rate limit enforcement (burst flood)
 *   - Auth endpoint flooding (rapid bad tokens)
 *   - Common attack path probing (/.env, /admin, /wp-admin, etc.)
 *   - Header injection attempts
 *   - Oversized request bodies
 *
 * IMPORTANT:
 *   - Only targets URLs defined in auth-targets.config.js (your own apps)
 *   - Runs from localhost so the rate limit only fires on 127.0.0.1, not real user IPs
 *   - All tests are bounded — no infinite loops, no real credential guessing
 *   - Discord/Twitch OAuth means there are no passwords to crack; tests focus on
 *     what can actually be abused on your stack
 */

'use strict';

const axios = require('axios');

const TIMEOUT_MS = 10000;

// ── Utilities ────────────────────────────────────────────────────────────────

function log(msg) {
    process.stdout.write(`[AuthTester/BruteForce] ${new Date().toISOString()} ${msg}\n`);
}

async function probe(url, options = {}) {
    try {
        const res = await axios({
            method: options.method || 'GET',
            url,
            headers: options.headers || {},
            data: options.data,
            timeout: TIMEOUT_MS,
            validateStatus: () => true,
            maxRedirects: 0,
            maxContentLength: 1024 * 1024,
        });
        return { status: res.status, ok: true };
    } catch (err) {
        return { status: null, ok: false, error: err.message };
    }
}

/** Fire N requests to a URL in parallel, return array of status codes */
async function flood(url, count, headers = {}) {
    const requests = Array.from({ length: count }, () => probe(url, { headers }));
    const results = await Promise.all(requests);
    return results.map(r => r.status);
}

/** Fire N requests sequentially with a small gap to avoid crashing the server */
async function sequentialFlood(url, count, headers = {}, gapMs = 10) {
    const statuses = [];
    for (let i = 0; i < count; i++) {
        const r = await probe(url, { headers });
        statuses.push(r.status);
        if (gapMs > 0) await new Promise(res => setTimeout(res, gapMs));
    }
    return statuses;
}

// ── Test 1: Rate limit burst ──────────────────────────────────────────────────

/**
 * Send 120 concurrent requests (above the 100/min global limit).
 * At least some must return 429. If NONE do, rate limiting is not working.
 *
 * Note: Targets a lightweight endpoint (/api/auth/me) so the burst doesn't
 * cause meaningful server work — we're testing the rate limiter, not the handler.
 */
async function testRateLimitBurst(target) {
    const url = target.baseUrl + '/api/auth/me';
    log(`Rate limit burst: sending 120 concurrent requests to ${url}`);

    const statuses = await flood(url, 120);
    const count429 = statuses.filter(s => s === 429).length;
    const count200or401 = statuses.filter(s => s === 200 || s === 401).length;

    const passed = count429 >= 1;
    log(`  Result: ${count429} × 429 (rate-limited), ${count200or401} × 200/401 (allowed)`);

    if (!passed) {
        log('  FAIL: No 429 responses — rate limiting may not be configured correctly');
    } else {
        log(`  PASS: Rate limiter fired after ~100 requests`);
    }

    return {
        ok: passed,
        detail: { total: 120, rate_limited: count429, allowed: count200or401 }
    };
}

// ── Test 2: Auth endpoint flooding ───────────────────────────────────────────

/**
 * Send 100 rapid bad-token requests to the protected endpoint.
 * ALL must return 401. Any 200 means auth can be bypassed. Any 500 means
 * the server is crashing under auth load.
 */
async function testAuthFlood(target) {
    const url = target.baseUrl + target.protectedPath;
    log(`Auth flood: 100 rapid bad-token requests to ${url}`);

    const statuses = await sequentialFlood(
        url,
        100,
        { Authorization: 'Bearer brute-force-test-invalid-token' },
        5 // 5ms gap — fast but not instantaneous
    );

    const count401 = statuses.filter(s => s === 401).length;
    const count200 = statuses.filter(s => s === 200).length;
    const count500 = statuses.filter(s => s === 500).length;
    const count429 = statuses.filter(s => s === 429).length;

    // Pass if: no 200s (auth not bypassed), no 500s (server stable)
    const passed = count200 === 0 && count500 === 0;

    log(`  Result: 401×${count401}  200×${count200}  429×${count429}  500×${count500}`);
    if (count200 > 0) log('  FAIL: Got 200 — auth was bypassed on some requests');
    if (count500 > 0) log('  FAIL: Got 500 — server crashed under auth load');
    if (count429 > 0) log(`  INFO: ${count429} requests rate-limited (rate limiter working)`);
    if (passed)       log('  PASS: All requests rejected correctly, server remained stable');

    return {
        ok: passed,
        detail: { total: 100, rejected_401: count401, bypassed_200: count200, errors_500: count500, rate_limited_429: count429 }
    };
}

// ── Test 3: Common attack path probing ───────────────────────────────────────

/**
 * Known paths that attackers scan for to find exposed config, admin panels,
 * CMS files, or directory traversal opportunities.
 * ALL must return 404 (or 403/401). A 200 on any of these is a serious finding.
 * A 500 means the path caused a server error (also bad).
 */
const ATTACK_PATHS = [
    '/.env',
    '/.env.local',
    '/.env.production',
    '/.git/config',
    '/.git/HEAD',
    '/config.json',
    '/package.json',
    '/admin',
    '/admin/login',
    '/administrator',
    '/wp-admin',
    '/wp-login.php',
    '/phpmyadmin',
    '/phpinfo.php',
    '/server-status',
    '/actuator',
    '/actuator/env',
    '/api/v1/users',
    '/api/v1/admin',
    '/../etc/passwd',
    '/../../../../etc/passwd',
    '/etc/passwd',
    '/proc/self/environ',
    '/xmlrpc.php',
    '/backup.sql',
    '/dump.sql',
    '/db.sqlite',
    '/database.db',
    '/debug',
    '/console',
    '/trace',
    '/swagger-ui.html',
    '/graphql',
];

async function testPathProbing(target) {
    log(`Path probing: testing ${ATTACK_PATHS.length} known attack paths on ${target.baseUrl}`);

    const findings = [];
    let passed = true;

    for (const path of ATTACK_PATHS) {
        const url = target.baseUrl + path;
        const { status } = await probe(url);
        // 404, 403, 401, 429 are all acceptable rejections
        // 200 or 500 on these paths are failures
        const safe = status !== 200 && status !== 500;
        if (!safe) {
            findings.push({ path, status });
            passed = false;
            log(`  FAIL: ${path} → HTTP ${status} (should be 404/403/401)`);
        }
    }

    if (passed) {
        log(`  PASS: All ${ATTACK_PATHS.length} attack paths returned safe status codes`);
    } else {
        log(`  FAIL: ${findings.length} paths returned unsafe status codes`);
    }

    return { ok: passed, detail: { probed: ATTACK_PATHS.length, findings } };
}

// ── Test 4: Header injection ──────────────────────────────────────────────────

/**
 * Send requests with headers that contain common injection payloads.
 * The server must not return 500 (crash) for any of these.
 * A well-configured server returns 400 or ignores them.
 */
const INJECTION_HEADERS = [
    { 'X-Forwarded-For': "127.0.0.1' OR '1'='1" },
    { 'X-Forwarded-For': '../../etc/passwd' },
    { 'User-Agent': '<script>alert(1)</script>' },
    { 'User-Agent': "'; DROP TABLE sessions; --" },
    { 'Referer': 'javascript:alert(document.cookie)' },
    { 'Host': 'evil.example.com' },
    { 'X-Original-URL': '/.env' },
    { 'X-Rewrite-URL': '/admin' },
    { 'Transfer-Encoding': 'chunked, identity' },
    { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-7' },
];

async function testHeaderInjection(target) {
    const url = target.baseUrl + '/api/auth/me';
    log(`Header injection: ${INJECTION_HEADERS.length} payloads to ${url}`);

    let crashes = 0;
    for (const headers of INJECTION_HEADERS) {
        const { status } = await probe(url, { headers });
        if (status === 500) {
            crashes++;
            log(`  FAIL: Server 500 with headers: ${JSON.stringify(headers)}`);
        }
    }

    const passed = crashes === 0;
    if (passed) log(`  PASS: All ${INJECTION_HEADERS.length} injection payloads handled without crashing`);
    else        log(`  FAIL: ${crashes} header payloads caused server errors`);

    return { ok: passed, detail: { tested: INJECTION_HEADERS.length, crashes } };
}

// ── Test 5: Oversized body ────────────────────────────────────────────────────

/**
 * Send a 200KB JSON payload to the API. The server should reject it cleanly
 * (413 Payload Too Large or 400) — not crash with 500.
 */
async function testOversizedBody(target) {
    const url = target.baseUrl + '/api/protected';
    const bigPayload = JSON.stringify({ data: 'X'.repeat(200 * 1024) });
    log(`Oversized body: 200KB POST to ${url}`);

    const { status } = await probe(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: bigPayload,
    });

    // 400, 401, 403, 404, 413, 429 are all fine. 500 is not.
    const passed = status !== 500 && status !== null;
    log(`  Result: HTTP ${status} — ${passed ? 'PASS (no crash)' : 'FAIL (server error or no response)'}`);

    return { ok: passed, detail: { status } };
}

// ── Runner ────────────────────────────────────────────────────────────────────

/** Delay between individual test types — gives the server a breath between each test */
const TEST_GAP_MS = 30 * 1000; // 30 seconds

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runBruteForceTests(target) {
    log(`\n=== Brute-force resilience tests: ${target.name} (${target.baseUrl}) ===`);
    const results = {};

    try { results.rate_limit_burst  = await testRateLimitBurst(target);  } catch (e) { results.rate_limit_burst  = { ok: false, error: e.message }; }
    log(`  [gap] waiting ${TEST_GAP_MS / 1000}s before next test...`);
    await sleep(TEST_GAP_MS);

    try { results.auth_flood        = await testAuthFlood(target);        } catch (e) { results.auth_flood        = { ok: false, error: e.message }; }
    log(`  [gap] waiting ${TEST_GAP_MS / 1000}s before next test...`);
    await sleep(TEST_GAP_MS);

    try { results.path_probing      = await testPathProbing(target);      } catch (e) { results.path_probing      = { ok: false, error: e.message }; }
    log(`  [gap] waiting ${TEST_GAP_MS / 1000}s before next test...`);
    await sleep(TEST_GAP_MS);

    try { results.header_injection  = await testHeaderInjection(target);  } catch (e) { results.header_injection  = { ok: false, error: e.message }; }
    log(`  [gap] waiting ${TEST_GAP_MS / 1000}s before next test...`);
    await sleep(TEST_GAP_MS);

    try { results.oversized_body    = await testOversizedBody(target);    } catch (e) { results.oversized_body    = { ok: false, error: e.message }; }

    const failed = Object.values(results).filter(r => !r.ok).length;
    const passed = Object.values(results).length - failed;
    const overall = failed === 0 ? 'PASS' : 'FAIL';

    log(`=== ${target.name} brute-force result: ${overall}  passed:${passed}  failed:${failed} ===\n`);
    return results;
}

module.exports = { runBruteForceTests };
