/* ─── Media Control Plugin (OBS media sources) ─── */
CubDeck.registerPlugin({
    id: 'media-control',
    name: 'Media Control',
    icon: '🎵',
    actions: [
        {
            id: 'play-pause',
            name: 'Play / Pause Media',
            icon: '⏯️',
            settings: [{ key: 'source', label: 'Media Source Name', type: 'text', placeholder: 'Media Source' }],
            async execute(s, ctx) {
                if (!s.source) throw new Error('Source name required');
                const status = await ctx.obs.call('GetMediaInputStatus', { inputName: s.source });
                const action = status.mediaState === 'OBS_MEDIA_STATE_PLAYING' ? 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PAUSE' : 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PLAY';
                await ctx.obs.call('TriggerMediaInputAction', { inputName: s.source, mediaAction: action });
            }
        },
        {
            id: 'restart',
            name: 'Restart Media',
            icon: '🔁',
            settings: [{ key: 'source', label: 'Media Source Name', type: 'text', placeholder: 'Media Source' }],
            async execute(s, ctx) {
                if (!s.source) throw new Error('Source name required');
                await ctx.obs.call('TriggerMediaInputAction', { inputName: s.source, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' });
            }
        },
        {
            id: 'stop',
            name: 'Stop Media',
            icon: '⏹️',
            settings: [{ key: 'source', label: 'Media Source Name', type: 'text', placeholder: 'Media Source' }],
            async execute(s, ctx) {
                if (!s.source) throw new Error('Source name required');
                await ctx.obs.call('TriggerMediaInputAction', { inputName: s.source, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_STOP' });
            }
        },
        {
            id: 'next',
            name: 'Next Media Track',
            icon: '⏭️',
            settings: [{ key: 'source', label: 'Media Source Name', type: 'text', placeholder: 'Media Source' }],
            async execute(s, ctx) {
                if (!s.source) throw new Error('Source name required');
                await ctx.obs.call('TriggerMediaInputAction', { inputName: s.source, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_NEXT' });
            }
        },
        {
            id: 'prev',
            name: 'Previous Media Track',
            icon: '⏮️',
            settings: [{ key: 'source', label: 'Media Source Name', type: 'text', placeholder: 'Media Source' }],
            async execute(s, ctx) {
                if (!s.source) throw new Error('Source name required');
                await ctx.obs.call('TriggerMediaInputAction', { inputName: s.source, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_PREVIOUS' });
            }
        }
    ]
});
