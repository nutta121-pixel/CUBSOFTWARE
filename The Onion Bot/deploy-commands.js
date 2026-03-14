const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];

// Load all command files
const commandsPath = path.join(__dirname, 'commands');

// Check if commands directory exists
if (!fs.existsSync(commandsPath)) {
    console.error('[ERROR] Commands directory not found!');
    process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command) {
        commands.push(command.data.toJSON());
        console.log(`[INFO] Loaded command: ${command.data.name}`);
    } else {
        console.log(`[WARNING] The command at ${filePath} is missing "data" property.`);
    }
}

// Create REST instance
const rest = new REST({ version: '10' }).setToken(config.token);

// Deploy commands
(async () => {
    try {
        console.log(`[INFO] Started refreshing ${commands.length} application (/) commands.`);

        // Register commands globally or to a specific guild
        let data;
        if (config.guildId) {
            // Guild-specific (faster for testing)
            data = await rest.put(
                Routes.applicationGuildCommands(config.clientId, config.guildId),
                { body: commands }
            );
            console.log(`[SUCCESS] Successfully registered ${data.length} commands to guild ${config.guildId}`);
        } else {
            // Global commands (can take up to 1 hour to update)
            data = await rest.put(
                Routes.applicationCommands(config.clientId),
                { body: commands }
            );
            console.log(`[SUCCESS] Successfully registered ${data.length} global commands`);
        }

    } catch (error) {
        console.error('[ERROR] Failed to deploy commands:', error);
    }
})();
