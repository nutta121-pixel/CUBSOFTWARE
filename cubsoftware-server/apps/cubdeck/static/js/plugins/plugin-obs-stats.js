/* ─── OBS Stats & Performance Plugin ─── */

const _obsStatsCache = {};

CubDeck.registerPlugin({
    id: 'obs-stats',
    name: 'OBS Stats',
    icon: '📊',
    actions: [
        {
            id: 'cpu-display',
            name: 'CPU Usage Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_stats';
                const now = Date.now();
                const cached = _obsStatsCache[k];
                if (cached && now < cached.expires) {
                    const cpu = cached.data.cpuUsage?.toFixed(1) || '0.0';
                    return { label: `CPU ${cpu}%`, icon: '💻', color: parseFloat(cpu) > 70 ? '#dc2626' : parseFloat(cpu) > 40 ? '#f59e0b' : '#16a34a' };
                }
                if (!_obsStatsCache[k + '_f'] && ctx.obs) {
                    _obsStatsCache[k + '_f'] = true;
                    ctx.obs.call('GetStats').then(data => {
                        _obsStatsCache[k] = { data, expires: Date.now() + 3000 };
                        _obsStatsCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _obsStatsCache[k + '_f'] = false; });
                }
                if (cached) {
                    const cpu = cached.data.cpuUsage?.toFixed(1) || '0.0';
                    return { label: `CPU ${cpu}%`, icon: '💻' };
                }
                return { label: 'CPU ...', icon: '💻' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetStats');
                    ctx.showToast(`CPU: ${data.cpuUsage?.toFixed(1)}% | Render: ${data.renderSkippedFrames || 0} dropped`, 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'fps-display',
            name: 'FPS Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_stats';
                const cached = _obsStatsCache[k];
                if (cached && Date.now() < cached.expires) {
                    const fps = (cached.data.activeFps || 0).toFixed(1);
                    return { label: `${fps} FPS`, icon: '🎬', color: parseFloat(fps) < 50 ? '#dc2626' : '#16a34a' };
                }
                if (!_obsStatsCache[k + '_f'] && ctx.obs) {
                    _obsStatsCache[k + '_f'] = true;
                    ctx.obs.call('GetStats').then(data => {
                        _obsStatsCache[k] = { data, expires: Date.now() + 3000 };
                        _obsStatsCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _obsStatsCache[k + '_f'] = false; });
                }
                return { label: cached ? (cached.data.activeFps || 0).toFixed(1) + ' FPS' : 'FPS ...', icon: '🎬' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetStats');
                    ctx.showToast(`FPS: ${data.activeFps?.toFixed(1)} | Dropped: ${data.outputSkippedFrames || 0}`, 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'memory-display',
            name: 'Memory Usage Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_stats';
                const cached = _obsStatsCache[k];
                if (cached && Date.now() < cached.expires) {
                    const mb = (cached.data.memoryUsage || 0).toFixed(0);
                    return { label: `${mb} MB`, icon: '🧠', color: parseInt(mb) > 4000 ? '#dc2626' : '#16a34a' };
                }
                if (!_obsStatsCache[k + '_f'] && ctx.obs) {
                    _obsStatsCache[k + '_f'] = true;
                    ctx.obs.call('GetStats').then(data => {
                        _obsStatsCache[k] = { data, expires: Date.now() + 3000 };
                        _obsStatsCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _obsStatsCache[k + '_f'] = false; });
                }
                return { label: cached ? (cached.data.memoryUsage || 0).toFixed(0) + ' MB' : 'RAM ...', icon: '🧠' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetStats');
                    ctx.showToast(`OBS RAM: ${data.memoryUsage?.toFixed(0)} MB | CPU: ${data.cpuUsage?.toFixed(1)}%`, 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'dropped-frames-display',
            name: 'Dropped Frames Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_stats';
                const cached = _obsStatsCache[k];
                if (cached && Date.now() < cached.expires) {
                    const dropped = cached.data.outputSkippedFrames || 0;
                    return { label: `${dropped} dropped`, icon: '⚠️', color: dropped > 0 ? '#dc2626' : '#16a34a' };
                }
                if (!_obsStatsCache[k + '_f'] && ctx.obs) {
                    _obsStatsCache[k + '_f'] = true;
                    ctx.obs.call('GetStats').then(data => {
                        _obsStatsCache[k] = { data, expires: Date.now() + 3000 };
                        _obsStatsCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _obsStatsCache[k + '_f'] = false; });
                }
                return { label: '... dropped', icon: '⚠️' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetStats');
                    const dropped = data.outputSkippedFrames || 0;
                    const total = data.outputTotalFrames || 1;
                    const pct = ((dropped / total) * 100).toFixed(2);
                    ctx.showToast(`Dropped: ${dropped} frames (${pct}%)`, dropped > 0 ? 'error' : 'success');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'disk-space',
            name: 'Disk Space Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_stats';
                const cached = _obsStatsCache[k];
                if (cached && Date.now() < cached.expires) {
                    const gb = ((cached.data.availableDiskSpace || 0) / 1024).toFixed(1);
                    return { label: `${gb} GB free`, icon: '💾', color: parseFloat(gb) < 10 ? '#dc2626' : '#16a34a' };
                }
                if (!_obsStatsCache[k + '_f'] && ctx.obs) {
                    _obsStatsCache[k + '_f'] = true;
                    ctx.obs.call('GetStats').then(data => {
                        _obsStatsCache[k] = { data, expires: Date.now() + 10000 };
                        _obsStatsCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _obsStatsCache[k + '_f'] = false; });
                }
                return { label: '... GB free', icon: '💾' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetStats');
                    const gb = ((data.availableDiskSpace || 0) / 1024).toFixed(1);
                    ctx.showToast(`Disk space: ${gb} GB free`, 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'full-stats',
            name: 'Show Full Stats',
            settings: [],
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetStats');
                    const cpu = data.cpuUsage?.toFixed(1) || '?';
                    const fps = data.activeFps?.toFixed(1) || '?';
                    const ram = data.memoryUsage?.toFixed(0) || '?';
                    const dropped = data.outputSkippedFrames || 0;
                    const disk = ((data.availableDiskSpace || 0) / 1024).toFixed(1);
                    ctx.showToast(`CPU: ${cpu}% | FPS: ${fps} | RAM: ${ram}MB | Dropped: ${dropped} | Disk: ${disk}GB`, 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        },
        {
            id: 'obs-version',
            name: 'OBS Version Display',
            settings: [],
            getState(s, ctx) {
                const k = 'obs_version';
                const cached = _obsStatsCache[k];
                if (cached && Date.now() < cached.expires) {
                    return { label: 'OBS ' + cached.data, icon: '🎬' };
                }
                if (!_obsStatsCache[k + '_f'] && ctx.obs) {
                    _obsStatsCache[k + '_f'] = true;
                    ctx.obs.call('GetVersion').then(data => {
                        _obsStatsCache[k] = { data: data.obsVersion, expires: Date.now() + 60000 };
                        _obsStatsCache[k + '_f'] = false;
                        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
                    }).catch(() => { _obsStatsCache[k + '_f'] = false; });
                }
                return { label: 'OBS ...', icon: '🎬' };
            },
            async execute(s, ctx) {
                try {
                    const data = await ctx.obs.call('GetVersion');
                    ctx.showToast(`OBS ${data.obsVersion} | WebSocket ${data.obsWebSocketVersion}`, 'info');
                } catch (e) { ctx.showToast('OBS not connected', 'error'); }
            }
        }
    ]
});
