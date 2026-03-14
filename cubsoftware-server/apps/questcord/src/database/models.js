const { db } = require('./schema');

class UserModel {
    static create(discordId, username) {
        const stmt = db.prepare(`
            INSERT INTO users (discord_id, username)
            VALUES (?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                username = excluded.username,
                updated_at = strftime('%s', 'now')
        `);
        return stmt.run(discordId, username);
    }

    static findByDiscordId(discordId) {
        const stmt = db.prepare('SELECT * FROM users WHERE discord_id = ?');
        return stmt.get(discordId);
    }

    static findById(userId) {
        const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(userId);
    }

    static updateCurrency(discordId, amount) {
        const stmt = db.prepare('UPDATE users SET currency = currency + ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(amount, discordId);
    }

    static updateGems(discordId, amount) {
        const stmt = db.prepare('UPDATE users SET gems = gems + ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(amount, discordId);
    }

    static incrementQuestCount(discordId) {
        const stmt = db.prepare('UPDATE users SET total_quests = total_quests + 1, quests_completed = quests_completed + 1, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(discordId);
    }

    static incrementBossesDefeated(discordId) {
        const stmt = db.prepare('UPDATE users SET bosses_defeated = bosses_defeated + 1, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(discordId);
    }

    static updateCurrentServer(discordId, serverId) {
        const stmt = db.prepare('UPDATE users SET current_server_id = ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(serverId, discordId);
    }

    static getAll() {
        const stmt = db.prepare('SELECT * FROM users');
        return stmt.all();
    }

    static updateLevel(discordId, level, experience, totalExperience) {
        const stmt = db.prepare('UPDATE users SET level = ?, experience = ?, total_experience = ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(level, experience, totalExperience, discordId);
    }

    static addExperience(discordId, exp) {
        const stmt = db.prepare('UPDATE users SET experience = experience + ?, total_experience = total_experience + ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(exp, exp, discordId);
    }

    static startTravel(discordId, destination, arrivalTime) {
        const stmt = db.prepare('UPDATE users SET traveling = 1, travel_destination = ?, travel_arrives_at = ?, last_travel_time = strftime(\'%s\', \'now\'), updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(destination, arrivalTime, discordId);
    }

    static completeTravel(discordId) {
        const stmt = db.prepare('UPDATE users SET traveling = 0, travel_destination = NULL, travel_arrives_at = NULL, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(discordId);
    }

    static updateLastQuestTime(discordId) {
        const stmt = db.prepare('UPDATE users SET last_quest_time = strftime(\'%s\', \'now\'), updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(discordId);
    }

    static updateProfile(discordId, updates) {
        const allowedFields = ['profile_bio', 'profile_banner', 'vanity_url', 'avatar_hash'];
        const fields = [];
        const values = [];

        // Only update allowed fields
        for (const [key, value] of Object.entries(updates)) {
            if (allowedFields.includes(key)) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }

        if (fields.length === 0) {
            return { changes: 0 };
        }

        // Add updated_at
        fields.push('updated_at = strftime(\'%s\', \'now\')');

        // Add discord_id to values array
        values.push(discordId);

        const stmt = db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE discord_id = ?`);
        return stmt.run(...values);
    }

    static findByVanityUrl(vanityUrl) {
        const stmt = db.prepare('SELECT * FROM users WHERE vanity_url = ? COLLATE NOCASE');
        return stmt.get(vanityUrl);
    }

    static findByIdentifier(identifier) {
        // Try to find by vanity URL first, then fall back to discord_id
        let user = this.findByVanityUrl(identifier);
        if (!user) {
            user = this.findByDiscordId(identifier);
        }
        return user;
    }
}

class ServerModel {
    static create(discordId, name, memberCount = 0) {
        const stmt = db.prepare(`
            INSERT INTO servers (discord_id, name, member_count)
            VALUES (?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                name = excluded.name,
                member_count = excluded.member_count,
                updated_at = strftime('%s', 'now')
        `);
        return stmt.run(discordId, name, memberCount);
    }

    static findByDiscordId(discordId) {
        const stmt = db.prepare('SELECT * FROM servers WHERE discord_id = ?');
        return stmt.get(discordId);
    }

    static updateOptIn(discordId, optedIn) {
        const stmt = db.prepare('UPDATE servers SET opted_in = ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(optedIn ? 1 : 0, discordId);
    }

    static getOptedInServers() {
        const stmt = db.prepare('SELECT * FROM servers WHERE opted_in = 1');
        return stmt.all();
    }

    static updateMemberCount(discordId, count) {
        const stmt = db.prepare('UPDATE servers SET member_count = ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(count, discordId);
    }

    static incrementQuestCount(discordId) {
        const stmt = db.prepare('UPDATE servers SET total_quests_completed = total_quests_completed + 1, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(discordId);
    }

    static getAll() {
        const stmt = db.prepare('SELECT * FROM servers');
        return stmt.all();
    }
}

class QuestModel {
    static create(serverId, questType, questName, description, rewardCurrency, rewardGems, difficulty, expiresAt) {
        const assignedDate = new Date().toISOString().split('T')[0];
        const stmt = db.prepare(`
            INSERT INTO quests (server_id, quest_type, quest_name, description, reward_currency, reward_gems, difficulty, assigned_date, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(serverId, questType, questName, description, rewardCurrency, rewardGems, difficulty, assignedDate, expiresAt);
    }

    static getActiveQuestsByServer(serverId) {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('SELECT * FROM quests WHERE server_id = ? AND expires_at > ?');
        return stmt.all(serverId, now);
    }

    static deleteExpired() {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('DELETE FROM quests WHERE expires_at <= ?');
        return stmt.run(now);
    }

    static deleteByDate(date) {
        const stmt = db.prepare('DELETE FROM quests WHERE assigned_date = ?');
        return stmt.run(date);
    }

    static findById(questId) {
        const stmt = db.prepare('SELECT * FROM quests WHERE id = ?');
        return stmt.get(questId);
    }
}

class UserQuestModel {
    static assignQuest(userId, questId) {
        const stmt = db.prepare(`
            INSERT INTO user_quests (user_id, quest_id)
            VALUES (?, ?)
            ON CONFLICT(user_id, quest_id) DO NOTHING
        `);
        return stmt.run(userId, questId);
    }

    static completeQuest(userId, questId) {
        const stmt = db.prepare(`
            UPDATE user_quests
            SET completed = 1, completed_at = strftime('%s', 'now')
            WHERE user_id = ? AND quest_id = ?
        `);
        return stmt.run(userId, questId);
    }

    static failQuest(userId, questId) {
        const stmt = db.prepare(`
            UPDATE user_quests
            SET failed = 1
            WHERE user_id = ? AND quest_id = ?
        `);
        return stmt.run(userId, questId);
    }

    static updateProgress(userId, questId, progress) {
        const stmt = db.prepare('UPDATE user_quests SET progress = ? WHERE user_id = ? AND quest_id = ?');
        return stmt.run(progress, userId, questId);
    }

    static getUserQuests(userId, serverId = null) {
        let query = `
            SELECT uq.*, q.*
            FROM user_quests uq
            JOIN quests q ON uq.quest_id = q.id
            WHERE uq.user_id = ?
        `;
        const params = [userId];

        if (serverId) {
            query += ' AND q.server_id = ?';
            params.push(serverId);
        }

        const stmt = db.prepare(query);
        return stmt.all(...params);
    }

    static getCompletedCount(userId, serverId) {
        const stmt = db.prepare(`
            SELECT COUNT(*) as count
            FROM user_quests uq
            JOIN quests q ON uq.quest_id = q.id
            WHERE uq.user_id = ? AND q.server_id = ? AND uq.completed = 1
        `);
        return stmt.get(userId, serverId)?.count || 0;
    }
}

class BossModel {
    static create(bossType, bossName, serverId, maxHealth, rewardCurrency, rewardGems, expiresAt) {
        const stmt = db.prepare(`
            INSERT INTO bosses (boss_type, boss_name, server_id, health, max_health, reward_currency, reward_gems, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(bossType, bossName, serverId, maxHealth, maxHealth, rewardCurrency, rewardGems, expiresAt);
    }

    static getActiveBoss() {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('SELECT * FROM bosses WHERE defeated = 0 AND expires_at > ? ORDER BY spawned_at DESC LIMIT 1');
        return stmt.get(now);
    }

    static dealDamage(bossId, damage) {
        const stmt = db.prepare('UPDATE bosses SET health = MAX(0, health - ?) WHERE id = ?');
        return stmt.run(damage, bossId);
    }

    static defeatBoss(bossId) {
        const stmt = db.prepare('UPDATE bosses SET defeated = 1, defeated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(bossId);
    }

    static findById(bossId) {
        const stmt = db.prepare('SELECT * FROM bosses WHERE id = ?');
        return stmt.get(bossId);
    }

    static cleanupExpired() {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('UPDATE bosses SET defeated = 1 WHERE defeated = 0 AND expires_at <= ?');
        return stmt.run(now);
    }

    static setAnnouncementMessage(bossId, messageId, channelId) {
        const stmt = db.prepare('UPDATE bosses SET announcement_message_id = ?, announcement_channel_id = ? WHERE id = ?');
        return stmt.run(messageId, channelId, bossId);
    }

    static getActiveBossWithAnnouncement() {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(`
            SELECT * FROM bosses
            WHERE defeated = 0
            AND expires_at > ?
            AND announcement_message_id IS NOT NULL
            ORDER BY spawned_at DESC
            LIMIT 1
        `);
        return stmt.get(now);
    }
}

class BossParticipantModel {
    static addParticipant(bossId, userId) {
        const stmt = db.prepare(`
            INSERT INTO boss_participants (boss_id, user_id)
            VALUES (?, ?)
            ON CONFLICT(boss_id, user_id) DO NOTHING
        `);
        return stmt.run(bossId, userId);
    }

    static addDamage(bossId, userId, damage) {
        const stmt = db.prepare(`
            INSERT INTO boss_participants (boss_id, user_id, damage_dealt, attacks)
            VALUES (?, ?, ?, 1)
            ON CONFLICT(boss_id, user_id) DO UPDATE SET
                damage_dealt = damage_dealt + excluded.damage_dealt,
                attacks = attacks + 1
        `);
        return stmt.run(bossId, userId, damage);
    }

    static getParticipants(bossId) {
        const stmt = db.prepare(`
            SELECT bp.*, u.username, u.discord_id
            FROM boss_participants bp
            JOIN users u ON bp.user_id = u.id
            WHERE bp.boss_id = ?
            ORDER BY bp.damage_dealt DESC
        `);
        return stmt.all(bossId);
    }

    static getTopDamageDealer(bossId) {
        const stmt = db.prepare(`
            SELECT bp.*, u.username, u.discord_id
            FROM boss_participants bp
            JOIN users u ON bp.user_id = u.id
            WHERE bp.boss_id = ?
            ORDER BY bp.damage_dealt DESC
            LIMIT 1
        `);
        return stmt.get(bossId);
    }
}

class LeaderboardModel {
    static updateScore(userId, points, month, year) {
        const stmt = db.prepare(`
            INSERT INTO leaderboard (user_id, score, month, year)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, month, year) DO UPDATE SET
                score = score + excluded.score,
                updated_at = strftime('%s', 'now')
        `);
        return stmt.run(userId, points, month, year);
    }

    static getTopPlayers(month, year, limit = 10) {
        const stmt = db.prepare(`
            SELECT l.*, u.username, u.discord_id
            FROM leaderboard l
            JOIN users u ON l.user_id = u.id
            WHERE l.month = ? AND l.year = ?
            ORDER BY l.score DESC
            LIMIT ?
        `);
        return stmt.all(month, year, limit);
    }

    static resetLeaderboard(month, year) {
        const stmt = db.prepare('DELETE FROM leaderboard WHERE month = ? AND year = ?');
        return stmt.run(month, year);
    }

    static getUserRank(userId, month, year) {
        const stmt = db.prepare(`
            SELECT COUNT(*) + 1 as rank
            FROM leaderboard l1
            JOIN leaderboard l2 ON l1.month = l2.month AND l1.year = l2.year
            WHERE l1.user_id = ? AND l1.month = ? AND l1.year = ? AND l2.score > l1.score
        `);
        return stmt.get(userId, month, year)?.rank || null;
    }
}

class ActivityLogModel {
    static log(userId, username, action, details = null) {
        const stmt = db.prepare('INSERT INTO activity_log (user_id, username, action, details) VALUES (?, ?, ?, ?)');
        return stmt.run(userId, username, action, details);
    }

    static getRecent(limit = 50) {
        const stmt = db.prepare(`
            SELECT
                al.id,
                al.user_id,
                COALESCE(u.username, al.username) as username,
                al.action,
                al.details,
                al.timestamp
            FROM activity_log al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.timestamp DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    static cleanup(olderThanDays = 7) {
        const cutoff = Math.floor(Date.now() / 1000) - (olderThanDays * 24 * 60 * 60);
        const stmt = db.prepare('DELETE FROM activity_log WHERE timestamp < ?');
        return stmt.run(cutoff);
    }
}

class StaffModel {
    static add(discordId, username, role, avatarUrl = null) {
        const stmt = db.prepare(`
            INSERT INTO staff (discord_id, username, role, avatar_url)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE SET
                username = excluded.username,
                role = excluded.role,
                avatar_url = excluded.avatar_url
        `);
        return stmt.run(discordId, username, role, avatarUrl);
    }

    static remove(discordId) {
        const stmt = db.prepare('DELETE FROM staff WHERE discord_id = ?');
        return stmt.run(discordId);
    }

    static findByDiscordId(discordId) {
        const stmt = db.prepare('SELECT * FROM staff WHERE discord_id = ?');
        return stmt.get(discordId);
    }

    static getAll() {
        const stmt = db.prepare('SELECT * FROM staff ORDER BY role, username');
        return stmt.all();
    }
}

class GlobalStatsModel {
    static get() {
        const stmt = db.prepare('SELECT * FROM global_stats WHERE id = 1');
        return stmt.get();
    }

    static updateServerCount(count) {
        const stmt = db.prepare('UPDATE global_stats SET total_servers = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = 1');
        return stmt.run(count);
    }

    static updateUserCount(count) {
        const stmt = db.prepare('UPDATE global_stats SET total_users = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = 1');
        return stmt.run(count);
    }

    static incrementQuestCount() {
        const stmt = db.prepare('UPDATE global_stats SET total_quests_completed = total_quests_completed + 1, updated_at = strftime(\'%s\', \'now\') WHERE id = 1');
        return stmt.run();
    }

    static updateLastBossSpawn(timestamp) {
        const stmt = db.prepare('UPDATE global_stats SET last_boss_spawn = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = 1');
        return stmt.run(timestamp);
    }

    static getTotalCurrencyInCirculation() {
        const stmt = db.prepare('SELECT COALESCE(SUM(currency), 0) as total FROM users');
        return stmt.get().total;
    }

    static getTotalGemsInCirculation() {
        const stmt = db.prepare('SELECT COALESCE(SUM(gems), 0) as total FROM users');
        return stmt.get().total;
    }
}

class ItemModel {
    static create(itemName, description, rarity, itemType = 'consumable', slot = null, attackBonus = 0, defenseBonus = 0, levelRequirement = 1, currencyCost = 0, gemCost = 0) {
        const stmt = db.prepare(`
            INSERT INTO items (item_name, description, rarity, item_type, slot, attack_bonus, defense_bonus, level_requirement, currency_cost, gem_cost)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(itemName, description, rarity, itemType, slot, attackBonus, defenseBonus, levelRequirement, currencyCost, gemCost);
    }

    static getAll() {
        const stmt = db.prepare('SELECT * FROM items');
        return stmt.all();
    }

    static findByName(itemName) {
        const stmt = db.prepare('SELECT * FROM items WHERE item_name = ?');
        return stmt.get(itemName);
    }

    static findById(itemId) {
        const stmt = db.prepare('SELECT * FROM items WHERE id = ?');
        return stmt.get(itemId);
    }

    static getByType(itemType) {
        const stmt = db.prepare('SELECT * FROM items WHERE item_type = ?');
        return stmt.all(itemType);
    }

    static getBySlot(slot) {
        const stmt = db.prepare('SELECT * FROM items WHERE slot = ?');
        return stmt.all(slot);
    }
}

class UserItemModel {
    static addItem(userId, itemId, quantity = 1) {
        const stmt = db.prepare(`
            INSERT INTO user_items (user_id, item_id, quantity)
            VALUES (?, ?, ?)
            ON CONFLICT(user_id, item_id) DO UPDATE SET
                quantity = quantity + excluded.quantity
        `);
        return stmt.run(userId, itemId, quantity);
    }

    static getUserItems(userId) {
        const stmt = db.prepare(`
            SELECT ui.*, i.item_name, i.description, i.rarity, i.item_type, i.slot, i.attack_bonus, i.defense_bonus, i.level_requirement
            FROM user_items ui
            JOIN items i ON ui.item_id = i.id
            WHERE ui.user_id = ?
        `);
        return stmt.all(userId);
    }

    static hasItem(userId, itemId) {
        const stmt = db.prepare('SELECT quantity FROM user_items WHERE user_id = ? AND item_id = ?');
        const result = stmt.get(userId, itemId);
        return result ? result.quantity > 0 : false;
    }

    static removeItem(userId, itemId, quantity = 1) {
        const stmt = db.prepare(`
            UPDATE user_items
            SET quantity = MAX(0, quantity - ?)
            WHERE user_id = ? AND item_id = ?
        `);
        return stmt.run(quantity, userId, itemId);
    }

    static getEquipment(userId) {
        const stmt = db.prepare(`
            SELECT ui.*, i.item_name, i.description, i.rarity, i.slot, i.attack_bonus, i.defense_bonus, i.level_requirement
            FROM user_items ui
            JOIN items i ON ui.item_id = i.id
            WHERE ui.user_id = ? AND i.item_type IN ('weapon', 'armor')
        `);
        return stmt.all(userId);
    }
}

class BannedIPModel {
    static ban(ipAddress, reason, bannedBy, bannedById, permanent = true, expiresAt = null) {
        const stmt = db.prepare(`
            INSERT INTO banned_ips (ip_address, reason, banned_by, banned_by_id, permanent, expires_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(ip_address) DO UPDATE SET
                reason = excluded.reason,
                banned_by = excluded.banned_by,
                banned_by_id = excluded.banned_by_id,
                permanent = excluded.permanent,
                expires_at = excluded.expires_at,
                banned_at = strftime('%s', 'now')
        `);
        return stmt.run(ipAddress, reason, bannedBy, bannedById, permanent ? 1 : 0, expiresAt);
    }

    static unban(ipAddress) {
        const stmt = db.prepare('DELETE FROM banned_ips WHERE ip_address = ?');
        return stmt.run(ipAddress);
    }

    static isBanned(ipAddress) {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(`
            SELECT * FROM banned_ips
            WHERE ip_address = ?
            AND (permanent = 1 OR expires_at > ?)
        `);
        return stmt.get(ipAddress, now);
    }

    static getAll() {
        const stmt = db.prepare('SELECT * FROM banned_ips ORDER BY banned_at DESC');
        return stmt.all();
    }

    static cleanExpired() {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare('DELETE FROM banned_ips WHERE permanent = 0 AND expires_at <= ?');
        return stmt.run(now);
    }
}

class EquipmentModel {
    static equip(userId, slot, itemId) {
        const column = `equipped_${slot}`;
        const stmt = db.prepare(`UPDATE users SET ${column} = ?, updated_at = strftime('%s', 'now') WHERE id = ?`);
        return stmt.run(itemId, userId);
    }

    static unequip(userId, slot) {
        const column = `equipped_${slot}`;
        const stmt = db.prepare(`UPDATE users SET ${column} = NULL, updated_at = strftime('%s', 'now') WHERE id = ?`);
        return stmt.run(userId);
    }

    static getEquipped(userId) {
        const stmt = db.prepare(`
            SELECT
                u.id as user_id,
                u.equipped_weapon,
                u.equipped_helmet,
                u.equipped_chest,
                u.equipped_legs,
                u.equipped_boots,
                w.item_name as weapon_name,
                w.attack_bonus as weapon_attack,
                w.defense_bonus as weapon_defense,
                h.item_name as helmet_name,
                h.defense_bonus as helmet_defense,
                c.item_name as chest_name,
                c.defense_bonus as chest_defense,
                l.item_name as legs_name,
                l.defense_bonus as legs_defense,
                b.item_name as boots_name,
                b.defense_bonus as boots_defense
            FROM users u
            LEFT JOIN items w ON u.equipped_weapon = w.id
            LEFT JOIN items h ON u.equipped_helmet = h.id
            LEFT JOIN items c ON u.equipped_chest = c.id
            LEFT JOIN items l ON u.equipped_legs = l.id
            LEFT JOIN items b ON u.equipped_boots = b.id
            WHERE u.id = ?
        `);
        return stmt.get(userId);
    }

    static getTotalStats(userId) {
        const equipment = this.getEquipped(userId);
        if (!equipment) return { attack: 0, defense: 0 };

        let totalAttack = equipment.weapon_attack || 0;
        let totalDefense = 0;
        totalDefense += equipment.weapon_defense || 0;
        totalDefense += equipment.helmet_defense || 0;
        totalDefense += equipment.chest_defense || 0;
        totalDefense += equipment.legs_defense || 0;
        totalDefense += equipment.boots_defense || 0;

        return { attack: totalAttack, defense: totalDefense };
    }
}

class WebsiteSettingsModel {
    static get() {
        const stmt = db.prepare('SELECT * FROM website_settings WHERE id = 1');
        return stmt.get();
    }

    static update(settings) {
        const fields = Object.keys(settings).map(key => `${key} = ?`).join(', ');
        const values = Object.values(settings);
        const stmt = db.prepare(`UPDATE website_settings SET ${fields}, updated_at = strftime('%s', 'now') WHERE id = 1`);
        return stmt.run(...values);
    }

    static toggle(setting) {
        const stmt = db.prepare(`UPDATE website_settings SET ${setting} = NOT ${setting}, updated_at = strftime('%s', 'now') WHERE id = 1`);
        return stmt.run();
    }
}

class PVPModel {
    static togglePVP(discordId, enabled) {
        const stmt = db.prepare('UPDATE users SET pvp_enabled = ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(enabled ? 1 : 0, discordId);
    }

    static setInCombat(discordId, inCombat) {
        const stmt = db.prepare('UPDATE users SET in_combat = ?, updated_at = strftime(\'%s\', \'now\') WHERE discord_id = ?');
        return stmt.run(inCombat ? 1 : 0, discordId);
    }

    static createMatch(challengerId, opponentId) {
        const stmt = db.prepare(`
            INSERT INTO pvp_matches (challenger_id, opponent_id)
            VALUES (?, ?)
        `);
        return stmt.run(challengerId, opponentId);
    }

    static completeMatch(matchId, winnerId, challengerDamage, opponentDamage, currencyWon) {
        const stmt = db.prepare(`
            UPDATE pvp_matches
            SET winner_id = ?, challenger_damage = ?, opponent_damage = ?, currency_won = ?, completed = 1, completed_at = strftime('%s', 'now')
            WHERE id = ?
        `);
        return stmt.run(winnerId, challengerDamage, opponentDamage, currencyWon, matchId);
    }

    static updateWins(userId) {
        const stmt = db.prepare('UPDATE users SET total_pvp_wins = total_pvp_wins + 1, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(userId);
    }

    static updateLosses(userId) {
        const stmt = db.prepare('UPDATE users SET total_pvp_losses = total_pvp_losses + 1, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(userId);
    }

    static getUserMatches(userId, limit = 10) {
        const stmt = db.prepare(`
            SELECT
                pm.*,
                u1.username as challenger_name,
                u2.username as opponent_name,
                w.username as winner_name
            FROM pvp_matches pm
            JOIN users u1 ON pm.challenger_id = u1.id
            JOIN users u2 ON pm.opponent_id = u2.id
            LEFT JOIN users w ON pm.winner_id = w.id
            WHERE pm.challenger_id = ? OR pm.opponent_id = ?
            ORDER BY pm.created_at DESC
            LIMIT ?
        `);
        return stmt.all(userId, userId, limit);
    }
}

class GuildModel {
    static create(name, tag, description, leaderId, serverId, isPublic = 0) {
        const stmt = db.prepare(`
            INSERT INTO guilds (name, tag, description, leader_id, server_id, public)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        return stmt.run(name, tag, description, leaderId, serverId, isPublic ? 1 : 0);
    }

    static findById(guildId) {
        const stmt = db.prepare('SELECT * FROM guilds WHERE id = ?');
        return stmt.get(guildId);
    }

    static findByName(name) {
        const stmt = db.prepare('SELECT * FROM guilds WHERE name = ? COLLATE NOCASE');
        return stmt.get(name);
    }

    static findByTag(tag) {
        const stmt = db.prepare('SELECT * FROM guilds WHERE tag = ? COLLATE NOCASE');
        return stmt.get(tag);
    }

    static findByServerId(serverId) {
        const stmt = db.prepare('SELECT * FROM guilds WHERE server_id = ? ORDER BY level DESC, experience DESC');
        return stmt.all(serverId);
    }

    static addMember(guildId, userId, role = 'member') {
        const stmt = db.prepare(`
            INSERT INTO guild_members (guild_id, user_id, role)
            VALUES (?, ?, ?)
        `);
        return stmt.run(guildId, userId, role);
    }

    static removeMember(guildId, userId) {
        const stmt = db.prepare('DELETE FROM guild_members WHERE guild_id = ? AND user_id = ?');
        return stmt.run(guildId, userId);
    }

    static getMember(guildId, userId) {
        const stmt = db.prepare('SELECT * FROM guild_members WHERE guild_id = ? AND user_id = ?');
        return stmt.get(guildId, userId);
    }

    static getMembers(guildId) {
        const stmt = db.prepare(`
            SELECT gm.*, u.discord_id, u.username, u.level, u.experience
            FROM guild_members gm
            JOIN users u ON gm.user_id = u.id
            WHERE gm.guild_id = ?
            ORDER BY gm.role DESC, gm.contribution_currency DESC
        `);
        return stmt.all(guildId);
    }

    static getMemberCount(guildId) {
        const stmt = db.prepare('SELECT COUNT(*) as count FROM guild_members WHERE guild_id = ?');
        return stmt.get(guildId).count;
    }

    static getUserGuild(userId) {
        const stmt = db.prepare(`
            SELECT g.*, gm.role, gm.contribution_currency, gm.contribution_gems
            FROM guilds g
            JOIN guild_members gm ON g.id = gm.guild_id
            WHERE gm.user_id = ?
        `);
        return stmt.get(userId);
    }

    static updateRole(guildId, userId, newRole) {
        const stmt = db.prepare('UPDATE guild_members SET role = ? WHERE guild_id = ? AND user_id = ?');
        return stmt.run(newRole, guildId, userId);
    }

    static addContribution(guildId, userId, currency = 0, gems = 0) {
        const stmt = db.prepare(`
            UPDATE guild_members
            SET contribution_currency = contribution_currency + ?,
                contribution_gems = contribution_gems + ?
            WHERE guild_id = ? AND user_id = ?
        `);
        return stmt.run(currency, gems, guildId, userId);
    }

    static updateTreasury(guildId, currency = 0, gems = 0) {
        const stmt = db.prepare(`
            UPDATE guilds
            SET treasury_currency = treasury_currency + ?,
                treasury_gems = treasury_gems + ?,
                updated_at = strftime('%s', 'now')
            WHERE id = ?
        `);
        return stmt.run(currency, gems, guildId);
    }

    static updateLeader(guildId, newLeaderId) {
        const stmt = db.prepare('UPDATE guilds SET leader_id = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(newLeaderId, guildId);
    }

    static updatePrivacy(guildId, isPublic) {
        const stmt = db.prepare('UPDATE guilds SET public = ?, updated_at = strftime(\'%s\', \'now\') WHERE id = ?');
        return stmt.run(isPublic ? 1 : 0, guildId);
    }

    static delete(guildId) {
        const stmt = db.prepare('DELETE FROM guilds WHERE id = ?');
        return stmt.run(guildId);
    }

    static createInvite(guildId, inviterId, inviteeId, expiresAt) {
        const stmt = db.prepare(`
            INSERT INTO guild_invites (guild_id, inviter_id, invitee_id, expires_at)
            VALUES (?, ?, ?, ?)
        `);
        return stmt.run(guildId, inviterId, inviteeId, expiresAt);
    }

    static getPendingInvites(userId) {
        const now = Math.floor(Date.now() / 1000);
        const stmt = db.prepare(`
            SELECT gi.*, g.name as guild_name, u.username as inviter_name
            FROM guild_invites gi
            JOIN guilds g ON gi.guild_id = g.id
            JOIN users u ON gi.inviter_id = u.id
            WHERE gi.invitee_id = ? AND gi.status = 'pending' AND gi.expires_at > ?
        `);
        return stmt.all(userId, now);
    }

    static updateInviteStatus(inviteId, status) {
        const stmt = db.prepare('UPDATE guild_invites SET status = ? WHERE id = ?');
        return stmt.run(status, inviteId);
    }

    static getTopGuildsByLevel(limit = 10) {
        const stmt = db.prepare(`
            SELECT g.*,
                   (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) as member_count,
                   u.username as leader_name
            FROM guilds g
            JOIN users u ON g.leader_id = u.id
            ORDER BY g.level DESC, g.experience DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    static getTopGuildsByTreasury(limit = 10) {
        const stmt = db.prepare(`
            SELECT g.*,
                   (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) as member_count,
                   u.username as leader_name,
                   (g.treasury_currency + g.treasury_gems * 10) as total_wealth
            FROM guilds g
            JOIN users u ON g.leader_id = u.id
            ORDER BY total_wealth DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    static getTopGuildsByMembers(limit = 10) {
        const stmt = db.prepare(`
            SELECT g.*,
                   (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) as member_count,
                   u.username as leader_name
            FROM guilds g
            JOIN users u ON g.leader_id = u.id
            ORDER BY member_count DESC, g.level DESC
            LIMIT ?
        `);
        return stmt.all(limit);
    }

    static getGuildRank(guildId) {
        // Get guild's rank by level
        const stmt = db.prepare(`
            SELECT COUNT(*) + 1 as rank
            FROM guilds g1
            WHERE (g1.level > (SELECT level FROM guilds WHERE id = ?))
               OR (g1.level = (SELECT level FROM guilds WHERE id = ?)
                   AND g1.experience > (SELECT experience FROM guilds WHERE id = ?))
        `);
        return stmt.get(guildId, guildId, guildId).rank;
    }

    static updateMemberRole(guildId, userId, newRole) {
        const stmt = db.prepare(`
            UPDATE guild_members
            SET role = ?
            WHERE guild_id = ? AND user_id = ?
        `);
        return stmt.run(newRole, guildId, userId);
    }

    static updateGuild(guildId, updates) {
        const fields = [];
        const values = [];

        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
        }

        if (updates.public !== undefined) {
            fields.push('public = ?');
            values.push(updates.public);
        }

        if (updates.leader_id !== undefined) {
            fields.push('leader_id = ?');
            values.push(updates.leader_id);
        }

        if (fields.length === 0) return;

        values.push(guildId);
        const stmt = db.prepare(`
            UPDATE guilds
            SET ${fields.join(', ')}
            WHERE id = ?
        `);
        return stmt.run(...values);
    }

    static deleteGuild(guildId) {
        // Delete all invites first
        db.prepare('DELETE FROM guild_invites WHERE guild_id = ?').run(guildId);

        // Delete all members
        db.prepare('DELETE FROM guild_members WHERE guild_id = ?').run(guildId);

        // Delete the guild
        const stmt = db.prepare('DELETE FROM guilds WHERE id = ?');
        return stmt.run(guildId);
    }
}

module.exports = {
    UserModel,
    ServerModel,
    QuestModel,
    UserQuestModel,
    BossModel,
    BossParticipantModel,
    LeaderboardModel,
    ActivityLogModel,
    StaffModel,
    GlobalStatsModel,
    ItemModel,
    UserItemModel,
    BannedIPModel,
    EquipmentModel,
    PVPModel,
    WebsiteSettingsModel,
    GuildModel
};
