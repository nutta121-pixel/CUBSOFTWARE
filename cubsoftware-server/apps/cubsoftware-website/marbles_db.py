"""
Marbles Game — SQLite statistics database.
Stores player points, coins, race history, and per-map track records.
"""

import sqlite3
import os
import time
import threading
import secrets
import logging

logger = logging.getLogger('marbles_db')

_DB_PATH = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'marbles.db')
)
_lock = threading.Lock()


def _conn():
    c = sqlite3.connect(_DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA foreign_keys=ON')
    return c


def init_db():
    """Create tables if they don't exist. Called once at startup."""
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS marble_players (
            twitch_login        TEXT PRIMARY KEY,
            wins                INTEGER DEFAULT 0,
            races_played        INTEGER DEFAULT 0,
            points              INTEGER DEFAULT 0,
            coins               INTEGER DEFAULT 0,
            coins_earned_total  INTEGER DEFAULT 0,
            clean_races         INTEGER DEFAULT 0,
            comeback_king       INTEGER DEFAULT 0,
            total_finish_ms     INTEGER DEFAULT 0,
            last_played         REAL    DEFAULT 0,
            win_streak          INTEGER DEFAULT 0,
            best_win_streak     INTEGER DEFAULT 0,
            total_respawns      INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS marble_races (
            race_id      TEXT PRIMARY KEY,
            map_id       TEXT,
            map_name     TEXT,
            channel      TEXT,
            played_at    REAL,
            player_count INTEGER,
            winner       TEXT
        );

        CREATE TABLE IF NOT EXISTS marble_race_results (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            race_id         TEXT,
            twitch_login    TEXT,
            rank            INTEGER,
            finish_time_ms  INTEGER,
            points_awarded  INTEGER DEFAULT 0,
            coins_awarded   INTEGER DEFAULT 0,
            respawns        INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS marble_track_records (
            map_id          TEXT PRIMARY KEY,
            map_name        TEXT,
            twitch_login    TEXT,
            finish_time_ms  INTEGER,
            race_id         TEXT,
            set_at          REAL
        );

        CREATE INDEX IF NOT EXISTS idx_results_login  ON marble_race_results(twitch_login);
        CREATE INDEX IF NOT EXISTS idx_results_race   ON marble_race_results(race_id);
        CREATE INDEX IF NOT EXISTS idx_races_played   ON marble_races(played_at);

        CREATE TABLE IF NOT EXISTS marble_maps (
            map_id       TEXT PRIMARY KEY,
            name         TEXT NOT NULL,
            description  TEXT DEFAULT '',
            author_login TEXT,
            map_data     TEXT,
            piece_count  INTEGER DEFAULT 0,
            play_count   INTEGER DEFAULT 0,
            published_at REAL,
            thumbnail    TEXT DEFAULT NULL,
            tags         TEXT DEFAULT ''
        );
        CREATE INDEX IF NOT EXISTS idx_maps_pub ON marble_maps(published_at DESC);

        CREATE TABLE IF NOT EXISTS marble_map_versions (
            version_id   TEXT PRIMARY KEY,
            map_id       TEXT NOT NULL,
            version_num  INTEGER NOT NULL,
            map_data     TEXT,
            piece_count  INTEGER DEFAULT 0,
            saved_at     REAL
        );
        CREATE INDEX IF NOT EXISTS idx_mapver_map ON marble_map_versions(map_id, version_num DESC);

        CREATE TABLE IF NOT EXISTS marble_map_ratings (
            rating_id   TEXT PRIMARY KEY,
            map_id      TEXT NOT NULL,
            user_login  TEXT NOT NULL,
            vote        INTEGER NOT NULL,
            rated_at    REAL,
            UNIQUE(map_id, user_login)
        );
        CREATE INDEX IF NOT EXISTS idx_ratings_map ON marble_map_ratings(map_id);

        CREATE TABLE IF NOT EXISTS marble_coin_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            twitch_login TEXT NOT NULL,
            amount       INTEGER NOT NULL,
            reason       TEXT NOT NULL,
            race_id      TEXT,
            ts           REAL
        );
        CREATE INDEX IF NOT EXISTS idx_coin_log_login ON marble_coin_log(twitch_login);

        CREATE TABLE IF NOT EXISTS marble_achievements (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            twitch_login    TEXT NOT NULL,
            achievement_key TEXT NOT NULL,
            unlocked_at     REAL,
            UNIQUE(twitch_login, achievement_key)
        );
        CREATE INDEX IF NOT EXISTS idx_ach_login ON marble_achievements(twitch_login);

        CREATE TABLE IF NOT EXISTS marble_player_settings (
            twitch_login    TEXT PRIMARY KEY,
            settings_json   TEXT NOT NULL DEFAULT '{}',
            updated_at      REAL
        );

        CREATE TABLE IF NOT EXISTS marble_seasons (
            season_id   TEXT PRIMARY KEY,
            name        TEXT NOT NULL,
            started_at  REAL,
            ended_at    REAL,
            winner      TEXT,
            active      INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS marble_season_results (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            season_id    TEXT NOT NULL,
            twitch_login TEXT NOT NULL,
            points       INTEGER DEFAULT 0,
            wins         INTEGER DEFAULT 0,
            races        INTEGER DEFAULT 0,
            season_rank  INTEGER,
            UNIQUE(season_id, twitch_login)
        );
        CREATE INDEX IF NOT EXISTS idx_season_results ON marble_season_results(season_id);

        CREATE TABLE IF NOT EXISTS marble_cosmetics (
            twitch_login        TEXT PRIMARY KEY,
            unlocked_skins      TEXT NOT NULL DEFAULT '["solid"]',
            unlocked_trails     TEXT NOT NULL DEFAULT '["classic"]',
            unlocked_accessories TEXT NOT NULL DEFAULT '[]',
            equipped_skin       TEXT NOT NULL DEFAULT 'solid',
            equipped_trail      TEXT NOT NULL DEFAULT 'none',
            equipped_accessory  TEXT NOT NULL DEFAULT 'none',
            updated_at          REAL
        );
        """)
    # Migrate existing databases — add columns added after initial schema
    _migrate_columns()
    logger.info(f'Marble DB ready at {_DB_PATH}')


def _migrate_columns():
    """Add any new columns to existing databases. Safe to call repeatedly."""
    migrations = [
        ('marble_players', 'coins_earned_total', 'INTEGER DEFAULT 0'),
        ('marble_players', 'clean_races',        'INTEGER DEFAULT 0'),
        ('marble_players', 'comeback_king',      'INTEGER DEFAULT 0'),
        ('marble_maps',    'thumbnail',        'TEXT DEFAULT NULL'),
        ('marble_maps',    'tags',             "TEXT DEFAULT ''"),
        ('marble_maps',    'featured',         'INTEGER DEFAULT 0'),
        ('marble_maps',    'current_version',  'INTEGER DEFAULT 1'),
        ('marble_players', 'banned',              'INTEGER DEFAULT 0'),
        ('marble_track_records', 'ghost_path',   'TEXT DEFAULT NULL'),
    ]
    with _conn() as c:
        for table, col, typedef in migrations:
            try:
                c.execute(f'ALTER TABLE {table} ADD COLUMN {col} {typedef}')
            except Exception:
                pass  # Column already exists


# ── Achievement definitions ────────────────────────────────────────────────────
ACHIEVEMENTS = {
    'first_steps':       {'name': 'First Steps',       'desc': 'Complete your first race',                    'icon': '👟', 'secret': False},
    'podium_finish':     {'name': 'Podium Finish',      'desc': 'Finish in the top 3',                         'icon': '🏅', 'secret': False},
    'champion':          {'name': 'Champion',           'desc': 'Win a race',                                  'icon': '🥇', 'secret': False},
    'hat_trick':         {'name': 'Hat Trick',          'desc': 'Win 3 races in a row',                        'icon': '🎩', 'secret': False},
    'unstoppable':       {'name': 'Unstoppable',        'desc': 'Win 10 races in a row',                       'icon': '🔥', 'secret': False},
    'century':           {'name': 'Century',            'desc': 'Play 100 races',                              'icon': '💯', 'secret': False},
    'speed_demon':       {'name': 'Speed Demon',        'desc': 'Set a track record',                          'icon': '⚡', 'secret': False},
    'untouchable':       {'name': 'Untouchable',        'desc': 'Win without any respawns',                    'icon': '🛡️', 'secret': False},
    'comeback_kid':      {'name': 'Comeback Kid',       'desc': 'Win after being last at the halfway point',   'icon': '💪', 'secret': False},
    'participant_award': {'name': 'Participant Award',  'desc': 'Finish last in a race with 20+ players',      'icon': '🏳️', 'secret': True},
    'night_owl':         {'name': 'Night Owl',          'desc': 'Play a race between midnight and 4am',        'icon': '🦉', 'secret': False},
    'veteran':           {'name': 'Veteran',            'desc': 'Play 500 races',                              'icon': '🎖️', 'secret': False},
    'legend':            {'name': 'Legend',             'desc': 'Accumulate 1000 total points',                'icon': '⭐', 'secret': False},
    'map_explorer':      {'name': 'Map Explorer',       'desc': 'Finish races on 25 different maps',           'icon': '🗺️', 'secret': False},
    'long_game':         {'name': 'The Long Game',      'desc': 'Complete a race that lasted over 5 minutes',  'icon': '⏳', 'secret': False},
    'season_champion':   {'name': 'Season Champion',    'desc': 'Finish #1 on a season leaderboard',           'icon': '👑', 'secret': False},
}


# ── Points scale ───────────────────────────────────────────────────────────────
_POINTS_TABLE = {1: 25, 2: 18, 3: 15, 4: 12, 5: 10, 6: 8, 7: 6, 8: 4}

def _base_points(rank):
    if rank is None:
        return 0
    if rank in _POINTS_TABLE:
        return _POINTS_TABLE[rank]
    if rank <= 12:
        return 2
    return 1

_COINS_TABLE = {1: 100, 2: 75, 3: 60, 4: 50, 5: 40, 6: 30}

def _base_coins(rank):
    if rank is None:
        return 5       # DNF participation coin
    if rank in _COINS_TABLE:
        return _COINS_TABLE[rank]
    if rank <= 10:
        return 20
    return 10


# ── Main stats writer ──────────────────────────────────────────────────────────

def award_race_results(race_id: str, map_id: str, map_name: str,
                       channel: str, results: list,
                       coin_multiplier: int = 1,
                       halfway_last: str = '',
                       race_duration_ms: int = 0,
                       player_roles: dict = None,
                       ghost_paths: dict = None) -> dict:
    """
    Write race results to DB. Returns dict of {username: {points, coins, record}}.
    `results` is a list of dicts: {rank, username, finish_time_ms, respawns}
    `halfway_last` is the username of the marble in last place at the halfway point.
    """
    if not results:
        return {}

    now          = time.time()
    winner       = next((r['username'] for r in results if r.get('rank') == 1), None)
    player_count = len(results)
    summary      = {}

    with _lock:
        with _conn() as c:
            # Insert race row
            c.execute("""
                INSERT OR IGNORE INTO marble_races
                    (race_id, map_id, map_name, channel, played_at, player_count, winner)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (race_id, map_id, map_name, channel, now, player_count, winner))

            # Load existing track record for this map
            existing_rec = c.execute(
                'SELECT finish_time_ms FROM marble_track_records WHERE map_id = ?', (map_id,)
            ).fetchone()
            best_ms = existing_rec['finish_time_ms'] if existing_rec else None

            # Pre-load existing achievements for all players (avoids per-player queries)
            logins = [r.get('username', '').lower() for r in results if r.get('username', '').strip()]
            existing_ach = {}  # login -> set of achievement keys already earned
            if logins:
                placeholders = ','.join('?' * len(logins))
                ach_rows = c.execute(
                    f'SELECT twitch_login, achievement_key FROM marble_achievements WHERE twitch_login IN ({placeholders})',
                    logins
                ).fetchall()
                for ar in ach_rows:
                    existing_ach.setdefault(ar['twitch_login'], set()).add(ar['achievement_key'])

            per_player = {}  # login -> per-race flags for achievement evaluation

            # ── Pass 1: upsert player stats ──────────────────────────────────────
            for r in results:
                login     = r.get('username', '').lower()
                rank      = r.get('rank')          # None = DNF
                fin_ms    = r.get('finish_time_ms')
                respawns  = r.get('respawns', 0) or 0

                if not login:
                    continue

                # Fetch or create player row
                row = c.execute(
                    'SELECT * FROM marble_players WHERE twitch_login = ?', (login,)
                ).fetchone()
                streak = (row['win_streak'] if row else 0) if rank == 1 else 0
                new_streak = (streak + 1) if rank == 1 else 0

                # Compute points
                pts = _base_points(rank)
                # Clean race bonus
                if rank is not None and respawns == 0:
                    pts += 5
                # Win streak bonus (stacks, capped at +20)
                if rank == 1:
                    pts += min(new_streak * 2, 20)
                # Track record bonus (checked below)
                is_record = False
                if fin_ms is not None and rank == 1:
                    if best_ms is None or fin_ms < best_ms:
                        is_record = True
                        pts += 15
                        best_ms = fin_ms   # update for subsequent results in same race

                coins = _base_coins(rank) * max(1, int(coin_multiplier))
                # Twitch role bonuses (applied before flat bonuses)
                roles = (player_roles or {}).get(login, set())
                if 'subscriber' in roles:
                    coins = int(coins * 1.25)   # +25% for subscribers
                elif 'vip' in roles:
                    coins = int(coins * 1.10)   # +10% for VIPs
                # Flat bonuses
                if is_record:
                    coins += 50   # track record bonus
                if rank is not None and respawns == 0:
                    coins += 20   # clean race bonus

                is_clean = (rank is not None and respawns == 0)
                is_comeback = (
                    rank == 1 and
                    bool(halfway_last) and
                    login == halfway_last.lower() and
                    len(results) >= 2  # only meaningful with 2+ marbles
                )

                # Upsert player stats
                c.execute("""
                    INSERT INTO marble_players
                        (twitch_login, wins, races_played, points, coins, coins_earned_total,
                         clean_races, comeback_king, total_finish_ms, last_played,
                         win_streak, best_win_streak, total_respawns)
                    VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(twitch_login) DO UPDATE SET
                        wins               = wins + ?,
                        races_played       = races_played + 1,
                        points             = points + ?,
                        coins              = coins + ?,
                        coins_earned_total = coins_earned_total + ?,
                        clean_races        = clean_races + ?,
                        comeback_king      = comeback_king + ?,
                        total_finish_ms    = total_finish_ms + ?,
                        last_played        = ?,
                        win_streak         = ?,
                        best_win_streak    = MAX(best_win_streak, ?),
                        total_respawns     = total_respawns + ?
                """, (
                    login,
                    1 if rank == 1 else 0,
                    pts, coins, coins,
                    1 if is_clean else 0,
                    1 if is_comeback else 0,
                    fin_ms if fin_ms else 0, now,
                    new_streak, max(new_streak, (row['best_win_streak'] if row else 0)),
                    respawns,
                    # UPDATE part
                    1 if rank == 1 else 0,
                    pts, coins, coins,
                    1 if is_clean else 0,
                    1 if is_comeback else 0,
                    fin_ms if fin_ms else 0, now,
                    new_streak, new_streak,
                    respawns,
                ))

                # Insert result row
                c.execute("""
                    INSERT INTO marble_race_results
                        (race_id, twitch_login, rank, finish_time_ms, points_awarded, coins_awarded, respawns)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (race_id, login, rank, fin_ms, pts, coins, respawns))

                summary[login] = {'points': pts, 'coins': coins, 'record': is_record, 'achievements': []}

                # Log coin award
                reason = f'race_finish:rank{rank}' if rank else 'race_dnf'
                c.execute(
                    'INSERT INTO marble_coin_log (twitch_login, amount, reason, race_id, ts) VALUES (?,?,?,?,?)',
                    (login, coins, reason, race_id, now)
                )

                # Write track record if beaten
                if is_record and fin_ms is not None:
                    import json as _json
                    gp = None
                    if ghost_paths and login in ghost_paths:
                        try:
                            gp = _json.dumps(ghost_paths[login], separators=(',', ':'))
                        except Exception:
                            pass
                    c.execute("""
                        INSERT INTO marble_track_records (map_id, map_name, twitch_login, finish_time_ms, race_id, set_at, ghost_path)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(map_id) DO UPDATE SET
                            map_name = ?, twitch_login = ?, finish_time_ms = ?, race_id = ?, set_at = ?, ghost_path = ?
                    """, (map_id, map_name, login, fin_ms, race_id, now, gp,
                          map_name, login, fin_ms, race_id, now, gp))

                per_player[login] = {
                    'rank': rank, 'respawns': respawns,
                    'is_record': is_record, 'is_comeback': is_comeback,
                }

            # ── Season standings update ──────────────────────────────────────────
            season_row = c.execute(
                'SELECT season_id FROM marble_seasons WHERE active = 1 LIMIT 1'
            ).fetchone()
            if season_row:
                sid = season_row['season_id']
                for login, pr in per_player.items():
                    s_pts  = summary.get(login, {}).get('points', 0)
                    is_win = pr['rank'] == 1
                    c.execute("""
                        INSERT INTO marble_season_results (season_id, twitch_login, points, wins, races)
                        VALUES (?, ?, ?, ?, 1)
                        ON CONFLICT(season_id, twitch_login) DO UPDATE SET
                            points = points + ?,
                            wins   = wins + ?,
                            races  = races + 1
                    """, (sid, login, s_pts, 1 if is_win else 0,
                          s_pts, 1 if is_win else 0))

            # ── Pass 2: evaluate achievements ────────────────────────────────────
            hour = time.localtime(now).tm_hour
            for login, pr in per_player.items():
                row = c.execute(
                    'SELECT * FROM marble_players WHERE twitch_login = ?', (login,)
                ).fetchone()
                if not row:
                    continue
                map_count = c.execute(
                    '''SELECT COUNT(DISTINCT rc.map_id)
                       FROM marble_race_results rr
                       JOIN marble_races rc ON rr.race_id = rc.race_id
                       WHERE rr.twitch_login = ? AND rr.finish_time_ms IS NOT NULL''',
                    (login,)
                ).fetchone()[0]

                conditions = {
                    'first_steps':       row['races_played'] == 1,
                    'podium_finish':     pr['rank'] is not None and pr['rank'] <= 3,
                    'champion':          pr['rank'] == 1,
                    'hat_trick':         row['win_streak'] >= 3,
                    'unstoppable':       row['win_streak'] >= 10,
                    'century':           row['races_played'] >= 100,
                    'speed_demon':       pr['is_record'],
                    'untouchable':       pr['rank'] == 1 and pr['respawns'] == 0,
                    'comeback_kid':      pr['is_comeback'],
                    'participant_award': pr['rank'] == player_count and player_count >= 20,
                    'night_owl':         0 <= hour < 4,
                    'veteran':           row['races_played'] >= 500,
                    'legend':            row['points'] >= 1000,
                    'map_explorer':      map_count >= 25,
                    'long_game':         race_duration_ms >= 5 * 60 * 1000 and pr['rank'] is not None,
                }

                have = existing_ach.get(login, set())
                new_keys = []
                for key, met in conditions.items():
                    if met and key not in have:
                        c.execute(
                            'INSERT OR IGNORE INTO marble_achievements (twitch_login, achievement_key, unlocked_at) VALUES (?,?,?)',
                            (login, key, now)
                        )
                        new_keys.append(key)

                if new_keys:
                    summary[login]['achievements'] = [
                        {**ACHIEVEMENTS[k], 'key': k} for k in new_keys if k in ACHIEVEMENTS
                    ]

            # Check milestone cosmetic unlocks after stats are updated
            newly_unlocked = check_milestone_unlocks(login)
            if newly_unlocked:
                summary[login]['new_cosmetics'] = newly_unlocked

    return summary


# ── Read APIs ─────────────────────────────────────────────────────────────────

def search_players(query: str, limit: int = 20) -> list:
    """Full-text search over twitch_login. Returns matching players ordered by points desc."""
    q = f'%{query.lower().strip()}%'
    with _conn() as c:
        rows = c.execute("""
            SELECT twitch_login, points, wins, races_played, rank
            FROM (
                SELECT p.twitch_login, p.points, p.wins, p.races_played,
                       (SELECT COUNT(*) FROM marble_players p2 WHERE p2.points > p.points) + 1 AS rank
                FROM marble_players p
                WHERE p.banned = 0 AND p.twitch_login LIKE ?
                ORDER BY p.points DESC LIMIT ?
            )
        """, (q, limit)).fetchall()
    return [dict(r) for r in rows]


def get_rival(login: str) -> dict | None:
    """Find the player most likely to be this player's rival — closest points, most shared races."""
    login = login.lower()
    with _conn() as c:
        player = c.execute('SELECT points FROM marble_players WHERE twitch_login = ?', (login,)).fetchone()
        if not player:
            return None
        pts = player['points']
        # Find the player with closest points (within ±20%) who shares the most races
        low, high = pts * 0.8, pts * 1.2
        shared = c.execute("""
            SELECT p.twitch_login, p.points, COUNT(*) AS shared_races
            FROM marble_players p
            JOIN marble_race_results rr1 ON rr1.twitch_login = p.twitch_login
            JOIN marble_race_results rr2 ON rr2.race_id = rr1.race_id AND rr2.twitch_login = ?
            WHERE p.twitch_login != ? AND p.banned = 0
              AND p.points BETWEEN ? AND ?
            GROUP BY p.twitch_login
            ORDER BY shared_races DESC, ABS(p.points - ?) ASC
            LIMIT 1
        """, (login, login, low, high, pts)).fetchone()
    return dict(shared) if shared else None


def get_marble_of_the_week() -> dict | None:
    """Return the player with the most wins in the last 7 days."""
    cutoff = time.time() - 7 * 86400
    with _conn() as c:
        row = c.execute("""
            SELECT rr.twitch_login, COUNT(*) AS week_wins, p.points, p.wins AS total_wins
            FROM marble_race_results rr
            JOIN marble_races rc ON rr.race_id = rc.race_id
            JOIN marble_players p ON p.twitch_login = rr.twitch_login
            WHERE rr.rank = 1 AND rc.played_at >= ? AND p.banned = 0
            GROUP BY rr.twitch_login
            ORDER BY week_wins DESC
            LIMIT 1
        """, (cutoff,)).fetchone()
    return dict(row) if row else None


def get_leaderboard(sort_by: str = 'points', limit: int = 100, include_banned: bool = False) -> list:
    """Return top players. sort_by: 'points' | 'wins' | 'races_played' | 'win_streak' | 'coins'."""
    _allowed = {'points', 'wins', 'races_played', 'win_streak', 'coins'}
    col = sort_by if sort_by in _allowed else 'points'
    ban_filter = '' if include_banned else 'WHERE COALESCE(banned, 0) = 0'
    with _conn() as c:
        rows = c.execute(f"""
            SELECT twitch_login, wins, races_played, points, coins,
                   win_streak, best_win_streak, total_finish_ms, last_played,
                   COALESCE(banned, 0) AS banned
            FROM marble_players
            {ban_filter}
            ORDER BY {col} DESC, points DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_player(twitch_login: str) -> dict | None:
    login = twitch_login.lower()
    with _conn() as c:
        row = c.execute(
            'SELECT * FROM marble_players WHERE twitch_login = ?', (login,)
        ).fetchone()
        if not row:
            return None
        data = dict(row)
        # Rank by points
        rank_row = c.execute(
            'SELECT COUNT(*) as r FROM marble_players WHERE points > ?',
            (data['points'],)
        ).fetchone()
        data['rank'] = (rank_row['r'] if rank_row else 0) + 1
        # Last 20 races
        history = c.execute("""
            SELECT rr.rank, rr.finish_time_ms, rr.points_awarded, rr.coins_awarded,
                   rr.respawns, rc.map_name, rc.played_at, rc.race_id
            FROM marble_race_results rr
            JOIN marble_races rc ON rr.race_id = rc.race_id
            WHERE rr.twitch_login = ?
            ORDER BY rc.played_at DESC
            LIMIT 20
        """, (login,)).fetchall()
        data['history'] = [dict(h) for h in history]
        # Track records held
        records = c.execute(
            'SELECT map_name, finish_time_ms, set_at FROM marble_track_records WHERE twitch_login = ?',
            (login,)
        ).fetchall()
        data['track_records'] = [dict(r) for r in records]
        # Achievements
        ach_rows = c.execute(
            'SELECT achievement_key, unlocked_at FROM marble_achievements WHERE twitch_login = ? ORDER BY unlocked_at ASC',
            (login,)
        ).fetchall()
        achievements = []
        for ar in ach_rows:
            key  = ar['achievement_key']
            defn = ACHIEVEMENTS.get(key, {})
            achievements.append({
                'key':         key,
                'name':        defn.get('name', key),
                'desc':        defn.get('desc', ''),
                'icon':        defn.get('icon', '🏆'),
                'secret':      defn.get('secret', False),
                'unlocked_at': ar['unlocked_at'],
            })
        data['achievements'] = achievements
    return data


def get_map_leaderboard(map_id: str, limit: int = 50) -> list:
    """Return all players' best times on a specific map, fastest first."""
    with _conn() as c:
        rows = c.execute("""
            SELECT rr.twitch_login,
                   MIN(rr.finish_time_ms) AS best_time_ms,
                   COUNT(*)               AS attempts,
                   MIN(rc.played_at)      AS first_played
            FROM marble_race_results rr
            JOIN marble_races rc ON rr.race_id = rc.race_id
            WHERE rc.map_id = ? AND rr.finish_time_ms IS NOT NULL
            GROUP BY rr.twitch_login
            ORDER BY best_time_ms ASC
            LIMIT ?
        """, (map_id, limit)).fetchall()
        # Also grab the map name
        name_row = c.execute(
            'SELECT map_name FROM marble_track_records WHERE map_id = ? LIMIT 1', (map_id,)
        ).fetchone()
        map_name = name_row['map_name'] if name_row else map_id
    return {'map_id': map_id, 'map_name': map_name, 'entries': [dict(r) for r in rows]}


def get_track_records(limit: int = 50) -> list:
    with _conn() as c:
        rows = c.execute("""
            SELECT map_id, map_name, twitch_login, finish_time_ms, set_at
            FROM marble_track_records
            ORDER BY set_at DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_player_rank(twitch_login: str) -> int:
    """Return 1-based points rank for a player. 0 if player not found."""
    login = twitch_login.lower()
    with _conn() as c:
        row = c.execute('SELECT points FROM marble_players WHERE twitch_login = ?', (login,)).fetchone()
        if not row:
            return 0
        above = c.execute('SELECT COUNT(*) FROM marble_players WHERE points > ?', (row['points'],)).fetchone()[0]
        return above + 1


def get_track_record_for_map(map_id: str) -> dict | None:
    """Return the current track record for a specific map, or None."""
    import json as _json
    with _conn() as c:
        row = c.execute(
            'SELECT map_id, map_name, twitch_login, finish_time_ms, ghost_path FROM marble_track_records WHERE map_id = ?',
            (map_id,)
        ).fetchone()
    if not row:
        return None
    d = dict(row)
    if d.get('ghost_path'):
        try:
            d['path'] = _json.loads(d['ghost_path'])
        except Exception:
            d['path'] = None
    del d['ghost_path']
    return d


# ── Map library ───────────────────────────────────────────────────────────────

def save_map(map_id: str, name: str, description: str, author_login: str,
             map_data_json: str, piece_count: int = 0, thumbnail: str = None,
             tags: str = '') -> str:
    """Insert or update a published map. Archives the old version on update. Returns map_id."""
    now = time.time()
    with _lock:
        with _conn() as c:
            existing = c.execute(
                'SELECT map_data, piece_count, current_version FROM marble_maps WHERE map_id = ?',
                (map_id,)
            ).fetchone()
            if existing:
                # Archive the current version before overwriting
                ver_num = existing['current_version'] or 1
                c.execute(
                    'INSERT INTO marble_map_versions (version_id, map_id, version_num, map_data, piece_count, saved_at) '
                    'VALUES (?, ?, ?, ?, ?, ?)',
                    (secrets.token_hex(8), map_id, ver_num, existing['map_data'], existing['piece_count'], now)
                )
                c.execute("""
                    UPDATE marble_maps SET
                        name = ?, description = ?, map_data = ?, piece_count = ?, published_at = ?,
                        thumbnail = COALESCE(?, thumbnail), tags = ?,
                        current_version = ?
                    WHERE map_id = ?
                """, (name, description, map_data_json, piece_count, now, thumbnail, tags, ver_num + 1, map_id))
            else:
                c.execute("""
                    INSERT INTO marble_maps
                        (map_id, name, description, author_login, map_data, piece_count, published_at, thumbnail, tags, current_version)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
                """, (map_id, name, description, author_login, map_data_json, piece_count, now, thumbnail, tags))
    return map_id


def get_map_versions(map_id: str) -> list:
    """Return all archived versions of a map, newest first."""
    with _conn() as c:
        rows = c.execute(
            'SELECT version_id, version_num, piece_count, saved_at FROM marble_map_versions '
            'WHERE map_id = ? ORDER BY version_num DESC',
            (map_id,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_map_version_data(map_id: str, version_num: int) -> dict | None:
    """Return the full map data for a specific archived version."""
    with _conn() as c:
        row = c.execute(
            'SELECT * FROM marble_map_versions WHERE map_id = ? AND version_num = ?',
            (map_id, version_num)
        ).fetchone()
    return dict(row) if row else None


def get_maps(limit: int = 50) -> list:
    with _conn() as c:
        rows = c.execute("""
            SELECT m.map_id, m.name, m.description, m.author_login, m.piece_count,
                   m.play_count, m.published_at, m.thumbnail, m.tags,
                   COALESCE(m.featured, 0) AS featured,
                   COALESCE(r.upvotes, 0) AS upvotes,
                   COALESCE(r.downvotes, 0) AS downvotes
            FROM marble_maps m
            LEFT JOIN (
                SELECT map_id,
                       SUM(CASE WHEN vote=1  THEN 1 ELSE 0 END) AS upvotes,
                       SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) AS downvotes
                FROM marble_map_ratings GROUP BY map_id
            ) r ON m.map_id = r.map_id
            ORDER BY m.published_at DESC LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def rate_map(map_id: str, user_login: str, vote: int) -> dict:
    """Rate a map (vote: 1 or -1). Toggling the same vote removes it. Returns updated counts."""
    if vote not in (1, -1):
        raise ValueError('vote must be 1 or -1')
    now = time.time()
    user_vote = 0
    with _lock:
        with _conn() as c:
            existing = c.execute(
                'SELECT vote FROM marble_map_ratings WHERE map_id=? AND user_login=?',
                (map_id, user_login)
            ).fetchone()
            if existing:
                if existing['vote'] == vote:
                    c.execute('DELETE FROM marble_map_ratings WHERE map_id=? AND user_login=?',
                              (map_id, user_login))
                else:
                    c.execute('UPDATE marble_map_ratings SET vote=?, rated_at=? WHERE map_id=? AND user_login=?',
                              (vote, now, map_id, user_login))
                    user_vote = vote
            else:
                c.execute('INSERT INTO marble_map_ratings (rating_id, map_id, user_login, vote, rated_at) VALUES (?,?,?,?,?)',
                          (secrets.token_hex(8), map_id, user_login, vote, now))
                user_vote = vote
            row = c.execute(
                'SELECT SUM(CASE WHEN vote=1 THEN 1 ELSE 0 END) as up,'
                '       SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) as dn'
                ' FROM marble_map_ratings WHERE map_id=?', (map_id,)
            ).fetchone()
    return {'upvotes': row['up'] or 0, 'downvotes': row['dn'] or 0, 'user_vote': user_vote}


def get_map(map_id: str) -> dict | None:
    with _conn() as c:
        row = c.execute('SELECT * FROM marble_maps WHERE map_id = ?', (map_id,)).fetchone()
    return dict(row) if row else None


def increment_map_plays(map_id: str):
    with _lock:
        with _conn() as c:
            c.execute('UPDATE marble_maps SET play_count = play_count + 1 WHERE map_id = ?', (map_id,))


def set_map_featured(map_id: str, featured: bool):
    with _lock:
        with _conn() as c:
            c.execute('UPDATE marble_maps SET featured = ? WHERE map_id = ?', (1 if featured else 0, map_id))


def get_featured_maps(limit: int = 8) -> list:
    with _conn() as c:
        rows = c.execute("""
            SELECT m.map_id, m.name, m.description, m.author_login, m.piece_count,
                   m.play_count, m.published_at, m.thumbnail, m.tags, m.featured,
                   COALESCE(r.upvotes, 0) AS upvotes,
                   COALESCE(r.downvotes, 0) AS downvotes
            FROM marble_maps m
            LEFT JOIN (
                SELECT map_id,
                       SUM(CASE WHEN vote=1  THEN 1 ELSE 0 END) AS upvotes,
                       SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) AS downvotes
                FROM marble_map_ratings GROUP BY map_id
            ) r ON r.map_id = m.map_id
            WHERE m.featured = 1
            ORDER BY m.published_at DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def delete_map(map_id: str):
    """Delete a map and its ratings."""
    with _lock:
        with _conn() as c:
            c.execute('DELETE FROM marble_map_ratings WHERE map_id = ?', (map_id,))
            c.execute('DELETE FROM marble_maps WHERE map_id = ?', (map_id,))


def get_race_history(limit: int = 50) -> list:
    """Return the most recent races with result counts."""
    with _conn() as c:
        rows = c.execute("""
            SELECT rc.race_id, rc.map_id, rc.map_name, rc.channel, rc.played_at,
                   rc.player_count, rc.winner
            FROM marble_races rc
            ORDER BY rc.played_at DESC
            LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_maps_admin(limit: int = 200) -> list:
    """Return all maps with full metadata for admin use."""
    with _conn() as c:
        rows = c.execute("""
            SELECT m.map_id, m.name, m.description, m.author_login, m.piece_count,
                   m.play_count, m.published_at, m.tags,
                   COALESCE(m.featured, 0) AS featured,
                   COALESCE(r.upvotes, 0) AS upvotes,
                   COALESCE(r.downvotes, 0) AS downvotes
            FROM marble_maps m
            LEFT JOIN (
                SELECT map_id,
                       SUM(CASE WHEN vote=1  THEN 1 ELSE 0 END) AS upvotes,
                       SUM(CASE WHEN vote=-1 THEN 1 ELSE 0 END) AS downvotes
                FROM marble_map_ratings GROUP BY map_id
            ) r ON m.map_id = r.map_id
            ORDER BY m.published_at DESC LIMIT ?
        """, (limit,)).fetchall()
    return [dict(r) for r in rows]


def get_coins_balance(twitch_login: str) -> int:
    """Return the current spendable coin balance for a player."""
    login = twitch_login.lower()
    with _conn() as c:
        row = c.execute('SELECT coins FROM marble_players WHERE twitch_login = ?', (login,)).fetchone()
    return row['coins'] if row else 0


def adjust_coins(twitch_login: str, amount: int, reason: str = 'admin', race_id: str = None) -> int:
    """Add (positive) or subtract (negative) coins for a player. Returns new balance."""
    login = twitch_login.lower()
    now = time.time()
    with _lock:
        with _conn() as c:
            c.execute("""
                INSERT INTO marble_players (twitch_login, coins, coins_earned_total)
                VALUES (?, MAX(0, ?), CASE WHEN ? > 0 THEN ? ELSE 0 END)
                ON CONFLICT(twitch_login) DO UPDATE SET
                    coins              = MAX(0, coins + ?),
                    coins_earned_total = coins_earned_total + CASE WHEN ? > 0 THEN ? ELSE 0 END
            """, (login, amount, amount, amount, amount, amount, amount))
            c.execute(
                'INSERT INTO marble_coin_log (twitch_login, amount, reason, race_id, ts) VALUES (?,?,?,?,?)',
                (login, amount, reason, race_id, now)
            )
            row = c.execute('SELECT coins FROM marble_players WHERE twitch_login = ?', (login,)).fetchone()
    return row['coins'] if row else 0


def get_map_leaderboard(map_id: str, limit: int = 10) -> list:
    with _conn() as c:
        rows = c.execute("""
            SELECT rr.twitch_login, rr.finish_time_ms, rc.played_at
            FROM marble_race_results rr
            JOIN marble_races rc ON rr.race_id = rc.race_id
            WHERE rc.map_id = ? AND rr.finish_time_ms IS NOT NULL
            ORDER BY rr.finish_time_ms ASC
            LIMIT ?
        """, (map_id, limit)).fetchall()
    return [dict(r) for r in rows]


def get_player_achievements(twitch_login: str) -> list:
    """Return all unlocked achievements for a player, enriched with definition metadata."""
    login = twitch_login.lower()
    with _conn() as c:
        rows = c.execute(
            'SELECT achievement_key, unlocked_at FROM marble_achievements WHERE twitch_login = ? ORDER BY unlocked_at ASC',
            (login,)
        ).fetchall()
    result = []
    for row in rows:
        key  = row['achievement_key']
        defn = ACHIEVEMENTS.get(key, {})
        result.append({
            'key':         key,
            'name':        defn.get('name', key),
            'desc':        defn.get('desc', ''),
            'icon':        defn.get('icon', '🏆'),
            'secret':      defn.get('secret', False),
            'unlocked_at': row['unlocked_at'],
        })
    return result


# ── Player settings ────────────────────────────────────────────────────────────

DEFAULT_SETTINGS = {
    'display_name':         '',           # '' = use Twitch username
    'marble_color':         '',           # '' = auto from username hash; hex like '#ff6600'
    'nametag_style':        'default',    # 'default' | 'bold' | 'minimal' | 'hidden'
    'trail':                'off',        # 'off' or an unlocked trail key
    'reduced_motion':       False,
    'high_contrast_names':  False,
    'notify_achievements':  True,
    'notify_records':       True,
    'notify_coins':         True,
    'camera_preference':    'leader',     # 'leader' | 'overview' | 'side' | 'free'
    'marble_size':          1.0,          # cosmetic scale: 0.8 | 1.0 | 1.2 | 1.4
    'sound_volume':         80,           # 0–100
    'sound_pack':           'classic',    # 'classic' | 'retro' | 'satisfying'
    'timezone':             'UTC',
    'profile_public':       True,
    'show_on_leaderboard':  True,
}

_ALLOWED_NAMETAG     = {'default', 'bold', 'minimal', 'hidden'}
_ALLOWED_CAMERA      = {'leader', 'overview', 'side', 'free'}
_ALLOWED_SOUND_PACKS = {'classic', 'retro', 'satisfying'}


def get_player_settings(twitch_login: str) -> dict:
    """Return settings for a player, merged with defaults."""
    login = twitch_login.lower()
    with _conn() as c:
        row = c.execute(
            'SELECT settings_json FROM marble_player_settings WHERE twitch_login = ?', (login,)
        ).fetchone()
    stored = {}
    if row:
        try:
            import json as _json
            stored = _json.loads(row['settings_json'])
        except Exception:
            pass
    return {**DEFAULT_SETTINGS, **stored}


def save_player_settings(twitch_login: str, updates: dict) -> dict:
    """Validate and persist player settings. Returns the saved settings."""
    login = twitch_login.lower()
    current = get_player_settings(login)

    # Validate and merge
    if 'display_name' in updates:
        dn = str(updates['display_name'])[:20].strip()
        current['display_name'] = dn
    if 'marble_color' in updates:
        col = str(updates['marble_color']).strip().lower()
        import re as _re
        current['marble_color'] = col if _re.match(r'^#[0-9a-f]{6}$', col) else ''
    if 'nametag_style' in updates:
        ns = str(updates['nametag_style'])
        current['nametag_style'] = ns if ns in _ALLOWED_NAMETAG else 'default'
    if 'trail' in updates:
        current['trail'] = str(updates['trail'])[:32]
    for bool_key in ('reduced_motion', 'high_contrast_names',
                     'notify_achievements', 'notify_records', 'notify_coins',
                     'profile_public', 'show_on_leaderboard'):
        if bool_key in updates:
            current[bool_key] = bool(updates[bool_key])
    if 'camera_preference' in updates:
        cp = str(updates['camera_preference'])
        current['camera_preference'] = cp if cp in _ALLOWED_CAMERA else 'leader'
    if 'marble_size' in updates:
        try:
            sz = float(updates['marble_size'])
            current['marble_size'] = sz if sz in (0.8, 1.0, 1.2, 1.4) else 1.0
        except (ValueError, TypeError):
            pass
    if 'sound_volume' in updates:
        current['sound_volume'] = max(0, min(100, int(updates['sound_volume'])))
    if 'sound_pack' in updates:
        sp = str(updates['sound_pack'])
        current['sound_pack'] = sp if sp in _ALLOWED_SOUND_PACKS else 'classic'
    if 'timezone' in updates:
        current['timezone'] = str(updates['timezone'])[:64]

    import json as _json
    now = time.time()
    with _lock:
        with _conn() as c:
            c.execute("""
                INSERT INTO marble_player_settings (twitch_login, settings_json, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(twitch_login) DO UPDATE SET settings_json = ?, updated_at = ?
            """, (login, _json.dumps(current), now, _json.dumps(current), now))
    return current


# ── Season system ─────────────────────────────────────────────────────────────

def start_season(name: str) -> str:
    """Deactivate any active season and start a new one. Returns new season_id."""
    import secrets as _s
    season_id = _s.token_hex(6)
    now = time.time()
    with _lock:
        with _conn() as c:
            c.execute('UPDATE marble_seasons SET active = 0 WHERE active = 1')
            c.execute(
                'INSERT INTO marble_seasons (season_id, name, started_at, active) VALUES (?,?,?,1)',
                (season_id, name[:64].strip() or 'Season', now)
            )
    return season_id


def end_season() -> dict | None:
    """Finalize the active season: compute rankings, record winner, deactivate."""
    now = time.time()
    with _lock:
        with _conn() as c:
            season = c.execute(
                'SELECT season_id, name FROM marble_seasons WHERE active = 1 LIMIT 1'
            ).fetchone()
            if not season:
                return None
            sid = season['season_id']
            # Rank all participants by season points
            rows = c.execute("""
                SELECT twitch_login, points, wins, races
                FROM marble_season_results
                WHERE season_id = ?
                ORDER BY points DESC, wins DESC
            """, (sid,)).fetchall()
            winner = rows[0]['twitch_login'] if rows else None
            for i, row in enumerate(rows, 1):
                c.execute(
                    'UPDATE marble_season_results SET season_rank=? WHERE season_id=? AND twitch_login=?',
                    (i, sid, row['twitch_login'])
                )
            c.execute(
                'UPDATE marble_seasons SET active=0, ended_at=?, winner=? WHERE season_id=?',
                (now, winner, sid)
            )
            # Award Season Champion achievement to the winner
            if winner:
                c.execute(
                    'INSERT OR IGNORE INTO marble_achievements (twitch_login, achievement_key, unlocked_at) VALUES (?,?,?)',
                    (winner, 'season_champion', now)
                )
    return {'season_id': sid, 'name': season['name'], 'winner': winner, 'ended_at': now}


def get_current_season() -> dict | None:
    with _conn() as c:
        row = c.execute('SELECT * FROM marble_seasons WHERE active=1 LIMIT 1').fetchone()
    return dict(row) if row else None


def get_seasons(limit: int = 20) -> list:
    with _conn() as c:
        rows = c.execute(
            'SELECT * FROM marble_seasons ORDER BY started_at DESC LIMIT ?', (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


def get_season_leaderboard(season_id: str, limit: int = 100) -> list:
    with _conn() as c:
        rows = c.execute("""
            SELECT twitch_login, points, wins, races, season_rank
            FROM marble_season_results
            WHERE season_id = ?
            ORDER BY points DESC, wins DESC
            LIMIT ?
        """, (season_id, limit)).fetchall()
    return [dict(r) for r in rows]


# ── Leaderboard admin ──────────────────────────────────────────────────────────

def ban_player(twitch_login: str) -> bool:
    """Ban a player from leaderboards. Returns True if player exists."""
    login = twitch_login.lower()
    with _lock:
        with _conn() as c:
            result = c.execute(
                'UPDATE marble_players SET banned = 1 WHERE twitch_login = ?', (login,)
            )
    return result.rowcount > 0


def unban_player(twitch_login: str) -> bool:
    """Remove a leaderboard ban. Returns True if player exists."""
    login = twitch_login.lower()
    with _lock:
        with _conn() as c:
            result = c.execute(
                'UPDATE marble_players SET banned = 0 WHERE twitch_login = ?', (login,)
            )
    return result.rowcount > 0


def get_banned_players() -> list:
    """Return all banned players."""
    with _conn() as c:
        rows = c.execute(
            'SELECT twitch_login, points, wins, races_played FROM marble_players WHERE COALESCE(banned,0)=1 ORDER BY twitch_login'
        ).fetchall()
    return [dict(r) for r in rows]


def reset_player_points(twitch_login: str) -> bool:
    """Reset a player's points (and win streak) to 0. Keeps race history."""
    login = twitch_login.lower()
    with _lock:
        with _conn() as c:
            result = c.execute(
                'UPDATE marble_players SET points=0, win_streak=0, best_win_streak=0 WHERE twitch_login=?',
                (login,)
            )
    return result.rowcount > 0


def reset_map_record(map_id: str) -> bool:
    """Delete the track record for a specific map."""
    with _lock:
        with _conn() as c:
            result = c.execute('DELETE FROM marble_track_records WHERE map_id=?', (map_id,))
    return result.rowcount > 0


def reset_all_track_records() -> int:
    """Delete ALL track records. Returns count of deleted rows."""
    with _lock:
        with _conn() as c:
            result = c.execute('DELETE FROM marble_track_records')
    return result.rowcount


# ── Marble Cosmetics ──────────────────────────────────────────────────────────

# All unlockable cosmetics.  Each skin/trail/accessory has:
#   key, name, desc, how_to_unlock, type
SKIN_CATALOGUE = [
    {'key': 'solid',       'name': 'Solid',        'desc': 'Classic solid colour',              'unlock': 'default'},
    {'key': 'striped',     'name': 'Striped',       'desc': 'Bold diagonal stripes',             'unlock': 'Play 10 races'},
    {'key': 'polka_dot',   'name': 'Polka Dot',     'desc': 'Playful polka dots',                'unlock': 'Win 5 races'},
    {'key': 'checker',     'name': 'Checker',       'desc': 'Classic checkerboard pattern',      'unlock': 'Set a track record'},
    {'key': 'swirl',       'name': 'Swirl',         'desc': 'Hypnotic swirl pattern',            'unlock': 'Play 50 races'},
    {'key': 'galaxy',      'name': 'Galaxy',        'desc': 'Nebula-like star field',            'unlock': 'Win 25 races'},
    {'key': 'nebula',      'name': 'Nebula',        'desc': 'Drifting gas cloud glow',           'unlock': 'Reach 500 points'},
    {'key': 'lava',        'name': 'Lava',          'desc': 'Glowing molten rock',               'unlock': 'Play 100 races'},
    {'key': 'ice',         'name': 'Ice',           'desc': 'Frozen crystal surface',            'unlock': 'Win 3 races in a row'},
    {'key': 'ocean',       'name': 'Ocean',         'desc': 'Deep sea wave ripple',              'unlock': 'Finish top 3 in 20 races'},
    {'key': 'forest',      'name': 'Forest',        'desc': 'Deep green leaf pattern',           'unlock': 'Play on 10 different maps'},
    {'key': 'gold',        'name': 'Gold',          'desc': 'Gleaming gold surface',             'unlock': 'Reach 1000 points (Legend)'},
    {'key': 'silver',      'name': 'Silver',        'desc': 'Polished silver sheen',             'unlock': 'Win 50 races'},
    {'key': 'diamond',     'name': 'Diamond',       'desc': 'Crystalline diamond facets',        'unlock': 'Win 100 races'},
    {'key': 'obsidian',    'name': 'Obsidian',      'desc': 'Dark volcanic glass',               'unlock': 'Play 250 races'},
    {'key': 'holographic', 'name': 'Holographic',   'desc': 'Shifting rainbow iridescence',      'unlock': 'Season Champion'},
    {'key': 'neon',        'name': 'Neon',          'desc': 'Electric glowing neon',             'unlock': 'Win 10 races in a row (Unstoppable)'},
    {'key': 'rainbow',     'name': 'Rainbow',       'desc': 'Full spectrum colour cycle',        'unlock': 'Play 500 races'},
    {'key': 'emoji',       'name': 'Emoji',         'desc': 'Your marble, your emoji',           'unlock': 'Play 25 races'},
    {'key': 'transparent', 'name': 'Transparent',   'desc': 'Invisible ghost marble',            'unlock': 'Unlock Ghost Mode achievement'},
    {'key': 'fire',        'name': 'Fire',          'desc': 'Blazing fire marble',               'unlock': 'Win 10 races'},
    {'key': 'void',        'name': 'Void',          'desc': 'Pure black void marble',            'unlock': 'Play 1000 races'},
    {'key': 'pizza',       'name': 'Pizza',         'desc': 'Extra cheesy',                      'unlock': 'Secret'},
    {'key': 'dirt',        'name': 'Minecraft Dirt','desc': 'Chunky pixel dirt block',           'unlock': 'Secret'},
    {'key': 'flag',        'name': 'Country Flag',  'desc': 'Represent your country',            'unlock': 'Play 5 races'},
]

TRAIL_CATALOGUE = [
    {'key': 'none',          'name': 'No Trail',      'desc': 'Clean and minimal',               'unlock': 'default'},
    {'key': 'classic',       'name': 'Classic',       'desc': 'Simple colour streak',            'unlock': 'default'},
    {'key': 'sparkle',       'name': 'Sparkle',       'desc': 'Glittering star sparkles',        'unlock': 'Win 3 races'},
    {'key': 'fire_trail',    'name': 'Fire',          'desc': 'Blazing fire wake',               'unlock': 'Win 10 races'},
    {'key': 'rainbow_trail', 'name': 'Rainbow',       'desc': 'Seven-colour arc trail',          'unlock': 'Play 50 races'},
    {'key': 'smoke',         'name': 'Smoke',         'desc': 'Drifting smoke plume',            'unlock': 'Play 25 races'},
    {'key': 'lightning',     'name': 'Lightning',     'desc': 'Electric spark trail',            'unlock': 'Unstoppable achievement'},
    {'key': 'hearts',        'name': 'Hearts',        'desc': 'Pink floating hearts',            'unlock': 'Play 15 races'},
    {'key': 'stars',         'name': 'Stars',         'desc': 'Shooting star burst',             'unlock': 'Set 5 track records'},
    {'key': 'bubbles',       'name': 'Bubbles',       'desc': 'Floating soap bubbles',           'unlock': 'Play 30 races'},
    {'key': 'money',         'name': 'Money',         'desc': 'Cash raining behind you',         'unlock': 'Earn 5000 coins total'},
    {'key': 'cherry',        'name': 'Cherry Blossom','desc': 'Drifting pink petals',            'unlock': 'Play on 15 different maps'},
    {'key': 'dark_matter',   'name': 'Dark Matter',   'desc': 'Swirling void energy',            'unlock': 'Legend achievement'},
    {'key': 'ice_crystals',  'name': 'Ice Crystals',  'desc': 'Frozen crystal fragments',        'unlock': 'Hat Trick achievement'},
    {'key': 'lava_drip',     'name': 'Lava Drip',     'desc': 'Molten rock droplets',            'unlock': 'Play 100 races'},
    {'key': 'electric',      'name': 'Electric',      'desc': 'Crackling cyan electricity',      'unlock': 'Set 5 track records'},
    {'key': 'dna',           'name': 'DNA',           'desc': 'Double-helix strand',             'unlock': 'Season Champion'},
]

ACCESSORY_CATALOGUE = [
    {'key': 'none',          'name': 'None',          'desc': 'No accessory',                    'unlock': 'default'},
    {'key': 'crown',         'name': 'Crown',         'desc': 'The crown of champions',          'unlock': 'Win 25 races'},
    {'key': 'halo',          'name': 'Halo',          'desc': 'Angelic golden halo',             'unlock': 'Untouchable achievement'},
    {'key': 'party_hat',     'name': 'Party Hat',     'desc': 'Always celebrating',              'unlock': 'Play 10 races'},
    {'key': 'bow',           'name': 'Bow',           'desc': 'Elegant bow tie',                 'unlock': 'Play 20 races'},
    {'key': 'propeller',     'name': 'Propeller Hat', 'desc': 'Spinning propeller beanie',       'unlock': 'Play 75 races'},
    {'key': 'wings',         'name': 'Wings',         'desc': 'Speed wings for extra flair',     'unlock': 'Win 50 races'},
    {'key': 'sunglasses',    'name': 'Sunglasses',    'desc': 'Too cool for this track',         'unlock': 'Set 10 track records'},
]

# Milestone-based automatic unlocks — checked after every race
# format: (type, key, condition_fn(player_row))
MILESTONE_UNLOCKS = [
    ('skin',      'striped',     lambda r: r['races_played'] >= 10),
    ('skin',      'polka_dot',   lambda r: r['wins'] >= 5),
    ('skin',      'checker',     lambda r: r.get('track_records', 0) >= 1),
    ('skin',      'swirl',       lambda r: r['races_played'] >= 50),
    ('skin',      'galaxy',      lambda r: r['wins'] >= 25),
    ('skin',      'nebula',      lambda r: r['points'] >= 500),
    ('skin',      'lava',        lambda r: r['races_played'] >= 100),
    ('skin',      'ice',         lambda r: r['win_streak'] >= 3 or r.get('best_streak', 0) >= 3),
    ('skin',      'forest',      lambda r: r.get('maps_played', 0) >= 10),
    ('skin',      'gold',        lambda r: r['points'] >= 1000),
    ('skin',      'silver',      lambda r: r['wins'] >= 50),
    ('skin',      'diamond',     lambda r: r['wins'] >= 100),
    ('skin',      'obsidian',    lambda r: r['races_played'] >= 250),
    ('skin',      'neon',        lambda r: r.get('best_streak', 0) >= 10),
    ('skin',      'rainbow',     lambda r: r['races_played'] >= 500),
    ('skin',      'emoji',       lambda r: r['races_played'] >= 25),
    ('skin',      'fire',        lambda r: r['wins'] >= 10),
    ('skin',      'void',        lambda r: r['races_played'] >= 1000),
    ('skin',      'flag',        lambda r: r['races_played'] >= 5),
    ('trail',     'sparkle',     lambda r: r['wins'] >= 3),
    ('trail',     'fire_trail',  lambda r: r['wins'] >= 10),
    ('trail',     'rainbow_trail', lambda r: r['races_played'] >= 50),
    ('trail',     'smoke',       lambda r: r['races_played'] >= 25),
    ('trail',     'hearts',      lambda r: r['races_played'] >= 15),
    ('trail',     'bubbles',     lambda r: r['races_played'] >= 30),
    ('trail',     'cherry',      lambda r: r.get('maps_played', 0) >= 15),
    ('trail',     'ice_crystals',lambda r: r.get('best_streak', 0) >= 3),
    ('trail',     'lava_drip',   lambda r: r['races_played'] >= 100),
    ('trail',     'electric',    lambda r: r.get('track_records', 0) >= 5),
    ('accessory', 'party_hat',   lambda r: r['races_played'] >= 10),
    ('accessory', 'bow',         lambda r: r['races_played'] >= 20),
    ('accessory', 'crown',       lambda r: r['wins'] >= 25),
    ('accessory', 'halo',        lambda r: r.get('clean_races', 0) >= 5),
    ('accessory', 'propeller',   lambda r: r['races_played'] >= 75),
    ('accessory', 'wings',       lambda r: r['wins'] >= 50),
]


def get_cosmetics(login: str) -> dict:
    """Return the player's cosmetic data (unlocked + equipped)."""
    import json as _json
    with _conn() as c:
        row = c.execute('SELECT * FROM marble_cosmetics WHERE twitch_login = ?', (login,)).fetchone()
    if row:
        return {
            'unlocked_skins':       _json.loads(row['unlocked_skins']),
            'unlocked_trails':      _json.loads(row['unlocked_trails']),
            'unlocked_accessories': _json.loads(row['unlocked_accessories']),
            'equipped_skin':        row['equipped_skin'],
            'equipped_trail':       row['equipped_trail'],
            'equipped_accessory':   row['equipped_accessory'],
        }
    return {
        'unlocked_skins': ['solid'], 'unlocked_trails': ['none', 'classic'],
        'unlocked_accessories': [],
        'equipped_skin': 'solid', 'equipped_trail': 'none', 'equipped_accessory': 'none',
    }


def _ensure_cosmetics_row(c, login: str):
    c.execute("""
        INSERT OR IGNORE INTO marble_cosmetics
            (twitch_login, unlocked_skins, unlocked_trails, unlocked_accessories,
             equipped_skin, equipped_trail, equipped_accessory, updated_at)
        VALUES (?, '["solid"]', '["none","classic"]', '[]', 'solid', 'none', 'none', ?)
    """, (login, time.time()))


def unlock_cosmetic(login: str, cosm_type: str, key: str) -> bool:
    """Unlock a cosmetic for a player. Returns True if newly unlocked."""
    import json as _json
    col = {'skin': 'unlocked_skins', 'trail': 'unlocked_trails', 'accessory': 'unlocked_accessories'}.get(cosm_type)
    if not col:
        return False
    with _lock:
        with _conn() as c:
            _ensure_cosmetics_row(c, login)
            row = c.execute(f'SELECT {col} FROM marble_cosmetics WHERE twitch_login = ?', (login,)).fetchone()
            unlocked = _json.loads(row[col])
            if key in unlocked:
                return False
            unlocked.append(key)
            c.execute(f'UPDATE marble_cosmetics SET {col} = ?, updated_at = ? WHERE twitch_login = ?',
                      (_json.dumps(unlocked), time.time(), login))
    return True


def equip_cosmetic(login: str, cosm_type: str, key: str) -> bool:
    """Equip a cosmetic. Player must have it unlocked. Returns True on success."""
    import json as _json
    col_unlocked = {'skin': 'unlocked_skins', 'trail': 'unlocked_trails', 'accessory': 'unlocked_accessories'}.get(cosm_type)
    col_equipped = {'skin': 'equipped_skin', 'trail': 'equipped_trail', 'accessory': 'equipped_accessory'}.get(cosm_type)
    if not col_unlocked or not col_equipped:
        return False
    with _lock:
        with _conn() as c:
            _ensure_cosmetics_row(c, login)
            row = c.execute(f'SELECT {col_unlocked} FROM marble_cosmetics WHERE twitch_login = ?', (login,)).fetchone()
            if key not in _json.loads(row[col_unlocked]) and key != 'none':
                return False
            c.execute(f'UPDATE marble_cosmetics SET {col_equipped} = ?, updated_at = ? WHERE twitch_login = ?',
                      (key, time.time(), login))
    return True


def check_milestone_unlocks(login: str) -> list:
    """Evaluate milestone unlock conditions for a player. Returns list of newly unlocked keys."""
    import json as _json
    with _conn() as c:
        player = c.execute('SELECT * FROM marble_players WHERE twitch_login = ?', (login,)).fetchone()
        if not player:
            return []
        player = dict(player)
        # Count distinct maps played
        maps_played = c.execute(
            'SELECT COUNT(DISTINCT map_id) FROM marble_races WHERE twitch_login = ?', (login,)
        ).fetchone()[0]
        player['maps_played'] = maps_played
        # Best win streak (max ever seen in win_streak — stored as rolling current; track best separately)
        player['best_streak'] = player.get('win_streak', 0)  # approximation; TODO: track best_streak column
        # Track records count
        track_records = c.execute(
            'SELECT COUNT(*) FROM marble_track_records WHERE holder_login = ?', (login,)
        ).fetchone()[0]
        player['track_records'] = track_records

        _ensure_cosmetics_row(c, login)
        cosm = c.execute('SELECT * FROM marble_cosmetics WHERE twitch_login = ?', (login,)).fetchone()
        cosm_dict = {
            'skin':      set(_json.loads(cosm['unlocked_skins'])),
            'trail':     set(_json.loads(cosm['unlocked_trails'])),
            'accessory': set(_json.loads(cosm['unlocked_accessories'])),
        }

    newly_unlocked = []
    for (cosm_type, key, condition) in MILESTONE_UNLOCKS:
        if key in cosm_dict[cosm_type]:
            continue  # already unlocked
        try:
            if condition(player):
                if unlock_cosmetic(login, cosm_type, key):
                    newly_unlocked.append({'type': cosm_type, 'key': key})
        except Exception:
            pass
    return newly_unlocked


def get_cosmetics_catalogue() -> dict:
    """Return full catalogue of all skins, trails, and accessories."""
    return {
        'skins': SKIN_CATALOGUE,
        'trails': TRAIL_CATALOGUE,
        'accessories': ACCESSORY_CATALOGUE,
    }


# ── Coin Shop ─────────────────────────────────────────────────────────────────
# Items available for direct coin purchase. Only items with a shop_price can be
# bought; milestone/achievement-exclusive items are not listed here.
SHOP_CATALOGUE = {
    'skin': [
        {'key': 'flag',        'name': 'Country Flag',    'price': 150,  'desc': 'Represent your country'},
        {'key': 'emoji',       'name': 'Emoji',           'price': 100,  'desc': 'Your marble, your emoji'},
        {'key': 'transparent', 'name': 'Transparent',     'price': 80,   'desc': 'Invisible ghost marble'},
        {'key': 'striped',     'name': 'Striped',         'price': 200,  'desc': 'Bold diagonal stripes — or grind 10 races'},
        {'key': 'polka_dot',   'name': 'Polka Dot',       'price': 300,  'desc': 'Playful polka dots — or win 5 races'},
        {'key': 'checker',     'name': 'Checker',         'price': 400,  'desc': 'Checkerboard — or set a track record'},
        {'key': 'fire',        'name': 'Fire',            'price': 500,  'desc': 'Blazing fire marble — or win 10 races'},
        {'key': 'pizza',       'name': 'Pizza',           'price': 250,  'desc': 'Extra cheesy 🍕'},
        {'key': 'dirt',        'name': 'Minecraft Dirt',  'price': 150,  'desc': 'Chunky pixel dirt block'},
        {'key': 'neon',        'name': 'Neon',            'price': 800,  'desc': 'Electric glowing neon — or go on a 10-win streak'},
        {'key': 'rainbow',     'name': 'Rainbow',         'price': 600,  'desc': 'Full spectrum — or play 500 races'},
        {'key': 'void',        'name': 'Void',            'price': 1000, 'desc': 'Pure black void marble'},
        {'key': 'ocean',       'name': 'Ocean',           'price': 450,  'desc': 'Deep sea wave ripple'},
        {'key': 'nebula',      'name': 'Nebula',          'price': 550,  'desc': 'Drifting gas cloud glow'},
    ],
    'trail': [
        {'key': 'sparkle',     'name': 'Sparkle',         'price': 200,  'desc': 'Glittering star sparkles'},
        {'key': 'hearts',      'name': 'Hearts',          'price': 180,  'desc': 'Pink floating hearts'},
        {'key': 'smoke',       'name': 'Smoke',           'price': 250,  'desc': 'Drifting smoke plume'},
        {'key': 'bubbles',     'name': 'Bubbles',         'price': 220,  'desc': 'Floating soap bubbles'},
        {'key': 'cherry',      'name': 'Cherry Blossom',  'price': 300,  'desc': 'Drifting pink petals'},
        {'key': 'fire_trail',  'name': 'Fire',            'price': 400,  'desc': 'Blazing fire wake'},
        {'key': 'rainbow_trail','name': 'Rainbow',        'price': 600,  'desc': 'Seven-colour arc trail'},
        {'key': 'stars',       'name': 'Stars',           'price': 350,  'desc': 'Shooting star burst'},
        {'key': 'money',       'name': 'Money',           'price': 500,  'desc': 'Cash raining behind you'},
        {'key': 'electric',    'name': 'Electric',        'price': 450,  'desc': 'Crackling cyan electricity'},
        {'key': 'ice_crystals','name': 'Ice Crystals',    'price': 450,  'desc': 'Frozen crystal fragments'},
        {'key': 'lava_drip',   'name': 'Lava Drip',       'price': 500,  'desc': 'Molten rock droplets'},
    ],
    'accessory': [
        {'key': 'party_hat',   'name': 'Party Hat',       'price': 120,  'desc': 'Always celebrating'},
        {'key': 'bow',         'name': 'Bow',             'price': 200,  'desc': 'Elegant bow tie'},
        {'key': 'sunglasses',  'name': 'Sunglasses',      'price': 350,  'desc': 'Too cool for this track'},
        {'key': 'propeller',   'name': 'Propeller Hat',   'price': 500,  'desc': 'Spinning propeller beanie'},
        {'key': 'crown',       'name': 'Crown',           'price': 750,  'desc': 'The crown of champions'},
        {'key': 'wings',       'name': 'Wings',           'price': 800,  'desc': 'Speed wings for extra flair'},
    ],
}

_SHOP_PRICE_MAP = {}  # (type, key) → price — built lazily
def _build_shop_price_map():
    global _SHOP_PRICE_MAP
    _SHOP_PRICE_MAP = {}
    for cosm_type, items in SHOP_CATALOGUE.items():
        for item in items:
            _SHOP_PRICE_MAP[(cosm_type, item['key'])] = item['price']
_build_shop_price_map()


def buy_shop_item(login: str, cosm_type: str, key: str) -> dict:
    """
    Purchase a cosmetic from the shop using coins.
    Returns {'ok': True, 'coins_spent': N, 'new_balance': N} or {'ok': False, 'error': str}.
    """
    import json as _json
    price = _SHOP_PRICE_MAP.get((cosm_type, key))
    if price is None:
        return {'ok': False, 'error': 'Item not available in shop'}

    # Ensure cosmetics row exists (uses its own lock internally)
    _ensure_cosmetics_row(login)

    with _lock:
        with _conn() as c:
            prow = c.execute('SELECT coins FROM marble_players WHERE twitch_login = ?', (login,)).fetchone()
            if not prow:
                return {'ok': False, 'error': 'Player not found'}
            balance = prow['coins']
            if balance < price:
                return {'ok': False, 'error': f'Not enough coins (need {price}, have {balance})'}

            # Check if already owned
            cosm = c.execute('SELECT * FROM marble_cosmetics WHERE twitch_login = ?', (login,)).fetchone()
            col  = {'skin': 'unlocked_skins', 'trail': 'unlocked_trails', 'accessory': 'unlocked_accessories'}.get(cosm_type)
            if not col:
                return {'ok': False, 'error': 'Invalid cosmetic type'}
            owned = set(_json.loads(cosm[col]))
            if key in owned:
                return {'ok': False, 'error': 'Already owned'}

            # Deduct coins
            c.execute('UPDATE marble_players SET coins = coins - ? WHERE twitch_login = ?', (price, login))
            c.execute('INSERT INTO marble_coin_log (twitch_login, amount, reason, race_id, ts) VALUES (?,?,?,?,?)',
                      (login, -price, f'shop:{cosm_type}:{key}', None, time.time()))
            new_balance = balance - price

            # Unlock the item
            owned.add(key)
            c.execute(f'UPDATE marble_cosmetics SET {col} = ?, updated_at = ? WHERE twitch_login = ?',
                      (_json.dumps(sorted(owned)), time.time(), login))

    return {'ok': True, 'coins_spent': price, 'new_balance': new_balance}


def get_shop_catalogue(login: str = None) -> dict:
    """
    Return shop catalogue enriched with owned/price info for a player (if login given).
    """
    import json as _json
    owned = {'skin': set(), 'trail': set(), 'accessory': set()}
    balance = 0
    if login:
        with _conn() as c:
            prow = c.execute('SELECT coins FROM marble_players WHERE twitch_login = ?', (login,)).fetchone()
            if prow:
                balance = prow['coins']
            crow = c.execute('SELECT * FROM marble_cosmetics WHERE twitch_login = ?', (login,)).fetchone()
            if crow:
                owned['skin']      = set(_json.loads(crow['unlocked_skins']))
                owned['trail']     = set(_json.loads(crow['unlocked_trails']))
                owned['accessory'] = set(_json.loads(crow['unlocked_accessories']))
    result = {}
    for cosm_type, items in SHOP_CATALOGUE.items():
        result[cosm_type] = [
            {**item, 'owned': item['key'] in owned[cosm_type]}
            for item in items
        ]
    return {'catalogue': result, 'balance': balance}
