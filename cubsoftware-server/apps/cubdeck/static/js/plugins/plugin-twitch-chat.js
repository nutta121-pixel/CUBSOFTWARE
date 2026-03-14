/* ─── Twitch Chat Plugin ─── */
let _twitchWs = null;
let _twitchChannel = '';
let _twitchOauth = '';
let _twitchConnected = false;

function connectTwitchChat(channel, oauth) {
    if (_twitchWs) { try { _twitchWs.onclose = null; _twitchWs.close(); } catch(e){} _twitchWs = null; }
    _twitchChannel = channel.toLowerCase().replace('#', '');
    _twitchOauth = oauth;
    if (!_twitchChannel) return;

    _twitchWs = new WebSocket('wss://irc-ws.chat.twitch.tv:443');
    _twitchWs.onopen = () => {
        // Must request capabilities BEFORE PASS/NICK
        _twitchWs.send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership');
        if (_twitchOauth) {
            const pass = _twitchOauth.startsWith('oauth:') ? _twitchOauth : 'oauth:' + _twitchOauth;
            _twitchWs.send('PASS ' + pass);
            _twitchWs.send('NICK ' + _twitchChannel);
        } else {
            _twitchWs.send('PASS SCHMOOPIIE');
            _twitchWs.send('NICK justinfan' + Math.floor(Math.random() * 99999));
        }
        _twitchWs.send('JOIN #' + _twitchChannel);
        _twitchConnected = true;
    };
    _twitchWs.onmessage = (ev) => {
        ev.data.split('\r\n').forEach(line => {
            if (line.startsWith('PING')) _twitchWs.send('PONG :tmi.twitch.tv');
        });
    };
    _twitchWs.onclose = () => {
        _twitchConnected = false;
        setTimeout(() => connectTwitchChat(_twitchChannel, _twitchOauth), 5000);
    };
}

function sendChatMessage(msg) {
    if (!_twitchWs || !_twitchConnected) throw new Error('Not connected to Twitch chat');
    if (!_twitchOauth) throw new Error('OAuth token required to send messages');
    _twitchWs.send(`PRIVMSG #${_twitchChannel} :${msg}`);
}

function sendChatCommand(cmd, args) {
    sendChatMessage('/' + cmd + (args !== undefined && args !== '' ? ' ' + args : ''));
}

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const cfg = CubDeck.getCtx().config;
        if (cfg.twitch_channel) {
            connectTwitchChat(cfg.twitch_channel, cfg.twitch_oauth);
        }
    }, 500);
});

CubDeck.registerPlugin({
    id: 'twitch-chat',
    name: 'Twitch Chat',
    icon: '💬',
    actions: [
        {
            id: 'send-message',
            name: 'Send Chat Message',
            icon: '💬',
            settings: [{ key: 'message', label: 'Message', type: 'text', placeholder: '!gg or any text' }],
            async execute(s) {
                if (!s.message) throw new Error('No message set');
                sendChatMessage(s.message);
            }
        },
        {
            id: 'slow-mode',
            name: 'Slow Mode On',
            icon: '🐌',
            settings: [{ key: 'seconds', label: 'Seconds', type: 'number', min: 1, max: 1800, default: 30 }],
            async execute(s) { sendChatCommand('slow', parseInt(s.seconds) || 30); }
        },
        {
            id: 'slow-off',
            name: 'Slow Mode Off',
            icon: '🐇',
            settings: [],
            async execute() { sendChatCommand('slowoff'); }
        },
        {
            id: 'sub-only',
            name: 'Sub-Only Mode On',
            icon: '⭐',
            settings: [],
            async execute() { sendChatCommand('subscribers'); }
        },
        {
            id: 'sub-only-off',
            name: 'Sub-Only Mode Off',
            icon: '🌐',
            settings: [],
            async execute() { sendChatCommand('subscribersoff'); }
        },
        {
            id: 'emote-only',
            name: 'Emote-Only Mode On',
            icon: '😀',
            settings: [],
            async execute() { sendChatCommand('emoteonly'); }
        },
        {
            id: 'emote-only-off',
            name: 'Emote-Only Mode Off',
            icon: '💬',
            settings: [],
            async execute() { sendChatCommand('emoteonlyoff'); }
        },
        {
            id: 'follower-only',
            name: 'Follower-Only Mode On',
            icon: '❤️',
            settings: [{ key: 'minutes', label: 'Min. follow time (minutes, 0 = any)', type: 'number', min: 0, max: 129600, default: 0 }],
            async execute(s) { sendChatCommand('followers', parseInt(s.minutes) || 0); }
        },
        {
            id: 'follower-only-off',
            name: 'Follower-Only Mode Off',
            icon: '💔',
            settings: [],
            async execute() { sendChatCommand('followersoff'); }
        },
        {
            id: 'unique-chat',
            name: 'Unique Chat Mode On',
            icon: '🔡',
            settings: [],
            async execute() { sendChatCommand('uniquechat'); }
        },
        {
            id: 'unique-chat-off',
            name: 'Unique Chat Mode Off',
            icon: '🔤',
            settings: [],
            async execute() { sendChatCommand('uniquechatoff'); }
        },
        {
            id: 'clear-chat',
            name: 'Clear Chat',
            icon: '🗑️',
            settings: [],
            async execute() { sendChatCommand('clear'); }
        },
        {
            id: 'announce',
            name: 'Announce Message',
            icon: '📢',
            settings: [
                { key: 'message', label: 'Message', type: 'text', placeholder: 'Announcement text' },
                { key: 'color', label: 'Color', type: 'select', options: [
                    {value:'primary',label:'Primary (blue)'},
                    {value:'blue',label:'Blue'},
                    {value:'green',label:'Green'},
                    {value:'orange',label:'Orange'},
                    {value:'purple',label:'Purple'}
                ], default: 'primary' }
            ],
            async execute(s) {
                if (!s.message) throw new Error('No message set');
                const color = s.color && s.color !== 'primary' ? s.color : '';
                sendChatCommand('announce' + color, s.message);
            }
        },
        {
            id: 'shoutout',
            name: 'Shoutout User',
            icon: '📣',
            settings: [{ key: 'username', label: 'Username', type: 'text', placeholder: 'username' }],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('shoutout', s.username);
            }
        },
        {
            id: 'ban',
            name: 'Ban User',
            icon: '🔨',
            settings: [
                { key: 'username', label: 'Username', type: 'text', placeholder: 'username' },
                { key: 'reason', label: 'Reason (optional)', type: 'text', placeholder: '' }
            ],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('ban', s.username + (s.reason ? ' ' + s.reason : ''));
            }
        },
        {
            id: 'timeout',
            name: 'Timeout User',
            icon: '⏰',
            settings: [
                { key: 'username', label: 'Username', type: 'text', placeholder: 'username' },
                { key: 'seconds', label: 'Duration (seconds)', type: 'number', min: 1, max: 1209600, default: 600 }
            ],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('timeout', s.username + ' ' + (parseInt(s.seconds) || 600));
            }
        },
        {
            id: 'unban',
            name: 'Unban / Untimeout User',
            icon: '✅',
            settings: [{ key: 'username', label: 'Username', type: 'text', placeholder: 'username' }],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('unban', s.username);
            }
        },
        {
            id: 'vip',
            name: 'VIP User',
            icon: '💎',
            settings: [{ key: 'username', label: 'Username', type: 'text', placeholder: 'username' }],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('vip', s.username);
            }
        },
        {
            id: 'unvip',
            name: 'Remove VIP',
            icon: '🚫',
            settings: [{ key: 'username', label: 'Username', type: 'text', placeholder: 'username' }],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('unvip', s.username);
            }
        },
        {
            id: 'mod',
            name: 'Mod User',
            icon: '🛡️',
            settings: [{ key: 'username', label: 'Username', type: 'text', placeholder: 'username' }],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('mod', s.username);
            }
        },
        {
            id: 'unmod',
            name: 'Unmod User',
            icon: '⬇️',
            settings: [{ key: 'username', label: 'Username', type: 'text', placeholder: 'username' }],
            async execute(s) {
                if (!s.username) throw new Error('Username required');
                sendChatCommand('unmod', s.username);
            }
        },
        {
            id: 'color',
            name: 'Change Chat Color',
            icon: '🎨',
            settings: [{ key: 'color', label: 'Color', type: 'select', options: [
                {value:'blue',label:'Blue'},{value:'blueviolet',label:'Blue Violet'},
                {value:'cadetblue',label:'Cadet Blue'},{value:'chocolate',label:'Chocolate'},
                {value:'coral',label:'Coral'},{value:'dodgerblue',label:'Dodger Blue'},
                {value:'firebrick',label:'Firebrick'},{value:'goldenrod',label:'Goldenrod'},
                {value:'green',label:'Green'},{value:'hotpink',label:'Hot Pink'},
                {value:'orangered',label:'Orange Red'},{value:'red',label:'Red'},
                {value:'seagreen',label:'Sea Green'},{value:'springgreen',label:'Spring Green'},
                {value:'yellowgreen',label:'Yellow Green'}
            ], default: 'blue' }],
            async execute(s) { sendChatCommand('color', s.color || 'blue'); }
        },
        {
            id: 'marker',
            name: 'Add Stream Marker',
            icon: '📍',
            settings: [{ key: 'description', label: 'Description (optional)', type: 'text', placeholder: 'Clip this!' }],
            async execute(s) { sendChatCommand('marker', s.description || ''); }
        },
        {
            id: 'raid',
            name: 'Raid Channel',
            icon: '⚔️',
            settings: [{ key: 'channel', label: 'Channel to Raid', type: 'text', placeholder: 'channel' }],
            async execute(s) {
                if (!s.channel) throw new Error('Channel required');
                sendChatCommand('raid', s.channel);
            }
        },
        {
            id: 'unraid',
            name: 'Cancel Raid',
            icon: '🏳️',
            settings: [],
            async execute() { sendChatCommand('unraid'); }
        }
    ]
});
