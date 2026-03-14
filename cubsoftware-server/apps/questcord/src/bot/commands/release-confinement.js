const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { db } = require('../../database/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('release-confinement')
        .setDescription('Release a user from solitary confinement')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to release from confinement')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        // Permission check
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply({
                content: '❌ Only administrators can use this command.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');

        try {
            // Check if user has an active confinement
            const confinement = db.prepare(`
                SELECT * FROM solitary_confinement
                WHERE user_id = ? AND server_id = ? AND active = 1
            `).get(targetUser.id, interaction.guild.id);

            if (!confinement) {
                return interaction.editReply({
                    content: `❌ ${targetUser} is not currently in solitary confinement.`,
                    ephemeral: true
                });
            }

            // Deactivate the confinement
            db.prepare(`
                UPDATE solitary_confinement
                SET active = 0
                WHERE id = ?
            `).run(confinement.id);

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#4CAF50')
                .setTitle('🔓 Released from Solitary Confinement')
                .setDescription(`${targetUser} has been released from confinement`)
                .addFields(
                    { name: 'Released by', value: interaction.user.tag, inline: true },
                    { name: 'Original Channel', value: `<#${confinement.channel_id}>`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error releasing from confinement:', error);
            return interaction.editReply({
                content: '❌ An error occurred while releasing from confinement.',
                ephemeral: true
            });
        }
    }
};
