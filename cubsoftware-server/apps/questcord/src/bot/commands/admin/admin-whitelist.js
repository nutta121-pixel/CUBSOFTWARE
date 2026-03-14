const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { isDeveloper } = require('../../utils/permissions');
const config = require('../../../../config.json');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-whitelist')
        .setDescription('Manage web dashboard whitelist (Developer only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable testing mode (whitelist enforcement)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable testing mode (allow everyone)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Add a user to the whitelist')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to add to whitelist')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Remove a user from the whitelist')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('The user to remove from whitelist')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all whitelisted users')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Show current whitelist status')
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
            case 'enable':
                await handleEnable(interaction);
                break;
            case 'disable':
                await handleDisable(interaction);
                break;
            case 'add':
                await handleAdd(interaction);
                break;
            case 'remove':
                await handleRemove(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'status':
                await handleStatus(interaction);
                break;
        }
    }
};

function getConfigPath() {
    return path.join(__dirname, '../../../..', 'config.json');
}

function readConfig() {
    const configPath = getConfigPath();
    const configData = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configData);
}

function writeConfig(configData) {
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
}

async function handleEnable(interaction) {
    try {
        const configData = readConfig();

        if (!configData.webDashboard) {
            configData.webDashboard = {
                testingMode: true,
                whitelist: []
            };
        } else {
            configData.webDashboard.testingMode = true;
        }

        writeConfig(configData);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🔒 Whitelist Enabled')
            .setDescription('Web dashboard testing mode has been **enabled**.')
            .addFields(
                {
                    name: 'Effect',
                    value: 'Only whitelisted users can access the web dashboard',
                    inline: false
                },
                {
                    name: 'Whitelisted Users',
                    value: configData.webDashboard.whitelist.length > 0
                        ? configData.webDashboard.whitelist.map(id => `<@${id}>`).join(', ')
                        : 'None - use `/admin-whitelist add` to add users',
                    inline: false
                },
                {
                    name: 'Changed By',
                    value: `${interaction.user.username} (${interaction.user.id})`,
                    inline: true
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[ADMIN] Web dashboard whitelist enabled by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error enabling whitelist:', error);
        await interaction.reply({
            content: '❌ An error occurred while enabling the whitelist.',
            ephemeral: true
        });
    }
}

async function handleDisable(interaction) {
    try {
        const configData = readConfig();

        if (!configData.webDashboard) {
            configData.webDashboard = {
                testingMode: false,
                whitelist: []
            };
        } else {
            configData.webDashboard.testingMode = false;
        }

        writeConfig(configData);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('🔓 Whitelist Disabled')
            .setDescription('Web dashboard testing mode has been **disabled**.')
            .addFields(
                {
                    name: 'Effect',
                    value: 'All authenticated users can now access the web dashboard',
                    inline: false
                },
                {
                    name: 'Changed By',
                    value: `${interaction.user.username} (${interaction.user.id})`,
                    inline: true
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[ADMIN] Web dashboard whitelist disabled by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error disabling whitelist:', error);
        await interaction.reply({
            content: '❌ An error occurred while disabling the whitelist.',
            ephemeral: true
        });
    }
}

async function handleAdd(interaction) {
    const targetUser = interaction.options.getUser('user');

    try {
        const configData = readConfig();

        if (!configData.webDashboard) {
            configData.webDashboard = {
                testingMode: true,
                whitelist: []
            };
        }

        if (configData.webDashboard.whitelist.includes(targetUser.id)) {
            return interaction.reply({
                content: `❌ User **${targetUser.username}** is already in the whitelist.`,
                ephemeral: true
            });
        }

        configData.webDashboard.whitelist.push(targetUser.id);
        writeConfig(configData);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('✅ User Added to Whitelist')
            .setDescription(`User **${targetUser.username}** can now access the web dashboard.`)
            .addFields(
                {
                    name: 'Discord ID',
                    value: targetUser.id,
                    inline: true
                },
                {
                    name: 'Total Whitelisted',
                    value: configData.webDashboard.whitelist.length.toString(),
                    inline: true
                },
                {
                    name: 'Testing Mode',
                    value: configData.webDashboard.testingMode ? '🔒 Enabled' : '🔓 Disabled',
                    inline: true
                },
                {
                    name: 'Added By',
                    value: `${interaction.user.username} (${interaction.user.id})`,
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[ADMIN] ${targetUser.username} (${targetUser.id}) added to web dashboard whitelist by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error adding to whitelist:', error);
        await interaction.reply({
            content: '❌ An error occurred while adding the user to the whitelist.',
            ephemeral: true
        });
    }
}

async function handleRemove(interaction) {
    const targetUser = interaction.options.getUser('user');

    try {
        const configData = readConfig();

        if (!configData.webDashboard || !configData.webDashboard.whitelist) {
            return interaction.reply({
                content: '❌ Whitelist is empty.',
                ephemeral: true
            });
        }

        const index = configData.webDashboard.whitelist.indexOf(targetUser.id);
        if (index === -1) {
            return interaction.reply({
                content: `❌ User **${targetUser.username}** is not in the whitelist.`,
                ephemeral: true
            });
        }

        configData.webDashboard.whitelist.splice(index, 1);
        writeConfig(configData);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('🗑️ User Removed from Whitelist')
            .setDescription(`User **${targetUser.username}** can no longer access the web dashboard (if testing mode is enabled).`)
            .addFields(
                {
                    name: 'Discord ID',
                    value: targetUser.id,
                    inline: true
                },
                {
                    name: 'Remaining Whitelisted',
                    value: configData.webDashboard.whitelist.length.toString(),
                    inline: true
                },
                {
                    name: 'Removed By',
                    value: `${interaction.user.username} (${interaction.user.id})`,
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
        console.log(`[ADMIN] ${targetUser.username} (${targetUser.id}) removed from web dashboard whitelist by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error removing from whitelist:', error);
        await interaction.reply({
            content: '❌ An error occurred while removing the user from the whitelist.',
            ephemeral: true
        });
    }
}

async function handleList(interaction) {
    try {
        const configData = readConfig();

        if (!configData.webDashboard || !configData.webDashboard.whitelist || configData.webDashboard.whitelist.length === 0) {
            return interaction.reply({
                content: '📝 The whitelist is currently empty. Use `/admin-whitelist add` to add users.',
                ephemeral: true
            });
        }

        const userList = configData.webDashboard.whitelist.map((id, index) =>
            `${index + 1}. <@${id}> (\`${id}\`)`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('📝 Web Dashboard Whitelist')
            .setDescription(userList)
            .addFields({
                name: 'Testing Mode',
                value: configData.webDashboard.testingMode ? '🔒 Enabled - Whitelist is active' : '🔓 Disabled - Everyone has access',
                inline: false
            })
            .setFooter({ text: `${configData.webDashboard.whitelist.length} user(s) whitelisted` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error listing whitelist:', error);
        await interaction.reply({
            content: '❌ An error occurred while listing the whitelist.',
            ephemeral: true
        });
    }
}

async function handleStatus(interaction) {
    try {
        const configData = readConfig();

        const testingMode = configData.webDashboard?.testingMode ?? false;
        const whitelistCount = configData.webDashboard?.whitelist?.length ?? 0;

        const embed = new EmbedBuilder()
            .setColor(testingMode ? config.theme.colors.warning : config.theme.colors.success)
            .setTitle('📊 Web Dashboard Whitelist Status')
            .addFields(
                {
                    name: 'Testing Mode',
                    value: testingMode ? '🔒 **Enabled** - Only whitelisted users have access' : '🔓 **Disabled** - All authenticated users have access',
                    inline: false
                },
                {
                    name: 'Whitelisted Users',
                    value: whitelistCount > 0 ? `${whitelistCount} user(s)` : 'None',
                    inline: true
                },
                {
                    name: 'Quick Actions',
                    value: testingMode
                        ? '• `/admin-whitelist add` - Add users\n• `/admin-whitelist disable` - Allow everyone'
                        : '• `/admin-whitelist enable` - Restrict to whitelist\n• `/admin-whitelist add` - Add users first',
                    inline: false
                }
            )
            .setTimestamp();

        if (whitelistCount > 0) {
            const userList = configData.webDashboard.whitelist.slice(0, 10).map(id => `<@${id}>`).join(', ');
            embed.addFields({
                name: 'Whitelisted Users' + (whitelistCount > 10 ? ` (showing 10/${whitelistCount})` : ''),
                value: userList,
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting whitelist status:', error);
        await interaction.reply({
            content: '❌ An error occurred while getting the whitelist status.',
            ephemeral: true
        });
    }
}
