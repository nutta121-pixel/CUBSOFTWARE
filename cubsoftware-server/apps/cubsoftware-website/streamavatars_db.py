"""
StreamAvatars — database module
Handles characters, sprite frames, and overlay settings.
"""
import sqlite3, os, time, threading

_DB_PATH = os.path.normpath(os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'streamavatars.db'))
_lock = threading.Lock()

STATES = ('idle', 'walk', 'run', 'jump', 'talk')


def _conn():
    c = sqlite3.connect(_DB_PATH)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA foreign_keys=ON')
    return c


def init_db():
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    with _conn() as c:
        c.executescript("""
        CREATE TABLE IF NOT EXISTS sa_characters (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_login  TEXT    NOT NULL,
            name        TEXT    NOT NULL DEFAULT 'My Character',
            is_active   INTEGER NOT NULL DEFAULT 0,
            created_at  INTEGER NOT NULL,
            updated_at  INTEGER NOT NULL,
            thumbnail   TEXT    DEFAULT NULL
        );

        CREATE TABLE IF NOT EXISTS sa_frames (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            character_id INTEGER NOT NULL REFERENCES sa_characters(id) ON DELETE CASCADE,
            state        TEXT    NOT NULL,
            frame_index  INTEGER NOT NULL,
            pixel_data   TEXT    NOT NULL,
            width        INTEGER NOT NULL DEFAULT 48,
            height       INTEGER NOT NULL DEFAULT 64
        );

        CREATE TABLE IF NOT EXISTS sa_overlay_settings (
            channel        TEXT PRIMARY KEY,
            show_bubbles   INTEGER NOT NULL DEFAULT 1,
            max_sprites    INTEGER NOT NULL DEFAULT 50,
            sprite_scale   REAL    NOT NULL DEFAULT 3.0,
            walk_speed     REAL    NOT NULL DEFAULT 1.0,
            idle_time      INTEGER NOT NULL DEFAULT 5,
            updated_at     INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sa_frames_char ON sa_frames(character_id, state);
        CREATE INDEX IF NOT EXISTS idx_sa_chars_user  ON sa_characters(user_login);
        """)


# ── Characters ────────────────────────────────────────────────────────────────

def get_characters(user_login):
    with _lock, _conn() as c:
        rows = c.execute(
            'SELECT id, name, is_active, created_at, updated_at, thumbnail '
            'FROM sa_characters WHERE user_login=? ORDER BY updated_at DESC',
            (user_login.lower(),)
        ).fetchall()
        return [dict(r) for r in rows]


def get_active_character_id(user_login):
    with _lock, _conn() as c:
        row = c.execute(
            'SELECT id FROM sa_characters WHERE user_login=? AND is_active=1 LIMIT 1',
            (user_login.lower(),)
        ).fetchone()
        if not row:
            row = c.execute(
                'SELECT id FROM sa_characters WHERE user_login=? ORDER BY updated_at DESC LIMIT 1',
                (user_login.lower(),)
            ).fetchone()
        return row['id'] if row else None


def get_character(char_id, user_login=None):
    """Returns character info + all frames. If user_login given, enforces ownership."""
    with _lock, _conn() as c:
        if user_login:
            row = c.execute(
                'SELECT id, name, is_active, thumbnail FROM sa_characters WHERE id=? AND user_login=?',
                (char_id, user_login.lower())
            ).fetchone()
        else:
            row = c.execute(
                'SELECT id, name, is_active, thumbnail FROM sa_characters WHERE id=?',
                (char_id,)
            ).fetchone()
        if not row:
            return None

        frames = c.execute(
            'SELECT state, frame_index, pixel_data FROM sa_frames '
            'WHERE character_id=? ORDER BY state, frame_index',
            (char_id,)
        ).fetchall()

        sprites = {}
        for f in frames:
            s = f['state']
            if s not in sprites:
                sprites[s] = []
            sprites[s].append(f['pixel_data'])

        return {'id': row['id'], 'name': row['name'], 'is_active': row['is_active'],
                'thumbnail': row['thumbnail'], 'sprites': sprites}


def save_character(user_login, char_id, name, sprites, thumbnail=None):
    """Upsert character + all frames. sprites = {state: [data_url, ...]}"""
    now = int(time.time())
    with _lock, _conn() as c:
        if char_id:
            updated = c.execute(
                'UPDATE sa_characters SET name=?, updated_at=?, thumbnail=? WHERE id=? AND user_login=?',
                (name, now, thumbnail, char_id, user_login.lower())
            ).rowcount
            if not updated:
                char_id = None  # didn't own it — create new

        if not char_id:
            cur = c.execute(
                'INSERT INTO sa_characters (user_login, name, is_active, created_at, updated_at, thumbnail) '
                'VALUES (?,?,0,?,?,?)',
                (user_login.lower(), name, now, now, thumbnail)
            )
            char_id = cur.lastrowid

        c.execute('DELETE FROM sa_frames WHERE character_id=?', (char_id,))
        for state, frame_list in sprites.items():
            for i, pixel_data in enumerate(frame_list or []):
                if pixel_data:
                    c.execute(
                        'INSERT INTO sa_frames (character_id, state, frame_index, pixel_data, width, height) '
                        'VALUES (?,?,?,?,32,48)',
                        (char_id, state, i, pixel_data)
                    )
        return char_id


def activate_character(user_login, char_id):
    with _lock, _conn() as c:
        c.execute('UPDATE sa_characters SET is_active=0 WHERE user_login=?', (user_login.lower(),))
        c.execute('UPDATE sa_characters SET is_active=1 WHERE id=? AND user_login=?',
                  (char_id, user_login.lower()))


def delete_character(user_login, char_id):
    with _lock, _conn() as c:
        c.execute('DELETE FROM sa_characters WHERE id=? AND user_login=?',
                  (char_id, user_login.lower()))


# ── Overlay Settings ──────────────────────────────────────────────────────────

def get_overlay_settings(channel):
    with _lock, _conn() as c:
        row = c.execute('SELECT * FROM sa_overlay_settings WHERE channel=?',
                        (channel.lower(),)).fetchone()
        if row:
            return dict(row)
        return {
            'channel': channel.lower(), 'show_bubbles': 1, 'max_sprites': 50,
            'sprite_scale': 3.0, 'walk_speed': 1.0, 'idle_time': 5,
        }


def save_overlay_settings(channel, settings):
    now = int(time.time())
    with _lock, _conn() as c:
        c.execute('''
            INSERT INTO sa_overlay_settings
                (channel, show_bubbles, max_sprites, sprite_scale, walk_speed, idle_time, updated_at)
            VALUES (?,?,?,?,?,?,?)
            ON CONFLICT(channel) DO UPDATE SET
                show_bubbles=excluded.show_bubbles,
                max_sprites=excluded.max_sprites,
                sprite_scale=excluded.sprite_scale,
                walk_speed=excluded.walk_speed,
                idle_time=excluded.idle_time,
                updated_at=excluded.updated_at
        ''', (
            channel.lower(),
            int(settings.get('show_bubbles', 1)),
            int(settings.get('max_sprites', 50)),
            float(settings.get('sprite_scale', 3.0)),
            float(settings.get('walk_speed', 1.0)),
            int(settings.get('idle_time', 5)),
            now,
        ))
