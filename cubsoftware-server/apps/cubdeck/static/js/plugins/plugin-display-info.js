/* ─── Display & Info Plugin ─── */

const _displayState = {}; // per-button persistent state

function _fmtMs(ms) {
    if (ms < 0) ms = 0;
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (d > 0) return `${d}d ${h}h`;
    if (h > 0) return `${h}h ${String(m).padStart(2,'0')}m`;
    return `${m}:${String(s).padStart(2,'0')}`;
}

CubDeck.registerPlugin({
    id: 'display-info',
    name: 'Display & Info',
    icon: '📊',
    actions: [
        {
            id: 'countdown-date',
            name: 'Countdown to Date',
            icon: '📅',
            settings: [
                { key: 'target_date', label: 'Target Date & Time (YYYY-MM-DDTHH:MM)', type: 'text', placeholder: '2026-12-31T23:59' },
                { key: 'label', label: 'Label', type: 'text', placeholder: 'Event' }
            ],
            getState(s) {
                const target = new Date(s.target_date);
                if (isNaN(target)) return { sub: 'Invalid date' };
                const ms = target - Date.now();
                return { sub: ms > 0 ? _fmtMs(ms) : '🎉 Done!' };
            },
            async execute() { }
        },
        {
            id: 'dice-roll',
            name: 'Roll Dice',
            icon: '🎲',
            settings: [
                { key: 'sides', label: 'Sides', type: 'select', options: [
                    {value:'4',label:'d4'},{value:'6',label:'d6'},{value:'8',label:'d8'},
                    {value:'10',label:'d10'},{value:'12',label:'d12'},{value:'20',label:'d20'},{value:'100',label:'d100'}
                ], default: '6' },
                { key: 'announce', label: 'Announce result in chat', type: 'checkbox' }
            ],
            getState(s, ctx, btnId) {
                return { sub: _displayState[btnId] || '?' };
            },
            async execute(s, ctx, btnId) {
                const sides = parseInt(s.sides) || 6;
                const result = Math.floor(Math.random() * sides) + 1;
                _displayState[btnId] = `d${sides}: ${result}`;
                ctx.refreshAllButtons();
                if (s.announce) {
                    try { sendChatMessage(`🎲 Rolled a d${sides}: ${result}`); } catch(e) {}
                }
            }
        },
        {
            id: 'random-number',
            name: 'Random Number',
            icon: '🔢',
            settings: [
                { key: 'min', label: 'Min', type: 'number', min: 0, default: 1 },
                { key: 'max', label: 'Max', type: 'number', min: 1, default: 100 },
                { key: 'announce', label: 'Announce in chat', type: 'checkbox' }
            ],
            getState(s, ctx, btnId) {
                return { sub: _displayState[btnId] !== undefined ? String(_displayState[btnId]) : '?' };
            },
            async execute(s, ctx, btnId) {
                const min = parseInt(s.min) || 1;
                const max = parseInt(s.max) || 100;
                const result = Math.floor(Math.random() * (max - min + 1)) + min;
                _displayState[btnId] = result;
                ctx.refreshAllButtons();
                if (s.announce) {
                    try { sendChatMessage(`🔢 Random number: ${result}`); } catch(e) {}
                }
            }
        },
        {
            id: 'goal-tracker',
            name: 'Goal Tracker',
            icon: '🎯',
            settings: [
                { key: 'target', label: 'Target', type: 'number', min: 1, default: 100 },
                { key: 'label', label: 'Label', type: 'text', placeholder: 'Subs' },
                { key: 'step', label: 'Increment per tap', type: 'number', min: 1, default: 1 }
            ],
            getState(s, ctx, btnId) {
                const cur = _displayState[btnId] || 0;
                const target = parseInt(s.target) || 100;
                const pct = Math.min(100, Math.round((cur / target) * 100));
                return { sub: `${cur}/${target} (${pct}%)`, active: cur >= target };
            },
            async execute(s, ctx, btnId) {
                const step = parseInt(s.step) || 1;
                _displayState[btnId] = (_displayState[btnId] || 0) + step;
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'goal-reset',
            name: 'Reset Goal Tracker',
            icon: '🔄',
            settings: [{ key: 'btn_label', label: 'Target goal button label (for reference)', type: 'text', placeholder: '' }],
            async execute(s, ctx, btnId) {
                // Find the goal tracker with same position root (simplistic: reset by btn id prefix)
                Object.keys(_displayState).forEach(k => { _displayState[k] = 0; });
                ctx.refreshAllButtons();
                ctx.showToast('Goal reset', 'success');
            }
        },
        {
            id: 'weather',
            name: 'Weather Display',
            icon: '🌤️',
            settings: [
                { key: 'lat', label: 'Latitude', type: 'text', placeholder: '-41.2865' },
                { key: 'lon', label: 'Longitude', type: 'text', placeholder: '174.7762' },
                { key: 'unit', label: 'Unit', type: 'select', options: [
                    {value:'celsius',label:'°C'},{value:'fahrenheit',label:'°F'}
                ], default: 'celsius' }
            ],
            getState(s, ctx, btnId) {
                return { sub: _displayState['weather_' + btnId] || '…' };
            },
            async execute(s, ctx, btnId) {
                if (!s.lat || !s.lon) throw new Error('Latitude and longitude required');
                const unit = s.unit === 'fahrenheit' ? 'fahrenheit' : 'celsius';
                const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${s.lat}&longitude=${s.lon}&current_weather=true&temperature_unit=${unit}`);
                const d = await r.json();
                const temp = d.current_weather?.temperature;
                const code = d.current_weather?.weathercode;
                const icons = {0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌧️',53:'🌧️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',71:'🌨️',73:'🌨️',75:'🌨️',80:'🌦️',81:'🌦️',82:'🌦️',95:'⛈️',96:'⛈️',99:'⛈️'};
                const icon = icons[code] || '🌡️';
                const sym = unit === 'fahrenheit' ? '°F' : '°C';
                _displayState['weather_' + btnId] = `${icon} ${temp}${sym}`;
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'crypto-price',
            name: 'Crypto Price',
            icon: '₿',
            settings: [
                { key: 'coin', label: 'Coin ID (e.g. bitcoin, ethereum)', type: 'text', placeholder: 'bitcoin' },
                { key: 'currency', label: 'Currency', type: 'select', options: [
                    {value:'usd',label:'USD'},{value:'aud',label:'AUD'},{value:'nzd',label:'NZD'},
                    {value:'gbp',label:'GBP'},{value:'eur',label:'EUR'}
                ], default: 'nzd' }
            ],
            getState(s, ctx, btnId) {
                return { sub: _displayState['crypto_' + btnId] || '…' };
            },
            async execute(s, ctx, btnId) {
                if (!s.coin) throw new Error('Coin ID required');
                const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${s.coin}&vs_currencies=${s.currency || 'nzd'}`);
                const d = await r.json();
                const price = d[s.coin]?.[s.currency || 'nzd'];
                if (price === undefined) throw new Error('Coin not found');
                const sym = {usd:'$',aud:'A$',nzd:'NZ$',gbp:'£',eur:'€'}[s.currency] || '';
                _displayState['crypto_' + btnId] = `${sym}${price.toLocaleString()}`;
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'timezone-clock',
            name: 'Timezone Clock',
            icon: '🌍',
            settings: [
                { key: 'timezone', label: 'Timezone (e.g. America/New_York)', type: 'text', placeholder: 'America/New_York' },
                { key: 'label', label: 'Label', type: 'text', placeholder: 'NY' }
            ],
            getState(s) {
                try {
                    const t = new Date().toLocaleTimeString('en-US', { timeZone: s.timezone || 'UTC', hour: '2-digit', minute: '2-digit', hour12: false });
                    return { sub: (s.label ? s.label + '\n' : '') + t };
                } catch(e) { return { sub: 'Invalid TZ' }; }
            },
            async execute() { }
        },
        {
            id: 'session-uptime',
            name: 'Session Uptime',
            icon: '⏰',
            settings: [],
            getState(s, ctx, btnId) {
                if (!_displayState['session_start']) _displayState['session_start'] = Date.now();
                return { sub: _fmtMs(Date.now() - _displayState['session_start']) };
            },
            async execute() { }
        },
        {
            id: 'motivational-quote',
            name: 'Motivational Quote',
            icon: '💭',
            settings: [
                { key: 'announce', label: 'Send quote to chat', type: 'checkbox' }
            ],
            getState(s, ctx, btnId) {
                return { sub: _displayState['quote_' + btnId] ? '💬' : '?' };
            },
            async execute(s, ctx, btnId) {
                const r = await fetch('https://api.quotable.io/random?maxLength=100');
                const d = await r.json();
                const quote = `"${d.content}" — ${d.author}`;
                _displayState['quote_' + btnId] = quote;
                ctx.showToast(quote, 'success');
                if (s.announce) {
                    try { sendChatMessage(quote); } catch(e) {}
                }
            }
        }
    ]
});

// Refresh countdown/clock/timer display buttons every second
setInterval(() => {
    if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
}, 1000);
