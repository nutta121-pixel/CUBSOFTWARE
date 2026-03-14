const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { ServerModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('optout')
        .setDescription('Disable quests in this server (Server Owner only)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'This command can only be used in a server.',
                ephemeral: true
            });
        }

        if (interaction.guild.ownerId !== interaction.user.id) {
            return interaction.reply({
                content: 'Only the server owner can use this command.',
                ephemeral: true
            });
        }

        const server = ServerModel.findByDiscordId(interaction.guild.id);

        if (!server || !server.opted_in) {
            return interaction.reply({
                content: 'This server is not opted in to the quest system.',
                ephemeral: true
            });
        }

        ServerModel.updateOptIn(interaction.guild.id, false);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('Quest System Disabled')
            .setDescription(`${interaction.guild.name} has been removed from the QuestCord universe.\n\nQuests will no longer be available in this server and it will not be selected for boss spawns.`)
            .setFooter({ text: 'Use /optin to re-enable quests at any time' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
