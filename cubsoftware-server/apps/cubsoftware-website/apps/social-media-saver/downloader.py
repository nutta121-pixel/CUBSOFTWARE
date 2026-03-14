import yt_dlp
import os
from pathlib import Path

def download_content(url, platform, download_folder, download_id, downloads_dict):
    """
    Download content from Instagram, TikTok, or Twitter

    Args:
        url: The URL to download from
        platform: The platform name (instagram, tiktok, twitter)
        download_folder: Where to save the file
        download_id: Unique ID for this download
        downloads_dict: Dictionary to update with progress

    Returns:
        Path to the downloaded file
    """

    def progress_hook(d):
        """Update progress during download"""
        if d['status'] == 'downloading':
            if 'total_bytes' in d and d['total_bytes'] > 0:
                progress = int((d['downloaded_bytes'] / d['total_bytes']) * 100)
                downloads_dict[download_id]['progress'] = progress
                downloads_dict[download_id]['logs'].append(f'Downloading... {progress}%')
        elif d['status'] == 'finished':
            downloads_dict[download_id]['logs'].append('Processing file...')

    # Configure yt-dlp options
    ydl_opts = {
        'format': 'best',  # Download best quality
        'outtmpl': os.path.join(download_folder, f'{download_id}.%(ext)s'),
        'progress_hooks': [progress_hook],
        'quiet': False,
        'no_warnings': False,
        'restrictfilenames': True,  # Sanitize filenames to remove special characters
    }

    # Platform-specific settings
    if platform == 'instagram':
        downloads_dict[download_id]['logs'].append('Fetching Instagram content...')
        # Instagram: Download the best quality photo/video
        ydl_opts['format'] = 'best'

    elif platform == 'tiktok':
        downloads_dict[download_id]['logs'].append('Fetching TikTok video...')
        # TikTok: Try to get version without watermark
        ydl_opts['format'] = 'best'

    elif platform == 'twitter':
        downloads_dict[download_id]['logs'].append('Fetching Twitter/X media...')
        # Twitter: Download best quality media
        ydl_opts['format'] = 'best'

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            # Extract info to get the filename
            info = ydl.extract_info(url, download=True)

            # Get the actual filename
            filename = ydl.prepare_filename(info)

            if os.path.exists(filename):
                downloads_dict[download_id]['logs'].append(f'Downloaded: {Path(filename).name}')
                return filename
            else:
                raise Exception('File was not created')

    except Exception as e:
        error_msg = str(e)

        # Provide more user-friendly error messages for common issues
        if platform == 'facebook' and 'Cannot parse data' in error_msg:
            user_friendly_msg = 'Facebook download failed. This video may be private, restricted, or use a format that is currently unsupported. Try a different Facebook video or wait for CUBSOFTWARE to release an update.'
            downloads_dict[download_id]['logs'].append(f'Error: {user_friendly_msg}')
            raise Exception(user_friendly_msg)

        downloads_dict[download_id]['logs'].append(f'Error: {error_msg}')
        raise Exception(f'Failed to download from {platform}: {error_msg}')
