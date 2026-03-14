const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { ServerModel } = require('../../../database/models');
const { isStaff, isDeveloper } = require('../../utils/permissions');
const config = require('../../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-server')
        .setDescription('Server management commands (Developer only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-optin')
                .setDescription('Force opt-in a server to boss spawns')
                .addStringOption(option =>
                    option.setName('server-id')
                        .setDescription('Discord server ID')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-optout')
                .setDescription('Force opt-out a server from boss spawns')
                .addStringOption(option =>
                    option.setName('server-id')
                        .setDescription('Discord server ID')
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!await isDeveloper(interaction)) {
            return interaction.reply({
                content: '❌ Only developers can use server admin commands.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'force-optin':
                await handleForceOptin(interaction);
                break;
            case 'force-optout':
                await handleForceOptout(interaction);
                break;
        }
    }
};

async function handleForceOptin(interaction) {
    const serverId = interaction.options.getString('server-id');

    try {
        const server = ServerModel.findByDiscordId(serverId);

        if (!server) {
            const guild = interaction.client.guilds.cache.get(serverId);
            if (!guild) {
                return interaction.reply({
                    content: `❌ Server with ID \`${serverId}\` not found.`,
                    ephemeral: true
                });
            }

            ServerModel.create(serverId, guild.name, guild.memberCount);
        }

        ServerModel.updateOptIn(serverId, true);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Server Force Opted In')
            .setDescription(`Server \`${serverId}\` has been force opted in to boss spawns.`)
            .addFields({ name: 'Developer', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[SERVER-ADMIN] Force opted in by ${interaction.user.username}: ${serverId}`);
    } catch (error) {
        console.error('Error force opting in:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleForceOptout(interaction) {
    const serverId = interaction.options.getString('server-id');

    try {
        const server = ServerModel.findByDiscordId(serverId);

        if (!server) {
            return interaction.reply({
                content: `❌ Server with ID \`${serverId}\` not found in database.`,
                ephemeral: true
            });
        }

        ServerModel.updateOptIn(serverId, false);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🚫 Server Force Opted Out')
            .setDescription(`Server **${server.name}** (\`${serverId}\`) opted out of boss spawns.`)
            .addFields({ name: 'Developer', value: `${interaction.user.username}` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[SERVER-ADMIN] Force opted out by ${interaction.user.username}: ${serverId}`);
    } catch (error) {
        console.error('Error force opting out:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}
