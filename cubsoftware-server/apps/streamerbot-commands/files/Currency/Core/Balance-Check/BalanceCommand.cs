// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: ConfigSetup.cs

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

            // Get the user who ran the command
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Balance command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Balance command: Missing 'userId' argument");
                return false;
            }

            // Check if checking another user's balance
            string targetUser = "";
            string targetUserId = userId;
            string targetDisplayName = user;

            // Try to get target user from arguments
            if (CPH.TryGetArg("targetUser", out string tempTargetUser) && !string.IsNullOrEmpty(tempTargetUser))
            {
                targetUser = tempTargetUser;
            }
            else if (CPH.TryGetArg("input0", out string input0) && !string.IsNullOrEmpty(input0))
            {
                targetUser = input0;
            }

            // If target user specified, look them up
            if (!string.IsNullOrEmpty(targetUser))
            {
                // Remove @ symbol if present
                targetUser = targetUser.Replace("@", "").Trim().ToLower();

                // Get target user info
                var targetUserInfo = CPH.TwitchGetExtendedUserInfoByLogin(targetUser);
                if (targetUserInfo == null)
                {
                    CPH.SendMessage($"{user}, could not find user: {targetUser}");
                    LogWarning("!balance - User Not Found", $"**User:** {user}\n**Searched for:** {targetUser}");
                    return false;
                }

                targetUserId = targetUserInfo.UserId;
                targetDisplayName = targetUserInfo.UserLogin;
            }

            // Get balance from user variables
            int balance = CPH.GetTwitchUserVarById<int>(targetUserId, currencyKey, true);

            // Send balance message
            if (targetUserId == userId)
            {
                // Checking own balance
                CPH.SendMessage($"{user} has ${balance} {currencyName}.");
                LogCommand("!balance", user, $"Balance: ${balance}");
            }
            else
            {
                // Checking another user's balance
                CPH.SendMessage($"{targetDisplayName} has ${balance} {currencyName}.");
                LogCommand("!balance", user, $"Checked {targetDisplayName}'s balance: ${balance}");
            }

            return true;
        }
        catch (Exception ex)
        {
            LogError("Balance Command Error", $"Error: {ex.Message}");
            CPH.LogError($"Balance command error: {ex.Message}");
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
