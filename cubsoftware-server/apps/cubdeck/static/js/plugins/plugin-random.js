/* ─── Random & Picker Plugin ─── */

let _randomHistory = [];

CubDeck.registerPlugin({
    id: 'random',
    name: 'Random & Picker',
    icon: '🎲',
    actions: [
        {
            id: 'random-number',
            name: 'Random Number',
            settings: [
                { key: 'min', label: 'Minimum', type: 'text', placeholder: '1' },
                { key: 'max', label: 'Maximum', type: 'text', placeholder: '100' },
                { key: 'to_chat', label: 'Post to Twitch chat', type: 'select', options: [
                    { value: '0', label: 'No' }, { value: '1', label: 'Yes' }
                ], default: '0' }
            ],
            getState(s, ctx) {
                const last = _randomHistory.find(h => h.type === 'number');
                return { label: last ? String(last.value) : 'Random #', icon: '🎲' };
            },
            async execute(s, ctx) {
                const min = parseInt(s.min) || 1;
                const max = parseInt(s.max) || 100;
                const result = Math.floor(Math.random() * (max - min + 1)) + min;
                _randomHistory.unshift({ type: 'number', value: result });
                if (_randomHistory.length > 20) _randomHistory.pop();
                ctx.showToast(`Random number: ${result}`, 'success');
                if (s.to_chat === '1' && typeof sendChatMessage === 'function') {
                    sendChatMessage(`🎲 Random number (${min}-${max}): ${result}`);
                }
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'coin-flip',
            name: 'Coin Flip',
            settings: [
                { key: 'to_chat', label: 'Post to Twitch chat', type: 'select', options: [
                    { value: '0', label: 'No' }, { value: '1', label: 'Yes' }
                ], default: '0' }
            ],
            getState(s, ctx) {
                const last = _randomHistory.find(h => h.type === 'coin');
                return { label: last ? last.value : 'Flip Coin', icon: '🪙' };
            },
            async execute(s, ctx) {
                const result = Math.random() < 0.5 ? 'Heads' : 'Tails';
                _randomHistory.unshift({ type: 'coin', value: result });
                if (_randomHistory.length > 20) _randomHistory.pop();
                ctx.showToast(`Coin flip: ${result}`, 'success');
                if (s.to_chat === '1' && typeof sendChatMessage === 'function') {
                    sendChatMessage(`🪙 Coin flip: ${result}!`);
                }
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'dice-roll',
            name: 'Dice Roll',
            settings: [
                { key: 'dice', label: 'Dice (e.g. 2d6, 1d20)', type: 'text', placeholder: '1d6' },
                { key: 'to_chat', label: 'Post to Twitch chat', type: 'select', options: [
                    { value: '0', label: 'No' }, { value: '1', label: 'Yes' }
                ], default: '0' }
            ],
            getState(s, ctx) {
                const last = _randomHistory.find(h => h.type === 'dice');
                return { label: last ? last.value : (s.dice || '1d6'), icon: '🎲' };
            },
            async execute(s, ctx) {
                const diceStr = (s.dice || '1d6').toLowerCase();
                const match = diceStr.match(/^(\d+)d(\d+)$/);
                if (!match) return ctx.showToast('Invalid dice format. Use NdN (e.g. 2d6)', 'error');
                const count = Math.min(parseInt(match[1]), 20);
                const sides = Math.min(parseInt(match[2]), 1000);
                const rolls = [];
                for (let i = 0; i < count; i++) rolls.push(Math.floor(Math.random() * sides) + 1);
                const total = rolls.reduce((a, b) => a + b, 0);
                const result = count > 1 ? `${total} (${rolls.join(', ')})` : String(total);
                _randomHistory.unshift({ type: 'dice', value: result });
                if (_randomHistory.length > 20) _randomHistory.pop();
                ctx.showToast(`${diceStr}: ${result}`, 'success');
                if (s.to_chat === '1' && typeof sendChatMessage === 'function') {
                    sendChatMessage(`🎲 ${diceStr} roll: ${result}`);
                }
                ctx.refreshAllButtons();
            }
        },
        {
            id: 'pick-from-list',
            name: 'Pick from List',
            settings: [
                { key: 'items', label: 'Items (one per line)', type: 'textarea', placeholder: 'Pizza\nSushi\nBurgers\nTacos' },
                { key: 'to_chat', label: 'Post to Twitch chat', type: 'select', options: [
                    { value: '0', label: 'No' }, { value: '1', label: 'Yes' }
                ], default: '0' }
            ],
            getState(s, ctx) {
                const last = _randomHistory.find(h => h.type === 'pick');
                return { label: last ? last.value : 'Pick random', icon: '🎯' };
            },
            async execute(s, ctx) {
                try {
                    const items = (s.items || '').split('\n').map(i => i.trim()).filter(Boolean);
                    if (items.length === 0) throw new Error('Add items to the list first');
                    const pick = items[Math.floor(Math.random() * items.length)];
                    _randomHistory.unshift({ type: 'pick', value: pick });
                    if (_randomHistory.length > 20) _randomHistory.pop();
                    ctx.showToast(`Picked: ${pick}`, 'success');
                    if (s.to_chat === '1' && typeof sendChatMessage === 'function') {
                        sendChatMessage(`🎯 Random pick: ${pick}`);
                    }
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'shuffle-list',
            name: 'Shuffle & Show List',
            settings: [
                { key: 'items', label: 'Items (one per line)', type: 'textarea', placeholder: 'Player1\nPlayer2\nPlayer3' },
                { key: 'to_chat', label: 'Post to Twitch chat', type: 'select', options: [
                    { value: '0', label: 'No' }, { value: '1', label: 'Yes' }
                ], default: '0' }
            ],
            async execute(s, ctx) {
                try {
                    const items = (s.items || '').split('\n').map(i => i.trim()).filter(Boolean);
                    if (items.length === 0) throw new Error('Add items to shuffle');
                    for (let i = items.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [items[i], items[j]] = [items[j], items[i]];
                    }
                    ctx.showToast('Shuffled: ' + items.join(', '), 'info');
                    if (s.to_chat === '1' && typeof sendChatMessage === 'function') {
                        sendChatMessage('🔀 Shuffled order: ' + items.join(', '));
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'random-chat-user',
            name: 'Pick Random Chat User',
            settings: [
                { key: 'prefix', label: 'Chat message prefix', type: 'text', placeholder: '!pick winner' },
                { key: 'to_chat', label: 'Announce in chat', type: 'select', options: [
                    { value: '1', label: 'Yes' }, { value: '0', label: 'No' }
                ], default: '1' }
            ],
            async execute(s, ctx) {
                try {
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    const data = await _twitchApi('GET', `/chat/chatters?broadcaster_id=${user.id}&moderator_id=${user.id}`, null, oauth);
                    const chatters = data.data || [];
                    if (chatters.length === 0) throw new Error('No chatters found (or no permission)');
                    const winner = chatters[Math.floor(Math.random() * chatters.length)];
                    ctx.showToast(`Winner: ${winner.user_name}`, 'success');
                    if (s.to_chat !== '0' && typeof sendChatMessage === 'function') {
                        sendChatMessage(`🎉 ${s.prefix ? s.prefix + ' — ' : ''}Winner: @${winner.user_name}!`);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'magic-8ball',
            name: 'Magic 8-Ball',
            settings: [
                { key: 'to_chat', label: 'Post to Twitch chat', type: 'select', options: [
                    { value: '0', label: 'No' }, { value: '1', label: 'Yes' }
                ], default: '0' }
            ],
            getState(s, ctx) {
                const last = _randomHistory.find(h => h.type === '8ball');
                return { label: last ? last.value : '🎱 Ask away', icon: '🎱' };
            },
            async execute(s, ctx) {
                const answers = [
                    'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes definitely.',
                    'You may rely on it.', 'As I see it, yes.', 'Most likely.', 'Outlook good.',
                    'Yes.', 'Signs point to yes.', 'Reply hazy, try again.', 'Ask again later.',
                    'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
                    "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.'
                ];
                const answer = answers[Math.floor(Math.random() * answers.length)];
                _randomHistory.unshift({ type: '8ball', value: answer });
                if (_randomHistory.length > 20) _randomHistory.pop();
                ctx.showToast(`🎱 ${answer}`, 'info');
                if (s.to_chat === '1' && typeof sendChatMessage === 'function') {
                    sendChatMessage(`🎱 Magic 8-Ball says: ${answer}`);
                }
                ctx.refreshAllButtons();
            }
        }
    ]
});
