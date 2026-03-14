#!/usr/bin/env node

/**
 * QuestCord Stop Script
 * This script gracefully stops the QuestCord application
 * by finding and terminating all related Node.js processes
 */

const { exec } = require('child_process');
const os = require('os');

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

function executeCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error && !stdout) {
                reject(error);
            } else {
                resolve(stdout);
            }
        });
    });
}

async function stopWindows() {
    try {
        log('[INFO] Searching for QuestCord processes...', colors.yellow);

        // Find Node processes related to QuestCord
        const tasklistOutput = await executeCommand('tasklist /FI "IMAGENAME eq node.exe" /FO CSV');

        if (!tasklistOutput.includes('node.exe')) {
            log('[INFO] No Node.js processes found running', colors.yellow);
            return;
        }

        // Get all Node processes and filter for QuestCord-related ones (bot and webserver)
        const wmicOutput = await executeCommand('wmic process where "name=\'node.exe\'" get processid,commandline /format:csv');
        const lines = wmicOutput.split('\n').filter(line =>
            line.includes('QuestCord') ||
            line.includes('start.js') ||
            line.includes('src\\index.js') ||
            line.includes('src/index.js') ||
            line.includes('src\\web\\server.js') ||
            line.includes('src/web/server.js') ||
            line.includes('src\\bot') ||
            line.includes('src/bot')
        );

        if (lines.length === 0) {
            log('[INFO] No QuestCord processes found running', colors.yellow);
            return;
        }

        log(`[INFO] Found ${lines.length} QuestCord process(es)`, colors.blue);

        // Extract PIDs and kill processes
        let killedCount = 0;
        for (const line of lines) {
            const match = line.match(/,(\d+)$/);
            if (match) {
                const pid = match[1];
                try {
                    await executeCommand(`taskkill /PID ${pid} /F`);
                    log(`[SUCCESS] Stopped process (PID: ${pid})`, colors.green);
                    killedCount++;
                } catch (err) {
                    log(`[WARNING] Failed to stop process (PID: ${pid})`, colors.yellow);
                }
            }
        }

        if (killedCount > 0) {
            log(`\n[SUCCESS] Stopped ${killedCount} QuestCord process(es)`, colors.green);
        }

    } catch (error) {
        log('[ERROR] Error stopping processes: ' + error.message, colors.red);
    }
}

async function stopUnix() {
    try {
        log('[INFO] Searching for QuestCord processes...', colors.yellow);

        // Find Node processes related to QuestCord (bot and webserver)
        const psOutput = await executeCommand('ps aux | grep -E "(start\\.js|QuestCord|src/index\\.js|src/web/server\\.js|src/bot)" | grep -v grep');

        if (!psOutput.trim()) {
            log('[INFO] No QuestCord processes found running', colors.yellow);
            return;
        }

        const lines = psOutput.trim().split('\n');
        log(`[INFO] Found ${lines.length} QuestCord process(es)`, colors.blue);

        // Extract PIDs and kill processes
        let killedCount = 0;
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];

            if (pid) {
                try {
                    await executeCommand(`kill -15 ${pid}`); // SIGTERM for graceful shutdown
                    log(`[SUCCESS] Sent shutdown signal to process (PID: ${pid})`, colors.green);
                    killedCount++;
                } catch (err) {
                    // Try force kill if graceful fails
                    try {
                        await executeCommand(`kill -9 ${pid}`);
                        log(`[SUCCESS] Force stopped process (PID: ${pid})`, colors.green);
                        killedCount++;
                    } catch (err2) {
                        log(`[WARNING] Failed to stop process (PID: ${pid})`, colors.yellow);
                    }
                }
            }
        }

        if (killedCount > 0) {
            log(`\n[SUCCESS] Stopped ${killedCount} QuestCord process(es)`, colors.green);
        }

    } catch (error) {
        if (error.message.includes('Command failed')) {
            log('[INFO] No QuestCord processes found running', colors.yellow);
        } else {
            log('[ERROR] Error stopping processes: ' + error.message, colors.red);
        }
    }
}

async function main() {
    log(`
╔═══════════════════════════════════════════════════╗
║           QuestCord v3 Stop Script                ║
╚═══════════════════════════════════════════════════╝
    `, colors.bright + colors.blue);

    const platform = os.platform();

    try {
        if (platform === 'win32') {
            await stopWindows();
        } else {
            await stopUnix();
        }

        log('\n[INFO] Shutdown complete', colors.green);
        process.exit(0);

    } catch (error) {
        log(`\n[FATAL] Stop script failed: ${error.message}`, colors.red);
        process.exit(1);
    }
}

main();
