/* ─── OBS Control Plugin ─── */
CubDeck.registerPlugin({
    id: 'obs-control',
    name: 'OBS Control',
    icon: '🎬',
    actions: [
        {
            id: 'switch-scene',
            name: 'Switch Scene',
            icon: '🎬',
            settings: [{ key: 'scene', label: 'Scene', type: 'obs-scene' }],
            getState(s, ctx) {
                return { active: ctx.obs.currentScene === s.scene };
            },
            async execute(s, ctx) {
                if (!s.scene) throw new Error('No scene selected');
                await ctx.obs.call('SetCurrentProgramScene', { sceneName: s.scene });
            }
        },
        {
            id: 'toggle-source',
            name: 'Source Visibility',
            icon: '👁️',
            settings: [
                { key: 'scene', label: 'Scene', type: 'obs-scene' },
                { key: 'source', label: 'Source Name', type: 'text', placeholder: 'Source name' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'show', label: 'Show' },
                    { value: 'hide', label: 'Hide' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                const items = await ctx.obs.call('GetSceneItemList', { sceneName: s.scene });
                const item = items.sceneItems.find(i => i.sourceName === s.source);
                if (!item) throw new Error('Source not found: ' + s.source);
                const action = s.action || 'toggle';
                const enabled = action === 'show' ? true : action === 'hide' ? false : !item.sceneItemEnabled;
                await ctx.obs.call('SetSceneItemEnabled', {
                    sceneName: s.scene,
                    sceneItemId: item.sceneItemId,
                    sceneItemEnabled: enabled
                });
            }
        },
        {
            id: 'stream-toggle',
            name: 'Stream',
            icon: '▶️',
            settings: [
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'start', label: 'Start' },
                    { value: 'stop', label: 'Stop' }
                ], default: 'toggle' }
            ],
            getState(s, ctx) {
                return { active: ctx.obs.streaming, sub: ctx.obs.streaming ? 'LIVE' : 'OFF' };
            },
            async execute(s, ctx) {
                const action = s.action || 'toggle';
                if (action === 'start') await ctx.obs.call('StartStream');
                else if (action === 'stop') await ctx.obs.call('StopStream');
                else await ctx.obs.call('ToggleStream');
            }
        },
        {
            id: 'record-toggle',
            name: 'Recording',
            icon: '⏺️',
            settings: [
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'start', label: 'Start' },
                    { value: 'stop', label: 'Stop' }
                ], default: 'toggle' }
            ],
            getState(s, ctx) {
                return { active: ctx.obs.recording, sub: ctx.obs.recording ? 'REC' : 'OFF' };
            },
            async execute(s, ctx) {
                const action = s.action || 'toggle';
                if (action === 'start') await ctx.obs.call('StartRecord');
                else if (action === 'stop') await ctx.obs.call('StopRecord');
                else await ctx.obs.call('ToggleRecord');
            }
        },
        {
            id: 'replay-toggle',
            name: 'Replay Buffer',
            icon: '💾',
            settings: [
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'start', label: 'Start' },
                    { value: 'stop', label: 'Stop' }
                ], default: 'toggle' }
            ],
            getState(s, ctx) {
                return { active: ctx.obs.replayBufferActive, sub: ctx.obs.replayBufferActive ? 'ON' : 'OFF' };
            },
            async execute(s, ctx) {
                const action = s.action || 'toggle';
                if (action === 'start') await ctx.obs.call('StartReplayBuffer');
                else if (action === 'stop') await ctx.obs.call('StopReplayBuffer');
                else await ctx.obs.call('ToggleReplayBuffer');
            }
        },
        {
            id: 'replay-save',
            name: 'Save Replay',
            icon: '💾',
            settings: [],
            async execute(s, ctx) {
                await ctx.obs.call('SaveReplayBuffer');
                ctx.showToast('Replay saved!', 'success');
            }
        },
        {
            id: 'mute-toggle',
            name: 'Mute / Unmute Audio',
            icon: '🔇',
            settings: [
                { key: 'inputName', label: 'Audio Source', type: 'obs-input' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'mute', label: 'Mute' },
                    { value: 'unmute', label: 'Unmute' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                if (!s.inputName) throw new Error('No input selected');
                const action = s.action || 'toggle';
                if (action === 'mute') await ctx.obs.call('SetInputMute', { inputName: s.inputName, inputMuted: true });
                else if (action === 'unmute') await ctx.obs.call('SetInputMute', { inputName: s.inputName, inputMuted: false });
                else await ctx.obs.call('ToggleInputMute', { inputName: s.inputName });
            }
        },
        {
            id: 'set-volume',
            name: 'Set Volume',
            icon: '🔊',
            settings: [
                { key: 'inputName', label: 'Audio Source', type: 'obs-input' },
                { key: 'volume', label: 'Volume (0-100)', type: 'number', min: 0, max: 100, default: 80 }
            ],
            async execute(s, ctx) {
                if (!s.inputName) throw new Error('No input selected');
                const vol = Math.max(0, Math.min(1, (parseFloat(s.volume) || 80) / 100));
                await ctx.obs.call('SetInputVolume', { inputName: s.inputName, inputVolumeMul: vol });
            }
        },
        {
            id: 'studio-mode',
            name: 'Studio Mode',
            icon: '🎞️',
            settings: [
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'enable', label: 'Enable' },
                    { value: 'disable', label: 'Disable' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                const action = s.action || 'toggle';
                if (action === 'enable') {
                    await ctx.obs.call('SetStudioModeEnabled', { studioModeEnabled: true });
                } else if (action === 'disable') {
                    await ctx.obs.call('SetStudioModeEnabled', { studioModeEnabled: false });
                } else {
                    const cur = await ctx.obs.call('GetStudioModeEnabled');
                    await ctx.obs.call('SetStudioModeEnabled', { studioModeEnabled: !cur.studioModeEnabled });
                }
            }
        },
        {
            id: 'screenshot',
            name: 'Take Screenshot',
            icon: '📸',
            settings: [{ key: 'source', label: 'Source (leave blank for full scene)', type: 'text', placeholder: 'Optional source name' }],
            async execute(s, ctx) {
                const req = { imageFormat: 'png' };
                if (s.source) req.sourceName = s.source;
                const res = await ctx.obs.call('GetSourceScreenshot', req);
                // Download as file
                const a = document.createElement('a');
                a.href = res.imageData;
                a.download = 'screenshot-' + Date.now() + '.png';
                a.click();
                ctx.showToast('Screenshot saved!', 'success');
            }
        },
        {
            id: 'next-scene',
            name: 'Next Scene',
            icon: '⏭️',
            settings: [],
            async execute(s, ctx) {
                const scenes = ctx.obs.scenes;
                if (!scenes.length) throw new Error('No scenes loaded');
                const idx = scenes.findIndex(sc => sc.sceneName === ctx.obs.currentScene);
                const next = scenes[(idx + 1) % scenes.length];
                await ctx.obs.call('SetCurrentProgramScene', { sceneName: next.sceneName });
            }
        },
        {
            id: 'prev-scene',
            name: 'Previous Scene',
            icon: '⏮️',
            settings: [],
            async execute(s, ctx) {
                const scenes = ctx.obs.scenes;
                if (!scenes.length) throw new Error('No scenes loaded');
                const idx = scenes.findIndex(sc => sc.sceneName === ctx.obs.currentScene);
                const prev = scenes[(idx - 1 + scenes.length) % scenes.length];
                await ctx.obs.call('SetCurrentProgramScene', { sceneName: prev.sceneName });
            }
        },
        {
            id: 'toggle-filter',
            name: 'Filter',
            icon: '🎨',
            settings: [
                { key: 'source', label: 'Source Name', type: 'text', placeholder: 'Source name' },
                { key: 'filter', label: 'Filter Name', type: 'text', placeholder: 'Filter name' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'enable', label: 'Enable' },
                    { value: 'disable', label: 'Disable' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                if (!s.source || !s.filter) throw new Error('Source and filter name required');
                const action = s.action || 'toggle';
                let enabled;
                if (action === 'enable') {
                    enabled = true;
                } else if (action === 'disable') {
                    enabled = false;
                } else {
                    const res = await ctx.obs.call('GetSourceFilter', { sourceName: s.source, filterName: s.filter });
                    enabled = !res.filterEnabled;
                }
                await ctx.obs.call('SetSourceFilterEnabled', {
                    sourceName: s.source,
                    filterName: s.filter,
                    filterEnabled: enabled
                });
            }
        },
        {
            id: 'scene-collection',
            name: 'Switch Scene Collection',
            icon: '📂',
            settings: [{ key: 'collection', label: 'Collection Name', type: 'text', placeholder: 'Scene collection name' }],
            async execute(s, ctx) {
                if (!s.collection) throw new Error('Collection name required');
                await ctx.obs.call('SetCurrentSceneCollection', { sceneCollectionName: s.collection });
            }
        }
    ]
});
