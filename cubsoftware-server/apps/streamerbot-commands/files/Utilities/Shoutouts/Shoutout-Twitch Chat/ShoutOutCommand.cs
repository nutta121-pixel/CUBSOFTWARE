// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: None (standalone command)

using System;
using System.Net;
using System.Text;
using Twitch.Common.Models.Api;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Get the target username from the command argument
            string targetUser = "";

            if (CPH.TryGetArg("targetUser", out string tempTargetUser) && !string.IsNullOrEmpty(tempTargetUser))
            {
                targetUser = tempTargetUser;
            }
            else if (CPH.TryGetArg("input0", out string input0) && !string.IsNullOrEmpty(input0))
            {
                targetUser = input0;
            }
            else
            {
                CPH.SendMessage("Usage: !so @username or !shoutout @username");
                return false;
            }

            // Remove @ symbol if present
            targetUser = targetUser.Replace("@", "").Trim().ToLower();

            // Get user who ran the command
            CPH.TryGetArg("user", out string user);
            if (string.IsNullOrEmpty(user)) user = "Unknown";

            // Log command execution
            LogCommand("!shoutout", user, $"Target: {targetUser}");

            // Get extended user info to verify the user exists
            var userInfo = CPH.TwitchGetExtendedUserInfoByLogin(targetUser);

            if (userInfo == null)
            {
                LogWarning("Shoutout - User Not Found", $"**User:** {user}\n**Target:** {targetUser}");
                CPH.SendMessage($"Could not find user: {targetUser}");
                return false;
            }

            // Get the display name (preserves capitalization)
            string displayName = userInfo.UserLogin;

            // Send shoutout message in chat
            CPH.SendMessage($"Take a looksee at {displayName} at https://twitch.tv/{displayName} - They're a good creature!");

            LogSuccess("Shoutout Complete", $"**User:** {user}\n**Target:** {displayName}");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Shoutout Exception",
                $"**Error:** {ex.Message}\n" +
                $"**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"Shoutout error: {ex.Message}");
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



