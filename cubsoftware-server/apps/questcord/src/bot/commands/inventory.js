const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle , MessageFlags } = require('discord.js');
const { UserModel } = require('../../database/models');
const { db } = require('../../database/schema');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('View and manage your items'),

    async execute(interaction) {
        let user = UserModel.findByDiscordId(interaction.user.id);

        if (!user) {
            UserModel.create(interaction.user.id, interaction.user.username);
            user = UserModel.findByDiscordId(interaction.user.id);
        }

        // Get all user items with item details
        const userItems = db.prepare(`
            SELECT ui.*, i.*
            FROM user_items ui
            JOIN items i ON ui.item_id = i.id
            WHERE ui.user_id = ?
            ORDER BY
                CASE i.rarity
                    WHEN 'mythic' THEN 1
                    WHEN 'legendary' THEN 2
                    WHEN 'epic' THEN 3
                    WHEN 'rare' THEN 4
                    WHEN 'uncommon' THEN 5
                    WHEN 'common' THEN 6
                END,
                i.item_type,
                i.item_name
        `).all(user.id);

        if (userItems.length === 0) {
            return interaction.reply({
                content: '❌ Your inventory is empty! Use `/shop` to purchase items or complete quests to find them.',
                flags: MessageFlags.Ephemeral
            });
        }

        const rarityEmoji = {
            'common': '⚪',
            'uncommon': '🟢',
            'rare': '🔵',
            'epic': '🟣',
            'legendary': '🟠',
            'mythic': '🔴'
        };

        // Separate weapons and armor
        const weapons = userItems.filter(item => item.item_type === 'weapon');
        const armor = userItems.filter(item => item.item_type === 'armor');

        // Get equipped items
        const equippedWeapon = weapons.find(item => item.equipped === 1);
        const equippedArmor = armor.find(item => item.equipped === 1);

        // Calculate total stats
        const totalAttack = user.attack + (equippedWeapon?.attack_power || 0);
        const totalDefense = user.defense + (equippedWeapon?.defense_power || 0) + (equippedArmor?.defense_power || 0);
        const totalCrit = equippedWeapon?.crit_chance || 0;

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle(`🎒 ${interaction.user.username}'s Inventory`)
            .setDescription(`You have **${userItems.length}** item${userItems.length !== 1 ? 's' : ''}`)
            .addFields({
                name: 'Current Stats',
                value: `⚔️ Attack: ${totalAttack} (${user.attack} base${equippedWeapon ? ` + ${equippedWeapon.attack_power}` : ''})\n🛡️ Defense: ${totalDefense} (${user.defense} base${equippedWeapon?.defense_power || equippedArmor?.defense_power ? ` + ${(equippedWeapon?.defense_power || 0) + (equippedArmor?.defense_power || 0)}` : ''})\n✨ Crit: ${totalCrit}%`,
                inline: false
            });

        // Weapons section
        if (weapons.length > 0) {
            const weaponList = weapons.map(item => {
                const equipped = item.equipped ? '**[EQUIPPED]** ' : '';
                const stats = `⚔️${item.attack_power} 🛡️${item.defense_power} ✨${item.crit_chance}%`;
                return `${equipped}${rarityEmoji[item.rarity]} **${item.item_name}** - ${stats}`;
            }).join('\n');

            embed.addFields({
                name: `🗡️ Weapons (${weapons.length})`,
                value: weaponList.length > 1024 ? weaponList.substring(0, 1020) + '...' : weaponList,
                inline: false
            });
        }

        // Armor section
        if (armor.length > 0) {
            const armorList = armor.map(item => {
                const equipped = item.equipped ? '**[EQUIPPED]** ' : '';
                const stats = `⚔️${item.attack_power} 🛡️${item.defense_power} ✨${item.crit_chance}%`;
                return `${equipped}${rarityEmoji[item.rarity]} **${item.item_name}** - ${stats}`;
            }).join('\n');

            embed.addFields({
                name: `🛡️ Armor (${armor.length})`,
                value: armorList.length > 1024 ? armorList.substring(0, 1020) + '...' : armorList,
                inline: false
            });
        }

        embed.setFooter({ text: 'Items are automatically equipped when you purchase better equipment' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
};
