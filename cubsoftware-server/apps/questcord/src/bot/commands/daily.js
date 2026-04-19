const { SlashCommandBuilder, EmbedBuilder , MessageFlags } = require('discord.js');
const LoginService = require('../../services/gameEngine/LoginService');
const { UserModel } = require('../../database/models');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim your daily login reward')
        .addSubcommand(subcommand =>
            subcommand
                .setName('claim')
                .setDescription('Claim your daily reward')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rewards')
                .setDescription('View all daily reward tiers')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View your login statistics')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        // Get or create user
        let user = UserModel.findByDiscordId(interaction.user.id);
        if (!user) {
            UserModel.create(interaction.user.id, interaction.user.username);
            user = UserModel.findByDiscordId(interaction.user.id);
        }

        switch (subcommand) {
            case 'claim':
                await handleClaim(interaction, user);
                break;
            case 'rewards':
                await handleRewards(interaction);
                break;
            case 'stats':
                await handleStats(interaction, user);
                break;
        }
    }
};

/**
 * Handle daily reward claim
 */
async function handleClaim(interaction, user) {
    await interaction.deferReply();

    const result = await LoginService.claimDailyReward(user.id, 'discord');

    if (!result.success) {
        return interaction.editReply({
            content: `❌ ${result.error}`,
            flags: MessageFlags.Ephemeral
        });
    }

    if (!result.data) {
        // Already claimed today
        const checkResult = await LoginService.checkDailyLogin(user.id, 'discord');
        const data = checkResult.data;

        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⏰ Daily Reward Already Claimed')
            .setDescription(`You've already claimed your daily reward today!`)
            .addFields(
                { name: '📅 Current Streak', value: `${data.currentStreak} days`, inline: true },
                { name: '🏆 Longest Streak', value: `${data.longestStreak} days`, inline: true },
                { name: '📊 Total Logins', value: `${data.totalLogins}`, inline: true },
                { name: '⏰ Next Reward', value: `Available in ~${data.hoursUntilNext} hours`, inline: false }
            );

        if (data.nextReward) {
            let nextRewardText = '';
            if (data.nextReward.currency) nextRewardText += `💰 ${data.nextReward.currency} Dakari\n`;
            if (data.nextReward.gems) nextRewardText += `💎 ${data.nextReward.gems} Gems\n`;
            embed.addFields({ name: '🎁 Tomorrow\'s Reward', value: nextRewardText || 'TBD', inline: false });
        }

        return interaction.editReply({ embeds: [embed] });
    }

    // Successfully claimed
    const { rewardDay, reward, streak, user: updatedUser } = result.data;

    let rewardText = '';
    if (reward.currency) rewardText += `💰 **${reward.currency} Dakari**\n`;
    if (reward.gems) rewardText += `💎 **${reward.gems} Gems**\n`;
    if (reward.item_id) rewardText += `🎁 **Item Reward** (Coming Soon)\n`;

    const embed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle(`✅ Day ${rewardDay} Reward Claimed!`)
        .setDescription(reward.description || `Day ${rewardDay} login reward`)
        .addFields(
            { name: '🎁 Rewards Received', value: rewardText || 'No rewards', inline: false },
            { name: '📅 Current Streak', value: `${streak.current} days`, inline: true },
            { name: '🏆 Longest Streak', value: `${streak.longest} days`, inline: true },
            { name: '📊 Total Logins', value: `${streak.total}`, inline: true },
            { name: '💰 New Balance', value: `${updatedUser.currency.toLocaleString()} Dakari`, inline: true },
            { name: '💎 Gems', value: `${updatedUser.gems}`, inline: true }
        )
        .setFooter({ text: 'Come back tomorrow for your next reward!' })
        .setTimestamp();

    // Special message for 7-day streak
    if (rewardDay === 7) {
        embed.setDescription(`${reward.description}\n\n🎉 **Week Complete!** Your streak continues tomorrow with Day 1 rewards!`);
    }

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle viewing all rewards
 */
async function handleRewards(interaction) {
    await interaction.deferReply();

    const result = await LoginService.getAllRewards('discord');

    if (!result.success) {
        return interaction.editReply({
            content: `❌ ${result.error}`,
            flags: MessageFlags.Ephemeral
        });
    }

    const rewards = result.data;

    const embed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle('📅 Daily Login Rewards')
        .setDescription('Login every day to claim these rewards and build your streak!\n\n**7-Day Reward Cycle:**\n')
        .setTimestamp();

    rewards.forEach(reward => {
        let rewardText = '';
        if (reward.currency) rewardText += `💰 ${reward.currency} Dakari\n`;
        if (reward.gems) rewardText += `💎 ${reward.gems} Gems\n`;
        if (reward.item_id) rewardText += `🎁 Special Item\n`;

        embed.addFields({
            name: `Day ${reward.day}`,
            value: `${rewardText}${reward.description ? `*${reward.description}*` : ''}`,
            inline: true
        });
    });

    embed.addFields({
        name: '\n📌 How It Works',
        value: 'Login daily to claim rewards! Your streak resets if you miss a day.\nAfter Day 7, the cycle repeats starting from Day 1.',
        inline: false
    });

    await interaction.editReply({ embeds: [embed] });
}

/**
 * Handle viewing login stats
 */
async function handleStats(interaction, user) {
    await interaction.deferReply();

    const result = await LoginService.getUserLoginStats(user.id, 'discord');

    if (!result.success) {
        return interaction.editReply({
            content: `❌ ${result.error}`,
            flags: MessageFlags.Ephemeral
        });
    }

    const stats = result.data;

    const embed = new EmbedBuilder()
        .setColor('#7C3AED')
        .setTitle('📊 Your Login Statistics')
        .setDescription(`Here's your login history, ${interaction.user.username}!`)
        .addFields(
            { name: '📅 Current Streak', value: `${stats.currentStreak} days`, inline: true },
            { name: '🏆 Longest Streak', value: `${stats.longestStreak} days`, inline: true },
            { name: '📊 Total Logins', value: `${stats.totalLogins}`, inline: true }
        )
        .setTimestamp();

    if (stats.lastLogin) {
        const lastLoginDate = new Date(stats.lastLogin);
        embed.addFields({
            name: '🕐 Last Login',
            value: `<t:${Math.floor(lastLoginDate.getTime() / 1000)}:R>`,
            inline: false
        });
    }

    if (stats.lastRewardClaimed > 0) {
        embed.addFields({
            name: '🎁 Last Reward Claimed',
            value: `Day ${stats.lastRewardClaimed}`,
            inline: true
        });
    }

    await interaction.editReply({ embeds: [embed] });
}
