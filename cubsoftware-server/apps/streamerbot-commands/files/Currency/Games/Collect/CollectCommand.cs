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
            int minCollect = CPH.GetGlobalVar<int>("config_collect_min", true);
            int maxCollect = CPH.GetGlobalVar<int>("config_collect_max", true);
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_collect_cooldown_minutes", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Collect command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Collect command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!collect", user);

            string lastCollectStr = CPH.GetTwitchUserVarById<string>(userId, "collect_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastCollect = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastCollectStr))
            {
                try { lastCollect = DateTime.Parse(lastCollectStr).ToUniversalTime(); }
                catch { lastCollect = DateTime.MinValue; }
            }

            TimeSpan timeSinceCollect = now - lastCollect;

            if (timeSinceCollect.TotalMinutes < cooldownMinutes)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(cooldownMinutes) - timeSinceCollect;
                int hoursLeft = (int)remaining.TotalHours;
                int minutesLeft = remaining.Minutes % 60;

                // Log cooldown warning
                LogWarning("Collect Cooldown Active",
                    $"**User:** {user}\n**Time Left:** {hoursLeft}h {minutesLeft}m");

                CPH.SendMessage($"{user}, next collection in {hoursLeft}h {minutesLeft}m!");
                return false;
            }

            Random random = new Random();
            int reward = random.Next(minCollect, maxCollect + 1);

            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            balance += reward;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);
            CPH.SetTwitchUserVarById(userId, "collect_cooldown", now.ToString("o"), true);

            // Log success
            LogSuccess("Collection Claimed",
                $"**User:** {user}\n**Reward:** ${reward}\n**New Balance:** ${balance}");

            CPH.SendMessage($"📦 {user} collected ${reward} {currencyName}! Balance: ${balance}");
            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Collect Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during collection");
            CPH.LogError($"Collect error: {ex.Message}");
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
