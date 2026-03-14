// ===== WELCOME FIRST-TIME CHATTER (PER DAY) =====
// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: None
//
// Automatically welcomes first-time chatters to your stream ONCE PER DAY
// Resets at midnight UTC - so users get welcomed again each new day/stream
// Triggers on any chat message

using System;
using System.Net;
using System.Text;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("WelcomeFirstTimer: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("WelcomeFirstTimer: Missing 'userId' argument");
                return false;
            }

            // Get today's date (used for once-per-day checking)
            string today = DateTime.UtcNow.ToString("yyyy-MM-dd");

            // Check when user was last welcomed (stored in Twitch USER variable)
            string lastWelcomeDate = CPH.GetTwitchUserVarById<string>(userId, "last_welcome_date", true);

            // If user was already welcomed today, skip
            if (!string.IsNullOrEmpty(lastWelcomeDate) && lastWelcomeDate == today)
            {
                // User has already been welcomed today, do nothing
                return false;
            }

            // Mark user as welcomed for today (stored in Twitch USER variable)
            CPH.SetTwitchUserVarById(userId, "last_welcome_date", today, true);

            // Check user roles for personalized welcome
            CPH.TryGetArg("isSubscriber", out bool isSubscriber);
            CPH.TryGetArg("isModerator", out bool isModerator);
            CPH.TryGetArg("isVip", out bool isVip);

            // Send role-based welcome message
            if (isModerator)
            {
                CPH.SendMessage($"👋 Welcome, Mod {user}! 🛡️");
            }
            else if (isSubscriber)
            {
                CPH.SendMessage($"👋 Welcome, subscriber {user}! Thanks for the support! 💜");
            }
            else if (isVip)
            {
                CPH.SendMessage($"👋 Welcome, VIP {user}! ⭐");
            }
            else
            {
                CPH.SendMessage($"👋 Welcome to the stream, {user}! 💜");
            }

            // Track total first-time chatters for today (global counter - NON-PERSISTENT)
            string todayCountKey = $"first_timers_{today}";
            int todayCount = CPH.GetGlobalVar<int>(todayCountKey, false); // Non-persistent
            todayCount++;
            CPH.SetGlobalVar(todayCountKey, todayCount, false); // Non-persistent

            // Clean up yesterday's counter (auto-delete old data)
            DateTime yesterday = DateTime.UtcNow.AddDays(-1);
            string yesterdayCountKey = $"first_timers_{yesterday.ToString("yyyy-MM-dd")}";
            CPH.UnsetGlobalVar(yesterdayCountKey, false);

            LogSuccess("First Timer Welcomed",
                $"**User:** {user}\n" +
                $"**Date:** {today}\n" +
                $"**Daily Count:** {todayCount}");

            // Log the new chatter
            CPH.LogInfo($"New chatter welcomed: {user} ({userId}) on {today}");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Welcome First Timer Exception",
                $"**Error:** {ex.Message}\n" +
                $"**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"WelcomeFirstTimer error: {ex.Message}");
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

