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
        'points_config': {'enabled': False, 'name': 'points', 'per_message': 1, 'per_minute': 5, 'trivia_reward': 100},
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

    # ── Sending ───────────────────────────────────────────────────────────

    def send(self, message, channel):
        """Send a chat message. Uses Helix API (Chat Bot badge) with IRC fallback."""
        if not message or not channel:
            return
        channel = channel.lower().strip('#')
        if not self._try_helix_send(message, channel):
            self._raw(f'PRIVMSG #{channel} :{message}')

    def _try_helix_send(self, message: str, channel: str) -> bool:
        """POST to /helix/chat/messages with app access token for the Chat Bot badge.
        Returns True on success, False if unavailable or failed (IRC fallback kicks in)."""
        try:
            app_token      = self._get_app_token()
            if not app_token:
                return False
            broadcaster_id = self._get_broadcaster_id(channel)
            bot_user_id    = self._get_bot_user_id()
            if not broadcaster_id or not bot_user_id:
                return False
            client_id = os.environ.get('TWITCH_CLIENT_ID', '9n9yjc79p44kpsluv81kvvh6h9bxvu')
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
                    'Authorization': f'Bearer {app_token}',
                    'Content-Type':  'application/json',
                },
            )
            with urllib.request.urlopen(req, timeout=5) as r:
                resp = json.loads(r.read())
            drop = (resp.get('data') or [{}])[0].get('drop_reason')
            if drop:
                logger.warning(f'Helix message dropped in #{channel}: {drop}')
                return False
            return True
        except Exception as e:
            logger.debug(f'Helix send failed in #{channel}: {e}')
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

        self._builtin(cmd_name, query, display_name, user_level, user_id, channel, state, cfg)

    def _builtin(self, cmd_name, query, display_name, user_level, user_id, channel, state, cfg):
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
                    f'https://wttr.in/{encoded}?format=3',
                    headers={'User-Agent': 'CubAssist/1.0'}
                )
                with urllib.request.urlopen(req, timeout=6) as r:
                    result = r.read(200).decode('utf-8', errors='replace').strip()
                self.send(f'🌤 {result}', channel)
            except Exception:
                self.send(f'Could not get weather for {city}.', channel)

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

    # ── Helpers ───────────────────────────────────────────────────────────

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
