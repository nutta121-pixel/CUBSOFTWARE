// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)

using System;
using System.Collections.Generic;
using System.Linq;
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
            int gameCost = CPH.GetGlobalVar<int>("config_wordle_cost", true);
            int winReward = CPH.GetGlobalVar<int>("config_wordle_win_reward", true);
            int maxGuesses = CPH.GetGlobalVar<int>("config_wordle_max_guesses", true);
            if (maxGuesses == 0) maxGuesses = 6;

            string sheetUrl = CPH.GetGlobalVar<string>("config_wordle_sheet_url", true);

            // Load OBS configuration
            string obsScene = CPH.GetGlobalVar<string>("config_wordle_obs_scene", true);
            string obsSource = CPH.GetGlobalVar<string>("config_wordle_obs_source", true);

            CPH.SendMessage("[WORDLE DEBUG] Command triggered");
            CPH.SendMessage($"[WORDLE DEBUG] OBS Config - Scene: '{obsScene}', Source: '{obsSource}'");

            // Fetch word pool from Google Sheet
            CPH.SendMessage("[WORDLE DEBUG] Fetching word pool...");
            string[] wordPool = FetchWordPoolFromSheet(sheetUrl);
            if (wordPool == null || wordPool.Length == 0)
            {
                CPH.SendMessage("⚠️ Wordle error: No words available. Please configure the Google Sheet.");
                return false;
            }
            CPH.SendMessage($"[WORDLE DEBUG] Loaded {wordPool.Length} words");

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Wordle command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Wordle command: Missing 'userId' argument");
                return false;
            }

            // Get user input (guess)
            string guess = "";
            if (CPH.TryGetArg("input0", out string input0) && !string.IsNullOrEmpty(input0))
            {
                guess = input0.ToUpper();
            }
            CPH.SendMessage($"[WORDLE DEBUG] User: {user}, Guess: '{guess}'");

            // Check for timeout before processing
            if (CheckGameTimeout(user))
                return false;

            // Check if there's an active GLOBAL game (shared by all players)
            string currentWord = CPH.GetGlobalVar<string>("wordle_current_word", true);
            int guessCount = CPH.GetGlobalVar<int>("wordle_guess_count", true);
            string previousGuesses = CPH.GetGlobalVar<string>("wordle_guesses", true);
            string gameOwnerId = CPH.GetGlobalVar<string>("wordle_game_owner_id", true);
            string gameOwnerName = CPH.GetGlobalVar<string>("wordle_game_owner_name", true);

            CPH.SendMessage($"[WORDLE DEBUG] Active game check - Word exists: {!string.IsNullOrEmpty(currentWord)}, Owner: {gameOwnerName}, Current user: {user}");

            // If no active game, start a new one
            if (string.IsNullOrEmpty(currentWord))
            {
                CPH.SendMessage("[WORDLE DEBUG] No active game - can start new game");

                // No active game - check if user provided a guess when they should be starting a game
                if (!string.IsNullOrEmpty(guess))
                {
                    CPH.SendMessage($"{user}, there's no active Wordle game! Use !wordle (no word) to start a new game first.");
                    return false;
                }

                // Cooldown check (global cooldown for the game)
                int cooldownSeconds = CPH.GetGlobalVar<int>("config_wordle_cooldown_seconds", true);
                if (cooldownSeconds == 0) cooldownSeconds = 60;

                string lastPlayedStr = CPH.GetGlobalVar<string>("wordle_last_played", true);
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

                        CPH.SendMessage($"{user}, Wordle is on cooldown! Wait {timeLeft} before starting a new game.");
                        LogWarning("Wordle Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                        return false;
                    }
                }

                // Check balance
                int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

                if (balance < gameCost)
                {
                    LogWarning("Wordle Insufficient Funds",
                        $"**User:** {user}\n**Cost:** ${gameCost}\n**Balance:** ${balance}");

                    CPH.SendMessage($"{user}, you need ${gameCost} {currencyName} to play Wordle! Balance: ${balance}");
                    return false;
                }

                // Deduct cost
                balance -= gameCost;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                // Pick a random word
                Random random = new Random(Guid.NewGuid().GetHashCode());
                currentWord = wordPool[random.Next(wordPool.Length)];

                CPH.SendMessage($"[WORDLE DEBUG] New game - Word: {currentWord}, Owner: {user}");

                // Initialize GLOBAL game state (shared for all viewers) - PERSISTED
                CPH.SetGlobalVar("wordle_current_word", currentWord, true);
                CPH.SetGlobalVar("wordle_guess_count", 0, true);
                CPH.SetGlobalVar("wordle_guesses", "", true);
                CPH.SetGlobalVar("wordle_game_owner_id", userId, true);
                CPH.SetGlobalVar("wordle_game_owner_name", user, true);

                // Set initial timestamp for timeout tracking
                UpdateGameTimestamp();

                // Show OBS source
                CPH.SendMessage("[WORDLE DEBUG] Showing OBS source...");
                try
                {
                    CPH.ObsSetSourceVisibility(obsScene, obsSource, true, 0);
                    CPH.SendMessage($"[WORDLE DEBUG] OBS source shown: {obsScene}/{obsSource}");
                }
                catch (Exception obsEx)
                {
                    CPH.SendMessage($"[WORDLE DEBUG] ERROR showing OBS: {obsEx.Message}");
                }

                // Write JSON for HTML
                CPH.SendMessage("[WORDLE DEBUG] Writing JSON...");
                WriteWordleJson(user, currentWord, new string[0], 0, maxGuesses);

                LogInfo("Wordle Game Started",
                    $"**User:** {user}\n**Cost:** ${gameCost}\n**Word:** {currentWord}\n**Max Guesses:** {maxGuesses}");

                CPH.SendMessage($"🎮 {user} started Wordle! Cost: ${gameCost} {currencyName}. Type !wordle [word] to guess! Guesses left: {maxGuesses}");
                return true;
            }

            // There's an active game - check what the user is trying to do
            CPH.SendMessage($"[WORDLE DEBUG] Active game exists - Owner: {gameOwnerName}, Trying: {user}");

            if (string.IsNullOrEmpty(guess))
            {
                // User tried to start a new game but one is already active
                int guessesLeft = maxGuesses - guessCount;
                CPH.SendMessage($"{user}, there is currently a game by {gameOwnerName}! Please try the command once they have finished their game. Guesses left: {guessesLeft}/{maxGuesses}");
                return false;
            }

            // User provided a guess - check if they're the owner
            if (userId != gameOwnerId)
            {
                CPH.SendMessage($"{user}, only {gameOwnerName} can guess in their Wordle game! Wait for them to finish.");
                return false;
            }

            // Validate guess is 5 letters
            if (guess.Length != 5)
            {
                CPH.SendMessage($"{user}, your guess must be exactly 5 letters!");
                return false;
            }

            // Check if already guessed
            if (!string.IsNullOrEmpty(previousGuesses) && previousGuesses.Contains(guess))
            {
                CPH.SendMessage($"{user}, you already guessed '{guess}'! Try a different word.");
                return false;
            }

            // Process the guess
            CPH.SendMessage($"[WORDLE DEBUG] Processing guess: {guess}");
            guessCount++;
            string feedback = GetWordleFeedback(guess, currentWord);
            CPH.SendMessage($"[WORDLE DEBUG] Feedback: {feedback}");

            // Store the guess in GLOBAL vars (PERSISTED)
            previousGuesses = string.IsNullOrEmpty(previousGuesses) ? guess : previousGuesses + "," + guess;
            CPH.SetGlobalVar("wordle_guesses", previousGuesses, true);
            CPH.SetGlobalVar("wordle_guess_count", guessCount, true);

            // Update timestamp on each guess to reset the timeout
            UpdateGameTimestamp();

            // Update JSON with guesses
            string[] guessArray = previousGuesses.Split(',');
            WriteWordleJson(user, currentWord, guessArray, guessCount, maxGuesses);

            // Check if won
            if (guess == currentWord)
            {
                CPH.SendMessage("[WORDLE DEBUG] WIN detected!");

                // Won!
                int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
                balance += winReward;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                LogSuccess("Wordle Win",
                    $"**User:** {user}\n**Word:** {currentWord}\n**Guesses:** {guessCount}/{maxGuesses}\n**Reward:** ${winReward}\n**New Balance:** ${balance}");

                CPH.SendMessage($"🎉 {feedback} | {user} WON Wordle in {guessCount}/{maxGuesses} guesses! +${winReward} {currencyName}! Balance: ${balance}");

                // Hide OBS source after delay
                CPH.SendMessage("[WORDLE DEBUG] Hiding OBS source in 5 seconds...");
                System.Threading.Tasks.Task.Delay(5000).ContinueWith(_ =>
                {
                    try
                    {
                        CPH.ObsSetSourceVisibility(obsScene, obsSource, false, 0);
                        CPH.SendMessage("[WORDLE DEBUG] OBS source hidden");
                    }
                    catch (Exception ex)
                    {
                        CPH.SendMessage($"[WORDLE DEBUG] ERROR hiding OBS: {ex.Message}");
                    }
                });

                // Clear game state and set cooldown
                ClearGameState();
                CPH.SetGlobalVar("wordle_last_played", DateTime.UtcNow.ToString("o"), true);

                return true;
            }

            // Check if out of guesses
            if (guessCount >= maxGuesses)
            {
                CPH.SendMessage("[WORDLE DEBUG] LOSS detected!");

                // Lost
                LogWarning("Wordle Loss",
                    $"**User:** {user}\n**Word:** {currentWord}\n**Guesses:** {guessCount}/{maxGuesses}");

                CPH.SendMessage($"❌ {feedback} | {user} ran out of guesses! The word was: {currentWord}");

                // Hide OBS source after delay
                CPH.SendMessage("[WORDLE DEBUG] Hiding OBS source in 5 seconds...");
                System.Threading.Tasks.Task.Delay(5000).ContinueWith(_ =>
                {
                    try
                    {
                        CPH.ObsSetSourceVisibility(obsScene, obsSource, false, 0);
                        CPH.SendMessage("[WORDLE DEBUG] OBS source hidden");
                    }
                    catch (Exception ex)
                    {
                        CPH.SendMessage($"[WORDLE DEBUG] ERROR hiding OBS: {ex.Message}");
                    }
                });

                // Clear game state and set cooldown
                ClearGameState();
                CPH.SetGlobalVar("wordle_last_played", DateTime.UtcNow.ToString("o"), true);

                return true;
            }

            // Continue game
            CPH.SendMessage($"🎯 {feedback} | {user} has {maxGuesses - guessCount} guesses left!");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Wordle Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during Wordle");
            CPH.LogError($"Wordle error: {ex.Message}");
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TIMEOUT MANAGEMENT METHODS
    // ═══════════════════════════════════════════════════════════

    private void UpdateGameTimestamp()
    {
        CPH.SetGlobalVar("wordle_last_action", DateTime.UtcNow.ToString("o"), true);
    }

    private bool CheckGameTimeout(string user)
    {
        // Always use 60 seconds for Wordle timeout
        int timeoutSeconds = 60;

        string lastActionStr = CPH.GetGlobalVar<string>("wordle_last_action", true);

        if (string.IsNullOrEmpty(lastActionStr))
            return false; // No active game

        DateTime lastAction = DateTime.Parse(lastActionStr);
        TimeSpan elapsed = DateTime.UtcNow - lastAction;

        if (elapsed.TotalSeconds > timeoutSeconds)
        {
            string ownerName = CPH.GetGlobalVar<string>("wordle_game_owner_name", true);
            CPH.SendMessage($"⏱️ Wordle game by {ownerName} timed out after {timeoutSeconds} seconds of inactivity!");
            LogWarning("Wordle Timeout", $"**Owner:** {ownerName}\n**Idle Time:** {elapsed.TotalSeconds:F1} seconds");
            ClearGameState();
            return true;
        }

        return false;
    }

    private void ClearGameState()
    {
        CPH.SendMessage("[WORDLE DEBUG] Clearing game state");
        CPH.SetGlobalVar("wordle_current_word", "", true);
        CPH.SetGlobalVar("wordle_guess_count", 0, true);
        CPH.SetGlobalVar("wordle_guesses", "", true);
        CPH.SetGlobalVar("wordle_last_action", "", true);
        CPH.SetGlobalVar("wordle_game_owner_id", "", true);
        CPH.SetGlobalVar("wordle_game_owner_name", "", true);
    }

    // ═══════════════════════════════════════════════════════════
    // JSON WRITING FOR HTML COMMUNICATION
    // ═══════════════════════════════════════════════════════════

    private void WriteWordleJson(string user, string targetWord, string[] guesses, int guessCount, int maxGuesses)
    {
        try
        {
            // Use configurable path or default to GitHub repo structure
            string jsonPath = CPH.GetGlobalVar<string>("config_wordle_json_path", true);

            // If not configured, use the source code location (GitHub repo)
            if (string.IsNullOrEmpty(jsonPath))
            {
                // Default to GitHub repo path where wordle.html is located
                jsonPath = @"G:\GitHub Projects\StreamerBot-Commands\Currency\Games\Wordle\wordle-data.json";
            }

            CPH.SendMessage($"[WORDLE DEBUG] JSON Path: {jsonPath}");

            // Ensure directory exists
            string directory = System.IO.Path.GetDirectoryName(jsonPath);
            if (!System.IO.Directory.Exists(directory))
            {
                CPH.SendMessage($"[WORDLE DEBUG] Creating directory: {directory}");
                System.IO.Directory.CreateDirectory(directory);
            }

            // Build guess data with feedback
            StringBuilder guessData = new StringBuilder();
            guessData.Append("[");

            for (int i = 0; i < guesses.Length; i++)
            {
                if (i > 0) guessData.Append(",");

                string guess = guesses[i];
                string feedback = GetWordleFeedback(guess, targetWord);

                // Build letters array with individual feedback
                guessData.Append("{");
                guessData.Append($"\"word\":\"{guess}\",");
                guessData.Append("\"letters\":[");

                // Parse emoji feedback properly (emojis are multi-byte in C#)
                string[] feedbackEmojis = new string[5];
                int emojiIndex = 0;
                for (int charIndex = 0; charIndex < feedback.Length && emojiIndex < 5; charIndex++)
                {
                    if (char.IsHighSurrogate(feedback[charIndex]))
                    {
                        // Get the full emoji (2 characters for surrogate pair)
                        feedbackEmojis[emojiIndex] = feedback.Substring(charIndex, 2);
                        emojiIndex++;
                        charIndex++; // Skip the low surrogate
                    }
                    else
                    {
                        feedbackEmojis[emojiIndex] = feedback[charIndex].ToString();
                        emojiIndex++;
                    }
                }

                for (int j = 0; j < 5; j++)
                {
                    if (j > 0) guessData.Append(",");

                    string status = "absent";
                    if (feedbackEmojis[j] == "🟩") status = "correct";
                    else if (feedbackEmojis[j] == "🟨") status = "present";

                    guessData.Append("{");
                    guessData.Append($"\"letter\":\"{guess[j]}\",");
                    guessData.Append($"\"status\":\"{status}\"");
                    guessData.Append("}");
                }

                guessData.Append("]");
                guessData.Append("}");
            }

            guessData.Append("]");

            // Build complete JSON
            StringBuilder json = new StringBuilder();
            json.Append("{");
            json.Append($"\"user\":\"{EscapeJson(user)}\",");
            json.Append($"\"guesses\":{guessData},");
            json.Append($"\"guessCount\":{guessCount},");
            json.Append($"\"maxGuesses\":{maxGuesses},");
            json.Append($"\"gameActive\":true,");
            json.Append($"\"timestamp\":\"{DateTime.UtcNow.ToString("o")}\"");
            json.Append("}");

            // Write to file
            System.IO.File.WriteAllText(jsonPath, json.ToString());
            CPH.SendMessage($"[WORDLE DEBUG] JSON written successfully");
        }
        catch (Exception ex)
        {
            CPH.SendMessage($"[WORDLE DEBUG] ERROR writing JSON: {ex.Message}");
            CPH.LogError($"Wordle JSON write error: {ex.Message}");
        }
    }

    // ═══════════════════════════════════════════════════════════
    // WORDLE FEEDBACK METHODS
    // ═══════════════════════════════════════════════════════════

    private string GetWordleFeedback(string guess, string answer)
    {
        char[] answerChars = answer.ToCharArray();
        char[] guessChars = guess.ToCharArray();
        string[] feedback = new string[5];
        bool[] usedAnswer = new bool[5];
        bool[] usedGuess = new bool[5];

        // First pass: mark correct positions (green)
        for (int i = 0; i < 5; i++)
        {
            if (guessChars[i] == answerChars[i])
            {
                feedback[i] = "🟩";
                usedAnswer[i] = true;
                usedGuess[i] = true;
            }
        }

        // Second pass: mark wrong positions (yellow)
        for (int i = 0; i < 5; i++)
        {
            if (usedGuess[i]) continue;

            for (int j = 0; j < 5; j++)
            {
                if (!usedAnswer[j] && guessChars[i] == answerChars[j])
                {
                    feedback[i] = "🟨";
                    usedAnswer[j] = true;
                    usedGuess[i] = true;
                    break;
                }
            }
        }

        // Third pass: mark incorrect (gray/black)
        for (int i = 0; i < 5; i++)
        {
            if (feedback[i] == null)
            {
                feedback[i] = "⬛";
            }
        }

        return string.Join("", feedback);
    }

    private string[] FetchWordPoolFromSheet(string sheetUrl)
    {
        try
        {
            if (string.IsNullOrEmpty(sheetUrl) || sheetUrl.Contains("YOUR_SHEET_ID"))
            {
                CPH.LogError("Wordle: Google Sheet URL not configured");
                return null;
            }

            // Download word list from Google Sheet (published as CSV)
            string csvData;
            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                csvData = client.DownloadString(sheetUrl);
            }

            // Parse CSV data - expecting one word per line
            string[] lines = csvData.Split(new[] { "\r\n", "\r", "\n" }, StringSplitOptions.None);
            var wordList = new List<string>();

            foreach (string line in lines)
            {
                string word = line.Trim().ToUpper();

                // Skip empty lines and header if present
                if (string.IsNullOrEmpty(word) || word == "WORD" || word == "WORDS")
                    continue;

                // Validate it's a 5-letter word with only letters
                if (word.Length == 5 && word.All(c => char.IsLetter(c)))
                {
                    wordList.Add(word);
                }
            }

            if (wordList.Count == 0)
            {
                CPH.LogError("Wordle: No valid 5-letter words found in Google Sheet");
                return null;
            }

            CPH.LogInfo($"Wordle: Loaded {wordList.Count} words from Google Sheet");
            return wordList.ToArray();
        }
        catch (Exception ex)
        {
            CPH.LogError($"Wordle: Failed to fetch words from Google Sheet: {ex.Message}");
            return null;
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
