// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// ════════════════════════════════════════════════════════════════════════════════
//  WHAT THIS DOES
//
//  !so @hexechotv  →  looks up the last game they played (works even if offline)
//                 →  AI writes something about that game + a funny fact or joke
//                 →  sends the message in chat with a link to their channel
//
//  Example output (style: hype):
//    "YO CHAT go check out HexEchoTV — they hunt ghosts in Phasmophobia which
//     means they either have nerves of steel or questionable life choices.
//     twitch.tv/hexechotv"
//
//  Example output (style: funny):
//    "HexEchoTV plays Phasmophobia — basically paying money to get scared by
//     a flashlight. Absolute legend. twitch.tv/hexechotv"
//
//  Example output (style: chill):
//    "hey if you're into horror games hexechotv plays phasmophobia and is
//     actually pretty good at it. worth a look: twitch.tv/hexechotv"
//
// ════════════════════════════════════════════════════════════════════════════════
//
//  QUICK START — add these 3 global vars in Streamer.bot → Settings → Global Variables
//
//    groqApiKey          Your free Groq API key → sign up at https://console.groq.com
//    twitchClientId      Client ID from https://dev.twitch.tv/console/apps
//    twitchClientSecret  Client Secret from the same app
//
//    That's it. The bot handles everything else automatically.
//
// ════════════════════════════════════════════════════════════════════════════════
//
//  CUSTOMISATION — optional global vars you can add at any time
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  STYLE — change the vibe of every shoutout                              │
//  │                                                                         │
//  │  Global var:  shoutoutStyle                                             │
//  │  Options:     hype | funny | chill | chaotic | professional             │
//  │  Default:     hype                                                      │
//  │                                                                         │
//  │  hype          → Big energy. Caps. Max excitement.                      │
//  │  funny         → Pun or joke specifically about the game they play.     │
//  │  chill         → Relaxed. Like a friend quietly recommending someone.   │
//  │  chaotic       → Unhinged meme energy. Gremlin vibes. Unpredictable.    │
//  │  professional  → Clean and formal. No slang. Like a press mention.      │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  EXTRA INSTRUCTIONS — bolt extra rules onto any style                   │
//  │                                                                         │
//  │  Global var:  shoutoutExtra                                             │
//  │                                                                         │
//  │  Examples (paste any of these as the value):                            │
//  │    "Always mention their follower count."                                │
//  │    "Always end with a relevant emoji."                                   │
//  │    "Always include a fun fact about the game."                           │
//  │    "Always compliment their stream title."                               │
//  │    "Never use the word 'check'."                                         │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  CUSTOM PROMPT — take full control of what the AI is asked to write     │
//  │                                                                         │
//  │  Global var:  shoutoutPrompt                                            │
//  │                                                                         │
//  │  Write anything. Use {tokens} to insert live data.                      │
//  │                                                                         │
//  │  Available tokens:                                                       │
//  │    {name}       Display name (e.g. HexEchoTV)                           │
//  │    {login}      Twitch login (e.g. hexechotv)                           │
//  │    {game}       Last played game (e.g. Phasmophobia)                    │
//  │    {link}       https://twitch.tv/{login}                                │
//  │    {title}      Their stream title                                       │
//  │    {bio}        Their channel description                                │
//  │    {tags}       Their channel tags                                       │
//  │    {badge}      Partner / Affiliate / Streamer                          │
//  │    {status}     LIVE or offline                                          │
//  │    {followers}  Follower count (if sub-action args are set)             │
//  │    {age}        How long they've been on Twitch (e.g. "3 years")        │
//  │    {since}      Month they joined (e.g. "January 2021")                 │
//  │    {by}         Who triggered the !so command                            │
//  │    {today}      Today's date                                             │
//  │                                                                         │
//  │  Example prompts:                                                        │
//  │    "Shoutout {name} who plays {game}. Roast the game. Link: {link}."   │
//  │    "Write a movie trailer voice-over shoutout for {name}'s             │
//  │     {game} stream. Include {link}."                                      │
//  │    "Pretend {name} is a pro athlete. Hype their {game} career.          │
//  │     Include {link}. Under 200 chars."                                    │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  AI MODEL (optional)                                                    │
//  │                                                                         │
//  │  Global var:  shoutoutModel                                             │
//  │  Default:     llama-3.1-8b-instant  (fast, free)                       │
//  │  Smarter:     llama-3.3-70b-versatile  (better output, still free)     │
//  └─────────────────────────────────────────────────────────────────────────┘
//
//  DISCORD LOGGING (optional — uses the same vars as other CUB commands)
//    discordLoggingEnabled   bool    true/false
//    discordLogWebhook       string  <webhook URL>

using System;
using System.Net;
using System.Text;
using System.Text.RegularExpressions;
using Twitch.Common.Models.Api;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // ── 1. Get the target username ──────────────────────────────────────────────
            string target = "";
            if (CPH.TryGetArg("targetUser", out string t1) && !string.IsNullOrEmpty(t1)) target = t1;
            else if (CPH.TryGetArg("input0", out string t2) && !string.IsNullOrEmpty(t2)) target = t2;
            else { CPH.SendMessage("Usage: !so @username"); return false; }
            target = target.Replace("@", "").Trim().ToLower();

            // ── 2. Who triggered the command ────────────────────────────────────────────
            CPH.TryGetArg("userDisplayName", out string by);
            if (string.IsNullOrEmpty(by)) CPH.TryGetArg("user", out by);
            if (string.IsNullOrEmpty(by)) by = "someone";
            LogCommand("!so", by, $"→ {target}");

            // ── 3. Look up the target user ──────────────────────────────────────────────
            var info = CPH.TwitchGetExtendedUserInfoByLogin(target);
            if (info == null)
            {
                CPH.SendMessage($"Couldn't find @{target} on Twitch.");
                LogWarning("Shoutout - Not Found", $"**By:** {by}\n**Target:** {target}");
                return false;
            }

            // ── 4. Build all variables ──────────────────────────────────────────────────

            // Core — always available
            string name    = info.UserLogin;
            string login   = (info.UserLogin ?? target).ToLower();
            string bio     = info.Description ?? "";
            string link    = $"https://twitch.tv/{login}";
            string rawType = info.BroadcasterType ?? "";
            string badge   = rawType == "partner" ? "Partner" : rawType == "affiliate" ? "Affiliate" : "Streamer";
            string today   = DateTime.UtcNow.ToString("MMMM d, yyyy");

            DateTime joined = info.CreatedAt;
            int years = Math.Max(0, (int)((DateTime.UtcNow - joined).TotalDays / 365));
            string age   = years >= 1 ? $"{years} year{(years != 1 ? "s" : "")}" : "less than a year";
            string since = joined.ToString("MMMM yyyy");

            // Channel — game, title, tags (auto-fetched from Twitch, works offline)
            string game  = "";
            string title = "";
            string tags  = "";
            var channel = FetchChannelInfo(login);
            if (channel != null) { game = channel[0]; title = channel[1]; tags = channel[2]; }

            // Fall back to sub-action args if Twitch API creds aren't configured
            if (string.IsNullOrEmpty(game)  && CPH.TryGetArg("targetGame",  out string ag)) game  = ag;
            if (string.IsNullOrEmpty(title) && CPH.TryGetArg("targetTitle", out string at)) title = at;
            if (string.IsNullOrEmpty(tags)  && CPH.TryGetArg("targetTags",  out string ak)) tags  = ak;
            if (string.IsNullOrEmpty(game)) game = "variety games";

            // Optional extras from sub-action args
            string followers = "";
            CPH.TryGetArg("targetFollowers", out followers);

            bool isLive = false;
            if (CPH.TryGetArg("targetIsLive", out string lv)) bool.TryParse(lv, out isLive);
            string status = isLive ? "LIVE" : "offline";

            // ── 5. Generate and send the shoutout ───────────────────────────────────────
            string msg = GenerateShoutout(name, login, game, title, bio, link,
                                          followers, tags, badge, age, since, status, by, today);

            // ╔══════════════════════════════════════════════════════════════════════╗
            // ║  TWITCH CHAT MESSAGE — this is what gets sent to chat              ║
            // ║                                                                    ║
            // ║  • AI message is used when Groq generates one successfully.        ║
            // ║  • Fallback message is used if Groq fails or groqApiKey is not set.║
            // ║                                                                    ║
            // ║  To change the AI message:  edit the DEFAULT PROMPT below          ║
            // ║  To change the fallback:    edit the string on the next line ↓     ║
            // ╚══════════════════════════════════════════════════════════════════════╝
            string fallback = $"Go check out {name} at {link} — they're great!";
            // ↑ EDIT THIS — shown if AI fails. You can use: name, login, game, link, badge, status

            CPH.SendMessage(!string.IsNullOrEmpty(msg) ? msg : fallback);

            LogSuccess("Shoutout Sent",
                $"**By:** {by}\n**Target:** {name} ({badge})\n" +
                $"**Last Game:** {game}\n**Status:** {status}");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Shoutout Error", $"**Error:** {ex.Message}\n**Stack:** {ex.StackTrace}");
            CPH.LogError($"[AI Shoutout] {ex.Message}");
            return false;
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  TWITCH CHANNEL INFO
    //  Fetches last played game, title, and tags via Twitch Helix API.
    //  Works even when the channel is offline.
    //  The App Access Token is fetched and refreshed automatically.
    // ════════════════════════════════════════════════════════════════════════════

    private string[] FetchChannelInfo(string login)
    {
        try
        {
            string clientId  = CPH.GetGlobalVar<string>("twitchClientId",     true);
            string clientSec = CPH.GetGlobalVar<string>("twitchClientSecret", true);
            if (string.IsNullOrEmpty(clientId) || string.IsNullOrEmpty(clientSec))
            {
                CPH.LogInfo("[AI Shoutout] twitchClientId / twitchClientSecret not set — game lookup disabled. Add them as global vars to enable it.");
                return null;
            }

            string token = GetOrRefreshToken(clientId, clientSec);
            if (string.IsNullOrEmpty(token)) return null;

            // Resolve login → broadcaster_id
            string usersResp;
            using (var wc = new WebClient())
            {
                wc.Headers.Add("Client-Id", clientId);
                wc.Headers.Add("Authorization", $"Bearer {token}");
                usersResp = wc.DownloadString($"https://api.twitch.tv/helix/users?login={Uri.EscapeDataString(login)}");
            }

            var idM = Regex.Match(usersResp, "\"id\":\\s*\"(\\d+)\"");
            if (!idM.Success) return null;

            // Fetch channel info — game_name is always the last game set, live or not
            string chanResp;
            using (var wc = new WebClient())
            {
                wc.Headers.Add("Client-Id", clientId);
                wc.Headers.Add("Authorization", $"Bearer {token}");
                chanResp = wc.DownloadString($"https://api.twitch.tv/helix/channels?broadcaster_id={idM.Groups[1].Value}");
            }

            string game  = "";
            string title = "";
            string tags  = "";

            var gm = Regex.Match(chanResp, "\"game_name\":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
            var tm = Regex.Match(chanResp, "\"title\":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
            if (gm.Success) game  = Unescape(gm.Groups[1].Value);
            if (tm.Success) title = Unescape(tm.Groups[1].Value);

            var tb = Regex.Match(chanResp, "\"tags\":\\s*\\[([^\\]]*)\\]");
            if (tb.Success)
            {
                var tv = Regex.Matches(tb.Groups[1].Value, "\"([^\"]+)\"");
                var sb = new StringBuilder();
                foreach (Match m in tv) { if (sb.Length > 0) sb.Append(", "); sb.Append(m.Groups[1].Value); }
                tags = sb.ToString();
            }

            return new[] { game, title, tags };
        }
        catch (Exception ex) { CPH.LogError($"[AI Shoutout] FetchChannelInfo: {ex.Message}"); return null; }
    }

    // Fetches a Twitch App Access Token, caches it, and auto-refreshes when expired.
    private string GetOrRefreshToken(string clientId, string secret)
    {
        try
        {
            string cached = CPH.GetGlobalVar<string>("_soToken",       true);
            string expiry = CPH.GetGlobalVar<string>("_soTokenExpiry", true);
            if (!string.IsNullOrEmpty(cached) && !string.IsNullOrEmpty(expiry)
                && DateTime.UtcNow < DateTime.Parse(expiry))
                return cached;

            string resp;
            using (var wc = new WebClient())
            {
                wc.Headers.Add("Content-Type", "application/x-www-form-urlencoded");
                resp = wc.UploadString("https://id.twitch.tv/oauth2/token", "POST",
                    $"client_id={Uri.EscapeDataString(clientId)}" +
                    $"&client_secret={Uri.EscapeDataString(secret)}" +
                    "&grant_type=client_credentials");
            }

            var tkM  = Regex.Match(resp, "\"access_token\":\\s*\"([^\"]+)\"");
            var expM = Regex.Match(resp, "\"expires_in\":\\s*(\\d+)");
            if (!tkM.Success) { CPH.LogError("[AI Shoutout] Failed to get Twitch token."); return null; }

            string newToken  = tkM.Groups[1].Value;
            int    expiresIn = expM.Success ? int.Parse(expM.Groups[1].Value) : 3600;
            string newExpiry = DateTime.UtcNow.AddSeconds(expiresIn - 300).ToString("o");

            CPH.SetGlobalVar("_soToken",       newToken,  true);
            CPH.SetGlobalVar("_soTokenExpiry", newExpiry, true);
            return newToken;
        }
        catch (Exception ex) { CPH.LogError($"[AI Shoutout] GetOrRefreshToken: {ex.Message}"); return null; }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  AI SHOUTOUT GENERATION
    // ════════════════════════════════════════════════════════════════════════════

    private string GenerateShoutout(
        string name,  string login, string game,  string title,
        string bio,   string link,  string followers, string tags,
        string badge, string age,   string since, string status, string by, string today)
    {
        try
        {
            string apiKey = CPH.GetGlobalVar<string>("groqApiKey", true);
            if (string.IsNullOrEmpty(apiKey))
            {
                CPH.LogWarn("[AI Shoutout] 'groqApiKey' not set. Get a free key at https://console.groq.com");
                return null;
            }

            string model = CPH.GetGlobalVar<string>("shoutoutModel", true);
            if (string.IsNullOrEmpty(model)) model = "llama-3.1-8b-instant";

            // Style + extra instructions
            string style = CPH.GetGlobalVar<string>("shoutoutStyle", true) ?? "hype";
            string extra = CPH.GetGlobalVar<string>("shoutoutExtra", true) ?? "";

            string systemPrompt =
                "You are a Twitch shoutout bot. Write short, punchy chat messages. " +
                "Always under 200 characters. Never use quotation marks around the message. " +
                GetStyle(style) +
                (string.IsNullOrEmpty(extra) ? "" : " " + extra.Trim());

            // Build the user prompt — check for custom template first
            string custom = CPH.GetGlobalVar<string>("shoutoutPrompt", true);
            string userPrompt;

            if (!string.IsNullOrEmpty(custom))
            {
                // Custom prompt — replace all {tokens} with live values
                userPrompt = custom
                    .Replace("{name}",      name)
                    .Replace("{login}",     login)
                    .Replace("{game}",      game)
                    .Replace("{title}",     title)
                    .Replace("{bio}",       bio)
                    .Replace("{link}",      link)
                    .Replace("{followers}", followers)
                    .Replace("{tags}",      tags)
                    .Replace("{badge}",     badge)
                    .Replace("{status}",    status)
                    .Replace("{age}",       age)
                    .Replace("{since}",     since)
                    .Replace("{by}",        by)
                    .Replace("{today}",     today);
            }
            else
            {
                // ╔══════════════════════════════════════════════════════════════════════╗
                // ║  DEFAULT AI PROMPT — edit this to change what the AI writes          ║
                // ║                                                                      ║
                // ║  This runs when shoutoutPrompt global var is NOT set.                ║
                // ║  The text here is the instruction sent to the AI.                    ║
                // ║  The AI then writes the actual chat message based on it.             ║
                // ║                                                                      ║
                // ║  Variables you can use anywhere in the prompt:                      ║
                // ║    {name}    → HexEchoTV          {game}   → Phasmophobia           ║
                // ║    {link}    → twitch.tv/...       {title}  → their stream title     ║
                // ║    {bio}     → channel description {tags}   → channel tags           ║
                // ║    {badge}   → Partner/Affiliate   {status} → LIVE or offline        ║
                // ║    {age}     → "3 years"           {since}  → "January 2021"         ║
                // ║    {by}      → who ran !so         {today}  → today's date           ║
                // ║                                                                      ║
                // ║  Example prompts you could paste in:                                 ║
                // ║    "Roast {name} for playing {game} then tell chat to go to {link}"  ║
                // ║    "Write a movie trailer voice-over for {name}'s {game} stream.     ║
                // ║     Include {link}. Under 200 chars."                                ║
                // ║    "Give a shoutout to {name} and include a real fun fact about      ║
                // ║     the game {game}. End with {link}."                               ║
                // ╚══════════════════════════════════════════════════════════════════════╝
                string bioSnip   = bio.Length > 100   ? bio.Substring(0, 100) + "..." : bio;
                string titleLine = !string.IsNullOrEmpty(title) ? $"Their title: \"{title}\". " : "";
                string liveLine  = status == "LIVE"             ? "They are LIVE right now! "   : "";

                userPrompt =
                    // ↓↓↓ EDIT FROM HERE ↓↓↓
                    $"Write a shoutout for {name} who plays {game}. " +
                    $"Include something funny or interesting specifically about the game {game} " +
                    $"— a joke, a fun fact, or something that captures what kind of game it is. " +
                    $"{(string.IsNullOrEmpty(bioSnip) ? "" : $"Channel vibe: \"{bioSnip}\". ")}" +
                    $"{titleLine}{liveLine}" +
                    $"End with their Twitch link: {link}. " +
                    $"Under 200 characters total. No quotation marks.";
                    // ↑↑↑ EDIT TO HERE ↑↑↑
            }

            // Call Groq
            string reqBody =
                "{" +
                    $"\"model\":\"{Escape(model)}\"," +
                    "\"messages\":[" +
                        $"{{\"role\":\"system\",\"content\":\"{Escape(systemPrompt)}\"}}," +
                        $"{{\"role\":\"user\",\"content\":\"{Escape(userPrompt)}\"}}" +
                    "]," +
                    "\"max_tokens\":70," +
                    "\"temperature\":0.9" +
                "}";

            string respBody;
            using (var wc = new WebClient())
            {
                wc.Headers.Add("Content-Type", "application/json");
                wc.Headers.Add("Authorization", $"Bearer {apiKey}");
                respBody = wc.UploadString("https://api.groq.com/openai/v1/chat/completions", "POST", reqBody);
            }

            var m = Regex.Match(respBody, "\"content\":\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");
            if (!m.Success) { CPH.LogWarn($"[AI Shoutout] Could not parse response: {respBody}"); return null; }

            string text = m.Groups[1].Value
                .Replace("\\n", " ").Replace("\\r", "")
                .Replace("\\\"", "\"").Replace("\\\\", "\\")
                .Trim();

            return text.Length > 200 ? text.Substring(0, 197) + "..." : text;
        }
        catch (Exception ex) { CPH.LogError($"[AI Shoutout] GenerateShoutout: {ex.Message}"); return null; }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  STYLES — change shoutoutStyle global var to switch instantly
    //
    //  hype          "YO CHAT go check out HexEchoTV hunting ghosts in Phasmophobia!
    //                 twitch.tv/hexechotv"
    //
    //  funny         "HexEchoTV plays Phasmophobia — paying money to get scared by
    //                 a flashlight. Legend. twitch.tv/hexechotv"
    //
    //  chill         "hey if you're into horror games hexechotv plays phasmophobia
    //                 and is actually solid. twitch.tv/hexechotv"
    //
    //  chaotic       "hexechotv is OUT HERE LOSING THEIR MIND at phasmophobia ghosts
    //                 and we love to see it twitch.tv/hexechotv"
    //
    //  professional  "I recommend checking out HexEchoTV, who streams Phasmophobia
    //                 at twitch.tv/hexechotv"
    // ════════════════════════════════════════════════════════════════════════════

    private string GetStyle(string style)
    {
        switch ((style ?? "hype").Trim().ToLower())
        {
            case "funny":        return "Be funny. Include a pun or a joke specifically about the game they play.";
            case "chill":        return "Be laid-back. No exclamation marks, no caps. Like a friend quietly recommending someone.";
            case "chaotic":      return "Be chaotic and unhinged. Meme energy. Unpredictable but still include the link.";
            case "professional": return "Be clean and professional. No slang or caps. Like a formal press mention.";
            default:             return "Be EXTREMELY hype. Big energy. Caps on key words. Make them sound unmissable.";
        }
    }

    // ════════════════════════════════════════════════════════════════════════════
    //  DISCORD LOGGING
    // ════════════════════════════════════════════════════════════════════════════

    private const int C_OK = 5763719, C_WARN = 16705372, C_ERR = 15548997, C_CMD = 10181046;

    private void LogCommand(string cmd, string user, string detail = "")
    {
        string msg = $"**User:** {user}";
        if (!string.IsNullOrEmpty(detail)) msg += $"\n**Details:** {detail}";
        Discord($"Command: {cmd}", msg, C_CMD, "COMMAND");
    }
    private void LogSuccess(string t, string m) => Discord(t, m, C_OK,   "SUCCESS");
    private void LogWarning(string t, string m) => Discord(t, m, C_WARN, "WARNING");
    private void LogError(string t, string m)   => Discord(t, m, C_ERR,  "ERROR");

    private void Discord(string title, string desc, int color, string footer)
    {
        try
        {
            if (!CPH.GetGlobalVar<bool>("discordLoggingEnabled", true)) return;
            string url = CPH.GetGlobalVar<string>("discordLogWebhook", true);
            if (string.IsNullOrEmpty(url)) return;
            string json =
                "{\"embeds\":[{" +
                $"\"title\":\"{Escape(title)}\"," +
                $"\"description\":\"{Escape(desc)}\"," +
                $"\"color\":{color}," +
                $"\"timestamp\":\"{DateTime.UtcNow:o}\"," +
                $"\"footer\":{{\"text\":\"{Escape(footer)} | HexEchoTV Logging System\"}}" +
                "}]}";
            using (var wc = new WebClient())
            { wc.Headers.Add("Content-Type", "application/json"); wc.UploadString(url, "POST", json); }
        }
        catch { }
    }

    private string Escape(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"")
                .Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t");
    }

    private string Unescape(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\\"", "\"").Replace("\\\\", "\\")
                .Replace("\\n", "\n").Replace("\\r", "").Replace("\\t", "\t");
    }
}
