/* ─── StreamElements Plugin ─── */

let _seToken = '';
let _seChannel = '';
const _seCache = { points: null, lastFetch: 0 };

async function _seApi(method, path, body, token) {
    const opts = {
        method,
        headers: {
            'Authorization': 'Bearer ' + token,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        }
    };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch('https://api.streamelements.com/kappa/v2' + path, opts);
    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'HTTP ' + r.status); }
    return r.status === 204 ? null : r.json();
}

CubDeck.registerPlugin({
    id: 'streamelements',
    name: 'StreamElements',
    icon: '⚡',
    actions: [
        {
            id: 'bot-say',
            name: 'SE Bot Say in Chat',
            icon: '🤖',
            settings: [
                { key: 'token', label: 'StreamElements JWT Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'channel', label: 'Channel username', type: 'text', placeholder: 'your_channel' },
                { key: 'message', label: 'Message', type: 'text', placeholder: 'Hello from SE Bot!' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token) throw new Error('SE JWT Token required');
                    if (!s.channel) throw new Error('Channel required');
                    if (!s.message) throw new Error('Message required');
                    _seToken = s.token;
                    _seChannel = s.channel;
                    await _seApi('POST', '/bot/' + s.channel + '/say', { message: s.message }, s.token);
                    ctx.showToast('Bot said: ' + s.message, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'test-alert',
            name: 'Trigger Test Alert',
            icon: '🚨',
            settings: [
                { key: 'token', label: 'SE JWT Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'channel', label: 'Channel ID or slug', type: 'text', placeholder: 'your_channel' },
                { key: 'alertType', label: 'Alert type', type: 'select', options: [
                    { value: 'follower', label: 'Follower' },
                    { value: 'subscriber', label: 'Subscriber' },
                    { value: 'donation', label: 'Donation' },
                    { value: 'host', label: 'Host' },
                    { value: 'raid', label: 'Raid' },
                    { value: 'cheer', label: 'Cheer' }
                ]}
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token) throw new Error('SE JWT Token required');
                    if (!s.channel) throw new Error('Channel required');
                    await _seApi('POST', '/tips/' + s.channel + '/test', { provider: s.alertType || 'follower' }, s.token);
                    ctx.showToast('Test alert sent: ' + (s.alertType || 'follower'), 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'get-points',
            name: 'Get User Points',
            icon: '💰',
            settings: [
                { key: 'token', label: 'SE JWT Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'channel', label: 'Channel ID', type: 'text', placeholder: 'channel-id' },
                { key: 'username', label: 'Username to check', type: 'text', placeholder: 'username' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token) throw new Error('SE JWT Token required');
                    if (!s.channel) throw new Error('Channel required');
                    if (!s.username) throw new Error('Username required');
                    const data = await _seApi('GET', '/points/' + s.channel + '/' + s.username, null, s.token);
                    const pts = data?.points ?? data?.data?.points ?? 'unknown';
                    ctx.showToast(s.username + ' has ' + pts + ' points', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'give-points',
            name: 'Give Points to User',
            icon: '🎁',
            settings: [
                { key: 'token', label: 'SE JWT Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'channel', label: 'Channel ID', type: 'text', placeholder: 'channel-id' },
                { key: 'username', label: 'Username', type: 'text', placeholder: 'username' },
                { key: 'amount', label: 'Points to give', type: 'number', default: 100, min: 1 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token) throw new Error('SE JWT Token required');
                    if (!s.channel) throw new Error('Channel required');
                    if (!s.username) throw new Error('Username required');
                    const amount = parseInt(s.amount) || 100;
                    await _seApi('PUT', '/points/' + s.channel + '/' + s.username + '/' + amount, null, s.token);
                    ctx.showToast('Gave ' + amount + ' pts to ' + s.username, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'run-giveaway',
            name: 'Start Giveaway',
            icon: '🎉',
            settings: [
                { key: 'token', label: 'SE JWT Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'channel', label: 'Channel ID', type: 'text', placeholder: 'channel-id' },
                { key: 'keyword', label: 'Giveaway keyword', type: 'text', placeholder: '!enter' },
                { key: 'duration', label: 'Duration minutes', type: 'number', default: 5, min: 1, max: 60 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token) throw new Error('SE JWT Token required');
                    if (!s.channel) throw new Error('Channel required');
                    if (!s.keyword) throw new Error('Keyword required');
                    await _seApi('POST', '/giveaway/' + s.channel + '/start', {
                        keyword: s.keyword,
                        duration: (parseInt(s.duration) || 5) * 60
                    }, s.token);
                    ctx.showToast('Giveaway started!', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'song-request',
            name: 'Song Request',
            icon: '🎵',
            settings: [
                { key: 'token', label: 'SE JWT Token', type: 'text', placeholder: 'eyJ...' },
                { key: 'channel', label: 'Channel ID', type: 'text', placeholder: 'channel-id' },
                { key: 'song', label: 'Song URL or search query', type: 'text', placeholder: 'https://youtube.com/watch?v=...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.token) throw new Error('SE JWT Token required');
                    if (!s.channel) throw new Error('Channel required');
                    if (!s.song) throw new Error('Song required');
                    await _seApi('POST', '/songrequest/' + s.channel + '/queue', { videoId: s.song }, s.token);
                    ctx.showToast('Song requested: ' + s.song, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
