/**
 * CUB SOFTWARE — Extended Security Checks
 *
 * Runs against each target in addition to auth and brute-force tests.
 *
 *  1.  Security response headers
 *  2.  SSL/TLS certificate expiry
 *  3.  CORS policy (no wildcard / reflected origin on protected endpoints)
 *  4.  Open redirect protection
 *  5.  Admin endpoint protection
 *  6.  Information disclosure (server version headers)
 *  7.  HTTP method enforcement
 *  8.  Cookie security flags
 *  9.  Error page disclosure (no stack traces)
 * 10.  HTTP → HTTPS redirect
 * 11.  Host header injection
 * 12.  Clickjacking protection (X-Frame-Options / CSP frame-ancestors)
 * 13.  Sensitive file exposure (config, backups, dotfiles)
 * 14.  Content-Type enforcement on API endpoints
 * 15.  Unauthenticated dashboard redirect
 */

'use strict';

const axios = require('axios');
const tls   = require('tls');
const http  = require('http');

const TIMEOUT_MS = 10000;

function log(msg) {
    process.stdout.write(`[AuthTester/Security] ${new Date().toISOString()} ${msg}\n`);
}

async function probe(url, options = {}) {
    try {
        const res = await axios({
            method:  options.method  || 'GET',
            url,
            headers: options.headers || {},
            data:    options.data,
            timeout: TIMEOUT_MS,
            validateStatus: () => true,
            maxRedirects:   0,
            maxContentLength: 1024 * 512,
        });
        return { status: res.status, headers: res.headers, data: res.data, ok: true };
    } catch (err) {
        return { status: null, ok: false, error: err.message };
    }
}

// ── 1. Security response headers ─────────────────────────────────────────────

async function testSecurityHeaders(target) {
    const url = target.baseUrl + '/';
    log(`[1] Security headers → ${url}`);

    const res = await probe(url);
    if (!res.ok) return { ok: false, error: res.error };

    const h = res.headers;
    const checks = {
        x_content_type_options: (h['x-content-type-options'] || '').toLowerCase().includes('nosniff'),
        x_frame_options_or_csp: !!(h['x-frame-options'] || (h['content-security-policy'] || '').includes('frame-ancestors')),
        referrer_policy:        !!h['referrer-policy'],
        no_server_version:      !/(flask|python|werkzeug|express|node)/i.test(h['server'] || ''),
        no_x_powered_by:        !h['x-powered-by'],
    };

    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    const passed = failed.length === 0;
    for (const [k, v] of Object.entries(checks)) log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);

    return { ok: passed, detail: { checks, failed } };
}

// ── 2. SSL certificate expiry ─────────────────────────────────────────────────

async function testSSLCertExpiry(target) {
    if (!target.prodUrl || !target.prodUrl.startsWith('https://')) {
        return { ok: true, skipped: true, reason: 'No HTTPS prodUrl configured' };
    }

    const hostname = new URL(target.prodUrl).hostname;
    log(`[2] SSL cert expiry → ${hostname}`);

    return new Promise((resolve) => {
        const socket = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: TIMEOUT_MS }, () => {
            try {
                const cert = socket.getPeerCertificate();
                socket.destroy();

                if (!cert || !cert.valid_to) return resolve({ ok: false, error: 'Could not retrieve certificate' });

                const expiresAt = new Date(cert.valid_to);
                const daysLeft  = Math.floor((expiresAt - Date.now()) / 86400000);
                const warn      = daysLeft <= 14;
                const ok        = daysLeft > 0;

                log(`  ${ok ? (warn ? 'WARN' : 'PASS') : 'FAIL'} cert expires ${cert.valid_to} (${daysLeft}d left)`);
                resolve({ ok, detail: { daysLeft, expiresAt: cert.valid_to, warning: warn } });
            } catch (e) {
                socket.destroy();
                resolve({ ok: false, error: e.message });
            }
        });

        socket.on('error', (err) => resolve({ ok: false, error: err.message }));
        socket.setTimeout(TIMEOUT_MS, () => { socket.destroy(); resolve({ ok: false, error: 'SSL check timed out' }); });
    });
}

// ── 3. CORS policy ────────────────────────────────────────────────────────────

async function testCORSPolicy(target) {
    const url = target.baseUrl + target.protectedPath;
    log(`[3] CORS policy → ${url}`);

    const res = await probe(url, { headers: { Origin: 'https://evil.example.com' } });
    if (!res.ok) return { ok: false, error: res.error };

    const acao = res.headers['access-control-allow-origin']      || '';
    const acac = res.headers['access-control-allow-credentials'] || '';

    const reflectsEvil      = acao === 'https://evil.example.com';
    const wildcardWithCreds = acao === '*' && acac.toLowerCase() === 'true';
    const passed = !reflectsEvil && !wildcardWithCreds;

    log(`  ${passed ? 'PASS' : 'FAIL'} ACAO: ${acao || '(not set)'} | ACAC: ${acac || '(not set)'}`);
    return { ok: passed, detail: { allowOrigin: acao, allowCredentials: acac } };
}

// ── 4. Open redirect ──────────────────────────────────────────────────────────

async function testOpenRedirect(target) {
    log(`[4] Open redirect → ${target.baseUrl}`);

    const payloads = [
        '/login?next=https://evil.example.com',
        '/login?redirect=https://evil.example.com',
        '/login?return_to=https://evil.example.com',
        '/logout?next=https://evil.example.com',
        '/auth/callback?redirect_uri=https://evil.example.com',
    ];

    const findings = [];
    for (const path of payloads) {
        const res = await probe(target.baseUrl + path);
        if (!res.ok) continue;
        const location = res.headers['location'] || '';
        if (location.includes('evil.example.com')) {
            findings.push({ path, location });
            log(`  FAIL open redirect: ${path} → ${location}`);
        }
    }

    const passed = findings.length === 0;
    if (passed) log(`  PASS no open redirects found`);
    return { ok: passed, detail: { tested: payloads.length, findings } };
}

// ── 5. Admin endpoint protection ──────────────────────────────────────────────

async function testAdminProtection(target) {
    log(`[5] Admin protection → ${target.baseUrl}`);

    const adminPaths = [
        '/api/admin', '/api/admin/users', '/api/admin/logs',
        '/api/admin/bans', '/api/internal', '/admin', '/admin/users',
        '/api/debug', '/api/config',
    ];

    const findings = [];
    for (const path of adminPaths) {
        const res = await probe(target.baseUrl + path);
        if (!res.ok) continue;
        if (res.status === 200) {
            findings.push({ path, status: res.status });
            log(`  FAIL ${path} → 200 without auth`);
        }
    }

    const passed = findings.length === 0;
    if (passed) log(`  PASS all admin paths protected`);
    return { ok: passed, detail: { tested: adminPaths.length, findings } };
}

// ── 6. Information disclosure ─────────────────────────────────────────────────

async function testInfoDisclosure(target) {
    log(`[6] Info disclosure → ${target.baseUrl}/`);

    const res = await probe(target.baseUrl + '/');
    if (!res.ok) return { ok: false, error: res.error };

    const server     = res.headers['server']       || '';
    const poweredBy  = res.headers['x-powered-by'] || '';
    const body       = typeof res.data === 'string' ? res.data : '';

    const checks = {
        no_version_in_server: !/([\d]+\.[\d]+)/i.test(server),
        no_x_powered_by:      !poweredBy,
        no_stack_trace:       !/(Traceback|at Object\.|SyntaxError)/i.test(body),
        no_debug_info:        !body.includes('DEBUG') && !body.includes('__debugger__'),
    };

    const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
    const passed = failed.length === 0;
    log(`  Server: "${server}" | X-Powered-By: "${poweredBy}"`);
    for (const [k, v] of Object.entries(checks)) log(`  ${v ? 'PASS' : 'FAIL'} ${k}`);
    return { ok: passed, detail: { server, poweredBy, checks } };
}

// ── 7. HTTP method enforcement ────────────────────────────────────────────────

async function testMethodEnforcement(target) {
    const url = target.baseUrl + target.protectedPath;
    log(`[7] Method enforcement → ${url}`);

    const methods  = ['PUT', 'DELETE', 'PATCH'];
    const findings = [];

    for (const method of methods) {
        const res = await probe(url, { method });
        if (!res.ok) continue;
        if (res.status === 200 || res.status === 500) {
            findings.push({ method, status: res.status });
            log(`  FAIL ${method} → ${res.status}`);
        }
    }

    const passed = findings.length === 0;
    if (passed) log(`  PASS all non-standard methods handled safely`);
    return { ok: passed, detail: { tested: methods.length, findings } };
}

// ── 8. Cookie security flags ──────────────────────────────────────────────────

async function testCookieFlags(target) {
    const url = target.baseUrl + '/login';
    log(`[8] Cookie flags → ${url}`);

    const res = await probe(url);
    if (!res.ok) return { ok: false, error: res.error };

    const cookies = res.headers['set-cookie'];
    if (!cookies || !cookies.length) {
        return { ok: true, skipped: true, reason: 'No cookies set on /login (OAuth redirect is normal)' };
    }

    const findings = [];
    for (const cookie of cookies) {
        const lower = cookie.toLowerCase();
        const name  = cookie.split('=')[0].trim();
        const missing = [];
        if (!lower.includes('httponly'))                                              missing.push('HttpOnly');
        if (!lower.includes('samesite=lax') && !lower.includes('samesite=strict'))  missing.push('SameSite');
        if (missing.length) {
            findings.push({ cookie: name, missing });
            log(`  FAIL cookie "${name}" missing: ${missing.join(', ')}`);
        }
    }

    const passed = findings.length === 0;
    if (passed) log(`  PASS all cookies have required security flags`);
    return { ok: passed, detail: { total: cookies.length, findings } };
}

// ── 9. Error page disclosure ──────────────────────────────────────────────────

async function testErrorDisclosure(target) {
    log(`[9] Error disclosure → ${target.baseUrl}`);

    const payloads = [
        { method: 'POST', path: target.protectedPath, data: 'not-json', headers: { 'Content-Type': 'application/json' } },
        { method: 'GET',  path: "/<script>alert(1)</script>",           headers: {} },
        { method: 'GET',  path: '/api/protected?id=1%27%20OR%20%271',   headers: {} },
    ];

    const findings = [];
    for (const p of payloads) {
        const res = await probe(target.baseUrl + p.path, { method: p.method, headers: p.headers, data: p.data });
        if (!res.ok) continue;
        const body = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || '');

        if (res.status === 500) {
            findings.push({ path: p.path, issue: 'HTTP 500' });
            log(`  FAIL ${p.path} → 500`);
        }
        if (/(Traceback|at Object\.|SyntaxError|UnhandledPromise)/i.test(body)) {
            findings.push({ path: p.path, issue: 'stack trace in response' });
            log(`  FAIL ${p.path} → stack trace exposed`);
        }
    }

    const passed = findings.length === 0;
    if (passed) log(`  PASS no error disclosure`);
    return { ok: passed, detail: { tested: payloads.length, findings } };
}

// ── 10. HTTP → HTTPS redirect ─────────────────────────────────────────────────

async function testHTTPSRedirect(target) {
    if (!target.prodUrl || !target.prodUrl.startsWith('https://')) {
        return { ok: true, skipped: true, reason: 'No HTTPS prodUrl configured' };
    }

    const httpUrl = target.prodUrl.replace('https://', 'http://');
    log(`[10] HTTPS redirect → ${httpUrl}`);

    return new Promise((resolve) => {
        const req = http.get(httpUrl, { timeout: TIMEOUT_MS }, (res) => {
            const location = res.headers['location'] || '';
            const ok = (res.statusCode === 301 || res.statusCode === 302) && location.startsWith('https://');
            log(`  ${ok ? 'PASS' : 'FAIL'} HTTP ${res.statusCode} → ${location || '(no redirect)'}`);
            resolve({ ok, detail: { status: res.statusCode, location } });
        });
        req.on('error', (err) => resolve({ ok: false, error: err.message }));
        req.setTimeout(TIMEOUT_MS, () => { req.destroy(); resolve({ ok: false, error: 'timeout' }); });
    });
}

// ── 11. Host header injection ─────────────────────────────────────────────────

async function testHostHeaderInjection(target) {
    const url = target.baseUrl + '/';
    log(`[11] Host header injection → ${url}`);

    const res = await probe(url, { headers: { Host: 'evil.example.com' } });
    if (!res.ok) return { ok: false, error: res.error };

    const body     = typeof res.data === 'string' ? res.data : JSON.stringify(res.data || '');
    const reflected = body.includes('evil.example.com');
    const passed    = !reflected;

    log(`  ${passed ? 'PASS' : 'FAIL'} Host header ${reflected ? 'REFLECTED in response' : 'not reflected'}`);
    return { ok: passed, detail: { reflected } };
}

// ── 12. Clickjacking protection ───────────────────────────────────────────────

async function testClickjacking(target) {
    const url = target.baseUrl + '/';
    log(`[12] Clickjacking → ${url}`);

    const res = await probe(url);
    if (!res.ok) return { ok: false, error: res.error };

    const xfo    = res.headers['x-frame-options']          || '';
    const csp    = res.headers['content-security-policy']  || '';
    const hasXFO = /DENY|SAMEORIGIN/i.test(xfo);
    const hasCsp = csp.includes('frame-ancestors');
    const passed  = hasXFO || hasCsp;

    log(`  X-Frame-Options: ${xfo || '(not set)'}`);
    log(`  CSP frame-ancestors: ${hasCsp ? 'set' : 'not set'}`);
    log(`  ${passed ? 'PASS' : 'FAIL'} clickjacking protection`);
    return { ok: passed, detail: { xFrameOptions: xfo, cspFrameAncestors: hasCsp } };
}

// ── 13. Sensitive file exposure ───────────────────────────────────────────────

async function testSensitiveFiles(target) {
    log(`[13] Sensitive file exposure → ${target.baseUrl}`);

    const files = [
        '/.env', '/.env.local', '/.env.production',
        '/.git/config', '/.git/HEAD',
        '/config.json', '/package.json', '/requirements.txt',
        '/docker-compose.yml', '/Dockerfile',
        '/backup.sql', '/dump.sql', '/db.sqlite', '/database.db',
        '/id_rsa', '/.ssh/id_rsa',
    ];

    const findings = [];
    for (const path of files) {
        const res = await probe(target.baseUrl + path);
        if (!res.ok) continue;
        if (res.status === 200) {
            findings.push({ path, status: res.status });
            log(`  FAIL ${path} → 200 (exposed!)`);
        }
    }

    const passed = findings.length === 0;
    if (passed) log(`  PASS no sensitive files exposed`);
    return { ok: passed, detail: { tested: files.length, findings } };
}

// ── 14. Content-Type enforcement ──────────────────────────────────────────────

async function testContentTypeEnforcement(target) {
    const url = target.baseUrl + target.protectedPath;
    log(`[14] Content-Type enforcement → ${url}`);

    // Send a POST with a completely wrong content type — should not 500
    const res = await probe(url, {
        method:  'POST',
        headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        data:    '<root><attack>true</attack></root>',
    });

    const passed = !res.ok || res.status !== 500;
    log(`  ${passed ? 'PASS' : 'FAIL'} wrong content-type → HTTP ${res.status ?? 'no response'}`);
    return { ok: passed, detail: { status: res.status } };
}

// ── 15. Unauthenticated dashboard redirect ────────────────────────────────────

async function testDashboardRedirect(target) {
    const dashPaths = ['/dashboard', '/bot-dashboard', '/affiliate/dashboard'];
    log(`[15] Dashboard redirect → ${target.baseUrl}`);

    const findings = [];
    for (const path of dashPaths) {
        const res = await probe(target.baseUrl + path);
        if (!res.ok) continue;
        // 200 without auth on a dashboard = bad. Should redirect (3xx) or 401/403
        if (res.status === 200) {
            findings.push({ path, status: res.status });
            log(`  FAIL ${path} → 200 without auth`);
        }
    }

    const passed = findings.length === 0;
    if (passed) log(`  PASS all dashboard paths redirect or require auth`);
    return { ok: passed, detail: { tested: dashPaths.length, findings } };
}

// ── Runner ────────────────────────────────────────────────────────────────────

async function runSecurityChecks(target) {
    log(`\n=== Extended security checks: ${target.name} (${target.baseUrl}) ===`);
    const results = {};

    const run = async (key, fn) => {
        try { results[key] = await fn(); } catch (e) { results[key] = { ok: false, error: e.message }; }
    };

    await run('security_headers',        () => testSecurityHeaders(target));
    await run('ssl_cert_expiry',         () => testSSLCertExpiry(target));
    await run('cors_policy',             () => testCORSPolicy(target));
    await run('open_redirect',           () => testOpenRedirect(target));
    await run('admin_protection',        () => testAdminProtection(target));
    await run('info_disclosure',         () => testInfoDisclosure(target));
    await run('method_enforcement',      () => testMethodEnforcement(target));
    await run('cookie_flags',            () => testCookieFlags(target));
    await run('error_disclosure',        () => testErrorDisclosure(target));
    await run('https_redirect',          () => testHTTPSRedirect(target));
    await run('host_header_injection',   () => testHostHeaderInjection(target));
    await run('clickjacking',            () => testClickjacking(target));
    await run('sensitive_files',         () => testSensitiveFiles(target));
    await run('content_type',            () => testContentTypeEnforcement(target));
    await run('dashboard_redirect',      () => testDashboardRedirect(target));

    const vals    = Object.values(results);
    const failed  = vals.filter(r => !r.ok && !r.skipped).length;
    const skipped = vals.filter(r => r.skipped).length;
    const passed  = vals.length - failed - skipped;
    const overall = failed === 0 ? 'PASS' : 'FAIL';

    log(`=== ${target.name} security: ${overall}  passed:${passed}  failed:${failed}  skipped:${skipped} ===\n`);
    return results;
}

module.exports = { runSecurityChecks };
