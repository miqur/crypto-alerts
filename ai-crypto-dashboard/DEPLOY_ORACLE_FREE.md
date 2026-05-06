# Deploy to Oracle Cloud Free (Ubuntu)

This guide deploys the app as a 24/7 process with PM2 and Nginx.

## 1) Create VM

- Oracle Cloud -> Compute -> Create Instance
- Image: Ubuntu 22.04
- Shape: Always Free
- Open inbound ports in Security List: `22`, `80`, `443`

## 2) Connect and install base packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

## 3) Clone project

```bash
cd /opt
sudo git clone <YOUR_GITHUB_REPO_URL> crypto-dashboard
sudo chown -R $USER:$USER /opt/crypto-dashboard
cd /opt/crypto-dashboard
```

## 4) Configure env

Create production `.env`:

```bash
cp .env.example .env 2>/dev/null || true
nano .env
```

Required values:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID` (optional for command replies, still useful for scheduler)
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `ALERT_INTERVAL`
- `ALERT_TEST_MODE`

## 5) Build and start app

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

Follow the printed `pm2 startup` command once, then:

```bash
pm2 status
pm2 logs crypto-dashboard
```

## 6) Configure Nginx reverse proxy

Create config:

```bash
sudo nano /etc/nginx/sites-available/crypto-dashboard
```

Paste:

```nginx
server {
    listen 80;
    server_name <YOUR_DOMAIN>;

    location / {
        proxy_pass http://127.0.0.1:4173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable and reload:

```bash
sudo ln -s /etc/nginx/sites-available/crypto-dashboard /etc/nginx/sites-enabled/crypto-dashboard
sudo nginx -t
sudo systemctl reload nginx
```

## 7) Enable HTTPS (Let's Encrypt)

```bash
sudo certbot --nginx -d <YOUR_DOMAIN>
```

## 8) Telegram mode choices

### Long polling (already implemented)

- Works immediately after deploy.
- No webhook setup required.

### Webhook mode (optional)

Use:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://<YOUR_DOMAIN>/api/telegram/webhook"}'
```

If you stay on polling, disable webhook:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/deleteWebhook"
```

## 9) Update flow

```bash
cd /opt/crypto-dashboard
git pull
npm ci
npm run build
pm2 restart crypto-dashboard
pm2 logs crypto-dashboard
```
