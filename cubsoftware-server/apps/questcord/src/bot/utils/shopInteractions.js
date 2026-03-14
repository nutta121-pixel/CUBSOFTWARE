const { EmbedBuilder } = require('discord.js');
const { UserModel } = require('../../database/models');
const { db } = require('../../database/schema');
const config = require('../../../config.json');

async function handleShopPurchase(interaction) {
    if (!interaction.customId.startsWith('confirm_buy_')) return;

    const itemId = parseInt(interaction.customId.replace('confirm_buy_', ''));
    let user = UserModel.findByDiscordId(interaction.user.id);

    if (!user) {
        return interaction.reply({
            content: '❌ User not found. Please try again.',
            ephemeral: true
        });
    }

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);

    if (!item) {
        return interaction.update({
            content: '❌ Item not found!',
            embeds: [],
            components: []
        });
    }

    // Check if user can afford it
    if (user.currency < item.currency_cost) {
        const needed = item.currency_cost - user.currency;
        return interaction.update({
            content: `❌ You don't have enough Dakari to buy **${item.item_name}**.\nYou need ${needed.toLocaleString()} more Dakari.`,
            embeds: [],
            components: []
        });
    }

    if (user.gems < item.gem_cost) {
        const needed = item.gem_cost - user.gems;
        return interaction.update({
            content: `❌ You don't have enough gems to buy **${item.item_name}**.\nYou need ${needed} more gems.`,
            embeds: [],
            components: []
        });
    }

    // Check if user already owns this item
    const existingItem = db.prepare('SELECT * FROM user_items WHERE user_id = ? AND item_id = ?').get(user.id, item.id);

    if (existingItem) {
        return interaction.update({
            content: `❌ You already own **${item.item_name}**!`,
            embeds: [],
            components: []
        });
    }

    // Deduct currency and gems
    UserModel.updateCurrency(interaction.user.id, -item.currency_cost);
    UserModel.updateGems(interaction.user.id, -item.gem_cost);

    // Check if should auto-equip (if no item equipped or this item is better)
    let shouldEquip = false;
    let replacedItem = null;

    const equippedItem = db.prepare(`
        SELECT ui.*, i.*
        FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND i.item_type = ? AND ui.equipped = 1
    `).get(user.id, item.item_type);

    if (!equippedItem) {
        // No item equipped in this slot, auto-equip
        shouldEquip = true;
    } else {
        // Compare stats - new item is better if it has higher total power
        const currentPower = equippedItem.attack_power + equippedItem.defense_power + (equippedItem.crit_chance / 2);
        const newPower = item.attack_power + item.defense_power + (item.crit_chance / 2);

        if (newPower > currentPower) {
            // Unequip old item
            db.prepare('UPDATE user_items SET equipped = 0 WHERE user_id = ? AND item_id = ?').run(user.id, equippedItem.item_id);
            shouldEquip = true;
            replacedItem = equippedItem;
        }
    }

    // Give item to user
    db.prepare('INSERT INTO user_items (user_id, item_id, quantity, equipped) VALUES (?, ?, 1, ?)').run(user.id, item.id, shouldEquip ? 1 : 0);

    const rarityEmoji = {
        'common': '⚪',
        'uncommon': '🟢',
        'rare': '🔵',
        'epic': '🟣',
        'legendary': '🟠',
        'mythic': '🔴'
    }[item.rarity] || '⚪';

    const updatedUser = UserModel.findByDiscordId(interaction.user.id);

    let description = `You purchased **${item.item_name}**!`;
    if (shouldEquip) {
        if (replacedItem) {
            description += `\n\n⚡ **Auto-equipped!** Replaced your **${replacedItem.item_name}**.`;
        } else {
            description += `\n\n⚡ **Auto-equipped!** Now active in your loadout.`;
        }
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.success)
        .setTitle('🎉 Purchase Successful!')
        .setDescription(description)
        .addFields(
            {
                name: 'Item Details',
                value: `${rarityEmoji} **${item.rarity.toUpperCase()}** ${item.item_type}\n${item.description}`,
                inline: false
            },
            {
                name: 'Stats',
                value: `⚔️ Attack: ${item.attack_power}\n🛡️ Defense: ${item.defense_power}\n✨ Crit: ${item.crit_chance}%`,
                inline: true
            },
            {
                name: 'Price Paid',
                value: `💰 ${item.currency_cost} Dakari${item.gem_cost > 0 ? `\n💎 ${item.gem_cost} Gems` : ''}`,
                inline: true
            },
            {
                name: 'New Balance',
                value: `💰 ${updatedUser.currency.toLocaleString()} Dakari\n💎 ${updatedUser.gems.toLocaleString()} Gems`,
                inline: true
            }
        )
        .setFooter({ text: shouldEquip ? 'Item equipped and ready for battle!' : 'Use /inventory to manage your items' })
        .setTimestamp();

    await interaction.update({ embeds: [embed], components: [] });
}

async function handleShopCancel(interaction) {
    if (interaction.customId !== 'cancel_buy') return;

    await interaction.update({
        content: 'Purchase cancelled.',
        embeds: [],
        components: []
    });
}

module.exports = {
    handleShopPurchase,
    handleShopCancel
};
