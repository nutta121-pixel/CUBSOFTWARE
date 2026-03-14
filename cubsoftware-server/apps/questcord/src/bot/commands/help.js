const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('View all available commands and helpful links'),

    async execute(interaction) {
        const embed = createHelpEmbed('overview');
        const buttons = createHelpButtons();

        await interaction.reply({ embeds: [embed], components: buttons });
    }
};

function createHelpEmbed(category) {
    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTimestamp();

    switch (category) {
        case 'overview':
            embed
                .setTitle('📚 QuestCord - Help & Commands')
                .setDescription('**Welcome to QuestCord!**\nEmbark on an epic adventure across Discord servers!\n\n**🎮 Quick Start:**\n1️⃣ Use `/quests` to see available quests\n2️⃣ Accept a quest and complete the challenge\n3️⃣ Earn rewards and level up\n4️⃣ Use `/travel` to explore other servers\n5️⃣ Fight bosses with `/attack`\n\n**Select a category below to learn more!**')
                .addFields(
                    {
                        name: '⚔️ Core Gameplay',
                        value: 'Quests, combat, bosses, and travel',
                        inline: true
                    },
                    {
                        name: '💰 Economy & Items',
                        value: 'Shop, inventory, balance, and equipment',
                        inline: true
                    },
                    {
                        name: '🏆 Progression',
                        value: 'Profile, rank, leaderboard, and PVP',
                        inline: true
                    },
                    {
                        name: '⚙️ Server Setup',
                        value: 'Commands for server owners',
                        inline: true
                    },
                    {
                        name: '📖 Quest Types',
                        value: 'Learn about different quest types',
                        inline: true
                    },
                    {
                        name: '🔗 Quick Links',
                        value: 'Website, support, and invite',
                        inline: true
                    }
                )
                .setFooter({ text: 'Click the category buttons below to explore commands!' });
            break;

        case 'gameplay':
            embed
                .setTitle('⚔️ Core Gameplay Commands')
                .setDescription('Commands for questing, combat, and exploration.')
                .addFields(
                    {
                        name: '📜 Questing',
                        value: '**`/quests`**\nView and accept available quests\n\n**`/tutorial`**\nComplete the interactive tutorial\n\n**`/travel [destination]`**\nTravel to other servers to find more quests',
                        inline: false
                    },
                    {
                        name: '🐉 Boss Combat',
                        value: '**`/boss status`**\nView active boss information\n\n**`/attack`**\nAttack the current boss\n\n**`/boss despawn`** *(Staff only)*\nManually despawn the active boss',
                        inline: false
                    },
                    {
                        name: '💡 Tips',
                        value: '• Bosses spawn randomly on opted-in servers\n• Cooperate with other players to defeat bosses\n• Travel to find more quest opportunities\n• Complete quests to earn Dakari and gems',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use the buttons below to view other categories' });
            break;

        case 'economy':
            embed
                .setTitle('💰 Economy & Items')
                .setDescription('Manage your currency, items, and equipment.')
                .addFields(
                    {
                        name: '💵 Currency',
                        value: '**`/balance [user]`**\nCheck your Dakari and gems\n\n**`/rank [user]`**\nView your global rank',
                        inline: false
                    },
                    {
                        name: '🛒 Shopping',
                        value: '**`/shop`**\nBrowse items for purchase\n\n**`/buy <item> [quantity]`**\nPurchase items from the shop',
                        inline: false
                    },
                    {
                        name: '🎒 Inventory & Equipment',
                        value: '**`/inventory`**\nView your items and equipment\n\n**`/equip <item>`**\nEquip weapons or armor',
                        inline: false
                    },
                    {
                        name: '💡 Currency Info',
                        value: '**Dakari** - Main currency earned from quests\n**Gems** - Premium currency for special items\n\nEarn both by completing quests and defeating bosses!',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use the buttons below to view other categories' });
            break;

        case 'progression':
            embed
                .setTitle('🏆 Progression & Competition')
                .setDescription('Track your progress and compete with others.')
                .addFields(
                    {
                        name: '📊 Your Progress',
                        value: '**`/profile [user]`**\nView detailed profile with stats\n\n**`/rank [user]`**\nCheck leaderboard position',
                        inline: false
                    },
                    {
                        name: '🏅 Leaderboards',
                        value: '**`/leaderboard`**\nView top players globally\n\nLeaderboards reset monthly for fresh competition!',
                        inline: false
                    },
                    {
                        name: '⚔️ Player vs Player',
                        value: '**`/pvp toggle`**\nEnable/disable PVP mode\n\n**`/pvp challenge <user>`**\nChallenge another player\n\n**`/pvp stats [user]`**\nView PVP statistics',
                        inline: false
                    },
                    {
                        name: '📈 Leveling Up',
                        value: 'Gain XP from quests and bosses to level up. Higher levels unlock better quests and rewards!',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use the buttons below to view other categories' });
            break;

        case 'server':
            embed
                .setTitle('⚙️ Server Owner Commands')
                .setDescription('Commands for managing QuestCord on your server.')
                .addFields(
                    {
                        name: '🔧 Server Setup',
                        value: '**`/optin`** *(Owner only)*\nEnable QuestCord quests on your server\n\n**`/optout`** *(Owner only)*\nDisable QuestCord quests on your server',
                        inline: false
                    },
                    {
                        name: '💀 Boss Spawns',
                        value: 'When opted in, your server can receive boss spawns! Bosses spawn randomly across all opted-in servers.',
                        inline: false
                    },
                    {
                        name: '📜 Quest System',
                        value: 'Quests are automatically generated daily for your server. Players can view them with `/quests`.',
                        inline: false
                    },
                    {
                        name: '⚠️ Important',
                        value: '• Only server owners can opt in/out\n• Opting out removes your server from boss spawns\n• Quest data remains even after opting out',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use the buttons below to view other categories' });
            break;

        case 'quest-types':
            embed
                .setTitle('📖 Quest Type Guide')
                .setDescription('Learn about the different types of quests in QuestCord.')
                .addFields(
                    {
                        name: '🗡️ Combat Quests',
                        value: 'Button-mashing battles against enemies. Click the attack button rapidly to deal damage before time runs out!',
                        inline: false
                    },
                    {
                        name: '🌿 Gathering Quests',
                        value: 'Timed resource collection. Gather materials quickly within the time limit.',
                        inline: false
                    },
                    {
                        name: '🗺️ Exploration Quests',
                        value: 'Multi-step journeys through different areas. Make decisions at each location to progress.',
                        inline: false
                    },
                    {
                        name: '📦 Delivery Quests',
                        value: 'Time-based travel missions. Successfully deliver items before the deadline.',
                        inline: false
                    },
                    {
                        name: '💬 Social Quests',
                        value: 'Instant completion quests that reward interaction. Quick and easy rewards!',
                        inline: false
                    },
                    {
                        name: '💡 Quest Tips',
                        value: '• Higher difficulty = better rewards\n• Complete daily quests for consistent gains\n• Different quest types suit different playstyles',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use the buttons below to view other categories' });
            break;

        case 'links':
            embed
                .setTitle('🔗 Quick Links & Resources')
                .setDescription('Connect with QuestCord and get help!')
                .addFields(
                    {
                        name: '🌐 Website',
                        value: '[questcord.fun](https://questcord.fun)\nView leaderboards, stats, and more online!',
                        inline: false
                    },
                    {
                        name: '💬 Support Server',
                        value: '[Join Discord](https://discord.gg/ACGKvKkZ5Z)\nGet help, report bugs, suggest features',
                        inline: false
                    },
                    {
                        name: '➕ Invite Bot',
                        value: '[Add to Your Server](https://discord.com/oauth2/authorize?client_id=1403949996868374558&permissions=2048&scope=bot%20applications.commands)\nBring QuestCord to your community!',
                        inline: false
                    },
                    {
                        name: '📢 Updates',
                        value: 'Join the support server for announcements about new features, events, and updates!',
                        inline: false
                    }
                )
                .setFooter({ text: 'Use the buttons below to view other categories' });
            break;
    }

    return embed;
}

function createHelpButtons(currentCategory = 'overview') {
    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_cat_overview')
                .setLabel('Overview')
                .setStyle(currentCategory === 'overview' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('📚'),
            new ButtonBuilder()
                .setCustomId('help_cat_gameplay')
                .setLabel('Gameplay')
                .setStyle(currentCategory === 'gameplay' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('⚔️'),
            new ButtonBuilder()
                .setCustomId('help_cat_economy')
                .setLabel('Economy')
                .setStyle(currentCategory === 'economy' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('💰'),
            new ButtonBuilder()
                .setCustomId('help_cat_progression')
                .setLabel('Progression')
                .setStyle(currentCategory === 'progression' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🏆')
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('help_cat_server')
                .setLabel('Server')
                .setStyle(currentCategory === 'server' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('⚙️'),
            new ButtonBuilder()
                .setCustomId('help_cat_quest-types')
                .setLabel('Quest Types')
                .setStyle(currentCategory === 'quest-types' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('📖'),
            new ButtonBuilder()
                .setCustomId('help_cat_links')
                .setLabel('Links')
                .setStyle(currentCategory === 'links' ? ButtonStyle.Primary : ButtonStyle.Secondary)
                .setEmoji('🔗')
        );

    const row3 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('Website')
                .setStyle(ButtonStyle.Link)
                .setEmoji('🌐')
                .setURL('https://questcord.fun'),
            new ButtonBuilder()
                .setLabel('Support Server')
                .setStyle(ButtonStyle.Link)
                .setEmoji('💬')
                .setURL('https://discord.gg/ACGKvKkZ5Z'),
            new ButtonBuilder()
                .setLabel('Add to Server')
                .setStyle(ButtonStyle.Link)
                .setEmoji('➕')
                .setURL('https://discord.com/oauth2/authorize?client_id=1403949996868374558&permissions=2048&scope=bot%20applications.commands')
        );

    return [row1, row2, row3];
}

// Export functions for button handler
module.exports.createHelpEmbed = createHelpEmbed;
module.exports.createHelpButtons = createHelpButtons;
