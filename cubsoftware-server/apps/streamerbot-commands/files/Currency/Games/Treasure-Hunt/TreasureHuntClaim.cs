// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)
// - TreasureHuntSpawner.cs (must be set up to spawn treasure)

using System;
using System.Text;

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // Load configuration
            string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
            string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);

            // Get required arguments with error handling
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("TreasureHunt command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("TreasureHunt command: Missing 'userId' argument");
                return false;
            }

            // Log command execution
            LogCommand("!loot", user);

            // Check if loot is active
            bool lootActive = CPH.GetGlobalVar<bool>("treasure_loot_active", true);
            if (!lootActive)
            {
                LogWarning("Treasure Hunt - No Loot", $"**User:** {user}\n**Reason:** No treasure available");
                CPH.SendMessage($"{user}, there's no treasure available right now! Wait for the next spawn.");
                return false;
            }

            // Check for timeout
            int timeoutSeconds = CPH.GetGlobalVar<int>("config_game_inactivity_timeout", true);
            if (timeoutSeconds == 0) timeoutSeconds = 60;

            string spawnTimeStr = CPH.GetGlobalVar<string>("treasure_loot_spawn_time", true);
            if (!string.IsNullOrEmpty(spawnTimeStr))
            {
                DateTime spawnTime = DateTime.Parse(spawnTimeStr);
                TimeSpan elapsed = DateTime.UtcNow - spawnTime;

                if (elapsed.TotalSeconds > timeoutSeconds)
                {
                    // Treasure timed out
                    CPH.SendMessage($"⏱️ The treasure despawned after {timeoutSeconds} seconds! No one claimed it in time.");
                    LogWarning("Treasure Hunt Timeout", $"**Idle Time:** {elapsed.TotalSeconds:F1} seconds");

                    // Clear treasure state
                    CPH.SetGlobalVar("treasure_loot_active", false, true);
                    return false;
                }
            }

            // Get loot details
            int reward = CPH.GetGlobalVar<int>("treasure_loot_reward", true);
            string rarity = CPH.GetGlobalVar<string>("treasure_loot_rarity", true);
            string emoji = CPH.GetGlobalVar<string>("treasure_loot_emoji", true);

            // Award the reward
            int currentBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            int newBalance = currentBalance + reward;
            CPH.SetTwitchUserVarById(userId, currencyKey, newBalance, true);

            // Deactivate loot
            CPH.SetGlobalVar("treasure_loot_active", false, true);

            // Track stats (optional)
            int totalLoots = CPH.GetTwitchUserVarById<int>(userId, "treasure_loots_claimed", true);
            totalLoots++;
            CPH.SetTwitchUserVarById(userId, "treasure_loots_claimed", totalLoots, true);

            LogSuccess("Treasure Hunt Claimed",
                $"**User:** {user}\n" +
                $"**Rarity:** {rarity}\n" +
                $"**Reward:** {reward} {currencyName}\n" +
                $"**New Balance:** {newBalance}\n" +
                $"**Total Loots:** {totalLoots}");

            // Announce winner
            CPH.SendMessage($"{emoji} {user} claimed the {rarity} treasure and found ${reward} {currencyName}! Balance: ${newBalance} {emoji}");

            CPH.LogInfo($"Treasure Hunt: {user} claimed {rarity} loot worth {reward} coins");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Treasure Hunt Claim Exception",
                $"**Error:** {ex.Message}\n" +
                $"**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"TreasureHuntClaim error: {ex.Message}");
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


