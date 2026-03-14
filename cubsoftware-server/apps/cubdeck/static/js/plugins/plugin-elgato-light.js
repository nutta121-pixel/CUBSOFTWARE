/* ─── Elgato Key Light / Ring Light Plugin ─── */
// Elgato Key Light, Key Light Air, and Ring Light expose a local REST API on port 9123.
// No software needed beyond the Elgato Control Center app (which starts the service).
// Find your light's IP from: Elgato Control Center → Light → IP Address

const _elgatoCache = {};

async function _elgatoGet(ip, port) {
    const r = await fetch(`http://${ip}:${port || 9123}/elgato/lights`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function _elgatoPut(ip, port, lights) {
    const r = await fetch(`http://${ip}:${port || 9123}/elgato/lights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lights })
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

CubDeck.registerPlugin({
    id: 'elgato-light',
    name: 'Elgato Key Light',
    icon: '💡',
    actions: [
        {
            id: 'toggle',
            name: 'Toggle Light On/Off',
            settings: [
                { key: 'ip', label: 'Light IP address', type: 'text', placeholder: '192.168.1.100' },
                { key: 'port', label: 'Port (default 9123)', type: 'text', placeholder: '9123' }
            ],
            getState(s, ctx) {
                if (!s.ip) return { label: 'Toggle Light', icon: '💡' };
                const k = 'elgato_' + s.ip;
                const cached = _elgatoCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const on = cached.data?.on === 1;
                    return { label: on ? 'Light On' : 'Light Off', icon: '💡', active: on, color: on ? '#f59e0b' : '#374151' };
                }
                if (!_elgatoCache[k + '_f']) {
                    _elgatoCache[k + '_f'] = true;
                    _elgatoGet(s.ip, s.port).then(d => {
                        _elgatoCache[k] = { data: d.lights?.[0], expires: Date.now() + 5000 };
                        _elgatoCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _elgatoCache[k + '_f'] = false; });
                }
                if (cached) {
                    const on = cached.data?.on === 1;
                    return { label: on ? 'Light On' : 'Light Off', icon: '💡', active: on, color: on ? '#f59e0b' : '#374151' };
                }
                return { label: 'Light...', icon: '💡' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP address required');
                    const current = await _elgatoGet(s.ip, s.port);
                    const light = current.lights?.[0] || {};
                    const newOn = light.on === 1 ? 0 : 1;
                    await _elgatoPut(s.ip, s.port, [{ on: newOn }]);
                    const k = 'elgato_' + s.ip;
                    delete _elgatoCache[k];
                    ctx.showToast('Light ' + (newOn ? 'on' : 'off'), 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'turn-on',
            name: 'Turn Light On',
            settings: [
                { key: 'ip', label: 'Light IP address', type: 'text', placeholder: '192.168.1.100' },
                { key: 'port', label: 'Port (default 9123)', type: 'text', placeholder: '9123' },
                { key: 'brightness', label: 'Brightness (3–100)', type: 'text', placeholder: '80' },
                { key: 'temperature', label: 'Color temp (2900–7000K)', type: 'text', placeholder: '5600' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP address required');
                    const light = { on: 1 };
                    if (s.brightness) light.brightness = Math.max(3, Math.min(100, parseInt(s.brightness)));
                    if (s.temperature) {
                        // Elgato uses a mirek-like scale (1000000/kelvin rounded)
                        const k = parseInt(s.temperature);
                        light.temperature = Math.round(1000000 / Math.max(2900, Math.min(7000, k)));
                    }
                    await _elgatoPut(s.ip, s.port, [light]);
                    delete _elgatoCache['elgato_' + s.ip];
                    ctx.showToast('Light on' + (s.brightness ? ' @ ' + s.brightness + '%' : ''), 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'turn-off',
            name: 'Turn Light Off',
            settings: [
                { key: 'ip', label: 'Light IP address', type: 'text', placeholder: '192.168.1.100' },
                { key: 'port', label: 'Port (default 9123)', type: 'text', placeholder: '9123' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP address required');
                    await _elgatoPut(s.ip, s.port, [{ on: 0 }]);
                    delete _elgatoCache['elgato_' + s.ip];
                    ctx.showToast('Light off', 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-brightness',
            name: 'Set Brightness',
            settings: [
                { key: 'ip', label: 'Light IP address', type: 'text', placeholder: '192.168.1.100' },
                { key: 'port', label: 'Port (default 9123)', type: 'text', placeholder: '9123' },
                { key: 'brightness', label: 'Brightness (3–100)', type: 'text', placeholder: '50' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.brightness) throw new Error('IP and brightness required');
                    const bri = Math.max(3, Math.min(100, parseInt(s.brightness)));
                    await _elgatoPut(s.ip, s.port, [{ brightness: bri }]);
                    delete _elgatoCache['elgato_' + s.ip];
                    ctx.showToast('Brightness: ' + bri + '%', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-temperature',
            name: 'Set Color Temperature',
            settings: [
                { key: 'ip', label: 'Light IP address', type: 'text', placeholder: '192.168.1.100' },
                { key: 'port', label: 'Port (default 9123)', type: 'text', placeholder: '9123' },
                { key: 'temperature', label: 'Color temp (2900K=warm, 7000K=cool)', type: 'select', options: [
                    { value: '2900', label: '2900K — Very Warm' },
                    { value: '3200', label: '3200K — Warm White' },
                    { value: '4000', label: '4000K — Neutral' },
                    { value: '5000', label: '5000K — Daylight' },
                    { value: '5600', label: '5600K — Daylight (default)' },
                    { value: '6500', label: '6500K — Cool White' },
                    { value: '7000', label: '7000K — Very Cool' }
                ], default: '5600' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP address required');
                    const k = parseInt(s.temperature) || 5600;
                    const temp = Math.round(1000000 / Math.max(2900, Math.min(7000, k)));
                    await _elgatoPut(s.ip, s.port, [{ temperature: temp }]);
                    ctx.showToast('Color temp: ' + k + 'K', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'scene-streaming',
            name: 'Streaming Preset',
            settings: [
                { key: 'ip', label: 'Light IP address', type: 'text', placeholder: '192.168.1.100' },
                { key: 'port', label: 'Port', type: 'text', placeholder: '9123' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP address required');
                    await _elgatoPut(s.ip, s.port, [{ on: 1, brightness: 85, temperature: 171 }]); // ~5600K
                    ctx.showToast('Streaming preset applied', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'scene-relax',
            name: 'Relax / Break Preset',
            settings: [
                { key: 'ip', label: 'Light IP address', type: 'text', placeholder: '192.168.1.100' },
                { key: 'port', label: 'Port', type: 'text', placeholder: '9123' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP address required');
                    await _elgatoPut(s.ip, s.port, [{ on: 1, brightness: 30, temperature: 344 }]); // ~2900K warm
                    ctx.showToast('Relax preset applied', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
