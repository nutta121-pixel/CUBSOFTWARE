import yt_dlp
import os
import sys
import subprocess

def is_spotify_url(url):
    """Check if URL is from Spotify"""
    return 'spotify.com' in url

def download_spotify(url, output_path='downloads'):
    """Download from Spotify using spotdl"""
    if not os.path.exists(output_path):
        os.makedirs(output_path)

    try:
        print(f"Processing Spotify URL: {url}\n")

        # FFmpeg path
        ffmpeg_path = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.0.1-full_build', 'bin', 'ffmpeg.exe')

        # Use spotdl to download
        python_path = r"C:\Users\Thorton\AppData\Local\Programs\Python\Python312\python.exe"
        result = subprocess.run(
            [python_path, "-m", "spotdl", url, "--output", output_path, "--format", "mp3", "--bitrate", "320k", "--ffmpeg", ffmpeg_path],
            capture_output=True,
            text=True
        )

        print(result.stdout)
        if result.stderr:
            print(result.stderr)

        if result.returncode == 0:
            print("\nSpotify download complete!")
            return True
        else:
            print(f"\nError downloading from Spotify")
            return False
    except Exception as e:
        print(f"Error: {e}")
        return False

def download_mp3(url, output_path='downloads'):
    """
    Download YouTube video or playlist as MP3 at highest quality

    Args:
        url: YouTube video or playlist URL
        output_path: Directory to save the MP3 files
    """
    if not os.path.exists(output_path):
        os.makedirs(output_path)

    ffmpeg_path = os.path.join(os.environ.get('LOCALAPPDATA', ''), 'Microsoft', 'WinGet', 'Packages', 'Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ffmpeg-8.0.1-full_build', 'bin')

    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [
            {
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '320',
            },
            {
                'key': 'FFmpegMetadata',
                'add_metadata': True,
            },
        ],
        'ffmpeg_location': ffmpeg_path if os.path.exists(ffmpeg_path) else None,
        'outtmpl': os.path.join(output_path, '%(title)s.%(ext)s'),
        'quiet': False,
        'no_warnings': False,
        'ignoreerrors': True,  # Continue on download errors in playlists
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            print(f"Processing: {url}\n")
            # Just download directly - yt-dlp will handle playlists automatically
            ydl.download([url])
            print(f"\nDownload complete!")
            return True
    except Exception as e:
        print(f"Error downloading: {e}")
        return False

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python downloader.py <URL>")
        print("\nExamples:")
        print("  YouTube video:     python downloader.py https://www.youtube.com/watch?v=dQw4w9WgXcQ")
        print("  YouTube playlist:  python downloader.py https://www.youtube.com/playlist?list=PLrAXtmErZgOeiKm4sgNOknGvNjby9efdf")
        print("  Spotify track:     python downloader.py https://open.spotify.com/track/...")
        print("  Spotify playlist:  python downloader.py https://open.spotify.com/playlist/...")
        sys.exit(1)

    url = sys.argv[1]

    # Route to appropriate downloader based on URL
    if is_spotify_url(url):
        download_spotify(url)
    else:
        download_mp3(url)
