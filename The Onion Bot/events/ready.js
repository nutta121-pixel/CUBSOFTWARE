const webhookLogger = require('../utils/webhookLogger');

module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`[READY] Bot is online as ${client.user.tag}`);
        console.log(`[READY] Serving ${client.guilds.cache.size} guild(s)`);

        // Send online notification to Discord webhook
        webhookLogger.logOnline(client);
    }
};
