{ const _l = console.log.bind(console); console.log = (...a) => { if (typeof a[0] === 'string') a[0] = a[0].replace(/\[([A-Za-z][A-Za-z0-9 _-]*)\]/g, '\x1b[32m[$1]\x1b[0m'); _l(...a); }; }
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const botDir = __dirname;

console.log('[Startup] CUB PROTECTOR Bot starting...');

// ── npm dependencies ──────────────────────────────────────────────────────────
const nodeModulesPath = path.join(botDir, 'node_modules');
const packageLockPath = path.join(botDir, 'package-lock.json');

function needsInstall() {
    if (!fs.existsSync(nodeModulesPath)) return true;
    const packageJsonPath = path.join(botDir, 'package.json');
    if (fs.existsSync(packageLockPath)) {
        const packageJsonStat = fs.statSync(packageJsonPath);
        const packageLockStat = fs.statSync(packageLockPath);
        if (packageJsonStat.mtime > packageLockStat.mtime) return true;
    }
    return false;
}

if (needsInstall()) {
    console.log('[Startup] Installing npm dependencies...');
    try {
        execSync('npm install --legacy-peer-deps', { cwd: botDir, stdio: 'inherit' });
        console.log('[Startup] npm dependencies installed!');
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_CUBPROTECTOR_STARTUP_DEPS_112 — [Startup] Failed to install dependencies:', error.message);
        process.exit(1);
    }
} else {
    console.log('[Startup] npm dependencies already installed.');
}

// ── Opus codec (required for voice audio — crashes bot if missing) ────────────
function hasOpus() {
    try { require('@discordjs/opus'); return true; } catch (e) {}
    try { require('opusscript'); return true; } catch (e) {}
    return false;
}
if (!hasOpus()) {
    console.log('[Startup] Opus codec not found — installing @discordjs/opus...');
    let opusOk = false;
    try {
        execSync('npm install @discordjs/opus --legacy-peer-deps', { cwd: botDir, stdio: 'inherit' });
        console.log('[Startup] @discordjs/opus installed!');
        opusOk = true;
    } catch (err) {
        console.warn('[Startup] @discordjs/opus native build failed — trying opusscript (pure JS fallback)...');
    }
    if (!opusOk) {
        try {
            execSync('npm install opusscript --legacy-peer-deps', { cwd: botDir, stdio: 'inherit' });
            console.log('[Startup] opusscript installed!');
        } catch (err2) {
            console.warn('[Startup] Could not install any Opus codec — CUB AI voice listening unavailable:', err2.message);
        }
    }
}

// ── Piper TTS binary + voice model ───────────────────────────────────────────
const PIPER_DIR   = path.join(botDir, 'piper');
const PIPER_BIN   = path.join(PIPER_DIR, 'piper');
const PIPER_MODEL = path.join(PIPER_DIR, 'en_US-amy-medium.onnx');

function downloadFile(url, dest) {
    try {
        execSync(`curl -fsSL -o "${dest}" "${url}"`, { stdio: 'pipe' });
        return true;
    } catch (e) {}
    try {
        execSync(`wget -q -O "${dest}" "${url}"`, { stdio: 'pipe' });
        return true;
    } catch (e) {}
    return false;
}

if (!fs.existsSync(PIPER_BIN)) {
    console.log('[Startup] Piper TTS binary not found — downloading...');
    try {
        const arch = process.arch === 'arm64' ? 'aarch64' : 'x86_64';
        const tarUrl = `https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_${arch}.tar.gz`;
        const tarPath = path.join(botDir, '_piper_dl.tar.gz');
        if (!downloadFile(tarUrl, tarPath)) throw new Error('curl and wget both failed');
        execSync(`tar -xzf "${tarPath}" -C "${botDir}"`, { stdio: 'pipe' });
        fs.unlinkSync(tarPath);
        execSync(`chmod +x "${PIPER_BIN}"`);
        console.log('[Startup] Piper binary installed!');
    } catch (err) {
        console.warn('[Startup] Could not download Piper binary:', err.message, '— voice TTS will be unavailable');
    }
}

if (fs.existsSync(PIPER_BIN) && !fs.existsSync(PIPER_MODEL)) {
    console.log('[Startup] Piper voice model not found — downloading (this may take a minute)...');
    try {
        const base = 'https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium';
        if (!downloadFile(`${base}/en_US-amy-medium.onnx`, PIPER_MODEL))
            throw new Error('Model download failed');
        downloadFile(`${base}/en_US-amy-medium.onnx.json`, PIPER_MODEL + '.json');
        console.log('[Startup] Piper voice model downloaded!');
    } catch (err) {
        console.warn('[Startup] Could not download Piper model:', err.message, '— voice TTS will be unavailable');
    }
}

// ── Environment + token checks ────────────────────────────────────────────────
const envPath = path.join(botDir, '.env');
if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath });
}

if (!process.env.DISCORD_TOKEN) {
    console.log('ERROR: DISCORD_TOKEN not configured!');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.log('ERROR: CLIENT_ID not configured!');
    process.exit(1);
}

console.log('[Startup] Configuration validated!');
console.log('[Startup] Starting bot...');

require('./index.js');
