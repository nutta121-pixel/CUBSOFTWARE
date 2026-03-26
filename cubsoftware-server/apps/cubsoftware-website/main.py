from flask import Flask, send_from_directory, render_template, redirect, request, jsonify, session, url_for, Response, make_response
from waitress import serve
import socket
import os
import sys
import tempfile
import importlib.util
import json
import hashlib
import time
from datetime import datetime, timedelta, timezone
import secrets
import subprocess
import requests
import urllib.parse
import re
import random
import atexit
import signal
from functools import wraps
from jinja2 import ChoiceLoader, FileSystemLoader
from PIL import Image
import io

# Add shared folder to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'shared'))
from bot_logger import BotLogger

# Initialize bot logger
logger = BotLogger('cubsoftware-website', os.environ.get('BOT_API_KEY'))

# Create the main Flask app with multiple template folders
app = Flask(__name__,
            static_folder='website/static')

# Secret key for sessions — loads from env var, persisted key file, or generates + saves a new one
def _load_or_create_secret_key() -> str:
    env_key = os.environ.get('FLASK_SECRET_KEY', '')
    if env_key:
        return env_key
    key_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'secret_key.txt')
    key_path = os.path.normpath(key_path)
    try:
        if os.path.exists(key_path):
            stored = open(key_path).read().strip()
            if stored:
                return stored
        new_key = secrets.token_hex(32)
        os.makedirs(os.path.dirname(key_path), exist_ok=True)
        with open(key_path, 'w') as f:
            f.write(new_key)
        return new_key
    except Exception:
        return secrets.token_hex(32)

app.secret_key = _load_or_create_secret_key()

# Dev mode — set DEV_MODE=1 in environment to enable auth bypass on localhost
IS_DEV = os.environ.get('DEV_MODE', '') == '1'
if IS_DEV:
    print('[DEV] Dev mode enabled — auth bypass active on localhost')

# Session configuration
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = False if IS_DEV else True
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['PERMANENT_SESSION_LIFETIME'] = 2592000  # 30 days
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # Don't cache static files
if IS_DEV:
    print('[DEV] SESSION_COOKIE_SECURE=False for localhost HTTP')

# Cache-busting: version string changes on each server restart
STATIC_VERSION = str(int(time.time()))

@app.after_request
def add_cache_headers(response):
    """Set cache headers so browsers always check for updated static files"""
    if request.path.startswith('/static/'):
        response.headers['Cache-Control'] = 'no-cache, must-revalidate'
    return response

MASCOT_EXCLUDED_PREFIXES = (
    '/apps/multi-twitch',
    '/dashboard',
    '/bot-dashboard',
    '/affiliate/dashboard',
    '/affiliate/admin',
    '/cub-protector',
    '/cleanme-dashboard',
    '/overlays/source',
    '/overlays/alerts',
    '/overlays/twitch/webhook',
    '/overlays/auth',
    '/overlays/scenes',
    '/overlays/new',
    '/overlays/invite',
    '/overlays/api',
    '/cubdeck',
    '/cubassist',
    '/streamavatars',
)

@app.after_request
def inject_mascot(response):
    """Inject the CUB SOFTWARE mascot image into every HTML page"""
    if request.path.startswith(MASCOT_EXCLUDED_PREFIXES):
        return response
    if response.content_type and response.content_type.startswith('text/html') and not response.direct_passthrough:
        mascot_html = b'<img src="/static/images/CUB/CUBSOFTWARE%20MASCOT%20-%20TRANSPARENT%20BACKGROUND%202.png" class="site-mascot" alt="" draggable="false">'
        data = response.get_data()
        if b'</body>' in data:
            data = data.replace(b'</body>', mascot_html + b'</body>', 1)
            response.set_data(data)
    return response

@app.context_processor
def inject_version():
    """Inject cache-busting version into all templates"""
    return {'v': STATIC_VERSION}

@app.template_filter('datetime')
def format_datetime(ts):
    """Format a Unix timestamp as a readable date string"""
    return datetime.fromtimestamp(int(ts)).strftime('%d %b %Y')

# Configure Jinja to look in multiple template directories
app.jinja_loader = ChoiceLoader([
    FileSystemLoader('website'),
    FileSystemLoader('website/includes'),
    FileSystemLoader('apps/social-media-saver/templates')
])

# ==================== BUY ME A COFFEE ====================
BMAC_TOKEN = os.environ.get('BMAC_TOKEN', '')
_bmac_cache = {'data': [], 'ts': 0}
BMAC_CACHE_TTL = 600  # 10 minutes — BMAC rate-limits aggressively

@app.route('/api/bmac/supporters')
def bmac_supporters():
    global _bmac_cache
    now = time.time()
    if BMAC_TOKEN and (now - _bmac_cache['ts'] > BMAC_CACHE_TTL):
        try:
            r = requests.get(
                'https://developers.buymeacoffee.com/api/v1/supporters',
                headers={'Authorization': f'Bearer {BMAC_TOKEN}'},
                timeout=8
            )
            r.raise_for_status()
            _bmac_cache['data'] = r.json().get('data', [])
            _bmac_cache['ts'] = now
        except Exception as e:
            app.logger.warning(f'[BMAC] Failed to fetch supporters: {e}')
    # Return last 5 sorted newest-first, only public info
    supporters = sorted(
        _bmac_cache['data'],
        key=lambda x: x.get('support_created_on', ''),
        reverse=True
    )[:5]
    result = [{
        'name':    s.get('supporter_name') or s.get('payer_name') or 'Anonymous',
        'coffees': s.get('support_coffees', 1),
        'note':    s.get('support_note', ''),
        'date':    s.get('support_created_on', ''),
    } for s in supporters]
    return jsonify(result)

# StreamerBot docs path — normpath removes the '..' so Werkzeug safe_join doesn't 500
STREAMERBOT_DOCS_PATH = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'streamerbot-docs'))

# ==================== IP BAN SYSTEM ====================

IP_BANS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'ip_bans.json')

def load_ip_bans():
    """Load IP bans from file"""
    if os.path.exists(IP_BANS_FILE):
        try:
            with open(IP_BANS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'global': [], 'features': {}, 'temp': []}

def save_ip_bans(data):
    """Save IP bans to file"""
    os.makedirs(os.path.dirname(IP_BANS_FILE), exist_ok=True)
    with open(IP_BANS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def check_ip_ban(ip, feature=None):
    """
    Check if an IP is banned
    Returns: (is_banned, ban_type, reason, expires_at)
    """
    bans = load_ip_bans()
    current_time = time.time()

    # Check global bans first
    for ban in bans.get('global', []):
        if ban['ip'] == ip:
            return (True, 'global', ban.get('reason', 'No reason'), None)

    # Check temporary bans
    for ban in bans.get('temp', []):
        if ban['ip'] == ip:
            if current_time < ban.get('expires', 0):
                # Check if temp ban is for specific feature or global
                if ban.get('feature'):
                    if feature and ban['feature'] == feature:
                        return (True, 'temp_feature', ban.get('reason', 'Temporary ban'), ban['expires'])
                else:
                    return (True, 'temp_global', ban.get('reason', 'Temporary ban'), ban['expires'])

    # Check feature-specific bans
    if feature and feature in bans.get('features', {}):
        for ban in bans['features'][feature]:
            if ban['ip'] == ip:
                return (True, 'feature', ban.get('reason', 'Feature ban'), None)

    return (False, None, None, None)

def clean_expired_temp_bans():
    """Remove expired temporary bans"""
    bans = load_ip_bans()
    current_time = time.time()
    original_count = len(bans.get('temp', []))
    bans['temp'] = [b for b in bans.get('temp', []) if b.get('expires', 0) > current_time]
    if len(bans['temp']) != original_count:
        save_ip_bans(bans)

# Clean expired bans periodically (call this in background or on each request)
def maybe_clean_bans():
    """Clean bans occasionally (1 in 100 requests)"""
    if secrets.randbelow(100) == 0:
        clean_expired_temp_bans()

# Decorator to check IP bans before route handlers
def check_ban(feature=None):
    """Decorator to check if IP is banned for a feature or globally"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            maybe_clean_bans()
            ip = get_client_ip()
            is_banned, ban_type, reason, expires = check_ip_ban(ip, feature)

            if is_banned:
                if request.is_json or request.path.startswith('/api/'):
                    return jsonify({
                        'error': 'Access denied',
                        'reason': reason,
                        'ban_type': ban_type,
                        'expires': expires
                    }), 403
                else:
                    return render_template('banned.html',
                                         reason=reason,
                                         ban_type=ban_type,
                                         expires=expires), 403

            return f(*args, **kwargs)
        return decorated_function
    return decorator

# ==================== FEATURE DISABLE SYSTEM ====================

DISABLED_FEATURES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'disabled_features.json')

def load_disabled_features():
    """Load list of disabled features from file"""
    if os.path.exists(DISABLED_FEATURES_FILE):
        try:
            with open(DISABLED_FEATURES_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return []

def is_feature_disabled(feature_name):
    """Check if a specific feature is disabled"""
    disabled = load_disabled_features()
    return feature_name in disabled

def check_feature_enabled(feature_name):
    """Decorator to check if a feature is enabled before allowing access"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            if is_feature_disabled(feature_name):
                if request.is_json or request.path.startswith('/api/'):
                    return jsonify({
                        'error': 'Feature disabled',
                        'feature': feature_name,
                        'message': 'This feature is currently disabled for maintenance.'
                    }), 503
                else:
                    return render_template('feature-disabled.html', feature=feature_name), 503
            return f(*args, **kwargs)
        return decorated_function
    return decorator

# ==================== FEATURE STATUS API ====================

@app.route('/api/features/status')
def get_features_status():
    """Return list of disabled features for the frontend"""
    disabled = load_disabled_features()
    return jsonify({'disabled': disabled})

# ==================== RATE LIMITING ====================

# Global rate limiting storage
rate_limits = {}  # ip -> {feature -> [timestamps]}
RATE_LIMIT_CONFIGS = {
    'default': {'requests': 60, 'window': 60},  # 60 requests per minute
    'api': {'requests': 30, 'window': 60},  # 30 API requests per minute
    'download': {'requests': 10, 'window': 60},  # 10 downloads per minute
    'shorten': {'requests': 10, 'window': 60},  # 10 shortens per minute
    'report': {'requests': 3, 'window': 300},  # 3 reports per 5 minutes to prevent spam
    'oauth': {'requests': 20, 'window': 60},       # 20 OAuth attempts per minute per IP
    'dashboard': {'requests': 120, 'window': 60},  # 120 dashboard API requests per minute per IP (2/sec)
}

def check_rate_limit(ip, feature='default'):
    """Check if IP is rate limited. Returns (allowed, retry_after)"""
    config = RATE_LIMIT_CONFIGS.get(feature, RATE_LIMIT_CONFIGS['default'])
    max_requests = config['requests']
    window = config['window']

    now = time.time()
    key = f"{ip}:{feature}"

    if key not in rate_limits:
        rate_limits[key] = []

    # Clean old timestamps
    rate_limits[key] = [t for t in rate_limits[key] if now - t < window]

    if len(rate_limits[key]) >= max_requests:
        oldest = rate_limits[key][0]
        retry_after = window - (now - oldest)
        return (False, retry_after)

    rate_limits[key].append(now)
    return (True, 0)

def rate_limit(feature='default'):
    """Decorator to apply rate limiting"""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            ip = get_client_ip()
            allowed, retry_after = check_rate_limit(ip, feature)

            if not allowed:
                if request.is_json or request.path.startswith('/api/'):
                    response = jsonify({
                        'error': 'Rate limit exceeded',
                        'retry_after': int(retry_after)
                    })
                    response.status_code = 429
                    response.headers['Retry-After'] = str(int(retry_after))
                    return response
                else:
                    return f'Rate limit exceeded. Please try again in {int(retry_after)} seconds.', 429

            return f(*args, **kwargs)
        return decorated_function
    return decorator

# Placeholder images for missing assets
@app.route('/static/images/default-server.png')
def default_server_image():
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <rect width="128" height="128" rx="24" fill="#2b2d31"/>
  <rect x="32" y="44" width="64" height="8" rx="4" fill="#5865f2"/>
  <rect x="32" y="60" width="48" height="8" rx="4" fill="#4e5058"/>
  <rect x="32" y="76" width="56" height="8" rx="4" fill="#4e5058"/>
</svg>'''
    return Response(svg, mimetype='image/svg+xml')

@app.route('/static/images/default-avatar.png')
def default_avatar_image():
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <circle cx="64" cy="64" r="64" fill="#2b2d31"/>
  <circle cx="64" cy="50" r="20" fill="#4e5058"/>
  <ellipse cx="64" cy="100" rx="32" ry="22" fill="#4e5058"/>
</svg>'''
    return Response(svg, mimetype='image/svg+xml')

@app.route('/static/images/cleanme-logo.png')
def cleanme_logo_image():
    svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" fill="#5865f2"/>
  <text x="32" y="44" font-size="36" text-anchor="middle" fill="white" font-family="Arial">🧹</text>
</svg>'''
    return Response(svg, mimetype='image/svg+xml')

# ==================== UNIFIED LOGIN SYSTEM ====================

CUB_REMEMBERED_USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'cub_remembered_users.json')
CUB_LINKED_ACCOUNTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'cub_linked_accounts.json')
CUB_REMEMBER_COOKIE = 'cub_remember'
CUB_REMEMBER_DAYS = 30
CUB_LOGIN_DISCORD_REDIRECT = os.environ.get('CUB_LOGIN_DISCORD_REDIRECT', 'https://cubsoftware.site/login/discord/callback')
CUB_LOGIN_TWITCH_REDIRECT = os.environ.get('CUB_LOGIN_TWITCH_REDIRECT', 'https://cubsoftware.site/login/twitch/callback')

def _cub_load_remembered():
    if os.path.exists(CUB_REMEMBERED_USERS_FILE):
        try:
            with open(CUB_REMEMBERED_USERS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _cub_save_remembered(data):
    os.makedirs(os.path.dirname(CUB_REMEMBERED_USERS_FILE), exist_ok=True)
    with open(CUB_REMEMBERED_USERS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def _cub_create_remember_token(user_data):
    token = secrets.token_urlsafe(48)
    data = _cub_load_remembered()
    # Never persist short-lived tokens or large datasets — only identity fields
    _exclude = {'access_token', 'admin_guilds', 'raw_guilds'}
    safe_user = {k: v for k, v in user_data.items() if k not in _exclude}
    data[token] = {
        'user': safe_user,
        'expires': (datetime.utcnow() + timedelta(days=CUB_REMEMBER_DAYS)).isoformat()
    }
    _cub_save_remembered(data)
    return token

def _cub_validate_remember_token(token):
    data = _cub_load_remembered()
    entry = data.get(token)
    if not entry:
        return None
    try:
        if datetime.utcnow() > datetime.fromisoformat(entry['expires']):
            del data[token]
            _cub_save_remembered(data)
            return None
    except Exception:
        return None
    return entry['user']

def _cub_revoke_remember_token(token):
    data = _cub_load_remembered()
    if token in data:
        del data[token]
        _cub_save_remembered(data)

# ---- Account Linking ----

def _load_linked_accounts():
    if os.path.exists(CUB_LINKED_ACCOUNTS_FILE):
        try:
            with open(CUB_LINKED_ACCOUNTS_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {}

def _save_linked_accounts(data):
    os.makedirs(os.path.dirname(CUB_LINKED_ACCOUNTS_FILE), exist_ok=True)
    with open(CUB_LINKED_ACCOUNTS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def _get_linked_account(provider, user_id):
    """Return linked account entry for a given provider+id, or None."""
    return _load_linked_accounts().get(f'{provider}:{user_id}')

def _link_accounts(prov_a, id_a, user_a, prov_b, id_b, user_b):
    """Link two accounts bidirectionally."""
    data = _load_linked_accounts()
    now = datetime.utcnow().isoformat()
    data[f'{prov_a}:{id_a}'] = {
        'linked_provider': prov_b, 'linked_id': id_b,
        'linked_username': user_b.get('username', ''),
        'linked_avatar': user_b.get('avatar', ''),
        'linked_login': user_b.get('login', ''),
        'linked_at': now,
    }
    data[f'{prov_b}:{id_b}'] = {
        'linked_provider': prov_a, 'linked_id': id_a,
        'linked_username': user_a.get('username', ''),
        'linked_avatar': user_a.get('avatar', ''),
        'linked_login': user_a.get('login', ''),
        'linked_at': now,
    }
    _save_linked_accounts(data)

def _unlink_account(provider, user_id):
    """Remove both directions of a link."""
    data = _load_linked_accounts()
    key = f'{provider}:{user_id}'
    entry = data.pop(key, None)
    if entry:
        other_key = f"{entry['linked_provider']}:{entry['linked_id']}"
        data.pop(other_key, None)
    _save_linked_accounts(data)

def _safe_next_url(url):
    """Only allow relative URLs to prevent open redirect"""
    if not url or '://' in url or url.startswith('//'):
        return '/'
    return url if url.startswith('/') else '/'

@app.before_request
def _cub_restore_session():
    """Restore unified session from remember cookie when Flask session expires"""
    if session.get('cub_user'):
        return
    token = request.cookies.get(CUB_REMEMBER_COOKIE)
    if token:
        user_data = _cub_validate_remember_token(token)
        if user_data:
            session.permanent = True
            session['cub_user'] = user_data

@app.before_request
def _cub_bridge_session():
    """Populate legacy per-app session keys from the unified cub_user so existing tools work"""
    cub = session.get('cub_user')
    if not cub:
        return
    provider = cub.get('provider')
    base = {'id': cub['id'], 'username': cub['username'], 'avatar': cub['avatar']}

    if provider == 'discord':
        if not session.get('cubreactive_user'):
            session['cubreactive_user'] = {**base, 'authenticated_at': cub.get('authenticated_at', time.time())}
        if not session.get('cleanme_user'):
            session['cleanme_user'] = {**base, 'guilds': cub.get('admin_guilds', [])}
        if not session.get('affiliate_user'):
            session['affiliate_user'] = base.copy()
        if not session.get('cubdeck_user'):
            session['cubdeck_user'] = base.copy()
        if not session.get('bot_dashboard_user'):
            session['bot_dashboard_user'] = base.copy()
        if not session.get('cub_protector_user'):
            session['cub_protector_user'] = {
                'id': cub['id'], 'username': cub['username'],
                'avatar_url': cub['avatar'], 'guilds': cub.get('admin_guilds', []),
            }
        # cub_protector_user_guilds is computed at login time; fall back to [] if missing
        if 'cub_protector_user_guilds' not in session:
            session['cub_protector_user_guilds'] = []
        if not session.get('overlay_user'):
            session['overlay_user'] = {**base, 'login_type': 'discord'}
        if not session.get('ban_appeal_user'):
            session['ban_appeal_user'] = {'id': cub['id'], 'username': cub['username'], 'avatar_url': cub['avatar']}
        if not session.get('pm2_user') and is_user_whitelisted(cub['id']):
            session['pm2_user'] = {'id': cub['id'], 'username': cub['username'], 'discriminator': '0', 'avatar_url': cub['avatar']}

    elif provider == 'twitch':
        if not session.get('cubsoftware_user'):
            session['cubsoftware_user'] = {
                **base,
                'login': cub.get('login', cub['username']),
                'display_name': cub['username'],
                'profile_image': cub['avatar'],
                'access_token': cub.get('access_token', ''),
            }
        if not session.get('overlay_user'):
            session['overlay_user'] = {**base, 'login_type': 'twitch'}

    # Inject linked account sessions (when the other provider is linked)
    linked = cub.get('linked_account')
    if linked:
        linked_prov = linked.get('provider')
        linked_base = {'id': linked['id'], 'username': linked['username'], 'avatar': linked['avatar']}
        if linked_prov == 'twitch' and not session.get('cubsoftware_user'):
            session['cubsoftware_user'] = {
                **linked_base,
                'login': linked.get('login', linked['username']),
                'display_name': linked['username'],
                'profile_image': linked['avatar'],
                'access_token': linked.get('access_token', ''),
            }
        elif linked_prov == 'discord':
            if not session.get('cubreactive_user'):
                session['cubreactive_user'] = {**linked_base, 'authenticated_at': time.time()}
            if not session.get('cleanme_user'):
                session['cleanme_user'] = {**linked_base, 'guilds': []}
            if not session.get('affiliate_user'):
                session['affiliate_user'] = linked_base.copy()
            if not session.get('cubdeck_user'):
                session['cubdeck_user'] = linked_base.copy()
            if not session.get('bot_dashboard_user'):
                session['bot_dashboard_user'] = linked_base.copy()
            if not session.get('cub_protector_user'):
                session['cub_protector_user'] = {
                    'id': linked['id'], 'username': linked['username'],
                    'avatar_url': linked['avatar'], 'guilds': [],
                }
            if 'cub_protector_user_guilds' not in session:
                session['cub_protector_user_guilds'] = []
            if not session.get('ban_appeal_user'):
                session['ban_appeal_user'] = {'id': linked['id'], 'username': linked['username'], 'avatar_url': linked['avatar']}
            if not session.get('pm2_user') and is_user_whitelisted(linked['id']):
                session['pm2_user'] = {'id': linked['id'], 'username': linked['username'], 'discriminator': '0', 'avatar_url': linked['avatar']}

@app.context_processor
def _inject_cub_user():
    """Inject cub_user and nav whitelist flags into every template."""
    cub = session.get('cub_user')
    nav_pm2 = bool(session.get('pm2_user'))
    nav_bot_dashboard = False
    if session.get('bot_dashboard_user'):
        try:
            wl = load_bot_dashboard_whitelist()
            nav_bot_dashboard = session['bot_dashboard_user']['id'] in wl.get('allowed_users', [])
        except Exception:
            pass
    nav_is_affiliate = False
    if cub:
        try:
            aff = get_affiliate_by_discord_id(cub.get('id', ''))
            nav_is_affiliate = bool(aff and aff.get('enabled', True))
        except Exception:
            pass
    return {'cub_user': cub, 'nav_pm2': nav_pm2, 'nav_bot_dashboard': nav_bot_dashboard, 'nav_is_affiliate': nav_is_affiliate}

# ---- Unified login/logout routes ----

@app.route('/login')
def cub_login_page():
    next_url = _safe_next_url(request.args.get('next', ''))
    if session.get('cub_user'):
        return redirect(next_url or '/')
    error_map = {
        'auth_cancelled':      'Login was cancelled.',
        'invalid_state':       'Security check failed. Please try again.',
        'token_failed':        'Could not complete login. Please try again.',
        'user_failed':         'Could not retrieve your profile. Please try again.',
        'server_error':        'A server error occurred. Please try again.',
        'link_require_login':  'You must be logged in to link an account.',
        'already_linked':      'That account is already linked to another user.',
    }
    error = error_map.get(request.args.get('error', ''), '')
    return render_template('login.html', next=next_url, error=error, v=STATIC_VERSION)

@app.route('/logout')
def cub_logout():
    token = request.cookies.get(CUB_REMEMBER_COOKIE)
    if token:
        _cub_revoke_remember_token(token)
    session.clear()
    resp = redirect('/login')
    resp.delete_cookie(CUB_REMEMBER_COOKIE)
    return resp

# ---- Discord OAuth ----

@app.route('/login/discord')
def cub_login_discord():
    next_url = _safe_next_url(request.args.get('next', ''))
    link_mode = request.args.get('link') == '1'
    if link_mode and not session.get('cub_user'):
        return redirect('/login?error=link_require_login')
    state = secrets.token_urlsafe(32)
    session['cub_login_state'] = state
    session['cub_login_next'] = next_url
    if link_mode:
        session['cub_link_mode'] = 'discord'
    config = load_pm2_config()
    params = {
        'client_id': config.get('discord_client_id') or os.environ.get('DISCORD_CLIENT_ID', ''),
        'redirect_uri': CUB_LOGIN_DISCORD_REDIRECT,
        'response_type': 'code',
        'scope': 'identify guilds',
        'state': state,
    }
    return redirect('https://discord.com/api/oauth2/authorize?' + urllib.parse.urlencode(params))

@app.route('/login/discord/callback')
@rate_limit('oauth')
def cub_login_discord_callback():
    link_mode = session.pop('cub_link_mode', None)
    if request.args.get('error'):
        return redirect('/login?error=auth_cancelled')
    code = request.args.get('code')
    state = request.args.get('state')
    if not code or state != session.get('cub_login_state'):
        return redirect('/login?error=invalid_state')
    next_url = _safe_next_url(session.pop('cub_login_next', ''))
    session.pop('cub_login_state', None)
    config = load_pm2_config()
    try:
        token_resp = requests.post('https://discord.com/api/oauth2/token', data={
            'client_id': config.get('discord_client_id') or os.environ.get('DISCORD_CLIENT_ID', ''),
            'client_secret': config.get('discord_client_secret') or os.environ.get('DISCORD_CLIENT_SECRET', ''),
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': CUB_LOGIN_DISCORD_REDIRECT,
        }, headers={'Content-Type': 'application/x-www-form-urlencoded'}, timeout=10)
        if token_resp.status_code != 200:
            return redirect('/login?error=token_failed')
        access_token = token_resp.json().get('access_token')
        auth_headers = {'Authorization': f'Bearer {access_token}'}
        user_resp = requests.get('https://discord.com/api/users/@me',
            headers=auth_headers, timeout=10)
        if user_resp.status_code != 200:
            return redirect('/login?error=user_failed')
        u = user_resp.json()
        avatar_hash = u.get('avatar')
        if avatar_hash:
            avatar_url = f"https://cdn.discordapp.com/avatars/{u['id']}/{avatar_hash}.png?size=256"
        else:
            avatar_url = f"https://cdn.discordapp.com/embed/avatars/{int(u.get('discriminator', '0') or '0') % 5}.png"
        # Fetch guilds (compact admin list + raw for protector computation)
        raw_guilds = []
        admin_guilds = []
        try:
            guilds_resp = requests.get('https://discord.com/api/users/@me/guilds',
                headers=auth_headers, timeout=10)
            if guilds_resp.status_code == 200:
                raw_guilds = guilds_resp.json()
                admin_guilds = [g['id'] for g in raw_guilds if (g.get('permissions', 0) & 0x8) == 0x8]
        except Exception:
            pass
        discord_user_data = {
            'id': u['id'],
            'username': u.get('global_name') or u.get('username'),
            'avatar': avatar_url,
        }

        # ── LINK MODE: attach Discord to an existing Twitch login ──────────────
        if link_mode == 'discord':
            current_user = session.get('cub_user')
            if current_user and current_user.get('provider') == 'twitch':
                # Prevent linking if Discord ID already linked elsewhere
                existing = _get_linked_account('discord', u['id'])
                if existing and existing['linked_id'] != current_user['id']:
                    return redirect('/login?error=already_linked')
                _link_accounts(
                    'twitch', current_user['id'],
                    {'username': current_user['username'], 'avatar': current_user['avatar']},
                    'discord', u['id'], discord_user_data,
                )
                current_user['linked_account'] = {
                    'provider': 'discord', 'id': u['id'],
                    'username': discord_user_data['username'],
                    'avatar': discord_user_data['avatar'],
                }
                session['cub_user'] = current_user
                return redirect(next_url or '/account')

        # ── NORMAL LOGIN ────────────────────────────────────────────────────────
        # Compute protector guilds at login time — avoids storing raw_guilds in cookie
        protector_guilds = []
        try:
            bot_guilds = cub_protector_bot_request('/users/@me/guilds?with_counts=true') or []
            custom_bots_data = _load_custom_bots()
            all_covered = {g['id'] for g in bot_guilds} | {
                gid for gid, e in custom_bots_data.get('guilds', {}).items()
                if e.get('enabled') and e.get('token')
            }
            bot_masters_data = load_bot_masters()
            user_id = u['id']
            protector_guilds = [
                {'id': g['id'], 'name': g['name'], 'icon': g.get('icon'),
                 'owner': g.get('owner', False), 'permissions': g.get('permissions', '0')}
                for g in raw_guilds
                if g['id'] in all_covered and (
                    g.get('owner') or
                    (int(g.get('permissions', 0)) & 0x8) == 0x8 or
                    (int(g.get('permissions', 0)) & 0x20) == 0x20 or
                    user_id in bot_masters_data.get(g['id'], [])
                )
            ]
        except Exception:
            pass
        # Check for existing linked Twitch account
        linked = _get_linked_account('discord', u['id'])
        linked_account = None
        if linked:
            linked_account = {
                'provider': linked['linked_provider'], 'id': linked['linked_id'],
                'username': linked['linked_username'], 'avatar': linked['linked_avatar'],
                'login': linked.get('linked_login', ''),
            }
        cub_user = {
            'id': u['id'],
            'provider': 'discord',
            'username': discord_user_data['username'],
            'avatar': avatar_url,
            'authenticated_at': time.time(),
            'admin_guilds': admin_guilds,  # Compact ID list only — no raw guild objects
        }
        if linked_account:
            cub_user['linked_account'] = linked_account
        session.permanent = True
        session['cub_user'] = cub_user
        session['cub_protector_user_guilds'] = protector_guilds
        token = _cub_create_remember_token(cub_user)
        resp = redirect(next_url or '/')
        resp.set_cookie(CUB_REMEMBER_COOKIE, token,
                        max_age=CUB_REMEMBER_DAYS * 24 * 3600,
                        httponly=True, samesite='Lax', secure=not IS_DEV)
        return resp
    except Exception as e:
        app.logger.error(f'Unified Discord login error: {e}')
        return redirect('/login?error=server_error')

# ---- Twitch OAuth ----

@app.route('/login/twitch')
def cub_login_twitch():
    next_url = _safe_next_url(request.args.get('next', ''))
    link_mode = request.args.get('link') == '1'
    if link_mode and not session.get('cub_user'):
        return redirect('/login?error=link_require_login')
    state = secrets.token_urlsafe(32)
    session['cub_login_state'] = state
    session['cub_login_next'] = next_url
    if link_mode:
        session['cub_link_mode'] = 'twitch'
    params = {
        'client_id': os.environ.get('TWITCH_CLIENT_ID', ''),
        'redirect_uri': CUB_LOGIN_TWITCH_REDIRECT,
        'response_type': 'code',
        'scope': 'user:read:email user:write:chat chat:edit moderation:read channel:bot',
        'state': state,
        'force_verify': 'false',
    }
    return redirect('https://id.twitch.tv/oauth2/authorize?' + urllib.parse.urlencode(params))

@app.route('/login/twitch/callback')
@rate_limit('oauth')
def cub_login_twitch_callback():
    link_mode = session.pop('cub_link_mode', None)
    if request.args.get('error'):
        return redirect('/login?error=auth_cancelled')
    code = request.args.get('code')
    state = request.args.get('state')
    if not code or state != session.get('cub_login_state'):
        return redirect('/login?error=invalid_state')
    next_url = _safe_next_url(session.pop('cub_login_next', ''))
    session.pop('cub_login_state', None)
    try:
        token_resp = requests.post('https://id.twitch.tv/oauth2/token', data={
            'client_id': os.environ.get('TWITCH_CLIENT_ID', ''),
            'client_secret': os.environ.get('TWITCH_CLIENT_SECRET', ''),
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': CUB_LOGIN_TWITCH_REDIRECT,
        }, timeout=10)
        if token_resp.status_code != 200:
            return redirect('/login?error=token_failed')
        access_token = token_resp.json().get('access_token')
        user_resp = requests.get('https://api.twitch.tv/helix/users',
            headers={
                'Authorization': f'Bearer {access_token}',
                'Client-Id': os.environ.get('TWITCH_CLIENT_ID', ''),
            }, timeout=10)
        if user_resp.status_code != 200:
            return redirect('/login?error=user_failed')
        users = user_resp.json().get('data', [])
        if not users:
            return redirect('/login?error=user_failed')
        u = users[0]
        twitch_user_data = {
            'id': u['id'],
            'username': u.get('display_name') or u['login'],
            'avatar': u.get('profile_image_url', ''),
            'login': u['login'],
        }

        # ── LINK MODE: attach Twitch to an existing Discord login ──────────────
        if link_mode == 'twitch':
            current_user = session.get('cub_user')
            if current_user and current_user.get('provider') == 'discord':
                existing = _get_linked_account('twitch', u['id'])
                if existing and existing['linked_id'] != current_user['id']:
                    return redirect('/login?error=already_linked')
                _link_accounts(
                    'discord', current_user['id'],
                    {'username': current_user['username'], 'avatar': current_user['avatar']},
                    'twitch', u['id'], twitch_user_data,
                )
                current_user['linked_account'] = {
                    'provider': 'twitch', 'id': u['id'],
                    'username': twitch_user_data['username'],
                    'avatar': twitch_user_data['avatar'],
                    'login': twitch_user_data['login'],
                    'access_token': access_token,
                }
                session['cub_user'] = current_user
                return redirect(next_url or '/account')

        # ── NORMAL LOGIN ────────────────────────────────────────────────────────
        linked = _get_linked_account('twitch', u['id'])
        linked_account = None
        if linked:
            linked_account = {
                'provider': linked['linked_provider'], 'id': linked['linked_id'],
                'username': linked['linked_username'], 'avatar': linked['linked_avatar'],
            }
        cub_user = {
            'id': u['id'],
            'provider': 'twitch',
            'login': u['login'],
            'username': twitch_user_data['username'],
            'avatar': twitch_user_data['avatar'],
            'authenticated_at': time.time(),
            'access_token': access_token,  # Session-only, not persisted to remember cookie
        }
        if linked_account:
            cub_user['linked_account'] = linked_account
        session.permanent = True
        session['cub_user'] = cub_user
        token = _cub_create_remember_token(cub_user)
        resp = redirect(next_url or '/')
        resp.set_cookie(CUB_REMEMBER_COOKIE, token,
                        max_age=CUB_REMEMBER_DAYS * 24 * 3600,
                        httponly=True, samesite='Lax', secure=not IS_DEV)
        return resp
    except Exception as e:
        app.logger.error(f'Unified Twitch login error: {e}')
        return redirect('/login?error=server_error')

# ---- Auth status API ----

@app.route('/api/auth/me')
def cub_auth_me():
    cub = session.get('cub_user')
    if cub:
        return jsonify({'logged_in': True, 'user': {k: v for k, v in cub.items() if k != 'authenticated_at'}})
    return jsonify({'logged_in': False})

# ---- Account management ----

@app.route('/account')
def cub_account():
    cub = session.get('cub_user')
    if not cub:
        return redirect('/login?next=/account')
    return render_template('account.html', v=STATIC_VERSION)

@app.route('/account/unlink', methods=['POST'])
def cub_account_unlink():
    cub = session.get('cub_user')
    if not cub:
        return jsonify({'error': 'Not logged in'}), 401
    _unlink_account(cub['provider'], cub['id'])
    cub.pop('linked_account', None)
    session['cub_user'] = cub
    # Clear linked app sessions so bridge re-populates cleanly next request
    for key in ('cubsoftware_user', 'cubreactive_user', 'cleanme_user', 'affiliate_user',
                'cubdeck_user', 'bot_dashboard_user', 'cub_protector_user', 'ban_appeal_user', 'pm2_user'):
        session.pop(key, None)
    return jsonify({'ok': True})

# ==================== MAIN WEBSITE ROUTES ====================

@app.route('/')
def index():
    """Serve the main landing page, or redirect if on short link domain"""
    host = request.host.lower()
    if 'cubsw.link' in host:
        return redirect('https://cubsoftware.site')
    disabled_features = load_disabled_features()
    return render_template('index.html', disabled_features=disabled_features)

@app.route('/terms')
def terms():
    """Serve the terms of use page"""
    return render_template('terms.html')

@app.route('/privacy')
def privacy():
    """Serve the privacy policy page"""
    return render_template('privacy.html')

@app.route('/copyright')
def copyright_claims():
    """Serve the copyright claims page"""
    return render_template('copyright.html')

@app.route('/contact')
def contact():
    """Serve the contact page"""
    return render_template('contact.html')

@app.route('/press')
def press():
    """Serve the press / media kit page"""
    return render_template('press.html')

@app.route('/cubpresence-wiki')
def cubpresence_wiki():
    """Serve the CubPresence wiki page"""
    return render_template('cubpresence-wiki.html')

@app.route('/static/css/<path:filename>')
def serve_css(filename):
    """Serve CSS files for main website"""
    return send_from_directory('website/static/css', filename)

@app.route('/static/js/<path:filename>')
def serve_js(filename):
    """Serve JavaScript files for main website"""
    return send_from_directory('website/static/js', filename)

@app.route('/static/images/<path:filename>')
def serve_images(filename):
    """Serve image files for main website"""
    return send_from_directory('website/static/images', filename)

@app.route('/marbles/static/<path:filename>')
def serve_marbles_static(filename):
    """Serve static assets for the Marbles section (css, js, images, sounds)"""
    return send_from_directory('website/marbles', filename)

@app.route('/favicon.ico')
def favicon():
    """Serve favicon"""
    return send_from_directory('website/static/images', 'company-logo.png', mimetype='image/png')

# ==================== STREAMERBOT COMMANDS ====================

@app.route('/apps/streamerbot-commands')
@app.route('/apps/streamerbot-commands/')
def streamerbot_index():
    """Serve the StreamerBot commands index page"""
    return send_from_directory(STREAMERBOT_DOCS_PATH, 'index.html')

@app.route('/apps/streamerbot-commands/<path:filename>')
def streamerbot_files(filename):
    """Serve StreamerBot command files"""
    response = make_response(send_from_directory(STREAMERBOT_DOCS_PATH, filename))
    if filename.endswith('.html') or filename.endswith('.js'):
        response.headers['Cache-Control'] = 'no-store, no-cache, must-revalidate'
    return response

# ==================== CUBVAULT PASSWORD MANAGER ====================

@app.route('/apps/cubvault')
@app.route('/apps/cubvault/')
def cubvault_index():
    """CubVault - Secure Password Manager"""
    return render_template('cubvault.html')

# ==================== COLOR PICKER ====================

@app.route('/apps/color-picker')
@app.route('/apps/color-picker/')
@check_feature_enabled('color-picker')
def color_picker():
    """Color Picker - Pick colors, generate palettes, extract from images"""
    return render_template('color-picker.html')

# ==================== QR CODE GENERATOR ====================

@app.route('/apps/qr-generator')
@app.route('/apps/qr-generator/')
@check_feature_enabled('qr-generator')
def qr_generator():
    """QR Code Generator - Create custom QR codes for links, text, contacts, and WiFi"""
    return render_template('qr-generator.html')

# ==================== TEXT TOOLS ====================

@app.route('/apps/text-tools')
@app.route('/apps/text-tools/')
@check_feature_enabled('text-tools')
def text_tools():
    """Text Tools - Word counter, case converter, lorem ipsum generator, and text formatting"""
    return render_template('text-tools.html')

# ==================== IMAGE EDITOR ====================

@app.route('/apps/image-editor')
@app.route('/apps/image-editor/')
@check_feature_enabled('image-editor')
def image_editor():
    """Image Editor - Edit, crop, resize, and enhance images"""
    return render_template('image-editor.html')

# ==================== FILE CONVERTER ====================

@app.route('/apps/file-converter')
@app.route('/apps/file-converter/')
@check_feature_enabled('file-converter')
def file_converter():
    """File Converter - Convert images between PNG, JPG, WebP, GIF, BMP formats"""
    return render_template('file-converter.html')

# ==================== PDF TOOLS ====================

@app.route('/apps/pdf-tools')
@app.route('/apps/pdf-tools/')
@check_feature_enabled('pdf-tools')
def pdf_tools():
    """PDF Tools - Merge, split, compress PDFs and convert images to PDF"""
    return render_template('pdf-tools.html')

# ==================== UNIT CONVERTER ====================

@app.route('/apps/unit-converter')
@app.route('/apps/unit-converter/')
@check_feature_enabled('unit-converter')
def unit_converter():
    """Unit Converter - Convert between different units of measurement"""
    return render_template('unit-converter.html')

# ==================== TIMESTAMP CONVERTER ====================

@app.route('/apps/timestamp-converter')
@app.route('/apps/timestamp-converter/')
@check_feature_enabled('timestamp-converter')
def timestamp_converter():
    """Timestamp Converter - Convert Unix timestamps to human readable dates"""
    return render_template('timestamp-converter.html')

# ==================== COUNTDOWN MAKER ====================

# Storage for shared countdowns
COUNTDOWNS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'countdowns.json')

def load_countdowns():
    """Load shared countdowns from file"""
    if os.path.exists(COUNTDOWNS_FILE):
        with open(COUNTDOWNS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_countdowns(countdowns):
    """Save shared countdowns to file"""
    os.makedirs(os.path.dirname(COUNTDOWNS_FILE), exist_ok=True)
    with open(COUNTDOWNS_FILE, 'w') as f:
        json.dump(countdowns, f, indent=2)

def generate_countdown_id():
    """Generate a unique countdown ID"""
    import random
    return ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))

@app.route('/apps/countdown-maker')
@app.route('/apps/countdown-maker/')
@check_feature_enabled('countdown-maker')
def countdown_maker():
    """Countdown Maker - Create and share countdown timers"""
    return render_template('countdown-maker.html')

@app.route('/apps/countdown-maker/view-<countdown_id>')
def view_countdown(countdown_id):
    """View a shared countdown timer"""
    countdowns = load_countdowns()
    if countdown_id not in countdowns:
        return render_template('404.html'), 404

    # Increment view count
    countdowns[countdown_id]['views'] = countdowns[countdown_id].get('views', 0) + 1
    save_countdowns(countdowns)

    return render_template('countdown-view.html', countdown_id=countdown_id)

@app.route('/api/countdown/create', methods=['POST'])
def create_countdown():
    """API endpoint to create a shareable countdown"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Countdown data is required'}), 400

    countdowns = load_countdowns()

    # Generate unique ID
    countdown_id = generate_countdown_id()
    while countdown_id in countdowns:
        countdown_id = generate_countdown_id()

    # Save the countdown
    countdowns[countdown_id] = {
        'data': data,
        'created': time.time(),
        'views': 0
    }
    save_countdowns(countdowns)

    # Return the share URL
    share_url = f"{request.host_url}apps/countdown-maker/view-{countdown_id}"
    return jsonify({
        'shareUrl': share_url,
        'countdownId': countdown_id
    })

@app.route('/api/countdown/<countdown_id>')
def get_countdown(countdown_id):
    """API endpoint to get countdown data"""
    countdowns = load_countdowns()
    if countdown_id not in countdowns:
        return jsonify({'error': 'Countdown not found'}), 404

    return jsonify(countdowns[countdown_id]['data'])

@app.route('/api/countdown/<countdown_id>', methods=['PUT'])
def update_countdown(countdown_id):
    """API endpoint to update an existing countdown"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Countdown data is required'}), 400

    countdowns = load_countdowns()
    if countdown_id not in countdowns:
        return jsonify({'error': 'Countdown not found'}), 404

    # Update the countdown data
    countdowns[countdown_id]['data'] = data
    countdowns[countdown_id]['updated'] = time.time()
    save_countdowns(countdowns)

    return jsonify({
        'success': True,
        'countdownId': countdown_id,
        'message': 'Countdown updated successfully'
    })

# ==================== LINK SHORTENER ====================

# Storage for shortened links
LINKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'shortened_links.json')
LINKS_AUDIT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'links_audit.json')
BANNED_IPS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'banned_ips.json')

# Discord webhook for link notifications (set in environment)
LINKS_WEBHOOK_URL = os.environ.get('LINKS_DISCORD_WEBHOOK', '')

# Channel ID for affiliate applications (in the CUB SOFTWARE Discord server)
AFFILIATE_APPLY_CHANNEL_ID = '1477045973770567754'

# Rate limiting for link creation
link_rate_limits = {}  # IP -> [timestamps]
LINK_RATE_LIMIT = 10  # max links per minute
LINK_RATE_WINDOW = 60  # seconds

def get_client_ip():
    """Get the real client IP address"""
    # Check for Cloudflare header first
    if request.headers.get('CF-Connecting-IP'):
        return request.headers.get('CF-Connecting-IP')
    # Check for X-Forwarded-For (behind proxy)
    if request.headers.get('X-Forwarded-For'):
        return request.headers.get('X-Forwarded-For').split(',')[0].strip()
    # Check for X-Real-IP
    if request.headers.get('X-Real-IP'):
        return request.headers.get('X-Real-IP')
    return request.remote_addr

def load_links():
    """Load shortened links from file"""
    if os.path.exists(LINKS_FILE):
        with open(LINKS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_links(links):
    """Save shortened links to file"""
    os.makedirs(os.path.dirname(LINKS_FILE), exist_ok=True)
    with open(LINKS_FILE, 'w') as f:
        json.dump(links, f, indent=2)

def load_links_audit():
    """Load links audit log (persists even after deletion)"""
    if os.path.exists(LINKS_AUDIT_FILE):
        with open(LINKS_AUDIT_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_links_audit(audit):
    """Save links audit log"""
    os.makedirs(os.path.dirname(LINKS_AUDIT_FILE), exist_ok=True)
    with open(LINKS_AUDIT_FILE, 'w') as f:
        json.dump(audit, f, indent=2)

def add_to_audit(short_code, original_url, ip_address, action='created'):
    """Add an entry to the audit log"""
    audit = load_links_audit()
    if short_code not in audit:
        audit[short_code] = {
            'original_url': original_url,
            'ip_address': ip_address,
            'created_at': time.time(),
            'history': []
        }
    audit[short_code]['history'].append({
        'action': action,
        'timestamp': time.time(),
        'ip': ip_address
    })
    save_links_audit(audit)

def load_banned_ips():
    """Load banned IPs list"""
    if os.path.exists(BANNED_IPS_FILE):
        with open(BANNED_IPS_FILE, 'r') as f:
            return json.load(f)
    return {'ips': [], 'reasons': {}}

def save_banned_ips(data):
    """Save banned IPs list"""
    os.makedirs(os.path.dirname(BANNED_IPS_FILE), exist_ok=True)
    with open(BANNED_IPS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def is_ip_banned(ip):
    """Check if an IP is banned"""
    banned = load_banned_ips()
    return ip in banned.get('ips', [])

def check_link_rate_limit(ip):
    """Check if IP has exceeded rate limit for link creation"""
    now = time.time()
    if ip not in link_rate_limits:
        link_rate_limits[ip] = []

    # Clean old timestamps
    link_rate_limits[ip] = [t for t in link_rate_limits[ip] if now - t < LINK_RATE_WINDOW]

    if len(link_rate_limits[ip]) >= LINK_RATE_LIMIT:
        return False

    link_rate_limits[ip].append(now)
    return True

def send_link_webhook(short_code, original_url, ip_address, action='created'):
    """Send notification to Discord webhook"""
    if not LINKS_WEBHOOK_URL:
        return

    try:
        color = 0x00FF00 if action == 'created' else 0xFF0000  # Green for create, red for delete
        embed = {
            'title': f'Link {action.title()}',
            'color': color,
            'fields': [
                {'name': 'Short Link', 'value': f'https://cubsw.link/{short_code}', 'inline': True},
                {'name': 'Destination', 'value': original_url[:200] + ('...' if len(original_url) > 200 else ''), 'inline': False},
                {'name': 'IP Address', 'value': f'||{ip_address}||', 'inline': True}
            ],
            'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
        }
        requests.post(LINKS_WEBHOOK_URL, json={'embeds': [embed]}, timeout=5)
    except Exception as e:
        print(f'Failed to send link webhook: {e}')

def generate_short_code(url):
    """Generate a short code for a URL"""
    hash_input = f"{url}{time.time()}"
    return hashlib.md5(hash_input.encode()).hexdigest()[:6]

@app.route('/apps/link-shortener')
@app.route('/apps/link-shortener/')
@check_feature_enabled('link-shortener')
def link_shortener():
    """Link Shortener - Create short URLs"""
    return render_template('link-shortener.html')

@app.route('/api/check-vanity/<code>', methods=['GET'])
def check_vanity_availability(code):
    """Check if a vanity code is available"""
    code = code.strip()
    if not code or len(code) < 3 or len(code) > 20:
        return jsonify({'available': False})

    import re
    if not re.match(r'^[a-zA-Z0-9\-_]+$', code):
        return jsonify({'available': False})

    links = load_links()
    return jsonify({'available': code not in links})

@app.route('/api/shorten', methods=['POST'])
def shorten_url():
    """API endpoint to shorten a URL"""
    ip_address = get_client_ip()

    # Check if IP is banned (uses the new unified ban system)
    is_banned, ban_type, reason, expires = check_ip_ban(ip_address, 'link-shortener')
    if is_banned:
        return jsonify({'error': 'Your IP has been banned from creating links', 'reason': reason}), 403

    # Check rate limit
    if not check_link_rate_limit(ip_address):
        return jsonify({'error': 'Rate limit exceeded. Please wait before creating more links.'}), 429

    data = request.get_json()
    if not data or 'url' not in data:
        return jsonify({'error': 'URL is required'}), 400

    original_url = data['url']
    custom_code = data.get('customCode', '').strip()

    # Validate URL
    if not original_url.startswith(('http://', 'https://')):
        original_url = 'https://' + original_url

    # Block URLs pointing to cubsw.link to prevent redirect loops
    if 'cubsw.link' in original_url.lower():
        return jsonify({'error': 'Cannot shorten cubsw.link URLs'}), 400

    links = load_links()

    # Check if custom code is provided and available
    if custom_code:
        if len(custom_code) < 3 or len(custom_code) > 20:
            return jsonify({'error': 'Custom code must be 3-20 characters'}), 400
        import re
        if not re.match(r'^[a-zA-Z0-9\-_]+$', custom_code):
            return jsonify({'error': 'Custom code can only contain letters, numbers, hyphens, and underscores'}), 400
        if custom_code in links:
            return jsonify({'error': 'Custom code already taken'}), 400
        short_code = custom_code
    else:
        # Generate unique short code
        short_code = generate_short_code(original_url)
        while short_code in links:
            short_code = generate_short_code(original_url + str(time.time()))

    # Save the link with IP tracking
    links[short_code] = {
        'url': original_url,
        'created': time.time(),
        'clicks': 0,
        'ip': ip_address
    }
    save_links(links)

    # Add to audit log
    add_to_audit(short_code, original_url, ip_address, 'created')

    # Send Discord notification
    send_link_webhook(short_code, original_url, ip_address, 'created')

    # Return the shortened URL using the short domain
    short_url = f"https://cubsw.link/{short_code}"
    return jsonify({
        'shortUrl': short_url,
        'shortCode': short_code,
        'originalUrl': original_url
    })

@app.route('/api/links', methods=['GET'])
def get_user_links():
    """Get links created by the current user (based on localStorage codes sent)"""
    codes = request.args.get('codes', '').split(',')
    codes = [c.strip() for c in codes if c.strip()]

    if not codes:
        return jsonify({'links': []})

    links = load_links()
    user_links = []

    for code in codes:
        if code in links:
            user_links.append({
                'code': code,
                'url': links[code]['url'],
                'created': links[code]['created'],
                'clicks': links[code].get('clicks', 0)
            })

    return jsonify({'links': user_links})

@app.route('/api/links/<code>', methods=['DELETE'])
def delete_link(code):
    """Delete a specific link"""
    ip_address = get_client_ip()
    links = load_links()

    if code not in links:
        return jsonify({'error': 'Link not found'}), 404

    # Only allow deletion by the creator (same IP) or if IP tracking wasn't available
    link_ip = links[code].get('ip')
    if link_ip and link_ip != ip_address:
        return jsonify({'error': 'You can only delete links you created'}), 403

    original_url = links[code]['url']
    del links[code]
    save_links(links)

    # Add to audit log
    add_to_audit(code, original_url, ip_address, 'deleted')

    # Send Discord notification
    send_link_webhook(code, original_url, ip_address, 'deleted')

    return jsonify({'success': True, 'message': 'Link deleted'})

@app.route('/api/link-info/<code>', methods=['GET'])
def get_link_info(code):
    """Get information about a specific link (for admin purposes)"""
    # This endpoint should be protected - check for admin API key
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    # Check active links
    links = load_links()
    if code in links:
        return jsonify({
            'found': True,
            'active': True,
            'code': code,
            'url': links[code]['url'],
            'created': links[code]['created'],
            'clicks': links[code].get('clicks', 0),
            'ip': links[code].get('ip', 'Unknown')
        })

    # Check audit log for deleted links
    audit = load_links_audit()
    if code in audit:
        return jsonify({
            'found': True,
            'active': False,
            'code': code,
            'url': audit[code]['original_url'],
            'created': audit[code]['created_at'],
            'ip': audit[code]['ip_address'],
            'history': audit[code]['history']
        })

    return jsonify({'found': False, 'error': 'Link not found in any records'}), 404

@app.route('/s/<code>')
def redirect_short_url(code):
    """Redirect from short URL to original URL (legacy route)"""
    links = load_links()
    if code not in links:
        return render_template('404.html'), 404

    # Increment click count
    links[code]['clicks'] = links[code].get('clicks', 0) + 1
    save_links(links)

    return redirect(links[code]['url'])

@app.route('/<code>')
def redirect_short_code(code):
    """Redirect short codes on cubsw.link domain"""
    # Only handle short codes on the short domain
    host = request.host.lower()
    if 'cubsw.link' not in host:
        # Not the short domain, return 404 (let other routes handle it)
        return render_template('404.html'), 404

    links = load_links()
    if code not in links:
        return render_template('404.html'), 404

    # Increment click count
    links[code]['clicks'] = links[code].get('clicks', 0) + 1
    save_links(links)

    return redirect(links[code]['url'])

# ==================== VIDEO COMPRESSOR ====================

@app.route('/apps/video-compressor')
@app.route('/apps/video-compressor/')
@check_feature_enabled('video-compressor')
def video_compressor():
    """Video Compressor - Compress videos in browser"""
    return render_template('video-compressor.html')

# ==================== RESUME BUILDER ====================

# Storage for shared resumes
RESUMES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'shared_resumes.json')

def load_resumes():
    """Load shared resumes from file"""
    if os.path.exists(RESUMES_FILE):
        with open(RESUMES_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_resumes(resumes):
    """Save shared resumes to file"""
    os.makedirs(os.path.dirname(RESUMES_FILE), exist_ok=True)
    with open(RESUMES_FILE, 'w') as f:
        json.dump(resumes, f, indent=2)

def generate_resume_id():
    """Generate a unique resume ID"""
    import random
    return ''.join(random.choices('0123456789', k=8))

@app.route('/apps/resume-builder')
@app.route('/apps/resume-builder/')
@check_feature_enabled('resume-builder')
def resume_builder():
    """Resume Builder - Create professional resumes and cover letters"""
    return render_template('resume-builder.html')

@app.route('/apps/resume-builder/cv-<resume_id>')
def view_shared_resume(resume_id):
    """View a shared resume"""
    resumes = load_resumes()
    if resume_id not in resumes:
        return render_template('404.html'), 404

    # Increment view count
    resumes[resume_id]['views'] = resumes[resume_id].get('views', 0) + 1
    save_resumes(resumes)

    return render_template('resume-view.html', resume_id=resume_id)

@app.route('/api/resume/share', methods=['POST'])
def share_resume():
    """API endpoint to share a resume and get a unique link"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'Resume data is required'}), 400

    resumes = load_resumes()

    # Generate unique ID
    resume_id = generate_resume_id()
    while resume_id in resumes:
        resume_id = generate_resume_id()

    # Save the resume
    resumes[resume_id] = {
        'data': data,
        'created': time.time(),
        'views': 0
    }
    save_resumes(resumes)

    # Return the share URL
    share_url = f"{request.host_url}apps/resume-builder/cv-{resume_id}"
    return jsonify({
        'shareUrl': share_url,
        'resumeId': resume_id
    })

@app.route('/api/resume/<resume_id>')
def get_resume(resume_id):
    """API endpoint to get resume data"""
    resumes = load_resumes()
    if resume_id not in resumes:
        return jsonify({'error': 'Resume not found'}), 404

    return jsonify(resumes[resume_id]['data'])

# ==================== JSON FORMATTER ====================

@app.route('/apps/json-formatter')
@app.route('/apps/json-formatter/')
@check_feature_enabled('json-formatter')
def json_formatter():
    """JSON Formatter - Beautify, minify, and validate JSON"""
    return render_template('json-formatter.html')

# ==================== WHEEL SPINNER ====================

@app.route('/apps/wheel-spinner')
@app.route('/apps/wheel-spinner/')
@check_feature_enabled('wheel-spinner')
def wheel_spinner():
    """Wheel Spinner - Customizable spinning wheel for giveaways, decisions, and games"""
    return render_template('wheel-spinner.html')

# ==================== RANDOM PICKER ====================

@app.route('/apps/random-picker')
@app.route('/apps/random-picker/')
@check_feature_enabled('random-picker')
def random_picker():
    """Random Picker - Coin flip, dice roll, random number, pick from list"""
    return render_template('random-picker.html')

# ==================== CALCULATOR SUITE ====================

@app.route('/apps/calculator-suite')
@app.route('/apps/calculator-suite/')
@check_feature_enabled('calculator-suite')
def calculator_suite():
    """Calculator Suite - Basic, Scientific, Mortgage, Tip, BMI, Age, and Percentage calculators"""
    return render_template('calculator-suite.html')

# ==================== PASSWORD GENERATOR ====================

@app.route('/apps/password-generator')
@app.route('/apps/password-generator/')
@check_feature_enabled('password-generator')
def password_generator():
    """Password Generator - Generate strong, secure passwords"""
    return render_template('password-generator.html')

# ==================== TIMER TOOLS ====================

@app.route('/apps/timer-tools')
@app.route('/apps/timer-tools/')
@check_feature_enabled('timer-tools')
def timer_tools():
    """Timer Tools - Stopwatch, countdown timer, and Pomodoro"""
    return render_template('timer-tools.html')

# ==================== WORLD CLOCK ====================

@app.route('/apps/world-clock')
@app.route('/apps/world-clock/')
@check_feature_enabled('world-clock')
def world_clock():
    """World Clock - View current time across multiple time zones"""
    return render_template('world-clock.html')

# ==================== CURRENCY CONVERTER ====================

@app.route('/apps/currency-converter')
@app.route('/apps/currency-converter/')
@check_feature_enabled('currency-converter')
def currency_converter():
    """Currency Converter - Convert between world currencies with live exchange rates"""
    return render_template('currency-converter.html')

# ==================== ENCODING TOOLS ====================

@app.route('/apps/encoding-tools')
@app.route('/apps/encoding-tools/')
@check_feature_enabled('encoding-tools')
def encoding_tools():
    """Encoding Tools - Hash, Base64, URL encode, HTML entities, encryption"""
    return render_template('encoding-tools.html')

# ==================== DIFF CHECKER ====================

@app.route('/apps/diff-checker')
@app.route('/apps/diff-checker/')
@check_feature_enabled('diff-checker')
def diff_checker():
    """Diff Checker - Compare two texts and see the differences"""
    return render_template('diff-checker.html')

# ==================== REGEX TESTER ====================

@app.route('/apps/regex-tester')
@app.route('/apps/regex-tester/')
@check_feature_enabled('regex-tester')
def regex_tester():
    """Regex Tester - Test regular expressions in real-time"""
    return render_template('regex-tester.html')

# ==================== CODE MINIFIER ====================

@app.route('/apps/code-minifier')
@app.route('/apps/code-minifier/')
@check_feature_enabled('code-minifier')
def code_minifier():
    """Code Minifier - Minify HTML, CSS, and JavaScript"""
    return render_template('code-minifier.html')

# ==================== MARKDOWN EDITOR ====================

@app.route('/apps/markdown-editor')
@app.route('/apps/markdown-editor/')
@check_feature_enabled('markdown-editor')
def markdown_editor():
    """Markdown Editor - Write and preview Markdown in real-time"""
    return render_template('markdown-editor.html')

# ==================== MARBLE MAP EDITOR ====================

MARBLES_BETA_USERS = {'378501056008683530'}

@app.route('/apps/marble-editor')
@app.route('/apps/marble-editor/')
def marble_editor():
    """Marble Map Editor - Build custom Marbles on Stream maps in the browser (beta whitelist)"""
    cub_user = session.get('cub_user')
    if not cub_user:
        return redirect(url_for('cub_login_page', next='/apps/marble-editor'))
    if str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return render_template('feature-disabled.html', feature='marble-editor'), 403
    is_dev = str(cub_user.get('id', '')) in MARBLES_BETA_USERS
    return render_template('marbles/editor.html', is_dev=is_dev, v=STATIC_VERSION)

# ── Marble Game API (session management + Twitch IRC reader) ──────────────────

from marbles_irc import MarbleIRCManager as _MarbleIRC
from marbles_db import (
    init_db as _marble_db_init,
    award_race_results as _marble_award,
    get_leaderboard as _marble_leaderboard,
    get_player as _marble_player,
    get_track_records as _marble_track_records,
    get_map_leaderboard as _marble_map_leaderboard,
    save_map as _marble_save_map,
    get_maps as _marble_get_maps,
    get_map as _marble_get_map,
    increment_map_plays as _marble_inc_plays,
    rate_map as _marble_rate_map,
    set_map_featured as _marble_set_featured,
    get_featured_maps as _marble_get_featured,
    delete_map as _marble_delete_map,
    get_race_history as _marble_race_history,
    get_maps_admin as _marble_get_maps_admin,
    get_coins_balance as _marble_get_coins,
    adjust_coins as _marble_adjust_coins,
    get_player_achievements as _marble_get_achievements,
    get_player_settings as _marble_get_settings,
    save_player_settings as _marble_save_settings,
    start_season as _marble_start_season,
    end_season as _marble_end_season,
    get_current_season as _marble_current_season,
    get_seasons as _marble_get_seasons,
    get_season_leaderboard as _marble_season_lb,
    ban_player as _marble_ban_player,
    unban_player as _marble_unban_player,
    get_banned_players as _marble_banned_list,
    reset_player_points as _marble_reset_points,
    reset_map_record as _marble_reset_map_record,
    reset_all_track_records as _marble_reset_all_records,
    get_map_versions as _marble_map_versions,
    get_map_version_data as _marble_map_version_data,
    search_players as _marble_search_players,
    get_rival as _marble_get_rival,
    get_marble_of_the_week as _marble_motw,
    get_cosmetics as _marble_get_cosmetics,
    unlock_cosmetic as _marble_unlock_cosmetic,
    equip_cosmetic as _marble_equip_cosmetic,
    get_cosmetics_catalogue as _marble_cosmetics_catalogue,
    buy_shop_item as _marble_buy_shop_item,
    get_shop_catalogue as _marble_get_shop_catalogue,
    get_track_record_for_map as _marble_get_track_record,
)
import secrets as _secrets_mod
_marble_db_init()

# ── StreamAvatars ─────────────────────────────────────────────────────────────
from streamavatars_db import (
    init_db         as _sa_db_init,
    get_characters  as _sa_get_characters,
    get_character   as _sa_get_character,
    save_character  as _sa_save_character,
    activate_character  as _sa_activate,
    delete_character    as _sa_delete,
    get_active_character_id as _sa_active_id,
    get_overlay_settings    as _sa_overlay_settings,
    save_overlay_settings   as _sa_save_overlay_settings,
)
import streamavatars_irc as _sa_irc
_sa_db_init()

@app.route('/marbles/api/game/create', methods=['POST'])
def marbles_game_create():
    body       = request.get_json(silent=True) or {}
    channel    = body.get('channel', '').strip().lower().strip('#')
    if not channel or not re.match(r'^[a-z0-9_]{1,25}$', channel):
        return jsonify({'error': 'Valid Twitch channel name required'}), 400
    join_cmd    = (body.get('join_cmd', '!join') or '!join').strip()
    max_players = max(2, min(int(body.get('max_players', 100)), 200))
    marble_types = body.get('marble_types')  # optional custom roster
    # Race settings
    raw = body.get('settings') or {}
    settings = {
        'fall_mode':        raw.get('fall_mode', 'respawn') if raw.get('fall_mode') in ('respawn', 'elimination') else 'respawn',
        'max_respawns':     max(-1, int(raw.get('max_respawns', -1))),
        'timeout_mins':     max(1, min(60, int(raw.get('timeout_mins', 3)))),
        'gravity':          raw.get('gravity', 'normal') if raw.get('gravity') in ('low', 'normal', 'high') else 'normal',
        'marble_friction':  raw.get('marble_friction', 'normal') if raw.get('marble_friction') in ('low', 'normal', 'high') else 'normal',
        'announce_winner':  bool(raw.get('announce_winner', False)),
        'coin_multiplier':  int(raw.get('coin_multiplier', 1)) if int(raw.get('coin_multiplier', 1)) in (1, 2, 3) else 1,
        'camera_lock':      raw.get('camera_lock', 'off') if raw.get('camera_lock') in ('off', 'leader', 'overview', 'side') else 'off',
    }
    session_obj = _MarbleIRC.get_instance().create_session(channel, join_cmd, max_players, marble_types, settings)
    return jsonify({'ok': True, 'session': session_obj.to_dict()})

@app.route('/marbles/api/game/<session_id>', methods=['GET'])
def marbles_game_get(session_id):
    s = _MarbleIRC.get_instance().get_session(session_id)
    if not s:
        return jsonify({'error': 'Session not found'}), 404
    return jsonify(s.to_dict())

@app.route('/marbles/api/game/<session_id>/start', methods=['POST'])
def marbles_game_start(session_id):
    mgr    = _MarbleIRC.get_instance()
    if not mgr.get_session(session_id):
        return jsonify({'error': 'Session not found'}), 404
    body   = request.get_json(silent=True) or {}
    map_id = body.get('map_id', '')
    ok = mgr.start_race(session_id, map_id=map_id)
    s  = mgr.get_session(session_id)
    if ok and s and s.settings.get('tournament_mode', False):
        s.tournament_race_num += 1
    if ok and s and s.settings.get('elimination_rounds', False):
        s.elimination_round += 1
    # Auto-assign teams when team_mode is on
    if ok and s and s.settings.get('team_mode', False) and not s.teams:
        players = [p['name'] for p in s.players]
        import random as _rnd
        _rnd.shuffle(players)
        mid = len(players) // 2
        s.teams = {p: ('red' if i < mid else 'blue') for i, p in enumerate(players)}
    return jsonify({'ok': ok, 'session': s.to_dict()})

@app.route('/marbles/api/game/<session_id>/end', methods=['POST'])
def marbles_game_end(session_id):
    mgr = _MarbleIRC.get_instance()
    if not mgr.get_session(session_id):
        return jsonify({'error': 'Session not found'}), 404
    mgr.end_session(session_id)
    return jsonify({'ok': True})

@app.route('/marbles/api/game/<session_id>/reset', methods=['POST'])
def marbles_game_reset(session_id):
    mgr = _MarbleIRC.get_instance()
    if not mgr.get_session(session_id):
        return jsonify({'error': 'Session not found'}), 404
    mgr.reset_lobby(session_id)
    s = mgr.get_session(session_id)
    return jsonify({'ok': True, 'session': s.to_dict()})

@app.route('/marbles/api/game/<session_id>/kick', methods=['POST'])
def marbles_game_kick(session_id):
    mgr      = _MarbleIRC.get_instance()
    body     = request.get_json(silent=True) or {}
    username = body.get('username', '').lower().strip()
    if not username:
        return jsonify({'error': 'username required'}), 400
    mgr.kick_player(session_id, username)
    return jsonify({'ok': True})

@app.route('/marbles/api/game/<session_id>/selection', methods=['POST'])
def marbles_game_selection(session_id):
    """Open or close the character-select phase."""
    mgr  = _MarbleIRC.get_instance()
    s    = mgr.get_session(session_id)
    if not s:
        return jsonify({'error': 'Session not found'}), 404
    body = request.get_json(silent=True) or {}
    s.selection_open = bool(body.get('open', True))
    if not s.selection_open:
        s.player_selections = dict(s.player_selections)   # freeze snapshot
    return jsonify({'ok': True, 'selection_open': s.selection_open})

@app.route('/marbles/api/game/<session_id>/roster', methods=['POST'])
def marbles_game_roster(session_id):
    """Live-update the marble roster (types list) for a session."""
    mgr  = _MarbleIRC.get_instance()
    s    = mgr.get_session(session_id)
    if not s:
        return jsonify({'error': 'Session not found'}), 404
    body = request.get_json(silent=True) or {}
    marble_types = body.get('marble_types')
    if not isinstance(marble_types, list):
        return jsonify({'error': 'marble_types array required'}), 400
    s.marble_types = marble_types
    return jsonify({'ok': True})

@app.route('/marbles/api/irc-status', methods=['GET'])
def marbles_irc_status():
    return jsonify(_MarbleIRC.get_instance().connection_status())

@app.route('/marbles/api/game/<session_id>/abilities', methods=['GET'])
def marbles_game_abilities(session_id):
    """Poll pending chat abilities. Returns and clears the queue."""
    mgr = _MarbleIRC.get_instance()
    s   = mgr.get_session(session_id)
    if not s:
        return jsonify({'abilities': []})
    return jsonify({'abilities': s.drain_abilities()})

@app.route('/marbles/api/game/<session_id>/ability-log', methods=['GET'])
def marbles_game_ability_log(session_id):
    """Return the last 10 fired abilities for the OBS control panel."""
    mgr = _MarbleIRC.get_instance()
    s   = mgr.get_session(session_id)
    if not s:
        return jsonify({'log': []})
    return jsonify({'log': s.get_ability_log()})

@app.route('/marbles/api/game/<session_id>/chat', methods=['GET'])
def marbles_game_chat(session_id):
    """Return recent Twitch chat messages for a session (for the in-race chat overlay)."""
    since_ts = int(request.args.get('since', 0))
    msgs = _MarbleIRC.get_instance().get_chat(session_id, since_ts=since_ts)
    return jsonify({'messages': msgs})

@app.route('/marbles/api/game/<session_id>/results', methods=['POST'])
def marbles_game_results(session_id):
    mgr  = _MarbleIRC.get_instance()
    s    = mgr.get_session(session_id)
    if not s:
        return jsonify({'error': 'Session not found'}), 404
    body          = request.get_json(silent=True) or {}
    results       = body.get('results', [])
    map_id        = body.get('map_id', 'unknown')
    map_name      = body.get('map_name', 'Untitled')
    halfway_last      = body.get('halfway_last', '')
    race_duration_ms  = int(body.get('race_duration_ms', 0) or 0)
    ghost_paths       = body.get('ghost_paths') or None  # {login: [[x,y,z], ...]}
    s.results = results
    # For tournament mode, keep session alive between races
    is_tournament = s.settings.get('tournament_mode', False)
    total_races   = max(2, min(10, int(s.settings.get('tournament_races', 3))))
    race_is_final = (not is_tournament) or (s.tournament_race_num >= total_races)
    if race_is_final:
        s.state = 'ended'
    else:
        s.state = 'lobby'  # ready for next race; players preserved
    # Write stats to DB (non-blocking — failures are logged, not surfaced)
    race_id = _secrets_mod.token_hex(8)
    try:
        base_multiplier = s.settings.get('coin_multiplier', 1)
        if getattr(s, 'double_coins_active', False):
            base_multiplier = base_multiplier * 2
            s.double_coins_active = False   # consumed — reset for next race
        summary = _marble_award(race_id, map_id, map_name, s.channel, results,
                                coin_multiplier=base_multiplier,
                                halfway_last=halfway_last,
                                race_duration_ms=race_duration_ms,
                                player_roles=s.get_player_roles(),
                                ghost_paths=ghost_paths)
    except Exception as e:
        app.logger.warning(f'marbles_db award_race_results error: {e}')
        summary = {}

    # Post new achievements to Twitch chat (non-blocking)
    try:
        ach_by_player = {u: v['achievements'] for u, v in summary.items() if v.get('achievements')}
        if ach_by_player and s.settings.get('announce_winner', False):
            mgr.post_achievement_feed(s.channel, ach_by_player)
    except Exception as e:
        app.logger.debug(f'marbles achievement feed error: {e}')

    # Discord webhook — post race result embed (non-blocking)
    webhook_url = s.settings.get('discord_webhook', '').strip()
    if webhook_url:
        try:
            import threading as _thr, requests as _req
            def _post_discord():
                top3 = [r for r in sorted(results, key=lambda r: r.get('rank') or 999) if r.get('rank')][:3]
                medals = ['🥇', '🥈', '🥉']
                podium = '\n'.join(
                    f"{medals[i]} **{r['username']}** — {(r.get('finish_time_ms',0)/1000):.2f}s"
                    for i, r in enumerate(top3)
                ) or 'No finishers'
                embed = {
                    'title': f'🏁 Race Finished — {map_name}',
                    'description': podium,
                    'color': 0x5865f2,
                    'fields': [
                        {'name': 'Players', 'value': str(len(results)), 'inline': True},
                        {'name': 'Channel', 'value': f'#{s.channel}', 'inline': True},
                    ],
                    'footer': {'text': 'cubsoftware.site/marbles'},
                }
                try:
                    _req.post(webhook_url, json={'embeds': [embed]}, timeout=5)
                except Exception:
                    pass
            _thr.Thread(target=_post_discord, daemon=True).start()
        except Exception as e:
            app.logger.debug(f'Discord webhook error: {e}')

    # Accumulate tournament scores
    tournament_info = None
    if is_tournament:
        race_pts = {1:15, 2:12, 3:10, 4:8, 5:6, 6:4, 7:3, 8:2}
        for r in results:
            login = (r.get('username') or '').lower()
            rank  = r.get('rank')
            if login and rank:
                pts = race_pts.get(rank, 1)
                s.tournament_scores[login] = s.tournament_scores.get(login, 0) + pts
        standings = sorted(s.tournament_scores.items(), key=lambda x: -x[1])
        tournament_info = {
            'race_num':   s.tournament_race_num,
            'total_races': total_races,
            'final':      race_is_final,
            'standings':  [{'login': l, 'points': p} for l, p in standings],
        }

    # Elimination mode: remove last finisher each round
    elimination_info = None
    is_elimination = s.settings.get('elimination_rounds', False)
    if is_elimination and results:
        sorted_r = sorted(results, key=lambda r: (r.get('rank') or 999))
        loser_login = (sorted_r[-1].get('username') or '').lower()
        if loser_login:
            s.elimination_eliminated.append(loser_login)
            s.remove_player(loser_login)
        remaining = [p['name'] for p in s.players]
        elim_final = len(remaining) <= 1
        if elim_final:
            s.state = 'ended'
        elif not is_tournament:          # tournament handles state above; elimination standalone
            s.state = 'lobby'
        elimination_info = {
            'round':                s.elimination_round,
            'eliminated_this_round': loser_login,
            'all_eliminated':       list(s.elimination_eliminated),
            'remaining':            remaining,
            'final':                elim_final,
        }

    return jsonify({'ok': True, 'race_id': race_id, 'summary': summary, 'tournament': tournament_info, 'elimination': elimination_info})

# ── Stream alert queues (in-memory, per channel) ─────────────────────────────
from collections import deque as _deque
_marble_alert_queues: dict = {}   # channel → deque(maxlen=20) of alert dicts

@app.route('/marbles/api/game/<session_id>/alerts/push', methods=['POST'])
def marbles_push_alerts(session_id):
    """play.js pushes stream alerts (records, achievements) here after a race."""
    mgr = _MarbleIRC.get_instance()
    s   = mgr.get_session(session_id)
    if not s:
        return jsonify({'ok': False}), 404
    body   = request.get_json(silent=True) or {}
    alerts = body.get('alerts', [])
    ch = s.channel
    if ch not in _marble_alert_queues:
        _marble_alert_queues[ch] = _deque(maxlen=20)
    for a in alerts[:10]:  # cap to 10 per push
        if isinstance(a, dict) and a.get('type'):
            _marble_alert_queues[ch].append(a)
    return jsonify({'ok': True})

@app.route('/marbles/api/channel/<channel>/alerts', methods=['GET'])
def marbles_consume_alerts(channel):
    """Browser source polls this to consume pending alerts. Returns and clears queue."""
    ch = channel.lower().strip('#')
    q  = _marble_alert_queues.get(ch)
    if not q:
        return jsonify({'alerts': []})
    alerts = list(q)
    q.clear()
    return jsonify({'alerts': alerts})

@app.route('/marbles/alerts/<channel>')
@app.route('/marbles/alerts/<channel>/')
def marbles_alerts_source(channel):
    """OBS browser source URL for stream alerts (transparent overlay)."""
    return render_template('marbles/alerts.html', channel=channel.lower().strip('#'), v=STATIC_VERSION)

@app.route('/marbles/api/map/<map_id>/ghost', methods=['GET'])
def marbles_api_map_ghost(map_id):
    """Return the ghost path (track record replay) for a map, if available."""
    rec = _marble_get_track_record(map_id)
    if not rec or not rec.get('path'):
        return jsonify({'ok': False, 'holder': None, 'time_ms': None, 'path': None})
    return jsonify({
        'ok':      True,
        'holder':  rec['twitch_login'],
        'time_ms': rec['finish_time_ms'],
        'path':    rec['path'],
    })

@app.route('/marbles/leaderboard')
@app.route('/marbles/leaderboard/')
def marbles_leaderboard():
    sort    = request.args.get('sort', 'points')
    current_season = _marble_current_season()
    if sort == 'season' and current_season:
        data = _marble_season_lb(current_season['season_id'], limit=100)
    else:
        data = _marble_leaderboard(sort_by=sort if sort != 'season' else 'points', limit=100)
    recs  = _marble_track_records(limit=20)
    motw  = _marble_motw()
    return render_template('marbles/leaderboard.html', players=data, track_records=recs,
                           sort=sort, current_season=current_season, motw=motw, v=STATIC_VERSION)

@app.route('/marbles/player/search')
def marbles_player_search_page():
    q = request.args.get('q', '').strip()
    results = _marble_search_players(q, limit=20) if q else []
    return render_template('marbles/player-search.html', query=q, results=results, v=STATIC_VERSION)

@app.route('/marbles/api/player/search', methods=['GET'])
def marbles_api_player_search():
    q = request.args.get('q', '').strip()
    if not q:
        return jsonify([])
    return jsonify(_marble_search_players(q, limit=20))

@app.route('/marbles/player/<twitch_login>')
def marbles_player_profile(twitch_login):
    login = twitch_login.lower()
    data = _marble_player(login)
    cub_user = session.get('cubsoftware_user')
    my_login = cub_user.get('login', '').lower() if cub_user else ''
    is_own   = (my_login == login)
    rival    = _marble_get_rival(login) if data else None
    if not data:
        return render_template('marbles/player.html', player=None, username=twitch_login,
                               is_own=is_own, rival=None, v=STATIC_VERSION)
    return render_template('marbles/player.html', player=data, username=twitch_login,
                           is_own=is_own, rival=rival, v=STATIC_VERSION)

@app.route('/marbles/api/leaderboard', methods=['GET'])
def marbles_api_leaderboard():
    sort  = request.args.get('sort', 'points')
    limit = min(int(request.args.get('limit', 100)), 200)
    return jsonify(_marble_leaderboard(sort_by=sort, limit=limit))

@app.route('/marbles/api/leaderboard/top10', methods=['GET'])
def marbles_api_leaderboard_top10():
    """Top 10 by points — for chat commands and embeds."""
    return jsonify(_marble_leaderboard(sort_by='points', limit=10))

@app.route('/marbles/api/leaderboard/map/<map_id>', methods=['GET'])
def marbles_api_map_leaderboard(map_id):
    """Per-map leaderboard — all players' best times on this map."""
    from marbles_db import get_map_leaderboard
    return jsonify(get_map_leaderboard(map_id))

@app.route('/marbles/api/player/<twitch_login>', methods=['GET'])
def marbles_api_player(twitch_login):
    data = _marble_player(twitch_login.lower())
    if not data:
        return jsonify({'error': 'Player not found'}), 404
    return jsonify(data)

@app.route('/marbles/api/player/<twitch_login>/coins', methods=['GET', 'POST'])
def marbles_api_player_coins(twitch_login):
    """GET: return coin balance. POST (admin): adjust coins. Body: {amount, reason}"""
    login = twitch_login.lower()
    if request.method == 'GET':
        return jsonify({'twitch_login': login, 'coins': _marble_get_coins(login)})
    # POST — admin only
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    body   = request.get_json(silent=True) or {}
    amount = int(body.get('amount', 0))
    reason = str(body.get('reason', 'admin_adjust'))
    new_bal = _marble_adjust_coins(login, amount, reason)
    return jsonify({'ok': True, 'twitch_login': login, 'new_balance': new_bal})

@app.route('/marbles/api/player/<twitch_login>/achievements', methods=['GET'])
def marbles_api_player_achievements(twitch_login):
    """Return all unlocked achievements for a player."""
    return jsonify(_marble_get_achievements(twitch_login.lower()))

@app.route('/marbles/api/achievements', methods=['GET'])
def marbles_api_achievements_list():
    """Return the full achievement definition catalogue."""
    from marbles_db import ACHIEVEMENTS
    return jsonify([{**v, 'key': k} for k, v in ACHIEVEMENTS.items()])

@app.route('/marbles/api/player/<twitch_login>/cosmetics', methods=['GET'])
def marbles_api_player_cosmetics(twitch_login):
    """Return a player's cosmetic data (unlocked + equipped)."""
    return jsonify(_marble_get_cosmetics(twitch_login.lower()))

@app.route('/marbles/api/player/<twitch_login>/cosmetics/equip', methods=['PUT'])
def marbles_api_cosmetics_equip(twitch_login):
    """Equip a cosmetic item. Requires login as that player."""
    cub_user = session.get('cubsoftware_user')
    if not cub_user:
        return jsonify({'error': 'Login required'}), 401
    login = cub_user.get('login', cub_user.get('username', '')).lower()
    if login != twitch_login.lower():
        return jsonify({'error': 'Forbidden'}), 403
    body = request.get_json(silent=True) or {}
    cosm_type = body.get('type', '')
    key       = body.get('key', '')
    if cosm_type not in ('skin', 'trail', 'accessory') or not key:
        return jsonify({'error': 'type and key required'}), 400
    ok = _marble_equip_cosmetic(login, cosm_type, key)
    if not ok:
        return jsonify({'error': 'Item not unlocked or invalid key'}), 400
    return jsonify({'ok': True})

@app.route('/marbles/api/cosmetics', methods=['GET'])
def marbles_api_cosmetics_catalogue():
    """Return the full cosmetics catalogue."""
    return jsonify(_marble_cosmetics_catalogue())

@app.route('/marbles/api/game/<session_id>/cosmetics', methods=['GET'])
def marbles_game_cosmetics(session_id):
    """Return equipped cosmetics for all players in a session. {login: {skin, trail, accessory}}"""
    mgr = _MarbleIRC.get_instance()
    s   = mgr.get_session(session_id)
    if not s:
        return jsonify({})
    result = {}
    for p in s.players:
        login = p['name'].lower()
        c    = _marble_get_cosmetics(login)
        sets = _marble_get_settings(login)
        result[login] = {
            'skin':      c['equipped_skin'],
            'trail':     c['equipped_trail'],
            'accessory': c['equipped_accessory'],
            'size':      sets.get('marble_size', 1.0),
        }
    return jsonify(result)

@app.route('/marbles/shop')
@app.route('/marbles/shop/')
def marbles_shop_page():
    """Coin shop page — requires Twitch login."""
    cub_user = session.get('cubsoftware_user')
    if not cub_user:
        return redirect(url_for('cub_login_page', next='/marbles/shop'))
    login    = cub_user.get('login', cub_user.get('username', '')).lower()
    shop     = _marble_get_shop_catalogue(login)
    return render_template('marbles/shop.html', login=login,
                           catalogue=shop['catalogue'],
                           balance=shop['balance'], v=STATIC_VERSION)

@app.route('/marbles/api/shop/buy', methods=['POST'])
def marbles_api_shop_buy():
    """Buy a cosmetic from the coin shop."""
    cub_user = session.get('cubsoftware_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    login = cub_user.get('login', cub_user.get('username', '')).lower()
    body  = request.get_json(silent=True) or {}
    cosm_type = body.get('type', '')
    key       = body.get('key', '')
    result    = _marble_buy_shop_item(login, cosm_type, key)
    if result.get('ok'):
        return jsonify(result)
    return jsonify(result), 400

@app.route('/marbles/api/shop')
def marbles_api_shop_catalogue():
    """Public shop catalogue (no auth required)."""
    cub_user  = session.get('cubsoftware_user')
    login     = cub_user.get('login', cub_user.get('username', '')).lower() if cub_user else None
    return jsonify(_marble_get_shop_catalogue(login))

@app.route('/marbles/cosmetics')
@app.route('/marbles/cosmetics/')
def marbles_cosmetics_page():
    """Marble cosmetics equip page — requires Twitch login."""
    cub_user = session.get('cubsoftware_user')
    if not cub_user:
        return redirect(url_for('cub_login_page', next='/marbles/cosmetics'))
    login    = cub_user.get('login', cub_user.get('username', '')).lower()
    cosmetics = _marble_get_cosmetics(login)
    catalogue = _marble_cosmetics_catalogue()
    return render_template('marbles/cosmetics.html',
                           login=login,
                           cosmetics=cosmetics,
                           catalogue=catalogue)

@app.route('/marbles/settings')
@app.route('/marbles/settings/')
def marbles_settings_page():
    """Player settings page — requires Twitch login."""
    cub_user = session.get('cubsoftware_user')
    if not cub_user:
        return redirect(url_for('cub_login_page', next='/marbles/settings'))
    login    = cub_user.get('login', cub_user.get('username', '')).lower()
    settings = _marble_get_settings(login)
    return render_template('marbles/settings.html', twitch_login=login,
                           display_name=cub_user.get('username', login),
                           settings=settings, v=STATIC_VERSION)

@app.route('/marbles/api/player/<twitch_login>/settings', methods=['GET', 'PUT'])
def marbles_api_player_settings(twitch_login):
    """GET: return settings. PUT: save settings (must be own account or admin)."""
    login = twitch_login.lower()
    if request.method == 'GET':
        return jsonify(_marble_get_settings(login))
    # PUT — must be logged in as that player or admin
    cub_user = session.get('cubsoftware_user')
    my_login = cub_user.get('login', '').lower() if cub_user else ''
    is_admin = str(cub_user.get('id', '')) in MARBLES_BETA_USERS if cub_user else False
    if not cub_user or (my_login != login and not is_admin):
        return jsonify({'error': 'Unauthorized'}), 403
    body = request.get_json(silent=True) or {}
    saved = _marble_save_settings(login, body)
    return jsonify({'ok': True, 'settings': saved})

@app.route('/marbles/api/track-records', methods=['GET'])
def marbles_api_track_records():
    map_id = request.args.get('map_id')
    if map_id:
        return jsonify(_marble_map_leaderboard(map_id))
    return jsonify(_marble_track_records())

# ── Map library ────────────────────────────────────────────────────────────────

@app.route('/marbles/api/map/publish', methods=['POST'])
def marbles_map_publish():
    """Save/update a map in the library. Dev/beta users only."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Not authorized'}), 403
    import json as _json
    body     = request.get_json(silent=True) or {}
    map_obj  = body.get('map', {})
    if not isinstance(map_obj, dict) or not map_obj.get('pieces'):
        return jsonify({'error': 'map with pieces required'}), 400
    name        = str(map_obj.get('name', 'Untitled'))[:64].strip() or 'Untitled'
    description = str(body.get('description', ''))[:256]
    tags_raw    = str(body.get('tags', ''))[:128]
    # Normalise tags: lowercase, strip, dedupe, max 8 tags
    tags = ','.join(sorted({t.strip().lower() for t in tags_raw.split(',') if t.strip()}))[:128]
    author      = str(cub_user.get('username', cub_user.get('id', 'dev')))[:32]
    piece_count = len(map_obj.get('pieces', []))
    map_id      = body.get('map_id') or _secrets_mod.token_hex(8)
    thumbnail   = body.get('thumbnail')  # base64 data URL from canvas capture
    if thumbnail and not str(thumbnail).startswith('data:image/'):
        thumbnail = None  # reject anything that isn't a data URL
    _marble_save_map(map_id, name, description, author, _json.dumps(map_obj), piece_count, thumbnail, tags)
    return jsonify({'ok': True, 'map_id': map_id})

@app.route('/marbles/api/maps', methods=['GET'])
def marbles_api_maps():
    """List all published maps."""
    return jsonify(_marble_get_maps(limit=100))

@app.route('/marbles/api/map/<map_id>', methods=['GET'])
def marbles_api_map(map_id):
    """Get a single map including its map_data JSON."""
    m = _marble_get_map(map_id)
    if not m:
        return jsonify({'error': 'Map not found'}), 404
    return jsonify(m)

@app.route('/marbles/api/map/<map_id>/rate', methods=['POST'])
def marbles_api_map_rate(map_id):
    """Vote on a map. Requires login. vote: 1 (up) or -1 (down). Toggling the same vote removes it."""
    cub_user = session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Login required'}), 401
    body = request.get_json(silent=True) or {}
    vote = body.get('vote')
    if vote not in (1, -1):
        return jsonify({'error': 'vote must be 1 or -1'}), 400
    if not _marble_get_map(map_id):
        return jsonify({'error': 'Map not found'}), 404
    user_login = str(cub_user.get('username', cub_user.get('id', '')))[:32]
    result = _marble_rate_map(map_id, user_login, vote)
    return jsonify(result)

@app.route('/marbles/api/map/<map_id>/versions', methods=['GET'])
def marbles_api_map_versions(map_id):
    """List archived versions for a map (metadata only, no map_data)."""
    if not _marble_get_map(map_id):
        return jsonify({'error': 'Map not found'}), 404
    return jsonify({'versions': _marble_map_versions(map_id)})

@app.route('/marbles/api/map/<map_id>/versions/<int:version_num>', methods=['GET'])
def marbles_api_map_version(map_id, version_num):
    """Return the full map_data for a specific archived version."""
    v = _marble_map_version_data(map_id, version_num)
    if not v:
        return jsonify({'error': 'Version not found'}), 404
    return jsonify(v)

@app.route('/marbles/api/map/<map_id>/feature', methods=['POST'])
def marbles_api_map_feature(map_id):
    """Set or unset a map as featured (admin only). Body: {featured: true|false}"""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    if not _marble_get_map(map_id):
        return jsonify({'error': 'Map not found'}), 404
    body = request.get_json(silent=True) or {}
    featured = bool(body.get('featured', True))
    _marble_set_featured(map_id, featured)
    return jsonify({'ok': True, 'featured': featured})

@app.route('/marbles/api/maps/featured', methods=['GET'])
def marbles_api_featured_maps():
    """Return featured maps for the homepage section."""
    return jsonify(_marble_get_featured(limit=8))

@app.route('/marbles/api/admin/sessions', methods=['GET'])
def marbles_admin_sessions():
    """Admin: list all active and recent sessions."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    mgr = _MarbleIRC.get_instance()
    return jsonify({
        'sessions': mgr.all_sessions(),
        'irc': mgr.connection_status(),
    })

@app.route('/marbles/api/admin/sessions/<session_id>/end', methods=['POST'])
def marbles_admin_end_session(session_id):
    """Admin: force-end a session."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    mgr = _MarbleIRC.get_instance()
    if not mgr.get_session(session_id):
        return jsonify({'error': 'Session not found'}), 404
    mgr.end_session(session_id)
    return jsonify({'ok': True})

@app.route('/marbles/api/admin/maps', methods=['GET'])
def marbles_admin_maps():
    """Admin: list all maps with management metadata."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    return jsonify(_marble_get_maps_admin(limit=500))

@app.route('/marbles/api/admin/maps/<map_id>', methods=['DELETE'])
def marbles_admin_delete_map(map_id):
    """Admin: delete a map."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    _marble_delete_map(map_id)
    return jsonify({'ok': True})

@app.route('/marbles/api/admin/races', methods=['GET'])
def marbles_admin_races():
    """Admin: race history."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    return jsonify(_marble_race_history(limit=100))

@app.route('/marbles/api/seasons', methods=['GET'])
def marbles_api_seasons():
    """Public: list all seasons."""
    return jsonify(_marble_get_seasons())

@app.route('/marbles/api/seasons/current', methods=['GET'])
def marbles_api_season_current():
    s = _marble_current_season()
    return jsonify(s or {})

@app.route('/marbles/api/seasons/<season_id>/leaderboard', methods=['GET'])
def marbles_api_season_lb(season_id):
    limit = min(int(request.args.get('limit', 100)), 200)
    return jsonify(_marble_season_lb(season_id, limit=limit))

@app.route('/marbles/api/admin/seasons/start', methods=['POST'])
def marbles_admin_start_season():
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    body = request.get_json(silent=True) or {}
    name = str(body.get('name', 'Season'))[:64].strip() or 'Season'
    sid  = _marble_start_season(name)
    return jsonify({'ok': True, 'season_id': sid, 'name': name})

@app.route('/marbles/api/admin/seasons/end', methods=['POST'])
def marbles_admin_end_season():
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    result = _marble_end_season()
    if not result:
        return jsonify({'error': 'No active season'}), 404
    return jsonify({'ok': True, **result})

@app.route('/marbles/api/admin/players/banned', methods=['GET'])
def marbles_admin_banned():
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    return jsonify(_marble_banned_list())

@app.route('/marbles/api/admin/players/<twitch_login>/ban', methods=['POST'])
def marbles_admin_ban(twitch_login):
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    ok = _marble_ban_player(twitch_login.lower())
    return jsonify({'ok': ok})

@app.route('/marbles/api/admin/players/<twitch_login>/unban', methods=['POST'])
def marbles_admin_unban(twitch_login):
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    ok = _marble_unban_player(twitch_login.lower())
    return jsonify({'ok': ok})

@app.route('/marbles/api/admin/players/<twitch_login>/reset-points', methods=['POST'])
def marbles_admin_reset_points(twitch_login):
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    ok = _marble_reset_points(twitch_login.lower())
    return jsonify({'ok': ok})

@app.route('/marbles/api/admin/records/reset', methods=['POST'])
def marbles_admin_reset_records():
    """Reset track records — all or a specific map."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Admin access required'}), 403
    body   = request.get_json(silent=True) or {}
    map_id = body.get('map_id')
    if map_id:
        ok = _marble_reset_map_record(str(map_id))
        return jsonify({'ok': ok, 'scope': 'map', 'map_id': map_id})
    deleted = _marble_reset_all_records()
    return jsonify({'ok': True, 'scope': 'all', 'deleted': deleted})

@app.route('/marbles/api/game/test-race', methods=['POST'])
def marbles_test_race():
    """Create a test race with bot players, dev only."""
    cub_user = session.get('cub_user')
    if not cub_user or str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return jsonify({'error': 'Not authorized'}), 403
    mgr = _MarbleIRC.get_instance()
    s   = mgr.create_session('test', '!join', 10)
    for name in ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon']:
        s.add_player(name)
    mgr.start_race(s.id)
    return jsonify({'ok': True, 'session': s.to_dict()})

# ── Marbles homepage ───────────────────────────────────────────────────────────

@app.route('/marbles')
@app.route('/marbles/')
def marbles_home():
    cub = session.get('cub_user')
    if not cub:
        return redirect(url_for('cub_login_page', next='/marbles'))
    if not is_app_whitelisted('marbles', cub.get('id', '')):
        return render_template('feature-disabled.html', feature='marbles'), 403
    maps = _marble_get_maps(limit=50)
    return render_template('marbles/index.html', maps=maps, v=STATIC_VERSION)

@app.route('/apps/marble-play')
@app.route('/apps/marble-play/')
def marble_play():
    cub_user = session.get('cub_user')
    if not cub_user:
        return redirect(url_for('cub_login_page', next='/apps/marble-play'))
    if str(cub_user.get('id', '')) not in MARBLES_BETA_USERS:
        return render_template('feature-disabled.html', feature='marble-play'), 403
    login = (session.get('cubsoftware_user') or {}).get('login', '')
    return render_template('marbles/play.html', player_login=login)

@app.route('/marbles/leaderboard/<map_id>')
def marble_map_leaderboard(map_id):
    """Per-map leaderboard page showing all players' best times."""
    return render_template('marbles/map-leaderboard.html', v=STATIC_VERSION)

@app.route('/marbles/maps')
def marble_maps_browser():
    """Public map library browser."""
    return render_template('marbles/maps.html', v=STATIC_VERSION)

@app.route('/marbles/obs/<session_id>')
def marble_obs(session_id):
    """OBS browser source — no login required, auto-starts when session goes live."""
    return render_template('marbles/play.html', obs_session=session_id)

@app.route('/marbles/watch/<session_id>')
def marble_watch(session_id):
    """Live spectator page — no login required, view an ongoing race in read-only mode."""
    return render_template('marbles/play.html', watch_session=session_id)

@app.route('/marbles/obs-control/<session_id>')
def marble_obs_control(session_id):
    """OBS Dock control panel — Start/Reset/End + live player list, no 3D scene."""
    return render_template('marbles/obs-control.html')

@app.route('/marbles/lowerthird/<session_id>')
def marble_lowerthird(session_id):
    """OBS lower-third overlay — 1920×180 transparent strip with live leaderboard top 5."""
    return render_template('marbles/lowerthird.html')

@app.route('/marbles/winner/<session_id>')
def marble_winner(session_id):
    """OBS winner card overlay — 400×200 animated winner announcement."""
    return render_template('marbles/winner.html')

@app.route('/marbles/chatfollower/<session_id>')
def marble_chatfollower(session_id):
    """OBS chat follower — scrolling panel of players who recently joined via !join."""
    return render_template('marbles/chatfollower.html')

# ==================== STREAMAVATARS ====================

@app.route('/streamavatars/static/<path:filename>')
def sa_static(filename):
    return send_from_directory('website/streamavatars', filename)

@app.route('/streamavatars')
@app.route('/streamavatars/')
def streamavatars_home():
    cub_user = session.get('cubsoftware_user') or session.get('cub_user')
    if not cub_user:
        return redirect(url_for('cub_login_page', next='/streamavatars'))
    if not is_app_whitelisted('streamavatars', cub_user.get('id', '')):
        return render_template('feature-disabled.html', feature='streamavatars'), 403
    login      = (cub_user.get('login') or cub_user.get('username', '')).lower()
    characters = _sa_get_characters(login)
    settings   = _sa_overlay_settings(login)
    return render_template('streamavatars/index.html',
                           cub_user=cub_user, login=login,
                           characters=characters, settings=settings,
                           origin=request.host_url.rstrip('/'))

@app.route('/streamavatars/editor')
def streamavatars_editor():
    cub_user = session.get('cubsoftware_user') or session.get('cub_user')
    if not cub_user:
        return redirect(url_for('cub_login_page', next='/streamavatars/editor'))
    if not is_app_whitelisted('streamavatars', cub_user.get('id', '')):
        return render_template('feature-disabled.html', feature='streamavatars'), 403
    return render_template('streamavatars/editor.html', cub_user=cub_user)

@app.route('/streamavatars/overlay/<channel>')
def streamavatars_overlay(channel):
    return render_template('streamavatars/overlay.html',
                           channel=channel.lower().lstrip('#'))

# ── StreamAvatars API ─────────────────────────────────────────────────────────

@app.route('/streamavatars/api/character/save', methods=['POST'])
def sa_api_save_character():
    cub_user = session.get('cubsoftware_user') or session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    login   = (cub_user.get('login') or cub_user.get('username', '')).lower()
    body    = request.get_json(silent=True) or {}
    name    = (body.get('name') or 'My Character')[:64]
    sprites = body.get('sprites') or {}
    thumb   = body.get('thumbnail')
    char_id = body.get('char_id')
    if char_id:
        try: char_id = int(char_id)
        except Exception: char_id = None
    new_id  = _sa_save_character(login, char_id, name, sprites, thumb)
    return jsonify({'ok': True, 'char_id': new_id})

@app.route('/streamavatars/api/character/<int:char_id>', methods=['GET'])
def sa_api_get_character(char_id):
    cub_user = session.get('cubsoftware_user') or session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    login = (cub_user.get('login') or cub_user.get('username', '')).lower()
    char  = _sa_get_character(char_id, user_login=login)
    if not char:
        return jsonify({'ok': False, 'error': 'Not found'}), 404
    return jsonify({'ok': True, **char})

@app.route('/streamavatars/api/characters/<int:char_id>/activate', methods=['POST'])
def sa_api_activate(char_id):
    cub_user = session.get('cubsoftware_user') or session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    login = (cub_user.get('login') or cub_user.get('username', '')).lower()
    _sa_activate(login, char_id)
    return jsonify({'ok': True})

@app.route('/streamavatars/api/characters/<int:char_id>', methods=['DELETE'])
def sa_api_delete_character(char_id):
    cub_user = session.get('cubsoftware_user') or session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    login = (cub_user.get('login') or cub_user.get('username', '')).lower()
    _sa_delete(login, char_id)
    return jsonify({'ok': True})

@app.route('/streamavatars/api/overlay-settings', methods=['POST'])
def sa_api_save_settings():
    cub_user = session.get('cubsoftware_user') or session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    login = (cub_user.get('login') or cub_user.get('username', '')).lower()
    body  = request.get_json(silent=True) or {}
    _sa_save_overlay_settings(login, body)
    return jsonify({'ok': True})

@app.route('/streamavatars/api/user/<login>/sprites', methods=['GET'])
def sa_api_user_sprites(login):
    """Public — returns active character sprites for a viewer login."""
    char_id = _sa_active_id(login.lower())
    if not char_id:
        return jsonify({'sprites': None})
    char = _sa_get_character(char_id)
    return jsonify({'sprites': char['sprites'] if char else None})

@app.route('/streamavatars/api/overlay/<channel>/events', methods=['GET'])
def sa_api_overlay_events(channel):
    """Overlay polls this for new chat events and active chatter list."""
    channel = channel.lower().lstrip('#')
    after   = int(request.args.get('after', 0))
    sess    = _sa_irc.get_or_create(channel)
    events  = sess.get_events(after_seq=after)
    active  = sess.get_active_chatters()
    ov_set  = _sa_overlay_settings(channel)
    return jsonify({
        'events':          events,
        'active_chatters': {k: True for k in active},
        'settings':        {
            'show_bubbles': bool(ov_set.get('show_bubbles', 1)),
            'sprite_scale': float(ov_set.get('sprite_scale', 3.0)),
            'walk_speed':   float(ov_set.get('walk_speed', 1.0)),
        },
    })

# ==================== USER TITLES ====================
#
# Keys in _title_db are "provider:id"  e.g. "discord:378501056008683530"
#                                           "twitch:141981764"
# Each entry also stores twitch_login (lowercase) so marble IRC can resolve names.
# Hardcoded roles use the same "provider:id" format and are never overridden by
# the file-backed store.

import threading as _threading

_TITLE_DATA_PATH = os.path.normpath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'data', 'user_titles.json')
)

_ROLE_DISPLAY = {
    'dev':      '[DEV]',
    'staff':    '[STAFF]',
    'streamer': '[STREAMER]',
    'default':  '[DEFAULT]',
}

# Permanent roles that cannot be overridden by the admin API
# Keys: "provider:id"   Values: role string
_HARDCODED_ROLES = {
    'discord:378501056008683530': 'dev',   # HexEchoTV — developer (Discord)
    'twitch_login:hexechotv':     'dev',   # HexEchoTV — developer (Twitch IRC lookup)
}

_title_db: dict = {}          # "provider:id" → {role, twitch_login?}
_title_db_lock = _threading.Lock()


def _titles_load():
    global _title_db
    try:
        if os.path.exists(_TITLE_DATA_PATH):
            with open(_TITLE_DATA_PATH, 'r', encoding='utf-8') as f:
                _title_db = json.load(f)
    except Exception:
        _title_db = {}


def _titles_save():
    try:
        os.makedirs(os.path.dirname(_TITLE_DATA_PATH), exist_ok=True)
        with open(_TITLE_DATA_PATH, 'w', encoding='utf-8') as f:
            json.dump(_title_db, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f'Could not save user_titles.json: {e}')


def _title_key(provider: str, user_id: str) -> str:
    return f'{provider}:{user_id}'


def _title_entry(key: str) -> dict:
    if key not in _title_db:
        _title_db[key] = {'role': _HARDCODED_ROLES.get(key, 'default')}
    return _title_db[key]


def get_user_title_prefix(provider: str, user_id: str) -> str:
    """Return display prefix e.g. '[DEV]'. Hardcoded roles always win."""
    key = _title_key(provider, user_id)
    if key in _HARDCODED_ROLES:
        return _ROLE_DISPLAY.get(_HARDCODED_ROLES[key], '[DEFAULT]')
    entry = _title_entry(key)
    return _ROLE_DISPLAY.get(entry.get('role', 'default'), '[DEFAULT]')


def get_user_title_prefix_from_cub(cub_user: dict) -> str:
    """Convenience wrapper — checks hardcoded by provider:id, then by twitch_login."""
    provider = cub_user.get('provider', '')
    uid      = str(cub_user.get('id', ''))
    key      = _title_key(provider, uid)
    if key in _HARDCODED_ROLES:
        return _ROLE_DISPLAY.get(_HARDCODED_ROLES[key], '[DEFAULT]')
    # Twitch logins: also check by login name (handles cases where Twitch user ID is unknown)
    if provider == 'twitch':
        login_key = f'twitch_login:{cub_user.get("login", "").lower()}'
        if login_key in _HARDCODED_ROLES:
            return _ROLE_DISPLAY.get(_HARDCODED_ROLES[login_key], '[DEFAULT]')
    entry = _title_entry(key)
    return _ROLE_DISPLAY.get(entry.get('role', 'default'), '[DEFAULT]')


def get_title_by_twitch_login(login: str) -> str:
    """Return prefix for a Twitch username — used by the marble IRC display."""
    login = login.lower()
    # Check hardcoded first
    hk = f'twitch_login:{login}'
    if hk in _HARDCODED_ROLES:
        return _ROLE_DISPLAY.get(_HARDCODED_ROLES[hk], '[DEFAULT]')
    # Scan file-backed store for a matching twitch_login field
    for entry in _title_db.values():
        if entry.get('twitch_login') == login:
            return _ROLE_DISPLAY.get(entry.get('role', 'default'), '[DEFAULT]')
    return _ROLE_DISPLAY['default']


def _caller_role(cub_user: dict) -> str:
    provider = cub_user.get('provider', '')
    key = _title_key(provider, str(cub_user.get('id', '')))
    if key in _HARDCODED_ROLES:
        return _HARDCODED_ROLES[key]
    if provider == 'twitch':
        login_key = f'twitch_login:{cub_user.get("login", "").lower()}'
        if login_key in _HARDCODED_ROLES:
            return _HARDCODED_ROLES[login_key]
    return _title_entry(key).get('role', 'default')


_titles_load()


@app.route('/api/user/title', methods=['GET'])
def api_get_my_title():
    cub_user = session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    prefix = get_user_title_prefix_from_cub(cub_user)
    return jsonify({
        'provider':       cub_user.get('provider'),
        'user_id':        str(cub_user.get('id', '')),
        'role':           _caller_role(cub_user),
        'display_prefix': prefix,
        'display_name':   f'{prefix} {cub_user.get("username", "?")}',
    })


@app.route('/api/user/<provider>/<user_id>/title', methods=['GET'])
def api_get_user_title(provider, user_id):
    prefix = get_user_title_prefix(provider, user_id)
    return jsonify({
        'display_prefix': prefix,
        'role':           _title_entry(_title_key(provider, user_id)).get('role', 'default'),
    })


@app.route('/api/admin/user/role', methods=['POST'])
def api_admin_set_role():
    """Dev/Staff only — assign a role to any user by provider+id."""
    cub_user = session.get('cub_user')
    if not cub_user:
        return jsonify({'error': 'Not logged in'}), 401
    caller = _caller_role(cub_user)
    if caller not in ('dev', 'staff'):
        return jsonify({'error': 'Insufficient permissions'}), 403
    body     = request.get_json(silent=True) or {}
    provider = body.get('provider', '').strip()
    uid      = str(body.get('user_id', '')).strip()
    role     = body.get('role', '').strip()
    login    = body.get('twitch_login', '').strip().lower() or None
    if not provider or not uid or role not in _ROLE_DISPLAY:
        return jsonify({'error': 'provider, user_id, and valid role required'}), 400
    if role == 'dev' and caller != 'dev':
        return jsonify({'error': 'Only DEV can assign the DEV role'}), 403
    key = _title_key(provider, uid)
    if key in _HARDCODED_ROLES and caller != 'dev':
        return jsonify({'error': 'Cannot change a hardcoded role'}), 403
    with _title_db_lock:
        entry = _title_entry(key)
        entry['role'] = role
        if login:
            entry['twitch_login'] = login
        _titles_save()
    return jsonify({'ok': True, 'key': key, 'role': role,
                    'display_prefix': get_user_title_prefix(provider, uid)})


# ==================== ROADMAP ====================

@app.route('/roadmap')
@app.route('/roadmap/')
def roadmap():
    """Roadmap - What we're building next"""
    return render_template('roadmap.html')

# ==================== DISCORD PERMISSION CALCULATOR ====================

@app.route('/apps/permission-calculator')
@app.route('/apps/permission-calculator/')
def permission_calculator():
    """Discord Permission Calculator - Calculate and decode Discord permission integers"""
    return render_template('permission-calculator.html')

# ==================== DISCORD EMBED BUILDER ====================

@app.route('/apps/embed-builder')
@app.route('/apps/embed-builder/')
def embed_builder():
    """Discord Embed Builder - Build Discord embeds visually with live preview"""
    return render_template('embed-builder.html')

# ==================== DISCORD WEBHOOK SENDER ====================

@app.route('/apps/webhook-sender')
@app.route('/apps/webhook-sender/')
def webhook_sender():
    """Discord Webhook Sender - Send messages and embeds to Discord via webhooks"""
    return render_template('webhook-sender.html')

# ==================== DISCORD TIMESTAMP GENERATOR ====================

@app.route('/apps/timestamp-generator')
@app.route('/apps/timestamp-generator/')
def timestamp_generator():
    """Discord Timestamp Generator - Generate all Discord timestamp format codes"""
    return render_template('timestamp-generator.html')

# ==================== NOTE PAD ====================

@app.route('/apps/notepad')
@app.route('/apps/notepad/')
@check_feature_enabled('notepad')
def notepad():
    """Note Pad - Simple, distraction-free note taking"""
    return render_template('notepad.html')

# ==================== INVOICE GENERATOR ====================

@app.route('/apps/invoice-generator')
@app.route('/apps/invoice-generator/')
@check_feature_enabled('invoice-generator')
def invoice_generator():
    """Invoice Generator - Create professional invoices and export to PDF"""
    return render_template('invoice-generator.html')

# ==================== AUDIO TRIMMER ====================

@app.route('/apps/audio-trimmer')
@app.route('/apps/audio-trimmer/')
@check_feature_enabled('audio-trimmer')
def audio_trimmer():
    """Audio Trimmer - Trim, cut, and edit audio files"""
    return render_template('audio-trimmer.html')

@app.route('/api/multi-twitch/chat-token')
def multi_twitch_chat_token():
    """Return Twitch chat token for the logged-in user, if available."""
    cub = session.get('cub_user')
    if not cub:
        return jsonify({'authenticated': False, 'reason': 'login'})
    if cub.get('provider') == 'twitch':
        token = cub.get('access_token')
        if token:
            return jsonify({
                'authenticated': True,
                'login': cub.get('login', cub.get('username', '')),
                'display_name': cub.get('username', ''),
                'avatar': cub.get('avatar', ''),
                'token': token,
            })
    linked = cub.get('linked_account', {})
    if linked and linked.get('provider') == 'twitch':
        token = linked.get('access_token')
        if token:
            return jsonify({
                'authenticated': True,
                'login': linked.get('login', linked.get('username', '')),
                'display_name': linked.get('username', ''),
                'avatar': linked.get('avatar', ''),
                'token': token,
            })
        return jsonify({'authenticated': False, 'reason': 'reauth_twitch',
                        'login': linked.get('login', '')})
    return jsonify({'authenticated': False, 'reason': 'link_twitch'})

@app.route('/apps/multi-twitch')
@app.route('/apps/multi-twitch/')
@check_feature_enabled('multi-twitch')
def multi_twitch():
    """Multi-Twitch - Watch multiple Twitch streams at once"""
    return render_template('multi-twitch.html')

# ==================== STICKY BOARD ====================

# Storage for shared sticky boards
STICKY_BOARDS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'sticky_boards.json')

def load_sticky_boards():
    """Load shared sticky boards"""
    if os.path.exists(STICKY_BOARDS_FILE):
        try:
            with open(STICKY_BOARDS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_sticky_boards(boards):
    """Save shared sticky boards"""
    os.makedirs(os.path.dirname(STICKY_BOARDS_FILE), exist_ok=True)
    with open(STICKY_BOARDS_FILE, 'w') as f:
        json.dump(boards, f)

def generate_board_id():
    """Generate a unique board ID"""
    import random
    return ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=8))

@app.route('/apps/sticky-board')
@app.route('/apps/sticky-board/')
@check_feature_enabled('sticky-board')
def sticky_board():
    """Sticky Board - Virtual whiteboard with draggable sticky notes"""
    return render_template('sticky-board.html')

@app.route('/apps/sticky-board/b/<board_id>')
def view_sticky_board(board_id):
    """View a shared sticky board"""
    boards = load_sticky_boards()
    if board_id not in boards:
        return render_template('404.html'), 404
    return render_template('sticky-board.html', board_id=board_id, view_only=True)

@app.route('/api/sticky-board/save', methods=['POST'])
def save_sticky_board():
    """Save a sticky board and get a short link"""
    data = request.get_json()
    if not data or 'notes' not in data:
        return jsonify({'error': 'Board data required'}), 400

    boards = load_sticky_boards()

    # Generate unique ID
    board_id = generate_board_id()
    while board_id in boards:
        board_id = generate_board_id()

    # Save the board
    boards[board_id] = {
        'notes': data['notes'],
        'created': time.time(),
        'views': 0
    }
    save_sticky_boards(boards)

    # Return the share URL
    share_url = f"{request.host_url}apps/sticky-board/b/{board_id}"
    return jsonify({
        'shareUrl': share_url,
        'boardId': board_id
    })

@app.route('/api/sticky-board/<board_id>')
def get_sticky_board(board_id):
    """Get sticky board data"""
    boards = load_sticky_boards()
    if board_id not in boards:
        return jsonify({'error': 'Board not found'}), 404

    # Increment view count
    boards[board_id]['views'] = boards[board_id].get('views', 0) + 1
    save_sticky_boards(boards)

    return jsonify(boards[board_id])

# ==================== CUBREACTIVE - DISCORD REACTIVE IMAGES ====================

# CubReactive Data Storage
CUBREACTIVE_USERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'cubreactive_users.json')
CUBREACTIVE_UPLOADS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'website', 'uploads', 'cubreactive')

# Discord OAuth for CubReactive (uses same credentials as CleanMe)
CUBREACTIVE_REDIRECT_URI = os.environ.get('CUBREACTIVE_REDIRECT_URI', 'https://cubsoftware.site/apps/cubreactive/auth/callback')
CUBREACTIVE_RPC_REDIRECT_URI = os.environ.get('CUBREACTIVE_RPC_REDIRECT_URI', 'https://cubsoftware.site/apps/cubreactive/auth/rpc/callback')
CUBREACTIVE_WS_URL = os.environ.get('CUBREACTIVE_WS_URL', 'wss://cubsoftware.site/cubreactive-ws')

# Whitelist of allowed settings keys for CubReactive config (prevents mass assignment)
CUBREACTIVE_ALLOWED_SETTINGS = {
    # Basic
    'bounce_on_speak', 'dim_when_idle', 'show_name', 'grayscale_muted', 'grayscale_deafened',
    'animation_style', 'animation_speed', 'idle_animation_style', 'avatar_shape',
    'overlay_position', 'spacing', 'idle_opacity', 'flip_horizontal',
    'hide_self', 'max_participants', 'member_filter_mode', 'member_filter_list',
    'overlay_background', 'show_status_icons', 'theme',
    # Border / glow / shadow
    'border_enabled', 'border_color', 'border_width', 'border_style',
    'glow_enabled', 'glow_color',
    'shadow_enabled', 'shadow_color', 'shadow_blur',
    'speaking_ring_enabled', 'speaking_ring_color', 'speaking_ring_width',
    # Transitions
    'transition_style', 'transition_duration', 'entry_animation', 'entry_duration',
    # Image filters
    'filter_brightness', 'filter_contrast', 'filter_saturate', 'filter_hue',
    # Name styling
    'name_color', 'name_size', 'name_background_enabled', 'name_background_color',
    'name_shadow_enabled', 'name_shadow_color', 'name_glow_enabled', 'name_glow_color',
    'name_font', 'name_position', 'name_animation',
    # Particles
    'particles_enabled', 'particle_type', 'particle_color', 'particle_count',
    # Animated border
    'animated_border_enabled', 'animated_border_type', 'animated_border_speed',
    # Background effect
    'bg_effect_enabled', 'bg_effect_type', 'bg_effect_color', 'bg_effect_size',
    # Outline
    'outline_enabled', 'outline_color', 'outline_width', 'outline_offset',
    # Frame / accessory
    'frame', 'frame_color', 'accessory',
    # Mirror / tilt
    'mirror_enabled', 'mirror_opacity', 'mirror_offset',
    'tilt_enabled', 'tilt_amount',
    # Voice indicator
    'voice_indicator_enabled', 'voice_indicator_type', 'voice_indicator_color',
    # Status text
    'status_text_enabled', 'status_text', 'status_text_color',
    # Group / layout
    'group_layout', 'speaking_highlight', 'sort_order',
    # Custom CSS
    'custom_css',
}

def load_cubreactive_users():
    """Load CubReactive user configurations"""
    if os.path.exists(CUBREACTIVE_USERS_FILE):
        try:
            with open(CUBREACTIVE_USERS_FILE, 'r') as f:
                data = json.load(f)
                return data
        except json.JSONDecodeError as e:
            print(f"[CubReactive] ERROR: JSON parse error in {CUBREACTIVE_USERS_FILE}: {e}")
            # Try to backup the corrupted file
            try:
                import shutil
                backup_path = CUBREACTIVE_USERS_FILE + '.corrupted.' + str(int(time.time()))
                shutil.copy(CUBREACTIVE_USERS_FILE, backup_path)
                print(f"[CubReactive] Backed up corrupted file to {backup_path}")
            except:
                pass
        except Exception as e:
            print(f"[CubReactive] ERROR: Failed to load {CUBREACTIVE_USERS_FILE}: {e}")
    return {}

def save_cubreactive_users(data):
    """Save CubReactive user configurations"""
    os.makedirs(os.path.dirname(CUBREACTIVE_USERS_FILE), exist_ok=True)
    try:
        # Write to temp file first, then rename (atomic operation)
        temp_file = CUBREACTIVE_USERS_FILE + '.tmp'
        with open(temp_file, 'w') as f:
            json.dump(data, f, indent=2)
        # Atomic rename
        import shutil
        shutil.move(temp_file, CUBREACTIVE_USERS_FILE)
    except Exception as e:
        print(f"[CubReactive] ERROR: Failed to save {CUBREACTIVE_USERS_FILE}: {e}")
        # Try direct write as fallback
        try:
            with open(CUBREACTIVE_USERS_FILE, 'w') as f:
                json.dump(data, f, indent=2)
        except Exception as e2:
            print(f"[CubReactive] ERROR: Fallback save also failed: {e2}")

def notify_cubreactive_overlay(user_id):
    """Notify the bot to send CONFIG_UPDATED to overlay WebSocket clients"""
    try:
        bot_port = os.environ.get('LOG_SERVER_PORT', 3847)
        requests.post(
            f'http://127.0.0.1:{bot_port}/cubreactive/refresh',
            json={'userId': user_id, 'apiKey': os.environ.get('BOT_API_KEY', '')},
            timeout=2
        )
    except Exception:
        pass  # Non-critical - overlay will still work, just won't auto-refresh

def cubreactive_auth_required(f):
    """Decorator to require CubReactive authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if IS_DEV:
            if 'cubreactive_user' not in session:
                session['cubreactive_user'] = DEV_USER
            return f(*args, **kwargs)
        if 'cubreactive_user' not in session:
            if request.is_json or request.path.startswith('/api/cubreactive/'):
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(f'/login?next={urllib.parse.quote(request.path)}')
        ip = get_client_ip()
        allowed, retry_after = check_rate_limit(ip, 'dashboard')
        if not allowed:
            return jsonify({'error': 'Rate limit exceeded', 'retry_after': int(retry_after)}), 429
        return f(*args, **kwargs)
    return decorated_function

# CubReactive Page Routes
@app.route('/cub-reactive')
@app.route('/cub-reactive/')
def cubreactive_alias():
    return redirect('/apps/cubreactive')

@app.route('/apps/cubreactive')
@app.route('/apps/cubreactive/')
@check_feature_enabled('cubreactive')
def cubreactive_home():
    """CubReactive - Discord Reactive Images for Streamers"""
    cubreactive_user = session.get('cubreactive_user')
    user_config = None

    if cubreactive_user:
        users = load_cubreactive_users()
        user_config = users.get(cubreactive_user['id'])

    return render_template('cubreactive.html',
        cubreactive_user=cubreactive_user,
        user_config=user_config,
        discord_client_id=load_pm2_config().get('discord_client_id', os.environ.get('DISCORD_CLIENT_ID', '')),
        ws_url=CUBREACTIVE_WS_URL
    )

@app.route('/apps/cubreactive/overlay/group/<user_id>')
def cubreactive_overlay_group(user_id):
    """CubReactive - Group overlay browser source (shows all voice channel participants, uses this user's settings)"""
    users = load_cubreactive_users()
    user_config = users.get(user_id, {})
    return render_template('cubreactive-overlay.html',
        mode='group',
        target_user_id=user_id,
        user_config=user_config,
        ws_url=CUBREACTIVE_WS_URL,
        cache_bust=int(time.time())
    )

@app.route('/apps/cubreactive/overlay/<user_id>')
def cubreactive_overlay_individual(user_id):
    """CubReactive - Individual overlay browser source"""
    users = load_cubreactive_users()
    user_config = users.get(user_id, {})
    return render_template('cubreactive-overlay.html',
        mode='individual',
        target_user_id=user_id,
        user_config=user_config,
        ws_url=CUBREACTIVE_WS_URL,
        cache_bust=int(time.time())
    )

# CubReactive OAuth Routes — redirect to unified login
@app.route('/apps/cubreactive/auth/discord')
def cubreactive_auth():
    """Redirect to unified login page"""
    return redirect('/login?next=/apps/cubreactive/dashboard')

@app.route('/apps/cubreactive/auth/callback')
def cubreactive_callback():
    """Legacy callback — no longer used. Unified login handles all Discord OAuth."""
    return redirect('/login?next=/apps/cubreactive/dashboard')

@app.route('/apps/cubreactive/auth/logout')
def cubreactive_logout():
    """Logout — delegates to unified logout"""
    session.pop('cubreactive_user', None)
    return redirect('/logout')

@app.route('/apps/cubreactive/auth/rpc')
@cubreactive_auth_required
def cubreactive_rpc_auth():
    """Initiate Discord OAuth for RPC access"""
    config = load_pm2_config()
    params = {
        'client_id': config.get('discord_client_id', os.environ.get('DISCORD_CLIENT_ID', '')),
        'redirect_uri': CUBREACTIVE_RPC_REDIRECT_URI,
        'response_type': 'code',
        'scope': 'rpc rpc.voice.read identify',
        'state': secrets.token_urlsafe(16)
    }
    session['cubreactive_rpc_oauth_state'] = params['state']
    discord_url = f"https://discord.com/api/oauth2/authorize?{urllib.parse.urlencode(params)}"
    return redirect(discord_url)

@app.route('/apps/cubreactive/auth/rpc/callback')
@rate_limit('oauth')
def cubreactive_rpc_callback():
    """Discord OAuth callback for RPC access"""
    error = request.args.get('error')
    if error:
        return redirect('/apps/cubreactive?error=rpc_auth_failed')

    code = request.args.get('code')
    state = request.args.get('state')

    # Verify state
    if state != session.get('cubreactive_rpc_oauth_state'):
        return redirect('/apps/cubreactive?error=invalid_state')

    # Exchange code for token
    config = load_pm2_config()
    try:
        token_response = requests.post('https://discord.com/api/oauth2/token', data={
            'client_id': config.get('discord_client_id', os.environ.get('DISCORD_CLIENT_ID', '')),
            'client_secret': config.get('discord_client_secret', os.environ.get('DISCORD_CLIENT_SECRET', '')),
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': CUBREACTIVE_RPC_REDIRECT_URI
        }, headers={'Content-Type': 'application/x-www-form-urlencoded'})

        if token_response.status_code != 200:
            print(f"RPC token exchange failed: {token_response.status_code} {token_response.text}")
            return redirect('/apps/cubreactive?error=rpc_token_failed')

        tokens = token_response.json()
        access_token = tokens.get('access_token')
        refresh_token = tokens.get('refresh_token')
        expires_in = tokens.get('expires_in', 604800)  # Default 7 days

        # Get user info to verify
        user = session.get('cubreactive_user')
        if not user:
            return redirect('/apps/cubreactive?error=not_logged_in')

        # Store RPC token with user data
        users = load_cubreactive_users()
        if user['id'] in users:
            users[user['id']]['rpc_token'] = access_token
            users[user['id']]['rpc_refresh_token'] = refresh_token
            users[user['id']]['rpc_token_expires'] = time.time() + expires_in
            save_cubreactive_users(users)

        return redirect('/apps/cubreactive?rpc_connected=true')

    except Exception as e:
        print(f"CubReactive RPC OAuth error: {e}")
        return redirect('/apps/cubreactive?error=rpc_auth_error')

@app.route('/api/cubreactive/rpc-token')
def cubreactive_get_rpc_token():
    """Get RPC token for overlay (called from overlay page)"""
    user_id = request.args.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    users = load_cubreactive_users()
    user_config = users.get(user_id)

    if not user_config:
        return jsonify({'error': 'User not found'}), 404

    rpc_token = user_config.get('rpc_token')
    if not rpc_token:
        return jsonify({'error': 'RPC not connected', 'needs_auth': True}), 401

    # Check if token is expired
    expires = user_config.get('rpc_token_expires', 0)
    if time.time() > expires:
        # Try to refresh the token
        refresh_token = user_config.get('rpc_refresh_token')
        if refresh_token:
            config = load_pm2_config()
            try:
                token_response = requests.post('https://discord.com/api/oauth2/token', data={
                    'client_id': config.get('discord_client_id', os.environ.get('DISCORD_CLIENT_ID', '')),
                    'client_secret': config.get('discord_client_secret', os.environ.get('DISCORD_CLIENT_SECRET', '')),
                    'grant_type': 'refresh_token',
                    'refresh_token': refresh_token
                }, headers={'Content-Type': 'application/x-www-form-urlencoded'})

                if token_response.status_code == 200:
                    tokens = token_response.json()
                    rpc_token = tokens.get('access_token')
                    users[user_id]['rpc_token'] = rpc_token
                    users[user_id]['rpc_refresh_token'] = tokens.get('refresh_token', refresh_token)
                    users[user_id]['rpc_token_expires'] = time.time() + tokens.get('expires_in', 604800)
                    save_cubreactive_users(users)
                else:
                    return jsonify({'error': 'Token expired', 'needs_auth': True}), 401
            except:
                return jsonify({'error': 'Token refresh failed', 'needs_auth': True}), 401
        else:
            return jsonify({'error': 'Token expired', 'needs_auth': True}), 401

    return jsonify({'access_token': rpc_token})

# CubReactive API Routes
@app.route('/api/cubreactive/user/<user_id>')
def cubreactive_get_user(user_id):
    """Get a user's CubReactive configuration (public - for overlays)"""
    users = load_cubreactive_users()
    user_config = users.get(user_id)

    if not user_config:
        print(f"[CubReactive] User {user_id} not found. Total users in file: {len(users)}")
        return jsonify({'error': 'User not found'}), 404

    raw_images = user_config.get('images', {})
    # Filter out null images so overlay only gets actual uploaded paths
    images = {k: v for k, v in raw_images.items() if v}

    # Return public config (images, settings, and enabled state)
    return jsonify({
        'username': user_config.get('username'),
        'avatar_url': user_config.get('avatar_url'),
        'enabled': user_config.get('enabled', True),
        'images': images,
        'settings': user_config.get('settings', {})
    })

@app.route('/api/cubreactive/config', methods=['GET', 'POST'])
@cubreactive_auth_required
def cubreactive_config():
    """Get or update user's CubReactive configuration"""
    user = session.get('cubreactive_user')
    users = load_cubreactive_users()

    if request.method == 'GET':
        user_config = users.get(user['id'], {})
        return jsonify(user_config)

    # POST - update config
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if user['id'] not in users:
        users[user['id']] = {
            'username': user['username'],
            'avatar_url': user['avatar'],
            'images': {},
            'settings': {},
            'created': time.time()
        }

    # Update settings if provided — only allow whitelisted keys (prevents mass assignment)
    if 'settings' in data:
        for k, v in data['settings'].items():
            if k in CUBREACTIVE_ALLOWED_SETTINGS:
                users[user['id']]['settings'][k] = v

    save_cubreactive_users(users)
    notify_cubreactive_overlay(user['id'])
    return jsonify({'success': True, 'config': users[user['id']]})

@app.route('/api/cubreactive/upload', methods=['POST'])
@cubreactive_auth_required
def cubreactive_upload_image():
    """Upload an image for a specific state - resized to 1024x1024"""
    user = session.get('cubreactive_user')

    if 'image' not in request.files:
        return jsonify({'error': 'No image provided'}), 400

    image_file = request.files['image']
    state = request.form.get('state', 'idle')

    if state not in ['speaking', 'idle', 'muted', 'deafened']:
        return jsonify({'error': 'Invalid state'}), 400

    if image_file.filename == '':
        return jsonify({'error': 'No file selected'}), 400

    # Validate file type
    allowed_extensions = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    ext = image_file.filename.rsplit('.', 1)[-1].lower() if '.' in image_file.filename else ''
    if ext not in allowed_extensions:
        return jsonify({'error': 'Invalid file type. Allowed: PNG, JPG, GIF, WebP'}), 400

    # Validate file size (10MB for GIF/WebP, 5MB for static images)
    image_file.seek(0, 2)  # Seek to end
    size = image_file.tell()
    image_file.seek(0)  # Seek back to start
    max_size = 10 * 1024 * 1024 if ext in ('gif', 'webp') else 5 * 1024 * 1024
    if size > max_size:
        limit = '10MB' if ext in ('gif', 'webp') else '5MB'
        return jsonify({'error': f'File too large. Maximum {limit}'}), 400

    # Create uploads directory
    os.makedirs(CUBREACTIVE_UPLOADS_DIR, exist_ok=True)

    try:
        # Open image with PIL
        img = Image.open(image_file)

        # Check if animated (GIF or WebP with multiple frames)
        is_animated = hasattr(img, 'n_frames') and img.n_frames > 1

        if is_animated:
            frames = []
            durations = []
            for frame_num in range(img.n_frames):
                img.seek(frame_num)
                frame = img.copy().convert('RGBA')
                frame = resize_image_cover(frame, 512, 512)
                frames.append(frame)
                durations.append(img.info.get('duration', 100))

            # Save animated images as WebP (supports RGBA animation natively)
            filename = f"{user['id']}_{state}.webp"
            filepath = os.path.join(CUBREACTIVE_UPLOADS_DIR, filename)
            frames[0].save(
                filepath,
                save_all=True,
                append_images=frames[1:],
                duration=durations,
                loop=0,
                format='WEBP',
                quality=90
            )
        else:
            # Static image - resize to 1024x1024
            img = resize_image_cover(img, 1024, 1024)

            # Convert to RGB if necessary (for JPEG)
            if ext in ['jpg', 'jpeg'] and img.mode in ('RGBA', 'P'):
                img = img.convert('RGB')

            # Save as PNG for best quality (unless original was JPEG)
            if ext in ['jpg', 'jpeg']:
                filename = f"{user['id']}_{state}.jpg"
            else:
                filename = f"{user['id']}_{state}.png"
                if img.mode != 'RGBA':
                    img = img.convert('RGBA')

            filepath = os.path.join(CUBREACTIVE_UPLOADS_DIR, filename)
            img.save(filepath, quality=95 if ext in ['jpg', 'jpeg'] else None)

    except Exception as e:
        return jsonify({'error': f'Failed to process image: {str(e)}'}), 400

    # Update user config
    users = load_cubreactive_users()
    is_new_user = user['id'] not in users
    if is_new_user:
        users[user['id']] = {
            'username': user['username'],
            'avatar_url': user['avatar'],
            'images': {},
            'settings': {},
            'created': time.time()
        }

    image_path = f"/uploads/cubreactive/{filename}"
    users[user['id']]['images'][state] = image_path
    save_cubreactive_users(users)

    # Verify the save worked
    verify_users = load_cubreactive_users()
    saved_ok = verify_users.get(user['id'], {}).get('images', {}).get(state) == image_path
    print(f"[CubReactive] Image uploaded for {user['id']} ({user['username']}): {state}={image_path}, new_user={is_new_user}, verified={saved_ok}")

    notify_cubreactive_overlay(user['id'])

    return jsonify({
        'success': True,
        'image_url': image_path,
        'state': state
    })

def resize_image_cover(img, target_width, target_height):
    """Resize image to cover target dimensions (crop to fit as square)"""
    # Get original dimensions
    orig_width, orig_height = img.size

    # Calculate aspect ratios
    target_ratio = target_width / target_height
    orig_ratio = orig_width / orig_height

    if orig_ratio > target_ratio:
        # Image is wider - crop width
        new_height = orig_height
        new_width = int(orig_height * target_ratio)
        left = (orig_width - new_width) // 2
        top = 0
    else:
        # Image is taller - crop height
        new_width = orig_width
        new_height = int(orig_width / target_ratio)
        left = 0
        top = (orig_height - new_height) // 2

    # Crop to square ratio
    img = img.crop((left, top, left + new_width, top + new_height))

    # Resize to target dimensions
    img = img.resize((target_width, target_height), Image.Resampling.LANCZOS)

    return img

@app.route('/api/cubreactive/delete-image', methods=['POST'])
@cubreactive_auth_required
def cubreactive_delete_image():
    """Delete an image for a specific state"""
    user = session.get('cubreactive_user')
    data = request.get_json()
    state = data.get('state')

    if state not in ['speaking', 'idle', 'muted', 'deafened']:
        return jsonify({'error': 'Invalid state'}), 400

    users = load_cubreactive_users()
    if user['id'] in users and state in users[user['id']].get('images', {}):
        image_path = users[user['id']]['images'][state]
        if image_path:
            # Validate path stays within the cubreactive uploads directory (prevent path traversal)
            base_dir = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'website', 'static', 'uploads', 'cubreactive'))
            full_path = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'website', image_path.lstrip('/')))
            if not full_path.startswith(base_dir):
                app.logger.warning(f'Path traversal attempt blocked for user {user["id"]}: {image_path}')
                users[user['id']]['images'][state] = None
                save_cubreactive_users(users)
                return jsonify({'success': True})
            if os.path.exists(full_path):
                os.remove(full_path)
            users[user['id']]['images'][state] = None
            save_cubreactive_users(users)
            notify_cubreactive_overlay(user['id'])

    return jsonify({'success': True})

@app.route('/api/cubreactive/toggle', methods=['POST'])
@cubreactive_auth_required
def cubreactive_toggle():
    """Enable or disable CubReactive for the user"""
    user = session.get('cubreactive_user')
    data = request.get_json()
    enabled = data.get('enabled', True)

    users = load_cubreactive_users()
    if user['id'] in users:
        users[user['id']]['enabled'] = enabled
        save_cubreactive_users(users)
        return jsonify({'success': True, 'enabled': enabled})

    return jsonify({'error': 'User not found'}), 404

@app.route('/api/cubreactive/debug-status')
@cubreactive_auth_required
def cubreactive_debug_status():
    """Proxy to bot's internal debug status endpoint — shows voice connections, subscriptions, voiceStates"""
    try:
        bot_port = os.environ.get('LOG_SERVER_PORT', 3847)
        resp = requests.get(f'http://127.0.0.1:{bot_port}/cubreactive/status', timeout=3)
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 503

@app.route('/api/cubreactive/test-speaking', methods=['POST'])
@cubreactive_auth_required
def cubreactive_test_speaking():
    """Trigger a 2-second fake speaking event on the user's overlay — tests display pipeline without needing voice"""
    user = session.get('cubreactive_user')
    try:
        bot_port = os.environ.get('LOG_SERVER_PORT', 3847)
        resp = requests.post(
            f'http://127.0.0.1:{bot_port}/cubreactive/test-speaking',
            json={'userId': user['id']},
            timeout=3
        )
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({'error': str(e)}), 503

# Serve CubReactive uploads
@app.route('/uploads/cubreactive/<filename>')
def cubreactive_serve_upload(filename):
    """Serve uploaded CubReactive images"""
    return send_from_directory(CUBREACTIVE_UPLOADS_DIR, filename)

@app.route('/api/admin/cubreactive/status', methods=['GET'])
def cubreactive_admin_status():
    """Admin: list all users, their image references, and whether each file exists on disk."""
    api_key = request.headers.get('X-API-Key')
    if not api_key or api_key != os.environ.get('ADMIN_API_KEY', ''):
        return jsonify({'error': 'Unauthorized'}), 401

    users = load_cubreactive_users()
    os.makedirs(CUBREACTIVE_UPLOADS_DIR, exist_ok=True)
    files_on_disk = set(os.listdir(CUBREACTIVE_UPLOADS_DIR))

    report = []
    referenced_files = set()

    for uid, data in users.items():
        images = data.get('images', {})
        image_status = {}
        for state in ('speaking', 'idle', 'muted', 'deafened'):
            path = images.get(state)
            if path:
                filename = path.split('/')[-1]
                referenced_files.add(filename)
                image_status[state] = {'path': path, 'exists': filename in files_on_disk}
            else:
                # Check if a file exists for this user+state even though JSON says null
                for ext in ('png', 'webp', 'jpg', 'jpeg', 'gif'):
                    candidate = f"{uid}_{state}.{ext}"
                    if candidate in files_on_disk:
                        image_status[state] = {'path': None, 'exists': True, 'orphan_file': candidate}
                        referenced_files.add(candidate)
                        break
                else:
                    image_status[state] = {'path': None, 'exists': False}

        report.append({
            'user_id': uid,
            'username': data.get('username', '?'),
            'enabled': data.get('enabled', True),
            'created': data.get('created'),
            'images': image_status,
        })

    # Files on disk not referenced by any user
    orphaned = sorted(files_on_disk - referenced_files)

    return jsonify({'users': report, 'orphaned_files': orphaned})


@app.route('/api/admin/cubreactive/reconcile', methods=['POST'])
def cubreactive_admin_reconcile():
    """Admin: for each user, if a file exists on disk but JSON says null, update the JSON to reference it."""
    api_key = request.headers.get('X-API-Key')
    if not api_key or api_key != os.environ.get('ADMIN_API_KEY', ''):
        return jsonify({'error': 'Unauthorized'}), 401

    users = load_cubreactive_users()
    os.makedirs(CUBREACTIVE_UPLOADS_DIR, exist_ok=True)
    files_on_disk = set(os.listdir(CUBREACTIVE_UPLOADS_DIR))
    fixed = []

    for uid, data in users.items():
        if 'images' not in data:
            data['images'] = {}
        for state in ('speaking', 'idle', 'muted', 'deafened'):
            if data['images'].get(state):
                continue  # already set, skip
            for ext in ('png', 'webp', 'jpg', 'jpeg', 'gif'):
                candidate = f"{uid}_{state}.{ext}"
                if candidate in files_on_disk:
                    path = f'/uploads/cubreactive/{candidate}'
                    data['images'][state] = path
                    fixed.append({'user_id': uid, 'username': data.get('username', '?'), 'state': state, 'path': path})
                    break

    if fixed:
        save_cubreactive_users(users)

    return jsonify({'fixed': fixed, 'count': len(fixed)})

# ==================== CUBPRESENCE - DISCORD CUSTOM RICH PRESENCE ====================

CUBPRESENCE_CONFIGS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'cubpresence_configs.json')

def load_cubpresence_configs():
    """Load CubPresence configurations"""
    if os.path.exists(CUBPRESENCE_CONFIGS_FILE):
        try:
            with open(CUBPRESENCE_CONFIGS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_cubpresence_configs(data):
    """Save CubPresence configurations"""
    os.makedirs(os.path.dirname(CUBPRESENCE_CONFIGS_FILE), exist_ok=True)
    with open(CUBPRESENCE_CONFIGS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def generate_config_id():
    """Generate a unique config ID"""
    return secrets.token_urlsafe(8)

# CubPresence Page Routes
@app.route('/apps/cubpresence')
@app.route('/apps/cubpresence/')
@check_feature_enabled('cubpresence')
def cubpresence_home():
    """CubPresence - Redirect to download page"""
    return redirect('/apps/cubpresence/download')

@app.route('/apps/cubpresence/connect/<config_id>')
def cubpresence_connect(config_id):
    """CubPresence - Dedicated connection page"""
    configs = load_cubpresence_configs()
    config = configs.get(config_id)
    if not config:
        return redirect('/apps/cubpresence?error=config_not_found')

    return render_template('cubpresence-connect.html',
        config_id=config_id,
        config=config
    )

@app.route('/apps/cubpresence/extension')
def cubpresence_extension():
    """CubPresence - Extension download page"""
    return render_template('cubpresence-extension.html')

@app.route('/apps/cubpresence/download')
def cubpresence_download():
    """CubPresence - App download page"""
    return render_template('cubpresence-download.html')

@app.route('/apps/cubpresence/updates/<path:filename>')
def cubpresence_updates(filename):
    """Serve CubPresence auto-update files"""
    updates_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'website', 'static', 'downloads', 'cubpresence-updates')
    return send_from_directory(updates_dir, filename)

# CubPresence API Routes
@app.route('/api/cubpresence/config', methods=['POST'])
def cubpresence_create_config():
    """Create a new CubPresence configuration"""
    data = request.get_json()
    if not data or 'client_id' not in data:
        return jsonify({'error': 'Discord Application ID is required'}), 400

    client_id = data['client_id'].strip()
    if not client_id.isdigit():
        return jsonify({'error': 'Invalid Application ID format'}), 400

    config_id = generate_config_id()
    configs = load_cubpresence_configs()

    configs[config_id] = {
        'client_id': client_id,
        'created': time.time(),
        'last_connected': None,
        'presence': {
            'details': data.get('details', ''),
            'state': data.get('state', ''),
            'timestamps_type': 'none',
            'start_timestamp': None,
            'end_timestamp': None,
            'large_image_key': '',
            'large_image_text': '',
            'small_image_key': '',
            'small_image_text': '',
            'button1_label': '',
            'button1_url': '',
            'button2_label': '',
            'button2_url': '',
            'party_id': '',
            'party_size': 0,
            'party_max': 0
        }
    }

    save_cubpresence_configs(configs)
    return jsonify({'success': True, 'config_id': config_id})

@app.route('/api/cubpresence/config/<config_id>', methods=['GET', 'POST'])
def cubpresence_config(config_id):
    """Get or update a CubPresence configuration"""
    configs = load_cubpresence_configs()

    if request.method == 'GET':
        config = configs.get(config_id)
        if not config:
            return jsonify({'error': 'Config not found'}), 404
        return jsonify(config)

    # POST - update config
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    if config_id not in configs:
        return jsonify({'error': 'Config not found'}), 404

    # Update client_id if provided
    if 'client_id' in data:
        client_id = str(data['client_id']).strip()
        if client_id.isdigit():
            configs[config_id]['client_id'] = client_id

    # Update presence fields if provided
    if 'presence' in data:
        presence = data['presence']
        allowed_fields = [
            'details', 'state', 'timestamps_type', 'start_timestamp', 'end_timestamp',
            'large_image_key', 'large_image_text', 'small_image_key', 'small_image_text',
            'button1_label', 'button1_url', 'button2_label', 'button2_url',
            'party_id', 'party_size', 'party_max'
        ]
        for field in allowed_fields:
            if field in presence:
                configs[config_id]['presence'][field] = presence[field]

    save_cubpresence_configs(configs)
    return jsonify({'success': True, 'config': configs[config_id]})

@app.route('/api/cubpresence/config/<config_id>', methods=['DELETE'])
def cubpresence_delete_config(config_id):
    """Delete a CubPresence configuration"""
    configs = load_cubpresence_configs()
    if config_id in configs:
        del configs[config_id]
        save_cubpresence_configs(configs)
    return jsonify({'success': True})

@app.route('/api/cubpresence/connected/<config_id>', methods=['POST'])
def cubpresence_mark_connected(config_id):
    """Mark a config as recently connected"""
    configs = load_cubpresence_configs()
    if config_id in configs:
        configs[config_id]['last_connected'] = time.time()
        save_cubpresence_configs(configs)
    return jsonify({'success': True})

# ==================== FEATURE DISABLE SYSTEM ====================

FEATURES_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'features_config.json')

# Map of feature names to route paths
FEATURE_ROUTES = {
    'social-media-saver': '/apps/social-media-saver',
    'file-converter': '/apps/file-converter',
    'image-editor': '/apps/image-editor',
    'pdf-tools': '/apps/pdf-tools',
    'qr-generator': '/apps/qr-generator',
    'text-tools': '/apps/text-tools',
    'color-picker': '/apps/color-picker',
    'cubvault': '/apps/cubvault',
    'unit-converter': '/apps/unit-converter',
    'timestamp-converter': '/apps/timestamp-converter',
    'countdown-maker': '/apps/countdown-maker',
    'link-shortener': '/apps/link-shortener',
    'video-compressor': '/apps/video-compressor',
    'resume-builder': '/apps/resume-builder',
    'json-formatter': '/apps/json-formatter',
    'wheel-spinner': '/apps/wheel-spinner',
    'random-picker': '/apps/random-picker',
    'calculator-suite': '/apps/calculator-suite',
    'password-generator': '/apps/password-generator',
    'timer-tools': '/apps/timer-tools',
    'world-clock': '/apps/world-clock',
    'currency-converter': '/apps/currency-converter',
    'encoding-tools': '/apps/encoding-tools',
    'diff-checker': '/apps/diff-checker',
    'regex-tester': '/apps/regex-tester',
    'code-minifier': '/apps/code-minifier',
    'markdown-editor': '/apps/markdown-editor',
    'notepad': '/apps/notepad',
    'invoice-generator': '/apps/invoice-generator',
    'audio-trimmer': '/apps/audio-trimmer',
    'multi-twitch': '/apps/multi-twitch',
    'sticky-board': '/apps/sticky-board',
    'streamerbot-commands': '/apps/streamerbot-commands',
    'cubreactive': '/apps/cubreactive',
    'cubpresence': '/apps/cubpresence',
}

def load_features_config():
    """Load features config"""
    if os.path.exists(FEATURES_CONFIG_FILE):
        try:
            with open(FEATURES_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'disabled': []}

def save_features_config(config):
    """Save features config"""
    os.makedirs(os.path.dirname(FEATURES_CONFIG_FILE), exist_ok=True)
    with open(FEATURES_CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def is_feature_disabled(feature_name):
    """Check if a feature is disabled"""
    config = load_features_config()
    return feature_name in config.get('disabled', [])

# API endpoints for feature management (bot uses these)
@app.route('/api/features/list')
def list_features():
    """List all features and their status"""
    config = load_features_config()
    disabled = config.get('disabled', [])

    features = []
    for name in FEATURE_ROUTES.keys():
        features.append({
            'name': name,
            'path': FEATURE_ROUTES[name],
            'enabled': name not in disabled
        })

    return jsonify({'features': features})

@app.route('/api/features/disable', methods=['POST'])
def disable_feature():
    """Disable a feature (requires API key)"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    feature = data.get('feature', '').lower().replace(' ', '-')

    if feature not in FEATURE_ROUTES:
        return jsonify({'error': f'Unknown feature: {feature}', 'available': list(FEATURE_ROUTES.keys())}), 400

    config = load_features_config()
    if feature not in config['disabled']:
        config['disabled'].append(feature)
        save_features_config(config)

    return jsonify({'success': True, 'message': f'{feature} has been disabled'})

@app.route('/api/features/enable', methods=['POST'])
def enable_feature():
    """Enable a feature (requires API key)"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    feature = data.get('feature', '').lower().replace(' ', '-')

    if feature not in FEATURE_ROUTES:
        return jsonify({'error': f'Unknown feature: {feature}', 'available': list(FEATURE_ROUTES.keys())}), 400

    config = load_features_config()
    if feature in config['disabled']:
        config['disabled'].remove(feature)
        save_features_config(config)

    return jsonify({'success': True, 'message': f'{feature} has been enabled'})

# ==================== CLEANME WEBSITE ====================

# CleanMe Data Storage
CLEANME_SERVERS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'cleanme_servers.json')
CLEANME_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'cleanme_config.json')

# Discord OAuth for CleanMe
CLEANME_CLIENT_ID = os.environ.get('DISCORD_CLIENT_ID', '')
CLEANME_CLIENT_SECRET = os.environ.get('DISCORD_CLIENT_SECRET', '')
CLEANME_REDIRECT_URI = os.environ.get('CLEANME_REDIRECT_URI', 'https://cubsoftware.site/cleanme/auth/callback')

def load_cleanme_servers():
    """Load CleanMe server listings"""
    if os.path.exists(CLEANME_SERVERS_FILE):
        try:
            with open(CLEANME_SERVERS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'servers': {}, 'featured': [], 'votes': {}}

def save_cleanme_servers(data):
    """Save CleanMe server listings"""
    os.makedirs(os.path.dirname(CLEANME_SERVERS_FILE), exist_ok=True)
    with open(CLEANME_SERVERS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_cleanme_config():
    """Load CleanMe configuration"""
    if os.path.exists(CLEANME_CONFIG_FILE):
        try:
            with open(CLEANME_CONFIG_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'featured_servers': [], 'bot_token': os.environ.get('CLEANME_BOT_TOKEN', '')}

def save_cleanme_config(config):
    """Save CleanMe configuration"""
    os.makedirs(os.path.dirname(CLEANME_CONFIG_FILE), exist_ok=True)
    with open(CLEANME_CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def cleanme_auth_required(f):
    """Decorator to require CleanMe authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if IS_DEV:
            if 'cleanme_user' not in session:
                session['cleanme_user'] = DEV_USER
            return f(*args, **kwargs)
        if 'cleanme_user' not in session:
            # Try to restore session from cookie (handles server restarts)
            user_cookie = request.cookies.get('cleanme_user')
            if user_cookie:
                try:
                    user_data = json.loads(urllib.parse.unquote(user_cookie))
                    if user_data.get('id'):
                        session['cleanme_user'] = user_data
                except Exception:
                    pass
        if 'cleanme_user' not in session:
            if request.is_json or request.path.startswith('/cleanme/api/'):
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(f'/login?next={urllib.parse.quote(request.path)}')
        ip = get_client_ip()
        allowed, retry_after = check_rate_limit(ip, 'dashboard')
        if not allowed:
            return jsonify({'error': 'Rate limit exceeded', 'retry_after': int(retry_after)}), 429
        return f(*args, **kwargs)
    return decorated_function

# CleanMe Page Routes
@app.route('/cleanme')
@app.route('/cleanme/')
def cleanme_home():
    """CleanMe - Discord Server Template Sharing"""
    data = load_cleanme_servers()
    config = load_cleanme_config()

    # Calculate stats
    total_servers = len(data.get('servers', {}))
    total_copies = sum(s.get('copies', 0) for s in data.get('servers', {}).values())
    total_votes = sum(s.get('votes', 0) for s in data.get('servers', {}).values())

    # Get featured servers
    featured_ids = config.get('featured_servers', [])
    featured_servers = []
    for server_id in featured_ids[:6]:
        if server_id in data.get('servers', {}):
            server = data['servers'][server_id].copy()
            server['server_id'] = server_id
            server['roles_count'] = server.get('role_count', 0)
            server['channels_count'] = server.get('channel_count', 0)
            featured_servers.append(server)

    # Get popular servers (top 6 by votes)
    all_servers = []
    for server_id, server in data.get('servers', {}).items():
        server_copy = server.copy()
        server_copy['server_id'] = server_id
        server_copy['roles_count'] = server.get('role_count', 0)
        server_copy['channels_count'] = server.get('channel_count', 0)
        all_servers.append(server_copy)

    popular_servers = sorted(all_servers, key=lambda x: x.get('votes', 0), reverse=True)[:6]

    # Get latest servers (6 most recent)
    latest_servers = sorted(all_servers, key=lambda x: x.get('created', 0), reverse=True)[:6]

    # Add "added ago" text for latest
    for server in latest_servers:
        created = server.get('created', 0)
        if created:
            diff = time.time() - created
            if diff < 3600:
                server['added_ago'] = f"{int(diff / 60)} minutes ago"
            elif diff < 86400:
                server['added_ago'] = f"{int(diff / 3600)} hours ago"
            else:
                server['added_ago'] = f"{int(diff / 86400)} days ago"
        else:
            server['added_ago'] = "recently"

    # Get user from session
    cleanme_user = session.get('cleanme_user')

    return render_template('cleanme.html',
        cleanme_user=cleanme_user,
        stats={
            'total_servers': total_servers,
            'total_copies': total_copies,
            'total_votes': total_votes
        },
        featured_servers=featured_servers,
        popular_servers=popular_servers,
        latest_servers=latest_servers,
        bot_client_id=os.environ.get('CLEANME_BOT_CLIENT_ID', '')
    )

@app.route('/cleanme/browse')
@app.route('/cleanme/browse/')
def cleanme_browse():
    """CleanMe - Browse server templates"""
    search = request.args.get('search', '')
    category = request.args.get('category', '')
    sort = request.args.get('sort', 'popular')
    return render_template('cleanme-browse.html', search=search, category=category, sort=sort)

@app.route('/cleanme/server/<server_id>')
def cleanme_server(server_id):
    """CleanMe - View server template details"""
    data = load_cleanme_servers()
    server = data['servers'].get(server_id, {})
    return render_template('cleanme-server.html', server_id=server_id,
                           server=server,
                           cleanme_client_id=CLEANME_CLIENT_ID)

@app.route('/cleanme/edit/<server_id>')
@cleanme_auth_required
def cleanme_edit(server_id):
    """CleanMe - Edit a server template"""
    data = load_cleanme_servers()
    if server_id not in data['servers']:
        return redirect('/cleanme/dashboard')
    server = data['servers'][server_id]
    user = session.get('cleanme_user', {})
    if server.get('owner', {}).get('id') != user.get('id'):
        return redirect('/cleanme/dashboard')
    return render_template('cleanme-edit.html', server_id=server_id, server=server)

@app.route('/cleanme/api/servers/<server_id>', methods=['PUT'])
@cleanme_auth_required
def cleanme_update_server(server_id):
    """Update a server listing's description, category and tags"""
    user = session.get('cleanme_user')
    data = load_cleanme_servers()

    if server_id not in data['servers']:
        return jsonify({'error': 'Server not found'}), 404

    server = data['servers'][server_id]
    if server.get('owner', {}).get('id') != user['id']:
        return jsonify({'error': 'You can only edit your own servers'}), 403

    req_data = request.get_json()
    if req_data.get('description'):
        data['servers'][server_id]['description'] = req_data['description'][:500]
    if req_data.get('category'):
        data['servers'][server_id]['category'] = req_data['category']
    if 'tags' in req_data:
        data['servers'][server_id]['tags'] = [t.strip() for t in req_data['tags'].split(',')[:5] if t.strip()]

    save_cleanme_servers(data)
    return jsonify({'success': True})

@app.route('/cleanme/submit')
@app.route('/cleanme/submit/')
def cleanme_submit():
    """CleanMe - Submit a server template"""
    return render_template('cleanme-submit.html')

@app.route('/cleanme/dashboard')
@app.route('/cleanme/dashboard/')
def cleanme_dashboard():
    """CleanMe - User dashboard"""
    return render_template('cleanme-dashboard.html')

# CleanMe OAuth Routes — all redirected to unified login
@app.route('/cleanme/auth/discord')
@app.route('/cleanme/auth/discord_legacy')
def cleanme_auth():
    return redirect('/login?next=/cleanme/dashboard')

@app.route('/cleanme/auth/callback')
def cleanme_callback():
    """Legacy callback — no longer used."""
    return redirect('/login?next=/cleanme/dashboard')

@app.route('/cleanme/auth/logout')
def cleanme_logout():
    return redirect('/logout')

# CleanMe API Routes
@app.route('/cleanme/api/servers/featured')
def cleanme_get_featured():
    """Get featured server templates"""
    data = load_cleanme_servers()
    config = load_cleanme_config()
    featured_ids = config.get('featured_servers', [])

    featured = []
    for server_id in featured_ids:
        if server_id in data['servers']:
            server = data['servers'][server_id].copy()
            server['id'] = server_id
            featured.append(server)

    return jsonify(featured[:6])

@app.route('/cleanme/api/servers/popular')
def cleanme_get_popular():
    """Get popular server templates (sorted by votes)"""
    data = load_cleanme_servers()

    servers = []
    for server_id, server in data['servers'].items():
        server_copy = server.copy()
        server_copy['id'] = server_id
        servers.append(server_copy)

    # Sort by votes
    servers.sort(key=lambda x: x.get('votes', 0), reverse=True)

    return jsonify(servers[:6])

@app.route('/cleanme/api/servers/latest')
def cleanme_get_latest():
    """Get latest server templates"""
    data = load_cleanme_servers()

    servers = []
    for server_id, server in data['servers'].items():
        server_copy = server.copy()
        server_copy['id'] = server_id
        servers.append(server_copy)

    # Sort by created time
    servers.sort(key=lambda x: x.get('created', 0), reverse=True)

    return jsonify(servers[:6])

@app.route('/cleanme/api/servers')
def cleanme_get_servers():
    """Get paginated server templates with search/filter"""
    data = load_cleanme_servers()

    search = request.args.get('search', '').lower()
    category = request.args.get('category', '')
    sort = request.args.get('sort', 'popular')
    page = int(request.args.get('page', 1))
    limit = int(request.args.get('limit', 12))

    servers = []
    for server_id, server in data['servers'].items():
        # Filter by search
        if search and search not in server.get('name', '').lower() and search not in server.get('description', '').lower():
            continue
        # Filter by category
        if category and server.get('category', '') != category:
            continue

        server_copy = server.copy()
        server_copy['id'] = server_id
        servers.append(server_copy)

    # Sort
    if sort == 'popular' or sort == 'votes':
        servers.sort(key=lambda x: x.get('votes', 0), reverse=True)
    elif sort == 'latest':
        servers.sort(key=lambda x: x.get('created', 0), reverse=True)
    elif sort == 'copies':
        servers.sort(key=lambda x: x.get('copies', 0), reverse=True)

    # Paginate
    total = len(servers)
    start = (page - 1) * limit
    end = start + limit
    paginated = servers[start:end]

    return jsonify({
        'servers': paginated,
        'total': total,
        'page': page,
        'limit': limit,
        'total_pages': (total + limit - 1) // limit
    })

@app.route('/cleanme/api/servers/<server_id>')
def cleanme_get_server(server_id):
    """Get a specific server template"""
    data = load_cleanme_servers()

    if server_id not in data['servers']:
        return jsonify({'error': 'Server not found'}), 404

    server = data['servers'][server_id].copy()
    server['id'] = server_id

    return jsonify(server)

@app.route('/cleanme/api/servers', methods=['POST'])
@cleanme_auth_required
def cleanme_create_server():
    """Create a new server listing"""
    user = session.get('cleanme_user')
    req_data = request.get_json()

    if not req_data:
        return jsonify({'error': 'Request data required'}), 400

    server_id = req_data.get('server_id', '').strip()
    description = req_data.get('description', '').strip()
    category = req_data.get('category', 'other')
    tags = req_data.get('tags', '')

    if not server_id or not server_id.isdigit() or len(server_id) < 17:
        return jsonify({'error': 'Valid server ID required'}), 400

    # Check if server already listed (one listing per server)
    data = load_cleanme_servers()
    if server_id in data['servers']:
        return jsonify({'error': 'This server is already listed on CleanMe'}), 400

    # Verify user is owner or admin of the server using bot token
    bot_token = os.environ.get('CLEANME_BOT_TOKEN', '')
    if not bot_token:
        return jsonify({'error': 'CleanMe bot not configured'}), 500

    headers = {'Authorization': f'Bot {bot_token}'}
    try:
        guild_res = requests.get(
            f'https://discord.com/api/v10/guilds/{server_id}?with_counts=true',
            headers=headers, timeout=10
        )
        if guild_res.status_code == 404:
            return jsonify({'error': 'Bot is not in this server. Invite CleanMe bot first.'}), 400
        if guild_res.status_code != 200:
            return jsonify({'error': 'Could not fetch server info from Discord. Try again later.'}), 502

        guild_data = guild_res.json()
        guild_owner_id = guild_data.get('owner_id', '')

        # Check ownership: user must be server owner OR have admin permission in the server
        user_id = user['id']
        is_owner = (user_id == guild_owner_id)
        is_admin = False

        if not is_owner:
            # Check if server is in the user's admin guilds (from session)
            user_guilds = user.get('guilds', [])
            is_admin = server_id in user_guilds

            if not is_admin:
                # Try fresh guilds check using the stored access token
                access_token = session.get('cleanme_token', '')
                if access_token:
                    try:
                        guilds_res = requests.get(
                            'https://discord.com/api/users/@me/guilds',
                            headers={'Authorization': f'Bearer {access_token}'}, timeout=10
                        )
                        if guilds_res.status_code == 200:
                            fresh_guilds = guilds_res.json()
                            for g in fresh_guilds:
                                if g['id'] == server_id and (g.get('owner') or (int(g.get('permissions', 0)) & 0x8) == 0x8):
                                    is_admin = True
                                    break
                    except Exception:
                        pass

        if not is_owner and not is_admin:
            return jsonify({'error': 'You must be the server owner or an administrator to list this server.'}), 403

        # Fetch channels and roles for the listing
        channels_res = requests.get(f'https://discord.com/api/v10/guilds/{server_id}/channels', headers=headers, timeout=10)
        channels = channels_res.json() if channels_res.status_code == 200 else []

        roles_res = requests.get(f'https://discord.com/api/v10/guilds/{server_id}/roles', headers=headers, timeout=10)
        roles = roles_res.json() if roles_res.status_code == 200 else []

        icon_hash = guild_data.get('icon')
        icon_url = f"https://cdn.discordapp.com/icons/{server_id}/{icon_hash}.png" if icon_hash else None

        categories = [c for c in channels if c.get('type') == 4]
        voice_and_text = [c for c in channels if c.get('type') in (0, 2, 5, 13, 15, 16)]
        non_everyone_roles = [r for r in roles if r.get('name') != '@everyone']

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Discord API timed out. Try again.'}), 502
    except Exception as e:
        print(f"CleanMe create server error: {e}")
        return jsonify({'error': 'Failed to verify server info. Try again later.'}), 500

    server_entry = {
        'name': guild_data.get('name', f'Server {server_id}'),
        'description': description,
        'category': category,
        'tags': [t.strip() for t in tags.split(',')[:5] if t.strip()],
        'icon': icon_url,
        'guild_owner_id': guild_owner_id,
        'owner': {
            'id': user['id'],
            'username': user['username'],
            'avatar': user.get('avatar', '')
        },
        'channel_count': len(voice_and_text),
        'role_count': len(non_everyone_roles),
        'category_count': len(categories),
        'channels': [],
        'roles': [],
        'categories': [],
        'votes': 0,
        'copies': 0,
        'created': time.time()
    }

    data['servers'][server_id] = server_entry
    save_cleanme_servers(data)

    return jsonify({
        'success': True,
        'server_id': server_id,
        'message': 'Server submitted successfully'
    })

@app.route('/cleanme/api/servers/<server_id>', methods=['DELETE'])
@cleanme_auth_required
def cleanme_delete_server(server_id):
    """Delete a server listing"""
    user = session.get('cleanme_user')
    data = load_cleanme_servers()

    if server_id not in data['servers']:
        return jsonify({'error': 'Server not found'}), 404

    # Check ownership
    server = data['servers'][server_id]
    if server['owner']['id'] != user['id']:
        return jsonify({'error': 'You can only delete your own servers'}), 403

    del data['servers'][server_id]
    save_cleanme_servers(data)

    return jsonify({'success': True, 'message': 'Server deleted'})

@app.route('/cleanme/api/servers/<server_id>/vote', methods=['POST'])
@cleanme_auth_required
def cleanme_vote_server(server_id):
    """Vote for a server template"""
    user = session.get('cleanme_user')
    data = load_cleanme_servers()

    if server_id not in data['servers']:
        return jsonify({'error': 'Server not found'}), 404

    # Check if user already voted
    vote_key = f"{user['id']}:{server_id}"
    if vote_key in data.get('votes', {}):
        return jsonify({'error': 'You already voted for this server'}), 400

    # Record vote
    if 'votes' not in data:
        data['votes'] = {}
    data['votes'][vote_key] = time.time()

    # Increment vote count
    data['servers'][server_id]['votes'] = data['servers'][server_id].get('votes', 0) + 1

    save_cleanme_servers(data)

    return jsonify({
        'success': True,
        'votes': data['servers'][server_id]['votes']
    })

@app.route('/cleanme/api/my-servers')
@cleanme_auth_required
def cleanme_my_servers():
    """Get current user's server listings"""
    user = session.get('cleanme_user')
    data = load_cleanme_servers()

    servers = []
    for server_id, server in data['servers'].items():
        if server['owner']['id'] == user['id']:
            server_copy = server.copy()
            server_copy['id'] = server_id
            servers.append(server_copy)

    return jsonify(servers)

@app.route('/cleanme/api/preview/<server_id>')
def cleanme_preview_server(server_id):
    """Preview server info fetched from Discord via bot token"""
    if not server_id or not server_id.isdigit():
        return jsonify({'error': 'Invalid server ID'})

    bot_token = os.environ.get('CLEANME_BOT_TOKEN', '')
    if not bot_token:
        return jsonify({'error': 'CleanMe bot not configured on this server'})

    headers = {'Authorization': f'Bot {bot_token}'}

    try:
        guild_res = requests.get(
            f'https://discord.com/api/v10/guilds/{server_id}?with_counts=true',
            headers=headers, timeout=10
        )

        if guild_res.status_code == 404:
            return jsonify({'error': 'Bot is not in this server. Invite CleanMe bot and try again.'})
        if guild_res.status_code == 403:
            return jsonify({'error': 'Bot does not have permission to view this server.'})
        if guild_res.status_code != 200:
            return jsonify({'error': 'Failed to fetch server info from Discord. Try again later.'})

        guild = guild_res.json()

        channels_res = requests.get(
            f'https://discord.com/api/v10/guilds/{server_id}/channels',
            headers=headers, timeout=10
        )
        channels = channels_res.json() if channels_res.status_code == 200 else []

        roles_res = requests.get(
            f'https://discord.com/api/v10/guilds/{server_id}/roles',
            headers=headers, timeout=10
        )
        roles = roles_res.json() if roles_res.status_code == 200 else []

        icon_hash = guild.get('icon')
        icon_url = None
        if icon_hash:
            icon_url = f"https://cdn.discordapp.com/icons/{server_id}/{icon_hash}.png"

        categories = [c for c in channels if c.get('type') == 4]
        voice_and_text = [c for c in channels if c.get('type') in (0, 2, 5, 13, 15, 16)]
        non_everyone_roles = [r for r in roles if r.get('name') != '@everyone']

        return jsonify({
            'name': guild.get('name', f'Server {server_id}'),
            'icon': icon_url,
            'channel_count': len(voice_and_text),
            'role_count': len(non_everyone_roles),
            'category_count': len(categories)
        })

    except requests.exceptions.Timeout:
        return jsonify({'error': 'Discord API timed out. Try again.'})
    except Exception as e:
        print(f"CleanMe preview error: {e}")
        return jsonify({'error': 'Failed to fetch server info. Make sure CleanMe bot is in the server.'})

# Admin API for managing featured servers
@app.route('/cleanme/api/admin/featured', methods=['POST'])
def cleanme_set_featured():
    """Set featured servers (admin only)"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    data = request.get_json()
    server_ids = data.get('server_ids', [])

    config = load_cleanme_config()
    config['featured_servers'] = server_ids
    save_cleanme_config(config)

    return jsonify({'success': True, 'featured': server_ids})

# Bot API for updating server info
@app.route('/cleanme/api/bot/update-server', methods=['POST'])
def cleanme_bot_update_server():
    """Update server info from bot"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    req_data = request.get_json()
    server_id = req_data.get('server_id')

    if not server_id:
        return jsonify({'error': 'Server ID required'}), 400

    data = load_cleanme_servers()

    if server_id not in data['servers']:
        return jsonify({'error': 'Server not found'}), 404

    # Update server info
    update_fields = ['name', 'icon', 'channel_count', 'role_count', 'category_count',
                     'channels', 'roles', 'categories']

    for field in update_fields:
        if field in req_data:
            data['servers'][server_id][field] = req_data[field]

    save_cleanme_servers(data)

    return jsonify({'success': True, 'message': 'Server info updated'})

# Bot API for publishing (create or override) a server listing
@app.route('/cleanme/api/bot/publish-server', methods=['POST'])
def cleanme_bot_publish_server():
    """Create or override a server listing from the bot (used after /save)"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('CLEANME_BOT_API_KEY', os.environ.get('ADMIN_API_KEY', ''))

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    req_data = request.get_json()
    server_id = req_data.get('server_id')

    if not server_id:
        return jsonify({'error': 'Server ID required'}), 400

    data = load_cleanme_servers()
    existing = data['servers'].get(server_id, {})

    # Preserve user-submitted fields if they exist, update everything else
    server_entry = {
        'name': req_data.get('name', existing.get('name', f'Server {server_id}')),
        'description': existing.get('description', ''),
        'category': existing.get('category', 'other'),
        'tags': existing.get('tags', []),
        'icon': req_data.get('icon', existing.get('icon')),
        'guild_owner_id': req_data.get('guild_owner_id', existing.get('guild_owner_id', '')),
        'owner': existing.get('owner', {
            'id': req_data.get('submitted_by_discord_id', ''),
            'username': req_data.get('submitted_by_username', 'Unknown'),
            'avatar': ''
        }),
        'channel_count': req_data.get('channel_count', existing.get('channel_count', 0)),
        'role_count': req_data.get('role_count', existing.get('role_count', 0)),
        'category_count': req_data.get('category_count', existing.get('category_count', 0)),
        'channels': existing.get('channels', []),
        'roles': existing.get('roles', []),
        'categories': existing.get('categories', []),
        'votes': existing.get('votes', 0),
        'copies': existing.get('copies', 0),
        'created': existing.get('created', time.time()),
        'updated': time.time()
    }

    is_new = server_id not in data['servers']
    data['servers'][server_id] = server_entry
    save_cleanme_servers(data)

    return jsonify({
        'success': True,
        'is_new': is_new,
        'server_id': server_id,
        'message': 'Server listing created' if is_new else 'Server listing updated'
    })

# Bot API for recording copies
@app.route('/cleanme/api/bot/record-copy', methods=['POST'])
def cleanme_bot_record_copy():
    """Record a server copy from bot"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    req_data = request.get_json()
    server_id = req_data.get('server_id')

    if not server_id:
        return jsonify({'error': 'Server ID required'}), 400

    data = load_cleanme_servers()

    if server_id not in data['servers']:
        return jsonify({'error': 'Server not found'}), 404

    data['servers'][server_id]['copies'] = data['servers'][server_id].get('copies', 0) + 1
    save_cleanme_servers(data)

    return jsonify({'success': True, 'copies': data['servers'][server_id]['copies']})

# ==================== REPORT SYSTEM ====================

REPORTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'reports.json')
BOT_REPORT_URL = 'http://127.0.0.1:3847/report'

def get_bot_api_key():
    """Get bot API key from pm2_config.json or environment variable"""
    config = load_pm2_config()
    return config.get('bot_api_key', os.environ.get('BOT_API_KEY', os.environ.get('API_KEY', '')))

def load_reports():
    """Load reports from file"""
    if os.path.exists(REPORTS_FILE):
        with open(REPORTS_FILE, 'r') as f:
            return json.load(f)
    return []

def save_reports(reports):
    """Save reports to file"""
    os.makedirs(os.path.dirname(REPORTS_FILE), exist_ok=True)
    with open(REPORTS_FILE, 'w') as f:
        json.dump(reports, f, indent=2)

@app.route('/report')
@app.route('/report/')
def report_page():
    """Report Page - Report inappropriate content"""
    return render_template('report.html')

@app.route('/api/report', methods=['POST'])
@rate_limit('report')
def submit_report():
    """API endpoint to submit a report"""
    ip_address = get_client_ip()
    user_agent = request.headers.get('User-Agent', 'Unknown')
    accept_language = request.headers.get('Accept-Language', 'Unknown')
    referer = request.headers.get('Referer', 'Direct')

    data = request.get_json()
    if not data:
        return jsonify({'error': 'Report data required'}), 400

    report_type = data.get('type', 'general')
    subject = data.get('subject', '').strip()
    description = data.get('description', '').strip()
    url = data.get('url', '').strip()
    contact = data.get('contact', '').strip()
    # Client-side fingerprint (if provided by frontend)
    fingerprint = data.get('fingerprint', 'N/A')

    if not description:
        return jsonify({'error': 'Description is required'}), 400

    # Create report with tracking info
    report = {
        'id': hashlib.md5(f"{time.time()}{ip_address}".encode()).hexdigest()[:12],
        'type': report_type,
        'subject': subject,
        'description': description,
        'url': url,
        'contact': contact,
        'ip': ip_address,
        'user_agent': user_agent,
        'accept_language': accept_language,
        'referer': referer,
        'fingerprint': fingerprint,
        'timestamp': time.time(),
        'status': 'pending'
    }

    # Save report
    reports = load_reports()
    reports.append(report)
    save_reports(reports)

    # Send to Discord via CubSoftware Bot
    bot_api_key = get_bot_api_key()
    if bot_api_key:
        try:
            response = requests.post(BOT_REPORT_URL, json={
                'apiKey': bot_api_key,
                'report': report
            }, timeout=5)
            if response.status_code != 200:
                print(f'Failed to send report to bot: {response.status_code} - {response.text}')
        except Exception as e:
            print(f'Failed to send report to bot: {e}')
    else:
        print('Warning: No bot API key configured, report not sent to Discord')

    return jsonify({'success': True, 'reportId': report['id']})

# ==================== PM2 DASHBOARD CONFIG & AUTH ====================

# PM2 Dashboard Configuration
PM2_CONFIG_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'pm2_config.json')
PM2_WHITELIST_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'pm2_whitelist.json')
APP_WHITELIST_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'app_whitelist.json')

_APP_WHITELIST_VALID = {'streamavatars', 'marbles'}

def load_app_whitelist():
    """Load app-level whitelists (streamavatars, marbles)"""
    if os.path.exists(APP_WHITELIST_FILE):
        try:
            with open(APP_WHITELIST_FILE, 'r') as f:
                return json.load(f)
        except Exception:
            pass
    return {app: {'allowed_users': []} for app in _APP_WHITELIST_VALID}

def save_app_whitelist(data):
    os.makedirs(os.path.dirname(APP_WHITELIST_FILE), exist_ok=True)
    with open(APP_WHITELIST_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def is_app_whitelisted(app_name, user_id):
    """Return True if user_id is whitelisted for the given app (or whitelist is empty = open to all)."""
    data = load_app_whitelist()
    users = data.get(app_name, {}).get('allowed_users', [])
    if not users:
        return True  # empty whitelist = feature is open to everyone
    return str(user_id) in users

# Discord OAuth Configuration (loaded from config file or environment)
def load_pm2_config():
    """Load PM2 dashboard configuration"""
    defaults = {
        'discord_client_id': os.environ.get('DISCORD_CLIENT_ID', ''),
        'discord_client_secret': os.environ.get('DISCORD_CLIENT_SECRET', ''),
        'discord_redirect_uri': os.environ.get('DISCORD_REDIRECT_URI', 'https://cubsoftware.site/dashboard/callback')
    }
    if os.path.exists(PM2_CONFIG_FILE):
        try:
            with open(PM2_CONFIG_FILE, 'r') as f:
                stored = json.load(f)
            defaults.update(stored)
        except (json.JSONDecodeError, ValueError):
            pass
    return defaults

def save_pm2_config(config):
    """Save PM2 dashboard configuration"""
    os.makedirs(os.path.dirname(PM2_CONFIG_FILE), exist_ok=True)
    with open(PM2_CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)

def load_pm2_whitelist():
    """Load PM2 dashboard whitelist"""
    if os.path.exists(PM2_WHITELIST_FILE):
        with open(PM2_WHITELIST_FILE, 'r') as f:
            return json.load(f)
    return {'allowed_users': ['378501056008683530']}

def save_pm2_whitelist(whitelist):
    """Save PM2 dashboard whitelist"""
    os.makedirs(os.path.dirname(PM2_WHITELIST_FILE), exist_ok=True)
    with open(PM2_WHITELIST_FILE, 'w') as f:
        json.dump(whitelist, f, indent=2)

def is_user_whitelisted(user_id):
    """Check if a user is whitelisted for PM2 dashboard access"""
    whitelist = load_pm2_whitelist()
    return str(user_id) in whitelist.get('allowed_users', [])

DEV_USER = {'id': '00000000000000000001', 'username': 'DevUser', 'avatar': ''}

def pm2_auth_required(f):
    """Decorator to require PM2 dashboard authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if IS_DEV:
            if 'pm2_user' not in session:
                session['pm2_user'] = DEV_USER
                print(f"[DEV] Auth bypass active — logged in as DevUser (id={DEV_USER['id']})")
            return f(*args, **kwargs)
        if 'pm2_user' not in session:
            return redirect(url_for('pm2_login'))
        if not is_user_whitelisted(session['pm2_user']['id']):
            session.pop('pm2_user', None)
            return redirect(url_for('pm2_login', error='not_whitelisted'))
        ip = get_client_ip()
        allowed, retry_after = check_rate_limit(ip, 'dashboard')
        if not allowed:
            return jsonify({'error': 'Rate limit exceeded', 'retry_after': int(retry_after)}), 429
        return f(*args, **kwargs)
    return decorated_function

# Admin API for reports management
@app.route('/api/reports')
@pm2_auth_required
def get_reports():
    """Get all reports for admin dashboard"""
    reports = load_reports()
    status_filter = request.args.get('status', 'all')

    if status_filter != 'all':
        reports = [r for r in reports if r.get('status') == status_filter]

    # Sort by timestamp descending (newest first)
    reports.sort(key=lambda x: x.get('timestamp', 0), reverse=True)

    return jsonify({
        'reports': reports,
        'total': len(reports),
        'stats': {
            'pending': len([r for r in load_reports() if r.get('status') == 'pending']),
            'investigating': len([r for r in load_reports() if r.get('status') == 'investigating']),
            'resolved': len([r for r in load_reports() if r.get('status') == 'resolved']),
            'closed': len([r for r in load_reports() if r.get('status') == 'closed'])
        }
    })

@app.route('/api/reports/<report_id>')
@pm2_auth_required
def get_report(report_id):
    """Get a specific report"""
    reports = load_reports()
    for report in reports:
        if report.get('id') == report_id:
            return jsonify(report)
    return jsonify({'error': 'Report not found'}), 404

@app.route('/api/reports/<report_id>/update', methods=['POST'])
@pm2_auth_required
def update_report(report_id):
    """Update a report's status or add notes"""
    data = request.get_json()
    if not data:
        return jsonify({'error': 'No data provided'}), 400

    reports = load_reports()
    for i, report in enumerate(reports):
        if report.get('id') == report_id:
            # Update allowed fields
            if 'status' in data:
                reports[i]['status'] = data['status']
            if 'admin_notes' in data:
                reports[i]['admin_notes'] = data['admin_notes']
            if 'escalated' in data:
                reports[i]['escalated'] = data['escalated']

            reports[i]['updated_at'] = time.time()
            reports[i]['updated_by'] = session.get('pm2_user', {}).get('username', 'Unknown')

            save_reports(reports)
            return jsonify({'success': True, 'report': reports[i]})

    return jsonify({'error': 'Report not found'}), 404

@app.route('/api/reports/<report_id>/delete', methods=['DELETE'])
@pm2_auth_required
def delete_report(report_id):
    """Delete a report"""
    reports = load_reports()
    original_count = len(reports)
    reports = [r for r in reports if r.get('id') != report_id]

    if len(reports) == original_count:
        return jsonify({'error': 'Report not found'}), 404

    save_reports(reports)
    return jsonify({'success': True, 'message': 'Report deleted'})

# ==================== KERAPLAST CALCULATOR ====================

def _keraplast_data_dir():
    """Return a persistent data directory that survives application redeploys.
    On Linux (production): /var/cubsoftware-data/
    On Windows (dev): app's local data/ directory
    Falls back to app data/ if persistent dir cannot be created."""
    if os.name == 'nt':
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
    persistent = os.environ.get('CUBSOFTWARE_DATA_DIR', '/var/cubsoftware-data')
    try:
        os.makedirs(persistent, exist_ok=True)
        return persistent
    except Exception:
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')

KERAPLAST_PASSWORDS_FILE = os.path.join(_keraplast_data_dir(), 'keraplast_passwords.json')

def load_keraplast_passwords():
    # Auto-migrate from old app-relative path to persistent path on first run
    old_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'keraplast_passwords.json')
    if KERAPLAST_PASSWORDS_FILE != old_path and os.path.exists(old_path) and not os.path.exists(KERAPLAST_PASSWORDS_FILE):
        import shutil as _shutil
        os.makedirs(os.path.dirname(KERAPLAST_PASSWORDS_FILE), exist_ok=True)
        _shutil.copy2(old_path, KERAPLAST_PASSWORDS_FILE)
    if os.path.exists(KERAPLAST_PASSWORDS_FILE):
        with open(KERAPLAST_PASSWORDS_FILE, 'r') as f:
            return json.load(f)
    return {'passwords': []}

def save_keraplast_passwords(data):
    os.makedirs(os.path.dirname(KERAPLAST_PASSWORDS_FILE), exist_ok=True)
    with open(KERAPLAST_PASSWORDS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

@app.route('/keraplast')
@app.route('/keraplast/')
def keraplast():
    """Keraplast Digestion Calculator - Calculate digestion timing steps"""
    return render_template('keraplast.html')

@app.route('/api/keraplast/verify', methods=['POST'])
def keraplast_verify_password():
    """Verify a keraplast password"""
    req_data = request.get_json()
    password = req_data.get('password', '')

    if not password:
        return jsonify({'valid': False}), 400

    data = load_keraplast_passwords()

    for p in data.get('passwords', []):
        if p['password'] == password:
            return jsonify({'valid': True, 'label': p.get('label', ''), 'is_admin': p.get('role') == 'admin'})

    # Also accept the env-var master password
    master_pw = os.environ.get('KERAPLAST_ADMIN_PASSWORD', '')
    if master_pw and password == master_pw:
        return jsonify({'valid': True, 'label': 'Admin', 'is_admin': True})

    return jsonify({'valid': False})

@app.route('/api/keraplast/passwords', methods=['GET'])
def keraplast_get_passwords():
    """Get all keraplast passwords (admin only)"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    data = load_keraplast_passwords()
    return jsonify(data)

@app.route('/api/keraplast/passwords', methods=['POST'])
def keraplast_create_password():
    """Create a keraplast password (admin only)"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    req_data = request.get_json()
    password = req_data.get('password', '').strip()
    label = req_data.get('label', '').strip()

    if not password:
        return jsonify({'error': 'Password is required'}), 400

    data = load_keraplast_passwords()

    # Check if password already exists
    for p in data.get('passwords', []):
        if p['password'] == password:
            return jsonify({'error': 'Password already exists'}), 400

    data['passwords'].append({
        'password': password,
        'label': label,
        'created_at': time.time()
    })

    save_keraplast_passwords(data)
    return jsonify({'success': True, 'message': f'Password created for {label or "unnamed"}'})

@app.route('/api/keraplast/passwords/<password>', methods=['DELETE'])
def keraplast_delete_password(password):
    """Delete a keraplast password (admin only)"""
    api_key = request.headers.get('X-API-Key')
    expected_key = os.environ.get('ADMIN_API_KEY', '')

    if not expected_key or api_key != expected_key:
        return jsonify({'error': 'Unauthorized'}), 401

    data = load_keraplast_passwords()
    original_count = len(data.get('passwords', []))
    data['passwords'] = [p for p in data.get('passwords', []) if p['password'] != password]

    if len(data['passwords']) == original_count:
        return jsonify({'error': 'Password not found'}), 404

    save_keraplast_passwords(data)
    return jsonify({'success': True, 'message': 'Password deleted'})

# ==================== KERAPLAST HISTORY ====================

KERAPLAST_HISTORY_FILE = os.path.join(_keraplast_data_dir(), 'keraplast_history.json')
KERAPLAST_STATE_FILE = os.path.join(_keraplast_data_dir(), 'keraplast_state.json')

def load_keraplast_history():
    if os.path.exists(KERAPLAST_HISTORY_FILE):
        with open(KERAPLAST_HISTORY_FILE, 'r') as f:
            return json.load(f)
    return {'records': []}

def save_keraplast_history(data):
    os.makedirs(os.path.dirname(KERAPLAST_HISTORY_FILE), exist_ok=True)
    with open(KERAPLAST_HISTORY_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def verify_keraplast_password(password):
    if not password:
        return False
    data = load_keraplast_passwords()
    for p in data.get('passwords', []):
        if p['password'] == password:
            return True
    return False

@app.route('/keraplast/history')
@app.route('/keraplast/history/')
def keraplast_history_page():
    """Keraplast Digestion History"""
    return render_template('keraplast_history.html')

@app.route('/keraplast/history/<record_id>')
def keraplast_record_page(record_id):
    """Keraplast individual record detail page"""
    return render_template('keraplast_record.html', record_id=record_id)

@app.route('/api/keraplast/history', methods=['GET'])
def keraplast_get_history():
    """Get keraplast history records"""
    password = request.headers.get('X-Keraplast-Password', '')
    if not verify_keraplast_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    data = load_keraplast_history()
    # Return newest first
    records = list(reversed(data.get('records', [])))
    return jsonify({'records': records})

@app.route('/api/keraplast/history', methods=['POST'])
def keraplast_save_history():
    """Save a keraplast history record"""
    req_data = request.get_json()
    password = req_data.get('password', '')
    if not verify_keraplast_password(password):
        return jsonify({'error': 'Unauthorized'}), 401

    batch_number = req_data.get('batch_number', '').strip()
    operator = req_data.get('operator', '').strip()
    start_time = req_data.get('start_time', '').strip()
    calc_type = req_data.get('calc_type', '').strip()

    if not all([batch_number, operator, start_time, calc_type]):
        return jsonify({'error': 'Missing required fields'}), 400

    record = {
        'id': str(int(time.time() * 1000)),
        'date': req_data.get('date', ''),
        'calc_type': calc_type,
        'batch_number': batch_number,
        'operator': operator,
        'start_time': start_time,
        'finish_time': req_data.get('finish_time'),
        'results': req_data.get('results', ''),
        'step_times': req_data.get('step_times', []),
        'created_at': time.time()
    }

    data = load_keraplast_history()
    data['records'].append(record)
    save_keraplast_history(data)
    return jsonify({'success': True, 'id': record['id']})

@app.route('/api/keraplast/history/<record_id>', methods=['GET'])
def keraplast_get_record(record_id):
    """Get a single keraplast history record"""
    password = request.headers.get('X-Keraplast-Password', '')
    if not verify_keraplast_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    data = load_keraplast_history()
    for record in data.get('records', []):
        if record['id'] == record_id:
            return jsonify({'record': record})
    return jsonify({'error': 'Record not found'}), 404

@app.route('/api/keraplast/history/<record_id>', methods=['DELETE'])
def keraplast_delete_history(record_id):
    """Delete a keraplast history record (admin only)"""
    password = request.headers.get('X-Keraplast-Password', '')
    if not is_keraplast_admin(password):
        return jsonify({'error': 'Admin access required'}), 403

    data = load_keraplast_history()
    original_count = len(data.get('records', []))
    data['records'] = [r for r in data.get('records', []) if r['id'] != record_id]

    if len(data['records']) == original_count:
        return jsonify({'error': 'Record not found'}), 404

    save_keraplast_history(data)
    return jsonify({'success': True})

def is_keraplast_admin(password):
    """Return True if the password has admin role."""
    master_pw = os.environ.get('KERAPLAST_ADMIN_PASSWORD', '')
    if master_pw and password == master_pw:
        return True
    data = load_keraplast_passwords()
    for p in data.get('passwords', []):
        if p['password'] == password and p.get('role') == 'admin':
            return True
    return False

@app.route('/api/keraplast/history/<record_id>', methods=['PUT'])
def keraplast_edit_history(record_id):
    """Edit a keraplast history record (admin only)"""
    req_data = request.get_json()
    password = req_data.get('password', '')
    if not is_keraplast_admin(password):
        return jsonify({'error': 'Admin access required'}), 403

    data = load_keraplast_history()
    for record in data.get('records', []):
        if record['id'] == record_id:
            for field in ('date', 'batch_number', 'results', 'operator', 'step_times'):
                if field in req_data:
                    record[field] = req_data[field]
            save_keraplast_history(data)
            return jsonify({'success': True})
    return jsonify({'error': 'Record not found'}), 404

# ── Step offsets ────────────────────────────────────────────

KERAPLAST_OFFSETS_FILE = os.path.join(_keraplast_data_dir(), 'keraplast_offsets.json')

def load_keraplast_offsets():
    if os.path.exists(KERAPLAST_OFFSETS_FILE):
        with open(KERAPLAST_OFFSETS_FILE, 'r') as f:
            return json.load(f)
    return {}

def save_keraplast_offsets(data):
    os.makedirs(os.path.dirname(KERAPLAST_OFFSETS_FILE), exist_ok=True)
    with open(KERAPLAST_OFFSETS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

@app.route('/api/keraplast/offsets', methods=['GET'])
def keraplast_get_offsets():
    """Get custom step offsets"""
    password = request.headers.get('X-Keraplast-Password', '')
    if not verify_keraplast_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(load_keraplast_offsets())

@app.route('/api/keraplast/offsets', methods=['PUT'])
def keraplast_put_offsets():
    """Save custom step offsets (admin only) — merges with existing"""
    req_data = request.get_json()
    password = req_data.get('password', '')
    if not is_keraplast_admin(password):
        return jsonify({'error': 'Admin access required'}), 403
    new_offsets = req_data.get('offsets', {})
    existing = load_keraplast_offsets()
    existing.update(new_offsets)
    save_keraplast_offsets(existing)
    return jsonify({'success': True})

@app.route('/api/keraplast/offsets', methods=['DELETE'])
def keraplast_reset_offsets():
    """Reset step offsets to defaults (admin only)"""
    password = request.headers.get('X-Keraplast-Password', '')
    if not is_keraplast_admin(password):
        return jsonify({'error': 'Admin access required'}), 403
    save_keraplast_offsets({})
    return jsonify({'success': True})

# ── Real-time shared state ──────────────────────────────────

def _default_calc_state():
    return {'start_time': '', 'finish_time': '', 'batch_number': '', 'operator': '', 'timer_active': False, 'triggered_steps': []}

def load_keraplast_state():
    if os.path.exists(KERAPLAST_STATE_FILE):
        with open(KERAPLAST_STATE_FILE, 'r') as f:
            return json.load(f)
    return {'keraplast': _default_calc_state(), 'okl': _default_calc_state(), 'last_updated': 0}

def save_keraplast_state(data):
    os.makedirs(os.path.dirname(KERAPLAST_STATE_FILE), exist_ok=True)
    with open(KERAPLAST_STATE_FILE, 'w') as f:
        json.dump(data, f, indent=2)

@app.route('/api/keraplast/state', methods=['GET'])
def keraplast_get_state():
    """Get shared calculator state"""
    password = request.headers.get('X-Keraplast-Password', '')
    if not verify_keraplast_password(password):
        return jsonify({'error': 'Unauthorized'}), 401
    return jsonify(load_keraplast_state())

@app.route('/api/keraplast/state', methods=['PUT'])
def keraplast_put_state():
    """Update shared calculator state"""
    req_data = request.get_json()
    password = req_data.get('password', '')
    if not verify_keraplast_password(password):
        return jsonify({'error': 'Unauthorized'}), 401

    calc_type = req_data.get('calc_type')
    if calc_type not in ('keraplast', 'okl'):
        return jsonify({'error': 'Invalid calc_type'}), 400

    state = load_keraplast_state()
    state[calc_type] = {
        'start_time': req_data.get('start_time', ''),
        'finish_time': req_data.get('finish_time', ''),
        'batch_number': req_data.get('batch_number', ''),
        'operator': req_data.get('operator', ''),
        'timer_active': bool(req_data.get('timer_active', False)),
        'triggered_steps': req_data.get('triggered_steps', [])
    }
    state['last_updated'] = time.time()
    save_keraplast_state(state)
    return jsonify({'success': True})

# ==================== STREAM OVERLAYS APP INTEGRATION ====================

# Load Stream Overlays blueprint using importlib
overlays_blueprint_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'stream-overlays', 'app_blueprint.py')
spec_overlays = importlib.util.spec_from_file_location("overlays_blueprint", overlays_blueprint_path)
overlays_module = importlib.util.module_from_spec(spec_overlays)
spec_overlays.loader.exec_module(overlays_module)
app.register_blueprint(overlays_module.overlays_bp, url_prefix='/overlays')
_overlays_pm2 = load_pm2_config()
app.config['DISCORD_CLIENT_ID'] = _overlays_pm2.get('discord_client_id') or os.environ.get('DISCORD_CLIENT_ID', '')
app.config['DISCORD_CLIENT_SECRET'] = _overlays_pm2.get('discord_client_secret') or os.environ.get('DISCORD_CLIENT_SECRET', '')

# Add overlays templates to Jinja loader (appended to existing loader defined above)
_overlays_tmpl = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'stream-overlays', 'templates')
if isinstance(app.jinja_loader, ChoiceLoader):
    app.jinja_loader.loaders.append(FileSystemLoader(_overlays_tmpl))
else:
    app.jinja_loader = ChoiceLoader([app.jinja_loader, FileSystemLoader(_overlays_tmpl)])

# ==================== SOCIAL MEDIA SAVER APP INTEGRATION ====================

# Load Social Media Saver blueprint using importlib
social_blueprint_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'apps', 'social-media-saver', 'app_blueprint.py')
spec_social = importlib.util.spec_from_file_location("social_blueprint", social_blueprint_path)
social_module = importlib.util.module_from_spec(spec_social)
spec_social.loader.exec_module(social_module)
app.register_blueprint(social_module.social_media_bp, url_prefix='/apps/social-media-saver')

# ==================== CUBDECK APP INTEGRATION ====================

# Load CubDeck blueprint using importlib
cubdeck_blueprint_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cubdeck', 'app_blueprint.py')
spec_cubdeck = importlib.util.spec_from_file_location("cubdeck_blueprint", cubdeck_blueprint_path)
cubdeck_module = importlib.util.module_from_spec(spec_cubdeck)
spec_cubdeck.loader.exec_module(cubdeck_module)
app.register_blueprint(cubdeck_module.cubdeck_bp, url_prefix='/cubdeck')

_cubdeck_tmpl = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cubdeck', 'templates')
if isinstance(app.jinja_loader, ChoiceLoader):
    app.jinja_loader.loaders.append(FileSystemLoader(_cubdeck_tmpl))
else:
    app.jinja_loader = ChoiceLoader([app.jinja_loader, FileSystemLoader(_cubdeck_tmpl)])

# ==================== CUBBOT (TWITCH BOT) INTEGRATION ====================

cubassist_blueprint_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'twitch-bot', 'app_blueprint.py')
spec_cubassist = importlib.util.spec_from_file_location("cubassist_blueprint", cubassist_blueprint_path)
cubassist_module = importlib.util.module_from_spec(spec_cubassist)
spec_cubassist.loader.exec_module(cubassist_module)
app.register_blueprint(cubassist_module.cubassist_bp, url_prefix='/cubassist')

_cubassist_tmpl = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'twitch-bot', 'templates')
if isinstance(app.jinja_loader, ChoiceLoader):
    app.jinja_loader.loaders.append(FileSystemLoader(_cubassist_tmpl))
else:
    app.jinja_loader = ChoiceLoader([app.jinja_loader, FileSystemLoader(_cubassist_tmpl)])

# ==================== PM2 DASHBOARD ROUTES ====================

@app.route('/dashboard')
@app.route('/dashboard/')
@pm2_auth_required
def pm2_dashboard():
    """PM2 Dashboard - Process Monitor & Management"""
    return render_template('pm2-dashboard.html', user=session['pm2_user'])

@app.route('/admin')
@app.route('/admin/')
def admin_redirect():
    """Redirect /admin to dashboard"""
    return redirect(url_for('pm2_dashboard'))

@app.route('/apps/pm2-dashboard')
@app.route('/apps/pm2-dashboard/')
def pm2_dashboard_redirect():
    """Redirect old URL to new dashboard URL"""
    return redirect(url_for('pm2_dashboard'))

# OAuth state storage (file-based fallback for session issues)
OAUTH_STATES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'oauth_states.json')

def load_oauth_states():
    """Load valid OAuth states from file"""
    if os.path.exists(OAUTH_STATES_FILE):
        try:
            with open(OAUTH_STATES_FILE, 'r') as f:
                states = json.load(f)
                # Clean up expired states (older than 10 minutes)
                now = time.time()
                states = {k: v for k, v in states.items() if now - v < 600}
                return states
        except:
            pass
    return {}

def save_oauth_state(state):
    """Save OAuth state to file"""
    states = load_oauth_states()
    states[state] = time.time()
    os.makedirs(os.path.dirname(OAUTH_STATES_FILE), exist_ok=True)
    with open(OAUTH_STATES_FILE, 'w') as f:
        json.dump(states, f)

def verify_oauth_state(state):
    """Verify and remove OAuth state"""
    states = load_oauth_states()
    if state in states:
        del states[state]
        with open(OAUTH_STATES_FILE, 'w') as f:
            json.dump(states, f)
        return True
    return False

@app.route('/dashboard/login')
@app.route('/apps/pm2-dashboard/login')
def pm2_login():
    """Redirect to unified login — bridge auto-populates pm2_user for whitelisted users."""
    return redirect('/login?next=/dashboard')

@app.route('/dashboard/callback')
@app.route('/apps/pm2-dashboard/callback')
def pm2_callback():
    """Legacy callback — no longer used."""
    return redirect('/login?next=/dashboard')

@app.route('/dashboard/logout')
@app.route('/apps/pm2-dashboard/logout')
def pm2_logout():
    session.pop('pm2_user', None)
    return redirect('/logout')

# PM2 API Endpoints
@app.route('/api/pm2/processes')
@pm2_auth_required
def pm2_get_processes():
    """Get all PM2 processes with system stats"""
    try:
        # Get PM2 process list in JSON format
        result = subprocess.run(
            ['pm2', 'jlist'],
            capture_output=True,
            text=True,
            timeout=10
        )

        if result.returncode != 0:
            return jsonify({'error': 'Failed to get PM2 processes'}), 500

        processes_data = json.loads(result.stdout)

        processes = []
        total_cpu = 0
        total_memory = 0

        for proc in processes_data:
            # Custom bot processes are shown on their own page, not here
            if str(proc.get('name', '')).startswith('cp-custom-'):
                continue

            cpu = proc.get('monit', {}).get('cpu', 0)
            memory = proc.get('monit', {}).get('memory', 0)
            total_cpu += cpu
            total_memory += memory

            pm2_env = proc.get('pm2_env', {})

            processes.append({
                'name': proc.get('name'),
                'pm_id': proc.get('pm_id'),
                'pid': proc.get('pid'),
                'status': pm2_env.get('status', 'unknown'),
                'cpu': cpu,
                'memory': memory,
                'uptime': time.time() * 1000 - pm2_env.get('pm_uptime', time.time() * 1000) if pm2_env.get('status') == 'online' else 0,
                'restarts': pm2_env.get('restart_time', 0),
                'exec_mode': pm2_env.get('exec_mode', 'fork'),
                'instances': pm2_env.get('instances', 1)
            })

        # Get system stats
        try:
            # Try to get system CPU and memory usage
            import psutil
            system_cpu = psutil.cpu_percent(interval=0.1)
            system_memory = psutil.virtual_memory().percent
        except ImportError:
            # Fallback if psutil not installed
            system_cpu = total_cpu
            system_memory = 0

        return jsonify({
            'processes': processes,
            'system': {
                'cpu': system_cpu,
                'memory': system_memory
            }
        })

    except subprocess.TimeoutExpired:
        return jsonify({'error': 'PM2 command timed out'}), 500
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid PM2 response'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pm2/custom-bots/launch-all', methods=['POST'])
@pm2_auth_required
def pm2_launch_all_custom_bots():
    """Re-launch all custom bots from their wrapper files (used after pm2 delete all)."""
    cb_data = _load_custom_bots()
    results = []
    for guild_id, entry in cb_data.get('guilds', {}).items():
        if not entry.get('enabled') or not entry.get('token'):
            continue
        process_name = f'cp-custom-{guild_id}'
        wrapper_file = os.path.join(CUB_PROTECTOR_DIR, f'custom_bot_{guild_id}.js')
        if not os.path.exists(wrapper_file):
            results.append({'guild_id': guild_id, 'name': process_name, 'status': 'error', 'message': 'Wrapper file missing — re-activate via CUB PROTECTOR dashboard'})
            continue
        # Delete stale PM2 entry if it exists, then start fresh from the wrapper file
        subprocess.run(['pm2', 'delete', process_name], capture_output=True)
        result = subprocess.run(
            ['pm2', 'start', wrapper_file, '--name', process_name],
            capture_output=True, text=True, cwd=CUB_PROTECTOR_DIR
        )
        if result.returncode == 0:
            results.append({'guild_id': guild_id, 'name': process_name, 'status': 'started'})
        else:
            results.append({'guild_id': guild_id, 'name': process_name, 'status': 'error', 'message': result.stderr.strip()})
    subprocess.run(['pm2', 'save'], capture_output=True)
    return jsonify({'results': results})

@app.route('/api/pm2/custom-bots/<guild_id>/launch', methods=['POST'])
@pm2_auth_required
def pm2_launch_custom_bot(guild_id):
    """Launch a single custom bot by guild ID from its wrapper file."""
    cb_data = _load_custom_bots()
    entry = cb_data.get('guilds', {}).get(guild_id, {})
    if not entry.get('enabled') or not entry.get('token'):
        return jsonify({'error': 'No custom bot configured for this guild'}), 404
    process_name = f'cp-custom-{guild_id}'
    wrapper_file = os.path.join(CUB_PROTECTOR_DIR, f'custom_bot_{guild_id}.js')
    if not os.path.exists(wrapper_file):
        return jsonify({'error': 'Wrapper file missing — re-activate via CUB PROTECTOR dashboard'}), 404
    subprocess.run(['pm2', 'delete', process_name], capture_output=True)
    result = subprocess.run(
        ['pm2', 'start', wrapper_file, '--name', process_name],
        capture_output=True, text=True, cwd=CUB_PROTECTOR_DIR
    )
    subprocess.run(['pm2', 'save'], capture_output=True)
    if result.returncode == 0:
        return jsonify({'success': True})
    return jsonify({'error': result.stderr.strip() or 'Failed to start'}), 500

@app.route('/api/pm2/custom-bots')
@pm2_auth_required
def pm2_get_custom_bots():
    """Get PM2 processes for custom bots, enriched with custom_bots.json metadata."""
    try:
        result = subprocess.run(['pm2', 'jlist'], capture_output=True, text=True, timeout=10)
        if result.returncode != 0:
            return jsonify({'error': 'Failed to get PM2 processes'}), 500
        processes_data = json.loads(result.stdout)
        # Load custom bot metadata
        cb_data = _load_custom_bots()
        cb_guilds = cb_data.get('guilds', {})
        bots = []
        for proc in processes_data:
            name = str(proc.get('name', ''))
            if not name.startswith('cp-custom-'):
                continue
            guild_id = name[len('cp-custom-'):]
            pm2_env = proc.get('pm2_env', {})
            cpu = proc.get('monit', {}).get('cpu', 0)
            memory = proc.get('monit', {}).get('memory', 0)
            entry = cb_guilds.get(guild_id, {})
            cid = entry.get('client_id', '')
            avatar_hash = entry.get('bot_avatar', '')
            avatar_url = f"https://cdn.discordapp.com/avatars/{cid}/{avatar_hash}.png?size=64" if cid and avatar_hash else ''
            display_name = entry.get('display_name') or entry.get('discord_username', '') or name
            bots.append({
                'name': name,
                'pm_id': proc.get('pm_id'),
                'pid': proc.get('pid'),
                'status': pm2_env.get('status', 'unknown'),
                'cpu': cpu,
                'memory': memory,
                'uptime': time.time() * 1000 - pm2_env.get('pm_uptime', time.time() * 1000) if pm2_env.get('status') == 'online' else 0,
                'restarts': pm2_env.get('restart_time', 0),
                'guild_id': guild_id,
                'display_name': display_name,
                'discord_username': entry.get('discord_username', ''),
                'client_id': cid,
                'avatar_url': avatar_url,
            })
        return jsonify({'bots': bots})
    except subprocess.TimeoutExpired:
        return jsonify({'error': 'PM2 command timed out'}), 500
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid PM2 response'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def _valid_pm2_name(name):
    """Validate a PM2 process name contains only safe characters."""
    import re
    return bool(re.match(r'^[a-zA-Z0-9_\-\.]+$', name)) and len(name) <= 100

@app.route('/api/pm2/logs/<process_name>')
@pm2_auth_required
def pm2_get_logs(process_name):
    """Get logs for a specific PM2 process"""
    if not _valid_pm2_name(process_name):
        return jsonify({'error': 'Invalid process name'}), 400
    try:
        log_type = request.args.get('type', 'out')
        lines = int(request.args.get('lines', 100))

        # Determine log file type
        log_suffix = 'out' if log_type == 'out' else 'error'

        # Get PM2 logs using tail
        result = subprocess.run(
            ['pm2', 'logs', process_name, '--nostream', '--lines', str(lines)],
            capture_output=True,
            text=True,
            timeout=10
        )

        # Parse log output
        logs = []
        for line in result.stdout.split('\n'):
            if line.strip():
                # Try to extract timestamp and content
                parts = line.split('|', 1)
                if len(parts) == 2:
                    logs.append({
                        'timestamp': parts[0].strip(),
                        'content': parts[1].strip()
                    })
                else:
                    logs.append({
                        'timestamp': '',
                        'content': line.strip()
                    })

        return jsonify({'logs': logs[-lines:]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pm2/start/<process_name>', methods=['POST'])
@pm2_auth_required
def pm2_start_process(process_name):
    """Start a PM2 process"""
    if not _valid_pm2_name(process_name):
        return jsonify({'error': 'Invalid process name'}), 400
    try:
        result = subprocess.run(
            ['pm2', 'start', process_name],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            return jsonify({'error': result.stderr or 'Failed to start process'}), 500

        return jsonify({'success': True, 'message': f'Process {process_name} started'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pm2/stop/<process_name>', methods=['POST'])
@pm2_auth_required
def pm2_stop_process(process_name):
    """Stop a PM2 process"""
    if not _valid_pm2_name(process_name):
        return jsonify({'error': 'Invalid process name'}), 400
    try:
        result = subprocess.run(
            ['pm2', 'stop', process_name],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            return jsonify({'error': result.stderr or 'Failed to stop process'}), 500

        return jsonify({'success': True, 'message': f'Process {process_name} stopped'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pm2/restart/<process_name>', methods=['POST'])
@pm2_auth_required
def pm2_restart_process(process_name):
    """Restart a PM2 process"""
    if not _valid_pm2_name(process_name):
        return jsonify({'error': 'Invalid process name'}), 400
    try:
        result = subprocess.run(
            ['pm2', 'restart', process_name],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            return jsonify({'error': result.stderr or 'Failed to restart process'}), 500

        return jsonify({'success': True, 'message': f'Process {process_name} restarted'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/pm2/reset/<process_name>', methods=['POST'])
@pm2_auth_required
def pm2_reset_process(process_name):
    """Reset PM2 process counters (restart count, etc.)"""
    if not _valid_pm2_name(process_name):
        return jsonify({'error': 'Invalid process name'}), 400
    try:
        result = subprocess.run(
            ['pm2', 'reset', process_name],
            capture_output=True,
            text=True,
            timeout=30
        )

        if result.returncode != 0:
            return jsonify({'error': result.stderr or 'Failed to reset process'}), 500

        return jsonify({'success': True, 'message': f'Process {process_name} counters reset'})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Keraplast Password Management API (PM2 dashboard)
@app.route('/api/pm2/keraplast/passwords', methods=['GET'])
@pm2_auth_required
def pm2_get_keraplast_passwords():
    """Get all keraplast passwords"""
    data = load_keraplast_passwords()
    return jsonify(data)

@app.route('/api/pm2/keraplast/passwords', methods=['POST'])
@pm2_auth_required
def pm2_create_keraplast_password():
    """Create a keraplast password"""
    req_data = request.get_json()
    password = req_data.get('password', '').strip()
    label = req_data.get('label', '').strip()
    role = req_data.get('role', 'user').strip()
    if role not in ('admin', 'user'):
        role = 'user'

    if not password:
        return jsonify({'error': 'Password is required'}), 400

    data = load_keraplast_passwords()

    for p in data.get('passwords', []):
        if p['password'] == password:
            return jsonify({'error': 'Password already exists'}), 400

    data['passwords'].append({
        'password': password,
        'label': label,
        'role': role,
        'created_at': time.time()
    })

    save_keraplast_passwords(data)
    return jsonify({'success': True, 'message': f'Password created for {label or "unnamed"}'})

@app.route('/api/pm2/keraplast/passwords/<password>', methods=['DELETE'])
@pm2_auth_required
def pm2_delete_keraplast_password(password):
    """Delete a keraplast password"""
    data = load_keraplast_passwords()
    original_count = len(data.get('passwords', []))
    data['passwords'] = [p for p in data.get('passwords', []) if p['password'] != password]

    if len(data['passwords']) == original_count:
        return jsonify({'error': 'Password not found'}), 404

    save_keraplast_passwords(data)
    return jsonify({'success': True, 'message': 'Password deleted'})

# Whitelist Management API (for Discord bot integration)
@app.route('/api/pm2/whitelist', methods=['GET'])
@pm2_auth_required
def pm2_get_whitelist():
    """Get the current whitelist"""
    whitelist = load_pm2_whitelist()
    return jsonify(whitelist)

@app.route('/api/pm2/whitelist/add', methods=['POST'])
@pm2_auth_required
def pm2_add_to_whitelist():
    """Add a user to the whitelist"""
    data = request.get_json()
    if not data or 'user_id' not in data:
        return jsonify({'error': 'User ID is required'}), 400

    whitelist = load_pm2_whitelist()
    user_id = str(data['user_id'])

    if user_id not in whitelist['allowed_users']:
        whitelist['allowed_users'].append(user_id)
        save_pm2_whitelist(whitelist)

    return jsonify({'success': True, 'message': f'User {user_id} added to whitelist'})

@app.route('/api/pm2/whitelist/remove', methods=['POST'])
@pm2_auth_required
def pm2_remove_from_whitelist():
    """Remove a user from the whitelist"""
    data = request.get_json()
    if not data or 'user_id' not in data:
        return jsonify({'error': 'User ID is required'}), 400

    whitelist = load_pm2_whitelist()
    user_id = str(data['user_id'])

    # Don't allow removing yourself
    if user_id == session['pm2_user']['id']:
        return jsonify({'error': 'Cannot remove yourself from whitelist'}), 400

    if user_id in whitelist['allowed_users']:
        whitelist['allowed_users'].remove(user_id)
        save_pm2_whitelist(whitelist)

    return jsonify({'success': True, 'message': f'User {user_id} removed from whitelist'})

# Bot API endpoint for whitelist management (uses API key)
@app.route('/api/pm2/bot/whitelist/add', methods=['POST'])
def pm2_bot_add_whitelist():
    """Add user to whitelist via bot (requires API key)"""
    api_key = request.headers.get('X-API-Key')
    config = load_pm2_config()

    if not api_key or api_key != config.get('bot_api_key'):
        return jsonify({'error': 'Invalid API key'}), 401

    data = request.get_json()
    if not data or 'user_id' not in data:
        return jsonify({'error': 'User ID is required'}), 400

    whitelist = load_pm2_whitelist()
    user_id = str(data['user_id'])
    username = data.get('username', 'Unknown')

    if user_id not in whitelist['allowed_users']:
        whitelist['allowed_users'].append(user_id)
        save_pm2_whitelist(whitelist)
        return jsonify({'success': True, 'message': f'User {username} ({user_id}) added to whitelist'})

    return jsonify({'success': True, 'message': f'User {username} ({user_id}) already whitelisted'})

@app.route('/api/pm2/bot/whitelist/remove', methods=['POST'])
def pm2_bot_remove_whitelist():
    """Remove user from whitelist via bot (requires API key)"""
    api_key = request.headers.get('X-API-Key')
    config = load_pm2_config()

    if not api_key or api_key != config.get('bot_api_key'):
        return jsonify({'error': 'Invalid API key'}), 401

    data = request.get_json()
    if not data or 'user_id' not in data:
        return jsonify({'error': 'User ID is required'}), 400

    whitelist = load_pm2_whitelist()
    user_id = str(data['user_id'])

    if user_id in whitelist['allowed_users']:
        whitelist['allowed_users'].remove(user_id)
        save_pm2_whitelist(whitelist)
        return jsonify({'success': True, 'message': f'User {user_id} removed from whitelist'})

    return jsonify({'success': False, 'message': f'User {user_id} not in whitelist'})

@app.route('/api/pm2/bot/whitelist', methods=['GET'])
def pm2_bot_get_whitelist():
    """Get whitelist via bot (requires API key)"""
    api_key = request.headers.get('X-API-Key')
    config = load_pm2_config()

    if not api_key or api_key != config.get('bot_api_key'):
        return jsonify({'error': 'Invalid API key'}), 401

    whitelist = load_pm2_whitelist()
    return jsonify(whitelist)

# ==================== APP WHITELIST API ====================

@app.route('/api/admin/app-whitelist/<app_name>', methods=['GET'])
@pm2_auth_required
def admin_get_app_whitelist(app_name):
    if app_name not in _APP_WHITELIST_VALID:
        return jsonify({'error': 'Unknown app'}), 400
    data = load_app_whitelist()
    return jsonify({'allowed_users': data.get(app_name, {}).get('allowed_users', [])})

@app.route('/api/admin/app-whitelist/<app_name>/add', methods=['POST'])
@pm2_auth_required
def admin_add_app_whitelist(app_name):
    if app_name not in _APP_WHITELIST_VALID:
        return jsonify({'error': 'Unknown app'}), 400
    body = request.get_json(silent=True) or {}
    user_id = str(body.get('user_id', '')).strip()
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    data = load_app_whitelist()
    data.setdefault(app_name, {'allowed_users': []})
    if user_id not in data[app_name]['allowed_users']:
        data[app_name]['allowed_users'].append(user_id)
        save_app_whitelist(data)
    return jsonify({'success': True, 'allowed_users': data[app_name]['allowed_users']})

@app.route('/api/admin/app-whitelist/<app_name>/remove', methods=['POST'])
@pm2_auth_required
def admin_remove_app_whitelist(app_name):
    if app_name not in _APP_WHITELIST_VALID:
        return jsonify({'error': 'Unknown app'}), 400
    body = request.get_json(silent=True) or {}
    user_id = str(body.get('user_id', '')).strip()
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400
    data = load_app_whitelist()
    data.setdefault(app_name, {'allowed_users': []})
    if user_id in data[app_name]['allowed_users']:
        data[app_name]['allowed_users'].remove(user_id)
        save_app_whitelist(data)
    return jsonify({'success': True, 'allowed_users': data[app_name]['allowed_users']})

# ==================== ADMIN API ENDPOINTS ====================

# Admin Links Management
@app.route('/api/admin/links', methods=['GET'])
@pm2_auth_required
def admin_get_links():
    """Get all shortened links for admin"""
    links = load_links()
    links_list = []
    for code, data in links.items():
        link_info = {
            'code': code,
            'url': data.get('url', ''),
            'created_by': data.get('created_by', 'Unknown'),
            'created_at': data.get('created_at', ''),
            'clicks': data.get('clicks', 0),
            'last_accessed': data.get('last_accessed', '')
        }
        links_list.append(link_info)
    return jsonify({'links': links_list})

@app.route('/api/admin/links/<code>', methods=['GET'])
@pm2_auth_required
def admin_get_link(code):
    """Get single link details"""
    links = load_links()
    if code in links:
        return jsonify({'link': {**links[code], 'code': code}})
    return jsonify({'error': 'Link not found'}), 404

@app.route('/api/admin/links/<code>', methods=['DELETE'])
@pm2_auth_required
def admin_delete_link(code):
    """Delete a shortened link"""
    links = load_links()
    if code in links:
        del links[code]
        save_links(links)
        return jsonify({'success': True, 'message': f'Link {code} deleted'})
    return jsonify({'error': 'Link not found'}), 404

# Admin Features Management
@app.route('/api/admin/features', methods=['GET'])
@pm2_auth_required
def admin_get_features():
    """Get all features and their status"""
    disabled = load_disabled_features()

    # Define all available features
    all_features = [
        # Tools
        {'id': 'color-picker', 'name': 'Color Picker', 'description': 'Color selection and palette tool'},
        {'id': 'qr-generator', 'name': 'QR Generator', 'description': 'QR code generator'},
        {'id': 'text-tools', 'name': 'Text Tools', 'description': 'Text manipulation tools'},
        {'id': 'image-editor', 'name': 'Image Editor', 'description': 'Image editing and processing'},
        {'id': 'file-converter', 'name': 'File Converter', 'description': 'File format conversion'},
        {'id': 'pdf-tools', 'name': 'PDF Tools', 'description': 'PDF manipulation tools'},
        {'id': 'unit-converter', 'name': 'Unit Converter', 'description': 'Unit conversion tool'},
        {'id': 'timestamp-converter', 'name': 'Timestamp Converter', 'description': 'Unix timestamp converter'},
        {'id': 'countdown-maker', 'name': 'Countdown Maker', 'description': 'Create countdown timers'},
        {'id': 'video-compressor', 'name': 'Video Compressor', 'description': 'Compress video files'},
        {'id': 'resume-builder', 'name': 'Resume Builder', 'description': 'Build and export resumes'},
        {'id': 'json-formatter', 'name': 'JSON Formatter', 'description': 'JSON formatting and validation'},
        {'id': 'wheel-spinner', 'name': 'Wheel Spinner', 'description': 'Random wheel spinner'},
        {'id': 'random-picker', 'name': 'Random Picker', 'description': 'Pick random items from a list'},
        {'id': 'calculator-suite', 'name': 'Calculator Suite', 'description': 'Collection of calculators'},
        {'id': 'password-generator', 'name': 'Password Generator', 'description': 'Secure password generator'},
        {'id': 'timer-tools', 'name': 'Timer Tools', 'description': 'Stopwatch and timer'},
        {'id': 'world-clock', 'name': 'World Clock', 'description': 'World time zones clock'},
        {'id': 'currency-converter', 'name': 'Currency Converter', 'description': 'Live currency conversion'},
        {'id': 'encoding-tools', 'name': 'Encoding Tools', 'description': 'Base64, URL, and encoding utilities'},
        {'id': 'diff-checker', 'name': 'Diff Checker', 'description': 'Compare text differences'},
        {'id': 'regex-tester', 'name': 'Regex Tester', 'description': 'Regular expression tester'},
        {'id': 'code-minifier', 'name': 'Code Minifier', 'description': 'Minify HTML, CSS, JS'},
        {'id': 'markdown-editor', 'name': 'Markdown Editor', 'description': 'Markdown editor with preview'},
        {'id': 'notepad', 'name': 'Notepad', 'description': 'Online notepad with sync'},
        {'id': 'invoice-generator', 'name': 'Invoice Generator', 'description': 'Generate PDF invoices'},
        {'id': 'audio-trimmer', 'name': 'Audio Trimmer', 'description': 'Trim and edit audio files'},
        {'id': 'multi-twitch', 'name': 'Multi Twitch', 'description': 'Watch multiple Twitch streams'},
        {'id': 'sticky-board', 'name': 'Sticky Board', 'description': 'Collaborative sticky notes board'},
        {'id': 'link-shortener', 'name': 'Link Shortener', 'description': 'URL shortening service'},
        # Bots / Services
        {'id': 'cubreactive', 'name': 'CubReactive', 'description': 'Discord reactive images for streamers'},
        {'id': 'cubpresence', 'name': 'CubPresence', 'description': 'Discord custom rich presence from your browser'},
        {'id': 'cleanme', 'name': 'CleanMe', 'description': 'Discord bot management'},
        {'id': 'cubassist', 'name': 'CubAssist', 'description': 'Twitch bot dashboard and management'},
        {'id': 'stream-overlays', 'name': 'Stream Overlays', 'description': 'OBS stream overlays and scenes'},
        {'id': 'admin-dashboard', 'name': 'Admin Dashboard', 'description': 'Admin control panel'},
    ]

    # Add status to each feature
    for feature in all_features:
        feature['enabled'] = feature['id'] not in disabled

    return jsonify({'features': all_features})

@app.route('/api/admin/features/enable', methods=['POST'])
@pm2_auth_required
def admin_enable_feature():
    """Enable a feature"""
    data = request.get_json()
    if not data or 'feature' not in data:
        return jsonify({'error': 'Feature ID is required'}), 400

    feature_id = data['feature']
    disabled = load_disabled_features()

    if feature_id in disabled:
        disabled.remove(feature_id)
        save_disabled_features(disabled)
        return jsonify({'success': True, 'message': f'Feature {feature_id} enabled'})

    return jsonify({'success': True, 'message': f'Feature {feature_id} was already enabled'})

@app.route('/api/admin/features/disable', methods=['POST'])
@pm2_auth_required
def admin_disable_feature():
    """Disable a feature"""
    data = request.get_json()
    if not data or 'feature' not in data:
        return jsonify({'error': 'Feature ID is required'}), 400

    feature_id = data['feature']
    disabled = load_disabled_features()

    if feature_id not in disabled:
        disabled.append(feature_id)
        save_disabled_features(disabled)
        return jsonify({'success': True, 'message': f'Feature {feature_id} disabled'})

    return jsonify({'success': True, 'message': f'Feature {feature_id} was already disabled'})

def save_disabled_features(features):
    """Save disabled features to file"""
    os.makedirs(os.path.dirname(DISABLED_FEATURES_FILE), exist_ok=True)
    with open(DISABLED_FEATURES_FILE, 'w') as f:
        json.dump(features, f, indent=2)

# Admin IP Bans Management
@app.route('/api/admin/ipbans', methods=['GET'])
@pm2_auth_required
def admin_get_ip_bans():
    """Get all IP bans"""
    clean_expired_temp_bans()
    bans = load_ip_bans()
    return jsonify({'bans': bans})

@app.route('/api/admin/ipbans/add', methods=['POST'])
@pm2_auth_required
def admin_add_ip_ban():
    """Add a permanent IP ban (global or feature-specific)"""
    data = request.get_json()
    if not data or 'ip' not in data:
        return jsonify({'error': 'IP address is required'}), 400

    ip = data['ip']
    ban_type = data.get('type', 'global')
    feature = data.get('feature')
    reason = data.get('reason', 'Banned by admin')

    bans = load_ip_bans()

    if ban_type == 'global':
        # Check if IP already globally banned
        existing = [b for b in bans['global'] if b['ip'] == ip]
        if not existing:
            bans['global'].append({'ip': ip, 'reason': reason})
    elif ban_type == 'feature' and feature:
        if feature not in bans.get('features', {}):
            bans['features'][feature] = []
        existing = [b for b in bans['features'][feature] if b['ip'] == ip]
        if not existing:
            bans['features'][feature].append({'ip': ip, 'reason': reason})

    save_ip_bans(bans)
    return jsonify({'success': True, 'message': f'IP {ip} banned'})

@app.route('/api/admin/ipbans/temp', methods=['POST'])
@pm2_auth_required
def admin_add_temp_ip_ban():
    """Add a temporary IP ban"""
    data = request.get_json()
    if not data or 'ip' not in data:
        return jsonify({'error': 'IP address is required'}), 400

    ip = data['ip']
    duration = data.get('duration', 3600)  # Default 1 hour
    reason = data.get('reason', 'Temporary ban by admin')
    feature = data.get('feature')

    bans = load_ip_bans()

    # Ensure temp list exists (for backwards compatibility with old ip_bans.json files)
    if 'temp' not in bans:
        bans['temp'] = []

    # Remove existing temp ban for this IP if any
    bans['temp'] = [b for b in bans['temp'] if b['ip'] != ip]

    # Add new temp ban
    temp_ban = {
        'ip': ip,
        'expires': time.time() + duration,
        'reason': reason
    }
    if feature:
        temp_ban['feature'] = feature

    bans['temp'].append(temp_ban)

    save_ip_bans(bans)
    return jsonify({'success': True, 'message': f'IP {ip} temporarily banned for {duration} seconds'})

@app.route('/api/admin/ipbans/remove', methods=['POST'])
@pm2_auth_required
def admin_remove_ip_ban():
    """Remove an IP ban"""
    data = request.get_json()
    if not data or 'ip' not in data:
        return jsonify({'error': 'IP address is required'}), 400

    ip = data['ip']
    ban_type = data.get('type', 'global')
    feature = data.get('feature')

    bans = load_ip_bans()
    removed = False

    if ban_type == 'global':
        original_len = len(bans.get('global', []))
        bans['global'] = [b for b in bans.get('global', []) if b['ip'] != ip]
        removed = len(bans['global']) < original_len
    elif ban_type == 'feature' and feature:
        if feature in bans.get('features', {}):
            original_len = len(bans['features'][feature])
            bans['features'][feature] = [b for b in bans['features'][feature] if b['ip'] != ip]
            removed = len(bans['features'][feature]) < original_len
    elif ban_type == 'temp':
        original_len = len(bans.get('temp', []))
        bans['temp'] = [b for b in bans.get('temp', []) if b['ip'] != ip]
        removed = len(bans['temp']) < original_len

    if removed:
        save_ip_bans(bans)
        return jsonify({'success': True, 'message': f'IP {ip} unbanned'})

    return jsonify({'success': False, 'message': f'IP {ip} was not banned'})

# ==================== API STATUS ENDPOINT ====================
_server_start_time = datetime.utcnow()
_endpoint_health = {}  # {endpoint_name: {'last_status': 200, 'last_called': timestamp, 'last_error': None}}

@app.after_request
def track_endpoint_health(response):
    """Track health of every endpoint based on actual responses"""
    import time as _time
    endpoint = request.endpoint
    if endpoint and endpoint != 'static':
        status = response.status_code
        _endpoint_health[endpoint] = {
            'last_status': status,
            'last_called': _time.time(),
            'healthy': status < 500,
        }
    return response

@app.route('/api/admin/api-status', methods=['GET'])
@pm2_auth_required
def admin_api_status():
    """List all API endpoints with status and server uptime"""
    import time as _time
    now = _time.time()
    uptime_seconds = int((datetime.utcnow() - _server_start_time).total_seconds())

    # Discover all routes
    endpoints = []
    for rule in app.url_map.iter_rules():
        # Skip static files and internal routes
        if rule.endpoint == 'static' or rule.rule.startswith('/static'):
            continue
        methods = sorted(rule.methods - {'HEAD', 'OPTIONS'})
        if not methods:
            continue

        health = _endpoint_health.get(rule.endpoint)
        if health:
            last_called = health['last_called']
            last_status_code = health['last_status']
            # Red only if last call was a 500+ error within the last 10 minutes
            if not health['healthy'] and (now - last_called) < 600:
                status = 'error'
            else:
                status = 'online'
        else:
            # Server is up, route is registered = online
            status = 'online'
            last_called = None
            last_status_code = None

        endpoints.append({
            'path': rule.rule,
            'methods': methods,
            'endpoint': rule.endpoint,
            'status': status,
            'last_called': last_called,
            'last_status_code': last_status_code,
        })

    # Sort by path
    endpoints.sort(key=lambda e: e['path'])

    # Group by service
    categories = {}
    for ep in endpoints:
        path = ep['path']
        if path.startswith('/overlays'):
            cat = 'Stream Overlays'
        elif path.startswith('/cub-protector') or path.startswith('/api/cub-protector'):
            cat = 'CUB PROTECTOR'
        elif path.startswith('/cleanme') or path.startswith('/api/cleanme'):
            cat = 'CleanMe'
        elif path.startswith('/apps/cubreactive') or path.startswith('/api/cubreactive') or path.startswith('/cub-reactive'):
            cat = 'CubReactive'
        elif path.startswith('/apps/cubpresence') or path.startswith('/api/cubpresence'):
            cat = 'CubPresence'
        elif path.startswith('/dashboard') or path.startswith('/admin') or path.startswith('/api/admin'):
            cat = 'Admin Dashboard'
        elif path.startswith('/bot-dashboard') or path.startswith('/api/bot'):
            cat = 'Bot Dashboard'
        elif path.startswith('/affiliate') or path.startswith('/api/affiliate'):
            cat = 'Affiliate Program'
        elif path.startswith('/keraplast') or path.startswith('/api/keraplast'):
            cat = 'Keraplast'
        elif path.startswith('/apps/') or path.startswith('/api/'):
            cat = 'CUB SOFTWARE Tools'
        else:
            cat = 'CUB SOFTWARE Website'
        ep['category'] = cat
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(ep)

    online = sum(1 for e in endpoints if e['status'] == 'online')
    errored = sum(1 for e in endpoints if e['status'] == 'error')
    idle = sum(1 for e in endpoints if e['status'] == 'idle')

    return jsonify({
        'endpoints': endpoints,
        'categories': categories,
        'total': len(endpoints),
        'online': online,
        'errored': errored,
        'idle': idle,
        'uptime_seconds': uptime_seconds,
        'server_start': _server_start_time.isoformat() + 'Z'
    })

# IP Ban Middleware - check on every request
@app.before_request
def enforce_ip_bans():
    """Check if the requesting IP is banned before processing"""
    # Skip for: static files, admin API (so admins can unban), report page, ban appeal,
    # account management, and login/logout (so banned users can only reach ban page + account)
    _ban_allowed = ('/static/', '/api/admin/', '/api/pm2/', '/report', '/ban-appeal',
                    '/account', '/logout', '/login')
    if any(request.path.startswith(p) for p in _ban_allowed):
        return None

    maybe_clean_bans()
    client_ip = get_client_ip()

    # Determine the feature from the path
    feature = None
    if '/apps/' in request.path:
        parts = request.path.split('/apps/')
        if len(parts) > 1:
            feature = parts[1].split('/')[0]

    is_banned, ban_type, reason, expires = check_ip_ban(client_ip, feature)

    if is_banned:
        if request.is_json or request.path.startswith('/api/'):
            return jsonify({
                'error': 'Access denied',
                'reason': reason,
                'ban_type': ban_type,
                'expires': expires
            }), 403
        else:
            return render_template('banned.html',
                                 reason=reason,
                                 ban_type=ban_type,
                                 expires=expires), 403

    return None

# Blueprint feature enforcement - block direct URL access when feature is disabled
@app.before_request
def enforce_blueprint_features():
    """Block access to CubAssist and Stream Overlays when disabled via admin features panel"""
    path = request.path

    # Skip static files and admin/auth routes so admins can always re-enable
    if path.startswith('/static/') or path.startswith('/api/admin/') or path.startswith('/api/pm2/') or path.startswith('/dashboard'):
        return None

    # Map URL prefixes to feature IDs
    blueprint_feature_map = [
        ('/cubassist/login', None),        # Always allow login/auth (no block)
        ('/cubassist/logout', None),
        ('/cubassist', 'cubassist'),
        ('/overlays/auth', None),          # Always allow OAuth callbacks
        ('/overlays/twitch/webhook', None), # Always allow EventSub webhooks
        ('/overlays/source/', None),        # Always allow OBS browser source URLs
        ('/overlays/alerts/', None),        # Always allow OBS alert overlay URLs
        ('/overlays', 'stream-overlays'),
    ]

    for prefix, feature_id in blueprint_feature_map:
        if path.startswith(prefix):
            if feature_id and is_feature_disabled(feature_id):
                if request.is_json or path.startswith('/api/'):
                    return jsonify({
                        'error': 'Feature disabled',
                        'feature': feature_id,
                        'message': 'This feature is currently disabled for maintenance.'
                    }), 503
                return render_template('feature-disabled.html', feature=feature_id), 503
            break  # First matching prefix wins

    return None

# ==================== BOT DASHBOARD - HIDDEN ADMIN PANEL ====================

BOT_DASHBOARD_WHITELIST_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'bot_dashboard_whitelist.json')
BOT_DASHBOARD_DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'bot_dashboard_data.json')
BOT_DASHBOARD_DMS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'bot_dashboard_dms.json')
BOT_DASHBOARD_REDIRECT_URI = os.environ.get('BOT_DASHBOARD_REDIRECT_URI', 'https://cubsoftware.site/bot-dashboard/auth/callback')

def load_bot_dashboard_whitelist():
    """Load the whitelist of allowed Discord user IDs"""
    if os.path.exists(BOT_DASHBOARD_WHITELIST_FILE):
        try:
            with open(BOT_DASHBOARD_WHITELIST_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    # Default whitelist with owner ID
    return {'allowed_users': ['378501056008683530']}

def save_bot_dashboard_whitelist(data):
    """Save the whitelist"""
    os.makedirs(os.path.dirname(BOT_DASHBOARD_WHITELIST_FILE), exist_ok=True)
    with open(BOT_DASHBOARD_WHITELIST_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_bot_dashboard_data():
    """Load saved bot configurations"""
    if os.path.exists(BOT_DASHBOARD_DATA_FILE):
        try:
            with open(BOT_DASHBOARD_DATA_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'bots': {}}

def save_bot_dashboard_data(data):
    """Save bot configurations"""
    os.makedirs(os.path.dirname(BOT_DASHBOARD_DATA_FILE), exist_ok=True)
    with open(BOT_DASHBOARD_DATA_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_bot_dashboard_dms():
    """Load tracked DM conversations"""
    if os.path.exists(BOT_DASHBOARD_DMS_FILE):
        try:
            with open(BOT_DASHBOARD_DMS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_bot_dashboard_dms(dms_data):
    """Save tracked DM conversations"""
    os.makedirs(os.path.dirname(BOT_DASHBOARD_DMS_FILE), exist_ok=True)
    with open(BOT_DASHBOARD_DMS_FILE, 'w') as f:
        json.dump(dms_data, f, indent=2)

def track_dm_conversation(bot_id, channel_id, user_id, username, global_name, avatar_hash):
    """Track a DM conversation locally so it persists"""
    dms_data = load_bot_dashboard_dms()
    if bot_id not in dms_data:
        dms_data[bot_id] = {}
    dms_data[bot_id][user_id] = {
        'channel_id': channel_id,
        'user_id': user_id,
        'username': username,
        'global_name': global_name,
        'avatar_hash': avatar_hash,
        'last_message_at': int(time.time())
    }
    save_bot_dashboard_dms(dms_data)

def bot_dashboard_auth_required(f):
    """Decorator to require bot dashboard authentication and whitelist"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = session.get('bot_dashboard_user')
        if not user:
            if request.is_json or request.path.startswith('/api/bot-dashboard/'):
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(f'/login?next={urllib.parse.quote(request.path)}')

        # Check whitelist
        whitelist = load_bot_dashboard_whitelist()
        if user['id'] not in whitelist.get('allowed_users', []):
            if request.is_json or request.path.startswith('/api/bot-dashboard/'):
                return jsonify({'error': 'Access denied - not whitelisted'}), 403
            return render_template('bot-dashboard-denied.html', user=user), 403

        # Check bot ownership - if route has a bot_id, verify the user owns it
        bot_id = kwargs.get('bot_id')
        if bot_id:
            data = load_bot_dashboard_data()
            bot = data.get('bots', {}).get(bot_id)
            if bot and bot.get('added_by') and bot['added_by'] != user['id']:
                return jsonify({'error': 'Access denied - you do not own this bot'}), 403

        ip = get_client_ip()
        allowed, retry_after = check_rate_limit(ip, 'dashboard')
        if not allowed:
            return jsonify({'error': 'Rate limit exceeded', 'retry_after': int(retry_after)}), 429
        return f(*args, **kwargs)
    return decorated_function

# Bot Dashboard OAuth — unified login handles everything
@app.route('/bot-dashboard/auth/discord')
def bot_dashboard_auth():
    return redirect('/login?next=/bot-dashboard')

@app.route('/bot-dashboard/auth/callback')
def bot_dashboard_callback():
    """Legacy callback — no longer used."""
    return redirect('/login?next=/bot-dashboard')

@app.route('/bot-dashboard/auth/logout')
def bot_dashboard_logout():
    session.pop('bot_dashboard_user', None)
    return redirect('/logout')

# Bot Dashboard Main Routes
@app.route('/bot-dashboard')
@app.route('/bot-dashboard/')
@bot_dashboard_auth_required
def bot_dashboard_home():
    """Bot Dashboard - Main page"""
    user = session.get('bot_dashboard_user')
    data = load_bot_dashboard_data()
    return render_template('bot-dashboard.html', user=user, bots=data.get('bots', {}))

# Bot Dashboard API Routes
@app.route('/api/bot-dashboard/bots', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_list_bots():
    """List bots owned by the current user"""
    user = session.get('bot_dashboard_user')
    data = load_bot_dashboard_data()
    # Only show bots added by the current user (or all if user is the primary admin)
    bots = {}
    for bot_id, bot in data.get('bots', {}).items():
        if bot.get('added_by') == user['id'] or not bot.get('added_by'):
            bots[bot_id] = {
                'id': bot_id,
                'name': bot.get('name', 'Unknown Bot'),
                'token_masked': bot.get('token', '')[:10] + '...' if bot.get('token') else '',
                'added_by': bot.get('added_by'),
                'added_at': bot.get('added_at'),
                'status': bot.get('status', 'unknown')
            }
    return jsonify({'bots': bots})

@app.route('/api/bot-dashboard/bots', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_add_bot():
    """Add a new bot"""
    user = session.get('bot_dashboard_user')
    req_data = request.get_json()

    token = req_data.get('token', '').strip()
    name = req_data.get('name', '').strip()

    if not token:
        return jsonify({'error': 'Bot token is required'}), 400

    # Validate token by making a request to Discord API
    try:
        bot_response = requests.get('https://discord.com/api/users/@me',
            headers={'Authorization': f'Bot {token}'})

        if bot_response.status_code != 200:
            return jsonify({'error': 'Invalid bot token'}), 400

        bot_info = bot_response.json()
        bot_id = bot_info['id']
        bot_name = name or bot_info.get('username', 'Unknown Bot')

        # Get bot avatar
        avatar_hash = bot_info.get('avatar')
        if avatar_hash:
            bot_avatar = f"https://cdn.discordapp.com/avatars/{bot_id}/{avatar_hash}.png?size=256"
        else:
            bot_avatar = f"https://cdn.discordapp.com/embed/avatars/0.png"

        # Get application ID
        application_id = bot_id  # Default: same as bot user ID
        try:
            app_response = requests.get('https://discord.com/api/applications/@me',
                headers={'Authorization': f'Bot {token}'})
            if app_response.status_code == 200:
                app_info = app_response.json()
                application_id = app_info.get('id', bot_id)
        except:
            pass

    except Exception as e:
        return jsonify({'error': f'Failed to validate token: {str(e)}'}), 400

    # Save the bot
    data = load_bot_dashboard_data()
    if 'bots' not in data:
        data['bots'] = {}

    data['bots'][bot_id] = {
        'name': bot_name,
        'token': token,
        'avatar': bot_avatar,
        'application_id': application_id,
        'added_by': user['id'],
        'added_at': time.time(),
        'status': 'configured'
    }

    save_bot_dashboard_data(data)

    return jsonify({
        'success': True,
        'bot': {
            'id': bot_id,
            'name': bot_name,
            'avatar': bot_avatar,
            'application_id': application_id,
            'invite_url': f"https://discord.com/oauth2/authorize?client_id={application_id}&permissions=8&scope=bot%20applications.commands"
        }
    })

@app.route('/api/bot-dashboard/bots/<bot_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_remove_bot(bot_id):
    """Remove a bot"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    del data['bots'][bot_id]
    save_bot_dashboard_data(data)

    return jsonify({'success': True})

@app.route('/api/bot-dashboard/bots/<bot_id>/info', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_bot_info(bot_id):
    """Get detailed bot info from Discord API"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # Get bot user info
        bot_response = requests.get('https://discord.com/api/users/@me',
            headers={'Authorization': f'Bot {token}'})

        if bot_response.status_code != 200:
            return jsonify({'error': 'Failed to get bot info', 'status': 'offline'})

        bot_info = bot_response.json()

        # Get guilds the bot is in
        guilds_response = requests.get('https://discord.com/api/users/@me/guilds',
            headers={'Authorization': f'Bot {token}'})

        guilds = []
        if guilds_response.status_code == 200:
            guilds = guilds_response.json()

        # Get application ID
        application_id = bot.get('application_id', bot_id)
        try:
            app_response = requests.get('https://discord.com/api/applications/@me',
                headers={'Authorization': f'Bot {token}'})
            if app_response.status_code == 200:
                app_info = app_response.json()
                application_id = app_info.get('id', bot_id)
                # Update stored application_id if missing
                if not bot.get('application_id'):
                    data['bots'][bot_id]['application_id'] = application_id
                    save_bot_dashboard_data(data)
        except:
            pass

        return jsonify({
            'id': bot_info['id'],
            'username': bot_info.get('username'),
            'discriminator': bot_info.get('discriminator'),
            'avatar': bot_info.get('avatar'),
            'bot': bot_info.get('bot', True),
            'guilds': len(guilds),
            'guild_list': [{'id': g['id'], 'name': g['name'], 'icon': g.get('icon')} for g in guilds[:50]],
            'status': 'online',
            'application_id': application_id,
            'invite_url': f"https://discord.com/oauth2/authorize?client_id={application_id}&permissions=8&scope=bot%20applications.commands"
        })

    except Exception as e:
        return jsonify({'error': str(e), 'status': 'error'})

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_guild_info(bot_id, guild_id):
    """Get guild info for a bot"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # Get guild info
        guild_response = requests.get(f'https://discord.com/api/guilds/{guild_id}',
            headers={'Authorization': f'Bot {token}'})

        if guild_response.status_code != 200:
            return jsonify({'error': 'Failed to get guild info'}), guild_response.status_code

        guild_info = guild_response.json()

        # Get channels
        channels_response = requests.get(f'https://discord.com/api/guilds/{guild_id}/channels',
            headers={'Authorization': f'Bot {token}'})

        channels = []
        if channels_response.status_code == 200:
            channels = channels_response.json()

        return jsonify({
            'id': guild_info['id'],
            'name': guild_info['name'],
            'icon': guild_info.get('icon'),
            'owner_id': guild_info.get('owner_id'),
            'member_count': guild_info.get('approximate_member_count'),
            'channels': [{'id': c['id'], 'name': c['name'], 'type': c['type']} for c in channels]
        })

    except Exception as e:
        return jsonify({'error': str(e)})

@app.route('/api/bot-dashboard/bots/<bot_id>/send-message', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_send_message(bot_id):
    """Send a message as the bot"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    channel_id = req_data.get('channel_id')
    content = req_data.get('content')

    if not channel_id or not content:
        return jsonify({'error': 'channel_id and content are required'}), 400

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/messages',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'content': content}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'message': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/send-dm', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_send_dm(bot_id):
    """Send a DM to a user as the bot"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    user_id = req_data.get('user_id')
    content = req_data.get('content')

    if not user_id or not content:
        return jsonify({'error': 'user_id and content are required'}), 400

    try:
        # First, create a DM channel with the user
        dm_response = requests.post(
            'https://discord.com/api/users/@me/channels',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'recipient_id': user_id}
        )

        if dm_response.status_code not in [200, 201]:
            error_data = dm_response.json()
            return jsonify({'error': f"Failed to create DM channel: {error_data.get('message', 'Unknown error')}"}), dm_response.status_code

        dm_channel = dm_response.json()
        channel_id = dm_channel['id']

        # Now send the message to the DM channel
        msg_response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/messages',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'content': content}
        )

        if msg_response.status_code == 200:
            # Track this DM conversation locally so it shows up in the DM list
            recipients = dm_channel.get('recipients', [])
            if recipients:
                recipient = recipients[0]
                track_dm_conversation(
                    bot_id=bot_id,
                    channel_id=channel_id,
                    user_id=recipient.get('id', user_id),
                    username=recipient.get('username', 'Unknown'),
                    global_name=recipient.get('global_name'),
                    avatar_hash=recipient.get('avatar')
                )
            else:
                # Fallback - store with just user_id
                track_dm_conversation(
                    bot_id=bot_id,
                    channel_id=channel_id,
                    user_id=user_id,
                    username='Unknown',
                    global_name=None,
                    avatar_hash=None
                )
            return jsonify({'success': True, 'message': msg_response.json()})
        else:
            error_data = msg_response.json()
            return jsonify({'error': f"Failed to send message: {error_data.get('message', 'Unknown error')}"}), msg_response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/members', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_guild_members(bot_id, guild_id):
    """Get members of a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # Get guild members (limit 1000)
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/members?limit=1000',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get members'}), response.status_code

        members = response.json()

        # Format member data
        formatted_members = []
        for m in members:
            user = m.get('user', {})
            avatar = None
            if user.get('avatar'):
                avatar = f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.png"
            else:
                # Default avatar
                discriminator = int(user.get('discriminator', '0') or '0')
                avatar = f"https://cdn.discordapp.com/embed/avatars/{discriminator % 5}.png"

            formatted_members.append({
                'id': user.get('id'),
                'username': user.get('username'),
                'global_name': user.get('global_name'),
                'avatar': avatar,
                'nick': m.get('nick'),
                'joined_at': m.get('joined_at'),
                'roles': m.get('roles', [])
            })

        return jsonify({'members': formatted_members})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/channels', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_guild_channels(bot_id, guild_id):
    """Get text channels of a guild that the bot can send messages to"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/channels',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get channels'}), response.status_code

        channels = response.json()

        # Filter to text channels (type 0) and announcement channels (type 5)
        text_channels = [
            {
                'id': c['id'],
                'name': c['name'],
                'type': c['type'],
                'parent_id': c.get('parent_id'),
                'position': c.get('position', 0)
            }
            for c in channels
            if c['type'] in [0, 5]  # 0 = text, 5 = announcement
        ]

        # Sort by position
        text_channels.sort(key=lambda x: x['position'])

        return jsonify({'channels': text_channels})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/dms', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_dms(bot_id):
    """Get all DM channels for a bot - combines Discord API + local tracking"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    # Start with locally tracked DMs (these persist across bot restarts)
    dms_data = load_bot_dashboard_dms()
    tracked_dms = dms_data.get(bot_id, {})

    # Build a dict keyed by user_id to avoid duplicates
    dm_map = {}

    # Add locally tracked DMs first
    for user_id, dm_info in tracked_dms.items():
        avatar = None
        if dm_info.get('avatar_hash'):
            avatar = f"https://cdn.discordapp.com/avatars/{user_id}/{dm_info['avatar_hash']}.png"
        else:
            avatar = f"https://cdn.discordapp.com/embed/avatars/0.png"

        dm_map[user_id] = {
            'channel_id': dm_info['channel_id'],
            'user_id': user_id,
            'username': dm_info.get('username', 'Unknown'),
            'global_name': dm_info.get('global_name'),
            'avatar': avatar,
            'last_message_at': dm_info.get('last_message_at', 0)
        }

    try:
        # Also try to get currently open DM channels from Discord API
        response = requests.get(
            'https://discord.com/api/users/@me/channels',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 200:
            channels = response.json()
            for c in channels:
                if c['type'] == 1:  # DM channel
                    recipients = c.get('recipients', [])
                    if recipients:
                        user = recipients[0]
                        user_id = user.get('id')
                        avatar = None
                        if user.get('avatar'):
                            avatar = f"https://cdn.discordapp.com/avatars/{user_id}/{user['avatar']}.png"
                        else:
                            discriminator = int(user.get('discriminator', '0') or '0')
                            avatar = f"https://cdn.discordapp.com/embed/avatars/{discriminator % 5}.png"

                        # Update or add - Discord API data is fresher
                        dm_map[user_id] = {
                            'channel_id': c['id'],
                            'user_id': user_id,
                            'username': user.get('username'),
                            'global_name': user.get('global_name'),
                            'avatar': avatar,
                            'last_message_at': dm_map.get(user_id, {}).get('last_message_at', 0)
                        }

                        # Also update the local tracking with fresh data
                        track_dm_conversation(
                            bot_id=bot_id,
                            channel_id=c['id'],
                            user_id=user_id,
                            username=user.get('username', 'Unknown'),
                            global_name=user.get('global_name'),
                            avatar_hash=user.get('avatar')
                        )
    except:
        pass  # If Discord API fails, we still have local data

    # Sort by most recent message first
    dm_channels = sorted(dm_map.values(), key=lambda x: x.get('last_message_at', 0), reverse=True)

    # Remove the last_message_at field from response (internal use only)
    for dm in dm_channels:
        dm.pop('last_message_at', None)

    return jsonify({'dms': dm_channels})

@app.route('/api/bot-dashboard/bots/<bot_id>/dms/<channel_id>/messages', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_dm_messages(bot_id, channel_id):
    """Get messages from a DM channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # Get messages from the DM channel
        limit = request.args.get('limit', 50, type=int)
        before = request.args.get('before')

        url = f'https://discord.com/api/channels/{channel_id}/messages?limit={limit}'
        if before:
            url += f'&before={before}'

        response = requests.get(
            url,
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get messages'}), response.status_code

        messages = response.json()

        # Format messages
        formatted_messages = []
        for m in messages:
            author = m.get('author', {})
            avatar = None
            if author.get('avatar'):
                avatar = f"https://cdn.discordapp.com/avatars/{author['id']}/{author['avatar']}.png"
            else:
                discriminator = int(author.get('discriminator', '0') or '0')
                avatar = f"https://cdn.discordapp.com/embed/avatars/{discriminator % 5}.png"

            formatted_messages.append({
                'id': m['id'],
                'content': m.get('content', ''),
                'timestamp': m.get('timestamp'),
                'author': {
                    'id': author.get('id'),
                    'username': author.get('username'),
                    'global_name': author.get('global_name'),
                    'avatar': avatar,
                    'bot': author.get('bot', False)
                },
                'attachments': m.get('attachments', []),
                'embeds': m.get('embeds', [])
            })

        # Reverse to show oldest first
        formatted_messages.reverse()

        return jsonify({'messages': formatted_messages})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/bot-dashboard/dms/<bot_id>/<channel_id>')
@bot_dashboard_auth_required
def bot_dashboard_dm_conversation(bot_id, channel_id):
    """View DM conversation with a user"""
    user = session.get('bot_dashboard_user')
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return render_template('404.html'), 404

    bot = data['bots'][bot_id]

    return render_template('bot-dashboard-dm.html',
                          user=user,
                          bot_id=bot_id,
                          bot_name=bot.get('name', 'Unknown Bot'),
                          channel_id=channel_id)

# ==================== BOT DASHBOARD - EMBED BUILDER ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/send-embed', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_send_embed(bot_id):
    """Send an embed message to a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    channel_id = req_data.get('channel_id')
    embed = req_data.get('embed', {})
    content = req_data.get('content', '')

    if not channel_id:
        return jsonify({'error': 'channel_id is required'}), 400

    try:
        payload = {'embeds': [embed]}
        if content:
            payload['content'] = content

        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/messages',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'message': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - EDIT/DELETE MESSAGES ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/messages/<channel_id>/<message_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_edit_message(bot_id, channel_id, message_id):
    """Edit a message sent by the bot"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    content = req_data.get('content')
    embed = req_data.get('embed')

    payload = {}
    if content is not None:
        payload['content'] = content
    if embed is not None:
        payload['embeds'] = [embed] if embed else []

    try:
        response = requests.patch(
            f'https://discord.com/api/channels/{channel_id}/messages/{message_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'message': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/messages/<channel_id>/<message_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_message(bot_id, channel_id, message_id):
    """Delete a message"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/channels/{channel_id}/messages/{message_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - USER LOOKUP ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/users/<user_id>', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_user_lookup(bot_id, user_id):
    """Look up a user by ID"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/users/{user_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'User not found'}), response.status_code

        user = response.json()

        avatar = None
        if user.get('avatar'):
            ext = 'gif' if user['avatar'].startswith('a_') else 'png'
            avatar = f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.{ext}?size=256"
        else:
            discriminator = int(user.get('discriminator', '0') or '0')
            avatar = f"https://cdn.discordapp.com/embed/avatars/{discriminator % 5}.png"

        banner = None
        if user.get('banner'):
            ext = 'gif' if user['banner'].startswith('a_') else 'png'
            banner = f"https://cdn.discordapp.com/banners/{user['id']}/{user['banner']}.{ext}?size=512"

        # Calculate account creation date from snowflake ID
        snowflake = int(user['id'])
        timestamp = ((snowflake >> 22) + 1420070400000) / 1000
        created_at = datetime.fromtimestamp(timestamp).isoformat()

        return jsonify({
            'id': user['id'],
            'username': user.get('username'),
            'global_name': user.get('global_name'),
            'discriminator': user.get('discriminator'),
            'avatar': avatar,
            'banner': banner,
            'banner_color': user.get('banner_color'),
            'accent_color': user.get('accent_color'),
            'bot': user.get('bot', False),
            'system': user.get('system', False),
            'flags': user.get('public_flags', 0),
            'created_at': created_at
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - ROLE MANAGEMENT ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/roles', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_roles(bot_id, guild_id):
    """Get all roles in a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/roles',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get roles'}), response.status_code

        roles = response.json()
        # Sort by position (highest first)
        roles.sort(key=lambda r: r.get('position', 0), reverse=True)

        return jsonify({'roles': [{
            'id': r['id'],
            'name': r['name'],
            'color': r.get('color', 0),
            'position': r.get('position', 0),
            'permissions': r.get('permissions'),
            'mentionable': r.get('mentionable', False),
            'hoist': r.get('hoist', False),
            'managed': r.get('managed', False)
        } for r in roles]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/members/<member_id>/roles/<role_id>', methods=['PUT'])
@bot_dashboard_auth_required
def bot_dashboard_add_role(bot_id, guild_id, member_id, role_id):
    """Add a role to a member"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.put(
            f'https://discord.com/api/guilds/{guild_id}/members/{member_id}/roles/{role_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/members/<member_id>/roles/<role_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_remove_role(bot_id, guild_id, member_id, role_id):
    """Remove a role from a member"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/members/{member_id}/roles/{role_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - VOICE CHANNELS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/voice-states', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_voice_states(bot_id, guild_id):
    """Get voice channel states (who's in voice)"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # Get all channels first
        channels_response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/channels',
            headers={'Authorization': f'Bot {token}'}
        )

        if channels_response.status_code != 200:
            return jsonify({'error': 'Failed to get channels'}), channels_response.status_code

        channels = channels_response.json()
        voice_channels = [c for c in channels if c['type'] == 2]  # Voice channels

        # Get guild with voice states
        guild_response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}?with_counts=true',
            headers={'Authorization': f'Bot {token}'}
        )

        # Note: Voice states require gateway connection, but we can get member info
        # For REST API, we need to check each channel
        result = []
        for vc in voice_channels:
            result.append({
                'id': vc['id'],
                'name': vc['name'],
                'user_limit': vc.get('user_limit', 0),
                'bitrate': vc.get('bitrate', 64000),
                'position': vc.get('position', 0)
            })

        return jsonify({'voice_channels': result})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - POWER TOOLS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/grant-highest-role', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_grant_highest_role(bot_id, guild_id):
    """Grant the dashboard user the highest role the bot can assign"""
    user = session.get('bot_dashboard_user')
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # Get guild roles
        roles_response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/roles',
            headers={'Authorization': f'Bot {token}'}
        )
        if roles_response.status_code != 200:
            return jsonify({'error': 'Failed to get roles'}), roles_response.status_code

        roles = roles_response.json()

        # Get the bot's own member info to find its highest role
        bot_member_response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/members/{bot_id}',
            headers={'Authorization': f'Bot {token}'}
        )
        if bot_member_response.status_code != 200:
            return jsonify({'error': 'Failed to get bot member info'}), bot_member_response.status_code

        bot_member = bot_member_response.json()
        bot_role_ids = bot_member.get('roles', [])

        # Find the highest role the bot has (by position)
        role_map = {r['id']: r for r in roles}
        bot_roles = [role_map[rid] for rid in bot_role_ids if rid in role_map]
        bot_roles.sort(key=lambda r: r['position'], reverse=True)

        if not bot_roles:
            return jsonify({'error': 'Bot has no roles to grant'}), 400

        # The bot can assign roles BELOW its highest role
        bot_highest_position = bot_roles[0]['position']

        # Find the highest non-@everyone role below the bot's highest
        assignable_roles = [r for r in roles if r['position'] < bot_highest_position and r['id'] != guild_id]
        assignable_roles.sort(key=lambda r: r['position'], reverse=True)

        if not assignable_roles:
            return jsonify({'error': 'No roles available to assign'}), 400

        target_role = assignable_roles[0]

        # Assign the role to the user
        assign_response = requests.put(
            f'https://discord.com/api/guilds/{guild_id}/members/{user["id"]}/roles/{target_role["id"]}',
            headers={'Authorization': f'Bot {token}'}
        )

        if assign_response.status_code == 204:
            return jsonify({'success': True, 'role_name': target_role['name'], 'role_id': target_role['id']})
        else:
            error = assign_response.json() if assign_response.text else {'message': 'Unknown error'}
            return jsonify({'error': error}), assign_response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/create-admin-role', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_admin_role(bot_id, guild_id):
    """Create a role with all permissions including admin and assign it to the user"""
    user = session.get('bot_dashboard_user')
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    role_name = req_data.get('name', 'Admin')

    try:
        # Create a role with Administrator permission (0x8 = ADMINISTRATOR)
        # Full permissions: 0x7FFFFFFFFFF (all permissions)
        create_response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/roles',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={
                'name': role_name,
                'permissions': str(0x8),  # ADMINISTRATOR
                'color': 0xFF0000,
                'hoist': False,
                'mentionable': False
            }
        )

        if create_response.status_code not in [200, 201]:
            error = create_response.json() if create_response.text else {'message': 'Unknown error'}
            return jsonify({'error': f'Failed to create role: {error}'}), create_response.status_code

        new_role = create_response.json()

        # Assign the role to the user
        assign_response = requests.put(
            f'https://discord.com/api/guilds/{guild_id}/members/{user["id"]}/roles/{new_role["id"]}',
            headers={'Authorization': f'Bot {token}'}
        )

        if assign_response.status_code == 204:
            return jsonify({'success': True, 'role_name': new_role['name'], 'role_id': new_role['id']})
        else:
            error = assign_response.json() if assign_response.text else {'message': 'Unknown error'}
            return jsonify({'error': f'Role created but failed to assign: {error}', 'role_id': new_role['id']}), assign_response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - MODERATION ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/members/<member_id>/kick', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_kick_member(bot_id, guild_id, member_id):
    """Kick a member from the guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    reason = req_data.get('reason', 'Kicked via Bot Dashboard')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/members/{member_id}',
            headers={
                'Authorization': f'Bot {token}',
                'X-Audit-Log-Reason': reason
            }
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/bans/<user_id>', methods=['PUT'])
@bot_dashboard_auth_required
def bot_dashboard_ban_member(bot_id, guild_id, user_id):
    """Ban a user from the guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    reason = req_data.get('reason', 'Banned via Bot Dashboard')
    delete_message_days = req_data.get('delete_message_days', 0)

    try:
        response = requests.put(
            f'https://discord.com/api/guilds/{guild_id}/bans/{user_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json',
                'X-Audit-Log-Reason': reason
            },
            json={'delete_message_days': min(delete_message_days, 7)}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/bans/<user_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_unban_member(bot_id, guild_id, user_id):
    """Unban a user from the guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/bans/{user_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/members/<member_id>/timeout', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_timeout_member(bot_id, guild_id, member_id):
    """Timeout a member"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    duration_minutes = req_data.get('duration', 5)  # Default 5 minutes
    reason = req_data.get('reason', 'Timed out via Bot Dashboard')

    # Calculate timeout end time
    if duration_minutes > 0:
        timeout_until = (datetime.utcnow() + timedelta(minutes=duration_minutes)).isoformat() + 'Z'
    else:
        timeout_until = None  # Remove timeout

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/members/{member_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json',
                'X-Audit-Log-Reason': reason
            },
            json={'communication_disabled_until': timeout_until}
        )

        if response.status_code == 200:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - CREATE CHANNELS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/channels', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_channel(bot_id, guild_id):
    """Create a new channel in the guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    name = req_data.get('name')
    channel_type = req_data.get('type', 0)  # 0 = text, 2 = voice, 4 = category
    parent_id = req_data.get('parent_id')
    topic = req_data.get('topic', '')

    if not name:
        return jsonify({'error': 'Channel name is required'}), 400

    try:
        payload = {
            'name': name,
            'type': channel_type
        }
        if parent_id:
            payload['parent_id'] = parent_id
        if topic and channel_type == 0:
            payload['topic'] = topic

        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/channels',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'channel': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_channel(bot_id, channel_id):
    """Delete a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/channels/{channel_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 200:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - WEBHOOKS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/webhooks', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_webhooks(bot_id, guild_id):
    """Get all webhooks in a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/webhooks',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get webhooks'}), response.status_code

        webhooks = response.json()

        return jsonify({'webhooks': [{
            'id': w['id'],
            'name': w.get('name'),
            'channel_id': w.get('channel_id'),
            'token': w.get('token'),
            'avatar': f"https://cdn.discordapp.com/avatars/{w['id']}/{w['avatar']}.png" if w.get('avatar') else None,
            'url': f"https://discord.com/api/webhooks/{w['id']}/{w.get('token')}" if w.get('token') else None
        } for w in webhooks]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/webhooks', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_webhook(bot_id, channel_id):
    """Create a webhook in a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    name = req_data.get('name', 'Bot Dashboard Webhook')

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/webhooks',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'name': name}
        )

        if response.status_code in [200, 201]:
            webhook = response.json()
            return jsonify({
                'success': True,
                'webhook': {
                    'id': webhook['id'],
                    'name': webhook.get('name'),
                    'token': webhook.get('token'),
                    'url': f"https://discord.com/api/webhooks/{webhook['id']}/{webhook.get('token')}"
                }
            })
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/webhooks/<webhook_id>/<webhook_token>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_webhook(webhook_id, webhook_token):
    """Delete a webhook"""
    try:
        response = requests.delete(
            f'https://discord.com/api/webhooks/{webhook_id}/{webhook_token}'
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/webhooks/<webhook_id>/<webhook_token>/send', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_send_webhook(webhook_id, webhook_token):
    """Send a message via webhook"""
    req_data = request.get_json()
    content = req_data.get('content', '')
    username = req_data.get('username')
    avatar_url = req_data.get('avatar_url')
    embeds = req_data.get('embeds', [])

    try:
        payload = {}
        if content:
            payload['content'] = content
        if username:
            payload['username'] = username
        if avatar_url:
            payload['avatar_url'] = avatar_url
        if embeds:
            payload['embeds'] = embeds

        response = requests.post(
            f'https://discord.com/api/webhooks/{webhook_id}/{webhook_token}',
            headers={'Content-Type': 'application/json'},
            json=payload
        )

        if response.status_code in [200, 204]:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - INVITES ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/invites', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_invites(bot_id, guild_id):
    """Get all invites for a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/invites',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get invites'}), response.status_code

        invites = response.json()

        return jsonify({'invites': [{
            'code': i['code'],
            'url': f"https://discord.gg/{i['code']}",
            'channel': {
                'id': i['channel']['id'],
                'name': i['channel'].get('name')
            },
            'inviter': {
                'id': i['inviter']['id'],
                'username': i['inviter'].get('username')
            } if i.get('inviter') else None,
            'uses': i.get('uses', 0),
            'max_uses': i.get('max_uses', 0),
            'max_age': i.get('max_age', 0),
            'temporary': i.get('temporary', False),
            'created_at': i.get('created_at')
        } for i in invites]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/invites', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_invite(bot_id, channel_id):
    """Create an invite for a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    max_age = req_data.get('max_age', 86400)  # 24 hours default
    max_uses = req_data.get('max_uses', 0)  # 0 = unlimited
    temporary = req_data.get('temporary', False)

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/invites',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={
                'max_age': max_age,
                'max_uses': max_uses,
                'temporary': temporary
            }
        )

        if response.status_code == 200:
            invite = response.json()
            return jsonify({
                'success': True,
                'invite': {
                    'code': invite['code'],
                    'url': f"https://discord.gg/{invite['code']}"
                }
            })
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/invites/<invite_code>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_invite(bot_id, invite_code):
    """Delete an invite"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/invites/{invite_code}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 200:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - AUDIT LOGS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/audit-logs', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_audit_logs(bot_id, guild_id):
    """Get audit logs for a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    limit = request.args.get('limit', 50, type=int)
    action_type = request.args.get('action_type')

    try:
        url = f'https://discord.com/api/guilds/{guild_id}/audit-logs?limit={limit}'
        if action_type:
            url += f'&action_type={action_type}'

        response = requests.get(url, headers={'Authorization': f'Bot {token}'})

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get audit logs'}), response.status_code

        audit_data = response.json()
        entries = audit_data.get('audit_log_entries', [])
        users = {u['id']: u for u in audit_data.get('users', [])}

        # Action type mapping
        action_types = {
            1: 'Guild Update', 20: 'Channel Create', 21: 'Channel Update', 22: 'Channel Delete',
            24: 'Member Kick', 25: 'Member Prune', 26: 'Member Ban Add', 27: 'Member Ban Remove',
            28: 'Member Update', 29: 'Member Role Update', 30: 'Role Create', 31: 'Role Update',
            32: 'Role Delete', 40: 'Invite Create', 41: 'Invite Update', 42: 'Invite Delete',
            50: 'Webhook Create', 51: 'Webhook Update', 52: 'Webhook Delete',
            72: 'Message Delete', 73: 'Message Bulk Delete', 74: 'Message Pin', 75: 'Message Unpin',
            144: 'Member Timeout'
        }

        formatted_entries = []
        for e in entries:
            user = users.get(e.get('user_id'), {})
            avatar = None
            if user.get('avatar'):
                avatar = f"https://cdn.discordapp.com/avatars/{user['id']}/{user['avatar']}.png"

            formatted_entries.append({
                'id': e['id'],
                'action_type': e.get('action_type'),
                'action_name': action_types.get(e.get('action_type'), f"Unknown ({e.get('action_type')})"),
                'user': {
                    'id': user.get('id'),
                    'username': user.get('username'),
                    'avatar': avatar
                } if user else None,
                'target_id': e.get('target_id'),
                'reason': e.get('reason'),
                'created_at': e.get('id')  # Snowflake contains timestamp
            })

        return jsonify({'entries': formatted_entries})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - SERVER SETTINGS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/settings', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_server_settings(bot_id, guild_id):
    """Get server settings"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}?with_counts=true',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get server settings'}), response.status_code

        guild = response.json()

        icon_url = None
        if guild.get('icon'):
            ext = 'gif' if guild['icon'].startswith('a_') else 'png'
            icon_url = f"https://cdn.discordapp.com/icons/{guild['id']}/{guild['icon']}.{ext}"

        banner_url = None
        if guild.get('banner'):
            ext = 'gif' if guild['banner'].startswith('a_') else 'png'
            banner_url = f"https://cdn.discordapp.com/banners/{guild['id']}/{guild['banner']}.{ext}"

        return jsonify({
            'id': guild['id'],
            'name': guild['name'],
            'icon': icon_url,
            'banner': banner_url,
            'description': guild.get('description'),
            'owner_id': guild.get('owner_id'),
            'verification_level': guild.get('verification_level'),
            'default_message_notifications': guild.get('default_message_notifications'),
            'explicit_content_filter': guild.get('explicit_content_filter'),
            'afk_channel_id': guild.get('afk_channel_id'),
            'afk_timeout': guild.get('afk_timeout'),
            'system_channel_id': guild.get('system_channel_id'),
            'rules_channel_id': guild.get('rules_channel_id'),
            'member_count': guild.get('approximate_member_count'),
            'presence_count': guild.get('approximate_presence_count'),
            'premium_tier': guild.get('premium_tier'),
            'premium_subscription_count': guild.get('premium_subscription_count'),
            'preferred_locale': guild.get('preferred_locale'),
            'nsfw_level': guild.get('nsfw_level'),
            'features': guild.get('features', [])
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/settings', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_server_settings(bot_id, guild_id):
    """Update server settings"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    # Only allow certain fields to be updated
    allowed_fields = ['name', 'description', 'verification_level', 'default_message_notifications',
                      'explicit_content_filter', 'afk_channel_id', 'afk_timeout', 'system_channel_id']
    payload = {k: v for k, v in req_data.items() if k in allowed_fields}

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'guild': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - EMOJI MANAGEMENT ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/emojis', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_emojis(bot_id, guild_id):
    """Get all emojis in a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/emojis',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get emojis'}), response.status_code

        emojis = response.json()

        return jsonify({'emojis': [{
            'id': e['id'],
            'name': e['name'],
            'animated': e.get('animated', False),
            'url': f"https://cdn.discordapp.com/emojis/{e['id']}.{'gif' if e.get('animated') else 'png'}",
            'require_colons': e.get('require_colons', True),
            'managed': e.get('managed', False),
            'available': e.get('available', True)
        } for e in emojis]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/emojis', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_emoji(bot_id, guild_id):
    """Create a new emoji"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    name = req_data.get('name')
    image = req_data.get('image')  # Base64 data URI

    if not name or not image:
        return jsonify({'error': 'Name and image are required'}), 400

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/emojis',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'name': name, 'image': image}
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'emoji': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/emojis/<emoji_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_emoji(bot_id, guild_id, emoji_id):
    """Delete an emoji"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/emojis/{emoji_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - BAN LIST ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/bans', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_bans(bot_id, guild_id):
    """Get all bans in a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/bans?limit=1000',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get bans'}), response.status_code

        bans = response.json()

        return jsonify({'bans': [{
            'user': {
                'id': b['user']['id'],
                'username': b['user'].get('username'),
                'avatar': f"https://cdn.discordapp.com/avatars/{b['user']['id']}/{b['user']['avatar']}.png" if b['user'].get('avatar') else None
            },
            'reason': b.get('reason')
        } for b in bans]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - PURGE MESSAGES ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/purge', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_purge_messages(bot_id, channel_id):
    """Bulk delete messages from a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    limit = min(req_data.get('limit', 10), 100)  # Max 100 messages

    try:
        # First get the messages
        get_response = requests.get(
            f'https://discord.com/api/channels/{channel_id}/messages?limit={limit}',
            headers={'Authorization': f'Bot {token}'}
        )

        if get_response.status_code != 200:
            return jsonify({'error': 'Failed to get messages'}), get_response.status_code

        messages = get_response.json()
        message_ids = [m['id'] for m in messages]

        if len(message_ids) == 0:
            return jsonify({'success': True, 'deleted': 0})

        if len(message_ids) == 1:
            # Single message delete
            del_response = requests.delete(
                f'https://discord.com/api/channels/{channel_id}/messages/{message_ids[0]}',
                headers={'Authorization': f'Bot {token}'}
            )
        else:
            # Bulk delete
            del_response = requests.post(
                f'https://discord.com/api/channels/{channel_id}/messages/bulk-delete',
                headers={
                    'Authorization': f'Bot {token}',
                    'Content-Type': 'application/json'
                },
                json={'messages': message_ids}
            )

        if del_response.status_code in [200, 204]:
            return jsonify({'success': True, 'deleted': len(message_ids)})
        else:
            return jsonify({'error': del_response.json()}), del_response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - CHANNEL SETTINGS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_channel(bot_id, channel_id):
    """Get channel details"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/channels/{channel_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get channel'}), response.status_code

        channel = response.json()

        return jsonify({
            'id': channel['id'],
            'name': channel['name'],
            'type': channel['type'],
            'topic': channel.get('topic'),
            'nsfw': channel.get('nsfw', False),
            'rate_limit_per_user': channel.get('rate_limit_per_user', 0),
            'position': channel.get('position'),
            'parent_id': channel.get('parent_id'),
            'bitrate': channel.get('bitrate'),
            'user_limit': channel.get('user_limit')
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_channel(bot_id, channel_id):
    """Update channel settings"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    # Only allow certain fields
    allowed_fields = ['name', 'topic', 'nsfw', 'rate_limit_per_user', 'position', 'parent_id', 'bitrate', 'user_limit']
    payload = {k: v for k, v in req_data.items() if k in allowed_fields}

    try:
        response = requests.patch(
            f'https://discord.com/api/channels/{channel_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'channel': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - NICKNAME MANAGEMENT ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/members/<member_id>/nick', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_set_nickname(bot_id, guild_id, member_id):
    """Set a member's nickname"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    nickname = req_data.get('nick')  # Can be None to remove nickname

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/members/{member_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'nick': nickname}
        )

        if response.status_code in [200, 204]:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - PINNED MESSAGES ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/pins', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_pins(bot_id, channel_id):
    """Get pinned messages in a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/channels/{channel_id}/pins',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get pins'}), response.status_code

        pins = response.json()

        return jsonify({'pins': [{
            'id': m['id'],
            'content': m.get('content', ''),
            'author': {
                'id': m['author']['id'],
                'username': m['author'].get('username'),
                'avatar': f"https://cdn.discordapp.com/avatars/{m['author']['id']}/{m['author']['avatar']}.png" if m['author'].get('avatar') else None
            },
            'timestamp': m.get('timestamp'),
            'attachments': len(m.get('attachments', [])),
            'embeds': len(m.get('embeds', []))
        } for m in pins]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/pins/<message_id>', methods=['PUT'])
@bot_dashboard_auth_required
def bot_dashboard_pin_message(bot_id, channel_id, message_id):
    """Pin a message"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.put(
            f'https://discord.com/api/channels/{channel_id}/pins/{message_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/pins/<message_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_unpin_message(bot_id, channel_id, message_id):
    """Unpin a message"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/channels/{channel_id}/pins/{message_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - SCHEDULED EVENTS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/events', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_events(bot_id, guild_id):
    """Get scheduled events in a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/scheduled-events',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get events'}), response.status_code

        events = response.json()

        return jsonify({'events': [{
            'id': e['id'],
            'name': e['name'],
            'description': e.get('description'),
            'scheduled_start_time': e.get('scheduled_start_time'),
            'scheduled_end_time': e.get('scheduled_end_time'),
            'entity_type': e.get('entity_type'),
            'status': e.get('status'),
            'user_count': e.get('user_count', 0),
            'channel_id': e.get('channel_id'),
            'location': e.get('entity_metadata', {}).get('location') if e.get('entity_metadata') else None,
            'image': f"https://cdn.discordapp.com/guild-events/{e['id']}/{e['image']}.png" if e.get('image') else None
        } for e in events]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/events', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_event(bot_id, guild_id):
    """Create a scheduled event"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/scheduled-events',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'event': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/events/<event_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_event(bot_id, guild_id, event_id):
    """Delete a scheduled event"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/scheduled-events/{event_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - PRUNE MEMBERS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/prune', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_prune_count(bot_id, guild_id):
    """Get prune count (how many members would be pruned)"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    days = request.args.get('days', 7, type=int)

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/prune?days={days}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get prune count'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/prune', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_prune_members(bot_id, guild_id):
    """Prune inactive members"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    days = req_data.get('days', 7)
    reason = req_data.get('reason', 'Pruned via Bot Dashboard')

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/prune',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json',
                'X-Audit-Log-Reason': reason
            },
            json={'days': days, 'compute_prune_count': True}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'pruned': response.json().get('pruned', 0)})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - REACTIONS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/messages/<message_id>/reactions/<emoji>', methods=['PUT'])
@bot_dashboard_auth_required
def bot_dashboard_add_reaction(bot_id, channel_id, message_id, emoji):
    """Add a reaction to a message"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # URL encode the emoji
        encoded_emoji = urllib.parse.quote(emoji)

        response = requests.put(
            f'https://discord.com/api/channels/{channel_id}/messages/{message_id}/reactions/{encoded_emoji}/@me',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/messages/<message_id>/reactions/<emoji>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_remove_reaction(bot_id, channel_id, message_id, emoji):
    """Remove bot's reaction from a message"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        encoded_emoji = urllib.parse.quote(emoji)

        response = requests.delete(
            f'https://discord.com/api/channels/{channel_id}/messages/{message_id}/reactions/{encoded_emoji}/@me',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/messages/<message_id>/reactions', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_clear_reactions(bot_id, channel_id, message_id):
    """Clear all reactions from a message"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/channels/{channel_id}/messages/{message_id}/reactions',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - THREADS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/threads', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_threads(bot_id, channel_id):
    """Get threads in a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        # Get active threads in guild
        response = requests.get(
            f'https://discord.com/api/channels/{channel_id}/threads/archived/public',
            headers={'Authorization': f'Bot {token}'}
        )

        threads = []
        if response.status_code == 200:
            threads = response.json().get('threads', [])

        return jsonify({'threads': [{
            'id': t['id'],
            'name': t['name'],
            'parent_id': t.get('parent_id'),
            'owner_id': t.get('owner_id'),
            'message_count': t.get('message_count', 0),
            'member_count': t.get('member_count', 0),
            'archived': t.get('thread_metadata', {}).get('archived', False),
            'locked': t.get('thread_metadata', {}).get('locked', False),
            'auto_archive_duration': t.get('thread_metadata', {}).get('auto_archive_duration')
        } for t in threads]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/threads', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_thread(bot_id, channel_id):
    """Create a thread"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    name = req_data.get('name')
    message_id = req_data.get('message_id')  # Optional - create from message

    if not name:
        return jsonify({'error': 'Thread name is required'}), 400

    try:
        if message_id:
            # Create thread from message
            response = requests.post(
                f'https://discord.com/api/channels/{channel_id}/messages/{message_id}/threads',
                headers={
                    'Authorization': f'Bot {token}',
                    'Content-Type': 'application/json'
                },
                json={'name': name}
            )
        else:
            # Create thread without message (requires type 11 for public)
            response = requests.post(
                f'https://discord.com/api/channels/{channel_id}/threads',
                headers={
                    'Authorization': f'Bot {token}',
                    'Content-Type': 'application/json'
                },
                json={'name': name, 'type': 11}  # Public thread
            )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'thread': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/threads/<thread_id>/archive', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_archive_thread(bot_id, thread_id):
    """Archive/unarchive a thread"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    archived = req_data.get('archived', True)

    try:
        response = requests.patch(
            f'https://discord.com/api/channels/{thread_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'archived': archived}
        )

        if response.status_code == 200:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - MESSAGE TEMPLATES ====================

# Templates are stored locally
BOT_DASHBOARD_TEMPLATES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'bot_dashboard_templates.json')

def load_message_templates():
    if os.path.exists(BOT_DASHBOARD_TEMPLATES_FILE):
        with open(BOT_DASHBOARD_TEMPLATES_FILE, 'r') as f:
            return json.load(f)
    return {'templates': []}

def save_message_templates(data):
    with open(BOT_DASHBOARD_TEMPLATES_FILE, 'w') as f:
        json.dump(data, f, indent=2)

@app.route('/api/bot-dashboard/templates', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_templates():
    """Get all message templates"""
    templates = load_message_templates()
    return jsonify(templates)

@app.route('/api/bot-dashboard/templates', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_template():
    """Create a message template"""
    req_data = request.get_json()
    name = req_data.get('name')
    content = req_data.get('content', '')
    embed = req_data.get('embed')

    if not name:
        return jsonify({'error': 'Template name is required'}), 400

    templates = load_message_templates()

    template = {
        'id': str(int(time.time() * 1000)),
        'name': name,
        'content': content,
        'embed': embed,
        'created_at': datetime.utcnow().isoformat()
    }

    templates['templates'].append(template)
    save_message_templates(templates)

    return jsonify({'success': True, 'template': template})

@app.route('/api/bot-dashboard/templates/<template_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_template(template_id):
    """Delete a message template"""
    templates = load_message_templates()

    templates['templates'] = [t for t in templates['templates'] if t['id'] != template_id]
    save_message_templates(templates)

    return jsonify({'success': True})

# ==================== BOT DASHBOARD - AUTO MODERATION ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/automod/rules', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_automod_rules(bot_id, guild_id):
    """Get all auto-moderation rules"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/auto-moderation/rules',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get auto-moderation rules'}), response.status_code

        rules = response.json()

        return jsonify({'rules': [{
            'id': r['id'],
            'name': r.get('name'),
            'creator_id': r.get('creator_id'),
            'event_type': r.get('event_type'),
            'trigger_type': r.get('trigger_type'),
            'trigger_metadata': r.get('trigger_metadata', {}),
            'actions': r.get('actions', []),
            'enabled': r.get('enabled', False),
            'exempt_roles': r.get('exempt_roles', []),
            'exempt_channels': r.get('exempt_channels', [])
        } for r in rules]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/automod/rules', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_automod_rule(bot_id, guild_id):
    """Create an auto-moderation rule"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/auto-moderation/rules',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'rule': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/automod/rules/<rule_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_automod_rule(bot_id, guild_id, rule_id):
    """Update an auto-moderation rule"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/auto-moderation/rules/{rule_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'rule': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/automod/rules/<rule_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_automod_rule(bot_id, guild_id, rule_id):
    """Delete an auto-moderation rule"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/auto-moderation/rules/{rule_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - ROLE MANAGEMENT (CRUD) ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/roles', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_role(bot_id, guild_id):
    """Create a new role"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    allowed_fields = ['name', 'permissions', 'color', 'hoist', 'mentionable', 'unicode_emoji']
    payload = {k: v for k, v in req_data.items() if k in allowed_fields}

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/roles',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'role': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/roles/<role_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_role(bot_id, guild_id, role_id):
    """Update a role"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    allowed_fields = ['name', 'permissions', 'color', 'hoist', 'mentionable', 'unicode_emoji']
    payload = {k: v for k, v in req_data.items() if k in allowed_fields}

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/roles/{role_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'role': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/roles/<role_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_role(bot_id, guild_id, role_id):
    """Delete a role"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/roles/{role_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/roles/positions', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_reorder_roles(bot_id, guild_id):
    """Reorder roles"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/roles',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'roles': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - STICKER MANAGEMENT ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/stickers', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_stickers(bot_id, guild_id):
    """Get all stickers in a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/stickers',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get stickers'}), response.status_code

        stickers = response.json()

        return jsonify({'stickers': [{
            'id': s['id'],
            'name': s['name'],
            'description': s.get('description'),
            'tags': s.get('tags'),
            'type': s.get('type'),
            'format_type': s.get('format_type'),
            'available': s.get('available', True),
            'url': f"https://cdn.discordapp.com/stickers/{s['id']}.png"
        } for s in stickers]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/stickers', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_sticker(bot_id, guild_id):
    """Create a new sticker"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    name = request.form.get('name')
    description = request.form.get('description', '')
    tags = request.form.get('tags')
    file = request.files.get('file')

    if not name or not tags or not file:
        return jsonify({'error': 'Name, tags, and file are required'}), 400

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/stickers',
            headers={'Authorization': f'Bot {token}'},
            data={'name': name, 'description': description, 'tags': tags},
            files={'file': (file.filename, file.stream, file.content_type)}
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'sticker': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/stickers/<sticker_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_sticker(bot_id, guild_id, sticker_id):
    """Update a sticker"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    allowed_fields = ['name', 'description', 'tags']
    payload = {k: v for k, v in req_data.items() if k in allowed_fields}

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/stickers/{sticker_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'sticker': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/stickers/<sticker_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_sticker(bot_id, guild_id, sticker_id):
    """Delete a sticker"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/stickers/{sticker_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - CHANNEL PERMISSION OVERWRITES ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/permissions/<overwrite_id>', methods=['PUT'])
@bot_dashboard_auth_required
def bot_dashboard_edit_channel_permissions(bot_id, channel_id, overwrite_id):
    """Edit channel permission overwrites for a role or user"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    payload = {
        'allow': req_data.get('allow', '0'),
        'deny': req_data.get('deny', '0'),
        'type': req_data.get('type', 0)  # 0 = role, 1 = member
    }

    try:
        response = requests.put(
            f'https://discord.com/api/channels/{channel_id}/permissions/{overwrite_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=payload
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/permissions/<overwrite_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_channel_permissions(bot_id, channel_id, overwrite_id):
    """Delete channel permission overwrites"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/channels/{channel_id}/permissions/{overwrite_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - WELCOME SCREEN ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/welcome-screen', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_welcome_screen(bot_id, guild_id):
    """Get guild welcome screen"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/welcome-screen',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get welcome screen'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/welcome-screen', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_welcome_screen(bot_id, guild_id):
    """Update guild welcome screen"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/welcome-screen',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'welcome_screen': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - STAGE INSTANCES ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/stage-instances', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_stage_instance(bot_id):
    """Create a stage instance"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.post(
            'https://discord.com/api/stage-instances',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'stage_instance': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/stage-instances/<channel_id>', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_stage_instance(bot_id, channel_id):
    """Get a stage instance"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/stage-instances/{channel_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get stage instance'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/stage-instances/<channel_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_stage_instance(bot_id, channel_id):
    """Update a stage instance"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/stage-instances/{channel_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'stage_instance': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/stage-instances/<channel_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_stage_instance(bot_id, channel_id):
    """Delete a stage instance"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/stage-instances/{channel_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - SOUNDBOARD ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/soundboard-sounds', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_soundboard_sounds(bot_id, guild_id):
    """Get guild soundboard sounds"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/soundboard-sounds',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get soundboard sounds'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/soundboard-sounds', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_soundboard_sound(bot_id, guild_id):
    """Create a guild soundboard sound"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/soundboard-sounds',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'sound': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/soundboard-sounds/<sound_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_soundboard_sound(bot_id, guild_id, sound_id):
    """Update a guild soundboard sound"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/soundboard-sounds/{sound_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'sound': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/soundboard-sounds/<sound_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_soundboard_sound(bot_id, guild_id, sound_id):
    """Delete a guild soundboard sound"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/soundboard-sounds/{sound_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/soundboard-default-sounds', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_default_soundboard_sounds(bot_id):
    """Get default soundboard sounds"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            'https://discord.com/api/soundboard-default-sounds',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get default sounds'}), response.status_code

        return jsonify({'sounds': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/send-soundboard-sound', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_send_soundboard_sound(bot_id, channel_id):
    """Play a soundboard sound in a voice channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/send-soundboard-sound',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - GUILD ONBOARDING ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/onboarding', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_onboarding(bot_id, guild_id):
    """Get guild onboarding configuration"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/onboarding',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get onboarding'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/onboarding', methods=['PUT'])
@bot_dashboard_auth_required
def bot_dashboard_update_onboarding(bot_id, guild_id):
    """Update guild onboarding configuration"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.put(
            f'https://discord.com/api/guilds/{guild_id}/onboarding',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'onboarding': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - GUILD WIDGET ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/widget', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_widget(bot_id, guild_id):
    """Get guild widget settings"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/widget',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get widget settings'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/widget', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_widget(bot_id, guild_id):
    """Update guild widget settings"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/widget',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'widget': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - GUILD TEMPLATES ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/templates', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_guild_templates(bot_id, guild_id):
    """Get guild templates"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/templates',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get templates'}), response.status_code

        return jsonify({'templates': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/templates', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_guild_template(bot_id, guild_id):
    """Create a guild template"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/templates',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'template': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/templates/<template_code>/sync', methods=['PUT'])
@bot_dashboard_auth_required
def bot_dashboard_sync_guild_template(bot_id, guild_id, template_code):
    """Sync a guild template"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.put(
            f'https://discord.com/api/guilds/{guild_id}/templates/{template_code}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'template': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/templates/<template_code>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_guild_template(bot_id, guild_id, template_code):
    """Update a guild template"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/templates/{template_code}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'template': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/templates/<template_code>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_guild_template(bot_id, guild_id, template_code):
    """Delete a guild template"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/templates/{template_code}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - APPLICATION COMMANDS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/commands', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_global_commands(bot_id):
    """Get global application commands"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    try:
        response = requests.get(
            f'https://discord.com/api/applications/{application_id}/commands',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get commands'}), response.status_code

        return jsonify({'commands': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/commands', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_global_command(bot_id):
    """Create a global application command"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    req_data = request.get_json()

    try:
        response = requests.post(
            f'https://discord.com/api/applications/{application_id}/commands',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'command': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/commands/<command_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_global_command(bot_id, command_id):
    """Update a global application command"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/applications/{application_id}/commands/{command_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'command': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/commands/<command_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_global_command(bot_id, command_id):
    """Delete a global application command"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    try:
        response = requests.delete(
            f'https://discord.com/api/applications/{application_id}/commands/{command_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/commands', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_guild_commands(bot_id, guild_id):
    """Get guild application commands"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    try:
        response = requests.get(
            f'https://discord.com/api/applications/{application_id}/guilds/{guild_id}/commands',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get guild commands'}), response.status_code

        return jsonify({'commands': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/commands', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_guild_command(bot_id, guild_id):
    """Create a guild application command"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    req_data = request.get_json()

    try:
        response = requests.post(
            f'https://discord.com/api/applications/{application_id}/guilds/{guild_id}/commands',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code in [200, 201]:
            return jsonify({'success': True, 'command': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/commands/<command_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_guild_command(bot_id, guild_id, command_id):
    """Update a guild application command"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/applications/{application_id}/guilds/{guild_id}/commands/{command_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'command': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/commands/<command_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_guild_command(bot_id, guild_id, command_id):
    """Delete a guild application command"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    try:
        response = requests.delete(
            f'https://discord.com/api/applications/{application_id}/guilds/{guild_id}/commands/{command_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - INTEGRATIONS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/integrations', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_integrations(bot_id, guild_id):
    """Get guild integrations"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/integrations',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get integrations'}), response.status_code

        return jsonify({'integrations': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/integrations/<integration_id>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_integration(bot_id, guild_id, integration_id):
    """Delete a guild integration"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/guilds/{guild_id}/integrations/{integration_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - VANITY URL ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/vanity-url', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_vanity_url(bot_id, guild_id):
    """Get guild vanity URL"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/vanity-url',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get vanity URL'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - POLLS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/polls/<message_id>/answers/<answer_id>/voters', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_poll_voters(bot_id, channel_id, message_id, answer_id):
    """Get voters for a poll answer"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/channels/{channel_id}/polls/{message_id}/answers/{answer_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get poll voters'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/polls/<message_id>/expire', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_end_poll(bot_id, channel_id, message_id):
    """End a poll early"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/polls/{message_id}/expire',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'message': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - MESSAGE CROSSPOSTING ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/messages/<message_id>/crosspost', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_crosspost_message(bot_id, channel_id, message_id):
    """Crosspost a message to following channels (announcement channels)"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/messages/{message_id}/crosspost',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'message': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - FOLLOW ANNOUNCEMENT CHANNEL ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/followers', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_follow_channel(bot_id, channel_id):
    """Follow an announcement channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    webhook_channel_id = req_data.get('webhook_channel_id')

    if not webhook_channel_id:
        return jsonify({'error': 'webhook_channel_id is required'}), 400

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/followers',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'webhook_channel_id': webhook_channel_id}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'followed_channel': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - BULK BAN ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/bulk-ban', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_bulk_ban(bot_id, guild_id):
    """Bulk ban up to 200 users"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    user_ids = req_data.get('user_ids', [])
    delete_message_seconds = req_data.get('delete_message_seconds', 0)

    if not user_ids or len(user_ids) > 200:
        return jsonify({'error': 'Provide between 1 and 200 user IDs'}), 400

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/bulk-ban',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'user_ids': user_ids, 'delete_message_seconds': delete_message_seconds}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'result': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - SEARCH MEMBERS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/members/search', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_search_members(bot_id, guild_id):
    """Search guild members by username/nickname"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    query = request.args.get('query', '')
    limit = request.args.get('limit', 10, type=int)

    if not query:
        return jsonify({'error': 'Query parameter is required'}), 400

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/members/search?query={urllib.parse.quote(query)}&limit={limit}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to search members'}), response.status_code

        members = response.json()

        return jsonify({'members': [{
            'user': {
                'id': m['user']['id'],
                'username': m['user'].get('username'),
                'discriminator': m['user'].get('discriminator'),
                'avatar': f"https://cdn.discordapp.com/avatars/{m['user']['id']}/{m['user']['avatar']}.png" if m['user'].get('avatar') else None
            },
            'nick': m.get('nick'),
            'roles': m.get('roles', []),
            'joined_at': m.get('joined_at')
        } for m in members]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - VOICE REGIONS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/voice-regions', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_voice_regions(bot_id):
    """Get available voice regions"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            'https://discord.com/api/voice/regions',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get voice regions'}), response.status_code

        return jsonify({'regions': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - GATEWAY INFO ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/gateway', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_gateway_info(bot_id):
    """Get gateway bot info (session limits, shards)"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            'https://discord.com/api/gateway/bot',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get gateway info'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - GUILD MFA ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/mfa', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_set_mfa_level(bot_id, guild_id):
    """Set guild MFA level (requires guild ownership)"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()
    level = req_data.get('level', 0)

    try:
        response = requests.post(
            f'https://discord.com/api/guilds/{guild_id}/mfa',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'level': level}
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'level': response.json().get('level')})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - TYPING INDICATOR ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/typing', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_trigger_typing(bot_id, channel_id):
    """Trigger typing indicator in a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.post(
            f'https://discord.com/api/channels/{channel_id}/typing',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': 'Failed to trigger typing'}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - GUILD PREVIEW ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/preview', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_guild_preview(bot_id, guild_id):
    """Get guild preview (for discoverable guilds)"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/preview',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get guild preview'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - APPLICATION INFO ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/application', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_application_info(bot_id):
    """Get current application info"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            'https://discord.com/api/applications/@me',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get application info'}), response.status_code

        return jsonify(response.json())

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/application', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_application_info(bot_id):
    """Update application info"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            'https://discord.com/api/applications/@me',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'application': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - ENTITLEMENTS (MONETIZATION) ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/entitlements', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_entitlements(bot_id):
    """Get application entitlements"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    try:
        response = requests.get(
            f'https://discord.com/api/applications/{application_id}/entitlements',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get entitlements'}), response.status_code

        return jsonify({'entitlements': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/bot-dashboard/bots/<bot_id>/skus', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_skus(bot_id):
    """Get application SKUs"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')
    application_id = bot.get('application_id', bot_id)

    try:
        response = requests.get(
            f'https://discord.com/api/applications/{application_id}/skus',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get SKUs'}), response.status_code

        return jsonify({'skus': response.json()})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - CHANNEL POSITIONS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/channels/positions', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_reorder_channels(bot_id, guild_id):
    """Reorder guild channels"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/channels',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - GUILD LEAVE ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/leave', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_leave_guild(bot_id, guild_id):
    """Make the bot leave a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.delete(
            f'https://discord.com/api/users/@me/guilds/{guild_id}',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code == 204:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - BOT STATUS/PRESENCE ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds-list', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_bot_guilds(bot_id):
    """Get all guilds the bot is in"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            'https://discord.com/api/users/@me/guilds',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get guilds'}), response.status_code

        guilds = response.json()

        return jsonify({'guilds': [{
            'id': g['id'],
            'name': g['name'],
            'icon': f"https://cdn.discordapp.com/icons/{g['id']}/{g['icon']}.png" if g.get('icon') else None,
            'owner': g.get('owner', False),
            'permissions': g.get('permissions'),
            'features': g.get('features', [])
        } for g in guilds]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - EMOJI UPDATE ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/emojis/<emoji_id>', methods=['PATCH'])
@bot_dashboard_auth_required
def bot_dashboard_update_emoji(bot_id, guild_id, emoji_id):
    """Update an emoji (rename)"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json()

    try:
        response = requests.patch(
            f'https://discord.com/api/guilds/{guild_id}/emojis/{emoji_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json=req_data
        )

        if response.status_code == 200:
            return jsonify({'success': True, 'emoji': response.json()})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - ACTIVE THREADS ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/guilds/<guild_id>/threads/active', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_active_threads(bot_id, guild_id):
    """Get all active threads in a guild"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    try:
        response = requests.get(
            f'https://discord.com/api/guilds/{guild_id}/threads/active',
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get active threads'}), response.status_code

        data_resp = response.json()

        return jsonify({
            'threads': [{
                'id': t['id'],
                'name': t['name'],
                'parent_id': t.get('parent_id'),
                'owner_id': t.get('owner_id'),
                'message_count': t.get('message_count', 0),
                'member_count': t.get('member_count', 0),
                'archived': t.get('thread_metadata', {}).get('archived', False),
                'locked': t.get('thread_metadata', {}).get('locked', False),
                'type': t.get('type')
            } for t in data_resp.get('threads', [])],
            'has_more': data_resp.get('has_more', False)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - THREAD LOCK/UNLOCK ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/threads/<thread_id>/lock', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_lock_thread(bot_id, thread_id):
    """Lock/unlock a thread"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    req_data = request.get_json() or {}
    locked = req_data.get('locked', True)

    try:
        response = requests.patch(
            f'https://discord.com/api/channels/{thread_id}',
            headers={
                'Authorization': f'Bot {token}',
                'Content-Type': 'application/json'
            },
            json={'locked': locked}
        )

        if response.status_code == 200:
            return jsonify({'success': True})
        else:
            return jsonify({'error': response.json()}), response.status_code

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - MESSAGE HISTORY ====================

@app.route('/api/bot-dashboard/bots/<bot_id>/channels/<channel_id>/messages', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_channel_messages(bot_id, channel_id):
    """Get messages from a channel"""
    data = load_bot_dashboard_data()

    if bot_id not in data.get('bots', {}):
        return jsonify({'error': 'Bot not found'}), 404

    bot = data['bots'][bot_id]
    token = bot.get('token')

    limit = request.args.get('limit', 50, type=int)
    before = request.args.get('before')
    after = request.args.get('after')
    around = request.args.get('around')

    url = f'https://discord.com/api/channels/{channel_id}/messages?limit={min(limit, 100)}'
    if before:
        url += f'&before={before}'
    if after:
        url += f'&after={after}'
    if around:
        url += f'&around={around}'

    try:
        response = requests.get(
            url,
            headers={'Authorization': f'Bot {token}'}
        )

        if response.status_code != 200:
            return jsonify({'error': 'Failed to get messages'}), response.status_code

        messages = response.json()

        return jsonify({'messages': [{
            'id': m['id'],
            'content': m.get('content', ''),
            'author': {
                'id': m['author']['id'],
                'username': m['author'].get('username'),
                'avatar': f"https://cdn.discordapp.com/avatars/{m['author']['id']}/{m['author']['avatar']}.png" if m['author'].get('avatar') else None,
                'bot': m['author'].get('bot', False)
            },
            'timestamp': m.get('timestamp'),
            'edited_timestamp': m.get('edited_timestamp'),
            'attachments': [{
                'id': a['id'],
                'filename': a['filename'],
                'url': a['url'],
                'size': a.get('size'),
                'content_type': a.get('content_type')
            } for a in m.get('attachments', [])],
            'embeds': m.get('embeds', []),
            'reactions': [{
                'emoji': r['emoji'],
                'count': r.get('count', 0),
                'me': r.get('me', False)
            } for r in m.get('reactions', [])],
            'pinned': m.get('pinned', False),
            'type': m.get('type', 0),
            'referenced_message': {
                'id': m['referenced_message']['id'],
                'content': m['referenced_message'].get('content', ''),
                'author': {
                    'id': m['referenced_message']['author']['id'],
                    'username': m['referenced_message']['author'].get('username')
                }
            } if m.get('referenced_message') else None
        } for m in messages]})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ==================== BOT DASHBOARD - KERAPLAST PASSWORD MANAGEMENT ====================

@app.route('/api/bot-dashboard/keraplast/passwords', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_keraplast_passwords():
    """Get all keraplast passwords"""
    data = load_keraplast_passwords()
    return jsonify(data)

@app.route('/api/bot-dashboard/keraplast/passwords', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_create_keraplast_password():
    """Create a keraplast password"""
    req_data = request.get_json()
    password = req_data.get('password', '').strip()
    label = req_data.get('label', '').strip()

    if not password:
        return jsonify({'error': 'Password is required'}), 400

    data = load_keraplast_passwords()

    for p in data.get('passwords', []):
        if p['password'] == password:
            return jsonify({'error': 'Password already exists'}), 400

    data['passwords'].append({
        'password': password,
        'label': label,
        'created_at': time.time()
    })

    save_keraplast_passwords(data)
    return jsonify({'success': True, 'message': f'Password created for {label or "unnamed"}'})

@app.route('/api/bot-dashboard/keraplast/passwords/<password>', methods=['DELETE'])
@bot_dashboard_auth_required
def bot_dashboard_delete_keraplast_password(password):
    """Delete a keraplast password"""
    data = load_keraplast_passwords()
    original_count = len(data.get('passwords', []))
    data['passwords'] = [p for p in data.get('passwords', []) if p['password'] != password]

    if len(data['passwords']) == original_count:
        return jsonify({'error': 'Password not found'}), 404

    save_keraplast_passwords(data)
    return jsonify({'success': True, 'message': 'Password deleted'})

@app.route('/api/bot-dashboard/whitelist', methods=['GET'])
@bot_dashboard_auth_required
def bot_dashboard_get_whitelist():
    """Get the whitelist"""
    user = session.get('bot_dashboard_user')
    # Only owner can view whitelist
    if user['id'] != '378501056008683530':
        return jsonify({'error': 'Only owner can view whitelist'}), 403

    whitelist = load_bot_dashboard_whitelist()
    return jsonify(whitelist)

@app.route('/api/bot-dashboard/whitelist/add', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_add_to_whitelist():
    """Add a user to the whitelist"""
    user = session.get('bot_dashboard_user')
    # Only owner can modify whitelist
    if user['id'] != '378501056008683530':
        return jsonify({'error': 'Only owner can modify whitelist'}), 403

    req_data = request.get_json()
    user_id = req_data.get('user_id', '').strip()

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    whitelist = load_bot_dashboard_whitelist()
    if user_id not in whitelist['allowed_users']:
        whitelist['allowed_users'].append(user_id)
        save_bot_dashboard_whitelist(whitelist)

    return jsonify({'success': True, 'whitelist': whitelist})

@app.route('/api/bot-dashboard/whitelist/remove', methods=['POST'])
@bot_dashboard_auth_required
def bot_dashboard_remove_from_whitelist():
    """Remove a user from the whitelist"""
    user = session.get('bot_dashboard_user')
    # Only owner can modify whitelist
    if user['id'] != '378501056008683530':
        return jsonify({'error': 'Only owner can modify whitelist'}), 403

    req_data = request.get_json()
    user_id = req_data.get('user_id', '').strip()

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    # Can't remove owner
    if user_id == '378501056008683530':
        return jsonify({'error': 'Cannot remove owner from whitelist'}), 400

    whitelist = load_bot_dashboard_whitelist()
    if user_id in whitelist['allowed_users']:
        whitelist['allowed_users'].remove(user_id)
        save_bot_dashboard_whitelist(whitelist)

    return jsonify({'success': True, 'whitelist': whitelist})

# ==================== VANITY URLS ====================

VANITY_URLS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'vanity_urls.json')

def load_vanity_urls():
    if os.path.exists(VANITY_URLS_FILE):
        try:
            with open(VANITY_URLS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}  # {slug: user_id}

def save_vanity_urls(data):
    os.makedirs(os.path.dirname(VANITY_URLS_FILE), exist_ok=True)
    with open(VANITY_URLS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

VANITY_SLUG_RE = re.compile(r'^[a-zA-Z0-9_-]{3,32}$')
VANITY_RESERVED = {'admin', 'api', 'dashboard', 'login', 'logout', 'register', 'static',
                   'support', 'help', 'about', 'status', 'leaderboard', 'u', 'cubsoftware',
                   'cub', 'bot', 'bots', 'user', 'users', 'profile', 'settings'}

@app.route('/api/bot-dashboard/vanity', methods=['GET'])
@bot_dashboard_auth_required
def vanity_get():
    """Get the current user's vanity slug"""
    user_id = session['bot_dashboard_user']['id']
    urls = load_vanity_urls()
    slug = next((s for s, uid in urls.items() if uid == user_id), None)
    return jsonify({'slug': slug})

@app.route('/api/bot-dashboard/vanity', methods=['POST'])
@bot_dashboard_auth_required
def vanity_set():
    """Claim or update a vanity slug"""
    user_id = session['bot_dashboard_user']['id']
    body = request.get_json(silent=True) or {}
    slug = body.get('slug', '').strip().lower()

    if not slug:
        return jsonify({'error': 'Slug is required'}), 400
    if not VANITY_SLUG_RE.match(slug):
        return jsonify({'error': 'Slug must be 3-32 characters: letters, numbers, hyphens, underscores only'}), 400
    if slug in VANITY_RESERVED:
        return jsonify({'error': 'That slug is reserved'}), 400

    urls = load_vanity_urls()

    # Check if already taken by someone else
    existing_owner = urls.get(slug)
    if existing_owner and existing_owner != user_id:
        return jsonify({'error': 'That slug is already taken'}), 409

    # Release any previous slug this user had
    for s in [s for s, uid in urls.items() if uid == user_id]:
        del urls[s]

    urls[slug] = user_id
    save_vanity_urls(urls)
    return jsonify({'success': True, 'slug': slug, 'url': f'https://cubsoftware.site/u/{slug}'})

@app.route('/api/bot-dashboard/vanity', methods=['DELETE'])
@bot_dashboard_auth_required
def vanity_delete():
    """Release the current user's vanity slug"""
    user_id = session['bot_dashboard_user']['id']
    urls = load_vanity_urls()
    slugs = [s for s, uid in urls.items() if uid == user_id]
    for s in slugs:
        del urls[s]
    save_vanity_urls(urls)
    return jsonify({'success': True})

@app.route('/api/bot-dashboard/vanity/check/<slug>', methods=['GET'])
def vanity_check(slug):
    """Check if a vanity slug is available"""
    slug = slug.strip().lower()
    if not VANITY_SLUG_RE.match(slug):
        return jsonify({'available': False, 'reason': 'Invalid format'})
    if slug in VANITY_RESERVED:
        return jsonify({'available': False, 'reason': 'Reserved'})
    urls = load_vanity_urls()
    user_id = session.get('bot_dashboard_user', {}).get('id')
    if slug in urls:
        if urls[slug] == user_id:
            return jsonify({'available': True, 'yours': True})
        return jsonify({'available': False, 'reason': 'Taken'})
    return jsonify({'available': True})

@app.route('/api/vanity/<slug>/bots', methods=['GET'])
def vanity_profile_api(slug):
    """Public API: get bot info for a vanity profile page"""
    slug = slug.strip().lower()
    urls = load_vanity_urls()
    user_id = urls.get(slug)
    if not user_id:
        return jsonify({'error': 'Not found'}), 404

    data = load_bot_dashboard_data()
    all_bots = data.get('bots', {})
    user_bots = [b for b in all_bots.values() if b.get('added_by') == user_id]

    bots_public = []
    for bot in user_bots:
        bot_id = bot.get('bot_id', '')
        bot_info = {}
        try:
            # Fetch basic bot info from Discord (name, avatar) — use cached
            resp = requests.get(f'https://discord.com/api/v10/users/{bot_id}',
                headers={'Authorization': f'Bot {bot.get("token", "")}'},
                timeout=5)
            if resp.status_code == 200:
                info = resp.json()
                bot_info['name'] = info.get('username', 'Unknown Bot')
                avatar = info.get('avatar')
                bot_info['avatar_url'] = f"https://cdn.discordapp.com/avatars/{bot_id}/{avatar}.png" if avatar else None
            else:
                bot_info['name'] = bot.get('name', 'Unknown Bot')
                bot_info['avatar_url'] = None
        except:
            bot_info['name'] = bot.get('name', 'Unknown Bot')
            bot_info['avatar_url'] = None

        # Count guilds the bot is in
        bot_info['guild_count'] = len(bot.get('guilds', []))
        bots_public.append(bot_info)

    return jsonify({'bots': bots_public, 'username': None, 'avatar_url': None})

@app.route('/u/<slug>')
def vanity_profile(slug):
    """Public profile page for a vanity URL"""
    slug = slug.strip().lower()
    urls = load_vanity_urls()
    user_id = urls.get(slug)
    if not user_id:
        return render_template('404.html'), 404
    # If the logged-in bot dashboard user owns this slug, redirect to their dashboard
    current_user = session.get('bot_dashboard_user', {})
    if current_user.get('id') == user_id:
        return redirect('/bot-dashboard')
    return render_template('vanity-profile.html', slug=slug, user_id=user_id)

# ==================== CUB PROTECTOR DASHBOARD ====================

CUB_PROTECTOR_DIR = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'cub-protector'))
CUB_PROTECTOR_DATA_DIR = os.path.join(CUB_PROTECTOR_DIR, 'data')
CUB_PROTECTOR_TEMP_VOICE_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'temp_voice.json')
CUB_PROTECTOR_REDIRECT_URI = os.environ.get('CUB_PROTECTOR_REDIRECT_URI', 'https://cubsoftware.site/cub-protector/auth/callback')
CUB_PROTECTOR_BOT_MASTERS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'bot_masters.json')

def load_bot_masters():
    """Load bot masters data: {guild_id: [user_id, ...]}"""
    if os.path.exists(CUB_PROTECTOR_BOT_MASTERS_FILE):
        try:
            with open(CUB_PROTECTOR_BOT_MASTERS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_bot_masters(data):
    os.makedirs(os.path.dirname(CUB_PROTECTOR_BOT_MASTERS_FILE), exist_ok=True)
    with open(CUB_PROTECTOR_BOT_MASTERS_FILE, 'w') as f:
        json.dump(data, f, indent=2)
CUB_PROTECTOR_CLIENT_ID = '1044032842352574554'

def get_cub_protector_token():
    """Read CUB PROTECTOR bot token from its .env file"""
    env_file = os.path.join(CUB_PROTECTOR_DIR, '.env')
    if os.path.exists(env_file):
        try:
            with open(env_file, 'r') as f:
                for line in f:
                    line = line.strip()
                    if line.startswith('DISCORD_TOKEN='):
                        return line.split('=', 1)[1].strip()
        except:
            pass
    return os.environ.get('CUB_PROTECTOR_TOKEN', '')

def load_cub_protector_data():
    """Load CUB PROTECTOR temp voice data"""
    if os.path.exists(CUB_PROTECTOR_TEMP_VOICE_FILE):
        try:
            with open(CUB_PROTECTOR_TEMP_VOICE_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'guilds': {}}

def save_cub_protector_data(data):
    """Save CUB PROTECTOR temp voice data"""
    os.makedirs(os.path.dirname(CUB_PROTECTOR_TEMP_VOICE_FILE), exist_ok=True)
    with open(CUB_PROTECTOR_TEMP_VOICE_FILE, 'w') as f:
        json.dump(data, f, indent=2)

# Simple cache for Discord API GET requests to avoid rate limits
_discord_api_cache = {}  # key -> {'data': ..., 'expires': timestamp}
DISCORD_CACHE_TTL = 300  # Cache GET responses for 5 minutes

def _get_cached(key):
    import time as _time
    entry = _discord_api_cache.get(key)
    if entry and _time.time() < entry['expires']:
        return entry['data']
    return None

def _set_cache(key, data):
    import time as _time
    _discord_api_cache[key] = {'data': data, 'expires': _time.time() + DISCORD_CACHE_TTL}
    # Clean old entries periodically (keep cache small)
    if len(_discord_api_cache) > 200:
        now = _time.time()
        expired = [k for k, v in _discord_api_cache.items() if now >= v['expires']]
        for k in expired:
            del _discord_api_cache[k]

def cub_protector_bot_request(endpoint_or_method, endpoint_or_none=None, method='GET', json_data=None, json=None, params=None, bypass_cache=False, token=None):
    """Make a request to Discord API using the CUB PROTECTOR bot token (with rate limit retry + caching for GETs).
    Supports two calling conventions:
      cub_protector_bot_request('/endpoint')  -- old style
      cub_protector_bot_request('GET', '/endpoint')  -- new style
      cub_protector_bot_request('POST', '/endpoint', json={...})  -- new style with json
    Pass bypass_cache=True to always fetch fresh (skips read and write of cache).
    Pass token=... to override the default bot token (e.g. for custom bots).
    """
    import time as _time
    # Handle both calling conventions
    if endpoint_or_none is not None and endpoint_or_method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE'):
        actual_method = endpoint_or_method
        actual_endpoint = endpoint_or_none
    else:
        actual_endpoint = endpoint_or_method
        actual_method = method
    # json kwarg alias
    if json is not None and json_data is None:
        json_data = json
    if token is None:
        token = get_cub_protector_token()
    if not token:
        app.logger.error('CUB PROTECTOR token not found')
        return None

    # Check cache for GET requests (unless bypass_cache is set)
    # Include a short token fingerprint so different bots don't share cache entries
    cache_key = None
    if actual_method == 'GET' and not bypass_cache:
        param_str = str(sorted(params.items())) if params else ''
        token_fp = token[-8:] if token else 'none'
        cache_key = f'{actual_endpoint}:{param_str}:{token_fp}'
        cached = _get_cached(cache_key)
        if cached is not None:
            return cached
    url = f'https://discord.com/api/v10{actual_endpoint}'
    headers = {
        'Authorization': f'Bot {token}',
        'Content-Type': 'application/json'
    }
    for attempt in range(3):
        try:
            if actual_method == 'GET':
                resp = requests.get(url, headers=headers, params=params, timeout=10)
            elif actual_method == 'POST':
                resp = requests.post(url, headers=headers, json=json_data, params=params, timeout=10)
            elif actual_method == 'PUT':
                resp = requests.put(url, headers=headers, json=json_data, params=params, timeout=10)
            elif actual_method == 'DELETE':
                resp = requests.delete(url, headers=headers, json=json_data, params=params, timeout=10)
            elif actual_method == 'PATCH':
                resp = requests.patch(url, headers=headers, json=json_data, params=params, timeout=10)
            else:
                return None
            if resp.status_code in (200, 201):
                try:
                    result = resp.json()
                except Exception:
                    result = {}
                # Cache GET responses
                if cache_key:
                    _set_cache(cache_key, result)
                return result
            elif resp.status_code == 204:
                return {}
            elif resp.status_code == 429:
                retry_after = resp.json().get('retry_after', 1)
                app.logger.warning(f'CUB PROTECTOR rate limited, retrying in {retry_after}s (attempt {attempt + 1})')
                _time.sleep(min(retry_after + 0.1, 5))
                continue
            else:
                app.logger.error(f'CUB PROTECTOR API error {resp.status_code}: {resp.text[:200]}')
                return None
        except Exception as e:
            app.logger.error(f'CUB PROTECTOR API request failed: {e}')
            return None
    app.logger.error(f'CUB PROTECTOR API rate limited after 3 retries: {actual_endpoint}')
    return None

def cub_protector_auth_required(f):
    """Decorator to require CUB PROTECTOR dashboard authentication"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if IS_DEV:
            if 'cub_protector_user' not in session:
                session['cub_protector_user'] = DEV_USER
            return f(*args, **kwargs)
        user = session.get('cub_protector_user')
        if not user:
            if request.is_json or request.path.startswith('/api/cub-protector/'):
                return jsonify({'error': 'Authentication required'}), 401
            return redirect(f'/login?next={urllib.parse.quote(request.path)}')
        # Rate limit all CUB PROTECTOR API calls per authenticated IP
        ip = get_client_ip()
        allowed, retry_after = check_rate_limit(ip, 'dashboard')
        if not allowed:
            return jsonify({'error': 'Rate limit exceeded', 'retry_after': int(retry_after)}), 429
        return f(*args, **kwargs)
    return decorated_function

def get_user_bot_guilds(user_guilds):
    """
    Compare user's guilds with the bot's guilds.
    Returns a list of guilds where both the user and bot are present
    (either the main bot OR an enabled custom bot counts as bot presence),
    with role labels (Owner, Bot Master, Member).
    """
    # Get main bot's guilds (with_counts=true gives approximate_member_count)
    bot_guilds = cub_protector_bot_request('/users/@me/guilds?with_counts=true') or []

    bot_guild_ids = {g['id'] for g in bot_guilds}
    bot_guild_counts = {g['id']: g.get('approximate_member_count') for g in bot_guilds}

    # Also include guilds that have an enabled custom bot — these act as the main bot
    custom_bots_data = _load_custom_bots()
    custom_bot_entries = {
        gid: entry for gid, entry in custom_bots_data.get('guilds', {}).items()
        if entry.get('enabled') and entry.get('token')
    }
    custom_bot_guild_ids = set(custom_bot_entries.keys())

    # A guild qualifies if either the main bot OR a custom bot is present
    all_covered_guild_ids = bot_guild_ids | custom_bot_guild_ids

    # Load bot masters to check for dashboard-granted access
    bot_masters_data = load_bot_masters()
    user_id = session.get('cub_protector_user', {}).get('id', '')

    shared_guilds = []
    for guild in user_guilds:
        if guild['id'] not in all_covered_guild_ids:
            continue

        permissions = int(guild.get('permissions', 0))
        is_owner = guild.get('owner', False)
        is_admin = (permissions & 0x8) == 0x8 or (permissions & 0x20) == 0x20
        is_bot_master = user_id in bot_masters_data.get(guild['id'], [])

        if is_owner:
            role_label = 'Owner'
            role_class = 'owner'
        elif is_admin or is_bot_master:
            role_label = 'Bot Master'
            role_class = 'admin'
        else:
            role_label = 'Member'
            role_class = 'member'

        # Member count: from main bot if present, otherwise fetch via custom bot token
        member_count = bot_guild_counts.get(guild['id'])
        if member_count is None and guild['id'] in custom_bot_entries:
            try:
                token = custom_bot_entries[guild['id']]['token']
                resp = requests.get(
                    f"https://discord.com/api/v10/guilds/{guild['id']}",
                    headers={'Authorization': f'Bot {token}', 'Content-Type': 'application/json'},
                    params={'with_counts': 'true'},
                    timeout=5,
                )
                if resp.status_code == 200:
                    member_count = resp.json().get('approximate_member_count')
            except Exception:
                pass

        shared_guilds.append({
            'id': guild['id'],
            'name': guild['name'],
            'icon': guild.get('icon'),
            'owner': is_owner,
            'permissions': permissions,
            'role_label': role_label,
            'role_class': role_class,
            'member_count': member_count,
            'has_custom_bot': guild['id'] in custom_bot_guild_ids,
        })

    return shared_guilds

# CUB PROTECTOR OAuth — unified login handles everything
@app.route('/cub-protector/auth/discord')
def cub_protector_auth():
    return redirect('/login?next=/cub-protector')

@app.route('/cub-protector/auth/callback')
def cub_protector_callback():
    """Legacy callback — no longer used."""
    return redirect('/login?next=/cub-protector')

@app.route('/cub-protector/auth/logout')
def cub_protector_logout():
    session.pop('cub_protector_user', None)
    session.pop('cub_protector_user_guilds', None)
    session.pop('cub_protector_shared_guild_ids', None)
    return redirect('/logout')

# CUB PROTECTOR Landing Page + Dashboard
@app.route('/cub-protector')
@app.route('/cub-protector/')
def cub_protector_page():
    """CUB PROTECTOR - Landing page for visitors, dashboard for authenticated users"""
    user = session.get('cub_protector_user')
    if user:
        return render_template('cub-protector-dashboard.html', user=user)
    return render_template('cub-protector.html')

# CUB PROTECTOR API Routes
@app.route('/api/cub-protector/overview')
@cub_protector_auth_required
def cub_protector_overview():
    """Get CUB PROTECTOR overview stats — global totals across all bot guilds"""
    # Load temp voice data and sum across ALL guilds the bot is in
    tv_data = load_cub_protector_data()
    total_hubs = 0
    total_active = 0
    for gid, guild_data in tv_data.get('guilds', {}).items():
        total_hubs += len(guild_data.get('hubs', {}))
        total_active += len(guild_data.get('active_channels', {}))

    # Check bot status
    bot_user = cub_protector_bot_request('/users/@me')
    bot_status = 'Online' if bot_user else 'Offline'

    # Get all bot guilds with member counts in one cached API call
    bot_guilds = cub_protector_bot_request('/users/@me/guilds?with_counts=true') or []
    total_servers = len(bot_guilds)
    total_members = sum(g.get('approximate_member_count', 0) for g in bot_guilds if isinstance(g, dict))

    return jsonify({
        'total_hubs': total_hubs,
        'total_active_channels': total_active,
        'total_members': total_members,
        'total_servers': total_servers,
        'bot_status': bot_status,
    })

@app.route('/api/cub-protector/guilds')
@cub_protector_auth_required
def cub_protector_guilds():
    """Get guilds where both the user and bot are present"""
    user_guilds = session.get('cub_protector_user_guilds', [])
    shared_guilds = get_user_bot_guilds(user_guilds)

    # Cache shared guild IDs in session for fast access checks
    session['cub_protector_shared_guild_ids'] = [g['id'] for g in shared_guilds]
    session['cub_protector_guild_cache_time'] = time.time()

    # Member counts are fetched individually via the overview endpoint when a guild is selected.
    # Fetching them for every guild here would make one Discord API call per guild on every list load.

    return jsonify({'guilds': shared_guilds})

@app.route('/api/cub-protector/guilds/<guild_id>/hubs')
@cub_protector_auth_required
def cub_protector_get_hubs(guild_id):
    """Get hubs for a specific guild"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})
    hubs = guild_data.get('hubs', {})

    hub_list = []
    for hub_id, hub in hubs.items():
        active_count = 0
        for ch_id, ch in guild_data.get('active_channels', {}).items():
            if ch.get('hub_id') == hub_id:
                active_count += 1

        hub_list.append({
            'hub_id': hub_id,
            'hub_name': hub.get('hub_name', 'Hub'),
            'name_template': hub.get('name_template', '🔊・{username}'),
            'user_limit': hub.get('user_limit', 0),
            'bitrate': hub.get('bitrate', 64),
            'keep_alive': hub.get('keep_alive', 0),
            'ownership_lock': hub.get('ownership_lock', -1),
            'category_id': hub.get('category_id', ''),
            'active_count': active_count
        })

    return jsonify({'hubs': hub_list})

@app.route('/api/cub-protector/guilds/<guild_id>/hubs', methods=['POST'])
@cub_protector_auth_required
def cub_protector_create_hub(guild_id):
    """Create a new hub for a specific guild"""
    # Verify user has access (must be Owner or Bot Master)
    user_guilds = session.get('cub_protector_user_guilds', [])
    shared_guilds = get_user_bot_guilds(user_guilds)
    guild = None
    for g in shared_guilds:
        if g['id'] == guild_id:
            guild = g
            break
    if not guild:
        return jsonify({'error': 'Access denied'}), 403
    if guild['role_class'] == 'member':
        return jsonify({'error': 'Only server owners and admins can create hubs'}), 403

    req_data = request.get_json()
    if not req_data:
        return jsonify({'error': 'No data provided'}), 400

    category_id = req_data.get('category_id')
    if not category_id:
        return jsonify({'error': 'Category is required'}), 400

    hub_name = req_data.get('hub_name', '➕ Join to Create')
    name_template = req_data.get('name_template', '🔊・{username}')
    user_limit = req_data.get('user_limit', 0)
    bitrate = req_data.get('bitrate', 64)
    keep_alive = req_data.get('keep_alive', 0)
    ownership_lock = req_data.get('ownership_lock', -1)

    # Create the hub voice channel via Discord API
    channel_data = _guild_bot_request(guild_id, f'/guilds/{guild_id}/channels', method='POST', json_data={
        'name': hub_name,
        'type': 2,  # GUILD_VOICE
        'parent_id': category_id,
        'user_limit': 1,  # Hub should have 1 user limit to trigger moves
    })

    if not channel_data:
        return jsonify({'error': 'Failed to create hub channel on Discord'}), 500

    hub_channel_id = channel_data['id']

    # Save to temp_voice.json
    try:
        tv_data = load_cub_protector_data()
        if guild_id not in tv_data['guilds']:
            tv_data['guilds'][guild_id] = {'hubs': {}, 'active_channels': {}}

        tv_data['guilds'][guild_id]['hubs'][hub_channel_id] = {
            'hub_name': hub_name,
            'name_template': name_template,
            'user_limit': user_limit,
            'bitrate': bitrate,  # Store as kbps, bot converts to bps
            'keep_alive': keep_alive,
            'ownership_lock': ownership_lock,
            'category_id': category_id,
            'default_visibility': 'hidden'
        }

        save_cub_protector_data(tv_data)
    except Exception as e:
        app.logger.error(f'Failed to save hub data: {e} (path: {CUB_PROTECTOR_TEMP_VOICE_FILE})')
        return jsonify({'success': True, 'hub_id': hub_channel_id, 'warning': f'Channel created but failed to save config: {str(e)}'}), 200

    return jsonify({'success': True, 'hub_id': hub_channel_id})

@app.route('/api/cub-protector/guilds/<guild_id>/hubs/<hub_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_delete_hub(guild_id, hub_id):
    """Delete a hub and optionally its active temp channels"""
    # Verify user has access (must be Owner or Bot Master)
    user_guilds = session.get('cub_protector_user_guilds', [])
    shared_guilds = get_user_bot_guilds(user_guilds)
    guild = None
    for g in shared_guilds:
        if g['id'] == guild_id:
            guild = g
            break
    if not guild:
        return jsonify({'error': 'Access denied'}), 403
    if guild['role_class'] == 'member':
        return jsonify({'error': 'Only server owners and admins can delete hubs'}), 403

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})

    if hub_id not in guild_data.get('hubs', {}):
        return jsonify({'error': 'Hub not found'}), 404

    # Delete the hub voice channel from Discord
    cub_protector_bot_request(f'/channels/{hub_id}', method='DELETE')

    # Delete all active temp channels belonging to this hub
    active = guild_data.get('active_channels', {})
    to_delete = [ch_id for ch_id, ch in active.items() if ch.get('hub_id') == hub_id]
    for ch_id in to_delete:
        cub_protector_bot_request(f'/channels/{ch_id}', method='DELETE')
        del tv_data['guilds'][guild_id]['active_channels'][ch_id]

    # Remove hub from data
    del tv_data['guilds'][guild_id]['hubs'][hub_id]
    save_cub_protector_data(tv_data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/hubs/<hub_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_edit_hub(guild_id, hub_id):
    """Edit a hub's settings"""
    user_guilds = session.get('cub_protector_user_guilds', [])
    shared_guilds = get_user_bot_guilds(user_guilds)
    guild = None
    for g in shared_guilds:
        if g['id'] == guild_id:
            guild = g
            break
    if not guild:
        return jsonify({'error': 'Access denied'}), 403
    if guild['role_class'] == 'member':
        return jsonify({'error': 'Only server owners and admins can edit hubs'}), 403

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})

    if hub_id not in guild_data.get('hubs', {}):
        return jsonify({'error': 'Hub not found'}), 404

    req_data = request.get_json()
    if not req_data:
        return jsonify({'error': 'No data provided'}), 400

    hub = tv_data['guilds'][guild_id]['hubs'][hub_id]

    # Update allowed fields
    if 'hub_name' in req_data:
        hub['hub_name'] = req_data['hub_name']
        # Also rename the Discord channel
        cub_protector_bot_request(f'/channels/{hub_id}', method='PATCH', json_data={'name': req_data['hub_name']})
    if 'name_template' in req_data:
        hub['name_template'] = req_data['name_template']
    if 'user_limit' in req_data:
        hub['user_limit'] = int(req_data['user_limit'])
    if 'bitrate' in req_data:
        hub['bitrate'] = int(req_data['bitrate'])
    if 'keep_alive' in req_data:
        hub['keep_alive'] = int(req_data['keep_alive'])
    if 'ownership_lock' in req_data:
        hub['ownership_lock'] = int(req_data['ownership_lock'])

    save_cub_protector_data(tv_data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/voice-mods')
@cub_protector_auth_required
def cub_protector_get_voice_mods(guild_id):
    """Get voice moderator roles and users for a guild"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})
    mods = guild_data.get('voice_moderators', {'roles': [], 'users': []})

    # Resolve role names from bot API
    roles_info = []
    guild_roles = _guild_bot_request(guild_id, f'/guilds/{guild_id}/roles')
    role_map = {r['id']: r['name'] for r in (guild_roles or [])}
    for role_id in mods.get('roles', []):
        roles_info.append({'id': role_id, 'name': role_map.get(role_id, role_id)})

    # Resolve usernames from bot API
    users_info = []
    for user_id in mods.get('users', []):
        user_data = cub_protector_bot_request(f'/users/{user_id}')
        if user_data:
            users_info.append({'id': user_id, 'username': user_data.get('username', user_id)})
        else:
            users_info.append({'id': user_id, 'username': user_id})

    return jsonify({'voice_moderators': {'roles': roles_info, 'users': users_info}})

@app.route('/api/cub-protector/guilds/<guild_id>/voice-mods/roles', methods=['POST'])
@cub_protector_auth_required
def cub_protector_add_voice_mod_role(guild_id):
    """Add a voice moderator role"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req_data = request.get_json()
    role_id = req_data.get('role_id')
    if not role_id:
        return jsonify({'error': 'role_id required'}), 400

    tv_data = load_cub_protector_data()
    if guild_id not in tv_data.get('guilds', {}):
        tv_data.setdefault('guilds', {})[guild_id] = {'hubs': {}, 'active_channels': {}}
    guild_data = tv_data['guilds'][guild_id]
    if 'voice_moderators' not in guild_data:
        guild_data['voice_moderators'] = {'roles': [], 'users': []}

    if role_id not in guild_data['voice_moderators']['roles']:
        guild_data['voice_moderators']['roles'].append(role_id)
        save_cub_protector_data(tv_data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/voice-mods/roles', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_remove_voice_mod_role(guild_id):
    """Remove a voice moderator role"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req_data = request.get_json()
    role_id = req_data.get('role_id')
    if not role_id:
        return jsonify({'error': 'role_id required'}), 400

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})
    mods = guild_data.get('voice_moderators', {'roles': [], 'users': []})
    mods['roles'] = [r for r in mods.get('roles', []) if r != role_id]
    guild_data['voice_moderators'] = mods
    save_cub_protector_data(tv_data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/voice-mods/users', methods=['POST'])
@cub_protector_auth_required
def cub_protector_add_voice_mod_user(guild_id):
    """Add an individual voice moderator by user ID"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req_data = request.get_json()
    user_id = req_data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    tv_data = load_cub_protector_data()
    if guild_id not in tv_data.get('guilds', {}):
        tv_data.setdefault('guilds', {})[guild_id] = {'hubs': {}, 'active_channels': {}}
    guild_data = tv_data['guilds'][guild_id]
    if 'voice_moderators' not in guild_data:
        guild_data['voice_moderators'] = {'roles': [], 'users': []}

    if user_id not in guild_data['voice_moderators']['users']:
        guild_data['voice_moderators']['users'].append(user_id)
        save_cub_protector_data(tv_data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/voice-mods/users', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_remove_voice_mod_user(guild_id):
    """Remove an individual voice moderator"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req_data = request.get_json()
    user_id = req_data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})
    mods = guild_data.get('voice_moderators', {'roles': [], 'users': []})
    mods['users'] = [u for u in mods.get('users', []) if u != user_id]
    guild_data['voice_moderators'] = mods
    save_cub_protector_data(tv_data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/bot-masters')
@cub_protector_auth_required
def cub_protector_get_bot_masters(guild_id):
    """Get bot master user IDs for a guild"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    bot_masters_data = load_bot_masters()
    master_ids = bot_masters_data.get(guild_id, [])

    # Resolve usernames from bot API
    masters_info = []
    for user_id in master_ids:
        user_data = cub_protector_bot_request(f'/users/{user_id}')
        if user_data:
            masters_info.append({'id': user_id, 'username': user_data.get('username', user_id)})
        else:
            masters_info.append({'id': user_id, 'username': user_id})

    return jsonify({'bot_masters': masters_info})

@app.route('/api/cub-protector/guilds/<guild_id>/bot-masters', methods=['POST'])
@cub_protector_auth_required
def cub_protector_add_bot_master(guild_id):
    """Add a bot master user ID - only owners and admins can do this"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    # Check that the current user is the guild owner or has ADMINISTRATOR permission
    user_guilds = session.get('cub_protector_user_guilds', [])
    guild_info = next((g for g in user_guilds if g['id'] == guild_id), None)
    if not guild_info:
        return jsonify({'error': 'Access denied'}), 403

    is_owner = guild_info.get('owner', False)
    permissions = int(guild_info.get('permissions', 0))
    is_admin = (permissions & 0x8) == 0x8

    if not is_owner and not is_admin:
        return jsonify({'error': 'Only server owners and administrators can manage bot masters'}), 403

    req_data = request.get_json()
    user_id = req_data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    bot_masters_data = load_bot_masters()
    if guild_id not in bot_masters_data:
        bot_masters_data[guild_id] = []

    if user_id not in bot_masters_data[guild_id]:
        bot_masters_data[guild_id].append(user_id)
        save_bot_masters(bot_masters_data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/bot-masters', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_remove_bot_master(guild_id):
    """Remove a bot master user ID - only owners and admins can do this"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    # Check that the current user is the guild owner or has ADMINISTRATOR permission
    user_guilds = session.get('cub_protector_user_guilds', [])
    guild_info = next((g for g in user_guilds if g['id'] == guild_id), None)
    if not guild_info:
        return jsonify({'error': 'Access denied'}), 403

    is_owner = guild_info.get('owner', False)
    permissions = int(guild_info.get('permissions', 0))
    is_admin = (permissions & 0x8) == 0x8

    if not is_owner and not is_admin:
        return jsonify({'error': 'Only server owners and administrators can manage bot masters'}), 403

    req_data = request.get_json()
    user_id = req_data.get('user_id')
    if not user_id:
        return jsonify({'error': 'user_id required'}), 400

    bot_masters_data = load_bot_masters()
    bot_masters_data[guild_id] = [u for u in bot_masters_data.get(guild_id, []) if u != user_id]
    save_bot_masters(bot_masters_data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/active-channels')
@cub_protector_auth_required
def cub_protector_active_channels(guild_id):
    """Get active temporary voice channels for a guild"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})
    active = guild_data.get('active_channels', {})

    channels = []
    for ch_id, ch in active.items():
        # Try to get channel info from Discord for the current name
        channel_info = cub_protector_bot_request(f'/channels/{ch_id}')
        channel_name = channel_info.get('name', 'Unknown') if channel_info else 'Unknown'

        # Resolve permitted user IDs to names where possible
        permitted_ids = ch.get('permitted_users', [])
        permitted_users = []
        for uid in permitted_ids:
            user_info = cub_protector_bot_request(f'/users/{uid}')
            if user_info:
                uname = user_info.get('global_name') or user_info.get('username') or uid
                permitted_users.append({'id': uid, 'name': uname})
            else:
                permitted_users.append({'id': uid, 'name': uid})

        channels.append({
            'id': ch_id,
            'name': channel_name,
            'owner_id': ch.get('owner_id', ''),
            'owner_name': ch.get('owner_name', ch.get('owner_id', 'Unknown')),
            'hub_id': ch.get('hub_id', ''),
            'hidden': ch.get('hidden', False),
            'locked': ch.get('locked', False),
            'created_at': ch.get('created_at', 0),
            'permitted_users': permitted_users
        })

    return jsonify({'channels': channels})

@app.route('/api/cub-protector/guilds/<guild_id>/active-channels/<channel_id>/permit/<user_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_unpermit_user(guild_id, channel_id, user_id):
    """Remove a user's permission to access a temporary voice channel"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    tv_data = load_cub_protector_data()
    guild_data = tv_data.get('guilds', {}).get(guild_id, {})
    active = guild_data.get('active_channels', {})

    if channel_id not in active:
        return jsonify({'error': 'Channel not found'}), 404

    ch = active[channel_id]
    permitted = ch.get('permitted_users', [])
    if user_id not in permitted:
        return jsonify({'error': 'User not in permitted list'}), 404

    # Remove from permitted_users list
    ch['permitted_users'] = [uid for uid in permitted if uid != user_id]
    save_cub_protector_data(tv_data)

    # Remove the Discord permission overwrite
    cub_protector_bot_request('DELETE', f'/channels/{channel_id}/permissions/{user_id}')

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/categories')
@cub_protector_auth_required
def cub_protector_categories(guild_id):
    """Get categories for a guild (for hub creation)"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    # Get all channels from the guild
    channels = _guild_bot_request(guild_id, f'/guilds/{guild_id}/channels')
    if not channels:
        return jsonify({'categories': []})

    # Filter to category channels (type 4)
    categories = [
        {'id': ch['id'], 'name': ch['name']}
        for ch in channels if ch.get('type') == 4
    ]
    categories.sort(key=lambda c: c['name'])

    return jsonify({'categories': categories})

# ==================== CUB PROTECTOR - MODERATION API ====================

CUB_PROTECTOR_MODERATION_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'moderation.json')
CUB_PROTECTOR_AUTOMOD_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'automod.json')
CUB_PROTECTOR_LOGGING_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'logging.json')
CUB_PROTECTOR_WELCOME_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'welcome.json')
CUB_PROTECTOR_LEVELS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'levels.json')
CUB_PROTECTOR_ECONOMY_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'economy.json')
CUB_PROTECTOR_GAMES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'games.json')
CUB_PROTECTOR_TICKETS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'tickets.json')
CUB_PROTECTOR_GIVEAWAYS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'giveaways.json')
CUB_PROTECTOR_STATS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'stats.json')
CUB_PROTECTOR_AUTOROLES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'autoroles.json')
CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'scheduled_messages.json')
CUB_PROTECTOR_CUSTOM_EMBEDS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'custom_embeds.json')
CUB_PROTECTOR_BACKUPS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'backups.json')
CUB_PROTECTOR_SOCIAL_FEEDS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'social_feeds.json')
CUB_PROTECTOR_LIVE_ALERTS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'live_alerts.json')
CUSTOM_BOTS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'custom_bots.json')
CUB_PROTECTOR_REACTION_ROLES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'reaction_roles.json')
CUB_PROTECTOR_CUSTOM_COMMANDS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'custom_commands.json')
CUB_PROTECTOR_STARBOARD_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'starboard.json')
CUB_PROTECTOR_AFK_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'afk.json')
CUB_PROTECTOR_SUGGESTIONS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'suggestions.json')
CUB_PROTECTOR_ANTI_RAID_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'anti_raid.json')
CUB_PROTECTOR_WARNINGS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'warnings.json')
CUB_PROTECTOR_ANNOUNCEMENTS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'announcements.json')
CUB_PROTECTOR_SLOWMODE_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'slowmode.json')
CUB_PROTECTOR_LOCKDOWN_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'lockdown.json')
CUB_PROTECTOR_PURGE_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'purge.json')
CUB_PROTECTOR_NICKNAMES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'nicknames.json')
CUB_PROTECTOR_INVITE_TRACKER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'invite_tracker.json')
CUB_PROTECTOR_ALT_DETECTION_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'alt_detection.json')
CUB_PROTECTOR_ANTI_PHISHING_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'anti_phishing.json')
CUB_PROTECTOR_WORD_FILTER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'word_filter.json')
CUB_PROTECTOR_MENTION_PROTECTION_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'mention_protection.json')
CUB_PROTECTOR_VERIFICATION_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'verification.json')
CUB_PROTECTOR_QUARANTINE_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'quarantine.json')
CUB_PROTECTOR_ANTI_NUKE_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'anti_nuke.json')
CUB_PROTECTOR_MODMAIL_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'modmail.json')
CUB_PROTECTOR_REPORTS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'reports.json')
CUB_PROTECTOR_BAN_APPEALS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'ban_appeals.json')
CUB_PROTECTOR_USER_NOTES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'user_notes.json')
CUB_PROTECTOR_BIRTHDAYS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'birthdays.json')
CUB_PROTECTOR_BOOST_REWARDS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'boost_rewards.json')
CUB_PROTECTOR_AUTO_RESPONDER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'auto_responder.json')
CUB_PROTECTOR_KEYWORD_ALERTS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'keyword_alerts.json')
CUB_PROTECTOR_TEMP_ROLES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'temp_roles.json')
CUB_PROTECTOR_AUTO_THREAD_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'auto_thread.json')
CUB_PROTECTOR_SERVER_RULES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'server_rules.json')
CUB_PROTECTOR_POLLS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'polls.json')
CUB_PROTECTOR_MESSAGE_LOGGER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'message_logger.json')
CUB_PROTECTOR_VOICE_LOGGER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'voice_logger.json')
CUB_PROTECTOR_JOIN_LEAVE_LOGGER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'join_leave_logger.json')
CUB_PROTECTOR_NAME_LOGGER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'name_logger.json')
CUB_PROTECTOR_EMOJI_STATS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'emoji_stats.json')
CUB_PROTECTOR_CHANNEL_ACTIVITY_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'channel_activity.json')
CUB_PROTECTOR_REMINDERS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'reminders.json')
CUB_PROTECTOR_COLOR_ROLES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'color_roles.json')
CUB_PROTECTOR_STICKY_MESSAGES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'sticky_messages.json')
CUB_PROTECTOR_ANTI_HOIST_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'anti_hoist.json')
CUB_PROTECTOR_LINK_FILTER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'link_filter.json')
CUB_PROTECTOR_MEDIA_CHANNELS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'media_channels.json')
CUB_PROTECTOR_BOOST_TRACKER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'boost_tracker.json')
CUB_PROTECTOR_ROLE_LOGGER_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'role_logger.json')
CUB_PROTECTOR_COUNTERS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'counters.json')
CUB_PROTECTOR_COUNTING_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'counting.json')
CUB_PROTECTOR_QUOTES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'quotes.json')
CUB_PROTECTOR_CONFESSIONS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'confessions.json')
CUB_PROTECTOR_ROLE_MENUS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'role_menus.json')

def load_cp_json(filepath):
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r') as f:
                return json.load(f)
    except Exception as e:
        app.logger.error(f'Failed to load {filepath}: {e}')
    return {'guilds': {}}

def save_cp_json(filepath, data):
    try:
        dir_ = os.path.dirname(filepath)
        tmp_fd, tmp_path = tempfile.mkstemp(dir=dir_, suffix='.tmp')
        try:
            with os.fdopen(tmp_fd, 'w') as f:
                json.dump(data, f, indent=2)
            os.replace(tmp_path, filepath)
        except Exception:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise
    except Exception as e:
        app.logger.error(f'Failed to save {filepath}: {e}')

def check_cp_guild_access(guild_id):
    # Use cached shared guild IDs from session with a 5-minute TTL
    cached_ids = session.get('cub_protector_shared_guild_ids')
    cache_time = session.get('cub_protector_guild_cache_time', 0)
    cache_ttl = 300  # 5 minutes
    if cached_ids is not None and (time.time() - cache_time) < cache_ttl:
        return guild_id in cached_ids
    # Cache missing or expired — refresh from Discord
    user_guilds = session.get('cub_protector_user_guilds', [])
    shared_guilds = get_user_bot_guilds(user_guilds)
    shared_ids = [g['id'] for g in shared_guilds]
    session['cub_protector_shared_guild_ids'] = shared_ids
    session['cub_protector_guild_cache_time'] = time.time()
    return guild_id in shared_ids

@app.route('/api/cub-protector/guilds/<guild_id>/moderation')
@cub_protector_auth_required
def cub_protector_moderation(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'cases': guild_data.get('cases', []), 'warnings': guild_data.get('warnings', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/automod', methods=['GET'])
@cub_protector_auth_required
def cub_protector_automod_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_AUTOMOD_FILE)
    return jsonify({'config': data.get('guilds', {}).get(guild_id, {})})

@app.route('/api/cub-protector/guilds/<guild_id>/automod', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_automod_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_AUTOMOD_FILE)
    if guild_id not in data.get('guilds', {}):
        if 'guilds' not in data:
            data['guilds'] = {}
        data['guilds'][guild_id] = {
            'enabled': False,
            'bad_words': {'enabled': False, 'words': [], 'action': 'delete', 'exempt_roles': [], 'exempt_channels': []},
            'spam': {'enabled': False, 'max_messages': 5, 'interval': 5, 'action': 'mute', 'mute_duration': 300000, 'exempt_roles': [], 'exempt_channels': []},
            'caps': {'enabled': False, 'min_length': 8, 'max_percentage': 70, 'action': 'delete', 'exempt_roles': [], 'exempt_channels': []},
            'links': {'enabled': False, 'whitelist': [], 'blacklist': [], 'action': 'delete', 'exempt_roles': [], 'exempt_channels': []},
            'invites': {'enabled': False, 'action': 'delete', 'exempt_roles': [], 'exempt_channels': []},
            'mass_mentions': {'enabled': False, 'max_mentions': 5, 'action': 'mute', 'exempt_roles': [], 'exempt_channels': []},
            'emojis': {'enabled': False, 'max_emojis': 10, 'action': 'delete', 'exempt_roles': [], 'exempt_channels': []},
            'newlines': {'enabled': False, 'max_newlines': 10, 'action': 'delete', 'exempt_roles': [], 'exempt_channels': []},
            'duplicates': {'enabled': False, 'action': 'delete', 'exempt_roles': [], 'exempt_channels': []},
        }
    guild_am = data['guilds'][guild_id]
    if 'enabled' in req:
        guild_am['enabled'] = req['enabled']
    if 'toggle_filter' in req:
        f = req['toggle_filter']
        if f in guild_am and isinstance(guild_am[f], dict):
            guild_am[f]['enabled'] = not guild_am[f].get('enabled', False)
    # Add/remove bad words
    if 'add_bad_word' in req:
        word = req['add_bad_word'].strip().lower()
        if word and 'bad_words' in guild_am:
            if 'words' not in guild_am['bad_words']:
                guild_am['bad_words']['words'] = []
            if word not in guild_am['bad_words']['words']:
                guild_am['bad_words']['words'].append(word)
    if 'remove_bad_word' in req:
        word = req['remove_bad_word']
        if 'bad_words' in guild_am and 'words' in guild_am['bad_words']:
            guild_am['bad_words']['words'] = [w for w in guild_am['bad_words']['words'] if w != word]
    # Add/remove link whitelist domains
    if 'add_link_whitelist' in req:
        domain = req['add_link_whitelist'].strip().lower()
        if domain and 'links' in guild_am:
            if 'whitelist' not in guild_am['links']:
                guild_am['links']['whitelist'] = []
            if domain not in guild_am['links']['whitelist']:
                guild_am['links']['whitelist'].append(domain)
    if 'remove_link_whitelist' in req:
        domain = req['remove_link_whitelist']
        if 'links' in guild_am and 'whitelist' in guild_am['links']:
            guild_am['links']['whitelist'] = [d for d in guild_am['links']['whitelist'] if d != domain]
    # Update filter settings (action, thresholds)
    if 'update_filter' in req:
        f = req['update_filter']
        if f in guild_am and isinstance(guild_am[f], dict):
            if 'action' in req:
                guild_am[f]['action'] = req['action']
            if 'max_messages' in req:
                guild_am[f]['max_messages'] = req['max_messages']
            if 'interval' in req:
                guild_am[f]['interval'] = req['interval']
            if 'min_length' in req:
                guild_am[f]['min_length'] = req['min_length']
            if 'max_percentage' in req:
                guild_am[f]['max_percentage'] = req['max_percentage']
            if 'max_mentions' in req:
                guild_am[f]['max_mentions'] = req['max_mentions']
            if 'max_emojis' in req:
                guild_am[f]['max_emojis'] = req['max_emojis']
            if 'max_newlines' in req:
                guild_am[f]['max_newlines'] = req['max_newlines']
    # Global exempt roles/channels
    if 'exempt_roles' in req:
        guild_am['exempt_roles'] = [str(r) for r in req['exempt_roles'] if r][:20]
    if 'exempt_channels' in req:
        guild_am['exempt_channels'] = [str(c) for c in req['exempt_channels'] if c][:20]
    # Auto-mod log channel
    if 'log_channel' in req:
        guild_am['log_channel'] = str(req['log_channel']) if req['log_channel'] else ''
    save_cp_json(CUB_PROTECTOR_AUTOMOD_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/logging', methods=['GET'])
@cub_protector_auth_required
def cub_protector_logging_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_LOGGING_FILE)
    return jsonify({'config': data.get('guilds', {}).get(guild_id, {})})

@app.route('/api/cub-protector/guilds/<guild_id>/logging', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_logging_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_LOGGING_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': False, 'channels': {}}
    guild_log = data['guilds'][guild_id]
    if 'enabled' in req:
        guild_log['enabled'] = req['enabled']
    if 'channels' in req:
        guild_log['channels'] = req['channels']
    if 'log_bot_actions' in req:
        guild_log['log_bot_actions'] = bool(req['log_bot_actions'])
    if 'compact_mode' in req:
        guild_log['compact_mode'] = bool(req['compact_mode'])
    if 'ignore_channels' in req:
        guild_log['ignore_channels'] = [str(c) for c in req['ignore_channels'] if c][:50]
    if 'ignore_roles' in req:
        guild_log['ignore_roles'] = [str(r) for r in req['ignore_roles'] if r][:50]
    save_cp_json(CUB_PROTECTOR_LOGGING_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/welcome', methods=['GET'])
@cub_protector_auth_required
def cub_protector_welcome_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_WELCOME_FILE)
    return jsonify({'config': data.get('guilds', {}).get(guild_id, {})})

@app.route('/api/cub-protector/guilds/<guild_id>/welcome', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_welcome_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_WELCOME_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {
            'welcome': {
                'enabled': False, 'channel_id': None, 'message': 'Welcome {user}!', 'dm_message': None,
                'format': 'embed', 'embed_title': '', 'embed_color': '#5865f2', 'embed_image': '',
                'embed_thumbnail': '', 'embed_footer': '', 'mention': False, 'autodelete': 0, 'show_count': False,
                'autorole_enabled': False, 'auto_roles': [], 'autorole_delay': 0, 'banner_url': '',
            },
            'goodbye': {
                'enabled': False, 'channel_id': None, 'message': 'Goodbye {user}!',
                'format': 'embed', 'embed_title': '', 'embed_color': '#ed4245', 'embed_image': '',
                'autodelete': 0, 'show_count': False,
            },
        }
    guild_w = data['guilds'][guild_id]
    if 'welcome' in req:
        for k, v in req['welcome'].items():
            guild_w['welcome'][k] = v
    if 'goodbye' in req:
        for k, v in req['goodbye'].items():
            guild_w['goodbye'][k] = v
    save_cp_json(CUB_PROTECTOR_WELCOME_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/welcome/test', methods=['POST'])
@cub_protector_auth_required
def cub_protector_welcome_test(guild_id):
    """Send a test welcome message to the specified channel"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    channel_id = req.get('channel_id')
    if not channel_id:
        return jsonify({'error': 'No channel specified'}), 400
    data = load_cp_json(CUB_PROTECTOR_WELCOME_FILE)
    guild_w = data.get('guilds', {}).get(guild_id, {})
    welcome = guild_w.get('welcome', {})
    msg_text = (welcome.get('message') or 'Welcome to {server}, {user}!').replace('{user}', '@TestUser').replace('{username}', 'TestUser').replace('{server}', 'Your Server').replace('{membercount}', '100').replace('{usertag}', 'TestUser#0000')
    fmt = welcome.get('format', 'embed')
    if fmt == 'embed':
        embed = {
            'title': welcome.get('embed_title') or 'Welcome!',
            'description': msg_text,
            'color': int(welcome.get('embed_color', '#5865f2').lstrip('#'), 16),
        }
        if welcome.get('embed_footer'):
            embed['footer'] = {'text': welcome['embed_footer']}
        if welcome.get('embed_image'):
            embed['image'] = {'url': welcome['embed_image']}
        if welcome.get('embed_thumbnail'):
            embed['thumbnail'] = {'url': welcome['embed_thumbnail']}
        if welcome.get('banner_url'):
            embed['image'] = {'url': welcome['banner_url']}
        payload = {'content': '[TEST] Welcome message preview:', 'embeds': [embed]}
    else:
        payload = {'content': f'[TEST] {msg_text}'}
    result = cub_protector_bot_request(f'/channels/{channel_id}/messages', method='POST', json_data=payload)
    if result:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to send test message'}), 500

@app.route('/api/cub-protector/guilds/<guild_id>/channels')
@cub_protector_auth_required
def cub_protector_channels(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    channels = _guild_bot_request(guild_id, f'/guilds/{guild_id}/channels')
    if not channels:
        return jsonify({'channels': []})
    return jsonify({'channels': [{'id': c['id'], 'name': c['name'], 'type': c.get('type', 0)} for c in channels]})

@app.route('/api/cub-protector/guilds/<guild_id>/roles')
@cub_protector_auth_required
def cub_protector_roles(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    roles = _guild_bot_request(guild_id, f'/guilds/{guild_id}/roles')
    if not roles:
        return jsonify({'roles': []})
    # Filter out @everyone and managed/bot roles, sort by position descending
    filtered = [
        {'id': r['id'], 'name': r['name'], 'color': r.get('color', 0), 'position': r.get('position', 0)}
        for r in roles if r['name'] != '@everyone' and not r.get('managed', False)
    ]
    filtered.sort(key=lambda r: r['position'], reverse=True)
    return jsonify({'roles': filtered})

@app.route('/api/cub-protector/guilds/<guild_id>/leveling', methods=['GET'])
@cub_protector_auth_required
def cub_protector_leveling_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_LEVELS_FILE)
    guild_lvl = data.get('guilds', {}).get(guild_id, {})
    # Build leaderboard
    users = guild_lvl.get('users', {})
    sorted_users = sorted(users.items(), key=lambda x: x[1].get('xp', 0), reverse=True)[:10]
    import math
    leaderboard = []
    for user_id, udata in sorted_users:
        xp = udata.get('xp', 0)
        level = int(0.1 * math.sqrt(xp))
        leaderboard.append({'user_id': user_id, 'username': user_id, 'xp': xp, 'level': level})
    return jsonify({'config': guild_lvl, 'leaderboard': leaderboard})

@app.route('/api/cub-protector/guilds/<guild_id>/leveling', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_leveling_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_LEVELS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {
            'enabled': False, 'announce_channel': None, 'announce_type': 'current',
            'xp_min': 15, 'xp_max': 25, 'xp_cooldown': 60000,
            'no_xp_channels': [], 'no_xp_roles': [], 'xp_multiplier': 1,
            'role_rewards': {}, 'users': {},
        }
    guild_lvl = data['guilds'][guild_id]
    for k in ['enabled', 'xp_multiplier', 'announce_type', 'announce_channel', 'xp_min', 'xp_max', 'xp_cooldown', 'level_up_message', 'stack_rewards', 'no_xp_channels', 'no_xp_roles', 'role_rewards']:
        if k in req:
            guild_lvl[k] = req[k]
    save_cp_json(CUB_PROTECTOR_LEVELS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/economy', methods=['GET'])
@cub_protector_auth_required
def cub_protector_economy_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ECONOMY_FILE)
    guild_eco = data.get('guilds', {}).get(guild_id, {})
    users = guild_eco.get('users', {})
    sorted_users = sorted(users.items(), key=lambda x: x[1].get('balance', 0), reverse=True)[:10]
    leaderboard = [{'user_id': uid, 'username': uid, 'balance': udata.get('balance', 0)} for uid, udata in sorted_users]
    return jsonify({'config': guild_eco, 'leaderboard': leaderboard})

@app.route('/api/cub-protector/guilds/<guild_id>/economy', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_economy_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_ECONOMY_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'currency_name': 'Coins', 'currency_emoji': '🪙', 'daily_amount': 100, 'users': {}, 'shop': []}
    guild_eco = data['guilds'][guild_id]
    for k in ['currency_name', 'currency_emoji', 'daily_amount', 'work_min', 'work_max', 'work_cooldown', 'rob_enabled', 'rob_chance', 'rob_fine', 'starting_balance', 'shop']:
        if k in req:
            guild_eco[k] = req[k]
    save_cp_json(CUB_PROTECTOR_ECONOMY_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - GAMES CONFIG API ====================

ALL_GAMES = ['slots','blackjack','roulette','crash','scratch','coinbet','highlow',
             'tictactoe','connect4','rps','trivia','hangman','wordle','riddle',
             'scramble','typerace','mathrace','minesweeper','memory','numguess']

def default_games_guild():
    return {
        'enabled': True,
        'allowed_channels': [],
        'blocked_roles': [],
        'min_bet': 1,
        'max_bet': 10000,
        'bet_cooldown': 0,
        'channel_game_reward': 50,
        'channel_game_max_reward': 500,
        'games': {g: True for g in ALL_GAMES},
    }

@app.route('/api/cub-protector/guilds/<guild_id>/games', methods=['GET'])
@cub_protector_auth_required
def cub_protector_games_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_GAMES_FILE)
    config = data.get('guilds', {}).get(guild_id, default_games_guild())
    # Ensure all game keys exist
    if 'games' not in config:
        config['games'] = {g: True for g in ALL_GAMES}
    else:
        for g in ALL_GAMES:
            if g not in config['games']:
                config['games'][g] = True
    return jsonify({'config': config})

@app.route('/api/cub-protector/guilds/<guild_id>/games', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_games_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_GAMES_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = default_games_guild()
    cfg = data['guilds'][guild_id]
    for k in ['enabled', 'allowed_channels', 'blocked_roles', 'min_bet', 'max_bet',
              'bet_cooldown', 'channel_game_reward', 'channel_game_max_reward']:
        if k in req:
            cfg[k] = req[k]
    if 'games' in req and isinstance(req['games'], dict):
        if 'games' not in cfg:
            cfg['games'] = {}
        for g in ALL_GAMES:
            if g in req['games']:
                cfg['games'][g] = bool(req['games'][g])
    save_cp_json(CUB_PROTECTOR_GAMES_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - TICKETS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/tickets', methods=['GET'])
@cub_protector_auth_required
def cub_protector_tickets_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_TICKETS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({
        'config': {
            'support_role': guild_data.get('support_role', None),
            'transcript_channel': guild_data.get('transcript_channel', None),
            'log_channel': guild_data.get('log_channel', None),
            'max_per_user': guild_data.get('max_per_user', 1),
            'ping_support': guild_data.get('ping_support', False),
            'naming_format': guild_data.get('naming_format', 'type-ticket-id'),
            'panels': guild_data.get('panels', []),
            'auto_close_hours': guild_data.get('auto_close_hours', 0),
            'close_confirm': guild_data.get('close_confirm', False),
            'user_can_close': guild_data.get('user_can_close', True),
            'feedback': guild_data.get('feedback', False),
            'thread_mode': guild_data.get('thread_mode', False),
        },
        'tickets': guild_data.get('tickets', {}),
        'next_ticket_id': guild_data.get('next_ticket_id', 1),
    })

@app.route('/api/cub-protector/guilds/<guild_id>/tickets', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_tickets_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_TICKETS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'panels': [], 'tickets': {}, 'next_ticket_id': 1, 'support_role': None, 'transcript_channel': None}
    guild_t = data['guilds'][guild_id]
    for k in ['support_role', 'transcript_channel', 'log_channel']:
        if k in req:
            guild_t[k] = req[k] or None
    if 'max_per_user' in req:
        guild_t['max_per_user'] = max(0, min(10, int(req['max_per_user'])))
    if 'ping_support' in req:
        guild_t['ping_support'] = bool(req['ping_support'])
    if 'naming_format' in req:
        guild_t['naming_format'] = req['naming_format'] if req['naming_format'] in ['type-ticket-id', 'ticket-id', 'type-id', 'username-type'] else 'type-ticket-id'
    if 'auto_close_hours' in req:
        guild_t['auto_close_hours'] = max(0, min(720, int(req['auto_close_hours'])))
    if 'close_confirm' in req:
        guild_t['close_confirm'] = bool(req['close_confirm'])
    if 'user_can_close' in req:
        guild_t['user_can_close'] = bool(req['user_can_close'])
    if 'feedback' in req:
        guild_t['feedback'] = bool(req['feedback'])
    if 'thread_mode' in req:
        guild_t['thread_mode'] = bool(req['thread_mode'])
    save_cp_json(CUB_PROTECTOR_TICKETS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/tickets/panels', methods=['POST'])
@cub_protector_auth_required
def cub_protector_create_ticket_panel(guild_id):
    """Create a ticket panel with multiple buttons in a channel"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req = request.get_json()
    if not req:
        return jsonify({'error': 'No data provided'}), 400

    channel_id = req.get('channel_id')
    title = req.get('title', 'Support Tickets')
    description = req.get('description', 'Click a button below to create a ticket.')
    buttons = req.get('buttons', [])
    embed_color_hex = req.get('embed_color') or '#5865F2'
    embed_image = req.get('embed_image') or None
    embed_thumbnail = req.get('embed_thumbnail') or None
    embed_footer = req.get('embed_footer') or 'CUB PROTECTOR Tickets'

    if not channel_id:
        return jsonify({'error': 'Channel is required'}), 400
    if not buttons or len(buttons) == 0:
        return jsonify({'error': 'At least one button is required'}), 400
    if len(buttons) > 5:
        return jsonify({'error': 'Maximum 5 buttons per panel'}), 400

    # Parse embed color
    try:
        embed_color_int = int(embed_color_hex.lstrip('#'), 16)
    except (ValueError, AttributeError):
        embed_color_int = 0x5865F2

    # Build embed
    embed = {
        'title': title,
        'description': description,
        'color': embed_color_int,
        'footer': {'text': embed_footer}
    }
    if embed_image:
        embed['image'] = {'url': embed_image}
    if embed_thumbnail:
        embed['thumbnail'] = {'url': embed_thumbnail}

    # Build button components
    style_map = {'Primary': 1, 'Secondary': 2, 'Success': 3, 'Danger': 4}
    components_buttons = []
    for btn in buttons:
        type_id = btn.get('type_id', 'support')
        type_id = re.sub(r'[^a-z0-9-]', '', type_id.lower())[:20]
        if not type_id:
            type_id = 'support'

        button_data = {
            'type': 2,
            'style': style_map.get(btn.get('style', 'Primary'), 1),
            'label': btn.get('label', 'Create Ticket')[:80],
            'custom_id': f'ticket_create_{type_id}',
        }
        emoji = btn.get('emoji', '')
        if emoji:
            button_data['emoji'] = {'name': emoji}
        components_buttons.append(button_data)

    action_row = {'type': 1, 'components': components_buttons}

    # Send message to channel via Discord API
    msg_data = cub_protector_bot_request(f'/channels/{channel_id}/messages', method='POST', json_data={
        'embeds': [embed],
        'components': [action_row]
    })

    if not msg_data:
        return jsonify({'error': 'Failed to send panel message to Discord'}), 500

    # Save panel to tickets data
    data = load_cp_json(CUB_PROTECTOR_TICKETS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'panels': [], 'tickets': {}, 'next_ticket_id': 1, 'support_role': None, 'transcript_channel': None}

    panel_info = {
        'message_id': msg_data['id'],
        'channel_id': channel_id,
        'title': title,
        'description': description,
        'embed_color': embed_color_hex,
        'embed_image': embed_image or '',
        'embed_thumbnail': embed_thumbnail or '',
        'embed_footer': embed_footer,
        'buttons': [{'type_id': re.sub(r'[^a-z0-9-]', '', b.get('type_id', 'support').lower())[:20] or 'support', 'label': b.get('label', 'Create Ticket'), 'emoji': b.get('emoji', ''), 'style': b.get('style', 'Primary'), 'category_id': b.get('category_id', ''), 'closed_category_id': b.get('closed_category_id', ''), 'welcome_message': b.get('welcome_message', ''), 'close_message': b.get('close_message', '')} for b in buttons],
        'created_at': int(time.time()),
    }
    data['guilds'][guild_id]['panels'].append(panel_info)
    save_cp_json(CUB_PROTECTOR_TICKETS_FILE, data)

    return jsonify({'success': True, 'message_id': msg_data['id']})

@app.route('/api/cub-protector/guilds/<guild_id>/tickets/panels/<message_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_edit_ticket_panel(guild_id, message_id):
    """Edit an existing ticket panel (update title, description, buttons)"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req = request.get_json()
    if not req:
        return jsonify({'error': 'No data provided'}), 400

    data = load_cp_json(CUB_PROTECTOR_TICKETS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    panels = guild_data.get('panels', [])

    panel = None
    panel_idx = None
    for i, p in enumerate(panels):
        if p.get('message_id') == message_id:
            panel = p
            panel_idx = i
            break

    if panel is None:
        return jsonify({'error': 'Panel not found'}), 404

    title = req.get('title', panel.get('title', 'Support Tickets'))
    description = req.get('description', panel.get('description', 'Click a button below to create a ticket.'))
    buttons = req.get('buttons', panel.get('buttons', []))
    embed_color_hex = req.get('embed_color') or panel.get('embed_color', '#5865F2')
    embed_image = req.get('embed_image') or panel.get('embed_image', '') or None
    embed_thumbnail = req.get('embed_thumbnail') or panel.get('embed_thumbnail', '') or None
    embed_footer = req.get('embed_footer', panel.get('embed_footer', 'CUB PROTECTOR Tickets'))

    if not buttons or len(buttons) == 0:
        return jsonify({'error': 'At least one button is required'}), 400
    if len(buttons) > 5:
        return jsonify({'error': 'Maximum 5 buttons per panel'}), 400

    try:
        embed_color_int = int(embed_color_hex.lstrip('#'), 16)
    except (ValueError, AttributeError):
        embed_color_int = 0x5865F2

    # Build updated embed
    embed = {
        'title': title,
        'description': description,
        'color': embed_color_int,
        'footer': {'text': embed_footer}
    }
    if embed_image:
        embed['image'] = {'url': embed_image}
    if embed_thumbnail:
        embed['thumbnail'] = {'url': embed_thumbnail}

    # Build button components
    style_map = {'Primary': 1, 'Secondary': 2, 'Success': 3, 'Danger': 4}
    components_buttons = []
    for btn in buttons:
        type_id = btn.get('type_id', 'support')
        type_id = re.sub(r'[^a-z0-9-]', '', type_id.lower())[:20]
        if not type_id:
            type_id = 'support'
        button_data = {
            'type': 2,
            'style': style_map.get(btn.get('style', 'Primary'), 1),
            'label': btn.get('label', 'Create Ticket')[:80],
            'custom_id': f'ticket_create_{type_id}',
        }
        emoji = btn.get('emoji', '')
        if emoji:
            button_data['emoji'] = {'name': emoji}
        components_buttons.append(button_data)

    action_row = {'type': 1, 'components': components_buttons}

    # Update the message on Discord
    result = cub_protector_bot_request(f'/channels/{panel["channel_id"]}/messages/{message_id}', method='PATCH', json_data={
        'embeds': [embed],
        'components': [action_row]
    })

    if not result:
        return jsonify({'error': 'Failed to update panel message on Discord'}), 500

    # Update stored panel data
    sanitized_buttons = [{'type_id': re.sub(r'[^a-z0-9-]', '', b.get('type_id', 'support').lower())[:20] or 'support', 'label': b.get('label', 'Create Ticket'), 'emoji': b.get('emoji', ''), 'style': b.get('style', 'Primary'), 'category_id': b.get('category_id', ''), 'closed_category_id': b.get('closed_category_id', ''), 'welcome_message': b.get('welcome_message', ''), 'close_message': b.get('close_message', '')} for b in buttons]
    data['guilds'][guild_id]['panels'][panel_idx]['title'] = title
    data['guilds'][guild_id]['panels'][panel_idx]['description'] = description
    data['guilds'][guild_id]['panels'][panel_idx]['embed_color'] = embed_color_hex
    data['guilds'][guild_id]['panels'][panel_idx]['embed_image'] = embed_image or ''
    data['guilds'][guild_id]['panels'][panel_idx]['embed_thumbnail'] = embed_thumbnail or ''
    data['guilds'][guild_id]['panels'][panel_idx]['embed_footer'] = embed_footer
    data['guilds'][guild_id]['panels'][panel_idx]['buttons'] = sanitized_buttons
    save_cp_json(CUB_PROTECTOR_TICKETS_FILE, data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/tickets/panels/<message_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_delete_ticket_panel(guild_id, message_id):
    """Delete a ticket panel"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    data = load_cp_json(CUB_PROTECTOR_TICKETS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    panels = guild_data.get('panels', [])

    panel = None
    for p in panels:
        if p.get('message_id') == message_id:
            panel = p
            break

    if not panel:
        return jsonify({'error': 'Panel not found'}), 404

    # Delete the message from Discord
    cub_protector_bot_request(f'/channels/{panel["channel_id"]}/messages/{message_id}', method='DELETE')

    # Remove from data
    data['guilds'][guild_id]['panels'] = [p for p in panels if p.get('message_id') != message_id]
    save_cp_json(CUB_PROTECTOR_TICKETS_FILE, data)

    return jsonify({'success': True})

# ==================== CUB PROTECTOR - GIVEAWAYS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/giveaways', methods=['GET'])
@cub_protector_auth_required
def cub_protector_giveaways_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, [])
    # Support both old format (list) and new format (dict with settings)
    if isinstance(guild_data, list):
        guild_giveaways = guild_data
        guild_settings = {}
    else:
        guild_giveaways = guild_data.get('giveaways', [])
        guild_settings = guild_data.get('settings', {})
    return jsonify({'giveaways': guild_giveaways, 'settings': guild_settings})

@app.route('/api/cub-protector/guilds/<guild_id>/giveaways/settings', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_giveaway_settings_patch(guild_id):
    """Update giveaway global settings"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    guild_data = data['guilds'].get(guild_id, [])
    # Migrate from old list format to new dict format
    if isinstance(guild_data, list):
        guild_data = {'giveaways': guild_data, 'settings': {}}
        data['guilds'][guild_id] = guild_data
    if 'settings' not in guild_data:
        guild_data['settings'] = {}
    if 'dm_winners' in req:
        guild_data['settings']['dm_winners'] = bool(req['dm_winners'])
    if 'end_message' in req:
        guild_data['settings']['end_message'] = str(req['end_message'])[:500]
    save_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/giveaways', methods=['POST'])
@cub_protector_auth_required
def cub_protector_create_giveaway(guild_id):
    """Create a giveaway from the dashboard"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req = request.get_json()
    if not req:
        return jsonify({'error': 'No data provided'}), 400

    prize = req.get('prize', '').strip()
    duration_str = req.get('duration', '').strip()
    winners = req.get('winners', 1)
    required_role = req.get('required_role') or None
    channel_id = req.get('channel_id')

    if not prize:
        return jsonify({'error': 'Prize is required'}), 400
    if not channel_id:
        return jsonify({'error': 'Channel is required'}), 400
    if not duration_str:
        return jsonify({'error': 'Duration is required'}), 400

    # Parse duration
    duration_match = re.match(r'^(\d+)\s*(m|min|h|hr|d|day|w|week)s?$', duration_str, re.IGNORECASE)
    if not duration_match:
        return jsonify({'error': 'Invalid duration. Use: 30m, 1h, 1d, 7d'}), 400

    num = int(duration_match.group(1))
    unit = duration_match.group(2).lower()
    multipliers = {'m': 60, 'min': 60, 'h': 3600, 'hr': 3600, 'd': 86400, 'day': 86400, 'w': 604800, 'week': 604800}
    duration_seconds = num * multipliers.get(unit, 60)
    ends_at_ms = int(time.time() * 1000) + (duration_seconds * 1000)

    winners = max(1, min(20, int(winners)))

    # Embed customization
    embed_title = req.get('embed_title') or '\U0001f389 GIVEAWAY'
    embed_description_custom = req.get('embed_description') or ''
    embed_color_hex = req.get('embed_color') or '#57f287'
    embed_image = req.get('embed_image') or None
    embed_thumbnail = req.get('embed_thumbnail') or None
    embed_footer = req.get('embed_footer') or None

    # Parse hex color to int
    try:
        embed_color_int = int(embed_color_hex.lstrip('#'), 16)
    except (ValueError, AttributeError):
        embed_color_int = 0x57F287

    # Build description
    desc_parts = []
    if embed_description_custom:
        desc_parts.append(embed_description_custom)
        desc_parts.append('')
    desc_parts.append(f'**{prize}**')
    desc_parts.append(f'\nClick the button below to enter!\n')
    desc_parts.append(f'**Winners:** {winners}')
    desc_parts.append(f'**Ends:** <t:{int(ends_at_ms / 1000)}:R>')

    # Build embed
    embed = {
        'title': embed_title,
        'description': '\n'.join(desc_parts),
        'color': embed_color_int,
    }

    if embed_image:
        embed['image'] = {'url': embed_image}
    if embed_thumbnail:
        embed['thumbnail'] = {'url': embed_thumbnail}
    if embed_footer:
        embed['footer'] = {'text': embed_footer}

    if required_role:
        embed['fields'] = [{'name': 'Required Role', 'value': f'<@&{required_role}>', 'inline': False}]

    # Build button
    button_label = req.get('button_label', '').strip() or 'Enter Giveaway \U0001f389'
    action_row = {
        'type': 1,
        'components': [{
            'type': 2,
            'style': 3,  # SUCCESS
            'label': button_label[:80],
            'custom_id': 'giveaway_enter',
        }]
    }

    # Send message via Discord API
    msg_payload = {
        'embeds': [embed],
        'components': [action_row]
    }

    # Add ping if configured
    ping_role = req.get('ping_role')
    if ping_role:
        if ping_role == '@everyone':
            msg_payload['content'] = '@everyone'
        elif ping_role == '@here':
            msg_payload['content'] = '@here'
        else:
            msg_payload['content'] = f'<@&{ping_role}>'

    msg_data = cub_protector_bot_request(f'/channels/{channel_id}/messages', method='POST', json_data=msg_payload)

    if not msg_data:
        return jsonify({'error': 'Failed to send giveaway message to Discord'}), 500

    # Save to giveaways data
    data = load_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = []

    user = session.get('cub_protector_user', {})
    button_label = req.get('button_label', '').strip() or 'Enter Giveaway \U0001f389'
    giveaway = {
        'message_id': msg_data['id'],
        'channel_id': channel_id,
        'prize': prize,
        'winners': winners,
        'ends_at': ends_at_ms,
        'required_role': required_role,
        'entries': [],
        'ended': False,
        'host_id': user.get('id', '0'),
        'embed_title': embed_title if embed_title != '\U0001f389 GIVEAWAY' else '',
        'embed_description': embed_description_custom,
        'embed_color': embed_color_hex,
        'embed_image': embed_image or '',
        'embed_thumbnail': embed_thumbnail or '',
        'embed_footer': embed_footer or '',
        'button_label': button_label,
        'blacklisted_roles': req.get('blacklisted_roles', []),
        'bonus_role': req.get('bonus_role') or None,
        'bonus_entries': max(1, min(10, int(req.get('bonus_entries', 2)))),
        'max_entries': max(0, min(10000, int(req.get('max_entries', 0)))),
        'dm_winners': bool(req.get('dm_winners', False)),
        'winner_message': req.get('winner_message', '') or '',
        'allow_multiple': bool(req.get('allow_multiple', False)),
    }

    # Handle new dict format for guild data
    if isinstance(data['guilds'][guild_id], dict):
        if 'giveaways' not in data['guilds'][guild_id]:
            data['guilds'][guild_id]['giveaways'] = []
        data['guilds'][guild_id]['giveaways'].append(giveaway)
    else:
        data['guilds'][guild_id].append(giveaway)
    save_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE, data)

    return jsonify({'success': True, 'message_id': msg_data['id']})

@app.route('/api/cub-protector/guilds/<guild_id>/giveaways/<message_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_edit_giveaway(guild_id, message_id):
    """Edit an active giveaway from the dashboard"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    req = request.get_json()
    if not req:
        return jsonify({'error': 'No data provided'}), 400

    data = load_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE)
    _gd = data.get('guilds', {}).get(guild_id, [])
    guild_giveaways = _gd.get('giveaways', []) if isinstance(_gd, dict) else _gd
    giveaway = None
    giveaway_idx = None
    for i, g in enumerate(guild_giveaways):
        if g.get('message_id') == message_id and not g.get('ended'):
            giveaway = g
            giveaway_idx = i
            break

    if not giveaway:
        return jsonify({'error': 'Active giveaway not found'}), 404

    # Update fields
    if 'prize' in req and req['prize'].strip():
        giveaway['prize'] = req['prize'].strip()
    if 'winners' in req:
        giveaway['winners'] = max(1, min(20, int(req['winners'])))
    if 'required_role' in req:
        giveaway['required_role'] = req['required_role'] or None
    if 'duration' in req and req['duration'].strip():
        duration_str = req['duration'].strip()
        duration_match = re.match(r'^(\d+)\s*(m|min|h|hr|d|day|w|week)s?$', duration_str, re.IGNORECASE)
        if duration_match:
            num = int(duration_match.group(1))
            unit = duration_match.group(2).lower()
            multipliers = {'m': 60, 'min': 60, 'h': 3600, 'hr': 3600, 'd': 86400, 'day': 86400, 'w': 604800, 'week': 604800}
            duration_seconds = num * multipliers.get(unit, 60)
            giveaway['ends_at'] = int(time.time() * 1000) + (duration_seconds * 1000)

    # Embed customization
    embed_title = req.get('embed_title') or '\U0001f389 GIVEAWAY'
    embed_description_custom = req.get('embed_description') or ''
    embed_color_hex = req.get('embed_color') or '#57f287'
    embed_image = req.get('embed_image') or None
    embed_thumbnail = req.get('embed_thumbnail') or None
    embed_footer = req.get('embed_footer') or None

    try:
        embed_color_int = int(embed_color_hex.lstrip('#'), 16)
    except (ValueError, AttributeError):
        embed_color_int = 0x57F287

    # Build updated description
    desc_parts = []
    if embed_description_custom:
        desc_parts.append(embed_description_custom)
        desc_parts.append('')
    desc_parts.append(f'**{giveaway["prize"]}**')
    desc_parts.append(f'\nClick the button below to enter!\n')
    desc_parts.append(f'**Winners:** {giveaway["winners"]}')
    desc_parts.append(f'**Ends:** <t:{int(giveaway["ends_at"] / 1000)}:R>')
    desc_parts.append(f'\n**Entries:** {len(giveaway.get("entries", []))}')

    embed = {
        'title': embed_title,
        'description': '\n'.join(desc_parts),
        'color': embed_color_int,
    }
    if embed_image:
        embed['image'] = {'url': embed_image}
    if embed_thumbnail:
        embed['thumbnail'] = {'url': embed_thumbnail}
    if embed_footer:
        embed['footer'] = {'text': embed_footer}
    if giveaway.get('required_role'):
        embed['fields'] = [{'name': 'Required Role', 'value': f'<@&{giveaway["required_role"]}>', 'inline': False}]

    # Store embed settings for future reference
    giveaway['embed_title'] = embed_title if embed_title != '\U0001f389 GIVEAWAY' else ''
    giveaway['embed_description'] = embed_description_custom
    giveaway['embed_color'] = embed_color_hex
    giveaway['embed_image'] = embed_image or ''
    giveaway['embed_thumbnail'] = embed_thumbnail or ''
    giveaway['embed_footer'] = embed_footer or ''

    # Store advanced options
    if 'blacklisted_roles' in req:
        giveaway['blacklisted_roles'] = req['blacklisted_roles'] if isinstance(req['blacklisted_roles'], list) else []
    if 'bonus_role' in req:
        giveaway['bonus_role'] = req['bonus_role'] or None
    if 'bonus_entries' in req:
        giveaway['bonus_entries'] = max(1, min(10, int(req['bonus_entries'])))
    if 'max_entries' in req:
        giveaway['max_entries'] = max(0, min(10000, int(req['max_entries'])))
    if 'dm_winners' in req:
        giveaway['dm_winners'] = bool(req['dm_winners'])
    if 'winner_message' in req:
        giveaway['winner_message'] = req['winner_message'] or ''

    # Build button
    button_label = req.get('button_label', '').strip() or 'Enter Giveaway \U0001f389'
    action_row = {
        'type': 1,
        'components': [{
            'type': 2,
            'style': 3,
            'label': button_label[:80],
            'custom_id': 'giveaway_enter',
        }]
    }
    giveaway['button_label'] = button_label

    # Update the message on Discord
    result = cub_protector_bot_request(f'/channels/{giveaway["channel_id"]}/messages/{message_id}', method='PATCH', json_data={
        'embeds': [embed],
        'components': [action_row]
    })

    if not result:
        return jsonify({'error': 'Failed to update giveaway message on Discord'}), 500

    save_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/giveaways/<message_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_delete_giveaway(guild_id, message_id):
    """Delete a giveaway (ended or active) from the dashboard"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    data = load_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE)
    _gd = data.get('guilds', {}).get(guild_id, [])
    guild_giveaways = _gd.get('giveaways', []) if isinstance(_gd, dict) else _gd
    giveaway = None
    for g in guild_giveaways:
        if g.get('message_id') == message_id:
            giveaway = g
            break

    if not giveaway:
        return jsonify({'error': 'Giveaway not found'}), 404

    # Try to delete the Discord message
    cub_protector_bot_request(f'/channels/{giveaway["channel_id"]}/messages/{message_id}', method='DELETE')

    # Remove from data
    filtered = [g for g in guild_giveaways if g.get('message_id') != message_id]
    if isinstance(data['guilds'][guild_id], dict):
        data['guilds'][guild_id]['giveaways'] = filtered
    else:
        data['guilds'][guild_id] = filtered
    save_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE, data)

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/giveaways/<message_id>/end', methods=['POST'])
@cub_protector_auth_required
def cub_protector_end_giveaway(guild_id, message_id):
    """End a giveaway early from the dashboard"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    data = load_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE)
    _gd = data.get('guilds', {}).get(guild_id, [])
    guild_giveaways = _gd.get('giveaways', []) if isinstance(_gd, dict) else _gd
    giveaway = None
    for g in guild_giveaways:
        if g.get('message_id') == message_id and not g.get('ended'):
            giveaway = g
            break

    if not giveaway:
        return jsonify({'error': 'Active giveaway not found'}), 404

    giveaway['ended'] = True

    # Pick winners
    winners = []
    pool = list(giveaway.get('entries', []))
    for i in range(min(giveaway.get('winners', 1), len(pool))):
        idx = random.randint(0, len(pool) - 1)
        winners.append(pool.pop(idx))

    # Deduplicate winners
    winners = list(dict.fromkeys(winners))

    giveaway['winner_ids'] = winners
    save_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE, data)

    # Update the message embed
    unique_entries = len(set(giveaway.get('entries', [])))
    ended_embed = {
        'title': '\U0001f389 GIVEAWAY ENDED',
        'description': f'**{giveaway["prize"]}**\n\n**Winner(s):** {", ".join(f"<@{w}>" for w in winners) if winners else "No entries"}\n**Entries:** {unique_entries}',
        'color': 0xED4245,
    }

    cub_protector_bot_request(f'/channels/{giveaway["channel_id"]}/messages/{message_id}', method='PATCH', json_data={
        'embeds': [ended_embed],
        'components': []
    })

    # Announce winners with custom or default message
    if winners:
        winner_mentions = ', '.join(f'<@{w}>' for w in winners)
        winner_message = giveaway.get('winner_message', '')
        if winner_message:
            announce = winner_message.replace('{winners}', winner_mentions).replace('{prize}', giveaway['prize'])
        else:
            announce = f'\U0001f389 Congratulations {winner_mentions}! You won **{giveaway["prize"]}**!'
        cub_protector_bot_request(f'/channels/{giveaway["channel_id"]}/messages', method='POST', json_data={
            'content': announce
        })

        # DM winners if enabled
        if giveaway.get('dm_winners'):
            for winner_id in winners:
                try:
                    dm_channel = cub_protector_bot_request(f'/users/@me/channels', method='POST', json_data={'recipient_id': winner_id})
                    if dm_channel and dm_channel.get('id'):
                        cub_protector_bot_request(f'/channels/{dm_channel["id"]}/messages', method='POST', json_data={
                            'content': f'\U0001f389 You won **{giveaway["prize"]}** in a giveaway! Check the giveaway channel for details.'
                        })
                except Exception:
                    pass

    return jsonify({'success': True, 'winners': winners})

@app.route('/api/cub-protector/guilds/<guild_id>/giveaways/<message_id>/reroll', methods=['POST'])
@cub_protector_auth_required
def cub_protector_reroll_giveaway(guild_id, message_id):
    """Reroll giveaway winners from the dashboard"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    data = load_cp_json(CUB_PROTECTOR_GIVEAWAYS_FILE)
    _gd = data.get('guilds', {}).get(guild_id, [])
    guild_giveaways = _gd.get('giveaways', []) if isinstance(_gd, dict) else _gd
    giveaway = None
    for g in guild_giveaways:
        if g.get('message_id') == message_id and g.get('ended'):
            giveaway = g
            break

    if not giveaway:
        return jsonify({'error': 'Ended giveaway not found'}), 404

    entries = giveaway.get('entries', [])
    if not entries:
        return jsonify({'error': 'No entries to reroll'}), 400

    winners = []
    pool = list(entries)
    for i in range(min(giveaway.get('winners', 1), len(pool))):
        idx = random.randint(0, len(pool) - 1)
        winners.append(pool.pop(idx))

    # Announce reroll
    cub_protector_bot_request(f'/channels/{giveaway["channel_id"]}/messages', method='POST', json_data={
        'content': f'\U0001f389 **Giveaway Rerolled!**\nNew winner(s): {", ".join(f"<@{w}>" for w in winners)}\nPrize: **{giveaway["prize"]}**'
    })

    return jsonify({'success': True, 'winners': winners})

@app.route('/api/cub-protector/guilds/<guild_id>/stats')
@cub_protector_auth_required
def cub_protector_stats(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_STATS_FILE)
    guild_stats = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'stats': guild_stats})

# ==================== CUB PROTECTOR - AUTO-ROLES API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/autoroles', methods=['GET'])
@cub_protector_auth_required
def cub_protector_autoroles_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_AUTOROLES_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {
        'enabled': False,
        'join_roles': [],
        'bot_roles': [],
        'age_roles': [],
        'delay_roles': []
    })
    return jsonify({'autoroles': guild_data})

@app.route('/api/cub-protector/guilds/<guild_id>/autoroles', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_autoroles_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_AUTOROLES_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': False, 'join_roles': [], 'bot_roles': [], 'age_roles': [], 'delay_roles': []}

    guild_data = data['guilds'][guild_id]

    if 'enabled' in body:
        guild_data['enabled'] = bool(body['enabled'])
    if 'join_roles' in body:
        guild_data['join_roles'] = [str(r) for r in body['join_roles'] if r][:10]
    if 'bot_roles' in body:
        guild_data['bot_roles'] = [str(r) for r in body['bot_roles'] if r][:10]
    if 'age_roles' in body:
        age_roles = []
        for rule in body['age_roles'][:10]:
            if rule.get('role_id') and rule.get('min_days') is not None:
                age_roles.append({
                    'role_id': str(rule['role_id']),
                    'min_days': max(0, min(3650, int(rule['min_days'])))
                })
        guild_data['age_roles'] = age_roles
    if 'delay_roles' in body:
        delay_roles = []
        for rule in body['delay_roles'][:10]:
            if rule.get('role_id') and rule.get('delay_seconds') is not None:
                delay_roles.append({
                    'role_id': str(rule['role_id']),
                    'delay_seconds': max(1, min(86400, int(rule['delay_seconds'])))
                })
        guild_data['delay_roles'] = delay_roles
    if 'sticky_roles' in body:
        guild_data['sticky_roles'] = bool(body['sticky_roles'])
    if 'verification_role' in body:
        guild_data['verification_role'] = str(body['verification_role']) if body['verification_role'] else None
    if 'verification_type' in body:
        guild_data['verification_type'] = body['verification_type'] if body['verification_type'] in ['none', 'reaction', 'button'] else 'none'

    save_cp_json(CUB_PROTECTOR_AUTOROLES_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - SCHEDULED MESSAGES API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/scheduled-messages', methods=['GET'])
@cub_protector_auth_required
def cub_protector_scheduled_messages_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'messages': []})
    return jsonify({'scheduled_messages': guild_data.get('messages', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/scheduled-messages', methods=['POST'])
@cub_protector_auth_required
def cub_protector_scheduled_messages_create(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'messages': []}

    import uuid
    msg = {
        'id': str(uuid.uuid4())[:8],
        'channel_id': str(body.get('channel_id', '')),
        'content': str(body.get('content', ''))[:2000],
        'embed': body.get('embed'),
        'interval': str(body.get('interval', 'once')),
        'cron_day': str(body.get('cron_day', '*')),
        'cron_hour': int(body.get('cron_hour', 0)),
        'cron_minute': int(body.get('cron_minute', 0)),
        'next_run': body.get('next_run', ''),
        'enabled': bool(body.get('enabled', True)),
        'created_at': datetime.utcnow().isoformat()
    }
    data['guilds'][guild_id]['messages'].append(msg)
    save_cp_json(CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE, data)
    return jsonify({'success': True, 'message': msg})

@app.route('/api/cub-protector/guilds/<guild_id>/scheduled-messages/<msg_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_scheduled_messages_delete(guild_id, msg_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'messages': []})
    guild_data['messages'] = [m for m in guild_data.get('messages', []) if m.get('id') != msg_id]
    if 'guilds' not in data:
        data['guilds'] = {}
    data['guilds'][guild_id] = guild_data
    save_cp_json(CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/scheduled-messages/<msg_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_scheduled_messages_edit(guild_id, msg_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'messages': []})
    for msg in guild_data.get('messages', []):
        if msg.get('id') == msg_id:
            if 'channel_id' in body:
                msg['channel_id'] = str(body['channel_id'])
            if 'content' in body:
                msg['content'] = str(body['content'])[:2000]
            if 'embed' in body:
                msg['embed'] = body['embed']
            if 'interval' in body:
                msg['interval'] = str(body['interval'])
            if 'cron_day' in body:
                msg['cron_day'] = str(body['cron_day'])
            if 'cron_hour' in body:
                msg['cron_hour'] = int(body['cron_hour'])
            if 'cron_minute' in body:
                msg['cron_minute'] = int(body['cron_minute'])
            if 'next_run' in body:
                msg['next_run'] = body['next_run']
            if 'enabled' in body:
                msg['enabled'] = bool(body['enabled'])
            break
    if 'guilds' not in data:
        data['guilds'] = {}
    data['guilds'][guild_id] = guild_data
    save_cp_json(CUB_PROTECTOR_SCHEDULED_MESSAGES_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - CUSTOM EMBEDS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/custom-embeds', methods=['GET'])
@cub_protector_auth_required
def cub_protector_custom_embeds_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_CUSTOM_EMBEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'embeds': []})
    return jsonify({'embeds': guild_data.get('embeds', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/custom-embeds', methods=['POST'])
@cub_protector_auth_required
def cub_protector_custom_embeds_create(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}

    channel_id = body.get('channel_id')
    if not channel_id:
        return jsonify({'error': 'Channel is required'}), 400

    embed_data = body.get('embed', {})
    embed_payload = {}
    if embed_data.get('title'):
        embed_payload['title'] = str(embed_data['title'])[:256]
    if embed_data.get('description'):
        embed_payload['description'] = str(embed_data['description'])[:4096]
    if embed_data.get('color'):
        try:
            embed_payload['color'] = int(str(embed_data['color']).lstrip('#'), 16)
        except ValueError:
            pass
    if embed_data.get('image'):
        embed_payload['image'] = {'url': str(embed_data['image'])}
    if embed_data.get('thumbnail'):
        embed_payload['thumbnail'] = {'url': str(embed_data['thumbnail'])}
    if embed_data.get('footer'):
        embed_payload['footer'] = {'text': str(embed_data['footer'])[:2048]}
    if embed_data.get('author'):
        embed_payload['author'] = {'name': str(embed_data['author'])[:256]}
    if embed_data.get('fields'):
        fields = []
        for f in embed_data['fields'][:25]:
            if f.get('name') and f.get('value'):
                fields.append({'name': str(f['name'])[:256], 'value': str(f['value'])[:1024], 'inline': bool(f.get('inline', False))})
        if fields:
            embed_payload['fields'] = fields

    content = str(body.get('content', ''))[:2000] if body.get('content') else None
    msg_payload = {'embeds': [embed_payload]}
    if content:
        msg_payload['content'] = content

    msg_data = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json=msg_payload)
    if msg_data:
        import uuid
        data = load_cp_json(CUB_PROTECTOR_CUSTOM_EMBEDS_FILE)
        if 'guilds' not in data:
            data['guilds'] = {}
        if guild_id not in data['guilds']:
            data['guilds'][guild_id] = {'embeds': []}
        data['guilds'][guild_id]['embeds'].append({
            'id': str(uuid.uuid4())[:8],
            'message_id': msg_data.get('id'),
            'channel_id': channel_id,
            'embed': embed_data,
            'content': content,
            'created_at': datetime.utcnow().isoformat()
        })
        save_cp_json(CUB_PROTECTOR_CUSTOM_EMBEDS_FILE, data)
        return jsonify({'success': True, 'message_id': msg_data.get('id')})
    return jsonify({'error': 'Failed to send embed'}), 500

@app.route('/api/cub-protector/guilds/<guild_id>/custom-embeds/<embed_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_custom_embeds_delete(guild_id, embed_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_CUSTOM_EMBEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'embeds': []})
    embed_entry = next((e for e in guild_data.get('embeds', []) if e.get('id') == embed_id), None)
    if embed_entry and embed_entry.get('message_id') and embed_entry.get('channel_id'):
        cub_protector_bot_request('DELETE', f'/channels/{embed_entry["channel_id"]}/messages/{embed_entry["message_id"]}')
    guild_data['embeds'] = [e for e in guild_data.get('embeds', []) if e.get('id') != embed_id]
    if 'guilds' not in data:
        data['guilds'] = {}
    data['guilds'][guild_id] = guild_data
    save_cp_json(CUB_PROTECTOR_CUSTOM_EMBEDS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - MOD ACTIONS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/mod-action', methods=['POST'])
@cub_protector_auth_required
def cub_protector_mod_action(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    action = body.get('action')
    user_id = body.get('user_id')
    reason = body.get('reason', 'Dashboard action')[:500]

    if not action or not user_id:
        return jsonify({'error': 'Action and user_id required'}), 400

    if action == 'ban':
        delete_days = min(7, max(0, int(body.get('delete_days', 0))))
        # Generate appeal code (6 chars, mixed case + digits)
        appeal_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
        appeal_code = ''.join(random.choice(appeal_chars) for _ in range(6))
        # DM user before banning with appeal code
        try:
            # Create DM channel
            dm_channel = cub_protector_bot_request('POST', f'/users/@me/channels', json={'recipient_id': user_id})
            if dm_channel and 'id' in dm_channel:
                cub_protector_bot_request('POST', f'/channels/{dm_channel["id"]}/messages', json={
                    'embeds': [{
                        'title': 'You have been banned',
                        'description': f'**Reason:** {reason}',
                        'color': 0xED4245,
                        'fields': [
                            {'name': 'Appeal Code', 'value': f'`{appeal_code}`', 'inline': True},
                            {'name': 'Appeal URL', 'value': 'https://cubsoftware.site/ban-appeal', 'inline': False},
                        ],
                        'footer': {'text': 'Use the code above on the appeal page to submit a ban appeal'},
                    }]
                })
        except Exception:
            pass
        result = _guild_bot_request(guild_id, 'PUT', f'/guilds/{guild_id}/bans/{user_id}', json={
            'delete_message_seconds': delete_days * 86400,
            'reason': reason
        })
        if result is not None:
            data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
            if 'guilds' not in data: data['guilds'] = {}
            if guild_id not in data['guilds']: data['guilds'][guild_id] = {'warnings': [], 'notes': [], 'cases': [], 'next_case_id': 1}
            guild_data = data['guilds'][guild_id]
            case_id = guild_data.get('next_case_id', 1)
            guild_data['cases'].append({
                'case_id': case_id, 'type': 'ban', 'moderator_id': 'dashboard',
                'target_id': user_id, 'reason': reason,
                'timestamp': int(datetime.utcnow().timestamp()),
                'appeal_code': appeal_code
            })
            guild_data['next_case_id'] = case_id + 1
            save_cp_json(CUB_PROTECTOR_MODERATION_FILE, data)
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to ban user'}), 500

    elif action == 'kick':
        result = _guild_bot_request(guild_id, 'DELETE', f'/guilds/{guild_id}/members/{user_id}', json={'reason': reason})
        if result is not None:
            data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
            if 'guilds' not in data: data['guilds'] = {}
            if guild_id not in data['guilds']: data['guilds'][guild_id] = {'warnings': [], 'notes': [], 'cases': [], 'next_case_id': 1}
            guild_data = data['guilds'][guild_id]
            case_id = guild_data.get('next_case_id', 1)
            guild_data['cases'].append({
                'case_id': case_id, 'type': 'kick', 'moderator_id': 'dashboard',
                'target_id': user_id, 'reason': reason,
                'timestamp': int(datetime.utcnow().timestamp())
            })
            guild_data['next_case_id'] = case_id + 1
            save_cp_json(CUB_PROTECTOR_MODERATION_FILE, data)
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to kick user'}), 500

    elif action == 'mute':
        try:
            duration = min(2419200, max(60, int(body.get('duration', 3600))))  # 1min - 28 days, in seconds
        except (ValueError, TypeError):
            duration = 3600
        expires_at = datetime.utcnow() + timedelta(seconds=duration)
        result = _guild_bot_request(guild_id, 'PATCH', f'/guilds/{guild_id}/members/{user_id}', json={
            'communication_disabled_until': expires_at.isoformat() + 'Z'
        })
        if result is not None:
            data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
            if 'guilds' not in data: data['guilds'] = {}
            if guild_id not in data['guilds']: data['guilds'][guild_id] = {'warnings': [], 'notes': [], 'cases': [], 'next_case_id': 1}
            guild_data = data['guilds'][guild_id]
            case_id = guild_data.get('next_case_id', 1)
            guild_data['cases'].append({
                'case_id': case_id, 'type': 'mute', 'moderator_id': 'dashboard',
                'target_id': user_id, 'reason': reason, 'duration': duration * 1000,
                'timestamp': int(datetime.utcnow().timestamp()),
                'expires_at': int(expires_at.timestamp())
            })
            guild_data['next_case_id'] = case_id + 1
            save_cp_json(CUB_PROTECTOR_MODERATION_FILE, data)
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to mute user'}), 500

    elif action == 'unmute':
        result = _guild_bot_request(guild_id, 'PATCH', f'/guilds/{guild_id}/members/{user_id}', json={
            'communication_disabled_until': None
        })
        if result is not None:
            data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
            if 'guilds' not in data: data['guilds'] = {}
            if guild_id not in data['guilds']: data['guilds'][guild_id] = {'warnings': [], 'notes': [], 'cases': [], 'next_case_id': 1}
            guild_data = data['guilds'][guild_id]
            case_id = guild_data.get('next_case_id', 1)
            guild_data['cases'].append({
                'case_id': case_id, 'type': 'unmute', 'moderator_id': 'dashboard',
                'target_id': user_id, 'reason': reason,
                'timestamp': int(datetime.utcnow().timestamp())
            })
            guild_data['next_case_id'] = case_id + 1
            # Mark all active mutes for this user as expired
            for case in guild_data['cases']:
                if case.get('type') == 'mute' and case.get('target_id') == user_id and case.get('expires_at') and case['expires_at'] > int(datetime.utcnow().timestamp()):
                    case['unmuted'] = True
            save_cp_json(CUB_PROTECTOR_MODERATION_FILE, data)
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to unmute user'}), 500

    elif action == 'unban':
        result = _guild_bot_request(guild_id, 'DELETE', f'/guilds/{guild_id}/bans/{user_id}')
        if result is not None:
            data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
            if 'guilds' not in data: data['guilds'] = {}
            if guild_id not in data['guilds']: data['guilds'][guild_id] = {'warnings': [], 'notes': [], 'cases': [], 'next_case_id': 1}
            guild_data = data['guilds'][guild_id]
            case_id = guild_data.get('next_case_id', 1)
            guild_data['cases'].append({
                'case_id': case_id, 'type': 'unban', 'moderator_id': 'dashboard',
                'target_id': user_id, 'reason': reason,
                'timestamp': int(datetime.utcnow().timestamp())
            })
            guild_data['next_case_id'] = case_id + 1
            save_cp_json(CUB_PROTECTOR_MODERATION_FILE, data)
            return jsonify({'success': True})
        return jsonify({'error': 'Failed to unban user'}), 500

    return jsonify({'error': 'Invalid action'}), 400

# ==================== CUB PROTECTOR - SOCIAL FEEDS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/social-feeds', methods=['GET'])
@cub_protector_auth_required
def cub_protector_social_feeds_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_SOCIAL_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'feeds': []})
    return jsonify({'feeds': guild_data.get('feeds', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/social-feeds', methods=['POST'])
@cub_protector_auth_required
def cub_protector_social_feeds_create(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_SOCIAL_FEEDS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'feeds': []}

    import uuid
    feed = {
        'id': str(uuid.uuid4())[:8],
        'platform': str(body.get('platform', 'youtube')),
        'name': str(body.get('name', ''))[:100],
        'platform_id': str(body.get('platform_id', '')),
        'url': str(body.get('url', '')),
        'channel_id': str(body.get('channel_id', '')),
        'message': str(body.get('message', '{name} posted: **{title}**\n{link}'))[:500],
        'ping_role': str(body.get('ping_role', '')),
        'enabled': True,
        'last_post_id': '',
    }
    data['guilds'][guild_id]['feeds'].append(feed)
    save_cp_json(CUB_PROTECTOR_SOCIAL_FEEDS_FILE, data)
    return jsonify({'success': True, 'feed': feed})

@app.route('/api/cub-protector/guilds/<guild_id>/social-feeds/<feed_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_social_feeds_delete(guild_id, feed_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_SOCIAL_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'feeds': []})
    guild_data['feeds'] = [f for f in guild_data.get('feeds', []) if f.get('id') != feed_id]
    data['guilds'][guild_id] = guild_data
    save_cp_json(CUB_PROTECTOR_SOCIAL_FEEDS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/social-feeds/<feed_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_social_feeds_edit(guild_id, feed_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_SOCIAL_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'feeds': []})
    for feed in guild_data.get('feeds', []):
        if feed.get('id') == feed_id:
            if 'enabled' in body:
                feed['enabled'] = bool(body['enabled'])
            if 'channel_id' in body:
                feed['channel_id'] = str(body['channel_id'])
            if 'message' in body:
                feed['message'] = str(body['message'])[:500]
            if 'ping_role' in body:
                feed['ping_role'] = str(body['ping_role'])
            break
    data['guilds'][guild_id] = guild_data
    save_cp_json(CUB_PROTECTOR_SOCIAL_FEEDS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - LIVE ALERTS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/live-alerts', methods=['GET'])
@cub_protector_auth_required
def cub_protector_live_alerts_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'enabled': False, 'alert_channel': '', 'streamers': []})
    # Strip subscriber lists from response — only expose count for privacy
    safe_streamers = []
    for s in guild_data.get('streamers', []):
        sc = dict(s)
        sc['subscriber_count'] = len(sc.pop('subscribers', []))
        safe_streamers.append(sc)
    return jsonify({
        'enabled': guild_data.get('enabled', False),
        'alert_channel': guild_data.get('alert_channel', ''),
        'streamers': safe_streamers,
    })

@app.route('/api/cub-protector/guilds/<guild_id>/live-alerts', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_live_alerts_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': False, 'alert_channel': '', 'streamers': []}
    if 'enabled' in body:
        data['guilds'][guild_id]['enabled'] = bool(body['enabled'])
    if 'alert_channel' in body:
        data['guilds'][guild_id]['alert_channel'] = str(body['alert_channel'])
    save_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/live-alerts/streamers', methods=['POST'])
@cub_protector_auth_required
def cub_protector_live_alerts_add(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    platform = str(body.get('platform', 'twitch')).lower()
    if platform not in ('twitch', 'youtube', 'kick'):
        return jsonify({'error': 'Invalid platform'}), 400
    username = str(body.get('username', '')).strip()[:100]
    if not username:
        return jsonify({'error': 'Username is required'}), 400
    import uuid
    streamer = {
        'id': str(uuid.uuid4())[:8],
        'platform': platform,
        'username': username,
        'display_name': str(body.get('display_name', username)).strip()[:100] or username,
        'platform_id': str(body.get('platform_id', '')).strip()[:200],
        'ping_role': str(body.get('ping_role', '')),
        'message': str(body.get('message', '')).strip()[:1000] or '{emoji} **{username}** is now live on {platform}!\n**{title}**\n{url}',
        'enabled': True,
        'auto_delete': bool(body.get('auto_delete', False)),
        'is_live': False,
        'last_stream_id': '',
        'alert_message_id': None,
        'alert_channel_id': None,
        'subscribers': [],
    }
    data = load_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': True, 'alert_channel': '', 'streamers': []}
    data['guilds'][guild_id].setdefault('streamers', []).append(streamer)
    save_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE, data)
    safe = dict(streamer)
    safe['subscriber_count'] = 0
    del safe['subscribers']
    return jsonify({'success': True, 'streamer': safe})

@app.route('/api/cub-protector/guilds/<guild_id>/live-alerts/streamers/<streamer_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_live_alerts_delete(guild_id, streamer_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'streamers': []})
    guild_data['streamers'] = [s for s in guild_data.get('streamers', []) if s.get('id') != streamer_id]
    if 'guilds' in data and guild_id in data['guilds']:
        data['guilds'][guild_id] = guild_data
    save_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/live-alerts/streamers/<streamer_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_live_alerts_edit(guild_id, streamer_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'streamers': []})
    for s in guild_data.get('streamers', []):
        if s.get('id') == streamer_id:
            if 'enabled' in body:
                s['enabled'] = bool(body['enabled'])
            if 'auto_delete' in body:
                s['auto_delete'] = bool(body['auto_delete'])
            if 'ping_role' in body:
                s['ping_role'] = str(body['ping_role'])
            if 'message' in body:
                s['message'] = str(body['message'])[:1000]
            if 'display_name' in body:
                s['display_name'] = str(body['display_name'])[:100]
            break
    if 'guilds' in data and guild_id in data['guilds']:
        data['guilds'][guild_id] = guild_data
    save_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/live-alerts/streamers/<streamer_id>/test', methods=['POST'])
@cub_protector_auth_required
def cub_protector_live_alerts_test(guild_id, streamer_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_LIVE_ALERTS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    alert_channel = guild_data.get('alert_channel', '')
    if not alert_channel:
        return jsonify({'error': 'No alert channel configured. Save Live Alerts settings first.'}), 400
    streamer = next((s for s in guild_data.get('streamers', []) if s.get('id') == streamer_id), None)
    if not streamer:
        return jsonify({'error': 'Streamer not found'}), 404

    platform = streamer.get('platform', 'twitch')
    display_name = streamer.get('display_name') or streamer.get('username', 'TestStreamer')
    platform_colors = {'twitch': 0x9146FF, 'youtube': 0xFF0000, 'kick': 0x53FC18}
    platform_names = {'twitch': 'Twitch', 'youtube': 'YouTube', 'kick': 'Kick'}
    platform_emojis = {'twitch': '\U0001f7e3', 'youtube': '\U0001f534', 'kick': '\U0001f7e2'}
    stream_domains = {'twitch': 'twitch.tv', 'youtube': 'youtube.com/live', 'kick': 'kick.com'}

    emoji = platform_emojis.get(platform, '\U0001f4fa')
    platform_name = platform_names.get(platform, platform.title())
    color = platform_colors.get(platform, 0x5865F2)
    test_title = f'{display_name} Test Stream'
    test_game = 'Just Chatting'
    test_url = f'https://{stream_domains.get(platform, platform)}/{streamer.get("username", "test")}'
    test_viewers = 42

    msg_template = streamer.get('message') or f'{emoji} **{{username}}** is now live on {{platform}}!\n{{url}}'
    alert_msg = (msg_template
        .replace('{username}', display_name)
        .replace('{title}', test_title)
        .replace('{game}', test_game)
        .replace('{url}', test_url)
        .replace('{platform}', platform_name)
        .replace('{emoji}', emoji)
        .replace('{viewers}', str(test_viewers)))

    import datetime as _dt
    embed = {
        'color': color,
        'title': f'{emoji} {display_name} is Live on {platform_name}! (TEST)',
        'description': alert_msg,
        'url': test_url,
        'fields': [
            {'name': 'Stream Title', 'value': test_title, 'inline': True},
            {'name': 'Playing', 'value': test_game, 'inline': True},
            {'name': 'Viewers', 'value': str(test_viewers), 'inline': True},
        ],
        'footer': {'text': '\u26a0\ufe0f This is a test alert \u2014 not a real live notification'},
        'timestamp': _dt.datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ'),
    }

    payload = {'embeds': [embed]}
    ping_role = streamer.get('ping_role', '')
    if ping_role == 'everyone':
        payload['content'] = '@everyone'
    elif ping_role == 'here':
        payload['content'] = '@here'
    elif ping_role:
        payload['content'] = f'<@&{ping_role}>'

    token = _get_guild_bot_token(guild_id)
    result = cub_protector_bot_request('POST', f'/channels/{alert_channel}/messages', json=payload, token=token)
    if result is None:
        return jsonify({'error': 'Failed to send test alert. Make sure the alert channel is set and the bot has access.'}), 500
    return jsonify({'success': True})

# ==================== CUSTOM BOT API ====================

def _load_custom_bots():
    try:
        if os.path.exists(CUSTOM_BOTS_FILE):
            with open(CUSTOM_BOTS_FILE, 'r') as f:
                return json.load(f)
    except Exception:
        pass
    return {'guilds': {}}

def _save_custom_bots(data):
    with open(CUSTOM_BOTS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def _get_guild_bot_token(guild_id):
    """Return the effective Discord bot token for a guild.
    Uses the custom bot token if the guild has an active custom bot, else falls back to the main bot token."""
    try:
        cb_data = _load_custom_bots()
        entry = cb_data.get('guilds', {}).get(str(guild_id), {})
        if entry.get('enabled') and entry.get('token'):
            return entry['token']
    except Exception:
        pass
    return get_cub_protector_token()

def _guild_bot_request(guild_id, *args, **kwargs):
    """Like cub_protector_bot_request but automatically picks the correct bot token for the guild.
    If the custom bot token fails (bot not in guild / invalid token), falls back to the main bot token."""
    main_token = get_cub_protector_token()
    guild_token = _get_guild_bot_token(guild_id)
    kwargs['token'] = guild_token
    result = cub_protector_bot_request(*args, **kwargs)
    # If the guild-specific token failed and it was different from the main token, try main bot as fallback
    if result is None and guild_token != main_token:
        kwargs['token'] = main_token
        kwargs['bypass_cache'] = True  # skip stale/empty cached result
        result = cub_protector_bot_request(*args, **kwargs)
    return result

@app.route('/api/cub-protector/guilds/<guild_id>/custom-bot', methods=['GET'])
@cub_protector_auth_required
def custom_bot_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = _load_custom_bots()
    entry = data.get('guilds', {}).get(guild_id, {})
    # Never return the token — only safe fields
    cid = entry.get('client_id', '')
    avatar_hash = entry.get('bot_avatar', '')
    avatar_url = f"https://cdn.discordapp.com/avatars/{cid}/{avatar_hash}.png?size=128" if cid and avatar_hash else ''
    invite_url = f"https://discord.com/oauth2/authorize?client_id={cid}&scope=bot%20applications.commands&permissions=8&guild_id={guild_id}&disable_guild_select=false" if cid else ''
    # Support both old 'bot_name' field and new split fields
    display_name = entry.get('display_name') or entry.get('bot_name', '')
    discord_username = entry.get('discord_username', '')
    presence = entry.get('presence', {'status': 'online', 'activity_type': 'playing', 'activity_text': ''})
    return jsonify({
        'enabled': entry.get('enabled', False),
        'client_id': cid,
        'display_name': display_name,
        'discord_username': discord_username,
        'bot_avatar_url': avatar_url,
        'has_token': bool(entry.get('token')),
        'invite_url': invite_url,
        'pm2_name': f"cp-custom-{guild_id}",
        'presence': presence,
    })

@app.route('/api/cub-protector/guilds/<guild_id>/custom-bot', methods=['POST'])
@cub_protector_auth_required
def custom_bot_save(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    # Only the guild owner can set up a custom bot
    user = session.get('cub_protector_user', {})
    body = request.get_json(silent=True) or {}
    token = str(body.get('token', '')).strip()
    display_name = str(body.get('display_name', '')).strip()[:64]
    if not token:
        return jsonify({'error': 'Bot token is required'}), 400
    # Auto-extract client_id from token (first segment is bot user ID base64-encoded)
    try:
        import base64 as _b64
        first_seg = token.split('.')[0]
        # Pad to multiple of 4
        padding = 4 - len(first_seg) % 4
        if padding != 4:
            first_seg += '=' * padding
        client_id = _b64.b64decode(first_seg).decode('utf-8').strip()
        if not client_id.isdigit():
            raise ValueError('Not a valid ID')
    except Exception:
        return jsonify({'error': 'Invalid bot token — could not extract Application ID'}), 400

    data = _load_custom_bots()
    if 'guilds' not in data:
        data['guilds'] = {}
    # Fetch bot info early so we can store it
    _bot_info_pre = {}
    try:
        import urllib.request as _ur2, json as _json2
        req2 = _ur2.Request('https://discord.com/api/v10/users/@me',
                            headers={'Authorization': f'Bot {token}', 'User-Agent': 'CUBProtector/1.0'})
        with _ur2.urlopen(req2, timeout=5) as resp2:
            _bot_info_pre = _json2.loads(resp2.read().decode())
    except Exception:
        pass
    data['guilds'][guild_id] = {
        'enabled': True,
        'token': token,
        'client_id': client_id,
        'display_name': display_name,  # user's chosen label (may be empty)
        'discord_username': _bot_info_pre.get('username', ''),  # actual Discord bot username
        'bot_avatar': _bot_info_pre.get('avatar', ''),
        'bot_id': client_id,
        'guild_id': guild_id,
        'created_by': user.get('id', ''),
    }
    _save_custom_bots(data)

    # Start or restart the custom bot PM2 process
    import subprocess, json as _json
    process_name = f'cp-custom-{guild_id}'

    # Write a small Node.js wrapper that sets env vars at the process level
    # before requiring index.js. This is more reliable than PM2 ecosystem files,
    # which PM2 may treat as regular scripts if the filename doesn't match
    # the expected "ecosystem.config.js" pattern.
    wrapper_file = os.path.join(CUB_PROTECTOR_DIR, f'custom_bot_{guild_id}.js')
    escaped_token = token.replace('\\', '\\\\').replace("'", "\\'")
    with open(wrapper_file, 'w') as f:
        f.write(f"""// Auto-generated launcher for custom bot (guild: {guild_id})
// Do not edit — regenerated on each activation
process.env.DISCORD_TOKEN = '{escaped_token}';
process.env.CLIENT_ID = '{client_id}';
process.env.CUSTOM_GUILD_ID = '{guild_id}';
require('./index');
""")

    # Stop existing process if running, then start from the wrapper script
    subprocess.run(['pm2', 'delete', process_name], capture_output=True)
    result = subprocess.run(
        ['pm2', 'start', wrapper_file, '--name', process_name],
        capture_output=True, text=True, cwd=CUB_PROTECTOR_DIR
    )

    invite_url = f"https://discord.com/oauth2/authorize?client_id={client_id}&scope=bot%20applications.commands&permissions=8&guild_id={guild_id}&disable_guild_select=false"
    # Fetch bot info (avatar, username) from Discord API
    bot_info = {}
    try:
        import urllib.request as _ur
        req = _ur.Request('https://discord.com/api/v10/users/@me',
                          headers={'Authorization': f'Bot {token}', 'User-Agent': 'CUBProtector/1.0'})
        with _ur.urlopen(req, timeout=5) as resp:
            bot_info = __import__('json').loads(resp.read().decode())
    except Exception:
        pass
    return jsonify({'success': True, 'pm2_name': process_name, 'invite_url': invite_url,
                    'bot_username': bot_info.get('username', ''), 'bot_avatar': bot_info.get('avatar', ''),
                    'bot_id': client_id})

@app.route('/api/cub-protector/guilds/<guild_id>/custom-bot', methods=['PATCH'])
@cub_protector_auth_required
def custom_bot_patch(guild_id):
    """Update display name and optionally rename the bot on Discord."""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = _load_custom_bots()
    entry = data.get('guilds', {}).get(guild_id, {})
    if not entry.get('enabled') or not entry.get('token'):
        return jsonify({'error': 'No custom bot configured'}), 404
    body = request.get_json(silent=True) or {}
    display_name = str(body.get('display_name', '')).strip()[:32]

    # Presence settings
    valid_statuses = {'online', 'idle', 'dnd', 'invisible'}
    valid_activity_types = {'playing', 'watching', 'listening', 'competing', 'streaming'}
    presence_status = str(body.get('presence_status', 'online')).lower()
    if presence_status not in valid_statuses:
        presence_status = 'online'
    activity_type = str(body.get('activity_type', 'playing')).lower()
    if activity_type not in valid_activity_types:
        activity_type = 'playing'
    activity_text = str(body.get('activity_text', '')).strip()[:128]
    entry['presence'] = {
        'status': presence_status,
        'activity_type': activity_type,
        'activity_text': activity_text,
    }

    discord_error = None
    if display_name:
        # Update the bot's actual Discord username via the API
        token = entry.get('token', '')
        try:
            resp = requests.patch(
                'https://discord.com/api/v10/users/@me',
                headers={'Authorization': f'Bot {token}', 'User-Agent': 'CUBProtector/1.0'},
                json={'username': display_name},
                timeout=8
            )
            if resp.status_code == 200:
                updated = resp.json()
                entry['discord_username'] = updated.get('username', display_name)
            elif resp.status_code == 429:
                discord_error = 'Rate limited — Discord only allows 2 username changes per hour'
            else:
                try:
                    discord_error = resp.json().get('message', f'Discord error {resp.status_code}')
                except Exception:
                    discord_error = f'Discord error {resp.status_code}'
        except Exception as e:
            discord_error = str(e)

    entry['display_name'] = display_name
    data['guilds'][guild_id] = entry
    _save_custom_bots(data)

    if discord_error:
        return jsonify({'success': True, 'warning': discord_error})
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/custom-bot', methods=['DELETE'])
@cub_protector_auth_required
def custom_bot_delete(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = _load_custom_bots()
    entry = data.get('guilds', {}).get(guild_id, {})
    token = entry.get('token', '')
    client_id = entry.get('client_id', '')

    # Make the custom bot leave the guild before stopping it
    if token and guild_id:
        try:
            import urllib.request as _ur3
            req3 = _ur3.Request(
                f'https://discord.com/api/v10/users/@me/guilds/{guild_id}',
                method='DELETE',
                headers={'Authorization': f'Bot {token}', 'User-Agent': 'CUBProtector/1.0'}
            )
            _ur3.urlopen(req3, timeout=5)
        except Exception:
            pass  # Already left or not in the guild — that's fine

    data.get('guilds', {}).pop(guild_id, None)
    _save_custom_bots(data)

    # Stop and remove PM2 process
    import subprocess
    process_name = f'cp-custom-{guild_id}'
    subprocess.run(['pm2', 'delete', process_name], capture_output=True)

    # Remove wrapper launcher file
    wrapper_file = os.path.join(CUB_PROTECTOR_DIR, f'custom_bot_{guild_id}.js')
    try:
        os.remove(wrapper_file)
    except Exception:
        pass
    # Also clean up any old ecosystem file if it exists
    ecosystem_file = os.path.join(CUB_PROTECTOR_DIR, f'ecosystem.custom.{guild_id}.js')
    try:
        os.remove(ecosystem_file)
    except Exception:
        pass

    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/custom-bot/status', methods=['GET'])
@cub_protector_auth_required
def custom_bot_status(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    import subprocess
    process_name = f'cp-custom-{guild_id}'
    result = subprocess.run(['pm2', 'jlist'], capture_output=True, text=True)
    status = 'stopped'
    try:
        processes = json.loads(result.stdout)
        for p in processes:
            if p.get('name') == process_name:
                status = p.get('pm2_env', {}).get('status', 'stopped')
                break
    except Exception:
        pass
    return jsonify({'status': status})

# ==================== CUB PROTECTOR - SERVER BACKUP API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/backups', methods=['GET'])
@cub_protector_auth_required
def cub_protector_backups_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_BACKUPS_FILE)
    guild_backups = data.get('guilds', {}).get(guild_id, [])
    return jsonify({'backups': guild_backups})

@app.route('/api/cub-protector/guilds/<guild_id>/backups', methods=['POST'])
@cub_protector_auth_required
def cub_protector_backups_create(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    # Fetch guild info via Discord API
    guild_data = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}?with_counts=true')
    if not guild_data:
        return jsonify({'error': 'Failed to fetch guild data'}), 500

    # Fetch channels
    channels = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/channels') or []

    # Fetch roles
    roles = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/roles') or []

    import uuid
    backup = {
        'id': str(uuid.uuid4())[:8],
        'name': request.get_json(silent=True).get('name', 'Backup') if request.get_json(silent=True) else 'Backup',
        'created_at': datetime.utcnow().isoformat(),
        'guild_name': guild_data.get('name', ''),
        'guild_icon': guild_data.get('icon', ''),
        'member_count': guild_data.get('approximate_member_count', 0),
        'roles': [{'id': r['id'], 'name': r['name'], 'color': r['color'], 'permissions': r['permissions'], 'position': r['position'], 'hoist': r.get('hoist', False), 'mentionable': r.get('mentionable', False)} for r in roles if r['name'] != '@everyone'],
        'channels': [{'id': c['id'], 'name': c['name'], 'type': c['type'], 'position': c.get('position', 0), 'parent_id': c.get('parent_id'), 'topic': c.get('topic', ''), 'nsfw': c.get('nsfw', False), 'bitrate': c.get('bitrate'), 'user_limit': c.get('user_limit')} for c in channels],
        'settings': {
            'verification_level': guild_data.get('verification_level', 0),
            'default_message_notifications': guild_data.get('default_message_notifications', 0),
            'explicit_content_filter': guild_data.get('explicit_content_filter', 0),
        }
    }

    # Also backup bot config data
    for config_file, key in [
        (CUB_PROTECTOR_AUTOMOD_FILE, 'automod'),
        (CUB_PROTECTOR_WELCOME_FILE, 'welcome'),
        (CUB_PROTECTOR_LOGGING_FILE, 'logging'),
        (CUB_PROTECTOR_LEVELS_FILE, 'leveling'),
        (CUB_PROTECTOR_AUTOROLES_FILE, 'autoroles'),
    ]:
        cfg = load_cp_json(config_file)
        backup[f'config_{key}'] = cfg.get('guilds', {}).get(guild_id, {})

    data = load_cp_json(CUB_PROTECTOR_BACKUPS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = []

    # Limit to 10 backups per guild
    if len(data['guilds'][guild_id]) >= 10:
        data['guilds'][guild_id] = data['guilds'][guild_id][-9:]

    data['guilds'][guild_id].append(backup)
    save_cp_json(CUB_PROTECTOR_BACKUPS_FILE, data)
    return jsonify({'success': True, 'backup': {'id': backup['id'], 'name': backup['name'], 'created_at': backup['created_at']}})

@app.route('/api/cub-protector/guilds/<guild_id>/backups/<backup_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_backups_delete(guild_id, backup_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_BACKUPS_FILE)
    guild_backups = data.get('guilds', {}).get(guild_id, [])
    data['guilds'][guild_id] = [b for b in guild_backups if b.get('id') != backup_id]
    save_cp_json(CUB_PROTECTOR_BACKUPS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/backups/<backup_id>', methods=['GET'])
@cub_protector_auth_required
def cub_protector_backups_detail(guild_id, backup_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_BACKUPS_FILE)
    guild_backups = data.get('guilds', {}).get(guild_id, [])
    backup = next((b for b in guild_backups if b.get('id') == backup_id), None)
    if not backup:
        return jsonify({'error': 'Backup not found'}), 404
    return jsonify({'backup': backup})

@app.route('/api/cub-protector/guilds/<guild_id>/backups/<backup_id>/restore', methods=['POST'])
@cub_protector_auth_required
def cub_protector_backups_restore(guild_id, backup_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    data = load_cp_json(CUB_PROTECTOR_BACKUPS_FILE)
    guild_backups = data.get('guilds', {}).get(guild_id, [])
    backup = next((b for b in guild_backups if b.get('id') == backup_id), None)
    if not backup:
        return jsonify({'error': 'Backup not found'}), 404

    body = request.get_json(silent=True) or {}
    restore_what = body.get('restore', ['configs'])
    restored = []

    # Restore bot configs
    if 'configs' in restore_what:
        for config_file, key in [
            (CUB_PROTECTOR_AUTOMOD_FILE, 'automod'),
            (CUB_PROTECTOR_WELCOME_FILE, 'welcome'),
            (CUB_PROTECTOR_LOGGING_FILE, 'logging'),
            (CUB_PROTECTOR_LEVELS_FILE, 'leveling'),
            (CUB_PROTECTOR_AUTOROLES_FILE, 'autoroles'),
        ]:
            cfg_data = backup.get(f'config_{key}')
            if cfg_data:
                file_data = load_cp_json(config_file)
                if 'guilds' not in file_data:
                    file_data['guilds'] = {}
                file_data['guilds'][guild_id] = cfg_data
                save_cp_json(config_file, file_data)
        restored.append('configs')

    # Restore roles (create missing roles)
    if 'roles' in restore_what:
        for role in sorted(backup.get('roles', []), key=lambda r: r.get('position', 0)):
            _guild_bot_request(guild_id, 'POST', f'/guilds/{guild_id}/roles', json={
                'name': role['name'],
                'color': role['color'],
                'permissions': str(role['permissions']),
                'hoist': role.get('hoist', False),
                'mentionable': role.get('mentionable', False),
            })
        restored.append('roles')

    # Restore channels (create missing channels)
    if 'channels' in restore_what:
        # Categories first
        for ch in sorted(backup.get('channels', []), key=lambda c: (0 if c['type'] == 4 else 1, c.get('position', 0))):
            payload = {'name': ch['name'], 'type': ch['type']}
            if ch.get('parent_id') and ch['type'] != 4:
                payload['parent_id'] = ch['parent_id']
            if ch.get('topic'):
                payload['topic'] = ch['topic']
            _guild_bot_request(guild_id, 'POST', f'/guilds/{guild_id}/channels', json=payload)
        restored.append('channels')

    return jsonify({'success': True, 'restored': restored})

# ==================== CUB PROTECTOR - REACTION ROLES API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/reaction-roles', methods=['GET'])
@cub_protector_auth_required
def cub_protector_reaction_roles_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_REACTION_ROLES_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'messages': guild_data.get('messages', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/reaction-roles', methods=['POST'])
@cub_protector_auth_required
def cub_protector_reaction_roles_post(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    channel_id = req.get('channel_id')
    message_text = req.get('message_text', '')
    pairs = req.get('pairs', [])
    if not channel_id or not message_text or not pairs:
        return jsonify({'error': 'Missing fields'}), 400
    import uuid
    data = load_cp_json(CUB_PROTECTOR_REACTION_ROLES_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'messages': []}
    rr_entry = {
        'id': str(uuid.uuid4())[:8],
        'channel_id': channel_id,
        'message_id': None,
        'message_text': message_text[:2000],
        'pairs': [{'emoji': p['emoji'], 'role_id': p['role_id']} for p in pairs[:25]]
    }
    data['guilds'][guild_id]['messages'].append(rr_entry)
    save_cp_json(CUB_PROTECTOR_REACTION_ROLES_FILE, data)
    return jsonify({'success': True, 'id': rr_entry['id']})

@app.route('/api/cub-protector/guilds/<guild_id>/reaction-roles/<rr_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_reaction_roles_delete(guild_id, rr_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_REACTION_ROLES_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    guild_data['messages'] = [m for m in guild_data.get('messages', []) if m.get('id') != rr_id]
    save_cp_json(CUB_PROTECTOR_REACTION_ROLES_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - CUSTOM COMMANDS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/custom-commands', methods=['GET'])
@cub_protector_auth_required
def cub_protector_custom_commands_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_CUSTOM_COMMANDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'commands': guild_data.get('commands', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/custom-commands', methods=['POST'])
@cub_protector_auth_required
def cub_protector_custom_commands_post(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    name = (req.get('name') or '').strip().lower()
    if not name:
        return jsonify({'error': 'Command name required'}), 400
    data = load_cp_json(CUB_PROTECTOR_CUSTOM_COMMANDS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'commands': []}
    cmds = data['guilds'][guild_id]['commands']
    if any(c['name'] == name for c in cmds):
        return jsonify({'error': 'Command already exists'}), 400
    cmds.append({
        'name': name,
        'trigger': req.get('trigger', 'prefix'),
        'response_type': req.get('response_type', 'text'),
        'response': (req.get('response') or '')[:2000],
        'required_role': req.get('required_role', ''),
        'cooldown': min(int(req.get('cooldown') or 0), 3600),
        'enabled': True
    })
    save_cp_json(CUB_PROTECTOR_CUSTOM_COMMANDS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/custom-commands/<cmd_name>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_custom_commands_patch(guild_id, cmd_name):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_CUSTOM_COMMANDS_FILE)
    cmds = data.get('guilds', {}).get(guild_id, {}).get('commands', [])
    cmd = next((c for c in cmds if c['name'] == cmd_name), None)
    if not cmd:
        return jsonify({'error': 'Not found'}), 404
    req = request.get_json()
    if req.get('toggle'):
        cmd['enabled'] = not cmd.get('enabled', True)
    save_cp_json(CUB_PROTECTOR_CUSTOM_COMMANDS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/custom-commands/<cmd_name>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_custom_commands_delete(guild_id, cmd_name):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_CUSTOM_COMMANDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    guild_data['commands'] = [c for c in guild_data.get('commands', []) if c['name'] != cmd_name]
    save_cp_json(CUB_PROTECTOR_CUSTOM_COMMANDS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - STARBOARD API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/starboard', methods=['GET'])
@cub_protector_auth_required
def cub_protector_starboard_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_STARBOARD_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    config = {k: v for k, v in guild_data.items() if k != 'starred_messages'}
    recent = sorted(guild_data.get('starred_messages', {}).values(), key=lambda m: m.get('stars', 0), reverse=True)[:10]
    return jsonify({'config': config, 'recent': recent})

@app.route('/api/cub-protector/guilds/<guild_id>/starboard', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_starboard_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_STARBOARD_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': False, 'channel': '', 'emoji': '⭐', 'threshold': 3, 'self_star': False, 'ignore_nsfw': True, 'allow_bots': False, 'starred_messages': {}}
    guild_data = data['guilds'][guild_id]
    for k in ['enabled', 'channel', 'emoji', 'threshold', 'self_star', 'ignore_nsfw', 'allow_bots']:
        if k in req:
            guild_data[k] = req[k]
    save_cp_json(CUB_PROTECTOR_STARBOARD_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - AFK API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/afk', methods=['GET'])
@cub_protector_auth_required
def cub_protector_afk_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_AFK_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    config = {k: v for k, v in guild_data.items() if k != 'users'}
    users_dict = guild_data.get('users', {})
    afk_users = [{'user_id': uid, 'reason': u.get('reason', ''), 'timestamp': u.get('timestamp', 0)} for uid, u in users_dict.items()]
    return jsonify({'config': config, 'afk_users': afk_users})

@app.route('/api/cub-protector/guilds/<guild_id>/afk', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_afk_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_AFK_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': True, 'message_template': '', 'max_duration_hours': 0, 'users': {}}
    guild_data = data['guilds'][guild_id]
    for k in ['enabled', 'message_template', 'max_duration_hours']:
        if k in req:
            guild_data[k] = req[k]
    save_cp_json(CUB_PROTECTOR_AFK_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/afk/clear', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_afk_clear(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_AFK_FILE)
    if guild_id in data.get('guilds', {}):
        data['guilds'][guild_id]['users'] = {}
        save_cp_json(CUB_PROTECTOR_AFK_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - SUGGESTIONS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/suggestions', methods=['GET'])
@cub_protector_auth_required
def cub_protector_suggestions_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_SUGGESTIONS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    config = {k: v for k, v in guild_data.items() if k != 'suggestions'}
    return jsonify({'config': config, 'suggestions': guild_data.get('suggestions', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/suggestions', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_suggestions_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_SUGGESTIONS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': False, 'channel': '', 'approved_channel': '', 'denied_channel': '', 'anonymous': False, 'auto_react': True, 'suggestions': []}
    guild_data = data['guilds'][guild_id]
    for k in ['enabled', 'channel', 'approved_channel', 'denied_channel', 'anonymous', 'auto_react']:
        if k in req:
            guild_data[k] = req[k]
    save_cp_json(CUB_PROTECTOR_SUGGESTIONS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/suggestions/<sug_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_suggestion_update(guild_id, sug_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    status = req.get('status')
    if status not in ('approved', 'denied'):
        return jsonify({'error': 'Invalid status'}), 400
    data = load_cp_json(CUB_PROTECTOR_SUGGESTIONS_FILE)
    suggestions = data.get('guilds', {}).get(guild_id, {}).get('suggestions', [])
    for s in suggestions:
        if s.get('id') == sug_id:
            s['status'] = status
            break
    save_cp_json(CUB_PROTECTOR_SUGGESTIONS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - ANTI-RAID API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/anti-raid', methods=['GET'])
@cub_protector_auth_required
def cub_protector_antiraid_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ANTI_RAID_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'config': guild_data})

@app.route('/api/cub-protector/guilds/<guild_id>/anti-raid', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_antiraid_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_ANTI_RAID_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'enabled': False, 'max_joins': 10, 'join_window': 10, 'action': 'alert', 'alert_channel': '', 'min_account_age_days': 0, 'require_avatar': False, 'lockdown_duration': 0}
    guild_data = data['guilds'][guild_id]
    for k in ['enabled', 'max_joins', 'join_window', 'action', 'alert_channel', 'min_account_age_days', 'require_avatar', 'lockdown_duration']:
        if k in req:
            guild_data[k] = req[k]
    save_cp_json(CUB_PROTECTOR_ANTI_RAID_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - AUDIT LOG API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/audit-log', methods=['GET'])
@cub_protector_auth_required
def cub_protector_audit_log(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    filter_type = request.args.get('type', 'all')
    limit = min(int(request.args.get('limit', 50)), 100)
    action_type_map = {
        'bans': [22, 23],
        'kicks': [20],
        'channels': [10, 11, 12],
        'roles': [30, 31, 32],
        'messages': [72, 73]
    }
    params = {'limit': limit}
    if filter_type in action_type_map:
        params['action_type'] = action_type_map[filter_type][0]
    audit_data = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/audit-logs', params=params)
    if not audit_data:
        return jsonify({'entries': []})
    action_names = {
        1: 'Guild Update', 10: 'Channel Create', 11: 'Channel Update', 12: 'Channel Delete',
        20: 'Member Kick', 22: 'Member Ban', 23: 'Member Unban', 25: 'Member Role Update',
        26: 'Member Move', 27: 'Member Disconnect', 30: 'Role Create', 31: 'Role Update',
        32: 'Role Delete', 72: 'Message Delete', 73: 'Message Bulk Delete', 74: 'Message Pin',
        75: 'Message Unpin', 83: 'Auto Moderation Action'
    }
    users = {u['id']: u.get('username', u['id']) for u in audit_data.get('users', [])}
    channels = {c['id']: c.get('name', c['id']) for c in audit_data.get('channels', [])}
    entries = []
    allowed_types = action_type_map.get(filter_type)
    for entry in audit_data.get('audit_log_entries', []):
        action = int(entry.get('action_type', 0))
        if allowed_types and action not in allowed_types:
            continue
        executor_id = entry.get('user_id', '')
        target_id = entry.get('target_id', '')
        # Resolve target name: try users first, then channels, then raw ID
        target_name = users.get(target_id) or channels.get(target_id) or target_id
        entries.append({
            'action_type': action_names.get(action, f'Action {action}'),
            'action_code': action,
            'executor': users.get(executor_id, executor_id),
            'target': target_name,
            'reason': entry.get('reason', ''),
            'timestamp': entry.get('id'),
            'changes': entry.get('changes', []),
            'options': entry.get('options', {})
        })
    # Convert snowflake ID to timestamp for display
    for e in entries:
        if e['timestamp']:
            try:
                ts = ((int(e['timestamp']) >> 22) + 1420070400000) / 1000
                e['timestamp'] = datetime.utcfromtimestamp(ts).isoformat() + 'Z'
            except (ValueError, TypeError):
                e['timestamp'] = ''
    return jsonify({'entries': entries})

# ==================== CUB PROTECTOR - MEMBER/ROLE MANAGEMENT API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/members/search', methods=['GET'])
@cub_protector_auth_required
def cub_protector_members_search(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    query = request.args.get('q', '')
    if not query:
        return jsonify({'members': []})
    if query.isdigit():
        m = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/members/{query}')
        if m and isinstance(m, dict) and 'user' in m:
            user = m.get('user', {})
            avatar = f"https://cdn.discordapp.com/avatars/{user['id']}/{user.get('avatar')}.png" if user.get('avatar') else ''
            return jsonify({'members': [{'id': user['id'], 'username': user.get('username', user['id']), 'avatar': avatar, 'roles': m.get('roles', []), 'joined_at': m.get('joined_at', '')}]})
    result = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/members/search', params={'query': query, 'limit': 5})
    if not result or not isinstance(result, list):
        return jsonify({'members': []})
    members = []
    for m in result:
        user = m.get('user', {})
        avatar = f"https://cdn.discordapp.com/avatars/{user['id']}/{user.get('avatar')}.png" if user.get('avatar') else ''
        members.append({'id': user['id'], 'username': user.get('username', user['id']), 'avatar': avatar, 'roles': m.get('roles', []), 'joined_at': m.get('joined_at', '')})
    return jsonify({'members': members})

@app.route('/api/cub-protector/guilds/<guild_id>/members/<member_id>/roles/<role_id>', methods=['PUT'])
@cub_protector_auth_required
def cub_protector_member_add_role(guild_id, member_id, role_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    result = _guild_bot_request(guild_id, 'PUT', f'/guilds/{guild_id}/members/{member_id}/roles/{role_id}')
    if result is not None:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to add role'}), 400

@app.route('/api/cub-protector/guilds/<guild_id>/members/<member_id>/roles/<role_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_member_remove_role(guild_id, member_id, role_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    result = _guild_bot_request(guild_id, 'DELETE', f'/guilds/{guild_id}/members/{member_id}/roles/{role_id}')
    if result is not None:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to remove role'}), 400

@app.route('/api/cub-protector/guilds/<guild_id>/bulk-role', methods=['POST'])
@cub_protector_auth_required
def cub_protector_bulk_role(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    role_id = req.get('role_id')
    action = req.get('action')
    exclude_bots = bool(req.get('exclude_bots', False))
    if not role_id or action not in ('add', 'remove'):
        return jsonify({'error': 'Invalid params'}), 400
    # Fetch members in batches
    members = []
    after = '0'
    for _ in range(10):
        batch = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/members', params={'limit': 1000, 'after': after})
        if not batch or not isinstance(batch, list):
            break
        if not batch:
            break
        members.extend(batch)
        after = batch[-1].get('user', {}).get('id', '0')
        if len(batch) < 1000:
            break
    count = 0
    for m in members:
        if exclude_bots and m.get('user', {}).get('bot'):
            continue
        uid = m.get('user', {}).get('id')
        has_role = role_id in m.get('roles', [])
        if action == 'add' and not has_role:
            _guild_bot_request(guild_id, 'PUT', f'/guilds/{guild_id}/members/{uid}/roles/{role_id}')
            count += 1
        elif action == 'remove' and has_role:
            _guild_bot_request(guild_id, 'DELETE', f'/guilds/{guild_id}/members/{uid}/roles/{role_id}')
            count += 1
    return jsonify({'success': True, 'message': f'{action.title()}d role for {count} members'})

# ==================== CUB PROTECTOR - WARNINGS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/warnings', methods=['GET'])
@cub_protector_auth_required
def cub_protector_warnings_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_WARNINGS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'settings': guild_data.get('settings', {}), 'warnings': guild_data.get('warnings', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/warnings/settings', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_warnings_settings(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    data = load_cp_json(CUB_PROTECTOR_WARNINGS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'settings': {}, 'warnings': []}
    settings = data['guilds'][guild_id].setdefault('settings', {})
    for k in ['points_per_warn', 'mute_threshold', 'kick_threshold', 'ban_threshold', 'expiry_days']:
        if k in req:
            settings[k] = req[k]
    save_cp_json(CUB_PROTECTOR_WARNINGS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/warnings/<warn_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_warning_delete(guild_id, warn_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_WARNINGS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    guild_data['warnings'] = [w for w in guild_data.get('warnings', []) if w.get('id') != warn_id]
    save_cp_json(CUB_PROTECTOR_WARNINGS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/warnings/all', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_warnings_clear(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_WARNINGS_FILE)
    if guild_id in data.get('guilds', {}):
        data['guilds'][guild_id]['warnings'] = []
        save_cp_json(CUB_PROTECTOR_WARNINGS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - ANNOUNCEMENTS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/announcements', methods=['GET'])
@cub_protector_auth_required
def cub_protector_announcements_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ANNOUNCEMENTS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'history': guild_data.get('history', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/announcements', methods=['POST'])
@cub_protector_auth_required
def cub_protector_announcements_post(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    req = request.get_json()
    channel_id = req.get('channel_id')
    if not channel_id:
        return jsonify({'error': 'Channel required'}), 400
    msg_type = req.get('type', 'text')
    mentions = ''
    if req.get('mention_everyone'):
        mentions += '@everyone '
    elif req.get('mention_here'):
        mentions += '@here '
    import uuid, time as _t
    payload = {}
    ann_record = {'id': str(uuid.uuid4())[:8], 'channel_id': channel_id, 'type': msg_type, 'timestamp': int(_t.time() * 1000)}
    if msg_type == 'text':
        content = req.get('content', '')
        if not content:
            return jsonify({'error': 'Message content required'}), 400
        payload['content'] = (mentions + content)[:2000]
        ann_record['content'] = content[:200]
    else:
        embed = {}
        if req.get('title'):
            embed['title'] = req['title'][:256]
            ann_record['title'] = req['title'][:200]
        if req.get('description'):
            embed['description'] = req['description'][:4096]
        if req.get('color'):
            try:
                embed['color'] = int(req['color'].lstrip('#'), 16)
            except (ValueError, AttributeError):
                pass
        if req.get('footer'):
            embed['footer'] = {'text': req['footer'][:2048]}
        if req.get('thumbnail'):
            embed['thumbnail'] = {'url': req['thumbnail']}
        if req.get('image'):
            embed['image'] = {'url': req['image']}
        embed['timestamp'] = __import__('datetime').datetime.utcnow().isoformat()
        payload['embeds'] = [embed]
        if mentions:
            payload['content'] = mentions.strip()
    result = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json=payload)
    if not result:
        return jsonify({'error': 'Failed to send message'}), 500
    # Save to history
    data = load_cp_json(CUB_PROTECTOR_ANNOUNCEMENTS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'history': []}
    ann_record['message_data'] = payload
    data['guilds'][guild_id]['history'].insert(0, ann_record)
    data['guilds'][guild_id]['history'] = data['guilds'][guild_id]['history'][:50]
    save_cp_json(CUB_PROTECTOR_ANNOUNCEMENTS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/announcements/<ann_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_announcement_delete(guild_id, ann_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ANNOUNCEMENTS_FILE)
    history = data.get('guilds', {}).get(guild_id, {}).get('history', [])
    data['guilds'][guild_id]['history'] = [a for a in history if a.get('id') != ann_id]
    save_cp_json(CUB_PROTECTOR_ANNOUNCEMENTS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/announcements/<ann_id>/resend', methods=['POST'])
@cub_protector_auth_required
def cub_protector_announcement_resend(guild_id, ann_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ANNOUNCEMENTS_FILE)
    history = data.get('guilds', {}).get(guild_id, {}).get('history', [])
    ann = next((a for a in history if a.get('id') == ann_id), None)
    if not ann:
        return jsonify({'error': 'Not found'}), 404
    payload = ann.get('message_data', {})
    channel_id = ann.get('channel_id')
    if not payload or not channel_id:
        return jsonify({'error': 'No message data'}), 400
    result = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json=payload)
    if result:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to resend'}), 500

# ==================== GENERIC CUB PROTECTOR FEATURE ENDPOINTS ====================

# Helper for standard GET/PATCH feature endpoints
def _cp_feature_get(guild_id, data_file):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(data_file)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'settings': guild_data.get('settings', {}), 'items': guild_data.get('items', [])})

def _cp_feature_update(guild_id, data_file):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(data_file)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {}
    body = request.get_json()
    data['guilds'][guild_id]['settings'] = body
    save_cp_json(data_file, data)
    return jsonify({'success': True})

def _cp_feature_add_item(guild_id, data_file):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(data_file)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'settings': {}, 'items': []}
    body = request.get_json()
    item = body.copy()
    item['id'] = str(int(time.time() * 1000))
    item['created_at'] = datetime.now().isoformat()
    data['guilds'][guild_id].setdefault('items', []).append(item)
    save_cp_json(data_file, data)
    return jsonify({'success': True, 'item': item})

def _cp_feature_delete_item(guild_id, item_id, data_file):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(data_file)
    items = data.get('guilds', {}).get(guild_id, {}).get('items', [])
    data['guilds'][guild_id]['items'] = [i for i in items if i.get('id') != item_id]
    save_cp_json(data_file, data)
    return jsonify({'success': True})

# --- Protection Features ---

# ==================== CUB PROTECTOR - COUNTERS API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/counters', methods=['GET'])
@cub_protector_auth_required
def cub_protector_counters_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_COUNTERS_FILE)
    counters = data.get('guilds', {}).get(guild_id, {}).get('counters', [])
    return jsonify({'counters': counters})

@app.route('/api/cub-protector/guilds/<guild_id>/counters', methods=['POST'])
@cub_protector_auth_required
def cub_protector_counters_create(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    import uuid
    body = request.get_json(silent=True) or {}
    counter_type = body.get('type', 'total_members')
    template = body.get('template', '{count}')
    interval = max(300000, min(3600000, int(body.get('interval', 300000))))
    category_id = body.get('category_id', '') or None
    extra = body.get('extra', {}) or {}
    valid_types = ['total_members', 'online_members', 'bots', 'humans', 'roles', 'channels',
                   'boosts', 'boost_tier', 'role_members', 'youtube_subs', 'twitch_followers',
                   'goal', 'date', 'clock']
    if counter_type not in valid_types:
        return jsonify({'error': 'Invalid counter type'}), 400
    if not template or '{count}' not in template:
        return jsonify({'error': 'Template must include {count}'}), 400
    counter_id = str(uuid.uuid4())[:8]
    # Create a voice channel for the counter (members cannot connect)
    channel_id = None
    try:
        ch_payload = {
            'name': template.replace('{count}', '...'),
            'type': 2,
            'user_limit': 0,
            'permission_overwrites': [
                {'id': guild_id, 'type': 0, 'deny': '1048576'}
            ]
        }
        if category_id:
            ch_payload['parent_id'] = category_id
        ch_data = _guild_bot_request(guild_id, 'POST', f'/guilds/{guild_id}/channels', json_data=ch_payload)
        if ch_data and 'id' in ch_data:
            channel_id = ch_data['id']
    except Exception:
        pass
    counter = {
        'id': counter_id,
        'type': counter_type,
        'template': template,
        'category_id': category_id,
        'interval': interval,
        'channel_id': channel_id,
        'extra': extra
    }
    data = load_cp_json(CUB_PROTECTOR_COUNTERS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'counters': []}
    data['guilds'][guild_id]['counters'].append(counter)
    save_cp_json(CUB_PROTECTOR_COUNTERS_FILE, data)
    return jsonify({'success': True, 'counter': counter})

@app.route('/api/cub-protector/guilds/<guild_id>/counters/<counter_id>', methods=['DELETE'])
@cub_protector_auth_required
def cub_protector_counters_delete(guild_id, counter_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_COUNTERS_FILE)
    counters = data.get('guilds', {}).get(guild_id, {}).get('counters', [])
    counter = next((c for c in counters if c['id'] == counter_id), None)
    if not counter:
        return jsonify({'error': 'Counter not found'}), 404
    if counter.get('channel_id'):
        try:
            cub_protector_bot_request('DELETE', f'/channels/{counter["channel_id"]}')
        except Exception:
            pass
    data['guilds'][guild_id]['counters'] = [c for c in counters if c['id'] != counter_id]
    save_cp_json(CUB_PROTECTOR_COUNTERS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/counters/<counter_id>', methods=['PATCH'])
@cub_protector_auth_required
def cub_protector_counters_update(guild_id, counter_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    data = load_cp_json(CUB_PROTECTOR_COUNTERS_FILE)
    counters = data.get('guilds', {}).get(guild_id, {}).get('counters', [])
    counter = next((c for c in counters if c['id'] == counter_id), None)
    if not counter:
        return jsonify({'error': 'Counter not found'}), 404
    if 'current' in body and counter.get('type') == 'goal':
        if 'extra' not in counter:
            counter['extra'] = {}
        counter['extra']['current'] = max(0, int(body['current']))
    save_cp_json(CUB_PROTECTOR_COUNTERS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - SLOWMODE API ====================

@app.route('/api/cub-protector/guilds/<guild_id>/slowmode', methods=['GET'])
@cub_protector_auth_required
def cp_slowmode_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_SLOWMODE_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/slowmode', methods=['PATCH'])
@cub_protector_auth_required
def cp_slowmode_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_SLOWMODE_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/slowmode/apply', methods=['POST'])
@cub_protector_auth_required
def cp_slowmode_apply(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json()
    channel_id = body.get('channel')
    duration = body.get('duration', 0)
    if not channel_id:
        return jsonify({'error': 'No channel specified'}), 400
    result = cub_protector_bot_request('PATCH', f'/channels/{channel_id}', json={'rate_limit_per_user': int(duration)})
    if result is not None:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to apply slowmode'}), 500

@app.route('/api/cub-protector/guilds/<guild_id>/lockdown', methods=['GET'])
@cub_protector_auth_required
def cp_lockdown_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_LOCKDOWN_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/lockdown', methods=['PATCH'])
@cub_protector_auth_required
def cp_lockdown_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_LOCKDOWN_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/lockdown/activate', methods=['POST'])
@cub_protector_auth_required
def cp_lockdown_activate(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_LOCKDOWN_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'settings': {}}
    settings = data['guilds'][guild_id].get('settings', {})
    channels = settings.get('channels', [])
    lock_all = settings.get('lock_all', False)
    exempt_roles = settings.get('exempt_roles', [])
    message = settings.get('message', '')
    # Get channels to lock
    if lock_all:
        guild_channels = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/channels')
        if guild_channels:
            channels = [c['id'] for c in guild_channels if c.get('type') in (0, 5)]
    locked = []
    failed = []
    everyone_role_id = guild_id  # @everyone role ID == guild ID
    for ch_id in channels:
        # Deny SendMessages for @everyone
        overwrite_data = {
            'id': everyone_role_id,
            'type': 0,  # role
            'deny': str(1 << 11),  # SendMessages
        }
        result = cub_protector_bot_request('PUT', f'/channels/{ch_id}/permissions/{everyone_role_id}', json=overwrite_data)
        if result is not None:
            locked.append(ch_id)
            # Send lockdown message if configured
            if message:
                cub_protector_bot_request('POST', f'/channels/{ch_id}/messages', json={'content': message})
        else:
            failed.append(ch_id)
    data['guilds'][guild_id]['settings']['active'] = True
    data['guilds'][guild_id]['settings']['activated_at'] = datetime.now().isoformat()
    data['guilds'][guild_id]['settings']['locked_channels'] = locked
    save_cp_json(CUB_PROTECTOR_LOCKDOWN_FILE, data)
    return jsonify({'success': True, 'locked': len(locked), 'failed': len(failed)})

@app.route('/api/cub-protector/guilds/<guild_id>/lockdown/deactivate', methods=['POST'])
@cub_protector_auth_required
def cp_lockdown_deactivate(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_LOCKDOWN_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'settings': {}}
    settings = data['guilds'][guild_id].get('settings', {})
    locked_channels = settings.get('locked_channels', settings.get('channels', []))
    everyone_role_id = guild_id
    unlocked = []
    failed = []
    for ch_id in locked_channels:
        # Remove the SendMessages deny for @everyone
        result = cub_protector_bot_request('DELETE', f'/channels/{ch_id}/permissions/{everyone_role_id}')
        if result is not None:
            unlocked.append(ch_id)
        else:
            failed.append(ch_id)
    data['guilds'][guild_id]['settings']['active'] = False
    data['guilds'][guild_id]['settings'].pop('locked_channels', None)
    save_cp_json(CUB_PROTECTOR_LOCKDOWN_FILE, data)
    return jsonify({'success': True, 'unlocked': len(unlocked), 'failed': len(failed)})

@app.route('/api/cub-protector/guilds/<guild_id>/purge', methods=['GET'])
@cub_protector_auth_required
def cp_purge_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_PURGE_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/purge/execute', methods=['POST'])
@cub_protector_auth_required
def cp_purge_execute(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json()
    channel_id = body.get('channel')
    count = min(int(body.get('count', 10)), 100)
    filter_type = body.get('filter', '')
    user_id = body.get('user_id', '')
    if not channel_id:
        return jsonify({'error': 'No channel specified'}), 400
    # Fetch messages from the channel
    messages = cub_protector_bot_request('GET', f'/channels/{channel_id}/messages', params={'limit': min(count * 2, 100)})
    if not messages:
        return jsonify({'error': 'Failed to fetch messages'}), 500
    import time as _time
    two_weeks_ago = (_time.time() - 14 * 86400) * 1000  # Discord snowflake epoch adjustment
    discord_epoch = 1420070400000
    filtered = []
    for msg in messages:
        # Filter out messages older than 14 days
        msg_ts = ((int(msg['id']) >> 22) + discord_epoch) / 1000
        if msg_ts < (_time.time() - 14 * 86400):
            continue
        # Apply user filter
        if user_id and msg.get('author', {}).get('id') != user_id:
            continue
        # Apply type filter
        if filter_type == 'bots' and not msg.get('author', {}).get('bot', False):
            continue
        elif filter_type == 'links' and not any(s in msg.get('content', '') for s in ['http://', 'https://']):
            continue
        elif filter_type == 'images' and not msg.get('attachments'):
            continue
        elif filter_type == 'text' and (msg.get('attachments') or msg.get('embeds')):
            continue
        filtered.append(msg['id'])
        if len(filtered) >= count:
            break
    if not filtered:
        return jsonify({'error': 'No messages found matching criteria'}), 400
    # Bulk delete (requires 2+ messages and < 14 days old)
    if len(filtered) == 1:
        result = cub_protector_bot_request('DELETE', f'/channels/{channel_id}/messages/{filtered[0]}')
        deleted_count = 1 if result is not None else 0
    else:
        result = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages/bulk-delete', json={'messages': filtered})
        deleted_count = len(filtered) if result is not None else 0
    if deleted_count > 0:
        return jsonify({'success': True, 'deleted': deleted_count})
    return jsonify({'error': 'Failed to delete messages'}), 500

@app.route('/api/cub-protector/guilds/<guild_id>/nicknames', methods=['GET'])
@cub_protector_auth_required
def cp_nicknames_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_NICKNAMES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/nicknames', methods=['PATCH'])
@cub_protector_auth_required
def cp_nicknames_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_NICKNAMES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/nicknames/bulk-rename', methods=['POST'])
@cub_protector_auth_required
def cp_nicknames_bulk(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json()
    search = body.get('search', '')
    replace = body.get('replace', '')
    if not search:
        return jsonify({'error': 'Search text is required'}), 400
    # Fetch guild members (up to 1000)
    members = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/members', params={'limit': 1000})
    if not members:
        return jsonify({'error': 'Failed to fetch members'}), 500
    renamed = 0
    for member in members:
        display = member.get('nick') or member.get('user', {}).get('username', '')
        if search.lower() in display.lower():
            new_nick = display.replace(search, replace) if replace else replace
            result = _guild_bot_request(guild_id, 'PATCH', f'/guilds/{guild_id}/members/{member["user"]["id"]}', json={'nick': new_nick or None})
            if result is not None:
                renamed += 1
    return jsonify({'success': True, 'count': renamed})

@app.route('/api/cub-protector/guilds/<guild_id>/invite-tracker', methods=['GET'])
@cub_protector_auth_required
def cp_invite_tracker_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_INVITE_TRACKER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/invite-tracker', methods=['PATCH'])
@cub_protector_auth_required
def cp_invite_tracker_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_INVITE_TRACKER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/invite-tracker/leaderboard', methods=['GET'])
@cub_protector_auth_required
def cp_invite_tracker_leaderboard(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_INVITE_TRACKER_FILE)
    lb = data.get('guilds', {}).get(guild_id, {}).get('leaderboard', [])
    return jsonify(lb)

@app.route('/api/cub-protector/guilds/<guild_id>/alt-detection', methods=['GET'])
@cub_protector_auth_required
def cp_alt_detection_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_ALT_DETECTION_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/alt-detection', methods=['PATCH'])
@cub_protector_auth_required
def cp_alt_detection_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_ALT_DETECTION_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/anti-phishing', methods=['GET'])
@cub_protector_auth_required
def cp_anti_phishing_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_ANTI_PHISHING_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/anti-phishing', methods=['PATCH'])
@cub_protector_auth_required
def cp_anti_phishing_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_ANTI_PHISHING_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/word-filter', methods=['GET'])
@cub_protector_auth_required
def cp_word_filter_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_WORD_FILTER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/word-filter', methods=['PATCH'])
@cub_protector_auth_required
def cp_word_filter_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_WORD_FILTER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/mention-protection', methods=['GET'])
@cub_protector_auth_required
def cp_mention_protection_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_MENTION_PROTECTION_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/mention-protection', methods=['PATCH'])
@cub_protector_auth_required
def cp_mention_protection_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_MENTION_PROTECTION_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/verification', methods=['GET'])
@cub_protector_auth_required
def cp_verification_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_VERIFICATION_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/verification', methods=['PATCH'])
@cub_protector_auth_required
def cp_verification_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_VERIFICATION_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/verification/send-panel', methods=['POST'])
@cub_protector_auth_required
def cp_verification_send_panel(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_VERIFICATION_FILE)
    settings = data.get('guilds', {}).get(guild_id, {}).get('settings', {})
    channel_id = settings.get('channel')
    if not channel_id:
        return jsonify({'error': 'No verification channel set'}), 400
    description = settings.get('message', 'Click the button below to verify yourself and gain access to the server.')
    color_hex = settings.get('color', '#5865F2').lstrip('#')
    try:
        color_int = int(color_hex, 16)
    except ValueError:
        color_int = 0x5865F2
    embed = {
        'title': 'Verification Required',
        'description': description,
        'color': color_int,
    }
    component = {
        'type': 1,  # ActionRow
        'components': [{
            'type': 2,  # Button
            'style': 3,  # Success (green)
            'label': button_label,
            'custom_id': 'verify_btn',
            'emoji': {'name': '\u2705'}
        }]
    }
    result = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json={
        'embeds': [embed],
        'components': [component]
    })
    if result is not None:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to send verification panel'}), 500

@app.route('/api/cub-protector/guilds/<guild_id>/quarantine', methods=['GET'])
@cub_protector_auth_required
def cp_quarantine_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_QUARANTINE_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/quarantine', methods=['PATCH'])
@cub_protector_auth_required
def cp_quarantine_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_QUARANTINE_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/quarantine/members', methods=['GET'])
@cub_protector_auth_required
def cp_quarantine_members(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_QUARANTINE_FILE)
    members = data.get('guilds', {}).get(guild_id, {}).get('members', [])
    return jsonify(members)

@app.route('/api/cub-protector/guilds/<guild_id>/anti-nuke', methods=['GET'])
@cub_protector_auth_required
def cp_anti_nuke_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_ANTI_NUKE_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/anti-nuke', methods=['PATCH'])
@cub_protector_auth_required
def cp_anti_nuke_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_ANTI_NUKE_FILE)

# --- Community Features ---

@app.route('/api/cub-protector/guilds/<guild_id>/modmail', methods=['GET'])
@cub_protector_auth_required
def cp_modmail_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_MODMAIL_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/modmail', methods=['PATCH'])
@cub_protector_auth_required
def cp_modmail_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_MODMAIL_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/modmail/send-panel', methods=['POST'])
@cub_protector_auth_required
def cp_modmail_send_panel(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json(silent=True) or {}
    channel_id = body.get('channel_id')
    if not channel_id:
        return jsonify({'error': 'No channel selected'}), 400
    embed = {
        'title': 'Contact Modmail',
        'description': 'Need help or want to contact staff privately?\n\nClick the button below to open a modmail thread. A private channel will be created and you can communicate with staff through DMs.',
        'color': 0x5865F2,
        'footer': {'text': 'CUB PROTECTOR Modmail'}
    }
    component = {
        'type': 1,
        'components': [{
            'type': 2,
            'style': 1,
            'label': 'Contact Modmail',
            'custom_id': 'modmail_contact',
            'emoji': {'name': '\U0001f4e9'}
        }]
    }
    result = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json={
        'embeds': [embed],
        'components': [component]
    })
    if result is not None:
        return jsonify({'success': True})
    return jsonify({'error': 'Failed to send modmail panel'}), 500

@app.route('/api/cub-protector/guilds/<guild_id>/reports', methods=['GET'])
@cub_protector_auth_required
def cp_reports_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_REPORTS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/reports', methods=['PATCH'])
@cub_protector_auth_required
def cp_reports_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_REPORTS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/reports/list', methods=['GET'])
@cub_protector_auth_required
def cp_reports_list(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_REPORTS_FILE)
    reports = data.get('guilds', {}).get(guild_id, {}).get('items', [])
    return jsonify(reports)

@app.route('/api/cub-protector/guilds/<guild_id>/ban-appeals', methods=['GET'])
@cub_protector_auth_required
def cp_ban_appeals_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_BAN_APPEALS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/appeal/list', methods=['GET'])
@cub_protector_auth_required
def cp_appeal_list(guild_id):
    """Get the list of ban appeals for a guild"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_BAN_APPEALS_FILE)
    items = data.get('guilds', {}).get(guild_id, {}).get('items', [])
    return jsonify(items)

@app.route('/api/cub-protector/guilds/<guild_id>/ban-appeals', methods=['PATCH'])
@cub_protector_auth_required
def cp_ban_appeals_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_BAN_APPEALS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/user-notes', methods=['GET'])
@cub_protector_auth_required
def cp_user_notes_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_USER_NOTES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/user-notes', methods=['PATCH'])
@cub_protector_auth_required
def cp_user_notes_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_USER_NOTES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/user-notes/search', methods=['GET'])
@cub_protector_auth_required
def cp_user_notes_search(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    q = request.args.get('q', '').lower()
    data = load_cp_json(CUB_PROTECTOR_USER_NOTES_FILE)
    items = data.get('guilds', {}).get(guild_id, {}).get('items', [])
    results = [n for n in items if q in str(n.get('user_id', '')).lower() or q in n.get('username', '').lower()]
    return jsonify(results)

@app.route('/api/cub-protector/guilds/<guild_id>/user-notes/add', methods=['POST'])
@cub_protector_auth_required
def cp_user_notes_add(guild_id):
    return _cp_feature_add_item(guild_id, CUB_PROTECTOR_USER_NOTES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/birthdays', methods=['GET'])
@cub_protector_auth_required
def cp_birthdays_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_BIRTHDAYS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/birthdays', methods=['PATCH'])
@cub_protector_auth_required
def cp_birthdays_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_BIRTHDAYS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/boost-rewards', methods=['GET'])
@cub_protector_auth_required
def cp_boost_rewards_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_BOOST_REWARDS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/boost-rewards', methods=['PATCH'])
@cub_protector_auth_required
def cp_boost_rewards_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_BOOST_REWARDS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/auto-responder', methods=['GET'])
@cub_protector_auth_required
def cp_auto_responder_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_AUTO_RESPONDER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/auto-responder', methods=['PATCH'])
@cub_protector_auth_required
def cp_auto_responder_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_AUTO_RESPONDER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/keyword-alerts', methods=['GET'])
@cub_protector_auth_required
def cp_keyword_alerts_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_KEYWORD_ALERTS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/keyword-alerts', methods=['PATCH'])
@cub_protector_auth_required
def cp_keyword_alerts_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_KEYWORD_ALERTS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/temp-roles', methods=['GET'])
@cub_protector_auth_required
def cp_temp_roles_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_TEMP_ROLES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/temp-roles', methods=['PATCH'])
@cub_protector_auth_required
def cp_temp_roles_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_TEMP_ROLES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/temp-roles/assign', methods=['POST'])
@cub_protector_auth_required
def cp_temp_roles_assign(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json()
    duration_map = {'1h': 3600, '6h': 21600, '12h': 43200, '1d': 86400, '3d': 259200, '7d': 604800, '14d': 1209600, '30d': 2592000}
    duration_secs = duration_map.get(body.get('duration', '1d'), 86400)
    data = load_cp_json(CUB_PROTECTOR_TEMP_ROLES_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'settings': {}, 'items': []}
    item = {
        'id': str(int(time.time() * 1000)),
        'user_id': body.get('user_id'),
        'role_id': body.get('role_id'),
        'duration': body.get('duration'),
        'expires_at': (datetime.now().timestamp() + duration_secs),
        'created_at': datetime.now().isoformat()
    }
    data['guilds'][guild_id].setdefault('items', []).append(item)
    save_cp_json(CUB_PROTECTOR_TEMP_ROLES_FILE, data)
    return jsonify({'success': True, 'item': item})

@app.route('/api/cub-protector/guilds/<guild_id>/auto-thread', methods=['GET'])
@cub_protector_auth_required
def cp_auto_thread_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_AUTO_THREAD_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/auto-thread', methods=['PATCH'])
@cub_protector_auth_required
def cp_auto_thread_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_AUTO_THREAD_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/auto-thread/rules', methods=['POST'])
@cub_protector_auth_required
def cp_auto_thread_add_rule(guild_id):
    return _cp_feature_add_item(guild_id, CUB_PROTECTOR_AUTO_THREAD_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/auto-thread/rules/<rule_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_auto_thread_delete_rule(guild_id, rule_id):
    return _cp_feature_delete_item(guild_id, rule_id, CUB_PROTECTOR_AUTO_THREAD_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/server-rules', methods=['GET'])
@cub_protector_auth_required
def cp_server_rules_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_SERVER_RULES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/server-rules', methods=['PATCH'])
@cub_protector_auth_required
def cp_server_rules_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_SERVER_RULES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/polls', methods=['GET'])
@cub_protector_auth_required
def cp_polls_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_POLLS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/polls', methods=['PATCH'])
@cub_protector_auth_required
def cp_polls_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_POLLS_FILE)

# --- Logging Features ---

@app.route('/api/cub-protector/guilds/<guild_id>/message-logger', methods=['GET'])
@cub_protector_auth_required
def cp_message_logger_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_MESSAGE_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/message-logger', methods=['PATCH'])
@cub_protector_auth_required
def cp_message_logger_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_MESSAGE_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/voice-logger', methods=['GET'])
@cub_protector_auth_required
def cp_voice_logger_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_VOICE_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/voice-logger', methods=['PATCH'])
@cub_protector_auth_required
def cp_voice_logger_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_VOICE_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/join-leave-logger', methods=['GET'])
@cub_protector_auth_required
def cp_join_leave_logger_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_JOIN_LEAVE_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/join-leave-logger', methods=['PATCH'])
@cub_protector_auth_required
def cp_join_leave_logger_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_JOIN_LEAVE_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/name-logger', methods=['GET'])
@cub_protector_auth_required
def cp_name_logger_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_NAME_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/name-logger', methods=['PATCH'])
@cub_protector_auth_required
def cp_name_logger_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_NAME_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/emoji-stats', methods=['GET'])
@cub_protector_auth_required
def cp_emoji_stats_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_EMOJI_STATS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/emoji-stats', methods=['PATCH'])
@cub_protector_auth_required
def cp_emoji_stats_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_EMOJI_STATS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/channel-activity', methods=['GET'])
@cub_protector_auth_required
def cp_channel_activity_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_CHANNEL_ACTIVITY_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/channel-activity', methods=['PATCH'])
@cub_protector_auth_required
def cp_channel_activity_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_CHANNEL_ACTIVITY_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/reminders', methods=['GET'])
@cub_protector_auth_required
def cp_reminders_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_REMINDERS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/reminders', methods=['PATCH'])
@cub_protector_auth_required
def cp_reminders_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_REMINDERS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/sticky-messages', methods=['GET'])
@cub_protector_auth_required
def cp_sticky_messages_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_STICKY_MESSAGES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/sticky-messages', methods=['PATCH'])
@cub_protector_auth_required
def cp_sticky_messages_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_STICKY_MESSAGES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/sticky-messages/create', methods=['POST'])
@cub_protector_auth_required
def cp_sticky_messages_create(guild_id):
    return _cp_feature_add_item(guild_id, CUB_PROTECTOR_STICKY_MESSAGES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/sticky-messages/<sticky_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_sticky_messages_delete(guild_id, sticky_id):
    return _cp_feature_delete_item(guild_id, sticky_id, CUB_PROTECTOR_STICKY_MESSAGES_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/anti-hoist', methods=['GET'])
@cub_protector_auth_required
def cp_anti_hoist_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_ANTI_HOIST_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/anti-hoist', methods=['PATCH'])
@cub_protector_auth_required
def cp_anti_hoist_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_ANTI_HOIST_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/link-filter', methods=['GET'])
@cub_protector_auth_required
def cp_link_filter_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_LINK_FILTER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/link-filter', methods=['PATCH'])
@cub_protector_auth_required
def cp_link_filter_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_LINK_FILTER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/media-channels', methods=['GET'])
@cub_protector_auth_required
def cp_media_channels_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_MEDIA_CHANNELS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/media-channels', methods=['PATCH'])
@cub_protector_auth_required
def cp_media_channels_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_MEDIA_CHANNELS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/media-channels/add', methods=['POST'])
@cub_protector_auth_required
def cp_media_channels_add(guild_id):
    return _cp_feature_add_item(guild_id, CUB_PROTECTOR_MEDIA_CHANNELS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/media-channels/<item_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_media_channels_delete(guild_id, item_id):
    return _cp_feature_delete_item(guild_id, item_id, CUB_PROTECTOR_MEDIA_CHANNELS_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/boost-tracker', methods=['GET'])
@cub_protector_auth_required
def cp_boost_tracker_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_BOOST_TRACKER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/boost-tracker', methods=['PATCH'])
@cub_protector_auth_required
def cp_boost_tracker_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_BOOST_TRACKER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/role-logger', methods=['GET'])
@cub_protector_auth_required
def cp_role_logger_get(guild_id):
    return _cp_feature_get(guild_id, CUB_PROTECTOR_ROLE_LOGGER_FILE)

@app.route('/api/cub-protector/guilds/<guild_id>/role-logger', methods=['PATCH'])
@cub_protector_auth_required
def cp_role_logger_update(guild_id):
    return _cp_feature_update(guild_id, CUB_PROTECTOR_ROLE_LOGGER_FILE)

# ==================== CUB PROTECTOR - COUNTING CHANNEL ====================

@app.route('/api/cub-protector/guilds/<guild_id>/counting', methods=['GET'])
@cub_protector_auth_required
def cp_counting_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_COUNTING_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {
        'channel_id': None, 'enabled': False, 'current_count': 0, 'last_user_id': None, 'high_score': 0
    })
    return jsonify({'config': guild_data})

@app.route('/api/cub-protector/guilds/<guild_id>/counting', methods=['PATCH'])
@cub_protector_auth_required
def cp_counting_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_COUNTING_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'channel_id': None, 'enabled': False, 'current_count': 0, 'last_user_id': None, 'high_score': 0}
    g = data['guilds'][guild_id]
    body = request.get_json() or {}
    if 'channel_id' in body:
        g['channel_id'] = body['channel_id'] or None
        g['enabled'] = bool(body['channel_id'])
    if 'enabled' in body:
        g['enabled'] = bool(body['enabled'])
    if body.get('reset'):
        g['current_count'] = 0
        g['last_user_id'] = None
    save_cp_json(CUB_PROTECTOR_COUNTING_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - QUOTES ====================

@app.route('/api/cub-protector/guilds/<guild_id>/quotes', methods=['GET'])
@cub_protector_auth_required
def cp_quotes_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_QUOTES_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'quotes': [], 'next_id': 1})
    return jsonify({'quotes': guild_data.get('quotes', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/quotes/<int:quote_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_quotes_delete(guild_id, quote_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_QUOTES_FILE)
    if guild_id in data.get('guilds', {}):
        data['guilds'][guild_id]['quotes'] = [
            q for q in data['guilds'][guild_id].get('quotes', []) if q.get('id') != quote_id
        ]
        save_cp_json(CUB_PROTECTOR_QUOTES_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - CONFESSIONS ====================

@app.route('/api/cub-protector/guilds/<guild_id>/confessions', methods=['GET'])
@cub_protector_auth_required
def cp_confessions_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_CONFESSIONS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {
        'channel_id': None, 'log_channel_id': None, 'enabled': False, 'next_id': 1
    })
    return jsonify({'config': guild_data})

@app.route('/api/cub-protector/guilds/<guild_id>/confessions', methods=['PATCH'])
@cub_protector_auth_required
def cp_confessions_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_CONFESSIONS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'channel_id': None, 'log_channel_id': None, 'enabled': False, 'next_id': 1}
    g = data['guilds'][guild_id]
    body = request.get_json() or {}
    for field in ['channel_id', 'log_channel_id', 'enabled']:
        if field in body:
            g[field] = body[field]
    save_cp_json(CUB_PROTECTOR_CONFESSIONS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - COLOR ROLES ====================

def _cp_ensure_role_menus_guild(data, guild_id):
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {
            'color_roles': {'enabled': False, 'channel_id': None, 'message_id': None, 'colors': []},
            'self_roles': {'enabled': False, 'channel_id': None, 'categories': []},
        }
    if 'color_roles' not in data['guilds'][guild_id]:
        data['guilds'][guild_id]['color_roles'] = {'enabled': False, 'channel_id': None, 'message_id': None, 'colors': []}
    if 'self_roles' not in data['guilds'][guild_id]:
        data['guilds'][guild_id]['self_roles'] = {'enabled': False, 'channel_id': None, 'categories': []}

@app.route('/api/cub-protector/guilds/<guild_id>/color-roles', methods=['GET'])
@cub_protector_auth_required
def cp_color_roles_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'config': guild_data.get('color_roles', {'enabled': False, 'channel_id': None, 'colors': []})})

@app.route('/api/cub-protector/guilds/<guild_id>/color-roles', methods=['PATCH'])
@cub_protector_auth_required
def cp_color_roles_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    _cp_ensure_role_menus_guild(data, guild_id)
    g = data['guilds'][guild_id]['color_roles']
    body = request.get_json() or {}
    for field in ['enabled', 'channel_id']:
        if field in body:
            g[field] = body[field]
    save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/color-roles/colors', methods=['POST'])
@cub_protector_auth_required
def cp_color_roles_add(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    import re
    body = request.get_json() or {}
    name = body.get('name', '').strip()
    hex_color = body.get('hex', '#99AAB5').strip()
    emoji = body.get('emoji', '').strip() or None
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    if not re.match(r'^#[0-9A-Fa-f]{6}$', hex_color):
        return jsonify({'error': 'Invalid hex color — use format #FF0000'}), 400
    color_int = int(hex_color.lstrip('#'), 16)
    role_resp = _guild_bot_request(guild_id, 'POST', f'/guilds/{guild_id}/roles', json={'name': name, 'color': color_int})
    if not role_resp or 'id' not in role_resp:
        return jsonify({'error': 'Failed to create Discord role — check bot permissions'}), 500
    role_id = role_resp['id']
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    _cp_ensure_role_menus_guild(data, guild_id)
    data['guilds'][guild_id]['color_roles']['colors'].append({'name': name, 'hex': hex_color, 'emoji': emoji, 'role_id': role_id})
    save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True, 'color': {'name': name, 'hex': hex_color, 'emoji': emoji, 'role_id': role_id}})

@app.route('/api/cub-protector/guilds/<guild_id>/color-roles/colors/<role_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_color_roles_delete(guild_id, role_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    _guild_bot_request(guild_id, 'DELETE', f'/guilds/{guild_id}/roles/{role_id}')
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    if guild_id in data.get('guilds', {}):
        cr = data['guilds'][guild_id].get('color_roles', {})
        cr['colors'] = [c for c in cr.get('colors', []) if c.get('role_id') != role_id]
        save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - SELF ROLES ====================

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles', methods=['GET'])
@cub_protector_auth_required
def cp_self_roles_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'config': guild_data.get('self_roles', {'enabled': False, 'channel_id': None, 'categories': []})})

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles', methods=['PATCH'])
@cub_protector_auth_required
def cp_self_roles_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    _cp_ensure_role_menus_guild(data, guild_id)
    g = data['guilds'][guild_id]['self_roles']
    body = request.get_json() or {}
    for field in ['enabled', 'channel_id']:
        if field in body:
            g[field] = body[field]
    save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles/categories', methods=['POST'])
@cub_protector_auth_required
def cp_self_roles_add_category(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    name = body.get('name', '').strip()
    description = body.get('description', '').strip() or f'Pick your {name} role!'
    emoji = body.get('emoji', '🎭').strip() or '🎭'
    if not name:
        return jsonify({'error': 'Name is required'}), 400
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    _cp_ensure_role_menus_guild(data, guild_id)
    categories = data['guilds'][guild_id]['self_roles'].setdefault('categories', [])
    category_id = f'custom_{int(time.time() * 1000)}'
    style = str(body.get('style', 'select')).lower()
    if style not in ('select', 'reaction'):
        style = 'select'
    max_select = int(body.get('max_select', 0))
    category = {'id': category_id, 'name': name, 'description': description, 'emoji': emoji, 'preset': None, 'roles': [], 'message_id': None, 'style': style, 'max_select': max_select}
    categories.append(category)
    save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True, 'category': category})

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles/categories/<category_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_self_roles_delete_category(guild_id, category_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    if guild_id in data.get('guilds', {}):
        sr = data['guilds'][guild_id].get('self_roles', {})
        sr['categories'] = [c for c in sr.get('categories', []) if c.get('id') != category_id]
        save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles/categories/<category_id>', methods=['PATCH'])
@cub_protector_auth_required
def cp_self_roles_patch_category(guild_id, category_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    if guild_id not in data.get('guilds', {}):
        return jsonify({'error': 'Guild not found'}), 404
    sr = data['guilds'][guild_id].get('self_roles', {})
    cat = next((c for c in sr.get('categories', []) if c.get('id') == category_id), None)
    if not cat:
        return jsonify({'error': 'Category not found'}), 404
    if 'style' in body and body['style'] in ('select', 'reaction'):
        cat['style'] = body['style']
        cat['message_id'] = None  # reset message_id so it reposts on next publish
    if 'max_select' in body:
        cat['max_select'] = max(0, int(body['max_select']))
    if 'name' in body and body['name'].strip():
        cat['name'] = str(body['name']).strip()[:50]
    if 'description' in body:
        cat['description'] = str(body['description']).strip()[:100]
    save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles/categories/<category_id>/roles', methods=['POST'])
@cub_protector_auth_required
def cp_self_roles_add_role(guild_id, category_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    role_id = body.get('role_id', '').strip()
    label = body.get('label', '').strip()
    emoji = body.get('emoji', '').strip() or None
    if not role_id:
        return jsonify({'error': 'Role ID is required'}), 400
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    if guild_id not in data.get('guilds', {}):
        return jsonify({'error': 'Category not found'}), 404
    sr = data['guilds'][guild_id].get('self_roles', {})
    category = next((c for c in sr.get('categories', []) if c.get('id') == category_id), None)
    if not category:
        return jsonify({'error': 'Category not found'}), 404
    if len(category.get('roles', [])) >= 25:
        return jsonify({'error': 'Maximum 25 roles per category'}), 400
    category.setdefault('roles', []).append({'role_id': role_id, 'label': label or role_id, 'emoji': emoji})
    save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles/publish', methods=['POST'])
@cub_protector_auth_required
def cp_self_roles_publish(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    _cp_ensure_role_menus_guild(data, guild_id)
    sr = data['guilds'][guild_id].get('self_roles', {})
    channel_id = sr.get('channel_id')
    if not channel_id:
        return jsonify({'error': 'No channel configured. Select a channel and save first.'}), 400
    categories = sr.get('categories', [])
    cats_with_roles = [c for c in categories if c.get('roles')]
    if not cats_with_roles:
        return jsonify({'error': 'No categories with roles to publish.'}), 400

    import re as _re, urllib.parse as _urlparse
    token = _get_guild_bot_token(guild_id)
    posted = 0
    errors = []

    def _parse_emoji_for_component(raw):
        if not raw:
            return None
        m = _re.match(r'<a?:(\w+):(\d+)>', raw)
        if m:
            return {'name': m.group(1), 'id': m.group(2)}
        return {'name': raw.strip()}

    def _encode_emoji_for_reaction(raw):
        """Encode emoji for Discord reaction URL path."""
        if not raw:
            return None
        m = _re.match(r'<a?:(\w+):(\d+)>', raw)
        if m:
            return f"{m.group(1)}:{m.group(2)}"
        return _urlparse.quote(raw.strip())

    for cat in cats_with_roles:
        style = cat.get('style', 'select')
        roles = cat.get('roles', [])[:25]
        if not roles:
            continue

        embed_title = f"{cat.get('emoji', '🎭')} {cat.get('name', '')}"
        existing_mid = cat.get('message_id')

        if style == 'reaction':
            # Build embed with emoji = role listing
            lines = []
            for r in roles:
                e = r.get('emoji', '▫️') or '▫️'
                lines.append(f"{e} = **{r.get('label') or r.get('role_id', '')}**")
            desc = (cat.get('description') or 'React to this message to get your roles!') + '\n\n' + '\n'.join(lines)
            embed = {'color': 0x5865F2, 'title': embed_title, 'description': desc}
            payload = {'embeds': [embed]}
            result = None
            if existing_mid:
                result = cub_protector_bot_request('PATCH', f'/channels/{channel_id}/messages/{existing_mid}', json=payload, token=token)
            if result is None:
                result = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json=payload, token=token)
            if result and result.get('id'):
                new_mid = result['id']
                cat['message_id'] = new_mid
                # Add reactions
                for r in roles:
                    encoded = _encode_emoji_for_reaction(r.get('emoji', ''))
                    if encoded:
                        cub_protector_bot_request('PUT', f'/channels/{channel_id}/messages/{new_mid}/reactions/{encoded}/@me', token=token)
                posted += 1
            else:
                errors.append(cat.get('name', cat['id']))
        else:
            # Select menu style
            options = []
            for r in roles:
                opt = {'label': (r.get('label') or r.get('role_id', ''))[:25], 'value': r.get('role_id', '')}
                parsed = _parse_emoji_for_component(r.get('emoji', ''))
                if parsed:
                    opt['emoji'] = parsed
                options.append(opt)
            max_select = cat.get('max_select') or len(options)
            max_select = min(max(1, max_select), len(options))
            embed = {
                'color': 0x5865F2,
                'title': embed_title,
                'description': cat.get('description') or 'Select a role below!',
                'footer': {'text': 'Selecting a role you already have will remove it'},
            }
            component = {
                'type': 3,
                'custom_id': f"self_role_select_{cat['id']}",
                'placeholder': f"Choose from {cat.get('name', 'this category')}...",
                'min_values': 0,
                'max_values': max_select,
                'options': options,
            }
            payload = {'embeds': [embed], 'components': [{'type': 1, 'components': [component]}]}
            result = None
            if existing_mid:
                result = cub_protector_bot_request('PATCH', f'/channels/{channel_id}/messages/{existing_mid}', json=payload, token=token)
            if result is None:
                result = cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json=payload, token=token)
                if result and result.get('id'):
                    cat['message_id'] = result['id']
                    posted += 1
                else:
                    errors.append(cat.get('name', cat['id']))
            else:
                posted += 1

    save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    if errors:
        return jsonify({'success': posted > 0, 'message': f'Published {posted} categor{"y" if posted==1 else "ies"}. Failed: {", ".join(errors)}.'})
    return jsonify({'success': True, 'message': f'Published {posted} categor{"y" if posted==1 else "ies"}.'})

@app.route('/api/cub-protector/guilds/<guild_id>/self-roles/categories/<category_id>/roles/<role_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_self_roles_remove_role(guild_id, category_id, role_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE)
    if guild_id in data.get('guilds', {}):
        sr = data['guilds'][guild_id].get('self_roles', {})
        category = next((c for c in sr.get('categories', []) if c.get('id') == category_id), None)
        if category:
            category['roles'] = [r for r in category.get('roles', []) if r.get('role_id') != role_id]
            save_cp_json(CUB_PROTECTOR_ROLE_MENUS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - PROFILES ====================

CUB_PROTECTOR_PROFILES_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'profiles.json')
CUB_PROTECTOR_REP_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'rep.json')
CUB_PROTECTOR_RELATIONSHIPS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'relationships.json')
CUB_PROTECTOR_TOURNAMENTS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'tournaments.json')
CUB_PROTECTOR_FEEDS_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'feeds.json')
CUB_PROTECTOR_DEBATE_FILE = os.path.join(CUB_PROTECTOR_DATA_DIR, 'debate.json')

@app.route('/api/cub-protector/guilds/<guild_id>/profiles', methods=['GET'])
@cub_protector_auth_required
def cp_profiles_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_PROFILES_FILE)
    return jsonify({'users': data.get('guilds', {}).get(guild_id, {}).get('users', {})})

@app.route('/api/cub-protector/guilds/<guild_id>/profiles/<user_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_profiles_delete(guild_id, user_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_PROFILES_FILE)
    users = data.get('guilds', {}).get(guild_id, {}).get('users', {})
    users.pop(user_id, None)
    save_cp_json(CUB_PROTECTOR_PROFILES_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - REPUTATION ====================

@app.route('/api/cub-protector/guilds/<guild_id>/reputation', methods=['GET'])
@cub_protector_auth_required
def cp_reputation_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_REP_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'users': {}, 'cooldown_hours': 24})
    return jsonify({'cooldown_hours': guild_data.get('cooldown_hours', 24), 'users': guild_data.get('users', {})})

@app.route('/api/cub-protector/guilds/<guild_id>/reputation', methods=['PATCH'])
@cub_protector_auth_required
def cp_reputation_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_REP_FILE)
    if 'guilds' not in data: data['guilds'] = {}
    if guild_id not in data['guilds']: data['guilds'][guild_id] = {'users': {}, 'cooldown_hours': 24}
    body = request.get_json() or {}
    if 'cooldown_hours' in body:
        data['guilds'][guild_id]['cooldown_hours'] = max(1, int(body['cooldown_hours']))
    save_cp_json(CUB_PROTECTOR_REP_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - RELATIONSHIPS ====================

@app.route('/api/cub-protector/guilds/<guild_id>/relationships', methods=['GET'])
@cub_protector_auth_required
def cp_relationships_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_RELATIONSHIPS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'relationships': guild_data.get('relationships', {})})

@app.route('/api/cub-protector/guilds/<guild_id>/relationships', methods=['DELETE'])
@cub_protector_auth_required
def cp_relationships_delete(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    rel_key = request.args.get('key', '')
    if not rel_key:
        return jsonify({'error': 'key required'}), 400
    data = load_cp_json(CUB_PROTECTOR_RELATIONSHIPS_FILE)
    rels = data.get('guilds', {}).get(guild_id, {}).get('relationships', {})
    rels.pop(rel_key, None)
    save_cp_json(CUB_PROTECTOR_RELATIONSHIPS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - MOODS ====================

@app.route('/api/cub-protector/guilds/<guild_id>/moods', methods=['GET'])
@cub_protector_auth_required
def cp_moods_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_PROFILES_FILE)
    users = data.get('guilds', {}).get(guild_id, {}).get('users', {})
    moods = {uid: {'mood': u.get('mood'), 'mood_text': u.get('mood_text')} for uid, u in users.items() if u.get('mood')}
    return jsonify({'moods': moods})

@app.route('/api/cub-protector/guilds/<guild_id>/moods/<user_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_moods_delete(guild_id, user_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_PROFILES_FILE)
    user = data.get('guilds', {}).get(guild_id, {}).get('users', {}).get(user_id, {})
    user['mood'] = None
    user['mood_text'] = None
    save_cp_json(CUB_PROTECTOR_PROFILES_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - TOURNAMENTS ====================

@app.route('/api/cub-protector/guilds/<guild_id>/tournaments', methods=['GET'])
@cub_protector_auth_required
def cp_tournaments_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_TOURNAMENTS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'tournaments': [], 'next_id': 1})
    return jsonify({'tournaments': guild_data.get('tournaments', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/tournaments', methods=['POST'])
@cub_protector_auth_required
def cp_tournaments_create(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    name = str(body.get('name', '')).strip()[:60]
    if not name:
        return jsonify({'error': 'Tournament name required'}), 400
    max_p = min(64, max(2, int(body.get('max', 16))))
    data = load_cp_json(CUB_PROTECTOR_TOURNAMENTS_FILE)
    if 'guilds' not in data:
        data['guilds'] = {}
    if guild_id not in data['guilds']:
        data['guilds'][guild_id] = {'tournaments': [], 'next_id': 1}
    guild_data = data['guilds'][guild_id]
    t = {
        'id': guild_data.get('next_id', 1),
        'name': name,
        'max': max_p,
        'status': 'open',
        'participants': [],
        'bracket': None,
        'winner': None,
        'created_by': 'dashboard'
    }
    guild_data['tournaments'].append(t)
    guild_data['next_id'] = guild_data.get('next_id', 1) + 1
    save_cp_json(CUB_PROTECTOR_TOURNAMENTS_FILE, data)
    return jsonify({'success': True, 'tournament': t})

@app.route('/api/cub-protector/guilds/<guild_id>/tournaments/<int:tournament_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_tournaments_delete(guild_id, tournament_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_TOURNAMENTS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    guild_data['tournaments'] = [t for t in guild_data.get('tournaments', []) if t.get('id') != tournament_id]
    save_cp_json(CUB_PROTECTOR_TOURNAMENTS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - REDDIT FEED ====================

@app.route('/api/cub-protector/guilds/<guild_id>/reddit-feed', methods=['GET'])
@cub_protector_auth_required
def cp_reddit_feed_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'feeds': guild_data.get('reddit', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/reddit-feed', methods=['POST'])
@cub_protector_auth_required
def cp_reddit_feed_add(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    subreddit = body.get('subreddit', '').strip().lstrip('r/')
    channel_id = body.get('channel_id', '').strip()
    feed_type = body.get('type', 'hot')
    if not subreddit or not channel_id:
        return jsonify({'error': 'subreddit and channel_id required'}), 400
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    if 'guilds' not in data: data['guilds'] = {}
    if guild_id not in data['guilds']: data['guilds'][guild_id] = {'reddit': [], 'news': [], 'meme_of_day': None, 'quote_of_day': None, 'last_meme_date': None, 'last_quote_date': None}
    feeds = data['guilds'][guild_id]['reddit']
    if len(feeds) >= 10:
        return jsonify({'error': 'Max 10 Reddit feeds'}), 400
    import time as _t
    feeds.append({'id': int(_t.time() * 1000), 'subreddit': subreddit, 'channel_id': channel_id, 'type': feed_type, 'last_id': None})
    save_cp_json(CUB_PROTECTOR_FEEDS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/reddit-feed/<int:feed_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_reddit_feed_delete(guild_id, feed_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    guild_data['reddit'] = [f for f in guild_data.get('reddit', []) if f.get('id') != feed_id]
    save_cp_json(CUB_PROTECTOR_FEEDS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - NEWS FEED ====================

@app.route('/api/cub-protector/guilds/<guild_id>/news-feed', methods=['GET'])
@cub_protector_auth_required
def cp_news_feed_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'feeds': guild_data.get('news', [])})

@app.route('/api/cub-protector/guilds/<guild_id>/news-feed', methods=['POST'])
@cub_protector_auth_required
def cp_news_feed_add(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    url = body.get('url', '').strip()
    channel_id = body.get('channel_id', '').strip()
    name = body.get('name', url[:40]).strip()
    if not url or not channel_id:
        return jsonify({'error': 'url and channel_id required'}), 400
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    if 'guilds' not in data: data['guilds'] = {}
    if guild_id not in data['guilds']: data['guilds'][guild_id] = {'reddit': [], 'news': [], 'meme_of_day': None, 'quote_of_day': None, 'last_meme_date': None, 'last_quote_date': None}
    feeds = data['guilds'][guild_id]['news']
    if len(feeds) >= 10:
        return jsonify({'error': 'Max 10 news feeds'}), 400
    import time as _t2
    feeds.append({'id': int(_t2.time() * 1000), 'name': name, 'url': url, 'channel_id': channel_id, 'last_link': None})
    save_cp_json(CUB_PROTECTOR_FEEDS_FILE, data)
    return jsonify({'success': True})

@app.route('/api/cub-protector/guilds/<guild_id>/news-feed/<int:feed_id>', methods=['DELETE'])
@cub_protector_auth_required
def cp_news_feed_delete(guild_id, feed_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    guild_data['news'] = [f for f in guild_data.get('news', []) if f.get('id') != feed_id]
    save_cp_json(CUB_PROTECTOR_FEEDS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - MEME OF DAY ====================

@app.route('/api/cub-protector/guilds/<guild_id>/meme-of-day', methods=['GET'])
@cub_protector_auth_required
def cp_meme_of_day_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'channel_id': guild_data.get('meme_of_day'), 'last_date': guild_data.get('last_meme_date')})

@app.route('/api/cub-protector/guilds/<guild_id>/meme-of-day', methods=['PATCH'])
@cub_protector_auth_required
def cp_meme_of_day_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    if 'guilds' not in data: data['guilds'] = {}
    if guild_id not in data['guilds']: data['guilds'][guild_id] = {'reddit': [], 'news': [], 'meme_of_day': None, 'quote_of_day': None, 'last_meme_date': None, 'last_quote_date': None}
    if 'channel_id' in body:
        data['guilds'][guild_id]['meme_of_day'] = body['channel_id']
    save_cp_json(CUB_PROTECTOR_FEEDS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - QUOTE OF DAY ====================

@app.route('/api/cub-protector/guilds/<guild_id>/quote-of-day', methods=['GET'])
@cub_protector_auth_required
def cp_quote_of_day_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {})
    return jsonify({'channel_id': guild_data.get('quote_of_day'), 'last_date': guild_data.get('last_quote_date')})

@app.route('/api/cub-protector/guilds/<guild_id>/quote-of-day', methods=['PATCH'])
@cub_protector_auth_required
def cp_quote_of_day_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    data = load_cp_json(CUB_PROTECTOR_FEEDS_FILE)
    if 'guilds' not in data: data['guilds'] = {}
    if guild_id not in data['guilds']: data['guilds'][guild_id] = {'reddit': [], 'news': [], 'meme_of_day': None, 'quote_of_day': None, 'last_meme_date': None, 'last_quote_date': None}
    if 'channel_id' in body:
        data['guilds'][guild_id]['quote_of_day'] = body['channel_id']
    save_cp_json(CUB_PROTECTOR_FEEDS_FILE, data)
    return jsonify({'success': True})

# ==================== CUB PROTECTOR - DEBATE ====================

@app.route('/api/cub-protector/guilds/<guild_id>/debate', methods=['GET'])
@cub_protector_auth_required
def cp_debate_get(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    data = load_cp_json(CUB_PROTECTOR_DEBATE_FILE)
    guild_data = data.get('guilds', {}).get(guild_id, {'log_channel_id': None})
    return jsonify({'log_channel_id': guild_data.get('log_channel_id')})

@app.route('/api/cub-protector/guilds/<guild_id>/debate', methods=['PATCH'])
@cub_protector_auth_required
def cp_debate_patch(guild_id):
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403
    body = request.get_json() or {}
    data = load_cp_json(CUB_PROTECTOR_DEBATE_FILE)
    if 'guilds' not in data: data['guilds'] = {}
    if guild_id not in data['guilds']: data['guilds'][guild_id] = {'log_channel_id': None}
    if 'log_channel_id' in body:
        data['guilds'][guild_id]['log_channel_id'] = body['log_channel_id']
    save_cp_json(CUB_PROTECTOR_DEBATE_FILE, data)
    return jsonify({'success': True})

# ==================== STATUS PAGE ====================

@app.route('/status')
def status_page():
    return render_template('status.html')

@app.route('/api/status')
def api_status():
    """Get status of all CUB SOFTWARE services"""
    import time as _time_mod
    import subprocess

    services = []

    # Check PM2 processes
    try:
        result = subprocess.run(['pm2', 'jlist'], capture_output=True, text=True, timeout=5)
        pm2_processes = json.loads(result.stdout) if result.stdout else []
    except Exception:
        pm2_processes = []

    pm2_map = {}
    for proc in pm2_processes:
        pm2_map[proc.get('name', '')] = {
            'status': proc.get('pm2_env', {}).get('status', 'unknown'),
            'uptime': proc.get('pm2_env', {}).get('pm_uptime', 0),
            'memory': proc.get('monit', {}).get('memory', 0),
            'cpu': proc.get('monit', {}).get('cpu', 0),
            'restarts': proc.get('pm2_env', {}).get('restart_time', 0),
        }

    # Website
    services.append({
        'name': 'CUB SOFTWARE Website',
        'type': 'website',
        'url': 'https://cubsoftware.site',
        'status': 'online',
        'description': 'Main website and dashboard',
    })

    # CUB PROTECTOR Bot
    cp_info = pm2_map.get('cub-protector', {})
    services.append({
        'name': 'CUB PROTECTOR',
        'type': 'bot',
        'status': cp_info.get('status', 'unknown'),
        'uptime': cp_info.get('uptime', 0),
        'memory_mb': round(cp_info.get('memory', 0) / 1024 / 1024, 1),
        'cpu': cp_info.get('cpu', 0),
        'restarts': cp_info.get('restarts', 0),
        'description': 'Discord moderation bot',
    })

    # QuestCord
    qc_info = pm2_map.get('questcord', pm2_map.get('QuestCord', {}))
    services.append({
        'name': 'QuestCord',
        'type': 'bot',
        'url': 'https://questcord.fun',
        'status': qc_info.get('status', 'unknown'),
        'uptime': qc_info.get('uptime', 0),
        'memory_mb': round(qc_info.get('memory', 0) / 1024 / 1024, 1),
        'restarts': qc_info.get('restarts', 0),
        'description': 'Discord quest/adventure bot',
    })

    # CleanMe Bot
    cm_info = pm2_map.get('cleanme-bot', pm2_map.get('CleanMe', {}))
    services.append({
        'name': 'CleanMe Bot',
        'type': 'bot',
        'status': cm_info.get('status', 'unknown'),
        'uptime': cm_info.get('uptime', 0),
        'memory_mb': round(cm_info.get('memory', 0) / 1024 / 1024, 1),
        'restarts': cm_info.get('restarts', 0),
        'description': 'Discord cleanup/utility bot',
    })

    # CUB SOFTWARE Bot
    csb_info = pm2_map.get('cubsoftware-bot', {})
    services.append({
        'name': 'CUB SOFTWARE Bot',
        'type': 'bot',
        'status': csb_info.get('status', 'unknown'),
        'uptime': csb_info.get('uptime', 0),
        'memory_mb': round(csb_info.get('memory', 0) / 1024 / 1024, 1),
        'restarts': csb_info.get('restarts', 0),
        'description': 'Main CUB SOFTWARE Discord bot',
    })

    # API endpoints status
    api_endpoints = [
        {'name': 'Main API', 'path': '/api/status', 'status': 'online'},
        {'name': 'CUB PROTECTOR API', 'path': '/api/cub-protector/overview', 'status': 'online'},
        {'name': 'PM2 Dashboard API', 'path': '/api/pm2/status', 'status': 'online'},
    ]

    # Overall status
    online_count = sum(1 for s in services if s.get('status') == 'online')
    total = len(services)
    overall = 'operational' if online_count == total else 'degraded' if online_count > 0 else 'outage'

    return jsonify({
        'overall': overall,
        'services': services,
        'api_endpoints': api_endpoints,
        'timestamp': int(_time_mod.time()),
        'server_time': _time_mod.strftime('%Y-%m-%d %H:%M:%S UTC', _time_mod.gmtime()),
    })

# ==================== BAN APPEAL SYSTEM ====================

BAN_APPEAL_REDIRECT_URI = os.environ.get('BAN_APPEAL_REDIRECT_URI', 'https://cubsoftware.site/ban-appeal/auth/callback')

@app.route('/ban-appeal')
@app.route('/ban-appeal/')
def ban_appeal_page():
    """Ban Appeal Page - users submit ban appeals here"""
    appeal_user = session.get('ban_appeal_user')
    return render_template('ban-appeal.html', appeal_user=appeal_user or {})

@app.route('/ban-appeal/auth/discord')
def ban_appeal_auth():
    """Redirect to unified login — bridge auto-populates ban_appeal_user."""
    return redirect('/login?next=/ban-appeal')

@app.route('/ban-appeal/auth/callback')
def ban_appeal_callback():
    """Legacy callback — no longer used."""
    return redirect('/login?next=/ban-appeal')

BAN_APPEAL_TEST_CODE = 'CUBAPI'
BAN_APPEAL_TEST_CHANNEL_ID = '1473606792264155136'

@app.route('/ban-appeal/verify-code', methods=['POST'])
def ban_appeal_verify_code():
    """Verify an appeal code matches the logged-in user"""
    appeal_user = session.get('ban_appeal_user')
    if not appeal_user:
        return jsonify({'error': 'Not authenticated'}), 401

    body = request.get_json(silent=True) or {}
    code = body.get('code', '').strip()

    # Test mode: special developer code bypasses all checks
    if code == BAN_APPEAL_TEST_CODE:
        session['ban_appeal_verified'] = {
            'guild_id': '1284593395188367502',
            'case_id': 'TEST-001',
            'code': code,
            'is_test': True
        }
        return jsonify({
            'success': True,
            'guild_name': 'CUB SOFTWARE (Test Mode)',
            'reason': 'This is a test ban — no real ban exists.',
            'ban_date': 'January 01, 2025',
            'questions': [
                'Why should you be unbanned?',
                'What will you do differently?'
            ]
        })

    if not code or len(code) != 6:
        return jsonify({'error': 'Invalid appeal code format'}), 400

    user_id = appeal_user['id']

    # Search all guilds in moderation data for this appeal code
    mod_data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
    for guild_id, guild_data in mod_data.get('guilds', {}).items():
        for case in guild_data.get('cases', []):
            if case.get('appeal_code') == code and case.get('type') == 'ban':
                # Verify the code belongs to this user
                if case.get('target_id') != user_id:
                    return jsonify({'error': 'This appeal code does not belong to your account.'}), 403

                # Check if already appealed — if so, return status instead of error
                appeals_data = load_cp_json(CUB_PROTECTOR_BAN_APPEALS_FILE)
                guild_appeals = appeals_data.get('guilds', {}).get(guild_id, {})
                existing = [a for a in guild_appeals.get('items', []) if a.get('appeal_code') == code]
                if existing:
                    latest = existing[-1]
                    status = latest.get('status', 'pending')
                    guild_info = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}')
                    guild_name = guild_info.get('name', 'Unknown Server') if guild_info else 'Unknown Server'
                    invite_link = None
                    if status == 'approved':
                        # Try stored invite first
                        invite_link = latest.get('invite_link')
                        if not invite_link:
                            # Generate a fresh 1-use, 7-day invite
                            guild_channels = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}/channels')
                            invite_channel_id = None
                            if guild_channels:
                                for ch in guild_channels:
                                    if ch.get('type') == 0:  # text channel
                                        invite_channel_id = ch['id']
                                        break
                            if invite_channel_id:
                                invite = cub_protector_bot_request('POST', f'/channels/{invite_channel_id}/invites', json={
                                    'max_age': 604800, 'max_uses': 1, 'unique': True
                                })
                                if invite and 'code' in invite:
                                    invite_link = f"https://discord.gg/{invite['code']}"
                                    latest['invite_link'] = invite_link
                                    save_cp_json(CUB_PROTECTOR_BAN_APPEALS_FILE, appeals_data)
                    return jsonify({
                        'status_check': True,
                        'status': status,
                        'guild_name': guild_name,
                        'submitted_at': latest.get('submitted_at'),
                        'review_note': latest.get('review_note') if status == 'declined' else None,
                        'invite_link': invite_link
                    })

                # Check appeal settings
                appeal_settings = guild_appeals.get('settings', {})
                if appeal_settings.get('enabled') is False:
                    return jsonify({'error': 'This server does not accept ban appeals.'}), 403

                # Check max appeals per user
                max_per_user = appeal_settings.get('max_per_user', 1)
                user_appeals = [a for a in guild_appeals.get('items', []) if a.get('user_id') == user_id]
                if max_per_user > 0 and len(user_appeals) >= max_per_user:
                    return jsonify({'error': f'You have reached the maximum number of appeals ({max_per_user}) for this server.'}), 400

                # Check min days
                min_days = appeal_settings.get('min_days', 0)
                if min_days > 0:
                    ban_timestamp = case.get('timestamp', 0)
                    days_since = (datetime.utcnow().timestamp() - ban_timestamp) / 86400
                    if days_since < min_days:
                        remaining = int(min_days - days_since) + 1
                        return jsonify({'error': f'You must wait {remaining} more day(s) before appealing.'}), 400

                # Get guild name
                guild_info = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}')
                guild_name = guild_info.get('name', 'Unknown Server') if guild_info else 'Unknown Server'

                # Get custom questions (fall back to default if none configured)
                questions = appeal_settings.get('questions', [])
                if not questions:
                    questions = ['Why should you be unbanned?']

                # Format ban date
                ban_timestamp = case.get('timestamp', 0)
                ban_dt = datetime.fromtimestamp(ban_timestamp, tz=timezone.utc)
                ban_date = ban_dt.strftime('%B %d, %Y')

                # Store in session for submit step
                session['ban_appeal_verified'] = {
                    'guild_id': guild_id,
                    'case_id': case.get('case_id'),
                    'code': code
                }

                return jsonify({
                    'success': True,
                    'guild_name': guild_name,
                    'reason': case.get('reason', 'No reason provided'),
                    'ban_date': ban_date,
                    'questions': questions
                })

    return jsonify({'error': 'Invalid appeal code. Please check and try again.'}), 404

@app.route('/ban-appeal/submit', methods=['POST'])
def ban_appeal_submit():
    """Submit a ban appeal"""
    try:
        return _ban_appeal_submit_inner()
    except Exception as e:
        import traceback
        app.logger.error(f'ban_appeal_submit unhandled exception: {e}\n{traceback.format_exc()}')
        return jsonify({'error': 'An internal error occurred. Please try again.'}), 500

def _ban_appeal_submit_inner():
    appeal_user = session.get('ban_appeal_user')
    if not appeal_user:
        return jsonify({'error': 'Not authenticated'}), 401

    verified = session.get('ban_appeal_verified')
    if not verified or not isinstance(verified, dict):
        return jsonify({'error': 'Code not verified. Please verify your appeal code first.'}), 400

    body = request.get_json(silent=True) or {}
    code = body.get('code', '').strip()
    message = body.get('message', '').strip()[:2000]
    answers = body.get('answers', [])
    if not isinstance(answers, list):
        answers = []

    if code != verified.get('code'):
        return jsonify({'error': 'Appeal code mismatch.'}), 400

    if not message:
        return jsonify({'error': 'Please provide a reason for your appeal.'}), 400

    guild_id = verified.get('guild_id', '')
    if not guild_id:
        return jsonify({'error': 'Session error — please start over.'}), 400
    user_id = str(appeal_user.get('id', ''))
    username = str(appeal_user.get('username') or appeal_user.get('id', 'Unknown'))
    is_test = verified.get('is_test', False)

    # TEST MODE: post to developer test channel and return without saving
    if is_test:
        appeal_id = 'TEST-' + secrets.token_hex(4).upper()
        answers_text = ''
        for a in answers:
            if isinstance(a, dict) and a.get('answer'):
                answers_text += f"\n**{a.get('question', 'Q')}**\n{a.get('answer', '')}\n"

        embed = {
            'title': '🧪 [TEST] New Ban Appeal',
            'description': '> This is a test submission using the CUB-API test code. No real ban data was used.',
            'color': 0x5865F2,
            'fields': [
                {'name': 'User', 'value': f'{username} (`{user_id}`)', 'inline': True},
                {'name': 'Case ID', 'value': '#TEST-001', 'inline': True},
                {'name': 'Ban Reason', 'value': 'This is a test ban — no real ban exists.', 'inline': False},
                {'name': 'Appeal Message', 'value': message[:1024], 'inline': False},
            ],
            'footer': {'text': f'TEST Appeal ID: {appeal_id} • CUB-API test code used'},
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }
        if answers_text:
            embed['fields'].append({'name': 'Additional Answers', 'value': answers_text[:1024], 'inline': False})

        components = [{
            'type': 1,
            'components': [
                {'type': 2, 'style': 3, 'label': 'Approve (Test)', 'custom_id': f'appeal_approve_{appeal_id}_test_{user_id}'},
                {'type': 2, 'style': 4, 'label': 'Decline (Test)', 'custom_id': f'appeal_decline_{appeal_id}_test_{user_id}'}
            ]
        }]

        cub_protector_bot_request('POST', f'/channels/{BAN_APPEAL_TEST_CHANNEL_ID}/messages', json={
            'embeds': [embed],
            'components': components
        })
        session.pop('ban_appeal_verified', None)
        return jsonify({'success': True, 'appeal_id': appeal_id})

    # Create the appeal record
    appeal_id = secrets.token_hex(8)
    appeal_record = {
        'id': appeal_id,
        'user_id': user_id,
        'username': username,
        'appeal_code': code,
        'case_id': verified.get('case_id'),
        'message': message,
        'answers': answers,
        'status': 'pending',
        'submitted_at': int(datetime.utcnow().timestamp()),
        'reviewed_at': None,
        'reviewed_by': None,
        'review_note': None
    }

    # Save to ban_appeals data
    appeals_data = load_cp_json(CUB_PROTECTOR_BAN_APPEALS_FILE)
    if 'guilds' not in appeals_data:
        appeals_data['guilds'] = {}
    if guild_id not in appeals_data['guilds']:
        appeals_data['guilds'][guild_id] = {'settings': {}, 'items': []}
    if 'items' not in appeals_data['guilds'][guild_id]:
        appeals_data['guilds'][guild_id]['items'] = []
    appeals_data['guilds'][guild_id]['items'].append(appeal_record)
    save_cp_json(CUB_PROTECTOR_BAN_APPEALS_FILE, appeals_data)

    # Send appeal to the configured channel
    appeal_settings = appeals_data['guilds'][guild_id].get('settings', {})
    channel_id = appeal_settings.get('channel')

    if not channel_id:
        app.logger.warning(f'Ban appeal submitted for guild {guild_id} but no appeals channel configured')
        return jsonify({'success': True, 'appeal_id': appeal_id, 'warning': 'no_channel'})

    if channel_id:
        # Build answers text
        answers_text = ''
        for a in answers:
            if isinstance(a, dict) and a.get('answer'):
                answers_text += f"\n**{a.get('question', 'Q')}**\n{a.get('answer', '')}\n"

        # Get the ban case info
        mod_data = load_cp_json(CUB_PROTECTOR_MODERATION_FILE)
        guild_mod = mod_data.get('guilds', {}).get(guild_id, {})
        ban_case = None
        for c in guild_mod.get('cases', []):
            if c.get('appeal_code') == code:
                ban_case = c
                break

        embed = {
            'title': 'New Ban Appeal',
            'color': 0xFEE75C,
            'fields': [
                {'name': 'User', 'value': f'{username} (`{user_id}`)', 'inline': True},
                {'name': 'Case ID', 'value': f'#{verified.get("case_id", "?")}', 'inline': True},
                {'name': 'Ban Reason', 'value': ban_case.get('reason', 'Unknown') if ban_case else 'Unknown', 'inline': False},
                {'name': 'Appeal Message', 'value': message[:1024], 'inline': False},
            ],
            'footer': {'text': f'Appeal ID: {appeal_id}'},
            'timestamp': datetime.utcnow().isoformat() + 'Z'
        }

        if answers_text:
            embed['fields'].append({'name': 'Additional Answers', 'value': answers_text[:1024], 'inline': False})

        # Add approve/decline buttons
        components = [{
            'type': 1,
            'components': [
                {
                    'type': 2,
                    'style': 3,
                    'label': 'Approve',
                    'custom_id': f'appeal_approve_{appeal_id}_{guild_id}_{user_id}'
                },
                {
                    'type': 2,
                    'style': 4,
                    'label': 'Decline',
                    'custom_id': f'appeal_decline_{appeal_id}_{guild_id}_{user_id}'
                }
            ]
        }]

        # Ping review role if set
        review_role = appeal_settings.get('review_role')
        content = f'<@&{review_role}>' if review_role else None

        cub_protector_bot_request('POST', f'/channels/{channel_id}/messages', json={
            'content': content,
            'embeds': [embed],
            'components': components
        })

    # Clear verified session
    session.pop('ban_appeal_verified', None)

    return jsonify({'success': True, 'appeal_id': appeal_id})

# Appeal review API (for dashboard staff)
@app.route('/api/cub-protector/guilds/<guild_id>/appeal/<appeal_id>/review', methods=['POST'])
@cub_protector_auth_required
def cp_appeal_review(guild_id, appeal_id):
    """Approve or decline a ban appeal from the dashboard"""
    if not check_cp_guild_access(guild_id):
        return jsonify({'error': 'Access denied'}), 403

    body = request.get_json(silent=True) or {}
    action = body.get('action')  # 'approve' or 'decline'
    note = body.get('note', '')[:500]

    if action not in ('approve', 'decline'):
        return jsonify({'error': 'Invalid action'}), 400

    # Find the appeal
    appeals_data = load_cp_json(CUB_PROTECTOR_BAN_APPEALS_FILE)
    guild_appeals = appeals_data.get('guilds', {}).get(guild_id, {})
    appeal = None
    for a in guild_appeals.get('items', []):
        if a.get('id') == appeal_id:
            appeal = a
            break

    if not appeal:
        return jsonify({'error': 'Appeal not found'}), 404

    if appeal.get('status') != 'pending':
        return jsonify({'error': 'Appeal already reviewed'}), 400

    user_id = appeal['user_id']
    reviewer = session.get('cub_protector_user', {})

    # Update appeal status
    appeal['status'] = 'approved' if action == 'approve' else 'declined'
    appeal['reviewed_at'] = int(datetime.utcnow().timestamp())
    appeal['reviewed_by'] = reviewer.get('id', 'unknown')
    appeal['review_note'] = note
    save_cp_json(CUB_PROTECTOR_BAN_APPEALS_FILE, appeals_data)

    # Check if we should DM the user
    appeal_settings = guild_appeals.get('settings', {})
    dm_user = appeal_settings.get('dm_user', True)

    # Get guild name for DM
    guild_info = _guild_bot_request(guild_id, 'GET', f'/guilds/{guild_id}')
    guild_name = guild_info.get('name', 'a server') if guild_info else 'a server'

    if action == 'approve':
        # Unban the user
        _guild_bot_request(guild_id, 'DELETE', f'/guilds/{guild_id}/bans/{user_id}')

        # DM the user
        if dm_user:
            try:
                dm_channel = cub_protector_bot_request('POST', '/users/@me/channels', json={'recipient_id': user_id})
                if dm_channel and 'id' in dm_channel:
                    embed = {
                        'title': 'Ban Appeal Approved',
                        'description': f'Your ban appeal for **{guild_name}** has been **approved**! You have been unbanned and can rejoin the server.',
                        'color': 0x57F287,
                        'footer': {'text': 'Please follow the server rules to avoid future bans.'}
                    }
                    if note:
                        embed['fields'] = [{'name': 'Staff Note', 'value': note, 'inline': False}]
                    cub_protector_bot_request('POST', f'/channels/{dm_channel["id"]}/messages', json={'embeds': [embed]})
            except Exception:
                pass

        return jsonify({'success': True, 'message': 'Appeal approved, user unbanned.'})

    else:
        # DM the user about decline
        if dm_user:
            try:
                dm_channel = cub_protector_bot_request('POST', '/users/@me/channels', json={'recipient_id': user_id})
                if dm_channel and 'id' in dm_channel:
                    embed = {
                        'title': 'Ban Appeal Declined',
                        'description': f'Your ban appeal for **{guild_name}** has been **declined**.',
                        'color': 0xED4245,
                    }
                    if note:
                        embed['fields'] = [{'name': 'Staff Note', 'value': note, 'inline': False}]
                    cub_protector_bot_request('POST', f'/channels/{dm_channel["id"]}/messages', json={'embeds': [embed]})
            except Exception:
                pass

        return jsonify({'success': True, 'message': 'Appeal declined.'})

# ==================== AFFILIATE PROGRAM ====================

AFFILIATES_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'affiliates.json')
AFFILIATE_CLICKS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'affiliate_clicks.json')
AFFILIATE_WITHDRAWALS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'affiliate_withdrawals.json')
AFFILIATE_APPLICATIONS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'affiliate_applications.json')
AFFILIATE_REDIRECT_URI = os.environ.get('AFFILIATE_REDIRECT_URI', 'https://cubsoftware.site/affiliate/auth/callback')

def load_affiliates():
    if os.path.exists(AFFILIATES_FILE):
        try:
            with open(AFFILIATES_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'affiliates': {}}

def save_affiliates(data):
    os.makedirs(os.path.dirname(AFFILIATES_FILE), exist_ok=True)
    with open(AFFILIATES_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def load_affiliate_clicks():
    if os.path.exists(AFFILIATE_CLICKS_FILE):
        try:
            with open(AFFILIATE_CLICKS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def load_withdrawals():
    if os.path.exists(AFFILIATE_WITHDRAWALS_FILE):
        try:
            with open(AFFILIATE_WITHDRAWALS_FILE, 'r') as f:
                return json.load(f)
        except:
            pass
    return {'withdrawals': {}}

def save_withdrawals(data):
    os.makedirs(os.path.dirname(AFFILIATE_WITHDRAWALS_FILE), exist_ok=True)
    with open(AFFILIATE_WITHDRAWALS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def save_affiliate_clicks(data):
    os.makedirs(os.path.dirname(AFFILIATE_CLICKS_FILE), exist_ok=True)
    with open(AFFILIATE_CLICKS_FILE, 'w') as f:
        json.dump(data, f, indent=2)

def get_affiliate_by_discord_id(discord_id):
    data = load_affiliates()
    for aff in data['affiliates'].values():
        if aff.get('discord_id') == discord_id:
            return aff
    return None

def get_affiliate_by_code(code):
    data = load_affiliates()
    for aff in data['affiliates'].values():
        if aff.get('code', '').lower() == code.lower():
            return aff
    return None

def get_affiliate_stats(code):
    clicks_data = load_affiliate_clicks()
    code_data = clicks_data.get(code.lower(), {})
    clicks = code_data.get('clicks', [])
    return {
        'total_clicks': len(clicks),
        'unique_clicks': sum(1 for c in clicks if c.get('unique')),
        'clicks': clicks
    }

def affiliate_auth_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = session.get('affiliate_user')
        if not user:
            return redirect(f'/login?next={urllib.parse.quote(request.path)}')
        aff = get_affiliate_by_discord_id(user['id'])
        if not aff:
            return render_template('affiliate-login.html', user=user, not_registered=True)
        if not aff.get('enabled', True):
            return render_template('affiliate-login.html', user=user, disabled=True)
        return f(*args, **kwargs)
    return decorated_function

# Affiliate program landing page
@app.route('/affiliate')
@app.route('/affiliate/')
def affiliate_landing():
    return render_template('affiliate.html')

@app.route('/affiliate/apply', methods=['GET', 'POST'])
def affiliate_apply():
    if request.method == 'GET':
        return render_template('affiliate-apply.html')

    # POST — process application
    name = request.form.get('name', '').strip()
    email = request.form.get('email', '').strip()
    discord = request.form.get('discord', '').strip()
    platform = request.form.get('platform', '').strip()
    channel_url = request.form.get('channel_url', '').strip()
    monthly_reach = request.form.get('monthly_reach', '').strip()
    country = request.form.get('country', '').strip()
    found_via = request.form.get('found_via', '').strip()
    why_affiliate = request.form.get('why_affiliate', '').strip()[:800]
    promotion_plan = request.form.get('promotion_plan', '').strip()[:800]

    # Basic validation
    if not name or not email or not platform or not channel_url:
        return render_template('affiliate-apply.html', error='Please fill in all required fields.')
    if '@' not in email or '.' not in email:
        return render_template('affiliate-apply.html', error='Please enter a valid email address.')

    # Save application
    app_data = {
        'id': secrets.token_hex(8),
        'submitted_at': int(time.time()),
        'name': name,
        'email': email,
        'discord': discord,
        'platform': platform,
        'channel_url': channel_url,
        'monthly_reach': monthly_reach,
        'country': country,
        'found_via': found_via,
        'why_affiliate': why_affiliate,
        'promotion_plan': promotion_plan,
        'status': 'pending',
        'ip': get_client_ip()
    }
    try:
        apps_list = []
        if os.path.exists(AFFILIATE_APPLICATIONS_FILE):
            with open(AFFILIATE_APPLICATIONS_FILE, 'r') as f:
                apps_list = json.load(f)
        apps_list.append(app_data)
        os.makedirs(os.path.dirname(AFFILIATE_APPLICATIONS_FILE), exist_ok=True)
        with open(AFFILIATE_APPLICATIONS_FILE, 'w') as f:
            json.dump(apps_list, f, indent=2)
    except Exception as e:
        print(f'Error saving affiliate application: {e}')

    # Send via CUB PROTECTOR bot to affiliate applications channel
    try:
        bot_token = get_cub_protector_token()
        if bot_token:
            embed = {
                'title': 'New Affiliate Application',
                'color': 0x009dff,
                'fields': [
                    {'name': 'Name', 'value': name, 'inline': True},
                    {'name': 'Email', 'value': email, 'inline': True},
                    {'name': 'Discord', 'value': discord or '—', 'inline': True},
                    {'name': 'Platform', 'value': platform, 'inline': True},
                    {'name': 'Monthly Reach', 'value': monthly_reach or '—', 'inline': True},
                    {'name': 'Country', 'value': country or '—', 'inline': True},
                    {'name': 'Channel / Profile', 'value': channel_url, 'inline': False},
                    {'name': 'Found via', 'value': found_via or '—', 'inline': False},
                    {'name': 'Why affiliate?', 'value': why_affiliate[:500] if why_affiliate else '—', 'inline': False},
                    {'name': 'Promotion plan', 'value': promotion_plan[:500] if promotion_plan else '—', 'inline': False},
                ],
                'footer': {'text': f'Application ID: {app_data["id"]} • cubsoftware.site/affiliate/apply'},
                'timestamp': datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
            }
            requests.post(
                f'https://discord.com/api/channels/{AFFILIATE_APPLY_CHANNEL_ID}/messages',
                json={'embeds': [embed]},
                headers={'Authorization': f'Bot {bot_token}', 'Content-Type': 'application/json'},
                timeout=8
            )
    except Exception as e:
        print(f'Failed to send affiliate application via bot: {e}')

    return render_template('affiliate-apply.html', success=True)

# Affiliate tracking landing page
@app.route('/r/<code>')
def affiliate_track(code):
    """Track affiliate click and show branded landing page with custom SEO"""
    aff = get_affiliate_by_code(code)
    if not aff or not aff.get('enabled', True):
        return redirect('/')

    code_lower = code.lower()

    # Cookie-based fingerprint
    visitor_id = request.cookies.get('__cub_vid')
    new_visitor = not visitor_id
    if new_visitor:
        visitor_id = secrets.token_hex(16)
    cookie_fp = hashlib.sha256(f"cookie:{visitor_id}:{code_lower}".encode()).hexdigest()[:24]

    # IP-based fingerprint (hashed for privacy, code-scoped)
    ip = get_client_ip()
    ip_fp = hashlib.sha256(f"ip:{ip}:{code_lower}".encode()).hexdigest()[:24]

    clicks_data = load_affiliate_clicks()
    if code_lower not in clicks_data:
        clicks_data[code_lower] = {'clicks': [], 'unique_fingerprints': []}

    seen = clicks_data[code_lower].setdefault('unique_fingerprints', [])

    # Unique only if NEITHER the cookie fingerprint NOR the IP fingerprint has been seen
    is_unique = (cookie_fp not in seen) and (ip_fp not in seen)

    clicks_data[code_lower]['clicks'].append({
        'timestamp': int(time.time()),
        'unique': is_unique
    })
    if is_unique:
        # Record both so either one blocks future attempts
        seen.append(cookie_fp)
        seen.append(ip_fp)

    save_affiliate_clicks(clicks_data)

    dest = request.args.get('to', '/')
    if not dest.startswith('/'):
        dest = '/'

    name = aff.get('username', 'Someone')
    default_title = f"{name} recommends CUB SOFTWARE — Free Online Tools"
    default_desc = (
        f"{name} thinks you should check out CUB SOFTWARE. "
        "Free online tools that actually work — no ads, no paywalls, no signup. "
        "Everything we build is and always will be completely free."
    )
    default_message = (
        f"I found CUB SOFTWARE and it's genuinely impressive — free online tools "
        "that actually work with zero ads and no signup needed. "
        "Everything from PDF tools to Discord bots, all completely free."
    )

    seo_title = aff.get('seo_title') or default_title
    seo_description = aff.get('seo_description') or default_desc
    seo_image = aff.get('seo_image_url') or 'https://cubsoftware.site/static/images/company-logo.png'
    seo_keywords = aff.get('seo_keywords') or 'free online tools, CUB SOFTWARE, no signup, free tools'
    seo_twitter_handle = aff.get('seo_twitter_handle') or ''
    seo_custom_message = aff.get('seo_custom_message') or default_message
    redirect_dest = aff.get('seo_redirect_url') or dest
    if not redirect_dest.startswith('/'):
        redirect_dest = '/'
    try:
        redirect_delay = max(1, min(30, int(aff.get('seo_redirect_delay', 5))))
    except (ValueError, TypeError):
        redirect_delay = 5

    resp = make_response(render_template('affiliate-landing.html',
        affiliate=aff,
        dest=redirect_dest,
        seo_title=seo_title,
        seo_description=seo_description,
        seo_image=seo_image,
        seo_keywords=seo_keywords,
        seo_twitter_handle=seo_twitter_handle,
        seo_custom_message=seo_custom_message,
        redirect_delay=redirect_delay,
    ))
    if new_visitor:
        resp.set_cookie('__cub_vid', visitor_id, max_age=365 * 24 * 3600, httponly=True, samesite='Lax')
    return resp

@app.route('/affiliate/seo', methods=['POST'])
@affiliate_auth_required
def affiliate_save_seo():
    """Save custom SEO settings for the affiliate's landing page."""
    user = session.get('affiliate_user')
    data = request.get_json(silent=True) or {}

    def _str(key, maxlen):
        return str(data.get(key, '')).strip()[:maxlen]

    seo_title = _str('seo_title', 120)
    seo_description = _str('seo_description', 300)
    seo_custom_message = _str('seo_custom_message', 500)
    seo_image_url = _str('seo_image_url', 500)
    seo_keywords = _str('seo_keywords', 200)
    seo_twitter_handle = _str('seo_twitter_handle', 50)
    seo_redirect_url = _str('seo_redirect_url', 200)
    seo_redirect_delay_raw = str(data.get('seo_redirect_delay', '')).strip()

    # Validate URLs
    if seo_image_url and not seo_image_url.startswith(('https://', 'http://')):
        seo_image_url = ''
    if seo_redirect_url and not seo_redirect_url.startswith('/'):
        seo_redirect_url = ''
    if seo_twitter_handle and not seo_twitter_handle.startswith('@'):
        seo_twitter_handle = '@' + seo_twitter_handle
    try:
        seo_redirect_delay = max(1, min(30, int(seo_redirect_delay_raw))) if seo_redirect_delay_raw else None
    except ValueError:
        seo_redirect_delay = None

    affiliates_data = load_affiliates()
    found = False
    for aff_entry in affiliates_data['affiliates'].values():
        if aff_entry.get('discord_id') == user['id']:
            fields = {
                'seo_title': seo_title,
                'seo_description': seo_description,
                'seo_custom_message': seo_custom_message,
                'seo_image_url': seo_image_url,
                'seo_keywords': seo_keywords,
                'seo_twitter_handle': seo_twitter_handle,
                'seo_redirect_url': seo_redirect_url,
            }
            for field, value in fields.items():
                if value:
                    aff_entry[field] = value
                else:
                    aff_entry.pop(field, None)
            if seo_redirect_delay is not None:
                aff_entry['seo_redirect_delay'] = seo_redirect_delay
            else:
                aff_entry.pop('seo_redirect_delay', None)
            found = True
            break

    if not found:
        return jsonify({'error': 'Affiliate not found'}), 404

    save_affiliates(affiliates_data)
    return jsonify({'success': True})

# Affiliate OAuth — unified login handles everything
@app.route('/affiliate/auth/discord')
def affiliate_auth():
    return redirect('/login?next=/affiliate/dashboard')

@app.route('/affiliate/auth/callback')
def affiliate_callback():
    """Legacy callback — no longer used."""
    return redirect('/login?next=/affiliate/dashboard')

@app.route('/affiliate/auth/logout')
def affiliate_logout():
    session.pop('affiliate_user', None)
    return redirect('/logout')

# Affiliate stream widget (public — OBS browser source)
@app.route('/affiliate/widget/<code>')
def affiliate_widget(code):
    aff = get_affiliate_by_code(code)
    if not aff or not aff.get('enabled'):
        abort(404)
    response = make_response(render_template('affiliate-widget.html', affiliate=aff, v=STATIC_VERSION))
    response.headers['Cache-Control'] = 'no-store'
    return response

# Affiliate dashboard
@app.route('/affiliate/dashboard')
@app.route('/affiliate/dashboard/')
@affiliate_auth_required
def affiliate_dashboard_page():
    user = session.get('affiliate_user')
    aff = get_affiliate_by_discord_id(user['id'])
    stats = get_affiliate_stats(aff['code'])

    # Build daily stats for last 30 days
    now = int(time.time())
    daily = {}
    for i in range(29, -1, -1):
        day_str = datetime.fromtimestamp(now - i * 86400).strftime('%Y-%m-%d')
        daily[day_str] = {'total': 0, 'unique': 0}

    for click in stats['clicks']:
        day_str = datetime.fromtimestamp(click['timestamp']).strftime('%Y-%m-%d')
        if day_str in daily:
            daily[day_str]['total'] += 1
            if click.get('unique'):
                daily[day_str]['unique'] += 1

    daily_sorted = list(daily.items())
    total_earned = round(stats['unique_clicks'] * aff.get('commission_rate', 0), 2)
    paid_out = round(aff.get('paid_out', 0), 2)

    # Check for any pending/paid withdrawal requests
    withdrawals_data = load_withdrawals()
    aff_withdrawals = [w for w in withdrawals_data['withdrawals'].values() if w['aff_id'] == aff['id']]
    aff_withdrawals.sort(key=lambda x: x.get('created_at', 0), reverse=True)
    pending_withdrawal = next((w for w in aff_withdrawals if w['status'] == 'pending'), None)
    pending_reserved = round(pending_withdrawal['amount'] if pending_withdrawal else 0, 2)

    pending_payout = round(max(total_earned - paid_out - pending_reserved, 0), 2)
    available_payout = round(max(total_earned - paid_out - pending_reserved, 0), 2)
    payments = list(reversed(aff.get('payments', [])))  # newest first

    return render_template('affiliate-dashboard.html',
        user=user,
        affiliate=aff,
        stats=stats,
        daily=daily_sorted,
        total_earned=total_earned,
        paid_out=paid_out,
        pending_payout=pending_payout,
        available_payout=available_payout,
        pending_withdrawal=pending_withdrawal,
        aff_withdrawals=aff_withdrawals,
        min_payout=AFFILIATE_MIN_PAYOUT,
        payout_eligible=available_payout >= AFFILIATE_MIN_PAYOUT,
        payments=payments
    )

# Affiliate admin management page
@app.route('/affiliate/admin')
@app.route('/affiliate/admin/')
@pm2_auth_required
def affiliate_admin_page():
    return render_template('affiliate-admin.html', user=session['pm2_user'])

AFFILIATE_MIN_PAYOUT = 20.00  # Minimum earnings before withdrawal is available

# Affiliate admin API
@app.route('/api/admin/affiliates', methods=['GET'])
@pm2_auth_required
def admin_list_affiliates():
    data = load_affiliates()
    result = []
    for aff_id, aff in data['affiliates'].items():
        stats = get_affiliate_stats(aff['code'])
        total_earned = round(stats['unique_clicks'] * aff.get('commission_rate', 0), 2)
        paid_out = round(aff.get('paid_out', 0), 2)
        pending = round(max(total_earned - paid_out, 0), 2)
        result.append({
            **aff,
            'total_clicks': stats['total_clicks'],
            'unique_clicks': stats['unique_clicks'],
            'total_earned': total_earned,
            'paid_out': paid_out,
            'pending_payout': pending,
            'payout_eligible': pending >= AFFILIATE_MIN_PAYOUT
        })
    result.sort(key=lambda x: x.get('created_at', 0), reverse=True)
    return jsonify({'affiliates': result, 'min_payout': AFFILIATE_MIN_PAYOUT})

@app.route('/api/admin/affiliates', methods=['POST'])
@pm2_auth_required
def admin_create_affiliate():
    req = request.get_json() or {}
    discord_id = req.get('discord_id', '').strip()
    code = req.get('code', '').strip().lower()
    commission_rate = float(req.get('commission_rate', 0))
    notes = req.get('notes', '')

    if not discord_id or not code:
        return jsonify({'error': 'discord_id and code are required'}), 400
    if not re.match(r'^[a-z0-9\-]{3,30}$', code):
        return jsonify({'error': 'Code must be 3-30 chars, alphanumeric and hyphens only'}), 400

    data = load_affiliates()
    for aff in data['affiliates'].values():
        if aff.get('discord_id') == discord_id:
            return jsonify({'error': 'This Discord user already has an affiliate account'}), 409
        if aff.get('code') == code:
            return jsonify({'error': 'This code is already taken'}), 409

    aff_id = secrets.token_hex(8)
    data['affiliates'][aff_id] = {
        'id': aff_id,
        'discord_id': discord_id,
        'discord_username': req.get('discord_username', ''),
        'discord_avatar': req.get('discord_avatar', ''),
        'code': code,
        'created_at': int(time.time()),
        'enabled': True,
        'commission_rate': commission_rate,
        'notes': notes
    }
    save_affiliates(data)
    return jsonify({'success': True, 'affiliate': data['affiliates'][aff_id]})

@app.route('/api/admin/affiliates/<aff_id>', methods=['PUT'])
@pm2_auth_required
def admin_update_affiliate(aff_id):
    data = load_affiliates()
    if aff_id not in data['affiliates']:
        return jsonify({'error': 'Affiliate not found'}), 404

    req = request.get_json() or {}
    aff = data['affiliates'][aff_id]

    if 'enabled' in req:
        aff['enabled'] = bool(req['enabled'])
    if 'commission_rate' in req:
        aff['commission_rate'] = float(req['commission_rate'])
    if 'notes' in req:
        aff['notes'] = req['notes']
    if 'code' in req:
        new_code = req['code'].strip().lower()
        if not re.match(r'^[a-z0-9\-]{3,30}$', new_code):
            return jsonify({'error': 'Invalid code format'}), 400
        for other_id, other in data['affiliates'].items():
            if other_id != aff_id and other.get('code') == new_code:
                return jsonify({'error': 'Code already taken'}), 409
        aff['code'] = new_code

    save_affiliates(data)
    return jsonify({'success': True, 'affiliate': aff})

@app.route('/api/admin/affiliates/<aff_id>', methods=['DELETE'])
@pm2_auth_required
def admin_delete_affiliate(aff_id):
    data = load_affiliates()
    if aff_id not in data['affiliates']:
        return jsonify({'error': 'Affiliate not found'}), 404
    del data['affiliates'][aff_id]
    save_affiliates(data)
    return jsonify({'success': True})

@app.route('/api/admin/affiliates/<aff_id>/pay', methods=['POST'])
@pm2_auth_required
def admin_pay_affiliate(aff_id):
    """Record a payout for an affiliate"""
    data = load_affiliates()
    if aff_id not in data['affiliates']:
        return jsonify({'error': 'Affiliate not found'}), 404

    aff = data['affiliates'][aff_id]
    req = request.get_json() or {}
    note = req.get('note', '').strip()

    stats = get_affiliate_stats(aff['code'])
    total_earned = round(stats['unique_clicks'] * aff.get('commission_rate', 0), 2)
    paid_out = round(aff.get('paid_out', 0), 2)
    pending = round(max(total_earned - paid_out, 0), 2)

    if pending <= 0:
        return jsonify({'error': 'No pending balance to pay out'}), 400

    if 'payments' not in aff:
        aff['payments'] = []

    aff['payments'].append({
        'timestamp': int(time.time()),
        'amount': pending,
        'note': note
    })
    aff['paid_out'] = round(paid_out + pending, 2)
    save_affiliates(data)

    return jsonify({'success': True, 'amount_paid': pending, 'new_paid_out': aff['paid_out']})

# ==================== AFFILIATE WITHDRAWAL REQUESTS ====================

@app.route('/affiliate/withdraw', methods=['POST'])
@affiliate_auth_required
def affiliate_request_withdrawal():
    """Affiliate submits a withdrawal request"""
    user = session.get('affiliate_user')
    aff = get_affiliate_by_discord_id(user['id'])
    if not aff:
        return jsonify({'error': 'Affiliate not found'}), 404

    req = request.get_json() or {}
    paypal_email = req.get('paypal_email', '').strip()
    try:
        amount = round(float(req.get('amount', 0)), 2)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid amount'}), 400

    if not paypal_email or '@' not in paypal_email:
        return jsonify({'error': 'Valid PayPal email is required'}), 400
    if amount < AFFILIATE_MIN_PAYOUT:
        return jsonify({'error': f'Minimum withdrawal is NZ${AFFILIATE_MIN_PAYOUT:.2f}'}), 400

    # Check available balance (excluding any pending reservations)
    stats = get_affiliate_stats(aff['code'])
    total_earned = round(stats['unique_clicks'] * aff.get('commission_rate', 0), 2)
    paid_out = round(aff.get('paid_out', 0), 2)

    withdrawals_data = load_withdrawals()
    pending_reserved = round(sum(
        w['amount'] for w in withdrawals_data['withdrawals'].values()
        if w['aff_id'] == aff['id'] and w['status'] == 'pending'
    ), 2)

    if pending_reserved > 0:
        return jsonify({'error': 'You already have a pending withdrawal request'}), 400

    available = round(max(total_earned - paid_out - pending_reserved, 0), 2)
    if amount > available:
        return jsonify({'error': f'Amount exceeds available balance of NZ${available:.2f}'}), 400

    wd_id = 'wd_' + secrets.token_hex(8)
    withdrawals_data['withdrawals'][wd_id] = {
        'id': wd_id,
        'aff_id': aff['id'],
        'discord_id': aff.get('discord_id', ''),
        'discord_username': user.get('username', ''),
        'discord_avatar': user.get('avatar', ''),
        'amount': amount,
        'paypal_email': paypal_email,
        'status': 'pending',
        'created_at': int(time.time()),
        'processed_at': None,
        'invoice_id': None,
        'note': ''
    }
    save_withdrawals(withdrawals_data)
    return jsonify({'success': True, 'withdrawal_id': wd_id})

@app.route('/api/admin/affiliates/withdrawals', methods=['GET'])
@pm2_auth_required
def admin_list_withdrawals():
    """List all withdrawal requests"""
    withdrawals_data = load_withdrawals()
    result = list(withdrawals_data['withdrawals'].values())
    result.sort(key=lambda x: x.get('created_at', 0), reverse=True)
    return jsonify({'withdrawals': result})

@app.route('/api/admin/affiliates/withdrawals/<wd_id>/pay', methods=['POST'])
@pm2_auth_required
def admin_pay_withdrawal(wd_id):
    """Mark a withdrawal request as paid and generate invoice"""
    withdrawals_data = load_withdrawals()
    if wd_id not in withdrawals_data['withdrawals']:
        return jsonify({'error': 'Withdrawal not found'}), 404

    wd = withdrawals_data['withdrawals'][wd_id]
    if wd['status'] != 'pending':
        return jsonify({'error': 'Withdrawal is not pending'}), 400

    # Generate sequential invoice ID
    paid_count = sum(1 for w in withdrawals_data['withdrawals'].values() if w['status'] == 'paid')
    year = datetime.now().year
    invoice_id = f'CUB-INV-{year}-{(paid_count + 1):04d}'

    req_body = request.get_json() or {}
    wd['status'] = 'paid'
    wd['processed_at'] = int(time.time())
    wd['invoice_id'] = invoice_id
    wd['note'] = req_body.get('note', '').strip()

    # Update affiliate paid_out
    aff_data = load_affiliates()
    aff = aff_data['affiliates'].get(wd['aff_id'])
    if aff:
        if 'payments' not in aff:
            aff['payments'] = []
        aff['payments'].append({
            'timestamp': int(time.time()),
            'amount': wd['amount'],
            'note': f'Withdrawal {invoice_id}',
            'withdrawal_id': wd_id
        })
        aff['paid_out'] = round(aff.get('paid_out', 0) + wd['amount'], 2)
        save_affiliates(aff_data)

    save_withdrawals(withdrawals_data)
    return jsonify({'success': True, 'invoice_id': invoice_id})

@app.route('/api/admin/affiliates/withdrawals/<wd_id>/reject', methods=['POST'])
@pm2_auth_required
def admin_reject_withdrawal(wd_id):
    """Reject a withdrawal request"""
    withdrawals_data = load_withdrawals()
    if wd_id not in withdrawals_data['withdrawals']:
        return jsonify({'error': 'Withdrawal not found'}), 404

    wd = withdrawals_data['withdrawals'][wd_id]
    if wd['status'] != 'pending':
        return jsonify({'error': 'Withdrawal is not pending'}), 400

    req_body = request.get_json() or {}
    wd['status'] = 'rejected'
    wd['processed_at'] = int(time.time())
    wd['note'] = req_body.get('note', '').strip()
    save_withdrawals(withdrawals_data)
    return jsonify({'success': True})

@app.route('/api/admin/affiliates/withdrawals/<wd_id>', methods=['DELETE'])
@pm2_auth_required
def admin_delete_withdrawal(wd_id):
    """Delete a withdrawal record and reverse the paid_out if it was paid"""
    withdrawals_data = load_withdrawals()
    if wd_id not in withdrawals_data['withdrawals']:
        return jsonify({'error': 'Withdrawal not found'}), 404

    wd = withdrawals_data['withdrawals'][wd_id]

    # If it was paid, reverse the paid_out on the affiliate and remove payment entry
    if wd['status'] == 'paid':
        aff_data = load_affiliates()
        aff = aff_data['affiliates'].get(wd['aff_id'])
        if aff:
            aff['paid_out'] = round(max(aff.get('paid_out', 0) - wd['amount'], 0), 2)
            aff['payments'] = [p for p in aff.get('payments', []) if p.get('withdrawal_id') != wd_id]
            save_affiliates(aff_data)

    del withdrawals_data['withdrawals'][wd_id]
    save_withdrawals(withdrawals_data)
    return jsonify({'success': True})

@app.route('/affiliate/invoice/<wd_id>')
@affiliate_auth_required
def affiliate_invoice_page(wd_id):
    """View invoice for a paid withdrawal"""
    user = session.get('affiliate_user')
    aff = get_affiliate_by_discord_id(user['id'])
    withdrawals_data = load_withdrawals()
    wd = withdrawals_data['withdrawals'].get(wd_id)

    if not wd:
        return "Invoice not found", 404
    if wd['aff_id'] != aff['id']:
        return "Not authorised", 403
    if wd['status'] != 'paid':
        return "Invoice not yet available — payment is still pending", 400

    return render_template('affiliate-invoice.html', withdrawal=wd, user=user)

@app.route('/api/admin/affiliates/<aff_id>/fetch-avatar', methods=['POST'])
@pm2_auth_required
def admin_fetch_affiliate_avatar(aff_id):
    """Fetch and store the affiliate's Discord avatar via the CUB PROTECTOR bot"""
    data = load_affiliates()
    if aff_id not in data['affiliates']:
        return jsonify({'error': 'Affiliate not found'}), 404

    aff = data['affiliates'][aff_id]
    discord_id = aff.get('discord_id')
    if not discord_id:
        return jsonify({'error': 'No Discord ID set'}), 400

    try:
        user_data = cub_protector_bot_request('GET', f'/users/{discord_id}')
        if not user_data or 'id' not in user_data:
            return jsonify({'error': 'Could not fetch user from Discord'}), 502

        avatar_hash = user_data.get('avatar')
        if avatar_hash:
            avatar_url = f"https://cdn.discordapp.com/avatars/{discord_id}/{avatar_hash}.png?size=256"
        else:
            discriminator = int(user_data.get('discriminator', '0') or '0')
            avatar_url = f"https://cdn.discordapp.com/embed/avatars/{discriminator % 5}.png"

        username = user_data.get('global_name') or user_data.get('username') or aff.get('discord_username', '')
        aff['discord_avatar'] = avatar_url
        aff['discord_username'] = username
        save_affiliates(data)

        return jsonify({'success': True, 'avatar_url': avatar_url, 'username': username})

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# Appeal list for dashboard
# ==================== ERROR HANDLERS ====================

@app.errorhandler(404)
def page_not_found(e):
    """Handle 404 errors - serve custom 404 page"""
    return render_template('404.html'), 404

@app.route('/apps/<path:subpath>')
def apps_catch_all(subpath):
    """Catch-all for undefined /apps/* routes - return 404"""
    return render_template('404.html'), 404

# ==================== SERVER STARTUP ====================

if __name__ == '__main__':
    # Get local IP
    try:
        hostname = socket.gethostname()
        local_ip = socket.gethostbyname(hostname)
    except:
        local_ip = "192.168.1.27"

    print("=" * 70)
    print("                       CUB SOFTWARE")
    print("=" * 70)
    print()
    print("Main Landing Page:")
    print(f"  • Local:       http://localhost:3000")
    print(f"  • Network:     http://{local_ip}:3000")
    print()
    print("Social Media Saver App:")
    print(f"  • Local:       http://localhost:3000/apps/social-media-saver")
    print(f"  • Network:     http://{local_ip}:3000/apps/social-media-saver")
    print()
    print("Stream Overlays:")
    print(f"  • Local:       http://localhost:3000/overlays")
    print(f"  • Network:     http://{local_ip}:3000/overlays")
    print()
    print("CUB PROTECTOR Dashboard:")
    print(f"  • Local:       http://localhost:3000/cub-protector")
    print(f"  • Network:     http://{local_ip}:3000/cub-protector")
    print()
    print("=" * 70)
    print("Production server running on all network interfaces (0.0.0.0:3000)")
    print("Press Ctrl+C to stop")
    print("=" * 70)
    print()

    # Log startup
    logger.startup()

    # Register shutdown handler
    def shutdown_handler(signum=None, frame=None):
        logger.shutdown()
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown_handler)
    signal.signal(signal.SIGTERM, shutdown_handler)
    atexit.register(lambda: logger.shutdown())

    # Run production server with Waitress
    # 16 threads: allows SSE connections (each holds a thread) + regular requests simultaneously
    serve(app, host='0.0.0.0', port=3000, threads=16)
