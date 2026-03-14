/* ─── CUB Overlays Plugin ─── */
// Control your CUB SOFTWARE stream overlays directly from CubDeck.
// Requires you to be logged into the overlay builder (same account).
// Build overlays at: https://cubsoftware.site/overlays/

const _cubovCache = {}; // scene_id → { data, expires }

// Accept a full OBS source URL, editor URL, or raw UUID —
// e.g. https://cubsoftware.site/overlays/source/576d9561-357a-4ca2-96b8-81ada21c2812
function _cubovParseSceneId(input) {
    if (!input) return '';
    const m = input.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    return m ? m[0] : input.trim();
}

async function _cubovPatch(sceneId, configUpdates) {
    const r = await fetch(`/overlays/api/scenes/${sceneId}/deck-control`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: configUpdates })
    });
    if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || ('HTTP ' + r.status));
    }
    delete _cubovCache['cfg_' + sceneId];
    return r.json();
}

async function _cubovGetConfig(sceneId) {
    const k = 'cfg_' + sceneId;
    const cached = _cubovCache[k];
    if (cached && Date.now() < cached.expires) return cached.data;
    const r = await fetch(`/overlays/api/scenes/${sceneId}/config`);
    if (!r.ok) throw new Error('Scene not found');
    const data = await r.json();
    _cubovCache[k] = { data, expires: Date.now() + 5000 };
    return data;
}

async function _cubovListScenes() {
    const k = 'scenes_list';
    const cached = _cubovCache[k];
    if (cached && Date.now() < cached.expires) return cached.data;
    const r = await fetch('/overlays/api/deck/scenes');
    if (!r.ok) {
        if (r.status === 401) throw new Error('Not logged in to overlays — visit cubsoftware.site/overlays first');
        throw new Error('HTTP ' + r.status);
    }
    const data = await r.json();
    _cubovCache[k] = { data: data.scenes || [], expires: Date.now() + 10000 };
    return _cubovCache[k].data;
}

const _SCENE_TYPE_ICONS = {
    'starting-soon': '⏳', 'brb': '☕', 'ending': '👋', 'live': '🔴',
    'offline': '💤', 'tech-difficulties': '⚠️', 'intermission': '🎭',
    'raid': '⚔️', 'subathon': '🎯', 'schedule': '📅', 'alerts': '🔔',
    'chat-box': '💬', 'event-list': '📋', 'leaderboard': '🏆',
    'hype-train': '🚂', 'poll-display': '📊', 'prediction': '🎲',
    'emote-wall': '😄', 'cam-frame': '📷', 'news-ticker': '📰',
    'credits-roll': '🎬',
};

CubDeck.registerPlugin({
    id: 'cub-overlays',
    name: 'CUB Overlays',
    icon: '🎨',
    actions: [

        // ─── Scene display ───────────────────────────────────────────────
        {
            id: 'scene-display',
            name: 'Scene Info Display',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' }
            ],
            getState(s, ctx) {
                const sceneId = _cubovParseSceneId(s.scene_id);
                if (!sceneId) return { label: 'No scene', icon: '🎨' };
                const k = 'cfg_' + sceneId;
                const cached = _cubovCache[k];
                if (cached && Date.now() < cached.expires) {
                    const d = cached.data;
                    const icon = _SCENE_TYPE_ICONS[d.type] || '🎨';
                    return { label: d.name || d.type || 'Overlay', icon, active: false };
                }
                if (!_cubovCache[k + '_f']) {
                    _cubovCache[k + '_f'] = true;
                    _cubovGetConfig(sceneId).then(() => {
                        _cubovCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _cubovCache[k + '_f'] = false; });
                }
                if (cached) {
                    const icon = _SCENE_TYPE_ICONS[cached.data.type] || '🎨';
                    return { label: cached.data.name || 'Overlay', icon };
                }
                return { label: 'Loading…', icon: '🎨' };
            },
            async execute(s, ctx) {
                const sceneId = _cubovParseSceneId(s.scene_id);
                if (!sceneId) { ctx.showToast('No scene ID set', 'error'); return; }
                window.open(`https://cubsoftware.site/overlays/scenes/${sceneId}/edit`, '_blank');
            }
        },

        // ─── List scenes ─────────────────────────────────────────────────
        {
            id: 'list-scenes',
            name: 'Show My Scenes',
            settings: [],
            async execute(s, ctx) {
                try {
                    const scenes = await _cubovListScenes();
                    if (scenes.length === 0) {
                        ctx.showToast('No overlay scenes found. Create one at cubsoftware.site/overlays', 'info');
                        return;
                    }
                    const names = scenes.slice(0, 5).map(sc => {
                        const icon = _SCENE_TYPE_ICONS[sc.type] || '🎨';
                        return `${icon} ${sc.name} (${sc.id.slice(0, 8)}…)`;
                    }).join(' | ');
                    ctx.showToast(names, 'info');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Countdown timer ─────────────────────────────────────────────
        {
            id: 'set-countdown',
            name: 'Set Countdown Timer',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'hours',   label: 'Hours from now',   type: 'number', min: 0, max: 23, default: 0 },
                { key: 'minutes', label: 'Minutes from now', type: 'number', min: 0, max: 59, default: 10 },
                { key: 'end_text', label: 'Text when done (optional)', type: 'text', placeholder: "WE'RE LIVE!" }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId) throw new Error('Scene ID required');
                    const hours   = parseInt(s.hours)   || 0;
                    const minutes = parseInt(s.minutes) || 0;
                    const target  = Date.now() + (hours * 3600 + minutes * 60) * 1000;
                    const updates = { countdown_to: target, show_countdown: true };
                    if (s.end_text) updates.countdown_end_text = s.end_text;
                    await _cubovPatch(sceneId, updates);
                    ctx.showToast(`Countdown set: ${hours}h ${minutes}m`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Title / subtitle ────────────────────────────────────────────
        {
            id: 'update-title',
            name: 'Update Overlay Title',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'title',    label: 'Title',    type: 'text', placeholder: 'My Stream' },
                { key: 'subtitle', label: 'Subtitle (optional)', type: 'text', placeholder: '' }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId) throw new Error('Scene ID required');
                    const updates = {};
                    if (s.title)    updates.title    = s.title;
                    if (s.subtitle !== undefined) updates.subtitle = s.subtitle;
                    if (Object.keys(updates).length === 0) throw new Error('Provide at least a title');
                    await _cubovPatch(sceneId, updates);
                    ctx.showToast('Title updated', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Goal bar ────────────────────────────────────────────────────
        {
            id: 'update-goal',
            name: 'Update Goal Bar',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'set',      label: 'Set value' },
                    { value: 'add',      label: 'Add to value' },
                    { value: 'subtract', label: 'Subtract from value' }
                ], default: 'set' },
                { key: 'value', label: 'Amount', type: 'number', min: 0, default: 1 },
                { key: 'max',   label: 'Goal max (optional, leave blank to keep)', type: 'text', placeholder: '' },
                { key: 'label', label: 'Goal label (optional)', type: 'text', placeholder: '' }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId) throw new Error('Scene ID required');
                    const action = s.action || 'set';
                    const amount = parseFloat(s.value) || 0;
                    let current;

                    if (action !== 'set') {
                        const cfg = await _cubovGetConfig(sceneId);
                        current = parseFloat(cfg.goal_bar_current) || 0;
                    }

                    const updates = { goal_bar: true };
                    if (action === 'set')      updates.goal_bar_current = amount;
                    else if (action === 'add') updates.goal_bar_current = current + amount;
                    else                       updates.goal_bar_current = Math.max(0, current - amount);

                    if (s.max)   updates.goal_bar_max   = parseFloat(s.max);
                    if (s.label) updates.goal_bar_title = s.label;

                    await _cubovPatch(sceneId, updates);
                    ctx.showToast(`Goal bar → ${updates.goal_bar_current}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Counter widget ──────────────────────────────────────────────
        {
            id: 'update-counter',
            name: 'Update Counter Widget',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'add',      label: 'Increment' },
                    { value: 'subtract', label: 'Decrement' },
                    { value: 'set',      label: 'Set value' },
                    { value: 'reset',    label: 'Reset to 0' }
                ], default: 'add' },
                { key: 'amount', label: 'Amount', type: 'number', min: 1, default: 1 },
                { key: 'label',  label: 'Counter label (optional)', type: 'text', placeholder: '' }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId) throw new Error('Scene ID required');
                    const action = s.action || 'add';
                    const amount = parseFloat(s.amount) || 1;
                    let newVal;

                    if (action === 'reset') {
                        newVal = 0;
                    } else if (action === 'set') {
                        newVal = amount;
                    } else {
                        const cfg = await _cubovGetConfig(sceneId);
                        const current = parseFloat(cfg.counter_value) || 0;
                        newVal = action === 'add' ? current + amount : Math.max(0, current - amount);
                    }

                    const updates = { counter_widget: true, counter_value: newVal };
                    if (s.label) updates.counter_label = s.label;
                    await _cubovPatch(sceneId, updates);
                    ctx.showToast(`Counter → ${newVal}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Toggle widget ───────────────────────────────────────────────
        {
            id: 'toggle-widget',
            name: 'Toggle Overlay Widget',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'widget', label: 'Widget', type: 'select', options: [
                    { value: 'clock_widget',      label: 'Clock' },
                    { value: 'goal_bar',          label: 'Goal Bar' },
                    { value: 'counter_widget',    label: 'Counter' },
                    { value: 'nowplaying_widget', label: 'Now Playing (Last.fm)' },
                    { value: 'ticker_widget',     label: 'Ticker' },
                    { value: 'qr_widget',         label: 'QR Code' },
                    { value: 'uptime_widget',     label: 'Uptime' },
                    { value: 'show_countdown',    label: 'Countdown' },
                    { value: 'particles',         label: 'Particles' }
                ], default: 'clock_widget' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'show',   label: 'Show' },
                    { value: 'hide',   label: 'Hide' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId || !s.widget) throw new Error('Scene ID and widget required');
                    const action = s.action || 'toggle';
                    let newVal;
                    if (action === 'show') {
                        newVal = true;
                    } else if (action === 'hide') {
                        newVal = false;
                    } else {
                        const cfg = await _cubovGetConfig(sceneId);
                        newVal = !cfg[s.widget];
                    }
                    await _cubovPatch(sceneId, { [s.widget]: newVal });
                    const widgetNames = {
                        clock_widget: 'Clock', goal_bar: 'Goal Bar', counter_widget: 'Counter',
                        nowplaying_widget: 'Now Playing', ticker_widget: 'Ticker',
                        qr_widget: 'QR Code', uptime_widget: 'Uptime',
                        show_countdown: 'Countdown', particles: 'Particles'
                    };
                    ctx.showToast(`${widgetNames[s.widget] || s.widget} ${newVal ? 'shown' : 'hidden'}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Ticker ──────────────────────────────────────────────────────
        {
            id: 'update-ticker',
            name: 'Update Ticker Text',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'text', label: 'Ticker message', type: 'text', placeholder: 'Next stream: Saturday 8pm' }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId) throw new Error('Scene ID required');
                    await _cubovPatch(sceneId, { ticker_widget: true, ticker_label: s.text || '' });
                    ctx.showToast('Ticker updated', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Background effect ───────────────────────────────────────────
        {
            id: 'set-bg-effect',
            name: 'Change Background Effect',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'effect', label: 'Effect', type: 'select', options: [
                    { value: 'none',         label: 'None' },
                    { value: 'starfield',    label: 'Starfield' },
                    { value: 'matrix',       label: 'Matrix Rain' },
                    { value: 'rain',         label: 'Rain' },
                    { value: 'snow',         label: 'Snow' },
                    { value: 'fire',         label: 'Fire' },
                    { value: 'aurora',       label: 'Aurora' },
                    { value: 'confetti',     label: 'Confetti' },
                    { value: 'bokeh',        label: 'Bokeh' },
                    { value: 'waves',        label: 'Waves' },
                    { value: 'hexagons',     label: 'Hexagons' },
                    { value: 'lightning',    label: 'Lightning' },
                    { value: 'particle-web', label: 'Particle Web' },
                    { value: 'bubbles',      label: 'Bubbles' },
                    { value: 'neon-grid',    label: 'Neon Grid' },
                    { value: 'fireflies',    label: 'Fireflies' },
                    { value: 'vortex',       label: 'Vortex' },
                    { value: 'plasma',       label: 'Plasma' },
                    { value: 'nebula',       label: 'Nebula' }
                ], default: 'starfield' }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId) throw new Error('Scene ID required');
                    await _cubovPatch(sceneId, { background_effect: s.effect || 'none' });
                    ctx.showToast(`Effect → ${s.effect || 'none'}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Scene template ──────────────────────────────────────────────
        {
            id: 'set-template',
            name: 'Switch Visual Template',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' },
                { key: 'template', label: 'Template', type: 'select', options: [
                    { value: 'minimal',    label: 'Minimal' },
                    { value: 'neon',       label: 'Neon' },
                    { value: 'retro',      label: 'Retro' },
                    { value: 'cozy',       label: 'Cozy' },
                    { value: 'gradient',   label: 'Gradient' },
                    { value: 'gaming',     label: 'Gaming' },
                    { value: 'esports',    label: 'Esports' },
                    { value: 'vaporwave',  label: 'Vaporwave' },
                    { value: 'glass',      label: 'Glass' },
                    { value: 'cinematic',  label: 'Cinematic' },
                    { value: 'broadcast',  label: 'Broadcast' },
                    { value: 'lofi',       label: 'Lo-fi' }
                ], default: 'minimal' }
            ],
            async execute(s, ctx) {
                try {
                    const sceneId = _cubovParseSceneId(s.scene_id);
                    if (!sceneId) throw new Error('Scene ID required');
                    const r = await fetch(`/overlays/api/scenes/${sceneId}/deck-control`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ template: s.template, config: {} })
                    });
                    if (!r.ok) {
                        const e = await r.json().catch(() => ({}));
                        throw new Error(e.error || 'HTTP ' + r.status);
                    }
                    delete _cubovCache['cfg_' + sceneId];
                    ctx.showToast(`Template → ${s.template}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },

        // ─── Open overlay editor ─────────────────────────────────────────
        {
            id: 'open-editor',
            name: 'Open Overlay Editor',
            settings: [
                { key: 'scene_id', label: 'Scene ID or OBS Source URL', type: 'text', placeholder: 'Paste OBS source URL or scene ID' }
            ],
            async execute(s, ctx) {
                const sceneId = _cubovParseSceneId(s.scene_id);
                if (!sceneId) { ctx.showToast('No scene ID set', 'error'); return; }
                window.open(`https://cubsoftware.site/overlays/scenes/${sceneId}/edit`, '_blank');
            }
        },

        // ─── Open overlay dashboard ──────────────────────────────────────
        {
            id: 'open-dashboard',
            name: 'Open Overlays Dashboard',
            settings: [],
            async execute(s, ctx) {
                window.open('https://cubsoftware.site/overlays/', '_blank');
            }
        }
    ]
});
