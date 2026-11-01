# LAN-Registry

Start: `docker compose -f docker/registry/docker-compose.yml up -d` (Registry :5000, UI http://localhost:5001).
Die UI-CORS-Origin in der Compose-Datei bei Zugriff von anderen Rechnern anpassen (`http://<server-ip>:5001`).

## Ohne TLS (LAN): insecure-registries
Auf JEDEM Client (Build-Rechner und Zielserver) eintragen:
- Linux: `/etc/docker/daemon.json` mit `{ "insecure-registries": ["192.168.1.10:5000"] }`, dann `sudo systemctl restart docker`
- Docker Desktop: Settings, Docker Engine, dasselbe JSON-Feld ergaenzen, "Apply & restart"

## Mit TLS
Zertifikat/Key mounten und in der Registry setzen: `REGISTRY_HTTP_TLS_CERTIFICATE=/certs/domain.crt`, `REGISTRY_HTTP_TLS_KEY=/certs/domain.key`
(oder Reverse-Proxy mit Zertifikat davor). Bei selbstsigniertem Zertifikat die CA unter `/etc/docker/certs.d/<host>:5000/ca.crt` ablegen.
