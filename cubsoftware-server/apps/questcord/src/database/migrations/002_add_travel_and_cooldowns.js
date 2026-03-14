const { db } = require('../schema');

module.exports = {
    version: 2,
    name: 'add_travel_and_cooldowns',
    up: () => {
        console.log('Running migration: add_travel_and_cooldowns');

        // Add travel-related columns to users table
        db.exec(`
            ALTER TABLE users ADD COLUMN traveling INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN travel_destination TEXT;
            ALTER TABLE users ADD COLUMN travel_arrival_time INTEGER;
            ALTER TABLE users ADD COLUMN last_travel_time INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN last_quest_time INTEGER DEFAULT 0;
        `);

        console.log('Migration completed: add_travel_and_cooldowns');
    },
    down: () => {
        console.log('Rolling back migration: add_travel_and_cooldowns');

        // Note: SQLite doesn't support DROP COLUMN easily
        // Would need to recreate table to rollback
        console.log('Rollback not fully supported for SQLite ALTER TABLE');
    }
};
