{ const _l = console.log.bind(console); console.log = (...a) => { if (typeof a[0] === 'string') a[0] = a[0].replace(/\[([A-Za-z][A-Za-z0-9 _-]*)\]/g, '\x1b[32m[$1]\x1b[0m'); _l(...a); }; }
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const botDir = __dirname;

console.log('[Startup] CUB PROTECTOR Bot starting...');

// Check if node_modules exists
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
    console.log('[Startup] Installing dependencies...');
    try {
        execSync('npm install --legacy-peer-deps', { cwd: botDir, stdio: 'inherit' });
        console.log('[Startup] Dependencies installed successfully!');
    } catch (error) {
        console.error('CUBSOFTWARE_ERROR_CUBPROTECTOR_STARTUP_DEPS_112 — [Startup] Failed to install dependencies:', error.message);
        process.exit(1);
    }
} else {
    console.log('[Startup] Dependencies already installed.');
}

// Load .env file if present (not required — PM2 injects vars directly)
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
