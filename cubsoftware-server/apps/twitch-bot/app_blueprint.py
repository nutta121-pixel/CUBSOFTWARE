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
    _load_counters, _save_counters,
    _load_shop, _save_shop,
    _load_lore, _save_lore,
    _load_trusted, _save_trusted,
    _load_daily_claims,
    _load_watchlist, _save_watchlist,
    _load_timestamps, _save_timestamps,
    _load_clips_log,
    _load_bits_log,
    _load_subs_log,
    _load_bank, _save_bank,
    _load_prestige, _save_prestige,
    _load_teams, _save_teams,
    _load_watchstreak,
    _load_birthdays, _save_birthdays,
    _load_suggestions, _save_suggestions,
    _load_stream_notes, _save_stream_notes,
    _load_autoban_patterns, _save_autoban_patterns,
    _load_ban_reasons,
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
    if 'welcome_new_chatters' in body:
        cfg['welcome_new_chatters'] = bool(body['welcome_new_chatters'])
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
    'user:write:chat',
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
        'oauth_token':   access_token,
        'refresh_token': token_data.get('refresh_token', ''),
        'bot_nick':      nick,
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

# ── Integration status ───────────────────────────────────────────────────────────

@cubassist_bp.route('/api/integration-status')
def api_integration_status():
    """Returns whether Stream Overlays and CubDeck are loaded in the same process
    and whether this channel's Twitch account is linked to either."""
    import sys
    channel = _user_channel()

    overlays_mod  = sys.modules.get('overlays_blueprint')
    cubdeck_mod   = sys.modules.get('cubdeck_blueprint')
    overlays_live = bool(overlays_mod and hasattr(overlays_mod, 'notify_alert_event'))
    cubdeck_live  = bool(cubdeck_mod  and hasattr(cubdeck_mod,  '_overlay_events'))

    overlay_linked    = False
    overlay_discord   = ''
    if overlays_live and channel:
        try:
            all_tokens = overlays_mod.load_twitch_tokens()
            for discord_id, token_data in all_tokens.items():
                if token_data.get('twitch_login', '').lower() == channel.lower():
                    overlay_linked  = True
                    overlay_discord = discord_id
                    break
        except Exception:
            pass

    cubdeck_linked = False
    if cubdeck_live and overlay_discord:
        # Check if that discord_id has any CubDeck decks
        try:
            import os as _os
            cubdeck_data_dir = getattr(cubdeck_mod, 'CUBDECK_DATA_DIR', '')
            if cubdeck_data_dir and _os.path.isdir(_os.path.join(cubdeck_data_dir, overlay_discord)):
                cubdeck_linked = True
        except Exception:
            pass

    return jsonify({
        'stream_overlays': {
            'available': overlays_live,
            'linked':    overlay_linked,
            'discord_id': overlay_discord if overlay_linked else '',
        },
        'cubdeck': {
            'available': cubdeck_live,
            'linked':    cubdeck_linked,
        },
    })

# ── Counters ─────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/counters', methods=['GET'])
def api_counters_get():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    return jsonify(_load_counters(channel))

@cubassist_bp.route('/api/counters', methods=['POST'])
def api_counters_save():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    body = request.get_json(silent=True) or {}
    c = _load_counters(channel)
    for key in ('deaths', 'wins', 'losses', 'score'):
        if key in body:
            c[key] = body[key]
    if 'custom' in body:
        c['custom'] = body['custom']
    _save_counters(channel, c)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/counters/custom', methods=['POST'])
def api_counter_add():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    body = request.get_json(silent=True) or {}
    name = body.get('name', '').strip().lower()
    if not name or not re.match(r'^[a-z0-9_]+$', name):
        return jsonify({'error': 'Invalid name'}), 400
    c = _load_counters(channel)
    c.setdefault('custom', {})[name] = int(body.get('value', 0))
    _save_counters(channel, c)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/counters/custom/<name>', methods=['DELETE'])
def api_counter_delete(name):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    c = _load_counters(channel)
    c.setdefault('custom', {}).pop(name, None)
    _save_counters(channel, c)
    return jsonify({'ok': True})

# ── Shop ─────────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/shop', methods=['GET'])
def api_shop_get():
    err = _require_auth()
    if err: return err
    return jsonify(_load_shop(_user_channel()))

@cubassist_bp.route('/api/shop', methods=['POST'])
def api_shop_add():
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    name = body.get('name', '').strip()
    cost = int(body.get('cost', 0))
    if not name or cost < 0:
        return jsonify({'error': 'name and cost required'}), 400
    channel = _user_channel()
    shop = _load_shop(channel)
    sid = body.get('id') or secrets.token_hex(4)
    existing = next((s for s in shop if s.get('id') == sid), None)
    entry = {
        'id':       sid,
        'name':     name,
        'cost':     cost,
        'response': body.get('response', ''),
        'stock':    int(body.get('stock', -1)),  # -1 = unlimited
    }
    if existing:
        existing.update(entry)
    else:
        shop.append(entry)
    _save_shop(channel, shop)
    return jsonify({'ok': True, 'id': sid})

@cubassist_bp.route('/api/shop/<sid>', methods=['DELETE'])
def api_shop_delete(sid):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    shop = _load_shop(channel)
    _save_shop(channel, [s for s in shop if s.get('id') != sid])
    return jsonify({'ok': True})

# ── Lore ─────────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/lore', methods=['GET'])
def api_lore_get():
    err = _require_auth()
    if err: return err
    return jsonify(_load_lore(_user_channel()))

@cubassist_bp.route('/api/lore', methods=['POST'])
def api_lore_add():
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    text = body.get('text', '').strip()
    if not text:
        return jsonify({'error': 'text required'}), 400
    channel = _user_channel()
    user = _authed()
    lore = _load_lore(channel)
    lore.append({'text': text, 'added_by': user.get('login', 'dashboard'), 'ts': int(time.time())})
    _save_lore(channel, lore)
    return jsonify({'ok': True, 'id': len(lore) - 1, 'total': len(lore)})

@cubassist_bp.route('/api/lore/<int:idx>', methods=['PUT'])
def api_lore_edit(idx):
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    text = body.get('text', '').strip()
    if not text:
        return jsonify({'error': 'text required'}), 400
    channel = _user_channel()
    lore = _load_lore(channel)
    if 0 <= idx < len(lore):
        lore[idx]['text'] = text
        _save_lore(channel, lore)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/lore/<int:idx>', methods=['DELETE'])
def api_lore_delete(idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    lore = _load_lore(channel)
    if 0 <= idx < len(lore):
        del lore[idx]
        _save_lore(channel, lore)
    return jsonify({'ok': True})

# ── Trusted users ─────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/trusted', methods=['GET'])
def api_trusted_get():
    err = _require_auth()
    if err: return err
    return jsonify(_load_trusted(_user_channel()))

@cubassist_bp.route('/api/trusted', methods=['POST'])
def api_trusted_add():
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    nick_t = body.get('nick', '').strip().lower()
    if not nick_t:
        return jsonify({'error': 'nick required'}), 400
    channel = _user_channel()
    trusted = _load_trusted(channel)
    if nick_t not in trusted:
        trusted.append(nick_t)
        _save_trusted(channel, trusted)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/trusted/<nick_t>', methods=['DELETE'])
def api_trusted_remove(nick_t):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    trusted = _load_trusted(channel)
    if nick_t in trusted:
        trusted.remove(nick_t)
        _save_trusted(channel, trusted)
    return jsonify({'ok': True})

# ── Watchlist ─────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/watchlist', methods=['GET'])
def api_watchlist_get():
    err = _require_auth()
    if err: return err
    return jsonify(_load_watchlist(_user_channel()))

@cubassist_bp.route('/api/watchlist', methods=['POST'])
def api_watchlist_add():
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    nick_w = body.get('nick', '').strip().lower()
    reason = body.get('reason', '').strip()
    if not nick_w:
        return jsonify({'error': 'nick required'}), 400
    channel = _user_channel()
    user    = _authed()
    wl = _load_watchlist(channel)
    if not any(e['nick'] == nick_w for e in wl):
        wl.append({'nick': nick_w, 'reason': reason or 'No reason', 'by': user.get('login', 'dashboard'), 'ts': int(time.time())})
        _save_watchlist(channel, wl)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/watchlist/<nick_w>', methods=['DELETE'])
def api_watchlist_remove(nick_w):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    wl = _load_watchlist(channel)
    _save_watchlist(channel, [e for e in wl if e['nick'] != nick_w.lower()])
    return jsonify({'ok': True})

# ── Stream Clip ───────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/stream/clip', methods=['POST'])
def api_stream_clip():
    """Create a Twitch clip using the broadcaster's session token."""
    err = _require_auth()
    if err: return err
    user    = _authed()
    token   = user.get('access_token', '')
    user_id = user.get('id', '')
    if not token or not user_id:
        return jsonify({'error': 'Session expired — please re-login'}), 401
    import urllib.error as _uerr
    data = json.dumps({'broadcaster_id': user_id}).encode()
    req  = urllib.request.Request(
        'https://api.twitch.tv/helix/clips',
        data=data, method='POST',
        headers={
            'Authorization': f'Bearer {token}',
            'Client-Id':     TWITCH_CLIENT_ID,
            'Content-Type':  'application/json',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            result = json.loads(r.read())
        edit_url = result.get('data', [{}])[0].get('edit_url', '')
        clip_id  = result.get('data', [{}])[0].get('id', '')
        return jsonify({'ok': True, 'edit_url': edit_url, 'clip_id': clip_id})
    except urllib.error.HTTPError as e:
        return jsonify({'error': f'Twitch API: {e.read().decode()}'}), 502
    except Exception as e:
        return jsonify({'error': str(e)}), 502

# ── Stream Marker ─────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/stream/marker', methods=['POST'])
def api_stream_marker():
    """Create a stream marker using the broadcaster's session token."""
    err = _require_auth()
    if err: return err
    user    = _authed()
    token   = user.get('access_token', '')
    user_id = user.get('id', '')
    if not token or not user_id:
        return jsonify({'error': 'Session expired — please re-login'}), 401
    body = request.get_json(silent=True) or {}
    description = body.get('description', 'CubAssist marker')[:140]
    data = json.dumps({'user_id': user_id, 'description': description}).encode()
    req = urllib.request.Request(
        'https://api.twitch.tv/helix/streams/markers',
        data=data, method='POST',
        headers={
            'Authorization': f'Bearer {token}',
            'Client-Id':     TWITCH_CLIENT_ID,
            'Content-Type':  'application/json',
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            result = json.loads(r.read())
        marker = result.get('data', [{}])[0]
        return jsonify({'ok': True, 'marker': marker})
    except Exception as e:
        return jsonify({'error': str(e)}), 502

# ── Overlay scene config ──────────────────────────────────────────────────────────

@cubassist_bp.route('/api/overlay-scenes', methods=['GET'])
def api_overlay_scenes_get():
    err = _require_auth()
    if err: return err
    cfg = load_channel_config(_user_channel())
    return jsonify(cfg.get('overlay_scenes', {'default': ''}))

@cubassist_bp.route('/api/overlay-scenes', methods=['POST'])
def api_overlay_scenes_save():
    err = _require_auth()
    if err: return err
    body = request.get_json(silent=True) or {}
    channel = _user_channel()
    cfg = load_channel_config(channel)
    cfg.setdefault('overlay_scenes', {})['default'] = body.get('default', '').strip()
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/overlay-scenes/state', methods=['GET'])
def api_overlay_scenes_state():
    """Return the current widget config of the configured overlay scene."""
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    cfg = load_channel_config(channel)
    scene_id = cfg.get('overlay_scenes', {}).get('default', '').strip()
    if not scene_id:
        return jsonify({'scene_id': '', 'config': {}})
    try:
        overlays_mod = sys.modules.get('overlays_blueprint')
        if not overlays_mod:
            return jsonify({'scene_id': scene_id, 'config': {}, 'error': 'Stream Overlays not loaded'})
        data  = overlays_mod.load_overlays_data()
        scene = data.get('scenes', {}).get(scene_id)
        if not scene:
            return jsonify({'scene_id': scene_id, 'config': {}, 'error': 'Scene not found'})
        return jsonify({'scene_id': scene_id, 'config': scene.get('config', {}), 'name': scene.get('name', '')})
    except Exception as e:
        return jsonify({'scene_id': scene_id, 'config': {}, 'error': str(e)})

@cubassist_bp.route('/api/overlay-scenes/patch', methods=['POST'])
def api_overlay_scenes_patch():
    """Patch the configured overlay scene's widget config from the dashboard."""
    err = _require_auth()
    if err: return err
    channel  = _user_channel()
    cfg      = load_channel_config(channel)
    scene_id = cfg.get('overlay_scenes', {}).get('default', '').strip()
    if not scene_id:
        return jsonify({'error': 'No scene configured'}), 400
    body    = request.get_json(silent=True) or {}
    updates = body.get('config', {})
    if not isinstance(updates, dict):
        return jsonify({'error': 'Invalid config'}), 400
    try:
        overlays_mod = sys.modules.get('overlays_blueprint')
        if not overlays_mod:
            return jsonify({'error': 'Stream Overlays not loaded'}), 503
        data  = overlays_mod.load_overlays_data()
        scene = data.get('scenes', {}).get(scene_id)
        if not scene:
            return jsonify({'error': 'Scene not found'}), 404
        scene.setdefault('config', {}).update(updates)
        scene['updated'] = int(time.time())
        overlays_mod.save_overlays_data(data)
        overlays_mod.notify_scene_update(
            scene_id,
            {'template': scene.get('template', 'minimal'), **scene['config']},
        )
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ── Timestamps ───────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/timestamps', methods=['GET'])
def api_get_timestamps():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    return jsonify({'timestamps': _load_timestamps(channel)})

@cubassist_bp.route('/api/timestamps/<int:idx>', methods=['DELETE'])
def api_delete_timestamp(idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    data = _load_timestamps(channel)
    if 0 <= idx < len(data):
        data.pop(idx)
        _save_timestamps(channel, data)
    return jsonify({'ok': True})

# ── Clips ────────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/clips', methods=['GET'])
def api_get_clips():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    return jsonify({'clips': _load_clips_log(channel)})

# ── Songs blacklist ───────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/songs/blacklist', methods=['GET', 'POST'])
def api_songs_blacklist():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    cfg = load_channel_config(channel)
    sr = cfg.setdefault('song_requests', {})
    if request.method == 'GET':
        return jsonify({'blacklist': sr.get('blacklist', [])})
    data = request.get_json() or {}
    sr['blacklist'] = data.get('blacklist', [])
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Last.fm integration ───────────────────────────────────────────────────────────

@cubassist_bp.route('/api/integrations/lastfm', methods=['GET', 'POST'])
def api_lastfm():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    cfg = load_channel_config(channel)
    integrations = cfg.setdefault('integrations', {})
    if request.method == 'GET':
        return jsonify({'lastfm_user': integrations.get('lastfm_user', '')})
    data = request.get_json() or {}
    integrations['lastfm_user'] = data.get('lastfm_user', '')
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Category change alert ─────────────────────────────────────────────────────────

@cubassist_bp.route('/api/category-alert', methods=['GET', 'POST'])
def api_category_alert():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    cfg = load_channel_config(channel)
    if request.method == 'GET':
        return jsonify(cfg.get('category_change_alert', {'enabled': False, 'message': '🎮 Category changed to $(game)!'}))
    data = request.get_json() or {}
    cfg['category_change_alert'] = data
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Follower milestones ───────────────────────────────────────────────────────────

@cubassist_bp.route('/api/follower-milestones', methods=['GET', 'POST'])
def api_follower_milestones():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    cfg = load_channel_config(channel)
    if request.method == 'GET':
        return jsonify(cfg.get('follower_milestones', {'enabled': False, 'milestones': [100, 500, 1000, 5000, 10000], 'message': '🎉 $(channel) just hit $(count) followers!', 'announced': []}))
    data = request.get_json() or {}
    existing = cfg.get('follower_milestones', {})
    existing.update({k: v for k, v in data.items() if k != 'announced'})
    cfg['follower_milestones'] = existing
    save_channel_config(channel, cfg)
    return jsonify({'ok': True})

# ── Bits leaderboard ──────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/bits-leaderboard', methods=['GET'])
def api_bits_leaderboard():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    bits_data = _load_bits_log(channel)
    top = sorted(bits_data.items(), key=lambda x: x[1], reverse=True)[:10]
    return jsonify({'leaderboard': [{'nick': n, 'bits': v} for n, v in top]})

# ── Subs list ─────────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/subs-list', methods=['GET'])
def api_subs_list():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    subs_data = _load_subs_log(channel)
    top = sorted(subs_data.items(), key=lambda x: x[1].get('months', 0), reverse=True)[:10]
    return jsonify({'subs': [{'nick': n, **v} for n, v in top]})

# ── Stream recap ──────────────────────────────────────────────────────────────────

@cubassist_bp.route('/api/stream-recap', methods=['GET'])
def api_stream_recap():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    bot = get_bot()
    state = bot._channels.get(channel)
    if state and state.stream_stats:
        return jsonify(state.stream_stats)
    return jsonify({})

# ── Auto-start ──────────────────────────────────────────────────────────────────

def _maybe_autostart():
    if not _load_global_settings().get('bot_auto_start', True):
        return
    creds    = get_bot_credentials()
    channels = get_channels()
    if creds.get('oauth_token') and creds.get('bot_nick') and channels:
        get_bot().start()

_maybe_autostart()

# ── New feature API endpoints ────────────────────────────────────────────────────

@cubassist_bp.route('/api/suggestions', methods=['GET'])
def api_suggestions_get():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    data = _load_suggestions(channel)
    return jsonify(data)

@cubassist_bp.route('/api/suggestions/<int:idx>', methods=['PUT', 'DELETE'])
def api_suggestion_update(idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    data = _load_suggestions(channel)
    if idx < 0 or idx >= len(data):
        return jsonify({'error': 'Not found'}), 404
    if request.method == 'DELETE':
        data.pop(idx)
    else:
        body = request.get_json() or {}
        data[idx].update({k: v for k, v in body.items() if k in ('status', 'text')})
    _save_suggestions(channel, data)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/stream-notes', methods=['GET', 'DELETE'])
def api_stream_notes():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    if request.method == 'DELETE':
        _save_stream_notes(channel, [])
        return jsonify({'ok': True})
    return jsonify(_load_stream_notes(channel))

@cubassist_bp.route('/api/bank', methods=['GET'])
def api_bank():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    data = _load_bank(channel)
    top = sorted(data.items(), key=lambda x: x[1].get('deposited', 0), reverse=True)[:10]
    return jsonify([{'nick': n, 'deposited': v.get('deposited', 0)} for n, v in top])

@cubassist_bp.route('/api/prestige', methods=['GET'])
def api_prestige():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    data = _load_prestige(channel)
    top = sorted(data.items(), key=lambda x: x[1].get('level', 0), reverse=True)[:10]
    return jsonify([{'nick': n, 'level': v.get('level', 0)} for n, v in top])

@cubassist_bp.route('/api/teams', methods=['GET', 'POST'])
def api_teams():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    if request.method == 'POST':
        body = request.get_json() or {}
        teams = _load_teams(channel)
        name = body.get('name', '').lower().replace(' ', '_')
        if not name: return jsonify({'error': 'Name required'}), 400
        teams[name] = {'members': [], 'points': 0}
        _save_teams(channel, teams)
        return jsonify({'ok': True})
    teams = _load_teams(channel)
    return jsonify(teams)

@cubassist_bp.route('/api/teams/<name>', methods=['DELETE'])
def api_team_delete(name):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    teams = _load_teams(channel)
    teams.pop(name, None)
    _save_teams(channel, teams)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/watchstreak', methods=['GET'])
def api_watchstreak():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    data = _load_watchstreak(channel)
    top = sorted(data.items(), key=lambda x: x[1].get('streak', 0), reverse=True)[:10]
    return jsonify([{'nick': n, 'streak': v.get('streak', 0)} for n, v in top])

@cubassist_bp.route('/api/birthdays', methods=['GET', 'POST'])
def api_birthdays():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    if request.method == 'POST':
        body = request.get_json() or {}
        data = _load_birthdays(channel)
        nick = body.get('nick', '').lower()
        bday = body.get('birthday', '').replace('-', '/')
        # Normalize to M/D format (strip leading zeros) to match bot command storage
        try:
            parts_bd = bday.split('/')
            if len(parts_bd) == 2:
                bday = f'{int(parts_bd[0])}/{int(parts_bd[1])}'
        except (ValueError, IndexError):
            pass
        if nick and bday: data[nick] = bday
        _save_birthdays(channel, data)
        return jsonify({'ok': True})
    data = _load_birthdays(channel)
    return jsonify([{'nick': n, 'birthday': d} for n, d in data.items()])

@cubassist_bp.route('/api/birthdays/<nick>', methods=['DELETE'])
def api_birthday_delete(nick):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    data = _load_birthdays(channel)
    data.pop(nick.lower(), None)
    _save_birthdays(channel, data)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/autoban', methods=['GET', 'POST'])
def api_autoban():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    if request.method == 'POST':
        body = request.get_json() or {}
        patterns = _load_autoban_patterns(channel)
        pat = body.get('pattern', '')
        if pat and pat not in patterns:
            patterns.append(pat)
            _save_autoban_patterns(channel, patterns)
        return jsonify({'ok': True})
    return jsonify(_load_autoban_patterns(channel))

@cubassist_bp.route('/api/autoban/<int:idx>', methods=['DELETE'])
def api_autoban_delete(idx):
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    patterns = _load_autoban_patterns(channel)
    if 0 <= idx < len(patterns):
        patterns.pop(idx)
        _save_autoban_patterns(channel, patterns)
    return jsonify({'ok': True})

@cubassist_bp.route('/api/ban-reasons', methods=['GET'])
def api_ban_reasons():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    return jsonify(_load_ban_reasons(channel))

@cubassist_bp.route('/api/wheel-segments', methods=['GET', 'POST'])
def api_wheel_segments():
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    cfg = load_channel_config(channel)
    if request.method == 'POST':
        body = request.get_json() or {}
        cfg['wheel_segments'] = body.get('segments', [])
        save_channel_config(channel, cfg)
        return jsonify({'ok': True})
    return jsonify(cfg.get('wheel_segments', []))

@cubassist_bp.route('/api/feature-config', methods=['GET', 'POST'])
def api_feature_config():
    """Get/set per-feature enable flags and settings."""
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    cfg = load_channel_config(channel)
    if request.method == 'POST':
        body = request.get_json() or {}
        for key in ('first_chatter', 'tts_config', 'hype_threshold',
                    'stream_schedule', 'socials', 'spotlight_message',
                    'prestige_cost', 'raid_shield', 'chat_keyword_alerts',
                    'chat_alert_threshold', 'wheel_segments'):
            if key in body:
                cfg[key] = body[key]
        save_channel_config(channel, cfg)
        return jsonify({'ok': True})
    return jsonify({
        'first_chatter':       cfg.get('first_chatter', {'enabled': False, 'message': '🎉 @$(user) is the first chatter!', 'reward': 0}),
        'tts_config':          cfg.get('tts_config', {'enabled': False, 'min_level': 'subscriber', 'max_length': 150}),
        'hype_threshold':      cfg.get('hype_threshold', 20),
        'stream_schedule':     cfg.get('stream_schedule', ''),
        'socials':             cfg.get('socials', {}),
        'spotlight_message':   cfg.get('spotlight_message', '🌟 Shoutout to @$(user)!'),
        'prestige_cost':       cfg.get('prestige_cost', 50000),
        'raid_shield':         cfg.get('raid_shield', {'enabled': False, 'slow_secs': 30}),
        'chat_keyword_alerts': cfg.get('chat_keyword_alerts', []),
        'chat_alert_threshold': cfg.get('chat_alert_threshold', 5),
        'wheel_segments':      cfg.get('wheel_segments', []),
    })

@cubassist_bp.route('/api/live-state', methods=['GET'])
def api_live_state():
    """Return live in-memory state for new features."""
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    bot = get_bot()
    state = bot._channels.get(channel)
    if not state:
        return jsonify({})
    return jsonify({
        'blackjack_players':  list(state.blackjack.keys()),
        'lottery':            state.lottery,
        'auction':            {k: v for k, v in (state.auction or {}).items() if k != 'expiry'} if state.auction else None,
        'coinrain':           bool(state.coinrain and state.coinrain.get('active')),
        'bounties':           state.bounties,
        'subgoal':            state.subgoal,
        'bitsgoal':           state.bitsgoal,
        'raid_queue':         state.raid_queue,
        'tts_queue':          state.tts_queue[-5:] if state.tts_queue else [],
        'hype_count':         state.hype_count,
        'category_history':   state.category_history[-10:] if state.category_history else [],
        'emote_counts':       dict(sorted(state.emote_counts.items(), key=lambda x: x[1], reverse=True)[:10]),
    })

# ── Feature flags (per-channel command enable/disable) ───────────────────────

# All built-in commands that can be toggled — grouped for the dashboard
_FEATURE_GROUPS = {
    'Games': [
        'blackjack', 'hit', 'stand', 'double', 'dice',
        'highlow', 'hl', 'wordchain', 'typerace', 'wheel',
        'trivia', 'anagram', 'hangman', 'numguess', 'chatr',
        'rps', 'challenge', 'accept', 'reject',
        'boss', 'joinboss',
    ],
    'Economy': [
        'points', 'rank', 'leaderboard', 'give', 'rob',
        'lottery', 'lottodraw', 'auction', 'bid',
        'coinrain', 'grab', 'bounty',
        'bank', 'deposit', 'withdraw', 'prestige',
        'shop', 'buy', 'myrewards',
        'duel', 'heist',
    ],
    'Community': [
        'watchstreak', 'suggest', 'suggestions', 'approve', 'deny',
        'spotlight', 'birthday', 'birthdays', 'hype', 'team',
        'giveaway', 'enter', 'pick',
        'poll', 'vote', 'endpoll',
        'lore', 'addlore', 'dellore',
    ],
    'Stream Tools': [
        'schedule', 'socials', 'streamnote', 'streamnotes',
        'raidqueue', 'subgoal', 'bitsgoal', 'cliplast',
        'watchtime', 'wt',
        'queue', 'openqueue', 'closequeue', 'removequeue', 'clearqueue',
        'songrequest', 'sr', 'skipsong', 'currentsong', 'songsopen', 'songsclose',
    ],
    'Mod Tools': [
        'cmdstats', 'banreason', 'lastseen', 'tts', 'alert',
        'emotecount', 'chatalert', 'raidshield', 'autoban',
        'shadowwarn', 'chatexport', 'temprole', 'multiwin',
        'vip', 'unvip',
        'warn', 'timeout', 'ban', 'unban', 'untimeout',
        'permit', 'trusted',
    ],
    'Info': [
        'commands', 'uptime', 'game', 'title', 'followage',
        'watchtime', 'points', 'rank', 'quote',
    ],
}

@cubassist_bp.route('/api/enabled-commands', methods=['GET', 'POST'])
def api_enabled_commands():
    """Get or set the per-channel command enable/disable map."""
    err = _require_auth()
    if err: return err
    channel = _user_channel()
    if not channel: return jsonify({'error': 'No channel'}), 400
    cfg = load_channel_config(channel)
    if request.method == 'POST':
        body = request.get_json() or {}
        cfg['enabled_commands'] = {str(k): bool(v) for k, v in body.items()}
        save_channel_config(channel, cfg)
        return jsonify({'ok': True})
    return jsonify({
        'enabled': cfg.get('enabled_commands', {}),
        'groups':  _FEATURE_GROUPS,
    })
