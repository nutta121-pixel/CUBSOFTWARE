// CubPresence - Discord RPC Connection
// Connects to Discord's local RPC server via WebSocket and sets Rich Presence activity

class CubPresenceConnection {
    constructor(configId, config) {
        this.configId = configId;
        this.config = config;
        this.clientId = config.client_id;
        this.ws = null;
        this.port = null;
        this.authenticated = false;
        this.nonce = 0;
        this.pendingCallbacks = {};
        this.reconnectTimer = null;
        this.heartbeatTimer = null;
        this.activityRefreshTimer = null;
    }

    // Generate a unique nonce for each command
    nextNonce() {
        return 'cubpresence_' + (++this.nonce) + '_' + Date.now();
    }

    // Send a command to Discord RPC
    send(cmd, args, evt) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
                reject(new Error('WebSocket not connected'));
                return;
            }
            const nonce = this.nextNonce();
            this.pendingCallbacks[nonce] = { resolve, reject };
            const payload = { cmd, nonce };
            if (args) payload.args = args;
            if (evt) payload.evt = evt;
            this.ws.send(JSON.stringify(payload));

            // Timeout after 30s
            setTimeout(() => {
                if (this.pendingCallbacks[nonce]) {
                    delete this.pendingCallbacks[nonce];
                    reject(new Error('Command timed out: ' + cmd));
                }
            }, 30000);
        });
    }

    // Try connecting to Discord RPC on available ports
    async connect() {
        this.setStatus('connecting', 'Connecting...', 'Looking for Discord on your machine.');
        this.log('Scanning for Discord RPC...', 'info');

        // Try both IPv4 and IPv6 in parallel — on Linux, Discord sometimes binds to ::1 instead of 127.0.0.1
        for (let port = 6463; port <= 6472; port++) {
            try {
                this.log('Trying port ' + port + '...', 'info');
                await Promise.any([
                    this.tryPort(port, '127.0.0.1'),
                    this.tryPort(port, '[::1]'),
                ]);
                return; // Success
            } catch (e) {
                // Both hosts failed on this port, try next
            }
        }

        this.setStatus('disconnected', 'Discord Not Found', 'Make sure Discord is running. On Linux, try the standard .deb or .tar.gz install instead of Snap or Flatpak if this keeps happening.');
        this.log('Could not find Discord on ports 6463-6472 (tried 127.0.0.1 and ::1).', 'error');
        this.showReconnect();
    }

    // Attempt connection on a specific port and host
    tryPort(port, host) {
        host = host || '127.0.0.1';
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout'));
                try { ws.close(); } catch(e) {}
            }, 5000);

            const url = 'ws://' + host + ':' + port + '/?v=1&client_id=' + this.clientId + '&encoding=json';
            const ws = new WebSocket(url);

            ws.onopen = () => {
                this.log('Connected to ' + host + ':' + port, 'success');
            };

            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                this.log('Received: ' + msg.cmd + (msg.evt ? '/' + msg.evt : ''), 'info');

                // Handle errors
                if (msg.evt === 'ERROR') {
                    this.log('Discord error: ' + (msg.data?.message || JSON.stringify(msg.data)), 'error');
                    clearTimeout(timeout);
                    reject(new Error(msg.data?.message || 'Discord RPC error'));
                    try { ws.close(); } catch(e) {}
                    return;
                }

                // DISPATCH READY — initial handshake complete
                if (msg.cmd === 'DISPATCH' && msg.evt === 'READY') {
                    clearTimeout(timeout);
                    this.ws = ws;
                    this.port = port;
                    this.log('Discord RPC handshake complete', 'success');
                    this.onConnected();
                    resolve();
                    return;
                }

                // Handle command responses
                if (msg.nonce && this.pendingCallbacks[msg.nonce]) {
                    const cb = this.pendingCallbacks[msg.nonce];
                    delete this.pendingCallbacks[msg.nonce];
                    if (msg.evt === 'ERROR') {
                        cb.reject(new Error(msg.data?.message || 'RPC Error'));
                    } else {
                        cb.resolve(msg);
                    }
                    return;
                }
            };

            ws.onerror = (err) => {
                this.log('WebSocket error on ' + host + ':' + port, 'info');
                clearTimeout(timeout);
                reject(new Error('Connection failed'));
            };

            ws.onclose = (event) => {
                this.log('Connection closed on ' + host + ':' + port + ' (code: ' + event.code + ', reason: ' + (event.reason || 'none') + ')', 'info');
                clearTimeout(timeout);
                if (this.ws === ws) {
                    this.onDisconnected(event);
                } else {
                    reject(new Error('Connection closed: ' + event.code));
                }
            };
        });
    }

    // Called when WebSocket connection is established and READY received
    async onConnected() {
        try {
            // Step 1: AUTHORIZE — asks Discord to show the approval popup
            this.setStatus('authorizing', 'Authorizing...', 'Please approve the authorization in Discord.');
            this.log('Requesting authorization...', 'info');

            const authResult = await this.send('AUTHORIZE', {
                client_id: this.clientId,
                scopes: ['rpc']
            });

            const code = authResult.data.code;
            this.log('Authorization code received', 'success');

            // Step 2: AUTHENTICATE with the code
            // Discord RPC StreamKit allows using the auth code directly as access_token
            // for local RPC connections without needing a full OAuth2 token exchange
            this.log('Authenticating...', 'info');

            try {
                await this.send('AUTHENTICATE', {
                    access_token: code
                });
                this.authenticated = true;
                this.log('Authenticated successfully', 'success');
            } catch (authErr) {
                // If direct auth fails, the code needs to be exchanged server-side
                // This happens when the Discord App has a client secret configured
                this.log('Direct auth failed, trying token exchange...', 'info');
                try {
                    const tokenResp = await fetch('/api/cubpresence/token-exchange', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: code, client_id: this.clientId })
                    });
                    if (tokenResp.ok) {
                        const tokenData = await tokenResp.json();
                        await this.send('AUTHENTICATE', {
                            access_token: tokenData.access_token
                        });
                        this.authenticated = true;
                        this.log('Authenticated via token exchange', 'success');
                    } else {
                        throw new Error('Token exchange not available');
                    }
                } catch (exchangeErr) {
                    // Last resort: try authenticate without token
                    // Some Discord versions accept the code directly
                    throw authErr;
                }
            }

            // Step 3: SET_ACTIVITY
            await this.setActivity();

            // Mark connected on server
            fetch('/api/cubpresence/connected/' + this.configId, { method: 'POST' });

            this.setStatus('connected', 'Connected', 'Your Discord Rich Presence is active. Keep this tab open.');
            this.showDisconnect();
            this.showPresenceInfo();

            // Refresh activity every 5 minutes to keep it alive
            this.activityRefreshTimer = setInterval(() => {
                if (this.authenticated && this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.setActivity().catch(() => {});
                }
            }, 5 * 60 * 1000);

        } catch (err) {
            this.log('Error: ' + err.message, 'error');
            this.setStatus('disconnected', 'Connection Failed', err.message);
            this.showReconnect();
        }
    }

    // Called when WebSocket disconnects
    onDisconnected(event) {
        this.authenticated = false;
        this.ws = null;
        clearInterval(this.activityRefreshTimer);

        this.log('Disconnected from Discord (code: ' + event.code + ')', 'error');
        this.setStatus('disconnected', 'Disconnected', 'Connection to Discord was lost.');
        this.showReconnect();

        // Auto-reconnect after 5 seconds
        this.reconnectTimer = setTimeout(() => {
            this.log('Auto-reconnecting...', 'info');
            this.connect();
        }, 5000);
    }

    // Build and send SET_ACTIVITY command
    async setActivity() {
        const p = this.config.presence;
        const activity = {};

        if (p.details) activity.details = p.details;
        if (p.state) activity.state = p.state;

        // Timestamps
        if (p.timestamps_type === 'elapsed') {
            activity.timestamps = { start: Math.floor(Date.now() / 1000) };
        } else if (p.timestamps_type === 'countdown') {
            // Default: 1 hour from now
            activity.timestamps = { end: Math.floor(Date.now() / 1000) + 3600 };
        } else if (p.timestamps_type === 'custom') {
            const ts = {};
            if (p.start_timestamp) ts.start = p.start_timestamp;
            if (p.end_timestamp) ts.end = p.end_timestamp;
            if (Object.keys(ts).length > 0) activity.timestamps = ts;
        }

        // Assets (images)
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
                id: p.party_id || ('cubpresence_' + this.configId),
                size: [p.party_size, p.party_max]
            };
        }

        this.log('Setting activity...', 'info');
        await this.send('SET_ACTIVITY', {
            pid: 1000,
            activity: activity
        });
        this.log('Activity set successfully', 'success');
    }

    // Disconnect from Discord
    disconnect() {
        clearTimeout(this.reconnectTimer);
        clearInterval(this.activityRefreshTimer);

        if (this.ws) {
            // Clear activity before disconnecting
            if (this.authenticated) {
                try {
                    const nonce = this.nextNonce();
                    this.ws.send(JSON.stringify({
                        cmd: 'SET_ACTIVITY',
                        args: { pid: 1000, activity: null },
                        nonce: nonce
                    }));
                } catch (e) {}
            }

            try { this.ws.close(); } catch(e) {}
            this.ws = null;
        }

        this.authenticated = false;
        this.setStatus('disconnected', 'Disconnected', 'Your Rich Presence has been cleared.');
        this.log('Disconnected by user', 'info');
        this.showReconnect();
    }

    // ==================== UI HELPERS ====================

    setStatus(state, text, detail) {
        const icon = document.getElementById('statusIcon');
        const textEl = document.getElementById('statusText');
        const detailEl = document.getElementById('statusDetail');

        icon.className = 'connect-status-icon ' + state;

        // Update icon SVG based on state
        if (state === 'connected') {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="40" height="40"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
        } else if (state === 'disconnected') {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="40" height="40"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>';
        } else if (state === 'authorizing') {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="40" height="40"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
        } else {
            icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="40" height="40"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';
        }

        textEl.textContent = text;
        detailEl.textContent = detail;
    }

    showDisconnect() {
        document.getElementById('disconnectBtn').style.display = '';
        document.getElementById('reconnectBtn').style.display = 'none';
    }

    showReconnect() {
        document.getElementById('disconnectBtn').style.display = 'none';
        document.getElementById('reconnectBtn').style.display = '';
    }

    showPresenceInfo() {
        const info = document.getElementById('presenceInfo');
        const p = this.config.presence;
        document.getElementById('infoDetails').textContent = p.details || '(none)';
        document.getElementById('infoState').textContent = p.state || '(none)';
        info.style.display = '';
    }

    log(message, type) {
        const entries = document.getElementById('logEntries');
        const time = new Date().toLocaleTimeString();
        const entry = document.createElement('div');
        entry.className = 'log-entry ' + (type || '');
        entry.textContent = '[' + time + '] ' + message;
        entries.appendChild(entry);
        entries.scrollTop = entries.scrollHeight;
    }
}

// ==================== PAGE INIT ====================

let connection = null;

function reconnect() {
    if (connection) {
        connection.disconnect();
    }
    connection = new CubPresenceConnection(CONFIG_ID, CONFIG);
    connection.connect();
}

function disconnect() {
    if (connection) {
        connection.disconnect();
    }
}

// Auto-connect on page load
document.addEventListener('DOMContentLoaded', function() {
    connection = new CubPresenceConnection(CONFIG_ID, CONFIG);
    connection.connect();
});

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (connection) {
        connection.disconnect();
    }
});
