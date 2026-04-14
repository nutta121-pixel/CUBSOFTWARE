/* ─── CubDeck OBS WebSocket v5 Client ─── */
class OBSClient {
    constructor() {
        this.ws = null;
        this.pendingRequests = {};
        this.reqId = 0;
        this.connected = false;
        this.authenticated = false;
        this.eventHandlers = {};
        this.reconnectTimer = null;
        this.autoReconnect = false;
        this._obsHost = 'localhost';
        this._obsPort = 4455;
        this._obsPass = '';
        this._obsProto = 'ws';
        // Cached OBS state
        this.scenes = [];
        this.currentScene = '';
        this.streaming = false;
        this.recording = false;
        this.replayBufferActive = false;
        this.inputs = [];
    }

    on(event, handler) {
        if (!this.eventHandlers[event]) this.eventHandlers[event] = [];
        this.eventHandlers[event].push(handler);
    }

    emit(event, data) {
        (this.eventHandlers[event] || []).forEach(h => { try { h(data); } catch(e) {} });
    }

    async sha256b64(str) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
    }

    connect(host, port, password, proto) {
        this._obsHost = host || 'localhost';
        this._obsPort = port || 4455;
        this._obsPass = password || '';
        this._obsProto = proto || 'ws';
        this._reconnectAttempts = 0;
        this._triedFallbackPort = false;
        this.autoReconnect = true;
        this._connect();
    }

    _connect() {
        if (this.ws) { try { this.ws.close(); } catch(e) {} }
        clearTimeout(this.reconnectTimer);
        this.connected = false;
        this.authenticated = false;
        this.emit('connecting');

        const url = `${this._obsProto}://${this._obsHost}:${this._obsPort}`;
        try {
            this.ws = new WebSocket(url);
        } catch(e) {
            this.emit('error', 'Failed to create WebSocket: ' + e.message);
            this._scheduleReconnect();
            return;
        }

        this.ws.onopen = () => { /* wait for Hello */ };

        this.ws.onmessage = async (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch(e) { return; }
            await this._handleMessage(msg);
        };

        this.ws.onerror = () => {
            this.emit('error', 'WebSocket error');
        };

        this.ws.onclose = (ev) => {
            this.connected = false;
            this.authenticated = false;
            if (ev.code === 4009) {
                // Wrong password — stop reconnecting, tell UI
                this.autoReconnect = false;
                this.emit('authFail');
            }
            this.emit('disconnected', ev.code);
            if (this.autoReconnect) this._scheduleReconnect();
        };
    }

    _scheduleReconnect() {
        clearTimeout(this.reconnectTimer);

        // On first failure: try the alternate port (4455 ↔ 4456) before backing off
        if (!this._triedFallbackPort) {
            const alt = this._obsPort === 4455 ? 4456 : this._obsPort === 4456 ? 4455 : null;
            if (alt) {
                this._triedFallbackPort = true;
                this._obsPort = alt;
                this.emit('scanning', alt);
                this.reconnectTimer = setTimeout(() => this._connect(), 1500);
                return;
            }
        }

        this._reconnectAttempts = (this._reconnectAttempts || 0) + 1;

        // On HTTPS, stop for non-localhost hosts — they can never work without wss://
        const h = (this._obsHost || '').toLowerCase();
        const isLocal = h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
        if (location.protocol === 'https:' && !isLocal && this._reconnectAttempts >= 3) {
            this.autoReconnect = false;
            this.emit('error', 'Non-localhost hosts require wss:// on HTTPS. Use the OBS Browser Dock URL instead.');
            return;
        }

        // Localhost on HTTPS: keep retrying — OBS WebSocket might just be starting
        // Exponential backoff: 5s, 10s, 20s, capped at 30s
        const delay = Math.min(5000 * Math.pow(2, this._reconnectAttempts - 1), 30000);
        this.reconnectTimer = setTimeout(() => this._connect(), delay);
    }

    async _handleMessage(msg) {
        const op = msg.op;
        const d = msg.d;

        if (op === 0) { // Hello
            const rpcVersion = d.rpcVersion || 1;
            const auth = d.authentication;
            let authStr = undefined;
            if (auth && this._obsPass) {
                const b64 = await this.sha256b64(this._obsPass + auth.salt);
                authStr = await this.sha256b64(b64 + auth.challenge);
            }
            this.ws.send(JSON.stringify({
                op: 1,
                d: {
                    rpcVersion,
                    authentication: authStr,
                    eventSubscriptions: 0x7FFFF // all events
                }
            }));
        }

        else if (op === 2) { // Identified
            this.connected = true;
            this.authenticated = true;
            this._reconnectAttempts = 0;
            this.emit('connected');
            // Fetch initial state
            this._fetchInitialState();
        }

        else if (op === 7) { // RequestResponse
            const id = d.requestId;
            const cb = this.pendingRequests[id];
            if (cb) {
                delete this.pendingRequests[id];
                if (d.requestStatus.result) {
                    cb.resolve(d.responseData || {});
                } else {
                    cb.reject(new Error(d.requestStatus.comment || 'OBS error ' + d.requestStatus.code));
                }
            }
        }

        else if (op === 5) { // Event
            this._handleEvent(d.eventType, d.eventData || {});
        }
    }

    _handleEvent(type, data) {
        this.emit('event:' + type, data);
        this.emit('event', { type, data });

        switch (type) {
            case 'CurrentProgramSceneChanged':
                this.currentScene = data.sceneName;
                this.emit('sceneChanged', data.sceneName);
                break;
            case 'StreamStateChanged':
                this.streaming = data.outputActive;
                this.emit('streamStateChanged', data.outputActive);
                break;
            case 'RecordStateChanged':
                this.recording = data.outputActive;
                this.emit('recordStateChanged', data.outputActive);
                break;
            case 'ReplayBufferStateChanged':
                this.replayBufferActive = data.outputActive;
                this.emit('replayBufferStateChanged', data.outputActive);
                break;
            case 'SceneListChanged':
                this.scenes = data.scenes || [];
                this.emit('scenesChanged', this.scenes);
                break;
            case 'InputMuteStateChanged':
                this.emit('inputMuteChanged', data);
                break;
            case 'InputVolumeChanged':
                this.emit('inputVolumeChanged', data);
                break;
        }
    }

    async _fetchInitialState() {
        try {
            const scenes = await this.call('GetSceneList');
            this.scenes = scenes.scenes || [];
            this.currentScene = scenes.currentProgramSceneName || '';
            this.emit('scenesChanged', this.scenes);
            this.emit('sceneChanged', this.currentScene);
        } catch(e) {}

        try {
            const status = await this.call('GetStreamStatus');
            this.streaming = status.outputActive;
            this.emit('streamStateChanged', this.streaming);
        } catch(e) {}

        try {
            const status = await this.call('GetRecordStatus');
            this.recording = status.outputActive;
            this.emit('recordStateChanged', this.recording);
        } catch(e) {}

        try {
            const inputs = await this.call('GetInputList');
            this.inputs = inputs.inputs || [];
            this.emit('inputsChanged', this.inputs);
        } catch(e) {}
    }

    call(requestType, requestData = {}) {
        return new Promise((resolve, reject) => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.authenticated) {
                return reject(new Error('Not connected to OBS'));
            }
            const id = 'req_' + (++this.reqId);
            this.pendingRequests[id] = { resolve, reject };
            this.ws.send(JSON.stringify({
                op: 6,
                d: { requestId: id, requestType, requestData }
            }));
            setTimeout(() => {
                if (this.pendingRequests[id]) {
                    delete this.pendingRequests[id];
                    reject(new Error('Request timed out: ' + requestType));
                }
            }, 10000);
        });
    }

    disconnect() {
        this.autoReconnect = false;
        clearTimeout(this.reconnectTimer);
        if (this.ws) { try { this.ws.close(); } catch(e) {} this.ws = null; }
        this.connected = false;
        this.authenticated = false;
    }
}

window.obsClient = new OBSClient();
