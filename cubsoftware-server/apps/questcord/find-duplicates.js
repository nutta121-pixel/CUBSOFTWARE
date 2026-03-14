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
                    commands.push({ name: command.data.name, file: itemPath });
                }
            } catch (error) {
                console.error(`Error loading ${item.name}:`, error.message);
            }
        }
    }

    return commands;
}

const commandsPath = path.join(__dirname, 'src/bot/commands');
const commands = loadCommands(commandsPath);

console.log('Total commands:', commands.length);
commands.forEach((cmd, i) => console.log(`${i}. ${cmd.name} - ${path.basename(cmd.file)}`));

const names = commands.map(c => c.name);
const duplicates = names.filter((name, index) => names.indexOf(name) !== index);

if (duplicates.length > 0) {
    console.log('\n⚠️  DUPLICATES FOUND:', [...new Set(duplicates)]);
    duplicates.forEach(dupName => {
        console.log(`\nFiles with command name "${dupName}":`);
        commands.filter(c => c.name === dupName).forEach(c => console.log(`  - ${c.file}`));
    });
} else {
    console.log('\n✅ No duplicates found!');
}
