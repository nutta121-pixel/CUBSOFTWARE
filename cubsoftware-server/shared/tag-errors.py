"""
Batch-tags console.error() calls across CUB SOFTWARE bot files with CUBSOFTWARE_ERROR codes.
Run from the cubsoftware-server directory.
"""
import re, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(BASE, '..')  # cubsoftware-server/

def tag_file(rel_path, replacements):
    path = os.path.join(ROOT, rel_path)
    if not os.path.exists(path):
        print(f'  SKIP (not found): {rel_path}')
        return
    with open(path, 'r', encoding='utf-8') as f:
        text = f.read()
    original = text
    for phrase, code in replacements:
        # Skip lines already tagged
        if code in text and phrase in text:
            # Still do the replacement in case some are untagged
            pass
        escaped = re.escape(phrase)
        # Match console.error( then optional whitespace/backtick/quote then the phrase
        pattern = r'(console\.error\((?:[`\'"][^`\'"]{0,120}?)' + escaped
        repl = r'\g<1>' + code + ' \u2014 ' + phrase
        new_text = re.sub(pattern, repl, text)
        if new_text != text:
            text = new_text
    if text != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(text)
        print(f'  UPDATED: {rel_path}')
    else:
        print(f'  NO CHANGE: {rel_path}')

def tag_file_line_by_line(rel_path, replacements):
    """Simpler approach: line-by-line replacement."""
    path = os.path.join(ROOT, rel_path)
    if not os.path.exists(path):
        print(f'  SKIP (not found): {rel_path}')
        return
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    changed = 0
    for i, line in enumerate(lines):
        if 'console.error' not in line:
            continue
        if 'CUBSOFTWARE_ERROR' in line:
            continue  # already tagged
        for phrase, code in replacements:
            if phrase in line:
                lines[i] = line.replace(phrase, code + ' \u2014 ' + phrase, 1)
                changed += 1
                break
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'  UPDATED ({changed} lines): {rel_path}')
    else:
        print(f'  NO CHANGE: {rel_path}')

def tag_py_file(rel_path, replacements):
    """Tag app.logger.error calls in Python files."""
    path = os.path.join(ROOT, rel_path)
    if not os.path.exists(path):
        print(f'  SKIP (not found): {rel_path}')
        return
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    changed = 0
    for i, line in enumerate(lines):
        if 'CUBSOFTWARE_ERROR' in line:
            continue
        for phrase, code in replacements:
            if phrase in line and ('logger.error' in line or 'app.logger.error' in line):
                lines[i] = line.replace(phrase, code + ' \u2014 ' + phrase, 1)
                changed += 1
                break
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'  UPDATED ({changed} lines): {rel_path}')
    else:
        print(f'  NO CHANGE: {rel_path}')

# ─────────────────────────────────────────────────────────────────
# CUB PROTECTOR — cubai.js
# ─────────────────────────────────────────────────────────────────
print('\ncubai.js')
tag_file_line_by_line('apps/cub-protector/cubai.js', [
    ('[CUB AI] Whisper crashed on startup',    'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WHISPER_CRASH_070'),
    ('[CUB AI] Whisper process error:',        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WHISPER_PROCESS_071'),
    ('[CUB AI] Player error:',                 'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_PLAYER_072'),
    ('[CUB AI] TTS/playback error:',           'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TTS_073'),
    ('[CUB AI] drainPlayQueue error:',         'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_DRAINQUEUE_074'),
    ('[CUB AI] Trivia start error:',           'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TRIVIA_075'),
    ('[CUB AI] Roast error:',                  'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_ROAST_076'),
    ('[CUB AI] Word assoc bot reply error:',   'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WORDASSOC_077'),
    ('[CUB AI] 20Q start error:',              'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_20QSTART_078'),
    ('[CUB AI] 20Q answer error:',             'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_20QANSWER_079'),
    ('[CUB AI] Impersonate error:',            'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_IMPERSONATE_080'),
    ('[CUB AI] Rap battle error:',             'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_RAPBATTLE_081'),
    ('[CUB AI] Hot take error:',               'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_HOTTAKE_082'),
    ('[CUB AI] Horoscope error:',              'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_HOROSCOPE_083'),
    ('[CUB AI] Conspiracy error:',             'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_CONSPIRACY_084'),
    ('[CUB AI] Translator error:',             'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TRANSLATOR_085'),
    ('[CUB AI] Two truths error:',             'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TWOTRUTHS_086'),
    ('[CUB AI] Court judge error:',            'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_JUDGE_087'),
    ('[CUB AI] Error processing utterance:',   'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_UTTERANCE_088'),
    ('[CUB AI] Failed to undeafen:',           'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_UNDEAFEN_089'),
    ('[CUB AI] Welcome TTS error:',            'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WELCOMETTS_090'),
    ('[CUB AI] announceReady error:',          'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_ANNOUNCE_091'),
    ('[CUB AI] Connection error:',             'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_CONNECTION_092'),
    ('[CUB AI] Unhandled utterance error:',    'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_UNHANDLED_093'),
    ('[CUB AI] Decoder error:',                'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_DECODER_094'),
    ('[CUB AI] Ask error:',                    'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_ASK_095'),
])

# ─────────────────────────────────────────────────────────────────
# CUB PROTECTOR — podcast.js
# ─────────────────────────────────────────────────────────────────
print('\npodcast.js')
tag_file_line_by_line('apps/cub-protector/podcast.js', [
    ('[PODCAST] ffmpeg:',              'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_FFMPEG_096'),
    ('[PODCAST] ffmpeg error:',        'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_FFMPEG_096'),
    ('[PODCAST] Connection error:',    'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_CONNECTION_097'),
    ('[PODCAST] Auto-play next error:','CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_AUTOPLAY_098'),
    ('[PODCAST] Player error:',        'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_PLAYER_099'),
    ('[PODCAST] Play error:',          'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_PLAY_100'),
    ('[PODCAST] podcastPlay error:',   'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_PODPLAY_101'),
    ('[PODCAST] podcastSearch error:', 'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SEARCH_102'),
    ('[PODCAST] podcastBrowse error:', 'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_BROWSE_103'),
    ('[PODCAST] podcastEpisodes error:','CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_EPISODES_104'),
    ('[PODCAST] Skip fetch error:',    'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SKIP_105'),
    ('[PODCAST] Speed change error:',  'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SPEED_106'),
    ('[PODCAST] Volume restart error:','CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_VOLUME_107'),
    ('[PODCAST] Seek error:',          'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SEEK_108'),
    ('[PODCAST] podcastTrending error:','CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_TRENDING_109'),
    ('[PODCAST] podcastContinue error:','CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_CONTINUE_110'),
    ('[PODCAST] select handler error:', 'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SELECT_111'),
])

# ─────────────────────────────────────────────────────────────────
# CUB PROTECTOR — start.js
# ─────────────────────────────────────────────────────────────────
print('\nstart.js')
tag_file_line_by_line('apps/cub-protector/start.js', [
    ('[Startup] Failed to install dependencies:', 'CUBSOFTWARE_ERROR_CUBPROTECTOR_STARTUP_DEPS_112'),
])

# ─────────────────────────────────────────────────────────────────
# QUESTCORD — web/server.js
# ─────────────────────────────────────────────────────────────────
print('\nquestcord/src/web/server.js')
tag_file_line_by_line('apps/questcord/src/web/server.js', [
    ('Server error:',                           'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_ERROR_114'),
    ('[WEB SERVER] Failed to start:',           'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_START_113'),
    ('[WEB SERVER] Port',                       'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_PORT_BUSY_115'),
    ('[WEB SERVER] Permission denied',          'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_PORT_PERMS_116'),
])

# ─────────────────────────────────────────────────────────────────
# QUESTCORD — API controllers
# ─────────────────────────────────────────────────────────────────
qc_base = 'apps/questcord/src'
print('\nQuestCord API controllers')
for fname, code in [
    ('api/controllers/AchievementController.js', 'CUBSOFTWARE_ERROR_QUESTCORD_API_ACHIEVEMENT_117'),
    ('api/controllers/BossController.js',         'CUBSOFTWARE_ERROR_QUESTCORD_API_BOSS_118'),
    ('api/controllers/GuildController.js',        'CUBSOFTWARE_ERROR_QUESTCORD_API_GUILD_119'),
    ('api/controllers/LoginController.js',        'CUBSOFTWARE_ERROR_QUESTCORD_API_LOGIN_120'),
    ('api/controllers/QuestController.js',        'CUBSOFTWARE_ERROR_QUESTCORD_API_QUEST_121'),
    ('api/controllers/UserController.js',         'CUBSOFTWARE_ERROR_QUESTCORD_API_USER_122'),
    ('api/routes/v1.js',                          'CUBSOFTWARE_ERROR_QUESTCORD_API_ROUTES_123'),
]:
    rel = f'{qc_base}/{fname}'
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        print(f'  SKIP: {rel}')
        continue
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    changed = 0
    for i, line in enumerate(lines):
        if 'console.error' in line and 'CUBSOFTWARE_ERROR' not in line:
            new_line = line.replace("console.error('", f"console.error('{code} \u2014 ", 1)
            new_line = new_line.replace('console.error("', f'console.error("{code} \u2014 ', 1)
            new_line = new_line.replace('console.error(`', f'console.error(`{code} \u2014 ', 1)
            if new_line != line:
                lines[i] = new_line
                changed += 1
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'  UPDATED ({changed}): {fname}')

# ─────────────────────────────────────────────────────────────────
# QUESTCORD — bot commands
# ─────────────────────────────────────────────────────────────────
print('\nQuestCord bot commands')
for fname, code in [
    ('bot/commands/achievements.js',            'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ACHIEVEMENTS_124'),
    ('bot/commands/admin/admin.js',             'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/admin/admin-boss.js',        'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/admin/admin-debug.js',       'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/admin/admin-ipban.js',       'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/admin/admin-quest.js',       'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/admin/admin-server.js',      'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/admin/admin-user.js',        'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/admin/admin-whitelist.js',   'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125'),
    ('bot/commands/release-confinement.js',     'CUBSOFTWARE_ERROR_QUESTCORD_CMD_GENERAL_126'),
    ('bot/commands/solitary-confinement.js',    'CUBSOFTWARE_ERROR_QUESTCORD_CMD_GENERAL_126'),
    ('bot/commands/verify.js',                  'CUBSOFTWARE_ERROR_QUESTCORD_CMD_GENERAL_126'),
    ('bot/commands/website.js',                 'CUBSOFTWARE_ERROR_QUESTCORD_CMD_GENERAL_126'),
    ('bot/deploy-commands.js',                  'CUBSOFTWARE_ERROR_QUESTCORD_DEPLOY_COMMANDS_127'),
    ('bot/events/interactionCreate.js',         'CUBSOFTWARE_ERROR_QUESTCORD_EVENT_INTERACTION_128'),
    ('bot/events/ready.js',                     'CUBSOFTWARE_ERROR_QUESTCORD_EVENT_READY_129'),
    ('bot/events/voiceStateUpdate.js',          'CUBSOFTWARE_ERROR_QUESTCORD_EVENT_VOICE_130'),
    ('bot/index.js',                            'CUBSOFTWARE_ERROR_QUESTCORD_BOT_CORE_131'),
    ('bot/utils/bossManager.js',                'CUBSOFTWARE_ERROR_QUESTCORD_BOSS_MANAGER_132'),
    ('bot/utils/permissions.js',                'CUBSOFTWARE_ERROR_QUESTCORD_PERMISSIONS_133'),
    ('bot/utils/questInteractions.js',          'CUBSOFTWARE_ERROR_QUESTCORD_QUEST_INTERACTIONS_134'),
    ('bot/utils/questManager.js',               'CUBSOFTWARE_ERROR_QUESTCORD_QUEST_MANAGER_135'),
    ('database/maintenance.js',                 'CUBSOFTWARE_ERROR_QUESTCORD_DB_MAINTENANCE_136'),
    ('database/seedItems.js',                   'CUBSOFTWARE_ERROR_QUESTCORD_DB_SEED_137'),
    ('database/utils.js',                       'CUBSOFTWARE_ERROR_QUESTCORD_DB_UTILS_138'),
    ('services/gameEngine/BaseService.js',      'CUBSOFTWARE_ERROR_QUESTCORD_GAME_BASE_139'),
    ('services/gameEngine/GuildService.js',     'CUBSOFTWARE_ERROR_QUESTCORD_GAME_GUILD_140'),
    ('utils/debugLogger.js',                    'CUBSOFTWARE_ERROR_QUESTCORD_DEBUG_LOGGER_141'),
    ('utils/leaderboardScheduler.js',           'CUBSOFTWARE_ERROR_QUESTCORD_LEADERBOARD_142'),
    ('utils/reportingSystem.js',                'CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143'),
    ('web/auth/discordOAuth.js',                'CUBSOFTWARE_ERROR_QUESTCORD_OAUTH_144'),
    ('web/middleware/auth.js',                  'CUBSOFTWARE_ERROR_QUESTCORD_WEB_AUTH_145'),
    ('web/middleware/ipBan.js',                 'CUBSOFTWARE_ERROR_QUESTCORD_WEB_IPBAN_146'),
    ('web/routes/admin.js',                     'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_ADMIN_147'),
    ('web/routes/api.js',                       'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_API_148'),
    ('web/routes/auth.js',                      'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_AUTH_149'),
    ('web/routes/web.js',                       'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_WEB_150'),
]:
    rel = f'{qc_base}/{fname}'
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        continue
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    changed = 0
    for i, line in enumerate(lines):
        if 'console.error' in line and 'CUBSOFTWARE_ERROR' not in line:
            new_line = line.replace("console.error('", f"console.error('{code} \u2014 ", 1)
            new_line = new_line.replace('console.error("', f'console.error("{code} \u2014 ', 1)
            new_line = new_line.replace('console.error(`', f'console.error(`{code} \u2014 ', 1)
            if new_line != line:
                lines[i] = new_line
                changed += 1
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'  UPDATED ({changed}): {fname}')

# ─────────────────────────────────────────────────────────────────
# CLEANME
# ─────────────────────────────────────────────────────────────────
print('\nCleanMe')
tag_file_line_by_line('apps/cleanme-bot/index.js', [
    ('Error deploying commands:',           'CUBSOFTWARE_ERROR_CLEANME_DEPLOY_COMMANDS_151'),
    ('[Error] /',                           'CUBSOFTWARE_ERROR_CLEANME_CMD_HANDLER_152'),
    ('Save error:',                         'CUBSOFTWARE_ERROR_CLEANME_SAVE_ERROR_153'),
    ('Failed to create status channel:',    'CUBSOFTWARE_ERROR_CLEANME_STATUS_CHANNEL_154'),
    ('Copy error:',                         'CUBSOFTWARE_ERROR_CLEANME_COPY_ERROR_155'),
    ('[Error] Clean failed',                'CUBSOFTWARE_ERROR_CLEANME_CLEAN_FAILED_156'),
    ('CleanMe publish error:',              'CUBSOFTWARE_ERROR_CLEANME_PUBLISH_ERROR_157'),
])
tag_file_line_by_line('apps/cleanme-bot/deploy-commands.js', [
    ('console.error(error)',                'CUBSOFTWARE_ERROR_CLEANME_DEPLOY_COMMANDS_151'),
])

# ─────────────────────────────────────────────────────────────────
# WEBSITE — main.py
# ─────────────────────────────────────────────────────────────────
print('\nWebsite main.py')
tag_py_file('apps/cubsoftware-website/main.py', [
    ('Unified Discord login error:',                    'CUBSOFTWARE_ERROR_WEBSITE_DISCORD_LOGIN_158'),
    ('Unified Twitch login error:',                     'CUBSOFTWARE_ERROR_WEBSITE_TWITCH_LOGIN_159'),
    ('CUB PROTECTOR token not found',                   'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_TOKEN_160'),
    ('CUB PROTECTOR API error',                         'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_API_161'),
    ('CUB PROTECTOR API request failed:',               'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_REQUEST_162'),
    ('CUB PROTECTOR API rate limited after 5 retries:', 'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_RATELIMIT_163'),
    ('Failed to save hub data:',                        'CUBSOFTWARE_ERROR_WEBSITE_HUB_DATA_SAVE_164'),
    ('Failed to load',                                  'CUBSOFTWARE_ERROR_WEBSITE_FILE_LOAD_165'),
    ('Failed to save',                                  'CUBSOFTWARE_ERROR_WEBSITE_FILE_SAVE_166'),
    ('Failed to enqueue bot action:',                   'CUBSOFTWARE_ERROR_WEBSITE_BOT_ACTION_ENQUEUE_167'),
    ('ban_appeal_submit unhandled exception:',          'CUBSOFTWARE_ERROR_WEBSITE_BAN_APPEAL_SUBMIT_168'),
])

# ─────────────────────────────────────────────────────────────────
# ONION BOT
# ─────────────────────────────────────────────────────────────────
print('\nOnion Bot')
onion_base = '../The Onion Bot'
for fname, code in [
    ('events/interactionCreate.js',                'CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173'),
    ('events/voiceStateUpdate.js',                 'CUBSOFTWARE_ERROR_ONIONBOT_VOICE_STATE_174'),
    ('commands/solitary-confinement-context.js',   'CUBSOFTWARE_ERROR_ONIONBOT_CONFINEMENT_175'),
    ('commands/release-confinement-context.js',    'CUBSOFTWARE_ERROR_ONIONBOT_RELEASE_176'),
    ('utils/muteManager.js',                       'CUBSOFTWARE_ERROR_ONIONBOT_MUTE_USER_177'),
    ('utils/guildSettings.js',                     'CUBSOFTWARE_ERROR_ONIONBOT_GUILD_SETTINGS_178'),
    ('deploy-commands.js',                         'CUBSOFTWARE_ERROR_ONIONBOT_DEPLOY_COMMANDS_179'),
    ('deploy-one-by-one.js',                       'CUBSOFTWARE_ERROR_ONIONBOT_DEPLOY_COMMANDS_179'),
    ('commands-disabled/block-voice-channel.js',   'CUBSOFTWARE_ERROR_ONIONBOT_VOICE_BLOCK_182'),
    ('commands-disabled/unblock-voice-channel.js', 'CUBSOFTWARE_ERROR_ONIONBOT_VOICE_UNBLOCK_183'),
]:
    rel = f'{onion_base}/{fname}'
    path = os.path.join(ROOT, rel)
    if not os.path.exists(path):
        print(f'  SKIP (not found): {fname}')
        continue
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    changed = 0
    for i, line in enumerate(lines):
        if 'console.error' in line and 'CUBSOFTWARE_ERROR' not in line:
            new_line = line.replace("console.error('", f"console.error('{code} \u2014 ", 1)
            new_line = new_line.replace('console.error("', f'console.error("{code} \u2014 ', 1)
            new_line = new_line.replace('console.error(`', f'console.error(`{code} \u2014 ', 1)
            if new_line != line:
                lines[i] = new_line
                changed += 1
    if changed:
        with open(path, 'w', encoding='utf-8') as f:
            f.writelines(lines)
        print(f'  UPDATED ({changed}): {fname}')

tag_file_line_by_line(f'{onion_base}/config.js', [
    ('Missing required environment variables:',            'CUBSOFTWARE_ERROR_ONIONBOT_CONFIG_MISSING_180'),
    ('Please create a .env file with these variables.',   'CUBSOFTWARE_ERROR_ONIONBOT_CONFIG_MISSING_180'),
    ("See .env.example for reference.",                   'CUBSOFTWARE_ERROR_ONIONBOT_CONFIG_MISSING_180'),
    ('Bot cannot run without the ID',                     'CUBSOFTWARE_ERROR_ONIONBOT_CONFIG_CREATOR_181'),
    ('Please set CREATOR_ID=',                            'CUBSOFTWARE_ERROR_ONIONBOT_CONFIG_CREATOR_181'),
])

# ─────────────────────────────────────────────────────────────────
# SHARED UTILITIES
# ─────────────────────────────────────────────────────────────────
print('\nShared utilities')
tag_file_line_by_line('shared/discord-logger.js', [
    ('Failed to send Discord log:',        'CUBSOFTWARE_ERROR_SHARED_DISCORD_LOGGER_SEND_185'),
])
# The other discord-logger error is a pass-through (logs the error message itself) — skip it
tag_file_line_by_line('shared/discord-terminal.js', [
    ('Failed to save terminal users:',  'CUBSOFTWARE_ERROR_SHARED_TERMINAL_SAVE_USERS_186'),
    ("log() failed:",                   'CUBSOFTWARE_ERROR_SHARED_TERMINAL_LOG_187'),
    ("logEvent() failed:",              'CUBSOFTWARE_ERROR_SHARED_TERMINAL_LOG_EVENT_188'),
    ("Clear failed:",                   'CUBSOFTWARE_ERROR_SHARED_TERMINAL_CLEAR_189'),
    ("Terminal error in >",             'CUBSOFTWARE_ERROR_SHARED_TERMINAL_CMD_ERROR_190'),
])

# ─────────────────────────────────────────────────────────────────
# CUB PRESENCE APP
# ─────────────────────────────────────────────────────────────────
print('\nCubPresence app')
tag_file_line_by_line('apps/cubpresence-app/main.js', [
    ('Failed to load settings:',  'CUBSOFTWARE_ERROR_CUBPRESENCE_SETTINGS_LOAD_191'),
    ('Failed to save settings:',  'CUBSOFTWARE_ERROR_CUBPRESENCE_SETTINGS_SAVE_192'),
])

# ─────────────────────────────────────────────────────────────────
# CUBSOFTWARE APP
# ─────────────────────────────────────────────────────────────────
print('\nCubSoftware app')
tag_file_line_by_line('apps/cubsoftware-app/src/main.js', [
    ('Failed to connect to Discord RPC:',  'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_DISCORD_RPC_193'),
    ('Failed to fetch presence config:',   'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_PRESENCE_CONFIG_194'),
    ('Failed to refresh token:',           'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_TOKEN_REFRESH_195'),
    ('Failed to update presence:',         'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_PRESENCE_UPDATE_196'),
])

# ─────────────────────────────────────────────────────────────────
# CUBVAULT (TypeScript source files)
# ─────────────────────────────────────────────────────────────────
print('\nCubVault')
tag_file_line_by_line('apps/cubvault/database.ts', [
    ('Failed to create vault:',    'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_CREATE_197'),
    ('Failed to unlock vault:',    'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_UNLOCK_198'),
    ('Failed to change password:', 'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_PASSWORD_199'),
])
tag_file_line_by_line('apps/cubvault/desktop/renderer/components/Dashboard.tsx', [
    ('Failed to get stats:',  'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_STATS_200'),
])

print('\nAll done!')
