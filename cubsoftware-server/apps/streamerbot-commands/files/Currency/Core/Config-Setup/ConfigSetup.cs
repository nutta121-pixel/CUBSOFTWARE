// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
//
// DEPENDENCIES: None (this is the foundation file)
//
// TO USE:
// 1. Create a new C# action in StreamerBot with this code
// 2. Run it once to initialize all config values
// 3. To change settings later, edit values in StreamerBot's Global Variables UI
//    OR edit this file and run it again to update all values
//
// All other commands will automatically read from these config global variables
// Every game now has its own individual configuration!

using System;

public class CPHInline
{
    public bool Execute()
    {
        CPH.LogInfo("=== Setting up Cub Coins Currency Configuration by HexEchoTV (CUB) ===");

        // ===== CORE CURRENCY SETTINGS =====
        CPH.SetGlobalVar("config_currency_name", "Cub Coins", true);
        CPH.SetGlobalVar("config_currency_key", "cubcoins", true);

        // ===== DAILY REDEMPTION =====
        CPH.SetGlobalVar("config_daily_reward", 100, true);
        CPH.SetGlobalVar("config_daily_cooldown_hours", 24, true);

        // ===== TRANSFER SETTINGS =====
        CPH.SetGlobalVar("config_give_min_amount", 1, true);

        // ===== LEADERBOARD SETTINGS =====
        CPH.SetGlobalVar("config_leaderboard_top_count", 5, true);

        // ===== GAME SESSION TIMEOUT =====
        // Inactivity timeout for multi-turn games (in seconds)
        // Games will auto-forfeit after this many seconds of no user action
        CPH.SetGlobalVar("config_game_inactivity_timeout", 60, true);

        // ===== WORK/EARNING COMMANDS =====

        // Work Command
        CPH.SetGlobalVar("config_work_min", 25, true);
        CPH.SetGlobalVar("config_work_max", 100, true);
        CPH.SetGlobalVar("config_work_cooldown_minutes", 30, true);

        // Fish Command
        CPH.SetGlobalVar("config_fish_min", 20, true);
        CPH.SetGlobalVar("config_fish_max", 80, true);
        CPH.SetGlobalVar("config_fish_cooldown_minutes", 20, true);

        // Hunt Command
        CPH.SetGlobalVar("config_hunt_min", 30, true);
        CPH.SetGlobalVar("config_hunt_max", 120, true);
        CPH.SetGlobalVar("config_hunt_cooldown_minutes", 25, true);

        // Mine Command
        CPH.SetGlobalVar("config_mine_min", 35, true);
        CPH.SetGlobalVar("config_mine_max", 150, true);
        CPH.SetGlobalVar("config_mine_cooldown_minutes", 35, true);

        // Forage Command
        CPH.SetGlobalVar("config_forage_min", 15, true);
        CPH.SetGlobalVar("config_forage_max", 70, true);
        CPH.SetGlobalVar("config_forage_cooldown_minutes", 18, true);

        // Scavenge Command
        CPH.SetGlobalVar("config_scavenge_min", 20, true);
        CPH.SetGlobalVar("config_scavenge_max", 90, true);
        CPH.SetGlobalVar("config_scavenge_cooldown_minutes", 22, true);

        // Dig Command
        CPH.SetGlobalVar("config_dig_min", 25, true);
        CPH.SetGlobalVar("config_dig_max", 110, true);
        CPH.SetGlobalVar("config_dig_cooldown_minutes", 28, true);

        // Search Command
        CPH.SetGlobalVar("config_search_min", 18, true);
        CPH.SetGlobalVar("config_search_max", 75, true);
        CPH.SetGlobalVar("config_search_cooldown_minutes", 20, true);

        // Collect Command
        CPH.SetGlobalVar("config_collect_min", 15, true);
        CPH.SetGlobalVar("config_collect_max", 65, true);
        CPH.SetGlobalVar("config_collect_cooldown_minutes", 15, true);

        // Beg Command
        CPH.SetGlobalVar("config_beg_min", 5, true);
        CPH.SetGlobalVar("config_beg_max", 30, true);
        CPH.SetGlobalVar("config_beg_cooldown_minutes", 10, true);

        // ===== BETTING/GAMBLING GAMES =====

        // Wheel Command
        CPH.SetGlobalVar("config_wheel_min_bet", 25, true);
        CPH.SetGlobalVar("config_wheel_max_bet", 600, true);
        CPH.SetGlobalVar("config_wheel_gold_chance", 5, true);
        CPH.SetGlobalVar("config_wheel_gold_mult", 20, true);
        CPH.SetGlobalVar("config_wheel_green_chance", 15, true);
        CPH.SetGlobalVar("config_wheel_green_mult", 5, true);
        CPH.SetGlobalVar("config_wheel_red_chance", 40, true);
        CPH.SetGlobalVar("config_wheel_red_mult", 2, true);
        CPH.SetGlobalVar("config_wheel_blue_mult", 2, true);
        CPH.SetGlobalVar("config_wheel_cooldown_seconds", 20, true);

        // Coinflip Command
        CPH.SetGlobalVar("config_coinflip_min_bet", 10, true);
        CPH.SetGlobalVar("config_coinflip_max_bet", 500, true);
        CPH.SetGlobalVar("config_coinflip_win_mult", 2, true);
        CPH.SetGlobalVar("config_coinflip_cooldown_seconds", 15, true);

        // Slots Command
        CPH.SetGlobalVar("config_slots_min_bet", 20, true);
        CPH.SetGlobalVar("config_slots_max_bet", 400, true);
        CPH.SetGlobalVar("config_slots_triple_mult", 10, true);
        CPH.SetGlobalVar("config_slots_double_mult", 3, true);
        CPH.SetGlobalVar("config_slots_cooldown_seconds", 20, true);

        // Blackjack Command
        CPH.SetGlobalVar("config_blackjack_min_bet", 25, true);
        CPH.SetGlobalVar("config_blackjack_max_bet", 500, true);
        CPH.SetGlobalVar("config_blackjack_win_mult", 2, true);
        CPH.SetGlobalVar("config_blackjack_cooldown_seconds", 30, true);

        // Roulette Command
        CPH.SetGlobalVar("config_roulette_min_bet", 15, true);
        CPH.SetGlobalVar("config_roulette_max_bet", 400, true);
        CPH.SetGlobalVar("config_roulette_number_mult", 35, true);
        CPH.SetGlobalVar("config_roulette_color_mult", 2, true);
        CPH.SetGlobalVar("config_roulette_cooldown_seconds", 20, true);

        // Dice Command
        CPH.SetGlobalVar("config_dice_min_bet", 10, true);
        CPH.SetGlobalVar("config_dice_max_bet", 300, true);
        CPH.SetGlobalVar("config_dice_win_mult", 6, true);
        CPH.SetGlobalVar("config_dice_cooldown_seconds", 15, true);

        // Flip Command
        CPH.SetGlobalVar("config_flip_min_bet", 10, true);
        CPH.SetGlobalVar("config_flip_max_bet", 500, true);
        CPH.SetGlobalVar("config_flip_win_mult", 2, true);
        CPH.SetGlobalVar("config_flip_cooldown_seconds", 15, true);

        // Gamble Command
        CPH.SetGlobalVar("config_gamble_min_bet", 20, true);
        CPH.SetGlobalVar("config_gamble_max_bet", 600, true);
        CPH.SetGlobalVar("config_gamble_max_mult", 5, true);
        CPH.SetGlobalVar("config_gamble_cooldown_seconds", 20, true);

        // Bingo Command
        CPH.SetGlobalVar("config_bingo_min_bet", 15, true);
        CPH.SetGlobalVar("config_bingo_max_bet", 300, true);
        CPH.SetGlobalVar("config_bingo_win_mult", 8, true);
        CPH.SetGlobalVar("config_bingo_cooldown_seconds", 25, true);

        // Keno Command
        CPH.SetGlobalVar("config_keno_min_bet", 20, true);
        CPH.SetGlobalVar("config_keno_max_bet", 350, true);
        CPH.SetGlobalVar("config_keno_max_mult", 10, true);
        CPH.SetGlobalVar("config_keno_cooldown_seconds", 20, true);

        // Lottery Command
        CPH.SetGlobalVar("config_lottery_min_bet", 10, true);
        CPH.SetGlobalVar("config_lottery_max_bet", 200, true);
        CPH.SetGlobalVar("config_lottery_jackpot_mult", 100, true);
        CPH.SetGlobalVar("config_lottery_cooldown_seconds", 30, true);

        // Highlow Command
        CPH.SetGlobalVar("config_highlow_min_bet", 15, true);
        CPH.SetGlobalVar("config_highlow_max_bet", 400, true);
        CPH.SetGlobalVar("config_highlow_win_mult", 2, true);
        CPH.SetGlobalVar("config_highlow_cooldown_seconds", 20, true);

        // Plinko Command
        CPH.SetGlobalVar("config_plinko_min_bet", 25, true);
        CPH.SetGlobalVar("config_plinko_max_bet", 500, true);
        CPH.SetGlobalVar("config_plinko_max_mult", 10, true);
        CPH.SetGlobalVar("config_plinko_cooldown_seconds", 25, true);

        // Scratch Command
        CPH.SetGlobalVar("config_scratch_min_bet", 10, true);
        CPH.SetGlobalVar("config_scratch_max_bet", 250, true);
        CPH.SetGlobalVar("config_scratch_max_mult", 15, true);
        CPH.SetGlobalVar("config_scratch_cooldown_seconds", 20, true);

        // Spin Command
        CPH.SetGlobalVar("config_spin_min_bet", 20, true);
        CPH.SetGlobalVar("config_spin_max_bet", 400, true);
        CPH.SetGlobalVar("config_spin_max_mult", 8, true);
        CPH.SetGlobalVar("config_spin_cooldown_seconds", 20, true);

        // Crash Command
        CPH.SetGlobalVar("config_crash_min_bet", 25, true);
        CPH.SetGlobalVar("config_crash_max_bet", 500, true);
        CPH.SetGlobalVar("config_crash_max_mult", 10, true);
        CPH.SetGlobalVar("config_crash_cooldown_seconds", 25, true);

        // Limbo Command
        CPH.SetGlobalVar("config_limbo_min_bet", 20, true);
        CPH.SetGlobalVar("config_limbo_max_bet", 400, true);
        CPH.SetGlobalVar("config_limbo_max_mult", 15, true);
        CPH.SetGlobalVar("config_limbo_cooldown_seconds", 20, true);

        // Match Command
        CPH.SetGlobalVar("config_match_min_bet", 15, true);
        CPH.SetGlobalVar("config_match_max_bet", 350, true);
        CPH.SetGlobalVar("config_match_win_mult", 5, true);
        CPH.SetGlobalVar("config_match_cooldown_seconds", 20, true);

        // ===== ADVENTURE/CHALLENGE GAMES =====

        // Tower Command
        CPH.SetGlobalVar("config_tower_min_bet", 30, true);
        CPH.SetGlobalVar("config_tower_max_bet", 400, true);
        CPH.SetGlobalVar("config_tower_mult_per_level", 0.5, true);
        CPH.SetGlobalVar("config_tower_cooldown_seconds", 30, true);

        // Heist Command
        CPH.SetGlobalVar("config_heist_min_bet", 50, true);
        CPH.SetGlobalVar("config_heist_max_bet", 1000, true);
        CPH.SetGlobalVar("config_heist_success_rate", 30, true);
        CPH.SetGlobalVar("config_heist_win_mult", 4, true);
        CPH.SetGlobalVar("config_heist_cooldown_hours", 3, true);

        // Boss Command
        CPH.SetGlobalVar("config_boss_min_bet", 75, true);
        CPH.SetGlobalVar("config_boss_max_bet", 1500, true);
        CPH.SetGlobalVar("config_boss_success_rate", 25, true);
        CPH.SetGlobalVar("config_boss_win_mult", 5, true);
        CPH.SetGlobalVar("config_boss_cooldown_hours", 4, true);

        // Vault Command
        CPH.SetGlobalVar("config_vault_min_reward", 200, true);
        CPH.SetGlobalVar("config_vault_max_reward", 500, true);
        CPH.SetGlobalVar("config_vault_success_chance", 25, true);
        CPH.SetGlobalVar("config_vault_cooldown_hours", 2, true);

        // Dungeon Command
        CPH.SetGlobalVar("config_dungeon_min_bet", 40, true);
        CPH.SetGlobalVar("config_dungeon_max_bet", 600, true);
        CPH.SetGlobalVar("config_dungeon_success_rate", 35, true);
        CPH.SetGlobalVar("config_dungeon_win_mult", 3, true);
        CPH.SetGlobalVar("config_dungeon_cooldown_minutes", 45, true);

        // Explore Command
        CPH.SetGlobalVar("config_explore_min_reward", 30, true);
        CPH.SetGlobalVar("config_explore_max_reward", 150, true);
        CPH.SetGlobalVar("config_explore_cooldown_minutes", 30, true);

        // Quest Command
        CPH.SetGlobalVar("config_quest_min_reward", 50, true);
        CPH.SetGlobalVar("config_quest_max_reward", 200, true);
        CPH.SetGlobalVar("config_quest_success_rate", 40, true);
        CPH.SetGlobalVar("config_quest_cooldown_minutes", 60, true);

        // Ladder Command
        CPH.SetGlobalVar("config_ladder_min_bet", 25, true);
        CPH.SetGlobalVar("config_ladder_max_bet", 400, true);
        CPH.SetGlobalVar("config_ladder_mult_per_rung", 0.4, true);
        CPH.SetGlobalVar("config_ladder_cooldown_seconds", 30, true);

        // Battle Command
        CPH.SetGlobalVar("config_battle_min_bet", 30, true);
        CPH.SetGlobalVar("config_battle_max_bet", 500, true);
        CPH.SetGlobalVar("config_battle_win_mult", 3, true);
        CPH.SetGlobalVar("config_battle_cooldown_minutes", 40, true);

        // Mines Command
        CPH.SetGlobalVar("config_mines_min_bet", 20, true);
        CPH.SetGlobalVar("config_mines_max_bet", 400, true);
        CPH.SetGlobalVar("config_mines_max_mult", 12, true);
        CPH.SetGlobalVar("config_mines_cooldown_seconds", 25, true);

        // Race Command
        CPH.SetGlobalVar("config_race_min_bet", 25, true);
        CPH.SetGlobalVar("config_race_max_bet", 450, true);
        CPH.SetGlobalVar("config_race_win_mult", 4, true);
        CPH.SetGlobalVar("config_race_cooldown_minutes", 35, true);

        // ===== PVP GAMES =====

        // Duel Command
        CPH.SetGlobalVar("config_duel_min_bet", 50, true);
        CPH.SetGlobalVar("config_duel_max_bet", 500, true);
        CPH.SetGlobalVar("config_duel_cooldown_seconds", 30, true);

        // Rob Command
        CPH.SetGlobalVar("config_rob_cooldown_minutes", 45, true);
        CPH.SetGlobalVar("config_rob_success_rate", 40, true);
        CPH.SetGlobalVar("config_rob_min_percent", 10, true);
        CPH.SetGlobalVar("config_rob_max_percent", 30, true);

        // ===== SPECIAL GAMES =====

        // Trivia Command (old single-player)
        CPH.SetGlobalVar("config_trivia_min_reward", 30, true);
        CPH.SetGlobalVar("config_trivia_max_reward", 80, true);
        CPH.SetGlobalVar("config_trivia_cooldown_minutes", 15, true);

        // Live Trivia (Google Sheets)
        CPH.SetGlobalVar("config_livetrivia_min_reward", 75, true);
        CPH.SetGlobalVar("config_livetrivia_max_reward", 150, true);
        CPH.SetGlobalVar("config_trivia_sheet_url", "https://docs.google.com/spreadsheets/d/11uZO9ec7tg2mC5RVzpwBOpb-JcViTuW3bx6V_Gby-LE/export?format=csv&gid=0", true);

        // Treasure Hunt
        CPH.SetGlobalVar("config_treasure_spawn_chance", 50, true); // % chance to spawn every interval
        CPH.SetGlobalVar("config_treasure_common_min", 10, true);
        CPH.SetGlobalVar("config_treasure_common_max", 50, true);
        CPH.SetGlobalVar("config_treasure_rare_min", 50, true);
        CPH.SetGlobalVar("config_treasure_rare_max", 150, true);
        CPH.SetGlobalVar("config_treasure_epic_min", 150, true);
        CPH.SetGlobalVar("config_treasure_epic_max", 300, true);
        CPH.SetGlobalVar("config_treasure_legendary_min", 500, true);
        CPH.SetGlobalVar("config_treasure_legendary_max", 1000, true);

        // Bounty Command
        CPH.SetGlobalVar("config_bounty_min_reward", 40, true);
        CPH.SetGlobalVar("config_bounty_max_reward", 180, true);
        CPH.SetGlobalVar("config_bounty_success_rate", 35, true);
        CPH.SetGlobalVar("config_bounty_cooldown_minutes", 50, true);

        // Crime Command
        CPH.SetGlobalVar("config_crime_min_reward", 30, true);
        CPH.SetGlobalVar("config_crime_max_reward", 150, true);
        CPH.SetGlobalVar("config_crime_success_rate", 40, true);
        CPH.SetGlobalVar("config_crime_fail_penalty", 50, true);
        CPH.SetGlobalVar("config_crime_cooldown_minutes", 30, true);

        // Invest Command
        CPH.SetGlobalVar("config_invest_min_bet", 50, true);
        CPH.SetGlobalVar("config_invest_max_bet", 1000, true);
        CPH.SetGlobalVar("config_invest_max_mult", 3, true);
        CPH.SetGlobalVar("config_invest_cooldown_hours", 1, true);

        // Luck Command
        CPH.SetGlobalVar("config_luck_min_bet", 20, true);
        CPH.SetGlobalVar("config_luck_max_bet", 400, true);
        CPH.SetGlobalVar("config_luck_max_mult", 10, true);
        CPH.SetGlobalVar("config_luck_cooldown_minutes", 25, true);

        // Magic Command
        CPH.SetGlobalVar("config_magic_min_reward", 25, true);
        CPH.SetGlobalVar("config_magic_max_reward", 120, true);
        CPH.SetGlobalVar("config_magic_cooldown_minutes", 35, true);

        // Pet Command
        CPH.SetGlobalVar("config_pet_min_reward", 20, true);
        CPH.SetGlobalVar("config_pet_max_reward", 100, true);
        CPH.SetGlobalVar("config_pet_cooldown_minutes", 40, true);

        // Pickpocket Command
        CPH.SetGlobalVar("config_pickpocket_min_reward", 15, true);
        CPH.SetGlobalVar("config_pickpocket_max_reward", 80, true);
        CPH.SetGlobalVar("config_pickpocket_success_rate", 45, true);
        CPH.SetGlobalVar("config_pickpocket_fail_penalty", 30, true);
        CPH.SetGlobalVar("config_pickpocket_cooldown_minutes", 20, true);

        // Streak Command
        CPH.SetGlobalVar("config_streak_base_reward", 10, true);
        CPH.SetGlobalVar("config_streak_mult_per_day", 5, true);
        CPH.SetGlobalVar("config_streak_max_mult", 50, true);

        // Wordle Command
        CPH.SetGlobalVar("config_wordle_cost", 50, true);
        CPH.SetGlobalVar("config_wordle_win_reward", 150, true);
        CPH.SetGlobalVar("config_wordle_max_guesses", 6, true);
        CPH.SetGlobalVar("config_wordle_cooldown_seconds", 60, true);
        CPH.SetGlobalVar("config_wordle_html_path", "G:/GitHub Projects/StreamerBot-Commands/Currency/Games/Wordle/wordle.html", true);
        // IMPORTANT: Use the CSV export URL, NOT the edit URL!
        // Get it from: File → Share → Publish to web → CSV format
        CPH.SetGlobalVar("config_wordle_sheet_url", "https://docs.google.com/spreadsheets/d/1IffNTWaunouIRcgxXYROyuwPDLvkyBs65Sag5DaNIVk/export?format=csv&gid=0", true);

        // Wordle OBS Source Control (HTML version only)
        // Set these to the exact names in your OBS
        CPH.SetGlobalVar("config_wordle_obs_scene", "Gaming", true);        // The OBS scene containing the wordle source
        CPH.SetGlobalVar("config_wordle_obs_source", "Wordle Display", true); // The browser source name in OBS
        CPH.SetGlobalVar("config_wordle_auto_show_hide", true, true);       // Enable/disable auto show/hide

        // ===== TWITCH API CONFIGURATION =====
        // Get these from: https://twitchtokengenerator.com/
        //
        // Required scopes:
        //   - channel:manage:broadcast (for clip creation, stream title, game changes)
        //   - moderator:read:followers (for followage command)
        //
        // Used by: ClipCommand.cs, TitleCommand.cs, GameCommand.cs, FollowageCommand.cs

        // â† PASTE YOUR CREDENTIALS HERE (from twitchtokengenerator.com)
        string twitchAccessToken = "YOUR_ACCESS_TOKEN_HERE";  // ACCESS TOKEN (required)
        string twitchRefreshToken = "YOUR_REFRESH_TOKEN_HERE"; // REFRESH TOKEN (for token refresh)
        string twitchClientId = "YOUR_CLIENT_ID_HERE";         // CLIENT ID (required)

        CPH.SetGlobalVar("twitchApiAccessToken", twitchAccessToken, true);
        CPH.SetGlobalVar("twitchApiRefreshToken", twitchRefreshToken, true);
        CPH.SetGlobalVar("twitchApiClientId", twitchClientId, true);

        // ===== YOUTUBE VIDEO REDEMPTION =====
        // OBS scene and source for the YouTube video player
        string youtubeObsScene = "Main Scene"; // Change this to your scene name
        string youtubeObsSource = "YouTube Player"; // Change this to your browser source name
        CPH.SetGlobalVar("config_youtube_obs_scene", youtubeObsScene, true);
        CPH.SetGlobalVar("config_youtube_obs_source", youtubeObsSource, true);

        // YouTube redemption settings
        int youtubeRedemptionCost = 500; // Cost in channel points or currency
        int youtubeMaxDuration = 600; // Maximum video duration in seconds (10 minutes)
        CPH.SetGlobalVar("config_youtube_redemption_cost", youtubeRedemptionCost, true);
        CPH.SetGlobalVar("config_youtube_max_duration", youtubeMaxDuration, true);

        // YouTube progress bar color (hex color code)
        // Examples: "#FF0000" (red), "#00FF00" (green), "#0080FF" (blue), "#FF00FF" (magenta), "#FFA500" (orange)
        string youtubeProgressColor = "#FF0000"; // Default: red
        CPH.SetGlobalVar("config_youtube_progress_color", youtubeProgressColor, true);

        // YouTube Data API v3 Key (Get from: https://console.cloud.google.com/)
        // REQUIRED for exact video duration detection (free tier: 10,000 requests/day)
        // Leave empty to use fallback monitoring (less accurate)
        string youtubeApiKey = "YOUR_YOUTUBE_API_KEY_HERE";  // PASTE YOUR API KEY HERE
        CPH.SetGlobalVar("config_youtube_api_key", youtubeApiKey, true);

        // YouTube Music Lyrics Feature (Uses free LRCLIB API - no key needed!)
        // Enable/disable scrolling lyrics for music.youtube.com videos
        // LRCLIB provides timestamped lyrics for perfect karaoke-style sync!
        bool youtubeLyricsEnabled = true;  // Set to false to disable lyrics
        CPH.SetGlobalVar("config_youtube_lyrics_enabled", youtubeLyricsEnabled, true);

        // Lyrics timing offset in seconds (can be negative or positive)
        // Positive = lyrics appear later, Negative = lyrics appear earlier
        // Adjust this if lyrics are slightly off-sync (try values between -1.0 and 1.0)
        double youtubeLyricsOffset = 0.0;  // Default: no offset
        CPH.SetGlobalVar("config_youtube_lyrics_offset", youtubeLyricsOffset, true);

        // ===== DISCORD LOGGING CONFIGURATION =====
        // Get webhook from: Discord Server’ Server Settings’ Integrations’ Webhooks
        // Used by: All commands for centralized logging to Discord

        string discordWebhookUrl = "YOUR_DISCORD_WEBHOOK_URL_HERE";  // PASTE YOUR DISCORD WEBHOOK URL HERE
        CPH.SetGlobalVar("discordLogWebhook", discordWebhookUrl, true);

        // Enable/Disable Discord Logging (true = enabled, false = disabled)
        bool discordLoggingEnabled = true;  // â† Change to false to disable all Discord logging
        CPH.SetGlobalVar("discordLoggingEnabled", discordLoggingEnabled, true);

        // ===== DISCORD SERVER INVITE LINK =====
        // Your Discord server invite link for the !discord command and README files
        string discordServerLink = "https://discord.gg/ngQXHUbnKg";
        CPH.SetGlobalVar("discordServerLink", discordServerLink, true);

        CPH.LogInfo("=== Configuration setup complete by HexEchoTV (CUB) (https://github.com/HexEchoTV/Streamerbot-Commands) ===");
        CPH.LogInfo("All commands will now read from these global variables.");
        CPH.LogInfo("To change settings, edit values in Global Variables or run this script again.");

        CPH.SendMessage("Currency configuration initialized! All settings loaded. | Created by HexEchoTV (CUB)");

        // Check if Twitch API was configured
        if (twitchAccessToken != "YOUR_ACCESS_TOKEN_HERE" &&
            twitchClientId != "YOUR_CLIENT_ID_HERE" &&
            twitchRefreshToken != "YOUR_REFRESH_TOKEN_HERE")
        {
            CPH.SendMessage("✅ Twitch API credentials configured! (!clip, !title, !game commands ready)");
            CPH.LogInfo("Twitch API credentials configured successfully");
        }
        else
        {
            CPH.SendMessage("⚠️ Twitch API credentials NOT configured. Edit ConfigSetup.cs lines 349-351 OR set in StreamerBot Global Variables to enable !clip, !title, and !game commands.");
            CPH.LogWarn("Twitch API credentials not configured. Edit lines 349-351 to enable !clip, !title, and !game commands.");
        }

        // Check if Discord webhook was configured
        if (!string.IsNullOrEmpty(discordWebhookUrl) && discordWebhookUrl != "YOUR_DISCORD_WEBHOOK_URL_HERE")
        {
            CPH.SendMessage("✅ Discord logging webhook configured! All logs will be sent to Discord.");
            CPH.LogInfo("Discord logging webhook configured successfully");

            // Send test message to Discord
            TestDiscordWebhook(discordWebhookUrl);
        }
        else
        {
            CPH.SendMessage("⚠️ Discord logging webhook NOT configured. Edit ConfigSetup.cs line 423 OR set in StreamerBot Global Variables for logging.");
            CPH.LogWarn("Discord webhook not configured. Edit line 423 to set your webhook URL.");
        }

        // Check if YouTube API key was configured
        if (!string.IsNullOrEmpty(youtubeApiKey) && youtubeApiKey != "YOUR_YOUTUBE_API_KEY_HERE")
        {
            CPH.SendMessage("✅ YouTube Data API configured! Videos will play exact durations (YouTube Player & Karaoke)");
            CPH.LogInfo("YouTube Data API key configured successfully");
        }
        else
        {
            CPH.SendMessage("⚠️ YouTube API NOT configured. Videos will use fallback timing (may be inaccurate). Get free API key: https://console.cloud.google.com/");
            CPH.LogWarn("YouTube API key not configured. Edit line 416 to enable exact video duration detection.");
        }

        return true;
    }

    private void TestDiscordWebhook(string webhookUrl)
    {
        try
        {
            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                client.Headers.Add("Content-Type", "application/json");

                string json = "{\"embeds\":[{" +
                    "\"title\":\"Configuration Complete\"," +
                    "\"description\":\"Discord logging is now active! All command logs will appear here.\\n\\n**Configured by:** HexEchoTV (CUB) (https://github.com/HexEchoTV/Streamerbot-Commands)\"," +
                    "\"color\":5763719," +
                    "\"timestamp\":\"" + DateTime.UtcNow.ToString("o") + "\"," +
                    "\"footer\":{\"text\":\"SUCCESS | HexEchoTV Logging System\"}" +
                    "}]}";

                client.UploadString(webhookUrl, "POST", json);
                CPH.LogInfo("Test message sent to Discord webhook successfully");
            }
        }
        catch (Exception ex)
        {
            CPH.LogError($"Failed to send test message to Discord: {ex.Message}");
        }
    }
}


