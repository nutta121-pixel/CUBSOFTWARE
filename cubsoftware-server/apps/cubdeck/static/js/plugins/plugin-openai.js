/* ─── OpenAI / ChatGPT Plugin ─── */
// Requires an OpenAI API key (platform.openai.com)

const _openaiHistory = []; // conversation history

CubDeck.registerPlugin({
    id: 'openai',
    name: 'OpenAI / ChatGPT',
    icon: '🧠',
    actions: [
        {
            id: 'chat-response',
            name: 'Generate Chat Response',
            settings: [
                { key: 'api_key', label: 'OpenAI API Key', type: 'text', placeholder: 'sk-...' },
                { key: 'prompt', label: 'Prompt', type: 'textarea', placeholder: 'Respond with a fun fact about streaming' },
                { key: 'model', label: 'Model', type: 'select', options: [
                    { value: 'gpt-4o-mini', label: 'GPT-4o Mini (fast, cheap)' },
                    { value: 'gpt-4o', label: 'GPT-4o (most capable)' },
                    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (legacy)' }
                ], default: 'gpt-4o-mini' },
                { key: 'to_chat', label: 'Send response to Twitch chat', type: 'select', options: [
                    { value: '0', label: 'No — show toast only' },
                    { value: '1', label: 'Yes — post to chat' }
                ], default: '0' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key) throw new Error('OpenAI API key required');
                    if (!s.prompt) throw new Error('Prompt required');
                    ctx.showToast('Asking ChatGPT...', 'info');
                    const r = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + s.api_key,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            model: s.model || 'gpt-4o-mini',
                            messages: [{ role: 'user', content: s.prompt }],
                            max_tokens: 150,
                            temperature: 0.8
                        })
                    });
                    if (!r.ok) {
                        const err = await r.json().catch(() => ({}));
                        throw new Error(err.error?.message || 'API error ' + r.status);
                    }
                    const data = await r.json();
                    const response = data.choices?.[0]?.message?.content?.trim() || '';
                    ctx.showToast(response, 'info');
                    if (s.to_chat === '1' && typeof sendChatMessage === 'function') {
                        // Split long responses if needed
                        const parts = response.match(/.{1,450}/g) || [];
                        for (const part of parts.slice(0, 3)) sendChatMessage(part);
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'auto-title',
            name: 'Auto-Generate Stream Title',
            settings: [
                { key: 'api_key', label: 'OpenAI API Key', type: 'text', placeholder: 'sk-...' },
                { key: 'context', label: 'Context (game, vibe, etc.)', type: 'text', placeholder: 'Playing Minecraft, chill vibes, building a castle' },
                { key: 'apply', label: 'Apply to Twitch stream title', type: 'select', options: [
                    { value: '0', label: 'Show only' }, { value: '1', label: 'Apply to Twitch' }
                ], default: '0' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key) throw new Error('OpenAI API key required');
                    ctx.showToast('Generating title...', 'info');
                    const r = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + s.api_key, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'gpt-4o-mini',
                            messages: [{ role: 'user', content: `Generate one catchy Twitch stream title (max 60 chars, no quotes) for: ${s.context || 'gaming stream'}` }],
                            max_tokens: 60,
                            temperature: 1.0
                        })
                    });
                    if (!r.ok) throw new Error('API error ' + r.status);
                    const data = await r.json();
                    const title = data.choices?.[0]?.message?.content?.trim().replace(/^"|"$/g, '') || '';
                    ctx.showToast('Title: ' + title, 'info');
                    if (s.apply === '1' && title && typeof _twitchApi === 'function') {
                        const oauth = ctx.config.twitch_oauth;
                        const user = await _getTwitchUserId(oauth);
                        await _twitchApi('PATCH', '/channels?broadcaster_id=' + user.id, { title }, oauth);
                        ctx.showToast('Title updated: ' + title, 'success');
                    }
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'chat-moderation',
            name: 'AI Chat Comment',
            settings: [
                { key: 'api_key', label: 'OpenAI API Key', type: 'text', placeholder: 'sk-...' },
                { key: 'system', label: 'AI personality / system prompt', type: 'textarea', placeholder: 'You are a friendly, funny Twitch chat bot. Keep responses under 100 chars.' },
                { key: 'message', label: 'Message to respond to', type: 'textarea', placeholder: 'That was an amazing play!' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key) throw new Error('API key required');
                    if (!s.message) throw new Error('Message required');
                    const r = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + s.api_key, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'gpt-4o-mini',
                            messages: [
                                { role: 'system', content: s.system || 'You are a friendly Twitch chat bot. Keep responses under 100 characters.' },
                                { role: 'user', content: s.message }
                            ],
                            max_tokens: 100,
                            temperature: 0.9
                        })
                    });
                    if (!r.ok) throw new Error('API error ' + r.status);
                    const data = await r.json();
                    const response = data.choices?.[0]?.message?.content?.trim() || '';
                    if (typeof sendChatMessage === 'function') sendChatMessage(response);
                    ctx.showToast('AI responded: ' + response, 'success');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        },
        {
            id: 'fun-fact',
            name: 'Random Fun Fact to Chat',
            settings: [
                { key: 'api_key', label: 'OpenAI API Key', type: 'text', placeholder: 'sk-...' },
                { key: 'topic', label: 'Topic (optional)', type: 'text', placeholder: 'gaming, space, animals...' }
            ],
            async execute(s, ctx) {
                try {
                    if (!s.api_key) throw new Error('API key required');
                    const topic = s.topic ? `about ${s.topic}` : '';
                    const r = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: { 'Authorization': 'Bearer ' + s.api_key, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model: 'gpt-4o-mini',
                            messages: [{ role: 'user', content: `Give me one short interesting fun fact ${topic} in one sentence, starting with "Did you know:"` }],
                            max_tokens: 100,
                            temperature: 1.0
                        })
                    });
                    if (!r.ok) throw new Error('API error ' + r.status);
                    const data = await r.json();
                    const fact = data.choices?.[0]?.message?.content?.trim() || '';
                    if (typeof sendChatMessage === 'function') sendChatMessage('🧠 ' + fact);
                    ctx.showToast(fact, 'info');
                } catch (e) { ctx.showToast('Error: ' + e.message, 'error'); }
            }
        }
    ]
});
