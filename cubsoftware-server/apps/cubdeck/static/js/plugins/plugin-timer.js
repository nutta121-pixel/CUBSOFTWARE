/* ─── Timer Plugin ─── */
const _timers = {}; // id → { type, running, start, elapsed, duration, interval }

function getTimer(id) {
    if (!_timers[id]) _timers[id] = { type: 'stopwatch', running: false, elapsed: 0, duration: 0, start: 0, interval: null };
    return _timers[id];
}

function formatTime(ms) {
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${m}:${String(sec).padStart(2,'0')}`;
}

function tickTimer(id, el) {
    const t = _timers[id];
    if (!t) return;
    const now = Date.now();
    if (t.type === 'stopwatch') {
        t.elapsed = t.start ? (now - t.start) + (t.prevElapsed || 0) : t.prevElapsed || 0;
        if (el) { const sub = el.querySelector('.cd-deck-btn-sub'); if (sub) sub.textContent = formatTime(t.elapsed); }
    } else if (t.type === 'countdown') {
        const remaining = Math.max(0, t.duration - (t.start ? (now - t.start) : 0) - (t.prevElapsed || 0));
        if (el) { const sub = el.querySelector('.cd-deck-btn-sub'); if (sub) sub.textContent = formatTime(remaining); }
        if (remaining <= 0) {
            stopTimer(id, el);
            if (el) el.classList.add('cd-btn-active');
        }
    }
}

function startTimer(id, el) {
    const t = getTimer(id);
    if (t.running) return;
    t.running = true;
    t.start = Date.now();
    t.prevElapsed = t.elapsed || 0;
    t.interval = setInterval(() => tickTimer(id, el), 500);
}

function stopTimer(id, el) {
    const t = getTimer(id);
    if (!t.running) return;
    t.running = false;
    clearInterval(t.interval);
    t.interval = null;
    t.elapsed = t.type === 'stopwatch'
        ? (t.start ? (Date.now() - t.start) + (t.prevElapsed || 0) : t.prevElapsed || 0)
        : t.elapsed;
    t.prevElapsed = t.elapsed;
    t.start = 0;
}

function resetTimer(id, el) {
    const t = getTimer(id);
    stopTimer(id, el);
    t.elapsed = 0;
    t.prevElapsed = 0;
    if (el) { const sub = el.querySelector('.cd-deck-btn-sub'); if (sub) sub.textContent = formatTime(0); }
    el?.classList.remove('cd-btn-active');
}

CubDeck.registerPlugin({
    id: 'timer',
    name: 'Timer',
    icon: '⏱️',
    actions: [
        {
            id: 'stopwatch',
            name: 'Stopwatch (tap to start/stop)',
            icon: '⏱️',
            settings: [],
            getState(s, ctx, btnId) {
                const t = _timers[btnId];
                const elapsed = t?.elapsed || 0;
                return { active: t?.running || false, sub: formatTime(elapsed) };
            },
            async execute(s, ctx, el, btnId) {
                const t = getTimer(btnId);
                const domEl = document.querySelector(`[data-row="${el?.dataset?.row}"][data-col="${el?.dataset?.col}"]`);
                if (t.running) stopTimer(btnId, domEl);
                else startTimer(btnId, domEl);
            }
        },
        {
            id: 'stopwatch-reset',
            name: 'Stopwatch Reset',
            icon: '🔄',
            settings: [{ key: 'target_id', label: 'Stopwatch Button ID (from button editor URL)', type: 'text', placeholder: 'Leave blank to reset all' }],
            async execute(s, ctx) {
                if (s.target_id) resetTimer(s.target_id, null);
                else Object.keys(_timers).forEach(id => resetTimer(id, null));
                ctx.showToast('Timer reset');
            }
        },
        {
            id: 'countdown',
            name: 'Countdown Timer',
            icon: '⏳',
            settings: [
                { key: 'minutes', label: 'Minutes', type: 'number', min: 0, max: 1440, default: 5 },
                { key: 'seconds', label: 'Seconds', type: 'number', min: 0, max: 59, default: 0 }
            ],
            getState(s, ctx, btnId) {
                const t = _timers[btnId];
                const dur = ((parseInt(s.minutes) || 0) * 60 + (parseInt(s.seconds) || 0)) * 1000;
                if (!t) return { sub: formatTime(dur) };
                const remaining = t.type === 'countdown'
                    ? Math.max(0, t.duration - (t.running ? (Date.now() - t.start) : 0) - (t.prevElapsed || 0))
                    : dur;
                return { active: t.running, sub: formatTime(remaining) };
            },
            async execute(s, ctx, el, btnId) {
                const t = getTimer(btnId);
                t.type = 'countdown';
                const dur = ((parseInt(s.minutes) || 0) * 60 + (parseInt(s.seconds) || 0)) * 1000;

                if (t.running) {
                    // Tap again = stop
                    stopTimer(btnId, el);
                } else if (t.elapsed >= dur || !t.duration) {
                    // Reset and start
                    t.duration = dur;
                    t.elapsed = 0;
                    t.prevElapsed = 0;
                    el?.classList.remove('cd-btn-active');
                    startTimer(btnId, el);
                } else {
                    // Resume
                    t.duration = dur;
                    startTimer(btnId, el);
                }
            }
        }
    ]
});
