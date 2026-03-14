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
            int minBeg = CPH.GetGlobalVar<int>("config_beg_min", true);
            int maxBeg = CPH.GetGlobalVar<int>("config_beg_max", true);
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_beg_cooldown_minutes", true);

            // Get required args
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Beg command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Beg command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!beg", user);

            // Check cooldown
            string lastBegStr = CPH.GetTwitchUserVarById<string>(userId, "beg_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastBeg = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastBegStr))
            {
                try { lastBeg = DateTime.Parse(lastBegStr).ToUniversalTime(); }
                catch { lastBeg = DateTime.MinValue; }
            }

            TimeSpan timeSinceBeg = now - lastBeg;

            if (timeSinceBeg.TotalMinutes < cooldownMinutes)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(cooldownMinutes) - timeSinceBeg;
                int minutesLeft = (int)remaining.TotalMinutes;
                int secondsLeft = remaining.Seconds;

                // Log cooldown warning
                LogWarning("Beg Cooldown Active",
                    $"**User:** {user}\n**Time Left:** {minutesLeft}m {secondsLeft}s");

                CPH.SendMessage($"{user}, stop begging! Wait {minutesLeft}m {secondsLeft}s.");
                return false;
            }

            // Beg responses
            string[] responses = {
                "The streamer felt generous",
                "A mod took pity on you",
                "A viewer donated to you",
                "You found coins on the ground",
                "Someone accidentally tipped you",
                "A kind soul helped you out",
                "The chat felt bad for you"
            };

            Random random = new Random();
            int roll = random.Next(1, 101);

            if (roll <= 20)
            {
                // Failed beg
                LogWarning("Beg Failed",
                    $"**User:** {user}\n**Result:** Ignored by everyone");

                CPH.SendMessage($"{user} begged but everyone ignored you. Try again later!");
                CPH.SetTwitchUserVarById(userId, "beg_cooldown", now.ToString("o"), true);
                return true;
            }

            string response = responses[random.Next(responses.Length)];
            int earned = random.Next(minBeg, maxBeg + 1);

            // Add coins
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            balance += earned;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

            // Update cooldown
            CPH.SetTwitchUserVarById(userId, "beg_cooldown", now.ToString("o"), true);

            // Log success
            LogSuccess("Beg Successful",
                $"**User:** {user}\n**Earned:** ${earned}\n**New Balance:** ${balance}");

            CPH.SendMessage($"🤲 {response}! {user} received ${earned} {currencyName}. Balance: ${balance}");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Beg Command Error", $"Error: {ex.Message}");
            CPH.LogError($"Beg command error: {ex.Message}");
            CPH.SendMessage("An error occurred while processing the beg command. Please try again later.");
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
