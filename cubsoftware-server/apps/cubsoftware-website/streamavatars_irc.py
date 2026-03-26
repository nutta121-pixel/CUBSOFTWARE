"""
StreamAvatars — Twitch IRC chat reader
Manages one connection per channel; tracks active chatters and queues events
for the overlay to consume.
"""
import socket, threading, time, re, queue
from collections import deque

_TWITCH_HOST = 'irc.chat.twitch.tv'
_TWITCH_PORT = 6667
_NICK        = 'justinfan{:d}'.format(__import__('random').randint(10000, 99999))
_PING_INTERVAL = 60    # seconds between PING keepalives
_CHATTER_TTL   = 600   # seconds a chatter stays "active" after their last message

_sessions: dict = {}   # channel → StreamAvatarsSession
_sessions_lock  = threading.Lock()


# ─────────────────────────────────────────────────────────────────────────────

class StreamAvatarsSession:
    def __init__(self, channel: str):
        self.channel     = channel.lower().lstrip('#')
        self._sock       = None
        self._thread     = None
        self._running    = False
        self._seq        = 0              # monotonic event counter
        self._events     = deque(maxlen=200)  # recent events
        self._chatters: dict = {}         # login → {'last_seen': ts, 'display': str}
        self._lock       = threading.Lock()

    # ── Public API ────────────────────────────────────────────────────────────

    def get_events(self, after_seq: int = 0):
        """Return events with seq > after_seq."""
        with self._lock:
            return [e for e in self._events if e['seq'] > after_seq]

    def get_active_chatters(self):
        """Return logins seen within the last CHATTER_TTL seconds."""
        now = time.time()
        with self._lock:
            return {
                login: info for login, info in self._chatters.items()
                if now - info['last_seen'] < _CHATTER_TTL
            }

    # ── IRC Thread ────────────────────────────────────────────────────────────

    def start(self):
        if self._running:
            return
        self._running = True
        self._thread  = threading.Thread(target=self._run, daemon=True,
                                         name=f'sa-irc-{self.channel}')
        self._thread.start()

    def stop(self):
        self._running = False
        try:
            if self._sock:
                self._sock.close()
        except Exception:
            pass

    def _run(self):
        while self._running:
            try:
                self._connect()
                self._read_loop()
            except Exception:
                pass
            if self._running:
                time.sleep(5)   # reconnect backoff

    def _connect(self):
        self._sock = socket.socket()
        self._sock.settimeout(90)
        self._sock.connect((_TWITCH_HOST, _TWITCH_PORT))
        self._send(f'PASS oauth:anonymous')
        self._send(f'NICK {_NICK}')
        self._send(f'JOIN #{self.channel}')
        self._last_ping = time.time()

    def _send(self, msg: str):
        self._sock.sendall((msg + '\r\n').encode('utf-8', errors='ignore'))

    def _read_loop(self):
        buf = ''
        while self._running:
            if time.time() - self._last_ping > _PING_INTERVAL:
                self._send('PING :tmi.twitch.tv')
                self._last_ping = time.time()

            try:
                chunk = self._sock.recv(4096).decode('utf-8', errors='ignore')
            except socket.timeout:
                continue
            if not chunk:
                break
            buf += chunk
            while '\n' in buf:
                line, buf = buf.split('\n', 1)
                self._handle(line.strip())

    _PRIVMSG_RE = re.compile(
        r'^:(?P<login>[^!]+)![^@]+@[^ ]+ PRIVMSG #[^ ]+ :(?P<text>.+)$'
    )

    def _handle(self, line: str):
        if line.startswith('PING'):
            self._send('PONG :tmi.twitch.tv')
            self._last_ping = time.time()
            return

        m = self._PRIVMSG_RE.match(line)
        if not m:
            return

        login   = m.group('login').lower()
        text    = m.group('text').strip()
        display = login  # fallback (Twitch IRCv3 tags would give display-name)

        # Parse IRCv3 display-name tag if present
        tag_match = re.match(r'^@[^:]*display-name=([^;]+)', line)
        if tag_match:
            display = tag_match.group(1) or login

        now = time.time()
        with self._lock:
            self._chatters[login] = {'last_seen': now, 'display': display}
            self._seq += 1
            event = {
                'seq':     self._seq,
                'ts':      now,
                'login':   login,
                'display': display,
                'type':    'message',
                'text':    text,
            }
            # Detect commands
            lower = text.lower().strip()
            if lower == '!jump':
                event['type'] = 'jump'
            elif lower == '!run':
                event['type'] = 'run'
            elif lower == '!dance':
                event['type'] = 'dance'

            self._events.append(event)


# ─────────────────────────────────────────────────────────────────────────────
# Module-level helpers

def get_or_create(channel: str) -> StreamAvatarsSession:
    channel = channel.lower().lstrip('#')
    with _sessions_lock:
        if channel not in _sessions:
            s = StreamAvatarsSession(channel)
            s.start()
            _sessions[channel] = s
        return _sessions[channel]


def get_session(channel: str):
    return _sessions.get(channel.lower().lstrip('#'))
