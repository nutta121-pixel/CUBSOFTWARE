const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tutorial')
        .setDescription('Learn how to use QuestCord'),

    async execute(interaction) {
        const embeds = [];

        const welcomeEmbed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('Welcome to QuestCord')
            .setDescription('QuestCord is a quest-based adventure bot that lets you explore virtual servers, complete quests, and defeat bosses.')
            .addFields(
                {
                    name: 'How It Works',
                    value: 'Each Discord server becomes a virtual location you can travel to. Complete quests to earn currency and gems, then use them to climb the leaderboard and unlock rewards.'
                }
            );

        const questingEmbed = new EmbedBuilder()
            .setColor(config.theme.colors.secondary)
            .setTitle('🎮 Interactive Questing System')
            .addFields(
                {
                    name: 'Daily Quests',
                    value: 'Every server has 5 unique quests that rotate daily at midnight NZ time. Quests vary in difficulty and rewards.'
                },
                {
                    name: 'Accepting & Completing Quests',
                    value: 'Use `/quests` to see available quests. Click the button to accept a quest and start its interactive task. Each quest can only be completed once per day.'
                },
                {
                    name: 'Quest Types',
                    value: '🗡️ **Combat** - Button mashing battle\n🌿 **Gathering** - Wait for resources\n🗺️ **Exploration** - Multi-step journey\n📦 **Delivery** - Timed travel\n💬 **Social** - Instant completion'
                },
                {
                    name: 'Traveling',
                    value: 'You can only do 5 quests per server per day. Use `/travel` to find other servers and continue questing.'
                }
            );

        const bossEmbed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('Boss System')
            .addFields(
                {
                    name: 'Boss Spawns',
                    value: 'Bosses randomly spawn in servers throughout the day. Only one boss can be active at a time.'
                },
                {
                    name: 'Fighting Bosses',
                    value: 'Use `/attack` to deal damage to the boss. Work together with other players to defeat it within 60 minutes.'
                },
                {
                    name: 'Boss Rewards',
                    value: 'All participants receive rewards when the boss is defeated. The top damage dealer gets bonus rewards.'
                }
            );

        const progressionEmbed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('Progression & Rewards')
            .addFields(
                {
                    name: 'Dakari & Gems',
                    value: 'Earn Dakari and gems from quests and bosses. Use them in the shop to purchase items.'
                },
                {
                    name: 'Leaderboard',
                    value: 'Compete on the global leaderboard. Top 3 players each month receive special rewards. The leaderboard resets on the 1st of each month.'
                },
                {
                    name: 'Getting Started',
                    value: 'Start with `/quests` to see what\'s available, complete some quests, and begin your adventure.'
                }
            );

        embeds.push(welcomeEmbed, questingEmbed, bossEmbed, progressionEmbed);

        await interaction.reply({ embeds: embeds });
    }
};
