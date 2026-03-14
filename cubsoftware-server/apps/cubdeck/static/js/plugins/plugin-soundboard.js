/* ─── Soundboard Plugin ─── */

// ── Web Audio API (zero-latency playback) ──
const _audioCtx = (() => {
    try { return new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; }
})();
const _audioBuffers = {}; // url → AudioBuffer (or Promise while loading)
const _soundSources = {}; // btnId → { source, gain } for Web Audio tracks
const _soundAudios  = {}; // btnId → Audio element (fallback only)
const _ytPlayers    = {}; // btnId → { player, wrap } for YouTube
let _soundMasterVol = 1.0;
let _ytApiReady     = null;

// Pre-fetch and decode an audio file into an AudioBuffer.
// Subsequent calls return the cached buffer immediately.
async function _fetchBuffer(url) {
    if (!_audioCtx) throw new Error('Web Audio not supported');
    if (_audioBuffers[url] instanceof AudioBuffer) return _audioBuffers[url];
    if (_audioBuffers[url]) return _audioBuffers[url]; // promise in-flight
    const p = fetch(url)
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
        .then(ab => _audioCtx.decodeAudioData(ab))
        .then(buf => { _audioBuffers[url] = buf; return buf; })
        .catch(e => { delete _audioBuffers[url]; throw e; });
    _audioBuffers[url] = p;
    return p;
}

// Kick off a background preload — call early so the buffer is ready by click time
function _preloadUrl(url) {
    if (!url || !_audioCtx || _ytVideoId(url) || _audioBuffers[url]) return;
    _fetchBuffer(url).catch(() => {}); // fire-and-forget
}

// ── YouTube helpers ──
let _ytApiReady2 = null; // alias — keep one reference
function _loadYTApi() {
    if (_ytApiReady) return _ytApiReady;
    _ytApiReady = new Promise(resolve => {
        if (window.YT && window.YT.Player) { resolve(); return; }
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
        if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
            const s = document.createElement('script');
            s.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(s);
        }
    });
    return _ytApiReady;
}

function _ytVideoId(url) {
    try {
        const u = new URL(url);
        if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0];
        if (u.hostname.includes('youtube.com')) {
            if (u.searchParams.get('v')) return u.searchParams.get('v');
            const m = u.pathname.match(/\/(?:shorts|embed|v)\/([^/?&]+)/);
            if (m) return m[1];
        }
    } catch {}
    return null;
}

async function _playYT(id, videoId, volume, loop) {
    _stopYT(id);
    await _loadYTApi();
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;left:-9999px;top:-9999px;pointer-events:none;';
    const inner = document.createElement('div');
    wrap.appendChild(inner);
    document.body.appendChild(wrap);
    const vol = Math.round(Math.max(0, Math.min(100, (volume ?? 80) * _soundMasterVol)));
    await new Promise((resolve, reject) => {
        const player = new YT.Player(inner, {
            videoId, width: '200', height: '150',
            playerVars: { autoplay: 1, controls: 0, modestbranding: 1, playsinline: 1 },
            events: {
                onReady(e) { e.target.setVolume(vol); e.target.playVideo(); resolve(); },
                onStateChange(e) {
                    if (e.data === YT.PlayerState.ENDED) {
                        if (loop) { e.target.seekTo(0); e.target.playVideo(); }
                        else { _stopYT(id); }
                    }
                },
                onError(e) { wrap.remove(); reject(new Error('YouTube error: ' + e.data)); }
            }
        });
        _ytPlayers[id] = { player, wrap };
    });
}

function _stopYT(id) {
    const entry = _ytPlayers[id];
    if (!entry) return;
    try { entry.player.stopVideo(); entry.player.destroy(); } catch {}
    try { entry.wrap.remove(); } catch {}
    delete _ytPlayers[id];
}

// ── Public API ──
async function playSound(id, url, volume, loop) {
    const videoId = _ytVideoId(url);
    if (videoId) {
        await _playYT(id, videoId, volume, loop);
        return;
    }

    stopSound(id);

    if (_audioCtx) {
        // Resume AudioContext if browser suspended it (requires prior user gesture — button click counts)
        if (_audioCtx.state === 'suspended') await _audioCtx.resume();

        const buffer = await _fetchBuffer(url); // instant if preloaded, fetch if not

        const gain = _audioCtx.createGain();
        gain.gain.value = Math.max(0, Math.min(1, ((volume ?? 80) / 100) * _soundMasterVol));
        gain.connect(_audioCtx.destination);

        const source = _audioCtx.createBufferSource();
        source.buffer = buffer;
        source.loop = !!loop;
        source.connect(gain);
        source.start(0);

        _soundSources[id] = { source, gain };
        source.onended = () => { if (_soundSources[id]?.source === source) delete _soundSources[id]; };
    } else {
        // Fallback for browsers without Web Audio API
        const audio = new Audio(url);
        audio.volume = Math.max(0, Math.min(1, ((volume ?? 80) / 100) * _soundMasterVol));
        audio.loop = !!loop;
        _soundAudios[id] = audio;
        audio.play().catch(e => { throw new Error('Cannot play audio: ' + e.message); });
        audio.onended = () => { delete _soundAudios[id]; };
    }
}

function stopSound(id) {
    const a = _soundAudios[id];
    if (a) { a.pause(); a.currentTime = 0; delete _soundAudios[id]; }

    const src = _soundSources[id];
    if (src) { try { src.source.stop(); } catch {} delete _soundSources[id]; }

    _stopYT(id);
}

function stopAllSounds() {
    [...Object.keys(_soundAudios), ...Object.keys(_soundSources), ...Object.keys(_ytPlayers)]
        .forEach(id => stopSound(id));
}

function _isActive(btnId) {
    return !!_soundAudios[btnId] || !!_soundSources[btnId] || !!_ytPlayers[btnId];
}

CubDeck.registerPlugin({
    id: 'soundboard',
    name: 'Soundboard',
    icon: '🔊',
    actions: [
        {
            id: 'play-sound',
            name: 'Play Sound',
            icon: '🔊',
            settings: [
                { key: 'url', label: 'Audio URL (MP3/OGG/WAV) or YouTube link', type: 'text', placeholder: 'https://... or https://youtu.be/...' },
                { key: 'volume', label: 'Volume (0-100)', type: 'number', min: 0, max: 100, default: 80 },
                { key: 'loop', label: 'Loop', type: 'checkbox' }
            ],
            getState(s, ctx, btnId) {
                // Preload in the background so the buffer is ready by click time
                if (s.url && !_ytVideoId(s.url)) _preloadUrl(s.url);
                return { active: _isActive(btnId) };
            },
            async execute(s, ctx, el, btnId) {
                if (_isActive(btnId)) {
                    stopSound(btnId);
                } else {
                    if (!s.url) throw new Error('No audio URL set');
                    await playSound(btnId, s.url, parseInt(s.volume) ?? 80, s.loop);
                }
            }
        },
        {
            id: 'stop-all',
            name: 'Stop All Sounds',
            icon: '🔇',
            settings: [],
            async execute(s, ctx) {
                stopAllSounds();
                ctx.showToast('All sounds stopped');
            }
        },
        {
            id: 'play-random',
            name: 'Play Random Sound',
            icon: '🎲',
            settings: [
                { key: 'urls', label: 'Audio URLs (one per line, MP3/OGG/WAV/YouTube)', type: 'text', placeholder: 'https://url1.mp3\nhttps://youtu.be/abc123' },
                { key: 'volume', label: 'Volume (0-100)', type: 'number', min: 0, max: 100, default: 80 }
            ],
            getState(s) {
                // Preload all configured URLs
                (s.urls || '').split('\n').map(u => u.trim()).filter(u => u && !_ytVideoId(u))
                    .forEach(u => _preloadUrl(u));
                return {};
            },
            async execute(s, ctx, el, btnId) {
                const urls = (s.urls || '').split('\n').map(u => u.trim()).filter(Boolean);
                if (!urls.length) throw new Error('No URLs configured');
                const url = urls[Math.floor(Math.random() * urls.length)];
                await playSound(btnId, url, parseInt(s.volume) ?? 80, false);
            }
        }
    ]
});
