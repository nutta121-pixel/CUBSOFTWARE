const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');

if (!fs.existsSync(commandsPath)) {
    console.error('[ERROR] Commands directory not found!');
    process.exit(1);
}

const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);

    if ('data' in command) {
        commands.push({
            name: command.data.name,
            data: command.data.toJSON()
        });
        console.log(`[INFO] Loaded command: ${command.data.name}`);
    }
}

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log(`[INFO] Attempting to deploy ${commands.length} commands one by one...`);

        for (let i = 0; i < commands.length; i++) {
            try {
                const route = config.guildId
                    ? Routes.applicationGuildCommands(config.clientId, config.guildId)
                    : Routes.applicationCommands(config.clientId);

                // Get current commands
                const currentCommands = await rest.get(route);

                // Add the new command
                const newCommands = [...currentCommands.map(c => ({
                    name: c.name,
                    description: c.description,
                    type: c.type,
                    options: c.options
                })), commands[i].data];

                await rest.put(route, { body: newCommands });

                console.log(`[${i+1}/${commands.length}] ✓ Successfully added: ${commands[i].name}`);
            } catch (error) {
                console.log(`[${i+1}/${commands.length}] ✗ Failed to add: ${commands[i].name}`);
                console.log(`[ERROR] ${error.message}`);
                console.log(`[INFO] Maximum commands reached: ${i}`);
                break;
            }
        }

    } catch (error) {
        console.error('[ERROR] Failed:', error.message);
    }
})();
