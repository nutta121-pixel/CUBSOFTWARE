// Script to manually sync all Discord servers the bot is in
const { Client, GatewayIntentBits } = require('discord.js');
const { ServerModel } = require('./src/database/models');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds
    ]
});

client.once('ready', async () => {
    console.log(`\n🤖 Logged in as ${client.user.tag}\n`);
    console.log(`📊 Bot is in ${client.guilds.cache.size} servers\n`);
    console.log('=' .repeat(60));
    console.log('Syncing all servers to database...\n');

    let synced = 0;
    let failed = 0;

    for (const [guildId, guild] of client.guilds.cache) {
        try {
            ServerModel.create(guild.id, guild.name, guild.memberCount);
            console.log(`✅ ${guild.name} (${guild.id}) - ${guild.memberCount} members`);
            synced++;
        } catch (error) {
            console.error(`❌ Failed to sync ${guild.name}:`, error.message);
            failed++;
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`\n✨ Sync complete!`);
    console.log(`   Synced: ${synced} servers`);
    if (failed > 0) {
        console.log(`   Failed: ${failed} servers`);
    }

    // Verify by checking database
    const { db } = require('./src/database/schema');
    const allServers = db.prepare('SELECT discord_id, name, opted_in FROM servers ORDER BY name').all();

    console.log(`\n📚 Total servers in database: ${allServers.length}\n`);
    console.log('Servers in database:');
    allServers.forEach(s => {
        const status = s.opted_in ? '✅' : '❌';
        console.log(`   ${status} ${s.name} (${s.discord_id})`);
    });

    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});
