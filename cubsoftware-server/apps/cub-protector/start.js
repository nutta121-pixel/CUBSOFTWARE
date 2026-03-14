const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const botDir = __dirname;

console.log('='.repeat(50));
console.log('       CUB PROTECTOR Bot - Startup');
console.log('='.repeat(50));

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
    console.log('Installing dependencies...');
    try {
        execSync('npm install --legacy-peer-deps', { cwd: botDir, stdio: 'inherit' });
        console.log('Dependencies installed successfully!');
    } catch (error) {
        console.error('Failed to install dependencies:', error.message);
        process.exit(1);
    }
} else {
    console.log('Dependencies already installed.');
}

// Check for .env file
const envPath = path.join(botDir, '.env');
if (!fs.existsSync(envPath)) {
    console.log('ERROR: .env file not found!');
    process.exit(1);
}

require('dotenv').config({ path: envPath });

if (!process.env.DISCORD_TOKEN) {
    console.log('ERROR: DISCORD_TOKEN not configured in .env file!');
    process.exit(1);
}

if (!process.env.CLIENT_ID) {
    console.log('ERROR: CLIENT_ID not configured in .env file!');
    process.exit(1);
}

console.log('Configuration validated!');
console.log('Starting bot...');
console.log('='.repeat(50));
console.log('');

require('./index.js');
