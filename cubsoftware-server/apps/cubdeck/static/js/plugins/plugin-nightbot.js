/* ─── Nightbot Plugin ─── */
// Nightbot is a popular chat bot for Twitch, YouTube and Trovo
// API token: https://nightbot.tv/account → Application → OAuth
// Docs: https://api-docs.nightbot.tv/

CubDeck.registerPlugin({
    id: 'nightbot',
    name: 'Nightbot',
    icon: '🤖',
    actions: [
        {
            id: 'send-message',
            name: 'Send Chat Message via Nightbot',
            settings: [
                { key: 'token', label: 'OAuth Token', type: 'text', placeholder: 'Bearer token from nightbot.tv' },
                { key: 'message', label: 'Message', type: 'textarea', placeholder: '!commands — check out my bot commands!' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token || !s.message) throw new Error('Token and message required');
                    const r = await fetch('https://api.nightbot.tv/1/channel/send', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + s.token.replace(/^Bearer\s+/i, ''),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'message=' + encodeURIComponent(s.message)
                    });
                    if (r.status === 200 || r.ok) {
                        ctx.showToast('Nightbot message sent', 'success');
                    } else {
                        throw new Error('HTTP ' + r.status);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'add-command',
            name: 'Add Chat Command',
            settings: [
                { key: 'token', label: 'OAuth Token', type: 'text', placeholder: 'Bearer token' },
                { key: 'name', label: 'Command name', type: 'text', placeholder: '!discord' },
                { key: 'message', label: 'Response message', type: 'textarea', placeholder: 'Join our Discord at discord.gg/...' },
                { key: 'cooldown', label: 'Cooldown (seconds)', type: 'text', placeholder: '30' },
                { key: 'userlevel', label: 'User level', type: 'select', options: [
                    { value: 'everyone', label: 'Everyone' },
                    { value: 'subscriber', label: 'Subscribers' },
                    { value: 'regular', label: 'Regulars' },
                    { value: 'moderator', label: 'Moderators' },
                    { value: 'owner', label: 'Owner only' }
                ], default: 'everyone' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token || !s.name || !s.message) throw new Error('Token, name and message required');
                    const body = new URLSearchParams({
                        name: s.name.startsWith('!') ? s.name : '!' + s.name,
                        message: s.message,
                        coolDown: s.cooldown || '30',
                        userLevel: s.userlevel || 'everyone'
                    });
                    const r = await fetch('https://api.nightbot.tv/1/commands', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + s.token.replace(/^Bearer\s+/i, ''),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: body.toString()
                    });
                    if (r.ok) {
                        ctx.showToast('Command added: ' + s.name, 'success');
                    } else {
                        const err = await r.json().catch(() => ({}));
                        throw new Error(err.message || 'HTTP ' + r.status);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'enable-command',
            name: 'Enable Command',
            settings: [
                { key: 'token', label: 'OAuth Token', type: 'text', placeholder: 'Bearer token' },
                { key: 'command_id', label: 'Command ID', type: 'text', placeholder: 'abc123' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token || !s.command_id) throw new Error('Token and command ID required');
                    const r = await fetch(`https://api.nightbot.tv/1/commands/${s.command_id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + s.token.replace(/^Bearer\s+/i, ''),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'enabled=true'
                    });
                    if (r.ok) ctx.showToast('Command enabled', 'success');
                    else throw new Error('HTTP ' + r.status);
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'disable-command',
            name: 'Disable Command',
            settings: [
                { key: 'token', label: 'OAuth Token', type: 'text', placeholder: 'Bearer token' },
                { key: 'command_id', label: 'Command ID', type: 'text', placeholder: 'abc123' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token || !s.command_id) throw new Error('Token and command ID required');
                    const r = await fetch(`https://api.nightbot.tv/1/commands/${s.command_id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + s.token.replace(/^Bearer\s+/i, ''),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'enabled=false'
                    });
                    if (r.ok) ctx.showToast('Command disabled', 'success');
                    else throw new Error('HTTP ' + r.status);
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'clear-chat',
            name: 'Clear Chat via Nightbot',
            settings: [
                { key: 'token', label: 'OAuth Token', type: 'text', placeholder: 'Bearer token' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token) throw new Error('Token required');
                    const r = await fetch('https://api.nightbot.tv/1/channel/send', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + s.token.replace(/^Bearer\s+/i, ''),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'message=' + encodeURIComponent('/clear')
                    });
                    if (r.ok) ctx.showToast('Chat cleared via Nightbot', 'success');
                    else throw new Error('HTTP ' + r.status);
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'update-timer',
            name: 'Enable/Disable Auto-Timer',
            settings: [
                { key: 'token', label: 'OAuth Token', type: 'text', placeholder: 'Bearer token' },
                { key: 'timer_id', label: 'Timer ID', type: 'text', placeholder: 'abc123' },
                { key: 'state', label: 'Action', type: 'select', options: [
                    { value: 'true', label: 'Enable' }, { value: 'false', label: 'Disable' }
                ], default: 'true' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token || !s.timer_id) throw new Error('Token and timer ID required');
                    const r = await fetch(`https://api.nightbot.tv/1/timers/${s.timer_id}`, {
                        method: 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + s.token.replace(/^Bearer\s+/i, ''),
                            'Content-Type': 'application/x-www-form-urlencoded'
                        },
                        body: 'enabled=' + (s.state || 'true')
                    });
                    if (r.ok) ctx.showToast('Timer ' + (s.state === 'true' ? 'enabled' : 'disabled'), 'success');
                    else throw new Error('HTTP ' + r.status);
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
