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
            int minBet = CPH.GetGlobalVar<int>("config_boss_min_bet", true);
            int maxBet = CPH.GetGlobalVar<int>("config_boss_max_bet", true);
            int successRate = CPH.GetGlobalVar<int>("config_boss_success_rate", true);
            int winMult = CPH.GetGlobalVar<int>("config_boss_win_mult", true);
            int cooldownHours = CPH.GetGlobalVar<int>("config_boss_cooldown_hours", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Boss command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Boss command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!boss", user);

            string lastBossStr = CPH.GetTwitchUserVarById<string>(userId, "boss_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastBoss = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastBossStr))
            {
                try { lastBoss = DateTime.Parse(lastBossStr).ToUniversalTime(); }
                catch { lastBoss = DateTime.MinValue; }
            }

            TimeSpan timeSinceBoss = now - lastBoss;

            if (timeSinceBoss.TotalHours < cooldownHours)
            {
                TimeSpan remaining = TimeSpan.FromHours(cooldownHours) - timeSinceBoss;
                int hoursLeft = (int)remaining.TotalHours;
                int minutesLeft = remaining.Minutes;

                // Log cooldown warning
                LogWarning("Boss Cooldown Active",
                    $"**User:** {user}\n**Time Left:** {hoursLeft}h {minutesLeft}m");

                CPH.SendMessage($"{user}, boss respawns in {hoursLeft}h {minutesLeft}m!");
                return false;
            }

            Random random = new Random();
            bool won = random.Next(1, 101) <= 30;

            if (won)
            {
                int reward = random.Next(300, 601);
                int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
                balance += reward;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                // Log success
                LogSuccess("Boss Defeated",
                    $"**User:** {user}\n**Reward:** ${reward}\n**New Balance:** ${balance}");

                CPH.SendMessage($"👑 {user} defeated the BOSS and earned ${reward} {currencyName}! Balance: ${balance}");
            }
            else
            {
                // Log loss
                LogWarning("Boss Fight Lost",
                    $"**User:** {user}\n**Result:** Defeated by boss");

                CPH.SendMessage($"💀 {user} was defeated by the boss! Come back stronger!");
            }

            CPH.SetTwitchUserVarById(userId, "boss_cooldown", now.ToString("o"), true);
            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Boss Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during boss fight");
            CPH.LogError($"Boss error: {ex.Message}");
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
