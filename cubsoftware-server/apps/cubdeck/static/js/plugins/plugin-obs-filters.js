/* ─── OBS Filters Plugin ─── */
CubDeck.registerPlugin({
    id: 'obs-filters',
    name: 'OBS Filters',
    icon: '🎛️',
    actions: [
        {
            id: 'toggle-filter',
            name: 'Toggle Filter On/Off',
            icon: '🔀',
            settings: [
                { key: 'sourceName', label: 'Source name', type: 'text', placeholder: 'My Source' },
                { key: 'filterName', label: 'Filter name', type: 'text', placeholder: 'My Filter' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    if (!s.filterName) throw new Error('Filter name required');
                    const res = await ctx.obs.call('GetSourceFilter', {
                        sourceName: s.sourceName,
                        filterName: s.filterName
                    });
                    const newEnabled = !res.filterEnabled;
                    await ctx.obs.call('SetSourceFilterEnabled', {
                        sourceName: s.sourceName,
                        filterName: s.filterName,
                        filterEnabled: newEnabled
                    });
                    ctx.showToast(`Filter "${s.filterName}" ${newEnabled ? 'enabled' : 'disabled'}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'enable-filter',
            name: 'Enable Filter',
            icon: '✅',
            settings: [
                { key: 'sourceName', label: 'Source name', type: 'text', placeholder: 'My Source' },
                { key: 'filterName', label: 'Filter name', type: 'text', placeholder: 'My Filter' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    if (!s.filterName) throw new Error('Filter name required');
                    await ctx.obs.call('SetSourceFilterEnabled', {
                        sourceName: s.sourceName,
                        filterName: s.filterName,
                        filterEnabled: true
                    });
                    ctx.showToast(`Filter "${s.filterName}" enabled`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'disable-filter',
            name: 'Disable Filter',
            icon: '🚫',
            settings: [
                { key: 'sourceName', label: 'Source name', type: 'text', placeholder: 'My Source' },
                { key: 'filterName', label: 'Filter name', type: 'text', placeholder: 'My Filter' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    if (!s.filterName) throw new Error('Filter name required');
                    await ctx.obs.call('SetSourceFilterEnabled', {
                        sourceName: s.sourceName,
                        filterName: s.filterName,
                        filterEnabled: false
                    });
                    ctx.showToast(`Filter "${s.filterName}" disabled`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'set-filter-setting',
            name: 'Set Filter Setting Value',
            icon: '🔧',
            settings: [
                { key: 'sourceName', label: 'Source name', type: 'text', placeholder: 'My Source' },
                { key: 'filterName', label: 'Filter name', type: 'text', placeholder: 'My Filter' },
                { key: 'settingKey', label: 'Setting key', type: 'text', placeholder: 'opacity' },
                { key: 'settingValue', label: 'Setting value (number or text)', type: 'text', placeholder: '0.5' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    if (!s.filterName) throw new Error('Filter name required');
                    if (!s.settingKey) throw new Error('Setting key required');
                    const res = await ctx.obs.call('GetSourceFilter', {
                        sourceName: s.sourceName,
                        filterName: s.filterName
                    });
                    const currentSettings = res.filterSettings || {};
                    const rawValue = s.settingValue || '';
                    const numVal = parseFloat(rawValue);
                    const parsedValue = (!isNaN(numVal) && rawValue.trim() !== '') ? numVal : rawValue;
                    currentSettings[s.settingKey] = parsedValue;
                    await ctx.obs.call('SetSourceFilterSettings', {
                        sourceName: s.sourceName,
                        filterName: s.filterName,
                        filterSettings: currentSettings
                    });
                    ctx.showToast(`Filter setting "${s.settingKey}" updated`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'toggle-all-filters',
            name: 'All Filters on Source',
            icon: '🔁',
            settings: [
                { key: 'sourceName', label: 'Source name', type: 'text', placeholder: 'My Source' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'toggle', label: 'Toggle (disable all if any enabled)' },
                    { value: 'enable', label: 'Enable All' },
                    { value: 'disable', label: 'Disable All' }
                ], default: 'toggle' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.sourceName) throw new Error('Source name required');
                    const res = await ctx.obs.call('GetSourceFilterList', { sourceName: s.sourceName });
                    const filters = res.filters || [];
                    if (filters.length === 0) { ctx.showToast('No filters found on source', 'info'); return; }
                    const action = s.action || 'toggle';
                    const newState = action === 'enable' ? true : action === 'disable' ? false : !filters.some(f => f.filterEnabled);
                    for (const filter of filters) {
                        await ctx.obs.call('SetSourceFilterEnabled', {
                            sourceName: s.sourceName,
                            filterName: filter.filterName,
                            filterEnabled: newState
                        });
                    }
                    ctx.showToast(`${filters.length} filter(s) ${newState ? 'enabled' : 'disabled'}`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'copy-filter-state',
            name: 'Copy Filter State Between Sources',
            icon: '📋',
            settings: [
                { key: 'fromSource', label: 'Source to copy from', type: 'text', placeholder: 'Source A' },
                { key: 'toSource', label: 'Source to copy to', type: 'text', placeholder: 'Source B' },
                { key: 'filterName', label: 'Filter name', type: 'text', placeholder: 'My Filter' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.fromSource) throw new Error('Source to copy from required');
                    if (!s.toSource) throw new Error('Source to copy to required');
                    if (!s.filterName) throw new Error('Filter name required');
                    const res = await ctx.obs.call('GetSourceFilter', {
                        sourceName: s.fromSource,
                        filterName: s.filterName
                    });
                    await ctx.obs.call('SetSourceFilterEnabled', {
                        sourceName: s.toSource,
                        filterName: s.filterName,
                        filterEnabled: res.filterEnabled
                    });
                    ctx.showToast(`Filter state copied: "${s.filterName}" is now ${res.filterEnabled ? 'enabled' : 'disabled'} on "${s.toSource}"`, 'success');
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
