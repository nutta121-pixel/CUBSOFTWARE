// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)
// - YouTubeRedemptionCommand.cs (the main video player)
//
// SETUP INSTRUCTIONS:
// 1. Create a new action called "YouTube Stop"
// 2. Add this code as a C# Execute Code sub-action
// 3. Add a command trigger: !stopvideo or !stopyt
// 4. Set permissions to: Moderators only (or Broadcaster only)
//
// Allows mods to immediately stop any playing YouTube video

using System;
using System.Text;
using System.Threading.Tasks;
using System.Net;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Load configuration
            string obsScene = CPH.GetGlobalVar<string>("config_youtube_obs_scene", true);
            string obsSource = CPH.GetGlobalVar<string>("config_youtube_obs_source", true);

            // Get user info
            if (!CPH.TryGetArg("user", out string user))
            {
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                return false;
            }

            // Check if user is a moderator or broadcaster
            bool isModerator = CPH.TryGetArg("isModerator", out bool modStatus) && modStatus;
            bool isBroadcaster = CPH.TryGetArg("isBroadcaster", out bool broadcasterStatus) && broadcasterStatus;

            if (!isModerator && !isBroadcaster)
            {
                CPH.SendMessage($"{user}, only moderators can stop videos!");
                LogWarning("YouTube Stop - Unauthorized",
                    $"**User:** {user}\n**Reason:** Not a moderator");
                return false;
            }

            // Check if video player is currently visible
            bool isVisible = CPH.ObsIsSourceVisible(obsScene, obsSource, 0);

            if (!isVisible)
            {
                CPH.SendMessage($"{user}, no video is currently playing!");
                return false;
            }

            // Get max duration for queue processing
            int maxDuration = CPH.GetGlobalVar<int>("config_youtube_max_duration", true);
            if (maxDuration == 0) maxDuration = 600;

            // Check if there's a queue before processing
            string queue = CPH.GetGlobalVar<string>("youtube_video_queue", false);
            bool hasQueue = !string.IsNullOrEmpty(queue);

            // Send appropriate message first
            if (hasQueue)
            {
                CPH.SendMessage($"⏹️ Video stopped by moderator {user}. Playing next video in queue...");
                LogSuccess("YouTube Video Stopped by Mod",
                    $"**Moderator:** {user}\n**Action:** Skipped to next video in queue");
            }
            else
            {
                CPH.SendMessage($"⏹️ Video stopped by moderator {user}.");
                LogSuccess("YouTube Video Stopped by Mod",
                    $"**Moderator:** {user}\n**Action:** Stopped current video (no queue)");
            }


            // Process the next video in queue (or hide if queue is empty)
            ProcessQueue(obsScene, obsSource, maxDuration);

            return true;
        }
        catch (Exception ex)
        {
            LogError("YouTube Stop Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred while stopping the video");
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // QUEUE PROCESSING
    // ═══════════════════════════════════════════════════════════

    private void ProcessQueue(string obsScene, string obsSource, int maxDuration)
    {
        string queue = CPH.GetGlobalVar<string>("youtube_video_queue", false);

        if (string.IsNullOrEmpty(queue))
        {
            // Queue is empty, just hide the source
            CPH.ObsSetSourceVisibility(obsScene, obsSource, false, 0);

            // Delete JSON file so next redemption plays immediately
            string jsonPath = System.IO.Path.GetFullPath("G:\\GitHub Projects\\StreamerBot-Commands\\Utilities\\YouTube-Player\\current-video.json");
            try
            {
                if (System.IO.File.Exists(jsonPath))
                {
                    System.IO.File.Delete(jsonPath);
                }
            }
            catch { }

            // Don't send message here - the calling function handles messaging
            LogInfo("YouTube Queue", "Queue empty - hiding source");
            return;
        }

        // Get the next video from queue
        string[] queueItems = queue.Split('|');
        string nextItem = queueItems[0];
        string[] parts = nextItem.Split(':');
        string user = parts[0];
        string videoId = parts[1];
        // Parse music video flag (3rd part) - 1 = music video, 0 = regular video
        bool isMusicVideo = parts.Length > 2 && parts[2] == "1";

        // Remove this item from queue
        if (queueItems.Length == 1)
        {
            CPH.SetGlobalVar("youtube_video_queue", "", false);
        }
        else
        {
            string newQueue = string.Join("|", queueItems, 1, queueItems.Length - 1);
            CPH.SetGlobalVar("youtube_video_queue", newQueue, false);
        }

        // Get video title and channel name from API (if configured)
        string videoTitle = "";
        string channelName = "";
        int videoDuration = GetExactVideoDuration(videoId, out videoTitle, out channelName);

        // Use API duration if available, otherwise use maxDuration
        if (videoDuration > 0)
        {
            maxDuration = videoDuration;
        }


        // Fetch synced lyrics if this is a music video (based on queue flag)
        string syncedLyrics = "";
        if (isMusicVideo && !string.IsNullOrEmpty(videoTitle))
        {
            syncedLyrics = GetSyncedLyrics(videoTitle, channelName, maxDuration);
            if (syncedLyrics.Length > 0)
            {
            }
        }

        // Play the next video
        int remaining = queueItems.Length - 1;
        CPH.SendMessage($"🎬 Next video: {user}'s video is now playing! ({remaining} videos left in queue)");
        PlayVideo(user, videoId, videoTitle, obsScene, obsSource, maxDuration, syncedLyrics);
    }

    private void PlayVideo(string user, string videoId, string videoTitle, string obsScene, string obsSource, int maxDuration, string syncedLyrics = "")
    {
        LogSuccess("YouTube - Next in Queue",
            $"**User:** {user}\n**Video ID:** {videoId}\n**Title:** {videoTitle}\n**URL:** https://www.youtube.com/watch?v={videoId}");

        // Get progress bar color from config
        string progressColor = CPH.GetGlobalVar<string>("config_youtube_progress_color", true);
        if (string.IsNullOrEmpty(progressColor))
        {
            progressColor = "#FF0000"; // Default to red if not set
        }

        // Get lyrics timing offset from config
        double lyricsOffset = CPH.GetGlobalVar<double>("config_youtube_lyrics_offset", true);

        // Escape video title and username for JSON (handle quotes and backslashes)
        string escapedTitle = EscapeJsonString(videoTitle);
        string escapedUser = EscapeJsonString(user);
        string escapedLyrics = EscapeJsonString(syncedLyrics);

        // Write video ID to a JSON file that the HTML will poll
        string jsonPath = System.IO.Path.GetFullPath("G:\\GitHub Projects\\StreamerBot-Commands\\Utilities\\YouTube-Player\\current-video.json");
        string jsonContent = $"{{\"videoId\":\"{videoId}\",\"timestamp\":{DateTime.UtcNow.Ticks},\"progressColor\":\"{progressColor}\",\"title\":\"{escapedTitle}\",\"requestedBy\":\"{escapedUser}\",\"lyrics\":\"{escapedLyrics}\",\"lyricsOffset\":{lyricsOffset}}}";

        try
        {
            System.IO.File.WriteAllText(jsonPath, jsonContent);
        }
        catch (Exception ex)
        {
        }

        // Small delay to ensure file is written
        System.Threading.Thread.Sleep(200);

        // Show the source
        CPH.ObsSetSourceVisibility(obsScene, obsSource, true, 0);

        // Monitor for video end using exact duration
        Task.Run(async () =>
        {
            string monitorId = Guid.NewGuid().ToString().Substring(0, 8);

            DateTime startTime = DateTime.Now;
            TimeSpan elapsed = TimeSpan.Zero;
            const int checkInterval = 2000; // Check every 2 seconds

            while (true)
            {
                await Task.Delay(checkInterval);
                elapsed = DateTime.Now - startTime;

                // Check if JSON was replaced (new video started) - FIRST priority
                if (System.IO.File.Exists(jsonPath))
                {
                    try
                    {
                        string currentJson = System.IO.File.ReadAllText(jsonPath);
                        // More robust check: look for exact "videoId":"XXX" pattern
                        string searchPattern = $"\"videoId\":\"{videoId}\"";
                        if (!currentJson.Contains(searchPattern))
                        {
                            return; // Don't process queue, new video is already playing
                        }
                    }
                    catch (Exception ex)
                    {
                    }
                }

                // Check if source was manually hidden (stop command)
                bool isVisible = CPH.ObsIsSourceVisible(obsScene, obsSource, 0);
                if (!isVisible && elapsed.TotalSeconds > 3)
                {
                    return; // Don't process queue if manually stopped
                }

                // Check if duration reached (add 2 second buffer for safety)
                if (elapsed.TotalSeconds >= maxDuration + 2)
                {
                    break;
                }
            }

            LogInfo("YouTube Video Ended",
                $"**User:** {user}\n**Video ID:** {videoId}\n**Duration:** {elapsed.TotalSeconds:F1}s / {maxDuration}s");

            // Check queue for next video
            ProcessQueue(obsScene, obsSource, maxDuration);
        });
    }

    // ═══════════════════════════════════════════════════════════
    // YOUTUBE API - VIDEO DURATION AND TITLE FETCHING
    // ═══════════════════════════════════════════════════════════

    private int GetExactVideoDuration(string videoId, out string videoTitle, out string channelName)
    {
        videoTitle = ""; // Initialize out parameter
        channelName = ""; // Initialize out parameter

        try
        {
            string apiKey = CPH.GetGlobalVar<string>("config_youtube_api_key", true);

            // If no API key configured, return 0 (will use fallback monitoring)
            if (string.IsNullOrEmpty(apiKey) || apiKey == "YOUR_YOUTUBE_API_KEY_HERE")
            {
                return 0;
            }

            // Query YouTube Data API v3 - request both contentDetails (duration) and snippet (title)
            string url = $"https://www.googleapis.com/youtube/v3/videos?id={videoId}&key={apiKey}&part=contentDetails,snippet";

            using (WebClient client = new WebClient())
            {
                client.Headers.Add("User-Agent", "StreamerBot-YouTube/1.0");
                string response = client.DownloadString(url);

                // Parse duration
                int durationStart = response.IndexOf("\"duration\": \"");
                if (durationStart == -1)
                {
                    durationStart = response.IndexOf("\"duration\":\"");
                }

                if (durationStart > -1)
                {
                    durationStart = response.IndexOf("\"", durationStart + 11) + 1;
                }

                int durationEnd = response.IndexOf("\"", durationStart);

                if (durationStart > 0 && durationEnd > durationStart)
                {
                    string duration = response.Substring(durationStart, durationEnd - durationStart);
                    int seconds = ParseISO8601Duration(duration);

                    // Parse video title from snippet
                    int titleStart = response.IndexOf("\"title\": \"");
                    if (titleStart == -1)
                    {
                        titleStart = response.IndexOf("\"title\":\"");
                    }

                    if (titleStart > -1)
                    {
                        titleStart = response.IndexOf("\"", titleStart + 9) + 1;
                        int titleEnd = response.IndexOf("\"", titleStart);

                        if (titleEnd > titleStart)
                        {
                            videoTitle = response.Substring(titleStart, titleEnd - titleStart);
                            videoTitle = videoTitle.Replace("\\\"", "\"").Replace("\\\\", "\\");
                        }
                    }

                    // Parse channel name from snippet (this is usually the artist for music videos)
                    int channelStart = response.IndexOf("\"channelTitle\": \"");
                    if (channelStart == -1)
                    {
                        // Try without space
                        channelStart = response.IndexOf("\"channelTitle\":\"");
                    }

                    if (channelStart > -1)
                    {
                        channelStart = response.IndexOf("\"", channelStart + 16) + 1;
                        int channelEnd = response.IndexOf("\"", channelStart);

                        if (channelEnd > channelStart)
                        {
                            channelName = response.Substring(channelStart, channelEnd - channelStart);
                            channelName = channelName.Replace("\\\"", "\"").Replace("\\\\", "\\");
                            // Clean up common suffixes from channel names
                            channelName = channelName.Replace(" - Topic", "").Replace("VEVO", "").Replace("Official", "").Trim();
                        }
                    }

                    return seconds;
                }
            }
        }
        catch (Exception ex)
        {
        }

        return 0;
    }

    private int ParseISO8601Duration(string duration)
    {
        try
        {
            int totalSeconds = 0;

            if (duration.StartsWith("PT"))
                duration = duration.Substring(2);

            if (duration.Contains("H"))
            {
                int hIndex = duration.IndexOf("H");
                string hours = duration.Substring(0, hIndex);
                totalSeconds += int.Parse(hours) * 3600;
                duration = duration.Substring(hIndex + 1);
            }

            if (duration.Contains("M"))
            {
                int mIndex = duration.IndexOf("M");
                string minutes = duration.Substring(0, mIndex);
                totalSeconds += int.Parse(minutes) * 60;
                duration = duration.Substring(mIndex + 1);
            }

            if (duration.Contains("S"))
            {
                int sIndex = duration.IndexOf("S");
                string seconds = duration.Substring(0, sIndex);
                totalSeconds += int.Parse(seconds);
            }

            return totalSeconds;
        }
        catch
        {
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // LYRICS FETCHING
    // ═══════════════════════════════════════════════════════════

    private string GetSyncedLyrics(string songTitle, string channelName, int videoDuration)
    {
        try
        {
            // Check if lyrics are enabled in config
            bool lyricsEnabled = CPH.GetGlobalVar<bool>("config_youtube_lyrics_enabled", true);

            if (!lyricsEnabled)
            {
                return "";
            }


            // Try to parse artist and song from title
            string artist = "";
            string song = songTitle;

            if (songTitle.Contains(" - "))
            {
                string[] parts = songTitle.Split(new[] { " - " }, 2, StringSplitOptions.None);
                artist = parts[0].Trim();
                song = parts[1].Trim();
            }
            else if (songTitle.Contains(" by "))
            {
                string[] parts = songTitle.Split(new[] { " by " }, 2, StringSplitOptions.None);
                song = parts[0].Trim();
                artist = parts[1].Trim();
            }

            // Clean up artist and song names
            if (song.Contains("(Official"))
            {
                song = song.Substring(0, song.IndexOf("(Official")).Trim();
            }
            if (song.Contains("[Official"))
            {
                song = song.Substring(0, song.IndexOf("[Official")).Trim();
            }

            // If we couldn't parse an artist from title, use the channel name
            if (string.IsNullOrEmpty(artist) && !string.IsNullOrEmpty(channelName))
            {
                artist = channelName;
            }

            // If we still don't have an artist, we can't fetch lyrics
            if (string.IsNullOrEmpty(artist))
            {
                return "";
            }

            // Use LRCLIB API with duration for better matching
            // Duration parameter helps LRCLIB return the most accurate version of the song
            string lyricsUrl = $"https://lrclib.net/api/get?artist_name={System.Uri.EscapeDataString(artist)}&track_name={System.Uri.EscapeDataString(song)}&duration={videoDuration}";

            using (WebClient client = new WebClient())
            {
                client.Headers.Add("User-Agent", "StreamerBot-YouTube/1.0");
                string response = client.DownloadString(lyricsUrl);

                // Parse synced lyrics from response
                int syncedStart = response.IndexOf("\"syncedLyrics\":\"");
                if (syncedStart == -1)
                {
                    syncedStart = response.IndexOf("\"syncedLyrics\": \"");
                }

                if (syncedStart == -1)
                {
                    // No synced lyrics, try plain lyrics as fallback
                    int plainStart = response.IndexOf("\"plainLyrics\":\"");
                    if (plainStart == -1)
                    {
                        plainStart = response.IndexOf("\"plainLyrics\": \"");
                    }

                    if (plainStart > -1)
                    {
                        plainStart = response.IndexOf("\"", plainStart + 14) + 1;
                        int plainEnd = response.IndexOf("\"", plainStart);

                        if (plainEnd > plainStart)
                        {
                            string lyrics = response.Substring(plainStart, plainEnd - plainStart);
                            lyrics = lyrics.Replace("\\n", "\n").Replace("\\r", "").Replace("\\\"", "\"").Replace("\\\\", "\\");
                            return lyrics;
                        }
                    }

                    return "";
                }

                syncedStart = response.IndexOf("\"", syncedStart + 15) + 1;
                int syncedEnd = response.IndexOf("\"", syncedStart);

                if (syncedEnd > syncedStart)
                {
                    string lyrics = response.Substring(syncedStart, syncedEnd - syncedStart);
                    lyrics = lyrics.Replace("\\n", "\n").Replace("\\r", "").Replace("\\\"", "\"").Replace("\\\\", "\\");
                    return lyrics;
                }
            }
        }
        catch (Exception ex)
        {
        }

        return "";
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
        }
    }

    private string EscapeJsonString(string str)
    {
        if (string.IsNullOrEmpty(str))
            return "";

        return str
            .Replace("\\", "\\\\")   // Backslash MUST be first
            .Replace("\"", "\\\"")   // Escape quotes
            .Replace("\n", "\\n")    // Newlines
            .Replace("\r", "\\r")    // Carriage returns
            .Replace("\t", "\\t")    // Tabs
            .Replace("\b", "\\b")    // Backspace
            .Replace("\f", "\\f");   // Form feed
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
