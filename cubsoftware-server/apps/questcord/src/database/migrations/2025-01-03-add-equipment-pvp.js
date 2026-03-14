const { db } = require('../schema');

function migrate() {
    db.exec(`
        ALTER TABLE items ADD COLUMN item_type TEXT DEFAULT 'consumable';
        ALTER TABLE items ADD COLUMN slot TEXT;
        ALTER TABLE items ADD COLUMN attack_bonus INTEGER DEFAULT 0;
        ALTER TABLE items ADD COLUMN defense_bonus INTEGER DEFAULT 0;
        ALTER TABLE items ADD COLUMN level_requirement INTEGER DEFAULT 1;

        ALTER TABLE users ADD COLUMN pvp_enabled INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN in_combat INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN equipped_weapon INTEGER;
        ALTER TABLE users ADD COLUMN equipped_helmet INTEGER;
        ALTER TABLE users ADD COLUMN equipped_chest INTEGER;
        ALTER TABLE users ADD COLUMN equipped_legs INTEGER;
        ALTER TABLE users ADD COLUMN equipped_boots INTEGER;
        ALTER TABLE users ADD COLUMN total_pvp_wins INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN total_pvp_losses INTEGER DEFAULT 0;

        CREATE TABLE IF NOT EXISTS pvp_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenger_id INTEGER NOT NULL,
            opponent_id INTEGER NOT NULL,
            winner_id INTEGER,
            challenger_damage INTEGER DEFAULT 0,
            opponent_damage INTEGER DEFAULT 0,
            currency_won INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            completed_at INTEGER,
            FOREIGN KEY (challenger_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_pvp_challenger ON pvp_matches(challenger_id);
        CREATE INDEX IF NOT EXISTS idx_pvp_opponent ON pvp_matches(opponent_id);
        CREATE INDEX IF NOT EXISTS idx_pvp_completed ON pvp_matches(completed);
    `);

    console.log('Migration 2025-01-03-add-equipment-pvp completed');
}

module.exports = { migrate };
