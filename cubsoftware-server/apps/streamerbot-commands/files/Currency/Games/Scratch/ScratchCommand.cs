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
    private const int CARD_COST = 100;

    public bool Execute()
    {
        // Load configuration from global variables
        string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
        string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);
        int minBet = CPH.GetGlobalVar<int>("config_scratch_min_bet", true);
        int maxBet = CPH.GetGlobalVar<int>("config_scratch_max_bet", true);
        int maxMult = CPH.GetGlobalVar<int>("config_scratch_max_mult", true);

        // Get required arguments with error handling
        if (!CPH.TryGetArg("user", out string user))
        {
            CPH.LogError("Scratch command: Missing 'user' argument");
            return false;
        }

        if (!CPH.TryGetArg("userId", out string userId))
        {
            CPH.LogError("Scratch command: Missing 'userId' argument");
            return false;
        }

        // Cooldown check
        int cooldownSeconds = CPH.GetGlobalVar<int>("config_scratch_cooldown_seconds", true);
        if (cooldownSeconds == 0) cooldownSeconds = 20;

        string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "scratch_last_played", true);
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

                CPH.SendMessage($"{user}, scratch cooldown! Wait {timeLeft} before playing again.");
                LogWarning("Scratch Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                return false;
            }
        }

        // Log command execution
        LogCommand("!scratch", user);

        // Check balance
        int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

        if (balance < CARD_COST)
        {
            LogWarning("Scratch Insufficient Funds", $"User: {user} | Card Cost: ${CARD_COST} | Balance: ${balance}");
            CPH.SendMessage($"{user}, scratch cards cost ${CARD_COST} {currencyName}! You have ${balance}.");
            return false;
        }

        // Buy card
        balance -= CARD_COST;
        CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

        // Set cooldown timestamp
        CPH.SetTwitchUserVarById(userId, "scratch_last_played", DateTime.UtcNow.ToString("o"), true);

        // Scratch 3 symbols
        string[] symbols = { "🍒", "⭐", "💎", "7️⃣", "🍋", "🔔" };
        Random random = new Random();

        string s1 = symbols[random.Next(symbols.Length)];
        string s2 = symbols[random.Next(symbols.Length)];
        string s3 = symbols[random.Next(symbols.Length)];

        int winnings = 0;

        if (s1 == s2 && s2 == s3)
        {
            // All 3 match
            if (s1 == "💎") winnings = 500;
            else if (s1 == "7️⃣") winnings = 400;
            else if (s1 == "⭐") winnings = 300;
            else winnings = 200;
        }
        else if (s1 == s2 || s2 == s3 || s1 == s3)
        {
            // 2 match
            winnings = 75;
        }

        if (winnings > 0)
        {
            balance += winnings;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);
            LogSuccess("Scratch Card Win", $"User: {user} | Symbols: {s1} {s2} {s3} | Winnings: ${winnings} {currencyName} | Balance: ${balance}");
            CPH.SendMessage($"🎟️ [ {s1} {s2} {s3} ] {user} WON ${winnings} {currencyName}! Balance: ${balance}");
        }
        else
        {
            LogInfo("Scratch Card Loss", $"User: {user} | Symbols: {s1} {s2} {s3} | Balance: ${balance}");
            CPH.SendMessage($"🎟️ [ {s1} {s2} {s3} ] {user} didn't win. Balance: ${balance}");
        }

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
