/* ─── StreamerBot Plugin ─── */
// Requires StreamerBot with HTTP Server enabled (default: http://localhost:7474)
// StreamerBot: https://streamer.bot

let _sbCache = { actions: [], fetchedAt: 0 };
let _sbConnected = false;

async function _sbFetch(method, path, body, host, port) {
    const base = `http://${host || 'localhost'}:${port || 7474}`;
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(base + path, opts);
    if (!r.ok) throw new Error('StreamerBot error ' + r.status);
    return r.json().catch(() => null);
}

CubDeck.registerPlugin({
    id: 'streamerbot',
    name: 'StreamerBot',
    icon: '🤖',
    actions: [
        {
            id: 'run-action',
            name: 'Run Action',
            settings: [
                { key: 'sb_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'sb_port', label: 'Port', type: 'text', placeholder: '7474' },
                { key: 'action_name', label: 'Action name', type: 'text', placeholder: 'My Action' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.action_name) throw new Error('Action name required');
                    // Try to find action by name first
                    let data;
                    try {
                        data = await _sbFetch('GET', '/', null, s.sb_host, s.sb_port);
                        _sbConnected = true;
                    } catch(e) {
                        throw new Error('Cannot reach StreamerBot at ' + (s.sb_host || 'localhost') + ':' + (s.sb_port || 7474));
                    }
                    // DoAction by name
                    const result = await _sbFetch('POST', '/DoAction', {
                        action: { name: s.action_name }
                    }, s.sb_host, s.sb_port);
                    if (result && result.status === 'ok') {
                        ctx.showToast('Action ran: ' + s.action_name, 'success');
                    } else {
                        throw new Error('Action not found or failed: ' + s.action_name);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'run-action-id',
            name: 'Run Action by ID',
            settings: [
                { key: 'sb_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'sb_port', label: 'Port', type: 'text', placeholder: '7474' },
                { key: 'action_id', label: 'Action ID (GUID)', type: 'text', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.action_id) throw new Error('Action ID required');
                    const result = await _sbFetch('POST', '/DoAction', {
                        action: { id: s.action_id }
                    }, s.sb_host, s.sb_port);
                    if (result && result.status === 'ok') {
                        ctx.showToast('Action triggered', 'success');
                    } else {
                        throw new Error('Action failed');
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'check-connection',
            name: 'Check Connection',
            settings: [
                { key: 'sb_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'sb_port', label: 'Port', type: 'text', placeholder: '7474' }
            ],
            getState(s, ctx) {
                return {
                    label: _sbConnected ? 'SB Connected' : 'Check StreamerBot',
                    icon: '🤖',
                    color: _sbConnected ? '#16a34a' : '#374151',
                    active: _sbConnected
                };
            },
            async execute(s, ctx) {
                try {
                    const data = await _sbFetch('GET', '/', null, s.sb_host, s.sb_port);
                    _sbConnected = true;
                    ctx.showToast('StreamerBot connected: v' + (data?.version || '?'), 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    _sbConnected = false;
                    ctx.showToast('Cannot connect to StreamerBot', 'error');
                    ctx.refreshAllButtons();
                }
            }
        },
        {
            id: 'send-twitch-message',
            name: 'Send Twitch Message via SB',
            settings: [
                { key: 'sb_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'sb_port', label: 'Port', type: 'text', placeholder: '7474' },
                { key: 'message', label: 'Message', type: 'textarea', placeholder: 'Hello from StreamerBot!' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.message) throw new Error('Message required');
                    // Use StreamerBot's SendMessage action
                    const result = await _sbFetch('POST', '/SendMessage', {
                        message: s.message,
                        bot: false
                    }, s.sb_host, s.sb_port);
                    if (result && result.status === 'ok') {
                        ctx.showToast('Message sent via StreamerBot', 'success');
                    } else {
                        throw new Error('Failed to send message');
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'global-variable',
            name: 'Set Global Variable',
            settings: [
                { key: 'sb_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'sb_port', label: 'Port', type: 'text', placeholder: '7474' },
                { key: 'var_name', label: 'Variable name', type: 'text', placeholder: 'myVar' },
                { key: 'var_value', label: 'Value', type: 'text', placeholder: 'hello' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.var_name) throw new Error('Variable name required');
                    await _sbFetch('POST', '/Global', {
                        variableName: s.var_name,
                        value: s.var_value || '',
                        persisted: false
                    }, s.sb_host, s.sb_port);
                    ctx.showToast(`SB var ${s.var_name} = ${s.var_value}`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
