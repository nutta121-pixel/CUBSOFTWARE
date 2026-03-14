const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isDeveloper } = require('../../utils/permissions');
const { debugLogger } = require('../../../utils/debugLogger');
const config = require('../../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('debug')
        .setDescription('Manage debug log categories (Developer only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show all log categories and their status')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable a log category')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('The category to enable (or "all")')
                        .setRequired(true)
                        .addChoices(
                            { name: 'All Categories', value: 'all' },
                            { name: 'WEBSITE', value: 'WEBSITE' },
                            { name: 'WEBSOCKET', value: 'WEBSOCKET' },
                            { name: 'QUEST', value: 'QUEST' },
                            { name: 'BOSS', value: 'BOSS' },
                            { name: 'DATABASE', value: 'DATABASE' },
                            { name: 'API', value: 'API' },
                            { name: 'COMMAND', value: 'COMMAND' },
                            { name: 'EVENT', value: 'EVENT' },
                            { name: 'TRAVEL', value: 'TRAVEL' },
                            { name: 'LEADERBOARD', value: 'LEADERBOARD' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable a log category')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('The category to disable (or "all")')
                        .setRequired(true)
                        .addChoices(
                            { name: 'All Categories', value: 'all' },
                            { name: 'WEBSITE', value: 'WEBSITE' },
                            { name: 'WEBSOCKET', value: 'WEBSOCKET' },
                            { name: 'QUEST', value: 'QUEST' },
                            { name: 'BOSS', value: 'BOSS' },
                            { name: 'DATABASE', value: 'DATABASE' },
                            { name: 'API', value: 'API' },
                            { name: 'COMMAND', value: 'COMMAND' },
                            { name: 'EVENT', value: 'EVENT' },
                            { name: 'TRAVEL', value: 'TRAVEL' },
                            { name: 'LEADERBOARD', value: 'LEADERBOARD' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('toggle')
                .setDescription('Toggle a log category on/off')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('The category to toggle')
                        .setRequired(true)
                        .addChoices(
                            { name: 'WEBSITE', value: 'WEBSITE' },
                            { name: 'WEBSOCKET', value: 'WEBSOCKET' },
                            { name: 'QUEST', value: 'QUEST' },
                            { name: 'BOSS', value: 'BOSS' },
                            { name: 'DATABASE', value: 'DATABASE' },
                            { name: 'API', value: 'API' },
                            { name: 'COMMAND', value: 'COMMAND' },
                            { name: 'EVENT', value: 'EVENT' },
                            { name: 'TRAVEL', value: 'TRAVEL' },
                            { name: 'LEADERBOARD', value: 'LEADERBOARD' }
                        )
                )
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!await isDeveloper(interaction)) {
            return interaction.reply({
                content: '❌ This command is only available to QuestCord developers.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'status':
                await handleStatus(interaction);
                break;
            case 'enable':
                await handleEnable(interaction);
                break;
            case 'disable':
                await handleDisable(interaction);
                break;
            case 'toggle':
                await handleToggle(interaction);
                break;
        }
    }
};

async function handleStatus(interaction) {
    try {
        const categories = debugLogger.getCategories();

        const enabledList = categories.filter(c => c.enabled).map(c => c.category);
        const disabledList = categories.filter(c => !c.enabled).map(c => c.category);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('🔧 Debug Log Categories')
            .setDescription('Current status of all debug log categories')
            .addFields(
                {
                    name: '✅ Enabled',
                    value: enabledList.length > 0 ? enabledList.map(c => `\`${c}\``).join(', ') : 'None',
                    inline: false
                },
                {
                    name: '❌ Disabled',
                    value: disabledList.length > 0 ? disabledList.map(c => `\`${c}\``).join(', ') : 'None',
                    inline: false
                }
            )
            .setFooter({ text: 'Use /debug enable or /debug disable to change' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting debug status:', error);
        await interaction.reply({
            content: '❌ An error occurred while getting debug status.',
            ephemeral: true
        });
    }
}

async function handleEnable(interaction) {
    const category = interaction.options.getString('category');

    try {
        if (category === 'all') {
            const categories = debugLogger.getCategories();
            for (const { category: cat } of categories) {
                debugLogger.setCategoryEnabled(cat, true);
            }

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.success)
                .setTitle('✅ All Log Categories Enabled')
                .setDescription('All debug log categories have been enabled.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            debugLogger.setCategoryEnabled(category, true);

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.success)
                .setTitle('✅ Log Category Enabled')
                .setDescription(`**${category}** logs are now enabled.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        console.log(`[DEBUG] ${category} logs enabled by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error enabling log category:', error);
        await interaction.reply({
            content: '❌ An error occurred while enabling the log category.',
            ephemeral: true
        });
    }
}

async function handleDisable(interaction) {
    const category = interaction.options.getString('category');

    try {
        if (category === 'all') {
            const categories = debugLogger.getCategories();
            for (const { category: cat } of categories) {
                debugLogger.setCategoryEnabled(cat, false);
            }

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.warning)
                .setTitle('❌ All Log Categories Disabled')
                .setDescription('All debug log categories have been disabled.')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        } else {
            debugLogger.setCategoryEnabled(category, false);

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.warning)
                .setTitle('❌ Log Category Disabled')
                .setDescription(`**${category}** logs are now disabled.`)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        console.log(`[DEBUG] ${category} logs disabled by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error disabling log category:', error);
        await interaction.reply({
            content: '❌ An error occurred while disabling the log category.',
            ephemeral: true
        });
    }
}

async function handleToggle(interaction) {
    const category = interaction.options.getString('category');

    try {
        const newState = debugLogger.toggleCategory(category);

        const embed = new EmbedBuilder()
            .setColor(newState ? config.theme.colors.success : config.theme.colors.warning)
            .setTitle(`${newState ? '✅' : '❌'} Log Category Toggled`)
            .setDescription(`**${category}** logs are now ${newState ? 'enabled' : 'disabled'}.`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[DEBUG] ${category} logs toggled to ${newState ? 'enabled' : 'disabled'} by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error toggling log category:', error);
        await interaction.reply({
            content: '❌ An error occurred while toggling the log category.',
            ephemeral: true
        });
    }
}
