const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel } = require('../../database/models');
const { db } = require('../../database/schema');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('buy')
        .setDescription('Purchase an item from the shop')
        .addStringOption(option =>
            option.setName('item-name')
                .setDescription('The name of the item to purchase')
                .setRequired(true)
                .setAutocomplete(true)
        ),

    async execute(interaction) {
        const itemName = interaction.options.getString('item-name');
        let user = UserModel.findByDiscordId(interaction.user.id);

        if (!user) {
            return interaction.reply({
                content: '❌ You need to complete a quest first before shopping!',
                ephemeral: true
            });
        }

        // Find the item (case insensitive)
        const item = db.prepare('SELECT * FROM items WHERE LOWER(item_name) = LOWER(?)').get(itemName);

        if (!item) {
            return interaction.reply({
                content: `❌ Item "${itemName}" not found. Use \`/shop\` to browse available items.`,
                ephemeral: true
            });
        }

        // Check if item is for sale (mythic items are not for sale)
        if (item.rarity === 'mythic' || (item.currency_cost === 0 && item.gem_cost === 0)) {
            return interaction.reply({
                content: `❌ **${item.item_name}** is not available for purchase.`,
                ephemeral: true
            });
        }

        // Check if user can afford it
        if (user.currency < item.currency_cost) {
            const needed = item.currency_cost - user.currency;
            return interaction.reply({
                content: `❌ You don't have enough Dakari to buy **${item.item_name}**.\nYou need ${needed.toLocaleString()} more Dakari.`,
                ephemeral: true
            });
        }

        if (user.gems < item.gem_cost) {
            const needed = item.gem_cost - user.gems;
            return interaction.reply({
                content: `❌ You don't have enough gems to buy **${item.item_name}**.\nYou need ${needed} more gems.`,
                ephemeral: true
            });
        }

        // Check if user already owns this item
        const existingItem = db.prepare('SELECT * FROM user_items WHERE user_id = ? AND item_id = ?').get(user.id, item.id);

        if (existingItem) {
            return interaction.reply({
                content: `❌ You already own **${item.item_name}**!`,
                ephemeral: true
            });
        }

        // Deduct currency and gems
        UserModel.updateCurrency(interaction.user.id, -item.currency_cost);
        UserModel.updateGems(interaction.user.id, -item.gem_cost);

        // Give item to user
        db.prepare('INSERT INTO user_items (user_id, item_id, quantity, equipped) VALUES (?, ?, 1, 0)').run(user.id, item.id);

        const rarityEmoji = {
            'common': '⚪',
            'uncommon': '🟢',
            'rare': '🔵',
            'epic': '🟣',
            'legendary': '🟠',
            'mythic': '🔴'
        }[item.rarity] || '⚪';

        const updatedUser = UserModel.findByDiscordId(interaction.user.id);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('🎉 Purchase Successful!')
            .setDescription(`You purchased **${item.item_name}**!`)
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
            .setFooter({ text: 'Use /inventory to view and equip your items' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Get shop items (exclude mythic and items with 0 cost)
        const allItems = db.prepare('SELECT * FROM items WHERE rarity != ? AND (currency_cost > 0 OR gem_cost > 0) ORDER BY currency_cost ASC')
            .all('mythic');

        const filtered = allItems.filter(item =>
            item.item_name.toLowerCase().includes(focusedValue)
        );

        const rarityEmoji = {
            'common': '⚪',
            'uncommon': '🟢',
            'rare': '🔵',
            'epic': '🟣',
            'legendary': '🟠'
        };

        const choices = filtered.slice(0, 25).map(item => {
            const price = item.gem_cost > 0
                ? `${item.currency_cost} Dakari + ${item.gem_cost} Gems`
                : `${item.currency_cost} Dakari`;

            return {
                name: `${rarityEmoji[item.rarity] || '⚪'} ${item.item_name} - ${price}`,
                value: item.item_name
            };
        });

        await interaction.respond(choices);
    }
};
