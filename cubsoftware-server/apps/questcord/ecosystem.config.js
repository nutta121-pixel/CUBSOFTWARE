module.exports = {
  apps: [{
    name: 'questcord',
    script: './start.js',
    instances: 1, // Discord bots should run single instance (stateful WebSocket)
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '3500M', // Use 3.5GB of 4GB (leave 500MB for system)
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 4000,

    // Node.js optimization flags for better performance
    node_args: [
      '--max-old-space-size=3500',        // Max heap size 3.5GB
      '--optimize-for-size',              // Optimize for memory usage
      '--gc-interval=100',                // Garbage collection interval
      '--max-semi-space-size=64'          // Optimize young generation
    ],

    env: {
      NODE_ENV: 'development',
      UV_THREADPOOL_SIZE: 128             // Increase libuv thread pool (default 4)
    },
    env_production: {
      NODE_ENV: 'production',
      UV_THREADPOOL_SIZE: 128
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
    shutdown_with_message: true,
    exp_backoff_restart_delay: 100,

    // Cron restart at 3 AM daily (for garbage collection)
    cron_restart: '0 3 * * *',

    // Health check
    wait_ready: true,

    // Performance monitoring
    instance_var: 'INSTANCE_ID',

    // Automatic updates
    post_update: ['npm install']
  }]
};
