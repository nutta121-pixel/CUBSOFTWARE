const { Client, GatewayIntentBits, Collection, Partials } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config.json');

class BotClient extends Client {
    constructor() {
        super({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel, Partials.GuildMember]
        });

        this.commands = new Collection();
        this.config = config;
        this.loadCommands();
        this.loadEvents();
    }

    loadCommands() {
        const commandsPath = path.join(__dirname, 'commands');
        if (!fs.existsSync(commandsPath)) {
            fs.mkdirSync(commandsPath, { recursive: true });
            return;
        }

        this.loadCommandsRecursive(commandsPath);
    }

    loadCommandsRecursive(dir) {
        const items = fs.readdirSync(dir, { withFileTypes: true });

        for (const item of items) {
            const itemPath = path.join(dir, item.name);

            if (item.isDirectory()) {
                // Recursively load commands from subdirectories
                this.loadCommandsRecursive(itemPath);
            } else if (item.isFile() && item.name.endsWith('.js')) {
                try {
                    const command = require(itemPath);

                    if ('data' in command && 'execute' in command) {
                        this.commands.set(command.data.name, command);
                        console.log(`[Commands] Loaded: ${command.data.name}`);
                    } else {
                        console.warn(`Command at ${itemPath} is missing required "data" or "execute" property`);
                    }
                } catch (error) {
                    console.error(`Error loading command ${item.name}:`, error.message);
                }
            }
        }
    }

    loadEvents() {
        const eventsPath = path.join(__dirname, 'events');
        if (!fs.existsSync(eventsPath)) {
            fs.mkdirSync(eventsPath, { recursive: true });
            return;
        }

        const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

        for (const file of eventFiles) {
            const filePath = path.join(eventsPath, file);
            const event = require(filePath);

            if (event.once) {
                this.once(event.name, (...args) => event.execute(...args));
            } else {
                this.on(event.name, (...args) => event.execute(...args));
            }

            console.log(`[Events] Loaded: ${event.name}`);
        }
    }
}

module.exports = { BotClient };
