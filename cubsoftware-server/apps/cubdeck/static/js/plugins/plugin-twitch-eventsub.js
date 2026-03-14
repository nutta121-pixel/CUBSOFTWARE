/* ─── Twitch EventSub Plugin ─── */

let _esSocket = null;
let _esSessionId = null;
let _esSubscriptions = [];
let _esConnected = false;
let _esStats = { follows: 0, subs: 0, cheers: 0, raids: 0, lastEvent: '', lastEventType: '' };
let _esOauth = '';
let _esUserId = '';

async function _esConnect(oauth) {
    if (_esSocket) { try { _esSocket.close(); } catch(e) {} }
    _esOauth = oauth.replace(/^oauth:/, '');
    _esSocket = new WebSocket('wss://eventsub.wss.twitch.tv/ws');
    _esSocket.onmessage = async (ev) => {
        const msg = JSON.parse(ev.data);
        const type = msg.metadata?.message_type;
        if (type === 'session_welcome') {
            _esSessionId = msg.payload.session.id;
            _esConnected = true;
            await _esSubscribeAll();
        } else if (type === 'notification') {
            _esHandleEvent(msg.payload);
        } else if (type === 'session_keepalive') {
            // no-op
        }
    };
    _esSocket.onclose = () => { _esConnected = false; _esSessionId = null; };
    _esSocket.onerror = () => { _esConnected = false; };
}

async function _esSubscribeAll() {
    if (!_esSessionId || !_esOauth || !_esUserId) return;
    const token = _esOauth;
    const bid = _esUserId;
    const subs = [
        { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: bid, moderator_user_id: bid } },
        { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: bid } },
        { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: bid } },
        { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: bid } },
        { type: 'channel.hype_train.begin', version: '1', condition: { broadcaster_user_id: bid } },
    ];
    for (const sub of subs) {
        try {
            await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': '9n9yjc79p44kpsluv81kvvh6h9bxvu', 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...sub, transport: { method: 'websocket', session_id: _esSessionId } })
            });
        } catch(e) { console.warn('EventSub subscription failed:', e); }
    }
}

function _esHandleEvent(payload) {
    const type = payload.subscription?.type;
    const event = payload.event || {};
    if (type === 'channel.follow') {
        _esStats.follows++;
        _esStats.lastEvent = event.user_name + ' followed';
        _esStats.lastEventType = 'follow';
    } else if (type === 'channel.subscribe') {
        _esStats.subs++;
        _esStats.lastEvent = event.user_name + ' subscribed';
        _esStats.lastEventType = 'sub';
    } else if (type === 'channel.cheer') {
        _esStats.cheers += event.bits || 0;
        _esStats.lastEvent = event.user_name + ' cheered ' + event.bits + ' bits';
        _esStats.lastEventType = 'cheer';
    } else if (type === 'channel.raid') {
        _esStats.raids++;
        _esStats.lastEvent = event.from_broadcaster_user_name + ' raided with ' + event.viewers + ' viewers';
        _esStats.lastEventType = 'raid';
    } else if (type === 'channel.hype_train.begin') {
        _esStats.lastEvent = 'Hype train started! Level ' + event.level;
        _esStats.lastEventType = 'hype';
    }
}

CubDeck.registerPlugin({
    id: 'twitch-eventsub',
    name: 'Twitch Events',
    icon: '📡',
    actions: [
        {
            id: 'connect',
            name: 'Connect to EventSub',
            icon: '📡',
            settings: [],
            async execute(s, ctx) {
                try {
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    _esUserId = user.id;
                    await _esConnect(ctx.config.twitch_oauth);
                    ctx.showToast('EventSub connecting...', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                return {
                    label: _esConnected ? 'Connected' : 'Connect EventSub',
                    icon: '📡',
                    color: _esConnected ? '#16a34a' : '#374151',
                    active: _esConnected
                };
            }
        },
        {
            id: 'follow-counter',
            name: 'Follow Counter Display',
            icon: '❤️',
            settings: [],
            async execute(s, ctx) {
                try {
                    ctx.showToast('Follow count: ' + _esStats.follows, 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                return {
                    label: _esStats.follows + ' follows',
                    icon: '❤️',
                    color: _esStats.follows > 0 ? '#dc2626' : '#374151'
                };
            }
        },
        {
            id: 'sub-counter',
            name: 'Sub Counter Display',
            icon: '⭐',
            settings: [],
            async execute(s, ctx) {
                try {
                    ctx.showToast('Sub count: ' + _esStats.subs, 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                return {
                    label: _esStats.subs + ' subs',
                    icon: '⭐',
                    color: _esStats.subs > 0 ? '#9147ff' : '#374151'
                };
            }
        },
        {
            id: 'last-event',
            name: 'Last Event Display',
            icon: '📡',
            settings: [],
            async execute(s, ctx) {
                try {
                    ctx.showToast(_esStats.lastEvent || 'No events yet', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                let icon = '📡';
                if (_esStats.lastEventType === 'follow') icon = '❤️';
                else if (_esStats.lastEventType === 'sub') icon = '⭐';
                else if (_esStats.lastEventType === 'raid') icon = '⚔️';
                else if (_esStats.lastEventType === 'cheer') icon = '💎';
                return {
                    label: _esStats.lastEvent || 'No events yet',
                    icon: icon
                };
            }
        },
        {
            id: 'reset-counts',
            name: 'Reset Event Counters',
            icon: '🔄',
            settings: [],
            async execute(s, ctx) {
                try {
                    _esStats = { follows: 0, subs: 0, cheers: 0, raids: 0, lastEvent: '', lastEventType: '' };
                    ctx.showToast('Counters reset', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
