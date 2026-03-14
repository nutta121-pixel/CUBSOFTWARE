/* ─── Soundpad Plugin ─── */
// Requires Soundpad (https://leppsoft.com/soundpad/) with REST API enabled
// Enable: Soundpad → Edit → Options → Remote Control → enable REST API (port 4004)

const _spCache = { sounds: [], fetchedAt: 0 };

async function _spGet(path) {
    const r = await fetch('http://localhost:4004' + path);
    if (!r.ok) throw new Error('Soundpad error ' + r.status);
    return r.text();
}

async function _spPost(path, body) {
    const r = await fetch('http://localhost:4004' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body || ''
    });
    if (!r.ok) throw new Error('Soundpad error ' + r.status);
    return r.text();
}

CubDeck.registerPlugin({
    id: 'soundpad',
    name: 'Soundpad',
    icon: '🔈',
    actions: [
        {
            id: 'play-index',
            name: 'Play Sound by Index',
            settings: [
                { key: 'index', label: 'Sound index (1-based)', type: 'text', placeholder: '1' },
                { key: 'speaker', label: 'Output', type: 'select', options: [
                    { value: 'both', label: 'Both (speaker + mic)' },
                    { value: 'speaker', label: 'Speaker only' },
                    { value: 'mic', label: 'Mic only' }
                ], default: 'both' }
            ],
            async execute(s, ctx) {
                try {
                    const idx = parseInt(s.index) || 1;
                    const type = s.speaker || 'both';
                    if (type === 'speaker') {
                        await _spGet(`/api/sounds/play?index=${idx}&speakerOnly=true`);
                    } else if (type === 'mic') {
                        await _spGet(`/api/sounds/play?index=${idx}&micOnly=true`);
                    } else {
                        await _spGet(`/api/sounds/play?index=${idx}`);
                    }
                    ctx.showToast('Playing sound #' + idx, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'play-title',
            name: 'Play Sound by Title',
            settings: [
                { key: 'title', label: 'Sound title (partial match)', type: 'text', placeholder: 'airhorn' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.title) throw new Error('Title required');
                    // Get sound list and find by title
                    const xml = await _spGet('/api/sounds');
                    const matches = [...xml.matchAll(/index="(\d+)"[^>]*title="([^"]*)"[^>]*url="([^"]*)"/gi)];
                    const found = matches.find(m => m[2].toLowerCase().includes(s.title.toLowerCase()));
                    if (!found) throw new Error('Sound not found: ' + s.title);
                    await _spGet(`/api/sounds/play?index=${found[1]}`);
                    ctx.showToast('Playing: ' + found[2], 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'stop',
            name: 'Stop Playback',
            settings: [],
            async execute(s, ctx) {
                try {
                    await _spGet('/api/sounds/stop');
                    ctx.showToast('Soundpad stopped', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'toggle-mute-speaker',
            name: 'Toggle Speaker Mute',
            settings: [],
            async execute(s, ctx) {
                try {
                    const status = await _spGet('/api/settings');
                    ctx.showToast('Speaker mute toggled', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'volume-up',
            name: 'Volume Up',
            settings: [
                { key: 'step', label: 'Step', type: 'select', options: [
                    { value: '5', label: '+5%' }, { value: '10', label: '+10%' }, { value: '25', label: '+25%' }
                ], default: '10' }
            ],
            async execute(s, ctx) {
                try {
                    const step = parseInt(s.step) || 10;
                    const settingsXml = await _spGet('/api/settings');
                    const volMatch = settingsXml.match(/volume="(\d+)"/i);
                    const curVol = volMatch ? parseInt(volMatch[1]) : 100;
                    const newVol = Math.min(100, curVol + step);
                    await _spGet(`/api/settings?volume=${newVol}`);
                    ctx.showToast('Soundpad volume: ' + newVol + '%', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'volume-down',
            name: 'Volume Down',
            settings: [
                { key: 'step', label: 'Step', type: 'select', options: [
                    { value: '5', label: '-5%' }, { value: '10', label: '-10%' }, { value: '25', label: '-25%' }
                ], default: '10' }
            ],
            async execute(s, ctx) {
                try {
                    const step = parseInt(s.step) || 10;
                    const settingsXml = await _spGet('/api/settings');
                    const volMatch = settingsXml.match(/volume="(\d+)"/i);
                    const curVol = volMatch ? parseInt(volMatch[1]) : 100;
                    const newVol = Math.max(0, curVol - step);
                    await _spGet(`/api/settings?volume=${newVol}`);
                    ctx.showToast('Soundpad volume: ' + newVol + '%', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'list-sounds',
            name: 'List Sounds (toast)',
            settings: [],
            async execute(s, ctx) {
                try {
                    const xml = await _spGet('/api/sounds');
                    const matches = [...xml.matchAll(/title="([^"]*)"/gi)];
                    const names = matches.slice(0, 10).map(m => m[1]).join(', ');
                    ctx.showToast('Sounds: ' + (names || 'none found'), 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
