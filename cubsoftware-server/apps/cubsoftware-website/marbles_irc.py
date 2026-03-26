"""
Marbles Game — Twitch IRC Reader
Connects anonymously (justinfan) to Twitch IRC for read-only chat monitoring.
No OAuth required. Manages active game sessions and player queues.
Works independently of CubAssist.
"""

import socket
import ssl
import threading
import time
import random
import re
import json
import logging
import secrets
from collections import deque
from typing import Dict, Optional

logger = logging.getLogger('marbles_irc')

# ── Default marble roster ─────────────────────────────────────────────────────
DEFAULT_MARBLE_TYPES = [
    {'slot': 1, 'name': 'Inferno', 'color': '#f43f5e', 'icon': '🔥', 'restriction': None, 'enabled': True},
    {'slot': 2, 'name': 'Glacier', 'color': '#38bdf8', 'icon': '❄️',  'restriction': None, 'enabled': True},
    {'slot': 3, 'name': 'Thunder', 'color': '#fbbf24', 'icon': '⚡',  'restriction': None, 'enabled': True},
    {'slot': 4, 'name': 'Phantom', 'color': '#a78bfa', 'icon': '👻', 'restriction': None, 'enabled': True},
]

# IRC tag / bare PRIVMSG patterns
_TAG_RE  = re.compile(r'^@(\S+) :(\w+)!\S+ PRIVMSG #(\w+) :(.+)')
_BARE_RE = re.compile(r'^:(\w+)!\S+ PRIVMSG #(\w+) :(.+)')


def _parse_tags(tag_str: str) -> dict:
    result = {}
    for part in tag_str.split(';'):
        if '=' in part:
            k, _, v = part.partition('=')
            result[k] = v
    return result


def _viewer_roles(tags: dict) -> set:
    roles = set()
    if tags.get('subscriber') == '1':
        roles.add('subscriber')
    if tags.get('mod') == '1':
        roles.add('mod')
    badges = tags.get('badges', '')
    if 'broadcaster/1' in badges:
        roles.add('broadcaster')
        roles.add('mod')
    if 'vip/1' in badges:
        roles.add('vip')
    return roles


def _check_restriction(restriction, roles: set) -> bool:
    """Return True if viewer meets the marble restriction (or no restriction)."""
    if not restriction:
        return True
    return restriction in roles or 'broadcaster' in roles


# ── Ability catalogue ─────────────────────────────────────────────────────────
ABILITIES = {
    # Buff (help caller's own marble)
    'speed_burst':  {'cost': 50,  'type': 'buff',     'needs_target': False, 'duration': 3.0,  'label': 'Speed Burst'},
    'shield':       {'cost': 80,  'type': 'buff',     'needs_target': False, 'duration': 5.0,  'label': 'Shield'},
    'mega_bounce':  {'cost': 60,  'type': 'buff',     'needs_target': False, 'duration': 3.0,  'label': 'Mega Bounce'},
    'ghost':        {'cost': 100, 'type': 'buff',     'needs_target': False, 'duration': 4.0,  'label': 'Ghost Mode'},
    'shrink':       {'cost': 40,  'type': 'buff',     'needs_target': False, 'duration': 5.0,  'label': 'Shrink'},
    'jump':         {'cost': 35,  'type': 'buff',     'needs_target': False, 'duration': 0.0,  'label': 'Jump'},
    'sticky_wheels':{'cost': 45,  'type': 'buff',     'needs_target': False, 'duration': 3.0,  'label': 'Sticky Wheels'},
    # Sabotage (target another player's marble)
    'freeze':       {'cost': 70,  'type': 'sabotage', 'needs_target': True,  'duration': 1.5,  'label': 'Freeze'},
    'ice_blast':    {'cost': 50,  'type': 'sabotage', 'needs_target': True,  'duration': 2.0,  'label': 'Ice Blast'},
    'tp_home':      {'cost': 65,  'type': 'sabotage', 'needs_target': True,  'duration': 0.0,  'label': 'Teleport Home'},
    'swap':         {'cost': 120, 'type': 'sabotage', 'needs_target': True,  'duration': 0.0,  'label': 'Swap'},
    'earthquake':   {'cost': 80,  'type': 'sabotage', 'needs_target': True,  'duration': 2.0,  'label': 'Earthquake'},
    'magnet':       {'cost': 70,  'type': 'sabotage', 'needs_target': True,  'duration': 2.0,  'label': 'Magnet'},
    'reverse':      {'cost': 75,  'type': 'sabotage', 'needs_target': True,  'duration': 1.0,  'label': 'Reverse'},
    'gravity_flip': {'cost': 90,  'type': 'sabotage', 'needs_target': True,  'duration': 2.0,  'label': 'Gravity Flip'},
    'glue':         {'cost': 55,  'type': 'sabotage', 'needs_target': True,  'duration': 1.0,  'label': 'Glue'},
    'size_up':      {'cost': 60,  'type': 'sabotage', 'needs_target': True,  'duration': 5.0,  'label': 'Size Up'},
    # Global (affect all marbles)
    'global_quake': {'cost': 200, 'type': 'global',   'needs_target': False, 'duration': 1.5,  'label': 'Global Earthquake'},
    'global_grav':  {'cost': 250, 'type': 'global',   'needs_target': False, 'duration': 2.0,  'label': 'Global Gravity Flip'},
    'chaos':        {'cost': 300, 'type': 'global',   'needs_target': False, 'duration': 0.0,  'label': 'Chaos'},
    'speed_all':    {'cost': 180, 'type': 'global',   'needs_target': False, 'duration': 2.0,  'label': 'Speed Boost All'},
    # Session modifier (affects race results, not real-time physics)
    'double_coins': {'cost': 400, 'type': 'session',  'needs_target': False, 'duration': 0.0,  'label': 'Double Coins'},
}

# Aliases for user-friendly chat commands → canonical key
ABILITY_ALIASES = {
    'speed': 'speed_burst', 'speedburst': 'speed_burst', 'burst': 'speed_burst',
    'shield': 'shield',
    'bounce': 'mega_bounce', 'megabounce': 'mega_bounce',
    'ghost': 'ghost', 'ghostmode': 'ghost',
    'shrink': 'shrink',
    'jump': 'jump',
    'sticky': 'sticky_wheels', 'stickywheels': 'sticky_wheels',
    'freeze': 'freeze',
    'ice': 'ice_blast', 'iceblast': 'ice_blast',
    'home': 'tp_home', 'tphome': 'tp_home', 'teleport': 'tp_home',
    'swap': 'swap',
    'earthquake': 'earthquake', 'quake': 'earthquake',
    'magnet': 'magnet',
    'reverse': 'reverse',
    'gravity': 'gravity_flip', 'gravityflip': 'gravity_flip', 'grav': 'gravity_flip',
    'glue': 'glue',
    'sizeup': 'size_up', 'size': 'size_up', 'big': 'size_up',
    'globalquake': 'global_quake', 'gquake': 'global_quake',
    'globalgrav': 'global_grav', 'ggrav': 'global_grav',
    'chaos': 'chaos',
    'speedall': 'speed_all', 'boostall': 'speed_all',
    'doublecoin': 'double_coins', 'doublecoins': 'double_coins', 'coins2': 'double_coins', '2x': 'double_coins',
}


DEFAULT_SETTINGS = {
    'fall_mode':          'respawn',  # 'respawn' | 'elimination'
    'max_respawns':       -1,         # -1 = unlimited; ≥0 = limit
    'timeout_mins':       3,          # race timeout in minutes
    'gravity':            'normal',   # 'normal' | 'low' | 'high'
    'marble_friction':    'normal',   # 'low' | 'normal' | 'high'
    'announce_winner':    False,      # post winner to Twitch chat via CubAssist
    'coin_multiplier':    1,          # 1 | 2 | 3 — multiply all coin awards for this session
    'camera_lock':        'off',      # 'off' | 'leader' | 'overview' | 'side'
    'late_join':          False,      # allow !join during running state
    'abilities_enabled':  True,       # viewer coin abilities master switch
    'cosmetics_enabled':  True,       # show player skins / trails
    'discord_webhook':    '',         # Discord webhook URL for race result posts
    # Advanced game modes
    'handicap_enabled':   False,      # boost marbles at the back of the pack
    'handicap_strength':  0.2,        # 0.0–1.0 force multiplier for trailing marbles
    'team_mode':          False,      # split players into Red vs Blue teams
    'elimination_rounds': False,      # multi-round: last marble each round is eliminated
    'tournament_mode':    False,      # multi-race tournament with cumulative points
    'tournament_races':   3,          # number of races in the tournament (2–10)
    'ghost_marble':       False,      # show transparent ghost replaying the track record
    'gauntlet_mode':      False,      # spike strips eliminate marbles instead of respawning
}


class MarbleSession:
    def __init__(self, session_id: str, channel: str, join_cmd: str = '!join',
                 max_players: int = 100, settings: dict = None):
        self.id          = session_id
        self.channel     = channel.lower().strip('#')
        self.join_cmd    = join_cmd.lower().strip()
        self.max_players = max_players
        self.players: list = []          # [{'name': str, 'joined_at': float}]
        self._player_set: set = set()    # lowercase names for dedup
        self.state: str  = 'lobby'       # 'lobby' | 'running' | 'ended'
        self.created_at  = time.time()
        self.last_join   = 0.0
        self.results: list = []          # [{'rank', 'username', 'finish_time_ms', 'respawns'}]
        self.map_id: str   = ''          # SHA-256 map_id set when race starts; used for !record
        # Character select
        self.marble_types: list      = [dict(m) for m in DEFAULT_MARBLE_TYPES]
        self.player_selections: dict = {}   # username (lower) → slot int
        self.selection_open: bool    = False
        # Race settings
        s = settings or {}
        self.settings = {**DEFAULT_SETTINGS, **{k: v for k, v in s.items() if k in DEFAULT_SETTINGS}}
        # Chat buffer — last 30 messages from Twitch chat in this session's channel
        self.chat_buf: deque = deque(maxlen=30)
        # Ability queue — filled by IRC handler, drained by play.js poll
        self.ability_queue: list = []
        self.ability_log: list = []   # last 10 fired abilities for OBS panel
        self._ability_lock = threading.Lock()
        # Session-level ability flags
        self.double_coins_active: bool = False   # 2× coins for this race, reset after award
        # Team assignments (populated when session transitions to running in team_mode)
        self.teams: dict = {}   # login (lower) → 'red' | 'blue'
        # Tournament state
        self.tournament_race_num: int  = 0        # current race number (1-indexed when running)
        self.tournament_scores:   dict = {}       # login → cumulative tournament points
        # Elimination rounds state
        self.elimination_round:      int  = 0    # current round (1-indexed)
        self.elimination_eliminated: list = []   # logins eliminated in order

    def add_player(self, username: str, roles: set = None) -> bool:
        """Add player if lobby is open (or late_join during running) and not already joined."""
        username = username.lower()
        if self.state == 'ended':
            return False
        if self.state == 'running' and not self.settings.get('late_join', False):
            return False
        if self.state not in ('lobby', 'running'):
            return False
        if username in self._player_set:
            return False
        if len(self.players) >= self.max_players:
            return False
        self.players.append({'name': username, 'joined_at': time.time(), 'roles': list(roles or [])})
        self._player_set.add(username)
        self.last_join = time.time()
        return True

    def get_player_roles(self) -> dict:
        """Return {username: set_of_roles} for all players in this session."""
        return {p['name']: set(p.get('roles', [])) for p in self.players}

    def push_ability(self, event: dict):
        """Add an ability event to the queue and update the log."""
        with self._ability_lock:
            self.ability_queue.append(event)
            self.ability_log.append(event)
            if len(self.ability_log) > 10:
                self.ability_log = self.ability_log[-10:]

    def get_ability_log(self) -> list:
        """Return the last 10 fired abilities (newest first)."""
        with self._ability_lock:
            return list(reversed(self.ability_log))

    def drain_abilities(self) -> list:
        """Return and clear the pending ability queue."""
        with self._ability_lock:
            items = list(self.ability_queue)
            self.ability_queue.clear()
        return items

    def pick_marble(self, username: str, slot: int, roles: set) -> tuple:
        """Assign slot to username. Returns (True, marble_type_dict) or (False, reason_str)."""
        username = username.lower()
        mt = next((m for m in self.marble_types if m['slot'] == slot and m['enabled']), None)
        if not mt:
            return False, 'Slot not available'
        if not _check_restriction(mt.get('restriction'), roles):
            return False, f'Requires {mt["restriction"]} status'
        self.player_selections[username] = slot
        return True, mt

    def remove_player(self, username: str):
        username = username.lower()
        self.players = [p for p in self.players if p['name'] != username]
        self._player_set.discard(username)

    def to_dict(self) -> dict:
        return {
            'id':                self.id,
            'channel':           self.channel,
            'state':             self.state,
            'join_cmd':          self.join_cmd,
            'max_players':       self.max_players,
            'player_count':      len(self.players),
            'players':           [p['name'] for p in self.players],
            'created_at':        self.created_at,
            'results':           self.results,
            'marble_types':      self.marble_types,
            'player_selections': self.player_selections,
            'selection_open':    self.selection_open,
            'settings':          self.settings,
            'teams':                self.teams,
            'double_coins_active':  self.double_coins_active,
            'tournament_race_num':  self.tournament_race_num,
            'tournament_scores':    self.tournament_scores,
            'elimination_round':      self.elimination_round,
            'elimination_eliminated': self.elimination_eliminated,
        }


class MarbleIRCManager:
    """
    Singleton that maintains one anonymous Twitch IRC connection, joining all
    channels that have active marble sessions and routing !join messages.
    """
    _instance = None
    _instance_lock = threading.Lock()

    def __init__(self):
        self._sessions: Dict[str, MarbleSession] = {}
        self._channel_sessions: Dict[str, set]   = {}   # channel -> {session_id, ...}
        self._sock    = None
        self._thread: Optional[threading.Thread] = None
        self._running = False
        self._connected = False
        self._joined_channels: set = set()
        self._write_lock = threading.Lock()
        self._cmd_cooldowns: Dict[str, float]    = {}   # f'{channel}:{cmd}' -> last_used timestamp

    @classmethod
    def get_instance(cls) -> 'MarbleIRCManager':
        if cls._instance is None:
            with cls._instance_lock:
                if cls._instance is None:
                    cls._instance = cls()
        return cls._instance

    # ── Public API ────────────────────────────────────────────────────────────

    def create_session(self, channel: str, join_cmd: str = '!join',
                       max_players: int = 100,
                       marble_types: list = None,
                       settings: dict = None) -> MarbleSession:
        session_id = secrets.token_urlsafe(12)
        session    = MarbleSession(session_id, channel, join_cmd, max_players, settings)
        if marble_types is not None:
            session.marble_types = marble_types

        with self._write_lock:
            self._sessions[session_id] = session
            ch = session.channel
            if ch not in self._channel_sessions:
                self._channel_sessions[ch] = set()
            self._channel_sessions[ch].add(session_id)

        self._ensure_running()
        self._join_channel(session.channel)
        self._cleanup_old()
        logger.info(f'Marble session {session_id} created for #{channel}')
        return session

    def get_session(self, session_id: str) -> Optional[MarbleSession]:
        return self._sessions.get(session_id)

    def all_sessions(self) -> list:
        """Return all sessions (including ended) as dicts, newest first."""
        return [s.to_dict() for s in sorted(
            self._sessions.values(),
            key=lambda s: s.created_at if hasattr(s, 'created_at') else 0,
            reverse=True,
        )]

    def start_race(self, session_id: str, map_id: str = '') -> bool:
        session = self._sessions.get(session_id)
        if session and session.state == 'lobby':
            session.state  = 'running'
            session.map_id = map_id
            logger.info(f'Marble session {session_id} race started ({len(session.players)} players)')
            return True
        return False

    def end_session(self, session_id: str):
        session = self._sessions.get(session_id)
        if not session:
            return
        session.state = 'ended'
        ch = session.channel
        with self._write_lock:
            if ch in self._channel_sessions:
                self._channel_sessions[ch].discard(session_id)
                if not self._channel_sessions[ch]:
                    del self._channel_sessions[ch]
                    self._part_channel(ch)
        # Keep session data for 10 min so results can be fetched, then remove
        threading.Timer(600, lambda: self._sessions.pop(session_id, None)).start()
        logger.info(f'Marble session {session_id} ended')

    def reset_lobby(self, session_id: str):
        """Clear all players and reopen the lobby."""
        session = self._sessions.get(session_id)
        if session:
            session.players.clear()
            session._player_set.clear()
            session.state = 'lobby'

    def kick_player(self, session_id: str, username: str):
        session = self._sessions.get(session_id)
        if session:
            session.remove_player(username)

    def get_chat(self, session_id: str, since_ts: int = 0) -> list:
        """Return chat messages for a session, optionally only those newer than since_ts."""
        session = self._sessions.get(session_id)
        if not session:
            return []
        return [m for m in session.chat_buf if m['ts'] > since_ts]

    def connection_status(self) -> dict:
        return {
            'connected': self._connected,
            'running':   self._running,
            'channels':  list(self._joined_channels),
            'sessions':  len([s for s in self._sessions.values() if s.state != 'ended']),
        }

    # ── Chat command helpers ───────────────────────────────────────────────────

    def _cooldown_ok(self, channel: str, cmd: str, seconds: int = 30) -> bool:
        key = f'{channel}:{cmd}'
        now = time.time()
        if now - self._cmd_cooldowns.get(key, 0) < seconds:
            return False
        self._cmd_cooldowns[key] = now
        return True

    def post_achievement_feed(self, channel: str, achievements_by_player: dict):
        """
        Post new achievements to chat. Called after a race ends.
        achievements_by_player: {login: [{name, icon, ...}, ...]}
        Max 1 message per race to avoid spam.
        """
        lines = []
        for login, achs in achievements_by_player.items():
            if achs:
                icons = ''.join(a.get('icon', '🏆') for a in achs)
                names = ', '.join(a.get('name', '') for a in achs)
                lines.append(f'{login} unlocked {icons} {names}!')
        if lines:
            msg = '🏆 New achievements: ' + ' | '.join(lines[:3])  # cap at 3 to avoid spam
            self._bot_reply(channel, msg)

    def _bot_reply(self, channel: str, message: str):
        """Send a chat message via the CubAssist bot (same process, lazy import)."""
        try:
            from bot_core import get_bot
            get_bot().send(message, channel)
        except Exception as e:
            logger.debug(f'Marble bot reply failed in #{channel}: {e}')

    # ── IRC internals ─────────────────────────────────────────────────────────

    def _ensure_running(self):
        if not self._running:
            self._running = True
            self._thread = threading.Thread(target=self._irc_loop, daemon=True, name='marbles-irc')
            self._thread.start()

    def _irc_loop(self):
        while self._running:
            try:
                self._connect()
                self._listen()
            except Exception as e:
                logger.warning(f'Marble IRC error: {e}')
            self._connected = False
            self._joined_channels.clear()
            if self._running and self._channel_sessions:
                logger.info('Marble IRC reconnecting in 5s…')
                time.sleep(5)
            else:
                self._running = False
                break

    def _connect(self):
        nick = f'justinfan{random.randint(10000, 99999)}'
        raw  = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        ctx  = ssl.create_default_context()
        sock = ctx.wrap_socket(raw, server_hostname='irc.chat.twitch.tv')
        sock.settimeout(300)
        sock.connect(('irc.chat.twitch.tv', 6697))
        self._sock = sock

        def send(msg):
            sock.send((msg + '\r\n').encode('utf-8'))

        send(f'NICK {nick}')
        send('CAP REQ :twitch.tv/tags twitch.tv/commands')

        channels = list(self._channel_sessions.keys())
        for ch in channels:
            send(f'JOIN #{ch}')
            self._joined_channels.add(ch)

        self._connected = True
        logger.info(f'Marble IRC connected as {nick}, channels: {channels}')

    def _listen(self):
        buf = ''
        while self._running:
            try:
                data = self._sock.recv(4096).decode('utf-8', errors='ignore')
            except socket.timeout:
                if self._sock:
                    try:
                        self._sock.send('PING :tmi.twitch.tv\r\n'.encode())
                    except Exception:
                        break
                continue
            if not data:
                break
            buf += data
            while '\r\n' in buf:
                line, buf = buf.split('\r\n', 1)
                if line:
                    try:
                        self._handle_line(line)
                    except Exception:
                        pass

    def _handle_line(self, line: str):
        # PING keep-alive
        if line.startswith('PING'):
            if self._sock:
                self._sock.send(('PONG' + line[4:] + '\r\n').encode('utf-8'))
            return

        # Parse PRIVMSG — tag-prefixed form first, then bare
        m_tag  = _TAG_RE.match(line)
        m_bare = _BARE_RE.match(line)
        if m_tag:
            tags     = _parse_tags(m_tag.group(1))
            username = m_tag.group(2).lower()
            channel  = m_tag.group(3).lower()
            message  = m_tag.group(4).strip()
            roles    = _viewer_roles(tags)
        elif m_bare:
            username = m_bare.group(1).lower()
            channel  = m_bare.group(2).lower()
            message  = m_bare.group(3).strip()
            roles    = set()
        else:
            return

        session_ids = self._channel_sessions.get(channel, set())

        # ── Buffer chat for display overlay ───────────────────────────────────
        for _sid in session_ids:
            _sess = self._sessions.get(_sid)
            if _sess and _sess.state != 'ended':
                _sess.chat_buf.append({'user': username, 'text': message,
                                       'ts': int(time.time() * 1000)})

        # ── Channel-level commands (work in any active session) ────────────────
        if session_ids:
            msg_lower_ch = message.lower().strip()

            # !score — caller's points, rank, and coin balance
            if msg_lower_ch == '!score' and self._cooldown_ok(channel, '!score', 30):
                try:
                    from marbles_db import get_player, get_player_rank
                    player = get_player(username)
                    if player:
                        rank  = get_player_rank(username)
                        pts   = player['points']
                        coins = player['coins']
                        self._bot_reply(channel,
                            f'{username}: #{rank} · {pts} pts · {coins} coins '
                            f'({player["wins"]}W / {player["races_played"]} races)')
                    else:
                        self._bot_reply(channel, f'{username}: No stats yet — join a race first!')
                except Exception as e:
                    logger.debug(f'!score error: {e}')

            # !leaderboard — top 3 by points
            elif msg_lower_ch == '!leaderboard' and self._cooldown_ok(channel, '!leaderboard', 60):
                try:
                    from marbles_db import get_leaderboard
                    top = get_leaderboard(sort_by='points', limit=3)
                    if top:
                        parts = [f'#{i+1} {p["twitch_login"]} ({p["points"]} pts)' for i, p in enumerate(top)]
                        self._bot_reply(channel, '🏆 Marble Leaderboard: ' + ' | '.join(parts)
                                        + ' — cubsoftware.site/marbles/leaderboard')
                    else:
                        self._bot_reply(channel, 'No marble races recorded yet!')
                except Exception as e:
                    logger.debug(f'!leaderboard error: {e}')

            # !achievements — caller's achievement list
            elif msg_lower_ch.startswith('!achievements') and self._cooldown_ok(channel, f'!achievements:{username}', 30):
                try:
                    from marbles_db import get_player_achievements
                    achs = get_player_achievements(username)
                    if achs:
                        icons = ''.join(a['icon'] for a in achs[:8])
                        self._bot_reply(channel,
                            f'{username} has {len(achs)} achievement(s): {icons} — cubsoftware.site/marbles/player/{username}')
                    else:
                        self._bot_reply(channel, f'{username}: No achievements yet — race to earn them!')
                except Exception as e:
                    logger.debug(f'!achievements error: {e}')

            # !record — track record for the current map (or most recent if no map)
            elif msg_lower_ch == '!record' and self._cooldown_ok(channel, '!record', 30):
                try:
                    from marbles_db import get_track_record_for_map, get_track_records
                    rec = None
                    # Try the current session's map first
                    active = next((self._sessions.get(sid) for sid in session_ids
                                   if self._sessions.get(sid) and self._sessions.get(sid).state in ('running', 'ended')
                                   and self._sessions.get(sid).map_id), None)
                    if active and active.map_id:
                        rec = get_track_record_for_map(active.map_id)
                    if not rec:
                        recs = get_track_records(limit=1)
                        rec  = recs[0] if recs else None
                    if rec:
                        ms  = rec['finish_time_ms']
                        t   = f'{ms // 60000}:{(ms % 60000) / 1000:05.2f}'
                        self._bot_reply(channel,
                            f'⏱ Record on "{rec["map_name"]}": {t} by {rec["twitch_login"]}')
                    else:
                        self._bot_reply(channel, 'No track records yet!')
                except Exception as e:
                    logger.debug(f'!record error: {e}')

        for sid in list(session_ids):
            session = self._sessions.get(sid)
            if not session:
                continue
            msg_lower = message.lower()

            # ── Character select: !play / !play N ─────────────────────────────
            # During selection phase, !play picks a marble slot AND joins the lobby
            if session.selection_open and session.state == 'lobby':
                if msg_lower == '!play' or msg_lower.startswith('!play '):
                    slot_str = msg_lower[5:].strip()
                    if slot_str.isdigit():
                        slot = int(slot_str)
                    else:
                        # Random enabled slot
                        enabled = [m['slot'] for m in session.marble_types if m['enabled']]
                        if not enabled:
                            continue
                        slot = random.choice(enabled)
                    ok, _ = session.pick_marble(username, slot, roles)
                    if ok:
                        session.add_player(username, roles)   # also joins the race
                        logger.debug(f'Marble select+join: {username} → slot {slot} (session {sid})')
                    continue

            # ── Chat ability: !ability <name> [@target] ────────────────────────
            if (session.state == 'running' and
                    session.settings.get('abilities_enabled', True) and
                    msg_lower.startswith('!ability ')):
                parts   = msg_lower.split()
                ab_raw  = parts[1].replace('-', '_').replace(' ', '_') if len(parts) > 1 else ''
                ab_key  = ABILITY_ALIASES.get(ab_raw) or (ab_raw if ab_raw in ABILITIES else None)
                if ab_key:
                    defn    = ABILITIES[ab_key]
                    ab_type = defn['type']
                    target  = None
                    # Determine target
                    if ab_type == 'sabotage':
                        # Target from @mention or next word
                        for p in parts[2:]:
                            t = p.lstrip('@').lower()
                            if t and t in session._player_set:
                                target = t
                                break
                        if not target:
                            continue  # sabotage with no valid target — ignore silently
                        if target == username:
                            continue  # can't sabotage yourself
                    elif ab_type == 'buff':
                        if username not in session._player_set:
                            continue  # must be a racer to use buff
                        target = username

                    # Deduct coins (with refund handled server-side)
                    try:
                        from marbles_db import get_coins_balance, adjust_coins
                        cost    = defn['cost']
                        balance = get_coins_balance(username)
                        if balance < cost:
                            self._bot_reply(channel, f'{username}: Not enough coins (need {cost}, have {balance}).')
                            continue
                        adjust_coins(username, -cost, reason=f'ability:{ab_key}')

                        # Session-modifier abilities set flags rather than going to the physics queue
                        if ab_type == 'session':
                            if ab_key == 'double_coins':
                                session.double_coins_active = True
                                # Notify play.js via queue so HUD can display the banner
                                session.push_ability({
                                    'ability':  ab_key,
                                    'label':    defn['label'],
                                    'type':     ab_type,
                                    'caster':   username,
                                    'target':   None,
                                    'duration': 0.0,
                                    'ts':       time.time(),
                                })
                                self._bot_reply(channel, f'🪙 @{username} activated Double Coins! Everyone earns 2× coins this race!')
                        else:
                            session.push_ability({
                                'ability':  ab_key,
                                'label':    defn['label'],
                                'type':     ab_type,
                                'caster':   username,
                                'target':   target,
                                'duration': defn['duration'],
                                'ts':       time.time(),
                            })
                        logger.debug(f'Ability {ab_key} by {username} → {target or "all"}')
                    except Exception as e:
                        logger.debug(f'Ability error: {e}')
                continue

            # ── Lobby join: !join (or custom join_cmd) ─────────────────────────
            late_join_ok = session.state == 'running' and session.settings.get('late_join', False)
            if session.state != 'lobby' and not late_join_ok:
                continue
            if msg_lower == session.join_cmd or msg_lower.startswith(session.join_cmd + ' '):
                if session.add_player(username, roles):
                    logger.debug(f'Marble {username} joined #{channel} (session {sid})')

    def _join_channel(self, channel: str):
        if self._connected and self._sock and channel not in self._joined_channels:
            try:
                self._sock.send(f'JOIN #{channel}\r\n'.encode('utf-8'))
                self._joined_channels.add(channel)
            except Exception:
                pass

    def _part_channel(self, channel: str):
        if self._connected and self._sock and channel in self._joined_channels:
            try:
                self._sock.send(f'PART #{channel}\r\n'.encode('utf-8'))
                self._joined_channels.discard(channel)
            except Exception:
                pass

    def _cleanup_old(self):
        """Remove sessions ended more than 1 hour ago."""
        cutoff   = time.time() - 3600
        to_drop  = [sid for sid, s in self._sessions.items()
                    if s.state == 'ended' and s.created_at < cutoff]
        for sid in to_drop:
            self._sessions.pop(sid, None)
