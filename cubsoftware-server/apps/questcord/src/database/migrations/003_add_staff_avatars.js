const { db } = require('../schema');

module.exports = {
    version: 3,
    name: 'add_staff_avatars',
    up: () => {
        console.log('Running migration: add_staff_avatars');

        db.exec(`
            ALTER TABLE staff ADD COLUMN avatar_url TEXT;
        `);

        console.log('Migration completed: add_staff_avatars');
    },
    down: () => {
        console.log('Rolling back migration: add_staff_avatars');
        console.log('Rollback not fully supported for SQLite ALTER TABLE');
    }
};
