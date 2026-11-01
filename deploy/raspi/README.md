# Scheisse auf dem Raspberry Pi

Voraussetzungen: Raspberry Pi 4/5 (mind. 2 GB RAM empfohlen) mit **Raspberry Pi OS 64-bit**, Docker + Compose-Plugin
(`curl -fsSL https://get.docker.com | sh`, danach `sudo usermod -aG docker $USER` und neu einloggen).

## Installation

```bash
mkdir -p ~/scheisse && cd ~/scheisse
# docker-compose.yml und .env.example aus deploy/raspi/ hierher kopieren (z.B. per scp)
cp .env.example .env
nano .env                      # JWT_SECRET (openssl rand -hex 32) und POSTGRES_PASSWORD setzen
docker login -u olafimus       # Repo ist privat: als Passwort einen Personal Access Token eingeben (siehe unten)
docker compose pull
docker compose up -d
```

App: `http://<ip-des-pi>:8080` – Migrationen laufen beim Serverstart automatisch.
pgAdmin (optional): `PGADMIN_PASSWORD` in `.env` setzen, dann `docker compose --profile tools up -d` → `http://<ip-des-pi>:5050`
(Login mit `PGADMIN_EMAIL`/`PGADMIN_PASSWORD`, Server „Scheisse“ ist vorkonfiguriert).

## Update

```bash
# neue Version: TAG in .env anpassen (z.B. 1.1.0) oder TAG=latest verwenden
docker compose pull && docker compose up -d
docker image prune -f
```

## Backup / Restore

```bash
docker compose exec -T db pg_dump -U scheisse scheisse | gzip > backup-$(date +%F).sql.gz
gunzip -c backup-2026-10-30.sql.gz | docker compose exec -T db psql -U scheisse scheisse
```

## Docker-Login mit Token (z. B. bei Google-Anmeldung)

Bei Anmeldung über Google/GitHub hat das Docker-Konto kein eigenes Passwort – stattdessen einen
**Personal Access Token** verwenden: https://app.docker.com/settings/personal-access-tokens →
„Generate new token“, Rechte **Read-only** (reicht zum Pullen), Token `dckr_pat_…` kopieren (wird nur einmal angezeigt).

```bash
docker login -u olafimus                                   # Passwort = Token
echo "dckr_pat_xxx" | docker login -u olafimus --password-stdin   # nicht-interaktiv
```

Pro Gerät einen eigenen Token anlegen – dann lässt er sich einzeln widerrufen.

## Hinweise
- Als App installieren (PWA) und Offline-Betrieb benötigen im Browser **HTTPS** (außer auf `localhost`). Im LAN über http läuft die App normal, nur die Installation/Service-Worker fehlen. Für HTTPS z.B. Caddy/Traefik/Nginx Proxy Manager vor Port 8080 setzen.
- Logs: `docker compose logs -f server`
