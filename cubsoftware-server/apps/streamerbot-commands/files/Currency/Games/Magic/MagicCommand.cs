// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)

using System;
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
            int minReward = CPH.GetGlobalVar<int>("config_magic_min_reward", true);
            int maxReward = CPH.GetGlobalVar<int>("config_magic_max_reward", true);
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_magic_cooldown_minutes", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Magic command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Magic command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!magic", user);

            string lastMagicStr = CPH.GetTwitchUserVarById<string>(userId, "magic_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastMagic = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastMagicStr))
            {
                try
                {
                    lastMagic = DateTime.Parse(lastMagicStr).ToUniversalTime();
                }
                catch (Exception ex)
                {
                    lastMagic = DateTime.MinValue;
                    LogError("Magic Command Parse Error", $"User: {user} | Error parsing cooldown: {ex.Message}");
                }
            }

            TimeSpan timeSinceMagic = now - lastMagic;

            if (timeSinceMagic.TotalMinutes < cooldownMinutes)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(cooldownMinutes) - timeSinceMagic;
                int minutesLeft = (int)remaining.TotalMinutes;
                int secondsLeft = remaining.Seconds;
                LogWarning("Magic Cooldown Active", $"User: {user} | Time remaining: {minutesLeft}m {secondsLeft}s");
                CPH.SendMessage($"{user}, mana recharging! Wait {minutesLeft}m {secondsLeft}s.");
                return false;
            }

            string[] spells = { "✨ Transmutation", "🔮 Fortune", "⚡ Lightning", "🌟 Blessing", "💫 Luck", "🪄 Conjuration" };
            Random random = new Random();

            string spell = spells[random.Next(spells.Length)];
            int coins = random.Next(minReward, maxReward + 1);

            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            balance += coins;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);
            CPH.SetTwitchUserVarById(userId, "magic_cooldown", now.ToString("o"), true);

            LogSuccess("Magic Reward Given", $"User: {user} | Spell: {spell} | Earned: ${coins} {currencyName} | Balance: ${balance}");
            CPH.SendMessage($"{spell}! {user} conjured ${coins} {currencyName}! Balance: ${balance}");
            return true;
        }
        catch (Exception ex)
        {
            LogError("Magic Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"Magic error: {ex.Message}");
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

            // Get webhook URL from global variable
            string webhookUrl = CPH.GetGlobalVar<string>("discordLogWebhook", true);

            if (string.IsNullOrEmpty(webhookUrl))
            {
                return; // Silently fail if not configured
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
        catch
        {
            // Silently fail if Discord logging doesn't work
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
