/* ─── Notes & Labels Plugin ─── */

const _notesState = {}; // key → state object

CubDeck.registerPlugin({
    id: 'notes',
    name: 'Notes & Labels',
    icon: '📝',
    actions: [
        {
            id: 'static-note',
            name: 'Static Text Note',
            icon: '📌',
            settings: [
                { key: 'text', label: 'Note text', type: 'text', placeholder: 'Your note here...' },
                { key: 'bgColor', label: 'Background color', type: 'text', placeholder: '#1a1a2e', default: '#1a1a2e' },
                { key: 'textColor', label: 'Text color', type: 'text', placeholder: '#ffffff', default: '#ffffff' }
            ],
            getState(s, ctx) {
                return {
                    label: s.text || 'Note',
                    icon: '📝',
                    color: s.bgColor || '#1a1a2e'
                };
            },
            async execute(s, ctx) {
                try {
                    const text = s.text || '';
                    if (!text) {
                        ctx.showToast('No text set', 'info');
                        return;
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(text);
                        ctx.showToast('Copied: ' + text, 'success');
                    } else {
                        ctx.showToast(text, 'info');
                    }
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'cycle-messages',
            name: 'Cycle Through Messages',
            icon: '🔄',
            settings: [
                { key: 'id', label: 'Unique ID for this button', type: 'text', placeholder: 'my-cycle-btn-1' },
                { key: 'messages', label: 'Messages (one per line)', type: 'textarea', placeholder: 'Message 1\nMessage 2\nMessage 3' },
                { key: 'icon', label: 'Icon', type: 'text', placeholder: '💬', default: '💬' }
            ],
            getState(s, ctx) {
                const key = s.id || 'cycle-default';
                const lines = (s.messages || '').split('\n').map(l => l.trim()).filter(l => l);
                if (lines.length === 0) return { label: '(no messages)', icon: s.icon || '💬' };
                const idx = (_notesState[key] && _notesState[key].index) || 0;
                const current = lines[idx % lines.length];
                return { label: current, icon: s.icon || '💬' };
            },
            async execute(s, ctx) {
                try {
                    const key = s.id || 'cycle-default';
                    const lines = (s.messages || '').split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length === 0) {
                        ctx.showToast('No messages configured', 'info');
                        return;
                    }
                    if (!_notesState[key]) _notesState[key] = { index: 0 };
                    const idx = _notesState[key].index % lines.length;
                    const current = lines[idx];
                    ctx.showToast(current, 'info');
                    _notesState[key].index = (idx + 1) % lines.length;
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'clipboard-save',
            name: 'Save to Clipboard Note',
            icon: '📋',
            settings: [
                { key: 'text', label: 'Text to copy', type: 'text', placeholder: 'Text to copy to clipboard' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.text) {
                        ctx.showToast('No text configured', 'info');
                        return;
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(s.text);
                        ctx.showToast('Copied to clipboard', 'success');
                    } else {
                        // Fallback
                        const ta = document.createElement('textarea');
                        ta.value = s.text;
                        ta.style.position = 'fixed';
                        ta.style.opacity = '0';
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        ctx.showToast('Copied to clipboard', 'success');
                    }
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'random-message',
            name: 'Random Message',
            icon: '🎲',
            settings: [
                { key: 'messages', label: 'Messages (one per line)', type: 'textarea', placeholder: 'Message 1\nMessage 2\nMessage 3' },
                { key: 'icon', label: 'Icon', type: 'text', placeholder: '🎲', default: '🎲' }
            ],
            getState(s, ctx) {
                return { label: 'Random', icon: s.icon || '🎲' };
            },
            async execute(s, ctx) {
                try {
                    const lines = (s.messages || '').split('\n').map(l => l.trim()).filter(l => l);
                    if (lines.length === 0) {
                        ctx.showToast('No messages configured', 'info');
                        return;
                    }
                    const picked = lines[Math.floor(Math.random() * lines.length)];
                    ctx.showToast(picked, 'info');
                    if (typeof sendChatMessage !== 'undefined') {
                        try { sendChatMessage(picked); } catch (e) {}
                    }
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'checklist-item',
            name: 'Checklist Toggle',
            icon: '✅',
            settings: [
                { key: 'id', label: 'Unique ID for this item', type: 'text', placeholder: 'checklist-item-1' },
                { key: 'label', label: 'Item label', type: 'text', placeholder: 'Task name' },
                { key: 'checkedIcon', label: 'Checked icon', type: 'text', placeholder: '✅', default: '✅' },
                { key: 'uncheckedIcon', label: 'Unchecked icon', type: 'text', placeholder: '⬜', default: '⬜' }
            ],
            getState(s, ctx) {
                const key = s.id || ('checklist-' + (s.label || 'default'));
                const checked = _notesState[key] && _notesState[key].checked;
                if (checked) {
                    return {
                        icon: s.checkedIcon || '✅',
                        label: s.label || 'Done',
                        color: '#166534'
                    };
                }
                return {
                    icon: s.uncheckedIcon || '⬜',
                    label: s.label || 'Task',
                    color: '#374151'
                };
            },
            async execute(s, ctx) {
                try {
                    const key = s.id || ('checklist-' + (s.label || 'default'));
                    if (!_notesState[key]) _notesState[key] = { checked: false };
                    _notesState[key].checked = !_notesState[key].checked;
                    const checked = _notesState[key].checked;
                    ctx.showToast((s.label || 'Item') + ': ' + (checked ? 'Done' : 'Not done'), 'info');
                    ctx.refreshAllButtons();
                } catch (e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
