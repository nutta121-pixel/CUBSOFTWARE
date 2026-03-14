/* ─── Social Media Plugin ─── */

CubDeck.registerPlugin({
    id: 'social',
    name: 'Social Media',
    icon: '🌐',
    actions: [
        {
            id: 'post-mastodon',
            name: 'Post to Mastodon',
            icon: '🐘',
            settings: [
                { key: 'instance', label: 'Mastodon instance', type: 'text', placeholder: 'mastodon.social' },
                { key: 'token', label: 'Access Token', type: 'text', placeholder: 'your-access-token' },
                { key: 'text', label: 'Post text', type: 'textarea', placeholder: 'Hello Mastodon!' },
                { key: 'visibility', label: 'Visibility', type: 'select', options: [
                    { value: 'public', label: 'Public' },
                    { value: 'unlisted', label: 'Unlisted' },
                    { value: 'private', label: 'Followers only' }
                ]}
            ],
            async execute(s, ctx) {
                try {
                    if (!s.instance) throw new Error('Instance required');
                    if (!s.token) throw new Error('Access token required');
                    if (!s.text) throw new Error('Post text required');
                    const r = await fetch('https://' + s.instance + '/api/v1/statuses', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + s.token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ status: s.text, visibility: s.visibility || 'public' })
                    });
                    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error || 'Post failed'); }
                    ctx.showToast('Posted to Mastodon!', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'post-bluesky',
            name: 'Post to Bluesky',
            icon: '🦋',
            settings: [
                { key: 'handle', label: 'Bluesky handle', type: 'text', placeholder: 'user.bsky.social' },
                { key: 'password', label: 'App password', type: 'text', placeholder: 'xxxx-xxxx-xxxx-xxxx' },
                { key: 'text', label: 'Post text', type: 'textarea', placeholder: 'Hello Bluesky!' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.handle) throw new Error('Handle required');
                    if (!s.password) throw new Error('App password required');
                    if (!s.text) throw new Error('Post text required');
                    const sessionResp = await fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ identifier: s.handle, password: s.password })
                    });
                    if (!sessionResp.ok) { const e = await sessionResp.json().catch(() => ({})); throw new Error(e.message || 'Auth failed'); }
                    const session = await sessionResp.json();
                    const postResp = await fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + session.accessJwt,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            repo: session.did,
                            collection: 'app.bsky.feed.post',
                            record: {
                                '$type': 'app.bsky.feed.post',
                                text: s.text,
                                createdAt: new Date().toISOString()
                            }
                        })
                    });
                    if (!postResp.ok) { const e = await postResp.json().catch(() => ({})); throw new Error(e.message || 'Post failed'); }
                    ctx.showToast('Posted to Bluesky!', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'post-discord-webhook',
            name: 'Discord Webhook Message',
            icon: '💬',
            settings: [
                { key: 'webhookUrl', label: 'Discord Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
                { key: 'content', label: 'Message', type: 'text', placeholder: 'Hello from CubDeck!' },
                { key: 'username', label: 'Bot username override', type: 'text', placeholder: 'CubDeck' },
                { key: 'embedTitle', label: 'Embed title (blank=no embed)', type: 'text', placeholder: '' },
                { key: 'embedColor', label: 'Embed color hex', type: 'text', default: '5865f2' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.webhookUrl) throw new Error('Webhook URL required');
                    const body = {};
                    if (s.content) body.content = s.content;
                    if (s.username) body.username = s.username;
                    if (s.embedTitle) {
                        body.embeds = [{ title: s.embedTitle, color: parseInt(s.embedColor || '5865f2', 16) }];
                    }
                    const r = await fetch(s.webhookUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    if (!r.ok && r.status !== 204) { const e = await r.json().catch(() => ({})); throw new Error(e.message || 'Webhook failed'); }
                    ctx.showToast('Discord message sent', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'post-telegram',
            name: 'Send Telegram Message',
            icon: '✈️',
            settings: [
                { key: 'botToken', label: 'Bot Token (from BotFather)', type: 'text', placeholder: '123456789:AAB...' },
                { key: 'chatId', label: 'Chat ID or @channel', type: 'text', placeholder: '@mychannel or 123456789' },
                { key: 'text', label: 'Message text', type: 'textarea', placeholder: 'Hello Telegram!' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.botToken) throw new Error('Bot token required');
                    if (!s.chatId) throw new Error('Chat ID required');
                    if (!s.text) throw new Error('Message text required');
                    const r = await fetch('https://api.telegram.org/bot' + s.botToken + '/sendMessage', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: s.chatId, text: s.text, parse_mode: 'HTML' })
                    });
                    if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.description || 'Send failed'); }
                    ctx.showToast('Telegram message sent', 'success');
                } catch(e) {
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        },
        {
            id: 'share-web',
            name: 'Web Share',
            icon: '↗️',
            settings: [
                { key: 'title', label: 'Share title', type: 'text', placeholder: 'Check this out!' },
                { key: 'text', label: 'Share text', type: 'text', placeholder: 'Come watch my stream' },
                { key: 'url', label: 'URL to share', type: 'text', placeholder: 'https://twitch.tv/yourchannel' }
            ],
            async execute(s, ctx) {
                try {
                    if (!navigator.share) throw new Error('Web Share not supported in this browser');
                    await navigator.share({ title: s.title || '', text: s.text || '', url: s.url || '' });
                    ctx.showToast('Shared!', 'success');
                } catch(e) {
                    if (e.name === 'AbortError') return;
                    ctx.showToast('Error: ' + e.message, 'error');
                }
            }
        }
    ]
});
