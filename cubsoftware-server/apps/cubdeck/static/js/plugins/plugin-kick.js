/* ─── Kick.tv Plugin ─── */

const _kickCache = {};
let _kickChatWs = null;
let _kickChatConnected = false;
let _kickChatChannel = '';

CubDeck.registerPlugin({
    id: 'kick',
    name: 'Kick.tv',
    icon: '🟢',
    actions: [
        {
            id: 'live-stats',
            name: 'Live Stats Display',
            settings: [
                { key: 'channel', label: 'Channel slug', type: 'text', placeholder: 'yourchannel' }
            ],
            getState(s, ctx) {
                if (!s.channel) return { label: 'No channel', icon: '🟢' };
                const k = 'kick_live_' + s.channel;
                const now = Date.now();
                const cached = _kickCache[k];
                if (cached && now < cached.expires) {
                    return cached.state;
                }
                if (!_kickCache[k + '_f']) {
                    _kickCache[k + '_f'] = true;
                    fetch('https://kick.com/api/v2/channels/' + encodeURIComponent(s.channel))
                        .then(r => r.json())
                        .then(d => {
                            const live = d.livestream;
                            const state = live
                                ? { label: (live.viewer_count || 0).toLocaleString() + ' viewers', icon: '🟢', color: '#53fc18' }
                                : { label: 'Offline', icon: '⚫', color: '#666' };
                            _kickCache[k] = { state, expires: Date.now() + 30000 };
                            _kickCache[k + '_f'] = false;
                            if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                        })
                        .catch(() => {
                            _kickCache[k] = { state: { label: 'Error', icon: '⚠️' }, expires: Date.now() + 15000 };
                            _kickCache[k + '_f'] = false;
                        });
                }
                if (cached) return cached.state;
                return { label: 'Loading...', icon: '🟢' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.channel) throw new Error('Channel required');
                    const k = 'kick_live_' + s.channel;
                    delete _kickCache[k];
                    delete _kickCache[k + '_f'];
                    const r = await fetch('https://kick.com/api/v2/channels/' + encodeURIComponent(s.channel));
                    const d = await r.json();
                    const live = d.livestream;
                    if (live) {
                        ctx.showToast(`${d.user?.username || s.channel}: ${live.session_title} — ${live.viewer_count} viewers`, 'info');
                    } else {
                        ctx.showToast(`${s.channel} is offline`, 'info');
                    }
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'chat-connect',
            name: 'Connect to Kick Chat',
            settings: [
                { key: 'chatroom_id', label: 'Chatroom ID (from channel page URL)', type: 'text', placeholder: '12345' }
            ],
            getState(s, ctx) {
                return {
                    label: _kickChatConnected ? 'Chat Connected' : 'Connect Chat',
                    icon: '🟢',
                    color: _kickChatConnected ? '#53fc18' : '#374151',
                    active: _kickChatConnected
                };
            },
            async execute(s, ctx) {
                try {
                    if (!s.chatroom_id) throw new Error('Chatroom ID required');
                    if (_kickChatWs) { _kickChatWs.close(); _kickChatWs = null; }
                    // Kick uses Pusher WebSocket for chat
                    const appKey = 'eb1d5f283081a78b932c';
                    const ws = new WebSocket(`wss://ws-us2.pusher.com/app/${appKey}?protocol=7&client=js&version=7.4.0&flash=false`);
                    ws.onopen = () => {
                        ws.send(JSON.stringify({
                            event: 'pusher:subscribe',
                            data: { auth: '', channel: `chatrooms.${s.chatroom_id}.v2` }
                        }));
                        _kickChatConnected = true;
                        _kickChatChannel = s.chatroom_id;
                        ctx.showToast('Connected to Kick chat room ' + s.chatroom_id, 'success');
                        ctx.refreshAllButtons();
                    };
                    ws.onmessage = (ev) => {
                        try {
                            const msg = JSON.parse(ev.data);
                            if (msg.event === 'App\\Events\\ChatMessageEvent') {
                                const data = JSON.parse(msg.data);
                                console.log('[Kick Chat]', data.sender?.username + ':', data.content);
                            }
                        } catch (e) {}
                    };
                    ws.onclose = () => {
                        _kickChatConnected = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    };
                    ws.onerror = () => {
                        _kickChatConnected = false;
                        ctx.showToast('Kick chat connection error', 'error');
                    };
                    _kickChatWs = ws;
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'chat-disconnect',
            name: 'Disconnect Kick Chat',
            settings: [],
            async execute(s, ctx) {
                if (_kickChatWs) {
                    _kickChatWs.close();
                    _kickChatWs = null;
                    _kickChatConnected = false;
                    ctx.showToast('Kick chat disconnected', 'info');
                    ctx.refreshAllButtons();
                } else {
                    ctx.showToast('Not connected', 'info');
                }
            }
        },
        {
            id: 'open-channel',
            name: 'Open Channel Page',
            settings: [
                { key: 'channel', label: 'Channel slug', type: 'text', placeholder: 'yourchannel' }
            ],
            async execute(s, ctx) {
                if (!s.channel) return ctx.showToast('Channel required', 'error');
                window.open('https://kick.com/' + encodeURIComponent(s.channel), '_blank');
            }
        }
    ]
});
