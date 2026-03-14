const { ServerModel, GlobalStatsModel } = require('../../database/models');
const { debugLogger } = require('../../utils/debugLogger');

module.exports = {
    name: 'guildCreate',
    async execute(guild) {
        console.log(`Joined new server: ${guild.name} (${guild.id})`);

        ServerModel.create(guild.id, guild.name, guild.memberCount);

        const totalServers = guild.client.guilds.cache.size;
        GlobalStatsModel.updateServerCount(totalServers);

        await debugLogger.success('GUILD', `Joined new server: ${guild.name}`, {
            serverId: guild.id,
            serverName: guild.name,
            memberCount: guild.memberCount,
            totalServers: totalServers
        });
    }
};
