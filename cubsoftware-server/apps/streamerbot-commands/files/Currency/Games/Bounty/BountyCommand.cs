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
            int minReward = CPH.GetGlobalVar<int>("config_bounty_min_reward", true);
            int maxReward = CPH.GetGlobalVar<int>("config_bounty_max_reward", true);
            int successRate = CPH.GetGlobalVar<int>("config_bounty_success_rate", true);
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_bounty_cooldown_minutes", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Bounty command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Bounty command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!bounty", user);

            string lastBountyStr = CPH.GetTwitchUserVarById<string>(userId, "bounty_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastBounty = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastBountyStr))
            {
                try { lastBounty = DateTime.Parse(lastBountyStr).ToUniversalTime(); }
                catch { lastBounty = DateTime.MinValue; }
            }

            TimeSpan timeSinceBounty = now - lastBounty;

            if (timeSinceBounty.TotalMinutes < cooldownMinutes)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(cooldownMinutes) - timeSinceBounty;
                int minutesLeft = (int)remaining.TotalMinutes;

                // Log cooldown warning
                LogWarning("Bounty Cooldown Active",
                    $"**User:** {user}\n**Time Left:** {minutesLeft} minutes");

                CPH.SendMessage($"{user}, next bounty in {minutesLeft} minutes!");
                return false;
            }

            string[] targets = { "Bandit", "Outlaw", "Thief", "Rogue", "Criminal" };
            Random random = new Random();

            string target = targets[random.Next(targets.Length)];
            int reward = random.Next(minReward, maxReward + 1);

            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            balance += reward;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);
            CPH.SetTwitchUserVarById(userId, "bounty_cooldown", now.ToString("o"), true);

            // Log success
            LogSuccess("Bounty Captured",
                $"**User:** {user}\n**Target:** {target}\n**Reward:** ${reward}\n**New Balance:** ${balance}");

            CPH.SendMessage($"🎯 {user} captured a {target} for ${reward} {currencyName}! Balance: ${balance}");
            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Bounty Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during bounty hunt");
            CPH.LogError($"Bounty error: {ex.Message}");
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
