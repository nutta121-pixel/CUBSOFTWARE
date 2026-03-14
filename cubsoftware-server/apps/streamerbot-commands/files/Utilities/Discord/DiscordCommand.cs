// ===== DISCORD INVITE COMMAND =====
// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: ConfigSetup.cs (for Discord server link global variable)
//
// Displays Discord server invite link
// Usage: !discord
// Configure your Discord invite link in ConfigSetup.cs

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
                CPH.LogError("DiscordCommand: Missing 'user' argument");
                return false;
            }

            // Log command execution
            LogCommand("!discord", user);

            // Get Discord server link from global variable (configured in ConfigSetup.cs)
            string discordLink = CPH.GetGlobalVar<string>("discordServerLink", true);

            // Fallback to default if not set
            if (string.IsNullOrEmpty(discordLink))
            {
                discordLink = "https://discord.gg/ngQXHUbnKg";
                LogWarning("Discord Link Not Configured", "Using fallback link. Please run ConfigSetup.cs");
            }

            CPH.SendMessage($"💬 Join our Discord community, {user}! → {discordLink}");

            LogSuccess("Discord Link Shared", $"**User:** {user}\n**Link:** {discordLink}");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Discord Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");
            CPH.SendMessage("⚠️ Discord command error occurred");
            CPH.LogError($"Discord command error: {ex.Message}");
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
