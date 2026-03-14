/* ─── VLC Media Player Plugin ─── */
// Requires VLC HTTP interface enabled:
//   VLC → Tools → Preferences → Show All → Interface → Main interfaces → check "Web"
//   Then: Interface → Main interfaces → Lua → Lua HTTP → set a Password
// Default: http://localhost:8080 with empty username and your chosen password

const _vlcCache = {};

async function _vlcGet(host, port, password, path) {
    const base = `http://${host || 'localhost'}:${port || 8080}`;
    const r = await fetch(base + path, {
        headers: { 'Authorization': 'Basic ' + btoa(':' + (password || '')) }
    });
    if (!r.ok) throw new Error('VLC HTTP ' + r.status + ' — check password and that Web interface is enabled');
    return r.json();
}

async function _vlcCmd(host, port, password, command, params) {
    const base = `http://${host || 'localhost'}:${port || 8080}`;
    let url = `${base}/requests/status.json?command=${command}`;
    if (params) {
        for (const [k, v] of Object.entries(params)) url += `&${k}=${encodeURIComponent(v)}`;
    }
    const r = await fetch(url, {
        headers: { 'Authorization': 'Basic ' + btoa(':' + (password || '')) }
    });
    if (!r.ok) throw new Error('VLC error ' + r.status);
    return r.json();
}

CubDeck.registerPlugin({
    id: 'vlc',
    name: 'VLC Media Player',
    icon: '🎬',
    actions: [
        {
            id: 'play-pause',
            name: 'Play / Pause',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' }
            ],
            getState(s, ctx) {
                const k = `vlc_${s.vlc_host}_${s.vlc_port}`;
                const cached = _vlcCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const playing = cached.data?.state === 'playing';
                    return { label: playing ? 'Now Playing' : 'Paused', icon: '🎬', active: playing, color: playing ? '#16a34a' : '#374151' };
                }
                if (!_vlcCache[k + '_f'] && s.vlc_pass !== undefined) {
                    _vlcCache[k + '_f'] = true;
                    _vlcGet(s.vlc_host, s.vlc_port, s.vlc_pass, '/requests/status.json').then(d => {
                        _vlcCache[k] = { data: d, expires: Date.now() + 3000 };
                        _vlcCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _vlcCache[k + '_f'] = false; });
                }
                return { label: cached?.data?.state === 'playing' ? 'Now Playing' : 'Paused', icon: '🎬' };
            },
            async execute(s, ctx) {
                try {
                    await _vlcCmd(s.vlc_host, s.vlc_port, s.vlc_pass, 'pl_pause');
                    delete _vlcCache[`vlc_${s.vlc_host}_${s.vlc_port}`];
                    ctx.showToast('Play/Pause toggled', 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'stop',
            name: 'Stop',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' }
            ],
            async execute(s, ctx) {
                try {
                    await _vlcCmd(s.vlc_host, s.vlc_port, s.vlc_pass, 'pl_stop');
                    ctx.showToast('VLC stopped', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'next',
            name: 'Next Track',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' }
            ],
            async execute(s, ctx) {
                try {
                    await _vlcCmd(s.vlc_host, s.vlc_port, s.vlc_pass, 'pl_next');
                    ctx.showToast('Next track', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'prev',
            name: 'Previous Track',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' }
            ],
            async execute(s, ctx) {
                try {
                    await _vlcCmd(s.vlc_host, s.vlc_port, s.vlc_pass, 'pl_previous');
                    ctx.showToast('Previous track', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'volume',
            name: 'Set Volume',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' },
                { key: 'volume', label: 'Volume (0–512, 256 = 100%)', type: 'text', placeholder: '256' }
            ],
            async execute(s, ctx) {
                try {
                    const vol = Math.max(0, Math.min(512, parseInt(s.volume) || 256));
                    await _vlcCmd(s.vlc_host, s.vlc_port, s.vlc_pass, 'volume', { val: vol });
                    ctx.showToast('VLC volume: ' + Math.round((vol / 256) * 100) + '%', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'now-playing',
            name: 'Now Playing Display',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' }
            ],
            getState(s, ctx) {
                const k = `vlc_${s.vlc_host}_${s.vlc_port}`;
                const cached = _vlcCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const info = cached.data?.information?.category?.meta;
                    const title = info?.title || info?.filename || 'Nothing playing';
                    return { label: title.slice(0, 30), icon: '🎬', color: cached.data?.state === 'playing' ? '#16a34a' : '#666' };
                }
                if (!_vlcCache[k + '_f'] && s.vlc_pass !== undefined) {
                    _vlcCache[k + '_f'] = true;
                    _vlcGet(s.vlc_host, s.vlc_port, s.vlc_pass, '/requests/status.json').then(d => {
                        _vlcCache[k] = { data: d, expires: Date.now() + 3000 };
                        _vlcCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _vlcCache[k + '_f'] = false; });
                }
                if (cached) {
                    const info = cached.data?.information?.category?.meta;
                    return { label: (info?.title || 'VLC').slice(0, 30), icon: '🎬' };
                }
                return { label: 'VLC...', icon: '🎬' };
            },
            async execute(s, ctx) {
                try {
                    const data = await _vlcGet(s.vlc_host, s.vlc_port, s.vlc_pass, '/requests/status.json');
                    const info = data.information?.category?.meta || {};
                    const title = info.title || info.filename || 'Nothing playing';
                    const artist = info.artist ? ' — ' + info.artist : '';
                    ctx.showToast(title + artist, 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'fullscreen',
            name: 'Toggle Fullscreen',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' }
            ],
            async execute(s, ctx) {
                try {
                    await _vlcCmd(s.vlc_host, s.vlc_port, s.vlc_pass, 'fullscreen');
                    ctx.showToast('Fullscreen toggled', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'open-file',
            name: 'Play File / URL',
            settings: [
                { key: 'vlc_host', label: 'Host', type: 'text', placeholder: 'localhost' },
                { key: 'vlc_port', label: 'Port', type: 'text', placeholder: '8080' },
                { key: 'vlc_pass', label: 'Password', type: 'text', placeholder: 'your vlc password' },
                { key: 'url', label: 'File path or URL', type: 'text', placeholder: 'C:\\Music\\song.mp3 or https://...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.url) throw new Error('File path or URL required');
                    await _vlcCmd(s.vlc_host, s.vlc_port, s.vlc_pass, 'in_play', { input: s.url });
                    ctx.showToast('Playing: ' + s.url.split('\\').pop().split('/').pop(), 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
