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

# ── CubAssist multi-channel IRC bot ────────────────────────────────────────────

PROTECTED = {
    'commands', 'uptime', 'game', 'title', 'shoutout', 'permit',
    'addcom', 'editcom', 'delcom', 'so',
    'setvar', 'delvar', 'addquote', 'delquote', 'quote',
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

    # ── Sending ───────────────────────────────────────────────────────────

    def send(self, message, channel):
        if message and channel:
            self._raw(f'PRIVMSG #{channel.lower().strip("#")} :{message}')

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
            'ts':    int(time.time()),
            'nick':  display_name,
            'text':  text,
            'level': user_level,
            'color': tags.get('color', ''),
        })
        if len(state.chat_log) > 200:
            state.chat_log = state.chat_log[-200:]
        state.line_count += 1

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
            if target:
                self.send(f'Check out {target} at twitch.tv/{target.lower()} !', channel)

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
