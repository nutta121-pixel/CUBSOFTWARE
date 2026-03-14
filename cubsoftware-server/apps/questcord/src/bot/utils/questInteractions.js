const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { UserModel, QuestModel, UserQuestModel, ServerModel, GlobalStatsModel, LeaderboardModel } = require('../../database/models');
const { LevelSystem } = require('../../utils/levelSystem');
const { QuestScaling } = require('./questScaling');
const { getReportingInstance } = require('../../utils/reportingSystem');
const { broadcastLeaderboard, broadcastStats } = require('../../web/server');
const { generateChallenge, checkAnswer, createReactionButtons } = require('./questChallenges');
const config = require('../../../config.json');

// Store active quests in memory
const activeQuests = new Map(); // userId_questId -> questData

async function handleQuestAccept(interaction) {
    if (!interaction.customId.startsWith('accept_quest_')) return;

    const questId = parseInt(interaction.customId.replace('accept_quest_', ''));
    const quest = QuestModel.findById(questId);

    if (!quest) {
        return interaction.reply({
            content: 'Quest not found.',
            ephemeral: true
        });
    }

    let user = UserModel.findByDiscordId(interaction.user.id);
    if (!user) {
        UserModel.create(interaction.user.id, interaction.user.username);
        user = UserModel.findByDiscordId(interaction.user.id);
    }

    const now = Math.floor(Date.now() / 1000);

    // Check if user is traveling
    if (user.traveling) {
        const timeLeft = user.travel_arrives_at - now;

        if (timeLeft > 0) {
            const minutes = Math.floor(timeLeft / 60);
            const seconds = timeLeft % 60;

            return interaction.reply({
                content: `🚢 You're currently traveling to **${user.travel_destination}**! You can't accept quests while on the road.\n\n⏱️ Arrival in: **${minutes}m ${seconds}s**`,
                ephemeral: true
            });
        } else {
            // Travel completed, clear the traveling status
            UserModel.completeTravel(interaction.user.id);
            user = UserModel.findByDiscordId(interaction.user.id);
        }
    }

    // Check quest cooldown
    const timeSinceLastQuest = now - (user.last_quest_time || 0);
    const cooldownRemaining = (config.quest.cooldownTime / 1000) - timeSinceLastQuest;

    if (cooldownRemaining > 0) {
        const minutes = Math.floor(cooldownRemaining / 60);
        const seconds = Math.floor(cooldownRemaining % 60);
        const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

        // Fun random cooldown messages
        const cooldownMessages = [
            `🐴 Your horse needs a break! Wait **${timeString}** before your next quest.`,
            `🗺️ Still travelling back from your previous quest. Arrive in **${timeString}**.`,
            `📋 The quest board is being updated. Check back in **${timeString}**.`,
            `😴 You need to rest and recover! Try again in **${timeString}**.`,
            `🎒 Your backpack is too heavy! Organize your gear for **${timeString}** more.`,
            `🍺 The innkeeper says you look tired. Rest for **${timeString}** before your next adventure.`,
            `💰 Still counting your loot from the last quest! Ready in **${timeString}**.`,
            `🌙 Taking a short rest at the tavern. Back in action in **${timeString}**.`,
            `⚔️ Sharpening your weapons and preparing. Ready in **${timeString}**.`,
            `🧭 Charting your next route. Departure in **${timeString}**.`,
            `🔥 Warming up by the campfire. Adventure continues in **${timeString}**.`,
            `📖 Reading up on your next destination. Ready in **${timeString}**.`
        ];

        const randomMessage = cooldownMessages[Math.floor(Math.random() * cooldownMessages.length)];

        return interaction.reply({
            content: randomMessage,
            ephemeral: true
        });
    }

    // Check if already completed
    const existingQuest = UserQuestModel.getUserQuests(user.id, interaction.guild.id).find(uq => uq.quest_id === quest.id);
    if (existingQuest && existingQuest.completed) {
        return interaction.reply({
            content: 'You have already completed this quest today.',
            ephemeral: true
        });
    }

    // Check if hit daily limit
    const completedCount = UserQuestModel.getCompletedCount(user.id, interaction.guild.id);
    if (completedCount >= config.quest.questsPerServer) {
        return interaction.reply({
            content: `You have completed all ${config.quest.questsPerServer} quests in this server today. Use \`/travel\` to visit another server.`,
            ephemeral: true
        });
    }

    // Assign quest if not already assigned
    if (!existingQuest) {
        UserQuestModel.assignQuest(user.id, quest.id);
    }

    // Start universal challenge quest
    await startChallengeQuest(interaction, quest, user);
}

// ===== COMBAT QUEST: Button mashing minigame =====
async function startCombatQuest(interaction, quest, user) {
    const key = `${user.id}_${quest.id}`;
    const clicks = 0;
    const maxClicks = QuestScaling.getCombatClicks(user.level, quest.difficulty);
    const timeLimit = QuestScaling.getCombatTimeLimit(user.level, quest.difficulty);

    activeQuests.set(key, { clicks, maxClicks, startTime: Date.now(), timeLimit });

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`⚔️ ${quest.quest_name}`)
        .setDescription(`${quest.description}\n\n**Click the button below to attack!**\nDefeat your enemy by dealing ${maxClicks} attacks!\n\nTime limit: ${timeLimit} seconds`)
        .addFields({
            name: 'Progress',
            value: `${clicks}/${maxClicks} attacks`
        });

    const button = new ButtonBuilder()
        .setCustomId(`combat_attack_${quest.id}`)
        .setLabel('⚔️ Attack!')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleCombatAttack(interaction) {
    if (!interaction.customId.startsWith('combat_attack_')) return;

    const questId = parseInt(interaction.customId.replace('combat_attack_', ''));
    const user = UserModel.findByDiscordId(interaction.user.id);
    const quest = QuestModel.findById(questId);
    const key = `${user.id}_${quest.id}`;

    const questData = activeQuests.get(key);
    if (!questData) {
        return interaction.reply({
            content: 'Quest session expired. Please start the quest again.',
            ephemeral: true
        });
    }

    // Check time limit
    const elapsed = (Date.now() - questData.startTime) / 1000;
    if (elapsed > questData.timeLimit) {
        activeQuests.delete(key);
        return interaction.update({
            content: '❌ Time\'s up! You failed to defeat the enemy in time. Try again later.',
            embeds: [],
            components: []
        });
    }

    questData.clicks++;

    if (questData.clicks >= questData.maxClicks) {
        // Quest completed!
        activeQuests.delete(key);
        await completeQuest(interaction, quest, user);
    } else {
        // Update progress
        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(`⚔️ ${quest.quest_name}`)
            .setDescription(`${quest.description}\n\n**Keep attacking!**\nTime remaining: ${Math.ceil(questData.timeLimit - elapsed)}s`)
            .addFields({
                name: 'Progress',
                value: `${questData.clicks}/${questData.maxClicks} attacks 💥`
            });

        const button = new ButtonBuilder()
            .setCustomId(`combat_attack_${quest.id}`)
            .setLabel('⚔️ Attack!')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.update({ embeds: [embed], components: [row] });
    }
}

// ===== GATHERING QUEST: Timer-based =====
async function startGatheringQuest(interaction, quest, user) {
    const waitTime = QuestScaling.getGatheringTime(user.level, quest.difficulty);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`🌿 ${quest.quest_name}`)
        .setDescription(`${quest.description}\n\n**Gathering in progress...**\nWait for ${waitTime} seconds while you collect resources.`)
        .addFields({
            name: 'Status',
            value: `⏳ Gathering... (${waitTime}s remaining)`
        });

    await interaction.reply({ embeds: [embed], ephemeral: true });

    // Set timeout to complete quest
    setTimeout(async () => {
        try {
            await completeQuest(interaction, quest, user, true);
        } catch (error) {
            console.error('Error completing gathering quest:', error);
        }
    }, waitTime * 1000);
}

// ===== EXPLORATION QUEST: Multi-step journey =====
async function startExplorationQuest(interaction, quest, user) {
    const locations = ['Start', 'Forest', 'Mountains', 'Cave', 'Destination'];
    const currentStep = 0;

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`🗺️ ${quest.quest_name}`)
        .setDescription(`${quest.description}\n\n**Your Journey:**\nClick 'Continue' to progress through your expedition.`)
        .addFields({
            name: 'Current Location',
            value: `📍 ${locations[currentStep]}`,
            inline: true
        }, {
            name: 'Progress',
            value: `${currentStep + 1}/${locations.length}`,
            inline: true
        });

    const button = new ButtonBuilder()
        .setCustomId(`explore_continue_${quest.id}_${currentStep}`)
        .setLabel('➡️ Continue Journey')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

async function handleExplorationContinue(interaction) {
    if (!interaction.customId.startsWith('explore_continue_')) return;

    const parts = interaction.customId.split('_');
    const questId = parseInt(parts[2]);
    const currentStep = parseInt(parts[3]);
    const quest = QuestModel.findById(questId);
    const user = UserModel.findByDiscordId(interaction.user.id);

    const locations = ['Start', 'Forest', 'Mountains', 'Cave', 'Destination'];
    const nextStep = currentStep + 1;

    if (nextStep >= locations.length) {
        // Quest completed!
        await completeQuest(interaction, quest, user);
    } else {
        // Update progress
        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(`🗺️ ${quest.quest_name}`)
            .setDescription(`${quest.description}\n\n**Your Journey:**\nYou've reached ${locations[nextStep]}!`)
            .addFields({
                name: 'Current Location',
                value: `📍 ${locations[nextStep]}`,
                inline: true
            }, {
                name: 'Progress',
                value: `${nextStep + 1}/${locations.length}`,
                inline: true
            });

        const button = new ButtonBuilder()
            .setCustomId(`explore_continue_${quest.id}_${nextStep}`)
            .setLabel('➡️ Continue Journey')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(button);

        await interaction.update({ embeds: [embed], components: [row] });
    }
}

// ===== DELIVERY QUEST: Timer-based =====
async function startDeliveryQuest(interaction, quest, user) {
    const deliveryTime = QuestScaling.getDeliveryTime(user.level, quest.difficulty);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`📦 ${quest.quest_name}`)
        .setDescription(`${quest.description}\n\n**Delivery in progress...**\nTraveling to destination... ETA: ${deliveryTime} seconds`)
        .addFields({
            name: 'Status',
            value: `🚚 Traveling... (${deliveryTime}s remaining)`
        });

    await interaction.reply({ embeds: [embed], ephemeral: true });

    // Set timeout to complete quest
    setTimeout(async () => {
        try {
            await completeQuest(interaction, quest, user, true);
        } catch (error) {
            console.error('Error completing delivery quest:', error);
        }
    }, deliveryTime * 1000);
}

// ===== SOCIAL QUEST: Instant completion =====
async function startSocialQuest(interaction, quest, user) {
    // Social quests complete instantly
    await completeQuest(interaction, quest, user);
}

// ===== GENERIC QUEST: Fallback =====
async function startGenericQuest(interaction, quest, user) {
    await completeQuest(interaction, quest, user);
}

// ===== QUEST COMPLETION =====
async function completeQuest(interaction, quest, user, isFollowUp = false) {
    // Scale rewards based on player level
    const scaledCurrency = QuestScaling.scaleQuestRewards(quest.reward_currency, user.level, quest.difficulty);
    const scaledGems = QuestScaling.scaleQuestRewards(quest.reward_gems, user.level, quest.difficulty);

    // Mark quest as completed
    UserQuestModel.completeQuest(user.id, quest.id);
    UserModel.updateCurrency(user.discord_id, scaledCurrency);
    UserModel.updateGems(user.discord_id, scaledGems);
    UserModel.incrementQuestCount(user.discord_id);
    UserModel.updateLastQuestTime(user.discord_id);
    ServerModel.incrementQuestCount(interaction.guild.id);
    GlobalStatsModel.incrementQuestCount();

    // Update leaderboard
    const now = new Date();
    LeaderboardModel.updateScore(user.id, scaledCurrency + (scaledGems * 10), now.getMonth() + 1, now.getFullYear());

    // Broadcast real-time updates
    const topPlayers = LeaderboardModel.getTopPlayers(now.getMonth() + 1, now.getFullYear(), 10);
    broadcastLeaderboard(topPlayers);

    const stats = GlobalStatsModel.get();
    const totalCurrency = GlobalStatsModel.getTotalCurrencyInCirculation();
    const totalGems = GlobalStatsModel.getTotalGemsInCirculation();
    broadcastStats({
        totalServers: stats.total_servers,
        totalUsers: stats.total_users,
        totalQuestsCompleted: stats.total_quests_completed,
        totalCurrency: totalCurrency,
        totalGems: totalGems
    });

    // Add experience with level-based scaling
    const questExp = QuestScaling.getBonusXP(user.level, quest.difficulty);
    const levelResult = LevelSystem.addExperience(user.level, user.experience, user.total_experience, questExp);
    UserModel.updateLevel(user.discord_id, levelResult.newLevel, levelResult.newCurrentExp, levelResult.newTotalExp);

    // Track in reporting
    const reporting = getReportingInstance();
    if (reporting) {
        reporting.incrementQuests();
    }

    const completedCount = UserQuestModel.getCompletedCount(user.id, interaction.guild.id);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.success)
        .setTitle('✅ Quest Completed!')
        .setDescription(`**${quest.quest_name}**\n${quest.description}`)
        .addFields(
            {
                name: '💰 Rewards Earned',
                value: `+${scaledCurrency} Dakari\n+${scaledGems} gems\n+${questExp} XP`,
                inline: true
            },
            {
                name: '📊 Progress',
                value: `${completedCount}/${config.quest.questsPerServer} quests completed today`,
                inline: true
            }
        );

    if (levelResult.leveledUp) {
        const rewards = LevelSystem.getLevelRewards(levelResult.newLevel);
        UserModel.updateCurrency(user.discord_id, rewards.currency);
        UserModel.updateGems(user.discord_id, rewards.gems);

        embed.addFields({
            name: `🎉 Level Up! ${user.level} → ${levelResult.newLevel}`,
            value: `You reached level ${levelResult.newLevel}!\n+${rewards.currency} Dakari\n+${rewards.gems} gems`
        });
    } else {
        const progressBar = LevelSystem.getProgressBar(levelResult.newCurrentExp, levelResult.requiredExp);
        embed.addFields({
            name: `📈 Level ${levelResult.newLevel}`,
            value: `${progressBar} ${levelResult.newCurrentExp}/${levelResult.requiredExp} XP`
        });
    }

    embed.setFooter({ text: 'Use /quests to accept more quests!' })
        .setTimestamp();

    if (isFollowUp) {
        // For timer-based quests, send a follow-up message
        try {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error sending quest completion follow-up:', error);
        }
    } else {
        // For interactive quests, update the original message
        await interaction.update({ embeds: [embed], components: [] });
    }
}

// ===== UNIVERSAL CHALLENGE QUEST SYSTEM =====
async function startChallengeQuest(interaction, quest, user) {
    const challenge = generateChallenge(quest.difficulty);
    const key = `${user.id}_${quest.id}`;

    activeQuests.set(key, {
        challenge,
        questId: quest.id,
        userId: user.id,
        startTime: Date.now()
    });

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(challenge.title)
        .setDescription(challenge.description);

    if (challenge.type === 'reaction') {
        // Reaction test: Show waiting button, then turn green
        const row = createReactionButtons(false);

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });

        // Wait for the random delay, then make button green
        setTimeout(async () => {
            const greenRow = createReactionButtons(true);
            embed.setDescription('Click the button **NOW**! ⚡');

            try {
                await interaction.editReply({ embeds: [embed], components: [greenRow] });

                // Set timeout for failure
                setTimeout(async () => {
                    if (activeQuests.has(key)) {
                        activeQuests.delete(key);
                        await failQuest(interaction, quest, user, true);
                    }
                }, challenge.timeLimit * 1000);
            } catch (error) {
                console.error('Error updating reaction test:', error);
            }
        }, challenge.delay);

    } else if (challenge.type === 'memory') {
        // Memory game: Show sequence, then ask user to type it
        await interaction.reply({ embeds: [embed], ephemeral: true });

        // Wait 5 seconds for memorization
        setTimeout(async () => {
            embed.setDescription(`Type the emoji sequence you saw!\n\nYou have ${challenge.timeLimit} seconds to respond.`);
            try {
                await interaction.editReply({ embeds: [embed], components: [] });

                // Set up message collector
                const filter = m => m.author.id === interaction.user.id;
                const collector = interaction.channel.createMessageCollector({ filter, time: challenge.timeLimit * 1000, max: 1 });

                collector.on('collect', async (message) => {
                    const questData = activeQuests.get(key);
                    if (!questData) return;

                    const isCorrect = checkAnswer(challenge, message.content);
                    activeQuests.delete(key);

                    // Delete user's answer message
                    try {
                        await message.delete();
                    } catch (e) {}

                    if (isCorrect) {
                        await completeQuest(interaction, quest, user, true);
                    } else {
                        await failQuest(interaction, quest, user, true);
                    }
                });

                collector.on('end', async (collected) => {
                    if (collected.size === 0 && activeQuests.has(key)) {
                        activeQuests.delete(key);
                        await failQuest(interaction, quest, user, true);
                    }
                });
            } catch (error) {
                console.error('Error in memory game:', error);
            }
        }, 5000);

    } else {
        // Word scramble, math, or trivia: User types answer
        await interaction.reply({ embeds: [embed], ephemeral: true });

        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, time: challenge.timeLimit * 1000, max: 1 });

        collector.on('collect', async (message) => {
            const questData = activeQuests.get(key);
            if (!questData) return;

            const isCorrect = checkAnswer(challenge, message.content);
            activeQuests.delete(key);

            // Delete user's answer message
            try {
                await message.delete();
            } catch (e) {}

            if (isCorrect) {
                await completeQuest(interaction, quest, user, true);
            } else {
                await failQuest(interaction, quest, user, true);
            }
        });

        collector.on('end', async (collected) => {
            if (collected.size === 0 && activeQuests.has(key)) {
                activeQuests.delete(key);
                await failQuest(interaction, quest, user, true);
            }
        });
    }
}

// Handle reaction button click
async function handleReactionClick(interaction) {
    if (interaction.customId !== 'reaction_button') return;

    // Find the active quest for this user
    let questKey = null;
    let questData = null;

    for (const [key, data] of activeQuests.entries()) {
        if (key.startsWith(`${data.userId}_`) && data.userId === interaction.user.id) {
            questKey = key;
            questData = data;
            break;
        }
    }

    if (!questData || !questKey) {
        return interaction.reply({ content: 'No active reaction challenge found.', ephemeral: true });
    }

    // Verify it's a reaction challenge
    if (questData.challenge.type !== 'reaction') {
        return interaction.reply({ content: 'This is not a reaction challenge.', ephemeral: true });
    }

    const quest = QuestModel.findById(questData.questId);
    const user = UserModel.findById(questData.userId);

    if (!quest || !user) {
        return interaction.reply({ content: 'Quest or user not found.', ephemeral: true });
    }

    activeQuests.delete(questKey);
    await completeQuest(interaction, quest, user, false);
}

// Fail a quest
async function failQuest(interaction, quest, user, isFollowUp) {
    const { db } = require('../../database/schema');

    // Mark quest as failed
    db.prepare(`
        UPDATE user_quests
        SET failed = 1
        WHERE user_id = ? AND quest_id = ?
    `).run(user.id, quest.id);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.error)
        .setTitle('❌ Quest Failed!')
        .setDescription(`**${quest.quest_name}**\n\nYou failed the challenge. This quest is now marked as failed and cannot be retried today.\n\nUse \`/quests\` to see available quests.`)
        .setTimestamp();

    if (isFollowUp) {
        try {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } catch (error) {
            console.error('Error sending quest failure follow-up:', error);
        }
    } else {
        await interaction.update({ embeds: [embed], components: [] });
    }
}

module.exports = {
    handleQuestAccept,
    handleCombatAttack,
    handleExplorationContinue,
    handleReactionClick
};
