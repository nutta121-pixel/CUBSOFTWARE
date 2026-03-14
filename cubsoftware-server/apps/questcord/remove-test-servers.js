const Database = require('better-sqlite3');
const db = new Database('./data/questcord.db');

const testServerIds = [
    '1000000000000000001',
    '1000000000000000002',
    '1000000000000000003',
    '1000000000000000004',
    '1000000000000000005'
];

try {
    const stmt = db.prepare('DELETE FROM servers WHERE discord_id = ?');

    console.log('Removing test servers...\n');

    for (const id of testServerIds) {
        const result = stmt.run(id);
        if (result.changes > 0) {
            console.log(`✅ Removed server: ${id}`);
        }
    }

    console.log('\n✨ Test servers removed!');

    // Show remaining servers
    const remainingServers = db.prepare('SELECT discord_id, name FROM servers ORDER BY name').all();
    console.log('\nRemaining servers in database:');
    remainingServers.forEach(s => console.log(`  - ${s.name} (${s.discord_id})`));
} catch (error) {
    console.error('❌ Error:', error);
} finally {
    db.close();
}
