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
            // To change settings: edit Global Variables in StreamerBot OR run ConfigSetup.cs
            string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
            string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);
            int dailyReward = CPH.GetGlobalVar<int>("config_daily_reward", true);
            int cooldownHours = CPH.GetGlobalVar<int>("config_daily_cooldown_hours", true);

            string successMessage = "{user} claimed their daily ${coins} {currency}! (Day {count}) Balance: ${total} {currency}";
            string alreadyClaimedMessage = "{user}, you already claimed your daily {currency}! Come back in {hours}h {minutes}m.";

            // Get the user who ran the command
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Daily command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Daily command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!daily", user);

            // Get the last claim time from user variables
            string lastClaimStr = CPH.GetTwitchUserVarById<string>(userId, "daily_lastclaim", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastClaim = DateTime.MinValue;

            // Check if user has claimed before
            if (!string.IsNullOrEmpty(lastClaimStr))
            {
                try
                {
                    lastClaim = DateTime.Parse(lastClaimStr).ToUniversalTime();
                }
                catch
                {
                    // If parsing fails, treat as never claimed
                    lastClaim = DateTime.MinValue;
                }
            }

            // Calculate time difference
            TimeSpan timeSinceLastClaim = now - lastClaim;

            // Check if enough time has passed
            if (timeSinceLastClaim.TotalHours < cooldownHours)
            {
                // Calculate remaining time
                TimeSpan remaining = TimeSpan.FromHours(cooldownHours) - timeSinceLastClaim;
                int hoursLeft = (int)remaining.TotalHours;
                int minutesLeft = remaining.Minutes;

                // Log cooldown warning
                LogWarning("Daily Cooldown Active",
                    $"**User:** {user}\n**Time Remaining:** {hoursLeft}h {minutesLeft}m");

                // Send cooldown message
                string message = alreadyClaimedMessage
                    .Replace("{user}", user)
                    .Replace("{hours}", hoursLeft.ToString())
                    .Replace("{minutes}", minutesLeft.ToString())
                    .Replace("{currency}", currencyName);

                CPH.SendMessage(message);
                return false;
            }

            // User is eligible - award Cub Coins
            int currentBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            int newBalance = currentBalance + dailyReward;
            CPH.SetTwitchUserVarById(userId, currencyKey, newBalance, true);

            // Track claim count
            int claimCount = CPH.GetTwitchUserVarById<int>(userId, "daily_claimcount", true);
            claimCount++;
            CPH.SetTwitchUserVarById(userId, "daily_claimcount", claimCount, true);

            // Update last claim time
            CPH.SetTwitchUserVarById(userId, "daily_lastclaim", now.ToString("o"), true);

            // Log successful claim
            LogSuccess("Daily Claimed Successfully",
                $"**User:** {user}\n**Reward:** {dailyReward} {currencyName}\n**New Balance:** {newBalance} {currencyName}\n**Claim Count:** {claimCount}");

            // Send success message
            string successMsg = successMessage
                .Replace("{user}", user)
                .Replace("{coins}", dailyReward.ToString())
                .Replace("{total}", newBalance.ToString())
                .Replace("{count}", claimCount.ToString())
                .Replace("{currency}", currencyName);

            CPH.SendMessage(successMsg);

            return true;
        }
        catch (Exception ex)
        {
            // Log error to Discord
            CPH.TryGetArg("user", out string user);
            string userLog = string.IsNullOrEmpty(user) ? "Unknown" : user;
            LogError("Daily Command Error",
                $"**User:** {userLog}\n**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.LogError($"Daily command error for {userLog}: {ex.Message}");
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
