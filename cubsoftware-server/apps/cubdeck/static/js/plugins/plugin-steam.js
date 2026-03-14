/* ─── Steam Plugin ─── */
// Uses Steam Web API — get your API key at: https://steamcommunity.com/dev/apikey
// Steam ID: find yours at steamcommunity.com/id/YOUR_NAME (click edit profile)

const _steamCache = {};

CubDeck.registerPlugin({
    id: 'steam',
    name: 'Steam',
    icon: '🎮',
    actions: [
        {
            id: 'now-playing',
            name: 'Current Game Display',
            settings: [
                { key: 'api_key', label: 'Steam API Key', type: 'text', placeholder: 'Your Steam Web API key' },
                { key: 'steam_id', label: 'Steam ID (64-bit)', type: 'text', placeholder: '76561198xxxxxxxxx' }
            ],
            getState(s, ctx) {
                if (!s.api_key || !s.steam_id) return { label: 'Steam Game', icon: '🎮' };
                const k = 'steam_game_' + s.steam_id;
                const cached = _steamCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    return { label: cached.data || 'Not playing', icon: '🎮', color: cached.data ? '#1b2838' : '#666', active: !!cached.data };
                }
                if (!_steamCache[k + '_f']) {
                    _steamCache[k + '_f'] = true;
                    fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${s.api_key}&steamids=${s.steam_id}`)
                        .then(r => r.json())
                        .then(d => {
                            const p = d.response?.players?.[0];
                            _steamCache[k] = { data: p?.gameextrainfo || null, expires: Date.now() + 30000 };
                            _steamCache[k + '_f'] = false;
                            if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                        }).catch(() => { _steamCache[k + '_f'] = false; });
                }
                if (cached) return { label: cached.data || 'Not playing', icon: '🎮', active: !!cached.data };
                return { label: 'Loading...', icon: '🎮' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.steam_id) throw new Error('API key and Steam ID required');
                    const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${s.api_key}&steamids=${s.steam_id}`);
                    const d = await r.json();
                    const p = d.response?.players?.[0];
                    if (!p) throw new Error('Player not found');
                    if (p.gameextrainfo) {
                        ctx.showToast(`Playing: ${p.gameextrainfo}`, 'info');
                        if (typeof sendChatMessage === 'function') {
                            // optionally post to chat
                        }
                    } else {
                        ctx.showToast(p.personaname + ' is not in a game', 'info');
                    }
                    delete _steamCache['steam_game_' + s.steam_id];
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'post-game-to-chat',
            name: 'Post Current Game to Chat',
            settings: [
                { key: 'api_key', label: 'Steam API Key', type: 'text', placeholder: 'Your Steam Web API key' },
                { key: 'steam_id', label: 'Steam ID (64-bit)', type: 'text', placeholder: '76561198xxxxxxxxx' },
                { key: 'prefix', label: 'Message prefix', type: 'text', placeholder: 'Currently playing:' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.steam_id) throw new Error('API key and Steam ID required');
                    const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${s.api_key}&steamids=${s.steam_id}`);
                    const d = await r.json();
                    const p = d.response?.players?.[0];
                    if (!p) throw new Error('Player not found');
                    const game = p.gameextrainfo;
                    if (!game) return ctx.showToast('Not currently in a game', 'info');
                    const msg = (s.prefix || 'Currently playing:') + ' ' + game + ' — store.steampowered.com/app/' + p.gameid;
                    if (typeof sendChatMessage === 'function') {
                        sendChatMessage(msg);
                        ctx.showToast('Posted to chat: ' + game, 'success');
                    } else {
                        ctx.showToast(msg, 'info');
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'open-store-page',
            name: 'Open Steam Store Page',
            settings: [
                { key: 'app_id', label: 'App ID', type: 'text', placeholder: '570 (Dota 2)' }
            ],
            async execute(s, ctx) {
                if (!s.app_id) return ctx.showToast('App ID required', 'error');
                window.open('https://store.steampowered.com/app/' + s.app_id, '_blank');
            }
        },
        {
            id: 'online-status',
            name: 'Online Status Display',
            settings: [
                { key: 'api_key', label: 'Steam API Key', type: 'text', placeholder: 'Your Steam Web API key' },
                { key: 'steam_id', label: 'Steam ID (64-bit)', type: 'text', placeholder: '76561198xxxxxxxxx' }
            ],
            getState(s, ctx) {
                if (!s.api_key || !s.steam_id) return { label: 'Steam Status', icon: '🎮' };
                const k = 'steam_status_' + s.steam_id;
                const cached = _steamCache[k];
                const now = Date.now();
                const statusMap = ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play'];
                const colorMap = ['#666', '#16a34a', '#dc2626', '#f59e0b', '#9ca3af', '#3b82f6', '#22c55e'];
                if (cached && now < cached.expires) {
                    const st = cached.data;
                    return { label: statusMap[st] || 'Unknown', icon: '🎮', color: colorMap[st] || '#666' };
                }
                if (!_steamCache[k + '_f']) {
                    _steamCache[k + '_f'] = true;
                    fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${s.api_key}&steamids=${s.steam_id}`)
                        .then(r => r.json())
                        .then(d => {
                            const p = d.response?.players?.[0];
                            _steamCache[k] = { data: p?.personastate ?? 0, expires: Date.now() + 30000 };
                            _steamCache[k + '_f'] = false;
                            if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                        }).catch(() => { _steamCache[k + '_f'] = false; });
                }
                if (cached) return { label: statusMap[cached.data] || 'Unknown', icon: '🎮' };
                return { label: 'Steam...', icon: '🎮' };
            },
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.steam_id) throw new Error('API key and Steam ID required');
                    const r = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v0002/?key=${s.api_key}&steamids=${s.steam_id}`);
                    const d = await r.json();
                    const p = d.response?.players?.[0];
                    if (!p) throw new Error('Player not found');
                    const statusMap = ['Offline', 'Online', 'Busy', 'Away', 'Snooze', 'Looking to trade', 'Looking to play'];
                    ctx.showToast(`${p.personaname}: ${statusMap[p.personastate] || 'Unknown'}${p.gameextrainfo ? ' — ' + p.gameextrainfo : ''}`, 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'recent-games',
            name: 'Recent Games Display',
            settings: [
                { key: 'api_key', label: 'Steam API Key', type: 'text', placeholder: 'Your Steam Web API key' },
                { key: 'steam_id', label: 'Steam ID (64-bit)', type: 'text', placeholder: '76561198xxxxxxxxx' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key || !s.steam_id) throw new Error('API key and Steam ID required');
                    const r = await fetch(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v0001/?key=${s.api_key}&steamid=${s.steam_id}&count=3`);
                    const d = await r.json();
                    const games = d.response?.games || [];
                    if (games.length === 0) return ctx.showToast('No recent games found', 'info');
                    ctx.showToast('Recent: ' + games.map(g => `${g.name} (${Math.round(g.playtime_2weeks / 60)}h)`).join(', '), 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
