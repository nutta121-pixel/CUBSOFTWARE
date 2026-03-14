// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)

using System;
using System.Net;
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
            int minBet = CPH.GetGlobalVar<int>("config_crash_min_bet", true);
            int maxBet = CPH.GetGlobalVar<int>("config_crash_max_bet", true);
            int maxMult = CPH.GetGlobalVar<int>("config_crash_max_mult", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Crash command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Crash command: Missing 'userId' argument");
                return false;
            }

            // Cooldown check
            int cooldownSeconds = CPH.GetGlobalVar<int>("config_crash_cooldown_seconds", true);
            if (cooldownSeconds == 0) cooldownSeconds = 25;

            string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "crash_last_played", true);
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

                    CPH.SendMessage($"{user}, crash cooldown! Wait {timeLeft} before playing again.");
                    LogWarning("Crash Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                    return false;
                }
            }

            int betAmount = 0;
            if (CPH.TryGetArg("input0", out string input0) && int.TryParse(input0, out betAmount))
            {
                if (betAmount < minBet || betAmount > maxBet)
                {
                    CPH.SendMessage($"{user}, bet {minBet}-{maxBet} coins!");
                    return false;
                }
            }
            else
            {
                CPH.SendMessage($"{user}, usage: !crash {minBet}-{maxBet}");
                return false;
            }

            // Log command execution
            LogCommand("!crash", user, $"Bet: ${betAmount}");

            int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (balance < betAmount)
            {
                // Log insufficient funds
                LogWarning("Crash Insufficient Funds",
                    $"**User:** {user}\n**Bet:** ${betAmount}\n**Balance:** ${balance}");

                CPH.SendMessage($"{user}, you need ${betAmount} coins!");
                return false;
            }

            balance -= betAmount;

            Random random = new Random(Guid.NewGuid().GetHashCode());

            // Simplified crash point generation with clear house edge
            // Weighted toward lower multipliers, but winnable
            double crashRoll = random.NextDouble();
            double crashPoint;

            if (crashRoll < 0.30)  // 30% chance: crash between 1.0x-2.0x (very early - instant loss for greedy)
            {
                crashPoint = 1.0 + (random.NextDouble() * 1.0);
            }
            else if (crashRoll < 0.55)  // 25% chance: crash between 2.0x-4.0x (early-medium)
            {
                crashPoint = 2.0 + (random.NextDouble() * 2.0);
            }
            else if (crashRoll < 0.80)  // 25% chance: crash between 4.0x-7.0x (medium-high)
            {
                crashPoint = 4.0 + (random.NextDouble() * 3.0);
            }
            else  // 20% chance: crash between 7.0x-maxMult (high/jackpot)
            {
                double safeMax = Math.Max(7.0, maxMult);
                crashPoint = 7.0 + (random.NextDouble() * (safeMax - 7.0));
            }

            // Generate cash-out attempt with slight house edge
            // House edge: ~10-15% (players win 45% of the time)
            double cashOutRoll = random.NextDouble();
            double cashOutAttempt;

            if (cashOutRoll < 0.35)  // 35% chance: very safe (1.3x-2.2x) - high win rate
            {
                cashOutAttempt = 1.3 + (random.NextDouble() * 0.9);
            }
            else if (cashOutRoll < 0.65)  // 30% chance: safe-moderate (2.2x-4.5x) - decent win rate
            {
                cashOutAttempt = 2.2 + (random.NextDouble() * 2.3);
            }
            else if (cashOutRoll < 0.85)  // 20% chance: risky (4.5x-7.5x) - lower win rate
            {
                cashOutAttempt = 4.5 + (random.NextDouble() * 3.0);
            }
            else  // 15% chance: very risky (7.5x-maxMult) - very low win rate
            {
                double safeMax = Math.Max(7.5, maxMult);
                cashOutAttempt = 7.5 + (random.NextDouble() * (safeMax - 7.5));
            }

            // Game explanation message
            CPH.SendMessage($"🎮 {user} bet ${betAmount} | Attempting to cash out at {cashOutAttempt:F2}x...");
            CPH.Wait(1500); // Suspense delay

            if (cashOutAttempt > crashPoint)
            {
                // Lost - tried to cash out AFTER crash point
                LogWarning("Crash Game Lost",
                    $"**User:** {user}\n**Bet:** ${betAmount}\n**Crash Point:** {crashPoint:F2}x\n**Your Cash-Out Attempt:** {cashOutAttempt:F2}x\n**Result:** Game crashed before you could cash out\n**Loss:** ${betAmount}\n**New Balance:** ${balance}");

                CPH.SendMessage($"💥 CRASH! | Crash Point: {crashPoint:F2}x | Your Cash-Out: {cashOutAttempt:F2}x | Game crashed BEFORE you cashed out - Too greedy! Lost ${betAmount} {currencyName}. Balance: ${balance}");
            }
            else
            {
                // Won - cashed out BEFORE crash point
                int winnings = (int)(betAmount * cashOutAttempt);
                balance += winnings;
                int profit = winnings - betAmount;

                LogSuccess("Crash Game Win",
                    $"**User:** {user}\n**Bet:** ${betAmount}\n**Your Cash-Out:** {cashOutAttempt:F2}x\n**Crash Point:** {crashPoint:F2}x\n**Result:** Successfully cashed out before crash\n**Profit:** ${profit}\n**Total Won:** ${winnings}\n**New Balance:** ${balance}");

                CPH.SendMessage($"✅ SUCCESS! | Your Cash-Out: {cashOutAttempt:F2}x | Crash Point: {crashPoint:F2}x | Cashed out BEFORE crash! Won ${winnings} {currencyName} (+${profit} profit)! Balance: ${balance}");
            }

            CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

            // Set cooldown timestamp
            CPH.SetTwitchUserVarById(userId, "crash_last_played", DateTime.UtcNow.ToString("o"), true);

            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Crash Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during crash game");
            CPH.LogError($"Crash error: {ex.Message}");
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

            // Get webhook URL from global variable (set in ConfigSetup.cs)
            string webhookUrl = CPH.GetGlobalVar<string>("discordLogWebhook", true);

            if (string.IsNullOrEmpty(webhookUrl))
            {
                CPH.LogWarn("Discord webhook not configured. Run ConfigSetup.cs first.");
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
            CPH.LogError($"DiscordLogger error: {ex.Message}");
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
