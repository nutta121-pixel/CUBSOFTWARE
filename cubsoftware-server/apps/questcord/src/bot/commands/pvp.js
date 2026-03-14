const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { UserModel } = require('../../database/models');
const { db } = require('../../database/schema');
const config = require('../../../config.json');
const GuildService = require('../../services/gameEngine/GuildService');

// Track active PVP challenges and arena battles
const activeChallenges = new Map(); // challengerId_opponentId -> { challenger, opponent, timestamp }
const arenaeBattles = new Map(); // battleId -> { challenger, opponent, challengerHealth, opponentHealth, turn, ... }

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pvp')
        .setDescription('Player vs Player combat system')
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Enable or disable PVP for yourself')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('challenge')
                .setDescription('Challenge another player to PVP')
                .addUserOption(option =>
                    option.setName('opponent')
                        .setDescription('The player to challenge')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('View your PVP statistics')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('View another user\'s stats')
                        .setRequired(false)
                )
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'toggle':
                await handleToggle(interaction);
                break;
            case 'challenge':
                await handleChallenge(interaction);
                break;
            case 'stats':
                await handleStats(interaction);
                break;
        }
    }
};

async function handleToggle(interaction) {
    let user = UserModel.findByDiscordId(interaction.user.id);

    if (!user) {
        UserModel.create(interaction.user.id, interaction.user.username);
        user = UserModel.findByDiscordId(interaction.user.id);
    }

    const newStatus = user.pvp_enabled ? 0 : 1;
    db.prepare('UPDATE users SET pvp_enabled = ? WHERE discord_id = ?').run(newStatus, interaction.user.id);

    const embed = new EmbedBuilder()
        .setColor(newStatus ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(newStatus ? '⚔️ PVP Enabled' : '🛡️ PVP Disabled')
        .setDescription(newStatus
            ? 'You can now receive PVP challenges from other players!'
            : 'You will no longer receive PVP challenges.')
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleChallenge(interaction) {
    const opponent = interaction.options.getUser('opponent');

    // Validation checks
    if (opponent.id === interaction.user.id) {
        return interaction.reply({
            content: '❌ You cannot challenge yourself to PVP!',
            ephemeral: true
        });
    }

    if (opponent.bot) {
        return interaction.reply({
            content: '❌ You cannot challenge bots to PVP!',
            ephemeral: true
        });
    }

    let challenger = UserModel.findByDiscordId(interaction.user.id);
    let opponentUser = UserModel.findByDiscordId(opponent.id);

    if (!challenger) {
        UserModel.create(interaction.user.id, interaction.user.username);
        challenger = UserModel.findByDiscordId(interaction.user.id);
    }

    if (!opponentUser) {
        return interaction.reply({
            content: '❌ This user has not started their quest journey yet!',
            ephemeral: true
        });
    }

    // Check if challenger has PVP enabled
    if (!challenger.pvp_enabled) {
        return interaction.reply({
            content: '❌ You need to enable PVP first! Use `/pvp toggle` to enable it.',
            ephemeral: true
        });
    }

    // Check if opponent has PVP enabled
    if (!opponentUser.pvp_enabled) {
        return interaction.reply({
            content: `❌ ${opponent.username} has PVP disabled.`,
            ephemeral: true
        });
    }

    // Check if either is traveling
    const now = Math.floor(Date.now() / 1000);
    if (challenger.traveling && challenger.travel_arrives_at > now) {
        return interaction.reply({
            content: '❌ You cannot challenge others to PVP while traveling!',
            ephemeral: true
        });
    }

    if (opponentUser.traveling && opponentUser.travel_arrives_at > now) {
        return interaction.reply({
            content: `❌ ${opponent.username} is currently traveling and cannot accept challenges!`,
            ephemeral: true
        });
    }

    // Check if either is already in a battle
    for (const [battleId, battle] of arenaeBattles.entries()) {
        if (battle.challenger.id === interaction.user.id || battle.opponent.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ You are already in an arena battle!',
                ephemeral: true
            });
        }
        if (battle.challenger.id === opponent.id || battle.opponent.id === opponent.id) {
            return interaction.reply({
                content: `❌ ${opponent.username} is already in an arena battle!`,
                ephemeral: true
            });
        }
    }

    // Check if challenge already exists
    const challengeKey = `${interaction.user.id}_${opponent.id}`;
    if (activeChallenges.has(challengeKey)) {
        return interaction.reply({
            content: `❌ You already have a pending challenge to ${opponent.username}!`,
            ephemeral: true
        });
    }

    // Create challenge
    activeChallenges.set(challengeKey, {
        challenger: interaction.user,
        opponent: opponent,
        timestamp: Date.now()
    });

    // Auto-delete challenge after 2 minutes
    setTimeout(() => {
        activeChallenges.delete(challengeKey);
    }, 120000);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.warning)
        .setTitle('⚔️ PVP Challenge!')
        .setDescription(`**${interaction.user.username}** has challenged **${opponent.username}** to a PVP battle in the arena!`)
        .addFields(
            {
                name: 'Challenger',
                value: `${interaction.user.username}\nLevel ${challenger.level}`,
                inline: true
            },
            {
                name: 'Opponent',
                value: `${opponent.username}\nLevel ${opponentUser.level}`,
                inline: true
            }
        )
        .setFooter({ text: 'Challenge expires in 2 minutes' })
        .setTimestamp();

    const acceptButton = new ButtonBuilder()
        .setCustomId(`pvp_accept_${challengeKey}`)
        .setLabel('Accept Challenge')
        .setStyle(ButtonStyle.Success)
        .setEmoji('⚔️');

    const declineButton = new ButtonBuilder()
        .setCustomId(`pvp_decline_${challengeKey}`)
        .setLabel('Decline')
        .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder().addComponents(acceptButton, declineButton);

    await interaction.reply({ content: `${opponent}`, embeds: [embed], components: [row] });
}

async function handleStats(interaction) {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    let user = UserModel.findByDiscordId(targetUser.id);

    if (!user) {
        return interaction.reply({
            content: '❌ This user has not started their quest journey yet!',
            ephemeral: true
        });
    }

    const winRate = user.pvp_wins + user.pvp_losses > 0
        ? ((user.pvp_wins / (user.pvp_wins + user.pvp_losses)) * 100).toFixed(1)
        : 0;

    // Get equipped items
    const equippedWeapon = db.prepare(`
        SELECT i.* FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND i.item_type = 'weapon' AND ui.equipped = 1
    `).get(user.id);

    const equippedArmor = db.prepare(`
        SELECT i.* FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND i.item_type = 'armor' AND ui.equipped = 1
    `).get(user.id);

    // Calculate base stats from equipment
    const baseAttack = user.attack + (equippedWeapon?.attack_power || 0) + (equippedArmor?.attack_power || 0);
    const baseDefense = user.defense + (equippedWeapon?.defense_power || 0) + (equippedArmor?.defense_power || 0);
    const baseCrit = (equippedWeapon?.crit_chance || 0) + (equippedArmor?.crit_chance || 0);
    const baseHealth = user.max_health;

    // Apply guild bonuses to combat stats
    const guildBonus = GuildService.getGuildBonus(targetUser.id);
    const guildBonusInfo = GuildService.getGuildBonusInfo(targetUser.id);

    const totalAttack = Math.floor(baseAttack * guildBonus);
    const totalDefense = Math.floor(baseDefense * guildBonus);
    const totalHealth = Math.floor(baseHealth * guildBonus);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`⚔️ ${targetUser.username}'s PVP Stats`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            {
                name: 'PVP Status',
                value: user.pvp_enabled ? '✅ Enabled' : '❌ Disabled',
                inline: true
            },
            {
                name: 'Record',
                value: `${user.pvp_wins}W - ${user.pvp_losses}L`,
                inline: true
            },
            {
                name: 'Win Rate',
                value: `${winRate}%`,
                inline: true
            },
            {
                name: 'Combat Stats',
                value: `⚔️ Attack: ${totalAttack}${guildBonusInfo.hasGuild ? ` (+${guildBonusInfo.bonus}%)` : ''}\n🛡️ Defense: ${totalDefense}${guildBonusInfo.hasGuild ? ` (+${guildBonusInfo.bonus}%)` : ''}\n✨ Crit: ${baseCrit}%\n❤️ Health: ${user.health}/${totalHealth}${guildBonusInfo.hasGuild ? ` (+${guildBonusInfo.bonus}%)` : ''}`,
                inline: true
            },
            {
                name: guildBonusInfo.hasGuild ? `🏰 Guild: ${guildBonusInfo.guildName}` : 'Guild',
                value: guildBonusInfo.hasGuild ? `Level ${guildBonusInfo.guildLevel} (+${guildBonusInfo.bonus}% to all stats)` : 'Not in a guild',
                inline: false
            },
            {
                name: 'Equipped Weapon',
                value: equippedWeapon
                    ? `${equippedWeapon.item_name}\n⚔️ +${equippedWeapon.attack_power} ATK | 🛡️ +${equippedWeapon.defense_power} DEF\n✨ +${equippedWeapon.crit_chance}% CRIT`
                    : 'None',
                inline: true
            },
            {
                name: 'Equipped Armor',
                value: equippedArmor
                    ? `${equippedArmor.item_name}\n⚔️ +${equippedArmor.attack_power} ATK | 🛡️ +${equippedArmor.defense_power} DEF\n✨ +${equippedArmor.crit_chance}% CRIT`
                    : 'None',
                inline: true
            }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports.activeChallenges = activeChallenges;
module.exports.arenaeBattles = arenaeBattles;
