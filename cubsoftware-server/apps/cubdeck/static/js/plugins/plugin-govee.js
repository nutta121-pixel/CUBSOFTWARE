/* ─── Govee Lights Plugin ─── */
// Controls Govee smart lights via the Govee Developer API
// Get API key: Govee Home app → Profile → About Us → Apply for API Key
// Docs: https://govee-public.s3.amazonaws.com/developer-docs/GoveeAPIReference.pdf

const _goveeCache = {};

async function _goveeGet(apiKey, path) {
    const r = await fetch('https://developer-api.govee.com/v1' + path, {
        headers: { 'Govee-API-Key': apiKey }
    });
    if (!r.ok) throw new Error('Govee API error ' + r.status);
    return r.json();
}

async function _goevePut(apiKey, body) {
    const r = await fetch('https://developer-api.govee.com/v1/devices/control', {
        method: 'PUT',
        headers: { 'Govee-API-Key': apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('Govee API error ' + r.status);
    return r.json();
}

function _goveeCmd(apiKey, device, model, name, value) {
    return _goevePut(apiKey, { device, model, cmd: { name, value } });
}

CubDeck.registerPlugin({
    id: 'govee',
    name: 'Govee Lights',
    icon: '💡',
    actions: [
        {
            id: 'list-devices',
            name: 'List Devices',
            settings: [
                { key: 'api_key', label: 'Govee API Key', type: 'text', placeholder: 'Your Govee API key' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key) throw new Error('API key required');
                    const data = await _goveeGet(s.api_key, '/devices');
                    const devices = data.data?.devices || [];
                    if (devices.length === 0) return ctx.showToast('No devices found', 'info');
                    ctx.showToast(devices.map(d => `${d.deviceName} (${d.device})`).join(' | '), 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'toggle',
            name: 'Toggle On/Off',
            settings: [
                { key: 'api_key', label: 'Govee API Key', type: 'text', placeholder: 'Your Govee API key' },
                { key: 'device', label: 'Device ID (MAC address)', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF:00:11' },
                { key: 'model', label: 'Device Model', type: 'text', placeholder: 'H6159' }
            ],
            getState(s, ctx) {
                if (!s.device) return { label: 'Toggle Govee', icon: '💡' };
                const k = 'govee_' + s.device;
                const cached = _goveeCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const on = cached.data?.powerSwitch === 1;
                    return { label: on ? 'Light On' : 'Light Off', icon: '💡', active: on, color: on ? '#f59e0b' : '#374151' };
                }
                if (!_goveeCache[k + '_f'] && s.api_key) {
                    _goveeCache[k + '_f'] = true;
                    _goveeGet(s.api_key, `/devices/state?device=${encodeURIComponent(s.device)}&model=${encodeURIComponent(s.model || '')}`)
                        .then(d => {
                            const props = {};
                            for (const p of (d.data?.properties || [])) Object.assign(props, p);
                            _goveeCache[k] = { data: props, expires: Date.now() + 8000 };
                            _goveeCache[k + '_f'] = false;
                            if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                        }).catch(() => { _goveeCache[k + '_f'] = false; });
                }
                if (cached) return { label: cached.data?.powerSwitch === 1 ? 'Light On' : 'Light Off', icon: '💡', active: cached.data?.powerSwitch === 1 };
                return { label: 'Govee...', icon: '💡' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.device || !s.model) throw new Error('API key, device ID and model required');
                    const stateData = await _goveeGet(s.api_key, `/devices/state?device=${encodeURIComponent(s.device)}&model=${encodeURIComponent(s.model)}`);
                    const props = {};
                    for (const p of (stateData.data?.properties || [])) Object.assign(props, p);
                    const currentOn = props.powerSwitch === 1;
                    await _goveeCmd(s.api_key, s.device, s.model, 'turn', currentOn ? 'off' : 'on');
                    delete _goveeCache['govee_' + s.device];
                    ctx.showToast('Govee light ' + (currentOn ? 'off' : 'on'), 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'turn-on',
            name: 'Turn On',
            settings: [
                { key: 'api_key', label: 'Govee API Key', type: 'text', placeholder: 'Your Govee API key' },
                { key: 'device', label: 'Device ID', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF:00:11' },
                { key: 'model', label: 'Device Model', type: 'text', placeholder: 'H6159' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.device || !s.model) throw new Error('API key, device ID and model required');
                    await _goveeCmd(s.api_key, s.device, s.model, 'turn', 'on');
                    delete _goveeCache['govee_' + s.device];
                    ctx.showToast('Govee light on', 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'turn-off',
            name: 'Turn Off',
            settings: [
                { key: 'api_key', label: 'Govee API Key', type: 'text', placeholder: 'Your Govee API key' },
                { key: 'device', label: 'Device ID', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF:00:11' },
                { key: 'model', label: 'Device Model', type: 'text', placeholder: 'H6159' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.device || !s.model) throw new Error('API key, device ID and model required');
                    await _goveeCmd(s.api_key, s.device, s.model, 'turn', 'off');
                    delete _goveeCache['govee_' + s.device];
                    ctx.showToast('Govee light off', 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-color',
            name: 'Set Color',
            settings: [
                { key: 'api_key', label: 'Govee API Key', type: 'text', placeholder: 'Your Govee API key' },
                { key: 'device', label: 'Device ID', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF:00:11' },
                { key: 'model', label: 'Device Model', type: 'text', placeholder: 'H6159' },
                { key: 'color', label: 'Color (hex)', type: 'text', placeholder: '#ff0000' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.device || !s.model) throw new Error('API key, device ID and model required');
                    const hex = (s.color || '#ffffff').replace('#', '');
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    await _goveeCmd(s.api_key, s.device, s.model, 'color', { r, g, b });
                    ctx.showToast('Color set to ' + (s.color || '#ffffff'), 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-brightness',
            name: 'Set Brightness',
            settings: [
                { key: 'api_key', label: 'Govee API Key', type: 'text', placeholder: 'Your Govee API key' },
                { key: 'device', label: 'Device ID', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF:00:11' },
                { key: 'model', label: 'Device Model', type: 'text', placeholder: 'H6159' },
                { key: 'brightness', label: 'Brightness (0–100)', type: 'text', placeholder: '100' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.device || !s.model) throw new Error('API key, device ID and model required');
                    const bri = Math.max(0, Math.min(100, parseInt(s.brightness) || 100));
                    await _goveeCmd(s.api_key, s.device, s.model, 'brightness', bri);
                    ctx.showToast('Govee brightness: ' + bri + '%', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-mode',
            name: 'Set Scene/Mode',
            settings: [
                { key: 'api_key', label: 'Govee API Key', type: 'text', placeholder: 'Your Govee API key' },
                { key: 'device', label: 'Device ID', type: 'text', placeholder: 'AA:BB:CC:DD:EE:FF:00:11' },
                { key: 'model', label: 'Device Model', type: 'text', placeholder: 'H6159' },
                { key: 'mode', label: 'Scene ID (from Govee app)', type: 'text', placeholder: '1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.device || !s.model) throw new Error('API key, device ID and model required');
                    await _goveeCmd(s.api_key, s.device, s.model, 'mode', parseInt(s.mode) || 1);
                    ctx.showToast('Govee scene set to ' + s.mode, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
