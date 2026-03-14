/* ─── Twitch Extra Plugin ─── */

const _texCache = { pollId: null, predictionId: null };

CubDeck.registerPlugin({
    id: 'twitch-extra',
    name: 'Twitch Extra',
    icon: '🎮',
    actions: [
        {
            id: 'create-clip',
            name: 'Create Clip',
            icon: '🎬',
            settings: [
                { key: 'hasDelay', label: 'Has delay (broadcaster perspective)', type: 'checkbox', default: false }
            ],
            async execute(s, ctx) {
                try {
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    const hasDelay = s.hasDelay ? 'true' : 'false';
                    const data = await _twitchApi('POST', '/clips?broadcaster_id=' + user.id + '&has_delay=' + hasDelay, null, ctx.config.twitch_oauth);
                    const clip = data.data?.[0];
                    if (!clip) throw new Error('Clip creation failed');
                    ctx.showToast('Clip created! ' + clip.edit_url, 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'create-poll',
            name: 'Create Poll',
            icon: '📊',
            settings: [
                { key: 'title', label: 'Poll title', type: 'text', placeholder: 'What should I play next?' },
                { key: 'opt1', label: 'Option 1', type: 'text', default: 'Yes' },
                { key: 'opt2', label: 'Option 2', type: 'text', default: 'No' },
                { key: 'opt3', label: 'Option 3 (blank=skip)', type: 'text', placeholder: '' },
                { key: 'duration', label: 'Duration seconds', type: 'number', default: 60, min: 15, max: 1800 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.title) throw new Error('Poll title required');
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    const choices = [s.opt1 || 'Yes', s.opt2 || 'No'];
                    if (s.opt3 && s.opt3.trim()) choices.push(s.opt3.trim());
                    const data = await _twitchApi('POST', '/polls', {
                        broadcaster_id: user.id,
                        title: s.title,
                        choices: choices.map(c => ({ title: c })),
                        duration: parseInt(s.duration) || 60
                    }, ctx.config.twitch_oauth);
                    const poll = data.data?.[0];
                    if (poll) _texCache.pollId = poll.id;
                    ctx.showToast('Poll started!', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'end-poll',
            name: 'End Poll',
            icon: '🛑',
            settings: [
                { key: 'status', label: 'End action', type: 'select', options: [
                    { value: 'TERMINATED', label: 'End now (show results)' },
                    { value: 'ARCHIVED', label: 'Archive (hide results)' }
                ]}
            ],
            async execute(s, ctx) {
                try {
                    if (!_texCache.pollId) throw new Error('No poll in progress');
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    await _twitchApi('PATCH', '/polls', {
                        broadcaster_id: user.id,
                        id: _texCache.pollId,
                        status: s.status || 'TERMINATED'
                    }, ctx.config.twitch_oauth);
                    ctx.showToast('Poll ended', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'create-prediction',
            name: 'Create Prediction',
            icon: '🔮',
            settings: [
                { key: 'title', label: 'Prediction title', type: 'text', placeholder: 'Will I win this fight?' },
                { key: 'opt1', label: 'Blue option', type: 'text', default: 'Yes' },
                { key: 'opt2', label: 'Pink option', type: 'text', default: 'No' },
                { key: 'duration', label: 'Duration seconds', type: 'number', default: 120, min: 30, max: 1800 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.title) throw new Error('Prediction title required');
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    const data = await _twitchApi('POST', '/predictions', {
                        broadcaster_id: user.id,
                        title: s.title,
                        outcomes: [
                            { title: s.opt1 || 'Yes' },
                            { title: s.opt2 || 'No' }
                        ],
                        prediction_window: parseInt(s.duration) || 120
                    }, ctx.config.twitch_oauth);
                    const pred = data.data?.[0];
                    if (pred) _texCache.predictionId = pred.id;
                    ctx.showToast('Prediction started!', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'resolve-prediction',
            name: 'Resolve Prediction',
            icon: '✅',
            settings: [
                { key: 'outcome', label: 'Winning outcome', type: 'select', options: [
                    { value: '1', label: 'Blue wins' },
                    { value: '2', label: 'Pink wins' }
                ]}
            ],
            async execute(s, ctx) {
                try {
                    if (!_texCache.predictionId) throw new Error('No prediction active');
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    const predData = await _twitchApi('GET', '/predictions?broadcaster_id=' + user.id + '&id=' + _texCache.predictionId, null, ctx.config.twitch_oauth);
                    const pred = predData.data?.[0];
                    if (!pred) throw new Error('Prediction not found');
                    const outcomeIndex = parseInt(s.outcome || '1') - 1;
                    const winningOutcomeId = pred.outcomes[outcomeIndex]?.id;
                    if (!winningOutcomeId) throw new Error('Outcome not found');
                    await _twitchApi('PATCH', '/predictions', {
                        broadcaster_id: user.id,
                        id: _texCache.predictionId,
                        status: 'RESOLVED',
                        winning_outcome_id: winningOutcomeId
                    }, ctx.config.twitch_oauth);
                    ctx.showToast('Prediction resolved!', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'cancel-prediction',
            name: 'Cancel Prediction',
            icon: '❌',
            settings: [],
            async execute(s, ctx) {
                try {
                    if (!_texCache.predictionId) throw new Error('No prediction active');
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    await _twitchApi('PATCH', '/predictions', {
                        broadcaster_id: user.id,
                        id: _texCache.predictionId,
                        status: 'CANCELED'
                    }, ctx.config.twitch_oauth);
                    _texCache.predictionId = null;
                    ctx.showToast('Prediction cancelled', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'run-commercial',
            name: 'Run Ad',
            icon: '📺',
            settings: [
                { key: 'length', label: 'Length', type: 'select', options: [
                    { value: 30, label: '30s' },
                    { value: 60, label: '60s' },
                    { value: 90, label: '90s' },
                    { value: 120, label: '120s' },
                    { value: 150, label: '150s' },
                    { value: 180, label: '180s' }
                ]}
            ],
            async execute(s, ctx) {
                try {
                    const user = await _getTwitchUserId(ctx.config.twitch_oauth);
                    await _twitchApi('POST', '/channels/commercial', {
                        broadcaster_id: user.id,
                        length: parseInt(s.length) || 30
                    }, ctx.config.twitch_oauth);
                    ctx.showToast('Ad started: ' + s.length + 's', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'delete-chat-message',
            name: 'Clear a User from Chat',
            icon: '🚫',
            settings: [
                { key: 'username', label: 'Username to ban/timeout', type: 'text', placeholder: 'username' },
                { key: 'duration', label: 'Timeout seconds (0=ban)', type: 'number', default: 600, min: 0 }
            ],
            async execute(s, ctx) {
                try {
                    if (typeof sendChatCommand === 'undefined') throw new Error('Twitch not connected');
                    if (!s.username) throw new Error('Username required');
                    const dur = parseInt(s.duration) || 0;
                    if (dur > 0) {
                        sendChatCommand('timeout', s.username + ' ' + dur);
                        ctx.showToast('Timed out ' + s.username + ' for ' + dur + 's', 'success');
                    } else {
                        sendChatCommand('ban', s.username);
                        ctx.showToast('Banned ' + s.username, 'success');
                    }
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
