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

    return text

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
}

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
            }
            response = resolve_vars(custom.get('response', ''), ctx)
            if response:
                self.send(response, channel)
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
            for r in sorted(ranks, key=lambda x: x.get('points', 0), reverse=True):
                if balance >= r.get('points', 0):
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
                        # Stream just ended - auto recap if configured
                        state.stream_was_live = False
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
