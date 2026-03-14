/* Multi-Twitch - Watch multiple Twitch streams with live chat */

const TWITCH_CLIENT_ID = window.TWITCH_CLIENT_ID || '';
const TWITCH_REDIRECT_URI = window.TWITCH_REDIRECT_URI || window.location.origin + '/apps/multi-twitch';
const PARENT_DOMAIN = window.location.hostname;
const MAX_STREAMS = 6;

const state = {
    channels: [],
    ircs: {},
    players: {},
    twitchUser: null,
    chatsHidden: false
};

// Stable reference to the empty state node so getElementById never returns null after removal
let emptyStateNode = null;

/* ─── IRC Client (chat only) ─── */
class TwitchIRC {
    constructor(channel, onMessage, onStatus) {
        this.channel = channel.toLowerCase();
        this.onMessage = onMessage;
        this.onStatus = onStatus;
        this.ws = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.destroyed = false;
        this.connect();
    }

    connect() {
        if (this.destroyed) return;
        this.ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443');

        this.ws.onopen = () => {
            const token = state.twitchUser ? state.twitchUser.token : null;
            const nick = state.twitchUser ? state.twitchUser.login : `justinfan${Math.floor(Math.random() * 999999)}`;
            this.ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands');
            this.ws.send(`PASS ${token ? 'oauth:' + token : 'SCHMOOPIIE'}`);
            this.ws.send(`NICK ${nick}`);
            this.ws.send(`JOIN #${this.channel}`);
        };

        this.ws.onmessage = (e) => {
            const lines = e.data.split('\r\n').filter(Boolean);
            for (const line of lines) {
                if (line === 'PING :tmi.twitch.tv') {
                    this.ws.send('PONG :tmi.twitch.tv');
                    continue;
                }
                if (line.includes('JOIN') && line.includes(this.channel)) {
                    this.connected = true;
                    this.onStatus('connected');
                    continue;
                }
                if (line.includes('PRIVMSG')) {
                    const tagMatch = line.match(/^@([^ ]+) :(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
                    const simpleMatch = !tagMatch && line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
                    if (tagMatch) {
                        const tags = Object.fromEntries(tagMatch[1].split(';').map(t => t.split('=')));
                        const color = tags.color || '#9147ff';
                        const displayName = tags['display-name'] || tagMatch[2];
                        this.onMessage({ username: displayName, message: tagMatch[3], color });
                    } else if (simpleMatch) {
                        this.onMessage({ username: simpleMatch[1], message: simpleMatch[2], color: '#9147ff' });
                    }
                }
            }
        };

        this.ws.onclose = () => {
            this.connected = false;
            if (!this.destroyed) {
                this.onStatus('disconnected');
                this.reconnectTimer = setTimeout(() => this.connect(), 4000);
            }
        };

        this.ws.onerror = () => { this.ws.close(); };
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(`PRIVMSG #${this.channel} :${message}`);
            return true;
        }
        return false;
    }

    destroy() {
        this.destroyed = true;
        clearTimeout(this.reconnectTimer);
        if (this.ws) this.ws.close();
    }
}

/* ─── Auth ─── */
function loginWithTwitch() {
    if (!TWITCH_CLIENT_ID) {
        alert('Twitch login is not configured on this server. Contact the admin.');
        return;
    }
    const scopes = 'chat:read+chat:edit+user:read:email';
    const url = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT_URI)}&response_type=token&scope=${scopes}`;
    window.location.href = url;
}

async function verifyToken(token) {
    try {
        const res = await fetch('https://id.twitch.tv/oauth2/validate', {
            headers: { 'Authorization': `OAuth ${token}` }
        });
        if (!res.ok) return null;
        const data = await res.json();
        const userRes = await fetch(`https://api.twitch.tv/helix/users?login=${data.login}`, {
            headers: { 'Authorization': `Bearer ${token}`, 'Client-Id': TWITCH_CLIENT_ID }
        });
        const userData = await userRes.json();
        const pfp = userData.data?.[0]?.profile_image_url || '';
        return { login: data.login, display_name: data.login, profile_image_url: pfp, token };
    } catch { return null; }
}

function logoutTwitch() {
    sessionStorage.removeItem('twitch_token');
    state.twitchUser = null;
    updateAuthUI();
    for (const ch of state.channels) reconnectIRC(ch);
}

function updateAuthUI() {
    const loggedOut = document.getElementById('authLoggedOut');
    const loggedIn = document.getElementById('authLoggedIn');
    if (state.twitchUser) {
        loggedOut.style.display = 'none';
        loggedIn.style.display = 'flex';
        document.getElementById('authUsername').textContent = state.twitchUser.display_name || state.twitchUser.login;
        const avatar = document.getElementById('authAvatar');
        if (state.twitchUser.profile_image_url) {
            avatar.src = state.twitchUser.profile_image_url;
            avatar.style.display = 'block';
        } else {
            avatar.style.display = 'none';
        }
    } else {
        loggedOut.style.display = 'flex';
        loggedIn.style.display = 'none';
    }
    for (const ch of state.channels) updateChatInputState(ch);
}

/* ─── Twitch Player (video + online/offline detection) ─── */
function createPlayer(channel) {
    const wrap = document.getElementById(`player-${channel}`);
    if (!wrap) return;

    const isMuted = state.channels.indexOf(channel) > 0;

    try {
        const player = new Twitch.Player(`player-${channel}`, {
            channel: channel,
            parent: [PARENT_DOMAIN],
            width: '100%',
            height: '100%',
            autoplay: true,
            muted: isMuted
        });

        player.addEventListener(Twitch.Player.ONLINE, () => {
            document.getElementById(`live-badge-${channel}`)?.classList.add('visible');
            document.getElementById(`offline-badge-${channel}`)?.classList.remove('visible');
        });

        player.addEventListener(Twitch.Player.OFFLINE, () => {
            document.getElementById(`live-badge-${channel}`)?.classList.remove('visible');
            document.getElementById(`offline-badge-${channel}`)?.classList.add('visible');
        });

        state.players[channel] = player;
    } catch (e) {
        console.warn('Twitch.Player failed, falling back to iframe:', e);
        wrap.innerHTML = `<iframe src="https://player.twitch.tv/?channel=${channel}&parent=${PARENT_DOMAIN}&autoplay=true&muted=${isMuted}" allow="autoplay; fullscreen" style="width:100%;height:100%;border:none;display:block;"></iframe>`;
    }
}

/* ─── Stream panels ─── */
function createPanel(channel) {
    const panel = document.createElement('div');
    panel.className = 'stream-panel';
    panel.dataset.channel = channel;

    panel.innerHTML = `
        <div class="stream-header">
            <div class="stream-header-left">
                <span class="stream-badge live-badge" id="live-badge-${channel}">LIVE</span>
                <span class="stream-badge offline-badge" id="offline-badge-${channel}">OFFLINE</span>
                <span class="stream-channel-name">${channel}</span>
            </div>
            <div class="stream-header-right" style="display:flex;align-items:center;gap:6px">
                <a href="https://twitch.tv/${channel}" target="_blank" rel="noopener" class="btn-open-twitch">Open on Twitch ↗</a>
                <button class="btn-remove-stream" data-channel="${channel}" title="Remove stream">&times;</button>
            </div>
        </div>
        <div class="stream-body">
            <div class="stream-video-wrap" id="player-${channel}"></div>
            <div class="stream-chat" id="chat-${channel}">
                <div class="chat-messages" id="msgs-${channel}">
                    <div class="chat-connecting">Connecting to chat...</div>
                </div>
                <div class="chat-input-area" id="input-area-${channel}"></div>
            </div>
        </div>
    `;

    panel.querySelector('.btn-remove-stream').addEventListener('click', () => removeStream(channel));
    return panel;
}

function updateChatInputState(channel) {
    const area = document.getElementById(`input-area-${channel}`);
    if (!area) return;
    area.innerHTML = '';
    if (state.twitchUser) {
        area.innerHTML = `
            <div class="chat-input-row">
                <input type="text" id="chatinput-${channel}" placeholder="Send a message..." maxlength="500">
                <button class="btn-chat-send" data-channel="${channel}">Send</button>
            </div>`;
        const input = area.querySelector(`#chatinput-${channel}`);
        const btn = area.querySelector('.btn-chat-send');
        const send = () => {
            const msg = input.value.trim();
            if (!msg) return;
            const irc = state.ircs[channel];
            if (irc && irc.send(msg)) {
                appendMessage(channel, { username: state.twitchUser.display_name, message: msg, color: '#9147ff' });
                input.value = '';
            }
        };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
        btn.addEventListener('click', send);
    } else {
        area.innerHTML = `<div class="chat-login-prompt"><button class="btn-chat-login" onclick="loginWithTwitch()">Login with Twitch to chat</button></div>`;
    }
}

function appendMessage(channel, { username, message, color }) {
    const msgs = document.getElementById(`msgs-${channel}`);
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="chat-msg-user" style="color:${color || '#9147ff'}">${escapeHtml(username)}</span>: <span class="chat-msg-text">${escapeHtml(message)}</span>`;
    msgs.appendChild(div);
    while (msgs.children.length > 200) msgs.firstChild.remove();
    msgs.scrollTop = msgs.scrollHeight;
}

function appendSystem(channel, text) {
    const msgs = document.getElementById(`msgs-${channel}`);
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'chat-msg system';
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
}

function reconnectIRC(channel) {
    if (state.ircs[channel]) {
        state.ircs[channel].destroy();
        delete state.ircs[channel];
    }
    state.ircs[channel] = new TwitchIRC(
        channel,
        (msg) => appendMessage(channel, msg),
        (status) => {
            if (status === 'connected') {
                const msgs = document.getElementById(`msgs-${channel}`);
                if (msgs) {
                    const connecting = msgs.querySelector('.chat-connecting');
                    if (connecting) connecting.remove();
                }
            } else {
                appendSystem(channel, 'Reconnecting...');
            }
        }
    );
}

function addStream(channel) {
    channel = channel.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!channel) return;
    if (state.channels.includes(channel)) {
        showNotice(`${channel} is already added`);
        return;
    }
    if (state.channels.length >= MAX_STREAMS) {
        showNotice(`Max ${MAX_STREAMS} streams allowed`);
        return;
    }

    state.channels.push(channel);
    refreshGrid();
    reconnectIRC(channel);
    updateChatInputState(channel);
    addChannelTag(channel);
    createPlayer(channel);
}

function removeStream(channel) {
    state.channels = state.channels.filter(c => c !== channel);
    if (state.ircs[channel]) {
        state.ircs[channel].destroy();
        delete state.ircs[channel];
    }
    if (state.players[channel]) {
        try { state.players[channel].destroy(); } catch (e) {}
        delete state.players[channel];
    }
    refreshGrid();
    document.querySelector(`.channel-tag[data-channel="${channel}"]`)?.remove();
}

function refreshGrid() {
    const grid = document.getElementById('streamsGrid');

    if (state.channels.length === 0) {
        grid.querySelectorAll('.stream-panel').forEach(p => p.remove());
        grid.removeAttribute('data-count');
        if (emptyStateNode && !grid.contains(emptyStateNode)) {
            grid.appendChild(emptyStateNode);
        }
        return;
    }

    // Hide empty state without removing it from memory
    if (emptyStateNode && grid.contains(emptyStateNode)) {
        emptyStateNode.remove();
    }

    grid.dataset.count = state.channels.length;

    // Remove panels for channels no longer in list
    grid.querySelectorAll('.stream-panel').forEach(p => {
        if (!state.channels.includes(p.dataset.channel)) p.remove();
    });

    // Add panels for new channels (player is created separately in addStream)
    for (const ch of state.channels) {
        if (!grid.querySelector(`.stream-panel[data-channel="${ch}"]`)) {
            const panel = createPanel(ch);
            grid.appendChild(panel);
            updateChatInputState(ch);
        }
    }

    // Apply chat visibility
    grid.querySelectorAll('.stream-chat').forEach(c => {
        c.style.display = state.chatsHidden ? 'none' : '';
    });
}

function addChannelTag(channel) {
    const tags = document.getElementById('channelTags');
    const tag = document.createElement('div');
    tag.className = 'channel-tag';
    tag.dataset.channel = channel;
    tag.innerHTML = `<span class="dot" id="dot-${channel}"></span>${channel}<button title="Remove">&times;</button>`;
    tag.querySelector('button').addEventListener('click', () => removeStream(channel));
    tags.appendChild(tag);
}

/* ─── Toggle Chats ─── */
function toggleChats() {
    state.chatsHidden = !state.chatsHidden;
    document.getElementById('streamsGrid').querySelectorAll('.stream-chat').forEach(c => {
        c.style.display = state.chatsHidden ? 'none' : '';
    });
    document.getElementById('toggleChatsBtn').textContent = state.chatsHidden ? 'Show Chats' : 'Hide Chats';
}

/* ─── Helpers ─── */
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showNotice(msg) {
    const n = document.createElement('div');
    n.style.cssText = 'position:fixed;top:80px;right:20px;background:#333;color:#fff;padding:10px 16px;border-radius:6px;font-size:0.85rem;z-index:9999;border-left:3px solid #9147ff;';
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
}

/* ─── Init ─── */
async function init() {
    // Capture emptyState before any DOM manipulation so getElementById never returns null later
    emptyStateNode = document.getElementById('emptyState');

    // Inject Hide Chats button into the center slot
    const topbarCenter = document.querySelector('.topbar-center');
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'toggleChatsBtn';
    toggleBtn.textContent = 'Hide Chats';
    toggleBtn.className = 'btn-toggle-chats';
    toggleBtn.addEventListener('click', toggleChats);
    topbarCenter.appendChild(toggleBtn);

    // Check for OAuth token in URL hash
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const hashToken = hash.get('access_token');
    if (hashToken) {
        sessionStorage.setItem('twitch_token', hashToken);
        history.replaceState(null, '', window.location.pathname);
    }

    // Check stored token
    const storedToken = sessionStorage.getItem('twitch_token');
    if (storedToken) {
        const user = await verifyToken(storedToken);
        if (user) {
            state.twitchUser = user;
        } else {
            sessionStorage.removeItem('twitch_token');
        }
    }

    updateAuthUI();

    document.getElementById('addChannelBtn').addEventListener('click', () => {
        const input = document.getElementById('channelInput');
        addStream(input.value);
        input.value = '';
        input.focus();
    });

    document.getElementById('channelInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            addStream(e.target.value);
            e.target.value = '';
        }
    });

    document.getElementById('twitchLoginBtn').addEventListener('click', loginWithTwitch);
    document.getElementById('twitchLogoutBtn').addEventListener('click', logoutTwitch);

    // Load channels from URL ?streams=ch1,ch2
    const params = new URLSearchParams(window.location.search);
    const streams = params.get('streams');
    if (streams) {
        streams.split(',').slice(0, MAX_STREAMS).forEach(ch => addStream(ch.trim()));
    }
}

window.loginWithTwitch = loginWithTwitch;
document.addEventListener('DOMContentLoaded', init);
