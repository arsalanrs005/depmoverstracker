# Deploy Call Tracker on Hetzner

This guide assumes Jason shared a **Hetzner Cloud** login. You do not need prior Hetzner experience — follow in order.

## What you are deploying

- **Next.js app** (`call-tracker`) on a small Linux VM
- **Postgres** stays on Supabase (recommended) — only the app runs on Hetzner
- **Cron**: 8x8 CDR sync every 5 minutes via system cron (replaces Vercel cron)

---

## 1. Create the server (Hetzner Console)

1. Log in at [console.hetzner.cloud](https://console.hetzner.cloud)
2. **Projects** → open Jason’s project (or create one)
3. **Add Server**
   - Location: US (Ashburn or Hillsboro) — closest to your team
   - Image: **Ubuntu 24.04**
   - Type: **CX22** (2 vCPU, 4 GB RAM) — enough for this app
   - SSH key: add your public key (`~/.ssh/id_ed25519.pub`) or use root password (less secure)
4. Note the **public IPv4** (e.g. `95.xxx.xxx.xxx`)

---

## 2. DNS (optional but recommended)

Point a subdomain to the server:

| Type | Name | Value |
|------|------|--------|
| A | `tracker` | `<server IPv4>` |

Example: `tracker.dependablemovers.com` → your Hetzner IP.

---

## 3. SSH into the server

```bash
ssh root@95.xxx.xxx.xxx
```

First-time setup:

```bash
apt update && apt upgrade -y
apt install -y git nginx certbot python3-certbot-nginx build-essential
```

Install **Node 20**:

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v   # should be v20.x
```

Install **PM2** (keeps Next.js running after logout):

```bash
npm install -g pm2
```

---

## 4. Clone the app

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/arsalanrs005/depmoverstracker.git call-tracker
cd call-tracker
npm ci
```

---

## 5. Environment variables

```bash
cp .env.example .env.local
nano .env.local
```

Minimum for production:

```env
DATABASE_URL=postgresql://...supabase...
X8X_WORK_API_KEY=...
X8X_WORK_USERNAME=...
X8X_WORK_PASSWORD=...
CRON_SECRET=<long random string>
ALOWARE_WEBHOOK_SECRET=<from Aloware webhook setup>
```

Build and test:

```bash
npm run db:push    # applies schema + migrations (004 quote details)
npm run build
npm run start      # Ctrl+C after verifying port 3000
```

---

## 6. Run with PM2

```bash
cd /var/www/call-tracker
pm2 start npm --name call-tracker -- start
pm2 save
pm2 startup          # run the command it prints so app survives reboot
```

Check: `curl http://127.0.0.1:3000/api/health`

---

## 7. Nginx reverse proxy

```bash
nano /etc/nginx/sites-available/call-tracker
```

```nginx
server {
    listen 80;
    server_name tracker.dependablemovers.com;   # your domain

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/call-tracker /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

HTTPS:

```bash
certbot --nginx -d tracker.dependablemovers.com
```

---

## 8. Cron — 8x8 sync every 5 minutes

```bash
crontab -e
```

Add:

```cron
*/5 * * * * curl -sf -H "Authorization: Bearer YOUR_CRON_SECRET" https://tracker.dependablemovers.com/api/cron/sync-8x8-analytics >/dev/null 2>&1
```

Use the same `CRON_SECRET` as in `.env.local`.

---

## 9. Webhooks (Aloware / Retell)

Point external webhooks to Hetzner URLs:

| Service | URL |
|---------|-----|
| Aloware Call Disposed | `https://tracker.dependablemovers.com/api/webhooks/aloware?token=ALOWARE_WEBHOOK_SECRET` |
| Retell | `https://tracker.dependablemovers.com/api/webhooks/retell` |

---

## 10. Deploy updates

```bash
cd /var/www/call-tracker
git pull
npm ci
npm run db:push    # when migrations change
npm run build
pm2 restart call-tracker
```

---

## Local-only: CDR import

The **Import CDR** page was removed from the UI. For one-time backfill on your laptop:

```bash
cd call-tracker
npm run import:cdr -- path/to/export.csv
```

The API route `/api/imports/8x8-cdr` remains for scripts/n8n if needed.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| 502 Bad Gateway | `pm2 status` — restart if stopped |
| DB errors | Check `DATABASE_URL`; Supabase must allow Hetzner IP (or use “allow all” for dev) |
| Webhook 401 | Match `ALOWARE_WEBHOOK_SECRET` / query token |
| Stale build | `rm -rf .next && npm run build && pm2 restart call-tracker` |

---

## Cost ballpark

- **CX22**: ~€5–6/month
- **Supabase**: free tier or existing plan
- **Domain**: existing DNS only

No Vercel needed once Hetzner + cron are live.
