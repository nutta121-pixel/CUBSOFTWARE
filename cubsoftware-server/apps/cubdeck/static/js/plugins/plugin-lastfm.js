/* ─── Last.fm Plugin ─── */

const _lfmCache = { track: '', artist: '', album: '', isPlaying: false, lastFetch: 0, playcount: null, profileFetch: 0 };

async function _lfmApi(method, params, apiKey) {
    const url = new URL('https://ws.audioscrobbler.com/2.0/');
    url.searchParams.set('method', method);
    url.searchParams.set('api_key', apiKey);
    url.searchParams.set('format', 'json');
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url.toString());
    if (!r.ok) throw new Error('Last.fm error');
    return r.json();
}

CubDeck.registerPlugin({
    id: 'lastfm',
    name: 'Last.fm',
    icon: '🎵',
    actions: [
        {
            id: 'now-playing',
            name: 'Now Playing Display',
            icon: '🎵',
            settings: [
                { key: 'apiKey', label: 'Last.fm API Key', type: 'text', placeholder: 'your-api-key' },
                { key: 'username', label: 'Last.fm username', type: 'text', placeholder: 'your-username' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.apiKey) throw new Error('API Key required');
                    if (!s.username) throw new Error('Username required');
                    const d = await _lfmApi('user.getrecenttracks', { user: s.username, limit: 1 }, s.apiKey);
                    const t = d.recenttracks?.track?.[0];
                    if (t) {
                        _lfmCache.track = t.name;
                        _lfmCache.artist = t.artist?.['#text'] || '';
                        _lfmCache.isPlaying = !!t['@attr']?.nowplaying;
                        _lfmCache.lastFetch = Date.now();
                    }
                    ctx.showToast(_lfmCache.isPlaying ? _lfmCache.artist + ' - ' + _lfmCache.track : 'Not playing', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const now = Date.now();
                if (now - _lfmCache.lastFetch > 10000 && s.apiKey && s.username) {
                    _lfmCache.lastFetch = now;
                    _lfmApi('user.getrecenttracks', { user: s.username, limit: 1 }, s.apiKey)
                        .then(d => {
                            const t = d.recenttracks?.track?.[0];
                            if (t) {
                                _lfmCache.track = t.name;
                                _lfmCache.artist = t.artist?.['#text'] || '';
                                _lfmCache.isPlaying = !!t['@attr']?.nowplaying;
                                _lfmCache.lastFetch = Date.now();
                            }
                        })
                        .catch(() => {});
                }
                return {
                    label: _lfmCache.isPlaying ? (_lfmCache.artist + ' - ' + _lfmCache.track).substring(0, 25) : 'Not playing',
                    icon: '🎵',
                    color: _lfmCache.isPlaying ? '#dc2626' : '#374151'
                };
            }
        },
        {
            id: 'send-to-chat',
            name: 'Send Now Playing to Chat',
            icon: '💬',
            settings: [
                { key: 'apiKey', label: 'Last.fm API Key', type: 'text', placeholder: 'your-api-key' },
                { key: 'username', label: 'Last.fm username', type: 'text', placeholder: 'your-username' },
                { key: 'template', label: 'Message template', type: 'text', placeholder: 'Now playing: {artist} - {track}', default: 'Now playing: {artist} - {track} #nowplaying' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.apiKey) throw new Error('API Key required');
                    if (!s.username) throw new Error('Username required');
                    const d = await _lfmApi('user.getrecenttracks', { user: s.username, limit: 1 }, s.apiKey);
                    const t = d.recenttracks?.track?.[0];
                    if (!t) throw new Error('No recent tracks found');
                    const artist = t.artist?.['#text'] || '';
                    const track = t.name || '';
                    const album = t.album?.['#text'] || '';
                    const template = s.template || 'Now playing: {artist} - {track} #nowplaying';
                    const msg = template.replace('{artist}', artist).replace('{track}', track).replace('{album}', album);
                    if (typeof sendChatMessage === 'undefined') throw new Error('Twitch chat not connected');
                    sendChatMessage(msg);
                    ctx.showToast('Sent to chat', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'profile-display',
            name: 'Last.fm Profile Stats',
            icon: '🎵',
            settings: [
                { key: 'apiKey', label: 'Last.fm API Key', type: 'text', placeholder: 'your-api-key' },
                { key: 'username', label: 'Last.fm username', type: 'text', placeholder: 'your-username' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.apiKey) throw new Error('API Key required');
                    if (!s.username) throw new Error('Username required');
                    const d = await _lfmApi('user.getinfo', { user: s.username }, s.apiKey);
                    _lfmCache.playcount = d.user?.playcount;
                    _lfmCache.profileFetch = Date.now();
                    ctx.showToast(s.username + ': ' + (_lfmCache.playcount || 'unknown') + ' plays', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const now = Date.now();
                if (now - (_lfmCache.profileFetch || 0) > 300000 && s.apiKey && s.username) {
                    _lfmCache.profileFetch = now;
                    _lfmApi('user.getinfo', { user: s.username }, s.apiKey)
                        .then(d => { _lfmCache.playcount = d.user?.playcount; })
                        .catch(() => {});
                }
                return {
                    label: _lfmCache.playcount != null ? _lfmCache.playcount + ' plays' : 'Loading...',
                    icon: '🎵'
                };
            }
        },
        {
            id: 'top-track',
            name: 'Show Top Track in Chat',
            icon: '🏆',
            settings: [
                { key: 'apiKey', label: 'Last.fm API Key', type: 'text', placeholder: 'your-api-key' },
                { key: 'username', label: 'Last.fm username', type: 'text', placeholder: 'your-username' },
                { key: 'period', label: 'Period', type: 'select', options: [
                    { value: '7day', label: 'This week' },
                    { value: '1month', label: 'This month' },
                    { value: 'overall', label: 'All time' }
                ]}
            ],
            async execute(s, ctx) {
                try {
                    if (!s.apiKey) throw new Error('API Key required');
                    if (!s.username) throw new Error('Username required');
                    const d = await _lfmApi('user.gettoptracks', { user: s.username, period: s.period || '7day', limit: 1 }, s.apiKey);
                    const t = d.toptracks?.track?.[0];
                    if (!t) throw new Error('No top tracks found');
                    const msg = 'My top track: ' + t.artist.name + ' - ' + t.name;
                    if (typeof sendChatMessage === 'undefined') throw new Error('Twitch chat not connected');
                    sendChatMessage(msg);
                    ctx.showToast('Sent top track to chat', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
