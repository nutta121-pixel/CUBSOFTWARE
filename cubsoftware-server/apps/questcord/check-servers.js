const Database = require('better-sqlite3');
const db = new Database('./data/questcord.db', { readonly: true });

try {
    console.log('=== ALL SERVERS ===');
    const servers = db.prepare('SELECT discord_id, name, opted_in FROM servers ORDER BY name').all();
    console.log(JSON.stringify(servers, null, 2));
    console.log(`\nTotal servers: ${servers.length}`);
    console.log(`Opted in servers: ${servers.filter(s => s.opted_in).length}`);
} catch (error) {
    console.error('Error:', error);
} finally {
    db.close();
}
