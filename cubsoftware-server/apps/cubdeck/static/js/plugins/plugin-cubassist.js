/* ─── CubAssist Bot Plugin ─── */
// Control your CubAssist Twitch chat bot directly from CubDeck.
// Requires CubAssist to be set up at cubsoftware.site/cubassist/

const _caCache = {}; // key → { data, expires }

async function _caApi(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    const r = await fetch('/cubassist' + path, opts);
    if (r.status === 401) throw new Error('Not logged in to CubAssist — visit cubsoftware.site/cubassist first');
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || ('HTTP ' + r.status));
    }
    return r.status === 204 ? null : r.json();
}

async function _caGetStatus() {
    const k = 'status';
    const cached = _caCache[k];
    if (cached && Date.now() < cached.expires) return cached.data;
    const data = await _caApi('GET', '/api/status');
    _caCache[k] = { data, expires: Date.now() + 3000 };
    return data;
}

async function _caGetCounters() {
    const k = 'counters';
    const cached = _caCache[k];
    if (cached && Date.now() < cached.expires) return cached.data;
    const data = await _caApi('GET', '/api/counters');
    _caCache[k] = { data, expires: Date.now() + 4000 };
    return data;
}

async function _caGetGiveaway() {
    const k = 'giveaway';
    const cached = _caCache[k];
    if (cached && Date.now() < cached.expires) return cached.data;
    const data = await _caApi('GET', '/api/giveaway');
    _caCache[k] = { data, expires: Date.now() + 4000 };
    return data;
}

function _caInvalidate(...keys) {
    keys.forEach(k => delete _caCache[k]);
}

CubDeck.registerPlugin({
    id: 'cubassist',
    name: 'CubAssist Bot',
    icon: '🤖',
    actions: [

        // ─── Bot Status Display ───────────────────────────────────────────────
        {
            id: 'bot-status',
            name: 'Bot Status',
            icon: '🤖',
            settings: [],
            async getState(s, ctx) {
                try {
                    const st = await _caGetStatus();
                    if (!st.running)    return { label: 'Bot Offline', icon: '⚫', sub: 'Not running' };
                    if (!st.connected)  return { label: 'Connecting…', icon: '🟡', sub: 'Reconnecting' };
                    return { label: 'Bot Online', icon: '🟢', sub: st.channel || 'Connected' };
                } catch (e) {
                    return { label: 'CubAssist', icon: '❌', sub: 'Not logged in' };
                }
            },
            async execute(s, ctx) {
                _caInvalidate('status');
                ctx.refreshAllButtons();
            }
        },

        // ─── Deaths ──────────────────────────────────────────────────────────
        {
            id: 'deaths-display',
            name: 'Death Counter Display',
            icon: '💀',
            settings: [],
            async getState(s, ctx) {
                try {
                    const c = await _caGetCounters();
                    return { label: 'Deaths', sub: String(c.deaths || 0) };
                } catch (e) {
                    return { label: 'Deaths', sub: '—' };
                }
            },
            async execute() { _caInvalidate('counters'); }
        },
        {
            id: 'deaths-increment',
            name: 'Add Death (+1)',
            icon: '💀',
            settings: [
                { key: 'amount', label: 'Amount', type: 'number', min: 1, default: 1 }
            ],
            async getState(s, ctx) {
                try {
                    const c = await _caGetCounters();
                    return { sub: String(c.deaths || 0) };
                } catch (e) {
                    return {};
                }
            },
            async execute(s, ctx) {
                try {
                    const c = await _caGetCounters();
                    const n = (parseInt(s.amount) || 1);
                    await _caApi('POST', '/api/counters', { deaths: (c.deaths || 0) + n });
                    _caInvalidate('counters');
                    ctx.showToast(`💀 Deaths: ${(c.deaths || 0) + n}`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'deaths-reset',
            name: 'Reset Deaths',
            icon: '🔄',
            settings: [],
            async execute(s, ctx) {
                try {
                    await _caApi('POST', '/api/counters', { deaths: 0 });
                    _caInvalidate('counters');
                    ctx.showToast('💀 Deaths reset to 0', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Wins / Losses ───────────────────────────────────────────────────
        {
            id: 'add-win',
            name: 'Add Win',
            icon: '🏆',
            settings: [],
            async getState(s, ctx) {
                try {
                    const c = await _caGetCounters();
                    return { label: 'Wins', sub: `${c.wins || 0}` };
                } catch (e) {
                    return {};
                }
            },
            async execute(s, ctx) {
                try {
                    const c = await _caGetCounters();
                    await _caApi('POST', '/api/counters', { wins: (c.wins || 0) + 1 });
                    _caInvalidate('counters');
                    ctx.showToast(`🏆 Wins: ${(c.wins || 0) + 1}`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'add-loss',
            name: 'Add Loss',
            icon: '😢',
            settings: [],
            async getState(s, ctx) {
                try {
                    const c = await _caGetCounters();
                    return { label: 'Losses', sub: `${c.losses || 0}` };
                } catch (e) {
                    return {};
                }
            },
            async execute(s, ctx) {
                try {
                    const c = await _caGetCounters();
                    await _caApi('POST', '/api/counters', { losses: (c.losses || 0) + 1 });
                    _caInvalidate('counters');
                    ctx.showToast(`😢 Losses: ${(c.losses || 0) + 1}`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Giveaway ────────────────────────────────────────────────────────
        {
            id: 'giveaway-start',
            name: 'Start Giveaway',
            icon: '🎉',
            settings: [
                { key: 'prize', label: 'Prize Description', type: 'text', placeholder: 'A sub!' }
            ],
            async getState(s, ctx) {
                try {
                    const gw = await _caGetGiveaway();
                    if (gw.active) return { label: 'Giveaway', sub: `${gw.entry_count || 0} entries`, icon: '🎉' };
                    return { label: 'Start Giveaway', icon: '🎉' };
                } catch (e) {
                    return {};
                }
            },
            async execute(s, ctx) {
                try {
                    const prize = s.prize || 'a prize';
                    await _caApi('POST', '/api/giveaway/start', { prize });
                    _caInvalidate('giveaway');
                    ctx.showToast(`🎉 Giveaway started: ${prize}`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'giveaway-draw',
            name: 'Draw Giveaway Winner',
            icon: '🎊',
            settings: [],
            async getState(s, ctx) {
                try {
                    const gw = await _caGetGiveaway();
                    return { label: 'Draw Winner', sub: gw.active ? `${gw.entry_count || 0} entries` : 'No giveaway' };
                } catch (e) {
                    return {};
                }
            },
            async execute(s, ctx) {
                try {
                    const res = await _caApi('POST', '/api/giveaway/draw', {});
                    _caInvalidate('giveaway');
                    const winner = res.winner ? res.winner.nick : '?';
                    ctx.showToast(`🎊 Winner: ${winner}!`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'giveaway-end',
            name: 'End Giveaway',
            icon: '🔚',
            settings: [],
            async execute(s, ctx) {
                try {
                    await _caApi('POST', '/api/giveaway/end', {});
                    _caInvalidate('giveaway');
                    ctx.showToast('Giveaway ended.', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'giveaway-toggle-entries',
            name: 'Toggle Giveaway Entries',
            icon: '🔒',
            settings: [],
            async getState(s, ctx) {
                try {
                    const gw = await _caGetGiveaway();
                    return { label: gw.entries_open ? 'Close Entries' : 'Open Entries', sub: gw.active ? 'Live' : 'Inactive' };
                } catch (e) {
                    return {};
                }
            },
            async execute(s, ctx) {
                try {
                    await _caApi('POST', '/api/giveaway/toggle-entries', {});
                    _caInvalidate('giveaway');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Queue ───────────────────────────────────────────────────────────
        {
            id: 'queue-open',
            name: 'Open Queue',
            icon: '✅',
            settings: [],
            async execute(s, ctx) {
                try {
                    await _caApi('POST', '/api/queue/open', { open: true });
                    ctx.showToast('Queue opened!', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'queue-close',
            name: 'Close Queue',
            icon: '🔒',
            settings: [],
            async execute(s, ctx) {
                try {
                    await _caApi('POST', '/api/queue/open', { open: false });
                    ctx.showToast('Queue closed.', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'queue-next',
            name: 'Next in Queue',
            icon: '▶️',
            settings: [],
            async execute(s, ctx) {
                try {
                    const res = await _caApi('POST', '/api/queue/next', {});
                    ctx.showToast(`▶️ Next: ${res.entry ? res.entry.user : '—'}`, 'success');
                } catch (e) {
                    ctx.showToast(e.message === 'Queue is empty' ? '⚠️ Queue is empty' : 'Error: ' + e.message, e.message === 'Queue is empty' ? 'warning' : 'error');
                }
            }
        },
        {
            id: 'queue-clear',
            name: 'Clear Queue',
            icon: '🗑️',
            settings: [],
            async execute(s, ctx) {
                try {
                    await _caApi('POST', '/api/queue/clear', {});
                    ctx.showToast('Queue cleared.', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Chat Mode ───────────────────────────────────────────────────────
        {
            id: 'chatmode',
            name: 'Set Chat Mode',
            icon: '💬',
            settings: [
                {
                    key: 'mode',
                    label: 'Mode',
                    type: 'select',
                    options: [
                        { value: 'slow',           label: 'Slow Mode' },
                        { value: 'slowoff',        label: 'Slow Mode Off' },
                        { value: 'subscribers',    label: 'Sub-Only Mode' },
                        { value: 'subscribersoff', label: 'Sub-Only Off' },
                        { value: 'emoteonly',      label: 'Emote-Only Mode' },
                        { value: 'emoteonlyoff',   label: 'Emote-Only Off' },
                        { value: 'clear',          label: 'Clear Chat' },
                    ]
                },
                { key: 'seconds', label: 'Slow delay (seconds, for slow mode only)', type: 'number', min: 1, default: 30 }
            ],
            async execute(s, ctx) {
                try {
                    const body = { mode: s.mode || 'slow' };
                    if (s.mode === 'slow') body.seconds = parseInt(s.seconds) || 30;
                    await _caApi('POST', '/api/stream/chatmode', body);
                    ctx.showToast(`💬 Chat mode: ${s.mode}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Stream Actions ──────────────────────────────────────────────────
        {
            id: 'create-clip',
            name: 'Create Clip',
            icon: '🎬',
            settings: [],
            async execute(s, ctx) {
                try {
                    const res = await _caApi('POST', '/api/stream/clip', {});
                    if (res.edit_url) {
                        ctx.showToast('🎬 Clip created!', 'success');
                    } else {
                        ctx.showToast('Clip created (processing…)', 'success');
                    }
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'create-marker',
            name: 'Stream Marker',
            icon: '📌',
            settings: [
                { key: 'description', label: 'Marker description', type: 'text', placeholder: 'Epic moment!' }
            ],
            async execute(s, ctx) {
                try {
                    await _caApi('POST', '/api/stream/marker', { description: s.description || 'CubDeck marker' });
                    ctx.showToast('📌 Marker created!', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Send Chat Message ────────────────────────────────────────────────
        {
            id: 'send-chat',
            name: 'Send Chat Message',
            icon: '💬',
            settings: [
                { key: 'message', label: 'Message', type: 'text', placeholder: '!hype' }
            ],
            async execute(s, ctx) {
                if (!s.message) { ctx.showToast('No message set.', 'warning'); return; }
                try {
                    await _caApi('POST', '/api/chat', { message: s.message });
                    ctx.showToast(`Sent: ${s.message}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Points ──────────────────────────────────────────────────────────
        {
            id: 'add-points',
            name: 'Add Points to User',
            icon: '💰',
            settings: [
                { key: 'nick', label: 'Username', type: 'text', placeholder: 'username' },
                { key: 'amount', label: 'Amount', type: 'number', default: 100, min: 1 }
            ],
            async execute(s, ctx) {
                if (!s.nick) { ctx.showToast('Username required.', 'warning'); return; }
                try {
                    const res = await _caApi('POST', '/api/points/adjust', { nick: s.nick, amount: parseInt(s.amount) || 100 });
                    ctx.showToast(`+${s.amount} to ${s.nick} (now ${res.balance})`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
    ]
});
