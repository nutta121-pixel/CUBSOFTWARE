class LevelSystem {
    static getRequiredExperience(level) {
        return Math.floor(100 * Math.pow(1.5, level - 1));
    }

    static calculateLevel(totalExperience) {
        let level = 1;
        let expForNextLevel = this.getRequiredExperience(level);
        let accumulatedExp = 0;

        while (totalExperience >= accumulatedExp + expForNextLevel) {
            accumulatedExp += expForNextLevel;
            level++;
            expForNextLevel = this.getRequiredExperience(level);
        }

        return {
            level: level,
            currentExp: totalExperience - accumulatedExp,
            requiredExp: expForNextLevel,
            totalExp: totalExperience
        };
    }

    static addExperience(currentLevel, currentExp, totalExp, expToAdd) {
        const newTotalExp = totalExp + expToAdd;
        const levelData = this.calculateLevel(newTotalExp);

        const levelsGained = levelData.level - currentLevel;

        return {
            newLevel: levelData.level,
            newCurrentExp: levelData.currentExp,
            newTotalExp: newTotalExp,
            requiredExp: levelData.requiredExp,
            levelsGained: levelsGained,
            leveledUp: levelsGained > 0
        };
    }

    static getQuestExperience(difficulty) {
        const expMap = {
            'easy': 50,
            'medium': 100,
            'hard': 200
        };
        return expMap[difficulty] || 50;
    }

    static getBossExperience(bossMaxHealth) {
        return Math.floor(bossMaxHealth / 50);
    }

    static getLevelRewards(level) {
        // Base rewards that scale by 2% per level (compound growth)
        const baseCurrency = 100;
        const baseGems = 2;
        const growthRate = 1.02; // 2% growth per level

        return {
            currency: Math.floor(baseCurrency * Math.pow(growthRate, level - 1)),
            gems: Math.floor(baseGems * Math.pow(growthRate, level - 1))
        };
    }

    static getProgressBar(current, required, length = 10) {
        const filled = Math.floor((current / required) * length);
        const empty = length - filled;

        return '█'.repeat(filled) + '░'.repeat(empty);
    }

    static getLevelTitle(level) {
        if (level < 10) return 'Novice Adventurer';
        if (level < 25) return 'Experienced Quester';
        if (level < 50) return 'Veteran Explorer';
        if (level < 75) return 'Elite Champion';
        if (level < 100) return 'Legendary Hero';
        return 'Mythical Master';
    }
}

module.exports = { LevelSystem };
