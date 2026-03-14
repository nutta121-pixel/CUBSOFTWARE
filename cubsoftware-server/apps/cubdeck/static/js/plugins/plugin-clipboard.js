/* ─── Clipboard & Quick Text Plugin ─── */
// Quick text snippets, clipboard copy, type-to-chat shortcuts

CubDeck.registerPlugin({
    id: 'clipboard',
    name: 'Clipboard & Snippets',
    icon: '📋',
    actions: [
        {
            id: 'copy-text',
            name: 'Copy Text to Clipboard',
            settings: [
                { key: 'text', label: 'Text to copy', type: 'textarea', placeholder: 'https://twitch.tv/yourchannel' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.text) throw new Error('Text required');
                    await navigator.clipboard.writeText(s.text);
                    ctx.showToast('Copied to clipboard', 'success');
                } catch (e) { ctx.showToast('Clipboard error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'paste-to-chat',
            name: 'Send Text to Twitch Chat',
            settings: [
                { key: 'text', label: 'Message to send', type: 'textarea', placeholder: 'Check out my socials: ...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.text) throw new Error('Text required');
                    if (typeof sendChatMessage !== 'function') throw new Error('Twitch chat not connected');
                    sendChatMessage(s.text);
                    ctx.showToast('Sent to chat', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'copy-stream-url',
            name: 'Copy Twitch URL',
            settings: [],
            async execute(s, ctx) {
                try {
                    const channel = ctx.config?.twitch_channel;
                    if (!channel) throw new Error('No Twitch channel set in settings');
                    const url = 'https://twitch.tv/' + channel;
                    await navigator.clipboard.writeText(url);
                    ctx.showToast('Copied: ' + url, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'read-clipboard',
            name: 'Read Clipboard',
            settings: [
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'show', label: 'Show in toast' },
                    { value: 'chat', label: 'Send to Twitch chat' }
                ], default: 'show' }
            ],
            async execute(s, ctx) {
                try {
                    const text = await navigator.clipboard.readText();
                    if (!text) return ctx.showToast('Clipboard is empty', 'info');
                    if (s.action === 'chat' && typeof sendChatMessage === 'function') {
                        sendChatMessage(text.slice(0, 500)); // safety limit
                        ctx.showToast('Clipboard sent to chat', 'success');
                    } else {
                        ctx.showToast('Clipboard: ' + text.slice(0, 200), 'info');
                    }
                } catch (e) { ctx.showToast('Cannot read clipboard: ' + e.message, 'error'); }
            }
        },
        {
            id: 'multi-snippet',
            name: 'Cycle Through Snippets',
            settings: [
                { key: 'snippets', label: 'Snippets (one per line)', type: 'textarea', placeholder: 'Follow me!\nSub for perks!\nDiscord: discord.gg/...' },
                { key: 'action', label: 'Action', type: 'select', options: [
                    { value: 'chat', label: 'Send to Twitch chat' },
                    { value: 'copy', label: 'Copy to clipboard' },
                    { value: 'both', label: 'Both' }
                ], default: 'chat' }
            ],
            _idx: 0,
            getState(s, ctx) {
                const snippets = (s.snippets || '').split('\n').filter(Boolean);
                const idx = this._idx % Math.max(snippets.length, 1);
                return { label: snippets[idx] ? snippets[idx].slice(0, 30) : 'Cycle Snippets', icon: '📋' };
            },
            async execute(s, ctx) {
                try {
                    const snippets = (s.snippets || '').split('\n').filter(Boolean);
                    if (snippets.length === 0) throw new Error('Add snippets first');
                    this._idx = (this._idx || 0) % snippets.length;
                    const text = snippets[this._idx];
                    this._idx = (this._idx + 1) % snippets.length;
                    if ((s.action === 'chat' || s.action === 'both') && typeof sendChatMessage === 'function') {
                        sendChatMessage(text);
                    }
                    if (s.action === 'copy' || s.action === 'both') {
                        await navigator.clipboard.writeText(text);
                    }
                    ctx.showToast(text.slice(0, 100), 'success');
                    ctx.refreshAllButtons();
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'social-links',
            name: 'Social Links to Chat',
            settings: [
                { key: 'links', label: 'Links/socials (one per line)', type: 'textarea', placeholder: 'Twitter: @handle\nDiscord: discord.gg/xxx\nYouTube: youtube.com/@channel' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.links) throw new Error('Add links first');
                    if (typeof sendChatMessage !== 'function') throw new Error('Twitch chat not connected');
                    sendChatMessage('My socials: ' + s.links.split('\n').filter(Boolean).join(' | '));
                    ctx.showToast('Social links sent to chat', 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
