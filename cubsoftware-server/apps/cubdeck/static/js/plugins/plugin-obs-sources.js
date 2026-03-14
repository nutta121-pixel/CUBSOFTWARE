/* ─── OBS Sources Plugin ─── */

CubDeck.registerPlugin({
    id: 'obs-sources',
    name: 'OBS Sources',
    icon: '🖼️',
    actions: [
        {
            id: 'update-browser-source',
            name: 'Update Browser Source URL',
            icon: '🌐',
            settings: [
                { key: 'sourceName', label: 'Browser source name', type: 'text', placeholder: 'MyBrowserSource' },
                { key: 'url', label: 'New URL', type: 'text', placeholder: 'https://...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    if (!s.url) throw new Error('URL required');
                    await ctx.obs.call('SetInputSettings', {
                        inputName: s.sourceName,
                        inputSettings: { url: s.url }
                    });
                    ctx.showToast('Browser source updated', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'update-image-source',
            name: 'Update Image Source',
            icon: '🖼️',
            settings: [
                { key: 'sourceName', label: 'Image source name', type: 'text', placeholder: 'MyImageSource' },
                { key: 'filePath', label: 'New file path or URL', type: 'text', placeholder: '/path/to/image.png' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    if (!s.filePath) throw new Error('File path required');
                    await ctx.obs.call('SetInputSettings', {
                        inputName: s.sourceName,
                        inputSettings: { file: s.filePath }
                    });
                    ctx.showToast('Image source updated', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'update-color-source',
            name: 'Update Color Source',
            icon: '🎨',
            settings: [
                { key: 'sourceName', label: 'Color source name', type: 'text', placeholder: 'MyColorSource' },
                { key: 'color', label: 'Color (hex)', type: 'text', placeholder: '#ff0000' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    if (!s.color) throw new Error('Color required');
                    const hex = s.color.replace('#', '');
                    const r = parseInt(hex.slice(0, 2), 16);
                    const g = parseInt(hex.slice(2, 4), 16);
                    const b = parseInt(hex.slice(4, 6), 16);
                    const abgr = ((0xFF << 24) | (b << 16) | (g << 8) | r) >>> 0;
                    await ctx.obs.call('SetInputSettings', {
                        inputName: s.sourceName,
                        inputSettings: { color: abgr }
                    });
                    ctx.showToast('Color source updated', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'set-scene-item-position',
            name: 'Set Scene Item Position',
            icon: '📍',
            settings: [
                { key: 'sceneName', label: 'Scene name', type: 'text', placeholder: 'My Scene' },
                { key: 'sourceName', label: 'Source name in scene', type: 'text', placeholder: 'MySource' },
                { key: 'x', label: 'X position', type: 'number', default: 0 },
                { key: 'y', label: 'Y position', type: 'number', default: 0 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sceneName) throw new Error('Scene name required');
                    if (!s.sourceName) throw new Error('Source name required');
                    const list = await ctx.obs.call('GetSceneItemList', { sceneName: s.sceneName });
                    const item = list.sceneItems.find(i => i.sourceName === s.sourceName);
                    if (!item) throw new Error('Source not found in scene');
                    await ctx.obs.call('SetSceneItemTransform', {
                        sceneName: s.sceneName,
                        sceneItemId: item.sceneItemId,
                        sceneItemTransform: {
                            positionX: parseFloat(s.x) || 0,
                            positionY: parseFloat(s.y) || 0
                        }
                    });
                    ctx.showToast('Position updated', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'set-scene-item-scale',
            name: 'Set Scene Item Scale',
            icon: '⤢',
            settings: [
                { key: 'sceneName', label: 'Scene name', type: 'text', placeholder: 'My Scene' },
                { key: 'sourceName', label: 'Source name', type: 'text', placeholder: 'MySource' },
                { key: 'scaleX', label: 'Scale X (1.0=100%)', type: 'number', default: 1.0, min: 0.1, max: 5, step: 0.1 },
                { key: 'scaleY', label: 'Scale Y (1.0=100%)', type: 'number', default: 1.0, min: 0.1, max: 5, step: 0.1 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sceneName) throw new Error('Scene name required');
                    if (!s.sourceName) throw new Error('Source name required');
                    const list = await ctx.obs.call('GetSceneItemList', { sceneName: s.sceneName });
                    const item = list.sceneItems.find(i => i.sourceName === s.sourceName);
                    if (!item) throw new Error('Source not found in scene');
                    await ctx.obs.call('SetSceneItemTransform', {
                        sceneName: s.sceneName,
                        sceneItemId: item.sceneItemId,
                        sceneItemTransform: {
                            scaleX: parseFloat(s.scaleX) || 1.0,
                            scaleY: parseFloat(s.scaleY) || 1.0
                        }
                    });
                    ctx.showToast('Scale updated', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'toggle-scene-item-crop',
            name: 'Set Scene Item Crop',
            icon: '✂️',
            settings: [
                { key: 'sceneName', label: 'Scene name', type: 'text', placeholder: 'My Scene' },
                { key: 'sourceName', label: 'Source name', type: 'text', placeholder: 'MySource' },
                { key: 'top', label: 'Crop top px', type: 'number', default: 0 },
                { key: 'bottom', label: 'Crop bottom px', type: 'number', default: 0 },
                { key: 'left', label: 'Crop left px', type: 'number', default: 0 },
                { key: 'right', label: 'Crop right px', type: 'number', default: 0 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sceneName) throw new Error('Scene name required');
                    if (!s.sourceName) throw new Error('Source name required');
                    const list = await ctx.obs.call('GetSceneItemList', { sceneName: s.sceneName });
                    const item = list.sceneItems.find(i => i.sourceName === s.sourceName);
                    if (!item) throw new Error('Source not found in scene');
                    await ctx.obs.call('SetSceneItemTransform', {
                        sceneName: s.sceneName,
                        sceneItemId: item.sceneItemId,
                        sceneItemTransform: {
                            cropTop: parseInt(s.top) || 0,
                            cropBottom: parseInt(s.bottom) || 0,
                            cropLeft: parseInt(s.left) || 0,
                            cropRight: parseInt(s.right) || 0
                        }
                    });
                    ctx.showToast('Crop updated', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'refresh-browser-source',
            name: 'Refresh Browser Source',
            icon: '🔄',
            settings: [
                { key: 'sourceName', label: 'Browser source name', type: 'text', placeholder: 'MyBrowserSource' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    await ctx.obs.call('PressInputPropertiesButton', {
                        inputName: s.sourceName,
                        propertyName: 'refreshnocache'
                    });
                    ctx.showToast('Browser source refreshed', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'set-input-volume-db',
            name: 'Set Input Volume (dB)',
            icon: '🔊',
            settings: [
                { key: 'sourceName', label: 'Input source name', type: 'text', placeholder: 'Mic/Aux' },
                { key: 'volumeDb', label: 'Volume dB', type: 'number', default: 0, min: -100, max: 20, step: 0.5 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    await ctx.obs.call('SetInputVolume', {
                        inputName: s.sourceName,
                        inputVolumeDb: parseFloat(s.volumeDb) || 0
                    });
                    ctx.showToast('Volume set to ' + s.volumeDb + ' dB', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
