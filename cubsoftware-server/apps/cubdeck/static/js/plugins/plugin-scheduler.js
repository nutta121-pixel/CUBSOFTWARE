/* ─── Scheduler Plugin ─── */

const _schedulerJobs = {};
let _schedulerJobCounter = 0;

function _parseTimeToday(timeStr) {
    const [h, m] = (timeStr || '00:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    if (d < new Date()) d.setDate(d.getDate() + 1);
    return d;
}

CubDeck.registerPlugin({
    id: 'scheduler',
    name: 'Scheduler',
    icon: '🕐',
    actions: [
        {
            id: 'repeat-action',
            name: 'Repeat Chat Message',
            icon: '🔄',
            settings: [
                { key: 'message', label: 'Message to send in chat', type: 'text', placeholder: 'Check out my socials!' },
                { key: 'interval', label: 'Repeat every N minutes', type: 'number', default: 30, min: 1, max: 720 },
                { key: 'id', label: 'Timer ID (unique key)', type: 'text', placeholder: 'timer1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.id) throw new Error('Timer ID required');
                    if (!s.message) throw new Error('Message required');
                    if (_schedulerJobs[s.id]) {
                        clearInterval(_schedulerJobs[s.id].interval);
                        clearTimeout(_schedulerJobs[s.id].timeout);
                        delete _schedulerJobs[s.id];
                    }
                    const ms = (parseInt(s.interval) || 30) * 60 * 1000;
                    const intervalRef = setInterval(() => {
                        if (typeof sendChatMessage !== 'undefined') {
                            sendChatMessage(s.message);
                        }
                    }, ms);
                    _schedulerJobs[s.id] = { interval: intervalRef, timeout: null, description: s.message, intervalMin: parseInt(s.interval) || 30 };
                    ctx.showToast('Repeating every ' + s.interval + ' min', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const job = _schedulerJobs[s.id];
                return {
                    label: job ? 'Repeating ' + (s.interval || '?') + 'min' : 'Stopped',
                    icon: '🔄',
                    color: job ? '#16a34a' : '#374151',
                    active: !!job
                };
            }
        },
        {
            id: 'stop-repeat',
            name: 'Stop Repeating Timer',
            icon: '⏹️',
            settings: [
                { key: 'id', label: 'Timer ID to stop', type: 'text', placeholder: 'timer1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.id) throw new Error('Timer ID required');
                    if (_schedulerJobs[s.id]) {
                        clearInterval(_schedulerJobs[s.id].interval);
                        clearTimeout(_schedulerJobs[s.id].timeout);
                        delete _schedulerJobs[s.id];
                        ctx.showToast('Stopped: ' + s.id, 'info');
                    } else {
                        ctx.showToast('No timer: ' + s.id, 'error');
                    }
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'run-at-time',
            name: 'Run Chat Message at Time',
            icon: '🕐',
            settings: [
                { key: 'time', label: 'Time HH:MM (24h)', type: 'text', placeholder: '20:00' },
                { key: 'message', label: 'Message to send', type: 'text', placeholder: 'Stream starting soon!' },
                { key: 'id', label: 'Timer ID', type: 'text', placeholder: 'timed1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.id) throw new Error('Timer ID required');
                    if (!s.message) throw new Error('Message required');
                    if (!s.time) throw new Error('Time required');
                    if (_schedulerJobs[s.id]) {
                        clearInterval(_schedulerJobs[s.id].interval);
                        clearTimeout(_schedulerJobs[s.id].timeout);
                        delete _schedulerJobs[s.id];
                    }
                    const target = _parseTimeToday(s.time);
                    const ms = target.getTime() - Date.now();
                    const timeoutRef = setTimeout(() => {
                        if (typeof sendChatMessage !== 'undefined') {
                            sendChatMessage(s.message);
                        }
                        delete _schedulerJobs[s.id];
                        ctx.showToast('Scheduled message sent: ' + s.message, 'info');
                    }, ms);
                    _schedulerJobs[s.id] = { interval: null, timeout: timeoutRef, description: s.message };
                    ctx.showToast('Scheduled for ' + s.time, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'one-shot-delay',
            name: 'Run After Delay',
            icon: '⏱️',
            settings: [
                { key: 'delay', label: 'Delay in seconds', type: 'number', default: 60, min: 1, max: 3600 },
                { key: 'message', label: 'Message to send in chat', type: 'text', placeholder: 'Reminder message!' },
                { key: 'id', label: 'Timer ID', type: 'text', placeholder: 'delay1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.id) throw new Error('Timer ID required');
                    if (!s.message) throw new Error('Message required');
                    if (_schedulerJobs[s.id]) {
                        clearInterval(_schedulerJobs[s.id].interval);
                        clearTimeout(_schedulerJobs[s.id].timeout);
                        delete _schedulerJobs[s.id];
                    }
                    const delay = (parseInt(s.delay) || 60) * 1000;
                    const timeoutRef = setTimeout(() => {
                        if (typeof sendChatMessage !== 'undefined') {
                            sendChatMessage(s.message);
                        }
                        delete _schedulerJobs[s.id];
                        ctx.showToast('Delayed message sent: ' + s.message, 'info');
                    }, delay);
                    _schedulerJobs[s.id] = { interval: null, timeout: timeoutRef, description: s.message };
                    ctx.showToast('Will send in ' + s.delay + 's', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'stop-all',
            name: 'Stop All Scheduled Jobs',
            icon: '🛑',
            settings: [],
            async execute(s, ctx) {
                try {
                    Object.values(_schedulerJobs).forEach(j => {
                        if (j.interval) clearInterval(j.interval);
                        if (j.timeout) clearTimeout(j.timeout);
                    });
                    Object.keys(_schedulerJobs).forEach(k => delete _schedulerJobs[k]);
                    ctx.showToast('All scheduled jobs stopped', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'jobs-display',
            name: 'Scheduled Jobs Count Display',
            icon: '🕐',
            settings: [],
            async execute(s, ctx) {
                try {
                    const count = Object.keys(_schedulerJobs).length;
                    ctx.showToast(count + ' active job' + (count !== 1 ? 's' : ''), 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const count = Object.keys(_schedulerJobs).length;
                return {
                    label: count + ' active job' + (count !== 1 ? 's' : ''),
                    icon: '🕐',
                    color: count > 0 ? '#d97706' : '#374151'
                };
            }
        }
    ]
});
