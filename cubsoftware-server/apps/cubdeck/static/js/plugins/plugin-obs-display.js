/* ─── OBS Display Plugin — live info buttons ─── */
CubDeck.registerPlugin({
    id: 'obs-display',
    name: 'OBS Display',
    icon: '📊',
    actions: [
        {
            id: 'current-scene',
            name: 'Current Scene Display',
            icon: '📺',
            settings: [],
            getState(s, ctx) {
                return { sub: ctx.obs.currentScene || '—' };
            },
            async execute() { }
        },
        {
            id: 'stream-status',
            name: 'Stream Status Display',
            icon: '📡',
            settings: [],
            getState(s, ctx) {
                return {
                    active: ctx.obs.streaming,
                    sub: ctx.obs.streaming ? '● LIVE' : '○ OFFLINE'
                };
            },
            async execute() { }
        },
        {
            id: 'record-status',
            name: 'Recording Status Display',
            icon: '⏺️',
            settings: [],
            getState(s, ctx) {
                return {
                    active: ctx.obs.recording,
                    sub: ctx.obs.recording ? '● REC' : '○ IDLE'
                };
            },
            async execute() { }
        },
        {
            id: 'stream-timer',
            name: 'Stream Timer',
            icon: '⏱️',
            settings: [],
            getState(s, ctx) {
                return { sub: _streamTimerLabel() };
            },
            async execute() { }
        },
        {
            id: 'replay-status',
            name: 'Replay Buffer Status',
            icon: '💾',
            settings: [],
            getState(s, ctx) {
                return {
                    active: ctx.obs.replayBufferActive,
                    sub: ctx.obs.replayBufferActive ? '● REPLAY' : '○ REPLAY'
                };
            },
            async execute(s, ctx) {
                await ctx.obs.call('ToggleReplayBuffer');
            }
        }
    ]
});

let _streamStartTime = null;
obsClient.on('streamStateChanged', (active) => {
    if (active) _streamStartTime = Date.now();
    else _streamStartTime = null;
});

function _streamTimerLabel() {
    if (!_streamStartTime) return '—';
    const s = Math.floor((Date.now() - _streamStartTime) / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h ? `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
             : `${m}:${String(sec).padStart(2,'0')}`;
}

// Refresh display buttons (including timer) every second
setInterval(() => {
    if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
}, 1000);
