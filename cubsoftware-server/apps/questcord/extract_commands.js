const fs = require('fs');
const path = require('path');

function loadCommands(dir) {
    const commands = [];
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
        const itemPath = path.join(dir, item.name);
        if (item.isDirectory()) {
            commands.push(...loadCommands(itemPath));
        } else if (item.isFile() && item.name.endsWith('.js')) {
            try {
                delete require.cache[require.resolve(itemPath)];
                const command = require(itemPath);
                if ('data' in command && 'execute' in command) {
                    commands.push(command.data.toJSON());
                }
            } catch (error) {
                console.error(`Skipped ${item.name}:`, error.message);
            }
        }
    }
    return commands;
}

const commandsPath = path.join(__dirname, 'src/bot/commands');
const commands = loadCommands(commandsPath);
fs.writeFileSync('./commands-export.json', JSON.stringify(commands, null, 2));
console.log('Commands exported:', commands.length);
commands.forEach(c => console.log('-', c.name));
