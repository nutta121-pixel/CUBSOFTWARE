const { GlobalStatsModel } = require('../../database/models');
const { debugLogger } = require('../../utils/debugLogger');

module.exports = {
    name: 'guildDelete',
    async execute(guild) {
        console.log(`Left server: ${guild.name} (${guild.id})`);

        const totalServers = guild.client.guilds.cache.size;
        GlobalStatsModel.updateServerCount(totalServers);

        await debugLogger.warn('GUILD', `Left server: ${guild.name}`, {
            serverId: guild.id,
            serverName: guild.name,
            totalServers: totalServers
        });
    }
};
