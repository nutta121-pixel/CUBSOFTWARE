/* ─── VoiceMeeter Plugin ─── */
// Controls VoiceMeeter via Web MIDI API (Chrome/Edge — no extra software needed)
// Setup: In VoiceMeeter → Menu → MIDI Mapping → right-click any knob → MIDI Learn,
//        then press the CubDeck button. Uses loopMIDI or VoiceMeeter's virtual MIDI port.
//
// Also supports a local REST bridge if you run one (e.g. voicemeeter-rest on npm).

let _vmMidi = null;           // MIDIOutput
let _vmMidiAccess = null;
let _vmMidiConnected = false;
let _vmMidiPort = '';         // selected output port id
let _vmStripGain = [0, 0, 0, 0, 0];   // cache strip gains (0–127)
let _vmStripMute = [false, false, false, false, false]; // cache strip mutes
let _vmBusGain   = [0, 0, 0, 0, 0, 0, 0, 0];

async function _vmInitMidi(portName) {
    try {
        _vmMidiAccess = await navigator.requestMIDIAccess();
        _vmMidi = null;
        for (const [, out] of _vmMidiAccess.outputs) {
            if (!portName || out.name.toLowerCase().includes((portName || 'voicemeeter').toLowerCase())) {
                _vmMidi = out;
                _vmMidiPort = out.name;
                _vmMidiConnected = true;
                break;
            }
        }
        if (!_vmMidi) {
            // Try first available output as fallback
            const first = _vmMidiAccess.outputs.values().next().value;
            if (first) { _vmMidi = first; _vmMidiPort = first.name; _vmMidiConnected = true; }
        }
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
        return _vmMidi;
    } catch (e) {
        _vmMidiConnected = false;
        throw new Error('MIDI not available: ' + e.message);
    }
}

function _vmSendCC(channel, cc, value) {
    if (!_vmMidi) return;
    // channel 0–15, cc 0–127, value 0–127
    _vmMidi.send([0xB0 | (channel & 0xF), cc & 0x7F, value & 0x7F]);
}

function _vmSendNote(channel, note, velocity) {
    if (!_vmMidi) return;
    _vmMidi.send([0x90 | (channel & 0xF), note & 0x7F, velocity & 0x7F]);
    setTimeout(() => _vmMidi.send([0x80 | (channel & 0xF), note & 0x7F, 0]), 100);
}

// Gain -60..+12 dB → MIDI 0..127
function _dbToMidi(db) { return Math.round(((db + 60) / 72) * 127); }
function _midiToDb(v)   { return Math.round(((v / 127) * 72) - 60); }

CubDeck.registerPlugin({
    id: 'voicemeeter',
    name: 'VoiceMeeter',
    icon: '🎚️',
    actions: [
        {
            id: 'connect',
            name: 'Connect via MIDI',
            settings: [
                { key: 'port_name', label: 'MIDI port name (partial match)', type: 'text', placeholder: 'VoiceMeeter Input' }
            ],
            getState(s, ctx) {
                return {
                    label: _vmMidiConnected ? (_vmMidiPort || 'MIDI Connected') : 'Connect MIDI',
                    icon: '🎚️',
                    color: _vmMidiConnected ? '#16a34a' : '#374151',
                    active: _vmMidiConnected
                };
            },
            async execute(s, ctx) {
                try {
                    await _vmInitMidi(s.port_name);
                    if (_vmMidi) {
                        ctx.showToast('VoiceMeeter MIDI: ' + _vmMidiPort, 'success');
                    } else {
                        ctx.showToast('No MIDI output found. Install loopMIDI or check VoiceMeeter MIDI settings.', 'error');
                    }
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'strip-mute',
            name: 'Strip Mute Toggle',
            settings: [
                { key: 'strip', label: 'Strip (1–5)', type: 'select', options: [
                    {value:'0',label:'Strip 1'},{value:'1',label:'Strip 2'},{value:'2',label:'Strip 3'},
                    {value:'3',label:'Strip 4'},{value:'4',label:'Strip 5'}
                ], default: '0' },
                { key: 'midi_cc', label: 'MIDI CC# (from VoiceMeeter MIDI Learn)', type: 'text', placeholder: '1' },
                { key: 'midi_ch', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' }
            ],
            getState(s, ctx) {
                const idx = parseInt(s.strip) || 0;
                const muted = _vmStripMute[idx];
                return {
                    label: `Strip ${idx+1} ${muted ? 'MUTED' : 'Live'}`,
                    icon: '🎚️',
                    color: muted ? '#dc2626' : '#16a34a',
                    active: !muted
                };
            },
            async execute(s, ctx) {
                try {
                    if (!_vmMidi) await _vmInitMidi(s.port_name);
                    if (!_vmMidi) throw new Error('MIDI not connected. Click Connect first.');
                    const idx = parseInt(s.strip) || 0;
                    const ch = (parseInt(s.midi_ch) || 1) - 1;
                    const cc = parseInt(s.midi_cc) || 1;
                    _vmStripMute[idx] = !_vmStripMute[idx];
                    _vmSendCC(ch, cc, _vmStripMute[idx] ? 0 : 127);
                    ctx.showToast(`Strip ${idx+1} ${_vmStripMute[idx] ? 'muted' : 'unmuted'}`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'strip-mute-on',
            name: 'Strip Mute On',
            settings: [
                { key: 'strip', label: 'Strip (1–5)', type: 'select', options: [
                    {value:'0',label:'Strip 1'},{value:'1',label:'Strip 2'},{value:'2',label:'Strip 3'},
                    {value:'3',label:'Strip 4'},{value:'4',label:'Strip 5'}
                ], default: '0' },
                { key: 'midi_cc', label: 'MIDI CC#', type: 'text', placeholder: '1' },
                { key: 'midi_ch', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_vmMidi) await _vmInitMidi();
                    if (!_vmMidi) throw new Error('MIDI not connected');
                    const idx = parseInt(s.strip) || 0;
                    const ch = (parseInt(s.midi_ch) || 1) - 1;
                    const cc = parseInt(s.midi_cc) || 1;
                    _vmStripMute[idx] = true;
                    _vmSendCC(ch, cc, 0);
                    ctx.showToast(`Strip ${idx+1} muted`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'strip-mute-off',
            name: 'Strip Mute Off (Unmute)',
            settings: [
                { key: 'strip', label: 'Strip (1–5)', type: 'select', options: [
                    {value:'0',label:'Strip 1'},{value:'1',label:'Strip 2'},{value:'2',label:'Strip 3'},
                    {value:'3',label:'Strip 4'},{value:'4',label:'Strip 5'}
                ], default: '0' },
                { key: 'midi_cc', label: 'MIDI CC#', type: 'text', placeholder: '1' },
                { key: 'midi_ch', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_vmMidi) await _vmInitMidi();
                    if (!_vmMidi) throw new Error('MIDI not connected');
                    const idx = parseInt(s.strip) || 0;
                    const ch = (parseInt(s.midi_ch) || 1) - 1;
                    const cc = parseInt(s.midi_cc) || 1;
                    _vmStripMute[idx] = false;
                    _vmSendCC(ch, cc, 127);
                    ctx.showToast(`Strip ${idx+1} unmuted`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'strip-gain',
            name: 'Strip Volume Set',
            settings: [
                { key: 'strip', label: 'Strip (1–5)', type: 'select', options: [
                    {value:'0',label:'Strip 1'},{value:'1',label:'Strip 2'},{value:'2',label:'Strip 3'},
                    {value:'3',label:'Strip 4'},{value:'4',label:'Strip 5'}
                ], default: '0' },
                { key: 'gain_db', label: 'Gain in dB (-60 to +12)', type: 'text', placeholder: '0' },
                { key: 'midi_cc', label: 'MIDI CC# (from MIDI Learn)', type: 'text', placeholder: '10' },
                { key: 'midi_ch', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_vmMidi) await _vmInitMidi();
                    if (!_vmMidi) throw new Error('MIDI not connected');
                    const idx = parseInt(s.strip) || 0;
                    const db = Math.max(-60, Math.min(12, parseFloat(s.gain_db) || 0));
                    const midiVal = _dbToMidi(db);
                    const ch = (parseInt(s.midi_ch) || 1) - 1;
                    const cc = parseInt(s.midi_cc) || 10;
                    _vmStripGain[idx] = midiVal;
                    _vmSendCC(ch, cc, midiVal);
                    ctx.showToast(`Strip ${idx+1} gain: ${db}dB`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'bus-mute',
            name: 'Bus Mute Toggle',
            settings: [
                { key: 'bus', label: 'Bus (A1–B3)', type: 'select', options: [
                    {value:'0',label:'Bus A1'},{value:'1',label:'Bus A2'},{value:'2',label:'Bus A3'},
                    {value:'3',label:'Bus B1'},{value:'4',label:'Bus B2'},{value:'5',label:'Bus B3'}
                ], default: '0' },
                { key: 'midi_cc', label: 'MIDI CC#', type: 'text', placeholder: '20' },
                { key: 'midi_ch', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' }
            ],
            getState(s, ctx) {
                const idx = parseInt(s.bus) || 0;
                const busNames = ['A1','A2','A3','B1','B2','B3'];
                const muted = _vmStripMute[5 + idx] || false;
                return {
                    label: `Bus ${busNames[idx] || ''} ${muted ? 'MUTED' : 'Live'}`,
                    icon: '🔊',
                    color: muted ? '#dc2626' : '#16a34a'
                };
            },
            async execute(s, ctx) {
                try {
                    if (!_vmMidi) await _vmInitMidi();
                    if (!_vmMidi) throw new Error('MIDI not connected');
                    const idx = parseInt(s.bus) || 0;
                    const ch = (parseInt(s.midi_ch) || 1) - 1;
                    const cc = parseInt(s.midi_cc) || 20;
                    const cacheIdx = 5 + idx;
                    _vmStripMute[cacheIdx] = !(_vmStripMute[cacheIdx] || false);
                    _vmSendCC(ch, cc, _vmStripMute[cacheIdx] ? 0 : 127);
                    const busNames = ['A1','A2','A3','B1','B2','B3'];
                    ctx.showToast(`Bus ${busNames[idx]} ${_vmStripMute[cacheIdx] ? 'muted' : 'unmuted'}`, 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'macro-button',
            name: 'Trigger Macro Button',
            settings: [
                { key: 'button_num', label: 'Macro Button # (1–80)', type: 'text', placeholder: '1' },
                { key: 'midi_note', label: 'MIDI Note# (from MIDI Learn)', type: 'text', placeholder: '36' },
                { key: 'midi_ch', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_vmMidi) await _vmInitMidi();
                    if (!_vmMidi) throw new Error('MIDI not connected');
                    const note = parseInt(s.midi_note) || 36;
                    const ch = (parseInt(s.midi_ch) || 1) - 1;
                    _vmSendNote(ch, note, 127);
                    ctx.showToast('Macro button triggered', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'list-midi-ports',
            name: 'List MIDI Output Ports',
            settings: [],
            async execute(s, ctx) {
                try {
                    const access = await navigator.requestMIDIAccess();
                    const ports = [];
                    for (const [, out] of access.outputs) ports.push(out.name);
                    if (ports.length === 0) {
                        ctx.showToast('No MIDI outputs found. Install loopMIDI.', 'info');
                    } else {
                        ctx.showToast('MIDI outputs: ' + ports.join(' | '), 'info');
                    }
                } catch (e) { ctx.showToast('MIDI error: ' + e.message, 'error'); }
            }
        }
    ]
});
