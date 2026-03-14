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
    private const int TICKET_COST = 10;

    public bool Execute()
    {
        try
        {
            // Load configuration from global variables
            string currencyName = CPH.GetGlobalVar<string>("config_currency_name", true);
            string currencyKey = CPH.GetGlobalVar<string>("config_currency_key", true);
            int minBet = CPH.GetGlobalVar<int>("config_lottery_min_bet", true);
            int maxBet = CPH.GetGlobalVar<int>("config_lottery_max_bet", true);
            int jackpotMult = CPH.GetGlobalVar<int>("config_lottery_jackpot_mult", true);

            // Get required arguments
            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Lottery command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Lottery command: Missing 'userId' argument");
                return false;
            }

            // Cooldown check
            int cooldownSeconds = CPH.GetGlobalVar<int>("config_lottery_cooldown_seconds", true);
            if (cooldownSeconds == 0) cooldownSeconds = 20;

            string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "lottery_last_played", true);
            if (!string.IsNullOrEmpty(lastPlayedStr))
            {
                DateTime lastPlayed = DateTime.Parse(lastPlayedStr);
                DateTime nextAvailable = lastPlayed.AddSeconds(cooldownSeconds);
                DateTime now = DateTime.UtcNow;

                if (now < nextAvailable)
                {
                    TimeSpan remaining = nextAvailable - now;
                    string timeLeft = remaining.TotalSeconds < 60
                        ? $"{(int)remaining.TotalSeconds}s"
                        : $"{remaining.Minutes}m {remaining.Seconds}s";

                    CPH.SendMessage($"{user}, lottery cooldown! Wait {timeLeft} before playing again.");
                    LogWarning("Lottery Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                    return false;
                }
            }

            // Log command execution
            LogCommand("!lottery", user);

            // Check balance
            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (balance < TICKET_COST)
            {
                LogWarning("Lottery - Insufficient Balance", $"**User:** {user}\n**Balance:** {balance}\n**Required:** {TICKET_COST}");
                CPH.SendMessage($"{user}, lottery tickets cost ${TICKET_COST} {currencyName}! You have ${balance}.");
                return false;
            }

            // Buy ticket
            balance -= TICKET_COST;
            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

            // Set cooldown timestamp
            CPH.SetTwitchUserVarById(userId, "lottery_last_played", DateTime.UtcNow.ToString("o"), true);

            // Draw lottery
            Random random = new Random();
            int roll = random.Next(1, 101);

            string prize;
            int winnings = 0;

            if (roll == 1)
            {
                prize = "JACKPOT";
                winnings = 5000;
            }
            else if (roll <= 5)
            {
                prize = "BIG WIN";
                winnings = 1000;
            }
            else if (roll <= 15)
            {
                prize = "WIN";
                winnings = 300;
            }
            else if (roll <= 35)
            {
                prize = "SMALL WIN";
                winnings = 150;
            }
            else
            {
                prize = "LOSE";
                winnings = 0;
            }

            if (winnings > 0)
            {
                balance += winnings;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);
                LogSuccess("Lottery Win",
                    $"**User:** {user}\n**Prize:** {prize}\n**Winnings:** {winnings} {currencyName}\n**New Balance:** {balance}");
                CPH.SendMessage($"🎫 {user} won the lottery! Prize: {prize} - ${winnings} {currencyName}! Balance: ${balance}");
            }
            else
            {
                LogInfo("Lottery Loss", $"**User:** {user}\n**Balance:** {balance}");
                CPH.SendMessage($"🎫 {user} didn't win. Better luck next time! Balance: ${balance}");
            }

            return true;
        }
        catch (Exception ex)
        {
            LogError("Lottery Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");
            CPH.LogError($"Lottery error: {ex.Message}");
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
