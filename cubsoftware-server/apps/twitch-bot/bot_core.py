"""
CubAssist — Twitch Chat Bot Core
Multi-channel IRC bot. Single connection, joins all registered channels simultaneously.
Bot credentials set via CUBASSIST_BOT_TOKEN + CUBASSIST_BOT_NICK env vars.
"""

import socket
import ssl
import threading
import time
import re
import json
import random
import ast
import operator
import urllib.request
import urllib.parse
import urllib.error
import datetime
import os
import math
import logging
from pathlib import Path

logger = logging.getLogger('cubassist')

# ── Mini-game constants ─────────────────────────────────────────────────────────

_TRIVIA = [
    {'q': 'How many sides does a hexagon have?', 'a': '6'},
    {'q': 'What is the capital of France?', 'a': 'paris'},
    {'q': 'What is 7 × 8?', 'a': '56'},
    {'q': 'How many days are in a leap year?', 'a': '366'},
    {'q': 'What planet is closest to the Sun?', 'a': 'mercury'},
    {'q': 'What is the chemical symbol for water?', 'a': 'h2o'},
    {'q': 'How many continents are there?', 'a': '7'},
    {'q': 'What is the largest ocean?', 'a': 'pacific'},
    {'q': 'How many strings on a standard guitar?', 'a': '6'},
    {'q': 'What colour do you get mixing red and blue?', 'a': 'purple'},
    {'q': 'What is the square root of 144?', 'a': '12'},
    {'q': 'What is the fastest land animal?', 'a': 'cheetah'},
    {'q': 'In what year did World War 2 end?', 'a': '1945'},
    {'q': 'How many hearts does an octopus have?', 'a': '3'},
    {'q': 'What is the largest planet in our solar system?', 'a': 'jupiter'},
    {'q': 'What is the hardest natural substance on Earth?', 'a': 'diamond'},
    {'q': 'How many bones in the adult human body?', 'a': '206'},
    {'q': 'What gas do plants absorb from the air?', 'a': 'co2'},
    {'q': 'How many players on a standard football (soccer) team?', 'a': '11'},
    {'q': 'What country has the largest land area?', 'a': 'russia'},
]

_8BALL = [
    'It is certain.', 'It is decidedly so.', 'Without a doubt.',
    'Yes, definitely.', 'You may rely on it.', 'As I see it, yes.',
    'Most likely.', 'Outlook good.', 'Signs point to yes.',
    'Reply hazy, try again.', 'Ask again later.',
    'Better not tell you now.', 'Cannot predict now.',
    "Don't count on it.", 'My reply is no.',
    'My sources say no.', 'Outlook not so good.', 'Very doubtful.',
]

_SLOTS_SYMBOLS = ['🍒', '🍋', '🍊', '🍇', '⭐', '💎', '7️⃣']

# ── Duration parsing helper ──────────────────────────────────────────────────────

def _parse_duration_ms(s: str):
    """Parse '5m', '1h30m', '90s', '5:00', '1:30:00' into milliseconds. Returns None on failure."""
    s = s.strip().lower()
    if ':' in s:
        parts = s.split(':')
        try:
            if len(parts) == 2:
                return (int(parts[0]) * 60 + int(parts[1])) * 1000
            elif len(parts) == 3:
                return (int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])) * 1000
        except ValueError:
            return None
    matches = re.findall(r'(\d+)\s*([hms])', s)
    if matches:
        total = 0
        for val, unit in matches:
            if unit == 'h':   total += int(val) * 3600000
            elif unit == 'm': total += int(val) * 60000
            elif unit == 's': total += int(val) * 1000
        return total
    try:
        return int(s) * 1000
    except ValueError:
        return None

# ── Data directory ──────────────────────────────────────────────────────────────

def _data_dir() -> Path:
    if os.name != 'nt':
        p = Path('/var/cubsoftware-data/twitch-bot')
        try:
            p.mkdir(parents=True, exist_ok=True)
            return p
        except PermissionError:
            pass
    p = Path(__file__).parent.parent / 'cubsoftware-website' / 'data' / 'twitch-bot'
    p.mkdir(parents=True, exist_ok=True)
    return p

def _channel_dir(channel: str) -> Path:
    p = _data_dir() / 'channels' / channel.lower().strip('#')
    p.mkdir(parents=True, exist_ok=True)
    return p

# ── Bot credentials (set once on server via env vars) ──────────────────────────

def get_bot_credentials() -> dict:
    token = os.environ.get('CUBASSIST_BOT_TOKEN', '')
    nick  = os.environ.get('CUBASSIST_BOT_NICK', '')
    if not token or not nick:
        # Fall back to stored credentials (legacy config.json or bot_credentials.json)
        for fname in ('bot_credentials.json', 'config.json'):
            path = _data_dir() / fname
            if path.exists():
                try:
                    data = json.loads(path.read_text())
                    token = token or data.get('oauth_token', '')
                    nick  = nick  or data.get('bot_nick', '')
                    if token and nick:
                        break
                except Exception:
                    pass
    return {'oauth_token': token, 'bot_nick': nick}


def refresh_bot_token() -> bool:
    """Exchange the stored refresh_token for a new access_token and save it back.

    Returns True on success, False if refresh was skipped or failed.
    Called automatically by _connect() on every (re)connection so the bot
    never needs manual re-authorisation after the initial /admin/setup.
    """
    client_id     = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
    client_secret = os.environ.get('TWITCH_CLIENT_SECRET', '')

    creds_path = _data_dir() / 'bot_credentials.json'
    if not creds_path.exists():
        return False

    try:
        creds = json.loads(creds_path.read_text())
    except Exception:
        return False

    refresh_token = creds.get('refresh_token', '')
    if not refresh_token:
        logger.warning('CubAssist: no refresh_token stored — manual re-auth needed')
        return False
    if not client_secret:
        logger.warning('CubAssist: TWITCH_CLIENT_SECRET not set — cannot refresh token')
        return False

    data = urllib.parse.urlencode({
        'client_id':     client_id,
        'client_secret': client_secret,
        'refresh_token': refresh_token,
        'grant_type':    'refresh_token',
    }).encode()

    try:
        req = urllib.request.Request(
            'https://id.twitch.tv/oauth2/token', data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as r:
            token_data = json.loads(r.read())
    except Exception as e:
        logger.warning(f'CubAssist token refresh failed: {e}')
        return False

    new_access  = token_data.get('access_token', '')
    # Twitch rotates the refresh token on each use — always save the new one
    new_refresh = token_data.get('refresh_token', refresh_token)

    if not new_access:
        logger.warning('CubAssist token refresh returned no access_token')
        return False

    creds['oauth_token']   = new_access
    creds['refresh_token'] = new_refresh
    try:
        creds_path.write_text(json.dumps(creds, indent=2))
    except Exception as e:
        logger.warning(f'CubAssist: failed to save refreshed token: {e}')
        return False

    logger.info('CubAssist bot token refreshed successfully')
    return True


# ── Channel registry ────────────────────────────────────────────────────────────

def get_channels() -> list:
    path = _data_dir() / 'channels.json'
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    return []

def _save_channels(channels: list):
    (_data_dir() / 'channels.json').write_text(json.dumps(channels))

def register_channel(channel: str):
    channel = channel.lower().strip('#')
    channels = get_channels()
    if channel not in channels:
        channels.append(channel)
        _save_channels(channels)
    # Ensure config file exists
    load_channel_config(channel)

def unregister_channel(channel: str):
    channel = channel.lower().strip('#')
    channels = get_channels()
    if channel in channels:
        channels.remove(channel)
        _save_channels(channels)

# ── Per-channel config ──────────────────────────────────────────────────────────

def _default_channel_config(channel: str) -> dict:
    return {
        'channel':        channel,
        'command_prefix': '!',
        'commands':       {},
        'timers':         [],
        'automod': {
            'links':     {'enabled': False, 'permit_time': 30, 'whitelist': []},
            'caps':      {'enabled': False, 'max_percent': 70, 'min_chars': 10},
            'symbols':   {'enabled': False, 'max_percent': 60},
            'blacklist': [],
        },
        'points_config': {'enabled': False, 'name': 'points', 'per_message': 1, 'per_minute': 5, 'trivia_reward': 100, 'daily_reward': 100},
        'song_requests': {'enabled': False, 'max_per_user': 3},
        'raid_response': {'enabled': False, 'message': '🚨 Welcome raiders! Thanks for the raid @$(raider) and your $(viewers) viewers!'},
        'ranks': [
            {'name': 'Newcomer', 'min_points': 0},
            {'name': 'Regular',  'min_points': 500},
            {'name': 'Veteran',  'min_points': 2000},
            {'name': 'Elite',    'min_points': 10000},
            {'name': 'Legend',   'min_points': 50000},
        ],
        'discord_webhook': '',
        'welcome_new_chatters': False,
        'overlay_scenes': {'default': ''},
    }

def load_channel_config(channel: str) -> dict:
    channel = channel.lower().strip('#')
    path = _channel_dir(channel) / 'config.json'
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:
            pass
    cfg = _default_channel_config(channel)
    save_channel_config(channel, cfg)
    return cfg

def save_channel_config(channel: str, cfg: dict):
    channel = channel.lower().strip('#')
    (_channel_dir(channel) / 'config.json').write_text(json.dumps(cfg, indent=2))

def _load_points(channel: str) -> dict:
    try:
        return json.loads((_channel_dir(channel) / 'points.json').read_text())
    except Exception:
        return {}

def _save_points(channel: str, data: dict):
    (_channel_dir(channel) / 'points.json').write_text(json.dumps(data))

def _load_watchtime(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'watchtime.json').read_text())
    except: return {}
def _save_watchtime(channel: str, data: dict):
    (_channel_dir(channel) / 'watchtime.json').write_text(json.dumps(data))

def _load_warnings(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'warnings.json').read_text())
    except: return {}
def _save_warnings(channel: str, data: dict):
    (_channel_dir(channel) / 'warnings.json').write_text(json.dumps(data))

def _load_user_notes(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'user_notes.json').read_text())
    except: return {}
def _save_user_notes(channel: str, data: dict):
    (_channel_dir(channel) / 'user_notes.json').write_text(json.dumps(data))

def _load_counters(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'counters.json').read_text())
    except: return {}
def _save_counters(channel: str, data: dict):
    (_channel_dir(channel) / 'counters.json').write_text(json.dumps(data))

def _load_shop(channel: str) -> list:
    try: return json.loads((_channel_dir(channel) / 'shop.json').read_text())
    except: return []
def _save_shop(channel: str, data: list):
    (_channel_dir(channel) / 'shop.json').write_text(json.dumps(data, indent=2))

def _load_lore(channel: str) -> list:
    try: return json.loads((_channel_dir(channel) / 'lore.json').read_text())
    except: return []
def _save_lore(channel: str, data: list):
    (_channel_dir(channel) / 'lore.json').write_text(json.dumps(data))

def _load_trusted(channel: str) -> list:
    try: return json.loads((_channel_dir(channel) / 'trusted.json').read_text())
    except: return []
def _save_trusted(channel: str, data: list):
    (_channel_dir(channel) / 'trusted.json').write_text(json.dumps(data))

def _load_daily_claims(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'daily_claims.json').read_text())
    except: return {}
def _save_daily_claims(channel: str, data: dict):
    (_channel_dir(channel) / 'daily_claims.json').write_text(json.dumps(data))

def _load_watchlist(channel: str) -> list:
    try: return json.loads((_channel_dir(channel) / 'watchlist.json').read_text())
    except: return []
def _save_watchlist(channel: str, data: list):
    (_channel_dir(channel) / 'watchlist.json').write_text(json.dumps(data))

def _load_timestamps(channel):
    p = os.path.join(_channel_dir(channel), 'timestamps.json')
    try:
        if os.path.exists(p):
            with open(p) as f: return json.load(f)
    except Exception: pass
    return []

def _save_timestamps(channel, data):
    p = os.path.join(_channel_dir(channel), 'timestamps.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f: json.dump(data, f, indent=2)

def _load_clips_log(channel):
    p = os.path.join(_channel_dir(channel), 'clips_log.json')
    try:
        if os.path.exists(p):
            with open(p) as f: return json.load(f)
    except Exception: pass
    return []

def _save_clips_log(channel, data):
    p = os.path.join(_channel_dir(channel), 'clips_log.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f: json.dump(data, f, indent=2)

def _load_bits_log(channel):
    p = os.path.join(_channel_dir(channel), 'bits_log.json')
    try:
        if os.path.exists(p):
            with open(p) as f: return json.load(f)
    except Exception: pass
    return {}

def _save_bits_log(channel, data):
    p = os.path.join(_channel_dir(channel), 'bits_log.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f: json.dump(data, f, indent=2)

def _load_subs_log(channel):
    p = os.path.join(_channel_dir(channel), 'subs_log.json')
    try:
        if os.path.exists(p):
            with open(p) as f: return json.load(f)
    except Exception: pass
    return {}

def _save_subs_log(channel, data):
    p = os.path.join(_channel_dir(channel), 'subs_log.json')
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w') as f: json.dump(data, f, indent=2)

def _load_bank(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'bank.json').read_text())
    except: return {}
def _save_bank(channel: str, data: dict):
    (_channel_dir(channel) / 'bank.json').write_text(json.dumps(data))

def _load_prestige(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'prestige.json').read_text())
    except: return {}
def _save_prestige(channel: str, data: dict):
    (_channel_dir(channel) / 'prestige.json').write_text(json.dumps(data))

def _load_teams(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'teams.json').read_text())
    except: return {}
def _save_teams(channel: str, data: dict):
    (_channel_dir(channel) / 'teams.json').write_text(json.dumps(data, indent=2))

def _load_watchstreak(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'watchstreak.json').read_text())
    except: return {}
def _save_watchstreak(channel: str, data: dict):
    (_channel_dir(channel) / 'watchstreak.json').write_text(json.dumps(data))

def _load_birthdays(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'birthdays.json').read_text())
    except: return {}
def _save_birthdays(channel: str, data: dict):
    (_channel_dir(channel) / 'birthdays.json').write_text(json.dumps(data))

def _load_suggestions(channel: str) -> list:
    try: return json.loads((_channel_dir(channel) / 'suggestions.json').read_text())
    except: return []
def _save_suggestions(channel: str, data: list):
    (_channel_dir(channel) / 'suggestions.json').write_text(json.dumps(data, indent=2))

def _load_stream_notes(channel: str) -> list:
    try: return json.loads((_channel_dir(channel) / 'stream_notes.json').read_text())
    except: return []
def _save_stream_notes(channel: str, data: list):
    (_channel_dir(channel) / 'stream_notes.json').write_text(json.dumps(data, indent=2))

def _load_autoban_patterns(channel: str) -> list:
    try: return json.loads((_channel_dir(channel) / 'autoban_patterns.json').read_text())
    except: return []
def _save_autoban_patterns(channel: str, data: list):
    (_channel_dir(channel) / 'autoban_patterns.json').write_text(json.dumps(data))

def _load_ban_reasons(channel: str) -> dict:
    try: return json.loads((_channel_dir(channel) / 'ban_reasons.json').read_text())
    except: return {}
def _save_ban_reasons(channel: str, data: dict):
    (_channel_dir(channel) / 'ban_reasons.json').write_text(json.dumps(data, indent=2))

# ── Backward-compat shims (used by _maybe_autostart) ───────────────────────────

def load_config() -> dict:
    creds = get_bot_credentials()
    channels = get_channels()
    cfg = {'enabled': bool(channels), 'channel': channels[0] if channels else ''}
    cfg.update(creds)
    return cfg

def save_config(cfg: dict):
    channel = cfg.get('channel', '')
    if channel:
        save_channel_config(channel, cfg)

# ── IRC parsing ─────────────────────────────────────────────────────────────────

def _parse_irc(raw):
    tags, prefix = {}, ''
    raw = raw.strip()
    if raw.startswith('@'):
        tag_str, raw = raw[1:].split(' ', 1)
        for part in tag_str.split(';'):
            if '=' in part:
                k, v = part.split('=', 1)
                tags[k] = v
            else:
                tags[part] = True
    if raw.startswith(':'):
        prefix, raw = raw[1:].split(' ', 1)
    parts = raw.split(' ', 1)
    command = parts[0]
    rest = parts[1] if len(parts) > 1 else ''
    trailing = ''
    if ' :' in rest:
        rest, trailing = rest.split(' :', 1)
    elif rest.startswith(':'):
        trailing = rest[1:]
        rest = ''
    params = [p for p in rest.split() if p]
    if trailing:
        params.append(trailing)
    return tags, prefix, command, params

def _nick(prefix):
    return prefix.split('!')[0] if '!' in prefix else prefix

# ── User levels ─────────────────────────────────────────────────────────────────

LEVELS = ['everyone', 'subscriber', 'vip', 'moderator', 'broadcaster']

def _user_level(tags):
    badges = tags.get('badges', '')
    if 'broadcaster/1' in badges:   return 'broadcaster'
    if tags.get('user-type') == 'mod' or 'moderator/1' in badges: return 'moderator'
    if 'vip/1' in badges:           return 'vip'
    if 'subscriber/' in badges:     return 'subscriber'
    return 'everyone'

def _level_gte(user_level, required):
    try:
        return LEVELS.index(user_level) >= LEVELS.index(required)
    except ValueError:
        return False

# ── Variables ───────────────────────────────────────────────────────────────────

_MATH_OPS = {
    ast.Add: operator.add, ast.Sub: operator.sub,
    ast.Mult: operator.mul, ast.Div: operator.truediv,
    ast.Pow: operator.pow, ast.Mod: operator.mod,
    ast.FloorDiv: operator.floordiv, ast.USub: operator.neg,
}

def _safe_eval(expr):
    try:
        def _eval(n):
            if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
                return n.value
            if isinstance(n, ast.BinOp):
                op = _MATH_OPS.get(type(n.op))
                if not op: raise ValueError
                return op(_eval(n.left), _eval(n.right))
            if isinstance(n, ast.UnaryOp):
                op = _MATH_OPS.get(type(n.op))
                if not op: raise ValueError
                return op(_eval(n.operand))
            raise ValueError
        result = _eval(ast.parse(expr.strip(), mode='eval').body)
        return str(int(result)) if isinstance(result, float) and result.is_integer() else str(round(result, 4))
    except Exception:
        return '?'

def resolve_vars(text, ctx):
    user       = ctx.get('user', '')
    query      = ctx.get('query', '')
    touser     = query.split()[0].lstrip('@') if query.strip() else user
    args       = query.split()
    now        = datetime.datetime.now()
    user_level = ctx.get('user_level', 'everyone')

    # Basic
    text = text.replace('$(user)',      user)
    text = text.replace('$(touser)',    touser)
    text = text.replace('$(query)',     query)
    text = text.replace('$(channel)',   ctx.get('channel', ''))
    text = text.replace('$(userid)',    ctx.get('user_id', ''))
    text = text.replace('$(bot)',       ctx.get('bot_nick', ''))
    text = text.replace('$(nick)',      ctx.get('nick', user))
    text = text.replace('$(color)',     ctx.get('user_color', ''))

    # User level checks
    text = text.replace('$(ismod)',  '1' if _level_gte(user_level, 'moderator')  else '0')
    text = text.replace('$(isvip)',  '1' if _level_gte(user_level, 'vip')        else '0')
    text = text.replace('$(issub)',  '1' if _level_gte(user_level, 'subscriber') else '0')

    # $(args N) — specific argument word
    def _args(m):
        try:
            idx = int(m.group(1)) - 1
            return args[idx] if 0 <= idx < len(args) else ''
        except Exception: return ''
    text = re.sub(r'\$\(args (\d+)\)', _args, text)

    # $(count) — global per-command counter
    if '$(count)' in text:
        cmd_name = ctx.get('command_name', '')
        cfg      = ctx.get('config', {})
        cmd      = cfg.get('commands', {}).get(cmd_name, {})
        count    = cmd.get('count', 0) + 1
        cmd['count'] = count
        text = text.replace('$(count)', str(count))

    # $(usercount) — per-user per-command counter
    if '$(usercount)' in text:
        cmd_name = ctx.get('command_name', '')
        user_id  = ctx.get('user_id', '')
        cfg      = ctx.get('config', {})
        counters = cfg.setdefault('user_counters', {}).setdefault(cmd_name, {})
        ucount   = counters.get(user_id, 0) + 1
        counters[user_id] = ucount
        text = text.replace('$(usercount)', str(ucount))

    # $(random N N)
    def _random(m):
        try: return str(random.randint(int(m.group(1)), int(m.group(2))))
        except Exception: return m.group(0)
    text = re.sub(r'\$\(random (\d+) (\d+)\)', _random, text)

    # $(choose opt1|opt2|opt3)
    def _choose(m):
        opts = [o.strip() for o in m.group(1).split('|') if o.strip()]
        return random.choice(opts) if opts else ''
    text = re.sub(r'\$\(choose ([^)]+)\)', _choose, text)

    # $(math expr)
    text = re.sub(r'\$\(math ([^)]+)\)', lambda m: _safe_eval(m.group(1)), text)

    # String manipulation
    text = re.sub(r'\$\(upper ([^)]+)\)', lambda m: m.group(1).upper(), text)
    text = re.sub(r'\$\(lower ([^)]+)\)', lambda m: m.group(1).lower(), text)
    text = re.sub(r'\$\(length ([^)]+)\)', lambda m: str(len(m.group(1))), text)

    def _repeat(m):
        parts = m.group(1).rsplit('|', 1)
        if len(parts) == 2:
            try:
                n = max(0, min(int(parts[1].strip()), 20))
                return parts[0].strip() * n
            except Exception:
                pass
        return m.group(1)
    text = re.sub(r'\$\(repeat ([^)]+)\)', _repeat, text)

    # $(if condition|true_val|false_val)
    def _if(m):
        parts = m.group(1).split('|', 2)
        if len(parts) >= 3:
            cond = parts[0].strip()
            return parts[1].strip() if (cond and cond != '0' and cond.lower() not in ('false', 'no')) else parts[2].strip()
        return m.group(1)
    text = re.sub(r'\$\(if ([^)]+)\)', _if, text)

    # Stream info
    info = ctx.get('_stream_info') or {}
    text = text.replace('$(uptime)',    info.get('uptime',    'offline'))
    text = text.replace('$(game)',      info.get('game',      'Unknown'))
    text = text.replace('$(title)',     info.get('title',     ''))
    text = text.replace('$(viewers)',   str(info.get('viewers',   '0')))
    text = text.replace('$(followers)', str(info.get('followers', '?')))

    # Date / time
    text = text.replace('$(date)',      now.strftime('%B %d, %Y'))
    text = text.replace('$(time)',      now.strftime('%H:%M'))
    text = text.replace('$(hours)',     now.strftime('%H'))
    text = text.replace('$(minutes)',   now.strftime('%M'))
    text = text.replace('$(dayofweek)', now.strftime('%A'))
    text = text.replace('$(year)',      now.strftime('%Y'))
    text = text.replace('$(monthname)', now.strftime('%B'))
    text = text.replace('$(monthnum)',  now.strftime('%m'))
    text = text.replace('$(day)',       now.strftime('%d'))

    # $(customvar name) — persistent per-channel variable
    cvars = (ctx.get('config') or {}).get('custom_vars', {})
    text = re.sub(r'\$\(customvar ([a-zA-Z0-9_]+)\)', lambda m: cvars.get(m.group(1), ''), text)

    # $(quote) / $(quote N) — random or specific quote
    def _quote(m):
        idx_str = (m.group(1) or '').strip()
        quotes  = (ctx.get('config') or {}).get('quotes', [])
        if not quotes:
            return '[no quotes]'
        if idx_str:
            try:
                idx = int(idx_str) - 1
                if 0 <= idx < len(quotes):
                    return f'#{idx+1}: {quotes[idx].get("text", "")}'
                return '[quote not found]'
            except Exception:
                pass
        idx = random.randrange(len(quotes))
        return f'#{idx+1}: {quotes[idx].get("text", "")}'
    text = re.sub(r'\$\(quote(?: (\d+))?\)', _quote, text)

    # $(urlfetch url) — do last, may be slow
    def _fetch(m):
        try:
            req = urllib.request.Request(m.group(1).strip(), headers={'User-Agent': 'CubAssist/1.0'})
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.read(500).decode('utf-8', errors='replace').strip()
        except Exception: return '[fetch failed]'
    text = re.sub(r'\$\(urlfetch ([^)]+)\)', _fetch, text)

    # $(followage) - requires ctx to have user_id and channel
    if '$(followage)' in text:
        try:
            _chan = ctx.get('channel', '')
            _uid = ctx.get('user_id', '')
            if _chan and _uid:
                _client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
                _bot_token = os.environ.get('CUBASSIST_BOT_TOKEN', '').replace('oauth:', '')
                _bid = ''
                try:
                    _bid_req = urllib.request.Request(
                        f'https://api.twitch.tv/helix/users?login={urllib.parse.quote(_chan)}',
                        headers={'Client-Id': _client_id, 'Authorization': f'Bearer {_bot_token}'}
                    )
                    with urllib.request.urlopen(_bid_req, timeout=3) as _br:
                        _bdata = json.loads(_br.read()).get('data', [])
                    _bid = _bdata[0]['id'] if _bdata else ''
                except Exception:
                    pass
                if _bid and _bot_token:
                    _fr = urllib.request.Request(
                        f'https://api.twitch.tv/helix/channels/followers?broadcaster_id={_bid}&user_id={urllib.parse.quote(_uid)}',
                        headers={'Client-Id': _client_id, 'Authorization': f'Bearer {_bot_token}'}
                    )
                    try:
                        with urllib.request.urlopen(_fr, timeout=3) as _fres:
                            _fdata = json.loads(_fres.read()).get('data', [])
                        if _fdata:
                            _fa = datetime.datetime.fromisoformat(_fdata[0]['followed_at'].replace('Z', '+00:00'))
                            _delta = datetime.datetime.now(datetime.timezone.utc) - _fa
                            _days = _delta.days
                            _yrs, _rem = divmod(_days, 365)
                            _mos = _rem // 30
                            if _yrs > 0:
                                _fastr = f'{_yrs}y {_mos}m'
                            elif _mos > 0:
                                _fastr = f'{_mos} month{"s" if _mos!=1 else ""}'
                            else:
                                _fastr = f'{_days} day{"s" if _days!=1 else ""}'
                        else:
                            _fastr = 'not following'
                    except Exception:
                        _fastr = 'unknown'
                else:
                    _fastr = 'unknown'
            else:
                _fastr = 'unknown'
        except Exception:
            _fastr = 'unknown'
        text = text.replace('$(followage)', _fastr)

    # $(lastfm) - now playing from Last.fm
    if '$(lastfm)' in text:
        try:
            _chan = ctx.get('channel', '')
            _cfg2 = load_channel_config(_chan) if _chan else {}
            _lfm_user = _cfg2.get('integrations', {}).get('lastfm_user', '')
            _lfm_key = os.environ.get('LASTFM_API_KEY', '')
            if _lfm_user and _lfm_key:
                _lfm_params = urllib.parse.urlencode({
                    'method': 'user.getrecenttracks', 'user': _lfm_user,
                    'api_key': _lfm_key, 'format': 'json', 'limit': 1
                })
                _lr = urllib.request.Request(
                    f'http://ws.audioscrobbler.com/2.0/?{_lfm_params}',
                    headers={'User-Agent': 'CubAssist/1.0'}
                )
                try:
                    with urllib.request.urlopen(_lr, timeout=3) as _lres:
                        _ltracks = json.loads(_lres.read()).get('recenttracks', {}).get('track', [])
                    if _ltracks:
                        _t = _ltracks[0] if isinstance(_ltracks, list) else _ltracks
                        _song = _t.get('name', 'Unknown')
                        _artist = _t.get('artist', {}).get('#text', 'Unknown')
                        _lfmstr = f'{_artist} - {_song}'
                    else:
                        _lfmstr = 'Nothing playing'
                except Exception:
                    _lfmstr = 'unavailable'
            else:
                _lfmstr = 'Last.fm not configured'
        except Exception:
            _lfmstr = 'unavailable'
        text = text.replace('$(lastfm)', _lfmstr)

    # ── Extra args shortcuts ────────────────────────────────────────────────
    text = text.replace('$(args)',    query)
    text = re.sub(r'\$\(arg(\d+)\)',  lambda m: (args[int(m.group(1))-1] if 0 < int(m.group(1)) <= len(args) else ''), text)
    text = re.sub(r'\$\(allbut (\d+)\)', lambda m: ' '.join(args[int(m.group(1)):]), text)
    text = text.replace('$(lastarg)', args[-1] if args else '')
    text = text.replace('$(argcount)', str(len(args)))

    # ── DateTime extended ───────────────────────────────────────────────────
    text = text.replace('$(time12)',    now.strftime('%I:%M %p'))
    text = text.replace('$(second)',    now.strftime('%S'))
    text = text.replace('$(week)',      now.strftime('%V'))
    text = text.replace('$(month)',     now.strftime('%m'))
    text = text.replace('$(datetime)',  now.strftime('%Y-%m-%d %H:%M:%S'))
    text = text.replace('$(iso)',       now.strftime('%Y-%m-%dT%H:%M:%S'))
    text = text.replace('$(timestamp)', str(int(time.time())))
    text = text.replace('$(unixtime)',  str(int(time.time())))
    text = text.replace('$(timezone)',  'UTC')
    text = re.sub(r'\$\(countdown ([0-9\-]+)\)',
        lambda m: _countdown_str(m.group(1)), text)

    # ── Stream info extended ────────────────────────────────────────────────
    text = text.replace('$(status)',    'online' if info.get('uptime') and info.get('uptime') != 'offline' else 'offline')
    text = text.replace('$(category)',  info.get('game', 'Unknown'))
    text = text.replace('$(language)',  info.get('language', '?'))
    text = text.replace('$(mature)',    '1' if info.get('is_mature') else '0')
    _sr_pv = ctx.get('_state_ref')
    _pv = (getattr(_sr_pv, 'stream_stats', None) or {}).get('peak_viewers', '?') if _sr_pv else '?'
    text = text.replace('$(peakviewers)', str(_pv))

    # ── Math operators ──────────────────────────────────────────────────────
    def _safe_num(s):
        try: v = float(s); return int(v) if v == int(v) else round(v, 6)
        except: return '?'
    text = re.sub(r'\$\(add (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(_safe_num(float(m.group(1)) + float(m.group(2)))), text)
    text = re.sub(r'\$\(sub (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(_safe_num(float(m.group(1)) - float(m.group(2)))), text)
    text = re.sub(r'\$\(mul (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(_safe_num(float(m.group(1)) * float(m.group(2)))), text)
    text = re.sub(r'\$\(div (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(_safe_num(float(m.group(1)) / float(m.group(2)))) if float(m.group(2)) != 0 else '∞', text)
    text = re.sub(r'\$\(mod (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(int(float(m.group(1))) % int(float(m.group(2)))) if float(m.group(2)) != 0 else '?', text)
    text = re.sub(r'\$\(pow (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(_safe_num(float(m.group(1)) ** float(m.group(2)))), text)
    text = re.sub(r'\$\(abs (-?[\d.]+)\)',             lambda m: str(_safe_num(abs(float(m.group(1))))), text)
    text = re.sub(r'\$\(min (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(_safe_num(min(float(m.group(1)), float(m.group(2))))), text)
    text = re.sub(r'\$\(max (-?[\d.]+) (-?[\d.]+)\)',  lambda m: str(_safe_num(max(float(m.group(1)), float(m.group(2))))), text)
    text = re.sub(r'\$\(round (-?[\d.]+)\)',           lambda m: str(round(float(m.group(1)))), text)
    text = re.sub(r'\$\(floor (-?[\d.]+)\)',           lambda m: str(math.floor(float(m.group(1)))), text)
    text = re.sub(r'\$\(ceil (-?[\d.]+)\)',            lambda m: str(math.ceil(float(m.group(1)))), text)
    text = re.sub(r'\$\(sqrt (-?[\d.]+)\)',            lambda m: str(round(float(m.group(1)) ** 0.5, 4)) if float(m.group(1)) >= 0 else '?', text)
    text = re.sub(r'\$\(sign (-?[\d.]+)\)',            lambda m: '1' if float(m.group(1)) > 0 else ('-1' if float(m.group(1)) < 0 else '0'), text)
    text = re.sub(r'\$\(clamp (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)', lambda m: str(_safe_num(max(float(m.group(2)), min(float(m.group(3)), float(m.group(1)))))), text)
    text = re.sub(r'\$\(percent (-?[\d.]+) (-?[\d.]+)\)', lambda m: str(round(float(m.group(1)) / float(m.group(2)) * 100, 1)) if float(m.group(2)) != 0 else '?', text)
    text = re.sub(r'\$\(numformat (-?[\d.]+)\)',       lambda m: f'{float(m.group(1)):,.0f}' if float(m.group(1)) == int(float(m.group(1))) else f'{float(m.group(1)):,}', text)

    # ── Comparison / logic ──────────────────────────────────────────────────
    text = re.sub(r'\$\(eq ([^ )]+) ([^ )]+)\)',  lambda m: '1' if m.group(1) == m.group(2) else '0', text)
    text = re.sub(r'\$\(ne ([^ )]+) ([^ )]+)\)',  lambda m: '0' if m.group(1) == m.group(2) else '1', text)
    text = re.sub(r'\$\(gt (-?[\d.]+) (-?[\d.]+)\)', lambda m: '1' if float(m.group(1)) > float(m.group(2)) else '0', text)
    text = re.sub(r'\$\(lt (-?[\d.]+) (-?[\d.]+)\)', lambda m: '1' if float(m.group(1)) < float(m.group(2)) else '0', text)
    text = re.sub(r'\$\(gte (-?[\d.]+) (-?[\d.]+)\)', lambda m: '1' if float(m.group(1)) >= float(m.group(2)) else '0', text)
    text = re.sub(r'\$\(lte (-?[\d.]+) (-?[\d.]+)\)', lambda m: '1' if float(m.group(1)) <= float(m.group(2)) else '0', text)
    text = re.sub(r'\$\(and ([^ )]+) ([^ )]+)\)', lambda m: '1' if (m.group(1) and m.group(1) not in ('0','false','no','')) and (m.group(2) and m.group(2) not in ('0','false','no','')) else '0', text)
    text = re.sub(r'\$\(or ([^ )]+) ([^ )]+)\)',  lambda m: '1' if (m.group(1) and m.group(1) not in ('0','false','no','')) or (m.group(2) and m.group(2) not in ('0','false','no','')) else '0', text)
    text = re.sub(r'\$\(not ([^ )]+)\)',           lambda m: '0' if (m.group(1) and m.group(1) not in ('0','false','no','')) else '1', text)
    def _switch(m):
        parts = m.group(1).split('|')
        val = parts[0].strip() if parts else ''
        default = ''
        for part in parts[1:]:
            if ':' in part:
                k, v = part.split(':', 1)
                if k.strip() == val:
                    return v.strip()
                if k.strip() == 'default':
                    default = v.strip()
            elif part.strip():
                default = part.strip()
        return default
    text = re.sub(r'\$\(switch ([^)]+)\)', _switch, text)

    # ── String manipulation extended ────────────────────────────────────────
    text = re.sub(r'\$\(trim ([^)]+)\)',      lambda m: m.group(1).strip(), text)
    text = re.sub(r'\$\(title ([^)]+)\)',     lambda m: m.group(1).title(), text)
    text = re.sub(r'\$\(sentence ([^)]+)\)',  lambda m: m.group(1).capitalize(), text)
    text = re.sub(r'\$\(reverse ([^)]+)\)',   lambda m: m.group(1)[::-1], text)
    text = re.sub(r'\$\(words ([^)]+)\)',     lambda m: str(len(m.group(1).split())), text)
    text = re.sub(r'\$\(wordcount ([^)]+)\)', lambda m: str(len(m.group(1).split())), text)
    def _word_n(m):
        try:
            n, txt = int(m.group(1)), m.group(2)
            parts = txt.split()
            return parts[n-1] if 0 < n <= len(parts) else ''
        except: return ''
    text = re.sub(r'\$\(word (\d+) ([^)]+)\)', _word_n, text)
    def _char_n(m):
        try:
            n, txt = int(m.group(1)), m.group(2)
            return txt[n-1] if 0 < n <= len(txt) else ''
        except: return ''
    text = re.sub(r'\$\(char (\d+) ([^)]+)\)', _char_n, text)
    def _slice(m):
        parts = m.group(1).split('|')
        try:
            txt = parts[0]; start = int(parts[1]); end = int(parts[2]) if len(parts) > 2 else len(txt)
            return txt[start:end]
        except: return parts[0] if parts else ''
    text = re.sub(r'\$\(slice ([^)]+)\)', _slice, text)
    def _replace_var(m):
        parts = m.group(1).split('|', 2)
        if len(parts) == 3:
            return parts[0].replace(parts[1], parts[2])
        return parts[0] if parts else ''
    text = re.sub(r'\$\(replace ([^)]+)\)', _replace_var, text)
    def _contains(m):
        parts = m.group(1).split('|', 1)
        if len(parts) == 2:
            return '1' if parts[1] in parts[0] else '0'
        return '0'
    text = re.sub(r'\$\(contains ([^)]+)\)', _contains, text)
    def _split_var(m):
        parts = m.group(1).split('|')
        try:
            txt, sep, idx = parts[0], parts[1], int(parts[2])
            bits = txt.split(sep)
            return bits[idx] if 0 <= idx < len(bits) else ''
        except: return ''
    text = re.sub(r'\$\(split ([^)]+)\)', _split_var, text)
    def _join_var(m):
        parts = m.group(1).split('|')
        if len(parts) >= 2:
            return parts[0].join(parts[1:])
        return ''
    text = re.sub(r'\$\(join ([^)]+)\)', _join_var, text)
    def _pad_var(m):
        parts = m.group(1).split('|')
        try: n, char, txt = int(parts[0]), parts[1], parts[2] if len(parts) > 2 else ''
        except: return m.group(1)
        return txt.ljust(n, char) if len(char) == 1 else txt
    text = re.sub(r'\$\(pad ([^)]+)\)', _pad_var, text)
    text = re.sub(r'\$\(truncate (\d+) ([^)]+)\)', lambda m: m.group(2)[:int(m.group(1))] + ('…' if len(m.group(2)) > int(m.group(1)) else ''), text)
    text = re.sub(r'\$\(startswith ([^|)]+)\|([^)]+)\)', lambda m: '1' if m.group(2).startswith(m.group(1)) else '0', text)
    text = re.sub(r'\$\(endswith ([^|)]+)\|([^)]+)\)',   lambda m: '1' if m.group(2).endswith(m.group(1)) else '0', text)

    # ── Random extended ─────────────────────────────────────────────────────
    text = text.replace('$(flip)',    random.choice(['Heads', 'Tails']))
    text = text.replace('$(bool)',    random.choice(['Yes', 'No']))
    text = text.replace('$(percent)', str(random.randint(0, 100)) + '%')
    text = text.replace('$(roll)',    str(random.randint(1, 6)))
    _8BALL_EXT = ['It is certain.','It is decidedly so.','Without a doubt.','Yes, definitely.',
              'You may rely on it.','As I see it, yes.','Most likely.','Outlook good.',
              'Yes.','Signs point to yes.','Reply hazy, try again.','Ask again later.',
              'Better not tell you now.','Cannot predict now.','Concentrate and ask again.',
              "Don't count on it.",'My reply is no.','My sources say no.',
              'Outlook not so good.','Very doubtful.']
    text = text.replace('$(8ball)',   random.choice(_8BALL_EXT))
    text = re.sub(r'\$\(randomword ([^)]+)\)', lambda m: random.choice(m.group(1).split()) if m.group(1).split() else '', text)
    _DONGER_LIST = ['ヽ༼ ຈل͜ຈ ༽ﾉ', '( ͡° ͜ʖ ͡°)', '(╯°□°）╯︵ ┻━┻', '¯\\_(ツ)_/¯', 'ʕ•ᴥ•ʔ']
    text = text.replace('$(donger)',  random.choice(_DONGER_LIST))

    # ── Emoticons / text art ────────────────────────────────────────────────
    text = text.replace('$(shrug)',     '¯\\_(ツ)_/¯')
    text = text.replace('$(tableflip)', '(╯°□°）╯︵ ┻━┻')
    text = text.replace('$(unflip)',    '┬─┬ ノ( ゜-゜ノ)')
    text = text.replace('$(lenny)',     '( ͡° ͜ʖ ͡°)')
    text = text.replace('$(sunglasses)','(⌐■_■)')
    text = text.replace('$(bear)',      'ʕ•ᴥ•ʔ')
    text = text.replace('$(star)',      '★')
    text = text.replace('$(heart)',     '♥')
    text = text.replace('$(arrow)',     '→')
    text = text.replace('$(check)',     '✓')
    text = text.replace('$(cross)',     '✗')
    text = text.replace('$(music)',     '♪')

    # ── Fun lists ───────────────────────────────────────────────────────────
    _COMPLIMENTS = ['You are absolutely amazing!', 'You make this stream so much better!',
                    'Your positivity is contagious!', 'You are a legend in this chat!',
                    'The streamer loves having you here!', 'You are one of a kind!']
    _ROASTS = ['Did you just wake up?', 'I\'ve seen better, but not in this chat.',
               'Are you always this impressive?', 'You\'re the reason we have bot filters.',
               'Somewhere, someone misses you. Probably not here though.']
    _AFFIRMATIONS = ['You\'ve got this!', 'Believe in yourself!', 'Every stream is a new adventure!',
                     'You are doing great!', 'Keep pushing forward!', 'Progress over perfection!']
    _FACTS = ['A group of flamingos is called a flamboyance.',
              'Honey never spoils — archaeologists have found 3000-year-old edible honey.',
              'Octopuses have three hearts.',
              'The Eiffel Tower grows taller in summer heat.',
              'A day on Venus is longer than a year on Venus.']
    _DADJOKES = ['Why don\'t scientists trust atoms? Because they make up everything!',
                 'I\'m reading a book on anti-gravity. It\'s impossible to put down.',
                 'Did you hear about the mathematician who\'s afraid of negative numbers? He\'ll stop at nothing to avoid them.',
                 'Why do cows wear bells? Because their horns don\'t work!',
                 'I used to hate facial hair, but then it grew on me.']
    text = text.replace('$(compliment)', random.choice(_COMPLIMENTS))
    text = text.replace('$(roast)',      random.choice(_ROASTS))
    text = text.replace('$(affirmation)', random.choice(_AFFIRMATIONS))
    text = text.replace('$(fact)',       random.choice(_FACTS))
    text = text.replace('$(dadjoke)',    random.choice(_DADJOKES))

    # ── Per-channel data variables (lazy-loaded) ────────────────────────────
    _chan = ctx.get('channel', '')
    _nick_lower = ctx.get('nick', '').lower() or user.lower()

    if '$(points)' in text or '$(points ' in text:
        _pts_all = _load_points(_chan) if _chan else {}
        text = text.replace('$(points)', str(_pts_all.get(_nick_lower, 0)))
        def _pts_user(m):
            return str(_pts_all.get(m.group(1).lstrip('@').lower(), 0))
        text = re.sub(r'\$\(points ([^)]+)\)', _pts_user, text)

    if '$(rank)' in text or '$(rank ' in text:
        _pts_all2 = _load_points(_chan) if _chan else {}
        _sorted = sorted(_pts_all2.items(), key=lambda x: x[1], reverse=True)
        _rank_map = {n: i+1 for i, (n, _) in enumerate(_sorted)}
        text = text.replace('$(rank)', str(_rank_map.get(_nick_lower, '?')))
        text = re.sub(r'\$\(rank ([^)]+)\)', lambda m: str(_rank_map.get(m.group(1).lstrip('@').lower(), '?')), text)

    if '$(watchtime)' in text or '$(watchtime ' in text:
        _wt_all = _load_watchtime(_chan) if _chan else {}
        _wt_secs = _wt_all.get(_nick_lower, 0)
        _wt_hrs = round(_wt_secs / 3600, 1)
        text = text.replace('$(watchtime)', f'{_wt_hrs}h')
        def _wt_user(m):
            _s = _wt_all.get(m.group(1).lstrip('@').lower(), 0)
            return f'{round(_s/3600, 1)}h'
        text = re.sub(r'\$\(watchtime ([^)]+)\)', _wt_user, text)

    if '$(bank)' in text or '$(bank ' in text:
        _bk_all = _load_bank(_chan) if _chan else {}
        text = text.replace('$(bank)', str(_bk_all.get(_nick_lower, {}).get('deposited', 0)))
        text = re.sub(r'\$\(bank ([^)]+)\)', lambda m: str(_bk_all.get(m.group(1).lstrip('@').lower(), {}).get('deposited', 0)), text)

    if '$(prestige)' in text or '$(prestige ' in text:
        _pr_all = _load_prestige(_chan) if _chan else {}
        text = text.replace('$(prestige)', str(_pr_all.get(_nick_lower, {}).get('level', 0)))
        text = re.sub(r'\$\(prestige ([^)]+)\)', lambda m: str(_pr_all.get(m.group(1).lstrip('@').lower(), {}).get('level', 0)), text)

    if '$(streak)' in text or '$(streak ' in text:
        _ws_all = _load_watchstreak(_chan) if _chan else {}
        text = text.replace('$(streak)', str(_ws_all.get(_nick_lower, {}).get('streak', 0)))
        text = re.sub(r'\$\(streak ([^)]+)\)', lambda m: str(_ws_all.get(m.group(1).lstrip('@').lower(), {}).get('streak', 0)), text)

    if '$(birthday)' in text or '$(birthday ' in text:
        _bd_all = _load_birthdays(_chan) if _chan else {}
        text = text.replace('$(birthday)', _bd_all.get(_nick_lower, 'not set'))
        text = re.sub(r'\$\(birthday ([^)]+)\)', lambda m: _bd_all.get(m.group(1).lstrip('@').lower(), 'not set'), text)

    if '$(warnings)' in text or '$(warnings ' in text:
        _wr_all = _load_warnings(_chan) if _chan else {}
        text = text.replace('$(warnings)', str(len(_wr_all.get(_nick_lower, []))))
        text = re.sub(r'\$\(warnings ([^)]+)\)', lambda m: str(len(_wr_all.get(m.group(1).lstrip('@').lower(), []))), text)

    if '$(toppoints)' in text:
        _tp_all = _load_points(_chan) if _chan else {}
        _tp = max(_tp_all.items(), key=lambda x: x[1]) if _tp_all else ('nobody', 0)
        text = text.replace('$(toppoints)', f'{_tp[0]} ({_tp[1]:,})')

    if '$(topbank)' in text:
        _tb_all = _load_bank(_chan) if _chan else {}
        _tb = max(_tb_all.items(), key=lambda x: x[1].get('deposited', 0), default=('nobody', {})) if _tb_all else ('nobody', {})
        text = text.replace('$(topbank)', f'{_tb[0]} ({_tb[1].get("deposited",0):,})')

    if '$(topprestige)' in text:
        _tpr_all = _load_prestige(_chan) if _chan else {}
        _tpr = max(_tpr_all.items(), key=lambda x: x[1].get('level', 0), default=('nobody', {})) if _tpr_all else ('nobody', {})
        text = text.replace('$(topprestige)', f'{_tpr[0]} (P{_tpr[1].get("level",0)})')

    if '$(topstreak)' in text:
        _ts_all = _load_watchstreak(_chan) if _chan else {}
        _tstr = max(_ts_all.items(), key=lambda x: x[1].get('streak', 0), default=('nobody', {})) if _ts_all else ('nobody', {})
        text = text.replace('$(topstreak)', f'{_tstr[0]} ({_tstr[1].get("streak",0)} streams)')

    if '$(team)' in text or '$(team ' in text:
        _tm_all = _load_teams(_chan) if _chan else {}
        _user_team = next((t for t, d in _tm_all.items() if _nick_lower in d.get('members', [])), 'no team')
        text = text.replace('$(team)', _user_team)
        def _team_user(m):
            _u = m.group(1).lstrip('@').lower()
            return next((t for t, d in _tm_all.items() if _u in d.get('members', [])), 'no team')
        text = re.sub(r'\$\(team ([^)]+)\)', _team_user, text)

    if '$(lastseen)' in text or '$(lastseen ' in text:
        _ts_data = _load_timestamps(_chan) if _chan else {}
        def _ls(target):
            ts_val = _ts_data.get(target.lower(), 0)
            if not ts_val: return 'never'
            ago = int(time.time()) - ts_val
            if ago < 60: return f'{ago}s ago'
            if ago < 3600: return f'{ago//60}m ago'
            return f'{ago//3600}h ago'
        text = text.replace('$(lastseen)', _ls(_nick_lower))
        text = re.sub(r'\$\(lastseen ([^)]+)\)', lambda m: _ls(m.group(1).lstrip('@')), text)

    if '$(bounty)' in text or '$(bounty ' in text:
        _state_ref = ctx.get('_state_ref')
        _bounties = getattr(_state_ref, 'bounties', {}) if _state_ref else {}
        text = text.replace('$(bounty)', str(_bounties.get(_nick_lower, 0)))
        text = re.sub(r'\$\(bounty ([^)]+)\)', lambda m: str(_bounties.get(m.group(1).lstrip('@').lower(), 0)), text)

    if '$(emotecount)' in text or '$(emotecount ' in text:
        _state_ref2 = ctx.get('_state_ref')
        _emotes = getattr(_state_ref2, 'emote_counts', {}) if _state_ref2 else {}
        text = text.replace('$(emotecount)', str(sum(_emotes.values())))
        text = re.sub(r'\$\(emotecount ([^)]+)\)', lambda m: str(_emotes.get(m.group(1), 0)), text)

    if '$(topemote)' in text:
        _state_ref3 = ctx.get('_state_ref')
        _em2 = getattr(_state_ref3, 'emote_counts', {}) if _state_ref3 else {}
        _te = max(_em2.items(), key=lambda x: x[1], default=('none', 0))
        text = text.replace('$(topemote)', f'{_te[0]} ({_te[1]})')

    if '$(randomchatter)' in text:
        _state_ref4 = ctx.get('_state_ref')
        _log = getattr(_state_ref4, 'chat_log', []) if _state_ref4 else []
        _unique = list({m['nick'] for m in _log}) if _log else [user]
        text = text.replace('$(randomchatter)', random.choice(_unique))

    if '$(chatters)' in text:
        _state_ref5 = ctx.get('_state_ref')
        _log5 = getattr(_state_ref5, 'chat_log', []) if _state_ref5 else []
        text = text.replace('$(chatters)', str(len({m['nick'] for m in _log5})))

    if '$(chattotal)' in text or '$(lines)' in text:
        _state_ref6 = ctx.get('_state_ref')
        _ss = getattr(_state_ref6, 'stream_stats', {}) if _state_ref6 else {}
        _total = (_ss or {}).get('chat_messages_total', 0)
        text = text.replace('$(chattotal)', str(_total))
        text = text.replace('$(lines)', str(_total))

    if '$(firstchatter)' in text:
        _state_ref7 = ctx.get('_state_ref')
        _log7 = getattr(_state_ref7, 'chat_log', []) if _state_ref7 else []
        text = text.replace('$(firstchatter)', _log7[0]['nick'] if _log7 else '?')

    if '$(recentchatter)' in text:
        _state_ref8 = ctx.get('_state_ref')
        _log8 = getattr(_state_ref8, 'chat_log', []) if _state_ref8 else []
        text = text.replace('$(recentchatter)', _log8[-1]['nick'] if _log8 else '?')

    if '$(lore)' in text:
        _lore_list = (ctx.get('config') or {}).get('lore', [])
        text = text.replace('$(lore)', random.choice(_lore_list).get('text', '[no lore]') if _lore_list else '[no lore]')

    if '$(songqueue)' in text:
        _state_ref9 = ctx.get('_state_ref')
        _sq = getattr(_state_ref9, 'song_queue', []) if _state_ref9 else []
        text = text.replace('$(songqueue)', str(len(_sq)))

    if '$(queuesize)' in text:
        _state_ref10 = ctx.get('_state_ref')
        _q = getattr(_state_ref10, 'queue', []) if _state_ref10 else []
        text = text.replace('$(queuesize)', str(len(_q)))

    if '$(hypecount)' in text:
        _state_ref11 = ctx.get('_state_ref')
        text = text.replace('$(hypecount)', str(getattr(_state_ref11, 'hype_count', 0)))

    if '$(lotterytickets)' in text:
        _state_ref12 = ctx.get('_state_ref')
        _lot = getattr(_state_ref12, 'lottery', None) if _state_ref12 else None
        text = text.replace('$(lotterytickets)', str(len((_lot or {}).get('tickets', {}))))

    if '$(auctionbid)' in text:
        _state_ref13 = ctx.get('_state_ref')
        _au = getattr(_state_ref13, 'auction', None) if _state_ref13 else None
        text = text.replace('$(auctionbid)', str((_au or {}).get('high_bid', 0)))

    # ── Ordinal / plural helpers ────────────────────────────────────────────
    def _ordinal(m):
        try:
            n = int(m.group(1))
            suffix = {1: 'st', 2: 'nd', 3: 'rd'}.get(n % 10 if n % 100 not in (11,12,13) else 0, 'th')
            return f'{n}{suffix}'
        except: return m.group(1)
    text = re.sub(r'\$\(ordinal (\d+)\)', _ordinal, text)
    def _plural(m):
        parts = m.group(1).split('|')
        try:
            count = int(parts[0])
            singular = parts[1] if len(parts) > 1 else ''
            plural_form = parts[2] if len(parts) > 2 else singular + 's'
            return singular if count == 1 else plural_form
        except: return parts[1] if len(parts) > 1 else ''
    text = re.sub(r'\$\(plural ([^)]+)\)', _plural, text)
    text = re.sub(r'\$\(commas (-?[\d.]+)\)', lambda m: f'{float(m.group(1)):,.0f}' if '.' not in m.group(1) else f'{float(m.group(1)):,}', text)
    text = re.sub(r'\$\(kb (\d+)\)', lambda m: f'{int(m.group(1))//1024} KB', text)
    text = re.sub(r'\$\(mb (\d+)\)', lambda m: f'{int(m.group(1))//(1024*1024)} MB', text)

    # ── User level text ─────────────────────────────────────────────────────
    text = text.replace('$(userlevel)', user_level)
    text = text.replace('$(isbroadcaster)', '1' if user_level == 'broadcaster' else '0')
    text = text.replace('$(userlevellabel)', {
        'broadcaster': 'Broadcaster', 'moderator': 'Moderator',
        'vip': 'VIP', 'subscriber': 'Subscriber', 'everyone': 'Viewer'
    }.get(user_level, user_level.title()))

    # ── Conditional on user level ───────────────────────────────────────────
    text = re.sub(r'\$\(ifmod ([^|)]+)\|([^)]+)\)',  lambda m: m.group(1) if _level_gte(user_level, 'moderator')  else m.group(2), text)
    text = re.sub(r'\$\(ifsub ([^|)]+)\|([^)]+)\)',  lambda m: m.group(1) if _level_gte(user_level, 'subscriber') else m.group(2), text)
    text = re.sub(r'\$\(ifvip ([^|)]+)\|([^)]+)\)',  lambda m: m.group(1) if _level_gte(user_level, 'vip')        else m.group(2), text)

    # ════════════════════════════════════════════════════════════════════════
    # EXTENDED VARIABLES BLOCK — 1000+ additional variables
    # ════════════════════════════════════════════════════════════════════════
    import hashlib as _hlib
    import base64 as _b64
    import urllib.parse as _up
    import calendar as _cal

    # ── Math extended ────────────────────────────────────────────────────────
    text = text.replace('$(pi)',  str(round(math.pi, 10)))
    text = text.replace('$(e)',   str(round(math.e, 10)))
    text = text.replace('$(tau)', str(round(math.tau, 10)))
    text = text.replace('$(phi)', str(round((1 + math.sqrt(5)) / 2, 10)))
    text = text.replace('$(inf)', '∞')
    text = re.sub(r'\$\(sin (-?[\d.]+)\)',    lambda m: str(round(math.sin(math.radians(float(m.group(1)))), 6)), text)
    text = re.sub(r'\$\(cos (-?[\d.]+)\)',    lambda m: str(round(math.cos(math.radians(float(m.group(1)))), 6)), text)
    text = re.sub(r'\$\(tan (-?[\d.]+)\)',    lambda m: str(round(math.tan(math.radians(float(m.group(1)))), 6)) if abs(float(m.group(1)) % 180 - 90) > 0.001 else '∞', text)
    text = re.sub(r'\$\(asin (-?[\d.]+)\)',   lambda m: str(round(math.degrees(math.asin(max(-1.0, min(1.0, float(m.group(1)))))), 4)), text)
    text = re.sub(r'\$\(acos (-?[\d.]+)\)',   lambda m: str(round(math.degrees(math.acos(max(-1.0, min(1.0, float(m.group(1)))))), 4)), text)
    text = re.sub(r'\$\(atan (-?[\d.]+)\)',   lambda m: str(round(math.degrees(math.atan(float(m.group(1)))), 4)), text)
    text = re.sub(r'\$\(atan2 (-?[\d.]+) (-?[\d.]+)\)', lambda m: str(round(math.degrees(math.atan2(float(m.group(1)), float(m.group(2)))), 4)), text)
    text = re.sub(r'\$\(log (-?[\d.]+)\)',    lambda m: str(round(math.log(float(m.group(1))), 6)) if float(m.group(1)) > 0 else '?', text)
    text = re.sub(r'\$\(log2 (-?[\d.]+)\)',   lambda m: str(round(math.log2(float(m.group(1))), 6)) if float(m.group(1)) > 0 else '?', text)
    text = re.sub(r'\$\(log10 (-?[\d.]+)\)',  lambda m: str(round(math.log10(float(m.group(1))), 6)) if float(m.group(1)) > 0 else '?', text)
    text = re.sub(r'\$\(exp (-?[\d.]+)\)',    lambda m: str(round(math.exp(min(float(m.group(1)), 700)), 6)), text)
    text = re.sub(r'\$\(hypot (-?[\d.]+) (-?[\d.]+)\)', lambda m: str(round(math.hypot(float(m.group(1)), float(m.group(2))), 4)), text)
    text = re.sub(r'\$\(trunc (-?[\d.]+)\)',  lambda m: str(math.trunc(float(m.group(1)))), text)
    text = re.sub(r'\$\(frac (-?[\d.]+)\)',   lambda m: str(round(float(m.group(1)) - math.trunc(float(m.group(1))), 6)), text)
    def _gcd2(a, b):
        a, b = int(abs(float(a))), int(abs(float(b)))
        while b: a, b = b, a % b
        return a
    text = re.sub(r'\$\(gcd (-?[\d.]+) (-?[\d.]+)\)', lambda m: str(_gcd2(m.group(1), m.group(2))), text)
    text = re.sub(r'\$\(lcm (-?[\d.]+) (-?[\d.]+)\)', lambda m: str(int(abs(float(m.group(1)))) // _gcd2(m.group(1), m.group(2)) * int(abs(float(m.group(2)))) if _gcd2(m.group(1), m.group(2)) else '0'), text)
    def _factorial_v(m):
        try:
            n = int(float(m.group(1)))
            if n < 0 or n > 20: return '?'
            r = 1
            for i in range(2, n + 1): r *= i
            return str(r)
        except: return '?'
    text = re.sub(r'\$\(factorial (\d+)\)', _factorial_v, text)
    def _fib_v(m):
        try:
            n = int(m.group(1))
            if n < 0 or n > 80: return '?'
            a, b = 0, 1
            for _ in range(n): a, b = b, a + b
            return str(a)
        except: return '?'
    text = re.sub(r'\$\(fib (\d+)\)', _fib_v, text)
    def _isprime_v(m):
        try:
            n = int(float(m.group(1)))
            if n < 2: return '0'
            if n == 2: return '1'
            if n % 2 == 0: return '0'
            for i in range(3, int(n ** 0.5) + 1, 2):
                if n % i == 0: return '0'
            return '1'
        except: return '?'
    text = re.sub(r'\$\(isprime (\d+)\)', _isprime_v, text)
    text = re.sub(r'\$\(digitsum (-?[\d.]+)\)',    lambda m: str(sum(int(c) for c in str(abs(int(float(m.group(1))))) if c.isdigit())), text)
    text = re.sub(r'\$\(digits (-?[\d.]+)\)',       lambda m: str(len(str(abs(int(float(m.group(1))))))), text)
    text = re.sub(r'\$\(digitreverse (-?[\d.]+)\)', lambda m: str(int(str(abs(int(float(m.group(1)))))[::-1])), text)
    text = re.sub(r'\$\(countbits (\d+)\)',         lambda m: str(bin(int(m.group(1))).count('1')), text)
    text = re.sub(r'\$\(lerp (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)', lambda m: str(round(float(m.group(1)) + float(m.group(3)) * (float(m.group(2)) - float(m.group(1))), 6)), text)
    def _maprange_v(m):
        try:
            x, a1, a2, b1, b2 = float(m.group(1)), float(m.group(2)), float(m.group(3)), float(m.group(4)), float(m.group(5))
            if a2 == a1: return '?'
            return str(round(b1 + (x - a1) / (a2 - a1) * (b2 - b1), 6))
        except: return '?'
    text = re.sub(r'\$\(maprange (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)\)', _maprange_v, text)

    # ── Number bases ─────────────────────────────────────────────────────────
    text = re.sub(r'\$\(hex (\d+)\)',           lambda m: hex(int(m.group(1)))[2:].upper(), text)
    text = re.sub(r'\$\(oct (\d+)\)',           lambda m: oct(int(m.group(1)))[2:], text)
    text = re.sub(r'\$\(bin (\d+)\)',           lambda m: bin(int(m.group(1)))[2:], text)
    text = re.sub(r'\$\(fromhex ([0-9A-Fa-f]+)\)', lambda m: str(int(m.group(1), 16)), text)
    text = re.sub(r'\$\(fromoct ([0-7]+)\)',    lambda m: str(int(m.group(1), 8)), text)
    text = re.sub(r'\$\(frombin ([01]+)\)',     lambda m: str(int(m.group(1), 2)), text)
    def _roman_v(m):
        try:
            n = int(m.group(1))
            if n <= 0 or n > 3999: return '?'
            vals = [(1000,'M'),(900,'CM'),(500,'D'),(400,'CD'),(100,'C'),(90,'XC'),(50,'L'),(40,'XL'),(10,'X'),(9,'IX'),(5,'V'),(4,'IV'),(1,'I')]
            r = ''
            for v, s in vals:
                while n >= v: r += s; n -= v
            return r
        except: return '?'
    text = re.sub(r'\$\(roman (\d+)\)', _roman_v, text)
    def _unroman_v(m):
        try:
            s = m.group(1).upper()
            val = {'I':1,'V':5,'X':10,'L':50,'C':100,'D':500,'M':1000}
            result = 0
            for i in range(len(s)):
                cur, nxt = val.get(s[i], 0), val.get(s[i+1], 0) if i+1 < len(s) else 0
                result += cur if cur >= nxt else -cur
            return str(result)
        except: return '?'
    text = re.sub(r'\$\(unroman ([IVXLCDM]+)\)', _unroman_v, text)

    # ── DateTime advanced ────────────────────────────────────────────────────
    _MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    _MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    _DAY_NAMES   = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']
    _DAY_SHORT   = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
    _SEASONS_N   = ['Winter','Winter','Spring','Spring','Spring','Summer','Summer','Summer','Fall','Fall','Fall','Winter']
    _days_in_year = 366 if (now.year % 4 == 0 and (now.year % 100 != 0 or now.year % 400 == 0)) else 365
    _monthdays_n  = _cal.monthrange(now.year, now.month)[1]
    text = text.replace('$(weekday)',     _DAY_NAMES[now.weekday()])
    text = text.replace('$(weekdaynum)',  str(now.weekday()))
    text = text.replace('$(yearday)',     str(now.timetuple().tm_yday))
    text = text.replace('$(quarter)',     f'Q{(now.month - 1) // 3 + 1}')
    text = text.replace('$(monthname)',   _MONTH_NAMES[now.month - 1])
    text = text.replace('$(monthshort)',  _MONTH_SHORT[now.month - 1])
    text = text.replace('$(dayname)',     _DAY_NAMES[now.weekday()])
    text = text.replace('$(dayshort)',    _DAY_SHORT[now.weekday()])
    text = text.replace('$(isweekend)',   '1' if now.weekday() >= 5 else '0')
    text = text.replace('$(isweekday)',   '0' if now.weekday() >= 5 else '1')
    text = text.replace('$(utchour)',     datetime.datetime.utcnow().strftime('%H'))
    text = text.replace('$(utcdate)',     datetime.datetime.utcnow().strftime('%Y-%m-%d'))
    text = text.replace('$(utcdatetime)', datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S'))
    text = text.replace('$(daysleft)',    str(_days_in_year - now.timetuple().tm_yday))
    text = text.replace('$(daysinyear)',  str(_days_in_year))
    text = text.replace('$(monthdays)',   str(_monthdays_n))
    text = text.replace('$(monthpct)',    str(round(now.day / _monthdays_n * 100, 1)))
    text = text.replace('$(yearpct)',     str(round(now.timetuple().tm_yday / _days_in_year * 100, 1)))
    text = text.replace('$(isleapyear)', '1' if _days_in_year == 366 else '0')
    text = text.replace('$(season)',      _SEASONS_N[now.month - 1])
    text = text.replace('$(dayofmonth)',  str(now.day))
    text = text.replace('$(yearshort)',   now.strftime('%y'))
    text = text.replace('$(hour12)',      now.strftime('%I').lstrip('0') or '12')
    text = text.replace('$(ampm)',        now.strftime('%p'))
    text = text.replace('$(milliseconds)', str(int(time.time() * 1000)))
    text = re.sub(r'\$\(since ([0-9\-]+)\)',  lambda m: str((now.date() - datetime.date.fromisoformat(m.group(1).strip())).days) if re.match(r'\d{4}-\d{2}-\d{2}', m.group(1)) else '?', text)
    text = re.sub(r'\$\(until ([0-9\-]+)\)',  lambda m: str((datetime.date.fromisoformat(m.group(1).strip()) - now.date()).days) if re.match(r'\d{4}-\d{2}-\d{2}', m.group(1)) else '?', text)
    text = re.sub(r'\$\(age ([0-9\-]+)\)',    lambda m: str(now.year - datetime.date.fromisoformat(m.group(1).strip()).year - ((now.month, now.day) < (datetime.date.fromisoformat(m.group(1).strip()).month, datetime.date.fromisoformat(m.group(1).strip()).day))) if re.match(r'\d{4}-\d{2}-\d{2}', m.group(1)) else '?', text)
    text = re.sub(r'\$\(adddays (-?\d+)\)',   lambda m: (now.date() + datetime.timedelta(days=int(m.group(1)))).strftime('%Y-%m-%d'), text)
    text = re.sub(r'\$\(subdays (\d+)\)',     lambda m: (now.date() - datetime.timedelta(days=int(m.group(1)))).strftime('%Y-%m-%d'), text)
    def _durationfmt_v(m):
        try:
            s = int(float(m.group(1))); h, rem = divmod(abs(s), 3600); mi, sec = divmod(rem, 60)
            return f'{"-" if s < 0 else ""}{h:02d}:{mi:02d}:{sec:02d}'
        except: return '?'
    text = re.sub(r'\$\(durationfmt (\d+)\)', _durationfmt_v, text)
    text = re.sub(r'\$\(timeago (\d+)\)',     lambda m: (lambda s: f'{s//86400}d ago' if s>=86400 else (f'{s//3600}h ago' if s>=3600 else (f'{s//60}m ago' if s>=60 else f'{s}s ago')))(max(0, int(time.time())-int(m.group(1)))), text)
    text = re.sub(r'\$\(futuretime (\d+)\)',  lambda m: (lambda s: f'in {s//86400}d' if s>=86400 else (f'in {s//3600}h' if s>=3600 else (f'in {s//60}m' if s>=60 else f'in {s}s')))(max(0, int(m.group(1))-int(time.time()))), text)

    # ── String advanced ──────────────────────────────────────────────────────
    text = re.sub(r'\$\(pad (\d+) ([^)]+)\)',      lambda m: m.group(2).center(int(m.group(1))), text)
    text = re.sub(r'\$\(padr (\d+) ([^)]+)\)',     lambda m: m.group(2).ljust(int(m.group(1))), text)
    text = re.sub(r'\$\(padl (\d+) ([^)]+)\)',     lambda m: m.group(2).rjust(int(m.group(1))), text)
    text = re.sub(r'\$\(repeatstr (\d+) ([^)]+)\)',lambda m: m.group(2) * min(int(m.group(1)), 50), text)
    def _repeatjoin_v(m):
        parts = m.group(1).split('|')
        if len(parts) < 3: return ''
        try: return parts[2].join([parts[0]] * min(int(parts[1]), 30))
        except: return ''
    text = re.sub(r'\$\(repeatjoin ([^)]+)\)', _repeatjoin_v, text)
    text = re.sub(r'\$\(chars ([^)]+)\)',          lambda m: str(len(m.group(1))), text)
    text = re.sub(r'\$\(truncate (\d+) ([^)]+)\)', lambda m: m.group(2)[:int(m.group(1))] + '…' if len(m.group(2)) > int(m.group(1)) else m.group(2), text)
    def _indexof_v(m):
        parts = m.group(1).split('|', 1)
        return str(parts[0].find(parts[1])) if len(parts) == 2 else '-1'
    text = re.sub(r'\$\(indexof ([^)]+)\)',        _indexof_v, text)
    def _lastindexof_v(m):
        parts = m.group(1).split('|', 1)
        return str(parts[0].rfind(parts[1])) if len(parts) == 2 else '-1'
    text = re.sub(r'\$\(lastindexof ([^)]+)\)',    _lastindexof_v, text)
    def _countstr_v(m):
        parts = m.group(1).split('|', 1)
        return str(parts[0].lower().count(parts[1].lower())) if len(parts) == 2 else '0'
    text = re.sub(r'\$\(strcount ([^)]+)\)',        _countstr_v, text)
    def _contains_v(m):
        parts = m.group(1).split('|', 1)
        return ('1' if parts[1].lower() in parts[0].lower() else '0') if len(parts) == 2 else '0'
    text = re.sub(r'\$\(strcontains ([^)]+)\)',     _contains_v, text)
    def _startswith_v(m):
        parts = m.group(1).split('|', 1)
        return ('1' if parts[0].lower().startswith(parts[1].lower()) else '0') if len(parts) == 2 else '0'
    text = re.sub(r'\$\(startswith ([^)]+)\)',      _startswith_v, text)
    def _endswith_v(m):
        parts = m.group(1).split('|', 1)
        return ('1' if parts[0].lower().endswith(parts[1].lower()) else '0') if len(parts) == 2 else '0'
    text = re.sub(r'\$\(endswith ([^)]+)\)',        _endswith_v, text)
    text = re.sub(r'\$\(initials ([^)]+)\)',        lambda m: ''.join(w[0].upper() for w in m.group(1).split() if w), text)
    text = re.sub(r'\$\(camel ([^)]+)\)',           lambda m: (lambda ws: ws[0].lower() + ''.join(w.capitalize() for w in ws[1:]) if ws else '')(m.group(1).split()), text)
    text = re.sub(r'\$\(pascal ([^)]+)\)',          lambda m: ''.join(w.capitalize() for w in m.group(1).split()), text)
    text = re.sub(r'\$\(snake ([^)]+)\)',           lambda m: '_'.join(w.lower() for w in m.group(1).split()), text)
    text = re.sub(r'\$\(kebab ([^)]+)\)',           lambda m: '-'.join(w.lower() for w in m.group(1).split()), text)
    text = re.sub(r'\$\(screaming ([^)]+)\)',       lambda m: '_'.join(w.upper() for w in m.group(1).split()), text)
    text = re.sub(r'\$\(swapcase ([^)]+)\)',        lambda m: m.group(1).swapcase(), text)
    text = re.sub(r'\$\(altcase ([^)]+)\)',         lambda m: ''.join(c.upper() if i % 2 == 0 else c.lower() for i, c in enumerate(m.group(1))), text)
    text = re.sub(r'\$\(mock ([^)]+)\)',            lambda m: ''.join(c.upper() if i % 2 != 0 else c.lower() for i, c in enumerate(m.group(1))), text)
    def _rot13_v(m):
        r = ''
        for c in m.group(1):
            if 'a' <= c <= 'z': r += chr((ord(c) - 97 + 13) % 26 + 97)
            elif 'A' <= c <= 'Z': r += chr((ord(c) - 65 + 13) % 26 + 65)
            else: r += c
        return r
    text = re.sub(r'\$\(rot13 ([^)]+)\)',           _rot13_v, text)
    def _piglatin_v(m):
        def pl(w):
            v = 'aeiouAEIOU'
            if not w: return w
            if w[0] in v: return w + 'yay'
            i = 0
            while i < len(w) and w[i] not in v: i += 1
            return w[i:] + w[:i] + 'ay'
        return ' '.join(pl(w) for w in m.group(1).split())
    text = re.sub(r'\$\(pig ([^)]+)\)',             _piglatin_v, text)
    def _uwu_v(m):
        s = m.group(1).replace('r','w').replace('l','w').replace('R','W').replace('L','W')
        s = s.replace('na','nya').replace('Na','Nya').replace('no','nyo').replace('ne','nye')
        return s + ' ' + random.choice(['uwu','owo','~','>w<','UwU','(≧◡≦)'])
    text = re.sub(r'\$\(uwu ([^)]+)\)',             _uwu_v, text)
    text = re.sub(r'\$\(leet ([^)]+)\)',            lambda m: m.group(1).translate(str.maketrans('aAeEiIoOtTsS','443311007755')), text)
    text = re.sub(r'\$\(zalgo ([^)]+)\)',           lambda m: ''.join(c + random.choice(['̈','̃','̂','̊','̇','̄']) if c.isalpha() and random.random() > 0.5 else c for c in m.group(1)), text)
    text = re.sub(r'\$\(palindrome ([^)]+)\)',      lambda m: '1' if (s := m.group(1).lower().replace(' ','')) == s[::-1] else '0', text)
    def _b64e_v(m):
        try: return _b64.b64encode(m.group(1).encode()).decode()
        except: return '?'
    text = re.sub(r'\$\(base64e ([^)]+)\)',         _b64e_v, text)
    def _b64d_v(m):
        try: return _b64.b64decode(m.group(1) + '==').decode(errors='replace')
        except: return '?'
    text = re.sub(r'\$\(base64d ([^)]+)\)',         _b64d_v, text)
    text = re.sub(r'\$\(urlenc ([^)]+)\)',          lambda m: _up.quote(m.group(1), safe=''), text)
    text = re.sub(r'\$\(urldec ([^)]+)\)',          lambda m: _up.unquote(m.group(1)), text)
    text = re.sub(r'\$\(md5 ([^)]+)\)',             lambda m: _hlib.md5(m.group(1).encode()).hexdigest()[:16], text)
    text = re.sub(r'\$\(sha1 ([^)]+)\)',            lambda m: _hlib.sha1(m.group(1).encode()).hexdigest()[:16], text)
    text = re.sub(r'\$\(sha256 ([^)]+)\)',          lambda m: _hlib.sha256(m.group(1).encode()).hexdigest()[:16], text)
    def _crc32_v(m):
        import binascii
        return str(binascii.crc32(m.group(1).encode()) & 0xFFFFFFFF)
    text = re.sub(r'\$\(crc32 ([^)]+)\)',           _crc32_v, text)
    if '$(uuid)' in text:
        import uuid as _uuid_mod
        text = text.replace('$(uuid)', str(_uuid_mod.uuid4()))
    text = re.sub(r'\$\(nanoid (\d+)\)',            lambda m: ''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=min(int(m.group(1)), 64))), text)
    text = text.replace('$(nanoid)', ''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', k=12)))
    def _wordshuffle_v(m):
        ws = m.group(1).split(); random.shuffle(ws); return ' '.join(ws)
    text = re.sub(r'\$\(wordshuffle ([^)]+)\)',     _wordshuffle_v, text)
    def _charshuffle_v(m):
        cs = list(m.group(1)); random.shuffle(cs); return ''.join(cs)
    text = re.sub(r'\$\(charshuffle ([^)]+)\)',     _charshuffle_v, text)
    text = re.sub(r'\$\(stripspace ([^)]+)\)',      lambda m: ' '.join(m.group(1).split()), text)
    text = re.sub(r'\$\(zfill (\d+) (\d+)\)',       lambda m: m.group(2).zfill(int(m.group(1))), text)

    # ── List operations ──────────────────────────────────────────────────────
    def _nth_v(m):
        parts = m.group(1).split('|')
        try: return parts[int(parts[-1]) - 1] if 0 < int(parts[-1]) <= len(parts) - 1 else ''
        except: return ''
    text = re.sub(r'\$\(nth ([^)]+)\)',             _nth_v, text)
    text = re.sub(r'\$\(listlen ([^)]+)\)',         lambda m: str(len([p for p in m.group(1).split('|') if p])), text)
    def _sort_v(m):
        parts = [p.strip() for p in m.group(1).split('|') if p.strip()]
        try: return '|'.join(sorted(parts, key=lambda x: float(x)))
        except: return '|'.join(sorted(parts))
    text = re.sub(r'\$\(listsort ([^)]+)\)',        _sort_v, text)
    def _rsort_v(m):
        parts = [p.strip() for p in m.group(1).split('|') if p.strip()]
        try: return '|'.join(sorted(parts, key=lambda x: float(x), reverse=True))
        except: return '|'.join(sorted(parts, reverse=True))
    text = re.sub(r'\$\(listrsort ([^)]+)\)',       _rsort_v, text)
    def _unique_v(m):
        seen, result = set(), []
        for p in m.group(1).split('|'):
            if p not in seen: seen.add(p); result.append(p)
        return '|'.join(result)
    text = re.sub(r'\$\(listunique ([^)]+)\)',      _unique_v, text)
    text = re.sub(r'\$\(listreverse ([^)]+)\)',     lambda m: '|'.join(reversed(m.group(1).split('|'))), text)
    def _head_v(m):
        parts = m.group(1).split('|')
        try: n = int(parts[-1]); return '|'.join(parts[:-1][:n])
        except: return m.group(1)
    text = re.sub(r'\$\(listhead ([^)]+)\)',        _head_v, text)
    def _tail_v(m):
        parts = m.group(1).split('|')
        try: n = int(parts[-1]); return '|'.join((parts[:-1] if n > 0 else [])[-n:] if n > 0 else [])
        except: return m.group(1)
    text = re.sub(r'\$\(listtail ([^)]+)\)',        _tail_v, text)
    def _listcontains_v(m):
        parts = m.group(1).split('|')
        return ('1' if parts[-1] in parts[:-1] else '0') if len(parts) >= 2 else '0'
    text = re.sub(r'\$\(listcontains ([^)]+)\)',    _listcontains_v, text)
    def _sample_v(m):
        parts = m.group(1).split('|')
        try: n = int(parts[-1]); items = parts[:-1]; return '|'.join(random.sample(items, min(n, len(items))))
        except: return m.group(1)
    text = re.sub(r'\$\(listsample ([^)]+)\)',      _sample_v, text)
    def _randitem_v(m):
        parts = [p.strip() for p in m.group(1).split('|') if p.strip()]
        return random.choice(parts) if parts else ''
    text = re.sub(r'\$\(randitem ([^)]+)\)',        _randitem_v, text)
    def _join_v(m):
        parts = m.group(1).split('|')
        if len(parts) >= 2: return parts[-1].join(parts[:-1])
        return m.group(1)
    text = re.sub(r'\$\(listjoin ([^)]+)\)',        _join_v, text)
    def _splitget_v(m):
        parts = m.group(1).split('|')
        if len(parts) < 3: return ''
        try: sp = parts[0].split(parts[1]); return sp[int(parts[2]) - 1] if 0 < int(parts[2]) <= len(sp) else ''
        except: return ''
    text = re.sub(r'\$\(splitget ([^)]+)\)',        _splitget_v, text)
    def _listmap_v(m):
        # $(listmap LIST|upper) or $(listmap LIST|lower) etc
        parts = m.group(1).split('|')
        if len(parts) < 2: return m.group(1)
        items, fn = parts[:-1], parts[-1].strip()
        ops = {'upper': str.upper, 'lower': str.lower, 'title': str.title, 'strip': str.strip, 'reverse': lambda s: s[::-1]}
        f = ops.get(fn, lambda s: s)
        return '|'.join(f(i) for i in items)
    text = re.sub(r'\$\(listmap ([^)]+)\)',         _listmap_v, text)
    def _listfilter_v(m):
        # $(listfilter LIST|SEARCH) - keep items containing SEARCH
        parts = m.group(1).split('|')
        if len(parts) < 2: return m.group(1)
        items, needle = parts[:-1], parts[-1].lower()
        return '|'.join(i for i in items if needle in i.lower())
    text = re.sub(r'\$\(listfilter ([^)]+)\)',      _listfilter_v, text)
    def _listcount_v(m):
        # $(listcount LIST|ITEM) - count occurrences
        parts = m.group(1).split('|')
        if len(parts) < 2: return '0'
        items, target = parts[:-1], parts[-1]
        return str(items.count(target))
    text = re.sub(r'\$\(listcount ([^)]+)\)',       _listcount_v, text)
    def _listadd_v(m):
        # $(listadd LIST|ITEM) - append item
        parts = m.group(1).split('|')
        if len(parts) < 2: return m.group(1)
        return '|'.join(parts[:-1] + [parts[-1]])
    text = re.sub(r'\$\(listadd ([^)]+)\)',         _listadd_v, text)
    def _listremove_v(m):
        # $(listremove LIST|ITEM) - remove first occurrence
        parts = m.group(1).split('|')
        if len(parts) < 2: return m.group(1)
        items, target = list(parts[:-1]), parts[-1]
        if target in items: items.remove(target)
        return '|'.join(items)
    text = re.sub(r'\$\(listremove ([^)]+)\)',      _listremove_v, text)
    def _listindex_v(m):
        # $(listindex LIST|ITEM) - index of item (1-based)
        parts = m.group(1).split('|')
        if len(parts) < 2: return '-1'
        items, target = parts[:-1], parts[-1]
        return str(items.index(target) + 1) if target in items else '-1'
    text = re.sub(r'\$\(listindex ([^)]+)\)',       _listindex_v, text)

    # ── Conditional / flow extended ───────────────────────────────────────────
    def _ifgt_v(m):
        p = m.group(1).split('|')
        if len(p) < 4: return ''
        try: return p[2] if float(p[0]) > float(p[1]) else p[3]
        except: return p[2] if p[0] > p[1] else p[3]
    text = re.sub(r'\$\(ifgt ([^)]+)\)',            _ifgt_v, text)
    def _iflt_v(m):
        p = m.group(1).split('|')
        if len(p) < 4: return ''
        try: return p[2] if float(p[0]) < float(p[1]) else p[3]
        except: return p[2] if p[0] < p[1] else p[3]
    text = re.sub(r'\$\(iflt ([^)]+)\)',            _iflt_v, text)
    def _ifeq_v(m):
        p = m.group(1).split('|')
        return (p[2] if p[0] == p[1] else p[3]) if len(p) >= 4 else ''
    text = re.sub(r'\$\(ifeq ([^)]+)\)',            _ifeq_v, text)
    def _ifne_v(m):
        p = m.group(1).split('|')
        return (p[2] if p[0] != p[1] else p[3]) if len(p) >= 4 else ''
    text = re.sub(r'\$\(ifne ([^)]+)\)',            _ifne_v, text)
    def _ifempty_v(m):
        p = m.group(1).split('|')
        return (p[1] if not p[0].strip() else p[2]) if len(p) >= 3 else ''
    text = re.sub(r'\$\(ifempty ([^)]+)\)',         _ifempty_v, text)
    def _ifnotempty_v(m):
        p = m.group(1).split('|')
        return (p[1] if p[0].strip() else p[2]) if len(p) >= 3 else ''
    text = re.sub(r'\$\(ifnotempty ([^)]+)\)',      _ifnotempty_v, text)
    def _ifcontains_v(m):
        p = m.group(1).split('|')
        return (p[2] if p[1].lower() in p[0].lower() else p[3]) if len(p) >= 4 else ''
    text = re.sub(r'\$\(ifcontains ([^)]+)\)',      _ifcontains_v, text)
    def _ifstartswith_v(m):
        p = m.group(1).split('|')
        return (p[2] if p[0].lower().startswith(p[1].lower()) else p[3]) if len(p) >= 4 else ''
    text = re.sub(r'\$\(ifstartswith ([^)]+)\)',    _ifstartswith_v, text)
    def _ifendswith_v(m):
        p = m.group(1).split('|')
        return (p[2] if p[0].lower().endswith(p[1].lower()) else p[3]) if len(p) >= 4 else ''
    text = re.sub(r'\$\(ifendswith ([^)]+)\)',      _ifendswith_v, text)
    def _coalesce_v(m):
        for p in m.group(1).split('|'):
            if p.strip(): return p.strip()
        return ''
    text = re.sub(r'\$\(coalesce ([^)]+)\)',        _coalesce_v, text)
    def _default_v(m):
        p = m.group(1).split('|', 1)
        return p[0] if len(p) < 2 or p[0].strip() else p[1]
    text = re.sub(r'\$\(default ([^)]+)\)',         _default_v, text)
    def _ternary_v(m):
        p = m.group(1).split('|')
        if len(p) < 3: return ''
        return p[1] if p[0].strip() and p[0].strip() not in ('0','false','no') else p[2]
    text = re.sub(r'\$\(ternary ([^)]+)\)',         _ternary_v, text)
    def _case_v(m):
        p = m.group(1).split('|', 1)
        if len(p) < 2: return m.group(1)
        txt, mode = p[0], p[1].strip()
        return {'upper': txt.upper, 'lower': txt.lower, 'title': txt.title, 'sentence': txt.capitalize, 'swap': txt.swapcase}.get(mode, lambda: txt)()
    text = re.sub(r'\$\(case ([^)]+)\)',            _case_v, text)
    def _ifnum_v(m):
        p = m.group(1).split('|')
        if len(p) < 3: return ''
        try: float(p[0]); return p[1]
        except: return p[2]
    text = re.sub(r'\$\(ifnum ([^)]+)\)',           _ifnum_v, text)
    def _ifgte_v(m):
        p = m.group(1).split('|')
        if len(p) < 4: return ''
        try: return p[2] if float(p[0]) >= float(p[1]) else p[3]
        except: return ''
    text = re.sub(r'\$\(ifgte ([^)]+)\)',           _ifgte_v, text)
    def _iflte_v(m):
        p = m.group(1).split('|')
        if len(p) < 4: return ''
        try: return p[2] if float(p[0]) <= float(p[1]) else p[3]
        except: return ''
    text = re.sub(r'\$\(iflte ([^)]+)\)',           _iflte_v, text)

    # ── List statistics ──────────────────────────────────────────────────────
    def _ls(fn):
        def _h(m):
            try:
                nums = [float(x) for x in m.group(1).split('|') if x.strip()]
                if not nums: return '?'
                r = fn(nums)
                return str(int(r) if r == int(r) else round(r, 4))
            except: return '?'
        return _h
    text = re.sub(r'\$\(sum ([^)]+)\)',        _ls(sum), text)
    text = re.sub(r'\$\(product ([^)]+)\)',    _ls(lambda ns: __import__('functools').reduce(lambda a, b: a * b, ns, 1)), text)
    text = re.sub(r'\$\(mean ([^)]+)\)',       _ls(lambda ns: sum(ns) / len(ns)), text)
    text = re.sub(r'\$\(maxlist ([^)]+)\)',    _ls(max), text)
    text = re.sub(r'\$\(minlist ([^)]+)\)',    _ls(min), text)
    text = re.sub(r'\$\(rangelist ([^)]+)\)',  _ls(lambda ns: max(ns) - min(ns)), text)
    text = re.sub(r'\$\(median ([^)]+)\)',     _ls(lambda ns: sorted(ns)[len(ns)//2] if len(ns) % 2 else (sorted(ns)[len(ns)//2-1] + sorted(ns)[len(ns)//2]) / 2), text)
    text = re.sub(r'\$\(stddev ([^)]+)\)',     _ls(lambda ns: (sum((x - sum(ns)/len(ns))**2 for x in ns) / len(ns)) ** 0.5), text)
    text = re.sub(r'\$\(variance ([^)]+)\)',   _ls(lambda ns: sum((x - sum(ns)/len(ns))**2 for x in ns) / len(ns)), text)

    # ── Unit conversions ─────────────────────────────────────────────────────
    text = re.sub(r'\$\(kmtomi (-?[\d.]+)\)',    lambda m: str(round(float(m.group(1)) * 0.621371, 2)), text)
    text = re.sub(r'\$\(mitokm (-?[\d.]+)\)',    lambda m: str(round(float(m.group(1)) * 1.60934, 2)), text)
    text = re.sub(r'\$\(kgtolbs (-?[\d.]+)\)',   lambda m: str(round(float(m.group(1)) * 2.20462, 2)), text)
    text = re.sub(r'\$\(lbstokg (-?[\d.]+)\)',   lambda m: str(round(float(m.group(1)) * 0.453592, 2)), text)
    text = re.sub(r'\$\(ctof (-?[\d.]+)\)',      lambda m: str(round(float(m.group(1)) * 9 / 5 + 32, 1)), text)
    text = re.sub(r'\$\(ftoc (-?[\d.]+)\)',      lambda m: str(round((float(m.group(1)) - 32) * 5 / 9, 1)), text)
    text = re.sub(r'\$\(ctok (-?[\d.]+)\)',      lambda m: str(round(float(m.group(1)) + 273.15, 2)), text)
    text = re.sub(r'\$\(ktoc (-?[\d.]+)\)',      lambda m: str(round(float(m.group(1)) - 273.15, 2)), text)
    text = re.sub(r'\$\(mtoft (-?[\d.]+)\)',     lambda m: str(round(float(m.group(1)) * 3.28084, 2)), text)
    text = re.sub(r'\$\(fttom (-?[\d.]+)\)',     lambda m: str(round(float(m.group(1)) * 0.3048, 2)), text)
    text = re.sub(r'\$\(cmtoin (-?[\d.]+)\)',    lambda m: str(round(float(m.group(1)) * 0.393701, 2)), text)
    text = re.sub(r'\$\(intocm (-?[\d.]+)\)',    lambda m: str(round(float(m.group(1)) * 2.54, 2)), text)
    text = re.sub(r'\$\(ltogl (-?[\d.]+)\)',     lambda m: str(round(float(m.group(1)) * 0.264172, 3)), text)
    text = re.sub(r'\$\(gltol (-?[\d.]+)\)',     lambda m: str(round(float(m.group(1)) * 3.78541, 3)), text)
    text = re.sub(r'\$\(oztoml (-?[\d.]+)\)',    lambda m: str(round(float(m.group(1)) * 29.5735, 2)), text)
    text = re.sub(r'\$\(mltoz (-?[\d.]+)\)',     lambda m: str(round(float(m.group(1)) * 0.033814, 3)), text)
    text = re.sub(r'\$\(mphtokmh (-?[\d.]+)\)',  lambda m: str(round(float(m.group(1)) * 1.60934, 2)), text)
    text = re.sub(r'\$\(kmhtomph (-?[\d.]+)\)',  lambda m: str(round(float(m.group(1)) * 0.621371, 2)), text)
    text = re.sub(r'\$\(acretoha (-?[\d.]+)\)',  lambda m: str(round(float(m.group(1)) * 0.404686, 4)), text)
    text = re.sub(r'\$\(hatoacre (-?[\d.]+)\)',  lambda m: str(round(float(m.group(1)) * 2.47105, 4)), text)
    text = re.sub(r'\$\(joulestocal (-?[\d.]+)\)', lambda m: str(round(float(m.group(1)) * 0.239006, 4)), text)
    text = re.sub(r'\$\(caltojoules (-?[\d.]+)\)', lambda m: str(round(float(m.group(1)) * 4.184, 4)), text)
    text = re.sub(r'\$\(mstomph (-?[\d.]+)\)',   lambda m: str(round(float(m.group(1)) * 2.23694, 2)), text)
    text = re.sub(r'\$\(nmitokm (-?[\d.]+)\)',   lambda m: str(round(float(m.group(1)) * 1.852, 3)), text)
    text = re.sub(r'\$\(pxtoem (-?[\d.]+)\)',    lambda m: str(round(float(m.group(1)) / 16, 4)), text)
    text = re.sub(r'\$\(emtopx (-?[\d.]+)\)',    lambda m: str(round(float(m.group(1)) * 16, 2)), text)

    # ── Color utilities ───────────────────────────────────────────────────────
    def _hextorgb_v(m):
        try:
            h = m.group(1).lstrip('#')
            if len(h) == 3: h = ''.join(c * 2 for c in h)
            return f'{int(h[0:2],16)},{int(h[2:4],16)},{int(h[4:6],16)}'
        except: return '?'
    text = re.sub(r'\$\(hextorgb ([0-9A-Fa-f#]+)\)',  _hextorgb_v, text)
    def _rgbtohex_v(m):
        try:
            p = m.group(1).split('|'); return f'#{int(p[0]):02X}{int(p[1]):02X}{int(p[2]):02X}'
        except: return '?'
    text = re.sub(r'\$\(rgbtohex ([^)]+)\)',            _rgbtohex_v, text)
    def _lighten_v(m):
        try:
            p = m.group(1).split('|'); h = p[0].lstrip('#')
            if len(h) == 3: h = ''.join(c * 2 for c in h)
            pct = float(p[1]) / 100 if len(p) > 1 else 0.2
            r = min(255, int(int(h[0:2],16) + (255 - int(h[0:2],16)) * pct))
            g = min(255, int(int(h[2:4],16) + (255 - int(h[2:4],16)) * pct))
            b = min(255, int(int(h[4:6],16) + (255 - int(h[4:6],16)) * pct))
            return f'#{r:02X}{g:02X}{b:02X}'
        except: return '?'
    text = re.sub(r'\$\(lighten ([^)]+)\)',             _lighten_v, text)
    def _darken_v(m):
        try:
            p = m.group(1).split('|'); h = p[0].lstrip('#')
            if len(h) == 3: h = ''.join(c * 2 for c in h)
            pct = float(p[1]) / 100 if len(p) > 1 else 0.2
            r = max(0, int(int(h[0:2],16) * (1 - pct)))
            g = max(0, int(int(h[2:4],16) * (1 - pct)))
            b = max(0, int(int(h[4:6],16) * (1 - pct)))
            return f'#{r:02X}{g:02X}{b:02X}'
        except: return '?'
    text = re.sub(r'\$\(darken ([^)]+)\)',              _darken_v, text)
    def _complement_v(m):
        try:
            h = m.group(1).lstrip('#')
            if len(h) == 3: h = ''.join(c * 2 for c in h)
            return f'#{255-int(h[0:2],16):02X}{255-int(h[2:4],16):02X}{255-int(h[4:6],16):02X}'
        except: return '?'
    text = re.sub(r'\$\(complementhex ([0-9A-Fa-f#]+)\)', _complement_v, text)

    # ── Progress / visual helpers ─────────────────────────────────────────────
    def _progressbar_v(m):
        try:
            p = m.group(1).split('|')
            pct = max(0.0, min(100.0, float(p[0])))
            w = min(int(p[1]), 30) if len(p) > 1 else 10
            filled = int(pct / 100 * w)
            return '█' * filled + '░' * (w - filled) + f' {pct:.0f}%'
        except: return '?'
    text = re.sub(r'\$\(progressbar ([^)]+)\)', _progressbar_v, text)
    text = re.sub(r'\$\(bar ([^)]+)\)',          _progressbar_v, text)
    def _stargraph_v(m):
        try:
            p = m.group(1).split('|')
            pct = max(0.0, min(100.0, float(p[0])))
            w = min(int(p[1]), 20) if len(p) > 1 else 5
            filled = int(pct / 100 * w)
            return '⭐' * filled + '☆' * (w - filled)
        except: return '?'
    text = re.sub(r'\$\(stars ([^)]+)\)',        _stargraph_v, text)
    def _hpbar_v(m):
        try:
            p = m.group(1).split('|')
            cur, mx = float(p[0]), float(p[1])
            pct = max(0.0, min(100.0, cur / mx * 100)) if mx else 0
            filled = int(pct / 100 * 10)
            return f'❤️ {"█"*filled}{"░"*(10-filled)} {int(cur)}/{int(mx)}'
        except: return '?'
    text = re.sub(r'\$\(hpbar ([^)]+)\)',        _hpbar_v, text)

    # ── Random extended lists ─────────────────────────────────────────────────
    _RW   = ['galaxy','quantum','nebula','pixel','cipher','nexus','void','prism','echo','flux','zenith','vortex','pulse','nova','delta','axiom','rune','phantom','ether','solstice','aurora','cosmos','helix','orbit','parallax','radiance','tempest','umbra','zenon','alpha']
    _RADJ = ['blazing','crimson','silent','ancient','electric','neon','cosmic','mythic','frozen','golden','shadow','radiant','dark','swift','fierce','ethereal','legendary','colossal','tiny','brilliant','spectral','cursed','divine','hollow','iron','jade','lunar','mystic','serene','wild']
    _RN   = ['dragon','phoenix','cipher','rune','blade','shield','realm','abyss','crown','vault','beacon','oracle','specter','golem','titan','chimera','hydra','gryphon','sphinx','kraken','wraith','warden','sentinel','harbinger','nexus','revenant','seraph','templar','void','colossus']
    _RV   = ['vanquish','conjure','traverse','obliterate','transcend','illuminate','shatter','forge','summon','banish','unlock','ascend','descend','awaken','destroy','create','discover','unleash','protect','defy','enchant','fracture','invoke','nullify','overpower','pursue','reclaim','strike','unravel','wield']
    _RCOL = ['Crimson','Cobalt','Emerald','Amber','Violet','Teal','Scarlet','Indigo','Magenta','Cerulean','Vermillion','Chartreuse','Turquoise','Maroon','Ochre','Lavender','Coral','Ivory','Ebony','Jade','Azure','Bronze','Copper','Gold','Obsidian','Pearl','Ruby','Sapphire','Silver','Topaz']
    _RAAN = ['Axolotl','Capybara','Quokka','Platypus','Tardigrade','Narwhal','Pangolin','Ocelot','Fennec','Wombat','Mantis Shrimp','Glassfish','Mudskipper','Shoebill','Aye-aye','Blobfish','Kakapo','Tapir','Okapi','Binturong','Fossa','Numbat','Saiga','Tarsier','Vaquita','Zonkey','Zorilla','Dhole','Kinkajou','Viscacha']
    _RFD  = ['Baklava','Ramen','Pierogi','Injera','Poutine','Shakshuka','Bibimbap','Mole','Tagine','Khachapuri','Rendang','Goulash','Borscht','Pho','Gyoza','Paella','Tiramisu','Croissant','Sushi','Churros','Falafel','Jerk Chicken','Kimchi','Lumpia','Naan','Okonomiyaki','Peking Duck','Quesadilla','Ratatouille','Stroganoff']
    _RCNT = ['Iceland','Bhutan','Seychelles','Liechtenstein','Vanuatu','Kiribati','Andorra','Nauru','Tuvalu','San Marino','Monaco','Palau','Marshall Islands','Tonga','Samoa','Comoros','Suriname','Djibouti','Eritrea','Belize','Brunei','Cabo Verde','Eswatini','Gambia','Guyana','Lesotho','Malawi','Mauritius','Moldova','Montenegro']
    _RCAP = ['Reykjavik','Thimphu','Victoria','Vaduz','Port Vila','Tarawa','Andorra la Vella','Yaren','Funafuti','San Marino','Monaco','Ngerulmud','Majuro','Nuku\'alofa','Apia','Moroni','Paramaribo','Djibouti','Asmara','Belmopan','Bandar Seri Begawan','Praia','Mbabane','Banjul','Georgetown','Maseru','Lilongwe','Port Louis','Chișinău','Podgorica']
    _RLNG = ['Basque','Swahili','Quechua','Tamil','Icelandic','Welsh','Zulu','Tagalog','Armenian','Georgian','Mongolian','Tibetan','Hausa','Yoruba','Amharic','Khmer','Sinhala','Lao','Dzongkha','Nahuatl','Aymara','Catalan','Cherokee','Guarani','Hawaiian','Inuktitut','Maori','Navajo','Occitan','Sanskrit']
    _RFN  = ['Aiden','Brianna','Caleb','Delilah','Ethan','Fiona','Gavin','Hana','Isaac','Jasmine','Kai','Luna','Mason','Nora','Owen','Piper','Quinn','Riley','Sebastian','Talia','Uma','Victor','Wren','Xander','Yara','Zane','Aria','Blaze','Cleo','Dex']
    _RLN  = ['Storm','Frost','Drake','Vale','Quinn','Shore','Mist','Crane','Ford','Knight','Ash','Blaze','Cross','Dawn','Edge','Fall','Grant','Hawk','Jade','Lake','March','Nash','Onyx','Park','Reed','Sage','Thorn','Upton','Vex','Wolf']
    _RWPN = ['Plasma Cannon','Runic Blade','Shadow Dagger','Thunder Hammer','Frost Bow','Void Lance','Solar Axe','Spectral Staff','Iron Gauntlets','Mystic Crossbow','Chain Whip','Crystal Spear','Demon Sickle','Ether Blade','Flaming Sword','Ghost Pistol','Holy Mace','Ice Pick','Jade Halberd','Kraken Trident']
    _RSP  = ['Arcane Surge','Void Rend','Temporal Shift','Celestial Beam','Shadow Walk','Frost Nova','Chain Lightning','Soul Drain','Phoenix Flame','Ethereal Bind','Blood Pact','Cosmic Smite','Death Coil','Eclipse Burst','Fireball','Gravity Well','Hex Wave','Ice Lance','Judgement','Karma Strike']
    _RPT  = ['Elixir of Fortitude','Brew of Invisibility','Tonic of Swiftness','Potion of True Sight','Draught of Dragon Breath','Vial of Mending','Flask of Giant Strength','Mixture of Luck','Oil of Slipperiness','Philter of Love','Reagent of Recall','Serum of Silence','Tincture of Time','Unguent of Undying','Vapor of Vision']
    _RSUP = ['Time manipulation','Telekinesis','Invisibility','Super strength','Telepathy','Flight','Elemental control','Phasing','Healing factor','Energy projection','Probability manipulation','Reality warping','Dimensional travel','Precognition','Technopathy','Biokinesis','Gravity control','Magnetism','Sound control','Weather control']
    _RCR  = ['Eternal Hiccups','Speak Only in Questions','Invisible to Cats','Sneeze Glitter','Dance When Music Plays','Glow in the Dark','Speak Backwards','Turn Blue When Lying','Attract Pigeons','Can Only Walk Sideways','Hiccup When Lying','Only Whisper After Dark','Random Giggling','Shoes Untie Themselves','Smell Like Cinnamon Always']
    _RPR  = ['When the twin moons align, the chosen one will rise','The ancient seal will break at the seventh toll','One born of fire shall end the endless winter','The last dragon whispers the name of the true king','From the depths of the forgotten realm, salvation arrives','He who seeks the void shall become the void','The stars will fall when the silent queen speaks']
    _RACH = ['Speed Runner','First Blood','No Scope','100% Complete','Pacifist','World Record','Master Chef','Night Owl','Early Bird','Last Standing','Untouchable','Legend','Clutch King','Flawless Victory','Godlike','Headhunter','Ironman','Just Lucky','Kingslayer','Lifesaver']
    _RQU  = ['Retrieve the lost artifact from the ancient ruins','Defeat the shadow wyrm terrorizing the villages','Discover the source of the corrupted spring','Escort the merchant through bandit territory','Infiltrate the enemy fortress undetected','Negotiate a peace treaty between warring factions','Protect the village from the oncoming horde','Recover the stolen royal heirloom','Solve the mystery of the vanishing villagers','Track down the rogue alchemist']
    _RCL  = ['Paladin','Warlock','Druid','Rogue','Berserker','Necromancer','Monk','Ranger','Bard','Artificer','Shaman','Templar','Illusionist','Assassin','Summoner','Arcanist','Battlemage','Corsair','Demonhunter','Enchanter']
    _RRC  = ['High Elf','Dark Elf','Dwarf','Halfling','Gnome','Tiefling','Dragonborn','Aasimar','Orc','Kenku','Tabaxi','Triton','Fire Genasi','Goliath','Changeling','Autognome','Fairy','Harengon','Owlin','Sea Elf']
    _RMN  = ['Lich King','Shadow Drake','Void Titan','Frost Giant','Abyssal Horror','Spectral Knight','Iron Golem','Chimera','Basilisk','Manticore','Wyvern','Banshee','Revenant','Mimic','Beholder','Aboleth','Behir','Cloaker','Darkmantle','Elder Dragon']
    _RDG  = ['The Sunken Citadel','Tomb of the Eternal King','Ruins of Khareth','The Whispering Vaults','Caverns of Despair','The Iron Fortress','Hall of Forgotten Gods','The Cursed Labyrinth','Abyss of Echoes','Black Spire','Crypt of the Undying','Desolation Keep','Ember Hollow','Frostpeak Tower','Gloomhaven','Haunted Colosseum','Infernal Pit','Jade Palace','Kraken Bay','Lost Citadel']
    _RLT  = ['Legendary Sword +5','Bag of Infinite Holding','Ring of True Sight','Amulet of Dragon Resistance','Boots of Silent Steps','Cloak of Shadows','Tome of Forbidden Knowledge','Ancient Dragon Scale','Crown of the Lich','Divine Shield','Ethereal Bow','Frostbrand Dagger','Golden Fleece','Helm of Brilliance','Ioun Stone of Mastery']
    _RHS  = ['Today is perfect for new beginnings!','Trust your instincts — they will lead you right.','An unexpected encounter brings great fortune.','Focus on what matters most today.','Your creativity is at its peak!','Good things come to those who persevere.','A surprise awaits you around the corner.','The stars align in your favor today.','Embrace the challenge — growth awaits.','Your kindness will be rewarded.']
    _RFT  = ['A great adventure awaits you.','Someone is thinking of you right now.','Your talents will be recognized soon.','The answer you seek is closer than you think.','Fortune favors the bold today.','New doors are opening for you.','Trust the process — it all makes sense in time.','The tide turns in your favor.','What you seek is seeking you.','Your next big win is just around the corner.']
    _RRD  = ['I have cities but no houses, mountains but no trees, water but no fish. What am I? (A map)','The more you take, the more you leave behind. What am I? (Footsteps)','I speak without a mouth and hear without ears. What am I? (An echo)','I have hands but cannot clap. What am I? (A clock)','The more you have of it, the less you see. What is it? (Darkness)']
    _RPN  = ['Why did the scarecrow win an award? Outstanding in his field!','Why don\'t skeletons fight? They don\'t have the guts.','What do you call fake spaghetti? An impasta!','Why did the math book look sad? Too many problems.','I used to hate facial hair but then it grew on me.','What do you call a fish without eyes? A fsh.','Why do cows wear bells? Because their horns don\'t work.']
    _RDJ  = ['I\'m reading about anti-gravity. Impossible to put down!','Did you hear about the mathematician afraid of negative numbers? He\'ll stop at nothing.','I used to play piano by ear, now I use my hands.','I would make a joke about infinity but I wouldn\'t know where to start.','Why can\'t a bicycle stand on its own? It\'s two-tired.','I told my wife she was drawing her eyebrows too high. She looked surprised.']
    _RSH  = ['What if dogs think we\'re the pets?','If you dig a hole straight down, where do you end up?','Is the "S" in "lisp" ironic?','What color are mirrors?','Do fish get thirsty?','What was the first person to milk a cow trying to do?','If nobody buys a ticket, does the lottery just never happen?','What is sand but a bunch of little rocks?','Why is the word "abbreviated" so long?','Do you ever wonder if your dog wonders about you?']
    _RWY  = ['Would you rather have unlimited pizza or unlimited tacos?','Would you rather have super speed or super strength?','Would you rather never sleep again or always be tired?','Would you rather speak all languages or play all instruments?','Would you rather fly or be invisible?','Would you rather always be 10 minutes late or 20 minutes early?','Would you rather have a pause button or a rewind button for your life?']
    _RTR  = ['What is your most embarrassing moment?','What is your biggest fear?','What is your guilty pleasure?','What is the strangest dream you\'ve had?','What\'s a secret talent you have?','What would you do with a million dollars?','What\'s the most embarrassing song on your playlist?']
    _RDR  = ['Do your best impression of the streamer','Type your name with your elbows','Describe yourself in three emotes','Tell a joke in chat','Sing the first line of the current song','Roast yourself in one sentence','Say the alphabet backwards (or try to)']
    _RPU  = ['Are you a magician? Whenever I look at you, everyone else disappears.','Do you have a map? I keep getting lost in your eyes.','Are you a keyboard? You\'re just my type.','Do you like science? We have great chemistry.','Are you a Wi-Fi signal? I\'m feeling a connection.','Are you a star? You light up the room.']
    _RCM  = ['You have an incredible sense of humor!','Your presence lights up this chat!','You\'re the reason this community is so amazing!','Your creativity knows no bounds!','You make streaming so much more fun!','Your energy is absolutely contagious!','The world is a better place with you in it!','You\'re genuinely one of a kind!']
    _RIN  = ['You\'re not the dumbest person alive, but don\'t let that be a comfort.','I\'ve seen better code in a kindergarten class.','Your ping is higher than your IQ.','Even your shadow leaves you sometimes.','Your game sense is like a Wi-Fi signal — great until it matters.','If brains were dynamite you couldn\'t blow your hat off.']
    _RRT  = ['If brains were gasoline, {0} couldn\'t power a moped!','The only thing {0} takes seriously is themselves — and that\'s a tragedy.','I\'d say {0} is out of their mind, but that implies something was there.','They say practice makes perfect, but nothing explains {0}.','{0} is proof that evolution can go backwards.']
    _RMG  = ['Lo-fi Hip Hop','Progressive Metal','Synthwave','Bossa Nova','Celtic Folk','J-Pop','Reggaeton','Afrobeat','Drone Ambient','Bluegrass','K-Pop','Drum and Bass','Baroque','Chiptune','Dark Jazz','Electro Swing','Future Bass','Hyperpop','Indie Folk','Jazz Fusion']
    _RIT  = ['Theremin','Didgeridoo','Balalaika','Sitar','Guqin','Hurdy-Gurdy','Dulcimer','Bouzouki','Charango','Koto','Shamisen','Zither','Mbira','Bandoneón','Hang Drum','Erhu','Gayageum','Ney Flute','Santoor','Ukulele']
    _RSP2 = ['Ultimate Frisbee','Sepak Takraw','Kabaddi','Hurling','Pelota Vasca','Bossaball','Cheese Rolling','Bog Snorkeling','Underwater Hockey','Snow Polo','Buzkashi','Calcio Storico','Jai Alai','Korfball','Lacrosse','Polo','Pétanque','Sumo','Tchoukball','Yukigassen']
    _RES  = ['Valorant','Dota 2','CS2','League of Legends','Rocket League','Overwatch 2','Rainbow Six Siege','Apex Legends','Warzone','Street Fighter 6','Tekken 8','Starcraft II','Age of Empires IV','PUBG','Fortnite','Halo Infinite','Hearthstone','FIFA','Clash Royale','Brawl Stars']
    _RET  = ['Team Liquid','Cloud9','FaZe Clan','Natus Vincere','Fnatic','G2 Esports','100 Thieves','Evil Geniuses','TSM','Sentinels','Astralis','Complexity','FURIA','Gen.G','ENCE','Heroic','Ninjas in Pyjamas','OG','T1','Vitality']
    _RBG  = ['Catan','Pandemic','Ticket to Ride','Gloomhaven','Azul','Wingspan','Terraforming Mars','Scythe','7 Wonders','Spirit Island','Arkham Horror','Blood Rage','Codenames','Dead of Winter','Everdell','Forbidden Island','Hanabi','Istanbul','Jaws of the Lion','Kingdomino']
    _RPL  = ['Rust','Kotlin','Julia','Elixir','Haskell','Zig','Crystal','Nim','Raku','Pony','V','Odin','Grain','Gleam','Carbon','Mojo','Vale','Bend','Inko','Ante']
    _RFW  = ['SvelteKit','Nuxt 3','Astro','Remix','Fresh (Deno)','Qwik','Solid.js','htmx','Django Ninja','FastAPI','Hono','Elder.js','Enhance','Marko','Mitosis','Preact','Stencil','Ultra','Analog','Brisa']
    _RAL  = ['Dijkstra\'s','A*','Quick Sort','Merge Sort','Bellman-Ford','Floyd-Warshall','KMP Pattern Matching','Fast Fourier Transform','PageRank','Bloom Filter','Consistent Hashing','HyperLogLog','Knuth-Morris-Pratt','Levenshtein Distance','Needleman-Wunsch','Raft Consensus','RSA','SHA-256','Simulated Annealing','Viterbi']
    _RDS  = ['B-Tree','Skip List','Trie','Segment Tree','Fenwick Tree','Disjoint Set Union','Red-Black Tree','Fibonacci Heap','Suffix Array','Bloom Filter','AVL Tree','Binomial Heap','C-Trie','DAG','Finger Tree','Hash Array Mapped Trie','Interval Tree','Jump Consistent Hash','K-D Tree','Left-Leaning Red-Black Tree']
    _RPln = ['Mercury','Venus','Earth','Mars','Jupiter','Saturn','Uranus','Neptune']
    _RCon = ['Orion','Cassiopeia','Ursa Major','Scorpius','Perseus','Andromeda','Lyra','Cygnus','Aquila','Canis Major','Boötes','Centaurus','Corona Borealis','Draco','Hercules','Leo','Pegasus','Taurus','Virgo','Gemini']
    _REle = ['Hydrogen','Helium','Carbon','Oxygen','Nitrogen','Iron','Gold','Silver','Platinum','Uranium','Plutonium','Xenon','Neon','Krypton','Einsteinium','Fermium','Gallium','Hafnium','Indium','Nobelium']
    _RFr  = ['Durian','Rambutan','Mangosteen','Cherimoya','Jackfruit','Dragon Fruit','Feijoa','Lychee','Longan','Guava','Persimmon','Pawpaw','Carambola','Jabuticaba','Sapodilla','Acerola','Buddha\'s Hand','Calamansi','Duhat','Emu Apple']
    _RVg  = ['Kohlrabi','Celeriac','Romanesco','Jicama','Taro','Chayote','Bitter Melon','Breadfruit','Yuca','Purslane','Samphire','Fiddlehead','Sunchoke','Moringa','Bok Choy','Amaranth','Burdock','Callaloo','Dasheen','Epazote']
    _RCk  = ['Negroni','Daiquiri','Old Fashioned','Singapore Sling','French 75','Last Word','Penicillin','Corpse Reviver','Paper Plane','Naked and Famous','Aviation','Bee\'s Knees','Clover Club','Dark \'n\' Stormy','El Diablo','Fog Cutter','Gold Rush','Hanky Panky','Improved Whiskey Cocktail','Jungle Bird']
    _RCu  = ['Peruvian','Ethiopian','Georgian','Vietnamese','Moroccan','Lebanese','Oaxacan','Szechuan','Basque','Bengali','Cambodian','Danish','Ecuadorian','Filipino','Greek','Hmong','Iraqi','Jamaican','Kazakh','Lao']
    _RKao = ['(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧','(ʘ‿ʘ)','¯\\_(ツ)_/¯','(づ｡◕‿‿◕｡)づ','(╯°□°）╯︵ ┻━┻','ヽ(ﾟДﾟ)ﾉ','(◕‿◕)','(•̀ᴗ•́)و','(ง°ل͜°)ง','ᕦ(ò_óˇ)ᕤ','(＾▽＾)','(⌐■_■)','(づ￣ ³￣)づ','（；´д｀）ゞ','(ﾟДﾟ;)','〜(￣▽￣〜)','(っ˘ω˘ς)','(≧∇≦)/','(ｏ･ω･ｏ)','(｡◕‿◕｡)']
    _RLH  = ['Label your cables with bread clip tags.','Use a rubber band on a stripped screw for grip.','Chill wine fast by wrapping a wet paper towel around it.','Put a wooden spoon over a boiling pot to stop overflow.','Use dental floss to cut soft foods cleanly.','Freeze coffee in ice cube trays for iced coffee without dilution.','Put a sticker on a power strip to label each plug.','Use a squeegee to remove pet hair from carpet.','Store bed sheets inside one of their pillowcases.','Use a binder clip to protect razor blades when traveling.']
    _RTar = ['The Fool — New beginnings','The Magician — Skill and cunning','The High Priestess — Hidden knowledge','The Empress — Abundance','The Emperor — Authority','The Hierophant — Tradition','The Lovers — Union','The Chariot — Willpower','Strength — Courage','The Hermit — Solitude','Wheel of Fortune — Cycles','Justice — Balance','The Hanged Man — Surrender','Death — Transformation','Temperance — Patience','The Devil — Temptation','The Tower — Upheaval','The Star — Hope','The Moon — Illusion','The Sun — Clarity','Judgement — Renewal','The World — Completion']
    _RHog = ['Gryffindor','Hufflepuff','Ravenclaw','Slytherin']
    _RCZY = ['Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat','Monkey','Rooster','Dog','Pig']
    _RMOON= ['🌑 New Moon','🌒 Waxing Crescent','🌓 First Quarter','🌔 Waxing Gibbous','🌕 Full Moon','🌖 Waning Gibbous','🌗 Last Quarter','🌘 Waning Crescent']
    _RDEF = ['🌪️','⚡','🔥','❄️','🌊','🌿','☀️','🌙','💜','🎯','💎','🏆','🎮','🎲','🎸']

    text = text.replace('$(randword)',            random.choice(_RW))
    text = text.replace('$(randadjective)',       random.choice(_RADJ))
    text = text.replace('$(randnoun)',            random.choice(_RN))
    text = text.replace('$(randverb)',            random.choice(_RV))
    text = text.replace('$(randcolor)',           random.choice(_RCOL))
    text = text.replace('$(randhex)',             '#' + ''.join(random.choices('0123456789ABCDEF', k=6)))
    text = text.replace('$(randanimal)',          random.choice(_RAAN))
    text = text.replace('$(randfood)',            random.choice(_RFD))
    text = text.replace('$(randcountry)',         random.choice(_RCNT))
    text = text.replace('$(randcapital)',         random.choice(_RCAP))
    text = text.replace('$(randlanguage)',        random.choice(_RLNG))
    text = text.replace('$(randname)',            random.choice(_RFN))
    text = text.replace('$(randlastname)',        random.choice(_RLN))
    text = text.replace('$(randletter)',          random.choice('abcdefghijklmnopqrstuvwxyz'))
    text = text.replace('$(randdigit)',           str(random.randint(0, 9)))
    text = text.replace('$(randbool)',            random.choice(['0', '1']))
    text = text.replace('$(weapon)',              random.choice(_RWPN))
    text = text.replace('$(spell)',               random.choice(_RSP))
    text = text.replace('$(potion)',              random.choice(_RPT))
    text = text.replace('$(superpower)',          random.choice(_RSUP))
    text = text.replace('$(curse)',               random.choice(_RCR))
    text = text.replace('$(prophecy)',            random.choice(_RPR))
    text = text.replace('$(achievement)',         random.choice(_RACH))
    text = text.replace('$(quest)',               random.choice(_RQU))
    text = text.replace('$(rpgclass)',            random.choice(_RCL))
    text = text.replace('$(fantasyrace)',         random.choice(_RRC))
    text = text.replace('$(monster)',             random.choice(_RMN))
    text = text.replace('$(dungeon)',             random.choice(_RDG))
    text = text.replace('$(loot)',                random.choice(_RLT))
    text = text.replace('$(horoscope)',           random.choice(_RHS))
    text = text.replace('$(fortune)',             random.choice(_RFT))
    text = text.replace('$(riddle)',              random.choice(_RRD))
    text = text.replace('$(pun)',                 random.choice(_RPN))
    text = text.replace('$(dadjoke)',             random.choice(_RDJ))
    text = text.replace('$(shower)',              random.choice(_RSH))
    text = text.replace('$(wyr)',                 random.choice(_RWY))
    text = text.replace('$(truth)',               random.choice(_RTR))
    text = text.replace('$(dare)',                random.choice(_RDR))
    text = text.replace('$(pickup)',              random.choice(_RPU))
    text = text.replace('$(compliment2)',         random.choice(_RCM))
    text = text.replace('$(insult)',              random.choice(_RIN))
    text = text.replace('$(musicgenre)',          random.choice(_RMG))
    text = text.replace('$(instrument)',          random.choice(_RIT))
    text = text.replace('$(sport)',               random.choice(_RSP2))
    text = text.replace('$(esport)',              random.choice(_RES))
    text = text.replace('$(esportteam)',          random.choice(_RET))
    text = text.replace('$(boardgame)',           random.choice(_RBG))
    text = text.replace('$(programminglanguage)', random.choice(_RPL))
    text = text.replace('$(framework)',           random.choice(_RFW))
    text = text.replace('$(algorithm)',           random.choice(_RAL))
    text = text.replace('$(datastructure)',       random.choice(_RDS))
    text = text.replace('$(planet)',              random.choice(_RPln))
    text = text.replace('$(constellation)',       random.choice(_RCon))
    text = text.replace('$(element)',             random.choice(_REle))
    text = text.replace('$(fruit)',               random.choice(_RFr))
    text = text.replace('$(vegetable)',           random.choice(_RVg))
    text = text.replace('$(cocktail)',            random.choice(_RCk))
    text = text.replace('$(cuisine)',             random.choice(_RCu))
    text = text.replace('$(kaomoji)',             random.choice(_RKao))
    text = text.replace('$(lifehack)',            random.choice(_RLH))
    text = text.replace('$(tarot)',               random.choice(_RTar))
    text = text.replace('$(chineseyear)',         _RCZY[(now.year - 4) % 12])
    text = text.replace('$(moonphase)',           _RMOON[int(((int(time.time() / 86400) + 2440588 - 2451550) / 29.5306) % 1 * 8) % 8])
    text = text.replace('$(randomemoji)',         random.choice(_RDEF))
    text = text.replace('$(randip)',              '.'.join(str(random.randint(1, 254)) for _ in range(4)))
    text = text.replace('$(randmac)',             ':'.join(f'{random.randint(0, 255):02X}' for _ in range(6)))
    text = text.replace('$(randport)',            str(random.randint(1024, 65535)))
    text = text.replace('$(httpstatus)',          random.choice(['200 OK','201 Created','301 Moved','400 Bad Request','401 Unauthorized','403 Forbidden','404 Not Found','418 I\'m a Teapot','429 Too Many Requests','500 Server Error','503 Service Unavailable']))
    text = re.sub(r'\$\(roast ([^)]+)\)',         lambda m: random.choice(_RRT).format(m.group(1).lstrip('@')), text)
    text = re.sub(r'\$\(randpassword (\d+)\)',    lambda m: ''.join(random.choices('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*', k=min(int(m.group(1)), 64))), text)
    def _randseed_v(m):
        p = m.group(1).split('|')
        try:
            seed = int(_hlib.md5(p[0].encode()).hexdigest(), 16)
            mn, mx = int(p[1]), int(p[2])
            return str(mn + seed % (mx - mn + 1))
        except: return '?'
    text = re.sub(r'\$\(randseed ([^)]+)\)',      _randseed_v, text)

    # ── User-seeded deterministic vars ───────────────────────────────────────
    if nick:
        _uh = sum(ord(c) for c in nick.lower())
        text = text.replace('$(personality)',   ['Analytical','Creative','Chaotic','Orderly','Rebellious','Diplomatic','Visionary','Pragmatic','Adventurous','Stoic'][_uh % 10])
        text = text.replace('$(aura)',          ['Golden','Crimson','Azure','Emerald','Violet','Silver','Shadow','Radiant','Cosmic','Ethereal'][_uh % 10])
        text = text.replace('$(vibe)',          ['Chill','Hype','Mysterious','Friendly','Competitive','Laid-back','Intense','Wholesome','Chaotic','Pure'][_uh % 10])
        text = text.replace('$(mood)',          ['Ready to grind','Vibing','Sweating','Chillin\'','In the zone','On tilt','Clutching up','Hyped up'][_uh % 8])
        text = text.replace('$(alignment)',     ['Lawful Good','Neutral Good','Chaotic Good','Lawful Neutral','True Neutral','Chaotic Neutral','Lawful Evil','Neutral Evil','Chaotic Evil'][_uh % 9])
        text = text.replace('$(classfor)',      _RCL[_uh % len(_RCL)])
        text = text.replace('$(elementfor)',    ['Fire','Water','Earth','Air','Lightning','Ice','Shadow','Light','Nature','Void'][_uh % 10])
        text = text.replace('$(spiritanimal)', ['Wolf','Eagle','Dolphin','Tiger','Owl','Fox','Bear','Dragon','Phoenix','Lion','Raven','Deer','Shark','Hawk','Panther'][_uh % 15])
        text = text.replace('$(powerlevel)',    str((_uh * 137 + 1337) % 9001 + 1000))
        text = text.replace('$(hogwarts)',      _RHog[_uh % 4])
        text = text.replace('$(numerology)',    str(_uh % 9 + 1))
        text = text.replace('$(luckynumber)',   str(_uh % 99 + 1))
        text = text.replace('$(luckycolor)',    _RCOL[_uh % len(_RCOL)])
        text = text.replace('$(lifequest)',     _RQU[_uh % len(_RQU)])
    def _zodiac_v(m):
        try:
            parts = m.group(1).split('/')
            mo, d = int(parts[0]), int(parts[1])
            signs = ['Capricorn','Aquarius','Pisces','Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius']
            dates = [(1,19),(2,18),(3,20),(4,19),(5,20),(6,20),(7,22),(8,22),(9,22),(10,22),(11,21),(12,21)]
            for i, (mm, dd) in enumerate(dates):
                if mo == mm and d <= dd: return signs[i]
                if mo < mm: return signs[i]
            return 'Capricorn'
        except: return '?'
    text = re.sub(r'\$\(zodiac ([^)]+)\)', _zodiac_v, text)
    def _hogwarts_v(m):
        u = m.group(1).lstrip('@').lower()
        return _RHog[sum(ord(c) for c in u) % 4]
    text = re.sub(r'\$\(hogwartsfor ([^)]+)\)', _hogwarts_v, text)
    def _spiritfor_v(m):
        u = m.group(1).lstrip('@').lower()
        return ['Wolf','Eagle','Dolphin','Tiger','Owl','Fox','Bear','Dragon','Phoenix','Lion','Raven','Deer','Shark','Hawk','Panther'][sum(ord(c) for c in u) % 15]
    text = re.sub(r'\$\(spiritanimalfor ([^)]+)\)', _spiritfor_v, text)
    def _powerfor_v(m):
        u = m.group(1).lstrip('@').lower()
        return str((sum(ord(c) for c in u) * 137 + 1337) % 9001 + 1000)
    text = re.sub(r'\$\(powerlevelfor ([^)]+)\)', _powerfor_v, text)
    def _classfor_v(m):
        u = m.group(1).lstrip('@').lower()
        return _RCL[sum(ord(c) for c in u) % len(_RCL)]
    text = re.sub(r'\$\(classfor ([^)]+)\)', _classfor_v, text)
    def _elemfor_v(m):
        u = m.group(1).lstrip('@').lower()
        return ['Fire','Water','Earth','Air','Lightning','Ice','Shadow','Light','Nature','Void'][sum(ord(c) for c in u) % 10]
    text = re.sub(r'\$\(elementfor ([^)]+)\)', _elemfor_v, text)
    def _alignfor_v(m):
        u = m.group(1).lstrip('@').lower()
        return ['Lawful Good','Neutral Good','Chaotic Good','Lawful Neutral','True Neutral','Chaotic Neutral','Lawful Evil','Neutral Evil','Chaotic Evil'][sum(ord(c) for c in u) % 9]
    text = re.sub(r'\$\(alignmentfor ([^)]+)\)', _alignfor_v, text)

    # ── Game / event state ────────────────────────────────────────────────────
    _sr_ext = ctx.get('_state_ref')
    if _sr_ext:
        _poll_s   = getattr(_sr_ext, 'poll', None) or {}
        _gw_s     = getattr(_sr_ext, 'giveaway', None) or {}
        _au_s     = getattr(_sr_ext, 'auction', None) or {}
        _hm_s     = getattr(_sr_ext, 'hangman', None) or {}
        _tr_s     = getattr(_sr_ext, 'trivia', None) or {}
        _heist_s  = getattr(_sr_ext, 'heist', None) or {}
        _race_s   = getattr(_sr_ext, 'chat_race', None) or {}
        _wc_s     = getattr(_sr_ext, 'wordchain', None) or {}
        _ty_s     = getattr(_sr_ext, 'typerace', None) or {}
        _ng_s     = getattr(_sr_ext, 'numguess', None) or {}
        _bb_s     = getattr(_sr_ext, 'boss_battle', None) or {}
        _cg_s     = getattr(_sr_ext, 'community_goal', None) or {}
        _lot_s    = getattr(_sr_ext, 'lottery', None) or {}
        _cr_s     = getattr(_sr_ext, 'coinrain', None) or {}
        _ss_s     = getattr(_sr_ext, 'stream_stats', None) or {}
        _pv_votes = _poll_s.get('votes', {})
        _pv_opts  = _poll_s.get('options', [])
        _pv_lead  = max(_pv_votes, key=_pv_votes.get) if _pv_votes else ''
        _pv_label = _pv_opts[int(_pv_lead) - 1] if _pv_lead and _pv_opts and 0 < int(_pv_lead) <= len(_pv_opts) else _pv_lead
        text = text.replace('$(pollactive)',       '1' if _poll_s.get('active') else '0')
        text = text.replace('$(pollquestion)',     _poll_s.get('question', 'none'))
        text = text.replace('$(pollvotes)',        str(sum(_pv_votes.values())))
        text = text.replace('$(pollleader)',       _pv_label)
        text = text.replace('$(giveawayactive)',   '1' if _gw_s.get('active') else '0')
        text = text.replace('$(giveawayprize)',    _gw_s.get('prize', 'none'))
        text = text.replace('$(giveawayentries)',  str(len(_gw_s.get('entries', []))))
        text = text.replace('$(auctionactive)',    '1' if _au_s.get('active') else '0')
        text = text.replace('$(auctionitem)',      _au_s.get('item', 'none'))
        text = text.replace('$(auctionhighbid)',   str(_au_s.get('high_bid', 0)))
        text = text.replace('$(auctionhighbidder)',_au_s.get('high_display', 'none'))
        text = text.replace('$(hangmanactive)',    '1' if _hm_s.get('active') else '0')
        text = text.replace('$(hangmanword)',      _hm_s.get('display', '?').strip())
        text = text.replace('$(hangmanlives)',     str(_hm_s.get('lives_left', 0)))
        text = text.replace('$(triviaactive)',     '1' if _tr_s.get('active') else '0')
        text = text.replace('$(triviaquestion)',   _tr_s.get('question', 'none'))
        text = text.replace('$(triviareward)',     str(_tr_s.get('reward', 0)))
        text = text.replace('$(heistactive)',      '1' if _heist_s.get('phase') == 'joining' else '0')
        text = text.replace('$(heistcount)',       str(len(_heist_s.get('entries', []))))
        text = text.replace('$(raceactive)',       '1' if _race_s.get('active') else '0')
        text = text.replace('$(racetarget)',       _race_s.get('target', '?'))
        text = text.replace('$(wordchainactive)',  '1' if _wc_s.get('active') else '0')
        text = text.replace('$(wordchainlast)',    _wc_s.get('last_word', '?'))
        text = text.replace('$(typeraceactive)',   '1' if _ty_s.get('active') else '0')
        text = text.replace('$(typeracetext)',     _ty_s.get('text', '?'))
        text = text.replace('$(numguessactive)',   '1' if _ng_s.get('active') else '0')
        text = text.replace('$(numguessrange)',    f'{_ng_s.get("min",1)}-{_ng_s.get("max",100)}')
        text = text.replace('$(bossactive)',       '1' if _bb_s.get('active') else '0')
        text = text.replace('$(bossname)',         _bb_s.get('boss_name', 'none'))
        text = text.replace('$(bosshp)',           str(_bb_s.get('boss_hp', 0)))
        text = text.replace('$(bossmaxhp)',        str(_bb_s.get('boss_max_hp', 1000)))
        text = text.replace('$(bossfighters)',     str(len(_bb_s.get('participants', {}))))
        _cg_pct = round(_cg_s.get('current', 0) / _cg_s.get('target', 1) * 100, 1) if _cg_s.get('target') else 0
        text = text.replace('$(goaltarget)',       str(_cg_s.get('target', 0)))
        text = text.replace('$(goalcurrent)',      str(_cg_s.get('current', 0)))
        text = text.replace('$(goalpct)',          str(_cg_pct))
        text = text.replace('$(goalreward)',       _cg_s.get('reward', 'none'))
        text = text.replace('$(lotterypot)',       str(_lot_s.get('pot', 0)))
        text = text.replace('$(lotteryentries)',   str(len(_lot_s.get('tickets', {}))))
        text = text.replace('$(lotteryactive)',    '1' if _lot_s and _lot_s.get('active') else '0')
        text = text.replace('$(coinrainactive)',   '1' if _cr_s and _cr_s.get('active') else '0')
        text = text.replace('$(coinrainamount)',   str(_cr_s.get('amount', 0)))
        text = text.replace('$(streamraidcount)',  str(len(_ss_s.get('raids_received', []))))
        text = text.replace('$(streamsubcount)',   str(len(_ss_s.get('subs_received', []))))
        text = text.replace('$(streambitcount)',   str(_ss_s.get('bits_received', 0)))
        text = text.replace('$(streammsgtotal)',   str(_ss_s.get('chat_messages_total', 0)))
        text = text.replace('$(challengeactive)',  '1' if (getattr(_sr_ext, 'challenge', None) or {}).get('active') else '0')

    # ── Bot / system / channel ────────────────────────────────────────────────
    text = text.replace('$(botname)',    os.environ.get('CUBASSIST_BOT_NICK', 'CubAssist'))
    text = text.replace('$(channelurl)', f'twitch.tv/{_chan}' if _chan else 'twitch.tv/?')
    text = text.replace('$(botversion)', '2.0')
    text = text.replace('$(prefix)',     '!')
    text = text.replace('$(cmdname)',    ctx.get('cmd_name', '?'))
    text = text.replace('$(channelname)', _chan or '?')

    # ── Socials from config ───────────────────────────────────────────────────
    _cfg_ext   = ctx.get('config') or {}
    _soc_ext   = _cfg_ext.get('socials', {}) if isinstance(_cfg_ext, dict) else {}
    text = text.replace('$(discordurl)',   _soc_ext.get('discord', ''))
    text = text.replace('$(youtubeurl)',   _soc_ext.get('youtube', ''))
    text = text.replace('$(twitterurl)',   _soc_ext.get('twitter', ''))
    text = text.replace('$(instagramurl)', _soc_ext.get('instagram', ''))
    text = text.replace('$(tiktokurl)',    _soc_ext.get('tiktok', ''))
    text = text.replace('$(donateurl)',    _cfg_ext.get('donate_url', '') if isinstance(_cfg_ext, dict) else '')

    # ── Custom vars ($(cv:name) and $(customvar name)) ────────────────────────
    _cvars = _cfg_ext.get('custom_vars', {}) if isinstance(_cfg_ext, dict) else {}
    if _cvars:
        for _cv_k, _cv_v in _cvars.items():
            text = text.replace(f'$(cv:{_cv_k})', str(_cv_v))
            text = text.replace(f'$(customvar {_cv_k})', str(_cv_v))
    text = re.sub(r'\$\(cv:([a-zA-Z0-9_]+)\)',        lambda m: str(_cvars.get(m.group(1), '')), text)
    text = re.sub(r'\$\(customvar ([a-zA-Z0-9_]+)\)', lambda m: str(_cvars.get(m.group(1), '')), text)

    # ── Persistent counter access ─────────────────────────────────────────────
    if _chan and '$(counter:' in text:
        _cnt_ext = _load_counters(_chan)
        _ccustom = _cnt_ext.get('custom', {})
        text = re.sub(r'\$\(counter:([a-zA-Z0-9_]+)\)', lambda m: str(_ccustom.get(m.group(1), 0)), text)

    return text


def _countdown_str(date_str: str) -> str:
    """Return human-readable countdown to a date (YYYY-MM-DD)."""
    try:
        target = datetime.datetime.strptime(date_str.strip(), '%Y-%m-%d')
        delta = target - datetime.datetime.now()
        if delta.total_seconds() < 0:
            return 'already passed'
        days = delta.days
        if days >= 365:
            return f'{days // 365}y {(days % 365) // 30}mo'
        if days >= 30:
            return f'{days // 30}mo {days % 30}d'
        if days >= 1:
            return f'{days}d {delta.seconds // 3600}h'
        hrs = delta.seconds // 3600
        mins = (delta.seconds % 3600) // 60
        return f'{hrs}h {mins}m'
    except Exception:
        return '?'

# ── Per-channel runtime state ───────────────────────────────────────────────────

class ChannelState:
    def __init__(self, channel: str):
        self.channel         = channel
        self.join_ts         = None
        self.cd              = {}   # cmd -> last_ts
        self.user_cd         = {}   # cmd -> {user_id: ts}
        self.permits         = {}   # nick -> expiry
        self.timer_last      = {}   # timer_id -> ts
        self.line_count      = 0
        self.chat_log        = []
        self.stream_info     = None
        self.stream_info_ts  = 0
        # ── Live features ──────────────────────────────────────────────
        self.giveaway   = {
            'active': False, 'entries_open': False, 'prize': '',
            'entries': [], 'winner': None, 'started_ts': 0,
        }
        self.poll       = {
            'active': False, 'question': '', 'options': [],
            'votes': {}, 'voted': set(), 'started_ts': 0,
        }
        self.queue      = []
        self.queue_open = False
        self.duel        = None   # {challenger, target, amount, expiry}
        self.heist       = None   # {entries, expiry, phase}
        self.trivia      = None   # {question, answer, reward, expiry, answered}
        self.song_queue  = []     # [{user, user_id, content, ts}]
        self.songs_open  = True
        self.hangman = None  # {word, display, guesses, lives_left, active}
        self.anagram = None  # {word, scrambled, active, expiry}
        self.raid_shield = False
        self.lurkers = {}          # nick -> {'display': str, 'ts': int}
        self.boss_battle = None    # boss battle game state
        self.boss_cd = 0.0         # boss battle cooldown timestamp
        self.numguess = None       # number guessing game state
        self.chat_race = None      # chat race game state
        self.community_goal = None # community goal state
        self.bingo = None          # bingo game state
        self.challenge = None      # RPS challenge state
        self.timed_bans = {}       # nick -> {'expiry': float}
        self.last_game = ''        # last known game/category
        self.last_follower_count = 0
        self.stream_was_live = False
        self.stream_stats = {}     # current stream session stats (in-memory accumulator)
        # ── New feature states ────────────────────────────────────────────────
        self.blackjack          = {}     # nick -> {hand, dealer, deck, bet}
        self.highlow            = None   # {current, active}
        self.wordchain          = None   # {last_word, last_nick, active}
        self.typerace           = None   # {text, active, expiry}
        self.lottery            = None   # {tickets:{nick:count}, prize, active}
        self.auction            = None   # {item, high_bid, high_bidder, active, expiry}
        self.coinrain           = None   # {amount, active, expiry}
        self.bounties           = {}     # target_nick -> amount
        self.first_chatter_done = False
        self.hype_count         = 0
        self.hype_last_announce = 0.0
        self.emote_counts       = {}     # emote -> count
        self.tts_queue          = []     # [{user, text, ts}]
        self.hype_train_active  = False
        self.hype_train_level   = 0
        self.hype_train_expiry  = 0.0
        self.category_history   = []     # [{game, started_ts}]
        self.subgoal            = None   # {target, current, message}
        self.bitsgoal           = None   # {target, current, message}
        self.raid_queue         = []     # [channel_name, ...]
        self.chat_alert_counts  = {}     # keyword -> [ts, ts, ...]
        self.wheel_spinning     = False

# ── CubAssist multi-channel IRC bot ────────────────────────────────────────────

PROTECTED = {
    'commands', 'uptime', 'game', 'title', 'shoutout', 'permit',
    'addcom', 'editcom', 'delcom', 'so',
    'setvar', 'delvar', 'addquote', 'delquote', 'quote',
    'giveaway', 'enter',
    'poll', 'vote',
    'points', 'addpoints', 'removepoints', 'leaderboard',
    'queue',
    'gamble', 'slots', 'duel', 'accept', 'decline', 'heist', 'trivia', '8ball', 'coinflip',
    'sr', 'song', 'nextsong', 'skipsong', 'clearsongs',
    'rank', 'watchtime', 'top',
    'warn', 'warnings', 'clearwarnings', 'note', 'notes',
    'watchlist', 'addwatch', 'delwatch',
    'weather', 'clip',
    'deaths', 'adddeaths', 'setdeaths', 'resetdeaths', 'wins', 'addwins', 'losses', 'addlosses',
    'wl', 'score', 'setscore', 'counter', 'fish', 'hangman', 'guess', 'anagram',
    'daily', 'rob', 'gift', 'shop', 'redeem', 'lore',
    'trust', 'untrust', 'trusted',
    'chatmode', 'marker', 'overlay',
    'followage', 'accountage', 'lurk', 'unlurk', 'lurkers',
    'mystats', 'timestamp', 'vip', 'unvip',
    'bitleaderboard', 'sublists', 'recap',
    'boss', 'fight', 'numguess', 'race',
    'goal', 'contribute', 'bingo', 'claim',
    'alias', 'hug', 'slap', 'love', 'roulette', 'challenge',
    # ── New commands ──────────────────────────────────────────────────────────
    'blackjack', 'hit', 'stand', 'double', 'coinrain',
    'dice', 'highlow', 'hl',
    'wordchain',
    'typerace',
    'wheel',
    'lottery', 'lottodraw',
    'auction', 'bid',
    'grab',
    'bounty',
    'watchstreak',
    'suggest', 'suggestions', 'approve', 'deny',
    'spotlight',
    'birthday', 'birthdays',
    'hype',
    'schedule',
    'socials',
    'streamnote', 'streamnotes',
    'raidqueue',
    'subgoal',
    'bitsgoal',
    'cliplast',
    'cmdstats',
    'banreason',
    'bank', 'deposit', 'withdraw',
    'prestige',
    'team',
    'lastseen',
    'tts',
    'alert',
    'emotecount',
    'chatalert',
    'raidshield',
    'autoban',
    'shadowwarn',
    'chatexport',
    'temprole',
    'multiwin',
}

# ── Commands disabled by default (user must enable per-channel) ────────────────
_DEFAULT_DISABLED: frozenset = frozenset({
    # Games
    'blackjack', 'hit', 'stand', 'double', 'dice', 'highlow', 'hl',
    'wordchain', 'typerace', 'wheel',
    # Economy
    'lottery', 'lottodraw', 'auction', 'bid', 'coinrain', 'grab',
    'bounty', 'bank', 'deposit', 'withdraw', 'prestige',
    # Community
    'watchstreak', 'suggest', 'suggestions', 'approve', 'deny',
    'spotlight', 'birthday', 'birthdays', 'hype', 'team',
    # Stream Tools
    'schedule', 'socials', 'streamnote', 'streamnotes',
    'raidqueue', 'subgoal', 'bitsgoal', 'cliplast',
    # Mod Tools
    'cmdstats', 'banreason', 'lastseen', 'tts', 'alert',
    'emotecount', 'chatalert', 'raidshield', 'autoban',
    'shadowwarn', 'chatexport', 'temprole', 'multiwin',
    # Existing opt-in features
    'duel', 'heist', 'trivia', 'anagram', 'numguess',
    'boss', 'joinboss', 'hangman', 'guess', 'chatr', 'race', 'rps',
    'challenge', 'accept', 'reject',
    'rob', 'give', 'leaderboard', 'points', 'rank',
    'giveaway', 'enter', 'pick', 'poll', 'vote', 'endpoll',
    'queue', 'openqueue', 'closequeue', 'removequeue', 'clearqueue',
    'songrequest', 'sr', 'skipsong', 'currentsong', 'songsopen', 'songsclose',
    'shop', 'buy', 'myrewards',
    'watchtime', 'wt',
    'lore', 'addlore', 'dellore',
    'vip', 'unvip',
})

class CubBot:
    def __init__(self):
        self._sock          = None
        self._running       = False
        self._connected     = False
        self._connect_ts    = None
        self._thread        = None
        self._timer_thread  = None
        self._lock          = threading.Lock()
        self._channels: dict[str, ChannelState] = {}
        # ── Helix Chat Bot badge support ──────────────────────────────────
        self._app_token        = ''       # cached App Access Token
        self._app_token_expiry = 0.0      # unix timestamp
        self._bot_user_id      = ''       # cached bot Twitch user ID
        self._chan_user_ids: dict[str, str] = {}  # channel_login → broadcaster_id

    # ── Lifecycle ─────────────────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._run_loop, daemon=True, name='cubassist-irc')
        self._thread.start()
        self._timer_thread = threading.Thread(
            target=self._timer_loop, daemon=True, name='cubassist-timers')
        self._timer_thread.start()
        logger.info('CubAssist starting...')

    def stop(self):
        self._running    = False
        self._connected  = False
        self._connect_ts = None
        if self._sock:
            try: self._sock.close()
            except Exception: pass
            self._sock = None
        logger.info('CubAssist stopped')

    def reload_config(self):
        pass  # configs loaded fresh from disk per message

    @property
    def status(self):
        return {
            'running':        self._running,
            'connected':      self._connected,
            'channels':       list(self._channels.keys()),
            'bot_nick':       os.environ.get('CUBASSIST_BOT_NICK', ''),
            'uptime_seconds': int(time.time() - self._connect_ts)
                              if self._connect_ts and self._connected else 0,
        }

    def channel_status(self, channel: str) -> dict:
        channel = channel.lower().strip('#')
        state   = self._channels.get(channel)
        return {
            'running':        self._running,
            'connected':      self._connected and channel in self._channels,
            'channel':        channel,
            'bot_nick':       os.environ.get('CUBASSIST_BOT_NICK', ''),
            'uptime_seconds': int(time.time() - state.join_ts)
                              if state and state.join_ts else 0,
        }

    # ── Channel management ────────────────────────────────────────────────

    def join_channel(self, channel: str):
        channel = channel.lower().strip('#')
        if channel not in self._channels:
            self._channels[channel] = ChannelState(channel)
        if self._connected:
            self._raw(f'JOIN #{channel}')
            self._channels[channel].join_ts = time.time()
            logger.info(f'CubAssist joined #{channel}')

    def part_channel(self, channel: str):
        channel = channel.lower().strip('#')
        if self._connected:
            self._raw(f'PART #{channel}')
        self._channels.pop(channel, None)
        logger.info(f'CubAssist parted #{channel}')

    # ── IRC connection loop ───────────────────────────────────────────────

    def _run_loop(self):
        while self._running:
            try:
                self._connect()
                self._listen()
            except Exception as e:
                logger.warning(f'CubAssist disconnected: {e}')
            self._connected  = False
            self._connect_ts = None
            for state in self._channels.values():
                state.join_ts = None
            if self._running:
                logger.info('CubAssist reconnecting in 10s...')
                time.sleep(10)

    def _connect(self):
        # Refresh the OAuth token before each connection attempt.
        # If the previous token expired (which is what causes IRC drops),
        # this swaps in a fresh one automatically using the stored refresh_token.
        refresh_bot_token()

        creds    = get_bot_credentials()
        token    = creds.get('oauth_token', '').strip()
        nick     = creds.get('bot_nick', '').strip().lower()
        channels = get_channels()

        if not token or not nick:
            raise Exception('Bot credentials missing — set CUBASSIST_BOT_TOKEN and CUBASSIST_BOT_NICK')
        if not channels:
            raise Exception('No channels registered yet')

        if not token.startswith('oauth:'):
            token = 'oauth:' + token

        raw = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        ctx = ssl.create_default_context()
        sock = ctx.wrap_socket(raw, server_hostname='irc.chat.twitch.tv')
        sock.settimeout(300)
        sock.connect(('irc.chat.twitch.tv', 6697))

        def _send(msg):
            sock.send((msg + '\r\n').encode('utf-8'))

        _send(f'PASS {token}')
        _send(f'NICK {nick}')
        _send('CAP REQ :twitch.tv/tags twitch.tv/commands twitch.tv/membership')

        for ch in channels:
            ch = ch.lower().strip('#')
            if ch not in self._channels:
                self._channels[ch] = ChannelState(ch)
            _send(f'JOIN #{ch}')
            self._channels[ch].join_ts = time.time()

        self._sock       = sock
        self._connected  = True
        self._connect_ts = time.time()
        logger.info(f'CubAssist connected as {nick}, channels: {", ".join("#"+c for c in channels)}')

    def _listen(self):
        buf = ''
        while self._running:
            try:
                data = self._sock.recv(4096).decode('utf-8', errors='ignore')
            except socket.timeout:
                self._raw('PING :tmi.twitch.tv')
                continue
            if not data:
                break
            buf += data
            while '\r\n' in buf:
                line, buf = buf.split('\r\n', 1)
                if line:
                    try: self._handle_line(line)
                    except Exception as e: logger.debug(f'Handle error: {e}')

    def _raw(self, msg):
        with self._lock:
            if self._sock:
                try: self._sock.send((msg + '\r\n').encode('utf-8'))
                except Exception: pass

    # ── App Access Token (client credentials) ─────────────────────────────

    def _get_app_token(self) -> str:
        """Return a cached App Access Token, fetching a fresh one if needed."""
        if self._app_token and time.time() < self._app_token_expiry - 300:
            return self._app_token
        client_id     = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
        client_secret = os.environ.get('TWITCH_CLIENT_SECRET', '')
        if not client_secret:
            return ''
        try:
            payload = urllib.parse.urlencode({
                'client_id':     client_id,
                'client_secret': client_secret,
                'grant_type':    'client_credentials',
            }).encode()
            req = urllib.request.Request(
                'https://id.twitch.tv/oauth2/token',
                data=payload, method='POST',
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read())
            self._app_token        = data['access_token']
            self._app_token_expiry = time.time() + data.get('expires_in', 3600)
            logger.info('CubAssist: App Access Token refreshed')
            return self._app_token
        except Exception as e:
            logger.warning(f'App token fetch failed: {e}')
            return ''

    def _get_twitch_user_id(self, login: str) -> str:
        """Resolve a Twitch login name to a user ID using the app token."""
        token     = self._get_app_token()
        client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
        if not token:
            return ''
        try:
            req = urllib.request.Request(
                f'https://api.twitch.tv/helix/users?login={urllib.parse.quote(login)}',
                headers={'Client-Id': client_id, 'Authorization': f'Bearer {token}'},
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                data = json.loads(r.read())
            return data['data'][0]['id'] if data.get('data') else ''
        except Exception as e:
            logger.debug(f'user_id lookup failed for {login}: {e}')
            return ''

    def _get_broadcaster_id(self, channel: str) -> str:
        """Return the broadcaster user ID for a channel (cached)."""
        channel = channel.lower().strip('#')
        if channel not in self._chan_user_ids:
            uid = self._get_twitch_user_id(channel)
            if uid:
                self._chan_user_ids[channel] = uid
        return self._chan_user_ids.get(channel, '')

    def _get_bot_user_id(self) -> str:
        """Return the bot account's Twitch user ID (cached)."""
        if self._bot_user_id:
            return self._bot_user_id
        creds = get_bot_credentials()
        nick  = creds.get('bot_nick', '').strip().lower()
        if not nick:
            return ''
        uid = self._get_twitch_user_id(nick)
        if uid:
            self._bot_user_id = uid
        return uid

    def _refresh_bot_token(self) -> str:
        """Refresh the bot's user access token using the stored refresh token.
        Saves the new token to bot_credentials.json. Returns new token or ''."""
        creds_path = _data_dir() / 'bot_credentials.json'
        try:
            creds = json.loads(creds_path.read_text()) if creds_path.exists() else {}
        except Exception:
            return ''
        refresh_token = creds.get('refresh_token', '')
        if not refresh_token:
            return ''
        client_id     = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
        client_secret = os.environ.get('TWITCH_CLIENT_SECRET', '')
        if not client_secret:
            return ''
        try:
            payload = urllib.parse.urlencode({
                'grant_type':    'refresh_token',
                'refresh_token': refresh_token,
                'client_id':     client_id,
                'client_secret': client_secret,
            }).encode()
            req = urllib.request.Request(
                'https://id.twitch.tv/oauth2/token',
                data=payload, method='POST',
            )
            with urllib.request.urlopen(req, timeout=10) as r:
                data = json.loads(r.read())
            new_token = data.get('access_token', '')
            if new_token:
                creds['oauth_token']   = new_token
                creds['refresh_token'] = data.get('refresh_token', refresh_token)
                creds_path.write_text(json.dumps(creds, indent=2))
                logger.info('CubAssist: bot token refreshed')
            return new_token
        except Exception as e:
            logger.warning(f'Bot token refresh failed: {e}')
            return ''

    def _helix_send_with_token(self, token: str, broadcaster_id: str,
                                bot_user_id: str, message: str):
        """POST to /helix/chat/messages. Returns True on success, None on 401, False on other error."""
        client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
        try:
            payload = json.dumps({
                'broadcaster_id': broadcaster_id,
                'sender_id':      bot_user_id,
                'message':        message,
            }).encode()
            req = urllib.request.Request(
                'https://api.twitch.tv/helix/chat/messages',
                data=payload, method='POST',
                headers={
                    'Client-Id':     client_id,
                    'Authorization': f'Bearer {token}',
                    'Content-Type':  'application/json',
                },
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                resp = json.loads(r.read())
            drop = (resp.get('data') or [{}])[0].get('drop_reason')
            if drop:
                logger.warning(f'Helix message dropped: {drop}')
                return False
            return True
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return None   # signal: token expired, caller should refresh
            logger.warning(f'Helix send HTTP error: {e.code} {e.reason}')
            return False
        except Exception as e:
            logger.warning(f'Helix send error: {e}')
            return False

    # ── Sending ───────────────────────────────────────────────────────────

    def send(self, message, channel):
        """Send a chat message. Uses Helix API (Chat Bot badge) with IRC fallback."""
        if not message or not channel:
            return
        channel = channel.lower().strip('#')
        if not self._try_helix_send(message, channel):
            self._raw(f'PRIVMSG #{channel} :{message}')

    def _try_helix_send(self, message: str, channel: str) -> bool:
        """POST to /helix/chat/messages using bot user token (gives Chat Bot badge).
        Auto-refreshes token on 401. Falls back to IRC on failure."""
        try:
            # Use the bot's user access token (user:write:chat scope)
            creds = get_bot_credentials()
            token = creds.get('oauth_token', '').replace('oauth:', '').strip()
            if not token:
                return False
            broadcaster_id = self._get_broadcaster_id(channel)
            bot_user_id    = self._get_bot_user_id()
            if not broadcaster_id or not bot_user_id:
                return False
            result = self._helix_send_with_token(token, broadcaster_id, bot_user_id, message)
            if result is None:
                # 401 — token expired, try to refresh
                new_token = self._refresh_bot_token()
                if new_token:
                    result = self._helix_send_with_token(new_token, broadcaster_id, bot_user_id, message)
            return bool(result)
        except Exception as e:
            logger.warning(f'Helix send failed in #{channel}: {e}')
            return False

    def timeout(self, user, channel, seconds=600, reason=''):
        self._raw(f'PRIVMSG #{channel} :/timeout {user} {seconds} {reason}')

    def ban(self, user, channel, reason=''):
        self._raw(f'PRIVMSG #{channel} :/ban {user} {reason}')

    def delete_msg(self, msg_id, channel):
        self._raw(f'PRIVMSG #{channel} :/delete {msg_id}')

    # ── Message handling ──────────────────────────────────────────────────

    def _handle_line(self, line):
        tags, prefix, command, params = _parse_irc(line)

        if command == 'PING':
            self._raw('PONG :tmi.twitch.tv')
            return

        if command == 'NOTICE':
            text = params[-1] if params else ''
            if 'Login authentication failed' in text or 'Improperly formatted auth' in text:
                logger.error('CubAssist: Twitch auth failed — check token')
                self._running = False
            return

        if command == 'USERNOTICE':
            msg_id = tags.get('msg-id', '')
            if msg_id == 'raid':
                channel = params[0].lstrip('#').lower() if params else ''
                raider  = tags.get('msg-param-login', tags.get('display-name', ''))
                viewers = tags.get('msg-param-viewerCount', '0')
                state   = self._channels.get(channel)
                cfg     = load_channel_config(channel) if channel else {}
                raid_cfg = cfg.get('raid_response', {})
                if state and raid_cfg.get('enabled') and raid_cfg.get('message'):
                    msg = raid_cfg['message'].replace('$(raider)', raider).replace('$(viewers)', viewers)
                    self.send(msg, channel)
                self._notify_event(channel, 'raid', {'raider': raider, 'viewers': viewers}, cfg)

            elif msg_id in ('sub', 'resub'):
                channel = params[0].lstrip('#').lower() if params else ''
                display = tags.get('display-name', tags.get('login', 'someone'))
                months  = tags.get('msg-param-cumulative-months', '1')
                if msg_id == 'resub':
                    self.send(f'🎉 Thanks @{display} for resubbing! ({months} months) PogChamp', channel)
                else:
                    self.send(f'🎉 Welcome to the sub club @{display}! Thanks for subscribing! PogChamp', channel)
                cfg = load_channel_config(channel) if channel else {}
                self._notify_event(channel, 'sub', {'user': display, 'months': months}, cfg)
                # Track sub for leaderboard
                try:
                    _sub_nick = tags.get('login', display.lower())
                    subs_data = _load_subs_log(channel)
                    sub_entry = subs_data.get(_sub_nick, {'months': 0, 'since_ts': int(time.time())})
                    sub_entry['months'] = sub_entry.get('months', 0) + 1
                    sub_entry['display'] = display
                    subs_data[_sub_nick] = sub_entry
                    _save_subs_log(channel, subs_data)
                    # Track in stream stats
                    _sub_state = self._channels.get(channel)
                    if _sub_state:
                        if not _sub_state.stream_stats:
                            _sub_state.stream_stats = {'peak_viewers': 0, 'subs_received': [], 'raids_received': [], 'points_distributed': 0, 'message_counts': {}, 'chat_messages_total': 0}
                        _sub_state.stream_stats['subs_received'].append({'nick': _sub_nick, 'ts': int(time.time())})
                except Exception:
                    pass

            elif msg_id == 'subgift':
                channel  = params[0].lstrip('#').lower() if params else ''
                gifter   = tags.get('display-name', 'Someone')
                recipient = tags.get('msg-param-recipient-display-name', 'someone')
                self.send(f'🎁 @{gifter} just gifted a sub to @{recipient}! PogChamp', channel)
                cfg = load_channel_config(channel) if channel else {}
                self._notify_event(channel, 'subgift', {'gifter': gifter, 'recipient': recipient}, cfg)

            elif msg_id == 'submysterygift':
                channel = params[0].lstrip('#').lower() if params else ''
                gifter  = tags.get('display-name', 'Someone')
                count   = tags.get('msg-param-mass-gift-count', '1')
                self.send(f'🎁 @{gifter} gifted {count} subs to the community! Massive W!', channel)
                cfg = load_channel_config(channel) if channel else {}
                self._notify_event(channel, 'massgift', {'gifter': gifter, 'count': count}, cfg)

            elif msg_id == 'ritual':
                channel = params[0].lstrip('#').lower() if params else ''
                display = tags.get('display-name', '')
                if tags.get('msg-param-ritual-name') == 'new_chatter':
                    cfg = load_channel_config(channel) if channel else {}
                    if cfg.get('welcome_new_chatters', False):
                        self.send(f'👋 Welcome to the chat @{display}! Make sure to say hi!', channel)

            return

        if command != 'PRIVMSG':
            return

        channel      = params[0].lstrip('#').lower() if params else ''
        text         = params[-1] if len(params) > 1 else ''
        nick         = _nick(prefix)
        display_name = tags.get('display-name', nick)
        user_id      = tags.get('user-id', nick)
        user_level   = _user_level(tags)
        msg_id       = tags.get('id', '')

        state = self._channels.get(channel)
        if not state:
            return

        cfg = load_channel_config(channel)

        state.chat_log.append({
            'ts':      int(time.time()),
            'nick':    display_name,
            'user_id': user_id,
            'text':    text,
            'level':   user_level,
            'color':   tags.get('color', ''),
        })
        if len(state.chat_log) > 200:
            state.chat_log = state.chat_log[-200:]
        state.line_count += 1

        # First chatter announcement
        if not state.first_chatter_done and cfg.get('first_chatter', {}).get('enabled'):
            state.first_chatter_done = True
            fc_msg = cfg.get('first_chatter', {}).get('message', '🎉 @$(user) is the first chatter of the stream!')
            self.send(fc_msg.replace('$(user)', display_name), channel)
            pts_cfg_fc = cfg.get('points_config', {})
            fc_reward = int(cfg.get('first_chatter', {}).get('reward', 0))
            if pts_cfg_fc.get('enabled') and fc_reward > 0:
                pts_fc = _load_points(channel)
                pts_fc[nick] = pts_fc.get(nick, 0) + fc_reward
                _save_points(channel, pts_fc)

        # Emote counting (track capitalised-looking tokens as potential emotes)
        for token in text.split():
            if len(token) >= 3 and token[0].isupper() and token.isalnum():
                state.emote_counts[token] = state.emote_counts.get(token, 0) + 1

        # Autoban pattern check
        try:
            patterns_ab = _load_autoban_patterns(channel)
            if patterns_ab:
                for pat in patterns_ab:
                    try:
                        if re.search(pat, text, re.I):
                            self.ban(nick, channel, f'Autoban: matched pattern "{pat}"')
                            break
                    except re.error:
                        pass
        except Exception:
            pass

        # Keyword chat alerts
        try:
            kw_alerts = cfg.get('chat_keyword_alerts', [])
            now_kw = time.time()
            for kw in kw_alerts:
                if kw and kw.lower() in text.lower():
                    times = state.chat_alert_counts.setdefault(kw, [])
                    times.append(now_kw)
                    # Keep only last 60 seconds
                    state.chat_alert_counts[kw] = [t for t in times if now_kw - t < 60]
                    if len(state.chat_alert_counts[kw]) >= int(cfg.get('chat_alert_threshold', 5)):
                        state.chat_alert_counts[kw] = []
                        self.send(f'🔔 Keyword alert: "{kw}" has been said {cfg.get("chat_alert_threshold",5)}+ times in the last minute!', channel)
        except Exception:
            pass

        # Watchstreak update on first message of stream session
        try:
            if state.stream_was_live:
                ws_data = _load_watchstreak(channel)
                ws_entry = ws_data.get(nick, {'streak': 0, 'last_day': ''})
                today_ws = datetime.datetime.now().strftime('%Y-%m-%d')
                if ws_entry.get('last_day', '') != today_ws:
                    # Check if consecutive (yesterday)
                    yesterday_ws = (datetime.datetime.now() - datetime.timedelta(days=1)).strftime('%Y-%m-%d')
                    if ws_entry.get('last_day', '') == yesterday_ws:
                        ws_entry['streak'] = ws_entry.get('streak', 0) + 1
                    else:
                        ws_entry['streak'] = 1
                    ws_entry['last_day'] = today_ws
                    ws_data[nick] = ws_entry
                    _save_watchstreak(channel, ws_data)
        except Exception:
            pass

        # Bounty check — if someone with a bounty sent this message, remind about it
        if nick in state.bounties:
            bounty_val = state.bounties[nick]
            if bounty_val > 0 and not state.timer_last.get(f'__bounty_remind_{nick}__', 0) > time.time() - 120:
                state.timer_last[f'__bounty_remind_{nick}__'] = time.time()
                pts_cfg_b = cfg.get('points_config', {})
                self.send(f'💀 {nick} has a bounty of {bounty_val:,} {pts_cfg_b.get("name","points")} on their head!', channel)

        # Chat race winner detection
        if state.chat_race and state.chat_race.get('active'):
            if text.strip().upper() == state.chat_race['target'].upper():
                state.chat_race['active'] = False
                pts_cfg_race = cfg.get('points_config', {})
                reward_race = cfg.get('chat_race_reward', 200)
                if pts_cfg_race.get('enabled'):
                    pts_race = _load_points(channel)
                    pts_race[nick] = pts_race.get(nick, 0) + reward_race
                    _save_points(channel, pts_race)
                self.send(f'🏁 {display_name} wins the race! +{reward_race} {pts_cfg_race.get("name","points")}! 🏆', channel)
                state.chat_race = None

        # Track for stream recap
        if not state.stream_stats:
            state.stream_stats = {'peak_viewers': 0, 'subs_received': [], 'raids_received': [], 'points_distributed': 0, 'message_counts': {}, 'chat_messages_total': 0}
        state.stream_stats['message_counts'][nick] = state.stream_stats['message_counts'].get(nick, 0) + 1
        state.stream_stats['chat_messages_total'] = state.stream_stats.get('chat_messages_total', 0) + 1

        # Trivia answer check
        if state.trivia and state.trivia.get('active') and not state.trivia.get('answered'):
            if text.strip().lower() == state.trivia['answer'].lower():
                state.trivia['answered'] = True
                reward = state.trivia['reward']
                pts = _load_points(channel)
                pts[nick] = pts.get(nick, 0) + reward
                _save_points(channel, pts)
                self.send(f'✅ {display_name} got it! The answer was "{state.trivia["answer"]}". +{reward} points!', channel)
                state.trivia['active'] = False

        # Per-message points
        pts_cfg = cfg.get('points_config', {})
        if pts_cfg.get('enabled') and int(pts_cfg.get('per_message', 0)) > 0:
            pts = _load_points(channel)
            pts[nick] = pts.get(nick, 0) + int(pts_cfg['per_message'])
            _save_points(channel, pts)

        # Bits/cheer detection — push to overlays
        bits_str = tags.get('bits', '')
        if bits_str:
            try:
                bits_amount = int(bits_str)
                self._notify_event(channel, 'cheer', {'user': display_name, 'bits': bits_amount}, cfg)
                pts_cfg2 = cfg.get('points_config', {})
                if pts_cfg2.get('enabled') and bits_amount > 0:
                    bonus = max(1, bits_amount // 10)
                    pts2 = _load_points(channel)
                    pts2[nick] = pts2.get(nick, 0) + bonus
                    _save_points(channel, pts2)
                # Track bits for leaderboard
                try:
                    bits_data = _load_bits_log(channel)
                    bits_data[nick] = bits_data.get(nick, 0) + bits_amount
                    _save_bits_log(channel, bits_data)
                    # Also track in stream stats
                    if not state.stream_stats:
                        state.stream_stats = {'peak_viewers': 0, 'subs_received': [], 'raids_received': [], 'points_distributed': 0, 'message_counts': {}, 'chat_messages_total': 0}
                except Exception:
                    pass
                # Bits goal tracking
                try:
                    if state.bitsgoal:
                        bg_data = state.bitsgoal
                        bg_data['current'] = bg_data.get('current', 0) + bits_amount
                        pct_bg = int(bg_data['current'] / bg_data['target'] * 100) if bg_data.get('target') else 0
                        bar_bg = '█' * (pct_bg // 10) + '░' * (10 - pct_bg // 10)
                        if bg_data['current'] >= bg_data['target']:
                            self.send(f'✨ BITS GOAL REACHED! [{bar_bg}] {bg_data["current"]:,}/{bg_data["target"]:,} bits! {bg_data.get("message","")} 🎉', channel)
                            state.bitsgoal = None
                        elif pct_bg % 25 == 0:
                            self.send(f'✨ Bits goal: [{bar_bg}] {bg_data["current"]:,}/{bg_data["target"]:,} ({pct_bg}%)', channel)
                except Exception:
                    pass
            except Exception:
                pass

        if not _level_gte(user_level, 'moderator'):
            if self._automod(nick, display_name, text, msg_id, channel, state, cfg):
                return

        prefix_char = cfg.get('command_prefix', '!')
        if text.startswith(prefix_char):
            parts    = text[len(prefix_char):].split(None, 1)
            cmd_name = parts[0].lower() if parts else ''
            query    = parts[1] if len(parts) > 1 else ''
            if cmd_name:
                self._dispatch(cmd_name, query, nick, display_name,
                               user_id, user_level, channel, msg_id, state, cfg,
                               user_color=tags.get('color', ''))

    # ── AutoMod ───────────────────────────────────────────────────────────

    def _automod(self, nick, display_name, text, msg_id, channel, state, cfg):
        am = cfg.get('automod', {})

        link_cfg = am.get('links', {})
        if link_cfg.get('enabled'):
            if re.search(r'https?://|www\.|\.com\b|\.gg\b|\.tv\b|\.io\b', text, re.I):
                expiry    = state.permits.get(nick.lower(), 0)
                whitelist = [w.lower() for w in link_cfg.get('whitelist', [])]
                if time.time() > expiry and not any(w in text.lower() for w in whitelist):
                    self.delete_msg(msg_id, channel)
                    self.send(f'{display_name}, links are not allowed. A mod can use !permit {nick}.', channel)
                    return True

        caps_cfg = am.get('caps', {})
        if caps_cfg.get('enabled') and len(text) >= int(caps_cfg.get('min_chars', 10)):
            alpha = [c for c in text if c.isalpha()]
            if alpha:
                pct = sum(1 for c in alpha if c.isupper()) / len(alpha) * 100
                if pct >= int(caps_cfg.get('max_percent', 70)):
                    self.delete_msg(msg_id, channel)
                    self.send(f'{display_name}, please avoid excessive caps.', channel)
                    return True

        sym_cfg = am.get('symbols', {})
        if sym_cfg.get('enabled') and len(text) >= 10:
            total = len(text)
            sym_count = sum(1 for c in text if not c.isalnum() and c not in ' \t.,!?\'"-:;')
            pct = sym_count / total * 100
            if pct >= int(sym_cfg.get('max_percent', 60)):
                self.delete_msg(msg_id, channel)
                self.send(f'{display_name}, please avoid symbol spam.', channel)
                return True

        text_low = text.lower()
        for word in am.get('blacklist', []):
            if word and word.lower() in text_low:
                self.delete_msg(msg_id, channel)
                return True

        return False

    # ── Command dispatch ──────────────────────────────────────────────────

    def _dispatch(self, cmd_name, query, nick, display_name,
                  user_id, user_level, channel, msg_id, state, cfg, user_color=''):
        custom = cfg.get('commands', {}).get(cmd_name)

        if not custom:
            # Check if cmd_name is an alias for another command
            for cname, cdef in cfg.get('commands', {}).items():
                if cmd_name in (cdef.get('aliases') or []):
                    custom = cdef
                    cmd_name = cname
                    break

        if custom and custom.get('enabled', True):
            required  = custom.get('user_level', 'everyone')
            if not _level_gte(user_level, required):
                return

            now       = time.time()
            global_cd = int(custom.get('cooldown', 5))
            user_cd   = int(custom.get('user_cooldown', 0))

            if now - state.cd.get(cmd_name, 0) < global_cd:
                return
            if user_cd:
                if now - state.user_cd.get(cmd_name, {}).get(user_id, 0) < user_cd:
                    return
                state.user_cd.setdefault(cmd_name, {})[user_id] = now
            state.cd[cmd_name] = now

            info = self._get_stream_info(channel, state)
            ctx  = {
                'user': display_name, 'query': query,
                'channel': channel, 'command_name': cmd_name,
                'config': cfg, '_stream_info': info,
                'bot_nick':   get_bot_credentials().get('bot_nick', ''),
                'user_id':    user_id,
                'nick':       nick,
                'user_color': user_color,
                'user_level': user_level,
                '_state_ref': state,
            }
            response = resolve_vars(custom.get('response', ''), ctx).strip()
            if response:
                self.send(response, channel)
            else:
                logger.warning(f'Custom command !{cmd_name} in #{channel} produced empty response (raw: {repr(custom.get("response",""))})')
            save_channel_config(channel, cfg)
            return

        # Custom counter detection
        if cmd_name not in PROTECTED:
            counters = _load_counters(channel)
            ccounters = counters.get('custom', {})
            if cmd_name in ccounters:
                self.send(f'🔢 [{cmd_name}]: {ccounters[cmd_name]}', channel)
                return
            if cmd_name.endswith('+') and cmd_name[:-1] in ccounters and _level_gte(user_level, 'moderator'):
                base = cmd_name[:-1]
                try: n = int(query.strip())
                except: n = 1
                ccounters[base] += n
                _save_counters(channel, counters)
                self.send(f'🔢 [{base}]: {ccounters[base]}', channel)
                return
            if cmd_name.endswith('-') and cmd_name[:-1] in ccounters and _level_gte(user_level, 'moderator'):
                base = cmd_name[:-1]
                try: n = int(query.strip())
                except: n = 1
                ccounters[base] = max(0, ccounters[base] - n)
                _save_counters(channel, counters)
                self.send(f'🔢 [{base}]: {ccounters[base]}', channel)
                return

        self._builtin(cmd_name, query, nick, display_name, user_level, user_id, channel, state, cfg)

    def _builtin(self, cmd_name, query, nick, display_name, user_level, user_id, channel, state, cfg):
        # ── Feature flag check ────────────────────────────────────────────
        _enabled_cmds = cfg.get('enabled_commands', {})
        # Default: commands in _DEFAULT_DISABLED are off unless explicitly enabled
        if not _enabled_cmds.get(cmd_name, cmd_name not in _DEFAULT_DISABLED):
            return

        if cmd_name == 'commands':
            names = [f'!{n}' for n, c in cfg.get('commands', {}).items() if c.get('enabled', True)]
            self.send('Commands: ' + ', '.join(names) if names else 'No commands configured.', channel)

        elif cmd_name == 'uptime':
            info = self._get_stream_info(channel, state)
            self.send(info['uptime'] if info else 'Stream is currently offline.', channel)

        elif cmd_name == 'game':
            info = self._get_stream_info(channel, state)
            self.send(f'Currently playing: {info["game"]}' if info else 'Stream is offline.', channel)

        elif cmd_name == 'title':
            info = self._get_stream_info(channel, state)
            self.send(info['title'] if info else 'Stream is offline.', channel)

        elif cmd_name in ('shoutout', 'so') and _level_gte(user_level, 'moderator'):
            target = query.strip().lstrip('@')
            if not target:
                return
            try:
                client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
                token     = os.environ.get('CUBASSIST_BOT_TOKEN', '').replace('oauth:', '')
                req = urllib.request.Request(
                    f'https://api.twitch.tv/helix/users?login={urllib.parse.quote(target)}',
                    headers={'Client-Id': client_id, 'Authorization': f'Bearer {token}'}
                )
                with urllib.request.urlopen(req, timeout=5) as r:
                    udata = json.loads(r.read()).get('data', [])
                if udata:
                    tid = udata[0]['id']
                    req2 = urllib.request.Request(
                        f'https://api.twitch.tv/helix/channels?broadcaster_id={tid}',
                        headers={'Client-Id': client_id, 'Authorization': f'Bearer {token}'}
                    )
                    with urllib.request.urlopen(req2, timeout=5) as r2:
                        cdata = json.loads(r2.read()).get('data', [])
                    if cdata:
                        game = cdata[0].get('game_name', '')
                        game_str = f' — last seen playing {game}!' if game else '!'
                        self.send(f'🎉 Go check out @{target} at twitch.tv/{target.lower()}{game_str}', channel)
                        return
            except Exception:
                pass
            self.send(f'🎉 Go check out @{target} at twitch.tv/{target.lower()} !', channel)

        elif cmd_name == 'permit' and _level_gte(user_level, 'moderator'):
            target = query.strip().lstrip('@').lower()
            if target:
                secs = int(cfg.get('automod', {}).get('links', {}).get('permit_time', 30))
                state.permits[target] = time.time() + secs
                self.send(f'{target} may post links for {secs} seconds.', channel)

        elif cmd_name == 'addcom' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            if len(parts) < 2:
                self.send('Usage: !addcom !name response text', channel); return
            name = parts[0].lstrip('!').lower()
            if name in PROTECTED:
                self.send(f'Cannot override built-in command !{name}', channel); return
            cfg.setdefault('commands', {})[name] = {
                'response': parts[1], 'user_level': 'everyone',
                'cooldown': 5, 'user_cooldown': 0, 'count': 0, 'enabled': True,
            }
            save_channel_config(channel, cfg)
            self.send(f'Command !{name} added.', channel)

        elif cmd_name == 'editcom' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            if len(parts) < 2:
                self.send('Usage: !editcom !name new response', channel); return
            name = parts[0].lstrip('!').lower()
            if name not in cfg.get('commands', {}):
                self.send(f'!{name} not found.', channel); return
            cfg['commands'][name]['response'] = parts[1]
            save_channel_config(channel, cfg)
            self.send(f'Command !{name} updated.', channel)

        elif cmd_name == 'setvar' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            if len(parts) < 2:
                self.send('Usage: !setvar name value', channel); return
            var_name = parts[0].lower()
            if not re.match(r'^[a-zA-Z0-9_]+$', var_name):
                self.send('Variable name can only contain letters, numbers, and underscores.', channel); return
            cfg.setdefault('custom_vars', {})[var_name] = parts[1]
            save_channel_config(channel, cfg)
            self.send(f'Variable {var_name} set.', channel)

        elif cmd_name == 'delvar' and _level_gte(user_level, 'moderator'):
            var_name = query.strip().lower()
            if var_name in cfg.get('custom_vars', {}):
                del cfg['custom_vars'][var_name]
                save_channel_config(channel, cfg)
                self.send(f'Variable {var_name} deleted.', channel)
            else:
                self.send(f'Variable {var_name} not found.', channel)

        elif cmd_name == 'delcom' and _level_gte(user_level, 'moderator'):
            name = query.strip().lstrip('!').lower()
            if name in cfg.get('commands', {}):
                del cfg['commands'][name]
                save_channel_config(channel, cfg)
                self.send(f'Command !{name} deleted.', channel)
            else:
                self.send(f'!{name} not found.', channel)

        elif cmd_name == 'addquote' and _level_gte(user_level, 'moderator'):
            text_q = query.strip()
            if not text_q:
                self.send('Usage: !addquote quote text here', channel); return
            quotes = cfg.setdefault('quotes', [])
            quotes.append({'text': text_q, 'added_by': display_name, 'ts': int(time.time())})
            save_channel_config(channel, cfg)
            self.send(f'Quote #{len(quotes)} added.', channel)

        elif cmd_name == 'delquote' and _level_gte(user_level, 'moderator'):
            try:
                idx = int(query.strip()) - 1
                quotes = cfg.get('quotes', [])
                if 0 <= idx < len(quotes):
                    del quotes[idx]
                    save_channel_config(channel, cfg)
                    self.send(f'Quote #{idx+1} deleted.', channel)
                else:
                    self.send('Quote not found.', channel)
            except ValueError:
                self.send('Usage: !delquote number', channel)

        elif cmd_name == 'quote':
            quotes = cfg.get('quotes', [])
            if not quotes:
                self.send('No quotes saved yet.', channel); return
            q_query = query.strip()
            if q_query:
                try:
                    idx = int(q_query) - 1
                    if 0 <= idx < len(quotes):
                        self.send(f'Quote #{idx+1}: {quotes[idx]["text"]}', channel)
                    else:
                        self.send('Quote not found.', channel)
                    return
                except ValueError:
                    pass
            idx = random.randrange(len(quotes))
            self.send(f'Quote #{idx+1}: {quotes[idx]["text"]}', channel)

        # ── Giveaway ──────────────────────────────────────────────────
        elif cmd_name == 'giveaway' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            action = parts[0].lower() if parts else ''
            arg    = parts[1].strip() if len(parts) > 1 else ''

            if action == 'start':
                prize = arg or 'a prize'
                state.giveaway = {
                    'active': True, 'entries_open': True, 'prize': prize,
                    'entries': [], 'winner': None, 'started_ts': int(time.time()),
                }
                self.send(f'🎉 Giveaway started! Prize: {prize} — type !enter to join!', channel)

            elif action == 'open':
                if not state.giveaway.get('active'):
                    self.send('No active giveaway. Use !giveaway start <prize>', channel); return
                state.giveaway['entries_open'] = True
                self.send('✅ Giveaway entries are open! Type !enter to join!', channel)

            elif action == 'close':
                if not state.giveaway.get('active'):
                    self.send('No active giveaway.', channel); return
                state.giveaway['entries_open'] = False
                n = len(state.giveaway['entries'])
                self.send(f'🔒 Entries closed. {n} entrant{"s" if n != 1 else ""} in the draw.', channel)

            elif action == 'draw':
                entries = state.giveaway.get('entries', [])
                if not entries:
                    self.send('No entries yet!', channel); return
                winner = random.choice(entries)
                state.giveaway['winner'] = winner
                state.giveaway['entries_open'] = False
                self.send(f'🎊 The winner is @{winner["nick"]}! Congratulations! 🎉', channel)

            elif action == 'redraw':
                prev    = (state.giveaway.get('winner') or {}).get('user_id', '')
                entries = [e for e in state.giveaway.get('entries', []) if e.get('user_id') != prev]
                if not entries:
                    self.send('No other entries to redraw from.', channel); return
                winner = random.choice(entries)
                state.giveaway['winner'] = winner
                self.send(f'🎊 Redraw! New winner: @{winner["nick"]}! 🎉', channel)

            elif action in ('end', 'cancel'):
                state.giveaway = {'active': False, 'entries_open': False, 'prize': '', 'entries': [], 'winner': None, 'started_ts': 0}
                self.send('Giveaway ended.', channel)

            else:
                gw = state.giveaway
                if gw.get('active'):
                    n      = len(gw['entries'])
                    status = 'open' if gw['entries_open'] else 'closed'
                    self.send(f'Giveaway — {gw["prize"]} | {n} entr{"ies" if n != 1 else "y"} | entries {status}', channel)
                else:
                    self.send('No active giveaway. Usage: !giveaway start <prize>', channel)

        elif cmd_name == 'enter':
            gw = state.giveaway
            if not gw.get('active') or not gw.get('entries_open'):
                return
            if any(e['user_id'] == user_id for e in gw['entries']):
                return
            gw['entries'].append({'nick': display_name, 'user_id': user_id})

        # ── Poll ──────────────────────────────────────────────────────
        elif cmd_name == 'poll' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            action = parts[0].lower() if parts else ''

            if action in ('end', 'stop', 'close'):
                if state.poll.get('active'):
                    state.poll['active'] = False
                    self.send(self._poll_results_str(state.poll), channel)
                else:
                    self.send('No active poll.', channel)

            elif action == 'results':
                if state.poll.get('question'):
                    self.send(self._poll_results_str(state.poll), channel)
                else:
                    self.send('No poll data.', channel)

            else:
                segments = [s.strip() for s in query.split('|') if s.strip()]
                if len(segments) < 3:
                    self.send('Usage: !poll Question | Option 1 | Option 2 | ...', channel); return
                options = segments[1:]
                state.poll = {
                    'active': True, 'question': segments[0],
                    'options': options,
                    'votes':   {str(i + 1): 0 for i in range(len(options))},
                    'voted':   set(), 'started_ts': int(time.time()),
                }
                opts_str = ' | '.join(f'{i+1}) {o}' for i, o in enumerate(options))
                self.send(f'📊 Poll: {segments[0]} · {opts_str} · Vote: !vote <number>', channel)

        elif cmd_name == 'vote':
            if not state.poll.get('active') or user_id in state.poll['voted']:
                return
            choice = query.strip()
            if choice in state.poll['votes']:
                state.poll['votes'][choice] += 1
                state.poll['voted'].add(user_id)

        # ── Points ────────────────────────────────────────────────────
        elif cmd_name == 'points':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            pts      = _load_points(channel)
            target   = query.strip().lstrip('@')
            key      = target.lower() if target else nick
            label    = target if target else display_name
            bal      = pts.get(key, 0)
            self.send(f'{label} has {bal:,} {pts_name}.', channel)

        elif cmd_name == 'addpoints' and _level_gte(user_level, 'moderator'):
            parts = query.split()
            if len(parts) < 2:
                self.send('Usage: !addpoints @user amount', channel); return
            target = parts[0].lstrip('@').lower()
            try:    amount = int(parts[1])
            except ValueError:
                self.send('Amount must be a whole number.', channel); return
            pts_name = cfg.get('points_config', {}).get('name', 'points')
            pts = _load_points(channel)
            pts[target] = pts.get(target, 0) + amount
            _save_points(channel, pts)
            self.send(f'+{amount} {pts_name} → {target} (total: {pts[target]:,})', channel)

        elif cmd_name == 'removepoints' and _level_gte(user_level, 'moderator'):
            parts = query.split()
            if len(parts) < 2:
                self.send('Usage: !removepoints @user amount', channel); return
            target = parts[0].lstrip('@').lower()
            try:    amount = int(parts[1])
            except ValueError:
                self.send('Amount must be a whole number.', channel); return
            pts_name = cfg.get('points_config', {}).get('name', 'points')
            pts = _load_points(channel)
            pts[target] = max(0, pts.get(target, 0) - amount)
            _save_points(channel, pts)
            self.send(f'-{amount} {pts_name} from {target} (total: {pts[target]:,})', channel)

        elif cmd_name == 'leaderboard':
            pts_name = cfg.get('points_config', {}).get('name', 'points')
            pts      = _load_points(channel)
            if not pts:
                self.send(f'No {pts_name} earned yet.', channel); return
            top = sorted(pts.items(), key=lambda x: x[1], reverse=True)[:5]
            parts = ' | '.join(f'#{i+1} {n}: {b:,}' for i, (n, b) in enumerate(top))
            self.send(f'🏆 {pts_name.title()} Top 5: {parts}', channel)

        # ── Queue ─────────────────────────────────────────────────────
        elif cmd_name == 'queue':
            parts  = query.split(None, 1)
            sub    = parts[0].lower() if parts else ''
            arg    = parts[1].strip() if len(parts) > 1 else ''
            mod    = _level_gte(user_level, 'moderator')

            if sub == 'open' and mod:
                state.queue_open = True
                self.send('✅ Queue is now open! Type !queue to join.', channel)

            elif sub == 'close' and mod:
                state.queue_open = False
                self.send(f'🔒 Queue closed. {len(state.queue)} in queue.', channel)

            elif sub == 'clear' and mod:
                state.queue = []
                self.send('Queue cleared.', channel)

            elif sub == 'next' and mod:
                if not state.queue:
                    self.send('Queue is empty.', channel); return
                entry = state.queue.pop(0)
                content_str = f' [{entry["content"]}]' if entry.get('content') else ''
                self.send(f'🎮 Next up: @{entry["user"]}{content_str}! ({len(state.queue)} remaining)', channel)

            elif sub == 'list':
                if not state.queue:
                    self.send('Queue is empty.', channel); return
                items = ', '.join(
                    f'#{i+1} {e["user"]}' + (f' [{e["content"]}]' if e.get('content') else '')
                    for i, e in enumerate(state.queue[:8])
                )
                extra = f' (+{len(state.queue)-8} more)' if len(state.queue) > 8 else ''
                self.send(f'Queue ({len(state.queue)}): {items}{extra}', channel)

            elif sub == 'leave':
                before = len(state.queue)
                state.queue = [e for e in state.queue if e['user_id'] != user_id]
                if len(state.queue) < before:
                    self.send(f'{display_name} left the queue.', channel)

            elif sub == 'pos':
                pos = next((i + 1 for i, e in enumerate(state.queue) if e['user_id'] == user_id), None)
                if pos:
                    self.send(f'{display_name}, you are #{pos} in the queue.', channel)
                else:
                    self.send(f'{display_name}, you are not in the queue.', channel)

            else:
                # Join queue — treat entire query as optional content
                if not state.queue_open:
                    return
                if any(e['user_id'] == user_id for e in state.queue):
                    pos = next((i + 1 for i, e in enumerate(state.queue) if e['user_id'] == user_id), 0)
                    self.send(f'{display_name}, you are already #{pos} in the queue.', channel); return
                content = query.strip()
                state.queue.append({'user': display_name, 'user_id': user_id, 'content': content, 'ts': int(time.time())})
                self.send(f'{display_name} joined the queue at #{len(state.queue)}!', channel)

        # ── Mini-games ────────────────────────────────────────────────────────────────
        elif cmd_name == 'coinflip':
            bet_str = query.strip()
            side    = None
            amount  = 0
            parts   = bet_str.split()
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            # !coinflip [heads|tails] [amount]
            for p in parts:
                if p.lower() in ('heads', 'tails'):
                    side = p.lower()
                else:
                    try: amount = int(p)
                    except: pass
            result = random.choice(['heads', 'tails'])
            if amount > 0 and pts_cfg.get('enabled'):
                pts = _load_points(channel)
                bal = pts.get(nick, 0)
                amount = min(amount, bal)
                if side == result:
                    pts[nick] = bal + amount
                    _save_points(channel, pts)
                    self.send(f'🪙 {result.upper()}! {display_name} won {amount} {pts_name}! (Balance: {pts[nick]:,})', channel)
                else:
                    pts[nick] = max(0, bal - amount)
                    _save_points(channel, pts)
                    self.send(f'🪙 {result.upper()}! {display_name} lost {amount} {pts_name}. (Balance: {pts[nick]:,})', channel)
            else:
                self.send(f'🪙 {display_name} flipped... {result.upper()}!', channel)

        elif cmd_name == '8ball':
            if not query.strip():
                self.send('Ask a question! Usage: !8ball will I win today?', channel); return
            self.send(f'🎱 {display_name}: {random.choice(_8BALL)}', channel)

        elif cmd_name == 'gamble':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            try:    amount = int(query.strip())
            except: self.send(f'Usage: !gamble <amount>', channel); return
            if amount <= 0:
                self.send('Amount must be positive.', channel); return
            pts = _load_points(channel)
            bal = pts.get(nick, 0)
            if amount > bal:
                self.send(f'{display_name}, you only have {bal:,} {pts_name}.', channel); return
            roll = random.random()
            if roll < 0.07:    # 7% jackpot
                win = amount * 3
                pts[nick] = bal + win
                self.send(f'🎰 JACKPOT! {display_name} won {win:,} {pts_name}! 🎉 (Balance: {pts[nick]:,})', channel)
            elif roll < 0.45:  # 38% win
                win = int(amount * 1.5)
                pts[nick] = bal + win
                self.send(f'🎰 {display_name} won {win:,} {pts_name}! (Balance: {pts[nick]:,})', channel)
            else:              # 55% lose
                pts[nick] = bal - amount
                self.send(f'🎰 {display_name} lost {amount:,} {pts_name}. (Balance: {pts[nick]:,})', channel)
            _save_points(channel, pts)

        elif cmd_name == 'slots':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            try:    amount = int(query.strip())
            except: self.send('Usage: !slots <amount>', channel); return
            if amount <= 0:
                self.send('Amount must be positive.', channel); return
            pts = _load_points(channel)
            bal = pts.get(nick, 0)
            if amount > bal:
                self.send(f'{display_name}, you only have {bal:,} {pts_name}.', channel); return
            s1, s2, s3 = [random.choice(_SLOTS_SYMBOLS) for _ in range(3)]
            result_str = f'{s1} {s2} {s3}'
            if s1 == s2 == s3:
                if s1 == '7️⃣':
                    win = amount * 10
                    pts[nick] = bal + win
                    self.send(f'🎰 [ {result_str} ] MEGA JACKPOT! +{win:,} {pts_name}! 🎉', channel)
                else:
                    win = amount * 5
                    pts[nick] = bal + win
                    self.send(f'🎰 [ {result_str} ] JACKPOT! +{win:,} {pts_name}!', channel)
            elif s1 == s2 or s2 == s3 or s1 == s3:
                win = int(amount * 1.5)
                pts[nick] = bal + win
                self.send(f'🎰 [ {result_str} ] Two of a kind! +{win:,} {pts_name}!', channel)
            else:
                pts[nick] = bal - amount
                self.send(f'🎰 [ {result_str} ] No match. -{amount:,} {pts_name}.', channel)
            _save_points(channel, pts)

        elif cmd_name == 'duel':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            if state.duel and state.duel.get('active'):
                self.send('A duel is already in progress!', channel); return
            parts = query.split()
            if len(parts) < 2:
                self.send('Usage: !duel @user <amount>', channel); return
            target_nick = parts[0].lstrip('@').lower()
            try:    amount = int(parts[1])
            except: self.send('Usage: !duel @user <amount>', channel); return
            if amount <= 0:
                self.send('Amount must be positive.', channel); return
            pts = _load_points(channel)
            if pts.get(nick, 0) < amount:
                self.send(f'{display_name}, you don\'t have enough {pts_name}.', channel); return
            if pts.get(target_nick, 0) < amount:
                self.send(f'{target_nick} doesn\'t have enough {pts_name}.', channel); return
            state.duel = {
                'active': True,
                'challenger': {'nick': nick, 'display': display_name, 'user_id': user_id},
                'target_nick': target_nick, 'amount': amount,
                'expiry': time.time() + 60,
            }
            self.send(f'⚔️ {display_name} challenges @{target_nick} to a duel for {amount:,} {pts_name}! @{target_nick}: type !accept or !decline (60s)', channel)

        elif cmd_name == 'accept':
            # Check RPS challenge first
            if state.challenge and state.challenge.get('active') and nick == state.challenge.get('target'):
                ch = state.challenge
                state.challenge = None
                choices = ['Rock 🪨', 'Paper 📄', 'Scissors ✂️']
                c1 = random.choice(choices)
                c2 = random.choice(choices)
                pts = _load_points(channel)
                pts_cfg = cfg.get('points_config', {})
                def rps_winner(a, b):
                    if a == b: return 'tie'
                    wins = {'Rock 🪨': 'Scissors ✂️', 'Scissors ✂️': 'Paper 📄', 'Paper 📄': 'Rock 🪨'}
                    return 'a' if wins[a] == b else 'b'
                result = rps_winner(c1, c2)
                challenger_bal = pts.get(ch['challenger'], 0)
                target_bal = pts.get(nick, 0)
                if result == 'tie':
                    msg = f'🎮 RPS: {ch["challenger_display"]} chose {c1} | {display_name} chose {c2} | TIE! No points exchanged!'
                elif result == 'a':
                    pts[ch['challenger']] = challenger_bal + ch['amount']
                    pts[nick] = max(0, target_bal - ch['amount'])
                    msg = f'🎮 RPS: {ch["challenger_display"]} chose {c1} | {display_name} chose {c2} | {ch["challenger_display"]} wins {ch["amount"]:,} {pts_cfg.get("name","points")}!'
                else:
                    pts[nick] = target_bal + ch['amount']
                    pts[ch['challenger']] = max(0, challenger_bal - ch['amount'])
                    msg = f'🎮 RPS: {ch["challenger_display"]} chose {c1} | {display_name} chose {c2} | {display_name} wins {ch["amount"]:,} {pts_cfg.get("name","points")}!'
                _save_points(channel, pts)
                self.send(msg, channel)
                return
            if not state.duel or not state.duel.get('active'):
                return
            if nick != state.duel['target_nick']:
                return
            duel = state.duel
            pts_name = cfg.get('points_config', {}).get('name', 'points')
            pts = _load_points(channel)
            amount = duel['amount']
            c_nick = duel['challenger']['nick']
            t_nick = duel['target_nick']
            winner, loser = (c_nick, t_nick) if random.random() < 0.5 else (t_nick, c_nick)
            pts[winner] = pts.get(winner, 0) + amount
            pts[loser]  = max(0, pts.get(loser, 0) - amount)
            _save_points(channel, pts)
            state.duel = None
            self.send(f'⚔️ {winner} wins the duel and takes {amount:,} {pts_name} from {loser}!', channel)

        elif cmd_name == 'decline':
            if not state.duel or not state.duel.get('active'):
                return
            if nick != state.duel['target_nick']:
                return
            challenger = state.duel['challenger']['display']
            state.duel = None
            self.send(f'{display_name} declined the duel challenge from {challenger}.', channel)

        elif cmd_name == 'heist':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            try:    amount = max(1, int(query.strip()))
            except: self.send('Usage: !heist <amount>', channel); return
            pts = _load_points(channel)
            if pts.get(nick, 0) < amount:
                self.send(f'{display_name}, you don\'t have enough {pts_name}.', channel); return
            if not state.heist:
                state.heist = {'phase': 'joining', 'entries': [], 'expiry': time.time() + 45}
                self.send(f'🏴‍☠️ A heist is starting! Type !heist <amount> to join! ({45}s to join)', channel)
            if state.heist.get('phase') != 'joining':
                return
            if any(e['nick'] == nick for e in state.heist['entries']):
                return
            # Deduct points immediately (refund if they win)
            pts[nick] = pts.get(nick, 0) - amount
            _save_points(channel, pts)
            state.heist['entries'].append({'nick': nick, 'display': display_name, 'user_id': user_id, 'amount': amount})
            self.send(f'🏴‍☠️ {display_name} joined the heist for {amount:,} {pts_name}! ({len(state.heist["entries"])} crew)', channel)

        elif cmd_name == 'trivia':
            if state.trivia and state.trivia.get('active'):
                self.send(f'❓ Current question: {state.trivia["question"]}', channel); return
            q = random.choice(_TRIVIA)
            pts_cfg = cfg.get('points_config', {})
            reward  = int(pts_cfg.get('trivia_reward', 100))
            state.trivia = {
                'active': True, 'question': q['q'], 'answer': q['a'],
                'reward': reward, 'expiry': time.time() + 30, 'answered': False,
            }
            self.send(f'❓ Trivia ({reward} pts): {q["q"]} (30s)', channel)

        # ── Song requests ─────────────────────────────────────────────
        elif cmd_name == 'sr':
            sr_cfg = cfg.get('song_requests', {})
            if not sr_cfg.get('enabled', False):
                self.send('Song requests are not enabled.', channel); return
            if not state.songs_open:
                self.send('Song requests are currently closed.', channel); return
            content = query.strip()
            if not content:
                self.send('Usage: !sr <song name or URL>', channel); return
            max_per = int(sr_cfg.get('max_per_user', 3))
            user_count = sum(1 for s in state.song_queue if s['user_id'] == user_id)
            if user_count >= max_per:
                self.send(f'{display_name}, you already have {user_count} song(s) in the queue (max {max_per}).', channel); return
            state.song_queue.append({'user': display_name, 'user_id': user_id, 'content': content, 'ts': int(time.time())})
            pos = len(state.song_queue)
            self.send(f'🎵 Added "{content}" to the queue at #{pos}! ({display_name})', channel)

        elif cmd_name == 'song':
            if not state.song_queue:
                self.send('No songs in the queue.', channel); return
            s = state.song_queue[0]
            self.send(f'🎵 Now playing: {s["content"]} (requested by {s["user"]})', channel)

        elif cmd_name == 'nextsong':
            if len(state.song_queue) < 2:
                self.send('No upcoming songs in the queue.', channel); return
            s = state.song_queue[1]
            self.send(f'🎵 Next up: {s["content"]} (requested by {s["user"]})', channel)

        elif cmd_name == 'skipsong' and _level_gte(user_level, 'moderator'):
            if not state.song_queue:
                self.send('Queue is empty.', channel); return
            skipped = state.song_queue.pop(0)
            self.send(f'⏭ Skipped: {skipped["content"]}' + (f'. Next: {state.song_queue[0]["content"]}' if state.song_queue else '. Queue is empty.'), channel)

        elif cmd_name == 'clearsongs' and _level_gte(user_level, 'moderator'):
            state.song_queue = []
            self.send('Song queue cleared.', channel)

        # ── Rank & watch time ─────────────────────────────────────────
        elif cmd_name == 'rank':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            target = query.strip().lstrip('@')
            key    = target.lower() if target else nick
            label  = target if target else display_name
            pts    = _load_points(channel)
            bal    = pts.get(key, 0)
            ranks  = sorted(cfg.get('ranks', []), key=lambda r: r.get('min_points', 0), reverse=True)
            current_rank = next((r['name'] for r in ranks if bal >= r.get('min_points', 0)), 'Newcomer')
            next_rank_info = next((r for r in reversed(ranks) if bal < r.get('min_points', 0) and r.get('min_points', 0) > 0), None)
            next_str = f' · {next_rank_info["min_points"] - bal:,} {pts_name} to {next_rank_info["name"]}' if next_rank_info else ''
            self.send(f'🏅 {label} — Rank: {current_rank} | {bal:,} {pts_name}{next_str}', channel)

        elif cmd_name == 'watchtime':
            target = query.strip().lstrip('@')
            key    = target.lower() if target else nick
            label  = target if target else display_name
            wt     = _load_watchtime(channel)
            secs   = wt.get(key, 0)
            h, rem = divmod(secs, 3600)
            m      = rem // 60
            self.send(f'⏱ {label} has {h}h {m}m of watch time.', channel)

        elif cmd_name == 'followage':
            now = time.time()
            cd_key = f'__followage_{nick}__'
            if now - state.cd.get(cd_key, 0) < 15:
                return
            state.cd[cd_key] = now
            target = (query.strip().lstrip('@') or nick).lower()
            try:
                client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
                token = os.environ.get('CUBASSIST_BOT_TOKEN', '').replace('oauth:', '')
                bid = self._get_broadcaster_id(channel)
                # Get target user ID
                ur = urllib.request.Request(
                    f'https://api.twitch.tv/helix/users?login={urllib.parse.quote(target)}',
                    headers={'Client-Id': client_id, 'Authorization': f'Bearer {token}'}
                )
                with urllib.request.urlopen(ur, timeout=5) as r:
                    udata = json.loads(r.read()).get('data', [])
                if not udata:
                    self.send(f'User {target} not found.', channel); return
                uid = udata[0]['id']
                target_display = udata[0]['display_name']
                # Get follow data
                fr = urllib.request.Request(
                    f'https://api.twitch.tv/helix/channels/followers?broadcaster_id={bid}&user_id={uid}',
                    headers={'Client-Id': client_id, 'Authorization': f'Bearer {token}'}
                )
                with urllib.request.urlopen(fr, timeout=5) as r:
                    fdata = json.loads(r.read()).get('data', [])
                if fdata:
                    fa = datetime.datetime.fromisoformat(fdata[0]['followed_at'].replace('Z', '+00:00'))
                    delta = datetime.datetime.now(datetime.timezone.utc) - fa
                    days = delta.days
                    yrs, rem = divmod(days, 365)
                    mos = rem // 30
                    rem_days = rem % 30
                    parts = []
                    if yrs: parts.append(f'{yrs} year{"s" if yrs!=1 else ""}')
                    if mos: parts.append(f'{mos} month{"s" if mos!=1 else ""}')
                    if rem_days and not yrs: parts.append(f'{rem_days} day{"s" if rem_days!=1 else ""}')
                    age_str = ', '.join(parts) if parts else 'less than a day'
                    self.send(f'@{target_display} has been following for {age_str}! 💜', channel)
                else:
                    self.send(f'@{target_display} is not following {channel}.', channel)
            except Exception:
                self.send(f'Could not fetch follow data.', channel)

        elif cmd_name == 'accountage':
            now = time.time()
            cd_key = f'__accountage_{nick}__'
            if now - state.cd.get(cd_key, 0) < 15:
                return
            state.cd[cd_key] = now
            target = (query.strip().lstrip('@') or nick).lower()
            try:
                client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
                token = os.environ.get('CUBASSIST_BOT_TOKEN', '').replace('oauth:', '')
                ur = urllib.request.Request(
                    f'https://api.twitch.tv/helix/users?login={urllib.parse.quote(target)}',
                    headers={'Client-Id': client_id, 'Authorization': f'Bearer {token}'}
                )
                with urllib.request.urlopen(ur, timeout=5) as r:
                    udata = json.loads(r.read()).get('data', [])
                if not udata:
                    self.send(f'User {target} not found.', channel); return
                uinfo = udata[0]
                created = datetime.datetime.fromisoformat(uinfo['created_at'].replace('Z', '+00:00'))
                delta = datetime.datetime.now(datetime.timezone.utc) - created
                days = delta.days
                yrs, rem = divmod(days, 365)
                mos = rem // 30
                parts = []
                if yrs: parts.append(f'{yrs} year{"s" if yrs!=1 else ""}')
                if mos: parts.append(f'{mos} month{"s" if mos!=1 else ""}')
                if not yrs and not mos: parts.append(f'{days} day{"s" if days!=1 else ""}')
                age_str = ', '.join(parts)
                created_fmt = created.strftime('%B %d, %Y')
                self.send(f"@{uinfo['display_name']}'s account is {age_str} old (created {created_fmt}).", channel)
            except Exception:
                self.send(f'Could not fetch account info.', channel)

        elif cmd_name == 'lurk':
            state.lurkers[nick] = {'display': display_name, 'ts': int(time.time())}
            self.send(f'@{display_name} is now lurking! Thanks for the lurk! PauseChamp', channel)

        elif cmd_name == 'unlurk':
            lurk_data = state.lurkers.pop(nick, None)
            if lurk_data:
                elapsed = int(time.time()) - lurk_data['ts']
                mins = elapsed // 60
                if mins >= 60:
                    elapsed_str = f'{mins//60}h {mins%60}m'
                elif mins > 0:
                    elapsed_str = f'{mins}m'
                else:
                    elapsed_str = 'a moment'
                self.send(f'@{display_name} is back from lurking! (gone for {elapsed_str}) Welcome back! 👋', channel)
            else:
                self.send(f'@{display_name} is back! 👋', channel)

        elif cmd_name == 'lurkers':
            if not state.lurkers:
                self.send('No one is currently lurking.', channel)
            else:
                names = [v['display'] for v in list(state.lurkers.values())[:10]]
                self.send(f'Currently lurking ({len(state.lurkers)}): {", ".join(names)}', channel)

        elif cmd_name == 'mystats':
            now = time.time()
            ucd = state.user_cd.setdefault('mystats', {})
            if now - ucd.get(nick, 0) < 10:
                return
            ucd[nick] = now
            pts_data = _load_points(channel)
            wt_data = _load_watchtime(channel)
            warn_data = _load_warnings(channel)
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            balance = pts_data.get(nick, 0)
            wt_secs = wt_data.get(nick, 0)
            wt_hrs = wt_secs // 3600
            wt_mins = (wt_secs % 3600) // 60
            wt_str = f'{wt_hrs}h {wt_mins}m' if wt_hrs else f'{wt_mins}m'
            warns = len(warn_data.get(nick, []))
            # Rank
            ranks = cfg.get('ranks', [])
            rank_name = 'Newcomer'
            for r in sorted(ranks, key=lambda x: x.get('min_points', 0), reverse=True):
                if balance >= r.get('min_points', 0):
                    rank_name = r.get('name', rank_name)
                    break
            # Leaderboard position
            sorted_pts = sorted(pts_data.items(), key=lambda x: x[1], reverse=True)
            pos = next((i+1 for i, (n, _) in enumerate(sorted_pts) if n == nick), '?')
            self.send(f'@{display_name} | {pts_name}: {balance:,} (#{pos}) | Rank: {rank_name} | Watchtime: {wt_str} | Warnings: {warns}', channel)

        elif cmd_name == 'timestamp':
            if not _level_gte(user_level, 'moderator'):
                self.send(f'@{display_name}, only moderators can log timestamps.', channel)
                return
            note = query.strip() or 'no note'
            timestamps = _load_timestamps(channel)
            # Get stream uptime
            info = state.stream_info or {}
            started = info.get('started_at', '')
            if started:
                try:
                    st = datetime.datetime.fromisoformat(started.replace('Z', '+00:00'))
                    elapsed = datetime.datetime.now(datetime.timezone.utc) - st
                    total_s = int(elapsed.total_seconds())
                    h, rem = divmod(total_s, 3600)
                    m, s = divmod(rem, 60)
                    uptime_str = f'{h:02d}:{m:02d}:{s:02d}'
                except Exception:
                    uptime_str = 'unknown'
            else:
                uptime_str = info.get('uptime', 'unknown')
            entry = {'ts': int(time.time()), 'uptime': uptime_str, 'note': note, 'added_by': nick}
            timestamps.append(entry)
            _save_timestamps(channel, timestamps)
            self.send(f'📌 Timestamp #{len(timestamps)} logged at [{uptime_str}]: {note}', channel)

        elif cmd_name == 'top':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            sub = query.strip().lower()
            if sub == 'watchtime':
                wt  = _load_watchtime(channel)
                top = sorted(wt.items(), key=lambda x: x[1], reverse=True)[:5]
                if not top:
                    self.send('No watch time data yet.', channel); return
                parts = ' | '.join(f'#{i+1} {n}: {v//3600}h {(v%3600)//60}m' for i, (n, v) in enumerate(top))
                self.send(f'⏱ Watch Time: {parts}', channel)
            else:
                pts = _load_points(channel)
                top = sorted(pts.items(), key=lambda x: x[1], reverse=True)[:5]
                if not top:
                    self.send(f'No {pts_name} data yet.', channel); return
                parts = ' | '.join(f'#{i+1} {n}: {b:,}' for i, (n, b) in enumerate(top))
                self.send(f'🏆 Top {pts_name.title()}: {parts}', channel)

        # ── Moderation tools ──────────────────────────────────────────
        elif cmd_name == 'warn' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            if not parts:
                self.send('Usage: !warn @user [reason]', channel); return
            target = parts[0].lstrip('@').lower()
            reason = parts[1].strip() if len(parts) > 1 else 'No reason given'
            warns  = _load_warnings(channel)
            entry  = {'reason': reason, 'by': nick, 'ts': int(time.time())}
            warns.setdefault(target, []).append(entry)
            _save_warnings(channel, warns)
            count = len(warns[target])
            self.send(f'⚠️ {target} has been warned ({count} total): {reason}', channel)
            # Auto-timeout at 3 warnings
            if count >= 3:
                self.timeout(target, channel, 600, 'Reached 3 warnings')
                self.send(f'🔨 {target} timed out for 10 minutes (3 warnings reached).', channel)

        elif cmd_name == 'warnings':
            target = query.strip().lstrip('@').lower() if query.strip() else nick
            warns  = _load_warnings(channel)
            user_warns = warns.get(target, [])
            if not user_warns:
                self.send(f'{target} has no warnings.', channel); return
            recent = user_warns[-3:]
            parts  = ' | '.join(f'"{w["reason"]}"' for w in recent)
            self.send(f'⚠️ {target} has {len(user_warns)} warning(s): {parts}', channel)

        elif cmd_name == 'clearwarnings' and _level_gte(user_level, 'moderator'):
            target = query.strip().lstrip('@').lower()
            if not target:
                self.send('Usage: !clearwarnings @user', channel); return
            warns = _load_warnings(channel)
            if target in warns:
                del warns[target]
                _save_warnings(channel, warns)
            self.send(f'✅ Warnings cleared for {target}.', channel)

        elif cmd_name == 'note' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            if len(parts) < 2:
                self.send('Usage: !note @user note text', channel); return
            target = parts[0].lstrip('@').lower()
            note   = parts[1].strip()
            notes  = _load_user_notes(channel)
            notes.setdefault(target, []).append({'note': note, 'by': nick, 'ts': int(time.time())})
            _save_user_notes(channel, notes)
            self.send(f'📝 Note saved for {target}.', channel)

        elif cmd_name == 'notes' and _level_gte(user_level, 'moderator'):
            target = query.strip().lstrip('@').lower()
            if not target:
                self.send('Usage: !notes @user', channel); return
            notes = _load_user_notes(channel)
            user_notes = notes.get(target, [])
            if not user_notes:
                self.send(f'No notes for {target}.', channel); return
            recent = user_notes[-3:]
            parts  = ' | '.join(f'"{n["note"]}" — {n["by"]}' for n in recent)
            self.send(f'📝 Notes for {target} ({len(user_notes)} total): {parts}', channel)

        # ── Utility ───────────────────────────────────────────────────
        elif cmd_name == 'weather':
            city = query.strip()
            if not city:
                self.send('Usage: !weather <city>', channel); return
            try:
                encoded = urllib.parse.quote(city)
                req = urllib.request.Request(
                    f'https://wttr.in/{encoded}?format=3&m',
                    headers={'User-Agent': 'CubAssist/1.0'}
                )
                with urllib.request.urlopen(req, timeout=6) as r:
                    result = r.read(200).decode('utf-8', errors='replace').strip()
                self.send(f'🌤 {result}', channel)
            except Exception:
                self.send(f'Could not get weather for {city}.', channel)

        # ── Stream Counters ───────────────────────────────────────────────
        elif cmd_name == 'deaths':
            c = _load_counters(channel)
            self.send(f'💀 Deaths this session: {c.get("deaths", 0)}', channel)

        elif cmd_name == 'adddeaths' and _level_gte(user_level, 'moderator'):
            c = _load_counters(channel)
            try: n = int(query.strip())
            except: n = 1
            c['deaths'] = c.get('deaths', 0) + n
            _save_counters(channel, c)
            self.send(f'💀 Deaths: {c["deaths"]}', channel)

        elif cmd_name == 'setdeaths' and _level_gte(user_level, 'moderator'):
            c = _load_counters(channel)
            try:
                c['deaths'] = int(query.strip())
                _save_counters(channel, c)
                self.send(f'💀 Deaths set to {c["deaths"]}', channel)
            except: self.send('Usage: !setdeaths <number>', channel)

        elif cmd_name == 'resetdeaths' and _level_gte(user_level, 'moderator'):
            c = _load_counters(channel)
            c['deaths'] = 0
            _save_counters(channel, c)
            self.send('💀 Deaths reset to 0', channel)

        elif cmd_name == 'wins':
            c = _load_counters(channel)
            self.send(f'🏆 Wins: {c.get("wins", 0)} | Losses: {c.get("losses", 0)}', channel)

        elif cmd_name == 'addwins' and _level_gte(user_level, 'moderator'):
            c = _load_counters(channel)
            try: n = int(query.strip())
            except: n = 1
            c['wins'] = c.get('wins', 0) + n
            _save_counters(channel, c)
            self.send(f'🏆 Wins: {c["wins"]}', channel)

        elif cmd_name == 'losses':
            c = _load_counters(channel)
            self.send(f'😢 Losses: {c.get("losses", 0)}', channel)

        elif cmd_name == 'addlosses' and _level_gte(user_level, 'moderator'):
            c = _load_counters(channel)
            try: n = int(query.strip())
            except: n = 1
            c['losses'] = c.get('losses', 0) + n
            _save_counters(channel, c)
            self.send(f'😢 Losses: {c["losses"]}', channel)

        elif cmd_name == 'wl':
            c = _load_counters(channel)
            total = c.get('wins', 0) + c.get('losses', 0)
            pct = round(c.get('wins', 0) / total * 100) if total else 0
            self.send(f'📊 W/L: {c.get("wins", 0)}/{c.get("losses", 0)} ({pct}% WR)', channel)

        elif cmd_name == 'score':
            c = _load_counters(channel)
            self.send(f'🎯 Score: {c.get("score", "0")}', channel)

        elif cmd_name == 'setscore' and _level_gte(user_level, 'moderator'):
            c = _load_counters(channel)
            score_str = query.strip()
            c['score'] = score_str
            _save_counters(channel, c)
            self.send(f'🎯 Score: {score_str}', channel)

        # ── Custom counters ───────────────────────────────────────────────
        elif cmd_name == 'counter' and _level_gte(user_level, 'moderator'):
            parts  = query.split(None, 2)
            sub    = parts[0].lower() if parts else ''
            c = _load_counters(channel)
            ccounters = c.setdefault('custom', {})

            if sub == 'add' and len(parts) >= 2:
                name = parts[1].lower().strip('!#')
                if not re.match(r'^[a-z0-9_]+$', name):
                    self.send('Counter name may only contain letters, numbers, and underscores.', channel); return
                if name in ccounters:
                    self.send(f'Counter [{name}] already exists.', channel); return
                start = 0
                if len(parts) >= 3:
                    try: start = int(parts[2])
                    except: pass
                ccounters[name] = start
                _save_counters(channel, c)
                self.send(f'✅ Counter [{name}] created (start: {start}). Use !{name} to show, !{name}+ to increment.', channel)

            elif sub == 'remove' and len(parts) >= 2:
                name = parts[1].lower().strip('!#')
                if name in ccounters:
                    del ccounters[name]
                    _save_counters(channel, c)
                    self.send(f'Counter [{name}] removed.', channel)
                else:
                    self.send(f'Counter [{name}] not found.', channel)

            elif sub == 'set' and len(parts) >= 3:
                name = parts[1].lower().strip('!#')
                if name not in ccounters:
                    self.send(f'Counter [{name}] not found.', channel); return
                try:
                    ccounters[name] = int(parts[2])
                    _save_counters(channel, c)
                    self.send(f'🔢 [{name}]: {ccounters[name]}', channel)
                except: self.send('Usage: !counter set <name> <value>', channel)

            elif sub == 'reset' and len(parts) >= 2:
                name = parts[1].lower().strip('!#')
                if name in ccounters:
                    ccounters[name] = 0
                    _save_counters(channel, c)
                    self.send(f'🔢 [{name}] reset to 0', channel)
                else:
                    self.send(f'Counter [{name}] not found.', channel)

            elif sub == 'list':
                if not ccounters:
                    self.send('No custom counters. Use !counter add <name>', channel); return
                parts_list = ' | '.join(f'{n}: {v}' for n, v in ccounters.items())
                self.send(f'🔢 Counters: {parts_list}', channel)

            else:
                self.send('Usage: !counter add <name> [start] | !counter remove <name> | !counter set <name> <value> | !counter reset <name> | !counter list', channel)

        # ── Fishing ───────────────────────────────────────────────────────────
        elif cmd_name == 'fish':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            now = time.time()
            fish_key = f'__fish_{user_id}__'
            cd_secs = 60  # 1 min cooldown
            last_fish = state.cd.get(fish_key, 0)
            if now - last_fish < cd_secs:
                remaining = int(cd_secs - (now - last_fish))
                self.send(f'🎣 {display_name}, your line is cooling down! ({remaining}s)', channel); return
            state.cd[fish_key] = now
            roll = random.random()
            _fish_table = [
                (0.03, '🦈 LEGENDARY CATCH! A shark! You got', 500, 1000),
                (0.08, '🐟 Rare catch! A golden fish! You got', 200, 400),
                (0.25, '🐠 Nice catch! A tropical fish! You got', 50, 150),
                (0.55, '🐟 Caught a fish! You got', 10, 50),
            ]
            cumulative = 0
            pts = _load_points(channel)
            for (threshold, msg, min_pts, max_pts) in _fish_table:
                cumulative += threshold
                if roll <= cumulative:
                    won = random.randint(min_pts, max_pts)
                    pts[nick] = pts.get(nick, 0) + won
                    _save_points(channel, pts)
                    self.send(f'🎣 {msg} {won} {pts_name}! (Balance: {pts[nick]:,})', channel)
                    return
            # No catch
            pts[nick] = max(0, pts.get(nick, 0) - 5)
            _save_points(channel, pts)
            self.send(f'🎣 {display_name} cast their line and... nothing! (-5 {pts_name}) Try again in {cd_secs}s!', channel)

        # ── Daily bonus ───────────────────────────────────────────────────────
        elif cmd_name == 'daily':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            claims = _load_daily_claims(channel)
            last   = claims.get(user_id, 0)
            now    = time.time()
            cooldown = 86400  # 24 hours
            if now - last < cooldown:
                remaining = int(cooldown - (now - last))
                h, m = divmod(remaining // 60, 60)
                self.send(f'⏰ {display_name}, you already claimed your daily! Come back in {h}h {m}m.', channel); return
            # Streak bonus
            streaks = claims.get(f'{user_id}_streak', 0)
            # If claimed within 48h, streak continues
            if now - last < 172800:
                streaks += 1
            else:
                streaks = 1
            claims[f'{user_id}_streak'] = streaks
            claims[user_id] = now
            _save_daily_claims(channel, claims)
            base_reward = int(cfg.get('points_config', {}).get('daily_reward', 100))
            streak_bonus = min(streaks - 1, 30) * int(base_reward * 0.1)
            total_reward = base_reward + streak_bonus
            pts = _load_points(channel)
            pts[nick] = pts.get(nick, 0) + total_reward
            _save_points(channel, pts)
            streak_str = f' (🔥 {streaks}-day streak! +{streak_bonus} bonus!)' if streaks > 1 else ''
            self.send(f'🎁 {display_name} claimed their daily {pts_name}! +{total_reward}{streak_str} (Balance: {pts[nick]:,})', channel)

        # ── Rob ───────────────────────────────────────────────────────────────
        elif cmd_name == 'rob':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            target_raw = query.strip().lstrip('@')
            if not target_raw:
                self.send('Usage: !rob @user', channel); return
            target = target_raw.lower()
            if target == nick:
                self.send(f'{display_name}, you can\'t rob yourself!', channel); return
            rob_key = f'__rob_{user_id}__'
            now = time.time()
            cd_secs = 300  # 5 min cooldown
            if now - state.cd.get(rob_key, 0) < cd_secs:
                remaining = int(cd_secs - (now - state.cd.get(rob_key, 0)))
                self.send(f'🦹 {display_name}, you\'re still hiding from the last robbery! ({remaining}s)', channel); return
            state.cd[rob_key] = now
            pts = _load_points(channel)
            rob_from = pts.get(target, 0)
            robber_pts = pts.get(nick, 0)
            if rob_from < 50:
                self.send(f'🦹 {display_name} tried to rob {target_raw} but they\'re broke!', channel); return
            rob_amount = min(int(rob_from * 0.3), random.randint(10, 200))
            roll = random.random()
            if roll < 0.45:  # 45% success
                pts[nick] = robber_pts + rob_amount
                pts[target] = rob_from - rob_amount
                # Bounty payout
                bounty_payout = state.bounties.pop(target, 0)
                if bounty_payout:
                    pts[nick] += bounty_payout
                    self.send(f'💀 Bounty collected! +{bounty_payout:,} {pts_name} bonus for robbing {target_raw}!', channel)
                _save_points(channel, pts)
                self.send(f'🦹 {display_name} successfully robbed {target_raw} for {rob_amount:,} {pts_name}!', channel)
            elif roll < 0.75:  # 30% caught, fine
                fine = min(robber_pts, rob_amount)
                pts[nick] = max(0, robber_pts - fine)
                pts[target] = rob_from + fine
                _save_points(channel, pts)
                self.send(f'👮 {display_name} was caught robbing {target_raw} and paid a fine of {fine:,} {pts_name}!', channel)
            else:  # 25% caught, timeout
                pts[nick] = max(0, robber_pts - rob_amount)
                _save_points(channel, pts)
                self.send(f'👮 {display_name} was arrested while robbing {target_raw}! -{rob_amount:,} {pts_name} and a 60s timeout!', channel)
                self.timeout(nick, channel, 60, 'Caught robbing')

        # ── Gift points ───────────────────────────────────────────────────────
        elif cmd_name == 'gift':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            parts = query.split()
            if len(parts) < 2:
                self.send(f'Usage: !gift @user <amount>', channel); return
            target = parts[0].lstrip('@').lower()
            try: amount = int(parts[1])
            except: self.send('Amount must be a number.', channel); return
            if amount <= 0:
                self.send('Amount must be positive.', channel); return
            pts = _load_points(channel)
            if pts.get(nick, 0) < amount:
                self.send(f'{display_name}, you only have {pts.get(nick, 0):,} {pts_name}.', channel); return
            pts[nick] = pts.get(nick, 0) - amount
            pts[target] = pts.get(target, 0) + amount
            _save_points(channel, pts)
            self.send(f'🎁 {display_name} gifted {amount:,} {pts_name} to {parts[0]}!', channel)

        # ── Loyalty shop ──────────────────────────────────────────────────────
        elif cmd_name == 'shop':
            shop = _load_shop(channel)
            if not shop:
                self.send('No shop items available yet. Ask a mod to add some via the dashboard!', channel); return
            items = ' | '.join(f'{i+1}) {item["name"]} ({item["cost"]:,} pts)' for i, item in enumerate(shop[:8]))
            self.send(f'🛒 Shop: {items} — Use !redeem <number>', channel)

        elif cmd_name == 'redeem':
            pts_cfg  = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points system is not enabled.', channel); return
            shop = _load_shop(channel)
            if not shop:
                self.send('No shop items available.', channel); return
            item_input = query.strip()
            item = None
            try:
                idx = int(item_input) - 1
                if 0 <= idx < len(shop):
                    item = shop[idx]
            except ValueError:
                item = next((s for s in shop if s['name'].lower() == item_input.lower()), None)
            if not item:
                self.send(f'Item not found. Use !shop to see available items.', channel); return
            pts = _load_points(channel)
            cost = int(item.get('cost', 0))
            if pts.get(nick, 0) < cost:
                self.send(f'{display_name}, you need {cost:,} {pts_name} to redeem "{item["name"]}".', channel); return
            pts[nick] = pts.get(nick, 0) - cost
            _save_points(channel, pts)
            if item.get('response'):
                resp = item['response'].replace('$(user)', display_name).replace('$(item)', item['name'])
                self.send(resp, channel)
            else:
                self.send(f'✅ {display_name} redeemed "{item["name"]}"! (-{cost:,} {pts_name}) Notify a mod to deliver your reward.', channel)

        # ── Lore ──────────────────────────────────────────────────────────────
        elif cmd_name == 'lore':
            lore = _load_lore(channel)
            parts = query.split(None, 1)
            sub = parts[0].lower() if parts else ''

            if sub == 'add' and _level_gte(user_level, 'moderator'):
                text_l = parts[1].strip() if len(parts) > 1 else ''
                if not text_l:
                    self.send('Usage: !lore add <lore text>', channel); return
                lore.append({'text': text_l, 'added_by': nick, 'ts': int(time.time())})
                _save_lore(channel, lore)
                self.send(f'📜 Lore #{len(lore)} added!', channel)

            elif sub == 'remove' and _level_gte(user_level, 'moderator'):
                try:
                    idx = int(parts[1].strip()) - 1
                    if 0 <= idx < len(lore):
                        del lore[idx]
                        _save_lore(channel, lore)
                        self.send(f'Lore #{idx+1} removed.', channel)
                    else:
                        self.send('Lore entry not found.', channel)
                except: self.send('Usage: !lore remove <number>', channel)

            else:
                if not lore:
                    self.send('No lore saved yet. Ask a mod to use !lore add <text>', channel); return
                if sub.isdigit():
                    idx = int(sub) - 1
                    entry = lore[idx] if 0 <= idx < len(lore) else random.choice(lore)
                else:
                    entry = random.choice(lore)
                self.send(f'📜 {entry["text"]}', channel)

        # ── Hangman ───────────────────────────────────────────────────────────
        elif cmd_name == 'hangman':
            parts = query.split(None, 1)
            sub = parts[0].lower() if parts else ''

            if sub == 'start' and _level_gte(user_level, 'moderator'):
                word = parts[1].strip().lower() if len(parts) > 1 else None
                if not word:
                    word_bank = ['python', 'twitch', 'gaming', 'streamer', 'keyboard',
                                 'champion', 'discord', 'pyjamas', 'unicorn', 'rainbow',
                                 'spaghetti', 'astronaut', 'dinosaur', 'chocolate', 'penguin']
                    word = random.choice(word_bank)
                state.hangman = {
                    'word': word, 'display': '_ ' * len(word),
                    'guesses': [], 'lives_left': 6, 'active': True,
                }
                blanks = '_ ' * len(word)
                self.send(f'🎮 Hangman started! Word ({len(word)} letters): {blanks.strip()} | Lives: 6 | Use !guess <letter or word>', channel)

            elif sub in ('stop', 'end') and _level_gte(user_level, 'moderator'):
                if state.hangman and state.hangman.get('active'):
                    word = state.hangman['word']
                    state.hangman = None
                    self.send(f'Hangman cancelled. The word was: {word}', channel)

            else:
                if state.hangman and state.hangman.get('active'):
                    w = state.hangman
                    self.send(f'🎮 Hangman: {w["display"].strip()} | Guessed: {", ".join(w["guesses"]) or "none"} | Lives: {w["lives_left"]}', channel)
                else:
                    self.send('No active hangman. A mod can use !hangman start [word] to begin.', channel)

        elif cmd_name == 'guess':
            if not state.hangman or not state.hangman.get('active'):
                return
            g = query.strip().lower()
            if not g:
                return
            w = state.hangman
            if g == w['word']:
                state.hangman = None
                self.send(f'🎉 {display_name} guessed it! The word was "{g}"!', channel)
                pts_cfg = cfg.get('points_config', {})
                if pts_cfg.get('enabled'):
                    reward = 50 * w.get('lives_left', 1)
                    pts = _load_points(channel)
                    pts[nick] = pts.get(nick, 0) + reward
                    _save_points(channel, pts)
                    self.send(f'+{reward} {pts_cfg.get("name", "points")} to {display_name}!', channel)
                return
            if len(g) != 1:
                self.send(f'{display_name}, guess one letter at a time or the full word!', channel); return
            if g in w['guesses']:
                self.send(f'{display_name}, "{g}" was already guessed!', channel); return
            w['guesses'].append(g)
            if g in w['word']:
                # Update display
                disp = ''
                for ch in w['word']:
                    disp += (ch + ' ') if ch in w['guesses'] else '_ '
                w['display'] = disp
                if '_' not in disp:
                    state.hangman = None
                    self.send(f'🎉 {display_name} completed the word: {w["word"]}!', channel)
                else:
                    self.send(f'✅ {display_name} — "{g}" is in the word! {disp.strip()} | Lives: {w["lives_left"]}', channel)
            else:
                w['lives_left'] -= 1
                stages = ['😵', '😣', '😟', '😰', '😱', '😨']
                stage = stages[6 - w['lives_left']] if w['lives_left'] >= 0 and w['lives_left'] < 6 else ''
                if w['lives_left'] <= 0:
                    state.hangman = None
                    self.send(f'💀 Hangman failed! The word was "{w["word"]}". Better luck next time!', channel)
                else:
                    self.send(f'{stage} {display_name} — "{g}" is NOT in the word! {w["display"].strip()} | Guessed: {", ".join(w["guesses"])} | Lives: {w["lives_left"]}', channel)

        # ── Anagram ───────────────────────────────────────────────────────────
        elif cmd_name == 'anagram':
            if _level_gte(user_level, 'moderator') and query.strip():
                word = query.strip().lower()
                scrambled_list = list(word)
                while ''.join(scrambled_list) == word:
                    random.shuffle(scrambled_list)
                scrambled = ''.join(scrambled_list)
                state.anagram = {'word': word, 'scrambled': scrambled, 'active': True, 'expiry': time.time() + 60}
                self.send(f'🔤 Anagram! Unscramble this word: {scrambled.upper()} ({len(word)} letters) — 60s!', channel)
            elif state.anagram and state.anagram.get('active'):
                g = query.strip().lower()
                if not g:
                    self.send(f'🔤 Current anagram: {state.anagram["scrambled"].upper()} ({len(state.anagram["word"])} letters)', channel)
                elif g == state.anagram['word']:
                    word = state.anagram['word']
                    state.anagram = None
                    pts_cfg = cfg.get('points_config', {})
                    if pts_cfg.get('enabled'):
                        reward = 75
                        pts = _load_points(channel)
                        pts[nick] = pts.get(nick, 0) + reward
                        _save_points(channel, pts)
                        self.send(f'🎉 {display_name} solved the anagram "{word}"! +{reward} {pts_cfg.get("name", "points")}!', channel)
                    else:
                        self.send(f'🎉 {display_name} solved the anagram! The word was "{word}"!', channel)
            elif _level_gte(user_level, 'moderator'):
                word_bank = ['python', 'gaming', 'stream', 'twitch', 'channel', 'follow',
                             'discord', 'dragon', 'castle', 'pirate', 'zombie', 'coffee']
                word = random.choice(word_bank)
                scrambled_list = list(word)
                while ''.join(scrambled_list) == word:
                    random.shuffle(scrambled_list)
                scrambled = ''.join(scrambled_list)
                state.anagram = {'word': word, 'scrambled': scrambled, 'active': True, 'expiry': time.time() + 60}
                self.send(f'🔤 Anagram! Unscramble: {scrambled.upper()} ({len(word)} letters) — 60s to guess!', channel)
            else:
                self.send('No active anagram. Ask a mod to start one!', channel)

        # ── Trust system ──────────────────────────────────────────────────────
        elif cmd_name == 'trust' and _level_gte(user_level, 'moderator'):
            target = query.strip().lstrip('@').lower()
            if not target:
                self.send('Usage: !trust @user', channel); return
            trusted = _load_trusted(channel)
            if target not in trusted:
                trusted.append(target)
                _save_trusted(channel, trusted)
            self.send(f'✅ {target} is now a trusted user.', channel)

        elif cmd_name == 'untrust' and _level_gte(user_level, 'moderator'):
            target = query.strip().lstrip('@').lower()
            if not target:
                self.send('Usage: !untrust @user', channel); return
            trusted = _load_trusted(channel)
            if target in trusted:
                trusted.remove(target)
                _save_trusted(channel, trusted)
                self.send(f'{target} removed from trusted users.', channel)
            else:
                self.send(f'{target} is not in the trusted list.', channel)

        elif cmd_name == 'trusted' and _level_gte(user_level, 'moderator'):
            trusted = _load_trusted(channel)
            if not trusted:
                self.send('No trusted users set.', channel)
            else:
                self.send(f'✅ Trusted users: {", ".join(trusted[:20])}', channel)

        elif cmd_name == 'hug':
            target = query.strip().lstrip('@') or 'the whole chat'
            msgs = [
                f'{display_name} gives @{target} a big warm hug! 🤗',
                f'@{target} just got a hug from {display_name}! 💙',
                f'{display_name} wraps @{target} in a cozy hug! 🫂',
            ]
            self.send(random.choice(msgs), channel)

        elif cmd_name == 'slap':
            target = query.strip().lstrip('@') or 'the air'
            msgs = [
                f'{display_name} slaps @{target} with a large trout! 🐟',
                f'@{target} got bopped by {display_name}! 👋',
                f'{display_name} whacks @{target} with a rubber chicken! 🐔',
            ]
            self.send(random.choice(msgs), channel)

        elif cmd_name == 'love':
            parts_q = query.strip().split()
            target = parts_q[0].lstrip('@') if parts_q else 'themselves'
            import hashlib as _hl
            seed_val = int(_hl.md5(f'{nick.lower()}{target.lower()}'.encode()).hexdigest(), 16) % 100
            pct = seed_val
            if pct >= 90: emoji = '💍'
            elif pct >= 70: emoji = '💕'
            elif pct >= 50: emoji = '❤️'
            elif pct >= 30: emoji = '💛'
            else: emoji = '💔'
            self.send(f'{emoji} The love between {display_name} and @{target} is {pct}%! {emoji}', channel)

        elif cmd_name == 'roulette':
            pts_cfg = cfg.get('points_config', {})
            if not pts_cfg.get('enabled'):
                self.send('Points are not enabled.', channel); return
            now = time.time()
            ucd = state.user_cd.setdefault('roulette', {})
            if now - ucd.get(nick, 0) < 60:
                remaining = int(60 - (now - ucd.get(nick, 0)))
                self.send(f'@{display_name}, roulette cooldown: {remaining}s', channel); return
            pts = _load_points(channel)
            balance = pts.get(nick, 0)
            if balance <= 0:
                self.send(f"@{display_name}, you have no {pts_cfg.get('name','points')} to risk!", channel); return
            amount_str = query.strip().lower()
            if amount_str in ('all', 'max'):
                amount = balance
            else:
                try:
                    amount = int(amount_str)
                except (ValueError, TypeError):
                    self.send(f'Usage: !roulette <amount|all>', channel); return
            if amount <= 0 or amount > balance:
                self.send(f"@{display_name}, invalid amount. You have {balance:,} {pts_cfg.get('name','points')}.", channel); return
            ucd[nick] = now
            roll = random.randint(1, 6)
            if roll == 1:
                pts[nick] = 0
                _save_points(channel, pts)
                self.send(f'🔫 BANG! @{display_name} pulled the trigger and lost ALL their {pts_cfg.get("name","points")}! 💀 (rolled {roll}/6)', channel)
            else:
                bonus = max(1, amount // 5)
                pts[nick] = balance + bonus
                _save_points(channel, pts)
                self.send(f'🔫 *click* @{display_name} survived! +{bonus:,} {pts_cfg.get("name","points")} bonus! (rolled {roll}/6)', channel)

        elif cmd_name == 'bitleaderboard':
            bits_data = _load_bits_log(channel)
            if not bits_data:
                self.send('No bit data recorded yet.', channel); return
            top = sorted(bits_data.items(), key=lambda x: x[1], reverse=True)[:5]
            parts = [f'#{i+1} {n}: {v:,}' for i, (n, v) in enumerate(top)]
            self.send(f'🏆 Top Bit Donors: {" | ".join(parts)}', channel)

        elif cmd_name == 'sublists':
            subs_data = _load_subs_log(channel)
            if not subs_data:
                self.send('No sub data recorded yet.', channel); return
            top = sorted(subs_data.items(), key=lambda x: x[1].get('months', 0), reverse=True)[:5]
            parts = [f'#{i+1} {n} ({v.get("months",1)}mo)' for i, (n, v) in enumerate(top)]
            self.send(f'💜 Top Subscribers: {" | ".join(parts)}', channel)

        elif cmd_name == 'recap':
            if not _level_gte(user_level, 'moderator'):
                self.send(f'@{display_name}, only moderators can view the recap.', channel); return
            stats = state.stream_stats
            if not stats:
                self.send('No stream stats available yet.', channel); return
            peak = stats.get('peak_viewers', 0)
            subs = len(stats.get('subs_received', []))
            raids = len(stats.get('raids_received', []))
            pts_given = stats.get('points_distributed', 0)
            msg_counts = stats.get('message_counts', {})
            top_chatter = max(msg_counts, key=msg_counts.get) if msg_counts else 'N/A'
            top_count = msg_counts.get(top_chatter, 0)
            pts_cfg = cfg.get('points_config', {})
            self.send(f'📊 Stream Recap | Peak: {peak} viewers | Subs: {subs} | Raids: {raids} | {pts_cfg.get("name","Points")} given: {pts_given:,} | Top chatter: {top_chatter} ({top_count} msgs)', channel)

        elif cmd_name == 'boss':
            sub_cmd = query.strip().lower().split()[0] if query.strip() else ''
            boss_cfg = cfg.get('boss_battle', {'enabled': True, 'entry_time': 60, 'cost': 50, 'win_multiplier': 3, 'cooldown': 3600})
            if sub_cmd == 'start':
                if not _level_gte(user_level, 'moderator'):
                    self.send(f'@{display_name}, only mods can start a boss battle.', channel); return
                if not boss_cfg.get('enabled', True):
                    self.send('Boss battles are disabled.', channel); return
                if time.time() < state.boss_cd:
                    self.send(f'Boss battle on cooldown for {int(state.boss_cd - time.time())}s.', channel); return
                if state.boss_battle and state.boss_battle.get('active'):
                    self.send('A boss battle is already active!', channel); return
                parts_b = query.strip().split(None, 1)
                boss_name = parts_b[1] if len(parts_b) > 1 else 'The Dark Boss'
                cost = boss_cfg.get('cost', 50)
                state.boss_battle = {
                    'active': True, 'phase': 'joining',
                    'boss_name': boss_name,
                    'boss_hp': 1000, 'boss_max_hp': 1000,
                    'participants': {},
                    'expiry': time.time() + boss_cfg.get('entry_time', 60),
                    'cost': cost
                }
                self.send(f'⚔️ {boss_name} has appeared! Type !fight to join the battle for {cost} {cfg.get("points_config",{}).get("name","points")}! You have {boss_cfg.get("entry_time",60)}s!', channel)
            else:
                if not state.boss_battle:
                    self.send('No boss battle is active. Mods can start one with !boss start [name]', channel); return
                self.send(f'⚔️ Boss: {state.boss_battle["boss_name"]} | HP: {state.boss_battle["boss_hp"]}/{state.boss_battle["boss_max_hp"]} | Fighters: {len(state.boss_battle["participants"])} | Phase: {state.boss_battle["phase"]}', channel)

        elif cmd_name == 'fight':
            if not state.boss_battle or not state.boss_battle.get('active') or state.boss_battle.get('phase') != 'joining':
                self.send(f'@{display_name}, no boss battle is currently accepting fighters.', channel); return
            if nick in state.boss_battle['participants']:
                self.send(f'@{display_name}, you are already in the battle!', channel); return
            pts_cfg = cfg.get('points_config', {})
            if not pts_cfg.get('enabled'):
                self.send('Points are not enabled.', channel); return
            pts = _load_points(channel)
            cost = state.boss_battle.get('cost', 50)
            if pts.get(nick, 0) < cost:
                self.send(f'@{display_name}, you need {cost} {pts_cfg.get("name","points")} to join!', channel); return
            pts[nick] = pts.get(nick, 0) - cost
            _save_points(channel, pts)
            state.boss_battle['participants'][nick] = {'display': display_name, 'damage': 0}
            self.send(f'⚔️ @{display_name} joins the battle! ({len(state.boss_battle["participants"])} fighters)', channel)

        elif cmd_name == 'numguess':
            parts_ng = query.strip().split()
            if parts_ng and parts_ng[0].lower() == 'start':
                if not _level_gte(user_level, 'moderator'):
                    self.send(f'@{display_name}, only mods can start a number guessing game.', channel); return
                if state.numguess and state.numguess.get('active'):
                    self.send('A number guessing game is already active!', channel); return
                try:
                    min_val = int(parts_ng[1]) if len(parts_ng) > 1 else 1
                    max_val = int(parts_ng[2]) if len(parts_ng) > 2 else 100
                except (ValueError, IndexError):
                    min_val, max_val = 1, 100
                answer = random.randint(min_val, max_val)
                state.numguess = {'active': True, 'min': min_val, 'max': max_val, 'answer': answer, 'expiry': time.time() + 120, 'guesses': 0}
                self.send(f'🔢 Guess a number between {min_val} and {max_val}! Use !numguess <number>. 2 minutes!', channel)
            elif parts_ng and parts_ng[0].lower() == 'stop':
                if not _level_gte(user_level, 'moderator'): return
                if state.numguess:
                    ans = state.numguess.get('answer', '?')
                    state.numguess = None
                    self.send(f'Number guessing game ended. The answer was {ans}.', channel)
            else:
                # It's a guess
                if not state.numguess or not state.numguess.get('active'):
                    self.send('No number guessing game is active. Mods can start one with !numguess start [min] [max]', channel); return
                try:
                    guess = int(parts_ng[0]) if parts_ng else 0
                except ValueError:
                    self.send(f'@{display_name}, enter a valid number!', channel); return
                state.numguess['guesses'] = state.numguess.get('guesses', 0) + 1
                answer = state.numguess['answer']
                if guess == answer:
                    pts_cfg = cfg.get('points_config', {})
                    reward = 200
                    if pts_cfg.get('enabled'):
                        pts = _load_points(channel)
                        pts[nick] = pts.get(nick, 0) + reward
                        _save_points(channel, pts)
                    state.numguess = None
                    self.send(f'🎉 @{display_name} guessed correctly! The answer was {answer}! +{reward} {pts_cfg.get("name","points")}!', channel)
                elif guess < answer:
                    self.send(f'@{display_name}, go higher! ⬆️', channel)
                else:
                    self.send(f'@{display_name}, go lower! ⬇️', channel)

        elif cmd_name == 'race':
            parts_r = query.strip().split(None, 1)
            sub_r = parts_r[0].lower() if parts_r else ''
            if sub_r == 'start':
                if not _level_gte(user_level, 'moderator'):
                    self.send(f'@{display_name}, only mods can start a race.', channel); return
                if state.chat_race and state.chat_race.get('active'):
                    self.send('A race is already active!', channel); return
                word_banks = ['CUBSOFTWARE', 'POGCHAMP', 'LETSGO', 'GAMING', 'HYPE', 'WINNER', 'TWITCH', 'CLUTCH', 'NOICE', 'KAPOW']
                phrase = parts_r[1].upper() if len(parts_r) > 1 else random.choice(word_banks)
                state.chat_race = {'active': True, 'target': phrase, 'expiry': time.time() + 60}
                self.send(f'🏁 CHAT RACE! First to type exactly: {phrase} | 60 seconds! GO!', channel)
            elif sub_r == 'stop':
                if not _level_gte(user_level, 'moderator'): return
                state.chat_race = None
                self.send('Race cancelled.', channel)
            else:
                self.send('Usage: !race start [word]', channel)

        elif cmd_name == 'goal':
            parts_g = query.strip().split(None, 2)
            sub_g = parts_g[0].lower() if parts_g else 'show'
            if sub_g == 'set':
                if not _level_gte(user_level, 'moderator'):
                    self.send(f'@{display_name}, only mods can set goals.', channel); return
                try:
                    target_amt = int(parts_g[1])
                    reward_text = parts_g[2] if len(parts_g) > 2 else 'Special reward!'
                except (ValueError, IndexError):
                    self.send('Usage: !goal set <amount> <reward description>', channel); return
                state.community_goal = {'active': True, 'target': target_amt, 'current': 0, 'reward': reward_text, 'contributors': {}}
                pts_cfg = cfg.get('points_config', {})
                self.send(f'🎯 Community Goal set! Contribute {target_amt:,} {pts_cfg.get("name","points")} for: {reward_text}! Use !contribute <amount>!', channel)
            elif sub_g in ('show', 'status', ''):
                if not state.community_goal:
                    self.send('No community goal is active. Mods can set one with !goal set <amount> <reward>', channel); return
                g = state.community_goal
                pct = int(g['current'] / g['target'] * 100) if g['target'] else 0
                bar = '█' * (pct // 10) + '░' * (10 - pct // 10)
                self.send(f'🎯 Goal: [{bar}] {g["current"]:,}/{g["target"]:,} ({pct}%) | Reward: {g["reward"]}', channel)
            elif sub_g == 'end':
                if not _level_gte(user_level, 'moderator'): return
                state.community_goal = None
                self.send('Community goal ended.', channel)

        elif cmd_name == 'contribute':
            if not state.community_goal or not state.community_goal.get('active'):
                self.send(f'@{display_name}, no community goal is active.', channel); return
            pts_cfg = cfg.get('points_config', {})
            if not pts_cfg.get('enabled'):
                self.send('Points are not enabled.', channel); return
            try:
                amount = int(query.strip())
                if amount <= 0: raise ValueError
            except ValueError:
                self.send(f'Usage: !contribute <amount>', channel); return
            pts = _load_points(channel)
            balance = pts.get(nick, 0)
            if balance < amount:
                self.send(f"@{display_name}, you only have {balance:,} {pts_cfg.get('name','points')}.", channel); return
            pts[nick] = balance - amount
            _save_points(channel, pts)
            g = state.community_goal
            g['current'] = g.get('current', 0) + amount
            g['contributors'][nick] = g['contributors'].get(nick, 0) + amount
            pct = int(g['current'] / g['target'] * 100) if g['target'] else 0
            if g['current'] >= g['target']:
                self.send(f'🎉 GOAL REACHED! {display_name} contributed {amount:,} to reach {g["target"]:,}! Reward: {g["reward"]} 🎊', channel)
                state.community_goal['active'] = False
            else:
                self.send(f'@{display_name} contributed {amount:,}! Goal: {g["current"]:,}/{g["target"]:,} ({pct}%)', channel)

        elif cmd_name == 'challenge':
            pts_cfg = cfg.get('points_config', {})
            if not pts_cfg.get('enabled'):
                self.send('Points are not enabled.', channel); return
            parts_ch = query.strip().split()
            if not parts_ch:
                self.send('Usage: !challenge @user <amount>', channel); return
            target_ch = parts_ch[0].lstrip('@').lower()
            if target_ch == nick:
                self.send(f'@{display_name}, you cannot challenge yourself!', channel); return
            try:
                ch_amount = int(parts_ch[1]) if len(parts_ch) > 1 else 50
            except ValueError:
                self.send('Usage: !challenge @user <amount>', channel); return
            pts = _load_points(channel)
            if pts.get(nick, 0) < ch_amount:
                self.send(f"@{display_name}, you need {ch_amount:,} {pts_cfg.get('name','points')} to challenge.", channel); return
            if state.challenge and state.challenge.get('active'):
                self.send('A challenge is already pending!', channel); return
            state.challenge = {'active': True, 'challenger': nick, 'challenger_display': display_name, 'target': target_ch, 'amount': ch_amount, 'expiry': time.time() + 60}
            self.send(f'🎮 @{display_name} challenges @{target_ch} to Rock Paper Scissors for {ch_amount:,} {pts_cfg.get("name","points")}! Type !accept to play!', channel)

        elif cmd_name == 'alias':
            if not _level_gte(user_level, 'moderator'):
                self.send(f'@{display_name}, only moderators can manage aliases.', channel); return
            parts_al = query.strip().split()
            if not parts_al or parts_al[0].lower() not in ('add', 'remove', 'list'):
                self.send('Usage: !alias add/remove/list !command [!alias]', channel); return
            sub_al = parts_al[0].lower()
            if sub_al == 'list':
                if len(parts_al) < 2:
                    self.send('Usage: !alias list !command', channel); return
                cmd_key = parts_al[1].lstrip('!')
                commands = cfg.get('commands', {})
                if cmd_key not in commands:
                    self.send(f'Command !{cmd_key} not found.', channel); return
                aliases = commands[cmd_key].get('aliases', [])
                self.send(f'Aliases for !{cmd_key}: {", ".join("!"+a for a in aliases) if aliases else "none"}', channel)
            elif sub_al == 'add':
                if len(parts_al) < 3:
                    self.send('Usage: !alias add !command !alias_name', channel); return
                cmd_key = parts_al[1].lstrip('!')
                alias_name = parts_al[2].lstrip('!').lower()
                commands = cfg.get('commands', {})
                if cmd_key not in commands:
                    self.send(f'Command !{cmd_key} not found.', channel); return
                aliases = commands[cmd_key].setdefault('aliases', [])
                if alias_name not in aliases:
                    aliases.append(alias_name)
                    save_channel_config(channel, cfg)
                self.send(f'✅ !{alias_name} is now an alias for !{cmd_key}', channel)
            elif sub_al == 'remove':
                if len(parts_al) < 3:
                    self.send('Usage: !alias remove !command !alias_name', channel); return
                cmd_key = parts_al[1].lstrip('!')
                alias_name = parts_al[2].lstrip('!').lower()
                commands = cfg.get('commands', {})
                if cmd_key in commands and alias_name in commands[cmd_key].get('aliases', []):
                    commands[cmd_key]['aliases'].remove(alias_name)
                    save_channel_config(channel, cfg)
                self.send(f'✅ Alias !{alias_name} removed.', channel)

        # ── Watchlist ─────────────────────────────────────────────────────────
        elif cmd_name == 'watchlist' and _level_gte(user_level, 'moderator'):
            wl = _load_watchlist(channel)
            if not wl:
                self.send('Watchlist is empty.', channel)
            else:
                items = ' | '.join(f'{e["nick"]} ({e.get("reason","no reason")})' for e in wl[:10])
                self.send(f'👁 Watchlist ({len(wl)}): {items}', channel)

        elif cmd_name == 'addwatch' and _level_gte(user_level, 'moderator'):
            parts = query.split(None, 1)
            if not parts:
                self.send('Usage: !addwatch @user [reason]', channel); return
            target = parts[0].lstrip('@').lower()
            reason = parts[1].strip() if len(parts) > 1 else 'No reason given'
            wl = _load_watchlist(channel)
            if any(e['nick'] == target for e in wl):
                self.send(f'{target} is already on the watchlist.', channel); return
            wl.append({'nick': target, 'reason': reason, 'by': nick, 'ts': int(time.time())})
            _save_watchlist(channel, wl)
            self.send(f'👁 {target} added to watchlist: {reason}', channel)

        elif cmd_name == 'delwatch' and _level_gte(user_level, 'moderator'):
            target = query.strip().lstrip('@').lower()
            wl = _load_watchlist(channel)
            new_wl = [e for e in wl if e['nick'] != target]
            if len(new_wl) < len(wl):
                _save_watchlist(channel, new_wl)
                self.send(f'{target} removed from watchlist.', channel)
            else:
                self.send(f'{target} is not on the watchlist.', channel)

        # ── Chat mode ─────────────────────────────────────────────────────────
        elif cmd_name == 'chatmode' and _level_gte(user_level, 'moderator'):
            mode = query.split()[0].lower() if query.strip() else ''
            args = query.split()[1:] if len(query.split()) > 1 else []
            if mode in ('slow', 'slowmode'):
                secs = int(args[0]) if args and args[0].isdigit() else 30
                self._raw(f'PRIVMSG #{channel} :/slow {secs}')
                self.send(f'💬 Slow mode enabled ({secs}s).', channel)
            elif mode in ('slowoff', 'noslow'):
                self._raw(f'PRIVMSG #{channel} :/slowoff')
                self.send('💬 Slow mode disabled.', channel)
            elif mode in ('sub', 'subonly', 'subscribers'):
                self._raw(f'PRIVMSG #{channel} :/subscribers')
                self.send('💬 Sub-only mode enabled.', channel)
            elif mode in ('suboff', 'nosubonly'):
                self._raw(f'PRIVMSG #{channel} :/subscribersoff')
                self.send('💬 Sub-only mode disabled.', channel)
            elif mode in ('emote', 'emoteonly'):
                self._raw(f'PRIVMSG #{channel} :/emoteonly')
                self.send('💬 Emote-only mode enabled.', channel)
            elif mode in ('emoteoff', 'noemote'):
                self._raw(f'PRIVMSG #{channel} :/emoteonlyoff')
                self.send('💬 Emote-only mode disabled.', channel)
            elif mode in ('followers', 'followersonly'):
                mins = int(args[0]) if args and args[0].isdigit() else 0
                self._raw(f'PRIVMSG #{channel} :/followers {mins}')
                self.send(f'💬 Followers-only mode enabled ({mins}m follow time).', channel)
            elif mode in ('followersoff', 'nofollowers'):
                self._raw(f'PRIVMSG #{channel} :/followersoff')
                self.send('💬 Followers-only mode disabled.', channel)
            elif mode == 'clear':
                self._raw(f'PRIVMSG #{channel} :/clear')
            elif mode == 'off':
                for cmd in ('slowoff', 'subscribersoff', 'emoteonlyoff', 'followersoff'):
                    self._raw(f'PRIVMSG #{channel} :/{cmd}')
                self.send('💬 All chat modes disabled.', channel)
            else:
                self.send('Usage: !chatmode [slow <secs>|slowoff|sub|suboff|emote|emoteoff|followers [mins]|followersoff|clear|off]', channel)

        # ── Stream marker ─────────────────────────────────────────────────────
        elif cmd_name == 'marker' and _level_gte(user_level, 'moderator'):
            description = query.strip() or 'CubAssist marker'
            self.send(f'📌 Stream marker requested: {description} (use the dashboard to create markers via Helix API)', channel)

        # ── Overlay control ───────────────────────────────────────────────────
        elif cmd_name == 'overlay' and _level_gte(user_level, 'moderator'):
            parts    = query.split(None, 1)
            subcmd   = parts[0].lower() if parts else ''
            subargs  = parts[1].strip() if len(parts) > 1 else ''

            if not subcmd:
                self.send('Usage: !overlay [timer|goal|counter|title|ticker|widget|effect|scene]', channel)
                return

            # !overlay scene [scene_id] — configure which scene to control
            if subcmd == 'scene':
                if subargs:
                    cfg.setdefault('overlay_scenes', {})['default'] = subargs.strip()
                    save_channel_config(channel, cfg)
                    self.send(f'✅ Overlay scene set to: {subargs.strip()}', channel)
                else:
                    sid = cfg.get('overlay_scenes', {}).get('default', '')
                    self.send(f'Current scene ID: {sid or "(none)"}. Use !overlay scene <id> to set it.', channel)
                return

            scene_id = cfg.get('overlay_scenes', {}).get('default', '').strip()
            if not scene_id:
                self.send('No overlay scene configured. Use !overlay scene <scene_id> first, or set it in the dashboard.', channel)
                return

            # !overlay timer <duration|off>
            if subcmd == 'timer':
                raw = subargs.lower().strip()
                if raw in ('off', 'hide', 'stop', '0'):
                    ok = self._patch_overlay_scene(channel, {'show_countdown': False})
                else:
                    ms = _parse_duration_ms(raw)
                    if ms is None:
                        self.send('Usage: !overlay timer <duration> — e.g. 5m, 1h30m, 90s, 5:00', channel)
                        return
                    ok = self._patch_overlay_scene(channel, {
                        'show_countdown': True,
                        'countdown_to': int((time.time() + ms / 1000) * 1000),
                    })
                self.send('⏱ Timer updated.' if ok else '⚠️ Could not update overlay — check scene ID in dashboard.', channel)

            # !overlay goal <current> <max> [label] | +N | off
            elif subcmd == 'goal':
                raw = subargs.strip()
                if not raw or raw.lower() in ('off', 'hide'):
                    ok = self._patch_overlay_scene(channel, {'goal_bar': False})
                    self.send('🎯 Goal bar hidden.' if ok else '⚠️ Could not update overlay.', channel)
                elif raw[0] in ('+', '-'):
                    try:
                        delta = int(raw)
                        import sys as _sys
                        om = _sys.modules.get('overlays_blueprint')
                        if om:
                            sd = om.load_overlays_data().get('scenes', {}).get(scene_id, {})
                            cur = int(sd.get('config', {}).get('goal_bar_current', 0))
                            new_val = max(0, cur + delta)
                            ok = self._patch_overlay_scene(channel, {'goal_bar': True, 'goal_bar_current': new_val})
                            self.send(f'🎯 Goal: {new_val}' if ok else '⚠️ Could not update overlay.', channel)
                        else:
                            self.send('⚠️ Overlay module not available.', channel)
                    except ValueError:
                        self.send('Usage: !overlay goal +10', channel)
                else:
                    gp = raw.split(None, 2)
                    try:
                        curr_v = int(gp[0])
                        max_v  = int(gp[1]) if len(gp) > 1 else curr_v
                        upd    = {'goal_bar': True, 'goal_bar_current': curr_v, 'goal_bar_max': max_v}
                        if len(gp) > 2: upd['goal_bar_title'] = gp[2]
                        ok = self._patch_overlay_scene(channel, upd)
                        self.send('🎯 Goal updated.' if ok else '⚠️ Could not update overlay.', channel)
                    except (ValueError, IndexError):
                        self.send('Usage: !overlay goal <current> <max> [label]', channel)

            # !overlay counter +1 | -1 | reset | <value> [label]
            elif subcmd == 'counter':
                raw = subargs.strip()
                if not raw or raw.lower() in ('off', 'hide'):
                    ok = self._patch_overlay_scene(channel, {'counter_widget': False})
                    self.send('🔢 Counter hidden.' if ok else '⚠️ Could not update overlay.', channel)
                elif raw.lower() in ('reset', 'clear'):
                    ok = self._patch_overlay_scene(channel, {'counter_widget': True, 'counter_value': 0})
                    self.send('🔢 Counter reset.' if ok else '⚠️ Could not update overlay.', channel)
                elif raw[0] in ('+', '-'):
                    try:
                        delta = int(raw)
                        import sys as _sys
                        om = _sys.modules.get('overlays_blueprint')
                        if om:
                            sd  = om.load_overlays_data().get('scenes', {}).get(scene_id, {})
                            cur = int(sd.get('config', {}).get('counter_value', 0))
                            ok  = self._patch_overlay_scene(channel, {'counter_widget': True, 'counter_value': cur + delta})
                            self.send(f'🔢 Counter: {cur + delta}' if ok else '⚠️ Could not update overlay.', channel)
                        else:
                            self.send('⚠️ Overlay module not available.', channel)
                    except ValueError:
                        self.send('Usage: !overlay counter +1', channel)
                else:
                    cp = raw.split(None, 1)
                    try:
                        val = int(cp[0])
                        upd = {'counter_widget': True, 'counter_value': val}
                        if len(cp) > 1: upd['counter_label'] = cp[1]
                        ok = self._patch_overlay_scene(channel, upd)
                        self.send('🔢 Counter updated.' if ok else '⚠️ Could not update overlay.', channel)
                    except ValueError:
                        self.send('Usage: !overlay counter <value> [label]', channel)

            # !overlay title <text>
            elif subcmd == 'title':
                if not subargs:
                    self.send('Usage: !overlay title <text>', channel); return
                ok = self._patch_overlay_scene(channel, {'title': subargs})
                self.send('📺 Title updated.' if ok else '⚠️ Could not update overlay.', channel)

            # !overlay subtitle <text>
            elif subcmd == 'subtitle':
                if not subargs:
                    self.send('Usage: !overlay subtitle <text>', channel); return
                ok = self._patch_overlay_scene(channel, {'subtitle': subargs})
                self.send('📺 Subtitle updated.' if ok else '⚠️ Could not update overlay.', channel)

            # !overlay ticker <text|off>
            elif subcmd == 'ticker':
                raw = subargs.strip()
                if not raw or raw.lower() in ('off', 'hide'):
                    ok = self._patch_overlay_scene(channel, {'ticker_widget': False})
                else:
                    ok = self._patch_overlay_scene(channel, {'ticker_widget': True, 'ticker_label': raw})
                self.send('📰 Ticker updated.' if ok else '⚠️ Could not update overlay.', channel)

            # !overlay widget <name> on|off
            elif subcmd == 'widget':
                wp = subargs.split()
                if len(wp) < 2:
                    self.send('Usage: !overlay widget <name> on/off — names: clock, goal, counter, ticker, qr, uptime, nowplaying, timer', channel)
                    return
                _widget_keys = {
                    'clock': 'clock_widget', 'goal': 'goal_bar', 'counter': 'counter_widget',
                    'ticker': 'ticker_widget', 'qr': 'qr_widget', 'uptime': 'uptime_widget',
                    'nowplaying': 'nowplaying_widget', 'timer': 'show_countdown',
                }
                wkey = _widget_keys.get(wp[0].lower())
                if not wkey:
                    self.send(f'Unknown widget "{wp[0]}". Try: clock, goal, counter, ticker, qr, uptime, nowplaying, timer', channel)
                    return
                wstate = wp[1].lower() in ('on', 'true', '1', 'show', 'yes')
                ok = self._patch_overlay_scene(channel, {wkey: wstate})
                onoff = 'on' if wstate else 'off'
                self.send(f'Widget {wp[0]} turned {onoff}.' if ok else '⚠️ Could not update overlay.', channel)

            # !overlay effect <name|none>
            elif subcmd == 'effect':
                raw = subargs.strip().lower()
                _effects = {'starfield', 'matrix', 'rain', 'snow', 'confetti', 'fire', 'bubbles', 'hearts'}
                if raw in ('none', 'off', 'clear', ''):
                    ok = self._patch_overlay_scene(channel, {'background_effect': ''})
                elif raw in _effects:
                    ok = self._patch_overlay_scene(channel, {'background_effect': raw})
                else:
                    self.send(f'Unknown effect. Try: {", ".join(sorted(_effects))}, or none', channel)
                    return
                self.send(f'✨ Effect set to {raw or "none"}.' if ok else '⚠️ Could not update overlay.', channel)

            else:
                self.send('Usage: !overlay [timer|goal|counter|title|subtitle|ticker|widget|effect|scene]', channel)

        # ── Blackjack ─────────────────────────────────────────────────────
        elif cmd_name == 'blackjack':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled to play blackjack.', channel); return
            if nick in state.blackjack:
                g = state.blackjack[nick]
                hand_str = ', '.join(g['hand'])
                self.send(f'@{display_name} — your hand: {hand_str} (value: {self._bj_value(g["hand"])}) | !hit, !stand, !double', channel); return
            try: bet = max(1, int(query.strip()))
            except: self.send('Usage: !blackjack <amount>', channel); return
            pts = _load_points(channel)
            if pts.get(nick, 0) < bet:
                self.send(f'@{display_name}, not enough {pts_name}.', channel); return
            pts[nick] -= bet
            _save_points(channel, pts)
            deck = self._bj_deck()
            hand = [deck.pop(), deck.pop()]
            dealer = [deck.pop(), deck.pop()]
            state.blackjack[nick] = {'hand': hand, 'dealer': dealer, 'deck': deck, 'bet': bet}
            val = self._bj_value(hand)
            self.send(f'🃏 {display_name} — Hand: {", ".join(hand)} ({val}) | Dealer shows: {dealer[0]} | !hit, !stand, !double', channel)
            if val == 21:
                win = int(bet * 1.5)
                pts = _load_points(channel)
                pts[nick] = pts.get(nick, 0) + bet + win
                _save_points(channel, pts)
                del state.blackjack[nick]
                self.send(f'🃏 Blackjack! @{display_name} wins {win} {pts_name}! 🎉', channel)

        elif cmd_name == 'hit':
            if nick not in state.blackjack: return
            g = state.blackjack[nick]
            g['hand'].append(g['deck'].pop())
            val = self._bj_value(g['hand'])
            if val > 21:
                del state.blackjack[nick]
                self.send(f'🃏 @{display_name} busts with {val}! Hand: {", ".join(g["hand"])}. Better luck next time!', channel)
            elif val == 21:
                self._bj_stand(nick, display_name, channel, state, cfg)
            else:
                self.send(f'🃏 @{display_name} — Hand: {", ".join(g["hand"])} ({val}) | !hit, !stand', channel)

        elif cmd_name == 'stand':
            if nick not in state.blackjack: return
            self._bj_stand(nick, display_name, channel, state, cfg)

        elif cmd_name == 'double':
            if nick not in state.blackjack: return
            g = state.blackjack[nick]
            pts_cfg = cfg.get('points_config', {})
            pts = _load_points(channel)
            if pts.get(nick, 0) < g['bet']:
                self.send(f'@{display_name}, not enough {pts_cfg.get("name","points")} to double.', channel); return
            pts[nick] -= g['bet']
            g['bet'] *= 2
            _save_points(channel, pts)
            g['hand'].append(g['deck'].pop())
            val = self._bj_value(g['hand'])
            if val > 21:
                del state.blackjack[nick]
                self.send(f'🃏 @{display_name} doubled and busts with {val}! Hand: {", ".join(g["hand"])}.', channel)
            else:
                self._bj_stand(nick, display_name, channel, state, cfg)

        # ── Dice ──────────────────────────────────────────────────────────
        elif cmd_name == 'dice':
            expr = query.strip().lower() or '1d6'
            m = re.match(r'^(\d+)d(\d+)$', expr)
            if not m:
                self.send('Usage: !dice [NdN] e.g. !dice 2d6', channel); return
            n_dice, sides = int(m.group(1)), int(m.group(2))
            n_dice = min(max(n_dice, 1), 10)
            sides  = min(max(sides, 2), 100)
            rolls  = [random.randint(1, sides) for _ in range(n_dice)]
            total  = sum(rolls)
            roll_str = ', '.join(str(r) for r in rolls)
            self.send(f'🎲 @{display_name} rolled {n_dice}d{sides}: [{roll_str}] = {total}', channel)
            pts_cfg = cfg.get('points_config', {})
            if pts_cfg.get('enabled') and sides == 6 and n_dice == 1 and total == 6:
                reward = 25
                pts = _load_points(channel)
                pts[nick] = pts.get(nick, 0) + reward
                _save_points(channel, pts)
                self.send(f'🎲 Natural 6! +{reward} {pts_cfg.get("name","points")} bonus!', channel)

        # ── High / Low ────────────────────────────────────────────────────
        elif cmd_name in ('highlow', 'hl'):
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled to play high/low.', channel); return
            ucd = state.user_cd.setdefault('highlow', {})
            now2 = time.time()
            if now2 - ucd.get(nick, 0) < 10:
                return
            ucd[nick] = now2
            if not state.highlow:
                state.highlow = {'current': random.randint(1, 100)}
            curr = state.highlow['current']
            guess = query.strip().lower()
            if guess not in ('h', 'l', 'high', 'low', 'higher', 'lower'):
                self.send(f'🔢 Current number: {curr} | Guess: !hl high or !hl low', channel); return
            nxt = random.randint(1, 100)
            pts = _load_points(channel)
            reward = 30
            if guess in ('h', 'high', 'higher'):
                won = nxt > curr
            else:
                won = nxt < curr
            if nxt == curr:
                self.send(f'🔢 Same number ({nxt})! No change. New number: {nxt}', channel)
            elif won:
                pts[nick] = pts.get(nick, 0) + reward
                _save_points(channel, pts)
                self.send(f'🔢 {display_name} got it! {curr} → {nxt}. +{reward} {pts_name}!', channel)
            else:
                pts[nick] = max(0, pts.get(nick, 0) - reward)
                _save_points(channel, pts)
                self.send(f'🔢 Wrong! {curr} → {nxt}. -{reward} {pts_name}.', channel)
            state.highlow = {'current': nxt}

        # ── Word Chain ────────────────────────────────────────────────────
        elif cmd_name == 'wordchain':
            parts_wc = query.strip().split(None, 1)
            sub_wc = parts_wc[0].lower() if parts_wc else ''
            if sub_wc == 'start' and _level_gte(user_level, 'moderator'):
                seed = parts_wc[1].strip().lower() if len(parts_wc) > 1 else random.choice(['apple','banana','cat','dragon','eagle'])
                state.wordchain = {'last_word': seed, 'last_nick': '', 'active': True, 'used': {seed}}
                self.send(f'🔗 Word Chain started! Last word: "{seed}" — type a word starting with "{seed[-1].upper()}"!', channel)
            elif sub_wc in ('stop', 'end') and _level_gte(user_level, 'moderator'):
                state.wordchain = None
                self.send('Word chain ended.', channel)
            elif state.wordchain and state.wordchain.get('active'):
                word = sub_wc.strip().lower()
                wc = state.wordchain
                if not word.isalpha():
                    return
                if word[0] != wc['last_word'][-1]:
                    self.send(f'@{display_name}, your word must start with "{wc["last_word"][-1].upper()}"!', channel); return
                if word in wc.get('used', set()):
                    self.send(f'@{display_name}, "{word}" was already used!', channel); return
                if wc.get('last_nick') == nick:
                    self.send(f'@{display_name}, wait for someone else to go!', channel); return
                wc['used'].add(word)
                wc['last_word'] = word
                wc['last_nick'] = nick
                pts_cfg = cfg.get('points_config', {})
                if pts_cfg.get('enabled'):
                    pts = _load_points(channel)
                    pts[nick] = pts.get(nick, 0) + 5
                    _save_points(channel, pts)
                self.send(f'🔗 {display_name}: "{word}" ✅ | Next: word starting with "{word[-1].upper()}"', channel)
            else:
                self.send('No word chain active. A mod can use !wordchain start [word].', channel)

        # ── Type Race ─────────────────────────────────────────────────────
        elif cmd_name == 'typerace':
            parts_tr = query.strip().split(None, 1)
            sub_tr = parts_tr[0].lower() if parts_tr else ''
            _RACE_PHRASES = [
                'the quick brown fox jumps over the lazy dog',
                'streaming is life and chat is family',
                'cubsoftware twitch bot is the best bot',
                'press f to pay respects in chat right now',
                'never gonna give you up never gonna let you down',
                'one does not simply walk into mordor without snacks',
            ]
            if sub_tr == 'start' and _level_gte(user_level, 'moderator'):
                if state.typerace and state.typerace.get('active'):
                    self.send('A type race is already running!', channel); return
                phrase = parts_tr[1].strip() if len(parts_tr) > 1 else random.choice(_RACE_PHRASES)
                reward = int(cfg.get('points_config', {}).get('trivia_reward', 100))
                state.typerace = {'text': phrase, 'active': True, 'expiry': time.time() + 60, 'reward': reward}
                self.send(f'⌨️ TYPE RACE! First to type: "{phrase}" wins {reward} pts! 60s GO!', channel)
            elif state.typerace and state.typerace.get('active'):
                if query.strip().lower() == state.typerace['text'].lower():
                    reward = state.typerace['reward']
                    state.typerace = None
                    pts_cfg = cfg.get('points_config', {})
                    if pts_cfg.get('enabled'):
                        pts = _load_points(channel)
                        pts[nick] = pts.get(nick, 0) + reward
                        _save_points(channel, pts)
                    self.send(f'⌨️ @{display_name} wins the type race! +{reward} {pts_cfg.get("name","points")}! 🏆', channel)
            elif sub_tr == 'stop' and _level_gte(user_level, 'moderator'):
                state.typerace = None
                self.send('Type race cancelled.', channel)
            else:
                self.send('No type race active. A mod can use !typerace start [text].', channel)

        # ── Spin Wheel ────────────────────────────────────────────────────
        elif cmd_name == 'wheel':
            if _level_gte(user_level, 'moderator') and not state.wheel_spinning:
                segments = cfg.get('wheel_segments', [
                    {'label': '+100 points', 'type': 'points', 'value': 100},
                    {'label': '+50 points',  'type': 'points', 'value': 50},
                    {'label': 'Nothing',     'type': 'none',   'value': 0},
                    {'label': 'Timeout 30s', 'type': 'timeout','value': 30},
                    {'label': '+200 points', 'type': 'points', 'value': 200},
                    {'label': 'VIP 1 hour',  'type': 'vip',    'value': 3600},
                ])
                if not segments:
                    self.send('No wheel segments configured.', channel); return
                target_nick = query.strip().lstrip('@').lower() if query.strip() else nick
                target_display = query.strip().lstrip('@') if query.strip() else display_name
                state.wheel_spinning = True
                seg = random.choice(segments)
                state.wheel_spinning = False
                pts_cfg = cfg.get('points_config', {})
                if seg['type'] == 'points' and pts_cfg.get('enabled'):
                    pts = _load_points(channel)
                    pts[target_nick] = pts.get(target_nick, 0) + int(seg['value'])
                    _save_points(channel, pts)
                elif seg['type'] == 'timeout':
                    self.timeout(target_nick, channel, int(seg['value']), 'Wheel spin result')
                self.send(f'🎡 @{target_display} spins the wheel... and lands on: {seg["label"]}!', channel)
            else:
                segs = cfg.get('wheel_segments', [])
                self.send(f'🎡 Wheel has {len(segs)} segments. Mods: !wheel @user to spin.', channel)

        # ── Lottery ───────────────────────────────────────────────────────
        elif cmd_name == 'lottery':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled for the lottery.', channel); return
            parts_lot = query.strip().split()
            sub_lot = parts_lot[0].lower() if parts_lot else ''
            if sub_lot == 'start' and _level_gte(user_level, 'moderator'):
                ticket_cost = int(parts_lot[1]) if len(parts_lot) > 1 and parts_lot[1].isdigit() else 50
                state.lottery = {'active': True, 'tickets': {}, 'ticket_cost': ticket_cost, 'pot': 0}
                self.send(f'🎟️ Lottery started! Buy a ticket for {ticket_cost} {pts_name} with !lottery buy. Mod draws with !lottodraw.', channel)
            elif sub_lot == 'buy':
                if not state.lottery or not state.lottery.get('active'):
                    self.send('No lottery active.', channel); return
                cost = state.lottery.get('ticket_cost', 50)
                pts = _load_points(channel)
                if pts.get(nick, 0) < cost:
                    self.send(f'@{display_name}, you need {cost} {pts_name} for a ticket.', channel); return
                if nick in state.lottery['tickets']:
                    self.send(f'@{display_name}, you already have a ticket!', channel); return
                pts[nick] -= cost
                state.lottery['tickets'][nick] = {'display': display_name}
                state.lottery['pot'] = state.lottery.get('pot', 0) + cost
                _save_points(channel, pts)
                n = len(state.lottery['tickets'])
                self.send(f'🎟️ @{display_name} bought a lottery ticket! {n} total entries. Pot: {state.lottery["pot"]:,} {pts_name}', channel)
            else:
                if state.lottery and state.lottery.get('active'):
                    self.send(f'🎟️ Lottery active! {len(state.lottery["tickets"])} tickets sold. Pot: {state.lottery.get("pot",0):,} {pts_name}. !lottery buy to enter.', channel)
                else:
                    self.send('No lottery active. Mods can !lottery start <ticket_cost>.', channel)

        elif cmd_name == 'lottodraw' and _level_gte(user_level, 'moderator'):
            if not state.lottery or not state.lottery.get('active'):
                self.send('No lottery active.', channel); return
            tickets = state.lottery.get('tickets', {})
            if not tickets:
                self.send('No tickets sold yet!', channel); return
            winner_nick = random.choice(list(tickets.keys()))
            winner_display = tickets[winner_nick]['display']
            pot = state.lottery.get('pot', 0)
            pts_cfg = cfg.get('points_config', {})
            if pts_cfg.get('enabled') and pot:
                pts = _load_points(channel)
                pts[winner_nick] = pts.get(winner_nick, 0) + pot
                _save_points(channel, pts)
            state.lottery = None
            self.send(f'🎟️ Lottery draw! The winner is @{winner_display}! They win {pot:,} {pts_cfg.get("name","points")}! 🎉', channel)

        # ── Auction ───────────────────────────────────────────────────────
        elif cmd_name == 'auction':
            parts_au = query.strip().split(None, 1)
            sub_au = parts_au[0].lower() if parts_au else ''
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if sub_au == 'start' and _level_gte(user_level, 'moderator'):
                item = parts_au[1].strip() if len(parts_au) > 1 else 'Mystery Prize'
                state.auction = {'item': item, 'high_bid': 0, 'high_bidder': '', 'high_display': '', 'active': True, 'expiry': time.time() + 120}
                self.send(f'💰 Auction started for: {item}! Use !bid <amount> to bid. 2 minutes!', channel)
            elif sub_au == 'end' and _level_gte(user_level, 'moderator'):
                au = state.auction
                if not au or not au.get('active'):
                    self.send('No active auction.', channel); return
                state.auction['active'] = False
                if au.get('high_bidder'):
                    pts = _load_points(channel)
                    pts[au['high_bidder']] = max(0, pts.get(au['high_bidder'], 0) - au['high_bid'])
                    _save_points(channel, pts)
                    self.send(f'💰 Auction ended! @{au["high_display"]} wins "{au["item"]}" for {au["high_bid"]:,} {pts_name}! 🎉', channel)
                else:
                    self.send(f'💰 Auction for "{au["item"]}" ended with no bids.', channel)
                state.auction = None
            else:
                au = state.auction
                if au and au.get('active'):
                    self.send(f'💰 Auction: {au["item"]} | High bid: {au["high_bid"]:,} {pts_name} by {au.get("high_display","—")} | !bid <amount>', channel)
                else:
                    self.send('No auction active. Mods: !auction start <item>', channel)

        elif cmd_name == 'bid':
            au = state.auction
            if not au or not au.get('active'):
                self.send('No auction active.', channel); return
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            try: amount = int(query.strip())
            except: self.send('Usage: !bid <amount>', channel); return
            if amount <= au.get('high_bid', 0):
                self.send(f'@{display_name}, current bid is {au["high_bid"]:,} {pts_name}. Bid higher!', channel); return
            pts = _load_points(channel)
            if pts.get(nick, 0) < amount:
                self.send(f'@{display_name}, not enough {pts_name}.', channel); return
            au['high_bid'] = amount
            au['high_bidder'] = nick
            au['high_display'] = display_name
            self.send(f'💰 @{display_name} bids {amount:,} {pts_name} for "{au["item"]}"!', channel)

        # ── Coin Rain ─────────────────────────────────────────────────────
        elif cmd_name == 'coinrain' and _level_gte(user_level, 'moderator'):
            pts_cfg = cfg.get('points_config', {})
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled for coin rain.', channel); return
            try: cr_amount = int(query.strip()) if query.strip() else 50
            except: cr_amount = 50
            state.coinrain = {'amount': cr_amount, 'active': True, 'expiry': time.time() + 30}
            self.send(f'🪙 COIN RAIN! First chatter to type !grab wins {cr_amount:,} {pts_cfg.get("name","points")}! (30s!)', channel)

        elif cmd_name == 'grab':
            if not state.coinrain or not state.coinrain.get('active'):
                return
            reward = state.coinrain.get('amount', 50)
            state.coinrain = None
            pts_cfg = cfg.get('points_config', {})
            if pts_cfg.get('enabled'):
                pts = _load_points(channel)
                pts[nick] = pts.get(nick, 0) + reward
                _save_points(channel, pts)
            self.send(f'🪙 @{display_name} grabbed the coin rain! +{reward} {pts_cfg.get("name","points")}! 💰', channel)

        # ── Bounty ────────────────────────────────────────────────────────
        elif cmd_name == 'bounty':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled for bounties.', channel); return
            parts_bn = query.strip().split()
            if len(parts_bn) < 2:
                active = ' | '.join(f'{t}: {a:,}' for t, a in list(state.bounties.items())[:5])
                self.send(f'💀 Active bounties: {active}' if state.bounties else '💀 No active bounties. Mods: !bounty @user <amount>', channel); return
            if not _level_gte(user_level, 'moderator'):
                self.send('Only mods can set bounties.', channel); return
            target_bn = parts_bn[0].lstrip('@').lower()
            try: amount_bn = int(parts_bn[1])
            except: self.send('Usage: !bounty @user <amount>', channel); return
            state.bounties[target_bn] = state.bounties.get(target_bn, 0) + amount_bn
            self.send(f'💀 Bounty on {target_bn}: {state.bounties[target_bn]:,} {pts_name}! First to rob them successfully collects it!', channel)

        # ── First Chatter ─────────────────────────────────────────────────
        # (handled automatically in PRIVMSG, but command to check)

        # ── Watchstreak ───────────────────────────────────────────────────
        elif cmd_name == 'watchstreak':
            target_ws = query.strip().lstrip('@').lower() if query.strip() else nick
            label_ws = query.strip().lstrip('@') if query.strip() else display_name
            ws_data = _load_watchstreak(channel)
            entry_ws = ws_data.get(target_ws, {})
            streak = entry_ws.get('streak', 0)
            self.send(f'🔥 @{label_ws} — Watch Streak: {streak} stream{"s" if streak != 1 else ""}!', channel)

        # ── Suggestion Box ────────────────────────────────────────────────
        elif cmd_name == 'suggest':
            text_sg = query.strip()
            if not text_sg:
                self.send('Usage: !suggest <your suggestion>', channel); return
            suggs = _load_suggestions(channel)
            suggs.append({'text': text_sg, 'user': display_name, 'nick': nick, 'ts': int(time.time()), 'status': 'pending'})
            _save_suggestions(channel, suggs)
            self.send(f'💡 @{display_name}, your suggestion has been submitted! (#{len(suggs)})', channel)

        elif cmd_name == 'suggestions' and _level_gte(user_level, 'moderator'):
            suggs = _load_suggestions(channel)
            pending = [s for s in suggs if s.get('status') == 'pending']
            if not pending:
                self.send('No pending suggestions.', channel); return
            parts_list = [f'#{i+1}: {s["text"]} ({s["user"]})' for i, s in enumerate(pending[:3])]
            self.send(f'💡 Pending ({len(pending)}): ' + ' | '.join(parts_list), channel)

        elif cmd_name == 'approve' and _level_gte(user_level, 'moderator'):
            try: idx_ap = int(query.strip()) - 1
            except: self.send('Usage: !approve <number>', channel); return
            suggs = _load_suggestions(channel)
            pending = [s for s in suggs if s.get('status') == 'pending']
            if 0 <= idx_ap < len(pending):
                pending[idx_ap]['status'] = 'approved'
                _save_suggestions(channel, suggs)
                self.send(f'✅ Suggestion approved: "{pending[idx_ap]["text"]}"', channel)

        elif cmd_name == 'deny' and _level_gte(user_level, 'moderator'):
            try: idx_dn = int(query.strip()) - 1
            except: self.send('Usage: !deny <number>', channel); return
            suggs = _load_suggestions(channel)
            pending = [s for s in suggs if s.get('status') == 'pending']
            if 0 <= idx_dn < len(pending):
                pending[idx_dn]['status'] = 'denied'
                _save_suggestions(channel, suggs)
                self.send(f'❌ Suggestion denied: "{pending[idx_dn]["text"]}"', channel)

        # ── Spotlight ─────────────────────────────────────────────────────
        elif cmd_name == 'spotlight' and _level_gte(user_level, 'moderator'):
            target_sp = query.strip().lstrip('@') if query.strip() else ''
            if not target_sp:
                self.send('Usage: !spotlight @user', channel); return
            spotlight_msg = cfg.get('spotlight_message', '🌟 Shoutout to @$(user) — go say hi!')
            self.send(spotlight_msg.replace('$(user)', target_sp), channel)

        # ── Birthday ──────────────────────────────────────────────────────
        elif cmd_name == 'birthday':
            bday_str = query.strip()
            if bday_str:
                if not re.match(r'^\d{1,2}/\d{1,2}$', bday_str):
                    self.send('Usage: !birthday MM/DD', channel); return
                bdays = _load_birthdays(channel)
                bdays[nick] = bday_str
                _save_birthdays(channel, bdays)
                self.send(f'🎂 @{display_name}, birthday saved as {bday_str}!', channel)
            else:
                bdays = _load_birthdays(channel)
                val = bdays.get(nick)
                self.send(f'🎂 @{display_name}, your birthday: {val}' if val else f'@{display_name}, no birthday set. Use !birthday MM/DD', channel)

        elif cmd_name == 'birthdays' and _level_gte(user_level, 'moderator'):
            bdays = _load_birthdays(channel)
            today = datetime.datetime.now().strftime('%-m/%-d') if os.name != 'nt' else datetime.datetime.now().strftime('%m/%d').lstrip('0').replace('/0','/')
            today_bdays = [n for n, d in bdays.items() if d == today]
            if today_bdays:
                self.send(f'🎂 Birthdays today: {", ".join(today_bdays[:10])} 🎉', channel)
            else:
                self.send(f'🎂 No birthdays today. {len(bdays)} registered.', channel)

        # ── Hype Meter ────────────────────────────────────────────────────
        elif cmd_name == 'hype':
            state.hype_count += 1
            thresh = int(cfg.get('hype_threshold', 20))
            if state.hype_count >= thresh:
                now_h = time.time()
                if now_h - state.hype_last_announce > 30:
                    state.hype_last_announce = now_h
                    state.hype_count = 0
                    self.send(f'🔥🔥🔥 HYPE METER FULL! Chat is going crazy right now! 🔥🔥🔥', channel)
                    self._patch_overlay_scene(channel, {'background_effect': 'confetti'})

        # ── Schedule ──────────────────────────────────────────────────────
        elif cmd_name == 'schedule':
            sched = cfg.get('stream_schedule', '')
            self.send(sched if sched else f'📅 No schedule set. Check twitch.tv/{channel} for updates!', channel)

        # ── Socials ───────────────────────────────────────────────────────
        elif cmd_name == 'socials':
            socials_cfg = cfg.get('socials', {})
            if not socials_cfg:
                self.send(f'No social links configured. Find {channel} on your favourite platforms!', channel); return
            parts_s = []
            for platform, url in socials_cfg.items():
                if url: parts_s.append(f'{platform}: {url}')
            self.send(' | '.join(parts_s) if parts_s else 'No social links set.', channel)

        # ── Stream Notes ──────────────────────────────────────────────────
        elif cmd_name == 'streamnote' and _level_gte(user_level, 'moderator'):
            note_text = query.strip()
            if not note_text:
                self.send('Usage: !streamnote <text>', channel); return
            notes_data = _load_stream_notes(channel)
            info_sn = state.stream_info or {}
            notes_data.append({'text': note_text, 'ts': int(time.time()), 'uptime': info_sn.get('uptime', '?'), 'by': nick})
            _save_stream_notes(channel, notes_data)
            self.send(f'📝 Stream note #{len(notes_data)} saved: {note_text}', channel)

        elif cmd_name == 'streamnotes' and _level_gte(user_level, 'moderator'):
            notes_data = _load_stream_notes(channel)
            if not notes_data:
                self.send('No stream notes yet. Use !streamnote <text>.', channel); return
            recent = notes_data[-3:]
            parts_sn = [f'[{n["uptime"]}] {n["text"]}' for n in recent]
            self.send(f'📝 Notes ({len(notes_data)} total): ' + ' | '.join(parts_sn), channel)

        # ── Raid Queue ────────────────────────────────────────────────────
        elif cmd_name == 'raidqueue' and _level_gte(user_level, 'moderator'):
            parts_rq = query.strip().split(None, 1)
            sub_rq = parts_rq[0].lower() if parts_rq else ''
            if sub_rq == 'add':
                target_rq = parts_rq[1].strip().lstrip('@').lower() if len(parts_rq) > 1 else ''
                if not target_rq:
                    self.send('Usage: !raidqueue add @channel', channel); return
                state.raid_queue.append(target_rq)
                self.send(f'🚨 {target_rq} added to raid queue ({len(state.raid_queue)} queued).', channel)
            elif sub_rq == 'next':
                if not state.raid_queue:
                    self.send('Raid queue is empty.', channel); return
                next_raid = state.raid_queue.pop(0)
                self._raw(f'PRIVMSG #{channel} :/raid {next_raid}')
                self.send(f'🚨 Raiding {next_raid}! ({len(state.raid_queue)} remaining in queue)', channel)
            elif sub_rq == 'clear':
                state.raid_queue = []
                self.send('Raid queue cleared.', channel)
            else:
                if state.raid_queue:
                    self.send(f'🚨 Raid queue ({len(state.raid_queue)}): {", ".join(state.raid_queue[:5])}', channel)
                else:
                    self.send('Raid queue is empty.', channel)

        # ── Sub Goal ──────────────────────────────────────────────────────
        elif cmd_name == 'subgoal':
            parts_sg2 = query.strip().split(None, 2)
            sub_sg = parts_sg2[0].lower() if parts_sg2 else ''
            if sub_sg == 'set' and _level_gte(user_level, 'moderator'):
                try: target_sg = int(parts_sg2[1])
                except: self.send('Usage: !subgoal set <number> [message]', channel); return
                msg_sg = parts_sg2[2] if len(parts_sg2) > 2 else f'Let\'s hit {target_sg} subs!'
                state.subgoal = {'target': target_sg, 'message': msg_sg}
                self.send(f'🎯 Sub goal set: {target_sg} subs — {msg_sg}', channel)
            elif sub_sg == 'clear' and _level_gte(user_level, 'moderator'):
                state.subgoal = None
                self.send('Sub goal cleared.', channel)
            else:
                if state.subgoal:
                    info_s = self._get_stream_info(channel, state)
                    current_subs = '?'
                    self.send(f'🎯 Sub goal: {current_subs}/{state.subgoal["target"]} subs | {state.subgoal["message"]}', channel)
                else:
                    self.send('No sub goal set. Mods: !subgoal set <number> [message]', channel)

        # ── Bits Goal ─────────────────────────────────────────────────────
        elif cmd_name == 'bitsgoal':
            parts_bg = query.strip().split(None, 2)
            sub_bg = parts_bg[0].lower() if parts_bg else ''
            if sub_bg == 'set' and _level_gte(user_level, 'moderator'):
                try: target_bg = int(parts_bg[1])
                except: self.send('Usage: !bitsgoal set <amount> [message]', channel); return
                msg_bg = parts_bg[2] if len(parts_bg) > 2 else f'Cheer {target_bg} bits!'
                state.bitsgoal = {'target': target_bg, 'current': 0, 'message': msg_bg}
                self.send(f'✨ Bits goal set: {target_bg} bits — {msg_bg}', channel)
            elif sub_bg == 'clear' and _level_gte(user_level, 'moderator'):
                state.bitsgoal = None
                self.send('Bits goal cleared.', channel)
            else:
                if state.bitsgoal:
                    bg = state.bitsgoal
                    pct_bg = int(bg['current'] / bg['target'] * 100) if bg['target'] else 0
                    bar_bg = '█' * (pct_bg // 10) + '░' * (10 - pct_bg // 10)
                    self.send(f'✨ Bits goal: [{bar_bg}] {bg["current"]:,}/{bg["target"]:,} ({pct_bg}%) — {bg["message"]}', channel)
                else:
                    self.send('No bits goal set. Mods: !bitsgoal set <amount> [message]', channel)

        # ── Clip Last ─────────────────────────────────────────────────────
        elif cmd_name == 'cliplast':
            clips = _load_clips_log(channel)
            if not clips:
                self.send('No clips logged yet.', channel); return
            last_clip = clips[-1]
            url = last_clip.get('url', last_clip.get('edit_url', '?'))
            ts_c = datetime.datetime.fromtimestamp(last_clip.get('ts', 0)).strftime('%H:%M') if last_clip.get('ts') else '?'
            self.send(f'🎬 Last clip at {ts_c}: {url}', channel)

        # ── Command Stats ─────────────────────────────────────────────────
        elif cmd_name == 'cmdstats' and _level_gte(user_level, 'moderator'):
            cmds = cfg.get('commands', {})
            top_cmds = sorted(cmds.items(), key=lambda x: x[1].get('count', 0), reverse=True)[:5]
            if not top_cmds:
                self.send('No command usage data yet.', channel); return
            parts_cs = ' | '.join(f'!{n}: {c.get("count",0)}' for n, c in top_cmds)
            self.send(f'📊 Top commands: {parts_cs}', channel)

        # ── Ban Reason ────────────────────────────────────────────────────
        elif cmd_name == 'banreason' and _level_gte(user_level, 'moderator'):
            parts_br = query.strip().split(None, 1)
            if not parts_br:
                self.send('Usage: !banreason @user <reason>', channel); return
            target_br = parts_br[0].lstrip('@').lower()
            reason_br = parts_br[1].strip() if len(parts_br) > 1 else 'No reason given'
            ban_log = _load_ban_reasons(channel)
            ban_log.setdefault(target_br, []).append({'reason': reason_br, 'by': nick, 'ts': int(time.time())})
            _save_ban_reasons(channel, ban_log)
            self.send(f'📋 Ban reason logged for {target_br}: {reason_br}', channel)

        # ── Bank ──────────────────────────────────────────────────────────
        elif cmd_name == 'bank':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            bank = _load_bank(channel)
            entry_bk = bank.get(nick, {'deposited': 0, 'interest_ts': int(time.time())})
            deposited = entry_bk.get('deposited', 0)
            pts = _load_points(channel)
            wallet = pts.get(nick, 0)
            self.send(f'🏦 @{display_name} — Wallet: {wallet:,} | Bank: {deposited:,} {pts_name} (earns 2% interest/hr)', channel)

        elif cmd_name == 'deposit':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled.', channel); return
            try: amount_dep = int(query.strip())
            except: self.send('Usage: !deposit <amount>', channel); return
            pts = _load_points(channel)
            if pts.get(nick, 0) < amount_dep or amount_dep <= 0:
                self.send(f'@{display_name}, invalid amount.', channel); return
            pts[nick] -= amount_dep
            _save_points(channel, pts)
            bank = _load_bank(channel)
            entry_dep = bank.get(nick, {'deposited': 0, 'interest_ts': int(time.time())})
            entry_dep['deposited'] = entry_dep.get('deposited', 0) + amount_dep
            entry_dep.setdefault('interest_ts', int(time.time()))
            bank[nick] = entry_dep
            _save_bank(channel, bank)
            self.send(f'🏦 @{display_name} deposited {amount_dep:,} {pts_name}. Bank balance: {entry_dep["deposited"]:,}', channel)

        elif cmd_name == 'withdraw':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled.', channel); return
            bank = _load_bank(channel)
            entry_wd = bank.get(nick, {'deposited': 0})
            try: amount_wd = int(query.strip())
            except: self.send('Usage: !withdraw <amount>', channel); return
            if entry_wd.get('deposited', 0) < amount_wd or amount_wd <= 0:
                self.send(f'@{display_name}, bank balance: {entry_wd.get("deposited",0):,} {pts_name}.', channel); return
            entry_wd['deposited'] -= amount_wd
            bank[nick] = entry_wd
            _save_bank(channel, bank)
            pts = _load_points(channel)
            pts[nick] = pts.get(nick, 0) + amount_wd
            _save_points(channel, pts)
            self.send(f'🏦 @{display_name} withdrew {amount_wd:,} {pts_name}. Wallet: {pts[nick]:,}', channel)

        # ── Prestige ──────────────────────────────────────────────────────
        elif cmd_name == 'prestige':
            pts_cfg = cfg.get('points_config', {})
            pts_name = pts_cfg.get('name', 'points')
            if not pts_cfg.get('enabled'):
                self.send('Points must be enabled for prestige.', channel); return
            prestige_cost = int(cfg.get('prestige_cost', 50000))
            pts = _load_points(channel)
            if pts.get(nick, 0) < prestige_cost:
                self.send(f'@{display_name}, prestige costs {prestige_cost:,} {pts_name}. You have {pts.get(nick,0):,}.', channel); return
            prestige_data = _load_prestige(channel)
            current_level = prestige_data.get(nick, {}).get('level', 0)
            new_level = current_level + 1
            pts[nick] = 0
            _save_points(channel, pts)
            prestige_data[nick] = {'level': new_level, 'ts': int(time.time())}
            _save_prestige(channel, prestige_data)
            self.send(f'✨ @{display_name} prestiged! Reached Prestige {new_level} ⭐ (points reset to 0)', channel)

        # ── Teams ─────────────────────────────────────────────────────────
        elif cmd_name == 'team':
            parts_t = query.strip().split(None, 1)
            sub_t = parts_t[0].lower() if parts_t else ''
            arg_t = parts_t[1].strip() if len(parts_t) > 1 else ''
            teams = _load_teams(channel)
            if sub_t == 'create' and _level_gte(user_level, 'moderator'):
                tname = arg_t.lower().replace(' ', '_')
                if not tname:
                    self.send('Usage: !team create <name>', channel); return
                if tname in teams:
                    self.send(f'Team "{tname}" already exists.', channel); return
                teams[tname] = {'members': [], 'points': 0}
                _save_teams(channel, teams)
                self.send(f'👥 Team "{tname}" created! Use !team join {tname} to join.', channel)
            elif sub_t == 'join':
                tname = arg_t.lower().replace(' ', '_')
                if tname not in teams:
                    self.send(f'Team "{tname}" not found.', channel); return
                for t in teams.values():
                    if nick in t.get('members', []):
                        t['members'].remove(nick)
                teams[tname]['members'].append(nick)
                _save_teams(channel, teams)
                self.send(f'👥 @{display_name} joined team {tname}!', channel)
            elif sub_t == 'points':
                if not teams:
                    self.send('No teams created yet.', channel); return
                pts = _load_points(channel)
                team_scores = {}
                for tname, tdata in teams.items():
                    team_scores[tname] = sum(pts.get(m, 0) for m in tdata.get('members', []))
                top_t = sorted(team_scores.items(), key=lambda x: x[1], reverse=True)[:5]
                self.send(f'👥 Team standings: ' + ' | '.join(f'{t}: {s:,}' for t, s in top_t), channel)
            elif sub_t == 'list':
                if not teams:
                    self.send('No teams. Mods: !team create <name>', channel); return
                _key_members = 'members'
                self.send(f'👥 Teams: {", ".join(f"{t} ({len(d.get(_key_members, []))})" for t, d in list(teams.items())[:5])}', channel)
            else:
                self.send('Usage: !team create|join|points|list', channel)

        # ── Last Seen ─────────────────────────────────────────────────────
        elif cmd_name == 'lastseen':
            target_ls = query.strip().lstrip('@').lower() if query.strip() else ''
            if not target_ls:
                self.send('Usage: !lastseen @user', channel); return
            log = state.chat_log
            matches = [m for m in reversed(log) if m['nick'].lower() == target_ls or m.get('user_id', '') == target_ls]
            if matches:
                last_ts = matches[0]['ts']
                ago = int(time.time()) - last_ts
                if ago < 60: ago_str = f'{ago}s ago'
                elif ago < 3600: ago_str = f'{ago//60}m ago'
                else: ago_str = f'{ago//3600}h {(ago%3600)//60}m ago'
                self.send(f'👁 @{target_ls} was last seen {ago_str} in chat.', channel)
            else:
                self.send(f'@{target_ls} has not been seen in recent chat history.', channel)

        # ── TTS Queue ─────────────────────────────────────────────────────
        elif cmd_name == 'tts':
            tts_cfg = cfg.get('tts_config', {'enabled': False, 'min_level': 'subscriber', 'max_length': 150})
            if not tts_cfg.get('enabled', False):
                self.send('TTS is not enabled on this channel.', channel); return
            required_level = tts_cfg.get('min_level', 'subscriber')
            if not _level_gte(user_level, required_level):
                self.send(f'@{display_name}, TTS requires {required_level} or higher.', channel); return
            msg_tts = query.strip()[:int(tts_cfg.get('max_length', 150))]
            if not msg_tts:
                self.send('Usage: !tts <message>', channel); return
            state.tts_queue.append({'user': display_name, 'text': msg_tts, 'ts': int(time.time())})
            if len(state.tts_queue) > 20:
                state.tts_queue = state.tts_queue[-20:]
            self.send(f'🔊 TTS queued from @{display_name}', channel)

        # ── Alert Trigger ─────────────────────────────────────────────────
        elif cmd_name == 'alert' and _level_gte(user_level, 'moderator'):
            alert_type = query.strip().lower() or 'hype'
            self._notify_event(channel, 'custom_alert', {'type': alert_type, 'user': display_name}, cfg)
            self._patch_overlay_scene(channel, {'alert_type': alert_type})
            self.send(f'🔔 Alert "{alert_type}" triggered!', channel)

        # ── Emote Count ───────────────────────────────────────────────────
        elif cmd_name == 'emotecount':
            emote_q = query.strip()
            if emote_q:
                count_ec = state.emote_counts.get(emote_q, 0)
                self.send(f'📊 "{emote_q}" used {count_ec:,} times this stream.', channel)
            else:
                if not state.emote_counts:
                    self.send('No emote data this stream yet.', channel); return
                top_ec = sorted(state.emote_counts.items(), key=lambda x: x[1], reverse=True)[:5]
                self.send(f'📊 Top emotes: ' + ' | '.join(f'{e}: {c}' for e, c in top_ec), channel)

        # ── Chat Alert ────────────────────────────────────────────────────
        elif cmd_name == 'chatalert' and _level_gte(user_level, 'moderator'):
            parts_ca = query.strip().split(None, 1)
            sub_ca = parts_ca[0].lower() if parts_ca else ''
            if sub_ca == 'add':
                kw = parts_ca[1].strip().lower() if len(parts_ca) > 1 else ''
                if not kw:
                    self.send('Usage: !chatalert add <keyword>', channel); return
                alerts_cfg = cfg.setdefault('chat_keyword_alerts', [])
                if kw not in alerts_cfg:
                    alerts_cfg.append(kw)
                    save_channel_config(channel, cfg)
                self.send(f'🔔 Chat alert added for keyword: "{kw}"', channel)
            elif sub_ca == 'remove':
                kw = parts_ca[1].strip().lower() if len(parts_ca) > 1 else ''
                alerts_cfg = cfg.get('chat_keyword_alerts', [])
                if kw in alerts_cfg:
                    alerts_cfg.remove(kw)
                    save_channel_config(channel, cfg)
                self.send(f'🔔 Chat alert removed: "{kw}"', channel)
            elif sub_ca == 'list':
                alerts_cfg = cfg.get('chat_keyword_alerts', [])
                self.send(f'🔔 Keyword alerts: {", ".join(alerts_cfg) or "none"}', channel)
            else:
                self.send('Usage: !chatalert add|remove|list <keyword>', channel)

        # ── Raid Shield ───────────────────────────────────────────────────
        elif cmd_name == 'raidshield' and _level_gte(user_level, 'moderator'):
            sub_rs = query.strip().lower()
            if sub_rs in ('on', 'enable'):
                cfg['raid_shield'] = {'enabled': True, 'slow_secs': 30, 'follower_mins': 10}
                save_channel_config(channel, cfg)
                self.send('🛡 Raid shield enabled — auto slow mode + follower-only on raid.', channel)
            elif sub_rs in ('off', 'disable'):
                cfg['raid_shield'] = {'enabled': False}
                save_channel_config(channel, cfg)
                self.send('🛡 Raid shield disabled.', channel)
            else:
                enabled = cfg.get('raid_shield', {}).get('enabled', False)
                self.send(f'🛡 Raid shield is {"ON" if enabled else "OFF"}. !raidshield on/off', channel)

        # ── Autoban Patterns ──────────────────────────────────────────────
        elif cmd_name == 'autoban' and _level_gte(user_level, 'moderator'):
            parts_ab = query.strip().split(None, 1)
            sub_ab = parts_ab[0].lower() if parts_ab else ''
            arg_ab = parts_ab[1].strip() if len(parts_ab) > 1 else ''
            patterns = _load_autoban_patterns(channel)
            if sub_ab == 'add':
                if not arg_ab:
                    self.send('Usage: !autoban add <pattern>', channel); return
                try: re.compile(arg_ab)
                except re.error:
                    self.send('Invalid regex pattern.', channel); return
                if arg_ab not in patterns:
                    patterns.append(arg_ab)
                    _save_autoban_patterns(channel, patterns)
                self.send(f'🚫 Autoban pattern added: {arg_ab}', channel)
            elif sub_ab == 'remove':
                if arg_ab in patterns:
                    patterns.remove(arg_ab)
                    _save_autoban_patterns(channel, patterns)
                self.send(f'🚫 Autoban pattern removed.', channel)
            elif sub_ab == 'list':
                self.send(f'🚫 Autoban patterns ({len(patterns)}): {", ".join(patterns[:10]) or "none"}', channel)
            else:
                self.send('Usage: !autoban add|remove|list <pattern>', channel)

        # ── Shadow Warn ───────────────────────────────────────────────────
        elif cmd_name == 'shadowwarn' and _level_gte(user_level, 'moderator'):
            parts_sw = query.split(None, 1)
            if not parts_sw:
                self.send('Usage: !shadowwarn @user [reason]', channel); return
            target_sw = parts_sw[0].lstrip('@').lower()
            reason_sw = parts_sw[1].strip() if len(parts_sw) > 1 else 'No reason'
            warns_sw = _load_warnings(channel)
            warns_sw.setdefault(target_sw, []).append({'reason': reason_sw, 'by': nick, 'ts': int(time.time()), 'silent': True})
            _save_warnings(channel, warns_sw)
            count_sw = len(warns_sw[target_sw])
            # Only the mod sees this message, sent directly (no public announce)
            self.send(f'/w {nick} [Shadow] {target_sw} silently warned ({count_sw} total): {reason_sw}', channel)

        # ── Chat Export ───────────────────────────────────────────────────
        elif cmd_name == 'chatexport' and _level_gte(user_level, 'moderator'):
            log = state.chat_log[-50:]
            lines = [f'[{datetime.datetime.fromtimestamp(m["ts"]).strftime("%H:%M:%S")}] {m["nick"]}: {m["text"]}' for m in log]
            self.send(f'📋 Last {len(lines)} messages exported to dashboard (Settings > Chat Export).', channel)

        # ── Temp Role ─────────────────────────────────────────────────────
        elif cmd_name == 'temprole' and _level_gte(user_level, 'moderator'):
            parts_tmp = query.strip().split()
            if len(parts_tmp) < 2:
                self.send('Usage: !temprole @user <duration_seconds>', channel); return
            target_tmp = parts_tmp[0].lstrip('@').lower()
            try: dur_tmp = int(parts_tmp[1])
            except: self.send('Usage: !temprole @user <seconds>', channel); return
            self._raw(f'PRIVMSG #{channel} :/vip {target_tmp}')
            state.timed_bans[target_tmp] = {'expiry': time.time() + dur_tmp, 'action': 'unvip'}
            self.send(f'✅ @{target_tmp} granted VIP for {dur_tmp}s.', channel)

        # ── Multi-winner Giveaway ─────────────────────────────────────────
        elif cmd_name == 'multiwin' and _level_gte(user_level, 'moderator'):
            parts_mw = query.strip().split()
            if not parts_mw or not parts_mw[0].isdigit():
                self.send('Usage: !multiwin <count> (draws N winners from current giveaway)', channel); return
            n_winners = min(int(parts_mw[0]), 20)
            entries = (state.giveaway or {}).get('entries', [])
            if not entries:
                self.send('No giveaway entries.', channel); return
            pool = list(entries)
            random.shuffle(pool)
            winners = pool[:n_winners]
            names = ', '.join(f'@{w["nick"]}' for w in winners)
            self.send(f'🎊 {n_winners} winners drawn: {names} 🎉', channel)

    # ── Timers ────────────────────────────────────────────────────────────

    def _timer_loop(self):
        while self._running:
            time.sleep(10)
            if not self._connected:
                continue
            now = time.time()
            for channel, state in list(self._channels.items()):
                cfg = load_channel_config(channel)
                for timer in cfg.get('timers', []):
                    if not timer.get('enabled', True):
                        continue
                    tid       = timer.get('id', '')
                    interval  = int(timer.get('interval', 1800))
                    min_lines = int(timer.get('min_lines', 0))
                    last      = state.timer_last.get(tid, 0)
                    if now - last >= interval and state.line_count >= min_lines:
                        self.send(timer.get('message', ''), channel)
                        state.timer_last[tid] = now
                        state.line_count = 0

                # Per-minute passive points
                pts_cfg = cfg.get('points_config', {})
                if pts_cfg.get('enabled') and int(pts_cfg.get('per_minute', 0)) > 0:
                    if now - state.timer_last.get('__pts_min__', 0) >= 60:
                        state.timer_last['__pts_min__'] = now
                        cutoff  = now - 300  # active in last 5 min
                        active  = {m['nick'].lower() for m in state.chat_log if m['ts'] >= cutoff}
                        if active:
                            pts  = _load_points(channel)
                            earn = int(pts_cfg['per_minute'])
                            for n in active:
                                pts[n] = pts.get(n, 0) + earn
                            _save_points(channel, pts)

                # Watch time (per active chatter per minute)
                if now - state.timer_last.get('__wt__', 0) >= 60:
                    state.timer_last['__wt__'] = now
                    cutoff = now - 300
                    active = {m['nick'].lower() for m in state.chat_log if m['ts'] >= cutoff}
                    if active:
                        wt = _load_watchtime(channel)
                        for n in active:
                            wt[n] = wt.get(n, 0) + 60
                        _save_watchtime(channel, wt)

                # Duel expiry
                if state.duel and state.duel.get('active') and now > state.duel.get('expiry', 0):
                    challenger = state.duel['challenger']['nick']
                    state.duel = None
                    self.send(f'{challenger}, your duel challenge expired.', channel)

                # Heist resolution
                if state.heist and state.heist.get('phase') == 'joining' and now > state.heist.get('expiry', 0):
                    entries = state.heist.get('entries', [])
                    if not entries:
                        state.heist = None
                    else:
                        state.heist['phase'] = 'running'
                        pts = _load_points(channel)
                        winners, losers = [], []
                        for e in entries:
                            if random.random() < 0.55:  # 55% success
                                pts[e['nick']] = pts.get(e['nick'], 0) + e['amount']
                                winners.append(e['nick'])
                            else:
                                losers.append(e['nick'])
                        _save_points(channel, pts)
                        total = len(entries)
                        win_str = f"{len(winners)}/{total} survived!"
                        if winners:
                            self.send(f'🏴‍☠️ Heist complete! {win_str} Survivors: {", ".join(winners[:5])}', channel)
                        else:
                            self.send(f'🏴‍☠️ The heist failed! Everyone was caught!', channel)
                        state.heist = None

                # Trivia expiry
                if state.trivia and state.trivia.get('active') and not state.trivia.get('answered') and now > state.trivia.get('expiry', 0):
                    answer = state.trivia['answer']
                    state.trivia['active'] = False
                    self.send(f'⏰ Time\'s up! The answer was: {answer}', channel)

                # Anagram expiry
                if state.anagram and state.anagram.get('active') and time.time() > state.anagram.get('expiry', 0):
                    word = state.anagram['word']
                    state.anagram = None
                    self.send(f'⏰ Time\'s up! The anagram answer was: {word.upper()}', channel)

                # Boss battle resolution
                if state.boss_battle and state.boss_battle.get('active') and state.boss_battle.get('phase') == 'joining':
                    if now > state.boss_battle.get('expiry', 0):
                        bb = state.boss_battle
                        participants = bb.get('participants', {})
                        if not participants:
                            state.boss_battle = None
                            self.send(f'⚔️ No one challenged {bb["boss_name"]}... the boss retreats!', channel)
                        else:
                            # Battle resolution
                            bb['phase'] = 'battle'
                            total_dmg = sum(random.randint(50, 200) for _ in participants)
                            bb['boss_hp'] = max(0, bb['boss_hp'] - total_dmg)
                            boss_cfg = cfg.get('boss_battle', {'win_multiplier': 3, 'cost': 50, 'cooldown': 3600})
                            if bb['boss_hp'] <= 0:
                                pts = _load_points(channel)
                                pts_cfg = cfg.get('points_config', {})
                                reward = bb.get('cost', 50) * boss_cfg.get('win_multiplier', 3)
                                for pnick in participants:
                                    pts[pnick] = pts.get(pnick, 0) + reward
                                _save_points(channel, pts)
                                names = ', '.join(v['display'] for v in list(participants.values())[:5])
                                self.send(f'⚔️ VICTORY! {bb["boss_name"]} defeated! {names}{"..." if len(participants)>5 else ""} each win {reward} {pts_cfg.get("name","points")}! 🏆', channel)
                            else:
                                self.send(f'⚔️ {bb["boss_name"]} defeated the {len(participants)} challengers! HP remaining: {bb["boss_hp"]}. Better luck next time!', channel)
                            state.boss_battle = None
                            state.boss_cd = now + boss_cfg.get('cooldown', 3600)

                # Number guessing game expiry
                if state.numguess and state.numguess.get('active'):
                    if now > state.numguess.get('expiry', 0):
                        ans = state.numguess.get('answer', '?')
                        state.numguess = None
                        self.send(f'🔢 Time\'s up! No one guessed the number. It was {ans}!', channel)

                # Chat race expiry
                if state.chat_race and state.chat_race.get('active'):
                    if now > state.chat_race.get('expiry', 0):
                        phrase = state.chat_race.get('target', '')
                        state.chat_race = None
                        self.send(f'🏁 Race over! No one typed "{phrase}" in time!', channel)

                # RPS challenge expiry
                if state.challenge and state.challenge.get('active'):
                    if now > state.challenge.get('expiry', 0):
                        state.challenge = None
                        self.send(f'Challenge expired.', channel)

                # Category change detection (every 5 minutes)
                if now - state.cd.get('__game_check__', 0) >= 300:
                    state.cd['__game_check__'] = now
                    try:
                        info = state.stream_info
                        if info:
                            new_game = info.get('game_name', '') or info.get('game', '')
                            if state.last_game and new_game and new_game != state.last_game:
                                cat_cfg = cfg.get('category_change_alert', {})
                                if cat_cfg.get('enabled'):
                                    msg = cat_cfg.get('message', '🎮 Category changed to $(game)!')
                                    msg = msg.replace('$(game)', new_game).replace('$(oldgame)', state.last_game)
                                    self.send(msg, channel)
                            if new_game:
                                state.last_game = new_game
                    except Exception:
                        pass

                # Follower milestone detection (every 5 minutes)
                if now - state.cd.get('__follower_milestone_check__', 0) >= 300:
                    state.cd['__follower_milestone_check__'] = now
                    try:
                        info = state.stream_info
                        if info:
                            fc = info.get('follower_count', 0) or info.get('followers', 0)
                            if fc and fc > state.last_follower_count:
                                mile_cfg = cfg.get('follower_milestones', {})
                                if mile_cfg.get('enabled'):
                                    announced = mile_cfg.get('announced', [])
                                    milestones = mile_cfg.get('milestones', [100, 500, 1000, 5000, 10000, 50000, 100000])
                                    for m in milestones:
                                        if state.last_follower_count < m <= fc and m not in announced:
                                            msg_tmpl = mile_cfg.get('message', '🎉 $(channel) just hit $(count) followers! Thank you all so much!')
                                            msg_out = msg_tmpl.replace('$(count)', f'{m:,}').replace('$(channel)', channel)
                                            self.send(msg_out, channel)
                                            announced.append(m)
                                    if announced != mile_cfg.get('announced', []):
                                        mile_cfg['announced'] = announced
                                        cfg['follower_milestones'] = mile_cfg
                                        save_channel_config(channel, cfg)
                                state.last_follower_count = fc
                    except Exception:
                        pass

                # Stream peak viewer tracking
                try:
                    info = state.stream_info
                    if info:
                        vc = info.get('viewer_count', 0) or info.get('viewers', 0)
                        if vc:
                            if not state.stream_stats:
                                state.stream_stats = {'peak_viewers': 0, 'subs_received': [], 'raids_received': [], 'points_distributed': 0, 'message_counts': {}, 'chat_messages_total': 0}
                            if vc > state.stream_stats.get('peak_viewers', 0):
                                state.stream_stats['peak_viewers'] = vc
                        state.stream_was_live = True
                    elif state.stream_was_live:
                        # Stream just ended - reset first chatter flag
                        state.stream_was_live = False
                        state.first_chatter_done = False
                except Exception:
                    pass

                # Bank interest (every hour, 2% of deposited balance)
                if now - state.timer_last.get('__bank_interest__', 0) >= 3600:
                    state.timer_last['__bank_interest__'] = now
                    try:
                        bank = _load_bank(channel)
                        if bank:
                            pts = _load_points(channel)
                            for bnick, bdata in bank.items():
                                dep = bdata.get('deposited', 0)
                                if dep > 0:
                                    interest = max(1, int(dep * 0.02))
                                    bdata['deposited'] = dep + interest
                            _save_bank(channel, bank)
                    except Exception:
                        pass

                # Auction expiry
                if state.auction and state.auction.get('active') and now > state.auction.get('expiry', 0):
                    au = state.auction
                    pts_cfg2 = cfg.get('points_config', {})
                    if au.get('high_bidder'):
                        pts2 = _load_points(channel)
                        pts2[au['high_bidder']] = max(0, pts2.get(au['high_bidder'], 0) - au['high_bid'])
                        _save_points(channel, pts2)
                        self.send(f'💰 Auction closed! @{au["high_display"]} wins "{au["item"]}" for {au["high_bid"]:,} {pts_cfg2.get("name","points")}!', channel)
                    else:
                        self.send(f'💰 Auction for "{au["item"]}" ended with no bids.', channel)
                    state.auction = None

                # Coin rain expiry
                if state.coinrain and state.coinrain.get('active') and now > state.coinrain.get('expiry', 0):
                    state.coinrain = None
                    self.send('🪙 Coin rain expired! Nobody grabbed it in time.', channel)

                # Type race expiry
                if state.typerace and state.typerace.get('active') and now > state.typerace.get('expiry', 0):
                    phrase = state.typerace.get('text', '')
                    state.typerace = None
                    self.send(f'⌨️ Type race over! No one typed the phrase in time.', channel)

                # Birthday check (once per hour)
                if now - state.timer_last.get('__bday_check__', 0) >= 3600:
                    state.timer_last['__bday_check__'] = now
                    try:
                        bdays = _load_birthdays(channel)
                        today_str = datetime.datetime.now().strftime('%m/%d').lstrip('0').replace('/0', '/')
                        celebrants = [n for n, d in bdays.items() if d == today_str]
                        if celebrants and not state.timer_last.get('__bday_announced__', 0) == datetime.datetime.now().day:
                            state.timer_last['__bday_announced__'] = datetime.datetime.now().day
                            self.send(f'🎂 Happy Birthday to: {", ".join(celebrants[:5])}! 🎉', channel)
                    except Exception:
                        pass

                # Timed unvip
                for target_tv, tv_data in list(state.timed_bans.items()):
                    if now > tv_data.get('expiry', 0):
                        action_tv = tv_data.get('action', '')
                        if action_tv == 'unvip':
                            self._raw(f'PRIVMSG #{channel} :/unvip {target_tv}')
                        del state.timed_bans[target_tv]

                # Chat milestone announcements
                try:
                    total_msgs = (state.stream_stats or {}).get('chat_messages_total', 0)
                    milestones_chat = [100, 500, 1000, 5000, 10000]
                    announced_chat = state.timer_last.get('__chat_milestones__', [])
                    if not isinstance(announced_chat, list): announced_chat = []
                    for ms in milestones_chat:
                        if total_msgs >= ms and ms not in announced_chat:
                            announced_chat.append(ms)
                            state.timer_last['__chat_milestones__'] = announced_chat
                            self.send(f'🎉 {ms:,} messages in chat this stream! You all are amazing! 💬', channel)
                except Exception:
                    pass

                # Category history tracking
                try:
                    info_ch = state.stream_info
                    if info_ch:
                        cur_game = info_ch.get('game', '')
                        if cur_game:
                            if not state.category_history or state.category_history[-1].get('game') != cur_game:
                                state.category_history.append({'game': cur_game, 'started_ts': int(now)})
                except Exception:
                    pass

    # ── Helpers ───────────────────────────────────────────────────────────

    def _patch_overlay_scene(self, channel: str, config_updates: dict) -> bool:
        """Directly update an overlay scene's widget config via the overlays module."""
        import sys
        cfg = load_channel_config(channel)
        scene_id = cfg.get('overlay_scenes', {}).get('default', '').strip()
        if not scene_id:
            return False
        try:
            overlays_mod = sys.modules.get('overlays_blueprint')
            if not overlays_mod:
                return False
            data = overlays_mod.load_overlays_data()
            scene = data.get('scenes', {}).get(scene_id)
            if not scene:
                logger.debug(f'_patch_overlay_scene: scene {scene_id} not found')
                return False
            scene.setdefault('config', {}).update(config_updates)
            scene['updated'] = int(time.time())
            overlays_mod.save_overlays_data(data)
            overlays_mod.notify_scene_update(
                scene_id,
                {'template': scene.get('template', 'minimal'), **scene['config']},
            )
            logger.debug(f'Overlay scene {scene_id} patched for {channel}: {list(config_updates.keys())}')
            return True
        except Exception as e:
            logger.debug(f'_patch_overlay_scene error: {e}')
            return False

    def _get_overlay_discord_id(self, channel: str) -> str:
        """Look up the Stream Overlays discord_id for a Twitch channel login (cached)."""
        import sys
        channel = channel.lower().strip('#')
        cache_key = f'__overlay_discord_{channel}__'
        cached = getattr(self, '_overlay_discord_cache', {})
        if not hasattr(self, '_overlay_discord_cache'):
            self._overlay_discord_cache = {}
            cached = self._overlay_discord_cache
        # Refresh cache every 5 minutes
        cached_val = cached.get(cache_key)
        if cached_val and time.time() - cached_val[1] < 300:
            return cached_val[0]
        try:
            overlays_mod = sys.modules.get('overlays_blueprint')
            if overlays_mod and hasattr(overlays_mod, 'load_twitch_tokens'):
                all_tokens = overlays_mod.load_twitch_tokens()
                for discord_id, token_data in all_tokens.items():
                    if token_data.get('twitch_login', '').lower() == channel:
                        cached[cache_key] = (discord_id, time.time())
                        return discord_id
        except Exception as e:
            logger.debug(f'overlay discord_id lookup failed: {e}')
        cached[cache_key] = ('', time.time())
        return ''

    def _notify_event(self, channel: str, event_type: str, data: dict, cfg: dict = None):
        """Push event to Discord webhook, Stream Overlays, and CubDeck."""
        import sys
        if cfg is None:
            cfg = load_channel_config(channel)

        # ── 1. Discord webhook ─────────────────────────────────────────
        try:
            webhook_url = cfg.get('discord_webhook', '')
            if webhook_url:
                _msgs = {
                    'sub':      lambda d: f'🎉 **{d.get("user","?")}** just subscribed! (Month {d.get("months","1")})',
                    'subgift':  lambda d: f'🎁 **{d.get("gifter","?")}** gifted a sub to **{d.get("recipient","?")}**!',
                    'massgift': lambda d: f'🎁 **{d.get("gifter","?")}** gifted **{d.get("count","?")}** subs to the community!',
                    'cheer':    lambda d: f'✨ **{d.get("user","?")}** cheered **{d.get("bits","?")}** bits!',
                    'raid':     lambda d: f'🚨 **{d.get("raider","?")}** raided with **{d.get("viewers","?")}** viewers!',
                    'follow':   lambda d: f'💜 **{d.get("user","?")}** just followed!',
                }
                if event_type in _msgs:
                    content = _msgs[event_type](data)
                    payload = json.dumps({'content': content, 'username': 'CubAssist'}).encode()
                    req = urllib.request.Request(
                        webhook_url, data=payload, method='POST',
                        headers={'Content-Type': 'application/json'},
                    )
                    urllib.request.urlopen(req, timeout=5)
        except Exception as e:
            logger.debug(f'Discord webhook error: {e}')

        # ── 2. Stream Overlays — push alert event ──────────────────────
        try:
            overlays_mod = sys.modules.get('overlays_blueprint')
            if overlays_mod and hasattr(overlays_mod, 'notify_alert_event'):
                discord_id = self._get_overlay_discord_id(channel)
                if discord_id:
                    # Map bot event types to overlay alert format
                    _overlay_map = {
                        'follow':   ('follow',   {'type': 'follow',    'name': data.get('user', '')}),
                        'sub':      ('sub',      {'type': 'sub',       'name': data.get('user', ''), 'tier': '1000', 'is_gift': False}),
                        'subgift':  ('gift_sub', {'type': 'gift_sub',  'gifter': data.get('gifter', ''), 'count': 1, 'tier': '1000'}),
                        'massgift': ('gift_sub', {'type': 'gift_sub',  'gifter': data.get('gifter', ''), 'count': int(data.get('count', 1)), 'tier': '1000'}),
                        'cheer':    ('bits',     {'type': 'bits',      'name': data.get('user', ''), 'amount': int(data.get('bits', 0)), 'message': ''}),
                        'raid':     ('raid',     {'type': 'raid',      'name': data.get('raider', ''), 'count': int(data.get('viewers', 0))}),
                    }
                    if event_type in _overlay_map:
                        alert_type, alert_data = _overlay_map[event_type]
                        overlays_mod.notify_alert_event(discord_id, alert_type, alert_data)
                        logger.debug(f'Overlay alert pushed: {alert_type} for {channel} (discord:{discord_id})')
        except Exception as e:
            logger.debug(f'Stream Overlays notification error: {e}')

        # ── 3. CubDeck — push to overlay event queue ───────────────────
        try:
            cubdeck_mod = sys.modules.get('cubdeck_blueprint')
            if cubdeck_mod and hasattr(cubdeck_mod, '_overlay_events'):
                discord_id = self._get_overlay_discord_id(channel)
                if discord_id:
                    events_queue = cubdeck_mod._overlay_events
                    key = f'{discord_id}/main'
                    if key not in events_queue:
                        events_queue[key] = []
                    events_queue[key].append({
                        'type':    f'cubassist_{event_type}',
                        'channel': channel,
                        'data':    data,
                        'ts':      time.time(),
                    })
                    if len(events_queue[key]) > 50:
                        events_queue[key] = events_queue[key][-50:]
                    logger.debug(f'CubDeck event pushed: cubassist_{event_type} for {channel}')
        except Exception as e:
            logger.debug(f'CubDeck notification error: {e}')

    def _poll_results_str(self, poll: dict) -> str:
        total = sum(poll['votes'].values())
        if not total:
            return f'Poll "{poll["question"]}" — no votes yet.'
        parts = []
        for i, opt in enumerate(poll['options']):
            count = poll['votes'].get(str(i + 1), 0)
            pct   = round(count / total * 100)
            parts.append(f'{i+1}) {opt}: {count} ({pct}%)')
        return f'Results — {poll["question"]}: ' + ' | '.join(parts)

    # ── Blackjack helpers ─────────────────────────────────────────────────

    def _bj_deck(self) -> list:
        suits = ['♠', '♥', '♦', '♣']
        ranks = ['2','3','4','5','6','7','8','9','10','J','Q','K','A']
        deck = [f'{r}{s}' for s in suits for r in ranks]
        random.shuffle(deck)
        return deck

    def _bj_value(self, hand: list) -> int:
        total, aces = 0, 0
        for card in hand:
            rank = card[:-1]
            if rank in ('J','Q','K'):   total += 10
            elif rank == 'A':           total += 11; aces += 1
            else:                       total += int(rank)
        while total > 21 and aces:
            total -= 10; aces -= 1
        return total

    def _bj_stand(self, nick, display_name, channel, state, cfg):
        g = state.blackjack.pop(nick, None)
        if not g: return
        dealer = g['dealer']
        deck   = g['deck']
        while self._bj_value(dealer) < 17:
            dealer.append(deck.pop())
        pval  = self._bj_value(g['hand'])
        dval  = self._bj_value(dealer)
        pts_cfg = cfg.get('points_config', {})
        pts_name = pts_cfg.get('name', 'points')
        pts = _load_points(channel)
        bet = g['bet']
        hand_str   = ', '.join(g['hand'])
        dealer_str = ', '.join(dealer)
        if dval > 21 or pval > dval:
            pts[nick] = pts.get(nick, 0) + bet * 2
            _save_points(channel, pts)
            self.send(f'🃏 @{display_name} wins! You: {hand_str} ({pval}) | Dealer: {dealer_str} ({dval}). +{bet*2} {pts_name}!', channel)
        elif pval == dval:
            pts[nick] = pts.get(nick, 0) + bet
            _save_points(channel, pts)
            self.send(f'🃏 Push! You: {hand_str} ({pval}) | Dealer: {dealer_str} ({dval}). Bet returned.', channel)
        else:
            self.send(f'🃏 @{display_name} loses! You: {hand_str} ({pval}) | Dealer: {dealer_str} ({dval}).', channel)

    # ── Twitch Helix API ──────────────────────────────────────────────────

    def _get_stream_info(self, channel: str, state: ChannelState):
        if state.stream_info and time.time() - state.stream_info_ts < 60:
            return state.stream_info
        try:
            client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
            token     = os.environ.get('CUBASSIST_BOT_TOKEN', '').replace('oauth:', '')
            req = urllib.request.Request(
                f'https://api.twitch.tv/helix/streams?user_login={channel}',
                headers={
                    'Client-Id':     client_id,
                    'Authorization': f'Bearer {token}',
                }
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                data = json.loads(r.read()).get('data', [])
            if not data:
                state.stream_info    = None
                state.stream_info_ts = time.time()
                return None
            s       = data[0]
            started = datetime.datetime.fromisoformat(s['started_at'].replace('Z', '+00:00'))
            elapsed = datetime.datetime.now(datetime.timezone.utc) - started
            h, rem  = divmod(int(elapsed.total_seconds()), 3600)
            m, sec  = divmod(rem, 60)
            state.stream_info = {
                'title':   s.get('title', ''),
                'game':    s.get('game_name', ''),
                'uptime':  f'{h}h {m}m' if h else f'{m}m {sec}s',
                'viewers': s.get('viewer_count', 0),
            }
            try:
                broadcaster_id = s.get('user_id', '')
                if broadcaster_id:
                    freq = urllib.request.Request(
                        f'https://api.twitch.tv/helix/channels/followers?broadcaster_id={broadcaster_id}',
                        headers={
                            'Client-Id':     client_id,
                            'Authorization': f'Bearer {token}',
                        }
                    )
                    with urllib.request.urlopen(freq, timeout=5) as fr:
                        fdata = json.loads(fr.read())
                    state.stream_info['followers'] = fdata.get('total', '?')
            except Exception:
                state.stream_info['followers'] = '?'
            state.stream_info_ts = time.time()
            return state.stream_info
        except Exception as e:
            logger.debug(f'Stream info error ({channel}): {e}')
            return state.stream_info


# ── Singleton ───────────────────────────────────────────────────────────────────

_bot: CubBot | None = None

def get_bot() -> CubBot:
    global _bot
    if _bot is None:
        _bot = CubBot()
    return _bot
