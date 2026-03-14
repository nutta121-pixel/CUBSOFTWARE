// Random Picker - CUB SOFTWARE
// Quick decision tools: coin flip, dice roll, random number, pick from list

// Stats
let headsCount = 0;
let tailsCount = 0;
let numberHistory = [];

// Speed settings
const speedMultipliers = {
    fast: 0.5,
    normal: 1,
    slow: 1.5,
    dramatic: 2.5
};

let currentSpeed = 'normal';

function getSpeed() {
    return speedMultipliers[currentSpeed];
}

function updateSpeed() {
    const select = document.getElementById('speedSelect');
    currentSpeed = select.value;
    localStorage.setItem('pickerSpeed', currentSpeed);

    // Update CSS animation durations
    document.documentElement.style.setProperty('--animation-speed', getSpeed());
}

// Load saved speed on page load
document.addEventListener('DOMContentLoaded', () => {
    const savedSpeed = localStorage.getItem('pickerSpeed');
    if (savedSpeed && speedMultipliers[savedSpeed]) {
        currentSpeed = savedSpeed;
        document.getElementById('speedSelect').value = savedSpeed;
    }
});

// Coin Flip
function flipCoin() {
    const coin = document.getElementById('coin');
    const result = document.getElementById('coinResult');

    // Set animation duration based on speed
    coin.style.animationDuration = (1.5 * getSpeed()) + 's';

    // Add flipping animation
    coin.classList.remove('heads', 'tails');
    coin.classList.add('flipping');

    // Determine result
    const isHeads = Math.random() < 0.5;

    setTimeout(() => {
        coin.classList.remove('flipping');
        coin.classList.add(isHeads ? 'heads' : 'tails');
        result.textContent = isHeads ? 'Heads!' : 'Tails!';

        // Update stats
        if (isHeads) {
            headsCount++;
            document.getElementById('headsCount').textContent = headsCount;
        } else {
            tailsCount++;
            document.getElementById('tailsCount').textContent = tailsCount;
        }
    }, 1500 * getSpeed());
}

// Dice Roll
const diceRotations = {
    1: 'rotateX(0deg) rotateY(0deg)',
    2: 'rotateX(-90deg) rotateY(0deg)',
    3: 'rotateX(0deg) rotateY(-90deg)',
    4: 'rotateX(0deg) rotateY(90deg)',
    5: 'rotateX(90deg) rotateY(0deg)',
    6: 'rotateX(180deg) rotateY(0deg)'
};

function rollDice() {
    const dice = document.getElementById('dice');
    const result = document.getElementById('diceResult');
    const duration = 1400 * getSpeed();

    dice.style.animationDuration = (1.4 * getSpeed()) + 's';
    dice.classList.add('rolling');

    setTimeout(() => {
        dice.classList.remove('rolling');
        const finalValue = Math.floor(Math.random() * 6) + 1;
        dice.style.transform = diceRotations[finalValue];
        result.textContent = `You rolled ${finalValue}!`;
    }, duration);
}

// Random Number Generator
function generateNumber() {
    const display = document.getElementById('numberDisplay');
    const minInput = document.getElementById('minNumber');
    const maxInput = document.getElementById('maxNumber');

    const min = parseInt(minInput.value) || 1;
    const max = parseInt(maxInput.value) || 100;

    if (min > max) {
        showToast('Min must be less than Max');
        return;
    }

    const duration = 1600 * getSpeed();
    const maxCycles = Math.floor(40 * getSpeed());

    // Animate through numbers
    display.classList.add('animating');
    let animationCount = 0;
    const animationInterval = setInterval(() => {
        display.textContent = Math.floor(Math.random() * (max - min + 1)) + min;
        animationCount++;
        if (animationCount > maxCycles) {
            clearInterval(animationInterval);
        }
    }, 40);

    // Final result
    setTimeout(() => {
        clearInterval(animationInterval);
        display.classList.remove('animating');
        const finalNumber = Math.floor(Math.random() * (max - min + 1)) + min;
        display.textContent = finalNumber;
    }, duration);
}

// Pick From List
function pickFromList() {
    const textarea = document.getElementById('listInput');
    const pickedValue = document.getElementById('pickedValue');
    const removeAfterPick = document.getElementById('removeAfterPick').checked;

    const items = textarea.value
        .split('\n')
        .map(item => item.trim())
        .filter(item => item.length > 0);

    if (items.length === 0) {
        showToast('Add some items to the list first!');
        return;
    }

    if (items.length === 1) {
        pickedValue.textContent = items[0];
        pickedValue.classList.add('animating');
        setTimeout(() => pickedValue.classList.remove('animating'), 300);

        if (removeAfterPick) {
            textarea.value = '';
        }
        return;
    }

    const duration = 1800 * getSpeed();
    const maxCycles = Math.floor(30 * getSpeed());

    // Animate through items
    let animationCount = 0;
    const animationInterval = setInterval(() => {
        const randomItem = items[Math.floor(Math.random() * items.length)];
        pickedValue.textContent = randomItem;
        animationCount++;
        if (animationCount > maxCycles) {
            clearInterval(animationInterval);
        }
    }, 60);

    // Final result
    setTimeout(() => {
        clearInterval(animationInterval);
        const winnerIndex = Math.floor(Math.random() * items.length);
        const winner = items[winnerIndex];
        pickedValue.textContent = winner;
        pickedValue.classList.add('animating');
        setTimeout(() => pickedValue.classList.remove('animating'), 300);

        // Remove winner if option is checked
        if (removeAfterPick) {
            items.splice(winnerIndex, 1);
            textarea.value = items.join('\n');
        }
    }, duration);
}

function clearList() {
    document.getElementById('listInput').value = '';
    document.getElementById('pickedValue').textContent = '?';
}

// Yes or No
function yesOrNo() {
    const display = document.getElementById('yesnoDisplay');
    const isYes = Math.random() < 0.5;
    const duration = 1600 * getSpeed();
    const maxCycles = Math.floor(20 * getSpeed());

    // Animate
    display.classList.remove('yes', 'no');
    let animationCount = 0;
    const animationInterval = setInterval(() => {
        display.textContent = Math.random() < 0.5 ? 'YES' : 'NO';
        display.classList.toggle('yes');
        display.classList.toggle('no');
        animationCount++;
        if (animationCount > maxCycles) {
            clearInterval(animationInterval);
        }
    }, 80);

    // Final result
    setTimeout(() => {
        clearInterval(animationInterval);
        display.textContent = isYes ? 'YES' : 'NO';
        display.className = 'text-display animating ' + (isYes ? 'yes' : 'no');
        setTimeout(() => display.classList.remove('animating'), 300);
    }, duration);
}

// Card Draw
const suits = ['♠', '♥', '♦', '♣'];
const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function drawCard() {
    const cardEl = document.getElementById('card');
    const cardValue = document.getElementById('cardValue');
    const cardValueBottom = document.getElementById('cardValueBottom');
    const cardSuit = document.getElementById('cardSuit');
    const cardSuitBottom = document.getElementById('cardSuitBottom');
    const cardCenterSuit = document.getElementById('cardCenterSuit');
    const result = document.getElementById('cardResult');
    const flipDuration = 1 * getSpeed();

    // Set animation duration
    cardEl.style.transitionDuration = flipDuration + 's';
    cardEl.style.animationDuration = flipDuration + 's';

    // Show back first, then flip
    cardEl.classList.add('showing-back');

    setTimeout(() => {
        const suit = suits[Math.floor(Math.random() * suits.length)];
        const value = values[Math.floor(Math.random() * values.length)];
        const isRed = suit === '♥' || suit === '♦';
        const colorClass = isRed ? 'red' : 'black';

        // Update all card elements
        cardValue.textContent = value;
        cardValue.className = 'card-value ' + colorClass;
        cardValueBottom.textContent = value;
        cardValueBottom.className = 'card-value ' + colorClass;

        cardSuit.textContent = suit;
        cardSuit.className = 'card-suit ' + colorClass;
        cardSuitBottom.textContent = suit;
        cardSuitBottom.className = 'card-suit ' + colorClass;

        cardCenterSuit.textContent = suit;
        cardCenterSuit.className = 'card-center-suit ' + colorClass;

        // Flip to front
        cardEl.classList.remove('showing-back');
        cardEl.classList.add('flipping');

        result.textContent = `${value} of ${getSuitName(suit)}`;

        setTimeout(() => {
            cardEl.classList.remove('flipping');
        }, flipDuration * 1000);
    }, 500 * getSpeed());
}

function getSuitName(suit) {
    switch(suit) {
        case '♠': return 'Spades';
        case '♥': return 'Hearts';
        case '♦': return 'Diamonds';
        case '♣': return 'Clubs';
    }
}

// Letter Generator
function generateLetter() {
    const display = document.getElementById('letterDisplay');
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const duration = 1500 * getSpeed();
    const maxCycles = Math.floor(30 * getSpeed());

    display.classList.add('animating');

    let animationCount = 0;
    const animationInterval = setInterval(() => {
        display.textContent = letters[Math.floor(Math.random() * letters.length)];
        animationCount++;
        if (animationCount > maxCycles) {
            clearInterval(animationInterval);
        }
    }, 50);

    setTimeout(() => {
        clearInterval(animationInterval);
        display.classList.remove('animating');
        display.textContent = letters[Math.floor(Math.random() * letters.length)];
    }, duration);
}

// Team Generator
function generateTeams() {
    const textarea = document.getElementById('teamInput');
    const teamCount = parseInt(document.getElementById('teamCount').value) || 2;
    const resultsContainer = document.getElementById('teamResults');

    const names = textarea.value
        .split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);

    if (names.length < 2) {
        showToast('Add at least 2 names!');
        return;
    }

    if (teamCount > names.length) {
        showToast('More teams than people!');
        return;
    }

    const duration = 1200 * getSpeed();

    // Show loading animation
    resultsContainer.innerHTML = '<span class="result">Generating teams...</span>';

    setTimeout(() => {
        // Shuffle names
        const shuffled = [...names].sort(() => Math.random() - 0.5);

        // Distribute into teams
        const teams = Array.from({ length: teamCount }, () => []);
        shuffled.forEach((name, index) => {
            teams[index % teamCount].push(name);
        });

        // Display results
        resultsContainer.innerHTML = teams.map((team, i) => `
            <div class="team-result">
                <div class="team-result-header">Team ${i + 1}</div>
                <div class="team-result-members">${team.join(', ')}</div>
            </div>
        `).join('');
    }, duration);
}

// Shuffle List
let lastShuffled = [];

function shuffleList() {
    const textarea = document.getElementById('shuffleInput');
    const output = document.getElementById('shuffleOutput');

    const items = textarea.value
        .split('\n')
        .map(item => item.trim())
        .filter(item => item.length > 0);

    if (items.length < 2) {
        showToast('Add at least 2 items!');
        return;
    }

    const duration = 1200 * getSpeed();

    // Show loading animation
    output.innerHTML = '<span class="result">Shuffling...</span>';

    setTimeout(() => {
        // Fisher-Yates shuffle
        const shuffled = [...items];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        lastShuffled = shuffled;

        // Display as numbered list
        output.innerHTML = '<ol>' + shuffled.map(item => `<li>${item}</li>`).join('') + '</ol>';
    }, duration);
}

function copyShuffled() {
    if (lastShuffled.length === 0) {
        showToast('Nothing to copy!');
        return;
    }

    const text = lastShuffled.join('\n');
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!');
    }).catch(() => {
        showToast('Failed to copy');
    });
}

// Toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (document.activeElement.tagName === 'TEXTAREA' ||
        document.activeElement.tagName === 'INPUT') {
        return;
    }

    switch(e.key.toLowerCase()) {
        case 'c':
            flipCoin();
            break;
        case 'd':
            rollDice();
            break;
        case 'n':
            generateNumber();
            break;
        case 'y':
            yesOrNo();
            break;
        case 'r':
            drawCard();
            break;
        case 'l':
            generateLetter();
            break;
        case 's':
            shuffleList();
            break;
    }
});
