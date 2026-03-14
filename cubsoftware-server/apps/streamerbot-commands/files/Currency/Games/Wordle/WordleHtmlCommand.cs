// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES:
// - ConfigSetup.cs (must be run first to initialize all config variables)
// - Requires write access to create HTML file for browser source
//
// SETUP:
// 1. Set the config_wordle_html_path global variable to your desired HTML file path
// 2. Add the HTML file as a browser source in OBS
// 3. Run this command to play Wordle and update the browser source

using System;
using System.Collections.Generic;
using System.IO;
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

            string htmlPath = CPH.GetGlobalVar<string>("config_wordle_html_path", true);
            if (string.IsNullOrEmpty(htmlPath))
            {
                htmlPath = "wordle.html"; // Default path
            }

            string sheetUrl = CPH.GetGlobalVar<string>("config_wordle_sheet_url", true);

            // OBS source control settings
            bool autoShowHide = CPH.GetGlobalVar<bool>("config_wordle_auto_show_hide", true);
            string obsScene = CPH.GetGlobalVar<string>("config_wordle_obs_scene", true);
            string obsSource = CPH.GetGlobalVar<string>("config_wordle_obs_source", true);

            // Fetch word pool from Google Sheet
            string[] wordPool = FetchWordPoolFromSheet(sheetUrl);
            if (wordPool == null || wordPool.Length == 0)
            {
                CPH.SendMessage("⚠️ Wordle error: No words available. Please configure the Google Sheet.");
                return false;
            }

            if (!CPH.TryGetArg("user", out string user))
            {
                CPH.LogError("Wordle HTML command: Missing 'user' argument");
                return false;
            }

            if (!CPH.TryGetArg("userId", out string userId))
            {
                CPH.LogError("Wordle HTML command: Missing 'userId' argument");
                return false;
            }

            // Get user input (guess)
            string guess = "";
            if (CPH.TryGetArg("input0", out string input0) && !string.IsNullOrEmpty(input0))
            {
                guess = input0.ToUpper();
            }

            // Check for timeout before processing
            if (CheckGameTimeout())
                return false;

            // Check if there's an active GLOBAL game (shared by all players)
            string currentWord = CPH.GetGlobalVar<string>("wordle_html_current_word", true);
            int guessCount = CPH.GetGlobalVar<int>("wordle_html_guess_count", true);
            string previousGuesses = CPH.GetGlobalVar<string>("wordle_html_guesses", true);
            string gameOwnerId = CPH.GetGlobalVar<string>("wordle_html_game_owner_id", true);
            string gameOwnerName = CPH.GetGlobalVar<string>("wordle_html_game_owner_name", true);

            // If no active game, start a new one
            if (string.IsNullOrEmpty(currentWord))
            {
                // No active game - check if user provided a guess when they should be starting a game
                if (!string.IsNullOrEmpty(guess))
                {
                    CPH.SendMessage($"{user}, there's no active Wordle game! Use !wordle (no word) to start a new game first.");
                    return false;
                }

                // Cooldown check (global cooldown for the game)
                int cooldownSeconds = CPH.GetGlobalVar<int>("config_wordle_cooldown_seconds", true);
                if (cooldownSeconds == 0) cooldownSeconds = 60;

                string lastPlayedStr = CPH.GetGlobalVar<string>("wordle_html_last_played", true);
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
                        LogWarning("Wordle HTML Cooldown", $"**User:** {user}\n**Time Remaining:** {timeLeft}");
                        return false;
                    }
                }

                // Check balance
                int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);

                if (balance < gameCost)
                {
                    LogWarning("Wordle HTML Insufficient Funds",
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

                // Initialize GLOBAL game state (shared for all viewers) - PERSISTED
                CPH.SetGlobalVar("wordle_html_current_word", currentWord, true);
                CPH.SetGlobalVar("wordle_html_guess_count", 0, true);
                CPH.SetGlobalVar("wordle_html_guesses", "", true);
                CPH.SetGlobalVar("wordle_html_game_owner_id", userId, true);
                CPH.SetGlobalVar("wordle_html_game_owner_name", user, true);

                // Set initial timestamp for timeout tracking
                UpdateGameTimestamp();

                // Update HTML
                UpdateHtmlFile(htmlPath, currentWord, "", 0, maxGuesses, user, false, false);

                // Show OBS source if enabled
                if (autoShowHide && !string.IsNullOrEmpty(obsScene) && !string.IsNullOrEmpty(obsSource))
                {
                    CPH.ObsSetSourceVisibility(obsScene, obsSource, true, 0);
                }

                LogInfo("Wordle HTML Game Started",
                    $"**User:** {user}\n**Cost:** ${gameCost}\n**Word:** {currentWord}\n**Max Guesses:** {maxGuesses}");

                CPH.SendMessage($"🎮 {user} started Wordle! Cost: ${gameCost} {currencyName}. Type !wordle [word] to guess! Guesses left: {maxGuesses}");
                return true;
            }

            // There's an active game - check what the user is trying to do
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
            guessCount++;
            string feedback = GetWordleFeedback(guess, currentWord);

            // Store the guess in GLOBAL vars (PERSISTED)
            previousGuesses = string.IsNullOrEmpty(previousGuesses) ? guess : previousGuesses + "," + guess;
            CPH.SetGlobalVar("wordle_html_guesses", previousGuesses, true);
            CPH.SetGlobalVar("wordle_html_guess_count", guessCount, true);

            // Update timestamp on each guess to reset the timeout
            UpdateGameTimestamp();

            // Check if won
            if (guess == currentWord)
            {
                // Won!
                int balance = CPH.GetTwitchUserVarById<int>(userId, currencyKey, true);
                balance += winReward;
                CPH.SetTwitchUserVarById(userId, currencyKey, balance, true);

                // Update HTML with win state
                UpdateHtmlFile(htmlPath, currentWord, previousGuesses, guessCount, maxGuesses, user, true, true);

                // Hide OBS source after 5 seconds if enabled
                if (autoShowHide && !string.IsNullOrEmpty(obsScene) && !string.IsNullOrEmpty(obsSource))
                {
                    System.Threading.Tasks.Task.Delay(5000).ContinueWith(t =>
                    {
                        CPH.ObsSetSourceVisibility(obsScene, obsSource, false, 0);
                    });
                }

                // Clear game state
                ClearGameState();
                CPH.SetGlobalVar("wordle_html_last_played", DateTime.UtcNow.ToString("o"), true);

                LogSuccess("Wordle HTML Win",
                    $"**User:** {user}\n**Word:** {currentWord}\n**Guesses:** {guessCount}/{maxGuesses}\n**Reward:** ${winReward}\n**New Balance:** ${balance}");

                CPH.SendMessage($"🎉 {feedback} | {user} WON Wordle in {guessCount}/{maxGuesses} guesses! +${winReward} {currencyName}! Balance: ${balance}");
                return true;
            }

            // Check if out of guesses
            if (guessCount >= maxGuesses)
            {
                // Lost
                // Update HTML with loss state
                UpdateHtmlFile(htmlPath, currentWord, previousGuesses, guessCount, maxGuesses, user, true, false);

                // Hide OBS source after 5 seconds if enabled
                if (autoShowHide && !string.IsNullOrEmpty(obsScene) && !string.IsNullOrEmpty(obsSource))
                {
                    System.Threading.Tasks.Task.Delay(5000).ContinueWith(t =>
                    {
                        CPH.ObsSetSourceVisibility(obsScene, obsSource, false, 0);
                    });
                }

                LogWarning("Wordle HTML Loss",
                    $"**User:** {user}\n**Word:** {currentWord}\n**Guesses:** {guessCount}/{maxGuesses}");

                CPH.SendMessage($"❌ {feedback} | {user} ran out of guesses! The word was: {currentWord}");

                // Clear game state
                ClearGameState();
                CPH.SetGlobalVar("wordle_html_last_played", DateTime.UtcNow.ToString("o"), true);

                return true;
            }

            // Continue game - update HTML
            UpdateHtmlFile(htmlPath, currentWord, previousGuesses, guessCount, maxGuesses, user, false, false);

            CPH.SendMessage($"🎯 {feedback} | {user} has {maxGuesses - guessCount} guesses left!");

            return true;
        }
        catch (Exception ex)
        {
            LogError("Wordle HTML Command Exception",
                $"**Error:** {ex.Message}\n**Stack Trace:** {ex.StackTrace}");

            CPH.SendMessage("⚠️ An error occurred during Wordle");
            CPH.LogError($"Wordle HTML error: {ex.Message}");
            return false;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // TIMEOUT MANAGEMENT METHODS
    // ═══════════════════════════════════════════════════════════

    private void UpdateGameTimestamp()
    {
        CPH.SetGlobalVar("wordle_html_last_action", DateTime.UtcNow.ToString("o"), true);
    }

    private bool CheckGameTimeout()
    {
        // Always use 60 seconds for Wordle timeout
        int timeoutSeconds = 60;

        string lastActionStr = CPH.GetGlobalVar<string>("wordle_html_last_action", true);

        if (string.IsNullOrEmpty(lastActionStr))
            return false; // No active game

        DateTime lastAction = DateTime.Parse(lastActionStr);
        TimeSpan elapsed = DateTime.UtcNow - lastAction;

        if (elapsed.TotalSeconds > timeoutSeconds)
        {
            string ownerName = CPH.GetGlobalVar<string>("wordle_html_game_owner_name", true);
            CPH.SendMessage($"⏱️ Wordle game by {ownerName} timed out after {timeoutSeconds} seconds of inactivity!");
            LogWarning("Wordle HTML Timeout", $"**Owner:** {ownerName}\n**Idle Time:** {elapsed.TotalSeconds:F1} seconds");
            ClearGameState();
            return true;
        }

        return false;
    }

    private void ClearGameState()
    {
        CPH.SetGlobalVar("wordle_html_current_word", "", true);
        CPH.SetGlobalVar("wordle_html_guess_count", 0, true);
        CPH.SetGlobalVar("wordle_html_guesses", "", true);
        CPH.SetGlobalVar("wordle_html_last_action", "", true);
        CPH.SetGlobalVar("wordle_html_game_owner_id", "", true);
        CPH.SetGlobalVar("wordle_html_game_owner_name", "", true);
    }

    private void UpdateHtmlFile(string htmlPath, string targetWord, string guesses, int guessCount, int maxGuesses, string user, bool gameOver, bool won)
    {
        try
        {
            string[] guessArray = string.IsNullOrEmpty(guesses) ? new string[0] : guesses.Split(',');

            StringBuilder html = new StringBuilder();
            html.AppendLine("<!DOCTYPE html>");
            html.AppendLine("<html lang=\"en\">");
            html.AppendLine("<head>");
            html.AppendLine("    <meta charset=\"UTF-8\">");
            html.AppendLine("    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">");
            html.AppendLine("    <title>HexEchoTV Wordle</title>");
            html.AppendLine("    <script>");
            html.AppendLine("        // Auto-reload every 2 seconds to update OBS browser source");
            html.AppendLine("        setTimeout(function() {");
            html.AppendLine("            location.reload();");
            html.AppendLine("        }, 2000);");
            html.AppendLine("    </script>");
            html.AppendLine("    <style>");
            html.AppendLine("        body {");
            html.AppendLine("            margin: 0;");
            html.AppendLine("            padding: 40px;");
            html.AppendLine("            background: transparent;");
            html.AppendLine("            font-family: 'Arial', sans-serif;");
            html.AppendLine("            display: flex;");
            html.AppendLine("            flex-direction: column;");
            html.AppendLine("            align-items: center;");
            html.AppendLine("            color: white;");
            html.AppendLine("        }");
            html.AppendLine("        .container {");
            html.AppendLine("            background: rgba(0, 0, 0, 0.85);");
            html.AppendLine("            padding: 30px 50px;");
            html.AppendLine("            border-radius: 15px;");
            html.AppendLine("            border: 3px solid #6c63ff;");
            html.AppendLine("            box-shadow: 0 8px 32px rgba(108, 99, 255, 0.4);");
            html.AppendLine("        }");
            html.AppendLine("        h1 {");
            html.AppendLine("            margin: 0 0 30px 0;");
            html.AppendLine("            font-size: 48px;");
            html.AppendLine("            text-align: center;");
            html.AppendLine("            color: #6c63ff;");
            html.AppendLine("            text-shadow: 0 0 20px rgba(108, 99, 255, 0.8);");
            html.AppendLine("        }");
            html.AppendLine("        .word-display {");
            html.AppendLine("            font-size: 72px;");
            html.AppendLine("            font-weight: bold;");
            html.AppendLine("            text-align: center;");
            html.AppendLine("            margin: 20px 0;");
            html.AppendLine("            letter-spacing: 15px;");
            html.AppendLine("            text-shadow: 0 0 30px rgba(255, 255, 255, 0.5);");
            html.AppendLine("        }");
            html.AppendLine("        .guesses-container {");
            html.AppendLine("            margin-top: 30px;");
            html.AppendLine("        }");
            html.AppendLine("        .guess-row {");
            html.AppendLine("            display: flex;");
            html.AppendLine("            gap: 10px;");
            html.AppendLine("            margin: 10px 0;");
            html.AppendLine("            justify-content: center;");
            html.AppendLine("        }");
            html.AppendLine("        .letter-box {");
            html.AppendLine("            width: 60px;");
            html.AppendLine("            height: 60px;");
            html.AppendLine("            border: 2px solid #444;");
            html.AppendLine("            display: flex;");
            html.AppendLine("            align-items: center;");
            html.AppendLine("            justify-content: center;");
            html.AppendLine("            font-size: 32px;");
            html.AppendLine("            font-weight: bold;");
            html.AppendLine("            border-radius: 5px;");
            html.AppendLine("        }");
            html.AppendLine("        .correct {");
            html.AppendLine("            background-color: #538d4e;");
            html.AppendLine("            border-color: #538d4e;");
            html.AppendLine("        }");
            html.AppendLine("        .present {");
            html.AppendLine("            background-color: #b59f3b;");
            html.AppendLine("            border-color: #b59f3b;");
            html.AppendLine("        }");
            html.AppendLine("        .absent {");
            html.AppendLine("            background-color: #3a3a3c;");
            html.AppendLine("            border-color: #3a3a3c;");
            html.AppendLine("        }");
            html.AppendLine("        .game-status {");
            html.AppendLine("            margin-top: 30px;");
            html.AppendLine("            text-align: center;");
            html.AppendLine("            font-size: 24px;");
            html.AppendLine("        }");
            html.AppendLine("        .win-text {");
            html.AppendLine("            color: #538d4e;");
            html.AppendLine("            font-weight: bold;");
            html.AppendLine("            font-size: 36px;");
            html.AppendLine("        }");
            html.AppendLine("        .lose-text {");
            html.AppendLine("            color: #ff6b6b;");
            html.AppendLine("            font-weight: bold;");
            html.AppendLine("            font-size: 36px;");
            html.AppendLine("        }");
            html.AppendLine("    </style>");
            html.AppendLine("</head>");
            html.AppendLine("<body>");
            html.AppendLine("    <div class=\"container\">");
            html.AppendLine("        <h1>HexEchoTV<br>Wordle Challenge</h1>");
            html.AppendLine($"        <div style=\"text-align: center; font-size: 24px; margin-bottom: 20px; color: #aaa;\">Player: {user}</div>");

            if (!gameOver)
            {
                html.AppendLine("        <div class=\"word-display\">? ? ? ? ?</div>");
            }
            else
            {
                html.AppendLine($"        <div class=\"word-display\">{targetWord}</div>");
            }

            // Display ALL 6 rows (guesses + empty)
            html.AppendLine("        <div class=\"guesses-container\">");

            // Show all 6 rows
            for (int rowIndex = 0; rowIndex < maxGuesses; rowIndex++)
            {
                html.AppendLine("            <div class=\"guess-row\">");

                if (rowIndex < guessArray.Length)
                {
                    // This row has a guess - show with colors
                    string guessWord = guessArray[rowIndex];

                    char[] answerChars = targetWord.ToCharArray();
                    char[] guessChars = guessWord.ToCharArray();
                    bool[] usedAnswer = new bool[5];
                    bool[] usedGuess = new bool[5];
                    string[] classes = new string[5];

                    // First pass: mark correct positions
                    for (int i = 0; i < 5; i++)
                    {
                        if (guessChars[i] == answerChars[i])
                        {
                            classes[i] = "correct";
                            usedAnswer[i] = true;
                            usedGuess[i] = true;
                        }
                    }

                    // Second pass: mark present letters
                    for (int i = 0; i < 5; i++)
                    {
                        if (usedGuess[i]) continue;

                        for (int j = 0; j < 5; j++)
                        {
                            if (!usedAnswer[j] && guessChars[i] == answerChars[j])
                            {
                                classes[i] = "present";
                                usedAnswer[j] = true;
                                usedGuess[i] = true;
                                break;
                            }
                        }
                    }

                    // Third pass: mark absent
                    for (int i = 0; i < 5; i++)
                    {
                        if (classes[i] == null)
                        {
                            classes[i] = "absent";
                        }
                    }

                    // Output letter boxes
                    for (int i = 0; i < 5; i++)
                    {
                        html.AppendLine($"                <div class=\"letter-box {classes[i]}\">{guessChars[i]}</div>");
                    }
                }
                else
                {
                    // This row is empty - show empty boxes
                    for (int i = 0; i < 5; i++)
                    {
                        html.AppendLine("                <div class=\"letter-box\" style=\"background-color: transparent; border-color: #3a3a3c;\"></div>");
                    }
                }

                html.AppendLine("            </div>");
            }

            html.AppendLine("        </div>");

            // Game status
            if (gameOver)
            {
                if (won)
                {
                    html.AppendLine($"        <div class=\"game-status win-text\">🎉 {user} WON! 🎉</div>");
                }
                else
                {
                    html.AppendLine($"        <div class=\"game-status lose-text\">❌ Game Over ❌</div>");
                }
            }
            else
            {
                int guessesLeft = maxGuesses - guessCount;
                html.AppendLine($"        <div class=\"game-status\">Guesses Remaining: {guessesLeft}/{maxGuesses}</div>");
            }

            html.AppendLine("    </div>");
            html.AppendLine("</body>");
            html.AppendLine("</html>");

            // Write to file
            File.WriteAllText(htmlPath, html.ToString());
            CPH.LogInfo($"Wordle HTML updated: {htmlPath}");
        }
        catch (Exception ex)
        {
            CPH.LogError($"Error updating Wordle HTML: {ex.Message}");
        }
    }

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
                CPH.LogError("Wordle HTML: Google Sheet URL not configured");
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
                CPH.LogError("Wordle HTML: No valid 5-letter words found in Google Sheet");
                return null;
            }

            CPH.LogInfo($"Wordle HTML: Loaded {wordList.Count} words from Google Sheet");
            return wordList.ToArray();
        }
        catch (Exception ex)
        {
            CPH.LogError($"Wordle HTML: Failed to fetch words from Google Sheet: {ex.Message}");
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
