# Gunicorn configuration for CubSoftware Website
# Used by PM2 ecosystem.config.js

# Server socket - port 3000 for unified deployment
bind = "127.0.0.1:3000"
backlog = 2048

# Worker processes
workers = 1
worker_class = 'gthread'
threads = 4
worker_connections = 1000
timeout = 300
keepalive = 2

# Logging - use relative paths for PM2 log management
accesslog = '-'  # stdout (PM2 captures this)
errorlog = '-'   # stderr (PM2 captures this)
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = 'cubsoftware-website'

# Server mechanics
daemon = False
umask = 0
user = None
group = None
tmp_upload_dir = None
