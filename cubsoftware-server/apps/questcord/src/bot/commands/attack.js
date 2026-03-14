const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BossService = require('../../services/gameEngine/BossService');
const { UserModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('attack')
        .setDescription('Attack the active boss'),

    async execute(interaction) {
        await interaction.deferReply();

        // Attack boss using BossService
        const attackResult = await BossService.attackBoss(interaction.user.id, null, 'discord');

        if (!attackResult.success) {
            let errorMessage = `❌ ${attackResult.error}`;

            // Handle specific error types
            if (attackResult.type === 'traveling') {
                const timeLeft = attackResult.data.timeLeft;
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;
                errorMessage = `🚢 You're currently traveling to **${attackResult.data.destination}**! You can't fight bosses while on the road.\n\n⏱️ Arrival in: **${minutes}m ${seconds}s**`;
            }

            return interaction.editReply({ content: errorMessage });
        }

        // Attack successful - display results
        const { boss, damage, bossDefeated, rewards, status } = attackResult.data;

        if (bossDefeated) {
            // Boss was defeated
            const defeatEmbed = new EmbedBuilder()
                .setColor(config.theme.colors.success)
                .setTitle('🎉 Boss Defeated!')
                .setDescription(`**${boss.boss_name}** has been defeated!\n\nYour final blow dealt **${damage}** damage!`)
                .addFields(
                    {
                        name: '💰 Your Rewards',
                        value: `+${rewards.currency} Dakari\n+${rewards.gems} Gems\n+${rewards.experience} XP`,
                        inline: true
                    },
                    {
                        name: '👥 Participants',
                        value: attackResult.data.participantCount?.toString() || '1',
                        inline: true
                    }
                );

            if (rewards.isTopDealer) {
                defeatEmbed.addFields({
                    name: '🏆 Top Damage Dealer Bonus',
                    value: 'You dealt the most damage! +50% rewards',
                    inline: false
                });
            }

            if (attackResult.data.leveledUp) {
                defeatEmbed.addFields({
                    name: `⬆️ Level Up! ${attackResult.data.oldLevel} → ${attackResult.data.newLevel}`,
                    value: `You reached level ${attackResult.data.newLevel}!`,
                    inline: false
                });
            }

            defeatEmbed.setFooter({ text: 'The next boss will spawn soon' })
                .setTimestamp();

            return interaction.editReply({ embeds: [defeatEmbed] });
        }

        // Boss still alive
        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle(`⚔️ Attacking ${boss.boss_name}`)
            .setDescription(`You dealt **${damage}** damage!`)
            .addFields(
                {
                    name: '❤️ Boss Health',
                    value: `${boss.health.toLocaleString()} / ${boss.max_health.toLocaleString()} (${status.healthPercent}%)`,
                    inline: true
                },
                {
                    name: '⏱️ Time Remaining',
                    value: `${status.minutesRemaining} minutes`,
                    inline: true
                }
            )
            .setFooter({ text: 'Keep attacking to defeat the boss!' })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
};
