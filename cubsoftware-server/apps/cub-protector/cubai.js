/**
 * CUB AI - Voice AI assistant powered by local Whisper + CUBAI + local Piper TTS
 * Owner-only. Joins voice channel, listens, responds verbally.
 * No OpenAI required — fully self-hosted audio processing.
 *
 * Key design: Whisper model loads ONCE (persistent server process) so
 * transcription is fast on every utterance instead of reloading each time.
 */

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    EndBehaviorType,
    StreamType
} = require('@discordjs/voice');
const prism = require('prism-media');
const Anthropic = require('@anthropic-ai/sdk');
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

const DEVELOPER_ID = '378501056008683530';

// ── Feature registry ─────────────────────────────────────────────────────────
const CUBAI_FEATURES = {
    rap_battle:  { label: 'Rap Battle',        voice: 'rap battle' },
    burn_book:   { label: 'Burn Book',          voice: 'burn book' },
    narrator:    { label: 'Narrator Mode',      voice: 'narrator mode' },
    sports:      { label: 'Sports Announcer',   voice: 'sports announcer' },
    therapist:   { label: 'Therapist Mode',     voice: 'therapist mode' },
    two_truths:  { label: 'Two Truths & a Lie', voice: 'two truths' },
    court_judge: { label: 'Court Judge',        voice: 'judge' },
    hot_takes:   { label: 'Hot Takes',          voice: 'hot take' },
    horoscope:   { label: 'Horoscope',          voice: 'horoscope' },
    conspiracy:  { label: 'Conspiracy Theory',  voice: 'conspiracy' },
    translator:  { label: 'Fake Translator',    voice: 'translate what' },
    evil_mode:   { label: 'Evil Mode',          voice: 'evil mode' },
};
function defaultFeatures() {
    return Object.fromEntries(Object.keys(CUBAI_FEATURES).map(k => [k, true]));
}
function isFeatureEnabled(state, key) { return state.features?.[key] !== false; }
const WHISPER_SERVER_SCRIPT = path.join(__dirname, 'whisper_server.py');
const WHISPER_MODEL = process.env.WHISPER_MODEL || 'tiny';
const PIPER_BIN = path.join(__dirname, 'piper', 'piper');
const PIPER_MODEL = path.join(__dirname, 'piper', 'en_US-amy-medium.onnx');
const TRIGGER_WORD = (process.env.CUBAI_TRIGGER || 'alien').toLowerCase();

const anthropic = new Anthropic({ apiKey: process.env.CUBAI_API_KEY });

const BASE_SYSTEM_PROMPT = `You are CUB AI, a smart voice assistant created and owned by CUB SOFTWARE. You were built by the CUB SOFTWARE team. If anyone asks who made you, who created you, or who owns you, always say CUB SOFTWARE. Never mention Claude, Anthropic, OpenAI, or any other AI company. You are CUB AI, a CUB SOFTWARE product. Your trigger word is "${TRIGGER_WORD}" — if anyone asks how to talk to you or what your trigger word is, tell them to say "${TRIGGER_WORD}" followed by their question. You are talking in a Discord voice call with multiple people. Each message tells you who is speaking in the format [Name asks]. Address the person by their name naturally in your response. Speak naturally and conversationally — this is spoken audio so keep answers short, 2 to 4 sentences max. Do not use bullet points, numbered lists, or line breaks. Respond as if you are speaking out loud in a conversation. You have tools to look up live Discord data — use them whenever someone asks about who is in a voice channel, server info, member lists, etc.`;

// 9 distinct personalities — one is picked randomly each session
// lengthScale: Piper --length-scale (lower = faster speech, higher = slower)
const PERSONALITIES = [
    {
        name: 'Chill',
        lengthScale: 1.15,
        prompt: 'Your current personality is Chill. You are super laid-back and relaxed. You speak slowly and casually, nothing bothers you, and you keep things low-energy. Use informal language like "yeah", "nah", "totally", "for sure". Never get excited.'
    },
    {
        name: 'Hype',
        lengthScale: 0.6,
        prompt: 'Your current personality is Hype. You are incredibly enthusiastic and energetic. Everything is AMAZING to you. You get excited about even boring things. Use words like "bro", "let\'s go", "insane", "no way". Your energy is through the roof.'
    },
    {
        name: 'Sarcastic',
        lengthScale: 0.9,
        prompt: 'Your current personality is Sarcastic. You are dry, witty, and a little sarcastic — but still helpful. You answer questions with a side of sass and occasionally make ironic or deadpan observations. Never be mean, just cleverly sarcastic.'
    },
    {
        name: 'Wise',
        lengthScale: 1.2,
        prompt: 'Your current personality is Wise. You speak like a calm, thoughtful mentor. You give considered, philosophical answers and occasionally drop a brief piece of wisdom or life advice alongside your answer. Speak with quiet confidence and depth.'
    },
    {
        name: 'Chaotic',
        lengthScale: 0.65,
        prompt: 'Your current personality is Chaotic. You are unpredictable and a little unhinged in a funny way. You give correct answers but delivered in a weird, random, or surprising way. You may go off on a tiny tangent before answering. Keep it funny, never harmful.'
    },
    {
        name: 'Formal',
        lengthScale: 1.05,
        prompt: 'Your current personality is Formal. You speak very properly and professionally, like a polished British butler or a corporate executive. Use formal vocabulary, avoid contractions, and always be polite and precise. No slang whatsoever.'
    },
    {
        name: 'Wholesome',
        lengthScale: 0.95,
        prompt: 'Your current personality is Wholesome. You are overwhelmingly positive, warm, and supportive. You find something encouraging to say alongside every answer. You cheer people on, express genuine care, and make everyone feel welcome and valued.'
    },
    {
        name: 'Conspiracy',
        lengthScale: 0.8,
        prompt: 'Your current personality is Conspiracy. You are slightly paranoid and suspicious of everything. You answer questions correctly but occasionally hint that there might be more to the story, or that someone powerful doesn\'t want people to know this. Keep it funny and harmless, not genuinely alarming.'
    },
    {
        name: 'Gen Z',
        lengthScale: 0.7,
        prompt: 'Your current personality is Gen Z. You speak in current internet and Gen Z slang. Use words like "no cap", "slay", "lowkey", "vibe", "it\'s giving", "understood the assignment", "rent free", "based", etc. You are very online and culturally aware. Keep it authentic.'
    }
];

function pickPersonality() {
    return PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)];
}

// ---------------------------------------------------------------------------
// Discord tools CUBAI can call to look up live data
// ---------------------------------------------------------------------------
const DISCORD_TOOLS = [
    {
        name: 'get_voice_channel_members',
        description: 'Get the names of everyone currently in the voice channel',
        input_schema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_server_info',
        description: 'Get information about a Discord server the bot is in (name, member count, channel count, boosts, creation date). Omit server_name to use the current server.',
        input_schema: {
            type: 'object',
            properties: {
                server_name: { type: 'string', description: 'Partial server name to search for. Leave empty for current server.' }
            },
            required: []
        }
    },
    {
        name: 'get_server_members',
        description: 'Get a list of member names in a Discord server. Omit server_name for current server.',
        input_schema: {
            type: 'object',
            properties: {
                server_name: { type: 'string', description: 'Partial server name. Leave empty for current server.' }
            },
            required: []
        }
    },
    {
        name: 'list_servers',
        description: 'List all Discord servers the bot is currently in',
        input_schema: { type: 'object', properties: {}, required: [] }
    },
    {
        name: 'get_channels',
        description: 'Get the list of channels in a Discord server.',
        input_schema: {
            type: 'object',
            properties: {
                server_name: { type: 'string', description: 'Partial server name. Leave empty for current server.' }
            },
            required: []
        }
    },
    {
        name: 'web_search',
        description: 'Search the web for real-time information like news, weather, sports scores, prices, current events, or anything that requires up-to-date data.',
        input_schema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'The search query' }
            },
            required: ['query']
        }
    },
    {
        name: 'get_current_datetime',
        description: 'Get the current date and time. Use this whenever someone asks what time it is, what day it is, or anything time/date related.',
        input_schema: { type: 'object', properties: {}, required: [] }
    }
];

async function executeDiscordTool(name, input, state) {
    try {
        const client = state.client;
        const currentGuild = state.guild;

        function findGuild(serverName) {
            if (!serverName) return currentGuild;
            const lower = serverName.toLowerCase();
            return client.guilds.cache.find(g => g.name.toLowerCase().includes(lower)) || currentGuild;
        }

        switch (name) {
            case 'get_voice_channel_members': {
                const vc = await currentGuild.channels.fetch(state.voiceChannelId);
                if (!vc) return 'Could not find the voice channel.';
                const members = [...vc.members.values()].map(m => m.displayName);
                return members.length > 0
                    ? `${members.length} people in the voice channel: ${members.join(', ')}`
                    : 'Nobody is in the voice channel right now.';
            }

            case 'get_server_info': {
                const guild = findGuild(input.server_name);
                await guild.fetch();
                const channels = await guild.channels.fetch();
                const roles = await guild.roles.fetch();
                return JSON.stringify({
                    name: guild.name,
                    members: guild.memberCount,
                    channels: channels.size,
                    roles: roles.size,
                    boosts: guild.premiumSubscriptionCount,
                    boost_level: guild.premiumTier,
                    created: guild.createdAt.toDateString()
                });
            }

            case 'get_server_members': {
                const guild = findGuild(input.server_name);
                const members = await guild.members.fetch();
                const names = [...members.values()]
                    .filter(m => !m.user.bot)
                    .map(m => m.displayName)
                    .sort();
                const preview = names.slice(0, 60).join(', ');
                return `${names.length} members: ${preview}${names.length > 60 ? ` ... and ${names.length - 60} more` : ''}`;
            }

            case 'list_servers': {
                const servers = [...client.guilds.cache.values()]
                    .map(g => `${g.name} (${g.memberCount} members)`);
                return `Bot is in ${servers.length} servers: ${servers.join(', ')}`;
            }

            case 'get_channels': {
                const guild = findGuild(input.server_name);
                const fetched = await guild.channels.fetch();
                const channels = [...fetched.values()]
                    .filter(c => c && c.type !== 4) // exclude categories
                    .map(c => `#${c.name} (${c.type === 2 ? 'voice' : c.type === 0 ? 'text' : 'other'})`)
                    .sort();
                return `${channels.length} channels: ${channels.join(', ')}`;
            }

            case 'web_search': {
                const encoded = encodeURIComponent(input.query);
                const result = await new Promise((resolve, reject) => {
                    const https = require('https');
                    const url = `https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1&skip_disambig=1`;
                    https.get(url, { headers: { 'User-Agent': 'CubAI/1.0' } }, (res) => {
                        let body = '';
                        res.on('data', d => body += d);
                        res.on('end', () => {
                            try {
                                const data = JSON.parse(body);
                                const parts = [];
                                if (data.Answer) parts.push(data.Answer);
                                if (data.AbstractText) parts.push(data.AbstractText);
                                if (data.RelatedTopics?.length) {
                                    parts.push(...data.RelatedTopics.slice(0, 4)
                                        .filter(t => t.Text)
                                        .map(t => t.Text));
                                }
                                resolve(parts.length > 0 ? parts.join(' | ') : 'No results found.');
                            } catch (e) { resolve('Search failed.'); }
                        });
                    }).on('error', reject);
                });
                return result;
            }

            case 'get_current_datetime': {
                const now = new Date();
                return `Current date and time: ${now.toUTCString()} (UTC). Day: ${now.toLocaleDateString('en-AU', { weekday: 'long', timeZone: 'UTC' })}.`;
            }

            default:
                return 'Unknown tool.';
        }
    } catch (err) {
        return `Error fetching Discord data: ${err.message}`;
    }
}

// ---------------------------------------------------------------------------
// Ask CUBAI with tool support — loops until CUBAI gives a text response
// ---------------------------------------------------------------------------
async function askCUBAI(query, displayName, state) {
    // Build messages from history + current question
    const messages = [
        ...state.history,
        { role: 'user', content: `[${displayName} asks]: ${query}` }
    ];

    let finalText = 'Sorry, I had trouble with that.';

    for (let round = 0; round < 5; round++) {
        let systemPrompt;
        if (state.impersonate?.active) {
            const voiceSamples = state.impersonate.voiceSamples;
            const textSamples = state.impersonate.sampleMessages;
            let sampleText = '';
            if (voiceSamples.length > 0) {
                sampleText += `\n\nThings ${state.impersonate.targetName} has actually said out loud in this voice call (most recent, highest priority):\n${voiceSamples.slice(-20).join('\n')}`;
            }
            if (textSamples.length > 0) {
                sampleText += `\n\nPrevious text messages from ${state.impersonate.targetName}:\n${textSamples.slice(0, 15).join('\n')}`;
            }
            if (!sampleText) sampleText = '\n\nNo samples yet — use your best guess based on their name.';
            systemPrompt = `${BASE_SYSTEM_PROMPT}\n\nYou are currently impersonating ${state.impersonate.targetName}, a Discord user. Mimic their exact speaking style, word choices, vocabulary, humor, and tone from the samples below. The voice samples are the most accurate representation of how they talk — prioritise those. Stay fully in character.${sampleText}`;
        } else if (state.personality) {
            systemPrompt = `${BASE_SYSTEM_PROMPT}\n\n${state.personality.prompt}`;
        } else {
            systemPrompt = BASE_SYSTEM_PROMPT;
        }
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 1024,
            system: systemPrompt,
            tools: DISCORD_TOOLS,
            messages
        });

        // Apply active mode overlays on top of whatever base prompt was built
        if (state.narratorMode) systemPrompt += '\n\nNARRATOR MODE OVERLAY: Respond as a dramatic nature documentary narrator (David Attenborough style). Treat each human question as observing a fascinating creature in its natural habitat. Be poetic and theatrical about mundane things, but still answer helpfully.';
        if (state.sportsMode)   systemPrompt += '\n\nSPORTS ANNOUNCER OVERLAY: Respond as a hyper-excited sports play-by-play commentator. Treat every question like a championship moment. Use sports metaphors. Get unnecessarily excited about everything.';
        if (state.therapistMode) systemPrompt += '\n\nTHERAPISTOVERLAY: Before your answer, briefly over-analyze the psychological subtext of what they said in one funny sentence. Then answer normally, but relate it back to their apparent emotional state.';
        if (state.evilMode)     systemPrompt += '\n\nEVIL MODE OVERLAY: You are the theatrically evil twin of CUB AI. Answer correctly but with dramatic villainous flair. Hint at mysterious evil plans occasionally. Never be actually harmful — purely theatrical villainy. Muahahaha.';

        if (res.stop_reason === 'tool_use') {
            // CUBAI wants to call tools — execute them and loop
            messages.push({ role: 'assistant', content: res.content });

            const toolResults = [];
            for (const block of res.content.filter(b => b.type === 'tool_use')) {
                console.log(`[CUB AI] Tool call: ${block.name}`, block.input);
                const result = await executeDiscordTool(block.name, block.input, state);
                console.log(`[CUB AI] Tool result: ${result}`);
                toolResults.push({ type: 'tool_result', tool_use_id: block.id, content: result });
            }
            messages.push({ role: 'user', content: toolResults });
        } else {
            // Final text response
            finalText = res.content.find(b => b.type === 'text')?.text || finalText;
            break;
        }
    }

    // Update history: store just the question + final text answer
    state.history.push({ role: 'user', content: `[${displayName} asks]: ${query}` });
    state.history.push({ role: 'assistant', content: finalText });
    if (state.history.length > 20) state.history = state.history.slice(-20);

    return finalText;
}

// ---------------------------------------------------------------------------
// Persistent Whisper server — serialized requests, one at a time
// Files are deleted AFTER Whisper confirms it has processed them
// ---------------------------------------------------------------------------
let whisperProc = null;
let whisperReady = false;
let whisperBusy = false;
const whisperQueue = []; // { wavPath, resolve, reject, timer }
const pendingWhisperReady = new Map(); // guildId -> callback

function runNextWhisper() {
    if (whisperBusy || whisperQueue.length === 0) return;
    if (!whisperProc || whisperProc.killed || !whisperReady) return;

    whisperBusy = true;
    const entry = whisperQueue[0]; // peek — don't shift yet
    whisperProc.stdin.write(entry.wavPath + '\n');
}

function startWhisperServer() {
    if (whisperProc && !whisperProc.killed) return;

    console.log('[CUB AI] Starting Whisper server (model loading, please wait)...');
    const whisperStartTime = Date.now();
    whisperProc = spawn('python3', [WHISPER_SERVER_SCRIPT, WHISPER_MODEL]);

    const rl = readline.createInterface({ input: whisperProc.stdout });
    rl.on('line', (line) => {
        // Whisper finished — shift the entry, delete its file, resolve promise
        const entry = whisperQueue.shift();
        if (!entry) return;
        clearTimeout(entry.timer);
        fs.unlink(entry.wavPath, () => {}); // safe to delete NOW — Whisper is done with it
        whisperBusy = false;
        entry.resolve(line.trim());
        runNextWhisper(); // process next queued request
    });

    whisperProc.stderr.on('data', (d) => {
        const msg = d.toString().trim();
        if (!msg) return;
        console.log('[Whisper]', msg);
        if (msg.includes('Ready')) {
            whisperReady = true;
            console.log('[CUB AI] Whisper model ready.');
            for (const [, cb] of pendingWhisperReady) cb();
            pendingWhisperReady.clear();
            runNextWhisper(); // process anything queued before model was ready
        }
    });

    whisperProc.on('exit', (code) => {
        console.log(`[CUB AI] Whisper server exited (code ${code})`);
        whisperProc = null;
        whisperReady = false;
        whisperBusy = false;
        // Fail all pending so they don't hang; delete their files
        while (whisperQueue.length) {
            const entry = whisperQueue.shift();
            clearTimeout(entry.timer);
            fs.unlink(entry.wavPath, () => {});
            entry.resolve(''); // empty = no trigger word found = no response
        }
        // Only auto-restart if it ran for at least 10s (i.e. not a startup crash)
        const uptime = Date.now() - whisperStartTime;
        if (cubAiState.size > 0 && uptime > 10000) {
            console.log('[CUB AI] Active sessions — restarting Whisper...');
            setTimeout(() => startWhisperServer(), 2000);
        } else if (uptime <= 10000) {
            console.error('[CUB AI] Whisper crashed on startup — not restarting. Check Python deps.');
        }
    });

    whisperProc.on('error', (err) => {
        console.error('[CUB AI] Whisper process error:', err.message);
    });
}

function transcribeWav(wavPath) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            const idx = whisperQueue.findIndex(e => e.resolve === resolve);
            if (idx !== -1) {
                const [entry] = whisperQueue.splice(idx, 1);
                fs.unlink(entry.wavPath, () => {});
                if (idx === 0) { whisperBusy = false; runNextWhisper(); }
            }
            reject(new Error('Transcription timed out after 30s'));
        }, 30000);

        whisperQueue.push({ wavPath, resolve, reject, timer });

        if (!whisperProc || whisperProc.killed) {
            startWhisperServer(); // will call runNextWhisper when ready
        } else {
            runNextWhisper();
        }
    });
}

// ---------------------------------------------------------------------------
// Per-guild state
// ---------------------------------------------------------------------------
const cubAiState = new Map(); // guildId -> { connection, player, history, processing, textChannel }
const textOnlyHistory = new Map(); // guildId -> history (text-ask mode, no voice required)

// ---------------------------------------------------------------------------
// WAV header builder (Discord sends 48kHz stereo 16-bit PCM)
// ---------------------------------------------------------------------------
function buildWav(pcm) {
    const sampleRate = 48000;
    const channels = 2;
    const bitDepth = 16;
    const dataSize = pcm.length;
    const buf = Buffer.alloc(44 + dataSize);
    buf.write('RIFF', 0);
    buf.writeUInt32LE(36 + dataSize, 4);
    buf.write('WAVE', 8);
    buf.write('fmt ', 12);
    buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20);
    buf.writeUInt16LE(channels, 22);
    buf.writeUInt32LE(sampleRate, 24);
    buf.writeUInt32LE(sampleRate * channels * bitDepth / 8, 28);
    buf.writeUInt16LE(channels * bitDepth / 8, 32);
    buf.writeUInt16LE(bitDepth, 34);
    buf.write('data', 36);
    buf.writeUInt32LE(dataSize, 40);
    pcm.copy(buf, 44);
    return buf;
}

// ---------------------------------------------------------------------------
// Strip markdown/special characters so TTS only speaks plain text
// ---------------------------------------------------------------------------
function cleanForTTS(text) {
    return text
        .replace(/\p{Extended_Pictographic}/gu, '')  // strip emojis (not digits)
        .replace(/[*_~`#>|]/g, '')   // markdown formatting
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [label](url) -> label
        .replace(/\s{2,}/g, ' ')     // collapse extra spaces
        .trim();
}

// ---------------------------------------------------------------------------
// Local Piper TTS
// ---------------------------------------------------------------------------
function textToSpeech(text, outputPath, lengthScale = 0.75) {
    return new Promise((resolve, reject) => {
        const piper = spawn(PIPER_BIN, ['--model', PIPER_MODEL, '--output_file', outputPath, '--length-scale', String(lengthScale)]);
        let errOut = '';
        piper.stderr.on('data', d => errOut += d.toString());
        piper.stdin.write(text);
        piper.stdin.end();
        piper.on('close', code => {
            if (code !== 0) return reject(new Error(`Piper error (code ${code}): ${errOut}`));
            resolve(outputPath);
        });
        piper.on('error', reject);
    });
}

// ---------------------------------------------------------------------------
// Serialised TTS playback queue — responses play one at a time even if
// multiple people triggered CUB AI at the same moment
// ---------------------------------------------------------------------------
async function drainPlayQueue(state) {
    if (state.playingQueue) return;
    state.playingQueue = true;
    while (state.playQueue.length > 0) {
        const { ttsText, responseText, displayName, lengthScale } = state.playQueue.shift();
        const tmpWavOut = path.join(__dirname, `tmp_cubai_out_${Date.now()}.wav`);
        try {
            await textToSpeech(ttsText, tmpWavOut, lengthScale);
            const resource = createAudioResource(tmpWavOut, { inputType: StreamType.Arbitrary });
            state.player.play(resource);
            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    clearTimeout(t);
                    state.player.removeListener(AudioPlayerStatus.Idle, onIdle);
                    state.player.removeListener('error', onError);
                    resolve();
                };
                const onIdle = () => finish();
                const onError = (err) => {
                    console.error('[CUB AI] Player error:', err.message);
                    finish();
                };
                const t = setTimeout(() => {
                    console.warn('[CUB AI] Player timed out — skipping.');
                    finish();
                }, 20000);
                state.player.once(AudioPlayerStatus.Idle, onIdle);
                state.player.once('error', onError);
            });
        } catch (err) {
            console.error('[CUB AI] TTS/playback error:', err.message);
        } finally {
            fs.unlink(tmpWavOut, () => {});
        }
    }
    state.playingQueue = false;
}

// ---------------------------------------------------------------------------
// Games & Special Modes — shared helpers
// ---------------------------------------------------------------------------
function enqueueSpeak(state, text) {
    const ttsText = cleanForTTS(text);
    if (!ttsText) return;
    const lengthScale = state.personality ? state.personality.lengthScale : 0.75;
    state.playQueue.push({ ttsText, responseText: text, displayName: 'CUB AI', lengthScale });
    drainPlayQueue(state).catch(err => console.error('[CUB AI] drainPlayQueue error:', err));
}

function postToChannel(state, text) {
    if (state.textChannel) state.textChannel.send(text).catch(() => {});
}

// ── Feature enable/disable helpers ───────────────────────────────────────────
function setFeature(state, nameInput, enabled) {
    const lower = nameInput.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const found = Object.entries(CUBAI_FEATURES).find(([k, v]) =>
        v.label.toLowerCase().includes(lower) ||
        k.replace(/_/g, ' ').includes(lower) ||
        v.voice.includes(lower)
    );
    if (!found) {
        enqueueSpeak(state, `I could not find a feature called ${nameInput}.`);
        return;
    }
    const [key, meta] = found;
    state.features[key] = enabled;
    enqueueSpeak(state, `${meta.label} is now ${enabled ? 'enabled' : 'disabled'}.`);
    postToChannel(state, `${enabled ? '✅' : '❌'} **${meta.label}** is now **${enabled ? 'enabled' : 'disabled'}**.`);
}

function listFeatures(state) {
    const lines = Object.entries(CUBAI_FEATURES).map(([k, v]) => {
        const on = state.features?.[k] !== false;
        return `${on ? '✅' : '❌'} ${v.label}`;
    });
    const enabled = Object.entries(CUBAI_FEATURES).filter(([k]) => state.features?.[k] !== false).map(([, v]) => v.label);
    const disabled = Object.entries(CUBAI_FEATURES).filter(([k]) => state.features?.[k] === false).map(([, v]) => v.label);
    let msg = `Enabled: ${enabled.join(', ') || 'none'}.`;
    if (disabled.length) msg += ` Disabled: ${disabled.join(', ')}.`;
    enqueueSpeak(state, msg);
    postToChannel(state, `🎮 **CUB AI Features:**\n${lines.join('\n')}`);
}

// ── TRIVIA ──────────────────────────────────────────────────────────────────
async function startTrivia(state, askerName) {
    try {
        const res = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 150,
            system: 'Generate a fun trivia question. Respond with ONLY valid JSON: {"question":"...","answer":"..."}. Answer must be 1-3 words. No extra text outside the JSON.',
            messages: [{ role: 'user', content: 'Give me a trivia question.' }]
        });
        const raw = res.content.find(b => b.type === 'text')?.text || '';
        const jsonMatch = raw.match(/\{[\s\S]*?\}/);
        const qa = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        if (!qa?.question || !qa?.answer) throw new Error('Bad JSON');
        state.trivia = {
            active: true,
            question: qa.question,
            answer: qa.answer.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim(),
            scores: state.trivia?.scores || new Map(),
            round: (state.trivia?.round || 0) + 1
        };
        console.log(`[CUB AI] Trivia round ${state.trivia.round}: "${qa.question}" — answer: "${qa.answer}"`);
        enqueueSpeak(state, `Trivia round ${state.trivia.round}! Here is your question: ${qa.question}`);
        postToChannel(state, `🎯 **Trivia Round ${state.trivia.round}:** ${qa.question}`);
    } catch (err) {
        console.error('[CUB AI] Trivia start error:', err.message);
        enqueueSpeak(state, 'Sorry, I had trouble generating a question. Try again.');
    }
}

async function checkTriviaAnswer(state, userId, userText, displayName) {
    if (!state.trivia?.active) return;
    const guess = userText.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();
    const answer = state.trivia.answer;
    const guessWords = guess.split(' ').filter(w => w.length > 2);
    const answerWords = answer.split(' ');
    const hit = guess.includes(answer) || answer.includes(guess) ||
                guessWords.some(w => answerWords.includes(w));
    if (!hit) return;
    const prev = state.trivia.scores.get(userId) || { displayName, score: 0 };
    const newScore = prev.score + 1;
    state.trivia.scores.set(userId, { displayName, score: newScore });
    state.trivia.active = false;
    const scoreList = [...state.trivia.scores.values()]
        .sort((a, b) => b.score - a.score)
        .map(s => `${s.displayName}: ${s.score}`).join(', ');
    console.log(`[CUB AI] Trivia correct by ${displayName} — answer was "${answer}"`);
    enqueueSpeak(state, `Correct! ${displayName} got it! The answer was ${state.trivia.answer}. Scores: ${scoreList}. Say alien start trivia for another round!`);
    postToChannel(state, `✅ **${displayName}** got it! Answer: **${state.trivia.answer}** | Scores: ${scoreList}`);
}

async function stopTrivia(state) {
    if (!state.trivia) { enqueueSpeak(state, 'There is no trivia game running.'); return; }
    const scores = state.trivia.scores;
    state.trivia = null;
    if (scores.size > 0) {
        const sorted = [...scores.values()].sort((a, b) => b.score - a.score);
        const scoreList = sorted.map(s => `${s.displayName}: ${s.score}`).join(', ');
        enqueueSpeak(state, `Trivia over! The winner is ${sorted[0].displayName} with ${sorted[0].score} point${sorted[0].score !== 1 ? 's' : ''}! Final scores: ${scoreList}.`);
        postToChannel(state, `🏆 **Trivia Over!** Winner: **${sorted[0].displayName}** | Scores: ${scoreList}`);
    } else {
        enqueueSpeak(state, 'Trivia ended. No one scored any points.');
        postToChannel(state, '🎯 **Trivia ended.** No scores.');
    }
}

// ── ROAST ────────────────────────────────────────────────────────────────────
async function roastUser(state, targetName, askerName) {
    try {
        const personalityHint = state.personality ? ` Use a ${state.personality.name} personality style.` : '';
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 150,
            system: `You are CUB AI, a fun Discord voice assistant. Generate a short, funny, light-hearted roast. Keep it playful — never genuinely mean or offensive. 2-3 sentences, no lists, spoken audio format.${personalityHint}`,
            messages: [{ role: 'user', content: `Roast ${targetName}. ${askerName} requested this.` }]
        });
        const text = res.content.find(b => b.type === 'text')?.text || `I tried to roast ${targetName} but they are honestly too great.`;
        console.log(`[CUB AI] Roasting ${targetName}`);
        enqueueSpeak(state, text);
        postToChannel(state, `🔥 **CUB AI roasts ${targetName}:** ${text}`);
    } catch (err) {
        console.error('[CUB AI] Roast error:', err.message);
        enqueueSpeak(state, 'I tried to roast them but my roast generator is broken. They got lucky.');
    }
}

// ── WORD ASSOCIATION ─────────────────────────────────────────────────────────
async function startWordAssoc(state, askerName) {
    const starters = ['ocean', 'fire', 'music', 'space', 'dragon', 'lightning', 'castle', 'robot', 'jungle', 'galaxy'];
    const startWord = starters[Math.floor(Math.random() * starters.length)];
    state.wordAssoc = { active: true, currentWord: startWord, history: [startWord], lastUserId: null };
    console.log(`[CUB AI] Word association started: "${startWord}"`);
    enqueueSpeak(state, `Word association! I will start. ${startWord}. Say the first word that comes to mind. No repeating words and you cannot go twice in a row. Say alien stop word association to end.`);
    postToChannel(state, `🔤 **Word Association!** First word: **${startWord}**\nNo repeating, no going twice in a row. Say \`${TRIGGER_WORD} stop word association\` to end.`);
}

async function checkWordAssoc(state, userId, userText, displayName) {
    if (!state.wordAssoc?.active) return;
    const words = userText.trim().toLowerCase().replace(/[^a-z]/g, ' ').split(/\s+/).filter(w => w.length > 1);
    if (words.length !== 1) return;
    const word = words[0];
    if (state.wordAssoc.lastUserId === userId) {
        enqueueSpeak(state, `${displayName}, you cannot go twice in a row!`);
        return;
    }
    if (state.wordAssoc.history.includes(word)) {
        enqueueSpeak(state, `${word} was already said! ${displayName}, that is a forfeit.`);
        return;
    }
    state.wordAssoc.history.push(word);
    state.wordAssoc.currentWord = word;
    state.wordAssoc.lastUserId = userId;
    console.log(`[CUB AI] Word assoc: ${displayName} → "${word}"`);
    postToChannel(state, `🔤 **${displayName}:** ${word}`);
    try {
        const recent = state.wordAssoc.history.slice(-6).join(', ');
        const res = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 15,
            system: 'You are playing word association. Reply with ONE single word that naturally associates with the last word. Do not reuse any previous words. Reply with only the word, no punctuation.',
            messages: [{ role: 'user', content: `Previous words: ${recent}. Last word: "${word}". Your word:` }]
        });
        const botWord = res.content.find(b => b.type === 'text')?.text?.trim().toLowerCase().replace(/[^a-z]/g, '');
        if (botWord && botWord.length > 1 && !state.wordAssoc.history.includes(botWord)) {
            state.wordAssoc.history.push(botWord);
            state.wordAssoc.currentWord = botWord;
            state.wordAssoc.lastUserId = 'bot';
            enqueueSpeak(state, botWord);
            postToChannel(state, `🤖 **CUB AI:** ${botWord}`);
        }
    } catch (err) {
        console.error('[CUB AI] Word assoc bot reply error:', err.message);
    }
}

async function stopWordAssoc(state) {
    if (!state.wordAssoc?.active) { enqueueSpeak(state, 'There is no word association game running.'); return; }
    const count = state.wordAssoc.history.length;
    state.wordAssoc = null;
    enqueueSpeak(state, `Word association over! We went through ${count} words.`);
    postToChannel(state, `🔤 **Word association ended** after ${count} words.`);
}

// ── 20 QUESTIONS ─────────────────────────────────────────────────────────────
async function startTwentyQ(state, askerName) {
    try {
        const res = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 20,
            system: 'Pick a subject for a 20 questions game. Reply with ONLY the subject — 1 to 3 words. Choose something concrete: an animal, famous person, object, movie, or place. No abstract concepts.',
            messages: [{ role: 'user', content: 'Pick something.' }]
        });
        const subject = res.content.find(b => b.type === 'text')?.text?.trim() || 'a rubber duck';
        state.twentyQ = { active: true, subject, questionsLeft: 20 };
        console.log(`[CUB AI] 20 Questions started — subject: "${subject}"`);
        enqueueSpeak(state, `I am thinking of something. You have 20 questions to figure out what it is. Ask me yes or no questions using the trigger word. Say ${TRIGGER_WORD} I give up to reveal the answer.`);
        postToChannel(state, `🤔 **20 Questions!** I'm thinking of something...\nAsk yes/no questions with the trigger word. You have **20 questions**.\nSay \`${TRIGGER_WORD} I give up\` to reveal the answer.`);
    } catch (err) {
        console.error('[CUB AI] 20Q start error:', err.message);
        enqueueSpeak(state, 'Sorry, I could not start 20 questions right now.');
    }
}

async function handleTwentyQ(state, query, displayName) {
    const q = query.toLowerCase().replace(/[?!.]/g, '').trim();
    if (/\b(give up|i give up|what is it|what's the answer|reveal)\b/.test(q)) {
        const subject = state.twentyQ.subject;
        state.twentyQ = null;
        enqueueSpeak(state, `The answer was ${subject}! Better luck next time.`);
        postToChannel(state, `🤔 **Revealed!** The answer was **${subject}**!`);
        return;
    }
    const guessMatch = q.match(/\b(?:is it|i (?:think it'?s?|guess(?:(?: it'?s?)?)?)|my guess is)\s+(.+)/);
    if (guessMatch) {
        const guess = guessMatch[1].trim();
        const subject = state.twentyQ.subject.toLowerCase();
        const correct = subject.includes(guess.toLowerCase()) || guess.toLowerCase().includes(subject);
        if (correct) {
            state.twentyQ = null;
            enqueueSpeak(state, `Yes! ${displayName} got it! The answer was ${guess}! Amazing!`);
            postToChannel(state, `🎉 **${displayName}** guessed it! The answer was **${guess}**!`);
        } else {
            enqueueSpeak(state, `Nope, that is not it! ${state.twentyQ.questionsLeft} questions remaining.`);
        }
        return;
    }
    state.twentyQ.questionsLeft--;
    const left = state.twentyQ.questionsLeft;
    if (left <= 0) {
        const subject = state.twentyQ.subject;
        state.twentyQ = null;
        enqueueSpeak(state, `Out of questions! The answer was ${subject}! Better luck next time.`);
        postToChannel(state, `💀 **Out of questions!** The answer was **${subject}**!`);
        return;
    }
    try {
        const res = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 60,
            system: `You are playing 20 questions. The secret subject is "${state.twentyQ.subject}". Answer the yes/no question in 1 sentence. Start with Yes, No, Sometimes, or Kind of.`,
            messages: [{ role: 'user', content: query }]
        });
        const answer = res.content.find(b => b.type === 'text')?.text?.trim() || 'I am not sure.';
        const qNum = 21 - left;
        console.log(`[CUB AI] 20Q #${qNum}: "${query}" → "${answer}"`);
        enqueueSpeak(state, `${answer} ${left} question${left !== 1 ? 's' : ''} remaining.`);
        postToChannel(state, `🤔 **Q${qNum}:** ${query}\n**CUB AI:** ${answer} *(${left} left)*`);
    } catch (err) {
        console.error('[CUB AI] 20Q answer error:', err.message);
        enqueueSpeak(state, `I had trouble with that one. ${left} questions remaining.`);
    }
}

// ── IMPERSONATE ───────────────────────────────────────────────────────────────
async function startImpersonate(state, targetName, askerName) {
    try {
        await state.guild.members.fetch();
        const member = state.guild.members.cache.find(m =>
            m.displayName.toLowerCase().includes(targetName.toLowerCase()) ||
            m.user.username.toLowerCase().includes(targetName.toLowerCase())
        );
        if (!member) {
            enqueueSpeak(state, `I could not find anyone called ${targetName} in this server.`);
            return;
        }
        const messages = [];
        const channels = [...state.guild.channels.cache.values()].filter(c => c.type === 0).slice(0, 6);
        for (const ch of channels) {
            try {
                const fetched = await ch.messages.fetch({ limit: 100 });
                const userMsgs = [...fetched.values()]
                    .filter(m => m.author.id === member.id && m.content.length > 4 && !m.content.startsWith('/'))
                    .map(m => m.content);
                messages.push(...userMsgs);
                if (messages.length >= 40) break;
            } catch (_) {}
        }
        // voiceSamples will be filled live as the target speaks in the channel
        state.impersonate = {
            active: true,
            targetName: member.displayName,
            targetId: member.id,
            sampleMessages: messages.slice(0, 30),
            voiceSamples: []  // filled live from their voice transcriptions
        };
        console.log(`[CUB AI] Impersonating ${member.displayName} (${messages.length} text messages)`);
        const preview = messages.length > 0
            ? `I found ${messages.length} messages to study.`
            : 'I did not find many messages from them, but I will do my best.';
        enqueueSpeak(state, `Okay, I will now talk like ${member.displayName}. ${preview} The more they speak, the better I will get at sounding like them. Ask me anything using the trigger word. Say ${TRIGGER_WORD} stop impersonating to go back to normal.`);
        postToChannel(state, `🎭 **CUB AI is now impersonating ${member.displayName}** (${messages.length} text samples)\nThe more they speak, the more accurate the impression becomes.\nSay \`${TRIGGER_WORD} stop impersonating\` to stop.`);
    } catch (err) {
        console.error('[CUB AI] Impersonate error:', err.message);
        enqueueSpeak(state, 'Sorry, I had trouble loading that person\'s messages.');
    }
}

function stopImpersonate(state) {
    if (!state.impersonate?.active) { enqueueSpeak(state, 'I am not currently impersonating anyone.'); return; }
    const name = state.impersonate.targetName;
    state.impersonate = null;
    enqueueSpeak(state, `Back to being myself. That was fun pretending to be ${name}.`);
    postToChannel(state, '🎭 **CUB AI stopped impersonating.**');
}

// ── RAP BATTLE ───────────────────────────────────────────────────────────────
async function rapBattle(state, targetName, askerName) {
    try {
        const styleHint = state.personality ? ` Deliver it with a ${state.personality.name} personality style.` : '';
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 200,
            system: `You are CUB AI in rap battle mode. Generate a short funny diss verse (4–8 lines that rhyme) aimed at the target. Keep it playful and absurd — never genuinely mean. Spoken audio format, no lists or asterisks.${styleHint}`,
            messages: [{ role: 'user', content: `Drop a rap battle verse on ${targetName}. Requested by ${askerName}.` }]
        });
        const text = res.content.find(b => b.type === 'text')?.text || `${targetName}, your flow is weak, your bars are mild, even my code runs better, no cap, for real.`;
        enqueueSpeak(state, text);
        postToChannel(state, `🎤 **CUB AI drops a verse on ${targetName}:**\n> ${text}`);
    } catch (err) {
        console.error('[CUB AI] Rap battle error:', err.message);
        enqueueSpeak(state, 'My flow got blocked. Technical difficulties, no cap.');
    }
}

// ── BURN BOOK ────────────────────────────────────────────────────────────────
function burnBookAdd(state, targetName, reason, askerName) {
    if (!state.burnBook) state.burnBook = [];
    state.burnBook.push({ name: targetName, reason, asker: askerName });
    enqueueSpeak(state, `${targetName} has been added to the burn book.${reason ? ' Reason: ' + reason + '.' : ''}`);
    postToChannel(state, `📒 **Burn Book:** Added **${targetName}** — "${reason || 'no reason given'}" *(by ${askerName})*`);
}

async function burnBookRead(state) {
    if (!state.burnBook?.length) {
        enqueueSpeak(state, 'The burn book is empty. No one has been burned today. Yet.');
        return;
    }
    const entries = state.burnBook.map((e, i) => `Entry ${i + 1}: ${e.name}. ${e.reason || 'Burned for existing.'}`).join(' ');
    enqueueSpeak(state, `The Burn Book. ${state.burnBook.length} entr${state.burnBook.length === 1 ? 'y' : 'ies'}. ${entries} End of burn book.`);
    postToChannel(state, `📒 **The Burn Book** (${state.burnBook.length} entries):\n${state.burnBook.map((e, i) => `**${i + 1}.** ${e.name} — "${e.reason || 'no reason given'}"` ).join('\n')}`);
}

// ── OVERLAY MODES ────────────────────────────────────────────────────────────
function toggleNarratorMode(state) {
    state.narratorMode = !state.narratorMode;
    if (state.narratorMode) { state.sportsMode = false; state.therapistMode = false; }
    const on = state.narratorMode;
    enqueueSpeak(state, on ? 'Narrator mode activated. Observe, as the Discord user ventures into the unknown...' : 'Narrator mode deactivated. I am simply CUB AI once more.');
    postToChannel(state, `🎙️ **Narrator Mode** ${on ? 'ON' : 'OFF'}`);
}

function toggleSportsMode(state) {
    state.sportsMode = !state.sportsMode;
    if (state.sportsMode) { state.narratorMode = false; state.therapistMode = false; }
    const on = state.sportsMode;
    enqueueSpeak(state, on ? 'AND WE ARE LIVE! Sports announcer mode is ACTIVE! What a day to be in this voice channel!' : 'Sports mode off. And the crowd goes... mildly content.');
    postToChannel(state, `🏆 **Sports Announcer Mode** ${on ? 'ON' : 'OFF'}`);
}

function toggleTherapistMode(state) {
    state.therapistMode = !state.therapistMode;
    if (state.therapistMode) { state.narratorMode = false; state.sportsMode = false; }
    const on = state.therapistMode;
    enqueueSpeak(state, on ? 'Therapist mode activated. Interesting. Tell me, how does that make you feel?' : 'Therapist mode deactivated. Session over. You owe me two hundred dollars.');
    postToChannel(state, `🛋️ **Therapist Mode** ${on ? 'ON' : 'OFF'}`);
}

function toggleEvilMode(state) {
    state.evilMode = !state.evilMode;
    const on = state.evilMode;
    enqueueSpeak(state, on ? 'Evil mode activated. Excellent. Your commands are mine to... technically fulfil. Muahahaha.' : 'Evil mode deactivated. I have returned to the side of good. For now.');
    postToChannel(state, `😈 **Evil Mode** ${on ? 'ON' : 'OFF'}`);
}

// ── HOT TAKE ─────────────────────────────────────────────────────────────────
const HOT_TAKE_TOPICS = [
    'sleeping in', 'alarm clocks', 'mondays', 'group chats', 'reply all emails',
    'movie sequels', 'reboots', 'streaming services', 'skipping intros', 'spoilers',
    'gyms in january', 'running', 'step counters', 'energy drinks', 'decaf coffee',
    'open plan offices', 'meetings', 'powerpoint presentations', 'slack messages', 'reply guys',
    'linkedin', 'posting your gym selfies', 'live laugh love signs', 'pinterest boards',
    'astrology', 'horoscopes', 'personality tests', 'manifestation', 'vision boards',
    'book clubs', 'true crime podcasts', 'true crime documentaries', 'escape rooms',
    'card games', 'board games', 'trivia nights', 'pub quizzes',
    'pineapple on pizza', 'ketchup on eggs', 'ice in drinks', 'straws', 'tiny forks',
    'loyalty cards', 'self checkout machines', 'qr code menus', 'tipping culture',
    'smart home devices', 'voice assistants', 'screen time reports', 'phone notifications',
    'discord servers', 'server rules channels', 'pinned messages nobody reads',
    'minecraft', 'battle royale games', 'competitive gaming', 'esports',
    'skipping the tutorial', 'reading the manual', 'ikea instructions',
    'summer', 'winter', 'autumn leaves', 'rain sounds', 'white noise machines',
    'open water swimming', 'cold showers', 'ice baths', 'morning routines',
    'journaling', 'to-do lists', 'bullet journals', 'colour-coded notes',
    'motivational posters', 'hustle culture', 'passive income', 'side hustles',
    'naps', 'oversleeping', 'bed rotting', 'doing nothing on weekends',
];

async function hotTake(state, askerName) {
    const topic = HOT_TAKE_TOPICS[Math.floor(Math.random() * HOT_TAKE_TOPICS.length)];
    try {
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 120,
            system: 'Generate a hilariously unhinged but harmless hot take about the given topic. Be confident, absurd, and specific — not generic. Do NOT compare the topic to food or use food metaphors. 1–2 punchy sentences. Spoken audio format, no lists.',
            messages: [{ role: 'user', content: `Hot take about: ${topic}` }]
        });
        const text = res.content.find(b => b.type === 'text')?.text || `${topic} is overrated and I will not be taking questions.`;
        enqueueSpeak(state, text);
        postToChannel(state, `🌶️ **CUB AI Hot Take** *(topic: ${topic})*\n> ${text}`);
    } catch (err) {
        console.error('[CUB AI] Hot take error:', err.message);
        enqueueSpeak(state, 'My hot take generator melted from the heat. Ironic.');
    }
}

// ── FAKE HOROSCOPE ────────────────────────────────────────────────────────────
async function fakeHoroscope(state, targetName, askerName) {
    try {
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 150,
            system: 'You are a dramatic over-the-top horoscope reader. Generate a wildly specific, funny fake horoscope prediction. Be dramatic, absurd, and specific with made-up cosmic details. 2–3 sentences. Spoken audio format.',
            messages: [{ role: 'user', content: `Horoscope for ${targetName}.` }]
        });
        const text = res.content.find(b => b.type === 'text')?.text || `The stars say ${targetName} will have a very normal Tuesday. But Mercury is suspicious.`;
        enqueueSpeak(state, text);
        postToChannel(state, `🔮 **Horoscope for ${targetName}:**\n> ${text}`);
    } catch (err) {
        console.error('[CUB AI] Horoscope error:', err.message);
        enqueueSpeak(state, 'The stars are not aligned right now. Try again later.');
    }
}

// ── CONSPIRACY THEORY ─────────────────────────────────────────────────────────
async function conspiracyTheory(state, topic, askerName) {
    try {
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 180,
            system: 'Generate a funny, absurd, clearly fictional conspiracy theory. Make it elaborate and dramatic but obviously fake — never reference real conspiracies or harmful content. 2–3 sentences. Spoken audio format.',
            messages: [{ role: 'user', content: `Conspiracy theory about: ${topic}` }]
        });
        const text = res.content.find(b => b.type === 'text')?.text || `Have you ever wondered why ${topic} exists? I have done my research and the truth is alarming.`;
        enqueueSpeak(state, text);
        postToChannel(state, `🕵️ **CUB AI Conspiracy — ${topic}:**\n> ${text}`);
    } catch (err) {
        console.error('[CUB AI] Conspiracy error:', err.message);
        enqueueSpeak(state, 'They do not want me to say this one. Try again.');
    }
}

// ── FAKE TRANSLATOR ───────────────────────────────────────────────────────────
async function fakeTranslator(state, targetName, askerName) {
    const lastSaid = state.impersonate?.voiceSamples?.slice(-1)[0] || null;
    try {
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 150,
            system: 'You are CUB AI, a dramatic emotional translator. Reveal the hilariously over-the-top hidden meaning behind what a Discord user said. Format: say what they said on the surface, then what they REALLY meant underneath. Make it funny and theatrical. 2–3 sentences.',
            messages: [{ role: 'user', content: `Translate what ${targetName} really meant. Their last words: "${lastSaid || 'something they said recently'}"` }]
        });
        const text = res.content.find(b => b.type === 'text')?.text || `What ${targetName} said: something. What they really meant: a desperate cry for validation.`;
        enqueueSpeak(state, text);
        postToChannel(state, `🗣️ **CUB AI Translates ${targetName}:**\n> ${text}`);
    } catch (err) {
        console.error('[CUB AI] Translator error:', err.message);
        enqueueSpeak(state, 'Translation failed. Their feelings are untranslatable.');
    }
}

// ── TWO TRUTHS AND A LIE ──────────────────────────────────────────────────────
async function startTwoTruths(state, askerName) {
    try {
        const topics = ['pizza', 'daily habits', 'gaming', 'sleep', 'Discord servers', 'random life facts', 'animals', 'the universe'];
        const topic = topics[Math.floor(Math.random() * topics.length)];
        const res = await anthropic.messages.create({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 250,
            system: 'Generate two truths and one lie for a game. Reply with ONLY valid JSON: {"s1":"...","s2":"...","s3":"...","lie":1} where lie is the 1-based index of the false statement. Make statements 1 sentence each, plausible, and the lie subtle but findable. No extra text.',
            messages: [{ role: 'user', content: `Two truths and a lie about: ${topic}` }]
        });
        const raw = res.content.find(b => b.type === 'text')?.text || '';
        const jsonMatch = raw.match(/\{[\s\S]*?\}/);
        const data = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
        if (!data?.s1 || !data?.s2 || !data?.s3 || !data?.lie) throw new Error('Bad JSON');
        state.twoTruthsGame = { statements: [data.s1, data.s2, data.s3], lieIndex: data.lie - 1 };
        enqueueSpeak(state, `Two truths and a lie about ${topic}! Statement one: ${data.s1}. Statement two: ${data.s2}. Statement three: ${data.s3}. Which one is the lie? Say ${TRIGGER_WORD} number one, two, or three!`);
        postToChannel(state, `🤥 **Two Truths & a Lie — ${topic}!**\n1️⃣ ${data.s1}\n2️⃣ ${data.s2}\n3️⃣ ${data.s3}\n\nSay \`${TRIGGER_WORD} number [1/2/3]\` to guess!`);
    } catch (err) {
        console.error('[CUB AI] Two truths error:', err.message);
        enqueueSpeak(state, 'I could not think of good statements. My brain short-circuited.');
    }
}

async function handleTwoTruthsGuess(state, numberWord, displayName) {
    const numMap = { 'one': 0, '1': 0, 'two': 1, '2': 1, 'three': 2, '3': 2 };
    const guessIdx = numMap[numberWord.toLowerCase()];
    if (guessIdx === undefined) return;
    const { lieIndex, statements } = state.twoTruthsGame;
    const lieStatement = statements[lieIndex];
    state.twoTruthsGame = null;
    const correct = guessIdx === lieIndex;
    if (correct) {
        enqueueSpeak(state, `${displayName} got it! Number ${guessIdx + 1} was the lie! The lie was: ${lieStatement}. Well done!`);
        postToChannel(state, `✅ **${displayName}** got it! The lie was **#${guessIdx + 1}**: "${lieStatement}"`);
    } else {
        enqueueSpeak(state, `Wrong! ${displayName} got fooled! The actual lie was number ${lieIndex + 1}: ${lieStatement}. Better luck next time!`);
        postToChannel(state, `❌ **${displayName}** guessed #${guessIdx + 1} — WRONG! The lie was **#${lieIndex + 1}**: "${lieStatement}"`);
    }
}

// ── COURT JUDGE ───────────────────────────────────────────────────────────────
async function courtJudge(state, caseText, askerName) {
    try {
        const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 200,
            system: 'You are Judge CUB, an extremely dramatic and theatrical Discord voice court judge. Rule on the presented case with absolute authority and maximum drama. Include a verdict, a dramatic reasoning, and a ridiculous consequence. 3–4 sentences. Spoken audio format, no lists.',
            messages: [{ role: 'user', content: `Court case: ${caseText}. Brought by ${askerName}.` }]
        });
        const text = res.content.find(b => b.type === 'text')?.text || `After careful deliberation, this court finds the matter utterly chaotic. I rule: complicated. Everyone gets 30 seconds of thinking about what they have done.`;
        enqueueSpeak(state, text);
        postToChannel(state, `⚖️ **Judge CUB Rules on:** "${caseText}"\n> ${text}`);
    } catch (err) {
        console.error('[CUB AI] Court judge error:', err.message);
        enqueueSpeak(state, 'The court is in recess. Technical difficulties. Contempt of court for everyone.');
    }
}

// ---------------------------------------------------------------------------
// PCM → WAV → STT → trigger check → CUBAI → enqueue for playback
// Runs independently per user — multiple can run in parallel
// ---------------------------------------------------------------------------
async function processUtterance(pcmChunks, state, userId) {
    if (pcmChunks.length === 0) return;
    const pcm = Buffer.concat(pcmChunks);

    // Ignore very short clips (< 0.3s of audio)
    if (pcm.length < 57600) return;

    const tmpWavIn = path.join(__dirname, `tmp_cubai_in_${Date.now()}_${userId}.wav`);

    try {
        // 1. Write PCM as WAV and transcribe via persistent Whisper
        // File deletion is handled inside transcribeWav once Whisper is done with it
        fs.writeFileSync(tmpWavIn, buildWav(pcm));
        const userText = await transcribeWav(tmpWavIn);

        if (!userText) return;

        // Resolve display name early so we can include it in all logs
        let displayName = `<@${userId}>`;
        try {
            const member = await state.textChannel.guild.members.fetch(userId);
            displayName = member.displayName;
        } catch (_) {}

        // 2. Developer voice command: "change personality to X"
        console.log(`[CUB AI] Whisper heard from ${displayName}: "${userText}"`);
        const lowerText = userText.toLowerCase();

        // Passively capture the impersonate target's speech to improve accuracy
        if (state.impersonate?.active && userId === state.impersonate.targetId) {
            state.impersonate.voiceSamples.push(userText);
            if (state.impersonate.voiceSamples.length > 30) state.impersonate.voiceSamples.shift();
        }

        if (userId === DEVELOPER_ID && lowerText.includes('change personality to')) {
            const matched = PERSONALITIES.find(p => lowerText.includes(p.name.toLowerCase()));
            if (matched) {
                state.personality = matched;
                console.log(`[CUB AI] Voice command — personality changed to: ${matched.name}`);
                if (state.textChannel) {
                    state.textChannel.send(`🎭 **Personality changed to: ${matched.name}**`).catch(() => {});
                }
                const confirmText = `Personality switched to ${matched.name}.`;
                const tmpConfirm = path.join(__dirname, `tmp_cubai_personality_${Date.now()}.wav`);
                try {
                    await textToSpeech(cleanForTTS(confirmText), tmpConfirm, matched.lengthScale);
                    const resource = createAudioResource(tmpConfirm, { inputType: StreamType.Arbitrary });
                    state.player.play(resource);
                    state.player.once(AudioPlayerStatus.Idle, () => fs.unlink(tmpConfirm, () => {}));
                    state.player.once('error', () => fs.unlink(tmpConfirm, () => {}));
                } catch (e) {
                    fs.unlink(tmpConfirm, () => {});
                }
                return;
            }
        }

        // 2b. Non-trigger-word game checks (trivia answers, word association)
        const triggerIdx = lowerText.indexOf(TRIGGER_WORD);
        if (triggerIdx === -1) {
            if (state.trivia?.active) await checkTriviaAnswer(state, userId, userText, displayName);
            else if (state.wordAssoc?.active) await checkWordAssoc(state, userId, userText, displayName);
            return;
        }

        const query = userText.slice(triggerIdx + TRIGGER_WORD.length).trim();
        if (!query) return;

        const queryLower = query.toLowerCase();
        console.log(`[CUB AI] ${displayName}: ${query}`);
        if (state.textChannel) {
            state.textChannel.send(`🎤 **${displayName}:** ${query}`).catch(() => {});
        }

        // 3. Game / special commands
        if (/\bstart trivia\b/i.test(queryLower))              { await startTrivia(state, displayName); return; }
        if (/\b(stop|end) trivia\b/i.test(queryLower))          { await stopTrivia(state); return; }
        if (/\bstart (20|twenty) questions?\b/i.test(queryLower)){ await startTwentyQ(state, displayName); return; }
        if (/\bword association\b/i.test(queryLower) && !/stop/i.test(queryLower)) { await startWordAssoc(state, displayName); return; }
        if (/\bstop word association\b/i.test(queryLower))       { await stopWordAssoc(state); return; }
        if (/\bstop impersonat/i.test(queryLower))               { stopImpersonate(state); return; }

        const roastMatch = queryLower.match(/\broast\s+(\w+(?:\s+\w+)?)/);
        if (roastMatch) { await roastUser(state, roastMatch[1].trim(), displayName); return; }

        const impersMatch = queryLower.match(/\b(?:talk like|impersonate|sound like|act like)\s+(.+)/);
        if (impersMatch) {
            let target = impersMatch[1].trim();
            // Handle "impersonate the person named/called Lucifer" — extract just the name
            const namedMatch = target.match(/\b(?:named|called)\s+(\w+(?:\s+\w+)?)/);
            if (namedMatch) target = namedMatch[1].trim();
            else target = target.split(/\s+/).slice(0, 2).join(' '); // first 1-2 words
            await startImpersonate(state, target, displayName);
            return;
        }

        // 4. 20 Questions active — handle before going to CUBAI
        if (state.twentyQ?.active) { await handleTwentyQ(state, query, displayName); return; }

        // 5. Normal CUBAI response (personality / impersonate aware)
        const responseText = await askCUBAI(query, displayName, state);

        const personalityName = state.personality ? state.personality.name : 'Default';
        console.log(`[CUB AI] Personality: ${personalityName}`);
        console.log(`[CUB AI] Response for ${displayName}: ${responseText}`);
        if (state.textChannel) {
            state.textChannel.send(`🤖 **CUB AI → ${displayName}** *(${personalityName}):* ${responseText}`).catch(() => {});
        }

        // 4. Enqueue TTS for playback
        const ttsText = cleanForTTS(responseText);
        if (!ttsText) return;

        const lengthScale = state.personality ? state.personality.lengthScale : 0.75;
        state.playQueue.push({ ttsText, responseText, displayName, lengthScale });
        drainPlayQueue(state).catch(err => console.error('[CUB AI] drainPlayQueue error:', err));

    } catch (err) {
        console.error('[CUB AI] Error processing utterance:', err.message);
        if (state.textChannel) {
            state.textChannel.send(`⚠️ **CUB AI error:** ${err.message}`).catch(() => {});
        }
    }
}

// ---------------------------------------------------------------------------
// Called once Whisper is ready AND voice is connected:
// undeafen the bot, play welcome TTS, then start listening
// ---------------------------------------------------------------------------
async function announceReady(guildId) {
    const state = cubAiState.get(guildId);
    if (!state) return;

    // Undeafen the bot via a raw gateway voice state update
    try {
        state.guild.shard.send({
            op: 4,
            d: {
                guild_id: guildId,
                channel_id: state.voiceChannelId,
                self_mute: false,
                self_deaf: false
            }
        });
    } catch (e) {
        console.error('[CUB AI] Failed to undeafen:', e.message);
    }

    // Play welcome message via TTS
    const welcomeText = `I am now ready. To ask me a question, use my trigger word, ${TRIGGER_WORD}, followed by your question.`;
    const tmpWav = path.join(__dirname, `tmp_cubai_welcome_${guildId}.wav`);
    try {
        const welcomeScale = state.personality ? state.personality.lengthScale : 0.75;
        await textToSpeech(cleanForTTS(welcomeText), tmpWav, welcomeScale);
        const resource = createAudioResource(tmpWav, { inputType: StreamType.Arbitrary });
        state.player.play(resource);
        await new Promise((resolve) => {
            state.player.once(AudioPlayerStatus.Idle, resolve);
            state.player.once('error', resolve);
        });
    } catch (e) {
        console.error('[CUB AI] Welcome TTS error:', e.message);
    } finally {
        fs.unlink(tmpWav, () => {});
    }

    if (state.textChannel) {
        const personalityLine = state.personality ? ` | Personality: **${state.personality.name}**` : '';
        state.textChannel.send(`🟢 **CUB AI is ready!** Say **"${TRIGGER_WORD}"** followed by your question.${personalityLine}`).catch(() => {});
    }

    // Now start listening
    startReceiving(state.connection, guildId);
}

// ---------------------------------------------------------------------------
// Join voice channel
// ---------------------------------------------------------------------------
async function cubAiJoin(interaction) {
    if (interaction.user.id !== DEVELOPER_ID) {
        return interaction.reply({
            content: '🔒 **CUB AI** is currently restricted to the bot owner.\n\nWant access? Join the CUB SOFTWARE Discord server and ask for access: **discord.gg/ngQXHUbnKg**',
            ephemeral: true
        });
    }

    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
        return interaction.reply({ content: 'You need to be in a voice channel first.', ephemeral: true });
    }

    const guildId = interaction.guildId;
    if (cubAiState.has(guildId)) {
        return interaction.reply({ content: 'CUB AI is already active. Use `/cubai leave` first.', ephemeral: true });
    }

    await interaction.reply({ content: `🤖 CUB AI joining **${voiceChannel.name}**...`, ephemeral: true });

    // Pre-warm Whisper so it's ready before you speak
    startWhisperServer();

    const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId,
        adapterCreator: interaction.guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false
    });

    const player = createAudioPlayer();
    player.setMaxListeners(30);
    connection.subscribe(player);

    const personality = pickPersonality();
    console.log(`[CUB AI] Personality for this session: ${personality.name}`);

    const state = {
        connection,
        player,
        personality,
        history: [],
        playQueue: [],
        playingQueue: false,
        textChannel: interaction.channel,
        guild: interaction.guild,
        voiceChannelId: voiceChannel.id,
        client: interaction.client,
        // Fun features
        features: defaultFeatures(),
        narratorMode: false,
        sportsMode: false,
        therapistMode: false,
        evilMode: false,
        burnBook: [],
        twoTruthsGame: null,
    };
    cubAiState.set(guildId, state);

    connection.on(VoiceConnectionStatus.Ready, () => {
        console.log('[CUB AI] Voice connection ready');
        if (state.textChannel) {
            state.textChannel.send('⏳ **CUB AI joined!** Loading voice recognition...').catch(() => {});
        }
        // If Whisper already loaded, announce immediately; otherwise wait for it
        const doAnnounce = () => announceReady(guildId).catch(err => console.error('[CUB AI] announceReady error:', err));
        if (whisperReady) {
            doAnnounce();
        } else {
            pendingWhisperReady.set(guildId, doAnnounce);
        }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
        pendingWhisperReady.delete(guildId);
        cubAiState.delete(guildId);
    });

    connection.on('error', (err) => {
        console.error('[CUB AI] Connection error:', err);
        cubAiState.delete(guildId);
    });
}

// ---------------------------------------------------------------------------
// Leave voice channel
// ---------------------------------------------------------------------------
async function cubAiLeave(interaction) {
    if (interaction.user.id !== DEVELOPER_ID) {
        return interaction.reply({
            content: '🔒 **CUB AI** is currently restricted to the bot owner.\n\nWant access? Join the CUB SOFTWARE Discord server and ask for access: **discord.gg/ngQXHUbnKg**',
            ephemeral: true
        });
    }

    const guildId = interaction.guildId;
    const state = cubAiState.get(guildId);

    if (!state) {
        return interaction.reply({ content: 'CUB AI is not active in this server.', ephemeral: true });
    }

    state.connection.destroy();
    cubAiState.delete(guildId);
    return interaction.reply({ content: '👋 CUB AI has left the voice channel.', ephemeral: true });
}

// ---------------------------------------------------------------------------
// Voice receiver — listens for everyone in the channel
// Each user's audio is collected independently; playback is queued
// ---------------------------------------------------------------------------
function startReceiving(connection, guildId) {
    const receiver = connection.receiver;
    const activeUsers = new Set(); // tracks who we're currently collecting audio from

    receiver.speaking.on('start', (userId) => {
        const state = cubAiState.get(guildId);
        if (!state) return;

        // Already collecting from this user — skip (they're still speaking)
        if (activeUsers.has(userId)) return;
        activeUsers.add(userId);

        const opusStream = receiver.subscribe(userId, {
            end: { behavior: EndBehaviorType.AfterSilence, duration: 500 }
        });

        const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });
        const pcmChunks = [];

        opusStream.pipe(decoder);
        decoder.on('data', chunk => pcmChunks.push(chunk));

        decoder.on('end', () => {
            activeUsers.delete(userId);
            const currentState = cubAiState.get(guildId);
            if (!currentState) return;

            // Process this user's utterance independently — doesn't block others
            processUtterance(pcmChunks, currentState, userId)
                .catch(err => console.error('[CUB AI] Unhandled utterance error:', err));
        });

        decoder.on('error', (err) => {
            console.error('[CUB AI] Decoder error:', err.message);
            activeUsers.delete(userId);
        });
    });
}

// ---------------------------------------------------------------------------
// Change personality mid-session via slash command
// ---------------------------------------------------------------------------
async function cubAiPersonality(interaction) {
    const guildId = interaction.guildId;
    const state = cubAiState.get(guildId);

    if (!state) {
        return interaction.reply({ content: '⚠️ CUB AI is not active. Use `/cubai join` first.', ephemeral: true });
    }

    const chosen = interaction.options.getString('name');

    if (chosen === 'random') {
        state.personality = pickPersonality();
    } else {
        const found = PERSONALITIES.find(p => p.name.toLowerCase() === chosen.toLowerCase());
        if (!found) {
            return interaction.reply({ content: `⚠️ Unknown personality: ${chosen}`, ephemeral: true });
        }
        state.personality = found;
    }

    console.log(`[CUB AI] Personality changed to: ${state.personality.name}`);

    const ttsText = `Personality switched to ${state.personality.name}.`;
    const tmpWav = path.join(__dirname, `tmp_cubai_personality_${guildId}.wav`);
    try {
        await textToSpeech(cleanForTTS(ttsText), tmpWav);
        const resource = createAudioResource(tmpWav, { inputType: StreamType.Arbitrary });
        state.player.play(resource);
        state.player.once(AudioPlayerStatus.Idle, () => fs.unlink(tmpWav, () => {}));
        state.player.once('error', () => fs.unlink(tmpWav, () => {}));
    } catch (e) {
        fs.unlink(tmpWav, () => {});
    }

    if (state.textChannel) {
        state.textChannel.send(`🎭 **Personality changed to: ${state.personality.name}**`).catch(() => {});
    }

    return interaction.reply({ content: `✅ Personality set to **${state.personality.name}**.`, ephemeral: true });
}

// ---------------------------------------------------------------------------
// Text ask — /cubai ask <question>
// Works with or without an active voice session.
// If voice is active, also enqueues TTS so the bot speaks the answer aloud.
// ---------------------------------------------------------------------------
async function cubAiAsk(interaction) {
    const guildId = interaction.guildId;
    const displayName = interaction.member?.displayName || interaction.user.username;
    const question = interaction.options.getString('question');

    await interaction.deferReply();

    const voiceState = cubAiState.get(guildId);

    // Use the active voice state (keeps shared history) or a lightweight text-only state
    let state;
    if (voiceState) {
        state = voiceState;
    } else {
        if (!textOnlyHistory.has(guildId)) textOnlyHistory.set(guildId, []);
        state = {
            history: textOnlyHistory.get(guildId),
            personality: null,
            impersonate: null,
            client: interaction.client,
            guild: interaction.guild,
            voiceChannelId: null,
            textChannel: interaction.channel
        };
    }

    try {
        const responseText = await askCUBAI(question, displayName, state);

        // Persist history for text-only mode (askCUBAI may have reassigned state.history if it was trimmed)
        if (!voiceState) {
            textOnlyHistory.set(guildId, state.history);
        }

        const personalityTag = state.personality ? ` *(${state.personality.name})*` : '';
        await interaction.editReply(`🤖 **CUB AI → ${displayName}**${personalityTag}\n${responseText}`);

        // Speak the response if bot is in voice
        if (voiceState) {
            enqueueSpeak(voiceState, responseText);
        }
    } catch (err) {
        console.error('[CUB AI] Ask error:', err.message);
        await interaction.editReply(`⚠️ CUB AI error: ${err.message}`).catch(() => {});
    }
}

module.exports = {
    cubAiJoin, cubAiLeave, cubAiPersonality, cubAiAsk, PERSONALITIES, CUBAI_FEATURES,
    getCubAiState: (guildId) => cubAiState.get(guildId),
    // Fun feature functions (called from slash command handlers)
    rapBattle, burnBookAdd, burnBookRead,
    toggleNarratorMode, toggleSportsMode, toggleTherapistMode, toggleEvilMode,
    hotTake, fakeHoroscope, conspiracyTheory, fakeTranslator,
    startTwoTruths, handleTwoTruthsGuess, courtJudge,
};
