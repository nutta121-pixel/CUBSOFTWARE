const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all CleanMe bot commands and how to use them'),

    new SlashCommandBuilder()
        .setName('save')
        .setDescription('Save your current server configuration (roles, channels, categories)'),

    new SlashCommandBuilder()
        .setName('list')
        .setDescription('Check if your server has a saved configuration'),

    new SlashCommandBuilder()
        .setName('copy')
        .setDescription('Copy another server\'s saved configuration to your server')
        .addStringOption(option =>
            option.setName('serverid')
                .setDescription('The server ID to copy the configuration from')
                .setRequired(true)
        ),

    new SlashCommandBuilder()
        .setName('clean')
        .setDescription('Delete ALL channels and roles from your server'),

    new SlashCommandBuilder()
        .setName('cleanroles')
        .setDescription('Delete all roles from your server'),

    new SlashCommandBuilder()
        .setName('cleanchannels')
        .setDescription('Delete all channels and categories from your server'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Register commands globally
        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
