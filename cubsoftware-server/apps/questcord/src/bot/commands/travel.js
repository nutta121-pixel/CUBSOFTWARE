const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { UserModel, ServerModel } = require('../../database/models');
const config = require('../../../config.json');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('travel')
        .setDescription('Travel to another server to find more quests')
        .addStringOption(option =>
            option.setName('destination')
                .setDescription('Server to travel to (name or ID)')
                .setRequired(false)
                .setAutocomplete(true)
        ),

    async execute(interaction) {
        const user = UserModel.findByDiscordId(interaction.user.id);

        if (!user) {
            return interaction.reply({
                content: '❌ You need to complete a quest first before traveling!',
                ephemeral: true
            });
        }

        const now = Math.floor(Date.now() / 1000);

        // Check if user is currently traveling
        if (user.traveling) {
            const timeLeft = user.travel_arrives_at - now;

            if (timeLeft > 0) {
                const minutes = Math.floor(timeLeft / 60);
                const seconds = timeLeft % 60;

                const embed = new EmbedBuilder()
                    .setColor(config.theme.colors.warning)
                    .setTitle('🚢 Currently Traveling')
                    .setDescription(`You are traveling to **${user.travel_destination}**`)
                    .addFields({
                        name: '⏱️ Time Remaining',
                        value: `${minutes}m ${seconds}s`,
                        inline: true
                    })
                    .setFooter({ text: 'Check back when you arrive!' });

                return interaction.reply({ embeds: [embed], ephemeral: true });
            } else {
                // Travel completed
                UserModel.completeTravel(interaction.user.id);

                const embed = new EmbedBuilder()
                    .setColor(config.theme.colors.success)
                    .setTitle('✅ Journey Complete!')
                    .setDescription(`You have arrived at **${user.travel_destination}**!\n\nUse \`/quests\` to see what adventures await you here.`)
                    .setFooter({ text: 'Welcome to your destination!' });

                return interaction.reply({ embeds: [embed] });
            }
        }

        // Check travel cooldown
        const timeSinceLastTravel = now - (user.last_travel_time || 0);
        const cooldownRemaining = (config.travel.cooldown / 1000) - timeSinceLastTravel;

        if (cooldownRemaining > 0) {
            return interaction.reply({
                content: `⏳ You need to wait ${Math.ceil(cooldownRemaining)}s before traveling again.`,
                ephemeral: true
            });
        }

        // Get available servers (exclude current server)
        const allServers = ServerModel.getOptedInServers();
        const availableServers = allServers.filter(s => s.discord_id !== interaction.guildId);

        if (availableServers.length === 0) {
            return interaction.reply({
                content: '❌ No other servers available to travel to right now!',
                ephemeral: true
            });
        }

        // Get destination from user input or default to QuestCord server
        const destinationInput = interaction.options.getString('destination');
        let destination;

        if (destinationInput) {
            // Try to find by server ID or name
            destination = availableServers.find(s =>
                s.discord_id === destinationInput ||
                s.name.toLowerCase() === destinationInput.toLowerCase()
            );

            if (!destination) {
                return interaction.reply({
                    content: `❌ Server not found. Use autocomplete to see available servers, or enter a valid server ID.`,
                    ephemeral: true
                });
            }
        } else {
            // Default to QuestCord server (support server)
            const questcordServerId = config.supportServer.id;
            destination = availableServers.find(s => s.discord_id === questcordServerId);

            if (!destination) {
                // Fallback to first available server if QuestCord not found
                destination = availableServers[0];
            }
        }

        // Calculate random travel time
        const travelTime = Math.floor(
            Math.random() * (config.travel.maxTravelTime - config.travel.minTravelTime) + config.travel.minTravelTime
        ) / 1000; // Convert to seconds

        const arrivalTime = now + travelTime;

        // Start travel
        UserModel.startTravel(interaction.user.id, destination.name, arrivalTime);

        const minutes = Math.floor(travelTime / 60);
        const seconds = Math.floor(travelTime % 60);

        const embed = new EmbedBuilder()
            .setColor(config.theme.colors.primary)
            .setTitle('🚢 Journey Begun!')
            .setDescription(`You have started traveling to **${destination.name}**`)
            .addFields(
                {
                    name: '⏱️ Travel Time',
                    value: `${minutes}m ${seconds}s`,
                    inline: true
                },
                {
                    name: '📍 Members',
                    value: `${destination.member_count || 0} travelers`,
                    inline: true
                }
            )
            .setFooter({ text: `Use /travel again to check your progress` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused().toLowerCase();

        // Get available servers (exclude current server)
        const allServers = ServerModel.getOptedInServers();
        const availableServers = allServers.filter(s => s.discord_id !== interaction.guildId);

        // Filter servers by user input
        const filtered = availableServers.filter(server =>
            server.name.toLowerCase().includes(focusedValue) ||
            server.discord_id.includes(focusedValue)
        );

        // Return up to 25 choices (Discord limit)
        const choices = filtered.slice(0, 25).map(server => ({
            name: `${server.name} (${server.member_count || 0} members)`,
            value: server.discord_id
        }));

        await interaction.respond(choices);
    }
};
