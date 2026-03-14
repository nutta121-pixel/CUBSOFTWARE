// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)

using System;
using System.Net;
using System.Text;

public class CPHInline
{

    public bool Execute()
    {
        // Load configuration from global variables
        string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
        string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);
        int minBet = CPH.GetGlobalVar<int>("config_highlow_min_bet", true);
        int maxBet = CPH.GetGlobalVar<int>("config_highlow_max_bet", true);
        int winMult = CPH.GetGlobalVar<int>("config_highlow_win_mult", true);

        // Get required arguments
        if (!CPH.TryGetArg("user", out string user))
        {
            CPH.LogError("Highlow command: Missing 'user' argument");
            return false;
        }

        if (!CPH.TryGetArg("userId", out string userId))
        {
            CPH.LogError("Highlow command: Missing 'userId' argument");
            return false;
        }

        // Cooldown check
        int cooldownSeconds = CPH.GetGlobalVar<int>("config_highlow_cooldown_seconds", true);
        if (cooldownSeconds == 0) cooldownSeconds = 20;

        string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "highlow_last_played", true);
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

                CPH.SendMessage($"{user}, highlow cooldown! Wait {timeLeft} before playing again.");
                LogWarning("Highlow Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                return false;
            }
        }

        // Log command execution
        LogCommand("!highlow", user);

        // Get choice
        string choice = "";
        if (!CPH.TryGetArg("input0", out choice) || string.IsNullOrEmpty(choice))
        {
            LogWarning("Highlow Missing Choice", $"**User:** {user}\n**Reason:** No choice specified");
            CPH.SendMessage($"{user}, choose high or low! Usage: !highlow high/low {minBet}-{maxBet}");
            return false;
        }
        choice = choice.ToLower();

        // Get bet
        int betAmount = 0;
        if (!CPH.TryGetArg("input1", out string input1) || string.IsNullOrEmpty(input1))
        {
            LogWarning("Highlow Missing Bet", $"**User:** {user}\n**Reason:** No bet amount specified");
            CPH.SendMessage($"{user}, specify your bet! Usage: !highlow high/low {minBet}-{maxBet}");
            return false;
        }

        if (!int.TryParse(input1, out betAmount))
        {
            LogWarning("Highlow Invalid Bet", $"**User:** {user}\n**Reason:** Invalid bet amount");
            CPH.SendMessage($"{user}, invalid bet! Usage: !highlow high/low {minBet}-{maxBet}");
            return false;
        }

        if (choice != "high" && choice != "low" && choice != "h" && choice != "l")
        {
            LogWarning("Highlow Invalid Choice", $"**User:** {user}\n**Choice:** {choice}");
            CPH.SendMessage($"{user}, choose high or low! Usage: !highlow high/low {minBet}-{maxBet}");
            return false;
        }

        if (choice == "h") choice = "high";
        if (choice == "l") choice = "low";

        if (betAmount < minBet || betAmount > maxBet)
        {
            LogWarning("Highlow Bet Out of Range", $"**User:** {user}\n**Bet:** ${betAmount}\n**Range:** {minBet}-{maxBet}");
            CPH.SendMessage($"{user}, bet must be between {minBet} and {maxBet} {currencyName}!");
            return false;
        }

        // Check balance
        int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

        if (balance < betAmount)
        {
            LogWarning("Highlow Insufficient Balance", $"**User:** {user}\n**Required:** ${betAmount}\n**Balance:** ${balance}");
            CPH.SendMessage($"{user}, you need ${betAmount} {currencyName}! You have ${balance}.");
            return false;
        }

        // Deduct bet
        balance -= betAmount;
        CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

        // Draw cards
        Random random = new Random();
        int card1 = random.Next(1, 14); // 1-13
        int card2 = random.Next(1, 14);

        bool won = false;
        if (choice == "high" && card2 > card1) won = true;
        if (choice == "low" && card2 < card1) won = true;
        if (card1 == card2) won = false; // Tie = lose

        if (won)
        {
            int winnings = betAmount * winMult;
            balance += winnings;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);
            LogSuccess("Highlow Win", $"**User:** {user}\n**Cards:** {card1} → {card2}\n**Choice:** {choice}\n**Bet:** ${betAmount}\n**Winnings:** ${winnings}\n**New Balance:** ${balance}");
            CPH.SendMessage($"🎴 {card1} → {card2} | {user} guessed {choice} and WON ${winnings} {currencyName}! Balance: ${balance}");
        }
        else
        {
            LogWarning("Highlow Loss", $"**User:** {user}\n**Cards:** {card1} → {card2}\n**Choice:** {choice}\n**Lost:** ${betAmount}\n**New Balance:** ${balance}");
            CPH.SendMessage($"🎴 {card1} → {card2} | {user} guessed {choice} and LOST ${betAmount} {currencyName}. Balance: ${balance}");
        }

        // Set cooldown timestamp
        CPH.SetTwitchUserVarById(userId, "highlow_last_played", DateTime.UtcNow.ToString("o"), true);

        return true;
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
