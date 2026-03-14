const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { isStaff, isDeveloper, isOwner } = require('../../utils/permissions');
const { getReportingInstance } = require('../../../utils/reportingSystem');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-restart')
        .setDescription('Restart the bot (Staff/Developer only)')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for restarting the bot')
                .setRequired(false)
        ),

    async execute(interaction) {
        const hasPermission = await isStaff(interaction) || await isDeveloper(interaction) || isOwner(interaction.user.id);

        if (!hasPermission) {
            return interaction.reply({
                content: 'You do not have permission to use this command. This command is restricted to Staff and Developers only.',
                ephemeral: true
            });
        }

        const reason = interaction.options.getString('reason') || 'Manual restart requested';

        const confirmEmbed = new EmbedBuilder()
            .setColor(0xFFAA00)
            .setTitle('🔄 Bot Restart Initiated')
            .setDescription('The bot will restart in 5 seconds...')
            .addFields(
                { name: '👤 Initiated By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                { name: '📝 Reason', value: reason, inline: true },
                { name: '⏱️ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
            )
            .setFooter({ text: 'The bot will be back online shortly.' })
            .setTimestamp();

        await interaction.reply({ embeds: [confirmEmbed] });

        console.log(`[RESTART] Bot restart initiated by ${interaction.user.tag} - Reason: ${reason}`);

        // Send report to Discord channel
        const reporting = getReportingInstance();
        if (reporting) {
            await reporting.sendShutdownReport(`Restart requested by ${interaction.user.tag} - ${reason}`);
        }

        // Check if running under PM2
        const isPM2 = process.env.PM2_HOME || process.env.pm_id;

        if (isPM2) {
            // PM2 will automatically restart the process
            setTimeout(() => {
                console.log('[RESTART] Exiting process for PM2 restart...');
                process.exit(0);
            }, 5000);
        } else {
            // Not running under PM2, just exit
            setTimeout(() => {
                console.log('[RESTART] Exiting process...');
                console.log('[WARNING] Not running under PM2 - process will not automatically restart!');
                process.exit(0);
            }, 5000);
        }
    }
};
