const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const { UserModel } = require('../../database/models');
const { db } = require('../../database/schema');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse and purchase weapons and armor')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Category to browse')
                .setRequired(false)
                .addChoices(
                    { name: 'All Items', value: 'all' },
                    { name: 'Weapons', value: 'weapon' },
                    { name: 'Armor', value: 'armor' },
                    { name: 'Common', value: 'common' },
                    { name: 'Uncommon', value: 'uncommon' },
                    { name: 'Rare', value: 'rare' },
                    { name: 'Epic', value: 'epic' },
                    { name: 'Legendary', value: 'legendary' }
                )
        ),

    async execute(interaction) {
        const category = interaction.options.getString('category') || 'all';
        let user = UserModel.findByDiscordId(interaction.user.id);

        if (!user) {
            UserModel.create(interaction.user.id, interaction.user.username);
            user = UserModel.findByDiscordId(interaction.user.id);
        }

        // Get shop items (exclude mythic rarity - dev only)
        let query = 'SELECT * FROM items WHERE rarity != ? AND (currency_cost > 0 OR gem_cost > 0)';
        const params = ['mythic'];

        // Filter by category
        if (category === 'weapon' || category === 'armor') {
            query += ' AND item_type = ?';
            params.push(category);
        } else if (category !== 'all') {
            query += ' AND rarity = ?';
            params.push(category);
        }

        query += ' ORDER BY currency_cost ASC';

        const items = db.prepare(query).all(...params);

        if (items.length === 0) {
            return interaction.reply({
                content: 'No items available in this category.',
                ephemeral: true
            });
        }

        const rarityEmoji = {
            'common': '⚪',
            'uncommon': '🟢',
            'rare': '🔵',
            'epic': '🟣',
            'legendary': '🟠'
        };

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('🏪 QuestCord Shop')
            .setDescription(`**Your Balance:** ${user.currency.toLocaleString()} Dakari | ${user.gems.toLocaleString()} Gems\n\nSelect an item from the dropdown below to purchase it.`)
            .setFooter({ text: `Showing ${items.length} items` });

        // Create select menu options (max 25 items)
        const options = items.slice(0, 25).map(item => {
            const typeIcon = item.item_type === 'weapon' ? '⚔️' : '🛡️';
            const priceText = item.gem_cost > 0
                ? `${item.currency_cost} Dakari + ${item.gem_cost} Gems`
                : `${item.currency_cost} Dakari`;

            return {
                label: item.item_name.substring(0, 100),
                description: priceText.substring(0, 100),
                value: `buy_${item.id}`,
                emoji: rarityEmoji[item.rarity] || '⚪'
            };
        });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('shop_select')
            .setPlaceholder('Choose an item to purchase')
            .addOptions(options);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: true
        });

        // Handle selection
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 300000 // 5 minutes
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== interaction.user.id) {
                return i.reply({ content: 'This shop is not for you!', ephemeral: true });
            }

            const itemId = parseInt(i.values[0].replace('buy_', ''));
            const item = db.prepare('SELECT * FROM items WHERE id = ?').get(itemId);

            if (!item) {
                return i.reply({ content: '❌ Item not found!', ephemeral: true });
            }

            // Show confirmation with item details
            const confirmEmbed = new EmbedBuilder()
                .setColor(config.theme.colors.primary)
                .setTitle(`${rarityEmoji[item.rarity]} ${item.item_name}`)
                .setDescription(item.description)
                .addFields(
                    {
                        name: 'Stats',
                        value: `⚔️ Attack: ${item.attack_power}\n🛡️ Defense: ${item.defense_power}\n✨ Crit: ${item.crit_chance}%`,
                        inline: true
                    },
                    {
                        name: 'Price',
                        value: `💰 ${item.currency_cost} Dakari${item.gem_cost > 0 ? `\n💎 ${item.gem_cost} Gems` : ''}`,
                        inline: true
                    },
                    {
                        name: 'Your Balance',
                        value: `💰 ${user.currency.toLocaleString()} Dakari\n💎 ${user.gems.toLocaleString()} Gems`,
                        inline: true
                    }
                );

            const confirmButton = new ButtonBuilder()
                .setCustomId(`confirm_buy_${item.id}`)
                .setLabel('Purchase')
                .setStyle(ButtonStyle.Success)
                .setEmoji('💳');

            const cancelButton = new ButtonBuilder()
                .setCustomId('cancel_buy')
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Secondary);

            const buttonRow = new ActionRowBuilder().addComponents(confirmButton, cancelButton);

            await i.update({
                embeds: [confirmEmbed],
                components: [buttonRow]
            });
        });
    }
};
