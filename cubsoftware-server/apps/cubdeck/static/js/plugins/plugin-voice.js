/* ─── Voice Control Plugin ─── */

const _SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let _srInstance = null;
let _srActive = false;
let _srCommands = {};
let _srLastHeard = '';
const _ttsVoices = () => window.speechSynthesis?.getVoices() || [];

CubDeck.registerPlugin({
    id: 'voice',
    name: 'Voice Control',
    icon: '🎤',
    actions: [
        {
            id: 'tts-speak',
            name: 'Text to Speech',
            icon: '🔊',
            settings: [
                { key: 'text', label: 'Text to speak', type: 'text', placeholder: 'Hello everyone!' },
                { key: 'rate', label: 'Rate', type: 'number', default: 1, min: 0.5, max: 2, step: 0.1 },
                { key: 'pitch', label: 'Pitch', type: 'number', default: 1, min: 0, max: 2, step: 0.1 },
                { key: 'voiceIndex', label: 'Voice index (0=default)', type: 'number', default: 0, min: 0, max: 50 }
            ],
            async execute(s, ctx) {
                try {
                    if (!window.speechSynthesis) throw new Error('Speech synthesis not supported');
                    const u = new SpeechSynthesisUtterance(s.text || 'Hello');
                    u.rate = parseFloat(s.rate) || 1;
                    u.pitch = parseFloat(s.pitch) || 1;
                    const voices = _ttsVoices();
                    if (voices[parseInt(s.voiceIndex)]) u.voice = voices[parseInt(s.voiceIndex)];
                    window.speechSynthesis.speak(u);
                    ctx.showToast('Speaking...', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'tts-stop',
            name: 'Stop Speech',
            icon: '🔇',
            settings: [],
            async execute(s, ctx) {
                try {
                    window.speechSynthesis.cancel();
                    ctx.showToast('Speech stopped', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'tts-read-last-chat',
            name: 'Speak Channel Welcome',
            icon: '📢',
            settings: [
                { key: 'textTemplate', label: 'Text (use {channel} for channel name)', type: 'text', placeholder: "Welcome to {channel}'s stream!", default: "Welcome to {channel}'s stream!" },
                { key: 'rate', label: 'Rate', type: 'number', default: 1, min: 0.5, max: 2, step: 0.1 }
            ],
            async execute(s, ctx) {
                try {
                    if (!window.speechSynthesis) throw new Error('Speech synthesis not supported');
                    const text = (s.textTemplate || "Welcome to {channel}'s stream!").replace('{channel}', ctx.config.twitch_channel || 'the');
                    const u = new SpeechSynthesisUtterance(text);
                    u.rate = parseFloat(s.rate) || 1;
                    window.speechSynthesis.speak(u);
                    ctx.showToast('Speaking welcome message', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'start-voice-recognition',
            name: 'Start Voice Commands',
            icon: '🎤',
            settings: [
                { key: 'commands', label: 'Voice commands (one per line): command=action\nExample: go live=obs-control:start-stream', type: 'textarea', placeholder: 'go live=obs-control:start-stream\nend stream=obs-control:stop-stream' },
                { key: 'language', label: 'Language code', type: 'text', default: 'en-US', placeholder: 'en-US' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_SR) throw new Error('Speech recognition not supported in this browser (use Chrome/Chromium)');
                    if (_srInstance) { _srInstance.stop(); }
                    _srInstance = new _SR();
                    _srInstance.continuous = true;
                    _srInstance.lang = s.language || 'en-US';
                    _srInstance.interimResults = false;
                    const lines = (s.commands || '').split('\n').filter(Boolean);
                    _srCommands = {};
                    lines.forEach(l => {
                        const eqIdx = l.indexOf('=');
                        if (eqIdx > -1) {
                            const cmd = l.slice(0, eqIdx).trim().toLowerCase();
                            const act = l.slice(eqIdx + 1).trim();
                            if (cmd) _srCommands[cmd] = act || '';
                        }
                    });
                    _srInstance.onresult = (ev) => {
                        const t = ev.results[ev.results.length - 1][0].transcript.trim().toLowerCase();
                        _srLastHeard = t;
                        const act = _srCommands[t];
                        if (act) {
                            ctx.showToast('Voice: "' + t + '"', 'info');
                        } else {
                            ctx.showToast('Heard: "' + t + '"', 'info');
                        }
                    };
                    _srInstance.onend = () => {
                        _srActive = false;
                        if (_srInstance) {
                            try { _srInstance.start(); _srActive = true; } catch(e) {}
                        }
                    };
                    _srInstance.start();
                    _srActive = true;
                    ctx.showToast('Voice recognition active', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'stop-voice-recognition',
            name: 'Stop Voice Commands',
            icon: '🎤',
            settings: [],
            async execute(s, ctx) {
                try {
                    if (_srInstance) {
                        _srInstance.onend = null;
                        _srInstance.stop();
                        _srInstance = null;
                    }
                    _srActive = false;
                    ctx.showToast('Voice recognition stopped', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                return {
                    label: _srActive ? 'Listening...' : 'Start Voice',
                    icon: '🎤',
                    color: _srActive ? '#16a34a' : '#374151',
                    active: _srActive
                };
            }
        },
        {
            id: 'voice-status',
            name: 'Voice Status Display',
            icon: '🎤',
            settings: [],
            async execute(s, ctx) {
                try {
                    ctx.showToast(_srActive ? ('Heard: ' + (_srLastHeard || '...')) : 'Voice Off', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                return {
                    label: _srActive ? ('Heard: ' + (_srLastHeard || '...')) : 'Voice Off',
                    icon: '🎤',
                    color: _srActive ? '#16a34a' : '#374151'
                };
            }
        }
    ]
});
