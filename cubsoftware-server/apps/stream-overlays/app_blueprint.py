import os
import json
import time
import uuid
import random
import secrets
import hashlib
import hmac
import urllib.parse
from functools import wraps
from flask import (Blueprint, render_template, request, jsonify,
                   session, redirect, Response, url_for, current_app)
import requests as http_requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, '..', 'cubsoftware-website', 'data')
DATA_FILE = os.path.join(DATA_DIR, 'stream_overlays.json')
EVENTS_DIR = os.path.join(DATA_DIR, 'scene_events')
ALERT_EVENTS_DIR = os.path.join(DATA_DIR, 'alert_events')
TWITCH_TOKENS_FILE = os.path.join(DATA_DIR, 'overlay_twitch_tokens.json')
ACCOUNTS_LINK_FILE = os.path.join(DATA_DIR, 'overlay_accounts_link.json')
TWITCH_EVENTS_DIR = os.path.join(DATA_DIR, 'twitch_events')

overlays_bp = Blueprint(
    'overlays', __name__,
    template_folder='templates',
    static_folder='static',
    static_url_path='/static',
    root_path=BASE_DIR
)

OVERLAY_DISCORD_REDIRECT = 'https://cubsoftware.site/overlays/auth/callback'

# Twitch OAuth + EventSub config
TWITCH_CLIENT_ID = os.environ.get('TWITCH_CLIENT_ID', '')
TWITCH_CLIENT_SECRET = os.environ.get('TWITCH_CLIENT_SECRET', '')
TWITCH_REDIRECT_URI = 'https://cubsoftware.site/overlays/twitch/callback'
TWITCH_LOGIN_REDIRECT_URI = 'https://cubsoftware.site/overlays/auth/twitch/callback'
DISCORD_LINK_REDIRECT_URI = 'https://cubsoftware.site/overlays/auth/link/discord/callback'
TWITCH_WEBHOOK_URL = 'https://cubsoftware.site/overlays/twitch/webhook'
TWITCH_WEBHOOK_SECRET = os.environ.get('TWITCH_WEBHOOK_SECRET', 'cubsoftware-overlay-secret-2024')
LASTFM_API_KEY = os.environ.get('LASTFM_API_KEY', '')
ANALYTICS_FILE = os.path.join(DATA_DIR, 'scene_analytics.json')
REACTION_EVENTS_DIR = os.path.join(DATA_DIR, 'reaction_events')

# Default config for new scenes by type
_SCENE_VISUAL_EXTRAS = {
    'bg_image_url': '', 'font_weight': '700',
    'color_grading': 0, 'film_grain': False, 'bloom_glow': False,
    # Design extras
    'bg_image_fit': 'cover', 'bg_image_opacity': 100,
    'vignette': 0, 'border_frame': 'none', 'text_shadow': 0,
    # Effects extras
    'bg_effect_opacity': 80, 'text_effect_speed': 1.0,
    # Clock widget
    'clock_widget': False, 'clock_format': '24h', 'clock_position': 'bottom-left',
    'clock_show_date': False, 'clock_color': '', 'clock_size': 28,
    # Goal bar widget
    'goal_bar': False, 'goal_bar_title': 'Goal', 'goal_bar_current': 0, 'goal_bar_max': 100,
    'goal_bar_position': 'bottom-center', 'goal_bar_color': '', 'goal_bar_style': 'gradient',
    # Viewer queue & misc
    'viewer_queue': [], 'viewer_queue_title': 'Queue', 'viewer_queue_position': 'top-right',
    'bg_effect_speed': 1.0, 'scene_alert_position': 'top-center',
    # Uptime widget
    'uptime_widget': False, 'uptime_position': 'top-left',
    # Design extras (new)
    'overlay_color': '', 'overlay_opacity': 20, 'overlay_blend_mode': 'normal',
    'contrast': 100, 'brightness': 100, 'saturation': 100,
    'scanlines': False, 'scanline_opacity': 20,
    'bg_video_url': '',
    'bg_mesh_color_1': '#7c3aed', 'bg_mesh_color_2': '#0ea5e9',
    'bg_mesh_color_3': '#f59e0b', 'bg_mesh_color_4': '#10b981',
    # Effects extras (new)
    'bg_effect_count': 100, 'bg_effect_color_2': '', 'bg_effect_density': 50, 'bg_effect_direction': 'none',
    # Widget extras (new)
    'ticker_widget': False, 'ticker_position': 'bottom-center', 'ticker_speed': 60,
    'ticker_bg': '', 'ticker_label': 'Recent Events', 'ticker_names': [],
    'ticker_live': False, 'ticker_max_events': 10,
    'ticker_show_follows': True, 'ticker_show_subs': True, 'ticker_show_bits': True,
    'ticker_show_raids': True, 'ticker_show_gift_subs': True, 'ticker_show_points': False,
    'nowplaying_widget': False, 'nowplaying_position': 'bottom-left',
    'nowplaying_title': 'Now Playing', 'nowplaying_text': '', 'nowplaying_show_bar': True,
    'counter_widget': False, 'counter_position': 'top-right', 'counter_label': 'Followers',
    'counter_value': 0, 'counter_color': '', 'counter_animate': True,
    # QR code widget
    'qr_widget': False, 'qr_url': '', 'qr_size': 180, 'qr_position': 'bottom-right', 'qr_label': '',
    # Last.fm now-playing auto-fetch
    'lastfm_username': '', 'lastfm_api_key': '',
    # Channel Points Reactions
    'channel_points_reactions': [],
    'clock_style': 'digital', 'clock_bg': False, 'clock_timezone': '',
    'goal_bar_show_milestone': False, 'goal_bar_completion_text': 'Goal Reached!',
    # Design extras (layout/typography/logo/pattern/noise/border)
    'scene_opacity': 100, 'content_align': 'center',
    'letter_spacing': 0, 'title_uppercase': False,
    'text_glow': 0, 'title_font_size': 0, 'subtitle_font_size': 0,
    'logo_size': 100, 'logo_opacity': 100, 'logo_position': 'default',
    'bg_pattern': 'none', 'bg_pattern_color': '#ffffff', 'bg_pattern_opacity': 15, 'bg_pattern_size': 20,
    'noise_overlay': False, 'noise_opacity': 15,
    'border_width': 2, 'border_radius': 0,
    'bg_gradient_mid': '', 'bg_image_position': 'center',
    # Scene alert card styling (for non-alerts scenes with show_alerts enabled)
    'scene_alert_card_bg': '#0a0a1a', 'scene_alert_card_opacity': 92,
    'scene_alert_card_blur': 8, 'scene_alert_border_radius': 12,
    'scene_alert_border_width': 1, 'scene_alert_glow': 20,
    'scene_alert_font': 'Orbitron', 'scene_alert_label_size': 12,
    'scene_alert_msg_size': 22, 'scene_alert_msg_weight': '600',
    'scene_alert_label_uppercase': True, 'scene_alert_msg_italic': False,
    'scene_alert_label_color': '', 'scene_alert_msg_color': '#ffffff',
    'scene_alert_animation': 'slide-in', 'scene_alert_exit': 'slide-out',
    'scene_alert_duration': 5, 'scene_alert_style': 'standard',
    'scene_alert_border_style': 'solid', 'scene_alert_border_color': '',
    'scene_alert_show_icon': True, 'scene_alert_show_extra': True,
    'scene_alert_progress_bar': False, 'scene_alert_confetti': False,
    'scene_alert_follow_color': '#00cc66', 'scene_alert_sub_color': '#9945ff',
    'scene_alert_gift_sub_color': '#cc44ff', 'scene_alert_bits_color': '#ffcc00',
    'scene_alert_raid_color': '#ff6600', 'scene_alert_points_color': '#00ccff',
    'scene_alert_min_width': 320, 'scene_alert_padding': 16,
    'scene_alert_gradient_bg': False, 'scene_alert_inner_glow': False,
    'scene_alert_max_width': 500, 'scene_alert_theme': 'glass',
}

DEFAULT_CONFIGS = {
    'starting-soon': {
        'title': 'Starting Soon', 'subtitle': 'The stream begins shortly...',
        'countdown_to': '', 'show_countdown': True, 'countdown_end_text': 'LIVE!',
        'background_type': 'gradient', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#1a0a2e', 'bg_gradient_angle': 135,
        'accent_color': '#7c3aed', 'text_primary': '#ffffff', 'text_secondary': '#a0a0c0',
        'font': 'Orbitron', 'particles': True, 'particle_color': '#7c3aed',
        'animation': 'fade', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_message': '', 'custom_css': '',
        'co_players': [], 'co_players_position': 'right',
        'games_list': [], 'games_position': 'right',
        'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'brb': {
        'title': 'Be Right Back', 'subtitle': "Taking a short break, we'll be back soon!",
        'background_type': 'animated-gradient', 'bg_color': '#0d0d1a',
        'bg_gradient_from': '#0d0d1a', 'bg_gradient_to': '#1a0d2e', 'bg_gradient_angle': 135,
        'accent_color': '#5865f2', 'text_primary': '#ffffff', 'text_secondary': '#8888aa',
        'font': 'Orbitron', 'particles': True, 'particle_color': '#5865f2',
        'animation': 'float', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_message': '', 'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'ending': {
        'title': 'Thanks for Watching!', 'subtitle': 'Stream ending — see you next time!',
        'background_type': 'gradient', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a1a0a', 'bg_gradient_to': '#0a0a2e', 'bg_gradient_angle': 45,
        'accent_color': '#00cc66', 'text_primary': '#ffffff', 'text_secondary': '#88bbaa',
        'font': 'Orbitron', 'particles': True, 'particle_color': '#00cc66',
        'animation': 'fade', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'cta_text': 'Follow for more!', 'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'live': {
        'title': 'Live Now', 'subtitle': '',
        'background_type': 'solid', 'bg_color': '#000000',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#000000', 'bg_gradient_angle': 180,
        'accent_color': '#e91916', 'text_primary': '#ffffff', 'text_secondary': '#aaaaaa',
        'font': 'Orbitron', 'particles': False, 'particle_color': '#e91916',
        'animation': 'none', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'show_live_badge': True, 'custom_css': '',
        'co_players': [], 'co_players_position': 'right',
        'games_list': [], 'games_position': 'right',
        'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'offline': {
        'title': 'Offline', 'subtitle': 'Thanks for stopping by!',
        'next_stream': '', 'schedule_text': '',
        'background_type': 'gradient', 'bg_color': '#0a0a0a',
        'bg_gradient_from': '#0a0a0a', 'bg_gradient_to': '#1a1a2e', 'bg_gradient_angle': 180,
        'accent_color': '#5865f2', 'text_primary': '#ffffff', 'text_secondary': '#888888',
        'font': 'Orbitron', 'particles': False, 'particle_color': '#5865f2',
        'animation': 'fade', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'tech-difficulties': {
        'title': 'Technical Difficulties', 'subtitle': 'We\'ll be back shortly. Please stand by.',
        'error_code': 'ERR_STREAM_OFFLINE',
        'background_type': 'solid', 'bg_color': '#0a0000',
        'bg_gradient_from': '#1a0000', 'bg_gradient_to': '#0a0000', 'bg_gradient_angle': 180,
        'accent_color': '#ff3333', 'text_primary': '#ff6666', 'text_secondary': '#cc3333',
        'font': 'Share Tech Mono', 'particles': False, 'particle_color': '#ff3333',
        'animation': 'glitch', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'intermission': {
        'title': 'Intermission', 'subtitle': 'Taking a short break between games',
        'game_title': '', 'break_timer': 0,
        'background_type': 'gradient', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#1a0a0a', 'bg_gradient_angle': 90,
        'accent_color': '#ff9900', 'text_primary': '#ffffff', 'text_secondary': '#aaaaaa',
        'font': 'Orbitron', 'particles': True, 'particle_color': '#ff9900',
        'animation': 'slide', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'raid': {
        'title': 'RAID!', 'subtitle': 'Thanks for the raid!',
        'raider_name': 'YOUR_NAME', 'raider_count': 0,
        'background_type': 'animated-gradient', 'bg_color': '#1a0a00',
        'bg_gradient_from': '#2a0a00', 'bg_gradient_to': '#0a001a', 'bg_gradient_angle': 45,
        'accent_color': '#ff6600', 'text_primary': '#ffffff', 'text_secondary': '#ffaa66',
        'font': 'Orbitron', 'particles': True, 'particle_color': '#ff6600',
        'animation': 'bounce', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'subathon': {
        'title': 'SUBATHON', 'subtitle': 'Help us reach our goal!',
        'goal_title': 'Subscription Goal', 'current_amount': 0, 'goal_amount': 100,
        'currency_symbol': '', 'unit_label': 'Subs',
        'background_type': 'gradient', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#1a0030', 'bg_gradient_angle': 135,
        'accent_color': '#9945ff', 'text_primary': '#ffffff', 'text_secondary': '#cc99ff',
        'bar_color': '#9945ff', 'bar_bg': 'rgba(153,69,255,0.2)',
        'font': 'Orbitron', 'particles': True, 'particle_color': '#9945ff',
        'animation': 'pulse', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'schedule': {
        'title': 'Stream Schedule', 'subtitle': 'All times are in your local timezone',
        'timezone_note': '',
        'schedule': [
            {'day': 'Monday', 'time': '', 'game': '', 'enabled': False},
            {'day': 'Tuesday', 'time': '', 'game': '', 'enabled': False},
            {'day': 'Wednesday', 'time': '', 'game': '', 'enabled': False},
            {'day': 'Thursday', 'time': '', 'game': '', 'enabled': False},
            {'day': 'Friday', 'time': '', 'game': '', 'enabled': False},
            {'day': 'Saturday', 'time': '', 'game': '', 'enabled': True},
            {'day': 'Sunday', 'time': '', 'game': '', 'enabled': True},
        ],
        'background_type': 'gradient', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#001a1a', 'bg_gradient_angle': 135,
        'accent_color': '#00ccff', 'text_primary': '#ffffff', 'text_secondary': '#88ccff',
        'font': 'Orbitron', 'particles': False, 'particle_color': '#00ccff',
        'animation': 'fade', 'logo_url': '',
        'social': {'twitch': '', 'twitter': '', 'discord': '', 'youtube': '', 'instagram': '', 'tiktok': ''},
        'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
    'alerts': {
        'title': 'Alerts Overlay',
        'follow_enabled': True, 'sub_enabled': True, 'gift_sub_enabled': True,
        'bits_enabled': True, 'raid_enabled': True, 'points_enabled': True,
        'follow_message': '{name} just followed!',
        'sub_message': '{name} just subscribed!',
        'gift_sub_message': '{gifter} gifted {count} sub(s) to {name}!',
        'bits_message': '{name} cheered {amount} bits!',
        'raid_message': '{name} is raiding with {count} viewers!',
        'points_message': '{name} redeemed {reward}!',
        'alert_duration': 5, 'alert_position': 'top-right', 'alert_animation': 'slide-in',
        'alert_sound': False, 'alert_icon': True, 'alert_stack': False,
        'follow_color': '', 'sub_color': '', 'gift_sub_color': '',
        'bits_color': '', 'raid_color': '', 'points_color': '',
        'background_type': 'transparent',
        'accent_color': '#7c3aed', 'text_primary': '#ffffff', 'text_secondary': '#cccccc',
        'font': 'Orbitron', 'particles': False,
        # Card style
        'alert_card_bg': '#0a0a1a', 'alert_card_opacity': 92,
        'alert_border_width': 1, 'alert_border_radius': 12,
        'alert_card_blur': 8, 'alert_glow': 20,
        'alert_min_width': 380, 'alert_padding': 20,
        # Typography
        'alert_label_size': 12, 'alert_msg_size': 22,
        'alert_label_font': 'Orbitron', 'alert_msg_font': 'Poppins',
        'alert_label_spacing': 4,
        # Elements
        'alert_show_bar': True, 'alert_bar_height': 2,
        # Typography extras
        'alert_label_color': '', 'alert_msg_color': '', 'alert_msg_weight': '600',
        'alert_border_color': '',
        # Sound
        'alert_sound_volume': 30,
        # Queue
        'alert_queue_delay': 200,
        # Thresholds
        'min_bits_amount': 1, 'min_raid_viewers': 1,
        'custom_css': '',
        # New animations/card
        'alert_exit_animation': 'slide-out',
        'alert_card_theme': 'glass',
        'alert_card_style': 'standard',
        'alert_card_border_style': 'solid',
        'alert_card_max_width': 600,
        'alert_show_avatar': False, 'alert_avatar_size': 40,
        'alert_show_progress_bar': False, 'alert_progress_bar_color': '',
        'alert_show_confetti': False, 'alert_confetti_colors': '',
        'alert_inner_glow': False,
        'alert_card_gradient': False,
        'alert_label_uppercase': True,
        'alert_msg_italic': False,
        # New sound
        'alert_sound_type': 'chime', 'alert_sound_url': '',
        'alert_tts_enabled': False, 'alert_tts_voice': 'default',
        # Per-type overrides
        'alert_animation_follow': '', 'alert_animation_sub': '', 'alert_animation_gift_sub': '',
        'alert_animation_bits': '', 'alert_animation_raid': '', 'alert_animation_points': '',
        'alert_duration_follow': 0, 'alert_duration_sub': 0, 'alert_duration_gift_sub': 0,
        'alert_duration_bits': 0, 'alert_duration_raid': 0, 'alert_duration_points': 0,
    },
    'chat-box': {
        'twitch_channel': '',
        # Layout
        'chat_position': 'bottom-left', 'chat_width': 420, 'chat_max_height': 860,
        'chat_offset_x': 20, 'chat_offset_y': 20, 'chat_gap': 6,
        # Message style
        'message_style': 'card',  # card / compact / minimal / bubble
        'message_animation': 'slide', 'message_duration': 0,  # 0 = persistent
        'max_messages': 20,
        # Typography
        'font': 'Poppins', 'name_font_size': 13, 'font_size': 16,
        'font_weight': '400', 'line_height': 1.35,
        # Colors
        'accent_color': '#9146ff', 'text_primary': '#ffffff', 'text_secondary': '#cccccc',
        'chat_bg': '#0a0a1a', 'bg_opacity': 70,
        'highlight_subs': True, 'highlight_color': '#ff6600',
        'username_colors': True,
        # Card appearance
        'border_radius': 10, 'border_style': 'left',  # left / all / none
        'border_width': 3, 'padding_x': 12, 'padding_y': 8,
        'card_shadow': False,
        # Header bar
        'show_header': False, 'header_text': 'LIVE CHAT', 'header_bg': '#9146ff',
        # Filters
        'filter_commands': True, 'filter_bots': True,
        'min_message_length': 0,
        # Extras
        'show_badges': True, 'show_timestamps': False, 'show_emotes': True,
        'auto_remove': False, 'auto_remove_delay': 30,
        # Events in chat
        'show_sub_events': True, 'show_raid_events': True, 'show_follow_events': False,
        'custom_css': '',
    },
    'event-list': {
        'max_events': 8, 'font': 'Orbitron', 'font_size': 16,
        'accent_color': '#7c3aed', 'text_primary': '#ffffff', 'text_secondary': '#cccccc',
        'bg_color': '#0a0a1a', 'bg_opacity': 85,
        'show_follows': True, 'show_subs': True, 'show_gift_subs': True,
        'show_bits': True, 'show_raids': True, 'show_points': False,
        'title': 'Recent Events', 'show_title': True,
        'item_animation': 'slide-in', 'show_icons': True,
        'follow_color': '#00cc66', 'sub_color': '#9945ff',
        'gift_sub_color': '#cc44ff', 'bits_color': '#ffcc00',
        'raid_color': '#ff6600', 'points_color': '#00ccff',
        'custom_css': '',
    },
    'leaderboard': {
        'title': 'Top Cheerers', 'leaderboard_type': 'bits', 'period': 'all',
        'max_entries': 5, 'font': 'Orbitron', 'font_size': 20,
        'accent_color': '#ffcc00', 'text_primary': '#ffffff', 'text_secondary': '#cccccc',
        'bg_color': '#0a0a1a', 'bg_opacity': 85,
        'show_amounts': True, 'show_rank_icons': True, 'animated': True,
        'rank1_color': '#ffd700', 'rank2_color': '#c0c0c0', 'rank3_color': '#cd7f32',
        'custom_css': '',
    },
    'hype-train': {
        'title': 'HYPE TRAIN!', 'font': 'Orbitron',
        'accent_color': '#ff6600', 'text_primary': '#ffffff',
        'bar_color': '#ff6600', 'bar_bg': 'rgba(255,102,0,0.2)',
        'bg_color': '#0a0a1a', 'bg_opacity': 90,
        'show_level': True, 'show_contributors': True, 'show_goal': True,
        'animation': 'pulse', 'hide_when_inactive': True,
        'custom_css': '',
    },
    'poll-display': {
        'title_font': 'Orbitron', 'choice_font': 'Poppins', 'font_size': 18,
        'accent_color': '#7c3aed', 'text_primary': '#ffffff', 'text_secondary': '#cccccc',
        'bar_style': 'gradient', 'bg_color': '#0a0a1a', 'bg_opacity': 90,
        'show_votes': True, 'show_percentage': True,
        'hide_when_inactive': True, 'animation': 'slide-in',
        'choice_colors': ['#7c3aed','#00cc66','#ff6600','#00ccff','#ff3366'],
        'custom_css': '',
    },
    'prediction': {
        'title_font': 'Orbitron', 'choice_font': 'Poppins', 'font_size': 18,
        'accent_color': '#9146ff', 'text_primary': '#ffffff', 'text_secondary': '#cccccc',
        'bg_color': '#0a0a1a', 'bg_opacity': 90,
        'show_points': True, 'show_percentage': True,
        'hide_when_inactive': True, 'animation': 'fade',
        'outcome_colors': ['#00cc66','#ff3366','#00ccff','#ff6600','#9945ff','#ffcc00','#ff0099','#00ff88'],
        'custom_css': '',
    },
    'emote-wall': {
        'twitch_channel': '',
        # Emote size (random range per emote)
        'emote_size_min': 60, 'emote_size_max': 120,
        # Speed (px/s, random range per emote)
        'emote_speed_min': 50, 'emote_speed_max': 120,
        # Spawning
        'emote_density': 5, 'emote_max_on_screen': 200, 'emote_spawn_delay': 80,
        # Movement
        'emote_direction': 'up', 'emote_gravity': 0, 'emote_spread': 30,
        # Visual
        'emote_fade': True, 'emote_fade_start': 3,
        'emote_opacity': 1.0,
        'emote_spin': False, 'emote_spin_speed': 5,
        'emote_scale_in': True,
        'emote_glow': False, 'emote_glow_size': 15, 'emote_glow_color': '#ffffff',
        'emote_bounce': False,
        # Sources
        'show_bttv': True, 'show_ffz': True, 'show_7tv': True, 'show_status': True,
        'background_type': 'transparent', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#1a0a2e', 'bg_gradient_angle': 135,
        'accent_color': '#7c3aed', 'text_primary': '#ffffff', 'text_secondary': '#a0a0c0',
        'font': 'Orbitron', 'particles': False, 'particle_color': '#7c3aed',
        'animation': 'none', 'logo_url': '', 'custom_css': '',
    },
    'cam-frame': {
        # Style preset
        'cam_frame_style': 'brackets',  # brackets/double/cross/cinema/tactical/vhs/neon/scifi/broadcast
        'cam_letterbox_height': 100,
        # Label
        'cam_label': 'Camera', 'cam_label_show': True, 'cam_label_size': 24,
        'cam_label_font': 'Share Tech Mono',
        # Frame / corners
        'cam_frame_color': '#ffffff', 'cam_hud_color': '#ffffff', 'cam_frame_opacity': 100,
        'cam_corner_size': 80, 'cam_corner_thickness': 3, 'cam_corner_margin': 40, 'cam_corner_radius': 0,
        'cam_ticks_show': True,
        # Full border overlay
        'cam_full_border': False, 'cam_border_opacity': 20, 'cam_border_thickness': 1, 'cam_border_radius': 0,
        # REC indicator
        'cam_rec_show': True, 'cam_rec_text': 'REC', 'cam_rec_blink': True,
        'cam_rec_dot_show': True, 'cam_rec_dot_color': '#ff2020', 'cam_rec_size': 28,
        # Timecode
        'cam_timecode_show': True, 'cam_timecode_style': 'counting', 'cam_timecode_size': 22,
        # Battery
        'cam_battery_show': False, 'cam_battery_level': 80, 'cam_battery_drain': False,
        # HUD extras
        'cam_crosshair_show': False,
        'cam_zoom_show': False, 'cam_zoom_level': '1.0',
        'cam_date_show': False,
        # Effects
        'cam_scanlines': False, 'cam_grain': False, 'cam_vignette': False,
        'cam_flicker': False, 'cam_zoom_anim': False,
        'cam_color_tint': 'none', 'cam_tint_strength': 30,
        # Background (transparent by default — sits on top of webcam)
        'background_type': 'transparent', 'bg_color': '#000000',
        'bg_gradient_from': '#000000', 'bg_gradient_to': '#111111', 'bg_gradient_angle': 135,
        'custom_css': '',
    },
    'news-ticker': {
        # Layout
        'news_style': 'breaking',  # breaking / broadcast / minimal / retro / cyber
        'news_channel_name': 'STREAM NEWS', 'news_channel_logo': '',
        # Viewport cutout (transparent area for webcam/game)
        'news_viewport_show': True, 'news_viewport_x': 320, 'news_viewport_y': 80,
        'news_viewport_w': 1280, 'news_viewport_h': 800,
        # Headlines
        'news_headlines': 'Streamer hits record viewers tonight\nNew world record set in speedrun\nViewer raids incoming from friendly channels\nChat voting on next game — results coming soon\nSpecial giveaway announced for subscribers',
        'news_ticker_speed': 80, 'news_ticker_show': True,
        # Breaking banner
        'news_breaking_text': 'BREAKING NEWS', 'news_breaking_show': True,
        # Chyron (lower third)
        'news_chyron_show': True, 'news_chyron_label': 'LIVE', 'news_chyron_text': 'Stream is live now',
        # Colors
        'news_primary_color': '#cc0000', 'news_secondary_color': '#1a1a2e',
        'news_text_color': '#ffffff', 'news_ticker_bg': '#cc0000', 'news_ticker_text': '#ffffff',
        # Clock & date
        'news_clock_show': True, 'news_weather_show': False, 'news_weather_text': '72°F Sunny',
        'accent_color': '#cc0000', 'text_primary': '#ffffff', 'text_secondary': '#cccccc',
        'background_type': 'transparent', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#1a1a2e', 'bg_gradient_angle': 180,
        'custom_css': '',
    },
    'credits-roll': {
        'title': 'Thank You!', 'subtitle': 'That was an amazing stream!',
        'credits_mods': '', 'credits_mods_label': 'Moderators', 'credits_mods_show': True,
        'credits_vips': '', 'credits_vips_label': 'VIPs', 'credits_vips_show': True,
        'credits_subs': '', 'credits_subs_label': 'Subscribers', 'credits_subs_show': True,
        'credits_gift_subs': '', 'credits_gift_subs_label': 'Gift Sub Givers', 'credits_gift_subs_show': True,
        'credits_followers': '', 'credits_followers_label': 'New Followers', 'credits_followers_show': True,
        'credits_raiders': '', 'credits_raiders_label': 'Raiders', 'credits_raiders_show': True,
        'credits_chat': '', 'credits_chat_label': 'Active Chat', 'credits_chat_show': True,
        'twitch_channel': '', 'credits_auto_twitch': True,
        'credits_scroll_speed': 60, 'credits_loop': True,
        'credits_title_color': '', 'credits_title_size': 88,
        'credits_subtitle_color': '', 'credits_subtitle_size': 30,
        'credits_section_label_color': '', 'credits_section_label_size': 14,
        'credits_name_color': '', 'credits_name_size': 26,
        'credits_divider_color': '', 'credits_divider_width': 500,
        'credits_footer_symbol': '♥', 'credits_footer_color': '', 'credits_footer_size': 44, 'credits_footer_show': True,
        'credits_end_message': 'Thanks for watching!', 'credits_end_message_sub': '', 'credits_end_message_size': 72, 'credits_end_message_color': '',
        'credits_name_bg_enabled': False, 'credits_name_bg': '#1a0a2e', 'credits_name_padding': '4px 12px', 'credits_name_border_radius': 6,
        'credits_section_spacing': 56,
        'background_type': 'gradient', 'bg_color': '#0a0a1a',
        'bg_gradient_from': '#0a0a1a', 'bg_gradient_to': '#1a0a2e', 'bg_gradient_angle': 135,
        'accent_color': '#7c3aed', 'text_primary': '#ffffff', 'text_secondary': '#a0a0c0',
        'font': 'Orbitron', 'particles': True, 'particle_color': '#7c3aed',
        'animation': 'fade', 'logo_url': '',
        'bg_music_url': '', 'bg_music_volume': 40, 'bg_music_loop': True, 'bg_music_fade_in': 3,
        'custom_css': '', 'show_alerts': False, **_SCENE_VISUAL_EXTRAS,
    },
}

SCENE_LABELS = {
    'starting-soon': 'Starting Soon', 'brb': 'Be Right Back', 'ending': 'Ending',
    'live': 'Just Chatting / Live', 'offline': 'Offline', 'tech-difficulties': 'Tech Difficulties',
    'intermission': 'Intermission', 'raid': 'Raid Screen', 'subathon': 'Subathon',
    'schedule': 'Schedule', 'alerts': 'Alerts Overlay',
    'chat-box': 'Chat Box', 'event-list': 'Event List', 'leaderboard': 'Leaderboard',
    'hype-train': 'Hype Train', 'poll-display': 'Poll Display', 'prediction': 'Prediction Overlay',
    'credits-roll': 'Credits Roll',
    'emote-wall': 'Emote Wall',
    'cam-frame': 'Camera Frame',
    'news-ticker': 'News Ticker',
}

TEMPLATE_LABELS = {
    'minimal': 'Minimal', 'neon': 'Neon / Cyberpunk', 'retro': 'Retro',
    'cozy': 'Cozy', 'gradient': 'Gradient', 'gaming': 'Gaming',
    'esports': 'Esports / HUD', 'vaporwave': 'Vaporwave', 'glass': 'Glass',
    'cinematic': 'Cinematic', 'broadcast': 'Broadcast', 'lofi': 'Lo-Fi'
}

# ==================== DATA HELPERS ====================

def ensure_dirs():
    os.makedirs(EVENTS_DIR, exist_ok=True)
    os.makedirs(ALERT_EVENTS_DIR, exist_ok=True)
    os.makedirs(TWITCH_EVENTS_DIR, exist_ok=True)
    os.makedirs(REACTION_EVENTS_DIR, exist_ok=True)
    os.makedirs(DATA_DIR, exist_ok=True)

def load_analytics():
    try:
        with open(ANALYTICS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def save_analytics(data):
    ensure_dirs()
    with open(ANALYTICS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def record_scene_session(scene_id, event):
    """event: 'connect' or 'disconnect'"""
    analytics = load_analytics()
    s = analytics.setdefault(scene_id, {'sessions': [], 'total_active_seconds': 0})
    now = time.time()
    if event == 'connect':
        s['last_connect'] = now
        s['last_seen'] = now
    elif event == 'disconnect':
        s['last_seen'] = now
        if s.get('last_connect'):
            duration = now - s['last_connect']
            s['total_active_seconds'] = s.get('total_active_seconds', 0) + duration
            s['sessions'].append({'start': s['last_connect'], 'end': now, 'duration': round(duration)})
            s['sessions'] = s['sessions'][-50:]  # keep last 50
            s.pop('last_connect', None)
    save_analytics(analytics)

def notify_scene_reaction(user_id, reward_title, event_data):
    """Write a channel points reaction event for all matching scenes owned by user"""
    ensure_dirs()
    data = load_overlays_data()
    for scene_id, scene in data.get('scenes', {}).items():
        if scene.get('user_id') != user_id:
            continue
        reactions = scene.get('config', {}).get('channel_points_reactions', [])
        matched = next((r for r in reactions if r.get('reward_title', '').lower() == reward_title.lower()), None)
        if matched:
            path = os.path.join(REACTION_EVENTS_DIR, f'{scene_id}.json')
            with open(path, 'w') as f:
                json.dump({'reaction': matched, 'event': event_data, 'ts': time.time()}, f)

def load_overlays_data():
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {'scenes': {}}

def save_overlays_data(data):
    ensure_dirs()
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_twitch_tokens():
    if os.path.exists(TWITCH_TOKENS_FILE):
        try:
            with open(TWITCH_TOKENS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def save_twitch_tokens(data):
    ensure_dirs()
    with open(TWITCH_TOKENS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_accounts_link():
    """Maps twitch_{id} → discord_id for linked accounts"""
    try:
        with open(ACCOUNTS_LINK_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def save_accounts_link(data):
    ensure_dirs()
    with open(ACCOUNTS_LINK_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def _twitch_event_path(user_id, event_type):
    ensure_dirs()
    return os.path.join(TWITCH_EVENTS_DIR, f'{user_id}_{event_type}.json')

def _load_twitch_event(user_id, event_type):
    path = _twitch_event_path(user_id, event_type)
    try:
        with open(path, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def _save_twitch_event(user_id, event_type, data):
    path = _twitch_event_path(user_id, event_type)
    with open(path, 'w') as f:
        json.dump(data, f)

def _notify_twitch_event(user_id, event_type, data):
    """Write event state and update SSE timestamp so clients pick it up"""
    _save_twitch_event(user_id, event_type, {'data': data, 'ts': time.time()})

def notify_scene_update(scene_id, config):
    ensure_dirs()
    event_path = os.path.join(EVENTS_DIR, f'{scene_id}.json')
    try:
        with open(event_path, 'w') as f:
            json.dump({'config': config, 'ts': time.time()}, f)
    except Exception:
        pass

def notify_alert_event(user_id, event_type, data):
    ensure_dirs()
    event_path = os.path.join(ALERT_EVENTS_DIR, f'{user_id}.json')
    try:
        with open(event_path, 'w') as f:
            json.dump({'type': event_type, 'data': data, 'ts': time.time()}, f)
    except Exception:
        pass

# ==================== AUTH ====================

# Dev mode bypass — matches IS_DEV in main.py
_OVERLAYS_IS_DEV = os.environ.get('DEV_MODE', '') == '1'
_OVERLAYS_DEV_USER = {
    'id': '00000000000000000001',
    'username': 'DevUser',
    'avatar': '',
    'login_type': 'dev',
}

def overlays_auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if _OVERLAYS_IS_DEV:
            if 'overlay_user' not in session:
                session['overlay_user'] = _OVERLAYS_DEV_USER
                print('[DEV] Auth bypass active — logged in as DevUser (id=00000000000000000001)')
            return f(*args, **kwargs)
        if 'overlay_user' not in session:
            if request.is_json:
                return jsonify({'error': 'Authentication required'}), 401
            return redirect('/overlays')
        return f(*args, **kwargs)
    return decorated

def get_overlay_user():
    return session.get('overlay_user')

def owns_scene(scene, user_id):
    return scene.get('user_id') == user_id

def can_edit_scene(scene, user_id):
    """Returns True if user is owner OR an approved collaborator"""
    if scene.get('user_id') == user_id:
        return True
    return user_id in scene.get('collaborators', [])

# ==================== DISCORD OAUTH ====================

@overlays_bp.route('/auth/discord')
def auth_discord():
    client_id = current_app.config.get('DISCORD_CLIENT_ID', '')
    if not client_id:
        return redirect('/overlays?error=oauth_not_configured')
    params = {
        'client_id': client_id,
        'redirect_uri': OVERLAY_DISCORD_REDIRECT,
        'response_type': 'code',
        'scope': 'identify',
        'state': secrets.token_urlsafe(16)
    }
    session['overlay_oauth_state'] = params['state']
    return redirect(f"https://discord.com/api/oauth2/authorize?{urllib.parse.urlencode(params)}")

@overlays_bp.route('/auth/callback')
def auth_callback():
    error = request.args.get('error')
    if error:
        return redirect('/overlays?error=auth_failed')

    code = request.args.get('code')
    state = request.args.get('state')

    if state != session.get('overlay_oauth_state'):
        return redirect('/overlays?error=invalid_state')

    try:
        token_res = http_requests.post('https://discord.com/api/oauth2/token', data={
            'client_id': current_app.config.get('DISCORD_CLIENT_ID', ''),
            'client_secret': current_app.config.get('DISCORD_CLIENT_SECRET', ''),
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': OVERLAY_DISCORD_REDIRECT
        }, headers={'Content-Type': 'application/x-www-form-urlencoded'})

        if token_res.status_code != 200:
            current_app.logger.error(f'Discord token exchange failed: {token_res.status_code} {token_res.text}')
            return redirect('/overlays?error=token_failed')

        access_token = token_res.json().get('access_token')
        user_res = http_requests.get('https://discord.com/api/users/@me',
                                     headers={'Authorization': f'Bearer {access_token}'})
        if user_res.status_code != 200:
            return redirect('/overlays?error=user_failed')

        user = user_res.json()
        session['overlay_user'] = {
            'id': user['id'],
            'username': user.get('global_name') or user.get('username', 'User'),
            'discriminator': user.get('discriminator', '0'),
            'avatar': f"https://cdn.discordapp.com/avatars/{user['id']}/{user.get('avatar')}.png"
                      if user.get('avatar') else f"https://cdn.discordapp.com/embed/avatars/{int(user.get('discriminator', 0)) % 5}.png"
        }
        session.permanent = True
        return redirect('/overlays')
    except Exception:
        return redirect('/overlays?error=auth_error')

@overlays_bp.route('/auth/logout')
def auth_logout():
    session.pop('overlay_user', None)
    session.pop('overlay_oauth_state', None)
    return redirect('/overlays')

# ==================== TWITCH LOGIN ====================

@overlays_bp.route('/auth/twitch')
def auth_twitch_login():
    if not TWITCH_CLIENT_ID:
        return redirect('/overlays?error=twitch_not_configured')
    state = secrets.token_urlsafe(16)
    session['overlay_twitch_login_state'] = state
    params = {
        'client_id': TWITCH_CLIENT_ID,
        'redirect_uri': TWITCH_LOGIN_REDIRECT_URI,
        'response_type': 'code',
        # Full scope: identity + alerts so login also auto-connects Twitch alerts
        'scope': 'user:read:email channel:read:subscriptions channel:read:redemptions bits:read moderator:read:followers',
        'state': state,
    }
    return redirect(f"https://id.twitch.tv/oauth2/authorize?{urllib.parse.urlencode(params)}")

@overlays_bp.route('/auth/twitch/callback')
def auth_twitch_callback():
    if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
        return redirect('/overlays?error=twitch_env_missing')

    error = request.args.get('error')
    if error:
        return redirect('/overlays?error=twitch_login_denied')

    code = request.args.get('code')
    state = request.args.get('state')
    if not code or state != session.pop('overlay_twitch_login_state', None):
        return redirect('/overlays?error=twitch_state_mismatch')

    try:
        token_res = http_requests.post('https://id.twitch.tv/oauth2/token', data={
            'client_id': TWITCH_CLIENT_ID,
            'client_secret': TWITCH_CLIENT_SECRET,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': TWITCH_LOGIN_REDIRECT_URI,
        })
        if token_res.status_code != 200:
            try:
                err_msg = token_res.json().get('message', token_res.text[:200])
            except Exception:
                err_msg = token_res.text[:200]
            return redirect(f'/overlays?error=twitch_token_failed&detail={urllib.parse.quote(err_msg)}')

        tokens = token_res.json()
        access_token = tokens.get('access_token')
        refresh_token = tokens.get('refresh_token')

        user_res = http_requests.get('https://api.twitch.tv/helix/users', headers={
            'Authorization': f'Bearer {access_token}',
            'Client-Id': TWITCH_CLIENT_ID,
        })
        if user_res.status_code != 200:
            return redirect('/overlays?error=twitch_user_failed')

        twitch_user = user_res.json().get('data', [{}])[0]
        if not twitch_user:
            return redirect('/overlays?error=twitch_user_failed')

        twitch_id = twitch_user['id']
        twitch_key = f'twitch_{twitch_id}'

        # Check if this Twitch account is already linked to a Discord user
        all_tokens = load_twitch_tokens()
        canonical_id = None
        for uid, tdata in all_tokens.items():
            if tdata.get('twitch_id') == twitch_id:
                canonical_id = uid
                break
        if not canonical_id:
            links = load_accounts_link()
            canonical_id = links.get(twitch_key)
        if not canonical_id:
            canonical_id = twitch_key

        # Store/update Twitch token under canonical ID (auto-connects alerts)
        all_tokens[canonical_id] = {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'twitch_id': twitch_id,
            'twitch_login': twitch_user.get('login'),
            'twitch_display': twitch_user.get('display_name'),
            'connected_at': int(time.time()),
        }
        save_twitch_tokens(all_tokens)
        _register_eventsub(twitch_id, access_token)

        # If canonical_id is a Discord ID (no 'twitch_' prefix), the account is already linked
        is_linked = not canonical_id.startswith('twitch_')
        session['overlay_user'] = {
            'id': canonical_id,
            'username': twitch_user.get('display_name') or twitch_user.get('login', 'Streamer'),
            'avatar': twitch_user.get('profile_image_url', ''),
            'login_type': 'twitch_linked' if is_linked else 'twitch',
            'twitch_login': twitch_user.get('login', ''),
        }
        session.permanent = True

        pending = session.pop('pending_invite_token', None)
        if pending:
            return redirect(f'/overlays/invite/{pending}')
        return redirect('/overlays?twitch_connected=1')
    except Exception as e:
        print(f"[Twitch Login] Exception: {e}")
        return redirect('/overlays?error=auth_error')

# ==================== ACCOUNT LINKING ====================

@overlays_bp.route('/auth/link/discord')
@overlays_auth_required
def auth_link_discord():
    """Allow Twitch-logged users to link a Discord account"""
    user = get_overlay_user()
    if user.get('login_type') != 'twitch':
        return redirect('/overlays')
    client_id = current_app.config.get('DISCORD_CLIENT_ID', '')
    if not client_id:
        return redirect('/overlays?error=oauth_not_configured')
    state = secrets.token_urlsafe(16)
    session['overlay_link_discord_state'] = state
    params = {
        'client_id': client_id,
        'redirect_uri': DISCORD_LINK_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'identify',
        'state': state,
    }
    return redirect(f"https://discord.com/api/oauth2/authorize?{urllib.parse.urlencode(params)}")

@overlays_bp.route('/auth/link/discord/callback')
@overlays_auth_required
def auth_link_discord_callback():
    """After Discord auth, link Discord ID to current Twitch user and migrate data"""
    user = get_overlay_user()
    if user.get('login_type') != 'twitch':
        return redirect('/overlays')

    code = request.args.get('code')
    state = request.args.get('state')
    if not code or state != session.pop('overlay_link_discord_state', None):
        return redirect('/overlays?error=invalid_state')

    try:
        token_res = http_requests.post('https://discord.com/api/oauth2/token', data={
            'client_id': current_app.config.get('DISCORD_CLIENT_ID', ''),
            'client_secret': current_app.config.get('DISCORD_CLIENT_SECRET', ''),
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': DISCORD_LINK_REDIRECT_URI,
        }, headers={'Content-Type': 'application/x-www-form-urlencoded'})
        if token_res.status_code != 200:
            return redirect('/overlays?error=token_failed')

        discord_access = token_res.json().get('access_token')
        discord_user_res = http_requests.get('https://discord.com/api/users/@me',
                                             headers={'Authorization': f'Bearer {discord_access}'})
        if discord_user_res.status_code != 200:
            return redirect('/overlays?error=user_failed')

        discord_user = discord_user_res.json()
        discord_id = discord_user['id']
        old_id = user['id']  # twitch_{id}

        # Store link mapping
        links = load_accounts_link()
        links[old_id] = discord_id
        save_accounts_link(links)

        # Migrate Twitch token to Discord ID
        all_tokens = load_twitch_tokens()
        if old_id in all_tokens and discord_id not in all_tokens:
            all_tokens[discord_id] = all_tokens.pop(old_id)
            save_twitch_tokens(all_tokens)

        # Migrate scenes to Discord ID
        data = load_overlays_data()
        for scene in data.get('scenes', {}).values():
            if scene.get('user_id') == old_id:
                scene['user_id'] = discord_id
        save_overlays_data(data)

        # Update session to Discord identity
        session['overlay_user'] = {
            'id': discord_id,
            'username': discord_user.get('global_name') or discord_user.get('username', 'User'),
            'avatar': f"https://cdn.discordapp.com/avatars/{discord_id}/{discord_user.get('avatar')}.png"
                      if discord_user.get('avatar') else f"https://cdn.discordapp.com/embed/avatars/{int(discord_user.get('discriminator', 0)) % 5}.png",
            'login_type': 'discord',
            'linked_twitch': user.get('twitch_login', ''),
        }
        session.permanent = True
        return redirect('/overlays?linked=discord')
    except Exception as e:
        print(f"[Discord Link] Exception: {e}")
        return redirect('/overlays?error=auth_error')

# ==================== TWITCH OAUTH ====================

@overlays_bp.route('/twitch/connect')
@overlays_auth_required
def twitch_connect():
    params = {
        'client_id': TWITCH_CLIENT_ID,
        'redirect_uri': TWITCH_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'channel:read:subscriptions channel:read:redemptions bits:read moderator:read:followers',
        'state': secrets.token_urlsafe(16)
    }
    session['twitch_oauth_state'] = params['state']
    return redirect(f"https://id.twitch.tv/oauth2/authorize?{urllib.parse.urlencode(params)}")

@overlays_bp.route('/twitch/callback')
@overlays_auth_required
def twitch_callback():
    code = request.args.get('code')
    state = request.args.get('state')
    error = request.args.get('error')

    if error or state != session.get('twitch_oauth_state'):
        return redirect('/overlays?error=twitch_auth_failed')

    if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
        return redirect('/overlays?error=twitch_env_missing&detail=TWITCH_CLIENT_ID+or+TWITCH_CLIENT_SECRET+environment+variable+is+not+set+on+the+server')

    try:
        token_res = http_requests.post('https://id.twitch.tv/oauth2/token', data={
            'client_id': TWITCH_CLIENT_ID,
            'client_secret': TWITCH_CLIENT_SECRET,
            'code': code,
            'grant_type': 'authorization_code',
            'redirect_uri': TWITCH_REDIRECT_URI
        })
        if token_res.status_code != 200:
            try:
                err_body = token_res.json()
                err_msg = err_body.get('message', err_body.get('error_description', token_res.text[:200]))
            except Exception:
                err_msg = token_res.text[:200]
            print(f"[Twitch OAuth] Token exchange failed {token_res.status_code}: {err_msg}")
            return redirect(f'/overlays?error=twitch_token_failed&detail={urllib.parse.quote(err_msg)}')

        tokens = token_res.json()
        access_token = tokens.get('access_token')
        refresh_token = tokens.get('refresh_token')

        # Get Twitch user info
        user_res = http_requests.get('https://api.twitch.tv/helix/users', headers={
            'Authorization': f'Bearer {access_token}',
            'Client-Id': TWITCH_CLIENT_ID
        })
        if user_res.status_code != 200:
            try:
                err_msg = user_res.json().get('message', user_res.text[:200])
            except Exception:
                err_msg = user_res.text[:200]
            print(f"[Twitch OAuth] User fetch failed {user_res.status_code}: {err_msg}")
            return redirect(f'/overlays?error=twitch_user_failed&detail={urllib.parse.quote(err_msg)}')

        twitch_user = user_res.json().get('data', [{}])[0]
        discord_user = get_overlay_user()

        all_tokens = load_twitch_tokens()
        all_tokens[discord_user['id']] = {
            'access_token': access_token,
            'refresh_token': refresh_token,
            'twitch_id': twitch_user.get('id'),
            'twitch_login': twitch_user.get('login'),
            'twitch_display': twitch_user.get('display_name'),
            'connected_at': int(time.time())
        }
        save_twitch_tokens(all_tokens)

        # Register EventSub subscriptions
        _register_eventsub(twitch_user.get('id'), access_token)

        return redirect('/overlays?twitch_connected=1')
    except Exception as e:
        return redirect(f'/overlays?error=twitch_error')

@overlays_bp.route('/twitch/disconnect', methods=['POST'])
@overlays_auth_required
def twitch_disconnect():
    user = get_overlay_user()
    all_tokens = load_twitch_tokens()
    if user['id'] in all_tokens:
        del all_tokens[user['id']]
        save_twitch_tokens(all_tokens)
    return redirect('/overlays')

@overlays_bp.route('/api/twitch/session-followers')
def twitch_session_followers():
    """Return followers collected this session for a given channel. No auth required — used by browser sources."""
    channel = request.args.get('channel', '').lower().strip()
    if not channel:
        return jsonify({'followers': [], 'connected': False})
    # Find the discord user whose Twitch login matches
    all_tokens = load_twitch_tokens()
    discord_id = next(
        (did for did, t in all_tokens.items() if t.get('twitch_login', '').lower() == channel),
        None
    )
    if not discord_id:
        return jsonify({'followers': [], 'connected': False})
    path = os.path.join(TWITCH_EVENTS_DIR, f'{discord_id}_session_followers.json')
    try:
        with open(path) as f:
            followers = json.load(f)
    except Exception:
        followers = []
    return jsonify({'followers': followers, 'connected': True})

@overlays_bp.route('/api/twitch/session-followers/clear', methods=['POST'])
@overlays_auth_required
def twitch_session_followers_clear():
    """Clear the session followers list (call at stream start)."""
    user = get_overlay_user()
    all_tokens = load_twitch_tokens()
    token_data = all_tokens.get(user['id'], {})
    if not token_data:
        return jsonify({'ok': False})
    path = os.path.join(TWITCH_EVENTS_DIR, f"{user['id']}_session_followers.json")
    try:
        with open(path, 'w') as f:
            json.dump([], f)
    except Exception:
        pass
    return jsonify({'ok': True})

def _get_app_access_token():
    res = http_requests.post('https://id.twitch.tv/oauth2/token', data={
        'client_id': TWITCH_CLIENT_ID,
        'client_secret': TWITCH_CLIENT_SECRET,
        'grant_type': 'client_credentials'
    })
    if res.status_code == 200:
        return res.json().get('access_token')
    return None

def _register_eventsub(broadcaster_id, user_token):
    if not TWITCH_CLIENT_ID or not broadcaster_id:
        return
    app_token = _get_app_access_token()
    if not app_token:
        return

    headers = {
        'Authorization': f'Bearer {app_token}',
        'Client-Id': TWITCH_CLIENT_ID,
        'Content-Type': 'application/json'
    }
    transport = {'method': 'webhook', 'callback': TWITCH_WEBHOOK_URL, 'secret': TWITCH_WEBHOOK_SECRET}

    event_types = [
        ('channel.follow', '2', {'broadcaster_user_id': broadcaster_id, 'moderator_user_id': broadcaster_id}),
        ('channel.subscribe', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.subscription.gift', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.cheer', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.raid', '1', {'to_broadcaster_user_id': broadcaster_id}),
        ('channel.channel_points_custom_reward_redemption.add', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.hype_train.begin', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.hype_train.progress', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.hype_train.end', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.poll.begin', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.poll.progress', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.poll.end', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.prediction.begin', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.prediction.progress', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.prediction.lock', '1', {'broadcaster_user_id': broadcaster_id}),
        ('channel.prediction.end', '1', {'broadcaster_user_id': broadcaster_id}),
    ]

    for etype, version, condition in event_types:
        try:
            http_requests.post('https://api.twitch.tv/helix/eventsub/subscriptions', json={
                'type': etype, 'version': version, 'condition': condition, 'transport': transport
            }, headers=headers, timeout=5)
        except Exception:
            pass

# ==================== TWITCH EVENTSUB WEBHOOK ====================

@overlays_bp.route('/twitch/webhook', methods=['POST'])
def twitch_webhook():
    # Verify HMAC signature
    msg_id = request.headers.get('Twitch-Eventsub-Message-Id', '')
    msg_ts = request.headers.get('Twitch-Eventsub-Message-Timestamp', '')
    msg_sig = request.headers.get('Twitch-Eventsub-Message-Signature', '')
    body = request.get_data()

    expected = 'sha256=' + hmac.new(
        TWITCH_WEBHOOK_SECRET.encode(),
        (msg_id + msg_ts).encode() + body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected, msg_sig):
        return 'Forbidden', 403

    payload = request.get_json(silent=True) or {}
    msg_type = request.headers.get('Twitch-Eventsub-Message-Type', '')

    # Challenge verification
    if msg_type == 'webhook_callback_verification':
        return payload.get('challenge', ''), 200

    if msg_type == 'notification':
        event = payload.get('event', {})
        sub_type = payload.get('subscription', {}).get('type', '')
        broadcaster_id = (event.get('broadcaster_user_id') or
                          event.get('to_broadcaster_user_id', ''))

        # Find which user owns this broadcaster ID
        all_tokens = load_twitch_tokens()
        for discord_id, token_data in all_tokens.items():
            if token_data.get('twitch_id') == broadcaster_id:
                _dispatch_alert(discord_id, sub_type, event)
                break

    return '', 200

def _append_session_follower(discord_id, display_name):
    """Accumulate follower names for the current stream session."""
    path = os.path.join(TWITCH_EVENTS_DIR, f'{discord_id}_session_followers.json')
    try:
        existing = []
        if os.path.exists(path):
            with open(path) as f:
                existing = json.load(f)
        if display_name and display_name not in existing:
            existing.append(display_name)
            with open(path, 'w') as f:
                json.dump(existing, f)
    except Exception:
        pass

def _dispatch_alert(discord_id, event_type, event):
    # Alert events (follow, sub, bits, raid, points)
    if event_type == 'channel.follow':
        follower_name = event.get('user_name', 'Someone')
        _append_session_follower(discord_id, follower_name)
        notify_alert_event(discord_id, 'follow', {'type': 'follow', 'name': follower_name})
    elif event_type == 'channel.subscribe':
        notify_alert_event(discord_id, 'sub', {'type': 'sub', 'name': event.get('user_name', 'Someone'),
                'tier': event.get('tier', '1000'), 'is_gift': event.get('is_gift', False)})
    elif event_type == 'channel.subscription.gift':
        notify_alert_event(discord_id, 'gift_sub', {'type': 'gift_sub', 'gifter': event.get('user_name', 'Anonymous'),
                'count': event.get('total', 1), 'tier': event.get('tier', '1000')})
    elif event_type == 'channel.cheer':
        notify_alert_event(discord_id, 'bits', {'type': 'bits', 'name': event.get('user_name', 'Anonymous'),
                'amount': event.get('bits', 0), 'message': event.get('message', '')})
    elif event_type == 'channel.raid':
        notify_alert_event(discord_id, 'raid', {'type': 'raid', 'name': event.get('from_broadcaster_user_name', 'Someone'),
                'count': event.get('viewers', 0)})
    elif event_type == 'channel.channel_points_custom_reward_redemption.add':
        reward_title = event.get('reward', {}).get('title', 'Reward')
        notify_alert_event(discord_id, 'points', {'type': 'points', 'name': event.get('user_name', 'Someone'),
                'reward': reward_title})
        # Trigger channel points reactions on matching scenes
        try:
            notify_scene_reaction(discord_id, reward_title, {
                'name': event.get('user_name', 'Someone'),
                'reward': reward_title,
                'input': event.get('user_input', ''),
            })
        except Exception:
            pass

    # Hype train events
    elif event_type in ('channel.hype_train.begin', 'channel.hype_train.progress'):
        state = {
            'active': True,
            'level': event.get('level', 1),
            'total': event.get('total', 0),
            'goal': event.get('goal', 100),
            'progress': event.get('progress', 0),
            'top_contributions': event.get('top_contributions', []),
            'last_contribution': event.get('last_contribution', {}),
            'expires_at': event.get('expires_at', ''),
        }
        _notify_twitch_event(discord_id, 'hype_train', state)
    elif event_type == 'channel.hype_train.end':
        state = _load_twitch_event(discord_id, 'hype_train').get('data', {})
        state['active'] = False
        state['ended'] = True
        state['level'] = event.get('level', 1)
        _notify_twitch_event(discord_id, 'hype_train', state)

    # Poll events
    elif event_type in ('channel.poll.begin', 'channel.poll.progress'):
        state = {
            'active': True,
            'title': event.get('title', ''),
            'choices': event.get('choices', []),
            'ends_at': event.get('ends_at', ''),
            'started_at': event.get('started_at', ''),
        }
        _notify_twitch_event(discord_id, 'poll', state)
    elif event_type == 'channel.poll.end':
        state = {
            'active': False,
            'ended': True,
            'title': event.get('title', ''),
            'choices': event.get('choices', []),
            'status': event.get('status', 'completed'),
        }
        _notify_twitch_event(discord_id, 'poll', state)

    # Prediction events
    elif event_type in ('channel.prediction.begin', 'channel.prediction.progress'):
        state = {
            'active': True,
            'locked': False,
            'title': event.get('title', ''),
            'outcomes': event.get('outcomes', []),
            'locks_at': event.get('locks_at', ''),
            'started_at': event.get('started_at', ''),
        }
        _notify_twitch_event(discord_id, 'prediction', state)
    elif event_type == 'channel.prediction.lock':
        existing = _load_twitch_event(discord_id, 'prediction').get('data', {})
        existing['locked'] = True
        existing['outcomes'] = event.get('outcomes', existing.get('outcomes', []))
        _notify_twitch_event(discord_id, 'prediction', existing)
    elif event_type == 'channel.prediction.end':
        state = {
            'active': False,
            'ended': True,
            'title': event.get('title', ''),
            'outcomes': event.get('outcomes', []),
            'winning_outcome_id': event.get('winning_outcome_id', ''),
            'status': event.get('status', 'resolved'),
        }
        _notify_twitch_event(discord_id, 'prediction', state)

# ==================== PAGE ROUTES ====================

@overlays_bp.route('/')
def dashboard():
    user = get_overlay_user()
    if not user:
        return render_template('overlays-login.html')

    error = request.args.get('error')
    detail = request.args.get('detail', '')
    twitch_connected = request.args.get('twitch_connected')

    data = load_overlays_data()
    all_tokens = load_twitch_tokens()
    twitch_info = all_tokens.get(user['id'])

    user_scenes = [s for s in data.get('scenes', {}).values() if s.get('user_id') == user['id']]
    user_scenes.sort(key=lambda s: s.get('created', 0), reverse=True)

    return render_template('overlays-dashboard.html',
        user=user, scenes=user_scenes, scene_labels=SCENE_LABELS,
        twitch_info=twitch_info, error=error, detail=detail, twitch_connected=twitch_connected,
        twitch_configured=bool(TWITCH_CLIENT_ID))

@overlays_bp.route('/new')
@overlays_auth_required
def new_scene():
    return render_template('overlays-new.html',
        user=get_overlay_user(), scene_types=SCENE_LABELS, template_labels=TEMPLATE_LABELS)

@overlays_bp.route('/new-pack')
@overlays_auth_required
def new_pack():
    return render_template('overlays-new-pack.html',
        user=get_overlay_user(), template_labels=TEMPLATE_LABELS, v=int(time.time()))

@overlays_bp.route('/scenes/<scene_id>/edit')
@overlays_auth_required
def editor(scene_id):
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)

    if not scene or not can_edit_scene(scene, user['id']):
        return redirect('/overlays?error=not_found')

    all_tokens = load_twitch_tokens()
    twitch_info = all_tokens.get(user['id'])
    is_owner = owns_scene(scene, user['id'])

    all_scenes = sorted(
        [s for s in data.get('scenes', {}).values() if can_edit_scene(s, user['id'])],
        key=lambda s: s.get('created', 0), reverse=True
    )

    return render_template('overlays-editor.html',
        user=user, scene=scene, scene_id=scene_id,
        scene_labels=SCENE_LABELS, template_labels=TEMPLATE_LABELS,
        twitch_info=twitch_info, is_owner=is_owner, all_scenes=all_scenes,
        source_url=f'{request.host_url.rstrip("/")}/overlays/source/{scene_id}',
        alerts_url=f'{request.host_url.rstrip("/")}/overlays/alerts/{user["id"]}')

# ==================== API ROUTES ====================

@overlays_bp.route('/api/scenes', methods=['POST'])
@overlays_auth_required
def create_scene():
    user = get_overlay_user()
    body = request.get_json(silent=True) or {}

    scene_type = body.get('type', 'starting-soon')
    template = body.get('template', 'minimal')
    name = body.get('name', SCENE_LABELS.get(scene_type, 'My Scene'))

    if scene_type not in DEFAULT_CONFIGS:
        return jsonify({'error': 'Invalid scene type'}), 400

    scene_id = str(uuid.uuid4())
    config = dict(DEFAULT_CONFIGS[scene_type])

    scene = {
        'id': scene_id, 'user_id': user['id'], 'name': name,
        'type': scene_type, 'template': template,
        'created': int(time.time()), 'updated': int(time.time()),
        'collaborators': [],
        'invite_token': None,
        'config': config
    }

    data = load_overlays_data()
    data.setdefault('scenes', {})[scene_id] = scene
    save_overlays_data(data)

    return jsonify({'scene_id': scene_id, 'ok': True})

@overlays_bp.route('/api/scenes/<scene_id>', methods=['GET'])
@overlays_auth_required
def get_scene(scene_id):
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not can_edit_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404
    return jsonify(scene)

@overlays_bp.route('/api/scenes/<scene_id>', methods=['PUT'])
@overlays_auth_required
def update_scene(scene_id):
    user = get_overlay_user()
    body = request.get_json(silent=True) or {}

    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not can_edit_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404

    if 'name' in body:
        scene['name'] = str(body['name'])[:100]
    if 'template' in body:
        scene['template'] = str(body['template'])
    if 'config' in body and isinstance(body['config'], dict):
        scene['config'].update(body['config'])

    scene['updated'] = int(time.time())
    save_overlays_data(data)

    # Trigger SSE update
    notify_scene_update(scene_id, {'template': scene['template'], **scene['config']})

    return jsonify({'ok': True})

@overlays_bp.route('/api/scenes/<scene_id>', methods=['DELETE'])
@overlays_auth_required
def delete_scene(scene_id):
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not owns_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404

    del data['scenes'][scene_id]
    save_overlays_data(data)

    # Clean up event file
    event_path = os.path.join(EVENTS_DIR, f'{scene_id}.json')
    if os.path.exists(event_path):
        try:
            os.remove(event_path)
        except Exception:
            pass

    return jsonify({'ok': True})

@overlays_bp.route('/api/scenes/<scene_id>/duplicate', methods=['POST'])
@overlays_auth_required
def duplicate_scene(scene_id):
    import copy
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not can_edit_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404
    new_id = str(uuid.uuid4())
    new_scene = copy.deepcopy(scene)
    new_scene['id'] = new_id
    new_scene['user_id'] = user['id']
    new_scene['name'] = scene['name'] + ' (Copy)'
    new_scene['created'] = int(time.time())
    new_scene['updated'] = int(time.time())
    new_scene['collaborators'] = []
    new_scene['invite_token'] = None
    data['scenes'][new_id] = new_scene
    save_overlays_data(data)
    return jsonify({'scene_id': new_id, 'ok': True})

@overlays_bp.route('/api/packs', methods=['POST'])
@overlays_auth_required
def create_pack():
    import copy
    user = get_overlay_user()
    body = request.get_json(silent=True) or {}
    scene_types = body.get('scene_types', ['starting-soon', 'brb', 'ending', 'offline', 'live'])
    template = body.get('template', 'minimal')
    pack_name = str(body.get('pack_name', 'My Pack'))[:60]
    overrides = body.get('config_overrides', {})  # colors, font, etc.

    data = load_overlays_data()
    created_ids = []
    for stype in scene_types:
        if stype not in DEFAULT_CONFIGS:
            continue
        sid = str(uuid.uuid4())
        config = dict(DEFAULT_CONFIGS[stype])
        config.update({k: v for k, v in overrides.items() if k in config or k in _SCENE_VISUAL_EXTRAS})
        scene = {
            'id': sid, 'user_id': user['id'],
            'name': f'{pack_name} — {SCENE_LABELS.get(stype, stype)}',
            'type': stype, 'template': template,
            'created': int(time.time()), 'updated': int(time.time()),
            'collaborators': [], 'invite_token': None, 'config': config,
        }
        data.setdefault('scenes', {})[sid] = scene
        created_ids.append({'scene_id': sid, 'type': stype})
    save_overlays_data(data)
    return jsonify({'ok': True, 'scenes': created_ids})

@overlays_bp.route('/api/lastfm/<username>')
def lastfm_proxy(username):
    """Proxy Last.fm recent tracks to avoid CORS issues"""
    api_key = LASTFM_API_KEY or request.args.get('api_key', '')
    if not api_key:
        return jsonify({'error': 'No Last.fm API key configured'}), 400
    try:
        r = http_requests.get(
            'https://ws.audioscrobbler.com/2.0/',
            params={'method': 'user.getrecenttracks', 'user': username,
                    'api_key': api_key, 'format': 'json', 'limit': '1'},
            timeout=5
        )
        if not r.ok:
            return jsonify({'error': 'Last.fm error'}), 502
        tracks = r.json().get('recenttracks', {}).get('track', [])
        if not tracks:
            return jsonify({'track': None})
        t = tracks[0] if isinstance(tracks, list) else tracks
        now_playing = t.get('@attr', {}).get('nowplaying') == 'true'
        return jsonify({
            'track': {
                'name': t.get('name', ''),
                'artist': t.get('artist', {}).get('#text', ''),
                'album': t.get('album', {}).get('#text', ''),
                'image': next((i.get('#text') for i in reversed(t.get('image', [])) if i.get('#text')), ''),
                'now_playing': now_playing,
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 502

@overlays_bp.route('/api/scenes/<scene_id>/analytics')
@overlays_auth_required
def scene_analytics(scene_id):
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not can_edit_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404
    analytics = load_analytics().get(scene_id, {})
    sessions = analytics.get('sessions', [])
    now = time.time()
    day_ago = now - 86400
    sessions_today = [s for s in sessions if s.get('start', 0) > day_ago]
    avg_duration = (sum(s.get('duration', 0) for s in sessions_today) / len(sessions_today)) if sessions_today else 0
    return jsonify({
        'last_seen': analytics.get('last_seen'),
        'total_active_seconds': analytics.get('total_active_seconds', 0),
        'sessions_today': len(sessions_today),
        'avg_session_minutes': round(avg_duration / 60, 1),
        'is_live': analytics.get('last_connect') is not None and (now - analytics.get('last_seen', 0)) < 10,
    })

@overlays_bp.route('/api/scenes/<scene_id>/config')
def public_config(scene_id):
    """Public endpoint — OBS source page loads this to get current config"""
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene:
        return jsonify({'error': 'Not found'}), 404
    return jsonify({'template': scene.get('template', 'minimal'), 'user_id': scene.get('user_id', ''), **scene.get('config', {})})

@overlays_bp.route('/api/scenes/<scene_id>/copy-config', methods=['POST'])
@overlays_auth_required
def copy_scene_config(scene_id):
    """Copy config from scene_id onto a target scene"""
    user = get_overlay_user()
    data = load_overlays_data()
    source = data.get('scenes', {}).get(scene_id)
    if not source or source.get('user_id') != user['id']:
        return jsonify({'error': 'Not found'}), 404
    target_id = (request.get_json(silent=True) or {}).get('target_scene_id')
    target = data.get('scenes', {}).get(target_id)
    if not target or target.get('user_id') != user['id']:
        return jsonify({'error': 'Target not found'}), 404
    # Merge source visual/effects keys into target (preserve target-specific keys like title, social)
    COPYABLE = {'bg_image_url','font_weight','color_grading','film_grain','bloom_glow',
                'clock_widget','clock_format','clock_position',
                'goal_bar','goal_bar_title','goal_bar_current','goal_bar_max','goal_bar_position',
                'viewer_queue','viewer_queue_title','viewer_queue_position',
                'background_type','bg_color','bg_gradient_from','bg_gradient_to','bg_gradient_angle',
                'accent_color','text_primary','text_secondary','font','particles','particle_color',
                'animation','background_effect','bg_effect_speed','text_effect','logo_effect','show_branding','logo_url',
                'show_alerts'}
    for k in COPYABLE:
        if k in source.get('config', {}):
            target.setdefault('config', {})[k] = source['config'][k]
    save_overlays_data(data)
    notify_scene_update(target_id, target['config'])
    return jsonify({'ok': True})

# ==================== CUBDECK BRIDGE ====================
# These endpoints accept CubDeck session auth so users don't need a separate overlay login.

@overlays_bp.route('/api/deck/scenes', methods=['GET'])
def deck_list_scenes():
    """List the logged-in CubDeck user's overlay scenes."""
    user = session.get('cubdeck_user')
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    uid = user['id']
    data = load_overlays_data()
    scenes = []
    for scene_id, scene in data.get('scenes', {}).items():
        collab_ids = [c.get('id') for c in scene.get('collaborators', [])]
        if scene.get('user_id') == uid or uid in collab_ids:
            scenes.append({
                'id': scene_id,
                'name': scene.get('name', 'Untitled'),
                'type': scene.get('type', 'unknown'),
                'template': scene.get('template', 'minimal'),
                'updated': scene.get('updated', 0),
            })
    scenes.sort(key=lambda s: s.get('updated', 0), reverse=True)
    return jsonify({'scenes': scenes})

@overlays_bp.route('/api/scenes/<scene_id>/deck-control', methods=['PATCH'])
def deck_control_scene(scene_id):
    """Partially update a scene config from CubDeck."""
    user = session.get('cubdeck_user')
    if not user:
        return jsonify({'error': 'Not authenticated'}), 401
    uid = user['id']
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene:
        return jsonify({'error': 'Not found'}), 404
    collab_ids = [c.get('id') for c in scene.get('collaborators', [])]
    if scene.get('user_id') != uid and uid not in collab_ids:
        return jsonify({'error': 'Forbidden'}), 403
    body = request.get_json(silent=True) or {}
    updates = body.get('config', {})
    if not isinstance(updates, dict):
        return jsonify({'error': 'Invalid config'}), 400
    if 'template' in body and isinstance(body['template'], str):
        scene['template'] = body['template']
    scene.setdefault('config', {}).update(updates)
    scene['updated'] = int(time.time())
    save_overlays_data(data)
    notify_scene_update(scene_id, {'template': scene['template'], **scene['config']})
    return jsonify({'ok': True})

# ==================== OBS SOURCE PAGES ====================

@overlays_bp.route('/source/<scene_id>')
def obs_source(scene_id):
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene:
        return 'Scene not found', 404

    template_file = f"source/{scene['type']}.html"
    discord_user_id = scene.get('user_id', '')
    config = {'template': scene.get('template', 'minimal'), **scene.get('config', {})}
    capture_mode = request.args.get('capture') == '1'
    return render_template(template_file, scene_id=scene_id, scene=scene,
                           discord_user_id=discord_user_id, config=config,
                           capture_mode=capture_mode)

@overlays_bp.route('/source/<scene_id>/events')
def obs_source_events(scene_id):
    """SSE endpoint: OBS browser source subscribes here for live config updates"""
    event_path = os.path.join(EVENTS_DIR, f'{scene_id}.json')
    reaction_path = os.path.join(REACTION_EVENTS_DIR, f'{scene_id}.json')

    def generate():
        last_ts = 0
        last_reaction_ts = 0
        deadline = time.time() + 30
        try:
            record_scene_session(scene_id, 'connect')
        except Exception:
            pass
        try:
            while time.time() < deadline:
                try:
                    sent_something = False
                    # Check config updates
                    if os.path.exists(event_path):
                        with open(event_path, 'r') as f:
                            evt = json.load(f)
                        if evt.get('ts', 0) > last_ts:
                            last_ts = evt['ts']
                            yield f"data: {json.dumps({'type': 'update', 'config': evt['config']})}\n\n"
                            sent_something = True
                    # Check reaction events
                    if os.path.exists(reaction_path):
                        with open(reaction_path, 'r') as f:
                            rev = json.load(f)
                        if rev.get('ts', 0) > last_reaction_ts:
                            last_reaction_ts = rev['ts']
                            yield f"data: {json.dumps({'type': 'channel_points_reaction', 'reaction': rev['reaction'], 'event': rev['event']})}\n\n"
                            sent_something = True
                    if not sent_something:
                        yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                    time.sleep(1)
                except GeneratorExit:
                    return
                except Exception:
                    time.sleep(1)
        finally:
            try:
                record_scene_session(scene_id, 'disconnect')
            except Exception:
                pass

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no',
                             'Access-Control-Allow-Origin': '*'})

# ==================== ALERTS OVERLAY ====================

@overlays_bp.route('/alerts/<discord_user_id>')
def alerts_overlay(discord_user_id):
    """Standalone alerts overlay page for OBS"""
    data = load_overlays_data()
    # Find the user's alerts scene config
    alerts_config = None
    for scene in data.get('scenes', {}).values():
        if scene.get('user_id') == discord_user_id and scene.get('type') == 'alerts':
            alerts_config = {'template': scene.get('template', 'minimal'), **scene.get('config', {})}
            break

    if not alerts_config:
        alerts_config = dict(DEFAULT_CONFIGS['alerts'])

    return render_template('source/alerts.html',
                           discord_user_id=discord_user_id,
                           config=alerts_config)

@overlays_bp.route('/alerts/<discord_user_id>/config')
def alerts_config_public(discord_user_id):
    """Public endpoint — alerts overlay polls this to get live config updates"""
    data = load_overlays_data()
    alerts_config = None
    for scene in data.get('scenes', {}).values():
        if scene.get('user_id') == discord_user_id and scene.get('type') == 'alerts':
            alerts_config = {'template': scene.get('template', 'minimal'), **scene.get('config', {})}
            break
    if not alerts_config:
        alerts_config = dict(DEFAULT_CONFIGS['alerts'])
    return jsonify(alerts_config)

@overlays_bp.route('/alerts/<discord_user_id>/events')
def alerts_events(discord_user_id):
    """SSE endpoint: alerts overlay subscribes here for Twitch event notifications"""
    event_path = os.path.join(ALERT_EVENTS_DIR, f'{discord_user_id}.json')
    # Client passes the timestamp of the last event it received so reconnects don't replay old alerts
    try:
        since = float(request.args.get('since', 0))
    except (ValueError, TypeError):
        since = 0.0

    def generate():
        last_ts = since
        deadline = time.time() + 30
        while time.time() < deadline:
            try:
                if os.path.exists(event_path):
                    with open(event_path, 'r') as f:
                        evt = json.load(f)
                    if evt.get('ts', 0) > last_ts:
                        last_ts = evt['ts']
                        yield f"data: {json.dumps({'type': 'alert', 'data': evt.get('data', {}), 'ts': last_ts})}\n\n"
                    else:
                        yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                else:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
                time.sleep(1)
            except GeneratorExit:
                break
            except Exception:
                time.sleep(1)

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@overlays_bp.route('/hype-train/<discord_user_id>/events')
def hype_train_events(discord_user_id):
    """SSE: hype train state updates"""
    def generate():
        last_ts = 0.0
        deadline = time.time() + 30
        while time.time() < deadline:
            evt = _load_twitch_event(discord_user_id, 'hype_train')
            ts = evt.get('ts', 0)
            if ts > last_ts:
                last_ts = ts
                yield f"data: {json.dumps({'type': 'update', 'data': evt.get('data', {})})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
            time.sleep(1)
    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@overlays_bp.route('/poll/<discord_user_id>/events')
def poll_events(discord_user_id):
    """SSE: poll state updates"""
    def generate():
        last_ts = 0.0
        deadline = time.time() + 30
        while time.time() < deadline:
            evt = _load_twitch_event(discord_user_id, 'poll')
            ts = evt.get('ts', 0)
            if ts > last_ts:
                last_ts = ts
                yield f"data: {json.dumps({'type': 'update', 'data': evt.get('data', {})})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
            time.sleep(1)
    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@overlays_bp.route('/prediction/<discord_user_id>/events')
def prediction_events(discord_user_id):
    """SSE: prediction state updates"""
    def generate():
        last_ts = 0.0
        deadline = time.time() + 30
        while time.time() < deadline:
            evt = _load_twitch_event(discord_user_id, 'prediction')
            ts = evt.get('ts', 0)
            if ts > last_ts:
                last_ts = ts
                yield f"data: {json.dumps({'type': 'update', 'data': evt.get('data', {})})}\n\n"
            else:
                yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
            time.sleep(1)
    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})

@overlays_bp.route('/api/leaderboard/<discord_user_id>')
def leaderboard_api(discord_user_id):
    """Proxy Twitch bits leaderboard for the leaderboard overlay"""
    all_tokens = load_twitch_tokens()
    token_data = all_tokens.get(discord_user_id)
    if not token_data:
        return jsonify({'data': []})
    period = request.args.get('period', 'all')
    count = min(int(request.args.get('count', 5)), 10)
    try:
        res = http_requests.get('https://api.twitch.tv/helix/bits/leaderboard', params={
            'count': count, 'period': period,
            'broadcaster_id': token_data.get('twitch_id', '')
        }, headers={
            'Authorization': f"Bearer {token_data['access_token']}",
            'Client-Id': TWITCH_CLIENT_ID,
        }, timeout=5)
        return jsonify(res.json() if res.status_code == 200 else {'data': []})
    except Exception:
        return jsonify({'data': []})

@overlays_bp.route('/alerts/test/<discord_user_id>', methods=['POST'])
@overlays_auth_required
def test_alert(discord_user_id):
    """Send a test alert event"""
    user = get_overlay_user()
    if user['id'] != discord_user_id:
        return jsonify({'error': 'Forbidden'}), 403

    alert_type = request.get_json(silent=True, force=True).get('type', 'follow')

    _test_names = ['CUBSOFTWARE', 'CUB', 'HexEchoTV']
    _n = random.choice(_test_names)
    _n2 = random.choice(_test_names)
    test_events = {
        'follow': {'type': 'follow', 'name': _n},
        'sub': {'type': 'sub', 'name': _n, 'tier': '1000', 'is_gift': False},
        'gift_sub': {'type': 'gift_sub', 'gifter': _n, 'count': 5, 'tier': '1000'},
        'bits': {'type': 'bits', 'name': _n, 'amount': 100, 'message': 'PogChamp!'},
        'raid': {'type': 'raid', 'name': _n2, 'count': 42},
        'points': {'type': 'points', 'name': _n, 'reward': 'CUB Reward'}
    }

    data = test_events.get(alert_type, test_events['follow'])
    notify_alert_event(discord_user_id, data['type'], data)
    return jsonify({'ok': True})

# ==================== COLLABORATOR / SHARING ROUTES ====================

@overlays_bp.route('/api/scenes/<scene_id>/invite', methods=['POST'])
@overlays_auth_required
def generate_invite(scene_id):
    """Generate a one-time-use invite link for collaborators"""
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not owns_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404

    token = secrets.token_urlsafe(24)
    scene['invite_token'] = token
    save_overlays_data(data)

    invite_url = f"https://cubsoftware.site/overlays/invite/{token}"
    return jsonify({'ok': True, 'invite_url': invite_url})

@overlays_bp.route('/api/scenes/<scene_id>/invite', methods=['DELETE'])
@overlays_auth_required
def revoke_invite(scene_id):
    """Revoke the active invite link"""
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not owns_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404

    scene['invite_token'] = None
    save_overlays_data(data)
    return jsonify({'ok': True})

@overlays_bp.route('/api/scenes/<scene_id>/collaborators/<collab_id>', methods=['DELETE'])
@overlays_auth_required
def remove_collaborator(scene_id, collab_id):
    """Remove a collaborator from the scene"""
    user = get_overlay_user()
    data = load_overlays_data()
    scene = data.get('scenes', {}).get(scene_id)
    if not scene or not owns_scene(scene, user['id']):
        return jsonify({'error': 'Not found'}), 404

    collabs = scene.get('collaborators', [])
    if collab_id in collabs:
        collabs.remove(collab_id)
    scene['collaborators'] = collabs
    save_overlays_data(data)
    return jsonify({'ok': True})

@overlays_bp.route('/invite/<token>')
def accept_invite(token):
    """Page where invited user accepts/declines collaboration"""
    # Find scene with this token
    data = load_overlays_data()
    scene = None
    scene_id = None
    for sid, s in data.get('scenes', {}).items():
        if s.get('invite_token') == token:
            scene = s
            scene_id = sid
            break

    if not scene:
        return render_template('overlays-invite.html', error='This invite link is invalid or has expired.')

    user = get_overlay_user()
    if not user:
        session['pending_invite_token'] = token
        return redirect('/overlays')

    return render_template('overlays-invite.html', scene=scene, scene_id=scene_id,
                           token=token, user=user, error=None)

@overlays_bp.route('/invite/<token>/accept', methods=['POST'])
@overlays_auth_required
def accept_invite_post(token):
    user = get_overlay_user()
    data = load_overlays_data()

    for scene in data.get('scenes', {}).values():
        if scene.get('invite_token') == token:
            if scene.get('user_id') == user['id']:
                return jsonify({'error': 'You already own this scene'}), 400
            collabs = scene.get('collaborators', [])
            if user['id'] not in collabs:
                collabs.append(user['id'])
            scene['collaborators'] = collabs
            # Do NOT revoke token so others can still use it until owner revokes
            save_overlays_data(data)
            scene_id = scene['id']
            return redirect(f'/overlays/scenes/{scene_id}/edit')
