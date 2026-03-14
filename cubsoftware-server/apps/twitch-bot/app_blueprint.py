"""
CubAssist — Flask Blueprint
Multi-channel dashboard, REST API, and Twitch OAuth.
"""

import os
import sys
import json
import time
import secrets
import urllib.request
import urllib.parse
from pathlib import Path

from flask import (Blueprint, request, jsonify, session,
                   redirect, render_template)

sys.path.insert(0, str(Path(__file__).parent))
from bot_core import (
    get_bot, get_bot_credentials, _data_dir,
    load_channel_config, save_channel_config,
    register_channel, unregister_channel, get_channels,
    load_config,
)

cubassist_bp = Blueprint(
    'cubassist', __name__,
    template_folder='templates',
    root_path=str(Path(__file__).parent),
)

TWITCH_CLIENT_ID     = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
TWITCH_CLIENT_SECRET = os.environ.get('TWITCH_CLIENT_SECRET', '')

LOGIN_REDIRECT_URI = os.environ.get(
    'CUBASSIST_LOGIN_REDIRECT_URI',
    'https://cubsoftware.site/cubassist/login/callback'
)
ADMIN_REDIRECT_URI = os.environ.get(
    'CUBASSIST_ADMIN_REDIRECT_URI',
    'https://cubsoftware.site/cubassist/admin/callback'
)
# Set CUBASSIST_ADMIN_KEY env var to a secret string to protect the admin token page
ADMIN_KEY = os.environ.get('CUBASSIST_ADMIN_KEY', '')

_login_states: dict[str, float] = {}

# ── Auth helpers ────────────────────────────────────────────────────────────────

def _authed():
    return (session.get('cubassist_user') or
            session.get('cubdeck_user') or
            session.get('cubsoftware_user'))

def _require_auth():
    if not _authed():
        return jsonify({'error': 'Not authenticated'}), 401
    return None

def _user_channel() -> str:
    """Returns the logged-in user's Twitch channel name."""
    user = (session.get('cubassist_user') or
            session.get('cubdeck_user') or
            session.get('cubsoftware_user') or {})
    return user.get('login', '').lower()

def _clean_states(d):
    cutoff = time.time() - 600
    for k in list(d):
        if d[k] < cutoff:
            del d[k]

# ── Dashboard login ─────────────────────────────────────────────────────────────

@cubassist_bp.route('/login')
def login():
    if _authed():
        return redirect('/cubassist/')
    state = secrets.token_urlsafe(16)
    _login_states[state] = time.time()
    _clean_states(_login_states)
    params = urllib.parse.urlencode({
        'client_id':     TWITCH_CLIENT_ID,
        'redirect_uri':  LOGIN_REDIRECT_URI,
        'response_type': 'code',
        'scope':         '',
        'state':         state,
        'force_verify':  'true',
    })
    return redirect(f'https://id.twitch.tv/oauth2/authorize?{params}')

@cubassist_bp.route('/login/callback')
def login_callback():
    code  = request.args.get('code', '')
    state = request.args.get('state', '')
    error = request.args.get('error', '')

    if error:
        return render_template('cubassist-login.html', error=f'Twitch error: {error}')
    if not code or state not in _login_states:
        return render_template('cubassist-login.html', error='Invalid or expired login — please try again.')
    del _login_states[state]

    data = urllib.parse.urlencode({
        'client_id':     TWITCH_CLIENT_ID,
        'client_secret': TWITCH_CLIENT_SECRET,
        'code':          code,
        'grant_type':    'authorization_code',
        'redirect_uri':  LOGIN_REDIRECT_URI,
    }).encode()
    try:
        req = urllib.request.Request(
            'https://id.twitch.tv/oauth2/token', data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as r:
            token_data = json.loads(r.read())
    except Exception as e:
        return render_template('cubassist-login.html', error=f'Login failed: {e}')

    access_token = token_data.get('access_token', '')
    if not access_token:
        return render_template('cubassist-login.html', error='No access token returned.')

    try:
        req2 = urllib.request.Request(
            'https://api.twitch.tv/helix/users',
            headers={
                'Client-Id':     TWITCH_CLIENT_ID,
                'Authorization': f'Bearer {access_token}',
            }
        )
        with urllib.request.urlopen(req2, timeout=10) as r:
            user_info = json.loads(r.read()).get('data', [{}])[0]
    except Exception as e:
        return render_template('cubassist-login.html', error=f'Failed to fetch user info: {e}')

    session['cubassist_user'] = {
        'login':         user_info.get('login', ''),
        'display_name':  user_info.get('display_name', ''),
        'profile_image': user_info.get('profile_image_url', ''),
        'id':            user_info.get('id', ''),
    }

    # Register the user's channel and make the bot join it
    channel = user_info.get('login', '').lower()
    if channel:
        register_channel(channel)
        bot = get_bot()
        if not bot._running:
            bot.start()
        else:
            bot.join_channel(channel)

    return redirect('/cubassist/')

@cubassist_bp.route('/logout')
def logout():
    session.pop('cubassist_user', None)
    return redirect('/cubassist/')

# ── Pages ───────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/')
@cubassist_bp.route('')
def dashboard():
    if not _authed():
        return render_template('cubassist-login.html')
    bot     = get_bot()
    channel = _user_channel()
    cfg     = load_channel_config(channel) if channel else {}
    creds   = get_bot_credentials()
    token   = creds.get('oauth_token', '')
    cfg['oauth_token_masked'] = ('••••••' + token[-4:]) if len(token) > 6 else ('••••' if token else '')
    cfg['bot_nick'] = creds.get('bot_nick', '')
    user = (session.get('cubassist_user') or
            session.get('cubdeck_user') or
            session.get('cubsoftware_user') or {})
    return render_template('cubassist-dashboard.html',
                           config=cfg, status=bot.channel_status(channel), user=user)

# ── Status ──────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/status')
def api_status():
    err = _require_auth()
    if err: return err
    return jsonify(get_bot().channel_status(_user_channel()))

# ── Config ──────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/config', methods=['GET'])
def api_get_config():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    creds   = get_bot_credentials()
    out     = dict(cfg)
    token   = creds.get('oauth_token', '')
    out['oauth_token'] = ('••••••' + token[-4:]) if len(token) > 6 else ('••••' if token else '')
    out['bot_nick']    = creds.get('bot_nick', '')
    return jsonify(out)

@cubassist_bp.route('/api/config', methods=['POST'])
def api_save_config():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    body    = request.get_json(silent=True) or {}
    cfg     = load_channel_config(channel)
    if 'command_prefix' in body:
        cfg['command_prefix'] = str(body['command_prefix']).strip() or '!'
    if 'enabled' in body:
        cfg['enabled'] = bool(body['enabled'])
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Bot control (per channel) ───────────────────────────────────────────────────

@cubassist_bp.route('/api/start', methods=['POST'])
def api_start():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    bot     = get_bot()
    register_channel(channel)
    if not bot._running:
        bot.start()
    else:
        bot.join_channel(channel)
    return jsonify({'ok': True, 'status': bot.channel_status(channel)})

@cubassist_bp.route('/api/stop', methods=['POST'])
def api_stop():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    get_bot().part_channel(channel)
    unregister_channel(channel)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/restart', methods=['POST'])
def api_restart():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    bot     = get_bot()
    bot.part_channel(channel)
    time.sleep(1)
    bot.join_channel(channel)
    return jsonify({'ok': True, 'status': bot.channel_status(channel)})

# ── Chat ────────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/chat', methods=['POST'])
def api_chat():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    msg     = body.get('message', '').strip()
    channel = _user_channel()
    if not msg:
        return jsonify({'error': 'No message'}), 400
    get_bot().send(msg, channel)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/logs')
def api_logs():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    logs    = state.chat_log[-100:] if state else []
    return jsonify({'logs': logs})

# ── Commands ────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/commands', methods=['GET'])
def api_get_commands():
    err = _require_auth()
    if err: return err
    cfg  = load_channel_config(_user_channel())
    cmds = cfg.get('commands', {})
    return jsonify([{'name': k, **v} for k, v in cmds.items()])

@cubassist_bp.route('/api/commands', methods=['POST'])
def api_add_command():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    name    = body.get('name', '').lower().strip().lstrip('!')
    if not name:
        return jsonify({'error': 'Name required'}), 400
    cfg      = load_channel_config(channel)
    existing = cfg.get('commands', {}).get(name, {})
    cfg.setdefault('commands', {})[name] = {
        'response':      body.get('response', ''),
        'user_level':    body.get('user_level', 'everyone'),
        'cooldown':      int(body.get('cooldown', 5)),
        'user_cooldown': int(body.get('user_cooldown', 0)),
        'count':         existing.get('count', 0),
        'enabled':       bool(body.get('enabled', True)),
    }
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/commands/<name>', methods=['DELETE'])
def api_delete_command(name):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    if name in cfg.get('commands', {}):
        del cfg['commands'][name]
        save_channel_config(channel, cfg)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/commands/<name>/toggle', methods=['POST'])
def api_toggle_command(name):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    cmd     = cfg.get('commands', {}).get(name)
    if cmd:
        cmd['enabled'] = not cmd.get('enabled', True)
        save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Timers ──────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/timers', methods=['GET'])
def api_get_timers():
    err = _require_auth()
    if err: return err
    return jsonify(load_channel_config(_user_channel()).get('timers', []))

@cubassist_bp.route('/api/timers', methods=['POST'])
def api_save_timer():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    timers  = cfg.setdefault('timers', [])
    tid     = body.get('id') or secrets.token_hex(4)
    entry   = {
        'id':        tid,
        'name':      body.get('name', 'Timer'),
        'message':   body.get('message', ''),
        'interval':  int(body.get('interval', 1800)),
        'min_lines': int(body.get('min_lines', 0)),
        'enabled':   bool(body.get('enabled', True)),
    }
    existing = next((t for t in timers if t.get('id') == tid), None)
    if existing:
        existing.update(entry)
    else:
        timers.append(entry)
    save_channel_config(channel, cfg)
    return jsonify({'ok': True, 'id': tid})

@cubassist_bp.route('/api/timers/<tid>', methods=['DELETE'])
def api_delete_timer(tid):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    cfg['timers'] = [t for t in cfg.get('timers', []) if t.get('id') != tid]
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── AutoMod ─────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/automod', methods=['GET'])
def api_get_automod():
    err = _require_auth()
    if err: return err
    return jsonify(load_channel_config(_user_channel()).get('automod', {}))

@cubassist_bp.route('/api/automod', methods=['POST'])
def api_save_automod():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    cfg['automod'] = body
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Admin: one-time bot token setup ────────────────────────────────────────────

_admin_states: dict[str, float] = {}

BOT_SCOPES = ' '.join([
    'chat:read', 'chat:edit',
    'channel:moderate',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
    'moderator:read:followers',
    'channel:read:subscriptions',
])

@cubassist_bp.route('/admin/setup')
def admin_setup():
    """Protected route — visit with ?key=YOUR_ADMIN_KEY to authorise the bot account."""
    key = request.args.get('key', '')
    if not ADMIN_KEY or key != ADMIN_KEY:
        return 'Unauthorised', 403
    state = secrets.token_urlsafe(16)
    _admin_states[state] = time.time()
    _clean_states(_admin_states)
    params = urllib.parse.urlencode({
        'client_id':     TWITCH_CLIENT_ID,
        'redirect_uri':  ADMIN_REDIRECT_URI,
        'response_type': 'code',
        'scope':         BOT_SCOPES,
        'state':         state,
        'force_verify':  'true',
    })
    return redirect(f'https://id.twitch.tv/oauth2/authorize?{params}')

@cubassist_bp.route('/admin/callback')
def admin_callback():
    code  = request.args.get('code', '')
    state = request.args.get('state', '')
    error = request.args.get('error', '')

    if error:
        return f'Twitch error: {error}', 400
    if not code or state not in _admin_states:
        return 'Invalid or expired state.', 400
    del _admin_states[state]

    data = urllib.parse.urlencode({
        'client_id':     TWITCH_CLIENT_ID,
        'client_secret': TWITCH_CLIENT_SECRET,
        'code':          code,
        'grant_type':    'authorization_code',
        'redirect_uri':  ADMIN_REDIRECT_URI,
    }).encode()
    try:
        req = urllib.request.Request(
            'https://id.twitch.tv/oauth2/token', data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as r:
            token_data = json.loads(r.read())
    except Exception as e:
        return f'Token exchange failed: {e}', 500

    access_token = token_data.get('access_token', '')
    if not access_token:
        return 'No access token returned.', 500

    try:
        req2 = urllib.request.Request(
            'https://api.twitch.tv/helix/users',
            headers={
                'Client-Id':     TWITCH_CLIENT_ID,
                'Authorization': f'Bearer {access_token}',
            }
        )
        with urllib.request.urlopen(req2, timeout=10) as r:
            user_info = json.loads(r.read()).get('data', [{}])[0]
    except Exception as e:
        return f'Failed to fetch user info: {e}', 500

    nick = user_info.get('login', '')
    # Save to bot_credentials.json
    import json as _json
    creds_path = _data_dir() / 'bot_credentials.json'
    creds_path.write_text(_json.dumps({
        'oauth_token': access_token,
        'bot_nick':    nick,
    }, indent=2))

    bot = get_bot()
    if bot._running:
        bot.stop()
        import time as _time; _time.sleep(1)
        bot.start()

    return f'<h2 style="font-family:sans-serif;color:#57f287">✓ CubAssist bot account connected as <strong>{nick}</strong>. Token saved.</h2>'

# ── Auto-start ──────────────────────────────────────────────────────────────────

def _maybe_autostart():
    creds    = get_bot_credentials()
    channels = get_channels()
    if creds.get('oauth_token') and creds.get('bot_nick') and channels:
        get_bot().start()

_maybe_autostart()
