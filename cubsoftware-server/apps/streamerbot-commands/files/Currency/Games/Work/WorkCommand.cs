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
            int minEarn = CPH.GetGlobalVar<int>("config_work_min", true);
            int maxEarn = CPH.GetGlobalVar<int>("config_work_max", true);
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_work_cooldown_minutes", true);

            // Get required arguments with error handling
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Work command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Work command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!work", user);

            // Check cooldown
            string lastWorkStr = CPH.GetTwitchUserVarById<string>(userId, "work_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastWork = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastWorkStr))
            {
                try
                {
                    lastWork = DateTime.Parse(lastWorkStr).ToUniversalTime();
                }
                catch (Exception ex)
                {
                    lastWork = DateTime.MinValue;
                    LogError("Work Command Parse Error", $"User: {user} | Error parsing cooldown: {ex.Message}");
                }
            }

            TimeSpan timeSinceWork = now - lastWork;
            double minutesRequired = cooldownMinutes;

            if (timeSinceWork.TotalMinutes < minutesRequired)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(minutesRequired) - timeSinceWork;
                int minutesLeft = (int)remaining.TotalMinutes;
                int secondsLeft = remaining.Seconds;

                LogWarning("Work Cooldown Active", $"User: {user} | Time remaining: {minutesLeft}m {secondsLeft}s");
                CPH.SendMessage($"{user}, you're tired! Rest for {minutesLeft}m {secondsLeft}s before working again.");
                return false;
            }

            // Random earnings
            Random random = new Random();
            int earned = random.Next(minEarn, maxEarn + 1);

            // Random job messages
            string[] jobs = {
                "worked as a Twitch mod",
                "streamed for 8 hours",
                "farmed channel points",
                "clipped highlights",
                "raided another streamer",
                "donated subs",
                "posted emotes in chat",
                "lurked professionally",
                "organized raids",
                "became a VIP"
            };

            string jobDone = jobs[random.Next(jobs.Length)];

            // Add earnings
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            balance += earned;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

            // Update cooldown
            CPH.SetTwitchUserVarById(userId, "work_cooldown", now.ToString("o"), true);

            LogSuccess("Work Reward Given", $"User: {user} | Job: {jobDone} | Earned: ${earned} {currencyName} | Balance: ${balance}");
            CPH.SendMessage($"{user} {jobDone} and earned ${earned} {currencyName}! Balance: ${balance}");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Work Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"Work error: {ex.Message}");
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
