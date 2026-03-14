require('dotenv').config();

// Validate required environment variables
const requiredEnvVars = ['DISCORD_TOKEN', 'CLIENT_ID', 'CREATOR_ID'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
    console.error('[ERROR] Missing required environment variables:');
    missingVars.forEach(varName => console.error(`  - ${varName}`));
    console.error('\nPlease create a .env file with these variables.');
    console.error('See .env.example for reference.');
    process.exit(1);
}

// GUILD_ID is optional - if not set, commands will be registered globally
if (!process.env.GUILD_ID) {
    console.log('[INFO] GUILD_ID not set - commands will be registered globally (may take up to 1 hour to update)');
}

// Validate creator ID matches the required value
const REQUIRED_CREATOR_ID = '378501056008683530';
if (process.env.CREATOR_ID !== REQUIRED_CREATOR_ID) {
    console.error('[ERROR] Bot cannot run without the ID 378501056008683530 (CUB)');
    console.error(`[ERROR] Current CREATOR_ID in .env: ${process.env.CREATOR_ID || 'NOT SET'}`);
    console.error('[ERROR] Please set CREATOR_ID=378501056008683530 in your .env file');
    process.exit(1);
}

module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    creatorId: process.env.CREATOR_ID,
    debug: process.env.DEBUG === 'true'
};
