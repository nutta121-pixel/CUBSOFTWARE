const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel } = require('../../database/models');
const { isDeveloper } = require('../utils/permissions');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verify')
        .setDescription('Verify a user (Developer only)')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The user to verify')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('verified')
                .setDescription('Set verified status (true = verified, false = unverified)')
                .setRequired(true)
        ),

    async execute(interaction) {
        if (!await isDeveloper(interaction)) {
            return interaction.reply({
                content: '❌ This command is only available to developers.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const verifiedStatus = interaction.options.getBoolean('verified');

        // Get or create user
        let user = UserModel.findByDiscordId(targetUser.id);
        if (!user) {
            UserModel.create(targetUser.id, targetUser.username);
            user = UserModel.findByDiscordId(targetUser.id);
        }

        try {
            const { db } = require('../../database/schema');

            // Update verified status
            db.prepare('UPDATE users SET verified = ? WHERE discord_id = ?').run(verifiedStatus ? 1 : 0, targetUser.id);

            const embed = new EmbedBuilder()
                .setColor(verifiedStatus ? config.theme.colors.success : config.theme.colors.warning)
                .setTitle(verifiedStatus ? '✅ User Verified' : '❌ User Unverified')
                .setDescription(`${targetUser.username} has been ${verifiedStatus ? 'verified' : 'unverified'}.`)
                .addFields(
                    {
                        name: 'User',
                        value: `${targetUser.username} (${targetUser.id})`,
                        inline: true
                    },
                    {
                        name: 'Status',
                        value: verifiedStatus ? '✓ Verified' : '✗ Not Verified',
                        inline: true
                    },
                    {
                        name: 'Developer',
                        value: `${interaction.user.username} (${interaction.user.id})`,
                        inline: false
                    }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

            console.log(`[VERIFY] ${targetUser.username} (${targetUser.id}) ${verifiedStatus ? 'verified' : 'unverified'} by ${interaction.user.username}`);
        } catch (error) {
            console.error('Error verifying user:', error);
            await interaction.reply({
                content: 'An error occurred while updating verification status.',
                ephemeral: true
            });
        }
    }
};
