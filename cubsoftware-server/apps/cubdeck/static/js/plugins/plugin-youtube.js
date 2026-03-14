/* ─── YouTube Plugin ─── */

const _ytCache = { subs: null, viewers: null, title: null, lastFetch: 0, subsFetch: 0, viewersFetch: 0, streamId: null, liveChatId: null };

async function _ytApi(path, apiKey) {
    if (!apiKey) throw new Error('No YouTube API key set');
    const r = await fetch('https://www.googleapis.com/youtube/v3' + path + '&key=' + apiKey);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || 'YouTube API error'); }
    return r.json();
}

async function _ytGetLiveBroadcast(accessToken) {
    const r = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet,status,contentDetails&broadcastStatus=active&broadcastType=all&maxResults=1', {
        headers: { 'Authorization': 'Bearer ' + accessToken }
    });
    const d = await r.json();
    return d.items?.[0] || null;
}

CubDeck.registerPlugin({
    id: 'youtube',
    name: 'YouTube',
    icon: '▶️',
    actions: [
        {
            id: 'subscriber-count',
            name: 'Subscriber Count Display',
            icon: '▶️',
            settings: [
                { key: 'channelId', label: 'YouTube Channel ID', type: 'text', placeholder: 'UCxxxxxxxxx' },
                { key: 'apiKey', label: 'YouTube Data API v3 Key', type: 'text', placeholder: 'AIza...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.channelId) throw new Error('Channel ID required');
                    if (!s.apiKey) throw new Error('API key required');
                    const d = await _ytApi('/channels?part=statistics&id=' + s.channelId, s.apiKey);
                    _ytCache.subs = d.items?.[0]?.statistics?.subscriberCount;
                    _ytCache.subsFetch = Date.now();
                    ctx.showToast('Subs: ' + (_ytCache.subs || 'unknown'), 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const now = Date.now();
                if (now - (_ytCache.subsFetch || 0) > 60000 && s.channelId && s.apiKey) {
                    _ytCache.subsFetch = now;
                    _ytApi('/channels?part=statistics&id=' + s.channelId, s.apiKey)
                        .then(d => { _ytCache.subs = d.items?.[0]?.statistics?.subscriberCount; })
                        .catch(() => {});
                }
                return {
                    label: _ytCache.subs != null ? _ytCache.subs + ' subs' : 'Loading...',
                    icon: '▶️',
                    color: '#dc2626'
                };
            }
        },
        {
            id: 'live-viewer-count',
            name: 'Live Viewer Count',
            icon: '👁️',
            settings: [
                { key: 'accessToken', label: 'YouTube OAuth Access Token', type: 'text', placeholder: 'ya29...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.accessToken) throw new Error('Access token required');
                    const broadcast = await _ytGetLiveBroadcast(s.accessToken);
                    if (!broadcast) throw new Error('No active live broadcast');
                    _ytCache.streamId = broadcast.id;
                    _ytCache.liveChatId = broadcast.snippet?.liveChatId;
                    ctx.showToast('Active broadcast found', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const now = Date.now();
                if (now - (_ytCache.viewersFetch || 0) > 15000 && s.accessToken) {
                    _ytCache.viewersFetch = now;
                    _ytGetLiveBroadcast(s.accessToken)
                        .then(b => {
                            if (b) {
                                _ytCache.viewers = b.snippet?.concurrentViewers || null;
                                _ytCache.streamId = b.id;
                                _ytCache.liveChatId = b.snippet?.liveChatId;
                            } else {
                                _ytCache.viewers = null;
                            }
                        })
                        .catch(() => {});
                }
                return {
                    label: _ytCache.viewers != null ? _ytCache.viewers + ' viewers' : 'Offline',
                    icon: '👁️',
                    color: _ytCache.viewers > 0 ? '#dc2626' : '#374151'
                };
            }
        },
        {
            id: 'update-stream-title',
            name: 'Update Live Stream Title',
            icon: '✏️',
            settings: [
                { key: 'title', label: 'New title', type: 'text', placeholder: 'My awesome stream' },
                { key: 'accessToken', label: 'YouTube OAuth Access Token', type: 'text', placeholder: 'ya29...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.title) throw new Error('Title required');
                    if (!s.accessToken) throw new Error('Access token required');
                    const broadcast = await _ytGetLiveBroadcast(s.accessToken);
                    if (!broadcast) throw new Error('No active live broadcast');
                    const snippet = broadcast.snippet;
                    snippet.title = s.title;
                    const r = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts?part=snippet', {
                        method: 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + s.accessToken,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ id: broadcast.id, snippet })
                    });
                    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || 'Update failed'); }
                    ctx.showToast('Title updated', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'send-live-chat',
            name: 'Send Live Chat Message',
            icon: '💬',
            settings: [
                { key: 'message', label: 'Message', type: 'text', placeholder: 'Hello YouTube!' },
                { key: 'liveChatId', label: 'Live Chat ID (from broadcast)', type: 'text', placeholder: 'Cg...' },
                { key: 'accessToken', label: 'Access Token', type: 'text', placeholder: 'ya29...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.message) throw new Error('Message required');
                    if (!s.liveChatId) throw new Error('Live Chat ID required');
                    if (!s.accessToken) throw new Error('Access token required');
                    const r = await fetch('https://www.googleapis.com/youtube/v3/liveChat/messages?part=snippet', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + s.accessToken,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            snippet: {
                                liveChatId: s.liveChatId,
                                type: 'textMessageEvent',
                                textMessageDetails: { messageText: s.message }
                            }
                        })
                    });
                    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || 'Send failed'); }
                    ctx.showToast('Message sent to YT chat', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'end-live-stream',
            name: 'End Live Stream',
            icon: '⏹️',
            settings: [
                { key: 'accessToken', label: 'Access Token', type: 'text', placeholder: 'ya29...' },
                { key: 'broadcastId', label: 'Broadcast ID', type: 'text', placeholder: 'broadcast-id' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.accessToken) throw new Error('Access token required');
                    if (!s.broadcastId) throw new Error('Broadcast ID required');
                    const r = await fetch('https://www.googleapis.com/youtube/v3/liveBroadcasts/transition?broadcastStatus=complete&id=' + encodeURIComponent(s.broadcastId) + '&part=status', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + s.accessToken }
                    });
                    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || 'End stream failed'); }
                    ctx.showToast('Stream ended', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
