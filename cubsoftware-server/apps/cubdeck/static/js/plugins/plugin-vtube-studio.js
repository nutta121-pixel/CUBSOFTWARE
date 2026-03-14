/* ─── VTube Studio Plugin ─── */

let _vtsWs = null;
let _vtsConnected = false;
let _vtsToken = '';
const _vtsRequestId = () => 'cubdeck-' + Date.now() + '-' + Math.floor(Math.random() * 10000);

async function _vtsSend(type, data) {
    return new Promise((resolve, reject) => {
        if (!_vtsWs || _vtsWs.readyState !== WebSocket.OPEN) {
            reject(new Error('Not connected to VTube Studio'));
            return;
        }
        const id = _vtsRequestId();
        const msg = JSON.stringify({
            apiName: 'VTubeStudioPublicAPI',
            apiVersion: '1.0',
            requestID: id,
            messageType: type,
            data: data || {}
        });
        const handler = (ev) => {
            try {
                const r = JSON.parse(ev.data);
                if (r.requestID === id) {
                    _vtsWs.removeEventListener('message', handler);
                    if (r.data?.errorID) reject(new Error(r.data.message || 'VTS error'));
                    else resolve(r.data);
                }
            } catch(e) {}
        };
        _vtsWs.addEventListener('message', handler);
        _vtsWs.send(msg);
        setTimeout(() => {
            _vtsWs && _vtsWs.removeEventListener('message', handler);
            reject(new Error('VTS request timed out'));
        }, 10000);
    });
}

CubDeck.registerPlugin({
    id: 'vtube-studio',
    name: 'VTube Studio',
    icon: '🎭',
    actions: [
        {
            id: 'connect',
            name: 'Connect to VTube Studio',
            icon: '🎭',
            settings: [
                { key: 'port', label: 'Port', type: 'number', default: 8001, min: 1, max: 65535 }
            ],
            async execute(s, ctx) {
                try {
                    if (_vtsWs) { try { _vtsWs.close(); } catch(e) {} _vtsWs = null; _vtsConnected = false; }
                    const ws = new WebSocket('ws://localhost:' + (s.port || 8001));
                    ws.onopen = async () => {
                        _vtsWs = ws;
                        try {
                            const authResp = await _vtsSend('AuthenticationTokenRequest', {
                                pluginName: 'CubDeck',
                                pluginDeveloper: 'CubSoftware',
                                pluginIcon: ''
                            });
                            _vtsToken = authResp.authenticationToken;
                            const auth = await _vtsSend('AuthenticationRequest', {
                                pluginName: 'CubDeck',
                                pluginDeveloper: 'CubSoftware',
                                authenticationToken: _vtsToken
                            });
                            _vtsConnected = !!auth.authenticated;
                            ctx.showToast(_vtsConnected ? 'VTube Studio connected!' : 'Auth failed. Check VTS settings.', _vtsConnected ? 'success' : 'error');
                            ctx.refreshAllButtons();
                        } catch(e) {
                            ctx.showToast('VTS: ' + e.message, 'error');
                        }
                    };
                    ws.onclose = () => { _vtsConnected = false; _vtsWs = null; ctx.refreshAllButtons && ctx.refreshAllButtons(); };
                    ws.onerror = () => { _vtsConnected = false; };
                    ctx.showToast('Connecting to VTube Studio...', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            },
            getState(s, ctx) {
                return {
                    label: _vtsConnected ? 'VTS Connected' : 'Connect VTS',
                    icon: '🎭',
                    color: _vtsConnected ? '#16a34a' : '#374151',
                    active: _vtsConnected
                };
            }
        },
        {
            id: 'trigger-hotkey',
            name: 'Trigger VTS Hotkey',
            icon: '⚡',
            settings: [
                { key: 'hotkeyId', label: 'Hotkey ID (from VTS)', type: 'text', placeholder: 'your-hotkey-id' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.hotkeyId) throw new Error('Hotkey ID required');
                    await _vtsSend('HotkeyTriggerRequest', { hotkeyID: s.hotkeyId });
                    ctx.showToast('Hotkey triggered', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'move-model',
            name: 'Move VTube Studio Model',
            icon: '↕️',
            settings: [
                { key: 'posX', label: 'X position (-1 to 1)', type: 'number', default: 0, min: -2, max: 2, step: 0.1 },
                { key: 'posY', label: 'Y position (-1 to 1)', type: 'number', default: 0, min: -2, max: 2, step: 0.1 },
                { key: 'rotation', label: 'Rotation degrees', type: 'number', default: 0, min: -180, max: 180 },
                { key: 'size', label: 'Size (-100 to 100)', type: 'number', default: 0, min: -100, max: 100 },
                { key: 'duration', label: 'Duration seconds', type: 'number', default: 0.5, min: 0, max: 5, step: 0.1 }
            ],
            async execute(s, ctx) {
                try {
                    await _vtsSend('MoveModelRequest', {
                        timeInSeconds: parseFloat(s.duration) || 0.5,
                        valuesAreRelativeToModel: false,
                        positionX: parseFloat(s.posX) || 0,
                        positionY: parseFloat(s.posY) || 0,
                        rotation: parseFloat(s.rotation) || 0,
                        size: parseFloat(s.size) || 0
                    });
                    ctx.showToast('Model moved', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'toggle-expression',
            name: 'Toggle Expression',
            icon: '😊',
            settings: [
                { key: 'expressionFile', label: 'Expression filename (.exp3.json)', type: 'text', placeholder: 'MyExpression.exp3.json' },
                { key: 'active', label: 'Active (uncheck to deactivate)', type: 'checkbox', default: true }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.expressionFile) throw new Error('Expression filename required');
                    await _vtsSend('ExpressionActivationRequest', {
                        expressionFile: s.expressionFile,
                        active: s.active !== false
                    });
                    ctx.showToast('Expression ' + (s.active !== false ? 'activated' : 'deactivated'), 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'load-model',
            name: 'Load Model',
            icon: '🎭',
            settings: [
                { key: 'modelId', label: 'Model ID', type: 'text', placeholder: 'model-id-from-vts' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.modelId) throw new Error('Model ID required');
                    await _vtsSend('ModelLoadRequest', { modelID: s.modelId });
                    ctx.showToast('Model loading...', 'info');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
