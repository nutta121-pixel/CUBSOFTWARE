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
            int minReward = CPH.GetGlobalVar<int>("config_crime_min_reward", true);
            int maxReward = CPH.GetGlobalVar<int>("config_crime_max_reward", true);
            int successRate = CPH.GetGlobalVar<int>("config_crime_success_rate", true);
            int failPenalty = CPH.GetGlobalVar<int>("config_crime_fail_penalty", true);
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_crime_cooldown_minutes", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Crime command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Crime command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!crime", user);

            // Check cooldown
            string lastCrimeStr = CPH.GetTwitchUserVarById<string>(userId, "crime_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastCrime = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastCrimeStr))
            {
                try { lastCrime = DateTime.Parse(lastCrimeStr).ToUniversalTime(); }
                catch { lastCrime = DateTime.MinValue; }
            }

            TimeSpan timeSinceCrime = now - lastCrime;

            if (timeSinceCrime.TotalMinutes < cooldownMinutes)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(cooldownMinutes) - timeSinceCrime;
                int minutesLeft = (int)remaining.TotalMinutes;

                // Log cooldown warning
                LogWarning("Crime Cooldown Active",
                    $"**User:** {user}\n**Time Left:** {minutesLeft} minutes");

                CPH.SendMessage($"{user}, lay low! Try again in {minutesLeft} minutes.");
                return false;
            }

            // Crime types
            string[] crimes = {
                "robbed a convenience store",
                "hacked an ATM",
                "pickpocketed a tourist",
                "scammed a viewer",
                "sold fake merch",
                "stole a car",
                "counterfeited channel points",
                "ran a Ponzi scheme"
            };

            Random random = new Random();
            string crime = crimes[random.Next(crimes.Length)];

            // Attempt crime
            int roll = random.Next(1, 101);
            bool success = roll <= 50; // Default 50% success chance

            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (success)
            {
                int reward = random.Next(100, 401); // 100-400
                balance += reward;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                // Log success
                LogSuccess("Crime Successful",
                    $"**User:** {user}\n**Crime:** {crime}\n**Reward:** ${reward}\n**New Balance:** ${balance}");

                CPH.SendMessage($"😈 {user} {crime} and earned ${reward} {currencyName}! Balance: ${balance}");
            }
            else
            {
                int fine = random.Next(50, 201); // 50-200
                balance -= fine;
                if (balance < 0) balance = 0;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                // Log failure
                LogWarning("Crime Failed - Caught",
                    $"**User:** {user}\n**Crime:** {crime}\n**Fine:** ${fine}\n**New Balance:** ${balance}");

                CPH.SendMessage($"🚔 {user} tried to {crime.Replace("ed", "").Replace("d", "")} but got caught! Paid ${fine} {currencyName} fine. Balance: ${balance}");
            }

            // Update cooldown
            CPH.SetTwitchUserVarById(userId, "crime_cooldown", now.ToString("o"), true);

            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Crime Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during crime attempt");
            CPH.LogError($"Crime error: {ex.Message}");
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
