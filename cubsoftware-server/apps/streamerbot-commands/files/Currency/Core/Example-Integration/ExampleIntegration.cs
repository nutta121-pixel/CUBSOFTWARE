// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: ConfigSetup.cs

using System;
using System.Text;

// ===== EXAMPLE: HOW TO INTEGRATE THE CURRENCY SYSTEM INTO YOUR COMMANDS =====
// This file shows examples of how to add, remove, and check currency in any command
// Copy the relevant code snippets into your own commands

public class CPHInline
{
    public bool Execute()
    {
        try
        {
            // ============================================
            // STEP 1: Load configuration from global variables
            // ============================================
            string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
            string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);

            // Get the user who ran the command
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Example Integration: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Example Integration: Missing 'userId' argument");
                return false;
            }

            // ============================================
            // EXAMPLE 1: Check user's balance
            // ============================================
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            CPH.SendMessage($"{user} has ${balance} {currencyName}");

            // ============================================
            // EXAMPLE 2: Give coins to user (for earning commands like !work, !mine, etc.)
            // ============================================
            int coinsToGive = 50;
            int currentBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
            int newBalance = currentBalance + coinsToGive;
            CPH.SetTwitchUserVarById(userId, currencyKey, newBalance, true);
            CPH.SendMessage($"{user} earned ${coinsToGive} {currencyName}! New balance: ${newBalance}");

            // Log to Discord
            LogSuccess("Coins Earned", $"{user} earned ${coinsToGive}. New balance: ${newBalance}");

            // ============================================
            // EXAMPLE 3: Take coins from user (for shop/gambling commands)
            // ============================================
            int cost = 100;
            currentBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (currentBalance < cost)
            {
                CPH.SendMessage($"{user}, you need ${cost} {currencyName} but only have ${currentBalance}!");
                LogWarning("Insufficient Funds", $"{user} tried to spend ${cost} but only has ${currentBalance}");
                return false; // Not enough coins
            }

            // Deduct coins
            newBalance = currentBalance - cost;
            CPH.SetTwitchUserVarById(userId, currencyKey, newBalance, true);
            CPH.SendMessage($"{user} spent ${cost} {currencyName}! Remaining: ${newBalance}");

            LogSuccess("Coins Spent", $"{user} spent ${cost}. Remaining: ${newBalance}");

            // ============================================
            // EXAMPLE 4: Simple check if user has enough
            // ============================================
            int requiredAmount = 200;
            currentBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (currentBalance >= requiredAmount)
            {
                CPH.SendMessage($"{user} has enough {currencyName}!");
            }
            else
            {
                int needed = requiredAmount - currentBalance;
                CPH.SendMessage($"{user} needs ${needed} more {currencyName}!");
            }

            // ============================================
            // EXAMPLE 5: Gambling/Random reward with proper logging
            // ============================================
            int betAmount = 50;
            currentBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (currentBalance < betAmount)
            {
                CPH.SendMessage($"{user}, you need ${betAmount} {currencyName} to gamble!");
                LogWarning("Insufficient Bet Amount", $"{user} needs ${betAmount} but has ${currentBalance}");
                return false;
            }

            // Deduct bet
            currentBalance -= betAmount;
            CPH.SetTwitchUserVarById(userId, currencyKey, currentBalance, true);

            // 50/50 chance
            Random random = new Random();
            bool won = random.Next(0, 2) == 1;

            if (won)
            {
                int winnings = betAmount * 2;
                int finalBalance = currentBalance + winnings;
                CPH.SetTwitchUserVarById(userId, currencyKey, finalBalance, true);
                CPH.SendMessage($"{user} won ${winnings} {currencyName}! New balance: ${finalBalance}");
                LogSuccess("Gamble Won", $"{user} bet ${betAmount} and won ${winnings}. Balance: ${finalBalance}");
            }
            else
            {
                CPH.SendMessage($"{user} lost ${betAmount} {currencyName}! New balance: ${currentBalance}");
                LogInfo("Gamble Lost", $"{user} bet ${betAmount} and lost. Balance: ${currentBalance}");
            }

            // ============================================
            // EXAMPLE 6: Using cooldowns (for commands with time restrictions)
            // ============================================
            string cooldownKey = "example_lastuse";
            string lastUseStr = CPH.GetTwitchUserVarById<string>(userId, cooldownKey, true);

            DateTime now = DateTime.UtcNow;
            int cooldownMinutes = 30; // Example: 30 minute cooldown

            if (!string.IsNullOrEmpty(lastUseStr))
            {
                DateTime lastUse = DateTime.Parse(lastUseStr).ToUniversalTime();
                TimeSpan timeSince = now - lastUse;

                if (timeSince.TotalMinutes < cooldownMinutes)
                {
                    TimeSpan timeLeft = TimeSpan.FromMinutes(cooldownMinutes) - timeSince;
                    int hoursLeft = (int)timeLeft.TotalHours;
                    int minutesLeft = timeLeft.Minutes;

                    CPH.SendMessage($"{user}, you must wait {hoursLeft}h {minutesLeft}m before using this command again!");
                    return false;
                }
            }

            // Update last use time
            CPH.SetTwitchUserVarById(userId, cooldownKey, now.ToString("o"), true);
            CPH.SendMessage($"{user} used the command successfully!");

            // ============================================
            // EXAMPLE 7: Counter tracking (like daily streaks, usage counts)
            // ============================================
            string counterKey = "example_usecount";
            int useCount = CPH.GetTwitchUserVarById<int>(userId, counterKey, true);
            useCount++;
            CPH.SetTwitchUserVarById(userId, counterKey, useCount, true);
            CPH.SendMessage($"{user} has used this command {useCount} times!");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Example Integration Error", $"Error: {ex.Message}");
            CPH.LogError($"Example integration error: {ex.Message}");
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

    private void LogCommand(string command, string user, string details = "")
    {
        string message = $"**User:** {user}";
        if (!string.IsNullOrEmpty(details))
            message += $"\n**Details:** {details}";
        SendToDiscord($"Command: {command}", message, COLOR_COMMAND, "COMMAND");
    }

    private void SendToDiscord(string title, string message, int color, string footerText)
    {
        try
        {
            // Check if Discord logging is enabled
            bool loggingEnabled = CPH.GetGlobalVar<bool>("discordLoggingEnabled", true);
            if (!loggingEnabled)
                return;

            string webhookUrl = CPH.GetGlobalVar<string>("discordLogWebhook", true);

            if (string.IsNullOrEmpty(webhookUrl))
                return;

            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                client.Headers.Add("Content-Type", "application/json");

                StringBuilder json = new StringBuilder();
                json.Append("{\"embeds\":[{");
                json.Append($"\"title\":\"{EscapeJson(title)}\",");
                json.Append($"\"description\":\"{EscapeJson(message)}\",");
                json.Append($"\"color\":{color},");
                json.Append($"\"timestamp\":\"{DateTime.UtcNow:o}\",");
                json.Append($"\"footer\":{{\"text\":\"{footerText} | HexEchoTV Currency System\"}}");
                json.Append("}]}");

                client.UploadString(webhookUrl, "POST", json.ToString());
            }
        }
        catch (Exception ex)
        {
            CPH.LogError($"Discord webhook error: {ex.Message}");
        }
    }

    private string EscapeJson(string text)
    {
        if (string.IsNullOrEmpty(text))
            return "";

        return text
            .Replace("\\", "\\\\")
            .Replace("\"", "\\\"")
            .Replace("\n", "\\n")
            .Replace("\r", "\\r")
            .Replace("\t", "\\t");
    }
}
