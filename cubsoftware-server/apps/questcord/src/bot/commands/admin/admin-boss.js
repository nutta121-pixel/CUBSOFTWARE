const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { BossModel, BossParticipantModel, ServerModel } = require('../../../database/models');
const { isStaff, isDeveloper } = require('../../utils/permissions');
const { BossManager } = require('../../utils/bossManager');
const config = require('../../../../config.json');
const { db } = require('../../../database/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-boss')
        .setDescription('Boss management commands (Staff only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('force-spawn')
                .setDescription('Force spawn a boss on a server')
                .addStringOption(option =>
                    option.setName('server-id')
                        .setDescription('Discord server ID to spawn boss on')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-health')
                .setDescription('Set the current boss health')
                .addIntegerOption(option =>
                    option.setName('health')
                        .setDescription('New health value')
                        .setRequired(true)
                        .setMinValue(0)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('view-participants')
                .setDescription('View all participants for the active boss')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Clear the active boss (Developer only)')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!await isStaff(interaction)) {
            return interaction.reply({
                content: 'This command is only available to QuestCord staff.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'force-spawn':
                await handleForceSpawn(interaction);
                break;
            case 'set-health':
                await handleSetHealth(interaction);
                break;
            case 'view-participants':
                await handleViewParticipants(interaction);
                break;
            case 'clear':
                await handleClear(interaction);
                break;
        }
    }
};

async function handleForceSpawn(interaction) {
    const serverId = interaction.options.getString('server-id');

    try {
        const server = ServerModel.findByDiscordId(serverId);

        if (!server) {
            return interaction.reply({
                content: `❌ Server with ID \`${serverId}\` not found in database.`,
                ephemeral: true
            });
        }

        if (!server.opted_in) {
            return interaction.reply({
                content: `❌ Server **${server.name}** is not opted in to boss spawns.`,
                ephemeral: true
            });
        }

        const activeBoss = BossModel.getActiveBoss();
        if (activeBoss) {
            return interaction.reply({
                content: `❌ There is already an active boss: **${activeBoss.boss_name}** (${activeBoss.id})`,
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const { getRandomBoss } = require('../../utils/questData');
        const bossTemplate = getRandomBoss();
        const expiresAt = Math.floor(Date.now() / 1000) + (config.boss.spawnDuration / 1000);

        const result = BossModel.create(
            bossTemplate.type,
            bossTemplate.name,
            serverId,
            bossTemplate.health,
            bossTemplate.rewardCurrency,
            bossTemplate.rewardGems,
            expiresAt
        );

        await BossManager.announceBossSpawn(server, bossTemplate, result.lastInsertRowid);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ Boss Force Spawned')
            .setDescription(`**${bossTemplate.name}** has been spawned on **${server.name}**`)
            .addFields(
                { name: 'Boss Type', value: bossTemplate.type, inline: true },
                { name: 'Health', value: bossTemplate.health.toLocaleString(), inline: true },
                { name: 'Rewards', value: `${bossTemplate.rewardCurrency} coins, ${bossTemplate.rewardGems} gems`, inline: false },
                { name: 'Staff Member', value: `${interaction.user.username} (${interaction.user.id})` }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
        console.log(`[BOSS-ADMIN] Boss force spawned by ${interaction.user.username}: ${bossTemplate.name} on ${server.name}`);
    } catch (error) {
        console.error('Error force spawning boss:', error);
        await interaction.editReply({ content: `An error occurred: ${error.message}` });
    }
}

async function handleSetHealth(interaction) {
    const health = interaction.options.getInteger('health');

    try {
        const boss = BossModel.getActiveBoss();

        if (!boss) {
            return interaction.reply({
                content: '❌ There is no active boss to modify.',
                ephemeral: true
            });
        }

        const oldHealth = boss.health;
        db.prepare('UPDATE bosses SET health = ? WHERE id = ?').run(health, boss.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('⚙️ Boss Health Modified')
            .setDescription(`Health for **${boss.boss_name}** has been changed`)
            .addFields(
                { name: 'Previous Health', value: `${oldHealth.toLocaleString()} / ${boss.max_health.toLocaleString()}`, inline: true },
                { name: 'New Health', value: `${health.toLocaleString()} / ${boss.max_health.toLocaleString()}`, inline: true },
                { name: 'Staff Member', value: `${interaction.user.username} (${interaction.user.id})` }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        await BossManager.updateBossNotification();
        console.log(`[BOSS-ADMIN] Boss health modified by ${interaction.user.username}: ${oldHealth} -> ${health}`);
    } catch (error) {
        console.error('Error setting boss health:', error);
        await interaction.reply({ content: 'An error occurred while modifying boss health.', ephemeral: true });
    }
}

async function handleViewParticipants(interaction) {
    try {
        const boss = BossModel.getActiveBoss();

        if (!boss) {
            return interaction.reply({ content: '❌ There is no active boss.', ephemeral: true });
        }

        const participants = BossParticipantModel.getParticipants(boss.id);

        if (participants.length === 0) {
            return interaction.reply({ content: `No participants yet for **${boss.boss_name}**.`, ephemeral: true });
        }

        const participantList = participants.map((p, i) =>
            `${i + 1}. **${p.username}** - ${p.damage_dealt.toLocaleString()} damage`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(`👥 Participants for ${boss.boss_name}`)
            .setDescription(participantList)
            .setFooter({ text: `Total: ${participants.length} participants` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error viewing boss participants:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}

async function handleClear(interaction) {
    if (!await isDeveloper(interaction)) {
        return interaction.reply({
            content: '❌ Only developers can clear the active boss.',
            ephemeral: true
        });
    }

    try {
        const boss = BossModel.getActiveBoss();

        if (!boss) {
            return interaction.reply({ content: '❌ There is no active boss to clear.', ephemeral: true });
        }

        db.prepare('DELETE FROM bosses WHERE id = ?').run(boss.id);
        db.prepare('DELETE FROM boss_participants WHERE boss_id = ?').run(boss.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('🗑️ Boss Cleared')
            .setDescription(`**${boss.boss_name}** has been removed from the database.`)
            .addFields({ name: 'Staff Member', value: `${interaction.user.username} (${interaction.user.id})` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[BOSS-ADMIN] Boss cleared by ${interaction.user.username}: ${boss.boss_name} (ID: ${boss.id})`);
    } catch (error) {
        console.error('Error clearing boss:', error);
        await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
}
