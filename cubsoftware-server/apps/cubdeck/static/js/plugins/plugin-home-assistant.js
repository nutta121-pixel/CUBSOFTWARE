/* ─── Home Assistant Plugin ─── */

const _haCache = {};

async function _haFetch(method, path, body, baseUrl, token) {
    if (!baseUrl || !token) throw new Error('Set HA URL and token in button settings');
    const url = baseUrl.replace(/\/$/, '') + '/api' + path;
    const opts = {
        method,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json'
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error('HA API error ' + r.status);
    return r.status === 200 ? r.json() : null;
}

CubDeck.registerPlugin({
    id: 'home-assistant',
    name: 'Home Assistant',
    icon: '🏠',
    actions: [
        {
            id: 'toggle-entity',
            name: 'Toggle Entity',
            settings: [
                { key: 'ha_url', label: 'HA URL', type: 'text', placeholder: 'http://homeassistant.local:8123' },
                { key: 'ha_token', label: 'Long-Lived Access Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'entity_id', label: 'Entity ID', type: 'text', placeholder: 'light.desk_lamp' }
            ],
            async execute(s, ctx) {
                try {
                    const domain = (s.entity_id || '').split('.')[0];
                    await _haFetch('POST', `/services/${domain}/toggle`, { entity_id: s.entity_id }, s.ha_url, s.ha_token);
                    ctx.showToast('Toggled ' + s.entity_id, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            },
            getState(s, ctx) {
                if (!s.entity_id || !s.ha_url || !s.ha_token) return { label: 'Toggle Entity', icon: '🏠' };
                const k = 'ha_state_' + s.entity_id;
                const now = Date.now();
                const cached = _haCache[k];
                if (cached && now < cached.expires) {
                    const st = cached.data;
                    const isOn = st === 'on' || st === 'playing' || st === 'open';
                    return { label: s.entity_id.split('.')[1] + ': ' + st, icon: '🏠', active: isOn, color: isOn ? '#16a34a' : '#374151' };
                }
                if (!_haCache[k + '_f']) {
                    _haCache[k + '_f'] = true;
                    _haFetch('GET', '/states/' + s.entity_id, null, s.ha_url, s.ha_token)
                        .then(d => {
                            _haCache[k] = { data: d.state, expires: Date.now() + 5000 };
                            _haCache[k + '_f'] = false;
                            if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                        }).catch(() => { _haCache[k + '_f'] = false; });
                }
                if (cached) return { label: s.entity_id.split('.')[1] + ': ' + cached.data, icon: '🏠' };
                return { label: s.entity_id ? s.entity_id.split('.')[1] : 'Toggle', icon: '🏠' };
            }
        },
        {
            id: 'turn-on',
            name: 'Turn On Entity',
            settings: [
                { key: 'ha_url', label: 'HA URL', type: 'text', placeholder: 'http://homeassistant.local:8123' },
                { key: 'ha_token', label: 'Long-Lived Access Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'entity_id', label: 'Entity ID', type: 'text', placeholder: 'light.desk_lamp' }
            ],
            async execute(s, ctx) {
                try {
                    const domain = (s.entity_id || '').split('.')[0];
                    await _haFetch('POST', `/services/${domain}/turn_on`, { entity_id: s.entity_id }, s.ha_url, s.ha_token);
                    ctx.showToast('Turned on ' + s.entity_id, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'turn-off',
            name: 'Turn Off Entity',
            settings: [
                { key: 'ha_url', label: 'HA URL', type: 'text', placeholder: 'http://homeassistant.local:8123' },
                { key: 'ha_token', label: 'Long-Lived Access Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'entity_id', label: 'Entity ID', type: 'text', placeholder: 'light.desk_lamp' }
            ],
            async execute(s, ctx) {
                try {
                    const domain = (s.entity_id || '').split('.')[0];
                    await _haFetch('POST', `/services/${domain}/turn_off`, { entity_id: s.entity_id }, s.ha_url, s.ha_token);
                    ctx.showToast('Turned off ' + s.entity_id, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'set-light-color',
            name: 'Set Light Color',
            settings: [
                { key: 'ha_url', label: 'HA URL', type: 'text', placeholder: 'http://homeassistant.local:8123' },
                { key: 'ha_token', label: 'Long-Lived Access Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'entity_id', label: 'Light Entity ID', type: 'text', placeholder: 'light.desk_lamp' },
                { key: 'color_name', label: 'Color name', type: 'text', placeholder: 'red, blue, green, white, purple...' },
                { key: 'brightness', label: 'Brightness (0-255)', type: 'text', placeholder: '200' }
            ],
            async execute(s, ctx) {
                try {
                    const body = { entity_id: s.entity_id };
                    if (s.color_name) body.color_name = s.color_name;
                    if (s.brightness) body.brightness = parseInt(s.brightness) || 200;
                    await _haFetch('POST', '/services/light/turn_on', body, s.ha_url, s.ha_token);
                    ctx.showToast('Light set to ' + (s.color_name || 'custom'), 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'run-script',
            name: 'Run Script',
            settings: [
                { key: 'ha_url', label: 'HA URL', type: 'text', placeholder: 'http://homeassistant.local:8123' },
                { key: 'ha_token', label: 'Long-Lived Access Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'script_id', label: 'Script Entity ID', type: 'text', placeholder: 'script.my_routine' }
            ],
            async execute(s, ctx) {
                try {
                    await _haFetch('POST', '/services/script/turn_on', { entity_id: s.script_id }, s.ha_url, s.ha_token);
                    ctx.showToast('Script triggered: ' + s.script_id, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'call-service',
            name: 'Call Service',
            settings: [
                { key: 'ha_url', label: 'HA URL', type: 'text', placeholder: 'http://homeassistant.local:8123' },
                { key: 'ha_token', label: 'Long-Lived Access Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'domain', label: 'Domain', type: 'text', placeholder: 'media_player' },
                { key: 'service', label: 'Service', type: 'text', placeholder: 'media_pause' },
                { key: 'entity_id', label: 'Entity ID', type: 'text', placeholder: 'media_player.living_room' }
            ],
            async execute(s, ctx) {
                try {
                    const body = s.entity_id ? { entity_id: s.entity_id } : {};
                    await _haFetch('POST', `/services/${s.domain}/${s.service}`, body, s.ha_url, s.ha_token);
                    ctx.showToast(`${s.domain}.${s.service} called`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'state-display',
            name: 'State Display',
            settings: [
                { key: 'ha_url', label: 'HA URL', type: 'text', placeholder: 'http://homeassistant.local:8123' },
                { key: 'ha_token', label: 'Long-Lived Access Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'entity_id', label: 'Entity ID', type: 'text', placeholder: 'sensor.temperature' },
                { key: 'label', label: 'Display label', type: 'text', placeholder: 'Temp' }
            ],
            getState(s, ctx) {
                if (!s.entity_id || !s.ha_url || !s.ha_token) return { label: s.label || 'State', icon: '🏠' };
                const k = 'ha_sensor_' + s.entity_id;
                const now = Date.now();
                const cached = _haCache[k];
                if (cached && now < cached.expires) {
                    return { label: (s.label ? s.label + ': ' : '') + cached.data, icon: '🏠' };
                }
                if (!_haCache[k + '_f']) {
                    _haCache[k + '_f'] = true;
                    _haFetch('GET', '/states/' + s.entity_id, null, s.ha_url, s.ha_token)
                        .then(d => {
                            const val = d.state + (d.attributes?.unit_of_measurement ? ' ' + d.attributes.unit_of_measurement : '');
                            _haCache[k] = { data: val, expires: Date.now() + 10000 };
                            _haCache[k + '_f'] = false;
                            if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                        }).catch(() => { _haCache[k + '_f'] = false; });
                }
                if (cached) return { label: (s.label ? s.label + ': ' : '') + cached.data, icon: '🏠' };
                return { label: s.label || 'Loading...', icon: '🏠' };
            },
            async execute(s, ctx) {
                try {
                    const d = await _haFetch('GET', '/states/' + s.entity_id, null, s.ha_url, s.ha_token);
                    ctx.showToast((s.label || s.entity_id) + ': ' + d.state, 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
