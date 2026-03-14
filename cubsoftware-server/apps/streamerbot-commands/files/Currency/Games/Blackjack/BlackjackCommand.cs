// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)
//
// INTERACTIVE BLACKJACK GAME
// Usage:
//   !blackjack <amount> - Start new game with bet
//   !blackjack hit      - Draw another card
//   !blackjack stand    - Stand (dealer plays)

using System;
using System.Linq;
using System.Net;
using System.Text;

public class CPHInline
{

    public bool Execute()
    {
        try
        {
            // Load configuration from global variables
            string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
            string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);
            int minBet = CPH.GetGlobalVar<int>("config_blackjack_min_bet", true);
            int maxBet = CPH.GetGlobalVar<int>("config_blackjack_max_bet", true);
            int winMult = CPH.GetGlobalVar<int>("config_blackjack_win_mult", true);

            // Get required args
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Blackjack command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Blackjack command: Missing 'userId' argument");
                return false;
            }

            // Get input
            if (!CPH.TryGetArg("input0", out string input0) || string.IsNullOrEmpty(input0))
            {
                CPH.SendMessage($"{user}, usage: !blackjack <{minBet}-{maxBet}> to start, or !blackjack hit/stand");
                return false;
            }

            input0 = input0.Trim().ToLower();

            // Cooldown check (only for starting new games, not hit/stand)
            if (input0 != "hit" && input0 != "h" && input0 != "stand" && input0 != "s")
            {
                // Get cooldown from config (default 30 seconds)
                int cooldownSeconds = CPH.GetGlobalVar<int>("config_blackjack_cooldown_seconds", true);
                if (cooldownSeconds == 0) cooldownSeconds = 30; // Default if not configured

                string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "blackjack_last_played", true);
                if (!string.IsNullOrEmpty(lastPlayedStr))
                {
                    DateTime lastPlayed = DateTime.Parse(lastPlayedStr);
                    DateTime nextAvailable = lastPlayed.AddSeconds(cooldownSeconds);
                    DateTime now = DateTime.UtcNow;

                    if (now < nextAvailable)
                    {
                        TimeSpan remaining = nextAvailable - now;
                        string timeLeft = remaining.TotalSeconds < 60
                            ? $"{(int)remaining.TotalSeconds}s"
                            : $"{remaining.Minutes}m {remaining.Seconds}s";

                        CPH.SendMessage($"{user}, blackjack cooldown! Wait {timeLeft} before starting a new game.");

                        LogWarning("Blackjack Cooldown",
                            $"**User:** {user}\n**Time Remaining:** {timeLeft}");

                        return false;
                    }
                }
            }

            // Check if there's an active game (non-persistent)
            bool hasActiveGame = CPH.GetTwitchUserVarById<bool>(userId, "blackjack_active", false);

            // Handle HIT command
            if (input0 == "hit" || input0 == "h")
            {
                if (!hasActiveGame)
                {
                    CPH.SendMessage($"{user}, you don't have an active blackjack game! Start one with !blackjack <bet>");
                    return false;
                }

                return HandleHit(userId, user, currencyKey, currencyName, winMult);
            }

            // Handle STAND command
            if (input0 == "stand" || input0 == "s")
            {
                if (!hasActiveGame)
                {
                    CPH.SendMessage($"{user}, you don't have an active blackjack game! Start one with !blackjack <bet>");
                    return false;
                }

                return HandleStand(userId, user, currencyKey, currencyName, winMult);
            }

            // Otherwise, try to parse as bet amount (new game)
            if (!int.TryParse(input0, out int betAmount))
            {
                CPH.SendMessage($"{user}, invalid input! Usage: !blackjack <{minBet}-{maxBet}> or !blackjack hit/stand");
                return false;
            }

            // Validate bet amount
            if (betAmount < minBet || betAmount > maxBet)
            {
                CPH.SendMessage($"{user}, bet must be between {minBet} and {maxBet} {currencyName}!");
                return false;
            }

            // Check if user already has an active game
            if (hasActiveGame)
            {
                CPH.SendMessage($"{user}, you already have an active game! Use !blackjack hit or !blackjack stand");
                return false;
            }

            // Check balance
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (balance < betAmount)
            {
                LogWarning("Blackjack Insufficient Funds",
                    $"**User:** {user}\n**Bet:** ${betAmount}\n**Balance:** ${balance}");

                CPH.SendMessage($"{user}, you need ${betAmount} {currencyName}! You have ${balance}.");
                return false;
            }

            // Start new game
            return StartNewGame(userId, user, betAmount, currencyKey, balance);
        }
        catch (Exception ex)
        {
            LogError("Blackjack Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during blackjack");
            CPH.LogError($"Blackjack error: {ex.Message}");
            return false;
        }
    }

    private bool StartNewGame(string userId, string user, int betAmount, string currencyKey, int balance)
    {
        // Deduct bet from balance
        balance -= betAmount;
        CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

        // Deal initial cards
        Random random = new Random(Guid.NewGuid().GetHashCode()); // Better randomness
        int playerCard1 = DrawCard(random);
        int playerCard2 = DrawCard(random);
        int dealerCard1 = DrawCard(random);
        int dealerCard2 = DrawCard(random);

        // Store game state (non-persistent - clears on restart)
        CPH.SetTwitchUserVarById(userId, "blackjack_active", true, false);
        CPH.SetTwitchUserVarById(userId, "blackjack_bet", betAmount, false);
        CPH.SetTwitchUserVarById(userId, "blackjack_player_hand", $"{playerCard1},{playerCard2}", false);
        CPH.SetTwitchUserVarById(userId, "blackjack_dealer_hand", $"{dealerCard1},{dealerCard2}", false);
        CPH.SetTwitchUserVarById(userId, "blackjack_start_time", DateTime.UtcNow.ToString("o"), false);

        int playerTotal = CalculateHandValue(new[] { playerCard1, playerCard2 });
        int dealerVisible = dealerCard1;

        // Get timeout value for display
        int timeoutSeconds = CPH.GetGlobalVar<int>("config_game_inactivity_timeout", true);
        if (timeoutSeconds == 0) timeoutSeconds = 60;

        // Log game start
        LogCommand("!blackjack", user, $"Bet: ${betAmount} | Start Game");

        // Check for immediate blackjack
        if (playerTotal == 21)
        {
            // Player got blackjack! Auto-win
            return ResolveGame(userId, user, betAmount, currencyKey, balance, true, "BLACKJACK!");
        }

        // Show initial hand
        CPH.SendMessage($"🃏 {user} | Your hand: {FormatCard(playerCard1)}, {FormatCard(playerCard2)} = {playerTotal} | Dealer shows: {FormatCard(dealerVisible)} | Type !blackjack hit or !blackjack stand ({timeoutSeconds}s timer)");

        return true;
    }

    private bool HandleHit(string userId, string user, string currencyKey, string currencyName, int winMult)
    {
        // Check for timeout (configurable inactivity timeout)
        int timeoutSeconds = CPH.GetGlobalVar<int>("config_game_inactivity_timeout", true);
        if (timeoutSeconds == 0) timeoutSeconds = 60;

        string startTimeStr = CPH.GetTwitchUserVarById<string>(userId, "blackjack_start_time", false);
        if (!string.IsNullOrEmpty(startTimeStr))
        {
            DateTime startTime = DateTime.Parse(startTimeStr);
            TimeSpan elapsed = DateTime.UtcNow - startTime;
            if (elapsed.TotalSeconds > timeoutSeconds)
            {
                CPH.SendMessage($"⏱️ {user}, your Blackjack game timed out after {timeoutSeconds} seconds of inactivity! Auto-standing...");
                return HandleStand(userId, user, currencyKey, currencyName, winMult);
            }
        }

        // Get current game state
        string playerHandStr = CPH.GetTwitchUserVarById<string>(userId, "blackjack_player_hand", false);
        int[] playerHand = playerHandStr.Split(',').Select(int.Parse).ToArray();

        // Draw new card
        Random random = new Random(Guid.NewGuid().GetHashCode());
        int newCard = DrawCard(random);

        // Add to hand
        int[] newHand = new int[playerHand.Length + 1];
        playerHand.CopyTo(newHand, 0);
        newHand[newHand.Length - 1] = newCard;

        // Update hand in storage
        CPH.SetTwitchUserVarById(userId, "blackjack_player_hand", string.Join(",", newHand), false);

        int playerTotal = CalculateHandValue(newHand);

        // Get dealer visible card
        string dealerHandStr = CPH.GetTwitchUserVarById<string>(userId, "blackjack_dealer_hand", false);
        int dealerVisible = int.Parse(dealerHandStr.Split(',')[0]);

        // Check for instant 21 win
        if (playerTotal == 21)
        {
            int betAmount = CPH.GetTwitchUserVarById<int>(userId, "blackjack_bet", false);
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            CPH.SendMessage($"🃏 {user} drew {FormatCard(newCard)} | Your hand: {FormatHand(newHand)} = 21! 🎉 PERFECT 21! Auto-standing...");

            // Auto-stand with 21
            return HandleStand(userId, user, currencyKey, currencyName, winMult);
        }

        // Check for bust
        if (playerTotal > 21)
        {
            int betAmount = CPH.GetTwitchUserVarById<int>(userId, "blackjack_bet", false);
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            CPH.SendMessage($"🃏 {user} drew {FormatCard(newCard)} | Your hand: {FormatHand(newHand)} = {playerTotal} | 💥 BUST! You lose ${betAmount}.");

            // Clear game state
            ClearGameState(userId);

            // Set cooldown timestamp
            CPH.SetTwitchUserVarById(userId, "blackjack_last_played", DateTime.UtcNow.ToString("o"), true);

            LogWarning("Blackjack Bust",
                $"**User:** {user}\n**Hand:** {playerTotal}\n**Loss:** ${betAmount}\n**Balance:** ${balance}");

            return true;
        }

        // Still in play
        // Update timestamp for new action
        CPH.SetTwitchUserVarById(userId, "blackjack_start_time", DateTime.UtcNow.ToString("o"), false);

        CPH.SendMessage($"🃏 {user} drew {FormatCard(newCard)} | Your hand: {FormatHand(newHand)} = {playerTotal} | Dealer shows: {FormatCard(dealerVisible)} | Type !blackjack hit or !blackjack stand ({timeoutSeconds}s timer)");

        return true;
    }

    private bool HandleStand(string userId, string user, string currencyKey, string currencyName, int winMult)
    {
        // Get game state
        int betAmount = CPH.GetTwitchUserVarById<int>(userId, "blackjack_bet", false);
        int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
        string playerHandStr = CPH.GetTwitchUserVarById<string>(userId, "blackjack_player_hand", false);
        string dealerHandStr = CPH.GetTwitchUserVarById<string>(userId, "blackjack_dealer_hand", false);

        int[] playerHand = playerHandStr.Split(',').Select(int.Parse).ToArray();
        int[] dealerHand = dealerHandStr.Split(',').Select(int.Parse).ToArray();

        int playerTotal = CalculateHandValue(playerHand);
        int dealerTotal = CalculateHandValue(dealerHand);

        // Show dealer's initial hand
        string dealerAction = $"Dealer has: {FormatHand(dealerHand)} = {dealerTotal}";

        // Dealer plays - ADJUSTED: stands at 16 instead of 17 to reduce busting
        Random random = new Random(Guid.NewGuid().GetHashCode());
        while (dealerTotal < 16)
        {
            int newCard = DrawCard(random);
            int[] newDealerHand = new int[dealerHand.Length + 1];
            dealerHand.CopyTo(newDealerHand, 0);
            newDealerHand[newDealerHand.Length - 1] = newCard;
            dealerHand = newDealerHand;
            dealerTotal = CalculateHandValue(dealerHand);

            // Show each card dealer draws
            dealerAction += $" | Dealer hits {FormatCard(newCard)} → {dealerTotal}";
        }

        // Log dealer's final decision
        if (dealerTotal >= 16 && dealerTotal <= 21)
        {
            dealerAction += $" | Dealer stands at {dealerTotal}";
        }

        // Determine winner
        string result;
        int winnings = 0;

        if (dealerTotal > 21)
        {
            // Dealer bust - player wins
            winnings = betAmount * winMult;
            result = "DEALER BUST! You win!";
        }
        else if (playerTotal > dealerTotal)
        {
            // Player wins
            winnings = betAmount * winMult;
            result = "You win!";
        }
        else if (playerTotal == dealerTotal)
        {
            // Push - return bet
            winnings = betAmount;
            result = "PUSH! Tie game.";
        }
        else
        {
            // Dealer wins
            result = "Dealer wins.";
        }

        // Update balance
        balance += winnings;
        CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

        // Clear game state
        ClearGameState(userId);

        // Set cooldown timestamp
        CPH.SetTwitchUserVarById(userId, "blackjack_last_played", DateTime.UtcNow.ToString("o"), true);

        // Send result message with dealer's play-by-play
        CPH.SendMessage($"🃏 {dealerAction}");
        CPH.Wait(1000); // Pause for readability
        CPH.SendMessage($"🃏 {user} had {playerTotal} | Dealer ended with {dealerTotal} | {result} Balance: ${balance}");

        // Log result with dealer hand details for distribution tracking
        string dealerBusted = dealerTotal > 21 ? "YES" : "NO";
        if (winnings > betAmount)
        {
            LogSuccess("Blackjack Win",
                $"**User:** {user}\n**Player:** {playerTotal}\n**Dealer:** {dealerTotal} ({FormatHand(dealerHand)})\n**Dealer Busted:** {dealerBusted}\n**Winnings:** ${winnings}\n**Balance:** ${balance}");
        }
        else if (winnings == betAmount)
        {
            LogInfo("Blackjack Push",
                $"**User:** {user}\n**Player:** {playerTotal}\n**Dealer:** {dealerTotal} ({FormatHand(dealerHand)})\n**Dealer Busted:** {dealerBusted}\n**Result:** Push\n**Balance:** ${balance}");
        }
        else
        {
            LogWarning("Blackjack Loss",
                $"**User:** {user}\n**Player:** {playerTotal}\n**Dealer:** {dealerTotal} ({FormatHand(dealerHand)})\n**Dealer Busted:** {dealerBusted}\n**Loss:** ${betAmount}\n**Balance:** ${balance}");
        }

        return true;
    }

    private bool ResolveGame(string userId, string user, int betAmount, string currencyKey, int balance, bool isBlackjack, string message)
    {
        // Blackjack pays 3:2 (2.5x)
        int winnings = isBlackjack ? (betAmount * 5 / 2) : betAmount * 2;
        balance += winnings;
        CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

        ClearGameState(userId);

        // Set cooldown timestamp
        CPH.SetTwitchUserVarById(userId, "blackjack_last_played", DateTime.UtcNow.ToString("o"), true);

        CPH.SendMessage($"🃏 {user} | {message} You win ${winnings}! Balance: ${balance}");

        LogSuccess("Blackjack - Natural 21",
            $"**User:** {user}\n**Winnings:** ${winnings}\n**Balance:** ${balance}");

        return true;
    }

    private void ClearGameState(string userId)
    {
        // Clear non-persistent game state by setting to defaults
        CPH.SetTwitchUserVarById(userId, "blackjack_active", false, false);
        CPH.SetTwitchUserVarById(userId, "blackjack_bet", 0, false);
        CPH.SetTwitchUserVarById(userId, "blackjack_player_hand", "", false);
        CPH.SetTwitchUserVarById(userId, "blackjack_dealer_hand", "", false);
        CPH.SetTwitchUserVarById(userId, "blackjack_start_time", "", false);
    }

    private int DrawCard(Random random)
    {
        // Simulate real deck with proper distribution
        // In a real deck: 4 each of A-9, and 16 ten-value cards (10,J,Q,K)
        int deckCard = random.Next(1, 53); // 1-52 for full deck simulation

        if (deckCard <= 4) return 1;  // Ace (4 cards)
        if (deckCard <= 8) return 2;  // 2 (4 cards)
        if (deckCard <= 12) return 3; // 3 (4 cards)
        if (deckCard <= 16) return 4; // 4 (4 cards)
        if (deckCard <= 20) return 5; // 5 (4 cards)
        if (deckCard <= 24) return 6; // 6 (4 cards)
        if (deckCard <= 28) return 7; // 7 (4 cards)
        if (deckCard <= 32) return 8; // 8 (4 cards)
        if (deckCard <= 36) return 9; // 9 (4 cards)
        // 10, J, Q, K all count as 10 value (16 cards total)
        if (deckCard <= 40) return 10; // 10 (4 cards)
        if (deckCard <= 44) return 11; // J (4 cards)
        if (deckCard <= 48) return 12; // Q (4 cards)
        return 13; // K (4 cards)
    }

    private int CalculateHandValue(int[] hand)
    {
        int total = 0;
        int aces = 0;

        foreach (int card in hand)
        {
            if (card == 1)
            {
                aces++;
                total += 11; // Count Ace as 11 initially
            }
            else if (card >= 10)
            {
                total += 10; // Face cards = 10
            }
            else
            {
                total += card;
            }
        }

        // Adjust for Aces if bust
        while (total > 21 && aces > 0)
        {
            total -= 10; // Convert Ace from 11 to 1
            aces--;
        }

        return total;
    }

    private string FormatCard(int card)
    {
        switch (card)
        {
            case 1: return "A";
            case 11: return "J";
            case 12: return "Q";
            case 13: return "K";
            default: return card.ToString();
        }
    }

    private string FormatHand(int[] hand)
    {
        return string.Join(", ", hand.Select(c => FormatCard(c)));
    }

    // ═══════════════════════════════════════════════════════════
    // DISCORD LOGGING METHODS
    // ═══════════════════════════════════════════════════════════

    private const int COLOR_INFO = 3447003;      // Blue
    private const int COLOR_SUCCESS = 5763719;   // Green
    private const int COLOR_WARNING = 16705372;  // Orange
    private const int COLOR_ERROR = 15548997;    // Red
    private const int COLOR_COMMAND = 10181046;  // Purple

    private void LogInfo(string title, string message)
    {
        SendToDiscord(title, message, COLOR_INFO, "INFO");
    }

    private void LogSuccess(string title, string message)
    {
        SendToDiscord(title, message, COLOR_SUCCESS, "SUCCESS");
    }

    private void LogWarning(string title, string message)
    {
        SendToDiscord(title, message, COLOR_WARNING, "WARNING");
    }

    private void LogError(string title, string message)
    {
        SendToDiscord(title, message, COLOR_ERROR, "ERROR");
    }

    private void LogCommand(string commandName, string user, string details = "")
    {
        string message = $"**User:** {user}";
        if (!string.IsNullOrEmpty(details))
        {
            message += $"\n**Details:** {details}";
        }
        SendToDiscord($"Command: {commandName}", message, COLOR_COMMAND, "COMMAND");
    }

    private void SendToDiscord(string title, string description, int color, string footer)
    {
        try
        {
            // Check if logging is enabled (global toggle)
            bool loggingEnabled = CPH.GetGlobalVar<bool>("discordLoggingEnabled", true);
            if (!loggingEnabled)
            {
                return; // Logging is disabled
            }

            // Get webhook URL from global variable (set in ConfigSetup.cs)
            string webhookUrl = CPH.GetGlobalVar<string>("discordLogWebhook", true);

            if (string.IsNullOrEmpty(webhookUrl))
            {
                CPH.LogWarn("Discord webhook not configured. Run ConfigSetup.cs first.");
                return;
            }

            // Escape special characters for JSON
            title = EscapeJson(title);
            description = EscapeJson(description);
            footer = EscapeJson(footer);

            // Get current timestamp in ISO format
            string timestamp = DateTime.UtcNow.ToString("o");

            // Build Discord embed JSON manually (no JSON library in StreamerBot)
            StringBuilder json = new StringBuilder();
            json.Append("{");
            json.Append("\"embeds\":[{");
            json.Append($"\"title\":\"{title}\",");
            json.Append($"\"description\":\"{description}\",");
            json.Append($"\"color\":{color},");
            json.Append($"\"timestamp\":\"{timestamp}\",");
            json.Append("\"footer\":{");
            json.Append($"\"text\":\"{footer} | HexEchoTV Logging System\"");
            json.Append("}");
            json.Append("}]");
            json.Append("}");

            // Send to Discord webhook
            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                client.Headers.Add("Content-Type", "application/json");
                client.UploadString(webhookUrl, "POST", json.ToString());
            }
        }
        catch (Exception ex)
        {
            CPH.LogError($"DiscordLogger error: {ex.Message}");
        }
    }

    private string EscapeJson(string str)
    {
        if (string.IsNullOrEmpty(str))
            return "";

        return str
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r")
            .Replace("\t", "\\t");
    }
}
