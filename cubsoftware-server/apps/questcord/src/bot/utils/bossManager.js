const { BossModel, ServerModel, GlobalStatsModel } = require('../../database/models');
const { getRandomBoss } = require('./questData');
const { EmbedBuilder } = require('discord.js');
const config = require('../../../config.json');
const { debugLogger } = require('../../utils/debugLogger');

class BossManager {
    static bossSpawnTimer = null;

    static initialize(client) {
        this.client = client;
        this.scheduleNextBoss();
        this.startNotificationUpdater();
        console.log('Boss spawning system initialized');
    }

    static async scheduleNextBoss() {
        // Get active boss before cleanup to check if it expired
        const activeBoss = BossModel.getActiveBoss();
        const now = Math.floor(Date.now() / 1000);

        // Check if there's an active boss that is about to expire
        if (activeBoss && activeBoss.expires_at <= now && !activeBoss.defeated) {
            // Boss expired without being defeated - announce despawn
            await this.announceBossDespawn(activeBoss.id);
        }

        BossModel.cleanupExpired();

        const currentActiveBoss = BossModel.getActiveBoss();
        if (currentActiveBoss) {
            const timeRemaining = (currentActiveBoss.expires_at * 1000) - Date.now();
            if (timeRemaining > 0) {
                setTimeout(() => this.scheduleNextBoss(), timeRemaining + config.boss.cooldownDuration);
                console.log(`Active boss found. Next check in ${Math.round(timeRemaining / 60000)} minutes`);
                return;
            }
        }

        const stats = GlobalStatsModel.get();
        const timeSinceLastBoss = now - (stats.last_boss_spawn || 0);

        if (timeSinceLastBoss < (config.boss.cooldownDuration / 1000)) {
            const waitTime = (config.boss.cooldownDuration / 1000) - timeSinceLastBoss;
            setTimeout(() => this.scheduleNextBoss(), waitTime * 1000);
            console.log(`Boss cooldown active. Next spawn check in ${Math.round(waitTime / 60)} minutes`);
            return;
        }

        const delay = Math.random() * (config.boss.maxSpawnDelay - config.boss.minSpawnDelay) + config.boss.minSpawnDelay;

        this.bossSpawnTimer = setTimeout(() => {
            this.spawnBoss();
        }, delay);

        console.log(`Next boss will spawn in approximately ${Math.round(delay / 60000)} minutes`);
    }

    static async spawnBoss() {
        try {
            const servers = ServerModel.getOptedInServers();
            if (servers.length === 0) {
                console.log('No opted-in servers available for boss spawn');
                this.scheduleNextBoss();
                return;
            }

            const randomServer = servers[Math.floor(Math.random() * servers.length)];
            const bossTemplate = getRandomBoss();

            const expiresAt = Math.floor(Date.now() / 1000) + (config.boss.spawnDuration / 1000);

            const result = BossModel.create(
                bossTemplate.type,
                bossTemplate.name,
                randomServer.discord_id,
                bossTemplate.health,
                bossTemplate.rewardCurrency,
                bossTemplate.rewardGems,
                expiresAt
            );

            const now = Math.floor(Date.now() / 1000);
            GlobalStatsModel.updateLastBossSpawn(now);

            console.log(`Boss spawned: ${bossTemplate.name} in server ${randomServer.name}`);

            await debugLogger.success('BOSS', `Boss spawned: ${bossTemplate.name}`, {
                bossId: result.lastInsertRowid,
                bossName: bossTemplate.name,
                server: randomServer.name,
                serverId: randomServer.id,
                health: bossTemplate.health
            });

            this.announceBossSpawn(randomServer, bossTemplate, result.lastInsertRowid);

            setTimeout(() => this.scheduleNextBoss(), config.boss.spawnDuration + config.boss.cooldownDuration);
        } catch (error) {
            console.error('Error spawning boss:', error);
            this.scheduleNextBoss();
        }
    }

    static async announceBossSpawn(server, bossTemplate, bossId) {
        try {
            // Specific announcement channel (CUB SOFTWARE server)
            const ANNOUNCEMENT_CHANNEL_ID = '1466194334876700725';
            const BOSS_ROLE_ID = '1466196380023394336';

            const announcementChannel = this.client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
            if (!announcementChannel) {
                console.error('Boss announcement channel not found');
                return;
            }

            const guild = this.client.guilds.cache.get(server.discord_id);
            if (!guild) return;

            // Get server icon
            const serverIcon = guild.iconURL({ size: 256, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

            // Calculate time remaining (60 minutes)
            const minutesRemaining = Math.floor(config.boss.spawnDuration / 60000);

            // Create embed with custom header
            const embed = new EmbedBuilder()
                .setColor('#FF6B35')
                .setAuthor({ name: '╭───𒌋𒀖 「🜲・Boss Notification」' })
                .setTitle(`🔥 NEW BOSS ALERT 🔥`)
                .setDescription(`⚔️ **${bossTemplate.name} has spawned!**\nA Tier ${bossTemplate.tier} ${bossTemplate.rarity} boss has emerged and threatens the realm!`)
                .addFields(
                    {
                        name: '💀 Boss Info',
                        value: `**HP:** ${bossTemplate.health.toLocaleString()}\n**Type:** ${bossTemplate.rarity} (Tier ${bossTemplate.tier})\n**Biome:** ${bossTemplate.biome}`,
                        inline: false
                    },
                    {
                        name: '📍 Location',
                        value: `**${server.name}**`,
                        inline: true
                    },
                    {
                        name: '🌐 Visit Website',
                        value: '[questcord.fun](https://questcord.fun)',
                        inline: true
                    },
                    {
                        name: '⏰ Time Left',
                        value: `${minutesRemaining}m`,
                        inline: true
                    },
                    {
                        name: '⚔️ How to Fight',
                        value: `• Join the server where the boss spawned\n• Use \`/boss attack\` to deal damage\n• Work together with other players!\n• Defeat it for valuable rewards`,
                        inline: false
                    },
                    {
                        name: '🚀 How to Travel',
                        value: `Use the \`/travel\` command with the QuestCord bot to see available destinations and travel to **${server.name}**!`,
                        inline: false
                    }
                )
                .setThumbnail(serverIcon)
                .setFooter({ text: `Boss spawned on server • ${server.name}` })
                .setTimestamp();

            // Send announcement with role ping
            const message = await announcementChannel.send({
                content: `<@&${BOSS_ROLE_ID}>`,
                embeds: [embed]
            });

            // Store message ID and channel ID in database
            BossModel.setAnnouncementMessage(bossId, message.id, ANNOUNCEMENT_CHANNEL_ID);

            console.log(`Boss announcement sent to channel ${ANNOUNCEMENT_CHANNEL_ID}`);
        } catch (error) {
            console.error('Error announcing boss spawn:', error);
        }
    }

    static getBossStatus(boss) {
        const healthPercent = Math.round((boss.health / boss.max_health) * 100);
        const timeRemaining = boss.expires_at - Math.floor(Date.now() / 1000);
        const minutesRemaining = Math.max(0, Math.round(timeRemaining / 60));

        return {
            healthPercent,
            minutesRemaining,
            isAlive: boss.health > 0 && !boss.defeated
        };
    }

    static async updateBossNotification() {
        try {
            const boss = BossModel.getActiveBossWithAnnouncement();
            if (!boss) return;

            const channel = this.client.channels.cache.get(boss.announcement_channel_id);
            if (!channel) return;

            const message = await channel.messages.fetch(boss.announcement_message_id);
            if (!message) return;

            const { ServerModel: SM } = require('../../database/models');
            const server = SM.findByDiscordId(boss.server_id);
            if (!server) return;

            const guild = this.client.guilds.cache.get(server.discord_id);
            if (!guild) return;

            const serverIcon = guild.iconURL({ size: 256, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

            const timeRemaining = boss.expires_at - Math.floor(Date.now() / 1000);
            const minutesRemaining = Math.max(0, Math.round(timeRemaining / 60));
            const healthPercent = Math.round((boss.health / boss.max_health) * 100);

            const embed = new EmbedBuilder()
                .setColor('#FF6B35')
                .setAuthor({ name: '╭───𒌋𒀖 「🜲・Boss Notification」' })
                .setTitle(`🔥 NEW BOSS ALERT 🔥`)
                .setDescription(`⚔️ **${boss.boss_name} has spawned!**\nA ${boss.boss_type} boss has emerged and threatens the realm!`)
                .addFields(
                    {
                        name: '💀 Boss Info',
                        value: `**HP:** ${boss.health.toLocaleString()} / ${boss.max_health.toLocaleString()} (${healthPercent}%)\n**Type:** ${boss.boss_type}`,
                        inline: false
                    },
                    {
                        name: '📍 Location',
                        value: `**${server.name}**`,
                        inline: true
                    },
                    {
                        name: '🌐 Visit Website',
                        value: '[questcord.fun](https://questcord.fun)',
                        inline: true
                    },
                    {
                        name: '⏰ Time Left',
                        value: `${minutesRemaining}m`,
                        inline: true
                    },
                    {
                        name: '⚔️ How to Fight',
                        value: `• Join the server where the boss spawned\n• Use \`/boss attack\` to deal damage\n• Work together with other players!\n• Defeat it for valuable rewards`,
                        inline: false
                    },
                    {
                        name: '🚀 How to Travel',
                        value: `Use the \`/travel\` command with the QuestCord bot to see available destinations and travel to **${server.name}**!`,
                        inline: false
                    }
                )
                .setThumbnail(serverIcon)
                .setFooter({ text: `Boss spawned on server • ${server.name}` })
                .setTimestamp();

            await message.edit({ embeds: [embed] });
            console.log(`Boss notification updated for ${boss.boss_name}`);
        } catch (error) {
            console.error('Error updating boss notification:', error);
        }
    }

    static async announceBossDefeat(bossId) {
        try {
            const boss = BossModel.findById(bossId);
            if (!boss || !boss.announcement_message_id) return;

            const channel = this.client.channels.cache.get(boss.announcement_channel_id);
            if (!channel) return;

            const message = await channel.messages.fetch(boss.announcement_message_id);
            if (!message) return;

            const { ServerModel: SM, BossParticipantModel } = require('../../database/models');
            const server = SM.findByDiscordId(boss.server_id);
            if (!server) return;

            const guild = this.client.guilds.cache.get(server.discord_id);
            if (!guild) return;

            const serverIcon = guild.iconURL({ size: 256, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

            // Get top 3 participants
            const participants = BossParticipantModel.getParticipants(bossId);
            const top3 = participants.slice(0, 3);

            let leaderboardText = '';
            top3.forEach((participant, index) => {
                const medal = ['🥇', '🥈', '🥉'][index];
                const rewardMultiplier = index === 0 ? 1.5 : 1;
                const currencyReward = Math.floor(boss.reward_currency * rewardMultiplier);
                const gemReward = Math.floor(boss.reward_gems * rewardMultiplier);

                leaderboardText += `${medal} **${participant.username}**\n`;
                leaderboardText += `   └ Damage: ${participant.damage_dealt.toLocaleString()} | Rewards: ${currencyReward.toLocaleString()} coins, ${gemReward} gems\n`;
            });

            // Add "and X more users" if there are more than 3 participants
            if (participants.length > 3) {
                const remainingCount = participants.length - 3;
                leaderboardText += `\n+${remainingCount} more ${remainingCount === 1 ? 'user' : 'users'}`;
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setAuthor({ name: '╭───𒌋𒀖 「🜲・Boss Notification」' })
                .setTitle(`✅ BOSS DEFEATED!`)
                .setDescription(`⚔️ **${boss.boss_name} has been defeated!**\nThe realm is safe once again!`)
                .addFields(
                    {
                        name: '🏆 Top 3 Warriors',
                        value: leaderboardText || 'No participants',
                        inline: false
                    },
                    {
                        name: '📍 Location',
                        value: `**${server.name}**`,
                        inline: true
                    },
                    {
                        name: '👥 Total Participants',
                        value: `${participants.length}`,
                        inline: true
                    },
                    {
                        name: '⏱️ Defeated At',
                        value: `<t:${boss.defeated_at}:R>`,
                        inline: true
                    }
                )
                .setThumbnail(serverIcon)
                .setFooter({ text: `Boss defeated on server • ${server.name}` })
                .setTimestamp();

            await message.edit({ content: null, embeds: [embed] });
            console.log(`Boss defeat notification sent for ${boss.boss_name}`);

            // Delete the message after 5 minutes
            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`Boss defeat notification deleted for ${boss.boss_name}`);
                } catch (err) {
                    console.error('Error deleting boss defeat notification:', err);
                }
            }, 5 * 60 * 1000);
        } catch (error) {
            console.error('Error announcing boss defeat:', error);
        }
    }

    static async announceBossDespawn(bossId) {
        try {
            const boss = BossModel.findById(bossId);
            if (!boss || !boss.announcement_message_id) return;

            const channel = this.client.channels.cache.get(boss.announcement_channel_id);
            if (!channel) return;

            const message = await channel.messages.fetch(boss.announcement_message_id);
            if (!message) return;

            const { ServerModel: SM, BossParticipantModel } = require('../../database/models');
            const server = SM.findByDiscordId(boss.server_id);
            const participants = BossParticipantModel.getParticipants(bossId);

            await debugLogger.warn('BOSS', `Boss despawned: ${boss.boss_name}`, {
                bossId: boss.id,
                bossName: boss.boss_name,
                healthRemaining: boss.health,
                totalParticipants: participants.length,
                server: server ? server.name : 'Unknown'
            });
            if (!server) return;

            const guild = this.client.guilds.cache.get(server.discord_id);
            if (!guild) return;

            const serverIcon = guild.iconURL({ size: 256, extension: 'png' }) || 'https://cdn.discordapp.com/embed/avatars/0.png';

            // Get top 3 participants who fought but failed to defeat the boss
            const top3 = participants.slice(0, 3);

            const healthPercent = Math.round((boss.health / boss.max_health) * 100);

            let leaderboardText = '';
            if (top3.length > 0) {
                top3.forEach((participant, index) => {
                    const medal = ['🥇', '🥈', '🥉'][index];
                    leaderboardText += `${medal} **${participant.username}**\n`;
                    leaderboardText += `   └ Damage Dealt: ${participant.damage_dealt.toLocaleString()} (${participant.attacks} attacks)\n`;
                });

                // Add "and X more users" if there are more than 3 participants
                if (participants.length > 3) {
                    const remainingCount = participants.length - 3;
                    leaderboardText += `\n+${remainingCount} more ${remainingCount === 1 ? 'user' : 'users'}`;
                }
            } else {
                leaderboardText = 'No one fought this boss';
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setAuthor({ name: '╭───𒌋𒀖 「🜲・Boss Notification」' })
                .setTitle(`⏰ BOSS DESPAWNED!`)
                .setDescription(`💨 **${boss.boss_name} has despawned!**\nThe boss escaped as time ran out!`)
                .addFields(
                    {
                        name: '⚔️ Top 3 Fighters',
                        value: leaderboardText,
                        inline: false
                    },
                    {
                        name: '💀 Boss Status',
                        value: `HP: ${boss.health.toLocaleString()} / ${boss.max_health.toLocaleString()} (${healthPercent}% remaining)`,
                        inline: false
                    },
                    {
                        name: '📍 Location',
                        value: `**${server.name}**`,
                        inline: true
                    },
                    {
                        name: '👥 Total Fighters',
                        value: `${participants.length}`,
                        inline: true
                    },
                    {
                        name: '❌ Reason',
                        value: 'Time expired',
                        inline: true
                    }
                )
                .setThumbnail(serverIcon)
                .setFooter({ text: `Boss despawned on server • ${server.name}` })
                .setTimestamp();

            await message.edit({ content: null, embeds: [embed] });
            console.log(`Boss despawn notification sent for ${boss.boss_name}`);

            // Delete the message after 5 minutes
            setTimeout(async () => {
                try {
                    await message.delete();
                    console.log(`Boss despawn notification deleted for ${boss.boss_name}`);
                } catch (err) {
                    console.error('Error deleting boss despawn notification:', err);
                }
            }, 5 * 60 * 1000);
        } catch (error) {
            console.error('Error announcing boss despawn:', error);
        }
    }

    static startNotificationUpdater() {
        // Update boss notification every minute for more accurate time display
        setInterval(() => {
            this.updateBossNotification();
        }, 60 * 1000); // 1 minute in milliseconds

        // Schedule hourly cleanup on the hour (1:00, 2:00, etc.)
        this._scheduleHourlyCleanup();

        console.log('Boss notification updater started');
    }

    static _scheduleHourlyCleanup() {
        const now = new Date();
        const nextHour = new Date(now);
        nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
        const msUntilNextHour = nextHour.getTime() - now.getTime();

        setTimeout(() => {
            this._cleanupOldNotifications();
            setInterval(() => this._cleanupOldNotifications(), 60 * 60 * 1000);
        }, msUntilNextHour);

        console.log(`Boss notification cleanup scheduled for ${nextHour.toLocaleTimeString()} and every hour after`);
    }

    static async _cleanupOldNotifications() {
        try {
            const ANNOUNCEMENT_CHANNEL_ID = '1466194334876700725';
            const channel = this.client.channels.cache.get(ANNOUNCEMENT_CHANNEL_ID);
            if (!channel) return;

            // Fetch recent messages and delete any boss notifications older than 1 hour
            const messages = await channel.messages.fetch({ limit: 50 });
            const oneHourAgo = Date.now() - (60 * 60 * 1000);

            for (const [, message] of messages) {
                if (message.author.id === this.client.user.id &&
                    message.embeds.length > 0 &&
                    message.embeds[0].author?.name?.includes('Boss Notification') &&
                    message.createdTimestamp < oneHourAgo) {
                    try {
                        await message.delete();
                        console.log('Deleted old boss notification');
                    } catch (err) {
                        // Message may already be deleted
                    }
                }
            }
        } catch (error) {
            console.error('Error cleaning up old boss notifications:', error);
        }
    }
}

module.exports = { BossManager };
