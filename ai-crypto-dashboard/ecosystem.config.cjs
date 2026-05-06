module.exports = {
	apps: [
		{
			name: 'crypto-dashboard',
			cwd: '/opt/crypto-dashboard',
			script: 'npm',
			args: 'run start',
			instances: 1,
			exec_mode: 'fork',
			autorestart: true,
			max_restarts: 10,
			restart_delay: 3000,
			env: {
				NODE_ENV: 'production',
				PORT: 4173,
				HOST: '127.0.0.1'
			}
		}
	]
};
