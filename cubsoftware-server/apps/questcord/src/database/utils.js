const { db } = require('./schema');
const fs = require('fs');
const path = require('path');

class DatabaseUtils {
    static checkIntegrity() {
        try {
            const result = db.prepare('PRAGMA integrity_check').get();
            return result.integrity_check === 'ok';
        } catch (error) {
            console.error('Database integrity check failed:', error);
            return false;
        }
    }

    static createBackup() {
        const backupDir = path.join(__dirname, '../../backups');
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = path.join(backupDir, `questcord-backup-${timestamp}.db`);

        try {
            db.backup(backupPath);
            console.log(`Database backed up to: ${backupPath}`);

            this.cleanOldBackups(backupDir, 7);
            return backupPath;
        } catch (error) {
            console.error('Backup failed:', error);
            return null;
        }
    }

    static cleanOldBackups(backupDir, keepDays = 7) {
        const files = fs.readdirSync(backupDir);
        const now = Date.now();
        const maxAge = keepDays * 24 * 60 * 60 * 1000;

        files.forEach(file => {
            const filePath = path.join(backupDir, file);
            const stats = fs.statSync(filePath);

            if (now - stats.mtime.getTime() > maxAge) {
                fs.unlinkSync(filePath);
                console.log(`Deleted old backup: ${file}`);
            }
        });
    }

    static transaction(callback) {
        const savepoint = `sp_${Date.now()}`;

        try {
            db.prepare(`SAVEPOINT ${savepoint}`).run();
            const result = callback();
            db.prepare(`RELEASE ${savepoint}`).run();
            return result;
        } catch (error) {
            db.prepare(`ROLLBACK TO ${savepoint}`).run();
            throw error;
        }
    }

    static vacuum() {
        try {
            db.prepare('VACUUM').run();
            console.log('Database vacuumed successfully');
            return true;
        } catch (error) {
            console.error('Vacuum failed:', error);
            return false;
        }
    }

    static optimize() {
        try {
            db.prepare('PRAGMA optimize').run();
            db.prepare('ANALYZE').run();
            console.log('Database optimized successfully');
            return true;
        } catch (error) {
            console.error('Optimization failed:', error);
            return false;
        }
    }

    static getStats() {
        const stats = {
            users: db.prepare('SELECT COUNT(*) as count FROM users').get().count,
            servers: db.prepare('SELECT COUNT(*) as count FROM servers').get().count,
            quests: db.prepare('SELECT COUNT(*) as count FROM quests').get().count,
            activeBosses: db.prepare('SELECT COUNT(*) as count FROM bosses WHERE defeated = 0').get().count,
            totalQuestsCompleted: db.prepare('SELECT COUNT(*) as count FROM user_quests WHERE completed = 1').get().count,
            activityLogs: db.prepare('SELECT COUNT(*) as count FROM activity_log').get().count
        };
        return stats;
    }
}

class MigrationManager {
    constructor() {
        this.migrationsDir = path.join(__dirname, '../../migrations');
        this.ensureMigrationsTable();
    }

    ensureMigrationsTable() {
        db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                executed_at INTEGER DEFAULT (strftime('%s', 'now'))
            )
        `);
    }

    async runMigrations() {
        if (!fs.existsSync(this.migrationsDir)) {
            fs.mkdirSync(this.migrationsDir, { recursive: true });
            return;
        }

        const files = fs.readdirSync(this.migrationsDir)
            .filter(f => f.endsWith('.js'))
            .sort();

        for (const file of files) {
            const migrationName = file.replace('.js', '');
            const executed = db.prepare('SELECT * FROM migrations WHERE name = ?').get(migrationName);

            if (!executed) {
                console.log(`Running migration: ${migrationName}`);
                const migration = require(path.join(this.migrationsDir, file));

                try {
                    DatabaseUtils.transaction(() => {
                        migration.up(db);
                        db.prepare('INSERT INTO migrations (name) VALUES (?)').run(migrationName);
                    });
                    console.log(`Migration ${migrationName} completed`);
                } catch (error) {
                    console.error(`Migration ${migrationName} failed:`, error);
                    throw error;
                }
            }
        }
    }

    createMigration(name) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
        const filename = `${timestamp}-${name}.js`;
        const filepath = path.join(this.migrationsDir, filename);

        const template = `// Migration: ${name}

module.exports = {
    up: (db) => {
        // Add your migration code here
        db.exec(\`
            -- Your SQL here
        \`);
    },

    down: (db) => {
        // Add rollback code here
        db.exec(\`
            -- Your rollback SQL here
        \`);
    }
};
`;

        if (!fs.existsSync(this.migrationsDir)) {
            fs.mkdirSync(this.migrationsDir, { recursive: true });
        }

        fs.writeFileSync(filepath, template);
        console.log(`Migration created: ${filepath}`);
        return filepath;
    }
}

module.exports = { DatabaseUtils, MigrationManager };
