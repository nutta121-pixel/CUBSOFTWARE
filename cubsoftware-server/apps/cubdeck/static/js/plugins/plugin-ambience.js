/* ─── Ambience Audio Plugin ─── */

const _ambienceAudios = {}; // key → HTMLAudioElement
let _ambienceMuted = false;
let _ambienceVolume = 0.5;

const _ambiencePresetUrls = {
    'rain':       'https://cdn.pixabay.com/audio/2022/05/13/audio_257ee6ae6a.mp3',
    'forest':     'https://cdn.pixabay.com/audio/2022/03/24/audio_c8c8a73467.mp3',
    'ocean':      'https://cdn.pixabay.com/audio/2022/06/07/audio_b9541f2729.mp3',
    'whitenoise': 'https://cdn.pixabay.com/audio/2021/08/09/audio_dc39bde808.mp3',
    'fire':       null,
    'café':       null,
    'lofi':       null
};

function _ambienceStop(key, fadeOut) {
    const audio = _ambienceAudios[key];
    if (!audio) return;
    if (!fadeOut || fadeOut <= 0) {
        audio.pause();
        audio.src = '';
        delete _ambienceAudios[key];
        return;
    }
    // Fade out
    const startVol = audio.volume;
    const steps = 20;
    const stepTime = (fadeOut * 1000) / steps;
    const volStep = startVol / steps;
    let step = 0;
    const interval = setInterval(() => {
        step++;
        audio.volume = Math.max(0, startVol - volStep * step);
        if (step >= steps) {
            clearInterval(interval);
            audio.pause();
            audio.src = '';
            delete _ambienceAudios[key];
        }
    }, stepTime);
}

function _ambiencePlay(url, key, volume, fadeIn) {
    // Stop existing on this key
    _ambienceStop(key, 0);

    const audio = new Audio();
    audio.loop = true;
    audio.muted = _ambienceMuted;
    const targetVol = Math.max(0, Math.min(1, (parseFloat(volume) || 50) / 100));

    if (fadeIn && fadeIn > 0) {
        audio.volume = 0;
    } else {
        audio.volume = targetVol;
    }

    audio.src = url;
    audio.play().catch(() => {});
    _ambienceAudios[key] = audio;

    if (fadeIn && fadeIn > 0) {
        const steps = 20;
        const stepTime = (fadeIn * 1000) / steps;
        const volStep = targetVol / steps;
        let step = 0;
        const interval = setInterval(() => {
            step++;
            audio.volume = Math.min(targetVol, volStep * step);
            if (step >= steps) clearInterval(interval);
        }, stepTime);
    }
}

CubDeck.registerPlugin({
    id: 'ambience',
    name: 'Ambience Audio',
    icon: '🌿',
    actions: [
        {
            id: 'play-ambient',
            name: 'Play Ambient Sound (loop)',
            icon: '🔊',
            settings: [
                { key: 'url', label: 'Audio URL', type: 'text', placeholder: 'https://... (mp3/ogg)' },
                { key: 'key', label: "Channel key (e.g. 'rain')", type: 'text', placeholder: 'ambient', default: 'ambient' },
                { key: 'volume', label: 'Volume %', type: 'number', min: 0, max: 100, default: 50 },
                { key: 'fadeIn', label: 'Fade in seconds', type: 'number', min: 0, max: 10, default: 2 }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.url) throw new Error('Audio URL required');
                    const key = s.key || 'ambient';
                    const fadeIn = parseFloat(s.fadeIn) || 0;
                    _ambiencePlay(s.url, key, s.volume, fadeIn);
                    ctx.showToast('Playing ambient: ' + key, 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'stop-ambient',
            name: 'Stop Ambient Sound',
            icon: '🔇',
            settings: [
                { key: 'key', label: 'Channel key (blank = stop all)', type: 'text', placeholder: 'ambient', default: '' },
                { key: 'fadeOut', label: 'Fade out seconds', type: 'number', min: 0, max: 10, default: 2 }
            ],
            async execute(s, ctx) {
                try {
                    const fadeOut = parseFloat(s.fadeOut) || 0;
                    const key = (s.key || '').trim();
                    if (!key) {
                        // Stop all
                        const keys = Object.keys(_ambienceAudios);
                        keys.forEach(k => _ambienceStop(k, fadeOut));
                        ctx.showToast('All ambient stopped', 'success');
                    } else {
                        _ambienceStop(key, fadeOut);
                        ctx.showToast('Stopped: ' + key, 'success');
                    }
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'toggle-ambient',
            name: 'Toggle Ambient (Play/Stop)',
            icon: '🔀',
            settings: [
                { key: 'url', label: 'Audio URL', type: 'text', placeholder: 'https://... (mp3/ogg)' },
                { key: 'key', label: 'Channel key', type: 'text', placeholder: 'ambient', default: 'ambient' },
                { key: 'volume', label: 'Volume %', type: 'number', min: 0, max: 100, default: 50 }
            ],
            getState(s, ctx) {
                const key = s.key || 'ambient';
                const playing = !!(
                    _ambienceAudios[key] &&
                    !_ambienceAudios[key].paused &&
                    _ambienceAudios[key].src
                );
                return {
                    label: playing ? ('🔊 ' + key) : ('🔇 ' + key),
                    icon: playing ? '🔊' : '🔇',
                    color: playing ? '#16a34a' : '#374151'
                };
            },
            async execute(s, ctx) {
                try {
                    const key = s.key || 'ambient';
                    const audio = _ambienceAudios[key];
                    const playing = !!(audio && !audio.paused && audio.src);
                    if (playing) {
                        _ambienceStop(key, 1);
                        ctx.showToast('Stopped: ' + key, 'info');
                    } else {
                        if (!s.url) throw new Error('Audio URL required');
                        _ambiencePlay(s.url, key, s.volume, 1);
                        ctx.showToast('Playing: ' + key, 'success');
                    }
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'set-ambient-volume',
            name: 'Set Ambient Volume',
            icon: '🔉',
            settings: [
                { key: 'volume', label: 'Volume %', type: 'number', min: 0, max: 100, default: 50 },
                { key: 'key', label: 'Channel key (blank = all)', type: 'text', placeholder: '' }
            ],
            async execute(s, ctx) {
                try {
                    const vol = Math.max(0, Math.min(1, (parseFloat(s.volume) || 50) / 100));
                    const key = (s.key || '').trim();
                    _ambienceVolume = vol;
                    if (!key) {
                        Object.values(_ambienceAudios).forEach(a => { a.volume = vol; });
                        ctx.showToast('All ambient volume: ' + Math.round(vol * 100) + '%', 'success');
                    } else {
                        if (_ambienceAudios[key]) {
                            _ambienceAudios[key].volume = vol;
                            ctx.showToast('Volume set for "' + key + '": ' + Math.round(vol * 100) + '%', 'success');
                        } else {
                            ctx.showToast('No audio playing on key: ' + key, 'info');
                        }
                    }
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'mute-ambient',
            name: 'Mute/Unmute All Ambient',
            icon: '🔈',
            settings: [],
            getState(s, ctx) {
                return {
                    label: _ambienceMuted ? 'Unmute' : 'Mute',
                    icon: _ambienceMuted ? '🔇' : '🔊',
                    color: _ambienceMuted ? '#dc2626' : '#16a34a'
                };
            },
            async execute(s, ctx) {
                try {
                    _ambienceMuted = !_ambienceMuted;
                    Object.values(_ambienceAudios).forEach(a => { a.muted = _ambienceMuted; });
                    ctx.showToast(_ambienceMuted ? 'Ambient muted' : 'Ambient unmuted', 'info');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'ambient-preset',
            name: 'Ambient Preset',
            icon: '🎵',
            settings: [
                { key: 'preset', label: 'Preset sound', type: 'select', options: [
                    { value: 'rain',       label: 'Rain' },
                    { value: 'forest',     label: 'Forest' },
                    { value: 'ocean',      label: 'Ocean' },
                    { value: 'whitenoise', label: 'White Noise' },
                    { value: 'fire',       label: 'Fire (custom URL needed)' },
                    { value: 'café',       label: 'Café (custom URL needed)' },
                    { value: 'lofi',       label: 'Lo-fi (custom URL needed)' }
                ], default: 'rain' },
                { key: 'volume', label: 'Volume %', type: 'number', min: 0, max: 100, default: 40 }
            ],
            async execute(s, ctx) {
                try {
                    const preset = s.preset || 'rain';
                    const url = _ambiencePresetUrls[preset];
                    if (!url) {
                        ctx.showToast('Use custom URL action for the "' + preset + '" preset', 'info');
                        return;
                    }
                    _ambiencePlay(url, 'preset', s.volume, 2);
                    ctx.showToast('Playing preset: ' + preset, 'success');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
