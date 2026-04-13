import os
import sys
import re
import json
import secrets
import urllib.parse
from functools import wraps
from flask import Blueprint, render_template, request, jsonify, session, redirect, current_app

# Error reporter — uses the same bot token and incident channel as all other apps
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'shared'))
try:
    import cub_error_reporter as _err_reporter
    from cub_error_reporter import report_error as _report_error_raw, ERRORS as ERR_CODES
    _err_reporter.BOT_TOKEN = os.environ.get('CUB_PROTECTOR_TOKEN', '')
    def report_error(code, message, ctx=None, err=None):
        _report_error_raw(code, message, ctx=ctx, err=err, app_name='CubDeck')
except Exception as _e:
    def report_error(code, message, ctx=None, err=None): pass
    ERR_CODES = {}

# In-memory overlay event queue: "{discord_id}/{deck_name}" → [events...]
_overlay_events = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'cubsoftware-website', 'data')
CUBDECK_DATA_DIR = os.path.join(DATA_DIR, 'cubdeck')

cubdeck_bp = Blueprint(
    'cubdeck', __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static',
    root_path=BASE_DIR
)

# ─── Helpers ───

def ensure_dirs(discord_id=None):
    if discord_id:
        os.makedirs(os.path.join(CUBDECK_DATA_DIR, discord_id), exist_ok=True)
    else:
        os.makedirs(CUBDECK_DATA_DIR, exist_ok=True)

def get_user():
    # Discord login uses the site-wide cub_user session; Twitch login uses cubdeck_user
    return session.get('cub_user') or session.get('cubdeck_user')

def cubdeck_auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if not get_user():
            if request.is_json:
                return jsonify({'error': 'Authentication required'}), 401
            return redirect('/cubdeck')
        return f(*args, **kwargs)
    return decorated

def safe_deck_name(name):
    """Sanitise deck name to safe filename characters."""
    name = re.sub(r'[^\w\-]', '', name.lower().replace(' ', '-'))
    return name[:32] or 'main'

def deck_config_path(discord_id, deck_name):
    ensure_dirs(discord_id)
    return os.path.join(CUBDECK_DATA_DIR, discord_id, f'{safe_deck_name(deck_name)}.json')

def counters_path(discord_id, deck_name):
    ensure_dirs(discord_id)
    return os.path.join(CUBDECK_DATA_DIR, discord_id, f'{safe_deck_name(deck_name)}_counters.json')

def list_user_decks(discord_id):
    """Return list of deck names for a user."""
    user_dir = os.path.join(CUBDECK_DATA_DIR, discord_id)
    if not os.path.isdir(user_dir):
        return ['main']
    names = []
    for f in os.listdir(user_dir):
        if f.endswith('.json') and not f.endswith('_counters.json'):
            names.append(f[:-5])
    return sorted(names) or ['main']

def load_deck_config(discord_id, deck_name):
    path = deck_config_path(discord_id, deck_name)
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    cfg = default_config()
    cfg['deck_name'] = safe_deck_name(deck_name)
    return cfg

def save_deck_config(discord_id, deck_name, config):
    path = deck_config_path(discord_id, deck_name)
    config['deck_name'] = safe_deck_name(deck_name)
    with open(path, 'w') as f:
        json.dump(config, f, indent=2)

# Legacy: support old flat configs (migrate on first access)
def _migrate_legacy(discord_id):
    old_path = os.path.join(CUBDECK_DATA_DIR, f'{discord_id}.json')
    if os.path.exists(old_path):
        try:
            with open(old_path) as f:
                data = json.load(f)
            ensure_dirs(discord_id)
            new_path = deck_config_path(discord_id, 'main')
            if not os.path.exists(new_path):
                with open(new_path, 'w') as f:
                    json.dump(data, f, indent=2)
            os.rename(old_path, old_path + '.migrated')
        except Exception:
            pass

def default_config():
    return {
        'pages': [
            {
                'id': 'page-1',
                'name': 'Main',
                'buttons': []
            }
        ],
        'grid': {'rows': 3, 'cols': 5},
        'obs': {'host': 'localhost', 'port': 4455, 'password': ''},
        'twitch_channel': '',
        'twitch_oauth': '',
        'installed_plugins': ['obs-control', 'obs-display', 'twitch-chat', 'timer', 'counter', 'soundboard', 'media-control', 'utility'],
        'active_page': 0,
        'theme': 'dark',
        'profiles': []
    }

# ─── Routes ───

@cubdeck_bp.route('/')
@cubdeck_bp.route('')
def landing():
    user = get_user()
    return render_template('cubdeck-landing.html', user=user)

@cubdeck_bp.route('/deck')
@cubdeck_auth_required
def deck_redirect():
    user = get_user()
    return redirect(f'/cubdeck/deck/{user["id"]}/main')

@cubdeck_bp.route('/deck/<discord_id>')
def deck_redirect_named(discord_id):
    user = get_user()
    if not user:
        return redirect(f'/login/discord?next=/cubdeck/deck/{discord_id}/main')
    if user['id'] != discord_id:
        return 'This deck belongs to someone else.', 403
    return redirect(f'/cubdeck/deck/{discord_id}/main')

@cubdeck_bp.route('/deck/<discord_id>/<deck_name>')
def deck(discord_id, deck_name):
    user = get_user()
    if not user:
        return redirect(f'/login/discord?next=/cubdeck/deck/{discord_id}/{deck_name}')
    if user['id'] != discord_id:
        return 'This deck belongs to someone else.', 403
    _migrate_legacy(discord_id)
    config = load_deck_config(discord_id, deck_name)
    all_decks = list_user_decks(discord_id)
    return render_template('cubdeck-deck.html', user=user, config=config,
                           deck_name=safe_deck_name(deck_name), all_decks=all_decks)

@cubdeck_bp.route('/deck/<discord_id>/<deck_name>/overlay')
def deck_overlay(discord_id, deck_name):
    """Transparent overlay page — add as OBS Browser Source."""
    return render_template('cubdeck-overlay.html',
                           discord_id=discord_id,
                           deck_name=safe_deck_name(deck_name))

# ─── Auth ───
# Discord login uses the site-wide /login/discord → /login/discord/callback flow.

@cubdeck_bp.route('/auth/twitch/session', methods=['POST'])
def auth_twitch_session():
    """Called from the Twitch callback page to create a server session."""
    data = request.get_json(silent=True) or {}
    uid = data.get('id', '')
    if not uid:
        return jsonify({'ok': False, 'error': 'Missing user id'}), 400
    session['cubdeck_user'] = {
        'id': uid,
        'username': data.get('username', 'Twitch User'),
        'avatar': data.get('avatar', ''),
        'provider': 'twitch'
    }
    # Pre-fill Twitch OAuth token so chat plugin works immediately
    cfg = load_deck_config(uid, 'main')
    if data.get('twitch_token') and not cfg.get('twitch_oauth'):
        cfg['twitch_oauth'] = 'oauth:' + data['twitch_token']
        cfg['twitch_channel'] = data.get('twitch_login', '')
        save_deck_config(uid, 'main', cfg)
    session.permanent = True
    return_url = session.pop('cubdeck_return', None) or f'/cubdeck/deck/{uid}/main'
    return jsonify({'ok': True, 'redirect': return_url})

@cubdeck_bp.route('/auth/logout')
def auth_logout():
    session.pop('cubdeck_user', None)
    return redirect('/cubdeck')

@cubdeck_bp.route('/auth/twitch')
def auth_twitch_login():
    """Initiate Twitch OAuth — used for both login and chat token."""
    client_id = current_app.config.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
    mode = request.args.get('mode', 'login')  # 'login' or 'chat'
    state = secrets.token_urlsafe(16)
    session['cubdeck_twitch_state'] = state
    session['cubdeck_twitch_mode'] = mode
    session['cubdeck_twitch_return'] = request.args.get('return', '/cubdeck')
    scopes = 'user:read:email chat:read chat:edit channel:moderate'
    params = {
        'client_id': client_id,
        'redirect_uri': 'https://cubsoftware.site/cubdeck/auth/twitch/callback',
        'response_type': 'token',
        'scope': scopes,
        'state': state,
        'force_verify': 'false'
    }
    return redirect(f"https://id.twitch.tv/oauth2/authorize?{urllib.parse.urlencode(params)}")

@cubdeck_bp.route('/auth/twitch/callback')
def auth_twitch_callback():
    # Token arrives as URL fragment (#access_token=...) — handled client-side JS.
    # mode and return_url are passed via session so the callback page knows what to do.
    mode = session.get('cubdeck_twitch_mode', 'login')
    return_url = session.get('cubdeck_twitch_return', '/cubdeck')
    return render_template('cubdeck-twitch-callback.html', mode=mode, return_url=return_url)

@cubdeck_bp.route('/auth/twitch/save-chat-token', methods=['POST'])
@cubdeck_auth_required
def auth_save_chat_token():
    """Called from the Twitch callback page (redirect mode) to save the chat token."""
    data = request.get_json(silent=True) or {}
    token = data.get('token', '')
    login = data.get('login', '')
    if not token:
        return jsonify({'ok': False, 'error': 'Missing token'}), 400
    user = get_user()
    deck_name = request.args.get('deck', 'main')
    cfg = load_deck_config(user['id'], deck_name)
    cfg['twitch_oauth'] = 'oauth:' + token
    if login:
        cfg['twitch_channel'] = login
    save_deck_config(user['id'], deck_name, cfg)
    return_url = session.pop('cubdeck_twitch_return', f'/cubdeck/deck/{user["id"]}/main')
    return jsonify({'ok': True, 'redirect': return_url})

# ─── API ───

@cubdeck_bp.route('/api/config', methods=['GET'])
@cubdeck_auth_required
def api_get_config():
    user = get_user()
    deck_name = request.args.get('deck', 'main')
    config = load_deck_config(user['id'], deck_name)
    return jsonify(config)

@cubdeck_bp.route('/api/config', methods=['PUT'])
@cubdeck_auth_required
def api_save_config():
    user = get_user()
    deck_name = request.args.get('deck', 'main')
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400
    allowed = {'pages', 'grid', 'obs', 'twitch_channel', 'twitch_oauth',
               'installed_plugins', 'active_page', 'theme', 'profiles', '_saved_at'}
    config = load_deck_config(user['id'], deck_name)
    for key in allowed:
        if key in data:
            config[key] = data[key]
    save_deck_config(user['id'], deck_name, config)
    return jsonify({'ok': True})

@cubdeck_bp.route('/api/config/reset', methods=['POST'])
@cubdeck_auth_required
def api_reset_config():
    user = get_user()
    deck_name = request.args.get('deck', 'main')
    save_deck_config(user['id'], deck_name, default_config())
    return jsonify({'ok': True})

@cubdeck_bp.route('/api/decks', methods=['GET'])
@cubdeck_auth_required
def api_list_decks():
    user = get_user()
    return jsonify({'decks': list_user_decks(user['id'])})

@cubdeck_bp.route('/api/decks', methods=['POST'])
@cubdeck_auth_required
def api_create_deck():
    user = get_user()
    data = request.get_json(silent=True) or {}
    name = safe_deck_name(data.get('name', ''))
    if not name:
        return jsonify({'error': 'Invalid deck name'}), 400
    if name not in list_user_decks(user['id']):
        save_deck_config(user['id'], name, default_config())
    return jsonify({'ok': True, 'name': name, 'url': f'/cubdeck/deck/{user["id"]}/{name}'})

@cubdeck_bp.route('/api/counter/<button_id>', methods=['GET', 'POST'])
@cubdeck_auth_required
def api_counter(button_id):
    user = get_user()
    deck_name = request.args.get('deck', 'main')
    path = counters_path(user['id'], deck_name)
    counters = {}
    if os.path.exists(path):
        try:
            with open(path) as f:
                counters = json.load(f)
        except Exception:
            pass
    if request.method == 'POST':
        data = request.get_json(silent=True) or {}
        action = data.get('action', 'get')
        val = counters.get(button_id, 0)
        if action == 'increment':
            val += data.get('amount', 1)
        elif action == 'decrement':
            val -= data.get('amount', 1)
        elif action == 'reset':
            val = data.get('value', 0)
        elif action == 'set':
            val = data.get('value', 0)
        counters[button_id] = val
        with open(path, 'w') as f:
            json.dump(counters, f)
        return jsonify({'value': val})
    return jsonify({'value': counters.get(button_id, 0)})

@cubdeck_bp.route('/api/overlay/push', methods=['POST'])
@cubdeck_auth_required
def api_overlay_push():
    """Queue an overlay effect from the authenticated deck page."""
    user = get_user()
    deck_name = request.args.get('deck', 'main')
    data = request.get_json(silent=True)
    if not data:
        return jsonify({'error': 'Invalid JSON'}), 400
    key = f"{user['id']}/{safe_deck_name(deck_name)}"
    if key not in _overlay_events:
        _overlay_events[key] = []
    _overlay_events[key].append(data)
    # Cap queue to avoid unbounded growth
    if len(_overlay_events[key]) > 50:
        _overlay_events[key] = _overlay_events[key][-50:]
    return jsonify({'ok': True})

@cubdeck_bp.route('/api/overlay/poll/<discord_id>/<deck_name>')
def api_overlay_poll(discord_id, deck_name):
    """Return and clear pending overlay events — called by the OBS browser source."""
    key = f"{discord_id}/{safe_deck_name(deck_name)}"
    events = list(_overlay_events.get(key, []))
    _overlay_events[key] = []
    return jsonify({'events': events})

@cubdeck_bp.route('/api/available-plugins')
def api_available_plugins():
    plugins = [
        {'id': 'obs-control',    'name': 'OBS Control',     'icon': '🎬', 'description': 'Switch scenes, toggle sources, control stream/recording/replay, mute and set volume.', 'category': 'obs'},
        {'id': 'obs-display',    'name': 'OBS Display',     'icon': '📊', 'description': 'Live info buttons showing current scene, stream status, recording status and duration.', 'category': 'obs'},
        {'id': 'obs-advanced',   'name': 'OBS Advanced',    'icon': '🔬', 'description': 'Virtual camera, transitions, text sources, audio monitoring, studio mode controls and more.', 'category': 'obs'},
        {'id': 'twitch-chat',    'name': 'Twitch Chat',     'icon': '💬', 'description': 'Send messages, announcements, toggle chat modes, mod/ban/timeout users, raids and more.', 'category': 'streaming'},
        {'id': 'timer',          'name': 'Timer',           'icon': '⏱️', 'description': 'Countdown timers, stopwatch, and stream-synced timer buttons.', 'category': 'utility'},
        {'id': 'counter',        'name': 'Counter',         'icon': '🔢', 'description': 'Increment, decrement and reset counters — death counter, hype counter and more.', 'category': 'utility'},
        {'id': 'soundboard',     'name': 'Soundboard',      'icon': '🔊', 'description': 'Play audio from a URL directly in your browser. Stop all sounds with one button.', 'category': 'media'},
        {'id': 'media-control',  'name': 'Media Control',   'icon': '🎵', 'description': 'Control OBS media sources — play, pause, restart, stop and skip.', 'category': 'obs'},
        {'id': 'utility',        'name': 'Utility',         'icon': '🔧', 'description': 'Open URLs, copy text, page switcher, separator labels and blank buttons.', 'category': 'utility'},
        {'id': 'webhooks',       'name': 'Webhooks',        'icon': '🌐', 'description': 'HTTP GET/POST requests, Discord webhooks, IFTTT triggers, Make.com and more.', 'category': 'utility'},
        {'id': 'multi',          'name': 'Multi-Action',    'icon': '⚡', 'description': 'Toggle pairs, TTS, auto-repeat messages, conditional actions, scene macros and more.', 'category': 'utility'},
        {'id': 'display-info',   'name': 'Display & Info',  'icon': '📊', 'description': 'Countdown to date, dice roller, goal tracker, weather, crypto prices, timezone clock and more.', 'category': 'utility'},
        {'id': 'obs-filters',     'name': 'OBS Filters',      'icon': '🎛️', 'description': 'Toggle, enable, disable and configure OBS source filters from your deck.', 'category': 'obs'},
        {'id': 'stream-manager',  'name': 'Stream Manager',    'icon': '📡', 'description': 'Update stream title, category, create markers, run ads and view live stats via Twitch API.', 'category': 'streaming'},
        {'id': 'alerts',          'name': 'Alerts & FX',       'icon': '🚨', 'description': 'Flash screen, show text overlays, confetti, shake effects and countdown overlays.', 'category': 'utility'},
        {'id': 'focus',           'name': 'Focus & Pomodoro',  'icon': '🍅', 'description': 'Pomodoro timer, work/break sessions, pause/resume and session tracking.', 'category': 'utility'},
        {'id': 'notes',           'name': 'Notes & Labels',    'icon': '📝', 'description': 'Static notes, cycle messages, checklists, clipboard saves and random messages.', 'category': 'utility'},
        {'id': 'ambience',        'name': 'Ambience Audio',    'icon': '🌿', 'description': 'Play looping ambient sounds with fade in/out, volume control and presets.', 'category': 'media'},
        {'id': 'spotify',         'name': 'Spotify',           'icon': '🎵', 'description': 'Control Spotify playback — play/pause, skip, volume, shuffle, repeat and now playing display.', 'category': 'media'},
        {'id': 'hotkeys',         'name': 'OBS Hotkeys',       'icon': '⌨️', 'description': 'Trigger any OBS hotkey by name or key sequence directly from your deck.', 'category': 'obs'},
        {'id': 'twitch-eventsub',  'name': 'Twitch Events',    'icon': '📡', 'description': 'Real-time Twitch events via EventSub WebSocket — follow/sub/raid/cheer/hype train counters.', 'category': 'streaming'},
        {'id': 'twitch-extra',     'name': 'Twitch Extra',      'icon': '🎮', 'description': 'Create clips, polls, predictions, run ads, timeout users via Twitch Helix API.', 'category': 'streaming'},
        {'id': 'voice',            'name': 'Voice Control',     'icon': '🎤', 'description': 'Text-to-speech with voice selection, Web Speech recognition, and voice-activated commands.', 'category': 'utility'},
        {'id': 'scheduler',        'name': 'Scheduler',         'icon': '🕐', 'description': 'Auto-repeat chat messages, run at specific time, one-shot delays and job management.', 'category': 'utility'},
        {'id': 'youtube',          'name': 'YouTube',           'icon': '▶️', 'description': 'YouTube live stats, update stream title, send live chat messages via YouTube Data API.', 'category': 'streaming'},
        {'id': 'streamelements',   'name': 'StreamElements',    'icon': '⚡', 'description': 'SE bot chat, test alerts, manage loyalty points, run giveaways and song requests.', 'category': 'streaming'},
        {'id': 'obs-sources',      'name': 'OBS Sources',       'icon': '🖼️', 'description': 'Update browser/image/color sources, set scene item position/scale/crop, refresh browser sources.', 'category': 'obs'},
        {'id': 'social',           'name': 'Social Media',      'icon': '🌐', 'description': 'Post to Mastodon, Bluesky, Discord webhook with embeds, Telegram messages, Web Share.', 'category': 'utility'},
        {'id': 'notifications',    'name': 'Notifications',     'icon': '🔔', 'description': 'Desktop browser notifications, scheduled reminders, mobile vibration.', 'category': 'utility'},
        {'id': 'lastfm',           'name': 'Last.fm',           'icon': '🎵', 'description': 'Display now-playing track, post now-playing to chat, top track sharing via Last.fm API.', 'category': 'media'},
        {'id': 'vtube-studio',     'name': 'VTube Studio',      'icon': '🎭', 'description': 'Connect to VTube Studio, trigger hotkeys, move model, toggle expressions, load models.', 'category': 'utility'},
        {'id': 'github',           'name': 'GitHub',            'icon': '🐙', 'description': 'Repo stats display, create issues, trigger workflows, latest release display for dev streamers.', 'category': 'utility'},
        {'id': 'kick',             'name': 'Kick.tv',           'icon': '🟢', 'description': 'Kick.tv live stats display, connect to Kick chat via Pusher WebSocket.', 'category': 'streaming'},
        {'id': 'home-assistant',   'name': 'Home Assistant',    'icon': '🏠', 'description': 'Control smart home devices via Home Assistant REST API — lights, switches, scripts, sensors.', 'category': 'utility'},
        {'id': 'streamlabs',       'name': 'StreamLabs',        'icon': '⚡', 'description': 'Real-time StreamLabs alerts via Socket API, test alerts, skip alerts, mute and donation counter.', 'category': 'streaming'},
        {'id': 'livesplit',        'name': 'LiveSplit',         'icon': '⏱️', 'description': 'Control LiveSplit speedrun timer — split, undo, reset, skip, pause and real-time display.', 'category': 'utility'},
        {'id': 'twitch-rewards',   'name': 'Channel Points',    'icon': '🏆', 'description': 'Manage Twitch channel point rewards — toggle, enable, disable, set cost, create rewards.', 'category': 'streaming'},
        {'id': 'discord',          'name': 'Discord',           'icon': '🔵', 'description': 'Send webhook messages and embeds, Discord bot messages, go-live announcements.', 'category': 'utility'},
        {'id': 'random',           'name': 'Random & Picker',   'icon': '🎲', 'description': 'Random number, coin flip, dice roll, pick from list, shuffle, random chat user, Magic 8-Ball.', 'category': 'utility'},
        {'id': 'streamerbot',      'name': 'StreamerBot',       'icon': '🤖', 'description': 'Run StreamerBot actions by name or ID, set global variables, send Twitch messages via bot.', 'category': 'utility'},
        {'id': 'openai',           'name': 'OpenAI / ChatGPT',  'icon': '🧠', 'description': 'Generate chat responses, auto-generate stream titles, AI chat comments and fun facts via GPT.', 'category': 'utility'},
        {'id': 'obs-stats',        'name': 'OBS Stats',         'icon': '📊', 'description': 'Live OBS performance displays — CPU, FPS, memory, dropped frames, disk space.', 'category': 'obs'},
        {'id': 'clipboard',        'name': 'Clipboard & Snippets', 'icon': '📋', 'description': 'Copy text to clipboard, quick-paste snippets to Twitch chat, cycle through social links.', 'category': 'utility'},
        {'id': 'obs-profile',      'name': 'OBS Profiles',      'icon': '🗂️', 'description': 'Switch OBS profiles and scene collections with one button tap.', 'category': 'obs'},
        {'id': 'voicemeeter',      'name': 'VoiceMeeter',       'icon': '🎚️', 'description': 'Control VoiceMeeter via Web MIDI API — strip/bus mute, gain, macro buttons. No extra software needed.', 'category': 'audio'},
        {'id': 'elgato-light',     'name': 'Elgato Key Light',  'icon': '💡', 'description': 'Control Elgato Key Light / Key Light Air brightness and color temperature via local REST API.', 'category': 'hardware'},
        {'id': 'hue',              'name': 'Philips Hue',       'icon': '💡', 'description': 'Control Philips Hue lights — toggle, color, brightness, scenes and room groups via local Bridge API.', 'category': 'hardware'},
        {'id': 'wled',             'name': 'WLED',              'icon': '🌈', 'description': 'Control WLED LED strips — on/off, color, effects, presets and live alert flash via local REST API.', 'category': 'hardware'},
        {'id': 'nanoleaf',         'name': 'Nanoleaf',          'icon': '🍃', 'description': 'Control Nanoleaf light panels — toggle, brightness, color temp, hue/sat and effects via local API.', 'category': 'hardware'},
        {'id': 'nightbot',         'name': 'Nightbot',          'icon': '🤖', 'description': 'Manage Nightbot chat bot — send messages, add/enable/disable commands, toggle timers.', 'category': 'streaming'},
        {'id': 'vlc',              'name': 'VLC Media Player',  'icon': '🎬', 'description': 'Control VLC via HTTP interface — play/pause, stop, next/prev, volume, now playing display, open files.', 'category': 'media'},
        {'id': 'soundpad',         'name': 'Soundpad',          'icon': '🔈', 'description': 'Trigger Soundpad sounds by index or title, stop playback, volume up/down via local REST API.', 'category': 'audio'},
        {'id': 'midi',             'name': 'MIDI',              'icon': '🎹', 'description': 'Send MIDI messages to any device — notes, CC, program change, pitch bend and all-notes-off panic.', 'category': 'audio'},
        {'id': 'steam',            'name': 'Steam',             'icon': '🎮', 'description': 'Display current game, online status, recent games and post to chat via Steam Web API.', 'category': 'utility'},
        {'id': 'govee',            'name': 'Govee Lights',      'icon': '💡', 'description': 'Control Govee smart lights — toggle, color, brightness, scenes via Govee Developer API.', 'category': 'hardware'},
        {'id': 'cub-overlays',     'name': 'CUB Overlays',      'icon': '🎨', 'description': 'Control your CUB SOFTWARE stream overlays — countdown timers, goal bars, counters, widgets, background effects and templates.', 'category': 'streaming'},
    ]
    return jsonify(plugins)
