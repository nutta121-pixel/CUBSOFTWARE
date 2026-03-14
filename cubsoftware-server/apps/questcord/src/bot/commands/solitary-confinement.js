const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const { db } = require('../../database/schema');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('solitary-confinement')
        .setDescription('Lock a user to a specific voice channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to confine')
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The voice channel to lock them to')
                .addChannelTypes(ChannelType.GuildVoice)
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('duration')
                .setDescription('Duration (e.g., 30m, 2h, 1d)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName('reason')
                .setDescription('Reason for confinement')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        // Permission check
        if (!interaction.memberPermissions.has(PermissionFlagsBits.Administrator)) {
            return interaction.editReply({
                content: '❌ Only administrators can use this command.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('user');
        const targetChannel = interaction.options.getChannel('channel');
        const durationStr = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // Check if target is the bot owner
        if (targetUser.id === process.env.OWNER_ID) {
            return interaction.editReply({
                content: '❌ The bot owner cannot be confined to solitary confinement.',
                ephemeral: true
            });
        }

        // Validate channel is a voice channel
        if (targetChannel.type !== 2) { // 2 = VoiceChannel
            return interaction.editReply({
                content: '❌ The selected channel must be a voice channel.',
                ephemeral: true
            });
        }

        // Parse duration
        const duration = parseDuration(durationStr);
        if (!duration) {
            return interaction.editReply({
                content: '❌ Invalid duration format. Use formats like: 30m, 2h, 1d',
                ephemeral: true
            });
        }

        // Calculate expiration time
        const expiresAt = Math.floor(Date.now() / 1000) + duration;

        try {
            // Check if user already has an active confinement
            const existing = db.prepare('SELECT * FROM solitary_confinement WHERE user_id = ? AND server_id = ? AND active = 1').get(
                targetUser.id,
                interaction.guild.id
            );

            if (existing) {
                // Update existing confinement
                db.prepare(`
                    UPDATE solitary_confinement
                    SET channel_id = ?, expires_at = ?, reason = ?, moderator_id = ?, created_at = strftime('%s', 'now')
                    WHERE id = ?
                `).run(
                    targetChannel.id,
                    expiresAt,
                    reason,
                    interaction.user.id,
                    existing.id
                );
            } else {
                // Create new confinement
                db.prepare(`
                    INSERT INTO solitary_confinement (user_id, server_id, channel_id, moderator_id, reason, expires_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                    targetUser.id,
                    interaction.guild.id,
                    targetChannel.id,
                    interaction.user.id,
                    reason,
                    expiresAt
                );
            }

            // If user is in a voice channel, move them to the confinement channel
            const member = await interaction.guild.members.fetch(targetUser.id);
            if (member.voice.channel && member.voice.channel.id !== targetChannel.id) {
                try {
                    await member.voice.setChannel(targetChannel, `Solitary confinement by ${interaction.user.tag}`);
                } catch (error) {
                    console.error('Error moving user to confinement channel:', error);
                }
            }

            // Create confirmation embed
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🔒 Solitary Confinement Activated')
                .setDescription(`${targetUser} has been confined to ${targetChannel}`)
                .addFields(
                    { name: 'Duration', value: formatDuration(duration), inline: true },
                    { name: 'Expires', value: `<t:${expiresAt}:R>`, inline: true },
                    { name: 'Moderator', value: interaction.user.tag, inline: true },
                    { name: 'Reason', value: reason, inline: false }
                )
                .setFooter({ text: 'User will be automatically moved if they try to join other channels' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error creating solitary confinement:', error);
            return interaction.editReply({
                content: '❌ An error occurred while creating the confinement.',
                ephemeral: true
            });
        }
    }
};

/**
 * Parse duration string (e.g., "30m", "2h", "1d") into seconds
 */
function parseDuration(durationStr) {
    const match = durationStr.match(/^(\d+)([mhd])$/i);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    const multipliers = {
        'm': 60,           // minutes
        'h': 60 * 60,      // hours
        'd': 60 * 60 * 24  // days
    };

    return value * multipliers[unit];
}

/**
 * Format duration seconds into human-readable string
 */
function formatDuration(seconds) {
    const days = Math.floor(seconds / (60 * 60 * 24));
    const hours = Math.floor((seconds % (60 * 60 * 24)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);

    const parts = [];
    if (days > 0) parts.push(`${days} day${days > 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? 's' : ''}`);
    if (minutes > 0) parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);

    return parts.join(', ') || '0 minutes';
}
