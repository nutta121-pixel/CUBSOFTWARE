/**
 * Discord Terminal - Shared terminal system for all CUB SOFTWARE Discord bots
 *
 * Usage:
 *   const Terminal = require('../../shared/discord-terminal');
 *
 *   const terminal = new Terminal(client, {
 *       prefix: '>',
 *       ownerIds: ['378501056008683530'],
 *       channelId: '1466190584372003092',
 *       botName: 'CubSoftware Bot'
 *   });
 *
 *   // Add custom commands
 *   terminal.addCommand('mystats', {
 *       description: 'Show custom stats',
 *       usage: 'mystats',
 *       execute: async (args, message) => {
 *           return 'Custom stats here';
 *       }
 *   });
 *
 *   // In your ready event
 *   client.once('ready', () => {
 *       terminal.init();
 *   });
 */

const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

// Note: We use plain embed objects instead of EmbedBuilder to avoid requiring discord.js
// in the shared folder (which doesn't have its own node_modules)

class DiscordTerminal {
    constructor(client, options = {}) {
        this.client = client;
        this.prefix = options.prefix || '>';
        this.ownerIds = options.ownerIds || [];
        this.channelId = options.channelId || '';
        this.botName = options.botName || 'Bot';

        this.commands = new Map();
        this._registerBuiltInCommands();
    }

    init() {
        this.client.on('messageCreate', (message) => this._handleMessage(message));
        console.log(`[${this.botName}] Terminal initialized - Channel: ${this.channelId || 'DM only'}`);

        // Send startup message
        this.log(`**${this.botName}** terminal ready`, 'success');

        // Clear terminal channel on the hour (1:00, 2:00, etc.)
        if (this.channelId) {
            this._scheduleHourlyClear();
        }
    }

    _scheduleHourlyClear() {
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0); // Next hour at :00:00
        const msUntilNextHour = nextHour.getTime() - now.getTime();

        // Schedule first clear at the next hour
        setTimeout(() => {
            this._clearChannel();
            // Then repeat every hour
            setInterval(() => this._clearChannel(), 60 * 60 * 1000);
        }, msUntilNextHour);

        console.log(`[${this.botName}] Terminal will clear at ${nextHour.toLocaleTimeString()} and every hour after`);
    }

    async _clearChannel() {
        if (!this.channelId) return;

        try {
            const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
            if (!channel) return;

            let deleted;
            let totalDeleted = 0;

            // Keep deleting in batches until no more messages (max 500 to prevent infinite loop)
            do {
                deleted = await channel.bulkDelete(100, true).catch(() => ({ size: 0 }));
                totalDeleted += deleted.size;
            } while (deleted.size > 0 && totalDeleted < 500);

            console.log(`[${this.botName}] Terminal cleared: ${totalDeleted} messages`);

            // Send a fresh ready message after clearing
            await this.log(`Terminal cleared (${totalDeleted} messages) - **${this.botName}** ready`, 'success');
        } catch (err) {
            console.error(`[${this.botName}] Failed to clear terminal:`, err.message);
        }
    }

    addCommand(name, command) {
        this.commands.set(name.toLowerCase(), command);
    }

    removeCommand(name) {
        this.commands.delete(name.toLowerCase());
    }

    isOwner(userId) {
        return this.ownerIds.includes(userId);
    }

    setChannel(channelId) {
        this.channelId = channelId;
    }

    /**
     * Send a log message to the terminal channel
     */
    async log(message, type = 'info') {
        if (!this.channelId) return;

        try {
            const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
            if (!channel) return;

            const colors = {
                info: 0x3b82f6,
                success: 0x22c55e,
                warn: 0xf59e0b,
                error: 0xef4444
            };

            const icons = {
                info: 'ℹ️',
                success: '✅',
                warn: '⚠️',
                error: '❌'
            };

            const embed = {
                color: colors[type] || colors.info,
                description: `${icons[type] || ''} ${message}`,
                footer: { text: this.botName },
                timestamp: new Date().toISOString()
            };

            await channel.send({ embeds: [embed] });
        } catch (err) {
            console.error(`[${this.botName}] Failed to send log:`, err.message);
        }
    }

    async _handleMessage(message) {
        if (message.author.bot) return;

        const isTerminalChannel = message.channel.id === this.channelId;
        // ChannelType.DM = 1
        const isOwnerDM = message.channel.type === 1 && this.isOwner(message.author.id);

        if (!isTerminalChannel && !isOwnerDM) return;

        // In terminal channel, delete any message that's not a command
        if (isTerminalChannel) {
            if (!message.content.startsWith(this.prefix)) {
                // Delete non-command messages silently
                await message.delete().catch(() => {});
                return;
            }
            if (!this.isOwner(message.author.id)) {
                // Delete unauthorized messages and notify briefly
                await message.delete().catch(() => {});
                const reply = await message.channel.send('❌ You are not authorized to use the terminal.');
                setTimeout(() => reply.delete().catch(() => {}), 3000);
                return;
            }
        } else if (!this.isOwner(message.author.id)) {
            return message.reply('❌ You are not authorized to use the terminal.');
        }

        if (!message.content.startsWith(this.prefix)) return;

        const input = message.content.slice(this.prefix.length).trim();
        if (!input) return;

        const [commandName, ...args] = input.split(/\s+/);
        const command = this.commands.get(commandName.toLowerCase());

        if (!command) {
            return message.reply(`❌ Unknown command: \`${commandName}\`. Use \`${this.prefix}help\` for commands.`);
        }

        await message.channel.sendTyping();

        try {
            const result = await command.execute(args, message, this);
            if (result) {
                if (result.length > 2000) {
                    const chunks = result.match(/[\s\S]{1,1990}/g) || [];
                    for (const chunk of chunks) {
                        await message.channel.send(chunk);
                    }
                } else {
                    await message.channel.send(result);
                }
            }
        } catch (error) {
            console.error(`[${this.botName}] Terminal error:`, error);
            await message.reply(`❌ Error:\n\`\`\`${error.message}\`\`\``);
        }
    }

    _registerBuiltInCommands() {
        const self = this;

        this.addCommand('help', {
            description: 'Show all available commands',
            usage: 'help',
            execute: async (args, message) => {
                let commandList = '';
                for (const [name, cmd] of self.commands) {
                    commandList += `\`${self.prefix}${cmd.usage || name}\` - ${cmd.description}\n`;
                }

                const embed = {
                    color: 0x5865f2,
                    title: `${self.botName} Terminal`,
                    description: 'Available commands:',
                    fields: [{ name: 'Commands', value: commandList || 'No commands available' }],
                    footer: { text: `Prefix: ${self.prefix}` },
                    timestamp: new Date().toISOString()
                };

                await message.channel.send({ embeds: [embed] });
                return null;
            }
        });

        this.addCommand('status', {
            description: 'PM2 process status',
            usage: 'status',
            execute: async () => {
                const { stdout } = await execPromise('pm2 jlist');
                const processes = JSON.parse(stdout);

                let text = '**PM2 Status:**\n```\n';
                text += 'NAME                 STATUS     CPU    MEMORY\n';
                text += '─'.repeat(50) + '\n';

                for (const proc of processes) {
                    const name = proc.name.substring(0, 20).padEnd(20);
                    const status = (proc.pm2_env?.status || '?').padEnd(10);
                    const cpu = ((proc.monit?.cpu || 0).toFixed(1) + '%').padEnd(6);
                    const mem = formatBytes(proc.monit?.memory || 0);
                    text += `${name} ${status} ${cpu} ${mem}\n`;
                }
                text += '```';
                return text;
            }
        });

        this.addCommand('restart', {
            description: 'Restart PM2 process',
            usage: 'restart <name|all>',
            execute: async (args) => {
                if (!args[0]) return `❌ Usage: \`${self.prefix}restart <name|all>\``;
                await execPromise(`pm2 restart ${args[0]}`);
                return `✅ Restarted **${args[0]}**`;
            }
        });

        this.addCommand('stop', {
            description: 'Stop PM2 process',
            usage: 'stop <name>',
            execute: async (args) => {
                if (!args[0]) return `❌ Usage: \`${self.prefix}stop <name>\``;
                await execPromise(`pm2 stop ${args[0]}`);
                return `🛑 Stopped **${args[0]}**`;
            }
        });

        this.addCommand('start', {
            description: 'Start PM2 process',
            usage: 'start <name>',
            execute: async (args) => {
                if (!args[0]) return `❌ Usage: \`${self.prefix}start <name>\``;
                await execPromise(`pm2 start ${args[0]}`);
                return `▶️ Started **${args[0]}**`;
            }
        });

        this.addCommand('logs', {
            description: 'Show recent logs',
            usage: 'logs [name] [lines]',
            execute: async (args) => {
                const target = args[0] || self.botName.toLowerCase().replace(/\s+/g, '-');
                const lines = args[1] || 20;
                const { stdout } = await execPromise(`pm2 logs ${target} --nostream --lines ${lines}`);
                const truncated = stdout.length > 1800 ? stdout.substring(0, 1800) + '\n...' : stdout;
                return `📋 **Logs** (${lines} lines):\n\`\`\`\n${truncated || 'No logs'}\n\`\`\``;
            }
        });

        this.addCommand('pull', {
            description: 'Git pull',
            usage: 'pull',
            execute: async () => {
                const { stdout } = await execPromise('cd ~/cubsoftware && git pull');
                return `📥 **Git Pull:**\n\`\`\`${stdout}\`\`\``;
            }
        });

        this.addCommand('deploy', {
            description: 'Pull and restart this bot',
            usage: 'deploy',
            execute: async () => {
                const { stdout } = await execPromise('cd ~/cubsoftware && git pull');
                let output = `📥 **Pull:**\n\`\`\`${stdout}\`\`\`\n`;

                const botProcess = self.botName.toLowerCase().replace(/\s+/g, '-');
                await execPromise(`pm2 restart ${botProcess}`);
                output += `🔄 Restarting **${self.botName}**...`;
                return output;
            }
        });

        this.addCommand('exec', {
            description: 'Run shell command',
            usage: 'exec <command>',
            execute: async (args) => {
                if (!args.length) return `❌ Usage: \`${self.prefix}exec <command>\``;
                const command = args.join(' ');

                const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'chmod -R 777 /', 'shutdown', 'reboot'];
                if (blocked.some(b => command.includes(b))) {
                    return '❌ Blocked for safety.';
                }

                const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
                const output = stdout || stderr || '(no output)';
                const truncated = output.length > 1800 ? output.substring(0, 1800) + '\n...' : output;
                return `\`\`\`\n${truncated}\n\`\`\``;
            }
        });

        this.addCommand('uptime', {
            description: 'System uptime',
            usage: 'uptime',
            execute: async () => {
                const { stdout } = await execPromise('uptime');
                return `⏱️ \`\`\`${stdout}\`\`\``;
            }
        });

        this.addCommand('memory', {
            description: 'Memory usage',
            usage: 'memory',
            execute: async () => {
                const { stdout } = await execPromise('free -h');
                return `🧠 \`\`\`${stdout}\`\`\``;
            }
        });

        this.addCommand('disk', {
            description: 'Disk usage',
            usage: 'disk',
            execute: async () => {
                const { stdout } = await execPromise('df -h /');
                return `💾 \`\`\`${stdout}\`\`\``;
            }
        });

        this.addCommand('ping', {
            description: 'Bot latency',
            usage: 'ping',
            execute: async () => {
                return `🏓 Pong! ${self.client.ws.ping}ms`;
            }
        });

        this.addCommand('clear', {
            description: 'Clear messages',
            usage: 'clear [count]',
            execute: async (args, message) => {
                const count = Math.min(parseInt(args[0]) || 50, 100);
                const deleted = await message.channel.bulkDelete(count, true);
                const msg = await message.channel.send(`🗑️ Cleared ${deleted.size} messages`);
                setTimeout(() => msg.delete().catch(() => {}), 3000);
                return null;
            }
        });

        this.addCommand('clearall', {
            description: 'Clear all messages in terminal',
            usage: 'clearall',
            execute: async (args, message) => {
                await self._clearChannel();
                return null;
            }
        });

        this.addCommand('eval', {
            description: 'Evaluate JS code',
            usage: 'eval <code>',
            execute: async (args) => {
                if (!args.length) return `❌ Usage: \`${self.prefix}eval <code>\``;
                const code = args.join(' ');
                let result = eval(code);
                if (result instanceof Promise) result = await result;
                if (typeof result !== 'string') result = util.inspect(result, { depth: 2 });
                const truncated = result.length > 1800 ? result.substring(0, 1800) + '\n...' : result;
                return `\`\`\`js\n${truncated}\n\`\`\``;
            }
        });
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = DiscordTerminal;
