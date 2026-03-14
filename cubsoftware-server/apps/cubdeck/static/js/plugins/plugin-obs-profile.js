/* ─── OBS Profile & Scene Collections Plugin ─── */

const _profileCache = {};

CubDeck.registerPlugin({
    id: 'obs-profile',
    name: 'OBS Profiles',
    icon: '🗂️',
    actions: [
        {
            id: 'switch-profile',
            name: 'Switch Profile',
            settings: [
                { key: 'profile_name', label: 'Profile name', type: 'text', placeholder: 'Streaming Setup' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.profile_name) throw new Error('Profile name required');
                    await ctx.obs.call('SetCurrentProfile', { profileName: s.profile_name });
                    ctx.showToast('Profile switched: ' + s.profile_name, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            },
            getState(s, ctx) {
                const k = 'obs_profile';
                const cached = _profileCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const active = cached.data === s.profile_name;
                    return { label: cached.data || 'Profile', icon: '🗂️', active, color: active ? '#9147ff' : '#374151' };
                }
                if (!_profileCache[k + '_f'] && ctx.obs) {
                    _profileCache[k + '_f'] = true;
                    ctx.obs.call('GetProfileList').then(data => {
                        _profileCache[k] = { data: data.currentProfileName, expires: Date.now() + 5000 };
                        _profileCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _profileCache[k + '_f'] = false; });
                }
                return { label: s.profile_name || 'Switch Profile', icon: '🗂️' };
            }
        },
        {
            id: 'current-profile',
            name: 'Current Profile Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_profile';
                const cached = _profileCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    return { label: cached.data || 'No profile', icon: '🗂️' };
                }
                if (!_profileCache[k + '_f'] && ctx.obs) {
                    _profileCache[k + '_f'] = true;
                    ctx.obs.call('GetProfileList').then(data => {
                        _profileCache[k] = { data: data.currentProfileName, expires: Date.now() + 5000 };
                        _profileCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _profileCache[k + '_f'] = false; });
                }
                return { label: cached?.data || 'Profile...', icon: '🗂️' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetProfileList');
                    ctx.showToast('Current: ' + data.currentProfileName + ' (' + data.profiles.length + ' profiles)', 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'switch-scene-collection',
            name: 'Switch Scene Collection',
            settings: [
                { key: 'collection_name', label: 'Scene collection name', type: 'text', placeholder: 'IRL Streaming' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.collection_name) throw new Error('Collection name required');
                    await ctx.obs.call('SetCurrentSceneCollection', { sceneCollectionName: s.collection_name });
                    ctx.showToast('Scene collection: ' + s.collection_name, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            },
            getState(s, ctx) {
                const k = 'obs_collection';
                const cached = _profileCache[k];
                const now = Date.now();
                if (cached && now < cached.expires) {
                    const active = cached.data === s.collection_name;
                    return { label: cached.data || 'Collection', icon: '📁', active, color: active ? '#9147ff' : '#374151' };
                }
                if (!_profileCache[k + '_f'] && ctx.obs) {
                    _profileCache[k + '_f'] = true;
                    ctx.obs.call('GetSceneCollectionList').then(data => {
                        _profileCache[k] = { data: data.currentSceneCollectionName, expires: Date.now() + 5000 };
                        _profileCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _profileCache[k + '_f'] = false; });
                }
                return { label: s.collection_name || 'Switch Collection', icon: '📁' };
            }
        },
        {
            id: 'current-collection',
            name: 'Current Scene Collection Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_collection';
                const cached = _profileCache[k];
                if (cached && Date.now() < cached.expires) {
                    return { label: cached.data || '...', icon: '📁' };
                }
                if (!_profileCache[k + '_f'] && ctx.obs) {
                    _profileCache[k + '_f'] = true;
                    ctx.obs.call('GetSceneCollectionList').then(data => {
                        _profileCache[k] = { data: data.currentSceneCollectionName, expires: Date.now() + 5000 };
                        _profileCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _profileCache[k + '_f'] = false; });
                }
                return { label: cached?.data || 'Collection...', icon: '📁' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetSceneCollectionList');
                    ctx.showToast('Current: ' + data.currentSceneCollectionName, 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'create-profile',
            name: 'Duplicate Current Profile',
            settings: [
                { key: 'new_name', label: 'New profile name', type: 'text', placeholder: 'My Profile Copy' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.new_name) throw new Error('New name required');
                    await ctx.obs.call('CreateProfile', { profileName: s.new_name });
                    ctx.showToast('Profile created: ' + s.new_name, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
