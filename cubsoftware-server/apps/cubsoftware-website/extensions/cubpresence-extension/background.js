// CubPresence Extension - Background Service Worker
// Handles Discord RPC WebSocket connection

let ws = null;
let authenticated = false;
let currentConfig = null;
let nonce = 0;
let pendingCallbacks = {};
let activityRefreshInterval = null;
let connectionState = 'disconnected'; // disconnected, connecting, connected

// ── Debug log ────────────────────────────────────────────────────────────────
const _dbgLog = [];
function dbg(level, msg) {
    const entry = { t: Date.now(), level, msg };
    _dbgLog.push(entry);
    if (_dbgLog.length > 100) _dbgLog.shift();
    console[level] || console.log;
    (console[level] || console.log)('[CubPresence]', msg);
}

// ── Port scan (for debug panel) ───────────────────────────────────────────────
async function scanDiscordPorts() {
    const results = [];
    const checks = [];
    for (let port = 6463; port <= 6472; port++) {
        checks.push((async (p) => {
            const t0 = Date.now();
            let open = false;
            let reason = 'timeout';
            await new Promise(resolve => {
                const timer = setTimeout(() => resolve(), 1500);
                let sock;
                try {
                    sock = new WebSocket(`ws://127.0.0.1:${p}`);
                    sock.onopen  = () => { open = true; reason = 'open'; clearTimeout(timer); try { sock.close(); } catch {} resolve(); };
                    sock.onerror = () => { reason = 'refused'; clearTimeout(timer); resolve(); };
                    sock.onclose = (e) => { clearTimeout(timer); reason = 'closed:' + e.code; resolve(); };
                } catch(e) { clearTimeout(timer); reason = e.message; resolve(); }
            });
            results.push({ port: p, open, reason, ms: Date.now() - t0 });
        })(port));
    }
    await Promise.all(checks);
    results.sort((a, b) => a.port - b.port);
    return results;
}

// Generate unique nonce for each command
function nextNonce() {
    return 'cubpresence_' + (++nonce) + '_' + Date.now();
}

// Send command to Discord RPC
function send(cmd, args) {
    return new Promise((resolve, reject) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            reject(new Error('WebSocket not connected'));
            return;
        }
        const n = nextNonce();
        pendingCallbacks[n] = { resolve, reject };
        const payload = { cmd, nonce: n };
        if (args) payload.args = args;
        ws.send(JSON.stringify(payload));

        // Timeout after 30s
        setTimeout(() => {
            if (pendingCallbacks[n]) {
                delete pendingCallbacks[n];
                reject(new Error('Command timed out'));
            }
        }, 30000);
    });
}

// Try connecting to Discord RPC on available ports
async function connect(config) {
    currentConfig = config;
    connectionState = 'connecting';
    broadcastState();

    dbg('info', 'Scanning ports 6463–6472…');
    for (let port = 6463; port <= 6472; port++) {
        try {
            dbg('info', `Trying port ${port}…`);
            await tryPort(port, config.client_id);
            return true;
        } catch (e) {
            dbg('warn', `Port ${port} failed: ${e.message}`);
        }
    }

    connectionState = 'disconnected';
    dbg('error', 'No Discord RPC port responded. On Linux: run discord-rpc-bridge.py first.');
    broadcastState('Discord not found. On Linux: run discord-rpc-bridge.py first.');
    return false;
}

// Attempt connection on a specific port
function tryPort(port, clientId) {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('Timeout'));
            try { ws.close(); } catch(e) {}
        }, 5000);

        const url = 'ws://127.0.0.1:' + port + '/?v=1&client_id=' + clientId + '&encoding=json';
        const socket = new WebSocket(url);

        socket.onopen = () => {
            dbg('info', `WebSocket open on port ${port}`);
        };

        socket.onmessage = async (event) => {
            let msg;
            try { msg = JSON.parse(event.data); } catch(e) { return; }
            dbg('log', `Received: ${msg.cmd} / ${msg.evt}`);

            // Handle errors
            if (msg.evt === 'ERROR') {
                dbg('error', `RPC error: ${JSON.stringify(msg.data)}`);
                clearTimeout(timeout);
                reject(new Error(msg.data?.message || 'Discord error'));
                try { socket.close(); } catch(e) {}
                return;
            }

            // DISPATCH READY - handshake complete
            if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
                clearTimeout(timeout);
                ws = socket;
                dbg('info', `Handshake complete on port ${port}`);

                try {
                    await authenticate(clientId);
                    resolve();
                } catch (authErr) {
                    reject(authErr);
                }
                return;
            }

            // Handle command responses
            if (msg.nonce && pendingCallbacks[msg.nonce]) {
                const cb = pendingCallbacks[msg.nonce];
                delete pendingCallbacks[msg.nonce];
                if (msg.evt === 'ERROR') {
                    cb.reject(new Error(msg.data?.message || 'RPC Error'));
                } else {
                    cb.resolve(msg);
                }
            }
        };

        socket.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Connection failed'));
        };

        socket.onclose = (event) => {
            clearTimeout(timeout);
            if (ws === socket) {
                dbg('warn', `Disconnected: code ${event.code}`);
                ws = null;
                authenticated = false;
                connectionState = 'disconnected';
                clearInterval(activityRefreshInterval);
                broadcastState('Disconnected from Discord');

                // Auto-reconnect after 5 seconds if we have a config
                if (currentConfig) {
                    setTimeout(() => {
                        if (currentConfig && connectionState === 'disconnected') {
                            connect(currentConfig);
                        }
                    }, 5000);
                }
            } else {
                reject(new Error('Connection closed'));
            }
        };
    });
}

// Authenticate with Discord
async function authenticate(clientId) {
    dbg('info', 'Authorizing…');
    connectionState = 'authorizing';
    broadcastState();

    const authResult = await send('AUTHORIZE', {
        client_id: clientId,
        scopes: ['rpc']
    });

    const code = authResult.data.code;
    dbg('info', 'Got auth code, authenticating…');

    await send('AUTHENTICATE', {
        access_token: code
    });

    authenticated = true;
    dbg('info', 'Authenticated!');

    // Set activity
    await setActivity();

    connectionState = 'connected';
    broadcastState();

    // Refresh activity every 5 minutes
    activityRefreshInterval = setInterval(() => {
        if (authenticated && ws && ws.readyState === WebSocket.OPEN) {
            setActivity().catch(console.error);
        }
    }, 5 * 60 * 1000);
}

// Set Discord activity
async function setActivity() {
    if (!currentConfig || !currentConfig.presence) return;

    const p = currentConfig.presence;
    const activity = {};

    if (p.details) activity.details = p.details;
    if (p.state) activity.state = p.state;

    // Timestamps
    if (p.timestamps_type === 'elapsed') {
        activity.timestamps = { start: Math.floor(Date.now() / 1000) };
    } else if (p.timestamps_type === 'countdown') {
        activity.timestamps = { end: Math.floor(Date.now() / 1000) + 3600 };
    } else if (p.timestamps_type === 'custom') {
        const ts = {};
        if (p.start_timestamp) ts.start = p.start_timestamp;
        if (p.end_timestamp) ts.end = p.end_timestamp;
        if (Object.keys(ts).length > 0) activity.timestamps = ts;
    }

    // Assets
    const assets = {};
    if (p.large_image_key) {
        assets.large_image = p.large_image_key;
        if (p.large_image_text) assets.large_text = p.large_image_text;
    }
    if (p.small_image_key) {
        assets.small_image = p.small_image_key;
        if (p.small_image_text) assets.small_text = p.small_image_text;
    }
    if (Object.keys(assets).length > 0) activity.assets = assets;

    // Buttons
    const buttons = [];
    if (p.button1_label && p.button1_url) {
        buttons.push({ label: p.button1_label, url: p.button1_url });
    }
    if (p.button2_label && p.button2_url) {
        buttons.push({ label: p.button2_label, url: p.button2_url });
    }
    if (buttons.length > 0) activity.buttons = buttons;

    // Party
    if (p.party_size > 0 && p.party_max > 0) {
        activity.party = {
            id: p.party_id || ('cubpresence_' + Date.now()),
            size: [p.party_size, p.party_max]
        };
    }

    dbg('info', 'Setting activity: ' + JSON.stringify(activity));
    await send('SET_ACTIVITY', { pid: 1000, activity });
    dbg('info', 'Activity set!');
}

// Disconnect from Discord
function disconnect() {
    clearInterval(activityRefreshInterval);
    currentConfig = null;

    if (ws) {
        if (authenticated) {
            try {
                const n = nextNonce();
                ws.send(JSON.stringify({
                    cmd: 'SET_ACTIVITY',
                    args: { pid: 1000, activity: null },
                    nonce: n
                }));
            } catch(e) {}
        }
        try { ws.close(); } catch(e) {}
        ws = null;
    }

    authenticated = false;
    connectionState = 'disconnected';
    broadcastState('Disconnected');
}

// Broadcast state to popup and content scripts
function broadcastState(error = null) {
    const state = {
        type: 'STATE_UPDATE',
        connectionState,
        authenticated,
        config: currentConfig ? {
            client_id: currentConfig.client_id,
            details: currentConfig.presence?.details,
            state: currentConfig.presence?.state
        } : null,
        error
    };

    // Send to popup if open
    chrome.runtime.sendMessage(state).catch(() => {});
}

// Listen for messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[CubPresence] Message received:', message.type);

    if (message.type === 'CONNECT') {
        connect(message.config).then(success => {
            sendResponse({ success });
        }).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true; // Async response
    }

    if (message.type === 'DISCONNECT') {
        disconnect();
        sendResponse({ success: true });
        return false;
    }

    if (message.type === 'GET_STATE') {
        sendResponse({
            connectionState,
            authenticated,
            config: currentConfig ? {
                client_id: currentConfig.client_id,
                details: currentConfig.presence?.details,
                state: currentConfig.presence?.state
            } : null
        });
        return false;
    }

    if (message.type === 'GET_DEBUG') {
        sendResponse({
            logs: _dbgLog.slice(-50),
            connectionState,
            authenticated,
            platform: navigator.platform,
            userAgent: navigator.userAgent,
            wsPort: ws ? (ws.url || '').match(/:(\d+)/)?.[1] : null,
        });
        return false;
    }

    if (message.type === 'SCAN_PORTS') {
        scanDiscordPorts().then(results => sendResponse({ results }));
        return true; // async
    }

    if (message.type === 'UPDATE_CONFIG') {
        currentConfig = message.config;
        if (authenticated && ws && ws.readyState === WebSocket.OPEN) {
            setActivity().then(() => {
                sendResponse({ success: true });
            }).catch(err => {
                sendResponse({ success: false, error: err.message });
            });
            return true;
        }
        sendResponse({ success: true });
        return false;
    }
});

dbg('info', 'Background service worker started');
