/* ─── Alerts & FX Plugin ─── */
// All visual effects are sent to the OBS overlay page via ctx.sendToOverlay().
// Add your overlay URL as a Browser Source in OBS:
//   https://cubsoftware.site/cubdeck/deck/{your-id}/{deck-name}/overlay
// Set width: 1920, height: 1080, transparent background checked.

CubDeck.registerPlugin({
    id: 'alerts',
    name: 'Alerts & FX',
    icon: '🚨',
    actions: [
        {
            id: 'confetti',
            name: 'Confetti Burst',
            settings: [
                { key: 'count',    label: 'Particle count', type: 'text', placeholder: '80' },
                { key: 'duration', label: 'Duration (ms)',   type: 'text', placeholder: '3000' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'confetti', count: parseInt(s.count)||80, duration: parseInt(s.duration)||3000 });
                ctx.showToast('🎉 Confetti → overlay', 'success');
            }
        },
        {
            id: 'flash-screen',
            name: 'Flash Screen',
            settings: [
                { key: 'color',    label: 'Flash color', type: 'text', placeholder: '#ff0000' },
                { key: 'duration', label: 'Duration (ms)', type: 'text', placeholder: '300' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'flash', color: s.color||'#ff0000', duration: parseInt(s.duration)||300 });
                ctx.showToast('⚡ Flash → overlay', 'success');
            }
        },
        {
            id: 'show-text-overlay',
            name: 'Show Text Overlay',
            settings: [
                { key: 'text',      label: 'Message',            type: 'text',   placeholder: 'Hello!' },
                { key: 'fontSize',  label: 'Font size (px)',      type: 'text',   placeholder: '72' },
                { key: 'bgColor',   label: 'Background color',    type: 'text',   placeholder: 'rgba(0,0,0,0.82)' },
                { key: 'textColor', label: 'Text color',          type: 'text',   placeholder: '#ffffff' },
                { key: 'duration',  label: 'Duration (ms)',        type: 'text',   placeholder: '3000' },
                { key: 'position',  label: 'Position',            type: 'select', options: [
                    { value: 'center', label: 'Center' },
                    { value: 'top',    label: 'Top' },
                    { value: 'bottom', label: 'Bottom' }
                ], default: 'center' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({
                    type: 'text',
                    text:      s.text      || '',
                    fontSize:  parseInt(s.fontSize)  || 72,
                    bgColor:   s.bgColor   || 'rgba(0,0,0,0.82)',
                    textColor: s.textColor || '#ffffff',
                    duration:  parseInt(s.duration)  || 3000,
                    position:  s.position  || 'center'
                });
                ctx.showToast('💬 Text overlay → overlay', 'success');
            }
        },
        {
            id: 'banner',
            name: 'Slide-In Banner',
            settings: [
                { key: 'text',      label: 'Banner text',         type: 'text',   placeholder: 'Now live on Twitch!' },
                { key: 'position',  label: 'Position',            type: 'select', options: [
                    { value: 'top',    label: 'Top' },
                    { value: 'bottom', label: 'Bottom' }
                ], default: 'top' },
                { key: 'bgColor',   label: 'Background color',    type: 'text',   placeholder: '#9147ff' },
                { key: 'textColor', label: 'Text color',          type: 'text',   placeholder: '#ffffff' },
                { key: 'fontSize',  label: 'Font size (px)',       type: 'text',   placeholder: '38' },
                { key: 'duration',  label: 'Duration (ms)',        type: 'text',   placeholder: '4000' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({
                    type:      'banner',
                    text:      s.text      || '',
                    position:  s.position  || 'top',
                    bgColor:   s.bgColor   || '#9147ff',
                    textColor: s.textColor || '#ffffff',
                    fontSize:  parseInt(s.fontSize)  || 38,
                    duration:  parseInt(s.duration)  || 4000
                });
                ctx.showToast('📢 Banner → overlay', 'success');
            }
        },
        {
            id: 'alert-box',
            name: 'Alert Box (follow / sub style)',
            settings: [
                { key: 'title',    label: 'Title',               type: 'text', placeholder: 'NewFollower followed!' },
                { key: 'subtitle', label: 'Subtitle (optional)', type: 'text', placeholder: 'Thanks for the follow!' },
                { key: 'icon',     label: 'Icon emoji',          type: 'text', placeholder: '🎉' },
                { key: 'bgColor',  label: 'Background color',    type: 'text', placeholder: '#9147ff' },
                { key: 'position', label: 'Position', type: 'select', options: [
                    { value: 'top', label: 'Top' }, { value: 'bottom', label: 'Bottom' }
                ], default: 'top' },
                { key: 'duration', label: 'Duration (ms)', type: 'text', placeholder: '5000' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({
                    type:     'alert',
                    title:    s.title    || '',
                    subtitle: s.subtitle || '',
                    icon:     s.icon     || '🎉',
                    bgColor:  s.bgColor  || '#9147ff',
                    position: s.position || 'top',
                    duration: parseInt(s.duration) || 5000
                });
                ctx.showToast('🔔 Alert → overlay', 'success');
            }
        },
        {
            id: 'shake-screen',
            name: 'Shake Screen',
            settings: [
                { key: 'intensity', label: 'Intensity (px)', type: 'text', placeholder: '10' },
                { key: 'duration',  label: 'Duration (ms)',  type: 'text', placeholder: '500' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'shake', intensity: parseInt(s.intensity)||10, duration: parseInt(s.duration)||500 });
                ctx.showToast('📳 Shake → overlay', 'success');
            }
        },
        {
            id: 'countdown-overlay',
            name: 'Countdown Overlay',
            settings: [
                { key: 'seconds',   label: 'Seconds',               type: 'text', placeholder: '5' },
                { key: 'finalText', label: 'Text after countdown',  type: 'text', placeholder: 'GO!' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'countdown', seconds: parseInt(s.seconds)||5, finalText: s.finalText||'GO!' });
                ctx.showToast('⏳ Countdown → overlay', 'success');
            }
        },
        {
            id: 'fireworks',
            name: 'Fireworks',
            settings: [
                { key: 'duration', label: 'Duration (ms)', type: 'text', placeholder: '4000' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'fireworks', duration: parseInt(s.duration)||4000 });
                ctx.showToast('🎆 Fireworks → overlay', 'success');
            }
        },
        {
            id: 'emote-rain',
            name: 'Emote / Emoji Rain',
            settings: [
                { key: 'emotes',   label: 'Emotes (comma separated)', type: 'text', placeholder: '🎉,🔥,⭐,💜,👏' },
                { key: 'count',    label: 'Count',                    type: 'text', placeholder: '30' },
                { key: 'duration', label: 'Duration (ms)',             type: 'text', placeholder: '5000' }
            ],
            async execute(s, ctx) {
                const emotes = (s.emotes||'🎉,🔥,⭐').split(',').map(e => e.trim()).filter(Boolean);
                ctx.sendToOverlay({ type: 'emote_rain', emotes, count: parseInt(s.count)||30, duration: parseInt(s.duration)||5000 });
                ctx.showToast('🌧️ Emote rain → overlay', 'success');
            }
        },
        {
            id: 'snow',
            name: 'Snow Effect',
            settings: [
                { key: 'duration', label: 'Duration (ms)',  type: 'text', placeholder: '8000' },
                { key: 'density',  label: 'Density (particles)', type: 'text', placeholder: '80' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'snow', duration: parseInt(s.duration)||8000, density: parseInt(s.density)||80 });
                ctx.showToast('❄️ Snow → overlay', 'success');
            }
        },
        {
            id: 'hype-train',
            name: 'Hype Train Alert',
            settings: [
                { key: 'text',     label: 'Text',         type: 'text', placeholder: 'HYPE TRAIN!' },
                { key: 'level',    label: 'Level',        type: 'text', placeholder: '1' },
                { key: 'duration', label: 'Duration (ms)', type: 'text', placeholder: '5000' }
            ],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'hype', text: s.text||'HYPE TRAIN!', level: parseInt(s.level)||1, duration: parseInt(s.duration)||5000 });
                ctx.showToast('🚂 Hype train → overlay', 'success');
            }
        },
        {
            id: 'clear-overlays',
            name: 'Clear All Overlays',
            settings: [],
            async execute(s, ctx) {
                ctx.sendToOverlay({ type: 'clear' });
                ctx.showToast('🧹 Overlay cleared', 'success');
            }
        }
    ]
});
