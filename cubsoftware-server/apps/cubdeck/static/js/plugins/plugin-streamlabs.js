/* ─── StreamLabs Plugin ─── */
// Uses StreamLabs Socket API + REST API
// Socket token from: streamlabs.com/dashboard#/settings/api-settings

let _slSocket = null;
let _slConnected = false;
let _slAlertQueue = [];
let _slStats = { donations: 0, totalAmount: 0, follows: 0, subs: 0 };

function _slConnect(token, ctx) {
    if (_slSocket) { try { _slSocket.close(); } catch(e) {} }
    const url = `https://sockets.streamlabs.com?token=${encodeURIComponent(token)}`;
    // StreamLabs uses socket.io — we implement the minimal handshake manually
    _slSocket = new WebSocket(url.replace('https://', 'wss://') + '&EIO=4&transport=websocket');
    _slSocket.onopen = () => {
        _slConnected = true;
        if (ctx) ctx.showToast('StreamLabs connected', 'success');
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
    };
    _slSocket.onmessage = (ev) => {
        const raw = ev.data;
        // Socket.IO framing: "42[...]" for events
        if (raw.startsWith('42')) {
            try {
                const [, eventName, data] = JSON.parse(raw.slice(2));
                if (eventName === 'event') _slHandleEvent(data);
            } catch(e) {}
        } else if (raw === '2') {
            _slSocket.send('3'); // pong
        }
    };
    _slSocket.onclose = () => {
        _slConnected = false;
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
    };
    _slSocket.onerror = () => { _slConnected = false; };
}

function _slHandleEvent(data) {
    const type = data.type;
    const msg = data.message && data.message[0];
    if (!msg) return;
    if (type === 'donation') {
        _slStats.donations++;
        _slStats.totalAmount += parseFloat(msg.amount || 0);
        _slAlertQueue.push({ type: 'donation', text: msg.name + ' donated $' + msg.amount });
    } else if (type === 'follow') {
        _slStats.follows++;
        _slAlertQueue.push({ type: 'follow', text: msg.name + ' followed' });
    } else if (type === 'subscription') {
        _slStats.subs++;
        _slAlertQueue.push({ type: 'sub', text: msg.name + ' subscribed' });
    }
    if (_slAlertQueue.length > 50) _slAlertQueue.shift();
    if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
}

CubDeck.registerPlugin({
    id: 'streamlabs',
    name: 'StreamLabs',
    icon: '⚡',
    actions: [
        {
            id: 'connect',
            name: 'Connect to StreamLabs',
            settings: [
                { key: 'socket_token', label: 'Socket Token', type: 'text', placeholder: 'Your StreamLabs socket token' }
            ],
            getState(s, ctx) {
                return {
                    label: _slConnected ? 'SL Connected' : 'Connect StreamLabs',
                    icon: '⚡',
                    color: _slConnected ? '#16a34a' : '#374151',
                    active: _slConnected
                };
            },
            async execute(s, ctx) {
                try {
                    if (!s.socket_token) throw new Error('Socket token required');
                    _slConnect(s.socket_token, ctx);
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'test-alert',
            name: 'Test Alert',
            settings: [
                { key: 'sl_token', label: 'API Token (streamlabs.com/api)', type: 'text', placeholder: 'Your SL API token' },
                { key: 'type', label: 'Alert type', type: 'select', options: [
                    { value: 'follow', label: 'Follow' },
                    { value: 'subscription', label: 'Subscription' },
                    { value: 'donation', label: 'Donation' },
                    { value: 'host', label: 'Host' },
                    { value: 'raid', label: 'Raid' },
                    { value: 'bits', label: 'Bits' }
                ], default: 'follow' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sl_token) throw new Error('API token required');
                    const r = await fetch('https://streamlabs.com/api/v2.0/alerts/send_test_alert', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ access_token: s.sl_token, type: s.type || 'follow' })
                    });
                    const d = await r.json();
                    if (d.success || d.status === 'success') {
                        ctx.showToast('Test ' + (s.type || 'follow') + ' alert sent', 'success');
                    } else {
                        throw new Error(d.message || 'API error');
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'skip-alert',
            name: 'Skip Next Alert',
            settings: [
                { key: 'sl_token', label: 'API Token', type: 'text', placeholder: 'Your SL API token' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sl_token) throw new Error('API token required');
                    const r = await fetch('https://streamlabs.com/api/v2.0/alerts/skip', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ access_token: s.sl_token })
                    });
                    ctx.showToast('Alert skipped', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'mute-alerts',
            name: 'Toggle Alert Mute',
            settings: [
                { key: 'sl_token', label: 'API Token', type: 'text', placeholder: 'Your SL API token' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sl_token) throw new Error('API token required');
                    const r = await fetch('https://streamlabs.com/api/v2.0/alerts/mute_volume', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ access_token: s.sl_token })
                    });
                    ctx.showToast('Alerts muted/unmuted', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'donation-counter',
            name: 'Donation Counter',
            settings: [],
            getState(s, ctx) {
                return {
                    label: `$${_slStats.totalAmount.toFixed(2)} (${_slStats.donations})`,
                    icon: '💰',
                    color: _slStats.donations > 0 ? '#eab308' : '#374151'
                };
            },
            async execute(s, ctx) {
                ctx.showToast(`${_slStats.donations} donations totalling $${_slStats.totalAmount.toFixed(2)}`, 'info');
            }
        },
        {
            id: 'last-alert',
            name: 'Last Alert Display',
            settings: [],
            getState(s, ctx) {
                const last = _slAlertQueue[_slAlertQueue.length - 1];
                return {
                    label: last ? last.text : 'No alerts yet',
                    icon: '⚡',
                    color: last ? '#9147ff' : '#374151'
                };
            },
            async execute(s, ctx) {
                const last = _slAlertQueue[_slAlertQueue.length - 1];
                ctx.showToast(last ? last.text : 'No alerts yet', 'info');
            }
        },
        {
            id: 'reset-stats',
            name: 'Reset StreamLabs Stats',
            settings: [],
            async execute(s, ctx) {
                _slStats = { donations: 0, totalAmount: 0, follows: 0, subs: 0 };
                _slAlertQueue = [];
                ctx.showToast('StreamLabs stats reset', 'success');
                ctx.refreshAllButtons();
            }
        }
    ]
});
