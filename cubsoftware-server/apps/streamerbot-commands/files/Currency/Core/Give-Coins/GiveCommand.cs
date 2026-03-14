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
            int minTransfer = CPH.GetGlobalVar<int>("config_give_min_amount", true);

            // Get the user who ran the command
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Give command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Give command: Missing 'userId' argument");
                return false;
            }

            // Get target user and amount from command
            string targetUser = "";
            int amount = 0;

            // Try to get target user
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
                CPH.SendMessage($"Usage: !give @username {minTransfer}+");
                return false;
            }

            // Try to get amount
            if (CPH.TryGetArg("input1", out string input1) && !string.IsNullOrEmpty(input1))
            {
                if (!int.TryParse(input1, out amount))
                {
                    CPH.SendMessage($"{user}, please enter a valid number.");
                    return false;
                }
            }
            else
            {
                CPH.SendMessage($"Usage: !give @username {minTransfer}+");
                return false;
            }

            // Validate amount
            if (amount < minTransfer)
            {
                CPH.SendMessage($"{user}, you must give at least {minTransfer} {currencyName}.");
                return false;
            }

            // Remove @ symbol if present
            targetUser = targetUser.Replace("@", "").Trim().ToLower();

            // Get target user info
            var targetUserInfo = CPH.TwitchGetExtendedUserInfoByLogin(targetUser);
            if (targetUserInfo == null)
            {
                CPH.SendMessage($"{user}, could not find user: {targetUser}");
                return false;
            }

            string targetUserId = targetUserInfo.UserId;

            // Prevent self-transfers
            if (userId == targetUserId)
            {
                CPH.SendMessage($"{user}, you cannot give {currencyName} to yourself!");
                LogWarning("!give - Self Transfer Blocked", $"**User:** {user} tried to give to themselves");
                return false;
            }

            // Check if sender has enough
            int senderBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (senderBalance < amount)
            {
                LogWarning("!give - Insufficient Funds", $"**User:** {user}\n**Attempted:** ${amount}\n**Balance:** ${senderBalance}\n**Target:** {targetUser}");
                CPH.SendMessage($"{user}, you only have ${senderBalance} {currencyName}. You need ${amount}.");
                return false;
            }

            // Perform transfer
            int receiverBalance = CPH.GetTwitchUserVarById<int>(targetUserId, currencyKey, true);

            // Deduct from sender
            CPH.SetTwitchUserVarById(userId, currencyKey, senderBalance - amount, true);

            // Add to receiver
            CPH.SetTwitchUserVarById(targetUserId, currencyKey, receiverBalance + amount, true);

            // Log the command execution and success
            LogCommand("!give", user, $"Sent ${amount} to {targetUser}");
            LogSuccess("Transfer Complete", $"**From:** {user} (${senderBalance - amount} remaining)\n**To:** {targetUser} (${receiverBalance + amount} total)\n**Amount:** ${amount} {currencyName}");

            // Send success message
            CPH.SendMessage($"{user} gave ${amount} {currencyName} to {targetUser}!");

            return true;
        }
        catch (Exception ex)
        {
            LogError("!give Command Error", $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");
            CPH.SendMessage("An error occurred while processing your transfer. Please try again.");
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



