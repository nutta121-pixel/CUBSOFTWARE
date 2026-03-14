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
        try
        {
            // Load configuration from global variables
            string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
            string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);
            int minBet = CPH.GetGlobalVar<int>("config_coinflip_min_bet", true);
            int maxBet = CPH.GetGlobalVar<int>("config_coinflip_max_bet", true);
            int winMult = CPH.GetGlobalVar<int>("config_coinflip_win_mult", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Coinflip command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Coinflip command: Missing 'userId' argument");
                return false;
            }

            // Cooldown check
            int cooldownSeconds = CPH.GetGlobalVar<int>("config_coinflip_cooldown_seconds", true);
            if (cooldownSeconds == 0) cooldownSeconds = 20;

            string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "coinflip_last_played", true);
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

                    CPH.SendMessage($"{user}, coinflip cooldown! Wait {timeLeft} before playing again.");
                    LogWarning("Coinflip Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                    return false;
                }
            }

            // Get choice (heads or tails)
            string choice = "";
            if (CPH.TryGetArg("input0", out string input0) && !string.IsNullOrEmpty(input0))
            {
                choice = input0.ToLower();
            }

            // Get bet amount
            int betAmount = 0;
            if (CPH.TryGetArg("input1", out string input1) && !string.IsNullOrEmpty(input1))
            {
                if (!int.TryParse(input1, out betAmount))
                {
                    CPH.SendMessage($"{user}, invalid bet amount! Usage: !coinflip heads/tails {minBet}-{maxBet}");
                    return false;
                }
            }
            else
            {
                CPH.SendMessage($"{user}, specify your bet! Usage: !coinflip heads/tails {minBet}-{maxBet}");
                return false;
            }

            // Validate choice
            if (choice != "heads" && choice != "tails" && choice != "h" && choice != "t")
            {
                CPH.SendMessage($"{user}, choose heads or tails! Usage: !coinflip heads/tails {minBet}-{maxBet}");
                return false;
            }

            // Normalize choice
            if (choice == "h") choice = "heads";
            if (choice == "t") choice = "tails";

            // Validate bet
            if (betAmount < minBet || betAmount > maxBet)
            {
                CPH.SendMessage($"{user}, bet must be between {minBet} and {maxBet} {currencyName}!");
                return false;
            }

            // Log command execution
            LogCommand("!coinflip", user, $"Choice: {choice} | Bet: ${betAmount}");

            // Check balance
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (balance < betAmount)
            {
                // Log insufficient funds
                LogWarning("Coinflip Insufficient Funds",
                    $"**User:** {user}\n**Bet:** ${betAmount}\n**Balance:** ${balance}");

                CPH.SendMessage($"{user}, you only have ${balance} {currencyName}! You need ${betAmount}.");
                return false;
            }

            // Deduct bet
            balance -= betAmount;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

            // Flip the coin
            Random random = new Random();
            string result = random.Next(0, 2) == 0 ? "heads" : "tails";
            string coinEmoji = result == "heads" ? "🪙" : "🪙";

            if (choice == result)
            {
                // Won!
                int winnings = betAmount * winMult;
                balance += winnings;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                // Log win
                LogSuccess("Coinflip Win",
                    $"**User:** {user}\n**Choice:** {choice}\n**Result:** {result}\n**Bet:** ${betAmount}\n**Winnings:** ${winnings}\n**New Balance:** ${balance}");

                CPH.SendMessage($"{coinEmoji} {result.ToUpper()}! {user} WON ${winnings} {currencyName}! Balance: ${balance}");
            }
            else
            {
                // Lost
                LogWarning("Coinflip Loss",
                    $"**User:** {user}\n**Choice:** {choice}\n**Result:** {result}\n**Bet:** ${betAmount}\n**Loss:** ${betAmount}\n**New Balance:** ${balance}");

                CPH.SendMessage($"{coinEmoji} {result.ToUpper()}! {user} LOST ${betAmount} {currencyName}. Balance: ${balance}");
            }

            // Set cooldown timestamp
            CPH.SetTwitchUserVarById(userId, "coinflip_last_played", DateTime.UtcNow.ToString("o"), true);

            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Coinflip Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during coinflip");
            CPH.LogError($"Coinflip error: {ex.Message}");
            return false;
        }
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
