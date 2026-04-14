// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/CUBSOFTWARE
//
// DEPENDENCIES: ConfigSetup.cs
//
// SETUP IN STREAMERBOT:
//   1. Create an Action named "Countdown"
//   2. Add this C# Sub-Action to the action
//   3. Add a Command trigger: !countdown  (aliases: !timer, !cd)
//   4. Add a Channel Point trigger on the same action
//      - "Pass message to action" does NOT need to be on
//
// GLOBAL VARIABLES (all set in ConfigSetup.cs):
//   config_countdown_min                    (int)    – minimum seconds allowed via command
//   config_countdown_max                    (int)    – maximum seconds allowed via command
//   config_countdown_channel_point_duration (int)    – fixed duration for channel point redemptions
//   config_countdown_cooldown               (int)    – seconds required between countdowns
//   config_countdown_obs_enabled            (bool)   – set to true to update a Text GDI+ source in OBS
//   config_countdown_obs_scene              (string) – OBS scene containing the text source
//   config_countdown_obs_source             (string) – name of the Text GDI+ source to update
//
// OBS NOTE: StreamerBot must be connected to OBS WebSocket (Settings → OBS WebSocket in StreamerBot).
//           The source shows MM:SS while counting and clears to empty when done or cancelled.
//
// USAGE:
//   !countdown 60      → 60-second countdown (must be within min/max range)
//   !countdown 5m      → 5-minute countdown  (must be within min/max range)
//   !countdown stop    → cancel the active countdown AND clear the queue
//   Channel Point      → always uses config_countdown_channel_point_duration
//
// QUEUE:
//   If a countdown is already running, new requests are queued and run automatically
//   when the current one finishes. !countdown stop clears the entire queue.

using System;
using System.Text;

public class CPHInline
{
    // ═══════════════════════════════════════════════════════════
    // ENTRY POINT
    // ═══════════════════════════════════════════════════════════

    public bool Execute()
    {
        try
        {
            // ── Load config ───────────────────────────────────────
            int minSeconds   = CPH.GetGlobalVar<int>("config_countdown_min",                    true);
            int maxSeconds   = CPH.GetGlobalVar<int>("config_countdown_max",                    true);
            int cpDuration   = CPH.GetGlobalVar<int>("config_countdown_channel_point_duration", true);
            int cooldownSecs = CPH.GetGlobalVar<int>("config_countdown_cooldown",               true);

            if (minSeconds   <= 0) minSeconds   = 10;
            if (maxSeconds   <= 0) maxSeconds   = 600;
            if (cpDuration   <= 0) cpDuration   = 60;
            if (cooldownSecs <= 0) cooldownSecs = 30;

            // ── Who triggered it? ─────────────────────────────────
            CPH.TryGetArg("user", out string user);
            if (string.IsNullOrEmpty(user)) user = "Someone";

            // ── Detect trigger source ─────────────────────────────
            // rewardName is always present for channel point redemptions.
            // command is always present for chat command triggers.
            CPH.TryGetArg("rewardName", out string rewardName);
            CPH.TryGetArg("rewardId",   out string rewardId);
            CPH.TryGetArg("command",    out string command);
            bool isChannelPoint = !string.IsNullOrEmpty(rewardName) || !string.IsNullOrEmpty(rewardId) || string.IsNullOrEmpty(command);


            // ── Handle "stop" (command only) ──────────────────────
            if (!isChannelPoint)
            {
                string rawInput = "";
                if (CPH.TryGetArg("input0",   out string i0) && !string.IsNullOrEmpty(i0)) rawInput = i0.Trim();
                else if (CPH.TryGetArg("rawInput", out string ri) && !string.IsNullOrEmpty(ri)) rawInput = ri.Trim();

                if (rawInput.Equals("stop",   StringComparison.OrdinalIgnoreCase) ||
                    rawInput.Equals("cancel", StringComparison.OrdinalIgnoreCase))
                {
                    if (CPH.GetGlobalVar<bool>("countdown_active", false))
                    {
                        CPH.SetGlobalVar("countdown_active", false, false);
                        CPH.SetGlobalVar("countdown_queue", "", false);
                        CPH.SendMessage($"⛔ Countdown cancelled by {user}. Queue cleared.");
                        LogCommand("!countdown stop", user, "Countdown cancelled + queue cleared");
                    }
                    else
                    {
                        CPH.SendMessage($"@{user} no countdown is running right now.");
                    }
                    return true;
                }
            }

            // ── Determine duration ────────────────────────────────
            int seconds;

            if (isChannelPoint)
            {
                seconds = cpDuration;
            }
            else
            {
                string arg = "";
                if (CPH.TryGetArg("input0",   out string a0) && !string.IsNullOrEmpty(a0)) arg = a0.Trim();
                else if (CPH.TryGetArg("rawInput", out string ra) && !string.IsNullOrEmpty(ra)) arg = ra.Trim();

                if (string.IsNullOrEmpty(arg))
                {
                    CPH.SendMessage($"@{user} specify a duration — !countdown 60  or  !countdown 5m  ({FormatDuration(minSeconds)}–{FormatDuration(maxSeconds)})");
                    return false;
                }

                seconds = ParseDuration(arg);

                if (seconds <= 0)
                {
                    CPH.SendMessage($"@{user} invalid duration — !countdown 60  or  !countdown 5m  ({FormatDuration(minSeconds)}–{FormatDuration(maxSeconds)})");
                    return false;
                }
                if (seconds < minSeconds)
                {
                    CPH.SendMessage($"@{user} minimum countdown is {FormatDuration(minSeconds)}.");
                    return false;
                }
                if (seconds > maxSeconds)
                {
                    CPH.SendMessage($"@{user} maximum countdown is {FormatDuration(maxSeconds)}.");
                    return false;
                }
            }

            // ── Queue if a countdown is already running ───────────
            if (CPH.GetGlobalVar<bool>("countdown_active", false))
            {
                int pos = AddToQueue(seconds, user);
                CPH.SendMessage($"@{user} a countdown is running — your {FormatDuration(seconds)} is queued at position #{pos}!");
                return true;
            }

            // ── Cooldown check ────────────────────────────────────
            long lastEnd = CPH.GetGlobalVar<long>("countdown_last_end", false);
            long nowTs   = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
            if (lastEnd > 0 && (nowTs - lastEnd) < cooldownSecs)
            {
                int waitLeft = (int)(cooldownSecs - (nowTs - lastEnd));
                CPH.SendMessage($"@{user} countdown on cooldown! Try again in {waitLeft}s.");
                return false;
            }

            // ── Run it ────────────────────────────────────────────
            RunCountdown(seconds, user, isChannelPoint);
            return true;
        }
        catch (Exception ex)
        {
            CPH.SetGlobalVar("countdown_active", false, false);
            CPH.LogError($"CountdownCommand error: {ex.Message}");
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // COUNTDOWN LOGIC
    // ═══════════════════════════════════════════════════════════

    private void RunCountdown(int seconds, string user, bool isChannelPoint)
    {
        // ── OBS config ────────────────────────────────────────────
        bool   obsEnabled = CPH.GetGlobalVar<bool>  ("config_countdown_obs_enabled", true);
        string obsScene   = CPH.GetGlobalVar<string>("config_countdown_obs_scene",   true) ?? "";
        string obsSource  = CPH.GetGlobalVar<string>("config_countdown_obs_source",  true) ?? "";
        bool   useObs     = obsEnabled && !string.IsNullOrEmpty(obsScene) && !string.IsNullOrEmpty(obsSource);

        // ── Milestones: seconds at which a chat message fires ─────
        // Only fires if the remaining time matches one of these values exactly.
        int[] chatMilestones = new[] { 300, 240, 180, 120, 90, 60, 45, 30, 20, 15, 10 };

        CPH.SetGlobalVar("countdown_active", true, false);

        string trigger = isChannelPoint ? "channel point" : "!countdown";
        CPH.SendMessage($"⏳ Countdown starting! {FormatDuration(seconds)} on the clock!");
        LogCommand(trigger, user, $"Started {seconds}s countdown");

        // ── Main loop — ticks every second ────────────────────────
        int remaining = seconds;

        while (remaining > 0)
        {
            // Cancelled?
            if (!CPH.GetGlobalVar<bool>("countdown_active", false))
            {
                if (useObs) SetObsText(obsScene, obsSource, "");
                return;
            }

            // Update OBS text source every tick
            if (useObs) SetObsText(obsScene, obsSource, FormatObsDisplay(remaining));

            // Chat — milestone announcements (only when > 5s left so we don't overlap the final count)
            if (remaining > 5)
            {
                foreach (int m in chatMilestones)
                {
                    if (remaining == m)
                    {
                        CPH.SendMessage($"⏳ {FormatDuration(remaining)} remaining!");
                        break;
                    }
                }
            }

            // Chat — final 5-4-3-2-1
            if (remaining <= 5)
                CPH.SendMessage($"⏳ {remaining}...");

            CPH.Wait(1000);
            remaining--;
        }

        // ── Done ─────────────────────────────────────────────────
        if (!CPH.GetGlobalVar<bool>("countdown_active", false))
        {
            if (useObs) SetObsText(obsScene, obsSource, "");
            return;
        }

        CPH.SendMessage("🎉 Time's up!");
        if (useObs) SetObsText(obsScene, obsSource, "");

        CPH.SetGlobalVar("countdown_active", false, false);
        CPH.SetGlobalVar("countdown_last_end", DateTimeOffset.UtcNow.ToUnixTimeSeconds(), false);
        LogCommand(trigger, user, $"Completed {seconds}s countdown");

        // ── Run next in queue ─────────────────────────────────
        RunNextInQueue();
    }

    // ═══════════════════════════════════════════════════════════
    // HELPERS
    // ═══════════════════════════════════════════════════════════

    /// <summary>Add a countdown to the pending queue. Returns the 1-based queue position.</summary>
    private int AddToQueue(int seconds, string user)
    {
        string existing = CPH.GetGlobalVar<string>("countdown_queue", false) ?? "";
        string entry    = $"{seconds}|{user}";
        int pos;
        string updated;
        if (string.IsNullOrEmpty(existing))
        {
            updated = entry;
            pos     = 1;
        }
        else
        {
            updated = existing + "," + entry;
            pos     = existing.Split(',').Length + 1;
        }
        CPH.SetGlobalVar("countdown_queue", updated, false);
        return pos;
    }

    /// <summary>Dequeue the next countdown and run it, if any are waiting.</summary>
    private void RunNextInQueue()
    {
        string queue = CPH.GetGlobalVar<string>("countdown_queue", false) ?? "";
        if (string.IsNullOrEmpty(queue)) return;

        string[] items   = queue.Split(new[] { ',' }, 2);
        string   next    = items[0];
        string   remaining = items.Length > 1 ? items[1] : "";
        CPH.SetGlobalVar("countdown_queue", remaining, false);

        string[] parts = next.Split(new[] { '|' }, 2);
        if (!int.TryParse(parts[0], out int nextSeconds)) return;
        string nextUser = parts.Length > 1 ? parts[1] : "Someone";

        CPH.Wait(1500);
        CPH.SendMessage($"▶️ Next up: {FormatDuration(nextSeconds)} countdown for {nextUser}!");
        RunCountdown(nextSeconds, nextUser, false);
    }

    /// <summary>Update a Text GDI+ source, silently ignoring OBS errors.</summary>
    private void SetObsText(string scene, string source, string text)
    {
        try { CPH.ObsSetGdiText(scene, source, text); }
        catch (Exception ex) { CPH.LogWarn($"Countdown OBS update failed: {ex.Message}"); }
    }

    /// <summary>Format remaining seconds for the OBS display — MM:SS when >= 60s, otherwise just seconds.</summary>
    private string FormatObsDisplay(int seconds)
    {
        if (seconds >= 60)
        {
            int m = seconds / 60;
            int s = seconds % 60;
            return $"{m}:{s:D2}";
        }
        return seconds.ToString();
    }

    /// <summary>Format seconds as "1m 30s" or "45s" for chat messages.</summary>
    private string FormatDuration(int seconds)
    {
        if (seconds >= 60)
        {
            int m = seconds / 60;
            int s = seconds % 60;
            return s == 0 ? $"{m}m" : $"{m}m {s}s";
        }
        return $"{seconds}s";
    }

    /// <summary>Parse "60", "60s", or "5m" → seconds. Returns -1 if unparseable.</summary>
    private int ParseDuration(string input)
    {
        string s = input.Trim().ToLower();
        if (s.EndsWith("m"))
        {
            string numPart = s.Substring(0, s.Length - 1).Trim();
            if (int.TryParse(numPart, out int mins) && mins > 0) return mins * 60;
        }
        if (s.EndsWith("s"))
        {
            string numPart = s.Substring(0, s.Length - 1).Trim();
            if (int.TryParse(numPart, out int secs) && secs > 0) return secs;
        }
        if (int.TryParse(s, out int plain) && plain > 0) return plain;
        return -1;
    }

    // ═══════════════════════════════════════════════════════════
    // DISCORD LOGGING
    // ═══════════════════════════════════════════════════════════

    private const int COLOR_COMMAND = 10181046;

    private void LogCommand(string commandName, string user, string details = "")
    {
        string message = $"**User:** {user}";
        if (!string.IsNullOrEmpty(details)) message += $"\\n**Details:** {details}";
        SendToDiscord($"Command: {commandName}", message, COLOR_COMMAND, "COMMAND");
    }

    private void SendToDiscord(string title, string description, int color, string footer)
    {
        try
        {
            bool loggingEnabled = CPH.GetGlobalVar<bool>("discordLoggingEnabled", true);
            if (!loggingEnabled) return;

            string webhookUrl = CPH.GetGlobalVar<string>("discordLogWebhook", true);
            if (string.IsNullOrEmpty(webhookUrl)) return;

            title       = EscapeJson(title);
            description = EscapeJson(description);
            footer      = EscapeJson(footer);

            StringBuilder json = new StringBuilder();
            json.Append("{\"embeds\":[{");
            json.Append($"\"title\":\"{title}\",");
            json.Append($"\"description\":\"{description}\",");
            json.Append($"\"color\":{color},");
            json.Append($"\"timestamp\":\"{DateTime.UtcNow:o}\",");
            json.Append($"\"footer\":{{\"text\":\"{footer} | HexEchoTV Logging System\"}}");
            json.Append("}]}");

            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                client.Headers.Add("Content-Type", "application/json");
                client.UploadString(webhookUrl, "POST", json.ToString());
            }
        }
        catch (Exception ex) { CPH.LogError($"DiscordLogger error: {ex.Message}"); }
    }

    private string EscapeJson(string str)
    {
        if (string.IsNullOrEmpty(str)) return "";
        return str
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r")
            .Replace("\t", "\\t");
    }
}
