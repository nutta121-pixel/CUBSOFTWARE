/* ─── Discord Plugin ─── */
// Discord Webhook + Bot API integration

CubDeck.registerPlugin({
    id: 'discord',
    name: 'Discord',
    icon: '🔵',
    actions: [
        {
            id: 'webhook-message',
            name: 'Send Webhook Message',
            settings: [
                { key: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
                { key: 'content', label: 'Message', type: 'textarea', placeholder: 'Stream is live!' },
                { key: 'username', label: 'Bot username (optional)', type: 'text', placeholder: 'CubDeck' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.webhook_url) throw new Error('Webhook URL required');
                    if (!s.content) throw new Error('Message required');
                    const body = { content: s.content };
                    if (s.username) body.username = s.username;
                    const r = await fetch(s.webhook_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    if (r.status === 204 || r.ok) {
                        ctx.showToast('Discord message sent', 'success');
                    } else {
                        throw new Error('HTTP ' + r.status);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'webhook-embed',
            name: 'Send Embed via Webhook',
            settings: [
                { key: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
                { key: 'title', label: 'Embed title', type: 'text', placeholder: 'Stream is live!' },
                { key: 'description', label: 'Embed description', type: 'textarea', placeholder: 'Come watch at twitch.tv/...' },
                { key: 'color', label: 'Color (hex without #)', type: 'text', placeholder: '9147ff' },
                { key: 'url', label: 'URL (optional)', type: 'text', placeholder: 'https://twitch.tv/...' },
                { key: 'username', label: 'Bot username (optional)', type: 'text', placeholder: 'CubDeck' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.webhook_url) throw new Error('Webhook URL required');
                    const embed = {};
                    if (s.title) embed.title = s.title;
                    if (s.description) embed.description = s.description;
                    if (s.color) embed.color = parseInt(s.color.replace('#', ''), 16);
                    if (s.url) embed.url = s.url;
                    const body = { embeds: [embed] };
                    if (s.username) body.username = s.username;
                    const r = await fetch(s.webhook_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    if (r.status === 204 || r.ok) {
                        ctx.showToast('Discord embed sent', 'success');
                    } else {
                        throw new Error('HTTP ' + r.status);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'bot-message',
            name: 'Bot: Send Message to Channel',
            settings: [
                { key: 'bot_token', label: 'Bot Token', type: 'text', placeholder: 'Your Discord bot token' },
                { key: 'channel_id', label: 'Channel ID', type: 'text', placeholder: '123456789012345678' },
                { key: 'content', label: 'Message', type: 'textarea', placeholder: 'Stream is live! Come join us.' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.bot_token || !s.channel_id || !s.content) throw new Error('Token, channel ID and message required');
                    const r = await fetch(`https://discord.com/api/v10/channels/${s.channel_id}/messages`, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bot ' + s.bot_token,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ content: s.content })
                    });
                    if (r.ok) {
                        ctx.showToast('Discord bot message sent', 'success');
                    } else {
                        const err = await r.json().catch(() => ({}));
                        throw new Error(err.message || 'HTTP ' + r.status);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'bot-react',
            name: 'Bot: React to Last Message',
            settings: [
                { key: 'bot_token', label: 'Bot Token', type: 'text', placeholder: 'Your Discord bot token' },
                { key: 'channel_id', label: 'Channel ID', type: 'text', placeholder: '123456789012345678' },
                { key: 'emoji', label: 'Emoji (unicode or name:id)', type: 'text', placeholder: '🎉 or name:id' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.bot_token || !s.channel_id) throw new Error('Token and channel ID required');
                    // Get last message
                    const msgs = await fetch(`https://discord.com/api/v10/channels/${s.channel_id}/messages?limit=1`, {
                        headers: { 'Authorization': 'Bot ' + s.bot_token }
                    }).then(r => r.json());
                    if (!msgs.length) throw new Error('No messages found');
                    const msgId = msgs[0].id;
                    const emoji = encodeURIComponent(s.emoji || '🎉');
                    const r = await fetch(`https://discord.com/api/v10/channels/${s.channel_id}/messages/${msgId}/reactions/${emoji}/@me`, {
                        method: 'PUT',
                        headers: { 'Authorization': 'Bot ' + s.bot_token }
                    });
                    if (r.status === 204 || r.ok) {
                        ctx.showToast('Reaction added!', 'success');
                    } else {
                        throw new Error('HTTP ' + r.status);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'go-live-announce',
            name: 'Go-Live Announcement',
            settings: [
                { key: 'webhook_url', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
                { key: 'channel_name', label: 'Twitch channel name', type: 'text', placeholder: 'yourchannel' },
                { key: 'message', label: 'Custom message', type: 'textarea', placeholder: '@here I\'m live now! Come hang out' },
                { key: 'role_id', label: 'Role to ping (ID, optional)', type: 'text', placeholder: '123456789' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.webhook_url) throw new Error('Webhook URL required');
                    const channel = s.channel_name || ctx.config?.twitch_channel || '';
                    let content = s.message || 'Stream is live!';
                    if (s.role_id) content = `<@&${s.role_id}> ${content}`;
                    const embed = {
                        title: '🔴 Now Live!',
                        description: content,
                        color: 0x9147ff,
                        fields: channel ? [{ name: 'Watch live', value: `https://twitch.tv/${channel}`, inline: true }] : []
                    };
                    const r = await fetch(s.webhook_url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ embeds: [embed] })
                    });
                    if (r.status === 204 || r.ok) {
                        ctx.showToast('Go-live announcement sent!', 'success');
                    } else {
                        throw new Error('HTTP ' + r.status);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
