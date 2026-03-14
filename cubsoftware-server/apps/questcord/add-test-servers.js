const Database = require('better-sqlite3');
const db = new Database('./data/questcord.db');

const testServers = [
    { discord_id: '1000000000000000001', name: 'Adventure Kingdom', member_count: 150 },
    { discord_id: '1000000000000000002', name: 'Dragon\'s Lair', member_count: 250 },
    { discord_id: '1000000000000000003', name: 'Crystal Caves', member_count: 180 },
    { discord_id: '1000000000000000004', name: 'Mystic Forest', member_count: 320 },
    { discord_id: '1000000000000000005', name: 'Sky Fortress', member_count: 210 }
];

try {
    const stmt = db.prepare(`
        INSERT INTO servers (discord_id, name, opted_in, member_count)
        VALUES (?, ?, 1, ?)
        ON CONFLICT(discord_id) DO UPDATE SET
            name = excluded.name,
            member_count = excluded.member_count,
            updated_at = strftime('%s', 'now')
    `);

    console.log('Adding test servers to database...\n');

    for (const server of testServers) {
        stmt.run(server.discord_id, server.name, server.member_count);
        console.log(`✅ Added: ${server.name} (${server.discord_id})`);
    }

    console.log('\n✨ Successfully added all test servers!');
    console.log('\nYou can now travel to these servers in the web dashboard.');
    console.log('Note: These are virtual servers for testing purposes.');
} catch (error) {
    console.error('❌ Error:', error);
} finally {
    db.close();
}
