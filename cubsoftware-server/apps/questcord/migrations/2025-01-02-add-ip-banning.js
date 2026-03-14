// Migration: add-ip-banning

module.exports = {
    up: (db) => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS banned_ips (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ip_address TEXT UNIQUE NOT NULL,
                reason TEXT NOT NULL,
                banned_by TEXT NOT NULL,
                banned_by_id TEXT NOT NULL,
                banned_at INTEGER DEFAULT (strftime('%s', 'now')),
                expires_at INTEGER,
                permanent INTEGER DEFAULT 1
            );

            CREATE INDEX IF NOT EXISTS idx_banned_ips_ip ON banned_ips(ip_address);
            CREATE INDEX IF NOT EXISTS idx_banned_ips_expires ON banned_ips(expires_at);
        `);
    },

    down: (db) => {
        db.exec(`
            DROP TABLE IF EXISTS banned_ips;
        `);
    }
};
