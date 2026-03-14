const { db } = require('./schema');

const weapons = [
    // Common Weapons (50-100 Dakari, 0-5 gems)
    { name: 'Rusty Sword', description: 'A worn blade, but better than nothing', rarity: 'common', item_type: 'weapon', attack_power: 5, defense_power: 0, crit_chance: 5, currency_cost: 50, gem_cost: 0 },
    { name: 'Wooden Club', description: 'Simple but effective', rarity: 'common', item_type: 'weapon', attack_power: 4, defense_power: 1, crit_chance: 3, currency_cost: 60, gem_cost: 0 },
    { name: 'Iron Dagger', description: 'Quick and precise', rarity: 'common', item_type: 'weapon', attack_power: 6, defense_power: 0, crit_chance: 8, currency_cost: 75, gem_cost: 2 },

    // Uncommon Weapons (150-250 Dakari, 5-10 gems)
    { name: 'Steel Sword', description: 'A reliable weapon for any warrior', rarity: 'uncommon', item_type: 'weapon', attack_power: 12, defense_power: 2, crit_chance: 10, currency_cost: 180, gem_cost: 8 },
    { name: 'Battle Axe', description: 'Heavy and devastating', rarity: 'uncommon', item_type: 'weapon', attack_power: 15, defense_power: 0, crit_chance: 7, currency_cost: 200, gem_cost: 10 },
    { name: 'War Hammer', description: 'Crushes armor and bones', rarity: 'uncommon', item_type: 'weapon', attack_power: 14, defense_power: 3, crit_chance: 5, currency_cost: 220, gem_cost: 9 },
    { name: 'Longbow', description: 'Strike from a distance', rarity: 'uncommon', item_type: 'weapon', attack_power: 11, defense_power: 0, crit_chance: 15, currency_cost: 190, gem_cost: 7 },

    // Rare Weapons (350-500 Dakari, 15-25 gems)
    { name: 'Enchanted Blade', description: 'Imbued with magical energy', rarity: 'rare', item_type: 'weapon', attack_power: 20, defense_power: 5, crit_chance: 15, currency_cost: 400, gem_cost: 20 },
    { name: 'Dragon Spear', description: 'Forged from dragon scales', rarity: 'rare', item_type: 'weapon', attack_power: 22, defense_power: 3, crit_chance: 12, currency_cost: 450, gem_cost: 22 },
    { name: 'Shadow Daggers', description: 'Twin blades that strike from darkness', rarity: 'rare', item_type: 'weapon', attack_power: 18, defense_power: 0, crit_chance: 25, currency_cost: 420, gem_cost: 18 },
    { name: 'Crystal Staff', description: 'Channels arcane power', rarity: 'rare', item_type: 'weapon', attack_power: 19, defense_power: 6, crit_chance: 18, currency_cost: 430, gem_cost: 21 },

    // Epic Weapons (600-800 Dakari, 30-50 gems)
    { name: 'Excalibur', description: 'The legendary sword of kings', rarity: 'epic', item_type: 'weapon', attack_power: 30, defense_power: 10, crit_chance: 20, currency_cost: 700, gem_cost: 40 },
    { name: 'Mjolnir', description: 'The hammer of thunder', rarity: 'epic', item_type: 'weapon', attack_power: 35, defense_power: 8, crit_chance: 15, currency_cost: 750, gem_cost: 45 },
    { name: 'Demon Slayer', description: 'Forged to vanquish evil', rarity: 'epic', item_type: 'weapon', attack_power: 32, defense_power: 7, crit_chance: 22, currency_cost: 720, gem_cost: 42 },

    // Legendary Weapons (1000-1500 Dakari, 60-100 gems)
    { name: 'Blade of Eternity', description: 'A weapon that transcends time', rarity: 'legendary', item_type: 'weapon', attack_power: 45, defense_power: 15, crit_chance: 30, currency_cost: 1200, gem_cost: 80 },
    { name: 'Godslayer', description: 'The ultimate weapon of destruction', rarity: 'legendary', item_type: 'weapon', attack_power: 50, defense_power: 12, crit_chance: 35, currency_cost: 1500, gem_cost: 100 },

    // Mythic Weapons (Not for sale - dev only)
    { name: 'CUBS Excalibur', description: 'The divine blade of CUB, forged in the fires of creation itself - The most powerful weapon in existence', rarity: 'mythic', item_type: 'weapon', attack_power: 100, defense_power: 30, crit_chance: 60, currency_cost: 0, gem_cost: 0 },
    { name: 'NUTTAS Godslayer', description: 'NUTTAS\' legendary blade, capable of slaying gods and shattering realms', rarity: 'mythic', item_type: 'weapon', attack_power: 80, defense_power: 20, crit_chance: 50, currency_cost: 0, gem_cost: 0 }
];

const armor = [
    // Common Armor (40-80 Dakari, 0-5 gems)
    { name: 'Leather Vest', description: 'Basic protection', rarity: 'common', item_type: 'armor', attack_power: 0, defense_power: 5, crit_chance: 0, currency_cost: 45, gem_cost: 0 },
    { name: 'Cloth Robe', description: 'Light and comfortable', rarity: 'common', item_type: 'armor', attack_power: 0, defense_power: 4, crit_chance: 0, currency_cost: 40, gem_cost: 0 },

    // Uncommon Armor (120-200 Dakari, 5-10 gems)
    { name: 'Chainmail', description: 'Linked metal rings provide solid defense', rarity: 'uncommon', item_type: 'armor', attack_power: 0, defense_power: 12, crit_chance: 0, currency_cost: 170, gem_cost: 8 },
    { name: 'Reinforced Leather', description: 'Sturdy and flexible', rarity: 'uncommon', item_type: 'armor', attack_power: 0, defense_power: 10, crit_chance: 0, currency_cost: 150, gem_cost: 6 },

    // Rare Armor (300-450 Dakari, 15-25 gems)
    { name: 'Plate Armor', description: 'Heavy but incredibly protective', rarity: 'rare', item_type: 'armor', attack_power: 0, defense_power: 20, crit_chance: 0, currency_cost: 380, gem_cost: 19 },
    { name: 'Dragon Scale Armor', description: 'Forged from dragon scales', rarity: 'rare', item_type: 'armor', attack_power: 2, defense_power: 22, crit_chance: 0, currency_cost: 420, gem_cost: 22 },

    // Epic Armor (550-700 Dakari, 30-45 gems)
    { name: 'Aegis Shield', description: 'The shield of legends', rarity: 'epic', item_type: 'armor', attack_power: 3, defense_power: 30, crit_chance: 0, currency_cost: 650, gem_cost: 38 },

    // Legendary Armor (900-1300 Dakari, 55-90 gems)
    { name: 'Armor of the Gods', description: 'Divine protection', rarity: 'legendary', item_type: 'armor', attack_power: 5, defense_power: 40, crit_chance: 5, currency_cost: 1100, gem_cost: 75 }
];

function seedItems() {
    try {
        console.log('Seeding items database...');

        const allItems = [...weapons, ...armor];
        let inserted = 0;
        let skipped = 0;

        allItems.forEach(item => {
            try {
                db.prepare(`
                    INSERT OR IGNORE INTO items (item_name, description, rarity, item_type, attack_power, defense_power, crit_chance, currency_cost, gem_cost)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                    item.name,
                    item.description,
                    item.rarity,
                    item.item_type,
                    item.attack_power,
                    item.defense_power,
                    item.crit_chance,
                    item.currency_cost,
                    item.gem_cost
                );
                inserted++;
            } catch (error) {
                skipped++;
            }
        });

        console.log(`Items seeded: ${inserted} inserted, ${skipped} skipped (already exist)`);
    } catch (error) {
        console.error('Error seeding items:', error);
    }
}

module.exports = { seedItems };
