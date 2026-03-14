const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { getGuildSettings, updateGuildSettings, markSetupComplete } = require('../utils/guildSettings');
const webhookLogger = require('../utils/webhookLogger');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure Solibot for this server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('confinement_channel')
                .setDescription('The voice channel for solitary confinement')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('log_channel')
                .setDescription('Optional: Text channel for logging bot actions')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),

    async execute(interaction) {
        const confinementChannel = interaction.options.getChannel('confinement_channel');
        const logChannel = interaction.options.getChannel('log_channel');

        // Update guild settings
        const settings = {
            confinementChannelId: confinementChannel.id,
            confinementChannelName: confinementChannel.name,
            logChannelId: logChannel?.id || null,
            logChannelName: logChannel?.name || null,
            setupBy: interaction.user.id,
            setupAt: Date.now()
        };

        updateGuildSettings(interaction.guildId, settings);
        markSetupComplete(interaction.guildId);

        console.log(`[SETUP] ${interaction.guild.name} configured by ${interaction.user.tag}`);
        console.log(`[SETUP] Confinement channel: #${confinementChannel.name}`);
        if (logChannel) {
            console.log(`[SETUP] Log channel: #${logChannel.name}`);
        }

        // Send webhook notification
        webhookLogger.logCustom({
            title: '⚙️ Server Setup Complete',
            description: `**${interaction.guild.name}** has been configured`,
            color: 0x5865f2,
            fields: [
                { name: '👮 Setup By', value: `<@${interaction.user.id}>`, inline: true },
                { name: '🔊 Confinement Channel', value: `#${confinementChannel.name}`, inline: true },
                { name: '📝 Log Channel', value: logChannel ? `#${logChannel.name}` : 'Not set', inline: true },
                { name: '🏠 Server', value: interaction.guild.name, inline: true },
                { name: '👥 Members', value: `${interaction.guild.memberCount}`, inline: true }
            ]
        });

        // Build response
        let response = `✅ **Solibot Setup Complete!**\n\n`;
        response += `**Confinement Channel:** ${confinementChannel}\n`;
        if (logChannel) {
            response += `**Log Channel:** ${logChannel}\n`;
        }
        response += `\n*Users sent to solitary confinement will be moved to ${confinementChannel} by default.*`;

        await interaction.reply({
            content: response,
            ephemeral: true
        });
    }
};
