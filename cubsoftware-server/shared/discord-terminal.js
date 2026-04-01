/**
 * Discord Terminal - Shared terminal system for all CUB SOFTWARE Discord bots
 *
 * Options:
 *   channelId       - terminal commands channel (all bots share one channel)
 *   eventsChannelId - startup / crash / event notifications channel
 *   ownerIds        - array of Discord user IDs that are always allowed
 *   botName         - display name used in embeds and footers
 *   autoClear       - clear terminal channel hourly (set false for secondary bots)
 *
 * Terminal access:
 *   Extra users can be granted access without being in ownerIds via >access.
 *   They are stored in  cubsoftware-server/data/terminal-users.json.
 *
 * Events channel:
 *   Call terminal.logEvent(msg, type) for startup / crash / restart notifications.
 *   call terminal.log(msg, type)      for inline terminal status messages.
 */

const { exec }  = require('child_process');
const util      = require('util');
const path      = require('path');
const fs        = require('fs');
const execPromise = util.promisify(exec);

const COLORS = { info: 0x3b82f6, success: 0x22c55e, warn: 0xf59e0b, error: 0xef4444, terminal: 0x5865f2 };

// All known bot target slugs — used so a bot can silently ignore commands aimed at another bot.
// Keep in sync with the botId/aliases set on each terminal instance.
const ALL_BOT_IDS = new Set([
    'cubprotector', 'cubprotect', 'cp', 'cub',
    'questcord', 'quest', 'qc',
    'cleanmebot', 'cleanme', 'cm',
    'onionbot', 'onion', 'ob', 'solibot',
]);
const ICONS  = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌' };
const EVENT_TITLES = { info: '📋 Info', success: '✅ Online', warn: '⚠️ Warning', error: '❌ Error' };

const TERMINAL_USERS_FILE = path.join(__dirname, '..', 'data', 'terminal-users.json');
const BACKUP_SCRIPT = path.join(__dirname, '..', 'git-auto-push.sh');

class DiscordTerminal {
    constructor(client, options = {}) {
        this.client          = client;
        this.prefix          = options.prefix || '>';
        this.ownerIds        = options.ownerIds || [];
        this.channelId       = options.channelId || '';
        this.eventsChannelId = options.eventsChannelId || '';
        this.botName         = options.botName || 'Bot';
        this.botId           = (options.botId || this._deriveBotId(this.botName)).toLowerCase();
        this.aliases         = (options.aliases || []).map(a => a.toLowerCase());
        this.autoClear       = options.autoClear !== false;
        this.systemCommands  = options.systemCommands !== false; // false = only help + ping

        // Load persisted terminal-user whitelist
        this._terminalUsers = this._loadTerminalUsers();

        this.commands = new Map();
        this._registerBuiltInCommands();
    }

    // ── Init ──────────────────────────────────────────────────────────────────
    init() {
        this.client.on('messageCreate', (message) => this._handleMessage(message));
        console.log(`[${this.botName}] Terminal ready — terminal: ${this.channelId} | events: ${this.eventsChannelId || 'none'}`);
        this.logEvent(`**${this.botName}** is online and ready`, 'success');
        if (this.channelId && this.autoClear) this._scheduleHourlyClear();
    }

    // ── Bot targeting ─────────────────────────────────────────────────────────
    _deriveBotId(name) {
        return name.toLowerCase().replace(/[^a-z0-9]/g, '');
    }

    _matchesThisBot(target) {
        const t = target.toLowerCase();
        return t === this.botId || this.aliases.includes(t);
    }

    // ── Access control ────────────────────────────────────────────────────────
    isOwner(userId) {
        return this.ownerIds.includes(userId) || this._terminalUsers.has(userId);
    }

    _loadTerminalUsers() {
        try {
            if (fs.existsSync(TERMINAL_USERS_FILE)) {
                const data = JSON.parse(fs.readFileSync(TERMINAL_USERS_FILE, 'utf8'));
                return new Set(Array.isArray(data) ? data : []);
            }
        } catch (_) {}
        return new Set();
    }

    _saveTerminalUsers() {
        try {
            fs.mkdirSync(path.dirname(TERMINAL_USERS_FILE), { recursive: true });
            fs.writeFileSync(TERMINAL_USERS_FILE, JSON.stringify([...this._terminalUsers], null, 2));
        } catch (err) {
            console.error(`[${this.botName}] Failed to save terminal users:`, err.message);
        }
    }

    // ── Logging ───────────────────────────────────────────────────────────────

    /** Send to terminal channel (command output, inline status) */
    async log(message, type = 'info') {
        if (!this.channelId) return;
        try {
            const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
            if (channel) await channel.send({ embeds: [this._buildLogEmbed(message, type)] });
        } catch (err) { console.error(`[${this.botName}] log() failed:`, err.message); }
    }

    /** Send to events channel (startup, crashes, restarts, alerts) */
    async logEvent(message, type = 'info') {
        const targetId = this.eventsChannelId || this.channelId;
        if (!targetId) return;
        try {
            const channel = await this.client.channels.fetch(targetId).catch(() => null);
            if (channel) await channel.send({ embeds: [this._buildEventEmbed(message, type)] });
        } catch (err) { console.error(`[${this.botName}] logEvent() failed:`, err.message); }
    }

    // ── Embed builders ────────────────────────────────────────────────────────

    _buildLogEmbed(description, type = 'info') {
        return {
            color: COLORS[type] || COLORS.info,
            description: `${ICONS[type] || ''} ${description}`,
            footer: { text: this.botName },
            timestamp: new Date().toISOString()
        };
    }

    _buildEventEmbed(description, type = 'info') {
        return {
            color: COLORS[type] || COLORS.info,
            title: EVENT_TITLES[type] || '📋 Event',
            description,
            footer: { text: this.botName },
            timestamp: new Date().toISOString()
        };
    }

    _responseEmbed(description, cmdName) {
        return {
            color: COLORS.terminal,
            description: description.length > 4000 ? description.substring(0, 4000) + '\n...' : description,
            footer: { text: `${this.botName} • ${this.prefix}${cmdName} ${this.botId}` },
            timestamp: new Date().toISOString()
        };
    }

    // ── Channel helpers ───────────────────────────────────────────────────────

    addCommand(name, command)   { this.commands.set(name.toLowerCase(), command); }
    removeCommand(name)         { this.commands.delete(name.toLowerCase()); }
    setChannel(channelId)       { this.channelId = channelId; }

    _scheduleHourlyClear() {
        const now = new Date();
        const next = new Date(now);
        next.setHours(next.getHours() + 1, 0, 0, 0);
        setTimeout(() => {
            this._clearChannel();
            setInterval(() => this._clearChannel(), 60 * 60 * 1000);
        }, next.getTime() - now.getTime());
        console.log(`[${this.botName}] Terminal clears at ${next.toLocaleTimeString()} and every hour`);
    }

    async _clearChannel() {
        if (!this.channelId) return;
        try {
            const channel = await this.client.channels.fetch(this.channelId).catch(() => null);
            if (!channel) return;
            let deleted, total = 0;
            do { deleted = await channel.bulkDelete(100, true).catch(() => ({ size: 0 })); total += deleted.size; }
            while (deleted.size > 0 && total < 500);
            console.log(`[${this.botName}] Terminal cleared: ${total} messages`);
            await this.log(`Terminal cleared (${total} messages) — **${this.botName}** ready`, 'success');
        } catch (err) { console.error(`[${this.botName}] Clear failed:`, err.message); }
    }

    // ── Backup helper (used by restart/stop/deploy) ───────────────────────────
    async _runBackup() {
        try {
            const { stdout, stderr } = await execPromise(`bash "${BACKUP_SCRIPT}"`, { timeout: 90000 });
            return (stdout + (stderr ? '\n' + stderr : '')).trim() || 'Done.';
        } catch (err) {
            return `Backup error: ${err.message}`;
        }
    }

    // ── Message handler ───────────────────────────────────────────────────────
    async _handleMessage(message) {
        if (message.author.bot) return;

        const isTerminalChannel = message.channel.id === this.channelId;
        const isOwnerDM = message.channel.type === 1 && this.isOwner(message.author.id);
        if (!isTerminalChannel && !isOwnerDM) return;

        if (isTerminalChannel) {
            if (!message.content.startsWith(this.prefix)) {
                await message.delete().catch(() => {});
                return;
            }
            if (!this.isOwner(message.author.id)) {
                await message.delete().catch(() => {});
                const reply = await message.channel.send({ embeds: [this._buildLogEmbed('You are not authorised to use the terminal.', 'error')] });
                setTimeout(() => reply.delete().catch(() => {}), 3000);
                return;
            }
        } else if (!this.isOwner(message.author.id)) {
            return message.reply({ embeds: [this._buildLogEmbed('You are not authorised to use the terminal.', 'error')] });
        }

        if (!message.content.startsWith(this.prefix)) return;
        const input = message.content.slice(this.prefix.length).trim();
        if (!input) return;

        const parts = input.split(/\s+/);
        const commandName = parts[0];
        let args = parts.slice(1);

        // Bot targeting: >command <botname> [args]
        // If the first arg is a known bot slug, only respond if it matches this bot.
        if (args.length > 0 && ALL_BOT_IDS.has(args[0].toLowerCase())) {
            if (!this._matchesThisBot(args[0])) return;
            args = args.slice(1); // strip the bot target before passing to command
        }

        const command = this.commands.get(commandName.toLowerCase());

        if (!command) {
            // Secondary bots (systemCommands: false) silently ignore unknown commands
            // so only the bot that actually has the command replies
            if (!this.systemCommands) return;
            return message.reply({ embeds: [this._buildLogEmbed(`Unknown command: \`${commandName}\`. Use \`${this.prefix}help\` to see all commands.`, 'error')] });
        }

        await message.channel.sendTyping().catch(() => {});

        try {
            const result = await command.execute(args, message, this);
            if (result === null || result === undefined) return;
            await message.channel.send({ embeds: [this._responseEmbed(result, commandName)] });
        } catch (error) {
            console.error(`[${this.botName}] Terminal error in >${commandName}:`, error);
            await message.reply({ embeds: [this._buildLogEmbed(`Error in \`>${commandName}\`:\n\`\`\`${error.message}\`\`\``, 'error')] });
        }
    }

    // ── Built-in commands ─────────────────────────────────────────────────────
    _registerBuiltInCommands() {
        const self = this;

        // ── help ──────────────────────────────────────────────────────────────
        this.addCommand('help', {
            description: 'Show all available commands',
            usage: 'help',
            category: 'terminal',
            execute: async (args, message) => {
                const sections = {
                    system:   { label: '⚙️ System',         cmds: [] },
                    git:      { label: '📤 Git & Backup',    cmds: [] },
                    info:     { label: '📊 Info',            cmds: [] },
                    logs:     { label: '📋 Logs',            cmds: [] },
                    access:   { label: '🔑 Access Control',  cmds: [] },
                    terminal: { label: '⌨️ Terminal',        cmds: [] },
                    custom:   { label: '🔧 Custom',          cmds: [] },
                };

                for (const [name, cmd] of self.commands) {
                    if (name === 'help') continue;
                    const cat = cmd.category || 'custom';
                    const section = sections[cat] || sections.custom;
                    section.cmds.push(`\`${self.prefix}${cmd.usage || name}\` — ${cmd.description}`);
                }

                const fields = Object.values(sections)
                    .filter(s => s.cmds.length > 0)
                    .map(s => ({ name: s.label, value: s.cmds.join('\n'), inline: false }));

                await message.channel.send({ embeds: [{
                    color: COLORS.terminal,
                    title: `🖥️ ${self.botName} Terminal`,
                    description: `All commands use the \`${self.prefix}\` prefix.\nTarget this bot specifically: \`${self.prefix}<command> ${self.botId}\`\nAuthorised owners and whitelisted users only.\nCustom bot processes appear automatically in \`${self.prefix}status\`.`,
                    fields,
                    footer: { text: `${self.botName} • ${self.prefix}help` },
                    timestamp: new Date().toISOString()
                }]});
                return null;
            }
        });

        if (!this.systemCommands) return; // secondary bots only get help + ping

        // ── status ────────────────────────────────────────────────────────────
        this.addCommand('status', {
            description: 'Show all PM2 processes (bots, website, custom bots)',
            usage: 'status',
            category: 'system',
            execute: async () => {
                const { stdout } = await execPromise('pm2 jlist');
                const processes = JSON.parse(stdout);

                let text = '**PM2 Processes**\n```\n';
                text += 'NAME                 STATUS     CPU    MEMORY   RESTARTS\n';
                text += '─'.repeat(58) + '\n';

                for (const proc of processes) {
                    const name     = proc.name.substring(0, 20).padEnd(20);
                    const status   = (proc.pm2_env?.status || '?').padEnd(10);
                    const cpu      = ((proc.monit?.cpu || 0).toFixed(1) + '%').padEnd(6);
                    const mem      = formatBytes(proc.monit?.memory || 0).padEnd(8);
                    const restarts = String(proc.pm2_env?.restart_time || 0);
                    text += `${name} ${status} ${cpu} ${mem} ${restarts}\n`;
                }
                text += '```';
                return text;
            }
        });

        // ── restart ───────────────────────────────────────────────────────────
        this.addCommand('restart', {
            description: 'Backup to GitHub then restart a PM2 process',
            usage: 'restart <name|all>',
            category: 'system',
            execute: async (args) => {
                if (!args[0]) return `Usage: \`${self.prefix}restart <name|all>\``;
                const backupOut = await self._runBackup();
                await execPromise(`pm2 restart ${args[0]}`);
                return `📤 **Backup before restart:**\n\`\`\`\n${backupOut}\n\`\`\`\n🔄 Restarted **${args[0]}**`;
            }
        });

        // ── stop ──────────────────────────────────────────────────────────────
        this.addCommand('stop', {
            description: 'Backup to GitHub then stop a PM2 process',
            usage: 'stop <name>',
            category: 'system',
            execute: async (args) => {
                if (!args[0]) return `Usage: \`${self.prefix}stop <name>\``;
                const backupOut = await self._runBackup();
                await execPromise(`pm2 stop ${args[0]}`);
                return `📤 **Backup before stop:**\n\`\`\`\n${backupOut}\n\`\`\`\n🛑 Stopped **${args[0]}**`;
            }
        });

        // ── start ─────────────────────────────────────────────────────────────
        this.addCommand('start', {
            description: 'Start a stopped PM2 process',
            usage: 'start <name>',
            category: 'system',
            execute: async (args) => {
                if (!args[0]) return `Usage: \`${self.prefix}start <name>\``;
                await execPromise(`pm2 start ${args[0]}`);
                return `▶️ Started **${args[0]}**`;
            }
        });

        // ── deploy ────────────────────────────────────────────────────────────
        this.addCommand('deploy', {
            description: 'Backup, git pull, then restart this bot',
            usage: 'deploy',
            category: 'system',
            execute: async () => {
                const backupOut = await self._runBackup();
                const { stdout } = await execPromise('cd ~/cubsoftware && git pull');
                const botProcess = self.botName.toLowerCase().replace(/\s+/g, '-');
                await execPromise(`pm2 restart ${botProcess}`);
                return `📤 **Backup:**\n\`\`\`\n${backupOut}\n\`\`\`\n📥 **Pull:**\n\`\`\`${stdout || 'Already up to date.'}\`\`\`\n🔄 Restarting **${self.botName}**...`;
            }
        });

        // ── restartall ────────────────────────────────────────────────────────
        this.addCommand('restartall', {
            description: 'Backup then restart every PM2 process',
            usage: 'restartall',
            category: 'system',
            execute: async () => {
                const backupOut = await self._runBackup();
                await execPromise('pm2 restart all');
                return `📤 **Backup:**\n\`\`\`\n${backupOut}\n\`\`\`\n🔄 Restarted **all** processes`;
            }
        });

        // ── logs ──────────────────────────────────────────────────────────────
        this.addCommand('logs', {
            description: 'Show recent PM2 logs for a process',
            usage: 'logs [name] [lines]',
            category: 'logs',
            execute: async (args) => {
                const target = args[0] || self.botName.toLowerCase().replace(/\s+/g, '-');
                const lines  = parseInt(args[1]) || 20;
                const { stdout } = await execPromise(`pm2 logs ${target} --nostream --lines ${lines}`);
                const out = stdout.length > 3800 ? stdout.substring(0, 3800) + '\n...' : stdout;
                return `📋 **Logs** (${target}, last ${lines} lines)\n\`\`\`\n${out || 'No logs'}\n\`\`\``;
            }
        });

        // ── pull ──────────────────────────────────────────────────────────────
        this.addCommand('pull', {
            description: 'Git pull latest code from GitHub',
            usage: 'pull',
            category: 'git',
            execute: async () => {
                const { stdout } = await execPromise('cd ~/cubsoftware && git pull');
                return `📥 **Git Pull**\n\`\`\`${stdout || 'Already up to date.'}\`\`\``;
            }
        });

        // ── backup ────────────────────────────────────────────────────────────
        this.addCommand('backup', {
            description: 'Push VPS data/image changes to GitHub now',
            usage: 'backup',
            category: 'git',
            execute: async () => {
                const out = await self._runBackup();
                return `📤 **Backup**\n\`\`\`\n${out}\n\`\`\``;
            }
        });

        // ── uptime ────────────────────────────────────────────────────────────
        this.addCommand('uptime', {
            description: 'System uptime',
            usage: 'uptime',
            category: 'info',
            execute: async () => {
                const { stdout } = await execPromise('uptime');
                return `⏱️ **Uptime**\n\`\`\`${stdout.trim()}\`\`\``;
            }
        });

        // ── memory ────────────────────────────────────────────────────────────
        this.addCommand('memory', {
            description: 'System memory usage',
            usage: 'memory',
            category: 'info',
            execute: async () => {
                const { stdout } = await execPromise('free -h');
                return `🧠 **Memory**\n\`\`\`${stdout}\`\`\``;
            }
        });

        // ── disk ──────────────────────────────────────────────────────────────
        this.addCommand('disk', {
            description: 'Disk usage',
            usage: 'disk',
            category: 'info',
            execute: async () => {
                const { stdout } = await execPromise('df -h /');
                return `💾 **Disk**\n\`\`\`${stdout}\`\`\``;
            }
        });

        // ── ping ──────────────────────────────────────────────────────────────
        this.addCommand('ping', {
            description: 'Bot WebSocket latency',
            usage: 'ping',
            category: 'info',
            execute: async () => `🏓 **${self.botName}** — ${self.client.ws.ping}ms`
        });

        // ── access ────────────────────────────────────────────────────────────
        this.addCommand('access', {
            description: 'Manage terminal access — add/remove/list allowed users',
            usage: 'access <add|remove|list> [userId]',
            category: 'access',
            execute: async (args) => {
                const action = args[0]?.toLowerCase();
                const userId = args[1];

                if (action === 'list') {
                    const owners = self.ownerIds.map(id => `\`${id}\` — owner (permanent)`);
                    const extra  = [...self._terminalUsers].map(id => `\`${id}\` — whitelisted`);
                    const lines  = [...owners, ...extra];
                    return `**Terminal Access List**\n${lines.join('\n') || 'No users'}`;
                }

                if (!userId) return `Usage: \`${self.prefix}access <add|remove|list> [userId]\``;

                if (action === 'add') {
                    if (self.ownerIds.includes(userId)) return `⚠️ \`${userId}\` is already a permanent owner.`;
                    self._terminalUsers.add(userId);
                    self._saveTerminalUsers();
                    return `✅ Added \`${userId}\` to terminal access list.`;
                }

                if (action === 'remove') {
                    if (self.ownerIds.includes(userId)) return `❌ Cannot remove a permanent owner. Edit ownerIds in the environment instead.`;
                    if (!self._terminalUsers.has(userId)) return `⚠️ \`${userId}\` is not in the whitelist.`;
                    self._terminalUsers.delete(userId);
                    self._saveTerminalUsers();
                    return `🗑️ Removed \`${userId}\` from terminal access list.`;
                }

                return `Usage: \`${self.prefix}access <add|remove|list> [userId]\``;
            }
        });

        // ── clear ─────────────────────────────────────────────────────────────
        this.addCommand('clear', {
            description: 'Bulk-delete messages from the terminal channel',
            usage: 'clear [count]',
            category: 'terminal',
            execute: async (args, message) => {
                const count   = Math.min(parseInt(args[0]) || 50, 100);
                const deleted = await message.channel.bulkDelete(count, true);
                const msg = await message.channel.send({ embeds: [this._buildLogEmbed(`Cleared ${deleted.size} messages`, 'success')] });
                setTimeout(() => msg.delete().catch(() => {}), 3000);
                return null;
            }
        });

        // ── clearall ──────────────────────────────────────────────────────────
        this.addCommand('clearall', {
            description: 'Clear all messages in the terminal channel',
            usage: 'clearall',
            category: 'terminal',
            execute: async () => { await self._clearChannel(); return null; }
        });

        // ── exec ──────────────────────────────────────────────────────────────
        this.addCommand('exec', {
            description: 'Run a shell command on the VPS',
            usage: 'exec <command>',
            category: 'terminal',
            execute: async (args) => {
                if (!args.length) return `Usage: \`${self.prefix}exec <command>\``;
                const command = args.join(' ');
                const blocked = ['rm -rf /', 'mkfs', 'dd if=', ':(){', 'chmod -R 777 /', 'shutdown', 'reboot'];
                if (blocked.some(b => command.includes(b))) return '❌ Command blocked for safety.';
                const { stdout, stderr } = await execPromise(command, { timeout: 30000 });
                const out = (stdout || stderr || '(no output)');
                return `\`\`\`\n${out.length > 3800 ? out.substring(0, 3800) + '\n...' : out}\n\`\`\``;
            }
        });

        // ── eval ──────────────────────────────────────────────────────────────
        this.addCommand('eval', {
            description: 'Evaluate JavaScript in the bot process',
            usage: 'eval <code>',
            category: 'terminal',
            execute: async (args) => {
                if (!args.length) return `Usage: \`${self.prefix}eval <code>\``;
                const code = args.join(' ');
                let result = eval(code); // eslint-disable-line no-eval
                if (result instanceof Promise) result = await result;
                if (typeof result !== 'string') result = util.inspect(result, { depth: 2 });
                return `\`\`\`js\n${result.length > 3800 ? result.substring(0, 3800) + '\n...' : result}\n\`\`\``;
            }
        });
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

module.exports = DiscordTerminal;
