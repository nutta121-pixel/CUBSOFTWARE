// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: ConfigSetup.cs

using System;
using System.Collections.Generic;
using System.Text;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Get user info for logging
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Leaderboard command: Missing 'user' argument");
                return false;
            }

            // Log command execution
            LogCommand("!leaderboard", user);

            // Load configuration from global variables
            string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
            string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);
            int topCount = CPH.GetGlobalVar<int>("config_leaderboard_top_count", true);

            // Get all users' currency balances using Twitch user variables
            var allBalances = CPH.GetTwitchUsersVar<int>(currencyKey, true);

            if (allBalances == null || allBalances.Count == 0)
            {
                CPH.SendMessage($"No one has any {currencyName} yet!");
                return true;
            }

            // Filter out zero balances and sort by value descending
            var leaderboard = new List<UserVariableValue<int>>();

            foreach (var entry in allBalances)
            {
                if (entry.Value > 0)
                {
                    leaderboard.Add(entry);
                }
            }

            // Sort by balance descending
            leaderboard.Sort((a, b) => b.Value.CompareTo(a.Value));

            // Take only top N
            if (leaderboard.Count > topCount)
            {
                leaderboard.RemoveRange(topCount, leaderboard.Count - topCount);
            }

            if (leaderboard.Count == 0)
            {
                CPH.SendMessage($"No one has any {currencyName} yet!");
                return true;
            }

            // Build leaderboard message
            string message = $"Top {leaderboard.Count} {currencyName} holders: ";

            for (int i = 0; i < leaderboard.Count; i++)
            {
                var entry = leaderboard[i];
                message += $"{i + 1}. {entry.UserLogin} (${entry.Value}) ";
            }

            CPH.SendMessage(message.TrimEnd());

            return true;
        }
        catch (Exception ex)
        {
            CPH.TryGetArg("user", out string user);
            string userLog = string.IsNullOrEmpty(user) ? "Unknown" : user;
            LogError("Leaderboard Command Error", $"User: {userLog} | Error: {ex.Message}");
            CPH.LogError($"Leaderboard command error: {ex.Message}");
            CPH.SendMessage("An error occurred while fetching the leaderboard. Please try again later.");
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
