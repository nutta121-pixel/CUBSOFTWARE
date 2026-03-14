/* ─── WLED Plugin ─── */
// WLED is open-source firmware for addressable LED strips (very popular with streamers)
// Find your WLED device at http://wled.local or its IP address
// API docs: https://kno.wled.ge/interfaces/json-api/

const _wledCache = {};

async function _wledGet(ip) {
    const r = await fetch(`http://${ip}/json/state`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function _wledPost(ip, body) {
    const r = await fetch(`http://${ip}/json/state`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

CubDeck.registerPlugin({
    id: 'wled',
    name: 'WLED',
    icon: '🌈',
    actions: [
        {
            id: 'toggle',
            name: 'Toggle On/Off',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' }
            ],
            getState(s, ctx) {
                if (!s.ip) return { label: 'Toggle WLED', icon: '🌈' };
                const k = 'wled_' + s.ip;
                const cached = _wledCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const on = cached.data?.on;
                    return { label: on ? 'WLED On' : 'WLED Off', icon: '🌈', active: on, color: on ? '#f59e0b' : '#374151' };
                }
                if (!_wledCache[k + '_f']) {
                    _wledCache[k + '_f'] = true;
                    _wledGet(s.ip).then(d => {
                        _wledCache[k] = { data: d, expires: Date.now() + 4000 };
                        _wledCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _wledCache[k + '_f'] = false; });
                }
                if (cached) return { label: cached.data?.on ? 'WLED On' : 'WLED Off', icon: '🌈', active: cached.data?.on };
                return { label: 'WLED...', icon: '🌈' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    const state = await _wledGet(s.ip);
                    await _wledPost(s.ip, { on: !state.on });
                    delete _wledCache['wled_' + s.ip];
                    ctx.showToast('WLED ' + (!state.on ? 'on' : 'off'), 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'turn-on',
            name: 'Turn On',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' },
                { key: 'brightness', label: 'Brightness (1–255)', type: 'text', placeholder: '200' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    const body = { on: true };
                    if (s.brightness) body.bri = Math.max(1, Math.min(255, parseInt(s.brightness)));
                    await _wledPost(s.ip, body);
                    delete _wledCache['wled_' + s.ip];
                    ctx.showToast('WLED on', 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'turn-off',
            name: 'Turn Off',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    await _wledPost(s.ip, { on: false });
                    delete _wledCache['wled_' + s.ip];
                    ctx.showToast('WLED off', 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-color',
            name: 'Set Color',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' },
                { key: 'color', label: 'Color (hex)', type: 'text', placeholder: '#ff0000' },
                { key: 'brightness', label: 'Brightness (1–255)', type: 'text', placeholder: '200' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    const hex = (s.color || '#ffffff').replace('#', '');
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    const body = { on: true, seg: [{ col: [[r, g, b]] }] };
                    if (s.brightness) body.bri = Math.max(1, Math.min(255, parseInt(s.brightness)));
                    await _wledPost(s.ip, body);
                    ctx.showToast('Color set to ' + (s.color || '#ffffff'), 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-effect',
            name: 'Set Effect',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' },
                { key: 'effect', label: 'Effect ID (0–117)', type: 'select', options: [
                    { value: '0', label: '0 — Solid' },
                    { value: '1', label: '1 — Blink' },
                    { value: '2', label: '2 — Breathe' },
                    { value: '9', label: '9 — Rainbow' },
                    { value: '11', label: '11 — Running' },
                    { value: '37', label: '37 — Fire 2012' },
                    { value: '38', label: '38 — Colorwaves' },
                    { value: '45', label: '45 — BPM' },
                    { value: '56', label: '56 — Fireworks' },
                    { value: '65', label: '65 — Sparkle' },
                    { value: '91', label: '91 — Noise 1' }
                ], default: '0' },
                { key: 'speed', label: 'Speed (0–255)', type: 'text', placeholder: '128' },
                { key: 'intensity', label: 'Intensity (0–255)', type: 'text', placeholder: '128' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    const seg = { fx: parseInt(s.effect) || 0 };
                    if (s.speed) seg.sx = Math.max(0, Math.min(255, parseInt(s.speed)));
                    if (s.intensity) seg.ix = Math.max(0, Math.min(255, parseInt(s.intensity)));
                    await _wledPost(s.ip, { on: true, seg: [seg] });
                    ctx.showToast('Effect set', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'activate-preset',
            name: 'Activate Preset',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' },
                { key: 'preset', label: 'Preset ID (1–250)', type: 'text', placeholder: '1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip || !s.preset) throw new Error('IP and preset ID required');
                    await _wledPost(s.ip, { ps: parseInt(s.preset) });
                    ctx.showToast('Preset ' + s.preset + ' activated', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-brightness',
            name: 'Set Brightness',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' },
                { key: 'brightness', label: 'Brightness', type: 'select', options: [
                    { value: '13', label: '5%' }, { value: '25', label: '10%' },
                    { value: '51', label: '20%' }, { value: '102', label: '40%' },
                    { value: '128', label: '50%' }, { value: '179', label: '70%' },
                    { value: '217', label: '85%' }, { value: '255', label: '100%' }
                ], default: '200' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    await _wledPost(s.ip, { bri: parseInt(s.brightness) || 200 });
                    ctx.showToast('Brightness set', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'live-alert',
            name: 'Live Alert Flash',
            settings: [
                { key: 'ip', label: 'WLED IP / hostname', type: 'text', placeholder: 'wled.local' },
                { key: 'color', label: 'Flash color (hex)', type: 'text', placeholder: '#9147ff' },
                { key: 'duration', label: 'Duration (seconds)', type: 'text', placeholder: '5' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.ip) throw new Error('IP required');
                    const hex = (s.color || '#9147ff').replace('#', '');
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    // Save current state
                    const prev = await _wledGet(s.ip);
                    // Flash: strobe effect with custom color
                    await _wledPost(s.ip, { on: true, bri: 255, seg: [{ fx: 1, col: [[r, g, b]], sx: 160 }] });
                    const dur = (parseInt(s.duration) || 5) * 1000;
                    setTimeout(async () => {
                        try { await _wledPost(s.ip, prev); } catch(e) {}
                    }, dur);
                    ctx.showToast('Alert flash started (' + (s.duration || 5) + 's)', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
