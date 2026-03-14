const { LevelSystem } = require('../../utils/levelSystem');

class QuestScaling {
    /**
     * Get appropriate quest difficulty based on player level
     */
    static getQuestDifficultyForLevel(level) {
        if (level < 5) {
            // Levels 1-4: Mostly easy quests
            return ['easy', 'easy', 'easy', 'medium'];
        } else if (level < 15) {
            // Levels 5-14: Mix of easy and medium
            return ['easy', 'medium', 'medium', 'hard'];
        } else if (level < 30) {
            // Levels 15-29: Mostly medium
            return ['medium', 'medium', 'hard', 'hard'];
        } else if (level < 50) {
            // Levels 30-49: Medium and hard
            return ['medium', 'hard', 'hard', 'hard'];
        } else {
            // Level 50+: Mostly hard quests
            return ['hard', 'hard', 'hard', 'hard'];
        }
    }

    /**
     * Filter and balance quests based on player level
     */
    static filterQuestsByLevel(quests, playerLevel) {
        const difficultyDistribution = this.getQuestDifficultyForLevel(playerLevel);
        const filteredQuests = [];

        // Get count of each difficulty needed
        const difficultyCount = {
            easy: difficultyDistribution.filter(d => d === 'easy').length,
            medium: difficultyDistribution.filter(d => d === 'medium').length,
            hard: difficultyDistribution.filter(d => d === 'hard').length
        };

        // Separate quests by difficulty
        const easyQuests = quests.filter(q => q.difficulty === 'easy');
        const mediumQuests = quests.filter(q => q.difficulty === 'medium');
        const hardQuests = quests.filter(q => q.difficulty === 'hard');

        // Add quests based on distribution
        for (let i = 0; i < difficultyCount.easy && i < easyQuests.length; i++) {
            filteredQuests.push(easyQuests[i]);
        }
        for (let i = 0; i < difficultyCount.medium && i < mediumQuests.length; i++) {
            filteredQuests.push(mediumQuests[i]);
        }
        for (let i = 0; i < difficultyCount.hard && i < hardQuests.length; i++) {
            filteredQuests.push(hardQuests[i]);
        }

        // Fill remaining slots with appropriate difficulty
        while (filteredQuests.length < 5) {
            if (playerLevel < 10 && easyQuests.length > 0) {
                const randomEasy = easyQuests[Math.floor(Math.random() * easyQuests.length)];
                if (!filteredQuests.find(q => q.name === randomEasy.name)) {
                    filteredQuests.push(randomEasy);
                }
            } else if (playerLevel < 30 && mediumQuests.length > 0) {
                const randomMedium = mediumQuests[Math.floor(Math.random() * mediumQuests.length)];
                if (!filteredQuests.find(q => q.name === randomMedium.name)) {
                    filteredQuests.push(randomMedium);
                }
            } else if (hardQuests.length > 0) {
                const randomHard = hardQuests[Math.floor(Math.random() * hardQuests.length)];
                if (!filteredQuests.find(q => q.name === randomHard.name)) {
                    filteredQuests.push(randomHard);
                }
            }
        }

        return filteredQuests.slice(0, 5);
    }

    /**
     * Scale quest rewards based on player level
     */
    static scaleQuestRewards(baseReward, playerLevel, difficulty) {
        // Base scaling: +5% per level
        const levelMultiplier = 1 + (playerLevel * 0.05);

        // Difficulty bonus
        const difficultyMultiplier = {
            'easy': 1.0,
            'medium': 1.5,
            'hard': 2.0
        }[difficulty] || 1.0;

        // Apply both multipliers
        const scaledReward = Math.floor(baseReward * levelMultiplier * difficultyMultiplier);

        return scaledReward;
    }

    /**
     * Scale combat quest clicks based on level and difficulty
     */
    static getCombatClicks(playerLevel, difficulty) {
        const baseClicks = {
            'easy': 10,
            'medium': 20,
            'hard': 30
        }[difficulty] || 10;

        // Add 1 click per 5 levels
        const levelBonus = Math.floor(playerLevel / 5);

        return baseClicks + levelBonus;
    }

    /**
     * Scale gathering time based on level
     */
    static getGatheringTime(playerLevel, difficulty) {
        const baseTime = {
            'easy': 30,
            'medium': 60,
            'hard': 120
        }[difficulty] || 30;

        // Reduce time by 10% for every 10 levels (max 50% reduction)
        const levelReduction = Math.min(0.5, playerLevel * 0.01);
        const scaledTime = Math.floor(baseTime * (1 - levelReduction));

        return Math.max(10, scaledTime); // Minimum 10 seconds
    }

    /**
     * Scale delivery time based on level
     */
    static getDeliveryTime(playerLevel, difficulty) {
        const baseTime = {
            'easy': 20,
            'medium': 40,
            'hard': 60
        }[difficulty] || 20;

        // Reduce time by 10% for every 10 levels (max 50% reduction)
        const levelReduction = Math.min(0.5, playerLevel * 0.01);
        const scaledTime = Math.floor(baseTime * (1 - levelReduction));

        return Math.max(10, scaledTime); // Minimum 10 seconds
    }

    /**
     * Get combat time limit based on level
     */
    static getCombatTimeLimit(playerLevel, difficulty) {
        const baseTime = 30;

        // Add 5 seconds per 10 levels
        const levelBonus = Math.floor(playerLevel / 10) * 5;

        return baseTime + levelBonus;
    }

    /**
     * Get level-appropriate quest description
     */
    static getScaledQuestDescription(level) {
        if (level < 5) {
            return '**You are a beginner adventurer.** Quests are easier and provide basic rewards.';
        } else if (level < 15) {
            return '**You are gaining experience!** Quests are becoming more challenging.';
        } else if (level < 30) {
            return '**You are an experienced quester!** Harder quests with better rewards are available.';
        } else if (level < 50) {
            return '**You are a veteran explorer!** Only the toughest quests remain.';
        } else {
            return '**You are a legendary hero!** Face the most difficult challenges for epic rewards.';
        }
    }

    /**
     * Check if player meets quest level requirement
     */
    static meetsQuestRequirement(playerLevel, questDifficulty) {
        const requirements = {
            'easy': 1,
            'medium': 5,
            'hard': 15
        };

        return playerLevel >= (requirements[questDifficulty] || 1);
    }

    /**
     * Get bonus XP for completing quests above your level
     */
    static getBonusXP(playerLevel, questDifficulty) {
        const baseXP = LevelSystem.getQuestExperience(questDifficulty);

        // Bonus XP for low-level players doing hard quests
        if (playerLevel < 10 && questDifficulty === 'hard') {
            return Math.floor(baseXP * 1.5);
        } else if (playerLevel < 5 && questDifficulty === 'medium') {
            return Math.floor(baseXP * 1.25);
        }

        return baseXP;
    }
}

module.exports = { QuestScaling };
