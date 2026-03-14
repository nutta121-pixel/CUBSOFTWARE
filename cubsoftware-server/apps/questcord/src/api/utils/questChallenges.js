const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Word bank for scrambling (250 words)
const WORDS = [
    'dragon', 'warrior', 'treasure', 'dungeon', 'crystal', 'magic', 'sword', 'shield',
    'potion', 'forest', 'mountain', 'castle', 'quest', 'adventure', 'hero', 'legend',
    'monster', 'beast', 'knight', 'wizard', 'battle', 'victory', 'courage', 'power',
    'ancient', 'mystic', 'guardian', 'champion', 'realm', 'kingdom', 'glory', 'honor',
    'shadow', 'light', 'darkness', 'thunder', 'lightning', 'storm', 'fire', 'water',
    'earth', 'wind', 'ice', 'flame', 'frost', 'blaze', 'ember', 'spark',
    'portal', 'gate', 'tower', 'fortress', 'temple', 'shrine', 'tomb', 'crypt',
    'goblin', 'orc', 'troll', 'giant', 'demon', 'angel', 'spirit', 'ghost',
    'skeleton', 'zombie', 'vampire', 'werewolf', 'phoenix', 'griffin', 'hydra', 'kraken',
    'armor', 'helmet', 'gauntlet', 'boots', 'cloak', 'robe', 'staff', 'wand',
    'bow', 'arrow', 'spear', 'axe', 'hammer', 'dagger', 'blade', 'katana',
    'gold', 'silver', 'bronze', 'copper', 'platinum', 'diamond', 'ruby', 'emerald',
    'sapphire', 'pearl', 'jade', 'amber', 'topaz', 'amethyst', 'garnet', 'opal',
    'ring', 'amulet', 'pendant', 'charm', 'talisman', 'relic', 'artifact', 'crown',
    'throne', 'scepter', 'orb', 'chalice', 'grail', 'scroll', 'tome', 'grimoire',
    'spell', 'curse', 'hex', 'charm', 'enchant', 'blessing', 'ward', 'seal',
    'rune', 'glyph', 'sigil', 'mark', 'symbol', 'token', 'badge', 'crest',
    'guild', 'clan', 'tribe', 'faction', 'order', 'council', 'alliance', 'legion',
    'valor', 'pride', 'wrath', 'fury', 'rage', 'peace', 'hope', 'faith',
    'justice', 'mercy', 'wisdom', 'strength', 'speed', 'agility', 'defense', 'offense',
    'health', 'mana', 'energy', 'stamina', 'vigor', 'vitality', 'spirit', 'soul',
    'destiny', 'fate', 'fortune', 'luck', 'chance', 'oracle', 'prophecy', 'vision',
    'dream', 'nightmare', 'phantom', 'specter', 'wraith', 'banshee', 'lich', 'necromancer',
    'paladin', 'ranger', 'rogue', 'assassin', 'monk', 'druid', 'shaman', 'sorcerer',
    'warlock', 'cleric', 'priest', 'mage', 'sage', 'scholar', 'scribe', 'bard',
    'blacksmith', 'merchant', 'trader', 'vendor', 'innkeeper', 'farmer', 'hunter', 'fisher',
    'village', 'town', 'city', 'capital', 'empire', 'nation', 'province', 'district',
    'island', 'continent', 'world', 'universe', 'dimension', 'plane', 'void', 'abyss',
    'heaven', 'hell', 'purgatory', 'limbo', 'paradise', 'utopia', 'dystopia', 'ruins',
    'wasteland', 'desert', 'tundra', 'jungle', 'swamp', 'marsh', 'valley', 'canyon',
    'river', 'lake', 'ocean', 'sea', 'bay', 'harbor', 'coast', 'shore',
    'peak', 'summit', 'cliff', 'ridge', 'hill', 'plateau', 'plain', 'field',
    'cave', 'cavern', 'grotto', 'mine', 'quarry', 'pit', 'well', 'spring'
];

// Trivia questions
const TRIVIA = [
    { question: 'What is the name of the currency in QuestCord?', answer: 'dakari', alternatives: ['Dakari'] },
    { question: 'How many quests can you complete per server each day?', answer: '6', alternatives: ['six'] },
    { question: 'What do you fight with other players?', answer: 'boss', alternatives: ['bosses', 'a boss'] },
    { question: 'What do you earn from completing quests?', answer: 'dakari', alternatives: ['gems', 'dakari and gems', 'rewards'] },
    { question: 'How long does a boss stay active?', answer: '60', alternatives: ['60 minutes', 'one hour', '1 hour', 'an hour'] },
    { question: 'What command shows your balance?', answer: '/balance', alternatives: ['balance'] },
    { question: 'What command shows available quests?', answer: '/quests', alternatives: ['quests'] },
    { question: 'What are the three quest difficulties?', answer: 'easy', alternatives: ['easy medium hard', 'medium', 'hard'] }
];

// Characters for memory game
const LOWERCASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const UPPERCASE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const NUMBERS = '0123456789'.split('');

/**
 * Get time limit based on difficulty
 * @param {string} difficulty - easy, medium, or hard
 * @returns {number} Time limit in seconds
 */
function getTimeLimit(difficulty) {
    switch (difficulty) {
        case 'easy':
            return 30;
        case 'medium':
            return 25;
        case 'hard':
            return 20;
        default:
            return 30;
    }
}

/**
 * Generate a random challenge
 * @param {string} difficulty - Quest difficulty (easy, medium, hard)
 * @returns {Object} Challenge object with type, data, and answer
 */
function generateChallenge(difficulty = 'medium') {
    const types = ['word_scramble', 'math', 'trivia', 'reaction', 'memory'];
    const type = types[Math.floor(Math.random() * types.length)];
    const timeLimit = getTimeLimit(difficulty);

    switch (type) {
        case 'word_scramble':
            return generateWordScramble(timeLimit);
        case 'math':
            return generateMathChallenge(timeLimit);
        case 'trivia':
            return generateTrivia(timeLimit);
        case 'reaction':
            return generateReactionTest(timeLimit);
        case 'memory':
            return generateMemoryGame(timeLimit, difficulty);
        default:
            return generateWordScramble(timeLimit);
    }
}

/**
 * Word Scramble Challenge
 */
function generateWordScramble(timeLimit) {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const scrambled = word.split('').sort(() => Math.random() - 0.5).join('');

    return {
        type: 'word_scramble',
        title: '🔤 Word Scramble Challenge',
        description: `Unscramble this word: **${scrambled.toUpperCase()}**\n\nYou have ${timeLimit} seconds to respond with your answer!`,
        answer: word.toLowerCase(),
        scrambled: scrambled,
        timeLimit: timeLimit
    };
}

/**
 * Math Challenge
 */
function generateMathChallenge(timeLimit) {
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];

    let num1, num2, answer;

    if (operator === '*') {
        num1 = Math.floor(Math.random() * 12) + 1;
        num2 = Math.floor(Math.random() * 12) + 1;
        answer = num1 * num2;
    } else if (operator === '+') {
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        answer = num1 + num2;
    } else {
        num2 = Math.floor(Math.random() * 30) + 1;
        answer = Math.floor(Math.random() * 30) + 1;
        num1 = num2 + answer;
    }

    return {
        type: 'math',
        title: '🔢 Math Challenge',
        description: `Solve this equation: **${num1} ${operator} ${num2} = ?**\n\nYou have ${timeLimit} seconds to respond with your answer!`,
        answer: answer.toString(),
        equation: `${num1} ${operator} ${num2}`,
        timeLimit: timeLimit
    };
}

/**
 * Trivia Challenge
 */
function generateTrivia(timeLimit) {
    const trivia = TRIVIA[Math.floor(Math.random() * TRIVIA.length)];

    return {
        type: 'trivia',
        title: '❓ Trivia Challenge',
        description: `${trivia.question}\n\nYou have ${timeLimit} seconds to respond with your answer!`,
        answer: trivia.answer.toLowerCase(),
        alternatives: trivia.alternatives.map(a => a.toLowerCase()),
        timeLimit: timeLimit
    };
}

/**
 * Reaction Test Challenge
 */
function generateReactionTest(timeLimit) {
    const delay = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds

    return {
        type: 'reaction',
        title: '⚡ Reaction Test',
        description: 'Click the button when it turns **GREEN**!\n\nThe button will change color shortly...',
        delay: delay,
        timeLimit: timeLimit
    };
}

/**
 * Memory Game Challenge
 */
function generateMemoryGame(timeLimit, difficulty = 'medium') {
    let characterPool = [];
    let sequenceLength = 0;
    let memorizeTime = 5;

    // Adjust difficulty
    switch (difficulty) {
        case 'easy':
            // Lowercase letters only, shorter sequence
            characterPool = LOWERCASE_LETTERS;
            sequenceLength = 4;
            memorizeTime = 7;
            break;
        case 'medium':
            // Lowercase letters + numbers, medium sequence
            characterPool = [...LOWERCASE_LETTERS, ...NUMBERS];
            sequenceLength = 5;
            memorizeTime = 6;
            break;
        case 'hard':
            // Mixed case + numbers, longer sequence
            characterPool = [...LOWERCASE_LETTERS, ...UPPERCASE_LETTERS, ...NUMBERS];
            sequenceLength = 6;
            memorizeTime = 5;
            break;
        default:
            characterPool = [...LOWERCASE_LETTERS, ...NUMBERS];
            sequenceLength = 5;
            memorizeTime = 6;
    }

    const sequence = [];
    for (let i = 0; i < sequenceLength; i++) {
        sequence.push(characterPool[Math.floor(Math.random() * characterPool.length)]);
    }

    const difficultyText = difficulty === 'easy' ? 'lowercase letters' :
                          difficulty === 'hard' ? 'letters (mixed case) and numbers' :
                          'lowercase letters and numbers';

    return {
        type: 'memory',
        title: '🧠 Memory Challenge',
        description: `Remember this sequence of ${difficultyText}:\n\n${sequence.join(' ')}\n\nYou have ${memorizeTime} seconds to memorize it!`,
        answer: sequence.join(''),
        sequence: sequence,
        timeLimit: timeLimit,
        memorizeTime: memorizeTime,
        difficulty: difficulty
    };
}

/**
 * Check if answer is correct
 */
function checkAnswer(challenge, userAnswer) {
    const answer = userAnswer.toLowerCase().trim();

    switch (challenge.type) {
        case 'word_scramble':
        case 'math':
            return answer === challenge.answer;

        case 'trivia':
            return answer === challenge.answer ||
                   (challenge.alternatives && challenge.alternatives.includes(answer));

        case 'memory':
            // Remove all spaces and compare (case-sensitive for memory game)
            return answer.replace(/\s/g, '') === challenge.answer;

        default:
            return false;
    }
}

/**
 * Create reaction test buttons
 */
function createReactionButtons(isGreen = false) {
    const button = new ButtonBuilder()
        .setCustomId('reaction_button')
        .setLabel(isGreen ? 'CLICK NOW!' : 'Wait...')
        .setStyle(isGreen ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setDisabled(!isGreen);

    return new ActionRowBuilder().addComponents(button);
}

module.exports = {
    generateChallenge,
    checkAnswer,
    createReactionButtons
};
