module.exports = {
  apps: [{
    name: 'cub-protector',
    script: './start.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,

    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production'
    },

    // Logging
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

    // Process management
    kill_timeout: 5000,
    listen_timeout: 10000,

    // Automatic updates
    post_update: ['npm install']
  }]
};
