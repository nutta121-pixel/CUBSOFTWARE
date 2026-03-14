const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { BannedIPModel } = require('../../../database/models');
const { isDeveloper } = require('../../utils/permissions');
const config = require('../../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin-ipban')
        .setDescription('Manage IP bans for the website (Developer only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ban an IP address')
                .addStringOption(option =>
                    option.setName('ip')
                        .setDescription('The IP address to ban')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('reason')
                        .setDescription('Reason for the ban')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option.setName('permanent')
                        .setDescription('Is this a permanent ban?')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('hours')
                        .setDescription('Duration in hours (if not permanent)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(8760)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Unban an IP address')
                .addStringOption(option =>
                    option.setName('ip')
                        .setDescription('The IP address to unban')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all banned IP addresses')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check if an IP address is banned')
                .addStringOption(option =>
                    option.setName('ip')
                        .setDescription('The IP address to check')
                        .setRequired(true)
                )
        ),

    async execute(interaction) {
        if (!await isDeveloper(interaction)) {
            return interaction.reply({
                content: 'This command is only available to developers.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'add':
                await handleAddBan(interaction);
                break;
            case 'remove':
                await handleRemoveBan(interaction);
                break;
            case 'list':
                await handleListBans(interaction);
                break;
            case 'check':
                await handleCheckBan(interaction);
                break;
        }
    }
};

async function handleAddBan(interaction) {
    const ip = interaction.options.getString('ip');
    const reason = interaction.options.getString('reason');
    const permanent = interaction.options.getBoolean('permanent') ?? true;
    const hours = interaction.options.getInteger('hours');

    if (!validateIP(ip)) {
        return interaction.reply({
            content: 'Invalid IP address format.',
            ephemeral: true
        });
    }

    let expiresAt = null;
    if (!permanent && hours) {
        expiresAt = Math.floor(Date.now() / 1000) + (hours * 3600);
    }

    try {
        BannedIPModel.ban(
            ip,
            reason,
            interaction.user.username,
            interaction.user.id,
            permanent,
            expiresAt
        );

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('IP Address Banned')
            .addFields(
                {
                    name: 'IP Address',
                    value: ip,
                    inline: true
                },
                {
                    name: 'Duration',
                    value: permanent ? 'Permanent' : `${hours} hours`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: reason,
                    inline: false
                },
                {
                    name: 'Banned By',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

        console.log(`[IP BAN] ${ip} banned by ${interaction.user.username}: ${reason}`);
    } catch (error) {
        console.error('Error banning IP:', error);
        await interaction.reply({
            content: 'An error occurred while banning the IP address.',
            ephemeral: true
        });
    }
}

async function handleRemoveBan(interaction) {
    const ip = interaction.options.getString('ip');

    try {
        const result = BannedIPModel.unban(ip);

        if (result.changes === 0) {
            return interaction.reply({
                content: `IP address ${ip} is not currently banned.`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.success)
            .setTitle('IP Address Unbanned')
            .addFields(
                {
                    name: 'IP Address',
                    value: ip
                },
                {
                    name: 'Unbanned By',
                    value: `${interaction.user.username} (${interaction.user.id})`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

        console.log(`[IP UNBAN] ${ip} unbanned by ${interaction.user.username}`);
    } catch (error) {
        console.error('Error unbanning IP:', error);
        await interaction.reply({
            content: 'An error occurred while unbanning the IP address.',
            ephemeral: true
        });
    }
}

async function handleListBans(interaction) {
    try {
        const bans = BannedIPModel.getAll();

        if (bans.length === 0) {
            return interaction.reply({
                content: 'No IP addresses are currently banned.',
                ephemeral: true
            });
        }

        const now = Math.floor(Date.now() / 1000);
        const banList = bans.slice(0, 10).map(ban => {
            const status = ban.permanent ? 'Permanent' :
                ban.expires_at > now ? `Expires <t:${ban.expires_at}:R>` : 'Expired';
            return `**${ban.ip_address}**\n└ Reason: ${ban.reason}\n└ Status: ${status}\n└ By: ${ban.banned_by}`;
        }).join('\n\n');

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.warning)
            .setTitle('Banned IP Addresses')
            .setDescription(banList)
            .setFooter({ text: `Showing ${Math.min(bans.length, 10)} of ${bans.length} bans` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error listing bans:', error);
        await interaction.reply({
            content: 'An error occurred while fetching the ban list.',
            ephemeral: true
        });
    }
}

async function handleCheckBan(interaction) {
    const ip = interaction.options.getString('ip');

    try {
        const ban = BannedIPModel.isBanned(ip);

        if (!ban) {
            return interaction.reply({
                content: `IP address ${ip} is not banned.`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.error)
            .setTitle('IP Ban Information')
            .addFields(
                {
                    name: 'IP Address',
                    value: ban.ip_address,
                    inline: true
                },
                {
                    name: 'Status',
                    value: ban.permanent ? 'Permanent' : `Expires <t:${ban.expires_at}:R>`,
                    inline: true
                },
                {
                    name: 'Reason',
                    value: ban.reason,
                    inline: false
                },
                {
                    name: 'Banned By',
                    value: ban.banned_by
                },
                {
                    name: 'Ban Date',
                    value: `<t:${ban.banned_at}:F>`
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error checking ban:', error);
        await interaction.reply({
            content: 'An error occurred while checking the ban status.',
            ephemeral: true
        });
    }
}

function validateIP(ip) {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const ipv6Regex = /^([0-9a-fA-F]{0,4}:){7}[0-9a-fA-F]{0,4}$/;

    if (ipv4Regex.test(ip)) {
        const parts = ip.split('.');
        return parts.every(part => parseInt(part) >= 0 && parseInt(part) <= 255);
    }

    return ipv6Regex.test(ip);
}
