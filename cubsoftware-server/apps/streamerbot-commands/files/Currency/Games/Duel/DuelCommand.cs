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
            int minBet = CPH.GetGlobalVar<int>("config_duel_min_bet", true);
            int maxBet = CPH.GetGlobalVar<int>("config_duel_max_bet", true);

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Duel command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Duel command: Missing 'userId' argument");
                return false;
            }

            // Get target user
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
                CPH.SendMessage($"{user}, who do you want to duel? Usage: !duel @username {minBet}-{maxBet}");
                return false;
            }

            // Get bet amount
            int betAmount = 0;
            if (CPH.TryGetArg("input1", out string input1) && !string.IsNullOrEmpty(input1))
            {
                if (!int.TryParse(input1, out betAmount))
                {
                    CPH.SendMessage($"{user}, invalid bet amount! Usage: !duel @username {minBet}-{maxBet}");
                    return false;
                }
            }
            else
            {
                CPH.SendMessage($"{user}, specify your bet! Usage: !duel @username {minBet}-{maxBet}");
                return false;
            }

            // Validate bet
            if (betAmount < minBet || betAmount > maxBet)
            {
                CPH.SendMessage($"{user}, bet must be between {minBet} and {maxBet} {currencyName}!");
                return false;
            }

            // Remove @ symbol
            targetUser = targetUser.Replace("@", "").Trim().ToLower();

            // Get target user info
            var targetUserInfo = CPH.TwitchGetExtendedUserInfoByLogin(targetUser);
            if (targetUserInfo == null)
            {
                CPH.SendMessage($"{user}, could not find user: {targetUser}");
                return false;
            }

            string targetUserId = targetUserInfo.UserId;

            // Can't duel yourself
            if (userId == targetUserId)
            {
                CPH.SendMessage($"{user}, you can't duel yourself!");
                return false;
            }

            // Log command execution
            LogCommand("!duel", user, $"Target: {targetUser} | Bet: ${betAmount}");

            // Cooldown check
            int cooldownSeconds = CPH.GetGlobalVar<int>("config_duel_cooldown_seconds", true);
            if (cooldownSeconds == 0) cooldownSeconds = 30;

            string lastPlayedStr = CPH.GetTwitchUserVarById<string>(userId, "duel_last_played", true);
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

                    CPH.SendMessage($"{user}, duel cooldown! Wait {timeLeft} before playing again.");
                    LogWarning("Duel Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                    return false;
                }
            }

            // Check challenger's balance
            int challengerBalance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

            if (challengerBalance < betAmount)
            {
                // Log insufficient funds
                LogWarning("Duel Insufficient Funds - Challenger",
                    $"**Challenger:** {user}\n**Target:** {targetUser}\n**Bet:** ${betAmount}\n**Balance:** ${challengerBalance}");

                CPH.SendMessage($"{user}, you only have ${challengerBalance} {currencyName}! You need ${betAmount}.");
                return false;
            }

            // Check opponent's balance
            int opponentBalance = CPH.GetTwitchUserVarById<int>(targetUserId, currencyKey, true);

            if (opponentBalance < betAmount)
            {
                // Log insufficient funds - opponent
                LogWarning("Duel Insufficient Funds - Opponent",
                    $"**Challenger:** {user}\n**Opponent:** {targetUser}\n**Bet:** ${betAmount}\n**Opponent Balance:** ${opponentBalance}");

                CPH.SendMessage($"{user}, {targetUser} only has ${opponentBalance} {currencyName}! They can't match your ${betAmount} bet.");
                return false;
            }

            // Deduct bets from both
            challengerBalance -= betAmount;
            opponentBalance -= betAmount;

            CPH.SetTwitchUserVarById(userId, currencyKey, challengerBalance, true);
            CPH.SetTwitchUserVarById(targetUserId, currencyKey, opponentBalance, true);

            // Battle!
            Random random = new Random();
            int challengerRoll = random.Next(1, 101);
            int opponentRoll = random.Next(1, 101);

            string winner;
            string loser;
            string winnerId;
            int winnerBalance;
            int winnings = betAmount * 2;

            if (challengerRoll > opponentRoll)
            {
                winner = user;
                loser = targetUser;
                winnerId = userId;
                winnerBalance = challengerBalance + winnings;
            }
            else if (opponentRoll > challengerRoll)
            {
                winner = targetUser;
                loser = user;
                winnerId = targetUserId;
                winnerBalance = opponentBalance + winnings;
            }
            else
            {
                // Tie! Return bets
                CPH.SetTwitchUserVarById(userId, currencyKey, challengerBalance + betAmount, true);
                CPH.SetTwitchUserVarById(targetUserId, currencyKey, opponentBalance + betAmount, true);

                // Set cooldown timestamp for both players
                CPH.SetTwitchUserVarById(userId, "duel_last_played", DateTime.UtcNow.ToString("o"), true);
                CPH.SetTwitchUserVarById(targetUserId, "duel_last_played", DateTime.UtcNow.ToString("o"), true);

                // Log tie
                LogInfo("Duel Tie",
                    $"**Challenger:** {user} ({challengerRoll})\n**Opponent:** {targetUser} ({opponentRoll})\n**Bet:** ${betAmount}\n**Result:** Tie - Bets returned");

                CPH.SendMessage($"⚔️ {user} ({challengerRoll}) vs {targetUser} ({opponentRoll}) - IT'S A TIE! Bets returned.");
                return true;
            }

            // Award winner
            CPH.SetTwitchUserVarById(winnerId, currencyKey, winnerBalance, true);

            // Set cooldown timestamp for both players
            CPH.SetTwitchUserVarById(userId, "duel_last_played", DateTime.UtcNow.ToString("o"), true);
            CPH.SetTwitchUserVarById(targetUserId, "duel_last_played", DateTime.UtcNow.ToString("o"), true);

            // Log duel result
            LogSuccess("Duel Complete",
                $"**Challenger:** {user} ({challengerRoll})\n**Opponent:** {targetUser} ({opponentRoll})\n**Winner:** {winner}\n**Loser:** {loser}\n**Winnings:** ${winnings}");

            CPH.SendMessage($"⚔️ {user} ({challengerRoll}) vs {targetUser} ({opponentRoll}) - {winner} WINS ${winnings} {currencyName}!");

            return true;
        }
        catch (Exception ex)
        {
            // Log error with exception details
            LogError("Duel Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during duel");
            CPH.LogError($"Duel error: {ex.Message}");
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
