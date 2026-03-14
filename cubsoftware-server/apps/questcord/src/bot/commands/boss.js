const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const BossService = require('../../services/gameEngine/BossService');
const { BossModel } = require('../../database/models');
const { isStaff } = require('../utils/permissions');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boss')
        .setDescription('View or manage the active boss')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('View the active boss status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('despawn')
                .setDescription('Manually despawn the active boss (Staff only)')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'despawn') {
            return handleDespawn(interaction);
        }

        // Default behavior (status)
        return handleStatus(interaction);
    }
};

async function handleStatus(interaction) {
        // Get active boss using BossService
        const bossResult = await BossService.getActiveBoss('discord');

        if (!bossResult.success || !bossResult.data) {
            return interaction.reply({
                content: 'There is no active boss right now. Check back later.',
                ephemeral: true
            });
        }

        const { boss, status, participants } = bossResult.data;
        const topDamagers = participants.slice(0, 5);

        const embed = new EmbedBuilder()
            .setColor(status.isAlive ? config.theme.colors.warning : config.theme.colors.success)
            .setTitle(boss.boss_name)
            .setDescription(`A powerful ${boss.boss_type} has appeared`)
            .addFields(
                {
                    name: 'Health',
                    value: `${boss.health.toLocaleString()} / ${boss.max_health.toLocaleString()} (${status.healthPercent}%)`,
                    inline: true
                },
                {
                    name: 'Time Remaining',
                    value: `${status.minutesRemaining} minutes`,
                    inline: true
                },
                {
                    name: 'Status',
                    value: status.isAlive ? 'Active' : 'Defeated',
                    inline: true
                },
                {
                    name: 'Rewards',
                    value: `${boss.reward_currency} currency, ${boss.reward_gems} gems\n(Top damage dealer gets 50% bonus)`,
                    inline: false
                }
            );

        if (topDamagers.length > 0) {
            const damageList = topDamagers.map((p, i) => `${i + 1}. ${p.username} - ${p.damage_dealt.toLocaleString()} damage`).join('\n');
            embed.addFields({
                name: 'Top Damage Dealers',
                value: damageList
            });
        }

        embed.setFooter({ text: 'Use /attack to join the fight' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
}

async function handleDespawn(interaction) {
    // Check if user is staff
    if (!await isStaff(interaction)) {
        return interaction.reply({
            content: 'This command is only available to QuestCord staff.',
            ephemeral: true
        });
    }

    const boss = BossModel.getActiveBoss();

    if (!boss) {
        return interaction.reply({
            content: 'There is no active boss to despawn.',
            ephemeral: true
        });
    }

    // Manually despawn the boss
    await BossManager.announceBossDespawn(boss.id);

    // Mark boss as expired in database
    BossModel.cleanupExpired();

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.warning)
        .setTitle('Boss Manually Despawned')
        .setDescription(`**${boss.boss_name}** has been manually despawned by staff.`)
        .addFields(
            {
                name: 'Boss Info',
                value: `Type: ${boss.boss_type}\nRemaining HP: ${boss.health.toLocaleString()} / ${boss.max_health.toLocaleString()}`,
                inline: false
            },
            {
                name: 'Staff Member',
                value: `${interaction.user.username} (${interaction.user.id})`,
                inline: true
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    console.log(`[BOSS] Boss manually despawned by ${interaction.user.username}: ${boss.boss_name} (ID: ${boss.id})`);
};
