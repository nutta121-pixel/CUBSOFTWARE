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
        int minBet = CPH.GetGlobalVar<int>("config_keno_min_bet", true);
        int maxBet = CPH.GetGlobalVar<int>("config_keno_max_bet", true);
        int maxMult = CPH.GetGlobalVar<int>("config_keno_max_mult", true);

        if (!CPH.TryGetArg("user", out string user))
        {
            CPH.LogError("Keno command: Missing 'user' argument");
            return false;
        }

        if (!CPH.TryGetArg("userId", out string userId))
        {
            CPH.LogError("Keno command: Missing 'userId' argument");
            return false;
        }

        // Cooldown check
        int cooldownSeconds = CPH.GetGlobalVar<int>("config_keno_cooldown_seconds", true);
        if (cooldownSeconds == 0) cooldownSeconds = 20;

        string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "keno_last_played", true);
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

                CPH.SendMessage($"{user}, keno cooldown! Wait {timeLeft} before playing again.");
                LogWarning("Keno Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                return false;
            }
        }

        // Log command execution
        LogCommand("!keno", user);

        int betAmount = 0;
        if (!CPH.TryGetArg("input0", out string input0) || !int.TryParse(input0, out betAmount) || betAmount < minBet || betAmount > maxBet)
        {
            LogWarning("Keno Invalid Bet", $"**User:** {user}\n**Reason:** Invalid bet amount or out of range ({minBet}-{maxBet})");
            CPH.SendMessage($"{user}, usage: !keno {minBet}-{maxBet}");
            return false;
        }

        int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

        if (balance < betAmount)
        {
            LogWarning("Keno Insufficient Balance", $"**User:** {user}\n**Required:** ${betAmount}\n**Balance:** ${balance}");
            CPH.SendMessage($"{user}, you need ${betAmount} coins!");
            return false;
        }

        balance -= betAmount;

        Random random = new Random();
        int matches = random.Next(0, 6); // 0-5 matches

        double multiplier = 0;
        switch (matches)
        {
            case 5: multiplier = 10; break;
            case 4: multiplier = 5; break;
            case 3: multiplier = 2.5; break;
            case 2: multiplier = 1.5; break;
            case 1: multiplier = 0.5; break;
            default: multiplier = 0; break;
        }

        int winnings = (int)(betAmount * multiplier);
        balance += winnings;
        CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

        // Set cooldown timestamp
        CPH.SetTwitchUserVarById(userId, "keno_last_played", DateTime.UtcNow.ToString("o"), true);

        LogSuccess("Keno Result", $"**User:** {user}\n**Matches:** {matches}\n**Multiplier:** {multiplier}x\n**Bet:** ${betAmount}\n**Winnings:** ${winnings}\n**New Balance:** ${balance}");
        CPH.SendMessage($"🎱 {matches} matches ({multiplier}x)! {user} won ${winnings} coins! Balance: ${balance}");
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
