from flask import Blueprint, render_template, request, jsonify, send_file
import os
import threading
import time
import uuid
import json
from datetime import datetime, timedelta

APP_DIR = os.path.dirname(os.path.abspath(__file__))
WEBSITE_DATA_PATH = os.path.join(APP_DIR, '..', '..', 'data')
DISABLED_FEATURES_FILE = os.path.join(WEBSITE_DATA_PATH, 'disabled_features.json')

def is_feature_disabled():
    """Check if social-media-saver is disabled"""
    if os.path.exists(DISABLED_FEATURES_FILE):
        try:
            with open(DISABLED_FEATURES_FILE, 'r') as f:
                disabled = json.load(f)
                return 'social-media-saver' in disabled
        except:
            pass
    return False

social_media_bp = Blueprint('social_media_saver', __name__,
                            template_folder=os.path.join(APP_DIR, 'templates'),
                            static_folder=os.path.join(APP_DIR, 'static'),
                            static_url_path='/static')

@social_media_bp.before_request
def check_feature_status():
    """Check if feature is disabled before processing any request"""
    if is_feature_disabled():
        if request.is_json or request.path.startswith('/api/'):
            return jsonify({
                'error': 'Feature disabled',
                'feature': 'social-media-saver',
                'message': 'This feature is currently disabled for maintenance.'
            }), 503
        else:
            return render_template('feature-disabled.html', feature='social-media-saver'), 503

DOWNLOAD_FOLDER = os.path.join(APP_DIR, 'downloads')
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

# Store download status
downloads = {}
total_downloads = 0  # Global stats counter

@social_media_bp.route('/')
def index():
    """Serve the Social Media Saver app page"""
    return render_template('social_media_app.html')

@social_media_bp.route('/api/download', methods=['POST'])
def download():
    """Handle download request"""
    data = request.json
    url = data.get('url', '').strip()

    if not url:
        return jsonify({'error': 'Please provide a valid URL'}), 400

    # Detect platform
    platform = detect_platform(url)
    if not platform:
        return jsonify({'error': 'Unsupported platform. Please use Instagram, TikTok, Twitter/X, or Facebook URLs.'}), 400

    # Generate unique download ID
    download_id = str(uuid.uuid4())

    # Initialize download status
    downloads[download_id] = {
        'status': 'queued',
        'platform': platform,
        'url': url,
        'progress': 0,
        'file': None,
        'error': None,
        'logs': []
    }

    # Start download in background thread
    thread = threading.Thread(target=process_download, args=(download_id, url, platform))
    thread.daemon = True
    thread.start()

    return jsonify({'download_id': download_id, 'platform': platform})

@social_media_bp.route('/api/status/<download_id>')
def get_status(download_id):
    """Get download status"""
    if download_id not in downloads:
        return jsonify({'error': 'Download not found'}), 404

    return jsonify(downloads[download_id])

@social_media_bp.route('/api/download-file/<download_id>')
def download_file(download_id):
    """Download the completed file"""
    if download_id not in downloads:
        return jsonify({'error': 'Download not found'}), 404

    download_info = downloads[download_id]

    if download_info['status'] != 'completed' or not download_info['file']:
        return jsonify({'error': 'File not ready'}), 400

    file_path = os.path.join(DOWNLOAD_FOLDER, download_info['file'])

    if not os.path.exists(file_path):
        return jsonify({'error': 'File not found'}), 404

    return send_file(file_path, as_attachment=True)

@social_media_bp.route('/api/stats')
def get_stats():
    """Get global download stats"""
    return jsonify({
        'total_downloads': total_downloads
    })

def detect_platform(url):
    """Detect social media platform from URL"""
    url_lower = url.lower()

    if 'instagram.com' in url_lower or 'instagr.am' in url_lower:
        return 'instagram'
    elif 'tiktok.com' in url_lower:
        return 'tiktok'
    elif 'twitter.com' in url_lower or 'x.com' in url_lower:
        return 'twitter'
    elif 'facebook.com' in url_lower or 'fb.com' in url_lower or 'fb.watch' in url_lower:
        return 'facebook'

    return None

def process_download(download_id, url, platform):
    """Process the download in background"""
    try:
        downloads[download_id]['status'] = 'downloading'
        downloads[download_id]['logs'].append(f'Starting {platform} download...')

        # Import downloader using importlib
        import importlib.util
        downloader_path = os.path.join(APP_DIR, 'downloader.py')
        spec = importlib.util.spec_from_file_location("downloader", downloader_path)
        downloader_module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(downloader_module)

        # Download the content
        file_path = downloader_module.download_content(url, platform, DOWNLOAD_FOLDER, download_id, downloads)

        if file_path and os.path.exists(file_path):
            downloads[download_id]['status'] = 'completed'
            downloads[download_id]['file'] = os.path.basename(file_path)
            downloads[download_id]['progress'] = 100
            downloads[download_id]['logs'].append('Download completed!')

            # Increment global stats
            global total_downloads
            total_downloads += 1
        else:
            raise Exception('Download failed - no file created')

    except Exception as e:
        downloads[download_id]['status'] = 'failed'
        downloads[download_id]['error'] = str(e)
        downloads[download_id]['logs'].append(f'Error: {str(e)}')

def cleanup_old_files():
    """Clean up files older than 30 seconds"""
    while True:
        try:
            current_time = datetime.now()
            for filename in os.listdir(DOWNLOAD_FOLDER):
                file_path = os.path.join(DOWNLOAD_FOLDER, filename)
                if os.path.isfile(file_path):
                    file_age = current_time - datetime.fromtimestamp(os.path.getmtime(file_path))
                    if file_age > timedelta(seconds=30):
                        os.remove(file_path)
                        print(f"Cleaned up old file: {filename}")
        except Exception as e:
            print(f"Cleanup error: {e}")

        time.sleep(15)  # Run every 15 seconds

# Start cleanup thread
cleanup_thread = threading.Thread(target=cleanup_old_files, daemon=True)
cleanup_thread.start()
