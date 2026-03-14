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
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_rob_cooldown_minutes", true);
            int successRate = CPH.GetGlobalVar<int>("config_rob_success_rate", true);
            int minPercent = CPH.GetGlobalVar<int>("config_rob_min_percent", true);
            int maxPercent = CPH.GetGlobalVar<int>("config_rob_max_percent", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Rob command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Rob command: Missing 'userId' argument");
                return false;
            }

            // Get target user
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
                LogCommand("!rob", user, "No target specified");
                CPH.SendMessage($"{user}, who are you trying to rob? Usage: !rob @username");
                return false;
            }

            // Log command execution with target
            LogCommand("!rob", user, $"Target: {targetUser}");

            // Remove @ symbol
            targetUser = targetUser.Replace("@", "").Trim().ToLower();

            // Get target user info
            var targetUserInfo = CPH.TwitchGetExtendedUserInfoByLogin(targetUser);
            if (targetUserInfo == null)
            {
                LogWarning("Rob Invalid Target", $"User: {user} | Target not found: {targetUser}");
                CPH.SendMessage($"{user}, could not find user: {targetUser}");
                return false;
            }

            string targetUserId = targetUserInfo.UserId;

            // Can't rob yourself
            if (userId == targetUserId)
            {
                LogWarning("Rob Self-Target", $"User: {user} | Tried to rob themselves");
                CPH.SendMessage($"{user}, you can't rob yourself!");
                return false;
            }

            // Check cooldown
            string lastRobStr = CPH.GetTwitchUserVarById<string>(userId, "rob_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastRob = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastRobStr))
            {
                try
                {
                    lastRob = DateTime.Parse(lastRobStr).ToUniversalTime();
                }
                catch (Exception ex)
                {
                    lastRob = DateTime.MinValue;
                    LogError("Rob Command Parse Error", $"User: {user} | Error parsing cooldown: {ex.Message}");
                }
            }

            TimeSpan timeSinceRob = now - lastRob;
            double minutesRequired = cooldownMinutes;

            if (timeSinceRob.TotalMinutes < minutesRequired)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(minutesRequired) - timeSinceRob;
                int minutesLeft = (int)remaining.TotalMinutes;

                LogWarning("Rob Cooldown Active", $"User: {user} | Time remaining: {minutesLeft} minutes");
                CPH.SendMessage($"{user}, you need to lay low! Try again in {minutesLeft} minutes.");
                return false;
            }

            // Check robber's balance (need money for potential fine)
            int robberBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (robberBalance < 50)
            {
                LogWarning("Rob Insufficient Balance", $"User: {user} | Needs at least 50 | Has: ${robberBalance}");
                CPH.SendMessage($"{user}, you need at least 50 {currencyName} to attempt a robbery!");
                return false;
            }

            // Check target's balance
            int targetBalance = CPH.GetTwitchUserVarById<int>(targetUserId, currencyKey, true);

            if (targetBalance < 10)
            {
                LogWarning("Rob Target Too Poor", $"User: {user} | Target: {targetUser} | Target balance: ${targetBalance}");
                CPH.SendMessage($"{user}, {targetUser} is too poor to rob!");
                return false;
            }

            // Update cooldown
            CPH.SetTwitchUserVarById(userId, "rob_cooldown", now.ToString("o"), true);

            // Attempt robbery
            Random random = new Random();
            int roll = random.Next(1, 101);
            bool success = roll <= successRate;

            if (success)
            {
                // Success! Steal coins
                int stealPercent = random.Next(minPercent, maxPercent + 1);
                int stolenAmount = (int)(targetBalance * stealPercent / 100.0);

                if (stolenAmount < 1) stolenAmount = 1;

                // Transfer coins
                targetBalance -= stolenAmount;
                robberBalance += stolenAmount;

                CPH.SetTwitchUserVarById(targetUserId, currencyKey, targetBalance, true);
                CPH.SetTwitchUserVarById(userId, currencyKey, robberBalance, true);

                LogSuccess("Rob Success", $"User: {user} | Target: {targetUser} | Stolen: ${stolenAmount} | Percent: {stealPercent}% | Robber balance: ${robberBalance} | Target balance: ${targetBalance}");
                CPH.SendMessage($"{user} successfully robbed ${stolenAmount} {currencyName} from {targetUser}! Balance: ${robberBalance}");
            }
            else
            {
                // Failed! Pay fine
                robberBalance -= 50;
                CPH.SetTwitchUserVarById(userId, currencyKey, robberBalance, true);

                LogInfo("Rob Failed", $"User: {user} | Target: {targetUser} | Fine: $50 | Balance: ${robberBalance}");
                CPH.SendMessage($"{user} got caught trying to rob {targetUser} and paid a $50 {currencyName} fine! Balance: ${robberBalance}");
            }

            return true;
        }
        catch (Exception ex)
        {
            LogError("Rob Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"Rob error: {ex.Message}");
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
