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
data disabled. Never commit either `.env` file.

After DNS and firewall rules are ready:

```sh
docker compose --env-file deploy/.env -f docker-compose.production.yml config
docker compose --env-file deploy/.env -f docker-compose.production.yml up --build -d
docker compose --env-file deploy/.env -f docker-compose.production.yml logs -f edge backend
```

Caddy must be able to reach the domain on ports 80 and 443 to provision a
certificate. Back up the `backend_data`, `caddy_data`, and `caddy_config`
volumes, and practice restoring them before relying on the service.

## Current boundaries

This stack is not a declaration that every production requirement is done.
Application state and Django auth currently use local JSON/SQLite storage;
the volume makes that data persistent but is not a substitute for the planned
PostgreSQL/PostGIS migration, managed backups, or multi-instance operation.
The backend is deliberately configured for one synchronous Gunicorn worker
until state storage is made safe for concurrent workers. The media proxy
routes are reachable through the public HTTPS origin and do not yet enforce
the Sentrix operator session; do not use this deployment with sensitive camera
feeds until relay authorization is added. Caddy alone is not a WAF. AI model
accuracy, real camera connectivity, external SMS delivery, and identity-provider
configuration must be validated in the target environment.
