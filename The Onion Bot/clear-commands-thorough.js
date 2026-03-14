const { REST, Routes } = require('discord.js');
const config = require('./config');

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('[INFO] Fetching all existing commands...');

        // Get and delete guild commands if GUILD_ID is set
        if (config.guildId) {
            const guildCommands = await rest.get(
                Routes.applicationGuildCommands(config.clientId, config.guildId)
            );

            console.log(`[INFO] Found ${guildCommands.length} guild commands`);

            for (const command of guildCommands) {
                await rest.delete(
                    Routes.applicationGuildCommand(config.clientId, config.guildId, command.id)
                );
                console.log(`[INFO] Deleted guild command: ${command.name}`);
            }

            console.log('[SUCCESS] Cleared all guild commands');
        }

        // Get and delete global commands
        const globalCommands = await rest.get(
            Routes.applicationCommands(config.clientId)
        );

        console.log(`[INFO] Found ${globalCommands.length} global commands`);

        for (const command of globalCommands) {
            await rest.delete(
                Routes.applicationCommand(config.clientId, command.id)
            );
            console.log(`[INFO] Deleted global command: ${command.name}`);
        }

        console.log('[SUCCESS] Cleared all global commands');
        console.log('[SUCCESS] All commands cleared! You can now deploy new commands.');

    } catch (error) {
        console.error('[ERROR] Failed to clear commands:', error);
    }
})();
