const webhookLogger = require('../utils/webhookLogger');

const BOT_START_TIME = Date.now();

module.exports = {
    name: 'clientReady',
    once: true,
    execute(client) {
        const totalMembers = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
        const totalChannels = client.guilds.cache.reduce((a, g) => a + g.channels.cache.size, 0);
        const totalRoles = client.guilds.cache.reduce((a, g) => a + g.roles.cache.size, 0);

        console.log(`[Ready] ${client.user.tag} is online!`);
        console.log(`[Ready] ${client.guilds.cache.size} servers | ${totalMembers} members | ${totalChannels} channels | ${totalRoles} roles | WS ping: ${client.ws.ping}ms`);
        console.log(`[Ready] Commands loaded: ${client.commands.size}`);

        // Stats every 60 seconds
        setInterval(() => {
            const total = client.guilds.cache.reduce((a, g) => a + g.memberCount, 0);
            const channels = client.guilds.cache.reduce((a, g) => a + g.channels.cache.size, 0);
            const uptimeSec = Math.floor((Date.now() - BOT_START_TIME) / 1000);
            const h = Math.floor(uptimeSec / 3600), m = Math.floor((uptimeSec % 3600) / 60), s = uptimeSec % 60;
            const mem = Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
            console.log(`[Stats] ${client.guilds.cache.size} servers | ${total} members | ${channels} channels | ping: ${client.ws.ping}ms | mem: ${mem}MB | uptime: ${h}h${m}m${s}s`);
        }, 60000);

        // Discord.js internal events
        client.on('warn', (msg) => console.log(`[Warn] ${msg}`));
        client.rest.on('rateLimited', (info) => {
            const global = info.global ? ' [GLOBAL]' : '';
            console.log(`[RateLimit]${global} ${info.method} ${info.route} | retry: ${info.retryAfter}ms | limit: ${info.limit}`);
        });

        // Send online notification to Discord webhook
        webhookLogger.logOnline(client);
    }
};
