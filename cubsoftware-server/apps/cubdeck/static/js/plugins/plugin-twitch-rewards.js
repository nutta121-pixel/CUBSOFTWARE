/* ─── Twitch Channel Points Rewards Plugin ─── */
// Requires channel:manage:redemptions + channel:read:redemptions scope

const _rewardsCache = {};

CubDeck.registerPlugin({
    id: 'twitch-rewards',
    name: 'Channel Points',
    icon: '🏆',
    actions: [
        {
            id: 'toggle-reward',
            name: 'Toggle Reward On/Off',
            settings: [
                { key: 'reward_name', label: 'Reward name (exact)', type: 'text', placeholder: 'Hydrate Alert' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.reward_name) throw new Error('Reward name required');
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    const data = await _twitchApi('GET', `/channel_points/custom_rewards?broadcaster_id=${user.id}`, null, oauth);
                    const reward = (data.data || []).find(r => r.title.toLowerCase() === s.reward_name.toLowerCase());
                    if (!reward) throw new Error('Reward not found: ' + s.reward_name);
                    const newState = !reward.is_enabled;
                    await _twitchApi('PATCH', `/channel_points/custom_rewards?broadcaster_id=${user.id}&id=${reward.id}`,
                        { is_enabled: newState }, oauth);
                    ctx.showToast(`Reward "${reward.title}" ${newState ? 'enabled' : 'disabled'}`, 'success');
                    delete _rewardsCache['rewards_' + ctx.config.twitch_channel];
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            },
            getState(s, ctx) {
                if (!s.reward_name || !ctx.config?.twitch_oauth) return { label: s.reward_name || 'Toggle Reward', icon: '🏆' };
                const channel = ctx.config.twitch_channel;
                const k = 'reward_' + channel + '_' + (s.reward_name || '');
                const now = Date.now();
                const cached = _rewardsCache[k];
                if (cached && now < cached.expires) {
                    return { label: cached.data.title, icon: '🏆', active: cached.data.is_enabled, color: cached.data.is_enabled ? '#9147ff' : '#374151' };
                }
                if (!_rewardsCache[k + '_f']) {
                    _rewardsCache[k + '_f'] = true;
                    const oauth = ctx.config.twitch_oauth;
                    const token = (oauth || '').replace(/^oauth:/, '');
                    fetch('https://api.twitch.tv/helix/users', { headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': '9n9yjc79p44kpsluv81kvvh6h9bxvu' } })
                        .then(r => r.json()).then(ud => {
                            const uid = ud.data && ud.data[0] && ud.data[0].id;
                            return fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${uid}`,
                                { headers: { 'Authorization': 'Bearer ' + token, 'Client-Id': '9n9yjc79p44kpsluv81kvvh6h9bxvu' } });
                        }).then(r => r.json()).then(d => {
                            const reward = (d.data || []).find(r => r.title.toLowerCase() === (s.reward_name || '').toLowerCase());
                            if (reward) _rewardsCache[k] = { data: reward, expires: Date.now() + 15000 };
                            _rewardsCache[k + '_f'] = false;
                            if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                        }).catch(() => { _rewardsCache[k + '_f'] = false; });
                }
                if (cached) return { label: cached.data.title, icon: '🏆', active: cached.data.is_enabled };
                return { label: s.reward_name || 'Toggle Reward', icon: '🏆' };
            }
        },
        {
            id: 'set-reward-cost',
            name: 'Set Reward Cost',
            settings: [
                { key: 'reward_name', label: 'Reward name (exact)', type: 'text', placeholder: 'Hydrate Alert' },
                { key: 'cost', label: 'New cost (points)', type: 'text', placeholder: '500' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.reward_name || !s.cost) throw new Error('Reward name and cost required');
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    const data = await _twitchApi('GET', `/channel_points/custom_rewards?broadcaster_id=${user.id}`, null, oauth);
                    const reward = (data.data || []).find(r => r.title.toLowerCase() === s.reward_name.toLowerCase());
                    if (!reward) throw new Error('Reward not found: ' + s.reward_name);
                    await _twitchApi('PATCH', `/channel_points/custom_rewards?broadcaster_id=${user.id}&id=${reward.id}`,
                        { cost: parseInt(s.cost) }, oauth);
                    ctx.showToast(`"${reward.title}" cost set to ${s.cost} points`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'create-reward',
            name: 'Create Reward',
            settings: [
                { key: 'title', label: 'Reward title', type: 'text', placeholder: 'My Reward' },
                { key: 'cost', label: 'Cost (points)', type: 'text', placeholder: '500' },
                { key: 'prompt', label: 'Viewer prompt (optional)', type: 'text', placeholder: 'Enter your message...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.title || !s.cost) throw new Error('Title and cost required');
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    const body = { title: s.title, cost: parseInt(s.cost) };
                    if (s.prompt) { body.prompt = s.prompt; body.is_user_input_required = true; }
                    await _twitchApi('POST', `/channel_points/custom_rewards?broadcaster_id=${user.id}`, body, oauth);
                    ctx.showToast('Reward created: ' + s.title, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'enable-reward',
            name: 'Enable Reward',
            settings: [
                { key: 'reward_name', label: 'Reward name (exact)', type: 'text', placeholder: 'Hydrate Alert' }
            ],
            async execute(s, ctx) {
                try {
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    const data = await _twitchApi('GET', `/channel_points/custom_rewards?broadcaster_id=${user.id}`, null, oauth);
                    const reward = (data.data || []).find(r => r.title.toLowerCase() === s.reward_name.toLowerCase());
                    if (!reward) throw new Error('Reward not found');
                    await _twitchApi('PATCH', `/channel_points/custom_rewards?broadcaster_id=${user.id}&id=${reward.id}`,
                        { is_enabled: true }, oauth);
                    ctx.showToast('Reward enabled: ' + reward.title, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'disable-reward',
            name: 'Disable Reward',
            settings: [
                { key: 'reward_name', label: 'Reward name (exact)', type: 'text', placeholder: 'Hydrate Alert' }
            ],
            async execute(s, ctx) {
                try {
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    const data = await _twitchApi('GET', `/channel_points/custom_rewards?broadcaster_id=${user.id}`, null, oauth);
                    const reward = (data.data || []).find(r => r.title.toLowerCase() === s.reward_name.toLowerCase());
                    if (!reward) throw new Error('Reward not found');
                    await _twitchApi('PATCH', `/channel_points/custom_rewards?broadcaster_id=${user.id}&id=${reward.id}`,
                        { is_enabled: false }, oauth);
                    ctx.showToast('Reward disabled: ' + reward.title, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'pause-queue',
            name: 'Pause Reward Queue',
            settings: [
                { key: 'reward_name', label: 'Reward name (exact)', type: 'text', placeholder: 'Hydrate Alert' }
            ],
            async execute(s, ctx) {
                try {
                    const oauth = ctx.config.twitch_oauth;
                    const user = await _getTwitchUserId(oauth);
                    const data = await _twitchApi('GET', `/channel_points/custom_rewards?broadcaster_id=${user.id}`, null, oauth);
                    const reward = (data.data || []).find(r => r.title.toLowerCase() === s.reward_name.toLowerCase());
                    if (!reward) throw new Error('Reward not found');
                    const paused = !reward.is_paused;
                    await _twitchApi('PATCH', `/channel_points/custom_rewards?broadcaster_id=${user.id}&id=${reward.id}`,
                        { is_paused: paused }, oauth);
                    ctx.showToast(`Reward queue ${paused ? 'paused' : 'resumed'}: ${reward.title}`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
