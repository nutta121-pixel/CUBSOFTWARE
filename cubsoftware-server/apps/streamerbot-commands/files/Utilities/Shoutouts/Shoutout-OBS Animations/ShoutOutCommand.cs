// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: None (standalone command)

using System;
using System.Collections.Generic;
using System.Net;
using System.Text;
using Twitch.Common.Models.Api;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
        // ===== CONFIGURATION =====
        string sceneName = "Bots";  // Change to your actual scene name
        string groupName = "SO";     // Your group source name
        int profileDisplayTime = 2000;          // Profile picture display time in milliseconds (2 seconds)
        int videoPlayTime = 15000;              // Video play time in milliseconds (15 seconds) - CHANGE THIS AS NEEDED

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

        // Get extended user info (includes profile picture URL)
        var userInfo = CPH.TwitchGetExtendedUserInfoByLogin(targetUser);

            if (userInfo == null)
            {
                LogWarning("Shoutout Full - User Not Found", $"**Target:** {targetUser}");
                CPH.SendMessage($"Missing user, we could not find: {targetUser}");
                return false;
            }

        // ===== OBS SETUP INSTRUCTIONS =====
        // 1. Create a GROUP in OBS named "ShoutoutGroup" (or change groupName above)
        // 2. Inside the group, create these sources:
        //    - GDI+ Text: "ShoutoutUsername"
        //    - GDI+ Text: "ShoutoutMessage"
        //    - Browser Source: "ShoutoutProfilePic" (300x300px)
        //    - Browser Source: "ShoutoutClip" (size for video)
        //
        // 3. IMPORTANT: Enable Show/Hide Transitions on each source:
        //    - Right-click each source → Properties → Show Transition: Fade (300ms)
        //    - Right-click each source → Properties → Hide Transition: Fade (300ms)

        // Update username text
        CPH.ObsSetGdiText(sceneName, "ShoutoutUsername", targetUser);

        // Update message text
        string message = $"Take a look at!";
        CPH.ObsSetGdiText(sceneName, "ShoutoutMessage", message);

        // Update profile picture
        string profilePicUrl = userInfo.ProfileImageUrl;
        CPH.ObsSetBrowserSource(sceneName, "ShoutoutProfilePic", profilePicUrl);

        // Get clips for the user and pick a random one
        // Use isFeatured=true to get only featured clips (less likely to be age-gated)
        List<ClipData> clips = CPH.GetClipsForUser(targetUser, new TimeSpan(90, 0, 0, 0), true);

        string clipEmbedUrl = "";
        if (clips != null && clips.Count > 0)
        {
            Random random = new Random();
            int randomIndex = random.Next(clips.Count);
            ClipData randomClip = clips[randomIndex];

            // Build proper embed URL with autoplay
            // EmbedUrl already has ?, so we use &
            clipEmbedUrl = $"{randomClip.EmbedUrl}&parent=localhost&autoplay=true&muted=false";

            CPH.ObsSetBrowserSource(sceneName, "ShoutoutClip", clipEmbedUrl);

            // Give the browser source time to load
            CPH.Wait(500);
        }
        else
        {
            // No clips available - set browser source to blank to prevent black screen
            CPH.ObsSetBrowserSource(sceneName, "ShoutoutClip", "about:blank");
        }

        // ===== ANIMATION SEQUENCE =====

        // Hide the video clip BEFORE showing the group (prevents black screen)
        CPH.ObsHideSource(sceneName, "ShoutoutClip");

        // Show the group
        CPH.ObsShowSource(sceneName, groupName);

        // STEP 1: Show profile picture for 2 seconds
        CPH.ObsShowSource(sceneName, "ShoutoutProfilePic");
        CPH.Wait(profileDisplayTime);

        // STEP 2: If we have a clip, transition to video
        if (!string.IsNullOrEmpty(clipEmbedUrl))
        {
            // Fade out profile picture, fade in video
            CPH.ObsHideSource(sceneName, "ShoutoutProfilePic");
            CPH.ObsShowSource(sceneName, "ShoutoutClip");

            // Play video for specified time
            CPH.Wait(videoPlayTime);

            // Fade out video, fade back to profile picture
            CPH.ObsHideSource(sceneName, "ShoutoutClip");
            CPH.ObsShowSource(sceneName, "ShoutoutProfilePic");

            // STEP 3: Show profile picture again for 2 seconds
            CPH.Wait(profileDisplayTime);

            // Send chat message with clip
            CPH.SendMessage($"Take a looksee at {targetUser} at https://twitch.tv/{targetUser} - Here's one of their clips!");
        }
        else
        {
            // No clips available - keep showing profile picture for same duration as video would play
            CPH.ObsHideSource(sceneName, "ShoutoutClip");  // Ensure video stays hidden
            CPH.Wait(videoPlayTime + profileDisplayTime);  // Show profile for same total time as video sequence
            CPH.SendMessage($"Take a looksee at {targetUser} at https://twitch.tv/{targetUser} - They're a good creature!");
        }

            // STEP 4: Hide everything
            CPH.ObsHideSource(sceneName, "ShoutoutProfilePic");
            CPH.ObsHideSource(sceneName, "ShoutoutClip");  // Ensure clip is hidden
            CPH.ObsHideSource(sceneName, groupName);

            LogSuccess("Shoutout Full Complete",
                $"**Target:** {targetUser}\n" +
                $"**Has Clip:** {!string.IsNullOrEmpty(clipEmbedUrl)}");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Shoutout Full Exception",
                $"**Error:** {ex.Message}\n" +
                $"**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"Shoutout Full error: {ex.Message}");
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