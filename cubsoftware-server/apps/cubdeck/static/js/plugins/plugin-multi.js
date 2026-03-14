/* ─── Multi-Action & Special Plugin ─── */

// Per-button toggle state storage
const _toggleState = {};
// Per-button auto-repeat intervals
const _autoRepeatIntervals = {};

CubDeck.registerPlugin({
    id: 'multi',
    name: 'Multi-Action',
    icon: '⚡',
    actions: [
        {
            id: 'toggle-pair',
            name: 'Toggle Pair (A / B)',
            icon: '🔄',
            settings: [
                { key: 'message_a', label: 'Message A (odd taps)', type: 'text', placeholder: '!hype' },
                { key: 'message_b', label: 'Message B (even taps)', type: 'text', placeholder: '!calm' },
                { key: 'label_a', label: 'Label when showing A', type: 'text', placeholder: 'Hype' },
                { key: 'label_b', label: 'Label when showing B', type: 'text', placeholder: 'Calm' }
            ],
            getState(s, ctx, btnId) {
                const on = _toggleState[btnId];
                return { sub: on ? (s.label_b || 'B') : (s.label_a || 'A'), active: !!on };
            },
            async execute(s, ctx, btnId) {
                _toggleState[btnId] = !_toggleState[btnId];
                const msg = _toggleState[btnId] ? s.message_b : s.message_a;
                if (msg) {
                    try { sendChatMessage(msg); } catch(e) { ctx.showToast(e.message, 'error'); }
                }
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'obs-scene-toggle',
            name: 'Toggle Between 2 Scenes',
            icon: '🔀',
            settings: [
                { key: 'scene_a', label: 'Scene A', type: 'obs-scene' },
                { key: 'scene_b', label: 'Scene B', type: 'obs-scene' }
            ],
            getState(s, ctx) {
                return { active: ctx.obs.currentScene === s.scene_b };
            },
            async execute(s, ctx) {
                if (!s.scene_a || !s.scene_b) throw new Error('Both scenes required');
                const next = ctx.obs.currentScene === s.scene_a ? s.scene_b : s.scene_a;
                await ctx.obs.call('SetCurrentProgramScene', { sceneName: next });
            }
        },
        {
            id: 'confirm-button',
            name: 'Confirm Before Action',
            icon: '⚠️',
            settings: [
                { key: 'action_msg', label: 'Chat message to send on confirm', type: 'text', placeholder: '!raid channel' },
                { key: 'confirm_text', label: 'Confirm dialog text', type: 'text', placeholder: 'Are you sure?' }
            ],
            async execute(s, ctx) {
                if (!confirm(s.confirm_text || 'Are you sure?')) return;
                if (s.action_msg) sendChatMessage(s.action_msg);
            }
        },
        {
            id: 'tts-say',
            name: 'Text-to-Speech',
            icon: '🔊',
            settings: [
                { key: 'text', label: 'Text to Speak', type: 'text', placeholder: 'Stream is live!' },
                { key: 'rate', label: 'Speed (0.5–2)', type: 'number', min: 0.5, max: 2, default: 1 },
                { key: 'pitch', label: 'Pitch (0–2)', type: 'number', min: 0, max: 2, default: 1 }
            ],
            async execute(s, ctx) {
                if (!s.text) throw new Error('No text set');
                const utt = new SpeechSynthesisUtterance(s.text);
                utt.rate = parseFloat(s.rate) || 1;
                utt.pitch = parseFloat(s.pitch) || 1;
                speechSynthesis.cancel();
                speechSynthesis.speak(utt);
            }
        },
        {
            id: 'tts-stop',
            name: 'Stop Text-to-Speech',
            icon: '🔇',
            settings: [],
            async execute() { speechSynthesis.cancel(); }
        },
        {
            id: 'auto-repeat-msg',
            name: 'Auto-Repeat Chat Message',
            icon: '🔁',
            settings: [
                { key: 'message', label: 'Message', type: 'text', placeholder: '!hydrate' },
                { key: 'interval', label: 'Interval (seconds)', type: 'number', min: 10, max: 3600, default: 300 }
            ],
            getState(s, ctx, btnId) {
                return { active: !!_autoRepeatIntervals[btnId], sub: _autoRepeatIntervals[btnId] ? 'ON' : 'OFF' };
            },
            async execute(s, ctx, btnId) {
                if (_autoRepeatIntervals[btnId]) {
                    clearInterval(_autoRepeatIntervals[btnId]);
                    delete _autoRepeatIntervals[btnId];
                    ctx.showToast('Auto-repeat stopped', 'info');
                } else {
                    if (!s.message) throw new Error('No message set');
                    const sec = Math.max(10, parseInt(s.interval) || 300);
                    _autoRepeatIntervals[btnId] = setInterval(() => {
                        try { sendChatMessage(s.message); } catch(e) {}
                    }, sec * 1000);
                    ctx.showToast('Auto-repeat started (' + sec + 's)', 'success');
                }
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'scene-then-filter',
            name: 'Switch Scene + Toggle Filter',
            icon: '🎬',
            settings: [
                { key: 'scene', label: 'Scene to Switch To', type: 'obs-scene' },
                { key: 'filter_source', label: 'Filter Source Name', type: 'text', placeholder: 'Source name' },
                { key: 'filter_name', label: 'Filter Name', type: 'text', placeholder: 'Filter name' }
            ],
            async execute(s, ctx) {
                if (s.scene) await ctx.obs.call('SetCurrentProgramScene', { sceneName: s.scene });
                if (s.filter_source && s.filter_name) {
                    const r = await ctx.obs.call('GetSourceFilter', { sourceName: s.filter_source, filterName: s.filter_name });
                    await ctx.obs.call('SetSourceFilterEnabled', {
                        sourceName: s.filter_source,
                        filterName: s.filter_name,
                        filterEnabled: !r.filterEnabled
                    });
                }
            }
        },
        {
            id: 'scene-then-mute',
            name: 'Switch Scene + Toggle Mute',
            icon: '🎤',
            settings: [
                { key: 'scene', label: 'Scene to Switch To', type: 'obs-scene' },
                { key: 'inputName', label: 'Audio Source to Toggle', type: 'obs-input' }
            ],
            async execute(s, ctx) {
                if (s.scene) await ctx.obs.call('SetCurrentProgramScene', { sceneName: s.scene });
                if (s.inputName) await ctx.obs.call('ToggleInputMute', { inputName: s.inputName });
            }
        },
        {
            id: 'conditional-stream',
            name: 'If Streaming → Else',
            icon: '❓',
            settings: [
                { key: 'msg_live', label: 'Chat message when LIVE', type: 'text', placeholder: '!live on' },
                { key: 'msg_offline', label: 'Chat message when OFFLINE', type: 'text', placeholder: '!live off' }
            ],
            async execute(s, ctx) {
                const msg = ctx.obs.streaming ? s.msg_live : s.msg_offline;
                if (msg) {
                    try { sendChatMessage(msg); } catch(e) { ctx.showToast(e.message, 'error'); }
                }
            }
        },
        {
            id: 'open-urls-sequence',
            name: 'Open Multiple URLs',
            icon: '🔗',
            settings: [
                { key: 'urls', label: 'URLs (one per line)', type: 'text', placeholder: 'https://a.com\nhttps://b.com' }
            ],
            async execute(s) {
                if (!s.urls) throw new Error('No URLs set');
                s.urls.split('\n').map(u => u.trim()).filter(Boolean).forEach((url, i) => {
                    setTimeout(() => window.open(url, '_blank'), i * 200);
                });
            }
        }
    ]
});
