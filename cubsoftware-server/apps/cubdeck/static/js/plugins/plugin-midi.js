/* ─── Generic MIDI Plugin ─── */
// Send MIDI messages to any connected MIDI device via the Web MIDI API
// Works in Chrome and Edge. Compatible with synths, DAWs, lighting controllers,
// DJ controllers, hardware samplers, and any MIDI-capable device.

let _midiAccess = null;
let _midiOutputs = {};
let _midiConnected = false;

async function _midiInit() {
    if (!navigator.requestMIDIAccess) throw new Error('Web MIDI API not supported. Use Chrome or Edge.');
    _midiAccess = await navigator.requestMIDIAccess({ sysex: false });
    _midiOutputs = {};
    for (const [id, out] of _midiAccess.outputs) {
        _midiOutputs[id] = out;
    }
    _midiConnected = Object.keys(_midiOutputs).length > 0;
    _midiAccess.onstatechange = () => {
        _midiOutputs = {};
        for (const [id, out] of _midiAccess.outputs) _midiOutputs[id] = out;
        _midiConnected = Object.keys(_midiOutputs).length > 0;
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
    };
    return _midiAccess;
}

function _midiGetOutput(portName) {
    for (const out of Object.values(_midiOutputs)) {
        if (!portName || out.name.toLowerCase().includes(portName.toLowerCase())) return out;
    }
    const vals = Object.values(_midiOutputs);
    return vals.length > 0 ? vals[0] : null;
}

CubDeck.registerPlugin({
    id: 'midi',
    name: 'MIDI',
    icon: '🎹',
    actions: [
        {
            id: 'list-devices',
            name: 'List MIDI Devices',
            settings: [],
            getState(s, ctx) {
                const count = Object.keys(_midiOutputs).length;
                return {
                    label: _midiConnected ? count + ' MIDI device' + (count !== 1 ? 's' : '') : 'No MIDI',
                    icon: '🎹',
                    color: _midiConnected ? '#16a34a' : '#374151',
                    active: _midiConnected
                };
            },
            async execute(s, ctx) {
                try {
                    await _midiInit();
                    const names = Object.values(_midiOutputs).map(o => o.name);
                    if (names.length === 0) {
                        ctx.showToast('No MIDI output devices found', 'info');
                    } else {
                        ctx.showToast('MIDI outputs: ' + names.join(' | '), 'info');
                    }
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'note-on',
            name: 'Send Note On',
            settings: [
                { key: 'port', label: 'MIDI port name (leave blank for first)', type: 'text', placeholder: '' },
                { key: 'channel', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' },
                { key: 'note', label: 'Note (0–127, C4 = 60)', type: 'text', placeholder: '60' },
                { key: 'velocity', label: 'Velocity (0–127)', type: 'text', placeholder: '127' },
                { key: 'duration', label: 'Note duration (ms, 0 = hold)', type: 'text', placeholder: '100' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_midiAccess) await _midiInit();
                    const out = _midiGetOutput(s.port);
                    if (!out) throw new Error('No MIDI output found');
                    const ch = Math.max(0, Math.min(15, (parseInt(s.channel) || 1) - 1));
                    const note = Math.max(0, Math.min(127, parseInt(s.note) || 60));
                    const vel = Math.max(0, Math.min(127, parseInt(s.velocity) || 127));
                    out.send([0x90 | ch, note, vel]);
                    const dur = parseInt(s.duration) || 100;
                    if (dur > 0) setTimeout(() => out.send([0x80 | ch, note, 0]), dur);
                    ctx.showToast(`Note ${note} on ch ${parseInt(s.channel)||1} (vel ${vel})`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'note-off',
            name: 'Send Note Off',
            settings: [
                { key: 'port', label: 'MIDI port name (leave blank for first)', type: 'text', placeholder: '' },
                { key: 'channel', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' },
                { key: 'note', label: 'Note (0–127)', type: 'text', placeholder: '60' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_midiAccess) await _midiInit();
                    const out = _midiGetOutput(s.port);
                    if (!out) throw new Error('No MIDI output found');
                    const ch = Math.max(0, Math.min(15, (parseInt(s.channel) || 1) - 1));
                    const note = Math.max(0, Math.min(127, parseInt(s.note) || 60));
                    out.send([0x80 | ch, note, 0]);
                    ctx.showToast(`Note off: ${note} ch ${parseInt(s.channel)||1}`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'control-change',
            name: 'Send Control Change (CC)',
            settings: [
                { key: 'port', label: 'MIDI port name (leave blank for first)', type: 'text', placeholder: '' },
                { key: 'channel', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' },
                { key: 'cc', label: 'CC Number (0–127)', type: 'text', placeholder: '7' },
                { key: 'value', label: 'Value (0–127)', type: 'text', placeholder: '127' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_midiAccess) await _midiInit();
                    const out = _midiGetOutput(s.port);
                    if (!out) throw new Error('No MIDI output found');
                    const ch = Math.max(0, Math.min(15, (parseInt(s.channel) || 1) - 1));
                    const cc = Math.max(0, Math.min(127, parseInt(s.cc) || 7));
                    const val = Math.max(0, Math.min(127, parseInt(s.value) || 127));
                    out.send([0xB0 | ch, cc, val]);
                    ctx.showToast(`CC ${cc} = ${val} on ch ${parseInt(s.channel)||1}`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'program-change',
            name: 'Send Program Change',
            settings: [
                { key: 'port', label: 'MIDI port name (leave blank for first)', type: 'text', placeholder: '' },
                { key: 'channel', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' },
                { key: 'program', label: 'Program (0–127)', type: 'text', placeholder: '0' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_midiAccess) await _midiInit();
                    const out = _midiGetOutput(s.port);
                    if (!out) throw new Error('No MIDI output found');
                    const ch = Math.max(0, Math.min(15, (parseInt(s.channel) || 1) - 1));
                    const prog = Math.max(0, Math.min(127, parseInt(s.program) || 0));
                    out.send([0xC0 | ch, prog]);
                    ctx.showToast(`Program change: ${prog} on ch ${parseInt(s.channel)||1}`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'pitch-bend',
            name: 'Send Pitch Bend',
            settings: [
                { key: 'port', label: 'MIDI port name (leave blank for first)', type: 'text', placeholder: '' },
                { key: 'channel', label: 'MIDI Channel (1–16)', type: 'text', placeholder: '1' },
                { key: 'value', label: 'Bend value (-100 to +100%)', type: 'text', placeholder: '0' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_midiAccess) await _midiInit();
                    const out = _midiGetOutput(s.port);
                    if (!out) throw new Error('No MIDI output found');
                    const ch = Math.max(0, Math.min(15, (parseInt(s.channel) || 1) - 1));
                    const pct = Math.max(-100, Math.min(100, parseInt(s.value) || 0));
                    const raw = Math.round(((pct + 100) / 200) * 16383);
                    const lsb = raw & 0x7F;
                    const msb = (raw >> 7) & 0x7F;
                    out.send([0xE0 | ch, lsb, msb]);
                    ctx.showToast(`Pitch bend: ${pct > 0 ? '+' : ''}${pct}%`, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'all-notes-off',
            name: 'All Notes Off (Panic)',
            settings: [
                { key: 'port', label: 'MIDI port name (leave blank for first)', type: 'text', placeholder: '' },
                { key: 'channel', label: 'MIDI Channel (1–16, 0 = all)', type: 'text', placeholder: '0' }
            ],
            async execute(s, ctx) {
                try {
                    if (!_midiAccess) await _midiInit();
                    const out = _midiGetOutput(s.port);
                    if (!out) throw new Error('No MIDI output found');
                    const reqCh = parseInt(s.channel) || 0;
                    const channels = reqCh === 0 ? [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15] : [reqCh - 1];
                    for (const ch of channels) out.send([0xB0 | ch, 123, 0]); // All Notes Off
                    ctx.showToast('All notes off (MIDI panic)', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
