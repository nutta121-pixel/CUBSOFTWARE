const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel } = require('../../database/models');
const { equipItem, unequipItem } = require('../../utils/equipmentHelper');
const { db } = require('../../database/schema');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('equip')
        .setDescription('Equip or unequip items from your inventory')
        .addSubcommand(subcommand =>
            subcommand
                .setName('weapon')
                .setDescription('Equip a weapon or armor')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('The item to equip')
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('unequip')
                .setDescription('Unequip a currently equipped item')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type of item to unequip')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Weapon', value: 'weapon' },
                            { name: 'Armor', value: 'armor' }
                        )
                )
        ),

    async execute(interaction) {
        let user = UserModel.findByDiscordId(interaction.user.id);

        if (!user) {
            UserModel.create(interaction.user.id, interaction.user.username);
            user = UserModel.findByDiscordId(interaction.user.id);
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'weapon') {
            const itemIdStr = interaction.options.getString('item');
            const itemId = parseInt(itemIdStr);

            const result = equipItem(user.id, itemId);

            if (!result.success) {
                return interaction.reply({
                    content: `❌ ${result.message}`,
                    ephemeral: true
                });
            }

            const rarityEmoji = {
                'common': '⚪',
                'uncommon': '🟢',
                'rare': '🔵',
                'epic': '🟣',
                'legendary': '🟠',
                'mythic': '🔴'
            }[result.item.rarity] || '⚪';

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.success)
                .setTitle('✅ Item Equipped!')
                .setDescription(`You equipped **${result.item.item_name}**`)
                .addFields(
                    {
                        name: 'Item Details',
                        value: `${rarityEmoji} **${result.item.rarity.toUpperCase()}** ${result.item.item_type}\n${result.item.description}`,
                        inline: false
                    },
                    {
                        name: 'Stats',
                        value: `⚔️ Attack: ${result.item.attack_power}\n🛡️ Defense: ${result.item.defense_power}\n✨ Crit: ${result.item.crit_chance}%`,
                        inline: true
                    }
                )
                .setFooter({ text: 'Use /inventory to view your equipped items' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } else if (subcommand === 'unequip') {
            const itemType = interaction.options.getString('type');

            // Find the equipped item of this type
            const equippedItem = db.prepare(`
                SELECT ui.*, i.*
                FROM user_items ui
                JOIN items i ON ui.item_id = i.id
                WHERE ui.user_id = ? AND i.item_type = ? AND ui.equipped = 1
            `).get(user.id, itemType);

            if (!equippedItem) {
                return interaction.reply({
                    content: `❌ You don't have a ${itemType} equipped.`,
                    ephemeral: true
                });
            }

            const result = unequipItem(user.id, equippedItem.item_id);

            if (!result.success) {
                return interaction.reply({
                    content: `❌ ${result.message}`,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.warning)
                .setTitle('Unequipped Item')
                .setDescription(`You unequipped **${result.item.item_name}**`)
                .setFooter({ text: 'Use /equip weapon to equip a different item' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    },

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);

        if (focusedOption.name === 'item') {
            const user = UserModel.findByDiscordId(interaction.user.id);

            if (!user) {
                return interaction.respond([]);
            }

            // Get user's unequipped weapons and armor
            const userItems = db.prepare(`
                SELECT ui.*, i.*
                FROM user_items ui
                JOIN items i ON ui.item_id = i.id
                WHERE ui.user_id = ? AND i.item_type IN ('weapon', 'armor')
                ORDER BY
                    CASE i.rarity
                        WHEN 'mythic' THEN 1
                        WHEN 'legendary' THEN 2
                        WHEN 'epic' THEN 3
                        WHEN 'rare' THEN 4
                        WHEN 'uncommon' THEN 5
                        WHEN 'common' THEN 6
                    END,
                    i.item_name
            `).all(user.id);

            const rarityEmoji = {
                'common': '⚪',
                'uncommon': '🟢',
                'rare': '🔵',
                'epic': '🟣',
                'legendary': '🟠',
                'mythic': '🔴'
            };

            const focusedValue = focusedOption.value.toLowerCase();
            const filtered = userItems.filter(item =>
                item.item_name.toLowerCase().includes(focusedValue)
            );

            const choices = filtered.slice(0, 25).map(item => {
                const equipped = item.equipped ? ' [EQUIPPED]' : '';
                return {
                    name: `${rarityEmoji[item.rarity] || '⚪'} ${item.item_name} (${item.item_type})${equipped}`,
                    value: item.item_id.toString()
                };
            });

            return interaction.respond(choices);
        }
    }
};
