// ===== TWITCH API DIAGNOSTIC TEST =====
// Copyright (c) 2025 HexEchoTV (CUB)
// Licensed under the MIT License. See LICENSE file in the project root for full license information.
// https://github.com/HexEchoTV/Streamerbot-Commands
// All results will be posted to chat so you can see what's happening

using System;
using System.IO;
using System.Net;

public class CPHInline
{
    public bool Execute()
    {
        CPH.SendMessage("=== Starting Twitch API Diagnostic Test ===");

        // Test 1: Check global variables
        CPH.SendMessage("TEST 1: Checking global variables...");
        string accessToken = CPH.GetGlobalVar<string>("twitchApiAccessToken");
        string clientId = CPH.GetGlobalVar<string>("twitchApiClientId");

        if (string.IsNullOrEmpty(accessToken))
        {
            CPH.SendMessage("❌ ACCESS TOKEN not found! Did you run ConfigSetup.cs?");
            return false;
        }
        else
        {
            CPH.SendMessage($"✅ ACCESS TOKEN found: {accessToken.Substring(0, Math.Min(15, accessToken.Length))}...");
        }

        if (string.IsNullOrEmpty(clientId))
        {
            CPH.SendMessage("❌ CLIENT ID not found! Did you run ConfigSetup.cs?");
            return false;
        }
        else
        {
            CPH.SendMessage($"✅ CLIENT ID found: {clientId.Substring(0, Math.Min(15, clientId.Length))}...");
        }

        // Test 2: Check broadcaster ID
        CPH.SendMessage("TEST 2: Checking broadcaster ID...");
        string broadcasterId = null;
        if (CPH.TryGetArg("broadcastUserId", out string tempBroadcasterId) && !string.IsNullOrEmpty(tempBroadcasterId))
        {
            broadcasterId = tempBroadcasterId;
        }
        else if (CPH.TryGetArg("broadcasterUserId", out tempBroadcasterId) && !string.IsNullOrEmpty(tempBroadcasterId))
        {
            broadcasterId = tempBroadcasterId;
        }

        if (string.IsNullOrEmpty(broadcasterId))
        {
            CPH.SendMessage("❌ Broadcaster ID not found in args!");
            return false;
        }
        else
        {
            CPH.SendMessage($"✅ Broadcaster ID found: {broadcasterId}");
        }

        // Test 3: Try to get channel info from Twitch API
        CPH.SendMessage("TEST 3: Testing Twitch API connection...");

        try
        {
            using (System.Net.WebClient client = new System.Net.WebClient())
            {
                client.Headers.Add("Authorization", $"Bearer {accessToken}");
                client.Headers.Add("Client-Id", clientId);

                string url = $"https://api.twitch.tv/helix/channels?broadcaster_id={broadcasterId}";
                CPH.SendMessage($"Calling API: {url}");

                string response = client.DownloadString(url);

                // Try to parse title
                int titleStart = response.IndexOf("\"title\":\"") + 9;
                int titleEnd = response.IndexOf("\"", titleStart);

                if (titleStart > 8 && titleEnd > titleStart)
                {
                    string title = response.Substring(titleStart, titleEnd - titleStart);
                    CPH.SendMessage($"✅ API SUCCESS! Current title: {title}");
                }
                else
                {
                    CPH.SendMessage("⚠️ API responded but couldn't parse title");
                    CPH.SendMessage($"Response: {response.Substring(0, Math.Min(100, response.Length))}...");
                }
            }
        }
        catch (WebException webEx)
        {
            CPH.SendMessage($"❌ API ERROR: {webEx.Message}");

            if (webEx.Response != null)
            {
                using (var reader = new StreamReader(webEx.Response.GetResponseStream()))
                {
                    string errorResponse = reader.ReadToEnd();
                    CPH.SendMessage($"Error details: {errorResponse}");
                }
            }

            // Common error explanations
            if (webEx.Message.Contains("401"))
            {
                CPH.SendMessage("💡 401 = Invalid token. Get a new one from twitchtokengenerator.com");
            }
            else if (webEx.Message.Contains("403"))
            {
                CPH.SendMessage("💡 403 = Missing scope. Make sure you selected 'channel:manage:broadcast'");
            }

            return false;
        }
        catch (Exception ex)
        {
            CPH.SendMessage($"❌ UNEXPECTED ERROR: {ex.Message}");
            return false;
        }

        CPH.SendMessage("=== Diagnostic Test Complete! ===");
        return true;
    }
}


