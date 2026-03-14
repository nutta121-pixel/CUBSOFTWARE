/**
 * CUB Podcast Player
 * Uses a free podcast search API (no key) + rss-parser + @discordjs/voice + ffmpeg
 * Per-guild sessions — works across unlimited servers simultaneously
 *
 * Features:
 *  - Play any podcast by name, search results, or category browse
 *  - Auto-plays next episode when current finishes
 *  - Queue system (add multiple episodes/podcasts)
 *  - Playback speed control (0.5x – 2x) via ffmpeg atempo filter
 *  - Pause / resume / stop / skip
 *  - Server subscriptions (saved favourite podcasts)
 *  - Playback history (last 30 per server)
 *  - Bookmarks — save exact position, resume later with seek
 *  - Interactive now-playing embed with live buttons
 *  - Browse by category (15 genre choices)
 *  - Trending (top picks across 5 major genres, parallel fetch)
 */

const {
    joinVoiceChannel,
    createAudioPlayer,
    createAudioResource,
    AudioPlayerStatus,
    VoiceConnectionStatus,
    StreamType,
} = require('@discordjs/voice');

const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
} = require('discord.js');

const { spawn }  = require('child_process');
const https      = require('https');
const http       = require('http');
const fs         = require('fs');
const path       = require('path');

// rss-parser: npm install rss-parser
let Parser = null;
try { Parser = require('rss-parser'); } catch (_) {}

// ── Data files ────────────────────────────────────────────────────────────────
const DATA_DIR        = path.join(__dirname, 'data');
const SUBS_FILE       = path.join(DATA_DIR, 'podcast_subscriptions.json');
const HISTORY_FILE    = path.join(DATA_DIR, 'podcast_history.json');
const BOOKMARKS_FILE  = path.join(DATA_DIR, 'podcast_bookmarks.json');

function loadJson(file) {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function saveJson(file, data) {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let subscriptions = loadJson(SUBS_FILE);
let history       = loadJson(HISTORY_FILE);
let bookmarks     = loadJson(BOOKMARKS_FILE);

function saveSubscriptions() { saveJson(SUBS_FILE, subscriptions); }
function saveHistory()       { saveJson(HISTORY_FILE, history); }
function saveBookmarks()     { saveJson(BOOKMARKS_FILE, bookmarks); }

function addToHistory(guildId, podcastName, episodeTitle) {
    if (!history[guildId]) history[guildId] = [];
    history[guildId].unshift({ podcastName, episodeTitle, playedAt: new Date().toISOString() });
    if (history[guildId].length > 30) history[guildId] = history[guildId].slice(0, 30);
    saveHistory();
}

// ── Genre / category map ──────────────────────────────────────────────────────
const GENRES = {
    'true-crime': { id: 1567, name: 'True Crime',        emoji: '🔪' },
    'comedy':     { id: 1303, name: 'Comedy',            emoji: '😂' },
    'news':       { id: 1307, name: 'News',              emoji: '📰' },
    'science':    { id: 1309, name: 'Science',           emoji: '🔬' },
    'history':    { id: 1502, name: 'History',           emoji: '📖' },
    'business':   { id: 1321, name: 'Business',          emoji: '💼' },
    'technology': { id: 1316, name: 'Technology',        emoji: '🖥️' },
    'sports':     { id: 1315, name: 'Sports',            emoji: '🏆' },
    'education':  { id: 1304, name: 'Education',         emoji: '🎓' },
    'fiction':    { id: 1483, name: 'Fiction & Horror',  emoji: '🎭' },
    'society':    { id: 1314, name: 'Society & Culture', emoji: '👥' },
    'music':      { id: 1306, name: 'Music',             emoji: '🎵' },
    'health':     { id: 1512, name: 'Health & Fitness',  emoji: '💪' },
    'arts':       { id: 1301, name: 'Arts',              emoji: '🎨' },
    'kids':       { id: 1305, name: 'Kids & Family',     emoji: '👨‍👩‍👧' },
};

const PODCAST_COLOR = 0x9B59B6;

// ── Per-guild sessions & pending select menus ─────────────────────────────────
const sessions      = new Map(); // guildId → session
const pendingSearch = new Map(); // interactionId → [podcastResult]  (5 min TTL)

// ── Podcast search API helpers ────────────────────────────────────────────────
function podcastApiGet(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'CUBPodcast/1.0' } }, (res) => {
            let body = '';
            res.on('data', d => body += d);
            res.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch { reject(new Error('Podcast search API returned invalid JSON')); }
            });
        }).on('error', reject);
    });
}

function mapItunesResult(r) {
    return {
        id:           r.collectionId,
        name:         r.collectionName,
        author:       r.artistName,
        feedUrl:      r.feedUrl,
        artwork:      r.artworkUrl600 || r.artworkUrl100,
        genres:       r.genres || [],
        episodeCount: r.trackCount || 0,
    };
}

async function searchPodcasts(query, limit = 8) {
    const enc  = encodeURIComponent(query);
    const data = await podcastApiGet(`https://itunes.apple.com/search?term=${enc}&entity=podcast&limit=${limit}`);
    return (data.results || []).map(mapItunesResult).filter(r => r.feedUrl);
}

async function getTopByGenre(genreId, limit = 10) {
    const data = await podcastApiGet(
        `https://itunes.apple.com/search?term=podcast&entity=podcast&genreId=${genreId}&limit=${limit}`
    );
    return (data.results || []).map(mapItunesResult).filter(r => r.feedUrl);
}

// ── RSS feed helpers ──────────────────────────────────────────────────────────
async function parseFeed(feedUrl) {
    if (!Parser) throw new Error('rss-parser not installed — run: npm install rss-parser');
    const parser = new Parser({
        customFields: {
            item: [
                ['itunes:duration',  'duration'],
                ['itunes:episode',   'episodeNumber'],
                ['itunes:season',    'season'],
                ['itunes:image',     'itunesImage'],
                ['itunes:summary',   'summary'],
            ],
        },
        timeout: 15000,
    });
    return parser.parseURL(feedUrl);
}

function formatDuration(raw) {
    if (!raw) return null;
    if (typeof raw === 'string' && raw.includes(':')) return raw;
    const secs = parseInt(raw, 10);
    if (isNaN(secs) || secs <= 0) return null;
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${m}:${String(s).padStart(2, '0')}`;
}

function parseDurationToSeconds(str) {
    if (!str) return 0;
    if (typeof str === 'number') return str;
    const parts = str.split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return parseInt(str, 10) || 0;
}

function buildProgressBar(elapsed, totalSecs, width = 24) {
    const elapsedStr = formatDuration(elapsed) || '0:00';
    if (!totalSecs || totalSecs <= 0) return `🕐 ${elapsedStr} elapsed`;
    const pct    = Math.min(elapsed / totalSecs, 1);
    const filled = Math.round(pct * width);
    const bar    = '█'.repeat(filled) + '░'.repeat(width - filled);
    const totalStr = formatDuration(totalSecs);
    return `\`${bar}\`\n${elapsedStr} / ${totalStr}`;
}

function parseEpisode(item, feedArtwork) {
    const audioUrl = item.enclosure?.url || null;
    if (!audioUrl) return null;
    return {
        title:       (item.title || 'Untitled Episode').trim(),
        description: (item.contentSnippet || item.summary || item.content || '').replace(/<[^>]+>/g, '').slice(0, 300),
        audioUrl,
        artwork:     item.itunesImage?.$?.href || item.itunesImage || feedArtwork,
        duration:    formatDuration(item.duration),
        publishDate: item.pubDate
            ? new Date(item.pubDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
            : null,
        episodeNumber: item.episodeNumber || null,
        season:        item.season || null,
        guid:          item.guid,
    };
}

// ── Fast-path RSS streamer ────────────────────────────────────────────────────
// Streams the RSS feed and stops as soon as it finds the first episode.
// Reads only a few KB instead of the full feed — cuts start time to ~300ms.
// Falls back to full parseFeed() if the quick grab fails.
function quickGetLatestEpisode(feedUrl, redirects = 0) {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error('Too many redirects'));
        const mod = feedUrl.startsWith('https') ? https : http;
        let buffer = '';
        let done = false;

        const req = mod.get(feedUrl, { headers: { 'User-Agent': 'CUBPodcast/1.0' } }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.destroy();
                return quickGetLatestEpisode(res.headers.location, redirects + 1).then(resolve).catch(reject);
            }

            res.on('data', chunk => {
                if (done) return;
                buffer += chunk.toString();

                // Extract enclosure URL (the audio file link)
                const encMatch = buffer.match(/<enclosure[^>]+url=["']([^"']+)["']/i);
                if (!encMatch) {
                    if (buffer.length > 150_000) { done = true; req.destroy(); reject(new Error('No episode found in first 150KB')); }
                    return;
                }

                // Grab the <item> block that contains this enclosure
                const encPos      = buffer.indexOf(encMatch[0]);
                const itemStart   = buffer.lastIndexOf('<item', encPos);
                const itemChunk   = itemStart >= 0 ? buffer.slice(itemStart, encPos + encMatch[0].length + 200) : buffer;

                // Title — strip CDATA if present
                const titleMatch  = itemChunk.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i);
                const title       = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Latest Episode';

                // Duration
                const durMatch    = itemChunk.match(/<itunes:duration>([\s\S]*?)<\/itunes:duration>/i);
                const duration    = durMatch ? formatDuration(durMatch[1].trim()) : null;

                // Pub date
                const dateMatch   = itemChunk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
                const publishDate = dateMatch
                    ? new Date(dateMatch[1].trim()).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
                    : null;

                done = true;
                req.destroy();
                res.destroy();
                resolve({ audioUrl: encMatch[1].trim(), title, duration, publishDate, description: '' });
            });

            res.on('end', () => { if (!done) reject(new Error('No audio episode found in feed')); });
        });

        req.setTimeout(10_000, () => { req.destroy(); if (!done) reject(new Error('RSS fetch timed out')); });
        req.on('error', err => { if (!done) reject(err); });
    });
}

// ── Audio playback via ffmpeg ─────────────────────────────────────────────────
// Pass URL directly to ffmpeg so it handles HTTP/redirects itself.
// Supports speed adjustment (atempo chain) and seeking (-ss).

function buildAtempoChain(speed) {
    // atempo must be in [0.5, 2.0] — chain filters for values outside that range
    const filters = [];
    let s = speed;
    while (s > 2.0)  { filters.push('atempo=2.0'); s /= 2.0; }
    while (s < 0.5)  { filters.push('atempo=0.5'); s *= 2.0; }
    filters.push(`atempo=${s.toFixed(4)}`);
    return filters.join(',');
}

function createAudioResourceFromUrl(audioUrl, speed = 1.0, seekSeconds = 0, volume = 1.0) {
    const args = ['-hide_banner', '-loglevel', 'error', '-user_agent', 'CUBPodcast/1.0'];

    if (seekSeconds > 0) args.push('-ss', String(Math.floor(seekSeconds)));

    args.push('-i', audioUrl);

    const filters = [];
    if (volume !== 1.0)  filters.push(`volume=${volume.toFixed(4)}`);
    if (speed  !== 1.0)  filters.push(buildAtempoChain(speed));
    if (filters.length)  args.push('-af', filters.join(','));

    // Output Ogg/Opus directly — ffmpeg handles encoding, no prism-media Opus encoder needed
    args.push('-c:a', 'libopus', '-b:a', '96k', '-ar', '48000', '-ac', '2', '-f', 'ogg', 'pipe:1');

    const ff = spawn('ffmpeg', args);
    ff.stdin.on('error', () => {});
    ff.stderr.on('data', (d) => console.error('[PODCAST] ffmpeg:', d.toString().trim()));
    ff.on('error', (err) => console.error('[PODCAST] ffmpeg error:', err.message));

    return createAudioResource(ff.stdout, { inputType: StreamType.OggOpus });
}

// ── Session management ────────────────────────────────────────────────────────
function createSession(guildId, voiceChannel, textChannel, guild, client) {
    const connection = joinVoiceChannel({
        channelId:       voiceChannel.id,
        guildId,
        adapterCreator:  guild.voiceAdapterCreator,
        selfDeaf:        false,
        selfMute:        false,
    });

    const player = createAudioPlayer();
    player.setMaxListeners(30);
    connection.subscribe(player);

    const session = {
        connection,
        player,
        textChannel,
        guild,
        client,
        voiceChannelId:      voiceChannel.id,
        currentEpisode:      null,   // episode object
        currentPodcast:      null,   // { name, feedUrl, artwork }
        currentEpisodeIndex: 0,      // index in feed (0 = latest)
        queue:               [],     // [{ episode, podcast }]
        paused:              false,
        speed:               1.0,
        volume:              1.0,
        startedAt:           null,   // Date.now() when episode started
        pausedElapsed:       null,   // elapsed seconds at the moment of pause
        autoPlay:            true,
        nowPlayingMessage:   null,
        progressInterval:    null,   // setInterval handle for live progress updates
    };

    sessions.set(guildId, session);

    connection.on(VoiceConnectionStatus.Destroyed, () => sessions.delete(guildId));
    connection.on('error', (err) => {
        console.error('[PODCAST] Connection error:', err.message);
        sessions.delete(guildId);
    });

    // When an episode finishes, auto-play queue → auto-play next in feed → idle
    player.on(AudioPlayerStatus.Idle, async () => {
        const s = sessions.get(guildId);
        if (!s || s.paused) return;

        // 1. Play from queue first
        if (s.queue.length > 0) {
            const next = s.queue.shift();
            await playEpisodeInSession(guildId, next.episode, next.podcast, 0);
            return;
        }

        // 2. Auto-play next episode from the same podcast
        // RSS is newest-first: index 0 = newest, index length-1 = oldest (ep 1).
        // "Next in order" = one index lower (chronologically newer episode).
        if (s.autoPlay && s.currentPodcast?.feedUrl) {
            try {
                const feed     = await parseFeed(s.currentPodcast.feedUrl);
                const episodes = feed.items.map(i => parseEpisode(i, s.currentPodcast.artwork)).filter(Boolean);
                const nextIdx  = s.currentEpisodeIndex - 1;
                if (nextIdx >= 0) {
                    s.currentEpisodeIndex = nextIdx;
                    await playEpisodeInSession(guildId, episodes[nextIdx], s.currentPodcast, 0);
                    return;
                }
            } catch (err) {
                console.error('[PODCAST] Auto-play next error:', err.message);
            }
        }

        // 3. Nothing left — update embed to finished state
        if (s.nowPlayingMessage) {
            s.nowPlayingMessage.edit({ embeds: [buildFinishedEmbed(s)], components: [] }).catch(() => {});
        }
    });

    player.on('error', (err) => {
        console.error('[PODCAST] Player error:', err.message);
        const s = sessions.get(guildId);
        if (s?.textChannel) s.textChannel.send(`⚠️ Playback error: ${err.message}`).catch(() => {});
    });

    return session;
}

function destroySession(guildId) {
    const s = sessions.get(guildId);
    if (!s) return;
    if (s.progressInterval) clearInterval(s.progressInterval);
    try { s.connection.destroy(); } catch {}
    sessions.delete(guildId);
}

function getOrCreateSession(guildId, voiceChannel, textChannel, guild, client) {
    return sessions.get(guildId) || createSession(guildId, voiceChannel, textChannel, guild, client);
}

// ── Embeds ────────────────────────────────────────────────────────────────────
function buildNowPlayingEmbed(session) {
    const ep  = session.currentEpisode;
    const pod = session.currentPodcast;
    if (!ep || !pod) return new EmbedBuilder().setColor(PODCAST_COLOR).setTitle('Nothing playing');

    const icon      = session.paused ? '⏸️' : '▶️';
    const speedTag  = session.speed !== 1.0 ? ` · ${session.speed}x` : '';
    const queueTag  = session.queue.length > 0 ? ` · ${session.queue.length} queued` : '';

    const embed = new EmbedBuilder()
        .setColor(PODCAST_COLOR)
        .setAuthor({ name: pod.name, iconURL: pod.artwork })
        .setTitle(`${icon} ${ep.title}`)
        .setThumbnail(ep.artwork || pod.artwork)
        .setFooter({ text: `🎙️ CUB Podcast Player${speedTag}${queueTag}` });

    if (ep.description) {
        embed.setDescription(ep.description.length > 260
            ? ep.description.slice(0, 260) + '…'
            : ep.description);
    }

    const fields = [];

    // Progress bar
    const elapsed   = getElapsedSeconds(session);
    const totalSecs = parseDurationToSeconds(ep.duration);
    fields.push({ name: '🎵 Progress', value: buildProgressBar(elapsed, totalSecs), inline: false });

    // Metadata
    if (ep.publishDate)   fields.push({ name: '📅 Published', value: ep.publishDate,           inline: true });
    if (ep.episodeNumber) fields.push({ name: '🔢 Episode',   value: String(ep.episodeNumber), inline: true });
    if (fields.length)    embed.addFields(fields);

    return embed;
}

function buildNowPlayingButtons(session) {
    const gid = session.guild.id;
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`pod_pause_${gid}`)
            .setEmoji('⏸️').setLabel('Pause')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(session.paused),
        new ButtonBuilder()
            .setCustomId(`pod_resume_${gid}`)
            .setEmoji('▶️').setLabel('Resume')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!session.paused),
        new ButtonBuilder()
            .setCustomId(`pod_skip_${gid}`)
            .setEmoji('⏭️').setLabel('Next Ep')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId(`pod_bmark_${gid}`)
            .setEmoji('🔖').setLabel('Bookmark')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId(`pod_stop_${gid}`)
            .setEmoji('⏹️').setLabel('Stop')
            .setStyle(ButtonStyle.Danger),
    );
    return [row];
}

function buildFinishedEmbed(session) {
    const pod = session.currentPodcast;
    return new EmbedBuilder()
        .setColor(0x95A5A6)
        .setTitle('⏹️ Playback finished')
        .setThumbnail(pod?.artwork)
        .setDescription(pod
            ? `Finished playing **${pod.name}**.\nUse \`/podcast play\` to listen to more.`
            : 'Nothing queued.')
        .setFooter({ text: '🎙️ CUB Podcast Player' });
}

// ── Core playback ─────────────────────────────────────────────────────────────
async function playEpisodeInSession(guildId, episode, podcast, seekSeconds = 0) {
    const session = sessions.get(guildId);
    if (!session) return;

    session.currentEpisode      = episode;
    session.currentPodcast      = podcast;
    session.paused              = false;
    session.pausedElapsed       = null;
    session.startedAt           = Date.now() - (seekSeconds * 1000);

    // Start live progress update interval (every 15s while playing)
    if (session.progressInterval) clearInterval(session.progressInterval);
    session.progressInterval = setInterval(() => {
        const s = sessions.get(guildId);
        if (!s || s.paused || !s.nowPlayingMessage) return;
        s.nowPlayingMessage.edit({
            embeds:     [buildNowPlayingEmbed(s)],
            components: buildNowPlayingButtons(s),
        }).catch(() => {});
    }, 15_000);

    addToHistory(guildId, podcast.name, episode.title);

    try {
        const resource = createAudioResourceFromUrl(episode.audioUrl, session.speed, seekSeconds, session.volume);
        session.player.play(resource);
    } catch (err) {
        console.error('[PODCAST] Play error:', err.message);
        if (session.textChannel) session.textChannel.send(`⚠️ Could not play this episode: ${err.message}`).catch(() => {});
        return;
    }

    const embed      = buildNowPlayingEmbed(session);
    const components = buildNowPlayingButtons(session);

    if (session.nowPlayingMessage) {
        session.nowPlayingMessage.edit({ embeds: [embed], components }).catch(() => {});
    } else if (session.textChannel) {
        session.nowPlayingMessage = await session.textChannel.send({ embeds: [embed], components }).catch(() => null);
    }
}

function getElapsedSeconds(session) {
    if (session.pausedElapsed !== null) return session.pausedElapsed;
    if (!session.startedAt) return 0;
    return Math.floor((Date.now() - session.startedAt) / 1000 * session.speed);
}

// ── Command handlers ──────────────────────────────────────────────────────────

// /podcast play <podcast> [episode]
async function podcastPlay(interaction) {
    const query      = interaction.options.getString('podcast');
    const episodeNum = interaction.options.getInteger('episode');
    const voice      = interaction.member?.voice?.channel;
    if (!voice) return interaction.reply({ content: '🎙️ Join a voice channel first.', ephemeral: true });

    await interaction.deferReply();
    try {
        const results = await searchPodcasts(query, 1);
        if (!results.length) return interaction.editReply(`❌ No podcast found for **"${query}"**. Try \`/podcast search\`.`);

        const podcast = results[0];

        // ── Fast path: no episode number → stream RSS to grab latest immediately ──
        if (!episodeNum) {
            const session = getOrCreateSession(interaction.guildId, voice, interaction.channel, interaction.guild, interaction.client);
            session.currentEpisodeIndex = 0; // 0 = latest in RSS

            const isPlaying = session.player.state.status === AudioPlayerStatus.Playing
                           || session.player.state.status === AudioPlayerStatus.Paused;

            const epInfo  = await quickGetLatestEpisode(podcast.feedUrl);
            const episode = {
                title:         epInfo.title,
                audioUrl:      epInfo.audioUrl,
                duration:      epInfo.duration,
                publishDate:   epInfo.publishDate,
                description:   '',
                artwork:       podcast.artwork,
                episodeNumber: null,
            };

            if (isPlaying) {
                session.queue.push({ episode, podcast });
                return interaction.editReply({
                    embeds: [new EmbedBuilder()
                        .setColor(PODCAST_COLOR)
                        .setTitle('📋 Added to queue')
                        .setDescription(`**${episode.title}**\n*${podcast.name}*`)
                        .setThumbnail(episode.artwork)
                        .addFields([{ name: 'Position', value: `#${session.queue.length}`, inline: true }])
                        .setFooter({ text: '🎙️ CUB Podcast Player' })
                    ],
                });
            }

            await playEpisodeInSession(interaction.guildId, episode, podcast, 0);
            return interaction.editReply(`▶️ Starting **${podcast.name}** — ${episode.title}`);
        }

        // ── Specific episode: full feed parse needed ──────────────────────────────
        // RSS feeds are newest-first, so episode 1 = oldest (last item in array)
        const feed      = await parseFeed(podcast.feedUrl);
        podcast.name    = podcast.name   || feed.title;
        podcast.artwork = podcast.artwork || feed.image?.url;

        const episodes = feed.items.map(i => parseEpisode(i, podcast.artwork)).filter(Boolean);
        if (!episodes.length) return interaction.editReply('❌ This podcast has no playable episodes.');

        // ep 1 → episodes[episodes.length - 1] (oldest), ep N → episodes[length - N]
        const epIdx   = Math.min(Math.max(episodes.length - episodeNum, 0), episodes.length - 1);
        const episode = episodes[epIdx];

        const session = getOrCreateSession(interaction.guildId, voice, interaction.channel, interaction.guild, interaction.client);
        session.currentEpisodeIndex = epIdx;

        const isPlaying = session.player.state.status === AudioPlayerStatus.Playing
                       || session.player.state.status === AudioPlayerStatus.Paused;

        if (isPlaying) {
            session.queue.push({ episode, podcast });
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setColor(PODCAST_COLOR)
                    .setTitle('📋 Added to queue')
                    .setDescription(`**${episode.title}**\n*${podcast.name}*`)
                    .setThumbnail(episode.artwork || podcast.artwork)
                    .addFields([{ name: 'Position', value: `#${session.queue.length}`, inline: true }])
                    .setFooter({ text: '🎙️ CUB Podcast Player' })
                ],
            });
        }

        await playEpisodeInSession(interaction.guildId, episode, podcast, 0);
        return interaction.editReply(`▶️ Starting **${podcast.name}** — Episode ${episodeNum}: ${episode.title}`);
    } catch (err) {
        console.error('[PODCAST] podcastPlay error:', err.message);
        return interaction.editReply(`⚠️ Error: ${err.message}`);
    }
}

// /podcast search <query>
async function podcastSearch(interaction) {
    const query = interaction.options.getString('query');
    await interaction.deferReply();
    try {
        const results = await searchPodcasts(query, 8);
        if (!results.length) return interaction.editReply(`❌ No podcasts found for **"${query}"**.`);

        pendingSearch.set(interaction.id, results);
        setTimeout(() => pendingSearch.delete(interaction.id), 300_000);

        const embed = new EmbedBuilder()
            .setColor(PODCAST_COLOR)
            .setTitle(`🔍 Search: "${query}"`)
            .setDescription(`${results.length} podcasts found. Select one below to play the latest episode.`)
            .setThumbnail(results[0]?.artwork)
            .setFooter({ text: '🎙️ CUB Podcast Player · selection expires in 5 minutes' });

        results.slice(0, 5).forEach((r, i) => embed.addFields([{
            name: `${i + 1}. ${r.name}`,
            value: `by ${r.author || 'Unknown'} · ${r.episodeCount} episodes · ${r.genres[0] || 'Podcast'}`,
            inline: false,
        }]));

        const select = new StringSelectMenuBuilder()
            .setCustomId(`pod_sel_${interaction.id}`)
            .setPlaceholder('Choose a podcast to play…')
            .addOptions(results.slice(0, 8).map((r, i) => ({
                label:       r.name.slice(0, 100),
                description: `${r.episodeCount} eps · ${r.genres[0] || 'Podcast'}`.slice(0, 100),
                value:       `${interaction.id}:${i}`,
                emoji:       '🎙️',
            })));

        return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    } catch (err) {
        console.error('[PODCAST] podcastSearch error:', err.message);
        return interaction.editReply(`⚠️ Search failed: ${err.message}`);
    }
}

// /podcast browse <category>
async function podcastBrowse(interaction) {
    const key   = interaction.options.getString('category');
    const genre = GENRES[key];
    if (!genre) return interaction.reply({ content: '⚠️ Unknown category.', ephemeral: true });

    await interaction.deferReply();
    try {
        const results = await getTopByGenre(genre.id, 10);
        if (!results.length) return interaction.editReply(`❌ No podcasts found for ${genre.emoji} ${genre.name}.`);

        pendingSearch.set(interaction.id, results);
        setTimeout(() => pendingSearch.delete(interaction.id), 300_000);

        const embed = new EmbedBuilder()
            .setColor(PODCAST_COLOR)
            .setTitle(`${genre.emoji} Top ${genre.name} Podcasts`)
            .setThumbnail(results[0]?.artwork)
            .setDescription(`${results.length} podcasts. Pick one to play the latest episode.`)
            .setFooter({ text: '🎙️ CUB Podcast Player' });

        results.slice(0, 8).forEach((r, i) => embed.addFields([{
            name:   `${i + 1}. ${r.name}`,
            value:  `by ${r.author || 'Unknown'} · ${r.episodeCount} episodes`,
            inline: false,
        }]));

        const select = new StringSelectMenuBuilder()
            .setCustomId(`pod_sel_${interaction.id}`)
            .setPlaceholder(`Pick a ${genre.name} podcast…`)
            .addOptions(results.slice(0, 8).map((r, i) => ({
                label:       r.name.slice(0, 100),
                description: `by ${(r.author || 'Unknown').slice(0, 80)}`.slice(0, 100),
                value:       `${interaction.id}:${i}`,
            })));

        return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    } catch (err) {
        console.error('[PODCAST] podcastBrowse error:', err.message);
        return interaction.editReply(`⚠️ Browse failed: ${err.message}`);
    }
}

// /podcast episodes <podcast> [page]
async function podcastEpisodes(interaction) {
    const query = interaction.options.getString('podcast');
    const page  = (interaction.options.getInteger('page') || 1) - 1;
    await interaction.deferReply();
    try {
        const results = await searchPodcasts(query, 1);
        if (!results.length) return interaction.editReply(`❌ Podcast not found: **"${query}"**`);

        const podcast  = results[0];
        const feed     = await parseFeed(podcast.feedUrl);
        podcast.name   = podcast.name || feed.title;
        podcast.artwork = podcast.artwork || feed.image?.url;

        const episodes   = feed.items.map(i => parseEpisode(i, podcast.artwork)).filter(Boolean);
        if (!episodes.length) return interaction.editReply('❌ No playable episodes found.');

        const perPage    = 10;
        const totalPages = Math.ceil(episodes.length / perPage);
        const pageEps    = episodes.slice(page * perPage, (page + 1) * perPage);

        const embed = new EmbedBuilder()
            .setColor(PODCAST_COLOR)
            .setAuthor({ name: podcast.name, iconURL: podcast.artwork })
            .setTitle(`📋 Episodes — Page ${page + 1}/${totalPages}`)
            .setThumbnail(podcast.artwork)
            .setDescription(`${episodes.length} total episodes · \`/podcast play "${podcast.name}" episode:<number>\``)
            .setFooter({ text: '🎙️ CUB Podcast Player' });

        pageEps.forEach((ep, i) => {
            const num  = page * perPage + i + 1;
            const meta = [ep.duration && `⏱ ${ep.duration}`, ep.publishDate && `📅 ${ep.publishDate}`].filter(Boolean).join(' · ');
            embed.addFields([{
                name:   `${num}. ${ep.title.slice(0, 80)}`,
                value:  (ep.description ? ep.description.slice(0, 80) + (ep.description.length > 80 ? '…' : '') : 'No description') + (meta ? `\n*${meta}*` : ''),
                inline: false,
            }]);
        });

        return interaction.editReply({ embeds: [embed] });
    } catch (err) {
        console.error('[PODCAST] podcastEpisodes error:', err.message);
        return interaction.editReply(`⚠️ Error: ${err.message}`);
    }
}

// /podcast nowplaying
async function podcastNowPlaying(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session?.currentEpisode) return interaction.reply({ content: '❌ Nothing is playing right now.', ephemeral: true });
    const msg = await interaction.reply({
        embeds:     [buildNowPlayingEmbed(session)],
        components: buildNowPlayingButtons(session),
        fetchReply: true,
    });
    session.nowPlayingMessage = msg;
}

// /podcast pause
async function podcastPause(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
    if (session.paused) return interaction.reply({ content: '⏸️ Already paused.', ephemeral: true });
    session.player.pause();
    session.paused = true;
    session.pausedElapsed = getElapsedSeconds(session);
    if (session.nowPlayingMessage) {
        session.nowPlayingMessage.edit({ embeds: [buildNowPlayingEmbed(session)], components: buildNowPlayingButtons(session) }).catch(() => {});
    }
    return interaction.reply({ content: '⏸️ Paused.', ephemeral: true });
}

// /podcast resume  (unpause)
async function podcastResume(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
    if (!session.paused) return interaction.reply({ content: '▶️ Already playing.', ephemeral: true });
    session.player.unpause();
    session.paused = false;
    if (session.pausedElapsed !== null) {
        session.startedAt = Date.now() - (session.pausedElapsed * 1000 / session.speed);
        session.pausedElapsed = null;
    }
    if (session.nowPlayingMessage) {
        session.nowPlayingMessage.edit({ embeds: [buildNowPlayingEmbed(session)], components: buildNowPlayingButtons(session) }).catch(() => {});
    }
    return interaction.reply({ content: '▶️ Resumed.', ephemeral: true });
}

// /podcast stop
async function podcastStop(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
    if (session.nowPlayingMessage) {
        session.nowPlayingMessage.edit({ embeds: [buildFinishedEmbed(session)], components: [] }).catch(() => {});
    }
    destroySession(interaction.guildId);
    return interaction.reply({ content: '⏹️ Stopped and left the voice channel.', ephemeral: true });
}

// /podcast skip
async function podcastSkip(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });
    await interaction.deferReply({ ephemeral: true });

    // Queue has priority
    if (session.queue.length > 0) {
        const next = session.queue.shift();
        session.player.stop(true);
        await playEpisodeInSession(interaction.guildId, next.episode, next.podcast, 0);
        return interaction.editReply(`⏭️ Now playing: **${next.episode.title}**`);
    }

    // Try next in same feed
    if (session.currentPodcast?.feedUrl) {
        try {
            const feed     = await parseFeed(session.currentPodcast.feedUrl);
            const episodes = feed.items.map(i => parseEpisode(i, session.currentPodcast.artwork)).filter(Boolean);
            const nextIdx  = session.currentEpisodeIndex - 1;
            if (nextIdx >= 0) {
                session.currentEpisodeIndex = nextIdx;
                session.player.stop(true);
                await playEpisodeInSession(interaction.guildId, episodes[nextIdx], session.currentPodcast, 0);
                const epNum = episodes.length - nextIdx;
                return interaction.editReply(`⏭️ Episode ${epNum}: **${episodes[nextIdx].title}**`);
            }
        } catch (err) {
            console.error('[PODCAST] Skip fetch error:', err.message);
        }
    }

    return interaction.editReply('⏭️ No more episodes in queue or feed.');
}

// /podcast queue
async function podcastQueue(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session) return interaction.reply({ content: '❌ Nothing playing.', ephemeral: true });

    const embed = new EmbedBuilder()
        .setColor(PODCAST_COLOR)
        .setTitle('📋 Episode Queue')
        .setFooter({ text: '🎙️ CUB Podcast Player' });

    if (session.currentEpisode) {
        embed.addFields([{
            name:   `${session.paused ? '⏸️' : '▶️'} Now Playing`,
            value:  `**${session.currentEpisode.title}**\n*${session.currentPodcast.name}*`,
            inline: false,
        }]);
    }

    if (session.queue.length === 0) {
        embed.setDescription('Queue is empty — episodes will auto-play from the current podcast.');
    } else {
        session.queue.forEach((item, i) => embed.addFields([{
            name:   `${i + 1}. ${item.episode.title.slice(0, 80)}`,
            value:  `*${item.podcast.name}*`,
            inline: false,
        }]));
    }

    return interaction.reply({ embeds: [embed] });
}

// /podcast speed <rate>
async function podcastSpeed(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session) return interaction.reply({ content: '❌ Nothing playing. Start a podcast first.', ephemeral: true });

    const speed = parseFloat(interaction.options.getString('rate'));
    if (isNaN(speed)) return interaction.reply({ content: '⚠️ Invalid speed.', ephemeral: true });

    session.speed = speed;

    if (session.currentEpisode && session.player.state.status !== AudioPlayerStatus.Idle) {
        const elapsed = getElapsedSeconds(session);
        await interaction.reply({ content: `⚡ Speed set to **${speed}x** — restarting episode from ~${formatDuration(elapsed) || '0:00'}...`, ephemeral: true });
        try {
            const resource = createAudioResourceFromUrl(session.currentEpisode.audioUrl, speed, elapsed, session.volume);
            session.startedAt = Date.now() - (elapsed * 1000);
            session.player.play(resource);
        } catch (err) {
            console.error('[PODCAST] Speed change error:', err.message);
        }
    } else {
        await interaction.reply({ content: `⚡ Speed set to **${speed}x** for next episode.`, ephemeral: true });
    }
}

// /podcast volume <level>
async function podcastVolume(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session) return interaction.reply({ content: '❌ Nothing playing. Start a podcast first.', ephemeral: true });

    const level = interaction.options.getInteger('level');
    if (level < 1 || level > 200) return interaction.reply({ content: '⚠️ Volume must be between 1 and 200.', ephemeral: true });

    const volume = level / 100;
    session.volume = volume;

    if (session.currentEpisode && session.player.state.status !== AudioPlayerStatus.Idle) {
        const elapsed = getElapsedSeconds(session);
        await interaction.reply({ content: `🔊 Volume set to **${level}%** — restarting from ~${formatDuration(elapsed) || '0:00'}...`, ephemeral: true });
        try {
            const resource = createAudioResourceFromUrl(session.currentEpisode.audioUrl, session.speed, elapsed, volume);
            session.startedAt = Date.now() - (elapsed * 1000);
            session.player.play(resource);
        } catch (err) {
            console.error('[PODCAST] Volume change error:', err.message);
        }
    } else {
        await interaction.reply({ content: `🔊 Volume set to **${level}%** for next episode.`, ephemeral: true });
    }
}

// /podcast seek <time>  — accepts 1:30, 1:30:00, or raw seconds
async function podcastSeek(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session?.currentEpisode) return interaction.reply({ content: '❌ Nothing playing. Start a podcast first.', ephemeral: true });

    const input = interaction.options.getString('time').trim();

    // Parse HH:MM:SS, MM:SS, or plain seconds
    let targetSeconds = 0;
    if (/^\d+$/.test(input)) {
        targetSeconds = parseInt(input, 10);
    } else {
        const parts = input.split(':').map(Number);
        if (parts.some(isNaN)) return interaction.reply({ content: '⚠️ Invalid time. Use `1:30`, `1:30:00`, or seconds like `90`.', ephemeral: true });
        if (parts.length === 2) targetSeconds = parts[0] * 60 + parts[1];
        else if (parts.length === 3) targetSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        else return interaction.reply({ content: '⚠️ Invalid time format.', ephemeral: true });
    }

    await interaction.reply({ content: `⏩ Seeking to **${formatDuration(targetSeconds) || `${targetSeconds}s`}**...`, ephemeral: true });

    try {
        const resource = createAudioResourceFromUrl(session.currentEpisode.audioUrl, session.speed, targetSeconds, session.volume);
        session.startedAt = Date.now() - (targetSeconds * 1000);
        session.player.play(resource);
    } catch (err) {
        console.error('[PODCAST] Seek error:', err.message);
    }
}

// /podcast subscribe <podcast>
async function podcastSubscribe(interaction) {
    const query = interaction.options.getString('podcast');
    await interaction.deferReply({ ephemeral: true });
    try {
        const results = await searchPodcasts(query, 1);
        if (!results.length) return interaction.editReply(`❌ Podcast not found: **"${query}"**`);

        const podcast = results[0];
        const guildId = interaction.guildId;
        if (!subscriptions[guildId]) subscriptions[guildId] = [];
        if (subscriptions[guildId].some(s => s.id === podcast.id))
            return interaction.editReply(`📌 **${podcast.name}** is already in your subscriptions.`);
        if (subscriptions[guildId].length >= 25)
            return interaction.editReply('❌ Max 25 subscriptions per server. Remove one first with `/podcast unsubscribe`.');

        subscriptions[guildId].push({
            id:       podcast.id,
            name:     podcast.name,
            author:   podcast.author,
            feedUrl:  podcast.feedUrl,
            artwork:  podcast.artwork,
            genres:   podcast.genres,
            addedAt:  new Date().toISOString(),
            addedBy:  interaction.user.username,
        });
        saveSubscriptions();
        return interaction.editReply(`✅ Subscribed to **${podcast.name}**! It's now in \`/podcast favorites\`.`);
    } catch (err) {
        return interaction.editReply(`⚠️ Error: ${err.message}`);
    }
}

// /podcast unsubscribe <podcast>
async function podcastUnsubscribe(interaction) {
    const query   = interaction.options.getString('podcast').toLowerCase();
    const guildId = interaction.guildId;
    const subs    = subscriptions[guildId] || [];
    const idx     = subs.findIndex(s => s.name.toLowerCase().includes(query));
    if (idx === -1) return interaction.reply({ content: `❌ **"${query}"** not found in subscriptions.`, ephemeral: true });
    const removed = subs.splice(idx, 1)[0];
    saveSubscriptions();
    return interaction.reply({ content: `🗑️ Removed **${removed.name}** from subscriptions.`, ephemeral: true });
}

// /podcast favorites
async function podcastFavorites(interaction) {
    const subs = subscriptions[interaction.guildId] || [];
    const embed = new EmbedBuilder()
        .setColor(PODCAST_COLOR)
        .setTitle(`📌 Server Subscriptions (${subs.length})`)
        .setFooter({ text: '🎙️ CUB Podcast Player' });

    if (!subs.length) {
        embed.setDescription('No subscriptions yet. Use `/podcast subscribe <name>` to save podcasts.');
    } else {
        embed.setThumbnail(subs[0].artwork);
        embed.setDescription('Use `/podcast play <name>` to play any of these.');
        subs.forEach((s, i) => embed.addFields([{
            name:   `${i + 1}. ${s.name}`,
            value:  `by ${s.author || 'Unknown'} · added by ${s.addedBy || 'unknown'}`,
            inline: false,
        }]));
    }
    return interaction.reply({ embeds: [embed] });
}

// /podcast trending
async function podcastTrending(interaction) {
    await interaction.deferReply();
    try {
        const genreKeys = ['true-crime', 'comedy', 'technology', 'science', 'news'];
        const fetched   = await Promise.all(
            genreKeys.map(k => getTopByGenre(GENRES[k].id, 3)
                .then(r => r.map(p => ({ ...p, genre: GENRES[k].name, genreEmoji: GENRES[k].emoji })))
                .catch(() => [])
            )
        );

        const seen    = new Set();
        const results = [];
        for (const group of fetched) {
            for (const r of group) {
                if (!seen.has(r.id)) { seen.add(r.id); results.push(r); }
            }
        }

        pendingSearch.set(interaction.id, results);
        setTimeout(() => pendingSearch.delete(interaction.id), 300_000);

        const embed = new EmbedBuilder()
            .setColor(PODCAST_COLOR)
            .setTitle('🔥 Trending Podcasts')
            .setDescription('Top picks across popular categories. Select one to play.')
            .setFooter({ text: '🎙️ CUB Podcast Player' });

        results.slice(0, 10).forEach(r => embed.addFields([{
            name:   `${r.genreEmoji} ${r.name}`,
            value:  `by ${r.author || 'Unknown'} · ${r.episodeCount} episodes`,
            inline: true,
        }]));

        const select = new StringSelectMenuBuilder()
            .setCustomId(`pod_sel_${interaction.id}`)
            .setPlaceholder('Pick a trending podcast…')
            .addOptions(results.slice(0, 10).map((r, i) => ({
                label:       r.name.slice(0, 100),
                description: `${r.genreEmoji} ${r.genre} · by ${(r.author || 'Unknown').slice(0, 55)}`.slice(0, 100),
                value:       `${interaction.id}:${i}`,
            })));

        return interaction.editReply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(select)] });
    } catch (err) {
        console.error('[PODCAST] podcastTrending error:', err.message);
        return interaction.editReply(`⚠️ Error: ${err.message}`);
    }
}

// /podcast history
async function podcastHistory(interaction) {
    const hist  = history[interaction.guildId] || [];
    const embed = new EmbedBuilder()
        .setColor(PODCAST_COLOR)
        .setTitle(`📜 Recent Podcast History (${hist.length})`)
        .setFooter({ text: '🎙️ CUB Podcast Player' });

    if (!hist.length) {
        embed.setDescription('No episodes played yet.');
    } else {
        hist.slice(0, 15).forEach((h, i) => {
            const date = new Date(h.playedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
            embed.addFields([{
                name:   `${i + 1}. ${h.episodeTitle.slice(0, 80)}`,
                value:  `*${h.podcastName}* · ${date}`,
                inline: false,
            }]);
        });
    }
    return interaction.reply({ embeds: [embed] });
}

// /podcast bookmark  — save current position (per user, works across any server)
async function podcastBookmark(interaction) {
    const session = sessions.get(interaction.guildId);
    if (!session?.currentEpisode) return interaction.reply({ content: '❌ Nothing is playing to bookmark.', ephemeral: true });

    const elapsed = getElapsedSeconds(session);
    const userId  = interaction.user.id;

    bookmarks[userId] = {
        podcastName:  session.currentPodcast.name,
        feedUrl:      session.currentPodcast.feedUrl,
        artwork:      session.currentPodcast.artwork,
        episodeTitle: session.currentEpisode.title,
        audioUrl:     session.currentEpisode.audioUrl,
        episodeIndex: session.currentEpisodeIndex,
        seekSeconds:  elapsed,
        savedAt:      new Date().toISOString(),
        savedBy:      interaction.user.username,
    };
    saveBookmarks();

    return interaction.reply({
        embeds: [new EmbedBuilder()
            .setColor(PODCAST_COLOR)
            .setTitle('🔖 Position Bookmarked')
            .setThumbnail(session.currentEpisode.artwork || session.currentPodcast.artwork)
            .setDescription(`**${session.currentEpisode.title}**\n*${session.currentPodcast.name}*`)
            .addFields([
                { name: '⏱️ Saved at', value: formatDuration(elapsed) || '0:00', inline: true },
                { name: '📌 Tip',      value: 'Use `/podcast continue` anytime in any server to resume here.', inline: false },
            ])
            .setFooter({ text: '🔖 Bookmark saved to your account' })
        ],
        ephemeral: true,
    });
}

// /podcast continue  — resume from saved bookmark (your personal bookmark)
async function podcastContinue(interaction) {
    const bm    = bookmarks[interaction.user.id];  // per-user
    const voice = interaction.member?.voice?.channel;

    if (!bm) return interaction.reply({ content: '❌ No bookmark saved for this server. Use `/podcast bookmark` while playing.', ephemeral: true });
    if (!voice) return interaction.reply({ content: '🎙️ Join a voice channel first.', ephemeral: true });

    await interaction.deferReply();
    try {
        const session = getOrCreateSession(interaction.guildId, voice, interaction.channel, interaction.guild, interaction.client);
        session.currentEpisodeIndex = bm.episodeIndex;

        const episode = {
            title:       bm.episodeTitle,
            audioUrl:    bm.audioUrl,
            artwork:     bm.artwork,
            description: '',
            duration:    null,
            publishDate: null,
            episodeNumber: null,
        };
        const podcast = {
            name:    bm.podcastName,
            feedUrl: bm.feedUrl,
            artwork: bm.artwork,
        };

        const savedDate = new Date(bm.savedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
        await interaction.editReply(
            `▶️ Resuming **${bm.podcastName}** from **${formatDuration(bm.seekSeconds) || '0:00'}**\n` +
            `*Bookmarked on ${savedDate} by ${bm.savedBy}*`
        );

        await playEpisodeInSession(interaction.guildId, episode, podcast, bm.seekSeconds);
    } catch (err) {
        console.error('[PODCAST] podcastContinue error:', err.message);
        return interaction.editReply(`⚠️ Error resuming bookmark: ${err.message}`);
    }
}

// ── Button & select menu handler (called from index.js interactionCreate) ─────
async function handlePodcastInteraction(interaction) {
    const id = interaction.customId;

    // Select menus: pod_sel_<interactionId>  — MUST be checked before the generic pod_ button block
    if (id.startsWith('pod_sel_')) {
        const value = interaction.values?.[0];
        if (!value) return;
        const colonIdx = value.lastIndexOf(':');
        const origId   = value.slice(0, colonIdx);
        const idx      = parseInt(value.slice(colonIdx + 1), 10);
        const results  = pendingSearch.get(origId);

        if (!results) return interaction.reply({ content: '⌛ This selection has expired. Use the command again.', ephemeral: true });
        const podcast = results[idx];
        if (!podcast)  return interaction.reply({ content: '❌ Invalid selection.', ephemeral: true });

        const voice = interaction.member?.voice?.channel;
        if (!voice) return interaction.reply({ content: '🎙️ Join a voice channel first.', ephemeral: true });

        await interaction.deferUpdate();
        try {
            const feed     = await parseFeed(podcast.feedUrl);
            podcast.name   = podcast.name || feed.title;
            podcast.artwork = podcast.artwork || feed.image?.url;

            const episodes = feed.items.map(i => parseEpisode(i, podcast.artwork)).filter(Boolean);
            if (!episodes.length) return interaction.followUp({ content: '❌ No playable episodes.', ephemeral: true });

            const episode = episodes[0];
            const session = getOrCreateSession(interaction.guildId, voice, interaction.channel, interaction.guild, interaction.client);
            session.currentEpisodeIndex = 0;

            const isPlaying = session.player.state.status === AudioPlayerStatus.Playing
                           || session.player.state.status === AudioPlayerStatus.Paused;

            if (isPlaying) {
                session.queue.push({ episode, podcast });
                return interaction.followUp({ content: `📋 Added **${episode.title}** to queue (#${session.queue.length})`, ephemeral: true });
            }

            await playEpisodeInSession(interaction.guildId, episode, podcast, 0);
            await interaction.followUp({ content: `▶️ Playing **${podcast.name}** — ${episode.title}` });
        } catch (err) {
            console.error('[PODCAST] select handler error:', err.message);
            await interaction.followUp({ content: `⚠️ Error: ${err.message}`, ephemeral: true });
        }
        return;
    }

    // Buttons: pod_pause_guildId / pod_resume_guildId / pod_stop_guildId / pod_skip_guildId / pod_bmark_guildId
    if (id.startsWith('pod_')) {
        const parts   = id.split('_');   // ['pod', 'action', ...guildId parts]
        const action  = parts[1];
        // guildId may contain underscores — reconstruct from parts[2..]
        const guildId = parts.slice(2).join('_');

        if (guildId !== interaction.guildId) return interaction.reply({ content: '❌ Wrong server.', ephemeral: true });

        if (action === 'pause')  return podcastPause(interaction);
        if (action === 'resume') return podcastResume(interaction);
        if (action === 'stop')   return podcastStop(interaction);
        if (action === 'skip')   return podcastSkip(interaction);
        if (action === 'bmark')  return podcastBookmark(interaction);
    }
}

module.exports = {
    podcastPlay, podcastSearch, podcastBrowse, podcastEpisodes,
    podcastNowPlaying, podcastPause, podcastResume, podcastStop,
    podcastSkip, podcastQueue, podcastSpeed, podcastVolume, podcastSeek,
    podcastSubscribe, podcastUnsubscribe, podcastFavorites,
    podcastTrending, podcastHistory,
    podcastBookmark, podcastContinue,
    handlePodcastInteraction,
    getPodcastSession: (guildId) => sessions.get(guildId),
};
