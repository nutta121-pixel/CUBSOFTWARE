// CubSoftware Server - PM2 Configuration
// Start all services: pm2 start cubsoftware.config.js
// Or simply: pm2 start cubsoftware

module.exports = {
  apps: [
    // ============================================
    // CubSoftware Website (Flask/Gunicorn)
    // Domain: cubsoftware.site
    // ============================================
    {
      name: 'cubsoftware-website',
      cwd: './apps/cubsoftware-website',
      script: 'main.py',
      interpreter: 'python3',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        PORT: 3000,
        FLASK_ENV: 'production'
      },
      error_file: './logs/cubsoftware-website/error.log',
      out_file: './logs/cubsoftware-website/out.log',
      time: true,
      merge_logs: true
    },

    // ============================================
    // CubVault Backend API (Node.js/Express)
    // Domain: cubvault.cubsoftware.site/api
    // DISABLED: Missing source code (desktop/ folder)
    // ============================================
    // {
    //   name: 'cubvault-api',
    //   cwd: './apps/cubvault/server',
    //   script: 'npm',
    //   args: 'run start',
    //   interpreter: 'none',
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '512M',
    //   env: {
    //     PORT: 3001,
    //     NODE_ENV: 'production'
    //   },
    //   error_file: './logs/cubvault-api/error.log',
    //   out_file: './logs/cubvault-api/out.log',
    //   time: true,
    //   merge_logs: true
    // },

    // ============================================
    // CubVault Web Frontend
    // Domain: cubvault.cubsoftware.site
    // DISABLED: Missing source code (desktop/ folder)
    // ============================================
    // {
    //   name: 'cubvault-web',
    //   cwd: './apps/cubvault',
    //   script: 'npx',
    //   args: 'serve -s dist/web -l 3002',
    //   interpreter: 'none',
    //   instances: 1,
    //   autorestart: true,
    //   watch: false,
    //   max_memory_restart: '256M',
    //   env: {
    //     PORT: 3002,
    //     NODE_ENV: 'production'
    //   },
    //   error_file: './logs/cubvault-web/error.log',
    //   out_file: './logs/cubvault-web/out.log',
    //   time: true,
    //   merge_logs: true
    // },

    // ============================================
    // QuestCord (Discord Bot + Web Dashboard)
    // Domain: questcord.fun
    // ============================================
    {
      name: 'questcord',
      cwd: './apps/questcord',
      script: './start.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '2048M',
      node_args: [
        '--max-old-space-size=2048',
        '--optimize-for-size',
        '--gc-interval=100'
      ],
      env: {
        PORT: 3003,
        NODE_ENV: 'production',
        UV_THREADPOOL_SIZE: 128
      },
      error_file: './logs/questcord/error.log',
      out_file: './logs/questcord/out.log',
      time: true,
      merge_logs: true,
      cron_restart: '0 3 * * *',
      wait_ready: true,
      kill_timeout: 5000
    },

    // ============================================
    // The Onion Bot (Discord Bot)
    // ============================================
    {
      name: 'onion-bot',
      cwd: '../The Onion Bot',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production'
      },
      error_file: './logs/onion-bot/error.log',
      out_file: './logs/onion-bot/out.log',
      time: true,
      merge_logs: true
    }
  ]
};
