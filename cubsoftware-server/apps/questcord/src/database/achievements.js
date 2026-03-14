/**
 * Achievement Definitions
 * Categories: combat, exploration, social, collection, mastery, special
 * Rarity: common, uncommon, rare, epic, legendary
 * Criteria Types: quest_count, boss_count, level, currency, pvp_wins, login_streak, travel_count, item_count
 */

const achievements = [
    // ===== COMBAT ACHIEVEMENTS =====
    {
        id: 'first_blood',
        name: 'First Blood',
        description: 'Defeat your first boss',
        category: 'combat',
        icon: '⚔️',
        points: 10,
        rarity: 'common',
        criteria_type: 'boss_count',
        criteria_value: 1,
        hidden: 0
    },
    {
        id: 'boss_hunter',
        name: 'Boss Hunter',
        description: 'Defeat 10 bosses',
        category: 'combat',
        icon: '🗡️',
        points: 25,
        rarity: 'uncommon',
        criteria_type: 'boss_count',
        criteria_value: 10,
        hidden: 0
    },
    {
        id: 'boss_slayer',
        name: 'Boss Slayer',
        description: 'Defeat 50 bosses',
        category: 'combat',
        icon: '⚡',
        points: 50,
        rarity: 'rare',
        criteria_type: 'boss_count',
        criteria_value: 50,
        hidden: 0
    },
    {
        id: 'boss_legend',
        name: 'Boss Legend',
        description: 'Defeat 100 bosses',
        category: 'combat',
        icon: '👑',
        points: 100,
        rarity: 'epic',
        criteria_type: 'boss_count',
        criteria_value: 100,
        hidden: 0
    },
    {
        id: 'god_slayer',
        name: 'God Slayer',
        description: 'Defeat 500 bosses',
        category: 'combat',
        icon: '🌟',
        points: 250,
        rarity: 'legendary',
        criteria_type: 'boss_count',
        criteria_value: 500,
        hidden: 0
    },
    {
        id: 'pvp_initiate',
        name: 'PvP Initiate',
        description: 'Win your first PvP battle',
        category: 'combat',
        icon: '🥊',
        points: 10,
        rarity: 'common',
        criteria_type: 'pvp_wins',
        criteria_value: 1,
        hidden: 0
    },
    {
        id: 'pvp_warrior',
        name: 'PvP Warrior',
        description: 'Win 25 PvP battles',
        category: 'combat',
        icon: '🥋',
        points: 50,
        rarity: 'rare',
        criteria_type: 'pvp_wins',
        criteria_value: 25,
        hidden: 0
    },
    {
        id: 'pvp_champion',
        name: 'PvP Champion',
        description: 'Win 100 PvP battles',
        category: 'combat',
        icon: '🏆',
        points: 150,
        rarity: 'epic',
        criteria_type: 'pvp_wins',
        criteria_value: 100,
        hidden: 0
    },

    // ===== EXPLORATION ACHIEVEMENTS =====
    {
        id: 'first_quest',
        name: 'First Quest',
        description: 'Complete your first quest',
        category: 'exploration',
        icon: '📜',
        points: 10,
        rarity: 'common',
        criteria_type: 'quest_count',
        criteria_value: 1,
        hidden: 0
    },
    {
        id: 'quest_enthusiast',
        name: 'Quest Enthusiast',
        description: 'Complete 10 quests',
        category: 'exploration',
        icon: '📖',
        points: 25,
        rarity: 'uncommon',
        criteria_type: 'quest_count',
        criteria_value: 10,
        hidden: 0
    },
    {
        id: 'quest_master',
        name: 'Quest Master',
        description: 'Complete 50 quests',
        category: 'exploration',
        icon: '📚',
        points: 50,
        rarity: 'rare',
        criteria_type: 'quest_count',
        criteria_value: 50,
        hidden: 0
    },
    {
        id: 'quest_legend',
        name: 'Quest Legend',
        description: 'Complete 100 quests',
        category: 'exploration',
        icon: '🎖️',
        points: 100,
        rarity: 'epic',
        criteria_type: 'quest_count',
        criteria_value: 100,
        hidden: 0
    },
    {
        id: 'quest_god',
        name: 'Quest God',
        description: 'Complete 500 quests',
        category: 'exploration',
        icon: '✨',
        points: 250,
        rarity: 'legendary',
        criteria_type: 'quest_count',
        criteria_value: 500,
        hidden: 0
    },
    {
        id: 'wanderer',
        name: 'Wanderer',
        description: 'Travel to 5 different servers',
        category: 'exploration',
        icon: '🗺️',
        points: 15,
        rarity: 'common',
        criteria_type: 'travel_count',
        criteria_value: 5,
        hidden: 0
    },
    {
        id: 'explorer',
        name: 'Explorer',
        description: 'Travel to 25 different servers',
        category: 'exploration',
        icon: '🧭',
        points: 40,
        rarity: 'uncommon',
        criteria_type: 'travel_count',
        criteria_value: 25,
        hidden: 0
    },
    {
        id: 'world_traveler',
        name: 'World Traveler',
        description: 'Travel to 100 different servers',
        category: 'exploration',
        icon: '🌍',
        points: 100,
        rarity: 'rare',
        criteria_type: 'travel_count',
        criteria_value: 100,
        hidden: 0
    },

    // ===== PROGRESSION ACHIEVEMENTS =====
    {
        id: 'level_10',
        name: 'Apprentice',
        description: 'Reach level 10',
        category: 'mastery',
        icon: '⬆️',
        points: 20,
        rarity: 'common',
        criteria_type: 'level',
        criteria_value: 10,
        hidden: 0
    },
    {
        id: 'level_25',
        name: 'Journeyman',
        description: 'Reach level 25',
        category: 'mastery',
        icon: '📈',
        points: 50,
        rarity: 'uncommon',
        criteria_type: 'level',
        criteria_value: 25,
        hidden: 0
    },
    {
        id: 'level_50',
        name: 'Expert',
        description: 'Reach level 50',
        category: 'mastery',
        icon: '💫',
        points: 100,
        rarity: 'rare',
        criteria_type: 'level',
        criteria_value: 50,
        hidden: 0
    },
    {
        id: 'level_75',
        name: 'Master',
        description: 'Reach level 75',
        category: 'mastery',
        icon: '🌠',
        points: 150,
        rarity: 'epic',
        criteria_type: 'level',
        criteria_value: 75,
        hidden: 0
    },
    {
        id: 'level_100',
        name: 'Grandmaster',
        description: 'Reach level 100',
        category: 'mastery',
        icon: '🔥',
        points: 250,
        rarity: 'legendary',
        criteria_type: 'level',
        criteria_value: 100,
        hidden: 0
    },

    // ===== WEALTH ACHIEVEMENTS =====
    {
        id: 'first_thousand',
        name: 'First Thousand',
        description: 'Accumulate 1,000 Dakari',
        category: 'collection',
        icon: '💰',
        points: 10,
        rarity: 'common',
        criteria_type: 'currency',
        criteria_value: 1000,
        hidden: 0
    },
    {
        id: 'wealthy',
        name: 'Wealthy',
        description: 'Accumulate 10,000 Dakari',
        category: 'collection',
        icon: '💎',
        points: 30,
        rarity: 'uncommon',
        criteria_type: 'currency',
        criteria_value: 10000,
        hidden: 0
    },
    {
        id: 'rich',
        name: 'Rich',
        description: 'Accumulate 100,000 Dakari',
        category: 'collection',
        icon: '💵',
        points: 75,
        rarity: 'rare',
        criteria_type: 'currency',
        criteria_value: 100000,
        hidden: 0
    },
    {
        id: 'millionaire',
        name: 'Millionaire',
        description: 'Accumulate 1,000,000 Dakari',
        category: 'collection',
        icon: '🏦',
        points: 150,
        rarity: 'epic',
        criteria_type: 'currency',
        criteria_value: 1000000,
        hidden: 0
    },
    {
        id: 'tycoon',
        name: 'Tycoon',
        description: 'Accumulate 10,000,000 Dakari',
        category: 'collection',
        icon: '👑',
        points: 300,
        rarity: 'legendary',
        criteria_type: 'currency',
        criteria_value: 10000000,
        hidden: 0
    },

    // ===== SOCIAL ACHIEVEMENTS =====
    {
        id: 'dedicated_player',
        name: 'Dedicated Player',
        description: 'Maintain a 7-day login streak',
        category: 'social',
        icon: '📅',
        points: 20,
        rarity: 'common',
        criteria_type: 'login_streak',
        criteria_value: 7,
        hidden: 0
    },
    {
        id: 'committed_player',
        name: 'Committed Player',
        description: 'Maintain a 30-day login streak',
        category: 'social',
        icon: '🗓️',
        points: 50,
        rarity: 'uncommon',
        criteria_type: 'login_streak',
        criteria_value: 30,
        hidden: 0
    },
    {
        id: 'loyal_player',
        name: 'Loyal Player',
        description: 'Maintain a 100-day login streak',
        category: 'social',
        icon: '📆',
        points: 100,
        rarity: 'rare',
        criteria_type: 'login_streak',
        criteria_value: 100,
        hidden: 0
    },
    {
        id: 'devoted_player',
        name: 'Devoted Player',
        description: 'Maintain a 365-day login streak',
        category: 'social',
        icon: '🎯',
        points: 250,
        rarity: 'legendary',
        criteria_type: 'login_streak',
        criteria_value: 365,
        hidden: 0
    },

    // ===== SPECIAL/HIDDEN ACHIEVEMENTS =====
    {
        id: 'early_adopter',
        name: 'Early Adopter',
        description: 'Join QuestCord in its first month',
        category: 'special',
        icon: '🎉',
        points: 50,
        rarity: 'rare',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 1
    },
    {
        id: 'verified',
        name: 'Verified User',
        description: 'Become a verified user',
        category: 'special',
        icon: '✅',
        points: 100,
        rarity: 'epic',
        criteria_type: 'verified',
        criteria_value: 1,
        hidden: 1
    },
    {
        id: 'first_to_max',
        name: 'First to Max',
        description: 'Be the first player to reach level 100',
        category: 'special',
        icon: '🏅',
        points: 500,
        rarity: 'legendary',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 1
    },
    {
        id: 'top_ranker',
        name: 'Top Ranker',
        description: 'Reach rank #1 on the monthly leaderboard',
        category: 'special',
        icon: '🥇',
        points: 200,
        rarity: 'epic',
        criteria_type: 'rank',
        criteria_value: 1,
        hidden: 0
    },
    {
        id: 'collector_bronze',
        name: 'Bronze Collector',
        description: 'Own 10 different items',
        category: 'collection',
        icon: '🥉',
        points: 15,
        rarity: 'common',
        criteria_type: 'item_count',
        criteria_value: 10,
        hidden: 0
    },
    {
        id: 'collector_silver',
        name: 'Silver Collector',
        description: 'Own 50 different items',
        category: 'collection',
        icon: '🥈',
        points: 40,
        rarity: 'uncommon',
        criteria_type: 'item_count',
        criteria_value: 50,
        hidden: 0
    },
    {
        id: 'collector_gold',
        name: 'Gold Collector',
        description: 'Own 100 different items',
        category: 'collection',
        icon: '🥇',
        points: 100,
        rarity: 'rare',
        criteria_type: 'item_count',
        criteria_value: 100,
        hidden: 0
    },
    {
        id: 'completionist',
        name: 'Completionist',
        description: 'Unlock all non-hidden achievements',
        category: 'special',
        icon: '💯',
        points: 1000,
        rarity: 'legendary',
        criteria_type: 'achievement_count',
        criteria_value: 40,
        hidden: 0
    },

    // ===== COMBAT MASTERY =====
    {
        id: 'flawless_victory',
        name: 'Flawless Victory',
        description: 'Defeat a boss without taking damage',
        category: 'combat',
        icon: '🛡️',
        points: 50,
        rarity: 'rare',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    },
    {
        id: 'speed_runner',
        name: 'Speed Runner',
        description: 'Complete 10 quests in one day',
        category: 'exploration',
        icon: '⚡',
        points: 30,
        rarity: 'uncommon',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    },
    {
        id: 'survivor',
        name: 'Survivor',
        description: 'Win a PvP battle with less than 10% health',
        category: 'combat',
        icon: '❤️',
        points: 40,
        rarity: 'uncommon',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    },
    {
        id: 'generous',
        name: 'Generous Soul',
        description: 'Give away 10,000 Dakari to other players',
        category: 'social',
        icon: '🎁',
        points: 50,
        rarity: 'uncommon',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    },
    {
        id: 'perfectionist',
        name: 'Perfectionist',
        description: 'Complete 100 quests with perfect score',
        category: 'mastery',
        icon: '⭐',
        points: 100,
        rarity: 'rare',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    },
    {
        id: 'comeback_king',
        name: 'Comeback King',
        description: 'Win 10 PvP battles from behind',
        category: 'combat',
        icon: '🔄',
        points: 60,
        rarity: 'rare',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    },
    {
        id: 'night_owl',
        name: 'Night Owl',
        description: 'Complete a quest between 2 AM and 4 AM',
        category: 'special',
        icon: '🦉',
        points: 25,
        rarity: 'uncommon',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 1
    },
    {
        id: 'lucky_seven',
        name: 'Lucky Seven',
        description: 'Win 7 battles in a row',
        category: 'combat',
        icon: '🍀',
        points: 50,
        rarity: 'rare',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    },
    {
        id: 'underdog',
        name: 'Underdog',
        description: 'Defeat a player 20+ levels higher than you',
        category: 'combat',
        icon: '🐕',
        points: 75,
        rarity: 'rare',
        criteria_type: 'special',
        criteria_value: 0,
        hidden: 0
    }
];

module.exports = { achievements };
