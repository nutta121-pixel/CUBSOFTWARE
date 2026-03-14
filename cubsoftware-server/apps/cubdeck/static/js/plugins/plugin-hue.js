/* ─── Philips Hue Plugin ─── */
// Controls Philips Hue via the local Hue Bridge REST API (v1)
// Setup: Find your bridge IP at meethue.com/api/nupnp or in your router's device list.
//        Get username: POST {"devicetype":"cubdeck"} to http://{bridge_ip}/api while pressing the bridge button.

const _hueCache = {};

async function _huePut(ip, user, path, body) {
    const r = await fetch(`http://${ip}/api/${user}${path}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function _hueGet(ip, user, path) {
    const r = await fetch(`http://${ip}/api/${user}${path}`);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

async function _huePost(ip, user, path, body) {
    const r = await fetch(`http://${ip}/api/${user}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
}

// Convert hex color to Hue xy color space
function _hexToXy(hex) {
    let r = parseInt(hex.slice(1, 3), 16) / 255;
    let g = parseInt(hex.slice(3, 5), 16) / 255;
    let b = parseInt(hex.slice(5, 7), 16) / 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;
    const X = r * 0.664511 + g * 0.154324 + b * 0.162028;
    const Y = r * 0.283881 + g * 0.668433 + b * 0.047685;
    const Z = r * 0.000088 + g * 0.072310 + b * 0.986039;
    const sum = X + Y + Z;
    if (sum === 0) return [0.3227, 0.3290];
    return [X / sum, Y / sum];
}

CubDeck.registerPlugin({
    id: 'hue',
    name: 'Philips Hue',
    icon: '💡',
    actions: [
        {
            id: 'toggle-light',
            name: 'Light On / Off',
            settings: [
                { key: 'bridge_ip', label: 'Bridge IP', type: 'text', placeholder: '192.168.1.2' },
                { key: 'username', label: 'API Username', type: 'text', placeholder: 'abc123...' },
                { key: 'light_id', label: 'Light ID', type: 'text', placeholder: '1' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'on', label: 'Turn On' },
                    { value: 'off', label: 'Turn Off' }
                ], default: 'toggle' }
            ],
            getState(s, ctx) {
                if (!s.bridge_ip || !s.username || !s.light_id) return { label: 'Hue Light', icon: '💡' };
                const k = `hue_light_${s.bridge_ip}_${s.light_id}`;
                const cached = _hueCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const on = cached.data?.on;
                    return { label: on ? 'Hue On' : 'Hue Off', icon: '💡', active: on, color: on ? '#f59e0b' : '#374151' };
                }
                if (!_hueCache[k + '_f']) {
                    _hueCache[k + '_f'] = true;
                    _hueGet(s.bridge_ip, s.username, `/lights/${s.light_id}`).then(d => {
                        _hueCache[k] = { data: d.state, expires: Date.now() + 5000 };
                        _hueCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _hueCache[k + '_f'] = false; });
                }
                if (cached) return { label: cached.data?.on ? 'Hue On' : 'Hue Off', icon: '💡', active: cached.data?.on };
                return { label: 'Hue...', icon: '💡' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.bridge_ip || !s.username || !s.light_id) throw new Error('Bridge IP, username and light ID required');
                    const action = s.action || 'toggle';
                    let newOn;
                    if (action === 'on') {
                        newOn = true;
                    } else if (action === 'off') {
                        newOn = false;
                    } else {
                        const state = await _hueGet(s.bridge_ip, s.username, `/lights/${s.light_id}`);
                        newOn = !state.state.on;
                    }
                    await _huePut(s.bridge_ip, s.username, `/lights/${s.light_id}/state`, { on: newOn });
                    delete _hueCache[`hue_light_${s.bridge_ip}_${s.light_id}`];
                    ctx.showToast(`Light ${s.light_id} ${newOn ? 'on' : 'off'}`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-color',
            name: 'Set Light Color',
            settings: [
                { key: 'bridge_ip', label: 'Bridge IP', type: 'text', placeholder: '192.168.1.2' },
                { key: 'username', label: 'API Username', type: 'text', placeholder: 'abc123...' },
                { key: 'light_id', label: 'Light ID', type: 'text', placeholder: '1' },
                { key: 'color', label: 'Color (hex)', type: 'text', placeholder: '#ff0000' },
                { key: 'brightness', label: 'Brightness (1–254)', type: 'text', placeholder: '200' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.bridge_ip || !s.username || !s.light_id) throw new Error('Bridge IP, username and light ID required');
                    const body = { on: true };
                    if (s.color && s.color.startsWith('#') && s.color.length === 7) {
                        body.xy = _hexToXy(s.color);
                    }
                    if (s.brightness) body.bri = Math.max(1, Math.min(254, parseInt(s.brightness)));
                    await _huePut(s.bridge_ip, s.username, `/lights/${s.light_id}/state`, body);
                    ctx.showToast(`Light ${s.light_id} set to ${s.color || 'on'}`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'toggle-group',
            name: 'Group / Room On / Off',
            settings: [
                { key: 'bridge_ip', label: 'Bridge IP', type: 'text', placeholder: '192.168.1.2' },
                { key: 'username', label: 'API Username', type: 'text', placeholder: 'abc123...' },
                { key: 'group_id', label: 'Group ID (0 = all lights)', type: 'text', placeholder: '1' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'on', label: 'Turn On' },
                    { value: 'off', label: 'Turn Off' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.bridge_ip || !s.username) throw new Error('Bridge IP and username required');
                    const gid = s.group_id || '0';
                    const action = s.action || 'toggle';
                    let newOn;
                    if (action === 'on') {
                        newOn = true;
                    } else if (action === 'off') {
                        newOn = false;
                    } else {
                        const state = await _hueGet(s.bridge_ip, s.username, `/groups/${gid}`);
                        newOn = !(state.state?.any_on || state.action?.on);
                    }
                    await _huePut(s.bridge_ip, s.username, `/groups/${gid}/action`, { on: newOn });
                    ctx.showToast(`Group ${gid} ${newOn ? 'on' : 'off'}`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'activate-scene',
            name: 'Activate Scene',
            settings: [
                { key: 'bridge_ip', label: 'Bridge IP', type: 'text', placeholder: '192.168.1.2' },
                { key: 'username', label: 'API Username', type: 'text', placeholder: 'abc123...' },
                { key: 'group_id', label: 'Group ID', type: 'text', placeholder: '1' },
                { key: 'scene_id', label: 'Scene ID', type: 'text', placeholder: 'abc123def456' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.bridge_ip || !s.username || !s.scene_id) throw new Error('Bridge IP, username and scene ID required');
                    const gid = s.group_id || '0';
                    await _huePut(s.bridge_ip, s.username, `/groups/${gid}/action`, { scene: s.scene_id });
                    ctx.showToast('Scene activated', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-brightness-group',
            name: 'Set Group Brightness',
            settings: [
                { key: 'bridge_ip', label: 'Bridge IP', type: 'text', placeholder: '192.168.1.2' },
                { key: 'username', label: 'API Username', type: 'text', placeholder: 'abc123...' },
                { key: 'group_id', label: 'Group ID (0 = all)', type: 'text', placeholder: '1' },
                { key: 'brightness', label: 'Brightness %', type: 'select', options: [
                    {value:'13',label:'5%'},{value:'26',label:'10%'},{value:'51',label:'20%'},
                    {value:'64',label:'25%'},{value:'127',label:'50%'},{value:'191',label:'75%'},
                    {value:'220',label:'86%'},{value:'254',label:'100%'}
                ], default: '254' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.bridge_ip || !s.username) throw new Error('Bridge IP and username required');
                    const bri = parseInt(s.brightness) || 254;
                    const gid = s.group_id || '0';
                    await _huePut(s.bridge_ip, s.username, `/groups/${gid}/action`, { on: true, bri });
                    ctx.showToast(`Group ${gid} brightness set`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'register-user',
            name: 'Register API User (first time setup)',
            settings: [
                { key: 'bridge_ip', label: 'Bridge IP', type: 'text', placeholder: '192.168.1.2' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.bridge_ip) throw new Error('Bridge IP required');
                    ctx.showToast('Press the button on your Hue Bridge NOW, then wait...', 'info');
                    await new Promise(r => setTimeout(r, 3000));
                    const result = await _huePost(s.bridge_ip, '', '', { devicetype: 'cubdeck#browser' });
                    const entry = result[0];
                    if (entry?.success?.username) {
                        ctx.showToast('Username: ' + entry.success.username + ' (save this!)', 'success');
                        await navigator.clipboard.writeText(entry.success.username).catch(() => {});
                    } else if (entry?.error) {
                        throw new Error(entry.error.description);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
