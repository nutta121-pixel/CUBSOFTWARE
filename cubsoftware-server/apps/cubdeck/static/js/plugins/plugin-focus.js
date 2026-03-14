/* ─── Focus & Pomodoro Plugin ─── */

const _focusState = {
    mode: 'idle',       // 'work'|'break'|'long-break'|'idle'
    endTime: 0,
    startTime: 0,
    pomodoroCount: 0,
    paused: false,
    pausedRemaining: 0,
    interval: null
};

function _focusFormatTime(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

function _focusRemaining() {
    if (_focusState.paused) return _focusState.pausedRemaining;
    return Math.max(0, _focusState.endTime - Date.now());
}

function _focusStartInterval(ctx) {
    if (_focusState.interval) clearInterval(_focusState.interval);
    _focusState.interval = setInterval(() => {
        if (!_focusState.paused && _focusState.mode !== 'idle') {
            const remaining = _focusRemaining();
            if (remaining <= 0) {
                _focusState.mode = 'idle';
                _focusState.paused = false;
                clearInterval(_focusState.interval);
                _focusState.interval = null;
            }
        }
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
    }, 500);
}

CubDeck.registerPlugin({
    id: 'focus',
    name: 'Focus & Pomodoro',
    icon: '🍅',
    actions: [
        {
            id: 'start-work',
            name: 'Start Work Session',
            icon: '💼',
            settings: [
                { key: 'minutes', label: 'Work minutes', type: 'number', min: 1, max: 120, default: 25 },
                { key: 'message', label: 'Chat message on start', type: 'text', placeholder: '(leave blank for none)' }
            ],
            async execute(s, ctx) {
                try {
                    const minutes = parseInt(s.minutes) || 25;
                    _focusState.mode = 'work';
                    _focusState.startTime = Date.now();
                    _focusState.endTime = Date.now() + minutes * 60000;
                    _focusState.paused = false;
                    _focusState.pausedRemaining = 0;
                    _focusState.pomodoroCount++;
                    _focusStartInterval(ctx);
                    if (s.message && s.message.trim()) {
                        if (typeof sendChatMessage !== 'undefined') {
                            try { sendChatMessage(s.message.trim()); } catch (e) {}
                        }
                    }
                    ctx.showToast('Work session started: ' + minutes + 'min', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'start-break',
            name: 'Start Short Break',
            icon: '☕',
            settings: [
                { key: 'minutes', label: 'Break minutes', type: 'number', min: 1, max: 30, default: 5 },
                { key: 'message', label: 'Chat message on start', type: 'text', placeholder: '(leave blank for none)' }
            ],
            async execute(s, ctx) {
                try {
                    const minutes = parseInt(s.minutes) || 5;
                    _focusState.mode = 'break';
                    _focusState.startTime = Date.now();
                    _focusState.endTime = Date.now() + minutes * 60000;
                    _focusState.paused = false;
                    _focusState.pausedRemaining = 0;
                    _focusStartInterval(ctx);
                    if (s.message && s.message.trim()) {
                        if (typeof sendChatMessage !== 'undefined') {
                            try { sendChatMessage(s.message.trim()); } catch (e) {}
                        }
                    }
                    ctx.showToast('Break started: ' + minutes + 'min', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'start-long-break',
            name: 'Start Long Break',
            icon: '🛋️',
            settings: [
                { key: 'minutes', label: 'Long break minutes', type: 'number', min: 5, max: 60, default: 15 }
            ],
            async execute(s, ctx) {
                try {
                    const minutes = parseInt(s.minutes) || 15;
                    _focusState.mode = 'long-break';
                    _focusState.startTime = Date.now();
                    _focusState.endTime = Date.now() + minutes * 60000;
                    _focusState.paused = false;
                    _focusState.pausedRemaining = 0;
                    _focusStartInterval(ctx);
                    ctx.showToast('Long break started: ' + minutes + 'min', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'pause-resume',
            name: 'Pause / Resume',
            icon: '⏸️',
            settings: [],
            getState(s, ctx) {
                if (_focusState.mode === 'idle') return { label: '⏸ Pause', icon: '⏸️', color: '#374151' };
                if (_focusState.paused) return { label: '▶ Resume', icon: '▶️', color: '#16a34a' };
                return { label: '⏸ Pause', icon: '⏸️', color: '#d97706' };
            },
            async execute(s, ctx) {
                try {
                    if (_focusState.mode === 'idle') {
                        ctx.showToast('No active session', 'info');
                        return;
                    }
                    if (_focusState.paused) {
                        // Resume
                        _focusState.endTime = Date.now() + _focusState.pausedRemaining;
                        _focusState.paused = false;
                        _focusState.pausedRemaining = 0;
                        _focusStartInterval(ctx);
                        ctx.showToast('Resumed', 'success');
                    } else {
                        // Pause
                        _focusState.pausedRemaining = _focusRemaining();
                        _focusState.paused = true;
                        if (_focusState.interval) {
                            clearInterval(_focusState.interval);
                            _focusState.interval = null;
                        }
                        ctx.showToast('Paused', 'info');
                    }
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'reset-focus',
            name: 'Reset / Stop',
            icon: '⏹️',
            settings: [],
            async execute(s, ctx) {
                try {
                    if (_focusState.interval) {
                        clearInterval(_focusState.interval);
                        _focusState.interval = null;
                    }
                    _focusState.mode = 'idle';
                    _focusState.endTime = 0;
                    _focusState.startTime = 0;
                    _focusState.paused = false;
                    _focusState.pausedRemaining = 0;
                    ctx.showToast('Focus timer reset', 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'pomodoro-display',
            name: 'Focus Timer Display',
            icon: '🍅',
            settings: [],
            getState(s, ctx) {
                const mode = _focusState.mode;
                if (mode === 'idle') {
                    return { label: 'Idle', icon: '🍅', color: '#444' };
                }
                const remaining = _focusRemaining();
                const timeStr = _focusFormatTime(remaining);
                if (mode === 'work') {
                    return { label: timeStr + ' work', icon: '🍅', color: '#dc2626' };
                }
                if (mode === 'break') {
                    return { label: timeStr + ' break', icon: '☕', color: '#16a34a' };
                }
                if (mode === 'long-break') {
                    return { label: timeStr + ' long break', icon: '🛋️', color: '#0ea5e9' };
                }
                return { label: timeStr, icon: '🍅' };
            },
            async execute(s, ctx) {
                // Display button — clicking shows current pomodoro count
                ctx.showToast('Pomodoros completed: ' + (_focusState.pomodoroCount), 'info');
            }
        }
    ]
});
