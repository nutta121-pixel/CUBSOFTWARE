/* ─── Webhooks Plugin ─── */
CubDeck.registerPlugin({
    id: 'webhooks',
    name: 'Webhooks',
    icon: '🌐',
    actions: [
        {
            id: 'http-get',
            name: 'HTTP GET Request',
            icon: '📥',
            settings: [
                { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/action' },
                { key: 'success_msg', label: 'Success message (optional)', type: 'text', placeholder: 'Done!' }
            ],
            async execute(s, ctx) {
                if (!s.url) throw new Error('URL required');
                const r = await fetch(s.url, { mode: 'no-cors' });
                ctx.showToast(s.success_msg || 'Request sent', 'success');
            }
        },
        {
            id: 'http-post',
            name: 'HTTP POST Request',
            icon: '📤',
            settings: [
                { key: 'url', label: 'URL', type: 'text', placeholder: 'https://api.example.com/action' },
                { key: 'body', label: 'Body (JSON or plain text)', type: 'text', placeholder: '{"key":"value"}' },
                { key: 'content_type', label: 'Content-Type', type: 'select', options: [
                    { value: 'application/json', label: 'JSON' },
                    { value: 'text/plain', label: 'Plain Text' },
                    { value: 'application/x-www-form-urlencoded', label: 'Form Data' }
                ], default: 'application/json' },
                { key: 'success_msg', label: 'Success message (optional)', type: 'text', placeholder: '' }
            ],
            async execute(s, ctx) {
                if (!s.url) throw new Error('URL required');
                await fetch(s.url, {
                    method: 'POST',
                    mode: 'no-cors',
                    headers: { 'Content-Type': s.content_type || 'application/json' },
                    body: s.body || ''
                });
                ctx.showToast(s.success_msg || 'Request sent', 'success');
            }
        },
        {
            id: 'discord-webhook',
            name: 'Discord Webhook Message',
            icon: '🎮',
            settings: [
                { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
                { key: 'message', label: 'Message', type: 'text', placeholder: 'Stream is live!' },
                { key: 'username', label: 'Bot Username (optional)', type: 'text', placeholder: 'CubDeck' }
            ],
            async execute(s, ctx) {
                if (!s.url || !s.message) throw new Error('URL and message required');
                await fetch(s.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: s.message,
                        username: s.username || 'CubDeck'
                    })
                });
                ctx.showToast('Discord message sent!', 'success');
            }
        },
        {
            id: 'discord-embed',
            name: 'Discord Webhook Embed',
            icon: '📋',
            settings: [
                { key: 'url', label: 'Webhook URL', type: 'text', placeholder: 'https://discord.com/api/webhooks/...' },
                { key: 'title', label: 'Embed Title', type: 'text', placeholder: 'Stream Update' },
                { key: 'description', label: 'Embed Description', type: 'text', placeholder: 'Just went live!' },
                { key: 'color', label: 'Color (hex without #)', type: 'text', placeholder: '5865f2' }
            ],
            async execute(s, ctx) {
                if (!s.url) throw new Error('Webhook URL required');
                const color = parseInt((s.color || '5865f2').replace('#', ''), 16);
                await fetch(s.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        embeds: [{ title: s.title || '', description: s.description || '', color }]
                    })
                });
                ctx.showToast('Embed sent!', 'success');
            }
        },
        {
            id: 'ifttt-trigger',
            name: 'IFTTT Webhook Trigger',
            icon: '⚡',
            settings: [
                { key: 'key', label: 'IFTTT Webhook Key', type: 'text', placeholder: 'your_key_here' },
                { key: 'event', label: 'Event Name', type: 'text', placeholder: 'my_event' },
                { key: 'value1', label: 'Value 1 (optional)', type: 'text', placeholder: '' },
                { key: 'value2', label: 'Value 2 (optional)', type: 'text', placeholder: '' }
            ],
            async execute(s, ctx) {
                if (!s.key || !s.event) throw new Error('Key and event name required');
                await fetch(`https://maker.ifttt.com/trigger/${s.event}/with/key/${s.key}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value1: s.value1 || '', value2: s.value2 || '' })
                });
                ctx.showToast('IFTTT triggered!', 'success');
            }
        },
        {
            id: 'make-webhook',
            name: 'Make (Integromat) Webhook',
            icon: '🔗',
            settings: [
                { key: 'url', label: 'Make Webhook URL', type: 'text', placeholder: 'https://hook.eu1.make.com/...' },
                { key: 'data', label: 'JSON Data (optional)', type: 'text', placeholder: '{"event":"clicked"}' }
            ],
            async execute(s, ctx) {
                if (!s.url) throw new Error('Webhook URL required');
                let body = s.data || '{}';
                await fetch(s.url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body
                });
                ctx.showToast('Make webhook triggered!', 'success');
            }
        },
        {
            id: 'streamelements-bot',
            name: 'StreamElements Bot Command',
            icon: '🤖',
            settings: [
                { key: 'command', label: 'Command', type: 'text', placeholder: '!uptime' }
            ],
            async execute(s) {
                if (!s.command) throw new Error('Command required');
                sendChatMessage(s.command);
            }
        },
        {
            id: 'nightbot-command',
            name: 'Nightbot Command',
            icon: '🌙',
            settings: [
                { key: 'command', label: 'Command', type: 'text', placeholder: '!schedule' }
            ],
            async execute(s) {
                if (!s.command) throw new Error('Command required');
                sendChatMessage(s.command);
            }
        }
    ]
});
