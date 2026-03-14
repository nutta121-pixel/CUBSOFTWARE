/* ─── Nanoleaf Plugin ─── */
// Controls Nanoleaf light panels via local REST API
// Find IP: Nanoleaf app → Settings → Device → IP Address
// Get token: Hold the power button on your Nanoleaf for 5-7 seconds until LED blinks,
//             then click "Get Token" button below within 30 seconds.
// API port: 16021

const _nlCache = {};

async function _nlGet(ip, token, path) {
    const r = await fetch(`http://${ip}:16021/api/v1/${token}${path}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function _nlPut(ip, token, path, body) {
    const r = await fetch(`http://${ip}:16021/api/v1/${token}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.status === 204 ? null : r.json().catch(() => null);
}

async function _nlPost(ip, token, path, body) {
    const r = await fetch(`http://${ip}:16021/api/v1/${token}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json().catch(() => null);
}

CubDeck.registerPlugin({
    id: 'nanoleaf',
    name: 'Nanoleaf',
    icon: '🍃',
    actions: [
        {
            id: 'get-token',
            name: 'Get API Token (first setup)',
            settings: [
                { key: 'ip', label: 'Nanoleaf IP address', type: 'text', placeholder: '192.168.1.50' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    ctx.showToast('Hold the power button on your Nanoleaf until it blinks, then wait...', 'info');
                    await new Promise(r => setTimeout(r, 2000));
                    const r = await fetch(`http://${s.ip}:16021/api/v1/new`, { method: 'POST' });
                    if (!r.ok) throw new Error('HTTP ' + r.status + ' — did you hold the button?');
                    const data = await r.json();
                    if (data.auth_token) {
                        ctx.showToast('Token: ' + data.auth_token + ' (saved to clipboard)', 'success');
                        await navigator.clipboard.writeText(data.auth_token).catch(() => {});
                    } else {
                        throw new Error('No token returned');
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'toggle',
            name: 'Panels On / Off',
            settings: [
                { key: 'ip', label: 'Nanoleaf IP', type: 'text', placeholder: '192.168.1.50' },
                { key: 'token', label: 'API Token', type: 'text', placeholder: 'Your auth token' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'on', label: 'Turn On' },
                    { value: 'off', label: 'Turn Off' }
                ], default: 'toggle' }
            ],
            getState(s, ctx) {
                if (!s.ip || !s.token) return { label: 'Nanoleaf', icon: '🍃' };
                const k = 'nl_' + s.ip;
                const cached = _nlCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const on = cached.data?.on?.value;
                    return { label: on ? 'Panels On' : 'Panels Off', icon: '🍃', active: on, color: on ? '#22c55e' : '#374151' };
                }
                if (!_nlCache[k + '_f']) {
                    _nlCache[k + '_f'] = true;
                    _nlGet(s.ip, s.token, '/state').then(d => {
                        _nlCache[k] = { data: d, expires: Date.now() + 5000 };
                        _nlCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _nlCache[k + '_f'] = false; });
                }
                if (cached) return { label: cached.data?.on?.value ? 'Panels On' : 'Panels Off', icon: '🍃', active: cached.data?.on?.value };
                return { label: 'Nanoleaf...', icon: '🍃' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.token) throw new Error('IP and token required');
                    const action = s.action || 'toggle';
                    let newOn;
                    if (action === 'on') {
                        newOn = true;
                    } else if (action === 'off') {
                        newOn = false;
                    } else {
                        const state = await _nlGet(s.ip, s.token, '/state');
                        newOn = !state.on.value;
                    }
                    await _nlPut(s.ip, s.token, '/state', { on: { value: newOn } });
                    delete _nlCache['nl_' + s.ip];
                    ctx.showToast('Nanoleaf ' + (newOn ? 'on' : 'off'), 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-brightness',
            name: 'Set Brightness',
            settings: [
                { key: 'ip', label: 'Nanoleaf IP', type: 'text', placeholder: '192.168.1.50' },
                { key: 'token', label: 'API Token', type: 'text', placeholder: 'Your auth token' },
                { key: 'brightness', label: 'Brightness (0–100)', type: 'text', placeholder: '75' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.token) throw new Error('IP and token required');
                    const bri = Math.max(0, Math.min(100, parseInt(s.brightness) || 75));
                    await _nlPut(s.ip, s.token, '/state', { brightness: { value: bri } });
                    ctx.showToast('Brightness: ' + bri + '%', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-color-temp',
            name: 'Set Color Temperature',
            settings: [
                { key: 'ip', label: 'Nanoleaf IP', type: 'text', placeholder: '192.168.1.50' },
                { key: 'token', label: 'API Token', type: 'text', placeholder: 'Your auth token' },
                { key: 'temp', label: 'Color temp (1200–6500K)', type: 'select', options: [
                    { value: '1200', label: '1200K — Candlelight' },
                    { value: '2700', label: '2700K — Warm White' },
                    { value: '4000', label: '4000K — Neutral' },
                    { value: '5000', label: '5000K — Daylight' },
                    { value: '6500', label: '6500K — Cool Daylight' }
                ], default: '4000' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.token) throw new Error('IP and token required');
                    await _nlPut(s.ip, s.token, '/state', {
                        on: { value: true },
                        ct: { value: parseInt(s.temp) || 4000 }
                    });
                    ctx.showToast('Color temp: ' + s.temp + 'K', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'activate-effect',
            name: 'Activate Effect',
            settings: [
                { key: 'ip', label: 'Nanoleaf IP', type: 'text', placeholder: '192.168.1.50' },
                { key: 'token', label: 'API Token', type: 'text', placeholder: 'Your auth token' },
                { key: 'effect', label: 'Effect name (exact, from Nanoleaf app)', type: 'text', placeholder: 'Nemo' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.token || !s.effect) throw new Error('IP, token and effect name required');
                    await _nlPut(s.ip, s.token, '/effects', { select: s.effect });
                    ctx.showToast('Effect: ' + s.effect, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'list-effects',
            name: 'List Effects',
            settings: [
                { key: 'ip', label: 'Nanoleaf IP', type: 'text', placeholder: '192.168.1.50' },
                { key: 'token', label: 'API Token', type: 'text', placeholder: 'Your auth token' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.token) throw new Error('IP and token required');
                    const data = await _nlGet(s.ip, s.token, '/effects/effectsList');
                    ctx.showToast('Effects: ' + (data || []).join(', '), 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-hue-sat',
            name: 'Set Hue & Saturation',
            settings: [
                { key: 'ip', label: 'Nanoleaf IP', type: 'text', placeholder: '192.168.1.50' },
                { key: 'token', label: 'API Token', type: 'text', placeholder: 'Your auth token' },
                { key: 'hue', label: 'Hue (0–360)', type: 'text', placeholder: '0' },
                { key: 'sat', label: 'Saturation (0–100)', type: 'text', placeholder: '100' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.token) throw new Error('IP and token required');
                    await _nlPut(s.ip, s.token, '/state', {
                        on: { value: true },
                        hue: { value: Math.max(0, Math.min(360, parseInt(s.hue) || 0)) },
                        sat: { value: Math.max(0, Math.min(100, parseInt(s.sat) || 100)) }
                    });
                    ctx.showToast('Color set', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
