#!/usr/bin/env bash
# Renew Let's Encrypt certificate and reload nginx.
# Add to host cron: 0 3 * * * /path/to/scripts/certbot-renew.sh >> /var/log/certbot-renew.log 2>&1
set -euo pipefail

COMPOSE="docker compose -f $(dirname "$0")/../docker-compose-production.yml"

echo "[$(date)] Attempting certificate renewal..."

$COMPOSE run --rm certbot renew --quiet

echo "[$(date)] Reloading nginx..."
$COMPOSE exec nginx nginx -s reload

echo "[$(date)] Done."
