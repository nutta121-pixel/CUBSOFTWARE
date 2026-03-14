const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { ServerModel } = require('../../database/models');
const { QuestManager } = require('../utils/questManager');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('optin')
        .setDescription('Enable quests in this server (Server Owner only)')
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

        let server = ServerModel.findByDiscordId(interaction.guild.id);

        if (!server) {
            ServerModel.create(interaction.guild.id, interaction.guild.name, interaction.guild.memberCount);
            server = ServerModel.findByDiscordId(interaction.guild.id);
        }

        if (server.opted_in) {
            return interaction.reply({
                content: 'This server is already opted in to the quest system.',
                ephemeral: true
            });
        }

        ServerModel.updateOptIn(interaction.guild.id, true);
        QuestManager.assignInitialQuests(interaction.guild.id, interaction.guild.name);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('Quest System Enabled')
            .setDescription(`${interaction.guild.name} is now part of the QuestCord universe.\n\nPlayers can now complete quests in this server and it may be selected for boss spawns.`)
            .addFields({
                name: 'Getting Started',
                value: 'Users can use `/quests` to see available quests and `/tutorial` to learn how to play.'
            })
            .setFooter({ text: 'Use /optout to disable quests at any time' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
