/**
 * CUB SOFTWARE Error Reporter
 *
 * Provides structured error reporting with custom error codes, PM2 logging,
 * and Discord incident channel posting for all CUB SOFTWARE bots.
 *
 * Usage:
 *   const { createErrorReporter, ERRORS } = require('../../shared/cub-error-reporter');
 *   const reporter = createErrorReporter(client, 'CUB PROTECTOR');
 *   await reporter.report(ERRORS.CUBPROTECTOR.TEMPVC_MOVE, 'Failed to move user', { userId }, err);
 */

// ============================================================
// Error Code Catalog  (globally unique numbers 001–168)
// ============================================================
const ERRORS = {

    // ── CUB PROTECTOR — core  (001–010) ────────────────────
    CUBPROTECTOR: {
        TEMPVC_CREATE:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_TEMPVC_CREATE_001',
        TEMPVC_MOVE:            'CUBSOFTWARE_ERROR_CUBPROTECTOR_TEMPVC_MOVE_002',
        TEMPVC_DELETE:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_TEMPVC_DELETE_003',
        TEMPVC_ORPHAN:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_TEMPVC_ORPHAN_004',
        CMD_FAILED:             'CUBSOFTWARE_ERROR_CUBPROTECTOR_CMD_FAILED_005',
        DATA_LOAD:              'CUBSOFTWARE_ERROR_CUBPROTECTOR_DATA_LOAD_006',
        DATA_SAVE:              'CUBSOFTWARE_ERROR_CUBPROTECTOR_DATA_SAVE_007',
        FATAL_REJECTION:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_FATAL_REJECTION_008',
        FATAL_EXCEPTION:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_FATAL_EXCEPTION_009',
        LOGIN_FAILED:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_LOGIN_FAILED_010',

        // ── CUB PROTECTOR — index.js  (033–069) ─────────────
        CMDSYNC_GUILD:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_CMDSYNC_GUILD_033',
        TEMPVC_DATALOAD:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_TEMPVC_DATALOAD_034',
        TEMPVC_DATASAVE:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_TEMPVC_DATASAVE_035',
        MOD_DATALOAD:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_MOD_DATALOAD_036',
        MOD_DATASAVE:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_MOD_DATASAVE_037',
        FILE_LOAD:              'CUBSOFTWARE_ERROR_CUBPROTECTOR_FILE_LOAD_038',
        FILE_SAVE:              'CUBSOFTWARE_ERROR_CUBPROTECTOR_FILE_SAVE_039',
        CMDREG_FAILED:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_CMDREG_FAILED_040',
        CMDSYNC_FAILED:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_CMDSYNC_FAILED_041',
        KEEPALIVE_TIMER:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_KEEPALIVE_TIMER_042',
        CUBREACTIVE_JOIN:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBREACTIVE_JOIN_043',
        CUBREACTIVE_MSG:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBREACTIVE_MSG_044',
        CUBREACTIVE_BOTJOIN:    'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBREACTIVE_BOTJOIN_045',
        CUBREACTIVE_PEER:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBREACTIVE_PEER_046',
        CUBREACTIVE_BOTPEER:    'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBREACTIVE_BOTPEER_047',
        MODMAIL_DM:             'CUBSOFTWARE_ERROR_CUBPROTECTOR_MODMAIL_DM_048',
        MODMAIL_STAFF:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_MODMAIL_STAFF_049',
        MODMAIL_CONTACT:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_MODMAIL_CONTACT_050',
        MODMAIL_CLOSE:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_MODMAIL_CLOSE_051',
        AUTOROLE_ASSIGN:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_AUTOROLE_ASSIGN_052',
        AUTOROLE_EVENT:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_AUTOROLE_EVENT_053',
        SELFROLE_ADD:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_SELFROLE_ADD_054',
        BAN_FAILED:             'CUBSOFTWARE_ERROR_CUBPROTECTOR_BAN_FAILED_055',
        KICK_FAILED:            'CUBSOFTWARE_ERROR_CUBPROTECTOR_KICK_FAILED_056',
        MUTE_FAILED:            'CUBSOFTWARE_ERROR_CUBPROTECTOR_MUTE_FAILED_057',
        RANKCARD_GEN:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_RANKCARD_GEN_058',
        RANKCARD_PREVIEW:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_RANKCARD_PREVIEW_059',
        CUBAI_HANDLER:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_HANDLER_060',
        UNBAN_FAILED:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_UNBAN_FAILED_061',
        APPEAL_REVIEW:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_APPEAL_REVIEW_062',
        CUSTOMBOT_FILE:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUSTOMBOT_FILE_063',
        ALERTS_DELETE:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_ALERTS_DELETE_064',
        ALERTS_CHANNEL:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_ALERTS_CHANNEL_065',
        ALERTS_UNEXPECTED:      'CUBSOFTWARE_ERROR_CUBPROTECTOR_ALERTS_UNEXPECTED_066',
        SELFROLES_RESTORE:      'CUBSOFTWARE_ERROR_CUBPROTECTOR_SELFROLES_RESTORE_067',
        CUBAI_GIT_CLEANUP:      'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_GIT_CLEANUP_068',
        SUGGESTIONS_QUEUE:      'CUBSOFTWARE_ERROR_CUBPROTECTOR_SUGGESTIONS_QUEUE_069',

        // ── CUB PROTECTOR — cubai.js  (070–095) ─────────────
        CUBAI_WHISPER_CRASH:    'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WHISPER_CRASH_070',
        CUBAI_WHISPER_PROCESS:  'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WHISPER_PROCESS_071',
        CUBAI_PLAYER:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_PLAYER_072',
        CUBAI_TTS:              'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TTS_073',
        CUBAI_DRAINQUEUE:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_DRAINQUEUE_074',
        CUBAI_TRIVIA:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TRIVIA_075',
        CUBAI_ROAST:            'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_ROAST_076',
        CUBAI_WORDASSOC:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WORDASSOC_077',
        CUBAI_20Q_START:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_20QSTART_078',
        CUBAI_20Q_ANSWER:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_20QANSWER_079',
        CUBAI_IMPERSONATE:      'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_IMPERSONATE_080',
        CUBAI_RAPBATTLE:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_RAPBATTLE_081',
        CUBAI_HOTTAKE:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_HOTTAKE_082',
        CUBAI_HOROSCOPE:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_HOROSCOPE_083',
        CUBAI_CONSPIRACY:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_CONSPIRACY_084',
        CUBAI_TRANSLATOR:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TRANSLATOR_085',
        CUBAI_TWOTRUTHS:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_TWOTRUTHS_086',
        CUBAI_JUDGE:            'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_JUDGE_087',
        CUBAI_UTTERANCE:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_UTTERANCE_088',
        CUBAI_UNDEAFEN:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_UNDEAFEN_089',
        CUBAI_WELCOME_TTS:      'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_WELCOMETTS_090',
        CUBAI_ANNOUNCE:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_ANNOUNCE_091',
        CUBAI_CONNECTION:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_CONNECTION_092',
        CUBAI_UNHANDLED:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_UNHANDLED_093',
        CUBAI_DECODER:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_DECODER_094',
        CUBAI_ASK:              'CUBSOFTWARE_ERROR_CUBPROTECTOR_CUBAI_ASK_095',

        // ── CUB PROTECTOR — podcast.js  (096–111) ───────────
        PODCAST_FFMPEG:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_FFMPEG_096',
        PODCAST_CONNECTION:     'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_CONNECTION_097',
        PODCAST_AUTOPLAY:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_AUTOPLAY_098',
        PODCAST_PLAYER:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_PLAYER_099',
        PODCAST_PLAY:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_PLAY_100',
        PODCAST_PODPLAY:        'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_PODPLAY_101',
        PODCAST_SEARCH:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SEARCH_102',
        PODCAST_BROWSE:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_BROWSE_103',
        PODCAST_EPISODES:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_EPISODES_104',
        PODCAST_SKIP:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SKIP_105',
        PODCAST_SPEED:          'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SPEED_106',
        PODCAST_VOLUME:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_VOLUME_107',
        PODCAST_SEEK:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SEEK_108',
        PODCAST_TRENDING:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_TRENDING_109',
        PODCAST_CONTINUE:       'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_CONTINUE_110',
        PODCAST_SELECT:         'CUBSOFTWARE_ERROR_CUBPROTECTOR_PODCAST_SELECT_111',

        // ── CUB PROTECTOR — start.js  (112) ─────────────────
        STARTUP_DEPS:           'CUBSOFTWARE_ERROR_CUBPROTECTOR_STARTUP_DEPS_112',
    },

    // ── QUESTCORD — core  (011–017) ────────────────────────
    QUESTCORD: {
        WS_CLIENT_ERROR:        'CUBSOFTWARE_ERROR_QUESTCORD_WS_CLIENT_ERROR_011',
        DB_QUERY:               'CUBSOFTWARE_ERROR_QUESTCORD_DB_QUERY_012',
        DB_MIGRATION:           'CUBSOFTWARE_ERROR_QUESTCORD_DB_MIGRATION_013',
        CMD_FAILED:             'CUBSOFTWARE_ERROR_QUESTCORD_CMD_FAILED_014',
        FATAL_REJECTION:        'CUBSOFTWARE_ERROR_QUESTCORD_FATAL_REJECTION_015',
        FATAL_EXCEPTION:        'CUBSOFTWARE_ERROR_QUESTCORD_FATAL_EXCEPTION_016',
        LOGIN_FAILED:           'CUBSOFTWARE_ERROR_QUESTCORD_LOGIN_FAILED_017',

        // ── QUESTCORD — web/server.js  (113–116) ────────────
        SERVER_START:           'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_START_113',
        SERVER_ERROR:           'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_ERROR_114',
        SERVER_PORT_BUSY:       'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_PORT_BUSY_115',
        SERVER_PORT_PERMS:      'CUBSOFTWARE_ERROR_QUESTCORD_SERVER_PORT_PERMS_116',

        // ── QUESTCORD — API controllers  (117–123) ──────────
        API_ACHIEVEMENT:        'CUBSOFTWARE_ERROR_QUESTCORD_API_ACHIEVEMENT_117',
        API_BOSS:               'CUBSOFTWARE_ERROR_QUESTCORD_API_BOSS_118',
        API_GUILD:              'CUBSOFTWARE_ERROR_QUESTCORD_API_GUILD_119',
        API_LOGIN:              'CUBSOFTWARE_ERROR_QUESTCORD_API_LOGIN_120',
        API_QUEST:              'CUBSOFTWARE_ERROR_QUESTCORD_API_QUEST_121',
        API_USER:               'CUBSOFTWARE_ERROR_QUESTCORD_API_USER_122',
        API_ROUTES:             'CUBSOFTWARE_ERROR_QUESTCORD_API_ROUTES_123',

        // ── QUESTCORD — bot commands  (124–126) ─────────────
        CMD_ACHIEVEMENTS:       'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ACHIEVEMENTS_124',
        CMD_ADMIN:              'CUBSOFTWARE_ERROR_QUESTCORD_CMD_ADMIN_125',
        CMD_GENERAL:            'CUBSOFTWARE_ERROR_QUESTCORD_CMD_GENERAL_126',

        // ── QUESTCORD — bot infrastructure  (127–131) ───────
        DEPLOY_COMMANDS:        'CUBSOFTWARE_ERROR_QUESTCORD_DEPLOY_COMMANDS_127',
        EVENT_INTERACTION:      'CUBSOFTWARE_ERROR_QUESTCORD_EVENT_INTERACTION_128',
        EVENT_READY:            'CUBSOFTWARE_ERROR_QUESTCORD_EVENT_READY_129',
        EVENT_VOICE:            'CUBSOFTWARE_ERROR_QUESTCORD_EVENT_VOICE_130',
        BOT_CORE:               'CUBSOFTWARE_ERROR_QUESTCORD_BOT_CORE_131',

        // ── QUESTCORD — utils  (132–135) ────────────────────
        BOSS_MANAGER:           'CUBSOFTWARE_ERROR_QUESTCORD_BOSS_MANAGER_132',
        PERMISSIONS:            'CUBSOFTWARE_ERROR_QUESTCORD_PERMISSIONS_133',
        QUEST_INTERACTIONS:     'CUBSOFTWARE_ERROR_QUESTCORD_QUEST_INTERACTIONS_134',
        QUEST_MANAGER:          'CUBSOFTWARE_ERROR_QUESTCORD_QUEST_MANAGER_135',

        // ── QUESTCORD — database  (136–138) ─────────────────
        DB_MAINTENANCE:         'CUBSOFTWARE_ERROR_QUESTCORD_DB_MAINTENANCE_136',
        DB_SEED:                'CUBSOFTWARE_ERROR_QUESTCORD_DB_SEED_137',
        DB_UTILS:               'CUBSOFTWARE_ERROR_QUESTCORD_DB_UTILS_138',

        // ── QUESTCORD — game engine  (139–140) ──────────────
        GAME_BASE:              'CUBSOFTWARE_ERROR_QUESTCORD_GAME_BASE_139',
        GAME_GUILD:             'CUBSOFTWARE_ERROR_QUESTCORD_GAME_GUILD_140',

        // ── QUESTCORD — utilities  (141–143) ────────────────
        DEBUG_LOGGER:           'CUBSOFTWARE_ERROR_QUESTCORD_DEBUG_LOGGER_141',
        LEADERBOARD:            'CUBSOFTWARE_ERROR_QUESTCORD_LEADERBOARD_142',
        REPORTING:              'CUBSOFTWARE_ERROR_QUESTCORD_REPORTING_143',

        // ── QUESTCORD — web layer  (144–150) ────────────────
        OAUTH:                  'CUBSOFTWARE_ERROR_QUESTCORD_OAUTH_144',
        WEB_AUTH:               'CUBSOFTWARE_ERROR_QUESTCORD_WEB_AUTH_145',
        WEB_IPBAN:              'CUBSOFTWARE_ERROR_QUESTCORD_WEB_IPBAN_146',
        WEB_ROUTES_ADMIN:       'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_ADMIN_147',
        WEB_ROUTES_API:         'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_API_148',
        WEB_ROUTES_AUTH:        'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_AUTH_149',
        WEB_ROUTES_WEB:         'CUBSOFTWARE_ERROR_QUESTCORD_WEB_ROUTES_WEB_150',
    },

    // ── CLEANME BOT — core  (018–023) ──────────────────────
    CLEANME: {
        CMD_FAILED:             'CUBSOFTWARE_ERROR_CLEANME_CMD_FAILED_018',
        SERVER_SAVE:            'CUBSOFTWARE_ERROR_CLEANME_SERVER_SAVE_019',
        SERVER_LOAD:            'CUBSOFTWARE_ERROR_CLEANME_SERVER_LOAD_020',
        FATAL_REJECTION:        'CUBSOFTWARE_ERROR_CLEANME_FATAL_REJECTION_021',
        FATAL_EXCEPTION:        'CUBSOFTWARE_ERROR_CLEANME_FATAL_EXCEPTION_022',
        LOGIN_FAILED:           'CUBSOFTWARE_ERROR_CLEANME_LOGIN_FAILED_023',

        // ── CLEANME — additional  (151–157) ─────────────────
        DEPLOY_COMMANDS:        'CUBSOFTWARE_ERROR_CLEANME_DEPLOY_COMMANDS_151',
        CMD_HANDLER:            'CUBSOFTWARE_ERROR_CLEANME_CMD_HANDLER_152',
        SAVE_ERROR:             'CUBSOFTWARE_ERROR_CLEANME_SAVE_ERROR_153',
        STATUS_CHANNEL:         'CUBSOFTWARE_ERROR_CLEANME_STATUS_CHANNEL_154',
        COPY_ERROR:             'CUBSOFTWARE_ERROR_CLEANME_COPY_ERROR_155',
        CLEAN_FAILED:           'CUBSOFTWARE_ERROR_CLEANME_CLEAN_FAILED_156',
        PUBLISH_ERROR:          'CUBSOFTWARE_ERROR_CLEANME_PUBLISH_ERROR_157',
    },

    // ── CUB SOFTWARE WEBSITE — core  (024–027) ─────────────
    WEBSITE: {
        API_HANDLER:            'CUBSOFTWARE_ERROR_WEBSITE_API_HANDLER_024',
        PM2_COMMAND:            'CUBSOFTWARE_ERROR_WEBSITE_PM2_COMMAND_025',
        SESSION_ERROR:          'CUBSOFTWARE_ERROR_WEBSITE_SESSION_ERROR_026',
        FATAL_EXCEPTION:        'CUBSOFTWARE_ERROR_WEBSITE_FATAL_EXCEPTION_027',

        // ── WEBSITE — additional  (158–168) ─────────────────
        DISCORD_LOGIN:          'CUBSOFTWARE_ERROR_WEBSITE_DISCORD_LOGIN_158',
        TWITCH_LOGIN:           'CUBSOFTWARE_ERROR_WEBSITE_TWITCH_LOGIN_159',
        CUBPROTECTOR_TOKEN:     'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_TOKEN_160',
        CUBPROTECTOR_API:       'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_API_161',
        CUBPROTECTOR_REQUEST:   'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_REQUEST_162',
        CUBPROTECTOR_RATELIMIT: 'CUBSOFTWARE_ERROR_WEBSITE_CUBPROTECTOR_RATELIMIT_163',
        HUB_DATA_SAVE:          'CUBSOFTWARE_ERROR_WEBSITE_HUB_DATA_SAVE_164',
        FILE_LOAD:              'CUBSOFTWARE_ERROR_WEBSITE_FILE_LOAD_165',
        FILE_SAVE:              'CUBSOFTWARE_ERROR_WEBSITE_FILE_SAVE_166',
        BOT_ACTION_ENQUEUE:     'CUBSOFTWARE_ERROR_WEBSITE_BOT_ACTION_ENQUEUE_167',
        BAN_APPEAL_SUBMIT:      'CUBSOFTWARE_ERROR_WEBSITE_BAN_APPEAL_SUBMIT_168',
    },

    // ── CUBDECK  (028–032) ──────────────────────────────────
    CUBDECK: {
        DECK_LOAD:              'CUBSOFTWARE_ERROR_CUBDECK_DECK_LOAD_028',
        DECK_SAVE:              'CUBSOFTWARE_ERROR_CUBDECK_DECK_SAVE_029',
        OVERLAY_POLL:           'CUBSOFTWARE_ERROR_CUBDECK_OVERLAY_POLL_030',
        AUTH_FAILED:            'CUBSOFTWARE_ERROR_CUBDECK_AUTH_FAILED_031',
        FATAL_EXCEPTION:        'CUBSOFTWARE_ERROR_CUBDECK_FATAL_EXCEPTION_032',
    },

    // ── ONION BOT  (169–183) ────────────────────────────────
    ONIONBOT: {
        LOGIN_FAILED:           'CUBSOFTWARE_ERROR_ONIONBOT_LOGIN_FAILED_169',
        DEPLOY_FAILED:          'CUBSOFTWARE_ERROR_ONIONBOT_DEPLOY_FAILED_170',
        FATAL_EXCEPTION:        'CUBSOFTWARE_ERROR_ONIONBOT_FATAL_EXCEPTION_171',
        FATAL_REJECTION:        'CUBSOFTWARE_ERROR_ONIONBOT_FATAL_REJECTION_172',
        CMD_INTERACTION:        'CUBSOFTWARE_ERROR_ONIONBOT_CMD_INTERACTION_173',
        VOICE_STATE:            'CUBSOFTWARE_ERROR_ONIONBOT_VOICE_STATE_174',
        CONFINEMENT:            'CUBSOFTWARE_ERROR_ONIONBOT_CONFINEMENT_175',
        RELEASE:                'CUBSOFTWARE_ERROR_ONIONBOT_RELEASE_176',
        MUTE_USER:              'CUBSOFTWARE_ERROR_ONIONBOT_MUTE_USER_177',
        GUILD_SETTINGS:         'CUBSOFTWARE_ERROR_ONIONBOT_GUILD_SETTINGS_178',
        DEPLOY_COMMANDS:        'CUBSOFTWARE_ERROR_ONIONBOT_DEPLOY_COMMANDS_179',
        CONFIG_MISSING:         'CUBSOFTWARE_ERROR_ONIONBOT_CONFIG_MISSING_180',
        CONFIG_CREATOR:         'CUBSOFTWARE_ERROR_ONIONBOT_CONFIG_CREATOR_181',
        VOICE_BLOCK:            'CUBSOFTWARE_ERROR_ONIONBOT_VOICE_BLOCK_182',
        VOICE_UNBLOCK:          'CUBSOFTWARE_ERROR_ONIONBOT_VOICE_UNBLOCK_183',
    },

    // ── SHARED UTILITIES  (184–190) ─────────────────────────
    SHARED: {
        DISCORD_LOGGER_LOG:     'CUBSOFTWARE_ERROR_SHARED_DISCORD_LOGGER_LOG_184',
        DISCORD_LOGGER_SEND:    'CUBSOFTWARE_ERROR_SHARED_DISCORD_LOGGER_SEND_185',
        TERMINAL_SAVE_USERS:    'CUBSOFTWARE_ERROR_SHARED_TERMINAL_SAVE_USERS_186',
        TERMINAL_LOG:           'CUBSOFTWARE_ERROR_SHARED_TERMINAL_LOG_187',
        TERMINAL_LOG_EVENT:     'CUBSOFTWARE_ERROR_SHARED_TERMINAL_LOG_EVENT_188',
        TERMINAL_CLEAR:         'CUBSOFTWARE_ERROR_SHARED_TERMINAL_CLEAR_189',
        TERMINAL_CMD_ERROR:     'CUBSOFTWARE_ERROR_SHARED_TERMINAL_CMD_ERROR_190',
    },

    // ── CUB PRESENCE APP  (191–192) ─────────────────────────
    CUBPRESENCE: {
        SETTINGS_LOAD:          'CUBSOFTWARE_ERROR_CUBPRESENCE_SETTINGS_LOAD_191',
        SETTINGS_SAVE:          'CUBSOFTWARE_ERROR_CUBPRESENCE_SETTINGS_SAVE_192',
    },

    // ── CUBSOFTWARE APP  (193–196) ──────────────────────────
    CUBSOFTWARE_APP: {
        DISCORD_RPC:            'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_DISCORD_RPC_193',
        PRESENCE_CONFIG:        'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_PRESENCE_CONFIG_194',
        TOKEN_REFRESH:          'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_TOKEN_REFRESH_195',
        PRESENCE_UPDATE:        'CUBSOFTWARE_ERROR_CUBSOFTWARE_APP_PRESENCE_UPDATE_196',
    },

    // ── CUBVAULT  (197–200) ─────────────────────────────────
    CUBVAULT: {
        VAULT_CREATE:           'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_CREATE_197',
        VAULT_UNLOCK:           'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_UNLOCK_198',
        VAULT_PASSWORD:         'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_PASSWORD_199',
        VAULT_STATS:            'CUBSOFTWARE_ERROR_CUBVAULT_VAULT_STATS_200',
    },
};

// ============================================================
// Human-readable catalog
// ============================================================
const ERROR_CATALOG = [
    // ── CUB PROTECTOR — core ────────────────────────────────
    { code: ERRORS.CUBPROTECTOR.TEMPVC_CREATE,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to create temporary voice channel' },
    { code: ERRORS.CUBPROTECTOR.TEMPVC_MOVE,           app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to move user to temporary voice channel' },
    { code: ERRORS.CUBPROTECTOR.TEMPVC_DELETE,         app: 'CUB PROTECTOR', severity: 'warning', desc: 'Failed to delete empty temporary voice channel' },
    { code: ERRORS.CUBPROTECTOR.TEMPVC_ORPHAN,         app: 'CUB PROTECTOR', severity: 'warning', desc: 'Orphaned channel cleaned up after failed move' },
    { code: ERRORS.CUBPROTECTOR.CMD_FAILED,            app: 'CUB PROTECTOR', severity: 'error',   desc: 'Slash command interaction failed' },
    { code: ERRORS.CUBPROTECTOR.DATA_LOAD,             app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to load persistent data file' },
    { code: ERRORS.CUBPROTECTOR.DATA_SAVE,             app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to save persistent data file' },
    { code: ERRORS.CUBPROTECTOR.FATAL_REJECTION,       app: 'CUB PROTECTOR', severity: 'fatal',   desc: 'Unhandled Promise Rejection' },
    { code: ERRORS.CUBPROTECTOR.FATAL_EXCEPTION,       app: 'CUB PROTECTOR', severity: 'fatal',   desc: 'Uncaught Exception — process will exit' },
    { code: ERRORS.CUBPROTECTOR.LOGIN_FAILED,          app: 'CUB PROTECTOR', severity: 'fatal',   desc: 'Discord client.login() failed' },
    // ── CUB PROTECTOR — index.js ────────────────────────────
    { code: ERRORS.CUBPROTECTOR.CMDSYNC_GUILD,         app: 'CUB PROTECTOR', severity: 'warning', desc: 'Auto-sync commands failed for a guild' },
    { code: ERRORS.CUBPROTECTOR.TEMPVC_DATALOAD,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to load temp voice channel data' },
    { code: ERRORS.CUBPROTECTOR.TEMPVC_DATASAVE,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to save temp voice channel data' },
    { code: ERRORS.CUBPROTECTOR.MOD_DATALOAD,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to load moderation data' },
    { code: ERRORS.CUBPROTECTOR.MOD_DATASAVE,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to save moderation data' },
    { code: ERRORS.CUBPROTECTOR.FILE_LOAD,             app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to load a JSON data file' },
    { code: ERRORS.CUBPROTECTOR.FILE_SAVE,             app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to save a JSON data file' },
    { code: ERRORS.CUBPROTECTOR.CMDREG_FAILED,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to register slash commands' },
    { code: ERRORS.CUBPROTECTOR.CMDSYNC_FAILED,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to sync commands for a guild' },
    { code: ERRORS.CUBPROTECTOR.KEEPALIVE_TIMER,       app: 'CUB PROTECTOR', severity: 'warning', desc: 'Keep-alive timer encountered an error' },
    { code: ERRORS.CUBPROTECTOR.CUBREACTIVE_JOIN,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'CubReactive failed to join voice channel' },
    { code: ERRORS.CUBPROTECTOR.CUBREACTIVE_MSG,       app: 'CUB PROTECTOR', severity: 'warning', desc: 'CubReactive WebSocket message error' },
    { code: ERRORS.CUBPROTECTOR.CUBREACTIVE_BOTJOIN,   app: 'CUB PROTECTOR', severity: 'error',   desc: 'Custom bot failed to join voice via CubReactive' },
    { code: ERRORS.CUBPROTECTOR.CUBREACTIVE_PEER,      app: 'CUB PROTECTOR', severity: 'warning', desc: 'CubReactive bot peer message error' },
    { code: ERRORS.CUBPROTECTOR.CUBREACTIVE_BOTPEER,   app: 'CUB PROTECTOR', severity: 'error',   desc: 'CubReactive startCrBotPeer failed' },
    { code: ERRORS.CUBPROTECTOR.MODMAIL_DM,            app: 'CUB PROTECTOR', severity: 'error',   desc: 'Modmail DM relay error' },
    { code: ERRORS.CUBPROTECTOR.MODMAIL_STAFF,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'Modmail staff relay error' },
    { code: ERRORS.CUBPROTECTOR.MODMAIL_CONTACT,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'Modmail contact command error' },
    { code: ERRORS.CUBPROTECTOR.MODMAIL_CLOSE,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'Modmail close command error' },
    { code: ERRORS.CUBPROTECTOR.AUTOROLE_ASSIGN,       app: 'CUB PROTECTOR', severity: 'warning', desc: 'AutoRole failed to assign a role to a member' },
    { code: ERRORS.CUBPROTECTOR.AUTOROLE_EVENT,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'AutoRole guildMemberAdd handler error' },
    { code: ERRORS.CUBPROTECTOR.SELFROLE_ADD,          app: 'CUB PROTECTOR', severity: 'warning', desc: 'Self-role add failed' },
    { code: ERRORS.CUBPROTECTOR.BAN_FAILED,            app: 'CUB PROTECTOR', severity: 'error',   desc: 'Ban command failed' },
    { code: ERRORS.CUBPROTECTOR.KICK_FAILED,           app: 'CUB PROTECTOR', severity: 'error',   desc: 'Kick command failed' },
    { code: ERRORS.CUBPROTECTOR.MUTE_FAILED,           app: 'CUB PROTECTOR', severity: 'error',   desc: 'Mute command failed' },
    { code: ERRORS.CUBPROTECTOR.RANKCARD_GEN,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'Rank card generation error' },
    { code: ERRORS.CUBPROTECTOR.RANKCARD_PREVIEW,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'Rank card preview error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_HANDLER,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI interaction handler error (index.js)' },
    { code: ERRORS.CUBPROTECTOR.UNBAN_FAILED,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'Unban command failed' },
    { code: ERRORS.CUBPROTECTOR.APPEAL_REVIEW,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'Appeal review action error' },
    { code: ERRORS.CUBPROTECTOR.CUSTOMBOT_FILE,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Failed to update custom_bots.json on guildDelete' },
    { code: ERRORS.CUBPROTECTOR.ALERTS_DELETE,         app: 'CUB PROTECTOR', severity: 'warning', desc: 'Live alert auto-delete failed' },
    { code: ERRORS.CUBPROTECTOR.ALERTS_CHANNEL,        app: 'CUB PROTECTOR', severity: 'warning', desc: 'Could not fetch live alert channel' },
    { code: ERRORS.CUBPROTECTOR.ALERTS_UNEXPECTED,     app: 'CUB PROTECTOR', severity: 'error',   desc: 'Unexpected error during live alert auto-delete' },
    { code: ERRORS.CUBPROTECTOR.SELFROLES_RESTORE,     app: 'CUB PROTECTOR', severity: 'error',   desc: 'SelfRoles failed to restore category in guild' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_GIT_CLEANUP,     app: 'CUB PROTECTOR', severity: 'warning', desc: 'CUB AI temp file git cleanup error' },
    { code: ERRORS.CUBPROTECTOR.SUGGESTIONS_QUEUE,     app: 'CUB PROTECTOR', severity: 'error',   desc: 'Suggestions bot queue action failed' },
    // ── CUB PROTECTOR — cubai.js ────────────────────────────
    { code: ERRORS.CUBPROTECTOR.CUBAI_WHISPER_CRASH,   app: 'CUB PROTECTOR', severity: 'fatal',   desc: 'Whisper process crashed on startup — Python deps missing' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_WHISPER_PROCESS, app: 'CUB PROTECTOR', severity: 'error',   desc: 'Whisper process runtime error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_PLAYER,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI audio player error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_TTS,             app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI TTS/playback error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_DRAINQUEUE,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI drain play queue error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_TRIVIA,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI trivia start error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_ROAST,           app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI roast command error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_WORDASSOC,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI word association bot reply error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_20Q_START,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI 20 Questions start error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_20Q_ANSWER,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI 20 Questions answer error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_IMPERSONATE,     app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI impersonate command error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_RAPBATTLE,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI rap battle error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_HOTTAKE,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI hot take error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_HOROSCOPE,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI horoscope error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_CONSPIRACY,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI conspiracy theory error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_TRANSLATOR,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI fake translator error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_TWOTRUTHS,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI two truths error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_JUDGE,           app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI court judge error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_UTTERANCE,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI utterance processing error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_UNDEAFEN,        app: 'CUB PROTECTOR', severity: 'warning', desc: 'CUB AI failed to undeafen user' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_WELCOME_TTS,     app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI welcome TTS error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_ANNOUNCE,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI announceReady error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_CONNECTION,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI voice connection error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_UNHANDLED,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI unhandled utterance error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_DECODER,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI decoder error' },
    { code: ERRORS.CUBPROTECTOR.CUBAI_ASK,             app: 'CUB PROTECTOR', severity: 'error',   desc: 'CUB AI ask command error' },
    // ── CUB PROTECTOR — podcast.js ──────────────────────────
    { code: ERRORS.CUBPROTECTOR.PODCAST_FFMPEG,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast ffmpeg process error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_CONNECTION,    app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast voice connection error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_AUTOPLAY,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast auto-play next episode error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_PLAYER,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast audio player error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_PLAY,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast play command error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_PODPLAY,       app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast podcastPlay handler error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_SEARCH,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast search error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_BROWSE,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast browse error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_EPISODES,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast episodes fetch error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_SKIP,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast skip fetch error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_SPEED,         app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast speed change error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_VOLUME,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast volume restart error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_SEEK,          app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast seek error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_TRENDING,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast trending fetch error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_CONTINUE,      app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast continue error' },
    { code: ERRORS.CUBPROTECTOR.PODCAST_SELECT,        app: 'CUB PROTECTOR', severity: 'error',   desc: 'Podcast select handler error' },
    { code: ERRORS.CUBPROTECTOR.STARTUP_DEPS,          app: 'CUB PROTECTOR', severity: 'fatal',   desc: 'Failed to install dependencies on startup' },

    // ── QUESTCORD ───────────────────────────────────────────
    { code: ERRORS.QUESTCORD.WS_CLIENT_ERROR,          app: 'QuestCord', severity: 'warning', desc: 'WebSocket client error (e.g. RSV1 / protocol mismatch)' },
    { code: ERRORS.QUESTCORD.DB_QUERY,                 app: 'QuestCord', severity: 'error',   desc: 'Database query failed' },
    { code: ERRORS.QUESTCORD.DB_MIGRATION,             app: 'QuestCord', severity: 'fatal',   desc: 'Database migration failed' },
    { code: ERRORS.QUESTCORD.CMD_FAILED,               app: 'QuestCord', severity: 'error',   desc: 'Slash command interaction failed' },
    { code: ERRORS.QUESTCORD.FATAL_REJECTION,          app: 'QuestCord', severity: 'fatal',   desc: 'Unhandled Promise Rejection' },
    { code: ERRORS.QUESTCORD.FATAL_EXCEPTION,          app: 'QuestCord', severity: 'fatal',   desc: 'Uncaught Exception — process will exit' },
    { code: ERRORS.QUESTCORD.LOGIN_FAILED,             app: 'QuestCord', severity: 'fatal',   desc: 'Discord client.login() / initialization failed' },
    { code: ERRORS.QUESTCORD.SERVER_START,             app: 'QuestCord', severity: 'fatal',   desc: 'Web server failed to start' },
    { code: ERRORS.QUESTCORD.SERVER_ERROR,             app: 'QuestCord', severity: 'error',   desc: 'General HTTP server error' },
    { code: ERRORS.QUESTCORD.SERVER_PORT_BUSY,         app: 'QuestCord', severity: 'fatal',   desc: 'Server port already in use' },
    { code: ERRORS.QUESTCORD.SERVER_PORT_PERMS,        app: 'QuestCord', severity: 'fatal',   desc: 'Server port requires elevated privileges' },
    { code: ERRORS.QUESTCORD.API_ACHIEVEMENT,          app: 'QuestCord', severity: 'error',   desc: 'Achievement API controller error' },
    { code: ERRORS.QUESTCORD.API_BOSS,                 app: 'QuestCord', severity: 'error',   desc: 'Boss API controller error' },
    { code: ERRORS.QUESTCORD.API_GUILD,                app: 'QuestCord', severity: 'error',   desc: 'Guild API controller error' },
    { code: ERRORS.QUESTCORD.API_LOGIN,                app: 'QuestCord', severity: 'error',   desc: 'Login/auth API controller error' },
    { code: ERRORS.QUESTCORD.API_QUEST,                app: 'QuestCord', severity: 'error',   desc: 'Quest API controller error' },
    { code: ERRORS.QUESTCORD.API_USER,                 app: 'QuestCord', severity: 'error',   desc: 'User API controller error' },
    { code: ERRORS.QUESTCORD.API_ROUTES,               app: 'QuestCord', severity: 'error',   desc: 'API routes handler error' },
    { code: ERRORS.QUESTCORD.CMD_ACHIEVEMENTS,         app: 'QuestCord', severity: 'error',   desc: 'Achievements command handler error' },
    { code: ERRORS.QUESTCORD.CMD_ADMIN,                app: 'QuestCord', severity: 'error',   desc: 'Admin command handler error' },
    { code: ERRORS.QUESTCORD.CMD_GENERAL,              app: 'QuestCord', severity: 'error',   desc: 'General command handler error' },
    { code: ERRORS.QUESTCORD.DEPLOY_COMMANDS,          app: 'QuestCord', severity: 'error',   desc: 'Slash command deployment error' },
    { code: ERRORS.QUESTCORD.EVENT_INTERACTION,        app: 'QuestCord', severity: 'error',   desc: 'interactionCreate event handler error' },
    { code: ERRORS.QUESTCORD.EVENT_READY,              app: 'QuestCord', severity: 'error',   desc: 'ready event handler error' },
    { code: ERRORS.QUESTCORD.EVENT_VOICE,              app: 'QuestCord', severity: 'error',   desc: 'voiceStateUpdate event handler error' },
    { code: ERRORS.QUESTCORD.BOT_CORE,                 app: 'QuestCord', severity: 'error',   desc: 'Bot core (bot/index.js) error' },
    { code: ERRORS.QUESTCORD.BOSS_MANAGER,             app: 'QuestCord', severity: 'error',   desc: 'Boss manager utility error' },
    { code: ERRORS.QUESTCORD.PERMISSIONS,              app: 'QuestCord', severity: 'error',   desc: 'Permission check utility error' },
    { code: ERRORS.QUESTCORD.QUEST_INTERACTIONS,       app: 'QuestCord', severity: 'error',   desc: 'Quest interactions utility error' },
    { code: ERRORS.QUESTCORD.QUEST_MANAGER,            app: 'QuestCord', severity: 'error',   desc: 'Quest manager utility error' },
    { code: ERRORS.QUESTCORD.DB_MAINTENANCE,           app: 'QuestCord', severity: 'error',   desc: 'Database maintenance error' },
    { code: ERRORS.QUESTCORD.DB_SEED,                  app: 'QuestCord', severity: 'error',   desc: 'Database seed error' },
    { code: ERRORS.QUESTCORD.DB_UTILS,                 app: 'QuestCord', severity: 'error',   desc: 'Database utility error' },
    { code: ERRORS.QUESTCORD.GAME_BASE,                app: 'QuestCord', severity: 'error',   desc: 'Game engine BaseService error' },
    { code: ERRORS.QUESTCORD.GAME_GUILD,               app: 'QuestCord', severity: 'error',   desc: 'Game engine GuildService error' },
    { code: ERRORS.QUESTCORD.DEBUG_LOGGER,             app: 'QuestCord', severity: 'warning', desc: 'Debug logger utility error' },
    { code: ERRORS.QUESTCORD.LEADERBOARD,              app: 'QuestCord', severity: 'error',   desc: 'Leaderboard scheduler error' },
    { code: ERRORS.QUESTCORD.REPORTING,                app: 'QuestCord', severity: 'error',   desc: 'Reporting system error' },
    { code: ERRORS.QUESTCORD.OAUTH,                    app: 'QuestCord', severity: 'error',   desc: 'Discord OAuth callback/JWT error' },
    { code: ERRORS.QUESTCORD.WEB_AUTH,                 app: 'QuestCord', severity: 'error',   desc: 'Web auth middleware error' },
    { code: ERRORS.QUESTCORD.WEB_IPBAN,                app: 'QuestCord', severity: 'error',   desc: 'IP ban middleware error' },
    { code: ERRORS.QUESTCORD.WEB_ROUTES_ADMIN,         app: 'QuestCord', severity: 'error',   desc: 'Admin web routes error' },
    { code: ERRORS.QUESTCORD.WEB_ROUTES_API,           app: 'QuestCord', severity: 'error',   desc: 'API web routes error' },
    { code: ERRORS.QUESTCORD.WEB_ROUTES_AUTH,          app: 'QuestCord', severity: 'error',   desc: 'Auth web routes error' },
    { code: ERRORS.QUESTCORD.WEB_ROUTES_WEB,           app: 'QuestCord', severity: 'error',   desc: 'Web routes error' },

    // ── CLEANME ─────────────────────────────────────────────
    { code: ERRORS.CLEANME.CMD_FAILED,                 app: 'CleanMe', severity: 'error',   desc: 'Slash command interaction failed' },
    { code: ERRORS.CLEANME.SERVER_SAVE,                app: 'CleanMe', severity: 'error',   desc: 'Failed to save server configuration' },
    { code: ERRORS.CLEANME.SERVER_LOAD,                app: 'CleanMe', severity: 'error',   desc: 'Failed to load server configuration' },
    { code: ERRORS.CLEANME.FATAL_REJECTION,            app: 'CleanMe', severity: 'fatal',   desc: 'Unhandled Promise Rejection' },
    { code: ERRORS.CLEANME.FATAL_EXCEPTION,            app: 'CleanMe', severity: 'fatal',   desc: 'Uncaught Exception — process will exit' },
    { code: ERRORS.CLEANME.LOGIN_FAILED,               app: 'CleanMe', severity: 'fatal',   desc: 'Discord client.login() failed' },
    { code: ERRORS.CLEANME.DEPLOY_COMMANDS,            app: 'CleanMe', severity: 'error',   desc: 'Slash command deployment error' },
    { code: ERRORS.CLEANME.CMD_HANDLER,                app: 'CleanMe', severity: 'error',   desc: 'Command handler threw an exception' },
    { code: ERRORS.CLEANME.SAVE_ERROR,                 app: 'CleanMe', severity: 'error',   desc: 'Server configuration save error' },
    { code: ERRORS.CLEANME.STATUS_CHANNEL,             app: 'CleanMe', severity: 'error',   desc: 'Failed to create status channel' },
    { code: ERRORS.CLEANME.COPY_ERROR,                 app: 'CleanMe', severity: 'error',   desc: 'Configuration copy operation error' },
    { code: ERRORS.CLEANME.CLEAN_FAILED,               app: 'CleanMe', severity: 'error',   desc: 'Clean command failed in guild' },
    { code: ERRORS.CLEANME.PUBLISH_ERROR,              app: 'CleanMe', severity: 'error',   desc: 'CleanMe publish error' },

    // ── WEBSITE ─────────────────────────────────────────────
    { code: ERRORS.WEBSITE.API_HANDLER,                app: 'Website', severity: 'error',   desc: 'Unhandled exception in API route handler' },
    { code: ERRORS.WEBSITE.PM2_COMMAND,                app: 'Website', severity: 'error',   desc: 'PM2 command execution failed' },
    { code: ERRORS.WEBSITE.SESSION_ERROR,              app: 'Website', severity: 'error',   desc: 'Session handling error' },
    { code: ERRORS.WEBSITE.FATAL_EXCEPTION,            app: 'Website', severity: 'fatal',   desc: 'Unhandled server exception' },
    { code: ERRORS.WEBSITE.DISCORD_LOGIN,              app: 'Website', severity: 'error',   desc: 'Unified Discord OAuth login error' },
    { code: ERRORS.WEBSITE.TWITCH_LOGIN,               app: 'Website', severity: 'error',   desc: 'Unified Twitch OAuth login error' },
    { code: ERRORS.WEBSITE.CUBPROTECTOR_TOKEN,         app: 'Website', severity: 'error',   desc: 'CUB PROTECTOR bot token not found in environment' },
    { code: ERRORS.WEBSITE.CUBPROTECTOR_API,           app: 'Website', severity: 'error',   desc: 'CUB PROTECTOR API returned an error response' },
    { code: ERRORS.WEBSITE.CUBPROTECTOR_REQUEST,       app: 'Website', severity: 'error',   desc: 'CUB PROTECTOR API request failed (network/timeout)' },
    { code: ERRORS.WEBSITE.CUBPROTECTOR_RATELIMIT,     app: 'Website', severity: 'error',   desc: 'CUB PROTECTOR API rate limited after 5 retries' },
    { code: ERRORS.WEBSITE.HUB_DATA_SAVE,              app: 'Website', severity: 'error',   desc: 'Failed to save hub data file' },
    { code: ERRORS.WEBSITE.FILE_LOAD,                  app: 'Website', severity: 'error',   desc: 'Failed to load a data file' },
    { code: ERRORS.WEBSITE.FILE_SAVE,                  app: 'Website', severity: 'error',   desc: 'Failed to save a data file' },
    { code: ERRORS.WEBSITE.BOT_ACTION_ENQUEUE,         app: 'Website', severity: 'error',   desc: 'Failed to enqueue bot action' },
    { code: ERRORS.WEBSITE.BAN_APPEAL_SUBMIT,          app: 'Website', severity: 'error',   desc: 'Ban appeal submit unhandled exception' },

    // ── CUBDECK ─────────────────────────────────────────────
    { code: ERRORS.CUBDECK.DECK_LOAD,                  app: 'CubDeck',        severity: 'error',   desc: 'Failed to load deck configuration' },
    { code: ERRORS.CUBDECK.DECK_SAVE,                  app: 'CubDeck',        severity: 'error',   desc: 'Failed to save deck configuration' },
    { code: ERRORS.CUBDECK.OVERLAY_POLL,               app: 'CubDeck',        severity: 'error',   desc: 'Overlay event poll/push failed' },
    { code: ERRORS.CUBDECK.AUTH_FAILED,                app: 'CubDeck',        severity: 'error',   desc: 'Authentication or OAuth flow failed' },
    { code: ERRORS.CUBDECK.FATAL_EXCEPTION,            app: 'CubDeck',        severity: 'fatal',   desc: 'Unhandled server exception' },

    // ── ONION BOT ───────────────────────────────────────────
    { code: ERRORS.ONIONBOT.LOGIN_FAILED,              app: 'Onion Bot',      severity: 'fatal',   desc: 'Discord client.login() failed' },
    { code: ERRORS.ONIONBOT.DEPLOY_FAILED,             app: 'Onion Bot',      severity: 'error',   desc: 'Slash command deployment failed' },
    { code: ERRORS.ONIONBOT.FATAL_EXCEPTION,           app: 'Onion Bot',      severity: 'fatal',   desc: 'Uncaught Exception — process will exit' },
    { code: ERRORS.ONIONBOT.FATAL_REJECTION,           app: 'Onion Bot',      severity: 'fatal',   desc: 'Unhandled Promise Rejection' },
    { code: ERRORS.ONIONBOT.CMD_INTERACTION,           app: 'Onion Bot',      severity: 'error',   desc: 'Command/interaction handler error' },
    { code: ERRORS.ONIONBOT.VOICE_STATE,               app: 'Onion Bot',      severity: 'error',   desc: 'voiceStateUpdate handler error' },
    { code: ERRORS.ONIONBOT.CONFINEMENT,               app: 'Onion Bot',      severity: 'error',   desc: 'Solitary confinement command error' },
    { code: ERRORS.ONIONBOT.RELEASE,                   app: 'Onion Bot',      severity: 'error',   desc: 'Release confinement command error' },
    { code: ERRORS.ONIONBOT.MUTE_USER,                 app: 'Onion Bot',      severity: 'error',   desc: 'Mute/unmute user error' },
    { code: ERRORS.ONIONBOT.GUILD_SETTINGS,            app: 'Onion Bot',      severity: 'error',   desc: 'Guild settings load/save error' },
    { code: ERRORS.ONIONBOT.DEPLOY_COMMANDS,           app: 'Onion Bot',      severity: 'error',   desc: 'deploy-commands.js error' },
    { code: ERRORS.ONIONBOT.CONFIG_MISSING,            app: 'Onion Bot',      severity: 'fatal',   desc: 'Missing required environment variables' },
    { code: ERRORS.ONIONBOT.CONFIG_CREATOR,            app: 'Onion Bot',      severity: 'fatal',   desc: 'Invalid CREATOR_ID in config' },
    { code: ERRORS.ONIONBOT.VOICE_BLOCK,               app: 'Onion Bot',      severity: 'error',   desc: 'Voice channel block/disconnect error' },
    { code: ERRORS.ONIONBOT.VOICE_UNBLOCK,             app: 'Onion Bot',      severity: 'error',   desc: 'Voice channel unblock/fetch error' },

    // ── SHARED UTILITIES ────────────────────────────────────
    { code: ERRORS.SHARED.DISCORD_LOGGER_LOG,          app: 'Shared',         severity: 'error',   desc: 'discord-logger failed to log an error message' },
    { code: ERRORS.SHARED.DISCORD_LOGGER_SEND,         app: 'Shared',         severity: 'warning', desc: 'discord-logger failed to send Discord log' },
    { code: ERRORS.SHARED.TERMINAL_SAVE_USERS,         app: 'Shared',         severity: 'warning', desc: 'discord-terminal failed to save terminal users' },
    { code: ERRORS.SHARED.TERMINAL_LOG,                app: 'Shared',         severity: 'warning', desc: 'discord-terminal log() call failed' },
    { code: ERRORS.SHARED.TERMINAL_LOG_EVENT,          app: 'Shared',         severity: 'warning', desc: 'discord-terminal logEvent() call failed' },
    { code: ERRORS.SHARED.TERMINAL_CLEAR,              app: 'Shared',         severity: 'warning', desc: 'discord-terminal clear() call failed' },
    { code: ERRORS.SHARED.TERMINAL_CMD_ERROR,          app: 'Shared',         severity: 'error',   desc: 'discord-terminal command execution threw an error' },

    // ── CUB PRESENCE APP ────────────────────────────────────
    { code: ERRORS.CUBPRESENCE.SETTINGS_LOAD,          app: 'CubPresence',    severity: 'error',   desc: 'Failed to load app settings' },
    { code: ERRORS.CUBPRESENCE.SETTINGS_SAVE,          app: 'CubPresence',    severity: 'error',   desc: 'Failed to save app settings' },

    // ── CUBSOFTWARE APP ─────────────────────────────────────
    { code: ERRORS.CUBSOFTWARE_APP.DISCORD_RPC,        app: 'CubSoftware App', severity: 'error',  desc: 'Failed to connect to Discord RPC' },
    { code: ERRORS.CUBSOFTWARE_APP.PRESENCE_CONFIG,    app: 'CubSoftware App', severity: 'error',  desc: 'Failed to fetch presence config' },
    { code: ERRORS.CUBSOFTWARE_APP.TOKEN_REFRESH,      app: 'CubSoftware App', severity: 'error',  desc: 'Failed to refresh OAuth token' },
    { code: ERRORS.CUBSOFTWARE_APP.PRESENCE_UPDATE,    app: 'CubSoftware App', severity: 'error',  desc: 'Failed to update Discord presence' },

    // ── CUBVAULT ────────────────────────────────────────────
    { code: ERRORS.CUBVAULT.VAULT_CREATE,              app: 'CubVault',       severity: 'error',   desc: 'Failed to create vault' },
    { code: ERRORS.CUBVAULT.VAULT_UNLOCK,              app: 'CubVault',       severity: 'error',   desc: 'Failed to unlock vault' },
    { code: ERRORS.CUBVAULT.VAULT_PASSWORD,            app: 'CubVault',       severity: 'error',   desc: 'Failed to change vault password' },
    { code: ERRORS.CUBVAULT.VAULT_STATS,               app: 'CubVault',       severity: 'error',   desc: 'Failed to get vault stats' },
];

// ============================================================
// Severity colours / icons for Discord embeds
// ============================================================
const SEVERITY_COLORS = { fatal: 0xff0000, error: 0xef4444, warning: 0xf59e0b, info: 0x3b82f6 };
const SEVERITY_ICONS  = { fatal: '🔴', error: '❌', warning: '⚠️', info: 'ℹ️' };

// ============================================================
// Error Reporter Factory
// ============================================================
function createErrorReporter(client, botName) {
    const INCIDENT_CHANNEL_ID = '1493043555931783168';

    async function report(code, message, ctx = {}, err = null) {
        const entry    = ERROR_CATALOG.find(e => e.code === code);
        const severity = entry?.severity || 'error';
        const icon     = SEVERITY_ICONS[severity] || '❌';

        const pm2Line = `[Error] ${code} — ${message}`;
        if (severity === 'fatal' || severity === 'error') console.error(pm2Line, err || '', ctx);
        else console.warn(pm2Line, ctx);

        try {
            const channel = await client.channels.fetch(INCIDENT_CHANNEL_ID).catch(() => null);
            if (!channel) return;

            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setColor(SEVERITY_COLORS[severity] || SEVERITY_COLORS.error)
                .setTitle(`${icon} ${severity.toUpperCase()} — ${botName}`)
                .setDescription(`\`\`\`${code}\`\`\`\n${message}`)
                .setTimestamp();

            const fields = [];
            for (const [k, v] of Object.entries(ctx)) {
                if (v !== undefined && v !== null)
                    fields.push({ name: k, value: String(v).substring(0, 1024), inline: true });
            }
            if (err instanceof Error) {
                fields.push({ name: 'Stack Trace', value: `\`\`\`\n${(err.stack || err.message).substring(0, 900)}\`\`\``, inline: false });
            }
            if (fields.length) embed.addFields(fields);
            await channel.send({ embeds: [embed] });
        } catch (sendErr) {
            console.error(`[ErrorReporter] Failed to post to incident channel:`, sendErr.message);
        }
    }

    function hookConsoleError() {
        const _orig = console.error.bind(console);
        let _posting = false;

        console.error = (...args) => {
            _orig(...args);
            if (_posting) return;
            _posting = true;

            const text = args.map(a => (a instanceof Error ? (a.stack || a.message) : String(a))).join(' ');
            if (text.includes('[ErrorReporter]')) { _posting = false; return; }

            const codeMatch = text.match(/CUBSOFTWARE_ERROR_[A-Z0-9_]+/);
            const code      = codeMatch ? codeMatch[0] : `CUBSOFTWARE_ERROR_${botName.replace(/\s+/g, '').toUpperCase()}_CONSOLEERROR_000`;
            const entry     = codeMatch ? ERROR_CATALOG.find(e => e.code === code) : null;
            const severity  = entry?.severity || 'error';
            const errObj    = args.find(a => a instanceof Error) || null;

            (async () => {
                try {
                    const channel = await client.channels.fetch(INCIDENT_CHANNEL_ID).catch(() => null);
                    if (!channel) return;
                    const { EmbedBuilder } = require('discord.js');
                    const embed = new EmbedBuilder()
                        .setColor(SEVERITY_COLORS[severity] || SEVERITY_COLORS.error)
                        .setTitle(`${SEVERITY_ICONS[severity] || '❌'} ${severity.toUpperCase()} — ${botName}`)
                        .setDescription(`\`\`\`${code}\`\`\`\n${text.substring(0, 300)}`)
                        .setTimestamp();
                    if (errObj?.stack)
                        embed.addFields([{ name: 'Stack Trace', value: `\`\`\`\n${errObj.stack.substring(0, 900)}\`\`\``, inline: false }]);
                    await channel.send({ embeds: [embed] });
                } catch (_) {
                } finally {
                    _posting = false;
                }
            })();
        };
    }

    return { report, hookConsoleError, catalog: ERROR_CATALOG };
}

module.exports = { createErrorReporter, ERRORS, ERROR_CATALOG };
