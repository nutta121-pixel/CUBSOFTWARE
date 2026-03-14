"""
Bot Logger - Send logs to Discord via CubSoftware Bot

Usage:
    from shared.bot_logger import BotLogger

    logger = BotLogger('cubsoftware-website', os.environ.get('BOT_API_KEY'))

    logger.info('Server started')
    logger.success('User logged in')
    logger.warn('Rate limit approaching')
    logger.error('Database connection failed')
"""

import json
import urllib.request
import urllib.error


class BotLogger:
    def __init__(self, project_name: str, api_key: str = None, bot_url: str = 'http://127.0.0.1:3847'):
        self.project_name = project_name
        self.api_key = api_key
        self.bot_url = bot_url

        if not api_key:
            print(f'[{project_name}] Bot logging disabled - no API key provided')

    def log(self, level: str, message: str):
        """Send a log message to Discord via the bot"""
        # Always log to console
        console_msg = f'[{self.project_name}] [{level.upper()}] {message}'
        if level == 'error':
            print(console_msg)
        else:
            print(console_msg)

        # Send to bot if API key is configured
        if not self.api_key:
            return

        try:
            payload = {
                'project': self.project_name,
                'level': level,
                'message': message,
                'apiKey': self.api_key
            }

            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                f'{self.bot_url}/log',
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=5)
        except urllib.error.URLError as e:
            print(f'[{self.project_name}] Bot log error: {e}')
        except Exception as e:
            print(f'[{self.project_name}] Bot log error: {e}')

    # Convenience methods
    def info(self, message: str):
        return self.log('info', message)

    def success(self, message: str):
        return self.log('success', message)

    def warn(self, message: str):
        return self.log('warn', message)

    def error(self, message: str):
        return self.log('error', message)

    def startup(self):
        """Log application startup"""
        return self.success(f'**{self.project_name}** started')

    def shutdown(self):
        """Log application shutdown"""
        return self.warn(f'**{self.project_name}** shutting down')
