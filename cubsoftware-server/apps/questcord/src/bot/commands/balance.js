const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your currency and gems'),

    async execute(interaction) {
        let user = UserModel.findByDiscordId(interaction.user.id);

        if (!user) {
            UserModel.create(interaction.user.id, interaction.user.username);
            user = UserModel.findByDiscordId(interaction.user.id);
        }

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(`${interaction.user.username}'s Balance`)
            .addFields(
                {
                    name: 'Dakari',
                    value: user.currency.toLocaleString(),
                    inline: true
                },
                {
                    name: 'Gems',
                    value: user.gems.toLocaleString(),
                    inline: true
                }
            )
            .setFooter({ text: 'Complete quests and defeat bosses to earn more' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
};
