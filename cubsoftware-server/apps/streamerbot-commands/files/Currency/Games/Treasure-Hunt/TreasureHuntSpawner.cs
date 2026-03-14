// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)
//
// Setup: Create a timed action in StreamerBot to run this every 5-15 minutes
// Users claim with !loot command (see TreasureHuntClaim.cs)

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

            // Check if loot is already active (not claimed yet)
            bool lootActive = CPH.GetGlobalVar<bool>("treasure_loot_active", true);
            if (lootActive)
            {
                LogInfo("Treasure Hunt Skip", "Loot already active, skipping spawn");
                CPH.LogInfo("Treasure loot already active, skipping spawn");
                return false;
            }

            // Random chance to spawn (50% by default)
            Random random = new Random();
            int spawnChance = random.Next(1, 101);
            if (spawnChance > 50) // 50% chance to spawn
            {
                LogInfo("Treasure Hunt No Spawn", "Did not spawn this time");
                CPH.LogInfo("Treasure loot did not spawn this time");
                return false;
            }

            // Determine rarity and reward
            int rarityRoll = random.Next(1, 101);
            string rarity;
            int minReward;
            int maxReward;
            string emoji;

            if (rarityRoll <= 3) // 3% Legendary
            {
                rarity = "LEGENDARY";
                minReward = 500;
                maxReward = 1000;
                emoji = "💎";
            }
            else if (rarityRoll <= 15) // 12% Epic (3 + 12 = 15)
            {
                rarity = "EPIC";
                minReward = 150;
                maxReward = 300;
                emoji = "🔮";
            }
            else if (rarityRoll <= 40) // 25% Rare (15 + 25 = 40)
            {
                rarity = "RARE";
                minReward = 50;
                maxReward = 150;
                emoji = "✨";
            }
            else // 60% Common
            {
                rarity = "COMMON";
                minReward = 10;
                maxReward = 50;
                emoji = "📦";
            }

            // Calculate reward
            int reward = random.Next(minReward, maxReward + 1);

            // Store loot data in global variables
            CPH.SetGlobalVar("treasure_loot_active", true, true);
            CPH.SetGlobalVar("treasure_loot_reward", reward, true);
            CPH.SetGlobalVar("treasure_loot_rarity", rarity, true);
            CPH.SetGlobalVar("treasure_loot_emoji", emoji, true);
            CPH.SetGlobalVar("treasure_loot_spawn_time", DateTime.UtcNow.ToString("o"), true);

            LogSuccess("Treasure Hunt Spawned",
                $"**Rarity:** {rarity}\n" +
                $"**Reward:** {reward} {currencyName}\n" +
                $"**Emoji:** {emoji}");

            // Announce in chat
            CPH.SendMessage($"{emoji} {rarity} TREASURE appeared! Type !loot to claim ${reward} {currencyName}! {emoji}");

            CPH.LogInfo($"Treasure Hunt: Spawned {rarity} loot worth {reward} coins");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Treasure Hunt Spawner Exception",
                $"**Error:** {ex.Message}\n" +
                $"**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"TreasureHuntSpawner error: {ex.Message}");
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


