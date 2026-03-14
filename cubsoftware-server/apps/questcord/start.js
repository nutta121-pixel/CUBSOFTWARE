#!/usr/bin/env node

/**
 * QuestCord Startup Script
 * This script handles the complete initialization:
 * 1. Runs npm install to ensure dependencies are up to date
 * 2. Deploys slash commands to Discord
 * 3. Starts the bot and web server
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    red: '\x1b[31m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function runCommand(command, args, description) {
    return new Promise((resolve, reject) => {
        log(`\n${colors.bright}[STEP] ${description}${colors.reset}`, colors.blue);

        const child = spawn(command, args, {
            stdio: 'inherit',
            shell: true,
            cwd: __dirname
        });

        child.on('close', (code) => {
            if (code !== 0) {
                log(`[ERROR] ${description} failed with code ${code}`, colors.red);
                reject(new Error(`${description} failed with code ${code}`));
            } else {
                log(`[SUCCESS] ${description} completed`, colors.green);
                resolve();
            }
        });

        child.on('error', (err) => {
            log(`[ERROR] ${description} failed: ${err.message}`, colors.red);
            reject(err);
        });
    });
}

async function main() {
    try {
        log(`
╔═══════════════════════════════════════════════════╗
║           QuestCord v3 Startup Script             ║
╚═══════════════════════════════════════════════════╝
        `, colors.bright + colors.blue);

        // Ensure logs directory exists
        const logsDir = path.join(__dirname, 'logs');
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
            log('[INFO] Created logs directory', colors.yellow);
        }

        // Step 1: Install dependencies
        await runCommand('npm', ['install'], 'Installing dependencies');

        // Step 2: Deploy Discord commands
        await runCommand('node', ['src/bot/deploy-commands.js'], 'Deploying Discord commands');

        // Step 3: Start the application
        log(`\n${colors.bright}[STEP] Starting QuestCord application${colors.reset}`, colors.blue);
        log('[INFO] Bot and web server are now starting...', colors.green);

        // Start the main application
        require('./src/index.js');

    } catch (error) {
        log(`\n[FATAL] Startup failed: ${error.message}`, colors.red);
        process.exit(1);
    }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
    log('\n[INFO] Received SIGINT, shutting down gracefully...', colors.yellow);
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('\n[INFO] Received SIGTERM, shutting down gracefully...', colors.yellow);
    process.exit(0);
});

main();
