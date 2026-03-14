/* ─── LiveSplit Plugin ─── */
// Requires LiveSplit with "LiveSplit Server" component enabled (port 16834 by default)
// LiveSplit Server: https://github.com/LiveSplit/LiveSplit.Server

let _lsSocket = null;
let _lsConnected = false;
let _lsCurrentSplit = '';
let _lsCurrentTime = '';
let _lsPendingCallbacks = {};
let _lsMsgId = 0;

function _lsConnect(port, ctx) {
    const p = port || 16834;
    if (_lsSocket) { try { _lsSocket.close(); } catch(e) {} }
    _lsSocket = new WebSocket(`ws://localhost:${p}`);
    _lsSocket.onopen = () => {
        _lsConnected = true;
        if (ctx) ctx.showToast('LiveSplit connected', 'success');
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
        _lsPoll();
    };
    _lsSocket.onmessage = (ev) => {
        const raw = (ev.data || '').trim();
        // Resolve next pending callback
        const cbs = Object.values(_lsPendingCallbacks);
        if (cbs.length > 0) {
            const { resolve, key } = cbs[0];
            delete _lsPendingCallbacks[key];
            resolve(raw);
        }
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
    };
    _lsSocket.onclose = () => {
        _lsConnected = false;
        _lsCurrentSplit = '';
        _lsCurrentTime = '';
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
    };
    _lsSocket.onerror = () => { _lsConnected = false; };
}

function _lsSend(cmd) {
    if (!_lsSocket || _lsSocket.readyState !== 1) return Promise.resolve('');
    return new Promise((resolve) => {
        const key = ++_lsMsgId;
        _lsPendingCallbacks[key] = { resolve, key };
        _lsSocket.send(cmd + '\r\n');
        setTimeout(() => {
            if (_lsPendingCallbacks[key]) {
                delete _lsPendingCallbacks[key];
                resolve('');
            }
        }, 500);
    });
}

function _lsSendOnly(cmd) {
    if (_lsSocket && _lsSocket.readyState === 1) _lsSocket.send(cmd + '\r\n');
}

let _lsPollTimer = null;
function _lsPoll() {
    if (_lsPollTimer) clearInterval(_lsPollTimer);
    _lsPollTimer = setInterval(async () => {
        if (!_lsConnected) return;
        const split = await _lsSend('getcurrentsplitname');
        const time = await _lsSend('getcurrenttime');
        if (split !== undefined) _lsCurrentSplit = split;
        if (time !== undefined) _lsCurrentTime = time;
        if (typeof CubDeck !== 'undefined') CubDeck.refreshAllButtons();
    }, 2000);
}

CubDeck.registerPlugin({
    id: 'livesplit',
    name: 'LiveSplit',
    icon: '⏱️',
    actions: [
        {
            id: 'connect',
            name: 'Connect to LiveSplit',
            settings: [
                { key: 'port', label: 'LiveSplit Server port', type: 'text', placeholder: '16834' }
            ],
            getState(s, ctx) {
                return {
                    label: _lsConnected ? 'LS Connected' : 'Connect LiveSplit',
                    icon: '⏱️',
                    color: _lsConnected ? '#16a34a' : '#374151',
                    active: _lsConnected
                };
            },
            async execute(s, ctx) {
                _lsConnect(parseInt(s.port) || 16834, ctx);
            }
        },
        {
            id: 'start-timer',
            name: 'Start / Resume Timer',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('starttimer');
                ctx.showToast('Timer started', 'success');
            }
        },
        {
            id: 'split',
            name: 'Split',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('split');
                ctx.showToast('Split!', 'success');
            }
        },
        {
            id: 'undo-split',
            name: 'Undo Split',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('unsplit');
                ctx.showToast('Undo split', 'success');
            }
        },
        {
            id: 'skip-split',
            name: 'Skip Split',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('skipsplit');
                ctx.showToast('Split skipped', 'success');
            }
        },
        {
            id: 'reset',
            name: 'Reset Run',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('reset');
                ctx.showToast('Run reset', 'success');
            }
        },
        {
            id: 'pause',
            name: 'Pause / Unpause',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('pause');
            }
        },
        {
            id: 'current-time',
            name: 'Current Time Display',
            settings: [],
            getState(s, ctx) {
                return {
                    label: _lsCurrentTime || (_lsConnected ? '0:00.00' : 'Not connected'),
                    icon: '⏱️',
                    color: _lsConnected ? '#16a34a' : '#666'
                };
            },
            async execute(s, ctx) {
                const time = await _lsSend('getcurrenttime');
                ctx.showToast('Time: ' + (time || 'N/A'), 'info');
            }
        },
        {
            id: 'current-split',
            name: 'Current Split Display',
            settings: [],
            getState(s, ctx) {
                return {
                    label: _lsCurrentSplit || (_lsConnected ? 'Run complete' : 'Not connected'),
                    icon: '🏁',
                    color: _lsConnected ? '#9147ff' : '#666'
                };
            },
            async execute(s, ctx) {
                const split = await _lsSend('getcurrentsplitname');
                ctx.showToast('Current split: ' + (split || 'N/A'), 'info');
            }
        },
        {
            id: 'pb-comparison',
            name: 'Switch to PB Comparison',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('setcomparison Personal Best');
                ctx.showToast('Comparison: Personal Best', 'success');
            }
        },
        {
            id: 'best-comparison',
            name: 'Switch to Best Segments',
            settings: [],
            async execute(s, ctx) {
                _lsSendOnly('setcomparison Best Segments');
                ctx.showToast('Comparison: Best Segments', 'success');
            }
        }
    ]
});
