# Production deployment

The production Compose file is a single-host deployment baseline. Caddy is
the only service publishing host ports; it obtains and renews HTTPS
certificates for the configured DNS name. Django and MediaMTX ports are not
published on the host. This does not configure the host firewall or provide a
WAF/DDoS service by itself.

## Before starting

1. Use a supported Linux host with Docker Engine and the Compose plugin. Point
   the chosen public DNS name at that host and allow inbound TCP 80/443 (and
   UDP 443 if HTTP/3 is desired) in the cloud firewall/security group.
2. Configure the host firewall from its console or an existing trusted
   session. Before enabling a default-deny policy, confirm the SSH port and
   allow SSH from your trusted administrative IP/network. Then allow only SSH,
   TCP 80/443, and optionally UDP 443. Do not expose 8000, 3000, 8554, 8888,
   8889, or 9997 to the public internet. Keep camera ingest on a private/VPN
   network and restrict it to known camera sources.
3. For Ubuntu with UFW, inspect `sudo ufw status verbose` and the active SSH
   port first. Add an SSH allow rule (preferably restricted to your trusted
   source CIDR), then add `sudo ufw allow 80/tcp`, `sudo ufw allow 443/tcp`,
   and optionally `sudo ufw allow 443/udp`. Review the rules before enabling
   UFW; never enable it until the SSH allow rule is verified.
4. Put a managed WAF/DDoS service in front of the host if the deployment
   requires one. Caddy's reverse proxy and headers are not a WAF and do not
   provide bot detection or application-specific rate limiting.

## Configure and launch

```sh
cp deploy/.env.example deploy/.env
cp backend/.env.example backend/.env
```

Set `SENTRIX_DOMAIN` in `deploy/.env`. In `backend/.env`, generate a unique
`DJANGO_SECRET_KEY`, set `DJANGO_DEBUG=false`, and configure the production
domain for `DJANGO_ALLOWED_HOSTS`, `DJANGO_CSRF_TRUSTED_ORIGINS`,
`CORS_ALLOWED_ORIGINS`, `WEBAUTHN_RP_ID`, and `WEBAUTHN_ORIGIN`. Configure
approved SMS/identity-provider credentials and other required integrations
using a secret manager where available. Keep demo users, demo OTP, and demo
data disabled. Replace `POSTGRES_PASSWORD` in `deploy/.env` with a unique
random secret (for example, generate one with `openssl rand -hex 32`). Never
commit either `.env` file or use the example database password.

If you need to carry existing operational records into production, the local
`backend/.localdata/api_state.json` is excluded from Git and the container
image. Transfer it to the production host over a protected channel, keep it
outside the repository, then migrate and import it before starting the app:

```sh
docker compose --env-file deploy/.env -f docker-compose.production.yml up -d database cache
docker compose --env-file deploy/.env -f docker-compose.production.yml run --build --rm backend python manage.py migrate --noinput
docker compose --env-file deploy/.env -f docker-compose.production.yml run --rm -v /secure/transfer/api_state.json:/run/sentrix-state.json:ro backend python manage.py import_local_state /run/sentrix-state.json
```

The import refuses to overwrite an existing state document unless `--replace`
is explicitly supplied. Back up the target database first before using that
option. The export can include password hashes, camera credentials, and
personal information; delete the temporary transfer copy after verifying the
import and retain backups only under the organization's data policy.

After DNS and firewall rules are ready:

```sh
docker compose --env-file deploy/.env -f docker-compose.production.yml config
docker compose --env-file deploy/.env -f docker-compose.production.yml up --build -d
docker compose --env-file deploy/.env -f docker-compose.production.yml logs -f edge backend
```

Caddy must be able to reach the domain on ports 80 and 443 to provision a
certificate. Back up PostgreSQL with `pg_dump` (a live copy of its volume is
not a consistent backup), and back up the `backend_data`, `caddy_data`, and
`caddy_config` volumes. Practice restoring both the database dump and volumes
before relying on the service.

## Current boundaries

This stack is not a declaration that every production requirement is done.
Production API state now bootstraps into PostgreSQL as one JSONB document; the
old JSON file is used only to seed a new database. Geospatial records are also
projected into a PostGIS table with a GiST geometry index; the map requests
viewport-bounded features, and administrators can import validated GeoJSON
Point/LineString FeatureCollections. The canonical records still live inside
the JSONB state document, so record-level ownership/history/approval,
CSV/KML import, routing/forecast analytics, and multi-instance-safe state
operations remain future work. Managed backups and restore drills are also
required.
The backend is deliberately configured for one synchronous Gunicorn worker
until the state document is normalized for concurrent operations. Login
attempts are throttled per operator ID in the private Redis cache in production
(local development uses Django's in-memory cache); cache loss resets the
counters. This limits repeated credential guesses, not distributed attacks or
DDoS. Caddy now checks a short-lived HttpOnly
operator-session cookie for proxied HLS playlists and segments, but this flow
still needs end-to-end verification with the production Caddy/MediaMTX images
and browsers (including native HLS); the live PostGIS database path also has
not been exercised in this environment because Docker is unavailable. Caddy
alone is not a WAF. AI model accuracy, real camera connectivity, external SMS
delivery, and identity-provider configuration must be validated in the target
environment.
