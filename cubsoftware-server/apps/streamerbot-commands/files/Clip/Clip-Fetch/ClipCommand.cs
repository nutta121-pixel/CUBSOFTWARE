// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (for Twitch API credentials)
// - Twitch OAuth Token with Channel:Manage:Broadcast permission
//
// Creates a clip and temporarily changes stream title using Twitch API
// 1. Gets current title from Twitch API
// 2. Changes title to "Clipped by {userName} - {originalTitle}"
// 3. Creates clip
// 4. Restores original title
//
// SETUP: Configure OAuth token in ConfigSetup.cs (lines 344-346)

using System;
using System.IO;
using System.Net;
using System.Text;
using Twitch.Common.Models.Api;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Get credentials from global variables (set via ConfigSetup.cs)
            string accessToken = CPH.GetGlobalVar<string>("twitchApiAccessToken", true);
            string clientId = CPH.GetGlobalVar<string>("twitchApiClientId", true);

            // Check if credentials are configured
            if (string.IsNullOrEmpty(accessToken) || string.IsNullOrEmpty(clientId) ||
                accessToken == "YOUR_ACCESS_TOKEN_HERE" || clientId == "YOUR_CLIENT_ID_HERE")
            {
                CPH.SendMessage("⚠️ Twitch API not configured! Please configure in ConfigSetup.cs and run it.");
                CPH.LogError("Twitch API credentials not found. Configure in ConfigSetup.cs (lines 344-346) and run it.");
                LogError("Twitch API Not Configured", "**Reason:** Credentials not set in ConfigSetup.cs");
                return false;
            }

            // Get user who requested the clip
            if (!CPH.TryGetArg("user", out string clipRequester))
            {
                CPH.LogError("Clip command: Missing 'user' argument");
                LogError("Clip - Missing User", "**Reason:** 'user' argument not provided");
                return false;
            }

            // Log command execution
            LogCommand("!clip (with title)", clipRequester);

            // Check if stream is live
            if (!CPH.ObsIsStreaming())
            {
                LogWarning("Clip - Stream Not Live", $"**User:** {clipRequester}");
                CPH.SendMessage($"@{clipRequester} Cannot create clip - stream is not live!");
                return false;
            }

            // Get broadcaster ID - try multiple possible keys
            string broadcasterId = null;
            if (CPH.TryGetArg("broadcastUserId", out string tempBroadcasterId) && !string.IsNullOrEmpty(tempBroadcasterId))
            {
                broadcasterId = tempBroadcasterId;
            }
            else if (CPH.TryGetArg("broadcasterUserId", out tempBroadcasterId) && !string.IsNullOrEmpty(tempBroadcasterId))
            {
                broadcasterId = tempBroadcasterId;
            }
            else if (CPH.TryGetArg("targetUserId", out tempBroadcasterId) && !string.IsNullOrEmpty(tempBroadcasterId))
            {
                broadcasterId = tempBroadcasterId;
            }

            if (string.IsNullOrEmpty(broadcasterId))
            {
                CPH.SendMessage("⚠️ Could not get broadcaster ID. Check logs for details.");
                CPH.LogError("Broadcaster ID not found in args");
                LogError("Clip - Broadcaster ID Missing", "**Reason:** None of the expected broadcaster ID arguments found");
                return false;
            }

            CPH.LogInfo($"Using broadcaster ID: {broadcasterId}");

            // Immediately acknowledge the request
            CPH.SendMessage($"@{clipRequester} Generating your clip, please wait...");

            // Step 1: Get current stream title from Twitch API
            CPH.LogInfo("Getting current stream title...");
            LogInfo("Getting Stream Title", $"**User:** {clipRequester}\n**Broadcaster ID:** {broadcasterId}");

            string originalTitle = GetChannelTitle(broadcasterId, accessToken, clientId);

            if (string.IsNullOrEmpty(originalTitle))
            {
                originalTitle = "Live Stream";
                CPH.LogWarn("Failed to get current title, using default");
            }
            else
            {
                CPH.LogInfo($"Original title: {originalTitle}");
            }

            // Step 2: Change title to show who is clipping
            string tempTitle = $"Clipped by {clipRequester} - {originalTitle}";
            bool titleChanged = SetChannelTitle(broadcasterId, tempTitle, accessToken, clientId);

            if (titleChanged)
            {
                CPH.LogInfo($"Title changed to: {tempTitle}");
                LogInfo("Title Changed", $"**User:** {clipRequester}\n**New Title:** {tempTitle}");

                // Wait longer to ensure title change propagates
                CPH.LogInfo("Waiting 3 seconds for title change to propagate...");
                CPH.Wait(3000);
            }
            else
            {
                CPH.LogWarn("Failed to change title - continuing anyway");
                LogWarning("Title Change Failed", $"**User:** {clipRequester}\n**Reason:** API call failed");
            }

            // Step 3: Create the clip
            CPH.LogInfo("Creating clip...");
            ClipData clipData = CPH.CreateClip();
            CPH.LogInfo("Waiting for clip to process...");
            CPH.Wait(2000);
            string clipUrl = clipData?.Url;

            // Step 4: Restore original title
            bool titleRestored = SetChannelTitle(broadcasterId, originalTitle, accessToken, clientId);

            if (titleRestored)
            {
                CPH.LogInfo($"Title restored to: {originalTitle}");
                LogInfo("Title Restored", $"**Original Title:** {originalTitle}");
            }
            else
            {
                CPH.LogError("Failed to restore title");
                LogError("Title Restore Failed", $"**Original Title:** {originalTitle}");
            }

            // Check if clip was created
            if (string.IsNullOrEmpty(clipUrl))
            {
                LogError("Clip Creation Failed", $"**User:** {clipRequester}\n**Reason:** ClipData URL was null or empty");
                CPH.SendMessage($"@{clipRequester} Failed to create clip. Please try again.");
                return false;
            }

            // Send clip to chat
            CPH.SendMessage($"@{clipRequester} Your clip is ready! {clipUrl}");

            // Log successful clip creation
            LogSuccess("Clip Created (with Title Change)",
                $"**User:** {clipRequester}\n**URL:** {clipUrl}\n**Temp Title:** {tempTitle}\n**Restored:** {titleRestored}");

            // Post to Discord
            string webhookUrl = "https://discord.com/api/webhooks/1454767477035896945/1WpztUzQOEMsmAKdwroYIzYLuhqbIant2VeHg_Yr5X1s5neRFwXGeWoo82gUmW_uyK5b";
            string avatarUrl = "https://media.discordapp.net/attachments/782876241316675585/1453610762382737439/scarletttearshappy112x112.png";
            string discordMessage = $"**New Clip Created!**\nRequested by: {clipRequester}\n{clipUrl}";

            try
            {
                CPH.DiscordPostTextToWebhook(webhookUrl, discordMessage, "Scarlett Clipping Bot", avatarUrl, false);
            }
            catch (Exception webhookEx)
            {
                CPH.LogWarn($"Failed to post to Discord webhook: {webhookEx.Message}");
            }

            return true;
        }
        catch (Exception ex)
        {
            string userName = "Unknown";
            if (CPH.TryGetArg("user", out string user) && !string.IsNullOrEmpty(user))
            {
                userName = user;
            }

            LogError("Clip Command Exception",
                $"**User:** {userName}\n**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"Clip error: {ex.Message}");
            CPH.SendMessage("An error occurred while creating the clip. Please try again later.");
            return false;
        }
    }

    // Get channel title from Twitch API
    private string GetChannelTitle(string broadcasterId, string accessToken, string clientId)
    {
        try
        {
            using (WebClient client = new WebClient())
            {
                client.Headers.Add("Authorization", $"Bearer {accessToken}");
                client.Headers.Add("Client-Id", clientId);

                string url = $"https://api.twitch.tv/helix/channels?broadcaster_id={broadcasterId}";
                CPH.LogInfo($"API Request: GET {url}");
                CPH.LogInfo($"Client-Id: {clientId.Substring(0, Math.Min(10, clientId.Length))}...");
                CPH.LogInfo($"Token: {accessToken.Substring(0, Math.Min(10, accessToken.Length))}...");

                string response = client.DownloadString(url);
                CPH.LogInfo($"API Response: {response.Substring(0, Math.Min(200, response.Length))}...");

                // Parse JSON response (simple parsing)
                // Response format: {"data":[{"title":"Stream Title",...}]}
                int titleStart = response.IndexOf("\"title\":\"") + 9;
                int titleEnd = response.IndexOf("\"", titleStart);

                if (titleStart > 8 && titleEnd > titleStart)
                {
                    string title = response.Substring(titleStart, titleEnd - titleStart);
                    CPH.LogInfo($"Extracted title: {title}");
                    return title;
                }
                else
                {
                    CPH.LogError("Failed to parse title from response");
                }
            }
        }
        catch (WebException webEx)
        {
            CPH.LogError($"GetChannelTitle WebException: {webEx.Message}");

            if (webEx.Response != null)
            {
                using (var reader = new StreamReader(webEx.Response.GetResponseStream()))
                {
                    string errorResponse = reader.ReadToEnd();
                    CPH.LogError($"API Error Response: {errorResponse}");
                }
            }
        }
        catch (Exception ex)
        {
            CPH.LogError($"GetChannelTitle error: {ex.Message}");
            CPH.LogError($"Stack trace: {ex.StackTrace}");
        }

        return null;
    }

    // Set channel title using Twitch API
    private bool SetChannelTitle(string broadcasterId, string newTitle, string accessToken, string clientId)
    {
        try
        {
            using (WebClient client = new WebClient())
            {
                client.Headers.Add("Authorization", $"Bearer {accessToken}");
                client.Headers.Add("Client-Id", clientId);
                client.Headers.Add("Content-Type", "application/json");

                string url = $"https://api.twitch.tv/helix/channels?broadcaster_id={broadcasterId}";

                // Escape quotes in title for JSON
                string escapedTitle = newTitle.Replace("\"", "\\\"");
                string jsonBody = $"{{\"title\":\"{escapedTitle}\"}}";

                CPH.LogInfo($"API Request: PATCH {url}");
                CPH.LogInfo($"Request Body: {jsonBody}");

                byte[] data = Encoding.UTF8.GetBytes(jsonBody);
                byte[] response = client.UploadData(url, "PATCH", data);

                CPH.LogInfo("Title change successful!");
                return true;
            }
        }
        catch (WebException webEx)
        {
            CPH.LogError($"SetChannelTitle WebException: {webEx.Message}");

            if (webEx.Response != null)
            {
                using (var reader = new StreamReader(webEx.Response.GetResponseStream()))
                {
                    string errorResponse = reader.ReadToEnd();
                    CPH.LogError($"API Error Response: {errorResponse}");
                }
            }

            return false;
        }
        catch (Exception ex)
        {
            CPH.LogError($"SetChannelTitle error: {ex.Message}");
            CPH.LogError($"Stack trace: {ex.StackTrace}");
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

    private void LogCommand(string commandName, string userName, string details = "")
    {
        string message = $"**User:** {userName}";
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
