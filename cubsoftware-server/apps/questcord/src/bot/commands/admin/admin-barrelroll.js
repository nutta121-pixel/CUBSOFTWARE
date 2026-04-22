const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { isOwner } = require('../../utils/permissions');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-barrelroll')
        .setDescription('Trigger a barrel roll on all rockets on the website (Bot Owners only)'),

    async execute(interaction) {
        if (!isOwner(interaction.user.id)) {
            return interaction.reply({
                content: 'Only bot owners can trigger the barrel roll.',
                flags: MessageFlags.Ephemeral
            });
        }

        const secret     = process.env.BARREL_ROLL_SECRET || '';
        const websiteUrl = process.env.WEBSITE_INTERNAL_URL || 'http://localhost:5000';

        try {
            const res = await fetch(`${websiteUrl}/api/trigger-barrel-roll`, {
                method:  'POST',
                headers: { 'Authorization': `Bearer ${secret}` }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const embed = new EmbedBuilder()
                .setColor(0x9b59b6)
                .setTitle('🚀 Barrel Roll Triggered!')
                .setDescription('All rockets on the website are doing a barrel roll right now.')
                .setFooter({ text: `Triggered by ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        } catch (err) {
            await interaction.reply({
                content: `Failed to trigger barrel roll: ${err.message}`,
                flags: MessageFlags.Ephemeral
            });
        }
    }
};
