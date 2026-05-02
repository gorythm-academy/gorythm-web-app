/**
 * PM2 process file for the Express API on a VPS (e.g. Hostinger).
 *
 * 1. Copy repo to the server (git clone).
 * 2. Create backend/.env (see backend/.env.example).
 * 3. Edit `cwd` below to the real path of your backend folder.
 * 4. Run: npm ci --omit=dev   (inside backend/)
 * 5. Run: pm2 start deploy/ecosystem.config.cjs
 * 6. Run: pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'gorythm-api',
      cwd: '/var/www/gorythm/backend',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
