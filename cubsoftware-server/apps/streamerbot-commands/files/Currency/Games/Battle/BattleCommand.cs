// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)

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
            int minBet = CPH.GetGlobalVar<int>("config_battle_min_bet", true);
            int maxBet = CPH.GetGlobalVar<int>("config_battle_max_bet", true);
            int winMult = CPH.GetGlobalVar<int>("config_battle_win_mult", true);
            int cooldownMinutes = CPH.GetGlobalVar<int>("config_battle_cooldown_minutes", true);

            // Get required args
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Battle command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Battle command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!battle", user);

            string lastBattleStr = CPH.GetTwitchUserVarById<string>(userId, "battle_cooldown", true);

            DateTime now = DateTime.UtcNow;
            DateTime lastBattle = DateTime.MinValue;

            if (!string.IsNullOrEmpty(lastBattleStr))
            {
                try { lastBattle = DateTime.Parse(lastBattleStr).ToUniversalTime(); }
                catch { lastBattle = DateTime.MinValue; }
            }

            TimeSpan timeSinceBattle = now - lastBattle;

            if (timeSinceBattle.TotalMinutes < cooldownMinutes)
            {
                TimeSpan remaining = TimeSpan.FromMinutes(cooldownMinutes) - timeSinceBattle;
                int minutesLeft = (int)remaining.TotalMinutes;
                int secondsLeft = remaining.Seconds;

                // Log cooldown warning
                LogWarning("Battle Cooldown Active",
                    $"**User:** {user}\n**Time Left:** {minutesLeft}m {secondsLeft}s");

                CPH.SendMessage($"{user}, rest before next battle! Wait {minutesLeft}m {secondsLeft}s.");
                return false;
            }

            string[] monsters = { "🐉 Dragon", "👹 Goblin", "👻 Ghost", "🧟 Zombie", "🦇 Bat", "🕷️ Spider" };
            int[] rewards = { 180, 100, 90, 70, 50, 35 };

            Random random = new Random();
            bool won = random.Next(1, 101) <= 50; // Default 50% win chance

            if (won)
            {
                int monsterIndex = random.Next(monsters.Length);
                string monster = monsters[monsterIndex];
                int reward = rewards[monsterIndex];

                int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
                balance += reward;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                // Log success
                LogSuccess("Battle Won",
                    $"**User:** {user}\n**Monster:** {monster}\n**Reward:** ${reward}\n**New Balance:** ${balance}");

                CPH.SendMessage($"⚔️ {user} defeated a {monster} and earned ${reward} {currencyName}! Balance: ${balance}");
            }
            else
            {
                // Log loss
                LogWarning("Battle Lost",
                    $"**User:** {user}\n**Result:** Defeated in battle");

                CPH.SendMessage($"💀 {user} was defeated in battle! Try again later!");
            }

            CPH.SetTwitchUserVarById(userId, "battle_cooldown", now.ToString("o"), true);
            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Battle Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during battle");
            CPH.LogError($"Battle error: {ex.Message}");
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
