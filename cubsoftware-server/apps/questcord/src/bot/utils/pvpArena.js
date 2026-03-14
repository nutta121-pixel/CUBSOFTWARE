const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { UserModel, LeaderboardModel } = require('../../database/models');
const { LevelSystem } = require('../../utils/levelSystem');
const { db } = require('../../database/schema');
const config = require('../../../config.json');
const GuildService = require('../../services/gameEngine/GuildService');

async function handlePvpAccept(interaction, challengeKey, activeChallenges, arenaeBattles) {
    const challenge = activeChallenges.get(challengeKey);

    if (!challenge) {
        return interaction.update({
            content: '❌ This challenge has expired or been cancelled.',
            embeds: [],
            components: []
        });
    }

    // Only the opponent can accept
    if (interaction.user.id !== challenge.opponent.id) {
        return interaction.reply({
            content: '❌ Only the challenged player can accept this!',
            ephemeral: true
        });
    }

    // Remove challenge
    activeChallenges.delete(challengeKey);

    // Get both users from database
    let challenger = UserModel.findByDiscordId(challenge.challenger.id);
    let opponent = UserModel.findByDiscordId(challenge.opponent.id);

    // Get equipped items and calculate stats
    const challengerStats = await getPlayerStats(challenger);
    const opponentStats = await getPlayerStats(opponent);

    // Apply guild bonuses to max health
    const challengerGuildBonus = GuildService.getGuildBonus(challenge.challenger.id);
    const opponentGuildBonus = GuildService.getGuildBonus(challenge.opponent.id);
    const challengerMaxHealth = Math.floor(challenger.max_health * challengerGuildBonus);
    const opponentMaxHealth = Math.floor(opponent.max_health * opponentGuildBonus);

    // Create battle - Randomly decide who goes first for fairness
    const randomFirst = Math.random() < 0.5 ? 'challenger' : 'opponent';
    const battleId = `${challenge.challenger.id}_${challenge.opponent.id}_${Date.now()}`;
    arenaeBattles.set(battleId, {
        id: battleId,
        challenger: {
            id: challenge.challenger.id,
            username: challenge.challenger.username,
            dbId: challenger.id,
            maxHealth: challengerMaxHealth,
            currentHealth: challengerMaxHealth,
            attack: challengerStats.attack,
            defense: challengerStats.defense,
            crit: challengerStats.crit
        },
        opponent: {
            id: challenge.opponent.id,
            username: challenge.opponent.username,
            dbId: opponent.id,
            maxHealth: opponentMaxHealth,
            currentHealth: opponentMaxHealth,
            attack: opponentStats.attack,
            defense: opponentStats.defense,
            crit: opponentStats.crit
        },
        turn: randomFirst, // Randomly decide who goes first
        round: 1,
        log: [`**${randomFirst === 'challenger' ? challenge.challenger.username : challenge.opponent.username}** won the coin toss and goes first!`]
    });

    // Show arena start
    await showArenaState(interaction, battleId, arenaeBattles, true);
}

async function handlePvpDecline(interaction, challengeKey, activeChallenges) {
    const challenge = activeChallenges.get(challengeKey);

    if (!challenge) {
        return interaction.update({
            content: '❌ This challenge has expired or been cancelled.',
            embeds: [],
            components: []
        });
    }

    // Only the opponent can decline
    if (interaction.user.id !== challenge.opponent.id) {
        return interaction.reply({
            content: '❌ Only the challenged player can decline this!',
            ephemeral: true
        });
    }

    // Remove challenge
    activeChallenges.delete(challengeKey);

    await interaction.update({
        content: `${challenge.opponent.username} declined the PVP challenge.`,
        embeds: [],
        components: []
    });
}

async function handlePvpAttack(interaction, battleId, arenaeBattles) {
    const battle = arenaeBattles.get(battleId);

    if (!battle) {
        return interaction.update({
            content: '❌ This battle has ended or expired.',
            embeds: [],
            components: []
        });
    }

    // Check if it's the player's turn
    const currentTurn = battle.turn === 'challenger' ? battle.challenger : battle.opponent;
    if (interaction.user.id !== currentTurn.id) {
        return interaction.reply({
            content: '❌ It\'s not your turn!',
            ephemeral: true
        });
    }

    // Calculate damage with randomization for more balanced battles
    const attacker = currentTurn;
    const defender = battle.turn === 'challenger' ? battle.opponent : battle.challenger;

    // Check for crit
    const isCrit = Math.random() * 100 < attacker.crit;

    // Add randomization to base damage (±25% variance)
    const randomFactor = 0.75 + (Math.random() * 0.5); // Random between 0.75 and 1.25
    const baseDamage = Math.floor(attacker.attack * randomFactor);
    const damageReduction = Math.floor(defender.defense * 0.5); // Defense reduces damage by 50% of defense value
    let damage = Math.max(1, baseDamage - damageReduction);

    if (isCrit) {
        damage = Math.floor(damage * 2);
    }

    // Apply damage
    defender.currentHealth = Math.max(0, defender.currentHealth - damage);

    // Log the attack
    const logEntry = `**${attacker.username}** attacked **${defender.username}** for **${damage}** damage${isCrit ? ' ⚡ **CRITICAL HIT!**' : ''}`;
    battle.log.push(logEntry);

    // Check if battle is over
    if (defender.currentHealth <= 0) {
        await endBattle(interaction, battle, attacker, defender, arenaeBattles);
        return;
    }

    // Switch turns
    battle.turn = battle.turn === 'challenger' ? 'opponent' : 'challenger';
    battle.round++;

    // Show updated arena state
    await showArenaState(interaction, battleId, arenaeBattles, false);
}

async function showArenaState(interaction, battleId, arenaeBattles, isStart) {
    const battle = arenaeBattles.get(battleId);

    if (!battle) return;

    const currentTurn = battle.turn === 'challenger' ? battle.challenger : battle.opponent;

    const challengerHealthBar = createHealthBar(battle.challenger.currentHealth, battle.challenger.maxHealth);
    const opponentHealthBar = createHealthBar(battle.opponent.currentHealth, battle.opponent.maxHealth);

    const recentLog = battle.log.slice(-3).join('\n') || '*Battle begins!*';

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.warning)
        .setTitle('⚔️ ARENA BATTLE')
        .setDescription(`**Round ${battle.round}** - ${currentTurn.username}'s turn!`)
        .addFields(
            {
                name: `${battle.challenger.username} (Challenger)`,
                value: `${challengerHealthBar}\n❤️ ${battle.challenger.currentHealth}/${battle.challenger.maxHealth} HP\n⚔️ ${battle.challenger.attack} ATK | 🛡️ ${battle.challenger.defense} DEF | ✨ ${battle.challenger.crit}% CRIT`,
                inline: false
            },
            {
                name: `${battle.opponent.username} (Defender)`,
                value: `${opponentHealthBar}\n❤️ ${battle.opponent.currentHealth}/${battle.opponent.maxHealth} HP\n⚔️ ${battle.opponent.attack} ATK | 🛡️ ${battle.opponent.defense} DEF | ✨ ${battle.opponent.crit}% CRIT`,
                inline: false
            },
            {
                name: 'Battle Log',
                value: recentLog,
                inline: false
            }
        )
        .setFooter({ text: `${currentTurn.username}, click Attack to strike!` })
        .setTimestamp();

    const attackButton = new ButtonBuilder()
        .setCustomId(`pvp_battle_attack_${battleId}`)
        .setLabel('⚔️ Attack')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(attackButton);

    if (isStart) {
        await interaction.update({
            content: `${battle.challenger.username} vs ${battle.opponent.username} - **FIGHT!**\n<@${battle.challenger.id}> <@${battle.opponent.id}>`,
            embeds: [embed],
            components: [row]
        });
    } else {
        await interaction.update({
            embeds: [embed],
            components: [row]
        });
    }
}

async function endBattle(interaction, battle, winner, loser, arenaeBattles) {
    // Calculate rewards
    const baseReward = 50;
    const levelBonus = loser.level || 1;
    const currencyReward = Math.floor(baseReward + (levelBonus * 5));
    const gemReward = Math.max(1, Math.floor(levelBonus / 3));
    const expReward = 25 + (levelBonus * 2);

    // Update winner
    UserModel.updateCurrency(winner.id, currencyReward);
    UserModel.updateGems(winner.id, gemReward);
    db.prepare('UPDATE users SET pvp_wins = pvp_wins + 1, health = max_health WHERE discord_id = ?').run(winner.id);

    const winnerUser = UserModel.findByDiscordId(winner.id);
    const levelResult = LevelSystem.addExperience(winnerUser.level, winnerUser.experience, winnerUser.total_experience, expReward);
    UserModel.updateLevel(winner.id, levelResult.newLevel, levelResult.newCurrentExp, levelResult.newTotalExp);

    // Update loser
    db.prepare('UPDATE users SET pvp_losses = pvp_losses + 1, health = max_health WHERE discord_id = ?').run(loser.id);

    // Update leaderboard
    const now = new Date();
    LeaderboardModel.updateScore(winnerUser.id, currencyReward + (gemReward * 10), now.getMonth() + 1, now.getFullYear());

    // Remove battle
    arenaeBattles.delete(battle.id);

    const finalEmbed = new EmbedBuilder()
        .setColor(config.theme.colors.success)
        .setTitle('🏆 VICTORY!')
        .setDescription(`**${winner.username}** has defeated **${loser.username}** in the arena!`)
        .addFields(
            {
                name: 'Winner',
                value: `${winner.username}\n❤️ ${winner.currentHealth}/${winner.maxHealth} HP remaining`,
                inline: true
            },
            {
                name: 'Loser',
                value: `${loser.username}\n❤️ 0/${loser.maxHealth} HP`,
                inline: true
            },
            {
                name: 'Rewards',
                value: `💰 ${currencyReward} Dakari\n💎 ${gemReward} Gems\n✨ ${expReward} XP`,
                inline: true
            }
        )
        .setFooter({ text: 'Both players\' health has been restored to full' })
        .setTimestamp();

    if (levelResult.leveledUp) {
        finalEmbed.addFields({
            name: `🎉 Level Up!`,
            value: `${winner.username} reached level ${levelResult.newLevel}!`
        });
    }

    await interaction.update({
        embeds: [finalEmbed],
        components: []
    });
}

function createHealthBar(current, max) {
    const percentage = (current / max) * 100;
    const filledBars = Math.floor(percentage / 10);
    const emptyBars = 10 - filledBars;

    let bar = '';
    for (let i = 0; i < filledBars; i++) {
        bar += '🟩';
    }
    for (let i = 0; i < emptyBars; i++) {
        bar += '⬛';
    }

    return bar;
}

async function getPlayerStats(user) {
    // Get equipped weapon
    const weapon = db.prepare(`
        SELECT i.* FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND i.item_type = 'weapon' AND ui.equipped = 1
    `).get(user.id);

    // Get equipped armor
    const armor = db.prepare(`
        SELECT i.* FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND i.item_type = 'armor' AND ui.equipped = 1
    `).get(user.id);

    // Calculate base stats
    const baseAttack = user.attack + (weapon?.attack_power || 0);
    const baseDefense = user.defense + (weapon?.defense_power || 0) + (armor?.defense_power || 0);

    // Apply guild bonuses
    const guildBonus = GuildService.getGuildBonus(user.discord_id);

    return {
        attack: Math.floor(baseAttack * guildBonus),
        defense: Math.floor(baseDefense * guildBonus),
        crit: weapon?.crit_chance || 0
    };
}

module.exports = {
    handlePvpAccept,
    handlePvpDecline,
    handlePvpAttack
};
