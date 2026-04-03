/* Multi-Twitch - Watch multiple Twitch streams with live chat */

const PARENT_DOMAIN = window.location.hostname;
const MAX_STREAMS = 6;

const state = {
    channels: [],
    ircs: {},
    players: {},
    twitchUser: null,
    chatMode: 'per-stream', // 'per-stream' | 'unified' | 'hidden'
    layout: 'auto',         // 'auto' | 'focus' | 'stacked' | 'side'
    authReason: 'login'
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
            // Reset retry count on successful open
            this.retryCount = 0;
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
                // ROOMSTATE is sent by Twitch when we successfully join a channel
                // (requires twitch.tv/commands cap, which we request — more reliable than JOIN)
                if (line.includes('ROOMSTATE') && line.toLowerCase().includes('#' + this.channel)) {
                    if (!this.connected) {
                        this.connected = true;
                        this.onStatus('connected');
                    }
                    continue;
                }
                if (line.includes('PRIVMSG')) {
                    // Fallback: first message proves we're in the channel
                    if (!this.connected) {
                        this.connected = true;
                        this.onStatus('connected');
                    }
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
                this.retryCount = (this.retryCount || 0) + 1;
                // Exponential backoff: 3s, 6s, 12s, 24s, capped at 30s
                const delay = Math.min(3000 * Math.pow(2, this.retryCount - 1), 30000);
                this.onStatus('disconnected');
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
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

/* ─── Auth (unified CUB SOFTWARE login) ─── */
async function initAuth() {
    try {
        const res = await fetch('/api/multi-twitch/chat-token');
        const data = await res.json();
        if (data.authenticated) {
            state.twitchUser = {
                login: data.login,
                display_name: data.display_name,
                profile_image_url: data.avatar,
                token: data.token,
            };
            state.authReason = null;
        } else {
            state.twitchUser = null;
            state.authReason = data.reason || 'login';
        }
    } catch {
        state.twitchUser = null;
        state.authReason = 'login';
    }
    updateAuthUI();
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
        if (loggedOut) loggedOut.style.display = 'none';
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
        const href = (state.authReason === 'link_twitch' || state.authReason === 'reauth_twitch')
            ? '/login/twitch?link=1&next=/apps/multi-twitch'
            : '/login?next=/apps/multi-twitch';
        const label = (state.authReason === 'link_twitch' || state.authReason === 'reauth_twitch')
            ? 'Link Twitch to chat'
            : 'Login to chat';
        area.innerHTML = `<div class="chat-login-prompt"><a class="btn-chat-login" href="${href}">${label}</a></div>`;
    }
}

function appendMessage(channel, { username, message, color }) {
    const msgs = document.getElementById(`msgs-${channel}`);
    if (msgs) {
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<span class="chat-msg-user" style="color:${color || '#9147ff'}">${escapeHtml(username)}</span>: <span class="chat-msg-text">${escapeHtml(message)}</span>`;
        msgs.appendChild(div);
        while (msgs.children.length > 200) msgs.firstChild.remove();
        msgs.scrollTop = msgs.scrollHeight;
    }
    // Also route to unified chat panel
    appendToUnified(channel, { username, message, color });
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

function appendToUnified(channel, { username, message, color }) {
    const msgs = document.getElementById('unifiedChatMsgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span class="unified-ch-tag">${escapeHtml(channel)}</span> <span class="chat-msg-user" style="color:${color || '#9147ff'}">${escapeHtml(username)}</span>: <span class="chat-msg-text">${escapeHtml(message)}</span>`;
    msgs.appendChild(div);
    while (msgs.children.length > 300) msgs.firstChild.remove();
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
            const msgs = document.getElementById(`msgs-${channel}`);
            if (!msgs) return;
            if (status === 'connected') {
                msgs.querySelector('.chat-connecting')?.remove();
                msgs.querySelector('.chat-status')?.remove();
            } else {
                // Reuse a single status element — never spam multiple "Reconnecting..." lines
                let el = msgs.querySelector('.chat-status');
                if (!el) {
                    el = document.createElement('div');
                    el.className = 'chat-msg system chat-status';
                    msgs.appendChild(el);
                }
                el.textContent = 'Reconnecting...';
                msgs.scrollTop = msgs.scrollHeight;
            }
        }
    );
}

/* ─── Stream management ─── */
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
    updateSharedChatSelect();
    syncUrl();
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
    updateSharedChatSelect();
    syncUrl();
}

function refreshGrid() {
    const grid = document.getElementById('streamsGrid');

    if (state.channels.length === 0) {
        grid.querySelectorAll('.stream-panel').forEach(p => p.remove());
        grid.removeAttribute('data-count');
        grid.removeAttribute('data-layout');
        grid.style.gridTemplateColumns = '';
        grid.style.gridTemplateRows = '';
        if (emptyStateNode && !grid.contains(emptyStateNode)) {
            grid.appendChild(emptyStateNode);
        }
        return;
    }

    if (emptyStateNode && grid.contains(emptyStateNode)) {
        emptyStateNode.remove();
    }

    const count = state.channels.length;
    grid.dataset.count = count;
    grid.dataset.layout = state.layout;

    // Apply layout-specific grid overrides
    if (state.layout === 'side') {
        grid.style.gridTemplateColumns = `repeat(${count}, 1fr)`;
        grid.style.gridTemplateRows = '1fr';
    } else if (state.layout === 'stacked') {
        grid.style.gridTemplateColumns = '1fr';
        grid.style.gridTemplateRows = '';
    } else {
        // 'auto' and 'focus' handled by CSS
        grid.style.gridTemplateColumns = '';
        grid.style.gridTemplateRows = '';
    }

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
    const showPerStream = state.chatMode === 'per-stream';
    grid.querySelectorAll('.stream-chat').forEach(c => {
        c.style.display = showPerStream ? '' : 'none';
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

/* ─── Layout & Chat Mode ─── */
function setLayout(layout) {
    state.layout = layout;
    document.querySelectorAll('.btn-layout').forEach(b => {
        b.classList.toggle('active', b.dataset.layout === layout);
    });
    refreshGrid();
    syncUrl();
}

function setChatMode(mode) {
    state.chatMode = mode;
    const grid = document.getElementById('streamsGrid');
    const unifiedPanel = document.getElementById('unifiedChatPanel');
    const sharedPanel = document.getElementById('sharedChatPanel');

    const showPerStream = mode === 'per-stream';
    grid.querySelectorAll('.stream-chat').forEach(c => {
        c.style.display = showPerStream ? '' : 'none';
    });

    if (unifiedPanel) unifiedPanel.style.display = mode === 'unified' ? 'flex' : 'none';
    if (sharedPanel) {
        sharedPanel.style.display = mode === 'shared' ? 'flex' : 'none';
        if (mode === 'shared') updateSharedChatEmbed();
    }

    document.querySelectorAll('.btn-chat-mode').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });
    syncUrl();
}

/* ─── Shared Chat (native Twitch embed — auto-shows Twitch Shared Chat) ─── */
function updateSharedChatSelect() {
    const select = document.getElementById('sharedChatSelect');
    if (!select) return;
    const prev = select.value;
    select.innerHTML = state.channels.map(ch =>
        `<option value="${escapeHtml(ch)}">${escapeHtml(ch)}</option>`
    ).join('');
    if (prev && state.channels.includes(prev)) select.value = prev;
    if (state.chatMode === 'shared') updateSharedChatEmbed();
}

function updateSharedChatEmbed() {
    const select = document.getElementById('sharedChatSelect');
    const iframe = document.getElementById('sharedChatIframe');
    if (!iframe) return;
    const channel = (select && select.value) || state.channels[0];
    if (!channel) { iframe.src = 'about:blank'; return; }
    iframe.src = `https://www.twitch.tv/embed/${encodeURIComponent(channel)}/chat?parent=${PARENT_DOMAIN}&darkpopout`;
}

/* ─── URL Sync ─── */
function syncUrl() {
    const params = new URLSearchParams();
    if (state.channels.length) params.set('streams', state.channels.join(','));
    if (state.layout !== 'auto') params.set('layout', state.layout);
    if (state.chatMode !== 'per-stream') params.set('chat', state.chatMode);
    const qs = params.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

/* ─── Helpers ─── */
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showNotice(msg) {
    const n = document.createElement('div');
    n.style.cssText = 'position:fixed;top:80px;right:20px;background:#1a1a2e;color:#fff;padding:10px 16px;border-radius:6px;font-size:0.85rem;z-index:9999;border-left:3px solid #9147ff;box-shadow:0 4px 16px rgba(0,0,0,0.5);';
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
}

/* ─── Init ─── */
async function init() {
    emptyStateNode = document.getElementById('emptyState');

    // Read URL params before building UI so controls reflect restored state
    const params = new URLSearchParams(window.location.search);
    const urlLayout = params.get('layout');
    const urlChat = params.get('chat');
    if (urlLayout && ['auto', 'focus', 'stacked', 'side'].includes(urlLayout)) {
        state.layout = urlLayout;
    }
    if (urlChat && ['per-stream', 'unified', 'shared', 'hidden'].includes(urlChat)) {
        state.chatMode = urlChat;
    }

    // Build layout + chat controls in topbar center
    const topbarCenter = document.querySelector('.topbar-center');
    topbarCenter.innerHTML = `
        <div class="layout-controls">
            <div class="ctrl-group">
                <span class="ctrl-label">Layout</span>
                <div class="ctrl-btns">
                    <button class="btn-layout${state.layout === 'auto' ? ' active' : ''}" data-layout="auto" title="Auto grid">Auto</button>
                    <button class="btn-layout${state.layout === 'focus' ? ' active' : ''}" data-layout="focus" title="First stream large, others stacked to the side">Focus</button>
                    <button class="btn-layout${state.layout === 'stacked' ? ' active' : ''}" data-layout="stacked" title="Stack all streams vertically">Stack</button>
                    <button class="btn-layout${state.layout === 'side' ? ' active' : ''}" data-layout="side" title="All streams in one row">Side</button>
                </div>
            </div>
            <div class="ctrl-sep"></div>
            <div class="ctrl-group">
                <span class="ctrl-label">Chat</span>
                <div class="ctrl-btns">
                    <button class="btn-chat-mode${state.chatMode === 'per-stream' ? ' active' : ''}" data-mode="per-stream" title="Show chat panel for each stream">Each</button>
                    <button class="btn-chat-mode${state.chatMode === 'unified' ? ' active' : ''}" data-mode="unified" title="Merge all stream chats into one panel">Merged</button>
                    <button class="btn-chat-mode${state.chatMode === 'shared' ? ' active' : ''}" data-mode="shared" title="Native Twitch chat embed — automatically shows Twitch Shared Chat if active">Shared</button>
                    <button class="btn-chat-mode${state.chatMode === 'hidden' ? ' active' : ''}" data-mode="hidden" title="Hide all chats">Off</button>
                </div>
            </div>
        </div>
    `;

    topbarCenter.querySelectorAll('.btn-layout').forEach(btn => {
        btn.addEventListener('click', () => setLayout(btn.dataset.layout));
    });
    topbarCenter.querySelectorAll('.btn-chat-mode').forEach(btn => {
        btn.addEventListener('click', () => setChatMode(btn.dataset.mode));
    });

    // Build side panels inside streams-area (right of the grid)
    const streamsArea = document.getElementById('streamsArea');

    // Merged chat panel
    const unifiedPanel = document.createElement('div');
    unifiedPanel.id = 'unifiedChatPanel';
    unifiedPanel.className = 'unified-chat-panel';
    unifiedPanel.style.display = state.chatMode === 'unified' ? 'flex' : 'none';
    unifiedPanel.innerHTML = `
        <div class="unified-chat-header">
            <span>Merged Chat</span>
            <span class="unified-chat-channels" id="unifiedChatChannels"></span>
        </div>
        <div id="unifiedChatMsgs"></div>
        <div class="unified-chat-hint">View-only &mdash; chat via individual stream panels</div>
    `;
    streamsArea.appendChild(unifiedPanel);

    // Shared chat panel (native Twitch embed — auto-handles Twitch Shared Chat)
    const sharedPanel = document.createElement('div');
    sharedPanel.id = 'sharedChatPanel';
    sharedPanel.className = 'unified-chat-panel';
    sharedPanel.style.display = state.chatMode === 'shared' ? 'flex' : 'none';
    sharedPanel.innerHTML = `
        <div class="unified-chat-header">
            <span>Shared Chat</span>
            <select id="sharedChatSelect" class="shared-chat-select"></select>
        </div>
        <iframe id="sharedChatIframe" src="about:blank" frameborder="0" allowtransparency="true"></iframe>
    `;
    sharedPanel.querySelector('#sharedChatSelect').addEventListener('change', updateSharedChatEmbed);
    streamsArea.appendChild(sharedPanel);

    await initAuth();

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

    // Load channels from URL ?streams=ch1,ch2
    const streams = params.get('streams');
    if (streams) {
        streams.split(',').slice(0, MAX_STREAMS).forEach(ch => addStream(ch.trim()));
    }
}

document.addEventListener('DOMContentLoaded', init);
