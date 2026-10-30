# CADENCE pilot server: one gym on its own address

One small Linux server runs the whole gym: the API, the web app (members install it from the
browser as an app), and Caddy for HTTPS. About an hour the first time.

## What you need
1. **A domain you own**, for an address like `gym.yourdomain.com`. Passkeys (fingerprint or face
   sign-in) only work on HTTPS at a fixed address.
2. **A Linux server**: Ubuntu 24.04, **2 GB RAM** (the first build needs it), 25 GB disk, in India
   for speed (for example DigitalOcean Bangalore or AWS Lightsail Mumbai, roughly US$10–12 a
   month; check the current price).
3. Ports **22** (SSH), **80** and **443** open on the server's firewall.

## Set it up (about 1 hour)
1. **Point the address at the server.** At your domain's DNS, add an `A` record: name `gym`,
   value the server's IP. Wait until `ping gym.yourdomain.com` shows that IP (minutes to an hour).
2. **Install Docker.** SSH in, then:
   ```sh
   curl -fsSL https://get.docker.com | sh
   ```
3. **Get CADENCE.**
   ```sh
   git clone https://github.com/kundankishore8929-gif/CADENCE /opt/cadence
   cd /opt/cadence/deploy/pilot
   cp env.example .env
   nano .env        # set DOMAIN, RP_ID, ORIGIN to gym.yourdomain.com; RP_NAME to the gym's name
   ```
4. **Start it.** The first build takes about 10 minutes.
   ```sh
   docker compose up -d --build
   ```
5. **Create the owner profile first.** Open `https://gym.yourdomain.com` and create your profile:
   the first one becomes the owner (`FIRST_USER_ADMIN=1`). Only then share the address.
6. **Nightly backups.** `crontab -e`, add:
   ```
   30 2 * * * sh /opt/cadence/deploy/pilot/backup.sh >> /opt/cadence/deploy/pilot/backup.log 2>&1
   ```
   Once a week, download the newest file from `backups/` to your own computer as well: a copy on
   the same server is lost with the server.

Then follow `docs/cadence/OWNER.md`: the gym's name and logo, trainers, the desk screen.

## Every day
- **Update** to the newest code on GitHub:
  ```sh
  cd /opt/cadence && git pull && cd deploy/pilot && docker compose up -d --build
  ```
- **Is it running?** `docker compose ps` (three services, all "running").
- **Logs** when something is wrong: `docker compose logs --tail 100 api`.
- **Restore** a backup: `docker compose down`, move the current data aside
  (`mv data data-before-restore`), unpack the backup here (`tar -xzf backups/<file>`, which brings
  `data/` back), then `docker compose up -d`.

## What stays where
- `data/`: every account, workout, PT package, check-in, diet chart and note. Never commit it,
  never share it. `backup.sh` copies it.
- `caddy-data/`: the HTTPS certificate. Caddy renews it by itself.
- `.env`: the address settings. Not secret, but specific to this gym.

## Why a third container (Caddy)
It gets and renews the HTTPS certificate, and it passes each member's own internet address on to
the API (`X-Real-IP`, see `docker-compose.yml`). Without that, every member would look like one
address, and one person's wrong sign-ins could make the sign-in limits block the whole gym.
