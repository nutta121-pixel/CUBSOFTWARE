const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const botDir = __dirname;

console.log('='.repeat(50));
console.log('         CUB SOFTWARE Bot - Startup');
console.log('='.repeat(50));

// Check if node_modules exists
const nodeModulesPath = path.join(botDir, 'node_modules');
const packageLockPath = path.join(botDir, 'package-lock.json');

function needsInstall() {
    if (!fs.existsSync(nodeModulesPath)) {
        return true;
    }

    // Check if package.json is newer than package-lock.json
    const packageJsonPath = path.join(botDir, 'package.json');
    if (fs.existsSync(packageLockPath)) {
        const packageJsonStat = fs.statSync(packageJsonPath);
        const packageLockStat = fs.statSync(packageLockPath);
        if (packageJsonStat.mtime > packageLockStat.mtime) {
            return true;
        }
    }

    return false;
}

// Install dependencies if needed
if (needsInstall()) {
    console.log('Installing dependencies...');
    try {
        execSync('npm install', {
            cwd: botDir,
            stdio: 'inherit'
        });
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
const envExamplePath = path.join(botDir, '.env.example');

if (!fs.existsSync(envPath)) {
    console.log('');
    console.log('WARNING: .env file not found!');
    console.log('Please create .env file with your Discord bot credentials.');
    console.log('');
    console.log('Copy the example file:');
    console.log(`  cp ${envExamplePath} ${envPath}`);
    console.log('');
    console.log('Then edit it with your credentials:');
    console.log(`  nano ${envPath}`);
    console.log('');

    // Create .env from example if it doesn't exist
    if (fs.existsSync(envExamplePath)) {
        fs.copyFileSync(envExamplePath, envPath);
        console.log('Created .env from .env.example - please edit it with your credentials!');
    }

    console.log('Bot will not start until .env is configured.');
    console.log('='.repeat(50));
    process.exit(1);
}

// Check if required env vars are set
require('dotenv').config({ path: envPath });

if (!process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN === 'your_bot_token_here') {
    console.log('');
    console.log('ERROR: DISCORD_TOKEN not configured in .env file!');
    console.log('Please edit the .env file with your actual Discord bot token.');
    console.log('='.repeat(50));
    process.exit(1);
}

if (!process.env.CLIENT_ID || process.env.CLIENT_ID === 'your_client_id_here') {
    console.log('');
    console.log('ERROR: CLIENT_ID not configured in .env file!');
    console.log('Please edit the .env file with your Discord application client ID.');
    console.log('='.repeat(50));
    process.exit(1);
}

if (!process.env.API_KEY || process.env.API_KEY === 'your_secure_api_key_here') {
    console.log('');
    console.log('WARNING: API_KEY not configured in .env file!');
    console.log('Some features (whitelist management) will not work.');
    console.log('');
}

console.log('Configuration validated!');
console.log('Starting bot...');
console.log('='.repeat(50));
console.log('');

// Start the actual bot
require('./index.js');
