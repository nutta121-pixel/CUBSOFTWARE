/* ─── Counter Plugin ─── */
CubDeck.registerPlugin({
    id: 'counter',
    name: 'Counter',
    icon: '🔢',
    actions: [
        {
            id: 'increment',
            name: 'Increment Counter',
            icon: '➕',
            settings: [
                { key: 'counter_id', label: 'Counter ID (e.g. "deaths")', type: 'text', placeholder: 'deaths' },
                { key: 'amount', label: 'Amount', type: 'number', min: 1, default: 1 }
            ],
            getState(s, ctx) {
                const v = ctx.getCounterValue(s.counter_id || 'default');
                return { sub: String(v) };
            },
            async execute(s, ctx) {
                const id = s.counter_id || 'default';
                const v = ctx.getCounterValue(id) + (parseInt(s.amount) || 1);
                ctx.setCounterValue(id, v);
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'decrement',
            name: 'Decrement Counter',
            icon: '➖',
            settings: [
                { key: 'counter_id', label: 'Counter ID', type: 'text', placeholder: 'deaths' },
                { key: 'amount', label: 'Amount', type: 'number', min: 1, default: 1 }
            ],
            getState(s, ctx) {
                const v = ctx.getCounterValue(s.counter_id || 'default');
                return { sub: String(v) };
            },
            async execute(s, ctx) {
                const id = s.counter_id || 'default';
                const v = ctx.getCounterValue(id) - (parseInt(s.amount) || 1);
                ctx.setCounterValue(id, v);
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'reset',
            name: 'Reset Counter',
            icon: '🔄',
            settings: [
                { key: 'counter_id', label: 'Counter ID', type: 'text', placeholder: 'deaths' },
                { key: 'value', label: 'Reset To', type: 'number', default: 0 }
            ],
            getState(s, ctx) {
                const v = ctx.getCounterValue(s.counter_id || 'default');
                return { sub: String(v) };
            },
            async execute(s, ctx) {
                const id = s.counter_id || 'default';
                ctx.setCounterValue(id, parseInt(s.value) || 0);
                ctx.refreshAllButtons();
                ctx.showToast('Counter reset to ' + (parseInt(s.value) || 0));
            }
        },
        {
            id: 'display',
            name: 'Counter Display (read-only)',
            icon: '📊',
            settings: [{ key: 'counter_id', label: 'Counter ID', type: 'text', placeholder: 'deaths' }],
            getState(s, ctx) {
                const v = ctx.getCounterValue(s.counter_id || 'default');
                return { sub: String(v) };
            },
            async execute() { /* display only */ }
        }
    ]
});
