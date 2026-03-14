const questTemplates = {
    combat: [
        {
            name: 'Monster Slayer',
            description: 'Defeat monsters in the wilderness',
            difficulty: 'easy',
            rewardCurrency: 8,
            rewardGems: 0
        },
        {
            name: 'Dragon Hunter',
            description: 'Hunt down and defeat a fierce dragon',
            difficulty: 'hard',
            rewardCurrency: 25,
            rewardGems: 2
        },
        {
            name: 'Goblin Exterminator',
            description: 'Clear out a goblin camp',
            difficulty: 'medium',
            rewardCurrency: 15,
            rewardGems: 1
        },
        {
            name: 'Undead Purge',
            description: 'Cleanse the cemetery of undead creatures',
            difficulty: 'medium',
            rewardCurrency: 18,
            rewardGems: 1
        },
        {
            name: 'Beast Tamer',
            description: 'Capture a wild beast for the arena',
            difficulty: 'hard',
            rewardCurrency: 22,
            rewardGems: 1
        }
    ],
    gathering: [
        {
            name: 'Herb Collector',
            description: 'Gather rare herbs from the forest',
            difficulty: 'easy',
            rewardCurrency: 6,
            rewardGems: 0
        },
        {
            name: 'Treasure Hunter',
            description: 'Search for buried treasure',
            difficulty: 'medium',
            rewardCurrency: 12,
            rewardGems: 1
        },
        {
            name: 'Crystal Mining',
            description: 'Mine precious crystals from the caves',
            difficulty: 'medium',
            rewardCurrency: 15,
            rewardGems: 1
        },
        {
            name: 'Ancient Relic Recovery',
            description: 'Recover ancient artifacts from ruins',
            difficulty: 'hard',
            rewardCurrency: 20,
            rewardGems: 1
        },
        {
            name: 'Mushroom Foraging',
            description: 'Collect magical mushrooms from the dark woods',
            difficulty: 'easy',
            rewardCurrency: 7,
            rewardGems: 0
        }
    ],
    exploration: [
        {
            name: 'Cave Explorer',
            description: 'Map out uncharted cave systems',
            difficulty: 'medium',
            rewardCurrency: 14,
            rewardGems: 1
        },
        {
            name: 'Mountain Climber',
            description: 'Reach the summit of the highest peak',
            difficulty: 'hard',
            rewardCurrency: 21,
            rewardGems: 1
        },
        {
            name: 'Ruins Investigation',
            description: 'Investigate mysterious ancient ruins',
            difficulty: 'medium',
            rewardCurrency: 16,
            rewardGems: 1
        },
        {
            name: 'Desert Expedition',
            description: 'Cross the treacherous desert',
            difficulty: 'hard',
            rewardCurrency: 24,
            rewardGems: 2
        },
        {
            name: 'Forest Pathfinder',
            description: 'Chart new paths through dense forest',
            difficulty: 'easy',
            rewardCurrency: 8,
            rewardGems: 0
        }
    ],
    delivery: [
        {
            name: 'Package Delivery',
            description: 'Deliver an important package to a distant town',
            difficulty: 'easy',
            rewardCurrency: 7,
            rewardGems: 0
        },
        {
            name: 'Royal Message',
            description: 'Deliver an urgent message to the king',
            difficulty: 'medium',
            rewardCurrency: 13,
            rewardGems: 1
        },
        {
            name: 'Supply Run',
            description: 'Transport supplies to a remote outpost',
            difficulty: 'medium',
            rewardCurrency: 14,
            rewardGems: 1
        },
        {
            name: 'Contraband Smuggling',
            description: 'Smuggle goods past the city guards',
            difficulty: 'hard',
            rewardCurrency: 28,
            rewardGems: 2
        }
    ],
    social: [
        {
            name: 'Town Meeting',
            description: 'Attend and participate in the town meeting',
            difficulty: 'easy',
            rewardCurrency: 5,
            rewardGems: 0
        },
        {
            name: 'Diplomatic Mission',
            description: 'Negotiate peace between two warring factions',
            difficulty: 'hard',
            rewardCurrency: 23,
            rewardGems: 1
        },
        {
            name: 'Tavern Stories',
            description: 'Gather information at the local tavern',
            difficulty: 'easy',
            rewardCurrency: 6,
            rewardGems: 0
        },
        {
            name: 'Festival Participation',
            description: 'Help organize and participate in the harvest festival',
            difficulty: 'medium',
            rewardCurrency: 12,
            rewardGems: 1
        }
    ]
};

const bossTemplates = [
    {
        type: 'dragon',
        name: 'Inferno Drake',
        health: 2000,
        rewardCurrency: 50,
        rewardGems: 2,
        tier: 1,
        rarity: 'Common',
        biome: 'volcanic'
    },
    {
        type: 'dragon',
        name: 'Ancient Fire Dragon',
        health: 10000,
        rewardCurrency: 100,
        rewardGems: 5,
        tier: 3,
        rarity: 'Epic',
        biome: 'volcanic'
    },
    {
        type: 'giant',
        name: 'Stone Titan',
        health: 12000,
        rewardCurrency: 110,
        rewardGems: 6,
        tier: 3,
        rarity: 'Epic',
        biome: 'mountain'
    },
    {
        type: 'demon',
        name: 'Shadow Demon Lord',
        health: 15000,
        rewardCurrency: 125,
        rewardGems: 7,
        tier: 4,
        rarity: 'Legendary',
        biome: 'netherworld'
    },
    {
        type: 'hydra',
        name: 'Serpent Hydra',
        health: 13000,
        rewardCurrency: 115,
        rewardGems: 6,
        tier: 3,
        rarity: 'Epic',
        biome: 'swamp'
    },
    {
        type: 'lich',
        name: 'Death Lord Lich',
        health: 11000,
        rewardCurrency: 105,
        rewardGems: 5,
        tier: 3,
        rarity: 'Rare',
        biome: 'graveyard'
    },
    {
        type: 'kraken',
        name: 'Deep Sea Kraken',
        health: 14000,
        rewardCurrency: 120,
        rewardGems: 6,
        tier: 3,
        rarity: 'Epic',
        biome: 'ocean'
    },
    {
        type: 'wolf',
        name: 'Dire Wolf',
        health: 3000,
        rewardCurrency: 60,
        rewardGems: 2,
        tier: 1,
        rarity: 'Common',
        biome: 'forest'
    },
    {
        type: 'golem',
        name: 'Ice Golem',
        health: 5000,
        rewardCurrency: 75,
        rewardGems: 3,
        tier: 2,
        rarity: 'Rare',
        biome: 'tundra'
    }
];

function getRandomQuestsByType(type, count) {
    const templates = questTemplates[type] || [];
    if (templates.length === 0) return [];

    const shuffled = [...templates].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function getRandomQuests(count) {
    const types = Object.keys(questTemplates);
    const allQuests = [];

    for (const type of types) {
        const quests = questTemplates[type].map(q => ({ ...q, type }));
        allQuests.push(...quests);
    }

    const shuffled = allQuests.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

function getRandomBoss() {
    const index = Math.floor(Math.random() * bossTemplates.length);
    return { ...bossTemplates[index] };
}

module.exports = {
    questTemplates,
    bossTemplates,
    getRandomQuestsByType,
    getRandomQuests,
    getRandomBoss
};
