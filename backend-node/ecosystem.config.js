module.exports = {
  apps: [{
    name: 'almoxarifado-api',
    cwd: '/home/ec2-user/backend-mp',
    script: './index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    restart_delay: 3000,
    max_memory_restart: '500M',
    time: true,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
