const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '../../data/questcord.db');
const dataDir = path.dirname(dbPath);

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

function initializeDatabase() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            currency INTEGER DEFAULT 0,
            gems INTEGER DEFAULT 0,
            total_quests INTEGER DEFAULT 0,
            current_server_id TEXT,
            last_quest_time INTEGER DEFAULT 0,
            level INTEGER DEFAULT 1,
            experience INTEGER DEFAULT 0,
            total_experience INTEGER DEFAULT 0,
            pvp_enabled INTEGER DEFAULT 0,
            attack INTEGER DEFAULT 10,
            defense INTEGER DEFAULT 10,
            health INTEGER DEFAULT 100,
            max_health INTEGER DEFAULT 100,
            pvp_wins INTEGER DEFAULT 0,
            pvp_losses INTEGER DEFAULT 0,
            traveling INTEGER DEFAULT 0,
            travel_destination TEXT,
            travel_arrives_at INTEGER DEFAULT 0,
            last_travel_time INTEGER DEFAULT 0,
            equipped_weapon INTEGER,
            equipped_helmet INTEGER,
            equipped_chest INTEGER,
            equipped_legs INTEGER,
            equipped_boots INTEGER,
            in_combat INTEGER DEFAULT 0,
            total_pvp_wins INTEGER DEFAULT 0,
            total_pvp_losses INTEGER DEFAULT 0,
            quests_completed INTEGER DEFAULT 0,
            bosses_defeated INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (equipped_weapon) REFERENCES items(id),
            FOREIGN KEY (equipped_helmet) REFERENCES items(id),
            FOREIGN KEY (equipped_chest) REFERENCES items(id),
            FOREIGN KEY (equipped_legs) REFERENCES items(id),
            FOREIGN KEY (equipped_boots) REFERENCES items(id)
        );

        CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_id);

        CREATE TABLE IF NOT EXISTS servers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            opted_in INTEGER DEFAULT 1,
            member_count INTEGER DEFAULT 0,
            total_quests_completed INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_servers_discord_id ON servers(discord_id);
        CREATE INDEX IF NOT EXISTS idx_servers_opted_in ON servers(opted_in);

        CREATE TABLE IF NOT EXISTS quests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            server_id TEXT NOT NULL,
            quest_type TEXT NOT NULL,
            quest_name TEXT NOT NULL,
            description TEXT NOT NULL,
            reward_currency INTEGER NOT NULL,
            reward_gems INTEGER NOT NULL,
            difficulty TEXT NOT NULL,
            assigned_date TEXT NOT NULL,
            expires_at INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_quests_server_id ON quests(server_id);
        CREATE INDEX IF NOT EXISTS idx_quests_assigned_date ON quests(assigned_date);
        CREATE INDEX IF NOT EXISTS idx_quests_expires_at ON quests(expires_at);

        CREATE TABLE IF NOT EXISTS user_quests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            quest_id INTEGER NOT NULL,
            completed INTEGER DEFAULT 0,
            failed INTEGER DEFAULT 0,
            progress INTEGER DEFAULT 0,
            completed_at INTEGER,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (quest_id) REFERENCES quests(id) ON DELETE CASCADE,
            UNIQUE(user_id, quest_id)
        );

        CREATE INDEX IF NOT EXISTS idx_user_quests_user_id ON user_quests(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_quests_quest_id ON user_quests(quest_id);
        CREATE INDEX IF NOT EXISTS idx_user_quests_completed ON user_quests(completed);

        CREATE TABLE IF NOT EXISTS bosses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            boss_type TEXT NOT NULL,
            boss_name TEXT NOT NULL,
            server_id TEXT NOT NULL,
            health INTEGER NOT NULL,
            max_health INTEGER NOT NULL,
            reward_currency INTEGER NOT NULL,
            reward_gems INTEGER NOT NULL,
            spawned_at INTEGER DEFAULT (strftime('%s', 'now')),
            expires_at INTEGER NOT NULL,
            defeated INTEGER DEFAULT 0,
            defeated_at INTEGER
        );

        CREATE INDEX IF NOT EXISTS idx_bosses_server_id ON bosses(server_id);
        CREATE INDEX IF NOT EXISTS idx_bosses_defeated ON bosses(defeated);
        CREATE INDEX IF NOT EXISTS idx_bosses_expires_at ON bosses(expires_at);

        CREATE TABLE IF NOT EXISTS boss_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            boss_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            damage_dealt INTEGER DEFAULT 0,
            attacks INTEGER DEFAULT 0,
            joined_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (boss_id) REFERENCES bosses(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(boss_id, user_id)
        );

        CREATE INDEX IF NOT EXISTS idx_boss_participants_boss_id ON boss_participants(boss_id);
        CREATE INDEX IF NOT EXISTS idx_boss_participants_user_id ON boss_participants(user_id);

        CREATE TABLE IF NOT EXISTS leaderboard (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            score INTEGER DEFAULT 0,
            month INTEGER NOT NULL,
            year INTEGER NOT NULL,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            updated_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, month, year)
        );

        CREATE INDEX IF NOT EXISTS idx_leaderboard_month_year ON leaderboard(month, year);
        CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);

        CREATE TABLE IF NOT EXISTS activity_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            username TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT,
            timestamp INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_activity_log_timestamp ON activity_log(timestamp DESC);

        CREATE TABLE IF NOT EXISTS staff (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discord_id TEXT UNIQUE NOT NULL,
            username TEXT NOT NULL,
            role TEXT NOT NULL,
            added_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_staff_discord_id ON staff(discord_id);

        CREATE TABLE IF NOT EXISTS global_stats (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            total_servers INTEGER DEFAULT 0,
            total_users INTEGER DEFAULT 0,
            total_quests_completed INTEGER DEFAULT 0,
            last_boss_spawn INTEGER DEFAULT 0,
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        INSERT OR IGNORE INTO global_stats (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item_name TEXT UNIQUE NOT NULL,
            description TEXT NOT NULL,
            rarity TEXT NOT NULL,
            item_type TEXT NOT NULL,
            attack_power INTEGER DEFAULT 0,
            defense_power INTEGER DEFAULT 0,
            crit_chance INTEGER DEFAULT 0,
            currency_cost INTEGER DEFAULT 0,
            gem_cost INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS user_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            item_id INTEGER NOT NULL,
            quantity INTEGER DEFAULT 1,
            equipped INTEGER DEFAULT 0,
            acquired_at INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
            UNIQUE(user_id, item_id)
        );

        CREATE INDEX IF NOT EXISTS idx_user_items_user_id ON user_items(user_id);

        CREATE TABLE IF NOT EXISTS disabled_commands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command_name TEXT UNIQUE NOT NULL,
            disabled_by TEXT NOT NULL,
            disabled_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE TABLE IF NOT EXISTS command_whitelist (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            command_name TEXT NOT NULL,
            discord_id TEXT NOT NULL,
            added_by TEXT NOT NULL,
            added_at INTEGER DEFAULT (strftime('%s', 'now')),
            UNIQUE(command_name, discord_id)
        );

        CREATE INDEX IF NOT EXISTS idx_command_whitelist_command ON command_whitelist(command_name);
        CREATE INDEX IF NOT EXISTS idx_command_whitelist_user ON command_whitelist(discord_id);

        CREATE TABLE IF NOT EXISTS pvp_matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            challenger_id INTEGER NOT NULL,
            opponent_id INTEGER NOT NULL,
            winner_id INTEGER,
            challenger_damage INTEGER DEFAULT 0,
            opponent_damage INTEGER DEFAULT 0,
            currency_won INTEGER DEFAULT 0,
            completed INTEGER DEFAULT 0,
            created_at INTEGER DEFAULT (strftime('%s', 'now')),
            completed_at INTEGER,
            FOREIGN KEY (challenger_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (opponent_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (winner_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_pvp_matches_challenger ON pvp_matches(challenger_id);
        CREATE INDEX IF NOT EXISTS idx_pvp_matches_opponent ON pvp_matches(opponent_id);

        CREATE TABLE IF NOT EXISTS banned_ips (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            ip_address TEXT UNIQUE NOT NULL,
            reason TEXT NOT NULL,
            banned_by TEXT NOT NULL,
            banned_by_id TEXT NOT NULL,
            permanent INTEGER DEFAULT 1,
            expires_at INTEGER,
            banned_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        CREATE INDEX IF NOT EXISTS idx_banned_ips_address ON banned_ips(ip_address);

        CREATE TABLE IF NOT EXISTS website_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            card_hover_effects INTEGER DEFAULT 1,
            background_animations INTEGER DEFAULT 1,
            cosmic_particles INTEGER DEFAULT 1,
            aurora_effect INTEGER DEFAULT 1,
            gradient_animations INTEGER DEFAULT 1,
            party_mode INTEGER DEFAULT 1,
            insult_display INTEGER DEFAULT 1,
            chaos_mode INTEGER DEFAULT 1,
            performance_mode INTEGER DEFAULT 0,
            maintenance_mode INTEGER DEFAULT 0,
            updated_at INTEGER DEFAULT (strftime('%s', 'now'))
        );

        INSERT OR IGNORE INTO website_settings (id) VALUES (1);
    `);

    // Migrations
    const userTableInfo = db.prepare("PRAGMA table_info(users)").all();
    const questTableInfo = db.prepare("PRAGMA table_info(user_quests)").all();
    const itemTableInfo = db.prepare("PRAGMA table_info(items)").all();
    const userItemTableInfo = db.prepare("PRAGMA table_info(user_items)").all();

    // Migration: Add missing columns to users table
    const hasLastQuestTime = userTableInfo.some(col => col.name === 'last_quest_time');
    const hasLevel = userTableInfo.some(col => col.name === 'level');
    const hasExperience = userTableInfo.some(col => col.name === 'experience');
    const hasTotalExperience = userTableInfo.some(col => col.name === 'total_experience');

    if (!hasLastQuestTime) {
        console.log('Running migration: Adding last_quest_time to users...');
        db.exec('ALTER TABLE users ADD COLUMN last_quest_time INTEGER DEFAULT 0');
        console.log('Migration completed: last_quest_time added');
    }

    if (!hasLevel) {
        console.log('Running migration: Adding level to users...');
        db.exec('ALTER TABLE users ADD COLUMN level INTEGER DEFAULT 1');
        console.log('Migration completed: level added');
    }

    if (!hasExperience) {
        console.log('Running migration: Adding experience to users...');
        db.exec('ALTER TABLE users ADD COLUMN experience INTEGER DEFAULT 0');
        console.log('Migration completed: experience added');
    }

    if (!hasTotalExperience) {
        console.log('Running migration: Adding total_experience to users...');
        db.exec('ALTER TABLE users ADD COLUMN total_experience INTEGER DEFAULT 0');
        console.log('Migration completed: total_experience added');
    }

    // Migration: Add 'failed' column to user_quests if it doesn't exist
    const hasFailedColumn = questTableInfo.some(col => col.name === 'failed');

    if (!hasFailedColumn) {
        console.log('Running migration: Adding failed column to user_quests...');
        db.exec('ALTER TABLE user_quests ADD COLUMN failed INTEGER DEFAULT 0');
        console.log('Migration completed: failed column added');
    }

    // Migration: Update default currency from 100 to 0 for new users only
    const hasCurrency = userTableInfo.find(col => col.name === 'currency');
    if (hasCurrency && hasCurrency.dflt_value === '100') {
        console.log('Note: Default currency is now 0 for new users (existing users unaffected)');
    }

    // Migration: Add PVP columns to users table
    const pvpColumns = [
        { name: 'pvp_enabled', type: 'INTEGER DEFAULT 0' },
        { name: 'attack', type: 'INTEGER DEFAULT 10' },
        { name: 'defense', type: 'INTEGER DEFAULT 10' },
        { name: 'health', type: 'INTEGER DEFAULT 100' },
        { name: 'max_health', type: 'INTEGER DEFAULT 100' },
        { name: 'pvp_wins', type: 'INTEGER DEFAULT 0' },
        { name: 'pvp_losses', type: 'INTEGER DEFAULT 0' }
    ];

    // Migration: Add travel columns to users table
    const travelColumns = [
        { name: 'traveling', type: 'INTEGER DEFAULT 0' },
        { name: 'travel_destination', type: 'TEXT' },
        { name: 'travel_arrives_at', type: 'INTEGER DEFAULT 0' },
        { name: 'last_travel_time', type: 'INTEGER DEFAULT 0' }
    ];

    pvpColumns.forEach(column => {
        const hasColumn = userTableInfo.some(col => col.name === column.name);
        if (!hasColumn) {
            console.log(`Running migration: Adding ${column.name} to users...`);
            db.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
            console.log(`Migration completed: ${column.name} added`);
        }
    });

    travelColumns.forEach(column => {
        const hasColumn = userTableInfo.some(col => col.name === column.name);
        if (!hasColumn) {
            console.log(`Running migration: Adding ${column.name} to users...`);
            db.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
            console.log(`Migration completed: ${column.name} added`);
        }
    });

    // Migration: Add item stats columns
    const itemColumns = [
        { name: 'item_type', type: 'TEXT DEFAULT "misc"' },
        { name: 'attack_power', type: 'INTEGER DEFAULT 0' },
        { name: 'defense_power', type: 'INTEGER DEFAULT 0' },
        { name: 'crit_chance', type: 'INTEGER DEFAULT 0' }
    ];

    itemColumns.forEach(column => {
        const hasColumn = itemTableInfo.some(col => col.name === column.name);
        if (!hasColumn) {
            console.log(`Running migration: Adding ${column.name} to items...`);
            db.exec(`ALTER TABLE items ADD COLUMN ${column.name} ${column.type}`);
            console.log(`Migration completed: ${column.name} added`);
        }
    });

    // Migration: Add equipped column to user_items
    const hasEquipped = userItemTableInfo.some(col => col.name === 'equipped');
    if (!hasEquipped) {
        console.log('Running migration: Adding equipped to user_items...');
        db.exec('ALTER TABLE user_items ADD COLUMN equipped INTEGER DEFAULT 0');
        console.log('Migration completed: equipped added');
    }

    // Migration: Add avatar_url to staff table
    const staffTableInfo = db.prepare("PRAGMA table_info(staff)").all();
    const hasAvatarUrl = staffTableInfo.some(col => col.name === 'avatar_url');
    if (!hasAvatarUrl) {
        console.log('Running migration: Adding avatar_url to staff...');
        db.exec('ALTER TABLE staff ADD COLUMN avatar_url TEXT');
        console.log('Migration completed: avatar_url added');
    }

    // Migration: Add announcement tracking to bosses table
    const bossTableInfo = db.prepare("PRAGMA table_info(bosses)").all();
    const hasAnnouncementMessageId = bossTableInfo.some(col => col.name === 'announcement_message_id');
    const hasAnnouncementChannelId = bossTableInfo.some(col => col.name === 'announcement_channel_id');

    if (!hasAnnouncementMessageId) {
        console.log('Running migration: Adding announcement_message_id to bosses...');
        db.exec('ALTER TABLE bosses ADD COLUMN announcement_message_id TEXT');
        console.log('Migration completed: announcement_message_id added');
    }

    if (!hasAnnouncementChannelId) {
        console.log('Running migration: Adding announcement_channel_id to bosses...');
        db.exec('ALTER TABLE bosses ADD COLUMN announcement_channel_id TEXT');
        console.log('Migration completed: announcement_channel_id added');
    }

    // Migration: Add equipment slots to users table
    const equipmentColumns = [
        { name: 'equipped_weapon', type: 'INTEGER' },
        { name: 'equipped_helmet', type: 'INTEGER' },
        { name: 'equipped_chest', type: 'INTEGER' },
        { name: 'equipped_legs', type: 'INTEGER' },
        { name: 'equipped_boots', type: 'INTEGER' }
    ];

    equipmentColumns.forEach(column => {
        const hasColumn = userTableInfo.some(col => col.name === column.name);
        if (!hasColumn) {
            console.log(`Running migration: Adding ${column.name} to users...`);
            db.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
            console.log(`Migration completed: ${column.name} added`);
        }
    });

    // Migration: Add PVP stats columns to users table
    const pvpStatsColumns = [
        { name: 'in_combat', type: 'INTEGER DEFAULT 0' },
        { name: 'total_pvp_wins', type: 'INTEGER DEFAULT 0' },
        { name: 'total_pvp_losses', type: 'INTEGER DEFAULT 0' },
        { name: 'quests_completed', type: 'INTEGER DEFAULT 0' },
        { name: 'bosses_defeated', type: 'INTEGER DEFAULT 0' }
    ];

    pvpStatsColumns.forEach(column => {
        const hasColumn = userTableInfo.some(col => col.name === column.name);
        if (!hasColumn) {
            console.log(`Running migration: Adding ${column.name} to users...`);
            db.exec(`ALTER TABLE users ADD COLUMN ${column.name} ${column.type}`);
            console.log(`Migration completed: ${column.name} added`);
        }
    });

    // Migration: Add maintenance_mode to website_settings table
    const websiteSettingsTableInfo = db.prepare("PRAGMA table_info(website_settings)").all();
    const hasMaintenanceMode = websiteSettingsTableInfo.some(col => col.name === 'maintenance_mode');
    if (!hasMaintenanceMode) {
        console.log('Running migration: Adding maintenance_mode to website_settings...');
        db.exec('ALTER TABLE website_settings ADD COLUMN maintenance_mode INTEGER DEFAULT 0');
        console.log('Migration completed: maintenance_mode added');
    }

    // Migration: Phase 1 - Daily Login Rewards System
    console.log('Checking Phase 1 migrations...');

    // Create login_rewards table
    const loginRewardsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='login_rewards'").get();
    if (!loginRewardsTableExists) {
        console.log('Running migration: Creating login_rewards table...');
        db.exec(`
            CREATE TABLE login_rewards (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                day INTEGER NOT NULL UNIQUE,
                currency INTEGER DEFAULT 0,
                gems INTEGER DEFAULT 0,
                item_id INTEGER,
                item_quantity INTEGER DEFAULT 1,
                description TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (item_id) REFERENCES items(id)
            )
        `);

        // Seed initial 7-day login rewards
        db.exec(`
            INSERT INTO login_rewards (day, currency, gems, description) VALUES
            (1, 100, 0, 'Day 1: Welcome bonus!'),
            (2, 150, 0, 'Day 2: Keep it up!'),
            (3, 200, 5, 'Day 3: Dedication rewarded!'),
            (4, 250, 0, 'Day 4: Halfway there!'),
            (5, 300, 10, 'Day 5: Almost a week!'),
            (6, 400, 0, 'Day 6: One more day!'),
            (7, 500, 25, 'Day 7: Weekly streak bonus!')
        `);

        console.log('Migration completed: login_rewards table created and seeded');
    }

    // Create user_login_streak table
    const loginStreakTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_login_streak'").get();
    if (!loginStreakTableExists) {
        console.log('Running migration: Creating user_login_streak table...');
        db.exec(`
            CREATE TABLE user_login_streak (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                last_login_date TEXT,
                current_streak INTEGER DEFAULT 0,
                longest_streak INTEGER DEFAULT 0,
                total_logins INTEGER DEFAULT 0,
                last_reward_claimed INTEGER DEFAULT 0,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id),
                UNIQUE(user_id)
            )
        `);
        console.log('Migration completed: user_login_streak table created');
    }

    // Add last_login_date column to users
    const userTableInfoPhase1 = db.prepare("PRAGMA table_info(users)").all();
    if (!userTableInfoPhase1.some(col => col.name === 'last_login_date')) {
        console.log('Running migration: Adding last_login_date to users...');
        db.exec('ALTER TABLE users ADD COLUMN last_login_date TEXT');
        console.log('Migration completed: last_login_date added');
    }

    // Add login_streak column to users
    if (!userTableInfoPhase1.some(col => col.name === 'login_streak')) {
        console.log('Running migration: Adding login_streak to users...');
        db.exec('ALTER TABLE users ADD COLUMN login_streak INTEGER DEFAULT 0');
        console.log('Migration completed: login_streak added');
    }

    // Add profile_banner column to users
    if (!userTableInfoPhase1.some(col => col.name === 'profile_banner')) {
        console.log('Running migration: Adding profile_banner to users...');
        db.exec('ALTER TABLE users ADD COLUMN profile_banner TEXT');
        console.log('Migration completed: profile_banner added');
    }

    // Add profile_bio column to users
    if (!userTableInfoPhase1.some(col => col.name === 'profile_bio')) {
        console.log('Running migration: Adding profile_bio to users...');
        db.exec('ALTER TABLE users ADD COLUMN profile_bio TEXT');
        console.log('Migration completed: profile_bio added');
    }

    // Add avatar_hash column to users
    if (!userTableInfoPhase1.some(col => col.name === 'avatar_hash')) {
        console.log('Running migration: Adding avatar_hash to users...');
        db.exec('ALTER TABLE users ADD COLUMN avatar_hash TEXT');
        console.log('Migration completed: avatar_hash added');
    }

    // Add vanity_url column to users
    if (!userTableInfoPhase1.some(col => col.name === 'vanity_url')) {
        console.log('Running migration: Adding vanity_url to users...');
        db.exec('ALTER TABLE users ADD COLUMN vanity_url TEXT');
        console.log('Migration completed: vanity_url added');

        // Create unique index for vanity_url
        console.log('Creating unique index for vanity_url...');
        db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_vanity_url ON users(vanity_url) WHERE vanity_url IS NOT NULL');
        console.log('Unique index created for vanity_url');
    }

    // Add verified column to users
    if (!userTableInfoPhase1.some(col => col.name === 'verified')) {
        console.log('Running migration: Adding verified to users...');
        db.exec('ALTER TABLE users ADD COLUMN verified INTEGER DEFAULT 0');
        console.log('Migration completed: verified added');
    }

    console.log('Phase 1 migrations completed successfully');

    // ============================================
    // PHASE 2 MIGRATIONS - ACHIEVEMENT SYSTEM
    // ============================================

    // Migration: Create achievements table
    const achievementsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='achievements'").get();

    if (!achievementsTableExists) {
        console.log('Running migration: Creating achievements table...');
        db.exec(`
            CREATE TABLE achievements (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL,
                category TEXT NOT NULL,
                icon TEXT,
                points INTEGER DEFAULT 10,
                rarity TEXT DEFAULT 'common',
                criteria_type TEXT NOT NULL,
                criteria_value INTEGER,
                hidden INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now'))
            );

            CREATE INDEX idx_achievements_category ON achievements(category);
            CREATE INDEX idx_achievements_rarity ON achievements(rarity);
        `);
        console.log('✓ achievements table created');
    }

    // Migration: Create user_achievements table
    const userAchievementsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='user_achievements'").get();

    if (!userAchievementsTableExists) {
        console.log('Running migration: Creating user_achievements table...');
        db.exec(`
            CREATE TABLE user_achievements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                achievement_id TEXT NOT NULL,
                progress INTEGER DEFAULT 0,
                unlocked INTEGER DEFAULT 0,
                unlocked_at INTEGER,
                notified INTEGER DEFAULT 0,
                FOREIGN KEY (user_id) REFERENCES users(id),
                FOREIGN KEY (achievement_id) REFERENCES achievements(id),
                UNIQUE(user_id, achievement_id)
            );

            CREATE INDEX idx_user_achievements_user ON user_achievements(user_id);
            CREATE INDEX idx_user_achievements_unlocked ON user_achievements(user_id, unlocked);
        `);
        console.log('✓ user_achievements table created');
    }

    // Seed achievements
    const achievementCount = db.prepare('SELECT COUNT(*) as count FROM achievements').get();
    if (achievementCount.count === 0) {
        console.log('Seeding achievements...');
        const { achievements } = require('./achievements');
        const insertAchievement = db.prepare(`
            INSERT INTO achievements (id, name, description, category, icon, points, rarity, criteria_type, criteria_value, hidden)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        for (const achievement of achievements) {
            insertAchievement.run(
                achievement.id,
                achievement.name,
                achievement.description,
                achievement.category,
                achievement.icon,
                achievement.points,
                achievement.rarity,
                achievement.criteria_type,
                achievement.criteria_value,
                achievement.hidden
            );
        }
        console.log(`✓ Seeded ${achievements.length} achievements`);
    }

    console.log('Phase 2 migrations completed successfully');

    // Migration: Create solitary_confinement table
    const confinementTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='solitary_confinement'").get();

    if (!confinementTableExists) {
        console.log('Running migration: Creating solitary_confinement table...');
        db.exec(`
            CREATE TABLE solitary_confinement (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                server_id TEXT NOT NULL,
                channel_id TEXT NOT NULL,
                moderator_id TEXT NOT NULL,
                reason TEXT,
                expires_at INTEGER NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                active INTEGER DEFAULT 1
            );

            CREATE INDEX idx_confinement_user_server ON solitary_confinement(user_id, server_id, active);
            CREATE INDEX idx_confinement_expires ON solitary_confinement(expires_at, active);
        `);
        console.log('✓ solitary_confinement table created');
    }

    // Guild/Clan System Tables
    const guildsTableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='guilds'").get();
    if (!guildsTableExists) {
        db.exec(`
            CREATE TABLE IF NOT EXISTS guilds (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT UNIQUE NOT NULL,
                tag TEXT UNIQUE NOT NULL,
                description TEXT,
                leader_id INTEGER NOT NULL,
                server_id TEXT NOT NULL,
                level INTEGER DEFAULT 1,
                experience INTEGER DEFAULT 0,
                treasury_currency INTEGER DEFAULT 0,
                treasury_gems INTEGER DEFAULT 0,
                max_members INTEGER DEFAULT 20,
                public INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                updated_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (leader_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_guilds_server_id ON guilds(server_id);
            CREATE INDEX IF NOT EXISTS idx_guilds_leader_id ON guilds(leader_id);
            CREATE INDEX IF NOT EXISTS idx_guilds_name ON guilds(name);
            CREATE INDEX IF NOT EXISTS idx_guilds_tag ON guilds(tag);

            CREATE TABLE IF NOT EXISTS guild_members (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                role TEXT DEFAULT 'member',
                contribution_currency INTEGER DEFAULT 0,
                contribution_gems INTEGER DEFAULT 0,
                joined_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                UNIQUE(guild_id, user_id)
            );

            CREATE INDEX IF NOT EXISTS idx_guild_members_guild_id ON guild_members(guild_id);
            CREATE INDEX IF NOT EXISTS idx_guild_members_user_id ON guild_members(user_id);

            CREATE TABLE IF NOT EXISTS guild_invites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER NOT NULL,
                inviter_id INTEGER NOT NULL,
                invitee_id INTEGER NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                expires_at INTEGER NOT NULL,
                FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
                FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (invitee_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_guild_invites_guild_id ON guild_invites(guild_id);
            CREATE INDEX IF NOT EXISTS idx_guild_invites_invitee_id ON guild_invites(invitee_id);
            CREATE INDEX IF NOT EXISTS idx_guild_invites_status ON guild_invites(status);

            CREATE TABLE IF NOT EXISTS guild_activity_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER NOT NULL,
                activity_type TEXT NOT NULL,
                description TEXT NOT NULL,
                user_id INTEGER,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
            );

            CREATE INDEX IF NOT EXISTS idx_guild_activity_log_guild_id ON guild_activity_log(guild_id);
            CREATE INDEX IF NOT EXISTS idx_guild_activity_log_created_at ON guild_activity_log(created_at);

            CREATE TABLE IF NOT EXISTS guild_announcements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                guild_id INTEGER NOT NULL,
                author_id INTEGER NOT NULL,
                title TEXT,
                message TEXT NOT NULL,
                created_at INTEGER DEFAULT (strftime('%s', 'now')),
                FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
                FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_guild_announcements_guild_id ON guild_announcements(guild_id);
            CREATE INDEX IF NOT EXISTS idx_guild_announcements_created_at ON guild_announcements(created_at);
        `);
        console.log('✓ guild tables created');
    }

    console.log('Database initialized successfully');

    // Seed items if this is first run
    const { seedItems } = require('./seedItems');
    seedItems();
}

module.exports = { db, initializeDatabase };
