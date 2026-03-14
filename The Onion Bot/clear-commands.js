const { REST, Routes } = require('discord.js');
const config = require('./config');

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('[INFO] Clearing all commands...');

        // Clear guild commands if GUILD_ID is set
        if (config.guildId) {
            await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: [] }
            );
            console.log(`[SUCCESS] Cleared all guild commands from ${config.guildId}`);
        }

        // Clear global commands
        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: [] }
        );
        console.log('[SUCCESS] Cleared all global commands');

    } catch (error) {
        console.error('[ERROR] Failed to clear commands:', error);
    }
})();
