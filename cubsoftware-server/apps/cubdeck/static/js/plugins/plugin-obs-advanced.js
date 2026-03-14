/* ─── OBS Advanced Plugin ─── */
CubDeck.registerPlugin({
    id: 'obs-advanced',
    name: 'OBS Advanced',
    icon: '🔬',
    actions: [
        {
            id: 'toggle-virtual-cam',
            name: 'Virtual Camera',
            icon: '📷',
            settings: [
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'start', label: 'Start' },
                    { value: 'stop', label: 'Stop' }
                ], default: 'toggle' }
            ],
            getState(s, ctx) {
                return { active: ctx.obs.virtualCamActive, sub: ctx.obs.virtualCamActive ? 'ON' : 'OFF' };
            },
            async execute(s, ctx) {
                const action = s.action || 'toggle';
                if (action === 'start') await ctx.obs.call('StartVirtualCam');
                else if (action === 'stop') await ctx.obs.call('StopVirtualCam');
                else await ctx.obs.call('ToggleVirtualCam');
            }
        },
        {
            id: 'set-transition',
            name: 'Set Scene Transition',
            icon: '🎞️',
            settings: [{ key: 'transition', label: 'Transition Name', type: 'text', placeholder: 'Fade, Cut, Stinger...' }],
            async execute(s, ctx) {
                if (!s.transition) throw new Error('Transition name required');
                await ctx.obs.call('SetCurrentSceneTransition', { transitionName: s.transition });
            }
        },
        {
            id: 'set-transition-duration',
            name: 'Set Transition Duration',
            icon: '⏱️',
            settings: [{ key: 'duration', label: 'Duration (ms)', type: 'number', min: 0, max: 20000, default: 300 }],
            async execute(s, ctx) {
                await ctx.obs.call('SetCurrentSceneTransitionDuration', { transitionDuration: parseInt(s.duration) || 300 });
            }
        },
        {
            id: 'set-text',
            name: 'Update Text Source',
            icon: '📝',
            settings: [
                { key: 'source', label: 'Text Source Name', type: 'text', placeholder: 'My Text Source' },
                { key: 'text', label: 'Text Content', type: 'text', placeholder: 'Hello World!' }
            ],
            async execute(s, ctx) {
                if (!s.source) throw new Error('Source name required');
                await ctx.obs.call('SetInputSettings', {
                    inputName: s.source,
                    inputSettings: { text: s.text || '' }
                });
            }
        },
        {
            id: 'audio-monitor',
            name: 'Set Audio Monitor',
            icon: '🎧',
            settings: [
                { key: 'inputName', label: 'Audio Source', type: 'obs-input' },
                { key: 'mode', label: 'Monitor Mode', type: 'select', options: [
                    { value: 'OBS_MONITORING_TYPE_NONE', label: 'None' },
                    { value: 'OBS_MONITORING_TYPE_MONITOR_ONLY', label: 'Monitor Only' },
                    { value: 'OBS_MONITORING_TYPE_MONITOR_AND_OUTPUT', label: 'Monitor and Output' }
                ], default: 'OBS_MONITORING_TYPE_MONITOR_ONLY' }
            ],
            async execute(s, ctx) {
                if (!s.inputName) throw new Error('Input required');
                await ctx.obs.call('SetInputAudioMonitorType', {
                    inputName: s.inputName,
                    monitorType: s.mode || 'OBS_MONITORING_TYPE_MONITOR_ONLY'
                });
            }
        },
        {
            id: 'audio-balance',
            name: 'Set Audio Balance',
            icon: '↔️',
            settings: [
                { key: 'inputName', label: 'Audio Source', type: 'obs-input' },
                { key: 'balance', label: 'Balance (-100 = left, 0 = center, 100 = right)', type: 'number', min: -100, max: 100, default: 0 }
            ],
            async execute(s, ctx) {
                if (!s.inputName) throw new Error('Input required');
                const bal = Math.max(-1, Math.min(1, (parseFloat(s.balance) || 0) / 100));
                await ctx.obs.call('SetInputAudioBalance', { inputName: s.inputName, inputAudioBalance: (bal + 1) / 2 });
            }
        },
        {
            id: 'pause-recording',
            name: 'Pause Recording',
            icon: '⏸️',
            settings: [],
            async execute(s, ctx) {
                await ctx.obs.call('PauseRecord');
            }
        },
        {
            id: 'resume-recording',
            name: 'Resume Recording',
            icon: '▶️',
            settings: [],
            async execute(s, ctx) {
                await ctx.obs.call('ResumeRecord');
            }
        },
        {
            id: 'studio-transition',
            name: 'Trigger Studio Transition',
            icon: '🔀',
            settings: [],
            async execute(s, ctx) {
                await ctx.obs.call('TriggerStudioModeTransition');
            }
        },
        {
            id: 'set-preview-scene',
            name: 'Set Preview Scene (Studio)',
            icon: '👁️',
            settings: [{ key: 'scene', label: 'Scene', type: 'obs-scene' }],
            async execute(s, ctx) {
                if (!s.scene) throw new Error('Scene required');
                await ctx.obs.call('SetCurrentPreviewScene', { sceneName: s.scene });
            }
        },
        {
            id: 'toggle-source-audio',
            name: 'Source Audio Track',
            icon: '🎵',
            settings: [
                { key: 'inputName', label: 'Audio Source', type: 'obs-input' },
                { key: 'track', label: 'Track (1-6)', type: 'number', min: 1, max: 6, default: 1 },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle' },
                    { value: 'enable', label: 'Enable' },
                    { value: 'disable', label: 'Disable' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                if (!s.inputName) throw new Error('Input required');
                const track = parseInt(s.track) || 1;
                const cur = await ctx.obs.call('GetInputAudioTracks', { inputName: s.inputName });
                const tracks = cur.inputAudioTracks || {};
                const action = s.action || 'toggle';
                tracks[String(track)] = action === 'enable' ? true : action === 'disable' ? false : !tracks[String(track)];
                await ctx.obs.call('SetInputAudioTracks', { inputName: s.inputName, inputAudioTracks: tracks });
            }
        },
        {
            id: 'set-stream-service',
            name: 'Open Output Settings',
            icon: '📡',
            settings: [],
            async execute(s, ctx) {
                ctx.showToast('Use OBS → Settings → Stream to change stream key', 'info');
            }
        }
    ]
});

// Track virtual cam state
obsClient.on('connected', async () => {
    try {
        const r = await obsClient.call('GetVirtualCamStatus');
        obsClient.virtualCamActive = r.outputActive;
    } catch(e) {}
});
obsClient.on('VirtualcamStateChanged', (d) => {
    obsClient.virtualCamActive = d.outputActive;
    if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
});
