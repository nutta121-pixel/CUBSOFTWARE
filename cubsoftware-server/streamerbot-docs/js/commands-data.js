// StreamerBot Commands Data
// All command information in one place for easy maintenance

const commandsData = {
    // ============== CORE COMMANDS ==============
    "balance": {
        name: "Balance",
        command: "!balance",
        category: "Core",
        categoryAnchor: "core",
        status: "Completed",
        badges: ["Core"],
        description: "Check your current currency balance or view another user's balance.",
        features: [
            "<strong>Self Check</strong> - View your own balance with just !balance",
            "<strong>User Lookup</strong> - Check another user's balance with !balance @username",
            "<strong>Formatted Display</strong> - Currency shown with proper formatting and currency name",
            "<strong>Balance History</strong> - Tracks total earned and spent"
        ],
        commands: [
            { cmd: "!balance", desc: "Check your own balance" },
            { cmd: "!balance @user", desc: "Check another user's balance" },
            { cmd: "!bal", desc: "Shortcut alias" }
        ],
        config: [
            { variable: "config_currency_name", default: "Cub Coins", desc: "Display name for your currency" },
            { variable: "config_currency_key", default: "cubcoins", desc: "Internal variable key for storing balances" }
        ],
        examples: [
            {
                title: "Checking Your Balance",
                lines: [
                    { type: "user", text: "!balance" },
                    { type: "bot", text: "&#128176; User | Balance: $1,250 Cub Coins" }
                ]
            },
            {
                title: "Checking Another User",
                lines: [
                    { type: "user", text: "!balance @StreamerBot" },
                    { type: "bot", text: "&#128176; StreamerBot | Balance: $5,000 Cub Coins" }
                ]
            }
        ],
        related: ["daily", "give", "leaderboard", "work"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Core/Balance-Check"
    },

    "daily": {
        name: "Daily",
        command: "!daily",
        category: "Core",
        categoryAnchor: "core",
        status: "Completed",
        badges: ["Core", "Earning"],
        description: "Claim daily rewards with streak bonuses. Higher streaks mean bigger rewards! Keep your streak alive by claiming every day.",
        features: [
            "<strong>Daily Rewards</strong> - Claim once every 24 hours",
            "<strong>Streak System</strong> - Consecutive days multiply your rewards",
            "<strong>Streak Protection</strong> - 48-hour grace period before streak resets",
            "<strong>Bonus Milestones</strong> - Extra rewards at 7, 14, 30 day milestones",
            "<strong>Discord Logging</strong> - All claims logged to Discord"
        ],
        commands: [
            { cmd: "!daily", desc: "Claim your daily reward" }
        ],
        config: [
            { variable: "config_daily_reward", default: "100", desc: "Base daily claim amount" },
            { variable: "config_streak_bonus", default: "25", desc: "Bonus per day of streak" },
            { variable: "config_daily_cooldown_hours", default: "24", desc: "Hours between claims" }
        ],
        examples: [
            {
                title: "First Daily Claim",
                lines: [
                    { type: "user", text: "!daily" },
                    { type: "bot", text: "&#127873; User | Daily claimed! +$100 | Streak: 1 day | Balance: $100" }
                ]
            },
            {
                title: "Streak Bonus",
                lines: [
                    { type: "user", text: "!daily" },
                    { type: "bot", text: "&#127873; User | Daily claimed! +$175 (includes streak bonus!) | Streak: 7 days &#128293; | Balance: $1,250" }
                ]
            }
        ],
        related: ["balance", "work", "collect", "luck"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Core/Daily-Claim"
    },

    "give": {
        name: "Give",
        command: "!give",
        category: "Core",
        categoryAnchor: "core",
        status: "Completed",
        badges: ["Core"],
        description: "Transfer currency to another user. Share the wealth with your fellow chatters!",
        features: [
            "<strong>User Transfer</strong> - Send currency to any user",
            "<strong>Validation</strong> - Checks sufficient balance before transfer",
            "<strong>Minimum Amount</strong> - Configurable minimum transfer amount",
            "<strong>Self-Protection</strong> - Cannot send to yourself",
            "<strong>Discord Logging</strong> - All transfers logged"
        ],
        commands: [
            { cmd: "!give @user amount", desc: "Send currency to another user" }
        ],
        config: [
            { variable: "config_give_min_amount", default: "10", desc: "Minimum transfer amount" },
            { variable: "config_give_enabled", default: "true", desc: "Enable/disable transfers" }
        ],
        examples: [
            {
                title: "Sending Currency",
                lines: [
                    { type: "user", text: "!give @StreamerBot 100" },
                    { type: "bot", text: "&#128177; User sent $100 to StreamerBot! | Your balance: $900" }
                ]
            }
        ],
        related: ["balance", "daily", "leaderboard"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Core/Give-Coins"
    },

    "leaderboard": {
        name: "Leaderboard",
        command: "!leaderboard",
        category: "Core",
        categoryAnchor: "core",
        status: "Completed",
        badges: ["Core"],
        description: "View the top 5 richest users on the server. Compete to be #1!",
        features: [
            "<strong>Top 5 Display</strong> - Shows the richest users",
            "<strong>Rank Indicators</strong> - Gold, silver, bronze medals for top 3",
            "<strong>Your Rank</strong> - Shows your position if not in top 5",
            "<strong>Real-time</strong> - Always up-to-date standings"
        ],
        commands: [
            { cmd: "!leaderboard", desc: "View top 5 richest users" },
            { cmd: "!lb", desc: "Shortcut alias" },
            { cmd: "!top", desc: "Shortcut alias" }
        ],
        config: [
            { variable: "config_leaderboard_size", default: "5", desc: "Number of users to display" }
        ],
        examples: [
            {
                title: "Viewing Leaderboard",
                lines: [
                    { type: "user", text: "!leaderboard" },
                    { type: "bot", text: "&#127942; LEADERBOARD | &#129351; RichUser: $10,000 | &#129352; Streamer: $8,500 | &#129353; Gamer: $7,200 | 4. Viewer: $5,000 | 5. Chatter: $4,500" }
                ]
            }
        ],
        related: ["balance", "daily", "give"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Core/Leaderboard"
    },

    // ============== GAMBLING COMMANDS ==============
    "blackjack": {
        name: "Blackjack",
        command: "!blackjack",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling", "Interactive"],
        description: "A fully interactive blackjack card game where users bet currency to play against the dealer. Features real-time hit/stand decisions, realistic card distribution, automatic timeout, and cooldown protection.",
        features: [
            "<strong>Interactive Gameplay</strong> - Players control their hand with hit/stand commands",
            "<strong>10-Second Timer</strong> - Auto-stands if player doesn't respond within 10 seconds",
            "<strong>Instant 21 Win</strong> - Automatically stands when hitting exactly 21",
            "<strong>Realistic Card Distribution</strong> - Simulates proper 52-card deck probabilities",
            "<strong>Smart Dealer AI</strong> - Dealer stands at 16 (reduced bust rate)",
            "<strong>Dealer Visibility</strong> - Shows each card dealer draws with running totals",
            "<strong>Proper Card Display</strong> - Shows A, J, Q, K for face cards",
            "<strong>Soft/Hard Ace Handling</strong> - Aces count as 11 or 1 automatically",
            "<strong>Cooldown System</strong> - Prevents spam with configurable cooldown timer",
            "<strong>Discord Logging</strong> - Tracks all games, wins, losses, and dealer bust rates"
        ],
        commands: [
            { cmd: "!blackjack [bet]", desc: "Start a new blackjack game with your bet amount" },
            { cmd: "!blackjack hit", desc: "Draw another card (also: !blackjack h)" },
            { cmd: "!blackjack stand", desc: "Stand with current hand, dealer plays (also: !blackjack s)" }
        ],
        config: [
            { variable: "config_blackjack_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_blackjack_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_blackjack_win_mult", default: "2", desc: "Standard win multiplier" },
            { variable: "config_blackjack_cooldown_seconds", default: "30", desc: "Cooldown between games" }
        ],
        howItWorks: {
            starting: [
                "User runs <code>!blackjack [bet]</code> with amount between min and max",
                "Command checks cooldown (if recently played, shows time remaining)",
                "Command validates bet amount and checks user balance",
                "Bet is deducted from user balance",
                "Player draws 2 cards, dealer draws 2 cards (only 1 shown)",
                "If player has 21 (blackjack), auto-wins with 2.5x payout",
                "Otherwise, player has 10 seconds to choose hit or stand"
            ],
            outcomes: [
                { outcome: "Natural Blackjack (21 on first 2 cards)", payout: "2.5x payout" },
                { outcome: "Player Bust (over 21)", payout: "Lose bet" },
                { outcome: "Dealer Bust (over 21)", payout: "Win at 2x multiplier" },
                { outcome: "Player beats Dealer", payout: "Win at 2x multiplier" },
                { outcome: "Push (tie)", payout: "Bet returned" },
                { outcome: "Dealer beats Player", payout: "Lose bet" }
            ]
        },
        cardValues: [
            { card: "Ace (A)", value: "11 or 1 (automatically adjusts to prevent bust)" },
            { card: "2-9", value: "Face value" },
            { card: "10, J, Q, K", value: "10 points" }
        ],
        examples: [
            {
                title: "Starting a Game",
                lines: [
                    { type: "user", text: "!blackjack 100" },
                    { type: "bot", text: "&#127183; User | Your hand: K, 7 = 17 | Dealer shows: 9 | Type !blackjack hit or !blackjack stand (10s timer)" }
                ]
            },
            {
                title: "Hitting",
                lines: [
                    { type: "user", text: "!blackjack hit" },
                    { type: "bot", text: "&#127183; User drew 3 | Your hand: K, 7, 3 = 20 | Dealer shows: 9 | Type !blackjack hit or !blackjack stand (10s timer)" }
                ]
            },
            {
                title: "Perfect 21",
                lines: [
                    { type: "user", text: "!blackjack hit" },
                    { type: "bot", text: "&#127183; User drew A | Your hand: K, 7, 3, A = 21! &#127881; PERFECT 21! Auto-standing..." }
                ]
            },
            {
                title: "Winning",
                lines: [
                    { type: "user", text: "!blackjack stand" },
                    { type: "bot", text: "&#127183; Dealer has: 9, 8 = 17 | Dealer stands at 17" },
                    { type: "bot", text: "&#127183; User had 20 | Dealer ended with 17 | You win! Balance: $600" }
                ]
            }
        ],
        related: ["slots", "roulette", "coinflip", "crash"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Blackjack"
    },

    "slots": {
        name: "Slots",
        command: "!slots",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Classic slot machine with multiple symbol combinations and jackpots. Spin the reels and try to match symbols for big wins!",
        features: [
            "<strong>Multiple Symbols</strong> - Various fruit and lucky symbols",
            "<strong>Jackpot System</strong> - Three 7s triggers the jackpot",
            "<strong>Tiered Payouts</strong> - Different symbol combinations pay differently",
            "<strong>Two Match Wins</strong> - Even 2 matching symbols pay out",
            "<strong>Animated Display</strong> - Visual slot machine representation",
            "<strong>Cooldown System</strong> - Prevents spam",
            "<strong>Discord Logging</strong> - Tracks all spins and wins"
        ],
        commands: [
            { cmd: "!slots [bet]", desc: "Spin the slot machine with your bet amount" }
        ],
        config: [
            { variable: "config_slots_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_slots_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_slots_jackpot_mult", default: "10", desc: "Jackpot multiplier (3x 7s)" },
            { variable: "config_slots_three_match_mult", default: "5", desc: "Three match multiplier" },
            { variable: "config_slots_two_match_mult", default: "2", desc: "Two match multiplier" },
            { variable: "config_slots_cooldown_seconds", default: "10", desc: "Cooldown between spins" }
        ],
        examples: [
            {
                title: "Spinning Slots",
                lines: [
                    { type: "user", text: "!slots 50" },
                    { type: "bot", text: "&#127920; User | [ &#127826; | &#127826; | &#127819; ] Two match! +$100 | Balance: $550" }
                ]
            },
            {
                title: "Jackpot Win",
                lines: [
                    { type: "user", text: "!slots 100" },
                    { type: "bot", text: "&#127920; User | [ 7&#65039;&#8419; | 7&#65039;&#8419; | 7&#65039;&#8419; ] &#127881; JACKPOT! +$1,000 | Balance: $1,500" }
                ]
            }
        ],
        related: ["blackjack", "roulette", "wheel", "crash"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "coinflip": {
        name: "Coinflip",
        command: "!coinflip",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Flip a coin! Pick heads or tails and double your bet. Simple 50/50 odds.",
        features: [
            "<strong>Simple Gameplay</strong> - Pick heads or tails",
            "<strong>50/50 Odds</strong> - Fair coin flip",
            "<strong>Double Payout</strong> - Win 2x your bet",
            "<strong>Quick Games</strong> - Instant results",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!coinflip [bet] [h/t]", desc: "Flip a coin betting on heads or tails" },
            { cmd: "!cf [bet] heads", desc: "Shortcut with heads" },
            { cmd: "!cf [bet] tails", desc: "Shortcut with tails" }
        ],
        config: [
            { variable: "config_coinflip_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_coinflip_max_bet", default: "1000", desc: "Maximum bet amount" },
            { variable: "config_coinflip_win_mult", default: "2", desc: "Win multiplier" },
            { variable: "config_coinflip_cooldown_seconds", default: "5", desc: "Cooldown between flips" }
        ],
        examples: [
            {
                title: "Winning Flip",
                lines: [
                    { type: "user", text: "!coinflip 100 heads" },
                    { type: "bot", text: "&#129689; User flipped HEADS! You win! +$200 | Balance: $700" }
                ]
            },
            {
                title: "Losing Flip",
                lines: [
                    { type: "user", text: "!cf 50 tails" },
                    { type: "bot", text: "&#129689; User flipped HEADS! You lose! -$50 | Balance: $450" }
                ]
            }
        ],
        related: ["flip", "gamble", "dice", "roulette"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Coinflip"
    },

    "dice": {
        name: "Dice",
        command: "!dice",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Roll the dice and bet on the outcome. Higher rolls mean bigger wins!",
        features: [
            "<strong>Variable Payouts</strong> - Higher rolls pay more",
            "<strong>Over/Under Betting</strong> - Bet on roll being over or under a number",
            "<strong>Exact Match Bonus</strong> - Big payout for guessing exact number",
            "<strong>Visual Display</strong> - Dice emoji representation",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!dice [bet]", desc: "Roll dice, 4+ wins" },
            { cmd: "!dice [bet] over [num]", desc: "Bet roll will be over a number" },
            { cmd: "!dice [bet] under [num]", desc: "Bet roll will be under a number" }
        ],
        config: [
            { variable: "config_dice_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_dice_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_dice_cooldown_seconds", default: "10", desc: "Cooldown between rolls" }
        ],
        examples: [
            {
                title: "Simple Roll",
                lines: [
                    { type: "user", text: "!dice 50" },
                    { type: "bot", text: "&#127922; User rolled a 5! You win! +$75 | Balance: $575" }
                ]
            },
            {
                title: "Over/Under Bet",
                lines: [
                    { type: "user", text: "!dice 100 over 4" },
                    { type: "bot", text: "&#127922; User rolled a 6! Over 4 - You win! +$150 | Balance: $650" }
                ]
            }
        ],
        related: ["coinflip", "roulette", "gamble", "highlow"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Dice"
    },

    "roulette": {
        name: "Roulette",
        command: "!roulette",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Bet on red, black, or green in this classic casino game. Green pays 14x!",
        features: [
            "<strong>Color Betting</strong> - Bet on red, black, or green",
            "<strong>Number Betting</strong> - Bet on specific numbers 0-36",
            "<strong>Variable Payouts</strong> - Red/Black 2x, Green 14x, Number 36x",
            "<strong>Animated Wheel</strong> - Visual representation of spin",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!roulette [bet] red", desc: "Bet on red (2x payout)" },
            { cmd: "!roulette [bet] black", desc: "Bet on black (2x payout)" },
            { cmd: "!roulette [bet] green", desc: "Bet on green/0 (14x payout)" },
            { cmd: "!roulette [bet] [number]", desc: "Bet on specific number (36x payout)" }
        ],
        config: [
            { variable: "config_roulette_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_roulette_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_roulette_red_mult", default: "2", desc: "Red/black multiplier" },
            { variable: "config_roulette_green_mult", default: "14", desc: "Green multiplier" },
            { variable: "config_roulette_cooldown_seconds", default: "15", desc: "Cooldown between spins" }
        ],
        examples: [
            {
                title: "Betting on Red",
                lines: [
                    { type: "user", text: "!roulette 100 red" },
                    { type: "bot", text: "&#127921; The ball lands on 14 RED! You win! +$200 | Balance: $800" }
                ]
            },
            {
                title: "Green Win",
                lines: [
                    { type: "user", text: "!roulette 50 green" },
                    { type: "bot", text: "&#127921; The ball lands on 0 GREEN! &#127881; BIG WIN! +$700 | Balance: $1,200" }
                ]
            }
        ],
        related: ["blackjack", "slots", "wheel", "crash"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "wheel": {
        name: "Wheel",
        command: "!wheel",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Spin the prize wheel for multiplier rewards! Land on different segments for various payouts.",
        features: [
            "<strong>Multiple Segments</strong> - Various multiplier values on the wheel",
            "<strong>Random Spin</strong> - True random landing position",
            "<strong>Visual Display</strong> - Shows wheel segments and result",
            "<strong>Risk/Reward</strong> - Chance for 0x, 1x, 2x, 5x, or 10x",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!wheel [bet]", desc: "Spin the wheel with your bet" }
        ],
        config: [
            { variable: "config_wheel_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_wheel_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_wheel_cooldown_seconds", default: "15", desc: "Cooldown between spins" }
        ],
        examples: [
            {
                title: "Spinning the Wheel",
                lines: [
                    { type: "user", text: "!wheel 100" },
                    { type: "bot", text: "&#127905; User spins the wheel... It lands on 2x! +$200 | Balance: $700" }
                ]
            },
            {
                title: "Big Win",
                lines: [
                    { type: "user", text: "!wheel 50" },
                    { type: "bot", text: "&#127905; User spins the wheel... It lands on 10x! &#127881; +$500 | Balance: $1,000" }
                ]
            }
        ],
        related: ["slots", "roulette", "plinko", "lottery"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "crash": {
        name: "Crash",
        command: "!crash",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling", "High Risk"],
        description: "Watch the multiplier climb - cash out before it crashes! The longer you wait, the higher the reward, but crash too late and lose everything.",
        features: [
            "<strong>Rising Multiplier</strong> - Multiplier increases over time",
            "<strong>Cash Out Anytime</strong> - You control when to take profits",
            "<strong>Auto Cash Out</strong> - Set a target multiplier to auto-collect",
            "<strong>Random Crash Point</strong> - Crash can happen at any moment",
            "<strong>High Risk/Reward</strong> - Potential for massive multipliers",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!crash [bet]", desc: "Start a crash game" },
            { cmd: "!crash [bet] [auto-cashout]", desc: "Start with auto-cashout multiplier" },
            { cmd: "!cashout", desc: "Cash out at current multiplier" }
        ],
        config: [
            { variable: "config_crash_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_crash_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_crash_cooldown_seconds", default: "30", desc: "Cooldown between games" }
        ],
        examples: [
            {
                title: "Starting Crash",
                lines: [
                    { type: "user", text: "!crash 100" },
                    { type: "bot", text: "&#128640; User | Multiplier rising... 1.2x... 1.5x... 2.0x... Type !cashout to collect!" }
                ]
            },
            {
                title: "Cashing Out",
                lines: [
                    { type: "user", text: "!cashout" },
                    { type: "bot", text: "&#128640; User cashed out at 2.5x! +$250 | Balance: $750" }
                ]
            },
            {
                title: "Crash!",
                lines: [
                    { type: "bot", text: "&#128165; CRASHED at 1.8x! User didn't cash out in time! -$100" }
                ]
            }
        ],
        related: ["limbo", "blackjack", "roulette", "heist"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Crash"
    },

    "plinko": {
        name: "Plinko",
        command: "!plinko",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Drop a ball through the Plinko board for random multipliers. Watch it bounce through pegs to land on a prize!",
        features: [
            "<strong>Physics-Based</strong> - Ball bounces through pegs",
            "<strong>Multiple Slots</strong> - Various multiplier landing zones",
            "<strong>Risk Levels</strong> - Low, Medium, High risk modes",
            "<strong>Visual Display</strong> - Shows ball path and landing",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!plinko [bet]", desc: "Drop a ball (medium risk)" },
            { cmd: "!plinko [bet] low", desc: "Low risk mode (smaller variance)" },
            { cmd: "!plinko [bet] high", desc: "High risk mode (bigger swings)" }
        ],
        config: [
            { variable: "config_plinko_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_plinko_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_plinko_cooldown_seconds", default: "15", desc: "Cooldown between drops" }
        ],
        examples: [
            {
                title: "Playing Plinko",
                lines: [
                    { type: "user", text: "!plinko 50" },
                    { type: "bot", text: "&#128311; User drops the ball... &#128993;&#128993;&#128994; It lands on 1.5x! +$75 | Balance: $525" }
                ]
            }
        ],
        related: ["wheel", "slots", "lottery", "scratch"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Plinko"
    },

    "highlow": {
        name: "High Low",
        command: "!highlow",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Guess if the next card is higher or lower. Simple card guessing game with streak bonuses!",
        features: [
            "<strong>Card Comparison</strong> - Guess higher or lower than shown card",
            "<strong>Streak System</strong> - Consecutive correct guesses multiply winnings",
            "<strong>Cash Out Option</strong> - Take winnings at any point",
            "<strong>Card Display</strong> - Visual card representation",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!highlow [bet]", desc: "Start a new game" },
            { cmd: "!highlow high", desc: "Guess higher" },
            { cmd: "!highlow low", desc: "Guess lower" },
            { cmd: "!highlow cash", desc: "Cash out current winnings" }
        ],
        config: [
            { variable: "config_highlow_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_highlow_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_highlow_cooldown_seconds", default: "15", desc: "Cooldown between games" }
        ],
        examples: [
            {
                title: "Starting Game",
                lines: [
                    { type: "user", text: "!highlow 50" },
                    { type: "bot", text: "&#127183; User | Card shown: 7 | Is the next card higher or lower? Type !highlow high or !highlow low" }
                ]
            },
            {
                title: "Correct Guess",
                lines: [
                    { type: "user", text: "!highlow high" },
                    { type: "bot", text: "&#127183; Next card: K | Correct! Streak: 1 | Current winnings: $75 | Continue or !highlow cash" }
                ]
            }
        ],
        related: ["blackjack", "dice", "coinflip", "gamble"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Highlow"
    },

    "keno": {
        name: "Keno",
        command: "!keno",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Pick numbers and hope they match the draw! More matches = bigger prizes.",
        features: [
            "<strong>Number Selection</strong> - Pick up to 10 numbers",
            "<strong>Random Draw</strong> - 20 numbers drawn from 1-80",
            "<strong>Scaled Payouts</strong> - More matches = higher multiplier",
            "<strong>Visual Display</strong> - Shows your picks vs drawn numbers",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!keno [bet] [numbers]", desc: "Pick numbers (comma-separated)" },
            { cmd: "!keno 50 1,5,10,15,20", desc: "Example: bet 50 on 5 numbers" }
        ],
        config: [
            { variable: "config_keno_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_keno_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_keno_cooldown_seconds", default: "15", desc: "Cooldown between games" }
        ],
        examples: [
            {
                title: "Playing Keno",
                lines: [
                    { type: "user", text: "!keno 50 3,7,15,22,45" },
                    { type: "bot", text: "&#127922; Drawing... 3, 12, 22, 31, 45, 7... | Matched: 3, 7, 22, 45 (4/5)! +$200 | Balance: $650" }
                ]
            }
        ],
        related: ["lottery", "bingo", "scratch", "match"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Keno"
    },

    "limbo": {
        name: "Limbo",
        command: "!limbo",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Set a target multiplier - hit below it to win! Higher targets = riskier but bigger payouts.",
        features: [
            "<strong>Target Setting</strong> - Choose your target multiplier",
            "<strong>Inverse Risk</strong> - Higher targets are harder to hit but pay more",
            "<strong>Instant Results</strong> - Quick gameplay",
            "<strong>Custom Strategy</strong> - Play safe with low targets or go big",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!limbo [bet] [target]", desc: "Bet with target multiplier" },
            { cmd: "!limbo 50 2", desc: "Example: win if result < 2x" }
        ],
        config: [
            { variable: "config_limbo_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_limbo_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_limbo_min_target", default: "1.01", desc: "Minimum target multiplier" },
            { variable: "config_limbo_max_target", default: "100", desc: "Maximum target multiplier" },
            { variable: "config_limbo_cooldown_seconds", default: "10", desc: "Cooldown between plays" }
        ],
        examples: [
            {
                title: "Safe Bet",
                lines: [
                    { type: "user", text: "!limbo 100 1.5" },
                    { type: "bot", text: "&#127919; Target: 1.5x | Result: 1.23x | You win! +$150 | Balance: $650" }
                ]
            },
            {
                title: "Risky Bet",
                lines: [
                    { type: "user", text: "!limbo 50 10" },
                    { type: "bot", text: "&#127919; Target: 10x | Result: 15.7x | Too high! You lose -$50 | Balance: $450" }
                ]
            }
        ],
        related: ["crash", "dice", "gamble", "coinflip"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "bingo": {
        name: "Bingo",
        command: "!bingo",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Quick bingo game with instant results. Get a line or full card for prizes!",
        features: [
            "<strong>Instant Bingo</strong> - Quick single-player bingo",
            "<strong>Auto Card</strong> - Random card generated for you",
            "<strong>Line Wins</strong> - Win with any complete line",
            "<strong>Full Card Bonus</strong> - Bigger prize for blackout",
            "<strong>Visual Display</strong> - Shows your card and called numbers",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!bingo [bet]", desc: "Play a quick bingo game" }
        ],
        config: [
            { variable: "config_bingo_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_bingo_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_bingo_line_mult", default: "2", desc: "Line win multiplier" },
            { variable: "config_bingo_full_mult", default: "10", desc: "Full card multiplier" },
            { variable: "config_bingo_cooldown_seconds", default: "15", desc: "Cooldown between games" }
        ],
        examples: [
            {
                title: "Playing Bingo",
                lines: [
                    { type: "user", text: "!bingo 50" },
                    { type: "bot", text: "&#127183; B-I-N-G-O! Drawing numbers... Line complete! +$100 | Balance: $550" }
                ]
            }
        ],
        related: ["keno", "lottery", "scratch", "match"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Bingo"
    },

    "scratch": {
        name: "Scratch",
        command: "!scratch",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Scratch card game with hidden prizes. Reveal symbols to win!",
        features: [
            "<strong>Hidden Symbols</strong> - Scratch to reveal prizes",
            "<strong>Match to Win</strong> - Match 3 symbols for payout",
            "<strong>Various Tiers</strong> - Different symbol values",
            "<strong>Instant Results</strong> - Quick reveal gameplay",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!scratch [bet]", desc: "Buy and scratch a card" }
        ],
        config: [
            { variable: "config_scratch_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_scratch_max_bet", default: "200", desc: "Maximum bet amount" },
            { variable: "config_scratch_cooldown_seconds", default: "10", desc: "Cooldown between cards" }
        ],
        examples: [
            {
                title: "Scratching a Card",
                lines: [
                    { type: "user", text: "!scratch 25" },
                    { type: "bot", text: "&#127915; Scratching... [&#128142;|&#128142;|&#128142;] Three diamonds! +$250 | Balance: $750" }
                ]
            }
        ],
        related: ["lottery", "match", "bingo", "slots"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Scratch"
    },

    "match": {
        name: "Match",
        command: "!match",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Match symbols to win big prizes! Simple matching game with multiple prize tiers.",
        features: [
            "<strong>Symbol Matching</strong> - Match pairs for prizes",
            "<strong>Multiple Tiers</strong> - Different match combinations",
            "<strong>Quick Game</strong> - Instant results",
            "<strong>Visual Display</strong> - Shows revealed symbols",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!match [bet]", desc: "Play a matching game" }
        ],
        config: [
            { variable: "config_match_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_match_max_bet", default: "300", desc: "Maximum bet amount" },
            { variable: "config_match_cooldown_seconds", default: "10", desc: "Cooldown between games" }
        ],
        examples: [
            {
                title: "Playing Match",
                lines: [
                    { type: "user", text: "!match 50" },
                    { type: "bot", text: "&#127922; Revealing... [&#127808;|&#128142;|&#127808;] Two clovers! +$75 | Balance: $525" }
                ]
            }
        ],
        related: ["scratch", "slots", "bingo", "keno"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "lottery": {
        name: "Lottery",
        command: "!lottery",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Buy lottery tickets for a chance at the jackpot. Growing prize pool!",
        features: [
            "<strong>Ticket Purchase</strong> - Buy tickets for the draw",
            "<strong>Growing Jackpot</strong> - Prize pool increases with tickets",
            "<strong>Scheduled Draws</strong> - Regular drawing times",
            "<strong>Multiple Winners</strong> - Tiered prizes for partial matches",
            "<strong>View Jackpot</strong> - Check current prize pool"
        ],
        commands: [
            { cmd: "!lottery buy [amount]", desc: "Buy lottery tickets" },
            { cmd: "!lottery check", desc: "View current jackpot" },
            { cmd: "!lottery tickets", desc: "View your tickets" }
        ],
        config: [
            { variable: "config_lottery_ticket_price", default: "50", desc: "Price per ticket" },
            { variable: "config_lottery_max_tickets", default: "10", desc: "Max tickets per user" }
        ],
        examples: [
            {
                title: "Buying Tickets",
                lines: [
                    { type: "user", text: "!lottery buy 3" },
                    { type: "bot", text: "&#127915; User bought 3 lottery tickets for $150 | Current jackpot: $5,000 | Balance: $350" }
                ]
            }
        ],
        related: ["keno", "bingo", "scratch", "wheel"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Lottery"
    },

    "gamble": {
        name: "Gamble",
        command: "!gamble",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Simple 50/50 gamble - double or nothing! Quick and easy betting.",
        features: [
            "<strong>50/50 Odds</strong> - Fair coin flip style",
            "<strong>Double Payout</strong> - Win 2x your bet",
            "<strong>Quick Games</strong> - Instant results",
            "<strong>All-in Option</strong> - Bet your entire balance",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!gamble [bet]", desc: "Gamble your bet (50/50)" },
            { cmd: "!gamble all", desc: "Gamble your entire balance" }
        ],
        config: [
            { variable: "config_gamble_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_gamble_max_bet", default: "1000", desc: "Maximum bet amount" },
            { variable: "config_gamble_cooldown_seconds", default: "5", desc: "Cooldown between gambles" }
        ],
        examples: [
            {
                title: "Winning Gamble",
                lines: [
                    { type: "user", text: "!gamble 100" },
                    { type: "bot", text: "&#127920; User gambled $100 and WON! +$200 | Balance: $700" }
                ]
            },
            {
                title: "Losing Gamble",
                lines: [
                    { type: "user", text: "!gamble 50" },
                    { type: "bot", text: "&#127920; User gambled $50 and LOST! -$50 | Balance: $450" }
                ]
            }
        ],
        related: ["coinflip", "flip", "dice", "limbo"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "flip": {
        name: "Flip",
        command: "!flip",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Quick coin flip with instant payout. No choice needed - just flip and see!",
        features: [
            "<strong>Instant Flip</strong> - No heads/tails choice needed",
            "<strong>50/50 Odds</strong> - Fair random flip",
            "<strong>Quick Game</strong> - Instant results",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!flip [bet]", desc: "Flip a coin instantly" }
        ],
        config: [
            { variable: "config_flip_min_bet", default: "10", desc: "Minimum bet amount" },
            { variable: "config_flip_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_flip_cooldown_seconds", default: "5", desc: "Cooldown between flips" }
        ],
        examples: [
            {
                title: "Quick Flip",
                lines: [
                    { type: "user", text: "!flip 75" },
                    { type: "bot", text: "&#129689; Flip... HEADS! User wins! +$150 | Balance: $650" }
                ]
            }
        ],
        related: ["coinflip", "gamble", "dice", "roulette"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "trivia": {
        name: "Trivia",
        command: "!trivia",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling", "Knowledge"],
        description: "Answer trivia questions to win rewards. Test your knowledge!",
        features: [
            "<strong>Random Questions</strong> - Various categories and difficulties",
            "<strong>Timed Response</strong> - Answer within time limit",
            "<strong>Difficulty Scaling</strong> - Harder questions pay more",
            "<strong>Categories</strong> - Gaming, movies, general knowledge, etc.",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!trivia [bet]", desc: "Start a trivia question" },
            { cmd: "!trivia [answer]", desc: "Submit your answer (a, b, c, or d)" }
        ],
        config: [
            { variable: "config_trivia_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_trivia_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_trivia_time_limit", default: "20", desc: "Seconds to answer" },
            { variable: "config_trivia_cooldown_seconds", default: "30", desc: "Cooldown between questions" }
        ],
        examples: [
            {
                title: "Starting Trivia",
                lines: [
                    { type: "user", text: "!trivia 50" },
                    { type: "bot", text: "&#128218; TRIVIA | What year was Minecraft released? | A) 2009 B) 2010 C) 2011 D) 2012 | Type !trivia [letter] (20s)" }
                ]
            },
            {
                title: "Correct Answer",
                lines: [
                    { type: "user", text: "!trivia c" },
                    { type: "bot", text: "&#128218; CORRECT! Minecraft was released in 2011! +$100 | Balance: $550" }
                ]
            }
        ],
        related: ["treasure", "heist", "luck", "battle"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "treasure": {
        name: "Treasure",
        command: "!treasure",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling"],
        description: "Hunt for hidden treasure chests! Pick the right chest for rewards.",
        features: [
            "<strong>Chest Selection</strong> - Choose from multiple chests",
            "<strong>Random Prizes</strong> - Various reward tiers",
            "<strong>Trap Chests</strong> - Some chests contain traps!",
            "<strong>Visual Display</strong> - Shows chest options",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!treasure [bet]", desc: "Start treasure hunt" },
            { cmd: "!treasure [number]", desc: "Pick a chest (1-3)" }
        ],
        config: [
            { variable: "config_treasure_min_bet", default: "25", desc: "Minimum bet amount" },
            { variable: "config_treasure_max_bet", default: "500", desc: "Maximum bet amount" },
            { variable: "config_treasure_cooldown_seconds", default: "20", desc: "Cooldown between hunts" }
        ],
        examples: [
            {
                title: "Starting Hunt",
                lines: [
                    { type: "user", text: "!treasure 100" },
                    { type: "bot", text: "&#128230; TREASURE HUNT | Choose a chest: [1] [2] [3] | Type !treasure 1, 2, or 3" }
                ]
            },
            {
                title: "Finding Treasure",
                lines: [
                    { type: "user", text: "!treasure 2" },
                    { type: "bot", text: "&#128230; User opens chest 2... &#127873; GOLD! +$300 | Balance: $800" }
                ]
            }
        ],
        related: ["heist", "hunt", "dig", "search"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Treasure-Hunt"
    },

    "heist": {
        name: "Heist",
        command: "!heist",
        category: "Gambling",
        categoryAnchor: "gambling",
        status: "Completed",
        badges: ["Gambling", "High Risk"],
        description: "Plan and execute a heist for massive rewards. High risk, high reward!",
        features: [
            "<strong>Multi-Stage</strong> - Multiple phases to complete",
            "<strong>Risk Levels</strong> - Choose your heist difficulty",
            "<strong>Team Option</strong> - Join others for better odds",
            "<strong>Massive Payouts</strong> - Big rewards for success",
            "<strong>Failure Penalty</strong> - Lose bet if caught",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!heist [bet]", desc: "Start a heist" },
            { cmd: "!heist join", desc: "Join an active heist" }
        ],
        config: [
            { variable: "config_heist_min_bet", default: "100", desc: "Minimum bet amount" },
            { variable: "config_heist_max_bet", default: "1000", desc: "Maximum bet amount" },
            { variable: "config_heist_success_rate", default: "40", desc: "Base success percentage" },
            { variable: "config_heist_cooldown_seconds", default: "300", desc: "Cooldown between heists (5 min)" }
        ],
        examples: [
            {
                title: "Starting Heist",
                lines: [
                    { type: "user", text: "!heist 500" },
                    { type: "bot", text: "&#128374; User is planning a bank heist! Bet: $500 | Others can !heist join (30s)" }
                ]
            },
            {
                title: "Successful Heist",
                lines: [
                    { type: "bot", text: "&#128374; HEIST SUCCESSFUL! User escaped with $1,500! | Balance: $2,000" }
                ]
            },
            {
                title: "Failed Heist",
                lines: [
                    { type: "bot", text: "&#128680; HEIST FAILED! User was caught! Lost $500 | Balance: $500" }
                ]
            }
        ],
        related: ["crash", "rob", "treasure", "gamble"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    // ============== EARNING COMMANDS ==============
    "work": {
        name: "Work",
        command: "!work",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$50-150"],
        description: "Go to work and earn a steady income. Reliable earnings with a 30 minute cooldown.",
        features: [
            "<strong>Random Jobs</strong> - Different job scenarios each time",
            "<strong>Steady Income</strong> - Reliable $50-150 earnings",
            "<strong>Job Messages</strong> - Fun flavor text for each job",
            "<strong>30 Min Cooldown</strong> - Work every half hour",
            "<strong>Discord Logging</strong> - Track all earnings"
        ],
        commands: [
            { cmd: "!work", desc: "Go to work and earn money" }
        ],
        config: [
            { variable: "config_work_min_reward", default: "50", desc: "Minimum work reward" },
            { variable: "config_work_max_reward", default: "150", desc: "Maximum work reward" },
            { variable: "config_work_cooldown_minutes", default: "30", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Going to Work",
                lines: [
                    { type: "user", text: "!work" },
                    { type: "bot", text: "&#128188; User worked as a software developer and earned $125! | Balance: $625" }
                ]
            }
        ],
        related: ["fish", "hunt", "mine", "daily"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Work"
    },

    "fish": {
        name: "Fish",
        command: "!fish",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$30-100"],
        description: "Cast your line and catch fish for rewards. Different fish have different values!",
        features: [
            "<strong>Random Catches</strong> - Various fish types",
            "<strong>Rare Fish</strong> - Chance for valuable catches",
            "<strong>Fish Names</strong> - Displays what you caught",
            "<strong>20 Min Cooldown</strong> - Fish every 20 minutes",
            "<strong>Discord Logging</strong> - Track all catches"
        ],
        commands: [
            { cmd: "!fish", desc: "Cast your line and fish" }
        ],
        config: [
            { variable: "config_fish_min_reward", default: "30", desc: "Minimum fish value" },
            { variable: "config_fish_max_reward", default: "100", desc: "Maximum fish value" },
            { variable: "config_fish_cooldown_minutes", default: "20", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Fishing",
                lines: [
                    { type: "user", text: "!fish" },
                    { type: "bot", text: "&#127907; User caught a Rainbow Trout worth $75! | Balance: $575" }
                ]
            }
        ],
        related: ["hunt", "work", "forage", "dig"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "hunt": {
        name: "Hunt",
        command: "!hunt",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$40-130"],
        description: "Go hunting in the wilderness. Track and catch various animals for rewards!",
        features: [
            "<strong>Random Animals</strong> - Various prey types",
            "<strong>Rare Catches</strong> - Chance for legendary animals",
            "<strong>Animal Names</strong> - Displays what you hunted",
            "<strong>25 Min Cooldown</strong> - Hunt every 25 minutes",
            "<strong>Discord Logging</strong> - Track all hunts"
        ],
        commands: [
            { cmd: "!hunt", desc: "Go hunting in the wild" }
        ],
        config: [
            { variable: "config_hunt_min_reward", default: "40", desc: "Minimum hunt reward" },
            { variable: "config_hunt_max_reward", default: "130", desc: "Maximum hunt reward" },
            { variable: "config_hunt_cooldown_minutes", default: "25", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Hunting",
                lines: [
                    { type: "user", text: "!hunt" },
                    { type: "bot", text: "&#127993; User hunted a Wild Boar worth $95! | Balance: $595" }
                ]
            }
        ],
        related: ["fish", "work", "forage", "battle"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "mine": {
        name: "Mine",
        command: "!mine",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$45-140"],
        description: "Mine for precious ores and gems. Dig deep for valuable resources!",
        features: [
            "<strong>Random Ores</strong> - Various minerals and gems",
            "<strong>Rare Gems</strong> - Chance for diamonds and gold",
            "<strong>Ore Names</strong> - Displays what you mined",
            "<strong>30 Min Cooldown</strong> - Mine every 30 minutes",
            "<strong>Discord Logging</strong> - Track all mining"
        ],
        commands: [
            { cmd: "!mine", desc: "Go mining for ores" }
        ],
        config: [
            { variable: "config_mine_min_reward", default: "45", desc: "Minimum mine reward" },
            { variable: "config_mine_max_reward", default: "140", desc: "Maximum mine reward" },
            { variable: "config_mine_cooldown_minutes", default: "30", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Mining",
                lines: [
                    { type: "user", text: "!mine" },
                    { type: "bot", text: "&#9935; User mined Gold Ore worth $120! | Balance: $620" }
                ]
            }
        ],
        related: ["dig", "work", "hunt", "scavenge"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "dig": {
        name: "Dig",
        command: "!dig",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$35-110"],
        description: "Dig for buried treasures. You never know what you might find!",
        features: [
            "<strong>Random Finds</strong> - Various buried items",
            "<strong>Rare Artifacts</strong> - Chance for valuable antiques",
            "<strong>Item Names</strong> - Displays what you found",
            "<strong>25 Min Cooldown</strong> - Dig every 25 minutes",
            "<strong>Discord Logging</strong> - Track all finds"
        ],
        commands: [
            { cmd: "!dig", desc: "Dig for buried treasure" }
        ],
        config: [
            { variable: "config_dig_min_reward", default: "35", desc: "Minimum dig reward" },
            { variable: "config_dig_max_reward", default: "110", desc: "Maximum dig reward" },
            { variable: "config_dig_cooldown_minutes", default: "25", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Digging",
                lines: [
                    { type: "user", text: "!dig" },
                    { type: "bot", text: "&#128296; User dug up an Ancient Coin worth $85! | Balance: $585" }
                ]
            }
        ],
        related: ["mine", "search", "treasure", "scavenge"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Dig"
    },

    "search": {
        name: "Search",
        command: "!search",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$30-95"],
        description: "Search the area for lost coins. Look around and find what others have dropped!",
        features: [
            "<strong>Random Locations</strong> - Search different areas",
            "<strong>Found Items</strong> - Various lost items and coins",
            "<strong>Location Names</strong> - Displays where you searched",
            "<strong>20 Min Cooldown</strong> - Search every 20 minutes",
            "<strong>Discord Logging</strong> - Track all searches"
        ],
        commands: [
            { cmd: "!search", desc: "Search the area for coins" }
        ],
        config: [
            { variable: "config_search_min_reward", default: "30", desc: "Minimum search reward" },
            { variable: "config_search_max_reward", default: "95", desc: "Maximum search reward" },
            { variable: "config_search_cooldown_minutes", default: "20", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Searching",
                lines: [
                    { type: "user", text: "!search" },
                    { type: "bot", text: "&#128269; User searched the couch cushions and found $65! | Balance: $565" }
                ]
            }
        ],
        related: ["dig", "scavenge", "forage", "beg"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "forage": {
        name: "Forage",
        command: "!forage",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$30-100"],
        description: "Forage in the forest for valuables. Nature has plenty to offer!",
        features: [
            "<strong>Random Finds</strong> - Berries, mushrooms, herbs",
            "<strong>Rare Plants</strong> - Chance for valuable herbs",
            "<strong>Item Names</strong> - Displays what you found",
            "<strong>25 Min Cooldown</strong> - Forage every 25 minutes",
            "<strong>Discord Logging</strong> - Track all foraging"
        ],
        commands: [
            { cmd: "!forage", desc: "Forage in the forest" }
        ],
        config: [
            { variable: "config_forage_min_reward", default: "30", desc: "Minimum forage reward" },
            { variable: "config_forage_max_reward", default: "100", desc: "Maximum forage reward" },
            { variable: "config_forage_cooldown_minutes", default: "25", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Foraging",
                lines: [
                    { type: "user", text: "!forage" },
                    { type: "bot", text: "&#127807; User foraged Rare Mushrooms worth $80! | Balance: $580" }
                ]
            }
        ],
        related: ["fish", "hunt", "search", "dig"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "scavenge": {
        name: "Scavenge",
        command: "!scavenge",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$15-150"],
        description: "Scavenge through the junkyard. One person's trash is another's treasure!",
        features: [
            "<strong>High Variance</strong> - Wide reward range",
            "<strong>Random Junk</strong> - Various salvageable items",
            "<strong>Rare Finds</strong> - Chance for valuable electronics",
            "<strong>30 Min Cooldown</strong> - Scavenge every 30 minutes",
            "<strong>Discord Logging</strong> - Track all scavenging"
        ],
        commands: [
            { cmd: "!scavenge", desc: "Scavenge through the junkyard" }
        ],
        config: [
            { variable: "config_scavenge_min_reward", default: "15", desc: "Minimum scavenge reward" },
            { variable: "config_scavenge_max_reward", default: "150", desc: "Maximum scavenge reward" },
            { variable: "config_scavenge_cooldown_minutes", default: "30", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Scavenging",
                lines: [
                    { type: "user", text: "!scavenge" },
                    { type: "bot", text: "&#128465; User scavenged a Working Radio worth $130! | Balance: $630" }
                ]
            }
        ],
        related: ["search", "dig", "mine", "forage"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Scavenge"
    },

    "collect": {
        name: "Collect",
        command: "!collect",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$50-200"],
        description: "Collect your hourly income. Passive earnings every hour!",
        features: [
            "<strong>Hourly Income</strong> - Collect every 60 minutes",
            "<strong>Guaranteed Pay</strong> - Always get something",
            "<strong>Bonus Chance</strong> - Random bonus multiplier",
            "<strong>Discord Logging</strong> - Track all collections"
        ],
        commands: [
            { cmd: "!collect", desc: "Collect your hourly income" }
        ],
        config: [
            { variable: "config_collect_min_reward", default: "50", desc: "Minimum collect reward" },
            { variable: "config_collect_max_reward", default: "200", desc: "Maximum collect reward" },
            { variable: "config_collect_cooldown_minutes", default: "60", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Collecting",
                lines: [
                    { type: "user", text: "!collect" },
                    { type: "bot", text: "&#128176; User collected their hourly income: $150! | Balance: $650" }
                ]
            }
        ],
        related: ["daily", "work", "luck", "beg"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Collect"
    },

    "beg": {
        name: "Beg",
        command: "!beg",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$10-50"],
        description: "Beg for spare change. Low risk, low reward. Perfect for when you're broke!",
        features: [
            "<strong>Low Cooldown</strong> - Beg every 15 minutes",
            "<strong>Random NPCs</strong> - Different people give different amounts",
            "<strong>Flavor Text</strong> - Fun begging scenarios",
            "<strong>No Risk</strong> - Always get something",
            "<strong>Discord Logging</strong> - Track all begging"
        ],
        commands: [
            { cmd: "!beg", desc: "Beg for spare change" }
        ],
        config: [
            { variable: "config_beg_min_reward", default: "10", desc: "Minimum beg reward" },
            { variable: "config_beg_max_reward", default: "50", desc: "Maximum beg reward" },
            { variable: "config_beg_cooldown_minutes", default: "15", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Begging",
                lines: [
                    { type: "user", text: "!beg" },
                    { type: "bot", text: "&#128591; A kind stranger gave User $35! | Balance: $535" }
                ]
            }
        ],
        related: ["collect", "search", "luck", "daily"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Beg"
    },

    "luck": {
        name: "Luck",
        command: "!luck",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$0-500"],
        description: "Test your luck! Rewards range from 0 to 500. High variance earning!",
        features: [
            "<strong>Extreme Variance</strong> - 0 to 500 range",
            "<strong>Luck Based</strong> - Pure random chance",
            "<strong>Big Win Potential</strong> - Can hit 500",
            "<strong>45 Min Cooldown</strong> - Test luck every 45 minutes",
            "<strong>Discord Logging</strong> - Track all luck tests"
        ],
        commands: [
            { cmd: "!luck", desc: "Test your luck!" }
        ],
        config: [
            { variable: "config_luck_min_reward", default: "0", desc: "Minimum luck reward" },
            { variable: "config_luck_max_reward", default: "500", desc: "Maximum luck reward" },
            { variable: "config_luck_cooldown_minutes", default: "45", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Testing Luck",
                lines: [
                    { type: "user", text: "!luck" },
                    { type: "bot", text: "&#127808; User tested their luck and got $350! Lucky! | Balance: $850" }
                ]
            },
            {
                title: "Unlucky",
                lines: [
                    { type: "user", text: "!luck" },
                    { type: "bot", text: "&#127808; User tested their luck and got $5... Better luck next time! | Balance: $505" }
                ]
            }
        ],
        related: ["gamble", "daily", "collect", "magic"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Luck"
    },

    "battle": {
        name: "Battle",
        command: "!battle",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$35-180"],
        description: "Battle monsters for rewards. Fight your way to riches!",
        features: [
            "<strong>Random Monsters</strong> - Various enemy types",
            "<strong>Combat System</strong> - Simple battle mechanics",
            "<strong>Loot Drops</strong> - Earn rewards from victories",
            "<strong>60 Min Cooldown</strong> - Battle every hour",
            "<strong>Discord Logging</strong> - Track all battles"
        ],
        commands: [
            { cmd: "!battle", desc: "Battle a random monster" }
        ],
        config: [
            { variable: "config_battle_min_reward", default: "35", desc: "Minimum battle reward" },
            { variable: "config_battle_max_reward", default: "180", desc: "Maximum battle reward" },
            { variable: "config_battle_cooldown_minutes", default: "60", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Battling",
                lines: [
                    { type: "user", text: "!battle" },
                    { type: "bot", text: "&#9876; User battled a Dragon and won! Loot: $150 | Balance: $650" }
                ]
            }
        ],
        related: ["hunt", "magic", "duel", "heist"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Battle"
    },

    "magic": {
        name: "Magic",
        command: "!magic",
        category: "Earning",
        categoryAnchor: "earning",
        status: "Completed",
        badges: ["Earning", "$40-120"],
        description: "Cast spells for magical rewards. Harness the power of magic!",
        features: [
            "<strong>Random Spells</strong> - Various magical outcomes",
            "<strong>Spell Names</strong> - Fun spell flavor text",
            "<strong>Magical Rewards</strong> - Earn through sorcery",
            "<strong>45 Min Cooldown</strong> - Cast every 45 minutes",
            "<strong>Discord Logging</strong> - Track all magic"
        ],
        commands: [
            { cmd: "!magic", desc: "Cast a spell for rewards" }
        ],
        config: [
            { variable: "config_magic_min_reward", default: "40", desc: "Minimum magic reward" },
            { variable: "config_magic_max_reward", default: "120", desc: "Maximum magic reward" },
            { variable: "config_magic_cooldown_minutes", default: "45", desc: "Cooldown in minutes" }
        ],
        examples: [
            {
                title: "Casting Magic",
                lines: [
                    { type: "user", text: "!magic" },
                    { type: "bot", text: "&#10024; User cast Gold Transmutation and earned $100! | Balance: $600" }
                ]
            }
        ],
        related: ["battle", "luck", "hunt", "treasure"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Magic"
    },

    // ============== PVP COMMANDS ==============
    "duel": {
        name: "Duel",
        command: "!duel",
        category: "PvP",
        categoryAnchor: "pvp",
        status: "Completed",
        badges: ["PvP", "1v1"],
        description: "Challenge another user to a duel. Winner takes all!",
        features: [
            "<strong>1v1 Combat</strong> - Challenge specific users",
            "<strong>Bet Matching</strong> - Both players risk equal amounts",
            "<strong>Accept/Decline</strong> - Target can accept or decline",
            "<strong>Winner Takes All</strong> - Full pot to the victor",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!duel @user [bet]", desc: "Challenge a user to a duel" },
            { cmd: "!duel accept", desc: "Accept a duel challenge" },
            { cmd: "!duel decline", desc: "Decline a duel challenge" }
        ],
        config: [
            { variable: "config_duel_min_bet", default: "50", desc: "Minimum duel bet" },
            { variable: "config_duel_max_bet", default: "1000", desc: "Maximum duel bet" },
            { variable: "config_duel_timeout", default: "30", desc: "Seconds to accept" },
            { variable: "config_duel_cooldown_seconds", default: "60", desc: "Cooldown between duels" }
        ],
        examples: [
            {
                title: "Starting a Duel",
                lines: [
                    { type: "user", text: "!duel @Rival 200" },
                    { type: "bot", text: "&#9876; User challenges Rival to a $200 duel! Type !duel accept or !duel decline (30s)" }
                ]
            },
            {
                title: "Duel Result",
                lines: [
                    { type: "user", text: "!duel accept" },
                    { type: "bot", text: "&#9876; DUEL! User vs Rival... User wins! +$400 | Balance: $900" }
                ]
            }
        ],
        related: ["rob", "race", "bounty", "battle"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Duel"
    },

    "rob": {
        name: "Rob",
        command: "!rob",
        category: "PvP",
        categoryAnchor: "pvp",
        status: "Completed",
        badges: ["PvP", "High Risk"],
        description: "Attempt to steal coins from another user. Risk vs reward! Can backfire badly.",
        features: [
            "<strong>Steal Attempt</strong> - Try to take someone's coins",
            "<strong>Success/Fail</strong> - Not guaranteed to work",
            "<strong>Backfire Risk</strong> - Can lose money if caught",
            "<strong>Target Balance</strong> - Steal % of their balance",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!rob @user", desc: "Attempt to rob a user" }
        ],
        config: [
            { variable: "config_rob_success_rate", default: "35", desc: "Success percentage" },
            { variable: "config_rob_min_balance", default: "100", desc: "Target must have this much" },
            { variable: "config_rob_steal_percent", default: "20", desc: "Percent stolen on success" },
            { variable: "config_rob_fail_penalty", default: "50", desc: "Lost when caught" },
            { variable: "config_rob_cooldown_seconds", default: "300", desc: "Cooldown (5 min)" }
        ],
        examples: [
            {
                title: "Successful Rob",
                lines: [
                    { type: "user", text: "!rob @RichGuy" },
                    { type: "bot", text: "&#128374; User successfully robbed $200 from RichGuy! | Balance: $700" }
                ]
            },
            {
                title: "Failed Rob",
                lines: [
                    { type: "user", text: "!rob @AlertPerson" },
                    { type: "bot", text: "&#128680; User was caught trying to rob AlertPerson! Fined $50 | Balance: $450" }
                ]
            }
        ],
        related: ["duel", "heist", "bounty", "treasure"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Rob"
    },

    "race": {
        name: "Race",
        command: "!race",
        category: "PvP",
        categoryAnchor: "pvp",
        status: "Completed",
        badges: ["PvP"],
        description: "Race against others for the prize pool! Join races and compete for first place.",
        features: [
            "<strong>Multi-Player</strong> - Multiple racers can join",
            "<strong>Entry Fee</strong> - Buy-in to join the race",
            "<strong>Prize Pool</strong> - Winner takes the pot",
            "<strong>Race Animation</strong> - Fun visual race display",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!race start [bet]", desc: "Start a new race" },
            { cmd: "!race join", desc: "Join an active race" }
        ],
        config: [
            { variable: "config_race_min_bet", default: "50", desc: "Minimum entry fee" },
            { variable: "config_race_max_bet", default: "500", desc: "Maximum entry fee" },
            { variable: "config_race_min_players", default: "2", desc: "Minimum players to start" },
            { variable: "config_race_join_time", default: "30", desc: "Seconds to join" },
            { variable: "config_race_cooldown_seconds", default: "120", desc: "Cooldown (2 min)" }
        ],
        examples: [
            {
                title: "Starting a Race",
                lines: [
                    { type: "user", text: "!race start 100" },
                    { type: "bot", text: "&#127939; User started a race! Entry: $100 | Type !race join (30s) | Prize pool: $100" }
                ]
            },
            {
                title: "Race Result",
                lines: [
                    { type: "bot", text: "&#127939; RACE! &#128034;User... &#128007;Player2... &#128025;Speedy... Speedy wins! Prize: $300" }
                ]
            }
        ],
        related: ["duel", "bounty", "heist", "gamble"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games"
    },

    "bounty": {
        name: "Bounty",
        command: "!bounty",
        category: "PvP",
        categoryAnchor: "pvp",
        status: "Completed",
        badges: ["PvP"],
        description: "Place or hunt bounties on other players. Put a price on someone's head!",
        features: [
            "<strong>Place Bounties</strong> - Put a price on someone",
            "<strong>Hunt Bounties</strong> - Claim active bounties",
            "<strong>Bounty List</strong> - See all active bounties",
            "<strong>Stacking</strong> - Multiple bounties on one person",
            "<strong>Cooldown System</strong> - Prevents spam"
        ],
        commands: [
            { cmd: "!bounty @user [amount]", desc: "Place a bounty on someone" },
            { cmd: "!bounty hunt @user", desc: "Attempt to claim a bounty" },
            { cmd: "!bounty list", desc: "View all active bounties" }
        ],
        config: [
            { variable: "config_bounty_min_amount", default: "100", desc: "Minimum bounty amount" },
            { variable: "config_bounty_success_rate", default: "50", desc: "Hunt success percentage" },
            { variable: "config_bounty_cooldown_seconds", default: "300", desc: "Cooldown (5 min)" }
        ],
        examples: [
            {
                title: "Placing a Bounty",
                lines: [
                    { type: "user", text: "!bounty @Enemy 500" },
                    { type: "bot", text: "&#128176; User placed a $500 bounty on Enemy! Total bounty: $500" }
                ]
            },
            {
                title: "Claiming a Bounty",
                lines: [
                    { type: "user", text: "!bounty hunt @Enemy" },
                    { type: "bot", text: "&#127919; User claimed the bounty on Enemy! +$500 | Balance: $1,000" }
                ]
            }
        ],
        related: ["duel", "rob", "race", "heist"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Currency/Games/Bounty"
    },

    // ============== UTILITY COMMANDS ==============
    "countdown": {
        name: "Countdown",
        command: "!countdown",
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility", "Channel Points"],
        description: "Start a live chat countdown. Works with both chat commands and Channel Point redemptions. Announcements at smart intervals, ending with a 5-4-3-2-1 finish.",
        features: [
            "<strong>Dual Trigger</strong> – Works as a chat command (!countdown) and as a Channel Point reward",
            "<strong>Flexible Duration</strong> – Accepts seconds (60) or minutes (5m), up to 10 minutes",
            "<strong>Smart Announcements</strong> – Calls out remaining time at key milestones so chat stays informed",
            "<strong>Cancellable</strong> – Type !countdown stop at any time to cancel a running countdown",
            "<strong>Spam Protection</strong> – Cooldown between countdowns and blocks duplicate starts",
            "<strong>Discord Logging</strong> – Start and finish events logged to Discord"
        ],
        commands: [
            { cmd: "!countdown 60",   desc: "Start a 60-second countdown (within configured range)" },
            { cmd: "!countdown 5m",   desc: "Start a 5-minute countdown (within configured range)" },
            { cmd: "!countdown stop", desc: "Cancel the active countdown" },
            { cmd: "!timer",          desc: "Alias for !countdown" },
            { cmd: "!cd",             desc: "Alias for !countdown" }
        ],
        config: [
            { variable: "config_countdown_min",                    default: "10",             desc: "Minimum seconds a viewer can request via the command" },
            { variable: "config_countdown_max",                    default: "600",            desc: "Maximum seconds a viewer can request via the command" },
            { variable: "config_countdown_channel_point_duration", default: "60",             desc: "Fixed duration (seconds) used when triggered by a channel point — set this to whatever you want" },
            { variable: "config_countdown_cooldown",               default: "30",             desc: "Seconds required between countdowns to prevent spam" },
            { variable: "config_countdown_obs_enabled",            default: "false",          desc: "Set to true to update an OBS Text GDI+ source with the live countdown" },
            { variable: "config_countdown_obs_scene",              default: "Your Scene",     desc: "Name of the OBS scene that contains the text source" },
            { variable: "config_countdown_obs_source",             default: "Countdown Timer", desc: "Name of the Text GDI+ source — shows MM:SS while running, clears when done or cancelled" }
        ],
        examples: [
            {
                title: "Command — 60 Seconds",
                lines: [
                    { type: "user", text: "!countdown 60" },
                    { type: "bot",  text: "⏳ Countdown starting! 1m on the clock!" },
                    { type: "bot",  text: "⏳ 30s remaining!" },
                    { type: "bot",  text: "⏳ 10s remaining!" },
                    { type: "bot",  text: "⏳ 5... 4... 3... 2... 1..." },
                    { type: "bot",  text: "🎉 Time's up!" }
                ]
            },
            {
                title: "Channel Point (streamer set to 2 minutes)",
                lines: [
                    { type: "user", text: "[redeems \"Start Countdown\"]" },
                    { type: "bot",  text: "⏳ Countdown starting! 2m on the clock!" },
                    { type: "bot",  text: "⏳ 1m remaining!" },
                    { type: "bot",  text: "⏳ 30s remaining!" },
                    { type: "bot",  text: "⏳ 10s remaining!" },
                    { type: "bot",  text: "🎉 Time's up!" }
                ]
            },
            {
                title: "Out of Range",
                lines: [
                    { type: "user", text: "!countdown 5" },
                    { type: "bot",  text: "@User minimum countdown is 10s." }
                ]
            },
            {
                title: "Cancelling",
                lines: [
                    { type: "user", text: "!countdown 5m" },
                    { type: "bot",  text: "⏳ Countdown starting! 5m on the clock!" },
                    { type: "user", text: "!countdown stop" },
                    { type: "bot",  text: "⛔ Countdown cancelled by StreamerName." }
                ]
            }
        ],
        related: ["welcome", "shoutout", "discord-logging"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Utilities/Countdown"
    },

    "discord-logging": {
        name: "Discord Logging",
        command: null,
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility", "Integration"],
        description: "Automatic event logging to Discord with color-coded embeds. Track all currency activity!",
        features: [
            "<strong>Webhook Integration</strong> - Sends to Discord channel",
            "<strong>Color Coded</strong> - Different colors for win/loss/event",
            "<strong>Rich Embeds</strong> - Beautiful formatted messages",
            "<strong>All Events</strong> - Tracks gambling, earning, transfers",
            "<strong>Configurable</strong> - Enable/disable per command type"
        ],
        commands: [],
        config: [
            { variable: "config_discord_webhook_url", default: "(your webhook)", desc: "Discord webhook URL" },
            { variable: "config_discord_logging_enabled", default: "true", desc: "Enable/disable logging" },
            { variable: "config_discord_log_gambling", default: "true", desc: "Log gambling results" },
            { variable: "config_discord_log_earning", default: "true", desc: "Log earning commands" },
            { variable: "config_discord_log_transfers", default: "true", desc: "Log currency transfers" }
        ],
        examples: [
            {
                title: "Discord Log Example",
                lines: [
                    { type: "bot", text: "[Discord Embed] &#127920; SLOTS WIN | User won $500 on slots! | Bet: $100 | Balance: $1,500" }
                ]
            }
        ],
        related: ["discord", "config-setup"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Utilities/Discord"
    },

    "discord": {
        name: "Discord",
        command: "!discord",
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility"],
        description: "Share your Discord server invite link in chat. Easy way to grow your community!",
        features: [
            "<strong>Quick Link</strong> - Posts Discord invite instantly",
            "<strong>Customizable</strong> - Set your own invite link",
            "<strong>Cooldown</strong> - Prevents link spam"
        ],
        commands: [
            { cmd: "!discord", desc: "Post Discord invite link" }
        ],
        config: [
            { variable: "config_discord_invite_url", default: "(your invite)", desc: "Your Discord invite link" },
            { variable: "config_discord_cooldown_seconds", default: "60", desc: "Cooldown between uses" }
        ],
        examples: [
            {
                title: "Posting Discord Link",
                lines: [
                    { type: "user", text: "!discord" },
                    { type: "bot", text: "&#128172; Join our Discord community: https://discord.gg/example" }
                ]
            }
        ],
        related: ["discord-logging", "shoutout", "followage"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Utilities/Discord"
    },

    "followage": {
        name: "Followage",
        command: "!followage",
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility"],
        description: "Check how long you or another user has been following the channel.",
        features: [
            "<strong>Self Check</strong> - Check your own follow time",
            "<strong>User Lookup</strong> - Check anyone's follow time",
            "<strong>Formatted Time</strong> - Years, months, days, hours",
            "<strong>Twitch API</strong> - Uses official Twitch data"
        ],
        commands: [
            { cmd: "!followage", desc: "Check your follow time" },
            { cmd: "!followage @user", desc: "Check another user's follow time" }
        ],
        config: [
            { variable: "config_twitch_access_token", default: "(your token)", desc: "Twitch API access token" },
            { variable: "config_twitch_client_id", default: "(your client id)", desc: "Twitch API client ID" }
        ],
        examples: [
            {
                title: "Checking Followage",
                lines: [
                    { type: "user", text: "!followage" },
                    { type: "bot", text: "&#128153; User has been following for 1 year, 3 months, 15 days!" }
                ]
            }
        ],
        related: ["discord", "shoutout", "welcome"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Utilities/Followage"
    },

    "shoutout": {
        name: "Shoutout",
        command: "!so",
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility", "OBS"],
        description: "Give a shoutout to another streamer with OBS animations. Show some love!",
        features: [
            "<strong>Streamer Shoutout</strong> - Promote other streamers",
            "<strong>OBS Animation</strong> - Trigger visual alerts",
            "<strong>Game Display</strong> - Shows what they stream",
            "<strong>Auto Link</strong> - Posts their channel link",
            "<strong>Mod Only</strong> - Restricted to moderators"
        ],
        commands: [
            { cmd: "!so @user", desc: "Shoutout a streamer (mod only)" },
            { cmd: "!shoutout @user", desc: "Full command alias" }
        ],
        config: [
            { variable: "config_shoutout_obs_source", default: "ShoutoutAlert", desc: "OBS source name for animation" },
            { variable: "config_shoutout_duration", default: "5000", desc: "Animation duration (ms)" }
        ],
        examples: [
            {
                title: "Giving a Shoutout",
                lines: [
                    { type: "user", text: "!so @CoolStreamer" },
                    { type: "bot", text: "&#128227; Check out CoolStreamer at twitch.tv/CoolStreamer - Last seen playing Minecraft!" }
                ]
            }
        ],
        related: ["followage", "welcome", "clip", "discord"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Utilities/Shoutouts"
    },

    "welcome": {
        name: "Welcome Message",
        command: null,
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility", "Auto"],
        description: "Automatically greet first-time chatters. Make newcomers feel welcome!",
        features: [
            "<strong>Auto Trigger</strong> - Fires on first message",
            "<strong>Custom Message</strong> - Personalized welcome text",
            "<strong>First Time Only</strong> - Only greets once",
            "<strong>User Tracking</strong> - Remembers who's been welcomed"
        ],
        commands: [],
        config: [
            { variable: "config_welcome_enabled", default: "true", desc: "Enable welcome messages" },
            { variable: "config_welcome_message", default: "Welcome to the stream, {user}!", desc: "Welcome message template" }
        ],
        examples: [
            {
                title: "Auto Welcome",
                lines: [
                    { type: "user", text: "Hello everyone!" },
                    { type: "bot", text: "&#128075; Welcome to the stream, NewViewer! Enjoy your stay!" }
                ]
            }
        ],
        related: ["followage", "shoutout", "discord"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Utilities/Welcome-Message"
    },

    "youtube-player": {
        name: "YouTube Player",
        command: null,
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility", "Channel Points"],
        description: "Channel point redemption system for video queue. Let viewers request videos!",
        features: [
            "<strong>Channel Points</strong> - Redemption triggered",
            "<strong>Video Queue</strong> - Manages requested videos",
            "<strong>Duration Limits</strong> - Max video length setting",
            "<strong>Mod Controls</strong> - Skip, clear, manage queue",
            "<strong>OBS Integration</strong> - Plays in browser source"
        ],
        commands: [
            { cmd: "!queue", desc: "View current video queue" },
            { cmd: "!skip", desc: "Skip current video (mod only)" },
            { cmd: "!clearqueue", desc: "Clear the queue (mod only)" }
        ],
        config: [
            { variable: "config_youtube_max_duration", default: "300", desc: "Max video length (seconds)" },
            { variable: "config_youtube_queue_size", default: "10", desc: "Max queue size" }
        ],
        examples: [
            {
                title: "Video Request",
                lines: [
                    { type: "bot", text: "&#127909; NewViewer redeemed Video Request! Added to queue: 'Cool Video Title' (3:24)" }
                ]
            }
        ],
        related: ["clip", "shoutout", "discord"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Utilities/YouTube-Player"
    },

    "clip": {
        name: "Clip",
        command: "!clip",
        category: "Utility",
        categoryAnchor: "utility",
        status: "Completed",
        badges: ["Utility", "Twitch API"],
        description: "Create Twitch clips with custom titles. Capture the best moments!",
        features: [
            "<strong>Instant Clip</strong> - Creates clip immediately",
            "<strong>Custom Title</strong> - Add your own title",
            "<strong>Auto Title</strong> - Uses default if none given",
            "<strong>Link Output</strong> - Posts clip URL to chat",
            "<strong>Cooldown</strong> - Prevents clip spam"
        ],
        commands: [
            { cmd: "!clip", desc: "Create a clip with default title" },
            { cmd: "!clip [title]", desc: "Create a clip with custom title" }
        ],
        config: [
            { variable: "config_clip_cooldown_seconds", default: "30", desc: "Cooldown between clips" },
            { variable: "config_clip_default_title", default: "Clipped by {user}", desc: "Default clip title" }
        ],
        examples: [
            {
                title: "Creating a Clip",
                lines: [
                    { type: "user", text: "!clip Epic fail!" },
                    { type: "bot", text: "&#127909; Clip created: 'Epic fail!' - https://clips.twitch.tv/example" }
                ]
            }
        ],
        related: ["shoutout", "youtube-player", "followage"],
        github: "https://github.com/HexEchoTV/CUBSOFTWARE/tree/main/cubsoftware-server/apps/streamerbot-commands/files/Clip/Clip-Fetch"
    }
};

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = commandsData;
}
