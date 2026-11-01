# Gamenight

Punktezähler für Spieleabende – aktuell Scheisse, Wizard und Kniffel, mit konfigurierbaren Regelwerken (siehe `docs/spec-games.md`): Spiel am Handy führen, live zuschauen, Bestenliste und Statistiken. Eigenes Backend (Express + PostgreSQL), keine externen Dienste.

## Schnellstart

Voraussetzungen: Node 22, Docker Desktop.

```bash
npm install
cp .env.example .env        # JWT_SECRET für Produktion setzen
docker compose up -d        # Postgres 18 (localhost:5433) + pgAdmin (localhost:5050)
npm run db:migrate
npm run dev                 # Server :3001, Web http://localhost:5173
```

## Dienste

| Dienst | URL | Zugang |
|---|---|---|
| Web-App | http://localhost:5173 | – |
| API | http://localhost:3001/api/health | – |
| PostgreSQL 18 | localhost:5433 | DB `scheisse` (Tests: `scheisse_test`), User/Passwort `scheisse` |
| pgAdmin | http://localhost:5050 | kein Login (lokaler Desktop-Modus); Server „Scheisse (lokal)“ ist vorkonfiguriert |

## Befehle

```bash
npm test          # Engine-, Server- (gegen scheisse_test) und Web-Tests
npm run typecheck
npm run build
```

## Aufbau

- `packages/shared` – Spiele & Regelwerke, Spieltyp-Engines (Stichansage, Punkteblock), API-Vertrag (zod), Statistik-Formeln
- `apps/server` – Express, Drizzle/Postgres, Auth (Benutzername + Passwort, JWT-Cookie), Matches mit Write-Token, SSE-Livestreams, Statistik
- `apps/web` – Vite + React, Zustand, React Query
- `docs/` – Specs und Architektur

## Produktion mit Docker

Images liegen in EINEM Docker-Hub-Repo (Free-Plan = 1 privates Repo), unterschieden per Tag-Praefix:
`olafimus/olivers-master-repo:gamenight-server-<TAG>` und `...:gamenight-web-<TAG>`. Mit `IMAGE_REPO` ueberschreibbar
(z.B. `IMAGE_REPO=192.168.1.10:5000/gamenight` fuer die LAN-Registry, siehe `docker/registry/README.md`).

```bash
# Bauen (lokal), optional mit Push; --multiarch = amd64+arm64 (Push noetig), z.B. fuer Raspberry Pi/NAS
scripts/docker-build.sh --tag 1.0.0            # PowerShell: scripts/docker-build.ps1 -Tag 1.0.0
scripts/docker-build.sh --tag 1.0.0 --push     # pusht :...-1.0.0 und :...-latest (vorher: docker login)

# Konfiguration und Start (Zielserver)
cp .env.prod.example .env.prod                 # JWT_SECRET und POSTGRES_PASSWORD setzen
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d
# App: http://<host>:8080   (WEB_PORT); pgAdmin optional: --profile tools (nur 127.0.0.1:5050)

# Update (Images aus der Registry holen; Migrationen laufen beim Start des Servers automatisch)
docker compose -f docker-compose.prod.yml --env-file .env.prod pull
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# Backup / Restore
docker compose -f docker-compose.prod.yml exec -T db pg_dump -U scheisse scheisse > backup-$(date +%F).sql
docker compose -f docker-compose.prod.yml exec -T db psql -U scheisse scheisse < backup.sql
```

Registry-Optionen:
- Docker Hub: `docker login`, dann `scripts/docker-build.sh --tag X --push` bzw. manuell `docker push olafimus/olivers-master-repo:gamenight-web-X`.
  Das Repo auf Docker Hub als privat anlegen; der Zielserver braucht dann ebenfalls `docker login` zum `pull`.
- LAN-Registry: `docker compose -f docker/registry/docker-compose.yml up -d`, auf allen Clients `insecure-registries` setzen (oder TLS), `IMAGE_REPO=<ip>:5000/gamenight`.
