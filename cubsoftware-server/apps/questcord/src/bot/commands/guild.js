const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const GuildService = require('../../services/gameEngine/GuildService');
const { GuildModel, UserModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('guild')
        .setDescription('Manage your guild')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Create a new guild (costs 100,000 Dakari)')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Guild name (3-32 characters)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('tag')
                        .setDescription('Guild tag (2-5 characters)')
                        .setRequired(true)
                )
                .addBooleanOption(option =>
                    option.setName('public')
                        .setDescription('Make guild public (anyone can join) or invite-only?')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Guild description')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('info')
                .setDescription('View guild information')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('invite')
                .setDescription('Invite a user to your guild')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('User to invite')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('join')
                .setDescription('Join a guild (accept pending invite)')
                .addIntegerOption(option =>
                    option.setName('invite_id')
                        .setDescription('Invite ID (use /guild invites to see pending invites)')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('invites')
                .setDescription('View your pending guild invites')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leave')
                .setDescription('Leave your current guild')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('contribute')
                .setDescription('Contribute resources to your guild treasury')
                .addIntegerOption(option =>
                    option.setName('currency')
                        .setDescription('Amount of Dakari to contribute')
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addIntegerOption(option =>
                    option.setName('gems')
                        .setDescription('Amount of gems to contribute')
                        .setRequired(false)
                        .setMinValue(1)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('List all guilds in this server')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('View global guild leaderboard')
                .addStringOption(option =>
                    option.setName('category')
                        .setDescription('Leaderboard category')
                        .setRequired(false)
                        .addChoices(
                            { name: 'By Level', value: 'level' },
                            { name: 'By Treasury', value: 'treasury' },
                            { name: 'By Members', value: 'members' }
                        )
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('upgrade')
                .setDescription('Upgrade your guild (Leader only)')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('slots')
                        .setDescription('Upgrade member slots (+5 slots for 1,000 gems from treasury)')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('level')
                        .setDescription('Upgrade guild level (cost increases per level, grants +5% bonuses per level)')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('kick')
                .setDescription('Kick a member from your guild (Leader only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Member to kick')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('promote')
                .setDescription('Promote a member to officer (Leader only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Member to promote')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('demote')
                .setDescription('Demote an officer to member (Leader only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Officer to demote')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('settings')
                .setDescription('Update guild settings (Leader only)')
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('New guild description')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('public')
                        .setDescription('Make guild public or private')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disband')
                .setDescription('Disband your guild permanently (Leader only)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('transfer')
                .setDescription('Transfer guild leadership to another member (Leader only)')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('New guild leader')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('members')
                .setDescription('View all guild members')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('activity')
                .setDescription('View recent guild activity')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('announce')
                .setDescription('Post a guild announcement (Leader/Officer only)')
                .addStringOption(option =>
                    option.setName('message')
                        .setDescription('Announcement message (max 500 characters)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('Announcement title (max 100 characters)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('announcements')
                .setDescription('View recent guild announcements')
        ),

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const subcommandGroup = interaction.options.getSubcommandGroup();

        if (subcommandGroup === 'upgrade') {
            if (subcommand === 'slots') {
                await handleUpgradeSlots(interaction);
            } else if (subcommand === 'level') {
                await handleUpgradeLevel(interaction);
            }
            return;
        }

        switch (subcommand) {
            case 'create':
                await handleCreate(interaction);
                break;
            case 'info':
                await handleInfo(interaction);
                break;
            case 'invite':
                await handleInvite(interaction);
                break;
            case 'join':
                await handleJoin(interaction);
                break;
            case 'invites':
                await handleInvites(interaction);
                break;
            case 'leave':
                await handleLeave(interaction);
                break;
            case 'contribute':
                await handleContribute(interaction);
                break;
            case 'list':
                await handleList(interaction);
                break;
            case 'leaderboard':
                await handleLeaderboard(interaction);
                break;
            case 'kick':
                await handleKick(interaction);
                break;
            case 'promote':
                await handlePromote(interaction);
                break;
            case 'demote':
                await handleDemote(interaction);
                break;
            case 'settings':
                await handleSettings(interaction);
                break;
            case 'disband':
                await handleDisband(interaction);
                break;
            case 'transfer':
                await handleTransfer(interaction);
                break;
            case 'members':
                await handleMembers(interaction);
                break;
            case 'activity':
                await handleActivity(interaction);
                break;
            case 'announce':
                await handleAnnounce(interaction);
                break;
            case 'announcements':
                await handleAnnouncements(interaction);
                break;
        }
    }
};

async function handleCreate(interaction) {
    const name = interaction.options.getString('name');
    const tag = interaction.options.getString('tag');
    const isPublic = interaction.options.getBoolean('public');
    const description = interaction.options.getString('description') || 'No description';

    const result = await GuildService.createGuild(
        interaction.user.id,
        name,
        tag,
        description,
        interaction.guild.id,
        isPublic,
        'discord'
    );

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(result.success ? '🏰 Guild Created!' : '❌ Failed to Create Guild')
        .setDescription(result.message || result.error)
        .setTimestamp();

    if (result.success) {
        embed.addFields(
            { name: 'Name', value: result.data.name, inline: true },
            { name: 'Tag', value: `[${result.data.tag}]`, inline: true },
            { name: 'Cost', value: '100,000 Dakari', inline: true }
        );
    }

    await interaction.reply({ embeds: [embed], ephemeral: !result.success });
}

async function handleInfo(interaction) {
    const user = UserModel.findByDiscordId(interaction.user.id);
    if (!user) {
        return interaction.reply({ content: '❌ User profile not found. Please use any command to create your profile first.', ephemeral: true });
    }

    const userGuild = GuildModel.getUserGuild(user.id);
    if (!userGuild) {
        return interaction.reply({ content: '❌ You are not in a guild. Use `/guild create` to create one or `/guild invites` to see pending invites.', ephemeral: true });
    }

    const guildInfo = await GuildService.getGuildInfo(userGuild.id);
    if (!guildInfo.success) {
        return interaction.reply({ content: `❌ ${guildInfo.error}`, ephemeral: true });
    }

    const guild = guildInfo.data;
    const leader = UserModel.findById(guild.leader_id);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`🏰 ${guild.name} [${guild.tag}]`)
        .setDescription(guild.description || 'No description')
        .addFields(
            { name: 'Leader', value: leader.username, inline: true },
            { name: 'Members', value: `${guild.memberCount}/${guild.max_members}`, inline: true },
            { name: 'Level', value: `${guild.level}`, inline: true },
            { name: 'Treasury', value: `💰 ${guild.treasury_currency.toLocaleString()} Dakari\n💎 ${guild.treasury_gems.toLocaleString()} Gems`, inline: true },
            { name: 'Your Role', value: userGuild.role.charAt(0).toUpperCase() + userGuild.role.slice(1), inline: true },
            { name: 'Your Contribution', value: `💰 ${userGuild.contribution_currency.toLocaleString()}\n💎 ${userGuild.contribution_gems.toLocaleString()}`, inline: true }
        )
        .setTimestamp();

    // Add member list (limit to top 10 contributors)
    const topMembers = guild.members.slice(0, 10);
    const memberList = topMembers.map((member, index) => {
        const roleEmoji = member.role === 'leader' ? '👑' : member.role === 'officer' ? '⭐' : '👤';
        return `${index + 1}. ${roleEmoji} ${member.username} - 💰 ${member.contribution_currency.toLocaleString()}`;
    }).join('\n');

    if (memberList) {
        embed.addFields({ name: 'Top Contributors', value: memberList, inline: false });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleInvite(interaction) {
    const targetUser = interaction.options.getUser('user');

    if (targetUser.bot) {
        return interaction.reply({ content: '❌ You cannot invite bots to your guild.', ephemeral: true });
    }

    const result = await GuildService.inviteUser(interaction.user.id, targetUser.id, 'discord');

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(result.success ? '📨 Invite Sent!' : '❌ Failed to Send Invite')
        .setDescription(result.message || result.error)
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: !result.success });
}

async function handleJoin(interaction) {
    const inviteId = interaction.options.getInteger('invite_id');

    const result = await GuildService.joinGuild(interaction.user.id, inviteId, 'discord');

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(result.success ? '🎉 Joined Guild!' : '❌ Failed to Join Guild')
        .setDescription(result.message || result.error)
        .setTimestamp();

    if (result.success) {
        embed.addFields(
            { name: 'Guild', value: result.data.guildName, inline: true },
            { name: 'Tag', value: `[${result.data.guildTag}]`, inline: true }
        );
    }

    await interaction.reply({ embeds: [embed], ephemeral: !result.success });
}

async function handleInvites(interaction) {
    const user = UserModel.findByDiscordId(interaction.user.id);
    if (!user) {
        return interaction.reply({ content: '❌ User profile not found.', ephemeral: true });
    }

    const invites = GuildModel.getPendingInvites(user.id);

    if (invites.length === 0) {
        return interaction.reply({ content: '📭 You have no pending guild invites.', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle('📨 Pending Guild Invites')
        .setDescription('Use `/guild join invite_id:<ID>` to accept an invite')
        .setTimestamp();

    const inviteList = invites.map(invite => {
        const expiresIn = Math.floor((invite.expires_at - Math.floor(Date.now() / 1000)) / 86400);
        return `**ID ${invite.id}** - ${invite.guild_name}\nFrom: ${invite.inviter_name}\nExpires in: ${expiresIn} days`;
    }).join('\n\n');

    embed.addFields({ name: 'Invites', value: inviteList, inline: false });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleLeave(interaction) {
    const result = await GuildService.leaveGuild(interaction.user.id, 'discord');

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.warning : config.theme.colors.error)
        .setTitle(result.success ? '👋 Left Guild' : '❌ Failed to Leave Guild')
        .setDescription(result.message || result.error)
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: !result.success });
}

async function handleContribute(interaction) {
    const currency = interaction.options.getInteger('currency') || 0;
    const gems = interaction.options.getInteger('gems') || 0;

    if (currency === 0 && gems === 0) {
        return interaction.reply({ content: '❌ You must contribute at least some currency or gems.', ephemeral: true });
    }

    const result = await GuildService.contributeToGuild(interaction.user.id, currency, gems, 'discord');

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(result.success ? '💝 Contribution Made!' : '❌ Failed to Contribute')
        .setDescription(result.message || result.error)
        .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: !result.success });
}

async function handleList(interaction) {
    const guilds = GuildModel.findByServerId(interaction.guild.id);

    if (guilds.length === 0) {
        return interaction.reply({ content: '📭 No guilds have been created in this server yet. Use `/guild create` to create one!', ephemeral: true });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`🏰 Guilds in ${interaction.guild.name}`)
        .setTimestamp();

    const guildList = guilds.slice(0, 10).map((guild, index) => {
        const leader = UserModel.findById(guild.leader_id);
        const memberCount = GuildModel.getMemberCount(guild.id);
        return `**${index + 1}. [${guild.tag}] ${guild.name}**\nLeader: ${leader.username} | Members: ${memberCount}/${guild.max_members} | Level: ${guild.level}`;
    }).join('\n\n');

    embed.setDescription(guildList);

    if (guilds.length > 10) {
        embed.setFooter({ text: `Showing 10 of ${guilds.length} guilds` });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleUpgradeSlots(interaction) {
    const result = await GuildService.upgradeMaxMembers(interaction.user.id, 'discord');

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(result.success ? '⬆️ Member Slots Upgraded!' : '❌ Upgrade Failed')
        .setDescription(result.message || result.error)
        .setTimestamp();

    if (result.success) {
        embed.addFields(
            { name: 'New Max Members', value: `${result.data.newMaxMembers}`, inline: true },
            { name: 'Cost', value: `💎 ${result.data.gemsCost.toLocaleString()} Gems`, inline: true },
            { name: 'Remaining Gems', value: `💎 ${result.data.remainingGems.toLocaleString()}`, inline: true }
        );
    }

    await interaction.reply({ embeds: [embed], ephemeral: !result.success });
}

async function handleUpgradeLevel(interaction) {
    const result = await GuildService.upgradeGuildLevel(interaction.user.id, 'discord');

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(result.success ? '🌟 Guild Level Up!' : '❌ Upgrade Failed')
        .setDescription(result.message || result.error)
        .setTimestamp();

    if (result.success) {
        embed.addFields(
            { name: 'New Level', value: `${result.data.newLevel}`, inline: true },
            { name: 'Member Bonus', value: `+${result.data.bonusPercent}%`, inline: true },
            { name: 'Cost', value: `💎 ${result.data.gemsCost.toLocaleString()} Gems`, inline: true },
            { name: 'Remaining Gems', value: `💎 ${result.data.remainingGems.toLocaleString()}`, inline: false }
        );
    }

    await interaction.reply({ embeds: [embed], ephemeral: !result.success });
}

async function handleLeaderboard(interaction) {
    const category = interaction.options.getString('category') || 'level';

    let guilds;
    let title;
    let description;

    switch (category) {
        case 'level':
            guilds = GuildModel.getTopGuildsByLevel(10);
            title = '🏆 Top Guilds by Level';
            description = 'The highest level guilds in QuestCord';
            break;
        case 'treasury':
            guilds = GuildModel.getTopGuildsByTreasury(10);
            title = '💰 Top Guilds by Treasury';
            description = 'The wealthiest guilds in QuestCord';
            break;
        case 'members':
            guilds = GuildModel.getTopGuildsByMembers(10);
            title = '👥 Top Guilds by Members';
            description = 'The largest guilds in QuestCord';
            break;
    }

    if (!guilds || guilds.length === 0) {
        return interaction.reply({
            content: '📭 No guilds found. Be the first to create one!',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();

    const guildList = guilds.map((guild, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
        const privacy = guild.public ? '🔓' : '🔒';
        const bonus = guild.level * 5;

        let stats = '';
        if (category === 'level') {
            stats = `Level ${guild.level} (+${bonus}%) | ${guild.member_count}/${guild.max_members} members`;
        } else if (category === 'treasury') {
            stats = `💰 ${guild.treasury_currency.toLocaleString()} | 💎 ${guild.treasury_gems.toLocaleString()} | Lvl ${guild.level}`;
        } else {
            stats = `${guild.member_count}/${guild.max_members} members | Level ${guild.level}`;
        }

        return `${medal} ${privacy} **[${guild.tag}] ${guild.name}**\nLeader: ${guild.leader_name} | ${stats}`;
    }).join('\n\n');

    embed.addFields({ name: '\u200b', value: guildList, inline: false });
    embed.setFooter({ text: '🔓 = Public | 🔒 = Invite-Only' });

    await interaction.reply({ embeds: [embed] });
}

async function handleKick(interaction) {
    const targetUser = interaction.options.getUser('user');

    const result = await GuildService.kickMember(
        interaction.user.id,
        targetUser.id,
        'discord'
    );

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.warning)
        .setTitle('👢 Member Kicked')
        .setDescription(`**${targetUser.username}** has been removed from the guild`)
        .addFields(
            { name: 'Guild', value: result.data.guildName, inline: true },
            { name: 'Kicked by', value: interaction.user.username, inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handlePromote(interaction) {
    const targetUser = interaction.options.getUser('user');

    const result = await GuildService.promoteMember(
        interaction.user.id,
        targetUser.id,
        'discord'
    );

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.success)
        .setTitle('⭐ Member Promoted')
        .setDescription(`**${targetUser.username}** has been promoted to officer`)
        .addFields(
            { name: 'Guild', value: result.data.guildName, inline: true },
            { name: 'New Role', value: 'Officer', inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleDemote(interaction) {
    const targetUser = interaction.options.getUser('user');

    const result = await GuildService.demoteMember(
        interaction.user.id,
        targetUser.id,
        'discord'
    );

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.warning)
        .setTitle('👤 Member Demoted')
        .setDescription(`**${targetUser.username}** has been demoted to member`)
        .addFields(
            { name: 'Guild', value: result.data.guildName, inline: true },
            { name: 'New Role', value: 'Member', inline: true }
        )
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleSettings(interaction) {
    const description = interaction.options.getString('description');
    const isPublic = interaction.options.getBoolean('public');

    if (!description && isPublic === null) {
        return interaction.reply({
            content: '❌ Please provide at least one setting to update',
            ephemeral: true
        });
    }

    const settings = {};
    if (description !== null) settings.description = description;
    if (isPublic !== null) settings.isPublic = isPublic;

    const result = await GuildService.updateGuildSettings(
        interaction.user.id,
        settings,
        'discord'
    );

    if (!result.success) {
        return interaction.reply({
            content: `❌ ${result.error}`,
            ephemeral: true
        });
    }

    const changes = [];
    if (description !== null) changes.push(`Description updated`);
    if (isPublic !== null) changes.push(`Privacy: ${isPublic ? 'Public 🔓' : 'Private 🔒'}`);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle('⚙️ Guild Settings Updated')
        .setDescription('The following settings have been changed:')
        .addFields({ name: 'Changes', value: changes.join('\n'), inline: false })
        .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleDisband(interaction) {
    // Confirm with user first
    const confirmEmbed = new EmbedBuilder()
        .setColor(config.theme.colors.error)
        .setTitle('⚠️ Disband Guild?')
        .setDescription('Are you sure you want to disband your guild? This action is **permanent** and cannot be undone!\n\nAll members will be removed and guild progress will be lost.')
        .setFooter({ text: 'Reply with "confirm disband" to proceed, or anything else to cancel.' });

    await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

    // Wait for confirmation
    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async m => {
        if (m.content.toLowerCase() === 'confirm disband') {
            const result = await GuildService.disbandGuild(interaction.user.id, 'discord');

            if (!result.success) {
                return m.reply(`❌ ${result.error}`);
            }

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.error)
                .setTitle('💥 Guild Disbanded')
                .setDescription(`**${result.data.guildName}** has been permanently disbanded`)
                .addFields(
                    { name: 'Former Members', value: result.data.memberCount.toString(), inline: true },
                    { name: 'Leader', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await m.reply({ embeds: [embed] });
        } else {
            await m.reply('❌ Guild disbanding cancelled.');
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({ content: '❌ Guild disbanding cancelled (timeout).', ephemeral: true });
        }
    });
}

async function handleTransfer(interaction) {
    const targetUser = interaction.options.getUser('user');

    //  Confirm with user first
    const confirmEmbed = new EmbedBuilder()
        .setColor(config.theme.colors.warning)
        .setTitle('⚠️ Transfer Leadership?')
        .setDescription(`Are you sure you want to transfer leadership to **${targetUser.username}**?\n\nYou will become a regular member and lose all leader privileges.`)
        .setFooter({ text: 'Reply with "confirm transfer" to proceed, or anything else to cancel.' });

    await interaction.reply({ embeds: [confirmEmbed], ephemeral: true });

    // Wait for confirmation
    const filter = m => m.author.id === interaction.user.id;
    const collector = interaction.channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', async m => {
        if (m.content.toLowerCase() === 'confirm transfer') {
            const result = await GuildService.transferLeadership(
                interaction.user.id,
                targetUser.id,
                'discord'
            );

            if (!result.success) {
                return m.reply(`❌ ${result.error}`);
            }

            const embed = new EmbedBuilder()
                .setColor(config.theme.colors.primary)
                .setTitle('👑 Leadership Transferred')
                .setDescription(`**${targetUser.username}** is now the leader of ${result.data.guildName}`)
                .addFields(
                    { name: 'Former Leader', value: result.data.oldLeader, inline: true },
                    { name: 'New Leader', value: result.data.newLeader, inline: true }
                )
                .setTimestamp();

            await m.reply({ embeds: [embed] });
        } else {
            await m.reply('❌ Leadership transfer cancelled.');
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            interaction.followUp({ content: '❌ Leadership transfer cancelled (timeout).', ephemeral: true });
        }
    });
}

async function handleMembers(interaction) {
    const user = UserModel.findByDiscordId(interaction.user.id);
    if (!user) {
        return interaction.reply({
            content: '❌ User not found in database',
            ephemeral: true
        });
    }

    const userGuild = GuildModel.getUserGuild(user.id);
    if (!userGuild) {
        return interaction.reply({
            content: '❌ You are not in a guild',
            ephemeral: true
        });
    }

    const guild = GuildModel.findById(userGuild.id);
    const members = GuildModel.getMembers(userGuild.id);

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`👥 ${guild.name} Members`)
        .setDescription(`${members.length}/${guild.max_members} members`);

    // Group members by role
    const leaders = members.filter(m => m.role === 'leader');
    const officers = members.filter(m => m.role === 'officer');
    const regularMembers = members.filter(m => m.role === 'member');

    if (leaders.length > 0) {
        const leaderList = leaders.map(m => `👑 **${m.username}**`).join('\n');
        embed.addFields({ name: 'Leader', value: leaderList, inline: false });
    }

    if (officers.length > 0) {
        const officerList = officers.map(m => `⭐ ${m.username}`).join('\n');
        embed.addFields({ name: `Officers (${officers.length})`, value: officerList, inline: false });
    }

    if (regularMembers.length > 0) {
        const memberList = regularMembers.map(m => `👤 ${m.username}`).join('\n');
        // Split into chunks if too long
        if (memberList.length > 1024) {
            const chunks = memberList.match(/(?:.|\n){1,1020}/g) || [];
            chunks.forEach((chunk, index) => {
                embed.addFields({
                    name: index === 0 ? `Members (${regularMembers.length})` : '\u200b',
                    value: chunk,
                    inline: false
                });
            });
        } else {
            embed.addFields({ name: `Members (${regularMembers.length})`, value: memberList, inline: false });
        }
    }

    embed.setFooter({ text: `Guild Level ${guild.level} • +${guild.level * 5}% bonus` });
    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleActivity(interaction) {
    const user = UserModel.findByDiscordId(interaction.user.id);
    if (!user) {
        return interaction.reply({
            content: '❌ User not found in database',
            ephemeral: true
        });
    }

    const userGuild = GuildModel.getUserGuild(user.id);
    if (!userGuild) {
        return interaction.reply({
            content: '❌ You are not in a guild',
            ephemeral: true
        });
    }

    const guild = GuildModel.findById(userGuild.id);
    const activities = GuildService.getGuildActivity(userGuild.id, 15);

    if (activities.length === 0) {
        return interaction.reply({
            content: '📭 No recent activity to display',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`📜 ${guild.name} Activity Log`)
        .setDescription('Recent guild activity');

    const activityList = activities.map(a => {
        const date = new Date(a.created_at * 1000);
        const timeStr = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        let icon = '•';
        if (a.activity_type === 'member_join') icon = '➕';
        else if (a.activity_type === 'member_leave') icon = '➖';
        else if (a.activity_type === 'member_kick') icon = '👢';
        else if (a.activity_type === 'level_up') icon = '⬆️';
        else if (a.activity_type === 'contribution') icon = '💰';
        else if (a.activity_type === 'promotion') icon = '⭐';
        else if (a.activity_type === 'demotion') icon = '👤';
        else if (a.activity_type === 'leadership_transfer') icon = '👑';

        return `${icon} **${timeStr}** - ${a.description}`;
    }).join('\n');

    embed.addFields({ name: '\u200b', value: activityList, inline: false });
    embed.setFooter({ text: `Showing last ${activities.length} activities` });
    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleAnnounce(interaction) {
    const message = interaction.options.getString('message');
    const title = interaction.options.getString('title');

    const result = await GuildService.createAnnouncement(
        interaction.user.id,
        title,
        message,
        'discord'
    );

    const embed = new EmbedBuilder()
        .setColor(result.success ? config.theme.colors.success : config.theme.colors.error)
        .setTitle(result.success ? '📢 Announcement Posted' : '❌ Error')
        .setDescription(result.success ? result.message : result.error);

    if (result.success && result.data) {
        if (result.data.title) {
            embed.addFields({
                name: 'Title',
                value: result.data.title,
                inline: false
            });
        }
        embed.addFields({
            name: 'Message',
            value: result.data.message,
            inline: false
        });
    }

    await interaction.reply({ embeds: [embed] });
}

async function handleAnnouncements(interaction) {
    const user = UserModel.findByDiscordId(interaction.user.id);
    if (!user) {
        return interaction.reply({
            content: '❌ User not found in database',
            ephemeral: true
        });
    }

    const userGuild = GuildModel.getUserGuild(user.id);
    if (!userGuild) {
        return interaction.reply({
            content: '❌ You are not in a guild',
            ephemeral: true
        });
    }

    const guild = GuildModel.findById(userGuild.id);
    const announcements = GuildService.getGuildAnnouncements(userGuild.id, 10);

    if (announcements.length === 0) {
        return interaction.reply({
            content: '📭 No announcements to display',
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setColor(config.theme.colors.primary)
        .setTitle(`📢 ${guild.name} Announcements`)
        .setDescription(`Recent guild announcements`);

    // Display announcements
    announcements.forEach((announcement, index) => {
        const date = new Date(announcement.created_at * 1000);
        const timeStr = date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit'
        });

        const fieldTitle = announcement.title || `Announcement #${announcement.id}`;
        const fieldValue = `${announcement.message}\n\n*Posted by ${announcement.author_username} • ${timeStr}*`;

        embed.addFields({
            name: fieldTitle,
            value: fieldValue,
            inline: false
        });
    });

    embed.setFooter({ text: `Showing last ${announcements.length} announcements` });
    embed.setTimestamp();

    await interaction.reply({ embeds: [embed] });
}
