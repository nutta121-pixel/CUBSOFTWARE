/* ─── Stream Manager Plugin ─── */

const _streamManagerCache = {}; // key → { data, expires }

async function _twitchApi(method, path, body, oauth) {
    const token = (oauth || '').replace(/^oauth:/, '');
    if (!token) throw new Error('No Twitch OAuth token. Connect Twitch in Settings first.');
    const opts = {
        method,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Client-Id': '9n9yjc79p44kpsluv81kvvh6h9bxvu',
            'Content-Type': 'application/json'
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch('https://api.twitch.tv/helix' + path, opts);
    if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error(err.message || ('HTTP ' + r.status));
    }
    return r.status === 204 ? null : r.json();
}

async function _getTwitchUserId(oauth) {
    const data = await _twitchApi('GET', '/users', null, oauth);
    return data.data[0];
}

CubDeck.registerPlugin({
    id: 'stream-manager',
    name: 'Stream Manager',
    icon: '📡',
    actions: [
        {
            id: 'update-title',
            name: 'Update Stream Title',
            icon: '✏️',
            settings: [
                { key: 'title', label: 'New title', type: 'text', placeholder: 'My awesome stream' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.title) throw new Error('Title required');
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    await _twitchApi('PATCH', '/channels?broadcaster_id=' + user.id, { title: s.title }, oauth);
                    ctx.showToast('Title updated', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'update-category',
            name: 'Update Stream Category',
            icon: '🎮',
            settings: [
                { key: 'game', label: 'Game/Category name', type: 'text', placeholder: 'Just Chatting' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.game) throw new Error('Game/Category name required');
                    const oauth = ctx.config.twitch_oauth;
                    const games = await _twitchApi('GET', '/games?name=' + encodeURIComponent(s.game), null, oauth);
                    if (!games.data || games.data.length === 0) throw new Error('Category not found: ' + s.game);
                    const gameId = games.data[0].id;
                    const gameName = games.data[0].name;
                    const user = await _getTwitchUserId(oauth);
                    await _twitchApi('PATCH', '/channels?broadcaster_id=' + user.id, { game_id: gameId }, oauth);
                    ctx.showToast('Category updated: ' + gameName, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'update-title-and-category',
            name: 'Update Title + Category',
            icon: '📝',
            settings: [
                { key: 'title', label: 'New title', type: 'text', placeholder: 'My awesome stream' },
                { key: 'game', label: 'Game/Category name', type: 'text', placeholder: 'Just Chatting' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.title) throw new Error('Title required');
                    if (!s.game) throw new Error('Game/Category name required');
                    const oauth = ctx.config.twitch_oauth;
                    const games = await _twitchApi('GET', '/games?name=' + encodeURIComponent(s.game), null, oauth);
                    if (!games.data || games.data.length === 0) throw new Error('Category not found: ' + s.game);
                    const gameId = games.data[0].id;
                    const user = await _getTwitchUserId(oauth);
                    await _twitchApi('PATCH', '/channels?broadcaster_id=' + user.id, {
                        title: s.title,
                        game_id: gameId
                    }, oauth);
                    ctx.showToast('Stream info updated', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'create-marker',
            name: 'Create Stream Marker',
            icon: '📍',
            settings: [
                { key: 'description', label: 'Marker description', type: 'text', placeholder: 'Highlight this!' }
            ],
            async execute(s, ctx) {
                try {
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    await _twitchApi('POST', '/streams/markers', {
                        user_id: user.id,
                        description: s.description || ''
                    }, oauth);
                    ctx.showToast('Marker created', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'viewer-count',
            name: 'Viewer Count Display',
            icon: '👁️',
            settings: [],
            getState(s, ctx) {
                const channel = ctx.config && ctx.config.twitch_channel;
                const oauth = ctx.config && ctx.config.twitch_oauth;
                if (!channel || !oauth) return { label: 'No Twitch', icon: '📡' };
                const cacheKey = 'viewers_' + channel;
                const now = Date.now();
                const cached = _streamManagerCache[cacheKey];
                if (cached && now < cached.expires) {
                    const count = cached.data;
                    return {
                        label: count + ' viewers',
                        icon: '👁️',
                        color: count > 0 ? '#9147ff' : '#666'
                    };
                }
                // Kick off async fetch without blocking getState
                if (!_streamManagerCache[cacheKey + '_fetching']) {
                    _streamManagerCache[cacheKey + '_fetching'] = true;
                    const token = (oauth || '').replace(/^oauth:/, '');
                    fetch('https://api.twitch.tv/helix/streams?user_login=' + encodeURIComponent(channel), {
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Client-Id': '9n9yjc79p44kpsluv81kvvh6h9bxvu'
                        }
                    }).then(r => r.json()).then(d => {
                        const stream = d.data && d.data[0];
                        const count = stream ? stream.viewer_count : 0;
                        _streamManagerCache[cacheKey] = { data: count, expires: Date.now() + 15000 };
                        _streamManagerCache[cacheKey + '_fetching'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => {
                        _streamManagerCache[cacheKey] = { data: 0, expires: Date.now() + 15000 };
                        _streamManagerCache[cacheKey + '_fetching'] = false;
                    });
                }
                if (cached) {
                    const count = cached.data;
                    return { label: count + ' viewers', icon: '👁️', color: count > 0 ? '#9147ff' : '#666' };
                }
                return { label: 'Offline', icon: '📡' };
            },
            async execute(s, ctx) {
                // Clear cache to force refresh on click
                const channel = ctx.config && ctx.config.twitch_channel;
                if (channel) {
                    delete _streamManagerCache['viewers_' + channel];
                    delete _streamManagerCache['viewers_' + channel + '_fetching'];
                }
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'follower-count',
            name: 'Follower Count Display',
            icon: '❤️',
            settings: [],
            getState(s, ctx) {
                const channel = ctx.config && ctx.config.twitch_channel;
                const oauth = ctx.config && ctx.config.twitch_oauth;
                if (!channel || !oauth) return { label: 'No Twitch', icon: '❤️' };
                const cacheKey = 'followers_' + channel;
                const now = Date.now();
                const cached = _streamManagerCache[cacheKey];
                if (cached && now < cached.expires) {
                    return { label: cached.data + ' followers', icon: '❤️' };
                }
                if (!_streamManagerCache[cacheKey + '_fetching']) {
                    _streamManagerCache[cacheKey + '_fetching'] = true;
                    const token = (oauth || '').replace(/^oauth:/, '');
                    // Need broadcaster_id — fetch user first
                    fetch('https://api.twitch.tv/helix/users?login=' + encodeURIComponent(channel), {
                        headers: {
                            'Authorization': 'Bearer ' + token,
                            'Client-Id': '9n9yjc79p44kpsluv81kvvh6h9bxvu'
                        }
                    }).then(r => r.json()).then(ud => {
                        const userId = ud.data && ud.data[0] && ud.data[0].id;
                        if (!userId) throw new Error('User not found');
                        return fetch('https://api.twitch.tv/helix/channels/followers?broadcaster_id=' + userId, {
                            headers: {
                                'Authorization': 'Bearer ' + token,
                                'Client-Id': '9n9yjc79p44kpsluv81kvvh6h9bxvu'
                            }
                        });
                    }).then(r => r.json()).then(d => {
                        const count = d.total || 0;
                        _streamManagerCache[cacheKey] = { data: count, expires: Date.now() + 60000 };
                        _streamManagerCache[cacheKey + '_fetching'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => {
                        _streamManagerCache[cacheKey] = { data: '?', expires: Date.now() + 60000 };
                        _streamManagerCache[cacheKey + '_fetching'] = false;
                    });
                }
                if (cached) return { label: cached.data + ' followers', icon: '❤️' };
                return { label: '... followers', icon: '❤️' };
            },
            async execute(s, ctx) {
                const channel = ctx.config && ctx.config.twitch_channel;
                if (channel) {
                    delete _streamManagerCache['followers_' + channel];
                    delete _streamManagerCache['followers_' + channel + '_fetching'];
                }
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'run-ad',
            name: 'Run Ad',
            icon: '📺',
            settings: [
                { key: 'length', label: 'Ad length', type: 'select', options: [
                    { value: '30', label: '30 seconds' },
                    { value: '60', label: '60 seconds' },
                    { value: '90', label: '90 seconds' },
                    { value: '120', label: '120 seconds' },
                    { value: '150', label: '150 seconds' },
                    { value: '180', label: '180 seconds' }
                ], default: '30' }
            ],
            async execute(s, ctx) {
                try {
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    await _twitchApi('POST', '/channels/commercial', {
                        broadcaster_id: user.id,
                        length: parseInt(s.length) || 30
                    }, oauth);
                    ctx.showToast('Ad started (' + (s.length || 30) + 's)', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
