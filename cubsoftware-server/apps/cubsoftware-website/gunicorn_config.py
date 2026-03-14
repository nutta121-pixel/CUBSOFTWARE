# Gunicorn configuration file for production deployment

# Server socket
bind = "127.0.0.1:3000"
backlog = 2048

# Worker processes
# Use 1 worker to maintain shared state (active_downloads dictionary)
# Use threads for concurrency instead of multiple workers
workers = 1
worker_class = 'gthread'
threads = 4
worker_connections = 1000
timeout = 300
keepalive = 2

# Logging
accesslog = '/var/log/cubsoftware/access.log'
errorlog = '/var/log/cubsoftware/error.log'
loglevel = 'info'
access_log_format = '%(h)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# Process naming
proc_name = 'cubsoftware'

# Server mechanics
daemon = False
pidfile = '/var/run/cubsoftware/cubsoftware.pid'
umask = 0
user = None
group = None
tmp_upload_dir = None

# SSL (if needed)
# keyfile = '/path/to/keyfile'
# certfile = '/path/to/certfile'
