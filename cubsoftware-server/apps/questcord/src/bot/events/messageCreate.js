const { EmbedBuilder, ChannelType } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    once: false,
    async execute(message) {
        if (!message.author || message.author.bot) return;

        if (message.channel.type === ChannelType.DM) {
            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('QuestCord')
                .setDescription(
                    `Thanks for reaching out! I don't handle DMs directly.\n\n` +
                    `If you need assistance or help:\n\n` +
                    `**Join our Discord Server:**\nhttps://discord.gg/ngQXHUbnKg\n\n` +
                    `**Message the Developer:**\nhttps://discord.com/users/523949187663585310`
                )
                .setFooter({ text: 'CUB SOFTWARE' })
                .setTimestamp();

            await message.reply({ embeds: [embed] }).catch(() => {});
        }
    }
};
