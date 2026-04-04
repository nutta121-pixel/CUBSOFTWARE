const webhookLogger = require('../utils/webhookLogger');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
        console.log(`[Ready] Bot is online as ${client.user.tag}`);
        console.log(`[Stats] ${client.guilds.cache.size} servers, ${totalMembers} total members`);

        // Send online notification to Discord webhook
        webhookLogger.logOnline(client);
    }
};
