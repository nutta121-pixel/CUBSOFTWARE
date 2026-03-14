"""
CubAssist — Flask Blueprint
Multi-channel dashboard, REST API, and Twitch OAuth.
"""

import os
import sys
import re
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
    _load_watchtime, _load_warnings, _save_warnings,
    _load_user_notes, _save_user_notes,
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

_json = json

def _load_global_settings() -> dict:
    path = _data_dir() / 'global_settings.json'
    try:
        return _json.loads(path.read_text())
    except Exception:
        return {}

def _save_global_settings(data: dict):
    path = _data_dir() / 'global_settings.json'
    path.write_text(_json.dumps(data, indent=2))

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
        'scope':         'user:write:chat moderation:read channel:bot',
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
        'access_token':  access_token,
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
    body  = request.get_json(silent=True) or {}
    msg   = body.get('message', '').strip()
    if not msg:
        return jsonify({'error': 'No message'}), 400
    user    = _authed()
    token   = user.get('access_token', '')
    user_id = user.get('id', '')
    if not token or not user_id:
        return jsonify({'error': 'Session expired — please log out and log back in'}), 401
    data = json.dumps({'broadcaster_id': user_id, 'sender_id': user_id, 'message': msg}).encode()
    req  = urllib.request.Request(
        'https://api.twitch.tv/helix/chat/messages',
        data=data, method='POST',
        headers={
            'Authorization': f'Bearer {token}',
            'Client-Id':     TWITCH_CLIENT_ID,
            'Content-Type':  'application/json',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            json.loads(r.read())
    except urllib.error.HTTPError as e:
        return jsonify({'error': f'Twitch API error: {e.read().decode()}'}), 502
    except Exception as e:
        return jsonify({'error': str(e)}), 502
    return jsonify({'ok': True})

@cubassist_bp.route('/api/is-bot-mod')
def api_is_bot_mod():
    err = _require_auth()
    if err: return err
    user    = _authed()
    token   = user.get('access_token', '')
    user_id = user.get('id', '')
    if not token or not user_id:
        return jsonify({'is_mod': None, 'error': 'Session expired — please log out and log back in'})
    creds    = get_bot_credentials()
    bot_nick = creds.get('bot_nick', '')
    if not bot_nick:
        return jsonify({'is_mod': None, 'error': 'No bot configured'})
    try:
        req = urllib.request.Request(
            f'https://api.twitch.tv/helix/users?login={urllib.parse.quote(bot_nick)}',
            headers={'Authorization': f'Bearer {token}', 'Client-Id': TWITCH_CLIENT_ID}
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            bot_data = json.loads(r.read()).get('data', [])
        if not bot_data:
            return jsonify({'is_mod': False, 'bot_nick': bot_nick})
        bot_id = bot_data[0]['id']
        req2 = urllib.request.Request(
            f'https://api.twitch.tv/helix/moderation/moderators?broadcaster_id={user_id}&user_id={bot_id}',
            headers={'Authorization': f'Bearer {token}', 'Client-Id': TWITCH_CLIENT_ID}
        )
        with urllib.request.urlopen(req2, timeout=10) as r:
            mod_data = json.loads(r.read()).get('data', [])
        return jsonify({'is_mod': len(mod_data) > 0, 'bot_nick': bot_nick})
    except Exception as e:
        return jsonify({'is_mod': None, 'error': str(e)})

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

# ── Custom variables ────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/customvars', methods=['GET'])
def api_get_customvars():
    err = _require_auth()
    if err: return err
    cfg = load_channel_config(_user_channel())
    return jsonify(cfg.get('custom_vars', {}))

@cubassist_bp.route('/api/customvars', methods=['POST'])
def api_set_customvar():
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    name  = body.get('name', '').strip().lower()
    value = body.get('value', '')
    if not name or not re.match(r'^[a-zA-Z0-9_]+$', name):
        return jsonify({'error': 'Invalid variable name'}), 400
    channel = _user_channel()
    cfg = load_channel_config(channel)
    cfg.setdefault('custom_vars', {})[name] = value
    save_channel_config(channel, cfg)
    return jsonify({'ok': True, 'vars': cfg['custom_vars']})

@cubassist_bp.route('/api/customvars/<name>', methods=['DELETE'])
def api_delete_customvar(name):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg = load_channel_config(channel)
    cfg.get('custom_vars', {}).pop(name, None)
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Giveaway ────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/giveaway', methods=['GET'])
def api_giveaway_get():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if not state:
        return jsonify({'active': False, 'entries_open': False, 'prize': '', 'entries': [], 'winner': None, 'started_ts': 0})
    gw = dict(state.giveaway)
    gw['entry_count'] = len(gw.get('entries', []))
    return jsonify(gw)

@cubassist_bp.route('/api/giveaway/start', methods=['POST'])
def api_giveaway_start():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    prize   = body.get('prize', 'a prize').strip() or 'a prize'
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if not state:
        return jsonify({'error': 'Bot not connected to channel'}), 400
    state.giveaway = {'active': True, 'entries_open': True, 'prize': prize,
                      'entries': [], 'winner': None, 'started_ts': int(time.time())}
    bot.send(f'🎉 Giveaway started! Prize: {prize} — type !enter to join!', channel)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/giveaway/draw', methods=['POST'])
def api_giveaway_draw():
    err = _require_auth()
    if err: return err
    import random as _random
    body    = request.get_json(silent=True) or {}
    redraw  = body.get('redraw', False)
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if not state or not state.giveaway.get('active'):
        return jsonify({'error': 'No active giveaway'}), 400
    entries = state.giveaway.get('entries', [])
    if redraw:
        prev    = (state.giveaway.get('winner') or {}).get('user_id', '')
        entries = [e for e in entries if e.get('user_id') != prev]
    if not entries:
        return jsonify({'error': 'No entries'}), 400
    winner = _random.choice(entries)
    state.giveaway['winner'] = winner
    state.giveaway['entries_open'] = False
    label = 'Redraw! New winner' if redraw else 'The winner is'
    bot.send(f'🎊 {label}: @{winner["nick"]}! Congratulations! 🎉', channel)
    return jsonify({'ok': True, 'winner': winner})

@cubassist_bp.route('/api/giveaway/end', methods=['POST'])
def api_giveaway_end():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if state:
        state.giveaway = {'active': False, 'entries_open': False, 'prize': '',
                          'entries': [], 'winner': None, 'started_ts': 0}
        bot.send('Giveaway ended.', channel)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/giveaway/toggle-entries', methods=['POST'])
def api_giveaway_toggle_entries():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if not state or not state.giveaway.get('active'):
        return jsonify({'error': 'No active giveaway'}), 400
    state.giveaway['entries_open'] = not state.giveaway.get('entries_open', False)
    open_ = state.giveaway['entries_open']
    msg   = '✅ Entries are open! Type !enter to join!' if open_ else f'🔒 Entries closed. {len(state.giveaway["entries"])} in the draw.'
    bot.send(msg, channel)
    return jsonify({'ok': True, 'entries_open': open_})

# ── Poll ─────────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/poll', methods=['GET'])
def api_poll_get():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if not state:
        return jsonify({'active': False, 'question': '', 'options': [], 'votes': {}, 'started_ts': 0})
    p = dict(state.poll)
    p.pop('voted', None)  # don't expose the set of user IDs
    p['total_votes'] = sum(p.get('votes', {}).values())
    return jsonify(p)

@cubassist_bp.route('/api/poll/start', methods=['POST'])
def api_poll_start():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    question = body.get('question', '').strip()
    options  = [o.strip() for o in body.get('options', []) if str(o).strip()]
    if not question or len(options) < 2:
        return jsonify({'error': 'Question and at least 2 options required'}), 400
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if not state:
        return jsonify({'error': 'Bot not connected to channel'}), 400
    state.poll = {
        'active': True, 'question': question, 'options': options,
        'votes':  {str(i + 1): 0 for i in range(len(options))},
        'voted':  set(), 'started_ts': int(time.time()),
    }
    opts_str = ' | '.join(f'{i+1}) {o}' for i, o in enumerate(options))
    bot.send(f'📊 Poll: {question} · {opts_str} · Vote: !vote <number>', channel)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/poll/end', methods=['POST'])
def api_poll_end():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if not state or not state.poll.get('active'):
        return jsonify({'error': 'No active poll'}), 400
    state.poll['active'] = False
    bot.send(bot._poll_results_str(state.poll), channel)
    return jsonify({'ok': True, 'results': {k: v for k, v in state.poll['votes'].items()}})

# ── Points ───────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/points', methods=['GET'])
def api_points_get():
    err = _require_auth()
    if err: return err
    from bot_core import _load_points
    channel  = _user_channel()
    cfg      = load_channel_config(channel)
    pts      = _load_points(channel)
    top      = sorted(pts.items(), key=lambda x: x[1], reverse=True)[:50]
    pts_cfg  = cfg.get('points_config', {'enabled': False, 'name': 'points', 'per_message': 0, 'per_minute': 0})
    return jsonify({'config': pts_cfg, 'leaderboard': [{'nick': n, 'balance': b} for n, b in top], 'total_users': len(pts)})

@cubassist_bp.route('/api/points/config', methods=['POST'])
def api_points_config():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    current = cfg.get('points_config', {})
    if 'enabled'     in body: current['enabled']     = bool(body['enabled'])
    if 'name'        in body: current['name']        = str(body['name']).strip() or 'points'
    if 'per_message' in body: current['per_message'] = max(0, int(body.get('per_message', 0)))
    if 'per_minute'  in body: current['per_minute']  = max(0, int(body.get('per_minute', 0)))
    cfg['points_config'] = current
    save_channel_config(channel, cfg)
    return jsonify({'ok': True, 'config': current})

@cubassist_bp.route('/api/points/adjust', methods=['POST'])
def api_points_adjust():
    err = _require_auth()
    if err: return err
    from bot_core import _load_points, _save_points
    body    = request.get_json(silent=True) or {}
    nick    = body.get('nick', '').strip().lower()
    amount  = int(body.get('amount', 0))
    if not nick:
        return jsonify({'error': 'nick required'}), 400
    channel = _user_channel()
    pts     = _load_points(channel)
    pts[nick] = max(0, pts.get(nick, 0) + amount)
    _save_points(channel, pts)
    return jsonify({'ok': True, 'nick': nick, 'balance': pts[nick]})

# ── Queue ────────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/queue', methods=['GET'])
def api_queue_get():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if not state:
        return jsonify({'open': False, 'queue': []})
    return jsonify({'open': state.queue_open, 'queue': state.queue})

@cubassist_bp.route('/api/queue/open', methods=['POST'])
def api_queue_open():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if not state:
        return jsonify({'error': 'Bot not connected'}), 400
    open_   = bool(body.get('open', True))
    state.queue_open = open_
    if open_:
        bot.send('✅ Queue is now open! Type !queue to join.', channel)
    else:
        bot.send(f'🔒 Queue closed. {len(state.queue)} in queue.', channel)
    return jsonify({'ok': True, 'open': open_})

@cubassist_bp.route('/api/queue/next', methods=['POST'])
def api_queue_next():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    bot     = get_bot()
    state   = bot._channels.get(channel)
    if not state or not state.queue:
        return jsonify({'error': 'Queue is empty'}), 400
    entry = state.queue.pop(0)
    content_str = f' [{entry["content"]}]' if entry.get('content') else ''
    bot.send(f'🎮 Next up: @{entry["user"]}{content_str}! ({len(state.queue)} remaining)', channel)
    return jsonify({'ok': True, 'entry': entry, 'remaining': len(state.queue)})

@cubassist_bp.route('/api/queue/remove/<int:idx>', methods=['DELETE'])
def api_queue_remove(idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if state and 0 <= idx < len(state.queue):
        state.queue.pop(idx)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/queue/clear', methods=['POST'])
def api_queue_clear():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if state:
        state.queue = []
    return jsonify({'ok': True})

# ── Quotes ──────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/quotes', methods=['GET'])
def api_get_quotes():
    err = _require_auth()
    if err: return err
    cfg = load_channel_config(_user_channel())
    return jsonify(cfg.get('quotes', []))

@cubassist_bp.route('/api/quotes', methods=['POST'])
def api_add_quote():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    text    = body.get('text', '').strip()
    if not text:
        return jsonify({'error': 'Quote text required'}), 400
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    quotes  = cfg.setdefault('quotes', [])
    quotes.append({'text': text, 'added_by': 'dashboard', 'ts': int(time.time())})
    save_channel_config(channel, cfg)
    return jsonify({'ok': True, 'id': len(quotes) - 1, 'total': len(quotes)})

@cubassist_bp.route('/api/quotes/<int:idx>', methods=['PUT'])
def api_edit_quote(idx):
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    text    = body.get('text', '').strip()
    if not text:
        return jsonify({'error': 'Quote text required'}), 400
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    quotes  = cfg.get('quotes', [])
    if 0 <= idx < len(quotes):
        quotes[idx]['text'] = text
        save_channel_config(channel, cfg)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/quotes/<int:idx>', methods=['DELETE'])
def api_delete_quote(idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    quotes  = cfg.get('quotes', [])
    if 0 <= idx < len(quotes):
        del quotes[idx]
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
    'user:bot',
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

# ── Global settings ─────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/global-settings', methods=['GET'])
def api_get_global_settings():
    err = _require_auth()
    if err: return err
    gs = _load_global_settings()
    return jsonify({'bot_auto_start': gs.get('bot_auto_start', True)})

@cubassist_bp.route('/api/global-settings', methods=['POST'])
def api_save_global_settings():
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    gs = _load_global_settings()
    if 'bot_auto_start' in body:
        gs['bot_auto_start'] = bool(body['bot_auto_start'])
    _save_global_settings(gs)
    return jsonify({'ok': True, **gs})

# ── Song Queue ──────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/songs', methods=['GET'])
def api_songs_get():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    cfg     = load_channel_config(channel)
    return jsonify({
        'open':   getattr(state, 'songs_open', True) if state else True,
        'queue':  getattr(state, 'song_queue', []) if state else [],
        'config': cfg.get('song_requests', {'enabled': False, 'max_per_user': 3}),
    })

@cubassist_bp.route('/api/songs/config', methods=['POST'])
def api_songs_config():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    sr      = cfg.setdefault('song_requests', {})
    if 'enabled'      in body: sr['enabled']      = bool(body['enabled'])
    if 'max_per_user' in body: sr['max_per_user'] = max(1, int(body.get('max_per_user', 3)))
    save_channel_config(channel, cfg)
    state = get_bot()._channels.get(channel)
    if state and 'open' in body: state.songs_open = bool(body['open'])
    return jsonify({'ok': True})

@cubassist_bp.route('/api/songs/next', methods=['POST'])
def api_songs_next():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if not state or not state.song_queue:
        return jsonify({'error': 'Queue is empty'}), 400
    song = state.song_queue.pop(0)
    get_bot().send(f'⏭ Now playing: {song["content"]} (requested by {song["user"]})', channel)
    return jsonify({'ok': True, 'song': song})

@cubassist_bp.route('/api/songs/remove/<int:idx>', methods=['DELETE'])
def api_songs_remove(idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if state and 0 <= idx < len(state.song_queue):
        state.song_queue.pop(idx)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/songs/clear', methods=['POST'])
def api_songs_clear():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    if state: state.song_queue = []
    return jsonify({'ok': True})

# ── Warnings ────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/warnings', methods=['GET'])
def api_warnings_get():
    err = _require_auth()
    if err: return err
    return jsonify(_load_warnings(_user_channel()))

@cubassist_bp.route('/api/warnings/<nick>', methods=['DELETE'])
def api_warnings_clear(nick):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    warns   = _load_warnings(channel)
    warns.pop(nick.lower(), None)
    _save_warnings(channel, warns)
    return jsonify({'ok': True})

# ── User Notes ──────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/notes', methods=['GET'])
def api_notes_get():
    err = _require_auth()
    if err: return err
    return jsonify(_load_user_notes(_user_channel()))

@cubassist_bp.route('/api/notes', methods=['POST'])
def api_notes_add():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    nick    = body.get('nick', '').strip().lower()
    note    = body.get('note', '').strip()
    if not nick or not note:
        return jsonify({'error': 'nick and note required'}), 400
    channel = _user_channel()
    user    = _authed()
    notes   = _load_user_notes(channel)
    notes.setdefault(nick, []).append({'note': note, 'by': user.get('login', 'dashboard'), 'ts': int(time.time())})
    _save_user_notes(channel, notes)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/notes/<nick>/<int:idx>', methods=['DELETE'])
def api_notes_delete(nick, idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    notes   = _load_user_notes(channel)
    user_notes = notes.get(nick.lower(), [])
    if 0 <= idx < len(user_notes):
        user_notes.pop(idx)
    _save_user_notes(channel, notes)
    return jsonify({'ok': True})

# ── Watchtime ───────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/watchtime', methods=['GET'])
def api_watchtime_get():
    err = _require_auth()
    if err: return err
    wt  = _load_watchtime(_user_channel())
    top = sorted(wt.items(), key=lambda x: x[1], reverse=True)[:50]
    return jsonify([{'nick': n, 'seconds': s} for n, s in top])

# ── Ranks ────────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/ranks', methods=['GET'])
def api_ranks_get():
    err = _require_auth()
    if err: return err
    return jsonify(load_channel_config(_user_channel()).get('ranks', []))

@cubassist_bp.route('/api/ranks', methods=['POST'])
def api_ranks_save():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    cfg['ranks'] = body.get('ranks', [])
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Stream controls ─────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/stream/update', methods=['POST'])
def api_stream_update():
    """Change title and/or game via Helix API using broadcaster's token."""
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    user    = _authed()
    token   = user.get('access_token', '')
    user_id = user.get('id', '')
    if not token or not user_id:
        return jsonify({'error': 'Session expired — please re-login'}), 401

    # Look up game_id if game name provided
    game_name = body.get('game', '').strip()
    game_id   = ''
    if game_name:
        try:
            req = urllib.request.Request(
                f'https://api.twitch.tv/helix/games?name={urllib.parse.quote(game_name)}',
                headers={'Authorization': f'Bearer {token}', 'Client-Id': TWITCH_CLIENT_ID}
            )
            with urllib.request.urlopen(req, timeout=8) as r:
                gdata = json.loads(r.read()).get('data', [])
            if gdata:
                game_id = gdata[0]['id']
        except Exception:
            pass

    patch = {}
    if 'title' in body and body['title']:
        patch['title'] = body['title']
    if game_id:
        patch['game_id'] = game_id

    if not patch:
        return jsonify({'error': 'Nothing to update'}), 400

    data = json.dumps(patch).encode()
    req  = urllib.request.Request(
        f'https://api.twitch.tv/helix/channels?broadcaster_id={user_id}',
        data=data, method='PATCH',
        headers={
            'Authorization': f'Bearer {token}',
            'Client-Id':     TWITCH_CLIENT_ID,
            'Content-Type':  'application/json',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            pass
        return jsonify({'ok': True})
    except urllib.error.HTTPError as e:
        return jsonify({'error': f'Twitch API: {e.read().decode()}'}), 502

@cubassist_bp.route('/api/stream/chatmode', methods=['POST'])
def api_stream_chatmode():
    """Send chat mode commands as the bot (slow, sub-only, emote-only)."""
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    mode    = body.get('mode', '')   # slow, slowoff, subscribers, subscribersoff, emoteonly, emoteonlyoff, clear
    channel = _user_channel()
    valid   = {'slow', 'slowoff', 'subscribers', 'subscribersoff', 'emoteonly', 'emoteonlyoff', 'clear'}
    if mode not in valid:
        return jsonify({'error': 'Invalid mode'}), 400
    cmd = f'/{mode}'
    if mode == 'slow' and 'seconds' in body:
        cmd = f'/slow {int(body["seconds"])}'
    get_bot().send(cmd, channel)
    return jsonify({'ok': True})

# ── Raid response config ─────────────────────────────────────────────────────────

@cubassist_bp.route('/api/raid-response', methods=['GET'])
def api_raid_response_get():
    err = _require_auth()
    if err: return err
    return jsonify(load_channel_config(_user_channel()).get('raid_response', {}))

@cubassist_bp.route('/api/raid-response', methods=['POST'])
def api_raid_response_save():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    current = cfg.get('raid_response', {})
    if 'enabled' in body: current['enabled'] = bool(body['enabled'])
    if 'message' in body: current['message'] = str(body['message'])
    cfg['raid_response'] = current
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Discord Webhook ──────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/discord-webhook', methods=['GET'])
def api_discord_webhook_get():
    err = _require_auth()
    if err: return err
    cfg = load_channel_config(_user_channel())
    url = cfg.get('discord_webhook', '')
    masked = (url[:40] + '...') if len(url) > 40 else url
    return jsonify({'configured': bool(url), 'masked': masked})

@cubassist_bp.route('/api/discord-webhook', methods=['POST'])
def api_discord_webhook_save():
    err = _require_auth()
    if err: return err
    body    = request.get_json(silent=True) or {}
    url     = body.get('url', '').strip()
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    cfg['discord_webhook'] = url
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/discord-webhook/test', methods=['POST'])
def api_discord_webhook_test():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg     = load_channel_config(channel)
    url     = cfg.get('discord_webhook', '')
    if not url:
        return jsonify({'error': 'No webhook configured'}), 400
    user  = _authed()
    data  = json.dumps({'content': f'✅ CubAssist webhook test from **{user.get("display_name", channel)}**\'s channel!'}).encode()
    req   = urllib.request.Request(url, data=data, method='POST',
                                   headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            pass
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 502

# ── Analytics ───────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/analytics', methods=['GET'])
def api_analytics():
    err = _require_auth()
    if err: return err
    from bot_core import _load_points, _load_watchtime
    channel = _user_channel()
    state   = get_bot()._channels.get(channel)
    logs    = state.chat_log[-500:] if state else []

    # Top chatters from log
    chatter_count = {}
    for m in logs:
        key = m['nick'].lower()
        chatter_count[key] = chatter_count.get(key, 0) + 1
    top_chatters = sorted(chatter_count.items(), key=lambda x: x[1], reverse=True)[:10]

    # Command usage from config
    cfg  = load_channel_config(channel)
    cmds = cfg.get('commands', {})
    cmd_usage = sorted(
        [{'name': k, 'count': v.get('count', 0)} for k, v in cmds.items()],
        key=lambda x: x['count'], reverse=True
    )[:10]

    pts = _load_points(channel)
    wt  = _load_watchtime(channel)

    return jsonify({
        'top_chatters':  [{'nick': n, 'messages': c} for n, c in top_chatters],
        'cmd_usage':     cmd_usage,
        'total_points_users':    len(pts),
        'total_watchtime_users': len(wt),
        'messages_tracked':      len(logs),
    })

# ── Auto-start ──────────────────────────────────────────────────────────────────

def _maybe_autostart():
    if not _load_global_settings().get('bot_auto_start', True):
        return
    creds    = get_bot_credentials()
    channels = get_channels()
    if creds.get('oauth_token') and creds.get('bot_nick') and channels:
        get_bot().start()

_maybe_autostart()
