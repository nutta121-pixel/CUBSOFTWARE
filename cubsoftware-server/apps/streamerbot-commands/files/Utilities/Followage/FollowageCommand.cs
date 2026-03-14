// ===== FOLLOWAGE COMMAND =====
// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: None
//
// Shows how long a user has been following the channel
// Usage: !followage or !followage @username
// Displays follow date and duration

using System;
using System.IO;
using System.Net;
using System.Text;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            CPH.TryGetArg("user", out string user);
            if (string.IsNullOrEmpty(user)) user = "Unknown";

            if (!CPH.TryGetArg("userId", out string userId) || string.IsNullOrEmpty(userId))
            {
                CPH.SendMessage("⚠️ Error: Could not get user ID from command");
                CPH.LogError("FollowageCommand: Missing 'userId' argument");
                return false;
            }

            if (!CPH.TryGetArg("broadcastUserId", out string broadcasterId) || string.IsNullOrEmpty(broadcasterId))
            {
                CPH.SendMessage("⚠️ Error: Could not get broadcaster ID");
                CPH.LogError("FollowageCommand: Missing 'broadcastUserId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!followage", user);

            // Get command arguments - try multiple possible fields
            CPH.TryGetArg("rawInput", out string rawInput);
            CPH.TryGetArg("input0", out string input0);
            if (rawInput == null) rawInput = "";
            if (input0 == null) input0 = "";

            string targetUsername = !string.IsNullOrEmpty(input0) ? input0 : rawInput;

        // Check if checking another user's followage
        string targetUser = user;
        string targetUserId = userId;

        // Parse target user from command arguments
        if (!string.IsNullOrEmpty(targetUsername))
        {
            // Remove @ symbol and trim
            string parsedUser = targetUsername.Replace("@", "").Trim();

            // Check if there's actually a username specified
            if (!string.IsNullOrEmpty(parsedUser) && parsedUser.ToLower() != user.ToLower())
            {
                targetUser = parsedUser;

                // Get target user info
                var userInfo = CPH.TwitchGetExtendedUserInfoByLogin(targetUser);

                if (userInfo == null)
                {
                    CPH.SendMessage($"⚠️ Could not find user: {targetUser}");
                    return false;
                }

                targetUserId = userInfo.UserId;
            }
        }

        // Check if user is trying to check their own followage as the broadcaster
        if (targetUserId == broadcasterId)
        {
            CPH.SendMessage($"{targetUser}, you're the broadcaster! You can't follow yourself. 😄");
            return true;
        }

        // Get follow information using Twitch API
        DateTime? followDate = GetFollowDate(targetUserId, broadcasterId);

        if (!followDate.HasValue)
        {
            // Check if it failed due to missing credentials
            string accessToken = CPH.GetGlobalVar<string>("twitchApiAccessToken");
            if (string.IsNullOrEmpty(accessToken))
            {
                CPH.SendMessage("⚠️ Followage command not configured. Please configure Twitch API in ConfigSetup.cs");
                return false;
            }

            if (targetUser.ToLower() == user.ToLower())
            {
                CPH.SendMessage($"{user}, you are not following the channel yet! Hit that follow button! 💜");
            }
            else
            {
                CPH.SendMessage($"{targetUser} is not following the channel.");
            }
            return true;
        }

        // Calculate follow duration
        DateTime now = DateTime.UtcNow;
        TimeSpan followDuration = now - followDate.Value;

        // Calculate years, months, days
        int years = (int)(followDuration.TotalDays / 365);
        int months = (int)((followDuration.TotalDays % 365) / 30);
        int days = (int)((followDuration.TotalDays % 365) % 30);
        int hours = followDuration.Hours;

        // Build duration string
        string durationText = "";

        if (years > 0)
            durationText += $"{years} year{(years != 1 ? "s" : "")} ";
        if (months > 0)
            durationText += $"{months} month{(months != 1 ? "s" : "")} ";
        if (days > 0)
            durationText += $"{days} day{(days != 1 ? "s" : "")} ";
        if (years == 0 && months == 0 && hours > 0)
            durationText += $"{hours} hour{(hours != 1 ? "s" : "")} ";

        durationText = durationText.Trim();

        if (string.IsNullOrEmpty(durationText))
        {
            durationText = "less than an hour";
        }

        // Send message
        if (targetUser.ToLower() == user.ToLower())
        {
            CPH.SendMessage($"{user}, you have been following for {durationText}! 💜");
        }
        else
        {
            CPH.SendMessage($"{targetUser} has been following for {durationText}!");
        }

            return true;
        }
        catch (Exception ex)
        {
            CPH.SendMessage($"⚠️ Followage command error: {ex.Message}");
            CPH.LogError($"Followage command error: {ex.Message}");
            CPH.LogError($"Stack trace: {ex.StackTrace}");
            LogError("Followage Command Error", $"Error: {ex.Message}");
            return false;
        }
    }

    private DateTime? GetFollowDate(string userId, string broadcasterId)
    {
        try
        {
            // Get credentials from global variables (same as clip command)
            string accessToken = CPH.GetGlobalVar<string>("twitchApiAccessToken");
            string clientId = CPH.GetGlobalVar<string>("twitchApiClientId");

            // If not configured, try to get follow info without API
            if (string.IsNullOrEmpty(accessToken) || string.IsNullOrEmpty(clientId))
            {
                CPH.LogWarn("Twitch API credentials not configured. Followage command requires ConfigSetup.cs to be configured.");
                return null;
            }

            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                client.Headers.Add("Authorization", $"Bearer {accessToken}");
                client.Headers.Add("Client-Id", clientId);

                string url = $"https://api.twitch.tv/helix/channels/followers?broadcaster_id={broadcasterId}&user_id={userId}";
                string response = client.DownloadString(url);

                CPH.LogInfo($"Followage API Response: {response.Substring(0, Math.Min(200, response.Length))}");

                // Check if user is following
                if (response.Contains("\"total\":0") || response.Contains("\"data\":[]"))
                {
                    return null; // Not following
                }

                // Parse followed_at date
                int dateStart = response.IndexOf("\"followed_at\":\"") + 15;
                int dateEnd = response.IndexOf("\"", dateStart);

                if (dateStart > 14 && dateEnd > dateStart)
                {
                    string dateString = response.Substring(dateStart, dateEnd - dateStart);
                    DateTime followDate = DateTime.Parse(dateString).ToUniversalTime();
                    CPH.LogInfo($"Follow date parsed: {followDate}");
                    return followDate;
                }
                else
                {
                    CPH.LogError("Failed to parse follow date from response");
                }
            }
        }
        catch (WebException webEx)
        {
            CPH.LogError($"GetFollowDate WebException: {webEx.Message}");
            CPH.SendMessage($"⚠️ Followage API error: {webEx.Message}");
            LogError("Followage API Error", $"WebException: {webEx.Message}");

            if (webEx.Response != null)
            {
                using (var reader = new StreamReader(webEx.Response.GetResponseStream()))
                {
                    string errorResponse = reader.ReadToEnd();
                    CPH.LogError($"API Error Response: {errorResponse}");

                    // Check for specific errors
                    if (errorResponse.Contains("401") || webEx.Message.Contains("401"))
                    {
                        CPH.SendMessage("💡 401 Error: Token invalid/expired. Get new token from twitchtokengenerator.com with 'moderator:read:followers' scope");
                    }
                    else if (errorResponse.Contains("403") || webEx.Message.Contains("403"))
                    {
                        CPH.SendMessage("💡 403 Error: Missing 'moderator:read:followers' scope. Regenerate token with this scope!");
                    }
                }
            }
        }
        catch (Exception ex)
        {
            CPH.LogError($"GetFollowDate error: {ex.Message}");
            CPH.SendMessage($"⚠️ Followage error: {ex.Message}");
            LogError("Followage Error", $"GetFollowDate error: {ex.Message}");
        }

        return null;
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


