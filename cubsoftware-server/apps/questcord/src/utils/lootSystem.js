const { ItemModel, UserItemModel } = require('../database/models');
const { autoEquipItem } = require('./equipmentHelper');

const LOOT_TABLES = {
    quest_easy: {
        dropChance: 0.15,
        items: [
            { weight: 50, rarity: 'common' },
            { weight: 30, rarity: 'uncommon' },
            { weight: 15, rarity: 'rare' },
            { weight: 5, rarity: 'epic' }
        ]
    },
    quest_medium: {
        dropChance: 0.25,
        items: [
            { weight: 40, rarity: 'common' },
            { weight: 35, rarity: 'uncommon' },
            { weight: 20, rarity: 'rare' },
            { weight: 5, rarity: 'epic' }
        ]
    },
    quest_hard: {
        dropChance: 0.35,
        items: [
            { weight: 30, rarity: 'common' },
            { weight: 35, rarity: 'uncommon' },
            { weight: 25, rarity: 'rare' },
            { weight: 10, rarity: 'epic' }
        ]
    },
    boss: {
        dropChance: 0.75,
        items: [
            { weight: 20, rarity: 'uncommon' },
            { weight: 40, rarity: 'rare' },
            { weight: 30, rarity: 'epic' },
            { weight: 10, rarity: 'legendary' }
        ]
    }
};

const EQUIPMENT_POOL = {
    weapon: {
        common: [
            { name: 'Rusty Sword', attack: 5, defense: 0, level: 1 },
            { name: 'Wooden Staff', attack: 4, defense: 1, level: 1 },
            { name: 'Dull Dagger', attack: 6, defense: 0, level: 1 }
        ],
        uncommon: [
            { name: 'Iron Sword', attack: 12, defense: 2, level: 5 },
            { name: 'Battle Axe', attack: 15, defense: 0, level: 5 },
            { name: 'Enchanted Staff', attack: 10, defense: 4, level: 5 }
        ],
        rare: [
            { name: 'Steel Greatsword', attack: 25, defense: 5, level: 10 },
            { name: 'Mystic Wand', attack: 22, defense: 8, level: 10 },
            { name: 'Assassin Blade', attack: 28, defense: 2, level: 10 }
        ],
        epic: [
            { name: 'Dragonbone Sword', attack: 45, defense: 10, level: 15 },
            { name: 'Archmage Staff', attack: 40, defense: 15, level: 15 },
            { name: 'Shadow Scythe', attack: 50, defense: 5, level: 15 }
        ],
        legendary: [
            { name: 'Excalibur', attack: 80, defense: 20, level: 20 },
            { name: 'Staff of the Cosmos', attack: 75, defense: 25, level: 20 },
            { name: 'Blade of Eternity', attack: 90, defense: 15, level: 20 }
        ]
    },
    helmet: {
        common: [
            { name: 'Leather Cap', attack: 0, defense: 3, level: 1 },
            { name: 'Cloth Hood', attack: 0, defense: 2, level: 1 }
        ],
        uncommon: [
            { name: 'Iron Helmet', attack: 0, defense: 8, level: 5 },
            { name: 'Chainmail Coif', attack: 0, defense: 7, level: 5 }
        ],
        rare: [
            { name: 'Steel Helm', attack: 0, defense: 15, level: 10 },
            { name: 'Enchanted Crown', attack: 0, defense: 18, level: 10 }
        ],
        epic: [
            { name: 'Dragonscale Helmet', attack: 0, defense: 30, level: 15 },
            { name: 'Royal Crown', attack: 0, defense: 28, level: 15 }
        ],
        legendary: [
            { name: 'Crown of Kings', attack: 0, defense: 50, level: 20 },
            { name: 'Celestial Halo', attack: 0, defense: 55, level: 20 }
        ]
    },
    chest: {
        common: [
            { name: 'Leather Tunic', attack: 0, defense: 5, level: 1 },
            { name: 'Cloth Robe', attack: 0, defense: 4, level: 1 }
        ],
        uncommon: [
            { name: 'Iron Chestplate', attack: 0, defense: 12, level: 5 },
            { name: 'Chainmail Armor', attack: 0, defense: 10, level: 5 }
        ],
        rare: [
            { name: 'Steel Plate Armor', attack: 0, defense: 25, level: 10 },
            { name: 'Mystic Robes', attack: 0, defense: 22, level: 10 }
        ],
        epic: [
            { name: 'Dragonscale Armor', attack: 0, defense: 45, level: 15 },
            { name: 'Arcane Vestments', attack: 0, defense: 40, level: 15 }
        ],
        legendary: [
            { name: 'Armor of the Ancients', attack: 0, defense: 75, level: 20 },
            { name: 'Celestial Plate', attack: 0, defense: 80, level: 20 }
        ]
    },
    legs: {
        common: [
            { name: 'Leather Pants', attack: 0, defense: 4, level: 1 },
            { name: 'Cloth Leggings', attack: 0, defense: 3, level: 1 }
        ],
        uncommon: [
            { name: 'Iron Greaves', attack: 0, defense: 10, level: 5 },
            { name: 'Chainmail Leggings', attack: 0, defense: 8, level: 5 }
        ],
        rare: [
            { name: 'Steel Legplates', attack: 0, defense: 20, level: 10 },
            { name: 'Enchanted Pants', attack: 0, defense: 18, level: 10 }
        ],
        epic: [
            { name: 'Dragonscale Leggings', attack: 0, defense: 35, level: 15 },
            { name: 'Royal Greaves', attack: 0, defense: 32, level: 15 }
        ],
        legendary: [
            { name: 'Legplates of Legends', attack: 0, defense: 60, level: 20 },
            { name: 'Celestial Greaves', attack: 0, defense: 65, level: 20 }
        ]
    },
    boots: {
        common: [
            { name: 'Leather Boots', attack: 0, defense: 3, level: 1 },
            { name: 'Cloth Shoes', attack: 0, defense: 2, level: 1 }
        ],
        uncommon: [
            { name: 'Iron Boots', attack: 0, defense: 7, level: 5 },
            { name: 'Sturdy Boots', attack: 0, defense: 6, level: 5 }
        ],
        rare: [
            { name: 'Steel Sabatons', attack: 0, defense: 15, level: 10 },
            { name: 'Boots of Swiftness', attack: 0, defense: 12, level: 10 }
        ],
        epic: [
            { name: 'Dragonscale Boots', attack: 0, defense: 25, level: 15 },
            { name: 'Winged Sandals', attack: 0, defense: 22, level: 15 }
        ],
        legendary: [
            { name: 'Boots of the Gods', attack: 0, defense: 45, level: 20 },
            { name: 'Celestial Treads', attack: 0, defense: 50, level: 20 }
        ]
    }
};

class LootSystem {
    static rollForLoot(lootTableKey) {
        const lootTable = LOOT_TABLES[lootTableKey];
        if (!lootTable) return null;

        if (Math.random() > lootTable.dropChance) {
            return null;
        }

        const rarity = this.selectRarity(lootTable.items);
        const slot = this.selectSlot();
        const item = this.selectItem(slot, rarity);

        return { ...item, slot, rarity };
    }

    static selectRarity(rarityWeights) {
        const totalWeight = rarityWeights.reduce((sum, item) => sum + item.weight, 0);
        let random = Math.random() * totalWeight;

        for (const item of rarityWeights) {
            random -= item.weight;
            if (random <= 0) {
                return item.rarity;
            }
        }

        return rarityWeights[0].rarity;
    }

    static selectSlot() {
        const slots = ['weapon', 'helmet', 'chest', 'legs', 'boots'];
        return slots[Math.floor(Math.random() * slots.length)];
    }

    static selectItem(slot, rarity) {
        const items = EQUIPMENT_POOL[slot]?.[rarity];
        if (!items || items.length === 0) {
            return EQUIPMENT_POOL[slot]['common'][0];
        }

        return items[Math.floor(Math.random() * items.length)];
    }

    static async giveItemToUser(userId, itemData) {
        const { db } = require('../database/schema');
        let item = ItemModel.findByName(itemData.name);

        if (!item) {
            ItemModel.create(
                itemData.name,
                `A ${itemData.rarity} ${itemData.slot}`,
                itemData.rarity,
                itemData.slot === 'weapon' ? 'weapon' : 'armor',
                itemData.slot,
                itemData.attack,
                itemData.defense,
                itemData.level,
                0,
                0
            );
            item = ItemModel.findByName(itemData.name);
        }

        if (item) {
            // Check if user already owns this item
            const existingItem = db.prepare('SELECT * FROM user_items WHERE user_id = ? AND item_id = ?').get(userId, item.id);

            if (existingItem) {
                // User already has this item, just increase quantity
                UserItemModel.addItem(userId, item.id, 1);
                return item;
            }

            // Give item to user
            db.prepare('INSERT INTO user_items (user_id, item_id, quantity, equipped) VALUES (?, ?, 1, 0)').run(userId, item.id);

            // Try to auto-equip if it's better than current equipment
            autoEquipItem(userId, item);
        }

        return item;
    }

    static getRarityColor(rarity) {
        const colors = {
            common: '#9ca3af',
            uncommon: '#10b981',
            rare: '#3b82f6',
            epic: '#8b5cf6',
            legendary: '#f59e0b'
        };
        return colors[rarity] || colors.common;
    }

    static getRarityEmoji(rarity) {
        const emojis = {
            common: '⚪',
            uncommon: '🟢',
            rare: '🔵',
            epic: '🟣',
            legendary: '🟡'
        };
        return emojis[rarity] || emojis.common;
    }
}

module.exports = { LootSystem };
