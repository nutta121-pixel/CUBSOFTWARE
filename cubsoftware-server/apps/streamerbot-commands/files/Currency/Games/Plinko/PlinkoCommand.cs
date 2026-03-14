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
        int minBet = CPH.GetGlobalVar<int>("config_plinko_min_bet", true);
        int maxBet = CPH.GetGlobalVar<int>("config_plinko_max_bet", true);
        int maxMult = CPH.GetGlobalVar<int>("config_plinko_max_mult", true);

        if (!CPH.TryGetArg("user", out string user))
        {
            CPH.LogError("Plinko command: Missing 'user' argument");
            return false;
        }

        if (!CPH.TryGetArg("userId", out string userId))
        {
            CPH.LogError("Plinko command: Missing 'userId' argument");
            return false;
        }

        // Cooldown check
        int cooldownSeconds = CPH.GetGlobalVar<int>("config_plinko_cooldown_seconds", true);
        if (cooldownSeconds == 0) cooldownSeconds = 20;

        string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "plinko_last_played", true);
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

                CPH.SendMessage($"{user}, plinko cooldown! Wait {timeLeft} before playing again.");
                LogWarning("Plinko Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                return false;
            }
        }

        // Log command execution
        LogCommand("!plinko", user);

        int betAmount = 0;
        if (!CPH.TryGetArg("input0", out string input0) || !int.TryParse(input0, out betAmount) || betAmount < minBet || betAmount > maxBet)
        {
            LogWarning("Plinko Invalid Bet", $"User: {user} | Invalid bet amount or usage");
            CPH.SendMessage($"{user}, usage: !plinko {minBet}-{maxBet}");
            return false;
        }

        int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

        if (balance < betAmount)
        {
            LogWarning("Plinko Insufficient Balance", $"User: {user} | Needed: ${betAmount} | Has: ${balance}");
            CPH.SendMessage($"{user}, you need ${betAmount} coins!");
            return false;
        }

        balance -= betAmount;

        // Plinko slots with different multipliers
        double[] multipliers = { 0, 0.5, 1, 2, 3, 5, 3, 2, 1, 0.5, 0 };
        Random random = new Random();

        // Simulate ball dropping (bell curve distribution)
        int position = 5; // Start in middle
        for (int i = 0; i < 8; i++)
        {
            position += random.Next(0, 2) == 0 ? -1 : 1;
            if (position < 0) position = 0;
            if (position >= multipliers.Length) position = multipliers.Length - 1;
        }

        double multiplier = multipliers[position];
        int winnings = (int)(betAmount * multiplier);
        balance += winnings;
        CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

        // Set cooldown timestamp
        CPH.SetTwitchUserVarById(userId, "plinko_last_played", DateTime.UtcNow.ToString("o"), true);

        string result = winnings > betAmount ? "WON" : "LOST";
        int profitLoss = winnings - betAmount;

        if (winnings > betAmount)
        {
            LogSuccess("Plinko Win", $"User: {user} | Slot: {position} | Multiplier: {multiplier}x | Bet: ${betAmount} | Won: ${profitLoss} | Balance: ${balance}");
        }
        else
        {
            LogInfo("Plinko Loss", $"User: {user} | Slot: {position} | Multiplier: {multiplier}x | Bet: ${betAmount} | Lost: ${Math.Abs(profitLoss)} | Balance: ${balance}");
        }

        CPH.SendMessage($"🔻 {user} dropped to slot {position} ({multiplier}x) and {result} ${Math.Abs(profitLoss)} coins! Balance: ${balance}");
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
