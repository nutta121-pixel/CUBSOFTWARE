/* ─── Spotify Plugin ─── */

let _spotifyToken = '';
let _spotifyCache = { track: null, lastFetch: 0, playing: false };

async function _spotify(method, path, body) {
    if (!_spotifyToken) throw new Error('No Spotify token. Add it in button settings.');
    const opts = {
        method,
        headers: { 'Authorization': 'Bearer ' + _spotifyToken }
    };
    if (body) {
        opts.body = JSON.stringify(body);
        opts.headers['Content-Type'] = 'application/json';
    }
    const r = await fetch('https://api.spotify.com/v1' + path, opts);
    if (r.status === 204 || r.status === 202) return null;
    if (!r.ok) {
        const e = await r.json().catch(() => ({ error: { message: 'Error ' + r.status } }));
        throw new Error(e.error && e.error.message ? e.error.message : 'Spotify error');
    }
    return r.json();
}

CubDeck.registerPlugin({
    id: 'spotify',
    name: 'Spotify',
    icon: '🎵',
    actions: [
        {
            id: 'play-pause',
            name: 'Play / Pause',
            icon: '▶️',
            settings: [
                { key: 'token', label: 'Spotify access token', type: 'text', placeholder: 'BQA...' }
            ],
            getState(s, ctx) {
                if (_spotifyCache.playing) {
                    return { label: 'Pause', icon: '⏸️', color: '#1db954' };
                }
                return { label: 'Play', icon: '▶️' };
            },
            async execute(s, ctx) {
                try {
                    if (s.token) _spotifyToken = s.token;
                    const state = await _spotify('GET', '/me/player');
                    if (state && state.is_playing) {
                        await _spotify('PUT', '/me/player/pause');
                        _spotifyCache.playing = false;
                        ctx.showToast('Paused', 'info');
                    } else {
                        await _spotify('PUT', '/me/player/play');
                        _spotifyCache.playing = true;
                        ctx.showToast('Playing', 'success');
                    }
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'skip-next',
            name: 'Skip to Next Track',
            icon: '⏭️',
            settings: [
                { key: 'token', label: 'Spotify access token', type: 'text', placeholder: 'BQA...' }
            ],
            async execute(s, ctx) {
                try {
                    if (s.token) _spotifyToken = s.token;
                    await _spotify('POST', '/me/player/next');
                    _spotifyCache.lastFetch = 0; // Invalidate cache
                    ctx.showToast('Skipped', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'skip-prev',
            name: 'Previous Track',
            icon: '⏮️',
            settings: [
                { key: 'token', label: 'Spotify access token', type: 'text', placeholder: 'BQA...' }
            ],
            async execute(s, ctx) {
                try {
                    if (s.token) _spotifyToken = s.token;
                    await _spotify('POST', '/me/player/previous');
                    _spotifyCache.lastFetch = 0;
                    ctx.showToast('Previous', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'set-volume',
            name: 'Set Volume',
            icon: '🔊',
            settings: [
                { key: 'token', label: 'Spotify access token', type: 'text', placeholder: 'BQA...' },
                { key: 'volume', label: 'Volume %', type: 'number', min: 0, max: 100, default: 50 }
            ],
            async execute(s, ctx) {
                try {
                    if (s.token) _spotifyToken = s.token;
                    const vol = Math.max(0, Math.min(100, parseInt(s.volume) || 50));
                    await _spotify('PUT', '/me/player/volume?volume_percent=' + vol);
                    ctx.showToast('Volume: ' + vol + '%', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'toggle-shuffle',
            name: 'Shuffle',
            icon: '🔀',
            settings: [
                { key: 'token', label: 'Spotify access token', type: 'text', placeholder: 'BQA...' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'on', label: 'On' },
                    { value: 'off', label: 'Off' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                try {
                    if (s.token) _spotifyToken = s.token;
                    const action = s.action || 'toggle';
                    let newShuffle;
                    if (action === 'on') {
                        newShuffle = true;
                    } else if (action === 'off') {
                        newShuffle = false;
                    } else {
                        const state = await _spotify('GET', '/me/player');
                        newShuffle = !(state && state.shuffle_state);
                    }
                    await _spotify('PUT', '/me/player/shuffle?state=' + newShuffle);
                    ctx.showToast('Shuffle ' + (newShuffle ? 'on' : 'off'), 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'toggle-repeat',
            name: 'Repeat',
            icon: '🔁',
            settings: [
                { key: 'token', label: 'Spotify access token', type: 'text', placeholder: 'BQA...' },
                { key: 'mode', label: 'Repeat Mode', type: 'select', options: [
                    { value: 'off', label: 'Off' },
                    { value: 'context', label: 'Repeat Playlist' },
                    { value: 'track', label: 'Repeat Track' }
                ], default: 'context' }
            ],
            async execute(s, ctx) {
                try {
                    if (s.token) _spotifyToken = s.token;
                    const mode = s.mode || 'context';
                    await _spotify('PUT', '/me/player/repeat?state=' + mode);
                    const labels = { 'off': 'Repeat off', 'context': 'Repeat playlist', 'track': 'Repeat track' };
                    ctx.showToast(labels[mode] || mode, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'now-playing',
            name: 'Now Playing',
            icon: '🎵',
            settings: [
                { key: 'token', label: 'Spotify access token', type: 'text', placeholder: 'BQA...' }
            ],
            getState(s, ctx) {
                if (!s.token && !_spotifyToken) return { label: 'No token', icon: '🎵' };
                // Update token from settings if present
                if (s.token) _spotifyToken = s.token;

                const now = Date.now();
                if (now - _spotifyCache.lastFetch < 5000 && _spotifyCache.lastFetch > 0) {
                    // Return cached
                    if (!_spotifyCache.track) return { label: 'Not playing', icon: '🎵', color: '#666' };
                    const t = _spotifyCache.track;
                    const label = t.substring(0, 20) + (t.length > 20 ? '…' : '');
                    return { label, icon: '🎵', color: _spotifyCache.playing ? '#1db954' : '#666' };
                }

                // Kick off async fetch
                if (!_spotifyCache._fetching) {
                    _spotifyCache._fetching = true;
                    _spotify('GET', '/me/player/currently-playing').then(d => {
                        _spotifyCache.lastFetch = Date.now();
                        _spotifyCache._fetching = false;
                        if (!d || !d.item) {
                            _spotifyCache.track = null;
                            _spotifyCache.playing = false;
                        } else {
                            const artist = (d.item.artists && d.item.artists[0] && d.item.artists[0].name) || '';
                            const song = d.item.name || '';
                            _spotifyCache.track = artist + ' - ' + song;
                            _spotifyCache.playing = d.is_playing || false;
                        }
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => {
                        _spotifyCache.lastFetch = Date.now();
                        _spotifyCache._fetching = false;
                        _spotifyCache.track = null;
                        _spotifyCache.playing = false;
                    });
                }

                // Return last known state while fetching
                if (_spotifyCache.track) {
                    const t = _spotifyCache.track;
                    const label = t.substring(0, 20) + (t.length > 20 ? '…' : '');
                    return { label, icon: '🎵', color: _spotifyCache.playing ? '#1db954' : '#666' };
                }
                return { label: 'Not playing', icon: '🎵', color: '#666' };
            },
            async execute(s, ctx) {
                // Force refresh on click
                if (s.token) _spotifyToken = s.token;
                _spotifyCache.lastFetch = 0;
                _spotifyCache._fetching = false;
                ctx.refreshAllButtons();
            }
        }
    ]
});
