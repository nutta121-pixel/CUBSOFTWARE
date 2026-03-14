/* ─── Notifications Plugin ─── */

const _notifReminders = {};

CubDeck.registerPlugin({
    id: 'notifications',
    name: 'Notifications',
    icon: '🔔',
    actions: [
        {
            id: 'send-notification',
            name: 'Desktop Notification',
            icon: '🔔',
            settings: [
                { key: 'title', label: 'Title', type: 'text', placeholder: 'CubDeck' },
                { key: 'body', label: 'Message body', type: 'text', placeholder: 'Your notification message' },
                { key: 'icon', label: 'Icon URL (optional)', type: 'text', placeholder: 'https://...' },
                { key: 'tag', label: 'Tag (optional, groups notifications)', type: 'text', placeholder: 'my-tag' }
            ],
            async execute(s, ctx) {
                try {
                    if (Notification.permission === 'denied') throw new Error('Notifications blocked in browser settings');
                    if (Notification.permission !== 'granted') {
                        await Notification.requestPermission();
                    }
                    if (Notification.permission === 'granted') {
                        new Notification(s.title || 'CubDeck', {
                            body: s.body || '',
                            icon: s.icon || '',
                            tag: s.tag || ''
                        });
                        ctx.showToast('Notification sent', 'success');
                    } else {
                        throw new Error('Notification permission denied');
                    }
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'request-permission',
            name: 'Request Notification Permission',
            icon: '🔔',
            settings: [],
            async execute(s, ctx) {
                try {
                    const p = await Notification.requestPermission();
                    ctx.showToast('Permission: ' + p, p === 'granted' ? 'success' : 'error');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                const p = (typeof Notification !== 'undefined') ? Notification.permission : 'default';
                return {
                    label: p === 'granted' ? 'Allowed' : p === 'denied' ? 'Blocked' : 'Click to Allow',
                    icon: '🔔',
                    color: p === 'granted' ? '#16a34a' : p === 'denied' ? '#dc2626' : '#374151'
                };
            }
        },
        {
            id: 'scheduled-reminder',
            name: 'Scheduled Reminder Notification',
            icon: '⏰',
            settings: [
                { key: 'time', label: 'Time HH:MM to fire', type: 'text', placeholder: '20:00' },
                { key: 'title', label: 'Reminder title', type: 'text', placeholder: 'Stream Reminder' },
                { key: 'body', label: 'Reminder message', type: 'text', placeholder: 'Time to go live!' },
                { key: 'id', label: 'Reminder ID', type: 'text', placeholder: 'reminder1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.id) throw new Error('Reminder ID required');
                    if (!s.time) throw new Error('Time required');
                    if (_notifReminders[s.id]) {
                        clearTimeout(_notifReminders[s.id]);
                        delete _notifReminders[s.id];
                    }
                    const [h, m] = (s.time || '00:00').split(':').map(Number);
                    const target = new Date();
                    target.setHours(h, m, 0, 0);
                    if (target <= new Date()) target.setDate(target.getDate() + 1);
                    const ms = target.getTime() - Date.now();
                    _notifReminders[s.id] = setTimeout(async () => {
                        delete _notifReminders[s.id];
                        if (Notification.permission !== 'granted') return;
                        new Notification(s.title || 'CubDeck Reminder', { body: s.body || '' });
                    }, ms);
                    ctx.showToast('Reminder set for ' + s.time, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'clear-notifications',
            name: 'Clear All Notifications',
            icon: '🗑️',
            settings: [
                { key: 'tag', label: 'Tag to clear (blank=all)', type: 'text', placeholder: '(blank=all)' }
            ],
            async execute(s, ctx) {
                try {
                    ctx.showToast('Check notification center to dismiss', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'vibrate',
            name: 'Vibrate (mobile)',
            icon: '📳',
            settings: [
                { key: 'pattern', label: 'Vibration pattern ms (comma separated)', type: 'text', placeholder: '200,100,200', default: '200' }
            ],
            async execute(s, ctx) {
                try {
                    if (!navigator.vibrate) throw new Error('Vibration not supported on this device');
                    const pat = (s.pattern || '200').split(',').map(Number).filter(n => !isNaN(n));
                    navigator.vibrate(pat);
                    ctx.showToast('Vibrating', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
