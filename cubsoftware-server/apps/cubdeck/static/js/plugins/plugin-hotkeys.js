/* ─── OBS Hotkeys Plugin ─── */
CubDeck.registerPlugin({
    id: 'hotkeys',
    name: 'OBS Hotkeys',
    icon: '⌨️',
    actions: [
        {
            id: 'trigger-hotkey-name',
            name: 'Trigger OBS Hotkey by Name',
            icon: '⌨️',
            settings: [
                { key: 'hotkeyName', label: 'Hotkey name (OBS internal)', type: 'text', placeholder: 'OBSBasic.StartStreaming' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.hotkeyName) throw new Error('Hotkey name required');
                    await ctx.obs.call('TriggerHotkeyByName', { hotkeyName: s.hotkeyName });
                    ctx.showToast('Hotkey triggered: ' + s.hotkeyName, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'hotkey-start-stream',
            name: 'Start Streaming (Hotkey)',
            icon: '🔴',
            settings: [],
            async execute(s, ctx) {
                try {
                    await ctx.obs.call('TriggerHotkeyByName', { hotkeyName: 'OBSBasic.StartStreaming' });
                    ctx.showToast('Start streaming triggered', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'hotkey-stop-stream',
            name: 'Stop Streaming (Hotkey)',
            icon: '⏹️',
            settings: [],
            async execute(s, ctx) {
                try {
                    await ctx.obs.call('TriggerHotkeyByName', { hotkeyName: 'OBSBasic.StopStreaming' });
                    ctx.showToast('Stop streaming triggered', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'hotkey-start-recording',
            name: 'Start Recording (Hotkey)',
            icon: '⏺️',
            settings: [],
            async execute(s, ctx) {
                try {
                    await ctx.obs.call('TriggerHotkeyByName', { hotkeyName: 'OBSBasic.StartRecording' });
                    ctx.showToast('Start recording triggered', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'hotkey-stop-recording',
            name: 'Stop Recording (Hotkey)',
            icon: '🛑',
            settings: [],
            async execute(s, ctx) {
                try {
                    await ctx.obs.call('TriggerHotkeyByName', { hotkeyName: 'OBSBasic.StopRecording' });
                    ctx.showToast('Stop recording triggered', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'hotkey-screenshot',
            name: 'Take Screenshot (Hotkey)',
            icon: '📸',
            settings: [],
            async execute(s, ctx) {
                try {
                    await ctx.obs.call('TriggerHotkeyByName', { hotkeyName: 'OBSBasic.Screenshot' });
                    ctx.showToast('Screenshot taken', 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'hotkey-key-sequence',
            name: 'Trigger by Key Sequence',
            icon: '🎹',
            settings: [
                { key: 'keyId', label: 'Key ID', type: 'text', placeholder: 'OBS_KEY_F1' },
                { key: 'shift', label: 'Shift', type: 'checkbox', default: false },
                { key: 'ctrl', label: 'Ctrl', type: 'checkbox', default: false },
                { key: 'alt', label: 'Alt', type: 'checkbox', default: false },
                { key: 'cmd', label: 'Cmd/Win', type: 'checkbox', default: false }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.keyId) throw new Error('Key ID required');
                    await ctx.obs.call('TriggerHotkeyByKeySequence', {
                        keyId: s.keyId,
                        keyModifiers: {
                            shift:   s.shift   || false,
                            control: s.ctrl    || false,
                            alt:     s.alt     || false,
                            command: s.cmd     || false
                        }
                    });
                    ctx.showToast('Key sequence triggered: ' + s.keyId, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
