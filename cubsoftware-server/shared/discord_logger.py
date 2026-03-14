"""
Discord Logger - Shared logging utility for all CUB SOFTWARE Python projects

Usage:
    from shared.discord_logger import DiscordLogger

    logger = DiscordLogger('CubSoftware Website', os.environ.get('DISCORD_LOG_WEBHOOK'))

    logger.info('Server started')
    logger.success('User logged in')
    logger.warn('Rate limit approaching')
    logger.error('Database connection failed', error)
"""

import json
import urllib.request
import urllib.error
from datetime import datetime
import traceback


class DiscordLogger:
    def __init__(self, project_name: str, webhook_url: str = None):
        self.project_name = project_name
        self.webhook_url = webhook_url
        self.colors = {
            'info': 0x3b82f6,     # Blue
            'success': 0x22c55e,  # Green
            'warn': 0xf59e0b,     # Yellow/Orange
            'error': 0xef4444,    # Red
            'debug': 0x6b7280     # Gray
        }
        self.icons = {
            'info': 'ℹ️',
            'success': '✅',
            'warn': '⚠️',
            'error': '❌',
            'debug': '🔧'
        }

        if not webhook_url:
            print(f'[{project_name}] Discord logging disabled - no webhook URL provided')

    def log(self, level: str, message: str, details=None):
        """Send a log message to Discord"""
        # Always log to console
        console_msg = f'[{self.project_name}] [{level.upper()}] {message}'
        if level == 'error':
            print(console_msg, details or '')
        else:
            print(console_msg)

        # Send to Discord if webhook is configured
        if not self.webhook_url:
            return

        try:
            embed = {
                'color': self.colors.get(level, self.colors['info']),
                'author': {
                    'name': self.project_name
                },
                'description': f"{self.icons.get(level, '')} {message}",
                'timestamp': datetime.utcnow().isoformat() + 'Z'
            }

            # Add error details if present
            if details:
                if isinstance(details, Exception):
                    tb = traceback.format_exception(type(details), details, details.__traceback__)
                    error_text = ''.join(tb)
                    embed['fields'] = [{
                        'name': 'Error Details',
                        'value': f'```{error_text[:1000]}```'
                    }]
                elif isinstance(details, dict):
                    embed['fields'] = [{
                        'name': 'Details',
                        'value': f'```json\n{json.dumps(details, indent=2)[:1000]}```'
                    }]
                else:
                    embed['fields'] = [{
                        'name': 'Details',
                        'value': str(details)[:1024]
                    }]

            self._send_webhook({'embeds': [embed]})
        except Exception as err:
            print(f'[{self.project_name}] Failed to send Discord log: {err}')

    def _send_webhook(self, payload: dict):
        """Send raw webhook payload"""
        if not self.webhook_url:
            return

        try:
            data = json.dumps(payload).encode('utf-8')
            req = urllib.request.Request(
                self.webhook_url,
                data=data,
                headers={'Content-Type': 'application/json'},
                method='POST'
            )
            urllib.request.urlopen(req, timeout=5)
        except urllib.error.URLError as e:
            print(f'[{self.project_name}] Webhook error: {e}')

    # Convenience methods
    def info(self, message: str, details=None):
        return self.log('info', message, details)

    def success(self, message: str, details=None):
        return self.log('success', message, details)

    def warn(self, message: str, details=None):
        return self.log('warn', message, details)

    def error(self, message: str, details=None):
        return self.log('error', message, details)

    def debug(self, message: str, details=None):
        return self.log('debug', message, details)

    def startup(self):
        """Log application startup"""
        return self.success(f'**{self.project_name}** started')

    def shutdown(self):
        """Log application shutdown"""
        return self.warn(f'**{self.project_name}** shutting down')
