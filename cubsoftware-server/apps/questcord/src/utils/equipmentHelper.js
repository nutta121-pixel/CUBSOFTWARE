const { db } = require('../database/schema');

/**
 * Auto-equips an item if it's better than what's currently equipped
 * @param {number} userId - The user's database ID
 * @param {object} item - The item from the items table
 * @returns {boolean} - True if item was equipped, false if not
 */
function autoEquipItem(userId, item) {
    if (!item || (item.item_type !== 'weapon' && item.item_type !== 'armor')) {
        console.log(`[AUTO-EQUIP] Skipping item ${item?.item_name} - not weapon or armor`);
        return false;
    }

    console.log(`[AUTO-EQUIP] Attempting to equip ${item.item_name} (type: ${item.item_type}) for user ${userId}`);

    // Check if user already has this item equipped
    const currentlyEquipped = db.prepare(`
        SELECT ui.*, i.*
        FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND i.item_type = ? AND ui.equipped = 1
    `).get(userId, item.item_type);

    if (!currentlyEquipped) {
        // No item equipped in this slot, auto-equip this one
        console.log(`[AUTO-EQUIP] No ${item.item_type} equipped, auto-equipping ${item.item_name}`);
        const result = db.prepare(`
            UPDATE user_items
            SET equipped = 1
            WHERE user_id = ? AND item_id = ?
        `).run(userId, item.id);
        console.log(`[AUTO-EQUIP] Update result: ${result.changes} rows changed`);
        return true;
    }

    // Compare stats - new item is better if it has higher total power
    const currentPower = (currentlyEquipped.attack_power || 0) +
                        (currentlyEquipped.defense_power || 0) +
                        ((currentlyEquipped.crit_chance || 0) / 2);

    const newPower = (item.attack_power || 0) +
                     (item.defense_power || 0) +
                     ((item.crit_chance || 0) / 2);

    if (newPower > currentPower) {
        // Unequip old item and equip new one
        db.prepare(`
            UPDATE user_items
            SET equipped = 0
            WHERE user_id = ? AND item_id = ?
        `).run(userId, currentlyEquipped.item_id);

        db.prepare(`
            UPDATE user_items
            SET equipped = 1
            WHERE user_id = ? AND item_id = ?
        `).run(userId, item.id);

        return true;
    }

    return false;
}

/**
 * Manually equip an item
 * @param {number} userId - The user's database ID
 * @param {number} itemId - The item ID to equip
 * @returns {object} - Result with success status and message
 */
function equipItem(userId, itemId) {
    // Check if user owns this item
    const userItem = db.prepare(`
        SELECT ui.*, i.*
        FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND ui.item_id = ?
    `).get(userId, itemId);

    if (!userItem) {
        return { success: false, message: 'You do not own this item.' };
    }

    if (userItem.item_type !== 'weapon' && userItem.item_type !== 'armor') {
        return { success: false, message: 'This item cannot be equipped.' };
    }

    if (userItem.equipped === 1) {
        return { success: false, message: 'This item is already equipped.' };
    }

    // Unequip any currently equipped item of the same type
    db.prepare(`
        UPDATE user_items
        SET equipped = 0
        WHERE user_id = ? AND item_id IN (
            SELECT ui2.item_id
            FROM user_items ui2
            JOIN items i2 ON ui2.item_id = i2.id
            WHERE ui2.user_id = ? AND i2.item_type = ? AND ui2.equipped = 1
        )
    `).run(userId, userId, userItem.item_type);

    // Equip the new item
    db.prepare(`
        UPDATE user_items
        SET equipped = 1
        WHERE user_id = ? AND item_id = ?
    `).run(userId, itemId);

    return {
        success: true,
        message: `Successfully equipped **${userItem.item_name}**!`,
        item: userItem
    };
}

/**
 * Unequip an item
 * @param {number} userId - The user's database ID
 * @param {number} itemId - The item ID to unequip
 * @returns {object} - Result with success status and message
 */
function unequipItem(userId, itemId) {
    // Check if user owns this item and it's equipped
    const userItem = db.prepare(`
        SELECT ui.*, i.*
        FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND ui.item_id = ? AND ui.equipped = 1
    `).get(userId, itemId);

    if (!userItem) {
        return { success: false, message: 'This item is not equipped.' };
    }

    db.prepare(`
        UPDATE user_items
        SET equipped = 0
        WHERE user_id = ? AND item_id = ?
    `).run(userId, itemId);

    return {
        success: true,
        message: `Successfully unequipped **${userItem.item_name}**!`,
        item: userItem
    };
}

/**
 * Get all equipped items for a user
 * @param {number} userId - The user's database ID
 * @returns {array} - Array of equipped items
 */
function getEquippedItems(userId) {
    return db.prepare(`
        SELECT ui.*, i.*
        FROM user_items ui
        JOIN items i ON ui.item_id = i.id
        WHERE ui.user_id = ? AND ui.equipped = 1
    `).all(userId);
}

module.exports = {
    autoEquipItem,
    equipItem,
    unequipItem,
    getEquippedItems
};
